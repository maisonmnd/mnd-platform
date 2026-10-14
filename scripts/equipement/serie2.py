# -*- coding: utf-8 -*-
"""LA SÉRIE 2 : quatre bacs de lavage et cinq fauteuils, 14 octobre 2026.

« Here the second sets of shampoo wash chairs, and salon chairs that we can
design with the brand pattern of Maison MND and also the name of the house
embroided somewhere on them » (Yéman, neuf photos de référence).

Deux marques sur chaque pièce, toujours les mêmes :
  · LE MOTIF : le semis de pictogrammes, gaufré ton sur ton sur les grands
    panneaux (dos des dossiers, flancs des bacs) ; pictogramme de 34 mm au pas
    de 90 × 80 mm, raccord de 360 × 160 mm ;
  · LE NOM : le verrou couché brodé fil cuivre, 170 mm de large (le couché se
    brode à 130 mm au moins), au dos de l'appui-tête ou sur le repose-pieds.
Le nom va au dos : les photos de locks se prennent de dos, le dossier entre
dans le cadre. Rien d'écrit ne fait face au miroir.
"""
from dessins import C, I, P, V, S, A, tissu, semis, logo_centre

TON = {I: P, P: '#0E1030', V: A, S: A}   # le creux du gaufrage selon le cuir
NOM_L = 170                               # largeur du nom brodé, mm


def motif(a, ident, d, x0, y0, x1, y1, cuir, opacite=0.85):
    """Le semis gaufré, découpé à la forme du panneau."""
    return (f'<clipPath id="m-{ident}"><path d="{d}"/></clipPath>'
            f'<g clip-path="url(#m-{ident})" opacity="{opacite}">{semis(a, "pictogramme", x0, y0, x1, y1, 34, 90, 80, TON[cuir])}</g>')


def nom(a, cx, y, largeur=NOM_L):
    return logo_centre(a, 'verrou-couche', cx, y, largeur, a.metal(C) if a.rendu else C)[0]


def rect_d(x, y, w, h, r):
    return f'M{x + r} {y} H{x + w - r} Q{x + w} {y} {x + w} {y + r} V{y + h - r} Q{x + w} {y + h} {x + w - r} {y + h} H{x + r} Q{x} {y + h} {x} {y + h - r} V{y + r} Q{x} {y} {x + r} {y} Z'


# ══ LES FAUTEUILS DE COIFFAGE ═══════════════════════════════════════════
def chaise(a, ident, ox, dos, bras, base, cuir, coutures=False):
    """Un fauteuil de coiffage de face (dos=False) ou de dos, sur 660 mm."""
    cx = ox + 330
    m = a.metal(C)
    cu = tissu(a, cuir)
    s = []
    if base == 'rond':
        s.append(f'<ellipse cx="{cx}" cy="925" rx="280" ry="22" fill="{m}"/>')
    else:
        s.append(f'<path d="M{cx - 300} 940 L{cx + 300} 940 L{cx + 255} 905 L{cx - 255} 905 Z" fill="{m}"/>')
    s.append(f'<rect x="{cx - 40}" y="610" width="80" height="300" fill="{m}"/>')
    if not dos:
        s.append(f'<rect x="{cx - 170}" y="800" width="340" height="22" rx="8" fill="{m}"/><rect x="{cx - 8}" y="700" width="16" height="110" fill="{m}"/>')
    s.append(f'<rect x="{cx - 110}" y="60" width="220" height="92" rx="30" fill="{cu}"/><rect x="{cx - 14}" y="150" width="28" height="26" fill="{m}"/>')
    dossier = rect_d(cx - 230, 170, 460, 340, 40)
    s.append(f'<path d="{dossier}" fill="{cu}"/>')
    if dos:
        s.append(motif(a, ident, dossier, cx - 230, 170, cx + 230, 510, cuir))
        s.append(nom(a, cx, 106 - 170 / 3.193 / 2, 170 * 0.98 if False else 170))
    elif coutures:
        for k in range(1, 10):
            s.append(f'<line x1="{cx - 230 + 46 * k}" y1="185" x2="{cx - 230 + 46 * k}" y2="495" stroke="{TON[cuir]}" stroke-width="3"/>')
    s.append(f'<path d="{rect_d(cx - 250, 500, 500, 100, 30)}" fill="{cu}"/>')
    for sg in (-1, 1):
        x_in, x_out = cx + sg * 232, cx + sg * 318
        if bras in ('courbe', 'courbe-pad'):
            s.append(f'<path d="M{x_in} 330 C{x_out + sg * 10} 330 {x_out + sg * 12} 420 {x_out} 520 L{cx + sg * 250} 600" fill="none" stroke="{m}" stroke-width="26" stroke-linecap="round"/>')
            if bras == 'courbe-pad':
                s.append(f'<path d="{rect_d(min(x_in, x_out) - 6, 330, abs(x_out - x_in) + 12, 46, 20)}" fill="{cu}"/>')
        else:
            s.append(f'<path d="{rect_d(min(x_in, x_out), 330, abs(x_out - x_in), 270, 22)}" fill="{cu}"/>')
            if bras == 'triangle':
                s.append(f'<path d="M{x_in} 336 L{x_out} 336 L{x_out} 470 Z" fill="none" stroke="{m}" stroke-width="14" stroke-linejoin="round"/>')
            else:
                s.append(f'<path d="{rect_d(min(x_in, x_out) + 4, 336, abs(x_out - x_in) - 8, 74, 4)}" fill="none" stroke="{m}" stroke-width="14"/>')
    return ''.join(s)


def c1(a):
    return chaise(a, 'c1', 0, False, 'courbe', 'carre', I, True) + chaise(a, 'c1', 860, True, 'courbe', 'carre', I)


def c2(a):
    return chaise(a, 'c2', 0, False, 'triangle', 'rond', S) + chaise(a, 'c2', 860, True, 'triangle', 'rond', S)


def c3(a):
    return chaise(a, 'c3', 0, False, 'rectangle', 'carre', V) + chaise(a, 'c3', 860, True, 'rectangle', 'carre', V)


def c4(a):
    return chaise(a, 'c4', 0, False, 'courbe-pad', 'rond', I) + chaise(a, 'c4', 860, True, 'courbe-pad', 'rond', I)


def c5(a):
    """Le fauteuil inclinable de 90 à 175° : de profil (droit, et couché en
    pointillés), puis de dos avec le motif et le nom."""
    m = a.metal(C)
    cu = tissu(a, I)
    s = [f'<ellipse cx="330" cy="925" rx="270" ry="22" fill="{m}"/><rect x="295" y="640" width="70" height="275" fill="{m}"/>',
         f'<path d="{rect_d(150, 520, 380, 130, 40)}" fill="{cu}"/>',
         f'<path d="M150 560 L80 190 Q74 150 112 146 L178 140 Q214 138 222 176 L262 540 Z" fill="{cu}"/>',
         f'<path d="{rect_d(70, 70, 150, 90, 36)}" fill="{cu}"/>',
         f'<path d="{rect_d(530, 560, 230, 90, 30)}" fill="{cu}"/>',
         f'<path d="{rect_d(170, 420, 300, 60, 24)}" fill="{tissu(a, P)}"/>',
         '<path d="M150 560 L-60 470 M330 500 L-80 455" fill="none" stroke="#9AA3B5" stroke-width="5" stroke-dasharray="14 10"/>',
         '<path d="M530 600 L860 600" fill="none" stroke="#9AA3B5" stroke-width="5" stroke-dasharray="14 10"/>']
    cx = 1250
    dossier = rect_d(cx - 240, 150, 480, 420, 60)
    s += [f'<ellipse cx="{cx}" cy="925" rx="270" ry="22" fill="{m}"/><rect x="{cx - 35}" y="640" width="70" height="275" fill="{m}"/>',
          f'<path d="{rect_d(cx - 300, 330, 600, 320, 50)}" fill="{cu}"/>', f'<path d="{dossier}" fill="{cu}"/>',
          motif(a, 'c5', dossier, cx - 240, 150, cx + 240, 570, I),
          f'<path d="{rect_d(cx - 130, 40, 260, 100, 40)}" fill="{cu}"/>', nom(a, cx, 90 - 170 / 3.193 / 2)]
    return ''.join(s)


# ══ LES BACS DE LAVAGE ══════════════════════════════════════════════════
def vasque(a, x, y, w=330):
    """Une vasque céramique blanche, de profil, sur sa colonne."""
    return (f'<path d="M{x} {y} H{x + w} V{y + 22} H{x} Z" fill="#FFFFFF" stroke="#C9CCD1"/>'
            f'<path d="M{x + 10} {y + 20} H{x + w - 10} Q{x + w - 18} {y + 150} {x + w / 2} {y + 160} Q{x + 18} {y + 150} {x + 10} {y + 20} Z" fill="#FBFBFA" stroke="#C9CCD1" stroke-width="2"/>'
            f'<rect x="{x + w / 2 - 12}" y="{y + 158}" width="24" height="{860 - y - 160}" fill="{"#8C94A6" if a.rendu else "#AAB2C0"}"/>'
            f'<path d="M{x + w - 60} {y - 20} q30 -20 50 0" fill="none" stroke="{a.metal(C)}" stroke-width="8" stroke-linecap="round"/>')


def flanc(a, ident, x, y, w, h, cuir, r=26, avec_motif=True):
    d = rect_d(x, y, w, h, r)
    s = f'<path d="{d}" fill="{tissu(a, cuir)}"/>'
    if avec_motif:
        s += motif(a, ident, d, x, y, x + w, y + h, cuir)
    return s


def b1(a):
    """Le lit de lavage électrique : trois coussins, socle inox, bassin en tête."""
    m = a.metal(C)
    s = [f'<path d="M80 905 H1500 Q1540 905 1540 870 Q1540 835 1500 835 H80 Q40 835 40 870 Q40 905 80 905 Z" fill="{"url(#inox)" if a.rendu else "#B9BEC6"}"/>',
         f'<rect x="520" y="560" width="200" height="280" fill="{m}"/>',
         f'<rect x="60" y="300" width="300" height="540" rx="26" fill="{tissu(a, V)}"/>',
         vasque(a, 60, 280, 300).replace(f'height="{860 - 280 - 160}"', 'height="0"'),
         flanc(a, 'b1', 60, 440, 300, 400, V, 26, True),
         f'<path d="M380 470 L690 420 L720 540 L410 600 Z" fill="{tissu(a, I)}"/>',
         f'<path d="{rect_d(700, 520, 330, 110, 30)}" fill="{tissu(a, I)}"/>',
         f'<path d="M1020 540 L1370 560 Q1420 565 1420 610 L1410 650 L1020 630 Z" fill="{tissu(a, I)}"/>',
         f'<path d="{rect_d(1380, 580, 110, 70, 20)}" fill="{tissu(a, P)}"/>',
         f'<rect x="60" y="640" width="60" height="110" rx="6" fill="#DADFE6" stroke="#9AA3B5"/><rect x="72" y="652" width="36" height="40" fill="{P}"/>']
    s.append(nom(a, 1200, 560 - 170 / 3.193 / 2 + 2, 150))
    return ''.join(s)


def dossier_de_bac(a, cuir):
    """Le dossier vu de profil : il monte du siège jusqu'à la vasque."""
    return (f'<path d="M300 318 Q330 296 372 300 L700 470 L560 470 Z" fill="{tissu(a, cuir)}"/>'
            f'<path d="{rect_d(520, 440, 380, 60, 26)}" fill="{tissu(a, cuir)}"/>')


def b2(a):
    """Le bac à repose-pieds séparé : flancs à motif, bandes cuivre sur les accoudoirs."""
    m = a.metal(C)
    s = [vasque(a, 40, 240), dossier_de_bac(a, I),
         flanc(a, 'b2', 120, 480, 780, 380, I),
         f'<rect x="130" y="470" width="760" height="12" rx="6" fill="{m}"/>',
         f'<rect x="140" y="860" width="40" height="40" fill="{m}"/><rect x="840" y="860" width="40" height="40" fill="{m}"/>',
         f'<path d="{rect_d(1000, 560, 300, 90, 30)}" fill="{tissu(a, I)}"/>',
         f'<path d="{rect_d(1040, 650, 220, 250, 20)}" fill="{tissu(a, I)}"/>',
         f'<rect x="1040" y="880" width="220" height="20" fill="{m}"/>',
         nom(a, 1150, 605 - 150 / 3.193 / 2, 150)]
    return ''.join(s)


def b3(a):
    """Le bac aux arceaux cuivre : les arceaux dessinent l'arche du pictogramme."""
    m = a.metal(C)
    flanc_d = 'M120 520 H900 V720 Q900 860 760 860 H260 Q120 860 120 720 Z'
    s = [vasque(a, 40, 240), dossier_de_bac(a, I),
         f'<path d="{flanc_d}" fill="{tissu(a, I)}"/>', motif(a, 'b3', flanc_d, 120, 520, 900, 860, I),
         f'<rect x="120" y="480" width="780" height="44" rx="20" fill="{tissu(a, I)}"/>',
         f'<path d="M170 700 Q170 520 330 520 Q490 520 490 700" fill="none" stroke="{m}" stroke-width="20" stroke-linecap="round"/>',
         f'<path d="M530 700 Q530 520 690 520 Q850 520 850 700" fill="none" stroke="{m}" stroke-width="20" stroke-linecap="round"/>',
         f'<path d="{rect_d(1000, 560, 300, 90, 30)}" fill="{tissu(a, I)}"/>',
         f'<path d="M1030 650 V880 M1270 650 V880 M1030 880 H1270" fill="none" stroke="{m}" stroke-width="18" stroke-linecap="round"/>',
         nom(a, 1150, 605 - 150 / 3.193 / 2, 150)]
    return ''.join(s)


def b4(a):
    """Le bac à bandes : cuir sable, bandes argile, repose-jambes électrique déplié."""
    m = a.metal(C)
    s = [vasque(a, 40, 240, 300), dossier_de_bac(a, S),
         flanc(a, 'b4', 120, 480, 700, 380, S),
         f'<rect x="120" y="812" width="700" height="22" fill="{A}"/>',
         f'<rect x="150" y="858" width="640" height="42" fill="{m}"/>',
         f'<path d="M820 478 L1370 528 Q1400 532 1398 560 L1394 590 L820 566 Z" fill="{tissu(a, S)}"/>',
         f'<path d="M1300 522 L1296 586" stroke="{A}" stroke-width="14"/>',
         f'<path d="{rect_d(480, 440, 360, 62, 26)}" fill="{tissu(a, S)}"/>',
         nom(a, 660, 471 - 150 / 3.193 / 2, 150)]
    return ''.join(s)


# ══ LES CAHIERS DES CHARGES ═════════════════════════════════════════════
import os as _os
from pieces import piece
from oeuvres import OEUVRES, GRAVURE, logo_seul, semis as _semis
from enseignes import Atelier as _Atelier

# Les photos envoyées par Yéman, rangées dans le Drive (jamais dans le dépôt public).
REFS = ('G:/My Drive/Maison MND/09 · Achats et fournisseurs/Tabliers, linge, fauteuils et miroirs · 14-10-2026/'
        'Série 2 · bacs et fauteuils/Photos de référence')
CHOIX = 'au choix : la série 2 propose des modèles, la Maison choisit'
MOTIF_EN = 'Debossed tone-on-tone repeat pattern of our pictogram on {ou} (repeat tile 360 × 160 mm supplied, pictogram 34 mm at 90 × 80 mm pitch).'
NOM_EN = 'Horizontal logo « MAISON MND » embroidered in copper thread, {l} mm wide, on {ou}.'
REFUS_EN = ' Please propose YOUR closest existing model; the photo shows the style only.'
ENTRETIEN_FR, CARE_EN = 'Nettoyant doux, jamais de solvant sur le gaufrage.', 'Mild cleaner; no solvent on debossed areas.'
POUR_LE_DOS = 'Les photos de locks se prennent de dos : le dossier entre dans le cadre, avec son motif et le nom.'


def serie(id_, famille, dessin, nom_, name, ref, fr, en, w, h):
    piece(id=id_, famille=famille, dessin=dessin, w=w, h=h, scene='sol', choix=True, reference=_os.path.join(REFS, f'{id_} - reference.png'),
          nom=nom_, name=name, qte=0, qte_fr=CHOIX, dims_fr=fr.pop('dims'), dims_en=en.pop('dims'),
          source_fr='Un fabricant spécialisé : voir « Les fabricants en Chine ».', fr=fr, en=en)


def bac(id_, dessin, nom_, name, ref, fr, en):
    serie(id_, 'Bacs, série 2', dessin, nom_, name, ref, fr, en, 1560, 940)


def fauteuil(id_, dessin, nom_, name, ref, fr, en):
    serie(id_, 'Fauteuils, série 2', dessin, nom_, name, ref, fr, en, 1520, 945)


def chaise_fr(cuir_fr, bras_fr, marque_fr, pourquoi=POUR_LE_DOS):
    return dict(dims='environ 66 × 60 cm, hauteur réglable, appui-tête', matiere=f'{cuir_fr}, {bras_fr}.',
                marquage=f'Le motif gaufré{marque_fr} au dos du dossier ; « MAISON MND » brodé cuivre, 170 mm, au dos de l’appui-tête.',
                entretien=ENTRETIEN_FR, pourquoi=pourquoi)


def chaise_en(materiau, sur=''):
    return dict(dims='approx. 660 × 600 mm, hydraulic, headrest', material=materiau,
                branding=MOTIF_EN.format(ou='the back of the backrest' + sur) + ' ' + NOM_EN.format(l=170, ou='the back of the headrest') + REFUS_EN, care=CARE_EN)

bac('L1', b1, 'Lit de lavage électrique', 'Electric full-lying shampoo bed', '199.png',
    dict(dims='environ 190 × 70 cm, couchée à plat, hauteur réglable',
         matiere='Trois coussins PU indigo, socle inox brossé finition cuivre (PVD) au lieu de l’inox brut, vasque céramique blanche profonde sur coque ivoire, commande électrique, mitigeur et douchette.',
         marquage='Le motif gaufré argile sur la coque ivoire de la tête ; « MAISON MND » brodé cuivre, 150 mm, sur le flanc du coussin des jambes.',
         entretien=ENTRETIEN_FR, pourquoi='Couchée à plat, la cliente garde la nuque reposée pendant tout le lavage KLƆKLƆ des locks longues.'),
    dict(dims='approx. 1900 × 700 mm, lies flat, adjustable height',
         material='Three indigo PU cushions; brushed stainless base with COPPER PVD finish (not raw steel); deep white ceramic basin on an ivory shell; electric control, mixer and hand shower.',
         branding=MOTIF_EN.format(ou='the ivory head shell (clay-coloured deboss)') + ' ' + NOM_EN.format(l=150, ou='the side of the leg cushion') + REFUS_EN, care=CARE_EN))

bac('L2', b2, 'Bac à repose-pieds', 'Backwash unit with ottoman', '200.png',
    dict(dims='environ 130 × 65 cm, repose-pieds 40 × 35 cm',
         matiere='Corps PU indigo, vasque céramique BLANCHE (au lieu de noire), bandes cuivre sur les accoudoirs (au lieu de l’or), repose-pieds séparé à plinthe cuivre.',
         marquage='Le motif gaufré sur les deux flancs ; « MAISON MND » brodé cuivre, 150 mm, sur le flanc du repose-pieds.',
         entretien=ENTRETIEN_FR, pourquoi='Le plus sobre des quatre : un bloc indigo, le motif sur les flancs, le nom au pied.'),
    dict(dims='approx. 1300 × 650 mm, ottoman approx. 400 × 350 mm',
         material='Indigo PU body; WHITE ceramic basin (not black); COPPER trims on armrests (not gold); separate ottoman with copper plinth.',
         branding=MOTIF_EN.format(ou='both side panels') + ' ' + NOM_EN.format(l=150, ou='the side of the ottoman') + REFUS_EN, care=CARE_EN))

bac('L3', b3, 'Bac aux arceaux cuivre', 'Backwash unit with copper arm bands', '201.png',
    dict(dims='environ 130 × 65 cm, repose-pieds à cadre cuivre',
         matiere='PU indigo, arceaux cuivre (au lieu de l’or), repose-pieds sur cadre cuivre, vasque céramique blanche.',
         marquage='Le motif gaufré sur le flanc ; « MAISON MND » brodé cuivre, 150 mm, sur le repose-pieds.',
         entretien=ENTRETIEN_FR, pourquoi='Les arceaux dessinent l’arche du pictogramme : la forme de la Maison, en métal.'),
    dict(dims='approx. 1300 × 650 mm, ottoman on copper frame',
         material='Indigo PU; curved arm bands in COPPER finish (not gold); ottoman on a copper frame; white ceramic basin.',
         branding=MOTIF_EN.format(ou='the side panel') + ' ' + NOM_EN.format(l=150, ou='the ottoman') + REFUS_EN, care=CARE_EN))

bac('L4', b4, 'Bac à bandes, repose-jambes électrique', 'Shampoo unit with bands and electric leg rest', '202.png',
    dict(dims='environ 140 × 70 cm, repose-jambes déplié',
         matiere='PU sable, bandes argile et plinthe cuivre, vasque céramique blanche, repose-jambes électrique.',
         marquage='Le motif gaufré argile sur sable, sur le bloc latéral ; « MAISON MND » brodé cuivre, 150 mm, sur l’accoudoir.',
         entretien=ENTRETIEN_FR, pourquoi='La photo est déjà presque aux couleurs de la Maison, mais elle porte la marque d’un autre : on demande au fabricant SON modèle le plus proche, jamais une copie.'),
    dict(dims='approx. 1400 × 700 mm with leg rest extended',
         material='Sand PU, clay-coloured bands, COPPER plinth, white ceramic basin, electric leg rest.',
         branding=MOTIF_EN.format(ou='the side block (clay-coloured deboss on sand)') + ' ' + NOM_EN.format(l=150, ou='the armrest') + REFUS_EN, care=CARE_EN))

fauteuil('C1', c1, 'Fauteuil aux accoudoirs courbes, embase carrée', 'Styling chair, curved arms, square base', '203.png',
         chaise_fr('PU indigo, coutures verticales au dossier', 'accoudoirs courbes finition cuivre (au lieu du chrome), embase carrée cuivre', ''),
         chaise_en('Indigo PU, vertical channel stitching on the front of the backrest, curved armrests in COPPER finish (not chrome), square base in copper finish.'))
fauteuil('C2', c2, 'Fauteuil aux cadres triangulaires', 'Styling chair, triangular arm frames', '204.png',
         chaise_fr('PU sable (au lieu de gris)', 'cadres triangulaires et embase ronde finition cuivre', ' argile'),
         chaise_en('Sand PU (not grey), triangular arm frames and round base in COPPER finish.', ' (clay-coloured deboss on sand)'))
fauteuil('C3', c3, 'Fauteuil aux cadres rectangulaires', 'Styling chair, rectangular arm frames', '205.png',
         chaise_fr('PU ivoire', 'cadres rectangulaires et embase carrée finition cuivre', ' argile',
                   'L’ivoire marque vite : sa place est à l’accueil ou à la consultation, pas au lavage.'),
         chaise_en('Ivory PU, rectangular arm frames and square base in COPPER finish.', ' (clay-coloured deboss on ivory)'))
fauteuil('C4', c4, 'Fauteuil aux accoudoirs garnis, embase ronde', 'Styling chair, padded curved arms, round base', '206.png',
         chaise_fr('PU indigo', 'accoudoirs courbes finition cuivre garnis sur le dessus, embase ronde cuivre', ''),
         chaise_en('Indigo PU, curved armrests in COPPER finish with padded tops, round copper-finish base.'))
c5_fr = chaise_fr('PU indigo (au lieu de violet)', 'embase ronde finition cuivre, repose-pieds, coussin de tête', '',
                  'Une création VÈKPÈ dure des heures : la cliente s’allonge, le maître travaille.')
c5_fr['dims'] = 'environ 75 × 75 cm assise, 160 cm inclinée à 175°, repose-pieds'
c5_en = chaise_en('Indigo PU (not purple), round base in COPPER finish, footrest, head pillow; recline 90 to 175 degrees.')
c5_en['dims'] = 'approx. 750 × 750 mm seated, 1600 mm reclined at 175 degrees, footrest'
fauteuil('C5', c5, 'Fauteuil inclinable de 90 à 175°', 'Reclining chair, 90 to 175 degrees', '207.png', c5_fr, c5_en)

# ══ LES FICHIERS PARTAGÉS DE LA SÉRIE 2 ═════════════════════════════════
TUILE = ('SERIE2-3 deboss repeat tile 360x160mm', 360, 160, lambda: _semis(_Atelier(False), 'pictogramme', 0, 0, 360, 160, 34, 90, 80, GRAVURE),
         None, None, 'Blind deboss, no ink. Filled area = pressed area. Seamless repeat.')
NOM170 = ('SERIE2-1 embroidery MAISON MND 170mm', 190, 70, lambda: logo_seul('verrou-couche', 170, C, 190, 70), None, None,
          'Copper thread. MAISON letters 6.6 mm high. Fabric colour per item sheet.')
NOM150 = ('SERIE2-2 embroidery MAISON MND 150mm', 170, 64, lambda: logo_seul('verrou-couche', 150, C, 170, 64), None, None,
          'Copper thread. MAISON letters 5.9 mm high. Fabric colour per item sheet.')
for k in ('L1', 'L2', 'L3', 'L4'):
    OEUVRES[k] = [NOM150, TUILE]
for k in ('C1', 'C2', 'C3', 'C4', 'C5'):
    OEUVRES[k] = [NOM170, TUILE]
