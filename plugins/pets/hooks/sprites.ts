// The pets' sprites as colour Frames. Pure: no `$`, no DOM, no Node.
//
// Art is authored as string grids (cat.ts, dog.ts) and converted to Frames on first use.
// Rows 0-2 of every frame are EMPTY: that headroom belongs to overlays (see render.ts).
import { CAT_RUN, CAT_SIT, CAT_SLEEP, CAT_WALK } from './cat'
import { DOG_RUN, DOG_SIT, DOG_SLEEP, DOG_WALK } from './dog'
import { COLORS, PALETTES } from './palettes'
import type { Palette } from './palettes'
import { PIXEL_LEGEND, SPRITE_H, SPRITE_W, TRANSPARENT } from './pixel-art'
import type { Grid } from './pixel-art'

export { BAND_ROWS, SPRITE_H, SPRITE_W } from './pixel-art'
export { COLORS } from './palettes'

export type Species = 'cat' | 'dog'
export type Pose = 'walk' | 'run' | 'sit' | 'sleep'

/** A frame: SPRITE_H rows x SPRITE_W px, each 0xRRGGBB or null (transparent). Faces RIGHT. */
export type Frame = ReadonlyArray<ReadonlyArray<number | null>>

const GRIDS: Record<Species, Record<Pose, readonly Grid[]>> = {
  cat: { walk: CAT_WALK, run: CAT_RUN, sit: CAT_SIT, sleep: CAT_SLEEP },
  dog: { walk: DOG_WALK, run: DOG_RUN, sit: DOG_SIT, sleep: DOG_SLEEP },
}

/** The raw string grids, for tests. */
export function getGrids(species: Species, pose: Pose): readonly Grid[] {
  return GRIDS[species][pose]
}

/** Paint a grid with a palette. Characters the legend does not know come out transparent. */
function toFrame(grid: Grid, palette: Palette): Frame {
  const rows: (number | null)[][] = []
  for (let y = 0; y < SPRITE_H; y++) {
    const line = grid[y] ?? ''
    const pixels: (number | null)[] = []
    for (let x = 0; x < SPRITE_W; x++) {
      const character = line[x] ?? TRANSPARENT
      const colorName = character === TRANSPARENT ? undefined : PIXEL_LEGEND[character as keyof typeof PIXEL_LEGEND]
      pixels.push(colorName === undefined ? null : palette[colorName])
    }
    rows.push(pixels)
  }
  return rows
}

const frameCache = new Map<string, readonly Frame[]>()

/** The frames of a pose, painted in `color`. An unknown color falls back to the species' first. */
export function getFrames(species: Species, color: string, pose: Pose): readonly Frame[] {
  const palettes = PALETTES[species] ?? PALETTES.cat
  const colorName = palettes[color] ? color : COLORS[species]?.[0] ?? 'orange'
  const cacheKey = `${species}/${colorName}/${pose}`
  let frames = frameCache.get(cacheKey)
  if (!frames) {
    const grids = GRIDS[species]?.[pose] ?? GRIDS.cat.walk
    frames = grids.map(grid => toFrame(grid, palettes[colorName]!))
    frameCache.set(cacheKey, frames)
  }
  return frames
}
