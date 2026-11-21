---
name: easy30-graph
description: Build or update an Easy30 course's concept graph (atomic concept notes with exam question, reference answer, importance and prerequisites) from sources such as LaTeX notes, PDFs of slides/books/professor notes, syllabus ("scheda di trasparenza"), exercise sheets and past exams. Use when the user says "build the concept graph", "create a course from these notes", "extract the concepts", "add a new course", "update the graph with the new chapter", "crea il grafo dei concetti", "crea il corso da questi appunti", "estrai i concetti dal PDF", "aggiorna il grafo".
---

# easy30-graph: build / update a course concept graph

A course is a DAG of atomic concepts. Each concept = `question` (frontmatter) + reference answer (body) + `importance` + `requires` (direct prerequisites). Quality of this graph drives everything else (skim order, study plan, tests, orals), so be careful and faithful to the sources.

Two modes. Mode (a): `easy30` MCP tools available (preferred). Mode (b): no MCP; edit Markdown directly per [vault-format](references/vault-format.md).

## 0. Conventions first
Read the vault's `AGENTS.md` / `CLAUDE.md` (and any style notes) and follow them (language, formatting, LaTeX rules, folder layout). Content language = course `language`, else the language of the sources.

## 1. Identify or create the course
- (a) `list_courses`; if the course exists, `get_course {course}` to see current concepts. Otherwise `create_course {title, id?, folder?, exam?, language?, sources?}`.
- (b) look for notes with `easy30: course` frontmatter; otherwise create the course note.
- If the exam date is unknown, ask the user once (optional but useful for planning). Record every source file in `sources`.
- Ask for the sources if none are given (notes, slides, syllabus, exercise sheets, past exams). Past exams and the syllabus tell you what matters.

## 2. Read the sources fully
- Read everything; do not extract from titles or tables of contents alone. Syllabus first (scope + emphasis), then the main text, then exercises/past exams (what is actually asked).
- LaTeX/Markdown: read all files (follow `\input`/`\include`). PDFs: use the agent's PDF reading; for big ones go chapter by chapter (`pages` ranges), keeping a running list of concepts and where each lives (section/page).
- Scanned or unreadable material: say so, do not invent content.

## 3. Design the concept list (20-60 atomic concepts)
- One idea each: a definition, theorem, method or technique an exam can ask about. Merge trivia; split overloaded topics (a theorem and its application method are two concepts).
- Title: short noun phrase as the professor names it.
- Draft the list (title + one-line scope + prerequisites) and sanity-check the structure before writing full answers. For big courses show the outline to the user and proceed unless they object.
- Cover exam-relevant material only; mention gaps between syllabus and sources to the user.

## 4. Write each concept
- `question`: what the professor would ask at the oral/written exam ("Enuncia e dimostra...", "Definisci... con un esempio", "Come si calcola...").
- `answer`: concise but complete reference answer: definition, precise statement with hypotheses, key proof idea or method steps, a tiny example. Markdown + LaTeX (`$...$`, `$$...$$`). Cite the source location, e.g. "(appunti §2.3)". Never invent facts the sources do not support.
- `importance` 1-3 from syllabus/exam emphasis (3 core, 2 normal, 1 minor).
- `requires`: only genuine DIRECT dependencies (A is needed to understand B). No transitive edges (A->B->C: do not also add A->C). Prefer 0-3 per concept. Check no cycles.
- Reference: [quality-checklist](references/quality-checklist.md), [worked example](references/example.md).

## 5. Write to the vault
(a) Send in batches of at most 20 via `upsert_concepts {course, concepts:[{title, question, answer, importance, requires:[title|id]}]}`. Order batches so prerequisites come first (or put them in the same batch). Cycles and unresolved edges are skipped and reported: read the report and fix them (add the missing concept, correct the title, drop the wrong edge). Use `update_concept`, `add_prerequisite`, `remove_prerequisite`, `set_prerequisites` for corrections.

(b) One file per concept at `<course folder>/concepts/<Title>.md` with frontmatter `easy30: concept`, fresh `id`, `course`, `question`, `requires` (wikilinks), `importance`. Generate ids as `c-` + 8 chars of `[0-9a-hjkmnp-tv-z]`; check uniqueness (`grep -r "id: c-"`). Verify acyclicity yourself by walking `requires`.

## 6. Verify
(a) `get_course {course}` then `validate_vault {}`. Fix every issue (unresolved prerequisite, cycle, empty question, missing answer) and re-check. (b) Re-read each new file's frontmatter; grep for `[[...]]` targets that do not exist.

## 7. Report
Counts (new / updated / total concepts, edges), roots, deepest chains, skipped edges and why, topics in the syllabus without source coverage, anything ambiguous. Tell the student the graph is ready for the skim in Obsidian.

## Updating an existing graph
- Match by title (case/accent-insensitive) before creating: never duplicate. `upsert_concepts` updates matches; keep existing ids.
- Do not overwrite a student's own edits to answers without saying so; prefer improving gaps.
- NEVER delete a concept that has review history (check `get_concept` / `get_history`) without asking the user. Merging = update the survivor, rewire prerequisites, then ask before deleting the duplicate.
- Re-run step 6 after any change.
