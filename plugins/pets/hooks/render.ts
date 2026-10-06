// Composes placed pets into Raster `cells` (base64). Pure: no `$`, no DOM, no Node.
//
// Raster cells: base64 of little-endian u32 triplets [codePoint, fg, bg].
// A color is 0x00RRGGBB, or DEFAULT_COLOR (0x01000000, bit 24 alone) for the
// terminal's default fg/bg, which we use for transparent pixels.
//
// Each cell is a half-block glyph holding two vertically stacked pixels: the upper one
// is the foreground of '▀', the lower one is its background (or the foreground of '▄'
// when the upper pixel is clear).

import type { Frame } from './sprites'
import { BAND_ROWS, SPRITE_H, SPRITE_W } from './sprites'

export type Overlay = 'heart' | 'zzz' | null
export type Placed = { frame: Frame; x: number; facingLeft: boolean; overlay: Overlay }

export const DEFAULT_COLOR = 0x01000000
const HEART_COLOR = 0xe8344f
const HEART_SHINE = 0xffb0bd
const Z_COLOR = 0xa9cbff

const UPPER_HALF_BLOCK = 0x2580
const LOWER_HALF_BLOCK = 0x2584
const SPACE = 0x20

/** Marks a pixel nobody has drawn (distinct from every real color, DEFAULT_COLOR included). */
const UNPAINTED = -1

// ---- Overlay bitmaps ----
// Drawn in the sprite's rightward orientation. '#' = main color, 'h' = highlight.
// Every sprite frame leaves its top 3 pixel rows empty, so the heart's body lives in that
// headroom; its single tip pixel (row 3) is only drawn where the sprite leaves it free.
const HEART = ['.#.#.', '#h###', '.###.', '..#..']
const HEART_COLORS: Record<string, number> = { '#': HEART_COLOR, h: HEART_SHINE }
/** Column of the heart's tip pixel, which pokes into row 3 where the sprite may already have pixels. */
const HEART_TIP_COLUMN = 2
// A small z and a bigger Z, rising up and to the right above the head.
const Z_SMALL = ['###', '..#', '.#.', '###']
const Z_BIG = ['#####', '...#.', '..#..', '.#...', '#####']
const Z_COLORS: Record<string, number> = { '#': Z_COLOR }

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64 (no btoa / Buffer / toBase64 needed). */
export function base64(bytes: Uint8Array): string {
  let encoded = ''
  const length = bytes.length
  for (let i = 0; i < length; i += 3) {
    const first = bytes[i]!
    const second = i + 1 < length ? bytes[i + 1]! : 0
    const third = i + 2 < length ? bytes[i + 2]! : 0
    encoded += BASE64_ALPHABET[first >> 2]! + BASE64_ALPHABET[((first & 3) << 4) | (second >> 4)]!
    encoded += i + 1 < length ? BASE64_ALPHABET[((second & 15) << 2) | (third >> 6)]! : '='
    encoded += i + 2 < length ? BASE64_ALPHABET[third & 63]! : '='
  }
  return encoded
}

/** Inverse of `renderBand`'s encoding, for tests and the preview script. */
export function decodeCells(cells: string): Array<[codePoint: number, fg: number, bg: number]> {
  const bytes: number[] = []
  let bitBuffer = 0
  let bitCount = 0
  for (const character of cells) {
    if (character === '=') break
    bitBuffer = (bitBuffer << 6) | BASE64_ALPHABET.indexOf(character)
    bitCount += 6
    if (bitCount >= 8) {
      bitCount -= 8
      bytes.push((bitBuffer >> bitCount) & 255)
    }
  }
  const wordAt = (i: number) => (bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24)) >>> 0
  const decoded: Array<[number, number, number]> = []
  for (let i = 0; i + 11 < bytes.length; i += 12) decoded.push([wordAt(i), wordAt(i + 4), wordAt(i + 8)])
  return decoded
}

/** Mirror a frame horizontally. */
export function mirror(frame: Frame): Frame {
  return frame.map(pixels => pixels.slice().reverse())
}

// ---- Overlay placement ----
// Sprites face right, so the head is the right end of an unmirrored frame. All the
// functions below take the frame AFTER mirroring (what is actually drawn).

/** Column span of the head in a right-facing frame (the front quarter of the sprite). */
const HEAD_FIRST_COLUMN = 13
const HEAD_LAST_COLUMN = SPRITE_W - 1

/**
 * Where an overlay `width` px wide sits in the sprite box: centered above the head (the
 * right end, or the left end when mirrored). `tipOffset` is an optional column of the
 * overlay that must land on a free pixel in row 3; the position nearest the head center
 * where that holds is chosen, so the heart's tip never has to overwrite the sprite.
 */
function overlayColumn(frame: Frame, facingLeft: boolean, width: number, tipOffset?: number): number {
  const maxColumn = SPRITE_W - width
  const centeredOnHead = Math.round((HEAD_FIRST_COLUMN + HEAD_LAST_COLUMN + 1) / 2 - width / 2)
  const preferred = facingLeft ? SPRITE_W - width - centeredOnHead : centeredOnHead
  const tipIsFree = (column: number) => tipOffset === undefined || frame[3]?.[column + tipOffset] == null
  for (let distance = 0; distance <= SPRITE_W; distance++) {
    for (const column of [preferred - distance, preferred + distance]) {
      if (column >= 0 && column <= maxColumn && tipIsFree(column)) return column
    }
  }
  return Math.min(maxColumn, Math.max(0, preferred))
}

/**
 * Width of the front strip scanned by `headTopRow`. Narrower than the head so that a
 * curled body behind it is ignored.
 */
const HEAD_SCAN_WIDTH = 5

/** Topmost lit pixel row over the head columns; SPRITE_H when there is none. */
function headTopRow(frame: Frame, facingLeft: boolean): number {
  const firstColumn = facingLeft ? 0 : SPRITE_W - HEAD_SCAN_WIDTH
  const lastColumn = facingLeft ? HEAD_SCAN_WIDTH - 1 : SPRITE_W - 1
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = firstColumn; x <= lastColumn; x++) {
      if (frame[y]?.[x] != null) return y
    }
  }
  return SPRITE_H
}

// ---- Painting ----

/** Draws one pixel of the band, silently clipping anything outside it. */
type PlotPixel = (x: number, y: number, color: number) => void

/**
 * Overlays never overwrite sprite pixels: a bitmap pixel is only drawn where the sprite
 * leaves that pixel empty, so the pet's art always stays whole and readable.
 */
function paintBitmap(
  bitmap: readonly string[],
  frame: Frame,
  spriteX: number,
  column: number,
  top: number,
  colors: Record<string, number>,
  plot: PlotPixel,
) {
  bitmap.forEach((line, y) => {
    for (let x = 0; x < line.length; x++) {
      const color = colors[line[x]!]
      if (color !== undefined && frame[top + y]?.[column + x] == null) plot(spriteX + column + x, top + y, color)
    }
  })
}

function paintHeart(frame: Frame, facingLeft: boolean, spriteX: number, plot: PlotPixel) {
  const column = overlayColumn(frame, facingLeft, HEART[0]!.length, HEART_TIP_COLUMN)
  paintBitmap(HEART, frame, spriteX, column, 0, HEART_COLORS, plot)
}

/** Both letters stand on the head: the small z beside it, the big Z up and over. */
function paintSleepZs(frame: Frame, facingLeft: boolean, spriteX: number, plot: PlotPixel) {
  const headTop = headTopRow(frame, facingLeft)
  const bigWidth = Z_BIG[0]!.length
  const smallWidth = Z_SMALL[0]!.length
  const bigColumn = overlayColumn(frame, facingLeft, bigWidth)
  const smallColumn = facingLeft ? bigColumn + bigWidth + 1 : bigColumn - smallWidth - 1

  /** Whether every pixel of the bitmap lands inside the sprite box on a free pixel. */
  const fitsOnFreePixels = (bitmap: string[], column: number, top: number) =>
    column >= 0 &&
    column + bitmap[0]!.length <= SPRITE_W &&
    top >= 0 &&
    bitmap.every((line, y) => [...line].every((ch, x) => ch !== '#' || frame[top + y]?.[column + x] == null))

  // Both letters must render whole: the big Z rises above the head (pushed down, not clipped,
  // when the head is tall); the small z takes the nearest spot where all its pixels are free
  // and that does not overlap the big Z.
  const bigTop = Math.max(0, headTop - 8)
  let smallTop = Math.max(bigTop + 1, headTop - 5)
  let smallLeft = smallColumn
  search: for (let up = 0; up <= smallTop; up++)
    for (const shift of [0, -1, 1, -2, 2]) {
      const column = smallColumn + shift
      const clearsBigZ = column + smallWidth < bigColumn || column > bigColumn + bigWidth
      if (fitsOnFreePixels(Z_SMALL, column, smallTop - up) && clearsBigZ) {
        smallTop -= up
        smallLeft = column
        break search
      }
    }
  paintBitmap(Z_SMALL, frame, spriteX, smallLeft, smallTop, Z_COLORS, plot)
  paintBitmap(Z_BIG, frame, spriteX, bigColumn, bigTop, Z_COLORS, plot)
}

/** Pack the pixel rows into half-block cells, as the Raster element wants them. */
function encodeCells(pixels: Int32Array, width: number): string {
  const bytes = new Uint8Array(width * BAND_ROWS * 12)
  let offset = 0
  const writeWord = (value: number) => {
    bytes[offset++] = value & 255
    bytes[offset++] = (value >>> 8) & 255
    bytes[offset++] = (value >>> 16) & 255
    bytes[offset++] = (value >>> 24) & 255
  }
  for (let cellRow = 0; cellRow < BAND_ROWS; cellRow++) {
    for (let column = 0; column < width; column++) {
      const upper = pixels[2 * cellRow * width + column]!
      const lower = pixels[(2 * cellRow + 1) * width + column]!
      if (upper !== UNPAINTED) {
        // fg = upper pixel, bg = lower pixel (default bg when the lower pixel is clear)
        writeWord(UPPER_HALF_BLOCK)
        writeWord(upper)
        writeWord(lower === UNPAINTED ? DEFAULT_COLOR : lower)
      } else if (lower !== UNPAINTED) {
        writeWord(LOWER_HALF_BLOCK)
        writeWord(lower)
        writeWord(DEFAULT_COLOR)
      } else {
        writeWord(SPACE)
        writeWord(DEFAULT_COLOR)
        writeWord(DEFAULT_COLOR)
      }
    }
  }
  return base64(bytes)
}

/** Raster `cells` for a `columns` x BAND_ROWS band. Pets are painted in order, later ones on top. */
export function renderBand(columns: number, pets: readonly Placed[]): string {
  const width = Math.max(0, Math.floor(columns))
  const pixels = new Int32Array(width * SPRITE_H).fill(UNPAINTED)

  const plot: PlotPixel = (x, y, color) => {
    if (x >= 0 && x < width && y >= 0 && y < SPRITE_H) pixels[y * width + x] = color
  }

  for (const pet of pets) {
    const spriteX = Math.round(pet.x)
    const frame = pet.facingLeft ? mirror(pet.frame) : pet.frame
    for (let y = 0; y < SPRITE_H; y++) {
      const spritePixels = frame[y]
      if (!spritePixels) continue
      for (let x = 0; x < SPRITE_W; x++) {
        const color = spritePixels[x]
        if (color != null) plot(spriteX + x, y, color)
      }
    }
    if (pet.overlay === 'heart') paintHeart(frame, pet.facingLeft, spriteX, plot)
    else if (pet.overlay === 'zzz') paintSleepZs(frame, pet.facingLeft, spriteX, plot)
  }

  return encodeCells(pixels, width)
}
