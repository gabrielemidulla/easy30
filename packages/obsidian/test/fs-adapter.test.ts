import { FileExistsError } from "@easy30/core"
import { describe, expect, it } from "vitest"
import { type FsHost, normalizeVaultPath, ObsidianFs } from "../src/fs-adapter"

interface FakeFile {
  path: string
  extension: string
  content: string
  stat: { mtime: number }
}

/** In-memory stand-in for the parts of Obsidian's `App` the adapter touches. */
function fakeApp() {
  const files = new Map<string, FakeFile>()
  const folders = new Set<string>()
  const hidden = new Map<string, string>()
  const calls: string[] = []
  const times = new Map<string, number>()
  let clock = 0
  const entry = (path: string) => files.get(path) ?? (folders.has(path) ? { path } : null)

  const host = {
    vault: {
      getMarkdownFiles: () => [...files.values()],
      getAbstractFileByPath: (path: string) => entry(path),
      read: async (f: FakeFile) => f.content,
      process: async (f: FakeFile, fn: (c: string) => string) => {
        calls.push(`process ${f.path}`)
        f.content = fn(f.content)
        return f.content
      },
      create: async (path: string, content: string) => {
        calls.push(`create ${path}`)
        const file = { path, extension: "md", content, stat: { mtime: ++clock } }
        files.set(path, file)
        return file
      },
      modify: async (f: FakeFile, content: string) => {
        calls.push(`modify ${f.path}`)
        f.content = content
      },
      append: async (f: FakeFile, content: string) => {
        f.content += content
      },
      createFolder: async (path: string) => {
        calls.push(`mkdir ${path}`)
        folders.add(path)
        return { path }
      },
      adapter: {
        read: async (p: string) => hidden.get(p) ?? "",
        write: async (p: string, c: string) => void hidden.set(p, c),
        append: async (p: string, c: string) => void hidden.set(p, (hidden.get(p) ?? "") + c),
        stat: async (p: string) => (hidden.has(p) ? { mtime: times.get(p) ?? 7 } : null),
        exists: async (p: string) => hidden.has(p) || folders.has(`adapter:${p}`),
        mkdir: async (p: string) => void folders.add(`adapter:${p}`),
        remove: async (p: string) => void hidden.delete(p),
        rename: async (a: string, b: string) => {
          hidden.set(b, hidden.get(a) ?? "")
          hidden.delete(a)
        },
      },
    },
    fileManager: {
      renameFile: async (f: FakeFile, to: string) => {
        calls.push(`rename ${f.path} -> ${to}`)
        files.delete(f.path)
        f.path = to
        files.set(to, f)
      },
      trashFile: async (f: FakeFile) => {
        calls.push(`trash ${f.path}`)
        files.delete(f.path)
      },
    },
  }
  return { fs: new ObsidianFs(host as unknown as FsHost), files, folders, hidden, calls }
}

describe("normalizeVaultPath", () => {
  it("collapses slashes, trims, and converts backslashes", () => {
    expect(normalizeVaultPath("/a//b\\c/")).toBe("a/b/c")
    expect(normalizeVaultPath("a b.md")).toBe("a b.md")
  })
})

describe("ObsidianFs", () => {
  it("creates notes, making parent folders first, then modifies in place", async () => {
    const { fs, files, calls } = fakeApp()
    await fs.write("Uni/Geo/Note.md", "one")
    expect(calls).toEqual(["mkdir Uni", "mkdir Uni/Geo", "create Uni/Geo/Note.md"])
    await fs.write("Uni/Geo/Note.md", "two")
    expect(calls.at(-1)).toBe("modify Uni/Geo/Note.md")
    expect(files.get("Uni/Geo/Note.md")?.content).toBe("two")
    expect(await fs.read("Uni/Geo/Note.md")).toBe("two")
    expect(await fs.read("Uni/Missing.md")).toBeNull()
    expect(await fs.mtime("Uni/Geo/Note.md")).not.toBeNull()
    expect(await fs.mtime("Uni/Missing.md")).toBeNull()
  })

  it("lists only visible markdown files, sorted", async () => {
    const { fs, files } = fakeApp()
    for (const path of ["b.md", "a.md", ".hidden/x.md", "dir/.obsidian/y.md"]) {
      files.set(path, { path, extension: "md", content: "", stat: { mtime: 5 } })
    }
    expect(await fs.listMarkdown()).toEqual([
      { path: "a.md", mtime: 5 },
      { path: "b.md", mtime: 5 },
    ])
  })

  it("keeps .easy30 state out of the vault index and appends to it", async () => {
    const { fs, files, hidden, folders } = fakeApp()
    await fs.append(".easy30/log/geo.jsonl", '{"a":1}\n')
    await fs.append(".easy30/log/geo.jsonl", '{"b":2}\n')
    expect(hidden.get(".easy30/log/geo.jsonl")).toBe('{"a":1}\n{"b":2}\n')
    expect(files.size).toBe(0)
    expect(folders.has("adapter:.easy30")).toBe(true)
    expect(folders.has("adapter:.easy30/log")).toBe(true)
    expect(await fs.read(".easy30/log/geo.jsonl")).toBe('{"a":1}\n{"b":2}\n')
    expect(await fs.read(".easy30/log/none.jsonl")).toBeNull()
  })

  it("renames through the file manager and refuses to overwrite", async () => {
    const { fs, calls } = fakeApp()
    await fs.write("a/One.md", "x")
    await fs.write("a/Two.md", "y")
    await fs.rename("a/One.md", "b/Uno.md")
    expect(calls.at(-1)).toBe("rename a/One.md -> b/Uno.md")
    expect(await fs.read("b/Uno.md")).toBe("x")
    await expect(fs.rename("a/Two.md", "b/Uno.md")).rejects.toBeInstanceOf(FileExistsError)
    await expect(fs.rename("a/Nope.md", "b/Nope.md")).rejects.toThrow(/No such file/)
  })

  it("trashes notes and ignores missing ones", async () => {
    const { fs, calls } = fakeApp()
    await fs.write("a/One.md", "x")
    await fs.remove("a/One.md")
    await fs.remove("a/Never.md")
    expect(calls.filter((c) => c.startsWith("trash"))).toEqual(["trash a/One.md"])
    expect(await fs.read("a/One.md")).toBeNull()
  })

  it("create is exclusive for notes and hidden files", async () => {
    const { fs } = fakeApp()
    await fs.create("a/One.md", "x")
    await expect(fs.create("a/One.md", "y")).rejects.toBeInstanceOf(FileExistsError)
    expect(await fs.read("a/One.md")).toBe("x")
    await fs.create(".easy30/x.json", "1")
    await expect(fs.create(".easy30/x.json", "2")).rejects.toBeInstanceOf(FileExistsError)
  })

  it("updates notes via vault.process and hidden files via the adapter", async () => {
    const { fs, calls, hidden } = fakeApp()
    await fs.write("a/One.md", "x")
    await fs.update("a/One.md", (c) => `${c}!`)
    expect(calls.at(-1)).toBe("process a/One.md")
    expect(await fs.read("a/One.md")).toBe("x!")
    await fs.write(".easy30/s.json", "1")
    await fs.update(".easy30/s.json", (c) => `${c}2`)
    expect(hidden.get(".easy30/s.json")).toBe("12")
    await expect(fs.update("a/None.md", (c) => c)).rejects.toThrow(/No such file/)
    await expect(fs.update(".easy30/none", (c) => c)).rejects.toThrow(/No such file/)
  })

  it("reports the mtime of hidden files", async () => {
    const { fs } = fakeApp()
    await fs.write(".easy30/s.json", "1")
    expect(await fs.mtime(".easy30/s.json")).toBe(7)
    expect(await fs.mtime(".easy30/none")).toBeNull()
  })
})
