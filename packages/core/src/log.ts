import type { VaultFs } from "./fs.js"
import { type LogEntry, LogEntrySchema, SAFE_ID } from "./schema.js"

export const STATE_DIR = ".easy30"

export function isSafeId(id: string): boolean {
  return SAFE_ID.test(id)
}

export function assertSafeId(id: string): void {
  if (!isSafeId(id)) throw new Error(`Invalid id "${id}" (letters, digits, - and _ only)`)
}

export function logPath(courseId: string): string {
  assertSafeId(courseId)
  return `${STATE_DIR}/log/${courseId}.jsonl`
}

export interface LogParseError {
  line: number
  message: string
}

/** Parse a JSONL log. Bad lines are reported, never fatal: one corrupt line
 * (e.g. a bad merge) must not lose the rest of the history. */
export function parseLog(text: string): { entries: LogEntry[]; errors: LogParseError[] } {
  const entries: LogEntry[] = []
  const errors: LogParseError[] = []
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim()
    if (!line) continue
    let json: unknown
    try {
      json = JSON.parse(line)
    } catch {
      errors.push({ line: i + 1, message: "not valid JSON" })
      continue
    }
    const parsed = LogEntrySchema.safeParse(json)
    if (parsed.success) entries.push(parsed.data)
    else errors.push({ line: i + 1, message: parsed.error.issues[0]?.message ?? "invalid entry" })
  }
  return { entries, errors }
}

export function serializeEntry(entry: LogEntry): string {
  return `${JSON.stringify(LogEntrySchema.parse(entry))}\n`
}

export async function readLog(
  fs: VaultFs,
  courseId: string,
): Promise<{ entries: LogEntry[]; errors: LogParseError[] }> {
  const text = await fs.read(logPath(courseId))
  return text === null ? { entries: [], errors: [] } : parseLog(text)
}

/** Append entries in a single write, so a batch (e.g. a graded test) lands whole. */
export async function appendLog(
  fs: VaultFs,
  courseId: string,
  entries: LogEntry | readonly LogEntry[],
): Promise<void> {
  const list = Array.isArray(entries) ? entries : [entries as LogEntry]
  if (list.length === 0) return
  const text = list.map(serializeEntry).join("")
  const path = logPath(courseId)
  const existing = await fs.read(path)
  // Guarantee one entry per line even if the file was saved without a trailing newline.
  const prefix = existing && !existing.endsWith("\n") ? "\n" : ""
  await fs.append(path, prefix + text)
}
