import { appelDe } from './civilite';
import { maisonNom, signeLeMessage } from './identite';
import { envoieSurWhatsApp, type ResultatDEnvoi } from './whatsapp';
import { LIEN_TAPGO, MODELE_TAPGO, motTapGo, parametreTapGo, variablesTapGo, type ReglagesMndPay } from './mnd-pay-pur';

/* ══ LE NUMÉRO TAP & GO PART SEUL SUR SON WHATSAPP — 17 octobre 2026 ════
   Sa décision : « automatique ». Dès que le numéro s'affiche au comptoir, le
   lien qui le compose part sur son WhatsApp. Même chemin que le reçu
   (`envoieLeRecu`) : dans la fenêtre de 24 heures, un mot libre avec le
   lien ; hors fenêtre, Meta n'accepte qu'un modèle approuvé,
   `paiement_a_composer`, dont le bouton « Composer » porte le paramètre.
   Tant que Meta ne l'a pas approuvé, le refus se dit au comptoir, et le
   numéro reste à l'écran : rien d'autre ne change.

   Le modèle à créer chez Meta (catégorie Utilitaire, français) :
     corps   : « Bonjour {{1}}, pour régler {{2}} à la Maison MND, touchez
               « Composer » : votre téléphone compose le numéro, montant
               compris. Confirmez ensuite le paiement sur votre téléphone. »
     pied    : « mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là »
     bouton  : URL dynamique « Composer »,
               https://maisonmnd.com/trone/payer.html?tg={{1}}
   {{1}} son appel (« Madame Awa »), {{2}} le montant (« 25 400 F »).

   UNE CLÉ D'UNICITÉ PAR DEMANDE : deux postes qui affichent le même numéro
   n'envoient qu'un message. */

type Porteuse = Parameters<typeof appelDe>[0] & { id?: string };

export async function envoieLeNumeroTapGo(o: {
  telephone: string;
  cliente?: Porteuse;
  totalXof: number;
  /** Le montant tel qu'elle le lit (« 25 400 F »). */
  montantDit: string;
  reglages: ReglagesMndPay | undefined;
  demandeId: string;
  branchId: string;
  parQui?: string;
  /** L'envoi (le vrai par défaut ; le banc en passe un faux). */
  envoie?: typeof envoieSurWhatsApp;
}): Promise<ResultatDEnvoi> {
  const envoie = o.envoie ?? envoieSurWhatsApp;
  const numero = (o.telephone ?? '').trim();
  if (!numero) return { ok: false, erreur: 'Pas de numéro : le lien n’est pas parti.' };
  const appel = appelDe(o.cliente ?? null);
  const parametre = parametreTapGo(o.totalXof, o.reglages);
  const base = { numero, clientId: o.cliente?.id, branchId: o.branchId, parQui: o.parQui };
  let r = await envoie({
    ...base,
    texte: signeLeMessage(`${maisonNom()} · paiement\n${motTapGo(appel, o.montantDit, `${LIEN_TAPGO}${parametre}`)}`),
    cleUnique: `tapgo-${o.demandeId}-mot`,
  });
  if (!r.ok && /fenêtre/i.test(r.erreur)) {
    r = await envoie({
      ...base, modele: MODELE_TAPGO, variables: variablesTapGo(appel, o.montantDit), boutonUrl: parametre,
      cleUnique: `tapgo-${o.demandeId}-modele`,
    });
  }
  return r;
}
