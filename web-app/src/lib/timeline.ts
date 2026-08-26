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

/** Calendar YYYY-MM-DD in the viewer's local timezone. */
export function localIsoDay(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Local midnight of an ISO calendar day, as epoch ms. */
export function localDayStartMs(isoDay: string): number {
  const [y, m, d] = isoDay.split("-").map(Number)
  return new Date(y!, m! - 1, d!).getTime()
}

export function localMsOfDay(date = new Date()): number {
  return (
    date.getHours() * 3_600_000 +
    date.getMinutes() * 60_000 +
    date.getSeconds() * 1000 +
    date.getMilliseconds()
  )
}

/** Inclusive list from `today - n` through `today`. */
export function daysBack(todayIso: string, n: number): string[] {
  const out: string[] = []
  for (let i = n; i >= 0; i--) out.push(addDays(todayIso, -i))
  return out
}

export type RecordingSegment = { startTs: number; durationMs: number }

/** Merge same-day segments into coverage ranges in local ms-of-day. */
export function rangesFromSegments(
  segments: RecordingSegment[],
  dayStartMs: number,
  gapMs = 2_000,
): TimeRange[] {
  const sorted = [...segments].sort((a, b) => a.startTs - b.startTs)
  const ranges: TimeRange[] = []
  for (const seg of sorted) {
    const start = clamp(seg.startTs - dayStartMs, 0, MS_PER_DAY)
    const end = clamp(seg.startTs + seg.durationMs - dayStartMs, 0, MS_PER_DAY)
    if (end <= start) continue
    const last = ranges[ranges.length - 1]
    if (last && start <= last.endMsOfDay + gapMs) {
      last.endMsOfDay = Math.max(last.endMsOfDay, end)
    } else {
      ranges.push({ startMsOfDay: start, endMsOfDay: end })
    }
  }
  return ranges
}

/** Playhead to open for a day: latest clip, or "now" if today has no footage yet. */
export function initialPlayheadMs(ranges: TimeRange[], day: string, now = new Date()): number {
  if (ranges.length > 0) return ranges[ranges.length - 1]!.startMsOfDay
  if (day === localIsoDay(now)) return localMsOfDay(now)
  return 12 * 3_600_000
}
