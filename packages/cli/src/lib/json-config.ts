import type { WriteStatus } from "./managed-block.js"

export type JsonObject = Record<string, unknown>

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Parse a JSON config file. `null` for a missing file; throws on malformed JSON. */
export function parseConfig(text: string | null): JsonObject | null {
  if (text === null || text.trim() === "") return null
  const value: unknown = JSON.parse(text)
  if (!isObject(value)) throw new Error("expected a JSON object")
  return value
}

export function stringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export const MCP_SERVER_ENTRY = {
  command: "npx",
  args: ["-y", "easy30-mcp", "--vault", "."],
} as const

export interface Merged {
  content: string
  status: WriteStatus
}

/** Add the `easy30` server to a Claude Code `.mcp.json`, keeping other servers. */
export function mergeMcpConfig(existing: JsonObject | null, force = false): Merged {
  const config: JsonObject = existing ?? {}
  const servers = isObject(config.mcpServers) ? config.mcpServers : {}
  const entry = { command: MCP_SERVER_ENTRY.command, args: [...MCP_SERVER_ENTRY.args] }
  if (servers.easy30 !== undefined && !force) {
    return { content: stringify(config), status: "kept" }
  }
  const content = stringify({ ...config, mcpServers: { ...servers, easy30: entry } })
  if (existing === null) return { content, status: "created" }
  return { content, status: content === stringify(existing) ? "kept" : "updated" }
}

/** Add `plugin` to Obsidian's `community-plugins.json` (a JSON array of ids). */
export function mergeCommunityPlugins(existing: string | null, plugin: string): Merged {
  let list: string[] = []
  if (existing !== null && existing.trim() !== "") {
    const value: unknown = JSON.parse(existing)
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      throw new Error("expected a JSON array of plugin ids")
    }
    list = value as string[]
  }
  if (list.includes(plugin)) return { content: stringify(list), status: "kept" }
  return {
    content: stringify([...list, plugin]),
    status: existing === null ? "created" : "updated",
  }
}
