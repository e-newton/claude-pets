// Dev-only: prints every species/color/pose frame with ANSI truecolor half-blocks.
//   npx tsx scripts/preview.ts [cat|dog] [color] [pose]
import { COLORS, SPRITE_H, SPRITE_W, getFrames } from '../plugins/pets/hooks/sprites'
import type { Pose, Species } from '../plugins/pets/hooks/sprites'
import { renderBand } from '../plugins/pets/hooks/render'
import { decodeCells } from '../plugins/pets/hooks/render'

const POSES: Pose[] = ['walk', 'run', 'sit', 'sleep']
const [fSpecies, fColor, fPose] = process.argv.slice(2)
const RESET = '\x1b[0m'

function ansi(code: number, fg: number, bg: number): string {
  const f = fg === 0x01000000 ? '\x1b[39m' : `\x1b[38;2;${(fg >> 16) & 255};${(fg >> 8) & 255};${fg & 255}m`
  const b = bg === 0x01000000 ? '\x1b[49m' : `\x1b[48;2;${(bg >> 16) & 255};${(bg >> 8) & 255};${bg & 255}m`
  return f + b + String.fromCodePoint(code)
}

// Render a row of frames side by side through the real renderer.
function show(frames: ReturnType<typeof getFrames>, overlay: 'heart' | 'zzz' | null = null): string[] {
  const cols = frames.length * (SPRITE_W + 2)
  const placed = frames.map((frame, i) => ({ frame, x: i * (SPRITE_W + 2), facingLeft: false, overlay }))
  const cells = decodeCells(renderBand(cols, placed))
  const lines: string[] = []
  for (let r = 0; r < SPRITE_H / 2; r++) {
    let s = ''
    for (let c = 0; c < cols; c++) {
      const [cp, fg, bg] = cells[r * cols + c]!
      s += ansi(cp, fg, bg)
    }
    lines.push(s + RESET)
  }
  return lines
}

for (const species of ['cat', 'dog'] as Species[]) {
  if (fSpecies && fSpecies !== species) continue
  for (const color of COLORS[species]) {
    if (fColor && fColor !== color) continue
    for (const pose of POSES) {
      if (fPose && fPose !== pose) continue
      console.log(`${species} ${color} ${pose}`)
      console.log(show(getFrames(species, color, pose)).join('\n'))
    }
    console.log(`${species} ${color} overlays (heart, zzz)`)
    const f = getFrames(species, color, 'walk').slice(0, 1)
    const g = getFrames(species, color, 'sleep').slice(0, 1)
    const a = show(f, 'heart'), b = show(g, 'zzz')
    console.log(a.map((l, i) => l + '  ' + b[i]).join('\n'))
    console.log()
  }
}
