import { useEffect, useRef, useState } from "react"

export interface RecorderStatus {
  state: "recording" | "retrying" | "stopped"
  restarts: number
}

export function useRecorderStatus(): Record<string, RecorderStatus> {
  const [status, setStatus] = useState<Record<string, RecorderStatus>>({})
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const backoffRef = useRef(1000)

  useEffect(() => {
    let closed = false
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:"

    const connect = () => {
      if (closed) return
      const ws = new WebSocket(`${proto}//${window.location.host}/api/ws`)
      wsRef.current = ws
      ws.onopen = () => {
        backoffRef.current = 1000
      }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type: string; cameras?: Record<string, RecorderStatus> }
          if (msg.type === "status" && msg.cameras) setStatus(msg.cameras)
        } catch {
          // ignore parse errors
        }
      }
      ws.onclose = () => {
        if (closed) return
        const delay = Math.min(backoffRef.current, 30000)
        backoffRef.current = delay * 2
        reconnectTimerRef.current = window.setTimeout(connect, delay)
      }
      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      closed = true
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [])

  return status
}
