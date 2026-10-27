import { useEffect, useMemo, useRef } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useStaff } from '../../../../shared/auth';
import { useSettings, openingForIso } from '../../../../shared/settings';
import { useInvoices } from '../../../../shared/finance';
import { useFamilies } from '../../../../shared/clients';
import { useMessagesWa } from '../../../../shared/conversations';
import { useCartesCadeaux } from '../../../../shared/cartes-cadeaux';
import { useSignalements } from '../../../../shared/entre-deux';
import { useBlocages } from '../../../../shared/blocages';
import { heureDuSalon, REGLES_PAR_DEFAUT } from '../../../../shared/salle-des-envois';
import { supabase } from '../../../../shared/supabase';
import { codesPromoStore, useCodesPromo } from '../../../../shared/promos';
import { useStore } from '../../../../shared/store';
import { passageDu, planDuJour, type Situation } from '../../../../shared/gerard-pur';
import { codeDeLaSituation, lisLAssistant, type CerveauDeGerard } from '../../../../shared/assistant-lecture-pur';
import { CLE_DU_SERVEUR, lignesDuPassage, lignesNeuves, remisesAFabriquer, serveurVivant, type EtatDuServeur } from '../../../../shared/assistant-passage-pur';
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
export function fabriqueLeCodeDe(s: Pick<Situation, 'clientId' | 'genre' | 'code'>, o: { branchId: string; nom: string; maintenantMs: number }): string | undefined {
  const code = codeDeLaSituation(s, o, codesPromoStore.get());
  if (!code) return undefined;
  codesPromoStore.set((prev) => [...prev, code]);
  return code.code;
}

/** LA FONCTION SERVEUR VIT-ELLE ? `null` si on ne SAIT pas (hors ligne,
    refus) : dans le doute, le Trône ne double rien. */
async function laFonctionServeurSeTait(): Promise<boolean | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('documents').select('data').eq('key', CLE_DU_SERVEUR).maybeSingle();
  if (error) return null;
  return !serveurVivant((data?.data ?? null) as EtatDuServeur | null, Date.now());
}

/** LE PASSAGE DU JOUR, AU TRÔNE : le même que celui de la fonction serveur
    (`lignesDuPassage`), fait ici seulement quand elle se tait depuis plus de
    26 heures (pas encore collée, ou en panne). Une fois par jour (le
    document `mnd_gerard` garde le jour du dernier passage), par la
    direction seule. Seules les lignes neuves s'écrivent : une ligne déjà au
    journal (partie, retenue) n'est jamais réécrite. */
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
    void laFonctionServeurSeTait().then((tue) => {
      if (tue !== true) return;
      const lignes = lignesDuPassage({ cerveau, plan, reglagesGerard: brut, maintenantMs: maintenant, branchId: branch.id, regles: REGLES_PAR_DEFAUT });
      envoisStore.set((prev) => [...prev, ...(lignesNeuves(lignes, new Set(prev.map((e) => e.id))) as unknown as typeof prev)]);
      reglagesDeGerardStore.set((prev) => ({ ...reglagesLus(prev), dernierPassage: aujourdhui }));
    });
  }, [cerveau, plan, direction, brut, branch.id]);
}

/** LES REMISES AU DÉPART RÉEL, AU TRÔNE : une ligne de l'Assistant partie
    (« envoyé ») qui porte une remise à faire la reçoit ici, une fois,
    quand la fonction serveur se tait. Un jour creux passé ne se remise plus. */
export function useLesRemisesAuDepart(): void {
  const { branch } = useBranch();
  const moi = useStaff();
  const [envois] = useEnvois();
  const [clients] = useNomsDesFiches();
  const faites = useRef(new Set<string>());
  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  const aFaire = useMemo(() => remisesAFabriquer(envois as unknown as readonly unknown[]), [envois]);
  useEffect(() => {
    const neuves = aFaire.filter((l) => !faites.current.has(l.id));
    if (!direction || neuves.length === 0) return;
    for (const l of neuves) faites.current.add(l.id);
    void laFonctionServeurSeTait().then((tue) => {
      if (tue !== true) { for (const l of neuves) faites.current.delete(l.id); return; }
      const aujourdhui = todayISO();
      const codes = new Map<string, { codePromo: string; detailRemise?: string }>();
      for (const l of neuves) {
        if (l.codeAFaire.jusquau < aujourdhui) { codes.set(l.id, { codePromo: '', detailRemise: 'jour passé, pas de remise' }); continue; }
        const code = fabriqueLeCodeDe({ clientId: l.clientId, genre: l.genre, code: l.codeAFaire },
          { branchId: l.branchId || branch.id, nom: clients.get(l.clientId) ?? '', maintenantMs: Date.now() });
        if (code) codes.set(l.id, { codePromo: code });
      }
      if (codes.size) envoisStore.set((prev) => prev.map((e) => (codes.has(e.id) ? { ...e, ...codes.get(e.id) } : e)));
    });
  }, [aFaire, direction, branch.id, clients]);
}

/** Le nom de chaque fiche, pour signer une remise à son nom. */
function useNomsDesFiches(): [ReadonlyMap<string, string>] {
  const clients = useBranchClients();
  return [useMemo(() => new Map(clients.map((c) => [c.id, c.name ?? ''])), [clients])];
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
