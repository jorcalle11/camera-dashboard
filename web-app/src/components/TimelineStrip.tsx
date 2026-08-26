import { useCallback, useEffect, useRef, useState } from "react"
import {
  MS_PER_DAY,
  clamp,
  clampZoom,
  formatMsOfDay,
  type TimeRange,
} from "../lib/timeline"

export type ZoomWindow = { startMs: number; endMs: number }

interface TimelineStripProps {
  ranges: TimeRange[]
  playheadMsOfDay: number
  zoom: ZoomWindow
  onPlayheadChange: (ms: number) => void
  onZoomChange: (zoom: ZoomWindow) => void
}

function msFromClientX(clientX: number, rect: DOMRect, zoom: ZoomWindow): number {
  const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
  return zoom.startMs + ratio * (zoom.endMs - zoom.startMs)
}

export default function TimelineStrip({
  ranges,
  playheadMsOfDay,
  zoom,
  onPlayheadChange,
  onZoomChange,
}: TimelineStripProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const pinchStart = useRef<{ distance: number; zoom: ZoomWindow } | null>(null)
  const [hoverMs, setHoverMs] = useState<number | null>(null)
  const [hoverX, setHoverX] = useState(0)

  const span = Math.max(1, zoom.endMs - zoom.startMs)
  const playheadPct = clamp(((playheadMsOfDay - zoom.startMs) / span) * 100, 0, 100)

  const setFromEvent = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      onPlayheadChange(msFromClientX(clientX, rect, zoom))
    },
    [onPlayheadChange, zoom],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      /* continue */
    }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    dragging.current = true
    setFromEvent(e.clientX)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const el = trackRef.current
    if (el) {
      const rect = el.getBoundingClientRect()
      const ms = msFromClientX(e.clientX, rect, zoom)
      setHoverMs(ms)
      setHoverX(e.clientX - rect.left)
    }
    if (dragging.current) setFromEvent(e.clientX)
  }

  const onPointerUp = () => {
    dragging.current = false
  }

  useEffect(() => {
    const el = trackRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const currentSpan = Math.max(1, zoom.endMs - zoom.startMs)
      const anchor = msFromClientX(e.clientX, rect, zoom)
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15
      const newSpan = clamp(currentSpan * factor, 15 * 60 * 1000, MS_PER_DAY)
      const ratio = currentSpan > 0 ? (anchor - zoom.startMs) / currentSpan : 0.5
      const start = anchor - ratio * newSpan
      onZoomChange(clampZoom(start, start + newSpan))
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStart.current) {
        e.preventDefault()
        const dx = e.touches[0]!.clientX - e.touches[1]!.clientX
        const dy = e.touches[0]!.clientY - e.touches[1]!.clientY
        const dist = Math.hypot(dx, dy)
        const scale = pinchStart.current.distance / Math.max(dist, 1)
        const z0 = pinchStart.current.zoom
        const mid = (z0.startMs + z0.endMs) / 2
        const newSpan = (z0.endMs - z0.startMs) * scale
        onZoomChange(clampZoom(mid - newSpan / 2, mid + newSpan / 2))
      }
    }

    el.addEventListener("wheel", handleWheel, { passive: false })
    el.addEventListener("touchmove", handleTouchMove, { passive: false })
    return () => {
      el.removeEventListener("wheel", handleWheel)
      el.removeEventListener("touchmove", handleTouchMove)
    }
  }, [zoom, onZoomChange])

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      pinchStart.current = { distance: Math.hypot(dx, dy), zoom }
    }
  }

  const onTouchEnd = () => {
    if (pinchStart.current) pinchStart.current = null
  }

  const visibleRanges = ranges
    .map((r) => ({
      left: ((Math.max(r.startMsOfDay, zoom.startMs) - zoom.startMs) / span) * 100,
      width: ((Math.min(r.endMsOfDay, zoom.endMs) - Math.max(r.startMsOfDay, zoom.startMs)) / span) * 100,
    }))
    .filter((r) => r.width > 0)

  const ticks = 5
  const tickLabels = Array.from({ length: ticks }, (_, i) => {
    const ms = zoom.startMs + (span * i) / (ticks - 1)
    return formatMsOfDay(ms).slice(0, 5)
  })

  return (
    <div className="px-3 pb-3 pt-1">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Timeline playhead"
        aria-valuemin={0}
        aria-valuemax={MS_PER_DAY}
        aria-valuenow={Math.round(playheadMsOfDay)}
        aria-valuetext={formatMsOfDay(playheadMsOfDay)}
        className="relative h-14 cursor-ew-resize touch-none select-none rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          onPointerUp()
          setHoverMs(null)
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 60_000 : 5_000
          if (e.key === "ArrowLeft") {
            e.preventDefault()
            onPlayheadChange(clamp(playheadMsOfDay - step, 0, MS_PER_DAY))
          }
          if (e.key === "ArrowRight") {
            e.preventDefault()
            onPlayheadChange(clamp(playheadMsOfDay + step, 0, MS_PER_DAY))
          }
        }}
      >
        {visibleRanges.map((r, i) => (
          <div
            key={i}
            className="absolute top-4 h-6 rounded-sm bg-green-500/80 dark:bg-green-500/70"
            style={{ left: `${r.left}%`, width: `${Math.max(r.width, 0.2)}%` }}
          />
        ))}
        <div
          className="pointer-events-none absolute top-2 bottom-2 w-0.5 bg-amber-400 shadow"
          style={{ left: `${playheadPct}%` }}
        />
        {hoverMs != null && (
          <div
            className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-white dark:bg-neutral-100 dark:text-neutral-900"
            style={{ left: hoverX }}
          >
            {formatMsOfDay(hoverMs)}
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
        {tickLabels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
      <p className="mt-1 text-center text-[10px] text-neutral-400 dark:text-neutral-500">
        drag to scrub · wheel / pinch to zoom
      </p>
    </div>
  )
}
