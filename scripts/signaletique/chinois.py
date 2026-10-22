# -*- coding: utf-8 -*-
"""LES FICHES EN CHINOIS, 22 octobre 2026.

Choix de Yéman au sélecteur : les fiches techniques en anglais ET en chinois,
pour éviter les malentendus à l'atelier. Traduction préparée par la Maison
(termes du métier de l'enseigne : 背发光字, 灯箱, 侧边, 明纬电源…) ; la fiche
dit que l'anglais fait foi. Une enseigne sans entrée ici fait échouer
fiches3d.py : on n'envoie pas une fiche à moitié traduite.
"""

ETIQUETTES = {
    'titre': '技术规格书',
    'commande': '已下单',
    'nouvelle': '新品 · 请报价',
    'ligne_pi': '订单行',
    'quantite': '数量',
    'taille': '外形尺寸',
    'construction': '结构与材料',
    'finition': '表面处理',
    'lumiere': '照明',
    'usage': '使用环境',
    'interieur': '室内',
    'exterieur': '户外 IP65',
    'changements': '修改说明',
    'prix': '价格参考',
    'a_chiffrer': '请报价',
    'fichiers': '文件',
    'couches': '结构层次（由墙面向外）',
    'couleurs': '颜色（以实物色板为准，生产前请发照片确认）',
    'vue_face': '正视图（尺寸单位：毫米）',
    'coupe': '剖面（左侧为墙面）',
    'rendu_jour': '最终效果 · 白天',
    'rendu_nuit': '夜间点亮效果 · 3000K 暖白光',
    'rendu_nuit_option': '可选背光效果 · 3000K',
    'rendu_situation': '安装效果 · 1.70 米人物作比例',
    'rendu_situation_nuit': '夜间安装效果 · 1.70 米人物作比例',
    'validation': '打样确认，可以生产',
    'nom': '姓名',
    'date': '日期',
    'signature': '签名',
    'note_rendu': '三维效果图由生产文件直接计算生成：标志准确，厚度真实，未经重绘。屏幕颜色仅供参考。',
    'note_logo': '所有文字已转为曲线。标志不得重绘或变形。洋红色细线为切割线。',
    'fait_foi': '如有歧义，以英文为准。',
    'du_mur': '距墙',
    'epaisseur': '厚度',
    'entretoises': '支架螺丝（广告钉）',
    'halo': '背发光',
    'face_lum': '面发光',
    'retro': '背光',
    'contour_lum': '边缘发光',
    'neon': '霓虹',
    'perce_lum': '镂空透光',
}

ENSEIGNES = {
    'R1': dict(
        name='立体字（竖版标志），不发光',
        construction='拉丝不锈钢字和图形，30 毫米焊接侧边，背面螺杆固定。',
        finish='电镀铜色（替代金色）。生产前请发表面效果照片。',
        lighting='不发光。',
        change='新标志（竖版组合：图形 + MAISON + MND）。金色改为铜色。字母由 3 个改为 9 个：请重新报价。'),
    'R2': dict(
        name='双层镂空圆牌',
        construction='1.2 毫米不锈钢面板，20 毫米边框，靛蓝色烤漆。标志和环形文字镂空，背衬铜色镜面不锈钢。字母内部的孤岛须粘在背板上。',
        finish='靛蓝色烤漆 #1E2150（替代黑色）；铜色镜面背板（替代金色）。',
        lighting='不发光。',
        change='新标志；环形文字改为格言 “mi nyɔ́ ɖɛkpɛ · votre beauté est déjà là”；黑色改为靛蓝；金色改为铜色。'),
    'R3': dict(
        name='双面圆形侧招灯箱',
        construction='Ø600 × 120 毫米灯箱，5 毫米乳白亚克力双面 UV 打印，不锈钢包边；Ø40 不锈钢管支架，5 毫米钢底板，M6 膨胀螺丝。',
        finish='象牙白底，靛蓝色标志，铜色圆环和 “COTONOU · BÉNIN”；侧边靛蓝色烤漆（替代黑色）。',
        lighting='内置 LED，双面发光，3000K 暖白光（替代 4500K），明纬电源 110–240V，户外 IP65。',
        change='新标志；黑色改为靛蓝；金色改为铜色；3000K。'),
    'R4': dict(
        name='前台背景墙牌，标志背发光',
        construction='60 毫米折弯不锈钢灯箱，象牙白烤漆；标志为拉丝不锈钢铜色，40 毫米侧边，10 毫米磨砂亚克力背板（背发光）；“mi nyɔ́ ɖɛkpɛ” 字 20 毫米侧边，背发光；“votre beauté est déjà là” 为 3 毫米铜色镜面亚克力，平贴，不发光。',
        finish='象牙白烤漆 #F6F1E7（替代白色）；铜色（替代金色）。',
        lighting='标志和 Fon 语一行 3000K 暖白背发光；明纬电源；挂孔安装。',
        change='新标志；完整格言（Fon 语 + 法语一行）；金色改为铜色；白色改为象牙白。'),
    'R5': dict(
        name='卫生间背光指示牌',
        construction='9.5 毫米磨砂亚克力，UV 打印；拉丝铝阳极氧化铜色饰条；内置 LED，背光效果。',
        finish='图标和 “TOILETTES” 印靛蓝色（替代黑色）；铜色饰条（替代金色）。',
        lighting='3000K 暖白背光。',
        change='仅改颜色；尺寸保持 150 × 400 毫米。'),
    'R6': dict(
        name='圆形墙面正发光灯箱',
        construction='Ø600 × 100 毫米灯箱，5 毫米乳白亚克力面板 UV 打印，不锈钢包边，背面螺丝固定。',
        finish='象牙白底，靛蓝色标志，铜色 Fon 语格言；侧边靛蓝色烤漆（替代黑色）。',
        lighting='3000K 暖白正发光。',
        change='新标志；黑色改为靛蓝；金色改为铜色。'),
    'R7': dict(
        name='镂空正发光灯箱',
        construction='60 毫米折弯不锈钢灯箱，象牙白烤漆；标志和格言镂空，背后为乳白亚克力 + 铜色透光膜。',
        finish='象牙白烤漆（替代白色）；铜色膜（替代金色）。',
        lighting='透过镂空部分正发光，3000K 暖白光。',
        change='新标志；完整格言；金色改为铜色。'),
    'R8': dict(
        name='工作室门牌（5 块）',
        construction='7.5 毫米磨砂亚克力底板，异形切割；边框和文字为 2 毫米铜色镜面亚克力；支架螺丝安装。',
        finish='铜色镜面（替代金色）。每个名称下增加一行法语。',
        lighting='3000K 暖白背光。',
        change='拼写：“GBÉJÍ” 必须改为 “GBÈJÍ”。KÒKÒ 门牌加图形。金色改为铜色。增加法语功能说明一行。'),
    'R9': dict(
        name='圆形贴纸 Ø200，每张 15 款',
        construction='合成纸不干胶，哑膜，单面数码印刷，Ø200 模切（洋红色线），3 毫米出血。',
        finish='靛蓝色底（替代黑色），铜色和象牙白。',
        lighting='无（贴纸）。',
        change='15 款图案全部更换（整张 1060 × 680 毫米，5 × 3）。'),
    'N1': dict(
        name='横版标志背发光字（门头）',
        construction='铜色 PVD 不锈钢背发光字，50 毫米侧边，30 毫米支架螺丝，透明亚克力背板。最细笔画不小于 6 毫米（如需要可加粗 MAISON 细线，比例不变）。',
        finish='拉丝铜色 PVD。',
        lighting='3000K 暖白背发光，IP65 模组，防水明纬电源。',
        change='新品。宽度 3000 毫米。请报价。'),
    'N2': dict(
        name='方形侧招灯箱，发光圆环',
        construction='600 × 600 × 100 毫米不锈钢灯箱，靛蓝色烤漆，双面；标志、圆环和文字为乳白亚克力凸出透光；铜色支架。',
        finish='靛蓝色 #1E2150；铜色支架。',
        lighting='仅标志、圆环和文字发光，3000K，IP65。',
        change='新品。请报价。'),
    'N3': dict(
        name='铁艺挂式圆牌',
        construction='Ø500 毫米 4 毫米铝塑板，双面 UV 打印；靛蓝色包边；铁艺支架靛蓝色喷粉，悬臂 650 毫米，两根吊杆。',
        finish='象牙白底，靛蓝色标志，铜色细圆环线。',
        lighting='不发光（可选射灯）。',
        change='新品。请报价。'),
    'N4': dict(
        name='边缘发光框画',
        construction='10 毫米象牙白亚克力板，装在 20 毫米靛蓝色铝框内；标志为 5 毫米靛蓝色亚克力平切，凸出安装。',
        finish='象牙白，靛蓝色。',
        lighting='边框四周 LED（边框光晕），3000K 暖白光。',
        change='新品。请报价。'),
    'N5': dict(
        name='靛蓝门头板，象牙白平切字',
        construction='3000 × 600 毫米靛蓝色铝塑板门头；横版标志为 15 毫米象牙白亚克力平切，螺杆安装。',
        finish='靛蓝色，象牙白。',
        lighting='不发光；可选两盏鹅颈灯。',
        change='新品。请报价。'),
    'N6': dict(
        name='LED 霓虹格言灯',
        construction='6 毫米 LED 柔性霓虹灯，沿字母中心线弯制，装在 8 毫米透明亚克力背板上，支架螺丝安装。',
        finish='暖白光。',
        lighting='3000K 霓虹，带调光器，12V 电源。特殊字母 ɔ ɖ ɛ 以及 ɔ́ 上的声调符号必须准确保留。',
        change='新品。请报价。'),
    'N7': dict(
        name='地址和营业时间牌',
        construction='2 毫米拉丝不锈钢，铜色 PVD；化学蚀刻，靛蓝色填漆；4 个支架螺丝。',
        finish='拉丝铜色，靛蓝色填漆。',
        lighting='不发光。',
        change='新品。请报价。营业时间可能调整：生产前请确认文字。'),
    'N8': dict(
        name='玻璃门贴膜',
        construction='铜色刻字膜（标志），白色刻字膜（文字、营业时间），磨砂膜饰带上印靛蓝色格言。门尺寸 900 × 2100 毫米：请按实际玻璃尺寸调整。',
        finish='铜色，白色，磨砂。',
        lighting='无（贴膜）。',
        change='新品（也可在当地制作）。'),
    'N9': dict(
        name='门牌号 “88”',
        construction='500 × 300 毫米靛蓝色铝塑板，圆角；“88” 为铜色 PVD 不锈钢字，20 毫米侧边；“MAISON MND” 印象牙白。',
        finish='靛蓝色，铜色，象牙白。',
        lighting='数字可选 3000K 背发光。',
        change='新品。请报价。'),
}
