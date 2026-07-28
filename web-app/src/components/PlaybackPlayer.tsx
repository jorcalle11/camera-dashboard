import { useEffect, useRef, type RefObject } from "react"
import { formatMsOfDay } from "../lib/timeline"

interface PlaybackPlayerProps {
  videoUrl: string
  playheadMsOfDay: number
  playing: boolean
  speed: number
  videoRef?: RefObject<HTMLVideoElement | null>
  onTimeUpdate?: (currentTime: number, duration: number) => void
  onEnded?: () => void
  onLoadedMetadata?: (duration: number) => void
}

export default function PlaybackPlayer({
  videoUrl,
  playheadMsOfDay,
  playing,
  speed,
  videoRef: externalRef,
  onTimeUpdate,
  onEnded,
  onLoadedMetadata,
}: PlaybackPlayerProps) {
  const internalRef = useRef<HTMLVideoElement>(null)
  const videoRef = externalRef ?? internalRef

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.playbackRate = speed
  }, [speed, videoRef])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (playing) void el.play().catch(() => {})
    else el.pause()
  }, [playing, videoRef, videoUrl])

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        src={videoUrl}
        className="h-full w-full object-contain"
        playsInline
        preload="metadata"
        onTimeUpdate={(e) => {
          const v = e.currentTarget
          onTimeUpdate?.(v.currentTime, v.duration || 0)
        }}
        onEnded={() => onEnded?.()}
        onLoadedMetadata={(e) => onLoadedMetadata?.(e.currentTarget.duration || 0)}
      />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/65 px-2 py-0.5 font-mono text-xs text-white tabular-nums">
        {formatMsOfDay(playheadMsOfDay)}
      </div>
    </div>
  )
}
