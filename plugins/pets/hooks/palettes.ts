// Colour palettes for the pets. Pure: no `$`, no DOM, no Node.
//
// Each palette gives a name to every colour the pixel art can use (see PIXEL_LEGEND in
// pixel-art.ts for the character that stands for each). Authors only pick the base
// colours; the in-between shades are derived so the variants stay consistent.

/** Every colour a pixel of the art can take, as 0xRRGGBB. */
export type Palette = {
  /** Dark line around the body, on the under side. */
  outline: number
  /** Outline on the lit top edge: much closer to the body colour. */
  outlineLit: number
  /** Soft corner pixel that rounds off a silhouette (anti-aliasing). */
  softCorner: number
  body: number
  /** Top-of-back highlight. */
  highlight: number
  /** Muzzle, chest and paws. */
  light: number
  /** Dark shade: dog ear, back haunch, cat tail wrap. */
  dark: number
  eye: number
  eyeGlint: number
  nose: number
  /** Inner ear and tongue. */
  pink: number
  /** Belly and chest shade. */
  shade: number
  /** Limbs on the far side of the body: muted so they recede. */
  farLimb: number
  farPaw: number
  /** Mouth line. */
  mouth: number
}

/** The colours every palette must supply; the rest are derived (or overridden). */
type BaseColors = Pick<Palette, 'outline' | 'body' | 'light' | 'dark' | 'eye' | 'eyeGlint' | 'nose' | 'pink'>
type PaletteSpec = BaseColors & Partial<Palette>

/** Blend two 0xRRGGBB colours channel by channel: `amount` 0 gives `from`, 1 gives `to`. */
function mixColors(from: number, to: number, amount: number): number {
  const channel = (shift: number) =>
    Math.round(((from >> shift) & 255) * (1 - amount) + ((to >> shift) & 255) * amount)
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

/** Fill in the shades a spec leaves out; anything the spec states explicitly wins. */
function completePalette(spec: PaletteSpec): Palette {
  const farLimb = mixColors(spec.body, spec.dark, 0.8)
  return {
    outlineLit: mixColors(spec.outline, spec.body, 0.45),
    softCorner: mixColors(spec.outline, spec.body, 0.7),
    highlight: mixColors(spec.body, spec.light, 0.45),
    shade: mixColors(spec.body, spec.dark, 0.55),
    farLimb,
    farPaw: mixColors(farLimb, spec.outline, 0.4),
    mouth: mixColors(spec.outline, spec.dark, 0.5),
    ...spec,
  }
}

function completeAll(specs: Record<string, PaletteSpec>): Record<string, Palette> {
  return Object.fromEntries(Object.entries(specs).map(([color, spec]) => [color, completePalette(spec)]))
}

const CAT_PALETTES: Record<string, Palette> = completeAll({
  orange: { outline: 0x7a3a12, body: 0xf0922c, light: 0xffd59a, dark: 0xc86a1a, eye: 0x1a1a22, eyeGlint: 0xffffff, nose: 0xe8607e, pink: 0xf4a0a8 },
  // Black: a dark outline under a body that is only a little lighter, plus a cool rim light on the lit edge.
  black: {
    outline: 0x0e0f14, body: 0x363948, light: 0x555a6e, dark: 0x242632,
    outlineLit: 0x7c829c, softCorner: 0x1c1e28, highlight: 0x4a4e62, shade: 0x2a2c38,
    farLimb: 0x2c2e3b, farPaw: 0x171821, mouth: 0x171821,
    eye: 0xf2e04a, eyeGlint: 0xffffff, nose: 0xe8607e, pink: 0xb86a7c,
  },
  gray: { outline: 0x434955, body: 0x9aa1ad, light: 0xd0d5dd, dark: 0x757c89, eye: 0x1a1a22, eyeGlint: 0xffffff, nose: 0xe8607e, pink: 0xf0a8b4 },
  // White: stronger outline + real shade tones so it holds up on a light background.
  white: {
    outline: 0x646b84, body: 0xe9ebf3, light: 0xffffff, dark: 0xaeb4c8,
    shade: 0xd0d4e2, farLimb: 0xc0c5d6, farPaw: 0x949ab0,
    eye: 0x23305a, eyeGlint: 0xffffff, nose: 0xf0708c, pink: 0xf8b4c0,
  },
})

const DOG_PALETTES: Record<string, Palette> = completeAll({
  brown: { outline: 0x40240e, body: 0xa06c3c, light: 0xe0b684, dark: 0x6a4020, eye: 0x15151c, eyeGlint: 0xffffff, nose: 0x15151c, pink: 0xff6f86 },
  golden: { outline: 0x7e4e10, body: 0xe8b24c, light: 0xfae2a4, dark: 0xb67c20, eye: 0x15151c, eyeGlint: 0xffffff, nose: 0x15151c, pink: 0xff6f86 },
  black: {
    outline: 0x0e0f14, body: 0x383b4a, light: 0x5a5f74, dark: 0x1f212b,
    outlineLit: 0x80869f, softCorner: 0x1c1e28, highlight: 0x4c5064, shade: 0x2b2d3a,
    farLimb: 0x2d2f3c, farPaw: 0x171821, mouth: 0x171821,
    eye: 0xe8b030, eyeGlint: 0xfff2b0, nose: 0xc8ccd8, pink: 0xff6f86,
  },
  white: {
    outline: 0x646b84, body: 0xe9ebf3, light: 0xffffff, dark: 0xaeb4c8,
    shade: 0xd0d4e2, farLimb: 0xc0c5d6, farPaw: 0x949ab0,
    eye: 0x15151c, eyeGlint: 0xffffff, nose: 0x15151c, pink: 0xff6f86,
  },
})

export const PALETTES = { cat: CAT_PALETTES, dog: DOG_PALETTES }

/** The colour names offered to users, first one being the default. */
export const COLORS: { cat: readonly string[]; dog: readonly string[] } = {
  cat: ['orange', 'black', 'gray', 'white'],
  dog: ['brown', 'golden', 'black', 'white'],
}
