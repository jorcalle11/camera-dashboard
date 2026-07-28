# Phase 3b — Timeline Real Data Design

Date: 2026-07-28
Status: approved design
Parent spec: `docs/specs/2026-07-16-core-nvr-design.md` (Phase 3)
Phase 3a spec: `docs/specs/2026-07-23-phase-3a-timeline-ui-design.md`

## 1. Goal

Replace Phase 3a's mock fixtures with real data from the recording pipeline. The timeline strip shows actual coverage from indexed MP4 segments, the video player plays real footage via HLS, and a retention job enforces disk limits.

## 2. In scope

1. `GET /api/cameras/:id/recordings/summary` — hour-bucketed coverage for the timeline strip
2. `GET /api/recordings/:camera/start/:ts/end/:ts/index.m3u8` — on-the-fly HLS VOD playlist
3. `RetentionJob` — hourly sweep with per-camera size limit + global free space safety valve
4. Client wiring — replace mock hooks with real API calls, integrate hls.js
5. Remove mock fixture files

## 3. Out of scope

- nginx production configuration (deferred to deploy phase)
- Motion/event detection (Phase 4)
- Camera settings (Phase 5)
- Authentication
- Real ffprobe in `probeSegment()` (hardcoded 60s duration is acceptable for now; the indexer's `duration_ms` will be used for summary math)

## 4. Server design

### 4.1 Summary endpoint

**Route:** `GET /api/cameras/:id/recordings/summary`

**Query parameters:**
- `day` (required) — ISO date string, e.g. `2026-07-23`

**Response:**
```json
{
  "cameraId": "cam1",
  "day": "2026-07-23",
  "hours": [
    { "hour": 0, "coverageMs": 3600000, "segmentCount": 60 },
    { "hour": 1, "coverageMs": 3540000, "segmentCount": 59 }
  ]
}
```

**SQL:**
```sql
SELECT
  CAST((start_ts - :dayStartMs) / 3600000 AS INTEGER) AS hour,
  SUM(
    MIN(start_ts + duration_ms, :dayStartMs + (hour + 1) * 3600000)
    - MAX(start_ts, :dayStartMs + hour * 3600000)
  ) AS coverageMs,
  COUNT(*) AS segmentCount
FROM segments
WHERE camera_id = :cameraId
  AND start_ts + duration_ms > :dayStartMs
  AND start_ts < :dayEndMs
GROUP BY hour
ORDER BY hour
```

All timestamps are unix milliseconds. `:dayStartMs` is midnight UTC of the requested day; `:dayEndMs` is midnight UTC of the next day.

**Implementation:** Add a `/summary` sub-route to the existing `server/src/routes/recordings.ts` router. The router already uses `mergeParams: true` to access `:id`.

### 4.2 VOD endpoint

**Route:** `GET /api/recordings/:camera/start/:ts/end/:ts/index.m3u8`

**Parameters:**
- `:camera` — camera ID
- `:start` — unix timestamp in **seconds** (start of playback window)
- `:end` — unix timestamp in **seconds** (end of playback window)

**Note:** Segments in the database use milliseconds. The handler converts `:start` and `:end` to milliseconds (`* 1000`) for the SQL query.

**Response:** HLS m3u8 playlist (Content-Type: `application/vnd.apple.mpegurl`)

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:60
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:60.0,
/api/statics/recordings/cam1/2026-07-23/15-00-00.mp4
#EXTINF:60.0,
/api/statics/recordings/cam1/2026-07-23/15-01-00.mp4
#EXTINF:40.0,
/api/statics/recordings/cam1/2026-07-23/15-02-00.mp4
#EXT-X-ENDLIST
```

**Behavior:**
- Query segments where `start_ts + duration_ms > :start AND start_ts < :end`
- For each segment, compute effective duration within the window:
  - First segment: duration from `:start` to segment end (or full duration if segment starts before `:start`)
  - Last segment: duration from segment start to `:end` (or full duration if segment ends after `:end`)
  - Middle segments: full `duration_ms`
- Generate m3u8 entries pointing to `/api/statics/recordings/{path}`
- `#EXT-X-ENDLIST` signals VOD (not live)
- Return 404 if no segments found

**File:** New `server/src/routes/vod.ts`. Mount in `app.ts` at `/api/recordings/:camera` with `mergeParams: true`.

### 4.3 Retention job

**File:** New `server/src/recorder/RetentionJob.ts`

**Configuration (per camera via `cameras.yml`):**
- `retention_days: 7` (existing) — max age of segments
- `retention_max_size_gb: 50` (new) — max total storage per camera

**Global config (via env):**
- `DISK_FREE_THRESHOLD_GB` (existing, default: 10) — global free space safety valve

**Behavior:**
- Runs hourly via `setInterval`
- Per-camera age check: delete segments where `start_ts < now - retention_days * MS_PER_DAY`
- Per-camera size check: if total `size_bytes` for camera > `retention_max_size_gb * 1024^3`, delete oldest segments until under
- Global disk check: if free space < `DISK_FREE_THRESHOLD_GB`, delete oldest segments across all cameras until above threshold
- Deletion order: delete MP4 file from disk first, then delete DB row
- Prune empty day folders after deletion
- Emit `status` event via WebSocket after cleanup
- Log deletion counts per camera

**Integration:** Instantiate in `index.ts` alongside RecorderManager. Pass `db`, `recordingsRoot`, camera configs, and env vars.

### 4.4 File changes summary

| File | Change |
|------|--------|
| `server/src/routes/recordings.ts` | Add `GET /summary` sub-route |
| `server/src/routes/vod.ts` | New — VOD playlist generation |
| `server/src/app.ts` | Mount VOD router |
| `server/src/recorder/RetentionJob.ts` | New — retention logic |
| `server/src/index.ts` | Instantiate RetentionJob |
| `server/src/env.ts` | Add `DISK_FREE_THRESHOLD_GB` type (already loaded, verify) |
| `server/src/config.ts` | Add `retentionMaxSizeGb` to `CameraConfig` |

## 5. Client design

### 5.1 New dependency

- `hls.js` — added to `web-app/package.json`

### 5.2 New hook: `useRecordingsSummary`

**File:** `web-app/src/hooks/useRecordingsSummary.ts`

```ts
function useRecordingsSummary(cameraId: string, day: string): {
  ranges: TimeRange[]
  loading: boolean
  error: string | null
}
```

- Fetches `GET /api/cameras/${cameraId}/recordings/summary?day=${day}`
- Converts `hours[]` response to `TimeRange[]` (array of `{ startMsOfDay, endMsOfDay }`) for each hour with `coverageMs > 0`
- Re-fetches when `cameraId` or `day` changes

### 5.3 Modify `useCameras`

**File:** `web-app/src/hooks/useCameras.ts`

- Change fetch target from static `/cameras.json` to `GET /api/cameras`
- Response shape matches existing server endpoint (`{ id, name, enabled, liveStreamUrl, recorder }[]`)

### 5.4 Modify `PlaybackPlayer`

**File:** `web-app/src/components/PlaybackPlayer.tsx`

- Accept `src` prop (m3u8 URL or empty string)
- Initialize hls.js on mount, attach to `<video>` ref
- Load source when `src` changes
- Handle hls.js events: `MANIFEST_PARSED` (play), `ERROR` (retry/fallback)
- Destroy hls.js on unmount
- Safari: use native HLS (video canPlay type check) without hls.js
- Expose `seek(seconds)` method for playhead scrubbing

### 5.5 Modify `TimelinePage`

**File:** `web-app/src/components/TimelinePage.tsx`

- Replace `useTimelineFixtures` with `useRecordingsSummary`
- Compute m3u8 URL from playhead position: `GET /api/recordings/${cameraId}/start/${start}/end/${end}/index.m3u8`
  - Window: playhead ±5 minutes (or configurable), clamped to day bounds
- On playhead change: recompute m3u8 URL and load in HLS player
- Remove `fixtureDay` logic
- Update status text to show real coverage info

### 5.6 Modify `DateSelect`

**File:** `web-app/src/components/DateSelect.tsx`

- Accept `retentionDays` prop (from camera config or API)
- Enable days within retention window, disable older days
- Remove `fixtureDay` dependency

### 5.7 Remove mock fixtures

- Delete `web-app/public/fixtures/` directory (sample.mp4, timeline-coverage.json)
- Delete `web-app/src/hooks/useTimelineFixtures.ts` and its test
- Remove fixture-related types from `lib/timeline.ts` (`TimelineCoverageFile`)

### 5.8 Client file changes summary

| File | Change |
|------|--------|
| `web-app/package.json` | Add `hls.js` dependency |
| `web-app/src/hooks/useRecordingsSummary.ts` | New — API hook for summary |
| `web-app/src/hooks/useCameras.ts` | Switch to real API endpoint |
| `web-app/src/components/PlaybackPlayer.tsx` | HLS integration via hls.js |
| `web-app/src/components/TimelinePage.tsx` | Wire to real hooks, compute VOD URLs |
| `web-app/src/components/DateSelect.tsx` | Use retention days instead of fixture day |
| `web-app/src/lib/timeline.ts` | Remove `TimelineCoverageFile` type |
| `web-app/src/hooks/useTimelineFixtures.ts` | Delete |
| `web-app/src/hooks/__tests__/useTimelineFixtures.test.ts` | Delete |
| `web-app/public/fixtures/` | Delete directory |

## 6. Data flow

```
Browser timeline
     │
     ├─ useRecordingsSummary(cam1, "2026-07-23")
     │    └─ GET /api/cameras/cam1/recordings/summary?day=2026-07-23
     │         └─ SQL GROUP BY hour → hours[].coverageMs
     │              └─ TimelineStrip renders green coverage bars
     │
     ├─ User drags playhead → playheadMsOfDay
     │
     └─ hls.js.load(url)
          └─ GET /api/recordings/cam1/start/:start/end/:end/index.m3u8
               └─ SQL segments in range → m3u8 playlist
                    └─ hls.js fetches MP4s from /api/statics/recordings/*
                         └─ <video> plays seamlessly
```

## 7. Error handling

| Failure | Behavior |
|---------|----------|
| Summary endpoint returns no data | Strip renders empty (no green bars), status shows "No footage for this day" |
| VOD endpoint returns 404 | Player shows error overlay, user can try different time range |
| hls.js network error | Retry manifest load (hls.js built-in), show error after 3 retries |
| hls.js fatal error | Destroy and re-initialize hls.js instance |
| Retention job disk check fails | Log warning, skip this cycle, retry next hour |
| Retention deletion fails (file locked) | Log error, skip that segment, continue with others |

## 8. Testing

### Server tests
- **Summary endpoint:** query with fixture segments, verify hour buckets and coverage math
- **VOD endpoint:** verify m3u8 format, segment trimming, 404 on empty range
- **RetentionJob:** mock fs operations, verify deletion order (age, size, disk), verify WebSocket events

### Client tests
- **useRecordingsSummary:** mock fetch, verify conversion from hours[] to TimeRange[]
- **PlaybackPlayer:** mock hls.js, verify load/destroy lifecycle
- **DateSelect:** verify retention-based day enabling

### Manual smoke
- `docker compose up` → real camera footage visible in timeline strip
- Scrub to different times → video plays from correct position
- Wait for retention sweep → old segments deleted
- Fill disk → safety valve triggers

## 9. Migration path from Phase 3a

1. Implement server endpoints first (summary + VOD) — no client changes needed
2. Add RetentionJob — runs in background, no API changes
3. Client changes: swap hooks, add hls.js, update components
4. Remove mock fixtures last (after verifying real data works)

No database migration needed — the existing `segments` table has all required columns.
