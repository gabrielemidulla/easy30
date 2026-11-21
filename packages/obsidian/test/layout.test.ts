import { describe, expect, it } from "vitest"
import { edgeId, type FlowEdge } from "../src/components/flow-model"
import { layoutGraph } from "../src/components/layout"

const edge = (source: string, target: string): FlowEdge => ({
  id: edgeId(source, target),
  source,
  target,
})

describe("layoutGraph", () => {
  it("uses longest-path layers and centres each layer", () => {
    const p = layoutGraph(
      ["a", "b", "c", "d"],
      [edge("a", "b"), edge("b", "c"), edge("a", "c"), edge("a", "d")],
    )
    expect(p.get("a")?.y).toBe(0)
    expect(p.get("b")?.y).toBe(p.get("d")?.y)
    expect((p.get("c")?.y ?? 0) > (p.get("b")?.y ?? 0)).toBe(true)
    // Single-node layers share the centre of the two-node layer.
    const mid = ((p.get("b")?.x ?? 0) + (p.get("d")?.x ?? 0)) / 2
    expect(p.get("a")?.x).toBe(mid)
  })

  it("never overlaps nodes in a layer", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `n${i}`)
    const p = layoutGraph(ids, [])
    const xs = [...p.values()].map((v) => v.x).sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i++)
      expect((xs[i] ?? 0) - (xs[i - 1] ?? 0)).toBeGreaterThanOrEqual(188)
  })

  it("lays disconnected components side by side without overlap", () => {
    const p = layoutGraph(["a", "b", "x", "y"], [edge("a", "b"), edge("x", "y")])
    expect(p.get("a")?.y).toBe(0)
    expect(p.get("x")?.y).toBe(0)
    expect(Math.abs((p.get("a")?.x ?? 0) - (p.get("x")?.x ?? 0))).toBeGreaterThanOrEqual(188)
  })

  it("reduces crossings with barycenter sweeps", () => {
    // a->d, b->c would cross if layers kept input order c,d.
    const p = layoutGraph(["a", "b", "c", "d"], [edge("a", "d"), edge("b", "c")])
    expect((p.get("a")?.x ?? 0) < (p.get("b")?.x ?? 0)).toBe(
      (p.get("d")?.x ?? 0) < (p.get("c")?.x ?? 0),
    )
  })

  it("places every node on a cycle and ignores unknown/self edges", () => {
    const p = layoutGraph(
      ["a", "b", "c"],
      [edge("a", "b"), edge("b", "a"), edge("c", "c"), edge("c", "zzz")],
    )
    expect([...p.keys()].sort()).toEqual(["a", "b", "c"])
  })

  it("handles an empty graph", () => {
    expect(layoutGraph([], []).size).toBe(0)
  })

  it("lays out 500 nodes quickly", () => {
    const ids = Array.from({ length: 500 }, (_, i) => `n${i}`)
    const edges: FlowEdge[] = []
    for (let i = 1; i < 500; i++) {
      edges.push(edge(`n${Math.floor(i / 3)}`, `n${i}`))
      if (i > 10) edges.push(edge(`n${(i * 7) % i}`, `n${i}`))
    }
    const start = performance.now()
    const p = layoutGraph(ids, edges)
    const ms = performance.now() - start
    console.info(`layout 500 nodes: ${ms.toFixed(1)} ms`)
    expect(p.size).toBe(500)
    expect(ms).toBeLessThan(200)
  })
})
