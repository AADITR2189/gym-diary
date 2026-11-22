"""Build the Gym Diary master logo files: symbol, small-size symbol, wordmark (text converted to outlines) and lockups."""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONT, OUT = sys.argv[1], sys.argv[2]
T = '<title>Gym Diary</title>'

def rr(x, y, w, h, r):
    return (f"M {x+r} {y} H {x+w-r} A {r} {r} 0 0 1 {x+w} {y+r} V {y+h-r} A {r} {r} 0 0 1 {x+w-r} {y+h} "
            f"H {x+r} A {r} {r} 0 0 1 {x} {y+h-r} V {y+r} A {r} {r} 0 0 1 {x+r} {y} Z")

def dot(cx, cy, d):
    return f"M {cx-d} {cy} A {d} {d} 0 1 0 {cx+d} {cy} A {d} {d} 0 1 0 {cx-d} {cy} Z"

LOGGED = [[0, 0, 1], [0, 1, 1], [1, 1, 1]]  # the staircase of logged days, top row first

def symbol_path(o, s, g, r, d, dx=0, dy=0):
    parts = []
    for row in range(3):
        for col in range(3):
            x, y = dx + o + col * (s + g), dy + o + row * (s + g)
            parts.append(rr(x, y, s, s, r) if LOGGED[row][col] else dot(x + s / 2, y + s / 2, d))
    return ' '.join(parts)

def svg(w, h, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}">\n  {T}\n  {body}\n</svg>\n'

# Symbol on the 256 grid: 3×3 cells of 56 with 16 gaps, 28 margin. Small-size cut: bigger cells/dots for 16–32 px.
SYM = dict(o=28, s=56, g=16, r=12, d=11)
SMALL = dict(o=16, s=64, g=16, r=14, d=16)
open(f'{OUT}/gym-diary-symbol.svg', 'w').write(svg(256, 256, f'<path fill="#000" d="{symbol_path(**SYM)}"/>'))
open(f'{OUT}/gym-diary-symbol-small.svg', 'w').write(svg(256, 256, f'<path fill="#000" d="{symbol_path(**SMALL)}"/>'))

# Wordmark: "Gym Diary" in Barlow Condensed Bold (SIL Open Font License), converted to outlines.
font = TTFont(FONT)
gs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font['head'].unitsPerEm
cap = font['OS/2'].sCapHeight
hmtx = font['hmtx']
TRACK = 0.01  # a hair of extra spacing (fraction of the em) so condensed caps don't crowd at small sizes

def wordmark(text, cap_px, x0, baseline):
    k = cap_px / cap
    pen = SVGPathPen(gs)
    x = 0.0
    for ch in text:
        gname = cmap[ord(ch)]
        tp = TransformPen(pen, (k, 0, 0, -k, x0 + x * k, baseline))
        gs[gname].draw(tp)
        x += hmtx[gname][0] + TRACK * upm
    width = (x - TRACK * upm) * k
    return pen.getCommands(), width

# Horizontal lockup: cap height = two grid rows (128), baseline on the bottom row, gap = 2.5 cell gaps.
CAPH, GAP = 128, 40
wm, ww = wordmark('Gym Diary', CAPH, 0, 0)
x0 = 228 + GAP
wm_h, _ = wordmark('Gym Diary', CAPH, x0, 228)
W = x0 + ww + 28
open(f'{OUT}/gym-diary-horizontal.svg', 'w').write(svg(round(W), 256, f'<path fill="#000" d="{symbol_path(**SYM)} {wm_h}"/>'))

# Wordmark alone (same proportions).
wm_only, w_only = wordmark('Gym Diary', CAPH, 28, 28 + CAPH)
open(f'{OUT}/gym-diary-wordmark.svg', 'w').write(svg(round(w_only + 56), CAPH + 56 + 34, f'<path fill="#000" d="{wm_only}"/>'))

# Stacked lockup: symbol on top, wordmark centred below at cap height 64.
SC = 64
_, sw = wordmark('Gym Diary', SC, 0, 0)
SW = max(256, sw + 56)
sx = (SW - sw) / 2
st, _ = wordmark('Gym Diary', SC, sx, 228 + 44 + SC)
SH = 228 + 44 + SC + 28 + 16
open(f'{OUT}/gym-diary-stacked.svg', 'w').write(svg(round(SW), SH, f'<path fill="#000" d="{symbol_path(**SYM, dx=(SW-256)/2)} {st}"/>'))
print('ok', round(W), round(SW), SH)
