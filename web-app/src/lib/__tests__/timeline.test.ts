import { describe, expect, it } from "vitest"
import {
  MIN_ZOOM_MS,
  MS_PER_DAY,
  addDays,
  clamp,
  clampZoom,
  daysAround,
  daysBack,
  formatMsOfDay,
  initialPlayheadMs,
  localDayStartMs,
  localIsoDay,
  rangesFromSegments,
} from "../timeline"

describe("clamp", () => {
  it("bounds values", () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })
})

describe("formatMsOfDay", () => {
  it("formats HH:mm:ss", () => {
    expect(formatMsOfDay(0)).toBe("00:00:00")
    expect(formatMsOfDay(3661000)).toBe("01:01:01")
    expect(formatMsOfDay(12 * 3600 * 1000)).toBe("12:00:00")
  })
})

describe("clampZoom", () => {
  it("enforces minimum window", () => {
    const z = clampZoom(1000, 2000)
    expect(z.endMs - z.startMs).toBe(MIN_ZOOM_MS)
  })

  it("clamps to day bounds", () => {
    const z = clampZoom(-1000, MS_PER_DAY + 1000)
    expect(z.startMs).toBe(0)
    expect(z.endMs).toBe(MS_PER_DAY)
  })
})

describe("daysAround", () => {
  it("builds iso day list", () => {
    expect(addDays("2026-07-23", 1)).toBe("2026-07-24")
    expect(daysAround("2026-07-23", 1)).toEqual(["2026-07-22", "2026-07-23", "2026-07-24"])
  })
})

describe("daysBack", () => {
  it("lists today and n prior days", () => {
    expect(daysBack("2026-08-26", 2)).toEqual(["2026-08-24", "2026-08-25", "2026-08-26"])
  })
})

describe("rangesFromSegments", () => {
  it("places bars at the segment start, not the hour boundary", () => {
    const dayStart = Date.parse("2026-08-26T00:00:00Z")
    const startTs = Date.parse("2026-08-26T19:53:01Z")
    const ranges = rangesFromSegments([{ startTs, durationMs: 60_000 }], dayStart)
    expect(ranges).toHaveLength(1)
    expect(ranges[0]!.startMsOfDay).toBe(startTs - dayStart)
    expect(ranges[0]!.endMsOfDay).toBe(startTs - dayStart + 60_000)
  })

  it("merges adjacent clips", () => {
    const dayStart = Date.parse("2026-08-26T00:00:00Z")
    const a = Date.parse("2026-08-26T19:53:00Z")
    const ranges = rangesFromSegments(
      [
        { startTs: a, durationMs: 60_000 },
        { startTs: a + 60_000, durationMs: 60_000 },
      ],
      dayStart,
    )
    expect(ranges).toHaveLength(1)
    expect(ranges[0]!.endMsOfDay - ranges[0]!.startMsOfDay).toBe(120_000)
  })
})

describe("initialPlayheadMs", () => {
  it("opens on the latest clip", () => {
    expect(
      initialPlayheadMs(
        [
          { startMsOfDay: 3_600_000, endMsOfDay: 3_660_000 },
          { startMsOfDay: 19 * 3_600_000, endMsOfDay: 19 * 3_600_000 + 60_000 },
        ],
        "2026-08-26",
      ),
    ).toBe(19 * 3_600_000)
  })
})

describe("localIsoDay", () => {
  it("formats a local calendar day", () => {
    const d = new Date(2026, 7, 26, 15, 4, 0)
    expect(localIsoDay(d)).toBe("2026-08-26")
    expect(localDayStartMs("2026-08-26")).toBe(new Date(2026, 7, 26).getTime())
  })
})
