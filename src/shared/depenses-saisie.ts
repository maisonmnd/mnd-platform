/* ══ LA SAISIE D'UNE DÉPENSE, ALLÉGÉE — 16 septembre 2026 ═══════════════
   « J'ai du mal à remplir les dépenses. Il faut simplifier le processus et
   alléger. Améliorer l'UI des dépenses » (Yéman). Maquette
   `public/maquette-les-depenses-allegees.html`, validée avec ses quatre
   arbitrages : construire, « comme la dernière fois » en un clic, le revenu
   replié sous « Plus, si besoin », la date sur aujourd'hui et la liste jour
   par jour.

   CE QUI SE JUGE ICI, sans écran : ce qui manque avant d'enregistrer et
   comment on le dit, ce que la dernière dépense d'un bénéficiaire propose,
   et comment les dépenses se rangent jour par jour. L'écran ne fait que
   poser ces mots. Les règles de la Maison ne bougent pas : rien de
   présélectionné (13 septembre), les trois réponses réclamées, un compte
   restreint signe de son nom, une dépense avancée de sa poche ne sort
   d'aucun tiroir (31 août). */

import { sameName } from './text';

/** Ce que la fenêtre sait de la saisie en cours. */
export type SaisieDeDepense = {
  montant: boolean;
  beneficiaire: boolean;
  categorie: boolean;
  porteurChoisi: boolean;
  caisseChoisie: boolean;
  /** Avancée de sa poche PAR quelqu'un : la caisse ne se réclame pas. */
  avancee: boolean;
};

/** Ce que la fenêtre demande à CE compte : un compte restreint ne choisit
    pas de porteur (son nom est posé). */
export type CeQuiSeDemande = { porteur: boolean };

const MANQUES = {
  montant: 'le montant',
  beneficiaire: 'le bénéficiaire',
  categorie: 'à quoi va cet argent',
  porteur: 'qui a fait cet achat',
  caisse: 'la caisse',
} as const;

/** CE QUI MANQUE, dans l'ordre de la fenêtre : le montant, le bénéficiaire,
    puis les trois réponses de la Maison. */
export function reponsesManquantes(s: SaisieDeDepense, d: CeQuiSeDemande): string[] {
  const manques: string[] = [];
  if (!s.montant) manques.push(MANQUES.montant);
  if (!s.beneficiaire) manques.push(MANQUES.beneficiaire);
  if (!s.categorie) manques.push(MANQUES.categorie);
  if (d.porteur && !s.porteurChoisi) manques.push(MANQUES.porteur);
  if (!s.avancee && !s.caisseChoisie) manques.push(MANQUES.caisse);
  return manques;
}

/** « Il manque la caisse. », « Il manque le montant, à quoi va cet argent
    et la caisse. » Rien à dire quand rien ne manque. */
export function ditCeQuiManque(manques: readonly string[]): string {
  if (manques.length === 0) return '';
  if (manques.length === 1) return `Il manque ${manques[0]}.`;
  return `Il manque ${manques.slice(0, -1).join(', ')} et ${manques[manques.length - 1]}.`;
}

/** LE COMPTE DU BLOC « LES TROIS RÉPONSES » : combien sont données, sur
    combien sont demandées. Un compte restreint n'a que deux questions ; une
    dépense avancée de sa poche n'a pas de caisse à choisir. */
export function compteDesReponses(s: SaisieDeDepense, d: CeQuiSeDemande): { donnees: number; total: number } {
  const questions: boolean[] = [s.categorie];
  if (d.porteur) questions.push(s.porteurChoisi);
  if (!s.avancee) questions.push(s.caisseChoisie);
  return { donnees: questions.filter(Boolean).length, total: questions.length };
}

/** Une date de dépense, ISO ou « jj/mm/aaaa », en clé de jour ISO. */
export const cleDuJour = (date: string): string => {
  const fr = (date ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : (date ?? '').slice(0, 10);
};

type DepenseDite = {
  label: string; date: string; category: string; subcategory?: string;
  porteur?: string; cashbox: string;
};

/** « COMME LA DERNIÈRE FOIS » : la dépense la plus récente de ce
    bénéficiaire (même nom, aux accents et à la casse près), pour proposer
    ses trois réponses en un clic. Rien n'est présélectionné : c'est un
    geste, et il se voit. Un bénéficiaire de moins de deux lettres ne
    propose rien, sinon la ligne clignoterait à chaque frappe. */
export function derniereDepenseDe<T extends DepenseDite>(label: string, depenses: readonly T[]): T | undefined {
  const l = label.trim();
  if (l.length < 2) return undefined;
  let meilleure: T | undefined;
  for (const d of depenses) {
    if (!sameName(d.label, l)) continue;
    if (!meilleure || cleDuJour(d.date) > cleDuJour(meilleure.date)) meilleure = d;
  }
  return meilleure;
}

/** Ce que le rappel dit : « Produits · Huiles · La Maison elle-même · Caisse principale ». */
export function ditLaDerniereFois(d: DepenseDite): string {
  return [
    d.category || 'Divers',
    d.subcategory || '',
    d.porteur || 'La Maison elle-même',
    d.cashbox || 'Sans caisse',
  ].filter(Boolean).join(' · ');
}

export type JourDeDepenses<T> = { jour: string; lignes: T[]; total: number };

/** LES DÉPENSES, JOUR PAR JOUR, le plus récent en haut ; dans un jour,
    l'ordre reçu est gardé. Une date illisible se range sous « sans date »,
    en dernier. */
export function groupeParJour<T extends { date: string }>(
  lignes: readonly T[], total: (l: T) => number,
): JourDeDepenses<T>[] {
  const par = new Map<string, JourDeDepenses<T>>();
  for (const l of lignes) {
    const jour = cleDuJour(l.date) || '';
    const g = par.get(jour) ?? { jour, lignes: [], total: 0 };
    g.lignes.push(l);
    g.total += total(l);
    par.set(jour, g);
  }
  return [...par.values()].sort((a, b) => {
    if (!a.jour) return 1;
    if (!b.jour) return -1;
    return b.jour.localeCompare(a.jour);
  });
}

const veilleDe = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** « Aujourd’hui · mercredi 16 septembre », « Hier · mardi 15 septembre »,
    « Lundi 14 septembre », et l'année quand ce n'est pas celle du jour. Le
    jour relatif garde sa date entière (17 septembre : « je ne vois pas la
    différence entre hier, mardi 15, dimanche 13 »), pour que tous les
    bandeaux se lisent de la même façon. */
export function ditLeJour(jour: string, aujourdhui: string): string {
  if (!jour) return 'Sans date';
  const d = new Date(`${jour}T12:00:00`);
  if (Number.isNaN(d.getTime())) return jour;
  const memeAnnee = jour.slice(0, 4) === aujourdhui.slice(0, 4);
  const mot = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(memeAnnee ? {} : { year: 'numeric' }) });
  if (jour === aujourdhui) return `Aujourd’hui · ${mot}`;
  if (jour === veilleDe(aujourdhui)) return `Hier · ${mot}`;
  return mot.charAt(0).toUpperCase() + mot.slice(1);
}
