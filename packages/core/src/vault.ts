import type * as z from "zod/mini"
import { readFrontmatter, splitNote } from "./frontmatter.js"
import { basename, dirname, isHiddenPath, type VaultFs } from "./fs.js"
import { slugify } from "./ids.js"
import { linkTarget } from "./links.js"
import {
  ConceptFrontmatterSchema,
  type ConceptKind,
  CourseFrontmatterSchema,
  describeError,
  TestFrontmatterSchema,
  type TestQuestion,
} from "./schema.js"

export interface Course {
  id: string
  /** `false` when the id is derived from the title and not yet written to the note. */
  hasStoredId: boolean
  title: string
  path: string
  exam: string | null
  language: string | null
  sources: string[]
}

export interface Requirement {
  /** The entry exactly as written in `requires` (kept verbatim on rewrites). */
  raw: string
  /** Resolved concept id, or `null` when unresolved or ambiguous. */
  id: string | null
}

export interface Concept {
  /** Stable id from frontmatter, or `path:<path>` until one is assigned. */
  id: string
  hasStoredId: boolean
  path: string
  title: string
  courseId: string | null
  question: string
  /** Note body: the reference answer. */
  answer: string
  importance: 1 | 2 | 3
  kind: ConceptKind | null
  /** Resolved prerequisite concept ids (deduplicated). */
  requires: string[]
  /** `requires` links that point to no concept note (or to several). */
  unresolved: string[]
  /** Every `requires` entry with its resolution, in file order. */
  requirements: Requirement[]
}

export interface PracticeTest {
  id: string
  path: string
  title: string
  courseId: string
  created: string | null
  status: "open" | "graded"
  questions: TestQuestion[]
  score: number | null
  max: number | null
}

export interface Issue {
  path: string
  message: string
}

export interface VaultIndex {
  courses: Map<string, Course>
  concepts: Map<string, Concept>
  tests: Map<string, PracticeTest>
  issues: Issue[]
}

type CourseFm = z.infer<typeof CourseFrontmatterSchema>
type ConceptFm = z.infer<typeof ConceptFrontmatterSchema>
type TestFm = z.infer<typeof TestFrontmatterSchema>

type Parsed =
  | { kind: "course"; fm: CourseFm }
  | { kind: "concept"; fm: ConceptFm; body: string }
  | { kind: "test"; fm: TestFm }
  | { kind: "invalid"; message: string }
  | { kind: "other" }

/** Parse one note. Only notes whose frontmatter mentions `easy30` are parsed as YAML. */
export function parseNote(source: string): Parsed {
  const { yaml, body } = splitNote(source)
  if (yaml === null || !yaml.includes("easy30")) return { kind: "other" }
  const fm = readFrontmatter(source)
  const schema =
    fm.easy30 === "course"
      ? CourseFrontmatterSchema
      : fm.easy30 === "concept"
        ? ConceptFrontmatterSchema
        : fm.easy30 === "test"
          ? TestFrontmatterSchema
          : null
  if (schema === null) {
    return typeof fm.easy30 === "string"
      ? { kind: "invalid", message: `Unknown note type easy30: ${fm.easy30}` }
      : { kind: "other" }
  }
  const parsed = schema.safeParse(fm)
  if (!parsed.success) return { kind: "invalid", message: describeError(parsed.error) }
  switch (parsed.data.easy30) {
    case "course":
      return { kind: "course", fm: parsed.data }
    case "concept":
      return { kind: "concept", fm: parsed.data, body }
    case "test":
      return { kind: "test", fm: parsed.data }
  }
}

/**
 * Keeps a parsed copy of every note keyed by path and modification time, so a refresh
 * only re-reads files that changed. Building the index from the cache is in-memory.
 */
export class VaultIndexer {
  private readonly cache = new Map<string, { mtime: number; parsed: Parsed }>()

  constructor(private readonly fs: VaultFs) {}

  /** Re-list the vault and re-read notes whose mtime changed. */
  async scan(): Promise<VaultIndex> {
    const files = await this.fs.listMarkdown()
    const seen = new Set<string>()
    await Promise.all(
      files.map(async ({ path, mtime }) => {
        seen.add(path)
        if (this.cache.get(path)?.mtime !== mtime) await this.load(path, mtime)
      }),
    )
    for (const path of this.cache.keys()) if (!seen.has(path)) this.cache.delete(path)
    return this.build()
  }

  /** Re-read just these paths (after our own writes). Missing files are dropped. */
  async touch(paths: Iterable<string>): Promise<VaultIndex> {
    await Promise.all(
      [...new Set(paths)].map(async (path) => {
        const mtime = path.endsWith(".md") && !isHiddenPath(path) ? await this.fs.mtime(path) : null
        if (mtime === null) this.cache.delete(path)
        else await this.load(path, mtime)
      }),
    )
    return this.build()
  }

  private async load(path: string, mtime: number): Promise<void> {
    const source = await this.fs.read(path)
    if (source === null) this.cache.delete(path)
    else this.cache.set(path, { mtime, parsed: parseNote(source) })
  }

  private build(): VaultIndex {
    const notes = [...this.cache]
      .map(([path, { parsed }]) => ({ path, parsed }))
      .sort((a, b) => a.path.localeCompare(b.path))
    return buildIndex(notes)
  }
}

export async function loadVault(fs: VaultFs): Promise<VaultIndex> {
  return new VaultIndexer(fs).scan()
}

function buildIndex(notes: { path: string; parsed: Parsed }[]): VaultIndex {
  const issues: Issue[] = []
  const courses = new Map<string, Course>()
  const tests = new Map<string, PracticeTest>()
  const rawConcepts: { path: string; fm: ConceptFm; body: string }[] = []

  for (const { path, parsed } of notes) {
    switch (parsed.kind) {
      case "invalid":
        issues.push({ path, message: parsed.message })
        break
      case "course": {
        const title = parsed.fm.title ?? basename(path)
        const id = parsed.fm.id ?? slugify(title)
        const clash = courses.get(id)
        if (clash) {
          issues.push({ path, message: `Duplicate course id "${id}" (also ${clash.path})` })
          break
        }
        courses.set(id, {
          id,
          hasStoredId: parsed.fm.id !== undefined,
          title,
          path,
          exam: parsed.fm.exam ?? null,
          language: parsed.fm.language ?? null,
          sources: parsed.fm.sources ?? [],
        })
        break
      }
      case "concept":
        rawConcepts.push({ path, fm: parsed.fm, body: parsed.body })
        break
      case "test": {
        const t = parsed.fm
        if (tests.has(t.id)) {
          issues.push({ path, message: `Duplicate test id "${t.id}"` })
          break
        }
        tests.set(t.id, {
          id: t.id,
          path,
          title: basename(path),
          courseId: t.course,
          created: t.created ?? null,
          status: t.status,
          questions: t.questions,
          score: t.score ?? null,
          max: t.max ?? null,
        })
        break
      }
      case "other":
        break
    }
  }

  for (const t of tests.values()) {
    if (!courses.has(t.courseId))
      issues.push({ path: t.path, message: `Unknown course "${t.courseId}"` })
  }
  const concepts = resolveConcepts(rawConcepts, courses, issues)
  return { courses, concepts, tests, issues }
}

function resolveConcepts(
  raws: { path: string; fm: ConceptFm; body: string }[],
  courses: Map<string, Course>,
  issues: Issue[],
): Map<string, Concept> {
  const courseByFolder = new Map<string, string>()
  for (const c of courses.values()) {
    const folder = dirname(c.path)
    // Two course notes in one folder make folder inference ambiguous: disable it there.
    courseByFolder.set(folder, courseByFolder.has(folder) ? "" : c.id)
  }
  const inferCourse = (path: string): string | null => {
    for (let dir = dirname(path); ; dir = dirname(dir)) {
      const id = courseByFolder.get(dir)
      if (id) return id
      if (dir === "") return null
    }
  }

  const concepts = new Map<string, Concept>()
  const fmById = new Map<string, ConceptFm>()
  for (const { path, fm, body } of raws) {
    const id = fm.id ?? `path:${path}`
    const clash = concepts.get(id)
    if (clash) {
      issues.push({ path, message: `Duplicate concept id "${id}" (also ${clash.path})` })
      continue
    }
    const courseId = fm.course ?? inferCourse(path)
    if (courseId === null) {
      issues.push({ path, message: "Concept is not in any course (set `course:`)" })
    } else if (!courses.has(courseId)) {
      issues.push({ path, message: `Unknown course "${courseId}"` })
    }
    fmById.set(id, fm)
    concepts.set(id, {
      id,
      hasStoredId: fm.id !== undefined,
      path,
      title: basename(path),
      courseId,
      question: fm.question?.trim() ?? "",
      answer: body.trim(),
      importance: fm.importance ?? 2,
      kind: fm.kind ?? null,
      requires: [],
      unresolved: [],
      requirements: [],
    })
  }

  // Link resolution: exact path, else file name in the same course, else a unique
  // file name anywhere. Several equally good matches are reported, never guessed.
  const byPath = new Map<string, Concept>()
  const byName = new Map<string, Concept[]>()
  for (const c of concepts.values()) {
    byPath.set(c.path.replace(/\.md$/, "").toLowerCase(), c)
    const key = c.title.toLowerCase()
    byName.set(key, [...(byName.get(key) ?? []), c])
  }
  for (const concept of concepts.values()) {
    const seen = new Set<string>()
    for (const raw of fmById.get(concept.id)?.requires ?? []) {
      const target = linkTarget(raw)
      if (target === null) continue
      const key = target.toLowerCase()
      const named = byName.get(basename(key)) ?? []
      const sameCourse = named.filter((c) => c.courseId === concept.courseId)
      const pool = sameCourse.length > 0 ? sameCourse : named
      const hit = byPath.get(key) ?? (pool.length === 1 ? pool[0] : undefined)
      if (!hit) {
        concept.unresolved.push(target)
        concept.requirements.push({ raw, id: null })
        if (pool.length > 1) {
          issues.push({
            path: concept.path,
            message: `Ambiguous prerequisite [[${target}]]: ${pool.map((c) => c.path).join(", ")}`,
          })
        }
        continue
      }
      concept.requirements.push({ raw, id: hit.id })
      if (hit.id === concept.id) {
        issues.push({ path: concept.path, message: "A concept cannot require itself" })
      } else if (!seen.has(hit.id)) {
        seen.add(hit.id)
        concept.requires.push(hit.id)
      }
    }
  }
  return concepts
}
