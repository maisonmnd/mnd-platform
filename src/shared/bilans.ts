import { createStore, useStore, uid } from './store';

/* LE REGISTRE DES BILANS DE SÉANCE — le Carnet de Suivi devient réel.

   La page `bilan.html` existait comme PAPETERIE : pré-remplie par l'URL,
   imprimée, puis rien — aucun registre, aucun souvenir. Le Trône ne savait
   pas si un bilan avait été remis ni ce qu'il disait, et Ma Couronne n'avait
   rien à lire. Ce fichier donne au bilan une existence :

   — il s'ÉCRIT depuis la fiche cliente du Trône (personnel seul) ;
   — la cliente LIT les siens sur Ma Couronne (RLS : `clientId = auth.uid()`,
     le patron des rendez-vous et des factures — migration 0035) ;
   — le prochain bilan se pré-remplit du PRÉCÉDENT : la maîtresse voit la
     couronne évoluer, séance après séance. */

export type JaugeBilan = {
  nom: string; // « Cuir chevelu », « Racines »…
  note: string; // « apaisé », « reprises » — le mot qui accompagne la jauge
  valeur: number; // 1 à 5
};

export type TempsRituel = {
  nom: string; // Purifier · Nourrir · Sceller · Couronner
  cadence: string; // « chaque semaine »
  texte: string;
};

export type Bilan = {
  id: string;
  branchId: string;
  /** La tête à qui le bilan est remis — c'est ce champ que la RLS lit. */
  clientId: string;
  /** La séance honorée d'origine, quand on la connaît. */
  apptId?: string;
  /** MND-BS-AAAA-NNNN — série ancrée, comme les factures. */
  numero: string;
  /** Le jour de la SÉANCE (la remise a sa propre date). */
  date: string;
  prestation?: string;
  praticien?: string;
  duree?: string;
  prochaineVisite?: string;
  jauges: JaugeBilan[];
  points: string[];
  rituel: TempsRituel[];
  /** Le jour où la maison l'a remis — c'est lui qui ordonne le registre. */
  remisLe: string;
};

/** Les quatre jauges du classeur — le point de départ d'un premier bilan. */
export const JAUGES_SEED: JaugeBilan[] = [
  { nom: 'Cuir chevelu', note: 'apaisé', valeur: 4 },
  { nom: 'Racines', note: 'reprises', valeur: 3 },
  { nom: 'Hydratation', note: 'bonne', valeur: 4 },
  { nom: 'Densité & tenue', note: 'excellente', valeur: 5 },
];

/** Les Quatre Temps du rituel à domicile — la voix de la maison, modifiable. */
export const RITUEL_SEED: TempsRituel[] = [
  { nom: 'Purifier', cadence: 'chaque semaine', texte: 'Un lavage doux par semaine, en pressant sans frotter. Rincer longuement, à l’eau tiède.' },
  { nom: 'Nourrir', cadence: 'deux fois par semaine', texte: 'Quelques gouttes d’huile légère sur le cuir chevelu, en massage lent du bout des doigts.' },
  { nom: 'Sceller', cadence: 'après chaque lavage', texte: 'Sécher entièrement avant de nouer. Jamais de couronne humide sous le foulard.' },
  { nom: 'Couronner', cadence: 'chaque nuit', texte: 'Foulard ou taie en satin pour la nuit, la friction du coton défait le travail des racines.' },
];

export const bilansStore = createStore<Bilan[]>('mnd_bilans', []);
export const useBilans = () => useStore(bilansStore);

/** Le dernier bilan remis à une tête — celui que Ma Couronne affiche. */
export const dernierBilanDe = (bilans: Bilan[], clientId: string): Bilan | undefined =>
  bilans
    .filter((b) => b.clientId === clientId)
    .sort((a, b) => b.remisLe.localeCompare(a.remisLe) || b.date.localeCompare(a.date))[0];

/** Prochain numéro de la série MND-BS — ancré début et fin, comme les factures :
    un numéro suffixé ou d'une autre série ne nourrit jamais le compteur. */
export function prochainNumeroBilan(bilans: Bilan[]): string {
  const annee = new Date().getFullYear();
  const motif = new RegExp(`^MND-BS-${annee}-(\\d+)$`);
  let max = 0;
  for (const b of bilans) {
    const m = motif.exec(b.numero ?? '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `MND-BS-${annee}-${String(max + 1).padStart(4, '0')}`;
}

/** La maison remet le bilan — l'écriture est UN geste, daté du jour de remise. */
export function remettreBilan(champs: Omit<Bilan, 'id'>): Bilan {
  const b: Bilan = { id: `bil-${uid()}`, ...champs };
  bilansStore.set((prev) => [...prev, b]);
  return b;
}

import { bindCollection } from './sync';
bindCollection(bilansStore, 'bilans');
