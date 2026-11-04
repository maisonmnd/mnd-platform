import { useEffect, useRef } from 'react';
import { useAuth } from '../../../shared/auth';
import { useBranch } from '../../../shared/branches';
import { fmtMoney } from '../../../shared/currency';
import { useClients } from '../../../shared/clients';
import { appelDe } from '../../../shared/civilite';
import { dateDite } from '../../../shared/bilan-document';
import { invoiceResteXof, useInvoices } from '../../../shared/finance';
import { useSettings } from '../../../shared/settings';
import { supabase } from '../../../shared/supabase';
import { tablePrete } from '../../../shared/sync';
import { useAppointments } from '../../../shared/agenda';
import { numeroWa } from '../../../shared/conversations';
import { deposeLaCarte } from '../../../shared/merci-en-salle';
import { EN_ATTENTE, PERIME, REGLES_PAR_DEFAUT, heureDeDepart } from '../../../shared/salle-des-envois';
import { MODELE_RECU, variablesDuRecu } from '../../../shared/recu-whatsapp';
import { FACTURE_JOINTE, MODELE_FACTURE, variablesDeLaFacture } from '../../../shared/facture-whatsapp';
import { MODELE_TAPGO, jourLocal, paiementTapGoDeLaPiece, parametreTapGo, variablesTapGo } from '../../../shared/mnd-pay-pur';
import { decisionDEnvoi } from '../../../shared/une-piece-un-message-pur';
import { A_PREPARER, TYPE_DU_PAPIER } from '../../../shared/cloture-du-jour-pur';
import { useEnvois } from '../routes/equipe/data';
import { useLaPieceEnPdf } from '../routes/vente/pdf-de-la-piece';
import { useServicesById } from '../routes/clients/_shared';
import { honorAppointment } from '../routes/clients/actions';

/* ══ LA MAIN DE GRENAT AU TRÔNE — 4 novembre 2026 ═══════════════════════
   Grenat est une fonction du serveur (`cloture-du-jour`), mais deux de ses
   gestes sûrs ont besoin du Trône, qui seul sait les faire juste :

   ① LE PAPIER D'UNE PIÈCE. Le PDF de la facture ne se fait qu'ici. Grenat
      dépose en salle une ligne « à-préparer » (sans colis) ; un poste ouvert
      du personnel la relit (la pièce existe, son papier n'est pas parti, sa
      fiche le veut, le jour n'est pas passé : `decisionDEnvoi`, une pièce =
      un seul WhatsApp), fait le PDF, le dépose chez Meta (le dépôt seul de
      `whatsapp-envoi`), et pose la ligne « en-attente » avec son colis :
      dix minutes de salle, retenable, écartable ; le facteur
      (`envois-partent`) la porte, réserve la clé de la pièce et pose sa
      marque. L'écriture ne passe que si la ligne est encore « à-préparer » :
      deux postes ouverts n'en préparent qu'un.

   ② LES SUITES D'UN HONNEUR. Grenat passe « honoré » un rendez-vous réglé
      en entier (`honoreParGrenat`) ; les points, le stock, la mission du
      prestataire et la reprise se font au Trône (`honorAppointment`), comme
      au comptoir. Un poste RÉSERVE d'abord la suite au serveur (une écriture
      conditionnelle sur `suitesLe`) : un seul la fait.

   Jamais d'exception : un papier qui ne se prépare pas devient « périmé »
   avec son motif, ou attend le prochain passage de Grenat. */

const fait = new Set<string>();

export function useLaMainDeGrenat(): void {
  const { session } = useAuth();
  const { branch, currency } = useBranch();
  const [envois] = useEnvois();
  const [invoices] = useInvoices();
  const [clients] = useClients();
  const [appts] = useAppointments();
  const [settings] = useSettings();
  const byId = useServicesById();
  const { buildPdfData } = useLaPieceEnPdf();
  const enCours = useRef(false);

  /* ① Les papiers à préparer. */
  useEffect(() => {
    const sb = supabase;
    if (!session || !sb || enCours.current || !tablePrete('envois') || !tablePrete('invoices') || !tablePrete('clients')) return;
    const aPreparer = envois.filter((e) => e.type === TYPE_DU_PAPIER && e.statut === A_PREPARER && (e.branchId ?? branch.id) === branch.id && !fait.has(e.id));
    if (!aPreparer.length) return;
    enCours.current = true;
    void (async () => {
      try {
        const aujourdhui = jourLocal(new Date().toISOString());
        for (const e of aPreparer) {
          fait.add(e.id);
          const ligne = e as typeof e & { invoiceId?: string; jour?: string; papier?: 'recu' | 'facture'; montantXof?: number };
          const ecris = async (data: Record<string, unknown>) => {
            await sb.from('envois').update({ data: { ...ligne, ...data, quand: new Date().toISOString() } })
              .eq('id', ligne.id).eq('data->>statut', A_PREPARER);
          };
          const piece = invoices.find((i) => i.id === ligne.invoiceId);
          if (!piece) { await ecris({ statut: PERIME, detail: 'la pièce n’existe plus' }); continue; }
          const decision = decisionDEnvoi({ piece, geste: 'auto', instant: new Date().toISOString() });
          if (!decision.envoie) { await ecris({ statut: PERIME, detail: `papier ${decision.motif}` }); continue; }
          /* « Ne pas faire voir mon retard aux clients » : le jour du dépôt seulement. */
          if ((ligne.jour ?? '') !== aujourdhui) { await ecris({ statut: PERIME, detail: 'le jour est passé : le retard reste invisible' }); continue; }
          const payeuse = clients.find((c) => c.id === piece.clientId);
          const soignee = clients.find((c) => c.id === (piece.forClientId ?? piece.clientId));
          const destinataire = payeuse?.phone?.trim() ? payeuse : soignee;
          const numero = numeroWa(destinataire?.phone ?? '');
          if (!destinataire || !numero) { await ecris({ statut: PERIME, detail: 'pas de numéro sur la fiche' }); continue; }
          if (destinataire.sansPapiersWa === true) { await ecris({ statut: PERIME, detail: 'sa fiche refuse le reçu et la facture par WhatsApp' }); continue; }

          const pdf = buildPdfData(piece);
          const { invoiceEnPiece } = await import('../../../shared/pdf');
          const doc = await invoiceEnPiece(pdf);
          const mediaId = await deposeLaCarte(doc);
          if (!mediaId) { await ecris({ statut: 'échec', detail: 'le PDF n’a pas pu être déposé chez Meta : Grenat le reprendra' }); continue; }
          const enTete = { type: 'header', parameters: [{ type: 'document', document: { id: mediaId, filename: doc.nom } }] };
          const corps = (vars: string[]) => ({ type: 'body', parameters: vars.map((t) => ({ type: 'text', text: t.replace(/\s+/g, ' ').trim() })) });
          const bouton = (param: string) => ({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: param }] });
          const jourDuRituel = appts.find((a) => a.id === piece.apptId)?.date ?? piece.date;
          let colis: Record<string, unknown>;
          if ((ligne.papier ?? 'recu') === 'recu') {
            const vars = variablesDuRecu(destinataire, fmtMoney(ligne.montantXof ?? 0, currency), aujourdhui);
            colis = {
              genre: 'whatsapp', numero, modele: MODELE_RECU, composants: [enTete, corps(vars)], parQui: 'Grenat',
              texteAuFil: `Bonjour ${vars[0]}, nous avons bien reçu votre règlement de ${vars[1]} le ${vars[2]}. Votre reçu est joint.`,
            };
          } else {
            /* La facture à régler : son bouton paie le reste, frais compris
               (Tap & Go). Sans lui, le modèle ne part pas : la ligne le dit. */
            const reste = invoiceResteXof(piece);
            const tg = paiementTapGoDeLaPiece(reste, settings.mndPay);
            if (!tg) { await ecris({ statut: PERIME, detail: 'la facture à régler a besoin de son bouton de paiement : Tap & Go est éteint' }); continue; }
            const param = parametreTapGo(tg.totalXof, settings.mndPay);
            const vars = variablesDeLaFacture(destinataire, jourDuRituel, fmtMoney(reste, currency));
            colis = {
              genre: 'whatsapp', numero, modele: MODELE_FACTURE, composants: [enTete, corps(vars), bouton(param)], parQui: 'Grenat',
              texteAuFil: `Bonjour ${vars[0]}, merci de votre visite du ${dateDite(jourDuRituel)}. Voici votre facture ${FACTURE_JOINTE}, reste à régler : ${vars[3]}.`,
              /* Le repli : le lien de paiement, déjà approuvé, si Meta refuse le modèle de la facture. */
              repli: { modele: MODELE_TAPGO, composants: [corps(variablesTapGo(appelDe(destinataire), fmtMoney(tg.totalXof, currency))), bouton(param)] },
            };
          }
          const depart = heureDeDepart(Date.now(), REGLES_PAR_DEFAUT);
          await ecris({ statut: EN_ATTENTE, partA: new Date(depart.partA).toISOString(), calme: depart.calme, numero, colis, preparePar: 'le Trône' });
        }
      } catch (err) {
        console.warn('[la main de Grenat] papier :', err);
      } finally {
        enCours.current = false;
      }
    })();
  }, [session, envois, invoices, clients, appts, branch.id, currency, settings.mndPay, buildPdfData]);

  /* ② Les suites d'un honneur posé par Grenat. */
  useEffect(() => {
    const sb = supabase;
    if (!session || !sb || !tablePrete('appointments')) return;
    const aSuivre = appts.filter((a) => a.branchId === branch.id && a.status === 'honoré' && !a.pointsAwarded
      && !!a.honoreParGrenat && !a.honoreParGrenat.suitesLe && !fait.has(`suite-${a.id}`));
    for (const a of aSuivre) {
      fait.add(`suite-${a.id}`);
      void (async () => {
        const { data: ligne } = await sb.from('appointments').select('id, data').eq('id', a.id).maybeSingle();
        const d = (ligne?.data ?? null) as (Record<string, unknown> & { honoreParGrenat?: Record<string, unknown> }) | null;
        if (!d || d.pointsAwarded || !d.honoreParGrenat || d.honoreParGrenat.suitesLe) return;
        const { data: prise } = await sb.from('appointments')
          .update({ data: { ...d, honoreParGrenat: { ...d.honoreParGrenat, suitesLe: new Date().toISOString() } } })
          .eq('id', a.id).is('data->honoreParGrenat->>suitesLe', null).select('id');
        if (!(prise ?? []).length) return;
        honorAppointment(a, byId, { muet: true });
      })();
    }
  }, [session, appts, branch.id, byId]);
}
