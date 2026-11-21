import { describe, expect, it } from "vitest"
import { runDoctor } from "../src/commands/doctor.js"
import { runInit } from "../src/commands/init.js"
import { BLOCK_END, BLOCK_START } from "../src/lib/managed-block.js"
import { capture, emptyAssets, fakeAssets, put, slurp, tempDir } from "./helpers.js"

const base = { example: false, agents: true, force: false }

describe("init", () => {
  it("sets up an empty folder, then keeps everything on the second run", async () => {
    const dir = await tempDir()
    const assets = await fakeAssets()
    const first = capture()
    expect(await runInit({ ...base, dir, assets }, first)).toBe(0)
    expect(first.text()).toContain("created  .obsidian/plugins/easy30/main.js")
    expect(await slurp(dir, ".obsidian/community-plugins.json")).toContain('"easy30"')
    expect(await slurp(dir, ".gitattributes")).toBe(".easy30/log/*.jsonl merge=union\n")
    expect(await slurp(dir, ".claude/skills/easy30-review/SKILL.md")).toContain("Review.")
    expect(await slurp(dir, ".agents/skills/easy30-review/SKILL.md")).toContain("Review.")
    await expect(slurp(dir, ".claude/skills/other-skill/SKILL.md")).rejects.toThrow()
    expect(first.text()).toContain("npx")

    const second = capture()
    await runInit({ ...base, dir, assets }, second)
    expect(second.text()).not.toMatch(/created|updated/)
    expect(second.text()).toContain("kept     AGENTS.md")
    expect(await slurp(dir, ".gitattributes")).toBe(".easy30/log/*.jsonl merge=union\n")
  })

  it("replaces only the easy30 block of AGENTS.md and never duplicates it", async () => {
    const dir = await tempDir()
    const assets = await emptyAssets()
    await put(dir, "AGENTS.md", `# Mine\n\n${BLOCK_START}\nOLD\n${BLOCK_END}\n\nTail\n`)
    await runInit({ ...base, dir, assets }, capture())
    await runInit({ ...base, dir, assets }, capture())
    const text = await slurp(dir, "AGENTS.md")
    expect(text.startsWith("# Mine\n\n")).toBe(true)
    expect(text.endsWith("\n\nTail\n")).toBe(true)
    expect(text).not.toContain("OLD")
    expect(text.split(BLOCK_START)).toHaveLength(2)
  })

  it("adds the block to CLAUDE.md only when it exists", async () => {
    const dir = await tempDir()
    const assets = await emptyAssets()
    await runInit({ ...base, dir, assets }, capture())
    await expect(slurp(dir, "CLAUDE.md")).rejects.toThrow()
    await put(dir, "CLAUDE.md", "# Claude rules\n")
    await runInit({ ...base, dir, assets }, capture())
    const text = await slurp(dir, "CLAUDE.md")
    expect(text).toContain("# Claude rules")
    expect(text).toContain(BLOCK_START)
  })

  it("merges .mcp.json and community-plugins.json without losing entries", async () => {
    const dir = await tempDir()
    await put(dir, ".mcp.json", JSON.stringify({ mcpServers: { other: { command: "x" } } }))
    await put(dir, ".obsidian/community-plugins.json", '["dataview"]')
    const out = capture()
    await runInit({ ...base, dir, assets: await emptyAssets() }, out)
    const mcp = JSON.parse(await slurp(dir, ".mcp.json"))
    expect(Object.keys(mcp.mcpServers)).toEqual(["other", "easy30"])
    expect(mcp.mcpServers.easy30.args).toEqual(["-y", "easy30-mcp", "--vault", "."])
    expect(JSON.parse(await slurp(dir, ".obsidian/community-plugins.json"))).toEqual([
      "dataview",
      "easy30",
    ])
    expect(out.text()).toContain("warning")
  })

  it("--no-agents skips agent files", async () => {
    const dir = await tempDir()
    await runInit({ ...base, agents: false, dir, assets: await fakeAssets() }, capture())
    for (const f of ["AGENTS.md", ".mcp.json", ".claude/skills/easy30-review/SKILL.md"]) {
      await expect(slurp(dir, f)).rejects.toThrow()
    }
  })

  it("--example creates a course that doctor accepts, and is idempotent", async () => {
    const dir = await tempDir()
    const assets = await fakeAssets()
    await runInit({ ...base, example: true, dir, assets }, capture())
    const again = capture()
    await runInit({ ...base, example: true, dir, assets }, again)
    expect(again.text()).toMatch(/kept\s+Easy30\/Linear Algebra \(example\)/)
    const out = capture()
    expect(await runDoctor({ dir, fix: false }, out)).toBe(0)
    expect(out.text()).toContain("8 concepts")
    expect(out.text()).toContain("No problems found.")
    expect(await slurp(dir, "Easy30/Linear Algebra (example)/concepts/Basis.md")).toContain(
      "[[Linear independence]]",
    )
  })
})
