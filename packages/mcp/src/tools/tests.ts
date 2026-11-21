import { Easy30Error, type PracticeTest, type Workspace } from "@easy30/core"
import { z } from "zod"
import type { Registrar } from "../registrar.js"
import { resolveStoredConceptIds, resolveTest } from "../resolve.js"

const testArg = z.string().describe("Test id, title or path")

function testSummary(test: PracticeTest) {
  return {
    id: test.id,
    title: test.title,
    path: test.path,
    course: test.courseId,
    created: test.created,
    status: test.status,
    score: test.score,
    max: test.max,
    questions: test.questions.map((q) => ({ id: q.id, concepts: q.concepts, points: q.points })),
  }
}

/** Every question must be graded exactly once, within its points. */
function validateResults(
  test: PracticeTest,
  results: readonly { question_id: string; score: number }[],
): void {
  const points = new Map(test.questions.map((q) => [q.id, q.points]))
  const seen = new Set<string>()
  for (const r of results) {
    const max = points.get(r.question_id)
    if (max === undefined) throw new Easy30Error("invalid", `Unknown question "${r.question_id}"`)
    if (seen.has(r.question_id))
      throw new Easy30Error("invalid", `Question "${r.question_id}" graded twice`)
    seen.add(r.question_id)
    if (r.score > max)
      throw new Easy30Error(
        "invalid",
        `Score ${r.score} exceeds ${max} points for "${r.question_id}"`,
      )
  }
  const missing = test.questions.filter((q) => !seen.has(q.id)).map((q) => q.id)
  if (missing.length > 0)
    throw new Easy30Error("invalid", `Missing results for question(s): ${missing.join(", ")}`)
}

async function readNote(workspace: Workspace, test: PracticeTest): Promise<string> {
  return (await workspace.fs.read(test.path)) ?? ""
}

export function registerTestTools(tool: Registrar): void {
  tool(
    "create_test",
    {
      title: "Create practice test",
      description:
        "Create a practice test note in the course folder. Each question needs a unique `id`, a `prompt` " +
        "(Markdown + LaTeX), the `concepts` it exercises (titles or ids), `points`, and a `solution`. " +
        "Put the full worked solution in `solution`: it is stored out of sight and hidden from the student " +
        "until the test is graded. Never put hints or answers in `prompt`. Returns the test id and note " +
        "path; the student writes answers under each '### Answer' heading in the note.",
      input: {
        course: z.string(),
        title: z.string().min(1),
        intro: z.string().optional().describe("Instructions shown above the questions"),
        questions: z
          .array(
            z.object({
              id: z.string().min(1).describe("Unique within the test, e.g. q1"),
              prompt: z.string().min(1),
              concepts: z.array(z.string()).min(1).describe("Concepts tested: titles or ids"),
              points: z.number().positive(),
              solution: z.string().min(1).describe("Full worked solution, hidden until grading"),
            }),
          )
          .min(1),
      },
    },
    async ({ course, title, intro, questions }, { workspace }) => {
      const refs = [...new Set(questions.flatMap((q) => q.concepts))]
      const ids = await resolveStoredConceptIds(workspace, refs, course)
      const test = await workspace.createTest({
        courseId: course,
        title,
        ...(intro !== undefined && { intro }),
        questions: questions.map((q) => ({
          ...q,
          concepts: q.concepts.map((ref) => ids.get(ref) ?? ref),
        })),
      })
      return testSummary(test)
    },
  )

  tool(
    "get_test",
    {
      title: "Get practice test",
      readOnly: true,
      description:
        "Read a practice test: metadata plus the note content, where the student's answers appear under " +
        "each '### Answer' heading. Set include_solutions=true ONLY when you are about to grade, and never " +
        "reveal solutions to the student before the test is graded.",
      input: { test: testArg, include_solutions: z.boolean().default(false) },
    },
    async ({ test: ref, include_solutions }, { workspace }) => {
      const test = resolveTest(workspace, ref)
      return {
        test: testSummary(test),
        note: await readNote(workspace, test),
        ...(include_solutions && { solutions: await workspace.testSolutions(test.id) }),
      }
    },
  )

  tool(
    "list_tests",
    {
      title: "List practice tests",
      readOnly: true,
      description:
        "List a course's practice tests, newest first, with status and score once graded.",
      input: { course: z.string() },
    },
    async ({ course }, { workspace }) => {
      workspace.course(course)
      return workspace.tests(course).map(testSummary)
    },
  )

  tool(
    "grade_test",
    {
      title: "Grade practice test",
      description:
        "Record the grading of a test: one result per question, then a report. This marks the test graded, " +
        "appends the report and the worked solutions to the note, and logs one rating per concept tested " +
        "(correct 3, partial 2, incorrect 1). Grade against the solutions from get_test. verdict " +
        "'correct' only if BOTH the final answer and the reasoning are correct; `score` is points earned " +
        "(0..question points). `feedback` is per-question, addressed to the student. `report` is the " +
        "overall Markdown summary (strengths, mistakes, what to review). A test can be graded once.",
      input: {
        test: testArg,
        results: z
          .array(
            z.object({
              question_id: z.string(),
              verdict: z.enum(["correct", "partial", "incorrect"]),
              score: z.number().min(0),
              answer_correct: z.boolean(),
              reasoning_correct: z.boolean(),
              feedback: z.string(),
            }),
          )
          .min(1),
        report: z.string().min(1),
      },
    },
    async ({ test: ref, results, report }, { workspace, source }) => {
      const test = resolveTest(workspace, ref)
      if (test.status === "graded")
        throw new Easy30Error("conflict", `Test "${test.title}" is already graded`)
      validateResults(test, results)
      for (const r of results) {
        if (r.verdict === "correct" && !(r.answer_correct && r.reasoning_correct)) {
          throw new Easy30Error(
            "invalid",
            `Question "${r.question_id}": verdict "correct" requires both answer_correct and reasoning_correct`,
          )
        }
      }
      const graded = await workspace.gradeTest({
        testId: test.id,
        source: source(),
        report,
        results: results.map((r) => ({
          questionId: r.question_id,
          grading: {
            verdict: r.verdict,
            score: r.score,
            feedback: r.feedback,
            answerCorrect: r.answer_correct,
            reasoningCorrect: r.reasoning_correct,
          },
        })),
      })
      return testSummary(graded)
    },
  )
}
