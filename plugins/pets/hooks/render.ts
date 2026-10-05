// Composes placed pets into Raster `cells` (base64). Pure: no `$`, no DOM, no Node.
//
// Raster cells: base64 of little-endian u32 triplets [codePoint, fg, bg].
// A color is 0x00RRGGBB, or DEFAULT_COLOR (0x01000000, bit 24 alone) for the
// terminal's default fg/bg, which we use for transparent pixels.

import { BAND_ROWS, SPRITE_H, SPRITE_W } from './sprites'
import type { Frame } from './sprites'

export { BAND_ROWS, SPRITE_H, SPRITE_W }
export type { Frame }
export type { Pose, Species } from './sprites'
export { COLORS, getFrames } from './sprites'

export type Overlay = 'heart' | 'zzz' | null
export type Placed = { frame: Frame; x: number; facingLeft: boolean; overlay: Overlay }

export const DEFAULT_COLOR = 0x01000000
export const HEART_COLOR = 0xff4d6d
export const Z_COLOR = 0xa9cbff

const NONE = -1

// Overlay bitmaps, in the sprite's rightward orientation. '#' = lit.
const HEART = ['.#.#.', '#####', '.###.']
const HEART_TIP = '..#..' // row 3, only drawn if the sprite leaves that spot empty
const ZZZ = ['###', '.#.', '###'] // a small "z"; width 3, height 3

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64 (no btoa / Buffer / toBase64 needed). */
export function base64(bytes: Uint8Array): string {
  let out = ''
  const n = bytes.length
  for (let i = 0; i < n; i += 3) {
    const a = bytes[i]!
    const b = i + 1 < n ? bytes[i + 1]! : 0
    const c = i + 2 < n ? bytes[i + 2]! : 0
    out += B64[a >> 2]! + B64[((a & 3) << 4) | (b >> 4)]!
    out += i + 1 < n ? B64[((b & 15) << 2) | (c >> 6)]! : '='
    out += i + 2 < n ? B64[c & 63]! : '='
  }
  return out
}

/** Inverse of `renderBand`'s encoding, for tests and the preview script. */
export function decodeCells(cells: string): Array<[number, number, number]> {
  const bytes: number[] = []
  let acc = 0
  let bits = 0
  for (const ch of cells) {
    if (ch === '=') break
    acc = (acc << 6) | B64.indexOf(ch)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((acc >> bits) & 255)
    }
  }
  const word = (i: number) => (bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24)) >>> 0
  const out: Array<[number, number, number]> = []
  for (let i = 0; i + 11 < bytes.length; i += 12) out.push([word(i), word(i + 4), word(i + 8)])
  return out
}

/** Mirror a frame horizontally. */
export function mirror(frame: Frame): Frame {
  return frame.map(row => row.slice().reverse())
}

/**
 * Where an overlay of `w` x 3 sits in the sprite box (post-mirroring): the empty
 * window in the top three pixel rows closest to the head (front). Falls back to
 * hovering over the back if the art leaves no room.
 */
function overlayX(frame: Frame, facingLeft: boolean, w: number): number {
  const free = (dx: number) => {
    for (let y = 0; y < 3; y++) for (let x = dx; x < dx + w; x++) if (frame[y]?.[x] != null) return false
    return true
  }
  const max = SPRITE_W - w
  if (facingLeft) {
    for (let dx = 0; dx <= max; dx++) if (free(dx)) return dx
    return 3
  }
  for (let dx = max; dx >= 0; dx--) if (free(dx)) return dx
  return 3
}

export function renderBand(columns: number, pets: readonly Placed[]): string {
  const rows = BAND_ROWS
  const W = Math.max(0, Math.floor(columns))
  const px = new Int32Array(W * SPRITE_H).fill(NONE)

  const put = (X: number, y: number, color: number) => {
    if (X >= 0 && X < W && y >= 0 && y < SPRITE_H) px[y * W + X] = color
  }

  for (const pet of pets) {
    const x0 = Math.round(pet.x)
    const frame = pet.facingLeft ? mirror(pet.frame) : pet.frame
    for (let y = 0; y < SPRITE_H; y++) {
      const row = frame[y]
      if (!row) continue
      for (let x = 0; x < SPRITE_W; x++) {
        const c = row[x]
        if (c != null) put(x0 + x, y, c)
      }
    }
    if (pet.overlay === 'heart') {
      const dx = overlayX(frame, pet.facingLeft, 5)
      HEART.forEach((line, y) => {
        for (let x = 0; x < 5; x++) if (line[x] === '#') put(x0 + dx + x, y, HEART_COLOR)
      })
      for (let x = 0; x < 5; x++) {
        if (HEART_TIP[x] === '#' && frame[3]?.[dx + x] == null) put(x0 + dx + x, 3, HEART_COLOR)
      }
    } else if (pet.overlay === 'zzz') {
      const dx = overlayX(frame, pet.facingLeft, 3)
      ZZZ.forEach((line, y) => {
        for (let x = 0; x < 3; x++) if (line[x] === '#') put(x0 + dx + x, y, Z_COLOR)
      })
    }
  }

  const bytes = new Uint8Array(W * rows * 12)
  let o = 0
  const word = (v: number) => {
    bytes[o++] = v & 255
    bytes[o++] = (v >>> 8) & 255
    bytes[o++] = (v >>> 16) & 255
    bytes[o++] = (v >>> 24) & 255
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < W; c++) {
      const top = px[2 * r * W + c]!
      const bot = px[(2 * r + 1) * W + c]!
      if (top !== NONE) {
        // fg = top, bg = bottom (default bg when the bottom pixel is clear)
        word(0x2580); word(top); word(bot === NONE ? DEFAULT_COLOR : bot)
      } else if (bot !== NONE) {
        word(0x2584); word(bot); word(DEFAULT_COLOR)
      } else {
        word(0x20); word(DEFAULT_COLOR); word(DEFAULT_COLOR)
      }
    }
  }
  return base64(bytes)
}
