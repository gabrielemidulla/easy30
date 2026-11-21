import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { AssetPaths } from "../src/lib/assets.js"
import type { Io } from "../src/lib/io.js"

export interface Captured extends Io {
  text(): string
  errText(): string
}

export function capture(): Captured {
  let out = ""
  let err = ""
  return {
    color: false,
    out: (t) => {
      out += t
    },
    err: (t) => {
      err += t
    },
    text: () => out,
    errText: () => err,
  }
}

export async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "easy30-cli-"))
}

export async function put(dir: string, path: string, content: string): Promise<void> {
  const full = join(dir, path)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, content, "utf8")
}

export async function slurp(dir: string, path: string): Promise<string> {
  return readFile(join(dir, path), "utf8")
}

export const EXAMPLE_JSON = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "examples",
  "linear-algebra.json",
)

/** Fake bundled assets: one skill, a built plugin and the real example. */
export async function fakeAssets(): Promise<AssetPaths> {
  const root = await tempDir()
  await put(root, "skills/easy30-review/SKILL.md", "---\nname: easy30-review\n---\nReview.\n")
  await put(root, "skills/other-skill/SKILL.md", "not ours\n")
  await put(root, "plugin/main.js", "// plugin\n")
  await put(root, "plugin/manifest.json", '{"id":"easy30"}\n')
  return { skills: join(root, "skills"), plugin: join(root, "plugin"), example: EXAMPLE_JSON }
}

/** Assets with nothing bundled. */
export async function emptyAssets(): Promise<AssetPaths> {
  const root = await tempDir()
  return { skills: join(root, "skills"), plugin: join(root, "plugin"), example: EXAMPLE_JSON }
}
