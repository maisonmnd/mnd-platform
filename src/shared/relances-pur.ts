/* ══ LES RELANCES D'UNE FACTURE À RÉGLER — 18 octobre 2026 ══════════════
   « Comment je fais des messages de relance tant que la cliente n'a pas
   payé ? » (Yéman). Maquette « Les relances » (public/maquette-les-
   relances.html), validée le 18 octobre 2026, ses choix lus en base
   `maquette/relances` :
     · cadence J+1, J+3, J+7, J+14 (quatre relances), à 10 h ;
     · toute facture qui reste à régler ;
     · les factures du lancement et après, plus celles des trente jours
       d'avant, une fois la liste validée ;
     · elle répond : tout s'arrête, la conversation passe à l'équipe ;
     · elles partent seules ; après la dernière, « Appeler » dans À faire ;
     · ton doux, sans PDF, un bouton « Régler » (Tap & Go) ;
     · toute personne qui encaisse peut mettre en pause.

   LA DATE QUI JUGE EST CELLE DE LA FACTURE (une date métier), jamais une
   écriture. Une facture rattrapée compte ses relances depuis le jour où la
   liste a été validée : comptées depuis sa date, ses quatre relances, toutes
   « en retard », partiraient quatre jours de suite.

   Ce bloc est RECOPIÉ dans supabase/functions/relances-factures (une fonction
   Edge ne lit rien du dépôt) ; scripts/verifie-les-relances tient les deux
   textes ensemble. */

// ── DEBUT relances (copie dans supabase/functions/relances-factures, éprouvée par scripts/verifie-les-relances)
export type ReglagesRelances = {
  /** Allumées par la direction (Paramètres › Relances). */
  actives?: boolean;
  /** Le jour du lancement : les factures datées de ce jour ou après se relancent d'office. */
  depuis?: string;
  /** Les trente jours d'avant le lancement, validés une fois, facture par facture. */
  rattrapage?: { valideLe: string; par?: string; ids: string[] };
};

/** J+1, J+3, J+7, J+14 : les jours des quatre relances, comptés depuis le départ. */
export const CADENCE_DES_RELANCES: readonly number[] = [1, 3, 7, 14];
/** Ce que le rattrapage peut reprendre avant le lancement. */
export const JOURS_DE_RATTRAPAGE = 30;

export const jourPlusR = (iso: string, j: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + j);
  return d.toISOString().slice(0, 10);
};

/** L'identifiant d'une relance au journal des envois : une par facture et par rang. */
export const idDeLaRelance = (factureId: string, n: number): string => `rl-${factureId}-${n}-whatsapp`;

/** Une facture (jamais un devis, jamais un brouillon). */
export const seRelance = (f: { kind?: string; status?: string }): boolean =>
  f.kind === 'facture' && f.status !== 'brouillon';

/** LE JOUR D'OÙ SE COMPTENT SES RELANCES, ou null si elle n'en a pas.
    18 OCTOBRE 2026, « ne pas faire voir mon retard aux clients » (Yéman) :
    une pièce écrite APRÈS son jour (le rituel d'hier saisi ce matin) ne se
    relance pas seule ; la cliente a peut-être payé ce jour-là, et la
    relancer ferait voir le retard. Seules se relancent seules les pièces
    écrites le jour même (ou avant, un rituel prépayé), et celles que la
    direction a cochées au rattrapage. `jourDe` rend le jour local d'un instant. */
export function departDesRelances(f: { id: string; date: string; creeeLe?: string }, r: ReglagesRelances | undefined, jourDe: (iso: string) => string): string | null {
  const depuis = r?.depuis ?? '';
  if (!r?.actives || !/^\d{4}-\d{2}-\d{2}$/.test(depuis)) return null;
  const rt = r.rattrapage;
  if (rt && /^\d{4}-\d{2}-\d{2}$/.test(rt.valideLe) && rt.ids.includes(f.id) && f.date >= jourPlusR(depuis, -JOURS_DE_RATTRAPAGE)) {
    return rt.valideLe > f.date ? rt.valideLe : f.date;
  }
  if (f.date >= depuis && !!f.creeeLe && jourDe(f.creeeLe) <= f.date) return f.date;
  return null;
}

/** LA RELANCE À POSER AUJOURD'HUI (1 à 4), ou null.
    `parties` : les relances déjà déposées (un échec ne compte pas, il se
    retente) ; `derniereLe` : le jour de la dernière, pour qu'aucune cliente
    n'en reçoive deux le même jour. */
export function relanceDuJour(o: {
  depart: string | null; parties: number; derniereLe?: string; aujourdhui: string;
  resteXof: number; enPause: boolean; aRepondu: boolean;
}): number | null {
  if (!o.depart || !(o.resteXof > 0) || o.enPause || o.aRepondu) return null;
  if (o.parties >= CADENCE_DES_RELANCES.length) return null;
  if (o.derniereLe && o.derniereLe >= o.aujourdhui) return null;
  return jourPlusR(o.depart, CADENCE_DES_RELANCES[o.parties]) <= o.aujourdhui ? o.parties + 1 : null;
}

/** Elle a écrit à la Maison depuis la première relance : tout s'arrête. */
export const aReponduDepuis = (messages: readonly { sens?: string; quand?: string }[], depuisIso: string | undefined): boolean =>
  !!depuisIso && messages.some((m) => m.sens === 'entrant' && (m.quand ?? '') > depuisIso);
// ── FIN relances

/* ══ LES RELANCES D'UNE ÉCHÉANCE DE FORMULE — 20 octobre 2026 ══════════════
   La pièce d'une formule se relance ÉCHÉANCE PAR ÉCHÉANCE (la fonction
   relances-factures écrit `rl-<pièce>-e<k>-<n>`). Hors du bloc copié au
   serveur, qui garde son texte : on relit la suite de la plus récente
   échéance relancée comme une suite ordinaire, puis le même juge parle. */
/** L'identifiant d'une relance d'ÉCHÉANCE de formule : une suite par échéance. */
export const idDeLaRelanceDEcheance = (factureId: string, numero: number, n: number): string =>
  `rl-${factureId}-e${numero}-${n}-whatsapp`;

/** LA PLUS RÉCENTE ÉCHÉANCE RELANCÉE de cette pièce, ou `null` (pièce ordinaire). */
export function derniereEcheanceRelancee(factureId: string, journal: readonly { id: string }[]): number | null {
  const tete = `rl-${factureId}-e`;
  let k: number | null = null;
  for (const l of journal) {
    if (!l.id.startsWith(tete)) continue;
    const m = /^(\d+)-\d+-whatsapp$/.exec(l.id.slice(tete.length));
    if (m) k = Math.max(k ?? 0, Number(m[1]));
  }
  return k;
}

/** CE QUE L'ÉCRAN DIT DES RELANCES D'UNE PIÈCE, la pièce d'une formule
    comprise : la suite de sa plus récente échéance relancée, sinon la sienne. */
export function etatDesRelancesDeLaPiece(o: Parameters<typeof etatDesRelances>[0]): ReturnType<typeof etatDesRelances> {
  const k = derniereEcheanceRelancee(o.factureId, o.journal);
  if (k === null) return etatDesRelances(o);
  const journal: LigneDeRelance[] = [];
  for (let n = 1; n <= CADENCE_DES_RELANCES.length; n++) {
    const l = o.journal.find((x) => x.id === idDeLaRelanceDEcheance(o.factureId, k, n));
    if (l) journal.push({ ...l, id: idDeLaRelance(o.factureId, n) });
  }
  return etatDesRelances({ ...o, journal });
}

/** Une pause posée au comptoir (« elle passe régler samedi »). */
export type PauseDesRelances = { le: string; par?: string };

/** Les verdicts du journal qui ne comptent pas comme une relance partie. */
export const RELANCE_A_RETENTER = new Set(['échec', 'périmé']);

export type LigneDeRelance = { id: string; statut?: string; quand?: string };

/** CE QUE L'ÉCRAN DIT D'UNE FACTURE : combien sont parties, la dernière, la
    prochaine, et si tout est fini. Lu du journal des envois. */
export function etatDesRelances(o: {
  factureId: string; depart: string | null; journal: readonly LigneDeRelance[];
  resteXof: number; enPause: boolean; aujourdhui: string; jourDe: (iso: string) => string;
}): { parties: number; derniereLe?: string; prochaine?: string; fini: boolean } {
  let parties = 0;
  let derniereLe: string | undefined;
  for (let n = 1; n <= CADENCE_DES_RELANCES.length; n++) {
    const l = o.journal.find((x) => x.id === idDeLaRelance(o.factureId, n));
    if (!l || RELANCE_A_RETENTER.has(l.statut ?? '')) break;
    parties = n;
    if (l.quand) derniereLe = o.jourDe(l.quand);
  }
  const fini = parties >= CADENCE_DES_RELANCES.length;
  const prochaine = !o.depart || fini || !(o.resteXof > 0) || o.enPause
    ? undefined
    : (() => {
      const j = jourPlusR(o.depart, CADENCE_DES_RELANCES[parties]);
      const apres = derniereLe ? jourPlusR(derniereLe, 1) : o.aujourdhui;
      const plusTot = j > o.aujourdhui ? j : o.aujourdhui;
      return plusTot > apres ? plusTot : apres;
    })();
  return { parties, ...(derniereLe ? { derniereLe } : {}), ...(prochaine ? { prochaine } : {}), fini };
}

/** APRÈS LA DERNIÈRE : la direction appelle, le lendemain de la quatrième
    relance, si rien n'est réglé et que personne n'a mis de pause. */
export const aAppeler = (e: { parties: number; derniereLe?: string }, o: { resteXof: number; enPause: boolean; aujourdhui: string }): boolean =>
  e.parties >= CADENCE_DES_RELANCES.length && !!e.derniereLe && e.derniereLe < o.aujourdhui && o.resteXof > 0 && !o.enPause;
