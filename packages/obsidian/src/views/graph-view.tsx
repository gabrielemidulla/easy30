import { ItemView, type ViewStateResult, type WorkspaceLeaf } from "obsidian"
import { createRoot, type Root } from "react-dom/client"
import { GraphApp } from "../components/GraphApp"
import { HostProvider } from "../components/host-context"
import { GRAPH_VIEW_TYPE } from "../constants"
import type { Easy30Host } from "../host"

export class GraphView extends ItemView {
  private root: Root | null = null
  private courseId: string | null = null

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: Easy30Host,
  ) {
    super(leaf)
    this.navigation = false
  }

  getViewType(): string {
    return GRAPH_VIEW_TYPE
  }

  getDisplayText(): string {
    return "Easy30 graph"
  }

  override getIcon(): string {
    return "git-fork"
  }

  override getState(): Record<string, unknown> {
    return { courseId: this.courseId }
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    if (typeof state === "object" && state !== null && "courseId" in state) {
      const { courseId } = state
      if (typeof courseId === "string") this.courseId = courseId
    }
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

  private readonly changeCourse = (courseId: string): void => {
    this.courseId = courseId
    this.render()
    this.app.workspace.requestSaveLayout()
  }

  private render(): void {
    this.root?.render(
      <HostProvider host={this.host}>
        <GraphApp courseId={this.courseId} onCourseChange={this.changeCourse} />
      </HostProvider>,
    )
  }
}
