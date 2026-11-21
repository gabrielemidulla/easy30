import { Easy30Error, RatingSchema, verdictRating } from "@easy30/core"
import { z } from "zod"
import { day, titleOf } from "../format.js"
import type { Registrar } from "../registrar.js"
import { resolveConcept } from "../resolve.js"
import { historyRows } from "./history.js"

const verdictSchema = z.enum(["correct", "partial", "incorrect"])

export function registerReviewTools(tool: Registrar): void {
  tool(
    "record_review",
    {
      title: "Record a review",
      description:
        "Log the outcome of studying one concept; this updates spaced-repetition scheduling and mastery. " +
        "kind: 'skim' (first pass, rating 1-3: didn't know / kinda / knew it), 'review' (spaced repetition), " +
        "'oral' (mock oral exam). Provide exactly one of: `rating` (1 again, 2 hard, 3 good, 4 easy) or " +
        "`verdict` (correct/partial/incorrect, which you judged against the reference answer: maps to " +
        "3/2/1 and is stored as the grading with `feedback`). `answer` is the student's answer. `ms` is " +
        "time spent in milliseconds, `ref` an optional session id (e.g. an oral session). Returns the " +
        "concept's new state plus other concepts whose state changed (skim inference, implicit review). " +
        "Practice tests are recorded through grade_test, not here.",
      input: {
        concept: z.string().describe("Concept id, title or path"),
        kind: z.enum(["review", "skim", "oral"]),
        rating: RatingSchema.optional().describe("1 again, 2 hard, 3 good, 4 easy"),
        verdict: verdictSchema.optional(),
        answer: z.string().optional().describe("The student's answer"),
        feedback: z.string().optional().describe("Your feedback on the answer (needs verdict)"),
        ms: z.number().int().nonnegative().optional().describe("Time spent, milliseconds"),
        ref: z.string().optional().describe("Session id this review belongs to"),
      },
    },
    async (args, { workspace, source }) => {
      if ((args.rating === undefined) === (args.verdict === undefined)) {
        throw new Easy30Error("invalid", "Provide exactly one of `rating` or `verdict`")
      }
      if (args.feedback !== undefined && args.verdict === undefined) {
        throw new Easy30Error("invalid", "`feedback` is stored with a `verdict`; provide one")
      }
      const concept = resolveConcept(workspace, args.concept)
      const rating = args.rating ?? (args.verdict ? verdictRating(args.verdict) : undefined)
      if (rating === undefined) throw new Easy30Error("invalid", "Provide a rating or verdict")
      const { entry, changed } = await workspace.rate({
        conceptId: concept.id,
        kind: args.kind,
        rating,
        source: source(),
        ...(args.answer !== undefined && { answer: args.answer }),
        ...(args.verdict !== undefined && {
          grading: {
            verdict: args.verdict,
            ...(args.feedback !== undefined && { feedback: args.feedback }),
          },
        }),
        ...(args.ms !== undefined && { ms: args.ms }),
        ...(args.ref !== undefined && { ref: args.ref }),
      })
      const state = changed.find((s) => s.conceptId === entry.concept)
      return {
        entry_id: entry.id,
        concept: { id: entry.concept, title: titleOf(workspace, entry.concept) },
        rating: entry.rating,
        state: state && {
          mastery: state.mastery,
          due: day(state.due),
          retrievability: state.retrievability,
        },
        changed_neighbours: changed
          .filter((s) => s.conceptId !== entry.concept)
          .map((s) => ({
            title: titleOf(workspace, s.conceptId),
            mastery: s.mastery,
            inferred: s.inferred,
            due: day(s.due),
          })),
      }
    },
  )

  tool(
    "undo_review",
    {
      title: "Undo a review",
      description:
        "Retract a logged review by its entry_id (from record_review or get_history), e.g. when the " +
        "student mis-clicked or you recorded the wrong concept. The entry is voided, not deleted.",
      input: { course: z.string(), entry_id: z.string() },
    },
    async ({ course, entry_id }, { workspace, source }) => {
      await workspace.retract(course, entry_id, source())
      return { undone: entry_id }
    },
  )

  tool(
    "get_history",
    {
      title: "Review history",
      readOnly: true,
      description:
        "Recent reviews in a course, newest first (voided entries excluded), optionally for one concept. " +
        "Includes ratings, verdicts and the student's answers (long answers truncated); use it to see " +
        "recurring mistakes before choosing what to quiz.",
      input: {
        course: z.string(),
        concept: z.string().optional().describe("Concept id, title or path"),
        limit: z.number().int().min(1).max(200).default(30),
      },
    },
    async ({ course, concept, limit }, { workspace }) => {
      const conceptId = concept ? resolveConcept(workspace, concept, course).id : undefined
      return historyRows(workspace, course, {
        limit,
        answerChars: 400,
        ...(conceptId !== undefined && { conceptId }),
      })
    },
  )
}
