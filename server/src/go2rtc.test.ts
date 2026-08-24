import { describe, expect, it, vi } from "vitest"
import { ensurePreload, ensurePreloads, waitForGo2rtc } from "./go2rtc.js"

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

describe("ensurePreload", () => {
  it("PUTs preload for a camera", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    await ensurePreload("http://go2rtc:1984", "cam1")
    expect(fetchMock).toHaveBeenCalledWith(
      "http://go2rtc:1984/api/preload?src=cam1",
      { method: "PUT" },
    )
  })
})

describe("ensurePreloads", () => {
  it("preloads every camera id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    await ensurePreloads("http://go2rtc:1984", ["cam1", "cam2"])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
