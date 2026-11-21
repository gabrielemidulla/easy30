import type { Concept } from "@easy30/core"

/** The slice of `Workspace` needed to re-find a concept after the vault was re-indexed. */
export interface ConceptLookup {
  concept(id: string): Concept
  findConcept(ref: string, courseId?: string): Concept | null
}

/** Look a concept up by id; when the id is gone (a `path:` id replaced by a stored id on
 * first rating, or a renamed note) fall back to its last known path. `null` = deleted. */
export function resolveConcept(
  lookup: ConceptLookup,
  id: string,
  path: string | undefined,
): Concept | null {
  try {
    return lookup.concept(id)
  } catch {
    if (path === undefined) return null
    const found = lookup.findConcept(path)
    return found && found.path === path ? found : null
  }
}

/** Re-resolve every queued id after a refresh: ids that changed are replaced, deleted
 * concepts are dropped. `paths` (id → last known path) is updated in place. */
export function remapQueue(
  lookup: ConceptLookup,
  ids: readonly string[],
  paths: Map<string, string>,
): string[] {
  const out: string[] = []
  for (const id of ids) {
    const concept = resolveConcept(lookup, id, paths.get(id))
    if (!concept) continue
    paths.set(concept.id, concept.path)
    out.push(concept.id)
  }
  return out
}
