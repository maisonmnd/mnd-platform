# -*- coding: utf-8 -*-
"""LES MOTIFS DE LA MAISON EN VECTORIEL, 22 octobre 2026.

L'allover est le pictogramme répété, rangée sur rangée, une rangée sur deux
décalée d'un demi-pas (les tuiles « aéré » et « serré » du Drive). Le médaillon
est le pictogramme posé quatre fois, tourné d'un quart de tour autour d'un même
centre : superposé au PNG officiel (medaillon-seul-indigo.png, 1600 px), il le
recouvre à 98,5 % et les écarts tiennent dans l'anticrénelage. On le pose donc
depuis le tracé officiel du pictogramme, sans rien redessiner.

Tout est en millimètres, y vers le bas, comme les dessins d'enseignes.py.
"""
import io
import math
import os
import re

from formes import VECTO, logo

# Le médaillon, mesuré sur le PNG officiel : le pictogramme à l'échelle 1,2632
# px/unité, son point (407 ; 631,6) au centre ; l'encre fait 1 261,1 unités de bord à bord.
MED_CENTRE = (407.0, 631.6)
MED_DIAMETRE = 1261.1


def pictogramme(x, y, largeur, couleur, attrs=''):
    """Le pictogramme posé à son coin haut gauche (x, y), à la largeur voulue."""
    corps, w, h = logo('pictogramme')
    e = largeur / w
    return f'<g transform="translate({x:.2f} {y:.2f}) scale({e:.6f})" fill="{couleur}" {attrs}>{corps}</g>'


def taille_pictogramme(largeur):
    _, w, h = logo('pictogramme')
    return largeur, largeur * h / w


def medaillon(cx, cy, diametre, couleur, attrs=''):
    """Le médaillon : quatre pictogrammes tournés d'un quart de tour autour de (cx, cy)."""
    corps, _, _ = logo('pictogramme')
    k = diametre / MED_DIAMETRE
    tx, ty = cx - MED_CENTRE[0] * k, cy - MED_CENTRE[1] * k
    quarts = ''.join(f'<g transform="rotate({90 * i} {cx:.2f} {cy:.2f})"><g transform="translate({tx:.3f} {ty:.3f}) scale({k:.6f})">{corps}</g></g>'
                     for i in range(4))
    return f'<g fill="{couleur}" {attrs}>{quarts}</g>'


def chemin_du_pictogramme():
    """Le tracé brut (d, largeur, hauteur) : le moteur 3D le peint au mur par Path2D."""
    s = io.open(os.path.join(VECTO, 'pictogramme-cuivre.svg'), encoding='utf-8').read()
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', s).group(1).split()]
    return dict(d=' '.join(re.findall(r' d="([^"]+)"', s)), w=vb[2], h=vb[3])


def grille(x, y, w, h, largeur, pas_x, pas_y, decale=True, rond=None, exclure=(), marge=0.0, ancre=None):
    """Les coins des pictogrammes ENTIERS d'un allover dans la zone (x, y, w, h).

    Le réseau est accroché à `ancre` (le centre de la zone par défaut) : une
    couronne y est centrée, et le motif reste symétrique. `rond` = (cx, cy, r)
    garde ceux qui tiennent dans un disque ; `exclure` écarte ceux qui touchent
    ces rectangles (x, y, w, h),
    le logo par exemple. Un motif coupé au bord ne se fabrique pas : on ne
    garde que des entiers.
    """
    lw, lh = taille_pictogramme(largeur)
    ax, ay = ancre or (x + w / 2, y + h / 2)
    out = []
    for j in range(math.floor((y - ay) / pas_y) - 1, math.ceil((y + h - ay) / pas_y) + 2):
        dx = pas_x / 2 if (decale and j % 2) else 0.0
        for i in range(math.floor((x - ax - dx) / pas_x) - 1, math.ceil((x + w - ax - dx) / pas_x) + 2):
            px, py = ax + dx + i * pas_x - lw / 2, ay + j * pas_y - lh / 2
            if px < x + marge - 1e-6 or py < y + marge - 1e-6 or px + lw > x + w - marge + 1e-6 or py + lh > y + h - marge + 1e-6:
                continue
            coins = ((px, py), (px + lw, py), (px, py + lh), (px + lw, py + lh))
            if rond and any(((qx - rond[0]) ** 2 + (qy - rond[1]) ** 2) ** 0.5 > rond[2] for qx, qy in coins):
                continue
            if any(px < ex + ew and px + lw > ex and py < ey + eh and py + lh > ey for ex, ey, ew, eh in exclure):
                continue
            out.append((px, py))
    return out


def allover(points, largeur, couleur, attrs=''):
    """Un seul élément : tous les pictogrammes de la grille."""
    return f'<g {attrs}>' + ''.join(pictogramme(px, py, largeur, couleur) for px, py in points) + '</g>'
