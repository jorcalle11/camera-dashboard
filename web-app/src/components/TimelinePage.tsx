import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useCameras } from "../hooks/useCameras"
import { useRecordingsSummary } from "../hooks/useRecordingsSummary"
import {
  MS_PER_DAY,
  clamp,
  clampZoom,
  initialPlayheadMs,
  localDayStartMs,
  localIsoDay,
} from "../lib/timeline"
import CameraSelect from "./CameraSelect"
import DateSelect from "./DateSelect"
import PlaybackPlayer, { type PlaybackPlayerHandle } from "./PlaybackPlayer"
import TimelineStrip, { type ZoomWindow } from "./TimelineStrip"

export const TIMELINE_CAMERA_KEY = "timeline.cameraId"

/** Length of the VOD window loaded into the player, starting at the playhead. */
const VOD_WINDOW_MS = 10 * 60 * 1000

interface TimelinePageProps {
  cameraId: string
  onCameraChange: (cameraId: string) => void
  onBack: () => void
}

export default function TimelinePage({ cameraId, onCameraChange, onBack }: TimelinePageProps) {
  const { cameras, loading: camerasLoading, error: camerasError } = useCameras()

  const [day, setDay] = useState(localIsoDay)
  const [playheadMsOfDay, setPlayheadMsOfDay] = useState(12 * 3600 * 1000)
  // Start of the loaded VOD window (ms of day). Only changes on deliberate
  // navigation (scrub, skip out of window) — never on playback progress, so
  // the HLS source URL stays stable while the video plays.
  const [windowStartMsOfDay, setWindowStartMsOfDay] = useState(12 * 3600 * 1000)
  const [zoom, setZoom] = useState<ZoomWindow>({ startMs: 0, endMs: MS_PER_DAY })
  const playerRef = useRef<PlaybackPlayerHandle>(null)
  const scrubbing = useRef(false)
  const snappedKey = useRef("")
  const [readyKey, setReadyKey] = useState("")

  const { ranges, loading: summaryLoading, error: summaryError } = useRecordingsSummary(cameraId, day)
  const dayStartMs = localDayStartMs(day)
  const viewKey = `${cameraId}:${day}`

  const vodUrl = useMemo(() => {
    if (ranges.length === 0) return ""
    const startSec = Math.floor((dayStartMs + windowStartMsOfDay) / 1000)
    const windowEndMsOfDay = Math.min(windowStartMsOfDay + VOD_WINDOW_MS, MS_PER_DAY)
    const endSec = Math.ceil((dayStartMs + windowEndMsOfDay) / 1000)
    return `/api/recordings/${encodeURIComponent(cameraId)}/start/${startSec}/end/${endSec}/index.m3u8`
  }, [cameraId, dayStartMs, windowStartMsOfDay, ranges.length])

  useEffect(() => {
    sessionStorage.setItem(TIMELINE_CAMERA_KEY, cameraId)
  }, [cameraId])

  useEffect(() => {
    if (summaryLoading) return
    if (snappedKey.current === viewKey) return
    snappedKey.current = viewKey
    const ms = initialPlayheadMs(ranges, day)
    setPlayheadMsOfDay(ms)
    setWindowStartMsOfDay(ms)
    if (ranges.length > 0) {
      const last = ranges[ranges.length - 1]!
      const pad = 30 * 60 * 1000
      setZoom(clampZoom(last.startMsOfDay - pad, last.endMsOfDay + pad))
    } else {
      setZoom({ startMs: 0, endMs: MS_PER_DAY })
    }
    setReadyKey(viewKey)
  }, [viewKey, day, summaryLoading, ranges])

  const onPlayheadChange = useCallback(
    (ms: number) => {
      const next = clamp(ms, 0, MS_PER_DAY)
      setPlayheadMsOfDay(next)

      const inLoadedWindow =
        next >= windowStartMsOfDay && next < windowStartMsOfDay + VOD_WINDOW_MS

      if (inLoadedWindow) {
        scrubbing.current = true
        playerRef.current?.seekToMsOfDay(next)
        queueMicrotask(() => {
          scrubbing.current = false
        })
        return
      }

      setWindowStartMsOfDay(next)
    },
    [windowStartMsOfDay],
  )

  if (camerasError || summaryError) {
    return <p className="p-4 text-red-600 dark:text-red-400">{camerasError ?? summaryError}</p>
  }
  if (camerasLoading || summaryLoading || readyKey !== viewKey) {
    return <p className="p-4 text-neutral-500 dark:text-neutral-400">Loading timeline…</p>
  }
  if (cameras.length === 0) {
    return <p className="p-4 text-neutral-500 dark:text-neutral-400">No cameras configured.</p>
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col lg:max-w-5xl xl:max-w-7xl">
      <header className="flex items-center justify-between gap-2 px-3 py-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 cursor-pointer rounded-md px-2 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ‹ Live
        </button>
        <CameraSelect cameras={cameras} value={cameraId} onChange={onCameraChange} />
        <DateSelect value={day} retentionDays={7} onChange={setDay} />
      </header>

      <div className="px-3">
        <PlaybackPlayer
          ref={playerRef}
          src={vodUrl}
          dayStartMs={dayStartMs}
          initialMsOfDay={windowStartMsOfDay}
          playheadMsOfDay={playheadMsOfDay}
          onTimeUpdate={(msOfDay) => {
            if (scrubbing.current) return
            setPlayheadMsOfDay(clamp(msOfDay, 0, MS_PER_DAY))
          }}
        />
      </div>

      <div className="px-3 text-sm text-neutral-500 dark:text-neutral-400">
        {ranges.length > 0 ? (
          <span>Coverage · {ranges.length} clip{ranges.length === 1 ? "" : "s"}</span>
        ) : (
          <span>No footage for this day</span>
        )}
      </div>

      <TimelineStrip
        ranges={ranges}
        playheadMsOfDay={playheadMsOfDay}
        zoom={zoom}
        onPlayheadChange={onPlayheadChange}
        onZoomChange={(z) => setZoom(clampZoom(z.startMs, z.endMs))}
      />
    </div>
  )
}
