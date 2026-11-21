/**
 * Minimal file-system surface Easy30 needs. Paths are vault-relative and use `/`.
 * Implementations: `NodeFs` (`@easy30/core/node`), the Obsidian adapter in the
 * plugin, and `MemoryFs` for tests.
 */
export interface VaultFs {
  /** File contents, or `null` when the file does not exist. */
  read(path: string): Promise<string | null>
  /** Create or overwrite a file, creating parent folders as needed. */
  write(path: string, content: string): Promise<void>
  /** Append to a file, creating it (and parent folders) if missing. */
  append(path: string, content: string): Promise<void>
  /** Every Markdown file in the vault, excluding dot-folders. */
  listMarkdown(): Promise<string[]>
  exists(path: string): Promise<boolean>
  /** Move a file; fails if `to` exists. */
  rename(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
}

export class MemoryFs implements VaultFs {
  readonly files = new Map<string, string>()

  constructor(initial: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initial)) this.files.set(path, content)
  }

  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content)
  }

  async append(path: string, content: string): Promise<void> {
    this.files.set(path, (this.files.get(path) ?? "") + content)
  }

  async listMarkdown(): Promise<string[]> {
    return [...this.files.keys()].filter((p) => p.endsWith(".md") && !isHiddenPath(p)).sort()
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path)
  }

  async rename(from: string, to: string): Promise<void> {
    const content = this.files.get(from)
    if (content === undefined) throw new Error(`No such file: ${from}`)
    if (this.files.has(to)) throw new Error(`File exists: ${to}`)
    this.files.delete(from)
    this.files.set(to, content)
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
