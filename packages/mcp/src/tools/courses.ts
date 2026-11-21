import type { ConceptState, Workspace } from "@easy30/core"
import { z } from "zod"
import { day, daysUntil, isDue, truncate } from "../format.js"
import type { Registrar } from "../registrar.js"

function courseMeta(workspace: Workspace, courseId: string) {
  const course = workspace.course(courseId)
  return {
    id: course.id,
    title: course.title,
    path: course.path,
    exam: course.exam,
    days_to_exam: daysUntil(course.exam),
    language: course.language,
    sources: course.sources,
  }
}

function stateRow(workspace: Workspace, states: ReadonlyMap<string, ConceptState>, id: string) {
  const concept = workspace.concept(id)
  const state = states.get(id)
  return {
    id,
    title: concept.title,
    question: truncate(concept.question, 200),
    importance: concept.importance,
    mastery: state?.mastery ?? "unknown",
    due: day(state?.due ?? null),
  }
}

export function registerCourseTools(tool: Registrar): void {
  tool(
    "list_courses",
    {
      title: "List courses",
      readOnly: true,
      description:
        "List every Easy30 course in the vault with its exam date, concept count, mastery distribution " +
        "(unknown/red/orange/green) and number of reviews due now. Call this first to discover course ids.",
      input: {},
    },
    async (_args, { workspace }) => {
      const now = new Date()
      return Promise.all(
        workspace.courses().map(async (course) => {
          const view = await workspace.view(course.id, now)
          const own = view.concepts.filter((c) => !c.external)
          const mastery = { unknown: 0, red: 0, orange: 0, green: 0 }
          for (const c of own) mastery[c.state.mastery]++
          return {
            id: course.id,
            title: course.title,
            exam: course.exam,
            days_to_exam: daysUntil(course.exam, now),
            concepts: own.length,
            mastery,
            due: own.filter((c) => isDue(c.state, now)).length,
          }
        }),
      )
    },
  )

  tool(
    "get_course",
    {
      title: "Get course graph",
      readOnly: true,
      description:
        "Get a course's prerequisite graph: every concept (id, title, question, importance 1-3, mastery, " +
        "inferred, due date, prerequisite ids), the edges (from = prerequisite, to = dependent), the concepts " +
        "ready to learn (not green yet, all prerequisites green) and structural issues (cycles, unresolved " +
        "links). Concepts with external=true belong to another course but are prerequisites of this one. " +
        "Answers are omitted; use get_concept for them.",
      input: { course: z.string().describe("Course id") },
    },
    async ({ course }, { workspace }) => {
      const view = await workspace.view(course)
      return {
        course: courseMeta(workspace, course),
        concepts: view.concepts.map((c) => ({
          id: c.id,
          title: c.title,
          question: c.question,
          importance: c.importance,
          mastery: c.state.mastery,
          inferred: c.state.inferred,
          due: day(c.state.due),
          requires: c.requires,
          external: c.external,
        })),
        edges: view.edges,
        ready_to_learn: view.readyToLearn,
        issues: view.issues,
      }
    },
  )

  tool(
    "study_plan",
    {
      title: "Study plan",
      readOnly: true,
      description:
        "What to study now in a course. `due`: reviews due today or overdue, most overdue first. `next`: " +
        "concepts ready to learn (all prerequisites green), most valuable first. `weakest`: lowest-mastery " +
        "concepts weighted by importance; use these to pick practice-test or oral topics.",
      input: {
        course: z.string().describe("Course id"),
        limit: z.number().int().min(1).max(100).default(10).describe("Max items per list"),
      },
    },
    async ({ course, limit }, { workspace }) => {
      const plan = await workspace.plan(course)
      const states = await workspace.states(course)
      const rows = (ids: string[]) =>
        ids.slice(0, limit).map((id) => stateRow(workspace, states, id))
      return { due: rows(plan.due), next: rows(plan.next), weakest: rows(plan.weakest) }
    },
  )

  tool(
    "skim_queue",
    {
      title: "Skim queue",
      readOnly: true,
      description:
        "First-pass skim: concepts never rated yet, prerequisites first, as {id, title, question} (no " +
        "answers). Ask the student the question; after they reply fetch the answer with get_concept and " +
        "record the result with record_review (kind 'skim', rating 1 didn't know / 2 kinda / 3 knew it). " +
        "Rating a concept 'knew it' marks its unrated prerequisites as probably known, so inferred concepts " +
        "are skipped unless include_inferred=true. Call again after each rating: the queue changes.",
      input: {
        course: z.string().describe("Course id"),
        include_inferred: z.boolean().default(false),
        limit: z.number().int().min(1).max(200).default(20),
      },
    },
    async ({ course, include_inferred, limit }, { workspace }) => {
      const ids = await workspace.skimQueue(course, { includeInferred: include_inferred })
      return ids.slice(0, limit).map((id) => {
        const concept = workspace.concept(id)
        return { id, title: concept.title, question: concept.question }
      })
    },
  )

  tool(
    "create_course",
    {
      title: "Create course",
      description:
        "Create a new course note in the vault. `id` defaults to a slug of the title; `folder` defaults to " +
        "Easy30/<title>. `exam` is YYYY-MM-DD. `language` is the language for generated content (e.g. 'it'). " +
        "`sources` lists material to base concepts on (wikilinks or vault paths). Add concepts afterwards " +
        "with upsert_concepts.",
      input: {
        title: z.string().min(1),
        id: z.string().optional().describe("Stable slug id"),
        folder: z.string().optional().describe("Vault folder for the course"),
        exam: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
          .optional(),
        language: z.string().optional(),
        sources: z.array(z.string()).optional(),
      },
    },
    async ({ title, id, folder, exam, language, sources }, { workspace }) => {
      const course = await workspace.createCourse({
        title,
        ...(id !== undefined && { id }),
        ...(folder !== undefined && { folder }),
        ...(exam !== undefined && { exam }),
        ...(language !== undefined && { language }),
        ...(sources !== undefined && { sources }),
      })
      return courseMeta(workspace, course.id)
    },
  )
}
