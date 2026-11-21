import type { Concept, Grading, Rating } from "@easy30/core"
import { useCallback, useEffect, useMemo, useState } from "react"
import { LOG_SOURCE } from "../constants"
import { errorMessage, showError } from "../errors"
import type { Easy30Host, StudyRequest } from "../host"

export interface RateExtras {
  answer?: string
  grading?: Grading
  ms: number
}

interface HistoryItem {
  entryId: string
  conceptId: string
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
  const concept = useMemo<Concept | null>(() => {
    if (!ws || currentId === undefined) return null
    try {
      return ws.concept(currentId)
    } catch {
      return null
    }
  }, [ws, currentId])

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
        const { entry, changed } = await ws.rate({
          conceptId: currentId,
          kind: mode,
          rating,
          source: LOG_SOURCE,
          ms: extras.ms,
          ...(extras.answer !== undefined && { answer: extras.answer }),
          ...(extras.grading !== undefined && { grading: extras.grading }),
        })
        setHistory((h) => [...h, { entryId: entry.id, conceptId: currentId, rating }])
        setQueue(mode === "skim" ? await skimQueue() : queue.slice(1))
        const inferred = changed.filter((s) => s.conceptId !== currentId && s.inferred !== null)
        setHint(mode === "skim" && inferred.length > 0 ? `+${inferred.length} inferred` : null)
        await host.notify()
      } catch (e) {
        showError(e, "Could not save the rating")
      } finally {
        setBusy(false)
      }
    },
    [ws, busy, queue, currentId, mode, skimQueue, host],
  )

  const undo = useCallback(async (): Promise<void> => {
    const last = history[history.length - 1]
    if (!ws || busy || !queue || !last) return
    setBusy(true)
    try {
      await ws.retract(courseId, last.entryId, LOG_SOURCE)
      setHistory((h) => h.slice(0, -1))
      const rest = mode === "skim" ? await skimQueue() : queue
      setQueue([last.conceptId, ...rest.filter((id) => id !== last.conceptId)])
      setHint(null)
      await host.notify()
    } catch (e) {
      showError(e, "Could not undo")
    } finally {
      setBusy(false)
    }
  }, [ws, busy, queue, history, courseId, mode, skimQueue, host])

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
