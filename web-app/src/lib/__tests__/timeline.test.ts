import { describe, expect, it } from "vitest"
import {
  MIN_ZOOM_MS,
  MS_PER_DAY,
  addDays,
  clamp,
  clampZoom,
  daysAround,
  formatMsOfDay,
  msOfDayToVideoTime,
  videoTimeToMsOfDay,
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

describe("video mapping", () => {
  it("maps playhead to video time and back", () => {
    expect(msOfDayToVideoTime(0, 10)).toBe(0)
    expect(msOfDayToVideoTime(MS_PER_DAY / 2, 10)).toBeCloseTo(5)
    expect(videoTimeToMsOfDay(5, 10)).toBeCloseTo(MS_PER_DAY / 2)
  })
})

describe("daysAround", () => {
  it("builds iso day list", () => {
    expect(addDays("2026-07-23", 1)).toBe("2026-07-24")
    expect(daysAround("2026-07-23", 1)).toEqual(["2026-07-22", "2026-07-23", "2026-07-24"])
  })
})
