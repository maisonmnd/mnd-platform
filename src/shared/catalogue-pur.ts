/* LE CATALOGUE, SA PART PURE — 17 septembre 2026.

   `catalog.ts` porte les magasins et la synchronisation : l'importer depuis
   une page publique tire tout Supabase et le temps réel dans un îlot censé
   se charger en un instant sur réseau faible (relecture de l'audit du site).
   Ce qui suit n'a besoin de rien : des constantes stables depuis la semence
   et deux lectures sur des objets plats. `catalog.ts` les ré-exporte, tout le
   Trône continue de les importer d'où il l'a toujours fait. */

/* ENTRE SES REPÈRES ⟨catalogue-pur⟩, CE MODULE SE RECOPIE TEL QUEL — 9 octobre 2026.
   Une fonction Edge ne lit rien du dépôt : celles qui jugent une place
   (`demande-submit`, `whatsapp-automate`) portent la copie entre les mêmes
   repères. La règle R8 de `verifie-les-douze-lunes` les confronte caractère
   pour caractère, `verifie-la-place-du-serveur` les fait tourner. Rien
   n'entre entre les repères qui ne puisse vivre dans une fonction Edge. */
/* ⟨catalogue-pur⟩ */
export type PriceMode = 'fixe' | 'variable' | 'devis';

/* La règle reconnaît par la CATÉGORIE, jamais par le nom : « une règle qui
   reconnaît par le NOM casse en silence » (leçon du 18 août). L'atelier
   VÈKPÈ™ EST l'atelier de la Naissance ; FÍNFÍN™ celui de la Renaissance.
   Les identifiants sont ceux de la semence, stables depuis le premier jour. */
export const CATEGORIE_VEKPE = 'atl-i-vekpe';
export const CATEGORIE_FINFIN = 'atl-iv-finfin';
/* L'ATELIER DES CONSULTATIONS — corrigé le 17 septembre 2026, EN LIGNE.

   Le site public ne proposait que la catégorie `doto`, celle de la semence.
   La Maison, elle, a posé le sien : `koko` (KÒKÒ™, « Le Diagnostic »), qui
   porte ses trois consultations. Résultat, l'écran de réservation est sorti
   VIDE en production : « voilà ce qui sort » (Yéman, capture à l'appui).
   C'est exactement la faute que la relecture adversaire avait annoncée,
   reconnaître par un identifiant que la base vivante ne porte pas.

   ON EN CONNAÎT DONC LES DEUX, et on garde un dernier recours par le nom :
   une règle qui ne sait plus reconnaître ce qu'elle cherche doit se rabattre,
   jamais rendre une page vide. */
export const CATEGORIES_CONSULTATION: readonly string[] = ['doto', 'koko'];

/* CE QUE LE SITE PUBLIC NE MONTRE PAS — 17 septembre 2026. « Il y a des
   services que je ne voudrais pas sur le site. Comment je peux avoir la main
   pour les décocher ? » (Yéman). La Maison décoche depuis la régie de la
   Vitrine, onglet « Sur le site public » ; la liste vit dans
   `mnd_vitrine_config.siteMasques`.

   ELLE EST À PART DE `hiddenServices` ET `hiddenCategories`, et c'est tout
   l'enjeu : ces deux-là règlent la carte du comptoir et Ma Couronne, où la
   Maison a masqué le Diagnostic, la Création et la Renaissance. Les confondre
   viderait le site de ses consultations, on l'a vérifié.

   MASQUER, PAS SÉLECTIONNER : on liste ce qu'on RETIRE, jamais ce qu'on
   garde, sinon toute prestation née après la liste resterait invisible sans
   qu'aucun réglage ne le dise. Un atelier décoché emporte ses familles,
   comme partout ailleurs dans la Maison.

   LE MÊME JUGE SERT DEUX FOIS : l'écran du site pour ne plus proposer, et la
   fonction `demande-submit` pour REFUSER (elle le recopie, une fonction Edge
   n'importe rien du dépôt). Sans le second, décocher ne serait qu'un décor :
   un appel direct réserverait encore. */
export type MasquesDuSite = { services?: string[]; categories?: string[] };

export function masquePourLeSite(
  s: { id: string; categoryId: string },
  masques: MasquesDuSite | undefined,
  cats: readonly { id: string; parentId?: string }[] = [],
): boolean {
  if (!masques) return false;
  if ((masques.services ?? []).includes(s.id)) return true;
  const caches = masques.categories ?? [];
  if (caches.length === 0) return false;
  /* La remontée est bornée : un parent circulaire ne fige pas l'écran. */
  let cur: string | undefined = s.categoryId;
  for (let i = 0; cur && i < 8; i += 1) {
    if (caches.includes(cur)) return true;
    cur = cats.find((c) => c.id === cur)?.parentId;
  }
  return false;
}

export function estUneConsultation(
  s: { categoryId: string; name?: string },
  cats: readonly { id: string; parentId?: string }[] = [],
): boolean {
  if (CATEGORIES_CONSULTATION.includes(s.categoryId)) return true;
  const racine = racineOf(cats, s.categoryId)?.id;
  if (racine && CATEGORIES_CONSULTATION.includes(racine)) return true;
  return /consultation|diagnostic/i.test(s.name ?? '');
}

export const fondeLaCouronne = (s: { categoryId: string }): boolean => s.categoryId === CATEGORIE_VEKPE;

/** Mode de prix effectif — dérive des anciennes données (hidePrice) si non renseigné. */
export const priceModeOf = (s: { priceMode?: PriceMode; hidePrice?: boolean }): PriceMode =>
  s.priceMode ?? (s.hidePrice ? 'devis' : 'fixe');

/** LA RACINE d'une catégorie — l'atelier dont elle relève, ou elle-même si
    c'en est un. La remontée est bornée pour qu'un parent circulaire ne fige
    pas l'écran. */
export const racineOf = <C extends { id: string; parentId?: string }>(cats: readonly C[], id: string | undefined): C | undefined => {
  let cur = cats.find((c) => c.id === id);
  for (let i = 0; cur?.parentId && i < 8; i += 1) {
    const parent = cats.find((c) => c.id === cur!.parentId);
    if (!parent) break;
    cur = parent;
  }
  return cur;
};

/* ══ LA FENÊTRE APRÈS LA DERNIÈRE VENUE — 7 novembre 2026 ═════════════════
   « Fidélité n'est disponible pour un client uniquement entre 4 et 6 semaines
   de sa dernière venue. Mais au-delà des 6 semaines ce service n'est plus
   disponible. » (Yéman.) Un pack qui porte `fenetreApresVenue` ne se pose que
   si l'écart entre la DERNIÈRE VENUE de la cliente (un rendez-vous « honoré »,
   le plus récent AVANT le rendez-vous qu'on pose) et ce rendez-vous va de
   4 à 6 semaines : de 28 jours inclus à 42 jours inclus. Avant : pas encore.
   Après : plus du tout. Sans aucune venue honorée : jamais.

   LA FENÊTRE SE JUGE À LA DATE DU RENDEZ-VOUS CHOISI, pas à aujourd'hui : une
   cliente qui réserve pour dans cinq semaines doit pouvoir le prendre. Les
   jours se comptent en jours calendaires sur des dates AAAA-MM-JJ (le jour
   de Cotonou, UTC+1, est déjà celui qu'écrit le rendez-vous) : aucune heure,
   donc aucun fuseau à deviner. Un rendez-vous à venir, non honoré, ne compte
   pas comme une venue ; un honoré postérieur au rendez-vous jugé est ignoré.
   Sans le champ, aucune règle : tout se passe comme avant. */
export type FenetreApresVenue = { deSemaines: number; aSemaines: number };

/** Les jours calendaires de `depuisIso` à `versIso` (AAAA-MM-JJ) ; NaN si l'un est illisible. */
export function joursEntreDates(depuisIso: string, versIso: string): number {
  const lit = (s: string): number => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  };
  return Math.round((lit(versIso) - lit(depuisIso)) / 86_400_000);
}

/** La fenêtre en jours, ou `null` quand le champ est absent ou illisible. */
export function fenetreEnJours(f: FenetreApresVenue | null | undefined): { min: number; max: number } | null {
  const de = Number(f?.deSemaines);
  const a = Number(f?.aSemaines);
  if (!f || !Number.isFinite(de) || !Number.isFinite(a) || de < 0 || a < de) return null;
  return { min: Math.round(de * 7), max: Math.round(a * 7) };
}

/** LA DERNIÈRE VENUE de cette cliente avant `avantIso` : le jour du rendez-vous
    « honoré » le plus récent, strictement antérieur. `null` s'il n'y en a pas. */
export function derniereVenueAvant(
  rdvs: readonly { clientId?: unknown; date?: unknown; status?: unknown }[],
  clientId: string,
  avantIso: string,
): string | null {
  if (!clientId) return null;
  let meilleure: string | null = null;
  for (const r of rdvs) {
    if (r.status !== 'honoré' || r.clientId !== clientId) continue;
    const j = String(r.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j) || j >= avantIso) continue;
    if (meilleure === null || j > meilleure) meilleure = j;
  }
  return meilleure;
}

/** LE PACK SE POSE-T-IL CE JOUR-LÀ ? Sans fenêtre : toujours. Avec : seulement
    si la dernière venue existe et que l'écart va de `min` à `max` jours inclus. */
export function dansLaFenetreDeVenue(
  f: FenetreApresVenue | null | undefined,
  dateRdv: string | null | undefined,
  derniereVenue: string | null | undefined,
): boolean {
  if (!f) return true;
  const w = fenetreEnJours(f);
  if (!w || !dateRdv || !derniereVenue) return false;
  const ecart = joursEntreDates(derniereVenue, dateRdv);
  return Number.isFinite(ecart) && ecart >= w.min && ecart <= w.max;
}

/** LA FENÊTRE EST-ELLE ENCORE À VENIR ? Tant qu'aucune date n'est choisie, on
    propose le pack si un jour d'`aujourdhui` en avant peut encore tomber dedans :
    la dernière venue existe et son dernier jour de fenêtre n'est pas passé. */
export function fenetreEncoreAtteignable(
  f: FenetreApresVenue | null | undefined,
  aujourdhui: string | null | undefined,
  derniereVenue: string | null | undefined,
): boolean {
  if (!f) return true;
  const w = fenetreEnJours(f);
  if (!w || !derniereVenue) return false;
  if (!aujourdhui) return true;
  const ecart = joursEntreDates(derniereVenue, aujourdhui);
  return Number.isFinite(ecart) && ecart <= w.max;
}

/** La phrase dite à la cliente (Ma Couronne, le site, WhatsApp). */
export function phraseDeLaFenetre(f: FenetreApresVenue): string {
  return `Disponible entre ${f.deSemaines} et ${f.aSemaines} semaines après votre dernière venue`;
}
/* ⟨/catalogue-pur⟩ */
