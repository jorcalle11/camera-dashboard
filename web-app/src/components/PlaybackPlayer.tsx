import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react"
import type React from "react"
import { formatMsOfDay } from "../lib/timeline"
import {
  findSegmentIndexForMs,
  parseVodPlaylist,
  type VodSegment,
} from "../lib/vodPlaylist"

export type PlaybackPlayerHandle = {
  seekToMsOfDay: (msOfDay: number) => void
}

interface PlaybackPlayerProps {
  src: string
  /** Wall-clock position to open when `src` (playlist) changes. */
  initialMsOfDay: number
  playheadMsOfDay: number
  playing: boolean
  speed: number
  onTimeUpdate?: (msOfDay: number) => void
  onEnded?: () => void
  onLoadedMetadata?: () => void
}

const PlaybackPlayer = forwardRef<PlaybackPlayerHandle, PlaybackPlayerProps>(
  function PlaybackPlayer(
    {
      src,
      initialMsOfDay,
      playheadMsOfDay,
      playing,
      speed,
      onTimeUpdate,
      onEnded,
      onLoadedMetadata,
    },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const segmentsRef = useRef<VodSegment[]>([])
    const segmentIndexRef = useRef(0)
    const loadGenerationRef = useRef(0)
    const pendingSeekMsRef = useRef<number | null>(null)

    const applySegment = useCallback(
      (index: number, seekSec: number, generation: number) => {
        const el = videoRef.current
        const seg = segmentsRef.current[index]
        if (!el || !seg) return

        segmentIndexRef.current = index

        const onMeta = () => {
          el.removeEventListener("loadedmetadata", onMeta)
          if (generation !== loadGenerationRef.current) return
          el.currentTime = seekSec
          onLoadedMetadata?.()
          if (playing) void el.play().catch(() => {})
        }

        el.addEventListener("loadedmetadata", onMeta)
        el.src = seg.url
        el.load()
      },
      [onLoadedMetadata, playing],
    )

    const seekToMsOfDay = useCallback(
      (msOfDay: number) => {
        const segments = segmentsRef.current
        if (segments.length === 0) {
          pendingSeekMsRef.current = msOfDay
          return
        }

        const idx = findSegmentIndexForMs(segments, msOfDay)
        if (idx < 0) return

        const seg = segments[idx]!
        const seekSec = Math.max(0, (msOfDay - seg.startMsOfDay) / 1000)

        if (idx === segmentIndexRef.current && videoRef.current && videoRef.current.readyState >= 1) {
          videoRef.current.currentTime = seekSec
          return
        }

        const generation = ++loadGenerationRef.current
        applySegment(idx, seekSec, generation)
      },
      [applySegment],
    )

    useImperativeHandle(ref, () => ({ seekToMsOfDay }), [seekToMsOfDay])

    useEffect(() => {
      const el = videoRef.current
      if (!el || !src) return

      let cancelled = false
      const generation = ++loadGenerationRef.current
      segmentsRef.current = []
      segmentIndexRef.current = 0
      pendingSeekMsRef.current = null

      void (async () => {
        try {
          const res = await fetch(src)
          if (!res.ok) throw new Error(`Playlist ${res.status}`)
          const text = await res.text()
          if (cancelled || generation !== loadGenerationRef.current) return

          segmentsRef.current = parseVodPlaylist(text, src)
          const targetMs = pendingSeekMsRef.current ?? initialMsOfDay
          pendingSeekMsRef.current = null
          if (segmentsRef.current.length === 0) return

          const idx = findSegmentIndexForMs(segmentsRef.current, targetMs)
          const seg = segmentsRef.current[idx >= 0 ? idx : 0]!
          const seekSec = Math.max(0, (targetMs - seg.startMsOfDay) / 1000)
          applySegment(idx >= 0 ? idx : 0, seekSec, generation)
        } catch {
          /* leave video empty; parent can show coverage status */
        }
      })()

      return () => {
        cancelled = true
        el.removeAttribute("src")
        el.load()
      }
    }, [src, initialMsOfDay, applySegment])

    useEffect(() => {
      const el = videoRef.current
      if (!el) return
      if (playing) void el.play().catch(() => {})
      else el.pause()
    }, [playing])

    useEffect(() => {
      const el = videoRef.current
      if (!el) return
      el.playbackRate = speed
    }, [speed])

    const onVideoEnded = () => {
      const next = segmentIndexRef.current + 1
      if (next < segmentsRef.current.length) {
        const generation = loadGenerationRef.current
        applySegment(next, 0, generation)
        return
      }
      onEnded?.()
    }

    return (
      <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef as React.RefObject<HTMLVideoElement>}
          className="h-full w-full object-contain"
          playsInline
          preload="auto"
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            const seg = segmentsRef.current[segmentIndexRef.current]
            if (!seg) return
            onTimeUpdate?.(seg.startMsOfDay + v.currentTime * 1000)
          }}
          onEnded={onVideoEnded}
        />
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/65 px-2 py-0.5 font-mono text-xs text-white tabular-nums">
          {formatMsOfDay(playheadMsOfDay)}
        </div>
      </div>
    )
  },
)

export default PlaybackPlayer
