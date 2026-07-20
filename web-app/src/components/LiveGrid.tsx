import { useCameras } from "../hooks/useCameras"
import CameraTile from "./CameraTile"

export default function LiveGrid() {
  const { cameras, error, loading } = useCameras()

  if (loading) return <p className="p-4 text-neutral-400">Loading cameras…</p>
  if (error) return <p className="p-4 text-red-400">{error}</p>
  if (cameras.length === 0) return <p className="p-4 text-neutral-400">No cameras configured.</p>

  return (
    <div className="grid grid-cols-1 gap-2 p-2 md:grid-cols-[repeat(auto-fit,minmax(400px,1fr))] md:gap-3 md:p-3">
      {cameras.map((camera) => (
        <CameraTile key={camera.id} camera={camera} />
      ))}
    </div>
  )
}
