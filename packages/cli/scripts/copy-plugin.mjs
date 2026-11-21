// Copy the built Obsidian plugin into assets/obsidian-plugin so `easy30 init` can install it.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const source = join(root, "..", "obsidian")
const target = join(root, "assets", "obsidian-plugin")

rmSync(target, { recursive: true, force: true })
if (!existsSync(join(source, "main.js"))) {
  console.warn("[easy30] warning: packages/obsidian is not built (no main.js); plugin not bundled")
  process.exit(0)
}
mkdirSync(target, { recursive: true })
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  if (existsSync(join(source, file))) cpSync(join(source, file), join(target, file))
}
console.log("[easy30] bundled Obsidian plugin")
