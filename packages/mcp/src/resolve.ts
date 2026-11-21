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
