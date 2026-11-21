import { type Concept, Easy30Error, type PracticeTest, type Workspace } from "@easy30/core"

/** Resolve a concept given as id, title or path (optionally preferring one course). */
export function resolveConcept(workspace: Workspace, ref: string, courseId?: string): Concept {
  const concept = workspace.findConcept(ref, courseId)
  if (!concept) {
    throw new Easy30Error(
      "not_found",
      `No concept matches "${ref}"${courseId ? ` (course ${courseId})` : ""}`,
    )
  }
  return concept
}

/**
 * Resolve concept references to ids that are stored in the notes. Concepts without a
 * stored id are given one first, so test files never reference a `path:` placeholder.
 */
export async function resolveStoredConceptIds(
  workspace: Workspace,
  refs: readonly string[],
  courseId: string,
): Promise<Map<string, string>> {
  const resolve = () => new Map(refs.map((r) => [r, resolveConcept(workspace, r, courseId)]))
  let resolved = resolve()
  const unstored = [...resolved.values()].filter((c) => !c.hasStoredId)
  if (unstored.length > 0) {
    for (const owner of new Set(unstored.map((c) => c.courseId ?? courseId))) {
      await workspace.assignIds(owner)
    }
    resolved = resolve()
  }
  return new Map([...resolved].map(([ref, concept]) => [ref, concept.id]))
}

/** Resolve a practice test given as id, title or path. */
export function resolveTest(workspace: Workspace, ref: string): PracticeTest {
  const wanted = ref.trim().toLowerCase()
  const all = workspace.courses().flatMap((c) => workspace.tests(c.id))
  const found =
    all.find((t) => t.id === ref) ??
    all.find((t) => t.path.toLowerCase() === wanted) ??
    all.find((t) => t.title.toLowerCase() === wanted)
  if (!found) throw new Easy30Error("not_found", `No test matches "${ref}"`)
  return found
}
