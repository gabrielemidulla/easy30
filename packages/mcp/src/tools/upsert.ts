import type { UpsertItem, Workspace } from "@easy30/core"

export interface UpsertToolResult {
  created: string[]
  updated: string[]
  edges_set: number
  skipped_edges: { concept: string; requires: string; reason: string }[]
}

/** Batch create/update of concepts and their prerequisite edges (graph generation). */
export async function upsertConcepts(
  workspace: Workspace,
  courseId: string,
  concepts: readonly UpsertItem[],
  replaceRequires: boolean,
): Promise<UpsertToolResult> {
  const result = await workspace.upsertConcepts(courseId, [...concepts], { replaceRequires })
  return {
    created: result.created,
    updated: result.updated,
    edges_set: result.edgesSet,
    skipped_edges: result.skipped,
  }
}
