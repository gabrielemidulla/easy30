/** One test per finding of the first code review, so none of them comes back. */
import { describe, expect, it } from "vitest"
import { readFrontmatter, updateFrontmatter } from "../src/frontmatter.js"
import { MemoryFs } from "../src/fs.js"
import { parseLog } from "../src/log.js"
import { Workspace } from "../src/workspace.js"

const course = (id: string, extra = "") => `---\neasy30: course\nid: ${id}\n${extra}---\n`
const concept = (fm: string, body = "") => `---\neasy30: concept\n${fm}---\n${body}`

describe("review regressions", () => {
  it("serializes concurrent creates instead of overwriting a note", async () => {
    const fs = new MemoryFs({ "G/G.md": course("g") })
    const ws = await Workspace.open(fs)
    const results = await Promise.allSettled([
      ws.createConcept({ courseId: "g", title: "Base", answer: "first" }),
      ws.createConcept({ courseId: "g", title: "Base", answer: "second" }),
    ])
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"])
    expect(await fs.read("G/concepts/Base.md")).toContain("first")
  })

  it("keeps aliases and unresolved links when editing prerequisites", async () => {
    const fs = new MemoryFs({
      "G/G.md": course("g"),
      "G/A.md": concept("id: c-a\n"),
      "G/X.md": concept("id: c-x\n"),
      "G/B.md": concept('id: c-b\nrequires: ["[[A|the A]]", "[[Not written yet]]"]\n'),
    })
    const ws = await Workspace.open(fs)
    await ws.addPrerequisite("c-b", "c-x")
    expect(readFrontmatter((await fs.read("G/B.md")) ?? "").requires).toEqual([
      "[[A|the A]]",
      "[[Not written yet]]",
      "[[X]]",
    ])
    await ws.removePrerequisite("c-b", "c-a")
    expect(readFrontmatter((await fs.read("G/B.md")) ?? "").requires).toEqual([
      "[[Not written yet]]",
      "[[X]]",
    ])
  })

  it("rewrites links on rename, keeping the alias", async () => {
    const fs = new MemoryFs({
      "G/G.md": course("g"),
      "G/A.md": concept("id: c-a\n"),
      "G/B.md": concept('id: c-b\nrequires: ["[[A|the A]]"]\n'),
    })
    const ws = await Workspace.open(fs)
    await ws.renameConcept("c-a", "Alpha")
    expect(readFrontmatter((await fs.read("G/B.md")) ?? "").requires).toEqual(["[[Alpha|the A]]"])
    expect(ws.concept("c-b").requires).toEqual(["c-a"])
  })

  it("validates a whole grading before writing anything", async () => {
    const fs = new MemoryFs({ "G/G.md": course("g"), "G/A.md": concept("id: c-a\n") })
    const ws = await Workspace.open(fs)
    const test = await ws.createTest({
      courseId: "g",
      title: "T",
      questions: [
        { id: "q1", prompt: "?", concepts: ["c-a"], points: 2, solution: "!" },
        { id: "q2", prompt: "?", concepts: ["c-a"], points: 2, solution: "!" },
      ],
    })
    const q1 = { questionId: "q1", grading: { verdict: "correct" as const, score: 2 } }
    await expect(
      ws.gradeTest({ testId: test.id, source: "t", report: "", results: [q1] }),
    ).rejects.toThrow(/Missing results for q2/)
    await expect(
      ws.gradeTest({
        testId: test.id,
        source: "t",
        report: "",
        results: [q1, { questionId: "q2", grading: { verdict: "partial", score: 9 } }],
      }),
    ).rejects.toThrow(/score/)
    expect(await fs.read(".easy30/log/g.jsonl")).toBeNull()
    expect(ws.test(test.id).status).toBe("open")
  })

  it("skips concepts deleted since the test was written", async () => {
    const fs = new MemoryFs({
      "G/G.md": course("g"),
      "G/A.md": concept("id: c-a\n"),
      "G/B.md": concept("id: c-b\n"),
    })
    const ws = await Workspace.open(fs)
    const test = await ws.createTest({
      courseId: "g",
      title: "T",
      questions: [{ id: "q1", prompt: "?", concepts: ["c-a", "c-b"], points: 1, solution: "!" }],
    })
    await ws.deleteConcept("c-b")
    await ws.gradeTest({
      testId: test.id,
      source: "t",
      report: "ok",
      results: [{ questionId: "q1", grading: { verdict: "correct", score: 1 } }],
    })
    const log = parseLog((await fs.read(".easy30/log/g.jsonl")) ?? "")
    expect(log.entries.map((e) => (e.kind === "void" ? "" : e.concept))).toEqual(["c-a"])
  })

  it("stores a derived course id before logging, so renaming the course note is safe", async () => {
    const fs = new MemoryFs({
      "G/Geometria.md": "---\neasy30: course\n---\n",
      "G/A.md": concept("id: c-a\n"),
    })
    const ws = await Workspace.open(fs)
    await ws.rate({ conceptId: "c-a", kind: "review", rating: 3, source: "t" })
    expect(readFrontmatter((await fs.read("G/Geometria.md")) ?? "").id).toBe("geometria")
    await fs.rename("G/Geometria.md", "G/Geometria I.md")
    await ws.refresh()
    expect((await ws.states("geometria")).get("c-a")?.mastery).toBe("green")
  })

  it("reports unsafe hand-written ids instead of crashing", async () => {
    const ws = await Workspace.open(new MemoryFs({ "G/G.md": course('"Analisi 1"') }))
    expect(ws.courses()).toEqual([])
    expect(ws.issues[0]?.message).toMatch(/id/)
  })

  it("reads quoted values, comments, BOM, CRLF and empty frontmatter", async () => {
    const fs = new MemoryFs({
      "a.md": '---\neasy30: "course"\nid: a\n---\n',
      "b.md": "﻿---\neasy30: course # note\nid: b\n---\n",
      "c.md": "---\r\neasy30: course\r\nid: c\r\n---\r\nBody\r\n",
      "d.md": "---\n---\nplain\n",
    })
    const ws = await Workspace.open(fs)
    expect(ws.courses().map((c) => c.id)).toEqual(["a", "b", "c"])
    const crlf = updateFrontmatter((await fs.read("c.md")) ?? "", { title: "C" })
    expect(crlf).toBe("---\r\neasy30: course\r\nid: c\r\ntitle: C\r\n---\r\nBody\r\n")
    const bom = updateFrontmatter((await fs.read("b.md")) ?? "", { title: "B" })
    expect(bom.startsWith("﻿---\n")).toBe(true)
    expect(bom.match(/---/g)).toHaveLength(2)
    expect(updateFrontmatter("---\n---\nplain\n", { x: 1 })).toBe("---\nx: 1\n---\nplain\n")
  })

  it("shows a cross-course concept with the same state from both courses", async () => {
    const fs = new MemoryFs({
      "A/A.md": course("a"),
      "B/B.md": course("b"),
      "B/P.md": concept("id: c-p\n"),
      "A/X.md": concept('id: c-x\nrequires: ["[[P]]"]\n'),
    })
    const ws = await Workspace.open(fs)
    await ws.rate({ conceptId: "c-x", kind: "skim", rating: 3, source: "t" })
    const fromA = (await ws.view("a")).concepts.find((c) => c.id === "c-p")?.state
    const fromB = (await ws.view("b")).concepts.find((c) => c.id === "c-p")?.state
    expect(fromA?.inferred).toBe("known")
    expect(fromB).toEqual(fromA)
  })

  it("refuses to guess between same-titled concepts in other courses", async () => {
    const ws = await Workspace.open(
      new MemoryFs({
        "A/A.md": course("a"),
        "B/B.md": course("b"),
        "C/C.md": course("c"),
        "A/Definizione.md": concept("id: c-1\n"),
        "B/Definizione.md": concept("id: c-2\n"),
        "C/X.md": concept('id: c-x\nrequires: ["[[Definizione]]"]\n'),
      }),
    )
    expect(() => ws.findConcept("Definizione")).toThrow(/matches 2 concepts/)
    expect(ws.findConcept("Definizione", "b")?.id).toBe("c-2")
    expect(ws.concept("c-x").requires).toEqual([])
    expect(ws.issues.some((i) => /Ambiguous prerequisite/.test(i.message))).toBe(true)
  })

  it("validates a new course before writing it", async () => {
    const fs = new MemoryFs()
    const ws = await Workspace.open(fs)
    await expect(ws.createCourse({ title: "Geo", exam: "next tuesday" })).rejects.toThrow(/exam/)
    await expect(ws.createCourse({ title: "Geo", folder: ".hidden" })).rejects.toThrow(/folder/)
    expect(fs.files.size).toBe(0)
  })

  it("rejects skim ratings above 3", async () => {
    const ws = await Workspace.open(
      new MemoryFs({ "G/G.md": course("g"), "G/A.md": concept("id: c-a\n") }),
    )
    await expect(
      ws.rate({ conceptId: "c-a", kind: "skim", rating: 4, source: "t" }),
    ).rejects.toThrow(/Skim ratings/)
  })

  it("re-reads only changed notes and drops deleted ones", async () => {
    const fs = new MemoryFs({
      "G/G.md": course("g"),
      "G/A.md": concept("id: c-a\nquestion: old\n"),
    })
    const ws = await Workspace.open(fs)
    await fs.write("G/A.md", concept("id: c-a\nquestion: new\n"))
    await fs.write("G/B.md", concept("id: c-b\n"))
    await ws.refresh()
    expect(ws.concept("c-a").question).toBe("new")
    await fs.remove("G/B.md")
    await ws.refresh()
    expect(ws.findConcept("c-b")).toBeNull()
  })

  it("upserts a batch: creates, updates, links within the batch, skips cycles", async () => {
    const fs = new MemoryFs({
      "G/G.md": course("g"),
      "G/concepts/Vettore.md": concept("id: c-v\n"),
    })
    const ws = await Workspace.open(fs)
    const result = await ws.upsertConcepts("g", [
      { title: "Span", question: "Cos'è lo span?", requires: ["Vettore"] },
      { title: "Base", requires: ["Span", "Missing"] },
      { title: "Vettore", answer: "Un elemento di V.", requires: ["Base"] },
    ])
    expect(result.created).toEqual(["Span", "Base"])
    expect(result.updated).toEqual(["Vettore"])
    expect(result.skipped.map((s) => [s.concept, s.requires, s.reason])).toEqual([
      ["Base", "Missing", "not found"],
      ["Vettore", "Base", "would create a cycle"],
    ])
    expect(ws.findConcept("Base", "g")?.requires).toEqual([ws.findConcept("Span", "g")?.id])
    expect(ws.concept("c-v").answer).toBe("Un elemento di V.")
  })
})
