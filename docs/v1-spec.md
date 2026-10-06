# claude-pets v1 spec

## Product
- Pixel-art cats and dogs wander in a **band above the prompt** (`ui.render` on `{ component: 'AbovePrompt' }`), **6 terminal rows** tall, full width.
- Rendered with a `Raster` element using half-block glyphs (`▀`, fg = top pixel, bg = bottom pixel), so 1 cell = 1×2 px. Sprites are **16 px wide × 12 px tall** (16 cols × 6 rows); the top 3 px rows of every frame are kept empty as headroom for overlays (heart, z), so the art uses rows 3-11. Original art, defined in code.
- Pets walk back and forth, turn at the band edges, and sometimes stop to sit.
- **Light reactions**:
  - Claude working (between `prompt.submit` and `turn.complete`): pets **run** (faster, run frames).
  - Waiting on the user: normal walk/sit wander.
  - No activity for 2+ minutes: pets **sleep** (sleep frame + a small light-blue "z" above the head).
- **Click to pet**: cut for now (presses carry no coordinates). `/pet pat [name]` remains.
- **Names**: each pet has a name, random from a built-in list or user-given.
- **Color variants**: cat `orange | black | gray | white`, dog `brown | golden | black | white`.

## Commands (one slash command, `/pet`)
- `/pet add <cat|dog> [color] [name]`: adds a pet. Random color/name if omitted. Max 6 pets.
- `/pet remove <name>`, `/pet clear`, `/pet list`
- `/pet hide`, `/pet show`
- `/pet pat [name]`: shows a red 5x4 pixel heart above the head (fallback for clicking).

## Persistence
- Roster `{ id, species, color, name }[]` and the hidden flag live in `$.store` (across sessions). New users start with one random cat.
- Positions and animation state are runtime-only.

## Animation
- Tick about 8 fps with `$.clock.every`, repainting with `$.ui.blit` (no full redraw). Only tick while the band is visible and there is at least one pet.
- When the band is hidden or there are no pets: `next(e)` (draw nothing).

## Module layout (`plugins/pets/hooks/`)
- `sprites.ts`: pixel data + palettes. Pure, no `$`.
- `render.ts`: composes pets into Raster `cells` (base64). Pure, no `$`.
- `sim.ts`: per-tick pet behaviour (position, direction, pose, frame). Pure, seedable RNG.
- `register.tsx`: hooks, commands, store, timer, reactions, click.

### Shared contract (`sprites.ts` / `render.ts` exports)
```ts
export type Species = 'cat' | 'dog'
export type Pose = 'walk' | 'run' | 'sit' | 'sleep'
export const SPRITE_W = 16          // px == columns
export const SPRITE_H = 12          // px == 2 * rows
export const BAND_ROWS = 6
export const COLORS: { cat: readonly string[]; dog: readonly string[] }
/** A frame: SPRITE_H rows × SPRITE_W px, each 0xRRGGBB or null (transparent). Faces RIGHT. */
export type Frame = ReadonlyArray<ReadonlyArray<number | null>>
export function getFrames(species: Species, color: string, pose: Pose): readonly Frame[]

export type Overlay = 'heart' | 'zzz' | null
export type Placed = { frame: Frame; x: number; facingLeft: boolean; overlay: Overlay }
/** Returns Raster `cells` for a columns × BAND_ROWS band. */
export function renderBand(columns: number, pets: readonly Placed[]): string
```
