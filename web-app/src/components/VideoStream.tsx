import { useEffect, useRef, useState } from "react"
import { loadVideoStreamElement, posterUrl, streamWsUrl } from "../lib/go2rtc"

interface VideoStreamProps {
  cameraId: string
  /** When true, tear down the stream and show a still poster instead. */
  paused?: boolean
  className?: string
}

export default function VideoStream({ cameraId, paused = false, className }: VideoStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || paused) return
    let cancelled = false

    loadVideoStreamElement()
      .then(() => {
        if (cancelled) return
        // video-stream is go2rtc's custom element: set .mode and .src, it does the rest.
        const el = document.createElement("video-stream") as HTMLElement & {
          mode: string
          src: string
        }
        el.mode = "webrtc,mse"
        el.src = streamWsUrl(cameraId)
        el.style.width = "100%"
        el.style.height = "100%"
        container.replaceChildren(el)
      })
      .catch(() => setFailed(true))

    return () => {
      cancelled = true
      container.replaceChildren()
    }
  }, [cameraId, paused])

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-black text-sm text-red-400 ${className ?? ""}`}>
        stream unavailable
      </div>
    )
  }

  if (paused) {
    return (
      <img
        src={posterUrl(cameraId)}
        alt={`${cameraId} paused`}
        className={`h-full w-full object-contain ${className ?? ""}`}
      />
    )
  }

  return <div ref={containerRef} className={className} />
}
