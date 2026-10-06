// Authoring helpers for the pixel-art string grids. Pure: no `$`, no DOM, no Node.
//
// A sprite is a SPRITE_H x SPRITE_W grid of characters facing RIGHT. The top
// HEADROOM_ROWS rows of every sprite stay empty: that headroom belongs to the heart and
// "zzz" overlays (see render.ts). So pieces (head, body, legs, tail) are authored on a
// smaller ART_ROWS-high canvas and `composeGrid` adds the headroom back.

export const SPRITE_W = 20
export const SPRITE_H = 16
export const BAND_ROWS = SPRITE_H / 2 // half-block glyphs: one terminal row holds two pixel rows
export const HEADROOM_ROWS = 3
const ART_ROWS = SPRITE_H - HEADROOM_ROWS

/** A grid of art: one string per pixel row, one character per pixel. */
export type Grid = readonly string[]

/** What each character of the art means: the name of a field of `Palette`. '.' is transparent. */
export const PIXEL_LEGEND = {
  o: 'outline',
  u: 'outlineLit',
  k: 'softCorner',
  b: 'body',
  h: 'highlight',
  l: 'light',
  d: 'dark',
  e: 'eye',
  w: 'eyeGlint',
  n: 'nose',
  p: 'pink',
  s: 'shade',
  f: 'farLimb',
  g: 'farPaw',
  m: 'mouth',
} as const

export const TRANSPARENT = '.'

/** Build a row: numbers are runs of transparent pixels, strings are pixels. Padded to SPRITE_W. */
export const row = (...segments: (string | number)[]): string =>
  segments
    .map(segment => (typeof segment === 'number' ? TRANSPARENT.repeat(segment) : segment))
    .join('')
    .padEnd(SPRITE_W, TRANSPARENT)

/** A small grid stamped onto the canvas with its top-left corner at (x, y). */
export type Piece = { x: number; y: number; rows: Grid }
export const piece = (x: number, y: number, rows: Grid): Piece => ({ x, y, rows })

/**
 * Stamp pieces onto an empty canvas in painter's order (later pieces cover earlier ones;
 * a '.' in a piece is transparent and leaves what is below). Pixels outside the canvas
 * are clipped. Returns the full SPRITE_H-row grid, headroom included.
 */
export function composeGrid(...pieces: (Piece | Piece[])[]): Grid {
  const canvas: string[][] = Array.from({ length: ART_ROWS }, () => Array<string>(SPRITE_W).fill(TRANSPARENT))
  for (const { x, y, rows } of pieces.flat())
    rows.forEach((line, rowOffset) => {
      for (let columnOffset = 0; columnOffset < line.length; columnOffset++) {
        const pixel = line[columnOffset]!
        const canvasX = x + columnOffset
        const canvasY = y + rowOffset
        const isOnCanvas = canvasY >= 0 && canvasY < ART_ROWS && canvasX >= 0 && canvasX < SPRITE_W
        if (pixel !== TRANSPARENT && isOnCanvas) canvas[canvasY]![canvasX] = pixel
      }
    })
  const headroom = Array.from({ length: HEADROOM_ROWS }, () => TRANSPARENT.repeat(SPRITE_W))
  return [...headroom, ...canvas.map(pixels => pixels.join(''))]
}
