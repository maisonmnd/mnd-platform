import { useEffect } from 'react';
import { useAuth } from '../../../shared/auth';
import { useBranch } from '../../../shared/branches';
import { appointmentsStore, useAppointments } from '../../../shared/agenda';
import { useCategories, useProducts, useServices } from '../../../shared/catalog';
import { useClients } from '../../../shared/clients';
import { invoiceTotal, invoicesStore, useInvoices } from '../../../shared/finance';
import { useBandSets, useModelBands } from '../../../shared/pricing';
import { supabase } from '../../../shared/supabase';
import { tablePrete } from '../../../shared/sync';
import { sonne } from '../../../shared/sonnette';
import { pieceAPreparer, suitesAFaire, versementsDejaRecus } from '../../../shared/terminer-et-regler-pur';
import { lArgentDejaRecu } from '../routes/vente/encaissement-pur';
import { toast } from '../../../ds/components';
import { apptDueXof, prixAFiger, tarifsDuRituel, useServicesById } from '../routes/clients/_shared';
import { factureAEnvoyer, honorAppointment } from '../routes/clients/actions';

/* ══ LA FIN DU RITUEL, AU TRÔNE — 6 novembre 2026 (« Terminer et régler ») ══
   La cliente a déclaré avoir terminé (Ma Couronne, le site, le WhatsApp de
   la Maison) : la fonction `terminer-et-regler` a posé `termineParElle` et
   prévenu l'équipe. Deux gestes ont besoin du Trône, qui seul sait les
   faire juste (la même raison que la main de Grenat) :

   ① SA PIÈCE. Le serveur ne lit pas le tarif d'une tête : un poste ouvert
      fige le prix du rendez-vous (`prixAFiger`, le premier geste d'argent)
      et écrit la facture à régler (`factureAEnvoyer`, celle de « Terminer
      la séance »), SANS honorer ; l'acompte reconnu et les versements
      d'avant y montent (`versementsDejaRecus`, comme au ticket de la
      Caisse). La page « Régler » de la cliente la relit et dit le juste
      reste. Un poste RÉSERVE d'abord la pièce au serveur
      (écriture conditionnelle sur `termineParElle.pieceLe`) : deux postes
      ouverts n'en écrivent qu'une. Une marque qui ne tient pas (posée hors
      de la porte) n'écrit rien (`pieceAPreparer`).

   ② LES SUITES DE L'HONNEUR. Quand elle a réglé, `regler-la-seance` passe le
      rendez-vous « honoré » (`honoreAuReglement`) ; les points, le stock et
      la mission du prestataire se font ici (`honorAppointment`), une fois :
      un poste réserve `suitesLe` d'abord.

   Et l'annonce : un mot et un son quand elle vient de terminer. */

const fait = new Set<string>();
const VUES = 'mnd_fins_annoncees';
const lisLesVues = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(VUES) ?? '[]') as string[]); } catch { return new Set(); }
};
const gardeLesVues = (s: Set<string>): void => {
  try { localStorage.setItem(VUES, JSON.stringify([...s].slice(-200))); } catch { /* la mémoire du poste peut manquer */ }
};
const PORTE_DITE = { couronne: 'Ma Couronne', site: 'le site', whatsapp: 'WhatsApp' } as const;

export function useLaFinDuRituel(): void {
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

  /* ⓪ L'annonce : elle vient de terminer (moins de quinze minutes), une fois par poste. */
  useEffect(() => {
    if (!session || !tablePrete('appointments')) return;
    const vues = lisLesVues();
    let annonce = false;
    for (const a of appts) {
      const m = a.termineParElle;
      if (!m?.le || a.branchId !== branch.id || a.status !== 'confirmé' || vues.has(a.id)) continue;
      const age = Date.now() - Date.parse(m.le);
      if (!(age >= 0 && age <= 15 * 60_000)) continue;
      vues.add(a.id);
      annonce = true;
      const prenom = (clients.find((c) => c.id === a.clientId)?.name ?? a.clientName ?? 'Une cliente').split(' ')[0];
      toast(`${prenom} a terminé son rituel · elle règle depuis son téléphone (${PORTE_DITE[m.par] ?? 'en ligne'}).`, 8000);
    }
    if (annonce) { gardeLesVues(vues); sonne(); }
  }, [session, appts, clients, branch.id]);

  /* ① Sa pièce, au tarif de sa tête, sans honorer. */
  useEffect(() => {
    const sb = supabase;
    if (!session || !sb || !tablePrete('appointments') || !tablePrete('invoices') || !tablePrete('clients') || byId.size === 0) return;
    const aPreparer = appts.filter((a) => a.branchId === branch.id && !!a.termineParElle && !a.termineParElle.pieceLe && !fait.has(`piece-${a.id}`)
      && pieceAPreparer(a, invoices.some((i) => i.apptId === a.id && i.kind === 'facture')));
    for (const a of aPreparer) {
      fait.add(`piece-${a.id}`);
      void (async () => {
        try {
          /* La réservation, au serveur : un seul poste écrit la pièce. */
          const { data: ligne } = await sb.from('appointments').select('id, data').eq('id', a.id).maybeSingle();
          const d = (ligne?.data ?? null) as (Record<string, unknown> & { termineParElle?: Record<string, unknown> }) | null;
          if (!d?.termineParElle || d.termineParElle.pieceLe || d.status !== 'confirmé') return;
          const pieceLe = new Date().toISOString();
          const { data: prise } = await sb.from('appointments')
            .update({ data: { ...d, termineParElle: { ...d.termineParElle, pieceLe } } })
            .eq('id', a.id).is('data->termineParElle->>pieceLe', null).select('id');
          if (!(prise ?? []).length) return;

          /* Le prix se fige au premier geste d'argent, sur la ligne du magasin, avec la réservation. */
          appointmentsStore.set((prev) => prev.map((x) => (x.id === a.id && x.termineParElle
            ? { ...x, ...prixAFiger(x, byId), termineParElle: { ...x.termineParElle, pieceLe } }
            : x)));
          const frais = appointmentsStore.get().find((x) => x.id === a.id);
          if (!frais) return;
          const prenom = (clients.find((c) => c.id === frais.clientId)?.name ?? frais.clientName ?? 'Elle').split(' ')[0];
          if (apptDueXof(frais, byId) <= 0) {
            toast(`${prenom} a terminé son rituel : rien à régler. Honorez-le au Carnet.`, 8000);
            return;
          }
          const tarifs = tarifsDuRituel(frais, {
            client: clients.find((c) => c.id === frais.clientId),
            bands, sets, cats: categories, byId, tousServices: services, produits,
          });
          const r = factureAEnvoyer(frais, byId, frais.branchId, tarifs.prixPlein, tarifs.gesteDe);
          if (!r.ok) { toast(`${prenom} a terminé son rituel, mais sa pièce n’a pas pu s’écrire (${r.erreur}) : encaissez-la au comptoir.`, 10_000); return; }
          /* L'acompte reconnu et les versements d'avant montent sur la pièce
             neuve, comme au ticket de la Caisse : la page « Régler » dit alors
             le juste reste, pas le prix entier. Jamais sur une pièce déjà là. */
          if (!r.deja) {
            const deja = versementsDejaRecus({ rdvId: frais.id, totalXof: invoiceTotal(r.inv), dejaRecu: lArgentDejaRecu(frais, frais.date) });
            if (deja.length > 0) {
              invoicesStore.set((prev) => prev.map((i) => (i.id === r.inv.id ? { ...i, payments: [...(i.payments ?? []), ...deja] } : i)));
            }
          }
        } catch (err) {
          console.warn('[la fin du rituel] pièce :', err);
        }
      })();
    }
  }, [session, appts, invoices, clients, categories, services, produits, bands, sets, byId, branch.id]);

  /* ② Les suites d'un honneur posé au règlement. */
  useEffect(() => {
    const sb = supabase;
    if (!session || !sb || !tablePrete('appointments') || byId.size === 0) return;
    const aSuivre = appts.filter((a) => a.branchId === branch.id && suitesAFaire(a) && !fait.has(`suite-${a.id}`));
    for (const a of aSuivre) {
      fait.add(`suite-${a.id}`);
      void (async () => {
        const { data: ligne } = await sb.from('appointments').select('id, data').eq('id', a.id).maybeSingle();
        const d = (ligne?.data ?? null) as (Record<string, unknown> & { honoreAuReglement?: Record<string, unknown> }) | null;
        if (!d || d.pointsAwarded || !d.honoreAuReglement || d.honoreAuReglement.suitesLe) return;
        const { data: prise } = await sb.from('appointments')
          .update({ data: { ...d, honoreAuReglement: { ...d.honoreAuReglement, suitesLe: new Date().toISOString() } } })
          .eq('id', a.id).is('data->honoreAuReglement->>suitesLe', null).select('id');
        if (!(prise ?? []).length) return;
        honorAppointment(a, byId, { muet: true });
      })();
    }
  }, [session, appts, branch.id, byId]);
}
