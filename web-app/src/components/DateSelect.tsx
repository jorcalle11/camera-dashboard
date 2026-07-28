import { daysAround, addDays } from "../lib/timeline"

interface DateSelectProps {
  value: string
  retentionDays: number
  onChange: (day: string) => void
  radius?: number
}

export default function DateSelect({ value, retentionDays, onChange, radius = 3 }: DateSelectProps) {
  const today = new Date().toISOString().slice(0, 10)
  const days = daysAround(today, radius)

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">Date</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        aria-label="Date"
      >
        {days.map((day) => {
          const enabled = day >= addDays(today, -retentionDays) && day <= today
          return (
            <option key={day} value={day} disabled={!enabled}>
              {day}
              {enabled ? "" : " (expired)"}
            </option>
          )
        })}
      </select>
    </label>
  )
}
