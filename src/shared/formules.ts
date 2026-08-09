import { createStore, useStore } from './store';

/* LES FORMULES MAÎTRES — la bibliothèque du Laboratoire, en DONNÉES.

   POURQUOI PAS UNE LIGNE DE CONTENU DANS CE FICHIER. Les formules réelles de
   l'Atelier (Shampoing Ritual, Color Locks, soins signature) sont un secret de
   fabrique — « usage exclusif Brice & Yéman », dit le classeur. Or ce dépôt
   est PUBLIC, et le bundle JS publié se télécharge sans compte : tout ce qui
   est écrit dans le code est lisible par n'importe qui. Les six formules
   poétiques de `lab.ts` peuvent vivre là — elles sont une vitrine. Les
   formules réelles, JAMAIS.

   Elles vivent donc dans la table `lab_formules`, sous `is_staff()` seul,
   comme les prix d'achat. Elles s'insèrent par un fichier LOCAL et GITIGNORÉ
   (`supabase/import_formules_maitres.sql`) — le patron des imports de
   clientes — et n'atteignent le navigateur qu'après une connexion du
   personnel. Ce fichier-ci ne porte que la STRUCTURE. */

export type IngredientFormule = {
  ord: number;
  /** Le code du classeur maître — ACT-01, SURF-04, COLR-02… */
  code?: string;
  /** Le NOM CANONIQUE du codebook — c'est lui que la liaison au stock lit
      (`labIngredient` des fiches d'inventaire). Un même nom partout, une seule
      fiche pour toutes les formules qui l'emploient. */
  nom: string;
  qte?: number;
  unite?: string;
  /** « 40°C », « Amb. » — la température de mise en œuvre quand elle compte. */
  temp?: string;
  categorie?: string;
  role?: string;
};

export type EtapeFormule = { n: number; titre: string; detail: string };

export type FormuleLab = {
  id: string;
  /** SH-ESS-P1, CLR-NE, AQUA-LR… — stable, celui du classeur. */
  code: string;
  nom: string;
  /** « Shampoing Ritual », « Color Locks Ritual », « Soins signature ». */
  collection: string;
  /** Essentiel · Signature · Prestige — quand la collection a des niveaux. */
  niveau?: string;
  ordre: number;
  usage?: string;
  fabricant?: string;
  /** Formulé par un tiers certifié — on reçoit, on ne fabrique pas. */
  externe?: boolean;
  referenceExterne?: string;
  rendement?: string;
  conservation?: string;
  phCible?: string;
  ingredients: IngredientFormule[];
  protocole: EtapeFormule[];
  /** « Contrôle qualité avant conditionnement » sauf mention contraire. */
  controleTitre?: string;
  controle: string[];
  /** Tarifs, fréquences, mots du maître — les lignes libres du classeur. */
  notes?: string[];
};

export const formulesLabStore = createStore<FormuleLab[]>('mnd_lab_formules', []);
export const useFormulesLab = () => useStore(formulesLabStore);

/** Tous les ingrédients des formules maîtres, dédupliqués par nom canonique —
    ils rejoignent la réserve du Laboratoire pour la liaison au stock. */
export function ingredientsDesFormules(formules: FormuleLab[]): string[] {
  const vus: string[] = [];
  for (const f of formules) {
    for (const i of f.ingredients) if (!vus.includes(i.nom)) vus.push(i.nom);
  }
  return vus;
}

/** Les collections dans l'ordre du classeur, chacune avec ses formules triées. */
export function parCollection(formules: FormuleLab[]): Map<string, FormuleLab[]> {
  const m = new Map<string, FormuleLab[]>();
  const triees = [...formules].sort((a, b) => a.ordre - b.ordre);
  for (const f of triees) {
    const liste = m.get(f.collection) ?? [];
    liste.push(f);
    m.set(f.collection, liste);
  }
  return m;
}

import { bindCollection } from './sync';
bindCollection(formulesLabStore, 'lab_formules');
