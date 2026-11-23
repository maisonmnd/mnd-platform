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
  /** Le geste offert par la Maison, déjà retranché du total (22 novembre 2026). */
  gesteXof?: number;
  pourboire: boolean;
  reference: string;
  branchId: string;
  tapgo?: { parametre: string; totalXof: number };
  /** Le foyer (28 octobre 2026) : chaque tête, son jour, ses lignes, son reste. */
  tetes?: { prenom: string; jour: string; lignes: { label: string; montantXof: number }[]; resteXof: number }[];
  /** ON VIENT DU LIEN DE L'INVITÉE (23 novembre 2026) : la page ne propose
      pas, à son tour, de « régler à deux ». */
  parInvitee?: boolean;
  /** SA PROCHAINE PLACE (23 novembre 2026) : proposée par la Maison, à la
      sortie du sceau. */
  prochainRituel?: { jour: string; heure: string; autres?: { jour: string; heure: string }[]; reponse?: 'confirmee' | 'plus-tard'; retenue?: { jour: string; heure: string } };
  /** LE JETON DE SES ÉTOILES (23 novembre 2026) : quand la Maison a déjà
      déposé sa demande d'avis pour cette pièce, la page ouvre le vrai
      bouton ; sinon elle dit « ce soir ». */
  etoilesJeton?: string;
  /** L'invitée qu'elle a nommée, et quand (le Trône le voit aussi). */
  invitee?: { nom: string; le: string };
  /** Elle a terminé elle-même (6 novembre 2026) : sa pièce se prépare au Trône, la page attend. */
  enPreparation?: boolean;
  /** Régler avant et après (7 novembre 2026) : un rendez-vous SANS PIÈCE que
      Ma Couronne a ouvert, réglé d'avance ou après coup, sur lui-même. */
  sansPiece?: 'avance' | 'apres';
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
/** LE SCEAU POSÉ — 22 novembre 2026. La page dit le moyen qu'elle a choisi ;
    la fonction le note sur le lien, le Trône voit « Elle règle » à l'instant.
    Ni montant, ni nom : l'argent ne s'écrit qu'à la confirmation de MTN ou de
    KkiaPay (`regleLeLien`). */
export const poseLeSceau = (jeton: string, moyen: string) => appel({ action: 'sceau', jeton, moyen });
/** RÉGLER À DEUX — 23 novembre 2026. Elle nomme son invitée ; la fonction
    tire un nouveau jeton pour elle (le précédent s'éteint) et rend ce jeton. */
export const inviteAUnePart = (jeton: string, nom: string) => appel({ action: 'inviter', jeton, nom });
/** SA PROCHAINE PLACE — 23 novembre 2026. geste : « confirmer » la place
    proposée, « choisir » une des autres (jour et heure donnés), ou
    « plus-tard ». Une réponse ne se réécrit pas. */
export const repondsAuProchainRituel = (jeton: string, geste: 'confirmer' | 'choisir' | 'plus-tard', place?: { jour: string; heure: string }) =>
  appel({ action: 'prochain', jeton, geste, ...(place ? { jour: place.jour, heure: place.heure } : {}) });

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

/** Elle sait régler un foyer d'un seul paiement (28 octobre 2026). */
export const saitReglerLeFoyer = (v: string): boolean => v >= '2026-10-28-a';

/** Elle sait régler le point d'un compte sur PLUSIEURS jours : chaque ligne
    porte son jour, chaque prénom une fois (28 octobre 2026, 2026-10-28-b).
    Avant elle, un point de plusieurs jours garde le Tap & Go du total. */
export const saitReglerLePoint = (v: string): boolean => v >= '2026-10-28-b';
