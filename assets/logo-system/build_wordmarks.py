#!/usr/bin/env python3
"""Build EthosFi production logo assets with OUTLINED wordmarks (portable, no font needed).

Primary wordmark : Archivo wght=600, tracking +2.0%  (refined premium)
Signature wordmark: Space Grotesk wght=600 with a custom "O" = Signal Field nucleus
Symbol           : unchanged Signal Field geometry
"""
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

FONTS = "/home/ubuntu/brand-exploration/ethosfi-logo/fonts"
OUT = "/home/ubuntu/brand-exploration/ethosfi-logo/svg"

INK = "#0F172A"
WHITE = "#E8ECF4"
ACCENT = "#1D4ED8"
ACCENT_D = "#5B8DEF"
NODE = "#64748B"
NODE_D = "#8494AC"
LINE = "#CBD5E1"
LINE_D = "#3E4E68"


def load(path, axes):
    f = TTFont(path)
    instantiateVariableFont(f, axes, inplace=True)
    return f


def text_path(font, text, tracking_em=0.0):
    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    hmtx = font["hmtx"]
    tr = tracking_em * upem
    x = 0.0
    parts = []
    for ch in text:
        g = cmap.get(ord(ch))
        if g is None:
            continue
        pen = SVGPathPen(gs)
        gs[g].draw(pen)
        d = pen.getCommands()
        if d:
            parts.append(f'<path transform="translate({x:.2f},0)" d="{d}"/>')
        x += hmtx[g][0] + tr
    if parts:
        x -= tr
    return "".join(parts), x, upem


def cap_of(font):
    try:
        return font["OS/2"].sCapHeight
    except Exception:
        return font["head"].unitsPerEm * 0.72


# ---- symbol fragment (native 100x100 box) ----
def symbol(line, node, accent):
    return (
        f'<g stroke="{line}" stroke-width="2.2" stroke-linecap="round">'
        '<line x1="50" y1="50" x2="50" y2="18"/><line x1="50" y1="50" x2="23" y2="66"/>'
        '<line x1="50" y1="50" x2="77" y2="66"/></g>'
        f'<g fill="{node}"><circle cx="50" cy="18" r="4.6"/><circle cx="23" cy="66" r="4.6"/>'
        '<circle cx="77" cy="66" r="4.6"/></g>'
        f'<circle cx="50" cy="50" r="10.5" fill="{accent}"/>'
    )


def wordmark_svg(font, text, color, tracking, font_px=100, pad=2.0):
    inner, adv, upem = text_path(font, text, tracking)
    scale = font_px / upem
    cap_px = cap_of(font) * scale
    w = adv * scale + pad * 2
    h = cap_px + pad * 2
    g = (f'<g transform="translate({pad:.2f},{pad + cap_px:.3f}) scale({scale:.5f},{-scale:.5f})" '
         f'fill="{color}">{inner}</g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.1f}" height="{h:.1f}" '
            f'viewBox="0 0 {w:.2f} {h:.2f}" role="img" aria-label="{text}">{g}</svg>')


def horizontal(font, text, tracking, color, line, node, accent, S=64.0):
    """symbol + wordmark lockup."""
    inner, adv, upem = text_path(font, text, tracking)
    cap_px = 0.60 * S
    scale = cap_px / cap_of(font)
    wm_w = adv * scale
    gap = 0.34 * S
    total_w = S + gap + wm_w
    baseline = S / 2 + cap_px / 2
    sym = f'<g transform="scale({S/100:.5f})">{symbol(line, node, accent)}</g>'
    wm = (f'<g transform="translate({S+gap:.2f},{baseline:.3f}) scale({scale:.5f},{-scale:.5f})" '
          f'fill="{color}">{inner}</g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_w:.1f}" height="{S:.1f}" '
            f'viewBox="0 0 {total_w:.2f} {S:.2f}" fill="none" role="img" aria-label="{text}">'
            f'{sym}{wm}</svg>')


def stacked(font, text, tracking, color, line, node, accent, S=70.0):
    inner, adv, upem = text_path(font, text, tracking)
    cap_px = 0.34 * S
    scale = cap_px / cap_of(font)
    wm_w = adv * scale
    gap_v = 0.22 * S
    total_w = max(S, wm_w)
    total_h = S + gap_v + cap_px
    sym_x = (total_w - S) / 2
    wm_x = (total_w - wm_w) / 2
    sym = f'<g transform="translate({sym_x:.2f},0) scale({S/100:.5f})">{symbol(line, node, accent)}</g>'
    wm = (f'<g transform="translate({wm_x:.2f},{S+gap_v+cap_px:.3f}) scale({scale:.5f},{-scale:.5f})" '
          f'fill="{color}">{inner}</g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_w:.1f}" height="{total_h:.1f}" '
            f'viewBox="0 0 {total_w:.2f} {total_h:.2f}" fill="none" role="img" aria-label="{text}">'
            f'{sym}{wm}</svg>')


def signature(sg, color, accent, line, node, sym_line, sym_node, sym_accent, S=64.0):
    """Space Grotesk ET H [O] S F I with custom-O nucleus. symbol + signature lockup."""
    tr = 0.02
    pre, pre_w, upem = text_path(sg, "ETH", tr)
    post, post_w, _ = text_path(sg, "SFI", tr)
    cmap = sg.getBestCmap(); hmtx = sg["hmtx"]
    o_adv = hmtx[cmap[ord("O")]][0]
    cap = cap_of(sg)
    cap_px = 0.60 * S
    scale = cap_px / cap
    baseline = S / 2 + cap_px / 2
    # widths in px
    pre_px = pre_w * scale
    post_px = post_w * scale
    o_px = o_adv * scale
    trk_px = tr * upem * scale
    gap = 0.34 * S
    x0 = S + gap
    total_w = x0 + pre_px + trk_px + o_px + trk_px + post_px
    # custom O: ring + accent nucleus, sized to cap height, centered in its advance slot
    o_cx = x0 + pre_px + trk_px + o_px / 2
    o_cy = S / 2
    o_r = cap_px * 0.46
    ring_sw = cap_px * 0.135
    nucleus_r = cap_px * 0.15
    pre_g = (f'<g transform="translate({x0:.2f},{baseline:.3f}) scale({scale:.5f},{-scale:.5f})" '
             f'fill="{color}">{pre}</g>')
    post_x = x0 + pre_px + trk_px + o_px + trk_px
    post_g = (f'<g transform="translate({post_x:.2f},{baseline:.3f}) scale({scale:.5f},{-scale:.5f})" '
              f'fill="{color}">{post}</g>')
    o_g = (f'<circle cx="{o_cx:.2f}" cy="{o_cy:.2f}" r="{o_r:.2f}" fill="none" '
           f'stroke="{color}" stroke-width="{ring_sw:.2f}"/>'
           f'<circle cx="{o_cx:.2f}" cy="{o_cy:.2f}" r="{nucleus_r:.2f}" fill="{accent}"/>')
    sym = f'<g transform="scale({S/100:.5f})">{symbol(sym_line, sym_node, sym_accent)}</g>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_w:.1f}" height="{S:.1f}" '
            f'viewBox="0 0 {total_w:.2f} {S:.2f}" fill="none" role="img" aria-label="ETHOSFI">'
            f'{sym}{pre_g}{o_g}{post_g}</svg>')


def w(name, svg):
    with open(f"{OUT}/{name}.svg", "w") as fp:
        fp.write(svg)
    print("wrote", name)


if __name__ == "__main__":
    arch = load(f"{FONTS}/Archivo.ttf", {"wght": 600, "wdth": 100})
    sg = load(f"{FONTS}/SpaceGrotesk.ttf", {"wght": 600})
    TR = 0.02

    # wordmark only
    w("wordmark", wordmark_svg(arch, "ETHOSFI", INK, TR))
    w("wordmark-white", wordmark_svg(arch, "ETHOSFI", WHITE, TR))

    # primary horizontal lockups
    w("logo-horizontal", horizontal(arch, "ETHOSFI", TR, INK, LINE, NODE, ACCENT))
    w("logo-horizontal-dark", horizontal(arch, "ETHOSFI", TR, WHITE, LINE_D, NODE_D, ACCENT_D))
    w("logo-horizontal-mono-black",
      horizontal(arch, "ETHOSFI", TR, INK, "#0F172A", "#0F172A", "#0F172A"))
    w("logo-horizontal-mono-white",
      horizontal(arch, "ETHOSFI", TR, WHITE, "#FFFFFF", "#FFFFFF", "#FFFFFF"))

    # stacked
    w("logo-stacked", stacked(arch, "ETHOSFI", TR, INK, LINE, NODE, ACCENT))
    w("logo-stacked-dark", stacked(arch, "ETHOSFI", TR, WHITE, LINE_D, NODE_D, ACCENT_D))

    # signature (secondary)
    w("logo-signature", signature(sg, INK, ACCENT, LINE, NODE, LINE, NODE, ACCENT))
    w("logo-signature-dark", signature(sg, WHITE, ACCENT_D, LINE_D, NODE_D, LINE_D, NODE_D, ACCENT_D))
    print("done")
