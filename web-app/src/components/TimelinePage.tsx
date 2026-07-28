import { useCallback, useEffect, useRef, useState } from "react"
import { useCameras } from "../hooks/useCameras"
import { useTimelineFixtures } from "../hooks/useTimelineFixtures"
import {
  MS_PER_DAY,
  clamp,
  clampZoom,
  msOfDayToVideoTime,
  videoTimeToMsOfDay,
} from "../lib/timeline"
import CameraSelect from "./CameraSelect"
import DateSelect from "./DateSelect"
import PlaybackPlayer from "./PlaybackPlayer"
import TimelineStrip, { type ZoomWindow } from "./TimelineStrip"
import TransportBar, { type PlaybackSpeed } from "./TransportBar"

const SPEEDS: PlaybackSpeed[] = [1, 2, 4]
export const TIMELINE_CAMERA_KEY = "timeline.cameraId"

interface TimelinePageProps {
  cameraId: string
  onCameraChange: (cameraId: string) => void
  onBack: () => void
}

export default function TimelinePage({ cameraId, onCameraChange, onBack }: TimelinePageProps) {
  const { cameras, loading: camerasLoading, error: camerasError } = useCameras()
  const { day: fixtureDay, ranges, videoUrl, loading: fixLoading, error: fixError } = useTimelineFixtures(cameraId)

  const [day, setDay] = useState(fixtureDay ?? "2026-07-23")
  const [playheadMsOfDay, setPlayheadMsOfDay] = useState(12 * 3600 * 1000)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(1)
  const [zoom, setZoom] = useState<ZoomWindow>({ startMs: 0, endMs: MS_PER_DAY })
  const [duration, setDuration] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)

  useEffect(() => {
    if (fixtureDay) setDay(fixtureDay)
  }, [fixtureDay])

  useEffect(() => {
    sessionStorage.setItem(TIMELINE_CAMERA_KEY, cameraId)
  }, [cameraId])

  const seekVideoToPlayhead = useCallback(
    (ms: number) => {
      const el = videoRef.current
      if (!el || !duration) return
      scrubbing.current = true
      el.currentTime = msOfDayToVideoTime(ms, duration)
      queue.then(() => {
        scrubbing.current = false
      })
    },
    [duration],
  )

  const onPlayheadChange = (ms: number) => {
    const next = clamp(ms, 0, MS_PER_DAY)
    setPlayheadMsOfDay(next)
    seekVideoToPlayhead(next)
  }

  const onSkip = (deltaSec: number) => {
    const el = videoRef.current
    if (el && duration) {
      el.currentTime = clamp(el.currentTime + deltaSec, 0, duration)
      setPlayheadMsOfDay(videoTimeToMsOfDay(el.currentTime, duration))
      return
    }
    onPlayheadChange(playheadMsOfDay + deltaSec * 1000)
  }

  const activeRanges = day === fixtureDay ? ranges : []

  if (camerasLoading || fixLoading) {
    return <p className="p-4 text-neutral-500 dark:text-neutral-400">Loading timeline…</p>
  }
  if (camerasError || fixError) {
    return <p className="p-4 text-red-600 dark:text-red-400">{camerasError ?? fixError}</p>
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
        <DateSelect value={day} fixtureDay={fixtureDay} onChange={setDay} />
      </header>

      <div className="px-3">
        <PlaybackPlayer
          videoUrl={videoUrl}
          playheadMsOfDay={playheadMsOfDay}
          playing={playing}
          speed={speed}
          videoRef={videoRef}
          onLoadedMetadata={(d) => setDuration(d)}
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
        {day === fixtureDay ? (
          <span>Mock coverage · {activeRanges.length} range(s)</span>
        ) : (
          <span>No fixture footage for this day</span>
        )}
      </div>

      <TimelineStrip
        ranges={activeRanges}
        playheadMsOfDay={playheadMsOfDay}
        zoom={zoom}
        onPlayheadChange={onPlayheadChange}
        onZoomChange={(z) => setZoom(clampZoom(z.startMs, z.endMs))}
      />
    </div>
  )
}
