# -*- coding: utf-8 -*-
"""LES SOUS-MARQUES DE LA MAISON, CALCULEES PUIS DESSINEES (25 septembre 2026).

Huit vocations, un seul logo. La regle tient en une phrase : LE MOT DU METIER
PREND LA PLACE DE « MAISON » AU-DESSUS DU SIGLE, et rien d'autre ne bouge. Meme
pictogramme, memes proportions, meme Cormorant, meme hierarchie ; seule la
couleur change. Une sous-marque n'est donc pas un second logo a faire dessiner,
c'est le verrou de la Maison avec un mot echange.

CE SCRIPT NE RETAPE AUCUNE PROPORTION. Il lit `src/ds/verrou.ts`, qui est le
seul endroit ou elles sont ecrites, et il lit le trace du pictogramme dans
`public/assets/vectoriel/pictogramme-indigo.svg`, qui est le seul endroit ou il
est dessine. C'est ce qui a rattrape la premiere version de ces planches : le
blanc entre le petit mot et le sigle y etait pose en em de la PETITE ligne,
alors que le verrou le pose en part du corps du sigle. Il sortait trois fois
trop serre, sur une planche qui affirmait que tout se deduit du verrou.

LA GAMME EST CALCULEE, PAS CHOISIE. On releve la clarte et la saturation
percues de l'indigo de la Maison, et les sept autres se posent aux memes, en ne
faisant tourner que la teinte. Huit couleurs qui ne peuvent pas jurer entre
elles, puisqu'elles ne different que par un angle.

Lancer : python scripts/fabrique-les-sous-marques.py
Sortie  : docs/marque/sous-marques/
"""
import functools
import http.server
import io
import json
import math
import os
import re
import shutil
import socketserver
import subprocess
import tempfile
import threading

from PIL import Image
import numpy as np

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, "docs", "marque", "sous-marques")
NAV = "C:/Program Files/Google/Chrome/Application/chrome.exe"
PORT = 8799

IVOIRE = "#F6F1E7"
INDIGO = "#1E2150"


# ══ 1. CE QUE LA MAISON A DEJA ECRIT ══════════════════════════════════
def constantes_du_verrou():
    """Les proportions du verrou, lues la ou elles sont ecrites.

    On ote les commentaires AVANT de lire : une phrase qui cite `ecartMaison`
    n'est pas une declaration, et la confondre avec une declaration est une
    facon connue de se tromper en silence."""
    s = io.open(os.path.join(RACINE, "src", "ds", "verrou.ts"), encoding="utf-8").read()
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    v = {}
    for cle, expr in re.findall(r"(\w+):\s*([0-9]+(?:\.[0-9]+)?(?:\s*/\s*[0-9]+)?)\s*,", s):
        v[cle] = eval(expr, {"__builtins__": {}}, {})  # chiffres et barre de fraction, rien d'autre
    attendus = ["partMaison", "ecartSigle", "ecartMaison", "entreLignes",
                "ecartPicto", "hautPicto", "souslePicto", "largePictoDebout"]
    manquants = [c for c in attendus if c not in v]
    assert not manquants, "src/ds/verrou.ts ne declare plus : %s" % manquants
    return v


V = constantes_du_verrou()
HAUT_DU_BLOC = V["partMaison"] + V["entreLignes"] + 1
HAUT_DU_PICTO = HAUT_DU_BLOC * V["hautPicto"]
# LE BLANC ENTRE LES DEUX LIGNES SE PAIE DANS LE CORPS DE CELLE QUI LE PORTE.
# `entreLignes` vaut une part du corps du SIGLE ; pose en marge sur la petite
# ligne, il faut donc le rendre dans le corps de la PETITE ligne, sans quoi il
# retrecit du rapport des deux corps. C'est exactement la faute corrigee ici.
ENTRE_EN_EM_DU_PETIT = V["entreLignes"] / V["partMaison"]


def trace_du_pictogramme():
    """Le pictogramme du depot, en vectoriel, pose en ligne dans la page.

    Un PNG a une couleur figee : le verrou sortait bicolore, pictogramme indigo
    et texte bronze, ce qui contredit la regle meme du systeme. En SVG il prend
    `currentColor`, donc la couleur de sa sous-marque, et il reste net a toute
    taille."""
    s = io.open(os.path.join(RACINE, "public", "assets", "vectoriel",
                             "pictogramme-indigo.svg"), encoding="utf-8").read()
    d = re.findall(r'\sd="([^"]+)"', s)
    vb = re.search(r'viewBox="([^"]+)"', s)
    assert len(d) == 1 and vb, "le pictogramme vectoriel n'a plus la forme attendue"
    return d[0], vb.group(1)


TRACE, VUE = trace_du_pictogramme()
# Le rapport du DESSIN, pris dans sa viewBox. Le pictogramme est compose,
# jamais redessine ni deforme : ce nombre est ce qu'on ira verifier sur
# l'encre des tuiles.
_vb = [float(x) for x in VUE.split()]
RAPPORT_DU_PICTO = (_vb[2] - _vb[0]) / (_vb[3] - _vb[1])


def picto(hauteur_em=None, largeur_pc=None, classe=""):
    if hauteur_em:
        taille = "height:%sem;width:auto" % hauteur_em
    elif largeur_pc:
        taille = "width:%s%%;height:auto" % largeur_pc
    else:
        taille = ""  # debout : la largeur vient de la feuille de style, mesuree
    return (f'<svg class="{classe}" viewBox="{VUE}" fill="currentColor" '
            f'style="{taille};display:block" role="img" aria-label="Maison MND">'
            f'<path d="{TRACE}"/></svg>')


# ══ 2. LA GAMME ═══════════════════════════════════════════════════════
hexa = lambda s: tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))
clamp = lambda v: max(0, min(255, int(round(v))))


def lin(v):
    v /= 255
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4


def delin(v):
    v = max(0.0, min(1.0, v))
    return 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055


def rgb2lab(c):
    r, g, b = (lin(x) for x in c)
    X = (r * .4124 + g * .3576 + b * .1805) / .95047
    Y = r * .2126 + g * .7152 + b * .0722
    Z = (r * .0193 + g * .1192 + b * .9505) / 1.08883
    f = lambda t: t ** (1 / 3) if t > .008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(X), f(Y), f(Z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def lab2rgb(lab):
    L, a, b = lab
    fy = (L + 16) / 116
    fx, fz = fy + a / 500, fy - b / 200
    g = lambda t: t ** 3 if t ** 3 > .008856 else (t - 16 / 116) / 7.787
    X, Y, Z = g(fx) * .95047, g(fy), g(fz) * 1.08883
    return tuple(clamp(delin(x) * 255) for x in (
        X * 3.2406 + Y * -1.5372 + Z * -0.4986,
        X * -0.9689 + Y * 1.8758 + Z * 0.0415,
        X * 0.0557 + Y * -0.2040 + Z * 1.0570))


def contraste(a, b):
    la = .2126 * lin(hexa(a)[0]) + .7152 * lin(hexa(a)[1]) + .0722 * lin(hexa(a)[2])
    lb = .2126 * lin(hexa(b)[0]) + .7152 * lin(hexa(b)[1]) + .0722 * lin(hexa(b)[2])
    return (max(la, lb) + .05) / (min(la, lb) + .05)


def dE(a, b):
    return sum((x - y) ** 2 for x, y in zip(rgb2lab(hexa(a)), rgb2lab(hexa(b)))) ** .5


# LE NOM S'ECRIT : mot de vocation, puis MND. Jamais l'inverse. La vocation
# passe devant, comme sur le verrou ou le mot du metier prend la place de
# MAISON au-dessus du sigle.
# LE NOM S'ECRIT : mot de vocation, puis MND. Jamais l'inverse. La vocation
# passe devant, comme sur le verrou ou le mot du metier prend la place de
# MAISON au-dessus du sigle.
#
# LA SIGNATURE est en trois temps, et le dernier porte le poids : c'est la
# cadence de « Former. Transmettre. Affirmer. ». Celle de la Maison fait
# exception, elle a deja la sienne. Ce sont des PROPOSITIONS : elles se
# changent ici, en un endroit, et les nuit planches suivent.
VOCATIONS = [
    ("Maison MND",     "la marque mère",                 None, "Indigo Royal",
     "la signature de la Maison",
     "Vous êtes beaux, ", "et vous le savez."),
    ("Académie MND",   "formations",                     68,   "Bronze d'Atelier",
     "le bronze de l'atelier, ce qui se transmet",
     "Former. Transmettre. ", "Affirmer."),
    ("Boutique MND",   "produits, outils, objets",       38,   "Brique Ancienne",
     "le cuivre assombri, le commerce",
     "Choisir. Entretenir. ", "Durer."),
    ("Soins MND",      "care, routines, cuir chevelu",   225,  "Bleu Lagune",
     "l'eau, le bleu du soin",
     "Nourrir. Apaiser. ", "Fortifier."),
    ("Table MND",      "restauration",                   140,  "Vert Olivier",
     "le végétal, la table",
     "Recevoir. Nourrir. ", "Prolonger."),
    ("Domicile MND",   "salon mobile",                   330,  "Prune du Soir",
     "la prune, le déplacement du soir",
     "Venir. Installer. ", "Couronner."),
    # L'emeraude est la teinte la plus LIBRE de la roue une fois les autres
    # posees : son ecart minimal aux huit vaut 24,5, quand la paire la plus
    # serree de la famille en vaut 16,1. Elle n'a pas ete choisie pour ce
    # qu'elle evoque, elle a ete trouvee pour ce qu'elle ne confond pas.
    ("Événements MND", "cérémonies, mariages, hors les murs", 184, "Émeraude de Fête",
     "la teinte la plus libre de la roue, la fête qui ne se confond avec rien",
     "Préparer. Célébrer. ", "Couronner."),
    # L'ardoise est la seule DESATUREE de la gamme, et c'est voulu : deux bleus
    # voisins (Soins et Studio) se confondaient a soixante pixels. Une famille
    # a besoin d'un neutre.
    ("Studio MND",     "portraits, contenu",             (265, 0.22), "Ardoise",
     "l'ardoise, la chambre noire",
     "Cadrer. Révéler. ", "Garder."),
    ("LOKAA by MND",   "l'offre entreprise",             10,   "Bordeaux",
     "la terre brûlée, le produit vendu à part",
     "Équiper. Servir. ", "Grandir."),
]

# SEULE LA SOUS-MARQUE DE L'EVENEMENT PORTE DES DEGRADES. Un degrade est une
# exception dans cette charte, ou tout est aplat : il dit la fete, et il ne
# dirait plus rien si tout le monde en avait un.
AVEC_DEGRADE = ("Événements MND",)

# Les deux seuils sont poses AVANT le calcul, et le script refuse de livrer
# une planche qui les franchit.
CONTRASTE_MINIMAL = 4.5
ECART_MINIMAL = 12.0


def degrades(nom, couleur):
    """LES DEUX DEGRADES DE L'EVENEMENT, calcules comme le reste.

    Le premier va de la teinte de la sous-marque a une VOISINE plus claire :
    la teinte tourne d'un quart de ce qui separe deux sous-marques, la clarte
    monte de douze. C'est un degrade qui reste dans sa propre couleur, celui
    des tuiles et des bandeaux.

    Le second rentre a la MAISON : de la teinte de la sous-marque a l'indigo
    royal. C'est celui des grandes surfaces, des affiches, de tout ce qui doit
    rappeler d'ou vient la fete.

    Les deux se verifient au point le plus clair, qui est le plus risque pour
    l'encre ivoire : un degrade ne se juge pas a ses bouts choisis mais a son
    pire endroit."""
    L0, a0, b0 = rgb2lab(hexa(couleur))
    C0 = math.hypot(a0, b0)
    H0 = math.degrees(math.atan2(b0, a0))
    clair = "#%02X%02X%02X" % lab2rgb((L0 + 12, C0 * math.cos(math.radians(H0 + 22)),
                                       C0 * math.sin(math.radians(H0 + 22))))
    return [
        {"nom": "Le dégradé de fête", "de": couleur, "a": clair,
         "pourquoi": "la teinte s'éclaircit sans quitter sa famille, pour les tuiles et les bandeaux"},
        {"nom": "Le dégradé de la Maison", "de": couleur, "a": INDIGO,
         "pourquoi": "la fête revient à l'indigo, pour les grandes surfaces et les affiches"},
    ]


def gamme():
    L0, a0, b0 = rgb2lab(hexa(INDIGO))
    C0 = math.hypot(a0, b0)
    # A la clarte de l'indigo (13), une teinte ne se voit pas. 26 laisse lire la
    # couleur tout en gardant l'encre ivoire tres au-dessus de 4,5.
    L, C = 26.0, C0 * 1.15
    out = []
    for nom, vocation, teinte, nom_couleur, pourquoi, sig, accent in VOCATIONS:
        if teinte is None:
            c = INDIGO
        else:
            # Un couple (angle, part de saturation) permet a une teinte de se
            # retenir : l'ardoise garde l'angle du bleu et n'en prend qu'un quart.
            angle, part = teinte if isinstance(teinte, tuple) else (teinte, 1.0)
            rad = math.radians(angle)
            c = "#%02X%02X%02X" % lab2rgb((L, C * part * math.cos(rad), C * part * math.sin(rad)))
        out.append({"nom": nom, "ligne": nom.replace(" by MND", "").replace(" MND", "").upper(),
                    "vocation": vocation, "couleur": c, "nomCouleur": nom_couleur,
                    "pourquoi": pourquoi, "signature": sig, "accent": accent,
                    "degrades": degrades(nom, c) if nom in AVEC_DEGRADE else []})
    faibles = [(g["nom"], contraste(g["couleur"], IVOIRE)) for g in out
               if contraste(g["couleur"], IVOIRE) < CONTRASTE_MINIMAL]
    assert not faibles, "l'encre ivoire ne tient pas sur : %s" % faibles
    paires = sorted((dE(a["couleur"], b["couleur"]), a["nom"], b["nom"])
                    for i, a in enumerate(out) for b in out[i + 1:])
    assert paires[0][0] >= ECART_MINIMAL, "trop proches : %s" % (paires[0],)
    return out, min(contraste(g["couleur"], IVOIRE) for g in out), paires[0][0]


GAMME, PLUS_FAIBLE, PLUS_SERREE = gamme()


# ══ 3. LE RENDU ═══════════════════════════════════════════════════════
TRAVAIL = tempfile.mkdtemp(prefix="sous-marques-")
for src, dst in [("src/ds/fonts/cormorant-latin.woff2", "cormorant.woff2"),
                 ("src/ds/fonts/cormorant-latin-ext.woff2", "cormorant-ext.woff2"),
                 ("src/ds/fonts/jost-latin.woff2", "jost.woff2")]:
    shutil.copyfile(os.path.join(RACINE, src), os.path.join(TRAVAIL, dst))

_TETE = """<!doctype html><html lang="fr"><meta charset="utf-8">
<style>
  @font-face{font-family:'Cormorant';font-weight:300 700;font-display:block;
    src:url('cormorant.woff2') format('woff2-variations'),url('cormorant.woff2') format('woff2')}
  @font-face{font-family:'Cormorant';font-weight:300 700;font-display:block;
    unicode-range:U+0100-024F;
    src:url('cormorant-ext.woff2') format('woff2-variations'),url('cormorant-ext.woff2') format('woff2')}
  @font-face{font-family:'Jost';font-weight:300 700;font-display:block;
    src:url('jost.woff2') format('woff2-variations'),url('jost.woff2') format('woff2')}
  :root{--ivoire:#F6F1E7;--sable:#E3DACB;--indigo:#1E2150;--cuivre:#B97A4A;
        --cuivre-s:#9E6238;--doux:#746F65;--filet:#D9CFBC}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--ivoire);font-family:'Jost',system-ui,sans-serif;color:#22222C}
  h1{font-family:'Cormorant',Georgia,serif;font-weight:400;color:var(--indigo)}
  .chapeau{color:var(--doux);font-size:19px;font-weight:300;line-height:1.55;max-width:96ch}
  .filet{height:1px;background:var(--filet)}

  /* LA TUILE : le pictogramme ivoire sur le champ de la sous-marque. Il y
     occupe 62 %% du cote, comme les raccourcis du telephone. */
  .tuile{border-radius:14px;display:grid;place-items:center;overflow:hidden}
  .tuile svg{display:block}

  /* LE VERROU D'UNE SOUS-MARQUE, QUI EST CELUI DE LA MAISON. Toutes les
     mesures ci-dessous viennent de src/ds/verrou.ts, aucune n'est retapee. */
  .verrou{display:flex;align-items:center;gap:%(ecartPicto).4fem}
  .verrou svg{height:%(hautPicto).4fem;width:auto;display:block;flex:none}
  .mots{display:flex;flex-direction:column;align-items:flex-start}
  .maison-de,.vocation{font-family:'Cormorant',Georgia,serif;font-weight:400;
                       line-height:1;white-space:nowrap}
  .maison-de{font-size:%(partMaison).4fem;letter-spacing:%(ecartMaison).2fem;
             margin-bottom:%(entreEnEmDuPetit).4fem}
  .vocation{font-size:1em;letter-spacing:%(ecartSigle).2fem}
  /* Debout : l'indentation rend a la ligne CENTREE le blanc que sa derniere
     lettre traine derriere elle. Sur un bloc aligne a gauche elle decalerait
     la ligne : c'est pourquoi elle ne vit que sous .debout. */
  .debout{display:flex;flex-direction:column;align-items:center;text-align:center}
  .debout svg{display:block;margin-bottom:%(souslePicto).4fem;%(largeDebout)s}
  .debout .maison-de{text-indent:%(ecartMaison).2fem}
  .debout .vocation{text-indent:%(ecartSigle).2fem}
</style>
"""


def tete(large_debout=None):
    """La feuille de style des planches.

    `largePictoDebout` donne le pictogramme en part de la LARGEUR du sigle, et
    la largeur d'un texte ne se connait qu'une fois la police posee : la tete
    se fabrique donc en deux temps, une premiere fois sans pictogramme debout
    pour mesurer le sigle, une seconde avec la largeur trouvee."""
    regle = ("width:%.4fem;height:auto" % large_debout) if large_debout else "display:none"
    return _TETE % {**V, "hautPicto": HAUT_DU_PICTO,
                    "entreEnEmDuPetit": ENTRE_EN_EM_DU_PETIT, "largeDebout": regle}


class Srv(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class Q(socketserver.TCPServer):
    allow_reuse_address = True


def rends(nom, html, large, haut):
    io.open(os.path.join(TRAVAIL, "_%s.html" % nom), "w", encoding="utf-8").write(html)
    cible = os.path.join(TRAVAIL, "%s.png" % nom)
    # ON EFFACE LA CAPTURE PRECEDENTE AVANT DE RELANCER. Chrome qui echoue ne
    # dit rien et n'ecrit rien : on relisait alors l'image du rendu d'avant, a
    # la bonne taille, donc sans qu'aucune verification ne bronche. Une mesure
    # a rendu 226/255 d'ecart sur un degrade parfaitement juste, le temps de
    # comprendre qu'elle portait sur l'image precedente.
    if os.path.exists(cible):
        os.remove(cible)
    subprocess.run([NAV, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--user-data-dir=" + os.path.join(TRAVAIL, "profil"),
                    "--window-size=%d,%d" % (large, haut), "--virtual-time-budget=25000",
                    "--screenshot=" + cible, "http://127.0.0.1:%d/_%s.html" % (PORT, nom)],
                   capture_output=True, timeout=300)
    assert os.path.exists(cible), "%s : Chrome n'a rien rendu" % nom
    im = Image.open(cible)
    assert im.size == (large, haut), "%s : %sx%s au lieu de %sx%s" % (nom, *im.size, large, haut)
    return im


# ══ 4. LES CONTROLES, POSES AVANT DE LIVRER ═══════════════════════════
def trouve_la_tuile(a, couleur):
    """La boite de la tuile d'une sous-marque, TROUVEE et non supposee.

    Les tuiles etaient reperees par des coordonnees ecrites a la main, qui
    suivaient la grille de la planche. Une grille qui bouge, et le controle
    mesure autre chose sans le dire.

    ON NE CHERCHE PAS UNE COULEUR, ON CHERCHE UN APLAT. Compter les pixels de
    la bonne couleur ne suffit pas : l'indigo de la Maison est AUSSI celui du
    titre et des intertitres, et une ligne de titre en porte plus de soixante.
    La boite trouvee pour la tuile indigo allait du titre au pied de page, et
    le pictogramme y paraissait deux fois et demie trop haut. On demande donc
    une SUITE CONTINUE d'au moins quatre-vingts pixels : une lettre, si noire
    soit-elle, n'en fait jamais autant ; un aplat de cent douze, toujours."""
    c = np.array([int(couleur[i:i + 2], 16) for i in (1, 3, 5)])
    masque = (np.abs(a - c).sum(axis=2) == 0)

    def suite_la_plus_longue(v):
        """La plus longue suite continue de vrai dans un vecteur."""
        meilleure = courante = 0
        for x in v:
            courante = courante + 1 if x else 0
            meilleure = max(meilleure, courante)
        return meilleure

    lignes = np.where(masque.sum(axis=1) >= 80)[0]
    lignes = np.array([y for y in lignes if suite_la_plus_longue(masque[y]) >= 80])
    assert lignes.size, "aucun aplat de la couleur %s" % couleur
    bande = masque[lignes.min():lignes.max() + 1]
    colonnes = np.where(bande.sum(axis=0) >= 80)[0]
    colonnes = np.array([x for x in colonnes if suite_la_plus_longue(bande[:, x]) >= 80])
    assert colonnes.size, "aplat introuvable en largeur pour %s" % couleur
    return int(colonnes.min()), int(lignes.min()), int(colonnes.max()), int(lignes.max())


FENETRE = 2800   # la fenetre de rendu, toujours plus haute que la planche
BAS_DE_PAGE = 60  # le blanc qu'on laisse sous la derniere ligne


def rends_et_ajuste(nom, html, large):
    """Rend la planche dans une fenetre haute, puis la rogne a son contenu.

    LA HAUTEUR D'UNE PLANCHE NE S'ECRIT PAS, ELLE SE CONSTATE. Elle etait
    posee en dur : elle a coupe la derniere rangee une premiere fois, puis
    une seconde le jour ou une neuvieme sous-marque est arrivee, et la
    formule censee la calculer s'est trompee a son tour. On rend donc large
    et on coupe au ras du contenu.

    Le controle qui reste est le bon : si l'encre touche le bas de la FENETRE,
    c'est elle qui etait trop courte, et la planche est bel et bien coupee."""
    im = rends(nom, html, large, FENETRE)
    a = np.asarray(im.convert("RGB"), dtype=int)
    encre = np.abs(a - a[4, 4]).sum(axis=2) > 24
    lignes = np.where(encre.any(axis=1))[0]
    assert lignes.size, "%s : la planche est vide" % nom
    bas = int(lignes.max())
    if bas > FENETRE - 40:
        raise SystemExit("  %s touche le bas de la fenetre : elle est coupee." % nom)
    im = im.crop((0, 0, large, min(FENETRE, bas + BAS_DE_PAGE)))
    im.save(os.path.join(TRAVAIL, "%s.png" % nom))
    return im


def contraste_des_tuiles(im, couleurs):
    """Le contraste de chaque tuile, relu SUR L'IMAGE et non sur le code.

    ON NE VISE PAS UN POINT. Un premier essai echantillonnait le centre du
    dessin : il tombait dans le VIDE du dome et rendait 1,0, c'est-a-dire le
    champ compare a lui-meme.

    ON NE PREND PAS NON PLUS LA BOITE ENTIERE. La tuile a les coins arrondis :
    la boite carree y attrape le FOND IVOIRE DE LA PAGE, et le centile trouvait
    toujours du tres clair. En remettant la panne d'une encre sombre sur champ
    sombre, le controle s'est tu : il mesurait les coins. On rentre donc d'un
    dixieme.

    ET L'ENCRE EST PRISE AU PLUS CLAIR, PAS AU CENTILE. Le pictogramme est un
    trait : sur une tuile de cent douze pixels il couvre trop peu de surface
    pour qu'un centile le rencontre, et la mesure tombait a 3,0 pour un dessin
    qui en vaut 9,6. On prend le millieme extreme, assez pour ecarter un pixel
    d'antialiasing isole, assez peu pour trouver un trait fin."""
    def lum(v):
        v = v / 255.0
        return np.where(v <= 0.03928, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)

    a = np.asarray(im.convert("RGB"), dtype=float)
    pires, deformes = [], []
    for nom, couleur in couleurs.items():
        x0, y0, x1, y1 = trouve_la_tuile(a, couleur)
        marge = round((x1 - x0) * 0.10)
        bloc = a[y0 + marge:y1 - marge, x0 + marge:x1 - marge]
        L = .2126 * lum(bloc[:, :, 0]) + .7152 * lum(bloc[:, :, 1]) + .0722 * lum(bloc[:, :, 2])
        champ = float(np.median(L))
        encre = float(np.percentile(L, 99.9 if champ < 0.5 else 0.1))
        pires.append(((max(champ, encre) + .05) / (min(champ, encre) + .05), nom))
        # LE PICTOGRAMME EST COMPOSE, JAMAIS DEFORME. On mesure la boite de son
        # encre sur la tuile et on la compare au rapport de son dessin. Sans ce
        # controle, on pouvait l'ecraser de moitie et la planche sortait sans
        # un mot : c'est la panne qu'on a remise pour s'en apercevoir.
        c = np.array([int(couleur[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)
        dessin = np.abs(bloc - c).sum(axis=2) > 90
        ys, xs = np.where(dessin)
        assert ys.size, ("aucun dessin ne se detache du champ sur la tuile %s : le pictogramme y est invisible" % nom)
        large, haut = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        r = large / haut
        # LA TOLERANCE VIENT DE LA MESURE, PAS D'UN CHIFFRE ROND. Sur une tuile
        # de cent douze pixels, l'encre du pictogramme fait 69 sur 57 : un seul
        # pixel de bord deplace deja le rapport de 1,7 %. Un seuil fixe a 1 %
        # etait donc sous la resolution de sa propre mesure, et criait sur du
        # bruit. On s'accorde un pixel de jeu sur chaque cote, ce que le seuil
        # exprime tout seul, et une deformation vraie le depasse de loin.
        jeu = 1.0 / large + 1.0 / haut
        deformes.append((abs(r - RAPPORT_DU_PICTO) / RAPPORT_DU_PICTO / jeu, nom, r, jeu))
    pires.sort()
    deformes.sort(reverse=True)
    return pires, deformes


def blocs_d_encre(im):
    """Les bandes horizontales d'encre d'une image, de haut en bas, avec la
    largeur d'encre de chacune."""
    a = np.asarray(im.convert("L"), dtype=int)
    encre = a < 128
    lignes = encre.any(axis=1)
    blocs, debut = [], None
    for y, pleine in enumerate(list(lignes) + [False]):
        if pleine and debut is None:
            debut = y
        elif not pleine and debut is not None:
            cols = np.where(encre[debut:y].any(axis=0))[0]
            blocs.append((debut, y, int(cols[-1] - cols[0] + 1)))
            debut = None
    return blocs


CORPS_DE_SONDE = 200


def sonde(corps_html, large_debout=None):
    """Une page nue, noir sur blanc, pour ne mesurer que de l'encre."""
    return tete(large_debout) + """
<style>body{background:#fff}</style>
<div style="padding:60px;display:inline-block">
  <div class="debout" style="font-size:%dpx;color:#000">%s</div>
</div></html>""" % (CORPS_DE_SONDE, corps_html)


# Le mot de la sonde est celui de la Maison, et il est SANS ACCENT a dessein :
# l'accent aigu de « É » se dessine detache de sa capitale, il formerait une
# bande d'encre de plus et brouillerait le comptage. La geometrie ne depend
# de toute facon que du sigle.
SONDE_MOT = "MAISON"


def mesure_du_sigle():
    """La largeur d'encre du sigle, en part de son corps.

    ON NE PEUT PAS LA CALCULER. `largePictoDebout` donne le pictogramme en part
    de la largeur du SIGLE, et cette largeur depend du dessin de Cormorant. La
    boite du paragraphe ne la donne pas non plus : elle traine l'ecartement de
    la derniere lettre ET l'indentation qui le compense. Un premier essai a
    lu cette boite et le pictogramme est sorti treize pour cent trop large.
    On rend donc les deux lignes SANS pictogramme et on lit l'encre."""
    im = rends("sonde-sigle",
               sonde('<p class="maison-de">%s</p><p class="vocation">MND</p>' % SONDE_MOT),
               1400, 800)
    blocs = blocs_d_encre(im)
    assert len(blocs) == 2, "la sonde du sigle montre %d bandes au lieu de 2" % len(blocs)
    return blocs[-1][2] / CORPS_DE_SONDE


def eprouve_le_blanc_entre_les_lignes():
    """LE BLANC ENTRE LES DEUX LIGNES, ECRIT DES DEUX FACONS, DOIT TOMBER PAREIL.

    `entreLignes` vaut une part du corps du SIGLE. Le site l'ecrit ainsi,
    `calc(var(--sigle) * .1212)`, parce que sa variable EST le corps du sigle.
    Ces planches, elles, posent la marge sur la petite ligne, ou un « em » vaut
    le corps de cette petite ligne : la meme valeur y devient trois fois plus
    serree. La premiere version de ces planches est sortie avec ce defaut, sur
    une planche qui affirme que tout se deduit du verrou.

    On ne relit donc pas le calcul, on rend les deux ecritures et on mesure le
    blanc d'encre de chacune. Si elles tombent pareil, la conversion est juste
    quelle que soit la facon dont on l'a raisonnee."""
    def blanc(nom, markup):
        im = rends("sonde-blanc-" + nom, sonde(markup), 1400, 800)
        b = blocs_d_encre(im)
        assert len(b) == 2, "la sonde du blanc montre %d bandes au lieu de 2" % len(b)
        return b[1][0] - b[0][1]

    # Comme ces planches l'ecrivent : la marge est portee par la petite ligne.
    a_nous = blanc('a-nous', '<p class="maison-de">%s</p><p class="vocation">MND</p>' % SONDE_MOT)
    # Comme le site l'ecrit : la marge est portee au corps du sigle.
    du_site = blanc('du-site', '<div style="margin-bottom:%.4fem"><p class="maison-de" '
                    'style="margin-bottom:0">%s</p></div><p class="vocation">MND</p>'
                    % (V["entreLignes"], SONDE_MOT))
    return a_nous, du_site


def eprouve_les_ecartements():
    """LES ECARTEMENTS DE LA FEUILLE DE STYLE SONT-ILS CEUX DE LA SOURCE ?

    CE CONTROLE COMBLE UN TROU, ET LE TROU MERITE D'ETRE RACONTE. En remettant
    les pannes une a une, on a retape `ecartMaison` a 0,30 dans la feuille de
    style : la planche est sortie sans un mot, en continuant d'affirmer en pied
    de page que ces nombres sont lus dans la source du verrou. Rien ne
    verifiait ce que la planche promet d'elle-meme.

    On ne relit pas le texte de la feuille : on rend deux fois la meme ligne,
    une fois telle que la feuille la pose, une fois avec l'ecartement tire de
    `src/ds/verrou.ts` et ecrit en clair sur l'element. Les deux largeurs
    d'encre doivent tomber pareil."""
    def largeur(nom, markup):
        im = rends("sonde-ecart-" + nom, sonde(markup), 1600, 700)
        b = blocs_d_encre(im)
        assert len(b) == 1, "la sonde d'ecartement montre %d bandes au lieu d'une" % len(b)
        return b[0][2]

    ecarts = []
    for ligne, cle in (("maison-de", "ecartMaison"), ("vocation", "ecartSigle")):
        mot = SONDE_MOT if ligne == "maison-de" else "MND"
        de_la_feuille = largeur("%s-feuille" % ligne,
                                '<p class="%s">%s</p>' % (ligne, mot))
        de_la_source = largeur("%s-source" % ligne,
                               '<p class="%s" style="letter-spacing:%.4fem">%s</p>'
                               % (ligne, V[cle], mot))
        ecarts.append((cle, de_la_feuille, de_la_source))
    return ecarts


def eprouve_le_debout(large_debout):
    """LE VERROU DEBOUT SE VERIFIE SUR SON ENCRE, PAS SUR SON CODE.

    On rend le verrou entier, en noir sur blanc, et on mesure la largeur
    d'encre du pictogramme et celle du sigle. Leur rapport doit etre
    `largePictoDebout`. Mesurer l'encre plutot que relire le calcul est ce qui
    distingue un banc d'un echo : si le script se trompait en appliquant la
    regle, un banc qui relit le calcul se tromperait avec lui."""
    im = rends("sonde-debout",
               sonde('%s<p class="maison-de">%s</p><p class="vocation">MND</p>'
                     % (picto(), SONDE_MOT), large_debout),
               1400, 1200)
    blocs = blocs_d_encre(im)
    assert len(blocs) == 3, "la sonde devrait montrer trois bandes, elle en montre %d" % len(blocs)
    rapport = blocs[0][2] / blocs[-1][2]
    return rapport, abs(rapport - V["largePictoDebout"]) / V["largePictoDebout"]


LETTRES = {1: "une", 2: "deux", 3: "trois", 4: "quatre", 5: "cinq", 6: "six",
           7: "sept", 8: "huit", 9: "neuf", 10: "dix", 11: "onze", 12: "douze"}


def en_lettres(n):
    """Un petit nombre s'ecrit en toutes lettres sur une planche de marque.

    Il s'ECRIT AUSSI TOUT SEUL : la note de pied disait « les sept autres » et
    « huit couleurs » le jour ou la famille en comptait neuf. Un compte pose a
    la main vieillit a la premiere sous-marque ajoutee."""
    return LETTRES.get(n, str(n))


def fr(x, n=1):
    """Un nombre comme la Maison l'ecrit : virgule decimale.

    Les seuils etaient ecrits a la main dans le texte des planches, donc en
    virgules ; les faire calculer les a rendus en points, et une planche de
    marque qui melange « 4.5 » et « 8,7 » se decredibilise sur un detail."""
    return ("%.*f" % (n, x)).replace(".", ",")


# ══ 5. LES DEUX PLANCHES ══════════════════════════════════════════════
def planche_ensemble(large_debout):
    cases = []
    for g in GAMME:
        cases.append(f"""
    <div class="case">
      <div class="haut">
        <div class="tuile" style="background:{g['couleur']};width:112px;height:112px;color:{IVOIRE}">
          {picto(largeur_pc=62)}
        </div>
        <div class="verrou" style="font-size:31px;color:{g['couleur']}">
          {picto(hauteur_em=round(HAUT_DU_PICTO, 4))}
          <div class="mots"><p class="maison-de">{g['ligne']}</p><p class="vocation">MND</p></div>
        </div>
      </div>
      <div class="nom">{g['nom']}</div>
      <div class="voc">{g['vocation']}</div>
      <div class="hex">{g['nomCouleur']} &nbsp;·&nbsp; {g['couleur']}</div>
      <div class="pq">{g['pourquoi']}</div>
    </div>""")
    return tete(large_debout) + f"""
<style>
  .page{{width:1760px;padding:60px 70px}}
  .grille{{display:grid;grid-template-columns:repeat(2,1fr);gap:34px 64px;margin-top:36px}}
  .case{{display:flex;flex-direction:column;gap:2px}}
  .haut{{display:flex;align-items:center;gap:30px}}
  .nom{{font-family:'Cormorant',Georgia,serif;font-size:29px;color:var(--indigo);margin-top:16px;line-height:1.1}}
  .voc{{font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--cuivre-s);margin-top:6px}}
  .hex{{font-size:13px;color:#A8A196;margin-top:4px;letter-spacing:.06em}}
  .pq{{font-size:14.5px;color:var(--doux);margin-top:8px;line-height:1.5;font-weight:300}}
  .pied{{margin-top:34px;padding-top:22px;font-size:15.5px;color:var(--doux);font-weight:300;line-height:1.6}}
  .pied b{{color:var(--indigo);font-weight:400}}
</style>
<div class="page">
  <h1 style="font-size:46px">Les sous-marques de la Maison</h1>
  <p class="chapeau" style="margin-top:12px">
    Un seul pictogramme, jamais redessiné, et un seul verrou. Le mot du métier prend la place
    de « MAISON », au-dessus ; MND reste la grande ligne. Une sous-marque n'est donc pas un
    autre logo : c'est le même, avec un mot échangé et une couleur à elle.
  </p>
  <div class="grille">{''.join(cases)}</div>
  <div class="filet" style="margin-top:30px"></div>
  <p class="pied">
    <b>La gamme est calculée, pas choisie.</b> On relève la clarté et la saturation perçues de
    l'indigo de la Maison, et les {en_lettres(len(GAMME) - 1)} autres se posent aux mêmes, en ne
    faisant tourner que la teinte : {en_lettres(len(GAMME))} couleurs qui ne peuvent pas jurer
    entre elles, puisqu'elles ne diffèrent que par un angle. L'indigo garde sa valeur d'origine,
    plus profonde : la mère ne s'aligne pas sur ses filles. L'ardoise du Studio est la seule
    retenue en saturation, pour ne pas faire un second bleu à côté des Soins, et l'émeraude des
    Événements est la teinte la plus libre qui restait sur la roue.<br>
    <b>Un seul aplat par sous-marque, et deux dégradés pour la seule fête.</b> Les Événements
    portent les deux seuls dégradés de la charte, l'un qui reste dans leur émeraude, l'autre qui
    ramène à l'indigo. Un dégradé partout ne dirait plus rien.<br>
    <b>Deux seuils, posés avant le calcul :</b> l'encre ivoire tient au moins {fr(CONTRASTE_MINIMAL)}
    pour 1 sur chaque champ, le plus faible étant {fr(PLUS_FAIBLE)} ; et deux sous-marques
    s'écartent d'au moins {fr(ECART_MINIMAL, 0)} en Lab, la paire la plus serrée étant à
    {fr(PLUS_SERREE)}. Sous ce seuil, l'œil les confondrait sur une tuile de soixante pixels.
  </p>
</div></html>"""


def sans_accent(t):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", t)
                   if unicodedata.category(c) != "Mn")


def nom_de_fichier(nom):
    return sans_accent(nom).lower().replace(" ", "-")


def melange(de, vers, t):
    """La couleur a la fraction t d'un degre CSS : une interpolation droite
    dans sRGB, ce que fait `linear-gradient` par defaut."""
    d, v = hexa(de), hexa(vers)
    return tuple(clamp(d[i] + (v[i] - d[i]) * t) for i in range(3))


def pire_du_degrade(de, vers, pas=101):
    """LE PIRE ENDROIT D'UN DEGRADE, PAS SES BOUTS.

    Les deux extremites sont calculees, donc connues ; le milieu ne l'est pas,
    et rien ne dit que la clarte y varie sans detour. On echantillonne tout le
    parcours et on garde le plus mauvais contraste rencontre avec l'ivoire."""
    pire = 99.0
    for i in range(pas):
        c = "#%02X%02X%02X" % melange(de, vers, i / (pas - 1))
        pire = min(pire, contraste(c, IVOIRE))
    return pire


def eprouve_le_degrade_du_navigateur():
    """LE CALCUL CI-DESSUS SUPPOSE QUELQUE CHOSE : que le navigateur interpole
    droit dans sRGB. On ne le suppose pas, on le verifie une fois.

    Un premier controle voulait lire le degrade sur la planche elle-meme. Il
    cherchait le bain par sa couleur de depart et tombait sur LA TUILE, qui est
    du meme aplat : il annoncait un contraste de 0,9, ce qui n'existe pas. On
    rend donc une bande a soi, pleine largeur, a une place connue.

    LE COUPLE DE LA SONDE N'EST PAS CELUI DES PLANCHES, ET C'EST VOULU. Les
    deux teintes du degrade de fete sont presque alignees : entre elles, sRGB
    et oklab ne different que de 2 sur 255, si bien qu'une sonde faite sur ce
    couple ne verrait RIEN si le navigateur changeait de methode. On prend donc
    l'emeraude et le cuivre, qui traversent la roue : la meme bascule y creuse
    20 sur 255. Une sonde se choisit pour ce qu'elle sait detecter."""
    de, vers = "#004B41", "#B97A4A"
    large = 1000
    page = tete() + """
<style>body{background:#fff;margin:0}</style>
<div style="width:%dpx;height:60px;background:linear-gradient(90deg,%s 0%%,%s 100%%)"></div>
</html>""" % (large, de, vers)
    im = rends("sonde-degrade", page, large, 200)
    a = np.asarray(im.convert("RGB"), dtype=int)
    pire = 0
    for x in range(0, large, 7):
        attendu = np.array(melange(de, vers, x / (large - 1)))
        pire = max(pire, int(np.abs(a[30, x] - attendu).max()))
    return pire


def planche_charte(g, large_debout):
    """LA CHARTE D'UNE SOUS-MARQUE. La meme pour les neuf, au mot et a la
    couleur pres : c'est la demonstration de la regle autant que son mode
    d'emploi. Si cette planche demandait un reglage par sous-marque, la regle
    ne tiendrait pas."""
    C = g["couleur"]
    mot = g["ligne"]
    h = round(HAUT_DU_PICTO, 4)
    deg = ""
    if g["degrades"]:
        bandes = "".join(f"""
    <div class="degrade">
      <div class="bain" style="background:linear-gradient(100deg,{d['de']} 0%,{d['a']} 100%)">
        <div class="verrou" style="font-size:38px;color:var(--ivoire);flex:none">
          {picto(hauteur_em=h)}
          <div class="mots"><p class="maison-de">{mot}</p><p class="vocation">MND</p></div>
        </div>
      </div>
      <div class="n">{d['nom']}</div>
      <div class="c">{d['de']} &nbsp;vers&nbsp; {d['a']}</div>
      <div class="pq">{d['pourquoi']}</div>
    </div>""" for d in g["degrades"])
        deg = f"""
  <div class="bloc-titre" style="margin-top:42px">Les deux dégradés</div>
  <div class="degrades">{bandes}</div>"""
    return tete(large_debout) + f"""
<style>
  .page{{width:1760px;padding:60px 70px}}
  .rang{{display:flex;align-items:center;gap:56px;margin-top:38px}}
  .bloc-titre{{font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:var(--cuivre-s);margin-bottom:16px}}
  .encadre{{border:1px solid var(--filet);border-radius:6px;background:#FBF8F2;padding:34px 38px}}
  .bande{{margin-top:42px;background:{C};border-radius:8px;padding:56px 60px;color:var(--ivoire);
          display:flex;align-items:center;justify-content:space-between;gap:60px}}
  .sign{{font-family:'Cormorant',Georgia,serif;font-size:52px;line-height:1.18;font-weight:300}}
  .sign b{{font-weight:400}}
  .dit{{font-size:15px;letter-spacing:.2em;text-transform:uppercase;color:rgba(246,241,231,.72);margin-bottom:14px}}
  .palette{{display:flex;gap:18px;margin-top:38px}}
  .pastille{{width:150px}}
  .pastille .carre{{height:96px;border-radius:6px;border:1px solid var(--filet)}}
  .n{{font-size:14.5px;color:var(--indigo);margin-top:10px}}
  .c{{font-size:13px;color:#A8A196;letter-spacing:.06em}}
  .degrades{{display:flex;gap:28px}}
  .degrade{{flex:1}}
  .bain{{height:150px;border-radius:8px;display:flex;align-items:center;padding:0 40px}}
  .degrade .pq{{font-size:14.5px;color:var(--doux);margin-top:8px;line-height:1.5;font-weight:300}}
  .pied{{margin-top:34px;padding-top:22px;font-size:15.5px;color:var(--doux);font-weight:300;line-height:1.6}}
  .pied b{{color:var(--indigo);font-weight:400}}
</style>
<div class="page">
  <h1 style="font-size:46px">{g['nom']}</h1>
  <p class="chapeau" style="margin-top:12px">
    {g['vocation'].capitalize()}. La charte complète, déduite du verrou de la Maison : le
    pictogramme garde la taille qu'il y a par rapport au texte, seul le mot change et la
    couleur avec lui.
  </p>

  <div class="rang">
    <div>
      <div class="bloc-titre">La tuile</div>
      <div class="tuile" style="background:{C};width:188px;height:188px;color:var(--ivoire)">
        {picto(largeur_pc=62)}
      </div>
    </div>
    <div class="encadre">
      <div class="bloc-titre">Le verrou debout</div>
      <div class="debout" style="font-size:66px;color:{C}">
        {picto()}
        <p class="maison-de">{mot}</p><p class="vocation">MND</p>
      </div>
    </div>
    <div class="encadre" style="flex:1">
      <div class="bloc-titre">Le verrou couché</div>
      <div class="verrou" style="font-size:62px;color:{C}">
        {picto(hauteur_em=h)}
        <div class="mots"><p class="maison-de">{mot}</p><p class="vocation">MND</p></div>
      </div>
    </div>
  </div>

  <div class="bande">
    <div>
      <div class="dit">La signature</div>
      <div class="sign">{g['signature']}<b>{g['accent']}</b></div>
    </div>
    <div class="verrou" style="font-size:58px;color:var(--ivoire);flex:none">
      {picto(hauteur_em=h)}
      <div class="mots"><p class="maison-de">{mot}</p><p class="vocation">MND</p></div>
    </div>
  </div>
{deg}
  <div class="bloc-titre" style="margin-top:42px">La palette</div>
  <div class="palette" style="margin-top:0">
    <div class="pastille"><div class="carre" style="background:{C}"></div>
      <div class="n">{g['nomCouleur']}</div><div class="c">{C}</div></div>
    {'' if C == INDIGO else f'''<div class="pastille"><div class="carre" style="background:{INDIGO}"></div>
      <div class="n">Indigo, la Maison</div><div class="c">{INDIGO}</div></div>'''}
    <div class="pastille"><div class="carre" style="background:#B97A4A"></div>
      <div class="n">Cuivre, l'accent</div><div class="c">#B97A4A</div></div>
    <div class="pastille"><div class="carre" style="background:#E3DACB"></div>
      <div class="n">Sable</div><div class="c">#E3DACB</div></div>
    <div class="pastille"><div class="carre" style="background:{IVOIRE}"></div>
      <div class="n">Ivoire, le papier</div><div class="c">{IVOIRE}</div></div>
  </div>

  <div class="filet" style="margin-top:34px"></div>
  <p class="pied">
    <b>Une seule chose change d'une sous-marque à l'autre : la couleur.</b> Le pictogramme, les
    proportions, la police et la hiérarchie restent celles de la Maison. Remplacez
    {g['nomCouleur'].lower()} par la teinte d'une autre vocation et vous avez sa charte, sans
    rien redessiner.<br>
    <b>Le petit mot est plus écarté que la grande ligne</b>, {fr(V['ecartMaison'], 2)} em contre
    {fr(V['ecartSigle'], 2)} em, et ce n'est pas une inconséquence : c'est l'écartement même du
    verrou de la Maison, où « MAISON » prend le premier au-dessus de « MND » qui prend le second.
    Une ligne qu'on lit en petit a besoin d'air ; une grande ligne trop écartée se disloque. Ces
    deux nombres sont lus dans la source du verrou au moment de fabriquer la planche, ils ne sont
    pas recopiés ici.
  </p>
</div></html>"""


# ══ 6. ON FABRIQUE ════════════════════════════════════════════════════
def principal():
    os.makedirs(SORTIE, exist_ok=True)
    ecrits = {"gamme.json"}
    srv = Q(("127.0.0.1", PORT), functools.partial(Srv, directory=TRAVAIL))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        ecart_nav = eprouve_le_degrade_du_navigateur()
        print("  degrade du navigateur : %d/255 d'ecart au melange calcule" % ecart_nav)
        if ecart_nav > 3:
            raise SystemExit("  le navigateur n'interpole pas comme on le calcule.")

        for cle, feuille, source in eprouve_les_ecartements():
            print("  %-12s : %d px pose par la feuille, %d px tire de la source"
                  % (cle, feuille, source))
            if abs(feuille - source) > 1:
                raise SystemExit("  %s de la planche n'est pas celui du verrou." % cle)

        a_nous, du_site = eprouve_le_blanc_entre_les_lignes()
        print("  blanc entre les lignes : %d px comme ces planches l'ecrivent, "
              "%d px comme le site l'ecrit" % (a_nous, du_site))
        if abs(a_nous - du_site) > 1:
            raise SystemExit("  le blanc entre les lignes n'est pas celui du verrou.")

        sigle = mesure_du_sigle()
        large_debout = sigle * V["largePictoDebout"]
        print("  sigle mesure a %.4f de son corps ; pictogramme debout pose a %.4f em"
              % (sigle, large_debout))
        rapport, ecart = eprouve_le_debout(large_debout)
        print("  verrou debout : pictogramme a %.4f de la largeur du sigle, "
              "la source en declare %.4f (ecart %.2f %%)"
              % (rapport, V["largePictoDebout"], ecart * 100))
        if ecart > 0.02:
            raise SystemExit("  le pictogramme debout n'est pas a sa proportion.")

        im = rends_et_ajuste("ensemble", planche_ensemble(large_debout), 1760)
        pires, deformes = contraste_des_tuiles(im, {g["nom"]: g["couleur"] for g in GAMME})
        print("  contraste relu SUR LA PLANCHE, la plus faible tuile : %s a %.1f"
              % (pires[0][1], pires[0][0]))
        if pires[0][0] < CONTRASTE_MINIMAL:
            raise SystemExit("  une tuile n'atteint pas le seuil : la planche mentirait.")
        pire, ou, r, jeu = deformes[0]
        print("  pictogramme des tuiles : rapport %.4f pour %.4f au dessin, soit %.0f %% "
              "du jeu d'un pixel (%s)" % (r, RAPPORT_DU_PICTO, pire * 100, ou))
        if pire > 1.0:
            raise SystemExit("  le pictogramme est deforme sur une tuile.")
        shutil.copyfile(os.path.join(TRAVAIL, "ensemble.png"),
                        os.path.join(SORTIE, "0-vue-d-ensemble.png"))
        ecrits.add("0-vue-d-ensemble.png")
        print("  docs/marque/sous-marques/0-vue-d-ensemble.png   %sx%s" % im.size)

        # LES NEUF CHARTES, UNE PAR SOUS-MARQUE. La meme planche a chaque fois :
        # si l'une demandait un reglage a elle, la regle ne tiendrait pas.
        for i, g in enumerate(GAMME, start=1):
            nom = nom_de_fichier(g["nom"])
            im = rends_et_ajuste(nom, planche_charte(g, large_debout), 1760)
            for d in g["degrades"]:
                pire = pire_du_degrade(d["de"], d["a"])
                print("     %-24s l'encre ivoire tient %.1f a son pire endroit"
                      % (d["nom"], pire))
                if pire < CONTRASTE_MINIMAL:
                    raise SystemExit("  un degrade passe sous le seuil : l'encre s'y perdrait.")
            fichier = "%d-%s.png" % (i, nom)
            shutil.copyfile(os.path.join(TRAVAIL, nom + ".png"), os.path.join(SORTIE, fichier))
            ecrits.add(fichier)
            print("  docs/marque/sous-marques/%-28s %sx%s" % (fichier, *im.size))

        json.dump(GAMME, io.open(os.path.join(SORTIE, "gamme.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        # ON BALAIE CE QU'ON N'A PAS ECRIT. Les planches sont numerotees ; une
        # sous-marque inseree au milieu decale les numeros et l'ancien fichier
        # reste, sous un nom que plus rien ne produit. C'est arrive des la
        # neuvieme, et une charte perimee s'est recopiee sur le bureau.
        for reste in sorted(set(os.listdir(SORTIE)) - ecrits):
            if reste.endswith(".png"):
                os.remove(os.path.join(SORTIE, reste))
                print("  balaye : %s (plus produit par ce script)" % reste)
        print("  docs/marque/sous-marques/gamme.json             %d sous-marques" % len(GAMME))
    finally:
        srv.shutdown()
        shutil.rmtree(TRAVAIL, ignore_errors=True)


if __name__ == "__main__":
    principal()
