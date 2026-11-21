import { appendFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join, relative, sep } from "node:path"
import { FileExistsError, type FileInfo, type VaultFs } from "./fs.js"

/** Ignored while scanning, in addition to dot-folders. */
const IGNORED_DIRS = new Set(["node_modules"])

/** `VaultFs` backed by the local file system, rooted at `root`. */
export class NodeFs implements VaultFs {
  constructor(readonly root: string) {}

  private abs(path: string): string {
    const full = join(this.root, ...path.split("/"))
    const rel = relative(this.root, full)
    if (rel === "" || rel.startsWith("..") || rel.split(sep).includes("..")) {
      throw new Error(`Path escapes the vault: ${path}`)
    }
    return full
  }

  async read(path: string): Promise<string | null> {
    try {
      return await readFile(this.abs(path), "utf8")
    } catch (error) {
      if (errorCode(error) === "ENOENT") return null
      throw error
    }
  }

  async create(path: string, content: string): Promise<void> {
    const full = this.abs(path)
    await mkdir(dirname(full), { recursive: true })
    try {
      await writeFile(full, content, { encoding: "utf8", flag: "wx" })
    } catch (error) {
      if (errorCode(error) === "EEXIST") throw new FileExistsError(path)
      throw error
    }
  }

  async update(path: string, fn: (current: string) => string): Promise<void> {
    const current = await this.read(path)
    if (current === null) throw new Error(`No such file: ${path}`)
    await writeFile(this.abs(path), fn(current), "utf8")
  }

  async write(path: string, content: string): Promise<void> {
    const full = this.abs(path)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, content, "utf8")
  }

  async append(path: string, content: string): Promise<void> {
    const full = this.abs(path)
    await mkdir(dirname(full), { recursive: true })
    await appendFile(full, content, "utf8")
  }

  async mtime(path: string): Promise<number | null> {
    try {
      return (await stat(this.abs(path))).mtimeMs
    } catch (error) {
      if (errorCode(error) === "ENOENT") return null
      throw error
    }
  }

  async rename(from: string, to: string): Promise<void> {
    const target = this.abs(to)
    if ((await this.mtime(to)) !== null) throw new FileExistsError(to)
    await mkdir(dirname(target), { recursive: true })
    await rename(this.abs(from), target)
  }

  async remove(path: string): Promise<void> {
    await rm(this.abs(path), { force: true })
  }

  async listMarkdown(): Promise<FileInfo[]> {
    const out: FileInfo[] = []
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true })
      await Promise.all(
        entries.map(async (entry) => {
          if (entry.name.startsWith(".")) return
          const full = join(dir, entry.name)
          if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(entry.name)) await walk(full)
          } else if (entry.isFile() && entry.name.endsWith(".md")) {
            const { mtimeMs } = await stat(full)
            out.push({ path: relative(this.root, full).split(sep).join("/"), mtime: mtimeMs })
          }
        }),
      )
    }
    await walk(this.root)
    return out.sort((a, b) => a.path.localeCompare(b.path))
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code
}
