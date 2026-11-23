/* LE DEVIS EN DIRECT, VU DU TÉLÉPHONE — 22 novembre 2026.
   La page ne décide d'aucun montant : elle relit sa page au serveur à chaque
   geste (`devis-en-direct`), et c'est la fonction qui recalcule la pièce.
   Trois boutons, à ses mots, un par page : « Valider », « Oui, j'accepte le
   devis », « Oui, je confirme ma place ». */
import type { pageDuDevisEnDirect } from './devis-en-direct';

const URL_PROJET = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const CLE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
export const FONCTION_DU_DEVIS = 'devis-en-direct';

/** Ce que la fonction rend : la page, et rien d'autre. */
export type PageDuDevis = ReturnType<typeof pageDuDevisEnDirect>;

export type ReponseDuDevis = { ok?: boolean; error?: string; version?: string; page?: PageDuDevis; deja?: boolean };

async function appel(corps: Record<string, unknown>): Promise<ReponseDuDevis> {
  if (!URL_PROJET) return { error: 'hors_ligne' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: 'hors_ligne' };
  try {
    const r = await fetch(`${URL_PROJET}/functions/v1/${FONCTION_DU_DEVIS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CLE_ANON, Authorization: `Bearer ${CLE_ANON}` },
      body: JSON.stringify(corps),
    });
    return (await r.json().catch(() => ({ error: `http_${r.status}` }))) as ReponseDuDevis;
  } catch {
    return { error: 'reseau' };
  }
}

export const lisLeDevis = (jeton: string) => appel({ action: 'lire', jeton });
export const valideLeDevis = (jeton: string, modele: string, options: string[]) => appel({ action: 'valider', jeton, modele, options });
export const accepteLeDevis = (jeton: string) => appel({ action: 'accepter', jeton });
export const confirmeLaPlace = (jeton: string, jour: string, heure: string) => appel({ action: 'confirmer', jeton, jour, heure });
/** L'ACOMPTE EN LIGNE — 23 novembre 2026. La page ne dit qu'une chose : la
    transaction KkiaPay qu'elle vient de faire. La fonction la relit chez
    KkiaPay et calcule le montant elle-même. */
export const paieLAcompte = (jeton: string, transactionId: string) => appel({ action: 'payer', jeton, transactionId });
/** « Je règle à l'accueil » : la place se confirme sans argent. */
export const regleraALAccueil = (jeton: string) => appel({ action: 'accueil', jeton });

/** Ce que la page dit d'un refus, en clair. */
export const DIT_DU_DEVIS: Record<string, string> = {
  lien: 'Ce lien est incomplet. Demandez-en un nouveau à la Maison.',
  lien_introuvable: 'Ce devis n’est plus là. Demandez-en un nouveau à la Maison.',
  choix: 'Ce choix n’est plus celui du devis. Relisez-le, ou écrivez à la Maison.',
  pas_valide: 'Validez d’abord vos choix : le devis se lit avant de s’accepter.',
  deja_accepte: 'Ce devis est déjà accepté : écrivez à la Maison pour le changer.',
  place: 'Cette place n’est plus proposée. Choisissez-en une autre.',
  pas_accepte: 'Acceptez d’abord le devis : la place vient après.',
  pas_place: 'Choisissez d’abord votre place : l’acompte la confirme.',
  montant: 'Le montant reçu ne couvre pas l’acompte. La Maison vous écrira, ou vous pouvez régler à l’accueil.',
  echec: 'KkiaPay n’a pas confirmé ce paiement. Vous pouvez recommencer, ou régler à l’accueil.',
  deja: 'Cet acompte est déjà réglé.',
  trop: 'Beaucoup de demandes d’un coup. Réessayez dans un instant.',
  reseau: 'Pas de réseau pour l’instant. Réessayez dans un moment.',
  hors_ligne: 'Pas de réseau pour l’instant. Réessayez dans un moment.',
};
export const ditLeRefus = (e?: string): string => DIT_DU_DEVIS[e ?? ''] ?? 'La page ne répond pas pour l’instant. Réessayez dans un moment.';
