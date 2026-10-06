// The cat's pixel art, by pose. Pure: no `$`, no DOM, no Node.
//
// Round head with pointed ears (pink insides), 2x2 eye with a glint, pink nose, cream
// muzzle; slim body with a gentle back arch and tucked belly; S-curved tail.
import { composeGrid, piece, row } from './pixel-art'
import type { Grid, Piece } from './pixel-art'
import {
  RUN_EXTENDED, RUN_EXTENDED_COLUMNS, RUN_GATHERED, RUN_GATHERED_COLUMNS, WALK_GAITS, WALK_LEG_COLUMNS,
  layerLimbs, withExtraTopRow,
} from './legs'
import type { Gait, LegColumns, LegSpec } from './legs'

const HEAD: Grid = [
  '.u....u.',
  'upo..opu',
  'ubbbbbbk',
  'bbbbwebo',
  'bbbbeebo',
  'bbbllmmn',
  '.oooooo.',
]
const HEAD_X = 11

// ---- Walk and run ----

/** Run body: tall (7 rows), stretched out. */
const BODY: Grid = [
  row(5, 'kuuuuk'),
  row(3, 'ku', 'hhhh', 'bbbbbbbb'),
  row(2, 'o', 'bbbbbbbbbbbb'),
  row(2, 'o', 'bbbbbbbbbbbb'),
  row(2, 'o', 'bbb', 'ssss', 'bbbbb'),
  row(2, 'o', 'bbb', 'oooo', 'bbbbb'),
  row(3, 'ooo', 4, 'ooooo'),
]
// Walk body: shallower (5 rows) and set one row lower so the legs are long and the head
// stands above the back line.
const BODY_WALK: Grid = [
  row(5, 'kuuuuk'),
  row(3, 'ku', 'hhhhhh', 'bbbbb'),
  row(2, 'o', 'bbbbbbbbbbbbb'),
  row(2, 'o', 'bbb', 'ssss', 'bbbb'),
  row(3, 'ooooooooooooo'),
]
/** Run torso, dropped `bodyDrop` rows (the run stride bobs the body down by one). */
const runTorso = (bodyDrop: number): Piece[] => [piece(0, 2 + bodyDrop, BODY), piece(HEAD_X, bodyDrop, HEAD)]
const WALK_TORSO: Piece[] = [piece(0, 3, BODY_WALK), piece(HEAD_X, 0, HEAD)]

const TAIL_WALK_A: Grid = [row(1, 'oo'), row('olbo'), row('obbo'), row('obbo'), row(1, 'obbo'), row(2, 'obbo')]
const TAIL_WALK_B: Grid = [row(2, 'oo'), row(1, 'olbo'), row(1, 'obbo'), row('obbo'), row(1, 'obbo'), row(2, 'obbo')]
const TAIL_RUN_EXTENDED: Grid = [row(1, 'oooo'), row('olbbb'), row(1, 'oooo')]
const TAIL_RUN_GATHERED: Grid = [row(0, 'oo'), row('olbbo'), row(1, 'obbbo'), row(2, 'ooo')]

/**
 * The four legs of a gait, as [near front, near hind, far front, far hind].
 * `hasLongLegs`: near legs start a row higher and are a row longer; far legs start under
 * the belly line.
 */
function legsFor(gait: Gait, bodyDrop: number, columns: LegColumns, hasLongLegs = false): LegSpec[] {
  const nearTop = hasLongLegs ? 7 : 8
  const farTop = hasLongLegs ? nearTop + 1 : nearTop
  const nearShape = (shape: Gait[number]) => (hasLongLegs ? withExtraTopRow(shape) : shape)
  return [
    { kind: 'front', isFar: false, x: columns[0], y: nearTop + bodyDrop, shape: nearShape(gait[0]) },
    { kind: 'hind', isFar: false, x: columns[1], y: nearTop + bodyDrop, shape: nearShape(gait[1]) },
    { kind: 'front', isFar: true, x: columns[2], y: farTop + bodyDrop, shape: gait[2] },
    { kind: 'hind', isFar: true, x: columns[3], y: farTop + bodyDrop, shape: gait[3] },
  ]
}

export const CAT_WALK: Grid[] = WALK_GAITS.map((gait, i) =>
  composeGrid(layerLimbs(legsFor(gait, 0, WALK_LEG_COLUMNS, true), piece(0, 0, i % 2 ? TAIL_WALK_B : TAIL_WALK_A), WALK_TORSO)),
)
export const CAT_RUN: Grid[] = [
  composeGrid(layerLimbs(legsFor(RUN_EXTENDED, 1, RUN_EXTENDED_COLUMNS), piece(0, 4, TAIL_RUN_EXTENDED), runTorso(1))),
  composeGrid(layerLimbs(legsFor(RUN_GATHERED, 1, RUN_GATHERED_COLUMNS), piece(0, 3, TAIL_RUN_GATHERED), runTorso(1))),
]

// ---- Sit: the loaf ----
// A compact bread-loaf body, paws tucked under (just cream toes at the front edge), the
// head up and alert, the tail laid along the side with its tip poking out behind. Frame 2
// blinks, twitches an ear and flicks the tail tip.
const LOAF: Grid = [
  row(5, 'kuuuuuuuk'),
  row(3, 'ku', 'hhhhhhhhh', 'bk'),
  row(2, 'ku', 'bbbbbbbbbbb', 'k'),
  row(2, 'o', 'bbhhhhbbbbbbbbo'),
  row(2, 'o', 'bbsbbbsbbbbbbbo'),
  row(2, 'o', 'ddddddddddbbllo'),
  row(3, 'ooooooooooooo'),
]
const LOAF_TAIL: Grid[] = [
  [row(0, 'oo'), row(0, 'obd'), row(0, 'ooo')],
  [row(0, 'oo'), row(0, 'obo'), row(0, 'obo'), row(0, 'obd'), row(0, 'ooo')],
]
/** The head with eyes shut and one ear twitched. */
const HEAD_BLINK: Grid = HEAD.map((line, i) => (i === 3 ? 'bbbbbbbo' : i === 0 ? '.u......' : i === 1 ? 'upo..ouu' : line))

export const CAT_SIT: Grid[] = [0, 1].map(frameIndex =>
  composeGrid(
    frameIndex ? piece(0, 8, LOAF_TAIL[1]!) : piece(0, 10, LOAF_TAIL[0]!),
    piece(0, 6, LOAF),
    piece(HEAD_X, 1, frameIndex ? HEAD_BLINK : HEAD),
  ),
)

// ---- Sleep ----
// A dome with the tail wrapped round the front: its lighter tip peeks out past the chin.
const HEAD_SLEEP: Grid = [
  '.u....u.',
  'upo..opu',
  'ubbbbbbk',
  'bbbbbebo',
  'bbbbebeo',
  'bbbllmmn',
  '.oooooo.',
]
const CURL: Grid = [
  row(6, 'kuuuk'),
  row(4, 'ku', 'hhhhhh', 'uk'),
  row(2, 'ko', 'bbbbbbbbbbb'),
  row(1, 'ko', 'bbbbbbbbbbbb'),
  row(1, 'o', 'bbsssbbbbbbbbbb'),
  row(1, 'o', 'bbbsssbbbbbbbbb'),
  row(1, 'o', 'bbbbbbbbbbbbbbb'),
]
const TAIL_WRAP: Grid = [row(1, 'o', 'ddddddddddddd', 'bb', 'lll'), row(2, 'ooooooooooooooooo')]

/** Frame 2 breathes out: the dome loses its top row. */
export const CAT_SLEEP: Grid[] = [0, 1].map(frameIndex =>
  composeGrid(
    piece(0, 5 + frameIndex, CURL.slice(frameIndex)),
    piece(12, 5, HEAD_SLEEP),
    piece(0, 11, TAIL_WRAP),
    piece(19, 10, [row('l')]),
  ),
)
