/* LA PAGE « RÉGLER » PARLE À FEDAPAY — 12 novembre 2026 (le choix du moyen, lot C).
   Le secours de KkiaPay : l'entrée publique `regler-*` de la fonction
   `mnd-pay`, par le jeton du rendez-vous, sans session (la page n'a qu'une
   clé publique). Le montant se décide au serveur, jamais ici : la page ne
   donne que son jeton, le merci choisi et sa propre adresse (que le serveur
   vérifie). Règles : regler-par-fedapay-pur.ts. */
import type { ReglagesMndPay } from './mnd-pay-pur';

const URL_PROJET = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const CLE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
export const FONCTION_FEDAPAY = 'mnd-pay';

/** La page relit la demande toutes les quatre secondes, trois minutes au plus (comme pour MTN). */
export const ATTENTE_FEDAPAY_MS = 4_000;
export const ATTENTE_FEDAPAY_LECTURES = 45;

export type EtatFedaPay = 'attente' | 'payee' | 'refusee' | 'expiree' | 'annulee';
export type ReponseFedaPay = {
  ok?: boolean; erreur?: string; version?: string;
  /* regler-ouvert */
  ouverte?: boolean; taux?: Pick<ReglagesMndPay, 'tauxMobilePct' | 'tauxCartePct'>;
  /* regler-demander */
  id?: string; url?: string; montantXof?: number; pourboireXof?: number; fraisXof?: number; totalXof?: number; deja?: boolean;
  /* regler-statut */
  etat?: EtatFedaPay; regleXof?: number; honore?: boolean;
};

async function appel(corps: Record<string, unknown>): Promise<ReponseFedaPay> {
  if (!URL_PROJET) return { erreur: 'hors_ligne' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { erreur: 'hors_ligne' };
  try {
    const r = await fetch(`${URL_PROJET}/functions/v1/${FONCTION_FEDAPAY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CLE_ANON, Authorization: `Bearer ${CLE_ANON}` },
      body: JSON.stringify(corps),
    });
    return (await r.json().catch(() => ({ erreur: `http_${r.status}` }))) as ReponseFedaPay;
  } catch {
    return { erreur: 'reseau' };
  }
}

/** FedaPay est-il ouvert, et à quels taux (les frais se disent avant le geste) ? */
export const fedapayOuvertPourLaPage = (jeton: string) => appel({ action: 'regler-ouvert', jeton });
/** La demande : son jeton, son merci, l'adresse de cette page (le serveur la vérifie). */
export const demandeFedaPay = (jeton: string, pourboireXof: number, retour: string) =>
  appel({ action: 'regler-demander', jeton, pourboireXof, retour });
/** L'état de CETTE demande, relu chez FedaPay par le serveur. */
export const statutFedaPay = (jeton: string, id: string) => appel({ action: 'regler-statut', jeton, id });
