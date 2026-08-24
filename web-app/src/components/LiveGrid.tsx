import type { RecorderStatus } from "../hooks/useRecorderStatus"
import { useCameras } from "../hooks/useCameras"
import CameraTile from "./CameraTile"

interface LiveGridProps {
  status?: Record<string, RecorderStatus>
  onHistory?: (cameraId: string) => void
}

export default function LiveGrid({ status = {}, onHistory }: LiveGridProps) {
  const { cameras, error, loading } = useCameras()

  if (loading) return <p className="p-4 text-neutral-500 dark:text-neutral-400">Loading cameras…</p>
  if (error) return <p className="p-4 text-red-600 dark:text-red-400">{error}</p>
  if (cameras.length === 0) return <p className="p-4 text-neutral-500 dark:text-neutral-400">No cameras configured.</p>

  return (
    <div className="grid grid-cols-1 gap-2 p-2 md:grid-cols-2 md:gap-3 md:p-3">
      {cameras.map((camera) => (
        <CameraTile key={camera.id} camera={camera} status={status[camera.id]} onHistory={onHistory} />
      ))}
    </div>
  )
}
