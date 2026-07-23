import { useState } from "react"
import LiveGrid from "./components/LiveGrid"
import TabBar, { type View } from "./components/TabBar"
import { useRecorderStatus } from "./hooks/useRecorderStatus"
import { useTheme } from "./hooks/useTheme"

export default function App() {
  const [view, setView] = useState<View>("live")
  const recorderStatus = useRecorderStatus()
  useTheme()

  return (
    <div className="flex h-full flex-col-reverse bg-neutral-50 md:flex-col dark:bg-neutral-950">
      <TabBar view={view} onChange={setView} />
      <main className="flex-1 overflow-y-auto pb-14 md:pb-0">
        {view === "live" ? (
          <LiveGrid status={recorderStatus} />
        ) : (
          <p className="p-4 text-neutral-500 dark:text-neutral-400">Timeline arrives in Phase 3</p>
        )}
      </main>
    </div>
  )
}
