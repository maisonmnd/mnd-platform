import { useEffect, useMemo, useRef } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useStaff } from '../../../../shared/auth';
import { useSettings, openingForIso } from '../../../../shared/settings';
import { apptPaidXof } from '../../../../shared/agenda';
import { useInvoices } from '../../../../shared/finance';
import { predictNextVisit } from '../../../../shared/cadence';
import { aDefaitSesLocks, estDePassage, estDiaspora, type Client } from '../../../../shared/clients';
import { appelDe, prenomSeul } from '../../../../shared/civilite';
import { aAccepteLesNouvelles } from '../../../../shared/audiences-pur';
import { useSignalements } from '../../../../shared/entre-deux';
import { souciOuvertDe } from '../../../../shared/gerard-entre-deux-pur';
import { useBlocages, plagesBloquees } from '../../../../shared/blocages';
import { GESTES_EN_FRANCAIS, litLaMarqueWa } from '../../../../shared/gestes-en-francais';
import { estUneVenue } from '../../../../shared/previsions-pur';
import { rdvParJour, reperesDe, reperesParJour } from '../../../../shared/objectifs-des-fauteuils-pur';
import { heureDeDepart, heureDuSalon, REGLES_PAR_DEFAUT } from '../../../../shared/salle-des-envois';
import { codesPromoStore, fabriqueLeCode } from '../../../../shared/promos';
import { useStore } from '../../../../shared/store';
import {
  GENRE_DIT, REMISES_PAR_SEMAINE, familleDuNom, joursCreux, ligneDeNotification, passageDu, planDuJour, servie, tracesDesEnvois,
  type ContexteDeGerard, type FamilleDeSoin, type FicheDeGerard, type LigneDeGerard, type Place, type Situation,
} from '../../../../shared/gerard-pur';
import { reglagesDeGerardStore, reglagesLus, useReglagesDeGerard } from '../../../../shared/gerard';
import { deuxPlaces } from '../../../../shared/processus-pur';
import { envoisStore, useEnvois } from '../equipe/data';
import { useAbonnesAuxNotifications } from '../equipe/useAudiences';
import { placesDuJour } from './rdv-fluide-pur';
import { addDaysISO, apptDurationMin, timeToMin, todayISO, useBranchAppointments, useBranchClients, useServicesById } from './_shared';

/* ══ CE QUE GÉRARD LIT, ET SON PASSAGE DU JOUR — 26 octobre 2026 ══════════
   Le cerveau est `shared/gerard-pur.ts`. Ici, ce qu'il lit autour de lui
   (fiches, RDV, Cadence, soucis, abonnées de Ma Couronne, ses propres
   envois) et le passage du jour : la rubrique Gérard et le tableau de bord
   l'appellent ; il ne tourne qu'une fois par jour, entre 8 h et 20 h. */

const NOM_DE_LA_FAMILLE: Record<FamilleDeSoin, string> = {
  resserrage: 'resserrage des racines', couleur: 'couleur végétale', hydratation: 'soin hydratant',
  lavage: 'lavage rituel', coiffure: 'coiffure', autre: 'soin',
};

/** Le lundi de la semaine d'un jour. */
const lundiDe = (j: string): string => { const d = new Date(`${j}T12:00:00Z`); const s = (d.getUTCDay() + 6) % 7; return addDaysISO(j, -s); };

export type CerveauDeGerard = {
  fiches: FicheDeGerard[];
  ctx: ContexteDeGerard;
  nomDe: (id: string) => string;
  clientDe: (id: string) => Client | undefined;
  /** Le compte où elle reçoit ses notifications : sa fiche, ou son compte Ma Couronne. */
  compteDe: (id: string) => string;
  rdvAGarder: (clientId: string) => { id: string; date: string; time: string } | undefined;
};

/** LES FICHES QUE GÉRARD LIT, et ce dont il a besoin autour d'elles. */
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
  const today = todayISO();

  return useMemo(() => {
    const factures = new Set(pieces.filter((p) => p.apptId && p.kind === 'facture').map((p) => p.apptId as string));
    const parCliente = new Map<string, typeof appts>();
    for (const a of appts) { const l = parCliente.get(a.clientId); if (l) l.push(a); else parCliente.set(a.clientId, [a]); }
    const nomDuService = (id: string) => byId.get(id)?.name ?? '';
    const ilYA60 = addDaysISO(today, -60);
    const traces = tracesDesEnvois(envois as unknown as Parameters<typeof tracesDesEnvois>[0]);
    const abonnee = (c: Client) => abonnes.has(c.id) || (!!c.authUserId && abonnes.has(c.authUserId));

    const fiches: FicheDeGerard[] = clients.map((c) => {
      const siens = parCliente.get(c.id) ?? [];
      const rdvs = siens.map((a) => ({
        id: a.id, date: a.date, time: a.time, status: a.status, creeLe: a.creeLe,
        familles: (a.serviceIds ?? []).map((id) => familleDuNom(nomDuService(id))),
        venu: estUneVenue({ date: a.date, status: a.status, encaisse: apptPaidXof(a) > 0, facture: !!a.invoiceId || factures.has(a.id) }, today),
      }));
      const cad = siens.length ? predictNextVisit(siens, [c], c.id, today) : null;
      /* Le nom de son soin habituel : celui de sa dernière venue, en français. */
      const derniere = siens.filter((a) => a.status === 'honoré').sort((x, y) => x.date.localeCompare(y.date)).pop();
      const premierNom = derniere ? nomDuService(derniere.serviceIds?.[0] ?? '') : '';
      const geste = GESTES_EN_FRANCAIS[litLaMarqueWa(premierNom).marque];
      const soinDit = geste ? geste.long.toLowerCase() : NOM_DE_LA_FAMILLE[familleDuNom(premierNom)];
      return {
        id: c.id,
        appel: appelDe(c),
        soinDit,
        birthday: c.birthday,
        birthdayGiftAt: c.birthdayGiftAt,
        accord: aAccepteLesNouvelles(c),
        stop: c.nouvelles?.par === 'stop' && c.nouvelles?.oui === false,
        couronne: abonnee(c),
        telephone: (c.phone ?? '').replace(/\D/g, '').length >= 8,
        ecartee: estDePassage(c) || estDiaspora(c) || aDefaitSesLocks(c) || !!c.archived,
        soucis: signalements.filter((s) => s.clientId === c.id && (s.quand ?? '') >= ilYA60).flatMap((s) => s.soucis ?? []),
        souciOuvert: souciOuvertDe(signalements.filter((s) => s.clientId === c.id)),
        rdvs,
        traces: traces.get(c.id) ?? [],
        /* La date ATTENDUE : pour une cliente en retard, la Cadence reporte
           sa date au cycle suivant ; Gérard lit la date manquée. */
        cadence: {
          iso: cad?.predicted ? (cad.overdueDays > 0 ? addDaysISO(today, -cad.overdueDays) : cad.iso) : null,
          rythmeJours: cad?.avgDays ?? (c.rythmeSemaines ? c.rythmeSemaines * 7 : null),
        },
      };
    });

    /* Les remises de jour creux déjà données cette semaine. */
    const lundi = lundiDe(today);
    const donnees = (envois as unknown as { type?: string; genre?: string; statut?: string; deposeLe?: string; quand?: string }[])
      .filter((e) => e.type === 'gerard' && e.genre === 'creux' && e.statut !== 'écarté' && e.statut !== 'périmé' && e.statut !== 'échec'
        && (e.deposeLe ?? e.quand ?? '').slice(0, 10) >= lundi).length;
    const remisesRestantes = Math.max(0, REMISES_PAR_SEMAINE - donnees);

    /* Les jours creux : posés contre l'ordinaire de ce jour de la semaine. */
    const ouvertLe = (j: string) => !openingForIso(j).closed;
    const parJour = rdvParJour(appts.map((a) => ({ date: a.date, status: a.status })));
    const reperes = reperesParJour({ parJour, aujourdhui: today, ouvertLe });
    const creux = joursCreux({ aujourdhui: today, parJour, ordinaireDe: (j) => reperesDe(reperes, j).ordinaire, ouvertLe, remisesRestantes });

    /* Deux places pour elle : la durée et le maître de son dernier rituel. */
    const sieges = Math.max(0, branch.seats ?? 0);
    const occupesDu = (iso: string) => appts.filter((a) => a.date === iso && a.status !== 'annulé')
      .map((a) => ({ maitre: a.master, debutMin: timeToMin(a.time), dureeMin: apptDurationMin(a, byId) }));
    const cache = new Map<string, Place[]>();
    const placesDe = (clientId: string, jour?: string): Place[] => {
      const dernier = (parCliente.get(clientId) ?? []).filter((a) => a.status === 'honoré').sort((x, y) => x.date.localeCompare(y.date)).pop();
      const duree = dernier ? Math.max(30, apptDurationMin(dernier, byId)) : 120;
      const maitre = dernier?.master || 'Team';
      const cle = `${duree}|${maitre}|${jour ?? '7'}`;
      if (!cache.has(cle)) {
        const jours = jour ? [jour] : [1, 2, 3, 4, 5, 6, 7].map((k) => addDaysISO(today, k));
        cache.set(cle, deuxPlaces(jours.map((iso) => placesDuJour({
          iso, aujourdhui: today, maintenantMin: 0, ouverture: openingForIso(iso), durationMin: duree,
          occupes: occupesDu(iso), bloques: plagesBloquees(blocages, branch.id, iso, maitre), sieges,
        }))));
      }
      return cache.get(cle)!;
    };

    const parId = new Map(clients.map((c) => [c.id, c]));
    return {
      fiches,
      ctx: { aujourdhui: today, creux, remisesRestantes, placesDe },
      nomDe: (id: string) => parId.get(id)?.name ?? '',
      clientDe: (id: string) => parId.get(id),
      compteDe: (id: string) => { const c = parId.get(id); return c?.authUserId && abonnes.has(c.authUserId) ? c.authUserId : id; },
      rdvAGarder: (clientId: string) => (parCliente.get(clientId) ?? [])
        .filter((a) => a.date === addDaysISO(today, 2) && a.status !== 'annulé' && a.status !== 'honoré')
        .map((a) => ({ id: a.id, date: a.date, time: a.time }))[0],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appts, clients, byId, signalements, abonnes, envois, pieces, blocages, branch.id, branch.seats, today, reglages]);
}

/** Les heures d'un code jusqu'à la fin de son dernier jour (23 h 59 à Cotonou). */
const heuresJusquA = (jour: string, maintenantMs: number): number =>
  Math.max(1, Math.ceil((Date.parse(`${jour}T23:59:00+01:00`) - maintenantMs) / 3_600_000));

/** LE CODE NOMINATIF d'une situation (jour creux, anniversaire), fabriqué
    au moment où le message part, à son nom. */
export function fabriqueLeCodeDe(s: Situation, o: { branchId: string; nom: string; maintenantMs: number }): string | undefined {
  if (!s.code) return undefined;
  const code = fabriqueLeCode({
    branchId: o.branchId, clientId: s.clientId, clientNom: o.nom, mot: s.code.mot, remisePct: s.code.pct,
    heures: heuresJusquA(s.code.jusquau, o.maintenantMs), parQui: 'Gérard', note: GENRE_DIT[s.genre],
    maintenant: new Date(o.maintenantMs).toISOString(),
  }, codesPromoStore.get());
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
