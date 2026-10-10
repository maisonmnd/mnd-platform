/* ══ LA BASCULE DU 1er JANVIER 2027 — décidée le 10 octobre 2026 ═════════
   La genèse des prix, question 12 (le calendrier) : « maintenant, tout ce
   qui ne monte aucun prix ; novembre, le pilote des formules et des noms au
   comptoir ; le 1er janvier 2027, les hausses et Ma Couronne. Les abonnées
   d'aujourd'hui gardent leur contrat et leur premier renouvellement à
   l'ancien prix ; une cliente dont la visite monte de plus de 10 % garde son
   prix trois mois. »

   Ce module dit QUOI : quels rendez-vous se figent, quelles formules se
   ferment, qui garde son prix et lequel. Le lanceur (`apps/trone/shell/
   bascule-de-janvier`) dit QUAND, et dans quel ordre :
   ① les rendez-vous déjà pris se figent, au catalogue d'avant ;
   ② les prix tenus se calculent et se posent, ancien et nouveau catalogue
     comparés ligne à ligne ;
   ③ la carte de janvier se pose (`nouvelle-grille-pur`, phase « janvier ») ;
   ④ les treize anciennes formules se ferment à la vente ;
   ⑤ les masques tombent : Ma Couronne et le site montrent la nouvelle carte.

   Pur : aucun magasin, aucun réseau, aucun import. */

/** Le jour de la bascule (le même que `BASCULE_DE_JANVIER` de la grille). */
export const BASCULE = '2027-01-01';
/** L'instant de la bascule, à Cotonou. */
export const INSTANT_DE_LA_BASCULE = Date.parse('2027-01-01T00:00:00+01:00');

/* ── ④ Les treize formules d'avant (synthèse, partie 4.4) ──────────────
   Les six à 0 F sont déjà fermées depuis le 10 octobre 2026. Chaque contrat
   ouvert court jusqu'à son terme, à son prix. */
export const ANCIENNES_FORMULES: readonly string[] = [
  'pl-mkt-eclosion', 'pl-mkt-juste-cadence', 'pl-mkt-annee-sereine-duo', 'pl-mkt-carnet', 'pl-mkt-suite',
  'pl-mkt-lavage', 'pl-mkt-foyer2', 'pl-mkt-foyer3', 'pl-mkt-annee-sereine-trio', 'pl-mkt-annee-fraiche-duo',
  'pl-mkt-annee-fraiche-trio', 'pl-mkt-annee-nette-duo', 'pl-mkt-annee-nette-trio',
];

type FormuleFermable = { id: string; fermee?: boolean; fermeeLe?: string; fermeeParLaBascule?: boolean };

/** Ferme les anciennes formules jamais touchées à la main (une formule
    rouverte, `fermee: false`, reste ouverte). `null` : rien à faire. */
export function fermeLesAnciennesFormules<T extends FormuleFermable>(
  plans: readonly T[], jour: string,
): { plans: T[]; fermees: string[] } | null {
  const fermees: string[] = [];
  const suite = plans.map((p) => {
    if (!ANCIENNES_FORMULES.includes(p.id) || p.fermee !== undefined) return p;
    fermees.push(p.id);
    return { ...p, fermee: true, fermeeLe: jour, fermeeParLaBascule: true };
  });
  return fermees.length ? { plans: suite, fermees } : null;
}

type Contrat = { clientId?: string; planId: string; startIso?: string; sinceIso?: string };
/** Le début d'un contrat : sa première venue prévue, sinon le jour de la vente. */
const debutDu = (s: Contrat): string => (s.startIso ?? s.sinceIso ?? '').slice(0, 10);

/** LE PREMIER RENOUVELLEMENT, À L'ANCIEN PRIX : une tête qui tenait cette
    formule avant la bascule peut la reprendre UNE fois après, même fermée.
    Seule une formule fermée par la bascule s'ouvre ainsi ; une formule fermée
    à la main reste fermée. */
export function peutReprendreSonAncienne(
  plan: { id: string; fermeeParLaBascule?: boolean; fermee?: boolean },
  clientId: string | undefined,
  contrats: readonly Contrat[],
  bascule: string = BASCULE,
): boolean {
  if (!clientId || plan.fermee !== true || plan.fermeeParLaBascule !== true) return false;
  const siens = contrats.filter((s) => s.clientId === clientId && s.planId === plan.id);
  const avant = siens.some((s) => { const d = debutDu(s); return !!d && d < bascule; });
  const apres = siens.some((s) => debutDu(s) >= bascule);
  return avant && !apres;
}

/* ── ① Les rendez-vous déjà pris gardent leur prix ─────────────────────── */
type Rdv = {
  id: string; date: string; status: string; priceXof?: number; seriesIndex?: number;
  forfait?: unknown; coveredBySub?: boolean; creeLe?: string; serviceIds: readonly string[];
  prixFigeParLaBascule?: number;
};

/** Ce rendez-vous se fige-t-il ? Daté de la bascule ou après, ni honoré ni
    annulé, sans prix encore, ni séance de suite, ni forfait ponctuel, ni
    couvert par une formule, et POSÉ AVANT la bascule (un rendez-vous posé
    après se lit à la nouvelle carte). */
export const doitSeFiger = (a: Rdv, instant: number = INSTANT_DE_LA_BASCULE): boolean =>
  a.date.slice(0, 10) >= BASCULE
  && a.status !== 'honoré' && a.status !== 'annulé'
  && typeof a.priceXof !== 'number'
  && (a.seriesIndex ?? 1) <= 1
  && !a.forfait && !a.coveredBySub
  && a.serviceIds.length > 0
  && (!a.creeLe || !(Date.parse(a.creeLe) >= instant));

/** Fige les rendez-vous qui doivent l'être, à `prixDe` (le total du catalogue
    d'avant, lu par la porte des écrans). Un prix illisible ne fige rien.
    `null` : rien à faire. */
export function figeLesRendezVous<T extends Rdv>(
  rdvs: readonly T[], prixDe: (a: T) => number | undefined, instant: number = INSTANT_DE_LA_BASCULE,
): { rdvs: T[]; figes: string[] } | null {
  const figes: string[] = [];
  const suite = rdvs.map((a) => {
    if (!doitSeFiger(a, instant)) return a;
    const prix = prixDe(a);
    if (typeof prix !== 'number' || !Number.isFinite(prix) || prix < 0) return a;
    figes.push(a.id);
    return { ...a, priceXof: prix, prixFigeParLaBascule: prix };
  });
  return figes.length ? { rdvs: suite, figes } : null;
}

/* ── ② Une visite qui monte de plus de 10 % garde son prix trois mois ──── */
export const HAUSSE_TENUE = 0.10;
export const PRIX_TENUS_JUSQUAU = '2027-03-31';
/** Une prestation archivée en janvier : la tête la retrouvera sous ce nom-ci. */
export const SUCCESSEURS: Readonly<Record<string, string>> = { 'sv-atl-iii-cou-l': 'sv-atl-iii-cou-c' };

export type PrixTenus = { jusquau: string; services: Record<string, number>; poseLe?: string };

/** SA VISITE DE RÉFÉRENCE : son dernier rituel honoré des douze mois avant la
    bascule, hors création (un acte d'une fois n'est pas « sa visite ») et hors
    séance de suite. `null` : pas de visite à comparer. */
export function visiteDeReference(
  rdvs: readonly { clientId?: string; date: string; status: string; seriesIndex?: number; serviceIds: readonly string[]; longueur?: string }[],
  clientId: string,
  estCreation: (serviceId: string) => boolean,
  bascule: string = BASCULE,
): { serviceIds: string[]; longueur?: string } | null {
  const depuis = `${Number(bascule.slice(0, 4)) - 1}${bascule.slice(4, 10)}`;
  const siennes = rdvs
    .filter((a) => a.clientId === clientId && a.status === 'honoré' && (a.seriesIndex ?? 1) <= 1
      && a.serviceIds.length > 0 && !a.serviceIds.some(estCreation)
      && a.date.slice(0, 10) >= depuis && a.date.slice(0, 10) < bascule)
    .sort((x, y) => y.date.localeCompare(x.date));
  const d = siennes[0];
  return d ? { serviceIds: [...d.serviceIds], longueur: d.longueur } : null;
}

/** LES PRIX QU'ELLE GARDE : si sa visite de référence monte de plus de 10 %
    (lignes au catalogue d'avant contre lignes au catalogue de janvier, une
    prestation archivée lue sous son successeur), chaque ligne qui monte garde
    son prix d'avant jusqu'au 31 mars 2027. `null` : rien à tenir. */
export function prixTenusDeLaTete(o: {
  visite: readonly string[];
  avant: (serviceId: string) => number | undefined;
  apres: (serviceId: string) => number | undefined;
}): Record<string, number> | null {
  const lignes = o.visite.map((id) => {
    const neuf = SUCCESSEURS[id] ?? id;
    return { neuf, a: o.avant(id), n: o.apres(neuf) };
  });
  if (!lignes.length || lignes.some((l) => typeof l.a !== 'number' || typeof l.n !== 'number')) return null;
  const totalAvant = lignes.reduce((s, l) => s + (l.a as number), 0);
  const totalApres = lignes.reduce((s, l) => s + (l.n as number), 0);
  if (!(totalAvant > 0) || totalApres <= totalAvant * (1 + HAUSSE_TENUE)) return null;
  const tenus: Record<string, number> = {};
  for (const l of lignes) {
    if ((l.n as number) > (l.a as number) && tenus[l.neuf] === undefined) tenus[l.neuf] = l.a as number;
  }
  return Object.keys(tenus).length ? tenus : null;
}

/** Les prix tenus en vigueur ce jour-là, ou `undefined`. */
export const prixTenusActifs = (t: PrixTenus | undefined, jour: string): Record<string, number> | undefined =>
  t && jour.slice(0, 10) <= t.jusquau && Object.keys(t.services ?? {}).length ? t.services : undefined;

/** Les prix fermes d'une tête, ses prix tenus du jour dessous : un prix ferme
    accordé à la main l'emporte toujours. */
export const avecLesPrixTenus = (
  prixFixes: Record<string, number> | undefined, t: PrixTenus | undefined, jour: string,
): Record<string, number> | undefined => {
  const actifs = prixTenusActifs(t, jour);
  return actifs ? { ...actifs, ...(prixFixes ?? {}) } : prixFixes;
};
