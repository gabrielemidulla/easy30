import { describe, expect, it } from "vitest"
import { ConceptGraph } from "../src/graph.js"
import { parseLog, serializeEntry } from "../src/log.js"
import { studyPlan } from "../src/planner.js"
import { masteryOf, replay } from "../src/scheduler.js"
import type { LogEntry, Rating, ReviewKind } from "../src/schema.js"
import type { Concept } from "../src/vault.js"

const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n, 9))
let seq = 0
const rate = (
  concept: string,
  rating: Rating,
  at: Date,
  kind: ReviewKind = "review",
): LogEntry => ({
  v: 1,
  id: `r-${String(++seq).padStart(4, "0")}`,
  at: at.toISOString(),
  source: "test",
  kind,
  concept,
  rating,
})

// vectors → span → basis → dimension
const chain = new ConceptGraph([
  { id: "vectors", requires: [] },
  { id: "span", requires: ["vectors"] },
  { id: "basis", requires: ["span"] },
  { id: "dimension", requires: ["basis"] },
])

describe("masteryOf", () => {
  it("maps rating and recall probability to a colour", () => {
    expect(masteryOf(null, null)).toBe("unknown")
    expect(masteryOf(null, null, "known")).toBe("orange")
    expect(masteryOf(1, 0.99)).toBe("red")
    expect(masteryOf(3, 0.4)).toBe("red")
    expect(masteryOf(2, 0.99)).toBe("orange")
    expect(masteryOf(3, 0.8)).toBe("orange")
    expect(masteryOf(3, 0.9)).toBe("green")
  })
})

describe("replay", () => {
  it("is deterministic and schedules days ahead", () => {
    const log = [rate("span", 3, day(0))]
    const a = replay(log, chain, day(0))
    const b = replay(log, chain, day(0))
    expect(a).toEqual(b)
    const span = a.get("span")
    expect(span?.mastery).toBe("green")
    expect(span?.reps).toBe(1)
    expect(span?.due && span.due.getTime() - day(0).getTime()).toBeGreaterThan(86_400_000)
  })

  it("decays to orange and red as time passes", () => {
    const log = [rate("span", 3, day(0))]
    expect(replay(log, chain, day(1)).get("span")?.mastery).toBe("green")
    expect(replay(log, chain, day(30)).get("span")?.mastery).not.toBe("green")
  })

  it("infers prerequisites known after a good skim and dependents unknown after a miss", () => {
    const states = replay(
      [rate("basis", 3, day(0), "skim"), rate("span", 1, day(0), "skim")],
      chain,
      day(0),
    )
    expect(states.get("vectors")?.inferred).toBe("known")
    expect(states.get("span")?.inferred).toBeNull() // rated directly
    expect(states.get("span")?.mastery).toBe("red")
    expect(states.get("dimension")?.inferred).toBe("unknown")
  })

  it("ignores retracted entries", () => {
    const bad = rate("span", 1, day(0))
    const log: LogEntry[] = [
      bad,
      {
        v: 1,
        id: "r-void",
        at: day(0).toISOString(),
        source: "test",
        kind: "void",
        target: bad.id,
      },
    ]
    expect(replay(log, chain, day(0)).get("span")?.mastery).toBe("unknown")
  })

  it("credits green prerequisites on a successful review, without stacking", () => {
    const base = [rate("span", 3, day(0))]
    const soon = new Date(day(0).getTime() + 2.5 * 86_400_000)
    const dueOf = (log: LogEntry[]) => replay(log, chain, soon).get("span")?.due?.getTime() ?? 0
    const without = dueOf(base)
    const once = dueOf([...base, rate("basis", 3, soon)])
    const many = dueOf([...base, ...Array.from({ length: 20 }, () => rate("basis", 3, soon))])
    expect(once).toBeGreaterThan(without)
    expect(many).toBe(once)
  })
})

describe("log", () => {
  it("round-trips entries and skips corrupt lines", () => {
    const text = `${serializeEntry(rate("span", 3, day(0)))}{oops\n\n${JSON.stringify({ v: 2 })}\n`
    const { entries, errors } = parseLog(text)
    expect(entries).toHaveLength(1)
    expect(errors.map((e) => e.line)).toEqual([2, 4])
  })
})

describe("studyPlan", () => {
  const concept = (id: string, importance: 1 | 2 | 3, requires: string[] = []): Concept => ({
    id,
    hasStoredId: true,
    path: `${id}.md`,
    title: id,
    courseId: "la",
    question: "",
    answer: "",
    importance,
    requires,
    unresolved: [],
    requirements: [],
  })
  const concepts = [
    concept("vectors", 1),
    concept("span", 2, ["vectors"]),
    concept("matrices", 3, ["vectors"]),
    concept("basis", 3, ["span"]),
  ]
  const graph = new ConceptGraph(concepts)

  it("ranks ready-to-learn concepts by importance and skips blocked ones", () => {
    const states = replay([rate("vectors", 3, day(0))], graph, day(0))
    const plan = studyPlan(concepts, graph, states, day(0))
    expect(plan.next).toEqual(["matrices", "span"]) // basis is blocked by span
    expect(plan.due).toEqual([])
  })

  it("lists due reviews, most overdue first", () => {
    const states = replay([rate("span", 1, day(0)), rate("vectors", 1, day(1))], graph, day(20))
    expect(studyPlan(concepts, graph, states, day(20)).due).toEqual(["span", "vectors"])
  })
})
