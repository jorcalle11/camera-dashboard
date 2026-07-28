import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useCameras } from "../hooks/useCameras"
import { useRecordingsSummary } from "../hooks/useRecordingsSummary"
import {
  MS_PER_DAY,
  clamp,
  clampZoom,
  videoTimeToMsOfDay,
} from "../lib/timeline"
import CameraSelect from "./CameraSelect"
import DateSelect from "./DateSelect"
import PlaybackPlayer from "./PlaybackPlayer"
import TimelineStrip, { type ZoomWindow } from "./TimelineStrip"
import TransportBar, { type PlaybackSpeed } from "./TransportBar"

const SPEEDS: PlaybackSpeed[] = [1, 2, 4]
export const TIMELINE_CAMERA_KEY = "timeline.cameraId"

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

interface TimelinePageProps {
  cameraId: string
  onCameraChange: (cameraId: string) => void
  onBack: () => void
}

export default function TimelinePage({ cameraId, onCameraChange, onBack }: TimelinePageProps) {
  const { cameras, loading: camerasLoading, error: camerasError } = useCameras()

  const [day, setDay] = useState(todayIso)
  const [playheadMsOfDay, setPlayheadMsOfDay] = useState(12 * 3600 * 1000)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(1)
  const [zoom, setZoom] = useState<ZoomWindow>({ startMs: 0, endMs: MS_PER_DAY })
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)

  const { ranges, loading: summaryLoading, error: summaryError } = useRecordingsSummary(cameraId, day)

  const vodUrl = useMemo(() => {
    const dayStartMs = new Date(`${day}T00:00:00Z`).getTime()
    const playheadAbsMs = dayStartMs + playheadMsOfDay
    const windowMs = 5 * 60 * 1000
    const startSec = Math.floor((playheadAbsMs - windowMs) / 1000)
    const endSec = Math.ceil((playheadAbsMs + windowMs) / 1000)
    return `/api/recordings/${encodeURIComponent(cameraId)}/start/${startSec}/end/${endSec}/index.m3u8`
  }, [cameraId, day, playheadMsOfDay])

  useEffect(() => {
    sessionStorage.setItem(TIMELINE_CAMERA_KEY, cameraId)
  }, [cameraId])

  const seekVideoToPlayhead = useCallback(
    (ms: number) => {
      const el = videoRef.current
      if (!el || !el.duration) return
      scrubbing.current = true
      el.currentTime = (clamp(ms, 0, MS_PER_DAY) / MS_PER_DAY) * el.duration
      queueMicrotask(() => {
        scrubbing.current = false
      })
    },
    [],
  )

  const onPlayheadChange = (ms: number) => {
    const next = clamp(ms, 0, MS_PER_DAY)
    setPlayheadMsOfDay(next)
    seekVideoToPlayhead(next)
  }

  const onSkip = (deltaSec: number) => {
    const el = videoRef.current
    if (el && el.duration) {
      el.currentTime = clamp(el.currentTime + deltaSec, 0, el.duration)
      setPlayheadMsOfDay(videoTimeToMsOfDay(el.currentTime, el.duration))
      return
    }
    onPlayheadChange(playheadMsOfDay + deltaSec * 1000)
  }

  if (camerasLoading || summaryLoading) {
    return <p className="p-4 text-neutral-500 dark:text-neutral-400">Loading timeline…</p>
  }
  if (camerasError || summaryError) {
    return <p className="p-4 text-red-600 dark:text-red-400">{camerasError ?? summaryError}</p>
  }
  if (cameras.length === 0) {
    return <p className="p-4 text-neutral-500 dark:text-neutral-400">No cameras configured.</p>
  }

  return (
    <div ref={containerRef} className="mx-auto flex w-full max-w-3xl flex-col lg:max-w-5xl xl:max-w-7xl">
      <header className="flex items-center justify-between gap-2 px-3 py-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 rounded-md px-2 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ‹ Live
        </button>
        <CameraSelect cameras={cameras} value={cameraId} onChange={onCameraChange} />
        <DateSelect value={day} retentionDays={7} onChange={setDay} />
      </header>

      <div className="px-3">
        <PlaybackPlayer
          src={vodUrl}
          playheadMsOfDay={playheadMsOfDay}
          playing={playing}
          speed={speed}
          videoRef={videoRef}
          onTimeUpdate={(t, d) => {
            if (scrubbing.current || !d) return
            setPlayheadMsOfDay(videoTimeToMsOfDay(t, d))
          }}
          onEnded={() => setPlaying(false)}
        />
      </div>

      <TransportBar
        playing={playing}
        speed={speed}
        onTogglePlay={() => setPlaying((p) => !p)}
        onSkip={onSkip}
        onCycleSpeed={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]!)}
        onFullscreen={() => {
          const el = containerRef.current
          if (!el) return
          if (document.fullscreenElement) void document.exitFullscreen()
          else void el.requestFullscreen()
        }}
      />

      <div className="px-3 text-sm text-neutral-500 dark:text-neutral-400">
        {ranges.length > 0 ? (
          <span>Coverage · {ranges.length} hour(s)</span>
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
