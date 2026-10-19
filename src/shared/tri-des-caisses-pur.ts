/* ══ LE TRI DES CAISSES — 19 octobre 2026 ═══════════════════════════════
   « Les caisses n'ont plus de sens au niveau des RDV, comment on fait ? »
   puis « que faisons-nous de toutes ces caisses ? » (Yéman). Page de tri
   validée (« Tout me va », puis « construis »), ses choix lus en base
   (tri/choix) :
     · le comptoir : le tiroir commun des espèces (ex-Real Money), le compte
       MoMoPay (ex-ACIA1), KkiaPay, le tiroir des euros, MND PAY, les
       chèques à déposer ; les espèces vont à la caisse de qui encaisse ;
     · l'épargne, jamais au comptoir : la BIIC et les comptes d'épargne ou à
       l'étranger (ni la caissière ni le rendez-vous ne les voient) ;
     · les noms que l'équipe lit : « Tiroir espèces », « MTN MoMoPay » ;
     · « Caisse Principale » se fond dans le tiroir (sélecteur : « La fondre
       dans le tiroir ») ; et « transfert MND new et caisses indépendantes
       dans caisse principale » : leurs soldes y passent, puis elles sont
       rangées ;
     · la carte et le virement : « on choisit à chaque fois » ;
     · corriger la caisse d'un versement : le comptoir seulement.

   LES CAISSES SE RECONNAISSENT À LEUR IDENTIFIANT, jamais à leur nom : les
   noms changent ici même, et le dépôt est public (aucun nom de compte
   d'épargne n'y est écrit). Une caisse introuvable : son pas est sauté, et
   l'écran le dit.

   UN RENOMMAGE EST UNE BIJECTION. Chaque case qui nomme l'ancien nom prend
   le nouveau, sans note ; le retour fait le chemin inverse, écritures nées
   depuis comprises. Il est donc refusé si le nouveau nom est déjà porté par
   une caisse ou une écriture : le retour les confondrait.

   Tout se calcule ici, sans magasin ni React : `scripts/verifie-le-tri-des-
   caisses` le rejoue, sur les vrais magasins et pannes posées. */

import type { Cashbox, TransfertCaisse } from './finance';
import { reecritLEcriture, casesDe, type Sorte } from './bascule-des-caisses-pur';

export type RetoucheDuTri = {
  id: string;
  nom?: string;
  sub?: string;
  role?: Cashbox['role'];
  equipe?: boolean;
  horsEncaissement?: boolean;
};

export type PlanDuTri = {
  le: string;
  retouches: readonly RetoucheDuTri[];
  /** Les caisses dont le solde passe dans `vers`, puis qui sont rangées. */
  vider: { vers: string; de: readonly string[] };
  /** La caisse fondue (histoire et solde) dans une autre, après les retouches. */
  fondre: { de: string; vers: string };
};

/** SES CHOIX DU 19 OCTOBRE 2026, par identifiant de caisse. */
export const TRI_DU_19_OCTOBRE: PlanDuTri = {
  le: '2026-10-19',
  retouches: [
    { id: 'ytb0sweqjt', nom: 'Tiroir espèces', sub: 'Espèces du comptoir', role: 'terrasse', equipe: true },
    { id: '2b0gyen3wq', nom: 'MTN MoMoPay', sub: 'MoMoPay · code 506846', role: 'terrasse' },
    /* L'épargne et les comptes à l'étranger : jamais au comptoir. */
    { id: 'b8rgpuq4zm', horsEncaissement: true },
    { id: 'dkg7qprz84', horsEncaissement: true },
    { id: 'n0mgl8d1vz', horsEncaissement: true },
    { id: 'hhcoqafioq', horsEncaissement: true },
    { id: 'bvgh5pun9g', horsEncaissement: true },
    { id: 'n0y0j52n73', horsEncaissement: true },
    { id: 'kns3vlxy3c', horsEncaissement: true },
  ],
  vider: { vers: 'uhhu3j8pbz', de: ['3gecxx1oyf', 'dz2b3w0bye'] },
  fondre: { de: 'uhhu3j8pbz', vers: 'ytb0sweqjt' },
};

/** Ce qu'une caisse était avant le tri : de quoi la rendre telle quelle. */
export type AvantLeTri = {
  le: string;
  name: string;
  sub: string;
  role?: Cashbox['role'];
  equipe?: boolean;
  horsEncaissement?: boolean;
};

export const idDuVirementDuTri = (caisseId: string): string => `trf-tri-${caisseId}`;

type Boite = Cashbox & { avantLeTri?: AvantLeTri; rangeeAuTri?: string };

/** Les caisses du plan présentes dans la branche (vivantes) et celles qui manquent. */
export function lesCaissesDuPlan<B extends Boite>(boxes: readonly B[], branchId: string, plan: PlanDuTri = TRI_DU_19_OCTOBRE): {
  trouvees: Map<string, B>; manquent: string[];
} {
  const ids = [...new Set([...plan.retouches.map((r) => r.id), plan.vider.vers, ...plan.vider.de, plan.fondre.de, plan.fondre.vers])];
  const trouvees = new Map<string, B>();
  const manquent: string[] = [];
  for (const id of ids) {
    const b = boxes.find((x) => x.id === id && x.branchId === branchId && !x.archiveeLe);
    if (b) trouvees.set(id, b); else manquent.push(id);
  }
  return { trouvees, manquent };
}

/** Le tri est-il fait dans cette branche ? Une caisse retouchée le porte. */
export const leTriEstFait = (boxes: readonly Boite[], branchId: string, plan: PlanDuTri = TRI_DU_19_OCTOBRE): boolean =>
  boxes.some((b) => b.branchId === branchId && b.avantLeTri?.le === plan.le);

/** LES RENOMMAGES du plan, ancien nom → nouveau, pour les caisses trouvées. */
export function renommagesDuPlan(boxes: readonly Boite[], branchId: string, plan: PlanDuTri = TRI_DU_19_OCTOBRE): { de: string; vers: string }[] {
  const { trouvees } = lesCaissesDuPlan(boxes, branchId, plan);
  return plan.retouches
    .filter((r) => r.nom && trouvees.has(r.id) && trouvees.get(r.id)!.name !== r.nom)
    .map((r) => ({ de: trouvees.get(r.id)!.name, vers: r.nom! }));
}

/** LES NOMS DÉJÀ PRIS : un renommage vers un nom qu'une caisse (même rangée)
    ou une écriture porte déjà est refusé. */
export function nomsDejaPris(
  boxes: readonly Boite[], lots: Partial<Record<Sorte, readonly unknown[]>>, branchId: string, plan: PlanDuTri = TRI_DU_19_OCTOBRE,
): string[] {
  const pris: string[] = [];
  for (const { vers } of renommagesDuPlan(boxes, branchId, plan)) {
    const parUneCaisse = boxes.some((b) => b.branchId === branchId && b.name === vers);
    let parUneEcriture = false;
    for (const [sorte, liste] of Object.entries(lots) as [Sorte, readonly unknown[]][]) {
      if ((liste ?? []).some((e) => casesDe(sorte, e).some((c) => c.nom === vers))) { parUneEcriture = true; break; }
    }
    if (parUneCaisse || parUneEcriture) pris.push(vers);
  }
  return pris;
}

/** Une écriture renommée : chaque case qui porte `de` prend `vers`, sans note. */
export const renommeLEcriture = <T>(sorte: Sorte, e: T, de: string, vers: string): T =>
  reecritLEcriture(sorte, e, (nom) => (nom === de ? vers : undefined), null);

/** LES CAISSES RETOUCHÉES : nom, sous-titre, rôle, équipe, comptoir ; chacune
    garde ce qu'elle était (`avantLeTri`). */
export function caissesApresLesRetouches<B extends Boite>(boxes: readonly B[], branchId: string, plan: PlanDuTri = TRI_DU_19_OCTOBRE): B[] {
  const parId = new Map(plan.retouches.map((r) => [r.id, r]));
  return boxes.map((b) => {
    const r = parId.get(b.id);
    if (!r || b.branchId !== branchId || b.archiveeLe || b.avantLeTri) return b;
    const avant: AvantLeTri = {
      le: plan.le, name: b.name, sub: b.sub,
      ...(b.role !== undefined ? { role: b.role } : {}),
      ...(b.equipe !== undefined ? { equipe: b.equipe } : {}),
      ...(b.horsEncaissement !== undefined ? { horsEncaissement: b.horsEncaissement } : {}),
    };
    return {
      ...b,
      ...(r.nom ? { name: r.nom } : {}),
      ...(r.sub ? { sub: r.sub } : {}),
      ...(r.role ? { role: r.role } : {}),
      ...(r.equipe !== undefined ? { equipe: r.equipe } : {}),
      ...(r.horsEncaissement !== undefined ? { horsEncaissement: r.horsEncaissement } : {}),
      avantLeTri: avant,
    };
  });
}

/** LES VIREMENTS QUI VIDENT : pour chaque caisse à vider, le transfert qui
    ramène son solde à zéro (de la caisse vers `vers` si elle tient de
    l'argent, l'inverse si elle est à découvert). Rien pour un solde nul. */
export function virementsDuTri(
  boxes: readonly Boite[], branchId: string, soldeDe: (nom: string) => number, jour: string, plan: PlanDuTri = TRI_DU_19_OCTOBRE,
): TransfertCaisse[] {
  const { trouvees } = lesCaissesDuPlan(boxes, branchId, plan);
  const vers = trouvees.get(plan.vider.vers);
  if (!vers) return [];
  const out: TransfertCaisse[] = [];
  for (const id of plan.vider.de) {
    const b = trouvees.get(id);
    if (!b || (b.currency ?? '') !== (vers.currency ?? '')) continue;
    const solde = Math.round(soldeDe(b.name));
    if (!solde) continue;
    out.push({
      id: idDuVirementDuTri(b.id), branchId, date: jour,
      de: solde > 0 ? b.name : vers.name,
      vers: solde > 0 ? vers.name : b.name,
      amountXof: Math.abs(solde),
      note: `Tri des caisses : le solde de « ${b.name} » passe dans « ${vers.name} », puis elle est rangée`,
    });
  }
  return out;
}

/** Les caisses vidées sont rangées ; elles disent quand. */
export function caissesApresLesVirements<B extends Boite>(boxes: readonly B[], branchId: string, le: string, plan: PlanDuTri = TRI_DU_19_OCTOBRE): B[] {
  const ids = new Set(plan.vider.de);
  return boxes.map((b) => (ids.has(b.id) && b.branchId === branchId && !b.archiveeLe ? { ...b, archiveeLe: le, rangeeAuTri: le } : b));
}

/** LE RETOUR DES CAISSES : chaque retouchée reprend ce qu'elle était, chaque
    rangée par le tri revient. Les écritures, elles, se renomment à part. */
export function caissesApresDefaireLeTri<B extends Boite>(boxes: readonly B[], branchId: string, plan: PlanDuTri = TRI_DU_19_OCTOBRE): B[] {
  return boxes.map((b) => {
    if (b.branchId !== branchId) return b;
    let n: B = b;
    if (n.rangeeAuTri && plan.vider.de.includes(n.id)) {
      const { rangeeAuTri: _r, archiveeLe: _a, ...reste } = n;
      n = reste as B;
    }
    if (n.avantLeTri?.le === plan.le) {
      const a = n.avantLeTri;
      const { avantLeTri: _t, role: _ro, equipe: _e, horsEncaissement: _h, ...reste } = n;
      n = {
        ...reste, name: a.name, sub: a.sub,
        ...(a.role !== undefined ? { role: a.role } : {}),
        ...(a.equipe !== undefined ? { equipe: a.equipe } : {}),
        ...(a.horsEncaissement !== undefined ? { horsEncaissement: a.horsEncaissement } : {}),
      } as B;
    }
    return n;
  });
}

/** Les renommages à défaire : nouveau nom → ancien, lus sur les caisses. */
export const renommagesADefaire = (boxes: readonly Boite[], branchId: string, plan: PlanDuTri = TRI_DU_19_OCTOBRE): { de: string; vers: string }[] =>
  boxes
    .filter((b) => b.branchId === branchId && b.avantLeTri?.le === plan.le && b.avantLeTri.name !== b.name)
    .map((b) => ({ de: b.name, vers: b.avantLeTri!.name }));

/** CORRIGER LA CAISSE D'UN VERSEMENT DÉJÀ REÇU (sa règle 4) : le comptoir
    seulement, jamais l'épargne ; la caisse qu'il porte reste dans la liste. */
export const caissesPourCorriger = <B extends Pick<Cashbox, 'name' | 'horsEncaissement' | 'archiveeLe'>>(boxes: readonly B[], garder?: string): B[] =>
  boxes.filter((b) => b.name === garder || (!b.archiveeLe && !b.horsEncaissement));
