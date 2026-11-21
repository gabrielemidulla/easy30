import { defineConfig } from "tsdown"

export default defineConfig({
  // src/bin.ts starts with a shebang, which tsdown keeps and marks executable.
  entry: ["src/bin.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
  fixedExtension: false,
  dts: false,
})
