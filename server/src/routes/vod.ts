import { Router } from "express"
import type Database from "better-sqlite3"

export interface VodDeps {
  db: Database.Database
}

export function vodRouter(deps: VodDeps): Router {
  const { db } = deps
  const router = Router({ mergeParams: true })

  router.get("/start/:start/end/:end/index.m3u8", (req, res) => {
    const camera = String((req.params as Record<string, string>).camera ?? "")
    const startSec = Number(req.params.start)
    const endSec = Number(req.params.end)

    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec >= endSec) {
      res.status(400).send("Invalid start/end range")
      return
    }

    const startMs = startSec * 1000
    const endMs = endSec * 1000

    const segments = db
      .prepare(
        `SELECT start_ts AS startTs, duration_ms AS durationMs, path
         FROM segments
         WHERE camera_id = ?
           AND start_ts + duration_ms > ?
           AND start_ts < ?
         ORDER BY start_ts ASC`,
      )
      .all(camera, startMs, endMs) as { startTs: number; durationMs: number; path: string }[]

    if (segments.length === 0) {
      res.status(404).send("No segments found for range")
      return
    }

    const lines = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:61",
      "#EXT-X-MEDIA-SEQUENCE:0",
    ]

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!
      let durationSec = seg.durationMs / 1000

      if (i === 0 && seg.startTs < startMs) {
        const overshootMs = startMs - seg.startTs
        durationSec = (seg.durationMs - overshootMs) / 1000
      }

      if (i === segments.length - 1 && seg.startTs + seg.durationMs > endMs) {
        const overshootMs = seg.startTs + seg.durationMs - endMs
        durationSec = (seg.durationMs - overshootMs) / 1000
      }

      if (durationSec <= 0) continue

      const clampedDuration = Math.max(0.1, Math.min(durationSec, 61))
      lines.push(`#EXT-X-PROGRAM-DATE-TIME:${new Date(seg.startTs).toISOString()}`)
      lines.push(`#EXTINF:${clampedDuration.toFixed(1)},`)
      lines.push(`/api/statics/recordings/${seg.path}`)
    }

    lines.push("#EXT-X-ENDLIST")

    res.set("Content-Type", "application/vnd.apple.mpegurl")
    res.send(lines.join("\n"))
  })

  return router
}
