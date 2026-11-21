import { type Course, joinPath, safeFileName } from "@easy30/core"
import type { Easy30Host } from "./host"
import { promptNewConcept } from "./modals/new-concept-modal"
import { promptNewCourse } from "./modals/new-course-modal"

/** Ask for course details, create the course note and open its graph. */
export async function createCourseFlow(host: Easy30Host): Promise<void> {
  const input = await promptNewCourse(host.app)
  if (!input) return
  const folder = joinPath(host.settings.courseFolder, safeFileName(input.title))
  const course = await host.mutate((ws) => ws.createCourse({ ...input, folder }))
  if (course) await host.openGraph(course.id)
}

/** Ask for a title and question, create the concept note and open it. */
export async function createConceptFlow(host: Easy30Host, course: Course): Promise<void> {
  const input = await promptNewConcept(host.app, course.title)
  if (!input) return
  const concept = await host.mutate((ws) =>
    ws.createConcept({ courseId: course.id, title: input.title, question: input.question }),
  )
  if (concept) await host.openNote(concept.path)
}
