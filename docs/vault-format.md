# Easy30 vault format (v1)

Easy30 lives inside an ordinary Obsidian vault (any folder of Markdown files).
Notes are recognised by their frontmatter, never by their location, so you can
organise folders however you like. Everything here is plain text: readable
without Easy30, editable by hand or by AI agents, and friendly to git.

## Course note

```yaml
---
easy30: course
id: geometria                 # stable slug, unique in the vault
title: Geometria              # optional, defaults to the file name
exam: 2027-01-20              # optional exam date (YYYY-MM-DD)
language: it                  # optional, language for generated content
sources:                      # optional, material agents should read
  - "[[appunti_docente.pdf]]"
  - src/static/geometria/index.tex
---
Free-form notes about the course.
```

## Concept note

```yaml
---
easy30: concept
id: c-7k2m9qxa                # stable id (assigned automatically when missing)
course: geometria             # course id
question: Cos'è una base di uno spazio vettoriale?
requires:                     # prerequisites, as wikilinks to other concept notes
  - "[[Combinazione lineare]]"
  - "[[Indipendenza lineare]]"
importance: 3                 # 1 (minor) … 3 (core), default 2
---
Reference answer and explanation, in Markdown with LaTeX ($…$, $$…$$).
```

- `requires` entries are wikilinks (`[[Title]]`, `[[folder/Title]]`, `[[Title|alias]]`).
  They resolve to concept notes by path first, then by file name (preferring the
  same course). Cross-course prerequisites are allowed.
- The edge `A → B` (A in B's `requires`) means *A is a prerequisite of B*.
  The prerequisite graph must be acyclic; tools refuse edits that create a cycle.
- If `course` is missing, the concept belongs to the course whose note sits in the
  nearest ancestor folder.
- The note body (everything after the frontmatter) is the reference answer.

## Review log

Progress is an append-only log per course at `.easy30/log/<course-id>.jsonl`
(Obsidian hides dot-folders). One JSON object per line:

```json
{"v":1,"id":"r-01jd8x…","at":"2026-11-21T10:02:11.000Z","concept":"c-7k2m9qxa","kind":"review","rating":3,"source":"obsidian","answer":"…","grading":{"verdict":"correct","feedback":"…"},"ms":41000}
```

| field | meaning |
|---|---|
| `kind` | `skim` (first pass), `review` (spaced repetition), `test` (practice exam), `oral` (mock oral), `void` |
| `rating` | 1 again · 2 hard · 3 good · 4 easy (skim uses 1–3: didn't know / kinda / knew) |
| `source` | who wrote it: `obsidian`, `mcp`, `cli`, … |
| `answer`, `grading`, `ms` | optional: the student's answer, an AI or human verdict, time spent |
| `target` | for `void` only: id of the entry being retracted |

The state of every concept (FSRS memory, due date, mastery colour) is **derived by
replaying the log**, so it never drifts and merges cleanly. Add this to
`.gitattributes` so concurrent appends from two devices merge without conflicts:

```
.easy30/log/*.jsonl merge=union
```

## Derived state

- **Scheduling:** FSRS (desired retention 0.9, no fuzz, day-level steps).
- **Mastery** (the node colour):
  - `unknown`: never rated
  - `red`: last rating *again*, or recall probability < 50%
  - `orange`: last rating *hard*, or recall probability < 85%
  - `green`: otherwise
- **Inference during the skim:** rating a concept *knew it* marks its unrated
  prerequisites as *probably known*; *didn't know* marks its unrated dependents as
  *probably unknown*. Inferred concepts are skipped in the skim by default.
- **Ready to learn:** concepts that are not green and whose prerequisites are all green.
- **Implicit review:** a successful review of B postpones each green prerequisite A
  by half of A's stability (capped at 30 days). Practising B exercises A.

## Practice tests

```yaml
---
easy30: test
id: t-2026-11-21-a
course: geometria
created: 2026-11-21
status: open                  # open | graded
questions:
  - { id: q1, concepts: [c-7k2m9qxa], points: 6 }
---
## q1 · 6 pt
Prove that …

### Answer
(write here, or embed an Excalidraw drawing / photo)
```

Solutions are kept out of sight in `.easy30/solutions/<test-id>.md` until the test is graded.
