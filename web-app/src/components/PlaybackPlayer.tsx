import { useEffect, useRef, type RefObject } from "react"
import Hls from "hls.js"
import { formatMsOfDay } from "../lib/timeline"

interface PlaybackPlayerProps {
  src: string
  playheadMsOfDay: number
  playing: boolean
  speed: number
  videoRef?: RefObject<HTMLVideoElement | null>
  onTimeUpdate?: (currentTime: number, duration: number) => void
  onEnded?: () => void
  onLoadedMetadata?: (duration: number) => void
}

export default function PlaybackPlayer({
  src,
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
  const hlsRef = useRef<Hls | null>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    if (src && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hlsRef.current = hls

      hls.loadSource(src)
      hls.attachMedia(el)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        onLoadedMetadata?.(el.duration || 0)
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError()
              break
            default:
              hls.destroy()
              break
          }
        }
      })

      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    } else if (src && el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = src
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [src, videoRef, onLoadedMetadata])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (playing) void el.play().catch(() => {})
    else el.pause()
  }, [playing, videoRef, src])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.playbackRate = speed
  }, [speed, videoRef])

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
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
