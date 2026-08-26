import { useEffect } from "react"
import LiveGrid from "./components/LiveGrid"
import TabBar, { type View } from "./components/TabBar"
import TimelinePage, { TIMELINE_CAMERA_KEY } from "./components/TimelinePage"
import { useCameras } from "./hooks/useCameras"
import { useRecorderStatus } from "./hooks/useRecorderStatus"
import { useTheme } from "./hooks/useTheme"
import { cameraIdFromPath, navigate, timelinePath, usePathname } from "./lib/routes"

export default function App() {
  const pathname = usePathname()
  const routeCameraId = cameraIdFromPath(pathname)
  const recorderStatus = useRecorderStatus()
  const { cameras } = useCameras()
  useTheme()

  const view: View = routeCameraId ? "timeline" : "live"

  useEffect(() => {
    if (!routeCameraId) return
    sessionStorage.setItem(TIMELINE_CAMERA_KEY, routeCameraId)
  }, [routeCameraId])

  const openTimeline = (cameraId?: string) => {
    let stored: string | null = null
    try {
      stored = sessionStorage.getItem(TIMELINE_CAMERA_KEY)
    } catch {
      stored = null
    }
    const id = cameraId ?? routeCameraId ?? stored ?? cameras[0]?.id
    if (!id) return
    navigate(timelinePath(id))
  }

  return (
    <div className="flex h-full flex-col-reverse bg-neutral-50 md:flex-col dark:bg-neutral-950">
      <TabBar
        view={view}
        onChange={(next) => {
          if (next === "timeline") openTimeline()
          else navigate("/")
        }}
      />
      <main className="flex-1 overflow-y-auto pb-14 md:pb-0">
        {view === "live" ? (
          <LiveGrid status={recorderStatus} />
        ) : routeCameraId ? (
          <TimelinePage
            cameraId={routeCameraId}
            onCameraChange={(id) => navigate(timelinePath(id))}
            onBack={() => navigate("/")}
          />
        ) : (
          <p className="p-4 text-neutral-500 dark:text-neutral-400">No cameras configured.</p>
        )}
      </main>
    </div>
  )
}
