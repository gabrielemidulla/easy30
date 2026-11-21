import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "bin.js")

describe.skipIf(!existsSync(bin))("built bin", () => {
  it("prints help and version", () => {
    const help = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8" })
    expect(help.status).toBe(0)
    for (const cmd of ["init", "doctor", "status", "skills", "mcp"])
      expect(help.stdout).toContain(cmd)
    const version = spawnSync(process.execPath, [bin, "--version"], { encoding: "utf8" })
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it("doctor exits 0 on an empty folder", () => {
    const r = spawnSync(process.execPath, [bin, "doctor", "."], {
      encoding: "utf8",
      cwd: dirname(bin),
    })
    expect(r.status).toBe(0)
  })
})
