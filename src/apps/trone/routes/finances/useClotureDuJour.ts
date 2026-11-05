import { useEffect, useMemo, useState } from 'react';
import { useBranch } from '../../../../shared/branches';
import { aUnPrixConvenu, useClients } from '../../../../shared/clients';
import { useExpenses, useInvoices } from '../../../../shared/finance';
import { useClotures } from '../../../../shared/caisse-du-soir';
import { useOffers } from '../../../../shared/offers';
import { openingForIso, useSettings } from '../../../../shared/settings';
import {
  TYPE_DU_PAPIER, clotureDuJour, heuresDeLaCloture,
  type Alarme, type ClotureDuJour, type ComptageLu, type DepenseLue, type EffacementLu, type PieceLue, type RdvLu,
} from '../../../../shared/cloture-du-jour-pur';
import {
  dernierPassage, effacementsDuJour, useComptesRendusDeGrenat, useDecisionsDeCloture, type CompteRenduDeGrenat,
} from '../../../../shared/cloture-du-jour';
import { useEnvois } from '../equipe/data';
import { apptDurationMin, apptLabel, apptNetXof, useBranchAppointments, useServicesById } from '../clients/_shared';

/* ══ LA CLÔTURE D'UN JOUR, LUE AU TRÔNE — 4 novembre 2026 ══════════════
   UNE SEULE PRISE pour « La journée » et la carte du tableau de bord :
   les faits du Trône (le Carnet, les pièces, les fiches, les offres, la
   salle d'attente, les décisions) passés à LA MÊME RÈGLE que la fonction de
   Grenat (`clotureDuJour`). Le prix d'un rendez-vous est celui que le Carnet
   montre (`apptNetXof`) ; sa durée, celle du calendrier.

   LES DÉPENSES (5 novembre 2026, « Oui, il les relit à 19 h ») : le registre
   brut des dépenses (en attente comprises) et les comptages de tiroir, et
   l'heure de la relecture, la dernière heure de clôture réglée.

   Les pièces effacées se lisent dans la trace, que la base ne montre qu'à
   la direction ; pour les autres, les alarmes du dernier passage de Grenat,
   avec les décisions prises depuis. */
export type ClotureLue = {
  cloture: ClotureDuJour;
  passage?: CompteRenduDeGrenat;
  alarmes: Alarme[];
  /** La journée est close : la caisse peut se compter. */
  close: boolean;
  /** Ce qui reste, en mots. */
  reste: string[];
  verdictDit: string;
  pourquoiPasEncore: string;
  /** La trace a pu être lue (la direction). */
  traceLue: boolean;
  /** L'heure de la relecture des dépenses (la dernière clôture réglée). */
  heureDesDepenses: number;
};

export function useClotureDuJour(jour: string): ClotureLue {
  const { branch } = useBranch();
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const [invoices] = useInvoices();
  const [clients] = useClients();
  const [offres] = useOffers();
  const [envois] = useEnvois();
  const [crs] = useComptesRendusDeGrenat();
  const [decisions] = useDecisionsDeCloture();
  const [depenses] = useExpenses();
  const [comptages] = useClotures();
  const [settings] = useSettings();
  const heureDesDepenses = Math.max(...heuresDeLaCloture(settings.cloture?.heures));
  /* L'heure qui passe : un rendez-vous finit pendant qu'on regarde l'écran. */
  const [maintenantMs, setMaintenantMs] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setMaintenantMs(Date.now()), 60_000); return () => window.clearInterval(t); }, []);

  /* `null` : la trace n'est pas lisible ici (les alarmes viennent alors du compte rendu). */
  const [effaces, setEffaces] = useState<EffacementLu[] | null>(null);
  useEffect(() => {
    let vivant = true;
    const lis = () => { void effacementsDuJour(jour).then((e) => { if (vivant) setEffaces(e); }); };
    lis();
    const t = window.setInterval(lis, 5 * 60_000);
    return () => { vivant = false; window.clearInterval(t); };
  }, [jour, invoices.length]);

  const cloture: ClotureDuJour = useMemo(() => {
    const fiche = (id?: string) => (id ? clients.find((c) => c.id === id) : undefined);
    const rdvs: RdvLu[] = appts.filter((a) => a.date === jour).map((a) => ({
      ...(a as unknown as RdvLu),
      qui: fiche(a.clientId)?.name ?? a.clientName,
      libelle: apptLabel(a, byId) === '—' ? undefined : apptLabel(a, byId),
      dureeMin: apptDurationMin(a, byId),
      /* Le prix que le Carnet montre : le tarif de la tête, ou le prix figé. */
      prixXof: apptNetXof(a, byId),
    }));
    return clotureDuJour({
      jour, maintenantMs, branchId: branch.id, ferme: openingForIso(jour).closed,
      rdvs, pieces: invoices as unknown as PieceLue[],
      fiches: clients.map((c) => ({ id: c.id, nom: c.name, sansPapiersWa: c.sansPapiersWa === true, aUnNumero: !!c.phone?.trim(), prixConvenus: aUnPrixConvenu(c) })),
      offres, effacements: effaces ?? [],
      decisions: decisions.filter((d) => d.branchId === branch.id).map((d) => ({ cle: d.cle, par: d.par, le: d.le, mot: d.mot })),
      envois: envois.filter((e) => e.type === TYPE_DU_PAPIER).map((e) => ({ id: e.id, type: e.type, statut: e.statut, invoiceId: (e as { invoiceId?: string }).invoiceId })),
      depenses: depenses as unknown as DepenseLue[],
      comptages: comptages as unknown as ComptageLu[],
      heureDesDepenses,
    });
  }, [appts, jour, maintenantMs, branch.id, invoices, clients, offres, effaces, decisions, envois, byId, depenses, comptages, heureDesDepenses]);

  const passage = dernierPassage(crs, branch.id, jour);
  const tranchees = new Set(decisions.filter((d) => d.branchId === branch.id).map((d) => d.cle));
  const alarmes: Alarme[] = effaces !== null
    ? cloture.alarmes
    : (passage?.cloture.alarmes ?? []).map((x) => ({ ...x, ouverte: x.ouverte && !tranchees.has(x.cle) }));
  const alarmesOuvertes = alarmes.filter((x) => x.ouverte);
  const close = cloture.verdict.close && alarmesOuvertes.length === 0;
  const reste = [...cloture.verdict.reste];
  if (effaces === null && alarmesOuvertes.length) reste.push(alarmesOuvertes.length > 1 ? `${alarmesOuvertes.length} pièces payées effacées à trancher` : '1 pièce payée effacée à trancher');
  const verdictDit = close ? cloture.verdict.dit : effaces === null && cloture.verdict.close ? 'Une facture payée a été effacée' : cloture.verdict.dit;
  const pourquoiPasEncore = close ? '' : `Grenat : la caisse ne se compte pas encore. ${reste.join(', ').replace(/^./, (x) => x.toUpperCase())}.`;
  return { cloture, passage, alarmes, close, reste, verdictDit, pourquoiPasEncore, traceLue: effaces !== null, heureDesDepenses };
}
