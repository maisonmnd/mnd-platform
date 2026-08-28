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

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
