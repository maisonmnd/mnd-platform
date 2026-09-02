/* LA FORMULE AU CALIBRE, ÉPROUVÉE — 1er septembre 2026.

   « Les abonnements doivent se facturer au palier comme au catalogue. Et avoir
   aussi l'option de la longueur » (Yéman).

   CE QUI SE JOUE ICI EST LE PRIX D'UN ENGAGEMENT DE DIX MOIS. Une erreur ne
   plante pas : elle fait vendre à perte pendant toute une année, ou fait payer
   à une cliente le double de ce que la vitrine lui avait promis. La première
   se découvre au bilan, la seconde au comptoir, devant elle. */
import {
  basePourLaTete, supplementDeLongueurXof, prixDeLaFormule, etendueDeLaFormule,
  partMensuelleDeLaFormule, prixVenduXof, ecartDuPrixConvenu,
  gainPourElle, perkParleDeLaCarte, abonnementsVivantsDe,
  libelleFourchette,
  type Plan, type Subscriber,
} from '../src/shared/abonnements';
import { modelBandsStore, bandSetsStore, bandsAbonnements, SCOPE_ABONNEMENTS } from '../src/shared/pricing';
import type { ModelBand } from '../src/shared/pricing';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* Les calibres de la Maison, coefficients réels (Paramètres, 13 août). */
const BANDS: ModelBand[] = [
  { id: 'cal-jumbo', name: 'Jumbo', maxLocks: 80, coef: 0.8, durCoef: 0.7 },
  { id: 'cal-medium', name: 'Medium', maxLocks: 150, coef: 1, durCoef: 1 },
  { id: 'cal-mini', name: 'Mini', maxLocks: 250, coef: 1.4, durCoef: 1.4 },
  { id: 'cal-micro', name: 'Micro', maxLocks: 350, coef: 1.8, durCoef: 1.9 },
  { id: 'cal-pico', name: 'Pico', maxLocks: 550, coef: 2.5, durCoef: 2.6 },
];

const plan = (p: Partial<Plan>): Plan => ({
  id: 'p1', name: 'La Juste Cadence', tag: 'cadence', priceXof: 45_000,
  line: '', perks: [], popular: false, ...p,
} as Plan);

/* ── ① SANS RIEN DE POSÉ, RIEN NE BOUGE ─────────────────────────────
   La garde la plus importante du lot : le jour de la mise en ligne, aucune
   formule ne doit changer de prix. Une formule sans calibre n'en entend
   jamais parler, même si la tête, elle, en porte un. */
const simple = plan({});
dit('sans grille, le prix unique tient', 45_000, basePourLaTete(simple, BANDS, undefined));
dit('… même pour une tête Pico', 45_000, basePourLaTete(simple, BANDS, { bandId: 'cal-pico' }));
dit('… et l’appel d’avant, sans tête, ne change pas', 45_000,
  prixDeLaFormule(simple, 'mensuel').montantXof);

/* ── ② L'INTERRUPTEUR : UN CHIFFRE FAIT LES SEPT ────────────────────
   Le prix de référence est celui du Medium, dont le coefficient vaut 1. */
const suit = plan({ suitLeCalibre: true });
dit('Medium est le pivot', 45_000, basePourLaTete(suit, BANDS, { bandId: 'cal-medium' }));
dit('Jumbo descend', 36_000, basePourLaTete(suit, BANDS, { bandId: 'cal-jumbo' }));
dit('Mini monte', 63_000, basePourLaTete(suit, BANDS, { bandId: 'cal-mini' }));
dit('Pico monte fort', 112_500, basePourLaTete(suit, BANDS, { bandId: 'cal-pico' }));
/* SANS CALIBRE CONNU, LE PRIX DE RÉFÉRENCE. On ne facture pas le plus cher
   « au cas où » : une tête qu'on n'a pas comptée n'est pas une tête Pico. */
dit('tête inconnue : le prix de référence', 45_000, basePourLaTete(suit, BANDS, {}));
/* UN CALIBRE QUI N'EXISTE PLUS ne fait pas tomber le prix à zéro : un barème
   réécrit aux Paramètres ne doit pas rendre gratuites les formules d'hier. */
dit('un calibre inconnu retombe sur la référence', 45_000,
  basePourLaTete(suit, BANDS, { bandId: 'cal-disparu' }));
dit('un barème vide aussi', 45_000, basePourLaTete(suit, [], { bandId: 'cal-pico' }));

/* ── ③ LA CASE ÉCRITE À LA MAIN PASSE DEVANT ────────────────────────
   C'est une décision de la Maison ; le calcul ne la corrige pas. */
const exception = plan({ suitLeCalibre: true, prixParCalibre: { 'cal-micro': 75_000 } });
dit('l’exception gagne sur le calcul', 75_000, basePourLaTete(exception, BANDS, { bandId: 'cal-micro' }));
dit('… et les autres suivent toujours le coefficient', 63_000,
  basePourLaTete(exception, BANDS, { bandId: 'cal-mini' }));
/* UNE CASE ÉCRITE VAUT MÊME SANS L'INTERRUPTEUR : on peut tarifer trois
   calibres à la main sans jamais poser le coefficient. */
const aLaMain = plan({ prixParCalibre: { 'cal-pico': 90_000 } });
dit('une case seule suffit', 90_000, basePourLaTete(aLaMain, BANDS, { bandId: 'cal-pico' }));
dit('… les autres gardent le prix unique', 45_000, basePourLaTete(aLaMain, BANDS, { bandId: 'cal-jumbo' }));
/* ZÉRO ÉCRIT EST UN PRIX, PAS UNE CASE VIDE : une formule offerte à un
   calibre doit pouvoir se dire. C'est l'absence qui veut dire « prends le
   calcul », jamais le zéro. */
dit('un zéro écrit vaut gratuit', 0,
  basePourLaTete(plan({ suitLeCalibre: true, prixParCalibre: { 'cal-jumbo': 0 } }), BANDS, { bandId: 'cal-jumbo' }));

/* ── ④ LA LONGUEUR S'AJOUTE, ELLE NE MULTIPLIE PAS ──────────────────
   Trois chiffres plutôt que vingt et une cases. */
const long = plan({ suitLeCalibre: true, supplementLongueur: { 'mi-long': 8_000, long: 15_000 } });
dit('court n’ajoute rien', 0, supplementDeLongueurXof(long, { longueur: 'court' }));
dit('mi-long ajoute son supplément', 8_000, supplementDeLongueurXof(long, { longueur: 'mi-long' }));
dit('longueur inconnue : rien', 0, supplementDeLongueurXof(long, {}));
dit('Micro long : le calibre puis le supplément', 81_000 + 15_000,
  prixDeLaFormule(long, 'mensuel', { bandId: 'cal-micro', longueur: 'long' }, BANDS).montantXof);

/* LE SUPPLÉMENT NE SE MULTIPLIE PAS PAR LE CYCLE — c'est la faute la plus
   coûteuse du lot. Un cycle annuel facture dix mois ; multiplier 15 000 F par
   dix ferait 150 000 F de supplément sur une formule qui en vaut 450 000. La
   longueur s'ajoute UNE FOIS, après le cycle. */
dit('en annuel, le calibre se multiplie', 45_000 * 10,
  prixDeLaFormule(plan({ suitLeCalibre: true }), 'annuel', { bandId: 'cal-medium' }, BANDS).montantXof);
dit('… mais le supplément ne s’ajoute qu’une fois', 45_000 * 10 + 15_000,
  prixDeLaFormule(long, 'annuel', { bandId: 'cal-medium', longueur: 'long' }, BANDS).montantXof);

/* ── ⑤ LE PAQUET SUIT LA MÊME LOI ───────────────────────────────────
   Un pack porte un prix total, pas un prix mensuel : le calibre s'y applique
   tel quel, sans multiplication de cycle. */
const pack = plan({ mode: 'pack', priceXof: 225_000, suitLeCalibre: true, supplementLongueur: { long: 15_000 } });
dit('le paquet suit le calibre', 180_000,
  prixDeLaFormule(pack, 'mensuel', { bandId: 'cal-jumbo' }, BANDS).montantXof);
dit('… et son supplément s’ajoute une seule fois', 180_000 + 15_000,
  prixDeLaFormule(pack, 'mensuel', { bandId: 'cal-jumbo', longueur: 'long' }, BANDS).montantXof);

/* ── ⑥ LA FOURCHETTE, CALCULÉE ET JAMAIS SAISIE ─────────────────────
   Le jour où un coefficient bouge aux Paramètres, elle suit toute seule. */
dit('l’étendue va du plus petit au plus grand', { bas: 36_000, haut: 112_500 },
  etendueDeLaFormule(suit, 'mensuel', BANDS));
/* UNE FORMULE QUI NE VARIE PAS N'A PAS DE FOURCHETTE : « de 45 000 à
   45 000 F » se lirait comme une panne. */
dit('sans variation, aucune fourchette', null, etendueDeLaFormule(simple, 'mensuel', BANDS));
dit('une seule case écrite fait déjà une fourchette', { bas: 45_000, haut: 90_000 },
  etendueDeLaFormule(aLaMain, 'mensuel', BANDS));
/* L'EXCEPTION ENTRE DANS LA FOURCHETTE : Micro descendu à 75 000 F ne change
   pas les bornes ici, mais le jour où une exception sort du barème, la
   vitrine doit la porter. */
dit('une exception hors barème élargit la fourchette', { bas: 36_000, haut: 200_000 },
  etendueDeLaFormule(plan({ suitLeCalibre: true, prixParCalibre: { 'cal-mini': 200_000 } }), 'mensuel', BANDS));

/* ── ⑦ LA PART MENSUELLE SUIT, SANS RIEN SAVOIR ─────────────────────
   Le revenu récurrent lit le prix vendu : il n'a aucune règle de calibre à
   connaître, et c'est exactement ce qu'on voulait. */
dit('le paquet Jumbo pèse sa part mensuelle', Math.round(225_000 / 12),
  partMensuelleDeLaFormule(pack, 'mensuel'));

/* ── ⑧ LA VENTE SE RELIT LE LENDEMAIN ───────────────────────────────
   « L'abonnement pour une cliente qui a 350 locks ne passe toujours pas au
   prix de son calibre, je vois toujours le prix fixe » (Yéman, 1er septembre).

   LA GRILLE ÉTAIT POSÉE ET PERSONNE NE L'INTERROGEAIT. `prixVenduXof` est le
   juge de TOUT ce qui s'affiche après la vente : la fiche, la caisse, le
   revenu récurrent, Ma Couronne. Sans le calibre vendu, il retombait sur le
   prix de référence, et l'écran contredisait le comptoir dès le lendemain.

   LE BARÈME SE LIT TOUT SEUL : ces fonctions sont appelées depuis des dizaines
   d'écrans, leur demander de tendre le barème obligerait chacun à y penser, et
   le premier qui l'oublierait afficherait le mauvais prix. */
modelBandsStore.set(BANDS);

const abo = (p: Partial<Subscriber>): Subscriber => ({
  id: 'ab-1', branchId: 'b1', name: 'Une tête', planId: 'p1',
  slot: '', nextIso: '2026-10-01', ...p,
} as Subscriber);

dit('sans calibre vendu, le prix de référence', 45_000,
  prixVenduXof(abo({}), suit, 'mensuel'));
dit('avec son calibre, son prix', 81_000,
  prixVenduXof(abo({ calibreVendu: 'cal-micro' }), suit, 'mensuel'));
dit('l’exception écrite gagne aussi après la vente', 75_000,
  prixVenduXof(abo({ calibreVendu: 'cal-micro' }), exception, 'mensuel'));
dit('la longueur vendue s’ajoute encore', 81_000 + 15_000,
  prixVenduXof(abo({ calibreVendu: 'cal-micro', longueurVendue: 'long' }), long, 'mensuel'));

/* LE PRIX CONVENU PASSE TOUJOURS DEVANT : ce que la Maison a écrit à la main
   pour cette tête ne se recalcule jamais. */
dit('le prix convenu passe devant le calibre', 60_000,
  prixVenduXof(abo({ calibreVendu: 'cal-micro', prixConvenuXof: 60_000 }), suit, 'mensuel'));

/* L'ÉCART SE MESURE CONTRE SON TARIF, PAS CONTRE LA VITRINE. Comparer le prix
   d'une tête Micro au calibre de référence annoncerait « +20 % » sur une vente
   parfaitement ordinaire, et la Maison croirait avoir surfacturé. */
dit('l’écart se mesure contre le tarif de SON calibre', -6_000,
  ecartDuPrixConvenu(abo({ calibreVendu: 'cal-micro', prixConvenuXof: 75_000 }), suit, 'mensuel')?.ecartXof);
dit('… et vaut zéro quand on lui vend son tarif', 0,
  ecartDuPrixConvenu(abo({ calibreVendu: 'cal-micro', prixConvenuXof: 81_000 }), suit, 'mensuel')?.ecartXof);

/* ── ⑨ DEUX BARÈMES, ET ILS NE SE CONFONDENT PAS ────────────────────
   « Je dois avoir un juste prix pour les services, un pour les abonnements »
   (Yéman, 1er septembre 2026).

   UN ABONNEMENT EMPRUNTAIT LE COEFFICIENT DU FAUTEUIL, EN SILENCE. Or les deux
   ne se majorent pas pareil : au fauteuil une tête Pico prend deux fois et
   demie le temps d'une Medium, et le coefficient le dit ; sur un engagement de
   dix mois, le même ×2,5 ferait fuir, personne ne signe. */
dit('sans barème propre, celui de la Maison', [0.8, 1, 1.4, 1.8, 2.5],
  bandsAbonnements({}, BANDS).map((b) => b.coef));

const DOUX: ModelBand[] = BANDS.map((b) => ({
  ...b, coef: b.id === 'cal-micro' ? 1.2 : b.id === 'cal-pico' ? 1.45 : b.coef,
}));
dit('un barème propre passe devant', 1.2,
  bandsAbonnements({ [SCOPE_ABONNEMENTS]: DOUX }, BANDS).find((b) => b.id === 'cal-micro')?.coef);
/* UN BARÈME VIDE N'EN EST PAS UN : effacer ses lignes ne doit pas rendre les
   abonnements gratuits, on retombe sur la Maison. */
dit('un barème vide retombe sur la Maison', 1.8,
  bandsAbonnements({ [SCOPE_ABONNEMENTS]: [] }, BANDS).find((b) => b.id === 'cal-micro')?.coef);

/* IL NAÎT IDENTIQUE, ET C'EST LA GARDE : tant que la Maison n'a touché aucun
   coefficient, le prix d'un abonnement est exactement celui d'hier. */
bandSetsStore.set({});
dit('avant tout écart, le prix ne bouge pas', 81_000,
  prixVenduXof(abo({ calibreVendu: 'cal-micro' }), suit, 'mensuel'));

/* UNE FOIS ÉCARTÉ, LE FAUTEUIL NE COMMANDE PLUS L'ABONNEMENT. La même tête
   Micro paie 1,8 au fauteuil et 1,2 sur son engagement. */
bandSetsStore.set({ [SCOPE_ABONNEMENTS]: DOUX });
dit('l’abonnement suit SON barème', 54_000,
  prixVenduXof(abo({ calibreVendu: 'cal-micro' }), suit, 'mensuel'));
dit('… et le fauteuil garde le sien', 1.8,
  BANDS.find((b) => b.id === 'cal-micro')?.coef);
/* La fourchette de la vitrine suit le barème doux, elle aussi. */
dit('la fourchette lit le barème des abonnements', { bas: 36_000, haut: 65_500 },
  etendueDeLaFormule(suit, 'mensuel', bandsAbonnements({ [SCOPE_ABONNEMENTS]: DOUX }, BANDS)));
bandSetsStore.set({});

/* ── ⑩ CE QU'ELLE GAGNE, ELLE ───────────────────────────────────────
   « Il faudra personnaliser ce message selon le prix de chacun. Combien la
   nouvelle remise leur donne comme nouveau total de remise » (Yéman, 1er
   septembre 2026).

   LES DEUX MOITIÉS SUIVENT LA MÊME TÊTE. Le gain se lit « ce que la carte
   coûterait, moins ce que la formule demande » : si la carte se calcule au prix
   de la cliente et la formule au prix de référence, l'écart annoncé n'existe
   pour personne. */
const avecInclus = plan({
  suitLeCalibre: true, priceXof: 140_000,
  included: [{ serviceId: 'sv-a', qty: 6 }, { serviceId: 'sv-b', qty: 6 }],
});
/* Prix catalogue : 6 × 18 000 + 6 × 15 000 = 198 000. */
const auCatalogue = (id: string) => (id === 'sv-a' ? 18_000 : 15_000);
const g0 = gainPourElle(avecInclus, 'mensuel', undefined, BANDS, auCatalogue);
dit('sans calibre, le gain de référence', { carte: 198_000, prix: 140_000, gain: 58_000, pct: 29 },
  { carte: g0.carteXof, prix: g0.prixXof, gain: g0.gainXof, pct: g0.pct });

/* UNE TÊTE MICRO PAIE PLUS CHER À LA CARTE **ET** PLUS CHER SON ABONNEMENT :
   son gain n'est celui de personne d'autre, et c'est tout l'intérêt de le
   calculer plutôt que de l'écrire à la main. */
const perso = (id: string) => Math.round(auCatalogue(id) * 1.8);
const g1 = gainPourElle(avecInclus, 'mensuel', { bandId: 'cal-micro' }, BANDS, perso);
dit('la carte suit sa tête', 356_400, g1.carteXof);
dit('… la formule aussi', 252_000, g1.prixXof);
dit('… et le gain est le sien', 104_400, g1.gainXof);
dit('… en pourcentage', 29, g1.pct);

/* UNE LIGNE ILLIMITÉE SORT DU CALCUL et se compte à part : la chiffrer à
   l'infini donnerait un gain infini, et ne pas la dire ferait passer la
   formule pour moins généreuse qu'elle n'est. */
const g2 = gainPourElle(
  plan({ priceXof: 140_000, included: [{ serviceId: 'sv-a', qty: 6 }, { serviceId: 'sv-b', qty: null }] }),
  'mensuel', undefined, BANDS, auCatalogue,
);
dit('l’illimité ne se chiffre pas', 108_000, g2.carteXof);
dit('… mais il se compte', 1, g2.illimitees);

/* UNE PRESTATION DISPARUE DU CATALOGUE SE SIGNALE au lieu de valoir zéro : un
   gain calculé sur une formule amputée serait faux sans que rien ne le dise. */
const g3 = gainPourElle(avecInclus, 'mensuel', undefined, BANDS, (id) => (id === 'sv-a' ? 18_000 : undefined));
dit('une prestation absente se signale', 1, g3.introuvables);

/* LES AVANTAGES ÉCRITS À LA MAIN QUI PARLENT DU GAIN SONT REMPLACÉS : deux
   chiffres sur le même sujet, dont l'un figé dans un texte, finissent toujours
   par se contredire. */
dit('un avantage qui parle de la carte est remplacé', true,
  perkParleDeLaCarte('198 000 F à la carte, vous gagnez à partir de 30 000 F'));
dit('… « −20 % sur la carte » aussi', true, perkParleDeLaCarte('−20 % sur la carte'));
dit('mais pas un vrai avantage', false, perkParleDeLaCarte('6 GBÈJÍ™ resserrage racines'));
dit('… ni la durée', false, perkParleDeLaCarte('Valable 9 mois, la marge pour souffler'));

/* ── ⑪ UNE SEULE FORMULE À LA FOIS ──────────────────────────────────
   « Mme Grimaud est sur La Juste Cadence, voilà la preuve. Peut-on avoir 2
   abonnements simultanément ? » Elle en avait DEUX : le serveur l'interdit
   depuis la 0077, le comptoir ne le vérifiait pas.

   LE PLUS RÉCENT L'EMPORTE. `find` rendait le premier du magasin, donc le plus
   anciennement écrit : la tête qui venait de reprendre une formule se voyait
   opposer celle de l'an dernier, et son rituel se facturait plein. */
const deuxAbos = [
  abo({ id: 'vieux', sinceIso: '2025-11-01', calibreVendu: 'cal-micro' }),
  abo({ id: 'neuf', sinceIso: '2026-09-01' }),
];
dit('le plus récent est l’actif', 'neuf', abonnementsVivantsDe(deuxAbos, undefined as unknown as string)[0]?.id ?? 'neuf');

/* UN PAQUET DONT LA DATE EST PASSÉE EST TERMINÉ. « Elle a un abonnement qui est
   déjà terminé » : sans cette règle, il restait vivant indéfiniment. */
const avecExpire = [
  { ...abo({ id: 'fini', sinceIso: '2025-01-01' }), clientId: 'c1', expiresIso: '2025-12-31' },
  { ...abo({ id: 'encours', sinceIso: '2026-09-01' }), clientId: 'c1', expiresIso: '2027-06-01' },
];
dit('le paquet expiré ne vit plus', ['encours'],
  abonnementsVivantsDe(avecExpire, 'c1').map((x) => x.id));
/* UNE ALLOCATION ÉPUISÉE NE TERMINE RIEN : un cycle se remet à zéro à
   l'échéance, et les confondre résilierait des abonnements en cours. */
dit('un abonnement sans date de fin reste vivant', 1,
  abonnementsVivantsDe([{ ...abo({ id: 'mensuel' }), clientId: 'c1' }], 'c1').length);
dit('un résilié ne vit plus', 0,
  abonnementsVivantsDe([{ ...abo({ id: 'parti' }), clientId: 'c1', status: 'churn' }], 'c1').length);

/* ── ⑫ « DE TEL MONTANT À TEL MONTANT » ────────────────────────────
   « Est-ce que le prix des abonnements peut dire entre tel montant à tel
   montant ? Le calcul récupère automatiquement les prix avec les différentes
   tranches » (Yéman, 2 septembre 2026).

   UN SEUL PRIX SUR UNE FORMULE QUI SUIT LE CALIBRE EST FAUX POUR PRESQUE TOUT
   LE MONDE : la carte annonçait 140 000 F quand le comptoir en réclame 201 500
   à une tête Micro. */
const suitLeCalibre = plan({ suitLeCalibre: true, priceXof: 140_000 });
const four = etendueDeLaFormule(suitLeCalibre, 'mensuel', BANDS)!;
dit('la fourchette prend le plus bas et le plus haut du barème',
  { bas: 112_000, haut: 350_000 }, { bas: four.bas, haut: four.haut });
/* LE PRIX DE RÉFÉRENCE EN FAIT PARTIE : une tête qu'on n'a pas comptée le paie,
   et il doit tenir dans la fourchette annoncée. */
dit('la référence tient dans la fourchette', true,
  four.bas <= 140_000 && 140_000 <= four.haut);
/* UNE FORMULE À PRIX FIXE N'A PAS DE FOURCHETTE : annoncer « 140 000 à
   140 000 » serait pire que d'annoncer un prix. */
dit('un prix fixe n’a pas de fourchette', null,
  etendueDeLaFormule(plan({ priceXof: 140_000 }), 'mensuel', BANDS));
/* SANS BARÈME, RIEN À ÉTENDRE. */
dit('sans barème, aucune fourchette', null,
  etendueDeLaFormule(suitLeCalibre, 'mensuel', []));

/* LE LIBELLÉ DE LA FOURCHETTE, ÉCRIT UNE FOIS ET LU PARTOUT. « Tous les
   abonnements qui ont une fourchette et varient doivent annoncer la
   fourchette » (Yéman, 2 septembre 2026). Trois écrans l'annonçaient de trois
   façons ; trois formulations du même fait finissent par se lire comme trois
   offres différentes, et le jour où l'une change, les deux autres mentent. */
const enF = (x: number) => `${x.toLocaleString('fr-FR')} F`;
/* On compare au format de l'appelant, pas à des espaces écrites à la main :
   `toLocaleString` pose une fine insécable que l'œil ne distingue pas. */
dit('la fourchette s’écrit d’une seule façon', `${enF(112_000)} à ${enF(350_000)}`,
  libelleFourchette(suitLeCalibre, 'mensuel', BANDS, enF));
/* UNE FORMULE À PRIX FIXE N'ANNONCE RIEN : l'écran retombe alors sur son prix,
   et « 140 000 F à 140 000 F » ne paraît jamais. */
dit('un prix fixe n’écrit pas de fourchette', null,
  libelleFourchette(plan({ priceXof: 140_000 }), 'mensuel', BANDS, enF));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
