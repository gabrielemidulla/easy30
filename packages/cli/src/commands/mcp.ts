export interface McpOptions {
  vault: string
}

/** Start the Easy30 MCP server on stdio. Imported lazily so the other commands start
 * fast. stdout belongs to the protocol: messages go to stderr. */
export async function runMcp(opts: McpOptions): Promise<void> {
  const { serveStdio } = await import("easy30-mcp")
  const root = await serveStdio(opts.vault)
  process.stderr.write(`easy30 MCP server ready (vault: ${root})\n`)
}
