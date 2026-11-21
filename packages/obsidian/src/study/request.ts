import type { StudyRequest } from "../host"

/** Validate view state coming back from Obsidian's layout file (untrusted). */
export function parseStudyRequest(state: unknown): StudyRequest | null {
  if (typeof state !== "object" || state === null) return null
  const { mode, courseId, conceptIds, learnNext } = state as Record<string, unknown>
  if ((mode !== "skim" && mode !== "review") || typeof courseId !== "string" || courseId === "") {
    return null
  }
  const ids = Array.isArray(conceptIds)
    ? conceptIds.filter((id): id is string => typeof id === "string")
    : []
  return {
    mode,
    courseId,
    ...(ids.length > 0 && { conceptIds: ids }),
    ...(learnNext === true && { learnNext: true }),
  }
}
