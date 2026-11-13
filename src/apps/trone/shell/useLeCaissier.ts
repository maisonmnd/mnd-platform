import { useEffect, useState } from 'react';
import { useAuth } from '../../../shared/auth';
import { useBranch } from '../../../shared/branches';
import { appointmentsStore, useAppointments } from '../../../shared/agenda';
import { useCategories, useProducts, useServices } from '../../../shared/catalog';
import { useClients } from '../../../shared/clients';
import { invoiceTotal, invoicesStore, useInvoices } from '../../../shared/finance';
import { useBandSets, useModelBands } from '../../../shared/pricing';
import { supabase } from '../../../shared/supabase';
import { tablePrete } from '../../../shared/sync';
import { ATTENTE_D_UNE_RESERVATION_MS, gesteDeLaPiece, versementsDejaRecus } from '../../../shared/terminer-et-regler-pur';
import { pieceDuCaissierAEcrire } from '../../../shared/le-caissier-pur';
import { aDejaSaPiece, lArgentDejaRecu } from '../routes/vente/encaissement-pur';
import { apptDueXof, prixAFiger, tarifsDuRituel, useServicesById } from '../routes/clients/_shared';
import { factureAEnvoyer } from '../routes/clients/actions';

/* ══ LA MAIN DU CAISSIER, AU TRÔNE — 13 novembre 2026 ═══════════════════
   Le caissier de Grenat (shared/le-caissier-pur.ts) a vu un rituel fini
   sans encaissement depuis une heure (le délai de Paramètres) : la fonction
   `cloture-du-jour` a posé `caissier.pieceDemandeeLe` sur le rendez-vous.
   Le serveur ne connaît pas le tarif d'une tête ; un poste ouvert écrit
   donc la facture à régler, LA MÊME que « Terminer la séance » et que la
   fin du rituel déclarée par la cliente (`factureAEnvoyer`, série MND,
   « envoyée », au tarif de sa tête, prix figé au premier geste d'argent,
   acompte reconnu et versements d'avant montés dessus). Il N'HONORE PAS :
   le rendez-vous reste « confirmé » jusqu'à son règlement. Le passage
   suivant du caissier dépose la facture en salle d'attente.

   UN SEUL POSTE L'ÉCRIT : il réserve d'abord la pièce au serveur
   (`caissier.pieceLe`, écriture conditionnelle) ; une réservation qui
   n'aboutit pas se reprend après 90 secondes vues sur le même poste
   (`gesteDeLaPiece`, la règle de « Terminer et régler »). Une pièce déjà
   liée au rendez-vous (`aDejaSaPiece`), un encaissement ou une « facture
   retenue » entre-temps : rien ne s'écrit. */

const fait = new Set<string>();
/** Depuis quand CE poste voit chaque réservation (`rdv|pieceLe`). */
const reservationsVues = new Map<string, number>();

export function useLeCaissier(): void {
  const { session } = useAuth();
  const { branch } = useBranch();
  const [appts] = useAppointments();
  const [invoices] = useInvoices();
  const [clients] = useClients();
  const [categories] = useCategories();
  const [services] = useServices();
  const [produits] = useProducts();
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const byId = useServicesById();
  const [tic, setTic] = useState(0);

  useEffect(() => {
    const sb = supabase;
    if (!session || !sb || !tablePrete('appointments') || !tablePrete('invoices') || !tablePrete('clients') || byId.size === 0) return;
    const maintenant = Date.now();
    const demandees = appts.filter((a) => a.branchId === branch.id
      && pieceDuCaissierAEcrire(a, aDejaSaPiece(a, invoices) || invoices.some((i) => i.apptId === a.id && i.kind === 'facture')));
    let reveil = Infinity;
    const retente = () => window.setTimeout(() => setTic((x) => x + 1), 15_000);
    for (const a of demandees) {
      if (fait.has(`sans-${a.id}`)) continue;
      const vue = a.caissier?.pieceLe ?? null;
      const cle = `${a.id}|${vue ?? ''}`;
      if (vue && !reservationsVues.has(cle)) reservationsVues.set(cle, maintenant);
      const geste = gesteDeLaPiece({ pieceLe: vue, vueDepuisMs: vue ? reservationsVues.get(cle) ?? null : null, maintenantMs: maintenant });
      if (geste === 'attendre') {
        reveil = Math.min(reveil, (reservationsVues.get(cle) ?? maintenant) + ATTENTE_D_UNE_RESERVATION_MS - maintenant);
        continue;
      }
      if (fait.has(`piece-${cle}`)) continue;
      fait.add(`piece-${cle}`);
      void (async () => {
        try {
          /* La ligne du serveur, relue : le comptoir a pu encaisser ou retenir entre-temps. */
          const { data: ligne, error: lecture } = await sb.from('appointments').select('id, data').eq('id', a.id).maybeSingle();
          if (lecture) throw new Error(lecture.message);
          const d = (ligne?.data ?? null) as (Record<string, unknown> & { caissier?: Record<string, unknown>; status?: string }) | null;
          if (!d || !pieceDuCaissierAEcrire(d as never, false)) return;
          const ancienne = typeof d.caissier?.pieceLe === 'string' && d.caissier.pieceLe ? d.caissier.pieceLe : null;
          if (ancienne !== vue) { fait.delete(`piece-${cle}`); return; }
          /* Une pièce au serveur, pas encore arrivée sur ce poste : rien à écrire. */
          const { data: dejaLa, error: pieces } = await sb.from('invoices').select('id').eq('data->>apptId', a.id).limit(1);
          if (pieces) throw new Error(pieces.message);
          if ((dejaLa ?? []).length > 0) return;
          const pieceLe = new Date().toISOString();
          const ecriture = sb.from('appointments').update({ data: { ...d, caissier: { ...d.caissier, pieceLe } } }).eq('id', a.id);
          const { data: prise, error: refus } = await (ancienne === null
            ? ecriture.is('data->caissier->>pieceLe', null)
            : ecriture.eq('data->caissier->>pieceLe', ancienne)).select('id');
          if (refus) throw new Error(refus.message);
          if (!(prise ?? []).length) { fait.delete(`piece-${cle}`); return; }

          /* Le prix se fige au premier geste d'argent, avec la réservation. */
          appointmentsStore.set((prev) => prev.map((x) => (x.id === a.id
            ? { ...x, ...prixAFiger(x, byId), caissier: { ...(x.caissier ?? {}), pieceLe } }
            : x)));
          const frais = appointmentsStore.get().find((x) => x.id === a.id);
          if (!frais) return;
          if (apptDueXof(frais, byId) <= 0) { fait.add(`sans-${a.id}`); return; }
          const tarifs = tarifsDuRituel(frais, {
            client: clients.find((c) => c.id === frais.clientId),
            bands, sets, cats: categories, byId, tousServices: services, produits,
          });
          const r = factureAEnvoyer(frais, byId, frais.branchId, tarifs.prixPlein, tarifs.gesteDe);
          if (!r.ok) { fait.add(`sans-${a.id}`); console.warn('[le caissier] pièce impossible :', r.erreur); return; }
          if (!r.deja) {
            const deja = versementsDejaRecus({ rdvId: frais.id, totalXof: invoiceTotal(r.inv), dejaRecu: lArgentDejaRecu(frais, frais.date) });
            if (deja.length > 0) {
              const dejaXof = deja.reduce((s, v) => s + v.amountXof, 0);
              invoicesStore.set((prev) => prev.map((i) => (i.id === r.inv.id ? { ...i, payments: [...(i.payments ?? []), ...deja], depositCreditXof: (i.depositCreditXof ?? 0) + dejaXof } : i)));
            }
          }
          /* Le lien se lit par `apptId` sur la pièce, comme pour la fin du
             rituel : le Carnet et l'encaissement la retrouvent (« la pièce du
             rendez-vous grandit »), rien d'autre ne s'écrit sur le rendez-vous. */
        } catch (err) {
          fait.delete(`piece-${cle}`);
          retente();
          console.warn('[le caissier] pièce :', err);
        }
      })();
    }
    if (reveil === Infinity) return;
    const minuteur = window.setTimeout(() => setTic((x) => x + 1), Math.max(1000, reveil + 500));
    return () => window.clearTimeout(minuteur);
  }, [session, appts, invoices, clients, categories, services, produits, bands, sets, byId, branch.id, tic]);
}
