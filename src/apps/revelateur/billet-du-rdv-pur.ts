/* LE BILLET DU RENDEZ-VOUS, SUR LE SITE — 6 novembre 2026 (« Terminer et
   régler », la porte de maisonmnd.com). « Quand le client termine son
   rendez-vous, il peut aller sur maisonmnd.com, mettre son code de
   confirmation et passer au règlement. Un peu comme sur les sites d'avion »
   (Yéman).

   Deux écrans, un seul îlot (MonRendezVous) :
   · /mon-rendez-vous/ : « Retrouver mon rendez-vous », son code ET les 4
     derniers chiffres du numéro auquel la Maison a confirmé. Trouvé, la
     fonction rend le jeton signé de la page /rdv/ : la page y mène.
   · /rdv/?v=<jeton> : le billet. Avant le jour : déplacer, annuler, l'agenda
     (comme depuis le 3 novembre 2026), et ce qui sera à régler. Le jour
     même, dès l'heure du rituel : « Terminer et régler », qui mène à la page
     « Régler » (KkiaPay, le merci pour l'équipe).

   Ce fichier est PUR : ce que la fonction `terminer-et-regler` rend, relu
   avant d'être cru, et les mots que la cliente lit. Le montant vient
   toujours du serveur. La règle vit dans shared/terminer-et-regler-pur.ts. */
import { codeLu, quatreChiffresLus, type BilletDeLaFin, type EtatDuBillet, type RaisonDeLaPorte } from '../../shared/terminer-et-regler-pur';

export const FONCTION_DE_LA_FIN = 'terminer-et-regler';
/** La page où le code et les quatre chiffres retrouvent le rendez-vous. */
export const CHEMIN_POUR_RETROUVER = 'mon-rendez-vous/';

const ETATS: readonly EtatDuBillet[] = ['confirme', 'en-cours', 'termine', 'regle', 'annule', 'passe'];

/** Le billet tel que la fonction le rend, ou null s'il n'a pas sa forme. */
export function billetLu(brut: unknown): BilletDeLaFin | null {
  const b = brut as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return null;
  const porte = b.porte as { ouverte?: unknown; raison?: unknown } | null;
  if (typeof b.reference !== 'string' || typeof b.jour !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.jour)) return null;
  if (!ETATS.includes(b.etat as EtatDuBillet) || !porte || typeof porte.ouverte !== 'boolean' || typeof porte.raison !== 'string') return null;
  const reste = b.resteXof === null || b.resteXof === undefined ? null : Number(b.resteXof);
  if (reste !== null && (!Number.isFinite(reste) || reste < 0)) return null;
  return {
    reference: b.reference, prenom: typeof b.prenom === 'string' ? b.prenom : '', jour: b.jour, heure: typeof b.heure === 'string' ? b.heure : '',
    etat: b.etat as EtatDuBillet, resteXof: reste === null ? null : Math.round(reste),
    porte: { ouverte: porte.ouverte, raison: porte.raison as RaisonDeLaPorte }, aTermine: b.aTermine === true,
  };
}

/** CE QUE LA RECHERCHE A RENDU. `introuvable` dit la même chose pour un code
    inconnu et pour des chiffres faux : le serveur ne les distingue pas, la
    page non plus. */
export type RechercheDuRdv = { etat: 'trouve'; v: string; billet: BilletDeLaFin } | { etat: 'introuvable' } | { etat: 'trop' } | { etat: 'panne' };
export function rechercheLue(r: unknown, statut?: number): RechercheDuRdv {
  const x = r as { ok?: unknown; error?: unknown; v?: unknown; billet?: unknown } | null;
  if (statut === 429 || x?.error === 'trop') return { etat: 'trop' };
  if (!x || typeof x !== 'object') return { etat: 'panne' };
  if (x.ok !== true) return x.error === 'introuvable' ? { etat: 'introuvable' } : { etat: 'panne' };
  const billet = billetLu(x.billet);
  if (!billet || typeof x.v !== 'string' || !/^[A-Za-z0-9_-]{1,120}\.[A-Za-z0-9_-]{22}$/.test(x.v)) return { etat: 'panne' };
  return { etat: 'trouve', v: x.v, billet };
}

/** Le billet relu par son jeton signé (la page /rdv/). */
export function billetDeLaPageLu(r: unknown): BilletDeLaFin | null {
  const x = r as { ok?: unknown; billet?: unknown } | null;
  return x && typeof x === 'object' && x.ok === true ? billetLu(x.billet) : null;
}

/** CE QUE « TERMINER » A RENDU : l'adresse de la page « Régler », ou pourquoi
    la porte est restée fermée. L'adresse n'est crue que si elle mène à la
    page de règlement de la Maison. */
export type FinDemandee = { etat: 'a-regler'; adresse: string } | { etat: 'ferme'; raison: string } | { etat: 'trop' } | { etat: 'panne' };
export function finLue(r: unknown, statut?: number): FinDemandee {
  const x = r as { ok?: unknown; error?: unknown; etat?: unknown; adresse?: unknown } | null;
  if (statut === 429 || x?.error === 'trop') return { etat: 'trop' };
  if (!x || typeof x !== 'object' || x.ok !== true || typeof x.etat !== 'string') return { etat: 'panne' };
  if (x.etat !== 'a-regler') return { etat: 'ferme', raison: x.etat };
  return typeof x.adresse === 'string' && /^https:\/\/maisonmnd\.com\/trone\/payer\.html\?tg=r-[23456789a-z]{14}$/.test(x.adresse)
    ? { etat: 'a-regler', adresse: x.adresse } : { etat: 'panne' };
}

/* ── Le formulaire « Retrouver mon rendez-vous » ───────────────────────── */

/** Ce qui manque à la saisie avant d'appeler le serveur, ou null. */
export function saisieARevoir(code: string, chiffres: string): { champ: 'code' | 'chiffres'; dit: string } | null {
  if (!codeLu(code)) return { champ: 'code', dit: 'Le code s’écrit MND suivi de quatre signes, par exemple MND-7K3Q.' };
  if (!quatreChiffresLus(chiffres)) return { champ: 'chiffres', dit: 'Quatre chiffres : les derniers de votre numéro.' };
  return null;
}
/** Le code posé dans l'adresse (`?code=MND-7K3Q`, le lien du WhatsApp de la Maison). */
export const codeDeLAdresse = (recherche: string): string => {
  try { return codeLu(new URLSearchParams(recherche).get('code') ?? '') ?? ''; } catch { return ''; }
};
export const MOTS_DE_LA_RECHERCHE = {
  sur: 'Mon rendez-vous',
  titre: 'Retrouver mon rendez-vous',
  intro: 'Votre code de confirmation est dans le message WhatsApp de la Maison : « Votre référence : MND-… ».',
  code: 'Code de confirmation',
  chiffres: 'Les 4 derniers chiffres de votre numéro',
  aide: 'Le numéro auquel la Maison vous a confirmé.',
  bouton: 'Retrouver mon rendez-vous',
  billet: 'Comme la référence d’un billet d’avion : le code retrouve votre rendez-vous, vos quatre chiffres disent que c’est bien vous.',
  perdu: 'Code perdu ? Écrivez à la Maison sur WhatsApp.',
  motPourLeCode: 'Bonjour, je ne retrouve pas le code de confirmation de mon rendez-vous.',
  introuvable: 'Nous ne retrouvons pas ce rendez-vous. Vérifiez votre code et vos quatre chiffres, ou écrivez à la Maison.',
  trop: 'Beaucoup d’essais d’un coup. Réessayez dans un moment, ou écrivez à la Maison.',
  panne: 'La recherche ne répond pas. Réessayez dans un moment, ou écrivez à la Maison.',
} as const;

/* ── Le règlement, sur le billet ───────────────────────────────────────── */

export const francsDits = (xof: number): string => `${String(Math.round(xof)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;

export type ReglementDit = {
  sur: string;
  phrase: string;
  /** Le montant, quand le serveur le connaît. */
  montant?: string;
  /** Le bouton, seulement quand la porte est ouverte. */
  bouton?: 'Terminer et régler' | 'Régler mon rituel';
  note?: string;
  /** Le jour même, le rituel a commencé : Déplacer et Annuler n'ont plus lieu d'être. */
  leJourMeme: boolean;
};

/** CE QUE LE BILLET DIT DU RÈGLEMENT, ou null quand il n'y a rien à en dire
    (annulé, passé, clos au comptoir). Le bouton ne paraît que porte ouverte. */
export function reglementDuBillet(b: BilletDeLaFin): ReglementDit | null {
  const montant = b.resteXof !== null && b.resteXof > 0 ? francsDits(b.resteXof) : undefined;
  const merci = b.prenom ? `Merci, ${b.prenom}.` : 'Merci.';
  if (b.etat === 'regle') {
    return { sur: 'Réglé', phrase: `${merci} Vous pouvez partir : la Maison est prévenue.`, note: 'Votre reçu arrive sur WhatsApp, la facture jointe.', leJourMeme: true };
  }
  if (b.porte.ouverte) {
    return b.aTermine || b.etat === 'termine'
      ? { sur: 'Votre règlement vous attend', phrase: 'L’équipe est prévenue. Réglez depuis votre téléphone, sans passer au comptoir.', ...(montant ? { montant } : {}), bouton: 'Régler mon rituel', leJourMeme: true }
      : {
          sur: 'Votre rituel est en cours',
          phrase: 'Quand l’équipe a fini, terminez ici : vous réglez depuis votre téléphone et vous partez sans passer au comptoir.',
          ...(montant ? { montant } : {}), bouton: 'Terminer et régler',
          note: 'Si l’équipe ajoute un soin ou un produit, le montant se met à jour sur la page du règlement.', leJourMeme: true,
        };
  }
  if (b.porte.raison === 'comptoir') return { sur: 'Votre règlement', phrase: 'Pour votre règlement, l’équipe vous attend au comptoir.', leJourMeme: b.etat === 'en-cours' };
  if (b.porte.raison === 'rien-a-regler') return { sur: 'Rien à régler', phrase: 'Il n’y a rien à régler pour ce rendez-vous.', leJourMeme: b.etat === 'en-cours' };
  if (b.porte.raison === 'avant-l-heure' || b.porte.raison === 'pas-encore-le-jour') {
    return {
      sur: 'À régler', ...(montant ? { montant } : {}),
      phrase: 'Le jour de votre rituel, dès son heure, le bouton « Terminer et régler » paraît ici : vous réglez depuis votre téléphone.', leJourMeme: false,
    };
  }
  return null;
}

/** Pourquoi « Terminer » n'a rien ouvert, en une phrase pour la cliente. */
export function refusDit(raison: string): string {
  if (raison === 'deja-regle') return 'Ce rendez-vous est déjà réglé. Merci.';
  if (raison === 'rien-a-regler') return 'Il n’y a rien à régler pour ce rendez-vous.';
  if (raison === 'comptoir') return 'Pour votre règlement, l’équipe vous attend au comptoir.';
  if (raison === 'avant-l-heure' || raison === 'pas-encore-le-jour') return 'Ce bouton s’allume à l’heure de votre rituel.';
  if (raison === 'annule') return 'Ce rendez-vous est annulé : il n’y a rien à régler.';
  return 'Le règlement en ligne n’est pas ouvert pour ce rendez-vous. L’équipe vous répond au comptoir ou sur WhatsApp.';
}
