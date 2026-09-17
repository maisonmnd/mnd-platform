import { supabase } from './supabase';
import type { PublicDeFormation } from './parcours';

/* ══ LES DEMANDES D'INSCRIPTION À L'ACADÉMIE — 17 septembre 2026 ═══════
   « Il faut réserver massivement » puis « brancher un paiement avec KkiaPay
   quand le client choisit de réserver un parcours » (Yéman). Maquette
   `public/maquette-lacademie-au-monde.html`, validée : une demande SANS
   COMPTE, qui tombe dans le Suivi de l'Académie.

   CE FICHIER EST PUR, SAUF LE DÉPÔT. Il juge ce qui manque à une demande et
   ce qu'elle doit d'acompte ; il ne lit jamais la file. Le site public
   n'écrit qu'une ligne et ne relit rien — la base le lui interdit
   (migration 0106), et c'est voulu : une file publique qu'on peut relire
   est un fichier de prospects offert au premier venu.

   L'ACOMPTE EST ÉCRIT AVANT LE PAIEMENT. `kkiapay-verify` relit
   `acompteXof` sur la ligne pour contrôler ce qui a été payé : le montant
   attendu vient du serveur, jamais du navigateur. C'est la règle posée le
   24 août sur les rendez-vous, et elle vaut ici pour la même raison : sans
   elle, une inscription à 450 000 F se validerait avec 100 F. */

export const TABLE_DEMANDES = 'academie_demandes';

/** L'acompte de l'Académie, en pourcentage — le même que celui du Suivi
    (`DEFAULT_DEPOSIT_PCT`, equipe/academy.ts). Il n'est pas importé d'ici :
    ce module doit rester lisible par une page publique, qui n'emporte pas
    l'ERP avec elle. */
export const ACOMPTE_PCT = 40;

export const acompteDe = (prixXof: number): number =>
  Math.max(0, Math.round((prixXof * ACOMPTE_PCT) / 100));

export type StatutDeLaDemande = 'nouvelle' | 'rappelee' | 'inscrite' | 'ecartee';

export type DemandeAcademie = {
  id: string;
  branchId: string;
  creeLe: string;
  parcoursId: string;
  /** Le titre au moment de la demande : un parcours renommé ne rend pas la
      file illisible. */
  parcoursTitre: string;
  nom: string;
  telephone: string;
  ville?: string;
  public: PublicDeFormation;
  mot?: string;
  prixXof: number;
  /** Ce qu'on attend d'elle pour tenir la place. Écrit à la création. */
  acompteXof: number;
  /** Posé par le SERVEUR après vérification chez KkiaPay, jamais par l'écran. */
  acompteConfirme?: boolean;
  acompteVerseXof?: number;
  transactionId?: string;
  payeLe?: string;
  statut: StatutDeLaDemande;
  /** Ce que la Maison en a fait : l'inscription ouverte au Suivi. */
  enrollmentId?: string;
  traiteLe?: string;
  traitePar?: string;
};

/** CE QUI MANQUE À UNE DEMANDE, en une phrase, ou `null`. Deux réponses
    seulement sont exigées : sans nom on ne sait qui rappeler, sans numéro on
    ne peut pas rappeler. Chaque case de plus coûte des demandes. */
export function pourquoiLaDemandeNeVaPas(d: {
  nom: string; telephone: string; parcoursId: string;
}): string | null {
  if (d.nom.trim().length < 2) return 'Dites-nous votre nom, pour savoir qui rappeler.';
  const chiffres = d.telephone.replace(/\D/g, '');
  if (chiffres.length < 8) return 'Un numéro de téléphone complet, pour vous rappeler.';
  if (!d.parcoursId) return 'Choisissez le parcours qui vous intéresse.';
  return null;
}

/** Le numéro, réduit à ses chiffres (l'indicatif garde son plus). */
export const numeroPropre = (tel: string): string => {
  const t = tel.trim();
  const chiffres = t.replace(/\D/g, '');
  return t.startsWith('+') ? `+${chiffres}` : chiffres;
};

export const nouvelleDemande = (o: {
  id: string; branchId: string; parcoursId: string; parcoursTitre: string;
  nom: string; telephone: string; ville?: string; public: PublicDeFormation; mot?: string;
  prixXof: number; quand: string;
}): DemandeAcademie => ({
  id: o.id,
  branchId: o.branchId,
  creeLe: o.quand,
  parcoursId: o.parcoursId,
  parcoursTitre: o.parcoursTitre,
  nom: o.nom.trim(),
  telephone: numeroPropre(o.telephone),
  ville: o.ville?.trim() || undefined,
  public: o.public,
  mot: o.mot?.trim() || undefined,
  prixXof: o.prixXof,
  acompteXof: acompteDe(o.prixXof),
  statut: 'nouvelle',
});

/** DÉPOSER LA DEMANDE. Rend `true` si la ligne est écrite. Jamais
    d'exception : une visiteuse qui a rempli le formulaire ne doit pas voir
    un écran cassé parce que le réseau a bronché. */
export async function deposeUneDemande(d: DemandeAcademie): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from(TABLE_DEMANDES).insert({
    id: d.id, branch_id: d.branchId || null, data: d,
  });
  if (error) { console.warn('[mnd-academie] dépôt refusé :', error.message); return false; }
  return true;
}
