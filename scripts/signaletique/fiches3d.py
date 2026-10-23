# -*- coding: utf-8 -*-
"""LES FICHES TECHNIQUES 3D, EN ANGLAIS ET EN CHINOIS, 22 octobre 2026.

    python scripts/signaletique/volumes.py <scenes.json>
    node   scripts/signaletique/rendu3d.mjs <scenes.json> "<sortie>/Rendus 3D"
    python scripts/signaletique/fiches3d.py "<sortie>" [R4,R3,…]

« Une fiche technique par élément, chaque pièce, chaque commande, avec le
résultat final du LED ou du 3D, pas juste une simple image » (Yéman). Une page
A3 par enseigne : les rendus 3D calculés (jour, nuit allumée à 3000 K, en
situation avec une silhouette de 1,70 m), la fiche (commande, quantité,
tailles, fabrication, finition, lumière, ce qui change), la coupe des couches
tirée de la recette de volumes.py, la vue cotée, les couleurs, et la case de
validation du bon à tirer. Chaque ligne en anglais, sa traduction chinoise
dessous ; l'anglais fait foi.
"""
import html
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from formes import ENCRES, cmjn, rvb  # noqa: E402
from enseignes import ENSEIGNES, Atelier  # noqa: E402
from communs import NOMS_EN, variantes, encres_de, interieur_ou_ext, vue_cotee, lie_les_unites  # noqa: E402
from volumes import RECETTES, MATIERES, SCENES_TOTEM  # noqa: E402
from options import OPTIONS  # noqa: E402
import chinois  # noqa: E402

SORTIE = sys.argv[1]
# Chaque pièce, puis son option à motif ; le totem en dernier, avec sa page « comment il vit ».
PAR_ID = {e['id']: e for e in ENSEIGNES + OPTIONS}
ORDRE = [i for e in ENSEIGNES for i in (e['id'], f"{e['id']}-M") if i in PAR_ID]
IDS = sys.argv[2].split(',') if len(sys.argv) > 2 else ORDRE
Z = chinois.ETIQUETTES
DATE = '22 Oct 2026'
NOMS_ZH = {'indigo': '靛蓝', 'cuivre': '铜色', 'ivoire': '象牙白', 'sable': '沙色（磨砂）', 'or': '金色', 'argile': '陶土色', 'indigo-profond': '深靛蓝'}
LUM_EN = {'halo': 'halo-lit', 'face': 'face-lit', 'retro': 'backlit', 'contour': 'edge-lit', 'percee': 'lit through cut-outs'}
LUM_ZH = {'halo': Z['halo'], 'face': Z['face_lum'], 'retro': Z['retro'], 'contour': Z['contour_lum'], 'percee': Z['perce_lum']}
COULEUR_MAT = {
    'cuivre-brosse': '#B0703F', 'cuivre-miroir': '#C98552', 'alu-cuivre': '#C08050', 'inox': '#C9CDD3', 'indigo': '#1E2150', 'alu-indigo': '#2A2E66',
    'fer-indigo': '#1E2150', 'ivoire': '#F1EADC', 'acrylique-ivoire': '#F6F1E7', 'acrylique-indigo': '#2A2E66', 'opale': '#F4EFE6',
    'depoli': '#DDE3E0', 'clair': '#E6F0F4', 'verre': '#CFE0E4', 'film-cuivre': '#C98D5B', 'papier': '#FFFFFF',
    'vinyle-cuivre': '#B97A4A', 'encre-cuivre': '#B97A4A', 'alu-sable': '#E3DACB', 'vinyle-blanc': '#F7F7F5', 'vinyle-sable': '#E3DACB', 'encre-indigo': '#1E2150', 'encre-ivoire': '#F6F1E7', 'neon': '#FFD9A0',
}


def esc(t):
    return html.escape(str(t))


def bi(en, zh):
    """Une ligne en anglais, sa traduction dessous."""
    return f'<span class="en">{en}</span><span class="zh">{esc(zh)}</span>'


def couches(e):
    """Les couches de la coupe, du mur vers l'avant : (en, zh, z0, z1, couleur, lumière)."""
    r = RECETTES[e['id']]
    if r.get('coupe'):
        return r['coupe']
    out = []
    sup = r.get('support')
    if sup and sup.get('recul'):
        out.append(('Stand-offs', Z['entretoises'], 0, sup['recul'], '#AEB3BA', None))
    elif r.get('goujons') and not sup:
        out.append(('Threaded studs', '背面螺杆', 0, min(p['z'] for p in r['pieces']), '#AEB3BA', None))
    elif r.get('goujons'):
        z_sup = (sup.get('recul') or 0) + sup['ep']
        z_p = min((p['z'] - (p.get('socle') or 0)) for p in r['pieces']) if r['pieces'] else z_sup
        if z_p > z_sup:
            out.append(('Stand-offs', Z['entretoises'], z_sup, z_p, '#AEB3BA', None))
    if sup:
        z0 = sup.get('recul') or 0
        en, zh = MATIERES[sup['matiere']]
        if sup.get('face') == 'percee':
            out.append((f"{MATIERES[sup['fond']][0]} (behind cut-outs)", f"{MATIERES[sup['fond']][1]}（镂空后）", z0, z0 + 1.5, COULEUR_MAT[sup['fond']], sup.get('lum')))
        if sup.get('face') == 'impression' and sup['matiere'] == 'indigo':
            # Un caisson imprimé : faces opales imprimées (allumées), côtés indigo, cerclage.
            lum = sup.get('lum')
            if sup.get('double'):
                out.append(('Opal acrylic face 5 mm, UV print', '5 毫米乳白亚克力面板，UV 打印', z0, z0 + 5, COULEUR_MAT['opale'], lum))
            out.append(('Box sides, indigo paint', '灯箱侧边，靛蓝色烤漆', z0, z0 + sup['ep'], COULEUR_MAT['indigo'], None))
            out.append(('Opal acrylic face 5 mm, UV print', '5 毫米乳白亚克力面板，UV 打印', z0 + sup['ep'] - 5, z0 + sup['ep'], COULEUR_MAT['opale'], lum))
        else:
            if sup.get('face') == 'impression':
                en, zh = (f'{en}, UV print both sides', f'{zh}，双面 UV 打印') if sup.get('double') else (f'{en}, UV print', f'{zh}，UV 打印')
            out.append((en, zh, z0, z0 + sup['ep'], COULEUR_MAT[sup['matiere']], sup.get('lum') if sup.get('face') != 'percee' else None))
        if sup.get('rebord'):
            ren, rzh = MATIERES[sup['rebord']]
            out.append((f'Rim, {ren.lower()}', f'包边，{rzh}', z0 + sup['ep'], z0 + sup['ep'] + 3, COULEUR_MAT[sup['rebord']], None))
    for p in r['pieces']:
        if p.get('socle'):
            out.append(('Frosted acrylic back (halo diffuser)', '磨砂亚克力背板（背发光）', p['z'] - p['socle'], p['z'], COULEUR_MAT['depoli'], None))
        en, zh = MATIERES[p['matiere']]
        out.append((en, zh, p['z'], p['z'] + p['ep'], COULEUR_MAT[p['matiere']], p.get('lum')))
    if r['montage'] == 'drapeau':
        bm = r.get('bras_matiere', 'inox')
        # Le nom court de la matière : la légende tient dans la coupe ; ancrages et platine sont dans « Construction ».
        out.insert(0, (f"Bracket tube Ø40, {MATIERES[bm][0].split(' (')[0].lower()}, 5 mm wall plate", f"Ø40 管支架，{MATIERES[bm][1].split('（')[0]}，5 毫米底板", 0, r['bras'], COULEUR_MAT[bm], None))
    if r['montage'] == 'potence':
        out.insert(0, (f"Wrought iron arm {r['bras']} mm, two hanging rods", f"铁艺悬臂 {r['bras']} 毫米，两根吊杆", 0, r['bras'], COULEUR_MAT['fer-indigo'], None))
    if r.get('neon'):
        n = r['neon']
        out.append((MATIERES['neon'][0], MATIERES['neon'][1], n['z'] - n['rayon'], n['z'] + n['rayon'], COULEUR_MAT['neon'], 'neon'))
    for si in r.get('surimpressions', []):
        if si.get('lum'):
            out.append(('Laser-engraved pattern, lit by the edge LEDs', '激光雕刻图案，由边缘 LED 点亮', si['z'] - 0.5, si['z'], '#E6DCCB', 'contour'))
        else:
            en, zh = si.get('nom', ('Pattern, UV print', '图案，UV 打印'))
            out.append((en, zh, si['z'] - 0.1, si['z'] + 0.1, '#C9BFAE', None))
    vus, uniques = set(), []
    for c in out:
        if c not in vus:
            vus.add(c)
            uniques.append(c)
    return uniques


def coupe(e):
    """La coupe des couches : le mur à gauche, chaque couche sur sa ligne, cotée en mm."""
    cs = couches(e)
    if not cs:
        return ''
    tourne = RECETTES[e['id']]['montage'] in ('drapeau', 'potence')
    au_sol = RECETTES[e['id']]['montage'] == 'sol'
    zmax = max(c[3] for c in cs)
    larg, x0, rangee = 58.0, 7.0, 7.2
    k = larg / max(zmax, 1)
    H = len(cs) * rangee + 12
    out = [f'<rect x="1" y="2" width="5" height="{H - 8:.1f}" fill="url(#hachure)"/>',
           f'<line x1="6" y1="2" x2="6" y2="{H - 6:.1f}" stroke="#555" stroke-width=".25"/>']
    for i, (en, zh, z0, z1, coul, lum) in enumerate(cs):
        y = 4 + i * rangee
        w = max((z1 - z0) * k, 0.6)
        out.append(f'<rect x="{x0 + z0 * k:.2f}" y="{y:.2f}" width="{w:.2f}" height="4.2" fill="{coul}" stroke="#555" stroke-width=".2"/>')
        if lum:
            out.append(f'<circle cx="{x0 + z0 * k + w + 2.2:.2f}" cy="{y + 2.1:.2f}" r="1.2" fill="#FFB65C" stroke="#C2410C" stroke-width=".2"/>')
        ep = z1 - z0
        txt = f'{ep:g} mm · z {z0:g}–{z1:g}'
        lum_en = f' · {LUM_EN.get(lum, "neon")}' if lum else ''
        lum_zh = f' · {LUM_ZH.get(lum, Z["neon"])}' if lum else ''
        out.append(f'<text x="{x0 + larg + 6:.1f}" y="{y + 1.9:.2f}" font-size="2.5" fill="#222">{esc(en)}{esc(lum_en)}</text>'
                   f'<text x="{x0 + larg + 6:.1f}" y="{y + 4.6:.2f}" font-size="2.3" fill="#666">{esc(zh)}{esc(lum_zh)} · {esc(txt)}</text>')
    out.append(f'<text x="{x0}" y="{H - 1:.1f}" font-size="2.3" fill="#C2410C">0</text>'
               f'<text x="{x0 + larg:.1f}" y="{H - 1:.1f}" font-size="2.3" fill="#C2410C" text-anchor="end">{zmax:g} mm</text>')
    if tourne:
        out.append(f'<text x="{x0 + larg / 2:.1f}" y="{H - 1:.1f}" font-size="2.2" fill="#666" text-anchor="middle">box across its thickness · 灯箱按厚度方向</text>')
    if au_sol:
        out.append(f'<text x="{x0 + larg / 2:.1f}" y="{H - 1:.1f}" font-size="2.2" fill="#666" text-anchor="middle">from the back · 由背面向前</text>')
    defs = '<defs><pattern id="hachure" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2" stroke="#888" stroke-width=".6"/></pattern></defs>'
    return f'<svg viewBox="0 0 150 {H:.1f}" class="coupe">{defs}{"".join(out)}</svg>'


def nuancier_bi(corps):
    out = []
    for n in encres_de(corps):
        hx = ENCRES[n]
        c, m, y, k = cmjn(hx)
        r, g, b = rvb(hx)
        out.append(f'<div class="nu"><span style="background:{hx}"></span><div><b>{NOMS_EN[n]} · {NOMS_ZH[n]}</b><br>{hx} · RGB {r} {g} {b} · CMYK {c} {m} {y} {k}</div></div>')
    return ''.join(out)


def legende(e, vue):
    r = RECETTES[e['id']]
    if vue == 'jour':
        return bi('Final result · daytime', Z['rendu_jour'])
    if vue == 'nuit':
        return bi('Optional halo · 3000 K', Z['rendu_nuit_option']) if r.get('nuit_option') else bi('Lit at night · 3000 K warm white', Z['rendu_nuit'])
    if r.get('situation') == 'nuit':
        return bi('In place at night · 1.70 m figure for scale', Z['rendu_situation_nuit'])
    return bi('In place · 1.70 m figure for scale', Z['rendu_situation'])


def lignes_option(e):
    """Le tableau d'une option : ce qu'elle ajoute, comment, sur quelle base, et le prix à donner en supplément."""
    o, b = e['option'], e['base']
    zb = chinois.ENSEIGNES[b]
    qte = e.get('qte') or 1
    q_en = f"{qte} sheets (same as {b})" if b == 'R9' else f"{qte} set{'s' if qte > 1 else ''} (same as {b})"
    q_zh = f"{qte} 张（与 {b} 相同）" if b == 'R9' else f"{qte} 套（与 {b} 相同）"
    taille = (f"Ø {e['w']} mm" if e['forme'] == 'rond' else f"{e['w']} × {e['h']} mm") + (f" × depth {e['prof']} mm" if e['prof'] else '')
    r = RECETTES[e['id']]
    lumineuse = any(v == 'nuit' for v in r['vues'])
    out = [
        ('Quantity', Z['quantite'], bi(q_en, q_zh)),
        ('Overall size', Z['taille'], bi(esc(taille), taille.replace('depth', '深度'))),
        ('Option adds', '选项内容', bi('<b>' + esc(o['en']) + '</b>', o['zh'])),
        ('How it is made', '制作方法', bi(esc(o['fab_en']), o['fab_zh'])),
        ('Base item', '基础款', bi(f"{esc(PAR_ID[b]['name'])} · see sheet {b}", f"{zb['name']} · 见 {b} 规格书")),
    ]
    if lumineuse:
        out.append(('Lighting', Z['lumiere'], bi(esc(PAR_ID[b]['en']['lighting']), zb['lighting'])))
    out.append(('Price', Z['prix'], bi(f'<b>Please quote as an extra over {b}</b>', f'请报价（在 {b} 基础上的加价）')))
    return out


def page(e):
    option = e.get('statut') == 'option'
    zh = chinois.ENSEIGNES[e['base']] if option else chinois.ENSEIGNES[e['id']]
    r = RECETTES[e['id']]
    en = e['en']
    ident0, dessin0 = variantes(e)[0]
    corps0 = dessin0(Atelier(False))
    vues = r['vues']
    principale = f'<figure class="rendu grand"><img src="Rendus 3D/{e["id"]}-{vues[0]}.png" alt=""><figcaption>{legende(e, vues[0])}</figcaption></figure>'
    petites = ''.join(f'<figure class="rendu"><img src="Rendus 3D/{e["id"]}-{v}.png" alt=""><figcaption>{legende(e, v)}</figcaption></figure>' for v in vues[1:])
    statut = (bi(f"ORDERED · {esc(e.get('pi', '')).replace('ligne', 'line').replace('épreuve', 'proof').replace('feuilles', 'sheets')}", Z['commande'])
              if e['statut'] == 'commande' else
              bi(f"PATTERN OPTION · extra over {e.get('base')}", f"图案选项 · 在 {e.get('base')} 基础上加价") if option else
              bi('NEW ITEM · please quote', Z['nouvelle']))
    taille = (f"Ø {e['w']} mm" if e['forme'] == 'rond' else f"{e['w']} × {e['h']} mm") + (f" × depth {e['prof']} mm" if e['prof'] else '')
    qte = e.get('qte') or 1
    q_en = f"{qte} sheets" if e['forme'] == 'feuille' else f"{qte} set{'s' if qte > 1 else ''}"
    q_zh = f"{qte} 张" if e['forme'] == 'feuille' else f"{qte} 套"
    usage = interieur_ou_ext(e)
    prix = f"USD {e['prix']} (PI FINALE)" if e.get('prix') else 'To be quoted'
    lignes = [
        ('Quantity', Z['quantite'], bi(q_en, q_zh)),
        ('Overall size', Z['taille'], bi(esc(taille), taille.replace('depth', '深度'))),
        ('Construction', Z['construction'], bi(esc(en['construction']), zh['construction'])),
        ('Finish', Z['finition'], bi(esc(en['finish']), zh['finish'])),
        ('Lighting', Z['lumiere'], bi(esc(en['lighting']), zh['lighting'])),
        ('Use', Z['usage'], bi(usage, Z['exterieur'] if usage.startswith('Outdoor') else Z['interieur'])),
        ('Changes', Z['changements'], bi('<b>' + esc(en['change']) + '</b>', zh['change'])),
        ('Price reference', Z['prix'], bi(prix, prix if e.get('prix') else Z['a_chiffrer'])),
    ]
    if option:
        lignes = lignes_option(e)
    table = ''.join(f'<tr><th>{k}<small>{esc(kz)}</small></th><td>{v}</td></tr>' for k, kz, v in lignes)
    # Le totem est haut et étroit : sa vue cotée et ses couleurs passent sur sa page « comment il vit ».
    duo = '' if e['id'] == 'N10' else (
        f'<div class="duo"><div><h3>Front view, mm <span class="zh-t">{Z["vue_face"]}</span></h3><div class="vue">{vue_cotee(e, dessin0, 120, 78)}</div></div>'
        f'<div><h3>Colours <span class="zh-t">{Z["couleurs"]}</span></h3>{nuancier_bi(corps0)}</div></div>')
    serie = ''
    if len(variantes(e)) > 1:
        serie = f'<p class="serie">{len(variantes(e))} variants in the SVG files: ' + ' · '.join(esc(i) for i, _d in variantes(e)) + f' <span class="zh">共 {len(variantes(e))} 款，见 SVG 文件</span></p>'
    return f'''<section class="page">
<header><div class="marque"><b>MAISON MND</b> · Technical sheet <span class="zh-t">{Z["titre"]}</span> · Signage for Shenzhen Lico Sign · {DATE}</div>
<div class="statut {e["statut"]}">{statut}</div><div class="id">{e["id"]}</div></header>
<div class="corps">
<div class="gauche">{principale}<div class="petites n{len(vues) - 1}">{petites}</div></div>
<div class="droite">
<h2>{esc(e["name"])}<span class="zh">{esc(zh["name"] + (" · 图案选项" if option else ""))}</span></h2>
<table>{table}</table>{serie}
<h3>{"Layers, from the back" if r["montage"] == "sol" else "Layers, from the wall"} <span class="zh-t">{Z["couches"]}</span></h3>{coupe(e)}
{duo}
<div class="validation"><b>Proof approved for production · {Z["validation"]}</b>
<div class="cases"><span>Name · {Z["nom"]}</span><span>Date · {Z["date"]}</span><span>Signature · {Z["signature"]}</span></div></div>
<p class="note">3D renders computed from the production files: exact logo, real thicknesses, nothing redrawn. Screen colours are indicative. {Z["note_rendu"]}<br>
All lettering is converted to outlines in the SVG files; the logo must not be redrawn or distorted; magenta hairline = cut line. {Z["note_logo"]} English prevails in case of doubt. {Z["fait_foi"]}</p>
</div></div></section>'''


manque = [i for i in IDS if PAR_ID[i].get('base', i) not in chinois.ENSEIGNES]
if manque:
    sys.exit(f'traduction chinoise absente pour {manque} : rien n’est écrit')
choisies = [PAR_ID[i] for i in ORDRE if i in IDS]
for e in choisies:
    vues_attendues = [(e['id'], v) for v in RECETTES[e['id']]['vues']]
    if e['id'] == 'N10':
        vues_attendues += [(f'N10-{n}', 'nuit') for n, *_x in SCENES_TOTEM]
    for ident, v in vues_attendues:
        if not os.path.exists(os.path.join(SORTIE, 'Rendus 3D', f"{ident}-{v}.png")):
            sys.exit(f"rendu absent : Rendus 3D/{ident}-{v}.png (lancer rendu3d.mjs d’abord)")

VIVANT = [
    ('Motion sensor', '人体感应器', 'PIR sensor behind the window at 0.9 m, IP65, range 3 to 5 m, adjustable delay.', '0.9 米高感应窗后装 PIR 人体感应器，IP65，感应距离 3–5 米，延时可调。'),
    ('LED', 'LED', 'Addressable RGBW LED behind the opal of the medallion, the W channel 3000 K warm white; colour only for festive scenes. Even light across the whole medallion, no hot spots. The logo halo on its own channel.',
     '圆章乳白板后装 RGBW 可编程 LED，W 路为 3000K 暖白；彩色只用于节日场景。整个圆章光线均匀，无光斑。标志背发光单独一路。'),
    ('Controller and app', '控制器和手机应用', 'Wi-Fi and Bluetooth controller in an IP65 box inside the column, phone app (iOS and Android): scenes, brightness, weekly timer, manual switch.',
     '控制器装在立柱内的 IP65 盒中，支持 Wi-Fi 和蓝牙，手机应用（iOS 和安卓）：场景、亮度、每周定时、手动开关。'),
    ('Scenes', '场景', 'At rest: the light breathes slowly at about 30%. Approach: it rises to full light in 2 seconds. Welcome: full light while someone is near. Closing: soft fade, off at closing time. Festive: palettes we choose (pink for Octobre Rose, for example).',
     '待机：灯光以约 30% 亮度缓慢呼吸。有人走近：2 秒内渐亮到全亮。欢迎：有人在附近时保持全亮。关店：缓慢变暗，到点关闭。节日：我们选定的颜色（例如粉红色十月）。'),
    ('Book: QR and NFC', '预约：二维码和 NFC', 'QR code printed indigo on the copper plate (artwork supplied), NFC tag NTAG216 behind the plate; both open https://maisonmnd.com/. Please program and test the tag.',
     '铜色牌上印靛蓝色二维码（文件已提供），牌背后装 NTAG216 NFC 标签；两者都打开 https://maisonmnd.com/。请写入并测试标签。'),
    ('Power and access', '电源和检修', 'Input 220–240 V 50 Hz (Benin), outdoor Mean Well driver, cable through the base plate, lockable service door at the back.',
     '输入 220–240V 50Hz（贝宁），户外明纬电源，电缆从底板穿入，背面带锁检修门。'),
    ('Please tell us', '请告知', 'Total power in watts, weight, wind load design, and the lead time.', '总功率（瓦）、重量、抗风设计，以及交期。'),
]


def schema_vivant():
    """Le chemin du courant et des ordres, de la prise aux lanternes."""
    boites = [(4, 6, 'Mains 220–240 V', '市电'), (44, 6, 'Driver (Mean Well)', '电源'), (84, 6, 'Controller Wi-Fi + Bluetooth', '控制器'),
              (84, 30, 'Phone app', '手机应用'), (4, 30, 'Motion sensor', '人体感应器'), (124, 6, 'Medallion LED + logo halo', '圆章 LED + 标志背发光')]
    out = []
    for x, y, en, zh in boites:
        out.append(f'<rect x="{x}" y="{y}" width="34" height="16" rx="2" fill="#F6F1E7" stroke="#1E2150" stroke-width=".35"/>'
                   f'<text x="{x + 17}" y="{y + 7}" font-size="2.6" fill="#1E2150" text-anchor="middle">{esc(en)}</text>'
                   f'<text x="{x + 17}" y="{y + 11.5}" font-size="2.4" fill="#666" text-anchor="middle">{esc(zh)}</text>')
    # Des traits à angle droit : courant en haut, ordres au milieu, moteurs par le bas.
    traits = ['38,14 44,14', '78,14 84,14', '118,14 124,14', '101,30 101,22', '38,38 76,38 76,18 84,18']
    for pts in traits:
        out.append(f'<polyline points="{pts}" fill="none" stroke="#A86B3E" stroke-width=".45" marker-end="url(#fl)"/>')
    defs = '<defs><marker id="fl" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="#A86B3E"/></marker></defs>'
    return f'<svg viewBox="0 0 162 50" class="schema">{defs}{"".join(out)}</svg>'


def page_vivant(e):
    temps = ''.join(f'<figure class="temps"><img src="Rendus 3D/N10-{n}-nuit.png" alt=""><figcaption><b>{n} · {esc(en)}</b><span class="zh">{esc(zh)}</span></figcaption></figure>'
                    for n, en, zh, fr, k in SCENES_TOTEM)
    lignes = ''.join(f'<tr><th>{esc(k)}<small>{esc(kz)}</small></th><td>{bi(esc(v), vz)}</td></tr>' for k, kz, v, vz in VIVANT)
    return f'''<section class="page">
<header><div class="marque"><b>MAISON MND</b> · Technical sheet <span class="zh-t">{Z["titre"]}</span> · Signage for Shenzhen Lico Sign · {DATE}</div>
<div class="statut nouvelle">{bi('NEW ITEM · how it lives', '新品 · 互动方式')}</div><div class="id">N10</div></header>
<div class="vivant">
<div class="gauche"><h3>At night, when someone walks by <span class="zh-t">夜间有人经过时</span></h3><div class="temps-liste">{temps}</div>
<h3>How power and commands flow <span class="zh-t">电源和控制示意</span></h3>{schema_vivant()}</div>
<div class="droite"><h2>{esc(e["name"])}<span class="zh">{esc(chinois.ENSEIGNES["N10"]["name"])}</span></h2><table>{lignes}</table>
<h3>Colours <span class="zh-t">{Z["couleurs"]}</span></h3>{nuancier_bi(e["dessin"](Atelier(False)))}
<p class="note">Renders computed from the production files; the three frames show the welcome sequence triggered by the motion sensor. 效果图由生产文件计算生成；三张图为人体感应触发的欢迎过程。 English prevails in case of doubt. {Z["fait_foi"]}</p></div>
</div></section>'''


CSS = '''<style>
@page { size: A3 landscape; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font: 7.8pt/1.32 Arial, "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif; color: #222; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 420mm; height: 297mm; padding: 9mm 11mm; page-break-after: always; display: flex; flex-direction: column; gap: 5mm; overflow: hidden; }
header { display: flex; align-items: center; gap: 6mm; background: #1E2150; color: #F6F1E7; padding: 3.2mm 5mm; font-size: 9pt; letter-spacing: .03em; }
header .marque { flex: 1; } .zh-t { font-weight: normal; opacity: .85; margin-left: 1.5mm; }
header .statut { font-size: 8pt; border: .3mm solid #E2AC7C; border-radius: 3mm; padding: 1mm 3mm; color: #F6F1E7; display: grid; }
header .statut .zh { color: #E2AC7C; }
header .id { font-size: 22pt; font-weight: bold; color: #E2AC7C; }
.corps { flex: 1; display: grid; grid-template-columns: 248mm 1fr; gap: 7mm; min-height: 0; }
.gauche { display: flex; flex-direction: column; gap: 3mm; }
.rendu { margin: 0; display: flex; flex-direction: column; gap: 1mm; }
.rendu img { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; display: block; border: .2mm solid #ddd; }
.rendu figcaption { display: flex; gap: 3mm; font-size: 8pt; color: #1E2150; }
.rendu figcaption .zh { color: #666; }
.petites { display: grid; gap: 4mm; } .petites.n2 { grid-template-columns: 1fr 1fr; } .petites.n1 { grid-template-columns: 1fr 1fr; } .petites.n0 { display: none; }
.droite { display: flex; flex-direction: column; gap: 2.2mm; min-height: 0; }
.droite h2 { margin: 0; font-size: 12.5pt; color: #1E2150; display: grid; } .droite h2 .zh { font-size: 10pt; color: #555; font-weight: normal; }
.droite h3 { margin: 1.5mm 0 1mm; font-size: 8.4pt; color: #1E2150; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; vertical-align: top; border-bottom: .2mm solid #e2e2e2; padding: 1.1mm 1.5mm; }
th { width: 27mm; color: #555; font-weight: normal; } th small { display: block; color: #888; }
td .en, td .zh { display: block; } td .zh { color: #666; margin-top: .4mm; }
.serie { margin: 0; font-size: 7.4pt; color: #555; } .serie .zh { margin-left: 2mm; }
.coupe { width: 100%; height: auto; display: block; flex: none; }
.duo { display: grid; grid-template-columns: 62mm 1fr; gap: 4mm; }
.vue { border: .2mm solid #e2e2e2; background: #FAFAF8; height: 46mm; padding: 1.5mm; } .vue svg { width: 100%; height: 100%; display: block; }
.nu { display: flex; align-items: center; gap: 1.6mm; margin: .8mm 0; font-size: 7.2pt; } .nu span { width: 7mm; height: 5mm; border: .2mm solid #999; flex: none; }
.validation { border: .35mm solid #1E2150; padding: 2mm 3mm; margin-top: auto; } .validation b { color: #1E2150; }
.cases { display: grid; grid-template-columns: 1fr 1fr 1.4fr; gap: 3mm; margin-top: 2mm; } .cases span { border-bottom: .25mm solid #999; padding-top: 5mm; font-size: 7pt; color: #666; }
.note { margin: 0; font-size: 6.6pt; color: #666; }
.vivant { flex: 1; display: grid; grid-template-columns: 262mm 1fr; gap: 7mm; min-height: 0; }
.vivant .gauche { gap: 2mm; } .vivant h3 { margin: 0 0 1mm; font-size: 9pt; color: #1E2150; }
.temps-liste { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
.temps { margin: 0; display: flex; flex-direction: column; gap: 1mm; } .temps img { width: 100%; aspect-ratio: 3 / 4; object-fit: cover; object-position: 50% 45%; display: block; }
.temps figcaption { display: grid; font-size: 7.6pt; color: #1E2150; } .temps .zh { color: #666; }
.schema { width: 100%; height: auto; display: block; }
</style>'''

doc = (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Maison MND · Signage technical sheets 3D · {DATE}</title>{CSS}</head><body>'
       + ''.join(page(e) + (page_vivant(e) if e['id'] == 'N10' else '') for e in choisies) + '</body></html>')
chemin = os.path.join(SORTIE, 'Fiches techniques 3D.html')
io.open(chemin, 'w', encoding='utf-8').write(lie_les_unites(doc))
print(f'{len(choisies)} fiches : {chemin}')
