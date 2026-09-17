import { fmtMoney } from './currency';
import type { OnlineConsultation } from './bridges';

/* CE QU'UNE CONSULTATION EN LIGNE A VRAIMENT RÉGLÉ — 17 septembre 2026.

   Jusqu'ici le Trône lisait « 15 000 F crédités » sur chaque consultation :
   le tunnel annonçait ce montant après un paiement SIMULÉ, et personne ne
   l'avait encaissé. Désormais `paidXof` est posé par le serveur seul
   (`push-notify`, mode tunnel-submit, relit le registre des paiements ;
   `kkiapay-verify` le pose sur une ligne déjà déposée). Ce module dit, en
   une phrase, ce que la Maison a reçu, et il est le SEUL à le dire : les
   deux écrans du Trône le lisent, aucun ne recompose la phrase. */

export type Reglement = NonNullable<OnlineConsultation['reglement']>;

export type LectureDuReglement = {
  /** Vrai seulement quand le serveur a inscrit un montant reçu. */
  regle: boolean;
  libelle: string;
};

export function litLeReglement(
  c: Pick<OnlineConsultation, 'paidXof' | 'reglement' | 'transactionId'> & { client?: { currency?: string } },
): LectureDuReglement {
  const devise = c.client?.currency || 'XOF';
  const paye = Math.max(0, Math.round(Number(c.paidXof ?? 0)));
  if (paye > 0) {
    const ref = c.transactionId ? ` · réf. ${c.transactionId}` : '';
    return { regle: true, libelle: `${fmtMoney(paye, devise)} réglés en ligne${ref}` };
  }
  if (c.reglement === 'declare') return { regle: false, libelle: 'règlement Mobile Money déclaré, à rapprocher' };
  return { regle: false, libelle: 'à régler à la Maison' };
}

export const ditLeReglement = (c: Parameters<typeof litLeReglement>[0]): string => litLeReglement(c).libelle;
