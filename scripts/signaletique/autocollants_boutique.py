# -*- coding: utf-8 -*-
"""LES AUTOCOLLANTS DE LA BOUTIQUE, 23 octobre 2026.

« Prépare un nouveau jeu d'autocollants que je puisse me permettre d'avoir à
100 : plusieurs jeux, avec des messages différents. MAISON MND, Merci pour votre
fidélité, Merci pour votre achat, Meilleurs vœux, Thank you, la Brume Hydra
Mist, le médaillon, l'allover (sans texte) pour les boîtes, la devise en fon et
votre beauté est déjà là » (Yéman). « Feel free to create some » : s'ajoutent
« Un cadeau pour vous » et « À très bientôt ». Puis : « le slogan fon et votre beauté est déjà
là ensemble » : la devise entière sur une seule pastille.

La même feuille que R9 (1060 × 680 mm, papier synthétique, découpe à la forme),
pour qu'elle coûte à peu près le même prix : 180 pastilles Ø50 pour fermer les
sachets, les papiers de soie et les boîtes, et 9 étiquettes 108 × 50 pour le
flacon de brume. Une feuille, douze dessins ; 100 feuilles = 18 000 pastilles et 900 étiquettes.
Un seul motif par pastille, du vide : la Maison veut du sobre.
"""
from enseignes import C, I, S, V, DEVISE_FON, ajuste
from formes import ENCRES, pose_logo, proportion, texte
from motifs import allover, grille, medaillon

P = ENCRES['indigo-profond']
OR = ENCRES['or']
I_CLAIR = '#2C3070'   # l'indigo clair de l'allover ton sur ton

W, H = 1060, 680
PAS, R = 58, 25            # pastilles Ø50 tous les 58 mm
COLS, RANGS = 18, 11
X0, Y0 = (W - COLS * PAS) / 2, (H - RANGS * PAS) / 2
ETIQ_W, ETIQ_H = 2 * PAS - 8, 50


def _ligne(t, famille, taille, cx, y, couleur, largeur, graisse=500, interlettre=0.0):
    return texte(t, famille, ajuste(t, famille, taille, largeur, graisse, interlettre), cx, y, 'milieu', graisse, interlettre, couleur)[0]


def _rond(cx, cy, fond, a):
    return f'<circle cx="{cx}" cy="{cy}" r="{R if a.rendu else R + 1.5}" fill="{fond}"/>'


# ── Les dessins (centrés en cx, cy, Ø50) ───────────────────────────────
def logo(cx, cy):
    lw = 26
    h = lw / proportion('verrou-debout')
    return [pose_logo('verrou-debout', cx - lw / 2, cy - h / 2, largeur=lw, couleur=C)[0]]


def merci_achat(cx, cy):
    return [_ligne('Merci', 'cormorant', 14, cx, cy + 1, I, 40, 600),
            _ligne('pour votre achat', 'cormorant-italique', 6.4, cx, cy + 9.5, C, 38)]


def merci_fidelite(cx, cy):
    return [_ligne('Merci', 'cormorant', 14, cx, cy + 1, V, 40, 600),
            _ligne('pour votre fidélité', 'cormorant-italique', 6.4, cx, cy + 9.5, V, 38)]


def thank_you(cx, cy):
    return [_ligne('Thank you', 'cormorant-italique', 11, cx, cy + 2, V, 40),
            _ligne('MAISON MND', 'jost', 3.2, cx, cy + 10, C, 30, 500, 0.3)]


def meilleurs_voeux(cx, cy):
    # L'or ne se pose que sur l'indigo : la pastille des fêtes.
    return [medaillon(cx, cy - 11, 9, OR),
            _ligne('Meilleurs', 'cormorant', 8.5, cx, cy + 3, OR, 38, 500),
            _ligne('vœux', 'cormorant-italique', 11, cx, cy + 12, OR, 38)]


def cadeau(cx, cy):
    return [_ligne('Un cadeau', 'cormorant', 9, cx, cy + 0.5, I, 38, 500),
            _ligne('pour vous', 'cormorant-italique', 8, cx, cy + 8.5, C, 36)]


def a_bientot(cx, cy):
    return [_ligne('À très', 'cormorant-italique', 8.5, cx, cy - 0.5, V, 36),
            _ligne('bientôt', 'cormorant', 10, cx, cy + 8.5, V, 38, 500)]


def medaillon_seul(cx, cy):
    return [medaillon(cx, cy, 34, C)]


def devise(cx, cy):
    # « Le slogan fon et votre beauté est déjà là ensemble » : la devise entière sur une pastille.
    return [_ligne(DEVISE_FON, 'fon', 7.5, cx, cy - 1, V, 40),
            _ligne('votre beauté', 'cormorant-italique', 5.6, cx, cy + 6.5, C, 34),
            _ligne('est déjà là', 'cormorant-italique', 5.6, cx, cy + 12, C, 34)]


# (famille, titre anglais, fond, dessin, nombre par feuille)
PASTILLES = [
    ('logo', 'MAISON MND logo seal', I, logo, 24),
    ('merci', 'Thank you for your purchase (FR)', V, merci_achat, 24),
    ('merci', 'Thank you for your loyalty (FR)', C, merci_fidelite, 18),
    ('merci', 'Thank you (EN)', I, thank_you, 18),
    ('fetes', 'Season’s greetings (FR)', P, meilleurs_voeux, 18),
    ('cadeau', 'A gift for you (FR)', S, cadeau, 12),
    ('revenir', 'See you soon (FR)', C, a_bientot, 12),
    ('motif', 'Medallion, no text', V, medaillon_seul, 18),
    ('devise', 'Motto, Fon and French', I, devise, 24),
    ('motif', 'Allover square for boxes, no text', I, None, 12),
]
assert sum(p[4] for p in PASTILLES) == COLS * (RANGS - 1)


def carre_allover(a, cx, cy):
    """La pastille carrée des boîtes : l'allover ton sur ton, sans texte."""
    c = 50 if a.rendu else 53
    x, y = cx - c / 2, cy - c / 2
    pts = grille(cx - 25, cy - 25, 50, 50, 7, 11, 9.5, marge=1.0)
    return [f'<rect x="{x}" y="{y}" width="{c}" height="{c}" rx="{3 if a.rendu else 4.5}" fill="{I}"/>', allover(pts, 7, I_CLAIR)]


def etiquette_brume(a, cx, cy):
    """L'étiquette du flacon : « La Brume · Hydra Mist », ses mots, sur l'ivoire."""
    bw, bh = (ETIQ_W, ETIQ_H) if a.rendu else (ETIQ_W + 3, ETIQ_H + 3)
    out = [f'<rect x="{cx - bw / 2}" y="{cy - bh / 2}" width="{bw}" height="{bh}" rx="3" fill="{V}"/>']
    lw = 34
    s, w, h = pose_logo('verrou-couche', cx - lw / 2, cy - 19, largeur=lw, couleur=C)
    out.append(s)
    out.append(_ligne('La Brume', 'cormorant', 12, cx, cy + 6, I, 90, 600))
    out.append(_ligne('Hydra Mist', 'cormorant-italique', 8, cx, cy + 14, C, 80))
    out.append(_ligne('ROSE ET ALOE VERA · 250 ML', 'jost', 3.2, cx, cy + 20.5, I, 80, 500, 0.2))
    return out


def _decoupe(forme):
    return forme.replace('fill="', 'data-couche="decoupe" stroke="#EC008C" stroke-width="0.25" fill="none" data-x="')


def cases():
    """Les places sur la feuille, dans l'ordre de lecture : (dessin, cx, cy)."""
    out = []
    file_ = [(i, p) for i, p in enumerate(PASTILLES) for _ in range(p[4])]
    for k, (i, p) in enumerate(file_):
        r, c = divmod(k, COLS)
        out.append((i, X0 + PAS / 2 + c * PAS, Y0 + PAS / 2 + r * PAS))
    for c in range(COLS // 2):
        out.append(('brume', X0 + PAS + c * 2 * PAS, Y0 + PAS / 2 + (RANGS - 1) * PAS))
    return out


def planche(a, decoupe=True):
    out = []
    for i, cx, cy in cases():
        if i == 'brume':
            out += etiquette_brume(a, cx, cy)
            if decoupe and not a.rendu:
                out.append(f'<rect x="{cx - ETIQ_W / 2}" y="{cy - ETIQ_H / 2}" width="{ETIQ_W}" height="{ETIQ_H}" rx="3" fill="none" stroke="#EC008C" stroke-width="0.25" data-couche="decoupe"/>')
            continue
        _f, _t, fond, dessin, _n = PASTILLES[i]
        if dessin is None:
            out += carre_allover(a, cx, cy)
            if decoupe and not a.rendu:
                out.append(f'<rect x="{cx - 25}" y="{cy - 25}" width="50" height="50" rx="3" fill="none" stroke="#EC008C" stroke-width="0.25" data-couche="decoupe"/>')
            continue
        out.append(_rond(cx, cy, fond, a))
        out += dessin(cx, cy)
        if decoupe and not a.rendu:
            out.append(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="#EC008C" stroke-width="0.25" data-couche="decoupe"/>')
    return ''.join(out)
