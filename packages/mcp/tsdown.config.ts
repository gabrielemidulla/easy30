import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: "esm",
  dts: true,
  platform: "node",
  fixedExtension: false,
  target: "es2022",
})
