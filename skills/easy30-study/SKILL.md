---
name: easy30-study
description: Entry point for studying with Easy30. Looks at the study plan for a course and proposes the next best action: skim in Obsidian, review due concepts here in chat (ask the question, record the rating), take a practice test, or sit a mock oral. Use when the user says "let's study", "what should I study today", "study X", "review my due concepts", "what's next", "studiamo", "cosa devo studiare oggi", "ripassiamo", "facciamo un ripasso", "cosa ripasso".
---

# easy30-study: study router

Mode (a) MCP (preferred); mode (b) no MCP: derive state from the vault and log per [vault-format](../easy30-graph/references/vault-format.md). Read the vault's `AGENTS.md`/`CLAUDE.md` first. Speak the course `language` (else the user's).

## 1. Look
- `list_courses`; if several and the user did not say which, ask (mention exam dates, nearest first).
- `study_plan {course}`: due reviews, concepts ready to learn, weakest concepts. `get_course {course}` for counts per mastery and the exam date.
- If the course has no concepts: offer easy30-graph. If nothing was ever rated: propose the skim.

## 2. Propose ONE next action (short, with numbers)
Choose by situation, explain in one sentence, let the user override:
- Many unknown concepts -> **skim in Obsidian** (the Easy30 skim view is faster for first-pass triage than chat). Offer to continue here if they have no Obsidian open.
- Due reviews exist -> **review due concepts here** (below).
- Mostly green but a few red/orange, exam within ~2 weeks -> **practice test** (easy30-test) on the weakest concepts.
- Solid coverage and the student wants to simulate the exam -> **mock oral** (easy30-oral) or test.
- Nothing due and nothing ready -> say so; suggest a test/oral to find gaps, or stop for today.
Mention the exam date and days left when set.

## 3. Review in chat (when chosen)
For each due concept (most overdue first, batches of 5-10, ask how many):
1. `get_concept {concept}`; show ONLY the `question` (title optional). Never show the answer first.
2. Let the student answer from memory. Do not lead.
3. Then show the reference answer and compare briefly: what they got, what they missed.
4. Ask them to rate honestly, or propose a rating and let them correct it: 1 again (blank/wrong), 2 hard (partial/slow), 3 good (correct), 4 easy (instant and complete).
5. `record_review {concept, kind:"review", rating, answer?}` (answer = short summary of what they said). (b) append a `kind:"review"` log line.
6. Next concept. If they rate 1 on something, briefly re-explain it and, if a prerequisite looks shaky, quiz the prerequisite next (`get_concept` shows `requires`).
`undo_review {course, entry_id}` fixes a mis-rating.

For a first pass in chat (unknown concepts, `kind:"skim"`): show the question, ask whether they know it; rate 1 didn't know / 2 kinda / 3 knew. Skimming a concept as known infers its prerequisites; start from concepts ready to learn.

## 4. Wrap up
Summarize: concepts reviewed, ratings, what is next due, and the one next action recommended. Do not record anything the student did not actually answer.
