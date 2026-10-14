# -*- coding: utf-8 -*-
"""Fabrique l'équipement : python fabrique.py <sortie> <catalogue> <vestiaire>
  · <sortie>/Fichiers 1-1 (SVG)/ : les oeuvres des fabricants ;
  · <catalogue>/fiches-<famille>.html : les fiches anglaises, une par fournisseur ;
  · <catalogue>/catalogue.html : la page française (pièces, tenues de séance,
    prêt des tenues, marche à suivre). <vestiaire> : le dossier des maquettes
    de t-shirts (G:/My Drive/Maison MND/04 · Vestiaire et MND 229/maquettes)."""
import base64
import html
import io
import os
import sys

from PIL import Image

import dessins as D
from dessins import C, I, P, V, S
from enseignes import Atelier
from formes import ENCRES, cmjn, logo, rvb
from oeuvres import OEUVRES, svg
from pieces import PIECES, HYPOTHESES, CLIENTES_JOUR, ROTATION
import serie2  # noqa: F401  la série 2 s'inscrit dans PIECES et OEUVRES

SORTIE, CATALOGUE, VESTIAIRE = sys.argv[1], sys.argv[2], sys.argv[3]
FICHIERS = os.path.join(SORTIE, 'Fichiers 1-1 (SVG)')
os.makedirs(FICHIERS, exist_ok=True)
os.makedirs(CATALOGUE, exist_ok=True)

import re as _re
_UNITES = _re.compile('([0-9]) (K|mm|cm|USD|V|°C|g|pièces?|feuilles|clientes)(?![A-Za-z])')


def lie_les_unites(page):
    """Le nombre reste avec son unité, dans le TEXTE seulement : une espace
    insécable dans les données d'un chemin SVG casserait le dessin."""
    return _re.sub('>([^<]+)<', lambda m: '>' + _UNITES.sub(lambda u: u.group(1) + chr(160) + u.group(2), m.group(1)) + '<', page)


def image_ref(chemin, cote):
    """Une photo de référence réduite, en JPEG dans la page."""
    im = Image.open(chemin).convert('RGB')
    im.thumbnail((cote, cote))
    tampon = io.BytesIO()
    im.save(tampon, 'JPEG', quality=82, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(tampon.getvalue()).decode()


# ══ 1. LES FICHIERS 1:1 ═════════════════════════════════════════════════
LISTE = {}
for p in PIECES:
    LISTE[p['id']] = []
    for titre, w, h, f, fond, contour, note in OEUVRES.get(p['id'], []):
        nom = f'{titre}.svg'
        assert all(ord(ch) < 128 for ch in nom), nom
        io.open(os.path.join(FICHIERS, nom), 'w', encoding='utf-8').write(svg(titre, w, h, f(), fond, contour, note))
        LISTE[p['id']].append((nom, w, h, svg(titre, w, h, f(), fond, contour, note)))

# ══ 2. LES RENDUS ═══════════════════════════════════════════════════════
SYMBOLES = ''.join(f'<symbol id="lg-{n}" viewBox="0 0 {logo(n)[1]} {logo(n)[2]}">{logo(n)[0]}</symbol>'
                   for n in ('verrou-debout', 'verrou-couche', 'pictogramme'))
DEFS = ('<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' + SYMBOLES
        + '<linearGradient id="cuivre-metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E2AC7C"/><stop offset=".35" stop-color="#B97A4A"/>'
          '<stop offset=".6" stop-color="#8E5A33"/><stop offset=".85" stop-color="#C98D5B"/><stop offset="1" stop-color="#A86B3E"/></linearGradient>'
        + ''.join(f'<linearGradient id="tissu-{n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{a}"/><stop offset=".5" stop-color="{b}"/><stop offset="1" stop-color="{c}"/></linearGradient>'
                  for n, a, b, c in (('indigo', '#2A2E6B', '#1E2150', '#171A42'), ('profond', '#1E2050', '#15173A', '#0F1130'),
                                     ('ivoire', '#FBF8F1', '#F6F1E7', '#EAE2D3'), ('sable', '#ECE4D6', '#E3DACB', '#D5CAB6')))
        + '<pattern id="bouclette" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.7" fill="#FFFFFF" opacity=".16"/></pattern>'
          '<linearGradient id="miroir" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E4EAEF"/><stop offset=".45" stop-color="#B9C5CF"/>'
          '<stop offset=".7" stop-color="#D3DCE3"/><stop offset="1" stop-color="#A9B6C2"/></linearGradient>'
          '<linearGradient id="inox" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9C3A1"/><stop offset=".5" stop-color="#C08A5E"/><stop offset="1" stop-color="#9C6A44"/></linearGradient>'
          '<linearGradient id="marbre" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4F0E9"/><stop offset="1" stop-color="#DED5C7"/></linearGradient>'
          '<filter id="ombre" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="14"/><feOffset dy="16"/>'
          '<feComponentTransfer><feFuncA type="linear" slope=".28"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
          '<filter id="halo" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="26" result="b"/>'
          '<feFlood flood-color="#FFD39A" flood-opacity=".95"/><feComposite in2="b" operator="in" result="g"/>'
          '<feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
        + '<radialGradient id="scene-mur" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#F3ECDF"/><stop offset="1" stop-color="#D9CDB9"/></radialGradient>'
        + '</defs></svg>')

LW, LH = 1600, 1000
SOL = 900


def rendu(p):
    a = Atelier(True)
    corps = p['dessin'](a)
    w, h = p['w'], p['h']
    marge_h, marge_b = 90, 70 if p['scene'] == 'mur' else LH - SOL
    e = min((LW - 240) / w, (LH - marge_h - marge_b) / h)
    x = (LW - w * e) / 2
    y = (LH - marge_b - h * e) if p['scene'] == 'sol' else (LH - h * e) / 2
    fond = ('<rect width="1600" height="1000" fill="url(#scene-mur)"/>' if p['scene'] == 'mur' else
            '<rect width="1600" height="900" fill="url(#scene-mur)"/><rect y="900" width="1600" height="100" fill="#CDBFA9"/>'
            '<rect y="900" width="1600" height="3" fill="#B8A88F"/>')
    filtre = 'halo' if p.get('effet') == 'halo' else 'ombre'
    return (f'<svg viewBox="0 0 {LW} {LH}" role="img" aria-label="{html.escape(p["nom"])}">'
            f'{fond}<g filter="url(#{filtre})"><g transform="translate({x:.2f} {y:.2f}) scale({e:.5f})">{corps}</g></g></svg>')


# ══ 3. LES FICHES ANGLAISES, UNE PAR FOURNISSEUR ════════════════════════
COTES = {'A1': ('700 mm', '900 mm + straps'), 'A2': ('750 mm', '1000 mm + neck strap'), 'A3': ('600 mm + ties', '450 mm'),
         'F1': ('front and back views, 650 mm each', '830–930 mm'), 'F2': ('≈ 1750 mm', '≈ 1000 mm'), 'F4': ('Ø 460 mm seat', '520–720 mm'),
         'M3': ('800 mm (base 880)', '2000 mm'),
         **{k: ('side view (see size)', '≈ 950 mm') for k in ('L1', 'L2', 'L3', 'L4')},
         **{k: ('front and back views, 660 mm each', 'height adjustable') for k in ('C1', 'C2', 'C3', 'C4')},
         'C5': ('side view (reclined position dashed) and back view', 'height adjustable'), 'M4': ('glass side and back, Ø 220 mm each', '350 mm with handle'), 'S2': ('650 mm', '250 mm')}
NOMS_EN = {'indigo': 'Indigo', 'indigo-profond': 'Deep indigo', 'cuivre': 'Copper', 'ivoire': 'Ivory', 'sable': 'Sand', 'argile': 'Clay'}
FAMILLES = [('textile', 'Aprons, cape and towels', ('Tabliers', 'Linge')),
            ('fauteuils', 'Chairs and shampoo units', ('Fauteuils',)),
             ('miroirs', 'Mirrors', ('Miroirs',)),
            ('serie2', 'Shampoo units and salon chairs, series 2', ('Bacs, série 2', 'Fauteuils, série 2'))]


def encres_de(*textes):
    t = ' '.join(textes).upper()
    return [n for n in NOMS_EN if ENCRES[n].upper() in t]


def vue_cotee(p, lw=245, lh=165):
    a = Atelier(False)
    w, h = p['w'], p['h']
    s = min(lw / w, lh / h)
    m = 24
    W, H = w * s + 2 * m, h * s + 2 * m
    x0, y0, x1, y1 = m, m, m + w * s, m + h * s
    lw_, lh_ = COTES.get(p['id'], (f'{w} mm', f'{h} mm'))
    k = '#C2410C'
    cote = (f'<g stroke="{k}" stroke-width=".35"><line x1="{x0}" y1="{y0 - 9}" x2="{x1}" y2="{y0 - 9}"/><line x1="{x0}" y1="{y0 - 13}" x2="{x0}" y2="{y0 - 5}"/>'
            f'<line x1="{x1}" y1="{y0 - 13}" x2="{x1}" y2="{y0 - 5}"/><line x1="{x0 - 18}" y1="{y0}" x2="{x0 - 18}" y2="{y1}"/>'
            f'<line x1="{x0 - 22}" y1="{y0}" x2="{x0 - 14}" y2="{y0}"/><line x1="{x0 - 22}" y1="{y1}" x2="{x0 - 14}" y2="{y1}"/></g>'
            f'<text x="{(x0 + x1) / 2}" y="{y0 - 11.5}" font-size="4.2" text-anchor="middle" fill="{k}" font-family="Arial">{lw_}</text>'
            f'<text transform="translate({x0 - 20.5} {(y0 + y1) / 2}) rotate(-90)" font-size="4.2" text-anchor="middle" fill="{k}" font-family="Arial">{lh_}</text>')
    return (f'<svg viewBox="-60 0 {W + 60:.2f} {H:.2f}" preserveAspectRatio="xMidYMid meet">'
            f'<g transform="translate({m} {m}) scale({s:.6f})">{p["dessin"](a)}</g>{cote}</svg>')


def vignette(w, h, contenu):
    """Un fichier 1:1 réduit, pour la fiche : sans ses millimètres, il remplit sa case."""
    return contenu.replace(f' width="{w}mm" height="{h}mm"', ' preserveAspectRatio="xMidYMid meet"', 1)


def nuancier(*textes):
    out = []
    for n in encres_de(*textes):
        hx = ENCRES[n]
        c, m, y, k = cmjn(hx)
        r, g, b = rvb(hx)
        out.append(f'<div class="nu"><span style="background:{hx}"></span><b>{NOMS_EN[n]}</b> {hx} · RGB {r} {g} {b} · CMYK {c} {m} {y} {k}</div>')
    return ''.join(out)


CSS_FICHES = '''@page { size: A3 landscape; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font: 9.5pt/1.42 Arial, Helvetica, sans-serif; color: #222; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 420mm; height: 297mm; padding: 12mm 14mm; page-break-after: always; display: flex; flex-direction: column; gap: 6mm; }
header { display: flex; justify-content: space-between; align-items: center; background: #1E2150; color: #F6F1E7; padding: 4mm 6mm; font-size: 10pt; letter-spacing: .04em; }
header .id { font-size: 20pt; font-weight: bold; color: #E2AC7C; }
.corps { flex: 1; display: grid; grid-template-columns: 250mm 1fr; gap: 8mm; min-height: 0; }
.gauche { display: flex; flex-direction: column; gap: 4mm; min-height: 0; }
.vue { border: .3mm solid #ddd; flex: 1; min-height: 0; background: #FAFAF8; padding: 4mm; }
.vue svg, .mini svg { width: 100%; height: 100%; display: block; }
.serie { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; }
.serie > div { display: flex; flex-direction: column; gap: 1mm; }
.mini { height: 36mm; border: .2mm solid #eee; background: #fff; padding: 1.5mm; }
.serie small { font-size: 7pt; color: #555; overflow-wrap: anywhere; }
.droite h2 { margin: 0 0 3mm; font-size: 14pt; color: #1E2150; }
.droite h3 { margin: 4mm 0 2mm; font-size: 9.5pt; color: #1E2150; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; vertical-align: top; border-bottom: .2mm solid #ddd; padding: 1.6mm 2mm; }
th { width: 30mm; color: #555; font-weight: normal; }
.nu { display: flex; align-items: center; gap: 2mm; margin: 1mm 0; font-size: 8.5pt; }
.nu span { width: 9mm; height: 6mm; border: .2mm solid #999; display: inline-block; }
.note { margin-top: 4mm; font-size: 8pt; color: #555; }'''

SOURCE_EN = {'F1': 'Guangzhou Sulin catalogue (Apr 2026), p. 42, 50, 109', 'F2': 'Guangzhou Sulin catalogue (Apr 2026), p. 54–56',
             'F3': 'Guangzhou Sulin catalogue (Apr 2026), p. 52, or local upholsterer', 'M1': 'Mirror catalogue (Apr 2026), p. 2–5',
             'M2': 'Mirror catalogue (Apr 2026), p. 6', 'M3': 'Mirror catalogue (Apr 2026), p. 19 and 22'}

for cle, titre_en, familles in FAMILLES:
    pages = []
    for p in [q for q in PIECES if q['famille'] in familles]:
        en = p['en']
        fichiers = LISTE[p['id']]
        serie = ''.join(f'<div><div class="mini">{vignette(w, h, c)}</div><small>{html.escape(n)}</small></div>' for n, w, h, c in fichiers)
        qte = ('Model to be chosen: please quote the unit price for 1, 2 and 4 pcs' if p.get('choix') else
               f"{p['qte']} pcs (proposed, to confirm)" if p['qte'] else 'Optional (quote 2 pcs)')
        if p.get('reference'):
            serie = f'<div><div class="mini"><img src="{image_ref(p["reference"], 360)}" alt="" style="width:100%;height:100%;object-fit:contain"></div><small>Reference photo (style only)</small></div>' + serie
        lignes = [('Item', f"{p['id']} · {html.escape(p['name'])}"), ('Quantity', qte), ('Size', html.escape(p['dims_en'])),
                  ('Material', html.escape(en['material'])), ('Branding', '<b>' + html.escape(en['branding']) + '</b>'),
                  ('Care', html.escape(en['care']))]
        if p['id'] in SOURCE_EN:
            lignes.append(('Reference', SOURCE_EN[p['id']]))
        lignes.append(('Files', '<br>'.join(html.escape(n) for n, *_ in fichiers)))
        table = ''.join(f'<tr><th>{k}</th><td>{v}</td></tr>' for k, v in lignes)
        tout = p['dessin'](Atelier(False))
        pages.append(f'''<section class="page">
<header><div><b>MAISON MND</b> · {titre_en} · technical sheets · 14 October 2026</div><div class="id">{p["id"]}</div></header>
<div class="corps"><div class="gauche"><div class="vue">{vue_cotee(p)}</div><div class="serie">{serie}</div></div>
<div class="droite"><h2>{html.escape(p["name"])}</h2><table>{table}</table>
<h3>Colours (match to physical swatch or thread card; send a photo before production)</h3>{nuancier(tout)}
<p class="note">Logo artwork is supplied as outlined vectors at 1:1 scale: never redraw, re-space or distort it. Magenta hairline = frame or cut line, do not print.
The Fon letters of the motto (ɔ ɖ ɛ and the accent on ɔ́) are outlined: never retype them. Dimensions in millimetres. Please quote each item on its own line and send a proof before production.</p></div></div>
</section>''')
    page = (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Maison MND · {titre_en} · 14 Oct 2026</title><style>{CSS_FICHES}</style></head><body>'
            + DEFS + ''.join(pages) + '</body></html>')
    io.open(os.path.join(CATALOGUE, f'fiches-{cle}.html'), 'w', encoding='utf-8').write(page)


# ══ 4. LA PAGE FRANÇAISE ════════════════════════════════════════════════
CSS = '''<style>
:root { --fond:#F6F1E7; --carte:#FFFDF9; --encre:#1E2150; --texte:#2A2722; --doux:#5E5750; --filet:#E3DACB; --cuivre:#9A6036; --puce:#EFE6D6; --vert:#2F6B4F; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --fond:#15173A; --carte:#1E2150; --encre:#F6F1E7; --texte:#E9E3D7; --doux:#B9B4C9; --filet:#2E3266; --cuivre:#D6A06F; --puce:#272B6C; --vert:#8FD1AE; color-scheme: dark; } }
:root[data-theme="dark"] { --fond:#15173A; --carte:#1E2150; --encre:#F6F1E7; --texte:#E9E3D7; --doux:#B9B4C9; --filet:#2E3266; --cuivre:#D6A06F; --puce:#272B6C; --vert:#8FD1AE; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--fond); color: var(--texte); font: 300 16px/1.6 "Jost", system-ui, sans-serif; padding-block: 32px 72px; padding-inline: 16px; }
.page { max-width: 1180px; margin: 0 auto; display: grid; gap: 28px; }
.sur { font-size: 11.5px; letter-spacing: .18em; text-transform: uppercase; color: var(--cuivre); margin: 0; font-weight: 400; }
h1 { font: 300 clamp(36px, 6vw, 58px)/1.05 "Cormorant Garamond", Georgia, serif; color: var(--encre); margin: 6px 0 0; text-wrap: balance; }
.chapeau { color: var(--doux); max-width: 70ch; margin: 12px 0 0; }
nav.sommaire { display: flex; flex-wrap: wrap; gap: 8px; }
nav.sommaire a { color: var(--encre); text-decoration: none; border: 1px solid var(--filet); background: var(--carte); border-radius: 999px; padding: 4px 14px; font-size: 14px; }
.regles { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
.regle, .bloc { background: var(--carte); border: 1px solid var(--filet); border-radius: 6px; padding: 14px 16px; font-size: 14.5px; }
.regle b { display: block; font: 400 19px/1.25 "Cormorant Garamond", Georgia, serif; color: var(--encre); margin-bottom: 4px; }
h2.section { font: 400 32px/1.15 "Cormorant Garamond", Georgia, serif; color: var(--encre); margin: 18px 0 0; text-wrap: balance; scroll-margin-top: 16px; }
.section-dit { color: var(--doux); margin: -16px 0 0; max-width: 70ch; }
.grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 520px), 1fr)); gap: 18px; }
.carte { background: var(--carte); border: 1px solid var(--filet); border-radius: 6px; overflow: hidden; display: grid; grid-template-rows: auto 1fr; }
.rendu svg { display: block; width: 100%; height: auto; }
.texte { padding: 16px 18px 18px; display: grid; gap: 6px; align-content: start; }
.haut { display: flex; gap: 10px; align-items: center; margin: 0; flex-wrap: wrap; }
.code { font-weight: 500; letter-spacing: .12em; color: var(--cuivre); font-variant-numeric: tabular-nums; }
.puce { font-size: 12px; letter-spacing: .04em; border-radius: 999px; padding: 2px 10px; background: var(--puce); color: var(--encre); }
.puce.nouvelle { border: 1px solid var(--cuivre); background: transparent; color: var(--cuivre); }
.texte h3 { font: 400 24px/1.2 "Cormorant Garamond", Georgia, serif; color: var(--encre); margin: 0; text-wrap: balance; }
.lieu { margin: 0; color: var(--doux); font-size: 14px; }
dl { margin: 6px 0 0; display: grid; grid-template-columns: 118px 1fr; gap: 6px 12px; font-size: 14px; }
dt { color: var(--doux); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; padding-top: 2px; }
dd { margin: 0; }
.tableau { overflow-x: auto; background: var(--carte); border: 1px solid var(--filet); border-radius: 6px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; vertical-align: top; padding: 10px 14px; border-bottom: 1px solid var(--filet); }
th { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--doux); font-weight: 400; }
td.num { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 500; color: var(--encre); }
.tees { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); gap: 14px; }
.tee { background: var(--carte); border: 1px solid var(--filet); border-radius: 6px; padding: 10px 12px 14px; display: grid; gap: 4px; }
img.ref { width: 100%; max-width: 240px; height: auto; display: block; border-radius: 4px; border: 1px solid var(--filet); background: #fff; }
.tee img { width: 100%; height: auto; display: block; background: #EDE6DA; border-radius: 4px; }
.tee b { font: 400 20px/1.2 "Cormorant Garamond", Georgia, serif; color: var(--encre); }
.tee small { color: var(--doux); font-size: 13px; }
.formules { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 14px; }
.formule { background: var(--carte); border: 1px solid var(--filet); border-top: 3px solid var(--cuivre); border-radius: 6px; padding: 16px 18px; display: grid; gap: 8px; align-content: start; font-size: 14.5px; }
.formule h3 { margin: 0; font: 400 24px/1.2 "Cormorant Garamond", Georgia, serif; color: var(--encre); }
.formule ol, .formule ul { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
.afixer { color: var(--cuivre); font-weight: 400; }
.maquette { background: var(--carte); border: 1px dashed var(--cuivre); border-radius: 6px; padding: 16px; display: grid; gap: 12px; }
.ecran { border: 1px solid var(--filet); border-radius: 8px; padding: 12px 14px; display: grid; gap: 8px; font-size: 14px; background: var(--fond); }
.ecran .ligne { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; justify-content: space-between; }
.ecran .titre { font-weight: 500; color: var(--encre); }
.etat { font-size: 12px; border-radius: 999px; padding: 2px 10px; border: 1px solid var(--vert); color: var(--vert); }
.chiffres { display: flex; flex-wrap: wrap; gap: 10px; }
.chiffres span { background: var(--carte); border: 1px solid var(--filet); border-radius: 6px; padding: 6px 10px; font-variant-numeric: tabular-nums; }
.etape { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; border-top: 1px solid var(--filet); cursor: pointer; }
.etape input { accent-color: var(--cuivre); width: 18px; height: 18px; margin: 3px 0 0; flex: none; }
.etape:has(input:checked) span { color: var(--doux); text-decoration: line-through; }
code { font: 400 13px ui-monospace, Consolas, monospace; background: var(--puce); padding: 1px 6px; border-radius: 3px; overflow-wrap: anywhere; }
@media (max-width: 520px) { dl { grid-template-columns: 1fr; gap: 2px; } dt { padding-top: 6px; } }
@page { size: A4 landscape; margin: 10mm; }
@media print { body { padding: 0; font-size: 12px; } .carte, .regle, .formule, .tee, .maquette, .bloc { break-inside: avoid; }
  .grille { grid-template-columns: 1fr; gap: 8px; } .carte { grid-template-columns: 40% 1fr; grid-template-rows: none; align-items: center; }
  .texte { padding: 8px 12px; gap: 3px; } .texte h3 { font-size: 18px; } .lieu { font-size: 11px; }
  dl { grid-template-columns: 80px 1fr; font-size: 10.5px; gap: 2px 8px; margin-top: 2px; } dt { font-size: 9px; }
  h2.section { break-before: page; margin-top: 0; } nav.sommaire { display: none; } .tees { grid-template-columns: repeat(4, 1fr); } }
</style>'''

ESC = html.escape


def carte(p):
    fr = p['fr']
    qte = f"{p['qte']} · {ESC(p['qte_fr'])}" if p['qte'] else ESC(p['qte_fr'])
    ref = (f'<dt>Référence</dt><dd><img class="ref" src="{image_ref(p["reference"], 420)}" alt="La photo envoyée pour {ESC(p["nom"])}" loading="lazy"></dd>'
           if p.get('reference') else '')
    rangs = [('Taille', ESC(p['dims_fr'])), ('Matière', ESC(fr['matiere'])), ('Marquage', ESC(fr['marquage'])),
             ('Entretien', ESC(fr['entretien'])), ('Quantité', qte), ('Où', ESC(p['source_fr'])), ('Pourquoi', ESC(fr['pourquoi']))]
    dl = ref + ''.join(f'<dt>{k}</dt><dd>{v}</dd>' for k, v in rangs)
    fichiers = len(LISTE[p['id']])
    return (f'<article class="carte" id="{p["id"]}"><div class="rendu">{rendu(p)}</div><div class="texte">'
            f'<p class="haut"><span class="code">{p["id"]}</span><span class="puce">{fichiers} fichier{"s" if fichiers > 1 else ""} 1:1</span></p>'
            f'<h3>{ESC(p["nom"])}</h3><p class="lieu">{ESC(p["name"])}</p><dl>{dl}</dl></div></article>')


SECTIONS = [('tabliers', 'Les tabliers', 'Tabliers', 'La toile indigo pour l’équipe, l’enduit pour les couleurs, l’ivoire pour l’accueil.'),
            ('linge', 'Le linge et la cape', 'Linge', 'Tout ce qui touche l’eau est indigo : ni l’eau colorée ni les teintures végétales n’y marquent.'),
            ('fauteuils', 'Les fauteuils', 'Fauteuils', 'Les modèles de base viennent du catalogue Sulin d’avril, déjà dans le Drive. On change la couleur, l’embase et le marquage.'),
            ('miroirs', 'Les miroirs', 'Miroirs', 'L’arche des miroirs du catalogue est celle du pictogramme. La devise y est sablée : la cliente la lit dans son reflet.'),
            ('bacs2', 'Les bacs, série 2', 'Bacs, série 2', 'Les quatre bacs des photos envoyées, aux couleurs de la Maison. Sur chacun, le motif gaufré sur le flanc et le nom brodé au pied.'),
            ('fauteuils2', 'Les fauteuils, série 2', 'Fauteuils, série 2', 'Les cinq fauteuils des photos envoyées. Le motif au dos du dossier, le nom au dos de l’appui-tête : rien d’écrit ne fait face au miroir.')]


def image_tee(ident):
    chemin = os.path.join(VESTIAIRE, f'{ident}-devant.png')
    im = Image.open(chemin).convert('RGBA')
    im.thumbnail((520, 520))
    tampon = io.BytesIO()
    im.save(tampon, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(tampon.getvalue()).decode()


TEES = [('02', 'L’Allover', 'Les arches en semis, sans message.', False),
        ('12', 'La Devise', '« mi nyɔ́ ɖɛkpɛ », votre beauté est déjà là.', False),
        ('18', 'Je prends le temps.', 'Pour les longues séances.', True),
        ('19', 'Mes racines respirent.', 'SÍNSIN et KLƆKLƆ, les racines au propre.', True),
        ('20', 'Ma couronne pousse.', 'VÍVÍVÓ, et l’écho de Ma Couronne.', True),
        ('21', 'KLƆKLƆ, lavage rituel en cours', 'Le t-shirt qui dit ce qui se passe.', True),
        ('22', 'Ma beauté est déjà là.', 'La devise, dite par celle qui la porte.', True)]
MODELES = len(TEES)
STOCK = -(-int(CLIENTES_JOUR * ROTATION * 1.2) // MODELES) * MODELES
PAR_MODELE = STOCK // MODELES
TAILLES = [('S', .15), ('M', .30), ('L', .30), ('XL', .15), ('XXL', .10)]
REPARTITION = [(t, round(STOCK * f)) for t, f in TAILLES]
REPARTITION[1] = ('M', REPARTITION[1][1] + STOCK - sum(n for _, n in REPARTITION))

tees = ''.join(f'<figure class="tee" style="margin:0"><img src="{image_tee(i)}" alt="T-shirt {ESC(n)}" width="520" height="444" loading="lazy">'
               f'<figcaption><span class="code">{i}</span> <span class="puce{" nouvelle" if neuf else ""}">{"nouveau, à valider" if neuf else "déjà dessiné"}</span><br>'
               f'<b>{ESC(n)}</b><br><small>{ESC(d)}</small></figcaption></figure>' for i, n, d, neuf in TEES)

hyp = ''.join(f'<tr><td>{ESC(n)}</td><td class="num">{v}</td><td>{ESC(c)}</td></tr>' for n, v, c in HYPOTHESES)
rep = ' · '.join(f'{t} {n}' for t, n in REPARTITION)
corps_sections = ''.join(
    f'<h2 class="section" id="{ancre}">{titre}</h2><p class="section-dit">{dit}</p>'
    f'<div class="grille">{"".join(carte(p) for p in PIECES if p["famille"] == fam)}</div>' for ancre, titre, fam, dit in SECTIONS)

PROGRAMME = f'''<h2 class="section" id="tenues">Les tenues de séance</h2>
<p class="section-dit">Pendant le lavage, la cliente se change dans une tenue de la Maison. Sept modèles, tous sur fond indigo : l’eau et les teintures n’y marquent pas. L’Atelier (05) reste la tenue de l’équipe : on ne prête jamais à une cliente ce que porte un maître.</p>
<div class="tees">{tees}</div>
<div class="regles">
<div class="regle"><b>Le tissu du stock de séance</b>Polyester toucher coton 160 g, imprimé en sublimation : il sèche vite, tient 60 °C et ne rétrécit pas. Le coton reste pour les t-shirts vendus.</div>
<div class="regle"><b>{STOCK} t-shirts pour commencer</b>{PAR_MODELE} par modèle. {CLIENTES_JOUR} clientes par jour sur {ROTATION} jours (servi, au lavage, en réserve), plus 20 %. Tailles : {rep}.</div>
<div class="regle"><b>Dans le miroir</b>Le message se lit à l’envers dans le miroir : il est fait pour les photos et pour les autres. La cape, elle, ne porte que l’arche, qui se lit pareil des deux côtés.</div>
<div class="regle"><b>Les fichiers sont prêts</b>Bons à tirer et fichiers 300 dpi des modèles 18 à 22 dans le Drive, « 04 · Vestiaire et MND 229 › impression ».</div>
</div>
<h2 class="section" id="pret">Le prêt des tenues</h2>
<p class="section-dit">Trois façons de faire vivre les tenues, de la plus simple à la plus engageante. Les prix et la caution sont à fixer par la Maison.</p>
<div class="formules">
<section class="formule"><p class="sur">Pour toutes, à chaque lavage</p><h3>La tenue de séance</h3>
<ol><li>À l’arrivée, la cliente choisit son message en cabine.</li><li>Elle la porte pendant le lavage et le soin.</li><li>Avant de partir, elle la dépose dans le panier « tenues portées ».</li><li>Le soir : lavage à 60 °C sans chlore, séchage à l’ombre, pliage en rayon.</li></ol>
<p>Chaque t-shirt porte une étiquette tissée numérotée (modèle, taille, numéro). Il ne repart jamais sans lavage, et il sort du stock à 50 lavages ou à la première tache.</p><p><b>Gratuit</b> : c’est l’accueil de la Maison.</p></section>
<section class="formule"><p class="sur">Quand elle l’aime</p><h3>Je la garde</h3>
<ul><li>Elle repart avec un t-shirt NEUF du même message, plié dans sa pochette, jamais celui qu’elle a porté.</li><li>Il passe à la caisse comme un produit « Maison MND ».</li><li>Le t-shirt vendu est en coton ; le stock de séance reste en polyester.</li></ul>
<p>Prix : <span class="afixer">à fixer</span>.</p></section>
<section class="formule"><p class="sur">Après une création ou une restauration</p><h3>La tenue des photos</h3>
<ul><li>Après un VÈKPÈ ou un FÍNFÍN, la cliente emprunte une tenue du vestiaire (Maison, MND 229, saison) pour ses photos.</li><li>48 heures, contre une caution rendue au retour.</li><li>Lavée avant et après chaque prêt.</li></ul>
<p>Location et caution : <span class="afixer">à fixer</span>. Gratuite pour les formules, si la Maison le décide.</p></section>
</div>
<div class="bloc"><b>À décider, sans rien toucher d’ici là :</b> offrir sa tenue à une cliente à un moment fort, par exemple la Graine de « De main en main » à la cinquième visite. Le programme en cours ne change pas tant que la Maison ne l’a pas décidé.</div>
<h2 class="section" id="trone">Dans le Trône</h2>
<p class="section-dit">Une maquette, rien n’est construit. Elle se valide avant toute construction.</p>
<div class="maquette">
<div class="ecran"><div class="ligne"><span class="titre">Rendez-vous de 10 h 30 · Cliente exemple · mercredi 14 octobre 2026</span><span class="puce">KLƆKLƆ · lavage rituel</span></div>
<div class="ligne"><span>Tenue de séance : <b>n° 18-M-07</b> · Je prends le temps · taille M</span><span class="etat">Rendue</span></div></div>
<div class="ecran"><div class="ligne"><span class="titre">Vestiaire · aujourd’hui</span><span class="puce">{STOCK} t-shirts de séance</span></div>
<div class="chiffres"><span>En rayon : {STOCK - 12}</span><span>Portés : 6</span><span>Au lavage : 4</span><span>Retirés : 2</span></div>
<div class="ligne"><span>Tenue des photos : <b>B05 Kwabɔ</b> · Cliente exemple · retour vendredi 16 octobre 2026</span><span class="puce">caution reçue</span></div></div>
</div>
<h2 class="section" id="envoi">Ce qui part chez les fabricants</h2>
<div class="bloc"><ol style="margin:0;padding-left:20px;display:grid;gap:6px">
<li>Tabliers, cape et linge : la fiche « Aprons, cape and towels » (7 pages) et ses fichiers A1 à S3.</li>
<li>Fauteuils : la fiche « Chairs and shampoo units » (5 pages), à Guangzhou Sulin, et ses fichiers F1 à F5.</li>
<li>Miroirs : la fiche « Mirrors » (4 pages), au fournisseur du catalogue des miroirs, et ses fichiers M1 à M4.</li>
<li>Série 2 : la fiche « Shampoo units and salon chairs, series 2 » (9 pages) et ses trois fichiers, aux fabricants retenus ci-dessus.</li>
<li>Avec chaque fiche, la demande de devis en anglais, déjà écrite.</li></ol>
<p style="margin:10px 0 0">Tout est rangé dans le Drive : <code>Maison MND › 09 · Achats et fournisseurs › Tabliers, linge, fauteuils et miroirs · 14-10-2026</code>.</p></div>
'''

from fabricants import section_html
FABRICANTS = section_html()

ETAPES = [
    'Corriger les quatre hypothèses (postes, bacs, maîtres, clientes par jour) : les quantités en découlent.',
    'Valider les messages des t-shirts 18 à 22, ou en proposer d’autres.',
    'Fixer le prix de « Je la garde », la location et la caution de « La tenue des photos ».',
    'Envoyer la fiche textile et ses fichiers à un fabricant de tabliers et de linge, avec la demande de devis.',
    'Envoyer la fiche fauteuils à Guangzhou Sulin, avec la demande de devis.',
    'Envoyer la fiche miroirs au fournisseur du catalogue des miroirs, avec la demande de devis.',
    'Choisir les modèles de la série 2 (bacs et fauteuils), puis envoyer leur fiche aux fabricants retenus.',
    'Demander les échantillons : fil cuivre, simili indigo, plaqué or rose, carré de verre sablé rétroéclairé, et un carré de cuir gaufré au motif.',
    'Valider chaque épreuve avant de payer le solde.',
    'Valider la maquette du Trône avant qu’on construise le vestiaire.',
]
MARCHE = ('<h2 class="section" id="marche">La marche à suivre</h2><div class="bloc">'
          + ''.join(f'<label class="etape"><input type="checkbox" data-k="e{i + 1}"><span>{ESC(t)}</span></label>' for i, t in enumerate(ETAPES))
          + '</div><script>(function () { var CLE = "equipement-mnd-marche"; var etat = {};'
          + ' try { etat = JSON.parse(localStorage.getItem(CLE) || "{}") || {}; } catch (e) { etat = {}; }'
          + ' document.querySelectorAll(".etape input").forEach(function (c) { c.checked = !!etat[c.dataset.k];'
          + ' c.addEventListener("change", function () { etat[c.dataset.k] = c.checked;'
          + ' try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch (e) {} }); }); })();</script>')

ENTETE = f'''<header><p class="sur">Maison MND · Équipement · 14 octobre 2026</p>
<h1>Tabliers, linge, fauteuils et miroirs</h1>
<p class="chapeau">{len(PIECES)} pièces aux couleurs de la Maison, chacune avec son rendu, son cahier des charges en anglais pour le fabricant et ses fichiers à l’échelle 1:1 : seize d’abord, puis la série 2, les neuf bacs et fauteuils des photos envoyées. Ensuite les tenues que les clientes portent pendant le lavage, la façon de les prêter, et les fabricants en Chine.</p></header>
<nav class="sommaire" aria-label="Sommaire">{"".join(f'<a href="#{a}">{t}</a>' for a, t, *_ in SECTIONS)}<a href="#tenues">Les tenues de séance</a><a href="#pret">Le prêt</a><a href="#fabricants">Les fabricants en Chine</a><a href="#marche">La marche à suivre</a></nav>
<section class="regles" aria-label="Les règles appliquées">
<div class="regle"><b>L’indigo là où passe l’eau</b>Tabliers, capes, serviettes : ni l’eau colorée ni les teintures végétales n’y marquent. Jamais de noir.</div>
<div class="regle"><b>Le cuivre en fil, en métal, en gravure</b>Broderies, embases, cadres et gravures prennent le cuivre #B97A4A, à faire valider sur échantillon.</div>
<div class="regle"><b>Le pictogramme seul face au miroir</b>Il est symétrique et se lit pareil dans un reflet. Le verrou s’y lirait à l’envers : il reste au dos, ou sur ce qu’on regarde en face.</div>
<div class="regle"><b>Les seuils de la broderie</b>Une lettre brodée demande 5 mm. Le verrou debout se brode donc à 70 mm de large au moins, le couché à 130 mm. En dessous, le pictogramme seul.</div>
</section>
<div class="tableau"><table><thead><tr><th>Hypothèse</th><th>Valeur</th><th>Note</th></tr></thead><tbody>{hyp}</tbody></table></div>
<p class="section-dit" style="margin:-16px 0 0">Les quantités proposées se calculent sur ces quatre chiffres. Le linge tourne sur {ROTATION} jours : servi, au lavage, en réserve.</p>'''

PAGE = ('<title>Équipement de la Maison</title>\n'
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Jost:wght@300;400;500&display=swap">\n'
        + CSS + DEFS + '<div class="page">' + ENTETE + corps_sections + PROGRAMME + FABRICANTS + MARCHE + '</div>')
PAGE = lie_les_unites(PAGE)
io.open(os.path.join(CATALOGUE, 'catalogue.html'), 'w', encoding='utf-8').write(PAGE)
print('ok :', sum(len(v) for v in LISTE.values()), 'fichiers 1:1,', len(PIECES), 'pièces,', MODELES, 't-shirts de séance,', STOCK, 'en stock ; page', len(PAGE.encode('utf-8')) // 1024, 'Ko')
