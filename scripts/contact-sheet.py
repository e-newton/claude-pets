#!/usr/bin/env python3
"""Render a PNG contact sheet of every species x color x pose (plus heart / zzz
overlays) on a dark and a light background, going through the real renderBand.

  python3 scripts/contact-sheet.py [out.png] [scale] [label-filter,...]   e.g. 'cat orange,dog brown'

Needs node and `npx -y -p typescript tsc` (no PIL: the PNG is written by hand).
"""
import json, os, struct, subprocess, sys, tempfile, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else 'sheet.png'
SCALE = int(sys.argv[2]) if len(sys.argv) > 2 else 8
ONLY = sys.argv[3].split(',') if len(sys.argv) > 3 else None

DUMP = r"""
const { COLORS, getFrames } = require('./sprites')
const { renderBand, decodeCells } = require('./render')
const SW = 16, SH = 12, ROWS = 6, PAD = 2
function pixels(frame, facingLeft, overlay) {
  const cols = SW + PAD * 2
  const cells = decodeCells(renderBand(cols, [{ frame, x: PAD, facingLeft, overlay }]))
  const out = []
  for (let r = 0; r < ROWS; r++) for (const half of [1, 2]) {
    const row = []
    for (let c = 0; c < cols; c++) {
      const [cp, fg, bg] = cells[r * cols + c]
      let v = null
      if (half === 1) v = cp === 0x2580 ? fg : null
      else v = cp === 0x2580 ? (bg === 0x01000000 ? null : bg) : cp === 0x2584 ? fg : null
      row.push(v)
    }
    out.push(row)
  }
  return out
}
const res = []
for (const sp of ['cat', 'dog']) for (const color of COLORS[sp]) {
  const cells = []
  for (const pose of ['walk', 'run', 'sit', 'sleep'])
    for (const f of getFrames(sp, color, pose)) cells.push(pixels(f, false, null))
  const w = getFrames(sp, color, 'walk')[0], z = getFrames(sp, color, 'sleep')[0]
  cells.push(pixels(w, false, 'heart'), pixels(w, true, 'heart'), pixels(z, false, 'zzz'), pixels(z, true, 'zzz'))
  res.push({ label: sp + ' ' + color, cells })
}
console.log(JSON.stringify(res))
"""

tmp = tempfile.mkdtemp()
hooks = os.path.join(ROOT, 'plugins/pets/hooks')
subprocess.run(['npx', '-y', '-p', 'typescript', 'tsc', '--module', 'commonjs', '--target', 'es2022',
                '--skipLibCheck', '--strict', '--outDir', tmp,
                os.path.join(hooks, 'sprites.ts'), os.path.join(hooks, 'render.ts')], check=True, cwd=ROOT)
open(os.path.join(tmp, 'dump.js'), 'w').write(DUMP)
data = json.loads(subprocess.run(['node', os.path.join(tmp, 'dump.js')], check=True, capture_output=True, text=True).stdout)

if ONLY: data = [r for r in data if r['label'] in ONLY]
S = SCALE
CW, CH = 20 * S, 12 * S + S
BGS = [(0x1d, 0x1e, 0x24), (0xf1, 0xf1, 0xee)]
ncells = len(data[0]['cells'])
W = ncells * CW + S
panel_h = len(data) * CH + S
H = panel_h * 2
buf = bytearray(W * H * 3)
for p, bg in enumerate(BGS):
    for y in range(panel_h):
        o = (p * panel_h + y) * W * 3
        buf[o:o + W * 3] = bytes(bg) * W
    for ri, row in enumerate(data):
        for ci, cell in enumerate(row['cells']):
            for y, line in enumerate(cell):
                for x, v in enumerate(line):
                    if v is None: continue
                    rgb = bytes(((v >> 16) & 255, (v >> 8) & 255, v & 255))
                    X0 = S // 2 + ci * CW + x * S
                    Y0 = p * panel_h + S // 2 + ri * CH + y * S
                    for yy in range(S):
                        o = ((Y0 + yy) * W + X0) * 3
                        buf[o:o + S * 3] = rgb * S

def chunk(t, d):
    c = struct.pack('>I', len(d)) + t + d
    return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
raw = b''.join(b'\0' + bytes(buf[y * W * 3:(y + 1) * W * 3]) for y in range(H))
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b'')
open(OUT, 'wb').write(png)
print('wrote', OUT, W, 'x', H)
