// Per-tick pet behaviour. Pure: no `$`, no clock; randomness comes from a seedable RNG.
import { SPRITE_W } from './sprites'
import type { Pose } from './sprites'

export type Mode = 'working' | 'idle' | 'sleeping'

export type PetRuntime = {
  /** Left edge, in (float) columns. */
  x: number
  /** 1 = walking right, -1 = walking left. */
  dir: 1 | -1
  pose: Pose
  frameIndex: number
  /** Ticks until this pose is reconsidered (0 while running or sleeping: mode decides). */
  poseTicksLeft: number
  /** Ticks left to show the heart overlay. */
  heartTicks: number
  /** Cells per tick while walking (0.25 to 0.5). */
  speed: number
  /** Ticks since the last frame advance. */
  frameTicks: number
}

export type Rng = { next: () => number }

export type StepContext = {
  /** Band width in columns. */
  width: number
  mode: Mode
  /** Frames available per pose; a missing or zero count is treated as 1. */
  frameCounts: Readonly<Record<Pose, number>>
}

export const TICK_MS = 125
export const HEART_TICKS = 12
export const RUN_SPEED = 1
/** How long a pet sits, in ticks (about 2 to 6 seconds). */
const SIT_TICKS: [number, number] = [16, 48]
/** How long a pet walks before reconsidering, in ticks (about 2 to 8 seconds). */
const WALK_TICKS: [number, number] = [16, 64]
/** Ticks between frame advances for each pose. */
const FRAME_PERIOD: Record<Pose, number> = { walk: 2, run: 1, sit: 4, sleep: 6 }

/** mulberry32: small, fast, seedable. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

function between(rng: Rng, lo: number, hi: number): number {
  return lo + rng.next() * (hi - lo)
}

function ticksBetween(rng: Rng, [lo, hi]: [number, number]): number {
  return Math.round(between(rng, lo, hi))
}

export function maxX(width: number): number {
  return Math.max(0, width - SPRITE_W)
}

/** A new pet at a random column, facing a random way, in a pose that fits the mode. */
export function spawn(rng: Rng, width: number, mode: Mode = 'idle'): PetRuntime {
  const pose: Pose = mode === 'working' ? 'run' : mode === 'sleeping' ? 'sleep' : 'walk'
  return {
    x: Math.round(between(rng, 0, maxX(width))),
    dir: rng.next() < 0.5 ? 1 : -1,
    pose,
    frameIndex: 0,
    poseTicksLeft: pose === 'walk' ? ticksBetween(rng, WALK_TICKS) : 0,
    heartTicks: 0,
    speed: between(rng, 0.25, 0.5),
    frameTicks: 0,
  }
}

/** Shows the heart. */
export function pat(state: PetRuntime): PetRuntime {
  return { ...state, heartTicks: HEART_TICKS }
}

function enterPose(s: PetRuntime, pose: Pose, ticks: number): PetRuntime {
  return { ...s, pose, poseTicksLeft: ticks, frameIndex: 0, frameTicks: 0 }
}

/** One tick of behaviour. Returns the next state; the input is not mutated. */
export function step(state: PetRuntime, ctx: StepContext, rng: Rng): PetRuntime {
  let s: PetRuntime = { ...state, heartTicks: Math.max(0, state.heartTicks - 1) }

  // The mode decides what the pose may be.
  if (ctx.mode === 'sleeping') {
    if (s.pose !== 'sleep') s = enterPose(s, 'sleep', 0)
  } else if (ctx.mode === 'working') {
    if (s.pose !== 'run') s = enterPose(s, 'run', 0)
  } else if (s.pose === 'sleep' || s.pose === 'run') {
    s = enterPose(s, 'walk', ticksBetween(rng, WALK_TICKS))
  }

  const limit = maxX(ctx.width)

  if (s.pose === 'walk' || s.pose === 'run') {
    const speed = s.pose === 'run' ? RUN_SPEED : s.speed
    let x = s.x + s.dir * speed
    let dir = s.dir
    if (x <= 0) {
      x = 0
      dir = 1
    } else if (x >= limit) {
      x = limit
      dir = -1
    }
    s = { ...s, x, dir }
    // Occasionally turn around on a whim.
    if (rng.next() < (s.pose === 'run' ? 0.01 : 0.015)) s = { ...s, dir: s.dir === 1 ? -1 : 1 }
  } else {
    s = { ...s, x: Math.min(Math.max(0, s.x), limit) }
  }

  // Idle wandering: sit now and then, walk on afterwards.
  if (ctx.mode === 'idle') {
    if (s.poseTicksLeft > 0) s = { ...s, poseTicksLeft: s.poseTicksLeft - 1 }
    if (s.poseTicksLeft === 0) {
      s =
        s.pose === 'walk' && rng.next() < 0.4
          ? enterPose(s, 'sit', ticksBetween(rng, SIT_TICKS))
          : enterPose(s, 'walk', ticksBetween(rng, WALK_TICKS))
      if (s.pose === 'walk' && rng.next() < 0.3) s = { ...s, dir: s.dir === 1 ? -1 : 1 }
    }
  }

  // Advance the animation frame.
  const count = Math.max(1, ctx.frameCounts[s.pose] || 1)
  let frameTicks = s.frameTicks + 1
  let frameIndex = s.frameIndex
  if (frameTicks >= FRAME_PERIOD[s.pose]) {
    frameTicks = 0
    frameIndex += 1
  }
  return { ...s, frameTicks, frameIndex: frameIndex % count }
}
