# EthosFi — Logo System (Signal Field)

Production brand assets. **Not yet integrated into the product** — this is the
approved identity package, ready to wire into the design system on your go.

## Concept
**Signal Field** — three points of evidence converging on one illuminated
signal. Intelligence lives in the lit nucleus (the *only* place the accent
color appears); trust lives in the balanced, engineered geometry.

## Wordmark
- **Primary:** Archivo SemiBold (weight 600), tracking **+2%**, uppercase.
  Refined and premium — not heavy or dated.
- **Secondary signature:** Space Grotesk with a custom **"O"** rebuilt as the
  Signal Field nucleus (a thin ring holding an accent point). Limited use —
  hero / marketing / covers only.
- All wordmark SVGs are **outlined to vector paths** — no font required to
  render them anywhere.

## Colors
| Token | Light | Dark |
|---|---|---|
| Accent (nucleus only) | `#1D4ED8` | `#5B8DEF` |
| Wordmark / ink | `#0F172A` | `#E8ECF4` |
| Evidence nodes | `#64748B` | `#8494AC` |
| Connecting lines | `#CBD5E1` | `#3E4E68` |
| Ground | `#FFFFFF` / `#F8FAFC` | `#0B1220` |

The accent is reserved exclusively for the nucleus — never on the wordmark or
the outer nodes.

## Files

### `svg/` (scalable, preferred)
- `symbol` · `symbol-dark` · `symbol-mono-black` · `symbol-mono-white` — icon only
- `wordmark` · `wordmark-white` — wordmark only (outlined)
- `logo-horizontal` · `-dark` · `-mono-black` · `-mono-white` — primary lockup
- `logo-stacked` · `-dark` — vertical lockup (covers/centered)
- `logo-signature` · `-dark` — secondary signature
- `app-icon` · `app-icon-dark` — rounded tile
- `favicon-32` (nucleus + triad) · `favicon-16` (nucleus only)

### `png/` (raster, drop-in)
2× exports of every lockup/icon + exact-size favicons (`favicon-16.png`,
`favicon-32.png`).

### `identity-sheet.html`
The full one-page spec: symbol, wordmark, lockups, signature, app icon /
favicon, color, clearspace & minimum size, do/don't, and three usage examples
(enterprise website header, investor presentation, financial-institution
report). Open in a browser.

## Clearspace & minimum size
- Clearspace = the height of the symbol nucleus on all sides.
- Minimum: horizontal lockup **120px / 32mm** wide; symbol alone **20px**;
  favicon collapses to the nucleus at **16px**.

## Do / Don't
**Do:** keep the accent on the nucleus only · maintain clearspace · use the
dark lockup on dark grounds · use one-color versions for print/engraving.
**Don't:** recolor the wordmark with the accent · rotate/stretch/restyle the
symbol · add gradients/shadows/outlines · place on busy imagery without a
solid backing · swap the typeface.

## Regenerating
`python3 build_wordmarks.py` re-outlines the wordmarks/lockups from the
variable fonts in `fonts/`. `fonts/` holds the upstream OFL variable fonts
(Archivo, Space Grotesk) used only for outlining — they are not required at runtime.
