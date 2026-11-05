/* LES POURBOIRES DE L'EQUIPE, EPROUVES — 5 novembre 2026.
   `node scripts/verifie-les-pourboires-de-l-equipe.mjs` (et `--prouve`).

   La demande (Yeman, 4 novembre 2026, maquette 2e4ZNFxyREv6mxG4vakuh5) : le
   tableau clair des pourboires de l'equipe, son evolution mois par mois, et
   sur l'ecran de chacun son pourboire, au fur et a mesure ; une notification
   a chaque pourboire, sa part seule, la cliente par son prenom.

   LE SCENARIO EST CELUI DE LA TABLE DES POURBOIRES au 4 novembre 2026 :
   l'equipe a recu 31 000 F en aout, 4 000 F en septembre, 2 000 F en
   octobre, 7 000 F au 4 novembre ; Aimer, Gerard, Nassim ont une part,
   Brice et Yeman une demi-part, Kabirou et Olivier aucune. Les montants de
   chaque pourboire d'aout sont choisis pour donner ces totaux ; les noms des
   clientes sont inventes. TOUS LES ATTENDUS SONT ECRITS EN DUR, lus dans la
   maquette (Aimer : 7 750 F en aout, 1 000 F en septembre, 500 F en octobre,
   1 750 F en novembre, 11 000 F depuis aout).

   Les textes (la migration 0157, les ecrans) se lisent par `lis`, qui
   applique la panne du moment en memoire (variable PANNE_TEXTE) : jamais une
   panne n'est ecrite dans le depot. */
import { readFileSync } from 'node:fs';
import {
  MOIS_DITS, FICHE_RETIREE, ajouteJours, detailDuMembre, filDesPourboires, francsDits, jourDit, lundiDe, mesPourboires,
  moisAvant, moisDit, notificationDuPourboire, partDite, partageDit, partsDeLaMaison, pourboireArriveDit, prenomDeLaCliente,
  quandDit, serieMoisParMois, tableauDeLEquipe, taPartDite, totauxDe, vientDArriver,
  type MembreDuPartage, type PartDePourboire,
} from '../src/shared/pourboires-de-l-equipe-pur';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)?.slice(0, 300)}\n       obtenu  ${JSON.stringify(obtenu)?.slice(0, 300)}`}`));
};

const PANNE: { fichier: string; avant: string; apres: string } | null = process.env.PANNE_TEXTE ? JSON.parse(process.env.PANNE_TEXTE) : null;
const lis = (f: string): string => {
  const t = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  return PANNE && PANNE.fichier === f ? t.split(PANNE.avant).join(PANNE.apres) : t;
};
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\}/g, '');
const F = (s: string) => s.replace(/(\d) (\d)/g, '$1 $2'); // « 1 000 F » : l'espace fine de fr-FR entre les chiffres

/* ── LE SCENARIO ─────────────────────────────────────────────────────── */
const AUJ = '2026-11-04'; // un mercredi
const EQUIPE: MembreDuPartage[] = [
  { id: 'st-aimer', name: 'Aimer H.', partPourboire: 1 },
  { id: 'st-gerard', name: 'Gérard T.', partPourboire: 1 },
  { id: 'st-nassim', name: 'Nassim M.', partPourboire: 1 },
  { id: 'st-brice', name: 'Brice A.', partPourboire: 0.5 },
  { id: 'st-yeman', name: 'Yéman B.', partPourboire: 0.5 },
  { id: 'st-kabirou', name: 'Kabirou', partPourboire: 0 },
  { id: 'st-olivier', name: 'Olivier', partPourboire: 0 },
];
/** Un pourboire partage en quatre parts (trois de 1, deux de ½), ecrit comme
    `addTipPartage` l'ecrit : une ligne par beneficiaire. Les montants sont
    divisibles par huit : aucune part n'a d'arrondi. */
let n = 0;
const pourboire = (date: string, montant: number, note: string | undefined, invoiceId?: string, inscritLe?: string): PartDePourboire[] => {
  const un = montant / 4;
  const demi = montant / 8;
  return [['st-aimer', un], ['st-gerard', un], ['st-nassim', un], ['st-brice', demi], ['st-yeman', demi]].map(([staffId, amountXof]) => ({
    id: `tp-${++n}`, staffId: staffId as string, amountXof: amountXof as number, date,
    ...(note ? { note } : {}), ...(invoiceId ? { invoiceId } : {}), ...(inscritLe ? { inscritLe } : {}),
  }));
};
const PIECES = [
  { id: 'inv-a1', number: 'F-2026-0601' }, { id: 'inv-a2', number: 'F-2026-0612' }, { id: 'inv-a3', number: 'F-2026-0620' },
  { id: 'inv-a4', number: 'F-2026-0633' }, { id: 'inv-a5', number: 'F-2026-0640' },
  { id: 'inv-s1', number: 'F-2026-0688' }, { id: 'inv-s2', number: 'F-2026-0701' },
  { id: 'inv-o1', number: 'F-2026-0748' },
  { id: 'inv-n1', number: 'F-2026-0773' }, { id: 'inv-n2', number: 'F-2026-0774' },
];
const TIPS: PartDePourboire[] = [
  /* Aout 2026 : 31 000 F. Le premier, du 14, est d'avant le lien a la piece (19 aout). */
  ...pourboire('2026-08-14', 2000, 'Afi Exemple'),
  ...pourboire('2026-08-20', 10000, 'Mme Sika Exemple', 'inv-a1'),
  ...pourboire('2026-08-22', 8000, 'Edwige Exemple', 'inv-a2'),
  ...pourboire('2026-08-27', 5000, 'Nadège Exemple', 'inv-a3'),
  ...pourboire('2026-08-29', 4000, 'Carine Exemple', 'inv-a4'),
  ...pourboire('2026-08-30', 2000, 'Lydia Exemple', 'inv-a5'),
  /* Septembre : 4 000 F, deux pourboires. */
  ...pourboire('2026-09-12', 2000, 'Rosine Exemple', 'inv-s1'),
  ...pourboire('2026-09-26', 2000, 'Inès Exemple', 'inv-s2'),
  /* Octobre : 2 000 F, un pourboire (N. M., le 23). */
  ...pourboire('2026-10-23', 2000, 'Nadia Exemple', 'inv-o1'),
  /* Novembre, au 4 : 7 000 F. */
  ...pourboire('2026-11-04', 4000, 'Ranti Exemple', 'inv-n1', '2026-11-04T10:12:00.000Z'),
  ...pourboire('2026-11-04', 3000, 'Mme Akouvi Témoin', 'inv-n2', '2026-11-04T16:40:00.000Z'),
];

/* ── 1. LES JOURS ET LES MOTS ─────────────────────────────────────────── */
dit('la semaine commence le lundi : mercredi 4 novembre 2026 -> lundi 2', '2026-11-02', lundiDe(AUJ));
dit('... un dimanche est dans la semaine de son lundi (8 novembre -> 2)', '2026-11-02', lundiDe('2026-11-08'));
dit('... un lundi est son propre lundi', '2026-11-02', lundiDe('2026-11-02'));
dit('le mois d avant janvier est decembre de l annee d avant', ['2025-12', '2026-10', '2026-08'], [moisAvant('2026-01'), moisAvant('2026-11'), moisAvant('2026-11', 3)]);
dit('un jour plus un', ['2026-11-05', '2026-11-03'], [ajouteJours(AUJ, 1), ajouteJours(AUJ, -1)]);
dit('le mois se dit avec son annee', ['novembre 2026', 'août 2026'], [moisDit('2026-11'), moisDit('2026-08')]);
dit('le jour se dit avec son annee : « 4 nov. 2026 »', '4 nov. 2026', jourDit(AUJ));
dit('les mois en clair, dans l ordre', 12, MOIS_DITS.length);
dit('1 000 F, comme fmtMoney en XOF', [F('1 000 F'), F('11 000 F'), '500 F'], [francsDits(1000), francsDits(11000), francsDits(500)]);
dit('la part se dit : 1, ½, 0, 1,5', ['1', '½', '0', '1,5', '1'], [partDite(1), partDite(0.5), partDite(0), partDite(1.5), partDite(undefined)]);
dit('« Ta part : » une part, une demi-part, aucune part, 1,5 parts', ['une part', 'une demi-part', 'aucune part', '1,5 parts'], [taPartDite(1), taPartDite(0.5), taPartDite(0), taPartDite(1.5)]);

/* ── 2. LE PRENOM, JAMAIS LE NOM ENTIER ───────────────────────────────── */
dit('le prenom : le premier mot', 'Ranti', prenomDeLaCliente('Ranti Exemple'));
dit('... la civilite se saute (Mme, M., Madame)', ['Akouvi', 'Kofi', 'Awa'], [prenomDeLaCliente('Mme Akouvi Témoin'), prenomDeLaCliente('M. Kofi Exemple'), prenomDeLaCliente('Madame Awa')]);
dit('... le prenom compose reste entier', 'Marie-Claire', prenomDeLaCliente('  Marie-Claire   Dossou '));
dit('... les lettres accentuees restent', 'Aïcha', prenomDeLaCliente('Aïcha Exemple'));
dit('... un numero, une adresse, de la ponctuation, rien : pas de prenom', ['', '', '', '', ''],
  [prenomDeLaCliente('+229 01 97 00 00 01'), prenomDeLaCliente('awa@exemple.bj'), prenomDeLaCliente('—'), prenomDeLaCliente(''), prenomDeLaCliente(undefined)]);
dit('... plus de trente lettres : pas un prenom', '', prenomDeLaCliente('A'.repeat(31)));

/* ── 3. CE QUE CHACUN VOIT (Aimer, le 4 novembre 2026 au soir) ────────── */
const aimer = mesPourboires(TIPS, 'st-aimer', AUJ);
dit('Aimer : aujourd hui 1 750 F, semaine 1 750 F, novembre 1 750 F, octobre 500 F, depuis aout 11 000 F',
  { aujourdhui: 1750, semaine: 1750, mois: 1750, moisPrecedent: 500, depuisLeDebut: 11000 },
  { aujourdhui: aimer.totaux.aujourdhui, semaine: aimer.totaux.semaine, mois: aimer.totaux.mois, moisPrecedent: aimer.totaux.moisPrecedent, depuisLeDebut: aimer.totaux.depuisLeDebut });
dit('... sa liste du mois : ses deux parts, la plus recente d abord, la cliente par son prenom',
  [['4 nov. 2026', 'Akouvi', 750], ['4 nov. 2026', 'Ranti', 1000]], aimer.duMois.map((l) => [l.jourDit, l.prenom, l.amountXof]));
dit('... jamais le nom entier dans ce que l equipe lit', false, JSON.stringify(aimer).includes('Exemple') || JSON.stringify(aimer).includes('Témoin'));
const brice = mesPourboires(TIPS, 'st-brice', AUJ);
dit('Brice (une demi-part) : 875 F aujourd hui et ce mois, 250 F en octobre, 5 500 F depuis aout', [875, 875, 250, 5500],
  [brice.totaux.aujourdhui, brice.totaux.mois, brice.totaux.moisPrecedent, brice.totaux.depuisLeDebut]);
dit('Kabirou (aucune part) : rien', [0, 0], [mesPourboires(TIPS, 'st-kabirou', AUJ).totaux.depuisLeDebut, mesPourboires(TIPS, 'st-kabirou', AUJ).duMois.length]);
const DIMANCHE: PartDePourboire = { id: 'tp-dim', staffId: 'st-aimer', amountXof: 600, date: '2026-11-01' };
const avecDimanche = totauxDe([...TIPS.filter((t) => t.staffId === 'st-aimer'), DIMANCHE], AUJ);
dit('le dimanche 1er novembre compte dans le mois, pas dans la semaine (elle commence le lundi 2)', [2350, 1750], [avecDimanche.mois, avecDimanche.semaine]);
dit('une part a zero ou illisible ne compte pas', 1750, totauxDe([...TIPS.filter((t) => t.staffId === 'st-aimer'), { id: 'x', staffId: 'st-aimer', amountXof: 0, date: AUJ }, { id: 'y', staffId: 'st-aimer', amountXof: Number.NaN, date: AUJ }], AUJ).aujourdhui);

/* ── 4. « +1 000 F DE POURBOIRE · RANTI, A L'INSTANT » ────────────────── */
const T0 = Date.parse('2026-11-04T16:40:30.000Z');
const arrive = vientDArriver(TIPS, 'st-aimer', AUJ, T0);
dit('le dernier inscrit, il y a trente secondes : sa part, le prenom', ['Akouvi', 750], [arrive?.prenom, arrive?.amountXof]);
dit('... « +750 F de pourboire · Akouvi, a l instant »', '+750 F de pourboire · Akouvi, à l’instant',
  arrive ? `${pourboireArriveDit(arrive.amountXof, arrive.prenom)}, ${quandDit(arrive.depuisMs, arrive.aMs)}` : null);
const T12 = Date.parse('2026-11-04T16:52:10.000Z');
const a12 = vientDArriver(TIPS, 'st-aimer', AUJ, T12);
dit('douze minutes plus tard : « il y a 12 min »', 'il y a 12 min', a12 ? quandDit(a12.depuisMs, a12.aMs) : null);
dit('apres une heure : l heure de Cotonou, « a 17 h 40 »', 'à 17 h 40', quandDit(70 * 60_000, Date.parse('2026-11-04T16:40:00.000Z')));
dit('... et a l heure pile : « a 14 h »', 'à 14 h', quandDit(90 * 60_000, Date.parse('2026-11-04T13:00:00.000Z')));
dit('plus de deux heures apres : plus rien ne « vient d arriver »', null, vientDArriver(TIPS, 'st-aimer', AUJ, Date.parse('2026-11-04T19:00:00.000Z')));
const REPARTAGE: PartDePourboire[] = pourboire('2026-08-20', 8000, 'Mme Sika Exemple', 'inv-a1b', '2026-11-04T16:40:00.000Z');
dit('un repartage du registre (parts d aout reecrites aujourd hui) ne sonne pas « a l instant »', null,
  vientDArriver(REPARTAGE, 'st-aimer', AUJ, T0));
const SANS_INSTANT: PartDePourboire[] = pourboire(AUJ, 2000, 'Ranti Exemple', 'inv-n3');
dit('une part sans instant (un Trone d avant) n arrive que si l ecran l a vue arriver', [null, 500],
  [vientDArriver(SANS_INSTANT, 'st-aimer', AUJ, T0)?.amountXof ?? null,
    vientDArriver(SANS_INSTANT, 'st-aimer', AUJ, T0, new Map([[SANS_INSTANT[0].id, T0 - 5000]]))?.amountXof ?? null]);
dit('la part d un autre ne s annonce pas chez Aimer', null, vientDArriver(TIPS.filter((t) => t.staffId === 'st-gerard'), 'st-aimer', AUJ, T0));
dit('une part d hier, inscrite il y a une heure, arrive encore (le rituel d hier encaisse ce matin)', 1000,
  vientDArriver(pourboire('2026-11-03', 4000, 'Ranti Exemple', 'inv-n4', '2026-11-04T15:40:00.000Z'), 'st-aimer', AUJ, T0)?.amountXof ?? null);

/* ── 5. LA NOTIFICATION : SA PART, LE PRENOM, JAMAIS LA PIECE ─────────── */
dit('la notification d Aimer pour le pourboire de Ranti', { titre: F('+1 000 F de pourboire · Ranti'), corps: F('Tes pourboires de novembre 2026 : 1 750 F.') },
  notificationDuPourboire(1000, 'Ranti Exemple', 1750, '2026-11'));
dit('... sans prenom lisible : la part seule', '+500 F de pourboire', notificationDuPourboire(500, '+229 01 97 00 00 01', 500, '2026-11').titre);
dit('... ni le nom entier, ni le montant de la piece (4 000 F)', [false, false],
  [JSON.stringify(notificationDuPourboire(1000, 'Ranti Exemple', 1750, '2026-11')).includes('Exemple'), JSON.stringify(notificationDuPourboire(1000, 'Ranti Exemple', 1750, '2026-11')).includes(F('4 000'))]);

/* ── 6. LE TABLEAU DE L'EQUIPE ────────────────────────────────────────── */
const tab = tableauDeLEquipe(TIPS, EQUIPE, AUJ);
dit('les colonnes : novembre, octobre, septembre, aout 2026 ; depuis aout', [['2026-11', '2026-10', '2026-09', '2026-08'], '2026-08'], [tab.colonnes, tab.premierMois]);
const ligne = (id: string) => tab.lignes.find((l) => l.id === id);
dit('Aimer, Gerard, Nassim : 1 750 / 1 750 / 500 / 1 000 / 7 750 / 11 000',
  [[1, 1750, [1750, 500, 1000, 7750], 11000], [1, 1750, [1750, 500, 1000, 7750], 11000], [1, 1750, [1750, 500, 1000, 7750], 11000]],
  ['st-aimer', 'st-gerard', 'st-nassim'].map((id) => [ligne(id)?.part, ligne(id)?.aujourdhui, ligne(id)?.parMois, ligne(id)?.depuisLeDebut]));
dit('Brice, Yeman : ½, 875 / 875 / 250 / 500 / 3 875 / 5 500',
  [[0.5, 875, [875, 250, 500, 3875], 5500], [0.5, 875, [875, 250, 500, 3875], 5500]],
  ['st-brice', 'st-yeman'].map((id) => [ligne(id)?.part, ligne(id)?.aujourdhui, ligne(id)?.parMois, ligne(id)?.depuisLeDebut]));
dit('Kabirou et Olivier : une seule ligne « pas de part »', [['Kabirou', 'Olivier'], false], [tab.sansPart.map((m) => m.nom), tab.lignes.some((l) => l.id === 'st-kabirou')]);
dit('l equipe : 4 parts, 7 000 F aujourd hui, 7 000 / 2 000 / 4 000 / 31 000, 44 000 F depuis aout',
  { part: 4, aujourdhui: 7000, parMois: [7000, 2000, 4000, 31000], depuisLeDebut: 44000 },
  { part: tab.total.part, aujourdhui: tab.total.aujourdhui, parMois: tab.total.parMois, depuisLeDebut: tab.total.depuisLeDebut });
dit('l ordre des lignes est celui de l equipe', ['st-aimer', 'st-gerard', 'st-nassim', 'st-brice', 'st-yeman'], tab.lignes.map((l) => l.id));
const ARCHIVES: MembreDuPartage[] = [...EQUIPE, { id: 'st-partie', name: 'Partie Avant', partPourboire: 1, archiveeLe: '2026-09-30' }, { id: 'st-vide', name: 'Partie Sans', partPourboire: 1, archiveeLe: '2026-09-30' }];
const AVEC_PARTIE = [...TIPS, { id: 'tp-p', staffId: 'st-partie', amountXof: 900, date: '2026-09-12', invoiceId: 'inv-s1' }];
const tabA = tableauDeLEquipe(AVEC_PARTIE, ARCHIVES, AUJ);
dit('une fiche partie garde sa ligne si elle a recu, sans compter dans les parts d aujourd hui', [true, false, false, 4],
  [tabA.lignes.some((l) => l.id === 'st-partie'), tabA.lignes.some((l) => l.id === 'st-vide'), tabA.sansPart.some((m) => m.id === 'st-vide'), tabA.total.part]);

/* Les parts d'une autre maison, et celles d'une fiche effacee. */
const AUTRE: PartDePourboire = { id: 'tp-autre', staffId: 'st-calavi', amountXof: 5000, date: AUJ };
const EFFACEE: PartDePourboire = { id: 'tp-eff', staffId: 'st-effacee', amountXof: 300, date: AUJ };
const ici = partsDeLaMaison([...TIPS, AUTRE, EFFACEE], EQUIPE, [...EQUIPE, { id: 'st-calavi', name: 'Calavi' }]);
dit('les parts d une autre maison ne se comptent pas ici ; celles d une fiche effacee, si', [false, true], [ici.includes(AUTRE), ici.includes(EFFACEE)]);
const tabE = tableauDeLEquipe(ici, EQUIPE, AUJ);
dit('... la fiche effacee a sa ligne « Fiche retiree », et le total dit tout l argent inscrit', [true, 7300],
  [tabE.lignes.some((l) => l.id === FICHE_RETIREE && l.nom === 'Fiche retirée'), tabE.total.aujourdhui]);

/* ── 7. L'EVOLUTION, MOIS PAR MOIS ────────────────────────────────────── */
dit('aout 31 000 F (6 pourboires), septembre 4 000 F (2), octobre 2 000 F (1), novembre 7 000 F (2, en cours)',
  [['2026-08', 31000, 6, false], ['2026-09', 4000, 2, false], ['2026-10', 2000, 1, false], ['2026-11', 7000, 2, true]],
  serieMoisParMois(TIPS, AUJ).map((s) => [s.mois, s.total, s.nbPourboires, s.enCours]));
dit('« septembre et octobre ne comptent que 3 pourboires inscrits »', 3, serieMoisParMois(TIPS, AUJ).filter((s) => s.mois === '2026-09' || s.mois === '2026-10').reduce((k, s) => k + s.nbPourboires, 0));
const TROU = [...pourboire('2026-06-10', 800, 'Afi Exemple', 'inv-j1'), ...pourboire('2026-08-10', 800, 'Afi Exemple', 'inv-j2')];
dit('un mois sans pourboire se voit, a zero (juillet entre juin et aout)', [['2026-06', 800], ['2026-07', 0], ['2026-08', 800]],
  serieMoisParMois(TROU, '2026-08-20').map((s) => [s.mois, s.total]));
dit('sans aucun pourboire : le mois en cours, a zero', [['2026-11', 0, true]], serieMoisParMois([], AUJ).map((s) => [s.mois, s.total, s.enCours]));
dit('douze mois au plus', 12, serieMoisParMois([...pourboire('2024-01-10', 800, 'Afi', 'inv-x')], AUJ).length);

/* ── 8. LE FIL ────────────────────────────────────────────────────────── */
const filNov = filDesPourboires(TIPS, EQUIPE, PIECES, { mois: '2026-11' });
dit('novembre : deux pourboires, le plus recent d abord, avec leur piece et leur montant',
  [['4 nov. 2026', 'F-2026-0774', 'Mme Akouvi Témoin', 3000], ['4 nov. 2026', 'F-2026-0773', 'Ranti Exemple', 4000]],
  filNov.map((p) => [p.jourDit, p.numero, p.cliente, p.montant]));
dit('... et leur partage : « Aimer, Gerard, Nassim 1 000 F chacun · Brice, Yeman 500 F chacun »',
  F('Aimer, Gérard, Nassim 1 000 F chacun · Brice, Yéman 500 F chacun'), filNov[1]?.partageDit);
dit('octobre : N. M., le 23, 2 000 F', [['23 oct. 2026', 'F-2026-0748', 2000]], filDesPourboires(TIPS, EQUIPE, PIECES, { mois: '2026-10' }).map((p) => [p.jourDit, p.numero, p.montant]));
const tout = filDesPourboires(TIPS, EQUIPE, PIECES);
dit('le fil entier : 11 pourboires, le premier d aout sans piece', [11, undefined, 'Afi Exemple'], [tout.length, tout[tout.length - 1]?.numero, tout[tout.length - 1]?.cliente]);
dit('un arrondi se dit tel quel : « Aimer, Gerard, Nassim 625 F chacun · Brice 313 F · Yeman 312 F »',
  'Aimer, Gérard, Nassim 625 F chacun · Brice 313 F · Yéman 312 F',
  partageDit([{ prenom: 'Aimer', amountXof: 625 }, { prenom: 'Gérard', amountXof: 625 }, { prenom: 'Nassim', amountXof: 625 }, { prenom: 'Brice', amountXof: 313 }, { prenom: 'Yéman', amountXof: 312 }]));
dit('le fil d un membre : les pourboires qui l ont credite', 11, filDesPourboires(TIPS, EQUIPE, PIECES, { staffId: 'st-brice' }).length);
const det = detailDuMembre(TIPS, 'st-nassim', AUJ);
dit('le detail de Nassim : 11 000 F, ses quatre mois, sa derniere part', [11000, [7750, 1000, 500, 1750], 750],
  [det.totaux.depuisLeDebut, det.serie.map((s) => s.total), det.lignes[0]?.amountXof]);

/* ── 9. LA NOTIFICATION EN BASE (0157), MOT POUR MOT ──────────────────── */
const SQL = 'supabase/migrations/0157_les_pourboires_de_l_equipe.sql';
const sql = lis(SQL);
const corpsSql = sql.replace(/^[ \t]*--.*\n/gm, '');
const PUR = lis('src/shared/pourboires-de-l-equipe-pur.ts');
const civ = (t: string) => /CIVILITES = \/(\^\(m[^/]*\$)\/i/.exec(t)?.[1] ?? null;
const civSql = /mots\[1\] ~\* '([^']+)'/.exec(corpsSql)?.[1] ?? null;
dit('les civilites : la meme liste dans la regle, dans foyer-pur et dans la base', [true, true],
  [civ(PUR) !== null && civ(PUR) === civ(lis('src/shared/foyer-pur.ts')), civ(PUR) === civSql]);
dit('ce qu un prenom ne contient pas : la meme classe, la meme longueur', [true, true],
  [/PAS_UN_PRENOM = \/\[0-9@\+\/_:;\]\//.test(PUR) && corpsSql.includes("p ~ '[0-9@+/_:;]'"), PUR.includes('p.length > 30') && corpsSql.includes('char_length(p) > 30')]);
const moisSql = /array\[('janvier'[^\]]+)\]/.exec(corpsSql)?.[1]?.split(',').map((m) => m.trim().replace(/'/g, '')) ?? [];
dit('les mois de la base sont ceux de la regle', [...MOIS_DITS], moisSql);
dit('les francs de la base : l espace fine (U+202F), puis « F »', true, /replace\(to_char\(n, 'FM999,999,999,990'\), ',', chr\(8239\)\) \|\| ' F'/.test(corpsSql));
dit('le titre et le corps de la base sont ceux de la regle', [true, true],
  [corpsSql.includes("titre := '+' || public.francs_dits(part) || ' de pourboire' || case when prenom <> '' then ' · ' || prenom else '' end;"),
    corpsSql.includes("corps := 'Tes pourboires de ' || public.mois_dit(jour) || ' : ' || public.francs_dits(total) || '.';")]);
dit('la base ne lit la cliente que par son prenom', [1, true],
  [(corpsSql.match(/new\.data ->> 'note'/g) ?? []).length, corpsSql.includes("prenom := public.prenom_de_la_cliente(new.data ->> 'note');")]);
dit('chaque part entre une fois : apres insertion seulement, ligne par ligne', true,
  /create trigger tips_previent after insert on public\.tips\n  for each row execute function public\.previens_du_pourboire\(\);/.test(corpsSql));
dit('une part ne se dit qu une fois (journal, la ligne prise d abord)', true,
  /on conflict \(tip_id\) do nothing;\n    if not found then\n      return new;\n    end if;/.test(corpsSql));
dit('le jour de la part juge : plus de deux jours, elle ne sonne pas', true, corpsSql.includes('if jour < aujourdhui - 2 or jour > aujourdhui + 1 then'));
dit('cinq au plus par personne en dix minutes', true, /prevenu_le > now\(\) - interval '10 minutes'\) >= 5 then/.test(corpsSql));
dit('jamais un pourboire refuse pour une notification', [true, true],
  [/  exception when others then\n    raise warning 'pourboire % : la notification ne part pas \(%\)', new\.id, sqlerrm;\n  end;\n  return new;/.test(corpsSql),
    /    exception when others then\n      update public\.pourboires_prevenus set issue = 'refuse : '/.test(corpsSql)]);
dit('la porte : push-notify, mode to-staff, la cle service par appelle_fonction_edge', true,
  corpsSql.includes("perform public.appelle_fonction_edge('push-notify', jsonb_build_object(\n        'mode', 'to-staff',\n        'userId', compte::text,"));
dit('le compte se trouve comme est_ma_fiche (compteMail, sinon email), et doit etre du personnel', [true, true],
  [corpsSql.includes("lower(coalesce(nullif(trim(t.data ->> 'compteMail'), ''), trim(t.data ->> 'email')))"),
    corpsSql.includes('not exists (select 1 from public.staff s where s.user_id = compte)')]);
dit('le journal a sa RLS aussitot, la direction seule le lit', [true, true],
  [corpsSql.includes('alter table public.pourboires_prevenus enable row level security;'), corpsSql.includes('using (public.est_direction());')]);
dit('le clic mene a Mon mois', true, corpsSql.includes("'url', '/trone/#/mon-mois',"));

/* ── 10. LES ECRANS ───────────────────────────────────────────────────── */
const index = sansCommentaires(lis('src/apps/trone/routes/index.tsx'));
dit('Equipe › Les pourboires : la rubrique, a la direction seule, nee apres les departements', [true, true, true],
  [index.includes("{ path: '/pourboires', label: 'Les pourboires', icon: Coins, Component: lazy(() => import('./equipe/Pourboires')) },"),
    index.includes("export const ROUTES_DIRECTION = ['/journal', '/pourboires'];"),
    /ECRANS_NES_APRES_LES_DEPARTEMENTS[^;]*'\/pourboires'\];/.test(index)]);
const page = sansCommentaires(lis('src/apps/trone/routes/equipe/Pourboires.tsx'));
const corpsDe = (t: string, debut: string) => t.slice(t.indexOf(debut));
const apresLaGarde = (t: string, fonction: string, garde: string) => {
  const c = corpsDe(t, fonction);
  return c.slice(c.indexOf(garde));
};
dit('la page : la direction, et la garde APRES tous les crochets', [true, true],
  [page.includes('const direction = useVoitLesPourboiresDeLEquipe();'),
    !/\buse[A-Z]\w*\(/.test(apresLaGarde(page, 'export default function Pourboires()', 'if (!direction) {'))]);
const bloc = sansCommentaires(lis('src/apps/trone/routes/equipe/MesPourboires.tsx'));
dit('le bloc de chacun : la garde APRES tous les crochets', true,
  !/\buse[A-Z]\w*\(/.test(apresLaGarde(bloc, 'export function MesPourboiresEnDirect(', 'if (!moi || !mes) return null;')));
dit('... la cliente par son prenom, jamais la note', [true, false], [bloc.includes('l.prenom ?'), /\.note\b/.test(bloc)]);
dit('... ce qui arrive se voit apres la premiere lecture de la table seulement', true, bloc.includes("if (!tablePrete('tips')) return;"));
dit('... la direction ou le Trone d essai sans serveur', true, bloc.includes('return direction || !supabase;'));
const monMois = sansCommentaires(lis('src/apps/trone/routes/equipe/MonMois.tsx'));
dit('Mon mois porte le bloc en tete, et plus la liste au nom entier', [true, false],
  [/mon espace\."\s*\/>\s*<MesPourboiresEnDirect moi=\{moi\} \/>/.test(monMois),
    monMois.includes('t.note?.trim()')]);
const dash = sansCommentaires(lis('src/apps/trone/routes/pilotage/Dashboard.tsx'));
dit('le Tableau de bord porte le bloc sous la salutation', true, /\{greeting\}\{who \? `, \$\{who\}` : ''\}\.\s*<\/h2>\s*<MesPourboiresEnDirect moi=\{maFiche\} \/>/.test(dash));
const caisse = sansCommentaires(lis('src/apps/trone/routes/vente/Caisse.tsx'));
dit('la Caisse y mene, apres le lien de La journee', true,
  /navigate\('\/la-journee'\)\}>[^<]*<\/button>\s*\{voitLesPourboires && \(\s*<button type="button" className="trv-linkbtn" data-lien="pourboires" onClick=\{\(\) => navigate\('\/pourboires'\)\}>/.test(caisse));
const enc = sansCommentaires(lis('src/apps/trone/routes/finances/Encaissements.tsx'));
dit('Encaissements y mene, sur le filtre Pourboires', true,
  enc.includes("{kind === 'pourboire' && voitLesPourboires && (\n              <Button size=\"sm\" variant=\"ghost\" data-lien=\"pourboires\" onClick={() => navigate('/pourboires')}>"));
const tips = sansCommentaires(lis('src/shared/tips.ts'));
dit('chaque part neuve porte l instant de son inscription', [true, true],
  [/const inscritLe = new Date\(\)\.toISOString\(\);\n  const lignes: Tip\[\] = parts\.map\(\(p\) => \(\{[\s\S]{0,160}inscritLe,\n  \}\)\);/.test(tips),
    /\.map\(\(l\) => \(\{ \.\.\.l, inscritLe: quand \}\)\)/.test(sansCommentaires(lis('src/apps/trone/shell/useReglementsEnLigne.ts')))]);

console.log(ko === 0 ? '\nLes pourboires de l equipe tiennent.' : `\n${ko} controle(s) en echec.`);
