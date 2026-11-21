import { dirname, FileExistsError, type FileInfo, isHiddenPath, type VaultFs } from "@easy30/core"
import type { DataAdapter, FileManager, TAbstractFile, TFile, Vault } from "obsidian"

/** The slice of `App` the adapter needs; `App` satisfies it structurally. */
export interface FsHost {
  vault: Pick<
    Vault,
    | "getMarkdownFiles"
    | "getAbstractFileByPath"
    | "read"
    | "process"
    | "create"
    | "modify"
    | "append"
    | "createFolder"
  > & {
    adapter: Pick<
      DataAdapter,
      "read" | "write" | "append" | "exists" | "mkdir" | "remove" | "rename" | "stat"
    >
  }
  fileManager: Pick<FileManager, "renameFile" | "trashFile">
}

/** Same rules as Obsidian's `normalizePath` (kept local so this module runs in unit tests). */
export function normalizeVaultPath(path: string): string {
  return path
    .replace(/[\\/]+/g, "/")
    .replace(/[\u00A0\u202F]/g, " ")
    .replace(/^\/+|\/+$/g, "")
    .normalize("NFC")
}

function isFile(file: TAbstractFile | null): file is TFile {
  return file !== null && "extension" in file
}

/** Markdown notes live in the Obsidian vault (so links, caches and sync stay coherent);
 * everything else (the hidden `.easy30/` state folder) goes through the raw adapter. */
function isVaultNote(path: string): boolean {
  return path.endsWith(".md") && !isHiddenPath(path)
}

export class ObsidianFs implements VaultFs {
  constructor(private readonly app: FsHost) {}

  private get vault() {
    return this.app.vault
  }

  private get adapter() {
    return this.app.vault.adapter
  }

  private note(path: string): TFile | null {
    const file = this.vault.getAbstractFileByPath(path)
    return isFile(file) ? file : null
  }

  private async hiddenExists(path: string): Promise<boolean> {
    return this.adapter.exists(path)
  }

  async read(path: string): Promise<string | null> {
    const p = normalizeVaultPath(path)
    if (!isVaultNote(p)) return (await this.hiddenExists(p)) ? this.adapter.read(p) : null
    // Not `cachedRead`: a stale cache followed by a write would drop concurrent external edits.
    const file = this.note(p)
    return file ? this.vault.read(file) : null
  }

  async create(path: string, content: string): Promise<void> {
    const p = normalizeVaultPath(path)
    if (!isVaultNote(p)) {
      if (await this.hiddenExists(p)) throw new FileExistsError(p)
      await this.ensureAdapterFolder(dirname(p))
      await this.adapter.write(p, content)
      return
    }
    if (this.vault.getAbstractFileByPath(p) !== null) throw new FileExistsError(p)
    await this.ensureVaultFolder(dirname(p))
    try {
      await this.vault.create(p, content)
    } catch (error) {
      // Lost a race with another writer: report it as the exclusive-create failure.
      if (this.vault.getAbstractFileByPath(p) !== null) throw new FileExistsError(p)
      throw error
    }
  }

  async update(path: string, fn: (current: string) => string): Promise<void> {
    const p = normalizeVaultPath(path)
    if (!isVaultNote(p)) {
      if (!(await this.hiddenExists(p))) throw new Error(`No such file: ${p}`)
      await this.adapter.write(p, fn(await this.adapter.read(p)))
      return
    }
    const file = this.note(p)
    if (!file) throw new Error(`No such file: ${p}`)
    await this.vault.process(file, fn)
  }

  async write(path: string, content: string): Promise<void> {
    const p = normalizeVaultPath(path)
    if (!isVaultNote(p)) {
      await this.ensureAdapterFolder(dirname(p))
      await this.adapter.write(p, content)
      return
    }
    const file = this.note(p)
    if (file) {
      await this.vault.modify(file, content)
      return
    }
    await this.ensureVaultFolder(dirname(p))
    await this.vault.create(p, content)
  }

  async append(path: string, content: string): Promise<void> {
    const p = normalizeVaultPath(path)
    if (!isVaultNote(p)) {
      await this.ensureAdapterFolder(dirname(p))
      // Some mobile adapters cannot append to a file that does not exist yet.
      if (await this.hiddenExists(p)) await this.adapter.append(p, content)
      else await this.adapter.write(p, content)
      return
    }
    const file = this.note(p)
    if (file) await this.vault.append(file, content)
    else await this.write(p, content)
  }

  async listMarkdown(): Promise<FileInfo[]> {
    return this.vault
      .getMarkdownFiles()
      .filter((file) => !isHiddenPath(file.path))
      .map((file) => ({ path: file.path, mtime: file.stat.mtime }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  }

  async mtime(path: string): Promise<number | null> {
    const p = normalizeVaultPath(path)
    if (!isVaultNote(p)) return (await this.adapter.stat(p))?.mtime ?? null
    return this.note(p)?.stat.mtime ?? null
  }

  async rename(from: string, to: string): Promise<void> {
    const source = normalizeVaultPath(from)
    const target = normalizeVaultPath(to)
    if (!isVaultNote(source)) {
      if (!(await this.hiddenExists(source))) throw new Error(`No such file: ${source}`)
      if (await this.hiddenExists(target)) throw new FileExistsError(target)
      await this.ensureAdapterFolder(dirname(target))
      await this.adapter.rename(source, target)
      return
    }
    const file = this.note(source)
    if (!file) throw new Error(`No such file: ${source}`)
    if (this.vault.getAbstractFileByPath(target) !== null) throw new FileExistsError(target)
    await this.ensureVaultFolder(dirname(target))
    // Goes through FileManager so Obsidian rewrites links to the note vault-wide.
    await this.app.fileManager.renameFile(file, target)
  }

  async remove(path: string): Promise<void> {
    const p = normalizeVaultPath(path)
    if (!isVaultNote(p)) {
      if (await this.hiddenExists(p)) await this.adapter.remove(p)
      return
    }
    const file = this.vault.getAbstractFileByPath(p)
    if (file !== null) await this.app.fileManager.trashFile(file)
  }

  private async ensureVaultFolder(folder: string): Promise<void> {
    for (const part of ancestors(folder)) {
      if (this.vault.getAbstractFileByPath(part) !== null) continue
      try {
        await this.vault.createFolder(part)
      } catch (error) {
        // A concurrent writer may have created it between the check and the call.
        if (this.vault.getAbstractFileByPath(part) === null) throw error
      }
    }
  }

  private async ensureAdapterFolder(folder: string): Promise<void> {
    for (const part of ancestors(folder)) {
      if (!(await this.adapter.exists(part))) await this.adapter.mkdir(part)
    }
  }
}

/** `a/b/c` → `["a", "a/b", "a/b/c"]` (empty for the vault root). */
function ancestors(folder: string): string[] {
  const segments = folder.split("/").filter(Boolean)
  return segments.map((_, i) => segments.slice(0, i + 1).join("/"))
}
