---
name: easy30-test
description: Generate a written practice exam (practice test) for an Easy30 course, modelled on the professor's past exams and exercise sheets, with realistic points and hidden worked solutions, saved as a note the student answers in Obsidian. Use when the user says "make me a practice test", "generate a mock written exam", "test me on X", "quiz on these concepts", "fammi una simulazione d'esame", "crea una prova scritta", "genera un compito di prova", "fammi un test sugli argomenti deboli".
---

# easy30-test: generate a practice exam

Mode (a) MCP (preferred); mode (b) no MCP: write the files per [vault-format](../easy30-graph/references/vault-format.md). Read the vault's `AGENTS.md`/`CLAUDE.md` first and follow it. Write in the course `language`.

## 1. Pick the course and concepts
- Course: `list_courses` / ask. `get_course {course}` for concepts and exam date.
- Concepts, in this order of preference:
  1. the ones the user names (`search_notes` / `get_course` to resolve them);
  2. otherwise `study_plan {course}`: weakest + due, weighted by importance; add concepts that are prerequisites of those if the exam would combine them.
- Skip concepts never skimmed/unknown unless asked: a test on unseen material is not useful. Say what you skipped.
- Ask only if essential: duration/points total and scope. Defaults: 90 min, 30 points (or the real exam's total), 4-6 questions.

## 2. Learn the professor's style
- Read `sources` of the course (`get_course`; open past exams, exercise sheets, syllabus). Note: question formulation, typical length, balance computational vs theory, point distribution, notation, whether proofs are required, use of multi-part questions.
- If no past exams exist, say so and use standard style for the subject; do not claim it matches the professor.
- Read the answers of the selected concepts (`get_concept {concept}`) so questions and solutions are consistent with the course's definitions and notation.

## 3. Design questions
- Mix like the real exam: e.g. 2-3 computational exercises, 1-2 theory (definition/statement/proof), maybe 1 short true-false-with-justification.
- Each question: a self-contained `prompt` (Markdown + LaTeX, numeric data included, sub-parts a/b/c), `concepts` (ids it exercises, 1-3), `points` (sum to the total; harder = more), unique `id` (q1, q2...).
- Original problems in the exam's style, never copies of past exams. Difficulty matches the exam: not harder than the professor's.
- Double-check every number: solve each exercise yourself before writing the solution.

## 4. Write full worked solutions
`solution` per question: complete reference solution with steps, final result, and a rubric line (how points split between result and reasoning, e.g. "2 pt setup, 3 pt computation, 1 pt conclusion"; common mistakes). Solutions are hidden from the student until grading.

## 5. Create the test
(a) `create_test {course, title, intro?, questions:[{id, prompt, concepts, points, solution}]}`. `intro` = duration, total points, allowed material, instructions. Title descriptive and unique (e.g. "Prova di prova 2026-11-21 - Autovalori").
(b) Write `<course folder>/tests/<Title>.md` per the format (frontmatter + `## qN · P pt` + prompt + `### Answer` per question) and the solutions to `.easy30/solutions/<test-id>.md`. Keep prompts and LaTeX in the Markdown body, not in YAML; any free-text frontmatter value with `:`, `#`, quotes or backslashes goes in single quotes (inner `'` doubled). Expand the source's custom macros (`\R` -> `\mathbb{R}`) since Obsidian does not know them. Then run `npx easy30 doctor` (exit 0).

## 6. Hand over
Tell the student:
- where the note is (path / title) and the total points and suggested time;
- they answer under each `### Answer` in text, LaTeX, an embedded photo, or an Excalidraw drawing;
- to say "grade it" / "correggi" when done (easy30-grade).

## Rules
- NEVER show solutions, hints, or the rubric before grading, in the note, in chat, or in the summary. Do not paste the solution text in your reply after `create_test`.
- Do not grade or comment on the test until the student asks.
- If the student asks for a hint mid-test, give a minimal nudge without revealing the method, and tell them it will be noted.
