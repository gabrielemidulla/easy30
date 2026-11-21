import {
  type Concept,
  ConceptGraph,
  type ConceptPatch,
  safeFileName,
  type Workspace,
} from "@easy30/core"

export interface ConceptInput {
  title: string
  question?: string | undefined
  answer?: string | undefined
  importance?: 1 | 2 | 3 | undefined
  requires?: string[] | undefined
}

export interface SkippedEdge {
  concept: string
  requires: string
  reason: string
}

export interface UpsertResult {
  created: string[]
  updated: string[]
  edges_set: number
  skipped_edges: SkippedEdge[]
}

const key = (title: string) => safeFileName(title).toLowerCase()

function patchOf(input: ConceptInput): ConceptPatch {
  return {
    ...(input.question !== undefined && { question: input.question }),
    ...(input.answer !== undefined && { answer: input.answer }),
    ...(input.importance !== undefined && { importance: input.importance }),
  }
}

/** Merge repeated titles in one batch (later fields win) so a title is written once. */
function dedupe(inputs: readonly ConceptInput[]): ConceptInput[] {
  const merged = new Map<string, ConceptInput>()
  for (const input of inputs) {
    const previous = merged.get(key(input.title))
    const defined = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined))
    merged.set(key(input.title), { ...previous, ...defined, title: previous?.title ?? input.title })
  }
  return [...merged.values()]
}

/** Pass 1: create missing concepts and update existing ones (matched by title within the course). */
async function upsertNodes(
  workspace: Workspace,
  courseId: string,
  inputs: readonly ConceptInput[],
  result: UpsertResult,
): Promise<Map<string, Concept>> {
  const byKey = new Map<string, Concept>()
  for (const input of inputs) {
    const existing = workspace.conceptsOf(courseId).find((c) => key(c.title) === key(input.title))
    let concept: Concept
    if (existing) {
      const patch = patchOf(input)
      const changed = Object.keys(patch).length > 0
      concept = changed ? await workspace.updateConcept(existing.id, patch) : existing
      if (changed) result.updated.push(existing.title)
    } else {
      concept = await workspace.createConcept({
        courseId,
        title: input.title,
        ...patchOf(input),
      })
      result.created.push(concept.title)
    }
    byKey.set(key(input.title), concept)
  }
  return byKey
}

function resolveRef(
  workspace: Workspace,
  courseId: string,
  batch: ReadonlyMap<string, Concept>,
  ref: string,
): Concept | null {
  return batch.get(key(ref)) ?? workspace.findConcept(ref, courseId)
}

/** Pass 2: set prerequisites. Unresolvable and cycle-forming edges are skipped and reported. */
async function linkNodes(
  workspace: Workspace,
  courseId: string,
  inputs: readonly ConceptInput[],
  batch: ReadonlyMap<string, Concept>,
  replace: boolean,
  result: UpsertResult,
): Promise<void> {
  const requires = new Map(
    [...workspace.graph().nodes()].map((id) => [id, workspace.concept(id).requires] as const),
  )
  for (const input of inputs) {
    if (input.requires === undefined) continue
    const concept = batch.get(key(input.title))
    if (!concept) continue
    const current = requires.get(concept.id) ?? []
    const accepted: string[] = replace ? [] : [...current]
    requires.set(concept.id, accepted)
    for (const ref of input.requires) {
      const skip = (reason: string) =>
        result.skipped_edges.push({ concept: concept.title, requires: ref, reason })
      const prerequisite = resolveRef(workspace, courseId, batch, ref)
      if (!prerequisite) {
        skip("No concept with this title or path exists in the batch or the vault")
        continue
      }
      if (accepted.includes(prerequisite.id)) continue
      const graph = new ConceptGraph([...requires].map(([id, r]) => ({ id, requires: r })))
      if (graph.wouldCycle(prerequisite.id, concept.id)) {
        skip(
          prerequisite.id === concept.id
            ? "A concept cannot require itself"
            : `Would create a cycle: "${prerequisite.title}" already depends on "${concept.title}"`,
        )
        continue
      }
      accepted.push(prerequisite.id)
      result.edges_set++
    }
    if (!sameSet(current, accepted)) await workspace.setRequires(concept.id, accepted)
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x))
}

/** Batch create/update of concepts and their prerequisite edges for graph generation. */
export async function upsertConcepts(
  workspace: Workspace,
  courseId: string,
  concepts: readonly ConceptInput[],
  replaceRequires: boolean,
): Promise<UpsertResult> {
  workspace.course(courseId)
  const result: UpsertResult = { created: [], updated: [], edges_set: 0, skipped_edges: [] }
  const inputs = dedupe(concepts)
  const batch = await upsertNodes(workspace, courseId, inputs, result)
  await linkNodes(workspace, courseId, inputs, batch, replaceRequires, result)
  return result
}
