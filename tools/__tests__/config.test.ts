import { describe, expect, it } from "vitest"
import { loadConfig } from "../config"

const VALID = `
webrtc_candidate: \${HOST_IP}:8555
cameras:
  - id: cam1
    name: Front Door
    url: \${CAM1_RTSP_URL}
    enabled: true
    retention_days: 7
`

describe("loadConfig", () => {
  it("parses a valid config", () => {
    const cfg = loadConfig(VALID)
    expect(cfg.webrtcCandidate).toBe("${HOST_IP}:8555")
    expect(cfg.cameras).toEqual([
      {
        id: "cam1",
        name: "Front Door",
        url: "${CAM1_RTSP_URL}",
        enabled: true,
        retentionDays: 7,
      },
    ])
  })

  it("rejects duplicate camera ids", () => {
    const dup = VALID + `
  - id: cam1
    name: Copy
    url: \${CAM2_RTSP_URL}
    enabled: true
    retention_days: 7
`
    expect(() => loadConfig(dup)).toThrow(/duplicate camera id/i)
  })

  it("rejects ids that are not slugs", () => {
    expect(() => loadConfig(VALID.replace("cam1", "Cam 1!"))).toThrow(/id/i)
  })

  it("rejects a config with no cameras", () => {
    expect(() => loadConfig("webrtc_candidate: x\ncameras: []")).toThrow(/at least one camera/i)
  })

  it("rejects missing url", () => {
    expect(() => loadConfig(VALID.replace(/^\s*url:.*$/m, ""))).toThrow(/url/i)
  })
})
