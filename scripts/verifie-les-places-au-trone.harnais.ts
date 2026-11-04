/* LES PLACES LIMITEES AU TRONE, EPROUVEES — 4 novembre 2026.
   `node scripts/verifie-les-places-au-trone.mjs` (et `--prouve`).

   La decision (Yeman, maquette « Places limitees » AhFRNqiggFoaiR725iKSQe,
   « construis ») : −15 % sur les shampoings, lavages et soins ; du mardi au
   vendredi, jamais le samedi ; seulement un jour vide ; trois places par jour
   decomptees, « Places limitees · Remise : il reste N places » ; une
   reservation au plein tarif ce jour-la ferme les places restantes ; une
   place prise est gardee ; une seule remise (ni prix convenus, ni abonnee, ni
   famille, ni remise de la main, ni autre code) ; le Rituel Sowa sans aucune
   remise ; jours, places, horizon, pourcentage et allumage regles dans
   Systeme › Parametres, jamais en dur.

   Deux parties : les regles du Trone (places-au-trone-pur, parametres-pur),
   puis les portes qui les lisent (la fenetre du rendez-vous, la Caisse, Son
   prochain rituel, le rendez-vous du foyer, la reprise, les Parametres),
   lues dans leurs sources. TOUS LES ATTENDUS SONT ECRITS EN DUR. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  baseDeLaRemiseFamille, ditLaPlaceDuRdv, ditLeGesteSansRemise, famPctDeLaTete, laFamilleSuitElle, laRemiseSurTout, lOffreDuJourAuTrone,
  occupationPourLeRdv, offreAPlacesDuJour, offresApresLeReglage, placeTenue, pourquoiSansPlace, prisesAuComptoir, reglageDesPlaces,
  remiseFamilleEnFrancs, remisesDeLaMainDuRdv, remisesHorsDuGesteSansRemise, type VenueDuTrone,
} from '../src/apps/trone/routes/clients/places-au-trone-pur';
import { leTicket, remiseDeLaLigneTenue, type EntreeDuTicket } from '../src/apps/trone/routes/vente/encaissement-pur';
import { invoiceTotal } from '../src/shared/finance-pur';
import type { Invoice } from '../src/shared/finance';
import { joursDesPlacesDits, resumePlaces, tuilesTrouvees } from '../src/apps/trone/routes/systeme/parametres-pur';

declare const __PANNE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 220)}`));
};
const vrai = (nom: string, v: boolean, detail?: unknown) => dit(nom, true, v ? true : { faux: detail ?? false });

const racine = path.resolve(process.cwd());
const lis = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__PANNE__ && __PANNE__.fichier === rel) s = s.split(__PANNE__.avant).join(__PANNE__.apres);
  return s;
};

/* ═══ 1. LES REGLES DU TRONE ═══════════════════════════════════════════ */
const AUJ = '2026-11-05'; // un jeudi
const MARDI = '2026-11-10';
const MERCREDI = '2026-11-11';
const PLACES = {
  id: 'of-places-limitees', branchId: 'br', active: true, code: 'PLACES15', title: 'Places limitées', discountPct: 15,
  serviceIds: ['sv-shampoing', 'sv-soin'], joursDeLaVenue: ['Mar', 'Mer', 'Jeu', 'Ven'],
  placesParJour: 3, jourVideSeulement: true, horizonJours: 14,
};
const rdv = (id: string, date: string, plus: Record<string, unknown> = {}) => ({ id, date, status: 'confirmé', branchId: 'br', ...plus });
const prise = (id: string, date: string) => rdv(id, date, { offreId: 'of-places-limitees', codeOffre: 'PLACES15' });
const juge = (rdvs: VenueDuTrone['rdvs'], dateIso: string, plus: Partial<VenueDuTrone> = {}, offres: typeof PLACES[] = [PLACES]) =>
  lOffreDuJourAuTrone(offres, { branchId: 'br', dateIso, serviceIds: ['sv-reprise', 'sv-shampoing'], aujourdhui: AUJ, rdvs, ...plus });
const id = (j: ReturnType<typeof juge>) => (j ? { id: j.offre.id, tenue: j.tenue, restantes: j.restantes } : null);

/* ── Le decompte, tire du carnet ── */
dit('un mardi vide : la place se pose, trois places', { id: 'of-places-limitees', tenue: false, restantes: 3 }, id(juge([], MARDI)));
dit('... le bandeau dit « Places limitees · Remise : il reste 3 places »', 'Places limitées · Remise : il reste 3 places', ditLaPlaceDuRdv(juge([], MARDI)!));
dit('deux places deja prises : « il reste une place »', 'Places limitées · Remise : il reste une place',
  ditLaPlaceDuRdv(juge([prise('a', MARDI), prise('b', MARDI)], MARDI)!));
dit('trois prises : plus rien', null, id(juge([prise('a', MARDI), prise('b', MARDI), prise('c', MARDI)], MARDI)));
dit('un rendez-vous au plein tarif ce jour-la : le jour est pris', null, id(juge([rdv('x', MARDI)], MARDI)));
dit('une place prise puis un plein tarif : les restantes se ferment', null, id(juge([prise('a', MARDI), rdv('x', MARDI)], MARDI)));
dit('un rendez-vous d une autre maison ne ferme pas le jour', 3, juge([rdv('x', MARDI, { branchId: 'autre' })], MARDI)?.restantes);
dit('un annule ne ferme pas le jour', 3, juge([rdv('x', MARDI, { status: 'annulé' })], MARDI)?.restantes);
dit('jamais le samedi', null, id(juge([], '2026-11-14')));
dit('au-dela des 14 jours : pas encore', null, id(juge([], '2026-11-20')));

/* ── Le rendez-vous relu ── */
const RELU = prise('r', MARDI);
const rempli = [RELU, prise('a', MARDI), prise('b', MARDI), rdv('x', MARDI), rdv('y', MARDI)];
dit('une place prise est gardee, meme jour rempli', { id: 'of-places-limitees', tenue: true, restantes: 0 }, id(juge(rempli, MARDI, { relu: RELU })));
dit('... et le bandeau dit « place tenue »', 'Places limitées · place tenue', ditLaPlaceDuRdv(juge(rempli, MARDI, { relu: RELU })!));
dit('le relu qui tient sa place ne se compte pas deux fois', { prises: 0, autres: 0 }, occupationPourLeRdv(PLACES, [RELU], MARDI, { branchId: 'br', relu: RELU }));
dit('deplace a un jour rempli : la place ne le suit pas', null,
  id(juge([RELU, rdv('x', MERCREDI)], MERCREDI, { relu: RELU })));
dit('deplace a un jour vide : il redemande une place, trois restent', { id: 'of-places-limitees', tenue: false, restantes: 3 },
  id(juge([RELU], MERCREDI, { relu: RELU })));
const PLEIN = rdv('p', MARDI);
dit('pose au plein tarif sur un jour vide, rouvert : il a ferme le jour, pas de remise', null, id(juge([PLEIN], MARDI, { relu: PLEIN })));
dit('... et il se compte parmi les autres', { prises: 0, autres: 1 }, occupationPourLeRdv(PLACES, [PLEIN], MARDI, { branchId: 'br', relu: PLEIN }));
dit('... deplace a un jour vide : la place s offre', { id: 'of-places-limitees', tenue: false, restantes: 3 }, id(juge([PLEIN], MERCREDI, { relu: PLEIN })));
dit('la place tenue se lit sur l offre ou son code, a sa date', ['of-places-limitees', 'of-places-limitees', undefined, undefined],
  [placeTenue(RELU, MARDI, [PLACES]), placeTenue({ id: 'c', date: MARDI, codeOffre: 'places15' }, MARDI, [PLACES]),
    placeTenue(RELU, MERCREDI, [PLACES]), placeTenue({ ...RELU, status: 'annulé' }, MARDI, [PLACES])]);

/* ── Une seule remise ── */
dit('jamais pour une tete aux prix convenus', null, id(juge([], MARDI, { prixConvenus: true })));
dit('jamais par-dessus une autre remise (famille, la main)', null, id(juge([], MARDI, { autreRemise: true })));
dit('jamais pour une abonnee', null, id(juge([], MARDI, { couvertParAbonnement: true })));
dit('jamais par-dessus un autre code', null, id(juge([], MARDI, { dejaUnCode: true })));
dit('ecartee par la Maison : rien', null, id(juge([], MARDI, { ecartee: true })));
dit('une place tenue ne survit pas aux prix convenus', null, id(juge(rempli, MARDI, { relu: RELU, prixConvenus: true })));

/* ── Les clientes de passage ── */
const PIECES = [
  { branchId: 'br', date: MARDI, kind: 'facture', discountLabel: 'PLACES15 · 15 % hors gamme, arrondi au millier' },
  { branchId: 'br', date: MARDI, kind: 'facture', discountLabel: 'PLACES15 · 15 % hors gamme' },
  { branchId: 'br', date: MERCREDI, kind: 'facture', discountLabel: 'PLACES15 · 15 % hors gamme' },
  { branchId: 'autre', date: MARDI, kind: 'facture', discountLabel: 'PLACES15 · 15 % hors gamme' },
  { branchId: 'br', date: MARDI, kind: 'devis', discountLabel: 'PLACES15 · 15 % hors gamme' },
  { branchId: 'br', date: MARDI, kind: 'facture', discountLabel: 'ROSE15 · 15 % hors gamme' },
  { branchId: 'br', date: MARDI, kind: 'facture', discountLabel: 'Remise famille' },
];
dit('deux tickets de passage ont pris la remise ce jour-la (ni autre jour, ni autre maison, ni devis, ni autre code)', 2, prisesAuComptoir(PLACES, PIECES, MARDI, 'br'));
dit('... il reste une place', 1, juge([], MARDI, { pieces: PIECES })?.restantes);

/* ── Plusieurs offres ── */
const PLUS_FAIBLE = { ...PLACES, id: 'of-b', code: 'AUTRE10', discountPct: 10, jourVideSeulement: false, title: 'Autre' };
const pleinesA = [prise('a', MARDI), prise('b', MARDI), prise('c', MARDI)];
dit('chaque offre a places se compte sur son propre compte', 'of-b', juge(pleinesA, MARDI, {}, [PLACES, PLUS_FAIBLE])?.offre.id ?? null);
dit('a plusieurs, la plus forte remise', 'of-places-limitees', juge([], MARDI, {}, [PLUS_FAIBLE, PLACES])?.offre.id ?? null);
const SANS_PLACES = { id: 'of-old', branchId: 'br', active: true, code: 'OLD', title: 'Ancienne', discountPct: 10, serviceIds: ['sv-shampoing'], joursDeLaVenue: ['Mer'] };
dit('une offre du jour sans places court comme avant, sans compte', { id: 'of-old', aPlaces: false },
  ((j) => (j ? { id: j.offre.id, aPlaces: j.aPlaces } : null))(lOffreDuJourAuTrone([SANS_PLACES], { branchId: 'br', dateIso: MERCREDI, serviceIds: ['sv-shampoing'], rdvs: [rdv('x', MERCREDI)] })));

/* ── L offre possible, et pourquoi elle ne se pose pas ── */
dit('l offre a places possible un mardi qui couvre un geste', 'of-places-limitees', offreAPlacesDuJour([PLACES], { branchId: 'br', dateIso: MARDI, serviceIds: ['sv-soin'] })?.id ?? null);
dit('... ni le samedi, ni sans geste couvert, ni dans une autre maison', [null, null, null], [
  offreAPlacesDuJour([PLACES], { branchId: 'br', dateIso: '2026-11-14', serviceIds: ['sv-soin'] }),
  offreAPlacesDuJour([PLACES], { branchId: 'br', dateIso: MARDI, serviceIds: ['sv-reprise'] }),
  offreAPlacesDuJour([PLACES], { branchId: 'autre', dateIso: MARDI, serviceIds: ['sv-soin'] }),
]);
const vide = { prises: 0, autres: 0 };
const pq = (plus: Record<string, unknown>, occ = vide, date = MARDI) => pourquoiSansPlace(PLACES, { dateIso: date, aujourdhui: AUJ, occupation: occ, ...plus });
dit('pourquoi : ses prix convenus', { texte: 'Places limitées ne s’applique pas : ses prix convenus s’appliquent (une seule remise).', jour: false }, pq({ prixConvenus: true, famille: true }));
dit('pourquoi : sa formule', 'Places limitées ne s’applique pas : elle a une formule à cette date (une seule remise).', pq({ abonnee: true })?.texte);
dit('pourquoi : la famille', 'Places limitées ne s’applique pas : la remise famille de son foyer s’applique (une seule remise).', pq({ famille: true, autreRemise: true })?.texte);
dit('pourquoi : une remise deja posee', 'Places limitées ne s’applique pas : une remise est déjà posée (une seule remise).', pq({ autreRemise: true })?.texte);
dit('pourquoi : un autre code, nomme', 'Places limitées ne s’applique pas : ce rendez-vous porte déjà le code ROSE15.', pq({ dejaUnCode: 'ROSE15' })?.texte);
dit('pourquoi : le jour deja pris, dit comme un motif du jour', { texte: 'Places limitées : le jour a déjà des rendez-vous, aucune place à −15 %.', jour: true }, pq({}, { prises: 0, autres: 1 }));
dit('pourquoi : plus de place', 'Places limitées : plus de place à −15 % ce jour-là.', pq({}, { prises: 3, autres: 0 })?.texte);
dit('pourquoi : trop loin', 'Places limitées : les places s’ouvrent 14 jours à l’avance.', pq({}, vide, '2026-11-20')?.texte);
dit('pourquoi : rien a dire un jour ouvert, ni un jour passe', [null, null], [pq({}), pq({}, vide, '2026-11-03')]);

/* ── La place ne passe pas pour une remise de la main ── */
const RDV_PLACE = { codeOffre: 'PLACES15', offreId: 'of-places-limitees', serviceIds: ['sv-reprise', 'sv-shampoing', 'sv-soin'], remisesLignes: [null, { pct: 15 }, { pct: 15 }] };
dit('rouvert : les lignes de la place s otent', [null, null, null], remisesDeLaMainDuRdv(RDV_PLACE, [PLACES]));
dit('... meme quand le pourcentage regle a change (15 % devenu 20 %)', [null, null, null], remisesDeLaMainDuRdv(RDV_PLACE, [{ ...PLACES, discountPct: 20 }]));
dit('... une remise en francs de la main reste', [{ xof: 2000 }, null, null], remisesDeLaMainDuRdv({ ...RDV_PLACE, remisesLignes: [{ xof: 2000 }, { pct: 15 }, { pct: 15 }] }, [{ ...PLACES, discountPct: 20 }]));
dit('... sans la marque de la place, un −15 % est une remise de la main', [null, { pct: 15 }, null],
  remisesDeLaMainDuRdv({ serviceIds: ['sv-reprise', 'sv-shampoing', 'sv-soin'], remisesLignes: [null, { pct: 15 }, null] }, [PLACES]));

/* ── La remise famille d une tete ── */
dit('la famille d une tete aux prix convenus, abonnee, ou au geste offert : 0 ; sinon la sienne', [0, 0, 0, 15],
  [famPctDeLaTete(15, { prixConvenus: true }), famPctDeLaTete(15, { abonnee: true }), famPctDeLaTete(15, { gesteAuPanier: true }), famPctDeLaTete(15, {})]);
const LIGNES = [{ net: 15000, sansRemise: true }, { net: 10000 }, { net: 20000, forfait: true }];
dit('la famille ne porte ni sur le Rituel Sowa ni sur un forfait', 10000, baseDeLaRemiseFamille(LIGNES));
dit('... 15 % de 10 000 F : 1 500 F', 1500, remiseFamilleEnFrancs(LIGNES, 15));
dit('... un rituel Sowa seul : aucune remise famille', 0, remiseFamilleEnFrancs([{ net: 15000, sansRemise: true }], 15));
dit('la famille suit la tete a la visite suivante, sauf prix convenus ou abonnee', [true, false, false],
  [laFamilleSuitElle({}), laFamilleSuitElle({ prixConvenus: true }), laFamilleSuitElle({ abonnee: true })]);

/* ── Le reglage ── */
const MERCREDI15 = { id: 'of-mercredi15', branchId: 'br', active: false, code: 'MERCREDI15', title: 'Le mercredi de la Maison', discountPct: 15,
  serviceIds: ['sv-shampoing', 'sv-soin', 'sv-lavage'], joursDeLaVenue: ['Mer'], audience: 'Tous', days: ['Mer'], heureDebut: '09h', heureFin: '20h', tag: 'x', deal: '−15 %', sub: 'x' };
dit('sans offre : les defauts, eteinte, a poser, les gestes du mercredi', { existe: false, active: false, jours: ['Mar', 'Mer', 'Jeu', 'Ven'], places: 3, horizon: 14, pct: 15, gestes: 3 },
  reglageDesPlaces([MERCREDI15]));
const creees = offresApresLeReglage([MERCREDI15], { active: true }, { branchId: 'br-40r6u6frno' });
const neuve = creees.find((o) => o.id === 'of-places-limitees') as Record<string, unknown> | undefined;
dit('le premier reglage la cree : les defauts et les gestes du mercredi', {
  id: 'of-places-limitees', code: 'PLACES15', title: 'Places limitées', active: true, joursDeLaVenue: ['Mar', 'Mer', 'Jeu', 'Ven'], placesParJour: 3,
  jourVideSeulement: true, horizonJours: 14, discountPct: 15, deal: '−15 %', branchId: 'br-40r6u6frno', serviceIds: ['sv-shampoing', 'sv-soin', 'sv-lavage'],
}, neuve && {
  id: neuve.id, code: neuve.code, title: neuve.title, active: neuve.active, joursDeLaVenue: neuve.joursDeLaVenue, placesParJour: neuve.placesParJour,
  jourVideSeulement: neuve.jourVideSeulement, horizonJours: neuve.horizonJours, discountPct: neuve.discountPct, deal: neuve.deal, branchId: neuve.branchId, serviceIds: neuve.serviceIds,
});
dit('... l ancienne offre du mercredi reste eteinte et intacte', MERCREDI15, creees.find((o) => o.id === 'of-mercredi15'));
dit('regler un nombre ne l allume pas dans le dos de la direction', false, offresApresLeReglage([MERCREDI15], { places: 5 }, { branchId: 'br' }).find((o) => o.id === 'of-places-limitees')?.active);
const posee = { ...PLACES, title: 'Places limitées', sub: 'garde', tag: 'garde' };
const regle = (c: Parameters<typeof offresApresLeReglage>[1]) => offresApresLeReglage([posee, MERCREDI15], c, { branchId: 'br' }).find((o) => o.id === 'of-places-limitees') as Record<string, unknown>;
dit('les places bornees de 1 a 10', [10, 1], [regle({ places: 12 }).placesParJour, regle({ places: 0 }).placesParJour]);
dit('l horizon borne de 1 a 60', [60, 1], [regle({ horizon: 75 }).horizonJours, regle({ horizon: 0 }).horizonJours]);
dit('le pourcentage borne de 5 a 50, et l affichage le suit', [50, '−50 %', 5], [regle({ pct: 60 }).discountPct, regle({ pct: 60 }).deal, regle({ pct: 3 }).discountPct]);
dit('les jours dans l ordre de la semaine, du mardi au samedi seulement', ['Mar', 'Sam'], regle({ jours: ['Sam', 'Lun', 'Mar', 'Dim'] }).joursDeLaVenue);
dit('le code ne change pas avec le pourcentage (il marque les places prises)', 'PLACES15', regle({ pct: 20 }).code);
dit('le reste de l offre ne bouge pas', ['garde', 'garde', ['sv-shampoing', 'sv-soin']], [regle({ pct: 20 }).sub, regle({ pct: 20 }).tag, regle({ pct: 20 }).serviceIds]);
dit('toujours seulement un jour vide', true, regle({ active: false }).jourVideSeulement);
dit('le reglage relu : bornes et ordre', { existe: true, active: true, jours: ['Mar', 'Mer', 'Jeu', 'Ven'], places: 3, horizon: 14, pct: 15, gestes: 2 }, reglageDesPlaces([posee]));

/* ── La tuile des Parametres ── */
dit('les jours dits : « mar. au ven. », « mar. et mer. », « mar., jeu. et sam. »', ['mar. au ven.', 'mar. et mer.', 'mar., jeu. et sam.', 'aucun jour'],
  [joursDesPlacesDits(['Mar', 'Mer', 'Jeu', 'Ven']), joursDesPlacesDits(['Mar', 'Mer']), joursDesPlacesDits(['Sam', 'Mar', 'Jeu']), joursDesPlacesDits([])]);
dit('la tuile dit le reglage et son etat', {
  dit: 'mar. au ven. · 3 places par jour · 14 jours à l’avance · −15 %', etat: { ton: 'ok', dit: 'allumée' },
}, resumePlaces({ existe: true, active: true, jours: ['Mar', 'Mer', 'Jeu', 'Ven'], places: 3, horizon: 14, pct: 15 }));
dit('... eteinte, a poser, sans jour', ['éteinte', 'à poser', 'aucun jour'], [
  resumePlaces({ existe: true, active: false, jours: ['Mar'], places: 1, horizon: 14, pct: 15 }).etat.dit,
  resumePlaces({ existe: false, active: false, jours: ['Mar'], places: 3, horizon: 14, pct: 15 }).etat.dit,
  resumePlaces({ existe: true, active: true, jours: [], places: 3, horizon: 14, pct: 15 }).etat.dit,
]);
dit('« une place » au singulier', 'mar. · 1 place par jour · 7 jours à l’avance · −20 %', resumePlaces({ existe: true, active: true, jours: ['Mar'], places: 1, horizon: 7, pct: 20 }).dit);
dit('la recherche trouve la tuile, et « acompte » reste a la reservation', [true, ['reservation']], [tuilesTrouvees('places limitées').includes('places'), tuilesTrouvees('acompte')]);

/* ── Les mots ── */
const phrases = [
  ditLaPlaceDuRdv(juge([], MARDI)!), ditLaPlaceDuRdv(juge(rempli, MARDI, { relu: RELU })!),
  ...[{ prixConvenus: true }, { abonnee: true }, { famille: true }, { autreRemise: true }, { dejaUnCode: true }, { couvert: true }, { forfait: true }].map((x) => pq(x)?.texte ?? ''),
  pq({}, { prises: 0, autres: 1 })?.texte ?? '', pq({}, { prises: 3, autres: 0 })?.texte ?? '', pq({}, vide, '2026-11-20')?.texte ?? '',
  resumePlaces({ existe: true, active: true, jours: ['Mar'], places: 3, horizon: 14, pct: 15 }).dit,
];
dit('jamais le tiret long, jamais « salon », jamais « maitre » dans ces phrases', [], phrases.filter((p) => /—|salon|ma[iî]tre/i.test(p)));

/* ═══ 1b. LE RITUEL SOWA NE PREND AUCUNE REMISE, MEME POSEE A LA MAIN ═══
   Yeman, au selecteur, 4 novembre 2026 : la remise sur tout (pour cent ou
   francs) de la fenetre et du ticket ne porte jamais sur une ligne
   `sansRemise`, et la remise de ligne ne s'ouvre pas sur elle. Le Sowa :
   15 000 F ; un shampoing : 10 000 F ; un produit : 10 000 F. */
const SOWA = 15_000;
const SH = 10_000;
const entree = (plus: Partial<EntreeDuTicket>): EntreeDuTicket => ({
  sousTotalXof: SOWA + SH, prestationsXof: SOWA + SH, remisePct: 0, remiseXof: 0, remiseDuRendezVousXof: 0,
  dejaRecuXof: 0, promoBrutXof: 0, nomDuCode: '', sansRemiseXof: SOWA, ...plus,
});
/** La piece telle que la Caisse l'ecrit (`globalDiscountPct: ticket.remisePct`, les francs ensuite). */
const pieceDu = (t: ReturnType<typeof leTicket>, lignes: number[]): number => invoiceTotal({
  lines: lignes.map((x, i) => ({ id: `l${i}`, label: 'x', qty: 1, unitXof: x, discountPct: 0 })),
  globalDiscountPct: t.remisePct, globalDiscountXof: (t.remiseXof + t.remiseDuRendezVousXof + t.promoXof) || undefined,
} as unknown as Invoice);
{
  const dix = leTicket(entree({ remisePct: 10 }));
  dit('ticket : Sowa et shampoing, -10 % sur tout : le Sowa garde ses 15 000 F, 24 000 F', [24_000, 24_000, 15_000], [dix.netXof, dix.partNetteXof, dix.sansRemiseXof]);
  dit('... la piece ecrit le pourcentage en francs (1 000 F), et dit le meme net', [0, 1_000, 24_000], [dix.remisePct, dix.remiseXof, pieceDu(dix, [SOWA, SH])]);
  const francs = leTicket(entree({ remiseXof: 20_000 }));
  dit('ticket : 20 000 F de remise a la main : elle s arrete au shampoing, le Sowa paye entier', [15_000, 10_000, 15_000], [francs.netXof, francs.remiseXof, pieceDu(francs, [SOWA, SH])]);
  const seul = leTicket(entree({ sousTotalXof: SOWA, prestationsXof: SOWA, remisePct: 50, remiseXof: 3_000 }));
  dit('ticket : le Sowa seul, -50 % et 3 000 F : 15 000 F, aucune remise ecrite', [15_000, 0, 0, 15_000], [seul.netXof, seul.remisePct, seul.remiseXof, pieceDu(seul, [SOWA])]);
  const produit = leTicket(entree({ sousTotalXof: SOWA + 10_000, prestationsXof: SOWA, remisePct: 10 }));
  dit('ticket : le Sowa et un produit, -10 % : sur le produit seul ; la part des prestations reste 15 000 F', [24_000, 15_000, 24_000],
    [produit.netXof, produit.partNetteXof, pieceDu(produit, [SOWA, 10_000])]);
  const sans = leTicket(entree({ sousTotalXof: 80_000, prestationsXof: 80_000, sansRemiseXof: 0, remisePct: 10, remiseXof: 2_000 }));
  dit('ticket sans Sowa : le calcul d hier (80 000 F, -10 %, 2 000 F : 70 000 F, le pourcentage ecrit tel quel)', [70_000, 10, 2_000], [sans.netXof, sans.remisePct, sans.remiseXof]);
  const code = leTicket(entree({ promoBrutXof: 1_500, nomDuCode: 'ROSE15' }));
  dit('ticket : un code sur le shampoing seul (sa base exclut le Sowa) : le Sowa entier', [true, 24_000], [code.cumul.codeConsomme, code.netXof]);
  dit('la ligne du Sowa ne garde aucune remise de ligne ; les autres gardent la leur', [0, 0, 15, 100], [
    remiseDeLaLigneTenue(100, true), remiseDeLaLigneTenue(15, true), remiseDeLaLigneTenue(15, false), remiseDeLaLigneTenue(100, false)]);
}
{
  const r = (plus: Partial<Parameters<typeof laRemiseSurTout>[0]>) => laRemiseSurTout({ brutXof: SOWA + SH, sansRemiseXof: SOWA, pct: 0, xof: 0, ...plus });
  dit('fenetre : -10 % sur tout : 1 000 F sur le shampoing, 24 000 F, ecrit en francs', { pctXof: 1_000, xof: 0, netXof: 24_000, enFrancs: true }, r({ pct: 10 }));
  dit('fenetre : 20 000 F a la main : 10 000 F retenus, le Sowa paye entier', { pctXof: 0, xof: 10_000, netXof: 15_000, enFrancs: false }, r({ xof: 20_000 }));
  dit('fenetre : -10 % puis 20 000 F : 1 000 F et 9 000 F, jamais sous le Sowa', { pctXof: 1_000, xof: 9_000, netXof: 15_000, enFrancs: true }, r({ pct: 10, xof: 20_000 }));
  dit('fenetre : la famille sur sa base (hors forfaits et Sowa)', { pctXof: 1_500, xof: 0, netXof: 23_500, enFrancs: true }, r({ pct: 15, basePctXof: SH }));
  dit('fenetre : le Sowa seul ne prend rien', { pctXof: 0, xof: 0, netXof: SOWA, enFrancs: false }, laRemiseSurTout({ brutXof: SOWA, sansRemiseXof: SOWA, pct: 50, xof: 5_000 }));
  dit('fenetre sans Sowa : le calcul d hier, le pourcentage ecrit tel quel', { pctXof: 8_000, xof: 2_000, netXof: 70_000, enFrancs: false },
    laRemiseSurTout({ brutXof: 80_000, sansRemiseXof: 0, pct: 10, xof: 2_000 }));
  dit('fenetre rouverte : la remise de ligne posee avant sur le Sowa ne revient pas, les autres restent', [null, { xof: 500 }, null],
    remisesHorsDuGesteSansRemise([{ pct: 10 }, { xof: 500 }, null], ['sv-sowa', 'sv-x', 'sv-y'], (id) => id === 'sv-sowa'));
  dit('la phrase de l ecran', ['Le Rituel Sówà™ ne prend aucune remise.', 'Le Rituel Sówà™ ne prend aucune remise.', 'Soin rare ne prend aucune remise.'],
    [ditLeGesteSansRemise('Rituel Sówà™'), ditLeGesteSansRemise(undefined), ditLeGesteSansRemise('Soin rare')]);
}

/* ═══ 2. LES PORTES DU TRONE ═══════════════════════════════════════════ */
const S = lis('src/apps/trone/routes/clients/_shared.tsx');
const C = lis('src/apps/trone/routes/vente/Caisse.tsx');
const B = lis('src/apps/trone/routes/vente/SonProchainRituel.tsx');
const F = lis('src/apps/trone/routes/clients/RdvFoyer.tsx');
const A = lis('src/apps/trone/routes/clients/actions.tsx');
const P = lis('src/apps/trone/routes/systeme/Parametres.tsx');
const K = lis('src/apps/trone/routes/systeme/CartePlacesLimitees.tsx');
const U = lis('src/apps/trone/routes/clients/Customers.tsx');
const contient = (nom: string, src: string, ...bouts: string[]) => {
  const manque = bouts.filter((b) => !src.includes(b));
  dit(nom, [], manque.map((m) => m.slice(0, 80)));
};

/* La fenetre du rendez-vous. */
contient('la fenetre juge l offre du jour par le Trone, sur le carnet, le rendez-vous relu', S,
  'const jugeDuJour = rdvFige ? null : lOffreDuJourAuTrone(offresDeLaMaison, { ...venueIci, ecartee: mercrediEcarte });',
  '    rdvs: tousLesRdv,\n    relu: appt ?? null,', 'aujourdhui: todayISO(),', 'pieces: invoicesStore.get(),');
contient('la fenetre : une seule remise (prix convenus, famille, geste, la main sur tout ou sur une ligne, abonnee)', S,
  'prixConvenus: prixConvenusDeLaTete,\n    autreRemise: autreRemiseIci,',
  'const autreRemiseIci = famPctCompte > 0 || gesteAuPanier || discountPctSaisi > 0 || discountXofSaisi > 0\n    || remisesALaMain.some((r) => (r?.pct ?? 0) > 0 || (r?.xof ?? 0) > 0);',
  'couvertParAbonnement: couvertIci || abonneeALaDate,', 'const prixConvenusDeLaTete = !!ficheCliente && aUnPrixConvenu(ficheCliente);');
contient('la fenetre : la famille de la tete passe par la regle de la tete, chaque compagne la sienne', S,
  'const famPctCompte = famPctDeLaTete(famPctDuFoyer, { prixConvenus: prixConvenusDeLaTete, abonnee: abonneeALaDate });',
  'chiffreDeLaCompagne({ fiche, serviceIds: ids, date, famPct: famPctIci, ctx: ctxDuTarif })',
  'const famPctIci = famPctDeLaTete(famPctDuFoyer, {');
contient('la fenetre : ni famille ni place sur le Rituel Sowa', S,
  ".filter((sv) => regimeTarifaire(sv, cats).k === 'forfait' || gesteSansRemise(sv))",
  'prixFerme(sv, pricing) && !gesteSansRemise(sv) };',
  "regimeTarifaire(l.sv, o.ctx.cats).k === 'forfait' || gesteSansRemise(l.sv)");
contient('la fenetre : le bandeau et le panier disent le decompte', S,
  "const placeDite = poseDuMercredi && jugeDuJour ? ditLaPlaceDuRdv(jugeDuJour) : '';",
  '<b>{placeDite}</b>',
  '{!sansPrix && !effCovered && !estSuite && placeDite && retireParLaPlace > 0 && (',
  'const sans = pourquoiSansPlace(aPlaces, {');
contient('la fenetre : les lignes de la place ne passent pas pour la main', S, 'remisesDeLaMainDuRdv(appt, offresDeLaMaison)');
contient('la fenetre : la place se pose avec ses remises et sa marque', S,
  'const poseDuMercredi = poseCandidate && duMercredi && duMercredi.mercrediXof > 0 ? poseCandidate : null;',
  '? { codeOffre: poseDuMercredi.codeOffre, offreId: poseDuMercredi.offreId }');

/* La Caisse. */
contient('la Caisse juge l offre du jour sur le carnet et les tickets de passage', C,
  'const jugeDuTicket = !codeSaisi.trim() ? lOffreDuJourAuTrone(offresDeLaBranche, {',
  '    rdvs: carnet,\n    relu: rituelDuTicket ?? null,\n    pieces: invoices,', 'aujourdhui: todayIso(),',
  'const venueDuTicket = rituelDuTicket?.date ?? dateVente;');
contient('la Caisse : une seule remise', C,
  'prixConvenus: prixConvenusDuTicket,\n    autreRemise: autreRemiseDuTicket,',
  'const autreRemiseDuTicket = familleDuTicketPct > 0 || globalDisc > 0 || globalDiscXof > 0 || remiseDuRituelXof > 0',
  '|| (rituelDuTicket?.seriesIndex ?? 1) > 1 || abonneeDuTicket,',
  'famPctDeLaTete(remiseFamillePct(familleDuTicket, clients, todayIso()), { prixConvenus: prixConvenusDuTicket, abonnee: abonneeDuTicket })');
contient('la Caisse : le code des places ne se tape pas a la main', C,
  'const offreCodee = !codeNominatif && !codeAPlacesTape ? offreDuCode(offresDeLaBranche, codeTape, new Date(), venueDuTicket) : null;',
  ": codeAPlacesTape ? 'Ce code ne se tape pas : la remise des places limitées se pose d’elle-même, quand le jour a encore une place.'");
contient('la Caisse dit le decompte', C, '`${ditLaPlaceDuRdv(jugeDuTicket)} · −${offreDuMercredi.discountPct ?? 0} %, posée d’elle-même sur ce ticket.`');
contient('la Caisse : le Rituel Sowa sans remise de ligne, ni code, ni soin offert, ni remise sur tout', C,
  "const ligneSansRemise = (key: string): boolean => key.startsWith('s:') && gesteSansRemise(svcById.get(key.slice(2)));",
  'setCart((c) => (c[key] && !ligneSansRemise(key) ?',
  'const v = { ...posee, disc: remiseDeLaLigneTenue(posee.disc, sansRemise) };',
  "const discEff = remiseDeLaLigneDuTicket(it.kind, v.disc, remiseGamme);",
  "    .filter((l) => l.kind === 'service')\n    .filter((l) => !l.sansRemise)\n    .map((l) => ({ serviceId: l.key.slice(2), montantXof: Math.round(l.netXof) }));",
  'sansRemiseXof: lines.filter((l) => l.sansRemise).reduce((n, l) => n + l.netXof, 0),',
  ": lines.find((l) => l.kind === 'service' && !l.sansRemise)?.key);",
  'globalDiscountPct: ticket.remisePct,');
contient('la Caisse le dit d une phrase, sur la ligne et sous la remise sur tout', C,
  '{l.sansRemise ? (', '{ditLeGesteSansRemise(l.n)}', '{ticket.sansRemiseXof > 0 && (',
  '{ditLeGesteSansRemise(lines.find((l) => l.sansRemise)?.n)} La remise porte sur le reste du ticket.');
contient('la fenetre : la remise sur tout et la remise de ligne ne portent jamais sur le Rituel Sowa', S,
  'const sansRemiseXof = chosen.filter((sv) => gesteSansRemise(sv)).reduce((s, sv) => s + prixDe(sv), 0);',
  'brutXof: effGross, sansRemiseXof, pct: discountPct, xof: discountXof,',
  '...(remiseEstFamille ? { basePctXof: baseRemisePct } : {}),',
  '      : surTout.netXof;',
  'const discountPctEcrit = effCovered || forfaitPose || remiseEstFamille || surTout.enFrancs ? undefined : (discountPct || undefined);',
  ': ((surTout.enFrancs ? surTout.pctXof + surTout.xof : surTout.xof) || undefined);',
  'remisesHorsDuGesteSansRemise(remisesDeLaMainDuRdv(appt, offresDeLaMaison), appt.serviceIds, (id) => gesteSansRemise(byId.get(id)))',
  '                if (gesteSansRemise(sv)) {\n                  return (',
  '{ditLeGesteSansRemise(sv.name)}',
  '{sansRemiseXof > 0 && (',
  '{ditLeGesteSansRemise(chosen.find((sv) => gesteSansRemise(sv))?.name)} La remise porte sur le reste du rendez-vous.');
dit('la fenetre ecrit la remise par un seul chemin (series et rendez-vous)', [2, 2, 0], [
  S.split('discountPct: discountPctEcrit,').length - 1, S.split('discountXof: discountXofEcrit,').length - 1,
  S.split('remiseEstFamille ? (((discountXof || 0) + remiseFamilleXof) || undefined)').length - 1]);

/* Son prochain rituel. */
contient('son prochain rituel : le compte, une seule remise, relu au toucher', B,
  'const juge = lOffreDuJourAuTrone(offres, {', '      prixConvenus,\n      autreRemise: famPctA(iso) > 0 || tarif.gesteAuPanier,\n      rdvs: carnet,',
  'leMercrediDeLaPlace(p.iso, appointmentsStore.get())',
  'famPctDeLaTete(famPctDuFoyer, { prixConvenus, abonnee: !!contratPourLaDate(subs, clientId, iso, plans) })',
  'const pct = tarif.gesteAuPanier || tarif.baseFamilleXof <= 0 ? 0 : famPctA(iso);',
  /* Une seule remise sur le rendez-vous de la carte : la place, ou la famille. */
  'remiseFamilleXof: mercredi ? 0 : familleXof(p.iso),',
  '{`${mercredi.phrase} · −${mercredi.offre.discountPct ?? 0} %`}', '&& !gesteSansRemise(sv) };');

/* Le rendez-vous du foyer. */
contient('le foyer : la famille tete par tete, jamais sur le Rituel Sowa', F,
  'const famPct = famPctDeLaTete(famPctDuFoyer, {\n      prixConvenus: aUnPrixConvenu(l.tete),\n      abonnee: !!contratPourLaDate(subs, l.tete.id, date, plans),',
  "(regimeTarifaire(sv).k === 'forfait' || gesteSansRemise(sv))");

/* La reprise et la visite reprogrammee (4 novembre 2026) : ni l'une ni l'autre
   ne se posent plus d'office ; la carte « Son prochain rituel » construit le
   rendez-vous neuf, au tarif de sa tete, et ne recopie rien de la visite. Seule
   La Retouche comprise part de la visite : sans sa place, sans sa famille. */
dit('la suite imposee : la place ne suit pas, la famille non plus ; plus de visite reprogrammee', [1, 0, 0, 0, true], [
  A.split('...sansLaPlaceDuJour(appt),').length - 1,
  A.split('...laFamilleQuiSuitLaTete(appt, date),').length - 1,
  A.split('...laFamilleQuiSuitLaTete(appt, nextDate),').length - 1,
  A.split('...remiseFamilleQuiSuit(appt),').length - 1,
  A.includes('    remiseFamille: undefined, remiseFamilleXof: undefined,\n'),
]);

/* Systeme › Parametres. */
contient('la tuile des Parametres ouvre la carte et lit l offre', P,
  "{ouverte === 'places' && <CartePlacesLimitees />}", 'places: resumePlaces(reglageDesPlaces(offresDeLaMaison)),');
contient('la carte : direction seule, ecrit l offre du magasin, dit qui la lit', K,
  "    if (!estDirection) { toast('Ce réglage appartient à la direction.'); return; }\n    setOffres((prev) => offresApresLeReglage(prev, changes, { branchId: branch?.id ?? '' }));",
  'Le site, Ma Couronne, la fenêtre du rendez-vous et la Caisse lisent ce réglage', 'JOURS_REGLABLES.map((j) => (',
  'min={BORNES_DES_PLACES.places.min} max={BORNES_DES_PLACES.places.max}',
  'min={BORNES_DES_PLACES.horizon.min} max={BORNES_DES_PLACES.horizon.max}',
  'min={BORNES_DES_PLACES.pct.min} max={BORNES_DES_PLACES.pct.max}', 'disabled={!estDirection}');
const corps = K.slice(K.indexOf('export function CartePlacesLimitees'));
const premierRetour = corps.search(/\n\s+(if \([^\n]*\) )?return\b/);
const dernierCrochet = Math.max(...[...corps.matchAll(/\buse[A-Z]\w*\(/g)].map((m) => m.index ?? -1));
vrai('la carte : aucun crochet sous un return', premierRetour > dernierCrochet, { premierRetour, dernierCrochet });
dit('la carte : jamais le tiret long, jamais « salon »', [], (K.match(/—|\bsalon\b/g) ?? []));

/* La fiche de la cliente. */
contient('la fiche dit « aucune pour elle » aux prix convenus ou abonnee', U,
  '(aUnPrixConvenu(client) || !!contratPourLaDate(subs, client.id, todayISO(), plans))');

/* « La plus forte des deux » ne vit plus au Trone. */
dit('« la plus forte des deux » ne se lit plus au Trone', [], [S, C, B].flatMap((src, i) => (/laPlusForteDesDeux|ditLaPlusForte/.test(src) ? [['fenetre', 'Caisse', 'prochain rituel'][i]] : [])));

console.log(ko === 0 ? '\nLes places limitees tiennent au Trone.' : `\n${ko} controle(s) en echec.`);
