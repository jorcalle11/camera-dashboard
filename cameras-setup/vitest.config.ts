import { defineConfig } from "vitest/config"

// cameras-setup runner covers the generator tools only; web-app tests run with
// web-app/vite.config.ts (jsdom) via `npm test` inside web-app/.
export default defineConfig({
  test: {
    include: ["./**/*.test.ts"],
  },
})
