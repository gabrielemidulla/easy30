---
name: easy30-grade
description: Grade a completed Easy30 practice test against its hidden worked solutions, reading the student's text, LaTeX, embedded photos and drawings, scoring result and reasoning separately, giving specific feedback and a report, and updating mastery. Use when the user says "grade my test", "correct my answers", "I finished the practice test", "check my exam", "correggi il test", "correggi la mia prova", "ho finito la simulazione, valutala", "dammi il voto".
---

# easy30-grade: grade a practice test

Mode (a) MCP (preferred); mode (b) edit files per [vault-format](../easy30-graph/references/vault-format.md). Read the vault's `AGENTS.md`/`CLAUDE.md` first. Write feedback in the course `language`.

## 1. Load
- Find the test: `list_tests {course}` (pick the open one the student means; ask if several). `get_test {test, include_solutions: true}` returns questions, points, concepts, solutions and the note path.
- (b) Read the test note and `.easy30/solutions/<test-id>.md`.
- Read the student's answers in the note (under each `### Answer`). Also read `get_concept` of the question's concepts if you need the course's definitions.
- Embedded images (`![[photo.jpg]]`, `![](...)`): open and read every image file in the vault. Excalidraw (`.excalidraw`, `.excalidraw.md`): read its text elements if legible; if the drawing cannot be interpreted, ask the user to export/embed a PNG and wait. Never grade what you could not read; never assume a blank or unreadable answer is correct.
- Empty `### Answer` = not attempted: score 0, verdict incorrect, feedback "not attempted" with a pointer to the concept.

## 2. Grade each question (rubric thinking)
Compare to the solution and its rubric, step by step:
1. `answer_correct`: is the final result/claim correct?
2. `reasoning_correct`: is the procedure/proof sound and complete, with justified steps?
3. Find the FIRST wrong or missing step and say exactly what it is.
4. `verdict`:
   - `correct` ONLY if both are true;
   - `partial` if mostly sound (e.g. right method, arithmetic slip; correct reasoning with an incomplete final step; minor gap in a proof);
   - `incorrect` otherwise. A correct final result with wrong or missing procedure is `incorrect` (or `partial` if mostly sound); a lucky guess earns little.
5. `score`: proportional partial credit following the solution's rubric (0..points; halves allowed). An error that propagates is penalised once (follow-through credit if later steps are right given the error), as a fair examiner would.
6. `feedback`: specific, kind, in the course language: what was good, the first wrong step, the correct idea (without dumping the full solution; it is appended to the note on grading anyway), and which concept to revisit.
Accept valid alternative methods even if different from the reference solution. Be consistent across questions.

## 3. Submit
(a) `grade_test {test, results:[{question_id, verdict, score, answer_correct, reasoning_correct, feedback}], report}`. Include every question. The tool writes the score, appends the report and the solutions to the note, and records a rating for each question's concepts (correct -> good, partial -> hard, incorrect -> again).
(b) Per question and concept append a log line (`kind:"test"`, `ref` = test id, rating from verdict, `grading` with verdict/feedback/score/max); set `status: graded`, `score`, `max` in the test frontmatter; append `## Grading · score/max`, the report and `## Solutions` to the note.

`report` (Markdown, course language): total score and indicative grade (/30 if the course is Italian, else %), per-question one-liners, strongest areas, weakest areas with the recurring error pattern, and "what to review next" as an ordered list of concept titles.

## 4. Close the loop
Tell the student the score and the 2-3 most important takeaways in chat (not the whole report). Suggest next steps: review the red/orange concepts (easy30-study), re-read the answers of failed concepts, then retry a new test on them (easy30-test) or an oral (easy30-oral). If a rating looks unfair to the student, offer to re-check that question (`undo_review` can retract a wrong entry, then regrade).

## Rules
- Grade only what the student wrote. Do not complete their reasoning for them.
- Do not grade before the student says the test is done. Never regrade a `graded` test without asking.
