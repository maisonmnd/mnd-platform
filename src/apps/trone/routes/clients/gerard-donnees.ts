import { useEffect, useMemo, useRef } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useStaff } from '../../../../shared/auth';
import { useSettings, openingForIso } from '../../../../shared/settings';
import { useInvoices } from '../../../../shared/finance';
import { useFamilies } from '../../../../shared/clients';
import { useMessagesWa } from '../../../../shared/conversations';
import { useCartesCadeaux } from '../../../../shared/cartes-cadeaux';
import { prenomSeul } from '../../../../shared/civilite';
import { useSignalements } from '../../../../shared/entre-deux';
import { useBlocages } from '../../../../shared/blocages';
import { heureDeDepart, heureDuSalon, REGLES_PAR_DEFAUT } from '../../../../shared/salle-des-envois';
import { codesPromoStore, useCodesPromo } from '../../../../shared/promos';
import { useStore } from '../../../../shared/store';
import { ligneDeNotification, passageDu, planDuJour, servie, type LigneDeGerard, type Situation } from '../../../../shared/gerard-pur';
import { codeDeLaSituation, lisLAssistant, type CerveauDeGerard } from '../../../../shared/assistant-lecture-pur';
import { reglagesDeGerardStore, reglagesLus, useReglagesDeGerard } from '../../../../shared/gerard';
import { envoisStore, useEnvois } from '../equipe/data';
import { useAbonnesAuxNotifications } from '../equipe/useAudiences';
import { todayISO, useBranchAppointments, useBranchClients, useServicesById } from './_shared';

export type { CerveauDeGerard };

/* ══ CE QUE GÉRARD LIT, ET SON PASSAGE DU JOUR — 26 octobre 2026 ══════════
   Le cerveau est `shared/gerard-pur.ts`. Ici, ce qu'il lit autour de lui
   (fiches, RDV, Cadence, soucis, abonnées de Ma Couronne, ses propres
   envois) et le passage du jour : la rubrique Gérard et le tableau de bord
   l'appellent ; il ne tourne qu'une fois par jour, entre 8 h et 20 h.

   MAQUETTE V4 (lot 1) : la fiche lit aussi ce qui la fait taire (reste dû,
   relance de facture, réponse due, enfant d'un foyer, carte cadeau, remise
   déjà à son nom) et le dernier message hors service de TOUTES les voix de
   la Maison ; le plafond de la semaine compte toutes les remises à son nom
   et leurs francs.

   27 OCTOBRE 2026 : la lecture vit dans `shared/assistant-lecture-pur.ts`,
   partagée avec la fonction serveur `assistant-maison`. Ici, la prise sur
   les magasins du Trône, et rien d'autre. */

/** LES FICHES QUE L'ASSISTANT LIT, prises sur les magasins du Trône. */
export function useCerveauDeGerard(): CerveauDeGerard {
  const { branch } = useBranch();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const byId = useServicesById();
  const signalements = useSignalements();
  const abonnes = useAbonnesAuxNotifications();
  const [envois] = useEnvois();
  const [pieces] = useInvoices();
  const [blocages] = useBlocages();
  const [reglages] = useSettings();
  const [familles] = useFamilies();
  const [messages] = useMessagesWa();
  const [cartes] = useCartesCadeaux();
  const [codes] = useCodesPromo();
  const [brutGerard] = useReglagesDeGerard();
  const today = todayISO();

  return useMemo(() => lisLAssistant({
    aujourdhui: today, maintenantMs: Date.now(), branche: { id: branch.id, seats: branch.seats },
    clients, rdvs: appts, prestations: byId, signalements, abonnes, envois, messages, pieces, blocages,
    familles, cartes, codes, reglagesGerard: brutGerard, ouverture: openingForIso,
  }),
  /* Les réglages de la Maison (`reglages`) portent les heures que lit `openingForIso`. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [appts, clients, byId, signalements, abonnes, envois, pieces, blocages, branch.id, branch.seats, today, reglages, familles, messages, cartes, codes, brutGerard]);
}

/** LE CODE NOMINATIF d'une situation (jour creux, anniversaire), fabriqué
    au moment où le message part, à son nom, et gardé au registre. */
export function fabriqueLeCodeDe(s: Situation, o: { branchId: string; nom: string; maintenantMs: number }): string | undefined {
  const code = codeDeLaSituation(s, o, codesPromoStore.get());
  if (!code) return undefined;
  codesPromoStore.set((prev) => [...prev, code]);
  return code.code;
}

/** LE PASSAGE DU JOUR : les notifications Ma Couronne du plan, déposées
    en salle d'attente ; le facteur les porte à leur heure. Une fois par
    jour (le document `mnd_gerard` garde le jour du dernier passage), par
    la direction seule. Les lignes WhatsApp attendent un toucher. */
export function useLePassageDeGerard(cerveau: CerveauDeGerard | null, plan: readonly Situation[] | null): void {
  const { branch } = useBranch();
  const moi = useStaff();
  const [brut] = useReglagesDeGerard();
  const fait = useRef(false);
  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  useEffect(() => {
    if (!cerveau || !plan || !direction || fait.current) return;
    const r = reglagesLus(brut);
    const aujourdhui = cerveau.ctx.aujourdhui;
    const maintenant = Date.now();
    if (!passageDu(r, aujourdhui, heureDuSalon(maintenant))) return;
    fait.current = true;
    const iso = new Date(maintenant).toISOString();
    const { partA, calme } = heureDeDepart(maintenant, REGLES_PAR_DEFAUT);
    const lignes: LigneDeGerard[] = [];
    for (const s of plan) {
      if (s.canal !== 'couronne' || !servie(r, s.clientId)) continue;
      const c = cerveau.clientDe(s.clientId);
      const codePromo = fabriqueLeCodeDe(s, { branchId: branch.id, nom: c?.name ?? '', maintenantMs: maintenant });
      lignes.push(ligneDeNotification(s, {
        branchId: branch.id, aujourdhui, maintenantIso: iso, prenom: prenomSeul(c?.name), rdv: s.genre === 'garder' ? cerveau.rdvAGarder(s.clientId) : undefined,
        codePromo, compte: cerveau.compteDe(s.clientId), partA: new Date(partA).toISOString(), calme,
      }));
    }
    if (lignes.length) {
      const ids = new Set(lignes.map((l) => l.id));
      envoisStore.set((prev) => [...prev.filter((e) => !ids.has(e.id)), ...(lignes as unknown as typeof prev)]);
    }
    reglagesDeGerardStore.set((prev) => ({ ...reglagesLus(prev), dernierPassage: aujourdhui }));
  }, [cerveau, plan, direction, brut, branch.id]);
}

/** Le passage, lancé du tableau de bord : la lecture des fiches ne tourne
    QUE si le passage est dû (comme les agents). */
export function usePassageDu(): boolean {
  const moi = useStaff();
  const [brut] = useStore(reglagesDeGerardStore);
  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  return direction && passageDu(reglagesLus(brut), todayISO(), heureDuSalon(Date.now()));
}

export function LanceurDeGerard(): null {
  const cerveau = useCerveauDeGerard();
  const plan = useMemo(() => planDuJour(cerveau.fiches, cerveau.ctx), [cerveau]);
  useLePassageDeGerard(cerveau, plan);
  return null;
}
