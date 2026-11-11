import { useEffect, useMemo, useState } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useSettings } from '../../../../shared/settings';
import { invoiceResteXof } from '../../../../shared/finance-pur';
import { useClients, useFamilies } from '../../../../shared/clients';
import { useSubscribers } from '../../../../shared/abonnements';
import { usePiecesDeLaMaison } from '../../../../shared/essai';
import { estUnRdvDEssai, estUneFicheDEssai, fichesParId } from '../../../../shared/essai-pur';
import { reglesDepuis } from '../../../../shared/salle-des-envois';
import { heuresDesRappels } from '../../../../shared/heures-des-rappels-pur';
import { useArrets, usePauses } from '../../../../shared/arrets-d-avance';
import {
  ceQuiVaPartir, dernierPassageDePerle, lignesDePerleAVenir, relancesEnService,
  type EntreesDeCeQuiVaPartir, type MessagePrevu, type PieceDeRelanceAVenir,
} from '../../../../shared/ce-qui-va-partir-pur';
import { useAutoConfig, useEnvois } from '../equipe/data';
import { useEntreesDeLAssistant } from './gerard-donnees';
import { useBranchAppointments, useBranchAppointmentsAvecEssais, useBranchClients } from './_shared';

/* ══ CE QUI VA PARTIR, LA PRISE SUR LES MAGASINS — 5 novembre 2026 ═══════
   La règle vit dans `shared/ce-qui-va-partir-pur.ts`. Ici, ce qu'elle lit,
   pris sur les magasins du Trône : les rendez-vous et les fiches de la
   maison, le journal des envois, les réglages (heures des rappels, salle,
   heures calmes), les factures et leurs relances, et les entrées de
   l'Assistant Maison, rejouées jour par jour par son propre cerveau. Le
   calcul ne tourne que lorsque l'onglet est ouvert (`actif`), et l'heure
   avance d'elle-même chaque minute.

   REPRISE DU 8 NOVEMBRE 2026 : les fiches d'essai (shared/essai-pur, 7
   novembre 2026). Les rendez-vous et les pièces se lisent par les portes de
   la Maison (`useBranchAppointments`, `usePiecesDeLaMaison`) ; les fiches
   d'essai et les rendez-vous d'essai sont nommés à la règle pure, qui écarte
   aussi ce qui attend déjà en salle pour elles et ce que Perle leur
   prévoit. Perle, elle, lit tout (elle sert LA cliente) : c'est la liste qui
   ne le montre pas. */
export function useCeQuiVaPartir(actif: boolean): { liste: MessagePrevu[]; maintenantMs: number } {
  const { branch } = useBranch();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const [envoisTous] = useEnvois();
  const [cfg] = useAutoConfig();
  const [settings] = useSettings();
  const [factures] = usePiecesDeLaMaison();
  const [familles] = useFamilies();
  const [contrats] = useSubscribers();
  const [arrets] = useArrets();
  const [pauses] = usePauses();
  const entreesDePerle = useEntreesDeLAssistant();
  const essais = useEssais();
  const [maintenantMs, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    if (!actif) return undefined;
    setMaintenant(Date.now());
    const t = window.setInterval(() => setMaintenant(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, [actif]);

  const envois = useMemo(() => envoisTous.filter((e) => e && (!e.branchId || e.branchId === branch.id)), [envoisTous, branch.id]);
  const regles = useMemo(() => reglesDepuis(cfg), [cfg]);
  const heures = useMemo(() => heuresDesRappels(cfg as { rappelPremier?: unknown; rappelSecond?: unknown }), [cfg]);
  /* L'Assistant rejoué jour par jour : le plus lourd ; à la minute près, il suffit à l'heure. */
  const heureRonde = Math.floor(maintenantMs / 3_600_000);
  const perle = useMemo(() => (actif
    ? lignesDePerleAVenir({ entrees: entreesDePerle, maintenantMs, regles, passageFaitLe: dernierPassageDePerle(envois) })
    : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [actif, entreesDePerle, regles, heureRonde, envois]);

  const liste = useMemo(() => {
    if (!actif) return [];
    const piecesDesContrats = new Set(contrats.map((c) => c.invoiceId).filter((x): x is string => !!x));
    const entrees: EntreesDeCeQuiVaPartir = {
      maintenantMs, regles, heures,
      rdvs: appts as unknown as EntreesDeCeQuiVaPartir['rdvs'],
      fiches: clients as unknown as EntreesDeCeQuiVaPartir['fiches'],
      envois: envois as unknown as EntreesDeCeQuiVaPartir['envois'],
      relances: {
        enService: relancesEnService(settings as Parameters<typeof relancesEnService>[0]),
        reglages: settings.relances,
        pieces: factures.filter((p) => !p.branchId || p.branchId === branch.id) as unknown as PieceDeRelanceAVenir[],
        familles,
        resteDe: (p) => invoiceResteXof(p as never),
        estFormule: (p) => piecesDesContrats.has(p.id) || /^Abonnement\b/.test(String((p as { note?: string }).note ?? '')),
        modelePoint: !!settings.relances?.modelePoint,
      },
      perle,
      arrets, pauses,
      essais,
    };
    return ceQuiVaPartir(entrees);
  }, [actif, maintenantMs, regles, heures, appts, clients, envois, settings, factures, familles, contrats, perle, arrets, pauses, essais, branch.id]);

  return { liste, maintenantMs };
}

/** LES ESSAIS, NOMMÉS À LA RÈGLE (8 novembre 2026) : les fiches cochées
    « d'essai » (toutes, archivées comprises : une ligne en salle peut encore
    nommer l'une d'elles) et les rendez-vous d'essai de la branche. */
export function useEssais(): NonNullable<EntreesDeCeQuiVaPartir['essais']> {
  const [toutesLesFiches] = useClients();
  const avecEssais = useBranchAppointmentsAvecEssais();
  return useMemo(() => {
    const parId = fichesParId(toutesLesFiches);
    return {
      fiches: new Set(toutesLesFiches.filter((c) => estUneFicheDEssai(c)).map((c) => c.id)),
      rdvs: new Set(avecEssais.filter((a) => estUnRdvDEssai(a, parId)).map((a) => a.id)),
    };
  }, [toutesLesFiches, avecEssais]);
}

/** Les fiches d'essai avec leur numéro : le fil (`messages_wa`) ne nomme pas
    toujours la fiche, « Les modèles Meta » écarte aussi par le numéro. */
export function useFichesDEssai(): { id: string; phone?: string }[] {
  const [toutesLesFiches] = useClients();
  return useMemo(() => toutesLesFiches.filter((c) => estUneFicheDEssai(c)).map((c) => ({ id: c.id, phone: c.phone })), [toutesLesFiches]);
}
