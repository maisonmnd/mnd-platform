# -*- coding: utf-8 -*-
"""LES DEMANDES POUR LICO SIGN, 22-23 octobre 2026.

    python scripts/signaletique/devis.py "<sortie>"     (les rendus dans "<sortie>/Rendus 3D")

« Take the already approved proformas with Lico Sign and add what needs to be
modified and what also needs to be added so we go from MND brand to Maison
MND » (Yéman). Puis, le 23 octobre, une fois vu que la commande était déjà
fabriquée : « The new items that need to be quoted, I want them on a separate
file ». Deux documents, en anglais et en chinois (l'anglais fait foi), A4 paysage :

  1. Demande de PI révisée : les 9 pièces de la PI FINALE, déjà fabriquées, et ce
     qui change sur chacune (ses mots : R1 en deux options, MAISON et le slogan sur
     R3, MAISON et le ɖ sur R4 et R7, la barre cuivre de R5, les autocollants R9),
     puis ce qu'il faut pour finir la commande (épreuve 5, caisses, transport…).
  2. Demande de devis : les nouvelles pièces N1 à N11, les options à motifs et
     leurs compléments, chacun sur sa ligne.

Les colonnes de prix sont vides : Lico Sign les remplit.
"""
import html
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from enseignes import ENSEIGNES  # noqa: E402
from formes import pose_logo  # noqa: E402
from communs import interieur_ou_ext, lie_les_unites  # noqa: E402
from options import OPTIONS  # noqa: E402
import chinois  # noqa: E402

SORTIE = sys.argv[1]
DATE = '22 Oct 2026'
PI = 'PI No. 298039579001027245'
esc = html.escape
PAR_ID = {e['id']: e for e in ENSEIGNES}


def bi(en, zh):
    return f'<span class="en">{en}</span><span class="zh">{esc(zh)}</span>'


def vignette(ident, vue='jour'):
    chemin = f'Rendus 3D/{ident}-{vue}.png'
    if not os.path.exists(os.path.join(SORTIE, chemin)):
        sys.exit(f'rendu absent : {chemin}')
    return f'<img class="vig" src="{chemin}" alt="">'


def taille(e):
    t = (f"Ø {e['w']}" if e['forme'] == 'rond' else f"{e['w']} × {e['h']}") + ' mm'
    return t + (f" × {e['prof']}" if e['prof'] and e['forme'] != 'feuille' else '')


def dehors(e):
    return interieur_ou_ext(e).startswith('Outdoor')


def allume(e):
    return not e['en']['lighting'].startswith(('Non-illuminated', 'None'))


VIDE = '<td class="prix"></td><td class="prix"></td>'

# ══ A · LES LIGNES DE LA PI FINALE, DÉJÀ FABRIQUÉES ═════════════════════
# (référence, ligne de la PI, effet sur le prix en anglais et en chinois)
LIGNES_PI = [
    ('R1', '1', ('Re-quote: option 1 (6 extra letters) and option 2 (+ gold to copper)', '请分别报价：方案 1（加 6 个字母）和方案 2（另加金色改铜色）')),
    ('R3', '2', ('Quote: 2 new printed faces', '请报价：两面新印刷面板')),
    ('R4', '3', ('Re-quote: 6 letters added, 1 letter replaced', '需重新报价：加 6 个字母，换 1 个字母')),
    ('R5', '4', ('Quote: 2 plates reprinted', '请报价：重印 2 块门牌')),
    ('R6', '5', ('Quote: new printed face', '请报价：新印刷面板')),
    ('R7', '6', ('Quote: new face', '请报价：新面板')),
    ('R9', '7', ('Confirm: our final sheet, 11 designs, 12 of each', '请确认：定稿贴纸，11 款，每款 12 个')),
    ('R2', None, ('Quote: new ivory top layer and new copper back layer', '请报价：新的象牙白面层和新的铜色底层')),
    ('R8', None, ('Quote: 2 plates reprinted', '请报价：重印 2 块门牌')),
]


def table_a():
    lignes = []
    for ident, ligne, (effet_en, effet_zh) in LIGNES_PI:
        e = PAR_ID[ident]
        z = chinois.ENSEIGNES[ident]
        qte = e.get('qte') or 1
        q = f'{qte} sheets' if ident == 'R9' else str(qte)
        prix = f"{e['prix']}" + (' / 100 sheets' if ident == 'R9' else '')
        if qte > 1 and ident != 'R9':
            prix = f"{e['prix'] // qte} × {qte} = {e['prix']}"
        ou = f'PI line {ligne}' if ligne else 'PI, unnumbered row'
        lignes.append(f'<tr><td class="ref"><b>{ident}</b><small>{ou}</small></td><td class="img">{vignette(ident)}</td>'
                      f'<td>{bi("<b>" + esc(e["name"]) + "</b>", z["name"])}<small class="t">{esc(taille(e))}</small></td>'
                      f'<td class="num">{q}</td><td class="num">{prix}</td>'
                      f'<td>{bi(esc(e["en"]["change"]), z["change"])}</td><td>{bi("<b>" + esc(effet_en) + "</b>", effet_zh)}</td>{VIDE}</tr>')
    lignes.append(f'<tr><td class="ref"><b>8</b><small>PI line 8</small></td><td class="img"></td><td>{bi("<b>Freight to Guangzhou</b>", "运至广州")}</td>'
                  f'<td class="num">1</td><td class="num">50</td><td>{bi("As on the PI FINALE.", "同最终 PI。")}</td>'
                  f'<td>{bi("<b>Confirm</b>", "请确认")}</td>{VIDE}</tr>')
    lignes.append(f'<tr><td class="ref"><b>9</b><small>PI line 9</small></td><td class="img"></td><td>{bi("<b>Wooden crate packaging</b>", "木箱包装")}</td>'
                  f'<td class="num">1</td><td class="num">50</td><td>{bi("As on the PI FINALE.", "同最终 PI。")}</td>'
                  f'<td>{bi("<b>Confirm</b>", "请确认")}</td>{VIDE}</tr>')
    tete = ('<tr><th>Ref<small>编号</small></th><th>Final result<small>最终效果</small></th><th>Item<small>品名</small></th><th>Qty<small>数量</small></th>'
            '<th>PI price USD<small>原价</small></th><th>What changes for Maison MND<small>修改内容</small></th><th>Effect on price<small>对价格的影响</small></th>'
            '<th>New unit price<small>新单价</small></th><th>New total<small>新总价</small></th></tr>')
    return f'<table class="grille a"><thead>{tete}</thead><tbody>{"".join(lignes)}</tbody></table>'


# ══ B · LES NOUVELLES PIÈCES ════════════════════════════════════════════
def table_b():
    lignes = []
    for e in ENSEIGNES:
        if e['statut'] != 'nouvelle':
            continue
        z = chinois.ENSEIGNES[e['id']]
        lignes.append(f'<tr><td class="ref"><b>{e["id"]}</b><small>sheet {e["id"]}</small></td><td class="img">{vignette(e["id"])}</td>'
                      f'<td>{bi("<b>" + esc(e["name"]) + "</b>", z["name"])}<small class="t">{esc(taille(e))} · {"outdoor IP65" if dehors(e) else "indoor"}</small></td>'
                      f'<td class="num">{(str(e["qte"]) + " sheets") if e["forme"] == "feuille" else 1}</td><td>{bi(esc(e["en"]["lighting"]), z["lighting"])}</td>{VIDE}</tr>')
    tete = ('<tr><th>Ref<small>编号</small></th><th>Final result<small>最终效果</small></th><th>Item<small>品名</small></th><th>Qty<small>数量</small></th>'
            '<th>Lighting (full spec on the sheet)<small>照明（详细见规格书）</small></th><th>Unit price<small>单价</small></th><th>Total<small>总价</small></th></tr>')
    return f'<table class="grille b"><thead>{tete}</thead><tbody>{"".join(lignes)}</tbody></table>'


# ══ C · LES OPTIONS À MOTIFS ════════════════════════════════════════════
def table_c():
    lignes = []
    for o in OPTIONS:
        op = o['option']
        qte = o.get('qte') or 1
        q = f'{qte} sheets' if o['base'] == 'R9' else str(qte)
        lignes.append(f'<tr><td class="ref"><b>{o["id"]}</b><small>on {o["base"]}</small></td><td class="img">{vignette(o["id"])}</td>'
                      f'<td>{bi("<b>" + esc(op["en"]) + "</b>", op["zh"])}</td><td>{bi(esc(op["fab_en"]), op["fab_zh"])}</td>'
                      f'<td class="num">{q}</td>{VIDE}</tr>')
    tete = ('<tr><th>Ref<small>编号</small></th><th>Final result<small>最终效果</small></th><th>The option adds<small>选项内容</small></th>'
            '<th>How it is made<small>制作方法</small></th><th>Qty<small>数量</small></th><th>Extra unit price<small>加价单价</small></th><th>Extra total<small>加价总价</small></th></tr>')
    return f'<table class="grille c"><thead>{tete}</thead><tbody>{"".join(lignes)}</tbody></table>'


# ══ LES COMPLÉMENTS ═════════════════════════════════════════════════════
POUVOIR = ('Power for Benin', '贝宁电源', 'All drivers 220–240 V 50 Hz, plugs type C/E, a 2 m cable from each lit item to its wall box.',
           '所有电源 220–240V 50Hz，C/E 型插头，每个发光件带 2 米电缆到墙上接线盒。')
# Pour la commande : ce qu'il faut pour la finir et l'installer à Cotonou.
COMPLEMENTS_COMMANDE = [
    POUVOIR + ('all lit items',),
    ('Finish samples before production', '生产前的表面样板', 'Photos side by side: your gold, copper electroplating and copper PVD (for R1 option 2, R2 and R5).',
     '并排拍照：贵司的金色、电镀铜色和 PVD 铜色（用于 R1 方案 2、R2 和 R5）。', '1 set'),
    ('Proof 5', '第 5 版打样', 'A full set of proofs of the 9 items with the changes above, to approve before production.', '包含上述修改的 9 件物品全套打样，生产前由我们确认。', '1 set'),
    ('Photos and video before packing', '包装前照片和视频', 'Every finished item photographed by day and filmed lit, before it goes into its crate.', '每件成品包装前拍白天照片并拍点亮的视频。', 'per item'),
    ('Labelled crates', '木箱标注', 'Each piece labelled with its reference (R1 to R9) and a packing list per crate.', '每件标注编号（R1 至 R9），每个木箱附装箱单。', 'per crate'),
    ('Shipping to Cotonou', '运至科托努', 'Please quote three ways: EXW Guangzhou as before; sea freight to the Port of Cotonou (CFR); air freight to Cotonou (COO). Give the volume and weight of each crate.',
     '请报三种方式：广州 EXW（同前）；海运至科托努港（CFR）；空运至科托努（COO）。请注明每个木箱的体积和重量。', '3 options'),
    ('Mounting kits and templates', '安装配件和模板', 'Anchors for concrete and hollow-block walls, stainless screws, and a 1:1 paper drilling template for every wall-mounted item.',
     '混凝土墙和空心砖墙用的膨胀螺丝、不锈钢螺丝，以及每个墙装件的 1:1 纸质钻孔模板。', 'per item'),
    ('Installation guide', '安装指导', 'A written guide with wiring diagrams for each lit item, and one video call with your engineer. No travel.', '每个发光件的书面安装指南和接线图，加一次与工程师的视频通话。不需要上门。', '1 set'),
    ('Warranty', '质保', 'Please confirm the 2 years cover the LED modules and the drivers.', '请确认 2 年质保包含 LED 模组和电源。', 'confirm'),
]
DEHORS_NEUFS = ', '.join(e['id'] for e in ENSEIGNES if e['statut'] == 'nouvelle' and dehors(e))
ALLUMES_DEHORS = ', '.join(e['id'] for e in ENSEIGNES if e['statut'] == 'nouvelle' and dehors(e) and allume(e))
# Pour les nouvelles pièces : ce qui ne vaut que pour elles ; le reste suit la commande.
COMPLEMENTS_NEUFS = [
    POUVOIR + ('all lit items',),
    ('Spare parts', '备件', 'One spare Mean Well driver per model used, two spare LED modules per lit item type, 10 spare stand-off studs.', '每种型号多配一个明纬电源，每类发光件多配两个 LED 模组，多配 10 个支架螺丝。', '1 set'),
    ('Timers for the outdoor signs', '户外招牌定时器', f'A 7-day digital timer for each outdoor lit item ({ALLUMES_DEHORS}): on at dusk, off at closing time.',
     f'每个户外发光件（{ALLUMES_DEHORS}）配一个 7 天数字定时器：天黑自动开，关店自动关。', 'per item'),
    ('N10 electronics', 'N10 电子部分', 'If not included in N10: RGBW addressable controller with phone app, motion sensor, NFC tag written and tested, the scenes programmed (sheet N10, page 2).',
     '如 N10 报价未包含：RGBW 可编程控制器和手机应用、人体感应器、写好并测试的 NFC 标签、编好的场景（见 N10 第 2 页）。', '1 set'),
    ('Proof, photos, crates, shipping, warranty', '打样、照片、木箱、运输、质保', 'As in our revision request for the order: please include the new items you quote, labelled N1 to N11 (and -M for the options).',
     '同我们订单的修改请求：请把报价的新品一并列入，编号 N1 至 N11（选项加 -M）。', 'same'),
]


def table_d(complements):
    lignes = ''.join(f'<tr><td class="ref"><b>D{k}</b></td><td>{bi("<b>" + esc(t) + "</b>", tz)}</td><td>{bi(esc(d), dz)}</td><td class="num">{esc(q)}</td>{VIDE}</tr>'
                     for k, (t, tz, d, dz, q) in enumerate(complements, 1))
    tete = ('<tr><th>Ref<small>编号</small></th><th>Add-on<small>附加项目</small></th><th>What we need<small>需求</small></th><th>Qty<small>数量</small></th>'
            '<th>Unit price<small>单价</small></th><th>Total<small>总价</small></th></tr>')
    return f'<table class="grille d"><thead>{tete}</thead><tbody>{lignes}</tbody></table>'


QUESTIONS_COMMANDE = [
    ('Please send a revised PI with each line of table A and each add-on (D) as separate lines; for R1, both options.',
     '请发来修改后的 PI：表 A 的每一行和每个附加项目（D）分别列行；R1 请报两个方案。'),
    ('If a change cannot be made on an item already made, please tell us what you suggest.', '如某件已制作的物品无法按要求修改，请告诉我们您的建议。'),
    ('How many working days after our approval of proof 5?', '我们确认第 5 版打样后需要多少个工作日？'),
    ('Payment terms: are they the same as the PI FINALE (50% deposit, balance before shipment)?', '付款条件是否与最终 PI 相同（预付 50%，发货前付清余款）？'),
    ('R3 hangs outdoors: please confirm it is IP65.', 'R3 安装在户外：请确认达到 IP65。'),
]
QUESTIONS_NEUFS = [
    ('Please quote each new item (B), each option (C) and each add-on (D) as a separate line, so we can choose.', '请对每件新品（B）、每个选项（C）和每个附加项目（D）分别列行报价，方便我们选择。'),
    ('If a line cannot be made as drawn, leave it empty and tell us what you suggest.', '如某一行无法按图制作，请留空并告诉我们您的建议。'),
    ('How many working days for each item? How long for N10 and N11?', '每件需要多少个工作日？N10 和 N11 需要多久？'),
    ('Payment terms: the same as the PI FINALE (50% deposit, balance before shipment)?', '付款条件是否与最终 PI 相同（预付 50%，发货前付清余款）？'),
    (f'Outdoor items must be IP65: {DEHORS_NEUFS}. Please confirm.', f'户外物品须达到 IP65：{DEHORS_NEUFS}。请确认。'),
]

CSS = '''<style>
@page { size: A4 landscape; margin: 9mm 10mm 11mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 7.6pt/1.3 Arial, "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif; color: #222; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.bandeau { display: flex; align-items: center; gap: 6mm; background: #1E2150; color: #F6F1E7; padding: 4mm 5mm; }
.bandeau svg { height: 9mm; width: auto; flex: none; }
.bandeau .t { flex: 1; display: grid; gap: .6mm; font-size: 9pt; } .bandeau .t b { font-size: 11.5pt; letter-spacing: .02em; } .bandeau .zh { color: #E2AC7C; }
.bandeau .d { font-size: 8pt; text-align: right; color: #E2AC7C; }
h2 { font-size: 10.5pt; color: #1E2150; margin: 5mm 0 2mm; break-after: avoid; display: flex; gap: 3mm; align-items: baseline; }
h2 .zh { font-size: 9pt; font-weight: normal; color: #666; }
.intro { display: grid; grid-template-columns: 1.1fr 1fr; gap: 6mm; margin-top: 4mm; }
.intro p { margin: 0 0 1.6mm; } .intro .zh { display: block; color: #666; margin-top: .4mm; }
.regles { margin: 0; padding: 0; list-style: none; display: grid; gap: 1.2mm; } .regles li { border-left: .8mm solid #B97A4A; padding-left: 2mm; }
.regles .zh { display: block; color: #666; }
table.grille { border-collapse: collapse; width: 100%; }
.grille th { text-align: left; vertical-align: bottom; background: #F3EEE5; color: #1E2150; font-weight: bold; padding: 1.4mm 1.6mm; border-bottom: .35mm solid #1E2150; }
.grille th small { display: block; font-weight: normal; color: #777; }
.grille td { vertical-align: top; padding: 1.4mm 1.6mm; border-bottom: .2mm solid #ddd; }
.grille tr { break-inside: avoid; }
.grille td .en, .grille td .zh { display: block; } .grille td .zh { color: #666; margin-top: .4mm; }
.grille td small.t { display: block; color: #1E2150; margin-top: .6mm; }
.ref { width: 15mm; } .ref small { display: block; color: #777; }
.img { width: 30mm; } .vig { width: 28mm; height: 17.5mm; object-fit: cover; display: block; border: .2mm solid #ddd; }
.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.prix { width: 21mm; background: repeating-linear-gradient(0deg, transparent 0 4.5mm, #e6e1d8 4.5mm 4.7mm); border-left: .2mm solid #ddd; }
.a td:nth-child(3) { width: 48mm; } .a td:nth-child(6) { width: 78mm; } .a td:nth-child(7) { width: 38mm; }
.b td:nth-child(3) { width: 70mm; } .c td:nth-child(3) { width: 62mm; } .d td:nth-child(2) { width: 46mm; }
.questions { margin: 0; padding-left: 5mm; display: grid; gap: 1mm; } .questions .zh { display: block; color: #666; }
.fin { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 3mm; break-inside: avoid; }
.recap { border-collapse: collapse; width: 100%; } .recap td { padding: 1.3mm 2mm; border-bottom: .2mm solid #ccc; } .recap td.v { width: 40mm; border-left: .2mm solid #ccc; }
.recap tr:last-child td { border-top: .4mm solid #1E2150; font-weight: bold; } .recap .zh { color: #666; margin-left: 2mm; }
.signe { border: .35mm solid #1E2150; padding: 3mm 4mm; display: grid; gap: 2mm; align-content: start; }
.signe .cases { display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: 3mm; } .signe .cases span { border-bottom: .25mm solid #999; padding-top: 6mm; font-size: 7pt; color: #666; }
.note { color: #666; font-size: 6.8pt; margin-top: 2mm; }
</style>'''

NOTE = ('<p class="note">Yéman Boya · Maison MND · Cotonou, Benin · WhatsApp +229 01 51 99 77 99 · maisonmnd.com. 3D renders are computed from the production files; '
        'screen colours are indicative. English prevails in case of doubt. 三维效果图由生产文件计算生成，屏幕颜色仅供参考。如有歧义，以英文为准。</p>')
LOGO_REGLE = ('<li><b>New logo, never redrawn:</b> pictogram, MAISON, MND, exactly as in our files; the official logo files are attached.'
              '<span class="zh">新标志，不得重绘：图形、MAISON、MND，完全按文件；附官方标志文件。</span></li>')
DEVISE_REGLE = ('<li><b>Our motto “mi nyɔ́ ɖɛkpɛ · votre beauté est déjà là”:</b> the Fon letters ɔ ɖ ɛ and the accent are outlined in the files; please do not retype them. '
                'The ɖ has a tail that goes down below the line.<span class="zh">我们的格言：Fon 语字母 ɔ ɖ ɛ 和声调符号已在文件中转曲，请勿重新输入。ɖ 的尾部延伸到基线以下。</span></li>')


def bandeau(titre, sous_en, sous_zh):
    logo, _w, _h = pose_logo('verrou-couche', 0, 0, largeur=320, couleur='#F6F1E7')
    return (f'<div class="bandeau"><svg viewBox="0 0 320 {_h:.1f}">{logo}</svg>'
            f'<div class="t"><b>{titre}</b><span>{sous_en}</span><span class="zh">{sous_zh}</span></div>'
            f'<div class="d">{DATE}<br>Maison MND · Cotonou, Benin</div></div>')


def fin(recap, questions, signe):
    r = ''.join(f'<tr><td>{esc(en)}<span class="zh">{esc(zh)}</span></td><td class="v"></td></tr>' for en, zh in recap)
    q = ''.join(f'<li>{esc(en)}<span class="zh">{esc(zh)}</span></li>' for en, zh in questions)
    return (f'<div class="fin"><div><h2>Summary to fill in <span class="zh">请填写汇总（美元）</span></h2><table class="recap">{r}</table>{NOTE}</div>'
            f'<div><h2>Our questions <span class="zh">我们的问题</span></h2><ol class="questions">{q}</ol>'
            f'<div class="signe"><b>{signe}</b><div class="cases"><span>Name · 姓名</span><span>Date · 日期</span><span>Signature · 签名</span></div></div></div></div>')


def page(titre, corps):
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{titre}</title>{CSS}</head>'
            f'<body>{corps}</body></html>')


def commande():
    intro = f'''<div class="intro"><div>
<p>Hello Connie, thank you for the PI FINALE of 4 May 2026 (2,140 USD EXW) and for the photos and videos of the production. Our brand is now <b>Maison MND</b>. The 9 items are already made: please change only what is written below, and keep everything else as made. The new items we would like you to quote are in a separate request.<span class="zh">Connie 您好，感谢 2026 年 5 月 4 日的最终 PI（2,140 美元 EXW）以及生产的照片和视频。我们的品牌现在是 Maison MND。9 件物品已经制作完成：请只修改下面写明的内容，其余保持原样。需要报价的新品另附一份请求。</span></p>
<p>Every item has its own technical sheet with the 3D renders (attached PDF) and its 1:1 vector file. The renders show the final look in copper and indigo; for the items already made, the table below comes first.<span class="zh">每件物品都有规格书，含三维效果图（附 PDF），以及 1:1 矢量文件。效果图显示铜色和靛蓝的最终效果；对已制作的物品，以下表为准。</span></p>
</div><ul class="regles">
{LOGO_REGLE}
<li><b>MAISON goes between the pictogram and MND;</b> the rest of the logo stays where it is.<span class="zh">MAISON 放在图形和 MND 之间；标志其余部分位置不变。</span></li>
{DEVISE_REGLE}
<li><b>Colours:</b> the items keep their gold and black, except R1 option 2 (gold to copper), R2 (ivory and copper) and R5 (indigo and copper).<span class="zh">颜色：各件保留原有金色和黑色，R1 方案 2（金色改铜色）、R2（象牙白和铜色）和 R5（靛蓝和铜色）除外。</span></li>
</ul></div>'''
    recap = [('A · Ordered items, revised', 'A · 订购物品（修改后）'), ('D · Add-ons', 'D · 附加项目'), ('Shipping (D6)', '运费（D6）'), ('Grand total', '总计')]
    corps = (bandeau(f'Revision request · {PI}', 'The 9 items already made: what changes for Maison MND, and what we need to finish the order',
                     '修改请求：已制作的 9 件物品，Maison MND 的修改内容，以及完成订单所需的项目')
             + intro
             + '<h2>A · The 9 items ordered on the PI FINALE <span class="zh">A · 最终 PI 上订购的 9 件物品</span></h2>' + table_a()
             + '<h2>D · Add-ons to finish the order <span class="zh">D · 完成订单所需的附加项目</span></h2>' + table_d(COMPLEMENTS_COMMANDE)
             + fin(recap, QUESTIONS_COMMANDE, 'Revised PI accepted · 修改后的 PI 确认'))
    return page(f'Maison MND · Revision request · {PI} · {DATE}', corps)


def neufs():
    intro = f'''<div class="intro"><div>
<p>Hello Connie, alongside the revision of our order, we would like your price for these new items and pattern options. Please quote each one as a separate line, so we can choose.<span class="zh">Connie 您好，在修改订单的同时，我们想请您为这些新品和图案选项报价。请每项单独列行，方便我们选择。</span></p>
<p>Every item and every option has its own technical sheet with the 3D renders, the layers and the colours (attached PDF), and its 1:1 vector file.<span class="zh">每件新品和每个选项都有规格书，含三维效果图、结构层次和颜色（附 PDF），以及 1:1 矢量文件。</span></p>
</div><ul class="regles">
{LOGO_REGLE}
<li><b>Copper #B97A4A and indigo #1E2150</b> on the new items; no gold, no black.<span class="zh">新品用铜色 #B97A4A 和靛蓝 #1E2150；不用金色，不用黑色。</span></li>
<li><b>Warm white 3000 K</b> on every lit item.<span class="zh">所有发光件用 3000K 暖白光。</span></li>
{DEVISE_REGLE}
<li><b>Our two patterns:</b> the allover (our pictogram repeated) and the medallion (four pictograms turned a quarter turn). Used on the options, on N10 and N11.<span class="zh">两种品牌图案：满版图案（重复的图形）和圆章（四个图形各转 90 度组成）。用于选项、N10 和 N11。</span></li>
</ul></div>'''
    recap = [('B · New items', 'B · 新品'), ('C · Options we choose', 'C · 选定的选项'), ('D · Add-ons', 'D · 附加项目'), ('Grand total', '总计')]
    corps = (bandeau('Quotation request · new items', 'New signs and pattern options for Maison MND, each as a separate line',
                     '报价请求：Maison MND 的新招牌和图案选项，每项单独列行')
             + intro
             + '<h2>B · New items, please quote <span class="zh">B · 新品，请报价</span></h2>' + table_b()
             + '<h2>C · Pattern options, each an extra over its item <span class="zh">C · 图案选项，在对应物品基础上加价</span></h2>' + table_c()
             + '<h2>D · Add-ons for the new items <span class="zh">D · 新品的附加项目</span></h2>' + table_d(COMPLEMENTS_NEUFS)
             + fin(recap, QUESTIONS_NEUFS, 'Quotation accepted · 报价确认'))
    return page(f'Maison MND · Quotation request · new items · {DATE}', corps)


for nom, doc in (('Demande de PI révisée.html', commande()), ('Demande de devis · nouvelles pièces.html', neufs())):
    chemin = os.path.join(SORTIE, nom)
    io.open(chemin, 'w', encoding='utf-8').write(lie_les_unites(doc))
    print(f'demande écrite : {chemin}')
