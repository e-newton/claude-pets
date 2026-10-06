// Pixel data + palettes for claude-pets. Pure: no `$`, no DOM, no Node.
// Art is authored as string grids (20 x 16, facing RIGHT) and converted to
// Frames (0xRRGGBB | null) on first use.

export type Species = 'cat' | 'dog'
export type Pose = 'walk' | 'run' | 'sit' | 'sleep'
export const SPRITE_W = 20
export const SPRITE_H = 16
export const BAND_ROWS = 8
export const COLORS: { cat: readonly string[]; dog: readonly string[] } = {
  cat: ['orange', 'black', 'gray', 'white'],
  dog: ['brown', 'golden', 'black', 'white'],
}

/** A frame: SPRITE_H rows x SPRITE_W px, each 0xRRGGBB or null (transparent). Faces RIGHT. */
export type Frame = ReadonlyArray<ReadonlyArray<number | null>>

// Palette keys: . transparent, o outline, b body, l light (muzzle / chest / paws),
// d dark shade (belly, far legs, dog ear), e eye, w eye highlight, n nose,
// p pink (inner ear / tongue), s belly / chest shade, f far-side limb, m mouth line
// (s, f, m are derived from the base palette: see `withDerived`)
// Rows 0-2 of every frame are EMPTY: that headroom belongs to overlays.
type Palette = { [k: string]: number }
type Grid = readonly string[]

const mix = (a: number, b: number, t: number): number => {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}
const withDerived = (p: { [k: string]: number }): Palette => ({
  ...p,
  s: mix(p.b!, p.d!, 0.55),
  f: mix(p.d!, p.o!, 0.25),
  m: mix(p.o!, p.d!, 0.5),
})

const CAT_PALETTES_RAW: { [color: string]: Palette } = {
  orange: { o: 0x7a3a12, b: 0xf0922c, l: 0xffd59a, d: 0xc86a1a, e: 0x1a1a22, w: 0xffffff, n: 0xe8607e, p: 0xf4a0a8 },
  black: { o: 0x8d93a6, b: 0x2e3038, l: 0x50535e, d: 0x1f2026, e: 0xf2e04a, w: 0xffffff, n: 0xe8607e, p: 0xb86a7c },
  gray: { o: 0x434955, b: 0x9aa1ad, l: 0xd0d5dd, d: 0x757c89, e: 0x1a1a22, w: 0xffffff, n: 0xe8607e, p: 0xf0a8b4 },
  white: { o: 0x7f8494, b: 0xf6f6f8, l: 0xffffff, d: 0xd2d4dc, e: 0x23305a, w: 0xffffff, n: 0xf0708c, p: 0xf8b4c0 },
}

const DOG_PALETTES_RAW: { [color: string]: Palette } = {
  brown: { o: 0x40240e, b: 0xa06c3c, l: 0xe0b684, d: 0x6a4020, e: 0x15151c, w: 0xffffff, n: 0x15151c, p: 0xff6f86 },
  golden: { o: 0x7e4e10, b: 0xe8b24c, l: 0xfae2a4, d: 0xb67c20, e: 0x15151c, w: 0xffffff, n: 0x15151c, p: 0xff6f86 },
  black: { o: 0x8d93a6, b: 0x32343b, l: 0x585b66, d: 0x1c1d22, e: 0xe8b030, w: 0xfff2b0, n: 0xc8ccd8, p: 0xff6f86 },
  white: { o: 0x7f8494, b: 0xf4f4f6, l: 0xffffff, d: 0xc4c6d0, e: 0x15151c, w: 0xffffff, n: 0x15151c, p: 0xff6f86 },
}

const CAT_PALETTES: { [color: string]: Palette } = mapValues(CAT_PALETTES_RAW, withDerived)
const DOG_PALETTES: { [color: string]: Palette } = mapValues(DOG_PALETTES_RAW, withDerived)

function mapValues<T, U>(o: { [k: string]: T }, f: (v: T) => U): { [k: string]: U } {
  const out: { [k: string]: U } = {}
  for (const k of Object.keys(o)) out[k] = f(o[k]!)
  return out
}

// ---------------------------------------------------------------------------
// Authoring helpers. Art is the 13 rows 3-15 of a 20-wide frame; `A` prepends
// the 3 empty headroom rows. Pieces (head, body, legs, tail) are stamped onto a
// 13 x 20 canvas in painter's order; '.' in a piece is transparent.
// ---------------------------------------------------------------------------
const ART_H = SPRITE_H - 3
/** Row builder: numbers are runs of transparent pixels, strings are pixels. */
const R = (...segs: (string | number)[]): string =>
  segs.map(s => (typeof s === 'number' ? '.'.repeat(s) : s)).join('').padEnd(SPRITE_W, '.')
const HEADROOM: Grid = Array.from({ length: 3 }, () => '.'.repeat(SPRITE_W))
const A = (rows: Grid): Grid => [...HEADROOM, ...rows]

type Piece = { x: number; y: number; rows: Grid }
const P = (x: number, y: number, rows: Grid): Piece => ({ x, y, rows })
function compose(...pieces: (Piece | Piece[])[]): Grid {
  const g: string[][] = Array.from({ length: ART_H }, () => Array<string>(SPRITE_W).fill('.'))
  for (const piece of pieces.flat())
    piece.rows.forEach((line, dy) => {
      for (let dx = 0; dx < line.length; dx++) {
        const ch = line[dx]!
        const gx = piece.x + dx
        const gy = piece.y + dy
        if (ch !== '.' && gy >= 0 && gy < ART_H && gx >= 0 && gx < SPRITE_W) g[gy]![gx] = ch
      }
    })
  return A(g.map(r => r.join('')))
}

// A leg: near legs use the body color, far legs the dark 'f'. `xt` is the column of
// its top row and `xb` of the rest (xb != xt shears it into a reaching step); `y` is
// the top row (8 = standing; 7 = lifted one px) and `rows` its height (5 or 4).
function leg(far: boolean, xt: number, xb: number, y = 8, rows = 5): Piece[] {
  const shaft = rows - 2
  const lines = far
    ? [...Array<string>(shaft).fill('ff'), 'fo', 'oo']
    : [...Array<string>(shaft).fill('obo'), 'olo', 'ooo']
  return lines.map((line, i) => P(i === 0 ? xt : xb, y + i, [line]))
}
type LegSpec = [far: boolean, xt: number, xb: number, y?: number, rows?: number]
const legs = (specs: LegSpec[]): Piece[] =>
  [...specs].sort((a, b) => Number(b[0]) - Number(a[0])).flatMap(s => leg(...s))

// ---------------------------------------------------------------------------
// Cat: round head with pointed ears (pink insides), eye + highlight, pink nose,
// cream muzzle; slim body; tail in an S curve.
// ---------------------------------------------------------------------------
const CAT_HEAD: Grid = [
  R(1, 'o', 4, 'o'),
  R('opo', 2, 'opo'),
  'obbbbbbo',
  'bbbbbwbo',
  'bbbbbebo',
  'bbbllmmn',
  'loooooo.',
]
const CAT_BODY: Grid = [
  R(5, 'ooooooo'),
  R(4, 'obbbbbbb'),
  R(3, 'obbbbbbbb'),
  R(3, 'obbbbbbbb'),
  R(3, 'o', 'ssssssss'),
  R(4, 'ooooooooo'),
]
const catTorso = (dy = 0): Piece[] => [P(0, 2 + dy, CAT_BODY), P(12, dy, CAT_HEAD)]
const CAT_TAIL_A: Grid = [R(1, 'oo'), R('obbo'), R('obbo'), R('obo'), R('obo'), R('obbb'), R(1, 'ooo')]
const CAT_TAIL_B: Grid = [R('obbo'), R('obbo'), R('obo'), R('obo'), R('obbb'), R(1, 'ooo')]
const CAT_TAIL_RUN: Grid = [R(1, 'ooo'), R('obbb'), R(1, 'ooo')]

const CAT_WALK: Grid[] = [
  compose(catTorso(), P(0, 0, CAT_TAIL_A), legs([[true, 9, 8], [false, 11, 13], [true, 8, 9], [false, 5, 3]])),
  compose(catTorso(), P(0, 0, CAT_TAIL_B), legs([[true, 10, 10, 7], [false, 11, 11], [true, 7, 7], [false, 5, 5, 7]])),
  compose(catTorso(), P(0, 0, CAT_TAIL_A), legs([[true, 12, 14], [false, 10, 8], [true, 5, 6], [false, 8, 6]])),
  compose(catTorso(), P(0, 0, CAT_TAIL_B), legs([[true, 10, 10], [false, 11, 11, 7], [true, 7, 7, 7], [false, 5, 5]])),
]
const CAT_RUN: Grid[] = [
  compose(catTorso(1), P(0, 4, CAT_TAIL_RUN), legs([[true, 9, 11, 9, 4], [false, 10, 13, 9, 4], [true, 6, 4, 9, 4], [false, 5, 2, 9, 4]])),
  compose(catTorso(1), P(0, 4, CAT_TAIL_RUN), legs([[true, 8, 8, 9, 4], [false, 9, 9, 9, 4], [true, 7, 7, 9, 4], [false, 6, 6, 9, 4]])),
]
const SIT_BODY: Grid = [
  R(10, 'o'),
  R(9, 'ob'),
  R(8, 'obb'),
  R(7, 'o', 'bbb', 'llll', 'o'),
  R(6, 'o', 'bbbbb', 'obo', 'ff'),
  R(4, 'oo', 'bbbbbb', 'obo', 'ff'),
  R(3, 'o', 'bbbbbbbb', 'obo', 'ff'),
  R(3, 'o', 'bbsss', 'lll', 'olo', 'fo'),
  R(2, 'o'.repeat(15)),
]
const CAT_SIT: Grid[] = [0, 1].map(i =>
  compose(
    P(0, 4, SIT_BODY),
    P(0, 10, i ? [R('oo'), R('obb')] : [R(1, 'o'), R('obb')]),
    P(11, 0, CAT_HEAD),
  ),
)
const CAT_HEAD_SLEEP: Grid = CAT_HEAD.map((r, i) => (i === 3 ? 'bbbbbbbo' : i === 4 ? 'bbbbeebo' : r))
const CAT_CURL: Grid = [
  R(6, 'oooooo'),
  R(4, 'oo', 'bbbbbb', 'oo'),
  R(3, 'o', 'bbbbbbbbbb', 'o'),
  R(2, 'o', 'bbbbbbbbbbbb', 'o'),
  R(1, 'o', 'bbbbbbbbbbbbbbb'),
  R(1, 'o', 'bbbbbbbbbbbbbbb'),
  R(1, 'o', 'bbbbbbbbbbbbbbb'),
  R(1, 'o', 'oooooooooooooooo'),
  R(1, 'o', 'bbbbbbbbbbbbbbbb'),
  R(2, 'o'.repeat(16)),
]
const CAT_SLEEP: Grid[] = [0, 1].map(i =>
  compose(P(0, 3 + i, CAT_CURL.slice(i)), P(12, 5, CAT_HEAD_SLEEP), P(13, 12, [R('lllll')])),
)

// ---------------------------------------------------------------------------
// Dog: long snout with a dark nose and mouth line, floppy dark ear, deep chest,
// tail that wags between high and low.
// ---------------------------------------------------------------------------
const DOG_HEAD: Grid = [
  R(3, 'ooooo'),
  R(1, 'oddbbwbbo'),
  R(1, 'dddbbebbn'),
  R(1, 'dddblllln'),
  R(2, 'odblllmm'),
  R(4, 'ooooo'),
]
const DOG_BODY: Grid = [
  R(4, 'ooooooo'),
  R(3, 'obbbbbbb'),
  R(3, 'obbbbbbb'),
  R(3, 'obbbbbbb'),
  R(3, 'o', 'sssssss', 'lll'),
  R(4, 'oooooooooo'),
]
const dogTorso = (dy = 0): Piece[] => [P(0, 2 + dy, DOG_BODY), P(10, dy, DOG_HEAD)]
const DOG_TAIL_UP: Grid = [R('oo'), R('obo'), R(1, 'obo'), R(1, 'obb')]
const DOG_TAIL_DOWN: Grid = [R('oo'), R('obbb'), R(1, 'ooo')]
const dogTail = (up: boolean, dy = 0): Piece => (up ? P(0, dy, DOG_TAIL_UP) : P(0, 3 + dy, DOG_TAIL_DOWN))

const DOG_WALK: Grid[] = [
  compose(dogTorso(), dogTail(true), legs([[true, 9, 8], [false, 11, 13], [true, 8, 9], [false, 5, 3]])),
  compose(dogTorso(), dogTail(false), legs([[true, 10, 10, 7], [false, 11, 11], [true, 7, 7], [false, 5, 5, 7]])),
  compose(dogTorso(), dogTail(true), legs([[true, 12, 14], [false, 10, 8], [true, 5, 6], [false, 8, 6]])),
  compose(dogTorso(), dogTail(false), legs([[true, 10, 10], [false, 11, 11, 7], [true, 7, 7, 7], [false, 5, 5]])),
]
const DOG_RUN: Grid[] = [
  compose(dogTorso(1), dogTail(false, 1), legs([[true, 9, 11, 9, 4], [false, 10, 13, 9, 4], [true, 6, 4, 9, 4], [false, 5, 2, 9, 4]])),
  compose(dogTorso(1), dogTail(true, 1), legs([[true, 8, 8, 9, 4], [false, 9, 9, 9, 4], [true, 7, 7, 9, 4], [false, 6, 6, 9, 4]])),
]
const DOG_SIT_BODY: Grid = [
  R(9, 'obbb'),
  R(9, 'obbbb'),
  R(8, 'obb', 'llll', 'o'),
  R(7, 'oo', 'bbb', 'obo', 'ff'),
  R(5, 'oo', 'bbbbb', 'obo', 'ff'),
  R(3, 'oo', 'bbsssbb', 'obo', 'ff'),
  R(3, 'o', 'bbbssbbb', 'obo', 'ff'),
  R(3, 'o', 'bbsss', 'lll', 'olo', 'fo'),
  R(2, 'o'.repeat(15)),
]
const DOG_SIT: Grid[] = [true, false].map(up =>
  compose(
    P(0, 4, DOG_SIT_BODY),
    up ? P(0, 8, [R('oo'), R('obo'), R('obb')]) : P(0, 10, [R('oo'), R('obbb')]),
    P(10, 0, DOG_HEAD),
  ),
)
const DOG_SLEEP: Grid[] = [0, 1].map(i =>
  compose(
    P(0, 6, [
      R(3, 'oooooooo'),
      R(2, 'o', 'bbbbbbbbb', 'o'),
      R(1, 'o', 'bbbbbbbbbb', 'ooooooo'),
      R(1, 'o', 'bbbssbbbbb', 'oddbbbbbo'),
      R(1, 'o', 'bbsssssbbb', 'oddbbeebn'),
      R(1, 'o', 'bbbbbbbbbb', 'oddblllmo'),
      R(1, 'o'.repeat(18)),
    ]),
    P(0, i ? 9 : 10, [R('oo')]),
  ),
)

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
