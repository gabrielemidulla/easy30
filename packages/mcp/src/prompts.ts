import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"

function prompt(text: string): GetPromptResult {
  return { messages: [{ role: "user", content: { type: "text", text } }] }
}

const course = z.string().describe("Course id")

const BUILD_GRAPH = (id: string) => `Build or extend the prerequisite graph of course "${id}".

1. get_course {course:"${id}"} to see existing concepts; read the course note's sources and
   use search_notes / read_note to ground everything in the student's material.
2. Draft concepts: one atomic idea each (answerable in a few lines), with a self-contained recall
   \`question\`, a reference \`answer\` in Markdown+LaTeX, and importance 1-3 (3 = core for the exam).
3. Declare prerequisites by title: A requires B only if B must be understood to understand A. Keep
   edges sparse (direct prerequisites only, no transitive shortcuts). Never invent content that
   contradicts the sources; write in the course language.
4. Send them with upsert_concepts in batches of ~25 (prerequisites may reference titles from the
   same batch). Read \`skipped_edges\` in each result and fix them (unresolved titles, cycles).
5. validate_vault and get_course; resolve every issue. Finish by summarising the graph size and
   the concepts you were unsure about.`

const PRACTICE_TEST = (id: string, count: number) => `Run a practice test for course "${id}".

1. study_plan {course:"${id}"} and pick ${count} questions from the \`weakest\` and \`due\` concepts,
   spread across the graph; get_concept for each to read the reference answer.
2. Write exam-style questions (not recall questions): problems or proofs needing several steps,
   with points proportional to difficulty. Prompts in Markdown+LaTeX; no hints or answers in them.
3. create_test with the full worked solution of each question in \`solution\` (hidden from the
   student until grading). Tell the student the note path and to write answers under each
   "### Answer", then wait. Never reveal solutions before grading.
4. When the student is done, follow the grade_test workflow: get_test with include_solutions=true,
   grade every question strictly, then grade_test.`

const ORAL_EXAM = (id: string, concepts: string) => `Run a mock oral exam for course "${id}".

1. ${
  concepts
    ? `Use these concepts: ${concepts}.`
    : `study_plan {course:"${id}"}: use \`weakest\` and \`due\`, ordered like an examiner would (basics first).`
}
   get_concept for each to read the reference answer. Keep answers private.
2. Ask ONE question at a time, spoken-style, and wait for the student. Ask follow-ups on gaps
   ("why?", "what if...?"), like a real examiner; do not give the answer away mid-question.
3. After each concept, record_review {kind:"oral", verdict, answer, feedback, ref:<session id>}:
   correct = complete and accurate, partial = right idea with gaps or errors, incorrect = wrong.
4. Close with a short debrief: what was solid, what to revisit, then offer to continue.`

const GRADE_TEST = (test: string) => `Grade the practice test "${test}".

1. get_test {test:"${test}", include_solutions:true}. The student's answers are in the note under
   each "### Answer". Do not show solutions to the student before you finish grading.
2. For each question compare the final answer AND the reasoning with the solution. verdict is
   "correct" only if both are right; "partial" if the idea is right but there are gaps or errors;
   otherwise "incorrect". Award partial credit in points (0..question points). Unanswered = 0.
3. Write per-question \`feedback\` addressed to the student (what was wrong, how to fix it).
4. grade_test with one result per question and a \`report\`: total score, strengths, recurring
   mistakes, concepts to review. Then summarise the outcome to the student.`

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "build_graph",
    {
      title: "Build a course concept graph",
      description: "Generate concepts and prerequisites for a course from its sources.",
      argsSchema: { course },
    },
    ({ course: id }) => prompt(BUILD_GRAPH(id)),
  )

  server.registerPrompt(
    "practice_test",
    {
      title: "Create a practice test",
      description: "Write a practice test targeting the student's weakest concepts.",
      argsSchema: {
        course,
        count: z.string().optional().describe("Number of questions (default 5)"),
      },
    },
    ({ course: id, count }) => prompt(PRACTICE_TEST(id, Number.parseInt(count ?? "", 10) || 5)),
  )

  server.registerPrompt(
    "oral_exam",
    {
      title: "Mock oral exam",
      description: "Examine the student orally and record each answer.",
      argsSchema: {
        course,
        concepts: z.string().optional().describe("Comma-separated concepts (default: weakest)"),
      },
    },
    ({ course: id, concepts }) => prompt(ORAL_EXAM(id, concepts ?? "")),
  )

  server.registerPrompt(
    "grade_test",
    {
      title: "Grade a practice test",
      description: "Grade a completed practice test strictly against its solutions.",
      argsSchema: { test: z.string().describe("Test id, title or path") },
    },
    ({ test }) => prompt(GRADE_TEST(test)),
  )
}
