# -*- coding: utf-8 -*-
"""LES OPTIONS À MOTIFS, 22 octobre 2026.

« Renderings now with the patterns » (Yéman). Choix au sélecteur : chaque
enseigne garde sa version de base et reçoit une OPTION à motif, chiffrée à
part par Lico Sign ; les murs des rendus portent aussi l'allover. Elle a
ensuite demandé de ne garder que les options sobres : dix restent (ton sur ton,
petits médaillons, une seule couronne), les huit plus chargées sont écartées.
R9-M a disparu le même jour : les nouveaux autocollants portent déjà les motifs.

Une option est une enseigne à part entière : son dessin (celui de la base,
plus le motif posé depuis le tracé officiel du pictogramme, jamais
redessiné), sa recette de volume, et ce qu'elle ajoute en français, en
anglais et en chinois. Son identifiant est celui de la base suivi de « -M ».
"""
import xml.etree.ElementTree as ET

from enseignes import ENSEIGNES, DEVISE_FON, DEVISE_FR, C, I, S, H_N1, H_R1, ajuste, n1, n5, n7, n8, plaque_atelier, r1, r4, r5
from formes import texte
from motifs import allover, grille, medaillon, pictogramme

TON = '#2C3070'       # l'indigo un ton plus clair : le ton sur ton de l'indigo, lisible de loin


def elements(svg):
    racine = ET.fromstring(f'<svg>{svg}</svg>')
    return [ET.tostring(el, encoding='unicode') for el in racine]


def decale(svg, dx, dy):
    """Chaque élément de premier niveau glissé de (dx, dy) : ils restent des morceaux distincts."""
    return ''.join(f'<g transform="translate({dx:.2f} {dy:.2f})">{el}</g>' for el in elements(svg))


# ══ LES DESSINS ═════════════════════════════════════════════════════════
R1M_W, R1M_H = 1400, 1650
N1M_W, N1M_H = 3400, round(H_N1) + 360


def r1m(a):
    pts = grille(0, 0, R1M_W, R1M_H, 90, 150, 130, marge=30)
    return (f'<rect width="{R1M_W}" height="{R1M_H}" fill="{I}"/>' + allover(pts, 90, TON)
            + decale(r1(a), (R1M_W - 1000) / 2, (R1M_H - round(H_R1)) / 2))






def r4m(a):
    pts = grille(0, 0, 1050, 1600, 70, 105, 92, marge=24, exclure=[(105, 125, 840, 1350)])
    return r4(a) + allover(pts, 70, S)


def r5m(a):
    return r5(a) + '<g>' + ''.join(pictogramme(13 + i * 34, 326, 22, C) for i in range(4)) + '</g>'






def r8m(a, rang=0):
    return plaque_atelier(a, rang) + medaillon(528, 80, 52, a.metal(C))




def n1m(a):
    pts = grille(0, 0, N1M_W, N1M_H, 120, 180, 156, marge=20)
    return f'<rect width="{N1M_W}" height="{N1M_H}" fill="{I}"/>' + allover(pts, 120, TON) + decale(n1(a), 200, 180)








def n5m(a):
    pts = grille(0, 0, 3000, 600, 100, 150, 130, marge=15)
    return n5(a) + allover(pts, 100, TON)


N6M_H, N6M_DY = 650, 220


def n6m(a):
    neon = '#FFF3DC' if a.rendu else C
    out = [f'<rect width="1200" height="{N6M_H}" rx="34" fill="{"#FFFFFF" if not a.rendu else "rgba(255,255,255,.07)"}" stroke="{"#9AA0A6" if not a.rendu else "rgba(255,255,255,.25)"}" stroke-width="{1 if not a.rendu else 2}"/>',
           pictogramme(600 - 105, 40, 210, neon, attrs='data-couche="neon"')]
    t1 = ajuste(DEVISE_FON, 'fon', 230, 820)
    out.append(texte(DEVISE_FON, 'fon', t1, 600, 222 + N6M_DY, 'milieu', couleur=neon, attrs='data-couche="neon"')[0])
    out.append(texte(DEVISE_FR, 'cormorant-italique', ajuste(DEVISE_FR, 'cormorant-italique', 96, 900, 500), 600, 352 + N6M_DY, 'milieu', 500, 0, neon)[0])
    return ''.join(out)


def n7m(a):
    return n7(a) + medaillon(72, 260, 32, I) + medaillon(328, 260, 32, I)


def n8m(a):
    pts = grille(0, 1650, 900, 330, 70, 105, 92, marge=18, ancre=(450, 1815))
    return (n8(a) + f'<rect x="0" y="1650" width="900" height="330" fill="{S}" fill-opacity="{0.55 if a.rendu else 1}"/>'
            + allover(pts, 70, '#FFFFFF', attrs='data-couche="ajour"'))




# ══ CE QUE CHAQUE OPTION AJOUTE ═════════════════════════════════════════
# titre (fr, en, zh), fabrication (fr, en, zh).
TEXTES = {
    'R1': (('Panneau indigo à l’allover ton sur ton derrière les lettres', 'Indigo panel with tone-on-tone allover behind the 3D letters', '靛蓝背板，同色系满版图案，立体字装在板上'),
           ('Aluminium composite 4 mm, 1400 × 1650, indigo ; allover imprimé UV en indigo clair #2C3070 ; les lettres R1 montées dessus sur goujons de 15 mm.',
            '4 mm aluminium composite panel 1400 × 1650 mm, indigo, allover UV printed in light indigo #2C3070. The R1 letters are mounted on it with 15 mm studs.',
            '4 毫米铝塑板 1400 × 1650 毫米，靛蓝色，满版图案以浅靛蓝 #2C3070 UV 打印。R1 立体字用 15 毫米螺杆装在板上。')),
    'R4': (('Cadre de couronnes ton sur ton autour du panneau', 'Frame of crowns printed tone-on-tone around the panel', '面板四周印同色系皇冠边框'),
           ('Impression UV sable (#E3DACB) sur la face peinte ivoire, avant la pose des lettres.',
            'UV print in sand (#E3DACB) on the ivory painted face, before the letters are mounted.',
            '字安装前，在象牙白烤漆面上 UV 打印沙色（#E3DACB）。')),
    'R5': (('Quatre couronnes cuivre sous « TOILETTES »', 'Row of four copper crowns under “TOILETTES”', '“TOILETTES” 下方印四个铜色皇冠'),
           ('Imprimées avec le reste, à l’encre cuivre.', 'Printed with the rest of the UV print, copper ink.', '与其他图文一起 UV 打印，铜色。')),
    'R8': (('Petit médaillon cuivre au coin de chaque plaque (5)', 'Small copper mirror medallion in the top corner of each plate (5 plates)', '每块门牌右上角加一个铜色镜面小圆章（5 块）'),
           ('Acrylique miroir cuivre 2 mm, découpé et posé comme les lettres.', '2 mm copper mirror acrylic, cut and mounted like the letters.', '2 毫米铜色镜面亚克力，切割安装方式与文字相同。')),
    'N1': (('Allover ton sur ton sur le bandeau indigo', 'Allover tone-on-tone on the indigo fascia behind the letters', '字后的靛蓝门头板印同色系满版图案'),
           ('Impression UV indigo clair #2C3070 sur le bandeau, encre extérieure anti-UV, avant la pose des lettres.',
            'UV print in light indigo #2C3070 on the indigo panel, outdoor UV-resistant ink, before the letters are mounted.',
            '安装字之前，在靛蓝板上 UV 打印浅靛蓝 #2C3070，户外抗紫外线油墨。')),
    'N5': (('Allover ton sur ton sur le bandeau indigo', 'Allover tone-on-tone on the indigo fascia', '靛蓝门头板印同色系满版图案'),
           ('Impression UV indigo clair #2C3070, encre extérieure anti-UV.', 'UV print in light indigo #2C3070, outdoor UV-resistant ink.', 'UV 打印浅靛蓝 #2C3070，户外抗紫外线油墨。')),
    'N6': (('Couronne en néon au-dessus de la devise (plaque 1200 × 650)', 'Neon crown above the motto (plate 1200 × 650)', '格言上方加霓虹皇冠（背板 1200 × 650）'),
           ('Le même néon de 6 mm, cintré sur le contour du pictogramme ; le même variateur.',
            'Same 6 mm LED neon, bent along the outline of our pictogram; same dimmer.',
            '同样 6 毫米 LED 霓虹，沿图形轮廓弯制，同一个调光器。')),
    'N7': (('Deux médaillons gravés de part et d’autre de « MAISON N° 88 »', 'Two etched medallions beside “MAISON N° 88”', '“MAISON N° 88” 两侧蚀刻两个圆章'),
           ('Gravés et remplis d’indigo avec le reste de la plaque.', 'Etched and indigo-filled with the rest of the plate.', '与其他内容一起蚀刻并填靛蓝漆。')),
    'N8': (('Bande dépolie aux couronnes claires, à hauteur des yeux assis', 'Frosted privacy band with clear crowns, at seated eye level', '磨砂隐私带，镂空透明皇冠，位于坐姿视线高度'),
           ('Vinyle dépoli 900 × 330, les couronnes découpées (le verre clair se voit au travers).',
            'Frosted vinyl 900 × 330 mm, the crowns cut out (clear glass shows through).',
            '磨砂膜 900 × 330 毫米，皇冠镂空（露出透明玻璃）。')),
}

DESSINS = {'R1': (r1m, R1M_W, R1M_H), 'R4': (r4m,), 'R5': (r5m,), 'R8': (r8m,),
           'N1': (n1m, N1M_W, N1M_H), 'N5': (n5m,), 'N6': (n6m, 1200, N6M_H),
           'N7': (n7m,), 'N8': (n8m,)}


def _option(base):
    d = DESSINS[base['id']]
    (fr, en, zh), (fab_fr, fab_en, fab_zh) = TEXTES[base['id']]
    w, h = (d[1], d[2]) if len(d) > 1 else (base['w'], base['h'])
    o = dict(base, id=f"{base['id']}-M", base=base['id'], dessin=d[0], w=w, h=h, statut='option',
             nom=f"{base['nom']} · option motif", name=f"{base['name']} · pattern option",
             option=dict(fr=fr, en=en, zh=zh, fab_fr=fab_fr, fab_en=fab_en, fab_zh=fab_zh))
    if base['id'] == 'N9':
        o['prof'] = 40
    return o


OPTIONS = [_option(e) for e in ENSEIGNES if e['id'] in DESSINS]


# ══ LEURS RECETTES ══════════════════════════════════════════════════════
def _p(el, matiere, ep, z, lum=None, **k):
    return dict(el=el if isinstance(el, list) else [el], matiere=matiere, ep=ep, z=z, lum=lum, **k)


def recettes_des_options(R):
    """Les recettes des options, tirées de celles des bases (`R` : les recettes de volumes.py)."""
    def de(base, **change):
        r = dict(R[base])
        r.update(change)
        return r

    def sup(base, **change):
        s = dict(R[base]['support'])
        s.update(change)
        return s

    return {
        'R1-M': dict(montage='mur', centre=2.0, support=dict(el=0, ep=4, matiere='alu-indigo', face='plein'),
                     surimpressions=[dict(el=[1], z=4.1)], pieces=[_p(2, 'cuivre-brosse', 30, 19)], goujons=15, vues=['jour', 'situation']),
        'R4-M': de('R4', surimpressions=[dict(el=[5], z=60.1)]),
        'R5-M': de('R5', support=sup('R5', imprime=[1, 2, 3, 5, 6])),
        'R8-M': de('R8', pieces=R['R8']['pieces'] + [_p(8, 'cuivre-miroir', 2, 22.5)]),
        'N1-M': dict(montage='mur', centre=3.4, support=dict(el=0, ep=3, matiere='alu-indigo', face='plein'),
                     surimpressions=[dict(el=[1], z=3.1)], pieces=[_p(2, 'cuivre-brosse', 50, 33, 'halo')], goujons=30,
                     vues=['jour', 'nuit', 'situation'], situation='nuit'),
        'N5-M': de('N5', surimpressions=[dict(el=[2], z=4.1)]),
        'N6-M': de('N6', neon=dict(R['N6']['neon'], el=[1, 2, 3])),
        'N7-M': de('N7', pieces=[_p(list(range(1, 13)), 'encre-indigo', 0.25, 16.9)]),
        'N8-M': de('N8', pieces=R['N8']['pieces'] + [_p(9, 'vinyle-sable', 0.25, 10, ajoure=[10])]),
    }
