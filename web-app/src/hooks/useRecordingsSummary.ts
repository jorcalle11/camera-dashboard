import { useEffect, useState } from "react"
import {
  MS_PER_DAY,
  localDayStartMs,
  rangesFromSegments,
  type TimeRange,
} from "../lib/timeline"

interface SegmentRow {
  startTs: number
  durationMs: number
}

const POLL_MS = 30_000

export function useRecordingsSummary(cameraId: string, day: string) {
  const [ranges, setRanges] = useState<TimeRange[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadedKey, setLoadedKey] = useState("")
  const key = `${cameraId}:${day}`

  if (loadedKey !== key && !loading) {
    setLoading(true)
    setError(null)
    setRanges([])
  }

  useEffect(() => {
    let cancelled = false
    let first = true

    const load = () => {
      const from = localDayStartMs(day)
      const to = from + MS_PER_DAY
      if (first) {
        setLoading(true)
        setError(null)
      }

      fetch(`/api/cameras/${encodeURIComponent(cameraId)}/recordings?from=${from}&to=${to}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return (await res.json()) as SegmentRow[]
        })
        .then((data) => {
          if (!cancelled) {
            setRanges(rangesFromSegments(data, from))
            setLoadedKey(key)
            setLoading(false)
            first = false
          }
        })
        .catch((err: Error) => {
          if (!cancelled) {
            if (first) {
              setError(err.message)
              setLoadedKey(key)
              setLoading(false)
            }
            first = false
          }
        })
    }

    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [cameraId, day, key])

  return { ranges, loading, error }
}
