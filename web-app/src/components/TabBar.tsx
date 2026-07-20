export type View = "live" | "timeline"

interface TabBarProps {
  view: View
  onChange: (view: View) => void
}

const TABS: { id: View; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "timeline", label: "Timeline" },
]

export default function TabBar({ view, onChange }: TabBarProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-neutral-800 bg-neutral-900 pb-[env(safe-area-inset-bottom)] md:static md:border-b md:border-t-0 md:pb-0"
      aria-label="Main navigation"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          aria-current={view === tab.id ? "page" : undefined}
          className={`flex-1 py-3 text-sm font-medium md:flex-none md:px-6 ${
            view === tab.id ? "text-white" : "text-neutral-500"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
