import { type App, Modal, Setting } from "obsidian"

export interface NewCourseInput {
  title: string
  exam?: string
  language?: string
}

class NewCourseModal extends Modal {
  private result: NewCourseInput | null = null
  private title = ""
  private exam = ""
  private language = ""

  constructor(
    app: App,
    private readonly done: (value: NewCourseInput | null) => void,
  ) {
    super(app)
  }

  override onOpen(): void {
    this.setTitle("New course")
    const { contentEl } = this
    new Setting(contentEl).setName("Title").addText((text) => {
      text.setPlaceholder("Linear algebra").onChange((v) => {
        this.title = v
      })
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.isComposing) this.submit()
      })
      window.setTimeout(() => text.inputEl.focus(), 0)
    })
    new Setting(contentEl)
      .setName("Exam date")
      .setDesc("Optional, as YYYY-MM-DD.")
      .addText((text) =>
        text.setPlaceholder("2027-01-20").onChange((v) => {
          this.exam = v
        }),
      )
    new Setting(contentEl)
      .setName("Language")
      .setDesc("Optional language code for generated content, such as en or it.")
      .addText((text) =>
        text.setPlaceholder("en").onChange((v) => {
          this.language = v
        }),
      )
    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText("Create course")
        .setCta()
        .onClick(() => this.submit()),
    )
  }

  private submit(): void {
    const title = this.title.trim()
    if (title === "") return
    const exam = this.exam.trim()
    const language = this.language.trim()
    this.result = {
      title,
      ...(/^\d{4}-\d{2}-\d{2}$/.test(exam) && { exam }),
      ...(language && { language }),
    }
    this.close()
  }

  override onClose(): void {
    this.contentEl.empty()
    this.done(this.result)
  }
}

export function promptNewCourse(app: App): Promise<NewCourseInput | null> {
  return new Promise((resolve) => new NewCourseModal(app, resolve).open())
}
