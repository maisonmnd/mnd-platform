/* DÉPLACER SON RENDEZ-VOUS DEPUIS LE SITE — 7 novembre 2026 (la page
   maisonmnd.com/rdv/?v=). « DÉPLACER son RDV depuis le site, ouvrir le
   calendrier et changer de date » (Yéman). Ses choix, maquette validée par
   « construis » :
   · déplaçable jusqu'à 24 h AVANT l'heure du rituel ; au-delà, la page dit
     d'écrire à la Maison sur WhatsApp ;
   · déplacé AUSSITÔT (pas de validation par l'équipe), WhatsApp de
     confirmation et équipe prévenue ;
   · annuler reste un mot à la Maison sur WhatsApp.

   Ce fichier est PUR : la règle des 24 heures, jugée par le serveur
   (demande-submit, qui en porte la copie entre ses repères) et lue par la
   page pour savoir quel bouton montrer. Le serveur reste le seul juge : la
   page n'a que l'horloge de la cliente.

   LES DEUX HEURES COMPTENT. L'heure D'ORIGINE du rendez-vous doit être à plus
   de 24 h d'ici (sinon « trop tard »), et la place D'ARRIVÉE aussi (sinon un
   rendez-vous du 20 se glisserait à demain 8 h). L'heure est celle de
   Cotonou, UTC+1 toute l'année. */

/* ⟨deplacer-du-site⟩ */
/** Vingt-quatre heures : le délai pour déplacer, dans les deux sens. */
export const DELAI_POUR_DEPLACER_MS = 24 * 3_600_000;

/** L'instant d'un rendez-vous (date et heure de Cotonou), ou NaN si l'un
    des deux ne se lit pas. */
export function instantDuRdvDuSite(date: unknown, time: unknown): number {
  const d = String(date ?? '').slice(0, 10);
  const h = String(time ?? '').slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(h)) return Number.NaN;
  return Date.parse(`${d}T${h}:00+01:00`);
}

/** Ce que la règle dit d'un rendez-vous qu'on voudrait déplacer. */
export type VerdictDuDeplacement = 'permis' | 'annule' | 'passe' | 'trop-tard' | 'illisible';

/** SE DÉPLACE-T-IL ? Seul un rendez-vous « confirmé » ou « en attente » se
    déplace ; annulé se dit annulé ; honoré ou clos se dit passé ; une heure
    déjà venue aussi ; à 24 h ou moins, c'est « trop tard » ; plus de 24 h,
    c'est permis. */
export function deplacementPermis(r: { status?: unknown; date?: unknown; time?: unknown } | null | undefined, maintenantMs: number): VerdictDuDeplacement {
  if (!r) return 'illisible';
  if (r.status === 'annulé') return 'annule';
  if (r.status !== 'confirmé' && r.status !== 'en attente') return 'passe';
  const debut = instantDuRdvDuSite(r.date, r.time);
  if (!Number.isFinite(debut) || !Number.isFinite(maintenantMs)) return 'illisible';
  if (debut <= maintenantMs) return 'passe';
  return debut - maintenantMs > DELAI_POUR_DEPLACER_MS ? 'permis' : 'trop-tard';
}

/** LA PLACE D'ARRIVÉE, avant toute lecture : à plus de 24 h d'ici aussi.
    `creneau_trop_proche` est le code que le serveur rend ; le jour même, la
    fenêtre et l'ouverture se jugent ailleurs (`laPlaceEstRecevable`). */
export function arriveeRecevable(p: { date: unknown; time: unknown }, maintenantMs: number): 'creneau_invalide' | 'creneau_trop_proche' | null {
  const debut = instantDuRdvDuSite(p.date, p.time);
  if (!Number.isFinite(debut) || !Number.isFinite(maintenantMs)) return 'creneau_invalide';
  return debut - maintenantMs > DELAI_POUR_DEPLACER_MS ? null : 'creneau_trop_proche';
}
/* ⟨/deplacer-du-site⟩ */
