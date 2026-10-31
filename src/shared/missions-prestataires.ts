/* ══ LES MISSIONS DES PRESTATAIRES, LE MAGASIN — 1er novembre 2026 ═══════
   Le registre `mnd_prestations` vivait dans l'écran `equipe/Prestataires.tsx`.
   Il en sort parce que l'honneur d'un rituel (`clients/actions.tsx`) doit y
   écrire, et qu'un écran ne s'importe pas dans un autre. La règle est dans
   `missions-prestataires-pur.ts` ; ici, les lectures et les écritures. */
import { createStore, uid, useStore } from './store';
import { bindDocument } from './sync';
import { providersStore } from './prestataires';
import { cashboxesStore, caissesVivantes, expensesStore, expenseCategoriesStore, type Expense } from './finance';
import { identiteCourante } from './journal';
import {
  CHARGE_CATEGORY, ID_CATEGORIE_CHARGE, caisseDeLaMission, chargeDeLaMission, ditLesMissionsNees,
  missionsARetirerAuDeshonneur, missionsNeesDuRituel,
  type MissionDuPrestataire, type MissionNee, type RituelPourMissions,
} from './missions-prestataires-pur';

export type { MissionDuPrestataire } from './missions-prestataires-pur';

export const missionsStore = createStore<MissionDuPrestataire[]>('mnd_prestations', []);
bindDocument(missionsStore, 'mnd_prestations');
export const useMissionsDesPrestataires = () => useStore(missionsStore);

export type MissionsPosees = { nees: MissionNee[]; caissePayee?: string; dit: string };

/** L'honneur d'un rituel donne sa mission à chaque prestataire concerné (voir
    la règle). Celles que la fiche dit « payées le jour même » naissent payées,
    et leur charge entre dans les Dépenses, de la caisse de l'encaissement
    quand on la connaît. Rend ce qui est né et la ligne à dire. */
export function poseLesMissionsDuRituel(
  rdv: RituelPourMissions,
  nomDe: (serviceId: string) => string | undefined,
  opts: { caisse?: string; parNom?: string } = {},
): MissionsPosees {
  const nees = missionsNeesDuRituel(rdv, providersStore.get(), missionsStore.get(), nomDe, () => `ms-${uid()}`);
  if (nees.length === 0) return { nees, dit: '' };
  const caisses = caissesVivantes(cashboxesStore.get()).filter((c) => c.branchId === rdv.branchId);
  const caissePayee = caisseDeLaMission(opts.caisse, caisses);
  const maintenant = new Date().toISOString();
  const parNom = opts.parNom?.trim() || identiteCourante().nom;
  const charges: Expense[] = [];
  const missions = nees.map((n) => {
    if (!n.payeeLeJourMeme || n.mission.amountXof <= 0) return n.mission;
    const charge = chargeDeLaMission(n.mission, n.prestataire.name, caissePayee, maintenant.slice(0, 10));
    charges.push(charge);
    return { ...n.mission, paidAt: maintenant, byName: parNom, method: 'Caisse', expenseId: charge.id };
  });
  missionsStore.set((prev) => [...prev, ...missions]);
  if (charges.length > 0) {
    const ids = new Set(charges.map((c) => c.id));
    expensesStore.set((prev) => [...charges, ...prev.filter((e) => !ids.has(e.id))]);
    expenseCategoriesStore.set((prev) => (prev.some((c) => c.name === CHARGE_CATEGORY) ? prev : [...prev, { id: ID_CATEGORIE_CHARGE, name: CHARGE_CATEGORY, subs: [] }]));
  }
  const payee = charges.length > 0 ? caissePayee : undefined;
  return { nees, ...(payee ? { caissePayee: payee } : {}), dit: ditLesMissionsNees(nees, payee) };
}

/** Dés-honorer retire les missions nées de ce rituel qui ne sont pas payées.
    Rend combien sont parties. */
export function retireLesMissionsDuRituel(rdvId: string): number {
  const aRetirer = missionsARetirerAuDeshonneur(rdvId, missionsStore.get());
  if (aRetirer.length === 0) return 0;
  const ids = new Set(aRetirer.map((m) => m.id));
  missionsStore.set((prev) => prev.filter((m) => !ids.has(m.id)));
  return aRetirer.length;
}
