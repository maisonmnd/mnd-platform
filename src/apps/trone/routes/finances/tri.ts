/* LE TRI DES CAISSES, APPLIQUÉ — 19 octobre 2026.
   La règle vit dans `shared/tri-des-caisses-pur.ts` ; ici, les magasins
   qu'elle touche : les caisses, les transferts, et les treize sortes
   d'écritures de la bascule (chacune par sa propre synchronisation). Le tri
   ne part jamais seul : la direction le lance après la sauvegarde, et il se
   défait d'un geste. La fusion de « Reprise 2025 » (décidée le 17 octobre)
   part avec lui, mais garde son propre retour (le panneau de la fusion). */
import { cashboxesStore, transfertsStore } from '../../../../shared/finance';
import { casesQuiNomment } from '../../../../shared/caisses-des-caissiers-pur';
import { FUSION_DECIDEE } from '../../../../shared/decisions-des-caisses-pur';
import {
  TRI_DU_19_OCTOBRE, caissesApresDefaireLeTri, caissesApresLesRetouches, caissesApresLesVirements, idDuVirementDuTri,
  leTriEstFait, lesCaissesDuPlan, nomsDejaPris, renommagesADefaire, renommagesDuPlan, renommeLEcriture, virementsDuTri,
  type PlanDuTri,
} from '../../../../shared/tri-des-caisses-pur';
import { LOTS, deLaBranche, lisLesLots } from './bascule';
import { defaisLaFusion, fondsLaCaisse } from './fusion';

/** Chaque case de la branche qui nomme `de` prend `vers`. */
export function renommeLesEcritures(branchId: string, de: string, vers: string): void {
  const garde = deLaBranche(branchId);
  for (const l of LOTS) l.store.set((prev) => prev.map((r) => (garde(r) ? renommeLEcriture(l.sorte, r, de, vers) : r)));
}

export type ResultatDuTri = { ok: true; fait: string[] } | { ok: false; raison: string };

/** LE TRI. `soldeDe` : le solde d'une caisse tel que Les caisses le montre ;
    `jour` : le jour local des virements. */
export function appliqueLeTri(
  branchId: string, soldeDe: (nom: string) => number, jour: string,
  maintenant = new Date().toISOString(), plan: PlanDuTri = TRI_DU_19_OCTOBRE,
): ResultatDuTri {
  const avant = cashboxesStore.get();
  if (leTriEstFait(avant, branchId, plan)) return { ok: false, raison: 'Le tri est déjà fait dans cette branche.' };
  const pris = nomsDejaPris(avant, lisLesLots(branchId), branchId, plan);
  if (pris.length) return { ok: false, raison: `« ${pris.join(' », « ')} » existe déjà : le tri ne renomme jamais vers un nom pris.` };
  const { trouvees } = lesCaissesDuPlan(avant, branchId, plan);
  const fait: string[] = [];

  /* ① Les soldes à vider passent dans la caisse qui les reçoit, puis ② ces
     caisses sont rangées (lus sous leurs noms d'avant : aucune n'est renommée). */
  const virements = virementsDuTri(avant, branchId, soldeDe, jour, plan);
  if (virements.length) {
    transfertsStore.set((prev) => [...prev, ...virements.filter((v) => !prev.some((t) => t.id === v.id))]);
    fait.push(`${virements.length} virement${virements.length > 1 ? 's' : ''}`);
  }
  cashboxesStore.set((prev) => caissesApresLesVirements(prev, branchId, maintenant, plan));

  /* ③ Les retouches : noms, rôles, comptoir ; puis les écritures suivent les noms. */
  const renommages = renommagesDuPlan(avant, branchId, plan);
  cashboxesStore.set((prev) => caissesApresLesRetouches(prev, branchId, plan));
  for (const r of renommages) renommeLesEcritures(branchId, r.de, r.vers);
  if (renommages.length) fait.push(`${renommages.length} renommée${renommages.length > 1 ? 's' : ''}`);

  /* ④ La caisse fondue passe dans le tiroir, sous son nouveau nom. */
  const fondue = trouvees.get(plan.fondre.de);
  const recoit = plan.retouches.find((r) => r.id === plan.fondre.vers)?.nom ?? trouvees.get(plan.fondre.vers)?.name;
  if (fondue && recoit && trouvees.has(plan.fondre.vers)) {
    fondsLaCaisse(branchId, fondue.name, recoit, maintenant);
    fait.push(`« ${fondue.name} » fondue`);
  }

  /* ⑤ La fusion décidée le 17 octobre, si elle attend encore. */
  const reprise = cashboxesStore.get().find((b) => b.branchId === branchId && !b.archiveeLe && FUSION_DECIDEE.de.test(b.name));
  if (reprise) {
    fondsLaCaisse(branchId, reprise.name, FUSION_DECIDEE.vers, maintenant);
    fait.push(`« ${reprise.name} » fondue dans « ${FUSION_DECIDEE.vers} »`);
  }
  return { ok: true, fait };
}

/** LE RETOUR, dans l'ordre inverse : la fusion du tiroir, les virements, les
    noms, puis les caisses. La fusion de « Reprise 2025 » reste (son panneau a
    son propre retour). */
export function defaisLeTri(branchId: string, plan: PlanDuTri = TRI_DU_19_OCTOBRE): void {
  const fondue = cashboxesStore.get().find((b) => b.id === plan.fondre.de && b.branchId === branchId && !!b.fondueDans);
  if (fondue) defaisLaFusion(branchId, fondue.name);
  const ids = new Set(plan.vider.de.map(idDuVirementDuTri));
  transfertsStore.set((prev) => prev.filter((t) => !ids.has(t.id)));
  for (const r of renommagesADefaire(cashboxesStore.get(), branchId, plan)) renommeLesEcritures(branchId, r.de, r.vers);
  cashboxesStore.set((prev) => caissesApresDefaireLeTri(prev, branchId, plan));
}

/** CE QUI NOMME ENCORE UNE CAISSE QUI A CHANGÉ (0 : le tri est complet) :
    les anciens noms des renommées, et la caisse fondue. */
export function resteDuTri(branchId: string, plan: PlanDuTri = TRI_DU_19_OCTOBRE): number {
  const boxes = cashboxesStore.get();
  const lots = lisLesLots(branchId);
  const anciens = boxes
    .filter((b) => b.branchId === branchId && b.avantLeTri?.le === plan.le && b.avantLeTri.name !== b.name)
    .map((b) => b.avantLeTri!.name);
  const fondue = boxes.find((b) => b.id === plan.fondre.de && b.branchId === branchId && !!b.fondueDans);
  return [...anciens, ...(fondue ? [fondue.name] : [])].reduce((n, nom) => n + casesQuiNomment(lots, nom), 0);
}
