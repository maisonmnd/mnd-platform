import { useMemo } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useClients, useFamilies, type Client } from '../../../../shared/clients';
import { useCategories, useProducts, useServices } from '../../../../shared/catalog';
import { useBandSets, useModelBands, prixFerme } from '../../../../shared/pricing';
import { invoiceReglements, invoiceResteXof, invoiceTotal, useCredits, useInvoices, creditBalanceOf, type Invoice } from '../../../../shared/finance';
import { holderOf } from '../../../../shared/accounts';
import { tetesDuCompte } from '../../../../shared/compte';
import { apptPaidXof, type Appointment } from '../../../../shared/agenda';
import { momentDuSalon } from '../../../../shared/calendrier';
import { useSettings } from '../../../../shared/settings';
import { payeurDuCompte } from '../../../../shared/point-du-compte-pur';
import {
  comptesDesFiltres, etatDuReglement, gesteDuPoint, plansDesPieces, suiviDesPieces,
  type EnvoiLu, type EtatDuPlan, type EtatDuReglement, type FiltreDuPoint, type GesteDuPoint, type PasDuSuivi,
} from '../../../../shared/le-point-pur';
import { useEnvois } from '../equipe/data';
import { useSubscribers } from '../../../../shared/abonnements';
import { apptDueXof, apptLabel, apptNetXof, apptServices, tarifsDuRituel, useBranchAppointmentsAvecEssais, useServicesById } from './_shared';

/* ══ CE QUE LIT « LE POINT » — 21 novembre 2026 ═══════════════════════════
   Les règles vivent dans `shared/le-point-pur` ; ici, les magasins. Les
   montants sont ceux du Carnet et du compte de la fiche : le net du rituel
   (`apptNetXof`), ce qu'il reste à régler (`apptDueXof`), le reste d'une
   facture libre (`invoiceResteXof`). Aucun calcul à côté. */

export type LigneDuPoint = {
  cle: string;
  genre: 'rituel' | 'facture';
  date: string;
  heure?: string;
  quoi: string;
  sous: string;
  /** Le mot du statut du rendez-vous (ou « Vente »), et son ton. */
  statut: string;
  ton: 'avenir' | 'suggere' | 'honore' | 'confirme' | 'vente' | 'annule';
  etat: EtatDuReglement;
  totalXof: number;
  verseXof: number;
  resteXof: number;
  /** Les pièces de la ligne, et celle qui réclame encore (une facture « à régler »). */
  pieces: Invoice[];
  aRegler?: Invoice;
  appt?: Appointment;
  geste: GesteDuPoint;
  pour: string;
  /** Se coche pour le point ou une relance : elle doit, et ce n'est pas la pièce d'une formule
      (son reste porte des échéances pas encore dues : elle se relance échéance par échéance). */
  cochable: boolean;
};

export type PasDeLHistorique = { quand: string; quoi: string; detail: string; etat: 'regle' | 'partiel' | PasDuSuivi['etat']; genre: 'versement' | PasDuSuivi['genre'] };

export function useLePoint(clientId: string, portee: 'sienne' | 'foyer') {
  const { branch } = useBranch();
  const [clients] = useClients();
  const [familles] = useFamilies();
  const appts = useBranchAppointmentsAvecEssais();
  const [invoices] = useInvoices();
  const [credits] = useCredits();
  const byId = useServicesById();
  const [services] = useServices();
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const [cats] = useCategories();
  const [produits] = useProducts();
  const [envois] = useEnvois();
  const [settings] = useSettings();
  const [contrats] = useSubscribers();
  const aujourdhui = momentDuSalon().jour;

  const client = clients.find((c) => c.id === clientId);
  const tetes = useMemo(() => (client ? tetesDuCompte(client, clients, familles) : []), [client, clients, familles]);
  const ids = useMemo(() => new Set(portee === 'foyer' ? tetes : client ? [client.id] : []), [portee, tetes, client]);
  const nomDe = (id?: string) => clients.find((c) => c.id === id)?.name ?? '';

  /** Le contexte tarifaire d'une tête : celui de la fenêtre et de la Caisse. */
  const ctxDe = (fiche: Client | undefined) => ({ client: fiche, bands, sets, cats, byId, tousServices: services, produits });

  const lignes = useMemo<LigneDuPoint[]>(() => {
    const miens = appts.filter((a) => ids.has(a.clientId));
    const liees = new Set<string>();
    for (const a of miens) {
      if (a.invoiceId) liees.add(a.invoiceId);
      for (const p of a.payments ?? []) if (p.invoiceId) liees.add(p.invoiceId);
    }
    for (const i of invoices) if (i.apptId && miens.some((a) => a.id === i.apptId)) liees.add(i.id);

    const out: LigneDuPoint[] = [];
    for (const a of miens) {
      const annule = a.status === 'annulé';
      const aVenir = !annule && a.date > aujourdhui;
      const net = annule ? 0 : apptNetXof(a, byId);
      const reste = annule ? 0 : apptDueXof(a, byId);
      const verse = Math.max(0, net - reste);
      const pieces = invoices.filter((i) => i.kind === 'facture' && (i.apptId === a.id || i.id === a.invoiceId || (a.payments ?? []).some((p) => p.invoiceId === i.id)));
      const aRegler = pieces.find((i) => i.status !== 'payée' && invoiceResteXof(i) > 0);
      const fiche = clients.find((c) => c.id === a.clientId);
      const t = tarifsDuRituel(a, ctxDe(fiche));
      const suggere = !!a.suggereLe && a.status === 'confirmé' && !a.confirmeeParLaClienteLe;
      out.push({
        cle: `r-${a.id}`, genre: 'rituel', date: a.date, heure: a.time, appt: a, pour: a.clientId,
        quoi: apptLabel(a, byId),
        sous: [a.master, portee === 'foyer' && a.clientId !== clientId ? nomDe(a.clientId).split(' ')[0] : ''].filter(Boolean).join(' · '),
        statut: annule ? 'Annulé' : suggere ? 'Suggéré' : a.status === 'honoré' ? 'Honoré' : aVenir ? 'À venir' : a.status === 'en attente' ? 'En attente' : 'Confirmé',
        ton: annule ? 'annule' : suggere ? 'suggere' : a.status === 'honoré' ? 'honore' : aVenir ? 'avenir' : 'confirme',
        etat: etatDuReglement({ annule, aVenir, totalXof: net, verseXof: verse, resteXof: reste }),
        totalXof: net, verseXof: verse, resteXof: reste, pieces, ...(aRegler ? { aRegler } : {}),
        cochable: !annule && !aVenir && reste > 0 && !a.coveredBySub,
        geste: gesteDuPoint({
          annule, aVenir, argentRecu: apptPaidXof(a) > 0 || (a.payments?.length ?? 0) > 0 || pieces.some((i) => i.status === 'payée' && invoiceTotal(i) > 0),
          resteXof: reste, netXof: net, remiseFamille: !!a.remiseFamille, forfait: !!a.forfait, couvert: !!a.coveredBySub,
          suite: (a.seriesIndex ?? 1) > 1, prixLibre: apptServices(a, byId).some((sv) => !prixFerme(sv, t.pricing)),
        }),
      });
    }
    /* Les factures libres de ses têtes : produits, caisse, ce que le rituel ne porte pas. */
    const piecesDesFormules = new Set(contrats.map((c) => c.invoiceId).filter((x): x is string => !!x));
    for (const i of invoices) {
      const pour = i.forClientId ?? i.clientId ?? '';
      if (i.kind !== 'facture' || liees.has(i.id) || !(ids.has(pour) || ids.has(i.clientId ?? ''))) continue;
      const total = invoiceTotal(i);
      const reste = invoiceResteXof(i);
      out.push({
        cle: `f-${i.id}`, genre: 'facture', date: i.date, quoi: i.lines.map((l) => l.label).slice(0, 3).join(' + ') || `Facture ${i.number}`,
        sous: 'vente', statut: 'Vente', ton: 'vente', pour,
        etat: etatDuReglement({ totalXof: total, verseXof: total - reste, resteXof: reste }),
        totalXof: total, verseXof: Math.max(0, total - reste), resteXof: reste, pieces: [i], ...(reste > 0 ? { aRegler: i } : {}), geste: 'fenetre',
        cochable: reste > 0 && !piecesDesFormules.has(i.id) && !/^Abonnement\b/.test(i.note ?? ''),
      });
    }
    return out.sort((x, y) => `${y.date} ${y.heure ?? ''}`.localeCompare(`${x.date} ${x.heure ?? ''}`));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appts, invoices, ids, byId, clients, aujourdhui, bands, sets, cats, services, produits, portee, clientId, contrats]);

  /* Toutes les pièces du compte (le foyer entier : un plan peut porter la facture d'un enfant). */
  const piecesDuCompte = useMemo(() => {
    const tous = new Set(tetes);
    const rdvs = new Set(appts.filter((a) => tous.has(a.clientId)).map((a) => a.id));
    return invoices.filter((i) => i.kind === 'facture' && (tous.has(i.forClientId ?? i.clientId ?? '') || tous.has(i.clientId ?? '') || (!!i.apptId && rdvs.has(i.apptId))));
  }, [tetes, appts, invoices]);

  const journal = envois as unknown as EnvoiLu[];
  const plans: EtatDuPlan[] = useMemo(() => plansDesPieces(piecesDuCompte, journal, aujourdhui), [piecesDuCompte, journal, aujourdhui]);

  /* L'historique : ce qui est parti, et l'argent qui est arrivé. */
  const historique = useMemo<PasDeLHistorique[]>(() => {
    const numero = (id: string) => piecesDuCompte.find((p) => p.id === id)?.number ?? '';
    const suivi = suiviDesPieces(piecesDuCompte.map((p) => ({ id: p.id, number: p.number, partieLe: p.whatsapp?.partieLe, modele: p.whatsapp?.modele })), journal);
    const pas: PasDeLHistorique[] = suivi.map((s) => ({
      quand: s.quand, genre: s.genre, etat: s.etat,
      quoi: s.genre === 'piece' ? (s.pieceIds.length > 1 ? 'Le point du compte' : `Facture ${numero(s.pieceIds[0])}`)
        : s.genre === 'programmee' ? 'Relance programmée' : 'Relance de la tournée',
      detail: s.pieceIds.map(numero).filter(Boolean).join(', '),
    }));
    for (const l of lignes) {
      if (l.appt) for (const p of l.appt.payments ?? []) if (p.amountXof > 0) pas.push({ quand: p.date || l.date, genre: 'versement', etat: 'regle', quoi: `Versement · ${p.method || 'règlement'}`, detail: `${p.amountXof}|${l.quoi}` });
      if (l.genre === 'facture') for (const p of invoiceReglements(l.pieces[0])) if (p.amountXof > 0) pas.push({ quand: p.date || l.date, genre: 'versement', etat: 'regle', quoi: `Versement · ${p.method || 'règlement'}`, detail: `${p.amountXof}|Facture ${l.pieces[0].number}` });
    }
    return pas.sort((a, b) => b.quand.localeCompare(a.quand)).slice(0, 30);
  }, [piecesDuCompte, journal, lignes]);

  const avoir = client ? creditBalanceOf(credits, holderOf(client, familles)) : 0;
  const comptes: Record<FiltreDuPoint, number> = comptesDesFiltres(lignes);

  return {
    branch, client, tetes, lignes, comptes, plans, historique, avoir, aujourdhui, piecesDuCompte,
    payeurId: client ? payeurDuCompte(client.id, clients, familles) : '',
    modelePoint: settings.relances?.modelePoint === true,
    relancesPossibles: settings.mndPay?.actif === true && settings.mndPay?.tapgo?.actif !== false,
    ctxDe, byId, services, produits, nomDe,
    /** La fiche d'une tête : son tarif (calibre, Juste Prix, longueur) fait le prix de ses lignes. */
    ficheDe: (id: string) => clients.find((c) => c.id === id),
  };
}
