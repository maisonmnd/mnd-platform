# -*- coding: utf-8 -*-
"""LES FICHIERS PRÊTS À IMPRIMER DES AUTOCOLLANTS (R9, N12), 23 octobre 2026.

    python scripts/signaletique/fichiers_machine.py "<dossier SVG 1-1>" "<sortie>"

« Connie ne voit pas bien N12 et R9. Il faut le fichier en PDF, et je veux voir
chaque chose prête à imprimer, à envoyer dans la machine » (Yéman). Pour
chaque feuille, à partir du SVG 1:1 (jamais redessiné) :

  · le fichier machine : 1060 × 680 mm, vectoriel, fond perdu compris, le
    trait de découpe en ton direct « CutContour » (100 % magenta), le nom que
    lisent les logiciels d'impression-découpe (VersaWorks, RasterLink, Summa) ;
  · l'impression seule et la découpe seule, pour un atelier qui les veut à part ;
  · une épreuve A3 : la feuille entière, puis chaque autocollant à taille réelle
    avec son nom et ses encres (HEX, RVB, CMJN).

Chrome imprime les PDF ; PyMuPDF change le magenta en ton direct.
"""
import html
import io
import os
import re
import subprocess
import sys

import fitz  # PyMuPDF

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from enseignes import Atelier, ENSEIGNES  # noqa: E402
from formes import ENCRES, cmjn, rvb  # noqa: E402
import autocollants  # noqa: E402
import autocollants_boutique as boutique  # noqa: E402

SVG_DIR, SORTIE = sys.argv[1], sys.argv[2]
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
MAGENTA = ('.9255 0 .549',)
PAR_ID = {e['id']: e for e in ENSEIGNES}
NOMS_ENCRES = {
    '#1E2150': 'Indigo', '#15173A': 'Deep indigo', '#B97A4A': 'Copper', '#F6F1E7': 'Ivory', '#E3DACB': 'Sand',
    '#CDBBA9': 'Clay', '#B8902F': 'Gold', '#2C3070': 'Light indigo',
}
esc = html.escape
os.makedirs(SORTIE, exist_ok=True)


def imprime(html_chemin, pdf):
    url = 'file:///' + html_chemin.replace('\\', '/')
    subprocess.run([CHROME, '--headless=new', '--no-first-run', '--disable-gpu', '--no-pdf-header-footer',
                    '--virtual-time-budget=30000', f'--print-to-pdf={pdf}', url], capture_output=True, timeout=600)
    if not os.path.exists(pdf):
        sys.exit(f'PDF absent : {pdf}')


def page_html(corps, w, h, extra='', titre='Maison MND'):
    return (f'<!doctype html><html><head><meta charset="utf-8"><title>{esc(titre)}</title><style>'
            f'@page {{ size: {w}mm {h}mm; margin: 0 }} html, body {{ margin: 0; padding: 0 }} '
            '* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact } '
            f'svg.feuille {{ display: block; width: {w}mm; height: {h}mm }} {extra}</style></head><body>{corps}</body></html>')


def ton_direct(pdf):
    """Le trait magenta devient le ton direct CutContour (Separation, 100 % magenta)."""
    d = fitz.open(pdf)
    fn = d.get_new_xref()
    d.update_object(fn, '<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>')
    n = 0
    for p in d:
        for xref in p.get_contents():
            s = d.xref_stream(xref).decode('latin-1')
            for m in MAGENTA:
                n += s.count(m + ' RG') + s.count(m + ' rg')
                s = s.replace(m + ' RG', '/CutContour CS 1 SCN').replace(m + ' rg', '/CutContour cs 1 scn')
            d.update_stream(xref, s.encode('latin-1'))
        typ, val = d.xref_get_key(p.xref, 'Resources')
        espace = f'<< /CutContour [/Separation /CutContour /DeviceCMYK {fn} 0 R] >>'
        if typ == 'xref':
            res = int(val.split()[0])
            d.xref_set_key(res, 'ColorSpace', espace)
        else:
            d.xref_set_key(p.xref, 'Resources/ColorSpace', espace)
    tmp = pdf + '.tmp'
    d.save(tmp, garbage=3, deflate=True)
    d.close()
    os.replace(tmp, pdf)
    return n


DECOUPE = re.compile(r'<(?:circle|rect|path)[^>]*data-couche="decoupe"[^>]*/>')


def format_exact(pdf, w, h):
    """Chrome arrondit la page au point près (1060,1 mm) : on la remet à la taille exacte de la feuille."""
    d = fitz.open(pdf)
    for p in d:
        r = fitz.Rect(0, 0, w / 25.4 * 72, h / 25.4 * 72)
        p.set_mediabox(r)
    tmp = pdf + '.tmp'
    d.save(tmp, garbage=3, deflate=True)
    d.close()
    os.replace(tmp, pdf)


def fichiers_machine(ident):
    e = PAR_ID[ident]
    src = [f for f in os.listdir(SVG_DIR) if f.startswith(ident + ' ')][0]
    svg = re.sub(r'^<\?xml[^>]*>\s*', '', io.open(os.path.join(SVG_DIR, src), encoding='utf-8').read())
    svg = svg.replace('<svg ', '<svg class="feuille" ', 1)
    decoupes = DECOUPE.findall(svg)
    impression = DECOUPE.sub('', svg)
    tete = svg[:svg.index('>') + 1]
    decoupe_seule = tete + '<g id="decoupe">' + ''.join(decoupes) + '</g></svg>'
    sorties = []
    # Des noms courts : le chemin Windows du dossier 6 ne doit pas dépasser 260 caractères (Acrobat ne l'ouvre plus).
    for suffixe, titre, contenu, ton in (('machine CutContour 1-1', 'print and cut', svg, True), ('impression seule 1-1', 'print only', impression, False),
                                         ('découpe seule CutContour 1-1', 'cut only', decoupe_seule, True)):
        h = os.path.join(SORTIE, f'_{ident}-{len(sorties)}.html')
        io.open(h, 'w', encoding='utf-8').write(page_html(contenu, e['w'], e['h'], titre=f"Maison MND · {ident} · {e['name']} · {titre} · 1060 × 680 mm · 1:1"))
        pdf = os.path.join(SORTIE, f'{ident} · {suffixe}.pdf')
        imprime(h, pdf)
        n = ton_direct(pdf) if ton else 0
        format_exact(pdf, e['w'], e['h'])
        os.remove(h)
        sorties.append((pdf, len(decoupes), n))
    return sorties


# ══ LES ÉPREUVES ════════════════════════════════════════════════════════
def encres(fragment):
    vus = []
    for c in re.findall(r'fill="(#[0-9A-Fa-f]{6})"', fragment):
        c = c.upper()
        if c in NOMS_ENCRES and c not in vus and c != '#FFFFFF':
            vus.append(c)
    return vus


def legende_encres(fragment):
    out = []
    for c in encres(fragment):
        r, g, b = rvb(c)
        cc, mm, jj, nn = cmjn(c)
        out.append(f'<li><i style="background:{c}"></i><b>{NOMS_ENCRES[c]}</b> {c} · RGB {r} {g} {b} · CMYK {cc} {mm} {jj} {nn}</li>')
    return ''.join(out)


CSS_EPREUVE = '''
body { font: 10pt/1.35 Arial, sans-serif; color: #1E2150; }
.page { width: 420mm; height: 297mm; padding: 12mm 14mm; page-break-after: always; display: flex; flex-direction: column; gap: 6mm; overflow: hidden; }
.page:last-child { page-break-after: auto; }
.tete { display: flex; justify-content: space-between; align-items: baseline; border-bottom: .4mm solid #1E2150; padding-bottom: 2mm; }
.tete b { font-size: 13pt; } .tete span { color: #555; font-size: 9pt; }
.vue { flex: 1; display: flex; align-items: center; justify-content: center; }
.une { display: grid; grid-template-columns: auto 1fr; gap: 12mm; align-items: center; flex: 1; }
.info h2 { font-size: 16pt; margin: 0 0 3mm; } .info p { margin: 0 0 2mm; color: #333; }
.info ul { list-style: none; padding: 0; margin: 3mm 0 0; display: grid; gap: 1.6mm; font-size: 9.5pt; }
.info i { display: inline-block; width: 6mm; height: 6mm; border: .2mm solid #999; vertical-align: middle; margin-right: 2mm; }
.grille { display: grid; gap: 7mm 6mm; align-content: start; }
.case { display: grid; gap: 2mm; justify-items: center; text-align: center; font-size: 8pt; color: #333; }
.note { font-size: 8.5pt; color: #555; }
'''


def tete(titre, droite):
    return f'<div class="tete"><b>{esc(titre)}</b><span>{esc(droite)}</span></div>'


def svg_mm(contenu, x, y, w, h, echelle=1.0):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" '
            f'style="width:{w * echelle}mm;height:{h * echelle}mm;display:block">{contenu}</svg>')


def epreuve_r9():
    a = Atelier(False)
    pages = []
    feuille = autocollants.planche(a)
    pages.append(f'<div class="page">{tete("R9 · Round stickers Ø200 · the whole sheet (scaled)", "Maison MND · proof for Lico Sign · 23 Oct 2026")}'
                 f'<div class="vue">{svg_mm("<rect width=\'1060\' height=\'680\' fill=\'#fff\' stroke=\'#ccc\' stroke-width=\'1\'/>" + feuille, 0, 0, 1060, 680, 0.36)}</div>'
                 '<p class="note">Sheet 1060 × 680 mm, 5 × 3 stickers Ø200 mm, 3 mm bleed. Magenta hairline = cut line (spot colour CutContour in the machine file). '
                 'Each sticker is shown at actual size on the next pages. Print the QR codes at 100 %, never resized.</p></div>')
    for n, (_fam, titre, _fond, _d) in enumerate(autocollants.AUTOCOLLANTS):
        un = autocollants.autocollant(a, n, 106, 106)
        pages.append(f'<div class="page">{tete(f"R9 · sticker {n + 1} of 15", "actual size · 1:1")}'
                     f'<div class="une">{svg_mm(un, 0, 0, 212, 212)}<div class="info"><h2>{esc(titre)}</h2>'
                     '<p>Ø200 mm cut (magenta line), 3 mm bleed (Ø206). Synthetic paper, matte lamination.</p>'
                     f'<p>Inks:</p><ul>{legende_encres(un)}</ul></div></div></div>')
    return pages


def epreuve_n12():
    a = Atelier(False)
    b = boutique
    d_rond, d_lab = 2 * (b.R_REEL + b.FOND_PERDU) + 1, (b.ETIQ_W * b.K_ETIQ + 2 * b.FOND_PERDU + 1, b.ETIQ_H * b.K_ETIQ + 2 * b.FOND_PERDU + 1)
    tailles = f"round seals Ø{2 * b.R_REEL:g} mm, the allover square {2 * b.R_REEL:g} × {2 * b.R_REEL:g} mm, the mist label {b.ETIQ_W * b.K_ETIQ:.0f} × {b.ETIQ_H * b.K_ETIQ:.0f} mm"
    pages = []
    feuille = b.planche(a)
    nb = sum(p[4] for p in b.PASTILLES)
    pages.append(f'<div class="page">{tete("N12 · Boutique stickers · the whole sheet (scaled)", "Maison MND · proof for Lico Sign · 23 Oct 2026")}'
                 f'<div class="vue">{svg_mm("<rect width='1060' height='680' fill='#fff' stroke='#ccc' stroke-width='1'/>" + feuille, 0, 0, 1060, 680, 0.36)}</div>'
                 f'<p class="note">Sheet 1060 × 680 mm: {nb} round seals and {b.N_ETIQ} labels, {b.PAR_DESSIN} of each design; {tailles}; '
                 f'{b.FOND_PERDU:g} mm bleed, kiss-cut on the magenta line (spot colour CutContour in the machine file). '
                 'Each design is shown at actual size and enlarged on the next pages.</p></div>')
    dessins = []
    for i, (_f, titre, _fond, _d, n) in enumerate(b.PASTILLES):
        c = d_rond / 2
        dessins.append((titre, n, b.pastille(a, i, c, c), d_rond, d_rond))
    lw, lh = d_lab
    dessins.append((f'La Brume · Hydra Mist, bottle label {b.ETIQ_W * b.K_ETIQ:.0f} × {b.ETIQ_H * b.K_ETIQ:.0f} mm', b.N_ETIQ, b.etiquette(a, lw / 2, lh / 2), lw, lh))
    cases = ''.join(f'<div class="case">{svg_mm(f, 0, 0, w, h)}<div><b>{esc(t)}</b><br>{n} per sheet</div></div>' for t, n, f, w, h in dessins)
    pages.append(f'<div class="page">{tete(f"N12 · the {len(dessins)} designs, actual size · 1:1", "Maison MND · proof for Lico Sign")}'
                 f'<div class="grille" style="grid-template-columns:repeat(5, auto)">{cases}</div><p class="note">{tailles.capitalize()}; {b.FOND_PERDU:g} mm bleed.</p></div>')
    for k, lot in enumerate((dessins[:6], dessins[6:]), 1):
        cases = ''.join(f'<div class="case">{svg_mm(f, 0, 0, w, h, 1.7 if w < 100 else 1.3)}<div><b>{esc(t)}</b><br>{n} per sheet · inks: '
                        f'{", ".join(NOMS_ENCRES[c] for c in encres(f))}</div></div>' for t, n, f, w, h in lot)
        pages.append(f'<div class="page">{tete(f"N12 · the designs, enlarged × 1.7 to read the details ({k}/2)", "Maison MND · proof for Lico Sign")}'
                     f'<div class="grille" style="grid-template-columns:repeat(3, auto)">{cases}</div></div>')
    return pages


if __name__ == '__main__':
    for ident in ('R9', 'N12'):
        for pdf, nb, n in fichiers_machine(ident):
            print(os.path.basename(pdf), '·', nb, 'découpes', '·', n, 'traits passés en CutContour' if n else '')
    for ident, pages in (('R9', epreuve_r9()), ('N12', epreuve_n12())):
        h = os.path.join(SORTIE, f'_epreuve-{ident}.html')
        io.open(h, 'w', encoding='utf-8').write(page_html(''.join(pages), 420, 297, CSS_EPREUVE, f"Maison MND · {ident} · {PAR_ID[ident]['name']} · proof, each sticker at actual size"))
        pdf = os.path.join(SORTIE, f'{ident} · épreuve A3.pdf')
        imprime(h, pdf)
        os.remove(h)
        print(os.path.basename(pdf), '·', len(fitz.open(pdf)), 'pages')
