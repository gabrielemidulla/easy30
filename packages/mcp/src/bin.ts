#!/usr/bin/env node
import { parseArgs } from "node:util"
import { serveStdio } from "./stdio.js"

const USAGE =
  "Usage: easy30-mcp [--vault <dir>]   (or set EASY30_VAULT; default: current directory)"

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { vault: { type: "string", short: "v" }, help: { type: "boolean", short: "h" } },
  })
  if (values.help) {
    console.error(USAGE)
    return
  }
  const root = await serveStdio(values.vault ?? process.env.EASY30_VAULT ?? process.cwd())
  console.error(`easy30-mcp: serving vault ${root}`)
}

main().catch((error: unknown) => {
  console.error(`easy30-mcp: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
