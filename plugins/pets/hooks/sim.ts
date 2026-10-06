// Per-tick pet behaviour. Pure: no `$`, no clock; randomness comes from a seedable RNG.

import type { Pose } from './sprites'
import { SPRITE_W } from './sprites'

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

/** A source of random numbers in [0, 1). */
export type Rng = { next: () => number }

export type StepContext = {
  /** Band width in columns. */
  width: number
  mode: Mode
  /** Frames available per pose; a missing or zero count is treated as 1. */
  frameCounts: Readonly<Record<Pose, number>>
}

/** One simulation step and one repaint: about 8 frames per second. */
export const TICK_MS = 125
export const HEART_TICKS = 12
export const RUN_SPEED = 1
/** [min, max] of a random duration, in ticks. */
type TickRange = readonly [min: number, max: number]
/** How long a pet sits, in ticks (about 2 to 6 seconds). */
const SIT_TICKS: TickRange = [16, 48]
/** How long a pet walks before reconsidering, in ticks (about 2 to 8 seconds). */
const WALK_TICKS: TickRange = [16, 64]
/** Ticks between frame advances for each pose. */
const FRAME_PERIOD: Record<Pose, number> = { walk: 4, run: 2, sit: 4, sleep: 6 }

/** Chance per tick of turning around on a whim. Rare while running, so it doesn't look frantic. */
const WALK_TURN_CHANCE = 0.015
const RUN_TURN_CHANCE = 0.003
/** Chance, when a walk ends, of sitting down instead of walking on. */
const SIT_CHANCE = 0.4
/** Chance of facing the other way when a new walk starts. */
const REVERSE_ON_WALK_START_CHANCE = 0.3

/** mulberry32: small, fast, seedable. */
export function makeRng(seed: number): Rng {
  let counter = seed >>> 0
  return {
    next() {
      counter = (counter + 0x6d2b79f5) >>> 0
      let mixed = counter
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
    },
  }
}

/** A random number in [min, max). */
function between(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min)
}

function randomTicks(rng: Rng, [min, max]: TickRange): number {
  return Math.round(between(rng, min, max))
}

const reverse = (dir: 1 | -1): 1 | -1 => (dir === 1 ? -1 : 1)

/** The rightmost left-edge a pet can have in a band `width` columns wide. */
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
    poseTicksLeft: pose === 'walk' ? randomTicks(rng, WALK_TICKS) : 0,
    heartTicks: 0,
    speed: between(rng, 0.25, 0.5),
    frameTicks: 0,
  }
}

/** Shows the heart. */
export function pat(pet: PetRuntime): PetRuntime {
  return { ...pet, heartTicks: HEART_TICKS }
}

function enterPose(pet: PetRuntime, pose: Pose, ticks: number): PetRuntime {
  return { ...pet, pose, poseTicksLeft: ticks, frameIndex: 0, frameTicks: 0 }
}

/** One tick of behaviour. Returns the next state; the input is not mutated. */
export function step(previous: PetRuntime, context: StepContext, rng: Rng): PetRuntime {
  let pet: PetRuntime = { ...previous, heartTicks: Math.max(0, previous.heartTicks - 1) }

  // The mode decides what the pose may be.
  if (context.mode === 'sleeping') {
    if (pet.pose !== 'sleep') pet = enterPose(pet, 'sleep', 0)
  } else if (context.mode === 'working') {
    if (pet.pose !== 'run') pet = enterPose(pet, 'run', 0)
  } else if (pet.pose === 'sleep' || pet.pose === 'run') {
    pet = enterPose(pet, 'walk', randomTicks(rng, WALK_TICKS))
  }

  const rightLimit = maxX(context.width)

  if (pet.pose === 'walk' || pet.pose === 'run') {
    const speed = pet.pose === 'run' ? RUN_SPEED : pet.speed
    let x = pet.x + pet.dir * speed
    let dir = pet.dir
    if (x <= 0) {
      x = 0
      dir = 1
    } else if (x >= rightLimit) {
      x = rightLimit
      dir = -1
    }
    pet = { ...pet, x, dir }
    if (rng.next() < (pet.pose === 'run' ? RUN_TURN_CHANCE : WALK_TURN_CHANCE)) pet = { ...pet, dir: reverse(pet.dir) }
  } else {
    // Standing still, but a resize may have left the pet outside the band.
    pet = { ...pet, x: Math.min(Math.max(0, pet.x), rightLimit) }
  }

  // Idle wandering: sit now and then, walk on afterwards.
  if (context.mode === 'idle') {
    if (pet.poseTicksLeft > 0) pet = { ...pet, poseTicksLeft: pet.poseTicksLeft - 1 }
    if (pet.poseTicksLeft === 0) {
      pet =
        pet.pose === 'walk' && rng.next() < SIT_CHANCE
          ? enterPose(pet, 'sit', randomTicks(rng, SIT_TICKS))
          : enterPose(pet, 'walk', randomTicks(rng, WALK_TICKS))
      if (pet.pose === 'walk' && rng.next() < REVERSE_ON_WALK_START_CHANCE) pet = { ...pet, dir: reverse(pet.dir) }
    }
  }

  // Advance the animation frame.
  const frameCount = Math.max(1, context.frameCounts[pet.pose] || 1)
  let frameTicks = pet.frameTicks + 1
  let frameIndex = pet.frameIndex
  if (frameTicks >= FRAME_PERIOD[pet.pose]) {
    frameTicks = 0
    frameIndex += 1
  }
  return { ...pet, frameTicks, frameIndex: frameIndex % frameCount }
}
