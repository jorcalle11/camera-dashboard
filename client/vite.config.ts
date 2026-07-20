import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
// vitest/config re-exports Vite's defineConfig with the `test` field typed
import { defineConfig } from "vitest/config"

// In the dev container go2rtc is reachable as http://go2rtc:1984;
// when running Vite directly on the host it's http://localhost:1984.
const go2rtcTarget = process.env.GO2RTC_URL ?? "http://localhost:1984"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/go2rtc": {
        target: go2rtcTarget,
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/go2rtc/, ""),
        // go2rtc rejects WebSocket upgrades whose Origin doesn't match its
        // own host (403). changeOrigin only rewrites Host, so also rewrite
        // the Origin header on proxied requests.
        headers: { Origin: go2rtcTarget },
      },
    },
  },
  test: {
    environment: "jsdom",
  },
})
