import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FIXTURE_VIDEO_URL, useTimelineFixtures } from "../useTimelineFixtures"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("useTimelineFixtures", () => {
  it("loads ranges for camera", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            day: "2026-07-23",
            cameras: {
              cam1: { ranges: [{ startMsOfDay: 0, endMsOfDay: 1000 }] },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )

    const { result } = renderHook(() => useTimelineFixtures("cam1"))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.day).toBe("2026-07-23")
    expect(result.current.ranges).toEqual([{ startMsOfDay: 0, endMsOfDay: 1000 }])
    expect(result.current.videoUrl).toBe(FIXTURE_VIDEO_URL)
    expect(result.current.error).toBeNull()
  })

  it("returns empty ranges for unknown camera", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ day: "2026-07-23", cameras: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    const { result } = renderHook(() => useTimelineFixtures("cam9"))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.ranges).toEqual([])
  })
})
