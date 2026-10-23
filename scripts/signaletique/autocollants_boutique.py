# -*- coding: utf-8 -*-
"""LES AUTOCOLLANTS DE LA BOUTIQUE, 23 octobre 2026 : la feuille R9 de la commande.

« Prépare un nouveau jeu d'autocollants que je puisse me permettre d'avoir à
100 : plusieurs jeux, avec des messages différents. MAISON MND, Merci pour votre
fidélité, Merci pour votre achat, Meilleurs vœux, Thank you, la Brume Hydra
Mist, le médaillon, l'allover (sans texte) pour les boîtes, la devise en fon et
votre beauté est déjà là » (Yéman). « Feel free to create some » : s'ajoutent
« Un cadeau pour vous » et « À très bientôt ». Puis : « le slogan fon et votre beauté est déjà
là ensemble » : la devise entière sur une seule pastille.

La même feuille que R9 (1060 × 680 mm, papier synthétique, découpe à la forme),
pour qu'elle coûte à peu près le même prix : 60 pastilles Ø88 pour fermer les
sachets, les papiers de soie et les boîtes (6 de chaque dessin), et 6 étiquettes
146 × 68 pour le flacon de brume. Une feuille, onze dessins ; 100 feuilles = 6 000
pastilles et 600 étiquettes.
Un seul motif par pastille, du vide : la Maison veut du sobre.

Le 23 octobre au soir : les trois pastilles « à motif » de l'ancien R9-M (le logo, le pictogramme,
la devise, sur l'allover avec l'anneau cuivre) prennent la place du Thank you et des deux Merci.
"""
from enseignes import C, I, S, V, DEVISE_FON, DEVISE_FR, ajuste
from formes import ENCRES, pose_logo, proportion, texte
from motifs import allover, grille, medaillon

P = ENCRES['indigo-profond']
OR = ENCRES['or']
I_CLAIR = '#2C3070'   # l'indigo clair de l'allover ton sur ton

W, H = 1060, 680
# « 24 de chaque, c'est trop, et ils sont trop petits », puis « 6 de chaque, encore trop petits » (23 oct. 2026) :
# 6 rangs de 10 pastilles Ø88 (le dessin de Ø50 agrandi de 1,76, jamais redessiné), puis un rang de 6 étiquettes.
PAS_X, PAS_Y = 100, 94
COLS, RANGS = 10, 7
X0, Y0 = (W - COLS * PAS_X) / 2, (H - RANGS * PAS_Y) / 2
R = 25                      # le rayon du dessin d'origine
K = 1.76                    # son agrandissement : la pastille coupée fait Ø88
R_REEL = R * K
FOND_PERDU = 1.5
ETIQ_W, ETIQ_H = 108, 50    # l'étiquette d'origine
K_ETIQ = 1.35               # coupée à 145,8 × 67,5
PAR_DESSIN = 6


def _ligne(t, famille, taille, cx, y, couleur, largeur, graisse=500, interlettre=0.0):
    return texte(t, famille, ajuste(t, famille, taille, largeur, graisse, interlettre), cx, y, 'milieu', graisse, interlettre, couleur)[0]


def _agrandi(contenu, cx, cy, k):
    return f'<g transform="translate({cx:.2f} {cy:.2f}) scale({k}) translate({-cx:.2f} {-cy:.2f})">{contenu}</g>'


# ── Les dessins (centrés en cx, cy, dessinés pour Ø50 puis agrandis) ───────────────────────────────
def logo(cx, cy):
    lw = 26
    h = lw / proportion('verrou-debout')
    return [pose_logo('verrou-debout', cx - lw / 2, cy - h / 2, largeur=lw, couleur=C)[0]]


def _motif(cx, cy, ton=I_CLAIR):
    """Le fond des pastilles « à motif » de l'ancien R9-M : l'allover ton sur ton dans le disque, l'anneau cuivre."""
    pts = grille(cx - 21, cy - 21, 42, 42, 5, 7.5, 6.5, rond=(cx, cy, 21), ancre=(cx, cy))
    return [allover(pts, 5, ton), f'<circle cx="{cx}" cy="{cy}" r="22" fill="none" stroke="{C}" stroke-width="0.4"/>']


def logo_motif(cx, cy):
    lw = 27.5
    # « Les trois en B » (23 oct. 2026) : ivoire, allover sable, le logo en indigo.
    return _motif(cx, cy, S) + [pose_logo('verrou-debout', cx - lw / 2, cy - 16.5, largeur=lw, couleur=I)[0]]


def picto_motif(cx, cy):
    # « Trop sombre, la deuxième couleur » (23 oct. 2026) : sur l'ivoire, l'allover en sable.
    lw = 31
    return _motif(cx, cy, S) + [pose_logo('pictogramme', cx - lw / 2, cy - 12.5, largeur=lw, couleur=C)[0]]


def devise_motif(cx, cy):
    lw = 16
    return _motif(cx, cy, S) + [pose_logo('pictogramme', cx - lw / 2, cy - 15.5, largeur=lw, couleur=C)[0],
                                texte(DEVISE_FON, 'fon', 7.5, cx, cy + 5.5, 'milieu', couleur=I)[0],
                             texte(DEVISE_FR, 'cormorant-italique', ajuste(DEVISE_FR, 'cormorant-italique', 4.25, 35, 500), cx, cy + 12.5, 'milieu', 500, 0, C)[0]]


def meilleurs_voeux(cx, cy):
    # L'or ne se pose que sur l'indigo : la pastille des fêtes.
    return [medaillon(cx, cy - 11, 9, OR),
            _ligne('Meilleurs', 'cormorant', 8.5, cx, cy + 3, OR, 38, 500),
            _ligne('vœux', 'cormorant-italique', 11, cx, cy + 12, OR, 38)]


def cadeau(cx, cy):
    # « Un cadeau pour vous et À très bientôt doivent être accompagnés du médaillon » (23 oct. 2026) :
    # placé comme sur Meilleurs vœux, en cuivre sur le sable.
    return [medaillon(cx, cy - 11, 9, C),
            _ligne('Un cadeau', 'cormorant', 9, cx, cy + 3.5, I, 38, 500),
            _ligne('pour vous', 'cormorant-italique', 8, cx, cy + 11.5, C, 36)]


def a_bientot(cx, cy):
    # Le médaillon en ivoire sur le cuivre.
    return [medaillon(cx, cy - 11, 9, V),
            _ligne('À très', 'cormorant-italique', 8.5, cx, cy + 3, V, 36),
            _ligne('bientôt', 'cormorant', 10, cx, cy + 12, V, 38, 500)]


def medaillon_seul(cx, cy):
    return [medaillon(cx, cy, 34, C)]


def devise(cx, cy):
    # « Le slogan fon et votre beauté est déjà là ensemble » : la devise entière sur une pastille.
    return [_ligne(DEVISE_FON, 'fon', 7.5, cx, cy - 1, V, 40),
            _ligne('votre beauté', 'cormorant-italique', 5.6, cx, cy + 6.5, C, 34),
            _ligne('est déjà là', 'cormorant-italique', 5.6, cx, cy + 12, C, 34)]


# (famille, titre anglais, fond, dessin, nombre par feuille)
PASTILLES = [
    ('logo', 'MAISON MND logo seal', I, logo, PAR_DESSIN),
    # « Ajoute ceux-ci » (l'ancien R9-M), « à la place du Thank you et des 2 Merci » (23 oct. 2026).
    ('motif', 'MAISON MND logo, allover', V, logo_motif, PAR_DESSIN),
    ('motif', 'Pictogram, allover', V, picto_motif, PAR_DESSIN),
    ('devise', 'Motto, Fon and French, allover', V, devise_motif, PAR_DESSIN),
    ('fetes', 'Season’s greetings (FR)', P, meilleurs_voeux, PAR_DESSIN),
    ('cadeau', 'A gift for you (FR)', S, cadeau, PAR_DESSIN),
    ('revenir', 'See you soon (FR)', C, a_bientot, PAR_DESSIN),
    ('motif', 'Medallion, no text', V, medaillon_seul, PAR_DESSIN),
    ('devise', 'Motto, Fon and French', I, devise, PAR_DESSIN),
    ('motif', 'Allover square for boxes, no text', I, None, PAR_DESSIN),
]
N_ETIQ = PAR_DESSIN
assert sum(p[4] for p in PASTILLES) == COLS * (RANGS - 1)


def carre_allover(a, cx, cy):
    """La pastille carrée des boîtes : l'allover ton sur ton, sans texte (60 × 60 coupé)."""
    c = 2 * R_REEL + (0 if a.rendu else 2 * FOND_PERDU)
    pts = grille(cx - R_REEL, cy - R_REEL, 2 * R_REEL, 2 * R_REEL, 7 * K, 11 * K, 9.5 * K, marge=1.0)
    return [f'<rect x="{cx - c / 2}" y="{cy - c / 2}" width="{c}" height="{c}" rx="{3 * K if a.rendu else 3 * K + 1.5}" fill="{I}"/>', allover(pts, 7 * K, I_CLAIR)]


def etiquette_brume(a, cx, cy):
    """L'étiquette du flacon : « La Brume · Hydra Mist », ses mots, sur l'ivoire (contenu à la taille d'origine)."""
    lw = 34
    out = [pose_logo('verrou-couche', cx - lw / 2, cy - 19, largeur=lw, couleur=C)[0]]
    out.append(_ligne('La Brume', 'cormorant', 12, cx, cy + 6, I, 90, 600))
    out.append(_ligne('Hydra Mist', 'cormorant-italique', 8, cx, cy + 14, C, 80))
    # « Sur La Brume, enlève rose et aloe vera » (23 oct. 2026) : le volume seul.
    out.append(_ligne('250 ML', 'jost', 3.2, cx, cy + 20.5, I, 80, 500, 0.2))
    return out


def _trait(forme):
    return forme[:-2] + ' fill="none" stroke="#EC008C" stroke-width="0.25" data-couche="decoupe"/>'


def pastille(a, i, cx, cy, decoupe=True):
    """Une pastille entière, à sa taille réelle : le fond perdu, le dessin agrandi, le trait de découpe."""
    _f, _t, fond, dessin, _n = PASTILLES[i]
    if dessin is None:
        out = ''.join(carre_allover(a, cx, cy))
        trait = f'<rect x="{cx - R_REEL}" y="{cy - R_REEL}" width="{2 * R_REEL}" height="{2 * R_REEL}" rx="{3 * K}"/>'
    else:
        r = R_REEL + (0 if a.rendu else FOND_PERDU)
        out = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fond}"/>' + _agrandi(''.join(dessin(cx, cy)), cx, cy, K)
        trait = f'<circle cx="{cx}" cy="{cy}" r="{R_REEL}"/>'
    return out + (_trait(trait) if decoupe and not a.rendu else '')


def etiquette(a, cx, cy, decoupe=True):
    """Une étiquette entière, à sa taille réelle."""
    w, h = ETIQ_W * K_ETIQ, ETIQ_H * K_ETIQ
    fw, fh = (w, h) if a.rendu else (w + 2 * FOND_PERDU, h + 2 * FOND_PERDU)
    out = (f'<rect x="{cx - fw / 2:.2f}" y="{cy - fh / 2:.2f}" width="{fw:.2f}" height="{fh:.2f}" rx="{3 * K_ETIQ:.2f}" fill="{V}"/>'
           + _agrandi(''.join(etiquette_brume(a, cx, cy)), cx, cy, K_ETIQ))
    trait = f'<rect x="{cx - w / 2:.2f}" y="{cy - h / 2:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{3 * K_ETIQ:.2f}"/>'
    return out + (_trait(trait) if decoupe and not a.rendu else '')


def cases():
    """Les places sur la feuille, dans l'ordre de lecture : (dessin, cx, cy). Les étiquettes prennent deux places."""
    out = []
    file_ = [i for i, p in enumerate(PASTILLES) for _ in range(p[4])]
    for k, i in enumerate(file_):
        r, c = divmod(k, COLS)
        out.append((i, X0 + PAS_X / 2 + c * PAS_X, Y0 + PAS_Y / 2 + r * PAS_Y))
    pas = COLS * PAS_X / N_ETIQ    # le dernier rang : les étiquettes, régulièrement espacées
    for j in range(N_ETIQ):
        out.append(('brume', X0 + pas / 2 + j * pas, Y0 + PAS_Y / 2 + (RANGS - 1) * PAS_Y))
    return out


def planche(a, decoupe=True):
    out = []
    for i, cx, cy in cases():
        out.append(etiquette(a, cx, cy, decoupe) if i == 'brume' else pastille(a, i, cx, cy, decoupe))
    return ''.join(out)
