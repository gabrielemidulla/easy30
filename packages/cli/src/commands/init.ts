import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { VaultFs } from "@easy30/core"
import { AGENTS_BLOCK } from "../lib/agents-block.js"
import { type AssetPaths, defaultAssets } from "../lib/assets.js"
import { loadExample, writeExample } from "../lib/example.js"
import { createStyle, type Io, line } from "../lib/io.js"
import { mergeCommunityPlugins, mergeMcpConfig, parseConfig } from "../lib/json-config.js"
import { upsertBlock } from "../lib/managed-block.js"
import { compareSemver } from "../lib/semver.js"
import { applyResult, createFile, type FileReport, openVaultFs } from "../lib/vault-files.js"
import { installSkills } from "./skills.js"

export interface InitOptions {
  dir: string
  /** Write the example course. */
  example: boolean
  /** Write AGENTS.md, .mcp.json and install skills. */
  agents: boolean
  /** Replace files that would otherwise be kept. */
  force: boolean
  assets?: AssetPaths
}

const PLUGIN_ID = "easy30"
const PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"] as const
const GITATTRIBUTES_LINE = ".easy30/log/*.jsonl merge=union"

export interface InitResult {
  reports: FileReport[]
  warnings: string[]
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

function manifestVersion(text: string | null): string | null {
  if (text === null) return null
  try {
    const version: unknown = (JSON.parse(text) as { version?: unknown }).version
    return typeof version === "string" ? version : null
  } catch {
    return null
  }
}

/** True when no readable plugin is installed yet, or the bundled one has a higher version. */
async function bundledIsNewer(fs: VaultFs, assets: AssetPaths): Promise<boolean> {
  const installed = manifestVersion(await fs.read(`.obsidian/plugins/${PLUGIN_ID}/manifest.json`))
  const bundled = manifestVersion(await readOptional(`${assets.plugin}/manifest.json`))
  if (installed === null || bundled === null) return true
  return compareSemver(bundled, installed) > 0
}

async function setupObsidian(
  fs: VaultFs,
  opts: InitOptions,
  assets: AssetPaths,
  out: InitResult,
): Promise<void> {
  out.reports.push(await createFile(fs, ".obsidian/app.json", "{}\n", opts.force))

  const pluginsPath = ".obsidian/community-plugins.json"
  try {
    const merged = mergeCommunityPlugins(await fs.read(pluginsPath), PLUGIN_ID)
    out.reports.push(await applyResult(fs, pluginsPath, merged))
  } catch (error) {
    out.warnings.push(`${pluginsPath}: ${(error as Error).message}. Add "${PLUGIN_ID}" by hand.`)
  }

  // Without main.js the plugin is not built: installing manifest/styles alone would break it.
  const built = (await readOptional(`${assets.plugin}/main.js`)) !== null
  const replace = opts.force || (await bundledIsNewer(fs, assets))
  let copied = 0
  for (const file of built ? PLUGIN_FILES : []) {
    const source = await readOptional(`${assets.plugin}/${file}`)
    if (source === null) continue
    const dest = `.obsidian/plugins/${PLUGIN_ID}/${file}`
    const current = await fs.read(dest)
    if (current !== source && (current === null || replace)) await fs.write(dest, source)
    out.reports.push({
      path: dest,
      status: current === null ? "created" : current === source || !replace ? "kept" : "updated",
    })
    copied++
  }
  if (copied === 0) {
    out.warnings.push(
      "The Obsidian plugin is not bundled with this build, so it was not installed. " +
        "Install it from Obsidian (Settings > Community plugins) or build packages/obsidian.",
    )
  }
}

async function setupGit(fs: VaultFs, out: InitResult): Promise<void> {
  const path = ".gitattributes"
  const existing = await fs.read(path)
  if (existing?.split(/\r?\n/).some((l) => l.trim() === GITATTRIBUTES_LINE)) {
    out.reports.push({ path, status: "kept" })
    return
  }
  const prefix = existing === null || existing === "" || existing.endsWith("\n") ? "" : "\n"
  await fs.write(path, `${existing ?? ""}${prefix}${GITATTRIBUTES_LINE}\n`)
  out.reports.push({ path, status: existing === null ? "created" : "updated" })
}

async function setupAgents(
  fs: VaultFs,
  opts: InitOptions,
  assets: AssetPaths,
  out: InitResult,
): Promise<void> {
  const notes = ["AGENTS.md", ...((await fs.mtime("CLAUDE.md")) !== null ? ["CLAUDE.md"] : [])]
  for (const path of notes) {
    const block = upsertBlock(await fs.read(path), AGENTS_BLOCK)
    if (block.warning !== undefined) out.warnings.push(`${path}: ${block.warning}`)
    out.reports.push(await applyResult(fs, path, block))
  }

  const mcpPath = ".mcp.json"
  try {
    const merged = mergeMcpConfig(parseConfig(await fs.read(mcpPath)), opts.force)
    out.reports.push(await applyResult(fs, mcpPath, merged))
  } catch (error) {
    if (!opts.force) {
      out.warnings.push(`${mcpPath}: ${(error as Error).message}. Fix it or rerun with --force.`)
    } else {
      out.reports.push(await applyResult(fs, mcpPath, mergeMcpConfig(null, true)))
    }
  }

  const skills = await installSkills({ dir: opts.dir, target: "all", assets })
  out.reports.push(...skills)
  if (skills.length === 0) out.warnings.push("No agent skills are bundled with this build.")
}

/** Set up (or refresh) an Easy30 vault. Idempotent: reruns only add what is missing. */
export async function initVault(opts: InitOptions): Promise<InitResult> {
  const assets = opts.assets ?? defaultAssets()
  const fs = openVaultFs(resolve(opts.dir))
  const out: InitResult = { reports: [], warnings: [] }
  await setupObsidian(fs, opts, assets, out)
  await setupGit(fs, out)
  if (opts.agents) await setupAgents(fs, opts, assets, out)
  if (opts.example) out.reports.push(await writeExample(fs, await loadExample(assets.example)))
  return out
}

export function mcpSnippets(vault: string): string {
  return [
    "Codex (~/.codex/config.toml):",
    "  [mcp_servers.easy30]",
    '  command = "npx"',
    `  args = ["-y", "easy30-mcp", "--vault", ${JSON.stringify(vault)}]`,
    "",
    "Cursor (.cursor/mcp.json) and Claude Desktop (claude_desktop_config.json):",
    `  { "mcpServers": { "easy30": { "command": "npx", "args": ["-y", "easy30-mcp", "--vault", ${JSON.stringify(vault)}] } } }`,
  ].join("\n")
}

export async function runInit(opts: InitOptions, io: Io): Promise<number> {
  const style = createStyle(io.color)
  const vault = resolve(opts.dir)
  const result = await initVault(opts)

  line(io, style.bold(`Easy30 vault: ${vault}`))
  line(io)
  const marks = {
    created: style.green("created"),
    updated: style.yellow("updated"),
    kept: style.dim("kept   "),
  }
  for (const r of result.reports) {
    line(io, `  ${marks[r.status]}  ${r.path}${r.note ? style.dim(`  (${r.note})`) : ""}`)
  }
  for (const w of result.warnings) line(io, `  ${style.yellow("warning")}  ${w}`)

  if (opts.agents) {
    line(io)
    line(io, style.bold("Other agents (Codex, Cursor, Claude Desktop)"))
    line(io, mcpSnippets(vault))
  }
  line(io)
  line(io, style.bold("Next steps"))
  line(io, "  1. Open this folder as a vault in Obsidian (Open folder as vault).")
  line(io, '  2. Settings > Community plugins: turn off restricted mode and enable "Easy30".')
  if (opts.agents) line(io, "  3. Restart your agent so it loads the easy30 MCP server and skills.")
  line(io, `  ${opts.agents ? "4" : "3"}. Run \`easy30 doctor\` any time to check the vault.`)
  return 0
}
