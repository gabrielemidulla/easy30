# Easy30 vault format (compact copy)

Use this only when the `easy30` MCP server is NOT available (mode b). Canonical doc: `docs/vault-format.md` in the Easy30 repo. Notes are recognised by frontmatter, not location. Always read the vault's `AGENTS.md`/`CLAUDE.md` first and obey it.

## Course note (default path: `Easy30/<Title>/<Title>.md`)

```yaml
---
easy30: course
id: geometria            # unique slug [a-z0-9-]
title: Geometria
exam: 2027-01-20         # optional YYYY-MM-DD
language: it             # language of generated content
sources:                 # optional: vault-relative paths (plain strings) for files,
  - Corsi/Geometria/appunti_docente.pdf   # wikilinks only for notes inside the vault
  - src/static/geometria/index.tex
  - "[[Appunti Geometria]]"
---
Free-form notes.
```

## Concept note (default path: `<course folder>/concepts/<Title>.md`)

```yaml
---
easy30: concept
id: c-7k2m9qxa           # "c-" + 8 chars of [0-9a-hjkmnp-tv-z] (no i l o u). Never change it.
course: geometria
question: Cos'è una base di uno spazio vettoriale?
requires:                # prerequisites = wikilinks to concept notes
  - "[[Combinazione lineare]]"
importance: 3            # 1 minor .. 3 core (default 2)
---
Reference answer (body), Markdown + LaTeX ($..$, $$..$$).
```

- File name = concept title (no `/ \ : * ? " < > |`). Wikilink `[[Title]]`; if two concepts share a title use `[[folder/Title]]`.
- Edge A -> B means A is in B's `requires` (A is a prerequisite of B). The graph MUST be acyclic.
- YAML quoting: a `question` containing LaTeX, backslashes, colons, `#` or quotes goes in single quotes with inner `'` doubled (`'Cos''è $\mathbb{R}^n$?'`) or in a `|` block scalar. Never double quotes: `\m`, `\R` are read as escapes and break parsing. Keep `requires` entries quoted.
- Obsidian's MathJax ignores macros defined in the sources: write `\mathbb{R}`, never `\R`.
- Check the result with `npx easy30 doctor` (exit 0).
- When renaming a file, rewrite every `requires` link pointing to it. When deleting, remove it from other notes' `requires`.

## Review log: `.easy30/log/<course-id>.jsonl` (append-only, one JSON object per line)

```json
{"v":1,"id":"r-lq3x8k2ab12c","at":"2026-11-21T10:02:11.000Z","concept":"c-7k2m9qxa","kind":"oral","rating":2,"source":"agent","answer":"student's answer summary","grading":{"verdict":"partial","feedback":"..."}}
```

- `id`: `r-` + base36 of the epoch milliseconds + 4 random base36 chars.
- `kind`: `skim` | `review` | `test` | `oral` | `void`. `rating` 1 again, 2 hard, 3 good, 4 easy. Verdict mapping: correct -> 3, partial -> 2, incorrect -> 1.
- `source`: use `agent`. Optional: `answer`, `grading` (`verdict`, `feedback`, `score`, `max`), `ref` (test id), `ms`.
- Undo: append `{"v":1,"id":"r-...","at":"...","source":"agent","kind":"void","target":"<entry id>"}`. Never edit or delete existing lines. Create the file/dirs if missing; end each line with `\n`.
- State (FSRS, due, mastery) is derived by replaying the log; do not store it.

## Practice test note (`<course folder>/tests/<Title>.md`)

```yaml
---
easy30: test
id: t-2026-11-21-a       # "t-" + date + "-" + short suffix, unique
course: geometria
created: 2026-11-21
status: open             # open | graded
questions:
  - { id: q1, concepts: [c-7k2m9qxa], points: 6 }
---
(optional intro)

## q1 · 6 pt
Prompt...

### Answer

```

Solutions live OUTSIDE the note in `.easy30/solutions/<test-id>.md` (`# Solutions: <title>` then `## q1` + solution per question) until graded.

Grading by hand: for each question and each of its concepts append a `kind:"test"` log entry (`ref` = test id, `rating` from verdict, `grading` incl. `score`/`max`); set `status: graded`, `score`, `max` in frontmatter; append `## Grading · <score>/<max>` + report + `## Solutions` (the hidden file's content) to the note.

## Derived semantics (for choosing what to study)

Mastery: unknown (never rated); red (last rating 1 or recall < 50%); orange (last rating 2 or recall < 85%); green otherwise. A concept is *ready to learn* when it is not green and all prerequisites are green. Due = FSRS next review date <= now.
