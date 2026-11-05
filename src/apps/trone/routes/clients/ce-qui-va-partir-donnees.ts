import { useEffect, useMemo, useState } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useSettings } from '../../../../shared/settings';
import { useInvoices } from '../../../../shared/finance';
import { invoiceResteXof } from '../../../../shared/finance-pur';
import { useFamilies } from '../../../../shared/clients';
import { useSubscribers } from '../../../../shared/abonnements';
import { reglesDepuis } from '../../../../shared/salle-des-envois';
import { heuresDesRappels } from '../../../../shared/heures-des-rappels-pur';
import { useArrets, usePauses } from '../../../../shared/arrets-d-avance';
import {
  ceQuiVaPartir, dernierPassageDePerle, lignesDePerleAVenir, relancesEnService,
  type EntreesDeCeQuiVaPartir, type MessagePrevu, type PieceDeRelanceAVenir,
} from '../../../../shared/ce-qui-va-partir-pur';
import { useAutoConfig, useEnvois } from '../equipe/data';
import { useEntreesDeLAssistant } from './gerard-donnees';
import { useBranchAppointments, useBranchClients } from './_shared';

/* ══ CE QUI VA PARTIR, LA PRISE SUR LES MAGASINS — 5 novembre 2026 ═══════
   La règle vit dans `shared/ce-qui-va-partir-pur.ts`. Ici, ce qu'elle lit,
   pris sur les magasins du Trône : les rendez-vous et les fiches de la
   maison, le journal des envois, les réglages (heures des rappels, salle,
   heures calmes), les factures et leurs relances, et les entrées de
   l'Assistant Maison, rejouées jour par jour par son propre cerveau. Le
   calcul ne tourne que lorsque l'onglet est ouvert (`actif`), et l'heure
   avance d'elle-même chaque minute. */
export function useCeQuiVaPartir(actif: boolean): { liste: MessagePrevu[]; maintenantMs: number } {
  const { branch } = useBranch();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const [envoisTous] = useEnvois();
  const [cfg] = useAutoConfig();
  const [settings] = useSettings();
  const [factures] = useInvoices();
  const [familles] = useFamilies();
  const [contrats] = useSubscribers();
  const [arrets] = useArrets();
  const [pauses] = usePauses();
  const entreesDePerle = useEntreesDeLAssistant();
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
    };
    return ceQuiVaPartir(entrees);
  }, [actif, maintenantMs, regles, heures, appts, clients, envois, settings, factures, familles, contrats, perle, arrets, pauses, branch.id]);

  return { liste, maintenantMs };
}
