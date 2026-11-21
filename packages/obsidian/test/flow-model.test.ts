import { MemoryFs, Workspace } from "@easy30/core"
import { describe, expect, it } from "vitest"
import { relatives, summarize, toFlowModel, withHover } from "../src/components/flow-model"
import { layoutGraph } from "../src/components/layout"

const vault = () =>
  new MemoryFs({
    "Geo/Geo.md": "---\neasy30: course\nid: geo\n---\n",
    "Geo/A.md": "---\neasy30: concept\nid: c-a\nimportance: 3\n---\n",
    "Geo/B.md": '---\neasy30: concept\nid: c-b\nrequires: ["[[A]]"]\n---\n',
    "Geo/C.md": '---\neasy30: concept\nid: c-c\nrequires: ["[[B]]", "[[X]]"]\n---\n',
    "Other/Other.md": "---\neasy30: course\nid: other\n---\n",
    "Other/X.md": "---\neasy30: concept\nid: c-x\ncourse: other\n---\n",
  })

async function load() {
  const ws = await Workspace.open(vault())
  const view = await ws.view("geo", new Date("2026-11-21T10:00:00Z"))
  return { ws, view }
}

describe("toFlowModel", () => {
  it("maps concepts and edges, marking externals and ready nodes", async () => {
    const { view } = await load()
    const model = toFlowModel(view)
    expect(model.nodes.map((n) => n.conceptId).sort()).toEqual(["c-a", "c-b", "c-c", "c-x"])
    expect(model.edges.map((e) => [e.source, e.target]).sort()).toEqual([
      ["c-a", "c-b"],
      ["c-b", "c-c"],
      ["c-x", "c-c"],
    ])
    const byId = new Map(model.nodes.map((n) => [n.conceptId, n]))
    expect(byId.get("c-x")?.external).toBe(true)
    expect(byId.get("c-x")?.ready).toBe(false)
    expect(byId.get("c-a")?.importance).toBe(3)
    expect(byId.get("c-a")?.mastery).toBe("unknown")
    expect(byId.get("c-a")?.ready).toBe(true)
  })

  it("keeps the signature stable across data-only changes", async () => {
    const { ws, view } = await load()
    const before = toFlowModel(view).signature
    await ws.rate({ conceptId: "c-a", kind: "review", rating: 3, source: "test" })
    const after = toFlowModel(await ws.view("geo")).signature
    expect(after).toBe(before)
  })

  it("changes the signature when an edge is added", async () => {
    const { ws, view } = await load()
    const before = toFlowModel(view).signature
    await ws.addPrerequisite("c-c", "c-a")
    expect(toFlowModel(await ws.view("geo")).signature).not.toBe(before)
  })

  it("summarises own concepts only and counts due ones", async () => {
    const { ws } = await load()
    const past = new Date("2026-01-01T00:00:00Z")
    await ws.rate({ conceptId: "c-a", kind: "review", rating: 3, source: "test" }, past)
    const view = await ws.view("geo", new Date("2026-11-21T00:00:00Z"))
    const summary = summarize(toFlowModel(view, new Date("2026-11-21T00:00:00Z")))
    expect(summary.total).toBe(3)
    expect(summary.due).toBe(1)
    expect(summary.unknown + summary.red + summary.orange + summary.green).toBe(3)
  })
})

describe("hover highlighting", () => {
  it("finds transitive prerequisites and dependents", async () => {
    const { view } = await load()
    const { edges } = toFlowModel(view)
    expect([...relatives(edges, "c-b")].sort()).toEqual(["c-a", "c-c"])
    expect([...relatives(edges, "c-a")].sort()).toEqual(["c-b", "c-c"])
  })

  it("dims unrelated nodes only", async () => {
    const { view } = await load()
    const dimmed = withHover(toFlowModel(view), "c-a")
      .filter((n) => n.dimmed)
      .map((n) => n.conceptId)
    expect(dimmed).toEqual(["c-x"])
  })
})

describe("layoutGraph", () => {
  it("puts prerequisites above their dependents", async () => {
    const { view } = await load()
    const { nodes, edges } = toFlowModel(view)
    const positions = await layoutGraph(
      nodes.map((n) => n.conceptId),
      edges,
    )
    expect(positions.size).toBe(4)
    for (const e of edges) {
      const from = positions.get(e.source)
      const to = positions.get(e.target)
      expect(from && to && from.y < to.y).toBe(true)
    }
  })
})
