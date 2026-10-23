# -*- coding: utf-8 -*-
"""Ce que fabrique.py (fiches et catalogue du 13 octobre) et fiches3d.py
(fiches techniques 3D du 22 octobre) partagent : les noms des encres, les
variantes, le trait de decoupe, la vue cotee, la vue de cote, le nuancier."""
import re as _re

from formes import ENCRES, cmjn, rvb
from enseignes import Atelier, plaque_atelier, ATELIERS

NOMS_ENCRES = {v: k for k, v in ENCRES.items()}
NOMS_EN = {'indigo': 'Indigo', 'cuivre': 'Copper', 'ivoire': 'Ivory', 'sable': 'Sand (frosted)', 'or': 'Gold', 'argile': 'Clay', 'indigo-profond': 'Deep indigo'}
NOMS_FR = {'indigo': 'Indigo', 'cuivre': 'Cuivre', 'ivoire': 'Ivoire', 'sable': 'Sable (dépoli)', 'or': 'Or', 'argile': 'Argile', 'indigo-profond': 'Indigo profond'}


def variantes(e):
    if e['id'] == 'R8':
        return [(f'R8-{(n or "KOKO")}', (lambda i: (lambda a: plaque_atelier(a, i)))(i)) for i, (n, *_r) in enumerate(ATELIERS)]
    if e['id'] == 'R8-M':
        # L'option des plaques : les cinq plaques, chacune avec son médaillon.
        from options import r8m
        return [(f'R8-M-{(n or "KOKO")}', (lambda i: (lambda a: r8m(a, i)))(i)) for i, (n, *_r) in enumerate(ATELIERS)]
    return [(e['id'], e['dessin'])]


def decoupe(e):
    if e.get('decoupe'):
        return e['decoupe']()
    w, h = e['w'], e['h']
    if e['forme'] == 'rond':
        return f'<circle cx="{w / 2}" cy="{h / 2}" r="{w / 2}"/>'
    base = e.get('base', e['id'])
    if e['forme'] == 'rect' and base not in ('N8',):
        rx = {'N9': 16, 'N6': 34, 'R5': 2, 'R8': 4, 'N2': 6, 'N7': 3}.get(base, 0)
        return f'<rect width="{w}" height="{h}" rx="{rx}"/>'
    return ''


def encres_de(svg):
    return [n for n, hx in ENCRES.items() if hx.lower() in svg.lower()]


import re as _re
_UNITES = _re.compile('([0-9]) (K|mm|cm|USD|V|°C|g|pièces?|feuilles|clientes)(?![A-Za-z])')


def lie_les_unites(page):
    """Le nombre reste avec son unité, dans le TEXTE seulement : une espace
    insécable dans les données d'un chemin SVG casserait le dessin."""
    return _re.sub('>([^<]+)<', lambda m: '>' + _UNITES.sub(lambda u: u.group(1) + chr(160) + u.group(2), m.group(1)) + '<', page)


def vue_cotee(e, dessin, largeur_mm=245, hauteur_mm=165):
    a = Atelier(False)
    corps = dessin(a)
    w, h = e['w'], e['h']
    s = min(largeur_mm / w, hauteur_mm / h)
    marge = 22
    W, H = w * s + marge * 2, h * s + marge * 2
    cote = []
    x0, y0, x1, y1 = marge, marge, marge + w * s, marge + h * s
    fl = '<path d="M0 0 L-3 -1.4 L-3 1.4 Z" fill="#C2410C"/>'
    lab_w = f'Ø {w} mm' if e['forme'] == 'rond' else f'{w} mm'
    cote.append(f'<line x1="{x0}" y1="{y0 - 9}" x2="{x1}" y2="{y0 - 9}" stroke="#C2410C" stroke-width=".35"/>'
                f'<line x1="{x0}" y1="{y0 - 13}" x2="{x0}" y2="{y0 - 5}" stroke="#C2410C" stroke-width=".35"/>'
                f'<line x1="{x1}" y1="{y0 - 13}" x2="{x1}" y2="{y0 - 5}" stroke="#C2410C" stroke-width=".35"/>'
                f'<text x="{(x0 + x1) / 2}" y="{y0 - 11.5}" font-size="4.2" text-anchor="middle" fill="#C2410C" font-family="Arial">{lab_w}</text>')
    cote.append(f'<line x1="{x0 - 9}" y1="{y0}" x2="{x0 - 9}" y2="{y1}" stroke="#C2410C" stroke-width=".35"/>'
                f'<line x1="{x0 - 13}" y1="{y0}" x2="{x0 - 5}" y2="{y0}" stroke="#C2410C" stroke-width=".35"/>'
                f'<line x1="{x0 - 13}" y1="{y1}" x2="{x0 - 5}" y2="{y1}" stroke="#C2410C" stroke-width=".35"/>'
                f'<text transform="translate({x0 - 11.5} {(y0 + y1) / 2}) rotate(-90)" font-size="4.2" text-anchor="middle" fill="#C2410C" font-family="Arial">{h} mm</text>')
    trait = decoupe(e)
    return (f'<svg viewBox="0 0 {W:.2f} {H:.2f}" preserveAspectRatio="xMidYMid meet">'
            f'<g transform="translate({marge} {marge}) scale({s:.6f})">{corps}'
            f'<g fill="none" stroke="#EC008C" stroke-width="{0.3 / s:.3f}">{trait}</g></g>{"".join(cote)}</svg>')


def vue_cote(e):
    if not e['prof']:
        return ''
    h = e['h']
    s = min(48 / h, 1)
    d = min(max(e['prof'] * s, 2.5), 40)
    hh = h * s
    return (f'<svg viewBox="0 0 70 {hh + 30:.1f}" width="70mm" height="{hh + 30:.1f}mm">'
            f'<rect x="8" y="12" width="5" height="{hh:.1f}" fill="#B9B4A8"/>'
            f'<rect x="13" y="12" width="{d:.1f}" height="{hh:.1f}" fill="#CBB49A" stroke="#555" stroke-width=".3"/>'
            f'<text x="{13 + d / 2 + 0.5:.1f}" y="9" font-size="3.6" text-anchor="middle" font-family="Arial" fill="#C2410C">{e["prof"]} mm</text>'
            f'<text x="2" y="{hh + 24:.1f}" font-size="3.4" font-family="Arial" fill="#555">Side view (wall at left)</text></svg>')


def nuancier(e, corps, langue='en'):
    noms = NOMS_EN if langue == 'en' else NOMS_FR
    out = []
    for n in encres_de(corps):
        hx = ENCRES[n]
        c, m, y, k = cmjn(hx)
        r, g, b = rvb(hx)
        out.append(f'<div class="nu"><span style="background:{hx}"></span><b>{noms[n]}</b> {hx} · RGB {r} {g} {b} · CMYK {c} {m} {y} {k}</div>')
    return ''.join(out)


def interieur_ou_ext(e):
    return 'Outdoor (IP65)' if e['scene'] in ('facade', 'rue') or e['id'] in ('N7', 'N9', 'N15', 'R1') else 'Indoor'
