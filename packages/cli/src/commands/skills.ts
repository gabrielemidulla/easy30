import { readdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import { type AssetPaths, defaultAssets } from "../lib/assets.js"
import { syncTree } from "../lib/copy-tree.js"
import { type Io, line, plural } from "../lib/io.js"
import type { FileReport } from "../lib/vault-files.js"

export type SkillTarget = "claude" | "agents" | "all"

export const SKILL_TARGETS: readonly SkillTarget[] = ["claude", "agents", "all"]

/** Where each target keeps its skills, relative to the vault. */
const TARGET_DIRS: Record<Exclude<SkillTarget, "all">, string> = {
  claude: ".claude/skills",
  agents: ".agents/skills",
}

const SKILL_PREFIX = "easy30-"

export interface SkillsOptions {
  dir: string
  target: SkillTarget
  assets?: AssetPaths
}

/** Names of the bundled `easy30-*` skill folders (empty when none are bundled). */
export async function bundledSkills(skillsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory() && e.name.startsWith(SKILL_PREFIX))
      .map((e) => e.name)
      .sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

/** Copy the bundled skills into the vault. Only `easy30-*` folders are ever touched. */
export async function installSkills(opts: SkillsOptions): Promise<FileReport[]> {
  const assets = opts.assets ?? defaultAssets()
  const skills = await bundledSkills(assets.skills)
  const targets = opts.target === "all" ? (["claude", "agents"] as const) : ([opts.target] as const)
  const reports: FileReport[] = []
  for (const target of targets) {
    for (const skill of skills) {
      const rel = `${TARGET_DIRS[target]}/${skill}`
      const status = await syncTree(join(assets.skills, skill), join(resolve(opts.dir), rel))
      reports.push({ path: rel, status })
    }
  }
  return reports
}

export async function runSkillsInstall(opts: SkillsOptions, io: Io): Promise<number> {
  const assets = opts.assets ?? defaultAssets()
  const reports = await installSkills({ ...opts, assets })
  if (reports.length === 0) {
    line(io, "No skills are bundled with this build of easy30, so nothing was installed.")
    return 0
  }
  for (const r of reports) line(io, `  ${r.status.padEnd(8)} ${r.path}`)
  const count = new Set(reports.map((r) => r.path.split("/").pop())).size
  line(io, `Installed ${plural(count, "skill")}. Restart your agent to load them.`)
  return 0
}
