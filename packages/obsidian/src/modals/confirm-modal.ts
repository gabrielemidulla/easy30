import { type App, Modal, Setting } from "obsidian"

export interface ConfirmOptions {
  title: string
  message: string
  cta: string
  destructive?: boolean
}

class ConfirmModal extends Modal {
  private confirmed = false

  constructor(
    app: App,
    private readonly options: ConfirmOptions,
    private readonly done: (value: boolean) => void,
  ) {
    super(app)
  }

  override onOpen(): void {
    this.setTitle(this.options.title)
    this.contentEl.createEl("p", { text: this.options.message })
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => {
        button.setButtonText(this.options.cta).onClick(() => {
          this.confirmed = true
          this.close()
        })
        if (this.options.destructive) button.setWarning()
        else button.setCta()
      })
  }

  override onClose(): void {
    this.contentEl.empty()
    this.done(this.confirmed)
  }
}

export function confirm(app: App, options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => new ConfirmModal(app, options, resolve).open())
}
