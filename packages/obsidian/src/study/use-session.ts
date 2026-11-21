import type { Concept, Grading, Rating } from "@easy30/core"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { LOG_SOURCE } from "../constants"
import { errorMessage, showError } from "../errors"
import type { Easy30Host, StudyRequest } from "../host"
import { remapQueue, resolveConcept } from "./resolve"

export interface RateExtras {
  answer?: string
  grading?: Grading
  ms: number
}

interface HistoryItem {
  entryId: string
  conceptId: string
  /** Course whose log holds the entry: differs from the session's for external concepts. */
  courseId: string
  rating: Rating
}

export interface Session {
  status: "loading" | "card" | "done" | "error"
  error: string | null
  concept: Concept | null
  total: number
  /** Ratings recorded in this session (after undo). */
  ratings: Rating[]
  /** Skim: concepts skipped because they were inferred. */
  skipped: number
  remaining: number
  hint: string | null
  busy: boolean
  canUndo: boolean
  rate: (rating: Rating, extras: RateExtras) => Promise<void>
  undo: () => Promise<void>
}

const HINT_MS = 3500
/** How many "learn next" concepts a session offers at once. */
const LEARN_NEXT_LIMIT = 15

export function useSession(host: Easy30Host, request: StudyRequest): Session {
  const { mode, courseId, learnNext } = request
  const idsKey = request.conceptIds?.join("\n") ?? ""
  const ws = host.workspace
  const revision = useSyncExternalStore(host.subscribe, () => host.revision)
  /** Last known path of each queued concept id, to survive id changes across refreshes. */
  const paths = useRef(new Map<string, string>())
  const includeInferred = host.settings.skimIncludeInferred

  const [queue, setQueue] = useState<string[] | null>(null)
  const [total, setTotal] = useState(0)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [hint, setHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ws) return
    let cancelled = false
    setQueue(null)
    setHistory([])
    setHint(null)
    setError(null)
    const explicit = idsKey === "" ? null : idsKey.split("\n")
    const load = async (): Promise<{ ids: string[]; total: number }> => {
      if (explicit) return { ids: explicit, total: explicit.length }
      if (mode === "skim") {
        const all = await ws.skimQueue(courseId, { includeInferred: true })
        const ids = includeInferred ? all : await ws.skimQueue(courseId, { includeInferred: false })
        return { ids, total: all.length }
      }
      const plan = await ws.plan(courseId)
      const ids = learnNext ? plan.next.slice(0, LEARN_NEXT_LIMIT) : plan.due
      return { ids, total: ids.length }
    }
    load().then(
      (loaded) => {
        if (cancelled) return
        paths.current = new Map()
        for (const id of loaded.ids) {
          const known = resolveConcept(ws, id, undefined)
          if (known) paths.current.set(id, known.path)
        }
        setQueue(loaded.ids)
        setTotal(loaded.total)
      },
      (e: unknown) => {
        if (!cancelled) setError(errorMessage(e))
      },
    )
    return () => {
      cancelled = true
    }
  }, [ws, mode, courseId, idsKey, learnNext, includeInferred])

  const currentId = queue?.[0]
  // `revision` re-resolves after every refresh, so edits to the card show up and a
  // deleted note is noticed (the Workspace instance itself never changes).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` is the refresh trigger
  const concept = useMemo<Concept | null>(() => {
    if (!ws || currentId === undefined) return null
    return resolveConcept(ws, currentId, paths.current.get(currentId))
  }, [ws, currentId, revision])

  // After a refresh ids may have changed (a `path:` id gets a stored id on first rating)
  // or vanished: re-map the queue by path.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per refresh
  useEffect(() => {
    if (!ws) return
    setQueue((q) => {
      if (!q) return q
      const next = remapQueue(ws, q, paths.current)
      return next.length === q.length && next.every((id, i) => id === q[i]) ? q : next
    })
  }, [ws, revision])

  // The note may have been deleted mid-session: skip it.
  useEffect(() => {
    if (queue && currentId !== undefined && concept === null) setQueue(queue.slice(1))
  }, [queue, currentId, concept])

  useEffect(() => {
    if (hint === null) return
    const timer = window.setTimeout(() => setHint(null), HINT_MS)
    return () => window.clearTimeout(timer)
  }, [hint])

  const skimQueue = useCallback(
    () => (ws ? ws.skimQueue(courseId, { includeInferred }) : Promise.resolve([])),
    [ws, courseId, includeInferred],
  )

  const rate = useCallback(
    async (rating: Rating, extras: RateExtras): Promise<void> => {
      if (!ws || busy || !queue || currentId === undefined) return
      setBusy(true)
      try {
        // Through the host so it is serialised with refreshes and notifies views.
        const result = await host.mutate((w) =>
          w.rate({
            conceptId: currentId,
            kind: mode,
            rating,
            source: LOG_SOURCE,
            ms: extras.ms,
            ...(extras.answer !== undefined && { answer: extras.answer }),
            ...(extras.grading !== undefined && { grading: extras.grading }),
          }),
        )
        if (!result) return
        const { entry, changed } = result
        const rated = resolveConcept(ws, entry.concept, undefined)
        const ratedPath = rated?.path ?? paths.current.get(currentId)
        if (ratedPath !== undefined) paths.current.set(entry.concept, ratedPath)
        setHistory((h) => [
          ...h,
          {
            entryId: entry.id,
            conceptId: entry.concept,
            courseId: rated?.courseId ?? courseId,
            rating,
          },
        ])
        setQueue(mode === "skim" ? await skimQueue() : queue.slice(1))
        const inferred = changed.filter((s) => s.conceptId !== currentId && s.inferred !== null)
        setHint(mode === "skim" && inferred.length > 0 ? `+${inferred.length} inferred` : null)
      } catch (e) {
        showError(e, "Could not save the rating")
      } finally {
        setBusy(false)
      }
    },
    [ws, busy, queue, currentId, mode, courseId, skimQueue, host],
  )

  const undo = useCallback(async (): Promise<void> => {
    const last = history[history.length - 1]
    if (!ws || busy || !queue || !last) return
    setBusy(true)
    try {
      const done = await host.mutate(async (w) => {
        await w.retract(last.courseId, last.entryId, LOG_SOURCE)
        return true
      })
      if (!done) return
      setHistory((h) => h.slice(0, -1))
      const rest = mode === "skim" ? await skimQueue() : queue
      setQueue([last.conceptId, ...rest.filter((id) => id !== last.conceptId)])
      setHint(null)
    } catch (e) {
      showError(e, "Could not undo")
    } finally {
      setBusy(false)
    }
  }, [ws, busy, queue, history, mode, skimQueue, host])

  const status: Session["status"] =
    error !== null
      ? "error"
      : queue === null
        ? "loading"
        : queue.length === 0
          ? "done"
          : concept
            ? "card"
            : "loading"

  return {
    status,
    error,
    concept,
    total,
    ratings: history.map((h) => h.rating),
    skipped: mode === "skim" ? Math.max(0, total - history.length - (queue?.length ?? 0)) : 0,
    remaining: queue?.length ?? 0,
    hint,
    busy,
    canUndo: history.length > 0 && !busy,
    rate,
    undo,
  }
}
