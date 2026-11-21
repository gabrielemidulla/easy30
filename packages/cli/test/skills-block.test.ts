import { describe, expect, it } from "vitest"
import { installSkills } from "../src/commands/skills.js"
import { mergeMcpConfig } from "../src/lib/json-config.js"
import { BLOCK_END, BLOCK_START, upsertBlock } from "../src/lib/managed-block.js"
import { compareSemver } from "../src/lib/semver.js"
import { emptyAssets, fakeAssets, put, slurp, tempDir } from "./helpers.js"

describe("skills install", () => {
  it("copies only easy30-* skills, reports kept on rerun, and keeps foreign skills", async () => {
    const dir = await tempDir()
    const assets = await fakeAssets()
    await put(dir, ".claude/skills/mine/SKILL.md", "mine")
    const first = await installSkills({ dir, target: "claude", assets })
    expect(first).toEqual([{ path: ".claude/skills/easy30-review", status: "created" }])
    expect((await installSkills({ dir, target: "claude", assets }))[0]?.status).toBe("kept")
    await put(dir, ".claude/skills/easy30-review/SKILL.md", "edited")
    expect((await installSkills({ dir, target: "claude", assets }))[0]?.status).toBe("updated")
    expect(await slurp(dir, ".claude/skills/mine/SKILL.md")).toBe("mine")
  })

  it("handles no bundled skills", async () => {
    const dir = await tempDir()
    expect(await installSkills({ dir, target: "all", assets: await emptyAssets() })).toEqual([])
  })
})

const body0 = "b"

describe("pure helpers", () => {
  it("compareSemver orders versions", () => {
    expect(compareSemver("1.2.0", "1.10.0")).toBeLessThan(0)
    expect(compareSemver("1.0", "1.0.0")).toBe(0)
    expect(compareSemver("v2.0.0", "1.9.9")).toBeGreaterThan(0)
    expect(compareSemver("1.0.0-rc.1", "1.0.0")).toBeLessThan(0)
    expect(compareSemver("1.0.0+b1", "1.0.0")).toBe(0)
  })

  it("upsertBlock inserts, replaces and detects no-ops", () => {
    const created = upsertBlock(null, "hi")
    expect(created.status).toBe("created")
    expect(created.content).toBe(`${BLOCK_START}\nhi\n${BLOCK_END}\n`)
    expect(upsertBlock(created.content, "hi").status).toBe("kept")
    const replaced = upsertBlock(`a\n${created.content}b\n`, "bye")
    expect(replaced).toEqual({
      content: `a\n${BLOCK_START}\nbye\n${BLOCK_END}\nb\n`,
      status: "updated",
    })
    expect(upsertBlock("# Title\n", "x").content).toBe(
      `# Title\n\n${BLOCK_START}\nx\n${BLOCK_END}\n`,
    )
  })

  it("upsertBlock never rewrites damaged markers", () => {
    const body = "new"
    const noEnd = `mine\n${BLOCK_START}\nold\nuser text\n`
    expect(upsertBlock(noEnd, body)).toMatchObject({ content: noEnd, status: "kept" })
    expect(upsertBlock(noEnd, body).warning).toContain("without a matching")
    const noStart = `mine\nold\n${BLOCK_END}\ntail\n`
    expect(upsertBlock(noStart, body)).toMatchObject({ content: noStart, status: "kept" })
    expect(upsertBlock(noStart, body).warning).toContain("without a preceding")
    const reversed = `${BLOCK_END}\nx\n${BLOCK_START}\ny\n`
    expect(upsertBlock(reversed, body).warning).toBeDefined()
  })

  it("upsertBlock without markers appends and with two blocks replaces only the first", () => {
    const plain = upsertBlock("text", body0)
    expect(plain.status).toBe("updated")
    expect(plain.warning).toBeUndefined()
    const twice = `${BLOCK_START}\none\n${BLOCK_END}\nmid\n${BLOCK_START}\ntwo\n${BLOCK_END}\n`
    expect(upsertBlock(twice, "new").content).toBe(
      `${BLOCK_START}\nnew\n${BLOCK_END}\nmid\n${BLOCK_START}\ntwo\n${BLOCK_END}\n`,
    )
  })

  it("mergeMcpConfig keeps an existing easy30 entry unless forced", () => {
    const existing = { mcpServers: { easy30: { command: "custom" } } }
    expect(mergeMcpConfig(existing).status).toBe("kept")
    expect(JSON.parse(mergeMcpConfig(existing, true).content).mcpServers.easy30.command).toBe("npx")
  })
})
