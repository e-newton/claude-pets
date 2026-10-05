// Pixel data + palettes for claude-pets. Pure: no `$`, no DOM, no Node.
// Art is authored as string grids (12 x 8, facing RIGHT) and converted to
// Frames (0xRRGGBB | null) on first use.

export type Species = 'cat' | 'dog'
export type Pose = 'walk' | 'run' | 'sit' | 'sleep'
export const SPRITE_W = 12
export const SPRITE_H = 8
export const BAND_ROWS = 4
export const COLORS: { cat: readonly string[]; dog: readonly string[] } = {
  cat: ['orange', 'black', 'gray', 'white'],
  dog: ['brown', 'golden', 'black', 'white'],
}

/** A frame: SPRITE_H rows x SPRITE_W px, each 0xRRGGBB or null (transparent). Faces RIGHT. */
export type Frame = ReadonlyArray<ReadonlyArray<number | null>>

// Palette keys: . transparent, o outline, b body, l light (belly/muzzle/highlight),
// d dark (dog ear / far legs), e eye, n nose, p pink (tongue / inner ear)
type Palette = { [k: string]: number }
type Grid = readonly string[]

const CAT_PALETTES: { [color: string]: Palette } = {
  orange: { o: 0x7a3a12, b: 0xf0922c, l: 0xffd59a, d: 0xc86a1a, e: 0x1a1a22, n: 0xe8607e, p: 0xf4a0a8 },
  black: { o: 0x8d93a6, b: 0x2e3038, l: 0x50535e, d: 0x1c1d22, e: 0xf2e04a, n: 0xe8607e, p: 0xb86a7c },
  gray: { o: 0x434955, b: 0x9aa1ad, l: 0xd0d5dd, d: 0x757c89, e: 0x1a1a22, n: 0xe8607e, p: 0xf0a8b4 },
  white: { o: 0x7f8494, b: 0xf6f6f8, l: 0xffffff, d: 0xd2d4dc, e: 0x1a1a22, n: 0xf0708c, p: 0xf8b4c0 },
}

const DOG_PALETTES: { [color: string]: Palette } = {
  brown: { o: 0x40240e, b: 0xa06c3c, l: 0xe0b684, d: 0x6a4020, e: 0x15151c, n: 0x15151c, p: 0xff6f86 },
  golden: { o: 0x7e4e10, b: 0xe8b24c, l: 0xfae2a4, d: 0xb67c20, e: 0x15151c, n: 0x15151c, p: 0xff6f86 },
  black: { o: 0x8d93a6, b: 0x32343b, l: 0x585b66, d: 0x1a1b20, e: 0xf2f2f2, n: 0xc8ccd8, p: 0xff6f86 },
  white: { o: 0x7f8494, b: 0xf4f4f6, l: 0xffffff, d: 0xc4c6d0, e: 0x15151c, n: 0x15151c, p: 0xff6f86 },
}

const T = (torso: Grid, legs: Grid): Grid => [...torso, ...legs]

// ---------------------------------------------------------------------------
// Cat: pointy ears, tail up. Rows 0-2 above the back stay empty (cols 2-6)
// so overlays (heart / zzz) have room.
// ---------------------------------------------------------------------------
const CAT_TORSO: Grid = [
  '.......o...o',
  'o......obbbo',
  'ob.....obebo',
  'ob.ooooobbbn',
  'obobbbbbbbbo',
  '.obbllllbbo.',
]
const CAT_WALK: Grid[] = [
  T(CAT_TORSO, ['..ob..ob.ob.', '..oo..oo.oo.']),
  T(CAT_TORSO, ['..obob..obob', '..oo.o..oo.o']),
  T(CAT_TORSO, ['..ob..ob.ob.', '..oo..oo.oo.']),
  T(CAT_TORSO, ['...obo.obo..', '...ooo.ooo..']),
]
// Run: body stretched, tail streaming back, legs reaching out.
const CAT_RUN_TORSO: Grid = [
  '.......o...o',
  '.......obbbo',
  'oo.....obebo',
  '.booooooobbn',
  '..bbbbbbbbbo',
  '..obllllbbo.',
]
const CAT_RUN: Grid[] = [
  T(CAT_RUN_TORSO, ['.ob.......obo', '.oo......oo..']),
  T(CAT_RUN_TORSO, ['..oboo.oob...', '...ooo.oo....']),
]
const CAT_SIT: Grid[] = [
  [
    '......o...o.',
    '......obbbbo',
    '......obebo.',
    '.....ooobbn.',
    '....obbbbbo.',
    '...obbllbbo.',
    '..obbbllbbo.',
    '.ooobbbbbboo',
  ],
  [
    '......o...o.',
    '......obbbbo',
    '......obebo.',
    '.....ooobbn.',
    '....obbbbbo.',
    '...obbllbbo.',
    '.o.obbllbbo.',
    'obooobbbbboo',
  ],
]
const CAT_SLEEP: Grid[] = [
  [
    '............',
    '............',
    '............',
    '........o.o.',
    '..oooooooooo',
    '.obbbbbbbebo',
    'obbbllllbbbn',
    '.oooooooooo.',
  ],
  [
    '............',
    '............',
    '............',
    '........o.o.',
    '...ooooooooo',
    '.oobbbbbbebo',
    'obbbllllbbbn',
    '.oooooooooo.',
  ],
]

// ---------------------------------------------------------------------------
// Dog: floppy ear, longer snout, wagging tail.
// ---------------------------------------------------------------------------
const DOG_TORSO_UP: Grid = [
  '.......ooo..',
  'o.....obbbo.',
  'oo....odbebo',
  'ob.oooodbbln',
  'obobbbbdbbbo',
  '.obbllllbbo.',
]
const DOG_TORSO_DOWN: Grid = [
  '.......ooo..',
  '......obbbo.',
  '......odbebo',
  '..ooooodbbln',
  'oobbbbbdbbbo',
  'oobbllllbbo.',
]
const DOG_WALK: Grid[] = [
  T(DOG_TORSO_UP, ['..ob..ob.ob.', '..oo..oo.oo.']),
  T(DOG_TORSO_DOWN, ['..obob..obob', '..oo.o..oo.o']),
  T(DOG_TORSO_UP, ['..ob..ob.ob.', '..oo..oo.oo.']),
  T(DOG_TORSO_DOWN, ['...obo.obo..', '...ooo.ooo..']),
]
const DOG_RUN: Grid[] = [
  T(DOG_TORSO_UP, ['.ob......obo', '.oo.....oo..']),
  T(DOG_TORSO_DOWN, ['..oboo.oob..', '...ooo.oo...']),
]
const DOG_SIT: Grid[] = [
  [
    '......ooo...',
    '.....obbboo.',
    '.....dbebno.',
    '.....dobbbn.',
    '....obbbbo..',
    '...obbllbo..',
    '..obbbllbo..',
    '.ooobbbbboo.',
  ],
  [
    '......ooo...',
    '.....obbboo.',
    '.....dbebno.',
    '.....dobbbn.',
    '....obbbbo..',
    '...obbllbo..',
    '.o.obbllbo..',
    'obooobbbboo.',
  ],
]
const DOG_SLEEP: Grid[] = [
  [
    '............',
    '............',
    '............',
    '............',
    '..ooooooooo.',
    '.obbbbbbdbeo',
    'obbbllllbbbn',
    '.oooooooooo.',
  ],
  [
    '............',
    '............',
    '............',
    '............',
    '...oooooooo.',
    '.oobbbbbdbeo',
    'obbbllllbbbn',
    '.oooooooooo.',
  ],
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
