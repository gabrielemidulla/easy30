import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/** Locations of the files bundled with (or shipped next to) the CLI. */
export interface AssetPaths {
  /** Folder holding one sub-folder per skill (`easy30-*`). */
  skills: string
  /** Folder with `main.js`, `manifest.json`, `styles.css`. */
  plugin: string
  /** The example course definition (JSON). */
  example: string
}

/** Root of the `easy30` package: the nearest ancestor of this file with a matching package.json. */
export function packageRoot(from: string = dirname(fileURLToPath(import.meta.url))): string {
  for (let dir = from; ; dir = dirname(dir)) {
    const manifest = join(dir, "package.json")
    if (existsSync(manifest)) {
      const name: unknown = (JSON.parse(readFileSync(manifest, "utf8")) as { name?: unknown }).name
      if (name === "easy30") return dir
    }
    if (dirname(dir) === dir) throw new Error("Cannot locate the easy30 package root")
  }
}

/**
 * Prefer the copies bundled into `assets/` at build time; fall back to the monorepo
 * sources so the CLI also works straight from a checkout.
 */
export function defaultAssets(root: string = packageRoot()): AssetPaths {
  const pick = (bundled: string, source: string): string => (existsSync(bundled) ? bundled : source)
  return {
    skills: pick(join(root, "assets", "skills"), join(root, "..", "..", "skills")),
    plugin: pick(join(root, "assets", "obsidian-plugin"), join(root, "..", "obsidian")),
    example: pick(
      join(root, "assets", "examples", "linear-algebra.json"),
      join(root, "..", "..", "examples", "linear-algebra.json"),
    ),
  }
}
