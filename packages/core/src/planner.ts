import type { ConceptGraph } from "./graph.js"
import { type ConceptState, masteryScore } from "./scheduler.js"
import type { Concept } from "./vault.js"

/** Concepts not yet rated directly, prerequisites first. Inferred ones are skipped
 * unless `includeInferred`, which is what makes the first pass fast. */
export function skimQueue(
  concepts: readonly Concept[],
  graph: ConceptGraph,
  states: ReadonlyMap<string, ConceptState>,
  { includeInferred = false } = {},
): string[] {
  const ids = new Set(concepts.map((c) => c.id))
  return graph.topologicalOrder(ids).filter((id) => {
    const s = states.get(id)
    if (!s || s.lastRating !== null) return false
    return includeInferred || s.inferred === null
  })
}

/** Rated concepts whose review is due by `now`, most overdue first. */
export function dueQueue(
  concepts: readonly Concept[],
  states: ReadonlyMap<string, ConceptState>,
  now: Date = new Date(),
): string[] {
  return concepts
    .map((c) => states.get(c.id))
    .filter((s): s is ConceptState => s?.due != null && s.due.getTime() <= now.getTime())
    .sort((a, b) => (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0))
    .map((s) => s.conceptId)
}

/** Knowledge-space "outer fringe": not green yet, every prerequisite green. */
export function readyToLearn(
  concepts: readonly Concept[],
  graph: ConceptGraph,
  states: ReadonlyMap<string, ConceptState>,
): string[] {
  const green = (id: string) => states.get(id)?.mastery === "green"
  return concepts
    .filter((c) => !green(c.id) && graph.prerequisitesOf(c.id).every(green))
    .map((c) => c.id)
}

export interface StudyPlan {
  /** Reviews due now, most overdue first. */
  due: string[]
  /** Ready-to-learn concepts, most valuable first: importance × (1 − mastery). */
  next: string[]
  /** Weakest concepts overall (for tests and orals), importance-weighted. */
  weakest: string[]
}

export function studyPlan(
  concepts: readonly Concept[],
  graph: ConceptGraph,
  states: ReadonlyMap<string, ConceptState>,
  now: Date = new Date(),
): StudyPlan {
  const byId = new Map(concepts.map((c) => [c.id, c]))
  const gap = (id: string) => {
    const s = states.get(id)
    return (byId.get(id)?.importance ?? 2) * (1 - (s ? masteryScore(s) : 0))
  }
  // Higher gap first; ties broken by how many concepts it unlocks.
  const rank = (ids: string[]) =>
    [...ids].sort(
      (a, b) => gap(b) - gap(a) || graph.dependentsOf(b).length - graph.dependentsOf(a).length,
    )
  const due = dueQueue(concepts, states, now)
  const dueSet = new Set(due)
  return {
    due,
    next: rank(readyToLearn(concepts, graph, states).filter((id) => !dueSet.has(id))),
    weakest: rank(concepts.map((c) => c.id)).filter((id) => gap(id) > 0),
  }
}
