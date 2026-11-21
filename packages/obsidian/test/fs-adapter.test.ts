import { describe, expect, it } from "vitest"
import { type FsHost, normalizeVaultPath, ObsidianFs } from "../src/fs-adapter"

interface FakeFile {
  path: string
  extension: string
  content: string
}

/** In-memory stand-in for the parts of Obsidian's `App` the adapter touches. */
function fakeApp() {
  const files = new Map<string, FakeFile>()
  const folders = new Set<string>()
  const hidden = new Map<string, string>()
  const calls: string[] = []
  const entry = (path: string) => files.get(path) ?? (folders.has(path) ? { path } : null)

  const host = {
    vault: {
      getMarkdownFiles: () => [...files.values()],
      getAbstractFileByPath: (path: string) => entry(path),
      cachedRead: async (f: FakeFile) => f.content,
      create: async (path: string, content: string) => {
        calls.push(`create ${path}`)
        const file = { path, extension: "md", content }
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
    expect(await fs.exists("Uni/Geo/Note.md")).toBe(true)
  })

  it("lists only visible markdown files, sorted", async () => {
    const { fs, files } = fakeApp()
    for (const path of ["b.md", "a.md", ".hidden/x.md", "dir/.obsidian/y.md"]) {
      files.set(path, { path, extension: "md", content: "" })
    }
    expect(await fs.listMarkdown()).toEqual(["a.md", "b.md"])
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
    expect(await fs.exists("b/Uno.md")).toBe(true)
    await expect(fs.rename("a/Two.md", "b/Uno.md")).rejects.toThrow(/exists/)
    await expect(fs.rename("a/Nope.md", "b/Nope.md")).rejects.toThrow(/No such file/)
  })

  it("trashes notes and ignores missing ones", async () => {
    const { fs, calls } = fakeApp()
    await fs.write("a/One.md", "x")
    await fs.remove("a/One.md")
    await fs.remove("a/Never.md")
    expect(calls.filter((c) => c.startsWith("trash"))).toEqual(["trash a/One.md"])
    expect(await fs.exists("a/One.md")).toBe(false)
  })
})
