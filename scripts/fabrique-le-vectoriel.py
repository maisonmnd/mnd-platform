# -*- coding: utf-8 -*-
"""LE LOGO EN VECTORIEL : il s'agrandit sans jamais se pixelliser.

    python scripts/fabrique-le-vectoriel.py

Il ecrit des SVG dans public/assets/vectoriel/. Un SVG ne contient pas de
pixels mais des COURBES : double, triple, imprime-le sur une devanture de trois
metres, il reste net.

DEUX PIECES, DEUX METHODES, et la difference compte.

  · LE TEXTE ne se trace pas : la police porte deja ses contours. On les prend
    dans cormorant-latin.woff2 avec fontTools, a la graisse 400 (la police est
    variable, son defaut est 300 : sans instanciation on obtiendrait un autre
    dessin que celui de l'ecran). C'est donc le dessin EXACT de Cormorant,
    pas une approximation.

  · LE PICTOGRAMME n'existe qu'en pixels : il faut le TRACER. Tracer n'est pas
    redessiner. On ne pose aucune courbe a la main : potrace suit le bord de
    l'encre du fichier du depot et en tire des courbes. Le script mesure
    ensuite l'ecart entre le trace et l'original, et REFUSE de livrer au-dela
    d'un demi pour cent de pixels differents.

LES PROPORTIONS SONT CELLES DE src/ds/verrou.ts, lues ici sans etre recopiees.

POURQUOI PYTHON DANS UN DEPOT EN JAVASCRIPT. Les outils du vectoriel sont la :
fontTools lit les contours d'une police, potrace suit un bord. Les reecrire en
JavaScript serait les reecrire moins bien.
    pip install fonttools brotli potracer numpy pillow
"""
import os
import re
import sys

import numpy as np
import potrace
from PIL import Image
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MONOS = os.path.join(RACINE, "public", "assets", "monograms")
SORTIE = os.path.join(RACINE, "public", "assets", "vectoriel")
POLICE = os.path.join(RACINE, "src", "ds", "fonts", "cormorant-latin.woff2")

ENCRES = {
    "indigo": "mono-indigo.png", "indigo-profond": "mono-indigo-profond.png",
    "cuivre": "mono-copper.png", "obsidienne": "mono-obsidian.png",
    "or": "mono-or.png", "argile": "mono-argile.png",
    "sable": "mono-sable.png", "ivoire": "mono-ivoire.png",
}
VERROUS = ["indigo", "cuivre", "ivoire"]


def geometrie():
    """Les proportions du verrou, lues dans src/ds/verrou.ts."""
    src = open(os.path.join(RACINE, "src", "ds", "verrou.ts"), encoding="utf-8").read()
    g = {}
    for clef in ("partMaison", "ecartSigle", "ecartMaison", "entreLignes",
                 "ecartPicto", "hautPicto", "souslePicto", "largePictoDebout"):
        m = re.search(clef + r":\s*([0-9./ ]+),", src)
        if not m:
            sys.exit("proportion introuvable dans verrou.ts : " + clef)
        g[clef] = eval(m.group(1).strip())  # « 42 / 132 » ou « 1.10 »
    g["hautDuBloc"] = g["partMaison"] + g["entreLignes"] + 1
    g["hautDuPicto"] = g["hautDuBloc"] * g["hautPicto"]
    return g


# ── LE PICTOGRAMME, TRACÉ ────────────────────────────────────────────
def trace_le_picto():
    """Les courbes du pictogramme, et l'écart mesuré avec l'original."""
    im = Image.open(os.path.join(MONOS, "mono-indigo.png")).convert("RGBA")
    a = im.split()[-1]
    a = a.crop(a.getbbox())
    L, H = a.size
    encre = np.array(a) > 127
    # POTRACE SUIT LE ZERO, PAS LE UN. Sa convention vient du noir sur blanc :
    # il trace ce qui vaut FAUX. Nourri de l'encre telle quelle, il suit le
    # FOND et rend la forme en negatif — 99,9 % des pixels en desaccord, ce que
    # le controle ci-dessous a attrape du premier coup. On lui donne donc le
    # complement.
    chemin = potrace.Bitmap(~encre).trace(turdsize=2, alphamax=1.0,
                                          opticurve=True, opttolerance=0.2)

    # potracer rend des points objets, pas des couples : on les lit par x et y.
    pt = lambda p: (p.x, p.y)
    bouts = []
    for courbe in chemin:
        bouts.append("M%.2f %.2f" % pt(courbe.start_point))
        for seg in courbe:
            if seg.is_corner:
                bouts.append("L%.2f %.2f L%.2f %.2f" % (pt(seg.c) + pt(seg.end_point)))
            else:
                bouts.append("C%.2f %.2f %.2f %.2f %.2f %.2f"
                             % (pt(seg.c1) + pt(seg.c2) + pt(seg.end_point)))
        bouts.append("Z")
    return " ".join(bouts), L, H, encre


def ecart_du_trace(d, L, H, encre):
    """Combien de pixels le tracé rend-il differemment de l'original ?
    On rend le tracé seul, à la même taille, et on compte les désaccords."""
    import subprocess
    import tempfile
    nav = next((p for p in [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    ] if os.path.exists(p)), None)
    if not nav:
        return None
    tmp = tempfile.mkdtemp(prefix="verifie-trace-")
    svg = os.path.join(tmp, "t.svg")
    open(svg, "w", encoding="utf-8").write(
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
        'viewBox="0 0 %d %d"><path d="%s" fill="#000"/></svg>' % (L, H, L, H, d))
    png = os.path.join(tmp, "t.png")
    subprocess.run([nav, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--user-data-dir=" + os.path.join(tmp, "p"),
                    "--default-background-color=00000000",
                    "--window-size=%d,%d" % (L, H), "--virtual-time-budget=15000",
                    "--screenshot=" + png, "file:///" + svg.replace(os.sep, "/")],
                   capture_output=True, timeout=180)
    if not os.path.exists(png):
        return None
    rendu = np.array(Image.open(png).convert("RGBA").resize((L, H)).split()[-1]) > 127
    return float((rendu != encre).mean())


# ── LE TEXTE, PRIS DANS LA POLICE ────────────────────────────────────
class Police:
    """Cormorant à la graisse 400, et ses contours."""

    def __init__(self):
        f = TTFont(POLICE)
        self.f = instancer.instantiateVariableFont(f, {"wght": 400}, inplace=False)
        self.upem = self.f["head"].unitsPerEm
        self.cmap = self.f.getBestCmap()
        self.glyphes = self.f.getGlyphSet()
        self.hmtx = self.f["hmtx"]
        h = self.f["hhea"]
        # Avec line-height:1, la demi-interligne vaut (1 - (A+D)/upem)/2 et la
        # ligne de base tombe donc ici sous le haut de la boîte :
        self.baseSurBoite = (1 - (h.ascender - h.descender) / self.upem) / 2 \
            + h.ascender / self.upem

    def ligne(self, mot, corps, ecart, x, y):
        """Les contours d'un mot, posés à (x, y) = origine de la première
        lettre sur la ligne de base. `ecart` est en em, comme letter-spacing.
        Rend (chemins, largeur d'encre, x du premier trait d'encre)."""
        e = corps / self.upem
        plume_x = x
        morceaux = []
        gauche, droite = None, None
        for c in mot:
            nom = self.cmap[ord(c)]
            stylo = SVGPathPen(self.glyphes)
            self.glyphes[nom].draw(stylo)
            d = stylo.getCommands()
            if d:
                morceaux.append(
                    '<path d="%s" transform="translate(%.3f %.3f) scale(%.6f %.6f)"/>'
                    % (d, plume_x, y, e, -e))
                xs = [float(v) for v in re.findall(r"[-\d.]+", d)[0::2]]
                if xs:
                    a, b = plume_x + min(xs) * e, plume_x + max(xs) * e
                    gauche = a if gauche is None else min(gauche, a)
                    droite = b if droite is None else max(droite, b)
            plume_x += self.hmtx[nom][0] * e + ecart * corps
        return morceaux, (droite - gauche if gauche is not None else 0), gauche


def compare_au_png(chemin_svg, chemin_png):
    """LE VECTORIEL DIT-IL LA MEME CHOSE QUE LE DESSIN DE REFERENCE ?

    Tracer le pictogramme juste ne suffit pas : le texte est posé ici par un
    calcul (ligne de base, écartement, demi-interligne) qui refait à la main ce
    que le navigateur fait tout seul. Une erreur d'un demi-em ne se verrait pas
    sur un seul fichier ; elle se voit tout de suite en superposant. On rend
    donc le SVG à la largeur du PNG et l'on compte les pixels qui diffèrent.

    Le seuil est large, 5 %, et c'est exprès : chaque contour porte un liseré
    d'un pixel dû à l'antialiasing, et ce liseré compte pour beaucoup sur un
    dessin tout en traits fins. Ce qu'on cherche n'est pas la perfection au
    pixel, c'est l'absence de DECALAGE : un mot posé de travers ferait bondir
    ce chiffre bien au-delà."""
    import subprocess
    import tempfile
    nav = next((p for p in [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    ] if os.path.exists(p)), None)
    if not nav or not os.path.exists(chemin_png):
        return None
    ref = Image.open(chemin_png).convert("RGBA")
    L, H = ref.size
    tmp = tempfile.mkdtemp(prefix="cmp-svg-")
    page = os.path.join(tmp, "p.html")
    png = os.path.join(tmp, "v.png")
    open(page, "w", encoding="utf-8").write(
        '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}'
        'img{width:%dpx;height:auto;display:block}</style><img src="file:///%s">'
        % (L, os.path.abspath(chemin_svg).replace(os.sep, "/")))
    subprocess.run([nav, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--user-data-dir=" + os.path.join(tmp, "p"),
                    "--allow-file-access-from-files",
                    "--window-size=%d,%d" % (L, H + 40), "--virtual-time-budget=20000",
                    "--screenshot=" + png, "file:///" + page.replace(os.sep, "/")],
                   capture_output=True, timeout=180)
    if not os.path.exists(png):
        return None
    v = np.array(Image.open(png).convert("L").crop((0, 0, L, H))) < 200
    r = np.array(ref.split()[-1]) > 100
    return float((v != r).mean())


def svg(contenu, L, H, teinte):
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.2f %.2f" '
            'width="%.0f" height="%.0f" fill="%s" role="img" '
            'aria-label="Maison MND">\n%s\n</svg>\n'
            % (L, H, round(L), round(H), teinte, contenu))


TEINTES = {"indigo": "#1E2150", "indigo-profond": "#15173A", "cuivre": "#B97A4A",
           "obsidienne": "#14141B", "or": "#B8902F", "argile": "#CDBBA9",
           "sable": "#E3DACB", "ivoire": "#F6F1E7"}


def main():
    os.makedirs(SORTIE, exist_ok=True)
    g = geometrie()
    d, pL, pH, encre = trace_le_picto()
    print("  pictogramme tracé : %d courbes, %d caractères de chemin"
          % (d.count("M"), len(d)))
    ecart = ecart_du_trace(d, pL, pH, encre)
    if ecart is None:
        print("  ATTENTION : l'écart du tracé n'a pas pu être mesuré")
    else:
        print("  écart avec le dessin d'origine : %.3f %% des pixels" % (ecart * 100))
        if ecart > 0.005:
            sys.exit("  le tracé s'écarte de plus d'un demi pour cent : on ne livre pas.")

    # ── 1. Le pictogramme seul, dans les huit encres ──────────────────
    for nom, teinte in TEINTES.items():
        open(os.path.join(SORTIE, "pictogramme-%s.svg" % nom), "w", encoding="utf-8").write(
            svg('<path d="%s"/>' % d, pL, pH, teinte))
    print("  pictogramme : 8 encres")

    p = Police()
    S = 1000.0  # le corps du sigle ; un SVG n'a pas d'échelle, celle-ci est arbitraire
    rapportPicto = pL / pH

    # ── 2. Le verrou couché ───────────────────────────────────────────
    hP = g["hautDuPicto"] * S
    lP = hP * rapportPicto
    hBloc = g["hautDuBloc"] * S
    hautTotal = max(hP, hBloc)
    yBloc = (hautTotal - hBloc) / 2
    xTexte = lP + g["ecartPicto"] * S
    cM = g["partMaison"] * S

    maison, lM, gM = p.ligne("MAISON", cM, g["ecartMaison"], xTexte,
                             yBloc + p.baseSurBoite * cM)
    sigle, lS, gS = p.ligne("MND", S, g["ecartSigle"], xTexte,
                            yBloc + cM + g["entreLignes"] * S + p.baseSurBoite * S)
    # Le bloc est calé à gauche SUR L'ENCRE : on ramène chaque ligne à
    # l'alignement du verrou du dépôt, où les deux mots partent du même bord.
    droite = max(gM + lM, gS + lS)
    L = droite
    H = hautTotal
    pic = '<path d="%s" transform="translate(0 %.3f) scale(%.6f)"/>' % (
        d, (hautTotal - hP) / 2, hP / pH)
    for nom in VERROUS:
        open(os.path.join(SORTIE, "verrou-couche-%s.svg" % nom), "w", encoding="utf-8").write(
            svg(pic + "\n" + "\n".join(maison + sigle), L, H, TEINTES[nom]))
    print("  verrou couché : 3 encres, %.0f x %.0f" % (L, H))

    # ── 3. Le verrou debout ───────────────────────────────────────────
    # Ici tout est CENTRÉ sur un axe : on centre l'encre de chaque ligne.
    _, lS2, gS2 = p.ligne("MND", S, g["ecartSigle"], 0, 0)
    lPicto = g["largePictoDebout"] * lS2
    hPicto = lPicto / rapportPicto
    axe = max(lPicto, lS2) / 2
    yM = hPicto + g["souslePicto"] * S
    maison2, lM2, gM2 = p.ligne("MAISON", cM, g["ecartMaison"], 0, 0)
    maison2, _, _ = p.ligne("MAISON", cM, g["ecartMaison"], axe - lM2 / 2 - gM2,
                            yM + p.baseSurBoite * cM)
    sigle2, _, _ = p.ligne("MND", S, g["ecartSigle"], axe - lS2 / 2 - gS2,
                           yM + cM + g["entreLignes"] * S + p.baseSurBoite * S)
    H2 = yM + cM + g["entreLignes"] * S + S
    pic2 = '<path d="%s" transform="translate(%.3f 0) scale(%.6f)"/>' % (
        d, axe - lPicto / 2, lPicto / pL)
    for nom in VERROUS:
        open(os.path.join(SORTIE, "verrou-debout-%s.svg" % nom), "w", encoding="utf-8").write(
            svg(pic2 + "\n" + "\n".join(maison2 + sigle2), axe * 2, H2, TEINTES[nom]))
    print("  verrou debout : 3 encres, %.0f x %.0f" % (axe * 2, H2))

    # ── 4. LE CONTROLE : superposer au dessin de reference ────────────
    e = compare_au_png(os.path.join(SORTIE, "verrou-couche-indigo.svg"),
                       os.path.join(RACINE, "public/assets/verrous/verrou-couche-indigo.png"))
    if e is None:
        print("  ATTENTION : la comparaison au PNG n'a pas pu être faite")
    else:
        print("  superposé au dessin de référence : %.2f %% des pixels diffèrent" % (e * 100))
        if e > 0.05:
            sys.exit("  plus de 5 %% d'écart : le texte est posé de travers, on ne livre pas.")

    poids = sum(os.path.getsize(os.path.join(SORTIE, f)) for f in os.listdir(SORTIE))
    print("  %d fichiers, %d ko en tout" % (len(os.listdir(SORTIE)), poids // 1024))


if __name__ == "__main__":
    main()
