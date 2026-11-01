/* ══ RETROUVER UNE FICHE PAR SON NOM OU SON NUMÉRO · 1er novembre 2026 ══════
   « Pour les RDV je passe par le même canal de message pour écrire à
   Opale ? » (Yéman) : oui, le fil de Yéman à elle-même sert aussi aux
   rendez-vous (« pose A. samedi 10 h », « décale-la à 14 h »). Opale doit
   alors retrouver la fiche et ses rendez-vous à venir : c'est l'action de
   LECTURE `fiche.chercher` de la fonction `assistants-maison`.

   LES BORNES, accordées le 1er novembre 2026 : un nom d'au moins deux
   lettres (insensible aux accents et à la casse) ou un numéro ; cinq fiches
   au plus ; seulement l'identifiant, le nom, la civilité, les numéros et
   les rendez-vous À VENIR non annulés (identifiant, date, heure, prestations
   par leur nom, updatedAt) ; jamais une note, la santé, l'argent ni
   l'historique ; soixante lectures par jour et par assistant ; une ligne
   « lu » au journal des gestes, sans le nom cherché. Pur : le banc
   verifie-les-assistants le rejoue. */
import { sansAccents } from './assistants-depenses-pur';

export const FICHES_AU_PLUS = 5;
export const LECTURES_PAR_JOUR = 60;
export const RDV_AU_PLUS = 5;

/** Les mots du nom cherché, sans accents ni casse ni ponctuation. */
export const motsDuNom = (t: string): string[] => sansAccents(t).split(/[^a-z0-9]+/).filter(Boolean);

/** LA RECHERCHE, LUE : un nom (au moins deux lettres, dont un mot de deux
    lettres : des initiales seules ne cherchent pas) ou un numéro. */
export function lisLaRecherche(
  d: { nom?: unknown; numeroCle?: unknown },
  numeroCle: (t: string) => string | null,
): { ok: true; nom: string[] } | { ok: true; numero: string } | { ok: false; motif: string } {
  const brutNum = String(d.numeroCle ?? '').trim();
  if (brutNum) {
    const n = numeroCle(brutNum);
    return n ? { ok: true, numero: n } : { ok: false, motif: 'numero-invalide' };
  }
  const mots = motsDuNom(String(d.nom ?? ''));
  const lettres = mots.join('').replace(/[0-9]/g, '').length;
  if (lettres < 2 || !mots.some((m) => m.length >= 2)) return { ok: false, motif: 'nom-trop-court' };
  return { ok: true, nom: mots };
}

/** Le filtre grossier de la base (ilike) : le mot le plus long, chaque lettre
    qui peut porter un accent remplacée par « _ ». « gbessi » trouve « Gbèssi » ;
    le tri fin se fait ensuite ici, par `ficheCorrespond`. */
export function motifDeLaBase(mots: readonly string[]): string {
  const long = [...mots].sort((a, b) => b.length - a.length)[0] ?? '';
  return `%${long.replace(/[aeiouycn]/g, '_')}%`;
}

/** Chaque mot cherché commence un mot du nom de la fiche : « awa sos » trouve « Awa Sossou ». */
export function ficheCorrespond(nomDeLaFiche: string, mots: readonly string[]): boolean {
  const siens = motsDuNom(nomDeLaFiche);
  return mots.length > 0 && mots.every((m) => siens.some((s) => s.startsWith(m)));
}

export type RdvLu = { id: string; date: string; time?: string; status?: string; serviceIds?: unknown; updatedAt?: string };
export type FicheRendue = {
  id: string; nom: string; civilite?: string; numeros: string[];
  rdvs: { id: string; date: string; heure: string; prestations: string[]; updatedAt: string }[];
};

/** CE QUI SORT D'UNE FICHE, ET RIEN D'AUTRE : jamais une note, la santé,
    l'argent ni l'historique. Les rendez-vous à venir, non annulés, du plus
    proche au plus lointain, cinq au plus. */
export function ficheLisible(
  f: { id: string; data: Record<string, unknown> },
  rdvs: readonly RdvLu[],
  nomDe: (serviceId: string) => string | undefined,
  aujourdhui: string,
): FicheRendue {
  const d = f.data;
  const civ = String(d.civilite ?? '');
  const numeros = [d.phone, d.phone2].map((x) => String(x ?? '').trim()).filter((x) => x.replace(/\D/g, '').length >= 8);
  const avenir = rdvs
    .filter((r) => r.date >= aujourdhui && r.status !== 'annulé')
    .sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`))
    .slice(0, RDV_AU_PLUS)
    .map((r) => ({
      id: r.id, date: r.date, heure: String(r.time ?? ''),
      prestations: (Array.isArray(r.serviceIds) ? r.serviceIds : []).map((s) => nomDe(String(s)) ?? 'Prestation').filter(Boolean),
      updatedAt: String(r.updatedAt ?? ''),
    }));
  return {
    id: f.id, nom: String(d.name ?? '').trim(),
    ...(civ === 'madame' || civ === 'mademoiselle' || civ === 'monsieur' ? { civilite: civ } : {}),
    numeros, rdvs: avenir,
  };
}

/** La ligne du journal : combien de fiches, jamais le nom cherché. L'écran
    Journal la lit « Opale a fait une recherche de fiche, une trouvée ». */
export const pieceDeLaLecture = (n: number): string =>
  `une recherche de fiche, ${n === 0 ? 'aucune trouvée' : n === 1 ? 'une trouvée' : `${n} trouvées`}`;
