import type { VaultFs } from "@easy30/core"
import { NodeFs } from "@easy30/core/node"
import type { WriteStatus } from "./managed-block.js"

export interface FileReport {
  path: string
  status: WriteStatus
  note?: string
}

export function openVaultFs(dir: string): VaultFs {
  return new NodeFs(dir)
}

/** Write `content` unless the file exists (then keep it, unless `force`). */
export async function createFile(
  fs: VaultFs,
  path: string,
  content: string,
  force = false,
): Promise<FileReport> {
  const existing = await fs.read(path)
  if (existing === null) {
    await fs.write(path, content)
    return { path, status: "created" }
  }
  if (!force || existing === content) return { path, status: "kept" }
  await fs.write(path, content)
  return { path, status: "updated" }
}

/** Write a computed result only when it changes the file. */
export async function applyResult(
  fs: VaultFs,
  path: string,
  result: { content: string; status: WriteStatus },
  note?: string,
): Promise<FileReport> {
  if (result.status !== "kept") await fs.write(path, result.content)
  return note === undefined
    ? { path, status: result.status }
    : { path, status: result.status, note }
}
