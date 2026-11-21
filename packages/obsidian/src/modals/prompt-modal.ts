import { type App, Modal, Setting } from "obsidian"

export interface PromptOptions {
  title: string
  label: string
  value?: string
  placeholder?: string
  cta?: string
}

class PromptModal extends Modal {
  private result: string | null = null

  constructor(
    app: App,
    private readonly options: PromptOptions,
    private readonly done: (value: string | null) => void,
  ) {
    super(app)
  }

  override onOpen(): void {
    const { options } = this
    this.setTitle(options.title)
    let value = options.value ?? ""
    const submit = () => {
      const trimmed = value.trim()
      if (trimmed === "") return
      this.result = trimmed
      this.close()
    }
    new Setting(this.contentEl).setName(options.label).addText((text) => {
      text
        .setValue(value)
        .setPlaceholder(options.placeholder ?? "")
        .onChange((v) => {
          value = v
        })
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.isComposing) {
          event.preventDefault()
          submit()
        }
      })
      window.setTimeout(() => {
        text.inputEl.focus()
        text.inputEl.select()
      }, 0)
    })
    new Setting(this.contentEl).addButton((button) =>
      button
        .setButtonText(options.cta ?? "Save")
        .setCta()
        .onClick(submit),
    )
  }

  override onClose(): void {
    this.contentEl.empty()
    this.done(this.result)
  }
}

/** Ask for one line of text. Resolves `null` when dismissed or left empty. */
export function promptText(app: App, options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => new PromptModal(app, options, resolve).open())
}
