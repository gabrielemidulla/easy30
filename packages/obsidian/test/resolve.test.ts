import { MemoryFs, Workspace } from "@easy30/core"
import { describe, expect, it } from "vitest"
import { remapQueue, resolveConcept } from "../src/study/resolve"

const open = () =>
  Workspace.open(
    new MemoryFs({
      "Geo/Geo.md": "---\neasy30: course\nid: geo\n---\n",
      "Geo/A.md": "---\neasy30: concept\n---\n",
      "Geo/B.md": "---\neasy30: concept\nid: c-b\n---\n",
    }),
  )

describe("resolveConcept / remapQueue", () => {
  it("follows a path: id to the stored id assigned later", async () => {
    const ws = await open()
    const [a] = ws.conceptsOf("geo").filter((c) => c.path === "Geo/A.md")
    expect(a?.id).toBe("path:Geo/A.md")
    const paths = new Map([["path:Geo/A.md", "Geo/A.md"]])
    await ws.rate({ conceptId: "path:Geo/A.md", kind: "review", rating: 3, source: "test" })
    expect(resolveConcept(ws, "path:Geo/A.md", undefined)).toBeNull()
    const ids = remapQueue(ws, ["path:Geo/A.md", "c-b"], paths)
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe("path:Geo/A.md")
    expect(ids[1]).toBe("c-b")
  })

  it("drops concepts that were deleted", async () => {
    const fs = new MemoryFs({
      "Geo/Geo.md": "---\neasy30: course\nid: geo\n---\n",
      "Geo/B.md": "---\neasy30: concept\nid: c-b\n---\n",
    })
    const ws = await Workspace.open(fs)
    await fs.remove("Geo/B.md")
    await ws.refresh()
    expect(remapQueue(ws, ["c-b"], new Map([["c-b", "Geo/B.md"]]))).toEqual([])
  })
})
