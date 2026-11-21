import type { Workspace } from "@easy30/core"
import type { App } from "obsidian"
import type { Listener } from "./events"
import type { Easy30Settings } from "./settings-model"

export interface StudyRequest {
  mode: "skim" | "review"
  courseId: string
  /** Study exactly these concepts (e.g. "Review now" from the graph). */
  conceptIds?: string[]
  /** Review mode: start with ready-to-learn concepts instead of due ones. */
  learnNext?: boolean
}

/** What views and components may use of the plugin. Keeps them decoupled from `main.ts`. */
export interface Easy30Host {
  readonly app: App
  /** `null` until the vault has been indexed. */
  readonly workspace: Workspace | null
  readonly settings: Easy30Settings
  /** Bumps whenever the workspace changed; pair with `subscribe` in `useSyncExternalStore`. */
  readonly version: number
  readonly subscribe: (listener: Listener) => () => void
  /** Tell views that derived state changed (e.g. after a rating was logged). */
  notify(): Promise<void>
  /** Re-scan the vault now, then notify. */
  refresh(): Promise<void>
  /** Run a workspace mutation; failures become a Notice instead of an unhandled rejection. */
  mutate<T>(action: (workspace: Workspace) => Promise<T>): Promise<T | undefined>
  openNote(path: string): Promise<void>
  openGraph(courseId?: string): Promise<void>
  startStudy(request: StudyRequest): Promise<void>
  /** Remember the course the user is looking at, so commands default to it. */
  rememberCourse(courseId: string): void
}
