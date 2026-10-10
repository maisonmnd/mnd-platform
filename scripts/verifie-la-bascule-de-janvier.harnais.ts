/* LA BASCULE DU 1er JANVIER 2027, ÉPROUVÉE — 11 octobre 2026 (la genèse des prix, lot 5).

   La RÈGLE (question 12, décidée au sélecteur le 10 octobre 2026) :
   - le 1er janvier 2027, les hausses, la création par tranches et Ma Couronne ;
   - les rendez-vous déjà pris gardent leur prix ;
   - les abonnées gardent leur contrat, et leur premier renouvellement à
     l'ancien prix ;
   - une cliente dont la visite monte de plus de 10 % garde son prix trois mois.
   Attendus écrits à la main. `node scripts/verifie-la-bascule-de-janvier.mjs` ;
   `--prouve` remet chaque faute une à une et exige que le banc crie. */
import { readFileSync } from 'node:fs';
import {
  BASCULE, ANCIENNES_FORMULES, fermeLesAnciennesFormules, peutReprendreSonAncienne, doitSeFiger, figeLesRendezVous,
  visiteDeReference, prixTenusDeLaTete, prixTenusActifs, avecLesPrixTenus, PRIX_TENUS_JUSQUAU, INSTANT_DE_LA_BASCULE,
} from '../src/shared/bascule-de-janvier-pur';
import { appliqueLaGrille, masquesDeLaGrille, BASCULE_DE_JANVIER, phaseDeLaGrille } from '../src/shared/nouvelle-grille-pur';
import { MODEL_BANDS_SEED, pricingOf, personalPriceXof, locksAuTarif } from '../src/shared/pricing';
import { TOUT_KIDS, kidsVoulus } from '../src/shared/kids';
import { CHAMPS_DE_LA_VISITE } from '../src/shared/reprise-nue';
import type { Service } from '../src/shared/catalog';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)}`));
};

/* ── 0. Un seul jour ── */
dit('la bascule de la grille et celle du juge sont le meme jour', ['2027-01-01', '2027-01-01'], [BASCULE, BASCULE_DE_JANVIER]);
dit('l instant est minuit a Cotonou', '2026-12-31T23:00:00.000Z', new Date(INSTANT_DE_LA_BASCULE).toISOString());

/* ── 1. Les treize anciennes formules ── */
dit('treize anciennes formules', 13, ANCIENNES_FORMULES.length);
const plans = [
  { id: 'pl-mkt-juste-cadence' }, { id: 'pl-mkt-carnet', fermee: false }, { id: 'pl-mkt-suite', fermee: true, fermeeLe: '2026-11-02' },
  { id: 'pl-lune-quatre' }, { id: 'pl-mkt-lavage' },
];
const f = fermeLesAnciennesFormules(plans, '2027-01-01');
dit('fermees : les jamais touchees seulement', ['pl-mkt-juste-cadence', 'pl-mkt-lavage'], f?.fermees);
dit('… marquees par la bascule, datees', { id: 'pl-mkt-juste-cadence', fermee: true, fermeeLe: '2027-01-01', fermeeParLaBascule: true }, f?.plans[0]);
dit('… une rouverte reste ouverte, une fermee a la main garde sa date, une neuve ne bouge pas', [plans[1], plans[2], plans[3]], [f?.plans[1], f?.plans[2], f?.plans[3]]);
dit('rejouee : rien', null, fermeLesAnciennesFormules(f!.plans, '2027-01-02'));

/* ── 2. Le premier renouvellement, a l ancien prix ── */
const fermeeBascule = { id: 'pl-mkt-juste-cadence', fermee: true, fermeeParLaBascule: true };
const contrats = [{ clientId: 'c1', planId: 'pl-mkt-juste-cadence', startIso: '2026-11-03' }];
dit('elle la tenait : elle peut la reprendre', true, peutReprendreSonAncienne(fermeeBascule, 'c1', contrats));
dit('une fois seulement', false, peutReprendreSonAncienne(fermeeBascule, 'c1', [...contrats, { clientId: 'c1', planId: 'pl-mkt-juste-cadence', startIso: '2027-02-10' }]));
dit('une autre tete : non ; une formule fermee a la main : non ; ouverte : rien a reprendre', [false, false, false], [
  peutReprendreSonAncienne(fermeeBascule, 'c2', contrats),
  peutReprendreSonAncienne({ id: 'pl-mkt-juste-cadence', fermee: true }, 'c1', contrats),
  peutReprendreSonAncienne({ id: 'pl-mkt-juste-cadence' }, 'c1', contrats),
]);
dit('le debut se lit au jour de la vente quand la premiere venue manque', true,
  peutReprendreSonAncienne(fermeeBascule, 'c1', [{ clientId: 'c1', planId: 'pl-mkt-juste-cadence', sinceIso: '2026-12-20' }]));

/* ── 3. Les rendez-vous deja pris gardent leur prix ── */
const rdv = (id: string, extra: Record<string, unknown> = {}) => ({ id, date: '2027-01-05', status: 'confirmé', serviceIds: ['sv-x'], creeLe: '2026-12-10T10:00:00.000Z', ...extra });
const lot = [
  rdv('a'), rdv('veille', { date: '2026-12-31' }), rdv('honore', { status: 'honoré' }), rdv('annule', { status: 'annulé' }),
  rdv('prix', { priceXof: 9000 }), rdv('serie', { seriesIndex: 2 }), rdv('couvert', { coveredBySub: true }),
  rdv('forfait', { forfait: { totalXof: 1 } }), rdv('apres', { creeLe: '2027-01-01T08:00:00.000Z' }), rdv('sans-date-de-pose', { creeLe: undefined }),
  rdv('attente', { status: 'en attente' }), rdv('vide', { serviceIds: [] }),
];
dit('se figent : a venir, pris avant, sans prix', ['a', 'sans-date-de-pose', 'attente'], lot.filter((a) => doitSeFiger(a)).map((a) => a.id));
dit('le rendez-vous pose a 23 h 30 le 31 decembre se fige, celui de 0 h 30 non', [true, false], [
  doitSeFiger(rdv('x', { creeLe: '2026-12-31T22:30:00.000Z' })), doitSeFiger(rdv('y', { creeLe: '2026-12-31T23:30:00.000Z' })),
]);
const fg = figeLesRendezVous(lot, (a) => (a.id === 'attente' ? undefined : 30000));
dit('fige au prix lu, la raison ecrite ; un prix illisible ne fige rien', [['a', 'sans-date-de-pose'], 30000, 30000],
  [fg?.figes, fg?.rdvs[0].priceXof, (fg?.rdvs[0] as { prixFigeParLaBascule?: number }).prixFigeParLaBascule]);
dit('rejoue : les figes ne se refigent pas', null, figeLesRendezVous(fg!.rdvs.filter((a) => a.id !== 'attente'), () => 1));
dit('une reprise ne recopie pas le prix de la bascule', true, CHAMPS_DE_LA_VISITE.includes('prixFigeParLaBascule' as never));

/* ── 4. Sa visite de reference ── */
const passees = [
  { clientId: 'c1', date: '2026-12-20', status: 'honoré', serviceIds: ['sv-atl-i-med'] },
  { clientId: 'c1', date: '2026-11-02', status: 'honoré', serviceIds: ['sv-atl-ii-e', 'sv-plt-05-ess-c'], longueur: 'court' },
  { clientId: 'c1', date: '2026-06-10', status: 'honoré', serviceIds: ['sv-atl-ii-l'], longueur: 'long' },
  { clientId: 'c1', date: '2026-12-28', status: 'honoré', serviceIds: ['sv-plt-30-c'], seriesIndex: 2 },
  { clientId: 'c1', date: '2026-12-29', status: 'confirmé', serviceIds: ['sv-plt-20-c'] },
  { clientId: 'c2', date: '2025-12-31', status: 'honoré', serviceIds: ['sv-atl-ii-e'] },
];
const creation = (id: string) => id.startsWith('sv-atl-i-');
dit('la derniere visite honoree, hors creation et hors seance de suite', { serviceIds: ['sv-atl-ii-e', 'sv-plt-05-ess-c'], longueur: 'court' },
  visiteDeReference(passees, 'c1', creation));
dit('plus de douze mois : pas de visite', null, visiteDeReference(passees, 'c2', creation));

/* ── 5. Plus de 10 % : ses prix tenus trois mois ── */
const avant: Record<string, number> = { 'sv-kids-sinsin': 15000, 'sv-kids-kloklo': 5000, 'sv-atl-iii-cou-l': 15000, 'sv-plt-10-m': 25000 };
const apres: Record<string, number> = { 'sv-kids-sinsin': 20000, 'sv-kids-kloklo': 5000, 'sv-atl-iii-cou-c': 20000, 'sv-plt-10-m': 25000 };
dit('20 000 + 5 000 contre 15 000 + 5 000 (+25 %) : le SINSIN Kids tenu a 15 000', { 'sv-kids-sinsin': 15000 },
  prixTenusDeLaTete({ visite: ['sv-kids-sinsin', 'sv-kids-kloklo'], avant: (id) => avant[id], apres: (id) => apres[id] }));
dit('+10 % pile : rien', null, prixTenusDeLaTete({ visite: ['a'], avant: () => 10000, apres: () => 11000 }));
dit('+10,1 % : tenu', { a: 10000 }, prixTenusDeLaTete({ visite: ['a'], avant: () => 10000, apres: () => 11010 }));
dit('une Couleur archivee se lit sous son successeur', { 'sv-atl-iii-cou-c': 15000 },
  prixTenusDeLaTete({ visite: ['sv-atl-iii-cou-l', 'sv-plt-10-m'], avant: (id) => avant[id], apres: (id) => apres[id] }));
dit('un prix illisible : rien de tenu', null, prixTenusDeLaTete({ visite: ['sv-kids-sinsin', 'inconnue'], avant: (id) => avant[id], apres: (id) => apres[id] }));
const tenus = { jusquau: PRIX_TENUS_JUSQUAU, services: { 'sv-kids-sinsin': 15000 } };
dit('tenus jusqu au 31 mars 2027 inclus', [{ 'sv-kids-sinsin': 15000 }, { 'sv-kids-sinsin': 15000 }, undefined],
  [prixTenusActifs(tenus, '2027-01-02'), prixTenusActifs(tenus, '2027-03-31'), prixTenusActifs(tenus, '2027-04-01')]);
dit('un prix ferme pose a la main l emporte', { 'sv-kids-sinsin': 12000, x: 1 }, avecLesPrixTenus({ 'sv-kids-sinsin': 12000, x: 1 }, tenus, '2027-02-01'));
dit('pricingOf lit les prix tenus au jour du rendez-vous', [15000, undefined], [
  pricingOf({ prixTenus: tenus } as never, MODEL_BANDS_SEED, undefined, undefined, '2027-03-31').prixFixes?.['sv-kids-sinsin'],
  pricingOf({ prixTenus: tenus } as never, MODEL_BANDS_SEED, undefined, undefined, '2027-04-01').prixFixes?.['sv-kids-sinsin'],
]);

/* ── 6. La creation par tranches ── */
const creations: Record<string, unknown>[] = [
  { id: 'sv-atl-i-jum', bandIds: ['cal-jumbo'], tarifMode: 'lock', priceXof: 0, categoryId: 'atl-i-vekpe', tarifLockParLongueur: { long: 1500, court: 1100, 'mi-long': 1300 }, prixParLongueur: { long: 120000, court: 80000, 'mi-long': 100000 } },
  { id: 'sv-atl-i-med', bandIds: ['cal-medium'], tarifMode: 'lock', priceXof: 0, categoryId: 'atl-i-vekpe', tarifLockParLongueur: { long: 1500, court: 1100, 'mi-long': 1300 } },
  { id: 'sv-atl-i-min', bandIds: ['cal-mini'], tarifMode: 'lock', priceXof: 0, categoryId: 'atl-i-vekpe', tarifLockParLongueur: { long: 1500, court: 1100, 'mi-long': 1300 } },
  { id: 'sv-atl-i-mic', bandIds: ['cal-micro'], tarifMode: 'lock', priceXof: 0, categoryId: 'atl-i-vekpe', tarifLockParLongueur: { long: 1600, court: 1400, 'mi-long': 1500 } },
  { id: 'sv-atl-i-nan', bandIds: ['cal-nano'], tarifMode: 'lock', priceXof: 0, categoryId: 'atl-i-vekpe', tarifLockParLongueur: { long: 1600, court: 1400, 'mi-long': 1500 }, prixParLongueur: { long: 600000, court: 525000, 'mi-long': 575000 } },
  { id: 'sv-atl-i-pic', bandIds: ['cal-pico', 'cal-galaxy'], tarifMode: 'lock', priceXof: 0, categoryId: 'atl-i-vekpe', tarifLockParLongueur: { long: 1600, court: 1400, 'mi-long': 1500 }, prixParLongueur: { long: 825000, court: 700000, 'mi-long': 775000 } },
];
const enJanvier = appliqueLaGrille({ services: creations as never, categories: [] }, 'janvier', '2027-01-01')!.services as unknown as Service[];
const prixDe = (cat: readonly Service[], id: string, locks: number | undefined, longueur: 'court' | 'mi-long' | 'long') =>
  personalPriceXof(cat.find((s) => s.id === id)!, { ...pricingOf({ lockCount: locks }, MODEL_BANDS_SEED), longueur }, cat);
dit('aujourd hui : Medium 120 locks court 132 000, Nano 400 court 560 000', [132000, 560000],
  [prixDe(creations as never, 'sv-atl-i-med', 120, 'court'), prixDe(creations as never, 'sv-atl-i-nan', 400, 'court')]);
dit('en janvier : 120 court 138 000 ; 250 long 387 500 ; 300 court 372 500 ; 400 long 657 500 ; 500 mi-long 775 000', [138000, 387500, 372500, 657500, 775000], [
  prixDe(enJanvier, 'sv-atl-i-med', 120, 'court'), prixDe(enJanvier, 'sv-atl-i-min', 250, 'long'), prixDe(enJanvier, 'sv-atl-i-mic', 300, 'court'),
  prixDe(enJanvier, 'sv-atl-i-nan', 400, 'long'), prixDe(enJanvier, 'sv-atl-i-pic', 500, 'mi-long'),
]);
dit('le plancher : Jumbo de 50 locks, long, 120 000', 120000, prixDe(enJanvier, 'sv-atl-i-jum', 50, 'long'));
dit('le lock 251 coute le tarif fin, jamais le saut d un calibre', 1700,
  prixDe(enJanvier, 'sv-atl-i-mic', 251, 'court') - prixDe(enJanvier, 'sv-atl-i-min', 250, 'court'));
dit('une tete pas encore comptee lit le des de son calibre', [90000, 170000, 285000, 455000, 625000], [
  prixDe(enJanvier, 'sv-atl-i-med', undefined, 'court'), prixDe(enJanvier, 'sv-atl-i-min', undefined, 'court'),
  prixDe(enJanvier, 'sv-atl-i-mic', undefined, 'court'), prixDe(enJanvier, 'sv-atl-i-nan', undefined, 'court'), prixDe(enJanvier, 'sv-atl-i-pic', undefined, 'court'),
]);
dit('le des de chaque calibre ne depasse jamais son premier lock compte', true, [
  ['sv-atl-i-med', 81], ['sv-atl-i-min', 151], ['sv-atl-i-mic', 251], ['sv-atl-i-nan', 351], ['sv-atl-i-pic', 451],
].every(([id, n]) => (['court', 'mi-long', 'long'] as const).every((l) =>
  (enJanvier.find((s) => s.id === id)!.prixParLongueur?.[l] ?? 0) <= locksAuTarif(enJanvier.find((s) => s.id === id)!, n as number, l, enJanvier.find((s) => s.id === id)!.tarifLockParLongueur![l]!))));
dit('sans tranche : le comptage d avant', 1100 * 300, locksAuTarif({}, 300, 'court', 1100));

/* ── 7. La grille de janvier sur les Kids, et les masques ── */
const kidsJanvier = appliqueLaGrille({ services: TOUT_KIDS as never, categories: [] }, 'janvier', '2027-01-01')!.services as unknown as Service[];
const k = (id: string) => kidsJanvier.find((s) => s.id === id)!;
dit('Kids : la marche a 150 locks, la naissance a la composition moins 10 %', [[{ auDela: 150, prixXof: 20000 }], [{ auDela: 150, prixXof: 30000 }], 0, 10], [
  k('sv-kids-sinsin').paliersDeLocks, k('sv-kids-rituel').paliersDeLocks, k('sv-kids-naissance').priceXof, k('sv-kids-naissance').forfaitRemisePct,
]);
dit('le bouton Kids suit la grille de janvier apres la bascule', [[{ auDela: 250, prixXof: 20000 }], [{ auDela: 150, prixXof: 20000 }]], [
  kidsVoulus('2026-12-31').find((s) => s.id === 'sv-kids-sinsin')?.paliersDeLocks, kidsVoulus('2027-01-01').find((s) => s.id === 'sv-kids-sinsin')?.paliersDeLocks,
]);
dit('la phase du jour', ['maintenant', 'janvier'], [phaseDeLaGrille('2026-12-31'), phaseDeLaGrille('2027-01-01')]);
const vitrine = { hiddenServices: ['sv-venue-gbeji-ess', 'sv-plt-30-cur', 'sv-dds-dec'], siteMasques: { services: ['sv-plt-30-cur', 'sv-retouches-post-reprise'], categories: ['sup'] } };
dit('janvier montre les nouveautes et la Cure VIVIVO, garde les masques de la Maison', [['sv-dds-dec'], ['sv-retouches-post-reprise'], ['sup']], [
  masquesDeLaGrille(vitrine, 'janvier')?.hiddenServices, masquesDeLaGrille(vitrine, 'janvier')?.siteMasques?.services, masquesDeLaGrille(vitrine, 'janvier')?.siteMasques?.categories,
]);

/* ── 8. Le lanceur et les ecrans (commentaires effaces) ── */
const sansCom = (fichier: string) => readFileSync(fichier, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const lanceur = sansCom('src/apps/trone/shell/bascule-de-janvier.ts');
dit('rien avant le 1er janvier 2027', true, /if \(isoDuJour\(new Date\(\)\) < BASCULE \|\|/.test(lanceur));
dit('l ordre : figer, tenir, poser la carte, fermer, demasquer ; figer et tenir seulement sur l ancienne carte', true,
  /if \(carte\) \{\s*await figeLesRendezVousPris\(\);[\s\S]*?poseLesPrixTenus\(carte\.services[\s\S]*?servicesStore\.set\(carte\.services[\s\S]*?\}\s*const formules = fermeLesAnciennesFormules\([\s\S]*?plansStore\.set\([\s\S]*?if \(!\(await demasquee\(\)\)\) return;[^\n]*\s*marque\(\);/.test(lanceur));
dit('la session, et les cinq tables attendues', [true, true], [
  /if \(!\(await sb\.auth\.getSession\(\)\)\.data\.session\) return;/.test(lanceur),
  /catalog_services: false, catalog_categories: false, plans: false, appointments: false, clients: false/.test(lanceur),
]);
dit('la vitrine relue au serveur avant les masques', true, /from\('documents'\)\.select\('data'\)\.eq\('key', 'mnd_vitrine_config'\)/.test(lanceur));
dit('le Trone lance la bascule au demarrage', true, /\nmigreLaBasculeDeJanvier\(\);/.test(sansCom('src/apps/trone/main.tsx')));
dit('le tarif de la tete lit le jour du rendez-vous', true,
  /pricingOf\(ctx\.client, ctx\.bands, ctx\.sets, ctx\.cats, appt\.date\?\.slice\(0, 10\)\)/.test(sansCom('src/apps/trone/routes/clients/_shared.tsx')));
dit('la vente propose son renouvellement a l ancien prix', true,
  /\|\| peutReprendreSonAncienne\(p, subForm\.clientId, subs\)\)\.map\(/.test(sansCom('src/apps/trone/routes/equipe/Abonnements.tsx')));
dit('le juge est pur', false, /^\s*import\s/m.test(sansCom('src/shared/bascule-de-janvier-pur.ts')));

console.log(ko === 0 ? '\nLa bascule de janvier tient.' : `\n${ko} epreuve(s) en echec.`);
