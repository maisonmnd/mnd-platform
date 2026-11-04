/* LES PLACES LIMITEES A MA COURONNE, EPROUVEES — 4 novembre 2026.
   `node scripts/verifie-les-places-a-la-couronne.mjs` (et `--prouve`).

   La decision (Yeman, maquette « Places limitees » AhFRNqiggFoaiR725iKSQe,
   « construis ») : −15 % sur les shampoings, lavages et soins ; du mardi au
   vendredi, jamais le samedi ; seulement un jour vide ; trois places par jour,
   decomptees (« Remise : il reste 3 places », « il reste 2 places », « il
   reste une place ») ; une reservation au plein tarif ce jour-la ferme les
   places restantes ; une place prise est gardee ; les jours vides des 14 jours
   a venir. Une seule remise : jamais pour une tete aux prix convenus, abonnee,
   ni qui a deja une remise, et sur Ma Couronne de ces clientes-la « EN AUCUNE
   CIRCONSTANCE. Ni les autres remises » ; le Rituel Sowa sans aucune remise,
   famille comprise. Plus de code a taper.

   CE QUE CE BANC TIENT, POUR MA COURONNE SEULE :
     1. les places lues de la base (`places_de_la_remise`), sans confiance ;
     2. la place d'un jour pour son rituel (places-pure, `laPlaceDuJour`) ;
     3. le panier sous une seule remise (`leChiffreDuPanier`) ;
     4. le refus de la base (`PLACES_LIMITEES:`) et le choix du tarif ;
     5. une journee entiere contre une BASE SIMULEE (la fonction des places et
        le garde de la 0154, rejoues ici avec la regle pure partagee) ;
     6. le branchement des ecrans (Reserver, l'accueil, le profil, le
        deplacement), lu dans leur source.

   TOUS LES ATTENDUS SONT ECRITS EN DUR, tires de ces phrases. */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  ditLesPlaces, occupationDuJour, placesRestantes, poseLOffreDuJour, remiseFamilleDeLaTete,
  type OffreCodee, type RdvACompter,
} from '../src/shared/offres-pur';
import {
  aucuneRemisePour, carteDesPlacesDeLaRemise, estLaPlacePartie, fondsLaFenetre, formulesQuiCourent, laPlaceDuJour,
  laPlaceEstPartie, leChiffreDuPanier, lesTetesReunies, pctDeLaLigne, placesLues, type LigneDuPanier,
} from '../src/apps/couronne/places-pure';
import { verdictDeLEcriture } from '../src/apps/couronne/reservation-pure';

declare const __PANNE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 200)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 200)}`));
};

const racine = process.cwd();
const brut = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__PANNE__ && __PANNE__.fichier === rel) s = s.split(__PANNE__.avant).join(__PANNE__.apres);
  return s;
};
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => sansCommentaires(brut(rel));

/* ── Les fixtures ─────────────────────────────────────────────────── */
const LA_MAISON = 'br-maison';
const AUJ = '2026-11-05'; // un jeudi
const MAR = '2026-11-10';
const MER = '2026-11-11';
const JEU = '2026-11-12';
const VEN = '2026-11-13';
const SAM = '2026-11-14';
const J14 = '2026-11-19'; // le quatorzieme jour
const J15 = '2026-11-20'; // le quinzieme
const PASSE = '2026-11-03'; // un mardi passe

const PLACES = {
  id: 'of-places-limitees', branchId: LA_MAISON, title: 'Places limitées', active: true, code: 'PLACES15', discountPct: 15,
  serviceIds: ['sv-shampoing', 'sv-lavage', 'sv-soin'], joursDeLaVenue: ['Mar', 'Mer', 'Jeu', 'Ven'],
  placesParJour: 3, jourVideSeulement: true, horizonJours: 14,
};
/* L'ancien mercredi de la Maison : eteint le 4 novembre 2026, sans places.
   Rallume par megarde, il ne doit pas revenir par Ma Couronne. */
const MERCREDI_ANCIEN = {
  id: 'of-mercredi15', branchId: LA_MAISON, title: 'Le mercredi de la Maison', active: true, code: 'MERCREDI15', discountPct: 15,
  serviceIds: ['sv-shampoing'], joursDeLaVenue: ['Mer'],
};
/* Une offre qui couvrirait le Sowa par erreur : le Sowa ne prend rien quand meme. */
const PLACES_AVEC_SOWA = { ...PLACES, serviceIds: [...PLACES.serviceIds, 'sv-sowa'] };

const PRIX: Record<string, number> = {
  'sv-shampoing': 10_000, 'sv-soin': 12_000, 'sv-coloration': 30_000, 'sv-sowa': 15_000, 'sv-forfait': 50_000,
};
const ligne = (id: string, plus: Partial<LigneDuPanier> = {}): LigneDuPanier => ({
  id, prixXof: PRIX[id], ferme: true, forfait: id === 'sv-forfait', sansRemise: id === 'sv-sowa', ...plus,
});
const carteDe = (jour: string, places: number, offre = PLACES.id) => carteDesPlacesDeLaRemise([{ jour, offre, places }]);
const juge = (dateIso: string, carte: ReturnType<typeof carteDesPlacesDeLaRemise>, plus: Record<string, unknown> = {}, offres: OffreCodee[] = [PLACES]) =>
  laPlaceDuJour(offres, { branchId: LA_MAISON, dateIso, serviceIds: ['sv-shampoing'], carte, aujourdhui: AUJ, ...plus })?.id ?? null;

/* ══ 1. Les places lues de la base, sans confiance ══ */
dit('une ligne lue : le jour, l offre, les places', { [MAR]: { [PLACES.id]: 3 } }, carteDe(MAR, 3));
dit('... une ligne illisible ne dit rien, une liste qui n en est pas une non plus', [{}, {}, {}], [
  carteDesPlacesDeLaRemise([{ jour: 'mardi', offre: 'x', places: 2 }, { jour: MAR, offre: '', places: 2 }, { jour: MAR, offre: 'x', places: 'deux' }, null]),
  carteDesPlacesDeLaRemise(null),
  carteDesPlacesDeLaRemise({ jour: MAR, offre: 'x', places: 2 }),
]);
dit('... jamais negatif, jamais decimal, un nombre ecrit se lit', { [MAR]: { a: 0, b: 2, c: 1 } },
  carteDesPlacesDeLaRemise([{ jour: `${MAR}T00:00:00`, offre: 'a', places: -2 }, { jour: MAR, offre: 'b', places: 2.7 }, { jour: MAR, offre: 'c', places: '1' }]));
dit('les places se lisent par l identifiant de l offre, ou par son code', [2, 1, null, null], [
  placesLues(carteDe(MAR, 2), PLACES, MAR),
  placesLues(carteDe(MAR, 1, 'places15'), PLACES, MAR),
  placesLues(carteDe(MAR, 2), PLACES, MER),
  placesLues(carteDe(MAR, 2, 'autre'), PLACES, MAR),
]);
{
  const avant = { [MAR]: { [PLACES.id]: 3 }, [MER]: { [PLACES.id]: 3 }, '2026-12-01': { [PLACES.id]: 2 } };
  dit('une fenetre relue remplace ses jours : un jour que la base ne dit plus s efface, hors fenetre rien ne bouge',
    { [MAR]: { [PLACES.id]: 1 }, '2026-12-01': { [PLACES.id]: 2 } },
    fondsLaFenetre(avant, [MAR, MER], carteDe(MAR, 1)));
  dit('... une panne efface la fenetre entiere : jamais de remise sur un jour qu on ne sait plus',
    { '2026-12-01': { [PLACES.id]: 2 } }, fondsLaFenetre(avant, [MAR, MER], null));
}
dit('la place partie ferme le jour ici, aussitot', 0, placesLues(laPlaceEstPartie(carteDe(MAR, 1), PLACES, MAR), PLACES, MAR));

/* ══ 2. La place d un jour, pour son rituel ══ */
dit('un mardi vide, trois places : la remise se pose', PLACES.id, juge(MAR, carteDe(MAR, 3)));
dit('... et le decompte se dit « Remise : il reste 3 places », puis 2, puis une',
  ['Remise : il reste 3 places', 'Remise : il reste 2 places', 'Remise : il reste une place'], [3, 2, 1].map((n) => ditLesPlaces(n)));
dit('zero place : plus rien ce jour-la', null, juge(MAR, carteDe(MAR, 0)));
dit('un jour que la base n a pas dit : rien (jamais un jour qu on n a pas compte)', null, juge(MAR, {}));
dit('jamais le samedi, meme si la base disait des places', null, juge(SAM, carteDe(SAM, 3)));
dit('du mardi au vendredi', [PLACES.id, PLACES.id, PLACES.id, PLACES.id],
  [MAR, MER, JEU, VEN].map((d) => juge(d, carteDe(d, 3))));
dit('le quatorzieme jour s ouvre, le quinzieme non, sur le reglage de l offre', [PLACES.id, null],
  [juge(J14, carteDe(J14, 3)), juge(J15, carteDe(J15, 3))]);
dit('... l horizon change au reglage (21 jours) : le quinzieme s ouvre', PLACES.id,
  juge(J15, carteDe(J15, 3), {}, [{ ...PLACES, horizonJours: 21 }]));
dit('un jour passe : rien', null, juge(PASSE, carteDe(PASSE, 3)));
dit('jamais pour une tete aux prix convenus ou abonnee', null, juge(MAR, carteDe(MAR, 3), { aucuneRemise: true }));
dit('jamais par-dessus une autre remise (famille, geste de la Maison)', null, juge(MAR, carteDe(MAR, 3), { autreRemise: true }));
dit('jamais par-dessus une offre de saison deja choisie', null, juge(MAR, carteDe(MAR, 3), { dejaUnCode: true }));
dit('jamais sur un rituel sans geste couvert', null,
  laPlaceDuJour([PLACES], { dateIso: MAR, serviceIds: ['sv-coloration'], carte: carteDe(MAR, 3), aujourdhui: AUJ })?.id ?? null);
dit('elle a choisi le tarif de la Maison ce jour-la : la place ne s y repose plus ; un autre jour, si', [null, PLACES.id],
  [juge(MAR, carteDe(MAR, 1), { renonceLe: MAR }), juge(MER, carteDe(MER, 1), { renonceLe: MAR })]);
dit('une place prise est gardee a sa date, meme le jour rempli depuis', PLACES.id,
  juge(MAR, carteDe(MAR, 0), { offreTenue: PLACES.id }));
dit('l ancien mercredi de la Maison, rallume, ne revient pas par Ma Couronne', null,
  juge(MER, carteDe(MER, 3, MERCREDI_ANCIEN.id), {}, [MERCREDI_ANCIEN as OffreCodee]));
dit('eteinte, l offre a places ne se pose plus', null, juge(MAR, carteDe(MAR, 3), {}, [{ ...PLACES, active: false }]));

/* ══ 3. Une seule remise : la tete ══ */
dit('aux prix convenus ou abonnee, une seule des tetes suffit', [true, true, true, false], [
  aucuneRemisePour([{ prixConvenus: true }]),
  aucuneRemisePour([{ abonnee: true }]),
  aucuneRemisePour([{}, { abonnee: true }]),
  aucuneRemisePour([{}, null]),
]);
dit('les tetes reunies : la mere et la fille', { prixConvenus: false, abonnee: true }, lesTetesReunies([{}, { abonnee: true }]));
dit('abonnee : une formule qui court au releve ; une formule finie, non', [true, false, false],
  [formulesQuiCourent({ contrats: [{}] }), formulesQuiCourent({ contrats: [] }), formulesQuiCourent(null)]);
dit('la remise famille d une tete aux prix convenus ou abonnee : 0 ; d une autre : la sienne', [0, 0, 10],
  [remiseFamilleDeLaTete(10, lesTetesReunies([{ prixConvenus: true }])), remiseFamilleDeLaTete(10, lesTetesReunies([{}, { abonnee: true }])), remiseFamilleDeLaTete(10, lesTetesReunies([{}]))]);

/* ══ 4. Le panier, sous une seule remise ══ */
{
  const c = leChiffreDuPanier({ lignes: [ligne('sv-shampoing')], famillePct: 0, place: PLACES });
  dit('un shampoing a 10 000 F, une place : 8 500 F, monte au millier, 9 000 F', ['place', 1_000, 9_000], [c.retenue, c.remisePlace, c.prix]);
}
{
  const c = leChiffreDuPanier({ lignes: [ligne('sv-shampoing'), ligne('sv-coloration')], famillePct: 0, place: PLACES });
  dit('... avec une coloration non couverte : seule la ligne du shampoing bouge', ['place', 1_000, 39_000], [c.retenue, c.remisePlace, c.prix]);
}
{
  const c = leChiffreDuPanier({ lignes: [ligne('sv-shampoing')], famillePct: 10, place: PLACES });
  dit('une remise famille presente : pas de place, quel que soit le chiffre (plus de « la plus forte des deux »)',
    ['famille', 1_000, 0, 9_000], [c.retenue, c.remiseFamille, c.remisePlace, c.prix]);
}
{
  const c = leChiffreDuPanier({ lignes: [ligne('sv-shampoing'), ligne('sv-sowa'), ligne('sv-forfait')], famillePct: 10 });
  dit('la remise famille ne touche ni le forfait ni le Rituel Sowa', [1_000, 74_000], [c.remiseFamille, c.prix]);
}
{
  const c = leChiffreDuPanier({ lignes: [ligne('sv-shampoing')], famillePct: 15, offreDeSaisonPct: 20, place: PLACES, aucuneRemise: true });
  dit('aux prix convenus ou abonnee : ni famille, ni offre, ni place, le prix de la carte',
    ['aucune', 0, 0, 0, 10_000], [c.retenue, c.remiseFamille, c.remiseOffre, c.remisePlace, c.prix]);
}
{
  const c = leChiffreDuPanier({ lignes: [ligne('sv-shampoing')], famillePct: 10, offreDeSaisonPct: 20, place: PLACES, geste: true });
  dit('un geste offert par la Maison est deja la remise du rituel', ['geste', 0, 10_000], [c.retenue, c.remiseFamille, c.prix]);
}
{
  const c = leChiffreDuPanier({ lignes: [ligne('sv-shampoing'), ligne('sv-sowa')], famillePct: 0, offreDeSaisonPct: 20, place: PLACES });
  dit('une offre de saison choisie : elle seule, et jamais sur le Sowa', ['offre', 2_000, 0, 23_000], [c.retenue, c.remiseOffre, c.remisePlace, c.prix]);
  dit('... la ligne dit son pour cent, le Sowa aucun', [20, 0],
    [pctDeLaLigne(c, ligne('sv-shampoing'), PLACES), pctDeLaLigne(c, ligne('sv-sowa'), PLACES)]);
}
{
  const c = leChiffreDuPanier({ lignes: [ligne('sv-sowa')], famillePct: 0, place: PLACES_AVEC_SOWA });
  dit('le Sowa ne prend pas la place, meme couvert par erreur', ['aucune', 0, 15_000], [c.retenue, c.remisePlace, c.prix]);
  const d = leChiffreDuPanier({ lignes: [ligne('sv-shampoing'), ligne('sv-sowa')], famillePct: 0, place: PLACES_AVEC_SOWA });
  dit('... a cote d un shampoing, seul le shampoing bouge', [1_000, 24_000, 15, 0],
    [d.remisePlace, d.prix, pctDeLaLigne(d, ligne('sv-shampoing'), PLACES_AVEC_SOWA), pctDeLaLigne(d, ligne('sv-sowa'), PLACES_AVEC_SOWA)]);
}
{
  const c = leChiffreDuPanier({ lignes: [ligne('sv-shampoing'), ligne('sv-coloration')], famillePct: 0, place: PLACES });
  dit('la ligne d une place dit −15 %, la coloration rien', [15, 0],
    [pctDeLaLigne(c, ligne('sv-shampoing'), PLACES), pctDeLaLigne(c, ligne('sv-coloration'), PLACES)]);
}
{
  const c = leChiffreDuPanier({ lignes: [ligne('sv-shampoing', { masque: true })], famillePct: 10, place: PLACES });
  dit('un prix a la Maison ne se remise pas', ['aucune', 0], [c.retenue, c.prix]);
}

/* ══ 5. Le refus de la base ══ */
dit('le garde des places dit PLACES_LIMITEES: ; l heure prise reste « prise »', ['posee', 'prise', 'place-partie', 'place-partie', 'echec'], [
  verdictDeLEcriture(null),
  verdictDeLEcriture('creneau_pris'),
  verdictDeLEcriture('PLACES_LIMITEES: la derniere place de ce jour vient de partir'),
  verdictDeLEcriture('ERROR: PLACES_LIMITEES: plus de place'),
  verdictDeLEcriture('Failed to fetch'),
]);
dit('... et rien d autre ne passe pour une place partie', [true, false, false],
  [estLaPlacePartie('PLACES_LIMITEES: x'), estLaPlacePartie('places limitees'), estLaPlacePartie(undefined)]);

/* ══ 6. Une journee contre une base simulee ══
   La base de la 0154, rejouee ici avec la regle pure partagee : la fonction
   `places_de_la_remise` rend une ligne par jour concerne ; le garde refuse
   une ecriture qui prend une place quand il n en reste plus. */
type Rdv = RdvACompter & { serviceIds: string[]; clientId: string; priceXof: number };
const base: Rdv[] = [];
const OFFRES = [PLACES];
const placesDeLaRemiseSimulee = (debut: string, fin: string) => {
  const lignes: { jour: string; offre: string; places: number }[] = [];
  for (let t = Date.parse(`${debut}T12:00:00Z`); t <= Date.parse(`${fin}T12:00:00Z`); t += 86_400_000) {
    const jour = new Date(t).toISOString().slice(0, 10);
    for (const o of OFFRES) {
      const n = placesRestantes(o, jour, occupationDuJour(o, base, jour, { branchId: LA_MAISON }), AUJ);
      if (n !== null) lignes.push({ jour, offre: o.id, places: n });
    }
  }
  return lignes;
};
const ecrisSimulee = (r: Rdv): { error: { message: string } | null } => {
  const o = OFFRES.find((x) => x.id === r.offreId);
  if (o) {
    const n = placesRestantes(o, r.date as string, occupationDuJour(o, base, r.date as string, { branchId: LA_MAISON, saufId: r.id }), AUJ);
    if (!((n ?? 0) > 0)) return { error: { message: 'PLACES_LIMITEES: la derniere place de ce jour vient de partir' } };
  }
  base.push(r);
  return { error: null };
};
let n = 0;
/* MA COURONNE, telle que Reserver la mene : lire les places, juger, compter,
   poser, ecrire ; a la place partie, la cliente choisit le tarif de la Maison. */
const reserve = (cliente: { prixConvenus?: boolean; abonnee?: boolean; famillePct?: number }, jour: string, ids: string[],
  carteLue = carteDesPlacesDeLaRemise(placesDeLaRemiseSimulee(AUJ, J14))) => {
  let carte = carteLue;
  let renonceLe: string | null = null;
  const lignes = ids.map((id) => ligne(id));
  const tete = lesTetesReunies([cliente]);
  const aucune = aucuneRemisePour([tete]);
  const famillePct = remiseFamilleDeLaTete(cliente.famillePct ?? 0, tete);
  const essaie = () => {
    const place = laPlaceDuJour(OFFRES, {
      branchId: LA_MAISON, dateIso: jour, serviceIds: ids, carte, aujourdhui: AUJ, aucuneRemise: aucune, renonceLe,
      autreRemise: leChiffreDuPanier({ lignes, famillePct }).remiseFamille > 0,
    });
    const c = leChiffreDuPanier({ lignes, famillePct, place, aucuneRemise: aucune });
    const pose = c.retenue === 'place' && place ? poseLOffreDuJour(place, lignes) : null;
    const decompte = place ? placesLues(carte, place, jour) : null;
    const r: Rdv = {
      id: `rdv-${++n}`, date: jour, status: 'confirmé', branchId: LA_MAISON, clientId: `c-${n}`, serviceIds: ids,
      priceXof: c.connu - (pose ? c.remisePlace : 0), ...(pose ? { codeOffre: pose.codeOffre, offreId: pose.offreId } : {}),
    };
    return { c, r, decompte, verdict: verdictDeLEcriture(ecrisSimulee(r).error?.message ?? null) };
  };
  const premier = essaie();
  if (premier.verdict !== 'place-partie') return { ...premier, partie: false };
  /* « La derniere place a −15 % vient de partir. » : le jour se ferme ici,
     elle confirme au tarif de la Maison, et la reservation repart. */
  carte = laPlaceEstPartie(carte, PLACES, jour);
  renonceLe = jour;
  /* Le decompte rendu est celui qu'elle a LU, avant le refus. */
  return { ...essaie(), partie: true, avant: premier.c.prix, decompte: premier.decompte };
};

{
  const a = reserve({}, MAR, ['sv-shampoing']);
  const b = reserve({}, MAR, ['sv-shampoing']);
  const c = reserve({}, MAR, ['sv-soin']);
  const d = reserve({}, MAR, ['sv-shampoing']);
  dit('mardi vide : trois places decomptees, 3, 2, une, puis plus rien', [3, 2, 1, null], [a.decompte, b.decompte, c.decompte, d.decompte]);
  dit('... les trois premieres a −15 %, posees avec le code, sans rien taper', [9_000, 9_000, 11_000, 10_000], [a.c.prix, b.c.prix, c.c.prix, d.c.prix]);
  dit('... la base garde le code sur les trois, et la quatrieme au plein tarif', ['PLACES15', 'PLACES15', 'PLACES15', undefined],
    base.filter((r) => r.date === MAR).map((r) => r.codeOffre));
}
{
  const plein = reserve({}, MER, ['sv-coloration']);
  const apres = reserve({}, MER, ['sv-shampoing']);
  dit('mercredi : une reservation au plein tarif ferme les places restantes (seulement un jour vide)',
    ['aucune', 10_000, null], [plein.c.retenue, apres.c.prix, apres.decompte]);
}
{
  reserve({}, JEU, ['sv-shampoing']);
  reserve({}, JEU, ['sv-shampoing']);
  /* Deux clientes lisent « il reste une place » au meme instant. */
  const lue = carteDesPlacesDeLaRemise(placesDeLaRemiseSimulee(AUJ, J14));
  const g = reserve({}, JEU, ['sv-shampoing'], lue);
  const h = reserve({}, JEU, ['sv-shampoing'], lue);
  dit('jeudi, la course a la derniere place : les deux lisent « il reste une place »', [1, 1], [g.decompte, h.decompte]);
  dit('... la premiere l a, la seconde est refusee par la base, puis confirme au tarif de la Maison',
    [false, 9_000, true, 9_000, 10_000, 'posee'], [g.partie, g.c.prix, h.partie, (h as { avant?: number }).avant, h.c.prix, h.verdict]);
  dit('... jamais un prix change en silence : la seconde part sans code ni remise', [undefined, 10_000],
    [base[base.length - 1].codeOffre, base[base.length - 1].priceXof]);
  dit('... et le jeudi ne compte jamais plus de trois places', 3, base.filter((r) => r.date === JEU && r.offreId === PLACES.id).length);
}
{
  /* Trois jours vides, trois places chacun : aucune de ces tetes n en prend. */
  const convenu = reserve({ prixConvenus: true, famillePct: 15 }, VEN, ['sv-shampoing']);
  const abonnee = reserve({ abonnee: true, famillePct: 10 }, '2026-11-17', ['sv-shampoing']);
  const famille = reserve({ famillePct: 10 }, '2026-11-18', ['sv-shampoing', 'sv-sowa']);
  dit('un jour vide : aux prix convenus ni place ni famille ; abonnee non plus ; la famille sans place et jamais sur le Sowa',
    [['aucune', 10_000], ['aucune', 10_000], ['famille', 24_000]],
    [[convenu.c.retenue, convenu.c.prix], [abonnee.c.retenue, abonnee.c.prix], [famille.c.retenue, famille.c.prix]]);
  dit('... aucune des trois n a pris de place ce jour-la', 0,
    base.filter((r) => [VEN, '2026-11-17', '2026-11-18'].includes(r.date as string) && r.offreId).length);
}
{
  /* LE DEPLACEMENT : son rendez-vous du mardi tient une place ; le mardi est
     plein depuis. A la meme date, sa place est gardee ; un autre jour sans
     place, elle ne suit pas. */
  const carte = carteDesPlacesDeLaRemise(placesDeLaRemiseSimulee(AUJ, J14));
  const tient = (iso: string, sienne: string) => laPlaceDuJour([PLACES], {
    branchId: LA_MAISON, dateIso: iso, serviceIds: ['sv-shampoing'], carte, aujourdhui: AUJ,
    offreTenue: iso === sienne ? PLACES.id : undefined,
  })?.id ?? null;
  dit('deplacer a la meme date garde la place ; vers le mercredi ferme, non', [PLACES.id, null], [tient(MAR, MAR), tient(MER, MAR)]);
}

/* ══ 7. Le branchement des ecrans ══ */
const B = source('src/apps/couronne/Booking.tsx');
const T = source('src/apps/couronne/Tabs.tsx');
const L = source('src/apps/couronne/lib.ts');
const M = source('src/apps/couronne/MesRendezVous.tsx');
dit('Reserver : la tete juge la remise famille (une seule remise, prix convenus, abonnee)', [true, true], [
  /const teteALaRemise = useLaTeteALaRemise\(cible\?\.id\);/.test(B),
  /const famPctTete = remiseFamilleDeLaTete\(famPctCompte, teteALaRemise\);/.test(B),
]);
dit('... une offre de saison ne vaut rien aux prix convenus ni pour une abonnee', true,
  /const discountPct = aucuneRemise \? 0 : \(prefill\?\.discountPct \?\? 0\);/.test(B));
dit('... la place se juge sur les places lues, sans code, jamais par-dessus une autre remise', [true, true, true, true, true], [
  /carte: placesDeLaRemiseDe\(branch\.id\),/.test(B),
  /\n\s+aucuneRemise,\n\s+dejaUnCode: discountPct > 0,/.test(B),
  /autreRemise: unGesteDansLePanier\(panier, pricing\)\s*\|\| leChiffreDuPanier\(\{ lignes: lignesDe\(panier\), famillePct: famPctTete \}\)\.remiseFamille > 0,/.test(B),
  /\n\s+renonceLe,\n\s+\}\);/.test(B),
  !/offreDuJourDeLaVenue\(/.test(B),
]);
dit('... le panier se compte sous une seule remise, la famille jugee, aucune remise aux prix convenus', true,
  /leChiffreDuPanier\(\{\s*lignes: lignesDe\(panier\),\s*famillePct: famPctTete,\s*offreDeSaisonPct: discountPct,\s*place,\s*aucuneRemise,\s*geste: unGesteDansLePanier\(panier, pricing\),\s*\}\)/.test(B));
dit('... « la plus forte des deux » n est plus', false, /laPlusForteDesDeux/.test(B));
dit('... la place se pose avec son code, jamais sur une ligne sans remise', [true, true, true], [
  /const laPlace = chiffre\.retenue === 'place' \? chiffre\.place : null;/.test(B),
  /ferme: !!s && p > 0 && priceModeOf\(s\) !== 'devis' && prixFerme\(s, pricing\) && !gesteSansRemise\(s\)/.test(B),
  /\.\.\.\(i === 0 && poseDeLaPlace \? \{\s*codeOffre: poseDeLaPlace\.codeOffre,/.test(B),
]);
dit('... la place partie : rien ne s ecrit, le jour se ferme, elle choisit', [true, true, true], [
  /if \(verdict === 'place-partie' && laPlace\) \{[^}]*fermeLaPlaceIci\(branch\.id, laPlaceEstPartie\([\s\S]{0,200}setPlacePartie\(\{[\s\S]{0,120}\n\s+return;\n\s+\}/.test(B),
  /t\('La dernière place à −\{pct\} % vient de partir\.', \{ pct: placePartie\.pct \}\)/.test(B),
  /onClick=\{confirmerAuTarif\}[\s\S]{0,80}t\('Confirmer au tarif de la Maison'\)/.test(B),
]);
dit('... confirmer au tarif de la Maison : la place ne se repose plus ce jour-la, et la reservation repart', [true, true], [
  /setRenonceLe\(placePartie\.iso\);/.test(B),
  /relanceAuTarif\.current = null;\s*settle\(r\.online\);/.test(B),
]);
dit('... les jours qui ont des places se disent : le cuivre, le decompte, la ligne « place limitee »', [true, true, true, true], [
  /const duJour = c\.free && \(totalSessions === 1 \|\| sessionDates\.length === 0\) \? laPlaceQuiCompte\(c\.iso\) : null;/.test(B),
  /return n !== null && n > 0 \? t\(ditLesPlaces\(n\)\) : null;/.test(B),
  /t\('place limitée'\)/.test(B),
  /t\('Places limitées · −\{pct\} % · −\{montant\}'/.test(B),
]);
dit('Accueil : aucune offre aux prix convenus ni pour une abonnee', [true, true], [
  /const aucuneRemise = useAucuneRemise\(\);/.test(L),
  /if \(aucuneRemise\) return \{ offers: \[\], endMin: null \};/.test(L),
]);
dit('... la tete se juge par le predicat de la Maison et le releve, elle et la tete pour qui elle reserve', [true, true], [
  /me \? \{ prixConvenus: aUnPrixConvenu\(me\), abonnee: formulesQuiCourent\(releveMoi\) \} : null,/.test(L),
  /autre \? \{ prixConvenus: aUnPrixConvenu\(autre\), abonnee: formulesQuiCourent\(releveTete\) \} : null,/.test(L),
]);
dit('... les places se lisent avec les murs, une panne n en retient aucune, et elles se retiennent', [true, true, true], [
  /sb\.rpc\('places_de_la_remise', \{ p_branch: branchId, p_debut: du, p_fin: au \}\)\)\s*\.then\(\(lue\) => \(lue\.error \? null : lue\.data as unknown\), \(\) => null\);/.test(L),
  /retiensLesPlacesDeLaRemise\(branchId, du, au, laRemise\);/.test(L),
  /lignes === null \? null : carteDesPlacesDeLaRemise\(lignes\),/.test(L),
]);
dit('Profil : la remise famille ne se dit pas aux prix convenus ni a une abonnee', [true, true], [
  /const famPctDit = remiseFamilleDeLaTete\(famPctProfil, useLaTeteALaRemise\(\)\);/.test(T),
  /\{famPctDit > 0 && \(/.test(T) && !/\{famPctProfil > 0 && \(/.test(T),
]);
dit('Deplacer : la place gardee a sa date, le refus dit, rien aux prix convenus', [true, true, true], [
  /offreTenue: iso === editing\.date \? placeTenue\.id : undefined,/.test(M),
  /: estLaPlacePartie\(parLaMaison\.raison\)/.test(M),
  /\n\s+aucuneRemise,\n\s+offreTenue:/.test(M),
]);
{
  const ecrans = readdirSync(path.join(racine, 'src/apps/couronne')).filter((f) => /\.(ts|tsx)$/.test(f));
  const revenants = ecrans.filter((f) => /of-mercredi15|MERCREDI15/.test(source(`src/apps/couronne/${f}`)));
  dit('l ancien mercredi (of-mercredi15) ne revient nulle part dans Ma Couronne', [], revenants);
}

console.log(ko === 0 ? '\nLes places limitees tiennent a Ma Couronne.' : `\n${ko} controle(s) en echec.`);
