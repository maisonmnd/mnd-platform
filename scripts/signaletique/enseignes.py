# -*- coding: utf-8 -*-
"""LES ENSEIGNES DE LA MAISON MND, 13 octobre 2026.

« Make me 3D signage all types for Maison MND… at least 12, round, on
indigo, cuivre, circle, LED, 3D… with all the specs, the files to be sent »
(Yéman), et la commande déjà passée chez Shenzhen Lico Sign (PI FINALE du
4 mai 2026, épreuve 4 du 5 mai) à reprendre au nouveau logo.

LES RÈGLES QUI DÉCIDENT (LISEZ-MOI des logos, 25 septembre 2026) :
  · le verrou DEBOUT est celui des enseignes ; le couché, celui des bandeaux ;
  · une encre ne se pose que sur les fonds où son contraste dépasse 3 pour 1 :
    l'or ne va pas sur l'ivoire, le cuivre si ; d'où le cuivre partout où la
    commande disait doré sur blanc ;
  · jamais d'obsidienne (noir) : l'indigo pour le sombre ;
  · le logo n'est jamais redessiné, seulement posé et coloré.

Chaque enseigne est une fonction de dessin en millimètres, appelée deux fois :
pour le fichier 1:1 du fabricant (couleurs pleines, trait de découpe) et pour
le rendu du catalogue (matières, lumière). Une seule géométrie, deux sorties.
"""
from formes import (ENCRES, hauteur_capitale, mesure, pose_logo, proportion, texte, texte_en_arc)

I = ENCRES['indigo']
C = ENCRES['cuivre']
V = ENCRES['ivoire']
S = ENCRES['sable']

DEVISE_FON = 'mi nyɔ́ ɖɛkpɛ'
DEVISE_FR = 'votre beauté est déjà là'


class Atelier:
    """Ce que reçoit une fonction de dessin. `rendu` : le catalogue (matières
    et lumière) ; sinon le fichier du fabricant (couleurs pleines)."""

    def __init__(self, rendu):
        self.rendu = rendu

    def metal(self, encre):
        """Le cuivre en métal brossé au rendu, en aplat au fichier."""
        if self.rendu and encre == C:
            return 'url(#cuivre-metal)'
        return encre

    def logo(self, nom, x, y, largeur=None, hauteur=None, couleur=C):
        if self.rendu:
            w0 = proportion(nom)
            w = largeur if largeur else hauteur * w0
            h = w / w0
            return f'<use href="#lg-{nom}" x="0" y="0" width="{w:.2f}" height="{h:.2f}" transform="translate({x:.2f} {y:.2f})" fill="{couleur}"/>', w, h
        return pose_logo(nom, x, y, largeur, hauteur, couleur)


def ajuste(t, famille, taille, largeur_max, graisse=None, interlettre=0.0):
    """La taille qui tient dans la largeur voulue, au plus `taille`."""
    w = mesure(t, famille, taille, graisse, interlettre)
    return taille if w <= largeur_max else taille * largeur_max / w


def logo_centre(a, nom, cx, y, largeur, couleur):
    s, w, h = a.logo(nom, cx - largeur / 2, y, largeur=largeur, couleur=couleur)
    return s, h


# ══ LES NEUF ENSEIGNES DE LA COMMANDE, AU NOUVEAU LOGO ══════════════════

def r1(a):
    s, w, h = a.logo('verrou-debout', 0, 0, largeur=1000, couleur=a.metal(C))
    return s


def r2(a):
    out = [f'<circle cx="300" cy="300" r="300" fill="{I}"/>']
    s, h = logo_centre(a, 'verrou-debout', 300, 92, 250, a.metal(C))
    out.append(s)
    # Là où l'épreuve 4 disait « LOCKS · NATUREL · BEAUTÉ · BIEN-ÊTRE », le slogan (Yéman, 22 oct. 2026).
    out.append(texte_en_arc(DEVISE_FR, 'cormorant-italique', 40, 300, 300, 262, en_bas=True, graisse=500, couleur=a.metal(C)))
    return ''.join(out)


def r3(a):
    out = [f'<circle cx="300" cy="300" r="300" fill="{V}"/>',
           f'<circle cx="300" cy="300" r="281" fill="none" stroke="{C}" stroke-width="4"/>']
    s, h = logo_centre(a, 'verrou-debout', 300, 92, 268, I)
    out.append(s)
    out.append(texte_en_arc(DEVISE_FR, 'cormorant-italique', 38, 300, 300, 258, en_bas=True, graisse=500, couleur=C))
    return ''.join(out)


def r4(a):
    out = [f'<rect width="1050" height="1600" fill="{V}"/>']
    s, h = logo_centre(a, 'verrou-debout', 525, 170, 760, a.metal(C))
    out.append(s)
    t1 = ajuste(DEVISE_FON, 'fon', 170, 640)
    out.append(texte(DEVISE_FON, 'fon', t1, 525, 1265, 'milieu', couleur=a.metal(C))[0])
    out.append(f'<rect x="425" y="1318" width="200" height="3" fill="{C}"/>')
    out.append(texte(DEVISE_FR, 'cormorant-italique', 64, 525, 1400, 'milieu', graisse=500, couleur=a.metal(C))[0])
    return ''.join(out)


def _homme(x, y, c):
    return (f'<g fill="{c}"><circle cx="{x}" cy="{y}" r="8.5"/>'
            f'<rect x="{x - 12}" y="{y + 12}" width="24" height="38" rx="6"/>'
            f'<rect x="{x - 11}" y="{y + 46}" width="9.5" height="42" rx="3"/>'
            f'<rect x="{x + 1.5}" y="{y + 46}" width="9.5" height="42" rx="3"/></g>')


def _femme(x, y, c):
    return (f'<g fill="{c}"><circle cx="{x}" cy="{y}" r="8.5"/>'
            f'<path d="M{x - 10} {y + 12} h20 l13 50 h-46 z"/>'
            f'<rect x="{x - 9}" y="{y + 60}" width="7.5" height="28" rx="3"/>'
            f'<rect x="{x + 1.5}" y="{y + 60}" width="7.5" height="28" rx="3"/></g>')


def r5(a):
    out = [f'<rect width="150" height="400" rx="2" fill="{V}"/>',
           _homme(48, 52, I), _femme(102, 52, I),
           f'<rect x="73.5" y="48" width="3" height="92" fill="{I}"/>',
           f'<rect y="170" width="150" height="46" fill="{a.metal(C)}"/>']
    t = ajuste('TOILETTES', 'cormorant', 26, 124, 500, 0.08)
    out.append(texte('TOILETTES', 'cormorant', t, 75, 300, 'milieu', 500, 0.08, I)[0])
    return ''.join(out)


def r6(a):
    out = [f'<circle cx="300" cy="300" r="300" fill="{V}"/>']
    s, h = logo_centre(a, 'verrou-debout', 300, 96, 280, I)
    out.append(s)
    out.append(f'<rect x="245" y="458" width="110" height="2.5" fill="{C}"/>')
    out.append(texte(DEVISE_FON, 'fon', 50, 300, 518, 'milieu', couleur=C)[0])
    return ''.join(out)


def r7(a):
    out = [f'<rect width="800" height="1000" fill="{V}"/>']
    s, h = logo_centre(a, 'verrou-debout', 400, 118, 520, a.metal(C))
    out.append(s)
    out.append(texte(DEVISE_FON, 'fon', ajuste(DEVISE_FON, 'fon', 104, 480), 400, 852, 'milieu', couleur=a.metal(C))[0])
    out.append(texte(DEVISE_FR, 'cormorant-italique', 46, 400, 928, 'milieu', graisse=500, couleur=a.metal(C))[0])
    return ''.join(out)


ATELIERS = [
    ('I', 'VÈKPÈ™', 'La Naissance', 'CRÉATION DE LOCKS'),
    ('II', 'GBÈJÍ™', 'La Vie', 'ENTRETIEN SUIVI'),
    ('III', 'YÈKPÈ™', 'La Lumière', 'COULEUR VÉGÉTALE'),
    ('IV', 'FÍNFÍN™', 'La Renaissance', 'RESTAURATION'),
    (None, 'KÒKÒ™', 'Le Diagnostic', 'LA CONSULTATION'),
]


def plaque_atelier(a, rang):
    num, marque, nom, fonction = ATELIERS[rang]
    m = a.metal(C)
    out = [f'<rect width="600" height="400" rx="4" fill="#EEF0EE" fill-opacity="{0.92 if a.rendu else 1}"/>',
           f'<rect x="27" y="27" width="546" height="346" fill="none" stroke="{m}" stroke-width="10"/>']
    if num:
        out.append(texte('ATELIER', 'cormorant', 34, 132, 176, 'milieu', 500, 0.08, m)[0])
        out.append(texte(num, 'cormorant', 122, 132, 300, 'milieu', 500, 0.02, m)[0])
    else:
        s, h = logo_centre(a, 'pictogramme', 132, 158, 118, m)
        out.append(s)
    out.append(f'<rect x="226" y="110" width="5" height="190" fill="{m}"/>')
    tm = ajuste(marque, 'cormorant', 82, 300, 500, 0.01)
    out.append(texte(marque, 'cormorant', tm, 258, 205, 'debut', 500, 0.01, m)[0])
    out.append(texte(nom, 'cormorant-italique', 44, 260, 258, 'debut', 500, 0, m)[0])
    out.append(texte(fonction, 'jost', 17, 261, 300, 'debut', 500, 0.2, m)[0])
    return ''.join(out)


def r9(a):
    """La planche de quinze autocollants : leurs messages et leurs couleurs vivent dans autocollants.py."""
    from autocollants import planche
    return planche(a)


# ══ LES NOUVELLES ═══════════════════════════════════════════════════════

def n1(a):
    s, w, h = a.logo('verrou-couche', 0, 0, largeur=3000, couleur=a.metal(C))
    return s


def n2(a):
    out = [f'<rect width="600" height="600" rx="6" fill="{I}"/>',
           f'<circle cx="300" cy="300" r="252" fill="none" stroke="{V}" stroke-width="8"/>']
    s, h = logo_centre(a, 'verrou-debout', 300, 132, 226, V)
    out.append(s)
    out.append(texte('COTONOU · BÉNIN', 'jost', 22, 300, 452, 'milieu', 500, 0.24, V)[0])
    return ''.join(out)


def n3(a):
    out = [f'<circle cx="250" cy="250" r="250" fill="{I}"/>',
           f'<circle cx="250" cy="250" r="236" fill="{V}"/>',
           f'<circle cx="250" cy="250" r="222" fill="none" stroke="{C}" stroke-width="2.5"/>']
    s, h = logo_centre(a, 'verrou-debout', 250, 84, 206, I)
    out.append(s)
    out.append(texte_en_arc('COTONOU · BÉNIN', 'jost', 21, 250, 250, 206, en_bas=True, graisse=500, interlettre=0.2, couleur=I))
    return ''.join(out)


def n4(a):
    out = [f'<rect width="1200" height="800" fill="{V}"/>',
           f'<rect x="10" y="10" width="1180" height="780" fill="none" stroke="{I}" stroke-width="20"/>']
    s, h = logo_centre(a, 'verrou-debout', 600, 140, 336, I)
    out.append(s)
    out.append(texte('COTONOU · BÉNIN', 'jost', 30, 600, 650, 'milieu', 500, 0.3, I)[0])
    return ''.join(out)


def n5(a):
    out = [f'<rect width="3000" height="600" fill="{I}"/>']
    s, w, h = a.logo('verrou-couche', 800, 80.7, largeur=1400, couleur=V)
    out.append(s)
    return ''.join(out)


def n6(a):
    neon = '#FFF3DC' if a.rendu else C
    out = [f'<rect width="1200" height="430" rx="34" fill="{"#FFFFFF" if not a.rendu else "rgba(255,255,255,.07)"}" stroke="{"#9AA0A6" if not a.rendu else "rgba(255,255,255,.25)"}" stroke-width="{1 if not a.rendu else 2}"/>']
    t1 = ajuste(DEVISE_FON, 'fon', 230, 820)
    out.append(texte(DEVISE_FON, 'fon', t1, 600, 222, 'milieu', couleur=neon, attrs='data-couche="neon"')[0])
    out.append(texte(DEVISE_FR, 'cormorant-italique', ajuste(DEVISE_FR, 'cormorant-italique', 96, 900, 500), 600, 352, 'milieu', 500, 0, neon)[0])
    return ''.join(out)


HORAIRES = [('Mardi au vendredi', '8 h à 20 h 30'), ('Samedi', '9 h à 20 h')]


def n7(a):
    m = a.metal(C)
    out = [f'<rect width="400" height="560" rx="3" fill="{m}"/>']
    s, h = logo_centre(a, 'verrou-debout', 200, 38, 150, I)
    out.append(s)
    out.append(texte('MAISON N° 88', 'jost', 22, 200, 268, 'milieu', 500, 0.18, I)[0])
    out.append(texte('Ilot 130-F · Suru-Léré · Cotonou', 'cormorant', ajuste('Ilot 130-F · Suru-Léré · Cotonou', 'cormorant', 21, 330, 500), 200, 300, 'milieu', 500, 0, I)[0])
    out.append(f'<rect x="150" y="320" width="100" height="1.6" fill="{I}"/>')
    y = 360
    for jour, heures in HORAIRES:
        out.append(texte(jour.upper(), 'jost', 14, 200, y, 'milieu', 500, 0.16, I)[0])
        out.append(texte(heures, 'cormorant', 27, 200, y + 31, 'milieu', 500, 0, I)[0])
        y += 70
    out.append(texte('Dimanche et lundi · fermé', 'cormorant-italique', 18, 200, y - 4, 'milieu', 500, 0, I)[0])
    out.append(texte('WHATSAPP 01 51 99 77 99 · MAISONMND.COM', 'jost', ajuste('WHATSAPP 01 51 99 77 99 · MAISONMND.COM', 'jost', 12, 340, 500, 0.08), 200, 532, 'milieu', 500, 0.08, I)[0])
    return ''.join(out)


def n8(a):
    blanc = '#FFFFFF'
    out = []
    if a.rendu:
        out.append('<rect width="900" height="2100" fill="url(#verre)"/>')
    else:
        # La vitre, pour voir le blanc : un repère, à ne pas imprimer.
        out.append('<rect width="900" height="2100" fill="#C9CFD8" stroke="#9AA0A6" stroke-width="1" data-couche="vitre-ne-pas-imprimer"/>')
    s, h = logo_centre(a, 'verrou-debout', 450, 560, 270, C)
    out.append(s)
    out.append(texte('Entrez.', 'cormorant-italique', 84, 450, 1000, 'milieu', 500, 0, blanc)[0])
    out.append(f'<rect x="0" y="1080" width="900" height="260" fill="{S}" fill-opacity="{0.55 if a.rendu else 1}"/>')
    out.append(texte(DEVISE_FON, 'fon', 70, 450, 1192, 'milieu', couleur=I)[0])
    out.append(texte(DEVISE_FR, 'cormorant-italique', 40, 450, 1262, 'milieu', 500, 0, I)[0])
    y = 1450
    for jour, heures in HORAIRES:
        out.append(texte(f'{jour} · {heures}', 'jost', 24, 450, y, 'milieu', 400, 0.06, blanc)[0])
        y += 42
    out.append(texte('Dimanche et lundi · fermé', 'jost', 24, 450, y, 'milieu', 400, 0.06, blanc)[0])
    return ''.join(out)


def n9(a):
    out = [f'<rect width="500" height="300" rx="16" fill="{I}"/>']
    cap = hauteur_capitale('cormorant', 1, 500)
    t = 175 / cap
    out.append(texte('88', 'cormorant', t, 250, 214, 'milieu', 500, 0.04, a.metal(C))[0])
    out.append(texte('MAISON MND', 'jost', 19, 250, 268, 'milieu', 500, 0.32, V)[0])
    return ''.join(out)



# ══ LE TOTEM VIVANT (22 octobre 2026) ═══════════════════════════════════
# « Use our patterns creatively and design a Maison MND sign that is
# interactive and alive » (Yéman, d'après le pylône HoneyFactory de Lico Sign).
# Le logo et le médaillon sont posés, jamais redessinés.

# Le QR de https://maisonmnd.com/ (qrcode-generator, correction M, 25 × 25).
QR_SITE = ["1111111010001010101111111", "1000001010100000001000001", "1011101011110101001011101", "1011101001111100101011101",
           "1011101010000010101011101", "1000001000111100101000001", "1111111010101010101111111", "0000000001010101100000000",
           "1001111110001010110010111", "1001100110101111000111110", "0100101101001101111111001", "0010100111011010001111111",
           "0111101000000000101100001", "1001010101001011100010010", "1100001101000111100011111", "1001010000001001011101101",
           "1001011111011110111110110", "0000000011010100100010110", "1111111010001000101010001", "1000001010010101100010000",
           "1011101011110101111110011", "1011101011101111011000011", "1011101001010100100011111", "1000001001011100011110111",
           "1111111010111100100001001"]

TOTEM_W, TOTEM_H = 600, 2400
# « Je n'aime pas du tout, ce n'est pas pro et hyper chargé » (Yéman, sur le
# totem aux quatorze lanternes) ; parmi trois colonnes sobres, elle a choisi la
# B, « le médaillon de lumière » : le médaillon découpé dans la face indigo, de
# l'opale derrière ; ivoire le jour, lanterne la nuit. Rien d'autre que le logo,
# une petite plaque cuivre pour réserver (QR et NFC) et l'œil du détecteur.
TOTEM_MEDAILLON = dict(cx=300, cy=430, d=420)
TOTEM_PLAQUE = dict(x=225, y=1262, w=150, h=176)


def n10(a):
    from motifs import medaillon
    m = a.metal(C)
    pl = TOTEM_PLAQUE
    out = [f'<rect width="{TOTEM_W}" height="{TOTEM_H}" fill="{I}"/>',
           f'<rect y="2350" width="{TOTEM_W}" height="50" fill="{m}"/>',
           medaillon(TOTEM_MEDAILLON['cx'], TOTEM_MEDAILLON['cy'], TOTEM_MEDAILLON['d'], V)]
    s, h = logo_centre(a, 'verrou-debout', 300, 830, 260, m)
    out.append(s)
    out.append(f'<rect x="{pl["x"]}" y="{pl["y"]}" width="{pl["w"]}" height="{pl["h"]}" rx="4" fill="{m}"/>')
    n, cote = len(QR_SITE), 5.0
    x0, y0 = 300 - cote * n / 2, pl['y'] + 14
    modules = []
    for r, ligne in enumerate(QR_SITE):
        c = 0
        while c < n:
            if ligne[c] == '1':
                d = c
                while d < n and ligne[d] == '1':
                    d += 1
                modules.append(f'<rect x="{x0 + c * cote:.2f}" y="{y0 + r * cote:.2f}" width="{(d - c) * cote:.2f}" height="{cote:.2f}"/>')
                c = d
            else:
                c += 1
    out.append(f'<g fill="{I}">{"".join(modules)}</g>')
    out.append(f'<circle cx="300" cy="1500" r="9" fill="{ENCRES["indigo-profond"]}"/>')
    return ''.join(out)

# ══ LE CATALOGUE ════════════════════════════════════════════════════════
# Chaque fiche : ce que la Maison lit (fr) et ce que le fabricant lit (en).

def _f(id_, dessin, w, h, prof, forme, scene, effet, **k):
    return dict(id=id_, dessin=dessin, w=w, h=h, prof=prof, forme=forme, scene=scene, effet=effet, **k)


H_R1 = 1000 / proportion('verrou-debout')
H_N1 = 3000 / proportion('verrou-couche')

ENSEIGNES = [
    _f('R1', r1, 1000, round(H_R1), 30, 'lettres', 'mur', 'relief',
       nom='Lettres 3D du verrou debout', name='Non-illuminated 3D letters, stacked logo',
       statut='commande', pi='PI FINALE · ligne 1 · épreuve 4 p. 1', prix=138, qte=1, lieu='Mur de façade ou d’entrée',
       fr=dict(construction='Lettres et pictogramme en inox brossé, retours de 30 mm soudés, fixation par goujons au dos.',
               finition='Électrolyse CUIVRE (au lieu de l’or) : le cuivre est l’encre de la Maison sur fond clair.',
               lumiere='Non lumineuses.', change='Nouveau logo (verrou debout : pictogramme, MAISON, MND) ; or → cuivre ; 9 lettres au lieu de 3, le prix peut bouger.'),
       en=dict(construction='Brushed stainless steel letters and pictogram, 30 mm welded returns, rear threaded studs.',
               finish='COPPER electroplated (instead of gold). Please send a finish sample photo before production.',
               lighting='Non-illuminated.', change='New logo artwork (stacked lockup: pictogram + MAISON + MND). Gold → copper. 9 letters instead of 3: please re-quote.')),
    _f('R2', r2, 600, 600, 20, 'rond', 'mur', 'plaque',
       nom='Plaque ronde double couche, ajourée', name='Double-layer cut-out round plate',
       statut='commande', pi='PI FINALE · plaque double couche L60 · épreuve 4 p. 2', prix=147, qte=1, lieu='Entrée, à hauteur d’yeux',
       fr=dict(construction='Face inox 1,2 mm peinte INDIGO, cadre de 20 mm ; logo et devise ajourés, doublés d’inox miroir CUIVRE.',
               finition='Indigo #1E2150 (au lieu du noir), cuivre miroir (au lieu de l’or).', lumiere='Non lumineuse.',
               change='Nouveau logo ; « LOCKS · NATUREL · BEAUTÉ · BIEN-ÊTRE » remplacé par le slogan « votre beauté est déjà là » ; noir → indigo ; or → cuivre.'),
       en=dict(construction='1.2 mm stainless face, 20 mm frame, INDIGO paint. Logo and ring text cut out, backed with COPPER mirror stainless. Keep letter counters (islands) bonded to the backing.',
               finish='Indigo paint #1E2150 (instead of black); copper mirror backing (instead of gold).', lighting='Non-illuminated.',
               change='New logo; the ring text “LOCKS · NATUREL · BEAUTÉ · BIEN-ÊTRE” becomes our slogan “votre beauté est déjà là”; black → indigo; gold → copper.')),
    _f('R3', r3, 600, 600, 120, 'rond', 'facade', 'drapeau',
       nom='Enseigne drapeau ronde lumineuse, double face', name='Double-sided round projecting light box',
       statut='commande', pi='PI FINALE · ligne 2 (LED BOX L60) · épreuve 4 p. 3', prix=215, qte=1, lieu='Façade, perpendiculaire à la rue',
       fr=dict(construction='Caisson Ø600 × 120, faces acrylique opale 5 mm imprimées UV, cerclage inox ; potence tube inox Ø40, platine 5 mm, chevilles M6.',
               finition='Face ivoire, logo indigo, cercle et slogan cuivre ; côtés INDIGO (au lieu du noir).',
               lumiere='LED intérieures, double face, blanc chaud 3000 K (au lieu de 4500 K), alimentation Mean Well 110–240 V.',
               change='Nouveau logo ; « LOCKS · NATUREL · BEAUTÉ · BIEN-ÊTRE » remplacé par le slogan « votre beauté est déjà là » ; noir → indigo ; or → cuivre ; lumière plus chaude.'),
       en=dict(construction='Ø600 × 120 mm light box, 5 mm opal acrylic faces with UV print both sides, stainless rim; Ø40 stainless tube bracket, 5 mm steel plate, M6 anchors.',
               finish='Ivory face, indigo logo, copper ring and slogan; INDIGO painted sides (instead of black).',
               lighting='Internal LED, double-sided, WARM WHITE 3000 K (instead of 4500 K), Mean Well 110–240 V driver, outdoor IP65.',
               change='New logo; the ring text “LOCKS · NATUREL · BEAUTÉ · BIEN-ÊTRE” becomes our slogan “votre beauté est déjà là”; black → indigo; gold → copper; 3000 K.')),
    _f('R4', r4, 1050, 1600, 60, 'rect', 'interieur', 'halo-panneau',
       nom='Grand panneau d’accueil, logo rétroéclairé', name='Reception wall panel with backlit logo',
       statut='commande', pi='PI FINALE · ligne 3 (LED sign 105 × 160) · épreuve 4 p. 4', prix=522, qte=1, lieu='Mur de l’accueil',
       fr=dict(construction='Caisson inox plié 60 mm peint IVOIRE ; logo en inox brossé cuivre, retours 40 mm, dos acrylique dépoli 10 mm ; « mi nyɔ́ ɖɛkpɛ » en lettres de 20 mm ; « votre beauté est déjà là » en acrylique miroir cuivre 3 mm, plat.',
               finition='Ivoire #F6F1E7 (au lieu du blanc), cuivre (au lieu de l’or).',
               lumiere='Halo arrière blanc chaud 3000 K sur le logo et la devise fon ; la ligne française n’est pas éclairée.',
               change='Nouveau logo ; la devise entière, fon puis français ; or → cuivre ; blanc → ivoire.'),
       en=dict(construction='60 mm folded stainless box, IVORY paint; logo in brushed stainless copper finish, 40 mm returns, 10 mm frosted acrylic back (halo); “mi nyɔ́ ɖɛkpɛ” letters 20 mm returns, backlit; “votre beauté est déjà là” 3 mm copper mirror acrylic, flat, non-lit.',
               finish='Ivory paint #F6F1E7 (instead of white); copper finish (instead of gold).',
               lighting='Halo backlight 3000 K warm white on logo and Fon line; Mean Well driver; keyhole wall mounting.',
               change='New logo; full motto (Fon + French line); gold → copper; white → ivory.')),
    _f('R5', r5, 150, 400, 59.5, 'rect', 'interieur', 'caisson-plaque',
       nom='Plaques des toilettes, rétroéclairées', name='Backlit restroom signs',
       statut='commande', pi='PI FINALE · ligne 4 (restroom sign) · épreuve 4 p. 5', prix=70, qte=2, lieu='Portes des toilettes',
       fr=dict(construction='Acrylique dépoli 9,5 mm, impression UV ; bande en aluminium brossé anodisé CUIVRE ; LED intégrée, effet rétroéclairé.',
               finition='Pictogrammes et « TOILETTES » en indigo (au lieu du noir), bande cuivre (au lieu de l’or).',
               lumiere='Rétroéclairage blanc chaud 3000 K.', change='Indigo et cuivre ; même format 150 × 400.'),
       en=dict(construction='9.5 mm frosted acrylic, UV print; brushed aluminium band anodised COPPER; built-in LED, backlit effect.',
               finish='Pictograms and “TOILETTES” printed INDIGO (instead of black); copper band (instead of gold).',
               lighting='Backlit 3000 K warm white.', change='Colours only; same 150 × 400 mm format.')),
    _f('R6', r6, 600, 600, 100, 'rond', 'mur', 'caisson',
       nom='Rond lumineux mural', name='Round front-lit wall light box',
       statut='commande', pi='PI FINALE · ligne 5 (LED BOX L60, une face) · épreuve 4 p. 6', prix=181, qte=1, lieu='Mur intérieur ou sous auvent',
       fr=dict(construction='Caisson Ø600 × 100, face acrylique opale 5 mm imprimée UV, cerclage inox ; fixation par goujons.',
               finition='Face ivoire, logo indigo, devise fon cuivre ; côtés INDIGO (au lieu du noir).',
               lumiere='Face lumineuse, blanc chaud 3000 K.', change='Nouveau logo ; noir → indigo ; or → cuivre.'),
       en=dict(construction='Ø600 × 100 mm light box, 5 mm opal acrylic face with UV print, stainless rim, rear screw fixing.',
               finish='Ivory face, indigo logo, copper Fon motto; INDIGO painted sides (instead of black).',
               lighting='Front-lit 3000 K warm white.', change='New logo; black → indigo; gold → copper.')),
    _f('R7', r7, 800, 1000, 60, 'rect', 'interieur', 'caisson',
       nom='Caisson ajouré lumineux', name='Cut-out front-lit box',
       statut='commande', pi='PI FINALE · ligne 6 (LED BOX 100 × 80) · épreuve 4 p. 7', prix=277, qte=1, lieu='Mur intérieur',
       fr=dict(construction='Caisson inox plié 60 mm peint IVOIRE ; logo et devise ajourés, plaque opale et film translucide CUIVRE.',
               finition='Ivoire (au lieu du blanc), film cuivre (au lieu de l’or).', lumiere='Face lumineuse à travers les ajours, blanc chaud 3000 K.',
               change='Nouveau logo ; la devise entière ; or → cuivre.'),
       en=dict(construction='60 mm folded stainless box, IVORY paint; logo and motto cut out, opal acrylic + COPPER light-transmitting film behind.',
               finish='Ivory paint (instead of white); copper film (instead of gold).', lighting='Front-lit through cut-outs, 3000 K warm white.',
               change='New logo; full motto; gold → copper.')),
    _f('R8', lambda a: plaque_atelier(a, 0), 600, 400, 7.5, 'rect', 'interieur', 'caisson-plaque',
       nom='Plaques des ateliers (5)', name='Atelier door plates (5 sets)',
       statut='commande', pi='PI FINALE · LED sign 60 × 40 × 5 · épreuve 4 p. 8–9', prix=455, qte=5, lieu='Portes des ateliers', serie=5,
       fr=dict(construction='Acrylique dépoli 7,5 mm découpé ; cadre et lettres en acrylique miroir CUIVRE 2 mm ; entretoises.',
               finition='Cuivre miroir (au lieu de l’or) ; une ligne française sous chaque nom : « CRÉATION DE LOCKS »…',
               lumiere='Rétroéclairage blanc chaud 3000 K.', change='« GBÉJÍ » corrigé en GBÈJÍ ; KÒKÒ porte le pictogramme ; or → cuivre ; la fonction en français.'),
       en=dict(construction='7.5 mm frosted acrylic base, custom cut; frame and letters in 2 mm COPPER mirror acrylic; stand-off studs.',
               finish='Copper mirror (instead of gold). One extra French line under each name.', lighting='Backlit 3000 K warm white.',
               change='SPELLING: “GBÉJÍ” must be “GBÈJÍ”. KÒKÒ plate gets the pictogram. Gold → copper. French function line added.')),
    _f('R9', r9, 1060, 680, 0, 'feuille', 'planche', 'plat',
       nom='Autocollants ronds Ø20 cm, 15 dessins', name='Round stickers Ø200, 15 designs per sheet',
       statut='commande', pi='PI FINALE · ligne 7 (stickers D20, 100 feuilles)', prix=35, qte=100, lieu='Miroirs, bacs à shampoing, comptoir, coffrets',
       fr=dict(construction='Papier synthétique adhésif, pelliculage mat, impression numérique recto ; découpe à la forme Ø200.',
               finition='Les sept encres de la charte : indigo, indigo profond, cuivre, ivoire, sable, argile, or (sur l’indigo seulement).',
               lumiere='Sans lumière (autocollants).',
               change='Les 15 dessins refaits : trois QR (réserver, avis Google, pourboire MoMoPay), le pourboire, la détente au shampoing, la devise, le bien-être et trois brumes maison.'),
       en=dict(construction='Synthetic paper adhesive, matte lamination, single-sided digital print, die-cut Ø200 (magenta line), 3 mm bleed.',
               finish='The seven brand inks: indigo, deep indigo, copper, ivory, sand, clay, gold (on indigo only). Print the 3 QR codes at 100%, never resized or recoloured.',
               lighting='None (stickers).',
               change='All 15 designs replaced: 3 QR codes (booking, Google review, MoMoPay tip), tip, shampoo relaxation, motto, wellness and 3 home mist recipes. Same sheet 1060 × 680 mm, 5 × 3.')),
    _f('N1', n1, 3000, round(H_N1), 50, 'lettres', 'facade', 'halo',
       nom='Lettres boîtiers de façade, halo', name='Halo-lit reverse channel letters, horizontal logo',
       statut='nouvelle', lieu='Bandeau de façade',
       fr=dict(construction='Lettres boîtiers inversées en inox PVD CUIVRE, retours 50 mm, entretoises 30 mm ; fond du bandeau indigo.',
               finition='Cuivre brossé ; bandeau indigo.', lumiere='Halo arrière blanc chaud 3000 K ; IP65, alimentation Mean Well étanche.',
               change='Verrou couché, 3 m de large : l’enseigne qu’on voit de la rue, la nuit comprise.'),
       en=dict(construction='Reverse channel letters in COPPER PVD stainless, 50 mm returns, 30 mm stand-offs, clear acrylic back. Minimum stroke 6 mm (thicken MAISON hairlines if needed, keep proportions).',
               finish='Brushed copper PVD.', lighting='Halo backlight 3000 K warm white, IP65 modules, waterproof Mean Well driver.',
               change='NEW ITEM. Width 3000 mm. Please quote.')),
    _f('N2', n2, 600, 600, 100, 'rect', 'facade', 'drapeau-carre',
       nom='Drapeau carré lumineux, cercle de lumière', name='Square projecting light box, lit ring',
       statut='nouvelle', lieu='Façade, perpendiculaire à la rue',
       fr=dict(construction='Caisson inox 600 × 600 × 100 peint INDIGO, double face ; logo, cercle et texte en acrylique opale traversant (push-through) ; potence cuivre.',
               finition='Indigo, lumière ivoire ; potence et platine cuivre.', lumiere='Seuls le logo, le cercle et le texte s’allument, 3000 K.',
               change='Inspiré de l’enseigne « BB » : le cercle de lumière sur fond sombre.'),
       en=dict(construction='600 × 600 × 100 mm stainless box, INDIGO paint, double-sided; logo, ring and text in push-through opal acrylic; copper finish bracket.',
               finish='Indigo #1E2150; copper bracket.', lighting='Only logo, ring and text glow, 3000 K, IP65.', change='NEW ITEM. Please quote.')),
    _f('N3', n3, 500, 500, 25, 'rond', 'facade', 'potence',
       nom='Enseigne ronde sur potence', name='Round hanging sign on wrought bracket',
       statut='nouvelle', lieu='Portail ou façade',
       fr=dict(construction='Disque Ø500 en aluminium composite 4 mm, double face imprimé UV ; jonc INDIGO ; potence en fer forgé laquée indigo, bras 650 mm.',
               finition='Ivoire, indigo, filet cuivre.', lumiere='Non lumineuse (un spot en option).', change='Inspirée de l’enseigne ronde « mockup » : simple, lisible de loin.'),
       en=dict(construction='Ø500 mm 4 mm aluminium composite disc, UV print both sides; INDIGO edge band; wrought iron bracket, indigo powder coat, 650 mm arm, two hanging rods.',
               finish='Ivory face, indigo logo, copper ring line.', lighting='Non-illuminated (optional spotlight).', change='NEW ITEM. Please quote.')),
    _f('N4', n4, 1200, 800, 40, 'rect', 'interieur', 'cadre-lumineux',
       nom='Cadre lumineux à LED périmétrique', name='Edge-lit framed panel',
       statut='nouvelle', lieu='Accueil ou couloir',
       fr=dict(construction='Panneau acrylique ivoire 10 mm dans un cadre aluminium INDIGO 20 mm ; logo indigo en acrylique 5 mm découpé, posé en relief.',
               finition='Ivoire, indigo.', lumiere='LED sur le pourtour du cadre, halo blanc chaud 3000 K.', change='Inspiré de « Maison du Revêtement ».'),
       en=dict(construction='10 mm ivory acrylic panel in a 20 mm INDIGO aluminium frame; logo flat-cut from 5 mm indigo acrylic, raised.',
               finish='Ivory, indigo.', lighting='Perimeter LED (frame halo), 3000 K warm white.', change='NEW ITEM. Please quote.')),
    _f('N5', n5, 3000, 600, 15, 'rect', 'rue', 'plat-relief',
       nom='Bandeau indigo, lettres ivoire découpées', name='Indigo fascia with ivory flat-cut letters',
       statut='nouvelle', lieu='Bandeau de façade (jour)',
       fr=dict(construction='Bandeau aluminium composite INDIGO 3000 × 600 ; verrou couché en acrylique IVOIRE 15 mm découpé, sur entretoises.',
               finition='Indigo et ivoire.', lumiere='Non lumineux ; deux appliques col-de-cygne en option.', change='Inspiré de l’enseigne « DESIGN » : sobre, de jour.'),
       en=dict(construction='3000 × 600 mm INDIGO aluminium composite fascia; horizontal logo flat-cut from 15 mm IVORY acrylic, on studs.',
               finish='Indigo, ivory.', lighting='Non-illuminated; two gooseneck lamps optional.', change='NEW ITEM. Please quote.')),
    _f('N6', n6, 1200, 430, 8, 'rect', 'nuit', 'neon',
       nom='Néon de la devise', name='LED neon motto',
       statut='nouvelle', lieu='Mur photo, intérieur',
       fr=dict(construction='Néon LED flexible 6 mm sur plaque acrylique transparente 8 mm découpée ; fixation par entretoises.',
               finition='Lumière blanc chaud.', lumiere='Néon 3000 K, variateur, alimentation 12 V.', change='« mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là » : le mur où les clientes se prennent en photo.'),
       en=dict(construction='6 mm LED neon flex following the letter centrelines, on 8 mm clear acrylic backer, stand-off mounting.',
               finish='Warm white light.', lighting='3000 K neon, dimmer, 12 V adapter. Special letters ɔ ɖ ɛ and the accent on ɔ́ must be kept exactly.', change='NEW ITEM. Please quote.')),
    _f('N7', n7, 400, 560, 2, 'rect', 'mur', 'plaque',
       nom='Plaque d’adresse et d’horaires', name='Address and opening hours plate',
       statut='nouvelle', lieu='À côté du portail',
       fr=dict(construction='Inox 2 mm brossé CUIVRE (PVD), gravure chimique remplie de peinture INDIGO ; 4 entretoises.',
               finition='Cuivre brossé, indigo.', lumiere='Non lumineuse.', change='Maison n° 88, l’adresse, les horaires, le WhatsApp : la cliente qui cherche la porte la trouve.'),
       en=dict(construction='2 mm brushed stainless, COPPER PVD; chemically etched, INDIGO paint fill; 4 stand-offs.',
               finish='Brushed copper, indigo fill.', lighting='Non-illuminated.', change='NEW ITEM. Please quote. Hours may change: confirm text before production.')),
    _f('N8', n8, 900, 2100, 0, 'rect', 'verre', 'vitre',
       nom='Vitrophanie de la porte', name='Glass door vinyl',
       statut='nouvelle', lieu='Porte vitrée d’entrée',
       fr=dict(construction='Vinyle CUIVRE découpé (logo), vinyle blanc découpé (« Entrez. », horaires), bande en vinyle dépoli SABLE avec la devise en réserve indigo.',
               finition='Cuivre, blanc, dépoli.', lumiere='Sans lumière (vinyle).', change='Peut aussi se faire chez un imprimeur de Cotonou avec ce fichier.'),
       en=dict(construction='Cut COPPER vinyl (logo), cut white vinyl (text, hours), frosted vinyl band with indigo printed motto. Door 900 × 2100 mm: adjust to the real glass size.',
               finish='Copper, white, frosted.', lighting='None (vinyl).', change='NEW ITEM (can also be produced locally).')),
    _f('N9', n9, 500, 300, 20, 'rect', 'mur', 'chiffres',
       nom='Numéro « 88 » du portail', name='House number plate “88”',
       statut='nouvelle', lieu='Portail marron, Maison n° 88',
       fr=dict(construction='Plaque aluminium composite INDIGO 500 × 300 coins arrondis ; chiffres « 88 » en inox PVD CUIVRE, retours 20 mm ; « MAISON MND » imprimé ivoire.',
               finition='Indigo, cuivre, ivoire.', lumiere='Halo des chiffres 3000 K en option (sinon non lumineuse).', change='L’itinéraire dit « Maison n° 88 » : le numéro se voit enfin.'),
       en=dict(construction='500 × 300 mm INDIGO aluminium composite plate, rounded corners; “88” digits in COPPER PVD stainless, 20 mm returns; “MAISON MND” printed ivory.',
               finish='Indigo, copper, ivory.', lighting='Optional 3000 K halo on the digits.', change='NEW ITEM. Please quote.')),
    _f('N10', n10, TOTEM_W, TOTEM_H, 220, 'rect', 'facade', 'totem',
       nom='Le totem au médaillon de lumière', name='Medallion light totem (pylon sign)',
       statut='nouvelle', lieu='Devant la façade, sur le trottoir de la Maison',
       fr=dict(construction='Colonne autoportante 600 × 2400 × 220 : ossature acier galvanisé, habillage aluminium 2 mm peint INDIGO, platine au sol ancrée par 4 tiges M12, porte de visite fermant à clé au dos ; socle cuivre de 50 mm. Médaillon Ø420 découpé au laser dans la face, acrylique opale derrière (les îlots collés sur l’opale). Verrou debout : pictogramme et MND en lettres boîtiers inox cuivre, retours 40 mm sur entretoises de 20 mm, halo ; MAISON en acrylique miroir cuivre 10 mm. Plaque cuivre 150 × 176 avec le QR imprimé indigo et une étiquette NFC derrière, centrée à 1,05 m du sol ; œil du détecteur de passage à 0,9 m.',
               finition='Indigo #1E2150, cuivre brossé, opale ivoire.',
               lumiere='LED pilotables derrière le médaillon (blanc chaud 3000 K, couleurs possibles pour les fêtes) et halo du logo ; la lumière respire au repos et monte quand quelqu’un approche ; minuterie de fermeture.',
               change='Nouvelle pièce, inspirée du pylône HoneyFactory du fabricant, en version sobre : le médaillon seul.'),
       en=dict(construction='Free-standing column 600 × 2400 × 220 mm: galvanised steel frame, 2 mm aluminium skin painted INDIGO, base plate anchored with 4 × M12 rods, lockable service door at the back; 50 mm copper plinth. Ø420 medallion laser-cut in the face, opal acrylic behind (keep the islands bonded to the opal). Stacked logo: pictogram and MND in copper finish stainless channel letters, 40 mm returns on 20 mm stand-offs, halo-lit; MAISON flat-cut 10 mm copper mirror acrylic. Copper plate 150 × 176 mm with the QR code printed indigo and an NFC tag behind it, centred 1.05 m above the ground; motion sensor window at 0.9 m.',
               finish='Indigo #1E2150, brushed copper, ivory opal.',
               lighting='Addressable LED behind the medallion (3000 K warm white, colours possible for festive scenes) and halo on the logo. The light breathes at rest and rises when someone approaches; closing timer.',
               change='NEW ITEM, inspired by your HoneyFactory pylon sign, in a quiet version: the medallion alone. Please quote.')),
]
