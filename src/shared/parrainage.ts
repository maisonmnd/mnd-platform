import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { Demande } from './demandes';
import { FORME_DU_CODE } from './parrainage-pur';

/* LE PARRAINAGE — 28 septembre 2026, maquette « La communauté MND » validée
   (« construis avec les patterns réels de la marque », Yéman).

   UNE MARRAINE est une demande du site, genre `prospect`, profil
   « Marraine », qui porte `codeParrain` : c'est la fonction Edge
   `demande-submit` qui l'écrit, jamais le navigateur (mode `parrainage`).
   UNE FILLEULE est une réservation du site dont le code a été reconnu comme
   un code de marraine (`codeRaison: 'parrainage'`, `parrainDe`) : nouvelle
   cliente seulement, jamais la marraine elle-même.

   Ce fichier ne décide rien que la fonction ne décide déjà : il range, pour
   l'écran Parrainages, ce que la base contient. La FORME du code est le seul
   contrat entre les deux rives ; `verifie-le-parrainage` l'éprouve des deux
   côtés. */

export { FORME_DU_CODE, SIGNES_DU_CODE, racineDuCode, codeDeMarraine, lienDuParrainage } from './parrainage-pur';

/* ── LES CADEAUX, ÉCRITS PAR LA MAISON ─────────────────────────────────
   Des phrases, pas des montants : « un lavage offert », « 10 % sur la
   première visite ». La fonction les lit (clef de service) et les rend à la
   page quand le code est créé ; le site n'en invente aucun. */
export type ReglageParrainage = {
  actif: boolean;
  cadeauFilleule: string;
  cadeauMarraine: string;
};

export const REGLAGE_PARRAINAGE_DEFAUT: ReglageParrainage = {
  actif: true,
  cadeauFilleule: '',
  cadeauMarraine: '',
};

export const parrainageStore = createStore<ReglageParrainage>('mnd_parrainage', REGLAGE_PARRAINAGE_DEFAUT);
export const useParrainage = () => useStore(parrainageStore);
bindDocument(parrainageStore, 'mnd_parrainage');

/* ── CE QUE L'ÉCRAN MONTRE ─────────────────────────────────────────── */

/** Ce que la base porte en plus sur une demande, pour le parrainage. */
export type DemandeParrainee = Demande & {
  codeParrain?: string;
  code?: string;
  codeRaison?: string;
  parrainDe?: string;
  marraineId?: string;
  /** Posé au Trône : le cadeau de la marraine lui a été remis. */
  cadeauMarraineRemisLe?: string;
};

export type EtatDeLaVisite = 'sans-rdv' | 'a-venir' | 'venue' | 'annulee';

export type Filleule = {
  demande: DemandeParrainee;
  visite: EtatDeLaVisite;
  dateRdv?: string;
};

export type Marraine = {
  demande: DemandeParrainee;
  code: string;
  filleules: Filleule[];
};

type RdvLu = { id: string; status: string; date: string };

export function etatDeLaVisite(d: DemandeParrainee, rdvs: readonly RdvLu[]): { visite: EtatDeLaVisite; dateRdv?: string } {
  const r = d.apptId ? rdvs.find((x) => x.id === d.apptId) : undefined;
  if (!r) return { visite: 'sans-rdv' };
  if (r.status === 'honoré') return { visite: 'venue', dateRdv: r.date };
  if (r.status === 'annulé') return { visite: 'annulee', dateRdv: r.date };
  return { visite: 'a-venir', dateRdv: r.date };
}

/** Les marraines, chacune avec ses filleules, les plus récentes d'abord. */
export function marrainesEtFilleules(demandes: readonly DemandeParrainee[], rdvs: readonly RdvLu[]): Marraine[] {
  const marraines = demandes.filter((d) => d && d.codeParrain && FORME_DU_CODE.test(d.codeParrain));
  const filleules = demandes.filter((d) => d && d.codeRaison === 'parrainage' && d.parrainDe);
  return marraines
    .map((m) => ({
      demande: m,
      code: m.codeParrain as string,
      filleules: filleules
        .filter((f) => f.parrainDe === m.codeParrain)
        .map((f) => ({ demande: f, ...etatDeLaVisite(f, rdvs) }))
        .sort((a, b) => b.demande.createdAt.localeCompare(a.demande.createdAt)),
    }))
    .sort((a, b) => b.demande.createdAt.localeCompare(a.demande.createdAt));
}

/** Le cadeau de la marraine est dû dès qu'UNE filleule est venue et qu'il
    n'a pas été remis pour elle. */
export const cadeauDu = (f: Filleule): boolean => f.visite === 'venue' && !f.demande.cadeauMarraineRemisLe;

export const VISITE_DITE: Record<EtatDeLaVisite, string> = {
  'sans-rdv': 'pas encore de rendez-vous',
  'a-venir': 'rendez-vous à venir',
  venue: 'venue',
  annulee: 'rendez-vous annulé',
};
