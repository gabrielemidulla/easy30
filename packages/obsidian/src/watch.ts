import { STATE_DIR } from "@easy30/core"
import type { DataAdapter } from "obsidian"

export const LOG_DIR = `${STATE_DIR}/log`

/** Fingerprint of the review logs. Adapter events do not fire for hidden folders,
 * so the plugin polls this and refreshes when it changes (another device synced, etc.). */
export async function logSignature(adapter: Pick<DataAdapter, "list" | "stat">): Promise<string> {
  let files: string[]
  try {
    files = (await adapter.list(LOG_DIR)).files.filter((f) => f.endsWith(".jsonl")).sort()
  } catch {
    return ""
  }
  const parts = await Promise.all(
    files.map(async (file) => {
      const stat = await adapter.stat(file)
      return `${file}:${stat?.mtime ?? 0}:${stat?.size ?? 0}`
    }),
  )
  return parts.join("|")
}
