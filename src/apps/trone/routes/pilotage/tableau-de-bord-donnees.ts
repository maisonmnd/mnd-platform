import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useStaff as useMaTete } from '../../../../shared/auth';
import { useSettings, openingForIso } from '../../../../shared/settings';
import { getSyncState, subscribeSync } from '../../../../shared/sync';
import { aValider as aValiderLesDepenses, useCashboxes, useEntreesHorsActivite, useExpenses } from '../../../../shared/finance';
import { useClotures } from '../../../../shared/caisse-du-soir';
import { aValider, tiroirsQuiSeComptent, tiroirsSansCloture } from '../../../../shared/caisse-du-soir-pur';
import { dernierPassage, useComptesRendusDeGrenat } from '../../../../shared/cloture-du-jour';
import { aCotonouLe, heuresDeLaCloture } from '../../../../shared/cloture-du-jour-pur';
import { EN_ATTENTE } from '../../../../shared/salle-des-envois';
import { useOffers } from '../../../../shared/offers';
import { useAppointments } from '../../../../shared/agenda';
import { isoDuJour, jourDeLaSemaine, occupationDuJour, placesRestantes } from '../../../../shared/offres-pur';
import { useTips } from '../../../../shared/tips';
import { partsDeLaMaison, totauxDe } from '../../../../shared/pourboires-de-l-equipe-pur';
import { ID_DES_PLACES, offresApresLeReglage, reglageDesPlaces } from '../clients/places-au-trone-pur';
import { useRegistreEncaissements, todayISO } from '../finances/_shared';
import { useEnvois, useStaff as useEquipe } from '../equipe/data';
import { envoisSousLaDemiHeure, prochainPassage } from './tableau-de-bord-pur';

/* ══ CE QUE LE TABLEAU DE BORD LIT, EN NOMBRES — 5 novembre 2026 ══════════
   Les blocs d'avant (la veille à valider, la pastille de la salle, le réglage
   des places limitées, le tableau des pourboires) gardent leurs écrans ; le
   tableau de bord n'en lit que les nombres, avec LEURS juges, tels quels, sur
   les magasins déjà ouverts : aucune lecture de plus vers la base. */

const hier = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** LA VEILLE À VALIDER, en nombres (le juge de `LaVeilleAValider`) : les
    écarts déclarés à trancher, les tiroirs qui ont bougé hier sans être
    comptés, et si Grenat a quelque chose à dire de la veille. Le souverain
    et le gérant seuls ; les autres ne voient rien. */
export function useLaVeilleEnNombres(): { voit: boolean; ecarts: number; oublies: string[]; grenat: boolean } {
  const me = useMaTete();
  const { branch } = useBranch();
  const [clotures] = useClotures();
  const [boxes] = useCashboxes();
  const [expenses] = useExpenses();
  const [horsActivite] = useEntreesHorsActivite();
  const registre = useRegistreEncaissements();
  const [crs] = useComptesRendusDeGrenat();
  const voit = me?.role === 'souverain' || me?.role === 'gerant';
  const veille = hier(todayISO());
  return useMemo(() => {
    const ecarts = aValider(clotures, branch.id).length;
    const oublies = tiroirsSansCloture({
      branchId: branch.id, date: veille, registre, depenses: expenses, clotures,
      seComptent: new Set(tiroirsQuiSeComptent(boxes, branch.id).map((b) => b.name)),
      horsActivite,
    });
    const g = dernierPassage(crs, branch.id, veille);
    const grenat = !!g && (!g.cloture.verdict.close || (g.gestesFaits?.length ?? 0) > 0 || g.cloture.alarmes.length > 0 || (g.cloture.depenses?.aDire ?? []).length > 0);
    return { voit, ecarts: voit ? ecarts : 0, oublies: voit ? oublies : [], grenat: voit && grenat };
  }, [voit, clotures, branch.id, veille, registre, expenses, boxes, horsActivite, crs]);
}

/** L'ÉTAT DE LA SYNCHRO, en un mot (la pastille du Trône le détaille). */
export function useSynchroDite(): { dit: string; ton: 'ok' | 'attente' | 'ko' | 'neutre' } {
  const s = useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
  if (!s.enabled) return { dit: 'Sur cet appareil', ton: 'neutre' };
  if (!s.online) return { dit: 'Hors ligne', ton: 'attente' };
  if (s.failed > 0) return { dit: 'Synchro en échec', ton: 'ko' };
  if (s.pending > 0) return { dit: 'Synchronisation', ton: 'attente' };
  return { dit: 'Synchronisé', ton: 'ok' };
}

/** L'horloge de l'écran, à la minute. */
export function useMinute(): number {
  const [ms, setMs] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setMs(Date.now()), 60_000); return () => window.clearInterval(t); }, []);
  return ms;
}

/** LES ENVOIS DE LA DEMI-HEURE : ce que la salle d'attente laisse partir d'ici
    trente minutes (la pastille de la salle, comptée sur la même règle). */
export function useEnvoisDeLaDemiHeure(maintenantMs: number): number {
  const { branch } = useBranch();
  const [envois] = useEnvois();
  return useMemo(
    () => envoisSousLaDemiHeure(envois.filter((e) => !!e && (!e.branchId || e.branchId === branch.id)), maintenantMs, EN_ATTENTE),
    [envois, branch.id, maintenantMs],
  );
}

/** LE PROCHAIN PASSAGE DE GRENAT, aux heures réglées (Système › Paramètres) :
    « 15 h », ou `null` quand le dernier de la journée est passé. */
export function useProchainPassageDeGrenat(maintenantMs: number): number | null {
  const [settings] = useSettings();
  return prochainPassage(heuresDeLaCloture(settings.cloture?.heures), aCotonouLe(maintenantMs).minutes);
}

/** LES PLACES LIMITÉES OUVERTES, d'après le carnet (le calcul de l'aperçu du
    réglage, `CartePlacesLimitees`) : chaque jour ouvert et ses places. */
export function usePlacesLimiteesOuvertes(): { active: boolean; jours: { iso: string; reste: number }[] } {
  const { branch } = useBranch();
  const [offres] = useOffers();
  const [rdvs] = useAppointments();
  return useMemo(() => {
    const r = reglageDesPlaces(offres);
    const o = offresApresLeReglage(offres, {}, { branchId: branch?.id ?? '' }).find((x) => x.id === ID_DES_PLACES);
    if (!o || !o.active) return { active: false, jours: [] };
    const aujourdhui = isoDuJour(new Date());
    const jours: { iso: string; reste: number }[] = [];
    for (let k = 0; k <= r.horizon; k += 1) {
      const d = new Date(`${aujourdhui}T12:00:00`);
      d.setDate(d.getDate() + k);
      const iso = isoDuJour(d);
      if (!r.jours.includes(jourDeLaSemaine(iso) ?? '')) continue;
      const reste = placesRestantes(o, iso, occupationDuJour(o, rdvs, iso, { branchId: o.branchId || branch?.id }), aujourdhui);
      if (reste !== null && reste > 0) jours.push({ iso, reste });
    }
    return { active: true, jours };
  }, [offres, rdvs, branch?.id]);
}

/** LES POURBOIRES DE L'ÉQUIPE, le total du mois et du mois d'avant (le
    tableau d'Équipe › Les pourboires, mêmes parts). */
export function usePourboiresDeLEquipe(aujourdhui: string): { mois: number; moisPrecedent: number } {
  const { branch } = useBranch();
  const [tips] = useTips();
  const [team] = useEquipe();
  return useMemo(() => {
    const equipe = team.filter((m) => m.branchId === branch.id);
    const t = totauxDe(partsDeLaMaison(tips, equipe, team), aujourdhui);
    return { mois: t.mois, moisPrecedent: t.moisPrecedent };
  }, [tips, team, branch.id, aujourdhui]);
}

/** LES DÉPENSES À VALIDER, toutes dates : celles de l'équipe et celles que
    Grenat prépare (5 novembre 2026), le juge de Finances › Dépenses
    (`aValider`, la liste « N dépenses préparées, à valider »). */
export function useDepensesAValider(): number {
  const { branch } = useBranch();
  const [expenses] = useExpenses();
  return useMemo(() => aValiderLesDepenses(expenses, branch.id).length, [expenses, branch.id]);
}

/** Un jour fermé (Paramètres › Jours & heures d'ouverture). */
export const estFermeLe = (iso: string): boolean => openingForIso(iso).closed;
