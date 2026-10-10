/* ══ LES SEPT FORMULES EN LUNES — 10 octobre 2026 (la genèse des prix, lot 2) ═
   Décisions de Yéman au sélecteur, maquette validée (« construis ») :
   - les sept noms de l'expert marque, la durée dite en LUNES ;
   - dans un Carnet, la DERNIÈRE visite est offerte ; le Carnet de Trois
     devient Carnet de QUATRE (trois payées, la quatrième offerte), et il ne
     se prend qu'UNE FOIS par tête : c'est la porte ;
   - VÈKPÈ™ · Les Premières Lunes (après une création à la Maison) : quatre
     visites, la quatrième offerte, une fois par tête ;
   - le Carnet de l'Année offre la quatrième ET la huitième visite (25 %) ;
   - GBÈJÍ™ · Chaque Lune : la venue et le soin de la lune (DÀNDÀN™, VÍVÍVÓ™,
     WÈWÈ™ tour à tour) remisé de 25 %, la mensualité lissée ; une lune non
     réglée met la formule en PAUSE, jamais de dette ;
   - jamais plus de 25 % ; le DÀNDÀN™ n'est jamais offert (il peut être remisé) ;
   - LE FOYER : −15 % pour la deuxième et la troisième tête, sans jamais
     dépasser 25 % au total ;
   - le paiement : comptant sous 100 000 F, en 2 fois dès 100 000 F, en 3 fois
     dès 200 000 F (la règle vit dans `shared/echeancier`, `decoupesPour`).
   Calendrier (question 12) : au comptoir dès maintenant pour le pilote de
   novembre, dans Ma Couronne en janvier 2027.

   LES PRIX SONT CEUX DE LA CARTE DU 10 OCTOBRE, écrits calibre par calibre
   (cheveux courts) avec le supplément de longueur : le resserrage est
   inchangé (question 2), la venue nommée vaut la carte (question 3). Le
   harnais les recompose depuis la carte pour vérifier qu'aucun ne ment.

   Pur : aucun magasin, aucun réseau. */

/** Les calibres de la Maison (mnd_model_bands), du plus large au plus fin. */
export const CALIBRES = ['cal-jumbo', 'cal-medium', 'cal-mini', 'cal-micro', 'cal-nano', 'cal-pico', 'cal-galaxy'] as const;

/** La venue d'entretien à la carte, cheveux courts, par calibre (KLƆKLƆ™
    Essentiel 8 000 F + SÍNSIN™ Essentiel au calibre, la sortie comprise). */
export const VENUE_ESSENTIEL_COURT = [28000, 28000, 28000, 38000, 48000, 58000, 68000] as const;
/** La même avec SÍNSIN™ Signature. */
export const VENUE_SIGNATURE_COURT = [33000, 33000, 33000, 43000, 53000, 63000, 73000] as const;
/** Ce qu'ajoute la longueur à une venue (le lavage Essentiel, mi-long et long). */
export const VENUE_LONGUEUR = { 'mi-long': 2000, long: 4000 } as const;

const parCalibre = (court: readonly number[], fois: number): Record<string, number> =>
  Object.fromEntries(CALIBRES.map((c, i) => [c, court[i] * fois]));
const longueurFois = (fois: number) => ({ 'mi-long': VENUE_LONGUEUR['mi-long'] * fois, long: VENUE_LONGUEUR.long * fois });

export type FormuleEnLunes = {
  id: string;
  name: string;
  tag: string;
  line: string;
  perks: string[];
  popular: boolean;
  famille: 'naissance' | 'prolongement' | 'porte' | 'foyer' | 'annees';
  mode: 'cycle' | 'pack';
  validityDays?: number;
  priceXof: number;
  prixParCalibre?: Record<string, number>;
  supplementLongueur?: { 'mi-long'?: number; long?: number };
  included: { serviceId: string; qty: number | null }[];
  discountPct: number;
  /** Une seule fois par tête, pour toutes les formules de la même clé. */
  uneFoisParTete?: string;
  /** Le soin de la lune, tour à tour, une fois par lune. */
  soinsDeLaLune?: string[];
};

const GBEJI_E = 'sv-venue-gbeji-ess';
const GBEJI_S = 'sv-venue-gbeji-sig';

/** Les dix fiches des sept formules (trois Carnets ont leur variante Signature).
    Les identifiants sont neufs : un contrat signé relit sa formule à chaque
    affichage, réécrire une ancienne changerait les contrats en cours. */
export const FORMULES_EN_LUNES: readonly FormuleEnLunes[] = [
  {
    id: 'pl-lune-kloklo', name: 'KLƆKLƆ™ · Chaque Lune', tag: 'La porte', famille: 'porte', mode: 'cycle', popular: true,
    line: 'Un lavage Signature chaque lune, la sortie soignée offerte.',
    perks: ['Un KLƆKLƆ™ Signature par lune', 'La sortie soignée offerte', 'Réglée chaque lune, sans engagement'],
    priceXof: 12000, supplementLongueur: { 'mi-long': 3000, long: 6000 }, discountPct: 14,
    included: [{ serviceId: 'sv-plt-05-sig-c', qty: 1 }, { serviceId: 'sv-plt-50-sty-e', qty: 1 }],
  },
  {
    id: 'pl-lune-premieres', name: 'VÈKPÈ™ · Les Premières Lunes', tag: 'Après la création', famille: 'naissance', mode: 'pack', popular: true,
    line: 'Les quatre premières venues de votre couronne, la quatrième offerte.',
    perks: ['Quatre GBÈJÍ™ Essentiel, semaines 6, 12, 18 et 24', 'La quatrième visite offerte', 'Valable sept lunes, une fois par tête'],
    validityDays: 210, priceXof: 84000, prixParCalibre: parCalibre(VENUE_ESSENTIEL_COURT, 3), supplementLongueur: longueurFois(3), discountPct: 25,
    included: [{ serviceId: GBEJI_E, qty: 4 }], uneFoisParTete: 'premieres-lunes',
  },
  {
    id: 'pl-lune-gbeji', name: 'GBÈJÍ™ · Chaque Lune', tag: 'Le rythme', famille: 'prolongement', mode: 'cycle', popular: false,
    line: 'Votre venue et le soin de la lune, réglés lune par lune.',
    perks: ['Un GBÈJÍ™ Essentiel par lune', 'Le soin de la lune à −25 % : DÀNDÀN™, VÍVÍVÓ™, WÈWÈ™ tour à tour', 'Une lune non réglée met la formule en pause, jamais de dette'],
    priceXof: 37500, prixParCalibre: Object.fromEntries(CALIBRES.map((c, i) => [c, [37500, 37500, 37500, 47500, 57500, 67500, 77500][i]])),
    supplementLongueur: { 'mi-long': 5000, long: 10000 }, discountPct: 10,
    included: [{ serviceId: GBEJI_E, qty: 1 }], soinsDeLaLune: ['sv-plt-10-m', 'sv-plt-30-c', 'sv-plt-20-c'],
  },
  {
    id: 'pl-lune-quatre', name: 'GBÈJÍ™ · Carnet de Quatre', tag: 'La porte du carnet', famille: 'prolongement', mode: 'pack', popular: true,
    line: 'Quatre venues en six lunes, la quatrième offerte.',
    perks: ['Quatre GBÈJÍ™ Essentiel', 'La quatrième visite offerte', 'Valable six lunes, une fois par tête'],
    validityDays: 180, priceXof: 84000, prixParCalibre: parCalibre(VENUE_ESSENTIEL_COURT, 3), supplementLongueur: longueurFois(3), discountPct: 25,
    included: [{ serviceId: GBEJI_E, qty: 4 }], uneFoisParTete: 'carnet-de-quatre',
  },
  {
    id: 'pl-lune-quatre-sig', name: 'GBÈJÍ™ · Carnet de Quatre · Signature', tag: 'La porte du carnet', famille: 'prolongement', mode: 'pack', popular: false,
    line: 'Quatre venues Signature en six lunes, la quatrième offerte.',
    perks: ['Quatre GBÈJÍ™ Signature', 'La quatrième visite offerte', 'Valable six lunes, une fois par tête'],
    validityDays: 180, priceXof: 99000, prixParCalibre: parCalibre(VENUE_SIGNATURE_COURT, 3), supplementLongueur: longueurFois(3), discountPct: 25,
    included: [{ serviceId: GBEJI_S, qty: 4 }], uneFoisParTete: 'carnet-de-quatre',
  },
  {
    id: 'pl-lune-six', name: 'GBÈJÍ™ · Carnet de Six', tag: 'La cadence', famille: 'annees', mode: 'pack', popular: true,
    line: 'Six venues en neuf lunes, la sixième offerte.',
    perks: ['Six GBÈJÍ™ Essentiel', 'La sixième visite offerte', 'Valable neuf lunes'],
    validityDays: 270, priceXof: 140000, prixParCalibre: parCalibre(VENUE_ESSENTIEL_COURT, 5), supplementLongueur: longueurFois(5), discountPct: 17,
    included: [{ serviceId: GBEJI_E, qty: 6 }],
  },
  {
    id: 'pl-lune-six-sig', name: 'GBÈJÍ™ · Carnet de Six · Signature', tag: 'La cadence', famille: 'annees', mode: 'pack', popular: false,
    line: 'Six venues Signature en neuf lunes, la sixième offerte.',
    perks: ['Six GBÈJÍ™ Signature', 'La sixième visite offerte', 'Valable neuf lunes'],
    validityDays: 270, priceXof: 165000, prixParCalibre: parCalibre(VENUE_SIGNATURE_COURT, 5), supplementLongueur: longueurFois(5), discountPct: 17,
    included: [{ serviceId: GBEJI_S, qty: 6 }],
  },
  {
    id: 'pl-lune-annee', name: 'GBÈJÍ™ · Carnet de l’Année', tag: 'L’année', famille: 'annees', mode: 'pack', popular: false,
    line: 'Huit venues en douze lunes, la quatrième et la huitième offertes.',
    perks: ['Huit GBÈJÍ™ Essentiel', 'La quatrième et la huitième visite offertes', 'Le prix figé douze lunes'],
    validityDays: 365, priceXof: 168000, prixParCalibre: parCalibre(VENUE_ESSENTIEL_COURT, 6), supplementLongueur: longueurFois(6), discountPct: 25,
    included: [{ serviceId: GBEJI_E, qty: 8 }],
  },
  {
    id: 'pl-lune-annee-sig', name: 'GBÈJÍ™ · Carnet de l’Année · Signature', tag: 'L’année', famille: 'annees', mode: 'pack', popular: false,
    line: 'Huit venues Signature en douze lunes, la quatrième et la huitième offertes.',
    perks: ['Huit GBÈJÍ™ Signature', 'La quatrième et la huitième visite offertes', 'Le prix figé douze lunes'],
    validityDays: 365, priceXof: 198000, prixParCalibre: parCalibre(VENUE_SIGNATURE_COURT, 6), supplementLongueur: longueurFois(6), discountPct: 25,
    included: [{ serviceId: GBEJI_S, qty: 8 }],
  },
];

export const IDS_DES_FORMULES_EN_LUNES: readonly string[] = FORMULES_EN_LUNES.map((f) => f.id);

/** LA NAISSANCE DES FORMULES : celles qui manquent seulement. Une fiche déjà
    là (même retouchée à la main) ne se réécrit jamais. Rend la liste neuve et
    les ids nés, ou `null`. */
export function poseLesFormulesEnLunes<P extends { id: string }>(plans: readonly P[]): { plans: (P | FormuleEnLunes)[]; nees: string[] } | null {
  const la = new Set(plans.map((p) => p.id));
  const nees = FORMULES_EN_LUNES.filter((f) => !la.has(f.id));
  if (nees.length === 0) return null;
  return { plans: [...plans, ...nees.map((f) => ({ ...f, included: f.included.map((i) => ({ ...i })) }))], nees: nees.map((f) => f.id) };
}

/** Les formules en lunes masquées de Ma Couronne jusqu'en janvier (le pilote
    est au comptoir). Rend la configuration neuve, ou `null`. */
export function masquesDesFormules<C extends { hiddenPlans?: string[] }>(cfg: C, phase: 'maintenant' | 'janvier'): C | null {
  const caches = cfg.hiddenPlans ?? [];
  const ids = IDS_DES_FORMULES_EN_LUNES;
  const neuf = phase === 'maintenant' ? [...caches, ...ids.filter((i) => !caches.includes(i))] : caches.filter((i) => !ids.includes(i));
  if (neuf.length === caches.length && neuf.every((x, i) => x === caches[i])) return null;
  return { ...cfg, hiddenPlans: neuf };
}

/* ══ LES RÈGLES DU COMPTOIR ════════════════════════════════════════════ */

/** UNE FOIS PAR TÊTE : le contrat déjà signé qui ferme cette formule à cette
    tête, ou `undefined`. Tout contrat compte, même résilié ou fini : la porte
    ne se repasse pas. */
export function dejaPriseParLaTete<S extends { planId: string; sinceIso?: string }>(
  plan: { uneFoisParTete?: string }, contratsDeLaTete: readonly S[], plans: readonly { id: string; uneFoisParTete?: string }[],
): S | undefined {
  if (!plan.uneFoisParTete) return undefined;
  return contratsDeLaTete.find((s) => plans.find((p) => p.id === s.planId)?.uneFoisParTete === plan.uneFoisParTete);
}

/** LE PRIX DU FOYER pour la deuxième ou la troisième tête : −15 %, sans que
    l'avantage total de la tête dépasse 25 %. Arrondi au 500 F SUPÉRIEUR :
    l'arrondi inférieur ferait passer la tête au-dessus du plafond. Rend le
    prix de la tête si le Foyer n'ajoute rien. */
export function prixDuFoyer(prixXof: number, valeurCarteXof: number): number {
  if (!(valeurCarteXof > 0) || !(prixXof > 0)) return prixXof;
  const sien = Math.max(0, 1 - prixXof / valeurCarteXof);
  const total = Math.min(sien + 0.15, 0.25);
  if (total <= sien + 1e-9) return prixXof;
  return Math.min(prixXof, Math.ceil((valeurCarteXof * (1 - total)) / 500) * 500);
}

/** LE RANG DE LA TÊTE DANS SON FOYER : 1 + le nombre d'AUTRES têtes du même
    foyer qui portent déjà une formule vivante. Le Foyer joue au rang 2 et 3. */
export const rangDansLeFoyer = (autresTetesAvecFormule: number): number => 1 + Math.max(0, autresTetesAvecFormule);
export const leFoyerJoue = (rang: number): boolean => rang === 2 || rang === 3;

/** LE SOIN DE LA LUNE : celui du cycle en cours, tour à tour depuis la
    signature. `undefined` si la formule n'en porte pas. */
export function soinDeLaLune(
  plan: { soinsDeLaLune?: string[] }, depuisIso: string | undefined, dateIso: string,
): string | undefined {
  const soins = plan.soinsDeLaLune ?? [];
  if (soins.length === 0) return undefined;
  if (!depuisIso || dateIso < depuisIso) return soins[0];
  const jours = Math.floor((Date.parse(`${dateIso}T12:00:00Z`) - Date.parse(`${depuisIso}T12:00:00Z`)) / 86_400_000);
  return soins[Math.floor(jours / 30) % soins.length];
}

/** UNE LUNE NON RÉGLÉE MET LA FORMULE EN PAUSE (jamais de dette) : une
    formule à cycle dont l'échéance est passée sans règlement ne couvre plus
    rien, jusqu'au règlement de la lune. Un paquet ne se met pas en pause. */
export const enPause = (
  plan: { mode?: 'cycle' | 'pack' } | undefined, sub: { nextIso?: string }, aujourdhuiIso: string,
): boolean => !!plan && plan.mode !== 'pack' && !!sub.nextIso && /^\d{4}-\d{2}-\d{2}$/.test(sub.nextIso) && aujourdhuiIso >= sub.nextIso;

