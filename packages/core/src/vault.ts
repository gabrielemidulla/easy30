import type { z } from "zod"
import { readFrontmatter, splitNote } from "./frontmatter.js"
import { basename, dirname, type VaultFs } from "./fs.js"
import { slugify } from "./ids.js"
import { linkTarget } from "./links.js"
import {
  ConceptFrontmatterSchema,
  CourseFrontmatterSchema,
  TestFrontmatterSchema,
  type TestQuestion,
} from "./schema.js"

export interface Course {
  id: string
  title: string
  path: string
  exam: string | null
  language: string | null
  sources: string[]
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
  /** Resolved prerequisite concept ids. */
  requires: string[]
  /** `requires` links that point to no concept note. */
  unresolved: string[]
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

interface RawConcept {
  path: string
  fm: z.infer<typeof ConceptFrontmatterSchema>
  body: string
}

/** Cheap pre-filter so we only parse YAML of notes that mention easy30. */
const MARKER = /^easy30:\s*(course|concept|test)\s*$/m

export async function loadVault(fs: VaultFs): Promise<VaultIndex> {
  const paths = await fs.listMarkdown()
  const issues: Issue[] = []
  const courses = new Map<string, Course>()
  const tests = new Map<string, PracticeTest>()
  const raws: RawConcept[] = []

  const contents = await Promise.all(paths.map(async (p) => [p, await fs.read(p)] as const))
  for (const [path, source] of contents) {
    if (source === null || !MARKER.test(splitNote(source).yaml ?? "")) continue
    const fm = readFrontmatter(source)
    switch (fm.easy30) {
      case "course": {
        const parsed = CourseFrontmatterSchema.safeParse(fm)
        if (!parsed.success) {
          issues.push({ path, message: describe(parsed.error) })
          break
        }
        const title = parsed.data.title ?? basename(path)
        const id = parsed.data.id ?? slugify(title)
        if (courses.has(id)) {
          issues.push({ path, message: `Duplicate course id "${id}"` })
          break
        }
        courses.set(id, {
          id,
          title,
          path,
          exam: parsed.data.exam ?? null,
          language: parsed.data.language ?? null,
          sources: parsed.data.sources ?? [],
        })
        break
      }
      case "concept": {
        const parsed = ConceptFrontmatterSchema.safeParse(fm)
        if (!parsed.success) issues.push({ path, message: describe(parsed.error) })
        else raws.push({ path, fm: parsed.data, body: splitNote(source).body })
        break
      }
      case "test": {
        const parsed = TestFrontmatterSchema.safeParse(fm)
        if (!parsed.success) {
          issues.push({ path, message: describe(parsed.error) })
          break
        }
        const t = parsed.data
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
    }
  }

  const concepts = resolveConcepts(raws, courses, issues)
  for (const test of tests.values()) {
    if (!courses.has(test.courseId)) {
      issues.push({ path: test.path, message: `Unknown course "${test.courseId}"` })
    }
  }
  return { courses, concepts, tests, issues }
}

function resolveConcepts(
  raws: RawConcept[],
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
  for (const { path, fm, body } of raws) {
    const id = fm.id ?? `path:${path}`
    if (concepts.has(id)) {
      issues.push({
        path,
        message: `Duplicate concept id "${id}" (also ${concepts.get(id)?.path})`,
      })
      continue
    }
    const courseId = fm.course ?? inferCourse(path)
    if (courseId !== null && !courses.has(courseId)) {
      issues.push({ path, message: `Unknown course "${courseId}"` })
    }
    concepts.set(id, {
      id,
      hasStoredId: fm.id !== undefined,
      path,
      title: basename(path),
      courseId,
      question: fm.question?.trim() ?? "",
      answer: body.trim(),
      importance: (fm.importance ?? 2) as 1 | 2 | 3,
      requires: [],
      unresolved: [],
    })
  }

  // Link resolution: exact path, then file name (same course first).
  const byPath = new Map<string, Concept>()
  const byName = new Map<string, Concept[]>()
  for (const c of concepts.values()) {
    byPath.set(c.path.replace(/\.md$/, "").toLowerCase(), c)
    const key = c.title.toLowerCase()
    byName.set(key, [...(byName.get(key) ?? []), c])
  }
  for (const { path, fm } of raws) {
    const concept = concepts.get(fm.id ?? `path:${path}`)
    if (!concept || concept.path !== path) continue
    const seen = new Set<string>()
    for (const raw of fm.requires ?? []) {
      const target = linkTarget(raw)
      if (target === null) continue
      const key = target.toLowerCase()
      const candidates = byName.get(basename(key)) ?? []
      const hit =
        byPath.get(key) ?? candidates.find((c) => c.courseId === concept.courseId) ?? candidates[0]
      if (!hit) concept.unresolved.push(target)
      else if (hit.id === concept.id)
        issues.push({ path, message: "A concept cannot require itself" })
      else if (!seen.has(hit.id)) {
        seen.add(hit.id)
        concept.requires.push(hit.id)
      }
    }
  }
  return concepts
}

function describe(error: z.ZodError): string {
  return error.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ")
}
