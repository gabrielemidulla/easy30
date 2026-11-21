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
- [ ] Source cited ("(appunti §2.3)", "(slide 14)").
- [ ] No content invented beyond the sources; flag gaps instead of guessing.
- [ ] It does not restate prerequisites at length; it links to them via `requires`.

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
- [ ] `validate_vault` clean.
- [ ] Spot-check 3 concepts by reading them.
