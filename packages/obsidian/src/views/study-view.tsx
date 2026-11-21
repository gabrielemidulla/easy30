import { ItemView, Scope, type ViewStateResult, type WorkspaceLeaf } from "obsidian"
import { createRoot, type Root } from "react-dom/client"
import { HostProvider } from "../components/host-context"
import { STUDY_VIEW_TYPE } from "../constants"
import type { Easy30Host, StudyRequest } from "../host"
import { KeyBridge, KeyBridgeContext, type StudyKey } from "../study/keys"
import { parseStudyRequest } from "../study/request"
import { StudyApp } from "../study/StudyApp"

const TEXT_INPUTS = new Set(["TEXTAREA", "INPUT", "SELECT"])

export class StudyView extends ItemView {
  private root: Root | null = null
  private request: StudyRequest | null = null
  private readonly bridge = new KeyBridge()

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: Easy30Host,
  ) {
    super(leaf)
    this.navigation = false
    this.scope = this.buildScope()
  }

  getViewType(): string {
    return STUDY_VIEW_TYPE
  }

  getDisplayText(): string {
    return this.request?.mode === "skim" ? "Easy30 skim" : "Easy30 review"
  }

  override getIcon(): string {
    return "graduation-cap"
  }

  override getState(): Record<string, unknown> {
    return { ...this.request }
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    this.request = parseStudyRequest(state)
    this.render()
    await super.setState(state, result)
  }

  override async onOpen(): Promise<void> {
    this.contentEl.addClass("easy30-view")
    this.root = createRoot(this.contentEl)
    this.render()
  }

  override async onClose(): Promise<void> {
    this.root?.unmount()
    this.root = null
  }

  /** Keys are scoped to this view; typing in the answer box must not trigger them. */
  private buildScope(): Scope {
    const scope = new Scope(this.app.scope)
    const bind = (key: string, name: StudyKey) =>
      scope.register([], key, (event) => this.onKey(event, name))
    bind(" ", "space")
    bind("Enter", "enter")
    bind("1", "1")
    bind("2", "2")
    bind("3", "3")
    bind("4", "4")
    bind("u", "undo")
    scope.register(["Mod"], "Enter", (event) => this.onKey(event, "submit"))
    return scope
  }

  private onKey(event: KeyboardEvent, key: StudyKey): false | undefined {
    const target = event.target
    const typing = target instanceof HTMLElement && TEXT_INPUTS.has(target.tagName)
    if (typing && key !== "submit") return undefined
    // Buttons handle Space/Enter natively; do not double-fire when one has focus.
    if (target instanceof HTMLButtonElement && (key === "space" || key === "enter")) {
      return undefined
    }
    return this.bridge.dispatch(key) ? false : undefined
  }

  private readonly changeRequest = (request: StudyRequest): void => {
    this.request = request
    this.render()
    this.app.workspace.requestSaveLayout()
  }

  private render(): void {
    const { request } = this
    this.root?.render(
      <HostProvider host={this.host}>
        <KeyBridgeContext.Provider value={this.bridge}>
          {request ? (
            <StudyApp request={request} onRequestChange={this.changeRequest} />
          ) : (
            <div className="easy30-empty">
              Start a skim or review from the graph or the command palette.
            </div>
          )}
        </KeyBridgeContext.Provider>
      </HostProvider>,
    )
  }
}
