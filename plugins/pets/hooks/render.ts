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
export const HEART_COLOR = 0xe8344f
export const HEART_SHINE = 0xffb0bd
export const Z_COLOR = 0xa9cbff

const NONE = -1

// Overlay bitmaps in the sprite's rightward orientation. '#' = main color,
// 'h' = highlight. Every sprite frame leaves its top 3 pixel rows empty, so the
// heart's body lives in that headroom; its single tip pixel (row 3) is only drawn
// where the sprite leaves it free.
const HEART = ['.#.#.', '#h###', '.###.', '..#..']
const HEART_COLORS: { [k: string]: number } = { '#': HEART_COLOR, h: HEART_SHINE }
// A small z and a bigger Z, drawn rising up and to the right above the head.
const Z_SMALL = ['###', '..#', '.#.', '###']
const Z_BIG = ['#####', '...#.', '..#..', '.#...', '#####']

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

/** Column span of the head in a right-facing frame (the front quarter of the sprite). */
const HEAD_X0 = 13
const HEAD_X1 = SPRITE_W - 1

/**
 * Where an overlay `w` px wide sits in the sprite box (post-mirroring): centered above
 * the head (the front: right end, or left end when mirrored). `tip` is an optional
 * column offset in row 3 that must be free of sprite pixels; the dx nearest the
 * head center where that holds is chosen.
 */
function overlayX(frame: Frame, facingLeft: boolean, w: number, tip?: number): number {
  const max = SPRITE_W - w
  const right = Math.round((HEAD_X0 + HEAD_X1 + 1) / 2 - w / 2)
  const want = facingLeft ? SPRITE_W - w - right : right
  const ok = (dx: number) => tip === undefined || frame[3]?.[dx + tip] == null
  for (let d = 0; d <= SPRITE_W; d++) {
    for (const dx of [want - d, want + d]) if (dx >= 0 && dx <= max && ok(dx)) return dx
  }
  return Math.min(max, Math.max(0, want))
}

/** Width of the front strip scanned by `headTop` (narrower than the head so a curled body behind it is ignored). */
const HEAD_TOP_W = 5

/** Topmost lit pixel row over the head columns (post-mirroring); SPRITE_H when there is none. */
function headTop(frame: Frame, facingLeft: boolean): number {
  const x0 = facingLeft ? 0 : SPRITE_W - HEAD_TOP_W
  const x1 = facingLeft ? HEAD_TOP_W - 1 : SPRITE_W - 1
  for (let y = 0; y < SPRITE_H; y++) for (let x = x0; x <= x1; x++) if (frame[y]?.[x] != null) return y
  return SPRITE_H
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
      const dx = overlayX(frame, pet.facingLeft, 5, 2)
      HEART.forEach((line, y) => {
        for (let x = 0; x < 5; x++) {
          const c = HEART_COLORS[line[x]!]
          if (c !== undefined && frame[y]?.[dx + x] == null) put(x0 + dx + x, y, c)
        }
      })
    } else if (pet.overlay === 'zzz') {
      // Both letters stand on the head: the small z beside it, the big Z up and right.
      const top = headTop(frame, pet.facingLeft)
      const bw = Z_BIG[0]!.length
      const sw = Z_SMALL[0]!.length
      const bx = overlayX(frame, pet.facingLeft, bw)
      const sx = pet.facingLeft ? bx + bw + 1 : bx - sw - 1
      const free = (bmp: string[], dx: number, y0: number) =>
        dx >= 0 && dx + bmp[0]!.length <= SPRITE_W && y0 >= 0 &&
        bmp.every((line, y) => [...line].every((ch, x) => ch !== '#' || frame[y0 + y]?.[dx + x] == null))
      const draw = (bmp: string[], dx: number, y0: number) =>
        bmp.forEach((line, y) => {
          for (let x = 0; x < line.length; x++) if (line[x] === '#' && frame[y0 + y]?.[dx + x] == null) put(x0 + dx + x, y0 + y, Z_COLOR)
        })
      // Both letters must render whole: the big Z rises above the head (pushed down, not clipped,
      // when the head is tall); the small z takes the nearest spot where all its pixels are free.
      const by = Math.max(0, top - 8)
      let sy = Math.max(by + 1, top - 5)
      let sdx = sx
      search: for (let up = 0; up <= sy; up++)
        for (const shift of [0, -1, 1, -2, 2])
          if (free(Z_SMALL, sx + shift, sy - up) && (sx + shift + sw < bx || sx + shift > bx + bw)) {
            sy -= up
            sdx = sx + shift
            break search
          }
      draw(Z_SMALL, sdx, sy)
      draw(Z_BIG, bx, by)
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
