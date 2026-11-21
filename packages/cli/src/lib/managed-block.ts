export const BLOCK_START = "<!-- easy30:start -->"
export const BLOCK_END = "<!-- easy30:end -->"

export type WriteStatus = "created" | "updated" | "kept"

export interface Upserted {
  content: string
  status: WriteStatus
  /** Set when the markers are damaged: the content is then the unchanged original. */
  warning?: string
}

/**
 * Insert `body` between the easy30 markers, or replace what is already between
 * them. Everything outside the markers is left untouched. A damaged block (one
 * marker without the other) is never rewritten: the file is returned as is,
 * with a warning. Pure.
 */
export function upsertBlock(existing: string | null, body: string): Upserted {
  const block = `${BLOCK_START}\n${body.trim()}\n${BLOCK_END}`
  if (existing === null) return { content: `${block}\n`, status: "created" }
  const start = existing.indexOf(BLOCK_START)
  const end = existing.indexOf(BLOCK_END, start === -1 ? 0 : start + BLOCK_START.length)
  const hasEnd = existing.includes(BLOCK_END)
  if (start !== -1 && end === -1) {
    return {
      content: existing,
      status: "kept",
      warning: `Found "${BLOCK_START}" without a matching "${BLOCK_END}". Fix or remove the markers, then rerun.`,
    }
  }
  if (start === -1 && hasEnd) {
    return {
      content: existing,
      status: "kept",
      warning: `Found "${BLOCK_END}" without a preceding "${BLOCK_START}". Fix or remove the marker, then rerun.`,
    }
  }
  let content: string
  if (start !== -1) {
    content = existing.slice(0, start) + block + existing.slice(end + BLOCK_END.length)
  } else {
    const base = existing.trimEnd()
    content = base === "" ? `${block}\n` : `${base}\n\n${block}\n`
  }
  return { content, status: content === existing ? "kept" : "updated" }
}
