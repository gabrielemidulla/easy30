import { composeNote, replaceBody, updateFrontmatter } from "./frontmatter.js"
import { dirname, joinPath, type VaultFs } from "./fs.js"
import { ConceptGraph } from "./graph.js"
import { newConceptId, newEntryId, newTestId, safeFileName, slugify } from "./ids.js"
import { linkTarget, toWikilink } from "./links.js"
import { appendLog, assertSafeId, readLog, STATE_DIR } from "./log.js"
import { type StudyPlan, skimQueue, studyPlan } from "./planner.js"
import { type ConceptState, replay } from "./scheduler.js"
import type { Grading, LogEntry, Rating, RatingEntry, ReviewKind } from "./schema.js"
import {
  type Concept,
  type Course,
  type Issue,
  loadVault,
  type PracticeTest,
  type VaultIndex,
} from "./vault.js"

export class Easy30Error extends Error {
  constructor(
    readonly code: "not_found" | "cycle" | "conflict" | "invalid",
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
  /** Prerequisite concept ids. */
  requires?: string[]
  importance?: 1 | 2 | 3
}

export interface ConceptPatch {
  question?: string
  answer?: string
  importance?: 1 | 2 | 3
}

export interface NewTestQuestion {
  id: string
  prompt: string
  concepts: string[]
  points: number
  solution: string
}

/**
 * The one entry point the plugin, the MCP server and the CLI share. It owns the
 * vault index; every mutation writes plain files and then re-reads the vault.
 */
export class Workspace {
  private index: VaultIndex
  private logs = new Map<string, LogEntry[]>()

  private constructor(
    readonly fs: VaultFs,
    index: VaultIndex,
  ) {
    this.index = index
  }

  static async open(fs: VaultFs): Promise<Workspace> {
    return new Workspace(fs, await loadVault(fs))
  }

  /** Re-scan the vault (call after external edits). */
  async refresh(): Promise<void> {
    this.index = await loadVault(this.fs)
    this.logs.clear()
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

  /** Find a concept by id, file name or path (case-insensitive). */
  findConcept(ref: string, courseId?: string): Concept | null {
    const direct = this.index.concepts.get(ref)
    if (direct) return direct
    const target = (linkTarget(ref) ?? "").toLowerCase()
    const all = [...this.index.concepts.values()]
    return (
      all.find((c) => c.path.replace(/\.md$/, "").toLowerCase() === target) ??
      all.find((c) => c.title.toLowerCase() === target && c.courseId === courseId) ??
      all.find((c) => c.title.toLowerCase() === target) ??
      null
    )
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

  async log(courseId: string): Promise<LogEntry[]> {
    this.course(courseId)
    const cached = this.logs.get(courseId)
    if (cached) return cached
    const { entries } = await readLog(this.fs, courseId)
    this.logs.set(courseId, entries)
    return entries
  }

  async states(courseId: string, now: Date = new Date()): Promise<Map<string, ConceptState>> {
    return replay(await this.allEntriesFor(courseId), this.graph(), now)
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
    const issues = [
      ...this.index.issues.filter(
        (i) => members.some((c) => c.path === i.path) || i.path === course.path,
      ),
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
    return studyPlan(this.conceptsOf(courseId), this.graph(), await this.states(courseId, now), now)
  }

  async skimQueue(courseId: string, opts: { includeInferred?: boolean } = {}): Promise<string[]> {
    return skimQueue(this.conceptsOf(courseId), this.graph(), await this.states(courseId), opts)
  }

  /** Rating entries for a course, newest first. */
  async history(
    courseId: string,
    opts: { conceptId?: string; limit?: number } = {},
  ): Promise<RatingEntry[]> {
    const voided = new Set(
      (await this.log(courseId)).flatMap((e) => (e.kind === "void" ? [e.target] : [])),
    )
    return (await this.log(courseId))
      .filter((e): e is RatingEntry => e.kind !== "void" && !voided.has(e.id))
      .filter((e) => opts.conceptId === undefined || e.concept === opts.conceptId)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, opts.limit ?? 100)
  }

  // ── progress ───────────────────────────────────────────────────────────────

  /** Record a rating. Returns the concept's new state plus every other concept whose
   * state changed (skim inference, implicit review). */
  async rate(
    input: RateInput,
    now: Date = new Date(),
  ): Promise<{ entry: RatingEntry; changed: ConceptState[] }> {
    const concept = await this.withStoredId(this.concept(input.conceptId))
    const courseId = this.requireCourse(concept)
    const before = await this.states(courseId, now)
    const entry: RatingEntry = {
      v: 1,
      id: newEntryId(now),
      at: now.toISOString(),
      source: input.source,
      kind: input.kind,
      concept: concept.id,
      rating: input.rating,
      ...(input.answer !== undefined && { answer: input.answer }),
      ...(input.grading !== undefined && { grading: input.grading }),
      ...(input.ref !== undefined && { ref: input.ref }),
      ...(input.ms !== undefined && { ms: Math.round(input.ms) }),
    }
    await appendLog(this.fs, courseId, entry)
    this.logs.delete(courseId)
    const after = await this.states(courseId, now)
    const changed = [...after.values()].filter(
      (s) => s.conceptId === concept.id || !sameState(before.get(s.conceptId), s),
    )
    return { entry, changed }
  }

  /** Retract a previous rating (undo). */
  async retract(
    courseId: string,
    entryId: string,
    source: string,
    now: Date = new Date(),
  ): Promise<void> {
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
    this.logs.delete(courseId)
  }

  // ── authoring ──────────────────────────────────────────────────────────────

  async createCourse(input: {
    title: string
    id?: string
    folder?: string
    exam?: string
    language?: string
    sources?: string[]
  }): Promise<Course> {
    const id = input.id ?? slugify(input.title)
    assertSafeId(id)
    if (this.index.courses.has(id))
      throw new Easy30Error("conflict", `Course "${id}" already exists`)
    const title = input.title.trim()
    const folder = input.folder ?? joinPath("Easy30", safeFileName(title))
    const path = joinPath(folder, `${safeFileName(title)}.md`)
    if (await this.fs.exists(path)) throw new Easy30Error("conflict", `${path} already exists`)
    const fm: Record<string, unknown> = { easy30: "course", id, title }
    if (input.exam) fm.exam = input.exam
    if (input.language) fm.language = input.language
    if (input.sources?.length) fm.sources = input.sources
    await this.fs.write(path, composeNote(fm, ""))
    await this.refresh()
    return this.course(id)
  }

  async createConcept(input: NewConcept): Promise<Concept> {
    const course = this.course(input.courseId)
    const title = safeFileName(input.title)
    if (!title) throw new Easy30Error("invalid", "Concept title is empty")
    const existing = this.findConcept(title, course.id)
    if (
      existing &&
      existing.courseId === course.id &&
      existing.title.toLowerCase() === title.toLowerCase()
    ) {
      throw new Easy30Error("conflict", `Concept "${title}" already exists in ${course.id}`)
    }
    const requires = await this.storedIds(input.requires ?? [])
    const path = joinPath(dirname(course.path), "concepts", `${title}.md`)
    if (await this.fs.exists(path)) throw new Easy30Error("conflict", `${path} already exists`)
    const id = newConceptId()
    const fm: Record<string, unknown> = { easy30: "concept", id, course: course.id }
    fm.question = input.question?.trim() ?? ""
    if (requires.length) fm.requires = requires.map((r) => this.linkTo(r))
    fm.importance = input.importance ?? 2
    await this.fs.write(path, composeNote(fm, input.answer?.trim() ?? ""))
    await this.refresh()
    return this.concept(id)
  }

  async updateConcept(id: string, patch: ConceptPatch): Promise<Concept> {
    const concept = await this.withStoredId(this.concept(id))
    let source = (await this.fs.read(concept.path)) ?? ""
    const fm: Record<string, unknown> = {}
    if (patch.question !== undefined) fm.question = patch.question.trim()
    if (patch.importance !== undefined) fm.importance = patch.importance
    if (Object.keys(fm).length) source = updateFrontmatter(source, fm)
    if (patch.answer !== undefined) source = replaceBody(source, patch.answer.trim())
    await this.fs.write(concept.path, source)
    await this.refresh()
    return this.concept(concept.id)
  }

  /** Replace a concept's prerequisites. Refuses edges that would create a cycle. */
  async setRequires(id: string, prerequisiteIds: string[]): Promise<Concept> {
    const concept = await this.withStoredId(this.concept(id))
    const wanted = await this.storedIds([...new Set(prerequisiteIds)])
    const graph = new ConceptGraph(
      [...this.index.concepts.values()].map((c) =>
        c.id === concept.id ? { id: c.id, requires: [] } : c,
      ),
    )
    for (const p of wanted) {
      if (graph.wouldCycle(p, concept.id)) {
        throw new Easy30Error(
          "cycle",
          `"${this.concept(p).title}" depends on "${concept.title}": that would create a cycle`,
        )
      }
    }
    const source = (await this.fs.read(concept.path)) ?? ""
    const links = wanted.map((p) => this.linkTo(p))
    await this.fs.write(
      concept.path,
      updateFrontmatter(source, { requires: links.length ? links : undefined }),
    )
    await this.refresh()
    return this.concept(concept.id)
  }

  async addPrerequisite(id: string, prerequisiteId: string): Promise<Concept> {
    const concept = this.concept(id)
    return this.setRequires(id, [...concept.requires, prerequisiteId])
  }

  async removePrerequisite(id: string, prerequisiteId: string): Promise<Concept> {
    const concept = this.concept(id)
    return this.setRequires(
      id,
      concept.requires.filter((p) => p !== prerequisiteId),
    )
  }

  /** Rename a concept note and rewrite `requires` links that point at it. */
  async renameConcept(id: string, newTitle: string): Promise<Concept> {
    const concept = await this.withStoredId(this.concept(id))
    const title = safeFileName(newTitle)
    if (!title) throw new Easy30Error("invalid", "Concept title is empty")
    const path = joinPath(dirname(concept.path), `${title}.md`)
    if (path === concept.path) return concept
    const dependents = [...this.index.concepts.values()].filter((c) =>
      c.requires.includes(concept.id),
    )
    await this.fs.rename(concept.path, path)
    await this.refresh()
    for (const d of dependents) await this.setRequires(d.id, d.requires)
    return this.concept(concept.id)
  }

  /** Delete a concept note and drop it from other concepts' prerequisites.
   * Its review history stays in the log (it is simply ignored). */
  async deleteConcept(id: string): Promise<void> {
    const concept = this.concept(id)
    const dependents = [...this.index.concepts.values()].filter((c) =>
      c.requires.includes(concept.id),
    )
    for (const d of dependents) await this.removePrerequisite(d.id, concept.id)
    await this.fs.remove(concept.path)
    await this.refresh()
  }

  /** Write ids into concept notes that lack one. Returns how many were written. */
  async assignIds(courseId?: string): Promise<number> {
    const missing = [...this.index.concepts.values()].filter(
      (c) => !c.hasStoredId && (courseId === undefined || c.courseId === courseId),
    )
    for (const c of missing) {
      const source = (await this.fs.read(c.path)) ?? ""
      await this.fs.write(c.path, updateFrontmatter(source, { id: newConceptId() }))
    }
    if (missing.length) await this.refresh()
    return missing.length
  }

  // ── practice tests ─────────────────────────────────────────────────────────

  /** Create a test note; solutions go to a hidden file until the test is graded. */
  async createTest(input: {
    courseId: string
    title: string
    intro?: string
    questions: NewTestQuestion[]
    date?: string
  }): Promise<PracticeTest> {
    const course = this.course(input.courseId)
    if (input.questions.length === 0)
      throw new Easy30Error("invalid", "A test needs at least one question")
    const ids = new Set(input.questions.map((q) => q.id))
    if (ids.size !== input.questions.length)
      throw new Easy30Error("invalid", "Question ids must be unique")
    for (const q of input.questions) for (const c of q.concepts) this.concept(c)
    const id = newTestId()
    const date = input.date ?? new Date().toISOString().slice(0, 10)
    const path = joinPath(dirname(course.path), "tests", `${safeFileName(input.title)}.md`)
    if (await this.fs.exists(path)) throw new Easy30Error("conflict", `${path} already exists`)
    const body = [
      input.intro?.trim() ?? "",
      ...input.questions.map(
        (q) => `## ${q.id} · ${q.points} pt\n\n${q.prompt.trim()}\n\n### Answer\n\n`,
      ),
    ]
      .filter(Boolean)
      .join("\n")
    const fm = {
      easy30: "test",
      id,
      course: course.id,
      created: date,
      status: "open",
      questions: input.questions.map((q) => ({ id: q.id, concepts: q.concepts, points: q.points })),
    }
    await this.fs.write(path, composeNote(fm, body))
    const solutions = input.questions.map((q) => `## ${q.id}\n\n${q.solution.trim()}\n`).join("\n")
    await this.fs.write(this.solutionPath(id), `# Solutions: ${input.title}\n\n${solutions}`)
    await this.refresh()
    return this.test(id)
  }

  async testSolutions(testId: string): Promise<string | null> {
    this.test(testId)
    return this.fs.read(this.solutionPath(testId))
  }

  /** Mark a test graded: writes the score, appends the report and the solutions to
   * the note, and records one rating per question concept. */
  async gradeTest(input: {
    testId: string
    source: string
    results: { questionId: string; grading: Grading & { score: number } }[]
    report: string
  }): Promise<PracticeTest> {
    const test = this.test(input.testId)
    const byId = new Map(test.questions.map((q) => [q.id, q]))
    for (const r of input.results) {
      if (!byId.has(r.questionId))
        throw new Easy30Error("invalid", `Unknown question "${r.questionId}"`)
    }
    for (const r of input.results) {
      const q = byId.get(r.questionId)
      for (const conceptId of q?.concepts ?? []) {
        await this.rate({
          conceptId,
          kind: "test",
          rating: verdictRating(r.grading.verdict),
          source: input.source,
          grading: { ...r.grading, max: q?.points ?? r.grading.max },
          ref: test.id,
        })
      }
    }
    const score = input.results.reduce((s, r) => s + r.grading.score, 0)
    const max = test.questions.reduce((s, q) => s + q.points, 0)
    const source = (await this.fs.read(test.path)) ?? ""
    const solutions = (await this.testSolutions(test.id)) ?? ""
    const updated = updateFrontmatter(source, { status: "graded", score, max })
    const appendix = `\n## Grading · ${score}/${max}\n\n${input.report.trim()}\n\n${solutions.replace(/^# .*\n/, "## Solutions\n")}`
    await this.fs.write(test.path, `${updated.trimEnd()}\n${appendix}`)
    await this.refresh()
    return this.test(test.id)
  }

  // ── helpers ────────────────────────────────────────────────────────────────

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

  /** Ratings are logged in the concept's own course; external prerequisites of this
   * course are rated in theirs, so merge those logs in when replaying. */
  private async allEntriesFor(courseId: string): Promise<LogEntry[]> {
    const own = new Set(this.conceptsOf(courseId).map((c) => c.id))
    const foreign = new Set<string>()
    for (const id of own) {
      for (const p of this.concept(id).requires) {
        const c = this.index.concepts.get(p)
        if (c?.courseId && c.courseId !== courseId && this.index.courses.has(c.courseId))
          foreign.add(c.courseId)
      }
    }
    const lists = await Promise.all([courseId, ...foreign].map((id) => this.log(id)))
    return lists.flat()
  }

  /** Ensure a concept has an id written in its note before anything refers to it. */
  private async withStoredId(concept: Concept): Promise<Concept> {
    if (concept.hasStoredId) return concept
    const id = newConceptId()
    const source = (await this.fs.read(concept.path)) ?? ""
    await this.fs.write(concept.path, updateFrontmatter(source, { id }))
    await this.refresh()
    return this.concept(id)
  }

  private async storedIds(ids: string[]): Promise<string[]> {
    const out: string[] = []
    for (const ref of ids) {
      const c = this.findConcept(ref)
      if (!c) throw new Easy30Error("not_found", `No concept "${ref}"`)
      out.push((await this.withStoredId(c)).id)
    }
    return out
  }

  /** Shortest unambiguous wikilink to a concept. */
  private linkTo(id: string): string {
    const c = this.concept(id)
    const clash = [...this.index.concepts.values()].some(
      (o) => o.id !== c.id && o.title.toLowerCase() === c.title.toLowerCase(),
    )
    return toWikilink(clash ? c.path.replace(/\.md$/, "") : c.title)
  }
}

export function verdictRating(verdict: Grading["verdict"]): Rating {
  return verdict === "correct" ? 3 : verdict === "partial" ? 2 : 1
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
