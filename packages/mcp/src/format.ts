import type { Concept, ConceptState, Workspace } from "@easy30/core"

const DAY_MS = 86_400_000

/** `YYYY-MM-DD` (UTC) for day-level scheduling data, `null` when absent. */
export function day(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null
}

export function daysUntil(isoDate: string | null, now: Date = new Date()): number | null {
  if (!isoDate) return null
  const target = Date.parse(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(target)) return null
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((target - today) / DAY_MS)
}

export function isDue(state: ConceptState, now: Date = new Date()): boolean {
  return state.due !== null && state.due.getTime() <= now.getTime()
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

export function conceptRef(concept: Pick<Concept, "id" | "title">): { id: string; title: string } {
  return { id: concept.id, title: concept.title }
}

/** Titles for concept ids, falling back to the id when the concept no longer exists. */
export function titleOf(workspace: Workspace, id: string): string {
  return workspace.findConcept(id)?.title ?? id
}

export function stateSummary(state: ConceptState) {
  return {
    mastery: state.mastery,
    inferred: state.inferred,
    due: day(state.due),
    last_rating: state.lastRating,
    last_reviewed: day(state.lastReviewed),
    retrievability: state.retrievability === null ? null : Number(state.retrievability.toFixed(2)),
    reps: state.reps,
    lapses: state.lapses,
  }
}
