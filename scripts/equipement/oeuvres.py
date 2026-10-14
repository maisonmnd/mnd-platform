# -*- coding: utf-8 -*-
"""Les fichiers 1:1 des fabricants : broderie, transfert, gaufrage, sablage,
gravure. Chaque fichier : un SVG en millimètres, l'oeuvre en aplats, l'étoffe
en fond de repère (à ne pas broder), un cadre ou une ligne de coupe magenta.
Noms de fichiers en ASCII : les chaînes des imprimeurs refusent les accents."""
import dessins as D
from dessins import C, I, P, V, S, logo_centre, texte, semis, bande_tissee, arche
from enseignes import Atelier

MAGENTA = '#EC008C'
GRAVURE = '#1E2150'   # la surface à sabler, graver ou gaufrer (pas une couleur d'impression)


def svg(titre, w, h, oeuvre, fond=None, contour=None, note=''):
    """Le fichier du fabricant. `fond` : l'étoffe, en repère ; `contour` : le
    tracé de coupe (sinon un cadre)."""
    trait = contour or f'<rect x="0" y="0" width="{w}" height="{h}"/>'
    rep = f'<g id="fabric-reference-do-not-print"><rect width="{w}" height="{h}" fill="{fond}"/></g>' if fond else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}mm" height="{h}mm" viewBox="0 0 {w} {h}">'
            f'<title>Maison MND · {titre}</title><desc>{note} Units: millimetres, scale 1:1. Magenta hairline = frame or cut line, do not print.</desc>'
            f'{rep}<g id="artwork">{oeuvre}</g>'
            f'<g id="cut-line-or-frame" fill="none" stroke="{MAGENTA}" stroke-width=".3">{trait}</g></svg>')


def logo_seul(nom, largeur, couleur, w, h):
    a = Atelier(False)
    return logo_centre(a, nom, w / 2, (h - largeur / D.proportion_de(nom)) / 2, largeur, couleur)[0]


def tuile_cape():
    a = Atelier(False)
    return semis(a, 'pictogramme', 0, 0, 420, 380, 70, 210, 190, P)


OEUVRES = {
    'A1': [('A1-1 chest embroidery stacked logo 76mm', 100, 115, lambda: logo_seul('verrou-debout', 76, C, 100, 115), I, None, 'Copper thread. Satin stitch, MAISON letters 5.5 mm high.'),
           ('A1-2 pocket name embroidery template', 120, 30, lambda: texte('PRÉNOM', 'jost', 13, 60, 20, 'milieu', 500, 0.18, V)[0], I, None, 'Ivory thread, 9 mm capitals. Replace PRÉNOM by each first name in the same font (Jost Medium).')],
    'A2': [('A2-1 chest transfer pictogram 80mm', 100, 90, lambda: logo_seul('pictogramme', 80, C, 100, 90), P, None, 'Copper heat transfer.'),
           ('A2-2 hem transfer text', 420, 30, lambda: texte('YÈKPÈ · COULEUR VÉGÉTALE', 'jost', 12, 210, 20, 'milieu', 500, 0.2, C)[0], P, None, 'Copper heat transfer.')],
    'A3': [('A3-1 embroidery horizontal logo 140mm', 160, 60, lambda: logo_seul('verrou-couche', 140, I, 160, 60), V, None, 'Indigo thread. MAISON letters 5.5 mm high.')],
    'K1': [('K1-1 all-over repeat tile 420x380mm', 420, 380, tuile_cape, I, None, 'Seamless repeat, deep indigo on indigo.'),
           ('K1-2 front pictogram 130mm', 160, 130, lambda: logo_seul('pictogramme', 130, V, 160, 130), I, None, 'Ivory print, centred 300 mm below the neck.')],
    'S1': [('S1-1 jacquard band 500x60mm', 500, 60, lambda: bande_tissee(Atelier(False), 0, 0, 500, 60), None, None, 'Woven: copper ground yarn, deep indigo pictograms 34 mm at 62.5 mm pitch.'),
           ('S1-2 corner embroidery pictogram 50mm', 70, 60, lambda: logo_seul('pictogramme', 50, C, 70, 60), P, None, 'Small-run alternative. Copper thread.')],
    'S2': [('S2-1 embroidery pictogram 40mm', 60, 50, lambda: logo_seul('pictogramme', 40, C, 60, 50), I, None, 'Copper thread.')],
    'S3': [('S3-1 embroidery pictogram 36mm', 56, 46, lambda: logo_seul('pictogramme', 36, C, 56, 46), I, None, 'Copper thread.')],
    'F1': [('F1-1 deboss die pictogram 140mm', 160, 135, lambda: logo_seul('pictogramme', 140, GRAVURE, 160, 135), None, None, 'Blind deboss, no ink. Filled area = pressed area.')],
    'F2': [('F2-1 side medallion engraving 120mm', 124, 124, lambda: logo_seul('pictogramme', 70, GRAVURE, 124, 124), None,
            '<circle cx="62" cy="62" r="60"/>', 'Copper medallion Ø 120 mm; filled area = engraved.')],
    'F3': [('F3-1 embroidery pictogram 60mm', 80, 70, lambda: logo_seul('pictogramme', 60, C, 80, 70), I, None, 'Copper thread.')],
    'F4': [('F4-1 deboss pictogram 56mm', 76, 62, lambda: logo_seul('pictogramme', 56, GRAVURE, 76, 62), None, None, 'Blind deboss, no ink.')],
    'F5': [('F5-1 cover print MND KIDS 400x400mm', 400, 400, lambda: D.f5(Atelier(False)), None,
            '<rect x="0" y="0" width="400" height="400" rx="60"/>', 'Print or embroidery on sand cover.')],
    'M1': [('M1-1 sandblast front view 700x1700mm', 700, 1700, lambda: D.m1_marque(Atelier(False), GRAVURE), None,
            f'<path d="{arche(700, 1700, 350)}"/>', 'Filled area = frosted. FRONT VIEW: flip horizontally if frosting is done on the back.')],
    'M2': [('M2-1 sandblast front view diam 800mm', 800, 800, lambda: D.m2_marque(Atelier(False), GRAVURE), None,
            '<circle cx="400" cy="400" r="400"/>', 'Filled area = frosted. FRONT VIEW: flip horizontally if frosting is done on the back.')],
    'M3': [('M3-1 sandblast each face 800x1880mm', 800, 1880, lambda: D.m3_marque(Atelier(False), GRAVURE), None,
            f'<path d="{arche(800, 1880, 400)}"/>', 'Same artwork on both faces. Filled area = frosted. FRONT VIEW.')],
    'M4': [('M4-1 laser engraving back diam 220mm', 224, 224, lambda: D.m4_marque(Atelier(False), GRAVURE, 112, 112), None,
            '<circle cx="112" cy="112" r="110"/>', 'Laser engraving on the copper back. Filled area = engraved.')],
}
