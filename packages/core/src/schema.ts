// zod/mini keeps the plugin bundle small (tree-shakable functional API).
import * as z from "zod/mini"

/** Ratings follow FSRS: 1 again · 2 hard · 3 good · 4 easy. */
export const RatingSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
export type Rating = z.infer<typeof RatingSchema>

export const RATING = { again: 1, hard: 2, good: 3, easy: 4 } as const satisfies Record<
  string,
  Rating
>

/** Ids end up in file paths (`.easy30/log/<course>.jsonl`), so keep them boring. */
export const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/i
const safeId = z.string().check(z.regex(SAFE_ID, "letters, digits, - and _ only"))

/** YAML parses an unquoted `2027-01-20` as a Date; normalise it back to a string. */
const isoDate = z.pipe(
  z.transform((v: unknown) =>
    v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : v,
  ),
  z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")),
)

const linkList = z.pipe(
  z.union([z.string(), z.array(z.string())]),
  z.transform((v) => (Array.isArray(v) ? v : [v])),
)

export const CourseFrontmatterSchema = z.object({
  easy30: z.literal("course"),
  id: z.optional(safeId),
  title: z.optional(z.string().check(z.minLength(1))),
  exam: z.optional(isoDate),
  language: z.optional(z.string()),
  sources: z.optional(linkList),
})

export const ConceptFrontmatterSchema = z.object({
  easy30: z.literal("concept"),
  id: z.optional(safeId),
  course: z.optional(z.string().check(z.minLength(1))),
  question: z.optional(z.string()),
  requires: z.optional(linkList),
  importance: z.optional(z.union([z.literal(1), z.literal(2), z.literal(3)])),
})

export const GradingSchema = z.object({
  verdict: z.enum(["correct", "partial", "incorrect"]),
  feedback: z.optional(z.string()),
  /** Practice tests: score obtained / available for the question. */
  score: z.optional(z.number()),
  max: z.optional(z.number()),
  /** Practice tests grade the final answer and the procedure separately. */
  answerCorrect: z.optional(z.boolean()),
  reasoningCorrect: z.optional(z.boolean()),
})
export type Grading = z.infer<typeof GradingSchema>

export const ReviewKindSchema = z.enum(["skim", "review", "test", "oral"])
export type ReviewKind = z.infer<typeof ReviewKindSchema>

const entryBase = {
  v: z.literal(1),
  id: z.string().check(z.minLength(1)),
  at: z.iso.datetime({ offset: true }),
  source: z._default(z.string(), "unknown"),
}

export const RatingEntrySchema = z.object({
  ...entryBase,
  kind: ReviewKindSchema,
  concept: z.string().check(z.minLength(1)),
  rating: RatingSchema,
  answer: z.optional(z.string()),
  grading: z.optional(GradingSchema),
  /** Practice test or oral session this rating came from. */
  ref: z.optional(z.string()),
  ms: z.optional(z.number().check(z.int(), z.nonnegative())),
})

export const VoidEntrySchema = z.object({
  ...entryBase,
  kind: z.literal("void"),
  target: z.string().check(z.minLength(1)),
})

export const LogEntrySchema = z.discriminatedUnion("kind", [RatingEntrySchema, VoidEntrySchema])
export type RatingEntry = z.infer<typeof RatingEntrySchema>
export type VoidEntry = z.infer<typeof VoidEntrySchema>
export type LogEntry = z.infer<typeof LogEntrySchema>

export const TestQuestionSchema = z.object({
  id: z.string().check(z.minLength(1)),
  concepts: z._default(z.array(z.string()), []),
  points: z._default(z.number().check(z.positive()), 1),
})

export const TestFrontmatterSchema = z.object({
  easy30: z.literal("test"),
  id: safeId,
  course: safeId,
  created: z.optional(isoDate),
  status: z._default(z.enum(["open", "graded"]), "open"),
  questions: z._default(z.array(TestQuestionSchema), []),
  score: z.optional(z.number()),
  max: z.optional(z.number()),
})
export type TestQuestion = z.infer<typeof TestQuestionSchema>

/** One human-readable line per validation problem. */
export function describeError(error: z.core.$ZodError): string {
  return error.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ")
}
