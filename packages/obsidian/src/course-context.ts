import type { Course, Workspace } from "@easy30/core"
import type { App } from "obsidian"
import { pickCourseModal } from "./modals/course-modal"

/** Course of the concept or course note at `path`, if any. */
export function courseOfPath(ws: Workspace, path: string): Course | null {
  for (const course of ws.courses()) {
    if (course.path === path) return course
    if (ws.conceptsOf(course.id).some((c) => c.path === path)) return course
  }
  return null
}

/** Pick the course a command should act on: the active note's course, else the
 * course last shown in the graph, else the only course, else ask. */
export async function resolveCourse(
  app: App,
  ws: Workspace,
  lastCourseId: string | null,
): Promise<Course | null> {
  const courses = ws.courses()
  const active = app.workspace.getActiveFile()
  const fromNote = active ? courseOfPath(ws, active.path) : null
  if (fromNote) return fromNote
  const remembered = courses.find((c) => c.id === lastCourseId)
  if (remembered) return remembered
  if (courses.length === 1) return courses[0] ?? null
  if (courses.length === 0) return null
  return pickCourseModal(app, courses)
}
