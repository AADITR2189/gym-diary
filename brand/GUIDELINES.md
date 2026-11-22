# Gym Diary — Logo Guidelines

## 1. The logo
- **Idea:** a slice of your training calendar. The days you logged climb like steps: showing up is progress.
- **Versions:** horizontal (primary) · stacked · symbol only · wordmark only.
- **Where the files are:**
  - `gym-diary-*.svg`: black masters (vector, scale to any size).
  - `symbol/`, `lockups/`: one-colour versions in navy, teal, yellow, black and white, as SVG and PNG.
  - `web/`: favicon, app icons and the web manifest, ready for the app.
  - `presentation/`: the presentation board (`board.html`, and each slide as PNG in `slides/`).

## 2. Clear space
Keep empty space of **one square** of the symbol (the width of one rounded square) around the logo on every side.
It scales with the logo, so a bigger logo needs more space.

## 3. Minimum size
| Version | Screen | Print |
|---|---|---|
| Horizontal | 120 px wide | 30 mm wide |
| Stacked | 64 px wide | 16 mm wide |
| Symbol | 24 px (use the small-size version from 16 to 32 px: `gym-diary-symbol-small.svg`, already used in `web/`) | 6 mm |

The small-size version has bigger squares and dots so the steps still read at 16 px.

## 4. Colour
| Name | HEX | RGB | CMYK (approx.) | Use |
|---|---|---|---|---|
| Night Navy | #0C1E29 | 12, 30, 41 | 71, 27, 0, 84 | App icon tile, dark backgrounds, logo on light backgrounds |
| Signal Yellow | #FFFE15 | 255, 254, 21 | 0, 0, 92, 0 | Logo on navy (the app icon) |
| Deep Teal | #004741 | 0, 71, 65 | 100, 0, 8, 72 | Logo on sand (light theme) |
| Sand | #F0EDE4 | 240, 237, 228 | 0, 1, 5, 6 | Light backgrounds |

CMYK values are calculated, not proofed: ask a printer to match them (and to suggest the nearest Pantone).

**Approved logo/background pairs:**
- yellow on navy (15.8:1 contrast)
- teal on sand (9.1:1)
- navy on white or sand
- black on white
- white on any dark colour

Signal Yellow is never used on white or sand: the contrast is too low.

## 5. Typography
- **Wordmark:** Barlow Condensed Bold, converted to outlines (shapes), so it never depends on an installed font.
  Barlow is licensed under the SIL Open Font License, which allows use in logos.
- **App and documents:** Barlow Condensed for headings, the system font (SF Pro / Roboto) for text.

## 6. Don'ts
- Don't stretch, squash or rotate the logo.
- Don't change the pattern: the three steps always rise to the right, and the empty days are dots.
- Don't recolour it outside the palette, or add shadows, outlines, gradients or effects.
- Don't rearrange or resize the parts of a lockup.
- Don't place it on busy photos without a navy or sand panel behind it.
- Don't retype "Gym Diary" in a font: use the wordmark files.

## 7. Notes
- **Trademark:** no trademark search has been done. Check trademark databases (and do a reverse image search) before
  using the name and logo commercially.
- **Masters:** the files in this folder were built by `build_brand.py` (logo, small version, wordmark and lockups).
  The other versions were exported with the logo-design skill's `export_variants.py`.
