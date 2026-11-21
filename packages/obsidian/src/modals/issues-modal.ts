import type { Issue } from "@easy30/core"
import { type App, Modal } from "obsidian"

class IssuesModal extends Modal {
  constructor(
    app: App,
    private readonly issues: readonly Issue[],
    private readonly openNote: (path: string) => void,
  ) {
    super(app)
  }

  override onOpen(): void {
    this.setTitle("Easy30 issues")
    const { contentEl } = this
    contentEl.addClass("easy30-issues")
    if (this.issues.length === 0) {
      contentEl.createEl("p", { text: "No issues found. Your concept graph is healthy." })
      return
    }
    const list = contentEl.createEl("ul", { cls: "easy30-issues-list" })
    for (const issue of this.issues) {
      const item = list.createEl("li")
      const link = item.createEl("a", { text: issue.path, cls: "easy30-issue-path" })
      link.setAttr("href", "#")
      link.addEventListener("click", (event) => {
        event.preventDefault()
        this.openNote(issue.path)
        this.close()
      })
      item.createDiv({ text: issue.message, cls: "easy30-issue-message" })
    }
  }

  override onClose(): void {
    this.contentEl.empty()
  }
}

export function showIssues(app: App, issues: readonly Issue[], openNote: (path: string) => void) {
  new IssuesModal(app, issues, openNote).open()
}
