import { type Mastery, masteryScore, type Workspace } from "@easy30/core"
import { createStyle, type Io, line, plural, type Style } from "../lib/io.js"
import { openWorkspace } from "../lib/workspace.js"

export interface StatusOptions {
  dir: string
  json: boolean
  /** Injectable clock for deterministic tests. */
  now?: Date
}

export interface CourseStatus {
  id: string
  title: string
  concepts: number
  mastery: Record<Mastery, number>
  /** Average mastery score, 0-100. */
  masteryPercent: number
  dueNow: number
  readyToLearn: number
  exam: string | null
  daysToExam: number | null
}

const DAY_MS = 86_400_000

/** Whole days from `now` until the exam date (negative once it has passed). */
export function daysUntil(date: string, now: Date): number {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((Date.parse(`${date}T00:00:00Z`) - today) / DAY_MS)
}

export async function collectStatus(ws: Workspace, now: Date): Promise<CourseStatus[]> {
  const out: CourseStatus[] = []
  for (const course of ws.courses()) {
    const view = await ws.view(course.id, now)
    const own = view.concepts.filter((c) => !c.external)
    const mastery: Record<Mastery, number> = { unknown: 0, red: 0, orange: 0, green: 0 }
    for (const c of own) mastery[c.state.mastery]++
    const total = own.reduce((sum, c) => sum + masteryScore(c.state), 0)
    const plan = await ws.plan(course.id, now)
    out.push({
      id: course.id,
      title: course.title,
      concepts: own.length,
      mastery,
      masteryPercent: own.length === 0 ? 0 : Math.round((total / own.length) * 100),
      dueNow: plan.due.length,
      readyToLearn: view.readyToLearn.length,
      exam: course.exam,
      daysToExam: course.exam === null ? null : daysUntil(course.exam, now),
    })
  }
  return out
}

/** A fixed-width bar: green, orange and red blocks, then the unknown remainder. */
export function masteryBar(mastery: Record<Mastery, number>, style: Style, width = 20): string {
  const total = mastery.green + mastery.orange + mastery.red + mastery.unknown
  if (total === 0) return style.dim("░".repeat(width))
  const cells = (n: number): number => Math.round((n / total) * width)
  const green = cells(mastery.green)
  const orange = Math.min(cells(mastery.orange), width - green)
  const red = Math.min(cells(mastery.red), width - green - orange)
  const rest = width - green - orange - red
  return (
    style.green("█".repeat(green)) +
    style.yellow("█".repeat(orange)) +
    style.red("█".repeat(red)) +
    style.dim("░".repeat(rest))
  )
}

function examLabel(s: CourseStatus): string {
  if (s.daysToExam === null) return ""
  if (s.daysToExam < 0) return `exam was ${plural(-s.daysToExam, "day")} ago`
  if (s.daysToExam === 0) return "exam today"
  return `exam in ${plural(s.daysToExam, "day")}`
}

export async function runStatus(opts: StatusOptions, io: Io): Promise<number> {
  const ws = await openWorkspace(opts.dir)
  const statuses = await collectStatus(ws, opts.now ?? new Date())
  if (opts.json) {
    line(io, JSON.stringify(statuses, null, 2))
    return 0
  }
  const style = createStyle(io.color)
  if (statuses.length === 0) {
    line(io, "No courses found. Run `easy30 init --example` to create a sample course.")
    return 0
  }
  for (const s of statuses) {
    line(io, style.bold(s.title) + style.dim(`  ${s.id}`))
    line(
      io,
      `  ${masteryBar(s.mastery, style)} ${s.masteryPercent}%  ${plural(s.concepts, "concept")}`,
    )
    const parts = [
      `${s.dueNow} due now`,
      `${s.readyToLearn} ready to learn`,
      `${s.mastery.green} green`,
      `${s.mastery.orange} orange`,
      `${s.mastery.red} red`,
      `${s.mastery.unknown} unknown`,
    ]
    const exam = examLabel(s)
    line(
      io,
      `  ${parts.join(style.dim(" · "))}${exam ? style.dim(" · ") + style.yellow(exam) : ""}`,
    )
    line(io)
  }
  return 0
}
