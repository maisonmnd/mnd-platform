/* LE COFFRE ET LES PRÊTS — les invariants qui touchent l'argent.

   Trois choses doivent tenir, et aucune n'est cosmétique : la somme des
   objectifs plus le non-fléché fait TOUJOURS le coffre ; un solde de prêt ne
   passe jamais sous zéro ; et un objectif sans échéance n'est jamais dit
   « en retard ». */

import {
  recuParObjectif, coffreNonFleche, coffreBalance, moisPourAtteindre,
  flecherVersObjectif, flechableVers, rythmeDuPlan,
  jalonsDeLObjectif, etatDeLObjectif, planPourTenir, moisEntre, moisPlusISO, attenduAuJour, objectifsASurveiller,
  recuDansSaDevise, coffreBalanceMaison, compartimentEtranger, deviseDuCompartiment,
  empreinteDuCode, caisseDiscrete, surLeTiroir, montantMuet, caisseParDefaut, type Cashbox,
  type CoffreMovement, type ObjectifCoffre,
} from '../src/shared/finance';
import { montantsDuTiroir } from '../src/apps/trone/routes/finances/tiroirs';
import { fmtDay } from '../src/apps/trone/routes/finances/_shared';
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

/* ── LA DATE D’UNE LIGNE EST LA SIENNE — 23 août 2026 ──────────────
   « Toutes les caisses sont au 23 août. » Elles ne l’étaient pas : `fmtDay`
   était écrit `new Date()` au lieu de `new Date(iso)` — il ignorait la date
   qu’on lui passait et rendait celle du jour, pour chaque ligne de chaque
   caisse. Faute de copie, née en extrayant `tiroirs.tsx` des Dépenses.

   UN FORMATEUR QUI IGNORE SON ARGUMENT NE SE VOIT PAS À LA RELECTURE — il rend
   une date plausible. Il se voit ici : deux dates différentes doivent rendre
   deux textes différents, et une date connue doit rendre son propre jour. */
dit('le 22 août rend bien « 22 »', true, fmtDay('2026-08-22').includes('22'));
dit('le 5 mai rend bien « 5 »', true, fmtDay('2026-05-05').includes('5'));
dit('… et son mois', true, fmtDay('2026-05-05').includes('mai'));
dit('deux jours différents ne rendent pas le même texte', false,
  fmtDay('2026-08-22') === fmtDay('2026-08-23'));
dit('une date vide ne rend rien', '', fmtDay(''));


/* ── LE PLAN D’UN OBJECTIF ET SES JALONS — 23 août 2026 ────────────
   « Un objectif doit avoir des milestones, tout comme les programmes de
   remboursement pour les prêts. » Une cible sans chemin ne s’atteint que par
   chance : ces assertions tiennent le calcul des jalons, l’imputation des
   versements, et les deux issues d’un retard — rattraper ou accepter. */
/* L’IDENTIFIANT PASSÉ DOIT ÊTRE CELUI DE L’OBJET — ce montage l’écrasait par
   'o1', et le harnais interrogeait alors un objectif qui n’avait rien reçu.
   La faute était dans le montage, pas dans le code : c’est exactement pour ça
   qu’on écrit les deux côtés. */
const objBase = (o: Partial<ObjectifCoffre>): ObjectifCoffre => ({
  id: o.id ?? 'o1', branchId: 'br', nom: o.nom ?? 'Vacances',
  cibleXof: o.cibleXof != null ? o.cibleXof : 7_000_000,
  echeance: o.echeance, plan: o.plan, jalons: o.jalons, clos: o.clos,
} as ObjectifCoffre);

const versement = (montant: number, date: string, objectifId = 'o1'): CoffreMovement => ({
  id: `v-${date}-${montant}`, branchId: 'br', kind: 'depot',
  amountXof: montant, date, objectifId,
} as CoffreMovement);

/* LE PLAN SE DÉROULE DE MOIS EN MOIS, et le jour du mois ne saute jamais. */
const planSimple = objBase({ plan: { premier: '2026-06-30', nombre: 3, montantXof: 500_000 } });
dit('trois jalons sont attendus', 3, jalonsDeLObjectif(planSimple).length);
dit('ils tombent de mois en mois',
  ['2026-06-30', '2026-07-30', '2026-08-30'],
  jalonsDeLObjectif(planSimple).map((j) => j.date));

/* LES JALONS POSÉS À LA MAIN FONT FOI — nommés, ils l’emportent sur le rythme. */
const aLaMain = objBase({
  plan: { premier: '2026-06-30', nombre: 3, montantXof: 500_000 },
  jalons: [
    { id: 'j2', date: '2026-08-30', montantXof: 250_000, nom: 'Solde' },
    { id: 'j1', date: '2026-06-30', montantXof: 500_000, nom: 'Acompte' },
  ],
});
dit('les jalons à la main l’emportent', 2, jalonsDeLObjectif(aLaMain).length);
dit('… et se rangent par date', ['Acompte', 'Solde'], jalonsDeLObjectif(aLaMain).map((j) => j.nom));

/* CE QUI EST VERSÉ COUVRE LE PLUS ANCIEN D’ABORD — la règle du comptoir.
   850 000 solde juin (500 000) et entame juillet (350 000). */
const etat = etatDeLObjectif(planSimple, [versement(850_000, '2026-07-05')], '2026-08-23');
dit('le premier jalon est versé', 'verse', etat.jalons[0].etat);
dit('le deuxième est entamé', 'partiel', etat.jalons[1].etat);
dit('… de 350 000', 350_000, etat.jalons[1].couvert);
/* UN JALON À VENIR N’EST PAS UN JALON MANQUÉ. Le 30 août n’est pas échu le 23 :
   le dire « en souffrance » ferait réclamer un argent qui n’est pas encore dû —
   c’est cette assertion qui a pris MON propre calcul en défaut. */
dit('le troisième n’est pas encore dû', 'attendu', etat.jalons[2].etat);
dit('le retard ne compte que les jalons échus', 150_000, etat.retardXof);
dit('un seul jalon échu reste découvert', 1, etat.jalonsManques);
dit('le prochain à servir est celui de juillet', '2026-07-30', etat.prochain?.date);

/* … et le 1er septembre, il l’est. Le temps seul change l’état, sans écriture. */
const apres = etatDeLObjectif(planSimple, [versement(850_000, '2026-07-05')], '2026-09-01');
dit('passé sa date, le jalon est manqué', 'manque', apres.jalons[2].etat);
dit('… et le retard le compte', 650_000, apres.retardXof);
dit('… soit deux jalons découverts', 2, apres.jalonsManques);

/* LE REPÈRE DE LA JAUGE : ce que le plan attendait à ce jour. */
dit('le plan attendait 1 000 000 au 23 août', 1_000_000, attenduAuJour(planSimple, '2026-08-23'));
dit('… et 1 500 000 au 1er septembre', 1_500_000, attenduAuJour(planSimple, '2026-09-01'));

/* L’EFFORT POUR TENIR : ce qui manque, réparti sur les mois qui restent.
   6 150 000 à trouver d’ici mars 2027, soit 7 mois → 878 572 par mois. */
const avecDate = objBase({
  echeance: '2027-03', plan: { premier: '2026-06-30', nombre: 3, montantXof: 500_000 },
});
const e2 = etatDeLObjectif(avecDate, [versement(850_000, '2026-07-05')], '2026-08-23');
dit('il manque 6 150 000', 6_150_000, e2.manque);
dit('l’effort pour tenir mars 2027', Math.ceil(6_150_000 / 7), e2.effortPourTenir);
dit('… et la date n’est pas tenable au rythme actuel', false, e2.tientLaDate);

/* RATTRAPER : le plan se réécrit sur les mois restants, au nouvel effort. */
const rattrape = planPourTenir(avecDate, [versement(850_000, '2026-07-05')], '2026-08-23');
dit('le plan rattrapé couvre les mois restants', 7, rattrape?.nombre);
dit('… au nouvel effort mensuel', Math.ceil(6_150_000 / 7), rattrape?.montantXof);
dit('… et garde le jour du mois d’origine', '30', rattrape?.premier.slice(8, 10));

/* SANS ÉCHÉANCE, RIEN À TENIR : on ne réclame pas une date qu’on n’a pas posée. */
const nu = objBase({ plan: undefined });
const e3 = etatDeLObjectif(nu, [], '2026-08-23');
dit('sans plan, aucun jalon', 0, e3.jalons.length);
dit('… aucun retard', 0, e3.retardXof);
dit('… et il se signale comme tel', true, e3.sansPlan);
dit('sans échéance, aucun effort réclamé', 0, e3.effortPourTenir);

/* ATTEINT : plus rien n’est dû, et la date est tenue par définition. */
const fini = etatDeLObjectif(planSimple, [versement(7_000_000, '2026-07-05')], '2026-08-23');
dit('un objectif atteint ne manque de rien', 0, fini.manque);
dit('… et ne se dit jamais en retard', 0, fini.retardXof);
dit('… ni hors des temps', true, fini.tientLaDate);

/* Le Tableau de bord ne montre que ce qui presse. */
const veilleObj = objectifsASurveiller(
  [objBase({ id: 'o1', plan: { premier: '2026-08-27', nombre: 1, montantXof: 500_000 } }),
   { ...objBase({ plan: { premier: '2027-06-30', nombre: 1, montantXof: 500_000 } }), id: 'o2', nom: 'Loin' }],
  [], 'br', '2026-08-23',
);
dit('seul le jalon proche remonte', ['Vacances'], veilleObj.map((e) => e.objectif.nom));

dit('le décompte des mois est juste', 7, moisEntre('2026-08', '2027-03'));
dit('le 31 janvier plus un mois tombe au 28', '2026-02-28', moisPlusISO('2026-01-31', 1));


/* ── FLÉCHER DE L’ARGENT DÉJÀ AU COFFRE — 23 août 2026 ─────────────
   « Pouvoir mettre à jour le montant de l’objectif. » Le coffre tenait presque
   quinze millions et les objectifs affichaient zéro : seul un NOUVEAU versement
   pouvait nommer un objectif. Flécher déplace une part du disponible vers un
   but — et le total du coffre ne doit pas bouger d’un franc. */
const auCoffre: CoffreMovement[] = [
  { id: 'd1', branchId: 'br', kind: 'depot', amountXof: 10_000_000, date: '2026-05-14' } as CoffreMovement,
];
const cible = objBase({ id: 'oF', cibleXof: 7_000_000 });

dit('tout le disponible peut être fléché, dans la limite de la cible',
  7_000_000, flechableVers(auCoffre, cible));

const paire = flecherVersObjectif({
  branchId: 'br', objectifId: 'oF', nomObjectif: 'Vacances',
  montantXof: 3_000_000, date: '2026-08-23',
});
const apresFlechage = [...auCoffre, ...paire];

dit('le fléchage écrit deux lignes', 2, paire.length);
/* LE TOTAL NE BOUGE PAS — c’est tout l’objet de la paire. */
dit('le coffre contient autant qu’avant',
  coffreBalance([...auCoffre]), coffreBalance(apresFlechage));
dit('l’objectif a reçu les trois millions', 3_000_000, recuParObjectif(apresFlechage, 'oF'));
dit('le disponible en a perdu autant', 7_000_000, coffreNonFleche(apresFlechage));

/* L’INVARIANT DE LA MAISON, celui qui tient tout le coffre : la somme des
   objectifs plus le non-fléché fait TOUJOURS le coffre. */
dit('objectifs + non fléché = coffre, après fléchage',
  coffreBalance(apresFlechage),
  recuParObjectif(apresFlechage, 'oF') + coffreNonFleche(apresFlechage));

/* ON NE FLÈCHE PAS PLUS QUE LE DISPONIBLE, ni plus que ce qui manque. */
dit('après fléchage, il ne reste flèchable que ce qui manque',
  4_000_000, flechableVers(apresFlechage, cible));
dit('un coffre vide n’offre rien à flécher', 0, flechableVers([], cible));

/* Un compartiment sans cible accepte tout le disponible — il ne vise rien. */
dit('un compartiment prend tout le disponible',
  10_000_000, flechableVers(auCoffre, objBase({ id: 'oC', cibleXof: 0 })));


/* ── LE RYTHME SE LAISSE MENER — 23 août 2026 ──────────────────────
   « Le calcul du rythme régulier ne fonctionne pas, le montant est figé à
   1 142 858. » Il l’était : le nombre se déduisait toujours de l’échéance, et
   le montant de ce nombre-là. Passer de 7 à 12 versements laissait le montant
   sur sa division d’origine.

   LE CALCUL VIVAIT DANS L’ÉCRAN — donc hors de portée d’un harnais, et c’est
   exactement pourquoi il a pu être faux sans que rien ne le dise. Il vit
   maintenant ici, et ces assertions le tiennent. */
const rythmeNu = { reste: 8_000_000, echeance: '2027-03', aujourdhui: '2026-08-23' };

/* Sans rien poser, c’est l’échéance qui décide : 7 mois d’août à mars. */
const parDefaut = rythmeDuPlan(rythmeNu);
dit('sans rien poser, le nombre vient de l’échéance', 7, parDefaut.nombre);
dit('… et le montant en découle', Math.ceil(8_000_000 / 7), parDefaut.montantXof);

/* POSER LE NOMBRE DÉCIDE DU MONTANT — c’est LA faute corrigée. */
const douze = rythmeDuPlan({ ...rythmeNu, nombreSaisi: 12 });
dit('douze versements donnent douze', 12, douze.nombre);
dit('… et le montant SUIT le nombre', Math.ceil(8_000_000 / 12), douze.montantXof);
dit('le montant n’est plus figé sur la division d’origine', false,
  douze.montantXof === parDefaut.montantXof);

/* POSER LE MONTANT DÉCIDE DU NOMBRE — la liberté inverse. */
const parMois = rythmeDuPlan({ ...rythmeNu, parMoisSaisi: 1_000_000 });
dit('un million par mois demande huit versements', 8, parMois.nombre);
dit('… et garde le montant tel qu’il a été posé', 1_000_000, parMois.montantXof);

/* LE NOMBRE POSÉ L’EMPORTE quand les deux le sont : c’est le dernier champ
   touché qui mène, et l’écran vide l’autre en même temps. */
const lesDeux = rythmeDuPlan({ ...rythmeNu, nombreSaisi: 4, parMoisSaisi: 1_000_000 });
dit('le nombre posé mène', 4, lesDeux.nombre);
dit('… et le montant se recalcule', Math.ceil(8_000_000 / 4), lesDeux.montantXof);

/* LE DERNIER JALON DIT LA VÉRITÉ SUR LA DATE. Douze versements à partir du
   28 septembre finissent en août suivant — cinq mois après une échéance de
   mars. Le taire laisserait croire que le plan tient la date. */
dit('sept versements tiennent l’échéance', false, parDefaut.apresLEcheance);
dit('douze la dépassent', true, douze.apresLEcheance);
dit('… et le dernier tombe en août 2027', '2027-08', douze.dernier.slice(0, 7));

/* Un reste nul ne fabrique pas un plan absurde. */
const rien = rythmeDuPlan({ ...rythmeNu, reste: 0 });
dit('sans reste, le montant est nul', 0, rien.montantXof);
dit('… et le nombre reste au moins un', true, rien.nombre >= 1);


/* ── LA CAISSE QUI S’OFFRE D’ABORD — 24 août 2026 ──────────────────
   « Je ne veux pas que ce soit la caisse Euro la première à apparaître. » Le
   formulaire prenait la première venue : un tiroir en euros se proposait pour
   payer un achat en francs, et le montant s’annonçait en EUR.

   LA MONNAIE DE LA MAISON PASSE D’ABORD ; ensuite, l’ordre voulu tranche. */
const rangee: Cashbox[] = [
  { id: 'k1', branchId: 'br', name: 'Tiroir EUR', currency: 'EUR' } as Cashbox,
  { id: 'k2', branchId: 'br', name: 'Real Money', currency: '' } as Cashbox,
  { id: 'k3', branchId: 'br', name: 'Caisse Principale', currency: '' } as Cashbox,
  { id: 'k4', branchId: 'zz', name: 'Cotonou XOF', currency: '' } as Cashbox,
];

dit('le tiroir en euros ne s’offre plus le premier',
  'Real Money', caisseParDefaut(rangee, 'br', 'XOF')?.name);

/* L’ORDRE VOULU TRANCHE ENSUITE — « Ranger les caisses » décide, et non un nom
   codé en dur : remonter la Caisse Principale suffit à la faire proposer. */
const rangeeAutrement = [rangee[0], rangee[2], rangee[1], rangee[3]];
dit('l’ordre voulu décide entre deux caisses de la Maison',
  'Caisse Principale', caisseParDefaut(rangeeAutrement, 'br', 'XOF')?.name);

/* UNE CAISSE D’UNE AUTRE BRANCHE NE SE PROPOSE JAMAIS. */
dit('la caisse d’une autre branche reste chez elle',
  'Cotonou XOF', caisseParDefaut(rangee, 'zz', 'XOF')?.name);

/* SANS CAISSE DANS LA MONNAIE DE LA MAISON, mieux vaut un tiroir en devise que
   pas de tiroir du tout — le formulaire ne doit pas s’ouvrir vide. */
dit('à défaut, la première venue',
  'Tiroir EUR', caisseParDefaut([rangee[0]], 'br', 'XOF')?.name);
dit('aucune caisse ne rend rien', undefined, caisseParDefaut([], 'br', 'XOF'));

/* Une maison qui tient ses comptes en euros veut, elle, le tiroir EUR. */
dit('la monnaie de la Maison, quelle qu’elle soit',
  'Tiroir EUR', caisseParDefaut(rangee, 'br', 'EUR')?.name);


console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
if (ko > 0) process.exit(1);
