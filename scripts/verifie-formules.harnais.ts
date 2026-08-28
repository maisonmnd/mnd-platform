/* LES FORMULES DE LA MAISON, ÉPROUVÉES — cohérence des onze formules
   marketing et des six packs annuels. Lancé par `node scripts/verifie-formules.mjs`.

   Une formule fausse ne plante pas : elle se vend. Elle part au comptoir, une
   tête la paie, et l'erreur ne se découvre qu'au moment de compter. Ce harnais
   tient donc ce qu'aucun écran ne rattrape : les prix annoncés dans les
   avantages, l'écart de remise qui pousse à monter d'un cran, et le seuil au
   delà duquel le paiement se découpe. */
import { PLANS_MARKETING, PACKS_ANNUELS, FAMILLES_FORMULES } from '../src/apps/trone/routes/equipe/data';
import { SEUIL_ECHELONNEMENT_XOF, peutEtreEchelonne } from '../src/shared/echeancier';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* Les prix du catalogue sur lesquels toutes les remises ont été calculées.
   Si la Maison les change, ce harnais tombe — et c'est le but : une remise
   qu'on ne peut plus justifier au comptoir se retourne contre la Maison. */
const CARTE = { resserrage: 25_000, lavage: 20_000, soin: 20_000 };
const prixCarte = (r: number, l: number, s = 0) =>
  r * CARTE.resserrage + l * CARTE.lavage + s * CARTE.soin;

const par = (id: string) => PLANS_MARKETING.find((p) => p.id === id);

/* ── ① AUCUN DOUBLON D'IDENTIFIANT ─────────────────────────────────
   Deux formules de même id : la seconde ne serait jamais posée, en silence. */
dit('onze formules', 11, PLANS_MARKETING.length);
dit('… toutes d’identifiant unique', 11, new Set(PLANS_MARKETING.map((p) => p.id)).size);
dit('… et de nom unique', 11, new Set(PLANS_MARKETING.map((p) => p.name)).size);
dit('six packs annuels', 6, PACKS_ANNUELS.length);

/* ── ② CHAQUE FORMULE A UN PRIX ET UNE PROMESSE ────────────────────
   Un prix à zéro se vend zéro ; une formule sans promesse ne se dit pas. */
dit('aucun prix nul', [], PLANS_MARKETING.filter((p) => p.priceXof <= 0).map((p) => p.id));
dit('aucune promesse vide', [], PLANS_MARKETING.filter((p) => !p.line.trim()).map((p) => p.id));
dit('aucune formule sans avantages', [], PLANS_MARKETING.filter((p) => p.perks.length === 0).map((p) => p.id));

/* ── ③ UN PACK A TOUJOURS UNE DURÉE DE VIE ─────────────────────────
   Sans `validityDays`, un paquet de crédits ne s'épuise jamais : la tête
   pourrait revenir cinq ans plus tard réclamer son sixième resserrage. */
const packs = PLANS_MARKETING.filter((p) => p.mode === 'pack');
dit('sept paquets de crédits', 7, packs.length);
dit('… tous avec une durée de vie', [], packs.filter((p) => !p.validityDays).map((p) => p.id));
dit('… les Années durent douze mois', [365, 365, 365, 365, 365, 365], PACKS_ANNUELS.map((p) => p.validityDays));

/* ── ④ LES PRIX À LA CARTE ANNONCÉS SONT VRAIS ─────────────────────
   Chaque pack annuel écrit son prix à la carte dans ses avantages. Ce chiffre
   part au comptoir : s'il ment, la cliente le découvre en additionnant. */
const verifie = (id: string, r: number, l: number, s: number, carte: number, pack: number) => {
  const p = par(id)!;
  dit(`${p.name} · le prix à la carte annoncé est juste`, carte, prixCarte(r, l, s));
  dit(`${p.name} · le prix du pack`, pack, p.priceXof);
  dit(`${p.name} · le gain annoncé`, carte - pack, Number(p.perks.join(' ').match(/gagnez ([\d\s ]+) F/)?.[1].replace(/\D/g, '')));
};
verifie('pl-mkt-annee-sereine-duo', 6, 6, 0, 270_000, 215_000);
verifie('pl-mkt-annee-sereine-trio', 6, 6, 6, 390_000, 305_000);
verifie('pl-mkt-annee-fraiche-duo', 6, 12, 0, 390_000, 310_000);
verifie('pl-mkt-annee-fraiche-trio', 6, 12, 6, 510_000, 395_000);
verifie('pl-mkt-annee-nette-duo', 8, 8, 0, 360_000, 285_000);
verifie('pl-mkt-annee-nette-trio', 8, 8, 8, 520_000, 405_000);

/* ── ⑤ LE TRIO GAGNE TOUJOURS PLUS QUE SON DUO ─────────────────────
   Sans cet écart, rien ne pousse à monter d'un cran : la tête resterait au
   Duo, et le soin ne se vendrait jamais. Même règle que le Foyer à trois. */
const paires: [string, string][] = [
  ['pl-mkt-annee-sereine-duo', 'pl-mkt-annee-sereine-trio'],
  ['pl-mkt-annee-fraiche-duo', 'pl-mkt-annee-fraiche-trio'],
  ['pl-mkt-annee-nette-duo', 'pl-mkt-annee-nette-trio'],
];
dit('le Trio remise toujours davantage que son Duo', [true, true, true],
  paires.map(([d, t]) => (par(t)!.discountPct ?? 0) > (par(d)!.discountPct ?? 0)));
dit('le Foyer à trois remise plus qu’à deux', true,
  (par('pl-mkt-foyer3')!.discountPct ?? 0) > (par('pl-mkt-foyer2')!.discountPct ?? 0));

/* ── ⑥ AUCUNE REMISE NE DÉRAPE ─────────────────────────────────────
   Au-delà de 25 %, la remise cesse d'être un remerciement et devient un prix :
   celui que la tête réclamera ensuite à la carte. Le Foyer fait exception, il
   se compare à PLUSIEURS abonnements, pas à un seul. */
const horsFoyer = PLANS_MARKETING.filter((p) => !p.id.startsWith('pl-mkt-foyer'));
dit('aucune remise au-delà de 25 % hors Foyer', [],
  horsFoyer.filter((p) => (p.discountPct ?? 0) > 25).map((p) => p.id));
dit('aucune remise négative', [], PLANS_MARKETING.filter((p) => (p.discountPct ?? 0) < 0).map((p) => p.id));

/* ── ⑦ LES ANNÉES S'OUVRENT TOUTES AU PAIEMENT DÉCOUPÉ ─────────────
   C'est ce qui les rend vendables : personne ne sort 405 000 F d'un coup. Si
   un prix passait un jour sous le seuil, l'offre de découpe disparaîtrait de
   l'écran SANS RIEN DIRE — d'où cette vérification. */
dit('toutes les Années dépassent le seuil de découpe', [true, true, true, true, true, true],
  PACKS_ANNUELS.map((p) => peutEtreEchelonne(p.priceXof)));
dit('… et le seuil est bien celui de la Maison', 100_000, SEUIL_ECHELONNEMENT_XOF);
dit('Le Carnet des Six aussi', true, peutEtreEchelonne(par('pl-mkt-carnet')!.priceXof));
dit('Le Lavage du Mois, lui, ne se découpe pas', false, peutEtreEchelonne(par('pl-mkt-lavage')!.priceXof));

/* ── ⑧ LES QUOTAS DISENT CE QUE LA PROMESSE PROMET ─────────────────
   Un avantage qui annonce « 6 resserrages » et un quota qui en pose 4 : la
   tête réclamerait son sixième et la Maison aurait tort. */
const quota = (id: string, serviceId: string) =>
  par(id)!.included?.find((i) => i.serviceId === serviceId)?.qty ?? 0;
dit('L’Année Fraîche donne douze lavages', 12, quota('pl-mkt-annee-fraiche-duo', 'sv-bain-vapeur'));
dit('… et six resserrages', 6, quota('pl-mkt-annee-fraiche-duo', 'sv-resserrage'));
dit('L’Année Nette en donne huit', 8, quota('pl-mkt-annee-nette-duo', 'sv-resserrage'));
dit('un Duo n’inclut aucun soin', 0, quota('pl-mkt-annee-sereine-duo', 'zebpkpg6ar'));
dit('un Trio en inclut', 6, quota('pl-mkt-annee-sereine-trio', 'zebpkpg6ar'));

/* ── ⑨ UNE SEULE FORMULE VEDETTE ───────────────────────────────────
   La carte indigo perd son sens s'il y en a plusieurs. */
dit('une seule vedette', 1, PLANS_MARKETING.filter((p) => p.popular).length);

/* ── ⑩ LE PARCOURS EST COMPLET ─────────────────────────────────────
   Une formule sans famille tomberait dans « Les autres formules », en fin
   d'écran : posée par la Maison mais rangée comme une orpheline. L'écran ne
   dirait rien, elle serait juste au mauvais endroit — c'est exactement le
   genre d'erreur qu'aucun clic ne révèle. */
const familles = new Set(FAMILLES_FORMULES.map((f) => f.k));
dit('quatre moments dans le parcours', ['prolongement', 'porte', 'foyer', 'annees'],
  FAMILLES_FORMULES.map((f) => f.k));
dit('aucune formule marketing sans moment', [],
  PLANS_MARKETING.filter((p) => !p.famille).map((p) => p.id));
dit('… et aucun moment inconnu', [],
  PLANS_MARKETING.filter((p) => p.famille && !familles.has(p.famille)).map((p) => p.id));

const combien = (k: string) => PLANS_MARKETING.filter((p) => p.famille === k).length;
dit('le prolongement en porte deux', 2, combien('prolongement'));
dit('la porte d’entrée, une', 1, combien('porte'));
dit('le foyer, deux', 2, combien('foyer'));
dit('les Années, six', 6, combien('annees'));
dit('… et le compte est bon', 11, combien('prolongement') + combien('porte') + combien('foyer') + combien('annees'));

/* Les six Années sont bien celles de la famille « annees », et pas l'inverse :
   deux listes qui se recoupent finissent toujours par diverger. */
dit('PACKS_ANNUELS est exactement la famille des Années',
  PACKS_ANNUELS.map((p) => p.id).sort(),
  PLANS_MARKETING.filter((p) => p.famille === 'annees').map((p) => p.id).sort());

/* Chaque moment sait se dire : un titre sans phrase laisse l'écran muet. */
dit('chaque moment porte son titre et sa phrase', [],
  FAMILLES_FORMULES.filter((f) => !f.titre.trim() || !f.quand.trim() || !f.sous.trim()).map((f) => f.k));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
