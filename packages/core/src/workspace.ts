import { composeNote, replaceBody, updateFrontmatter } from "./frontmatter.js"
import { dirname, FileExistsError, isHiddenPath, joinPath, type VaultFs } from "./fs.js"
import { ConceptGraph } from "./graph.js"
import { newConceptId, newEntryId, newTestId, safeFileName, slugify } from "./ids.js"
import { linkTarget, retargetLink, toWikilink } from "./links.js"
import { appendLog, assertSafeId, isSafeId, logPath, readLog, STATE_DIR } from "./log.js"
import { type StudyPlan, skimQueue, studyPlan } from "./planner.js"
import { type ConceptState, replay } from "./scheduler.js"
import {
  CourseFrontmatterSchema,
  describeError,
  type Grading,
  type LogEntry,
  type Rating,
  type RatingEntry,
  type ReviewKind,
} from "./schema.js"
import {
  type Concept,
  type Course,
  type Issue,
  type PracticeTest,
  type VaultIndex,
  VaultIndexer,
} from "./vault.js"

export type Easy30ErrorCode = "not_found" | "cycle" | "conflict" | "ambiguous" | "invalid"

export class Easy30Error extends Error {
  constructor(
    readonly code: Easy30ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "Easy30Error"
  }
}

export interface ConceptView extends Concept {
  state: ConceptState
  /** Belongs to another course but is a prerequisite of a concept in this one. */
  external: boolean
}

export interface CourseView {
  course: Course
  concepts: ConceptView[]
  edges: { from: string; to: string }[]
  readyToLearn: string[]
  issues: Issue[]
}

export interface RateInput {
  conceptId: string
  kind: ReviewKind
  rating: Rating
  source: string
  answer?: string
  grading?: Grading
  ref?: string
  ms?: number
}

export interface NewConcept {
  courseId: string
  title: string
  question?: string
  answer?: string
  /** Prerequisites: concept ids, titles or paths. */
  requires?: string[]
  importance?: 1 | 2 | 3
}

export interface ConceptPatch {
  question?: string
  answer?: string
  importance?: 1 | 2 | 3
}

export interface UpsertItem {
  title: string
  question?: string
  answer?: string
  importance?: 1 | 2 | 3
  /** Concept ids, titles or paths; titles resolve within the batch and the course first. */
  requires?: string[]
}

export interface UpsertResult {
  created: string[]
  updated: string[]
  edgesSet: number
  skipped: { concept: string; requires: string; reason: string }[]
}

export interface NewTestQuestion {
  id: string
  prompt: string
  /** Concept ids, titles or paths. */
  concepts: string[]
  points: number
  solution: string
}

export interface TestResult {
  questionId: string
  grading: Grading & { score: number }
}

/**
 * The one entry point the plugin, the MCP server and the CLI share. It owns the vault
 * index. Mutations are serialized, write plain files, and re-index only what they touched.
 */
export class Workspace {
  private index: VaultIndex
  private readonly logs = new Map<string, { mtime: number | null; entries: LogEntry[] }>()
  private queue: Promise<unknown> = Promise.resolve()

  private constructor(
    readonly fs: VaultFs,
    private readonly indexer: VaultIndexer,
    index: VaultIndex,
  ) {
    this.index = index
  }

  static async open(fs: VaultFs): Promise<Workspace> {
    const indexer = new VaultIndexer(fs)
    return new Workspace(fs, indexer, await indexer.scan())
  }

  /** Pick up external edits. Cheap when nothing changed: only modified notes are re-read. */
  refresh(): Promise<void> {
    return this.serialized(async () => {
      this.index = await this.indexer.scan()
    })
  }

  get issues(): readonly Issue[] {
    return this.index.issues
  }

  courses(): Course[] {
    return [...this.index.courses.values()].sort((a, b) => a.title.localeCompare(b.title))
  }

  course(id: string): Course {
    const course = this.index.courses.get(id)
    if (!course) throw new Easy30Error("not_found", `No course "${id}"`)
    return course
  }

  concept(id: string): Concept {
    const concept = this.index.concepts.get(id)
    if (!concept) throw new Easy30Error("not_found", `No concept "${id}"`)
    return concept
  }

  /**
   * Find a concept by id, path or title (case-insensitive). Titles prefer `courseId`;
   * a title matching several concepts throws `ambiguous` instead of guessing.
   */
  findConcept(ref: string, courseId?: string): Concept | null {
    const direct = this.index.concepts.get(ref)
    if (direct) return direct
    const target = (linkTarget(ref) ?? "").toLowerCase()
    if (target === "") return null
    const all = [...this.index.concepts.values()]
    const byPath = all.find((c) => c.path.replace(/\.md$/, "").toLowerCase() === target)
    if (byPath) return byPath
    const named = all.filter((c) => c.title.toLowerCase() === target)
    const inCourse = named.filter((c) => c.courseId === courseId)
    const pool = inCourse.length > 0 ? inCourse : named
    if (pool.length > 1) {
      throw new Easy30Error(
        "ambiguous",
        `"${ref}" matches ${pool.length} concepts (${pool.map((c) => c.path).join(", ")}); use an id or a path`,
      )
    }
    return pool[0] ?? null
  }

  /** Like `findConcept`, but throws `not_found`. */
  resolveConcept(ref: string, courseId?: string): Concept {
    const concept = this.findConcept(ref, courseId)
    if (!concept) throw new Easy30Error("not_found", `No concept "${ref}"`)
    return concept
  }

  conceptsOf(courseId: string): Concept[] {
    return [...this.index.concepts.values()].filter((c) => c.courseId === courseId)
  }

  tests(courseId: string): PracticeTest[] {
    return [...this.index.tests.values()]
      .filter((t) => t.courseId === courseId)
      .sort((a, b) => (b.created ?? "").localeCompare(a.created ?? ""))
  }

  test(id: string): PracticeTest {
    const test = this.index.tests.get(id)
    if (!test) throw new Easy30Error("not_found", `No test "${id}"`)
    return test
  }

  // ── derived state ──────────────────────────────────────────────────────────

  /** Graph over every concept in the vault (prerequisites may cross courses). */
  graph(): ConceptGraph {
    return new ConceptGraph(this.index.concepts.values())
  }

  /** A course's log (cached; re-read when the file changes on disk). */
  async log(courseId: string): Promise<LogEntry[]> {
    this.course(courseId)
    const mtime = await this.fs.mtime(logPath(courseId))
    const cached = this.logs.get(courseId)
    if (cached && mtime !== null && cached.mtime === mtime) return cached.entries
    const entries = mtime === null ? [] : (await readLog(this.fs, courseId)).entries
    this.logs.set(courseId, { mtime, entries })
    return entries
  }

  /**
   * State of every concept in the vault. All course logs are replayed together, so a
   * concept looks the same from every course (skim inference and implicit review cross
   * course boundaries). `courseId` only validates the course.
   */
  async states(courseId?: string, now: Date = new Date()): Promise<Map<string, ConceptState>> {
    if (courseId !== undefined) this.course(courseId)
    const logs = await Promise.all(this.courses().map((c) => this.log(c.id)))
    return replay(logs.flat(), this.graph(), now)
  }

  async view(courseId: string, now: Date = new Date()): Promise<CourseView> {
    const course = this.course(courseId)
    const own = this.conceptsOf(courseId)
    const ownIds = new Set(own.map((c) => c.id))
    const externalIds = new Set(
      own.flatMap((c) => c.requires).filter((id) => !ownIds.has(id) && this.index.concepts.has(id)),
    )
    const members = [...own, ...[...externalIds].map((id) => this.concept(id))]
    const states = await this.states(courseId, now)
    const graph = this.graph()
    const concepts = members.map((c) => ({
      ...c,
      state: states.get(c.id) ?? blankState(c.id),
      external: !ownIds.has(c.id),
    }))
    const edges = own.flatMap((c) =>
      c.requires
        .filter((p) => ownIds.has(p) || externalIds.has(p))
        .map((p) => ({ from: p, to: c.id })),
    )
    const cyclic = graph.cyclicNodes()
    const memberPaths = new Set([course.path, ...members.map((c) => c.path)])
    const issues = [
      ...this.index.issues.filter((i) => memberPaths.has(i.path)),
      ...own
        .filter((c) => cyclic.has(c.id))
        .map((c) => ({ path: c.path, message: "Part of a prerequisite cycle" })),
      ...own.flatMap((c) =>
        c.unresolved.map((link) => ({
          path: c.path,
          message: `Unresolved prerequisite [[${link}]]`,
        })),
      ),
    ]
    const ready = studyPlan(own, graph, states, now).next
    return { course, concepts, edges, readyToLearn: ready, issues }
  }

  async plan(courseId: string, now: Date = new Date()): Promise<StudyPlan> {
    const states = await this.states(courseId, now)
    return studyPlan(this.conceptsOf(courseId), this.graph(), states, now)
  }

  async skimQueue(courseId: string, opts: { includeInferred?: boolean } = {}): Promise<string[]> {
    const states = await this.states(courseId)
    return skimQueue(this.conceptsOf(courseId), this.graph(), states, opts)
  }

  /** Rating entries for a course, newest first. */
  async history(
    courseId: string,
    opts: { conceptId?: string; limit?: number } = {},
  ): Promise<RatingEntry[]> {
    const entries = await this.log(courseId)
    const voided = new Set(entries.flatMap((e) => (e.kind === "void" ? [e.target] : [])))
    return entries
      .filter((e): e is RatingEntry => e.kind !== "void" && !voided.has(e.id))
      .filter((e) => opts.conceptId === undefined || e.concept === opts.conceptId)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, opts.limit ?? 100)
  }

  // ── progress ───────────────────────────────────────────────────────────────

  /** Record a rating. Returns the concept's new state plus every other concept whose
   * state changed (skim inference, implicit review). */
  rate(
    input: RateInput,
    now: Date = new Date(),
  ): Promise<{ entry: RatingEntry; changed: ConceptState[] }> {
    return this.serialized(async () => {
      if (input.kind === "skim" && input.rating > 3) {
        throw new Easy30Error("invalid", "Skim ratings are 1 (didn't know), 2 (kinda), 3 (knew it)")
      }
      const concept = await this.storeConceptId(this.concept(input.conceptId))
      const courseId = await this.storeCourseId(this.requireCourse(concept))
      const before = await this.states(courseId, now)
      const entry = ratingEntry(concept.id, input, now)
      await appendLog(this.fs, courseId, entry)
      const after = await this.states(courseId, now)
      const changed = [...after.values()].filter(
        (s) => s.conceptId === concept.id || !sameState(before.get(s.conceptId), s),
      )
      return { entry, changed }
    })
  }

  /** Retract a previous rating (undo). */
  retract(
    courseId: string,
    entryId: string,
    source: string,
    now: Date = new Date(),
  ): Promise<void> {
    return this.serialized(async () => {
      const entries = await this.log(courseId)
      if (!entries.some((e) => e.id === entryId && e.kind !== "void")) {
        throw new Easy30Error("not_found", `No log entry "${entryId}" in ${courseId}`)
      }
      await appendLog(this.fs, courseId, {
        v: 1,
        id: newEntryId(now),
        at: now.toISOString(),
        source,
        kind: "void",
        target: entryId,
      })
    })
  }

  // ── authoring ──────────────────────────────────────────────────────────────

  createCourse(input: {
    title: string
    id?: string
    folder?: string
    exam?: string
    language?: string
    sources?: string[]
  }): Promise<Course> {
    return this.serialized(async () => {
      const title = input.title.trim()
      if (!title) throw new Easy30Error("invalid", "Course title is empty")
      const id = input.id ?? slugify(title)
      if (!isSafeId(id)) throw new Easy30Error("invalid", `Invalid course id "${id}"`)
      if (this.index.courses.has(id)) {
        throw new Easy30Error("conflict", `Course "${id}" already exists`)
      }
      const folder = (input.folder ?? joinPath("Easy30", safeFileName(title))).replace(
        /^\/+|\/+$/g,
        "",
      )
      if (isHiddenPath(folder) || folder.split("/").includes("..")) {
        throw new Easy30Error("invalid", `Invalid folder "${folder}"`)
      }
      const fm: Record<string, unknown> = { easy30: "course", id, title }
      if (input.exam) fm.exam = input.exam
      if (input.language) fm.language = input.language
      if (input.sources?.length) fm.sources = input.sources
      const check = CourseFrontmatterSchema.safeParse(fm)
      if (!check.success) throw new Easy30Error("invalid", describeError(check.error))
      const path = joinPath(folder, `${safeFileName(title)}.md`)
      await this.createFile(path, composeNote(fm, ""))
      await this.touch([path])
      return this.course(id)
    })
  }

  createConcept(input: NewConcept): Promise<Concept> {
    return this.serialized(async () => {
      const courseId = await this.storeCourseId(input.courseId)
      const requires = await this.storeConceptIds(input.requires ?? [], courseId)
      const concept = await this.writeNewConcept(courseId, input)
      if (requires.length === 0) return concept
      await this.writeRequires(concept, requires)
      return this.concept(concept.id)
    })
  }

  updateConcept(id: string, patch: ConceptPatch): Promise<Concept> {
    return this.serialized(async () => {
      const concept = await this.storeConceptId(this.concept(id))
      await this.patchConceptNote(concept, patch)
      await this.touch([concept.path])
      return this.concept(concept.id)
    })
  }

  /**
   * Create or update many concepts in one go (graph generation). Concepts are matched by
   * title within the course. Prerequisites are set after every concept exists; edges
   * that don't resolve or would create a cycle are skipped and reported, never fatal.
   */
  upsertConcepts(
    courseId: string,
    items: UpsertItem[],
    opts: { replaceRequires?: boolean } = {},
  ): Promise<UpsertResult> {
    return this.serialized(async () => {
      const course = await this.storeCourseId(courseId)
      const result: UpsertResult = { created: [], updated: [], edgesSet: 0, skipped: [] }
      const byTitle = new Map(
        this.conceptsOf(course).map((c) => [c.title.toLowerCase(), c] as const),
      )
      const batch: { item: UpsertItem; conceptId: string }[] = []

      for (const item of items) {
        const title = safeFileName(item.title)
        if (!title) {
          result.skipped.push({ concept: item.title, requires: "", reason: "empty title" })
          continue
        }
        const existing = byTitle.get(title.toLowerCase())
        if (existing) {
          const concept = await this.storeConceptId(existing)
          await this.patchConceptNote(concept, item)
          await this.touch([concept.path])
          byTitle.set(title.toLowerCase(), concept)
          result.updated.push(concept.title)
          batch.push({ item, conceptId: concept.id })
        } else {
          const concept = await this.writeNewConcept(course, item)
          byTitle.set(title.toLowerCase(), concept)
          result.created.push(concept.title)
          batch.push({ item, conceptId: concept.id })
        }
      }

      const graph = this.graph()
      for (const { item, conceptId } of batch) {
        if (item.requires === undefined) continue
        const current = this.concept(conceptId)
        const wanted: string[] = opts.replaceRequires === false ? [...current.requires] : []
        for (const ref of item.requires) {
          const target = byTitle.get(safeFileName(ref).toLowerCase()) ?? this.tryFind(ref, course)
          if (!target) {
            result.skipped.push({ concept: current.title, requires: ref, reason: "not found" })
          } else if (graph.wouldCycle(target.id, conceptId)) {
            result.skipped.push({
              concept: current.title,
              requires: ref,
              reason: "would create a cycle",
            })
          } else if (!wanted.includes(target.id)) {
            wanted.push(target.id)
          }
        }
        const stored = await this.storeConceptIds(wanted, course)
        await this.writeRequires(this.concept(conceptId), stored)
        graph.replacePrerequisites(conceptId, stored)
        result.edgesSet += stored.length
      }
      return result
    })
  }

  /** Replace a concept's prerequisites. Refuses edges that would create a cycle.
   * Unresolved links and aliases in `requires` are kept as written. */
  setRequires(id: string, prerequisites: string[]): Promise<Concept> {
    return this.serialized(async () => {
      const concept = await this.storeConceptId(this.concept(id))
      const wanted = await this.storeConceptIds([...new Set(prerequisites)], concept.courseId)
      const graph = this.graph()
      graph.replacePrerequisites(concept.id, [])
      for (const p of wanted) {
        if (graph.wouldCycle(p, concept.id)) {
          throw new Easy30Error(
            "cycle",
            `"${this.concept(p).title}" depends on "${concept.title}": that would create a cycle`,
          )
        }
      }
      await this.writeRequires(this.concept(concept.id), wanted)
      return this.concept(concept.id)
    })
  }

  addPrerequisite(id: string, prerequisite: string): Promise<Concept> {
    const concept = this.concept(id)
    return this.setRequires(id, [...concept.requires, prerequisite])
  }

  removePrerequisite(id: string, prerequisite: string): Promise<Concept> {
    const concept = this.concept(id)
    const target = this.resolveConcept(prerequisite, concept.courseId ?? undefined)
    return this.setRequires(
      id,
      concept.requires.filter((p) => p !== target.id),
    )
  }

  /** Rename a concept note. Links in other concepts' `requires` follow it (unless the
   * platform already rewrote them, as Obsidian does), keeping headings and aliases. */
  renameConcept(id: string, newTitle: string): Promise<Concept> {
    return this.serialized(async () => {
      const concept = await this.storeConceptId(this.concept(id))
      const title = safeFileName(newTitle)
      if (!title) throw new Easy30Error("invalid", "Concept title is empty")
      const path = joinPath(dirname(concept.path), `${title}.md`)
      if (path === concept.path) return concept
      const oldTargets = new Set([
        concept.title.toLowerCase(),
        concept.path.replace(/\.md$/, "").toLowerCase(),
      ])
      const dependents = [...this.index.concepts.values()].filter((c) =>
        c.requires.includes(concept.id),
      )
      try {
        await this.fs.rename(concept.path, path)
      } catch (error) {
        if (error instanceof FileExistsError) {
          throw new Easy30Error("conflict", `${path} already exists`)
        }
        throw error
      }
      await this.touch([concept.path, path, ...dependents.map((d) => d.path)])
      const target = this.hasTitleClash(concept.id, title) ? path.replace(/\.md$/, "") : title
      for (const d of dependents) {
        const fresh = this.concept(d.id)
        if (fresh.requires.includes(concept.id)) continue
        const requires = fresh.requirements.map((r) =>
          r.id === null && oldTargets.has((linkTarget(r.raw) ?? "").toLowerCase())
            ? retargetLink(r.raw, target)
            : r.raw,
        )
        await this.fs.update(fresh.path, (source) => updateFrontmatter(source, { requires }))
      }
      await this.touch(dependents.map((d) => d.path))
      return this.concept(concept.id)
    })
  }

  /** Delete a concept note and drop it from other concepts' prerequisites.
   * Its review history stays in the log (it is simply ignored). */
  deleteConcept(id: string): Promise<void> {
    return this.serialized(async () => {
      const concept = this.concept(id)
      const dependents = [...this.index.concepts.values()].filter((c) =>
        c.requires.includes(concept.id),
      )
      for (const d of dependents) {
        await this.writeRequires(
          d,
          d.requires.filter((p) => p !== concept.id),
        )
      }
      await this.fs.remove(concept.path)
      await this.touch([concept.path])
    })
  }

  /** Write ids into course and concept notes that lack one. Returns how many were written. */
  assignIds(courseId?: string): Promise<number> {
    return this.serialized(async () => {
      let written = 0
      for (const course of this.courses()) {
        if (course.hasStoredId || (courseId !== undefined && course.id !== courseId)) continue
        await this.storeCourseId(course.id)
        written++
      }
      const missing = [...this.index.concepts.values()].filter(
        (c) => !c.hasStoredId && (courseId === undefined || c.courseId === courseId),
      )
      for (const c of missing) await this.storeConceptId(c)
      return written + missing.length
    })
  }

  // ── practice tests ─────────────────────────────────────────────────────────

  /** Create a test note; solutions go to a hidden file until the test is graded. */
  createTest(input: {
    courseId: string
    title: string
    intro?: string
    questions: NewTestQuestion[]
    date?: string
  }): Promise<PracticeTest> {
    return this.serialized(async () => {
      const courseId = await this.storeCourseId(input.courseId)
      const course = this.course(courseId)
      if (input.questions.length === 0) {
        throw new Easy30Error("invalid", "A test needs at least one question")
      }
      const qids = input.questions.map((q) => q.id)
      if (new Set(qids).size !== qids.length) {
        throw new Easy30Error("invalid", "Question ids must be unique")
      }
      const questions: NewTestQuestion[] = []
      for (const q of input.questions) {
        if (!isSafeId(q.id)) {
          throw new Easy30Error("invalid", `Question id "${q.id}": letters, digits, - and _ only`)
        }
        if (!(q.points > 0)) {
          throw new Easy30Error("invalid", `Question ${q.id}: points must be positive`)
        }
        questions.push({ ...q, concepts: await this.storeConceptIds(q.concepts, courseId) })
      }
      const id = newTestId()
      const date = input.date ?? new Date().toISOString().slice(0, 10)
      const path = joinPath(dirname(course.path), "tests", `${safeFileName(input.title)}.md`)
      const body = [
        input.intro?.trim() ?? "",
        ...questions.map(
          (q) => `## ${q.id} · ${q.points} pt\n\n${q.prompt.trim()}\n\n### Answer\n\n`,
        ),
      ]
        .filter(Boolean)
        .join("\n")
      const fm = {
        easy30: "test",
        id,
        course: courseId,
        created: date,
        status: "open",
        questions: questions.map((q) => ({ id: q.id, concepts: q.concepts, points: q.points })),
      }
      const solutions = questions.map((q) => `## ${q.id}\n\n${q.solution.trim()}\n`).join("\n")
      await this.createFile(path, composeNote(fm, body))
      await this.fs.write(this.solutionPath(id), `# Solutions: ${input.title}\n\n${solutions}`)
      await this.touch([path])
      return this.test(id)
    })
  }

  async testSolutions(testId: string): Promise<string | null> {
    this.test(testId)
    return this.fs.read(this.solutionPath(testId))
  }

  /**
   * Grade a test: every question exactly once; `correct` only when the answer and the
   * reasoning are both right. Everything is validated before anything is written; then
   * one rating per question concept is logged (one write per course) and the note updated.
   */
  gradeTest(
    input: { testId: string; source: string; results: TestResult[]; report: string },
    now: Date = new Date(),
  ): Promise<PracticeTest> {
    return this.serialized(async () => {
      const test = this.test(input.testId)
      if (test.status === "graded") {
        throw new Easy30Error("conflict", `Test "${test.id}" is already graded`)
      }
      const results = new Map(input.results.map((r) => [r.questionId, r] as const))
      if (results.size !== input.results.length) {
        throw new Easy30Error("invalid", "Each question may be graded only once")
      }
      for (const r of input.results) {
        const q = test.questions.find((x) => x.id === r.questionId)
        if (!q) throw new Easy30Error("invalid", `Unknown question "${r.questionId}"`)
        const g = r.grading
        if (!(g.score >= 0 && g.score <= q.points)) {
          throw new Easy30Error("invalid", `Question ${q.id}: score must be 0–${q.points}`)
        }
        if (
          g.verdict === "correct" &&
          (g.answerCorrect === false || g.reasoningCorrect === false)
        ) {
          throw new Easy30Error(
            "invalid",
            `Question ${q.id}: "correct" requires a correct answer and correct reasoning`,
          )
        }
      }
      const missing = test.questions.filter((q) => !results.has(q.id)).map((q) => q.id)
      if (missing.length) {
        throw new Easy30Error("invalid", `Missing results for ${missing.join(", ")}`)
      }

      const byCourse = new Map<string, LogEntry[]>()
      let tick = 0
      for (const q of test.questions) {
        const result = results.get(q.id)
        if (!result) continue
        for (const conceptId of q.concepts) {
          const concept = this.index.concepts.get(conceptId)
          // Concepts deleted since the test was written are skipped.
          if (!concept?.courseId || !this.index.courses.has(concept.courseId)) continue
          const entry = ratingEntry(
            concept.id,
            {
              conceptId: concept.id,
              kind: "test",
              rating: verdictRating(result.grading.verdict),
              source: input.source,
              grading: { ...result.grading, max: q.points },
              ref: test.id,
            },
            new Date(now.getTime() + tick++),
          )
          byCourse.set(concept.courseId, [...(byCourse.get(concept.courseId) ?? []), entry])
        }
      }
      for (const [courseId, entries] of byCourse) await appendLog(this.fs, courseId, entries)

      const score = input.results.reduce((s, r) => s + r.grading.score, 0)
      const max = test.questions.reduce((s, q) => s + q.points, 0)
      const solutions = (await this.fs.read(this.solutionPath(test.id))) ?? ""
      const appendix = [
        `## Grading · ${score}/${max}`,
        input.report.trim(),
        solutions.replace(/^# .*\n/, "## Solutions\n").trim(),
      ]
        .filter(Boolean)
        .join("\n\n")
      await this.fs.update(test.path, (source) => {
        const updated = updateFrontmatter(source, { status: "graded", score, max })
        return `${updated.trimEnd()}\n\n${appendix}\n`
      })
      await this.touch([test.path])
      return this.test(test.id)
    })
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Run mutations one at a time, in call order (a failure doesn't block the queue). */
  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => undefined)
    return run
  }

  private async touch(paths: string[]): Promise<void> {
    this.index = await this.indexer.touch(paths)
  }

  private async createFile(path: string, content: string): Promise<void> {
    try {
      await this.fs.create(path, content)
    } catch (error) {
      if (error instanceof FileExistsError) {
        throw new Easy30Error("conflict", `${path} already exists`)
      }
      throw error
    }
  }

  private async writeNewConcept(courseId: string, input: UpsertItem): Promise<Concept> {
    const course = this.course(courseId)
    const title = safeFileName(input.title)
    if (!title) throw new Easy30Error("invalid", "Concept title is empty")
    if (this.conceptsOf(course.id).some((c) => c.title.toLowerCase() === title.toLowerCase())) {
      throw new Easy30Error("conflict", `Concept "${title}" already exists in ${course.id}`)
    }
    const path = joinPath(dirname(course.path), "concepts", `${title}.md`)
    const id = newConceptId()
    const fm: Record<string, unknown> = {
      easy30: "concept",
      id,
      course: course.id,
      question: input.question?.trim() ?? "",
      importance: input.importance ?? 2,
    }
    await this.createFile(path, composeNote(fm, input.answer?.trim() ?? ""))
    await this.touch([path])
    return this.concept(id)
  }

  private async patchConceptNote(concept: Concept, patch: ConceptPatch): Promise<void> {
    const fm: Record<string, unknown> = {}
    if (patch.question !== undefined) fm.question = patch.question.trim()
    if (patch.importance !== undefined) fm.importance = patch.importance
    if (Object.keys(fm).length === 0 && patch.answer === undefined) return
    await this.fs.update(concept.path, (source) => {
      const withFm = Object.keys(fm).length ? updateFrontmatter(source, fm) : source
      return patch.answer === undefined ? withFm : replaceBody(withFm, patch.answer.trim())
    })
  }

  /** Rewrite `requires` to exactly `wanted` (stored ids), keeping the original text of
   * the entries that stay, and every unresolved entry. */
  private async writeRequires(concept: Concept, wanted: string[]): Promise<void> {
    const keep = new Set(wanted)
    const emitted = new Set<string>()
    const entries: string[] = []
    for (const r of concept.requirements) {
      if (r.id === null) {
        entries.push(r.raw)
      } else if (keep.has(r.id) && !emitted.has(r.id)) {
        entries.push(r.raw)
        emitted.add(r.id)
      }
    }
    for (const id of wanted) if (!emitted.has(id)) entries.push(this.linkTo(id))
    await this.fs.update(concept.path, (source) =>
      updateFrontmatter(source, { requires: entries.length ? entries : undefined }),
    )
    await this.touch([concept.path])
  }

  private solutionPath(testId: string): string {
    assertSafeId(testId)
    return `${STATE_DIR}/solutions/${testId}.md`
  }

  private requireCourse(concept: Concept): string {
    if (!concept.courseId || !this.index.courses.has(concept.courseId)) {
      throw new Easy30Error("invalid", `"${concept.title}" is not in a known course`)
    }
    return concept.courseId
  }

  /** Make a course's id permanent: a derived id would change if the note were renamed,
   * orphaning its log. */
  private async storeCourseId(courseId: string): Promise<string> {
    const course = this.course(courseId)
    if (course.hasStoredId) return course.id
    await this.fs.update(course.path, (source) => updateFrontmatter(source, { id: course.id }))
    await this.touch([course.path])
    return course.id
  }

  /** Ensure a concept has an id written in its note before anything refers to it. */
  private async storeConceptId(concept: Concept): Promise<Concept> {
    if (concept.hasStoredId) return concept
    const id = newConceptId()
    await this.fs.update(concept.path, (source) => updateFrontmatter(source, { id }))
    await this.touch([concept.path])
    return this.concept(id)
  }

  private async storeConceptIds(refs: string[], courseId: string | null): Promise<string[]> {
    const out: string[] = []
    for (const ref of refs) {
      const concept = this.resolveConcept(ref, courseId ?? undefined)
      const id = (await this.storeConceptId(concept)).id
      if (!out.includes(id)) out.push(id)
    }
    return out
  }

  private tryFind(ref: string, courseId: string): Concept | null {
    try {
      return this.findConcept(ref, courseId)
    } catch {
      return null
    }
  }

  private hasTitleClash(id: string, title: string): boolean {
    const t = title.toLowerCase()
    return [...this.index.concepts.values()].some((o) => o.id !== id && o.title.toLowerCase() === t)
  }

  /** Shortest unambiguous wikilink to a concept. */
  private linkTo(id: string): string {
    const c = this.concept(id)
    return toWikilink(this.hasTitleClash(c.id, c.title) ? c.path.replace(/\.md$/, "") : c.title)
  }
}

export function verdictRating(verdict: Grading["verdict"]): Rating {
  return verdict === "correct" ? 3 : verdict === "partial" ? 2 : 1
}

function ratingEntry(conceptId: string, input: RateInput, at: Date): RatingEntry {
  return {
    v: 1,
    id: newEntryId(at),
    at: at.toISOString(),
    source: input.source,
    kind: input.kind,
    concept: conceptId,
    rating: input.rating,
    ...(input.answer !== undefined && { answer: input.answer }),
    ...(input.grading !== undefined && { grading: input.grading }),
    ...(input.ref !== undefined && { ref: input.ref }),
    ...(input.ms !== undefined && { ms: Math.max(0, Math.round(input.ms)) }),
  }
}

function blankState(conceptId: string): ConceptState {
  return {
    conceptId,
    mastery: "unknown",
    inferred: null,
    lastRating: null,
    lastReviewed: null,
    due: null,
    retrievability: null,
    stability: null,
    difficulty: null,
    reps: 0,
    lapses: 0,
  }
}

function sameState(a: ConceptState | undefined, b: ConceptState): boolean {
  return (
    a !== undefined &&
    a.mastery === b.mastery &&
    a.inferred === b.inferred &&
    a.due?.getTime() === b.due?.getTime()
  )
}
