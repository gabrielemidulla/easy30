import { Workspace } from "@easy30/core"
import {
  type Debouncer,
  debounce,
  Notice,
  Plugin,
  type TAbstractFile,
  TFile,
  type WorkspaceLeaf,
} from "obsidian"
import { Easy30Commands } from "./commands"
import { GRAPH_VIEW_TYPE, STUDY_VIEW_TYPE } from "./constants"
import { showError } from "./errors"
import { Emitter } from "./events"
import { ObsidianFs } from "./fs-adapter"
import type { Easy30Host, StudyRequest } from "./host"
import { SelfWrites, TrackedFs } from "./self-writes"
import { Easy30SettingTab } from "./settings"
import { DEFAULT_SETTINGS, type Easy30Settings, mergeSettings } from "./settings-model"
import { TaskQueue } from "./task-queue"
import { GraphView } from "./views/graph-view"
import { StudyView } from "./views/study-view"
import { logSignature } from "./watch"

const REFRESH_DEBOUNCE_MS = 300
const LOG_POLL_MS = 5_000
const DUE_RECOMPUTE_MS = 5 * 60_000

export default class Easy30Plugin extends Plugin implements Easy30Host {
  override settings: Easy30Settings = DEFAULT_SETTINGS
  workspace: Workspace | null = null

  private readonly emitter = new Emitter()
  readonly subscribe = this.emitter.subscribe
  private revisionCounter = 0
  private readonly selfWrites = new SelfWrites()
  private readonly queue = new TaskQueue()
  private noteLeaf: WorkspaceLeaf | null = null
  private statusEl: HTMLElement | null = null
  private dueByCourse = new Map<string, number>()
  private knownPaths = new Set<string>()
  private lastLogSignature: string | null = null
  private lastCourseId: string | null = null
  private readonly scheduleRefresh: Debouncer<[], void> = debounce(
    () => void this.refresh(),
    REFRESH_DEBOUNCE_MS,
    true,
  )

  get revision(): number {
    return this.revisionCounter
  }

  override async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData())
    this.addSettingTab(new Easy30SettingTab(this.app, this))

    this.registerView(GRAPH_VIEW_TYPE, (leaf) => new GraphView(leaf, this))
    this.registerView(STUDY_VIEW_TYPE, (leaf) => new StudyView(leaf, this))

    this.addRibbonIcon("git-fork", "Open Easy30 concept graph", () => void this.openGraph())
    this.registerCommands()
    this.setupStatusBar()

    this.app.workspace.onLayoutReady(() => void this.start())
  }

  override onunload(): void {
    this.scheduleRefresh.cancel()
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
    this.emitter.emit()
  }

  // ── workspace lifecycle ────────────────────────────────────────────────────

  private async start(): Promise<void> {
    try {
      this.workspace = await Workspace.open(
        new TrackedFs(new ObsidianFs(this.app), this.selfWrites),
      )
    } catch (error) {
      showError(error, "Could not index the vault")
      return
    }
    await this.afterRefresh()
    this.lastLogSignature = await logSignature(this.app.vault.adapter)
    this.registerVaultEvents()
    this.registerInterval(window.setInterval(() => void this.pollLogs(), LOG_POLL_MS))
    this.registerInterval(window.setInterval(() => void this.notify(), DUE_RECOMPUTE_MS))
  }

  private registerVaultEvents(): void {
    const { vault, metadataCache } = this.app
    this.registerEvent(
      metadataCache.on("changed", (file, _data, cache) => {
        if (file.extension !== "md" || this.isOwnWrite(file)) return
        if (cache.frontmatter?.easy30 !== undefined || this.knownPaths.has(file.path)) {
          this.scheduleRefresh()
        }
      }),
    )
    this.registerEvent(
      vault.on("rename", (file: TAbstractFile, oldPath: string) => {
        if (this.isOwnWrite(file)) return
        if (this.knownPaths.has(oldPath) || this.knownPaths.has(file.path)) this.scheduleRefresh()
      }),
    )
    this.registerEvent(
      vault.on("delete", (file: TAbstractFile) => {
        if (this.selfWrites.isOwn(file.path, null)) return
        if (this.knownPaths.has(file.path)) this.scheduleRefresh()
      }),
    )
    // A new note has no metadata yet; its "changed" event above does the work.
    // Folder creation never matters, but a restored/copied note might arrive fully formed.
    this.registerEvent(
      vault.on("create", (file: TAbstractFile) => {
        if (file instanceof TFile && file.extension === "md" && !this.isOwnWrite(file)) {
          this.scheduleRefresh()
        }
      }),
    )
  }

  private async pollLogs(): Promise<void> {
    const signature = await logSignature(this.app.vault.adapter)
    if (this.lastLogSignature !== null && signature !== this.lastLogSignature) {
      this.scheduleRefresh()
    }
    this.lastLogSignature = signature
  }

  /** The echo of a write we made ourselves (core already re-indexed after it). */
  private isOwnWrite(file: TAbstractFile): boolean {
    return file instanceof TFile && this.selfWrites.isOwn(file.path, file.stat.mtime)
  }

  /** Re-scan the vault. Runs after any in-flight refresh or mutation (never interleaved),
   * and requests arriving while one is waiting share a single scan. */
  refresh(): Promise<void> {
    return this.queue.coalesced(async () => {
      const ws = this.workspace
      if (!ws) return
      try {
        await ws.refresh()
      } catch (error) {
        showError(error, "Could not refresh")
      }
      await this.afterRefresh()
    })
  }

  notify(): Promise<void> {
    return this.queue.run(() => this.afterRefresh())
  }

  private async afterRefresh(): Promise<void> {
    const ws = this.workspace
    if (ws) {
      this.knownPaths = collectPaths(ws)
      this.dueByCourse = await dueCounts(ws)
    }
    this.updateStatusBar()
    this.revisionCounter++
    this.emitter.emit()
  }

  async mutate<T>(action: (workspace: Workspace) => Promise<T>): Promise<T | undefined> {
    const ws = this.workspace
    if (!ws) {
      new Notice("Easy30 is still loading. Try again in a moment.")
      return undefined
    }
    return this.queue.run(async () => {
      try {
        return await action(ws)
      } catch (error) {
        showError(error)
        return undefined
      } finally {
        // Our own log appends must not look like another device's sync to the poller.
        this.lastLogSignature = await logSignature(this.app.vault.adapter)
        await this.afterRefresh()
      }
    })
  }

  // ── status bar ─────────────────────────────────────────────────────────────

  private setupStatusBar(): void {
    const el = this.addStatusBarItem()
    el.addClass("easy30-status", "mod-clickable")
    el.setAttr("aria-label", "Start a review")
    this.registerDomEvent(el, "click", () => void this.reviewMostDue())
    this.statusEl = el
    this.updateStatusBar()
  }

  private updateStatusBar(): void {
    const el = this.statusEl
    if (!el) return
    const hasCourses = this.dueByCourse.size > 0
    el.toggleClass("easy30-hidden", !hasCourses)
    let total = 0
    for (const n of this.dueByCourse.values()) total += n
    el.setText(`Easy30 · ${total} due`)
  }

  private async reviewMostDue(): Promise<void> {
    let best: { id: string; due: number } | null = null
    for (const [id, due] of this.dueByCourse) if (due > (best?.due ?? 0)) best = { id, due }
    if (!best) {
      new Notice("Nothing is due for review.")
      return
    }
    await this.startStudy({ mode: "review", courseId: best.id })
  }

  // ── navigation ─────────────────────────────────────────────────────────────

  async openNote(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) {
      new Notice(`Note not found: ${path}`)
      return
    }
    let leaf = this.noteLeaf
    if (!leaf || !this.isLeafOpen(leaf)) {
      leaf = this.app.workspace.getLeaf("split", "vertical")
      this.noteLeaf = leaf
    }
    await leaf.openFile(file)
  }

  private isLeafOpen(leaf: WorkspaceLeaf): boolean {
    let open = false
    this.app.workspace.iterateAllLeaves((l) => {
      if (l === leaf) open = true
    })
    return open
  }

  async openGraph(courseId?: string): Promise<void> {
    const leaf =
      this.app.workspace.getLeavesOfType(GRAPH_VIEW_TYPE)[0] ?? this.app.workspace.getLeaf("tab")
    await leaf.setViewState({
      type: GRAPH_VIEW_TYPE,
      active: true,
      state: courseId ? { courseId } : {},
    })
    await this.app.workspace.revealLeaf(leaf)
  }

  async startStudy(request: StudyRequest): Promise<void> {
    const leaf =
      this.app.workspace.getLeavesOfType(STUDY_VIEW_TYPE)[0] ?? this.app.workspace.getLeaf("tab")
    // `nonce` makes an identical request restart the session instead of being ignored.
    await leaf.setViewState({
      type: STUDY_VIEW_TYPE,
      active: true,
      state: { ...request, nonce: Date.now() },
    })
    await this.app.workspace.revealLeaf(leaf)
  }

  rememberCourse(courseId: string): void {
    this.lastCourseId = courseId
  }

  // ── commands ───────────────────────────────────────────────────────────────

  private registerCommands(): void {
    const commands = new Easy30Commands(this, () => this.lastCourseId)
    this.addCommand({ id: "open-graph", name: "Open concept graph", callback: commands.openGraph })
    this.addCommand({ id: "start-skim", name: "Start skim", callback: commands.startSkim })
    this.addCommand({ id: "start-review", name: "Start review", callback: commands.startReview })
    this.addCommand({ id: "new-course", name: "New course", callback: commands.newCourse })
    this.addCommand({ id: "new-concept", name: "New concept", callback: commands.newConcept })
    this.addCommand({
      id: "turn-into-concept",
      name: "Turn current note into a concept",
      checkCallback: commands.turnIntoConcept,
    })
    this.addCommand({ id: "assign-ids", name: "Assign missing ids", callback: commands.assignIds })
    this.addCommand({ id: "show-issues", name: "Show issues", callback: commands.showIssues })
  }
}

function collectPaths(ws: Workspace): Set<string> {
  const paths = new Set<string>()
  for (const course of ws.courses()) {
    paths.add(course.path)
    for (const concept of ws.conceptsOf(course.id)) paths.add(concept.path)
    for (const test of ws.tests(course.id)) paths.add(test.path)
  }
  for (const issue of ws.issues) paths.add(issue.path)
  return paths
}

async function dueCounts(ws: Workspace): Promise<Map<string, number>> {
  const entries = await Promise.all(
    ws.courses().map(async (course) => {
      try {
        return [course.id, (await ws.plan(course.id)).due.length] as const
      } catch {
        return [course.id, 0] as const
      }
    }),
  )
  return new Map(entries)
}
