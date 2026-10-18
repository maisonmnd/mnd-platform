/* LES DÉCISIONS DU 17 OCTOBRE 2026 SUR LES CAISSES QUI EXISTAIENT DÉJÀ.
   Elles nomment SES caisses (BIIC, Caisse Indépendantes, Reprise 2025) :
   elles vivent ici, à part de la règle générale des caissiers, qui n'écrit
   jamais un nom ni une année en dur. Éprouvées par
   `scripts/verifie-caisses-des-caissiers`. */
import type { Cashbox } from './finance';
import { CAISSE_ANNEES_PASSEES, caisseDesCheques } from './caisses-des-caissiers-pur';

/* ══ LES DÉCISIONS DU 17 OCTOBRE SUR LES AUTRES CAISSES ═════════════════
   « Que fait-on des autres caisses ? Caisses indépendantes, BIIC… » (Yéman),
   puis ses réponses au sélecteur :
     · BIIC : « un compte à part » : elle vit, mais ne se propose jamais à
       l'encaissement (`horsEncaissement`) ;
     · Caisse Indépendantes : « remplacée par les caisses des caissiers » :
       elle garde son passé, ne reçoit plus d'encaissement, et quitte
       l'équipe dès qu'une autre caisse lui est ouverte (sinon la règle de
       l'équipe, qui échoue ouvert, montrerait TOUTES les caisses) ;
     · la caisse des années passées garde tout son passé (`histoire`).
   Chaque décision s'applique UNE fois (marqueurs) : décochée ensuite à la
   main, elle ne revient pas. Rend la liste changée, ou `null`. */
export const EST_BIIC = /^\s*biic\b/i;
export const EST_INDEPENDANTES = /^\s*caisses?\s+ind[ée]pendantes?\s*$/i;
export function decisionsDesCaisses<B extends Cashbox>(boxes: readonly B[], aujourdhui: string): B[] | null {
  let change = false;
  const ouverteAilleurs = (b: B) => boxes.some((x) => x.id !== b.id && x.branchId === b.branchId && x.equipe === true && !x.archiveeLe);
  const out = boxes.map((b) => {
    if (b.archiveeLe) return b;
    let n: B = b;
    if (n.name === CAISSE_ANNEES_PASSEES && !n.histoire) n = { ...n, histoire: true };
    if (EST_BIIC.test(n.name) && n.horsEncaissement === undefined) n = { ...n, horsEncaissement: true };
    if (EST_INDEPENDANTES.test(n.name)) {
      if (!n.remplaceeLe) n = { ...n, remplaceeLe: aujourdhui, horsEncaissement: true };
      if (n.equipe && !n.equipeRetireeLe && ouverteAilleurs(n)) n = { ...n, equipe: undefined, equipeRetireeLe: aujourdhui };
    }
    if (n !== b) change = true;
    return n;
  });
  /* LA CAISSE DES CHÈQUES À DÉPOSER (18 octobre 2026) : une par branche qui
     a des caisses, née une fois. Rangée ensuite à la main, elle ne revient
     pas : on la cherche parmi TOUTES les caisses, rangées comprises. */
  const branches = [...new Set(boxes.map((b) => b.branchId).filter((x): x is string => !!x))];
  for (const br of branches) {
    const neuve = caisseDesCheques(br);
    if (boxes.some((b) => b.id === neuve.id)) continue;
    out.push(neuve as B);
    change = true;
  }
  return change ? out : null;
}

/** Sa décision du 17 octobre : « Reprise 2025 » se fond dans les années passées. */
export const FUSION_DECIDEE = { de: /^\s*reprise\s*2025\s*$/i, vers: CAISSE_ANNEES_PASSEES } as const;
