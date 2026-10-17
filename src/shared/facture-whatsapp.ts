import { appelDe } from './civilite';
import { dateDite } from './bilan-document';
import { maisonNom, signeLeMessage } from './identite';
import { envoieSurWhatsApp, type ResultatDEnvoi } from './whatsapp';
import type { InvoicePdfData } from './pdf';

/* ══ LA FACTURE À RÉGLER PART SEULE SUR SON WHATSAPP — 17 octobre 2026 ══
   « Une facture sans aucun paiement (Honorer sans encaisser) ne part pas
   encore seule » : Yéman a donné le modèle approuvé le 2 octobre (capture de
   WhatsApp Manager). Même chemin que le reçu : dans la fenêtre de 24 heures,
   le PDF part avec un mot ; hors fenêtre, le modèle `facture_du_rituel`, qui
   porte le PDF en en-tête.

   Le modèle, tel que Meta l'a approuvé (Utilitaire, français) :
     en-tête : Document
     corps   : « Bonjour {{1}}, merci de votre visite du {{2}}. Voici votre
               facture {{3}}, d'un montant de {{4}}, {{5}}. Nous serons
               heureux de vous revoir. »
     pied    : « mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là »
   Les CINQ variables sont lues sur son exemple (« Yéman », « 2 octobre »,
   « MND-0412 », « 68 000 F », « réglée ») : son appel, le jour de la visite
   (AVEC l'année, règle de la Maison sur toute date qu'une cliente lit), le
   numéro, le montant, l'état (« à régler »). Si Meta refuse le nombre, son
   refus se dit au comptoir tel quel. */

export const MODELE_FACTURE = 'facture_du_rituel';

type Porteuse = Parameters<typeof appelDe>[0] & { id: string; phone?: string; branchId?: string };

/** Les cinq variables du modèle, dans son ordre. */
export const variablesDeLaFacture = (c: Porteuse, jourIso: string, numero: string, montant: string, etat: string): string[] =>
  [appelDe(c), dateDite(jourIso), numero, montant, etat];

/** Le mot qui accompagne le PDF dans la fenêtre. */
export const motDeLaFacture = (c: Porteuse, jourIso: string, numero: string, montant: string, etat: string): string =>
  signeLeMessage(`${maisonNom()} · facture\nBonjour ${appelDe(c)}, merci de votre visite du ${dateDite(jourIso)}. Voici votre facture ${numero}, d'un montant de ${montant}, ${etat}. Le QR au bas de la facture se règle par mobile money, tout réseau.`);

/** ENVOIE LA FACTURE. Jamais d'exception : un envoi qui ne part pas se dit. */
export async function envoieLaFactureARegler(o: {
  client: Porteuse;
  pdf: InvoicePdfData;
  numero: string;
  montant: string;
  jourIso: string;
  etat?: string;
  parQui?: string;
  /** L'envoi (le vrai par défaut ; le banc en passe un faux). */
  envoie?: typeof envoieSurWhatsApp;
}): Promise<ResultatDEnvoi> {
  const envoie = o.envoie ?? envoieSurWhatsApp;
  const tel = (o.client.phone ?? '').trim();
  if (!tel) return { ok: false, erreur: 'Pas de numéro sur sa fiche : la facture n’est pas partie.' };
  const etat = o.etat ?? 'à régler';
  const { invoiceEnPiece } = await import('./pdf');
  const piece = await invoiceEnPiece(o.pdf);
  const base = { numero: tel, piece, clientId: o.client.id, branchId: o.client.branchId, parQui: o.parQui };
  let r = await envoie({ ...base, texte: motDeLaFacture(o.client, o.jourIso, o.numero, o.montant, etat) });
  if (!r.ok && /fenêtre/i.test(r.erreur)) {
    r = await envoie({
      ...base, modele: MODELE_FACTURE, variables: variablesDeLaFacture(o.client, o.jourIso, o.numero, o.montant, etat), enTete: 'document',
    });
  }
  return r;
}
