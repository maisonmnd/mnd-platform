# -*- coding: utf-8 -*-
"""LA SIGNALÉTIQUE DE LA MAISON MND, FABRIQUÉE, 13 octobre 2026.

    python scripts/signaletique/fabrique.py <dossier de sortie> <dossier du catalogue>

Écrit, pour chaque enseigne d'enseignes.py :
  · le fichier vectoriel 1:1 en millimètres pour le fabricant (SVG : le
    dessin aux couleurs pleines, et le trait de découpe sur sa couche) ;
  · la fiche technique en anglais (une page A3 par enseigne, dans un seul
    HTML qu'on imprime en PDF) ;
  · le rendu du catalogue en français (une page HTML, publiée en artefact).
"""
import html
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from formes import ENCRES, cmjn, logo, rvb  # noqa: E402
from enseignes import ENSEIGNES, Atelier, plaque_atelier, ATELIERS, C, I, S, V  # noqa: E402

SORTIE = sys.argv[1]
CATALOGUE = sys.argv[2]
os.makedirs(os.path.join(SORTIE, 'SVG 1-1'), exist_ok=True)
os.makedirs(CATALOGUE, exist_ok=True)

from communs import (NOMS_ENCRES, NOMS_EN, NOMS_FR, variantes, decoupe, encres_de, lie_les_unites,  # noqa: E402
                     vue_cotee, vue_cote, nuancier, interieur_ou_ext)

# ══ 1. LES FICHIERS DU FABRICANT ═══════════════════════════════════════
def svg_fabricant(e, ident, dessin):
    corps = dessin(Atelier(False))
    w, h = e['w'], e['h']
    titre = html.escape(f"Maison MND · {ident} · {e['name']} · {w} × {h} mm · scale 1:1 · {'22 Oct 2026' if e.get('statut') == 'option' or e['id'] in ('N10', 'N11') else '13 Oct 2026'}")
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}mm" height="{h}mm" viewBox="0 0 {w} {h}">\n'
            f'<title>{titre}</title>\n'
            f'<desc>All text converted to outlines. Colours: {", ".join(f"{NOMS_EN[n]} {ENCRES[n]}" for n in encres_de(corps))}. '
            f'Magenta hairline = cut line.</desc>\n'
            f'<g id="artwork">{corps}</g>\n'
            f'<g id="cut-line" fill="none" stroke="#EC008C" stroke-width="0.3">{decoupe(e)}</g>\n</svg>\n')


from options import OPTIONS  # noqa: E402

fichiers = {}
# Les options à motifs ont aussi leur fichier 1:1 ; elles n'entrent pas au catalogue ni aux fiches de 2026-10-13.
for e in ENSEIGNES + OPTIONS:
    for ident, dessin in variantes(e):
        nom = f"{ident} · {e['name']} · {e['w']}x{e['h']} mm.svg".replace('/', '-').replace('“', '').replace('”', '')
        io.open(os.path.join(SORTIE, 'SVG 1-1', nom), 'w', encoding='utf-8').write(svg_fabricant(e, ident, dessin))
        fichiers.setdefault(e['id'], []).append(nom)

# ══ 2. LES RENDUS ═══════════════════════════════════════════════════════
SYMBOLES = []
for nom in ('verrou-debout', 'verrou-couche', 'pictogramme'):
    corps, w, h = logo(nom)
    SYMBOLES.append(f'<symbol id="lg-{nom}" viewBox="0 0 {w} {h}">{corps}</symbol>')
DEFS_PARTAGES = (
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
    + ''.join(SYMBOLES)
    + '<linearGradient id="cuivre-metal" x1="0" y1="0" x2="1" y2="1">'
      '<stop offset="0" stop-color="#E2AC7C"/><stop offset=".35" stop-color="#B97A4A"/>'
      '<stop offset=".6" stop-color="#8E5A33"/><stop offset=".85" stop-color="#C98D5B"/><stop offset="1" stop-color="#A86B3E"/></linearGradient>'
    + '<linearGradient id="verre" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A2E3F" stop-opacity=".92"/>'
      '<stop offset=".55" stop-color="#3A3A3E" stop-opacity=".85"/><stop offset="1" stop-color="#1F2230" stop-opacity=".95"/></linearGradient>'
    + '</defs></svg>')

SCENES = {
    'mur': ('#EFE7D9', '#E2D7C4'), 'interieur': ('#ECE3D4', '#DCCFBB'), 'facade': ('#3A3D57', '#25283F'),
    'rue': ('#DCD5C8', '#CFC6B6'), 'nuit': ('#1C1E33', '#121426'), 'verre': ('#E8E1D3', '#D8CCB8'), 'planche': ('#E6DECF', '#D6CAB5'),
}


def rendu(e, ident, dessin):
    a = Atelier(True)
    corps = dessin(a)
    w, h = e['w'], e['h']
    p = ident.replace('·', '').replace(' ', '')
    haut, bas = SCENES[e['scene']]
    LW, LH = 1600, 1000
    zone_w, zone_h = (1000, 760) if e['effet'] in ('drapeau', 'drapeau-carre', 'potence') else (1240, 780)
    s = min(zone_w / w, zone_h / h)
    ox = (LW - w * s) / 2 + (110 if e['effet'] in ('drapeau', 'drapeau-carre', 'potence') else 0)
    oy = (LH - h * s) / 2 + (40 if e['effet'] == 'potence' else 0)
    flou = max(w, h) * 0.018
    m = max(w, h)
    defs = [f'<g id="{p}-c">{corps}</g>',
            f'<linearGradient id="{p}-fond" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{haut}"/><stop offset="1" stop-color="{bas}"/></linearGradient>',
            f'<radialGradient id="{p}-vign" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>',
            f'<filter id="{p}-halo" x="-30%" y="-30%" width="160%" height="160%"><feFlood flood-color="#FFC27A"/><feComposite in2="SourceAlpha" operator="in"/>'
            f'<feGaussianBlur stdDeviation="{flou:.2f}"/><feComponentTransfer><feFuncA type="linear" slope="2.4"/></feComponentTransfer></filter>',
            f'<filter id="{p}-retour" x="-5%" y="-5%" width="110%" height="110%"><feFlood flood-color="#5E3A20"/><feComposite in2="SourceAlpha" operator="in"/>'
            f'<feOffset dx="{m * 0.0035:.2f}" dy="{m * 0.0045:.2f}"/></filter>',
            f'<filter id="{p}-ombre" x="-20%" y="-20%" width="140%" height="140%"><feFlood flood-color="#1A1408" flood-opacity=".38"/><feComposite in2="SourceAlpha" operator="in"/>'
            f'<feGaussianBlur stdDeviation="{m * 0.012:.2f}"/><feOffset dx="{m * 0.008:.2f}" dy="{m * 0.014:.2f}"/></filter>',
            f'<filter id="{p}-neon" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur in="SourceGraphic" stdDeviation="{m * 0.006:.2f}" result="a"/>'
            f'<feGaussianBlur in="SourceGraphic" stdDeviation="{m * 0.022:.2f}" result="b"/><feFlood flood-color="#FFB45C" flood-opacity=".95"/><feComposite in2="b" operator="in" result="c"/>'
            f'<feMerge><feMergeNode in="c"/><feMergeNode in="c"/><feMergeNode in="a"/><feMergeNode in="SourceGraphic"/></feMerge></filter>']
    use = f'<use href="#{p}-c"'
    eff = e['effet']
    couches = []
    contour_lum = ''
    if e['forme'] == 'rond':
        contour_lum = f'<circle cx="{w / 2}" cy="{h / 2}" r="{w / 2}" fill="#FFD9A0"/>'
    else:
        contour_lum = f'<rect width="{w}" height="{h}" fill="#FFD9A0"/>'
    if eff in ('relief', 'chiffres'):
        couches += [f'{use} filter="url(#{p}-ombre)"/>', f'{use} filter="url(#{p}-retour)"/>', f'{use}/>']
    elif eff == 'halo':
        couches += [f'{use} filter="url(#{p}-halo)" opacity=".95"/>', f'{use} filter="url(#{p}-retour)"/>', f'{use}/>']
    elif eff in ('plaque', 'plat', 'plat-relief'):
        couches += [f'{use} filter="url(#{p}-ombre)"/>', f'{use}/>']
    elif eff in ('caisson', 'caisson-plaque', 'cadre-lumineux', 'drapeau', 'drapeau-carre'):
        couches += [f'<g filter="url(#{p}-halo)" opacity=".7">{contour_lum}</g>', f'{use} filter="url(#{p}-ombre)"/>', f'{use}/>',
                    f'<g opacity=".18" style="mix-blend-mode:screen">{contour_lum.replace("#FFD9A0", "url(#" + p + "-eclat)")}</g>']
        defs.append(f'<radialGradient id="{p}-eclat" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>')
    elif eff == 'halo-panneau':
        couches += [f'{use} filter="url(#{p}-ombre)"/>', f'{use}/>']
    elif eff == 'neon':
        couches += [f'{use} filter="url(#{p}-neon)"/>']
    elif eff == 'potence':
        couches += [f'{use} filter="url(#{p}-ombre)"/>', f'{use}/>']
    elif eff == 'vitre':
        couches += [f'{use}/>']
    else:
        couches += [f'{use}/>']
    autour = []
    # Le mur et la potence des enseignes en drapeau.
    if eff in ('drapeau', 'drapeau-carre', 'potence'):
        mur_x = ox - 230
        autour.append(f'<rect x="{mur_x - 400}" y="0" width="400" height="{LH}" fill="#E7DFD1"/><rect x="{mur_x - 6}" y="0" width="6" height="{LH}" fill="#000" opacity=".12"/>')
        bras_y = oy - (60 if eff == 'potence' else -h * s / 2)
        if eff == 'potence':
            autour.append(f'<rect x="{mur_x}" y="{bras_y - 10}" width="{w * s + 260}" height="14" rx="5" fill="{I}"/>'
                          f'<rect x="{mur_x - 18}" y="{bras_y - 70}" width="18" height="160" rx="4" fill="{I}"/>'
                          f'<circle cx="{mur_x + w * s + 262}" cy="{bras_y - 3}" r="10" fill="{C}"/>'
                          f'<rect x="{ox + w * s * 0.28}" y="{bras_y}" width="5" height="{oy - bras_y + 8}" fill="{I}"/>'
                          f'<rect x="{ox + w * s * 0.72 - 5}" y="{bras_y}" width="5" height="{oy - bras_y + 8}" fill="{I}"/>')
        else:
            autour.append(f'<rect x="{mur_x}" y="{bras_y - 9}" width="{ox - mur_x + 4}" height="18" rx="9" fill="{"#B97A4A" if eff == "drapeau-carre" else "#B9BCC4"}" stroke="#5B5F73" stroke-width="1.5"/>'
                          f'<rect x="{mur_x - 10}" y="{bras_y - 60}" width="14" height="120" rx="3" fill="#9EA2AE" stroke="#5B5F73" stroke-width="1.5"/>')
    if eff == 'plat-relief':
        autour.append(f'<rect x="0" y="{oy + h * s}" width="{LW}" height="{LH}" fill="#2D2B33" opacity=".85"/>'
                      f'<rect x="0" y="{oy + h * s + 30}" width="{LW}" height="{LH}" fill="url(#{p}-vitrine)"/>')
        defs.append(f'<linearGradient id="{p}-vitrine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A4B57"/><stop offset="1" stop-color="#1D1E28"/></linearGradient>')
    if eff == 'vitre':
        autour.append(f'<rect x="{ox - 26}" y="{oy - 26}" width="{w * s + 52}" height="{h * s + 52}" rx="4" fill="#2E2F38"/>')
    fond = (f'<rect width="{LW}" height="{LH}" fill="url(#{p}-fond)"/>' + ''.join(autour))
    signe = f'<g transform="translate({ox:.2f} {oy:.2f}) scale({s:.5f})">{"".join(couches)}</g>'
    if eff == 'vitre':
        signe = f'<g transform="translate({ox:.2f} {oy:.2f}) scale({s:.5f})">{"".join(couches)}</g>'
    return (f'<svg viewBox="0 0 {LW} {LH}" role="img" aria-label="{html.escape(e["nom"])}">'
            f'<defs>{"".join(defs)}</defs>{fond}{signe}<rect width="{LW}" height="{LH}" fill="url(#{p}-vign)"/></svg>')


# ══ 3. LES FICHES TECHNIQUES (EN) ═══════════════════════════════════════
# (vue_cotee, vue_cote, nuancier, interieur_ou_ext : dans communs.py)

pages = []
for e in ENSEIGNES:
    var = variantes(e)
    ident0, dessin0 = var[0]
    corps0 = dessin0(Atelier(False))
    autres = ''
    if len(var) > 1:
        autres = '<div class="serie">' + ''.join(f'<div><div class="mini">{vue_cotee(e, d, 70, 46)}</div><small>{html.escape(i)}</small></div>' for i, d in var) + '</div>'
    en = e['en']
    prix = f"USD {e['prix']} (PI FINALE)" if e.get('prix') else 'To be quoted'
    lignes = [
        ('Item', f"{e['id']} · {html.escape(e['name'])}"),
        ('Order line', html.escape(e.get('pi', 'NEW ITEM')).replace('ligne', 'line').replace('épreuve', 'proof')),
        ('Quantity', str(e['qte'] if e.get('qte') else 1) + (' sheets' if e['id'] == 'R9' else ' set(s)')),
        ('Overall size', (f"Ø {e['w']} mm" if e['forme'] == 'rond' else f"{e['w']} × {e['h']} mm") + (f" × depth {e['prof']} mm" if e['prof'] else '')),
        ('Construction', html.escape(en['construction'])),
        ('Finish', html.escape(en['finish'])),
        ('Lighting', html.escape(en['lighting'])),
        ('Use', interieur_ou_ext(e)),
        ('Changes', '<b>' + html.escape(en['change']) + '</b>'),
        ('Price reference', prix),
        ('Files', '<br>'.join(html.escape(f) for f in fichiers[e['id']])),
    ]
    table = ''.join(f'<tr><th>{k}</th><td>{v}</td></tr>' for k, v in lignes)
    pages.append(f'''<section class="page">
<header><div><b>MAISON MND</b> · Signage revision for Shenzhen Lico Sign · 13 October 2026</div><div class="id">{e["id"]}</div></header>
<div class="corps"><div class="gauche"><div class="vue{' courte' if autres else ''}">{vue_cotee(e, dessin0)}</div>{autres}</div>
<div class="droite"><h2>{html.escape(e["name"])}</h2><table>{table}</table><h3>Colours (match to physical swatch, send photo before production)</h3>{nuancier(e, corps0)}
{('<h3>Side view</h3>' + vue_cote(e)) if e['prof'] else ''}<p class="note">All lettering is converted to outlines in the SVG files. Logo artwork must not be redrawn or distorted. Magenta hairline = cut line. Dimensions in millimetres.</p></div></div>
</section>''')

FICHES = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Maison MND · Signage technical sheets · 13 Oct 2026</title>
<style>
@page { size: A3 landscape; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font: 9.5pt/1.4 Arial, Helvetica, sans-serif; color: #222; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 420mm; height: 297mm; padding: 12mm 14mm; page-break-after: always; display: flex; flex-direction: column; gap: 6mm; }
header { display: flex; justify-content: space-between; align-items: center; background: #1E2150; color: #F6F1E7; padding: 4mm 6mm; font-size: 10pt; letter-spacing: .04em; }
header .id { font-size: 20pt; font-weight: bold; color: #E2AC7C; }
.corps { flex: 1; display: grid; grid-template-columns: 255mm 1fr; gap: 8mm; min-height: 0; }
.gauche { display: flex; flex-direction: column; gap: 5mm; }
.vue { border: .3mm solid #ddd; height: 230mm; background: #FAFAF8; padding: 4mm; }
.vue.courte { height: 178mm; }
.vue svg, .mini svg { width: 100%; height: 100%; display: block; }
.serie { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3mm; }
.serie > div { display: flex; flex-direction: column; align-items: center; gap: 1mm; }
.mini { width: 100%; height: 34mm; border: .2mm solid #eee; background: #FAFAF8; }
.serie small { font-size: 7pt; color: #555; }
.droite h2 { margin: 0 0 3mm; font-size: 14pt; color: #1E2150; }
.droite h3 { margin: 4mm 0 2mm; font-size: 9.5pt; color: #1E2150; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; vertical-align: top; border-bottom: .2mm solid #ddd; padding: 1.6mm 2mm; }
th { width: 32mm; color: #555; font-weight: normal; }
.nu { display: flex; align-items: center; gap: 2mm; margin: 1mm 0; font-size: 8.5pt; }
.nu span { width: 9mm; height: 6mm; border: .2mm solid #999; display: inline-block; }
.note { margin-top: 4mm; font-size: 8pt; color: #555; }
</style></head><body>''' + ''.join(pages) + '</body></html>'
io.open(os.path.join(CATALOGUE, 'fiches-techniques.html'), 'w', encoding='utf-8').write(FICHES)

# ══ 4. LE CATALOGUE (FR) ════════════════════════════════════════════════
cartes = []
for e in ENSEIGNES:
    ident0, dessin0 = variantes(e)[0]
    fr = e['fr']
    corps0 = dessin0(Atelier(False))
    taille = ((f"Ø {e['w'] / 10:g} cm" if e['forme'] == 'rond' else f"{e['w'] / 10:g} × {e['h'] / 10:g} cm") + (f" · épaisseur {e['prof']} mm" if e['prof'] else '')).replace('.', ',')
    prix = f"{e['prix']} USD (PI FINALE)" if e.get('prix') else 'à chiffrer par Lico Sign'
    statut = 'Commandée · à réviser' if e['statut'] == 'commande' else 'Nouvelle'
    qte = e.get('qte') or 1
    q = f"{qte} feuilles" if e['id'] == 'R9' else f"{qte} pièce{'s' if qte > 1 else ''}"
    encres = ' · '.join(NOMS_FR[n] for n in encres_de(corps0))
    cartes.append(f'''<article class="carte" id="{e["id"]}">
<div class="rendu">{rendu(e, ident0, dessin0)}</div>
<div class="texte"><p class="haut"><span class="code">{e["id"]}</span><span class="statut {e["statut"]}">{statut}</span></p>
<h2>{html.escape(e["nom"])}</h2><p class="lieu">{html.escape(e["lieu"])} · {taille} · {q}</p>
<dl><dt>Fabrication</dt><dd>{html.escape(fr["construction"])}</dd><dt>Finition</dt><dd>{html.escape(fr["finition"])}</dd>
<dt>Lumière</dt><dd>{html.escape(fr["lumiere"])}</dd><dt>{"Ce qui change" if e["statut"] == "commande" else "Pourquoi"}</dt><dd>{html.escape(fr["change"])}</dd>
<dt>Encres</dt><dd>{encres}</dd><dt>Prix</dt><dd>{prix}</dd></dl></div></article>''')

io.open(os.path.join(CATALOGUE, 'cartes.html'), 'w', encoding='utf-8').write(DEFS_PARTAGES + '\n'.join(cartes))
print('ok :', sum(len(v) for v in fichiers.values()), 'fichiers SVG,', len(pages), 'fiches,', len(cartes), 'cartes')

# ══ 5. LA PAGE DU CATALOGUE (FR) ════════════════════════════════════════
CSS = '''<style>
:root { --fond:#F6F1E7; --carte:#FFFDF9; --encre:#1E2150; --texte:#2A2722; --doux:#5E5750; --filet:#E3DACB; --cuivre:#9A6036; --puce:#EFE6D6; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --fond:#15173A; --carte:#1E2150; --encre:#F6F1E7; --texte:#E9E3D7; --doux:#B9B4C9; --filet:#2E3266; --cuivre:#D6A06F; --puce:#272B6C; color-scheme: dark; } }
:root[data-theme="dark"] { --fond:#15173A; --carte:#1E2150; --encre:#F6F1E7; --texte:#E9E3D7; --doux:#B9B4C9; --filet:#2E3266; --cuivre:#D6A06F; --puce:#272B6C; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--fond); color: var(--texte); font: 300 16px/1.6 "Jost", system-ui, sans-serif; padding-block: 32px 72px; padding-inline: 16px; }
.page { max-width: 1180px; margin: 0 auto; display: grid; gap: 28px; }
.sur { font-size: 11.5px; letter-spacing: .18em; text-transform: uppercase; color: var(--cuivre); margin: 0; font-weight: 400; }
h1 { font: 300 clamp(36px, 6vw, 58px)/1.05 "Cormorant Garamond", Georgia, serif; color: var(--encre); margin: 6px 0 0; text-wrap: balance; }
.chapeau { color: var(--doux); max-width: 70ch; margin: 12px 0 0; }
.regles { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
.regle { background: var(--carte); border: 1px solid var(--filet); border-radius: 6px; padding: 14px 16px; font-size: 14.5px; }
.regle b { display: block; font: 400 19px/1.25 "Cormorant Garamond", Georgia, serif; color: var(--encre); margin-bottom: 4px; }
h2.section { font: 400 30px/1.15 "Cormorant Garamond", Georgia, serif; color: var(--encre); margin: 12px 0 0; text-wrap: balance; }
.section-dit { color: var(--doux); margin: -16px 0 0; max-width: 70ch; }
.grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 520px), 1fr)); gap: 18px; }
.carte { background: var(--carte); border: 1px solid var(--filet); border-radius: 6px; overflow: hidden; display: grid; grid-template-rows: auto 1fr; }
.rendu svg { display: block; width: 100%; height: auto; }
.texte { padding: 16px 18px 18px; display: grid; gap: 6px; align-content: start; }
.haut { display: flex; gap: 10px; align-items: center; margin: 0; }
.code { font-weight: 500; letter-spacing: .12em; color: var(--cuivre); font-variant-numeric: tabular-nums; }
.statut { font-size: 12px; letter-spacing: .06em; border-radius: 999px; padding: 2px 10px; background: var(--puce); color: var(--encre); }
.statut.nouvelle { border: 1px solid var(--cuivre); background: transparent; color: var(--cuivre); }
.texte h2 { font: 400 24px/1.2 "Cormorant Garamond", Georgia, serif; color: var(--encre); margin: 0; text-wrap: balance; }
.lieu { margin: 0; color: var(--doux); font-size: 14px; }
dl { margin: 6px 0 0; display: grid; grid-template-columns: 112px 1fr; gap: 6px 12px; font-size: 14px; }
dt { color: var(--doux); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; padding-top: 2px; }
dd { margin: 0; }
.tableau { overflow-x: auto; background: var(--carte); border: 1px solid var(--filet); border-radius: 6px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; min-width: 640px; }
th, td { text-align: left; vertical-align: top; padding: 10px 14px; border-bottom: 1px solid var(--filet); }
th { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--doux); font-weight: 400; }
td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
tfoot td { font-weight: 500; color: var(--encre); border-bottom: 0; }
.envoi { background: var(--carte); border: 1px solid var(--filet); border-radius: 6px; padding: 18px 20px; display: grid; gap: 10px; }
.envoi ol { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
code { font: 400 13px ui-monospace, Consolas, monospace; background: var(--puce); padding: 1px 6px; border-radius: 3px; overflow-wrap: anywhere; }
@media (max-width: 520px) { dl { grid-template-columns: 1fr; gap: 2px; } dt { padding-top: 6px; } }
@page { size: A4 landscape; margin: 10mm; }
@media print { body { padding: 0; font-size: 12px; } .page { gap: 18px; } .carte, .regle, .envoi, tr { break-inside: avoid; }
  .regles { grid-template-columns: repeat(5, 1fr); } .grille { grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .texte { padding: 10px 12px 12px; gap: 4px; } .texte h2 { font-size: 19px; } .lieu { font-size: 11.5px; }
  dl { grid-template-columns: 84px 1fr; gap: 3px 8px; font-size: 11px; } dt { font-size: 9.5px; }
  table { font-size: 11.5px; } th, td { padding: 6px 10px; } h2.section { break-before: page; } h2.section:first-of-type { break-before: auto; } }
</style>'''

commandees = [c for c, e in zip(cartes, ENSEIGNES) if e['statut'] == 'commande']
nouvelles = [c for c, e in zip(cartes, ENSEIGNES) if e['statut'] != 'commande']
total_pi = sum(e.get('prix') or 0 for e in ENSEIGNES)
revision = ''.join(
    f'<tr><td class="code">{e["id"]}</td><td>{html.escape(e["nom"])}</td>'
    f'<td class="num">{e["prix"]} USD</td><td>{html.escape(e["fr"]["change"])}</td></tr>'
    for e in ENSEIGNES if e['statut'] == 'commande')
DOSSIER_DRIVE = ('Maison MND › 09 · Achats et fournisseurs › Enseignes · Shenzhen Lico Sign (Alibaba)'
                 ' › 4 · Révision du 13-10-2026 · nouveau logo')
PAGE = ('<title>Enseignes Maison MND</title>\n'
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Jost:wght@300;400;500&display=swap">\n'
        + CSS + DEFS_PARTAGES + f'''
<div class="page">
<header><p class="sur">Maison MND · Signalétique · 13 octobre 2026</p>
<h1>Les enseignes de la Maison</h1>
<p class="chapeau">Dix-huit enseignes. Les neuf de la commande chez Shenzhen Lico Sign (PI FINALE du 4 mai 2026, épreuve 4), revues au nouveau logo. Neuf nouvelles, rondes, carrées, lumineuses, en relief ou en néon. Chacune a son fichier vectoriel à l’échelle 1:1 et sa fiche technique en anglais pour le fabricant.</p></header>
<section class="regles" aria-label="Les règles appliquées">
<div class="regle"><b>Le verrou debout</b>Les règles du logo le réservent aux enseignes : pictogramme, MAISON, MND, jamais redessiné.</div>
<div class="regle"><b>Cuivre, pas or</b>L’or sur fond clair ne passe pas les règles de contraste, le cuivre si. Les pièces dorées passent en cuivre.</div>
<div class="regle"><b>Indigo, jamais noir</b>Les côtés et fonds noirs de l’épreuve passent en indigo #1E2150.</div>
<div class="regle"><b>Lumière chaude 3000 K</b>Au lieu de 4500 K : un blanc chaud, qui va avec l’ivoire et le cuivre.</div>
<div class="regle"><b>GBÈJÍ, pas GBÉJÍ</b>La plaque de l’atelier II portait une faute dans l’épreuve 4.</div>
</section>
<h2 class="section">La commande, revue au nouveau logo</h2>
<p class="section-dit">Mêmes tailles et mêmes fabrications que l’épreuve 4. Seuls le dessin, les couleurs et la lumière changent.</p>
<div class="tableau"><table><thead><tr><th>Réf.</th><th>Enseigne</th><th>Prix PI</th><th>Ce qui change</th></tr></thead>
<tbody>{revision}</tbody>
<tfoot><tr><td></td><td>Total des enseignes</td><td class="num">{total_pi} USD</td><td>Avec le transport jusqu’à Guangzhou et la caisse en bois (100 USD), la PI fait {total_pi + 100} USD. R1 compte neuf lettres au lieu de trois : Lico Sign peut revoir son prix.</td></tr></tfoot></table></div>
<div class="grille">{"".join(commandees)}</div>
<h2 class="section">Les nouvelles</h2>
<p class="section-dit">À faire chiffrer par Lico Sign. La vitrophanie de la porte (N8) peut aussi se faire chez un imprimeur de Cotonou.</p>
<div class="grille">{"".join(nouvelles)}</div>
<section class="envoi"><h2 class="section" style="margin:0">Ce qui part chez Connie</h2>
<ol><li>Le PDF des dix-huit fiches techniques en anglais : tailles, fabrication, finitions, couleurs (HEX, RGB, CMYK), lumière, ce qui change.</li>
<li>Les fichiers SVG à l’échelle 1:1, une plaque par atelier, tous les textes vectorisés, le trait de découpe en magenta.</li>
<li>Le message à Connie, en anglais, avec sa traduction.</li></ol>
<p>Tout est rangé dans le Drive : <code>{html.escape(DOSSIER_DRIVE)}</code>.</p></section>
</div>''')
# La marche à suivre de Yéman, cochable (cochée dans ce navigateur seulement).
ETAPES = [
    'Relire la traduction du message à Connie ; changer la signature si besoin.',
    'Confirmer les horaires de la plaque N7 : mardi au vendredi 8 h à 20 h 30, samedi 9 h à 20 h.',
    'Choisir les nouvelles enseignes à faire chiffrer (toutes, par défaut).',
    'Envoyer à Connie le message en anglais, le PDF des fiches techniques et le .zip des SVG.',
    'Ranger la PI révisée dans « 1 · Proformas » et l’épreuve 5 dans « 2 · Épreuves du fabricant ».',
    'Vérifier l’épreuve 5 : GBÈJÍ, la devise fon, le cuivre et l’indigo (ni or, ni noir), 3000 K, les tailles.',
    'Valider l’épreuve 5 avant tout nouveau paiement.',
]
MARCHE = ('<section class="envoi marche"><h2 class="section" style="margin:0">La marche à suivre</h2>'
          + ''.join(f'<label class="etape"><input type="checkbox" data-k="e{i + 1}"><span>{html.escape(t)}</span></label>' for i, t in enumerate(ETAPES))
          + '</section>'
          + '<style>.etape { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; border-top: 1px solid var(--filet); cursor: pointer; }'
          + ' .etape input { accent-color: var(--cuivre); width: 18px; height: 18px; margin: 3px 0 0; flex: none; }'
          + ' .etape:has(input:checked) span { color: var(--doux); text-decoration: line-through; }</style>'
          + '<script>(function () { var CLE = "enseignes-mnd-marche"; var etat = {};'
          + ' try { etat = JSON.parse(localStorage.getItem(CLE) || "{}") || {}; } catch (e) { etat = {}; }'
          + ' document.querySelectorAll(".etape input").forEach(function (c) { c.checked = !!etat[c.dataset.k];'
          + ' c.addEventListener("change", function () { etat[c.dataset.k] = c.checked;'
          + ' try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch (e) {} }); }); })();</script>')
PAGE = PAGE[:PAGE.rindex('</div>')] + MARCHE + '</div>'
PAGE = lie_les_unites(PAGE)
io.open(os.path.join(CATALOGUE, 'catalogue.html'), 'w', encoding='utf-8').write(PAGE)
print('catalogue :', len(PAGE.encode('utf-8')) // 1024, 'Ko')
