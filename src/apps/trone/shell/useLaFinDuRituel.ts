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
import { sonne } from '../../../shared/sonnette';
import { ATTENTE_D_UNE_RESERVATION_MS, gesteDeLaPiece, pieceAPreparer, suitesAFaire, versementsDejaRecus } from '../../../shared/terminer-et-regler-pur';
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
      ouverts n'en écrivent qu'une. Une réservation qui n'aboutit pas (le
      poste se ferme, le réseau manque) ne bloque personne : un poste qui la
      voit depuis 90 secondes, toujours sans pièce, la reprend
      (`gesteDeLaPiece`). Une marque qui ne tient pas (posée hors de la
      porte) n'écrit rien (`pieceAPreparer`).

   ② LES SUITES DE L'HONNEUR. Quand elle a réglé, `regler-la-seance` passe le
      rendez-vous « honoré » (`honoreAuReglement`) ; les points, le stock et
      la mission du prestataire se font ici (`honorAppointment`), une fois :
      un poste réserve `suitesLe` d'abord.

   Et l'annonce : un mot et un son quand elle vient de terminer. */

const fait = new Set<string>();
/** Depuis quand CE poste voit chaque réservation (`rdv|pieceLe`) : l'horloge de ce poste, jamais celle d'un autre. */
const reservationsVues = new Map<string, number>();
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
  /* Le réveil : rien ne change à l'écran pendant qu'une réservation vieillit, un minuteur relance l'examen. */
  const [tic, setTic] = useState(0);

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
    const maintenant = Date.now();
    const declarees = appts.filter((a) => a.branchId === branch.id && !!a.termineParElle
      && pieceAPreparer(a, invoices.some((i) => i.apptId === a.id && i.kind === 'facture')));
    /* Le prochain réveil : une réservation vue attend ses 90 secondes, un échec se retente. */
    let reveil = Infinity;
    const retente = () => window.setTimeout(() => setTic((x) => x + 1), 15_000);
    for (const a of declarees) {
      /* Ce poste a déjà rendu son verdict (rien à régler, pièce impossible) : il ne le redit pas. */
      if (fait.has(`sans-${a.id}`)) continue;
      /* La réservation que ce poste VOIT sur la ligne, et depuis quand il la voit. */
      const vue = a.termineParElle?.pieceLe ?? null;
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
          /* La réservation, au serveur : un seul poste écrit la pièce. supabase-js
             REND son erreur sans la lever : elle se lit, sinon ce poste croyait
             avoir essayé et n'y revenait plus. */
          const { data: ligne, error: lecture } = await sb.from('appointments').select('id, data').eq('id', a.id).maybeSingle();
          if (lecture) throw new Error(lecture.message);
          const d = (ligne?.data ?? null) as (Record<string, unknown> & { termineParElle?: Record<string, unknown> }) | null;
          if (!d?.termineParElle || d.status !== 'confirmé') return;
          /* La ligne du serveur porte une autre réservation que celle que ce poste a vue vieillir : un autre poste vient de la prendre. */
          const ancienne = typeof d.termineParElle.pieceLe === 'string' && d.termineParElle.pieceLe ? d.termineParElle.pieceLe : null;
          if (ancienne !== vue) { fait.delete(`piece-${cle}`); return; }
          if (ancienne !== null) {
            /* Reprise : la pièce est peut-être au serveur sans être encore arrivée sur ce poste. */
            const { data: dejaLa, error: pieces } = await sb.from('invoices').select('id').eq('data->>apptId', a.id).limit(1);
            if (pieces) throw new Error(pieces.message);
            if ((dejaLa ?? []).length > 0) return;
          }
          const pieceLe = new Date().toISOString();
          const ecriture = sb.from('appointments').update({ data: { ...d, termineParElle: { ...d.termineParElle, pieceLe } } }).eq('id', a.id);
          /* Sous condition : personne d'autre n'a réservé (ou repris) entre-temps. */
          const { data: prise, error: refus } = await (ancienne === null
            ? ecriture.is('data->termineParElle->>pieceLe', null)
            : ecriture.eq('data->termineParElle->>pieceLe', ancienne)).select('id');
          if (refus) throw new Error(refus.message);
          /* Un autre poste l'a prise : celui-ci pourra la reprendre si elle n'aboutit pas. */
          if (!(prise ?? []).length) { fait.delete(`piece-${cle}`); return; }

          /* Le prix se fige au premier geste d'argent, sur la ligne du magasin, avec la réservation. */
          appointmentsStore.set((prev) => prev.map((x) => (x.id === a.id && x.termineParElle
            ? { ...x, ...prixAFiger(x, byId), termineParElle: { ...x.termineParElle, pieceLe } }
            : x)));
          const frais = appointmentsStore.get().find((x) => x.id === a.id);
          if (!frais) return;
          const prenom = (clients.find((c) => c.id === frais.clientId)?.name ?? frais.clientName ?? 'Elle').split(' ')[0];
          if (apptDueXof(frais, byId) <= 0) {
            fait.add(`sans-${a.id}`);
            toast(`${prenom} a terminé son rituel : rien à régler. Honorez-le au Carnet.`, 8000);
            return;
          }
          const tarifs = tarifsDuRituel(frais, {
            client: clients.find((c) => c.id === frais.clientId),
            bands, sets, cats: categories, byId, tousServices: services, produits,
          });
          const r = factureAEnvoyer(frais, byId, frais.branchId, tarifs.prixPlein, tarifs.gesteDe);
          if (!r.ok) { fait.add(`sans-${a.id}`); toast(`${prenom} a terminé son rituel, mais sa pièce n’a pas pu s’écrire (${r.erreur}) : encaissez-la au comptoir.`, 10_000); return; }
          /* L'acompte reconnu et les versements d'avant montent sur la pièce
             neuve, comme au ticket de la Caisse : la page « Régler » dit alors
             le juste reste, pas le prix entier. Jamais sur une pièce déjà là. */
          if (!r.deja) {
            const deja = versementsDejaRecus({ rdvId: frais.id, totalXof: invoiceTotal(r.inv), dejaRecu: lArgentDejaRecu(frais, frais.date) });
            if (deja.length > 0) {
              /* `depositCreditXof`, comme au comptoir : cet argent est entré un autre jour, aucune caisse du jour ne le reçoit. */
              const dejaXof = deja.reduce((s, v) => s + v.amountXof, 0);
              invoicesStore.set((prev) => prev.map((i) => (i.id === r.inv.id ? { ...i, payments: [...(i.payments ?? []), ...deja], depositCreditXof: (i.depositCreditXof ?? 0) + dejaXof } : i)));
            }
          }
        } catch (err) {
          /* Le réseau a manqué, ou la base a refusé : ce poste réessaie (au prochain changement, sinon dans quinze secondes), la réservation garde l'unicité. */
          fait.delete(`piece-${cle}`);
          retente();
          console.warn('[la fin du rituel] pièce :', err);
        }
      })();
    }
    if (reveil === Infinity) return;
    const minuteur = window.setTimeout(() => setTic((x) => x + 1), Math.max(1000, reveil + 500));
    return () => window.clearTimeout(minuteur);
  }, [session, appts, invoices, clients, categories, services, produits, bands, sets, byId, branch.id, tic]);

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
