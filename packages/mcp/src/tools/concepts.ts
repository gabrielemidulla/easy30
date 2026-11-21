import { type Concept, Easy30Error, type Workspace } from "@easy30/core"
import { z } from "zod"
import { conceptRef, stateSummary, titleOf } from "../format.js"
import type { Registrar } from "../registrar.js"
import { resolveConcept } from "../resolve.js"
import { historyRows } from "./history.js"
import { upsertConcepts } from "./upsert.js"

const importance = z
  .union([z.literal(1), z.literal(2), z.literal(3)])
  .describe("1 = minor, 2 = normal (default), 3 = core")

const kind = z
  .enum(["axiom", "definition", "theorem", "property", "method", "topic"])
  .describe(
    "Where the concept sits: axiom/definition/theorem/property/method, or topic for a composite node",
  )

const refList = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : [v]))
  .describe("Prerequisite concept(s): id, title or path")

const conceptArg = z.string().describe("Concept id, title or path")

function conceptSummary(workspace: Workspace, concept: Concept) {
  return {
    id: concept.id,
    title: concept.title,
    path: concept.path,
    course: concept.courseId,
    question: concept.question,
    importance: concept.importance,
    kind: concept.kind,
    requires: concept.requires.map((id) => ({ id, title: titleOf(workspace, id) })),
    unresolved_requires: concept.unresolved,
  }
}

function resolvePrerequisites(workspace: Workspace, concept: Concept, refs: string[]): string[] {
  return refs.map((ref) => resolveConcept(workspace, ref, concept.courseId ?? undefined).id)
}

export function registerConceptTools(tool: Registrar): void {
  tool(
    "get_concept",
    {
      title: "Get concept",
      readOnly: true,
      description:
        "Get one concept in full: question, reference answer (Markdown+LaTeX), importance, prerequisites, " +
        "dependents, current learning state (mastery, due date, retrievability) and recent review history. " +
        "Use this to teach, quiz or grade against the reference answer. The answer is private to the " +
        "tutor: do not show it to the student before they have attempted the question.",
      input: {
        concept: conceptArg,
        history_limit: z.number().int().min(0).max(100).default(10),
      },
    },
    async ({ concept: ref, history_limit }, { workspace }) => {
      const concept = resolveConcept(workspace, ref)
      const state = concept.courseId
        ? (await workspace.states(concept.courseId)).get(concept.id)
        : undefined
      const dependents = workspace
        .graph()
        .dependentsOf(concept.id)
        .map((id) => ({ id, title: titleOf(workspace, id) }))
      const history =
        concept.courseId && history_limit > 0
          ? await historyRows(workspace, concept.courseId, {
              conceptId: concept.id,
              limit: history_limit,
              answerChars: Number.POSITIVE_INFINITY,
            })
          : []
      return {
        ...conceptSummary(workspace, concept),
        answer: concept.answer,
        dependents,
        state: state ? stateSummary(state) : null,
        history,
      }
    },
  )

  tool(
    "upsert_concepts",
    {
      title: "Create or update concepts in batch",
      description:
        "Batch tool for building a course's concept graph. Pass 1 creates missing concepts and updates " +
        "existing ones (matched by title, case-insensitive, within the course) without touching " +
        "prerequisites. Pass 2 sets `requires` (titles resolved within the batch first, then the vault). " +
        "Edges that would create a cycle or that do not resolve are skipped and reported in " +
        "`skipped_edges`, never fatal; fix them and call again. Fields you omit are left unchanged. " +
        "`question` is a short self-contained recall question; `answer` is the reference answer in " +
        "Markdown+LaTeX ($...$); `importance` 1-3. With replace_requires=true (default) a concept's " +
        "`requires` list replaces its previous prerequisites; with false the new ones are added. " +
        "Concepts whose `requires` is omitted keep their prerequisites.",
      input: {
        course: z.string().describe("Course id"),
        concepts: z
          .array(
            z.object({
              title: z.string().min(1),
              question: z.string().optional(),
              answer: z.string().optional(),
              importance: importance.optional(),
              kind: kind.optional(),
              requires: z
                .array(z.string())
                .optional()
                .describe(
                  "Prerequisites by title (or id/path); must be needed to understand this concept",
                ),
            }),
          )
          .min(1),
        replace_requires: z.boolean().default(true),
      },
    },
    ({ course, concepts, replace_requires }, { workspace }) =>
      upsertConcepts(workspace, course, concepts.map(withoutUndefined), replace_requires),
  )

  tool(
    "update_concept",
    {
      title: "Update concept",
      description:
        "Edit one concept. Changing `title` renames the note and rewrites every prerequisite link that " +
        "points at it. Omitted fields are unchanged. Use upsert_concepts for many concepts at once.",
      input: {
        concept: conceptArg,
        title: z.string().min(1).optional(),
        question: z.string().optional(),
        answer: z.string().optional().describe("Reference answer, Markdown+LaTeX"),
        importance: importance.optional(),
        kind: kind.optional(),
      },
    },
    async (
      { concept: ref, title, question, answer, importance: level, kind: k },
      { workspace },
    ) => {
      let concept = resolveConcept(workspace, ref)
      if (title !== undefined) concept = await workspace.renameConcept(concept.id, title)
      if (
        question !== undefined ||
        answer !== undefined ||
        level !== undefined ||
        k !== undefined
      ) {
        concept = await workspace.updateConcept(concept.id, {
          ...(question !== undefined && { question }),
          ...(answer !== undefined && { answer }),
          ...(level !== undefined && { importance: level }),
          ...(k !== undefined && { kind: k }),
        })
      }
      return conceptSummary(workspace, concept)
    },
  )

  tool(
    "set_prerequisites",
    {
      title: "Set prerequisites",
      description:
        "Replace a concept's prerequisites with exactly this list (empty list clears them). Fails with a " +
        "cycle error, naming the concepts involved, if any prerequisite already depends on this concept.",
      input: { concept: conceptArg, requires: z.array(z.string()) },
    },
    async ({ concept: ref, requires }, { workspace }) => {
      const concept = resolveConcept(workspace, ref)
      const updated = await workspace.setRequires(
        concept.id,
        resolvePrerequisites(workspace, concept, requires),
      )
      return conceptSummary(workspace, updated)
    },
  )

  tool(
    "add_prerequisite",
    {
      title: "Add prerequisite",
      description:
        "Add one or more prerequisites to a concept, keeping the existing ones. Fails if it would create a cycle.",
      input: { concept: conceptArg, requires: refList },
    },
    async ({ concept: ref, requires }, { workspace }) => {
      const concept = resolveConcept(workspace, ref)
      const added = resolvePrerequisites(workspace, concept, requires)
      const updated = await workspace.setRequires(concept.id, [...concept.requires, ...added])
      return conceptSummary(workspace, updated)
    },
  )

  tool(
    "remove_prerequisite",
    {
      title: "Remove prerequisite",
      description: "Remove one or more prerequisites from a concept. Other prerequisites are kept.",
      input: { concept: conceptArg, requires: refList },
    },
    async ({ concept: ref, requires }, { workspace }) => {
      const concept = resolveConcept(workspace, ref)
      const removed = new Set(resolvePrerequisites(workspace, concept, requires))
      const updated = await workspace.setRequires(
        concept.id,
        concept.requires.filter((id) => !removed.has(id)),
      )
      return conceptSummary(workspace, updated)
    },
  )

  tool(
    "delete_concept",
    {
      title: "Delete concept",
      destructive: true,
      description:
        "Delete a concept note and remove it from other concepts' prerequisites. Its review history stays " +
        "in the log but is ignored. Irreversible apart from git/Obsidian history: confirm with the user first.",
      input: { concept: conceptArg },
    },
    async ({ concept: ref }, { workspace }) => {
      const concept = resolveConcept(workspace, ref)
      if (!concept.courseId)
        throw new Easy30Error("invalid", `"${concept.title}" is not in a course`)
      const dependents = workspace
        .graph()
        .dependentsOf(concept.id)
        .map((id) => titleOf(workspace, id))
      await workspace.deleteConcept(concept.id)
      return { deleted: conceptRef(concept), path: concept.path, dependents_updated: dependents }
    },
  )
}

/** zod gives `field?: T | undefined`; core's inputs use exact optional properties. */
function withoutUndefined<T extends object>(
  value: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>
  }
}
