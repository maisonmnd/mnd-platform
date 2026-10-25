/* LA PAGE « RÉGLER SA SÉANCE » PARLE À SA FONCTION — 25 octobre 2026.
   La cliente n'a pas de compte : la fonction Edge `regler-la-seance` (Verify
   JWT éteint) lit le lien et pose le règlement. Le montant se décide au
   serveur, jamais ici. Voir regler-la-seance-pur.ts. */
import type { EtatDuLien } from './regler-la-seance-pur';

const URL_PROJET = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const CLE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
export const FONCTION_DU_REGLEMENT = 'regler-la-seance';

export type PageDuLien = {
  etat: EtatDuLien;
  prenom: string;
  maitre: string;
  jour: string;
  lignes: { label: string; montantXof: number }[];
  totalXof: number;
  recuXof: number;
  resteXof: number;
  pourboire: boolean;
  reference: string;
  branchId: string;
  tapgo?: { parametre: string; totalXof: number };
};

export type Reponse = { ok?: boolean; error?: string; version?: string; page?: PageDuLien; [k: string]: unknown };

async function appel(corps: Record<string, unknown>): Promise<Reponse> {
  if (!URL_PROJET) return { error: 'hors_ligne' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: 'hors_ligne' };
  try {
    const r = await fetch(`${URL_PROJET}/functions/v1/${FONCTION_DU_REGLEMENT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CLE_ANON, Authorization: `Bearer ${CLE_ANON}` },
      body: JSON.stringify(corps),
    });
    return (await r.json().catch(() => ({ error: `http_${r.status}` }))) as Reponse;
  } catch {
    return { error: 'reseau' };
  }
}

export const lisLeLien = (jeton: string) => appel({ action: 'lire', jeton });
export const rattrapeLeLien = (jeton: string) => appel({ action: 'rattraper', jeton });
export const regleLeLien = (jeton: string, transactionId: string) => appel({ action: 'regler', jeton, transactionId });

/** La version que la fonction dit (GET, sans clé de service), ou '' si elle
    n'est pas encore posée : le Trône n'envoie le lien que quand elle répond. */
let versionLue: Promise<string> | null = null;
export function versionDuReglement(): Promise<string> {
  if (versionLue) return versionLue;
  versionLue = (async () => {
    if (!URL_PROJET) return '';
    try {
      const r = await fetch(`${URL_PROJET}/functions/v1/${FONCTION_DU_REGLEMENT}`, { headers: { apikey: CLE_ANON, Authorization: `Bearer ${CLE_ANON}` } });
      if (!r.ok) return '';
      const j = (await r.json().catch(() => ({}))) as { version?: string };
      return String(j.version ?? '');
    } catch {
      return '';
    }
  })();
  /* Un échec ne se garde pas : la prochaine fin de séance redemande. */
  void versionLue.then((v) => { if (!v) versionLue = null; });
  return versionLue;
}

/** La fonction répond, et sait régler une séance après coup (lot 1). */
export const saitRegler = (v: string): boolean => v >= '2026-10-25-a';
