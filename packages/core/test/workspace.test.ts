import { describe, expect, it } from "vitest"
import { readFrontmatter } from "../src/frontmatter.js"
import { MemoryFs } from "../src/fs.js"
import { parseLog } from "../src/log.js"
import { Easy30Error, Workspace } from "../src/workspace.js"

const vault = () =>
  new MemoryFs({
    "Uni/Geometria/Geometria.md": "---\neasy30: course\nid: geometria\nexam: 2027-01-20\n---\n",
    "Uni/Geometria/Vettori.md":
      "---\neasy30: concept\nid: c-vec\nquestion: Cos'è un vettore?\n---\nUn elemento di uno spazio vettoriale.\n",
    // No id, course inferred from the folder, requires by file name.
    "Uni/Geometria/sub/Span.md":
      '---\neasy30: concept\nrequires: ["[[Vettori]]", "[[Missing]]"]\n---\n',
    "Daily/2026-11-21.md": "Just a normal note mentioning easy30: concept in text.\n",
  })

describe("Workspace", () => {
  it("indexes courses and concepts, resolving links and inferring the course", async () => {
    const ws = await Workspace.open(vault())
    expect(ws.courses().map((c) => [c.id, c.exam])).toEqual([["geometria", "2027-01-20"]])
    const span = ws.findConcept("Span")
    expect(span?.courseId).toBe("geometria")
    expect(span?.requires).toEqual(["c-vec"])
    expect(span?.unresolved).toEqual(["Missing"])
    const view = await ws.view("geometria")
    expect(view.edges).toEqual([{ from: "c-vec", to: span?.id }])
    expect(view.issues.map((i) => i.message)).toContain("Unresolved prerequisite [[Missing]]")
  })

  it("records ratings, assigns missing ids and reports inferred neighbours", async () => {
    const fs = vault()
    const ws = await Workspace.open(fs)
    const span = ws.findConcept("Span")
    if (!span) throw new Error("missing")
    const { entry, changed } = await ws.rate({
      conceptId: span.id,
      kind: "skim",
      rating: 3,
      source: "test",
    })
    const stored = readFrontmatter((await fs.read("Uni/Geometria/sub/Span.md")) ?? "")
    expect(stored.id).toBe(entry.concept)
    expect(changed.map((s) => [s.conceptId, s.mastery, s.inferred]).sort()).toEqual(
      [
        ["c-vec", "orange", "known"],
        [entry.concept, "green", null],
      ].sort(),
    )
    const log = parseLog((await fs.read(".easy30/log/geometria.jsonl")) ?? "")
    expect(log.entries).toHaveLength(1)
    expect(await ws.skimQueue("geometria")).toEqual([])
    expect(await ws.skimQueue("geometria", { includeInferred: true })).toEqual(["c-vec"])
  })

  it("retracts a rating", async () => {
    const ws = await Workspace.open(vault())
    const { entry } = await ws.rate({
      conceptId: "c-vec",
      kind: "review",
      rating: 1,
      source: "test",
    })
    await ws.retract("geometria", entry.id, "test")
    expect((await ws.states("geometria")).get("c-vec")?.mastery).toBe("unknown")
    expect(await ws.history("geometria")).toEqual([])
  })

  it("creates concepts and refuses cycles", async () => {
    const ws = await Workspace.open(vault())
    const basis = await ws.createConcept({
      courseId: "geometria",
      title: "Base",
      question: "Cos'è una base?",
      answer: "Un insieme indipendente che genera.",
      requires: ["Span"],
      importance: 3,
    })
    expect(basis.path).toBe("Uni/Geometria/concepts/Base.md")
    expect(basis.requires).toHaveLength(1)
    await expect(ws.addPrerequisite("c-vec", basis.id)).rejects.toThrow(Easy30Error)
    await expect(ws.createConcept({ courseId: "geometria", title: "Base" })).rejects.toMatchObject({
      code: "conflict",
    })
  })

  it("renames a concept and rewrites links to it", async () => {
    const fs = vault()
    const ws = await Workspace.open(fs)
    await ws.renameConcept("c-vec", "Vettore")
    const span = ws.findConcept("Span")
    expect(span?.requires).toEqual(["c-vec"])
    expect(await fs.read("Uni/Geometria/sub/Span.md")).toContain("[[Vettore]]")
  })

  it("deletes a concept and drops it from dependents", async () => {
    const ws = await Workspace.open(vault())
    await ws.deleteConcept("c-vec")
    expect(ws.findConcept("Span")?.requires).toEqual([])
    expect(ws.findConcept("Vettori")).toBeNull()
  })

  it("creates and grades a practice test", async () => {
    const fs = vault()
    const ws = await Workspace.open(fs)
    const test = await ws.createTest({
      courseId: "geometria",
      title: "Prova 1",
      date: "2026-11-21",
      questions: [
        {
          id: "q1",
          prompt: "Definisci un vettore.",
          concepts: ["c-vec"],
          points: 4,
          solution: "Un elemento…",
        },
      ],
    })
    expect(await fs.read(test.path)).not.toContain("Un elemento")
    const graded = await ws.gradeTest({
      testId: test.id,
      source: "test",
      report: "Bene.",
      results: [
        {
          questionId: "q1",
          grading: { verdict: "partial", score: 2, feedback: "Manca la chiusura." },
        },
      ],
    })
    expect([graded.status, graded.score, graded.max]).toEqual(["graded", 2, 4])
    expect(await fs.read(test.path)).toContain("Un elemento")
    expect((await ws.history("geometria"))[0]).toMatchObject({
      kind: "test",
      rating: 2,
      ref: test.id,
    })
    await expect(
      ws.gradeTest({ testId: test.id, source: "test", report: "", results: [] }),
    ).rejects.toMatchObject({ code: "conflict" })
  })

  it("rejects unsafe course ids", async () => {
    const ws = await Workspace.open(new MemoryFs())
    await expect(ws.createCourse({ title: "x", id: "../etc" })).rejects.toThrow(/Invalid id/)
  })
})
