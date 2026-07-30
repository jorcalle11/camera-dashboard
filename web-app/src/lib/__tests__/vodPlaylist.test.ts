import { describe, expect, it } from "vitest"
import { parseVodPlaylist, startMsOfDayFromRecordingPath } from "../vodPlaylist"

describe("startMsOfDayFromRecordingPath", () => {
  it("parses HH-MM-SS from recording path", () => {
    expect(startMsOfDayFromRecordingPath("/api/statics/recordings/cam1/2026-07-28/19-03-20.mp4")).toBe(
      (19 * 3600 + 3 * 60 + 20) * 1000,
    )
  })
})

describe("parseVodPlaylist", () => {
  it("parses EXTINF entries and media URLs", () => {
    const text = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:30.0,
/api/statics/recordings/cam1/2026-07-28/19-03-20.mp4
#EXTINF:60.0,
/api/statics/recordings/cam1/2026-07-28/19-04-03.mp4
#EXT-X-ENDLIST`

    const segs = parseVodPlaylist(text, "/api/recordings/cam1/start/1/end/2/index.m3u8")
    expect(segs).toHaveLength(2)
    expect(segs[0]!.durationSec).toBe(30)
    expect(segs[0]!.url).toContain("/api/statics/recordings/cam1/2026-07-28/19-03-20.mp4")
    expect(segs[1]!.startMsOfDay).toBe((19 * 3600 + 4 * 60 + 3) * 1000)
  })
})
