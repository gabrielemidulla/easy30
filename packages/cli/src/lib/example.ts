import { readFile } from "node:fs/promises"
import { type VaultFs, Workspace } from "@easy30/core"
import type { FileReport } from "./vault-files.js"

export interface ExampleConcept {
  title: string
  question: string
  answer: string
  /** Titles of prerequisites; each must appear earlier in the list. */
  requires: string[]
  importance?: 1 | 2 | 3
}

export interface ExampleCourse {
  id: string
  title: string
  language?: string
  concepts: ExampleConcept[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseConcept(raw: unknown, seen: Set<string>): ExampleConcept {
  if (
    !isRecord(raw) ||
    typeof raw.title !== "string" ||
    typeof raw.question !== "string" ||
    typeof raw.answer !== "string" ||
    !Array.isArray(raw.requires) ||
    !raw.requires.every((r): r is string => typeof r === "string")
  ) {
    throw new Error("Each example concept needs title, question, answer and requires[]")
  }
  const requires: string[] = raw.requires
  for (const r of requires) {
    if (!seen.has(r)) throw new Error(`"${raw.title}" requires "${r}", which must come first`)
  }
  seen.add(raw.title)
  const { importance } = raw
  return {
    title: raw.title,
    question: raw.question,
    answer: raw.answer,
    requires,
    ...(importance === 1 || importance === 2 || importance === 3 ? { importance } : {}),
  }
}

/** Validate untrusted JSON into an `ExampleCourse` (throws with a precise message). */
export function parseExample(json: unknown): ExampleCourse {
  if (!isRecord(json) || typeof json.id !== "string" || typeof json.title !== "string") {
    throw new Error("Example course needs a string id and title")
  }
  if (!Array.isArray(json.concepts)) throw new Error("Example course needs a concepts array")
  const seen = new Set<string>()
  const concepts = json.concepts.map((raw: unknown) => parseConcept(raw, seen))
  return {
    id: json.id,
    title: json.title,
    ...(typeof json.language === "string" ? { language: json.language } : {}),
    concepts,
  }
}

export async function loadExample(path: string): Promise<ExampleCourse> {
  return parseExample(JSON.parse(await readFile(path, "utf8")))
}

/**
 * Create the example course through the Workspace API so the notes always follow the
 * current format. Does nothing when a course with that id already exists.
 */
export async function writeExample(fs: VaultFs, example: ExampleCourse): Promise<FileReport> {
  const ws = await Workspace.open(fs)
  const existing = ws.courses().find((c) => c.id === example.id)
  if (existing) return { path: existing.path, status: "kept" }
  const course = await ws.createCourse({
    id: example.id,
    title: example.title,
    ...(example.language !== undefined && { language: example.language }),
  })
  const ids = new Map<string, string>()
  for (const c of example.concepts) {
    const created = await ws.createConcept({
      courseId: course.id,
      title: c.title,
      question: c.question,
      answer: c.answer,
      requires: c.requires.flatMap((title) => ids.get(title) ?? []),
      ...(c.importance !== undefined && { importance: c.importance }),
    })
    ids.set(c.title, created.id)
  }
  return {
    path: course.path,
    status: "created",
    note: `${example.concepts.length} concepts`,
  }
}
