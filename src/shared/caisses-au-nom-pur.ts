/* ══ LES CAISSES AU NOM DES PAIEMENTS — 21 octobre 2026 ═════════════════
   « Les caisses doivent porter les mêmes noms que les paiements » (Yéman),
   puis au sélecteur : « Les renommer », leur solde et tout leur historique
   suivant le nouveau nom, le geste défaisable, avec une sauvegarde avant ;
   et « une seule Espèces » : les caisses des caissiers du 17 octobre se
   vident dans « Espèces » puis se rangent.

   Ce que le geste fait, dans l'ordre (l'écran le dit avant) :
     ① le tri du 19 octobre, s'il n'a pas été appliqué (elle ne savait plus) :
        il passe d'abord, dans le même geste, et se défait avec lui ;
     ② les caisses des caissiers : leur solde passe dans le tiroir des
        espèces (un virement chacune), puis elles sont rangées ;
     ③ les renommages : le tiroir devient « Espèces », « MoMoPay Maison MND »
        devient « MTN MoMoPay », « Chèques à déposer » devient « Chèque » ;
        chaque écriture qui nommait l'ancien nom prend le nouveau.

   LES CAISSES SE RECONNAISSENT À LEUR IDENTIFIANT (`laCaisseDuPaiement`),
   jamais à un nom écrit en dur dans le dépôt public. UN RENOMMAGE EST UNE
   BIJECTION, comme au tri : refusé si le nom nouveau est déjà porté par une
   autre caisse ou par une écriture, sinon le retour confondrait les deux.

   Tout se calcule ici, sans magasin ni React : `scripts/verifie-les-caisses-
   au-nom` le rejoue, pannes posées. */

import type { Cashbox, TransfertCaisse } from './finance';
import { casesDe, type Sorte } from './bascule-des-caisses-pur';
import { CAISSES_DES_PAIEMENTS, caissesDesCaissiers, laCaisseDuPaiement, type FamilleDeCaisse } from './caisses-des-caissiers-pur';

/** Le jour du geste, pour les marques des caisses. */
export const LE_NOM_DU_21_OCTOBRE = '2026-10-21';

/** Les caisses qui changent de nom, dans cet ordre. MoMo Privé, Carte et
    Autres n'existaient pas : elles naissent à leur nom. */
const RENOMMEES: readonly FamilleDeCaisse[] = ['especes', 'momo', 'cheque'];

export type RenommageAuNom = { id: string; famille: FamilleDeCaisse; de: string; vers: string };

/** LES RENOMMAGES de la branche, lus sur ses caisses d'aujourd'hui. */
export function renommagesAuNom(boxes: readonly Cashbox[], branchId: string): RenommageAuNom[] {
  const out: RenommageAuNom[] = [];
  for (const famille of RENOMMEES) {
    const b = laCaisseDuPaiement(boxes, branchId, famille);
    const vers = CAISSES_DES_PAIEMENTS[famille].nom;
    if (b && b.name !== vers) out.push({ id: b.id, famille, de: b.name, vers });
  }
  return out;
}

/** LES NOMS DÉJÀ PRIS : une autre caisse (même rangée) ou une écriture porte
    déjà le nom nouveau. */
export function nomsDejaPrisAuNom(
  boxes: readonly Cashbox[], lots: Partial<Record<Sorte, readonly unknown[]>>, branchId: string,
  renommages: readonly RenommageAuNom[] = renommagesAuNom(boxes, branchId),
): string[] {
  const pris: string[] = [];
  for (const r of renommages) {
    const parUneCaisse = boxes.some((b) => b.branchId === branchId && b.id !== r.id && b.name === r.vers);
    let parUneEcriture = false;
    for (const [sorte, liste] of Object.entries(lots) as [Sorte, readonly unknown[]][]) {
      if ((liste ?? []).some((e) => casesDe(sorte, e).some((c) => c.nom === r.vers))) { parUneEcriture = true; break; }
    }
    if (parUneCaisse || parUneEcriture) pris.push(r.vers);
  }
  return pris;
}

/** Le geste est-il fait dans la branche ? Une caisse renommée le porte, ou
    une caisse de caissier rangée par lui. */
export const leNomEstFait = (boxes: readonly Cashbox[], branchId: string): boolean =>
  boxes.some((b) => b.branchId === branchId && (!!b.avantLeNom || !!b.rangeeAuNom));

/** Rien à faire : aucune caisse à renommer, aucune caisse de caissier. */
export const rienAFaireAuNom = (boxes: readonly Cashbox[], branchId: string): boolean =>
  renommagesAuNom(boxes, branchId).length === 0 && caissesDesCaissiers(boxes, branchId).length === 0;

export const idDuVirementAuNom = (caisseId: string): string => `trf-nom-${caisseId}`;

/** LES VIREMENTS QUI VIDENT LES CAISSES DES CAISSIERS dans le tiroir des
    espèces (sous son nom du moment) : un par caisse, qui ramène son solde à
    zéro dans un sens ou dans l'autre. Rien pour un solde nul, ni pour une
    caisse dans une autre devise. */
export function virementsDesCaissiers(
  boxes: readonly Cashbox[], branchId: string, soldeDe: (nom: string) => number, jour: string,
): TransfertCaisse[] {
  const tiroir = laCaisseDuPaiement(boxes, branchId, 'especes');
  if (!tiroir) return [];
  const out: TransfertCaisse[] = [];
  for (const b of caissesDesCaissiers(boxes, branchId)) {
    if ((b.currency ?? '') !== (tiroir.currency ?? '')) continue;
    const solde = Math.round(soldeDe(b.name));
    if (!solde) continue;
    out.push({
      id: idDuVirementAuNom(b.id), branchId, date: jour,
      de: solde > 0 ? b.name : tiroir.name,
      vers: solde > 0 ? tiroir.name : b.name,
      amountXof: Math.abs(solde),
      note: `Une seule caisse des espèces : le solde de « ${b.name} » passe dans « ${tiroir.name} », puis elle est rangée`,
    });
  }
  return out;
}

/** Les caisses des caissiers sont rangées ; elles disent quand. Un caissier
    dans une autre devise garde la sienne (un billet étranger garde son tiroir). */
export function caissesApresLesCaissiers<B extends Cashbox>(boxes: readonly B[], branchId: string, le: string): B[] {
  const tiroir = laCaisseDuPaiement(boxes, branchId, 'especes');
  return boxes.map((b) => (b.branchId === branchId && !b.archiveeLe && !!b.caissierId
    && (b.currency ?? '') === (tiroir?.currency ?? '')
    ? { ...b, archiveeLe: le, rangeeAuNom: le } : b));
}

/** LES CAISSES RENOMMÉES : nom et sous-titre du paiement ; chacune garde ce
    qu'elle était (`avantLeNom`). */
export function caissesApresLeNom<B extends Cashbox>(
  boxes: readonly B[], branchId: string, renommages: readonly RenommageAuNom[], le: string, triAussi: boolean,
): B[] {
  const parId = new Map(renommages.map((r) => [r.id, r]));
  return boxes.map((b) => {
    const r = parId.get(b.id);
    if (!r || b.branchId !== branchId || b.avantLeNom) return b;
    return {
      ...b,
      name: r.vers,
      sub: CAISSES_DES_PAIEMENTS[r.famille].sub,
      avantLeNom: { le, name: b.name, sub: b.sub, ...(triAussi ? { triAussi: true } : {}) },
    };
  });
}

/** Les renommages à défaire : nom d'aujourd'hui → nom d'avant. */
export const renommagesADefaireAuNom = (boxes: readonly Cashbox[], branchId: string): { de: string; vers: string }[] =>
  boxes
    .filter((b) => b.branchId === branchId && !!b.avantLeNom && b.avantLeNom.name !== b.name)
    .map((b) => ({ de: b.name, vers: b.avantLeNom!.name }));

/** Le tri du 19 octobre est-il passé dans ce geste ? Il se défait alors avec lui. */
export const leTriEstPasseAvecLeNom = (boxes: readonly Cashbox[], branchId: string): boolean =>
  boxes.some((b) => b.branchId === branchId && !!b.avantLeNom?.triAussi);

/** LE RETOUR DES CAISSES : chaque renommée reprend son nom d'avant, chaque
    caisse de caissier rangée par le geste revient. */
export function caissesApresDefaireLeNom<B extends Cashbox>(boxes: readonly B[], branchId: string): B[] {
  return boxes.map((b) => {
    if (b.branchId !== branchId) return b;
    let n: B = b;
    if (n.rangeeAuNom) {
      const { rangeeAuNom: _r, archiveeLe: _a, ...reste } = n;
      n = reste as B;
    }
    if (n.avantLeNom) {
      const a = n.avantLeNom;
      const { avantLeNom: _n, ...reste } = n;
      n = { ...reste, name: a.name, sub: a.sub } as B;
    }
    return n;
  });
}

/** Les noms d'avant encore portés par une caisse renommée : ce que la
    vérification relit (0 écriture ne doit plus les nommer). */
export const anciensNomsDuGeste = (boxes: readonly Cashbox[], branchId: string): string[] =>
  boxes.filter((b) => b.branchId === branchId && !!b.avantLeNom && b.avantLeNom.name !== b.name).map((b) => b.avantLeNom!.name);
