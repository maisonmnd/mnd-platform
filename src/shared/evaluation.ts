/* ══ L'ÉVALUATION D'UN POSTE — 6 septembre 2026 ══════════════════════

   « Des fiches de poste plus détaillées avec des cases à cocher, des objectifs
   mesurables et atteignables, des points forts » (Yéman).

   LA FICHE DÉCRIT, L'ÉVALUATION CONSTATE. La première appartient au poste et
   ne bouge pas ; la seconde appartient à la personne et se refait chaque
   année. Les confondre ferait une fiche de poste différente par personne, et
   plus rien ne serait comparable.

   DEUX REGARDS, PAS UN (arbitrage de Yéman). Elle se note, la Maison note
   aussi. L'ÉCART ENTRE LES DEUX EST TOUT L'INTÉRÊT DU DOCUMENT : c'est là que
   se trouve le vrai sujet de l'entretien. Une compétence que la Maison croit
   acquise et que la personne ne s'attribue pas est un manque de confiance ; la
   même dans l'autre sens est un angle mort. Ni l'un ni l'autre ne se voit dans
   une colonne unique.

   TOUT EST PUR ICI, et jugé par `verifie-postes`. */

import type { FicheDePoste } from './postes';
import type { SignatureTracee } from './contrats';

/** LA VERSION DU DOCUMENT SIGNÉ. Sans elle, on ne saurait plus à quoi la
    personne a dit oui : une grille refaite l'année suivante ferait relire la
    signature de l'an dernier sous des lignes qui n'existaient pas. */
export const VERSION_EVALUATION = 'v1 · 6 septembre 2026';

/** Trois états, pas deux. « En cours » est le plus utile des trois : sans lui,
    tout ce qui n'est pas parfait se coche « non acquis », et personne ne signe
    une feuille qui dit qu'il ne sait rien faire. */
export type Niveau = 'non' | 'encours' | 'acquis';

export const NIVEAUX: { cle: Niveau; mot: string; signe: string }[] = [
  { cle: 'non', mot: 'Pas encore', signe: '·' },
  { cle: 'encours', mot: 'En cours', signe: '~' },
  { cle: 'acquis', mot: 'Acquis', signe: '✓' },
];

export const motDuNiveau = (n: Niveau | undefined): string =>
  NIVEAUX.find((x) => x.cle === n)?.mot ?? 'Non renseigné';
export const signeDuNiveau = (n: Niveau | undefined): string =>
  NIVEAUX.find((x) => x.cle === n)?.signe ?? '—';

export type Evaluation = {
  /** Le jour de l'entretien (ISO). */
  at: string;
  /** Le poste évalué, gardé tel qu'il était : une personne change de poste, et
      l'évaluation de l'an dernier doit rester lisible. */
  poste: string;
  /** Ce qu'elle dit d'elle-même, par clé de compétence. */
  parElle: Record<string, Niveau>;
  /** Ce que la Maison en dit. */
  parLaMaison: Record<string, Niveau>;
  /** La cible retenue pour CETTE personne, quand elle diffère du standard :
      celle qui débute ne vise pas ce que vise celle qui a trois ans. */
  cibles: Record<string, string>;
  /** L'objectif est-il atteint, au jour de l'entretien. */
  atteints: Record<string, boolean>;
  pointsForts: string;
  aTravailler: string;
  /** Ce que la personne a voulu ajouter. Un entretien où seul l'employeur
      écrit n'est pas un entretien, c'est une notification. */
  motDeLaPersonne?: string;
  signature?: SignatureTracee;
};

export const evaluationNeuve = (fiche: FicheDePoste, jourIso: string): Evaluation => ({
  at: jourIso,
  poste: fiche.poste,
  parElle: {},
  parLaMaison: {},
  /* LES CIBLES PARTENT DU STANDARD DU POSTE, et s'ajustent ensuite : la Maison
     n'invente rien à chaque entretien. */
  cibles: Object.fromEntries(fiche.objectifs.map((o) => [o.cle, o.cible])),
  atteints: {},
  pointsForts: '',
  aTravailler: '',
});

/** LE COMPTE D'UNE COLONNE. Un pourcentage seul ne dit rien ; on rend aussi le
    nombre, parce que « 4 sur 5 » se discute et « 80 % » se subit. */
export function compte(fiche: FicheDePoste, vu: Record<string, Niveau>): {
  acquis: number; encours: number; total: number; pct: number;
} {
  const total = fiche.competences.length;
  let acquis = 0; let encours = 0;
  for (const c of fiche.competences) {
    if (vu[c.cle] === 'acquis') acquis += 1;
    else if (vu[c.cle] === 'encours') encours += 1;
  }
  /* « EN COURS » VAUT UNE DEMIE. Ne rien lui donner découragerait ce qui
     progresse ; lui donner un point entier effacerait la différence avec ce
     qui est tenu. */
  const pct = total === 0 ? 0 : Math.round(((acquis + encours * 0.5) / total) * 100);
  return { acquis, encours, total, pct };
}

/** LÀ OÙ LES DEUX REGARDS DIVERGENT — le cœur de l'entretien.

    On ne rend QUE les désaccords, et l'on dit dans quel sens : « la Maison la
    voit plus loin » n'appelle pas la même conversation que « elle se voit plus
    loin que la Maison ». Une liste qui mélangerait les deux ferait perdre
    l'essentiel. */
export function ecarts(fiche: FicheDePoste, ev: Evaluation): {
  cle: string; mot: string; elle: Niveau | undefined; maison: Niveau | undefined;
  sens: 'elle-plus-haut' | 'maison-plus-haut';
}[] {
  const rang: Record<Niveau, number> = { non: 0, encours: 1, acquis: 2 };
  const out: ReturnType<typeof ecarts> = [];
  for (const c of fiche.competences) {
    const e = ev.parElle[c.cle];
    const m = ev.parLaMaison[c.cle];
    /* UN AVIS MANQUANT N'EST PAS UN DÉSACCORD : c'est une case qu'on n'a pas
       remplie, et l'annoncer comme un écart ferait chercher un conflit qui
       n'existe pas. */
    if (!e || !m || e === m) continue;
    out.push({ cle: c.cle, mot: c.mot, elle: e, maison: m, sens: rang[e] > rang[m] ? 'elle-plus-haut' : 'maison-plus-haut' });
  }
  return out;
}

/** CE QUI MANQUE POUR QUE L'ENTRETIEN SOIT TENU. Un document à moitié rempli
    signé le jour même ne se relit pas l'année suivante. */
export function pourquoiIncomplete(fiche: FicheDePoste, ev: Evaluation): string | undefined {
  const vues = fiche.competences.filter((c) => ev.parLaMaison[c.cle]).length;
  if (vues < fiche.competences.length) {
    return `Il reste ${fiche.competences.length - vues} compétence(s) que la Maison n’a pas notée(s).`;
  }
  if (!ev.pointsForts.trim()) return 'Les points forts ne sont pas écrits. Un entretien sans eux se lit comme un reproche.';
  return undefined;
}
