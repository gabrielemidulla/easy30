import type { RatingEntry, Workspace } from "@easy30/core"
import { titleOf, truncate } from "../format.js"

export interface HistoryOptions {
  conceptId?: string
  limit: number
  /** Student answers longer than this are cut (list views stay compact). */
  answerChars: number
}

/** Newest-first review history rows, with concept titles and bounded answers. */
export async function historyRows(workspace: Workspace, courseId: string, opts: HistoryOptions) {
  const entries = await workspace.history(courseId, {
    limit: opts.limit,
    ...(opts.conceptId !== undefined && { conceptId: opts.conceptId }),
  })
  return entries.map((e) => historyRow(workspace, e, opts.answerChars))
}

function historyRow(workspace: Workspace, entry: RatingEntry, answerChars: number) {
  return {
    entry_id: entry.id,
    at: entry.at,
    concept: { id: entry.concept, title: titleOf(workspace, entry.concept) },
    kind: entry.kind,
    rating: entry.rating,
    source: entry.source,
    ...(entry.answer !== undefined && { answer: truncate(entry.answer, answerChars) }),
    ...(entry.grading !== undefined && { grading: entry.grading }),
    ...(entry.ref !== undefined && { ref: entry.ref }),
  }
}
