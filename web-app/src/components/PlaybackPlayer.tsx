import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
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
  /** Local midnight epoch for converting playlist timestamps to ms-of-day. */
  dayStartMs: number
  /** Wall-clock position to open when `src` (playlist) changes. */
  initialMsOfDay: number
  playheadMsOfDay: number
  onTimeUpdate?: (msOfDay: number) => void
  onEnded?: () => void
  onLoadedMetadata?: () => void
}

const PlaybackPlayer = forwardRef<PlaybackPlayerHandle, PlaybackPlayerProps>(
  function PlaybackPlayer(
    {
      src,
      dayStartMs,
      initialMsOfDay,
      playheadMsOfDay,
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
    const playNextRef = useRef(false)
    const onLoadedMetadataRef = useRef(onLoadedMetadata)
    const [empty, setEmpty] = useState(!src)

    onLoadedMetadataRef.current = onLoadedMetadata

    const applySegment = useCallback((index: number, seekSec: number, generation: number) => {
      const el = videoRef.current
      const seg = segmentsRef.current[index]
      if (!el || !seg) return

      segmentIndexRef.current = index

      const onMeta = () => {
        el.removeEventListener("loadedmetadata", onMeta)
        if (generation !== loadGenerationRef.current) return
        el.currentTime = seekSec
        onLoadedMetadataRef.current?.()
        if (playNextRef.current) {
          playNextRef.current = false
          void el.play().catch(() => {})
        }
      }

      el.addEventListener("loadedmetadata", onMeta)
      el.src = seg.url
      el.load()
    }, [])

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

        playNextRef.current = Boolean(videoRef.current && !videoRef.current.paused)
        const generation = ++loadGenerationRef.current
        applySegment(idx, seekSec, generation)
      },
      [applySegment],
    )

    useImperativeHandle(ref, () => ({ seekToMsOfDay }), [seekToMsOfDay])

    useEffect(() => {
      const el = videoRef.current
      if (!el) return
      if (!src) {
        setEmpty(true)
        el.removeAttribute("src")
        el.load()
        return
      }

      let cancelled = false
      const generation = ++loadGenerationRef.current
      segmentsRef.current = []
      segmentIndexRef.current = 0
      pendingSeekMsRef.current = null
      playNextRef.current = false
      setEmpty(false)

      void (async () => {
        try {
          const res = await fetch(src)
          if (!res.ok) throw new Error(`Playlist ${res.status}`)
          const text = await res.text()
          if (cancelled || generation !== loadGenerationRef.current) return

          segmentsRef.current = parseVodPlaylist(text, src, { dayStartMs })
          const targetMs = pendingSeekMsRef.current ?? initialMsOfDay
          pendingSeekMsRef.current = null
          if (segmentsRef.current.length === 0) {
            setEmpty(true)
            return
          }

          const idx = findSegmentIndexForMs(segmentsRef.current, targetMs)
          const seg = segmentsRef.current[idx >= 0 ? idx : 0]!
          const seekSec = Math.max(0, (targetMs - seg.startMsOfDay) / 1000)
          applySegment(idx >= 0 ? idx : 0, seekSec, generation)
        } catch {
          if (!cancelled) setEmpty(true)
        }
      })()

      return () => {
        cancelled = true
        el.removeAttribute("src")
        el.load()
      }
    }, [src, dayStartMs, initialMsOfDay, applySegment])

    const onVideoEnded = () => {
      const next = segmentIndexRef.current + 1
      if (next < segmentsRef.current.length) {
        playNextRef.current = true
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
          controls
          playsInline
          preload="auto"
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            const seg = segmentsRef.current[segmentIndexRef.current]
            if (!seg) return
            if (v.currentTime > seg.durationSec + 0.5) {
              onVideoEnded()
              return
            }
            onTimeUpdate?.(seg.startMsOfDay + Math.min(v.currentTime, seg.durationSec) * 1000)
          }}
          onEnded={onVideoEnded}
        />
        {empty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-neutral-400">
            No footage at this time
          </div>
        ) : (
          <div className="pointer-events-none absolute top-2 left-2 rounded bg-black/65 px-2 py-0.5 font-mono text-xs text-white tabular-nums">
            {formatMsOfDay(playheadMsOfDay)}
          </div>
        )}
      </div>
    )
  },
)

export default PlaybackPlayer
