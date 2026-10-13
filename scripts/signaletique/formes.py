# -*- coding: utf-8 -*-
"""LES FORMES DE LA SIGNALÉTIQUE : le logo et les textes, en millimètres.

Le logo n'est jamais redessiné : on pose les SVG de public/assets/vectoriel
(contours exacts de Cormorant, pictogramme tracé à 0,13 % de l'original).
Les textes ajoutés (ateliers, horaires, devise) sont VECTORISÉS depuis les
polices du dépôt avec fontTools : un fabricant reçoit des courbes, jamais une
police qu'il n'a pas. Les lettres fon (ɔ ɖ ɛ Ɔ) que Cormorant ne porte pas
viennent de devise-fon.ttf, comme sur le site.
"""
import io
import math
import os
import re
import unicodedata

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VECTO = os.path.join(RACINE, 'public', 'assets', 'vectoriel')
POLICES = os.path.join(RACINE, 'src', 'ds', 'fonts')

# ── Les encres de la Maison (LISEZ-MOI des logos, 25 septembre 2026) ──
ENCRES = {
    'indigo': '#1E2150', 'indigo-profond': '#15173A', 'cuivre': '#B97A4A',
    'ivoire': '#F6F1E7', 'sable': '#E3DACB', 'argile': '#CDBBA9', 'or': '#B8902F',
}


def cmjn(hexa):
    """Une conversion naïve RVB → CMJN, à titre indicatif : le fabricant
    s'aligne sur l'échantillon, jamais sur ces chiffres seuls."""
    r, g, b = (int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5))
    k = 1 - max(r, g, b)
    if k >= 1:
        return (0, 0, 0, 100)
    c, m, y = ((1 - x - k) / (1 - k) for x in (r, g, b))
    return tuple(round(v * 100) for v in (c, m, y, k))


def rvb(hexa):
    return tuple(int(hexa[i:i + 2], 16) for i in (1, 3, 5))


# ══ LE LOGO ═════════════════════════════════════════════════════════════
_LOGOS = {}


def logo(nom):
    """(contenu SVG intérieur, largeur, hauteur) d'un fichier de vectoriel,
    sans sa couleur : on la verse au moment de poser."""
    if nom not in _LOGOS:
        s = io.open(os.path.join(VECTO, f'{nom}-cuivre.svg'), encoding='utf-8').read()
        vb = [float(x) for x in re.search(r'viewBox="([^"]+)"', s).group(1).split()]
        corps = s[s.index('>', s.index('<svg')) + 1:s.rindex('</svg>')]
        _LOGOS[nom] = (corps.strip(), vb[2], vb[3])
    return _LOGOS[nom]


def pose_logo(nom, x, y, largeur=None, hauteur=None, couleur='#B97A4A', attrs=''):
    """Le logo posé au coin (x, y), à la largeur OU la hauteur voulue (mm)."""
    corps, w, h = logo(nom)
    e = largeur / w if largeur else hauteur / h
    return (f'<g transform="translate({x:.2f} {y:.2f}) scale({e:.6f})" fill="{couleur}" {attrs}>{corps}</g>',
            w * e, h * e)


def proportion(nom):
    _, w, h = logo(nom)
    return w / h


# ══ LES POLICES ═════════════════════════════════════════════════════════
_POLICES = {}


def police(nom, graisse=None):
    cle = (nom, graisse)
    if cle not in _POLICES:
        chemin = os.path.join(POLICES, nom) if nom.endswith('.woff2') else os.path.join(RACINE, 'public', 'assets', 'fonts', nom)
        f = TTFont(chemin)
        if 'fvar' in f:
            axes = {a.axisTag: a for a in f['fvar'].axes}
            voulu = {}
            if 'wght' in axes:
                voulu['wght'] = graisse or axes['wght'].defaultValue
            f = instancer.instantiateVariableFont(f, voulu)
        _POLICES[cle] = (f, f.getGlyphSet(), f.getBestCmap(), f['hmtx'].metrics, f['head'].unitsPerEm)
    return _POLICES[cle]


FAMILLES = {
    'cormorant': ('cormorant-latin.woff2', 'cormorant-latin-ext.woff2'),
    'cormorant-italique': ('cormorant-italique-latin.woff2', 'cormorant-italique-latin-ext.woff2'),
    'jost': ('jost-latin.woff2', 'jost-latin-ext.woff2'),
    'fon': ('devise-fon.ttf',),
}
SECOURS = ('devise-fon.ttf', None)


def _glyphe(famille, graisse, ch):
    """La police et le nom de glyphe qui portent `ch` : la famille, puis la
    police de la devise (les lettres fon), comme la pile du site."""
    for nom in FAMILLES[famille]:
        f = police(nom, graisse)
        if ord(ch) in f[2]:
            return f, f[2][ord(ch)]
    f = police(SECOURS[0], None)
    if ord(ch) in f[2]:
        return f, f[2][ord(ch)]
    return None, None


def _contour(f, g, ech, dx, dy):
    _, gs, _, _, _ = f
    pen = SVGPathPen(gs)
    gs[g].draw(TransformPen(pen, (ech, 0, 0, -ech, dx, dy)))
    return pen.getCommands()


def _bornes(f, g):
    _, gs, _, _, _ = f
    b = BoundsPen(gs)
    gs[g].draw(b)
    return b.bounds


def grappes(texte, famille, taille, graisse=None, interlettre=0.0):
    """Le texte en grappes (une lettre et ses accents combinants), chacune
    avec son contour à l'origine et son avance, en mm. `taille` est le corps
    (em) en mm ; `interlettre` en em."""
    texte = unicodedata.normalize('NFC', texte)
    out = []
    for ch in texte:
        f, g = _glyphe(famille, graisse, ch)
        if f is None:
            raise ValueError(f'glyphe absent : {ch!r} dans {famille}')
        upm = f[4]
        ech = taille / upm
        if unicodedata.combining(ch) and out:
            base = out[-1]
            bf, bg = base['f'], base['g']
            bb, mb = _bornes(bf, bg), _bornes(f, g)
            if bb and mb:
                decal = ((bb[0] + bb[2]) / 2 - (mb[0] + mb[2]) / 2) * ech
            else:
                decal = 0
            base['d'] += ' ' + _contour(f, g, ech, decal, 0)
            continue
        av = f[3][g][0] * ech
        out.append({'d': _contour(f, g, ech, 0, 0) if ch != ' ' else '', 'av': av + interlettre * taille, 'f': f, 'g': g})
    if out:
        out[-1]['av'] -= interlettre * taille
    return out


def mesure(texte, famille, taille, graisse=None, interlettre=0.0):
    return sum(c['av'] for c in grappes(texte, famille, taille, graisse, interlettre))


def hauteur_capitale(famille, taille, graisse=None):
    f = police(FAMILLES[famille][0], graisse)[0]
    os2 = f['OS/2']
    cap = getattr(os2, 'sCapHeight', 0) or 700
    return cap / f['head'].unitsPerEm * taille


def texte(t, famille, taille, x, y, ancre='debut', graisse=None, interlettre=0.0, couleur='#1E2150', attrs=''):
    """Le texte vectorisé, ligne de base en (x, y). Rend (svg, largeur)."""
    gr = grappes(t, famille, taille, graisse, interlettre)
    larg = sum(c['av'] for c in gr)
    x0 = x - (larg / 2 if ancre == 'milieu' else larg if ancre == 'fin' else 0)
    parts = []
    cx = x0
    for c in gr:
        if c['d']:
            parts.append(f'<path transform="translate({cx:.3f} {y:.3f})" d="{c["d"]}"/>')
        cx += c['av']
    return f'<g fill="{couleur}" {attrs}>{"".join(parts)}</g>', larg


def texte_en_arc(t, famille, taille, cx, cy, rayon, en_bas=True, graisse=None, interlettre=0.0, couleur='#B97A4A'):
    """Le texte le long d'un cercle, centré sur le bas (lettres tournées vers
    le centre) ou sur le haut (lettres tournées vers l'extérieur). `rayon` :
    celui de la ligne de base."""
    gr = grappes(t, famille, taille, graisse, interlettre)
    larg = sum(c['av'] for c in gr)
    parts = []
    pos = -larg / 2
    for c in gr:
        milieu = pos + c['av'] / 2
        phi = milieu / rayon
        if c['d']:
            if en_bas:
                # De gauche à droite le long du bas : le haut des lettres vise le centre.
                x = cx + rayon * math.sin(phi)
                y = cy + rayon * math.cos(phi)
                ang = -math.degrees(phi)
            else:
                x = cx + rayon * math.sin(phi)
                y = cy - rayon * math.cos(phi)
                ang = math.degrees(phi)
            parts.append(f'<path transform="translate({x:.3f} {y:.3f}) rotate({ang:.3f}) translate({-c["av"] / 2:.3f} 0)" d="{c["d"]}"/>')
        pos += c['av']
    return f'<g fill="{couleur}">{"".join(parts)}</g>'
