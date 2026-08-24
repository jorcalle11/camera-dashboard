import { describe, expect, it, vi } from "vitest"
import { waitForGo2rtc } from "./go2rtc.js"

describe("waitForGo2rtc", () => {
  it("resolves when /api/streams responds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    await waitForGo2rtc("http://go2rtc:1984", 5000)
    expect(fetchMock).toHaveBeenCalledWith("http://go2rtc:1984/api/streams")
  })

  it("throws when go2rtc never becomes ready", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))
    await expect(waitForGo2rtc("http://go2rtc:1984", 50)).rejects.toThrow(/not ready/)
  })
})
