import { Document, isMap, parseDocument } from "yaml"

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export interface SplitNote {
  /** Raw YAML between the fences, or `null` when the note has no frontmatter. */
  yaml: string | null
  body: string
}

export function splitNote(source: string): SplitNote {
  const match = FENCE.exec(source)
  if (!match) return { yaml: null, body: source }
  return { yaml: match[1] ?? "", body: source.slice(match[0].length) }
}

/** Parsed frontmatter as a plain object; `{}` when absent or not a mapping. */
export function readFrontmatter(source: string): Record<string, unknown> {
  const { yaml } = splitNote(source)
  if (yaml === null) return {}
  const doc = parseDocument(yaml)
  if (doc.errors.length > 0) return {}
  const value: unknown = doc.toJS()
  return isRecord(value) ? value : {}
}

/**
 * Apply `changes` to the note's frontmatter, preserving key order, comments and
 * every key it doesn't touch. `undefined` deletes a key. The body is kept verbatim.
 */
export function updateFrontmatter(source: string, changes: Record<string, unknown>): string {
  const { yaml, body } = splitNote(source)
  const doc = yaml === null ? new Document({}) : parseDocument(yaml)
  if (doc.errors.length > 0) {
    throw new Error(`Invalid YAML frontmatter: ${doc.errors[0]?.message ?? "unknown error"}`)
  }
  if (!isMap(doc.contents)) doc.contents = doc.createNode({})
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) doc.delete(key)
    else doc.set(key, value)
  }
  const rendered = doc.toString({ lineWidth: 0 }).trimEnd()
  return `---\n${rendered}\n---\n${body}`
}

/** Serialize a brand-new note. */
export function composeNote(frontmatter: Record<string, unknown>, body: string): string {
  return (
    updateFrontmatter("", frontmatter) + (body.endsWith("\n") || body === "" ? body : `${body}\n`)
  )
}

/** Replace the body, keeping the frontmatter block byte-for-byte. */
export function replaceBody(source: string, body: string): string {
  const match = FENCE.exec(source)
  const head = match ? match[0] : ""
  return head + (body.endsWith("\n") || body === "" ? body : `${body}\n`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
