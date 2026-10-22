/* LA BOUTIQUE DE LA MAISON, ÉPROUVÉE — `node scripts/verifie-la-boutique.mjs`.

   Les règles de src/shared/boutique-pur.ts telles que Yéman les a tranchées le
   22 octobre 2026 : fermée au public sans date, ouverte à l'instant posé
   (heure de Cotonou) ; une édition se vend le mois d'avant et son mois ; un
   article sans prix, sans stock ou retiré reste « Bientôt » ; le prix vient
   du catalogue, jamais du navigateur ; une ligne baissée ne fait pas payer
   moins ; poser les articles n'écrase jamais rien. Et la fonction `boutique`
   porte la MÊME règle, mot pour mot. Chaque épreuve dit la règle, jamais ce
   que le code en fait. Sortie ASCII : la console de Windows. */
import {
  ARTICLES, RAYONS, CATEGORIE_BOUTIQUE, ADULTE, ENFANT, PREFIXE,
  boutiqueOuverte, ouvertureDepuisSaisie, saisieDepuisOuverture, moisDeCotonou, moisDeLEdition, enSaison,
  etatDeLArticle, shortVendable, chiffreLaCommande, duDeLaPiece, articlesAPoser, cleDuNumero, numeroValable,
  referenceDePaiement, commandeDeLaReference, articlesDuRayon,
  type ArticleLu,
} from '../src/shared/boutique-pur';
// @ts-expect-error module .mjs sans types
import { copieAttendue, copieDuServeur } from './boutique-copie-serveur.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const racine = process.cwd(); // les bancs tournent depuis la racine du dépôt
const lis = (p: string): string => readFileSync(path.join(racine, p), 'utf8');
const sansCommentaires = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ── 1. L'ouverture ───────────────────────────────────────────────────── */
const le = (iso: string) => new Date(iso);
dit('sans date posee, la Boutique est fermee', false, boutiqueOuverte(undefined, le('2027-01-01T00:00:00Z')));
dit('une date illisible ne l ouvre pas', false, boutiqueOuverte('demain', le('2027-01-01T00:00:00Z')));
const ouv = ouvertureDepuisSaisie('2026-12-01T09:00');
dit('la saisie du Trone se lit a l heure de Cotonou', '2026-12-01T09:00:00+01:00', ouv);
dit('et se relit dans le champ telle qu elle a ete tapee', '2026-12-01T09:00', saisieDepuisOuverture(ouv));
dit('une minute avant 9 h a Cotonou, fermee', false, boutiqueOuverte(ouv, le('2026-12-01T07:59:00Z')));
dit('a 9 h a Cotonou, ouverte', true, boutiqueOuverte(ouv, le('2026-12-01T08:00:00Z')));
dit('une saisie incomplete ne pose pas de date', '', ouvertureDepuisSaisie('2026-12-01'));

/* ── 2. Les saisons ───────────────────────────────────────────────────── */
dit('le mois se lit a Cotonou : 23 h 30 a Londres le 30 septembre, c est octobre', 10, moisDeCotonou(le('2026-09-30T23:30:00Z')));
dit('Edition d octobre = mois 10', 10, moisDeLEdition('Édition d’octobre'));
dit('Edition de janvier = mois 1', 1, moisDeLEdition('Édition de janvier'));
dit('Edition d aout = mois 8', 8, moisDeLEdition('Édition d’août'));
dit('Octobre Rose se vend en septembre', true, enSaison(10, 9));
dit('Octobre Rose se vend en octobre', true, enSaison(10, 10));
dit('Octobre Rose ne se vend plus en novembre', false, enSaison(10, 11));
dit('Nouvel An se vend en decembre (le mois d avant)', true, enSaison(1, 12));
dit('Nouvel An ne se vend plus en fevrier', false, enSaison(1, 2));
dit('un article sans edition se vend toute l annee', true, enSaison(0, 6));

/* ── 3. Les articles à poser ──────────────────────────────────────────── */
const ids = ARTICLES.map((a) => a.id);
dit('73 articles : 13 soins, 12 Maison, 8 MND 229, 16 Kids, 24 shorts', 73, ARTICLES.length);
dit('aucun identifiant en double', ids.length, new Set(ids).size);
dit('tous prefixes bq-', true, ids.every((i) => i.startsWith(PREFIXE)));
const parRayon = Object.fromEntries(RAYONS.map((r) => [r.id, ARTICLES.filter((a) => a.boutique.rayon === r.id && !a.boutique.shortDe).length]));
dit('les rayons comptent ce que la maquette montrait', { quotidien: 4, soin: 4, accessoires: 2, coffrets: 3, maison: 12, mnd229: 8, kids: 16 }, parRayon);
const shorts = ARTICLES.filter((a) => a.boutique.shortDe);
dit('24 shorts, chacun rattache a un t-shirt qui le montre', true, shorts.length === 24 && shorts.every((s) => {
  const t = ARTICLES.find((a) => a.id === s.boutique.shortDe);
  return !!t && t.boutique.short === s.boutique.image && JSON.stringify(t.boutique.tailles) === JSON.stringify(s.boutique.tailles);
}));
dit('L Atelier (05) reste a l equipe : il n est pas en vente', false, ids.includes('bq-vest-05'));
const images = ARTICLES.flatMap((a) => [a.boutique.image, a.boutique.dos, a.boutique.short].filter(Boolean) as string[]);
const manquantes = images.filter((f) => !existsSync(path.join(racine, 'public/assets/boutique', f)));
dit('chaque image nommee existe dans public/assets/boutique', [], manquantes);
dit('les dix prix tapes par elle dans la maquette', {
  'bq-apres-shampoing': 6000, 'bq-baume': 6000, 'bq-brume': 6000, 'bq-gel-retwist': 5000, 'bq-huile': 12000,
  'bq-pinces-lingettes': 2500, 'bq-rafraichissant': 8000, 'bq-satin': 4000, 'bq-shampoing': 10000, 'bq-spray-apaisant': 5500,
}, Object.fromEntries(ARTICLES.filter((a) => (a.priceXof ?? 0) > 0).map((a) => [a.id, a.priceXof]).sort((x, y) => String(x[0]).localeCompare(String(y[0])))));
dit('les habits ont leurs tailles (XS a XXL, 3-4 ans a 13-14 ans), Bouh ! s arrete a 9-10 ans', true,
  ARTICLES.filter((a) => a.boutique.rayon === 'maison' || a.boutique.rayon === 'mnd229').every((a) => JSON.stringify(a.boutique.tailles) === JSON.stringify(ADULTE))
  && ARTICLES.filter((a) => a.boutique.rayon === 'kids' && a.id !== 'bq-kids-t-bouh').every((a) => JSON.stringify(a.boutique.tailles) === JSON.stringify(ENFANT))
  && JSON.stringify(ARTICLES.find((a) => a.id === 'bq-kids-t-bouh')!.boutique.tailles) === JSON.stringify(ENFANT.slice(0, 4)));
const textes = JSON.stringify(ARTICLES);
dit('aucun tiret cadratin dans les fiches', false, textes.includes('—'));
dit('jamais le mot salon dans les fiches', false, /\bsalon\b/i.test(textes));
const poses = articlesAPoser([]);
dit('poser dans un catalogue vide : 73 produits, ligne de la Boutique, stock a zero', [73, true, true],
  [poses.length, poses.every((p) => p.categoryId === CATEGORIE_BOUTIQUE), poses.every((p) => p.stock === 0)]);
const existant = [{ id: 'bq-brume', order: 40, priceXof: 9999 }, { id: 'pr-durag-en-soie', order: 12 }];
const reposes = articlesAPoser(existant);
dit('reposer n ecrase jamais un article deja la (prix retouche garde)', [72, false], [reposes.length, reposes.some((p) => p.id === 'bq-brume')]);
dit('les nouveaux se rangent apres le plus grand ordre existant', 41, reposes[0]?.order);

/* ── 4. L'état d'un article ───────────────────────────────────────────── */
const OCT = le('2026-10-22T10:00:00Z');
const art = (id: string, prix: number, stock: number, extra: Partial<ArticleLu['boutique']> = {}): ArticleLu => {
  const s = ARTICLES.find((a) => a.id === id)!;
  return { id, name: s.name, priceXof: prix, stock, boutique: { ...s.boutique, ...extra } as ArticleLu['boutique'] };
};
dit('avec prix et stock, la brume se vend', 'vendable', etatDeLArticle(art('bq-brume', 6000, 4), OCT));
dit('sans prix, Bientot', 'bientot', etatDeLArticle(art('bq-kit', 0, 4), OCT));
dit('sans stock, Bientot', 'bientot', etatDeLArticle(art('bq-brume', 6000, 0), OCT));
dit('retiree de la vente par la Maison, Bientot', 'bientot', etatDeLArticle(art('bq-brume', 6000, 4, { enVente: false }), OCT));
dit('un short n a pas de carte', 'cache', etatDeLArticle(art('bq-vest-01-short', 9000, 3), OCT));
dit('Octobre Rose se montre en octobre', 'vendable', etatDeLArticle(art('bq-vest-06', 12000, 3), OCT));
dit('Noel ne se montre pas en octobre', 'cache', etatDeLArticle(art('bq-vest-07', 12000, 3), OCT));
dit('Noel se montre en novembre', 'vendable', etatDeLArticle(art('bq-vest-07', 12000, 3), le('2026-11-05T10:00:00Z')));
const tous = [art('bq-vest-06', 12000, 3), art('bq-vest-07', 12000, 3), art('bq-vest-01', 12000, 3), art('bq-vest-01-short', 9000, 3)];
dit('le rayon de la Maison en octobre : ni Noel ni le short', ['bq-vest-01', 'bq-vest-06'], articlesDuRayon(tous, 'maison', OCT).map((a) => a.id));
dit('un short se vend si son t-shirt se montre et s il a prix et stock', true, shortVendable(art('bq-vest-01-short', 9000, 3), art('bq-vest-01', 12000, 3), OCT));
dit('le short de Noel ne se vend pas hors saison', false, shortVendable(art('bq-vest-07-short', 9000, 3), art('bq-vest-07', 12000, 3), OCT));

/* ── 5. Une commande ──────────────────────────────────────────────────── */
const OUVERTE = '2026-10-01T09:00:00+01:00';
const catalogue: ArticleLu[] = [
  art('bq-brume', 6000, 5), art('bq-huile', 12000, 1), art('bq-vest-01', 12000, 4), art('bq-vest-01-short', 9000, 2),
  art('bq-kids-t-nom', 8000, 3), art('bq-vest-07', 12000, 3), art('bq-vest-07-short', 9000, 3), art('bq-kit', 0, 5),
];
const commande = (lignes: any[], extra: Record<string, unknown> = {}) => chiffreLaCommande({
  lignes, catalogue, remise: 'retrait', fraisLivraisonXof: 2000, ouverture: OUVERTE, maintenant: OCT, ...extra,
} as any);
const refus = (r: ReturnType<typeof chiffreLaCommande>) => (r.ok ? 'ok' : r.refus);
dit('Boutique fermee : aucune commande', 'fermee', refus(commande([{ id: 'bq-brume', qte: 1 }], { ouverture: undefined })));
dit('panier vide refuse', 'vide', refus(commande([])));
dit('un article inconnu refuse', 'inconnu', refus(commande([{ id: 'bq-rien', qte: 1 }])));
dit('un article sans prix ne se commande pas', 'pas-en-vente', refus(commande([{ id: 'bq-kit', qte: 1 }])));
dit('un article hors saison ne se commande pas', 'pas-en-vente', refus(commande([{ id: 'bq-vest-07', qte: 1, taille: 'M' }])));
dit('son short non plus', 'pas-en-vente', refus(commande([{ id: 'bq-vest-07-short', qte: 1, taille: 'M' }])));
dit('un habit sans taille refuse', 'taille', refus(commande([{ id: 'bq-vest-01', qte: 1 }])));
dit('une taille qui n existe pas refuse', 'taille', refus(commande([{ id: 'bq-vest-01', qte: 1, taille: '5-6 ans' }])));
dit('une taille sur un soin refuse', 'taille', refus(commande([{ id: 'bq-brume', qte: 1, taille: 'M' }])));
dit('le t-shirt Nom de couronne attend son nom', 'perso', refus(commande([{ id: 'bq-kids-t-nom', qte: 1, taille: '5-6 ans' }])));
dit('plus que le stock, meme en deux lignes, refuse', 'stock', refus(commande([{ id: 'bq-vest-01-short', qte: 1, taille: 'S' }, { id: 'bq-vest-01-short', qte: 2, taille: 'M' }])));
dit('zero ou onze pieces refuse', ['trop', 'trop'], [refus(commande([{ id: 'bq-brume', qte: 0 }])), refus(commande([{ id: 'bq-brume', qte: 11 }]))]);
dit('la livraison attend une adresse', 'adresse', refus(commande([{ id: 'bq-brume', qte: 1 }], { remise: 'livraison' })));
const ok = commande([{ id: 'bq-brume', qte: 2, prix: 1 }, { id: 'bq-vest-01', qte: 1, taille: 'M' }, { id: 'bq-vest-01-short', qte: 1, taille: 'M' }, { id: 'bq-kids-t-nom', qte: 1, taille: '5-6 ans', perso: 'le Lion du matin' }]);
dit('au retrait : le compte du catalogue, un prix venu du navigateur ignore, retrait offert', [true, 12000 + 12000 + 9000 + 8000, 0, 41000], ok.ok ? [true, ok.produitsXof, ok.fraisXof, ok.totalXof] : [false]);
const liv = commande([{ id: 'bq-huile', qte: 1 }], { remise: 'livraison', adresse: 'Fidjrosse, pres de la plage' });
dit('en livraison, les frais de Parametres s ajoutent', [true, 14000], liv.ok ? [true, liv.totalXof] : [false]);

/* ── 6. Ce que doit une pièce au moment de payer ──────────────────────── */
const prix = (id: string) => ({ 'bq-brume': 6000, 'bq-huile': 12000 } as Record<string, number>)[id] ?? 0;
dit('une ligne baissee par le navigateur paie le prix du catalogue', 12000, duDeLaPiece([{ produitId: 'bq-brume', qty: 2, unitXof: 100 }], prix));
dit('un prix baisse depuis la commande : la commande garde son prix', 16000, duDeLaPiece([{ produitId: 'bq-brume', qty: 2, unitXof: 8000 }], prix));
dit('la livraison ecrite se paie telle quelle', 14000, duDeLaPiece([{ produitId: 'bq-huile', qty: 1, unitXof: 12000 }, { label: 'Livraison', qty: 1, unitXof: 2000 }], prix));

/* ── 7. Le numéro et la référence ─────────────────────────────────────── */
dit('la cle d un numero : ses huit derniers chiffres', ['51997799', '51997799'], [cleDuNumero('+229 01 51 99 77 99'), cleDuNumero('01 51 99 77 99')]);
dit('un numero trop court n est pas valable', false, numeroValable('97 77'));
dit('la reference KkiaPay d une commande se relit', 'abc-123', commandeDeLaReference(referenceDePaiement('abc-123')));
dit('une reference etrangere ne designe aucune commande', '', commandeDeLaReference('cc-abc'));

/* ── 8. Le serveur porte la même règle ────────────────────────────────── */
dit('la fonction boutique porte la copie EXACTE de boutique-pur.ts', copieAttendue(racine), copieDuServeur(racine));
const serveur = sansCommentaires(lis('supabase/functions/boutique/index.ts'));
dit('commander chiffre par le juge, jamais un total du corps', [true, false, false],
  [serveur.includes('chiffreLaCommande({'), /b\.(totalXof|prix|priceXof|unitXof)/.test(serveur), /lignes\[[^\]]*\]\.unitXof/.test(serveur)]);
dit('regler relit KkiaPay et controle le montant contre la piece ET le catalogue', [true, true, true],
  [serveur.includes('await transaction(transactionId)'), serveur.includes('duDeLaPiece('), /paye \+ 1 < attendu/.test(serveur)]);
dit('une transaction ne regle qu une piece (registre, cle = transaction)', true, serveur.includes("String(inscrit?.data?.partnerId ?? '') !== reference"));
dit('une commande fermee se refuse au serveur aussi (le juge lit l ouverture)', true, serveur.includes('ouverture: cfg.boutique?.ouverture'));
dit('une cliente de Ma Couronne est rattachee a SA FICHE (adoptee : authUserId), jamais a son seul compte', [true, true],
  [serveur.includes("eq('data->>authUserId', uid)"), /const fiche = await ficheDuCompte\(clienteJeton\)/.test(serveur)]);
const recus = lis('src/shared/receipts.ts');
dit('le registre compte une commande payee une fois : par sa piece, pas par la transaction', [true, true],
  [recus.includes("versementsBoutique.has(`kkia-${p.id}`)"), recus.includes("'Commande de la Boutique, à rapprocher'")]);

console.log(`\n${n - ko}/${n} epreuves de la Boutique tiennent.`);
if (ko) console.log(`${ko} ECHEC(S).`);
