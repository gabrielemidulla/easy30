# Concept graph quality checklist

Run through this before and after sending concepts.

## Atomicity
- [ ] One idea per concept: a definition, a theorem, a method, or a technique. If the answer needs "and also...", split.
- [ ] Could the professor ask it as a standalone exam question? If not, merge it into its parent.
- [ ] Merge trivia (notation, one-line remarks) into the concept that uses them.
- [ ] 20-60 concepts for a typical course; far outside that range means wrong granularity.
- [ ] No duplicates or near-duplicates (same title ignoring case/accents/plurals).

## Titles
- [ ] Short noun phrase as the professor names it ("Teorema di Rouché-Capelli", not "Come si risolve un sistema").
- [ ] In the course language; unique within the course; no characters illegal in file names.

## Question
- [ ] Reads like a real exam question ("Enuncia e dimostra...", "Definisci... e fai un esempio", "Come si calcola...").
- [ ] Answerable from the concept's answer alone.
- [ ] Mix of kinds: definitions, statements, proof sketches, computations, examples.

## Answer
- [ ] Complete but concise: definition, statement with hypotheses, key proof idea OR method steps, one tiny example.
- [ ] Markdown + LaTeX; every symbol defined.
- [ ] Source cited with the most specific locator ("(appunti §3.2)", "(slide p. 14)", "(Esempio 4)").
- [ ] Source macros expanded (`\R` -> `\mathbb{R}`, `\Sol` -> `\operatorname{Sol}`): Obsidian's MathJax does not know them.
- [ ] No content invented beyond the sources; flag gaps instead of guessing.
- [ ] It does not restate prerequisites at length; it links to them via `requires`.

## YAML (mode b)
- [ ] `question` with LaTeX, backslashes, colons, `#` or quotes is in single quotes (inner `'` doubled) or a `|` block; never double quotes.
- [ ] `requires` entries are quoted wikilinks.

## Importance
- [ ] 3 = core (stressed in syllabus, appears in every past exam), 2 = normal, 1 = minor/optional.
- [ ] Not everything is 3.

## Prerequisites
- [ ] Only genuine, DIRECT dependencies: A is needed to understand B.
- [ ] No transitive edges: if A->B->C, do not add A->C.
- [ ] Typically 0-3 prerequisites per concept; 5+ suggests the concept is overloaded.
- [ ] No cycles (the tool skips cyclic edges and reports them; fix the underlying design).
- [ ] No unresolved titles (typos in `requires`).
- [ ] Roots (no prerequisites) are truly foundational; no isolated nodes unless the topic is independent.

## After sending
- [ ] `get_course`: counts match, issues empty, edges as designed.
- [ ] `validate_vault` clean (mode b: `npx easy30 doctor` exits 0).
- [ ] Spot-check 3 concepts by reading them.
