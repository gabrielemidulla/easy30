import { resolve } from "node:path"
import { Workspace } from "@easy30/core"
import { NodeFs } from "@easy30/core/node"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createServer } from "./index.js"

/** Serve the vault at `vaultDir` over stdio. stdout carries the protocol, so
 * everything human-readable goes to stderr. Returns the resolved vault path. */
export async function serveStdio(vaultDir: string): Promise<string> {
  const root = resolve(vaultDir)
  const workspace = await Workspace.open(new NodeFs(root))
  await createServer(workspace).connect(new StdioServerTransport())
  return root
}
