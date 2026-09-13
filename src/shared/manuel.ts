import { createStore, useStore } from './store';
import { bindCollection } from './sync';
import { PARCOURS_MND, parcoursDuNom } from './parcours';

/* ══ LE MANUEL DES FORMATRICES — 13 septembre 2026 ═══════════════════

   « Je veux bien que la formatrice voie le plan de sa séance en remplissant
   sa fiche. Je veux également ranger ce contenu dans la base privée de
   Supabase, pas dans le code » (Yéman).

   CE FICHIER NE CONTIENT AUCUNE LIGNE DU MANUEL, et c'est tout son objet.
   Le dépôt est public, le site aussi : ce qui s'écrit ici se lit par
   n'importe qui. Il ne porte que la FORME d'un manuel, le juge qui valide un
   fichier importé, et la façon de retrouver le plan d'une séance. Le contenu
   vit dans la table `manuel_formatrices` (migrations 0088 et 0089) : le
   personnel le lit, la direction l'écrit, par l'import d'un fichier ou en le
   corrigeant dans le Trône (`ManuelEditeur`).

   UNE LIGNE PAR FORMATION, identifiée par son parcours (`shared/parcours`).
   Une formation du Trône retrouve son manuel PAR SON NOM, graphie près :
   « L'Oeuvre » écrit à la main est bien L'Œuvre. */

export type SeanceDuManuel = {
  n: number;
  /** Le rang du module dans le programme, à partir de 1. */
  module: number;
  nomModule: string;
  titre: string;
  duree: string;
  objectif: string;
  preparer: string[];
  /** [durée, ce qui se passe] */
  deroule: [string, string][];
  vu: string[];
  pratique: string[];
  /** [critère, barème] — quatre critères sur 5 font la note sur 20. */
  mesure: [string, string][];
  /** Présente à la dernière séance d'un module. */
  evaluation?: string;
  teteReelle?: string;
  erreurs: string[];
  ensuite: string;
};

export type ManuelDeFormation = {
  /** L'identifiant du parcours : « fondation », « maitre »… */
  id: string;
  meta: string;
  intro: string;
  materiel: string[];
  seances: SeanceDuManuel[];
  importeLe?: string;
  /** La dernière correction faite dans le Trône, et par qui. */
  modifieLe?: string;
  modifiePar?: string;
};

export const manuelStore = createStore<ManuelDeFormation[]>('mnd_manuel_formatrices', []);
export const useManuel = () => useStore(manuelStore);
bindCollection(manuelStore, 'manuel_formatrices');

/* ── LIRE UN FICHIER IMPORTÉ ─────────────────────────────────────────
   Un fichier se lit comme une saisie : on ne croit rien. Une séance sans
   numéro, sans titre ou sans objectif ne s'écrit pas ; une formation
   inconnue non plus. Ce qui est lisible mais ne colle pas au programme
   (un nombre de séances, un nom de module) s'annonce sans bloquer : la
   Maison peut vouloir un manuel en avance sur ses programmes. */

export type LectureDuManuel = {
  manuels: ManuelDeFormation[];
  /** Bloquantes : rien ne s'importe tant qu'il en reste. */
  erreurs: string[];
  /** À lire avant de confirmer. */
  alertes: string[];
};

const texte = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
const textes = (x: unknown): string[] =>
  (Array.isArray(x) ? x.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map((t) => t.trim()) : []);
const paires = (x: unknown): [string, string][] =>
  (Array.isArray(x)
    ? x
      .filter((p): p is [string, string] => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string')
      .map((p): [string, string] => [p[0].trim(), p[1].trim()])
    : []);
const objet = (x: unknown): Record<string, unknown> | null =>
  (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);

export function lisLeManuel(brut: unknown, importeLe: string): LectureDuManuel {
  const manuels: ManuelDeFormation[] = [];
  const erreurs: string[] = [];
  const alertes: string[] = [];
  const formations = objet(objet(brut)?.formations);
  if (!formations) {
    return { manuels, erreurs: ['Ce fichier n’est pas un manuel de l’Académie.'], alertes };
  }
  for (const [id, valeur] of Object.entries(formations)) {
    const p = PARCOURS_MND.find((x) => x.id === id);
    if (!p) { erreurs.push(`« ${id} » n’est pas une formation de l’Académie.`); continue; }
    const f = objet(valeur) ?? {};
    const seances: SeanceDuManuel[] = [];
    for (const brute of Array.isArray(f.seances) ? f.seances : []) {
      const s = objet(brute) ?? {};
      const n = Number(s.n);
      const module = Number(s.module);
      /* L'ERREUR DIT LA SÉANCE ET CE QUI MANQUE : corrigée dans le Trône, une
         séance se retrouve par son numéro, pas en relisant les soixante-neuf. */
      const manques = [
        !Number.isInteger(n) || n < 1 ? 'le numéro' : '',
        !Number.isInteger(module) || module < 1 ? 'le module' : '',
        !texte(s.titre) ? 'le titre' : '',
        !texte(s.objectif) ? 'l’objectif' : '',
      ].filter(Boolean);
      if (manques.length) {
        const laquelle = Number.isInteger(n) && n >= 1 ? `séance ${n}` : 'une séance';
        const dit = manques.length > 1
          ? `${manques.slice(0, -1).join(', ')} et ${manques[manques.length - 1]}`
          : manques[0];
        erreurs.push(`${p.titre}, ${laquelle} : il manque ${dit}.`);
        continue;
      }
      seances.push({
        n, module,
        nomModule: texte(s.nomModule), titre: texte(s.titre), duree: texte(s.duree), objectif: texte(s.objectif),
        preparer: textes(s.preparer), deroule: paires(s.deroule), vu: textes(s.vu), pratique: textes(s.pratique),
        mesure: paires(s.mesure),
        evaluation: texte(s.evaluation) || undefined,
        teteReelle: texte(s.teteReelle) || undefined,
        erreurs: textes(s.erreurs), ensuite: texte(s.ensuite),
      });
    }
    seances.sort((a, b) => a.n - b.n);
    if (new Set(seances.map((s) => s.n)).size !== seances.length) {
      erreurs.push(`${p.titre} : deux séances portent le même numéro.`);
    }
    if (seances.length !== p.seances) {
      alertes.push(`${p.titre} : ${seances.length} séance${seances.length > 1 ? 's' : ''} dans le manuel, ${p.seances} au programme.`);
    }
    const noms = p.programme.map((m) => m.nom);
    if (seances.some((s) => s.nomModule !== '' && noms[s.module - 1] !== s.nomModule)) {
      alertes.push(`${p.titre} : un module du manuel ne porte pas le nom du programme.`);
    }
    manuels.push({
      id, meta: texte(f.meta), intro: texte(f.intro), materiel: textes(f.materiel), seances,
      importeLe: importeLe || texte(f.importeLe) || undefined,
      modifieLe: texte(f.modifieLe) || undefined,
      modifiePar: texte(f.modifiePar) || undefined,
    });
  }
  if (manuels.length === 0 && erreurs.length === 0) erreurs.push('Ce fichier ne contient aucune formation.');
  return { manuels, erreurs, alertes };
}

/** Le manuel d'une formation du Trône, retrouvé par son nom. */
export function manuelDeLaFormation(
  manuels: readonly ManuelDeFormation[],
  nomFormation: string,
): ManuelDeFormation | undefined {
  const p = parcoursDuNom(nomFormation);
  return p ? manuels.find((m) => m.id === p.id) : undefined;
}

/** Le plan d'une séance : la formation par son nom, la séance par son numéro. */
export function planDeLaSeance(
  manuels: readonly ManuelDeFormation[],
  nomFormation: string,
  numero: number,
): SeanceDuManuel | undefined {
  return manuelDeLaFormation(manuels, nomFormation)?.seances.find((s) => s.n === numero);
}

/** LA NOTE SUR 20, DEPUIS LES CRITÈRES DE LA SÉANCE.

    Chaque critère se borne à 0..5. LA NOTE N'EXISTE QUE SI TOUS SONT POSÉS :
    une note calculée sur trois critères sur quatre serait basse sans raison,
    et la formatrice la signerait sans le voir. Au-delà de quatre critères, la
    somme se ramène sur 20. */
export function noteDesCriteres(
  criteres: readonly (number | null | undefined)[],
  attendus: number,
): number | undefined {
  if (attendus <= 0 || criteres.length < attendus) return undefined;
  const pris = criteres.slice(0, attendus);
  if (pris.some((c) => c == null || !Number.isFinite(c))) return undefined;
  const somme = pris.reduce<number>((n, c) => n + Math.max(0, Math.min(5, c as number)), 0);
  return Math.round(Math.min(20, (somme * 20) / (attendus * 5)) * 10) / 10;
}

/* ── ÉCRIRE LE MANUEL DANS LE TRÔNE — 13 septembre 2026 ─────────────
   « Permets-moi de corriger le manuel directement depuis le Trône » (Yéman).
   L'écran se garde (`peutEcrireLeManuel`), et la base aussi : la migration
   0089 n'accepte l'écriture que de la direction. Une règle tenue par le seul
   écran se contournerait par la base. */

/** Le souverain et le gérant écrivent le manuel ; le personnel le lit. */
export const peutEcrireLeManuel = (role?: string | null): boolean => role === 'souverain' || role === 'gerant';

/** UN MANUEL À ÉCRIRE, pour une formation qui n'en a pas : ses séances
    numérotées et rangées dans ses modules, comme au programme. Il ne
    s'enregistre qu'une fois chaque séance titrée et dotée d'un objectif. */
export function squeletteDuManuel(id: string): ManuelDeFormation | undefined {
  const p = PARCOURS_MND.find((x) => x.id === id);
  if (!p) return undefined;
  const seances: SeanceDuManuel[] = [];
  p.programme.forEach((m, i) => {
    for (let k = 0; k < m.seances; k++) {
      seances.push({
        n: seances.length + 1, module: i + 1, nomModule: m.nom, titre: '', duree: '', objectif: '',
        preparer: [], deroule: [], vu: [], pratique: [], mesure: [], erreurs: [], ensuite: '',
      });
    }
  });
  return { id, meta: `${p.niveau} · ${p.duree}`, intro: '', materiel: [], seances };
}
