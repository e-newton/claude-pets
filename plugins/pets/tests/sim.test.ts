import { expect, test } from 'claude-code/testing'
import type { Mode, PetRuntime } from '../hooks/sim'
import { HEART_TICKS, makeRng, maxX, pat, spawn, step } from '../hooks/sim'
import type { Pose } from '../hooks/sprites'
import { SPRITE_W } from '../hooks/sprites'

const frameCounts: Record<Pose, number> = { walk: 4, run: 4, sit: 2, sleep: 2 }
const WIDTH = 80

/** Steps a pet `ticks` times and returns every state it passed through. */
function run(start: PetRuntime, mode: Mode, ticks: number, seed = 1, width = WIDTH) {
  const rng = makeRng(seed)
  const states: PetRuntime[] = []
  let pet = start
  for (let i = 0; i < ticks; i++) {
    pet = step(pet, { width, mode, frameCounts }, rng)
    states.push(pet)
  }
  return states
}

test('the rng is seedable and in [0, 1)', async () => {
  const a = makeRng(42)
  const b = makeRng(42)
  for (let i = 0; i < 100; i++) {
    const v = a.next()
    expect(v).toBe(b.next())
    expect(v >= 0 && v < 1).toBe(true)
  }
  expect(makeRng(1).next()).not.toBe(makeRng(2).next())
})

test('spawn lands inside the band', async () => {
  const rng = makeRng(7)
  for (let i = 0; i < 200; i++) {
    const pet = spawn(rng, WIDTH)
    expect(pet.x >= 0 && pet.x <= maxX(WIDTH)).toBe(true)
    expect(pet.speed >= 0.25 && pet.speed <= 0.5).toBe(true)
  }
  // A band narrower than a sprite pins the pet to column 0.
  expect(spawn(rng, 5).x).toBe(0)
})

test('x stays clamped and pets turn at both edges', async () => {
  for (const mode of ['idle', 'working'] as const) {
    const states = run(spawn(makeRng(3), WIDTH, mode), mode, 4000, 9)
    expect(states.every(pet => pet.x >= 0 && pet.x <= WIDTH - SPRITE_W)).toBe(true)
    expect(states.some(pet => pet.x === 0)).toBe(true)
    expect(states.some(pet => pet.x === WIDTH - SPRITE_W)).toBe(true)
    expect(states.some(pet => pet.dir === 1)).toBe(true)
    expect(states.some(pet => pet.dir === -1)).toBe(true)
  }
})

test('walking is smooth: at most 0.5 columns per tick', async () => {
  const states = run(spawn(makeRng(5), WIDTH), 'idle', 2000, 11)
  let prev = states[0]!
  for (const pet of states.slice(1)) {
    if (pet.pose === 'walk' && prev.pose === 'walk') expect(Math.abs(pet.x - prev.x) <= 0.5 + 1e-9).toBe(true)
    prev = pet
  }
})

test('idle pets walk and sometimes sit', async () => {
  const states = run(spawn(makeRng(5), WIDTH), 'idle', 3000, 21)
  expect(states.some(pet => pet.pose === 'walk')).toBe(true)
  expect(states.some(pet => pet.pose === 'sit')).toBe(true)
  expect(states.every(pet => pet.pose === 'walk' || pet.pose === 'sit')).toBe(true)
  // Sitting stands still.
  for (let i = 1; i < states.length; i++)
    if (states[i]!.pose === 'sit' && states[i - 1]!.pose === 'sit') expect(states[i]!.x).toBe(states[i - 1]!.x)
})

test('working pets run, about one column per tick', async () => {
  const states = run(spawn(makeRng(5), WIDTH), 'working', 200, 4)
  expect(states.every(pet => pet.pose === 'run')).toBe(true)
  const distances = states.slice(1).map((pet, i) => Math.abs(pet.x - states[i]!.x))
  expect(distances.filter(distance => distance === 1).length > 150).toBe(true)
})

test('sleeping pets sleep in place and wake when the mode ends', async () => {
  const start = spawn(makeRng(5), WIDTH)
  const states = run(start, 'sleeping', 100, 2)
  expect(states.every(pet => pet.pose === 'sleep' && pet.x === start.x)).toBe(true)
  const after = run(states[states.length - 1]!, 'idle', 1, 2)[0]!
  expect(after.pose).toBe('walk')
})

test('switching from sleeping to working runs; back to idle walks', async () => {
  const slept = run(spawn(makeRng(5), WIDTH), 'sleeping', 3)[2]!
  const ran = run(slept, 'working', 1)[0]!
  expect(ran.pose).toBe('run')
  expect(run(ran, 'idle', 1)[0]!.pose).toBe('walk')
})

test('frame index cycles within the pose frame count', async () => {
  const states = run(spawn(makeRng(5), WIDTH, 'working'), 'working', 50)
  expect(states.every(pet => pet.frameIndex >= 0 && pet.frameIndex < frameCounts.run)).toBe(true)
  expect(new Set(states.map(pet => pet.frameIndex)).size).toBe(frameCounts.run)
  // A pose with no frames reported does not crash or go NaN.
  const rng = makeRng(1)
  const pet = step(
    spawn(rng, WIDTH),
    { width: WIDTH, mode: 'idle', frameCounts: { walk: 0, run: 0, sit: 0, sleep: 0 } },
    rng,
  )
  expect(pet.frameIndex).toBe(0)
})

test('a resize narrower than the pet pulls it back in', async () => {
  const pet = { ...spawn(makeRng(1), 200), x: 150 }
  const next = run(pet, 'idle', 1, 1, 60)[0]!
  expect(next.x <= 60 - SPRITE_W).toBe(true)
})

test('pat shows a heart that fades', async () => {
  const patted = pat(spawn(makeRng(1), WIDTH))
  expect(patted.heartTicks).toBe(HEART_TICKS)
  const states = run(patted, 'idle', HEART_TICKS)
  expect(states[states.length - 1]!.heartTicks).toBe(0)
  expect(states[0]!.heartTicks).toBe(HEART_TICKS - 1)
})

test('step does not mutate its input', async () => {
  const pet = spawn(makeRng(1), WIDTH)
  const copy = { ...pet }
  step(pet, { width: WIDTH, mode: 'idle', frameCounts }, makeRng(1))
  expect(pet).toEqual(copy)
})
