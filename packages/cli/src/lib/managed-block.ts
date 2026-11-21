export const BLOCK_START = "<!-- easy30:start -->"
export const BLOCK_END = "<!-- easy30:end -->"

export type WriteStatus = "created" | "updated" | "kept"

export interface Upserted {
  content: string
  status: WriteStatus
}

/**
 * Insert `body` between the easy30 markers, or replace what is already between
 * them. Everything outside the markers is left untouched. Pure.
 */
export function upsertBlock(existing: string | null, body: string): Upserted {
  const block = `${BLOCK_START}\n${body.trim()}\n${BLOCK_END}`
  if (existing === null) return { content: `${block}\n`, status: "created" }
  const start = existing.indexOf(BLOCK_START)
  const end = existing.indexOf(BLOCK_END, start + 1)
  let content: string
  if (start !== -1 && end !== -1) {
    content = existing.slice(0, start) + block + existing.slice(end + BLOCK_END.length)
  } else {
    const base = existing.trimEnd()
    content = base === "" ? `${block}\n` : `${base}\n\n${block}\n`
  }
  return { content, status: content === existing ? "kept" : "updated" }
}
