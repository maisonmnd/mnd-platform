/* LE TRÔNE ALIGNÉ SUR LE JUGE UNIQUE, ÉPROUVÉ — `node scripts/verifie-le-trone-abonnee.mjs`.

   Lot L7 du parcours de l'abonnée (20 octobre 2026). Le Trône ne recompte plus
   rien : ses compteurs, son reste dû, ses comptes et ses gestes PROJETTENT le
   relevé de `src/shared/abonnee-pur.ts`. Ce banc porte les règles telles que
   Yéman les a dites (douze décisions, onze points de la maquette), jamais ce
   que le code en fait :

   ① les projections (`usageDetaille`, `comptesAbonnement`, `resteDuContrat`,
     `coveredRemaining`, l'état) disent les chiffres du juge ;
   ② l'argent d'un contrat ne s'écrit que par le serveur (`verse_sur_l_abonnement`),
     jamais sur l'appareil, et hors réseau on refuse sans rien écrire ;
   ③ chaque geste dit son effet, chiffré, avant d'agir ;
   ④ aucun écran ne recompte, aucune date sans année, aucun tiret long.

   Le scénario est celui de la maquette : Akouavi, Carnet de Six en Mini,
   140 000 F en 2 × 70 000 F, fin le 29 juin 2027. Tout est inventé.
   Sortie ASCII : la console de Windows ne connaît pas les accents. */
import { readFileSync } from 'node:fs';
import {
  usageDetaille, comptesAbonnement, moteurDesAbonnements, resteDuContrat, retardDuContrat, etatDuContrat,
  abonnementsVivantsDe, activeSubscriberOf, revoitLePrixConvenu, releveDuContrat, ETAT_LABEL, ETATS_QUI_COURENT,
  subscribersStore, valeurALaCarteDeLaFormule, type Plan, type Subscriber,
} from '../src/shared/abonnements';
import { prixDuFoyer } from '../src/shared/formules-en-lunes-pur';
import { coveredRemaining } from '../src/apps/trone/routes/equipe/data';
import { appointmentsStore, type Appointment } from '../src/shared/agenda';
import type { Invoice } from '../src/shared/finance';
import {
  effetDeLaResiliation, effetDeLAnnulation, effetDuPrixRevu, effetDeLaProlongation, effetDeLaSuspension,
  effetDeMarquerAbsente, marqueAbsente, rendLaSeance, annuleLaSeance, verseSurLAbonnement, ditLaSeance,
  gardeUnVersement, versementsEnAttente, echeancierAPoser, echeancierAEcrire, effetDePoserLEcheancier, poseLEcheancier,
} from '../src/apps/trone/routes/clients/gestes-de-l-abonnement';
import { etatDesRelancesDeLaPiece, derniereEcheanceRelancee } from '../src/shared/relances-pur';
import { TYPE_DIT } from '../src/shared/envois';

const sansCommentairesTot = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '');
let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
/* Les francs s'écrivent avec des espaces insécables : on les lit en espaces. */
const plat = (t: string | undefined): string => (t ?? '').replace(/[  ]/g, ' ');
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${ascii(nom).slice(1, -1)}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};

/* ── LE SCÉNARIO ── */
const GBEJI = 'sv-venue-gbeji-ess';
const SINSIN = 'sv-sinsin';
const plan = (o: Partial<Plan>): Plan => ({ tag: '', line: '', perks: [], popular: false, ...o } as Plan);
const SIX = plan({ id: 'pl-six', name: 'GBEJI Carnet de Six', mode: 'pack', validityDays: 270, priceXof: 140000, included: [{ serviceId: GBEJI, qty: 6 }, { serviceId: SINSIN, qty: 6 }] });
const QUATRE = plan({ id: 'pl-quatre', name: 'GBEJI Carnet de Quatre', mode: 'pack', validityDays: 180, priceXof: 84000, included: [{ serviceId: GBEJI, qty: 4 }] });
const LUNE = plan({ id: 'pl-lune', name: 'GBEJI Chaque Lune', mode: 'cycle', priceXof: 37500, included: [{ serviceId: GBEJI, qty: 1 }] });
const PLANS = [SIX, QUATRE, LUNE];
const AK = 'cl-ak';
const contrat = (o: Partial<Subscriber>): Subscriber => ({
  id: 'abo-14', branchId: 'b1', clientId: AK, name: 'A. K.', planId: SIX.id, slot: '', since: '', status: 'active', mrrXof: 0,
  reference: 'ABO-2026-014', sinceIso: '2026-10-02', startIso: '2026-10-02', expiresIso: '2027-06-29',
  priceXof: 140000, prixConvenuXof: 140000, nextIso: '2026-11-01', origine: 'comptoir',
  echeances: [{ numero: 1, dueIso: '2026-10-02', amountXof: 70000 }, { numero: 2, dueIso: '2026-11-01', amountXof: 70000 }],
  payments: [{ id: 'v1', amountXof: 70000, date: '2026-10-02', method: 'Espèces' }],
  ...o,
} as Subscriber);
const rdv = (id: string, date: string, o: Partial<Appointment> = {}): Appointment => ({
  id, branchId: 'b1', clientId: AK, date, time: '10:00', serviceIds: [GBEJI, SINSIN], status: 'honoré',
  master: 'M', coveredBySub: true, coverKind: 'abonnement', subId: 'abo-14', ...o,
} as Appointment);
const AK1 = contrat({});
const RDV = [
  rdv('r1', '2026-10-06'), rdv('r2', '2026-10-16'),
  rdv('r3', '2026-11-03', { status: 'confirmé' }),
];
const JOUR = '2026-10-20';
const ctx = { jour: JOUR, subs: [AK1], plans: PLANS, invoices: [] as Invoice[] };

/* ══ ① LES PROJECTIONS DISENT LES CHIFFRES DU JUGE ═══════════════════ */
const lignes = usageDetaille(AK1, SIX, RDV, ctx);
dit('usageDetaille : 2 faites, 1 reservee, 3 disponibles sur 6 (GBEJI)',
  { faites: 2, reservees: 1, manquees: 0, used: 3, remaining: 3, qty: 6 },
  (({ faites, reservees, manquees, used, remaining, qty }) => ({ faites, reservees, manquees, used, remaining, qty }))(lignes[0]));
dit('… les rendez-vous de la ligne sont ceux qui comptent, du plus recent au plus ancien', ['r3', 'r2', 'r1'], lignes[0].rdv.map((a) => a.id));
const avecAnnulee = [...RDV, rdv('r4', '2026-11-20', { status: 'annulé', annuleeLe: '2026-11-10T09:00:00+01:00', annuleePar: 'cliente' })];
dit('une annulee plus de 24 h avant ne prend rien', 3, usageDetaille(AK1, SIX, avecAnnulee, ctx)[0].remaining);
const avecTardive = [...RDV, rdv('r4', '2026-11-20', { status: 'annulé', annuleeLe: '2026-11-19T20:00:00+01:00', annuleePar: 'cliente' })];
dit('annulee a moins de 24 h par la cliente : comptee, manquee', { manquees: 1, remaining: 2 },
  (({ manquees, remaining }) => ({ manquees, remaining }))(usageDetaille(AK1, SIX, avecTardive, ctx)[0]));
dit('… annulee par la Maison, a la meme heure : jamais comptee', 3,
  usageDetaille(AK1, SIX, [...RDV, rdv('r4', '2026-11-20', { status: 'annulé', annuleeLe: '2026-11-19T20:00:00+01:00', annuleePar: 'maison' })], ctx)[0].remaining);
const absente = [...RDV, rdv('r4', '2026-10-18', { status: 'annulé', absente: { le: '2026-10-18' } })];
dit('absente : comptee, manquee', { manquees: 1, remaining: 2 }, (({ manquees, remaining }) => ({ manquees, remaining }))(usageDetaille(AK1, SIX, absente, ctx)[0]));
dit('… rendue par la Maison : la seance revient', 3,
  usageDetaille(AK1, SIX, [...RDV, rdv('r4', '2026-10-18', { status: 'annulé', absente: { le: '2026-10-18' }, rendue: { le: '2026-10-19', motif: 'Maladie' } })], ctx)[0].remaining);
dit('une suite de forfait ne se decompte jamais sur la formule', 3,
  usageDetaille(AK1, SIX, [...RDV, rdv('r5', '2026-10-17', { coverKind: 'forfait' })], ctx)[0].remaining);
dit('le lien explicite suit le contrat meme pose sur une autre fiche', 2,
  usageDetaille(AK1, SIX, [...RDV, rdv('r6', '2026-10-17', { clientId: 'cl-autre' })], ctx)[0].remaining);

/* L'état, avec les mots du juge, les mêmes partout. */
dit('etatDuContrat : en cours', 'en-cours', etatDuContrat(AK1, SIX, RDV, JOUR, ctx));
const six = Array.from({ length: 6 }, (_, i) => rdv(`e${i}`, `2026-10-0${i + 3}`));
dit('six seances prises : epuisee (elle ne bloque plus l achat)', 'epuisee', etatDuContrat(AK1, SIX, six, JOUR, ctx));
dit('passe sa fin : terminee', 'terminee', etatDuContrat(AK1, SIX, RDV, '2027-06-30', ctx));
dit('une resiliation datee : resiliee', 'resiliee', etatDuContrat(contrat({ resilieeLe: '2026-10-20', status: 'churn' }), SIX, RDV, JOUR, ctx));
dit('prise en ligne, rien de regle : retenue', 'retenue',
  etatDuContrat(contrat({ origine: 'couronne', payments: [], sinceIso: '2026-10-18', startIso: '2026-10-18' }), SIX, [], JOUR, ctx));
dit('chaque etat a son libelle, sans tiret long',
  true, (['retenue', 'en-cours', 'en-pause', 'epuisee', 'terminee', 'resiliee', 'effacee'] as const).every((e) => !!ETAT_LABEL[e] && !/[—–]/.test(ETAT_LABEL[e])));
dit('les etats qui courent', ['retenue', 'en-cours', 'en-pause', 'epuisee'], [...ETATS_QUI_COURENT]);

/* L'argent : le versé du contrat ET de sa pièce, par identifiant. */
const piece = { id: 'inv-1', payments: [{ id: 'v1', date: '2026-10-02', amountXof: 70000, method: 'Espèces' }, { id: 'v2', date: '2026-10-19', amountXof: 70000, method: 'MND PAY' }] } as unknown as Invoice;
const avecPiece = contrat({ invoiceId: 'inv-1' });
dit('reste du : la piece compte (MND PAY ne l ecrivait qu elle), sans doubler v1', 0,
  resteDuContrat(avecPiece, SIX, JOUR, { ...ctx, subs: [avecPiece], invoices: [piece] }));
dit('… sans les pieces, le contrat seul : 70 000 F', 70000, resteDuContrat(AK1, SIX, JOUR, ctx));
dit('le jour de l echeance n est pas un retard (dimanche 1er nov. juge le lundi 2)', 0, retardDuContrat(AK1, '2026-11-02', ctx));
dit('… le lendemain, si', 70000, retardDuContrat(AK1, '2026-11-03', ctx));

/* Les comptes : une projection du relevé, en séances (pas en prestations). */
const comptes = comptesAbonnement({ subs: [AK1], plans: PLANS, appts: RDV, aujourdhui: JOUR, invoices: [] });
const c0 = comptes[0].contrats[0];
dit('comptes : en seances, pas en prestations (six seances, pas douze)', { utilises: 3, promis: 6, faites: 2, reservees: 1, manquees: 0 },
  { utilises: c0.utilises, promis: c0.promis, faites: c0.faites, reservees: c0.reservees, manquees: c0.manquees });
dit('comptes : reste et verse sont ceux du juge', { reste: 70000, verse: 70000 }, { reste: c0.resteXof, verse: c0.verseXof });
dit('comptes : le releve du juge voyage avec le contrat', 'ABO-2026-014', c0.releve.reference);
const mot = moteurDesAbonnements({ comptes, plans: PLANS, aujourdhui: JOUR, prixDuService: () => 10000 });
dit('moteur : seances disponibles en seances, reservees a part', { dues: 3, reservees: 1 }, { dues: mot.seancesDues, reservees: mot.seancesReservees });
const motDuDimanche = moteurDesAbonnements({
  comptes: comptesAbonnement({ subs: [AK1], plans: PLANS, appts: RDV, aujourdhui: '2026-11-01', invoices: [] }),
  plans: PLANS, aujourdhui: '2026-11-01', prixDuService: () => 10000,
});
dit('moteur : l echeance du dimanche se range au lundi', ['2026-11-02'], motDuDimanche.dues.map((d) => d.dueIso));
dit('… et le dimanche meme, rien n est en retard', 0, motDuDimanche.retardXof);

/* Deux formules en même temps : la plus proche de sa fin se nomme d'abord. */
const QUATRE_K = contrat({ id: 'abo-21', planId: QUATRE.id, reference: 'ABO-2026-021', expiresIso: '2027-04-01', echeances: undefined, priceXof: 84000, prixConvenuXof: 84000, payments: [{ id: 'q1', amountXof: 84000, date: '2026-10-03' }] });
subscribersStore.set(() => [AK1, QUATRE_K]);
dit('deux formules courent ensemble', ['abo-21', 'abo-14'], abonnementsVivantsDe([AK1, QUATRE_K], AK).map((s) => s.id).sort().reverse());
dit('… celle qui finit le plus tot se nomme d abord', 'abo-21', activeSubscriberOf([AK1, QUATRE_K], AK)?.id);
subscribersStore.set(() => []);

/* coveredRemaining : la fenêtre de la date du rendez-vous, l'éditée exclue. */
dit('reste a couvrir a la date, la seance editee exclue', 4, coveredRemaining(AK1, SIX, GBEJI, RDV, 'r3', '2026-11-03'));
dit('… une prestation hors formule : undefined', undefined, coveredRemaining(AK1, SIX, 'sv-autre', RDV, undefined, '2026-11-03'));

/* ══ ② LE PRIX REVU (décision 10), PAR LE JUGE ══════════════════════ */
const revu = revoitLePrixConvenu(AK1, SIX, 190000, ctx);
dit('prix revu : l ecart va sur la prochaine echeance (70 000 -> 120 000)', [70000, 120000], revu.echeances?.map((e) => e.amountXof));
const solde = contrat({ payments: [{ id: 'v1', amountXof: 140000, date: '2026-10-02' }] });
const revuSolde = revoitLePrixConvenu(solde, SIX, 190000, { ...ctx, subs: [solde] });
dit('… plus aucune echeance : une neuve, a 30 jours (le lundi si dimanche)', { amountXof: 50000, dueIso: '2026-11-19' },
  revuSolde.nouvelle ? { amountXof: revuSolde.nouvelle.amountXof, dueIso: revuSolde.nouvelle.dueIso } : null);
const revuFaveur = revoitLePrixConvenu(solde, SIX, 120000, { ...ctx, subs: [solde] });
dit('… en sa faveur au-dela : un avoir, jamais un refus', { ok: true, avoir: 20000 }, { ok: revuFaveur.ok, avoir: revuFaveur.avoirXof });
const effetRevu = effetDuPrixRevu(AK1, SIX, ctx, 190000);
dit('l effet du prix revu se dit avant le geste, et ce que la cliente lira', true,
  effetRevu.ok && effetRevu.lignes.some((l) => plat(l).includes('120 000')) && plat(effetRevu.laClienteLit).includes('2026'));

/* LE FOYER SUR LA VALEUR DE LA FORMULE, la même pour toutes (Yéman, 20 oct.
   2026) : « six venues, la sixième offerte » vaut 140 000 × 6 / 5 = 168 000 F ;
   −15 % plafonnés à 25 % sous cette valeur : 126 000 F. */
const CARNET = { discountPct: 100 / 6, included: [{ serviceId: GBEJI, qty: 6 }] };
dit('la valeur a la carte du carnet', 168000, Math.round(valeurALaCarteDeLaFormule(140000, CARNET)));
dit('… le Foyer de la deuxieme tete', 126000, prixDuFoyer(140000, valeurALaCarteDeLaFormule(140000, CARNET)));
dit('… sans avantage ecrit, la valeur est son prix : les 15 % pleins', 119000,
  prixDuFoyer(140000, valeurALaCarteDeLaFormule(140000, { included: [{ serviceId: GBEJI, qty: 6 }] })));
{
  const vente = readFileSync('src/apps/trone/routes/equipe/Abonnements.tsx', 'utf8');
  const foyer = vente.slice(vente.indexOf('const foyerDeLaVente'), vente.indexOf('const prixDeLaVente'));
  dit('au comptoir, le Foyer lit la valeur de la formule, jamais le Juste Prix', { formule: true, justePrix: false },
    { formule: foyer.includes('valeurALaCarteDeLaFormule('), justePrix: foyer.includes('personalPriceXof(') });
}

/* ══ ③ LES GESTES DISENT LEUR EFFET ═════════════════════════════════ */
const resil = effetDeLaResiliation(AK1, SIX, RDV, ctx, '2026-10-20');
dit('resilier : avoir au prorata, arrondi au franc (70 000 - 46 667 = 23 333)', true, resil.lignes.some((l) => plat(l).includes('Avoir de 23 333 F')));
dit('… la cliente lit Resiliee, datee avec l annee', true, !!resil.laClienteLit?.includes('octobre 2026'));
dit('… une date avant la signature se refuse', true, !!effetDeLaResiliation(AK1, SIX, RDV, ctx, '2026-09-01').refus);
const lune = contrat({ id: 'abo-l', planId: LUNE.id, expiresIso: undefined, echeances: undefined, prixConvenuXof: 37500, nextIso: '2026-11-01' });
dit('une Chaque Lune resiliee : pas d avoir, la lune reglee court a son terme', true,
  effetDeLaResiliation(lune, LUNE, [], { ...ctx, subs: [lune] }, '2026-10-31').lignes.some((l) => l.includes('pas d’avoir') && l.includes('terme')));
const trop = [...RDV, rdv('r7', '2026-10-17'), rdv('r8', '2026-10-18')];
dit('consomme au-dela du regle : du a la date, relance comme une echeance', true,
  effetDeLaResiliation(AK1, SIX, trop, ctx, '2026-10-20').lignes.some((l) => plat(l).includes('dus le mardi 20 octobre 2026, relancés comme une échéance')));
dit('prolonger : la nouvelle fin se dit, avec l annee', true,
  effetDeLaProlongation(AK1, releveDuContrat(AK1, SIX, RDV, ctx), '2027-07-29').lignes[0].includes('29 juillet 2027'));
dit('suspendre : la fin recule d autant', true, effetDeLaSuspension(AK1, SIX, '2026-10-20', '2026-11-18').lignes.some((l) => l.includes('29 juillet 2027')));
dit('annuler a moins de 24 h pour la cliente : comptee', true,
  effetDeLAnnulation(rdv('x', '2026-11-03'), 'cliente', new Date('2026-11-02T20:00:00+01:00')).lignes[0].includes('COMPT'));
dit('… plus de 24 h avant : elle revient a la formule', true,
  effetDeLAnnulation(rdv('x', '2026-11-03'), 'cliente', new Date('2026-10-30T20:00:00+01:00')).lignes[0].includes('revient'));
const relev = releveDuContrat(AK1, SIX, RDV, ctx);
const s3 = relev?.attribuees.find((s) => s.id === 'r3');
dit('marquer absente : l effet nomme la seance 3 sur 6', true, !!s3 && effetDeMarquerAbsente(relev, s3).lignes[0].includes('3 sur 6'));

/* Une annulée ne dit jamais « séance 0 sur 6 ». */
const releveAnnule = releveDuContrat(AK1, SIX, avecAnnulee, ctx);
const sAnnulee = releveAnnule?.attribuees.find((s) => s.id === 'r4');
const ditAnnulee = releveAnnule && sAnnulee ? ditLaSeance(releveAnnule, sAnnulee, { annuleeLe: '2026-11-10T09:00:00+01:00', annuleePar: 'cliente' }) : null;
dit('une annulee ne dit jamais un rang', true, !!ditAnnulee && !/séance \d+ sur/.test(ditAnnulee.titre) && ditAnnulee.titre.includes('revient'));
dit('… la reservee dit Incluse, seance 3 sur 6, et reste 3 sur 6', { t: true, r: 'reste 3 sur 6' },
  relev && s3 ? { t: ditLaSeance(relev, s3, {}).titre.includes('3 sur 6'), r: ditLaSeance(relev, s3, {}).resteDit } : null);

/* Les faits s'écrivent sur le rendez-vous, le juge décide. */
appointmentsStore.set(() => [rdv('w1', '2026-10-18', { status: 'confirmé' })]);
marqueAbsente('w1', 'Rita G.', '2026-10-18');
const w1 = appointmentsStore.get()[0];
dit('marquer absente ecrit le fait (et sort du calendrier)', { status: 'annulé', absente: { le: '2026-10-18', par: 'Rita G.' } }, { status: w1.status, absente: w1.absente });
rendLaSeance('w1', 'Maladie', 'Rita G.', '2026-10-19');
dit('rendre la seance ecrit son motif', { le: '2026-10-19', motif: 'Maladie', par: 'Rita G.' }, appointmentsStore.get()[0].rendue);
appointmentsStore.set(() => [rdv('w2', '2026-11-03', { status: 'confirmé' })]);
annuleLaSeance('w2', 'cliente', new Date('2026-11-02T20:00:00+01:00'));
dit('annuler ecrit l instant et qui', { status: 'annulé', par: 'cliente', le: true },
  { status: appointmentsStore.get()[0].status, par: appointmentsStore.get()[0].annuleePar, le: !!appointmentsStore.get()[0].annuleeLe });
appointmentsStore.set(() => []);

/* UN CONTRAT SANS ÉCHÉANCIER N'EST JAMAIS EN RETARD (Yéman, 20 oct. 2026) :
   « Échéancier à poser · reste N F », et le comptoir le pose. */
const sansEch = contrat({ id: 'abo-se', echeances: undefined });
const relSans = releveDuContrat(sansEch, SIX, RDV, { ...ctx, subs: [sansEch] });
dit('sans echeancier : a poser, reste 70 000 F', { resteXof: 70000, regleXof: 70000, prixXof: 140000 }, echeancierAPoser(relSans));
dit('… avec echeancier, rien a poser', null, echeancierAPoser(releveDuContrat(AK1, SIX, RDV, ctx)));
const aEcrire = relSans ? echeancierAEcrire(relSans, 2, '2026-10-25') : [];
dit('poser : le regle reste la 1re, le reste en 2 fois, le dimanche au lundi', [
  { numero: 1, dueIso: '2026-10-02', amountXof: 70000 }, { numero: 2, dueIso: '2026-10-26', amountXof: 35000 }, { numero: 3, dueIso: '2026-11-24', amountXof: 35000 },
], aEcrire);
dit('… l effet se dit avant le geste', true, !!relSans && effetDePoserLEcheancier(relSans, 2, '2026-10-25').lignes.some((l) => plat(l).includes('lundi 26 octobre 2026 : 35 000 F')));
subscribersStore.set(() => [sansEch]);
poseLEcheancier('abo-se', aEcrire);
dit('… et s ecrit sur le contrat', 3, subscribersStore.get()[0].echeances?.length);
subscribersStore.set(() => []);
{
  const carteSrc = sansCommentairesTot(readFileSync('src/apps/trone/routes/clients/CarteAbonnement.tsx', 'utf8'));
  dit('la carte : jamais en retard sans echeancier, et le geste pour le poser', true,
    carteSrc.includes('aPoser ? undefined') && carteSrc.includes('Échéancier à poser') && carteSrc.includes('Poser l’échéancier'));
}

/* ══ ④ L'ARGENT PAR LE SERVEUR SEUL ════════════════════════════════ */
subscribersStore.set(() => [AK1]);
const avant = JSON.stringify(subscribersStore.get());
const issue = await verseSurLAbonnement('abo-14', { id: 'pay-t', date: JOUR, montantXof: 70000, moyen: 'Espèces', source: 'comptoir' });
dit('sans serveur, le versement se refuse en le disant', false, issue.ok);
dit('… et rien ne s ecrit sur l appareil', avant, JSON.stringify(subscribersStore.get()));
subscribersStore.set(() => []);
/* Hors ligne, le versement attend sur l'appareil, une fois par identifiant :
   le serveur, idempotent, ne le versera qu'une fois au retour du réseau. */
gardeUnVersement('abo-14', { id: 'pay-h', montantXof: 70000, moyen: 'Espèces' });
gardeUnVersement('abo-14', { id: 'pay-h', montantXof: 70000, moyen: 'Espèces' });
dit('hors ligne, le versement se garde une seule fois', ['pay-h'], versementsEnAttente().map((x) => x.versement.id));
dit('… et le contrat n est pas touche', avant, JSON.stringify([AK1]));

/* Les relances d'une échéance de formule se lisent (rl-<pièce>-e<k>-<n>). */
const journal = [
  { id: 'rl-inv-9-e1-1-whatsapp', statut: 'envoyé', quand: '2026-10-03T09:00:00Z' },
  { id: 'rl-inv-9-e2-1-whatsapp', statut: 'envoyé', quand: '2026-11-03T09:00:00Z' },
  { id: 'rl-inv-9-e2-2-whatsapp', statut: 'envoyé', quand: '2026-11-05T09:00:00Z' },
];
dit('la plus recente echeance relancee', 2, derniereEcheanceRelancee('inv-9', journal));
dit('… ses relances se comptent', 2, etatDesRelancesDeLaPiece({ factureId: 'inv-9', depart: '2026-11-02', journal, resteXof: 70000, enPause: false, aujourdhui: '2026-11-06', jourDe: (x) => x.slice(0, 10) }).parties);
dit('… une piece ordinaire lit toujours sa suite', null, derniereEcheanceRelancee('inv-1', [{ id: 'rl-inv-1-1-whatsapp' }]));
dit('les envois nouveaux ont leur nom', ['Rappel d’échéance', 'Prix revu'].map((x) => x.normalize()), [TYPE_DIT['rappel-echeance'], TYPE_DIT['prix-revu']]);
dit('la cadence posee arrive proposee a la cliente', true, /proposeeLe:\s*new Date\(\)\.toISOString\(\)/.test(readFileSync('src/apps/trone/routes/equipe/Abonnements.tsx', 'utf8')));

/* ══ ⑤ LES SOURCES : AUCUN ÉCRAN NE RECOMPTE ══════════════════════ */
/* Les commentaires s'effacent avant la lecture : un mot cité dans une note
   n'est pas du code (leçon du harnais destructif). */
const sansCommentaires = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1').replace(/\{\s*\}/g, '{}');
const lis = (p: string) => sansCommentaires(readFileSync(p, 'utf8'));
const ECRANS = [
  'src/apps/trone/routes/clients/Customers.tsx',
  'src/apps/trone/routes/clients/CarteAbonnement.tsx',
  'src/apps/trone/routes/clients/SeanceDeLaFormule.tsx',
  'src/apps/trone/routes/clients/_shared.tsx',
  'src/apps/trone/routes/clients/_gestes.tsx',
  'src/apps/trone/routes/clients/dettes-de-la-cliente.ts',
  'src/apps/trone/routes/equipe/Abonnements.tsx',
  'src/apps/trone/shell/Notifications.tsx',
];
for (const p of ECRANS) {
  const src = lis(p);
  const recompte = ['etatDesEcheances(', 'subPaid(', 'resteDeLEcheancier(', 'enRetardXof(', 'coversSub(', 'prochaineEcheance(']
    .filter((f) => src.includes(f));
  dit(`${p.split('/').pop()} ne recompte rien (ni echeances, ni verse, ni couverture)`, [], recompte);
}
const abo = lis('src/apps/trone/routes/equipe/Abonnements.tsx');
const savePay = abo.slice(abo.indexOf('const savePay'), abo.indexOf('const enregistreLesDates'));
dit('savePay passe par le serveur', true, savePay.includes('verseSurLAbonnement('));
dit('… et n ecrit ni le contrat ni la piece sur l appareil', { setSubs: false, invoices: false, payments: false },
  { setSubs: savePay.includes('setSubs('), invoices: savePay.includes('invoicesStore.set('), payments: /payments\s*:/.test(savePay) });
dit('la vente au comptoir ecrit son origine', true, /origine:\s*'comptoir'/.test(abo));
dit('une seconde formule ne se refuse plus au comptoir', false, abo.includes('Résiliez-la d’abord'));
dit('le MRR ne se lit plus a l ecran', false, /m\.mrrXof|aResilier\.mrrXof/.test(abo));

const carte = lis('src/apps/trone/routes/clients/CarteAbonnement.tsx');
for (const g of ['Prolonger', 'Suspendre', 'Résilier daté', 'Rendre la séance', 'Revoir le prix après le comptage', 'Envoyer un lien MND PAY', 'Encaisser']) {
  dit(`carte Abonnement : le geste « ${g} »`, true, carte.includes(g));
}
for (const f of ['effetDeLaResiliation(', 'effetDeLaProlongation(', 'effetDeLaSuspension(', 'effetDuPrixRevu(', 'effetDeRendre(']) {
  dit(`carte Abonnement : l effet ${f.slice(0, -1)} se lit avant le geste`, true, carte.includes(f));
}
dit('carte Abonnement : ce que la cliente lira', true, carte.includes('La cliente lit'));
dit('carte Abonnement : elle lit le juge, ne recompte rien', true, carte.includes('releveDeLAbonnee('));
const seanceSrc = lis('src/apps/trone/routes/clients/SeanceDeLaFormule.tsx');
for (const g of ['Marquer faite', 'Absente : marquer manquée', 'Rendre la séance']) {
  dit(`fiche du rendez-vous : le geste « ${g} »`, true, seanceSrc.includes(g));
}
const shared = lis('src/apps/trone/routes/clients/_shared.tsx');
dit('decocher une couverture demande son motif', true, shared.includes('Décocher la couverture') && shared.includes('couvertureRetiree'));
dit('annuler une seance de formule demande qui annule', true, shared.includes('Qui annule cette séance ?'));
dit('le reste se dit pour un paquet, sans « ce cycle »', false, shared.includes('ce cycle`'));
const cust = lis('src/apps/trone/routes/clients/Customers.tsx');
dit('la pastille Abonnee est devenue la carte', { pastille: false, carte: true }, { pastille: cust.includes('★ Abonnée'), carte: cust.includes('<CarteAbonnement') });
dit('ce qui presse lit le solde du juge, et met l echeancier a poser hors du du', true, cust.includes('releveDeLAbonnee(') && cust.includes('echeancierAPoser('));
const cloche = lis('src/apps/trone/shell/Notifications.tsx');
dit('la cloche dit les trois signaux du juge', true,
  cloche.includes('Formule prise en ligne, à régler') && cloche.includes('Séance incluse réservée en ligne') && cloche.includes('Séance à clôturer'));

/* Aucun tiret long dans ce qui s'affiche (les textes des nouveaux fichiers). */
for (const p of ['src/apps/trone/routes/clients/CarteAbonnement.tsx', 'src/apps/trone/routes/clients/SeanceDeLaFormule.tsx', 'src/apps/trone/routes/clients/gestes-de-l-abonnement.ts']) {
  dit(`${p.split('/').pop()} : aucun tiret long affiche`, false, /[—–]/.test(lis(p)));
  dit(`${p.split('/').pop()} : aucune date sans annee (toLocaleDateString)`, false, lis(p).includes('toLocaleDateString'));
}

console.log(ko ? `\n${ko} ECHEC(S) sur ${n}.` : `\nLe Trone suit le juge unique (${n} epreuves).`);
