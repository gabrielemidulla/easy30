import { dirname, isHiddenPath, type VaultFs } from "@easy30/core"
import type { DataAdapter, FileManager, TAbstractFile, TFile, Vault } from "obsidian"

/** The slice of `App` the adapter needs; `App` satisfies it structurally. */
export interface FsHost {
  vault: Pick<
    Vault,
    | "getMarkdownFiles"
    | "getAbstractFileByPath"
    | "cachedRead"
    | "create"
    | "modify"
    | "append"
    | "createFolder"
  > & {
    adapter: Pick<
      DataAdapter,
      "read" | "write" | "append" | "exists" | "mkdir" | "remove" | "rename"
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

  async read(path: string): Promise<string | null> {
    const p = normalizeVaultPath(path)
    if (!isVaultNote(p)) return (await this.adapter.exists(p)) ? this.adapter.read(p) : null
    const file = this.vault.getAbstractFileByPath(p)
    return isFile(file) ? this.vault.cachedRead(file) : null
  }

  async write(path: string, content: string): Promise<void> {
    const p = normalizeVaultPath(path)
    if (!isVaultNote(p)) {
      await this.ensureAdapterFolder(dirname(p))
      await this.adapter.write(p, content)
      return
    }
    const file = this.vault.getAbstractFileByPath(p)
    if (isFile(file)) {
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
      if (await this.adapter.exists(p)) await this.adapter.append(p, content)
      else await this.adapter.write(p, content)
      return
    }
    const file = this.vault.getAbstractFileByPath(p)
    if (isFile(file)) await this.vault.append(file, content)
    else await this.write(p, content)
  }

  async listMarkdown(): Promise<string[]> {
    return this.vault
      .getMarkdownFiles()
      .map((file) => file.path)
      .filter((path) => !isHiddenPath(path))
      .sort()
  }

  async exists(path: string): Promise<boolean> {
    const p = normalizeVaultPath(path)
    if (!isVaultNote(p)) return this.adapter.exists(p)
    return this.vault.getAbstractFileByPath(p) !== null
  }

  async rename(from: string, to: string): Promise<void> {
    const source = normalizeVaultPath(from)
    const target = normalizeVaultPath(to)
    if (await this.exists(target)) throw new Error(`File exists: ${target}`)
    if (!isVaultNote(source)) {
      await this.ensureAdapterFolder(dirname(target))
      await this.adapter.rename(source, target)
      return
    }
    const file = this.vault.getAbstractFileByPath(source)
    if (!isFile(file)) throw new Error(`No such file: ${source}`)
    await this.ensureVaultFolder(dirname(target))
    // Goes through FileManager so Obsidian rewrites links to the note vault-wide.
    await this.app.fileManager.renameFile(file, target)
  }

  async remove(path: string): Promise<void> {
    const p = normalizeVaultPath(path)
    if (!isVaultNote(p)) {
      if (await this.adapter.exists(p)) await this.adapter.remove(p)
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
