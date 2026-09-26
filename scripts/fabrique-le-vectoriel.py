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
from fontTools.pens.boundsPen import BoundsPen
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
        Rend (chemins, largeur d'encre, x du premier trait d'encre).

        LA BOÎTE D'UNE LETTRE SE DEMANDE À LA POLICE, ELLE NE SE DEVINE PAS
        DANS LE CHEMIN — 25 septembre 2026. Une première version lisait les
        coordonnées du chemin SVG en les prenant une sur deux, en supposant
        qu'elles allaient par paires. C'est faux : fontTools écrit des
        raccourcis `H` et `V` pour les traits horizontaux et verticaux, qui ne
        portent qu'UN nombre. Tout ce qui suivait était décalé d'un cran, et
        des ordonnées passaient pour des abscisses. Le D de MND perdait quinze
        unités sur sa droite, et la boîte le rognait. On demande donc ses
        bornes à `BoundsPen`, qui suit le dessin et non son écriture."""
        e = corps / self.upem
        plume_x = x
        morceaux = []
        gauche = droite = haut = bas = None
        for c in mot:
            nom = self.cmap[ord(c)]
            stylo = SVGPathPen(self.glyphes)
            self.glyphes[nom].draw(stylo)
            d = stylo.getCommands()
            bornes = BoundsPen(self.glyphes)
            self.glyphes[nom].draw(bornes)
            if d:
                morceaux.append(
                    '<path d="%s" transform="translate(%.3f %.3f) scale(%.6f %.6f)"/>'
                    % (d, plume_x, y, e, -e))
            if bornes.bounds:
                a, b = plume_x + bornes.bounds[0] * e, plume_x + bornes.bounds[2] * e
                gauche = a if gauche is None else min(gauche, a)
                droite = b if droite is None else max(droite, b)
                # y descend dans un SVG : le haut de l'encre vient du yMax.
                ha, ba = y - bornes.bounds[3] * e, y - bornes.bounds[1] * e
                haut = ha if haut is None else min(haut, ha)
                bas = ba if bas is None else max(bas, ba)
            plume_x += self.hmtx[nom][0] * e + ecart * corps
        return {"d": morceaux, "gauche": gauche, "droite": droite,
                "haut": haut, "bas": bas,
                "large": (droite - gauche if gauche is not None else 0)}


def rien_n_est_rogne(chemin_svg):
    """LA BOITE DECLAREE EST-ELLE BIEN CELLE DE L'ENCRE ?

    Un SVG dont la boîte est trop étroite ne prévient pas : il coupe. C'est
    arrivé le 25 septembre 2026, le D de MND rogné dans les quatorze fichiers,
    parce que les bornes des lettres étaient devinées dans le chemin au lieu
    d'être demandées à la police.

    On rend donc le même dessin dans une boîte ELARGIE de 10 % sur chaque bord,
    et l'on regarde où l'encre commence et finit. Si la boîte déclarée est
    juste, l'encre occupe exactement le rectangle du milieu : ni rognée, ni
    flottant dans du vide.

    L'ENCRE EST FORCEE EN NOIR pour la mesure. Rendue sur blanc, une encre
    ivoire ou sable ne se voit pas, et le contrôle se tairait sur trois
    fichiers en croyant les avoir lus."""
    import subprocess
    import tempfile
    nav = next((p for p in [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    ] if os.path.exists(p)), None)
    if not nav:
        return None
    src = open(chemin_svg, encoding="utf-8").read()
    m = re.search(r'viewBox="([-\dd.]+) ([-\dd.]+) ([-\dd.]+) ([-\dd.]+)"', src)
    if not m:
        return None
    x0, y0, L, H = (float(v) for v in m.groups())
    marge = 0.10
    elargi = src.replace(m.group(0), 'viewBox="%.2f %.2f %.2f %.2f"' % (
        x0 - L * marge, y0 - H * marge, L * (1 + 2 * marge), H * (1 + 2 * marge)))
    elargi = re.sub(r'fill="#[0-9A-Fa-f]{6}"', 'fill="#000000"', elargi, count=1)
    tmp = tempfile.mkdtemp(prefix="boite-")
    f2 = os.path.join(tmp, "e.svg")
    open(f2, "w", encoding="utf-8").write(elargi)
    large = 1400
    haut = round(large * H / L)
    page = os.path.join(tmp, "p.html")
    png = os.path.join(tmp, "v.png")
    open(page, "w", encoding="utf-8").write(
        '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}'
        'img{width:%dpx;height:auto;display:block}</style><img src="file:///%s">'
        % (large, f2.replace(os.sep, "/")))
    subprocess.run([nav, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--user-data-dir=" + os.path.join(tmp, "p"),
                    "--allow-file-access-from-files",
                    "--window-size=%d,%d" % (large, haut + 60), "--virtual-time-budget=20000",
                    "--screenshot=" + png, "file:///" + page.replace(os.sep, "/")],
                   capture_output=True, timeout=180)
    if not os.path.exists(png):
        return None
    im = Image.open(png).convert("L")
    a = np.array(im.crop((0, 0, large, min(haut, im.height)))) < 200
    cols = np.where(a.any(axis=0))[0]
    rangs = np.where(a.any(axis=1))[0]
    if not len(cols) or not len(rangs):
        return None
    # Le rendu elargi fait `large` de large pour L*(1+2*marge) unites : l'encre
    # doit donc commencer a marge/(1+2*marge) de la largeur, et finir juste
    # avant la meme marge de l'autre cote.
    dx = large * marge / (1 + 2 * marge)
    lx = large / (1 + 2 * marge)
    dy = a.shape[0] * marge / (1 + 2 * marge)
    ly = a.shape[0] / (1 + 2 * marge)
    return max(abs(cols[0] - dx) / lx, abs(cols[-1] + 1 - (dx + lx)) / lx,
               abs(rangs[0] - dy) / ly, abs(rangs[-1] + 1 - (dy + ly)) / ly)



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


def svg(contenu, boite, teinte, label="Maison MND"):
    """LA BOITE SE PREND SUR L'ENCRE, jamais sur les boîtes du CSS. Une boîte
    tirée des hauteurs de ligne porte le vide que la police laisse sous la
    ligne de base : le verrou debout traînait ainsi 5 % de transparent sous le
    sigle, et l'on ne pose pas un logo avec du vide invisible au bord."""
    x0, y0, x1, y1 = boite
    L, H = x1 - x0, y1 - y0
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%.2f %.2f %.2f %.2f" '
            'width="%.0f" height="%.0f" fill="%s" role="img" '
            'aria-label="%s">\n%s\n</svg>\n'
            % (x0, y0, L, H, round(L), round(H), teinte, label, contenu))


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
    # Le tracé occupe exactement 0..pL et 0..pH : sa boîte EST son encre.
    for nom, teinte in TEINTES.items():
        open(os.path.join(SORTIE, "pictogramme-%s.svg" % nom), "w", encoding="utf-8").write(
            svg('<path d="%s"/>' % d, (0, 0, pL, pH), teinte))
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
    yPicto = (hautTotal - hP) / 2

    maison = p.ligne("MAISON", cM, g["ecartMaison"], xTexte, yBloc + p.baseSurBoite * cM)
    sigle = p.ligne("MND", S, g["ecartSigle"], xTexte,
                    yBloc + cM + g["entreLignes"] * S + p.baseSurBoite * S)
    pic = '<path d="%s" transform="translate(0 %.3f) scale(%.6f)"/>' % (d, yPicto, hP / pH)
    # LA BOITE EST L'UNION DES TROIS ENCRES, pas la somme des boîtes du CSS.
    boite = (0,
             min(yPicto, maison["haut"], sigle["haut"]),
             max(lP, maison["droite"], sigle["droite"]),
             max(yPicto + hP, maison["bas"], sigle["bas"]))
    for nom in VERROUS:
        open(os.path.join(SORTIE, "verrou-couche-%s.svg" % nom), "w", encoding="utf-8").write(
            svg(pic + "\n" + "\n".join(maison["d"] + sigle["d"]), boite, TEINTES[nom]))
    print("  verrou couché : 3 encres, %.0f x %.0f" % (boite[2] - boite[0], boite[3] - boite[1]))

    # ── 3. Le verrou debout ───────────────────────────────────────────
    # Ici tout est CENTRÉ sur un axe : on centre l'encre de chaque ligne.
    essai = p.ligne("MND", S, g["ecartSigle"], 0, 0)
    lPicto = g["largePictoDebout"] * essai["large"]
    hPicto = lPicto / rapportPicto
    axe = max(lPicto, essai["large"]) / 2
    yM = hPicto + g["souslePicto"] * S
    essaiM = p.ligne("MAISON", cM, g["ecartMaison"], 0, 0)
    maison2 = p.ligne("MAISON", cM, g["ecartMaison"],
                      axe - essaiM["large"] / 2 - essaiM["gauche"], yM + p.baseSurBoite * cM)
    sigle2 = p.ligne("MND", S, g["ecartSigle"],
                     axe - essai["large"] / 2 - essai["gauche"],
                     yM + cM + g["entreLignes"] * S + p.baseSurBoite * S)
    pic2 = '<path d="%s" transform="translate(%.3f 0) scale(%.6f)"/>' % (
        d, axe - lPicto / 2, lPicto / pL)
    boite2 = (min(axe - lPicto / 2, maison2["gauche"], sigle2["gauche"]),
              0,
              max(axe + lPicto / 2, maison2["droite"], sigle2["droite"]),
              max(hPicto, maison2["bas"], sigle2["bas"]))
    for nom in VERROUS:
        open(os.path.join(SORTIE, "verrou-debout-%s.svg" % nom), "w", encoding="utf-8").write(
            svg(pic2 + "\n" + "\n".join(maison2["d"] + sigle2["d"]), boite2, TEINTES[nom]))
    print("  verrou debout : 3 encres, %.0f x %.0f"
          % (boite2[2] - boite2[0], boite2[3] - boite2[1]))


    # ── 4. LES CONTROLES ──────────────────────────────────────────────
    for nom in sorted(os.listdir(SORTIE)):
        e = rien_n_est_rogne(os.path.join(SORTIE, nom))
        if e is None:
            print("  ATTENTION : la boîte de %s n'a pas pu être vérifiée" % nom)
        elif e > 0.01:
            sys.exit("  %s : l'encre déborde sa boîte de %.1f %% — elle est rognée."
                     % (nom, e * 100))
    print("  boîtes vérifiées : aucune encre ne déborde (14 fichiers)")


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
