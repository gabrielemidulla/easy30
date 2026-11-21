// Bundle examples/linear-algebra.json into assets/examples.
import { cpSync, mkdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const target = join(root, "assets", "examples")

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(
  join(root, "..", "..", "examples", "linear-algebra.json"),
  join(target, "linear-algebra.json"),
)
console.log("[easy30] bundled example course")
