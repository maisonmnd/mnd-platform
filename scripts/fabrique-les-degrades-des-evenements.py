# -*- coding: utf-8 -*-
"""LES DEUX DEGRADES DES EVENEMENTS, EN FICHIERS (26 septembre 2026).

Evenements MND est la seule sous-marque en degrade, et sur les FONDS
uniquement, jamais sur le monogramme. Deux parcours restent a trancher :
Souverain, qui ne prend que des teintes de la Maison, et Vif, qui s'ouvre en
violet, framboise, corail et or.

Ce script les livre en fichiers qu'on pose : le bain seul, et le bain avec le
verrou ivoire dessus, en paysage et en carre. Le SVG est le fichier maitre,
un degrade n'ayant aucune resolution propre ; les PNG sont la pour ce qui
n'accepte pas le vectoriel.

LES ARRETS NE SONT PAS RETAPES ICI. Ils viennent de
`docs/marque/sous-marques/gamme.json`, que `fabrique-les-sous-marques.py`
ecrit : deux fichiers qui declareraient chacun leur version du meme degrade
finiraient par en donner deux.

LE VERROU SE POSE SUR LE DEBUT DU BAIN. Les deux degrades s'eclaircissent : a
leur extremite, l'ivoire ne tient plus que 3,1 et 2,4 pour 1. Ce n'est pas un
defaut du degrade, c'est une regle de pose, et le controle la mesure la ou
l'encre se trouve reellement.

Lancer : python scripts/fabrique-les-degrades-des-evenements.py
Sortie  : docs/marque/sous-marques/degrades/
"""
import functools
import http.server
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
SORTIE = os.path.join(RACINE, "docs", "marque", "sous-marques", "degrades")
GAMME_JSON = os.path.join(RACINE, "docs", "marque", "sous-marques", "gamme.json")
LOGOS = os.path.join(RACINE, "docs", "marque", "sous-marques", "logos")
NAV = "C:/Program Files/Google/Chrome/Application/chrome.exe"
PORT = 8809
IVOIRE = "#F6F1E7"

# Les deux formes utiles : l'ecran et l'affiche d'un cote, le reseau de l'autre.
FORMES = [("paysage", 2560, 1440), ("carre", 1440, 1440)]
# Le verrou occupe cette part de la largeur, pose a gauche, dans le sombre.
PART_DU_VERROU = 0.34
# La part du bain sur laquelle l'encre se pose vraiment.
PART_QUI_PORTE_L_ENCRE = 0.45


def sans_accent(t):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", t)
                   if unicodedata.category(c) != "Mn")


def slug(t):
    out = []
    for c in sans_accent(t).lower():
        out.append(c if c.isalnum() else "-")
    return "-".join(x for x in "".join(out).split("-") if x)


# ══ LES COULEURS ══════════════════════════════════════════════════════
def hexa(s):
    return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))


def lin(v):
    v /= 255
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4


def clarte(c):
    r, g, b = (lin(x) for x in hexa(c))
    return .2126 * r + .7152 * g + .0722 * b


def contraste(a, b):
    la, lb = clarte(a), clarte(b)
    return (max(la, lb) + .05) / (min(la, lb) + .05)


def melange(de, vers, t):
    d, v = hexa(de), hexa(vers)
    return tuple(max(0, min(255, int(round(d[i] + (v[i] - d[i]) * t)))) for i in range(3))


def le_long(arrets, de=0.0, a=1.0, pas=81):
    """Le pire contraste de l'ivoire entre deux fractions du parcours."""
    n = len(arrets) - 1
    pire = 99.0
    for i in range(pas):
        t = de + (a - de) * i / (pas - 1)
        seg = min(int(t * n), n - 1)
        c = "#%02X%02X%02X" % melange(arrets[seg], arrets[seg + 1], t * n - seg)
        pire = min(pire, contraste(c, IVOIRE))
    return pire


def stops(arrets):
    n = len(arrets) - 1
    return ", ".join("%s %.1f%%" % (c, 100.0 * i / n) for i, c in enumerate(arrets))


# ══ LES FICHIERS ══════════════════════════════════════════════════════
def svg_du_bain(arrets, large, haut):
    """Le bain seul, en vectoriel. Un degrade n'a pas de resolution : c'est
    lui le fichier maitre, et les PNG n'en sont que des tirages.

    L'AXE EST HORIZONTAL, ET DANS LES DEUX FICHIERS LE MEME. Un premier jet
    posait le SVG en diagonale, de (0 ; 0,2) a (1 ; 0,8), et le CSS a 117
    degres : deux descriptions differentes du meme degrade, qui ne pouvaient
    pas tomber pareil. Pire, un axe en diagonale exprime en parts de la boite
    tourne avec le format, alors qu'un angle CSS est absolu : les deux
    n'auraient pu coincider que pour un seul rapport. Horizontal, ils sont
    identiques a toute taille et a tout format, et le controle d'en bas peut
    comparer pixel a pixel au lieu de chercher dans une fenetre."""
    n = len(arrets) - 1
    liste = "".join('<stop offset="%.4f" stop-color="%s"/>' % (i / n, c)
                    for i, c in enumerate(arrets))
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" '
            'height="%d" preserveAspectRatio="none" role="img" '
            'aria-label="Événements MND">\n'
            '<defs><linearGradient id="bain" x1="0" y1="0" x2="1" y2="0">%s</linearGradient></defs>\n'
            '<rect width="%d" height="%d" fill="url(#bain)"/>\n</svg>\n'
            % (large, haut, large, haut, liste, large, haut))


class Srv(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class Q(socketserver.TCPServer):
    allow_reuse_address = True


def rends(travail, nom, html, large, haut):
    io.open(os.path.join(travail, "_%s.html" % nom), "w", encoding="utf-8").write(html)
    cible = os.path.join(travail, "%s.png" % nom)
    if os.path.exists(cible):
        os.remove(cible)      # Chrome qui echoue n'ecrit rien et ne dit rien
    subprocess.run([NAV, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--user-data-dir=" + os.path.join(travail, "profil"),
                    "--window-size=%d,%d" % (large, haut), "--virtual-time-budget=20000",
                    "--screenshot=" + cible, "http://127.0.0.1:%d/_%s.html" % (PORT, nom)],
                   capture_output=True, timeout=300)
    assert os.path.exists(cible), "%s : Chrome n'a rien rendu" % nom
    im = Image.open(cible).convert("RGB")
    assert im.size == (large, haut), "%s : %sx%s au lieu de %sx%s" % (nom, *im.size, large, haut)
    return im


def page(arrets, large, haut, verrou=None):
    fond = ("background:linear-gradient(to right, %s);width:%dpx;height:%dpx;margin:0"
            % (stops(arrets), large, haut))
    dedans = ""
    if verrou:
        dedans = ('<img src="verrou.svg" style="position:absolute;left:%.0fpx;top:50%%;'
                  'transform:translateY(-50%%);width:%.0fpx">'
                  % (large * 0.07, large * PART_DU_VERROU))
    return ('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style>'
            '<div style="position:relative;%s">%s</div>' % (fond, dedans))


# ══ LES CONTROLES ═════════════════════════════════════════════════════
def eprouve_le_bain(im, arrets):
    """Le bain rendu suit-il les arrets declares, PIXEL A PIXEL ?

    L'axe etant horizontal, la couleur d'une colonne ne depend que de son x :
    on compare donc exactement, sans chercher dans une fenetre. Un premier
    controle cherchait la meilleure correspondance a plus ou moins un cinquieme
    de la largeur, ce qui aurait laisse passer a peu pres n'importe quel
    degrade de la bonne famille."""
    a = np.asarray(im, dtype=int)
    n = len(arrets) - 1
    y = im.height // 2
    pire = 0
    for i in range(0, 101):
        t = i / 100
        x = min(im.width - 1, max(0, int(round(t * (im.width - 1)))))
        seg = min(int(t * n), n - 1)
        attendu = np.array(melange(arrets[seg], arrets[seg + 1], t * n - seg))
        pire = max(pire, int(np.abs(a[y, x] - attendu).max()))
    return pire


def eprouve_l_encre(im):
    """L'ivoire tient-il la ou le verrou se pose ?

    Mesure sur les pixels du bain rendu, dans la bande de gauche ou l'encre se
    trouve, et non sur les couleurs nommees : ce sont les pixels qu'on verra."""
    a = np.asarray(im, dtype=float)
    bande = a[:, :int(im.width * PART_QUI_PORTE_L_ENCRE), :]
    def lum(v):
        v = v / 255.0
        return np.where(v <= 0.03928, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)
    L = .2126 * lum(bande[:, :, 0]) + .7152 * lum(bande[:, :, 1]) + .0722 * lum(bande[:, :, 2])
    Li = clarte(IVOIRE)
    return float(((Li + .05) / (L + .05)).min())


def principal():
    if not os.path.exists(GAMME_JSON):
        raise SystemExit("  gamme.json manque : lance d'abord "
                         "scripts/fabrique-les-sous-marques.py")
    gamme = json.load(io.open(GAMME_JSON, encoding="utf-8"))
    ev = next((g for g in gamme if g.get("degrades")), None)
    if not ev:
        raise SystemExit("  aucune sous-marque ne porte de dégradé dans gamme.json")
    print("  %s : %d dégradés déclarés" % (ev["nom"], len(ev["degrades"])))

    os.makedirs(SORTIE, exist_ok=True)
    ecrits = set()
    travail = tempfile.mkdtemp(prefix="degrades-")
    shutil.copyfile(os.path.join(LOGOS, "verrou-couche",
                                 "verrou-couche-evenements-mnd-ivoire.svg"),
                    os.path.join(travail, "verrou.svg"))
    srv = Q(("127.0.0.1", PORT), functools.partial(Srv, directory=travail))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        for d in ev["degrades"]:
            nom = slug(d["nom"])
            arrets = d["arrets"]
            sous = le_long(arrets, 0.0, PART_QUI_PORTE_L_ENCRE)
            partout = le_long(arrets)
            print("  %-22s l'ivoire tient %.1f là où le verrou se pose, %.1f au bout"
                  % (d["nom"], sous, partout))
            if sous < 3.0:
                raise SystemExit("  le verrou ne se lirait pas sur son propre dégradé.")

            # Le fichier maître : le bain en vectoriel, sans taille propre.
            f = "%s.svg" % nom
            io.open(os.path.join(SORTIE, f), "w", encoding="utf-8").write(
                svg_du_bain(arrets, 2560, 1440))
            ecrits.add(f)

            for forme, large, haut in FORMES:
                for suffixe, verrou in (("", None), ("-verrou", True)):
                    cle = "%s-%s%s" % (nom, forme, suffixe)
                    im = rends(travail, cle, page(arrets, large, haut, verrou), large, haut)
                    if verrou is None:
                        ecart = eprouve_le_bain(im, arrets)
                        if ecart > 12:
                            raise SystemExit("  %s : le bain rendu s'écarte de %d/255 des "
                                             "arrêts déclarés." % (cle, ecart))
                        encre = eprouve_l_encre(im)
                        if encre < 3.0:
                            raise SystemExit("  %s : l'ivoire ne tient que %.1f là où le "
                                             "verrou se pose." % (cle, encre))
                    im.save(os.path.join(SORTIE, cle + ".png"), optimize=True)
                    ecrits.add(cle + ".png")
                    print("     %-34s %dx%d" % (cle + ".png", large, haut))

            # Les arrêts, écrits à côté des fichiers : un dégradé se redonne.
            f = "%s.txt" % nom
            io.open(os.path.join(SORTIE, f), "w", encoding="utf-8").write(
                "%s\n%s\n\nArrêts : %s\n\nCSS :\n  background: linear-gradient(to right, %s);\n"
                "\nLe verrou se pose sur le DÉBUT du bain, jamais sur sa fin : l'ivoire y tient "
                "%.1f pour 1, contre %.1f à l'autre bout.\n"
                % (d["nom"], d["pourquoi"], " → ".join(arrets), stops(arrets), sous, partout))
            ecrits.add(f)
    finally:
        srv.shutdown()
        shutil.rmtree(travail, ignore_errors=True)

    for reste in sorted(set(os.listdir(SORTIE)) - ecrits):
        os.remove(os.path.join(SORTIE, reste))
        print("  balayé : %s (plus produit par ce script)" % reste)
    print("  %d fichiers dans docs/marque/sous-marques/degrades/" % len(ecrits))


if __name__ == "__main__":
    principal()
