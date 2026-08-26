export type VodSegment = {
  url: string
  durationSec: number
  startMsOfDay: number
}

const PDT_PREFIX = "#EXT-X-PROGRAM-DATE-TIME:"

/** Wall-clock ms of day from a recording path (`…/YYYY-MM-DD/HH-MM-SS.mp4`). */
export function startMsOfDayFromRecordingPath(path: string, dayStartMs?: number): number {
  const withDate = path.match(/(\d{4}-\d{2}-\d{2})\/(\d{2})-(\d{2})-(\d{2})\.mp4/)
  if (withDate && dayStartMs != null) {
    const startTs = Date.parse(`${withDate[1]}T${withDate[2]}:${withDate[3]}:${withDate[4]}Z`)
    if (Number.isFinite(startTs)) return startTs - dayStartMs
  }
  const m = path.match(/(\d{2})-(\d{2})-(\d{2})\.mp4/)
  if (!m) return 0
  const h = Number(m[1])
  const min = Number(m[2])
  const s = Number(m[3])
  return (h * 3600 + min * 60 + s) * 1000
}

export function resolvePlaylistMediaUrl(segmentLine: string, manifestSrc: string): string {
  if (/^https?:\/\//i.test(segmentLine)) return segmentLine
  return new URL(segmentLine, window.location.origin).href
}

export interface ParseVodPlaylistOptions {
  /** Local midnight epoch; used to convert UTC timestamps to ms-of-day. */
  dayStartMs?: number
}

/** Parse a VOD m3u8 whose media entries are progressive MP4 recording files. */
export function parseVodPlaylist(
  text: string,
  manifestSrc: string,
  opts: ParseVodPlaylistOptions = {},
): VodSegment[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const segments: VodSegment[] = []
  let pendingPdt: number | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    if (line.startsWith(PDT_PREFIX)) {
      const parsed = Date.parse(line.slice(PDT_PREFIX.length))
      pendingPdt = Number.isFinite(parsed) ? parsed : null
      continue
    }
    if (!line.startsWith("#EXTINF:")) continue
    const durationSec = Number.parseFloat(line.slice("#EXTINF:".length).split(",")[0] ?? "")
    const urlLine = lines[i + 1]
    if (!urlLine || urlLine.startsWith("#")) continue
    if (!Number.isFinite(durationSec) || durationSec <= 0) continue

    const fromPdt =
      pendingPdt != null && opts.dayStartMs != null ? pendingPdt - opts.dayStartMs : null
    pendingPdt = null

    segments.push({
      url: resolvePlaylistMediaUrl(urlLine, manifestSrc),
      durationSec,
      startMsOfDay: fromPdt ?? startMsOfDayFromRecordingPath(urlLine, opts.dayStartMs),
    })
  }

  return segments
}

export function findSegmentIndexForMs(segments: VodSegment[], msOfDay: number): number {
  if (segments.length === 0) return -1
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    const nextStart = segments[i + 1]?.startMsOfDay ?? Number.POSITIVE_INFINITY
    if (msOfDay >= seg.startMsOfDay && msOfDay < nextStart) return i
  }
  return segments.length - 1
}
