# -*- coding: utf-8 -*-
"""LES ENSEIGNES EN VOLUME, 22 octobre 2026.

« Besoin de faire une fiche technique par élément. Chaque pièce, chaque
commande, avec le résultat final du LED ou du 3D, pas juste une simple
image » (Yéman). Choix au sélecteur : les dix-huit enseignes, un rendu 3D
CALCULÉ depuis les vrais fichiers (pas une image générée, qui redessinerait
le logo), des fiches en anglais et en chinois.

Chaque enseigne reçoit ici sa RECETTE : de quoi chaque morceau de son dessin
est fait, à quelle épaisseur, à quelle distance du mur, et comment il
s'allume. Les morceaux sont les éléments du dessin du fabricant, dans l'ordre
où `enseignes.py` les pose (0 = le premier) : le volume est extrudé des
chemins mêmes qui partent chez Lico Sign, rien n'est redessiné.

Unités : millimètres pour le dessin et les épaisseurs ; `z` se mesure depuis
le mur jusqu'au dos du morceau ; `centre` est la hauteur du centre de
l'enseigne au-dessus du sol, en mètres.

Lumières : `halo` (la lumière part du dos et éclaire le mur ou le caisson),
`face` (la face s'allume), `retro` (la plaque est éclairée par derrière),
`contour` (le pourtour s'allume), `neon`.
"""
import json
import xml.etree.ElementTree as ET

from enseignes import ENSEIGNES, Atelier, ATELIERS, plaque_atelier, TOTEM_H, POTEAU_H, TABLE_H
from motifs import chemin_du_pictogramme

# Matières : le moteur 3D (rendu3d.html) connaît chacune de ces clés.
MATIERES = {
    'cuivre-brosse': ('Brushed copper (PVD / electroplated)', '拉丝铜色（PVD/电镀）'),
    'cuivre-miroir': ('Mirror copper', '镜面铜色'),
    'inox': ('Brushed stainless steel', '拉丝不锈钢'),
    'alu-cuivre': ('Brushed aluminium, copper anodised', '拉丝铝，阳极氧化铜色'),
    'alu-sable': ('Aluminium composite, sand', '铝塑板，沙色'),
    'encre-cuivre': ('Copper ink, UV print', '铜色油墨，UV 打印'),
    'indigo': ('Indigo paint #1E2150', '靛蓝色烤漆 #1E2150'),
    'ivoire': ('Ivory paint #F6F1E7', '象牙白烤漆 #F6F1E7'),
    'opale': ('Opal acrylic (light diffusing)', '乳白亚克力（透光）'),
    'depoli': ('Frosted acrylic', '磨砂亚克力'),
    'clair': ('Clear acrylic', '透明亚克力'),
    'film-cuivre': ('Copper light-transmitting film', '铜色透光膜'),
    'acrylique-indigo': ('Indigo acrylic', '靛蓝色亚克力'),
    'acrylique-ivoire': ('Ivory acrylic', '象牙白亚克力'),
    'fer-indigo': ('Wrought iron, indigo powder coat', '铁艺，靛蓝色喷粉'),
    'alu-indigo': ('Aluminium composite, indigo', '铝塑板，靛蓝色'),
    'papier': ('Synthetic paper, matte lamination', '合成纸，哑膜'),
    'verre': ('Glass (door)', '玻璃（门）'),
    'vinyle-cuivre': ('Copper cut vinyl', '铜色刻字膜'),
    'vinyle-blanc': ('White cut vinyl', '白色刻字膜'),
    'vinyle-sable': ('Frosted vinyl', '磨砂膜'),
    'encre-indigo': ('Indigo ink / paint fill', '靛蓝色油墨/填漆'),
    'encre-ivoire': ('Ivory print', '象牙白印刷'),
    'neon': ('LED neon flex 6 mm', '6毫米LED柔性霓虹灯'),
}


def _p(el, matiere, ep, z, lum=None, **k):
    return dict(el=el if isinstance(el, list) else [el], matiere=matiere, ep=ep, z=z, lum=lum, **k)


RECETTES = {
    # Lettres pleines, retours soudés de 30 mm, sur goujons de 15 mm.
    'R1': dict(montage='mur', centre=2.0, support=None,
               pieces=[_p(0, 'cuivre-brosse', 30, 15)], goujons=15, vues=['jour', 'situation']),
    # Face indigo de 1,2 mm ajourée sur un fond inox miroir cuivre ; cadre de 20 mm.
    'R2': dict(montage='mur', centre=1.55, support=dict(el=0, ep=20, matiere='ivoire', face='percee', percee=[1, 2], fond='cuivre-miroir'),
               pieces=[], vues=['jour', 'situation']),
    # Caisson rond de 120 mm, perpendiculaire au mur, deux faces opales imprimées et allumées.
    'R3': dict(montage='drapeau', centre=2.8, bras=260, support=dict(el=None, ep=120, matiere='indigo', face='impression', lum='face', double=True, rebord='inox'),
               pieces=[], vues=['jour', 'nuit', 'situation']),
    # Caisson ivoire de 60 mm ; logo à retours de 40 mm sur 10 mm d'acrylique dépoli (halo) ;
    # devise fon à 20 mm (halo) ; ligne française et filet en miroir cuivre de 3 mm, à plat.
    'R4': dict(montage='mur', centre=1.55, support=dict(el=0, ep=60, matiere='ivoire', face='plein'),
               pieces=[_p(1, 'cuivre-brosse', 40, 70, 'halo', socle=10), _p(2, 'cuivre-brosse', 20, 70, 'halo', socle=10),
                       _p(3, 'cuivre-miroir', 3, 60), _p(4, 'cuivre-miroir', 3, 60)],
               vues=['jour', 'nuit', 'situation']),
    # Plaque d'acrylique dépoli de 9,5 mm imprimée, sur entretoises de 20 mm, bande cuivre, rétroéclairée.
    'R5': dict(montage='mur', centre=1.5, support=dict(el=0, ep=9.5, recul=20, matiere='depoli', face='impression', imprime=[1, 2, 4], lum='retro'),
               pieces=[_p(3, 'alu-cuivre', 1.5, 29.5)], goujons=20, vues=['jour', 'nuit', 'situation']),
    # Caisson rond de 100 mm, face opale imprimée allumée, cerclage inox.
    'R6': dict(montage='mur', centre=1.8, support=dict(el=None, ep=100, matiere='indigo', face='impression', lum='face', rebord='inox'),
               pieces=[], vues=['jour', 'nuit', 'situation']),
    # Caisson ivoire de 60 mm, logo et devise ajourés ; derrière, opale et film cuivre allumés.
    'R7': dict(montage='mur', centre=1.6, support=dict(el=0, ep=60, matiere='ivoire', face='percee', percee=[1, 2, 3], fond='film-cuivre', lum='percee'),
               pieces=[], vues=['jour', 'nuit', 'situation']),
    # Base dépolie de 7,5 mm sur entretoises, cadre et lettres en miroir cuivre de 2 mm, rétroéclairée.
    'R8': dict(montage='mur', centre=1.55, support=dict(el=0, ep=7.5, recul=15, matiere='depoli', face='plein', lum='retro'),
               pieces=[_p(1, 'cuivre-miroir', 2, 22.5, trait=True), _p([2, 3, 4, 5, 6, 7], 'cuivre-miroir', 2, 22.5)], goujons=15,
               vues=['jour', 'nuit', 'situation']),
    # La feuille d'autocollants (celle de la boutique depuis le 23 oct. 2026), posée sur une table.
    'R9': dict(montage='table', centre=0.0, support=dict(el=None, ep=0.3, matiere='papier', face='impression', sans_trait=True),
               pieces=[], vues=['jour']),
    # Lettres boîtiers inversées de 50 mm, sur entretoises de 30 mm, devant le bandeau indigo ; halo.
    'N1': dict(montage='mur', centre=3.4, support=dict(el=None, ep=3, matiere='alu-indigo', face='plein', taille=(3400, None), marge=180),
               pieces=[_p(0, 'cuivre-brosse', 50, 33, 'halo')], goujons=30, vues=['jour', 'nuit', 'situation'], situation='nuit'),
    # Caisson carré indigo de 100 mm, double face ; logo, cercle et texte en opale traversante ; potence cuivre.
    'N2': dict(montage='drapeau', centre=2.8, bras=240, bras_matiere='cuivre-brosse',
               support=dict(el=0, ep=100, matiere='indigo', face='plein', double=True),
               pieces=[_p(1, 'opale', 106, -3, 'face', trait=True, traversant=True), _p([2, 3], 'opale', 106, -3, 'face', traversant=True)],
               vues=['jour', 'nuit', 'situation']),
    # Disque de 4 mm imprimé des deux côtés, jonc indigo, potence en fer forgé de 650 mm.
    'N3': dict(montage='potence', centre=2.5, bras=650, support=dict(el=None, ep=4, matiere='alu-indigo', face='impression', double=True, rebord='indigo'),
               pieces=[], vues=['jour', 'situation']),
    # Panneau ivoire de 10 mm dans un cadre indigo de 20 mm ; logo et texte en acrylique indigo de 5 mm ; LED du pourtour ;
    # le RCCM et l'IFU imprimés UV sur la face.
    'N4': dict(montage='mur', centre=1.6, support=dict(el=0, ep=20, matiere='acrylique-ivoire', face='plein', lum='contour'),
               pieces=[_p(1, 'alu-indigo', 24, 0, trait=True), _p([2, 3], 'acrylique-indigo', 5, 20)],
               surimpressions=[dict(el=[4], z=20.1, nom=('RCCM and IFU numbers, UV print', 'RCCM 注册号和 IFU 税号，UV 打印'))],
               vues=['jour', 'nuit', 'situation']),
    # Bandeau indigo de 4 mm ; verrou couché en acrylique ivoire de 15 mm, sur goujons de 10 mm.
    'N5': dict(montage='mur', centre=3.3, support=dict(el=0, ep=4, matiere='alu-indigo', face='plein'),
               pieces=[_p(1, 'acrylique-ivoire', 15, 14)], goujons=10, vues=['jour', 'situation']),
    # Néon de 6 mm suivant les lettres, sur une plaque claire de 8 mm, à 20 mm du mur.
    'N6': dict(montage='mur', centre=1.6, mur_uni=True, support=dict(el=0, ep=8, recul=20, matiere='clair', face='plein'),
               neon=dict(el=[1, 2], z=31, rayon=3), pieces=[], goujons=20, vues=['jour', 'nuit', 'situation'], situation='nuit'),
    # Plaque de 2 mm en inox cuivre, gravure remplie d'indigo, sur 4 entretoises de 15 mm.
    'N7': dict(montage='mur', centre=1.45, support=dict(el=0, ep=2, recul=15, matiere='cuivre-brosse', face='plein'),
               pieces=[_p(list(range(1, 11)), 'encre-indigo', 0.25, 16.9)], goujons=15, vues=['jour', 'situation']),
    # Vinyles sur la porte vitrée.
    'N8': dict(montage='vitre', centre=1.05, support=dict(el=0, ep=10, matiere='verre', face='plein'),
               pieces=[_p(1, 'vinyle-cuivre', 0.3, 10), _p([2, 6, 7, 8], 'vinyle-blanc', 0.3, 10), _p(3, 'vinyle-sable', 0.25, 10),
                       _p([4, 5], 'encre-indigo', 0.3, 10.2)],
               vues=['jour', 'situation']),
    # Plaque indigo de 4 mm sur entretoises ; « 88 » à retours de 20 mm ; « MAISON MND » imprimé ivoire.
    'N9': dict(montage='mur', centre=1.8, support=dict(el=0, ep=4, recul=10, matiere='alu-indigo', face='plein'),
               pieces=[_p(1, 'cuivre-brosse', 20, 14, 'halo'), _p(2, 'encre-ivoire', 0.2, 14)], goujons=10,
               vues=['jour', 'nuit', 'situation'], nuit_option=True),
}


# ══ LE TOTEM VIVANT (N10) ═══════════════════════════════════════════════
# Les éléments du dessin n10 : 0 colonne, 1 socle, 2 médaillon (découpé), 3 verrou debout,
# 4 plaque cuivre, 5 QR, 6 œil du détecteur.
def recette_totem(k=None):
    """`k` : l'intensité du médaillon (m) et du logo (logo), 1 par défaut."""
    k = k or {}
    coupe = [('Column: galvanised steel frame, indigo aluminium skin', '立柱：镀锌钢骨架，靛蓝铝板', 0, 220, '#1E2150', None),
             ('LED behind the medallion, addressable, 3000 K', '圆章后的可编程 LED，3000K', 150, 200, '#FFD9A0', None),
             ('Opal acrylic behind the cut-out medallion', '镂空圆章后的乳白亚克力', 212, 217, '#F4EFE6', 'percee'),
             ('Face 2 mm, medallion laser-cut', '2 毫米面板，激光镂空圆章', 218, 220, '#1E2150', None),
             ('Logo: channel letters, 40 mm returns, 20 mm stand-offs', '标志：发光字，40 毫米侧边，20 毫米支架', 240, 280, '#B0703F', 'halo'),
             ('Booking plate, copper 3 mm, QR print, NFC tag behind', '预约牌，3 毫米铜色，印二维码，背面 NFC 标签', 220, 223, '#B0703F', None)]
    return dict(montage='sol', centre=TOTEM_H / 2000, avance=1.8,
                support=dict(el=0, ep=220, matiere='indigo', face='percee', percee=[2], fond='opale', lum='percee', fond_lum=0.8 * k.get('m', 1)),
                pieces=[_p(1, 'cuivre-brosse', 3, 220), _p(3, 'cuivre-brosse', 40, 240, 'halo', intensite=k.get('logo', 1)),
                        _p(4, 'cuivre-brosse', 3, 220), _p(5, 'encre-indigo', 0.2, 223.1), _p(6, 'acrylique-indigo', 6, 220)],
                vues=['jour', 'nuit', 'situation'], coupe=coupe)


RECETTES['N10'] = recette_totem()
# Le médaillon de la porte : plaque cuivre de 2 mm ajourée, opale derrière, caisson de 30 mm ; seul le médaillon s'allume.
# La porte en métal se rend comme une façade sombre, sans motif (un médaillon sur un motif ne se lit plus).
RECETTES['N11'] = dict(montage='mur', centre=1.55, mur_uni=True,
                       support=dict(el=0, ep=30, matiere='cuivre-brosse', face='percee', percee=[1], fond='opale', lum='percee', fond_lum=0.7, sans_lueur=True),
                       pieces=[], vues=['jour', 'nuit', 'situation'])

# ══ LES PANNEAUX DE DIRECTION (23 oct. 2026) ════════════════════════════
# Le poteau : poteau acier de 110, chapeau et bague cuivre qui l'entourent, lames de 20 mm au milieu de son
# épaisseur ; le filet de chaque lame est imprimé, les lettres sont une encre posée dessus (une image
# plaquée les pâlissait au soleil). Éléments de directions.poteau.
RECETTES['N13'] = dict(montage='sol', centre=POTEAU_H / 2000, avance=1.6,
                       pieces=[_p(0, 'indigo', 110, 10), _p([1, 3], 'cuivre-brosse', 130, 0), _p(2, 'cuivre-brosse', 120, 5),
                               _p(4, 'alu-indigo', 20, 55), _p([6, 8, 10, 12], 'ivoire', 20, 55),
                               _p(5, 'encre-ivoire', 0.2, 75.15), _p([7, 9, 11, 13], 'encre-indigo', 0.2, 75.15)],
                       surimpressions=[dict(el=[4, 6, 8, 10, 12], z=75.1, nom=('Edge lines, UV print both faces', '边线，双面 UV 打印'))],
                       vues=['jour', 'situation'],
                       coupe=[('Post 110 × 110, steel, indigo powder coat', '立柱 110 × 110，钢，靛蓝色喷粉', 10, 120, '#1E2150', None),
                              ('Cap and foot ring 150 × 150, brushed copper', '顶帽和底环 150 × 150，拉丝铜色', 0, 130, '#B0703F', None),
                              ('Blades, extruded aluminium 20 mm, centred on the post', '指示牌，20 毫米铝型材，居立柱中间', 55, 75, '#F1EADC', None),
                              ('Lettering and edge lines, UV print both faces', '文字和边线，双面 UV 打印', 75, 75.2, '#C9BFAE', None)])
# La flèche de rue : panneau de 3 mm en film rétroréfléchissant ivoire, imprimé cuivre, sur rails à 12 mm du mur.
RECETTES['N14'] = dict(montage='mur', centre=2.3,
                       pieces=[_p(0, 'ivoire', 3, 12), _p(1, 'encre-cuivre', 0.2, 15), _p([2, 3, 4], 'encre-ivoire', 0.2, 15.2)],
                       goujons=12, vues=['jour', 'situation'],
                       coupe=[('Rails at the back, aluminium', '背面导轨，铝', 0, 12, '#AEB3BA', None),
                              ('Aluminium panel 3 mm, ivory reflective film', '3 毫米铝板，象牙白反光膜', 12, 15, '#F1EADC', None),
                              ('Copper UV print', '铜色 UV 打印', 15, 15.2, '#B97A4A', None)])
# La flèche ivoire : base indigo de 5 mm, face ivoire de 3 mm, chevron et logo en relief de 3 mm, devise imprimée.
RECETTES['N15'] = dict(montage='mur', centre=1.6,
                       pieces=[_p(0, 'acrylique-indigo', 5, 10), _p(1, 'acrylique-ivoire', 3, 15), _p([2, 3], 'acrylique-indigo', 3, 18), _p(4, 'encre-cuivre', 0.2, 18)],
                       goujons=10, vues=['jour', 'situation'])
# Le poteau de table, posé sur le comptoir de l'accueil : socle de 124, poteau de 24, bagues cuivre, lames de 5 mm.
# Éléments : 0 poteau, 1 tête, 2 socle, puis bague, lame, mot, ligne (3 à 14).
RECETTES['N16'] = dict(montage='sol', comptoir=True, centre=0.78 + TABLE_H / 2000, avance=0.45,
                       pieces=[_p([0, 1], 'acrylique-indigo', 24, 50), _p(2, 'acrylique-indigo', 124, 0), _p([3, 7, 11], 'cuivre-brosse', 30, 47),
                               _p([4, 8, 12], 'acrylique-ivoire', 5, 59.5), _p([5, 9, 13], 'encre-indigo', 0.2, 64.65), _p([6, 10, 14], 'encre-cuivre', 0.2, 64.65)],
                       surimpressions=[dict(el=[4, 8, 12], z=64.6, nom=('Edge lines, UV print both faces', '边线，双面 UV 打印'))],
                       vues=['jour', 'situation'],
                       coupe=[('Weighted base 124 × 124 × 18, indigo acrylic', '配重底座 124 × 124 × 18，靛蓝色亚克力', 0, 124, '#2A2E66', None),
                              ('Post 24 × 24, indigo acrylic', '立柱 24 × 24，靛蓝色亚克力', 50, 74, '#2A2E66', None),
                              ('Rings, brushed copper', '套环，拉丝铜色', 47, 77, '#B0703F', None),
                              ('Blades, ivory acrylic 5 mm', '指示牌，5 毫米象牙白亚克力', 59.5, 64.5, '#F6F1E7', None),
                              ('Lettering and edge lines, UV print both faces', '文字和边线，双面 UV 打印', 64.5, 64.7, '#C9BFAE', None)])
# La plaque d'angle : tôle émaillée indigo de 3 mm, les encres posées dessus ; le filet aux coins arrondis
# et la flèche, deux traits, sont imprimés (un trait devient un anneau aux coins vifs dans le volume).
RECETTES['N17'] = dict(montage='mur', centre=2.5, support=dict(el=0, ep=3, matiere='alu-indigo', face='plein'),
                       pieces=[_p(3, 'encre-cuivre', 0.2, 3), _p(2, 'encre-ivoire', 0.2, 3), _p(4, 'alu-sable', 0.2, 3)],
                       surimpressions=[dict(el=[1, 5], z=3.15, nom=('Copper frame line and sand arrow, printed', '铜色边框线和沙色箭头，印刷'))],
                       vues=['jour', 'situation'],
                       coupe=[('Enamelled steel 2 mm (or lacquered aluminium 3 mm), indigo', '2 毫米搪瓷钢板（或 3 毫米烤漆铝板），靛蓝色', 0, 3, '#1E2150', None),
                              ('Copper frame line, ivory logo, sand lettering and arrow', '铜色边框线，象牙白标志，沙色文字和箭头', 3, 3.2, '#B97A4A', None)])

# Les options à motifs : leurs recettes partent de celles des bases.
from options import OPTIONS, recettes_des_options  # noqa: E402
RECETTES.update(recettes_des_options(RECETTES))
TOUTES = ENSEIGNES + OPTIONS

# Les trois temps d'une approche, la nuit : ce que fait le détecteur de passage.
SCENES_TOTEM = [
    ('1', 'At rest: the light breathes', '待机：灯光缓慢呼吸', 'Au repos : la lumière respire', dict(m=0.3, logo=0.35)),
    ('2', 'Someone approaches: the light rises', '有人走近：灯光渐亮', 'Quelqu’un approche : la lumière monte', dict(m=0.65, logo=0.7)),
    ('3', 'Welcome: full light', '欢迎：全亮', 'Accueil : pleine lumière', dict()),
]

# Les murs du décor portent l'allover de la Maison, ton sur ton : (encre, largeur, pas en x, pas en y), en mm.
MOTIF_MUR = {
    'mur': ('#E0D4C0', 110, 300, 260), 'interieur': ('#DCCFBB', 110, 300, 260), 'facade': ('#56597A', 170, 440, 380),
    'rue': ('#CDC5B5', 140, 380, 330), 'verre': ('#D9CFBD', 110, 300, 260), 'planche': ('#DCD2C0', 110, 300, 260),
}


def motif_du_mur(nom_scene):
    encre, largeur, px, py = MOTIF_MUR.get(nom_scene, MOTIF_MUR['mur'])
    return dict(chemin_du_pictogramme(), encre=encre, largeur=largeur, pas_x=px, pas_y=py)


def morceaux(dessin):
    """Les éléments de premier niveau du dessin du fabricant, dans l'ordre."""
    racine = ET.fromstring(f'<svg>{dessin(Atelier(False))}</svg>')
    return [ET.tostring(el, encoding='unicode') for el in racine]


def dessin_de(e):
    if e['id'] == 'R8':
        return lambda a: plaque_atelier(a, 0)
    return e['dessin']


def scene(e):
    """Ce que le moteur 3D reçoit pour une enseigne."""
    r = RECETTES[e['id']]
    els = morceaux(dessin_de(e))
    utilises = set()
    sup = dict(r['support']) if r.get('support') else None
    if sup and sup.get('el') is not None:
        utilises.add(sup['el'])
    for p in r['pieces']:
        utilises.update(p['el'])
    if r.get('neon'):
        utilises.update(r['neon']['el'])
    for si in r.get('surimpressions', []):
        utilises.update(si['el'])
    for p_ in r['pieces']:
        utilises.update(p_.get('ajoure', []))
    if sup:
        for k in ('percee', 'imprime'):
            utilises.update(sup.get(k, []))
    imprimes = [i for i in range(len(els)) if i not in utilises]
    if sup and sup.get('face') == 'impression' and not sup.get('imprime'):
        # Tout le dessin s'imprime sur la face (sauf le trait de découpe).
        sup['imprime'] = [i for i in range(len(els)) if 'EC008C' not in els[i]]
    return dict(
        id=e['id'], nom=e['name'], w=e['w'], h=e['h'], forme=e['forme'], rx={'N9': 16, 'N6': 34, 'R5': 2, 'R8': 4, 'N2': 6, 'N7': 3, 'N17': 26}.get(e.get('base', e['id']), 0),
        scene=e['scene'], elements=els, recette=dict(r, support=sup), orphelins=imprimes if not (sup and sup.get('face') == 'impression') else [],
        # « C'est illisible » : derrière le néon de la devise, le mur reste uni.
        mur_motif=None if r.get('mur_uni') else motif_du_mur(e['scene']),
    )


def verifie():
    """Chaque recette nomme des éléments qui existent ; aucun élément n'est oublié."""
    fautes = []
    for e in TOUTES:
        s = scene(e)
        n = len(s['elements'])
        r = s['recette']
        cites = []
        if r.get('support') and r['support'].get('el') is not None:
            cites.append(r['support']['el'])
        for p in r['pieces']:
            cites += p['el']
        if r.get('neon'):
            cites += r['neon']['el']
        for si in r.get('surimpressions', []):
            cites += si['el']
        if r.get('support'):
            cites += r['support'].get('percee', []) + r['support'].get('imprime', [])
        hors = [i for i in cites if i >= n]
        if hors:
            fautes.append(f"{e['id']}: éléments {hors} absents (le dessin en a {n})")
        if s['orphelins']:
            fautes.append(f"{e['id']}: éléments sans matière {s['orphelins']}")
    return fautes


if __name__ == '__main__':
    import sys
    f = verifie()
    print('\n'.join(f) if f else f'{len(RECETTES)} recettes, toutes complètes.')
    if len(sys.argv) > 1:
        sortie = sys.argv[1]
        ids = sys.argv[2].split(',') if len(sys.argv) > 2 else [e['id'] for e in TOUTES]
        scenes = [scene(e) for e in TOUTES if e['id'] in ids]
        if 'N10' in ids:
            base = [x for x in scenes if x['id'] == 'N10'][0]
            for num, en, zh, fr, k in SCENES_TOTEM:
                scenes.append(dict(base, id=f'N10-{num}', recette=dict(recette_totem(k), vues=['nuit'])))
        with open(sortie, 'w', encoding='utf-8') as fh:
            json.dump(scenes, fh, ensure_ascii=False)
        print(f'{len(scenes)} scènes écrites dans {sortie}')
