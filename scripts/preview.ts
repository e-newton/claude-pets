// Dev-only: prints every species/color/pose frame with ANSI truecolor half-blocks,
// rendered through the real renderer.
//   npx tsx scripts/preview.ts [cat|dog] [color] [pose]
import { DEFAULT_COLOR, decodeCells, renderBand } from '../plugins/pets/hooks/render'
import type { Overlay } from '../plugins/pets/hooks/render'
import { COLORS, SPRITE_H, SPRITE_W, getFrames } from '../plugins/pets/hooks/sprites'
import type { Pose, Species } from '../plugins/pets/hooks/sprites'

const POSES: Pose[] = ['walk', 'run', 'sit', 'sleep']
const [speciesFilter, colorFilter, poseFilter] = process.argv.slice(2)
const RESET = '\x1b[0m'
const GAP_BETWEEN_FRAMES = 2

/** One terminal cell as an ANSI escape sequence plus its glyph. */
function ansiCell(codePoint: number, foreground: number, background: number): string {
  const rgb = (color: number) => `${(color >> 16) & 255};${(color >> 8) & 255};${color & 255}`
  const fg = foreground === DEFAULT_COLOR ? '\x1b[39m' : `\x1b[38;2;${rgb(foreground)}m`
  const bg = background === DEFAULT_COLOR ? '\x1b[49m' : `\x1b[48;2;${rgb(background)}m`
  return fg + bg + String.fromCodePoint(codePoint)
}

/** Renders frames side by side and returns the terminal lines. */
function renderFrames(frames: ReturnType<typeof getFrames>, overlay: Overlay = null): string[] {
  const columns = frames.length * (SPRITE_W + GAP_BETWEEN_FRAMES)
  const placed = frames.map((frame, i) => ({ frame, x: i * (SPRITE_W + GAP_BETWEEN_FRAMES), facingLeft: false, overlay }))
  const cells = decodeCells(renderBand(columns, placed))
  const lines: string[] = []
  for (let row = 0; row < SPRITE_H / 2; row++) {
    let line = ''
    for (let column = 0; column < columns; column++) {
      const [codePoint, foreground, background] = cells[row * columns + column]!
      line += ansiCell(codePoint, foreground, background)
    }
    lines.push(line + RESET)
  }
  return lines
}

for (const species of ['cat', 'dog'] as Species[]) {
  if (speciesFilter && speciesFilter !== species) continue
  for (const color of COLORS[species]) {
    if (colorFilter && colorFilter !== color) continue
    for (const pose of POSES) {
      if (poseFilter && poseFilter !== pose) continue
      console.log(`${species} ${color} ${pose}`)
      console.log(renderFrames(getFrames(species, color, pose)).join('\n'))
    }
    console.log(`${species} ${color} overlays (heart, zzz)`)
    const heartLines = renderFrames(getFrames(species, color, 'walk').slice(0, 1), 'heart')
    const zzzLines = renderFrames(getFrames(species, color, 'sleep').slice(0, 1), 'zzz')
    console.log(heartLines.map((line, i) => line + '  ' + zzzLines[i]).join('\n'))
    console.log()
  }
}
