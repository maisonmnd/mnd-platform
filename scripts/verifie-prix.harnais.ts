/* LE PRIX FERME CONVENU AVEC UNE CLIENTE — il doit primer sur tout.
   Lancé par `node scripts/verifie-prix.mjs`. */
import {
  pricingOf, personalPriceXof, prixFerme, prixFixeDe, isPersonalized,
  ouverteDesVenue, servesBand, estOfferte, prixDansPanier,
  type PersonalPricing,
} from '../src/shared/pricing';
import type { Service } from '../src/shared/catalog';
import type { ModelBand } from '../src/shared/pricing';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const svc = (p: Partial<Service>): Service => ({
  id: 'sv1', categoryId: 'cat', name: 'Reprise', palier: 'Fondation',
  priceXof: 45_000, hidePrice: false, sessions: 1, master: 'Brice',
  durationMin: 60, order: 1, ...p,
} as Service);

/* Un barème de tranches, pour prouver que le prix ferme le traverse. */
const bandes: ModelBand[] = [
  { id: 'cal-mini', label: 'Mini', maxLocks: 280, coef: 1.5, durCoef: 1.5 } as ModelBand,
];

/* ── SANS PRIX FERME — le moteur se comporte comme avant ── */
const nue = pricingOf({ lockCount: 240, priceCoef: 1 }, bandes);
const auLock = svc({ ratePerLock: 100, tarifMode: 'lock' });
dit('tarif au lock : 240 × 100', 24_000, personalPriceXof(auLock, nue));

const coefficient = pricingOf({ lockCount: 240, priceCoef: 0.5 }, bandes);
dit('le Juste Prix module encore', 12_000, personalPriceXof(auLock, coefficient));

/* ── AVEC UN PRIX FERME — il passe AVANT tout le reste ── */
const ferme = pricingOf({ lockCount: 240, priceCoef: 0.5, prixFixes: { sv1: 20_000 } }, bandes);
dit('LE MUR : le prix convenu ignore le tarif au lock', 20_000, personalPriceXof(auLock, ferme));
dit('… et le Juste Prix ne le multiplie PAS', 20_000, personalPriceXof(auLock, ferme));
dit('… il ignore aussi le plancher par calibre', 20_000,
  personalPriceXof(svc({ tarifMode: 'calibre', priceFloors: { 'cal-mini': 90_000 } }), ferme));
dit('… et le prix par longueur', 20_000,
  personalPriceXof(svc({ prixParLongueur: { long: 75_000 } }), { ...ferme, longueur: 'long' } as PersonalPricing));

/* IL NE DÉBORDE PAS SUR LES AUTRES PRESTATIONS. */
const autre = svc({ id: 'sv2', priceXof: 30_000 });
dit('une AUTRE prestation garde son prix', 15_000, personalPriceXof(autre, ferme));

/* ── ZÉRO ET NÉGATIF NE SONT PAS DES PRIX ──
   Un rituel offert se dit « offert » sur le rendez-vous ; le déguiser en prix
   fixe à 0 F ferait disparaître le geste de tous les comptes en silence. */
dit('zéro n’est pas un prix ferme', undefined, prixFixeDe(auLock, pricingOf({ prixFixes: { sv1: 0 } }, bandes)));
dit('un négatif non plus', undefined, prixFixeDe(auLock, pricingOf({ prixFixes: { sv1: -5000 } }, bandes)));
dit('… et le moteur retombe alors sur son calcul', 45_000,
  personalPriceXof(svc({}), pricingOf({ prixFixes: { sv1: 0 } }, [])));

/* ── L'ÉCRAN NE DOIT NI HÉSITER NI REDEMANDER ── */
dit('un prix convenu est FERME (jamais « dès »)', true, prixFerme(auLock, ferme));
dit('sans lui, un tarif au lock sans comptage ne l’est pas', false,
  prixFerme(auLock, pricingOf({ priceCoef: 1 }, [])));

/* ── « UN PRIX FIXE EST FIXE » (11 août) ──
   Un soin sans grille par calibre ni tarif au lock ne dépend de rien
   d'inconnu : son prix est `base × coef × Juste Prix`, au franc près.
   L'écran ne doit NI l'annoncer « dès », NI réclamer un montant. */
const shampoing = svc({ id: 'sv-shp', priceXof: 10_000 }); // ni ratePerLock, ni priceFloors
dit('un soin sans grille est FERME quand le modèle est connu', true,
  prixFerme(shampoing, nue));
dit('… et même sans modèle s’il ne suit pas le modèle', true,
  prixFerme(svc({ id: 'sv-shp2', priceXof: 10_000, scalesWithModel: false }), pricingOf({ priceCoef: 1 }, [])));
dit('… mais PAS s’il suit le modèle et que le modèle est inconnu', false,
  prixFerme(svc({ id: 'sv-shp3', priceXof: 10_000, scalesWithModel: true }), pricingOf({ priceCoef: 1 }, bandes)));
dit('un tarif au lock sans comptage reste non ferme', false,
  prixFerme(svc({ id: 'sv-lock', ratePerLock: 100, tarifMode: 'calibre' }), pricingOf({ priceCoef: 1 }, [])));

/* ── « SUR DEVIS » N'EST JAMAIS FERME (12 août) ──
   Le repli `!scalesWithModel` déclarait ferme une prestation sur devis à 0 F :
   la modale n'ouvrait plus son champ de montant, la Caisse la basculait en
   « fixe » en contournant le garde — rituel réservé ET facturé à 0 F. */
const surDevis = svc({ id: 'sv-devis', priceXof: 0, priceMode: 'devis' });
dit('une prestation sur devis n’est JAMAIS ferme', false, prixFerme(surDevis, nue));
dit('… même sans modèle au dossier', false, prixFerme(surDevis, pricingOf({ priceCoef: 1 }, [])));
dit('… une variable sans grille ni comptage non plus', false,
  prixFerme(svc({ id: 'sv-var', priceXof: 8_000, priceMode: 'variable', scalesWithModel: true }), pricingOf({ priceCoef: 1 }, bandes)));
dit('… mais un prix CONVENU la rend ferme malgré le devis', true,
  prixFerme(surDevis, pricingOf({ prixFixes: { 'sv-devis': 80_000 } }, [])));
dit('l’ancien hidePrice vaut devis (le pont tient)', false,
  prixFerme(svc({ id: 'sv-hid', priceXof: 0, hidePrice: true }), nue));

/* ── UNE GRILLE PAR LONGUEUR REMPLACE LE MODÈLE (WÈWÈ, 11 août) ──
   25 000 F en Mi-Long × coef Nano 2,5 donnait 62 500 F : deux graduations de
   taille empilées. La grille EST la taille de ce soin. */
const grille = svc({
  id: 'sv-wewe', priceXof: 20_000, scalesWithModel: true,
  prixParLongueur: { court: 20_000, 'mi-long': 25_000, long: 30_000 },
});
const nano = pricingOf({ lockCount: 240, priceCoef: 1 }, bandes); // Mini coef 1,5
dit('le prix de la longueur sort AU FRANC PRÈS, coef ignoré', 25_000,
  personalPriceXof(grille, { ...nano, longueur: 'mi-long' } as PersonalPricing));
dit('… le repli sans longueur ignore aussi le coef', 20_000, personalPriceXof(grille, nano));
dit('… le Juste Prix PERSONNEL, lui, s’applique encore', 12_500,
  personalPriceXof(grille, { ...pricingOf({ lockCount: 240, priceCoef: 0.5 }, bandes), longueur: 'mi-long' } as PersonalPricing));
dit('… et la grille rend le prix FERME quel que soit le comptage', true,
  prixFerme(grille, pricingOf({ priceCoef: 1 }, [])));
dit('sans grille, le modèle module comme avant', 30_000,
  personalPriceXof(svc({ id: 'sv-mod', priceXof: 20_000, scalesWithModel: true }), nue));

/* ── LA FICHE PORTE UNE LONGUEUR PAR DÉFAUT (11 août) ──
   Sans elle, Ma Couronne — qui n'a pas de sélecteur — annonçait le prix de
   REPLI à une cliente dont la Maison connaît la longueur. La fiche donne le
   point de départ ; l'écran qui pose la sienne (modale RDV, Caisse) prime. */
dit('la longueur de la fiche donne SON prix', 30_000,
  personalPriceXof(grille, pricingOf({ lockCount: 240, priceCoef: 1, longueur: 'long' }, bandes)));
dit('… celle posée par l’écran PRIME sur la fiche', 20_000,
  personalPriceXof(grille, { ...pricingOf({ lockCount: 240, priceCoef: 1, longueur: 'long' }, bandes), longueur: 'court' } as PersonalPricing));
dit('… une fiche muette retombe sur le repli, comme avant', 20_000,
  personalPriceXof(grille, pricingOf({ lockCount: 240, priceCoef: 1 }, bandes)));

/* ── GBÈJÍ™ FIDÉLITÉ — le forfait à seuil de venues (11 août) ── */
const forfait = svc({
  id: 'sv-forfait', priceXof: 0, forfaitRemisePct: 15, desVenue: 3,
  includes: [{ serviceId: 'sv-a' }, { serviceId: 'sv-b' }],
});
const catalogue = [
  svc({ id: 'sv-a', priceXof: 45_000 }),
  svc({ id: 'sv-b', priceXof: 10_000 }),
  forfait,
];
dit('le forfait vaut sa composition moins 15 %', 46_750,
  personalPriceXof(forfait, pricingOf({ priceCoef: 1 }, []), catalogue));
/* La composition est DÉJÀ au prix de la cliente : (45 000 + 10 000) × 0,5
   = 27 500, moins 15 % = 23 375. Le moteur l'appliquait une SECONDE fois sur
   le résultat (11 687 → 11 500) — attrapé ici, corrigé au moteur. */
dit('… au Juste Prix de la cliente, appliqué UNE seule fois', 23_375,
  personalPriceXof(forfait, pricingOf({ priceCoef: 0.5 }, []), catalogue));

/* ── LES PRODUITS D'UNE COMPOSITION COMPTENT (12 août) ──
   Le moteur les sautait pendant que l'aperçu du Catalogue les comptait :
   annoncé 77 600, encaissé 68 000. Prix ferme, aucune personnalisation. */
const forfaitProd = svc({
  id: 'sv-forfait-prod', priceXof: 0, forfaitRemisePct: 20,
  includes: [{ serviceId: 'sv-a' }, { serviceId: '', productId: 'prod-flacon' }],
});
const gamme = [{ id: 'prod-flacon', priceXof: 10_000 }];
dit('le flacon de la composition entre dans le prix', 44_000,
  personalPriceXof(forfaitProd, pricingOf({ priceCoef: 1 }, []), [...catalogue, forfaitProd], gamme));
dit('… sans la gamme fournie, il est simplement absent', 36_000,
  personalPriceXof(forfaitProd, pricingOf({ priceCoef: 1 }, []), [...catalogue, forfaitProd]));

/* Le seuil : fermé avant 2 venues acquises, ouvert à partir de la 3ᵉ séance. */
dit('fermé à la 1ʳᵉ venue (0 acquise)', false, ouverteDesVenue(forfait, 0));
dit('fermé à la 2ᵉ (1 acquise)', false, ouverteDesVenue(forfait, 1));
dit('OUVERT à la 3ᵉ (2 acquises)', true, ouverteDesVenue(forfait, 2));
dit('sans seuil, ouvert à toutes', true, ouverteDesVenue(svc({}), 0));

/* bandIds — plusieurs calibres explicites (gardé au moteur, non utilisé par
   ce forfait depuis la correction « tous les modèles »). */
dit('bandIds : le calibre listé passe', true,
  servesBand(svc({ bandIds: ['cal-mini', 'cal-x'] }), bandes[0]));
dit('… un calibre absent ne passe pas', false,
  servesBand(svc({ bandIds: ['cal-x'] }), bandes[0]));
dit('… et un modèle INCONNU non plus', false,
  servesBand(svc({ bandIds: ['cal-mini'] }), undefined));

/* ── LA CLIENTE EST « PERSONNALISÉE » PAR SON SEUL PRIX FERME ──
   Sans cela, un rendez-vous retombait sur le prix CATALOGUE et l'accord écrit
   sur la fiche restait lettre morte au moment de s'appliquer. */
dit('ni modèle ni coefficient, mais un prix ferme', true,
  isPersonalized(pricingOf({ priceCoef: 1, prixFixes: { sv1: 20_000 } }, [])));
dit('rien du tout : pas de personnalisation', false,
  isPersonalized(pricingOf({ priceCoef: 1 }, [])));
dit('une table VIDE ne personnalise pas', false,
  isPersonalized(pricingOf({ priceCoef: 1, prixFixes: {} }, [])));

/* ── LE GESTE OFFERT (15 août) ──
   « Quand les Pico et Galaxy font une réservation de repriseOff essentielle ou
   élaborée, le shampoingOff est offert quand il est sélectionné. » La règle
   dépend du PANIER : elle ne se prouve pas prestation par prestation. */
const repriseOff = svc({ id: 'sv-repriseOff', name: 'SÍNSIN Essentielle · La Reprise', priceXof: 60_000 });
const repriseElOff = svc({ id: 'sv-repriseOff-el', name: 'SÍNSIN Élaborée · La Reprise', priceXof: 75_000 });
const soinOff = svc({ id: 'sv-soinOff', name: 'Le Soin', priceXof: 15_000 });
const shampoingOff = svc({
  id: 'sv-shamp', name: 'KƆKLƆ Essentiel · Le Shampoing', priceXof: 10_000,
  offertAvec: { serviceIds: ['sv-repriseOff', 'sv-repriseOff-el'], bandIds: ['cal-picoOff'] },
});
const bandesOff: ModelBand[] = [
  { id: 'cal-miniOff', label: 'Mini', maxLocks: 280, coef: 1, durCoef: 1 } as ModelBand,
  { id: 'cal-picoOff', label: 'Pico', maxLocks: 550, coef: 1, durCoef: 1 } as ModelBand,
];
const picoOff = pricingOf({ lockCount: 527, priceCoef: 1 }, bandesOff);
const miniOff = pricingOf({ lockCount: 240, priceCoef: 1 }, bandesOff);

dit('Pico + reprise essentielle : le shampoing est offert', true,
  estOfferte(shampoingOff, picoOff, [shampoingOff, repriseOff]));
dit('… et il vaut 0 F dans ce rituel', 0,
  prixDansPanier(shampoingOff, picoOff, [shampoingOff, repriseOff]));
dit('la reprise, elle, garde son prix', 60_000,
  prixDansPanier(repriseOff, picoOff, [shampoingOff, repriseOff]));
dit('reprise ÉLABORÉE : offert aussi', true,
  estOfferte(shampoingOff, picoOff, [shampoingOff, repriseElOff]));
dit('shampoing SEUL : il se paie', 10_000,
  prixDansPanier(shampoingOff, picoOff, [shampoingOff]));
dit('un autre rituel ne déclenche rien', 10_000,
  prixDansPanier(shampoingOff, picoOff, [shampoingOff, soinOff]));
dit('MINI avec la reprise : le geste ne vaut pas pour elle', 10_000,
  prixDansPanier(shampoingOff, miniOff, [shampoingOff, repriseOff]));
dit('calibre inconnu : on n’offre pas sur une supposition', false,
  estOfferte(shampoingOff, pricingOf({ priceCoef: 1 }, bandesOff), [shampoingOff, repriseOff]));
dit('sans règle au Catalogue, rien n’est offert', false,
  estOfferte(svc({ id: 'sv-nu' }), picoOff, [repriseOff]));
dit('une règle SANS calibre vaut pour toutes les têtes', true,
  estOfferte(svc({ id: 'sv-s2', offertAvec: { serviceIds: ['sv-repriseOff'] } }), miniOff, [repriseOff]));


console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
