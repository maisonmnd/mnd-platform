/* LE MOTEUR DE PAIE — l'interrupteur CNSS, surtout. Lancé par
   `node scripts/verifie-paie.mjs`. */
import {
  PAYROLL_PARAMETERS_SEED, computePay, computeIts, cnssEstActive, tauxCnssSalarial, itsEstActif,
  bulletinHref, chargeSalaireId,
  type PayGains, type PayDeductions, type PayrollParameters,
} from '../src/apps/trone/routes/equipe/payroll';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const gains: PayGains = {
  base: 300_000, heuresSup: 0, prime: 0, pourboires: 0, commission: 0, indemnites: 0,
};
const rien: PayDeductions = { avance: 0, autresRetenues: 0 };

const allumee: PayrollParameters = { ...PAYROLL_PARAMETERS_SEED };
const eteinte: PayrollParameters = { ...PAYROLL_PARAMETERS_SEED, cnssActive: false };
const rallumee: PayrollParameters = { ...PAYROLL_PARAMETERS_SEED, cnssActive: true };

/* ── LE DÉFAUT — un champ absent n'éteint JAMAIS une cotisation ── */
dit('un barème SANS le champ garde la CNSS allumée', true, cnssEstActive(allumee));
dit('… seul `false` l’éteint', false, cnssEstActive(eteinte));
dit('… et `true` la rallume', true, cnssEstActive(rallumee));

/* ── ALLUMÉE — le comportement d'origine, inchangé ── */
const a = computePay(gains, rien, allumee);
dit('part salariale : 300 000 × 3,6 %', 10_800, a.cnssSalariale);
dit('part patronale : 300 000 × (6,4 + 9 + 2) %', 52_200, a.cnssPatronale);
dit('coût employeur = brut + part patronale', 352_200, a.coutEmployeur);
dit('net = brut − CNSS − ITS', 300_000 - 10_800 - computeIts(300_000, allumee.its), a.net);

/* ── ÉTEINTE — les DEUX parts tombent, on ne déclare pas à moitié ── */
const e = computePay(gains, rien, eteinte);
dit('éteinte : aucune retenue salariale', 0, e.cnssSalariale);
dit('éteinte : aucune charge patronale', 0, e.cnssPatronale);
dit('éteinte : le coût employeur vaut le brut', 300_000, e.coutEmployeur);
dit('l’employé touche 10 800 de plus', a.net + 10_800, e.net);

/* L'ITS EST UN IMPÔT, PAS UNE COTISATION : l'interrupteur ne doit pas y toucher. */
dit('LE MUR : l’ITS ne bouge pas', a.its, e.its);
dit('… et il reste dû', true, e.its > 0);

/* ── L'ITS A SON PROPRE INTERRUPTEUR ── */
const sansIts: PayrollParameters = { ...PAYROLL_PARAMETERS_SEED, itsActive: false };
const i = computePay(gains, rien, sansIts);
dit('un barème SANS le champ garde l’ITS appliqué', true, itsEstActif(allumee));
dit('… seul `false` le suspend', false, itsEstActif(sansIts));
dit('suspendu : aucun impôt retenu', 0, i.its);
dit('… mais la CNSS reste due', 10_800, i.cnssSalariale);
dit('… et le net remonte de l’impôt', a.net + a.its, i.net);

/* LES DEUX ÉTEINTS : le net vaut le brut moins les seules retenues propres. */
const rien2: PayrollParameters = { ...PAYROLL_PARAMETERS_SEED, cnssActive: false, itsActive: false };
const z = computePay(gains, { avance: 20_000, autresRetenues: 0 }, rien2);
dit('tout suspendu : net = brut − avance', 280_000, z.net);
dit('… et coût employeur = brut', 300_000, z.coutEmployeur);

/* Le drapeau doit VOYAGER jusqu'au bulletin, qui porte son propre barème. */
dit('suspendu : `its=0` part dans l’adresse', true,
  bulletinHref('/b.html', { nom: 'T', periode: '2026-08', base: 1, itsActif: itsEstActif(sansIts) }).includes('its=0'));
dit('appliqué : `its=1` part dans l’adresse', true,
  bulletinHref('/b.html', { nom: 'T', periode: '2026-08', base: 1, itsActif: itsEstActif(allumee) }).includes('its=1'));

/* Le brut ne dépend d'aucun barème. */
dit('le brut est le même des deux côtés', a.brut, e.brut);

/* Les retenues ordinaires continuent de jouer. */
const avecAvance = computePay(gains, { avance: 50_000, autresRetenues: 0 }, eteinte);
dit('une avance se déduit toujours', e.net - 50_000, avecAvance.net);

/* ── LE PONT VERS LE BULLETIN — la page refait le calcul de son côté ── */
dit('allumée : le taux part au bulletin', 3.6, tauxCnssSalarial(allumee));
dit('éteinte : c’est ZÉRO qui part', 0, tauxCnssSalarial(eteinte));
/* `cnss=0` doit être ÉCRIT dans l'adresse : omis, la page retomberait sur ses
   3,6 % et imprimerait un net inférieur à celui réellement versé. */
const lien = bulletinHref('/bulletin.html', {
  nom: 'Test', periode: '2026-08', base: 300_000, cnssPct: tauxCnssSalarial(eteinte),
});
dit('… et le zéro figure bien dans l’adresse', true, lien.includes('cnss=0'));
dit('allumée, l’adresse porte le vrai taux', true,
  bulletinHref('/bulletin.html', { nom: 'T', periode: '2026-08', base: 1, cnssPct: tauxCnssSalarial(allumee) })
    .includes('cnss=3.6'));

/* ── LA CHARGE « SALAIRES » — une clé, deux chemins ──
   Le run de paie et « Confirmer le règlement » écrivent la MÊME ligne de
   dépense. Si cette clé cessait de coïncider, un salaire compterait DEUX FOIS
   dans le résultat du salon — la panne la plus coûteuse et la plus discrète. */
dit('la clé de charge est stable', 'exp-paie-2026-08-emp1', chargeSalaireId('2026-08', 'emp1'));
dit('… un autre mois, une autre ligne', true,
  chargeSalaireId('2026-08', 'emp1') !== chargeSalaireId('2026-09', 'emp1'));
dit('… une autre personne aussi', true,
  chargeSalaireId('2026-08', 'emp1') !== chargeSalaireId('2026-08', 'emp2'));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
