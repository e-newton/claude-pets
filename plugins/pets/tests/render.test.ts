import { expect, test } from 'claude-code/testing'

import { DEFAULT_COLOR, base64, decodeCells, mirror, renderBand } from '../hooks/render'
import { BAND_ROWS, COLORS, SPRITE_H, SPRITE_W, getFrames, getGrids } from '../hooks/sprites'
import type { Frame, Pose, Species } from '../hooks/sprites'

const POSES: Pose[] = ['walk', 'run', 'sit', 'sleep']
const SPECIES: Species[] = ['cat', 'dog']
const HEADROOM_ROWS = 3
const RED = 0xff0000
const BLUE = 0x0000ff
const UPPER_HALF_BLOCK = 0x2580
const LOWER_HALF_BLOCK = 0x2584
const SPACE = 0x20

type Cells = ReturnType<typeof decodeCells>

function blankFrame(): (number | null)[][] {
  return Array.from({ length: SPRITE_H }, () => Array<number | null>(SPRITE_W).fill(null))
}

const place = (frame: Frame, options: { x?: number; facingLeft?: boolean; overlay?: 'heart' | 'zzz' | null } = {}) => ({
  frame,
  x: options.x ?? 0,
  facingLeft: options.facingLeft ?? false,
  overlay: options.overlay ?? null,
})

/** The pixel at (x, y) of a rendered band, or null where nothing is drawn. */
function pixelAt(cells: Cells, columns: number, x: number, y: number): number | null {
  const [codePoint, foreground, background] = cells[(y >> 1) * columns + x]!
  const isUpperHalf = y % 2 === 0
  let pixel: number | null
  if (isUpperHalf) pixel = codePoint === UPPER_HALF_BLOCK ? foreground : null
  else pixel = codePoint === UPPER_HALF_BLOCK ? background : codePoint === LOWER_HALF_BLOCK ? foreground : null
  return pixel === DEFAULT_COLOR ? null : pixel
}

test('every species/color/pose frame is SPRITE_H x SPRITE_W', () => {
  for (const species of SPECIES)
    for (const color of COLORS[species])
      for (const pose of POSES) {
        const frames = getFrames(species, color, pose)
        expect(frames.length >= 1).toBe(true)
        for (const frame of frames) {
          expect(frame.length).toBe(SPRITE_H)
          for (const row of frame) expect(row.length).toBe(SPRITE_W)
          expect(frame.some(row => row.some(pixel => pixel !== null))).toBe(true)
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
  for (const columns of [0, 1, 7, 40]) {
    const encoded = renderBand(columns, [])
    const byteCount = columns * BAND_ROWS * 12
    expect(encoded.length).toBe(Math.ceil(byteCount / 3) * 4)
    expect(decodeCells(encoded).length).toBe(columns * BAND_ROWS)
  }
})

test('half-block encoding of a known pixel pair', () => {
  const frame = blankFrame()
  frame[0]![0] = RED // upper half of cell (column 0, row 0)
  frame[1]![0] = BLUE // lower half of the same cell
  frame[3]![1] = BLUE // only the lower half of cell (column 1, row 1)
  frame[4]![2] = RED // only the upper half of cell (column 2, row 2)
  const cells = decodeCells(renderBand(4, [place(frame)]))
  expect(cells[0]).toEqual([UPPER_HALF_BLOCK, RED, BLUE])
  expect(cells[4 + 1]).toEqual([LOWER_HALF_BLOCK, BLUE, DEFAULT_COLOR])
  expect(cells[8 + 2]).toEqual([UPPER_HALF_BLOCK, RED, DEFAULT_COLOR])
  expect(cells[3]).toEqual([SPACE, DEFAULT_COLOR, DEFAULT_COLOR])
})

test('facingLeft mirrors horizontally', () => {
  const frame = blankFrame()
  frame[0]![0] = RED
  const right = decodeCells(renderBand(SPRITE_W, [place(frame)]))
  const left = decodeCells(renderBand(SPRITE_W, [place(frame, { facingLeft: true })]))
  expect(right[0]![1]).toBe(RED)
  expect(left[SPRITE_W - 1]![1]).toBe(RED)
  expect(left[0]![0]).toBe(SPACE)
  expect(mirror(frame)[0]![SPRITE_W - 1]).toBe(RED)
})

test('clips at both edges', () => {
  const frame = blankFrame()
  for (let y = 0; y < SPRITE_H; y++) for (let x = 0; x < SPRITE_W; x++) frame[y]![x] = RED
  const columns = SPRITE_W + 8
  const renderAt = (x: number) => decodeCells(renderBand(columns, [place(frame, { x })]))
  const litCellsInRow = (cells: Cells, row: number) =>
    cells.slice(row * columns, (row + 1) * columns).filter(([codePoint]) => codePoint !== SPACE).length
  expect(litCellsInRow(renderAt(-4), 0)).toBe(SPRITE_W - 4)
  expect(litCellsInRow(renderAt(-SPRITE_W), 0)).toBe(0)
  expect(litCellsInRow(renderAt(-30), 0)).toBe(0)
  expect(litCellsInRow(renderAt(columns - 6), 0)).toBe(6)
  expect(litCellsInRow(renderAt(columns), 0)).toBe(0)
  expect(renderAt(-4).length).toBe(columns * BAND_ROWS)
})

test('later pets draw over earlier ones', () => {
  const redFrame = blankFrame()
  redFrame[0]![0] = RED
  const blueFrame = blankFrame()
  blueFrame[0]![0] = BLUE
  const cells = decodeCells(renderBand(2, [place(redFrame), place(blueFrame)]))
  expect(cells[0]![1]).toBe(BLUE)
})

test('overlays draw something, inside the band, mid-band', () => {
  for (const species of SPECIES)
    for (const pose of POSES) {
      const frame = getFrames(species, 'brown', pose)[0]!
      for (const facingLeft of [false, true]) {
        const withoutOverlay = renderBand(30, [place(frame, { x: 9, facingLeft })])
        for (const overlay of ['heart', 'zzz'] as const) {
          const withOverlay = renderBand(30, [place(frame, { x: 9, facingLeft, overlay })])
          expect(withOverlay === withoutOverlay).toBe(false)
          expect(decodeCells(withOverlay).length).toBe(30 * BAND_ROWS)
        }
      }
    }
})

test('top 3 pixel rows of every frame are empty (overlay headroom)', () => {
  for (const species of SPECIES)
    for (const color of COLORS[species])
      for (const pose of POSES)
        for (const frame of getFrames(species, color, pose))
          for (let y = 0; y < HEADROOM_ROWS; y++) expect(frame[y]!.every(pixel => pixel === null)).toBe(true)
})

test('overlays never overwrite sprite pixels', () => {
  for (const species of SPECIES)
    for (const pose of POSES)
      for (const frame of getFrames(species, 'brown', pose))
        for (const facingLeft of [false, true]) {
          const columns = SPRITE_W + 4
          const render = (overlay: 'heart' | 'zzz' | null) =>
            decodeCells(renderBand(columns, [place(frame, { x: 2, facingLeft, overlay })]))
          const withoutOverlay = render(null)
          for (const overlay of ['heart', 'zzz'] as const) {
            const withOverlay = render(overlay)
            for (let y = 0; y < SPRITE_H; y++)
              for (let x = 0; x < columns; x++) {
                const spritePixel = pixelAt(withoutOverlay, columns, x, y)
                if (spritePixel !== null) expect(pixelAt(withOverlay, columns, x, y)).toBe(spritePixel)
              }
          }
        }
})

test('every authored grid is SPRITE_H rows of SPRITE_W chars', () => {
  for (const species of SPECIES)
    for (const pose of POSES)
      for (const grid of getGrids(species, pose)) {
        expect(grid.length).toBe(SPRITE_H)
        for (const row of grid) expect(row.length).toBe(SPRITE_W)
      }
})
