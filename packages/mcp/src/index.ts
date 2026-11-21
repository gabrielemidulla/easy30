import type { Workspace } from "@easy30/core"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ServerContext } from "./context.js"
import { registerPrompts } from "./prompts.js"
import { createRegistrar } from "./registrar.js"
import { registerConceptTools } from "./tools/concepts.js"
import { registerCourseTools } from "./tools/courses.js"
import { registerNoteTools } from "./tools/notes.js"
import { registerReviewTools } from "./tools/reviews.js"
import { registerTestTools } from "./tools/tests.js"
import { registerVaultTools } from "./tools/vault.js"
import { SERVER_NAME, SERVER_VERSION } from "./version.js"

export interface CreateServerOptions {
  /** Overrides the `source` stamped on log entries (default: `mcp[:<client name>]`). */
  source?: string
}

const INSTRUCTIONS =
  "Easy30 study tools over an Obsidian vault: per-course prerequisite graphs of concept notes, " +
  "spaced repetition, practice tests and mock orals. Start with list_courses. Reference answers " +
  "and test solutions are for the tutor: do not reveal them before the student has answered."

function clientSource(server: McpServer): string {
  const name = server.server.getClientVersion()?.name.replace(/[^\w.-]+/g, "-")
  return name ? `mcp:${name}` : "mcp"
}

/** Build an Easy30 MCP server on a workspace; connect it to any MCP transport. */
export function createServer(workspace: Workspace, opts: CreateServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  )
  const ctx: ServerContext = { workspace, source: () => opts.source ?? clientSource(server) }
  const tool = createRegistrar(server, ctx)
  registerCourseTools(tool)
  registerConceptTools(tool)
  registerReviewTools(tool)
  registerTestTools(tool)
  registerNoteTools(tool)
  registerVaultTools(tool)
  registerPrompts(server)
  return server
}
export { serveStdio } from "./stdio.js"
