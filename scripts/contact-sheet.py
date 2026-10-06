#!/usr/bin/env python3
"""Render a PNG contact sheet of every species x color x pose (plus heart / zzz
overlays) on a dark and a light background.

The pixels come from the real TypeScript renderer (`renderBand` in
plugins/pets/hooks/render.ts), not from a Python port: this script compiles
sprites.ts and render.ts with tsc, has node dump every cell as a grid of 0xRRGGBB
values (None = transparent), and only does the PNG drawing itself. So the sheet shows
exactly what the terminal gets, overlays included.

  python3 scripts/contact-sheet.py [out.png] [scale] [label-filter,...]
      e.g. python3 scripts/contact-sheet.py sheet.png 8 'cat orange,dog brown'
  CELLS=0-3 selects which cells of each row to draw:
      walk 0-3, run 4-5, sit 6-7, sleep 8-9, heart 10-11, zzz 12-13

Needs node and `npx -y -p typescript tsc` (no PIL: the PNG is written by hand).
"""

import json
import os
import struct
import subprocess
import sys
import tempfile
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOOKS_DIR = os.path.join(ROOT, 'plugins/pets/hooks')

OUTPUT_PATH = sys.argv[1] if len(sys.argv) > 1 else 'sheet.png'
SCALE = int(sys.argv[2]) if len(sys.argv) > 2 else 8  # screen pixels per art pixel
LABEL_FILTER = sys.argv[3].split(',') if len(sys.argv) > 3 else None

SPRITE_WIDTH = 20  # mirrors SPRITE_W in the TS; the cell slot is wider to leave a gap
SPRITE_HEIGHT = 16  # mirrors SPRITE_H
CELL_WIDTH = 26 * SCALE  # one sprite slot: SPRITE_WIDTH plus padding for overlays
CELL_HEIGHT = SPRITE_HEIGHT * SCALE + SCALE
DARK_BACKGROUND = (0x1D, 0x1E, 0x24)
LIGHT_BACKGROUND = (0xF1, 0xF1, 0xEE)

# Node script run against the compiled TS: prints a JSON list of
# {label, cells: [pixel grid, ...]}, where a pixel grid is a list of rows of
# 0xRRGGBB-or-null, one pixel per entry (decoded back from the renderer's half-blocks).
NODE_DUMP_SCRIPT = r"""
const { COLORS, getFrames, SPRITE_W, BAND_ROWS } = require('./sprites')
const { renderBand, decodeCells } = require('./render')
const DEFAULT_COLOR = 0x01000000
const UPPER_HALF_BLOCK = 0x2580
const LOWER_HALF_BLOCK = 0x2584
const PADDING = 3

function renderedPixels(frame, facingLeft, overlay) {
  const columns = SPRITE_W + PADDING * 2
  const cells = decodeCells(renderBand(columns, [{ frame, x: PADDING, facingLeft, overlay }]))
  const pixelRows = []
  for (let cellRow = 0; cellRow < BAND_ROWS; cellRow++) {
    for (const isUpperHalf of [true, false]) {
      const pixelRow = []
      for (let column = 0; column < columns; column++) {
        const [codePoint, foreground, background] = cells[cellRow * columns + column]
        let color = null
        if (isUpperHalf) color = codePoint === UPPER_HALF_BLOCK ? foreground : null
        else if (codePoint === UPPER_HALF_BLOCK) color = background === DEFAULT_COLOR ? null : background
        else if (codePoint === LOWER_HALF_BLOCK) color = foreground
        pixelRow.push(color)
      }
      pixelRows.push(pixelRow)
    }
  }
  return pixelRows
}

const sheet = []
for (const species of ['cat', 'dog']) for (const color of COLORS[species]) {
  const cells = []
  for (const pose of ['walk', 'run', 'sit', 'sleep'])
    for (const frame of getFrames(species, color, pose)) cells.push(renderedPixels(frame, false, null))
  const walking = getFrames(species, color, 'walk')[0]
  const sleeping = getFrames(species, color, 'sleep')[0]
  cells.push(
    renderedPixels(walking, false, 'heart'), renderedPixels(walking, true, 'heart'),
    renderedPixels(sleeping, false, 'zzz'), renderedPixels(sleeping, true, 'zzz'),
  )
  sheet.push({ label: species + ' ' + color, cells })
}
console.log(JSON.stringify(sheet))
"""


def dump_sprite_cells():
    """Compile the TS renderer and return its cells as a list of {label, cells}."""
    build_dir = tempfile.mkdtemp()
    subprocess.run(
        [
            'npx',
            '-y',
            '-p',
            'typescript',
            'tsc',
            '--module',
            'commonjs',
            '--target',
            'es2022',
            '--skipLibCheck',
            '--strict',
            '--outDir',
            build_dir,
            os.path.join(HOOKS_DIR, 'sprites.ts'),
            os.path.join(HOOKS_DIR, 'render.ts'),
        ],
        check=True,
        cwd=ROOT,
    )
    dump_path = os.path.join(build_dir, 'dump.js')
    with open(dump_path, 'w') as dump_file:
        dump_file.write(NODE_DUMP_SCRIPT)
    result = subprocess.run(['node', dump_path], check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def select_cells(sheet, spec):
    """Keep only the cells named by a spec like '0-3' or '6,7,8' (see CELLS in the docstring)."""
    keep = []
    for part in spec.split(','):
        first, _, last = part.partition('-')
        keep += range(int(first), int(last or first) + 1)
    for row in sheet:
        row['cells'] = [row['cells'][i] for i in keep]


def draw_sheet(sheet):
    """Paint the sheet twice (dark panel above, light panel below); returns (width, height, rgb bytes)."""
    width = len(sheet[0]['cells']) * CELL_WIDTH + SCALE
    panel_height = len(sheet) * CELL_HEIGHT + SCALE
    height = panel_height * 2
    rgb = bytearray(width * height * 3)
    for panel, background in enumerate([DARK_BACKGROUND, LIGHT_BACKGROUND]):
        for y in range(panel_height):
            start = (panel * panel_height + y) * width * 3
            rgb[start : start + width * 3] = bytes(background) * width
        for row_index, row in enumerate(sheet):
            for cell_index, cell in enumerate(row['cells']):
                for y, pixel_row in enumerate(cell):
                    for x, color in enumerate(pixel_row):
                        if color is None:
                            continue
                        pixel = bytes(((color >> 16) & 255, (color >> 8) & 255, color & 255))
                        left = SCALE // 2 + cell_index * CELL_WIDTH + x * SCALE
                        top = panel * panel_height + SCALE // 2 + row_index * CELL_HEIGHT + y * SCALE
                        for scaled_y in range(SCALE):
                            start = ((top + scaled_y) * width + left) * 3
                            rgb[start : start + SCALE * 3] = pixel * SCALE
    return width, height, rgb


def png_chunk(chunk_type, data):
    chunk = struct.pack('>I', len(data)) + chunk_type + data
    return chunk + struct.pack('>I', zlib.crc32(chunk_type + data) & 0xFFFFFFFF)


def encode_png(width, height, rgb):
    """A truecolor PNG; each scanline is prefixed with filter type 0 (none)."""
    scanlines = b''.join(b'\0' + bytes(rgb[y * width * 3 : (y + 1) * width * 3]) for y in range(height))
    header = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)  # 8-bit RGB
    return (
        b'\x89PNG\r\n\x1a\n'
        + png_chunk(b'IHDR', header)
        + png_chunk(b'IDAT', zlib.compress(scanlines, 6))
        + png_chunk(b'IEND', b'')
    )


def main():
    sheet = dump_sprite_cells()
    cell_spec = os.environ.get('CELLS')
    if cell_spec:
        select_cells(sheet, cell_spec)
    if LABEL_FILTER:
        sheet = [row for row in sheet if row['label'] in LABEL_FILTER]
    width, height, rgb = draw_sheet(sheet)
    with open(OUTPUT_PATH, 'wb') as out:
        out.write(encode_png(width, height, rgb))
    print('wrote', OUTPUT_PATH, width, 'x', height)


main()
