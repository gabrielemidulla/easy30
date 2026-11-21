import { resolve } from "node:path"
import { readLog, type Workspace } from "@easy30/core"
import { createStyle, type Io, line, plural } from "../lib/io.js"
import { openWorkspace } from "../lib/workspace.js"

export interface DoctorOptions {
  dir: string
  fix: boolean
}

export interface Problem {
  path: string
  message: string
}

export interface DoctorReport {
  /** Problems per course id; `null` is the bucket for notes outside any known course. */
  byCourse: Map<string | null, Problem[]>
  /** Concept notes without a stored id, as paths. */
  missingIds: string[]
}

export function problemCount(report: DoctorReport): number {
  return [...report.byCourse.values()].reduce((n, list) => n + list.length, 0)
}

/** Inspect a loaded workspace. Pure with respect to the vault: nothing is written. */
export async function diagnose(ws: Workspace): Promise<DoctorReport> {
  const byCourse = new Map<string | null, Problem[]>()
  const add = (courseId: string | null, problem: Problem): void => {
    byCourse.set(courseId, [...(byCourse.get(courseId) ?? []), problem])
  }

  const courses = ws.courses()
  const courseOfPath = new Map<string, string>()
  for (const course of courses) {
    courseOfPath.set(course.path, course.id)
    for (const c of ws.conceptsOf(course.id)) courseOfPath.set(c.path, course.id)
  }

  // Everything the loader rejected: invalid frontmatter, duplicate ids, unknown courses…
  for (const issue of ws.issues) add(courseOfPath.get(issue.path) ?? null, issue)

  const graph = ws.graph()
  const cyclic = graph.cyclicNodes()
  const concepts = courses.flatMap((c) => ws.conceptsOf(c.id))
  for (const c of concepts) {
    const courseId = c.courseId
    if (cyclic.has(c.id)) add(courseId, { path: c.path, message: "Part of a prerequisite cycle" })
    for (const link of c.unresolved) {
      add(courseId, { path: c.path, message: `Unresolved prerequisite [[${link}]]` })
    }
    if (c.question === "") add(courseId, { path: c.path, message: "Has no question" })
    if (c.answer === "") add(courseId, { path: c.path, message: "Has no answer (empty note body)" })
  }

  for (const course of courses) {
    const { errors } = await readLog(ws.fs, course.id)
    for (const e of errors) {
      add(course.id, {
        path: `.easy30/log/${course.id}.jsonl`,
        message: `Line ${e.line}: ${e.message}`,
      })
    }
  }

  for (const id of graph.nodes()) {
    const c = ws.concept(id)
    if (c.courseId === null) add(null, { path: c.path, message: "Not part of any course" })
  }

  const missingIds = concepts.filter((c) => !c.hasStoredId).map((c) => c.path)
  return { byCourse, missingIds }
}

export async function runDoctor(opts: DoctorOptions, io: Io): Promise<number> {
  const style = createStyle(io.color)
  const ws = await openWorkspace(opts.dir)
  let report = await diagnose(ws)

  if (opts.fix && report.missingIds.length > 0) {
    const written = await ws.assignIds()
    line(io, `${style.green("fixed")}  wrote ids into ${plural(written, "concept note")}`)
    report = await diagnose(ws)
  }

  line(io, style.bold(`Easy30 doctor: ${resolve(opts.dir)}`))
  const courses = ws.courses()
  for (const course of courses) {
    const problems = report.byCourse.get(course.id) ?? []
    const head = `${course.title} (${plural(ws.conceptsOf(course.id).length, "concept")})`
    line(io)
    line(io, `${problems.length === 0 ? style.green("ok") : style.red("!!")}  ${style.bold(head)}`)
    for (const p of problems) line(io, `    ${style.dim(p.path)}\n      ${p.message}`)
  }
  const loose = report.byCourse.get(null) ?? []
  if (loose.length > 0) {
    line(io)
    line(io, `${style.red("!!")}  ${style.bold("Notes outside any course")}`)
    for (const p of loose) line(io, `    ${style.dim(p.path)}\n      ${p.message}`)
  }
  if (courses.length === 0 && loose.length === 0) {
    line(io)
    line(io, "No courses found. Run `easy30 init --example` to create a sample course.")
  }

  if (report.missingIds.length > 0) {
    line(io)
    line(
      io,
      `${style.yellow("note")}  ${plural(report.missingIds.length, "concept note")} without a stored id` +
        " (ids are assigned on first use). Run `easy30 doctor --fix` to write them now.",
    )
  }

  const count = problemCount(report)
  line(io)
  if (count === 0) {
    line(io, style.green("No problems found."))
    return 0
  }
  line(io, style.red(`${plural(count, "problem")} found.`))
  return 2
}
