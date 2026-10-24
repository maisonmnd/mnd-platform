import { useEffect, useMemo, useState } from 'react';
import { useBranch } from '../../../../shared/branches';
import { supabase } from '../../../../shared/supabase';
import { predictNextVisit } from '../../../../shared/cadence';
import { aDefaitSesLocks, estDePassage, estDiaspora } from '../../../../shared/clients';
import { useMessagesWa } from '../../../../shared/conversations';
import { openingForIso } from '../../../../shared/settings';
import { useBlocages, plagesBloquees } from '../../../../shared/blocages';
import { CLE_DU_COMPTEUR_DES_HUIT, PLAFOND_DES_HUIT_USD } from '../../../../shared/ia-maison-pur';
import { passagesStore, processusStore, usePassagesStore, useProcessusStore } from '../../../../shared/processus';
import {
  PROCESSUS_DES_AGENTS, derniersContacts, deuxPlaces, idDuPassage, listeDuPassage, passageAFaire, passagesGardes,
  type Passage, type Processus, type StatutDeLigne, type TeteDuProcessus,
} from '../../../../shared/processus-pur';
import { placesDuJour } from '../clients/rdv-fluide-pur';
import {
  addDaysISO, apptDurationMin, timeToMin, todayISO, useBranchAppointments, useBranchClients, useServicesById,
} from '../clients/_shared';

/* LES DONNÉES DES AGENTS ET DES PROCESSUS — 24 octobre 2026. Les règles
   vivent dans `shared/processus-pur.ts` ; ici, ce que le Trône leur donne à
   lire (les fiches, les rendez-vous, la Cadence, les messages déjà écrits)
   et les gestes qui écrivent dans les deux documents partagés. */

const p2 = (n: number) => String(n).padStart(2, '0');
export const maintenantLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

/** Les processus de la branche, agents livrés compris (éteints tant qu'on
    ne les a pas réglés), et leurs passages, du plus récent au plus ancien. */
export function useLesProcessus(): { processus: Processus[]; passages: Passage[] } {
  const { branch } = useBranch();
  const [tous] = useProcessusStore();
  const [passagesTous] = usePassagesStore();
  const processus = useMemo(() => {
    const siens = tous.filter((p) => p.branchId === branch.id);
    const livres = PROCESSUS_DES_AGENTS
      .filter((a) => !siens.some((p) => p.id === a.id))
      .map((a): Processus => ({ ...a, jours: [...a.jours], branchId: branch.id, creePar: 'La Maison', creeLe: '2026-10-24T00:00' }));
    return [...livres, ...siens];
  }, [tous, branch.id]);
  const passages = useMemo(
    () => passagesTous.filter((x) => x.branchId === branch.id).sort((a, b) => b.prevuA.localeCompare(a.prevuA)),
    [passagesTous, branch.id],
  );
  return { processus, passages };
}

export function enregistreLeProcessus(p: Processus): void {
  processusStore.set((prev) => (prev.some((x) => x.id === p.id && x.branchId === p.branchId)
    ? prev.map((x) => (x.id === p.id && x.branchId === p.branchId ? p : x))
    : [...prev, p]));
}

export function retireLeProcessus(p: Processus): void {
  processusStore.set((prev) => prev.filter((x) => !(x.id === p.id && x.branchId === p.branchId)));
  passagesStore.set((prev) => prev.filter((x) => !(x.processusId === p.id && x.branchId === p.branchId && x.lignes.every((l) => l.statut === 'a-valider'))));
}

export function poseLeStatut(passageId: string, clientId: string, statut: StatutDeLigne, par: string): void {
  passagesStore.set((prev) => prev.map((x) => (x.id !== passageId ? x : {
    ...x,
    lignes: x.lignes.map((l) => (l.clientId === clientId ? { ...l, statut, le: maintenantLocal(), par } : l)),
  })));
}

/** CE QUE LES AUDIENCES LISENT de chaque fiche de la branche. Le dernier
    contact : la dernière ligne écrite par un processus, ou le dernier
    message parti vers elle sur WhatsApp. */
export function useTetesDuProcessus(passages: readonly Passage[]): TeteDuProcessus[] {
  const clients = useBranchClients();
  const appts = useBranchAppointments();
  const [messages] = useMessagesWa();
  const aujourdhui = todayISO();
  return useMemo(() => {
    const parCliente = new Map<string, typeof appts>();
    for (const a of appts) { const l = parCliente.get(a.clientId); if (l) l.push(a); else parCliente.set(a.clientId, [a]); }
    const contacts = derniersContacts(passages);
    for (const m of messages) {
      if (m.sens !== 'sortant' || !m.clientId || !m.quand) continue;
      const d = m.quand.slice(0, 10);
      if (!contacts.has(m.clientId) || contacts.get(m.clientId)! < d) contacts.set(m.clientId, d);
    }
    return clients.map((c): TeteDuProcessus => {
      const siens = parCliente.get(c.id) ?? [];
      const cad = siens.length ? predictNextVisit(siens, [c], c.id, aujourdhui) : null;
      return {
        clientId: c.id,
        aVenir: siens.some((a) => a.status !== 'annulé' && a.status !== 'honoré' && a.date >= aujourdhui),
        venues: siens.filter((a) => a.status === 'honoré').map((a) => a.date),
        retardJours: cad?.predicted ? cad.overdueDays : 0,
        anniversaire: /^\d{4}-\d{2}-\d{2}/.test(c.birthday ?? '') ? c.birthday!.slice(5, 10) : undefined,
        ecartee: !!c.archived || estDePassage(c) || estDiaspora(c) || aDefaitSesLocks(c),
        dernierContact: contacts.get(c.id),
      };
    });
  }, [clients, appts, messages, passages, aujourdhui]);
}

/** LES PASSAGES DUS, FAITS À L'OUVERTURE. Le Trône n'a pas de réveil au
    serveur pour eux : le passage se fait quand un souverain ouvre le
    tableau de bord ou les agents, au premier créneau dû. Il ne rattrape
    qu'UN créneau (le dernier), jamais une semaine entière. */
export function useLancePassagesDus(actif: boolean, processus: readonly Processus[], passages: readonly Passage[], tetes: readonly TeteDuProcessus[]): void {
  useEffect(() => {
    if (!actif || tetes.length === 0) return;
    const d = new Date();
    const aujourdhui = todayISO();
    const min = d.getHours() * 60 + d.getMinutes();
    const nouveaux: Passage[] = [];
    for (const p of processus) {
      const c = passageAFaire(p, passages, aujourdhui, min);
      if (!c) continue;
      nouveaux.push({
        id: idDuPassage(p.branchId, p.id, c), processusId: p.id, branchId: p.branchId, prevuA: c, faitLe: maintenantLocal(),
        lignes: listeDuPassage(p, tetes, aujourdhui).map((l) => ({ ...l, statut: 'a-valider' as const })),
      });
    }
    if (!nouveaux.length) return;
    passagesStore.set((prev) => [...passagesGardes(prev.filter((x) => !nouveaux.some((n) => n.id === x.id)), aujourdhui), ...nouveaux]);
  }, [actif, processus, passages, tetes]);
}

/** UNE LISTE TOUT DE SUITE — 24 octobre 2026, l'agent du planning : un jour
    creux se remplit en proposant ses places aux reprises maintenant, sans
    attendre lundi. Le passage porte l'heure du geste ; il ne compte pas comme
    le passage du lundi (identifiant différent). */
export function preparePassageMaintenant(p: Processus, tetes: readonly TeteDuProcessus[]): { ok: boolean; lignes: number } {
  const maintenant = maintenantLocal();
  const aujourdhui = maintenant.slice(0, 10);
  const lignes = listeDuPassage(p, tetes, aujourdhui).map((l) => ({ ...l, statut: 'a-valider' as const }));
  const passage: Passage = { id: idDuPassage(p.branchId, p.id, maintenant), processusId: p.id, branchId: p.branchId, prevuA: maintenant, faitLe: maintenant, lignes };
  passagesStore.set((prev) => [...passagesGardes(prev.filter((x) => x.id !== passage.id), aujourdhui), passage]);
  return { ok: true, lignes: lignes.length };
}

/** DEUX PLACES LIBRES dans les sept jours qui viennent (dès demain), pour
    la durée et le maître de son dernier rituel. */
export function usePlacesLibres(): (clientId: string) => { iso: string; heure: string }[] {
  const { branch } = useBranch();
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const [blocages] = useBlocages();
  return useMemo(() => {
    const aujourdhui = todayISO();
    const jours = [1, 2, 3, 4, 5, 6, 7].map((k) => addDaysISO(aujourdhui, k));
    const sieges = Math.max(0, branch.seats ?? 0);
    const occupes = new Map(jours.map((iso) => [iso, appts
      .filter((a) => a.date === iso && a.status !== 'annulé')
      .map((a) => ({ maitre: a.master, debutMin: timeToMin(a.time), dureeMin: apptDurationMin(a, byId) }))]));
    const cache = new Map<string, { iso: string; heure: string }[]>();
    return (clientId: string) => {
      const dernier = appts.filter((a) => a.clientId === clientId && a.status === 'honoré').sort((a, b) => a.date.localeCompare(b.date)).pop();
      const duree = dernier ? Math.max(30, apptDurationMin(dernier, byId)) : 120;
      const maitre = dernier?.master || 'Team';
      const cle = `${duree}|${maitre}`;
      if (!cache.has(cle)) {
        cache.set(cle, deuxPlaces(jours.map((iso) => placesDuJour({
          iso, aujourdhui, maintenantMin: 0, ouverture: openingForIso(iso), durationMin: duree,
          occupes: occupes.get(iso) ?? [], bloques: plagesBloquees(blocages, branch.id, iso, maitre), sieges,
        }))));
      }
      return cache.get(cle)!;
    };
  }, [appts, byId, blocages, branch.id, branch.seats]);
}

/** CE QUE CLAUDE A COÛTÉ CE MOIS : la ligne du mois dans le compteur que
    la fonction ia-maison tient (`documents`, lisible par le personnel). */
export function useDepenseDuMois(): { usd: number; plafond: number } | null {
  const [v, setV] = useState<{ usd: number; plafond: number } | null>(null);
  useEffect(() => {
    const sb = supabase;
    if (!sb) return;
    let vivant = true;
    const mois = new Date(Date.now() + 3600_000).toISOString().slice(0, 7); // Cotonou, UTC+1
    void sb.from('documents').select('data').eq('key', CLE_DU_COMPTEUR_DES_HUIT).maybeSingle().then(({ data }) => {
      if (!vivant) return;
      const ligne = (data?.data as Record<string, { usd?: number }> | undefined)?.[mois];
      setV({ usd: Number(ligne?.usd ?? 0), plafond: PLAFOND_DES_HUIT_USD });
    });
    return () => { vivant = false; };
  }, []);
  return v;
}
