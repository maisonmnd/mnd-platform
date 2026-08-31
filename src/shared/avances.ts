/* ── LES AVANCES DE L'ÉQUIPE — 31 août 2026 ──────────────────────────
   « J'ai un staff qui préfinance des dépenses personnelles pour moi et je le
   règle à la fin du mois. Aujourd'hui il enregistre les dépenses sur des bouts
   de papier et parfois il oublie les dates et invente des choses. » (Yéman)

   LA DIRECTION DE L'ARGENT EST TOUT LE SUJET. `Expense.porteur` existait déjà,
   mais il désigne celui qui a fait l'achat AVEC L'ARGENT QUE LA MAISON LUI A
   CONFIÉ : la caisse est vidée, personne ne doit rien à personne. Ici c'est
   l'inverse — il paie de sa poche, et c'est la Maison qui lui doit. Confondre
   les deux donne une caisse fausse dans un sens et une dette invisible dans
   l'autre.

   D'où un seul drapeau, `avancee`, sur la dépense comme sur le mouvement d'une
   caisse indépendante :

     · LA CHARGE EST LA MÊME. La Maison a consommé ces fournitures, qu'elle les
       ait payées le jour même ou non : la dépense compte au résultat du mois.
     · LA TRÉSORERIE, NON. Aucun tiroir ne bouge le jour de l'achat. Il bougera
       le jour du remboursement, et c'est un geste à part.

   LE SOLDE NE SE STOCKE PAS. Il se recalcule depuis les lignes et les
   remboursements. Un total posé à côté finit toujours par ne plus leur
   correspondre, et personne ne sait alors lequel croire. */

import { createStore, useStore, uid } from './store';
import { bindCollection } from './sync';
import type { Expense } from './finance';
import { expenseTotal } from './finance';
import type { MouvementCaisseIndep } from './foyer';

/** Ce que la Maison rend à quelqu'un qui a avancé. C'est CE JOUR-LÀ que le
    tiroir se vide — la dépense, elle, avait déjà compté au résultat. */
export type Remboursement = {
  id: string;
  branchId: string;
  /** Le nom du porteur, tel qu'il est écrit sur les dépenses. */
  porteur: string;
  date: string;
  amountXof: number;
  /** La caisse qui se vide. Sans elle, rendre l'argent ne le retire d'aucun
      tiroir, et les mêmes francs vivent à deux endroits. */
  cashbox?: string;
  method?: string;
  note?: string;
};

export const remboursementsStore = createStore<Remboursement[]>('mnd_avances_remboursements', []);
export const useRemboursements = () => useStore(remboursementsStore);
bindCollection(remboursementsStore, 'avances_remboursements');

/** Une ligne avancée, d'où qu'elle vienne — le salon ou le foyer. */
export type LigneAvance = {
  id: string;
  date: string;
  label: string;
  amountXof: number;
  porteur: string;
  /** D'où elle vient, pour que le relevé le dise. */
  source: 'depense' | 'foyer';
  categorie?: string;
};

const nom = (s: string | undefined): string => (s ?? '').trim();
const meme = (a: string, b: string): boolean => nom(a).toLowerCase() === nom(b).toLowerCase();

/** TOUTES LES LIGNES AVANCÉES d'une branche, les deux origines confondues.

    UNE AVANCE SANS PORTEUR N'EN EST PAS UNE : on ne peut rendre l'argent à
    personne. Elle est donc écartée plutôt que rangée sous un nom vide, qui
    ferait un dû que nul ne réclamerait. */
export function lignesAvancees(o: {
  expenses: readonly Expense[];
  mouvements?: readonly MouvementCaisseIndep[];
  branchId: string;
}): LigneAvance[] {
  const out: LigneAvance[] = [];
  for (const e of o.expenses) {
    if (e.branchId !== o.branchId || e.stopped) continue;
    if (!e.avancee || !nom(e.porteur)) continue;
    out.push({
      id: e.id,
      date: e.date,
      label: e.label,
      amountXof: expenseTotal(e),
      porteur: nom(e.porteur),
      source: 'depense',
      categorie: e.category,
    });
  }
  for (const m of o.mouvements ?? []) {
    if (m.branchId !== o.branchId) continue;
    /* SEULE UNE SORTIE PEUT ÊTRE AVANCÉE : on n'avance pas une entrée
       d'argent, on la reçoit. */
    if (m.sens !== 'sortie' || !m.avancee || !nom(m.porteur)) continue;
    out.push({
      id: m.id,
      date: m.date,
      label: m.label,
      /* LA CAISSE INDÉPENDANTE PEUT TENIR UNE AUTRE DEVISE. La dette de la
         Maison se dit en francs : on convertit au taux SAISI CE JOUR-LÀ, celui
         que le mouvement porte, jamais au taux du jour où l'on relit. */
      amountXof: Math.round(m.montant * (m.taux && m.taux > 0 ? m.taux : 1)),
      porteur: nom(m.porteur),
      source: 'foyer',
      categorie: m.motif,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** CE QUE LA MAISON DOIT À CHACUN. */
export type SoldeDunPorteur = {
  porteur: string;
  avanceXof: number;
  rembourseXof: number;
  resteXof: number;
  /** Combien de lignes avancées. */
  n: number;
  /** Le jour du dernier achat avancé. */
  dernier: string;
};

export function soldesDesPorteurs(
  lignes: readonly LigneAvance[],
  remboursements: readonly Remboursement[],
  branchId: string,
): SoldeDunPorteur[] {
  const par = new Map<string, SoldeDunPorteur>();
  const prend = (p: string): SoldeDunPorteur => {
    const cle = nom(p).toLowerCase();
    const deja = par.get(cle);
    if (deja) return deja;
    const neuf: SoldeDunPorteur = { porteur: nom(p), avanceXof: 0, rembourseXof: 0, resteXof: 0, n: 0, dernier: '' };
    par.set(cle, neuf);
    return neuf;
  };
  for (const l of lignes) {
    const s = prend(l.porteur);
    s.avanceXof += l.amountXof;
    s.n += 1;
    if (l.date > s.dernier) s.dernier = l.date;
  }
  for (const r of remboursements) {
    if (r.branchId !== branchId || !nom(r.porteur)) continue;
    /* UN REMBOURSEMENT À QUELQU'UN QUI N'A RIEN AVANCÉ crée quand même sa
       ligne : sinon l'argent sorti de la caisse ne se lirait nulle part, et un
       solde négatif est une information — on lui a rendu plus qu'il n'a
       avancé, et cela se voit. */
    prend(r.porteur).rembourseXof += r.amountXof;
  }
  const out = [...par.values()];
  for (const s of out) s.resteXof = s.avanceXof - s.rembourseXof;
  /* CE QU'ON DOIT ENCORE PASSE DEVANT : c'est ce qu'on vient chercher ici. */
  return out.sort((a, b) => b.resteXof - a.resteXof || a.porteur.localeCompare(b.porteur));
}

/** Le total que la Maison doit, tous porteurs confondus. Les soldes NÉGATIFS
    (on a trop rendu) ne se compensent pas avec les positifs : deux dettes de
    sens contraires ne s'annulent pas dans la vraie vie, on doit toujours à
    l'un et l'autre nous doit. */
export const totalDuXof = (soldes: readonly SoldeDunPorteur[]): number =>
  soldes.reduce((n, s) => n + Math.max(0, s.resteXof), 0);

/** Les lignes d'un porteur, la plus récente d'abord — le relevé. */
export const lignesDunPorteur = (lignes: readonly LigneAvance[], porteur: string): LigneAvance[] =>
  lignes.filter((l) => meme(l.porteur, porteur));

/** Ses remboursements, du plus récent au plus ancien. */
export const remboursementsDunPorteur = (
  remboursements: readonly Remboursement[], porteur: string, branchId: string,
): Remboursement[] => remboursements
  .filter((r) => r.branchId === branchId && meme(r.porteur, porteur))
  .sort((a, b) => b.date.localeCompare(a.date));

/** Inscrit un remboursement. Le montant est borné à zéro : rendre un montant
    négatif serait une dépense déguisée, et elle a son propre écran. */
export function rembourse(o: {
  branchId: string; porteur: string; date: string; amountXof: number;
  cashbox?: string; method?: string; note?: string;
}): Remboursement | null {
  const montant = Math.max(0, Math.round(o.amountXof));
  if (!nom(o.porteur) || montant <= 0) return null;
  const r: Remboursement = {
    id: `rb-${uid()}`,
    branchId: o.branchId,
    porteur: nom(o.porteur),
    date: o.date,
    amountXof: montant,
    ...(o.cashbox ? { cashbox: o.cashbox } : {}),
    ...(o.method ? { method: o.method } : {}),
    ...(o.note?.trim() ? { note: o.note.trim() } : {}),
  };
  remboursementsStore.set((prev) => [...prev, r]);
  return r;
}
