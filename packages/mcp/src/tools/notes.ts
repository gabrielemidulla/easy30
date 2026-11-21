import { basename, dirname, Easy30Error, type Workspace } from "@easy30/core"
import { z } from "zod"
import { truncate } from "../format.js"
import type { Registrar } from "../registrar.js"
import { textResult } from "../results.js"

const MAX_SEARCH_FILE_CHARS = 1_000_000
const MAX_MATCHES_PER_FILE = 3
const SNIPPET_RADIUS = 100
const READABLE_EXTENSIONS = new Set(["md", "txt", "tex", "csv", "json"])
const MAX_READ_CHARS = 200_000

export interface NoteMatch {
  path: string
  title: string
  snippet: string
  line: number
}

/** Case-insensitive line search across the vault's Markdown files. */
export async function searchNotes(
  workspace: Workspace,
  query: string,
  opts: { courseId?: string; limit: number },
): Promise<NoteMatch[]> {
  const needle = query.trim().toLowerCase()
  if (!needle) throw new Easy30Error("invalid", "Query is empty")
  const folder = opts.courseId ? dirname(workspace.course(opts.courseId).path) : null
  const paths = (await workspace.fs.listMarkdown()).filter(
    (p) => folder === null || p.startsWith(`${folder}/`),
  )
  const matches: NoteMatch[] = []
  for (const path of paths) {
    if (matches.length >= opts.limit) break
    const text = await workspace.fs.read(path)
    if (text === null || text.length > MAX_SEARCH_FILE_CHARS) continue
    let inFile = 0
    for (const [index, line] of text.split("\n").entries()) {
      const at = line.toLowerCase().indexOf(needle)
      if (at < 0) continue
      matches.push({
        path,
        title: basename(path).replace(/\.md$/i, ""),
        snippet: snippetAround(line, at, needle.length),
        line: index + 1,
      })
      if (++inFile >= MAX_MATCHES_PER_FILE || matches.length >= opts.limit) break
    }
  }
  return matches
}

function snippetAround(line: string, at: number, length: number): string {
  const start = Math.max(0, at - SNIPPET_RADIUS)
  const end = Math.min(line.length, at + length + SNIPPET_RADIUS)
  return `${start > 0 ? "…" : ""}${line.slice(start, end).trim()}${end < line.length ? "…" : ""}`
}

/** A normalised vault-relative path, or an error if it is hidden, escaping or not a text note. */
export function safeReadablePath(raw: string): string {
  const path = raw.trim().replace(/^\.\//, "")
  const segments = path.split("/")
  if (!path || path.startsWith("/") || path.includes("\\") || /^[a-z]:/i.test(path)) {
    throw new Easy30Error("invalid", `"${raw}" is not a vault-relative path`)
  }
  if (segments.some((s) => s === ".." || s === "." || s === "")) {
    throw new Easy30Error("invalid", `"${raw}" escapes the vault`)
  }
  if (segments.some((s) => s.startsWith("."))) {
    throw new Easy30Error("invalid", `"${raw}" is inside a hidden folder, which is not readable`)
  }
  const extension = (segments.at(-1) ?? "").split(".").pop()?.toLowerCase() ?? ""
  if (!READABLE_EXTENSIONS.has(extension)) {
    throw new Easy30Error(
      "invalid",
      `Only ${[...READABLE_EXTENSIONS].join("/")} files can be read, not "${raw}"`,
    )
  }
  return segments.join("/")
}

export function registerNoteTools(tool: Registrar): void {
  tool(
    "search_notes",
    {
      title: "Search vault notes",
      readOnly: true,
      description:
        "Case-insensitive text search across ALL Markdown notes in the vault (not only Easy30 notes): " +
        "lecture notes, sources, summaries. Returns {path, title, snippet, line} matches. Use it to ground " +
        "concepts, questions and answers in the student's own material; read a hit with read_note. " +
        "`course` restricts the search to that course's folder.",
      input: {
        query: z.string().min(1),
        course: z.string().optional().describe("Course id: only search its folder"),
        limit: z.number().int().min(1).max(200).default(20),
      },
    },
    async ({ query, course, limit }, { workspace }) =>
      searchNotes(workspace, query, { limit, ...(course !== undefined && { courseId: course }) }),
  )

  tool(
    "read_note",
    {
      title: "Read vault file",
      readOnly: true,
      description:
        "Read the text of a vault file by vault-relative path (e.g. from search_notes or a course's " +
        "`sources`). Only md, txt, tex, csv and json files; dot-folders (like .easy30) and paths outside " +
        "the vault are refused. Very long files are cut. For concepts and tests use get_concept / get_test.",
      input: { path: z.string().describe("Vault-relative path, e.g. Uni/Geometria/appunti.md") },
    },
    async ({ path }, { workspace }) => {
      const safe = safeReadablePath(path)
      const text = await workspace.fs.read(safe)
      if (text === null) throw new Easy30Error("not_found", `No file at "${safe}"`)
      return textResult(
        text.length > MAX_READ_CHARS
          ? `${truncate(text, MAX_READ_CHARS)}\n\n[truncated: file has ${text.length} characters]`
          : text,
      )
    },
  )
}
