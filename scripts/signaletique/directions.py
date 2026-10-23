# -*- coding: utf-8 -*-
"""LES PANNEAUX DE DIRECTION DE LA MAISON, 23 octobre 2026.

« Fais plusieurs dessins de panneaux de direction, de coin de rue, pour la Maison MND »
(Yéman, d'après le poteau d'Amen Corner, le panneau touristique brun, la flèche de
mariage et le petit poteau de table). Cinq dessins, à plat, en millimètres ; le logo
est toujours le verrou officiel, jamais retapé. Les distances sont à mesurer sur place.

Elle en garde quatre au sélecteur pour la demande de devis : le poteau (N13), la flèche
de rue (N14), la flèche ivoire (N15) et le poteau de table (N16) ; N12 reste le nom de
l'ancienne feuille d'autocollants chez Lico Sign, on ne le reprend pas. Puis « Oui, en N17 » :
la plaque d'angle aussi.

Chaque dessin rend (viewBox de la page, éléments, contours de découpe) : les éléments
sont posés dans le cadre 0 0 w h de la pièce, un par morceau, dans l'ordre que lisent
les recettes de volumes.py.
"""
from enseignes import (C, I, S, V, DEVISE_FR, ajuste, POTEAU_W, POTEAU_H, RUE_W, RUE_H, IVOIRE_W, IVOIRE_H,  # noqa: F401
                       TABLE_W, TABLE_H, ANGLE_W, ANGLE_H)
from formes import pose_logo, proportion, texte, texte_en_arc


def _ligne(t, famille, taille, cx, y, couleur, largeur, graisse=500, interlettre=0.0):
    return texte(t, famille, ajuste(t, famille, taille, largeur, graisse, interlettre), cx, y, 'milieu', graisse, interlettre, couleur)[0]


def _logo(nom, cx, cy, largeur, couleur):
    h = largeur / proportion(nom)
    return pose_logo(nom, cx - largeur / 2, cy - h / 2, largeur=largeur, couleur=couleur)[0]


def _lame(x0, y0, longueur, hauteur, vers_droite):
    """Le contour d'une lame en flèche, pointe d'un côté, bout droit de l'autre."""
    p = hauteur / 2
    if vers_droite:
        return f'M{x0} {y0}H{x0 + longueur - p}L{x0 + longueur} {y0 + p}L{x0 + longueur - p} {y0 + hauteur}H{x0}Z'
    return f'M{x0} {y0}H{x0 - longueur + p}L{x0 - longueur} {y0 + p}L{x0 - longueur + p} {y0 + hauteur}H{x0}Z'


def _chemin(d, fond, trait=None, ep=0):
    t = f' stroke="{trait}" stroke-width="{ep}" stroke-linejoin="round"' if trait else ''
    return f'<path d="{d}" fill="{fond}"{t}/>'


# ── 1 · Le poteau de la Maison (Amen Corner) ─────────────────────────────
# « Il faut mettre Consultation à la place de Maison MND », puis « Consultation reste en ivoire comme les autres »
# (23 oct. 2026) : cinq lames ivoire, toutes pareilles.
POTEAU_LAMES = [('CONSULTATION', True), ('ACCUEIL', False), ('LES ATELIERS', True), ('BOUTIQUE', False), ('TOILETTES', True)]
# « Rajoute au haut du poteau Bienvenue Maison MND, comme la tête qu'on met sur les sapins de Noël » (23 oct. 2026) :
# un disque indigo à cerclage cuivre sur une tige, « BIENVENUE » en arc et le verrou debout. Le poteau garde sa hauteur
# sous le chapeau ; tout descend de TETE et la pièce passe à 2980 mm.
TETE, TETE_D = 580, 520


def poteau():
    """Poteau carré indigo, chapeau et bague cuivre, cinq lames ivoire, et la tête « Bienvenue » au-dessus.
    Éléments : 0 poteau, 1 chapeau, 2 dessus du chapeau, 3 bague de pied, puis lame et texte de chaque lame (4 à 13),
    puis 14 tige, 15 disque, 16 cerclage, 17 BIENVENUE, 18 logo."""
    cx, t = POTEAU_W / 2, TETE
    els = [f'<rect x="{cx - 55}" y="{t + 60}" width="110" height="2340" fill="{I}"/>',
           f'<rect x="{cx - 75}" y="{t + 20}" width="150" height="50" fill="{C}"/>',
           f'<rect x="{cx - 62}" y="{t}" width="124" height="24" fill="{C}"/>',
           f'<rect x="{cx - 75}" y="{t + 2380}" width="150" height="20" fill="{C}"/>']
    coupes = []
    y = t + 230
    for mot, droite in POTEAU_LAMES:
        x0 = cx + 55 if droite else cx - 55
        d = _lame(x0, y, 820, 150, droite)
        els += [_chemin(d, V, I, 6), _ligne(mot, 'cormorant', 92, x0 + (360 if droite else -360), y + 108, I, 600, 600, 0.06)]
        coupes.append(d)
        y += 190
    r = TETE_D / 2
    cy = r
    els += [f'<rect x="{cx - 25}" y="{TETE_D - 6}" width="50" height="{t - TETE_D + 12}" fill="{C}"/>',
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{I}"/>',
            f'<circle cx="{cx}" cy="{cy}" r="{r - 16}" fill="none" stroke="{C}" stroke-width="10"/>',
            texte_en_arc('BIENVENUE', 'cormorant', 66, cx, cy, r - 86, en_bas=False, graisse=600, interlettre=0.18, couleur=C),
            _logo('verrou-debout', cx, cy + 42, 220, V)]
    coupes.append(f'M{cx - r} {cy}A{r} {r} 0 1 0 {cx + r} {cy}A{r} {r} 0 1 0 {cx - r} {cy}Z')
    return '-40 -40 1950 3060', els, coupes


# ── 2 · La flèche de rue (le panneau touristique) ────────────────────────

def fleche_rue():
    """Panneau cuivre à bord ivoire, chevron ivoire, le logo en ivoire et la distance.
    Éléments : 0 panneau ivoire, 1 champ cuivre, 2 chevron, 3 logo, 4 distance."""
    W, H, r = RUE_W, RUE_H, 30
    p = H / 2
    ext = f'M0 {p}L{p * 0.55} 0H{W - r}Q{W} 0 {W} {r}V{H - r}Q{W} {H} {W - r} {H}H{p * 0.55}Z'
    e = 22
    k = p - e
    inte = f'M{e * 1.6} {p}L{e * 1.6 + k * 0.55} {e}H{W - e - r + 8}Q{W - e} {e} {W - e} {e + r - 8}V{H - e - r + 8}Q{W - e} {H - e} {W - e - r + 8} {H - e}H{e * 1.6 + k * 0.55}Z'
    chev = f'M300 95L170 {p}L300 {H - 95}H370L240 {p}L370 95Z'
    els = [_chemin(ext, V, '#B7AFA2', 2), _chemin(inte, C), _chemin(chev, V),
           _logo('verrou-couche', 860, 190, 640, V),
           _ligne('Suru-Léré · à 100 m', 'jost', 52, 860, 355, V, 640, 500, 0.04)]
    return '-10 -10 1420 480', els, [ext]


# ── 3 · La flèche ivoire (le panneau du mariage) ─────────────────────────

def fleche_ivoire():
    """Flèche ivoire à liseré indigo, chevron indigo, le logo et la devise.
    Éléments : 0 base indigo, 1 face ivoire, 2 chevron, 3 logo, 4 devise."""
    W, H = IVOIRE_W, IVOIRE_H
    p = H / 2
    ext = f'M0 18Q0 0 18 0H{W - p}L{W} {p}L{W - p} {H}H18Q0 {H} 0 {H - 18}Z'
    e = 20
    inte = f'M{e} {e + 14}Q{e} {e} {e + 14} {e}H{W - p - 6}L{W - e * 1.5} {p}L{W - p - 6} {H - e}H{e + 14}Q{e} {H - e} {e} {H - e - 14}Z'
    chev = f'M{W - 300} 85L{W - 180} {p}L{W - 300} {H - 85}H{W - 362}L{W - 242} {p}L{W - 362} 85Z'
    els = [_chemin(ext, I), _chemin(inte, V), _chemin(chev, I),
           # « Descends votre beauté est déjà là » (23 oct. 2026) : le logo remonte, la devise descend.
           _logo('verrou-couche', 440, 114, 520, I),
           _ligne(DEVISE_FR, 'cormorant-italique', 58, 440, 286, C, 600)]
    return '-10 -10 1220 360', els, [ext]


# ── 4 · Le poteau de table (le comptoir) ─────────────────────────────────
# « À la place d'Instagram, mets le code MoMoPay *880*41*909099*Montant# » (23 oct. 2026).
TABLE_LAMES = [('VOTRE BEAUTÉ', '0 km · déjà là'), ('RÉSERVER', 'maisonmnd.com'), ('MOMOPAY', '*880*41*909099*Montant#')]


def poteau_table():
    """Petit poteau indigo à bagues cuivre, trois lames ivoire : la devise en distance, réserver, le MoMoPay.
    Éléments : 0 poteau, 1 tête arrondie, 2 socle, puis bague, lame, mot et ligne de chaque lame."""
    cx = 62
    els = [f'<rect x="{cx - 12}" y="18" width="24" height="296" rx="3" fill="{I}"/>',
           f'<path d="M{cx - 12} 30Q{cx - 12} 6 {cx} 6Q{cx + 12} 6 {cx + 12} 30Z" fill="{I}"/>',
           f'<rect x="{cx - 62}" y="312" width="124" height="18" rx="4" fill="{I}"/>']
    coupes = []
    y = 44
    for t1, t2 in TABLE_LAMES:
        d = _lame(cx + 12, y, 170, 42, True)
        els += [f'<rect x="{cx - 15}" y="{y - 4}" width="30" height="5" rx="2" fill="{C}"/>', _chemin(d, V, I, 2.4),
                _ligne(t1, 'cormorant', 15, cx + 92, y + 19, I, 132, 600, 0.04),
                _ligne(t2, 'jost', 10, cx + 92, y + 33, C, 132, 500, 0.02)]
        coupes.append(d)
        y += 62
    return '-16 -4 276 338', els, coupes


# ── 5 · La plaque d'angle (le coin de rue) ───────────────────────────────
def plaque_angle():
    """Plaque émaillée indigo, filet cuivre, le logo (son pictogramme suffit), le quartier et la flèche.
    Éléments : 0 plaque, 1 filet, 2 logo, 3 filet court, 4 quartier, 5 flèche."""
    W, H = ANGLE_W, ANGLE_H
    els = [f'<rect width="{W}" height="{H}" rx="26" fill="{I}"/>',
           f'<rect x="18" y="18" width="{W - 36}" height="{H - 36}" rx="16" fill="none" stroke="{C}" stroke-width="5"/>',
           _logo('verrou-couche', W / 2, 150, 480, V),
           f'<rect x="{W / 2 - 40}" y="252" width="80" height="2" fill="{C}"/>',
           _ligne('SURU-LÉRÉ · COTONOU', 'jost', 30, W / 2 - 34, 300, S, 520, 500, 0.14),
           # La flèche dessinée (Jost n'a pas de glyphe de flèche).
           f'<path d="M{W / 2 + 235} 289H{W / 2 + 275}M{W / 2 + 262} 278L{W / 2 + 277} 289L{W / 2 + 262} 300" fill="none" stroke="{S}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>']
    return '0 0 800 360', els, []


DESSINS = [
    ('poteau', 'Le poteau de la Maison', poteau, 'N13 · poteau de direction · 1870 × 2980 mm',
     'Le poteau carré indigo, coiffé comme un sapin de Noël d’un disque « Bienvenue » au logo de la Maison, et cinq lames ivoire : la consultation, l’accueil, les ateliers, la boutique, les toilettes. Pour l’entrée, la cour ou le coin de la rue.',
     'Poteau acier 110 × 110 peint indigo sur platine ancrée au sol, chapeau et bague de pied en cuivre brossé ; tête Ø520 en aluminium indigo à cerclage cuivre, sur une tige cuivre ; lames en profilé aluminium de 20 mm, ivoire ; lettres et logo imprimés UV sur les deux faces.'),
    ('rue', 'La flèche de rue', fleche_rue, 'N14 · panneau de rue · 1400 × 460 mm',
     'Le panneau qu’on voit des grandes routes, aux couleurs de la Maison : cuivre, bord ivoire, chevron et logo ivoire, la distance dessous. Il guide de la rue principale jusqu’à la porte.',
     'Aluminium 3 mm, face ivoire imprimée UV cuivre, film rétroréfléchissant sur le chevron, le logo et la distance ; rails au dos, sur poteau ou mur. La distance est à mesurer sur place.'),
    ('ivoire', 'La flèche ivoire', fleche_ivoire, 'N15 · flèche murale · 1200 × 340 mm',
     'La flèche fine du panneau de mariage : ivoire, liseré indigo, chevron indigo, le logo et la devise en cuivre. Pour le portail, le couloir, le mur de l’entrée.',
     'Base en acrylique indigo 5 mm découpée à la flèche, face en acrylique ivoire 3 mm, chevron et logo en acrylique indigo 3 mm en relief, devise imprimée UV cuivre ; goujons au mur.'),
    ('table', 'Le poteau de table', poteau_table, 'N16 · poteau de comptoir · 330 mm',
     'Le petit poteau du comptoir et des tables : « Votre beauté, 0 km, déjà là », réserver, et le code MoMoPay pour payer. Un clin d’œil à la devise, qui se photographie.',
     'Poteau en acrylique indigo 24 mm sur socle lesté 124 × 124, bagues cuivre, lames en acrylique ivoire 5 mm, impression UV sur les deux faces.'),
    ('angle', 'La plaque d’angle', plaque_angle, 'N17 · plaque de coin de rue · 800 × 360 mm',
     'La plaque émaillée qu’on pose à l’angle de la rue : indigo, filet cuivre, le logo et le quartier, avec la flèche vers la Maison.',
     'Tôle d’acier émaillée 2 mm ou aluminium laqué 3 mm, indigo, filet cuivre, logo ivoire, quartier et flèche en sable ; goujons soudés au dos, posée à 2,5 m du sol.'),
]
