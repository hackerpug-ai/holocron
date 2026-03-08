import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/mastra/stdio.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  shims: true,
  banner: {
    js: '#!/usr/bin/env bun',
  },
  outDir: 'dist',
})
