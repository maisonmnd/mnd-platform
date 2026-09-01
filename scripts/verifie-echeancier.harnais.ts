/* PAYER EN PLUSIEURS FOIS, ÉPROUVÉ — découpe, arrondi, imputation, retard.
   Lancé par `node scripts/verifie-echeancier.mjs`.

   Ce harnais tient trois choses qui se cassent en silence : la SOMME des parts
   (un franc perdu à l'arrondi devient un écart de caisse un an plus tard),
   l'ORDRE d'imputation (sans lui, « deux échéances de retard » ne veut rien
   dire), et le SEUIL (découper une petite somme coûte plus cher à suivre
   qu'elle ne rapporte). */
import {
  SEUIL_ECHELONNEMENT_XOF, peutEtreEchelonne, construitEcheancier, etatDesEcheances,
  resteDeLEcheancier, enRetardXof, prochaineEcheance, plusVieuxRetardJours, tropVerseXof,
  deplaceEcheance, peutReserver, JOURS_DE_GRACE,
} from '../src/shared/echeancier';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① LE SEUIL EST UNE PORTE ──────────────────────────────────────── */
dit('sous le seuil, on ne découpe pas', false, peutEtreEchelonne(100_000));
dit('au-dessus, on peut', true, peutEtreEchelonne(100_001));
dit('le seuil vaut 100 000', 100_000, SEUIL_ECHELONNEMENT_XOF);

/* ── ② L'ARRONDI VA SUR LA PREMIÈRE ────────────────────────────────
   La somme des parts doit valoir EXACTEMENT le total, sinon un franc se perd
   à chaque vente et se retrouve un an plus tard en écart inexplicable. */
const e4 = construitEcheancier(125_000, 4, '2026-08-28');
dit('quatre parts', [1, 2, 3, 4], e4.map((e) => e.numero));
dit('… qui tombent juste', [31_250, 31_250, 31_250, 31_250], e4.map((e) => e.amountXof));

const bancal = construitEcheancier(100_003, 2, '2026-08-28');
dit('le reste va sur la PREMIÈRE', [50_002, 50_001], bancal.map((e) => e.amountXof));
dit('… et la somme vaut exactement le total', 100_003, bancal.reduce((s, e) => s + e.amountXof, 0));

const bancal4 = construitEcheancier(100_006, 4, '2026-08-28');
dit('en quatre aussi, la somme est exacte', 100_006, bancal4.reduce((s, e) => s + e.amountXof, 0));
dit('… et seule la première porte le reste', [25_003, 25_001, 25_001, 25_001], bancal4.map((e) => e.amountXof));

/* ── ③ LES DATES ────────────────────────────────────────────────────
   La première tombe LE JOUR MÊME : on n'accorde pas un crédit qui commence
   par un délai, la tête repart avec quelque chose de réglé. */
dit('la première est du jour de la signature', '2026-08-28', e4[0].dueIso);
dit('les suivantes sont de trente en trente',
  ['2026-08-28', '2026-09-27', '2026-10-27', '2026-11-26'], e4.map((e) => e.dueIso));

/* ── ④ L'IMPUTATION SE FAIT DANS L'ORDRE ───────────────────────────
   La plus vieille d'abord, et ce qui déborde coule sur la suivante. */
const rien = etatDesEcheances(e4, 0, '2026-08-28');
dit('sans versement, rien n’est soldé', [false, false, false, false], rien.map((e) => e.soldee));
dit('… et tout reste dû', 125_000, resteDeLEcheancier(rien));

const une = etatDesEcheances(e4, 31_250, '2026-08-28');
dit('un versement solde la première', [true, false, false, false], une.map((e) => e.soldee));
dit('… et ne touche pas la deuxième', 31_250, une[1].resteXof);

const deborde = etatDesEcheances(e4, 40_000, '2026-08-28');
dit('ce qui déborde coule sur la suivante', [31_250, 8_750, 0, 0], deborde.map((e) => e.regleXof));
dit('… la deuxième est donc partielle', 22_500, deborde[1].resteXof);

const tout = etatDesEcheances(e4, 125_000, '2026-11-30');
dit('tout réglé, tout soldé', [true, true, true, true], tout.map((e) => e.soldee));
dit('… plus rien à encaisser', 0, resteDeLEcheancier(tout));
dit('… et aucun retard', 0, enRetardXof(tout));

/* ── ⑤ LE RETARD — seule une échéance ÉCHUE et impayée le devient ─── */
const auJour2 = etatDesEcheances(e4, 0, '2026-09-27');
dit('deux échéances sont échues au 27 septembre', [true, true, false, false], auJour2.map((e) => e.enRetard));
dit('… ce qui chiffre le retard', 62_500, enRetardXof(auJour2));
dit('… et le plus vieux retard date du 28 août', 30, plusVieuxRetardJours(auJour2));
dit('une échéance à venir n’est jamais en retard', false, auJour2[2].enRetard);

const soldeeMaisEchue = etatDesEcheances(e4, 62_500, '2026-09-27');
dit('une échéance échue mais SOLDÉE n’est pas un retard', 0, enRetardXof(soldeeMaisEchue));

/* ── ⑥ CE QU'ON RÉCLAME ENSUITE ────────────────────────────────────
   La plus ancienne non soldée, jamais la plus grosse ni la plus proche. */
dit('la prochaine à réclamer est la plus ancienne non soldée', 2, prochaineEcheance(une)?.numero);
dit('tout soldé, il n’y a plus rien à réclamer', undefined, prochaineEcheance(tout)?.numero);

/* ── ⑦ LE TROP-VERSÉ SE VOIT ───────────────────────────────────────
   Ce n'est pas une erreur (une avance, un arrondi de la main), mais il ne doit
   pas disparaître dans le calcul. */
dit('un trop-versé se chiffre', 5_000, tropVerseXof(e4, 130_000));
dit('… et le juste compte n’en crée pas', 0, tropVerseXof(e4, 125_000));

/* ── ⑧ LES BORNES ──────────────────────────────────────────────────── */
dit('un total nul ne fait aucune échéance', 0, construitEcheancier(0, 2, '2026-08-28').length);
dit('un versement négatif est ignoré', 125_000, resteDeLEcheancier(etatDesEcheances(e4, -9_000, '2026-08-28')));

/* ── ⑨ DÉPLACER UNE ÉCHÉANCE SANS CASSER L'ORDRE ───────────────────
   Une deuxième échéance datée AVANT la première rendrait le mot « retard »
   incalculable : l'imputation se fait dans l'ordre, l'ordre doit tenir. */
const base4 = construitEcheancier(120_000, 4, '2026-08-28');
dit('les dates de départ', ['2026-08-28', '2026-09-27', '2026-10-27', '2026-11-26'],
  base4.map((e) => e.dueIso));

const recule = deplaceEcheance(base4, 2, '2026-10-05');
dit('reculer la 2ᵉ la déplace', '2026-10-05', recule[1].dueIso);
dit('… sans toucher la 1ʳᵉ', '2026-08-28', recule[0].dueIso);
dit('… ni les suivantes, déjà plus tardives', ['2026-10-27', '2026-11-26'],
  [recule[2].dueIso, recule[3].dueIso]);

const pousse = deplaceEcheance(base4, 2, '2026-12-15');
dit('une 2ᵉ poussée très loin POUSSE les suivantes',
  ['2026-08-28', '2026-12-15', '2026-12-15', '2026-12-15'], pousse.map((e) => e.dueIso));

const borne = deplaceEcheance(base4, 3, '2026-01-01');
dit('une date antérieure à la précédente est bornée, jamais refusée',
  '2026-09-27', borne[2].dueIso);
dit('… et l’ordre tient toujours', true,
  borne.every((e, i) => i === 0 || e.dueIso >= borne[i - 1].dueIso));

dit('les montants ne bougent jamais quand on déplace une date',
  base4.map((e) => e.amountXof), pousse.map((e) => e.amountXof));
dit('une date illisible ne change rien', base4.map((e) => e.dueIso),
  deplaceEcheance(base4, 2, 'demain').map((e) => e.dueIso));
dit('un numéro inconnu ne change rien', base4.map((e) => e.dueIso),
  deplaceEcheance(base4, 9, '2026-12-01').map((e) => e.dueIso));

/* ── ⑩ LE RENDEZ-VOUS SE MÉRITE ────────────────────────────────────
   Contrepartie honnête du paiement découpé : la Maison avance un service
   contre une promesse, et la promesse tenue ouvre la porte suivante. */
dit('la grâce dure sept jours', 7, JOURS_DE_GRACE);
dit('sans échéancier, rien ne se ferme', true, peutReserver(undefined, 0, '2026-09-30').ouvert);
dit('à jour, la porte est ouverte', true, peutReserver(base4, 120_000, '2026-11-30').ouvert);

/* Un seul jour de retard ne ferme rien : bloquer au premier jour ferait de la
   règle une punition plutôt qu'un cadre. */
dit('un jour de retard ne ferme rien', true, peutReserver(base4, 0, '2026-08-29').ouvert);
dit('sept jours non plus', true, peutReserver(base4, 0, '2026-09-04').ouvert);
dit('huit jours ferment la porte', false, peutReserver(base4, 0, '2026-09-05').ouvert);

const ferme = peutReserver(base4, 0, '2026-10-01');
/* SEULES LES ÉCHÉANCES HORS GRÂCE COMPTENT. Au 1ᵉʳ octobre, la 1ʳᵉ a 34 jours
   et la 2ᵉ seulement 4 : celle-ci est encore dans son délai, elle ne pèse pas
   dans le chiffre qu'on montre à la cliente. Annoncer 60 000 lui ferait payer
   une échéance qu'elle a encore le droit de devoir. */
dit('… et le retard ne chiffre que ce qui est hors grâce', 30_000, ferme.retardXof);
dit('… avec son âge', 34, ferme.retardJours);
dit('… et une phrase, jamais un code', true, ferme.dit.includes('34 jours'));

/* Régler rouvre la porte AUSSITÔT : la règle est un cadre, pas une sanction
   qui dure. */
dit('régler ce qui est échu rouvre la porte', true, peutReserver(base4, 60_000, '2026-10-01').ouvert);

/* ── LA PREMIÈRE TRANCHE SE CHOISIT ─────────────────────────────────
   « Je voudrais changer le montant de la première tranche de paiement »
   (Yéman, 1er septembre 2026).

   LE PARTAGE ÉGAL EST UNE COMMODITÉ, PAS UNE LOI. Une cliente arrive avec
   100 000 F en main sur un abonnement de 168 000 : lui imposer 84 000
   aujourd'hui, c'est refuser l'argent qu'elle tend et allonger ce qu'elle
   devra. */
const deux = construitEcheancier(168_000, 2, '2026-09-01', 30, 100_000);
dit('la première porte le montant voulu', 100_000, deux[0].amountXof);
dit('… et la seconde le reste', 68_000, deux[1].amountXof);
dit('la somme fait toujours le total', 168_000, deux.reduce((n, e) => n + e.amountXof, 0));
dit('les dates ne bougent pas', ['2026-09-01', '2026-10-01'], deux.map((e) => e.dueIso));

/* SANS MONTANT VOULU, RIEN NE CHANGE : c'est la garde qui protège toutes les
   ventes ordinaires, et tout ce qui a été signé avant cette règle. */
dit('sans montant voulu, le partage égal', [84_000, 84_000],
  construitEcheancier(168_000, 2, '2026-09-01').map((e) => e.amountXof));

/* LE RAB VA SUR LA DERNIÈRE, jamais sur la première : celle-ci porte le
   montant annoncé à la cliente, au franc près. Un écran qui dit 100 000 et
   enregistre 100 001 se paie en confiance. */
const quatre = construitEcheancier(100_001, 4, '2026-09-01', 30, 50_000);
dit('la première est exacte au franc', 50_000, quatre[0].amountXof);
dit('… le rab tombe sur la dernière', [16_667, 16_667, 16_667], [quatre[1].amountXof, quatre[2].amountXof, quatre[3].amountXof]);
dit('… et le total tient', 100_001, quatre.reduce((n, e) => n + e.amountXof, 0));

/* CHAQUE ÉCHÉANCE GARDE AU MOINS UN FRANC. Une tranche à zéro se lirait comme
   soldée d'avance, et la cliente croirait devoir moins. On borne plutôt que de
   refuser en silence. */
dit('une première trop grande est ramenée', 167_999,
  construitEcheancier(168_000, 2, '2026-09-01', 30, 999_999)[0].amountXof);
dit('… et la suivante garde son franc', 1,
  construitEcheancier(168_000, 2, '2026-09-01', 30, 999_999)[1].amountXof);
dit('en quatre fois, trois francs restent', 167_997,
  construitEcheancier(168_000, 4, '2026-09-01', 30, 999_999)[0].amountXof);
/* UNE PREMIÈRE À ZÉRO N'EST PAS UNE PREMIÈRE : on n'accorde pas un crédit qui
   commence par un délai, c'est la règle de la Maison depuis l'origine. */
dit('zéro n’est pas un montant voulu', 84_000,
  construitEcheancier(168_000, 2, '2026-09-01', 30, 0)[0].amountXof);
dit('un négatif non plus', 84_000,
  construitEcheancier(168_000, 2, '2026-09-01', 30, -5_000)[0].amountXof);

/* EN UNE FOIS, LE MONTANT VOULU N'A AUCUN SENS : il n'y a rien à découper, et
   l'appliquer ferait payer moins que le total. */
dit('en une fois, le total entier', 168_000,
  construitEcheancier(168_000, 1, '2026-09-01', 30, 50_000)[0].amountXof);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
