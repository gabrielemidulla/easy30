import { describe, expect, it } from "vitest"
import { ConceptGraph } from "../src/graph.js"

// a → b → d, a → c → d
const diamond = () =>
  new ConceptGraph([
    { id: "a", requires: [] },
    { id: "b", requires: ["a"] },
    { id: "c", requires: ["a"] },
    { id: "d", requires: ["b", "c"] },
  ])

describe("ConceptGraph", () => {
  it("walks ancestors and descendants", () => {
    const g = diamond()
    expect([...g.ancestors("d")].sort()).toEqual(["a", "b", "c"])
    expect([...g.descendants("a")].sort()).toEqual(["b", "c", "d"])
    expect(g.ancestors("a").size).toBe(0)
  })

  it("orders prerequisites first, stably", () => {
    expect(diamond().topologicalOrder()).toEqual(["a", "b", "c", "d"])
    expect(diamond().topologicalOrder(["d", "c"])).toEqual(["c", "d"])
  })

  it("detects would-be cycles", () => {
    const g = diamond()
    expect(g.wouldCycle("d", "a")).toBe(true)
    expect(g.wouldCycle("a", "a")).toBe(true)
    expect(g.wouldCycle("b", "c")).toBe(false)
  })

  it("reports nodes on or behind a cycle", () => {
    const g = new ConceptGraph([
      { id: "x", requires: ["y"] },
      { id: "y", requires: ["x"] },
      { id: "z", requires: ["y"] },
      { id: "ok", requires: [] },
    ])
    expect([...g.cyclicNodes()].sort()).toEqual(["x", "y", "z"])
    expect(g.topologicalOrder()[0]).toBe("ok")
  })

  it("computes longest-path depths", () => {
    expect(Object.fromEntries(diamond().depths())).toEqual({ a: 0, b: 1, c: 1, d: 2 })
  })
})
