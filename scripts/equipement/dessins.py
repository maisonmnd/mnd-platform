# -*- coding: utf-8 -*-
"""L'ÉQUIPEMENT DE LA MAISON MND : tabliers, linge, fauteuils et miroirs.
14 octobre 2026. « I need to have branded aprons, towels, chairs and mirrors.
I need you to prepare my designs and specs » (Yéman).

Chaque pièce est dessinée en millimètres, une fois, et sert deux fois : le
rendu du catalogue (matières) et la vue cotée de la fiche du fabricant. Les
fichiers 1:1 (broderie, impression, marquage, sablage) sont à part, dans
oeuvres.py. Le logo n'est jamais redessiné : on pose les SVG du dépôt.

LES SEUILS MESURÉS LE 14 OCTOBRE 2026 sur public/assets/vectoriel :
  · les capitales de MAISON font 7,2 % de la largeur du verrou debout et
    3,9 % du couché ; une lettre brodée demande 5 mm au moins ; donc le
    debout se brode à 70 mm de large au moins, le couché à 130 mm ;
    en dessous, le pictogramme seul ;
  · le pictogramme est symétrique (0,2 % d'écart à son reflet) : lui seul se
    pose face au miroir (cape), le verrou s'y lirait à l'envers.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'signaletique'))
from formes import ENCRES, texte, texte_en_arc  # noqa: E402
from enseignes import Atelier, logo_centre, DEVISE_FON, DEVISE_FR  # noqa: E402

I = ENCRES['indigo']
P = ENCRES['indigo-profond']
C = ENCRES['cuivre']
V = ENCRES['ivoire']
S = ENCRES['sable']
A = ENCRES['argile']
GIVRE = '#EEF2F6'      # le verre dépoli (sablage), au rendu seulement

PLANCHER_DEBOUT = 70   # mm, broderie
PLANCHER_COUCHE = 130  # mm, broderie


def tissu(a, encre):
    """Une étoffe : un dégradé doux au rendu, l'aplat au fichier."""
    if a.rendu:
        return {I: 'url(#tissu-indigo)', P: 'url(#tissu-profond)', V: 'url(#tissu-ivoire)', S: 'url(#tissu-sable)'}.get(encre, encre)
    return encre


def piqure(d, couleur=C, ep=1.2):
    """Une surpiqûre : un trait en tirets le long d'un chemin."""
    return f'<path d="{d}" fill="none" stroke="{couleur}" stroke-width="{ep}" stroke-dasharray="5 3.5" opacity=".9"/>'


def rivet(x, y, r=6):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="url(#cuivre-metal)" stroke="#7A4A26" stroke-width=".8"/>'


def semis(a, nom, x0, y0, x1, y1, largeur, pas_x, pas_y, couleur, opacite=1.0):
    """Des pictogrammes en quinconce dans un rectangle (le motif tout-over)."""
    out = []
    rang = 0
    y = y0 + pas_y / 2
    while y < y1:
        x = x0 + (pas_x / 2 if rang % 2 else pas_x / 4)
        while x < x1:
            s, w, h = a.logo(nom, x - largeur / 2, y - largeur * 0.41, largeur=largeur, couleur=couleur)
            out.append(s)
            x += pas_x
        y += pas_y
        rang += 1
    return f'<g opacity="{opacite}">{"".join(out)}</g>'


# ══ LES TABLIERS ════════════════════════════════════════════════════════
def tablier_bavette(a, w, h, haut, bavette, aisselle, fond, sangle):
    """Un tablier à bavette vu de face, posé à `haut` mm du cadre."""
    g = (w - bavette) / 2
    d = (f'M{g} {haut} H{g + bavette} V{haut + aisselle * 0.55} C{g + bavette} {haut + aisselle * 0.85} {w - 70} {haut + aisselle} {w} {haut + aisselle} '
         f'V{h - 30} Q{w} {h} {w - 30} {h} H30 Q0 {h} 0 {h - 30} V{haut + aisselle} C70 {haut + aisselle} {g} {haut + aisselle * 0.85} {g} {haut + aisselle * 0.55} Z')
    s = [f'<path d="M{g + 8} {haut} L{g + 60} 0 M{g + bavette - 8} {haut} L{g + bavette - 60} 0" stroke="{sangle}" stroke-width="26" stroke-linecap="round" fill="none"/>']
    s.append(f'<path d="{d}" fill="{tissu(a, fond)}"/>')
    s.append(piqure(f'M{g + 9} {haut + 9} H{g + bavette - 9}'))
    s.append(piqure(f'M9 {haut + aisselle + 12} V{h - 30} Q9 {h - 9} 30 {h - 9} H{w - 30} Q{w - 9} {h - 9} {w - 9} {h - 30} V{haut + aisselle + 12}'))
    yl = haut + aisselle + 20
    s.append(f'<path d="M4 {yl} C-26 {yl + 50} -26 {yl + 140} -10 {yl + 240} M{w - 4} {yl} C{w + 26} {yl + 50} {w + 26} {yl + 140} {w + 10} {yl + 240}" stroke="{sangle}" stroke-width="24" stroke-linecap="round" fill="none"/>')
    s += [rivet(g + 14, haut + 14), rivet(g + bavette - 14, haut + 14), rivet(14, haut + aisselle + 20), rivet(w - 14, haut + aisselle + 20)]
    return ''.join(s)


def poche(x, y, w, h, fond, cases=0):
    s = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{fond}" stroke="#000" stroke-opacity=".18"/>',
         piqure(f'M{x + 6} {y + 8} H{x + w - 6}'), piqure(f'M{x + 6} {y + 4} V{y + h - 6} H{x + w - 6} V{y + 4}')]
    for k in range(1, cases + 1):
        xx = x + w * k / (cases + 1)
        s.append(piqure(f'M{xx} {y + 8} V{y + h - 6}'))
    return ''.join(s)


def a1(a):
    """Le tablier du maître : toile indigo déperlante, bretelles croisées."""
    s = [tablier_bavette(a, 700, 1000, 100, 290, 300, I, '#8E5A33')]
    s.append(logo_centre(a, 'verrou-debout', 350, 150, 76, C)[0])
    s.append(poche(60, 640, 270, 230, tissu(a, I)))
    s.append(poche(370, 640, 270, 230, tissu(a, I), cases=3))
    s.append(texte('PRÉNOM', 'jost', 13, 195, 700, 'milieu', 500, 0.18, V)[0])
    return ''.join(s)


def a2(a):
    """Le tablier des couleurs (YÈKPÈ) : enduit, essuyable, plus long."""
    s = [tablier_bavette(a, 750, 1100, 100, 300, 300, P, P)]
    s.append(logo_centre(a, 'pictogramme', 375, 170, 80, C)[0])
    s.append(texte('YÈKPÈ · COULEUR VÉGÉTALE', 'jost', 12, 375, 1060, 'milieu', 500, 0.2, C)[0])
    return ''.join(s)


def a3(a):
    """Le tablier de l'accueil : à la taille, toile ivoire."""
    s = [f'<path d="M4 22 C-30 80 -30 200 -12 300 M596 22 C630 80 630 200 612 300" stroke="{I}" stroke-width="20" stroke-linecap="round" fill="none"/>',
         f'<path d="M0 0 H600 V420 Q600 450 570 450 H30 Q0 450 0 420 Z" fill="{tissu(a, V)}" stroke="#000" stroke-opacity=".12"/>',
         f'<rect x="0" y="0" width="600" height="44" fill="{I}"/>',
         piqure('M20 290 H580', I), piqure('M300 290 V430', I)]
    s.append(logo_centre(a, 'verrou-couche', 300, 110, 140, I)[0])
    return ''.join(s)


def k1(a):
    """La cape de lavage : imperméable, le pictogramme seul face au miroir."""
    corps = f'<path d="M60 0 H640 V0 A0 0 0 0 0 640 0 H1340 Q1400 0 1400 60 V1440 Q1400 1500 1340 1500 H60 Q0 1500 0 1440 V60 Q0 0 60 0 Z" fill="{tissu(a, I)}"/>'
    s = [corps, '<clipPath id="cape-k1"><rect width="1400" height="1500" rx="60"/></clipPath>',
         f'<g clip-path="url(#cape-k1)">{semis(a, "pictogramme", 0, 0, 1400, 1500, 70, 210, 190, P, 0.9)}</g>',
         f'<rect x="560" y="0" width="280" height="260" rx="140" fill="#F3EEE4" opacity="{1 if a.rendu else 0}"/>',
         f'<circle cx="700" cy="150" r="104" fill="none" stroke="{P}" stroke-width="22"/>',
         f'<line x1="700" y1="0" x2="700" y2="46" stroke="{P}" stroke-width="3"/>']
    for k in range(3):
        s.append(f'<circle cx="{610 + k * 18}" cy="{60 + k * 6}" r="7" fill="url(#cuivre-metal)"/>')
    s.append(logo_centre(a, 'pictogramme', 700, 360, 130, V)[0])
    return ''.join(s)


# ══ LE LINGE ════════════════════════════════════════════════════════════
def bande_tissee(a, x0, y0, w, h, fond=C, encre=P, pas=62.5, largeur=34):
    """La bande jacquard : une rangée d'arches tissées dans le fil cuivre."""
    s = [f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="{a.metal(fond) if fond == C else fond}"/>',
         f'<rect x="{x0}" y="{y0 + 4}" width="{w}" height="2" fill="{encre}" opacity=".7"/>',
         f'<rect x="{x0}" y="{y0 + h - 6}" width="{w}" height="2" fill="{encre}" opacity=".7"/>']
    x = x0 + pas / 2
    while x < x0 + w:
        s.append(a.logo('pictogramme', x - largeur / 2, y0 + (h - largeur * 0.8255) / 2, largeur=largeur, couleur=encre)[0])
        x += pas
    return ''.join(s)


def eponge(a, x, y, w, h, encre):
    """Une serviette à plat : bouclette au rendu, ourlets piqués."""
    s = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{tissu(a, encre)}"/>']
    if a.rendu:
        s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="url(#bouclette)" opacity=".55"/>')
    s.append(f'<rect x="{x + 10}" y="{y + 10}" width="{w - 20}" height="{h - 20}" rx="4" fill="none" stroke="#000" stroke-opacity=".18" stroke-dasharray="4 3"/>')
    return ''.join(s)


def s1(a):
    """La serviette de lavage : éponge indigo profond, deux bandes tissées."""
    s = [eponge(a, 0, 0, 500, 900, P)]
    s.append(bande_tissee(a, 0, 90, 500, 60))
    s.append(bande_tissee(a, 0, 750, 500, 60))
    return ''.join(s)


def s2(a):
    """Le turban de séchage : microfibre, boucle et bouton."""
    d = 'M40 30 Q0 30 0 75 V225 Q0 270 40 270 L560 225 Q650 215 650 150 Q650 85 560 75 Z'
    s = [f'<path d="{d}" fill="{tissu(a, I)}"/>']
    if a.rendu:
        s.append(f'<path d="{d}" fill="url(#bouclette)" opacity=".35"/>')
    s.append(piqure('M40 42 Q12 42 12 75 V225 Q12 258 40 258 L558 214 Q638 205 638 150 Q638 95 558 86 Z', C, 1.1))
    s.append(f'<path d="M650 150 C700 120 720 180 690 196 C670 206 655 178 650 150" fill="none" stroke="{V}" stroke-width="7"/>')
    s.append(f'<circle cx="60" cy="150" r="13" fill="url(#cuivre-metal)" stroke="#7A4A26"/>')
    s.append(logo_centre(a, 'pictogramme', 520, 132, 40, C)[0])
    return ''.join(s)


def s3(a):
    """La serviette de cou : sous la cape, elle garde la nuque au sec."""
    s = [eponge(a, 0, 0, 800, 300, I)]
    s.append(f'<rect x="0" y="0" width="800" height="300" rx="8" fill="none" stroke="{V}" stroke-width="8"/>')
    s.append(logo_centre(a, 'pictogramme', 700, 125, 36, C)[0])
    return ''.join(s)


def pile(a):
    """Le rendu du linge : trois serviettes pliées, la bande devant."""
    s = []
    for k, (y, w) in enumerate(((260, 520), (170, 520), (80, 520))):
        x = 40 + k * 6
        s.append(f'<rect x="{x}" y="{y}" width="{w}" height="96" rx="22" fill="{tissu(a, P)}" stroke="#000" stroke-opacity=".12"/>')
        if a.rendu:
            s.append(f'<rect x="{x}" y="{y}" width="{w}" height="96" rx="22" fill="url(#bouclette)" opacity=".5"/>')
        s.append(bande_tissee(a, x + 300, y, 60, 96, pas=60, largeur=34))
    return ''.join(s)


# ══ LES FAUTEUILS ═══════════════════════════════════════════════════════
def gaufrage(a, nom, cx, y, largeur):
    """Un marquage à sec dans le cuir : le creux plus sombre, sans encre."""
    s, h = logo_centre(a, nom, cx, y, largeur, P)
    if a.rendu:
        ombre = logo_centre(a, nom, cx, y + 1.6, largeur, '#0E1030')[0]
        return f'<g opacity=".55">{ombre}</g><g opacity=".85">{s}</g>'
    return s


def coiffage(a, ox, dos=False):
    cx = ox + 325
    m = a.metal(C)
    s = [f'<ellipse cx="{cx}" cy="905" rx="275" ry="25" fill="{m}"/>',
         f'<rect x="{cx - 45}" y="600" width="90" height="300" fill="{m}"/>',
         f'<rect x="{cx - 52}" y="590" width="104" height="80" rx="8" fill="{P}"/>']
    if not dos:
        s.append(f'<rect x="{cx - 190}" y="760" width="380" height="26" rx="8" fill="{m}"/>'
                 f'<rect x="{cx - 120}" y="640" width="14" height="130" fill="{m}"/><rect x="{cx + 106}" y="640" width="14" height="130" fill="{m}"/>')
    for x in (ox, ox + 570):
        s.append(f'<rect x="{x + 30}" y="440" width="20" height="130" fill="{m}"/><rect x="{x}" y="400" width="80" height="50" rx="22" fill="{P}"/>')
    s.append(f'<rect x="{cx - 245}" y="470" width="490" height="110" rx="34" fill="{tissu(a, I)}"/>')
    s.append(f'<path d="M{cx - 260} 480 V110 Q{cx - 260} 40 {cx - 190} 40 H{cx + 190} Q{cx + 260} 40 {cx + 260} 110 V480 Z" fill="{tissu(a, I)}"/>')
    if dos:
        s.append(gaufrage(a, 'pictogramme', cx, 130, 140))
    else:
        for k in range(1, 4):
            s.append(f'<line x1="{cx - 260 + 130 * k}" y1="60" x2="{cx - 260 + 130 * k}" y2="470" stroke="{P}" stroke-width="3"/>')
            s.append(f'<line x1="{cx - 250}" y1="{40 + 110 * k}" x2="{cx + 250}" y2="{40 + 110 * k}" stroke="{P}" stroke-width="3"/>')
    return ''.join(s)


def f1(a):
    """Le fauteuil de coiffage, de face et de dos."""
    return coiffage(a, 0) + coiffage(a, 850, dos=True)


def f2(a):
    """Le bac de lavage, de profil : coque ivoire, vasque blanche profonde."""
    m = a.metal(C)
    s = [f'<rect x="180" y="420" width="180" height="580" rx="20" fill="{V}" stroke="#000" stroke-opacity=".12"/>',
         '<path d="M70 290 H470 V312 H70 Z" fill="#FFFFFF" stroke="#C9CCD1"/>',
         '<path d="M80 310 H460 Q455 455 270 465 Q85 455 80 310 Z" fill="#FBFBFA" stroke="#C9CCD1" stroke-width="2"/>',
         f'<rect x="455" y="318" width="40" height="34" rx="14" fill="{P}"/>',
         f'<path d="M520 1000 V700 Q520 640 600 640 H1690 Q1750 640 1750 700 V1000 Z" fill="{V}" stroke="#000" stroke-opacity=".12"/>',
         f'<path d="M478 336 L575 300 L812 548 L728 612 Z" fill="{tissu(a, I)}" stroke="{P}" stroke-width="2" stroke-linejoin="round"/>',
         f'<rect x="700" y="545" width="370" height="100" rx="30" fill="{tissu(a, I)}"/>',
         f'<rect x="1050" y="565" width="680" height="85" rx="30" fill="{tissu(a, I)}"/>',
         f'<rect x="760" y="470" width="250" height="32" rx="14" fill="{P}"/><rect x="980" y="500" width="18" height="60" fill="{m}"/>',
         f'<circle cx="1220" cy="820" r="62" fill="{m}"/>']
    s.append(logo_centre(a, 'pictogramme', 1220, 795, 70, '#7A4A26' if a.rendu else P)[0])
    return ''.join(s)


def f3(a):
    """Le fauteuil d'attente : velours indigo, pieds cuivre."""
    m = a.metal(C)
    s = [f'<path d="M110 640 L150 640 L140 800 L126 800 Z" fill="{m}"/><path d="M570 640 L610 640 L594 800 L580 800 Z" fill="{m}"/>',
         f'<path d="M70 300 Q70 40 360 40 Q650 40 650 300 V560 H70 Z" fill="{tissu(a, I)}"/>',
         f'<rect x="0" y="290" width="120" height="360" rx="56" fill="{tissu(a, I)}" stroke="{P}" stroke-width="2"/>',
         f'<rect x="600" y="290" width="120" height="360" rx="56" fill="{tissu(a, I)}" stroke="{P}" stroke-width="2"/>',
         f'<rect x="100" y="500" width="520" height="140" rx="44" fill="{tissu(a, I)}" stroke="{P}" stroke-width="2"/>']
    s.append(logo_centre(a, 'pictogramme', 360, 150, 60, C)[0])
    return ''.join(s)


def f4(a):
    """Le tabouret du maître : selle indigo, piétement cuivre à roulettes."""
    m = a.metal(C)
    s = []
    for x2, y2 in ((20, 700), (440, 700), (95, 712), (365, 712), (230, 716)):
        s.append(f'<line x1="230" y1="670" x2="{x2}" y2="{y2 - 14}" stroke="{m}" stroke-width="20" stroke-linecap="round"/>')
        s.append(f'<circle cx="{x2}" cy="{y2}" r="16" fill="{P}"/>')
    s.append(f'<rect x="205" y="420" width="50" height="255" fill="{m}"/><rect x="198" y="410" width="64" height="70" rx="8" fill="{P}"/>')
    s.append(f'<path d="M30 300 Q30 410 120 410 H340 Q430 410 430 300 Q330 345 230 345 Q130 345 30 300 Z" fill="{tissu(a, I)}"/>')
    s.append(gaufrage(a, 'pictogramme', 230, 350, 56))
    return ''.join(s)


def f5(a):
    """Le rehausseur MND Kids, vu de dessus."""
    s = [f'<rect x="0" y="0" width="400" height="400" rx="60" fill="{tissu(a, S)}" stroke="{a.metal(C)}" stroke-width="7"/>']
    s.append(logo_centre(a, 'pictogramme', 200, 70, 110, C)[0])
    s.append(texte('MND', 'cormorant', 92, 200, 290, 'milieu', 600, 0.12, I)[0])
    s.append(texte('KIDS', 'jost', 30, 200, 340, 'milieu', 500, 0.6, C)[0])
    return ''.join(s)


# ══ LES MIROIRS ═════════════════════════════════════════════════════════
def givre(a):
    """Le sablage : blanc givré au rendu, gris repérable sur la fiche."""
    return GIVRE if a.rendu else '#8C99A6'


def verre(a):
    return 'url(#miroir)' if a.rendu else '#E3E8EC'


def arche(w, h, r, x=0, y=0):
    return f'M{x} {y + h} V{y + r} A{r} {r} 0 0 1 {x + w} {y + r} V{y + h} Z'


def devise_en_bas(a, cx, y_fon, taille_fon, couleur):
    """« mi nyɔ́ ɖɛkpɛ », puis l'écho français dessous, centrés."""
    s1 = texte(DEVISE_FON, 'cormorant', taille_fon, cx, y_fon, 'milieu', 500, 0.02, couleur)[0]
    s2 = texte(DEVISE_FR, 'cormorant-italique', taille_fon * 0.56, cx, y_fon + taille_fon * 0.95, 'milieu', 500, 0, couleur)[0]
    return s1 + s2


def m1(a):
    """Le miroir arche de poste : l'arche du pictogramme, en grand."""
    s = [f'<path d="{arche(700, 1700, 350)}" fill="{a.metal(C)}"/>',
         f'<path d="{arche(668, 1684, 334, 16, 16)}" fill="{verre(a)}"/>']
    if a.rendu:
        s.append('<path d="M120 1600 L300 420 L360 420 L180 1600 Z" fill="#FFFFFF" opacity=".10"/>')
    s.append(m1_marque(a, givre(a)))
    return ''.join(s)


def m1_marque(a, c):
    return logo_centre(a, 'pictogramme', 350, 150, 120, c)[0] + devise_en_bas(a, 350, 1540, 46, c)


def m2(a):
    """Le miroir rond de la consultation (KÒKÒ) : la devise sur le pourtour."""
    s = [f'<circle cx="400" cy="400" r="400" fill="{a.metal(C)}"/>', f'<circle cx="400" cy="400" r="384" fill="{verre(a)}"/>']
    s.append(m2_marque(a, givre(a)))
    return ''.join(s)


def m2_marque(a, c):
    return (logo_centre(a, 'pictogramme', 400, 80, 90, c)[0]
            + texte_en_arc(DEVISE_FON + ' · ' + DEVISE_FR, 'cormorant-italique', 30, 400, 400, 340, en_bas=True, graisse=500, couleur=c))


def m3(a):
    """Le miroir double face sur socle : deux postes dos à dos."""
    s = [f'<rect x="-40" y="1880" width="880" height="120" rx="10" fill="{"url(#marbre)" if a.rendu else S}"/>',
         f'<rect x="-40" y="1876" width="880" height="10" fill="{a.metal(C)}"/>',
         f'<path d="{arche(800, 1880, 400)}" fill="{a.metal(C)}"/>',
         f'<path d="{arche(768, 1864, 384, 16, 16)}" fill="{verre(a)}"/>']
    s.append(m3_marque(a, givre(a)))
    return ''.join(s)


def m3_marque(a, c):
    return logo_centre(a, 'pictogramme', 400, 170, 130, c)[0] + devise_en_bas(a, 400, 1700, 50, c)


def m4(a):
    """Le miroir à main : le verre d'un côté, le cuivre gravé de l'autre."""
    m = a.metal(C)
    grave = '#7A4A26'
    s = []
    for cx in (120, 400):
        s.append(f'<rect x="{cx - 16}" y="222" width="32" height="128" rx="14" fill="{m}"/>')
        s.append(f'<circle cx="{cx}" cy="115" r="112" fill="{m}"/>')
    s.append(f'<circle cx="120" cy="115" r="102" fill="{verre(a)}"/>')
    s.append(m4_marque(a, grave, 400, 115))
    return ''.join(s)


def m4_marque(a, c, cx, cy):
    return (logo_centre(a, 'pictogramme', cx, cy - 60 * 0.8255 / 2, 60, c)[0]
            + texte_en_arc(DEVISE_FON, 'cormorant', 15, cx, cy, 80, en_bas=False, graisse=500, couleur=c)
            + texte_en_arc(DEVISE_FR, 'cormorant-italique', 11.5, cx, cy, 92, en_bas=True, graisse=500, couleur=c))


def proportion_de(nom):
    from formes import proportion
    return proportion(nom)
