import { expect, test } from 'claude-code/testing'

import { SPRITE_W } from '../hooks/sprites'
import type { Pose } from '../hooks/sprites'
import { HEART_TICKS, makeRng, maxX, pat, spawn, step } from '../hooks/sim'
import type { Mode, PetRuntime } from '../hooks/sim'

const frameCounts: Record<Pose, number> = { walk: 4, run: 4, sit: 2, sleep: 2 }
const WIDTH = 80

function run(state: PetRuntime, mode: Mode, ticks: number, seed = 1, width = WIDTH) {
  const rng = makeRng(seed)
  const seen: PetRuntime[] = []
  let s = state
  for (let i = 0; i < ticks; i++) {
    s = step(s, { width, mode, frameCounts }, rng)
    seen.push(s)
  }
  return seen
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
    const s = spawn(rng, WIDTH)
    expect(s.x >= 0 && s.x <= maxX(WIDTH)).toBe(true)
    expect(s.speed >= 0.25 && s.speed <= 0.5).toBe(true)
  }
  // A band narrower than a sprite pins the pet to column 0.
  expect(spawn(rng, 5).x).toBe(0)
})

test('x stays clamped and pets turn at both edges', async () => {
  for (const mode of ['idle', 'working'] as const) {
    const seen = run(spawn(makeRng(3), WIDTH, mode), mode, 4000, 9)
    expect(seen.every(s => s.x >= 0 && s.x <= WIDTH - SPRITE_W)).toBe(true)
    expect(seen.some(s => s.x === 0)).toBe(true)
    expect(seen.some(s => s.x === WIDTH - SPRITE_W)).toBe(true)
    expect(seen.some(s => s.dir === 1)).toBe(true)
    expect(seen.some(s => s.dir === -1)).toBe(true)
  }
})

test('walking is smooth: at most 0.5 columns per tick', async () => {
  const seen = run(spawn(makeRng(5), WIDTH), 'idle', 2000, 11)
  let prev = seen[0]!
  for (const s of seen.slice(1)) {
    if (s.pose === 'walk' && prev.pose === 'walk') expect(Math.abs(s.x - prev.x) <= 0.5 + 1e-9).toBe(true)
    prev = s
  }
})

test('idle pets walk and sometimes sit', async () => {
  const seen = run(spawn(makeRng(5), WIDTH), 'idle', 3000, 21)
  expect(seen.some(s => s.pose === 'walk')).toBe(true)
  expect(seen.some(s => s.pose === 'sit')).toBe(true)
  expect(seen.every(s => s.pose === 'walk' || s.pose === 'sit')).toBe(true)
  // Sitting stands still.
  for (let i = 1; i < seen.length; i++) if (seen[i]!.pose === 'sit' && seen[i - 1]!.pose === 'sit') expect(seen[i]!.x).toBe(seen[i - 1]!.x)
})

test('working pets run, about one column per tick', async () => {
  const seen = run(spawn(makeRng(5), WIDTH), 'working', 200, 4)
  expect(seen.every(s => s.pose === 'run')).toBe(true)
  const moves = seen.slice(1).map((s, i) => Math.abs(s.x - seen[i]!.x))
  expect(moves.filter(m => m === 1).length > 150).toBe(true)
})

test('sleeping pets sleep in place and wake when the mode ends', async () => {
  const start = spawn(makeRng(5), WIDTH)
  const seen = run(start, 'sleeping', 100, 2)
  expect(seen.every(s => s.pose === 'sleep' && s.x === start.x)).toBe(true)
  const after = run(seen[seen.length - 1]!, 'idle', 1, 2)[0]!
  expect(after.pose).toBe('walk')
})

test('switching from sleeping to working runs; back to idle walks', async () => {
  const slept = run(spawn(makeRng(5), WIDTH), 'sleeping', 3)[2]!
  const ran = run(slept, 'working', 1)[0]!
  expect(ran.pose).toBe('run')
  expect(run(ran, 'idle', 1)[0]!.pose).toBe('walk')
})

test('frame index cycles within the pose frame count', async () => {
  const seen = run(spawn(makeRng(5), WIDTH, 'working'), 'working', 50)
  expect(seen.every(s => s.frameIndex >= 0 && s.frameIndex < frameCounts.run)).toBe(true)
  expect(new Set(seen.map(s => s.frameIndex)).size).toBe(frameCounts.run)
  // A pose with no frames reported does not crash or go NaN.
  const rng = makeRng(1)
  const s = step(spawn(rng, WIDTH), { width: WIDTH, mode: 'idle', frameCounts: { walk: 0, run: 0, sit: 0, sleep: 0 } }, rng)
  expect(s.frameIndex).toBe(0)
})

test('a resize narrower than the pet pulls it back in', async () => {
  const s = { ...spawn(makeRng(1), 200), x: 150 }
  const next = run(s, 'idle', 1, 1, 60)[0]!
  expect(next.x <= 60 - SPRITE_W).toBe(true)
})

test('pat shows a heart that fades', async () => {
  const patted = pat(spawn(makeRng(1), WIDTH))
  expect(patted.heartTicks).toBe(HEART_TICKS)
  const seen = run(patted, 'idle', HEART_TICKS)
  expect(seen[seen.length - 1]!.heartTicks).toBe(0)
  expect(seen[0]!.heartTicks).toBe(HEART_TICKS - 1)
})

test('step does not mutate its input', async () => {
  const s = spawn(makeRng(1), WIDTH)
  const copy = { ...s }
  step(s, { width: WIDTH, mode: 'idle', frameCounts }, makeRng(1))
  expect(s).toEqual(copy)
})
