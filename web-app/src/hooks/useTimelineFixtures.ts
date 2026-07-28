import { useEffect, useState } from "react"
import type { TimeRange, TimelineCoverageFile } from "../lib/timeline"

const COVERAGE_URL = "/fixtures/timeline-coverage.json"
export const FIXTURE_VIDEO_URL = "/fixtures/sample.mp4"

export type TimelineFixtures = {
  day: string | null
  ranges: TimeRange[]
  videoUrl: string
  loading: boolean
  error: string | null
}

export function useTimelineFixtures(cameraId: string | null): TimelineFixtures {
  const [data, setData] = useState<TimelineCoverageFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(COVERAGE_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load coverage: ${res.status}`)
        return (await res.json()) as TimelineCoverageFile
      })
      .then((json) => {
        if (!cancelled) {
          setData(json)
          setError(null)
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
  }, [])

  const ranges = cameraId && data?.cameras[cameraId]?.ranges ? data.cameras[cameraId].ranges : []

  return {
    day: data?.day ?? null,
    ranges,
    videoUrl: FIXTURE_VIDEO_URL,
    loading,
    error,
  }
}
