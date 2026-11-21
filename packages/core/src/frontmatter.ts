import { Document, isMap, parseDocument } from "yaml"

/** Optional BOM, opening fence, YAML (possibly empty), closing fence. */
const FENCE = /^(\uFEFF?)---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/

export interface SplitNote {
  /** Raw YAML between the fences, or `null` when the note has no frontmatter. */
  yaml: string | null
  body: string
  /** Line ending used by the note (`"\r\n"` for Windows files). */
  eol: "\n" | "\r\n"
  bom: boolean
}

export function splitNote(source: string): SplitNote {
  const eol = source.includes("\r\n") ? "\r\n" : "\n"
  const match = FENCE.exec(source)
  if (!match) {
    const bom = source.startsWith("\uFEFF")
    return { yaml: null, body: bom ? source.slice(1) : source, eol, bom }
  }
  return { yaml: match[2] ?? "", body: source.slice(match[0].length), eol, bom: match[1] !== "" }
}

/** Parsed frontmatter as a plain object; `{}` when absent, invalid or not a mapping. */
export function readFrontmatter(source: string): Record<string, unknown> {
  const { yaml } = splitNote(source)
  if (yaml === null || yaml.trim() === "") return {}
  const doc = parseDocument(yaml)
  if (doc.errors.length > 0) return {}
  const value: unknown = doc.toJS()
  return isRecord(value) ? value : {}
}

/**
 * Apply `changes` to the note's frontmatter, preserving key order, comments and
 * every key it doesn't touch. `undefined` deletes a key. The body, line endings and
 * BOM are kept as they were.
 */
export function updateFrontmatter(source: string, changes: Record<string, unknown>): string {
  const { yaml, body, eol, bom } = splitNote(source)
  const doc = yaml === null || yaml.trim() === "" ? new Document({}) : parseDocument(yaml)
  if (doc.errors.length > 0) {
    throw new Error(`Invalid YAML frontmatter: ${doc.errors[0]?.message ?? "unknown error"}`)
  }
  if (!isMap(doc.contents)) doc.contents = doc.createNode({})
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) doc.delete(key)
    else doc.set(key, value)
  }
  const rendered = doc.toString({ lineWidth: 0 }).trimEnd().replace(/\r?\n/g, eol)
  return `${bom ? "\uFEFF" : ""}---${eol}${rendered}${eol}---${eol}${body}`
}

/** Serialize a brand-new note. */
export function composeNote(frontmatter: Record<string, unknown>, body: string): string {
  return updateFrontmatter("", frontmatter) + withFinalNewline(body, "\n")
}

/** Replace the body, keeping the frontmatter block byte-for-byte. */
export function replaceBody(source: string, body: string): string {
  const { eol } = splitNote(source)
  const match = FENCE.exec(source)
  const head = match ? match[0] : ""
  return head + withFinalNewline(body.replace(/\r?\n/g, eol), eol)
}

function withFinalNewline(text: string, eol: string): string {
  return text === "" || text.endsWith("\n") ? text : text + eol
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
