import { MemoryFs } from "@easy30/core"
import { describe, expect, it } from "vitest"
import { SelfWrites, TrackedFs } from "../src/self-writes"

describe("TrackedFs", () => {
  it("recognises its own writes but not later external ones", async () => {
    const inner = new MemoryFs({ "a.md": "x" })
    const writes = new SelfWrites()
    const fs = new TrackedFs(inner, writes)
    await fs.write("a.md", "y")
    const mtime = await inner.mtime("a.md")
    expect(writes.isOwn("a.md", mtime)).toBe(true)
    await inner.write("a.md", "external")
    expect(writes.isOwn("a.md", await inner.mtime("a.md"))).toBe(false)
    expect(writes.isOwn("never.md", 1)).toBe(false)
  })

  it("tracks rename targets and removals", async () => {
    const inner = new MemoryFs({ "a.md": "x" })
    const writes = new SelfWrites()
    const fs = new TrackedFs(inner, writes)
    await fs.rename("a.md", "b.md")
    expect(writes.isOwn("b.md", await inner.mtime("b.md"))).toBe(true)
    expect(writes.isOwn("a.md", null)).toBe(true)
    await fs.remove("b.md")
    expect(writes.isOwn("b.md", null)).toBe(true)
  })
})
