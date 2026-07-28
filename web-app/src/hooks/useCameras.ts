import { useEffect, useState } from "react"
import type { Camera } from "../types"

export function useCameras() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch("/api/cameras")
      .then((res) => {
        if (!res.ok) throw new Error(`failed to load cameras: HTTP ${res.status}`)
        return res.json() as Promise<Camera[]>
      })
      .then((list) => {
        if (!cancelled) setCameras(list)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { cameras, error, loading }
}
