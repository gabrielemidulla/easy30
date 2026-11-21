import { readFile, rm, writeFile } from "node:fs/promises"
import { builtinModules, createRequire } from "node:module"
import process from "node:process"
import esbuild from "esbuild"

const production = process.argv[2] === "production"
const require = createRequire(import.meta.url)

/** React Flow's base styles come first so our `.easy30-` rules can override them. */
const STYLE_SOURCES = [require.resolve("@xyflow/react/style.css"), "src/styles.css"]

/** Obsidian loads `styles.css` next to `main.js`: combine the vendor CSS and ours. */
const combineStyles = {
  name: "combine-styles",
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0) return
      const parts = await Promise.all(STYLE_SOURCES.map((path) => readFile(path, "utf8")))
      await writeFile("styles.css", `${parts.join("\n")}\n`)
      await rm("main.css", { force: true })
    })
  },
}

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/*",
    "@lezer/*",
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ],
  format: "cjs",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  minify: production,
  treeShaking: true,
  define: { "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development") },
  outfile: "main.js",
  plugins: [combineStyles],
})

if (production) {
  await context.rebuild()
  await context.dispose()
} else {
  await context.watch()
}
