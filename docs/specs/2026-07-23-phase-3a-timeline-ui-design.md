# Phase 3a — Timeline UI (mock) Design

Date: 2026-07-23  
Status: approved  
Parent: `docs/specs/2026-07-16-core-nvr-design.md` (Phase 3)

## 1. Goal & scope

Ship a **scrub-first Timeline UI** so layout, navigation, and playback controls can be polished **without new backend work**.

**In scope**
- Timeline page (mobile-first, desktop usable)
- Entry from Timeline tab and from live tile **History**
- Camera header dropdown; date dropdown
- Mock fixture video + mock 24h coverage strip
- Play / pause, ±10s, speed (1x/2x/4x), fullscreen
- Pointer scrub + wheel/pinch zoom on the strip
- **Theme switcher:** light / dark / system (app-wide, including Live)

**Out of scope (later Phase 3b+)**
- `recordings/summary` and HLS VOD endpoints
- Real segment chaining / MP4 stitching
- Retention job, disk safety valve
- nginx prod config / Linux deploy
- Snapshot-from-recording (button may show toast “coming soon”)
- Motion/events list (Phase 4)

**Success criteria**
- User can open Timeline from tab or from a camera’s History control
- User can switch camera and day via dropdowns
- Strip shows fixture coverage; drag moves playhead; zoom works on desktop (wheel) and touch (pinch)
- Player plays the fixture clip with transport controls
- Live grid still works; no server API changes required
- Theme persists across reloads; system mode follows OS preference

## 2. Decisions

| Topic | Decision |
|---|---|
| Layout | **B — Scrub-first** (tall primary strip; strip is the hero) |
| Entry | **Tab + History** on live tile/fullscreen → `/timeline/:cameraId` |
| Camera picker | Header **dropdown** (not chips) |
| Date picker | **Dropdown** (not day-chip row) — matches scrub-first mock |
| Data | **Full mock** fixtures under `web-app/public/fixtures/` |
| Playback | HTML5 `<video>` + fixture MP4 (no hls.js yet) |
| Routing | Client-side view state or lightweight path handling; URL shape `/timeline/:cameraId` |
| Theme | **light \| dark \| system**; default **system**; persist `localStorage` key `theme` |
| Theme control | Compact control on **TabBar** (desktop top bar / mobile bottom or overflow) — cycles or menu: Light / Dark / System |

## 3. Navigation & routes

```
/                  → Live grid (existing)
/timeline          → Timeline; camera = last used or first enabled camera
/timeline/:id      → Timeline for that camera
```

**Entry paths**
1. **Timeline tab** — switches view; keeps last `cameraId` in session (memory or `sessionStorage`); default first camera from `useCameras()`.
2. **History** control on live `CameraTile` / fullscreen overlay — sets `cameraId` to that tile and opens Timeline.

**Back**
- Header control returns to Live (same as tab Live), or uses browser back if path-based routing is used.

## 4. UI structure (scrub-first)

```
TimelinePage
├─ Header
│   ├─ Back to Live
│   ├─ CameraSelect (dropdown)     → updates :cameraId
│   └─ DateSelect (dropdown)       → selected calendar day (fixture day enabled)
├─ PlaybackPlayer
│   ├─ <video> fixture source
│   ├─ optional mini progress on video edge (nice-to-have)
│   └─ timestamp badge (playhead clock time for selected day)
├─ TransportBar (below player on phone)
│   ├─ −10s / play-pause / +10s
│   ├─ speed 1x|2x|4x
│   └─ fullscreen
├─ TimelineStrip (primary, tall ≥56px hit area; visual bar ≥44px)
│   ├─ 24h coverage from fixture
│   ├─ playhead
│   └─ hour labels / ticks
└─ TabBar (existing Live | Timeline)
```

**Desktop:** same stack; wider player; wheel-zoom on strip; hover shows time tooltip near pointer.

**Visual language:** theme tokens (see §5); primary play control uses accent blue (`#3b82f6`); coverage bars green; playhead high-contrast (white in dark, near-black in light, or amber in both).

## 5. Theming (light / dark / system)

App-wide chrome (Live + Timeline + TabBar + toasts). Video tiles stay visually dark (black letterbox) in both themes so streams remain the focus.

### Modes

| Preference | Resolved appearance |
|---|---|
| `light` | Light surfaces always |
| `dark` | Dark surfaces always |
| `system` (default) | Follows `prefers-color-scheme`; updates live when OS changes |

### Implementation

- Tailwind v4 **class strategy**: toggle `class="dark"` on `<html>` when resolved theme is dark.
- `useTheme()` hook:
  - reads/writes `localStorage.theme` (`"light" | "dark" | "system"`)
  - resolves effective theme via `matchMedia("(prefers-color-scheme: dark)")`
  - subscribes to `change` on that media query when preference is `system`
  - applies/removes `dark` on `document.documentElement`
- FOUC: tiny inline script in `index.html` (before paint) reads `localStorage` + system preference and sets `dark` class early.
- No new dependencies.

### Tokens (semantic utilities)

Replace hard-coded `bg-neutral-900` / `text-white` shell classes with theme-aware pairs, e.g.:

| Role | Light | Dark (`dark:`) |
|---|---|---|
| App background | `bg-neutral-50` | `bg-neutral-950` |
| Surface (tab bar, cards) | `bg-white` | `bg-neutral-900` |
| Border | `border-neutral-200` | `border-neutral-800` |
| Primary text | `text-neutral-900` | `text-neutral-50` |
| Muted text | `text-neutral-500` | `text-neutral-400` |
| Accent (play, selected tab) | `text-blue-600` / `bg-blue-600` | same or slightly brighter |
| Danger / REC | `red-500` | `red-500` |

Live video overlays (name badge, History) keep translucent dark scrims on top of video so they stay readable in both themes.

### ThemeSwitcher UI

- Component: `ThemeSwitcher`
- Placement: **TabBar** trailing control (desktop: right of tabs; mobile: icon beside tabs or in a small overflow so tab hit targets stay ≥44px)
- Interaction: button opens a short menu (Light / Dark / System) with checkmark on current preference; or three-way cycle icon (sun → moon → system) with `aria-label` reflecting next/current mode
- Prefer **menu** for clarity of “System”
- Icons: sun / moon / monitor (inline SVG, no icon pack required)

### Files

| File | Role |
|---|---|
| `web-app/src/hooks/useTheme.ts` | preference state, resolve, persist, DOM class |
| `web-app/src/components/ThemeSwitcher.tsx` | menu control |
| `web-app/src/index.css` / `index.html` | base body colors; FOUC script |
| Shell components | swap to light/`dark:` pairs (`App`, `TabBar`, `LiveGrid` empty states, toasts) |

### Testing

- `useTheme`: system follows mocked `matchMedia`; light/dark force class; localStorage round-trip
- `ThemeSwitcher`: selects each mode and calls setter
- Manual: OS theme flip while on System; reload retains preference

## 6. Fixtures

```
web-app/public/fixtures/
  sample.mp4                 # short clip used for all cameras in mock
  timeline-coverage.json     # 24h coverage for the fixture day
```

**`timeline-coverage.json` shape**

```json
{
  "day": "2026-07-23",
  "cameras": {
    "cam1": {
      "ranges": [
        { "startMsOfDay": 0, "endMsOfDay": 3600000 },
        { "startMsOfDay": 7200000, "endMsOfDay": 14400000 }
      ]
    },
    "cam2": {
      "ranges": [
        { "startMsOfDay": 1800000, "endMsOfDay": 9000000 }
      ]
    }
  }
}
```

- `startMsOfDay` / `endMsOfDay`: milliseconds from local midnight of `day`.
- Date dropdown: only `day` is selectable as “has footage”; other days in the pager window are disabled/greyed.
- All cameras may reuse `sample.mp4`; coverage may differ per camera id for richer UI testing.
- Missing camera id in JSON → empty strip (no crash).

## 7. Interaction model

### Playhead & strip
- Playhead position = selected time-of-day on the chosen date (0–24h).
- **Drag** on strip moves playhead (pointer events).
- **Wheel** (desktop): zoom time window centered on pointer or playhead; clamp min ~15 min window, max 24h.
- **Pinch** (touch): same zoom model.
- Click/tap on strip jumps playhead.
- Hover (desktop): tooltip with `HH:mm:ss`.

### Player (mock coupling)
- Fixture video does **not** need to match 24h length.
- Transport controls operate on the `<video>` element (currentTime, playbackRate).
- Scrubbing the strip updates the **displayed clock** and may seek video to a mapped fraction of its duration for feel (e.g. linear map playhead 0–24h → video 0–duration), or leave video independent and only update the clock label. Prefer **mapped seek** so scrub feels connected.
- When video `ended`, pause (no auto-advance segments in mock).

### Camera / date
- Changing camera: reload coverage for that id; reset playhead optional (keep time-of-day).
- Changing date: only fixture day has ranges; empty strip otherwise.

## 8. Component & file plan

| File | Role |
|---|---|
| `web-app/src/App.tsx` | Route/view: live vs timeline; pass cameraId; mount theme provider/hook |
| `web-app/src/components/TimelinePage.tsx` | Page composition |
| `web-app/src/components/PlaybackPlayer.tsx` | video + chrome timestamp |
| `web-app/src/components/TransportBar.tsx` | −10 / play / +10 / speed / fullscreen |
| `web-app/src/components/TimelineStrip.tsx` | canvas or DOM strip; pointer/zoom |
| `web-app/src/components/CameraSelect.tsx` | header dropdown |
| `web-app/src/components/DateSelect.tsx` | day dropdown |
| `web-app/src/hooks/useTimelineFixtures.ts` | load coverage JSON + fixture video URL |
| `web-app/src/hooks/useTheme.ts` | light/dark/system preference + DOM class |
| `web-app/src/components/ThemeSwitcher.tsx` | TabBar theme menu |
| `web-app/src/components/TileOverlay.tsx` (modify) | add History control |
| `web-app/src/components/TabBar.tsx` | Timeline tab + ThemeSwitcher |
| `web-app/public/fixtures/*` | assets |
| `web-app/index.html` | FOUC theme boot script |

Prefer canvas for strip performance if painting many ranges; DOM+CSS is acceptable for mock density.

## 9. State

Local React state (or small context) on TimelinePage:

```ts
type TimelineState = {
  cameraId: string
  day: string              // YYYY-MM-DD
  playheadMsOfDay: number  // 0 .. 86_400_000
  playing: boolean
  speed: 1 | 2 | 4
  zoom: { startMs: number; endMs: number }  // visible window within day
}

type ThemePreference = "light" | "dark" | "system"
// persisted separately in localStorage key "theme"
```

- Persist `cameraId` (and optionally `day`) in `sessionStorage` key `timeline.cameraId` for tab re-entry.
- Live grid continues to use existing `useCameras` + `useRecorderStatus`.

## 10. Testing

- **Unit/component (vitest + testing-library):**
  - `TimelineStrip`: pointer drag updates playhead callback; click jumps; zoom clamps.
  - `TransportBar`: speed cycles; ±10s calls into player mocks.
  - `CameraSelect` / `DateSelect`: change handlers fire with ids/dates.
  - History control: invokes navigation with camera id.
  - `useTheme` / `ThemeSwitcher`: light/dark/system + localStorage + `dark` class on `<html>`.
- **Manual:** phone Safari + desktop Chrome — tab switch, History entry, scrub, zoom, fullscreen, theme modes + OS flip on System.

## 11. Explicit non-goals for this pass

Do not add server routes, change Express static paths, or depend on SQLite segment rows. When Phase 3b lands, replace `useTimelineFixtures` with API hooks and swap `<video src=fixture>` for HLS/native segment playback without rewriting the shell layout.

## 12. Follow-ups (Phase 3b+)

1. `GET /api/cameras/:id/recordings/summary` (hour buckets)
2. HLS VOD playlist + hls.js (or native multi-MP4 chain)
3. Wire strip + player to real data
4. Retention + disk safety valve
5. nginx prod entry
