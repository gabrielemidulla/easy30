import type { Dirent } from "node:fs"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

async function listFiles(root: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string): Promise<void> => {
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw error
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) out.push(full.slice(root.length + 1))
    }
  }
  await walk(root)
  return out.sort()
}

async function readOrNull(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

/**
 * Make `to` an exact copy of `from`: write changed files, delete extra ones.
 * Returns what happened so callers can report "created" / "updated" / "kept".
 */
export async function syncTree(from: string, to: string): Promise<"created" | "updated" | "kept"> {
  const source = await listFiles(from)
  const existing = await listFiles(to)
  let changed = false
  for (const rel of source) {
    const data = await readFile(join(from, rel))
    const current = await readOrNull(join(to, rel))
    if (current?.equals(data)) continue
    await mkdir(dirname(join(to, rel)), { recursive: true })
    await writeFile(join(to, rel), data)
    changed = true
  }
  const wanted = new Set(source)
  for (const rel of existing) {
    if (wanted.has(rel)) continue
    await rm(join(to, rel), { force: true })
    changed = true
  }
  if (existing.length === 0) return "created"
  return changed ? "updated" : "kept"
}
