# -*- coding: utf-8 -*-
"""LES PANNEAUX DE DIRECTION DE LA MAISON, 23 octobre 2026.

« Fais plusieurs dessins de panneaux de direction, de coin de rue, pour la Maison MND »
(Yéman, d'après le poteau d'Amen Corner, le panneau touristique brun, la flèche de
mariage et le petit poteau de table). Cinq dessins, à plat, en millimètres ; le logo
est toujours le verrou officiel, jamais retapé. Les distances sont à mesurer sur place.
"""
from enseignes import C, I, S, V, DEVISE_FR, ajuste
from formes import pose_logo, proportion, texte


def _ligne(t, famille, taille, cx, y, couleur, largeur, graisse=500, interlettre=0.0):
    return texte(t, famille, ajuste(t, famille, taille, largeur, graisse, interlettre), cx, y, 'milieu', graisse, interlettre, couleur)[0]


def _logo(nom, cx, cy, largeur, couleur):
    h = largeur / proportion(nom)
    return pose_logo(nom, cx - largeur / 2, cy - h / 2, largeur=largeur, couleur=couleur)[0]


def _lame(x0, y0, longueur, hauteur, vers_droite, fond, trait, ep):
    """Une lame en flèche, pointe d'un côté, bout droit de l'autre."""
    p = hauteur / 2
    if vers_droite:
        d = f'M{x0} {y0}H{x0 + longueur - p}L{x0 + longueur} {y0 + p}L{x0 + longueur - p} {y0 + hauteur}H{x0}Z'
    else:
        d = f'M{x0} {y0}H{x0 - longueur + p}L{x0 - longueur} {y0 + p}L{x0 - longueur + p} {y0 + hauteur}H{x0}Z'
    return f'<path d="{d}" fill="{fond}" stroke="{trait}" stroke-width="{ep}" stroke-linejoin="round"/>'


# ── 1 · Le poteau de la Maison (Amen Corner) ─────────────────────────────
def poteau():
    """Poteau indigo carré, chapeau cuivre ; cinq lames ivoire, la première indigo porte le logo."""
    out = ['<rect x="-55" y="60" width="110" height="2340" fill="{I}"/>'.format(I=I),
           f'<rect x="-75" y="20" width="150" height="50" fill="{C}"/>',
           f'<rect x="-62" y="0" width="124" height="24" fill="{C}"/>',
           f'<rect x="-75" y="2380" width="150" height="20" fill="{C}"/>']
    lames = [('MAISON MND', True, None), ('ACCUEIL', False, None), ('LES ATELIERS', True, None),
             ('BOUTIQUE', False, None), ('TOILETTES', True, None)]
    y = 230
    for k, (mot, droite, _) in enumerate(lames):
        x0 = 55 if droite else -55
        if k == 0:
            out.append(_lame(x0, y, 880, 170, droite, I, C, 6))
            out.append(_logo('verrou-couche', x0 + 400, y + 85, 560, V))
        else:
            out.append(_lame(x0, y, 820, 150, droite, V, I, 6))
            cx = x0 + (360 if droite else -360)
            out.append(_ligne(mot, 'cormorant', 92, cx, y + 108, I, 600, 600, 0.06))
        y += 210 if k == 0 else 190
    return '-950 -40 1900 2480', ''.join(out)


# ── 2 · La flèche de rue (le panneau touristique) ────────────────────────
def fleche_rue():
    """Panneau cuivre à bord ivoire, chevron ivoire, le logo en ivoire et la distance."""
    W, H, r = 1400, 460, 30
    p = H / 2
    ext = f'M0 {p}L{p * 0.55} 0H{W - r}Q{W} 0 {W} {r}V{H - r}Q{W} {H} {W - r} {H}H{p * 0.55}Z'
    e = 22
    k = p - e
    inte = f'M{e * 1.6} {p}L{e * 1.6 + k * 0.55} {e}H{W - e - r + 8}Q{W - e} {e} {W - e} {e + r - 8}V{H - e - r + 8}Q{W - e} {H - e} {W - e - r + 8} {H - e}H{e * 1.6 + k * 0.55}Z'
    chev = f'M300 95L170 {p}L300 {H - 95}H370L240 {p}L370 95Z'
    out = [f'<path d="{ext}" fill="{V}" stroke="#B7AFA2" stroke-width="2"/>', f'<path d="{inte}" fill="{C}"/>',
           f'<path d="{chev}" fill="{V}"/>',
           _logo('verrou-couche', 860, 190, 640, V),
           _ligne('Suru-Léré · à 100 m', 'jost', 52, 860, 355, V, 640, 500, 0.04)]
    return '-10 -10 1420 480', ''.join(out)


# ── 3 · La flèche ivoire (le panneau du mariage) ─────────────────────────
def fleche_ivoire():
    """Flèche ivoire à liseré indigo, chevron indigo, le logo et la devise."""
    W, H = 1200, 340
    p = H / 2
    ext = f'M0 18Q0 0 18 0H{W - p}L{W} {p}L{W - p} {H}H18Q0 {H} 0 {H - 18}Z'
    e = 20
    inte = f'M{e} {e + 14}Q{e} {e} {e + 14} {e}H{W - p - 6}L{W - e * 1.5} {p}L{W - p - 6} {H - e}H{e + 14}Q{e} {H - e} {e} {H - e - 14}Z'
    chev = f'M{W - 300} 85L{W - 180} {p}L{W - 300} {H - 85}H{W - 362}L{W - 242} {p}L{W - 362} 85Z'
    out = [f'<path d="{ext}" fill="{I}"/>', f'<path d="{inte}" fill="{V}"/>', f'<path d="{chev}" fill="{I}"/>',
           # « Descends votre beauté est déjà là » (23 oct. 2026) : le logo remonte, la devise descend.
           _logo('verrou-couche', 440, 114, 520, I),
           _ligne(DEVISE_FR, 'cormorant-italique', 58, 440, 286, C, 600)]
    return '-10 -10 1220 360', ''.join(out)


# ── 4 · Le poteau de table (le comptoir) ─────────────────────────────────
def poteau_table():
    """Petit poteau indigo à bagues cuivre, trois lames ivoire : la devise en distance, réserver, Instagram."""
    out = [f'<rect x="-12" y="18" width="24" height="292" rx="3" fill="{I}"/>',
           f'<path d="M-12 30Q-12 6 0 6Q12 6 12 30Z" fill="{I}"/>',
           f'<ellipse cx="0" cy="314" rx="62" ry="10" fill="{I}"/>']
    lames = [('VOTRE BEAUTÉ', '0 km · déjà là'), ('RÉSERVER', 'maisonmnd.com'), ('INSTAGRAM', '@maison.mnd')]
    y = 44
    for t1, t2 in lames:
        out.append(f'<rect x="-15" y="{y - 4}" width="30" height="5" rx="2" fill="{C}"/>')
        out.append(_lame(12, y, 170, 42, True, V, I, 2.4))
        out.append(_ligne(t1, 'cormorant', 15, 92, y + 19, I, 132, 600, 0.04))
        out.append(_ligne(t2, 'jost', 10, 92, y + 33, C, 132, 500, 0.02))
        y += 62
    return '-80 -4 280 334', ''.join(out)


# ── 5 · La plaque d'angle (le coin de rue) ───────────────────────────────
def plaque_angle():
    """Plaque émaillée indigo, filet cuivre, le logo (son pictogramme suffit), le quartier et la flèche."""
    W, H = 800, 360
    out = [f'<rect width="{W}" height="{H}" rx="26" fill="{I}"/>',
           f'<rect x="18" y="18" width="{W - 36}" height="{H - 36}" rx="16" fill="none" stroke="{C}" stroke-width="5"/>',
           _logo('verrou-couche', W / 2, 150, 480, V),
           f'<rect x="{W / 2 - 40}" y="252" width="80" height="2" fill="{C}"/>',
           _ligne('SURU-LÉRÉ · COTONOU', 'jost', 30, W / 2 - 34, 300, S, 520, 500, 0.14),
           # La flèche dessinée (Jost n'a pas de glyphe de flèche).
           f'<path d="M{W / 2 + 235} 289H{W / 2 + 275}M{W / 2 + 262} 278L{W / 2 + 277} 289L{W / 2 + 262} 300" fill="none" stroke="{S}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>']
    return '0 0 800 360', ''.join(out)


DESSINS = [
    ('poteau', 'Le poteau de la Maison', poteau, 'Poteau de direction · 2400 mm',
     'Le poteau carré indigo, chapeau cuivre, et cinq lames : la première porte le logo, les autres mènent à l’accueil, aux ateliers, à la boutique, aux toilettes. Pour l’entrée, la cour ou le coin de la rue.',
     'Aluminium composite 6 mm, lames 820 × 150, poteau acier 110 × 110 peint indigo, chapeau cuivre brossé. Lettres imprimées UV ou découpées en relief.'),
    ('rue', 'La flèche de rue', fleche_rue, 'Panneau de rue · 1400 × 460 mm',
     'Le panneau qu’on voit des grandes routes, aux couleurs de la Maison : cuivre, bord ivoire, chevron et logo ivoire, la distance dessous. Il guide de la rue principale jusqu’à la porte.',
     'Aluminium 3 mm, film rétroréfléchissant ivoire, impression cuivre, sur poteau ou mur. La distance est à mesurer sur place.'),
    ('ivoire', 'La flèche ivoire', fleche_ivoire, 'Flèche murale · 1200 × 340 mm',
     'La flèche fine du panneau de mariage : ivoire, liseré indigo, chevron indigo, le logo et la devise en cuivre. Pour le portail, le couloir, le mur de l’entrée.',
     'Acrylique ivoire 5 mm, liseré et chevron indigo, logo en relief 3 mm, devise imprimée cuivre.'),
    ('table', 'Le poteau de table', poteau_table, 'Poteau de comptoir · 330 mm',
     'Le petit poteau du comptoir et des tables : « Votre beauté, 0 km, déjà là », réserver, Instagram. Un clin d’œil à la devise, qui se photographie.',
     'Poteau acrylique indigo 24 mm sur socle, bagues cuivre, lames ivoire 170 × 42, impression UV.'),
    ('angle', 'La plaque d’angle', plaque_angle, 'Plaque de coin de rue · 800 × 360 mm',
     'La plaque émaillée qu’on pose à l’angle de la rue : indigo, filet cuivre, le logo et le quartier, avec la flèche vers la Maison.',
     'Tôle émaillée ou aluminium laqué indigo, filet cuivre, impression ivoire, vissée à 2,5 m du sol.'),
]
