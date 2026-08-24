import { logger } from "./logger.js"

const DEFAULT_TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 1_000

export async function waitForGo2rtc(baseUrl: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/streams`)
      if (res.ok) {
        logger.info("go2rtc is ready")
        return
      }
    } catch {
      // go2rtc still starting
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(`go2rtc not ready after ${timeoutMs}ms (${baseUrl})`)
}
