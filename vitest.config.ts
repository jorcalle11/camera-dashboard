import { defineConfig } from "vitest/config"

// Root runner covers the generator tools only; client tests run with
// client/vite.config.ts (jsdom) via `npm test` inside client/.
export default defineConfig({
  test: {
    include: ["tools/**/*.test.ts"],
  },
})
