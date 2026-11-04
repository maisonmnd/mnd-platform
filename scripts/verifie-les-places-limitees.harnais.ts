/* LES PLACES LIMITEES, EPROUVEES — 4 novembre 2026.
   `node scripts/verifie-les-places-limitees.mjs` (et `--prouve`).

   La decision (Yeman, maquette « Places limitees » AhFRNqiggFoaiR725iKSQe,
   « construis ») : −15 % sur les shampoings, lavages et soins ; du mardi au
   vendredi, jamais le samedi ; seulement un jour vide ; trois places par
   jour, decomptees (« Remise : il reste 3 places », « il reste 2 places »,
   « il reste une place »), puis plus rien ; une reservation au plein tarif
   ce jour-la ferme les places restantes ; une place prise est gardee ; les
   jours des 14 jours a venir ; jamais pour une tete aux prix convenus,
   abonnee, ni qui a deja une remise. Les jours, les places et l'horizon sont
   des reglages : changes, la regle suit.

   TOUS LES ATTENDUS SONT ECRITS EN DUR, tires de ces phrases. */
import {
  ditLesPlaces, estAPlaces, gesteSansRemise, occupationDuJour, offreDuJourDeLaVenue, placesRestantes, remiseFamilleDeLaTete,
  type OccupationDuJour,
} from '../src/shared/offres-pur';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 200)}`));
};

const AUJ = '2026-11-05'; // un jeudi
const PLACES = {
  id: 'of-places', active: true, code: 'PLACES15', discountPct: 15,
  serviceIds: ['sv-shampoing', 'sv-soin'], joursDeLaVenue: ['Mar', 'Mer', 'Jeu', 'Ven'],
  placesParJour: 3, jourVideSeulement: true, horizonJours: 14, du: '2026-11-05', au: '2026-12-31',
};
const vide: OccupationDuJour = { prises: 0, autres: 0 };
const occ = (prises: number, autres: number): OccupationDuJour => ({ prises, autres });
const juge = (dateIso: string, o: OccupationDuJour | undefined, plus: Record<string, unknown> = {}) =>
  offreDuJourDeLaVenue([PLACES], { dateIso, serviceIds: ['sv-reprise', 'sv-shampoing'], occupation: o, aujourdhui: AUJ, ...plus })?.id ?? null;

/* ── 1. Le decompte ── */
dit('un mardi vide : trois places', 3, placesRestantes(PLACES, '2026-11-10', vide, AUJ));
dit('... il se dit « Remise : il reste 3 places »', 'Remise : il reste 3 places', ditLesPlaces(3));
dit('une place prise : deux', 2, placesRestantes(PLACES, '2026-11-10', occ(1, 0), AUJ));
dit('... « Remise : il reste 2 places »', 'Remise : il reste 2 places', ditLesPlaces(2));
dit('deux prises : une', 1, placesRestantes(PLACES, '2026-11-10', occ(2, 0), AUJ));
dit('... « Remise : il reste une place »', 'Remise : il reste une place', ditLesPlaces(1));
dit('trois prises : plus rien', 0, placesRestantes(PLACES, '2026-11-10', occ(3, 0), AUJ));
dit('... et la remise ne se pose plus', null, juge('2026-11-10', occ(3, 0)));
dit('une place libre : la remise se pose', 'of-places', juge('2026-11-10', occ(2, 0)));

/* ── 2. Les jours ── */
dit('le mercredi, le jeudi, le vendredi aussi', [3, 3, 3], ['2026-11-11', '2026-11-12', '2026-11-13'].map((d) => placesRestantes(PLACES, d, vide, AUJ)));
dit('jamais le samedi', null, placesRestantes(PLACES, '2026-11-14', vide, AUJ));
dit('... ni la remise le samedi', null, juge('2026-11-14', vide));
dit('le samedi coche au reglage : il s ouvre', 3, placesRestantes({ ...PLACES, joursDeLaVenue: ['Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] }, '2026-11-14', vide, AUJ));
dit('cinq places au reglage : cinq', 5, placesRestantes({ ...PLACES, placesParJour: 5 }, '2026-11-10', vide, AUJ));
dit('un jour passe (mardi 3 novembre 2026, offre sans saison) : rien', null, placesRestantes({ ...PLACES, du: undefined }, '2026-11-03', vide, AUJ));

/* ── 3. Seulement un jour vide ── */
dit('un jour qui a deja un rendez-vous : aucune place', 0, placesRestantes(PLACES, '2026-11-10', occ(0, 1), AUJ));
dit('... et aucune remise', null, juge('2026-11-10', occ(0, 1)));
dit('une reservation au plein tarif apres une place : les restantes se ferment', 0, placesRestantes(PLACES, '2026-11-10', occ(1, 1), AUJ));
dit('une place prise est gardee, meme jour rempli', 'of-places', juge('2026-11-10', occ(2, 1), { offreTenue: 'of-places' }));
dit('... et meme les trois places prises par d autres', 'of-places', juge('2026-11-10', occ(3, 0), { offreTenue: 'of-places' }));

/* ── 4. Les 14 jours a venir ── */
dit('le quatorzieme jour : ouvert', 3, placesRestantes(PLACES, '2026-11-19', vide, AUJ));
dit('le quinzieme : pas encore', null, placesRestantes(PLACES, '2026-11-20', vide, AUJ));
dit('l horizon au reglage (21 jours) : le quinzieme s ouvre', 3, placesRestantes({ ...PLACES, horizonJours: 21 }, '2026-11-20', vide, AUJ));

/* ── 5. Une seule remise ── */
dit('jamais un jour qu on n a pas compte', null, juge('2026-11-10', undefined));
dit('jamais pour une tete aux prix convenus', null, juge('2026-11-10', vide, { prixConvenus: true }));
dit('jamais par-dessus une autre remise (famille, la main)', null, juge('2026-11-10', vide, { autreRemise: true }));
dit('jamais pour une abonnee (rituel couvert)', null, juge('2026-11-10', vide, { couvertParAbonnement: true }));
dit('jamais par-dessus un autre code', null, juge('2026-11-10', vide, { dejaUnCode: true }));
dit('jamais sur un rituel sans geste couvert', null,
  offreDuJourDeLaVenue([PLACES], { dateIso: '2026-11-10', serviceIds: ['sv-reprise'], occupation: vide, aujourdhui: AUJ })?.id ?? null);
dit('eteinte : rien', null, placesRestantes({ ...PLACES, active: false }, '2026-11-10', vide, AUJ));

/* ── 5 bis. Les places lues de la base (le site, Ma Couronne) ── */
dit('le site lit deux places : la remise se pose', 'of-places', juge('2026-11-10', undefined, { placesConnues: 2 }));
dit('le site lit zero place : rien', null, juge('2026-11-10', undefined, { placesConnues: 0 }));
dit('le site ne lit rien pour ce jour : rien', null, juge('2026-11-10', undefined, { placesConnues: null }));
dit('meme lues, jamais le samedi', null, juge('2026-11-14', undefined, { placesConnues: 3 }));
dit('meme lues, jamais pour les prix convenus', null, juge('2026-11-10', undefined, { placesConnues: 3, prixConvenus: true }));

/* ── 5 ter. Une seule remise, pour la famille aussi ; le Sowa sans remise ── */
dit('la remise famille d une tete aux prix convenus : 0', 0, remiseFamilleDeLaTete(15, { prixConvenus: true }));
dit('... d une abonnee : 0', 0, remiseFamilleDeLaTete(10, { abonnee: true }));
dit('... d une autre tete : la sienne', 15, remiseFamilleDeLaTete(15, {}));
dit('le Rituel Sowa marque sansRemise ne prend rien', [true, false], [gesteSansRemise({ sansRemise: true }), gesteSansRemise({})]);

/* ── 6. Le compte d un jour ── */
const RDVS = [
  { id: 'a', date: '2026-11-10', status: 'confirmé', branchId: 'br', offreId: 'of-places' },
  { id: 'b', date: '2026-11-10', status: 'confirmé', branchId: 'br', codeOffre: 'places15' },
  { id: 'c', date: '2026-11-10', status: 'annulé', branchId: 'br', offreId: 'of-places' },
  { id: 'd', date: '2026-11-10', status: 'confirmé', branchId: 'autre' },
  { id: 'e', date: '2026-11-11', status: 'confirmé', branchId: 'br' },
  { id: 'f', date: '2026-11-10', status: 'en attente', branchId: 'br' },
];
dit('le compte : deux places prises (par l offre ou son code), une autre, l annule et l autre maison ecartes',
  { prises: 2, autres: 1 }, occupationDuJour(PLACES, RDVS, '2026-11-10', { branchId: 'br' }));
dit('le rendez-vous relu ne se compte pas lui-meme', { prises: 1, autres: 1 }, occupationDuJour(PLACES, RDVS, '2026-11-10', { branchId: 'br', saufId: 'a' }));

/* ── 7. Les offres d hier ne bougent pas ── */
const MERCREDI = { id: 'of-m', active: true, code: 'OLD', discountPct: 10, serviceIds: ['sv-shampoing'], joursDeLaVenue: ['Mer'] };
dit('une offre sans places court comme avant, sans compte', 'of-m',
  offreDuJourDeLaVenue([MERCREDI], { dateIso: '2026-11-11', serviceIds: ['sv-shampoing'] })?.id ?? null);
dit('une offre sans places n est pas une offre a places', [false, true], [estAPlaces(MERCREDI), estAPlaces(PLACES)]);

console.log(ko === 0 ? '\nLes places limitees tiennent.' : `\n${ko} controle(s) en echec.`);
