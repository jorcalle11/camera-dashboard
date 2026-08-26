import { useEffect, useState } from "react"
import LiveGrid from "./components/LiveGrid"
import TabBar, { type View } from "./components/TabBar"
import TimelinePage, { TIMELINE_CAMERA_KEY } from "./components/TimelinePage"
import { useCameras } from "./hooks/useCameras"
import { useRecorderStatus } from "./hooks/useRecorderStatus"
import { useTheme } from "./hooks/useTheme"

function readStoredCamera(): string | null {
  try {
    return sessionStorage.getItem(TIMELINE_CAMERA_KEY)
  } catch {
    return null
  }
}

export default function App() {
  const [view, setView] = useState<View>("live")
  const [timelineCameraId, setTimelineCameraId] = useState<string | null>(() => readStoredCamera())
  const recorderStatus = useRecorderStatus()
  const { cameras } = useCameras()
  useTheme()

  useEffect(() => {
    if (!timelineCameraId && cameras.length > 0) {
      setTimelineCameraId(cameras[0]!.id)
    }
  }, [cameras, timelineCameraId])

  const openTimeline = (cameraId?: string) => {
    const id = cameraId ?? timelineCameraId ?? cameras[0]?.id
    if (id) {
      setTimelineCameraId(id)
      sessionStorage.setItem(TIMELINE_CAMERA_KEY, id)
    }
    setView("timeline")
  }

  return (
    <div className="flex h-full flex-col-reverse bg-neutral-50 md:flex-col dark:bg-neutral-950">
      <TabBar
        view={view}
        onChange={(next) => {
          if (next === "timeline") openTimeline()
          else setView("live")
        }}
      />
      <main className="flex-1 overflow-y-auto pb-14 md:pb-0">
        {view === "live" ? (
          <LiveGrid status={recorderStatus} />
        ) : timelineCameraId ? (
          <TimelinePage
            cameraId={timelineCameraId}
            onCameraChange={(id) => {
              setTimelineCameraId(id)
              sessionStorage.setItem(TIMELINE_CAMERA_KEY, id)
            }}
            onBack={() => setView("live")}
          />
        ) : (
          <p className="p-4 text-neutral-500 dark:text-neutral-400">No cameras configured.</p>
        )}
      </main>
    </div>
  )
}
