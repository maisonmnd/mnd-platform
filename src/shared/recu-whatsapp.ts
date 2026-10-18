import { appelDe } from './civilite';
import { dateDite } from './bilan-document';
import { maisonNom, signeLeMessage } from './identite';
import { envoieSurWhatsApp, type ResultatDEnvoi } from './whatsapp';
import type { InvoicePdfData } from './pdf';

/* ══ LE REÇU PART SEUL SUR SON WHATSAPP — 16 octobre 2026 ═══════════════
   MND PAY, sa décision : « envoyé seul sur son WhatsApp, dès que c'est
   payé ». Même chemin que le bilan de séance (`envoieLeBilan`) : dans la
   fenêtre de 24 heures, le PDF part avec un mot ; hors fenêtre, Meta
   n'accepte qu'un modèle approuvé, `recu_de_paiement`, qui porte le PDF en
   en-tête. Tant que Meta ne l'a pas approuvé, le refus se dit tel quel et
   la caissière garde le bouton « Lien WhatsApp » d'avant.

   Le modèle à créer chez Meta (catégorie Utilitaire, français) :
     en-tête : Document
     corps   : « Bonjour {{1}}, nous avons bien reçu votre règlement de {{2}}
               le {{3}}. Votre reçu est joint. »
     pied    : « mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là »
   {{1}} son appel (« Madame Awa »), {{2}} le montant, {{3}} le jour AVEC
   l'année (règle de la Maison sur toute date qu'une cliente lit). */

export const MODELE_RECU = 'recu_de_paiement';

type Porteuse = Parameters<typeof appelDe>[0] & { id: string; phone?: string; branchId?: string };

/** Les trois variables du modèle. */
export const variablesDuRecu = (c: Porteuse, montant: string, jourIso: string): string[] =>
  [appelDe(c), montant, dateDite(jourIso)];

/** Le mot qui accompagne le PDF dans la fenêtre. */
/* Sans le numéro de la pièce (18 octobre 2026) : WhatsApp prenait
   « 2026-0160 » pour un téléphone. Il vit dans le nom du PDF joint. */
export const motDuRecu = (c: Porteuse, montant: string, jourIso: string): string =>
  signeLeMessage(`${maisonNom()} · reçu\nBonjour ${appelDe(c)}, nous avons bien reçu votre règlement de ${montant} le ${dateDite(jourIso)}. Votre reçu est joint.`);

/** ENVOIE LE REÇU. Jamais d'exception : la vente est faite, un reçu qui ne
    part pas se dit à l'écran, il ne défait rien. */
export async function envoieLeRecu(o: {
  client: Porteuse;
  pdf: InvoicePdfData;
  montant: string;
  jourIso: string;
  parQui?: string;
}): Promise<ResultatDEnvoi> {
  const tel = (o.client.phone ?? '').trim();
  if (!tel) return { ok: false, erreur: 'Pas de numéro sur sa fiche : le reçu n’est pas parti.' };
  const { invoiceEnPiece } = await import('./pdf');
  const piece = await invoiceEnPiece(o.pdf);
  const base = { numero: tel, piece, clientId: o.client.id, branchId: o.client.branchId, parQui: o.parQui };
  let r = await envoieSurWhatsApp({ ...base, texte: motDuRecu(o.client, o.montant, o.jourIso) });
  if (!r.ok && /fenêtre/i.test(r.erreur)) {
    r = await envoieSurWhatsApp({
      ...base, modele: MODELE_RECU, variables: variablesDuRecu(o.client, o.montant, o.jourIso), enTete: 'document',
    });
  }
  return r;
}
