import { type Card, createEmptyCard, fsrs, type Grade, generatorParameters } from "ts-fsrs"
import type { ConceptGraph } from "./graph.js"
import type { LogEntry, Rating, RatingEntry } from "./schema.js"

export type Mastery = "unknown" | "red" | "orange" | "green"
export type Inference = "known" | "unknown" | null

export interface ConceptState {
  conceptId: string
  mastery: Mastery
  /** Skim inference for concepts never rated directly. */
  inferred: Inference
  lastRating: Rating | null
  lastReviewed: Date | null
  due: Date | null
  /** Probability of recall right now (0–1), `null` before the first rating. */
  retrievability: number | null
  stability: number | null
  difficulty: number | null
  reps: number
  lapses: number
}

const DAY_MS = 86_400_000
/** Implicit review: share of a prerequisite's stability credited per success, and its cap. */
const IMPLICIT_SHARE = 0.5
const IMPLICIT_CAP_DAYS = 30

/** Concepts are reviewed on a scale of days: no fuzz (replay must be deterministic),
 * no intra-day learning steps. */
const scheduler = fsrs(
  generatorParameters({ request_retention: 0.9, enable_fuzz: false, enable_short_term: false }),
)

interface Working {
  card: Card
  lastRating: Rating
  lastReviewed: Date
}

/** Sort key: chronological, entry id breaks ties (ids are time-prefixed). */
function byTime(a: LogEntry, b: LogEntry): number {
  return a.at === b.at ? a.id.localeCompare(b.id) : Date.parse(a.at) - Date.parse(b.at)
}

/** Entries that still count: ratings not retracted by a later `void`. */
export function effectiveRatings(entries: readonly LogEntry[]): RatingEntry[] {
  const voided = new Set(entries.flatMap((e) => (e.kind === "void" ? [e.target] : [])))
  return entries
    .filter((e): e is RatingEntry => e.kind !== "void" && !voided.has(e.id))
    .sort(byTime)
}

export function masteryOf(
  rating: Rating | null,
  retrievability: number | null,
  inferred: Inference = null,
): Mastery {
  if (rating === null) return inferred === "known" ? "orange" : "unknown"
  if (rating === 1 || (retrievability !== null && retrievability < 0.5)) return "red"
  if (rating === 2 || (retrievability !== null && retrievability < 0.85)) return "orange"
  return "green"
}

/** 0 = unknown … 1 = mastered; used to rank what to study next. */
export function masteryScore(state: Pick<ConceptState, "mastery" | "inferred">): number {
  switch (state.mastery) {
    case "green":
      return 1
    case "orange":
      return state.inferred === "known" ? 0.6 : 0.5
    case "red":
      return 0.1
    case "unknown":
      return state.inferred === "unknown" ? 0 : 0.05
  }
}

/**
 * Derive every concept's state by replaying the log in time order.
 * Deterministic: the same log and graph always give the same result.
 */
export function replay(
  entries: readonly LogEntry[],
  graph: ConceptGraph,
  now: Date = new Date(),
): Map<string, ConceptState> {
  const ratings = effectiveRatings(entries)
  const work = new Map<string, Working>()

  for (const entry of ratings) {
    const at = new Date(entry.at)
    const prev = work.get(entry.concept)
    const card = prev?.card ?? createEmptyCard(at)
    const next = scheduler.next(card, at, entry.rating as Grade).card
    work.set(entry.concept, { card: next, lastRating: entry.rating, lastReviewed: at })
    if (entry.rating >= 3) creditPrerequisites(entry.concept, graph, work, at)
  }

  const inferred = inferFromSkim(ratings, graph, work)
  const states = new Map<string, ConceptState>()
  for (const id of graph.nodes()) {
    const w = work.get(id)
    const inf = w ? null : (inferred.get(id) ?? null)
    const r = w ? scheduler.retrievability(w.card, now) : null
    states.set(id, {
      conceptId: id,
      mastery: masteryOf(w?.lastRating ?? null, r, inf),
      inferred: inf,
      lastRating: w?.lastRating ?? null,
      lastReviewed: w?.lastReviewed ?? null,
      due: w?.card.due ?? null,
      retrievability: r,
      stability: w?.card.stability ?? null,
      difficulty: w?.card.difficulty ?? null,
      reps: w?.card.reps ?? 0,
      lapses: w?.card.lapses ?? 0,
    })
  }
  return states
}

/** Implicit review: practising B successfully exercises its green prerequisites,
 * so their next review is pushed back (memory parameters are left untouched). */
function creditPrerequisites(
  conceptId: string,
  graph: ConceptGraph,
  work: Map<string, Working>,
  at: Date,
): void {
  for (const pid of graph.prerequisitesOf(conceptId)) {
    const w = work.get(pid)
    if (!w) continue
    const r = scheduler.retrievability(w.card, at)
    if (masteryOf(w.lastRating, r) !== "green") continue
    const days = Math.min(w.card.stability * IMPLICIT_SHARE, IMPLICIT_CAP_DAYS)
    if (days < 0.5) continue
    const base = Math.max(w.card.due.getTime(), at.getTime())
    w.card = { ...w.card, due: new Date(base + days * DAY_MS) }
  }
}

/** Knowing B ⇒ its prerequisites are probably known; not knowing A ⇒ its dependents
 * probably aren't. Later skims override earlier ones; rated concepts are never inferred. */
function inferFromSkim(
  ratings: readonly RatingEntry[],
  graph: ConceptGraph,
  rated: Map<string, Working>,
): Map<string, Exclude<Inference, null>> {
  const inferred = new Map<string, Exclude<Inference, null>>()
  for (const entry of ratings) {
    if (entry.kind !== "skim" || !graph.has(entry.concept)) continue
    if (entry.rating >= 3) {
      for (const id of graph.ancestors(entry.concept)) inferred.set(id, "known")
    } else if (entry.rating === 1) {
      for (const id of graph.descendants(entry.concept)) inferred.set(id, "unknown")
    }
  }
  for (const id of rated.keys()) inferred.delete(id)
  return inferred
}
