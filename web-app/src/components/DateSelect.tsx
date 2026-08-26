import { daysBack, localIsoDay } from "../lib/timeline"

interface DateSelectProps {
  value: string
  retentionDays: number
  onChange: (day: string) => void
}

export default function DateSelect({ value, retentionDays, onChange }: DateSelectProps) {
  const today = localIsoDay()
  const days = daysBack(today, retentionDays)

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">Date</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        aria-label="Date"
      >
        {days.map((day) => (
          <option key={day} value={day}>
            {day}
            {day === today ? " (today)" : ""}
          </option>
        ))}
      </select>
    </label>
  )
}
