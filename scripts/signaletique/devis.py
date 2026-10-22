# -*- coding: utf-8 -*-
"""LA DEMANDE DE PI RÉVISÉE POUR LICO SIGN, 22 octobre 2026.

    python scripts/signaletique/devis.py "<sortie>"     (les rendus dans "<sortie>/Rendus 3D")

« Take the already approved proformas with Lico Sign and add what needs to be
modified and what also needs to be added so we go from MND brand to Maison
MND. Show all the add ons to get final results so they can make final quote
and adjustments » (Yéman). Un seul document, en anglais et en chinois
(l'anglais fait foi), A4 paysage :
  A · les lignes de la PI FINALE, chacune avec ce qui change et son effet sur le prix ;
  B · les nouvelles pièces, N1 à N11 ;
  C · les options à motifs, chacune en supplément de sa base ;
  D · les compléments sans lesquels le résultat final ne marche pas à Cotonou ;
puis nos questions et le récapitulatif. Les colonnes de prix sont vides : Lico
Sign les remplit et renvoie la PI révisée.
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


VIDE = '<td class="prix"></td><td class="prix"></td>'

# ══ A · LES LIGNES DE LA PI FINALE ══════════════════════════════════════
# (référence, ligne de la PI, effet sur le prix en anglais et en chinois)
LIGNES_PI = [
    ('R1', '1', ('Re-quote: 9 letters instead of 3', '需重新报价：字母由 3 个改为 9 个')),
    ('R3', '2', ('Confirm: same box, new print, 3000 K', '请确认：灯箱不变，新印刷，3000K')),
    ('R4', '3', ('Re-quote: the full motto adds letters', '需重新报价：完整格言增加文字')),
    ('R5', '4', ('Confirm: colours only', '请确认：仅改颜色')),
    ('R6', '5', ('Confirm: same box, new print', '请确认：灯箱不变，新印刷')),
    ('R7', '6', ('Confirm or re-quote: the full motto adds cut-outs', '请确认或重新报价：完整格言增加镂空')),
    ('R9', '7', ('Confirm: 15 new designs, same sheet', '请确认：15 款新图案，版面不变')),
    ('R2', None, ('Confirm: same plate, new artwork', '请确认：牌子不变，新图案')),
    ('R8', None, ('Re-quote: a French line under each name, pictogram on KÒKÒ', '需重新报价：每个名称下加一行法语，KÒKÒ 加图形')),
]


def table_a():
    lignes = []
    for ident, ligne, (effet_en, effet_zh) in LIGNES_PI:
        e = PAR_ID[ident]
        z = chinois.ENSEIGNES[ident]
        qte = e.get('qte') or 1
        q = f'{qte} sheets' if ident == 'R9' else str(qte)
        prix = f"{e['prix']}" + (' / 100 sheets' if ident == 'R9' else f" × {qte} = {e['prix']}" if qte > 1 else '')
        if qte > 1 and ident != 'R9':
            prix = f"{e['prix'] // qte} × {qte} = {e['prix']}"
        ou = f'PI line {ligne}' if ligne else 'PI, unnumbered row'
        lignes.append(f'<tr><td class="ref"><b>{ident}</b><small>{ou}</small></td><td class="img">{vignette(ident)}</td>'
                      f'<td>{bi("<b>" + esc(e["name"]) + "</b>", z["name"])}<small class="t">{esc(taille(e))}</small></td>'
                      f'<td class="num">{q}</td><td class="num">{prix}</td>'
                      f'<td>{bi(esc(e["en"]["change"]), z["change"])}</td><td>{bi("<b>" + esc(effet_en) + "</b>", effet_zh)}</td>{VIDE}</tr>')
    lignes.append(f'<tr><td class="ref"><b>8</b><small>PI line 8</small></td><td class="img"></td><td>{bi("<b>Freight to Guangzhou</b>", "运至广州")}</td>'
                  f'<td class="num">1</td><td class="num">50</td><td>{bi("New items and options add volume.", "新品和选项会增加体积。")}</td>'
                  f'<td>{bi("<b>Confirm with the final list</b>", "按最终清单确认")}</td>{VIDE}</tr>')
    lignes.append(f'<tr><td class="ref"><b>9</b><small>PI line 9</small></td><td class="img"></td><td>{bi("<b>Wooden crate packaging</b>", "木箱包装")}</td>'
                  f'<td class="num">1</td><td class="num">50</td><td>{bi("More crates for N1, N5 and N10.", "N1、N5 和 N10 需要更多木箱。")}</td>'
                  f'<td>{bi("<b>Confirm with the final list</b>", "按最终清单确认")}</td>{VIDE}</tr>')
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
        dehors = interieur_ou_ext(e).startswith('Outdoor')
        lignes.append(f'<tr><td class="ref"><b>{e["id"]}</b><small>sheet {e["id"]}</small></td><td class="img">{vignette(e["id"])}</td>'
                      f'<td>{bi("<b>" + esc(e["name"]) + "</b>", z["name"])}<small class="t">{esc(taille(e))} · {"outdoor IP65" if dehors else "indoor"}</small></td>'
                      f'<td class="num">1</td><td>{bi(esc(e["en"]["lighting"]), z["lighting"])}</td>{VIDE}</tr>')
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


# ══ D · LES COMPLÉMENTS ═════════════════════════════════════════════════
DEHORS = ', '.join(e['id'] for e in ENSEIGNES if interieur_ou_ext(e).startswith('Outdoor') and e['id'] != 'R1')
COMPLEMENTS = [
    ('D1', 'Power for Benin', '贝宁电源', 'All drivers 220–240 V 50 Hz, plugs type C/E, a 2 m cable from each lit item to its wall box.', '所有电源 220–240V 50Hz，C/E 型插头，每个发光件带 2 米电缆到墙上接线盒。', 'all lit items'),
    ('D2', 'Spare parts', '备件', 'One spare Mean Well driver per model used, two spare LED modules per lit item type, 10 spare stand-off studs.', '每种型号多配一个明纬电源，每类发光件多配两个 LED 模组，多配 10 个支架螺丝。', '1 set'),
    ('D3', 'Timers for the outdoor signs', '户外招牌定时器', f'A 7-day digital timer for each outdoor lit item ({DEHORS}): on at dusk, off at closing time.', f'每个户外发光件（{DEHORS}）配一个 7 天数字定时器：天黑自动开，关店自动关。', 'per item'),
    ('D4', 'N10 electronics', 'N10 电子部分', 'If not included in N10: RGBW addressable controller with phone app, motion sensor, NFC tag written and tested, the scenes programmed (sheet N10, page 2).',
     '如 N10 报价未包含：RGBW 可编程控制器和手机应用、人体感应器、写好并测试的 NFC 标签、编好的场景（见 N10 第 2 页）。', '1 set'),
    ('D5', 'Mounting kits and templates', '安装配件和模板', 'Anchors for concrete and hollow-block walls, stainless screws, and a 1:1 paper drilling template for every wall-mounted item.',
     '混凝土墙和空心砖墙用的膨胀螺丝、不锈钢螺丝，以及每个墙装件的 1:1 纸质钻孔模板。', 'per item'),
    ('D6', 'Finish samples before production', '生产前的表面样板', 'Photos side by side: copper electroplating, copper PVD, mirror copper acrylic, indigo paint next to #1E2150, ivory, sand, and the light indigo #2C3070 print.',
     '并排拍照：电镀铜色、PVD 铜色、铜色镜面亚克力、靛蓝烤漆与 #1E2150 对比、象牙白、沙色、浅靛蓝 #2C3070 印刷。', '1 set'),
    ('D7', 'Proof 5', '第 5 版打样', 'A full set of proofs with every item and every option we choose, to approve before production.', '包含所有选定物品和选项的全套打样，生产前由我们确认。', '1 set'),
    ('D8', 'Photos and video before packing', '包装前照片和视频', 'Every finished item photographed by day and filmed lit, before it goes into its crate.', '每件成品包装前拍白天照片并拍点亮的视频。', 'per item'),
    ('D9', 'Labelled crates', '木箱标注', 'Each piece labelled with its reference (R1 to N11, and -M for the options) and a packing list per crate.', '每件标注编号（R1 至 N11，选项加 -M），每个木箱附装箱单。', 'per crate'),
    ('D10', 'Shipping to Cotonou', '运至科托努', 'Please quote three ways: EXW Guangzhou as before; sea freight to the Port of Cotonou (CFR); air freight to Cotonou (COO). Give the volume and weight of each crate.',
     '请报三种方式：广州 EXW（同前）；海运至科托努港（CFR）；空运至科托努（COO）。请注明每个木箱的体积和重量。', '3 options'),
    ('D11', 'Installation guide', '安装指导', 'A written guide with wiring diagrams for each lit item, and one video call with your engineer. No travel.', '每个发光件的书面安装指南和接线图，加一次与工程师的视频通话。不需要上门。', '1 set'),
    ('D12', 'Warranty', '质保', 'Please confirm the 2 years cover the LED modules, the drivers and the N10 controller.', '请确认 2 年质保包含 LED 模组、电源和 N10 控制器。', 'confirm'),
]


def table_d():
    lignes = ''.join(f'<tr><td class="ref"><b>{r}</b></td><td>{bi("<b>" + esc(t) + "</b>", tz)}</td><td>{bi(esc(d), dz)}</td><td class="num">{esc(q)}</td>{VIDE}</tr>'
                     for r, t, tz, d, dz, q in COMPLEMENTS)
    tete = ('<tr><th>Ref<small>编号</small></th><th>Add-on<small>附加项目</small></th><th>What we need<small>需求</small></th><th>Qty<small>数量</small></th>'
            '<th>Unit price<small>单价</small></th><th>Total<small>总价</small></th></tr>')
    return f'<table class="grille d"><thead>{tete}</thead><tbody>{lignes}</tbody></table>'


QUESTIONS = [
    ('Please send a revised PI with the ordered items (table A), each new item (B), each option (C) and each add-on (D) as separate lines, so we can choose.',
     '请发来修改后的 PI：订购物品（表 A）、每件新品（B）、每个选项（C）和每个附加项目（D）分别列行，方便我们选择。'),
    ('If a line cannot be made as drawn, leave it empty and tell us what you suggest.', '如某一行无法按图制作，请留空并告诉我们您的建议。'),
    ('Do the 20 working days of production start from our approval of proof 5? How long for N10?', '20 个工作日的生产期是否从我们确认第 5 版打样开始？N10 需要多久？'),
    ('Payment terms: are they the same as the PI FINALE (50% deposit, balance before shipment)?', '付款条件是否与最终 PI 相同（预付 50%，发货前付清余款）？'),
    (f'Outdoor items must be IP65: {DEHORS}. Please confirm.', f'户外物品须达到 IP65：{DEHORS}。请确认。'),
]

RECAP = [('A · Ordered items, revised', 'A · 订购物品（修改后）'), ('B · New items', 'B · 新品'), ('C · Options we choose', 'C · 选定的选项'),
         ('D · Add-ons', 'D · 附加项目'), ('Shipping (D10)', '运费（D10）'), ('Grand total', '总计')]

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
.a td:nth-child(3) { width: 48mm; } .a td:nth-child(6) { width: 70mm; } .a td:nth-child(7) { width: 38mm; }
.b td:nth-child(3) { width: 70mm; } .c td:nth-child(3) { width: 62mm; } .d td:nth-child(2) { width: 46mm; }
.questions { margin: 0; padding-left: 5mm; display: grid; gap: 1mm; } .questions .zh { display: block; color: #666; }
.fin { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 3mm; break-inside: avoid; }
.recap { border-collapse: collapse; width: 100%; } .recap td { padding: 1.3mm 2mm; border-bottom: .2mm solid #ccc; } .recap td.v { width: 40mm; border-left: .2mm solid #ccc; }
.recap tr:last-child td { border-top: .4mm solid #1E2150; font-weight: bold; } .recap .zh { color: #666; margin-left: 2mm; }
.signe { border: .35mm solid #1E2150; padding: 3mm 4mm; display: grid; gap: 2mm; align-content: start; }
.signe .cases { display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: 3mm; } .signe .cases span { border-bottom: .25mm solid #999; padding-top: 6mm; font-size: 7pt; color: #666; }
.note { color: #666; font-size: 6.8pt; margin-top: 2mm; }
</style>'''


def document():
    logo, _w, _h = pose_logo('verrou-couche', 0, 0, largeur=320, couleur='#F6F1E7')
    bandeau = (f'<div class="bandeau"><svg viewBox="0 0 320 {_h:.1f}">{logo}</svg>'
               f'<div class="t"><b>Revision request · {PI}</b><span>From MND to Maison MND: what changes, what is added, and all the add-ons for the final result</span>'
               f'<span class="zh">修改请求：从 MND 到 Maison MND，修改内容、新增内容和全部附加项目</span></div>'
               f'<div class="d">{DATE}<br>Maison MND · Cotonou, Benin</div></div>')
    intro = f'''<div class="intro"><div>
<p>Hello Connie, thank you again for the PI FINALE of 4 May 2026 (2,140 USD EXW) and proof 4. Our brand is now <b>Maison MND</b>, with a new logo and two house patterns. Before production, please update the 9 items we ordered, quote the new items and the pattern options, and the add-ons we need to install everything in Cotonou.<span class="zh">Connie 您好，再次感谢 2026 年 5 月 4 日的最终 PI（2,140 美元 EXW）和第 4 版打样。我们的品牌现在是 Maison MND，有新标志和两种品牌图案。生产前，请更新我们订购的 9 件物品，并对新品、图案选项以及在科托努安装所需的附加项目报价。</span></p>
<p>Every item has its own technical sheet with the 3D renders, the layers and the colours (attached PDF, one A3 page per item and per option), and its 1:1 vector file.<span class="zh">每件物品都有规格书，含三维效果图、结构层次和颜色（附 PDF，每件物品和每个选项一页 A3），以及 1:1 矢量文件。</span></p>
</div><ul class="regles">
<li><b>New logo, never redrawn:</b> pictogram, MAISON, MND, exactly as in our files.<span class="zh">新标志，不得重绘：图形、MAISON、MND，完全按文件。</span></li>
<li><b>Gold becomes copper #B97A4A, black becomes indigo #1E2150.</b><span class="zh">金色改为铜色 #B97A4A，黑色改为靛蓝 #1E2150。</span></li>
<li><b>Warm white 3000 K</b> instead of 4500 K, on every lit item.<span class="zh">所有发光件用 3000K 暖白光，替代 4500K。</span></li>
<li><b>Our motto “mi nyɔ́ ɖɛkpɛ · votre beauté est déjà là”:</b> the Fon letters ɔ ɖ ɛ and the accent are outlined in the files; please do not retype them.<span class="zh">我们的格言：Fon 语字母 ɔ ɖ ɛ 和声调符号已在文件中转曲，请勿重新输入。</span></li>
<li><b>Our two patterns:</b> the allover (our pictogram repeated) and the medallion (four pictograms turned a quarter turn). Used on the options and on N10.<span class="zh">两种品牌图案：满版图案（重复的图形）和圆章（四个图形各转 90 度组成）。用于选项和 N10。</span></li>
</ul></div>'''
    q = ''.join(f'<li>{esc(en)}<span class="zh">{esc(zh)}</span></li>' for en, zh in QUESTIONS)
    recap = ''.join(f'<tr><td>{esc(en)}<span class="zh">{esc(zh)}</span></td><td class="v"></td></tr>' for en, zh in RECAP)
    fin = f'''<div class="fin"><div><h2>Summary to fill in <span class="zh">请填写汇总（美元）</span></h2><table class="recap">{recap}</table><p class="note">Yéman Boya · Maison MND · Cotonou, Benin · WhatsApp +229 01 51 99 77 99 · maisonmnd.com. 3D renders are computed from the production files; screen colours are indicative. English prevails in case of doubt. 三维效果图由生产文件计算生成，屏幕颜色仅供参考。如有歧义，以英文为准。</p></div>
<div><h2>Our questions <span class="zh">我们的问题</span></h2><ol class="questions">{q}</ol>
<div class="signe"><b>Revised PI accepted · 修改后的 PI 确认</b><div class="cases"><span>Name · 姓名</span><span>Date · 日期</span><span>Signature · 签名</span></div></div></div></div>
'''
    corps = (bandeau + intro
             + '<h2>A · The 9 items ordered on the PI FINALE <span class="zh">A · 最终 PI 上订购的 9 件物品</span></h2>' + table_a()
             + '<h2>B · New items, please quote <span class="zh">B · 新品，请报价</span></h2>' + table_b()
             + '<h2>C · Pattern options, each an extra over its item <span class="zh">C · 图案选项，在对应物品基础上加价</span></h2>' + table_c()
             + '<h2>D · Add-ons for the final result in Cotonou <span class="zh">D · 在科托努完成最终效果所需的附加项目</span></h2>' + table_d()
             + fin)
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Maison MND · Revision request · {PI} · {DATE}</title>{CSS}</head>'
            f'<body>{corps}</body></html>')


chemin = os.path.join(SORTIE, 'Demande de PI révisée.html')
io.open(chemin, 'w', encoding='utf-8').write(lie_les_unites(document()))
print(f'demande écrite : {chemin}')
