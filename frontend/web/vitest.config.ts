import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: [],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // These are standalone agent evaluation programs with their own main()
    // entrypoints and process.exit handling. Keep them out of Vitest's suite
    // runner; they remain runnable as dedicated evaluation scripts.
    exclude: ["src/lib/agents/tests/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
