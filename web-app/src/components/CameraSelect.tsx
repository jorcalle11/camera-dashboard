import type { Camera } from "../types"

interface CameraSelectProps {
  cameras: Camera[]
  value: string
  onChange: (cameraId: string) => void
}

export default function CameraSelect({ cameras, value, onChange }: CameraSelectProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">Camera</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[10rem] cursor-pointer rounded-lg border border-neutral-200 bg-white px-2 py-1.5 font-medium text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        aria-label="Camera"
      >
        {cameras.map((camera) => (
          <option key={camera.id} value={camera.id}>
            {camera.name}
          </option>
        ))}
      </select>
    </label>
  )
}
