# -*- coding: utf-8 -*-
"""LA PLAQUE DES TOILETTES DE CONNIE, AUX COULEURS DE LA MAISON, 23 octobre 2026.

    python scripts/signaletique/r5_connie.py "<épreuve 4.pdf>"     → écrit r5_connie.json

« R5 doit être celle de Connie, aux couleurs de Maison MND » (Yéman). On ne redessine
rien : on relève, dans l'épreuve 4 (page 5, vue de face), les tracés mêmes du
fabricant (la plaque, l'homme, la femme, la barre), la bande dorée, et les glyphes
de « TOILETTES » dans sa police (FZCYSK), puis on les ramène en millimètres
(la plaque mesure 150 × 400). enseignes.r5() les pose aux couleurs de la Maison :
figures et TOILETTES en indigo, bande et barre en cuivre.
"""
import io
import json
import os
import sys

import fitz
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.cffLib import CFFFontSet

ICI = os.path.dirname(os.path.abspath(__file__))


def pt(p, o, k):
    return ((p.x - o.x) * k, (p.y - o.y) * k)


def chemin(items, o, k):
    """Les éléments d'un tracé de PyMuPDF en sous-chemins SVG (une liste de « d »)."""
    sous, d, fin = [], [], None
    for it in items:
        if it[0] == 're':
            r = it[1]
            x0, y0 = pt(r.tl, o, k)
            x1, y1 = pt(r.br, o, k)
            if d:
                sous.append(' '.join(d) + ' Z'); d = []
            sous.append(f'M{x0:.3f} {y0:.3f}H{x1:.3f}V{y1:.3f}H{x0:.3f}Z')
            fin = None
            continue
        debut = it[1]
        if fin is None or abs(debut.x - fin.x) > 1e-3 or abs(debut.y - fin.y) > 1e-3:
            if d:
                sous.append(' '.join(d) + ' Z')
            x, y = pt(debut, o, k)
            d = [f'M{x:.3f} {y:.3f}']
        if it[0] == 'l':
            x, y = pt(it[2], o, k); d.append(f'L{x:.3f} {y:.3f}'); fin = it[2]
        elif it[0] == 'c':
            a, b, c = pt(it[2], o, k), pt(it[3], o, k), pt(it[4], o, k)
            d.append(f'C{a[0]:.3f} {a[1]:.3f} {b[0]:.3f} {b[1]:.3f} {c[0]:.3f} {c[1]:.3f}'); fin = it[4]
        elif it[0] == 'qu':
            q = it[1]
            pts = [pt(q.ul, o, k), pt(q.ur, o, k), pt(q.lr, o, k), pt(q.ll, o, k)]
            if d:
                sous.append(' '.join(d) + ' Z'); d = []
            sous.append('M' + ' L'.join(f'{x:.3f} {y:.3f}' for x, y in pts) + ' Z'); fin = None
    if d:
        sous.append(' '.join(d) + ' Z')
    return sous


def releve(pdf):
    doc = fitz.open(pdf)
    p = doc[4]
    zone = fitz.Rect(227.3343, 386.7645, 390.5748, 786.2256)
    dessins = [x for x in p.get_drawings() if zone.contains(x['rect'])]
    plaque = [x for x in dessins if x['type'] == 'fs'][0]['rect']
    o, k = plaque.tl, 150.0 / plaque.width            # la plaque fait 150 mm de large
    noir = [x for x in dessins if x['type'] == 'f'][0]
    sous = chemin(noir['items'], o, k)
    # La barre est le sous-chemin étroit et haut, au milieu ; tout le reste, ce sont l'homme et la femme.
    def bornes(d):
        nombres = [float(v) for v in __import__('re').findall(r'-?\d+\.\d+', d)]
        xs, ys = nombres[0::2], nombres[1::2]
        return min(xs), min(ys), max(xs), max(ys)
    barres = [d for d in sous if (lambda b: (b[2] - b[0]) < 6 and (b[3] - b[1]) > 40)(bornes(d))]
    figures = [d for d in sous if d not in barres]
    bande = [x for x in dessins if x['type'] == 's'][0]['rect']
    bx0, by0 = pt(bande.tl, o, k)
    bx1, by1 = pt(bande.br, o, k)
    # TOILETTES : les glyphes de la police de Connie, par leur numéro, à leur place.
    tr = [t for t in p.get_texttrace() if zone.intersects(fitz.Rect(t['bbox']))][0]
    xref = [f[0] for f in p.get_fonts() if 'FZCYSK' in f[3]][0]
    _nom, _ext, _type, contenu = doc.extract_font(xref)
    # Un CFF nu, à identifiants de caractères (CID) : la trace du texte donne le CID de chaque lettre.
    cff = CFFFontSet()
    cff.decompile(io.BytesIO(contenu), None)
    police = cff[cff.fontNames[0]]
    gs = police.CharStrings
    e = tr['size'] / 1000 * k
    lettres = []
    for _u, cid, origine, _bbox in tr['chars']:
        x, y = pt(fitz.Point(origine), o, k)
        pen = SVGPathPen(gs)
        gs[f'cid{cid:05d}'].draw(TransformPen(pen, (e, 0, 0, -e, x, y)))
        lettres.append(pen.getCommands())
    return dict(plaque=[150.0, round(plaque.height * k, 3)], figures=' '.join(figures), barre=' '.join(barres),
                bande=[round(bx0, 3), round(by0, 3), round(bx1 - bx0, 3), round(by1 - by0, 3)], toilettes=' '.join(lettres))


if __name__ == '__main__':
    r = releve(sys.argv[1])
    io.open(os.path.join(ICI, 'r5_connie.json'), 'w', encoding='utf-8').write(json.dumps(r, ensure_ascii=False))
    print('plaque', r['plaque'], '· bande', r['bande'], '· figures', len(r['figures']), '· barre', len(r['barre']), '· toilettes', len(r['toilettes']))
