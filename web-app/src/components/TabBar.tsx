import ThemeSwitcher from "./ThemeSwitcher"

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
      className="fixed inset-x-0 bottom-0 z-10 flex items-stretch border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] md:static md:border-b md:border-t-0 md:pb-0 dark:border-neutral-800 dark:bg-neutral-900"
      aria-label="Main navigation"
    >
      <div className="flex min-w-0 flex-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            aria-current={view === tab.id ? "page" : undefined}
            className={`flex-1 py-3 text-sm font-medium md:flex-none md:px-6 ${
              view === tab.id
                ? "text-blue-600 dark:text-blue-400"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex items-center px-1 md:px-2">
        <ThemeSwitcher />
      </div>
    </nav>
  )
}
