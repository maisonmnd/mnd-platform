# -*- coding: utf-8 -*-
"""Les fabricants en Chine, recherche du 14 octobre 2026 : pages ouvertes sur
Made-in-China.com, les sites des fabricants et Accio (Alibaba bloque la
lecture automatique). Trois affirmations recoupées à la main (Hongli, Fenghe,
Great Furniture). AUCUNE page ne promet la broderie du nom, le motif gaufré en
semis ni un plaqué cuivre : la demande de devis le leur demande, preuve par
échantillon. Notes : bacs, lit électrique, fauteuils, inclinable (3 fort, 1 faible)."""
import html

FABRICANTS = [
    dict(nom='Foshan Great Furniture', ville='Foshan, Guangdong', notes=(3, 3, 2, 2), premier=True,
         fort='Les quatre familles : lit électrique SC-25, bac SC-08 à repose-pieds, fauteuils, inclinable. Usine de 16 000 m², 80 ouvriers, audit SGS (QIP-ASI2511418). Dès 1 à 2 pièces.',
         prudence='L’Afrique n’est pas dans ses marchés. Ses chiffres diffèrent entre Alibaba et Made-in-China.',
         lien='https://salonchair.en.made-in-china.com/company-Foshan-Great-Furniture-Co-Ltd-.html'),
    dict(nom='Wenling Hongli Barber & Beauty', ville='Wenling, Zhejiang', notes=(3, 2, 3, 3), premier=True,
         fort='La personnalisation la mieux écrite : plus de 30 couleurs de cuir, logos, coutures dessinées par ordinateur. Un modèle or rose, 31 fauteuils inclinables. Depuis 1997.',
         prudence='Hors du Guangdong. Couleurs de métal à confirmer. Or rose dès 10 pièces.',
         lien='https://honglichair.com/hongli-customization/'),
    dict(nom='Guangzhou Fenghe Industry', ville='Guangzhou (Huadu)', notes=(2, 1, 3, 2), premier=True,
         fort='Plus de 100 teintes ou couleurs Pantone, plusieurs techniques de logo, 800 moules. Exporte dans plus de 60 pays, Afrique comprise. Expose à Guangzhou.',
         prudence='Pas de lit électrique vu. Fauteuils dès 5 à 10 pièces. Société enregistrée en 2019.',
         lien='https://www.fh-salon.com/custom-equipment'),
    dict(nom='Guangzhou Zhuolie (卓烈)', ville='Guangzhou (Baiyun)', notes=(2, 3, 2, 2), premier=True,
         fort='Plus de 30 ans, plus de 200 employés, ISO 9001, Afrique dans ses marchés. Lits de lavage électriques à deux vérins, dès 1 pièce.',
         prudence='Personnalisation non détaillée. Pas de badge d’audit.',
         lien='http://www.zhuolie.cn/product.php?cid=73'),
    dict(nom='Foshan Yimeihui', ville='Foshan (Dali)', notes=(3, 3, 1, 2), premier=True,
         fort='Spécialiste des lits de lavage. Audit SGS, couleur du cuir au choix, vasque céramique personnalisable, commande en anglais, 220 V. Dès 1 à 2 pièces.',
         prudence='Société créée en 2025.',
         lien='https://fs-yimeihui.en.made-in-china.com/'),
    dict(nom='TikChains', ville='Foshan (Shishan)', notes=(2, 1, 2, 2),
         fort='Écrit noir sur blanc : logo gaufré, sérigraphie, gravure laser, transfert, sublimation. Accepte une commande d’essai sous le minimum.',
         prudence='Pas de raison sociale affichée ; des phrases copiées de Hongli.', lien='https://tikchains.com/'),
    dict(nom='Jiangmen Senkelly', ville='Jiangmen / Guangzhou', notes=(2, 2, 3, 1),
         fort='Annonce couleurs, coutures et logos gaufrés sur mesure, petit minimum.',
         prudence='Deux raisons sociales et des chiffres qui se contredisent.', lien='https://www.senkelly.com/'),
    dict(nom='Foshan Honggang Furniture', ville='Foshan (Jiujiang)', notes=(2, 2, 2, 2),
         fort='Depuis 2007, Afrique dans ses marchés, dès 1 pièce, accepte les dessins du client.',
         prudence='Le gaufrage du logo n’est dit que par un site tiers.', lien='https://www.made-in-china.com/showroom/talalee/'),
    dict(nom='Foshan Aisen Furniture', ville='Foshan (Jiujiang)', notes=(2, 3, 1, 1),
         fort='Quatorze lits de lavage, Afrique dans ses marchés, 15 jours ouvrés.',
         prudence='Jeune société ; pas de fauteuils.', lien='https://fs-aisenfurniture.en.made-in-china.com/'),
    dict(nom='Foshan Yoocell Furniture', ville='Foshan', notes=(2, 1, 3, 1),
         fort='Usine de 35 000 m², garantie de 2 ans, vasque céramique blanche confirmée.',
         prudence='Rien d’écrit sur la personnalisation.', lien='https://www.yoocell.com/'),
    dict(nom='Foshan Doshower', ville='Foshan', notes=(1, 1, 2, 2),
         fort='Membre Gold depuis 2012, audité, Afrique ; vend déjà des pièces plaquées or rose.',
         prudence='Surtout des fauteuils de barbier anciens.', lien='https://doshower.en.made-in-china.com/'),
    dict(nom='Dongpin Beauty & Medical', ville='Foshan (Jiujiang)', notes=(2, 2, 1, 2),
         fort='Audit SGS, lits de lavage et fauteuils inclinables électriques.',
         prudence='Plutôt médical et esthétique.', lien='https://dpbeauty.en.made-in-china.com/'),
]

PREMIER = '<span class="puce nouvelle" style="white-space:nowrap;display:inline-block;margin:4px 0">à contacter d’abord</span>'


def points(n):
    return '●' * n + '<span style="opacity:.22">' + '●' * (3 - n) + '</span>'


def ligne(f):
    e = html.escape
    tete = f'<td style="min-width:200px"><b>{e(f["nom"])}</b><br>{PREMIER + "<br>" if f.get("premier") else ""}<small>{e(f["ville"])}</small></td>'
    notes = ''.join(f'<td class="num" title="{n} sur 3">{points(n)}</td>' for n in f['notes'])
    return (f'<tr>{tete}{notes}<td>{e(f["fort"])}</td><td>{e(f["prudence"])}</td>'
            f'<td><a href="{e(f["lien"])}" target="_blank" rel="noopener">la page</a></td></tr>')


def section_html():
    lignes = ''.join(ligne(f) for f in FABRICANTS)
    return f'''<h2 class="section" id="fabricants">Les fabricants en Chine</h2>
<p class="section-dit">Recherche du 14 octobre 2026 sur Made-in-China, les sites des fabricants et Accio. Les pages d’Alibaba bloquent la lecture automatique : badges et notes Alibaba sont à vérifier à la main.</p>
<div class="bloc"><b>Ce qu’aucun n’écrit :</b> la broderie du nom sur un appui-tête, le motif gaufré en semis, un plaqué cuivre. La demande de devis le leur demande ; on ne commande qu’après un échantillon de cuir gaufré et brodé.</div>
<div class="tableau"><table style="min-width:900px"><thead><tr><th>Fabricant</th><th>Bacs</th><th>Lit électrique</th><th>Fauteuils</th><th>Inclinable</th><th>Point fort</th><th>Prudence</th><th>Source</th></tr></thead>
<tbody>{lignes}</tbody></table></div>
<div class="regles">
<div class="regle"><b>Les cinq à contacter d’abord</b>Great Furniture, Hongli, Fenghe, Zhuolie et Yimeihui reçoivent la demande de la série 2. Guangzhou Sulin, déjà connue, la reçoit aussi pour comparer.</div>
<div class="regle"><b>Avant de payer</b>Sur Alibaba, vérifier le badge « Verified Supplier » et payer par Trade Assurance. Exiger l’échantillon gaufré et brodé.</div>
<div class="regle"><b>Avant l’expédition</b>Une inspection par un tiers à 80 % de la production : QIMA ou V-Trust, qui couvrent le mobilier en Chine.</div>
<div class="regle"><b>Le transport</b>Environ 30 jours de Nansha ou Shenzhen au port de Cotonou, selon une seule source. MSC fait escale à Cotonou sur sa ligne Iroko.</div>
</div>'''


def texte_brut():
    """La même liste en texte, pour le Drive."""
    out = ['LES FABRICANTS EN CHINE · recherche du 14 octobre 2026', '',
           'Notes : bacs / lit électrique / fauteuils / inclinable (3 fort, 1 faible).',
           'Aucun n’écrit la broderie du nom, le motif gaufré en semis ni le plaqué cuivre : échantillon exigé.', '']
    for k, f in enumerate(FABRICANTS, 1):
        out += [f'{k}. {f["nom"]} · {f["ville"]}' + ('  [à contacter d’abord]' if f.get('premier') else ''),
                '   notes ' + ' / '.join(str(n) for n in f['notes']), '   + ' + f['fort'], '   ! ' + f['prudence'], '   ' + f['lien'], '']
    out += ['AVANT DE PAYER : badge Verified Supplier et Trade Assurance sur Alibaba ; échantillon gaufré et brodé.',
            'AVANT L’EXPÉDITION : inspection par un tiers (QIMA, V-Trust) à 80 % de la production.',
            'TRANSPORT : environ 30 jours de Nansha ou Shenzhen à Cotonou (une seule source) ; MSC Iroko fait escale à Cotonou.']
    return chr(10).join(out) + chr(10)
