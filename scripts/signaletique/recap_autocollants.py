# -*- coding: utf-8 -*-
"""LE RÉCAPITULATIF DE TOUS LES AUTOCOLLANTS, 23 octobre 2026.

    python scripts/signaletique/recap_autocollants.py "<sortie>"

« Fais une page qui résume tous les autocollants » (Yéman) : une seule page A3
paysage, R9 (les 15 ronds Ø200) puis N12 (la boutique), chaque dessin avec son
nom, sa taille, son nombre par feuille et une place suggérée. Les dessins sont
ceux des fichiers d'impression, jamais redessinés. Sortie : un PDF et un PNG.
"""
import html
import io
import os
import subprocess
import sys

import pypdfium2 as pdfium

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from enseignes import Atelier  # noqa: E402
from formes import pose_logo  # noqa: E402
import autocollants  # noqa: E402
import autocollants_boutique as boutique  # noqa: E402

SORTIE = sys.argv[1]
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
NOM = 'Autocollants · récapitulatif A3'
esc = html.escape
os.makedirs(SORTIE, exist_ok=True)

# Une place suggérée par famille de R9 ; la boutique ferme sachets et boîtes.
PLACE_R9 = {'qr': 'Counter, exit', 'slogan': 'Entrance, mirrors', 'shampoing': 'Shampoo basins', 'bien-etre': 'Mirrors, stations',
            'formule': 'Boutique shelf', 'soin': 'Stations', 'coiffure': 'Mirrors', 'boutique': 'Boutique shelf',
            'kids': 'Kids corner', 'retour': 'Reception'}


# Un filet gris clair autour de chaque pièce : l'ivoire et le sable ne se perdent pas dans le fond de la page.
FILET = 'fill="none" stroke="#CFC7B8" stroke-width="{e}"'


def rond(cx, cy, r, e):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" {FILET.format(e=e)}/>'


def carre(x, y, w, h, rx, e):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" {FILET.format(e=e)}/>'


def vignette(contenu, w, h, largeur_mm):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
            f'style="width:{largeur_mm}mm;height:{largeur_mm * h / w:.2f}mm;display:block">{contenu}</svg>')


def case(img, nom, ligne1, ligne2):
    return (f'<div class="case">{img}<b>{esc(nom)}</b><span>{esc(ligne1)}</span><span class="pl">{esc(ligne2)}</span></div>')


def page():
    a = Atelier(True)       # les couleurs du rendu, sans trait de découpe : c'est une page à lire
    logo, _w, _h = pose_logo('verrou-couche', 0, 0, largeur=320, couleur='#F6F1E7')
    r9 = []
    for n, (fam, titre, _fond, _d) in enumerate(autocollants.AUTOCOLLANTS):
        img = vignette(autocollants.autocollant(a, n, 100, 100, decoupe=False) + rond(100, 100, 99.4, 1.2), 200, 200, 40)
        r9.append(case(img, f'{n + 1:02d} · {titre}', 'Ø200 mm · 1 per sheet', PLACE_R9.get(fam, '')))
    b = boutique
    n12 = []
    for i, (fam, titre, _fond, _d, nb) in enumerate(b.PASTILLES):
        d = 2 * b.R_REEL
        filet = carre(0.3, 0.3, d - 0.6, d - 0.6, 3 * b.K, 0.5) if _d is None else rond(d / 2, d / 2, d / 2 - 0.3, 0.5)
        img = vignette(b.pastille(a, i, d / 2, d / 2, decoupe=False) + filet, d, d, 34)
        forme = f'{d:g} × {d:g} mm' if _d is None else f'Ø{d:g} mm'
        n12.append(case(img, titre, f'{forme} · {nb} per sheet', 'Box seal' if _d is None else 'Bags, tissue paper, gift boxes'))
    lw, lh = b.ETIQ_W * b.K_ETIQ, b.ETIQ_H * b.K_ETIQ
    img = vignette(b.etiquette(a, lw / 2, lh / 2, decoupe=False) + carre(0.3, 0.3, lw - 0.6, lh - 0.6, 3 * b.K_ETIQ, 0.5), lw, lh, 56)
    n12.append(case(img, 'La Brume · Hydra Mist label', f'{lw:.0f} × {lh:.0f} mm · {b.N_ETIQ} per sheet', 'Mist bottle 250 ml'))
    par_feuille = sum(p[4] for p in b.PASTILLES) + b.N_ETIQ
    corps = f'''
<div class="bandeau"><svg viewBox="0 0 320 {_h:.1f}">{logo}</svg>
<div class="t"><b>All our stickers · Tous nos autocollants</b><span>Two sheets of 1060 × 680 mm, synthetic paper, matte lamination · 100 sheets each</span></div>
<div class="d">23 Oct 2026<br>Maison MND · Cotonou, Benin</div></div>
<h2><span class="ref">R9</span> Round stickers Ø200 mm · 15 designs, 1 of each per sheet · 100 sheets = 100 of each</h2>
<div class="grille r9">{''.join(r9)}</div>
<h2><span class="ref">N12</span> Boutique stickers · {len(n12)} designs, {b.PAR_DESSIN} of each per sheet ({par_feuille} pieces) · 100 sheets = {b.PAR_DESSIN * 100} of each</h2>
<div class="grille n12">{''.join(n12)}</div>
<p class="pied">Print files in « Impression · R9 et N12 »: the machine PDF at 1:1 with the cut line as spot colour CutContour, print-only, cut-only, and an A3 proof with each sticker at actual size. Places are suggestions.</p>'''
    css = '''@page { size: 420mm 297mm; margin: 0 }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact }
html, body { margin: 0; padding: 0 }
body { width: 420mm; height: 297mm; padding: 10mm 12mm; font: 7.4pt/1.25 Arial, sans-serif; color: #1E2150; background: #FBF8F2; display: flex; flex-direction: column; gap: 3.5mm; overflow: hidden }
.bandeau { display: flex; align-items: center; gap: 6mm; background: #1E2150; color: #F6F1E7; padding: 3.5mm 5mm; border-radius: 1.5mm }
.bandeau svg { height: 8mm; width: auto; flex: none }
.bandeau .t { flex: 1; display: grid; gap: .6mm; font-size: 8.5pt } .bandeau .t b { font-size: 13pt; letter-spacing: .02em }
.bandeau .d { font-size: 7.5pt; text-align: right; color: #E2AC7C }
h2 { margin: 1mm 0 0; font-size: 10pt; display: flex; gap: 3mm; align-items: baseline; border-bottom: .3mm solid #B97A4A; padding-bottom: 1mm }
h2 .ref { background: #B97A4A; color: #FBF8F2; padding: .4mm 2mm; border-radius: 1mm; font-size: 9pt }
.grille { display: grid; gap: 2.5mm 3mm; align-items: start }
.r9 { grid-template-columns: repeat(8, 1fr) } .n12 { grid-template-columns: repeat(6, 1fr) }
.case { display: grid; justify-items: center; text-align: center; gap: .7mm }
.case b { font-size: 7pt; margin-top: .6mm } .case span { color: #555; font-size: 6.4pt } .case .pl { color: #B97A4A }
.pied { margin: auto 0 0; color: #666; font-size: 6.8pt }'''
    return f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Maison MND · all our stickers</title><style>{css}</style></head><body>{corps}</body></html>'


h = os.path.join(SORTIE, '_recap.html')
io.open(h, 'w', encoding='utf-8').write(page())
pdf = os.path.join(SORTIE, NOM + '.pdf')
subprocess.run([CHROME, '--headless=new', '--no-first-run', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=30000',
                f'--print-to-pdf={pdf}', 'file:///' + h.replace('\\', '/')], capture_output=True, timeout=300)
os.remove(h)
d = pdfium.PdfDocument(pdf)
d[0].render(scale=300 / 72 * 0.8).to_pil().save(os.path.join(SORTIE, NOM + '.png'), optimize=True)
print(os.path.basename(pdf), len(d), 'page(s)')
