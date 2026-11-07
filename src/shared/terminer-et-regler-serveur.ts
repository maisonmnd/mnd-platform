/* MA COURONNE PARLE À LA FONCTION « terminer-et-regler » — 6 novembre 2026.
   « Terminer mon rituel » : la fonction juge la porte (l'heure du rituel, le
   jour même), pose la marque et le lien de règlement, prévient l'équipe, et
   rend le jeton de la page « Régler ». Elle reconnaît la cliente à son
   compte : le rendez-vous d'une autre ne se termine pas. Le montant se
   décide au serveur, jamais ici. Voir terminer-et-regler-pur.ts. */

import type { DuDuServeur } from './terminer-et-regler-pur';

const URL_PROJET = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const CLE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
export const FONCTION_DE_LA_FIN = 'terminer-et-regler';

export type ReponseDeLaFin = {
  ok?: boolean; error?: string; version?: string;
  /** « a-regler » quand la porte s'est ouverte ; sinon pourquoi elle est restée fermée. */
  etat?: string;
  jeton?: string; adresse?: string; resteXof?: number | null; piecePrete?: boolean;
  /** Régler avant et après (7 novembre 2026) : le moment, et si le reste se règle sur sa pièce. */
  quand?: 'avance' | 'apres'; surLaPiece?: boolean;
};

/* RÉGLER AVANT ET APRÈS — 7 novembre 2026. « Pourquoi je ne peux pas faire
   un paiement d'un RDV sur ma couronne à n'importe quel moment ? » (Yéman).
   Ma Couronne demande à la fonction le lien de règlement de SON rendez-vous
   (ou celui d'une tête qu'elle porte), d'avance ou après coup ; la fonction
   juge la porte, dit le reste et rend le jeton de la page « Régler ». Le
   montant se décide au serveur, jamais ici. */
export async function regleDepuisMaCouronne(rdvId: string, quand: 'avance' | 'apres', jetonDeSession: string): Promise<ReponseDeLaFin> {
  if (!URL_PROJET) return { error: 'hors_ligne' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: 'hors_ligne' };
  if (!jetonDeSession) return { error: 'compte' };
  try {
    const r = await fetch(`${URL_PROJET}/functions/v1/${FONCTION_DE_LA_FIN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CLE_ANON, Authorization: `Bearer ${jetonDeSession}` },
      body: JSON.stringify({ action: quand, rdvId }),
    });
    return (await r.json().catch(() => ({ error: `http_${r.status}` }))) as ReponseDeLaFin;
  } catch {
    return { error: 'reseau' };
  }
}

/** CE QUE LA BASE CONFIRME (hotfix du 7 novembre 2026) : ses rendez-vous
    qu'elle peut régler après coup (`apres`) ou d'avance (`avance`), avec le
    reste du serveur. Gardé une minute ; null quand la fonction ne répond pas
    (l'écran ne montre alors rien). */
export type DusDuServeur = { apres: DuDuServeur[]; avance: DuDuServeur[] };
let dusEnMemoire: { at: number; jeton: string; promesse: Promise<DusDuServeur | null> } | null = null;
export function mesDusDuServeur(jetonDeSession: string, force = false): Promise<DusDuServeur | null> {
  if (!URL_PROJET || !jetonDeSession || (typeof navigator !== 'undefined' && navigator.onLine === false)) return Promise.resolve(null);
  if (!force && dusEnMemoire && dusEnMemoire.jeton === jetonDeSession && Date.now() - dusEnMemoire.at < 60_000) return dusEnMemoire.promesse;
  const promesse = (async (): Promise<DusDuServeur | null> => {
    try {
      const r = await fetch(`${URL_PROJET}/functions/v1/${FONCTION_DE_LA_FIN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CLE_ANON, Authorization: `Bearer ${jetonDeSession}` },
        body: JSON.stringify({ action: 'dus' }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; apres?: DuDuServeur[]; avance?: DuDuServeur[] } | null;
      return j?.ok === true && Array.isArray(j.apres) && Array.isArray(j.avance) ? { apres: j.apres, avance: j.avance } : null;
    } catch { return null; }
  })();
  dusEnMemoire = { at: Date.now(), jeton: jetonDeSession, promesse };
  void promesse.then((v) => { if (v === null && dusEnMemoire?.promesse === promesse) dusEnMemoire = null; });
  return promesse;
}
/** Un paiement vient d'être tenté : la prochaine lecture redemande. */
export const oublieLesDus = (): void => { dusEnMemoire = null; };

/** Ce qu'elle lit quand « Régler d'avance » ou « Régler » reste fermé : jamais
    un code. Elle n'est pas à la Maison : aucune phrase ne l'envoie au comptoir,
    sauf celle de « Passe au comptoir », qui le veut. La phrase française est la
    clé de `t()` dans Ma Couronne. */
export function refusAvantApres(r: ReponseDeLaFin): string {
  if (r.ok && r.etat === 'deja-regle') return 'Ce rituel est déjà réglé. Merci.';
  if (r.ok && r.etat === 'rien-a-regler') return 'Il n’y a rien à régler pour ce rituel.';
  if (r.ok && r.etat === 'comptoir') return 'Pour votre règlement, l’équipe vous attend au comptoir.';
  if (r.ok && r.etat === 'sans-prix') return 'Le montant de ce rituel n’est pas encore fixé : la Maison vous le dira.';
  if (r.ok && r.etat === 'en-preparation') return 'La Maison prépare votre montant. Réessayez dans un instant.';
  if (r.ok && r.etat) return 'Le règlement en ligne n’est pas ouvert pour ce rituel. Écrivez à la Maison.';
  if (r.error === 'trop') return 'Beaucoup de demandes d’un coup. Réessayez dans un instant.';
  return 'Le règlement ne répond pas. Réessayez dans un moment.';
}

/** Elle déclare avoir terminé SON rendez-vous. `jetonDeSession` : le jeton de son compte. */
export async function termineMonRituel(rdvId: string, jetonDeSession: string): Promise<ReponseDeLaFin> {
  if (!URL_PROJET) return { error: 'hors_ligne' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: 'hors_ligne' };
  if (!jetonDeSession) return { error: 'compte' };
  try {
    const r = await fetch(`${URL_PROJET}/functions/v1/${FONCTION_DE_LA_FIN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CLE_ANON, Authorization: `Bearer ${jetonDeSession}` },
      body: JSON.stringify({ action: 'terminer', porte: 'couronne', rdvId }),
    });
    return (await r.json().catch(() => ({ error: `http_${r.status}` }))) as ReponseDeLaFin;
  } catch {
    return { error: 'reseau' };
  }
}

/** LA PAGE « RÉGLER », SUR LA MÊME ORIGINE : les liens entre sœurs sont des
    chemins, jamais un domaine. En ligne, Ma Couronne vit sous /couronne/ et
    la page sous /trone/ ; en développement, tout est à la racine. `retour` :
    la page propose de revenir à Ma Couronne une fois le règlement fait. */
export function pageDuReglement(jeton: string, chemin: string = typeof window === 'undefined' ? '' : window.location.pathname): string {
  const page = chemin.startsWith('/couronne/') ? '/trone/regler.html' : '/regler.html';
  return `${page}?r=${encodeURIComponent(jeton)}&retour=couronne`;
}

/* L'ATTENTE DE LA PIÈCE, SUR LA PAGE « RÉGLER » — 6 novembre 2026, relecture.
   La page relisait toutes les 2,5 s pendant trois minutes : 72 lectures,
   quand la fonction en accorde 60 par adresse en dix minutes. Sans pièce, la
   61e lecture était refusée, et avec elle toute l'adresse (le Wi-Fi de la
   Maison : toutes les clientes, et le Trône). L'attente s'espace : douze
   lectures rapprochées (30 s, le temps ordinaire d'un poste ouvert), puis une
   toutes les 10 s ; trois minutes en 27 lectures. */
export const RELECTURES_RAPPROCHEES = 12;
export const RELECTURES_DE_LA_PREPARATION = 27;
/** Le délai avant la relecture suivante, ou null quand l'attente est finie. */
export function attenteDeLaPiece(essai: number): number | null {
  if (essai >= RELECTURES_DE_LA_PREPARATION) return null;
  return essai < RELECTURES_RAPPROCHEES ? 2500 : 10_000;
}

/** Ma Couronne, vue depuis la page « Régler » (le chemin du retour). */
export function retourAMaCouronne(chemin: string = typeof window === 'undefined' ? '' : window.location.pathname): string {
  return chemin.startsWith('/trone/') ? '/couronne/' : '/couronne.html';
}

/** Ce qu'elle lit quand la porte est restée fermée : jamais un code. La
    phrase française est la clé de `t()` dans Ma Couronne. */
export function refusDeLaFin(r: ReponseDeLaFin): string {
  if (r.ok && r.etat === 'deja-regle') return 'Ce rituel est déjà réglé. Merci.';
  if (r.ok && r.etat === 'rien-a-regler') return 'Il n’y a rien à régler pour ce rituel.';
  if (r.ok && r.etat === 'comptoir') return 'Pour votre règlement, l’équipe vous attend au comptoir.';
  if (r.ok && r.etat) return 'Le règlement en ligne n’est pas ouvert pour ce rituel. L’équipe vous répond au comptoir.';
  return 'Le règlement ne répond pas. Réessayez dans un moment, ou passez au comptoir.';
}
