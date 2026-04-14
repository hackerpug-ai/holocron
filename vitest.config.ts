import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.{js,ts,tsx}", "convex/**/*.{test,spec}.{js,ts,tsx}", "hooks/**/*.{test,spec}.{js,ts}", "components/**/*.{test,spec}.{js,ts,tsx}"],
    exclude: ["node_modules", "dist", ".expo"],
  },
});
