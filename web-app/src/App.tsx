import { useState } from "react"
import LiveGrid from "./components/LiveGrid"
import TabBar, { type View } from "./components/TabBar"
import { useRecorderStatus } from "./hooks/useRecorderStatus"

export default function App() {
  const [view, setView] = useState<View>("live")
  const recorderStatus = useRecorderStatus()

  return (
    <div className="flex h-full flex-col-reverse md:flex-col">
      <TabBar view={view} onChange={setView} />
      <main className="flex-1 overflow-y-auto pb-14 md:pb-0">
        {view === "live" ? (
          <LiveGrid status={recorderStatus} />
        ) : (
          <p className="p-4 text-neutral-400">Timeline arrives in Phase 3</p>
        )}
      </main>
    </div>
  )
}
