#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { main } from "./cli.js"
import { packageRoot } from "./lib/assets.js"

function readVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(join(packageRoot(), "package.json"), "utf8"))
  const version =
    typeof manifest === "object" && manifest !== null && "version" in manifest
      ? manifest.version
      : undefined
  return typeof version === "string" ? version : "0.0.0"
}

process.exitCode = await main(process.argv.slice(2), { version: readVersion() })
