/* LE COFFRE ET LES PRÊTS — les invariants qui touchent l'argent.

   Trois choses doivent tenir, et aucune n'est cosmétique : la somme des
   objectifs plus le non-fléché fait TOUJOURS le coffre ; un solde de prêt ne
   passe jamais sous zéro ; et un objectif sans échéance n'est jamais dit
   « en retard ». */

import {
  recuParObjectif, coffreNonFleche, coffreBalance, moisPourAtteindre,
  recuDansSaDevise, coffreBalanceMaison, compartimentEtranger, deviseDuCompartiment,
  empreinteDuCode, caisseDiscrete, surLeTiroir, montantMuet, type Cashbox,
  type CoffreMovement, type ObjectifCoffre,
} from '../src/shared/finance';
import { montantsDuTiroir } from '../src/apps/trone/routes/finances/tiroirs';
import { soldesParEmprunteur, resteDuPar, detteEnCours, type Pret } from '../src/shared/foyer';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const dep = (id: string, xof: number, date: string, objectifId?: string): CoffreMovement =>
  ({ id, branchId: 'br', kind: 'depot', amountXof: xof, date, ...(objectifId ? { objectifId } : {}) } as CoffreMovement);
const vir = (id: string, xof: number, date: string, objectifId?: string): CoffreMovement =>
  ({ id, branchId: 'br', kind: 'virement', amountXof: xof, date, ...(objectifId ? { objectifId } : {}) } as CoffreMovement);

const obj = (id: string, cible: number, echeance?: string): ObjectifCoffre =>
  ({ id, branchId: 'br', nom: id, cibleXof: cible, ...(echeance ? { echeance } : {}) });

/* ── ① LE COFFRE SE RETROUVE TOUJOURS ─────────────────────────────
   L'invariant qui compte le plus : ce qui est fléché plus ce qui ne l'est pas
   doit faire le solde réel. S'il manquait un franc quelque part, la Maison
   croirait avoir mis de côté ce qu'elle n'a pas. */
const coffre = [
  dep('m1', 400_000, '2026-06-10', 'scolarite'),
  dep('m2', 220_000, '2026-07-10', 'scolarite'),
  dep('m3', 150_000, '2026-07-12', 'voyage'),
  dep('m4', 95_000, '2026-08-01'),
];
const totalFleche = ['scolarite', 'voyage'].reduce((n, id) => n + recuParObjectif(coffre, id), 0);
dit('scolarité a reçu 620 000', 620_000, recuParObjectif(coffre, 'scolarite'));
dit('voyage a reçu 150 000', 150_000, recuParObjectif(coffre, 'voyage'));
dit('le non-fléché vaut 95 000', 95_000, coffreNonFleche(coffre));
dit('fléché + non-fléché = le coffre', coffreBalance(coffre), totalFleche + coffreNonFleche(coffre));

/* Un virement fléché retire de SON objectif, et l'invariant tient encore. */
const coffre2 = [...coffre, vir('m5', 100_000, '2026-08-15', 'scolarite')];
dit('un virement fléché diminue son objectif', 520_000, recuParObjectif(coffre2, 'scolarite'));
dit('… et le compte se retrouve toujours',
  coffreBalance(coffre2),
  recuParObjectif(coffre2, 'scolarite') + recuParObjectif(coffre2, 'voyage') + coffreNonFleche(coffre2));

/* Vider un objectif le met à ZÉRO, jamais en dette : un objectif ne doit rien. */
dit('un objectif vidé tombe à zéro, pas en négatif', 0,
  recuParObjectif([dep('a', 50_000, '2026-01-01', 'x'), vir('b', 80_000, '2026-02-01', 'x')], 'x'));

/* ── ② LE RYTHME, ET CE QU'IL PROMET ─────────────────────────────── */
/* La moyenne porte sur les MOIS OÙ L'ON A VERSÉ, pas sur le calendrier : un
   objectif ouvert en janvier et nourri en août paraîtrait sinon huit fois plus
   lent qu'il n'est. Ici 620 000 en deux mois = 310 000/mois ; il manque
   280 000 → un mois. */
dit('deux versements, deux mois, un mois pour finir', 1,
  moisPourAtteindre(coffre, obj('scolarite', 900_000, '2027-09')));
dit('un objectif atteint ne demande plus de mois', 0,
  moisPourAtteindre(coffre, obj('scolarite', 500_000)));
/* Sans le moindre versement, on ne peut RIEN promettre — et on le dit en
   rendant `null` plutôt qu'un zéro qui se lirait « c'est fait ». */
dit('sans versement, aucune promesse', null, moisPourAtteindre(coffre, obj('neuf', 300_000)));
/* Un objectif SANS ÉCHÉANCE se calcule quand même, mais l'écran ne le juge
   jamais : on ne reproche pas un retard à qui n'a pas donné de date. */
dit('sans échéance, le rythme se dit tout de même', 2,
  moisPourAtteindre(coffre, obj('voyage', 450_000)));
dit('… et l’objectif ne porte pas d’échéance à juger', undefined, obj('voyage', 450_000).echeance);

/* ── ③ LES PRÊTS ─────────────────────────────────────────────────── */
const pret = (id: string, type: 'pret' | 'remboursement', nom: string, xof: number, date: string, extra: Partial<Pret> = {}): Pret =>
  ({ id, branchId: 'br', date, type, associe: nom, motif: '', amountXof: xof, ...extra });

const prets: Pret[] = [
  pret('p1', 'pret', 'Gérard T.', 200_000, '2026-06-03', { genre: 'equipe', personneId: 'st-1' }),
  pret('p2', 'remboursement', 'Gérard T.', 120_000, '2026-08-12', { genre: 'equipe', personneId: 'st-1' }),
  pret('p3', 'pret', 'Assetina S.', 45_000, '2026-07-02', { genre: 'cliente', personneId: 'cl-1' }),
  pret('p4', 'remboursement', 'Assetina S.', 45_000, '2026-08-03', { genre: 'cliente', personneId: 'cl-1' }),
];
const soldes = soldesParEmprunteur(prets, 'br');
dit('deux emprunteurs', 2, soldes.length);
dit('Gérard doit encore 80 000', 80_000, soldes.find((s) => s.nom === 'Gérard T.')?.reste);
dit('Assetina est soldée', 0, soldes.find((s) => s.nom === 'Assetina S.')?.reste);
dit('le classement met le débiteur en tête', 'Gérard T.', soldes[0].nom);
dit('la dette de la Maison fait la somme des restes', 80_000, detteEnCours(prets, 'br'));

/* UN TROP-REMBOURSÉ EST UNE ERREUR DE SAISIE, PAS UNE DETTE DE LA MAISON.
   Sans ce plancher, l'écran annoncerait que la Maison doit de l'argent à qui
   lui en a emprunté — et le total général deviendrait faux. */
const trop = [...prets, pret('p5', 'remboursement', 'Gérard T.', 500_000, '2026-08-20', { genre: 'equipe', personneId: 'st-1' })];
dit('un trop-remboursé ne passe pas sous zéro', 0, soldesParEmprunteur(trop, 'br').find((s) => s.nom === 'Gérard T.')?.reste);
dit('… ni pour une personne prise à part', 0, resteDuPar(trop, 'st-1'));
dit('reste dû par Gérard avant l’erreur', 80_000, resteDuPar(prets, 'st-1'));
dit('une personne sans prêt ne doit rien', 0, resteDuPar(prets, 'inconnu'));

/* Une autre branche ne pollue jamais le compte. */
const ailleurs = [...prets, pret('p6', 'pret', 'Quelqu’un', 999_000, '2026-08-01', { genre: 'tiers' })];
ailleurs[ailleurs.length - 1].branchId = 'autre';
dit('la branche voisine ne compte pas', 80_000, detteEnCours(ailleurs, 'br'));

/* Les lignes d'AVANT n'ont ni genre ni caisse : elles doivent traverser tout
   ceci sans broncher — leurs soldes sont arrêtés, on n'y touche pas. */
const anciennes: Pret[] = [
  pret('v1', 'pret', 'Foyer', 300_000, '2026-05-01'),
  pret('v2', 'remboursement', 'Foyer', 100_000, '2026-06-01'),
];
dit('une ligne d’avant se lit encore', 200_000, detteEnCours(anciennes, 'br'));
dit('… et son genre retombe sur « foyer »', 'foyer', soldesParEmprunteur(anciennes, 'br')[0].genre);
dit('… sans caisse, comme elle a été saisie', undefined, anciennes[0].cashbox);

/* ── ④ DEUX MONNAIES NE FONT PAS UN TOTAL ────────────────────
   << Il y a des coffres qui ont differentes devises. >> Un compartiment en
   euros compte SES billets ; le solde de la Maison ne les additionne jamais
   a ses francs -- ce serait un nombre qui n'existe nulle part. */
const depFx = (id: string, eur: number, taux: number, date: string, objectifId: string): CoffreMovement =>
  ({ id, branchId: 'br', kind: 'depot', amountXof: Math.round(eur * taux), date, objectifId,
     fx: { code: 'EUR', rate: taux, amount: eur } } as CoffreMovement);

const coffreMixte = [
  dep('x1', 300_000, '2026-06-01', 'scolarite'),
  dep('x2', 95_000, '2026-06-02'),
  depFx('x3', 200, 655, '2026-07-01', 'tiroirEur'),
  depFx('x4', 150, 655, '2026-08-01', 'tiroirEur'),
];
const eur = { id: 'tiroirEur', branchId: 'br', nom: 'Coffre euros', cibleXof: 0, devise: 'EUR' } as ObjectifCoffre;
const xof = obj('scolarite', 900_000);

dit('le compartiment euros compte 350 €', 350, recuDansSaDevise(coffreMixte, eur, 'XOF'));
dit('… et il se sait étranger', true, compartimentEtranger(eur, 'XOF'));
dit('un compartiment muet prend la devise de la Maison', 'XOF', deviseDuCompartiment(xof, 'XOF'));
dit('le compartiment en francs compte des francs', 300_000, recuDansSaDevise(coffreMixte, xof, 'XOF'));

/* LE SOLDE DE LA MAISON EXCLUT LES BILLETS ÉTRANGERS. `coffreBalance`, qui
   somme tout, donnerait 624 250 -- un total qui ne correspond a rien : ni a
   des francs reels, ni a des euros. */
dit('le solde de la Maison ignore les euros', 395_000, coffreBalanceMaison(coffreMixte));
dit('le non-fléché les ignore aussi', 95_000, coffreNonFleche(coffreMixte));
/* L'invariant se rejoue, DANS LA MONNAIE DE LA MAISON seulement. */
dit('fléché en francs + non-fléché = solde Maison',
  coffreBalanceMaison(coffreMixte),
  recuDansSaDevise(coffreMixte, xof, 'XOF') + coffreNonFleche(coffreMixte));

/* ── ⑤ UN COMPARTIMENT NE PROMET RIEN ─────────────────────────
   Sans cible, il n'y a pas de << quand est-ce atteint >> : le dire par null
   plutot que par un zero, qui se lirait << c'est fait >>. */
dit('un compartiment sans cible ne promet rien', null, moisPourAtteindre(coffreMixte, eur));
dit('… même en francs', null,
  moisPourAtteindre(coffre, { id: 'scolarite', branchId: 'br', nom: 'tiroir', cibleXof: 0 } as ObjectifCoffre));

/* ── ⑥ LA CAISSE DISCRETE ─────────────────────────────────────
   << Je veux masquer son solde et le demasquer avec un mot de passe. >>
   Le code n'existe nulle part : seule son empreinte est ecrite. */
const caisse = (id: string, codeHash?: string): Cashbox =>
  ({ id, branchId: 'br', name: id, sub: '', glyph: '◈', openingXof: 0, ...(codeHash ? { codeHash } : {}) });

dit('une caisse sans code n’est pas discrète', false, caisseDiscrete(caisse('c1')));
dit('une caisse avec empreinte l’est', true, caisseDiscrete(caisse('c2', 'abc')));

const h1 = await empreinteDuCode('c1', '1234');
const h2 = await empreinteDuCode('c1', '1234');
const h3 = await empreinteDuCode('c1', '1235');
const h4 = await empreinteDuCode('c2', '1234');

dit('la même caisse et le même code donnent la même empreinte', true, h1 === h2);
dit('un code différent donne une empreinte différente', true, h1 !== h3);
/* LE SEL EST L'IDENTIFIANT DE LA CAISSE : sans lui, deux caisses au meme code
   auraient la meme empreinte, et lire l'une reviendrait a lire l'autre. */
dit('deux caisses au même code n’ont pas la même empreinte', true, h1 !== h4);
/* L'empreinte ne CONTIENT pas le code : c'est tout l'objet de l'exercice. */
dit('l’empreinte ne laisse pas voir le code', false, h1.includes('1234'));
dit('… et fait bien 64 caractères (SHA-256)', 64, h1.length);

/* ── LE TIROIR COMPTE SES BILLETS — 22 août 2026 ───────────────────
   « Ok pour multi-devise. » Toute écriture qui nomme une caisse porte deux
   montants : les francs de la Maison, et ce qui a réellement bougé dans le
   tiroir. La règle tient en une fonction ; ces assertions la tiennent. */
const XOF = 'XOF';
const enFrancs = { amountXof: 18_000 };
const enDollars = { amountXof: 18_000, fx: { code: 'USD', rate: 600, amount: 30 } };
const enEuros = { amountXof: 18_000, fx: { code: 'EUR', rate: 655, amount: 27.5 } };

dit('un tiroir de la Maison compte les francs', 18_000, surLeTiroir(enFrancs, XOF, XOF));
dit('un tiroir en dollars compte les dollars', 30, surLeTiroir(enDollars, 'USD', XOF));
/* LE PIÈGE : additionner des francs à un tiroir en dollars. C’est exactement
   ce que faisait l’écran des dépenses, qui ne filtrait pas les caisses. */
dit('des francs ne tombent JAMAIS dans un tiroir en devise', 0, surLeTiroir(enFrancs, 'USD', XOF));
dit('ni des euros dans le tiroir en dollars', 0, surLeTiroir(enEuros, 'USD', XOF));
/* Et l’inverse : une écriture faite sur un tiroir en dollars ne pèse sur celui
   de la Maison que par ses francs — le fx ne le concerne pas. */
dit('un tiroir de la Maison lit les francs, pas le fx', 18_000, surLeTiroir(enDollars, XOF, XOF));

dit('une écriture muette se signale', true, montantMuet(enFrancs, 'USD', XOF));
dit('une écriture renseignée ne se signale pas', false, montantMuet(enDollars, 'USD', XOF));
dit('rien à signaler dans la monnaie de la Maison', false, montantMuet(enFrancs, XOF, XOF));

/* ── LE FRANC SUIT LE TIROIR — 23 août 2026 ────────────────────────
   « Le montant XOF devrait suivre le montant $ de la caisse choisie. » Le
   champ principal se dit dans la monnaie du tiroir ; la contrepartie en francs
   se remplit au taux indicatif, et fait foi dès qu’on la corrige. */
const tiroirUSD = { id: 'b1', branchId: 'br', name: 'Caisse Pilia', sub: '', glyph: '◈', openingXof: 0, currency: 'USD' } as Cashbox;
const tiroirMaison = { id: 'b2', branchId: 'br', name: 'Comptoir', sub: '', glyph: '◈', openingXof: 0 } as Cashbox;

const enUSD = montantsDuTiroir(tiroirUSD, XOF, '4000', '');
dit('le tiroir reçoit bien ses 4 000 dollars', 4000, enUSD.saisi);
dit('le franc suit tout seul, au taux indicatif', 4000 * 601, enUSD.xof);
dit('et l’écriture porte les deux', { code: 'USD', amount: 4000 }, { code: enUSD.fx?.code, amount: enUSD.fx?.amount });

/* CORRIGÉE À LA MAIN, LA CONTREPARTIE FAIT FOI : le taux figé dans le code
   n’est qu’un point de départ, le change se négocie au comptoir. */
const corrige = montantsDuTiroir(tiroirUSD, XOF, '4000', '2500000');
dit('la contrepartie corrigée l’emporte sur le taux', 2_500_000, corrige.xof);
dit('et le taux inscrit suit la correction', 625, Math.round(corrige.fx!.rate));

const enFrancsSeuls = montantsDuTiroir(tiroirMaison, XOF, '18000', '');
dit('un tiroir de la Maison n’a qu’un seul nombre', 18_000, enFrancsSeuls.xof);
dit('… et n’inscrit aucun fx', undefined, enFrancsSeuls.fx);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
if (ko > 0) process.exit(1);
