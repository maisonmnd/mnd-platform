/* LA BOUTIQUE PARLE À SA FONCTION — 22 octobre 2026.
   Le site (sans compte) et Ma Couronne (avec son jeton) passent par la
   fonction Edge `boutique` pour commander, régler et « Me prévenir » : le prix
   et l'ouverture se décident au serveur, jamais ici. Voir boutique-pur.ts. */
import type { LigneDemandee, Remise } from './boutique-pur';

const URL_PROJET = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const CLE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export type ReponseBoutique = { ok?: boolean; error?: string; id?: string; version?: string; [k: string]: unknown };

async function appel(corps: Record<string, unknown>, jeton?: string): Promise<ReponseBoutique> {
  if (!URL_PROJET) return { error: 'hors_ligne' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: 'hors_ligne' };
  try {
    const r = await fetch(`${URL_PROJET}/functions/v1/boutique`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CLE_ANON, Authorization: `Bearer ${jeton || CLE_ANON}` },
      body: JSON.stringify(corps),
    });
    return (await r.json().catch(() => ({ error: `http_${r.status}` }))) as ReponseBoutique;
  } catch {
    return { error: 'reseau' };
  }
}

export type Commande = {
  lignes: LigneDemandee[];
  remise: Remise;
  adresse?: string;
  nom?: string;
  numero?: string;
  paiement: 'kkiapay' | 'maison';
  origine: 'site' | 'couronne';
};
export type CommandeEcrite = { ok: true; commandeId: string; numero: string; totalXof: number; reference: string; branchId: string };

export const commanderALaBoutique = (c: Commande, jeton?: string) =>
  appel({ action: 'commander', ...c }, jeton) as Promise<ReponseBoutique & Partial<CommandeEcrite>>;
export const reglerLaCommande = (commandeId: string, transactionId: string) =>
  appel({ action: 'regler', commandeId, transactionId });
export const prevenirALArrivee = (produitId: string, numero: string, nom?: string, jeton?: string) =>
  appel({ action: 'prevenir', produitId, numero, nom }, jeton);

/** Ce qu'une cliente lit quand le serveur refuse : jamais un code. */
export function motDuRefus(e: string | undefined): string {
  switch (e) {
    case 'fermee': return 'La Boutique n’est pas encore ouverte.';
    case 'pas-en-vente': return 'Un article du panier n’est plus en vente. Retirez-le, puis recommencez.';
    case 'stock': return 'Il n’en reste pas assez pour un article du panier. Baissez la quantité, puis recommencez.';
    case 'taille': return 'Choisissez une taille pour chaque vêtement.';
    case 'perso': return 'Le t-shirt Nom de couronne attend son nom.';
    case 'adresse': return 'La livraison attend une adresse ou un repère.';
    case 'coordonnees': return 'Votre nom et un numéro WhatsApp à huit chiffres, pour que la Maison vous écrive.';
    case 'trop': case 'trop_de_commandes': return 'Beaucoup de demandes d’un coup. Réessayez dans quelques minutes.';
    case 'montant': return 'Le paiement reçu ne couvre pas la commande. La Maison vous recontacte.';
    case 'hors_ligne': case 'reseau': return 'Pas de connexion. Votre panier reste là, réessayez dans un instant.';
    default: return 'La commande n’a pas pu partir. Réessayez dans un instant, ou appelez la Maison.';
  }
}
