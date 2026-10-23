# -*- coding: utf-8 -*-
"""CE QUI S'AJOUTE SUR CHAQUE PIÈCE COMMANDÉE, 22 octobre 2026.

« Mets-moi les images de ce qui a été commandé en Chine chez Connie. Dessine-moi
ce que je veux rajouter sur chaque commande pour que ce soit le logo à jour avec
Maison » (Yéman), puis : « LOCKS · NATUREL · BEAUTÉ · BIEN-ÊTRE, à changer avec
le slogan votre beauté est déjà là ». Choix au sélecteur : montrer les deux,
« MAISON » ajouté en gardant l'or et le noir de l'épreuve 4, puis la version
finale en cuivre et indigo (enseignes.py).

Le logo à jour est le verrou debout officiel : le pictogramme, MAISON, MND. Sur
l'épreuve 4, le pictogramme et MND sont déjà là ; s'ajoute MAISON entre les
deux. On pose donc le verrou debout tel quel (jamais redessiné) à la place du
pictogramme et de MND, et l'on encadre ce qui est nouveau.
"""
from enseignes import C, I, V, DEVISE_FON, DEVISE_FR, ajuste, logo_centre, r6
from formes import ENCRES, logo, texte, texte_en_arc

OR = ENCRES['or']
NOIR = '#1A1A1A'      # le noir de l'épreuve 4, montré tel quel pour comparer ; il sort de la charte
BLANC = '#FFFFFF'
TRAIT = '#D2462F'     # le cadre de ce qui s'ajoute : une annotation, pas une encre


class Atelier:
    """Les dessins de l'épreuve, aux couleurs pleines."""
    rendu = False

    def metal(self, encre):
        return encre

    def logo(self, nom, x, y, largeur=None, hauteur=None, couleur=OR):
        from formes import pose_logo
        return pose_logo(nom, x, y, largeur, hauteur, couleur)


def boite_maison(cx, y, largeur):
    """Le rectangle du mot MAISON dans un verrou debout posé centré en cx, en haut à y, à la largeur donnée.
    Mesuré dans le fichier officiel : MAISON va de 418 à 2340 en x et de 2075 à 2300 en y, sur 2767,6 × 3296,65."""
    _, w, _ = logo('verrou-debout')
    e = largeur / w
    x0 = cx - largeur / 2
    return (x0 + 418 * e, y + 2075 * e, (2340 - 418) * e, (2300 - 2075) * e)


def cadre(x, y, w, h, etiquette, marge=8, taille=18, dessous=False):
    """Un cadre pointillé autour de ce qui s'ajoute, et son étiquette."""
    x, y, w, h = x - marge, y - marge, w + 2 * marge, h + 2 * marge
    ty = y + h + taille * 1.15 if dessous else y - taille * 0.45
    return (f'<g data-couche="annotation"><rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{marge:.1f}" fill="none" stroke="{TRAIT}" '
            f'stroke-width="{taille / 7:.2f}" stroke-dasharray="{taille / 2:.1f} {taille / 3:.1f}"/>'
            f'<text x="{x + w / 2:.1f}" y="{ty:.1f}" font-family="Arial, sans-serif" font-size="{taille}" font-weight="700" fill="{TRAIT}" text-anchor="middle">{etiquette}</text></g>')


def recolore(svg, table):
    for avant, apres in table.items():
        svg = svg.replace(avant, apres).replace(avant.lower(), apres)
    return svg


# ══ « MAISON » AJOUTÉ, L'OR ET LE NOIR GARDÉS ═══════════════════════════
def r1(a):
    s, _ = logo_centre(a, 'verrou-debout', 500, 0, 1000, OR)
    return s, [cadre(*boite_maison(500, 0, 1000), '+ MAISON', 14, 44)]


def r2(a):
    s, _ = logo_centre(a, 'verrou-debout', 300, 92, 250, OR)
    out = (f'<circle cx="300" cy="300" r="300" fill="{NOIR}"/><circle cx="300" cy="300" r="286" fill="none" stroke="{OR}" stroke-width="3"/>' + s
           + texte_en_arc(DEVISE_FR, 'cormorant-italique', 40, 300, 300, 262, en_bas=True, graisse=500, couleur=OR))
    return out, [cadre(*boite_maison(300, 92, 250), '+ MAISON', 5, 20), cadre(150, 508, 300, 64, 'slogan', 6, 20, dessous=True)]


def r3(a):
    s, _ = logo_centre(a, 'verrou-debout', 300, 92, 268, OR)
    out = (f'<circle cx="300" cy="300" r="300" fill="{BLANC}"/><circle cx="300" cy="300" r="297" fill="none" stroke="{NOIR}" stroke-width="6"/>' + s
           + texte_en_arc(DEVISE_FR, 'cormorant-italique', 38, 300, 300, 258, en_bas=True, graisse=500, couleur=OR))
    return out, [cadre(*boite_maison(300, 92, 268), '+ MAISON', 5, 20), cadre(150, 505, 300, 64, 'slogan', 6, 20, dessous=True)]


def r4(a):
    s, _ = logo_centre(a, 'verrou-debout', 525, 170, 760, OR)
    t1 = ajuste(DEVISE_FON, 'fon', 170, 640)
    out = (f'<rect width="1050" height="1600" fill="{BLANC}"/>' + s + f'<rect x="265" y="1150" width="520" height="3" fill="{OR}"/>'
           + texte(DEVISE_FON, 'fon', t1, 525, 1330, 'milieu', couleur=OR)[0])
    return out, [cadre(*boite_maison(525, 170, 760), '+ MAISON', 12, 40)]


def r6(a, _r6=r6):
    from enseignes import Atelier as AtelierFinal
    out = recolore(_r6(AtelierFinal(False)), {I: OR, C: OR, V: BLANC})
    return out, [cadre(*boite_maison(300, 96, 280), '+ MAISON', 5, 20)]


def r7(a):
    s, _ = logo_centre(a, 'verrou-debout', 400, 118, 520, OR)
    t = ajuste(DEVISE_FON, 'fon', 104, 480)
    out = (f'<rect width="800" height="1000" fill="{BLANC}"/>' + s + f'<rect x="250" y="790" width="300" height="2" fill="{OR}"/>'
           + texte(DEVISE_FON, 'fon', t, 400, 890, 'milieu', couleur=OR)[0])
    return out, [cadre(*boite_maison(400, 118, 520), '+ MAISON', 8, 28)]


# Ce que chaque pièce gagne, en français pour la Maison. `dessin` : None quand l'épreuve ne porte pas le logo.
AJOUTS = {
    'R1': (r1, ['MAISON, en lettres 3D comme MND, entre le pictogramme et MND.']),
    'R2': (r2, ['MAISON, ajouré comme MND.', '« LOCKS · NATUREL · BEAUTÉ · BIEN-ÊTRE » devient « votre beauté est déjà là ».']),
    'R3': (r3, ['MAISON, imprimé sur les deux faces.', '« LOCKS · NATUREL · BEAUTÉ · BIEN-ÊTRE » devient « votre beauté est déjà là ».']),
    'R4': (r4, ['MAISON, en lettres rétroéclairées comme MND.']),
    'R5': (None, ['Pas de logo sur cette plaque : le dessin de Connie, réimprimé aux couleurs de la Maison (indigo, barre et bande cuivre).']),
    'R6': (r6, ['MAISON, imprimé sur la face.']),
    'R7': (r7, ['MAISON, ajouré et éclairé comme MND.']),
    'R8': (None, ['Rien à ajouter pour MAISON : les plaques ne portent pas le logo.', 'GBÉJÍ s’écrit GBÈJÍ sur la plaque de l’atelier II.']),
    'R9': (None, ['La feuille de la boutique : 11 dessins, 12 de chaque, 120 pastilles Ø50 et 12 étiquettes La Brume de 80 × 55.']),
}
