import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/mastra/stdio.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  shims: true,
  outDir: "dist",
});
