// Pixel data + palettes for claude-pets. Pure: no `$`, no DOM, no Node.
// Art is authored as string grids (16 x 12, facing RIGHT) and converted to
// Frames (0xRRGGBB | null) on first use.

export type Species = 'cat' | 'dog'
export type Pose = 'walk' | 'run' | 'sit' | 'sleep'
export const SPRITE_W = 16
export const SPRITE_H = 12
export const BAND_ROWS = 6
export const COLORS: { cat: readonly string[]; dog: readonly string[] } = {
  cat: ['orange', 'black', 'gray', 'white'],
  dog: ['brown', 'golden', 'black', 'white'],
}

/** A frame: SPRITE_H rows x SPRITE_W px, each 0xRRGGBB or null (transparent). Faces RIGHT. */
export type Frame = ReadonlyArray<ReadonlyArray<number | null>>

// Palette keys: . transparent, o outline, b body, l light (muzzle / chest / paws),
// d dark shade (belly, far legs, dog ear), e eye, w eye highlight, n nose,
// p pink (inner ear / tongue)
// Rows 0-2 of every frame are EMPTY: that headroom belongs to overlays.
type Palette = { [k: string]: number }
type Grid = readonly string[]

const CAT_PALETTES: { [color: string]: Palette } = {
  orange: { o: 0x7a3a12, b: 0xf0922c, l: 0xffd59a, d: 0xc86a1a, e: 0x1a1a22, w: 0xffffff, n: 0xe8607e, p: 0xf4a0a8 },
  black: { o: 0x8d93a6, b: 0x2e3038, l: 0x50535e, d: 0x1f2026, e: 0xf2e04a, w: 0xffffff, n: 0xe8607e, p: 0xb86a7c },
  gray: { o: 0x434955, b: 0x9aa1ad, l: 0xd0d5dd, d: 0x757c89, e: 0x1a1a22, w: 0xffffff, n: 0xe8607e, p: 0xf0a8b4 },
  white: { o: 0x7f8494, b: 0xf6f6f8, l: 0xffffff, d: 0xd2d4dc, e: 0x23305a, w: 0xffffff, n: 0xf0708c, p: 0xf8b4c0 },
}

const DOG_PALETTES: { [color: string]: Palette } = {
  brown: { o: 0x40240e, b: 0xa06c3c, l: 0xe0b684, d: 0x6a4020, e: 0x15151c, w: 0xffffff, n: 0x15151c, p: 0xff6f86 },
  golden: { o: 0x7e4e10, b: 0xe8b24c, l: 0xfae2a4, d: 0xb67c20, e: 0x15151c, w: 0xffffff, n: 0x15151c, p: 0xff6f86 },
  black: { o: 0x8d93a6, b: 0x32343b, l: 0x585b66, d: 0x1c1d22, e: 0xe8b030, w: 0xfff2b0, n: 0xc8ccd8, p: 0xff6f86 },
  white: { o: 0x7f8494, b: 0xf4f4f6, l: 0xffffff, d: 0xc4c6d0, e: 0x15151c, w: 0xffffff, n: 0x15151c, p: 0xff6f86 },
}

/** Frames are authored as the 9 rows the art may use; rows 0-2 stay empty (overlay headroom). */
const HEADROOM: Grid = ['................', '................', '................']
const A = (rows: Grid): Grid => [...HEADROOM, ...rows]
const T = (torso: Grid, legs: Grid): Grid => A([...torso, ...legs])

// ---------------------------------------------------------------------------
// Cat: pointy ears with pink insides, short muzzle, tail curved up.
// Torso = pixel rows 3-8, legs = rows 9-11. Far legs are the dark shade 'd'.
// ---------------------------------------------------------------------------
const CAT_TORSO: Grid = [
  '.oo.......o...o.',
  'obo......opo.opo',
  'obo......obbbbbo',
  'obo.oooooobbbwbo',
  '.obbbbbbbbbbbebn',
  '..oddddddddlllo.',
]
const CAT_WALK: Grid[] = [
  T(CAT_TORSO, ['..ob..odod..ob..', '..ob...oooo.ob..', '..oo........oo..']),
  T(CAT_TORSO, ['....obododob....', '.....oododob....', '......oooooo....']),
  T(CAT_TORSO, ['...odob..obod...', '...odob..obod...', '...oooo..oooo...']),
  T(CAT_TORSO, ['....obododob....', '....obodod.oo...', '....oooooo......']),
]
// Run: body stretched low, tail streaming straight back, legs reaching out.
const CAT_RUN_TORSO: Grid = [
  '................',
  '..........o...o.',
  '.........opo.opo',
  '.........obbbbbo',
  'oo.ooooooobbbwbo',
  'bbbbbbbbbbbbbebn',
]
const CAT_RUN_BODY: Grid = ['oo.odddddddlllo.']
const CAT_RUN: Grid[] = [
  A([...CAT_RUN_TORSO.slice(1), ...CAT_RUN_BODY, '....obod.odob...', '...obod...odob..', '..oooo.....oooo.']),
  A([...CAT_RUN_TORSO.slice(1), ...CAT_RUN_BODY, '.....oboodob....', '.....oboodob....', '.....ooooooo....']),
]
const CAT_SIT: Grid[] = [
  A([
    '..........o...o.',
    '.........opo.opo',
    '.........obbbbbo',
    '.........obbbwbo',
    '.........obbbebn',
    '......obbbblllo.',
    '.....obbbbbllbo.',
    '.ob.obbbbbbllbo.',
    '.oooobdddddbllo.',
  ]),
  A([
    '..........o...o.',
    '.........opo.opo',
    '.........obbbbbo',
    '.........obbbwbo',
    '.........obbbebn',
    '......obbbblllo.',
    '.ob..obbbbbllbo.',
    '.oo.obbbbbbllbo.',
    '.oooobdddddbllo.',
  ]),
]
const CAT_SLEEP: Grid[] = [
  A([
    '................',
    '................',
    '................',
    '................',
    '..........o...o.',
    '...ooooooopbbbpo',
    '..obbbbbbbbbeebo',
    '.obbbbbbdddbllbn',
    '..ooooooooooooo.',
  ]),
  A([
    '................',
    '................',
    '................',
    '................',
    '....ooooo.o...o.',
    '...obbbbbopbbbpo',
    '..obbbbbbbbbeebo',
    '.obbbbbbdddbllbn',
    '..ooooooooooooo.',
  ]),
]

// ---------------------------------------------------------------------------
// Dog: floppy dark ear, long snout with a dark nose, tail that wags up and down.
// ---------------------------------------------------------------------------
const DOG_TORSO_UP: Grid = [
  '.oo.............',
  'obo......oooo...',
  'obo.....oddbbbo.',
  'obo.oooooddbwbbo',
  '.obbbbbbbddbelln',
  '..odddddddlllllo',
]
const DOG_TORSO_DOWN: Grid = [
  '................',
  '.........oooo...',
  '........oddbbbo.',
  '....oooooddbwbbo',
  'oobbbbbbbddbelln',
  'obodddddddlllllo',
]
const DOG_WALK: Grid[] = [
  T(DOG_TORSO_UP, ['..ob..odod..ob..', '..ob...oooo.ob..', '..oo........oo..']),
  T(DOG_TORSO_DOWN, ['....obododob....', '.....oododob....', '......oooooo....']),
  T(DOG_TORSO_UP, ['...odob..obod...', '...odob..obod...', '...oooo..oooo...']),
  T(DOG_TORSO_DOWN, ['....obododob....', '....obodod.oo...', '....oooooo......']),
]
const DOG_RUN: Grid[] = [
  T(DOG_TORSO_UP, ['....obod.odob...', '...obod...odob..', '..oooo.....oooo.']),
  T(DOG_TORSO_DOWN, ['.....oboodob....', '.....oboodob....', '.....ooooooo....']),
]
const DOG_SIT: Grid[] = [
  A([
    '.........oooo...',
    '........oddbbbo.',
    '........oddbwbbo',
    '........oddbelln',
    '.......oddbllllo',
    '.....obbbbbbllo.',
    '.ob.obbbbbbbllo.',
    '.ob.obbbbbbbllo.',
    '.oooobdddddbllo.',
  ]),
  A([
    '.........oooo...',
    '........oddbbbo.',
    '........oddbwbbo',
    '........oddbelln',
    '.......oddbllllo',
    '.....obbbbbbllo.',
    '.....obbbbbbllo.',
    '.oo.obbbbbbbllo.',
    'oooooodddddbllo.',
  ]),
]
const DOG_SLEEP: Grid[] = [
  A([
    '................',
    '................',
    '................',
    '................',
    '................',
    '...ooooooooooo..',
    '..obbbbbbbdddebo',
    '.obbbbbbbbdddlln',
    '..ooooooooooooo.',
  ]),
  A([
    '................',
    '................',
    '................',
    '................',
    '....oooooo......',
    '...obbbbbboooo..',
    '..obbbbbbbdddebo',
    '.obbbbbbbbdddlln',
    '..ooooooooooooo.',
  ]),
]

const GRIDS: { [sp in Species]: { [pose in Pose]: readonly Grid[] } } = {
  cat: { walk: CAT_WALK, run: CAT_RUN, sit: CAT_SIT, sleep: CAT_SLEEP },
  dog: { walk: DOG_WALK, run: DOG_RUN, sit: DOG_SIT, sleep: DOG_SLEEP },
}
const PALETTES = { cat: CAT_PALETTES, dog: DOG_PALETTES }

/** Exported for tests / preview: the raw string grids. */
export function getGrids(species: Species, pose: Pose): readonly Grid[] {
  return GRIDS[species][pose]
}

export function toFrame(grid: Grid, palette: Palette): Frame {
  const rows: (number | null)[][] = []
  for (let y = 0; y < SPRITE_H; y++) {
    const line = grid[y] ?? ''
    const row: (number | null)[] = []
    for (let x = 0; x < SPRITE_W; x++) {
      const ch = line[x] ?? '.'
      const c = ch === '.' ? undefined : palette[ch]
      row.push(c === undefined ? null : c)
    }
    rows.push(row)
  }
  return rows
}

const cache = new Map<string, readonly Frame[]>()

export function getFrames(species: Species, color: string, pose: Pose): readonly Frame[] {
  const palettes = PALETTES[species] ?? PALETTES.cat
  const key = palettes[color] ? color : COLORS[species]?.[0] ?? 'orange'
  const id = `${species}/${key}/${pose}`
  let frames = cache.get(id)
  if (!frames) {
    const grids = GRIDS[species]?.[pose] ?? GRIDS.cat.walk
    frames = grids.map(g => toFrame(g, palettes[key]!))
    cache.set(id, frames)
  }
  return frames
}
