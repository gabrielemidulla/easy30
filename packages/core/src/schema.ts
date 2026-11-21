import { z } from "zod"

/** Ratings follow FSRS: 1 again · 2 hard · 3 good · 4 easy. */
export const RatingSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
export type Rating = z.infer<typeof RatingSchema>

export const RATING = { again: 1, hard: 2, good: 3, easy: 4 } as const satisfies Record<
  string,
  Rating
>

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
const linkList = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : [v]))

/** YAML parses an unquoted `2027-01-20` as a Date; normalise it back to a string. */
const dateLike = z.preprocess(
  (v) => (v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : v),
  isoDate,
)

export const CourseFrontmatterSchema = z.object({
  easy30: z.literal("course"),
  id: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  exam: dateLike.optional(),
  language: z.string().optional(),
  sources: linkList.optional(),
})

export const ConceptFrontmatterSchema = z.object({
  easy30: z.literal("concept"),
  id: z.string().min(1).optional(),
  course: z.string().min(1).optional(),
  question: z.string().optional(),
  requires: linkList.optional(),
  importance: z.coerce.number().int().min(1).max(3).optional(),
})

export const GradingSchema = z.object({
  verdict: z.enum(["correct", "partial", "incorrect"]),
  feedback: z.string().optional(),
  /** Practice tests: score obtained / available for the question. */
  score: z.number().optional(),
  max: z.number().optional(),
  /** Practice tests grade the final answer and the procedure separately. */
  answerCorrect: z.boolean().optional(),
  reasoningCorrect: z.boolean().optional(),
})
export type Grading = z.infer<typeof GradingSchema>

export const ReviewKindSchema = z.enum(["skim", "review", "test", "oral"])
export type ReviewKind = z.infer<typeof ReviewKindSchema>

const entryBase = {
  v: z.literal(1),
  id: z.string().min(1),
  at: z.iso.datetime({ offset: true }),
  source: z.string().default("unknown"),
}

export const RatingEntrySchema = z.object({
  ...entryBase,
  kind: ReviewKindSchema,
  concept: z.string().min(1),
  rating: RatingSchema,
  answer: z.string().optional(),
  grading: GradingSchema.optional(),
  /** Practice test or oral session this rating came from. */
  ref: z.string().optional(),
  ms: z.number().int().nonnegative().optional(),
})

export const VoidEntrySchema = z.object({
  ...entryBase,
  kind: z.literal("void"),
  target: z.string().min(1),
})

export const LogEntrySchema = z.discriminatedUnion("kind", [RatingEntrySchema, VoidEntrySchema])
export type RatingEntry = z.infer<typeof RatingEntrySchema>
export type VoidEntry = z.infer<typeof VoidEntrySchema>
export type LogEntry = z.infer<typeof LogEntrySchema>

export const TestQuestionSchema = z.object({
  id: z.string().min(1),
  concepts: z.array(z.string()).default([]),
  points: z.number().positive().default(1),
})

export const TestFrontmatterSchema = z.object({
  easy30: z.literal("test"),
  id: z.string().min(1),
  course: z.string().min(1),
  created: dateLike.optional(),
  status: z.enum(["open", "graded"]).default("open"),
  questions: z.array(TestQuestionSchema).default([]),
  score: z.number().optional(),
  max: z.number().optional(),
})
export type TestQuestion = z.infer<typeof TestQuestionSchema>
