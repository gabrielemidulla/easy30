import type { Course } from "@easy30/core"
import { type App, SuggestModal } from "obsidian"

class CourseModal extends SuggestModal<Course> {
  private chosen: Course | null = null

  constructor(
    app: App,
    private readonly courses: Course[],
    private readonly done: (course: Course | null) => void,
  ) {
    super(app)
    this.setPlaceholder("Choose a course")
  }

  getSuggestions(query: string): Course[] {
    const q = query.trim().toLowerCase()
    return this.courses.filter((c) => c.title.toLowerCase().includes(q))
  }

  renderSuggestion(course: Course, el: HTMLElement): void {
    el.createDiv({ text: course.title })
    el.createEl("small", { text: course.path, cls: "easy30-suggest-path" })
  }

  onChooseSuggestion(course: Course): void {
    this.chosen = course
  }

  override onClose(): void {
    super.onClose()
    // Defer so `onChooseSuggestion` (which runs after close) can set the choice first.
    window.setTimeout(() => this.done(this.chosen), 0)
  }
}

export function pickCourseModal(app: App, courses: Course[]): Promise<Course | null> {
  return new Promise((resolve) => new CourseModal(app, courses, resolve).open())
}
