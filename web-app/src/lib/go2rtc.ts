export const GO2RTC_BASE = "/go2rtc"

/**
 * go2rtc player modes, in preference order. The <video-stream> element starts
 * every listed mode at once and keeps the best one (WebRTC > MSE), so WebRTC
 * is used whenever its UDP path to the host is reachable while MSE stays as a
 * fallback. MSE alone cannot recover from the gapped/broken camera streams we
 * see in the wild and eventually takes the whole tab down.
 * Override with VITE_STREAM_MODE at build time if needed.
 */
export const STREAM_MODE =
  (import.meta.env.VITE_STREAM_MODE as string | undefined)?.trim() || "webrtc,mse"

export function posterUrl(cameraId: string): string {
  return `${GO2RTC_BASE}/api/frame.jpeg?src=${encodeURIComponent(cameraId)}`
}

export function streamWsUrl(cameraId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${window.location.host}${GO2RTC_BASE}/api/ws?src=${encodeURIComponent(cameraId)}`
}

let scriptPromise: Promise<void> | null = null

/** Load go2rtc's video-stream.js custom element exactly once. */
export function loadVideoStreamElement(): Promise<void> {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script")
      script.type = "module"
      script.src = `${GO2RTC_BASE}/video-stream.js`
      script.onload = () => resolve()
      script.onerror = () => {
        scriptPromise = null
        reject(new Error("failed to load video-stream.js from go2rtc"))
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}
