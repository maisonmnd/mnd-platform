# -*- coding: utf-8 -*-
"""LES LOGOS DES SOUS-MARQUES, UN PAR FICHIER (26 septembre 2026).

Les planches montrent la charte ; ce script livre les fichiers qu'on POSE :
pour chacune des neuf sous-marques, le pictogramme seul, le verrou couche et
le verrou debout, chacun dans son fichier, en vectoriel et en image.

RIEN N'EST REDESSINE ICI. Le trace du pictogramme, les proportions du verrou
et les contours de Cormorant viennent de `scripts/fabrique-le-vectoriel.py`,
qui est le bâtisseur de la Maison : ce script n'en change que deux choses, le
MOT et la COULEUR. C'est exactement la regle des sous-marques, appliquee au
fichier au lieu de l'etre a la planche.

LE TEXTE DES SVG N'EST PAS DU TEXTE, ce sont les contours exacts de Cormorant
pris dans la police. Un logo ne depend donc d'aucune police installee, et il
ne se casse pas quand on l'agrandit.

Lancer : python scripts/fabrique-les-logos-des-sous-marques.py
Sortie  : docs/marque/sous-marques/logos/
"""
import functools
import http.server
import importlib.util
import io
import json
import os
import shutil
import socketserver
import subprocess
import tempfile
import threading

import numpy as np
from PIL import Image

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, "docs", "marque", "sous-marques", "logos")
GAMME_JSON = os.path.join(RACINE, "docs", "marque", "sous-marques", "gamme.json")
NAV = "C:/Program Files/Google/Chrome/Application/chrome.exe"
PORT = 8801
# Le cote le plus long des images. Les SVG, eux, n'ont pas de taille.
COTE = 2048


def batisseur():
    """Le bâtisseur de la Maison, charge tel quel.

    Son nom porte des tirets : il ne s'importe pas par `import`. On le charge
    donc par son chemin, ce qui a l'avantage de dire tout haut que c'est bien
    CE fichier-la, et pas une copie, qui donne les proportions."""
    chemin = os.path.join(RACINE, "scripts", "fabrique-le-vectoriel.py")
    sp = importlib.util.spec_from_file_location("vectoriel", chemin)
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


V = batisseur()


def la_gamme():
    if not os.path.exists(GAMME_JSON):
        raise SystemExit("  gamme.json manque : lance d'abord "
                         "scripts/fabrique-les-sous-marques.py")
    return json.load(io.open(GAMME_JSON, encoding="utf-8"))


def sans_accent(t):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", t)
                   if unicodedata.category(c) != "Mn")


def slug(nom):
    return sans_accent(nom).lower().replace(" ", "-")


# ══ LES TROIS FORMES ══════════════════════════════════════════════════
def les_trois_formes(g, mot, teinte, label):
    """Le pictogramme seul, le verrou couche et le verrou debout.

    Le calcul est celui du bâtisseur de la Maison, au mot pres. Il est repris
    ici plutot qu'appele parce que `main()` la-bas ecrit les fichiers de la
    Maison ; les lignes qui suivent sont les memes, et si les deux divergeaient
    un jour, `verifie-les-logos-des-sous-marques` le dirait : il compare le
    verrou MAISON produit ici a celui que la Maison livre."""
    d, pL, pH = g["trace"], g["pL"], g["pH"]
    p, geo = g["police"], g["geo"]
    S = 1000.0
    rapportPicto = pL / pH
    out = {}

    # ── Le pictogramme seul : sa boite EST son encre.
    out["pictogramme"] = V.svg('<path d="%s"/>' % d, (0, 0, pL, pH), teinte, label)

    # ── Le verrou couche.
    hP = geo["hautDuPicto"] * S
    lP = hP * rapportPicto
    hBloc = geo["hautDuBloc"] * S
    hautTotal = max(hP, hBloc)
    yBloc = (hautTotal - hBloc) / 2
    xTexte = lP + geo["ecartPicto"] * S
    cM = geo["partMaison"] * S
    yPicto = (hautTotal - hP) / 2
    ligne1 = p.ligne(mot, cM, geo["ecartMaison"], xTexte, yBloc + p.baseSurBoite * cM)
    ligne2 = p.ligne("MND", S, geo["ecartSigle"], xTexte,
                     yBloc + cM + geo["entreLignes"] * S + p.baseSurBoite * S)
    pic = '<path d="%s" transform="translate(0 %.3f) scale(%.6f)"/>' % (d, yPicto, hP / pH)
    boite = (0, min(yPicto, ligne1["haut"], ligne2["haut"]),
             max(lP, ligne1["droite"], ligne2["droite"]),
             max(yPicto + hP, ligne1["bas"], ligne2["bas"]))
    out["verrou-couche"] = V.svg(pic + "\n" + "\n".join(ligne1["d"] + ligne2["d"]),
                                 boite, teinte, label)

    # ── Le verrou debout : tout est centre sur un axe, sur l'ENCRE de chaque ligne.
    essai = p.ligne("MND", S, geo["ecartSigle"], 0, 0)
    lPicto = geo["largePictoDebout"] * essai["large"]
    hPicto = lPicto / rapportPicto
    axe = max(lPicto, essai["large"]) / 2
    yM = hPicto + geo["souslePicto"] * S
    essaiM = p.ligne(mot, cM, geo["ecartMaison"], 0, 0)
    haut1 = p.ligne(mot, cM, geo["ecartMaison"],
                    axe - essaiM["large"] / 2 - essaiM["gauche"], yM + p.baseSurBoite * cM)
    haut2 = p.ligne("MND", S, geo["ecartSigle"],
                    axe - essai["large"] / 2 - essai["gauche"],
                    yM + cM + geo["entreLignes"] * S + p.baseSurBoite * S)
    pic2 = '<path d="%s" transform="translate(%.3f 0) scale(%.6f)"/>' % (
        d, axe - lPicto / 2, lPicto / pL)
    boite2 = (min(axe - lPicto / 2, haut1["gauche"], haut2["gauche"]), 0,
              max(axe + lPicto / 2, haut1["droite"], haut2["droite"]),
              max(hPicto, haut1["bas"], haut2["bas"]))
    out["verrou-debout"] = V.svg(pic2 + "\n" + "\n".join(haut1["d"] + haut2["d"]),
                                 boite2, teinte, label)
    return out


# ══ LES IMAGES ════════════════════════════════════════════════════════
class Srv(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class Q(socketserver.TCPServer):
    allow_reuse_address = True


def dimensions(svg_texte):
    import re
    m = re.search(r'viewBox="([-\d. ]+)"', svg_texte)
    x0, y0, L, H = (float(v) for v in m.group(1).split())
    return L, H


def en_image(travail, nom, svg_texte):
    """Le PNG du meme dessin, FOND TRANSPARENT.

    Un logo se pose sur ce qu'on veut : un fond blanc cuit dans le fichier est
    un defaut qu'on ne voit qu'une fois le logo pose sur autre chose. Chrome
    rend transparent avec `--default-background-color=00000000`, et le controle
    d'apres verifie qu'il reste bien des pixels transparents."""
    L, H = dimensions(svg_texte)
    large = COTE if L >= H else max(1, round(COTE * L / H))
    haut = COTE if H > L else max(1, round(COTE * H / L))
    io.open(os.path.join(travail, nom + ".svg"), "w", encoding="utf-8").write(svg_texte)
    page = ('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;'
            'background:transparent}img{display:block;width:%dpx;height:%dpx}</style>'
            '<img src="%s.svg" alt="">' % (large, haut, nom))
    io.open(os.path.join(travail, "_%s.html" % nom), "w", encoding="utf-8").write(page)
    cible = os.path.join(travail, nom + ".png")
    if os.path.exists(cible):
        os.remove(cible)      # Chrome qui echoue n'ecrit rien et ne dit rien
    subprocess.run([NAV, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--default-background-color=00000000",
                    "--user-data-dir=" + os.path.join(travail, "profil"),
                    "--window-size=%d,%d" % (large, haut),
                    "--virtual-time-budget=20000", "--screenshot=" + cible,
                    "http://127.0.0.1:%d/_%s.html" % (PORT, nom)],
                   capture_output=True, timeout=300)
    assert os.path.exists(cible), "%s : Chrome n'a rien rendu" % nom
    im = Image.open(cible).convert("RGBA")
    assert im.size == (large, haut), "%s : %sx%s au lieu de %sx%s" % (nom, *im.size, large, haut)
    return im, (L, H)


# ══ LES CONTROLES ═════════════════════════════════════════════════════
def eprouve_l_image(im, boite, teinte, nom):
    """Trois choses sur chaque image, relues sur ses pixels.

      · il reste du transparent, donc le fond n'a pas ete cuit dedans ;
      · l'encre touche les quatre bords, donc le fichier est au ras du dessin
        et ne traine pas de vide invisible ;
      · l'encre est bien la couleur de la sous-marque, et pas celle d'une
        autre : c'est la seule chose qui distingue ces fichiers entre eux, et
        une boucle qui se trompe de teinte ne se voit pas dans un nom."""
    a = np.asarray(im, dtype=int)
    alpha = a[:, :, 3]
    assert (alpha == 0).any(), "%s : aucun pixel transparent, le fond a ete cuit" % nom
    # L'ETENDUE SE PREND SUR TOUTE TRACE D'ENCRE, pas sur l'encre franche. La
    # ou une courbe est tangente au bord, sa couverture du pixel est infime :
    # un seuil a mi-alpha manquait ces rangs-la et annoncait trois pixels de
    # vide sur un fichier pourtant au ras du dessin.
    encre = alpha > 0
    assert encre.any(), "%s : aucune encre" % nom
    ys, xs = np.where(encre)
    H, L = alpha.shape
    debords = (int(xs.min()), int(L - 1 - xs.max()), int(ys.min()), int(H - 1 - ys.max()))
    attendu = tuple(int(teinte[i:i + 2], 16) for i in (1, 3, 5))
    plein = alpha > 250
    moyenne = tuple(int(round(a[:, :, c][plein].mean())) for c in range(3))
    ecart_teinte = max(abs(m - t) for m, t in zip(moyenne, attendu))
    # Le rapport du fichier doit etre celui de la boite declaree dans le SVG.
    rapport = (xs.max() - xs.min() + 1) / (ys.max() - ys.min() + 1)
    voulu = boite[0] / boite[1]
    return max(debords), ecart_teinte, abs(rapport - voulu) / voulu


def principal():
    gamme = la_gamme()
    # ON N'EFFACE PAS LE DOSSIER, ON BALAIE CE QU'ON N'A PAS ECRIT. `rmtree` a
    # echoue en « acces refuse » : le dossier vit dans OneDrive, qui le tient
    # le temps de le synchroniser. Balayer fichier par fichier, apres coup,
    # obtient le meme resultat sans jamais demander la suppression d'un dossier
    # que le systeme est en train de lire.
    ecrits = set()
    for forme in ("pictogramme", "verrou-couche", "verrou-debout"):
        os.makedirs(os.path.join(SORTIE, forme), exist_ok=True)

    geo = V.geometrie()
    d, pL, pH, _encre = V.trace_le_picto()
    commun = {"trace": d, "pL": pL, "pH": pH, "police": V.Police(), "geo": geo}
    print("  pictogramme du depot : %d courbes, boite %.0f x %.0f" % (d.count("M"), pL, pH))

    travail = tempfile.mkdtemp(prefix="logos-sous-marques-")
    srv = Q(("127.0.0.1", PORT), functools.partial(Srv, directory=travail))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    pires = {"debord": (0, ""), "teinte": (0, ""), "rapport": (0.0, "")}
    n = 0
    try:
        for g in gamme:
            formes = les_trois_formes(commun, g["ligne"], g["couleur"], g["nom"])
            for forme, texte in formes.items():
                nom = "%s-%s" % (forme, slug(g["nom"]))
                chemin = os.path.join(SORTIE, forme, nom + ".svg")
                io.open(chemin, "w", encoding="utf-8").write(texte)
                ecrits.add(os.path.join(forme, nom + ".svg"))
                ecrits.add(os.path.join(forme, nom + ".png"))
                ecart = V.rien_n_est_rogne(chemin)
                if ecart is not None and ecart > 0.01:
                    raise SystemExit("  %s : la boite n'est pas celle de l'encre "
                                     "(%.2f %%)" % (nom, ecart * 100))
                im, boite = en_image(travail, nom, texte)
                im.save(os.path.join(SORTIE, forme, nom + ".png"))
                debord, teinte, rapport = eprouve_l_image(im, boite, g["couleur"], nom)
                for cle, valeur in (("debord", debord), ("teinte", teinte),
                                    ("rapport", rapport)):
                    if valeur > pires[cle][0]:
                        pires[cle] = (valeur, nom)
                n += 2
            print("  %-16s %s   pictogramme, verrou couche, verrou debout"
                  % (g["nom"], g["couleur"]))
    finally:
        srv.shutdown()
        shutil.rmtree(travail, ignore_errors=True)

    for forme in ("pictogramme", "verrou-couche", "verrou-debout"):
        for reste in sorted(os.listdir(os.path.join(SORTIE, forme))):
            if os.path.join(forme, reste) not in ecrits:
                os.remove(os.path.join(SORTIE, forme, reste))
                print("  balaye : %s (plus produit par ce script)" % reste)

    print("  boites du vectoriel : aucune encre ne deborde ni ne flotte")
    # LE SEUIL NE SE POSE PAS SUR LA MESURE DU JOUR. Le vide observe est de
    # deux pixels sur deux mille, c'est-a-dire le grain d'antialiasing la ou
    # une courbe est tangente au bord. Un seuil pose a deux crierait au premier
    # pixel de derive ; un vrai bord perdu, lui, se compte en dizaines.
    jeu = round(COTE * 0.003)
    print("  images : au plus %d px de vide au bord, pour %d admis (%s)"
          % (pires["debord"][0], jeu, pires["debord"][1]))
    if pires["debord"][0] > jeu:
        raise SystemExit("  une image traine du vide : elle n'est pas au ras du dessin.")
    print("  images : l'encre est la bonne teinte a %d/255 pres (%s)"
          % (pires["teinte"][0], pires["teinte"][1]))
    if pires["teinte"][0] > 2:
        raise SystemExit("  une image n'a pas la couleur de sa sous-marque.")
    print("  images : le rapport suit la boite du vectoriel a %.2f %% pres (%s)"
          % (pires["rapport"][0] * 100, pires["rapport"][1]))
    if pires["rapport"][0] > 0.01:
        raise SystemExit("  une image ne suit pas la boite de son vectoriel.")
    print("  %d fichiers dans docs/marque/sous-marques/logos/ (%d sous-marques x 3 formes x 2)"
          % (n, len(gamme)))


if __name__ == "__main__":
    principal()
