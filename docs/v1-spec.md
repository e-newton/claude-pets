# claude-pets v1 spec

## Product
- Pixel-art cats and dogs wander in a **band above the prompt** (`ui.render` on `{ component: 'AbovePrompt' }`), **4 terminal rows** tall, full width.
- Rendered with a `Raster` element using half-block glyphs (`▀`, fg = top pixel, bg = bottom pixel), so 1 cell = 1×2 px. Sprites are **12 px wide × 8 px tall** (12 cols × 4 rows). Original art, defined in code.
- Pets walk back and forth, turn at the band edges, and sometimes stop to sit.
- **Light reactions**:
  - Claude working (between `prompt.submit` and `turn.complete`): pets **run** (faster, run frames).
  - Waiting on the user: normal walk/sit wander.
  - No activity for 2+ minutes: pets **sleep** (sleep frame + small "z" pixels).
- **Click to pet**: pressing a pet shows a heart above it for ~1.5s. Raster has no `onPress`, so use whatever the API allows (e.g. wrapping it in a pressable element, or per-pet buttons). If nothing works, fall back to `/pet pat [name]`.
- **Names**: each pet has a name, random from a built-in list or user-given.
- **Color variants**: cat `orange | black | gray | white`, dog `brown | golden | black | white`.

## Commands (one slash command, `/pet`)
- `/pet add <cat|dog> [color] [name]`: adds a pet. Random color/name if omitted. Max 6 pets.
- `/pet remove <name>`, `/pet clear`, `/pet list`
- `/pet hide`, `/pet show`
- `/pet pat [name]`: shows a heart (fallback for clicking).

## Persistence
- Roster `{ id, species, color, name }[]` and the hidden flag live in `$.store` (across sessions). New users start with one random cat.
- Positions and animation state are runtime-only.

## Animation
- Tick about 8 fps with `$.clock.every`, repainting with `$.ui.blit` (no full redraw). Only tick while the band is visible and there is at least one pet.
- When the band is hidden or there are no pets: `next(e)` (draw nothing).

## Module layout (`plugins/claude-pets/hooks/`)
- `sprites.ts`: pixel data + palettes. Pure, no `$`.
- `render.ts`: composes pets into Raster `cells` (base64). Pure, no `$`.
- `sim.ts`: per-tick pet behaviour (position, direction, pose, frame). Pure, seedable RNG.
- `register.tsx`: hooks, commands, store, timer, reactions, click.

### Shared contract (`sprites.ts` / `render.ts` exports)
```ts
export type Species = 'cat' | 'dog'
export type Pose = 'walk' | 'run' | 'sit' | 'sleep'
export const SPRITE_W = 12          // px == columns
export const SPRITE_H = 8           // px == 2 * rows
export const BAND_ROWS = 4
export const COLORS: { cat: readonly string[]; dog: readonly string[] }
/** A frame: SPRITE_H rows × SPRITE_W px, each 0xRRGGBB or null (transparent). Faces RIGHT. */
export type Frame = ReadonlyArray<ReadonlyArray<number | null>>
export function getFrames(species: Species, color: string, pose: Pose): readonly Frame[]

export type Overlay = 'heart' | 'zzz' | null
export type Placed = { frame: Frame; x: number; facingLeft: boolean; overlay: Overlay }
/** Returns Raster `cells` for a columns × BAND_ROWS band. */
export function renderBand(columns: number, pets: readonly Placed[]): string
```
