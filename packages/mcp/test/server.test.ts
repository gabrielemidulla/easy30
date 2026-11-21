import { describe, expect, it } from "vitest"
import { connect } from "./harness.js"

interface Row {
  id: string
  title: string
  [key: string]: unknown
}

describe("server surface", () => {
  it("lists the documented tools and prompts", async () => {
    const { client } = await connect()
    const tools = (await client.listTools()).tools.map((t) => t.name).sort()
    expect(tools).toEqual(
      [
        "list_courses",
        "get_course",
        "get_concept",
        "study_plan",
        "skim_queue",
        "search_notes",
        "read_note",
        "create_course",
        "upsert_concepts",
        "update_concept",
        "set_prerequisites",
        "add_prerequisite",
        "remove_prerequisite",
        "delete_concept",
        "record_review",
        "undo_review",
        "get_history",
        "create_test",
        "get_test",
        "list_tests",
        "grade_test",
        "validate_vault",
      ].sort(),
    )
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name).sort()
    expect(prompts).toEqual(["build_graph", "grade_test", "oral_exam", "practice_test"])
    const prompt = await client.getPrompt({
      name: "practice_test",
      arguments: { course: "geometria" },
    })
    expect(JSON.stringify(prompt.messages)).toContain("geometria")
  })

  it("lists and describes courses", async () => {
    const { call } = await connect()
    const list = (await call("list_courses")).json as Record<string, unknown>[]
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: "geometria",
      exam: "2099-01-20",
      concepts: 2,
      mastery: { unknown: 2, red: 0, orange: 0, green: 0 },
      due: 0,
    })
    expect(typeof list[0]?.days_to_exam).toBe("number")

    const course = (await call("get_course", { course: "geometria" })).json as {
      concepts: Row[]
      edges: unknown[]
      ready_to_learn: string[]
    }
    expect(course.concepts.map((c) => c.id).sort()).toEqual(["c-span", "c-vec"])
    expect(course.edges).toEqual([{ from: "c-vec", to: "c-span" }])
    expect(course.ready_to_learn).toEqual(["c-vec"])
  })

  it("returns full concepts with state and history", async () => {
    const { call } = await connect()
    const concept = (await call("get_concept", { concept: "Vettori" })).json as Record<
      string,
      unknown
    >
    expect(concept).toMatchObject({ id: "c-vec", answer: "Un elemento di uno spazio vettoriale." })
    expect(concept.dependents).toEqual([{ id: "c-span", title: "Span" }])
  })

  it("maps errors to isError results", async () => {
    const { call } = await connect()
    const missing = await call("get_concept", { concept: "Nope" })
    expect(missing.isError).toBe(true)
    expect(missing.text).toContain("not_found")
    const course = await call("get_course", { course: "nope" })
    expect(course.isError).toBe(true)
    const cycle = await call("set_prerequisites", { concept: "Vettori", requires: ["Span"] })
    expect(cycle.isError).toBe(true)
    expect(cycle.text).toContain("cycle")
    expect(cycle.text).toContain("Span")
  })
})

describe("upsert_concepts", () => {
  it("creates, updates, and reports skipped edges", async () => {
    const { call } = await connect()
    const first = (
      await call("upsert_concepts", {
        course: "geometria",
        concepts: [
          {
            title: "Base",
            question: "Cos'è una base?",
            answer: "Insieme libero che genera.",
            importance: 3,
            requires: ["Span", "vettori"],
          },
          { title: "Dimensione", requires: ["Base", "Fantasma"] },
          { title: "Ciclo A", requires: ["Ciclo B"] },
          { title: "Ciclo B", requires: ["Ciclo A"] },
          { title: "Vettori", answer: "Aggiornato." },
        ],
      })
    ).json as {
      created: string[]
      updated: string[]
      edges_set: number
      skipped_edges: { concept: string; requires: string; reason: string }[]
    }
    expect(first.created.sort()).toEqual(["Base", "Ciclo A", "Ciclo B", "Dimensione"])
    expect(first.updated).toEqual(["Vettori"])
    expect(first.edges_set).toBe(4)
    expect(first.skipped_edges).toHaveLength(2)
    expect(first.skipped_edges.find((e) => e.requires === "Fantasma")?.concept).toBe("Dimensione")
    const cyc = first.skipped_edges.find((e) => e.concept === "Ciclo B")
    expect(cyc?.reason).toContain("cycle")

    const base = (await call("get_concept", { concept: "Base" })).json as {
      importance: number
      requires: Row[]
    }
    expect(base.importance).toBe(3)
    expect(base.requires.map((r) => r.title).sort()).toEqual(["Span", "Vettori"])

    // Second run is an update: no creation, requires replaced.
    const second = (
      await call("upsert_concepts", {
        course: "geometria",
        concepts: [{ title: "BASE", requires: ["Span"] }],
      })
    ).json as { created: string[]; updated: string[] }
    expect(second.created).toEqual([])
    const after = (await call("get_concept", { concept: "Base" })).json as { requires: Row[] }
    expect(after.requires.map((r) => r.title)).toEqual(["Span"])
    expect((await call("validate_vault")).json).toMatchObject({ ok: true })
  })

  it("edits prerequisites individually", async () => {
    const { call } = await connect()
    await call("upsert_concepts", { course: "geometria", concepts: [{ title: "Base" }] })
    await call("add_prerequisite", { concept: "Base", requires: "Span" })
    await call("add_prerequisite", { concept: "Base", requires: ["Vettori"] })
    let base = (await call("get_concept", { concept: "Base" })).json as { requires: Row[] }
    expect(base.requires).toHaveLength(2)
    await call("remove_prerequisite", { concept: "Base", requires: "Vettori" })
    base = (await call("get_concept", { concept: "Base" })).json as { requires: Row[] }
    expect(base.requires.map((r) => r.title)).toEqual(["Span"])
    const renamed = (await call("update_concept", { concept: "Span", title: "Span lineare" }))
      .json as Row
    expect(renamed.title).toBe("Span lineare")
    const del = await call("delete_concept", { concept: "Span lineare" })
    expect(del.isError).toBe(false)
    expect(
      ((await call("get_concept", { concept: "Base" })).json as { requires: Row[] }).requires,
    ).toEqual([])
  })
})

describe("reviews", () => {
  it("records a verdict review, reports neighbours and undoes it", async () => {
    const { call } = await connect()
    const skim = (await call("record_review", { concept: "Span", kind: "skim", rating: 3 }))
      .json as {
      changed_neighbours: { title: string; inferred: string }[]
    }
    expect(skim.changed_neighbours).toMatchObject([{ title: "Vettori", inferred: "known" }])

    const rec = (
      await call("record_review", {
        concept: "Span",
        kind: "review",
        verdict: "correct",
        answer: "Le combinazioni lineari.",
        feedback: "Ok",
        ref: "oral-1",
      })
    ).json as {
      entry_id: string
      rating: number
      state: { mastery: string }
      changed_neighbours: { title: string }[]
    }
    expect(rec.rating).toBe(3)
    expect(rec.state.mastery).toBe("green")

    const history = (await call("get_history", { course: "geometria", concept: "Span" })).json as {
      entry_id: string
      grading: { verdict: string }
      source: string
    }[]
    expect(history[0]).toMatchObject({
      entry_id: rec.entry_id,
      grading: { verdict: "correct", feedback: "Ok" },
      source: "mcp:test-client",
    })

    expect(
      (await call("undo_review", { course: "geometria", entry_id: rec.entry_id })).isError,
    ).toBe(false)
    expect(((await call("get_history", { course: "geometria" })).json as unknown[]).length).toBe(1)
    expect((await call("undo_review", { course: "geometria", entry_id: "r-nope" })).isError).toBe(
      true,
    )
  })

  it("requires exactly one of rating or verdict", async () => {
    const { call } = await connect()
    expect((await call("record_review", { concept: "Span", kind: "review" })).isError).toBe(true)
    expect(
      (
        await call("record_review", {
          concept: "Span",
          kind: "review",
          rating: 3,
          verdict: "correct",
        })
      ).isError,
    ).toBe(true)
    expect(
      (await call("record_review", { concept: "Span", kind: "skim", rating: 3 })).isError,
    ).toBe(false)
  })

  it("serves the skim queue and the study plan", async () => {
    const { call } = await connect()
    const queue = (await call("skim_queue", { course: "geometria" })).json as Row[]
    expect(queue.map((q) => q.id)).toEqual(["c-vec", "c-span"])
    await call("record_review", { concept: "Span", kind: "skim", rating: 3 })
    expect(((await call("skim_queue", { course: "geometria" })).json as Row[]).length).toBe(0)
    const plan = (await call("study_plan", { course: "geometria", limit: 1 })).json as {
      weakest: Row[]
    }
    expect(plan.weakest).toHaveLength(1)
  })
})

describe("practice tests", () => {
  const questions = [
    {
      id: "q1",
      prompt: "Definisci un vettore.",
      concepts: ["Vettori"],
      points: 4,
      solution: "SOLUZIONE-SEGRETA-1",
    },
    {
      id: "q2",
      prompt: "Cos'è lo span?",
      concepts: ["Span"],
      points: 2,
      solution: "SOLUZIONE-SEGRETA-2",
    },
  ]

  it("creates, hides solutions until requested, and grades", async () => {
    const { call, fs } = await connect()
    const created = (
      await call("create_test", { course: "geometria", title: "Prova 1", questions })
    ).json as {
      id: string
      path: string
    }
    expect(created.path).toBe("Uni/tests/Prova 1.md".replace("Uni/", "Uni/Geometria/"))
    expect(await fs.read(created.path)).not.toContain("SOLUZIONE")

    const hidden = await call("get_test", { test: created.id })
    expect(hidden.text).not.toContain("SOLUZIONE")
    expect(hidden.text).toContain("### Answer")
    const shown = await call("get_test", { test: created.id, include_solutions: true })
    expect(shown.text).toContain("SOLUZIONE-SEGRETA-1")
    expect(
      ((await call("list_tests", { course: "geometria" })).json as Row[]).map((t) => t.id),
    ).toEqual([created.id])

    const result = (id: string, verdict: string, score: number, ok: boolean) => ({
      question_id: id,
      verdict,
      score,
      answer_correct: ok,
      reasoning_correct: ok,
      feedback: "f",
    })
    const inconsistent = await call("grade_test", {
      test: created.id,
      report: "r",
      results: [result("q1", "correct", 4, false), result("q2", "incorrect", 0, false)],
    })
    expect(inconsistent.isError).toBe(true)
    const incomplete = await call("grade_test", {
      test: created.id,
      report: "r",
      results: [result("q1", "correct", 4, true)],
    })
    expect(incomplete.isError).toBe(true)

    const graded = (
      await call("grade_test", {
        test: created.id,
        report: "Bene.",
        results: [result("q1", "correct", 4, true), result("q2", "partial", 1, false)],
      })
    ).json as { status: string; score: number; max: number }
    expect(graded).toMatchObject({ status: "graded", score: 5, max: 6 })
    expect(await fs.read(created.path)).toContain("SOLUZIONE-SEGRETA-2")
    expect((await call("grade_test", { test: created.id, report: "r", results: [] })).isError).toBe(
      true,
    )
    const history = (await call("get_history", { course: "geometria" })).json as { kind: string }[]
    expect(history.map((h) => h.kind)).toEqual(["test", "test"])
  })
})

describe("notes", () => {
  it("searches the whole vault", async () => {
    const { call } = await connect()
    const hits = (await call("search_notes", { query: "DETERMINANTE" })).json as {
      path: string
      line: number
      snippet: string
    }[]
    expect(hits).toEqual([
      {
        path: "Uni/Geometria/appunti.md",
        title: "appunti",
        snippet: "Il determinante misura il volume.",
        line: 2,
      },
    ])
    expect((await call("search_notes", { query: "hidden" })).json as unknown[]).toEqual([])
    expect(
      ((await call("search_notes", { query: "span", course: "geometria" })).json as unknown[])
        .length,
    ).toBeGreaterThan(0)
  })

  it("reads notes but refuses hidden folders and escapes", async () => {
    const { call } = await connect()
    expect((await call("read_note", { path: "Uni/Geometria/appunti.md" })).text).toContain(
      "determinante",
    )
    for (const path of [
      ".easy30/secret.md",
      "Uni/../.easy30/secret.md",
      "../etc/passwd.md",
      "/etc/passwd.md",
      "Uni/Geometria/x.png",
    ]) {
      const res = await call("read_note", { path })
      expect(res.isError, path).toBe(true)
    }
    expect((await call("read_note", { path: "missing.md" })).isError).toBe(true)
  })

  it("creates courses", async () => {
    const { call } = await connect()
    const course = (await call("create_course", { title: "Analisi 1", exam: "2099-02-01" }))
      .json as Row
    expect(course).toMatchObject({ id: "analisi-1", exam: "2099-02-01" })
    expect((await call("create_course", { title: "Analisi 1" })).isError).toBe(true)
  })
})
