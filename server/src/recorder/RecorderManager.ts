import { EventEmitter } from "node:events"
import type { CameraConfig } from "../config.js"

export type RecorderState = "recording" | "retrying" | "stopped"

export interface CameraStatus {
  state: RecorderState
  restarts: number
  restartedAt: number | null
}

export interface RecorderStatusEvent {
  cameraId: string
  state: RecorderState
  restarts: number
  restartedAt: number | null
}

export interface RecorderManagerOptions {
  spawnFfmpeg: (cameraId: string, outputDir: string) => { process: import("node:child_process").ChildProcess; logPath: string }
  outputRoot: string
  baseBackoffMs?: number
  maxBackoffMs?: number
}

interface ManagedCamera {
  config: CameraConfig
  status: CameraStatus
  process: import("node:child_process").ChildProcess | null
  backoffMs: number
  backoffTimer: NodeJS.Timeout | null
}

export class RecorderManager extends EventEmitter {
  private cameras = new Map<string, ManagedCamera>()
  private spawnFfmpeg: RecorderManagerOptions["spawnFfmpeg"]
  private outputRoot: string
  private baseBackoffMs: number
  private maxBackoffMs: number

  constructor(opts: RecorderManagerOptions) {
    super()
    this.spawnFfmpeg = opts.spawnFfmpeg
    this.outputRoot = opts.outputRoot
    this.baseBackoffMs = opts.baseBackoffMs ?? 1000
    this.maxBackoffMs = opts.maxBackoffMs ?? 60000
  }

  start(camera: CameraConfig): void {
    if (!camera.enabled) return
    this.stop(camera.id)
    const managed: ManagedCamera = {
      config: camera,
      status: { state: "recording", restarts: 0, restartedAt: null },
      process: null,
      backoffMs: this.baseBackoffMs,
      backoffTimer: null,
    }
    this.cameras.set(camera.id, managed)
    this.spawn(managed)
  }

  stop(cameraId: string): void {
    const managed = this.cameras.get(cameraId)
    if (!managed) return
    this.clearBackoff(managed)
    managed.status.state = "stopped"
    if (managed.process && !managed.process.killed) {
      managed.process.kill("SIGTERM")
    }
    managed.process = null
    this.emitStatus(managed)
  }

  stopAll(): void {
    for (const id of this.cameras.keys()) this.stop(id)
  }

  status(): Record<string, CameraStatus> {
    const out: Record<string, CameraStatus> = {}
    for (const [id, managed] of this.cameras) {
      out[id] = { ...managed.status }
    }
    return out
  }

  private spawn(managed: ManagedCamera): void {
    const outputDir = `${this.outputRoot}/${managed.config.id}`
    const { process } = this.spawnFfmpeg(managed.config.id, outputDir)
    managed.process = process
    managed.status.state = "recording"
    managed.status.restartedAt = Date.now()
    this.emitStatus(managed)

    process.on("exit", () => {
      if (managed.status.state === "stopped") return
      managed.status.restarts += 1
      managed.status.state = "retrying"
      this.emitStatus(managed)
      this.scheduleRetry(managed)
    })
  }

  private scheduleRetry(managed: ManagedCamera): void {
    this.clearBackoff(managed)
    managed.backoffTimer = setTimeout(() => {
      managed.backoffTimer = null
      this.spawn(managed)
      managed.backoffMs = Math.min(managed.backoffMs * 2, this.maxBackoffMs)
    }, managed.backoffMs)
  }

  private clearBackoff(managed: ManagedCamera): void {
    if (managed.backoffTimer) {
      clearTimeout(managed.backoffTimer)
      managed.backoffTimer = null
    }
  }

  private emitStatus(managed: ManagedCamera): void {
    const evt: RecorderStatusEvent = {
      cameraId: managed.config.id,
      state: managed.status.state,
      restarts: managed.status.restarts,
      restartedAt: managed.status.restartedAt,
    }
    this.emit("status", evt)
  }
}
