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

// Palette keys: . transparent, o outline (dark, under side), u outline on the lit top
// edge, k soft corner pixel (anti-alias), b body, h top highlight, l light (muzzle /
// chest / paws), d dark shade (dog ear, back haunch), e eye, w eye highlight, n nose,
// p pink (inner ear / tongue), s belly / chest shade, f far-side limb, g far paw,
// m mouth line (u, k, h, s, f, g, m are derived: see `withDerived`)
// Rows 0-2 of every frame are EMPTY: that headroom belongs to overlays.
type Palette = { [k: string]: number }
type Grid = readonly string[]

const mix = (a: number, b: number, t: number): number => {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}
// Raw palettes may override any derived key.
const withDerived = (p: { [k: string]: number }): Palette => ({
  u: mix(p.o!, p.b!, 0.45),
  k: mix(p.o!, p.b!, 0.7),
  h: mix(p.b!, p.l!, 0.45),
  s: mix(p.b!, p.d!, 0.55),
  f: mix(p.b!, p.d!, 0.8),
  g: mix(mix(p.b!, p.d!, 0.8), p.o!, 0.4),
  m: mix(p.o!, p.d!, 0.5),
  ...p,
})

const CAT_PALETTES_RAW: { [color: string]: Palette } = {
  orange: { o: 0x7a3a12, b: 0xf0922c, l: 0xffd59a, d: 0xc86a1a, e: 0x1a1a22, w: 0xffffff, n: 0xe8607e, p: 0xf4a0a8 },
  // Black: a dark outline under a body that is only a little lighter, plus a cool rim light on the lit edge.
  black: { o: 0x0e0f14, b: 0x363948, l: 0x555a6e, d: 0x242632, u: 0x7c829c, k: 0x1c1e28, h: 0x4a4e62, s: 0x2a2c38, f: 0x2c2e3b, g: 0x171821, m: 0x171821, e: 0xf2e04a, w: 0xffffff, n: 0xe8607e, p: 0xb86a7c },
  gray: { o: 0x434955, b: 0x9aa1ad, l: 0xd0d5dd, d: 0x757c89, e: 0x1a1a22, w: 0xffffff, n: 0xe8607e, p: 0xf0a8b4 },
  // White: stronger outline + real shade tones so it holds up on a light background.
  white: { o: 0x646b84, b: 0xe9ebf3, l: 0xffffff, d: 0xaeb4c8, s: 0xd0d4e2, f: 0xc0c5d6, g: 0x949ab0, e: 0x23305a, w: 0xffffff, n: 0xf0708c, p: 0xf8b4c0 },
}

const DOG_PALETTES_RAW: { [color: string]: Palette } = {
  brown: { o: 0x40240e, b: 0xa06c3c, l: 0xe0b684, d: 0x6a4020, e: 0x15151c, w: 0xffffff, n: 0x15151c, p: 0xff6f86 },
  golden: { o: 0x7e4e10, b: 0xe8b24c, l: 0xfae2a4, d: 0xb67c20, e: 0x15151c, w: 0xffffff, n: 0x15151c, p: 0xff6f86 },
  black: { o: 0x0e0f14, b: 0x383b4a, l: 0x5a5f74, d: 0x1f212b, u: 0x80869f, k: 0x1c1e28, h: 0x4c5064, s: 0x2b2d3a, f: 0x2d2f3c, g: 0x171821, m: 0x171821, e: 0xe8b030, w: 0xfff2b0, n: 0xc8ccd8, p: 0xff6f86 },
  white: { o: 0x646b84, b: 0xe9ebf3, l: 0xffffff, d: 0xaeb4c8, s: 0xd0d4e2, f: 0xc0c5d6, g: 0x949ab0, e: 0x15151c, w: 0xffffff, n: 0x15151c, p: 0xff6f86 },
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

// ---- Legs ----------------------------------------------------------------
// A leg shape is a list of [dx, row] from the top down: 2 px of fill inside an outline,
// a lighter paw that pokes forward, and a rounded bottom. Hind legs get a haunch that
// swells one px backward. Far legs are the same shape in the muted far tone, no outline.
type Shape = ReadonlyArray<readonly [number, string]>
const STAND: Shape = [[0, 'obbo'], [0, 'obbo'], [0, 'obbo'], [0, 'obllo'], [1, '.ooo']]
const REACH: Shape = [[0, 'obbo'], [0, 'obbo'], [1, 'obbo'], [2, 'obllo'], [3, '.ooo']]
const PUSH: Shape = [[0, 'obbo'], [0, 'obbo'], [-1, 'obbo'], [-2, 'obllo'], [-1, '.ooo']]
/** Knee up, paw tucked forward: 3 rows, so it hangs clear of the ground. */
const SWING: Shape = [[0, 'obbo'], [1, 'obllo'], [1, '.ooo']]
const STRIDE_F: Shape = [[0, 'obbo'], [1, 'obbo'], [2, 'obllo'], [3, '.ooo']]
const STRIDE_B: Shape = [[0, 'obbo'], [-1, 'obbo'], [-2, 'obllo'], [-3, '.ooo']]

const haunch = (s: Shape): Shape => s.map(([dx, r], i) => (i < 2 && r === 'obbo' ? ([dx - 1, 'obbbo'] as const) : ([dx, r] as const)))
const far = (s: Shape): Shape =>
  s.map(([dx, r], i) => [dx, i === s.length - 1 ? r.replace(/[ol]/g, 'g') : r.replace(/o/g, '.').replace(/[bl]/g, 'f')] as const)
/** A row longer at the top: the dog's chest hangs deeper than its waist. */
const longer = (s: Shape): Shape => [s[0]!, ...s]

type LegSpec = [kind: 'F' | 'H', far: boolean, x: number, shape: Shape, y: number]
function leg([kind, isFar, x, shape, y]: LegSpec): Piece[] {
  let s = kind === 'H' ? haunch(shape) : shape
  if (isFar) s = far(s)
  return s.map(([dx, r], i) => P(x + dx, y + i, [r]))
}
/** Far legs go behind the torso, near legs over it (a leg top replaces the belly outline). */
const withLegs = (specs: LegSpec[], tail: Piece, torso: Piece[]): Piece[] => [
  tail,
  ...specs.filter(s => s[1]).flatMap(leg),
  ...torso,
  ...specs.filter(s => !s[1]).flatMap(leg),
]
/** A gait: [near front, near hind, far front, far hind] shapes at body drop `dy`. */
type Gait = [Shape, Shape, Shape, Shape]
function catLegs(g: Gait, dy: number, xs: [number, number, number, number]): LegSpec[] {
  return [['F', false, xs[0], g[0], 8 + dy], ['H', false, xs[1], g[1], 8 + dy], ['F', true, xs[2], g[2], 8 + dy], ['H', true, xs[3], g[3], 8 + dy]]
}
function dogLegs(g: Gait, dy: number, xs: [number, number, number, number]): LegSpec[] {
  return [['F', false, xs[0], g[0], 8 + dy], ['H', false, xs[1], longer(g[1]), 7 + dy], ['F', true, xs[2], g[2], 8 + dy], ['H', true, xs[3], longer(g[3]), 7 + dy]]
}
const WALK_XS: [number, number, number, number] = [11, 3, 8, 6]
// Four-beat walk, facing right. A foot's cycle is REACH (planted ahead) -> STAND (under the
// body) -> PUSH (planted behind) -> SWING (lifted, carried forward): while planted it slides
// LEFT relative to the body, which is what makes the body travel right. Do not reorder.
const WALK_GAITS: Gait[] = [
  [REACH, PUSH, PUSH, REACH],
  [STAND, SWING, SWING, STAND],
  [PUSH, REACH, REACH, PUSH],
  [SWING, STAND, STAND, SWING],
]
const RUN_EXT: Gait = [STRIDE_F, STRIDE_B, STRIDE_F, STRIDE_B]
const RUN_TUCK: Gait = [SWING, SWING, SWING, SWING]

// ---------------------------------------------------------------------------
// Cat: round head with pointed ears (pink insides), 2x2 eye with a glint, pink
// nose, cream muzzle; slim body with a gentle back arch and tucked belly; S tail.
// ---------------------------------------------------------------------------
const CAT_HEAD: Grid = [
  '.u....u.',
  'upo..opu',
  'ubbbbbbk',
  'bbbbwebo',
  'bbbbeebo',
  'bbbllmmn',
  '.oooooo.',
]
const CAT_BODY: Grid = [
  R(5, 'kuuuuk'),
  R(3, 'ku', 'hhhh', 'bbbbbbbb'),
  R(2, 'o', 'bbbbbbbbbbbb'),
  R(2, 'o', 'bbbbbbbbbbbb'),
  R(2, 'o', 'bbb', 'ssss', 'bbbbb'),
  R(2, 'o', 'bbb', 'oooo', 'bbbbb'),
  R(3, 'ooo', 4, 'ooooo'),
]
const catTorso = (dy = 0): Piece[] => [P(0, 2 + dy, CAT_BODY), P(11, dy, CAT_HEAD)]
const CAT_TAIL_A: Grid = [R(1, 'oo'), R('olbo'), R('obbo'), R('obbo'), R(1, 'obbo'), R(2, 'obbo')]
const CAT_TAIL_B: Grid = [R(2, 'oo'), R(1, 'olbo'), R(1, 'obbo'), R('obbo'), R(1, 'obbo'), R(2, 'obbo')]
const CAT_TAIL_RUN_A: Grid = [R(1, 'oooo'), R('olbbb'), R(1, 'oooo')]
const CAT_TAIL_RUN_B: Grid = [R(0, 'oo'), R('olbbo'), R(1, 'obbbo'), R(2, 'ooo')]

const CAT_WALK: Grid[] = WALK_GAITS.map((g, i) =>
  compose(withLegs(catLegs(g, 0, WALK_XS), P(0, 0, i % 2 ? CAT_TAIL_B : CAT_TAIL_A), catTorso())),
)
const CAT_RUN: Grid[] = [
  compose(withLegs(catLegs(RUN_EXT, 1, [11, 6, 8, 8]), P(0, 4, CAT_TAIL_RUN_A), catTorso(1))),
  compose(withLegs(catLegs(RUN_TUCK, 0, [10, 5, 7, 9]), P(0, 1, CAT_TAIL_RUN_B), catTorso(0))),
]

// ---- Cat sit ----
// Upright and seen from the side: round haunch, narrow chest with a cream ruff, two front
// legs (the far one muted), tail curling on the ground. Frame 2 blinks and flicks the tail.
const CAT_SIT_BODY: Grid = [
  R(10, 'kubbbllo'),
  R(8, 'kuhbbbbllo'),
  R(5, 'kuhbbbbbbbllo'),
  R(3, 'kubbbbbbbbbbllo'),
  R(2, 'kobbbbbbbbbbbllo'),
  R(3, 'oooooooooo'),
]
const THIGH: Grid = [R(7, 'hhh'), R(5, 's', 4, 's'), R(6, 'sssss')]
const CAT_SIT_TAIL: Grid[] = [
  [R(0, 'oo'), R(0, 'lbo'), R(0, 'obbo'), R(1, 'ooo')],
  [R(), R(), R(0, 'ooo'), R(0, 'lbbo')],
]
const CAT_HEAD_BLINK: Grid = CAT_HEAD.map((r, i) => (i === 3 ? 'bbbbbbbo' : r))
const CAT_SIT: Grid[] = [0, 1].map(i =>
  compose(
    i ? P(0, 10, CAT_SIT_TAIL[1]!) : P(0, 9, CAT_SIT_TAIL[0]!),
    P(0, 7, CAT_SIT_BODY),
    P(4, 9, THIGH),
    leg(['F', true, 11, STAND, 8]),
    P(11, 0, i ? CAT_HEAD_BLINK : CAT_HEAD),
    leg(['F', false, 14, STAND, 8]),
  ),
)

// ---- Cat sleep ----
// A dome with the tail wrapped round the front: its lighter tip peeks out past the chin.
const CAT_HEAD_SLEEP: Grid = [
  '.u....u.',
  'upo..opu',
  'ubbbbbbk',
  'bbbbbebo',
  'bbbbebeo',
  'bbbllmmn',
  '.oooooo.',
]
const CAT_CURL: Grid = [
  R(6, 'kuuuk'),
  R(4, 'ku', 'hhhhhh', 'uk'),
  R(2, 'ko', 'bbbbbbbbbbb'),
  R(1, 'ko', 'bbbbbbbbbbbb'),
  R(1, 'o', 'bbsssbbbbbbbbbb'),
  R(1, 'o', 'bbbsssbbbbbbbbb'),
  R(1, 'o', 'bbbbbbbbbbbbbbb'),
]
const CAT_TAIL_WRAP: Grid = [R(1, 'o', 'ddddddddddddd', 'bb', 'lll'), R(2, 'ooooooooooooooooo')]
const CAT_SLEEP: Grid[] = [0, 1].map(i =>
  compose(P(0, 4 + i, CAT_CURL.slice(i)), P(12, 4, CAT_HEAD_SLEEP), P(0, 11, CAT_TAIL_WRAP), P(19, 10, [R('l')])),
)

// ---------------------------------------------------------------------------
// Dog: long snout with a dark nose and mouth line, floppy dark ear, deep chest
// tapering to the waist, tail that wags between high and out.
// ---------------------------------------------------------------------------
const DOG_HEAD: Grid = [
  '...kuuuk..',
  '.kddbbbbbk',
  '.dddwebbbn',
  '.dddeelllln',
  '..odblllmm',
  '...kooook.',
]
const DOG_BODY: Grid = [
  R(7, 'kuuuuk'),
  R(3, 'ku', 'hhhh', 'bbbbbbbbb'),
  R(2, 'o', 'bbbbbbbbbbbb'),
  R(2, 'o', 'bbbbbbbbbbbb'),
  R(2, 'o', 'bbb', 'ssss', 'bbbbb'),
  R(3, 'oooooo', 'bbblll'),
  R(9, 'oooooo'),
]
const dogTorso = (dy = 0): Piece[] => [P(0, 2 + dy, DOG_BODY), P(10, dy, DOG_HEAD)]
const DOG_TAIL_UP: Grid = [R(1, 'oo'), R('olbo'), R('obbo'), R('obbo'), R(1, 'obbo')]
const DOG_TAIL_OUT: Grid = [R(0, 'oo'), R('olbbo'), R('obbbo'), R(1, 'oooo')]

const DOG_WALK: Grid[] = WALK_GAITS.map((g, i) =>
  compose(withLegs(dogLegs(g, 0, WALK_XS), i % 2 ? P(0, 4, DOG_TAIL_OUT) : P(0, 0, DOG_TAIL_UP), dogTorso())),
)
const DOG_RUN: Grid[] = [
  compose(withLegs(dogLegs(RUN_EXT, 1, [11, 6, 8, 8]), P(0, 5, DOG_TAIL_OUT), dogTorso(1))),
  compose(withLegs(dogLegs(RUN_TUCK, 0, [10, 5, 7, 9]), P(0, 1, DOG_TAIL_UP), dogTorso(0))),
]

// ---- Dog sit ----
const DOG_HEAD_BIG: Grid = [
  '...kuuuuk..',
  '.kddbbbbbbk',
  '.dddbwebbbn',
  '.dddbeellln',
  '.dddbblllmm',
  '...kbbbbbok',
  '....kooook.',
]
const DOG_SIT_BODY: Grid = [
  R(9, 'kubblllo'),
  R(8, 'kuhbbblllo'),
  R(5, 'kuhbbbbbbblllo'),
  R(3, 'kubbbbbbbbbbblllo'),
  R(2, 'kobbbbbbbbbbbblllo'),
  R(3, 'oooooooooo'),
]
const DOG_SIT_TAIL: Grid[] = [
  [R(1, 'oo'), R('olbo'), R('obbo'), R('obbo'), R(1, 'obbo'), R(1, 'oooo')],
  [R(), R(), R(), R(0, 'oo'), R('olbbo'), R(1, 'oooo')],
]
const DOG_SIT: Grid[] = [0, 1].map(i =>
  compose(
    i ? P(0, 7, DOG_SIT_TAIL[1]!) : P(0, 6, DOG_SIT_TAIL[0]!),
    P(0, 7, DOG_SIT_BODY),
    P(4, 9, THIGH),
    leg(['F', true, 11, STAND, 8]),
    P(9, 0, DOG_HEAD_BIG),
    leg(['F', false, 14, STAND, 8]),
    i ? P(17, 5, [R('p')]) : [],
  ),
)

// ---- Dog sleep ----
const DOG_HEAD_SLEEP: Grid = [
  '..kuuuuk..',
  '.kddbbbbbk',
  '.dddbeebbn',
  '.dddblllln',
  '..oo.llll.',
]
const DOG_SLEEP: Grid[] = [0, 1].map(i =>
  compose(
    P(0, 4, i
      ? [R(3, 'kuuuuk'), R(1, 'ku', 'hhhhhh', 'uk'), R(0, 'ko', 'bbbbbbbbbk'), R(0, 'o', 'bbbbbbbbbbbk')]
      : [R(), R(3, 'kuuuuk'), R(1, 'ku', 'hhhhhh', 'uk'), R(0, 'ko', 'bbbbbbbbbk')]),
    P(0, 8, [
      R(0, 'o', 'bbbbbbbbbbbbb'),
      R(0, 'o', 'bbsssbbbbbbbbb'),
      R(0, 'o', 'bsbbbsbbbbbbbb'),
      i ? R(0, 'o', 'dddddddddbbb') : R(0, 'o', 'dddddddllbbb'),
      R(0, 'oooooooooooo'),
    ]),
    i ? P(7, 10, [R('ll')]) : [],
    P(10, 8, DOG_HEAD_SLEEP),
    i ? P(11, 8, [R('dd')]) : [],
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
