import { describe, expect, it } from "vitest"
import type { AppConfig } from "../config"
import { renderClientCameras, renderGo2rtc } from "../render"

const CFG: AppConfig = {
  webrtcCandidate: "${HOST_IP}:8555",
  cameras: [
    { id: "cam1", name: "Front Door", url: "${CAM1_RTSP_URL}", enabled: true, retentionDays: 7 },
    { id: "cam2", name: "Garage", url: "${CAM2_RTSP_URL}", enabled: false, retentionDays: 7 },
  ],
}

describe("renderGo2rtc", () => {
  it("renders streams for enabled cameras only, with env placeholders intact", () => {
    const out = renderGo2rtc(CFG)
    expect(out).toContain("cam1:")
    expect(out).toContain("${CAM1_RTSP_URL}#backchannel=0")
    expect(out).not.toContain("cam2:")
    expect(out).toContain('listen: ":1984"')   // api
    expect(out).toContain('listen: ":8554"')   // rtsp restream
    expect(out).toContain('listen: ":8555"')   // webrtc
    expect(out).toContain("${HOST_IP}:8555")   // candidate
    expect(out).toContain("preload:")
    expect(out).toContain("cam1:")
    expect(out).not.toContain("cam2:")         // disabled camera not preloaded
    expect(out).toMatch(/^# GENERATED/)
  })
})

describe("renderClientCameras", () => {
  it("emits id and name only (no urls) for enabled cameras", () => {
    const list = JSON.parse(renderClientCameras(CFG)) as unknown[]
    expect(list).toEqual([{ id: "cam1", name: "Front Door" }])
  })
})
