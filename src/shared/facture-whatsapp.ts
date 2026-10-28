import { appelDe } from './civilite';
import { dateDite } from './bilan-document';
import { maisonNom, signeLeMessage } from './identite';
import { envoieSurWhatsApp, type ResultatDEnvoi } from './whatsapp';
import { MODELE_TAPGO, variablesTapGo } from './mnd-pay-pur';
import type { InvoicePdfData } from './pdf';
import { motDuFoyer, FACTURE_DU_FOYER_JOINTE } from './facture-du-foyer-pur';
import { motDuPoint, MODELE_DU_POINT, variablesDuPoint } from './point-du-compte-pur';

/* ══ LA FACTURE À RÉGLER PART SEULE SUR SON WHATSAPP — 17 octobre 2026 ══
   « Une facture sans aucun paiement (Honorer sans encaisser) ne part pas
   encore seule ». Même chemin que le reçu : dans la fenêtre de 24 heures,
   le PDF part avec un mot (et le lien qui compose le paiement : elle ne peut
   pas scanner le QR de l'écran qu'elle tient) ; hors fenêtre, un modèle
   approuvé, qui porte le PDF en en-tête.

   18 OCTOBRE, AU COMPTOIR : « (#132000) Number of parameters does not
   match ». Le modèle `facture_du_rituel` (rédigé le 2 octobre) a QUATRE
   variables et dit « réglée » EN DUR : il ne sert qu'à une facture payée,
   jamais à une facture à régler. Sa décision : le modèle réécrit pour la
   facture à régler, et en attendant que Meta l'approuve, le lien de
   paiement (`paiement_en_attente`, déjà approuvé), sans le PDF. Le Trône
   bascule seul le jour où Meta l'approuve : rien à republier.

   Le même jour, elle a MODIFIÉ `facture_du_rituel` chez Meta (au lieu d'en
   créer un neuf, `facture_a_regler`) : le nom reste, le contenu devient
   celui-ci. Pendant la revue, l'ancienne version (« réglée », sans bouton)
   ne peut pas partir : le Trône envoie le bouton, qu'elle n'a pas, Meta
   refuse, et c'est le lien de paiement qui part.

   Le modèle, tel que soumis le 18 octobre (catégorie Utilitaire, français) :
     en-tête : Document
     corps   : « Bonjour {{1}}, merci de votre visite du {{2}}. Voici votre
               facture {{3}}, reste à régler : {{4}}. Touchez « Régler » :
               votre téléphone compose le numéro de paiement, frais compris. »
     pied    : « mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là »
     bouton  : URL dynamique « Régler »,
               https://maisonmnd.com/trone/payer.html?tg={{1}}
   {{1}} son appel, {{2}} le jour AVEC l'année (règle de la Maison sur
   toute date qu'une cliente lit), {{3}} « ci-jointe », {{4}} le reste dû.

   POURQUOI « ci-jointe » ET PAS LE NUMÉRO (18 octobre 2026, première facture
   reçue) : WhatsApp prenait « 2026-0160 » pour un numéro de téléphone, le
   soulignait, et l'ouvrait en « Composer le +229 20 26 01 60 ». Sa décision :
   plus de numéro de pièce dans un message, il vit dans le nom du PDF
   (Facture-MND-2026-0160.pdf), qu'on touche pour l'ouvrir. */

export const MODELE_FACTURE = 'facture_du_rituel';

/** Un refus de Meta qui tient au MODÈLE (inconnu, pas encore approuvé, en
    pause, variables qui ne collent pas) : les erreurs #132xxx. */
export const refusDuModele = (erreur: string): boolean => /#132\d{3}\b/.test(erreur);

type Porteuse = Parameters<typeof appelDe>[0] & { id: string; phone?: string; branchId?: string };

/** {{3}} : jamais le numéro de la pièce (WhatsApp le prend pour un téléphone). */
export const FACTURE_JOINTE = 'ci-jointe';

/** Les quatre variables du modèle, dans son ordre. */
export const variablesDeLaFacture = (c: Porteuse, jourIso: string, resteDit: string): string[] =>
  [appelDe(c), dateDite(jourIso), FACTURE_JOINTE, resteDit];

/** Le mot qui accompagne le PDF dans la fenêtre. `enLigne` : le lien mène à
    la page « Régler sa séance » (KkiaPay, et Tap & Go à côté), 25 octobre 2026. */
export const motDeLaFacture = (c: Porteuse, jourIso: string, resteDit: string, lien?: string, enLigne = false): string =>
  signeLeMessage(`${maisonNom()} · facture\nBonjour ${appelDe(c)}, merci de votre visite du ${dateDite(jourIso)}. Voici votre facture ${FACTURE_JOINTE}, reste à régler : ${resteDit}.${lien
    ? (enLigne
      ? `\nPour régler depuis votre téléphone (MTN, Moov, Celtiis ou carte), touchez ce lien :\n${lien}`
      : `\nPour régler par mobile money, tout réseau, touchez ce lien : votre téléphone compose le numéro de paiement, frais compris.\n${lien}`)
    : ''}`);

/** `repli: 'lien'` : le modèle de la facture n'est pas (encore) approuvé, le lien de paiement est parti seul. */
export type ResultatDeLaFacture = ResultatDEnvoi & { repli?: 'lien' };

/** ENVOIE LA FACTURE À RÉGLER. Jamais d'exception : un envoi qui ne part pas se dit. */
export async function envoieLaFactureARegler(o: {
  client: Porteuse;
  pdf: InvoicePdfData;
  /** Le reste dû, tel qu'elle le lit (« 2 000 F »). */
  resteDit: string;
  jourIso: string;
  /** Tap & Go : le paramètre du bouton (« 51166-2032 »), le lien entier, le
      total frais compris dit. Sans lui, pas de bouton, donc pas de modèle. */
  tapgo?: { parametre: string; lien: string; totalDit: string };
  /** Le paramètre du bouton mène à la page « Régler sa séance » (r-<jeton>) :
      le mot le dit (25 octobre 2026). */
  enLigne?: boolean;
  /** L'identifiant de la pièce : une clé d'unicité par étape, pour que deux
      postes n'envoient pas deux fois la même facture. */
  cle?: string;
  parQui?: string;
  /** L'envoi (le vrai par défaut ; le banc en passe un faux). */
  envoie?: typeof envoieSurWhatsApp;
}): Promise<ResultatDeLaFacture> {
  const envoie = o.envoie ?? envoieSurWhatsApp;
  const tel = (o.client.phone ?? '').trim();
  if (!tel) return { ok: false, erreur: 'Pas de numéro sur sa fiche : la facture n’est pas partie.' };
  const { invoiceEnPiece } = await import('./pdf');
  const piece = await invoiceEnPiece(o.pdf);
  const base = { numero: tel, clientId: o.client.id, branchId: o.client.branchId, parQui: o.parQui };
  const cle = (etape: string) => (o.cle ? { cleUnique: `facture-${o.cle}-${etape}` } : {});

  const r = await envoie({ ...base, piece, texte: motDeLaFacture(o.client, o.jourIso, o.resteDit, o.tapgo?.lien, o.enLigne), ...cle('mot') });
  if (r.ok || !/fenêtre/i.test(r.erreur)) return r;
  if (!o.tapgo) return { ok: false, erreur: 'la fenêtre de 24 heures est fermée et Tap & Go est éteint : le modèle de la facture a besoin de son bouton de paiement.' };

  const m = await envoie({
    ...base, piece, enTete: 'document', modele: MODELE_FACTURE,
    variables: variablesDeLaFacture(o.client, o.jourIso, o.resteDit), boutonUrl: o.tapgo.parametre, ...cle('modele'),
  });
  if (m.ok || !refusDuModele(m.erreur)) return m;

  /* Le modèle neuf n'est pas (encore) approuvé : le lien de paiement, sans le PDF. */
  const l = await envoie({
    ...base, modele: MODELE_TAPGO, variables: variablesTapGo(appelDe(o.client), o.tapgo.totalDit), boutonUrl: o.tapgo.parametre, ...cle('lien'),
  });
  return l.ok ? { ...l, repli: 'lien' } : { ok: false, erreur: `${l.erreur} (et « ${MODELE_FACTURE} » : ${m.erreur})` };
}

/** LA FACTURE DU FOYER — 27 octobre 2026 : un PDF qui liste les factures de
    la journée, un seul message, le total (facture-du-foyer-pur.ts). Même
    chemin que la facture à régler : le mot dans la fenêtre de 24 heures ;
    hors fenêtre, le modèle `facture_du_rituel` déjà approuvé, le PDF en
    tête, « du foyer ci-jointe » et le total en variables, le Tap & Go du
    total en bouton ; puis le lien seul. `cle` : un jour, un numéro. */
export async function envoieLaFactureDuFoyer(o: {
  client: Porteuse;
  pdf: InvoicePdfData;
  lignes: readonly { prenom: string; resteDit: string }[];
  totalDit: string;
  jourIso: string;
  tapgo?: { parametre: string; lien: string; totalDit: string };
  /** Le paramètre du bouton mène à la page « Régler » du foyer (r-<jeton>,
      28 octobre 2026) : le mot le dit. */
  enLigne?: boolean;
  cle: string;
  parQui?: string;
  envoie?: typeof envoieSurWhatsApp;
}): Promise<ResultatDeLaFacture> {
  const envoie = o.envoie ?? envoieSurWhatsApp;
  const tel = (o.client.phone ?? '').trim();
  if (!tel) return { ok: false, erreur: 'Pas de numéro sur la fiche : la facture du foyer n’est pas partie.' };
  const { invoiceEnPiece } = await import('./pdf');
  const piece = await invoiceEnPiece(o.pdf);
  const base = { numero: tel, clientId: o.client.id, branchId: o.client.branchId, parQui: o.parQui };
  const cle = (etape: string) => ({ cleUnique: `${o.cle}-${etape}` });
  const mot = motDuFoyer({ appel: appelDe(o.client), quand: dateDite(o.jourIso), lignes: o.lignes, totalDit: o.totalDit, lien: o.tapgo?.lien, enLigne: o.enLigne });

  const r = await envoie({ ...base, piece, texte: signeLeMessage(`${maisonNom()} · facture du foyer\n${mot}`), ...cle('mot') });
  if (r.ok || !/fenêtre/i.test(r.erreur)) return r;
  if (!o.tapgo) return { ok: false, erreur: 'la fenêtre de 24 heures est fermée et Tap & Go est éteint : le modèle de la facture a besoin de son bouton de paiement.' };

  const m = await envoie({
    ...base, piece, enTete: 'document', modele: MODELE_FACTURE,
    variables: [appelDe(o.client), dateDite(o.jourIso), FACTURE_DU_FOYER_JOINTE, o.totalDit], boutonUrl: o.tapgo.parametre, ...cle('modele'),
  });
  if (m.ok || !refusDuModele(m.erreur)) return m;

  const l = await envoie({
    ...base, modele: MODELE_TAPGO, variables: variablesTapGo(appelDe(o.client), o.tapgo.totalDit), boutonUrl: o.tapgo.parametre, ...cle('lien'),
  });
  return l.ok ? { ...l, repli: 'lien' } : { ok: false, erreur: `${l.erreur} (et « ${MODELE_FACTURE} » : ${m.erreur})` };
}

/** LE POINT DU COMPTE — 28 octobre 2026 : toutes les factures qu'un payeur
    laisse courir, en un PDF et un message, avec un seul lien
    (point-du-compte-pur.ts). Le chemin du foyer : le mot dans la fenêtre de
    24 heures ; hors fenêtre, le modèle `point_du_compte` (à créer chez Meta),
    le PDF en tête, ses quatre variables, le lien en bouton ; tant que Meta ne
    l'a pas approuvé, le lien seul (`paiement_en_attente`). `cle` : un jour,
    un numéro. */
export async function envoieLePointDuCompte(o: {
  client: Porteuse;
  pdf: InvoicePdfData;
  prenoms: readonly string[];
  payeurParmiLesTetes: boolean;
  /** « 6 rituels, du 13 juin au 1er septembre 2026 » (`phraseDuPoint`). */
  phrase: string;
  totalDit: string;
  jourIso: string;
  tapgo?: { parametre: string; lien: string; totalDit: string };
  enLigne?: boolean;
  cle: string;
  parQui?: string;
  envoie?: typeof envoieSurWhatsApp;
}): Promise<ResultatDeLaFacture> {
  const envoie = o.envoie ?? envoieSurWhatsApp;
  const tel = (o.client.phone ?? '').trim();
  if (!tel) return { ok: false, erreur: 'Pas de numéro sur la fiche du payeur : le point n’est pas parti.' };
  const { invoiceEnPiece } = await import('./pdf');
  const piece = await invoiceEnPiece(o.pdf);
  const base = { numero: tel, clientId: o.client.id, branchId: o.client.branchId, parQui: o.parQui };
  const cle = (etape: string) => ({ cleUnique: `${o.cle}-${etape}` });
  const mot = motDuPoint({
    appel: appelDe(o.client), quand: dateDite(o.jourIso), prenoms: o.prenoms, payeurParmiLesTetes: o.payeurParmiLesTetes,
    phrase: o.phrase, totalDit: o.totalDit, lien: o.tapgo?.lien, enLigne: o.enLigne,
  });

  const r = await envoie({ ...base, piece, texte: signeLeMessage(`${maisonNom()} · point du compte\n${mot}`), ...cle('mot') });
  if (r.ok || !/fenêtre/i.test(r.erreur)) return r;
  if (!o.tapgo) return { ok: false, erreur: 'la fenêtre de 24 heures est fermée et Tap & Go est éteint : le modèle du point a besoin de son bouton de paiement.' };

  const m = await envoie({
    ...base, piece, enTete: 'document', modele: MODELE_DU_POINT,
    variables: variablesDuPoint(appelDe(o.client), dateDite(o.jourIso), o.phrase, o.totalDit), boutonUrl: o.tapgo.parametre, ...cle('modele'),
  });
  if (m.ok || !refusDuModele(m.erreur)) return m;

  const l = await envoie({
    ...base, modele: MODELE_TAPGO, variables: variablesTapGo(appelDe(o.client), o.tapgo.totalDit), boutonUrl: o.tapgo.parametre, ...cle('lien'),
  });
  return l.ok ? { ...l, repli: 'lien' } : { ok: false, erreur: `${l.erreur} (et « ${MODELE_DU_POINT} » : ${m.erreur})` };
}
