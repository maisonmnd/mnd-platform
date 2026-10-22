# -*- coding: utf-8 -*-
"""LES AUTOCOLLANTS DE LA MAISON, 22 octobre 2026.

« Les autocollants doivent donner d'autres messages. Les QR codes, les
messages de pourboires, de relaxation lors du shampoing, les messages du
slogan, les messages de bien-être, les formules de vaporisation maison.
Refaire les autocollants de manière créative dans toutes les couleurs de la
charte » (Yéman). Choix au sélecteur : trois QR (réserver, avis Google,
pourboire MoMoPay), les brumes du journal de la Maison (« de l'eau, quelques
gouttes d'huile légère, éventuellement un peu de gel d'aloe ») avec des doses
proposées À VALIDER par elle, et la même planche que la PI FINALE : quinze
ronds de Ø200 sur 1060 × 680 mm.

Les sept encres de la charte y passent toutes, chaque rond sur une paire
permise (l'or seulement sur l'indigo, jamais de noir). Un seul motif par rond,
et du vide : la Maison veut du sobre.

Le 22 octobre au soir, sur la page de tri (artefact TiDS69cE…, collection
« choix ») : elle écarte trois ronds (le pourboire en mots, le satin, « rien à
faire ») et demande à leur place « des mots pour les MND Kids » ; elle change
le shampoing (« Un moment de détente. »), l'eau (« Hydratez vos locks. »), la
devise en français (sur indigo) et les racines (« Vos origines. Une identité,
qui s'affirme »). Ses mots sont gardés, la typographie française posée
(apostrophe, espace avant « ! », capitales accentuées).

Puis : « Remplace 2 autocollants avec une phrase qui fait revenir » ; elle
avait décoché « Petite Couronne » et la brume du cuir chevelu. À leur place :
« À la prochaine lune. » (la lune, le pas des formules de la Maison ; le médaillon
au-dessus, à sa demande) et
« Avant de partir, votre prochain rituel ? » (reprendre rendez-vous avant de
sortir, le geste qui fait revenir). « Ici, c'est toi qui dis oui » passe sur
cuivre, comme elle l'a choisi.

Puis : « Je ne garde pas celui du cauris, remplace avec un thème sur une
coiffure », avec ses mots sur la page : « Quelle coiffure aujourd'hui ? » (le
styling de sortie au choix du catalogue). Et « Fais-en un sur le soin DÀNDÀN » :
« Hydratation, brillance, le soin DÀNDÀN », à la place de « À la prochaine lune ».

Puis elle libère la devise en français (déjà en fon sur la planche) : « Fais la
pub pour la recharge d'une brume faite avec des huiles macérées ». La recharge
est celle de la boutique (« Format éco, 1 L, pour remplir les flacons à la
maison »), sans prix sur l'autocollant. Puis : « Fais un message court et direct
qui incite à acheter » : un verbe, la brume, le lieu où l'acheter. Et « enlève 1 litre ».

Puis, sur la page : « buvez » et « laissez l'eau faire » passent sur indigo, la
brume de l'harmattan aussi (« 3 FOIS PAR SEMAINE » en bas), la recharge sur
cuivre ; « On se revoit quand ? » est décoché, et à sa place : « Merci pour
votre fidélité ».

Le QR du pourboire (« 909099@momopay », par analogie avec l'ancien QR lu sur le
document MTN) n'a jamais été scanné : il s'éprouve avec l'application MoMo
avant l'impression (voir src/shared/momopay-de-la-maison-pur.ts).
"""
from enseignes import C, I, S, V, DEVISE_FON, DEVISE_FR, ajuste
from formes import ENCRES, texte, texte_en_arc
from motifs import medaillon, pictogramme, taille_pictogramme

P = ENCRES['indigo-profond']
OR = ENCRES['or']

# Les QR, tirés une fois par qrcode-generator (correction M) ; un module noir = « 1 ».
QR_RESERVER = ["1111111010001010101111111", "1000001010100000001000001", "1011101011110101001011101", "1011101001111100101011101",
               "1011101010000010101011101", "1000001000111100101000001", "1111111010101010101111111", "0000000001010101100000000",
               "1001111110001010110010111", "1001100110101111000111110", "0100101101001101111111001", "0010100111011010001111111",
               "0111101000000000101100001", "1001010101001011100010010", "1100001101000111100011111", "1001010000001001011101101",
               "1001011111011110111110110", "0000000011010100100010110", "1111111010001000101010001", "1000001010010101100010000",
               "1011101011110101111110011", "1011101011101111011000011", "1011101001010100100011111", "1000001001011100011110111",
               "1111111010111100100001001"]   # https://maisonmnd.com/
QR_AVIS = ["11111110110010100100001111111", "10000010111011100111001000001", "10111010110111100001001011101", "10111010011111000110001011101",
           "10111010101000101101101011101", "10000010001100100100001000001", "11111110101010101010101111111", "00000000000111001011000000000",
           "10011111110000111001110010111", "10100000111100010011000110110", "01000110010001010010000010100", "01110101000100111110110111001",
           "00101110010101110001101100001", "10001000111010111001001111111", "01101011001100110011101010101", "10110001100011110000111010101",
           "00110011110010000001010001000", "10101100101010011100100010110", "11101011101011110001000101001", "11101101101111001010111101100",
           "11111110000101011001111111110", "00000000101001000100100011000", "11111110110001010010101011000", "10000010111111011111100010010",
           "10111010101011011101111111001", "10111010111010101010010000001", "10111010001011110000100010111", "10000010010100000010001101101",
           "11111110111101010100111010000"]   # https://g.page/r/CYEt1s4BqvZDEBE/review (le lien d'avis du Trône)
QR_POURBOIRE = ["111111101001001111111", "100000101111001000001", "101110100001101011101", "101110101111101011101", "101110100001001011101",
                "100000100010001000001", "111111101010101111111", "000000001010000000000", "101101110100101001011", "011100010101011110111",
                "010110101000011101001", "011011001001000010000", "000110101000101101001", "000000001011110001110", "111111101001001111010",
                "100000101100110000101", "101110100001000010110", "101110101101101100010", "101110101011110100100", "100000100110111101001",
                "111111101111111001100"]   # 909099@momopay : À ÉPROUVER D'UN SCAN


def _qr(matrice, cx, cy, cote, couleur):
    """Le QR centré en (cx, cy), `cote` mm de côté, modules fusionnés par rangée."""
    n = len(matrice)
    m = cote / n
    x0, y0 = cx - cote / 2, cy - cote / 2
    out = []
    for r, ligne in enumerate(matrice):
        c = 0
        while c < n:
            if ligne[c] == '1':
                d = c
                while d < n and ligne[d] == '1':
                    d += 1
                out.append(f'<rect x="{x0 + c * m:.3f}" y="{y0 + r * m:.3f}" width="{(d - c) * m:.3f}" height="{m:.3f}"/>')
                c = d
            else:
                c += 1
    return f'<g fill="{couleur}" data-couche="qr">{"".join(out)}</g>'


def _ligne(t, famille, taille, cx, y, couleur, largeur, graisse=500, interlettre=0.0):
    """Une ligne centrée, réduite si elle dépasse `largeur`."""
    return texte(t, famille, ajuste(t, famille, taille, largeur, graisse, interlettre), cx, y, 'milieu', graisse, interlettre, couleur)[0]


def _phrase(t1, t2, famille, taille, cx, y1, y2, couleur, largeur, graisse=500):
    """Une phrase sur deux lignes, à la même taille : la plus longue décide pour les deux."""
    z = min(ajuste(t1, famille, taille, largeur, graisse), ajuste(t2, famille, taille, largeur, graisse))
    return [texte(t1, famille, z, cx, y1, 'milieu', graisse, 0, couleur)[0], texte(t2, famille, z, cx, y2, 'milieu', graisse, 0, couleur)[0]]


def _anneau(cx, cy, r, couleur, ep=1.2):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{couleur}" stroke-width="{ep}"/>'


def _picto(cx, y, largeur, couleur):
    lw, _ = taille_pictogramme(largeur)
    return pictogramme(cx - lw / 2, y, largeur, couleur)


# ══ LES QUINZE ═════════════════════════════════════════════════════════
# (famille, titre court pour les fiches, fond, dessin(cx, cy) -> éléments)

def reserver(cx, cy):
    return [_anneau(cx, cy, 92, C),
            texte_en_arc('VOTRE PROCHAIN RENDEZ-VOUS', 'jost', 10.5, cx, cy, 80, en_bas=False, graisse=500, interlettre=0.22, couleur=I),
            _qr(QR_RESERVER, cx, cy - 6, 78, I),
            _ligne('Réserver', 'cormorant-italique', 22, cx, cy + 56, I, 120),
            _ligne('MAISONMND.COM', 'jost', 9.5, cx, cy + 72, C, 110, 500, 0.16)]


def avis(cx, cy):
    return [texte_en_arc('VOTRE AVIS COMPTE', 'jost', 10.5, cx, cy, 80, en_bas=False, graisse=500, interlettre=0.24, couleur=I),
            _qr(QR_AVIS, cx, cy - 6, 78, I),
            _ligne('Un mot sur Google ?', 'cormorant-italique', 20, cx, cy + 56, I, 130),
            _ligne('MERCI DE TOUT CŒUR', 'jost', 8.5, cx, cy + 71, P, 110, 500, 0.18)]


def pourboire_qr(cx, cy):
    return [f'<circle cx="{cx}" cy="{cy - 4}" r="60" fill="{V}"/>',
            _qr(QR_POURBOIRE, cx, cy - 4, 70, I),
            texte_en_arc('UN POURBOIRE ?', 'jost', 11, cx, cy, 82, en_bas=False, graisse=500, interlettre=0.26, couleur=V),
            texte_en_arc('MOMOPAY · CODE 909099', 'jost', 10, cx, cy, 82, en_bas=True, graisse=500, interlettre=0.2, couleur=V)]


def respirez(cx, cy):
    return [_anneau(cx, cy, 92, C, 1.0), medaillon(cx, cy - 58, 26, C),
            _ligne('Un moment de détente.', 'cormorant-italique', 22, cx, cy - 14, V, 140),
            _ligne('Respirez.', 'cormorant', 38, cx, cy + 22, V, 140),
            _ligne('INSPIREZ SUR 4 · EXPIREZ SUR 6', 'jost', 8.5, cx, cy + 48, C, 132, 500, 0.16)]


def laissez_l_eau(cx, cy):
    return [_picto(cx, cy - 70, 30, V),
            _ligne('Fermez les yeux.', 'cormorant-italique', 21, cx, cy - 16, V, 140),
            _ligne('Laissez l’eau', 'cormorant', 32, cx, cy + 18, V, 150),
            _ligne('faire.', 'cormorant', 32, cx, cy + 50, V, 150)]


def devise_fon(cx, cy):
    return [medaillon(cx, cy - 46, 56, V),
            _ligne(DEVISE_FON, 'fon', 40, cx, cy + 22, V, 156),
            _ligne(DEVISE_FR, 'cormorant-italique', 17, cx, cy + 50, V, 140)]


def recharge_brume(cx, cy):
    # Court et direct, pour faire acheter : un verbe, la brume, où l'acheter. L'arc la range avec les deux formules maison.
    return [texte_en_arc('FORMAT ÉCO', 'jost', 9.5, cx, cy, 84, en_bas=False, graisse=500, interlettre=0.26, couleur=V),
            _ligne('Rechargez', 'cormorant', 34, cx, cy - 20, V, 130),
            _ligne('votre brume.', 'cormorant-italique', 26, cx, cy + 8, V, 150),
            _ligne('Aux huiles macérées.', 'jost', 11, cx, cy + 30, V, 140, 400, 0.02),
            f'<rect x="{cx - 16}" y="{cy + 42}" width="32" height="1.1" fill="{V}"/>',
            _ligne('Achetez-la à l’accueil.', 'jost', 13, cx, cy + 62, V, 130, 500, 0.02)]


def buvez(cx, cy):
    return [_picto(cx, cy - 66, 28, C),
            _ligne('Buvez de l’eau !', 'cormorant', 28, cx, cy - 4, V, 156),
            _ligne('Hydratez vos locks.', 'cormorant-italique', 18, cx, cy + 24, C, 146),
            _ligne('UN VERRE, PUIS UN AUTRE', 'jost', 8.5, cx, cy + 50, V, 128, 500, 0.2)]


def racines(cx, cy):
    return [medaillon(cx, cy - 62, 30, I),
            _ligne('Vos racines', 'cormorant', 30, cx, cy - 20, I, 160),
            *_phrase('racontent d’où vous venez.', 'Portez-les avec fierté.', 'cormorant-italique', 20, cx, cy + 8, cy + 32, I, 164),
            _ligne('Une identité qui s’affirme.', 'jost', 10.5, cx, cy + 60, C, 140, 400, 0.02)]


# ══ MND KIDS, LE CLUB DES PETITES COURONNES ════════════════════════════
# « Tu » pour l'enfant, comme le Club ; un cauris à chaque visite, et c'est
# l'enfant qui dit oui lui-même (voir le programme MND Kids).

def coiffure_du_jour(cx, cy):
    """« Quelle coiffure aujourd'hui ? » (ses mots) : le styling de sortie au choix du SÍNSIN, chignon, demi-attache ou détaché structuré."""
    # « Le texte n'est pas très clair » : des phrases entières, en gros, sans petites capitales.
    return [_picto(cx, cy - 72, 30, V),
            _ligne('Quelle coiffure', 'cormorant', 30, cx, cy - 16, V, 156),
            _ligne('aujourd’hui ?', 'cormorant-italique', 26, cx, cy + 14, V, 150),
            _ligne('Chignon, demi-attache ou détaché :', 'jost', 11, cx, cy + 42, V, 150, 400, 0.02),
            _ligne('dites-nous votre envie.', 'cormorant-italique', 17, cx, cy + 62, V, 130)]


def dandan(cx, cy):
    """« Hydratation, brillance, le soin DÀNDÀN » (ses mots) ; « aux sept huiles » vient du journal de la Maison."""
    # Ce qu'il est, ce qu'il fait, comment l'avoir : trois phrases qu'on lit d'un coup d'œil.
    return [medaillon(cx, cy - 66, 26, C),
            _ligne('Le soin DÀNDÀN™', 'cormorant', 30, cx, cy - 24, V, 172),
            *_phrase('Sept huiles qui hydratent', 'et font briller vos locks.', 'cormorant-italique', 20, cx, cy + 6, cy + 30, V, 160),
            f'<rect x="{cx - 16}" y="{cy + 42}" width="32" height="1.1" fill="{C}"/>',
            _ligne('Demandez-le à l’accueil.', 'jost', 11, cx, cy + 62, C, 130, 400, 0.02)]


def kids_oui(cx, cy):
    # « Refais les phrases » : l'enfant décide, la Maison demande toujours avant de toucher (le Club).
    return [medaillon(cx, cy - 62, 28, V),
            _ligne('Ici, tu décides.', 'cormorant', 30, cx, cy - 20, V, 160),
            *_phrase('On te demande toujours', 'avant de toucher tes locks.', 'cormorant-italique', 20, cx, cy + 10, cy + 34, V, 160),
            _ligne('MND Kids · Club des Petites Couronnes', 'jost', 10.5, cx, cy + 62, V, 140, 400, 0.02)]


# ══ CE QUI FAIT REVENIR ═════════════════════════════════════════════════

def merci_fidelite(cx, cy):
    # « Merci pour votre fidélité » : un merci, puis l'au revoir qui fait revenir.
    return [medaillon(cx, cy - 62, 28, C),
            _ligne('Merci', 'cormorant', 40, cx, cy - 14, V, 150),
            _ligne('pour votre fidélité.', 'cormorant-italique', 22, cx, cy + 16, V, 166),
            f'<rect x="{cx - 16}" y="{cy + 30}" width="32" height="1.1" fill="{C}"/>',
            _ligne('À très bientôt à la Maison.', 'jost', 11, cx, cy + 52, C, 140, 400, 0.02)]


def _formule(cx, cy, nom, doses, geste, encre, accent, frais):
    """Une brume du journal : son nom, ses doses (à valider), son geste, sa conservation."""
    out = [texte_en_arc('FORMULE MAISON', 'jost', 9.5, cx, cy, 84, en_bas=False, graisse=500, interlettre=0.26, couleur=accent),
           _ligne(nom, 'cormorant-italique', 21, cx, cy - 40, encre, 150),
           f'<rect x="{cx - 16}" y="{cy - 31}" width="32" height="1" fill="{accent}"/>']
    # Les doses à une seule taille : la plus longue décide pour toutes.
    z = min(ajuste(d, 'jost', 10, 150, 400, 0.02) for d in doses)
    y = cy - 12
    for d in doses:
        out.append(texte(d, 'jost', z, cx, y, 'milieu', 400, 0.02, encre)[0])
        y += 15
    out.append(_ligne(geste, 'cormorant-italique', 14, cx, y + 8, accent, 140))
    out.append(_ligne(frais, 'jost', 7.2, cx, y + 26, encre, 120, 500, 0.14))
    return out


def brume_quotidien(cx, cy):
    return _formule(cx, cy, 'La brume du quotidien', ['250 ml d’eau', '5 gouttes d’huile de jojoba', '1 c. à café de gel d’aloe vera'],
                    'Secouez, vaporisez, pressez.', I, C, 'AU FRAIS · À REFAIRE CHAQUE SEMAINE')


def brume_harmattan(cx, cy):
    # « Change la brume de l'harmattan avec d'autres ingrédients » : l'eau de rose (la brume de la boutique),
    # puis sa recette, mot pour mot : deux gouttes d'huile de lin et trois de baobab, sans gel. L'huile de lin
    # rancit vite, d'où le frais et la semaine. Sa phrase : « Un voile léger contre le vent sec. »
    return _formule(cx, cy, 'La brume de l’harmattan', ['250 ml d’eau de rose', '2 gouttes d’huile de lin', '3 gouttes d’huile de baobab'],
                    'Un voile léger contre le vent sec.', V, C, '3 FOIS PAR SEMAINE')


# L'ordre de la planche : une couleur ne touche jamais la même, sauf ses choix du 22 au soir (trois cuivres de s11 à s13).
AUTOCOLLANTS = [
    ('qr', 'Booking QR (maisonmnd.com)', V, reserver),
    ('slogan', 'Motto in Fon', C, devise_fon),
    ('shampoing', 'Shampoo: breathe', P, respirez),
    ('bien-etre', 'Wellness: drink water', I, buvez),
    ('formule', 'Home mist: everyday', V, brume_quotidien),
    ('soin', 'DÀNDÀN care', P, dandan),
    ('shampoing', 'Shampoo: let the water work', I, laissez_l_eau),
    ('qr', 'Review QR (Google)', S, avis),
    ('coiffure', 'Hairstyle of the day', C, coiffure_du_jour),
    ('formule', 'Home mist: harmattan', I, brume_harmattan),
    ('qr', 'Tip QR (MoMoPay 909099)', C, pourboire_qr),
    ('boutique', 'Mist refill, macerated oils', C, recharge_brume),
    ('kids', 'MND Kids: you say yes', C, kids_oui),
    ('retour', 'Thank you for your loyalty', I, merci_fidelite),
    ('bien-etre', 'Wellness: roots and origins', S, racines),
]


def autocollant(a, n, cx, cy, decoupe=True):
    """Un autocollant de Ø200 : fond à fond perdu (3 mm), trait de découpe au Ø200 dans le fichier du fabricant."""
    _famille, _titre, fond, dessin = AUTOCOLLANTS[n]
    out = [f'<circle cx="{cx}" cy="{cy}" r="{103 if not a.rendu else 100}" fill="{fond}"/>'] + dessin(cx, cy)
    if decoupe and not a.rendu:
        out.append(f'<circle cx="{cx}" cy="{cy}" r="100" fill="none" stroke="#EC008C" stroke-width="0.25" data-couche="decoupe"/>')
    return ''.join(out)


def planche(a):
    return ''.join(autocollant(a, i, 106 + (i % 5) * 212, 113 + (i // 5) * 226) for i in range(15))
