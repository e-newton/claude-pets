import { test, expect } from 'claude-code/testing'
import { BAND_ROWS, COLORS, SPRITE_H, SPRITE_W, getFrames } from './sprites'
import type { Pose, Species } from './sprites'
import { base64, decodeCells, DEFAULT_COLOR, mirror, renderBand } from './render'
import type { Frame } from './render'

const POSES: Pose[] = ['walk', 'run', 'sit', 'sleep']
const SPECIES: Species[] = ['cat', 'dog']
const RED = 0xff0000
const BLUE = 0x0000ff

function blank(): (number | null)[][] {
  return Array.from({ length: SPRITE_H }, () => Array<number | null>(SPRITE_W).fill(null))
}

test('every species/color/pose frame is SPRITE_H x SPRITE_W', () => {
  for (const sp of SPECIES)
    for (const color of COLORS[sp])
      for (const pose of POSES) {
        const frames = getFrames(sp, color, pose)
        expect(frames.length >= 1).toBe(true)
        for (const f of frames) {
          expect(f.length).toBe(SPRITE_H)
          for (const row of f) expect(row.length).toBe(SPRITE_W)
          expect(f.some(r => r.some(p => p !== null))).toBe(true)
        }
      }
})

test('frame counts and unknown color fallback', () => {
  expect(getFrames('cat', 'walk-nope', 'walk')).toEqual(getFrames('cat', 'orange', 'walk'))
  expect(getFrames('dog', 'zzz', 'sit')).toEqual(getFrames('dog', 'brown', 'sit'))
  expect(getFrames('cat', 'orange', 'walk').length >= 2).toBe(true)
  expect(getFrames('cat', 'orange', 'run').length).toBe(2)
})

test('colors differ between variants', () => {
  expect(getFrames('cat', 'orange', 'walk')).not.toEqual(getFrames('cat', 'black', 'walk'))
})

test('base64 matches padded standard encoding', () => {
  expect(base64(new Uint8Array([]))).toBe('')
  expect(base64(new Uint8Array([102]))).toBe('Zg==')
  expect(base64(new Uint8Array([102, 111]))).toBe('Zm8=')
  expect(base64(new Uint8Array([102, 111, 111]))).toBe('Zm9v')
})

test('cells length: base64 of columns * BAND_ROWS * 12 bytes', () => {
  for (const cols of [0, 1, 7, 40]) {
    const s = renderBand(cols, [])
    const bytes = cols * BAND_ROWS * 12
    expect(s.length).toBe(Math.ceil(bytes / 3) * 4)
    expect(decodeCells(s).length).toBe(cols * BAND_ROWS)
  }
})

test('half-block encoding of a known pixel pair', () => {
  const f = blank()
  f[0]![0] = RED // top of cell (0,0)
  f[1]![0] = BLUE // bottom of cell (0,0)
  f[3]![1] = BLUE // only bottom of cell (1,1)... row 3 = bottom half of cell row 1
  f[4]![2] = RED // only top of cell row 2
  const cells = decodeCells(renderBand(4, [{ frame: f, x: 0, facingLeft: false, overlay: null }]))
  expect(cells[0]).toEqual([0x2580, RED, BLUE])
  expect(cells[4 + 1]).toEqual([0x2584, BLUE, DEFAULT_COLOR])
  expect(cells[8 + 2]).toEqual([0x2580, RED, DEFAULT_COLOR])
  expect(cells[3]).toEqual([0x20, DEFAULT_COLOR, DEFAULT_COLOR])
})

test('facingLeft mirrors horizontally', () => {
  const f = blank()
  f[0]![0] = RED
  const right = decodeCells(renderBand(SPRITE_W, [{ frame: f, x: 0, facingLeft: false, overlay: null }]))
  const left = decodeCells(renderBand(SPRITE_W, [{ frame: f, x: 0, facingLeft: true, overlay: null }]))
  expect(right[0]![1]).toBe(RED)
  expect(left[SPRITE_W - 1]![1]).toBe(RED)
  expect(left[0]![0]).toBe(0x20)
  expect(mirror(f)[0]![SPRITE_W - 1]).toBe(RED)
})

test('clips at both edges', () => {
  const f = blank()
  for (let y = 0; y < SPRITE_H; y++) for (let x = 0; x < SPRITE_W; x++) f[y]![x] = RED
  const cols = SPRITE_W + 8
  const at = (x: number) => decodeCells(renderBand(cols, [{ frame: f, x, facingLeft: false, overlay: null }]))
  const lit = (cells: ReturnType<typeof decodeCells>, r: number) =>
    cells.slice(r * cols, (r + 1) * cols).filter(c => c[0] !== 0x20).length
  expect(lit(at(-4), 0)).toBe(SPRITE_W - 4)
  expect(lit(at(-SPRITE_W), 0)).toBe(0)
  expect(lit(at(-30), 0)).toBe(0)
  expect(lit(at(cols - 6), 0)).toBe(6)
  expect(lit(at(cols), 0)).toBe(0)
  expect(at(-4).length).toBe(cols * BAND_ROWS)
})

test('later pets draw over earlier ones', () => {
  const a = blank(); a[0]![0] = RED
  const b = blank(); b[0]![0] = BLUE
  const cells = decodeCells(renderBand(2, [
    { frame: a, x: 0, facingLeft: false, overlay: null },
    { frame: b, x: 0, facingLeft: false, overlay: null },
  ]))
  expect(cells[0]![1]).toBe(BLUE)
})

test('overlays draw something, inside the band, mid-band', () => {
  for (const sp of SPECIES)
    for (const pose of POSES) {
      const frame: Frame = getFrames(sp, 'brown', pose)[0]!
      for (const facingLeft of [false, true]) {
        const base = renderBand(30, [{ frame, x: 9, facingLeft, overlay: null }])
        for (const overlay of ['heart', 'zzz'] as const) {
          const withO = renderBand(30, [{ frame, x: 9, facingLeft, overlay }])
          expect(withO === base).toBe(false)
          expect(decodeCells(withO).length).toBe(30 * BAND_ROWS)
        }
      }
    }
})

test('top 3 pixel rows of every frame are empty (overlay headroom)', () => {
  for (const sp of SPECIES)
    for (const color of COLORS[sp])
      for (const pose of POSES)
        for (const f of getFrames(sp, color, pose))
          for (let y = 0; y < 3; y++) expect(f[y]!.every(p => p === null)).toBe(true)
})

test('overlays never overwrite sprite pixels', () => {
  for (const sp of SPECIES)
    for (const pose of POSES)
      for (const frame of getFrames(sp, 'brown', pose))
        for (const facingLeft of [false, true]) {
          const W = SPRITE_W + 4
          const px = (overlay: 'heart' | 'zzz' | null) =>
            decodeCells(renderBand(W, [{ frame, x: 2, facingLeft, overlay }]))
          const base = px(null)
          for (const overlay of ['heart', 'zzz'] as const) {
            const withO = px(overlay)
            // Cells covering sprite pixels (rows >= 3) must be unchanged except cell row 1 (px 2-3), which may gain only its top-half.
            for (let r = 2; r < BAND_ROWS; r++)
              for (let c = 0; c < W; c++) expect(withO[r * W + c]).toEqual(base[r * W + c])
          }
        }
})
