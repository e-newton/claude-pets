// The dog's pixel art, by pose. Pure: no `$`, no DOM, no Node.
//
// Long snout with a stop (forehead step) and a dark nose, a floppy dark ear hanging from
// the crown, deep chest tapering to a tucked waist, tail held up in a curve.
import { composeGrid, piece, row } from './pixel-art'
import type { Grid, Piece } from './pixel-art'
import {
  RUN_EXTENDED, RUN_EXTENDED_COLUMNS, RUN_GATHERED, RUN_GATHERED_COLUMNS, STAND, WALK_GAITS, WALK_LEG_COLUMNS,
  layerLimbs, legPieces, withExtraTopRow,
} from './legs'
import type { Gait, LegColumns, LegSpec } from './legs'

const HEAD: Grid = [
  '...kuuuk....',
  '..kddbbbk...',
  '.kdddbwek...',
  '.odddbeebbnn',
  '..oddbblllnn',
  '...kobllmmk.',
  '....kooook..',
]
const HEAD_X = 8

// ---- Walk and run ----

const BODY: Grid = [
  row(7, 'kuuuuk'),
  row(3, 'ku', 'hhhh', 'bbbbbbbbb'),
  row(2, 'o', 'bbbbbbbbbbbb'),
  row(2, 'o', 'bbb', 'ssss', 'bbbbb'),
  row(3, 'oooooo', 'bbblll'),
  row(9, 'oooooo'),
  row(9, 'oooooo'),
]
// Walk body: level back, waist tucked in behind a deeper chest.
const BODY_WALK: Grid = [
  row(3, 'kuuuuuuuk'),
  row(2, 'ku', 'hhhhhhhh', 'bbbbb'),
  row(1, 'o', 'bbbbbbbbbbbbbb'),
  row(1, 'o', 'bbbbssssbbbbbbb'),
  row(2, 'oooooooo', 'bbblo'),
  row(10, 'ooooo'),
]
/** Run torso, dropped `bodyDrop` rows (the run stride bobs the body down by one). */
const runTorso = (bodyDrop: number): Piece[] => [piece(0, 2 + bodyDrop, BODY), piece(HEAD_X, bodyDrop, HEAD)]
const WALK_TORSO: Piece[] = [piece(0, 3, BODY_WALK), piece(HEAD_X, 0, HEAD)]

const TAIL_UP: Grid = [row(1, 'oo'), row('olbo'), row('obbo'), row('obbo'), row(1, 'obbo')]
const TAIL_OUT: Grid = [row(0, 'oo'), row('olbbo'), row('obbbo'), row(1, 'oooo')]

/**
 * The four legs of a gait, as [near front, near hind, far front, far hind]. Hind legs
 * start a row higher and are a row longer (the deep chest, the tucked waist).
 */
function legsFor(gait: Gait, bodyDrop: number, columns: LegColumns): LegSpec[] {
  return [
    { kind: 'front', isFar: false, x: columns[0], y: 8 + bodyDrop, shape: gait[0] },
    { kind: 'hind', isFar: false, x: columns[1], y: 7 + bodyDrop, shape: withExtraTopRow(gait[1]) },
    { kind: 'front', isFar: true, x: columns[2], y: 8 + bodyDrop, shape: gait[2] },
    { kind: 'hind', isFar: true, x: columns[3], y: 7 + bodyDrop, shape: withExtraTopRow(gait[3]) },
  ]
}

export const DOG_WALK: Grid[] = WALK_GAITS.map((gait, i) =>
  composeGrid(layerLimbs(legsFor(gait, 0, WALK_LEG_COLUMNS), piece(i % 2, 0, TAIL_UP), WALK_TORSO)),
)
export const DOG_RUN: Grid[] = [
  composeGrid(layerLimbs(legsFor(RUN_EXTENDED, 1, RUN_EXTENDED_COLUMNS), piece(0, 5, TAIL_OUT), runTorso(1))),
  composeGrid(layerLimbs(legsFor(RUN_GATHERED, 1, RUN_GATHERED_COLUMNS), piece(0, 3, TAIL_UP), runTorso(1))),
]

// ---- Sit ----
// Upright: chest up under the head, head over the front paws, a rounded haunch behind.
const SIT_BODY: Grid = [
  row(9, 'kuhbbbllo'),
  row(7, 'kuuhbbbbllo'),
  row(5, 'kuhhhbbbbbllo'),
  row(4, 'o', 'bbbbbbbbbbllo'),
  row(4, 'o', 'bbbbbbbbbbllo'),
  row(4, 'oooooooooooooo'),
]
// Rounded haunch: a shaded oval under the lit back, with the hind paw out along the ground.
const SIT_THIGH: Grid = [row(6, 's', 3, 's'), row(7, 'ssss', 'lll')]
// The tail: lies along the ground, then lifts in a curve (wags).
const SIT_TAIL: Grid[] = [
  [row(2, 'dd'), row(0, 'dddd')],
  [row(1, 'd'), row(1, 'dd'), row(2, 'dd'), row(0, 'dddd')],
]
const FAR_FRONT_PAW: LegSpec = { kind: 'front', isFar: true, x: 10, y: 8, shape: STAND }
const NEAR_FRONT_PAW: LegSpec = { kind: 'front', isFar: false, x: 13, y: 8, shape: STAND }

/** Frame 2 lifts the tail and shows a pink tongue. */
export const DOG_SIT: Grid[] = [0, 1].map(frameIndex =>
  composeGrid(
    piece(0, frameIndex ? 9 : 11, SIT_TAIL[frameIndex]!),
    piece(0, 7, SIT_BODY),
    piece(0, 10, SIT_THIGH),
    legPieces(FAR_FRONT_PAW),
    piece(HEAD_X, 0, HEAD),
    legPieces(NEAR_FRONT_PAW),
    frameIndex ? piece(17, 5, [row('p')]) : [],
  ),
)

// ---- Sleep ----
const HEAD_SLEEP: Grid = [
  '..kuuuuk..',
  '.kddbbbbbk',
  '.dddbccbbn',
  '.dddblllln',
  '..oo.llll.',
]

/** Frame 2 breathes: the back rises a row and the paws shift. */
export const DOG_SLEEP: Grid[] = [0, 1].map(frameIndex =>
  composeGrid(
    piece(
      0,
      4,
      frameIndex
        ? [row(3, 'kuuuuk'), row(1, 'ku', 'hhhhhh', 'uk'), row(0, 'ko', 'bbbbbbbbbk'), row(0, 'o', 'bbbbbbbbbbbk')]
        : [row(), row(3, 'kuuuuk'), row(1, 'ku', 'hhhhhh', 'uk'), row(0, 'ko', 'bbbbbbbbbk')],
    ),
    piece(0, 8, [
      row(0, 'o', 'bbbbbbbbbbbbb'),
      row(0, 'o', 'bbsssbbbbbbbbb'),
      row(0, 'o', 'bsbbbsbbbbbbbb'),
      frameIndex ? row(0, 'o', 'dddddddddbbb') : row(0, 'o', 'dddddddllbbb'),
      row(0, 'oooooooooooo'),
    ]),
    frameIndex ? piece(7, 10, [row('ll')]) : [],
    piece(10, 8, HEAD_SLEEP),
    frameIndex ? piece(11, 8, [row('dd')]) : [],
  ),
)
