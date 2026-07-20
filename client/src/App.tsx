import { useState } from "react"
import TabBar, { type View } from "./components/TabBar"

export default function App() {
  const [view, setView] = useState<View>("live")

  return (
    <div className="flex h-full flex-col-reverse md:flex-col">
      <TabBar view={view} onChange={setView} />
      <main className="flex-1 overflow-y-auto pb-14 md:pb-0">
        {view === "live" ? (
          <p className="p-4 text-neutral-400">Live grid goes here (Task 7)</p>
        ) : (
          <p className="p-4 text-neutral-400">Timeline arrives in Phase 3</p>
        )}
      </main>
    </div>
  )
}
