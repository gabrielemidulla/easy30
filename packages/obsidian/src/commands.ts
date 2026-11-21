import { newConceptId } from "@easy30/core"
import { Notice, type TFile } from "obsidian"
import { createConceptFlow, createCourseFlow } from "./actions"
import { courseOfPath, resolveCourse } from "./course-context"
import { showError } from "./errors"
import type { Easy30Host } from "./host"
import { pickCourseModal } from "./modals/course-modal"
import { showIssues } from "./modals/issues-modal"

/** Command bodies; `main.ts` registers them. Kept here so the plugin class stays small. */
export class Easy30Commands {
  constructor(
    private readonly host: Easy30Host,
    private readonly lastCourseId: () => string | null,
  ) {}

  private get app() {
    return this.host.app
  }

  private requireWorkspace() {
    const ws = this.host.workspace
    if (!ws) new Notice("Easy30 is still loading. Try again in a moment.")
    return ws
  }

  private async courseForAction(noCoursesMessage: string) {
    const ws = this.requireWorkspace()
    if (!ws) return null
    if (ws.courses().length === 0) {
      new Notice(noCoursesMessage)
      return null
    }
    return resolveCourse(this.app, ws, this.lastCourseId())
  }

  openGraph = async (): Promise<void> => {
    await this.host.openGraph()
  }

  startSkim = async (): Promise<void> => {
    const course = await this.courseForAction("Create a course first.")
    if (course) await this.host.startStudy({ mode: "skim", courseId: course.id })
  }

  startReview = async (): Promise<void> => {
    const course = await this.courseForAction("Create a course first.")
    if (course) await this.host.startStudy({ mode: "review", courseId: course.id })
  }

  newCourse = async (): Promise<void> => {
    if (this.requireWorkspace()) await createCourseFlow(this.host)
  }

  newConcept = async (): Promise<void> => {
    const course = await this.courseForAction("Create a course first.")
    if (course) await createConceptFlow(this.host, course)
  }

  /** Enabled only while a plain Markdown note (not already an Easy30 note) is active. */
  turnIntoConcept = (checking: boolean): boolean => {
    const file = this.app.workspace.getActiveFile()
    const ws = this.host.workspace
    if (file?.extension !== "md" || !ws) return false
    if (courseOfPath(ws, file.path)) return false
    if (!checking) void this.convertNote(file)
    return true
  }

  private async convertNote(file: TFile): Promise<void> {
    const ws = this.requireWorkspace()
    if (!ws) return
    const courses = ws.courses()
    if (courses.length === 0) {
      new Notice("Create a course first.")
      return
    }
    const course = courses.length === 1 ? courses[0] : await pickCourseModal(this.app, courses)
    if (!course) return
    try {
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        if (fm.easy30 !== undefined) throw new Error("This note already has an easy30 property.")
        fm.easy30 = "concept"
        fm.id = newConceptId()
        fm.course = course.id
        fm.question ??= ""
        fm.importance ??= 2
      })
    } catch (error) {
      showError(error)
      return
    }
    await this.host.refresh()
    new Notice(`Added "${file.basename}" to ${course.title}.`)
  }

  assignIds = async (): Promise<void> => {
    const ws = this.requireWorkspace()
    if (!ws) return
    const count = await this.host.mutate((w) => w.assignIds())
    if (count !== undefined) {
      new Notice(count === 0 ? "Every concept already has an id." : `Assigned ${count} ids.`)
    }
  }

  showIssues = (): void => {
    const ws = this.requireWorkspace()
    if (ws) showIssues(this.app, ws.issues, (path) => void this.host.openNote(path))
  }
}
