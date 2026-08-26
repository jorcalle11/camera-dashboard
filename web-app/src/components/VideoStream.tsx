import { useEffect, useRef, useState } from "react"
import { loadVideoStreamElement, posterUrl, streamWsUrl } from "../lib/go2rtc"

interface VideoStreamProps {
  cameraId: string
  /** When true, tear down the stream and show a still poster instead. */
  paused?: boolean
  className?: string
}

type StreamState = "connecting" | "live" | "reconnecting"

const WATCHDOG_INTERVAL_MS = 3000
/** Recreate the stream if no new frames arrive for this long (producer EOFs leave the video frozen/black otherwise). */
const STALL_LIMIT_MS = 10_000

export default function VideoStream({ cameraId, paused = false, className }: VideoStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<StreamState>("connecting")
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (paused || failed) return
    const container = containerRef.current
    if (!container) return
    let cancelled = false

    type StreamElement = HTMLElement & { mode: string; src: string }
    let el: StreamElement | null = null
    let muteObserver: MutationObserver | null = null
    let lastVideoTime = -1
    let lastAdvanceAt = Date.now()
    let hasAdvanced = false

    const muteInnerVideo = (root: HTMLElement) => {
      const video =
        root.querySelector("video") ?? root.shadowRoot?.querySelector("video")
      if (!video) return false
      video.muted = true
      video.defaultMuted = true
      return true
    }

    const mount = (retrying: boolean) => {
      muteObserver?.disconnect()
      muteObserver = null
      container.replaceChildren()
      el = document.createElement("video-stream") as StreamElement
      // MSE first: starts instantly over the proxied WebSocket. WebRTC needs a
      // direct UDP path to the host and can stall startup for several seconds.
      el.mode = "mse"
      el.src = streamWsUrl(cameraId)
      el.style.width = "100%"
      el.style.height = "100%"
      container.appendChild(el)
      if (!muteInnerVideo(el)) {
        muteObserver = new MutationObserver(() => {
          if (el && muteInnerVideo(el)) {
            muteObserver?.disconnect()
            muteObserver = null
          }
        })
        muteObserver.observe(el, { childList: true, subtree: true })
      }
      lastVideoTime = -1
      lastAdvanceAt = Date.now()
      hasAdvanced = false
      setState(retrying ? "reconnecting" : "connecting")
    }

    // The go2rtc element reconnects its WebSocket on its own, but a dead
    // camera-side producer can leave the <video> frozen without closing the
    // socket — so watch frame progression and remount on stalls.
    const watchdog = window.setInterval(() => {
      if (!el) return
      if (document.hidden) {
        lastAdvanceAt = Date.now()
        return
      }
      const video = el.shadowRoot?.querySelector("video")
      if (!video) return
      if (video.currentTime > lastVideoTime) {
        lastVideoTime = video.currentTime
        lastAdvanceAt = Date.now()
        if (!hasAdvanced) {
          hasAdvanced = true
          setState("live")
        }
      } else if (Date.now() - lastAdvanceAt > STALL_LIMIT_MS) {
        mount(true)
      }
    }, WATCHDOG_INTERVAL_MS)

    loadVideoStreamElement()
      .then(() => {
        if (!cancelled) mount(false)
      })
      .catch(() => setFailed(true))

    return () => {
      cancelled = true
      muteObserver?.disconnect()
      window.clearInterval(watchdog)
      container.replaceChildren()
      el = null
    }
  }, [cameraId, paused, failed])

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

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      {state !== "live" && (
        <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
          {state === "connecting" ? "connecting…" : "reconnecting…"}
        </span>
      )}
    </div>
  )
}
