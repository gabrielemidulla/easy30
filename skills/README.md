# Easy30 agent skills

Easy30 does the AI work through your own coding agent (Claude Code, Codex, Cursor, ...) instead of a built-in model. These skills tell the agent how to build your course graph, generate and grade practice tests, run mock orals, and guide a study session.

| Skill | What it does | Say things like |
|---|---|---|
| `easy30-graph` | Builds/updates a course's prerequisite graph of atomic concepts (question, reference answer, importance, prerequisites) from your notes, PDFs, syllabus and past exams. | "build the concept graph", "crea il grafo dei concetti" |
| `easy30-test` | Generates a written practice exam in the professor's style; solutions stay hidden until grading. | "make me a practice test", "fammi una simulazione d'esame" |
| `easy30-grade` | Grades a completed test (including photos), scores result and reasoning separately, writes feedback and updates mastery. | "grade my test", "correggi il test" |
| `easy30-oral` | Mock oral exam in chat; records each concept as an oral review and gives an indicative grade. | "interrogami", "quiz me" |
| `easy30-study` | Router: reads your study plan and proposes the next action (skim, review due concepts, test, oral). | "let's study", "studiamo" |

## Install

```
npx easy30 skills install
```

Or copy the `skills/*` folders yourself into `.claude/skills/` (Claude Code) or `.agents/skills/` (Codex and other agents), either in your vault (project scope) or in your home directory (user scope). Keep the folders together: the other skills link to `easy30-graph/references/vault-format.md`.

## Use with the MCP server (recommended)

Skills work best with the `easy30` MCP server (tools such as `study_plan`, `upsert_concepts`, `record_review`, `create_test`, `grade_test`, `validate_vault`), which validates edits, rejects cycles and keeps the review log consistent. Without MCP the skills fall back to editing the Markdown files directly following `easy30-graph/references/vault-format.md`. In both modes the agent first reads your vault's `AGENTS.md`/`CLAUDE.md` and follows its conventions.
