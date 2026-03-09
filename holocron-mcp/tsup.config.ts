import { defineConfig } from 'tsup'
import { resolve, join } from 'node:path'
import { readFileSync } from 'node:fs'

// Load .env.local from holocron root at build time
// process.cwd() is holocron-mcp when running build
const holocronRoot = resolve(process.cwd(), '..')
const envLocalPath = join(holocronRoot, '.env.local')

let CONVEX_URL = ''
try {
  const envContent = readFileSync(envLocalPath, 'utf-8')
  const match = envContent.match(/EXPO_PUBLIC_CONVEX_URL=(.+)/)
  if (match) {
    CONVEX_URL = match[1].trim()
  }
} catch (e) {
  console.warn('Warning: Could not load .env.local, CONVEX_URL will be undefined')
}

console.log(`[Build] Injecting CONVEX_URL: ${CONVEX_URL}`)

export default defineConfig({
  entry: ['src/mastra/stdio.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  shims: true,
  outDir: 'dist',
  define: {
    'process.env.CONVEX_URL': JSON.stringify(CONVEX_URL),
    'process.env.EXPO_PUBLIC_CONVEX_URL': JSON.stringify(CONVEX_URL),
  },
})
