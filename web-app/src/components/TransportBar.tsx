export type PlaybackSpeed = 1 | 2 | 4

interface TransportBarProps {
  playing: boolean
  speed: PlaybackSpeed
  onTogglePlay: () => void
  onSkip: (deltaSec: number) => void
  onCycleSpeed: () => void
  onFullscreen: () => void
}

export default function TransportBar({
  playing,
  speed,
  onTogglePlay,
  onSkip,
  onCycleSpeed,
  onFullscreen,
}: TransportBarProps) {
  return (
    <div className="flex items-center justify-center gap-3 px-3 py-3 sm:gap-5">
      <button
        type="button"
        onClick={onCycleSpeed}
        className="min-w-11 rounded-md border border-neutral-200 px-2 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
        aria-label={`Playback speed ${speed}x`}
      >
        {speed}x
      </button>
      <button
        type="button"
        onClick={() => onSkip(-10)}
        className="min-h-11 min-w-11 rounded-md text-sm text-neutral-600 dark:text-neutral-300"
        aria-label="Back 10 seconds"
      >
        −10
      </button>
      <button
        type="button"
        onClick={onTogglePlay}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow hover:bg-blue-500"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={() => onSkip(10)}
        className="min-h-11 min-w-11 rounded-md text-sm text-neutral-600 dark:text-neutral-300"
        aria-label="Forward 10 seconds"
      >
        +10
      </button>
      <button
        type="button"
        onClick={onFullscreen}
        className="min-h-11 min-w-11 rounded-md text-neutral-600 dark:text-neutral-300"
        aria-label="Fullscreen"
      >
        <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      </button>
    </div>
  )
}
