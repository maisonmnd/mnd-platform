/* LES CAISSES AU NOM DES PAIEMENTS, APPLIQUÉ — 21 octobre 2026.
   La règle vit dans `shared/caisses-au-nom-pur.ts` ; ici, les magasins
   qu'elle touche : les caisses, les transferts, et les treize sortes
   d'écritures de la bascule (renommées comme au tri). Le geste ne part
   jamais seul : la direction le lance après la sauvegarde, et il se défait
   d'un geste, le tri du 19 octobre compris s'il est passé avec lui. */
import { cashboxesStore, transfertsStore } from '../../../../shared/finance';
import { CAISSES_DES_PAIEMENTS, casesQuiNomment, caissesDesCaissiers, caisseNeuveDuPaiement, laCaisseDuPaiement, poseLaCaisse, type FamilleDeCaisse } from '../../../../shared/caisses-des-caissiers-pur';
import {
  anciensNomsDuGeste, caissesApresDefaireLeNom, caissesApresLeNom, caissesApresLesCaissiers, idDuVirementAuNom,
  leNomEstFait, leTriEstPasseAvecLeNom, nomsDejaPrisAuNom, renommagesADefaireAuNom, renommagesAuNom, virementsDesCaissiers,
} from '../../../../shared/caisses-au-nom-pur';
import { leTriEstFait, lesCaissesDuPlan } from '../../../../shared/tri-des-caisses-pur';
import { lisLesLots } from './bascule';
import { appliqueLeTri, defaisLeTri, renommeLesEcritures, resteDuTri } from './tri';

export type ResultatDuNom = { ok: true; fait: string[] } | { ok: false; raison: string };

/** Le tri du 19 octobre attend-il encore dans cette branche ? */
export const leTriAttend = (branchId: string): boolean => {
  const boxes = cashboxesStore.get();
  return !leTriEstFait(boxes, branchId) && lesCaissesDuPlan(boxes, branchId).trouvees.size > 0;
};

/** Les caisses qui naissent à leur nom (Carte, MoMo Privé, Autres), si elles
    manquent encore. */
const NEES: readonly FamilleDeCaisse[] = ['carte', 'momoPrive', 'autre'];

/** LE GESTE. `soldeDe` : le solde d'une caisse tel que Les caisses le
    montre ; `jour` : le jour local des virements. */
export function appliqueLeNom(
  branchId: string, soldeDe: (nom: string) => number, jour: string, maintenant = new Date().toISOString(),
): ResultatDuNom {
  if (leNomEstFait(cashboxesStore.get(), branchId)) return { ok: false, raison: 'Les caisses portent déjà le nom des paiements dans cette branche.' };
  const fait: string[] = [];

  /* ① Le tri du 19 octobre, s'il attend encore : il passe d'abord. */
  let triAussi = false;
  if (leTriAttend(branchId)) {
    const r = appliqueLeTri(branchId, soldeDe, jour, maintenant);
    if (!r.ok) return { ok: false, raison: `Le tri du 19 octobre 2026 n’a pas pu passer : ${r.raison}` };
    triAussi = true;
    fait.push(`le tri du 19 octobre 2026 (${r.fait.join(', ') || 'rien à virer'})`);
  }

  /* Les noms pris se lisent AVANT tout geste à nous ; refusés, le tri passé
     dans ce geste se défait aussitôt. */
  const apresTri = cashboxesStore.get();
  const renommages = renommagesAuNom(apresTri, branchId);
  const pris = nomsDejaPrisAuNom(apresTri, lisLesLots(branchId), branchId, renommages);
  if (pris.length) {
    if (triAussi) defaisLeTri(branchId);
    return { ok: false, raison: `« ${pris.join(' », « ')} » existe déjà : renommez d’abord cette caisse, le geste ne renomme jamais vers un nom pris.` };
  }

  /* ② Les caisses des caissiers se vident dans le tiroir, puis se rangent. */
  const virements = virementsDesCaissiers(apresTri, branchId, soldeDe, jour);
  if (virements.length) {
    transfertsStore.set((prev) => [...prev, ...virements.filter((v) => !prev.some((t) => t.id === v.id))]);
    fait.push(`${virements.length} virement${virements.length > 1 ? 's' : ''} vers les espèces`);
  }
  const caissiers = caissesDesCaissiers(apresTri, branchId).length;
  cashboxesStore.set((prev) => caissesApresLesCaissiers(prev, branchId, maintenant));
  if (caissiers) fait.push(`${caissiers} caisse${caissiers > 1 ? 's' : ''} de caissier rangée${caissiers > 1 ? 's' : ''}`);

  /* ③ Les renommages : les caisses, puis les écritures suivent les noms. */
  cashboxesStore.set((prev) => caissesApresLeNom(prev, branchId, renommages, maintenant, triAussi));
  for (const r of renommages) renommeLesEcritures(branchId, r.de, r.vers);
  if (renommages.length) fait.push(`${renommages.length} renommée${renommages.length > 1 ? 's' : ''}`);

  /* ④ Les caisses qui manquent naissent à leur nom. */
  const nees: string[] = [];
  for (const f of NEES) {
    if (laCaisseDuPaiement(cashboxesStore.get(), branchId, f)) continue;
    const neuve = caisseNeuveDuPaiement(f, branchId);
    cashboxesStore.set((prev) => poseLaCaisse(prev, neuve));
    nees.push(CAISSES_DES_PAIEMENTS[f].nom);
  }
  if (nees.length) fait.push(`née${nees.length > 1 ? 's' : ''} : « ${nees.join(' », « ')} »`);
  return { ok: true, fait };
}

/** LE RETOUR, dans l'ordre inverse : les noms (écritures puis caisses), les
    virements des caissiers et leurs caisses, puis le tri s'il était passé
    avec le geste. Les caisses nées restent (vides, elles ne gênent rien). */
export function defaisLeNom(branchId: string): void {
  const boxes = cashboxesStore.get();
  const triAussi = leTriEstPasseAvecLeNom(boxes, branchId);
  for (const r of renommagesADefaireAuNom(boxes, branchId)) renommeLesEcritures(branchId, r.de, r.vers);
  const ids = new Set(boxes.filter((b) => b.branchId === branchId && !!b.rangeeAuNom).map((b) => idDuVirementAuNom(b.id)));
  transfertsStore.set((prev) => prev.filter((t) => !ids.has(t.id)));
  cashboxesStore.set((prev) => caissesApresDefaireLeNom(prev, branchId));
  if (triAussi) defaisLeTri(branchId);
}

/** CE QUI NOMME ENCORE UN NOM D'AVANT (0 : le geste est complet), le tri
    compris s'il est passé avec lui. */
export function resteDuNom(branchId: string): number {
  const boxes = cashboxesStore.get();
  const lots = lisLesLots(branchId);
  const n = anciensNomsDuGeste(boxes, branchId).reduce((s, nom) => s + casesQuiNomment(lots, nom), 0);
  return n + (leTriEstPasseAvecLeNom(boxes, branchId) ? resteDuTri(branchId) : 0);
}
