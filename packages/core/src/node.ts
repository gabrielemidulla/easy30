import { appendFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join, relative, sep } from "node:path"
import type { VaultFs } from "./fs.js"

/** Ignored while scanning, in addition to dot-folders. */
const IGNORED_DIRS = new Set(["node_modules"])

/** `VaultFs` backed by the local file system, rooted at `root`. */
export class NodeFs implements VaultFs {
  constructor(readonly root: string) {}

  private abs(path: string): string {
    const full = join(this.root, ...path.split("/"))
    const rel = relative(this.root, full)
    if (rel.startsWith("..") || rel.split(sep).includes("..")) {
      throw new Error(`Path escapes the vault: ${path}`)
    }
    return full
  }

  async read(path: string): Promise<string | null> {
    try {
      return await readFile(this.abs(path), "utf8")
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
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

  async exists(path: string): Promise<boolean> {
    try {
      await stat(this.abs(path))
      return true
    } catch (error) {
      if (isNotFound(error)) return false
      throw error
    }
  }

  async rename(from: string, to: string): Promise<void> {
    const target = this.abs(to)
    if (await this.exists(to)) throw new Error(`File exists: ${to}`)
    await mkdir(dirname(target), { recursive: true })
    await rename(this.abs(from), target)
  }

  async remove(path: string): Promise<void> {
    await rm(this.abs(path), { force: true })
  }

  async listMarkdown(): Promise<string[]> {
    const out: string[] = []
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name)) await walk(full)
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          out.push(relative(this.root, full).split(sep).join("/"))
        }
      }
    }
    await walk(this.root)
    return out.sort()
  }
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT"
}
