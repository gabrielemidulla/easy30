/**
 * Minimal file-system surface Easy30 needs. Paths are vault-relative and use `/`.
 * Implementations: `NodeFs` (`@easy30/core/node`), the Obsidian adapter in the
 * plugin, and `MemoryFs` for tests.
 */
export interface VaultFs {
  /** File contents, or `null` when the file does not exist. */
  read(path: string): Promise<string | null>
  /** Create a new file (and parent folders). Must fail with `FileExistsError` if it exists. */
  create(path: string, content: string): Promise<void>
  /** Read-modify-write of an existing file. Implementations should make this as atomic
   * as the platform allows (Obsidian: `vault.process`). Fails if the file is missing. */
  update(path: string, fn: (current: string) => string): Promise<void>
  /** Create or overwrite a file, creating parent folders as needed. */
  write(path: string, content: string): Promise<void>
  /** Append to a file, creating it (and parent folders) if missing. */
  append(path: string, content: string): Promise<void>
  /** Every Markdown file in the vault, excluding dot-folders, with its modification time. */
  listMarkdown(): Promise<FileInfo[]>
  /** Modification time in ms, or `null` when the file does not exist. */
  mtime(path: string): Promise<number | null>
  /** Move a file; fails with `FileExistsError` if `to` exists. */
  rename(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
}

export interface FileInfo {
  path: string
  mtime: number
}

export class FileExistsError extends Error {
  constructor(readonly path: string) {
    super(`${path} already exists`)
    this.name = "FileExistsError"
  }
}

export class MemoryFs implements VaultFs {
  readonly files = new Map<string, { content: string; mtime: number }>()
  private clock = 0

  constructor(initial: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initial)) this.set(path, content)
  }

  private set(path: string, content: string): void {
    this.files.set(path, { content, mtime: ++this.clock })
  }

  async read(path: string): Promise<string | null> {
    return this.files.get(path)?.content ?? null
  }

  async create(path: string, content: string): Promise<void> {
    if (this.files.has(path)) throw new FileExistsError(path)
    this.set(path, content)
  }

  async update(path: string, fn: (current: string) => string): Promise<void> {
    const file = this.files.get(path)
    if (!file) throw new Error(`No such file: ${path}`)
    this.set(path, fn(file.content))
  }

  async write(path: string, content: string): Promise<void> {
    this.set(path, content)
  }

  async append(path: string, content: string): Promise<void> {
    this.set(path, (this.files.get(path)?.content ?? "") + content)
  }

  async listMarkdown(): Promise<FileInfo[]> {
    return [...this.files]
      .filter(([p]) => p.endsWith(".md") && !isHiddenPath(p))
      .map(([path, f]) => ({ path, mtime: f.mtime }))
      .sort((a, b) => a.path.localeCompare(b.path))
  }

  async mtime(path: string): Promise<number | null> {
    return this.files.get(path)?.mtime ?? null
  }

  async rename(from: string, to: string): Promise<void> {
    const file = this.files.get(from)
    if (!file) throw new Error(`No such file: ${from}`)
    if (this.files.has(to)) throw new FileExistsError(to)
    this.files.delete(from)
    this.set(to, file.content)
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path)
  }
}

export function isHiddenPath(path: string): boolean {
  return path.split("/").some((segment) => segment.startsWith("."))
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/")
  return i === -1 ? "" : path.slice(0, i)
}

export function basename(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1)
  return name.endsWith(".md") ? name.slice(0, -3) : name
}

export function joinPath(...parts: string[]): string {
  return parts
    .filter((p) => p !== "")
    .join("/")
    .replace(/\/{2,}/g, "/")
}
