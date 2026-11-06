/* MA COURONNE PARLE À LA FONCTION « terminer-et-regler » — 6 novembre 2026.
   « Terminer mon rituel » : la fonction juge la porte (l'heure du rituel, le
   jour même), pose la marque et le lien de règlement, prévient l'équipe, et
   rend le jeton de la page « Régler ». Elle reconnaît la cliente à son
   compte : le rendez-vous d'une autre ne se termine pas. Le montant se
   décide au serveur, jamais ici. Voir terminer-et-regler-pur.ts. */

const URL_PROJET = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const CLE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
export const FONCTION_DE_LA_FIN = 'terminer-et-regler';

export type ReponseDeLaFin = {
  ok?: boolean; error?: string; version?: string;
  /** « a-regler » quand la porte s'est ouverte ; sinon pourquoi elle est restée fermée. */
  etat?: string;
  jeton?: string; adresse?: string; resteXof?: number | null; piecePrete?: boolean;
};

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
