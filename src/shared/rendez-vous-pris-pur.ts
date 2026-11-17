/* ══ RENDEZ-VOUS PRIS OU SÉANCE FAITE · 17 novembre 2026 ═════════════════
   « Il ne faut pas permettre d'avoir des bilans sans prendre de RDV sinon
   tout le monde nous trichera » (Yéman, 17 novembre 2026, arbitrage D de la
   consultation en affiches).

   UNE SEULE RÈGLE pour trois portes : « Un souci avec vos locks ? » (Ma
   Couronne), l'avis sur photo par WhatsApp (Opale), le diagnostic photo de
   Ma Couronne (la fonction `diagnostic-locks`). Chacune ne s'ouvre qu'à une
   cliente que la Maison reçoit : un rendez-vous PRIS, ou une séance FAITE.

     · PRIS : confirmé, aujourd'hui ou plus tard, et choisi par elle. Un
       rendez-vous « en attente » de confirmation ne l'est pas encore. Une
       suggestion de la Maison sans son oui (`estSuggere`,
       rendez-vous-suggere-pur) non plus : elle n'a rien réservé.
     · FAITE : honorée, aujourd'hui ou avant.
     · Un rendez-vous confirmé resté dans le passé sans être honoré n'est ni
       l'un ni l'autre : personne ne sait si elle est venue.

   Pur, sans import. Le bloc ⟨rendez-vous-pris⟩ est RECOPIÉ dans
   `whatsapp-automate` et `diagnostic-locks` (une fonction Edge n'importe rien
   du dépôt) ; `verifie-les-douze-lunes` garde les copies identiques. La base
   tient la même règle pour les soucis (`a_eu_une_seance`, 0226).
   `scripts/verifie-les-autres-portes.mjs` l'éprouve (et `--prouve`). */

/* ⟨rendez-vous-pris⟩ */
/** Ce que la règle lit d'un rendez-vous : son statut, son jour, et les deux
    marques d'une suggestion (la pose par la Maison, son oui). */
export type RendezVousLu = { status?: unknown; date?: unknown; suggereLe?: unknown; confirmeeParLaClienteLe?: unknown };
const marqueDuRendezVous = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;
const jourDuRendezVous = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '');

/** UNE SÉANCE FAITE : honorée, aujourd'hui ou avant (`aujourdhui` : AAAA-MM-JJ à Cotonou). */
export function estUneSeanceFaite(a: RendezVousLu | null | undefined, aujourdhui: string): boolean {
  const jour = jourDuRendezVous(a?.date);
  return !!a && a.status === 'honoré' && jour !== '' && jour <= aujourdhui;
}

/** UN RENDEZ-VOUS PRIS : confirmé, aujourd'hui ou plus tard, et pas une
    suggestion de la Maison restée sans son oui. « En attente » ne compte pas. */
export function estUnRendezVousPris(a: RendezVousLu | null | undefined, aujourdhui: string): boolean {
  const jour = jourDuRendezVous(a?.date);
  if (!a || a.status !== 'confirmé' || jour === '' || jour < aujourdhui) return false;
  return !(marqueDuRendezVous(a.suggereLe) && !marqueDuRendezVous(a.confirmeeParLaClienteLe));
}

/** Elle a déjà eu une séance à la Maison. */
export const aEuUneSeance = (rdvs: readonly (RendezVousLu | null | undefined)[], aujourdhui: string): boolean =>
  rdvs.some((a) => estUneSeanceFaite(a, aujourdhui));

/** Elle a un rendez-vous pris. */
export const aUnRendezVousPris = (rdvs: readonly (RendezVousLu | null | undefined)[], aujourdhui: string): boolean =>
  rdvs.some((a) => estUnRendezVousPris(a, aujourdhui));

/** LA RÈGLE : un rendez-vous pris, ou une séance faite. */
export const aUnRendezVousPrisOuUneSeanceFaite = (rdvs: readonly (RendezVousLu | null | undefined)[], aujourdhui: string): boolean =>
  rdvs.some((a) => estUneSeanceFaite(a, aujourdhui) || estUnRendezVousPris(a, aujourdhui));
/* ⟨/rendez-vous-pris⟩ */

/** Le chemin de la consultation, sur le site de la Maison : relatif à
    l'origine, jamais un nom de domaine. Les portes fermées y mènent. */
export const CHEMIN_DE_LA_CONSULTATION = '/consultation/';

/** Aujourd'hui à Cotonou (UTC+1, sans heure d'été), AAAA-MM-JJ. */
export const aujourdhuiACotonou = (maintenantMs: number = Date.now()): string =>
  new Date(maintenantMs + 3_600_000).toISOString().slice(0, 10);
