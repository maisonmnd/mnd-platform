/* LES PAGES « RÉGLER » PARLENT À LA COLLECTE MTN — 11 novembre 2026.
   La cliente n'a pas de compte : la fonction Edge `collecte-mtn` (Verify JWT
   éteint) retrouve son rendez-vous, demande le paiement à MTN et relit sa
   réponse. Le montant se décide au serveur (le reste de sa pièce) ; la page
   ne lui donne que son numéro, et le merci choisi. Voir collecte-mtn-pur.ts. */

const URL_PROJET = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const CLE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
export const FONCTION_DE_LA_COLLECTE = 'collecte-mtn';

export type RdvAuComptoir = { n: number; prenom: string; etat: 'a-regler' | 'reglee' | 'sans-piece'; resteXof: number; pourboire: boolean };
export type ReponseCollecte = {
  ok?: boolean;
  erreur?: string;
  ouverte?: boolean;
  /** Le taux ajouté pour la cliente, tel que le serveur le lit (2026-11-22-a). */
  fraisAjoutesPct?: number;
  version?: string;
  rdvs?: RdvAuComptoir[];
  reference?: string;
  etat?: 'attente' | 'recu' | 'refuse';
  montantXof?: number;
  raison?: string;
  honore?: boolean;
};

async function appel(corps: Record<string, unknown>): Promise<ReponseCollecte> {
  if (!URL_PROJET) return { erreur: 'hors_ligne' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { erreur: 'hors_ligne' };
  try {
    const r = await fetch(`${URL_PROJET}/functions/v1/${FONCTION_DE_LA_COLLECTE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CLE_ANON, Authorization: `Bearer ${CLE_ANON}` },
      body: JSON.stringify(corps),
    });
    return (await r.json().catch(() => ({ erreur: `http_${r.status}` }))) as ReponseCollecte;
  } catch {
    return { erreur: 'reseau' };
  }
}

/** Le règlement par MTN est-il ouvert aux clientes, et à quel taux de frais ?
    Fermé quand la fonction ne répond pas ; le taux manque devant un serveur
    d'avant le 22 novembre 2026 (la page dit alors celui d'avant). */
export async function laCollecteEtSesFrais(): Promise<{ ouverte: boolean; fraisAjoutesPct?: number }> {
  if (!URL_PROJET) return { ouverte: false };
  try {
    const r = await fetch(`${URL_PROJET}/functions/v1/${FONCTION_DE_LA_COLLECTE}`, { headers: { apikey: CLE_ANON, Authorization: `Bearer ${CLE_ANON}` } });
    if (!r.ok) return { ouverte: false };
    const j = (await r.json().catch(() => ({}))) as { ouverte?: unknown; fraisAjoutesPct?: unknown };
    const t = Number(j.fraisAjoutesPct);
    return { ouverte: j.ouverte === true, ...(j.fraisAjoutesPct !== undefined && Number.isFinite(t) && t >= 0 && t <= 10 ? { fraisAjoutesPct: t } : {}) };
  } catch {
    return { ouverte: false };
  }
}
/** Le règlement par MTN est-il ouvert aux clientes ? */
export const laCollecteEstOuverte = async (): Promise<boolean> => (await laCollecteEtSesFrais()).ouverte;

export const retrouveAuComptoir = (numero: string) => appel({ action: 'comptoir', numero });
export const demandeParLeLien = (jeton: string, msisdn: string, pourboireXof: number) => appel({ action: 'demander', jeton, msisdn, pourboireXof });
export const demandeAuComptoir = (numero: string, n: number, pourboireXof: number) => appel({ action: 'demander', comptoir: { numero, n }, pourboireXof });
export const statutDeLaDemande = (reference: string) => appel({ action: 'statut', reference });

/** L'attente de la validation : une relecture toutes les quatre secondes,
    trois minutes au plus (45 lectures), puis la page le dit. */
export const ATTENTE_MTN_MS = 4_000;
export const ATTENTE_MTN_LECTURES = 45;
