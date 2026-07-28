export const MS_PER_DAY = 86_400_000
export const MIN_ZOOM_MS = 15 * 60 * 1000

export type TimeRange = { startMsOfDay: number; endMsOfDay: number }

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function formatMsOfDay(ms: number): string {
  const totalSec = Math.floor(clamp(ms, 0, MS_PER_DAY - 1) / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function clampZoom(startMs: number, endMs: number): { startMs: number; endMs: number } {
  let start = startMs
  let end = endMs
  if (end < start) [start, end] = [end, start]
  let span = end - start
  if (span < MIN_ZOOM_MS) {
    const mid = (start + end) / 2
    start = mid - MIN_ZOOM_MS / 2
    end = mid + MIN_ZOOM_MS / 2
    span = MIN_ZOOM_MS
  }
  if (span > MS_PER_DAY) {
    return { startMs: 0, endMs: MS_PER_DAY }
  }
  if (start < 0) {
    end -= start
    start = 0
  }
  if (end > MS_PER_DAY) {
    start -= end - MS_PER_DAY
    end = MS_PER_DAY
  }
  start = clamp(start, 0, MS_PER_DAY)
  end = clamp(end, 0, MS_PER_DAY)
  if (end - start < MIN_ZOOM_MS) {
    if (start === 0) end = MIN_ZOOM_MS
    else start = MS_PER_DAY - MIN_ZOOM_MS
  }
  return { startMs: start, endMs: end }
}

export function msOfDayToVideoTime(playheadMs: number, durationSec: number): number {
  if (durationSec <= 0) return 0
  return (clamp(playheadMs, 0, MS_PER_DAY) / MS_PER_DAY) * durationSec
}

export function videoTimeToMsOfDay(t: number, durationSec: number): number {
  if (durationSec <= 0) return 0
  return clamp((t / durationSec) * MS_PER_DAY, 0, MS_PER_DAY)
}

export function addDays(isoDay: string, delta: number): string {
  const [y, m, d] = isoDay.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

export function daysAround(centerIso: string, radius: number): string[] {
  const out: string[] = []
  for (let i = -radius; i <= radius; i++) out.push(addDays(centerIso, i))
  return out
}
