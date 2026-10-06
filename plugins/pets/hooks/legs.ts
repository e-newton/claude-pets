// Leg shapes and gaits shared by the cat and the dog. Pure: no `$`, no DOM, no Node.
import { piece } from './pixel-art'
import type { Piece } from './pixel-art'

/**
 * A leg shape is a list of [xOffset, row] from the top down: 2 px of fill inside an
 * outline, a lighter paw that pokes forward, and a rounded bottom. The offset shifts the
 * row sideways, which is what angles the leg.
 */
export type LegShape = ReadonlyArray<readonly [xOffset: number, row: string]>

export const STAND: LegShape = [[0, 'obbo'], [0, 'obbo'], [0, 'obbo'], [0, 'obllo'], [1, '.ooo']]
export const REACH: LegShape = [[0, 'obbo'], [0, 'obbo'], [1, 'obbo'], [2, 'obllo'], [3, '.ooo']]
export const PUSH: LegShape = [[0, 'obbo'], [0, 'obbo'], [-1, 'obbo'], [-2, 'obllo'], [-1, '.ooo']]
/** Knee up, paw tucked forward: 3 rows, so it hangs clear of the ground. */
export const SWING: LegShape = [[0, 'obbo'], [1, 'obllo'], [1, '.ooo']]
export const STRIDE_FORWARD: LegShape = [[0, 'obbo'], [1, 'obbo'], [2, 'obllo'], [3, '.ooo']]
export const STRIDE_BACK: LegShape = [[0, 'obbo'], [-1, 'obbo'], [-2, 'obllo'], [-3, '.ooo']]
/** Gathered stride: the paws come together under the body but stay near the ground. */
export const GATHER: LegShape = [[0, 'obbo'], [0, 'obbo'], [1, 'obllo'], [1, '.ooo']]

/** Hind legs get a haunch that swells one px backward over their top two rows. */
const withHaunch = (shape: LegShape): LegShape =>
  shape.map(([xOffset, legRow], i) =>
    i < 2 && legRow === 'obbo' ? ([xOffset - 1, 'obbbo'] as const) : ([xOffset, legRow] as const),
  )

/**
 * The same shape in the muted far-side tones, without an outline: the fill becomes
 * `farLimb` ('f'), and the paw and rounded bottom become `farPaw` ('g').
 */
const asFarLeg = (shape: LegShape): LegShape =>
  shape.map(
    ([xOffset, legRow], i) =>
      [
        xOffset,
        i === shape.length - 1 ? legRow.replace(/[ol]/g, 'g') : legRow.replace(/o/g, '.').replace(/[bl]/g, 'f'),
      ] as const,
  )

/** One row longer at the top: the dog's chest hangs deeper than its waist. */
export const withExtraTopRow = (shape: LegShape): LegShape => [shape[0]!, ...shape]

export type LegSpec = {
  kind: 'front' | 'hind'
  isFar: boolean
  /** Column of the leg's top-left corner, before the shape's own offsets. */
  x: number
  /** Row of the leg's top. */
  y: number
  shape: LegShape
}

/** A leg as one single-row piece per shape row. */
export function legPieces({ kind, isFar, x, y, shape }: LegSpec): Piece[] {
  let drawn = kind === 'hind' ? withHaunch(shape) : shape
  if (isFar) drawn = asFarLeg(drawn)
  return drawn.map(([xOffset, legRow], i) => piece(x + xOffset, y + i, [legRow]))
}

/** Far legs go behind the torso, near legs over it (a leg top replaces the belly outline). */
export const layerLimbs = (legs: LegSpec[], tail: Piece, torso: Piece[]): Piece[] => [
  tail,
  ...legs.filter(leg => leg.isFar).flatMap(legPieces),
  ...torso,
  ...legs.filter(leg => !leg.isFar).flatMap(legPieces),
]

/** A gait frame: the shapes of the [near front, near hind, far front, far hind] legs. */
export type Gait = [LegShape, LegShape, LegShape, LegShape]
/** Leg columns, in the same [near front, near hind, far front, far hind] order. */
export type LegColumns = [number, number, number, number]

export const WALK_LEG_COLUMNS: LegColumns = [11, 3, 8, 6]

// Four-beat walk, facing right. A foot's cycle is REACH (planted ahead) -> STAND (under the
// body) -> PUSH (planted behind) -> SWING (lifted, carried forward): while planted it slides
// LEFT relative to the body, which is what makes the body travel right. Do not reorder.
export const WALK_GAITS: Gait[] = [
  [REACH, PUSH, PUSH, REACH],
  [STAND, SWING, SWING, STAND],
  [PUSH, REACH, REACH, PUSH],
  [SWING, STAND, STAND, SWING],
]
export const RUN_EXTENDED: Gait = [STRIDE_FORWARD, STRIDE_BACK, STRIDE_FORWARD, STRIDE_BACK]
export const RUN_GATHERED: Gait = [GATHER, GATHER, GATHER, GATHER]
export const RUN_EXTENDED_COLUMNS: LegColumns = [12, 5, 9, 7]
export const RUN_GATHERED_COLUMNS: LegColumns = [10, 6, 8, 8]
