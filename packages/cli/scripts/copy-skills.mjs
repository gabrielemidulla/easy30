// Bundle the repo's top-level skills/ folder into assets/skills.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const source = join(root, "..", "..", "skills")
const target = join(root, "assets", "skills")

rmSync(target, { recursive: true, force: true })
const skills = existsSync(source)
  ? readdirSync(source, { withFileTypes: true }).filter(
      (e) => e.isDirectory() && e.name.startsWith("easy30-"),
    )
  : []
if (skills.length === 0) {
  console.warn("[easy30] warning: no easy30-* skills found in skills/; none bundled")
  process.exit(0)
}
mkdirSync(target, { recursive: true })
for (const skill of skills) {
  cpSync(join(source, skill.name), join(target, skill.name), { recursive: true })
}
console.log(`[easy30] bundled ${skills.length} skills`)
