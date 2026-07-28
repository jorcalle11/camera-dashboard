import { useEffect, useState } from "react"
import type { TimeRange } from "../lib/timeline"

interface SummaryHour {
  hour: number
  coverageMs: number
  segmentCount: number
}

interface SummaryResponse {
  cameraId: string
  day: string
  hours: SummaryHour[]
}

function hoursToRanges(hours: SummaryHour[]): TimeRange[] {
  const ranges: TimeRange[] = []
  for (const h of hours) {
    if (h.coverageMs <= 0) continue
    const startMsOfDay = h.hour * 3_600_000
    const endMsOfDay = startMsOfDay + h.coverageMs
    ranges.push({ startMsOfDay, endMsOfDay })
  }
  return ranges
}

export function useRecordingsSummary(cameraId: string, day: string) {
  const [ranges, setRanges] = useState<TimeRange[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/cameras/${encodeURIComponent(cameraId)}/recordings/summary?day=${day}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as SummaryResponse
      })
      .then((data) => {
        if (!cancelled) {
          setRanges(hoursToRanges(data.hours))
          setLoading(false)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [cameraId, day])

  return { ranges, loading, error }
}
