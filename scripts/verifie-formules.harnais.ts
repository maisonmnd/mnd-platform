/* LES FORMULES DE LA MAISON, ÉPROUVÉES — cohérence des onze formules
   marketing et des six packs annuels. Lancé par `node scripts/verifie-formules.mjs`.

   Une formule fausse ne plante pas : elle se vend. Elle part au comptoir, une
   tête la paie, et l'erreur ne se découvre qu'au moment de compter. Ce harnais
   tient donc ce qu'aucun écran ne rattrape : les prix annoncés dans les
   avantages, l'écart de remise qui pousse à monter d'un cran, et le seuil au
   delà duquel le paiement se découpe. */
import { PLANS_MARKETING, PACKS_ANNUELS, FAMILLES_FORMULES } from '../src/apps/trone/routes/equipe/data';
import { formuleLaPlusUtile, prixDeLaFormule, partMensuelleDeLaFormule, moisDuPack, valeurALaCarte, remiseSurLaCarte, type Plan } from '../src/shared/abonnements';
import { SEUIL_ECHELONNEMENT_XOF, peutEtreEchelonne } from '../src/shared/echeancier';
import { CARTE_DEFAUT, carteReglages, gardeSurLaCarte, directionDuGlisse, indexSuivant, SEUIL_GLISSE, wifiPayload } from '../src/shared/bridges';

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
dit('douze formules', 12, PLANS_MARKETING.length);
dit('… toutes d’identifiant unique', 12, new Set(PLANS_MARKETING.map((p) => p.id)).size);
dit('… et de nom unique', 12, new Set(PLANS_MARKETING.map((p) => p.name)).size);
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
dit('huit paquets de crédits', 8, packs.length);
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
/* L'ÉCLOSION : six resserrages + six lavages = 270 000 F de rythme, dont deux
   mois offerts sur douze — 270 000 × 10/12 = 225 000 F. Les deux retouches
   post-création viennent en plus, offertes, et n'entrent donc pas au compte. */
verifie('pl-mkt-eclosion', 6, 6, 0, 270_000, 225_000);
dit('L’Éclosion offre bien deux mois sur douze', 225_000, Math.round(270_000 * 10 / 12));
dit('… et ses retouches sont un quota, pas un prix', 2,
  par('pl-mkt-eclosion')!.included?.find((i) => i.serviceId === 'sv-retouches-post-creation')?.qty);
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

/* ── ⑨ UNE VEDETTE PAR MOMENT, PAS UNE POUR TOUT ───────────────────
   « Chaque moment du parcours doit avoir sa mise en vedette. Pas une seule
   mise en vedette pour toutes les offres » (Yéman, 28 août).

   La règle d'origine était « une seule vedette dans la Maison » : mettre
   L'Éclosion en avant éteignait La Suite, et un moment entier se retrouvait
   sans carte indigo. La vedette ne compare pas les douze formules entre
   elles — elle dit, DANS SON MOMENT, celle qu'on propose en premier.

   La carte indigo garde son sens tant qu'elle est SEULE DANS SA SECTION :
   c'est là que l'œil compare. Deux vedettes dans un même moment, et la mise
   en avant ne veut plus rien dire. */
const vedettesParMoment = FAMILLES_FORMULES.map(
  (f) => PLANS_MARKETING.filter((p) => p.famille === f.k && p.popular).length,
);
dit('chaque moment a SA vedette', [1, 1, 1, 1, 1], vedettesParMoment);
dit('… jamais deux dans le même moment', [],
  FAMILLES_FORMULES.filter((f) => PLANS_MARKETING.filter((p) => p.famille === f.k && p.popular).length > 1)
    .map((f) => f.k));
dit('cinq vedettes en tout, une par moment', 5, PLANS_MARKETING.filter((p) => p.popular).length);

/* ── ⑩ LE PARCOURS EST COMPLET ─────────────────────────────────────
   Une formule sans famille tomberait dans « Les autres formules », en fin
   d'écran : posée par la Maison mais rangée comme une orpheline. L'écran ne
   dirait rien, elle serait juste au mauvais endroit — c'est exactement le
   genre d'erreur qu'aucun clic ne révèle. */
const familles = new Set(FAMILLES_FORMULES.map((f) => f.k));
dit('cinq moments dans le parcours', ['naissance', 'prolongement', 'porte', 'foyer', 'annees'],
  FAMILLES_FORMULES.map((f) => f.k));
dit('aucune formule marketing sans moment', [],
  PLANS_MARKETING.filter((p) => !p.famille).map((p) => p.id));
dit('… et aucun moment inconnu', [],
  PLANS_MARKETING.filter((p) => p.famille && !familles.has(p.famille)).map((p) => p.id));

const combien = (k: string) => PLANS_MARKETING.filter((p) => p.famille === k).length;
/* LA NAISSANCE N'A AUCUNE FORMULE SIGNÉE, et c'est voulu : le forfait qui
   l'occupe est celui de la Maison (VÈKPÈ™ + les premiers entretiens), pas un
   des onze. La section reste vide tant qu'il n'y est pas rangé, et une
   section vide ne s'affiche pas. */
/* L'ÉCLOSION occupe la naissance : le moment n'est plus une section vide. */
dit('la naissance porte L’Éclosion', 1, combien('naissance'));
dit('le prolongement en porte deux', 2, combien('prolongement'));
dit('la porte d’entrée, une', 1, combien('porte'));
dit('le foyer, deux', 2, combien('foyer'));
dit('les Années, six', 6, combien('annees'));
dit('… et le compte est bon', 12, combien('naissance') + combien('prolongement') + combien('porte') + combien('foyer') + combien('annees'));

/* Les six Années sont bien celles de la famille « annees », et pas l'inverse :
   deux listes qui se recoupent finissent toujours par diverger. */
dit('PACKS_ANNUELS est exactement la famille des Années',
  PACKS_ANNUELS.map((p) => p.id).sort(),
  PLANS_MARKETING.filter((p) => p.famille === 'annees').map((p) => p.id).sort());

/* Chaque moment sait se dire : un titre sans phrase laisse l'écran muet. */
dit('chaque moment porte son titre et sa phrase', [],
  FAMILLES_FORMULES.filter((f) => !f.titre.trim() || !f.quand.trim() || !f.sous.trim()).map((f) => f.k));



/* ── ⑪ CE QU'ELLE AURAIT GAGNÉ ─────────────────────────────────────
   La phrase qui ouvre la vitrine de Ma Couronne se calcule sur SES rendez-vous.
   Elle part vers la cliente sans que personne la relise : si elle exagère,
   c'est la première facture qui la dément. */
const PLAN_TEST: Plan[] = [
  { id: 'p-suite', name: 'La Suite', tag: '', priceXof: 35_000, line: 'l', perks: [], popular: false,
    mode: 'cycle', included: [{ serviceId: 'res', qty: 1 }, { serviceId: 'lav', qty: 1 }] },
  { id: 'p-lavage', name: 'Le Lavage du Mois', tag: '', priceXof: 15_000, line: 'l', perks: [], popular: false,
    mode: 'cycle', included: [{ serviceId: 'lav', qty: 1 }] },
  { id: 'p-pack', name: 'Un pack', tag: '', priceXof: 125_000, line: 'l', perks: [], popular: false,
    mode: 'pack', validityDays: 365, included: [{ serviceId: 'res', qty: 6 }] },
];
const troisMois = [
  { serviceIds: ['res', 'lav'], netXof: 45_000 },
  { serviceIds: ['res', 'lav'], netXof: 45_000 },
  { serviceIds: ['res', 'lav'], netXof: 45_000 },
];
const sugg = formuleLaPlusUtile({ plans: PLAN_TEST, rituels: troisMois, moisObserves: 3 });
dit('la meilleure formule est La Suite', 'La Suite', sugg?.plan.name);
dit('… elle a dépensé 135 000', 135_000, sugg?.depenseXof);
dit('… La Suite lui aurait coûté 105 000', 105_000, sugg?.auraitCouteXof);
dit('… elle aurait donc gagné 30 000', 30_000, sugg?.economieXof);

/* UN RITUEL À MOITIÉ COUVERT NE COMPTE PAS : « Le Lavage du Mois » n'inclut
   pas le resserrage, ces rituels-là ne lui sont donc pas comparables. */
const seulLavage = formuleLaPlusUtile({
  plans: [PLAN_TEST[1]], rituels: troisMois, moisObserves: 3,
});
dit('un rituel à moitié couvert ne compte pas', null, seulLavage);

/* Une formule qui ne fait rien gagner ne se propose pas : une suggestion à
   économie nulle serait un mensonge poli. */
dit('aucune suggestion quand rien n’est gagné', null, formuleLaPlusUtile({
  plans: PLAN_TEST, rituels: [{ serviceIds: ['res', 'lav'], netXof: 20_000 }], moisObserves: 3,
}));
dit('aucune suggestion sans rituel', null,
  formuleLaPlusUtile({ plans: PLAN_TEST, rituels: [], moisObserves: 3 }));

/* LES PACKS NE SE COMPARENT PAS SUR TROIS MOIS : jugé sur une fenêtre courte,
   un paquet annuel paraîtrait ruineux et ne serait jamais propose. */
dit('un pack n’entre pas dans la comparaison courte', null, formuleLaPlusUtile({
  plans: [PLAN_TEST[2]], rituels: [{ serviceIds: ['res'], netXof: 25_000 }], moisObserves: 3,
}));

/* ── ⑫ LA CARTE DU COMPTOIR ────────────────────────────────────────
   L'écran est public et sans surveillance : ce qu'il montre PAR DÉFAUT compte
   autant que ce qu'on peut lui cacher. */

/* L'ABSENCE VAUT « TOUT MONTRER », JAMAIS « RIEN ». Une Maison d'avant ce
   réglage n'a rien en base : si le défaut était de masquer, sa carte
   s'ouvrirait vide et personne ne saurait pourquoi. */
dit('sans réglage, les trois volets sont ouverts', [true, true, true],
  [carteReglages(undefined).rituels, carteReglages(undefined).formules, carteReglages(undefined).produits]);
dit('… et rien n’est masqué', [[], [], []], [
  carteReglages(null).servicesMasques,
  carteReglages(null).formulesMasquees,
  carteReglages(null).produitsMasques,
]);
dit('… les formules défilent par défaut', true, carteReglages({}).defileFormules);
dit('… neuf secondes, le temps de lire', 9, CARTE_DEFAUT.secondesParFormule);

/* UN DÉFILEMENT À ZÉRO SECONDE FERAIT CLIGNOTER L'ÉCRAN. On borne à ce qu'un
   œil peut suivre, plutôt que de faire confiance à la saisie. */
dit('un défilement trop bref est ramené à trois secondes', 3,
  carteReglages({ carte: { secondesParFormule: 0 } }).secondesParFormule);
dit('… et un trop long, à soixante', 60,
  carteReglages({ carte: { secondesParFormule: 9999 } }).secondesParFormule);

/* UN VOLET S'ÉTEINT VRAIMENT : `false` doit passer, là où un simple `??`
   l'aurait confondu avec l'absence et rallumé le volet. */
dit('un volet éteint le reste', false, carteReglages({ carte: { produits: false } }).produits);
dit('… sans éteindre les autres', [true, true],
  [carteReglages({ carte: { produits: false } }).rituels, carteReglages({ carte: { produits: false } }).formules]);

/* ON MASQUE, ON NE SÉLECTIONNE PAS : ce qui n'est pas nommé reste visible,
   donc une nouveauté paraît d'elle-même. */
const troisChoses = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
dit('sans masque, tout passe', ['a', 'b', 'c'], gardeSurLaCarte(troisChoses, []).map((x) => x.id));
dit('ce qui est masqué sort', ['a', 'c'], gardeSurLaCarte(troisChoses, ['b']).map((x) => x.id));
dit('un masque sur un inconnu ne retire rien', ['a', 'b', 'c'],
  gardeSurLaCarte(troisChoses, ['zzz']).map((x) => x.id));
dit('tout masquer laisse une carte vide, sans planter', [],
  gardeSurLaCarte(troisChoses, ['a', 'b', 'c']).map((x) => x.id));

/* ── ⑬ LE GLISSEMENT ───────────────────────────────────────────────
   « Je préfère swiper et aller au suivant et revenir en arrière à ma
   convenance » (Yéman). Deux pièges se tiennent là, et aucun ne se voit à
   l'œil : le tremblement pris pour un geste, et le défilement vertical pris
   pour un changement de formule. */

/* LE MOUVEMENT VERTICAL NE COMPTE PAS. La carte défile de haut en bas : sans
   cette garde, chaque coup de pouce ferait sauter une formule et personne ne
   comprendrait pourquoi l'écran bouge tout seul. */
dit('un défilement vertical ne change rien', 0, directionDuGlisse(30, 200));
dit('… même large, s’il est plus haut que large', 0, directionDuGlisse(100, 160));
dit('un geste franchement horizontal compte', 1, directionDuGlisse(-120, 20));

/* Un doigt qui va vers la GAUCHE tire la suivante vers soi. */
dit('vers la gauche, on avance', 1, directionDuGlisse(-90, 0));
dit('vers la droite, on revient', -1, directionDuGlisse(90, 0));

/* UN TREMBLEMENT N'EST PAS UN GESTE : sous le seuil, l'écran ne bouge pas. */
dit('sous le seuil, rien ne bouge', 0, directionDuGlisse(-20, 0));
dit('le seuil vaut quarante-huit pixels', 48, SEUIL_GLISSE);
/* AU SEUIL EXACT, LE GESTE COMPTE. Sur un écran tactile la version indulgente
   est la bonne : un doigt qui a franchement parcouru la distance demandée ne
   doit pas se voir refuser pour un pixel. */
dit('un pixel sous le seuil, rien', 0, directionDuGlisse(-47, 0));
dit('au seuil exact, le geste compte', 1, directionDuGlisse(-48, 0));
dit('un geste nul ne fait rien', 0, directionDuGlisse(0, 0));

/* L'INDEX BOUCLE : un écran de comptoir n'a pas de fin, et buter sur un bord
   donnerait l'impression qu'il est cassé. */
dit('après la dernière revient la première', 0, indexSuivant(4, 5, 1));
dit('avant la première vient la dernière', 4, indexSuivant(0, 5, -1));
dit('au milieu, on avance simplement', 3, indexSuivant(2, 5, 1));
dit('un sens nul ne déplace rien', 2, indexSuivant(2, 5, 0));
dit('une liste vide ne plante pas', 0, indexSuivant(0, 0, 1));

/* ── ⑭ LE WI-FI DE LA CARTE ────────────────────────────────────────
   Éteint par défaut : allumer publie le mot de passe dans un document lisible
   sans compte, et ce choix appartient à la Maison, pas au code. */
dit('le volet wifi est éteint par défaut', false, CARTE_DEFAUT.wifi);
dit('… et sans réseau posé', ['', '', '', ''],
  [CARTE_DEFAUT.wifiSsid, CARTE_DEFAUT.wifiPass, CARTE_DEFAUT.wifi2Ssid, CARTE_DEFAUT.wifi2Pass]);
dit('un réseau posé se retrouve', 'MND-Invite',
  carteReglages({ carte: { wifi: true, wifiSsid: 'MND-Invite' } }).wifiSsid);
dit('… et le volet reste allumable', true, carteReglages({ carte: { wifi: true } }).wifi);

/* ── ⑮ LE CARRÉ WI-FI ──────────────────────────────────────────────
   Le mot de passe ne s'affiche plus à l'écran — « le QR code suffit » (Yéman).
   Tout repose donc sur le carré : s'il est mal formé, plus rien ne connecte,
   et la panne est MUETTE. Le téléphone dit seulement « impossible de
   rejoindre », jamais pourquoi.

   LE PIÈGE EST L'ÉCHAPPEMENT. Le format réserve `;` `:` `,` `"` et
   l'antislash : un mot de passe qui en porte un couperait la chaîne, et le
   carré viserait un réseau au nom tronqué. C'est le genre de panne qu'on met
   un mois à comprendre, parce qu'elle ne touche qu'une Maison sur vingt. */
dit('un réseau simple se code', 'WIFI:T:WPA;S:MND-Invite;P:RootsCare2026;;',
  wifiPayload('MND-Invite', 'RootsCare2026'));
dit('un point-virgule dans le mot de passe est échappé',
  'WIFI:T:WPA;S:MND;P:abc' + String.fromCharCode(92) + ';def;;',
  wifiPayload('MND', 'abc;def'));
dit('deux-points aussi', 'WIFI:T:WPA;S:MND' + String.fromCharCode(92) + ':5G;P:x;;',
  wifiPayload('MND:5G', 'x'));
dit('… et l’antislash lui-même',
  'WIFI:T:WPA;S:MND;P:a' + String.fromCharCode(92, 92) + 'b;;',
  wifiPayload('MND', 'a' + String.fromCharCode(92) + 'b'));
dit('le mot de passe est bien DANS le carré, cacher n’est pas retirer', true,
  wifiPayload('MND', 'RootsCare2026').includes('RootsCare2026'));

/* ── ⑯ UN PAQUET NE SE MULTIPLIE PAS ───────────────────────────────
   « L'Éclosion est un abonnement annuel, pourquoi c'est écrit prix mensuel ?
   De même pour tous les autres abonnements à l'année » (Yéman, 28 août).

   L'écran appliquait la règle des cycles — 5 mois payés sur 6, 10 sur 12 — à
   TOUT, paquets compris. L'Éclosion, 225 000 F pour douze mois, s'affichait
   « 225 000 F /mois » en vue mensuelle et se serait affichée 2 250 000 F en
   vue annuelle. Le prix d'un paquet est son prix, entier, une fois. */
const eclosion = par('pl-mkt-eclosion')!;
dit('un paquet garde son prix en vue mensuelle', 225_000, prixDeLaFormule(eclosion, 'mensuel').montantXof);
dit('… et en vue annuelle aussi', 225_000, prixDeLaFormule(eclosion, 'annuel').montantXof);
dit('… et en vue semestrielle', 225_000, prixDeLaFormule(eclosion, 'semestriel').montantXof);
dit('il dit sa durée, pas « par mois »', '· 12 mois', prixDeLaFormule(eclosion, 'mensuel').periode);
dit('… et le formulaire dit le mot juste', 'Prix du paquet', prixDeLaFormule(eclosion, 'mensuel').libelle);
dit('un paquet n’offre pas de mois : il n’a pas de cycle', '', prixDeLaFormule(eclosion, 'annuel').offert);

/* UN ABONNEMENT, LUI, SUIT BIEN LA RÈGLE DES CYCLES. */
const suite = par('pl-mkt-suite')!;
dit('un abonnement mensuel vaut son prix', 35_000, prixDeLaFormule(suite, 'mensuel').montantXof);
dit('… annuel, dix mois payés sur douze', 350_000, prixDeLaFormule(suite, 'annuel').montantXof);
dit('… et il annonce ses deux mois offerts', '2 mois offerts', prixDeLaFormule(suite, 'annuel').offert);
dit('… avec le mot juste au formulaire', 'Prix mensuel', prixDeLaFormule(suite, 'mensuel').libelle);

/* LE MRR NE MENT PAS. Un paquet de 225 000 F sur douze mois pèse 18 750 F par
   mois : le compter entier gonflerait le revenu récurrent du mois de la
   signature, puis il disparaîtrait des mois suivants. */
dit('un paquet pèse sa part mensuelle', 18_750, partMensuelleDeLaFormule(eclosion, 'mensuel'));
dit('… quelle que soit la vue choisie', 18_750, partMensuelleDeLaFormule(eclosion, 'annuel'));
dit('un abonnement annuel pèse dix mois sur douze', 29_167, partMensuelleDeLaFormule(suite, 'annuel'));
dit('… et le mensuel, son prix', 35_000, partMensuelleDeLaFormule(suite, 'mensuel'));

/* LA DURÉE SE LIT SUR LE PAQUET, jamais supposée à douze mois. */
dit('les Années durent douze mois', 12, moisDuPack(eclosion));
dit('un paquet sans durée retombe sur douze', 12,
  moisDuPack({ ...suite, mode: 'pack', validityDays: undefined } as Plan));
dit('un paquet de six mois le dit', 6,
  moisDuPack({ ...suite, mode: 'pack', validityDays: 180 } as Plan));

/* ── ⑰ LE TOTAL À LA CARTE, SOUS LES YEUX ──────────────────────────
   « J'ai besoin de voir le calcul se faire dès que je choisis des services.
   Un total pour me situer » (Yéman, 28 août). Le prix d'une formule ne se
   décide pas dans le vide : il se décide CONTRE la carte. */
const carte = (id: string): number | undefined =>
  ({ res: 25_000, lav: 20_000, soin: 20_000 } as Record<string, number>)[id];

dit('six resserrages et six lavages valent 270 000', 270_000,
  valeurALaCarte([{ serviceId: 'res', qty: 6 }, { serviceId: 'lav', qty: 6 }], carte).totalXof);
dit('… et la remise se chiffre', { gainXof: 45_000, pct: 17 },
  remiseSurLaCarte(270_000, 225_000));

/* UN QUOTA ILLIMITÉ NE SE CHIFFRE PAS, et surtout ne vaut pas zéro : le
   compter pour rien ferait croire à une remise énorme sur une formule qui n'a
   peut-être aucune marge. Il se compte à part, et l'écran le dit. */
const avecInfini = valeurALaCarte([{ serviceId: 'res', qty: 6 }, { serviceId: 'lav', qty: null }], carte);
dit('un quota illimité sort du calcul', 150_000, avecInfini.totalXof);
dit('… et se compte à part', 1, avecInfini.illimitees);

/* UNE PRESTATION ABSENTE DU CATALOGUE se signale plutôt que de valoir zéro :
   sinon la remise annoncée serait fausse sans que rien ne l'indique. */
const avecTrou = valeurALaCarte([{ serviceId: 'res', qty: 2 }, { serviceId: 'disparue', qty: 3 }], carte);
dit('une prestation absente ne vaut pas zéro', 50_000, avecTrou.totalXof);
dit('… elle se signale', 1, avecTrou.introuvables);

/* UNE FORMULE PLUS CHÈRE QUE LA CARTE : le gain devient négatif, et l'écran
   doit le crier plutôt que d'afficher « −11 % de remise ». */
dit('plus chère que la carte, le gain est négatif', -30_000,
  remiseSurLaCarte(270_000, 300_000).gainXof);

/* Les bornes : rien à comparer ne rend rien, jamais une division par zéro. */
dit('sans carte, aucune remise', { gainXof: 0, pct: 0 }, remiseSurLaCarte(0, 225_000));
dit('une liste vide vaut zéro', 0, valeurALaCarte([], carte).totalXof);
dit('une liste absente aussi', 0, valeurALaCarte(undefined, carte).totalXof);

/* LES ONZE FORMULES SIGNÉES tombent juste : L'Éclosion annonce 270 000 F à la
   carte, et ses quotas valent bien 270 000 F. La promesse et le quota se
   vérifient l'un l'autre. */
/* Les retouches sont OFFERTES : absentes du barème, elles ne pèsent rien dans
   la valeur à la carte, exactement comme la promesse l'annonce. */
const carteMaison: Record<string, number> = { 'sv-resserrage': 25_000, 'sv-bain-vapeur': 20_000 };
dit('L’Éclosion vaut ce qu’elle annonce', 270_000,
  valeurALaCarte(par('pl-mkt-eclosion')!.included, (id) => carteMaison[id]).totalXof);


console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
