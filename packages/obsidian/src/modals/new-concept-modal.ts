import { type App, Modal, Setting } from "obsidian"

export interface NewConceptInput {
  title: string
  question: string
}

class NewConceptModal extends Modal {
  private result: NewConceptInput | null = null
  private title = ""
  private question = ""

  constructor(
    app: App,
    private readonly courseTitle: string,
    private readonly done: (value: NewConceptInput | null) => void,
  ) {
    super(app)
  }

  override onOpen(): void {
    this.setTitle(`New concept in ${this.courseTitle}`)
    const { contentEl } = this
    new Setting(contentEl).setName("Title").addText((text) => {
      text.onChange((v) => {
        this.title = v
      })
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.isComposing) this.submit()
      })
      window.setTimeout(() => text.inputEl.focus(), 0)
    })
    new Setting(contentEl)
      .setName("Question")
      .setDesc("What should you be able to answer about this concept?")
      .addText((text) => {
        text.onChange((v) => {
          this.question = v
        })
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && !event.isComposing) this.submit()
        })
      })
    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText("Create concept")
        .setCta()
        .onClick(() => this.submit()),
    )
  }

  private submit(): void {
    const title = this.title.trim()
    if (title === "") return
    this.result = { title, question: this.question.trim() }
    this.close()
  }

  override onClose(): void {
    this.contentEl.empty()
    this.done(this.result)
  }
}

export function promptNewConcept(app: App, courseTitle: string): Promise<NewConceptInput | null> {
  return new Promise((resolve) => new NewConceptModal(app, courseTitle, resolve).open())
}
