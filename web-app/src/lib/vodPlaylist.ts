export type VodSegment = {
  url: string
  durationSec: number
  startMsOfDay: number
}

/** Wall-clock ms of day from a recording path segment (…/HH-MM-SS.mp4). */
export function startMsOfDayFromRecordingPath(path: string): number {
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

/** Parse a VOD m3u8 whose media entries are progressive MP4 recording files. */
export function parseVodPlaylist(text: string, manifestSrc: string): VodSegment[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const segments: VodSegment[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line?.startsWith("#EXTINF:")) continue
    const durationSec = Number.parseFloat(line.slice("#EXTINF:".length).split(",")[0] ?? "")
    const urlLine = lines[i + 1]
    if (!urlLine || urlLine.startsWith("#")) continue
    if (!Number.isFinite(durationSec) || durationSec <= 0) continue

    segments.push({
      url: resolvePlaylistMediaUrl(urlLine, manifestSrc),
      durationSec,
      startMsOfDay: startMsOfDayFromRecordingPath(urlLine),
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
