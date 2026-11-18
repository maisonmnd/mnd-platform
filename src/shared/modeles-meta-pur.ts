/* ══ LES MODÈLES CHEZ META, SES DEUX FORMES ENSEMBLE · 18 novembre 2026 ══════
   Le document `mnd_modeles_meta` avait deux écrivains, et chacun effaçait
   l'autre :
     - la fonction `modeles-meta` (« Relire chez Meta ») y posait la LISTE que
       rend Meta : `{ lusLe, modeles: [{ id, nom, etat: 'APPROVED' … }], version }` ;
     - « Ce que ça rapporte › Ses modèles chez Meta » (`noteLeModele`) y posait
       le REGISTRE noté à la main : `{ modeles: { nom: { etat: 'approuve' } }, parQui, le }`.
   Une seule note remplaçait toute la liste : `demande-submit` ne lisait plus
   `rdv_a_confirmer` « APPROVED », l'attente s'éteignait sans bruit et les
   places du site naissaient confirmées, jusqu'au prochain « Relire chez
   Meta ». Une relecture, à l'inverse, effaçait les notes.

   La forme d'aujourd'hui les garde toutes deux : la liste de Meta reste dans
   `modeles` (un tableau, avec `lusLe` et `version`), les notes vont dans
   `notes` (nom → note, avec `parQui` et `le`). Chaque écriture repart du
   document et ne touche que sa moitié (`avecLaListe`, `avecLaNote`) ; chaque
   lecteur reconnaît les trois formes, l'ancien registre compris
   (`modelesMetaLus`) ; et la base garde l'autre moitié quand un écrivain
   d'avant l'oublie (0236). Ce bloc est RECOPIÉ dans `demande-submit` (la
   bascule de l'attente) et `modeles-meta` (la relecture) :
   `node scripts/terminer-copie-serveur.mjs`, comparé par
   verifie-les-douze-lunes (R8). NE RIEN RETOUCHER DANS LES COPIES. */

/* ⟨modeles-meta⟩ */
/** L'état d'un modèle dans les mots de la Maison. « À déposer » : rien n'en est su. */
export type EtatDuModeleMeta = 'a-deposer' | 'depose' | 'approuve' | 'refuse';
export const ETATS_DU_MODELE: readonly EtatDuModeleMeta[] = ['a-deposer', 'depose', 'approuve', 'refuse'];
/** Une note de la direction, le jour où elle a lu l'état chez Meta. */
export type NoteDuModele = { etat: EtatDuModeleMeta; le?: string; parQui?: string };
/** Un modèle tel que Meta le rend à « Relire chez Meta ». `etat` : le statut de Meta, en capitales. */
export type ModeleLuChezMeta = { id?: string; nom: string; etat: string; categorie?: string; langue?: string; qualite?: string; motifDuRefus?: string };
/** Le document tel qu'il s'écrit désormais : la liste de Meta ET les notes. */
export type DocumentDesModelesMeta = {
  modeles?: ModeleLuChezMeta[]; lusLe?: string; version?: string;
  notes?: Record<string, NoteDuModele>; parQui?: string; le?: string;
};
/** Le document lu, quelle que soit sa forme. */
export type ModelesMetaLus = {
  liste: ModeleLuChezMeta[]; lusLe?: string; version?: string;
  notes: Record<string, NoteDuModele>; parQui?: string; le?: string;
};

const NOM_DE_MODELE_META = /^[a-z0-9_]{1,512}$/;
const estUnEtatNote = (x: unknown): x is EtatDuModeleMeta => typeof x === 'string' && (ETATS_DU_MODELE as readonly string[]).includes(x);

/** Des notes, lues sans confiance : un nom qui n'est pas un nom Meta, ou un état inconnu, tombent. */
function notesLues(brut: unknown): Record<string, NoteDuModele> {
  const out: Record<string, NoteDuModele> = {};
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return out;
  for (const [nom, n] of Object.entries(brut as Record<string, unknown>)) {
    if (!NOM_DE_MODELE_META.test(nom) || !n || typeof n !== 'object') continue;
    const note = n as Record<string, unknown>;
    if (!estUnEtatNote(note.etat) || note.etat === 'a-deposer') continue;
    out[nom] = {
      etat: note.etat,
      ...(typeof note.le === 'string' ? { le: note.le } : {}),
      ...(typeof note.parQui === 'string' ? { parQui: note.parQui } : {}),
    };
  }
  return out;
}

/** La liste de Meta, lue sans confiance : chaque ligne garde ce qu'elle porte, son nom et son statut relus. */
function listeLue(brut: unknown): ModeleLuChezMeta[] {
  if (!Array.isArray(brut)) return [];
  const out: ModeleLuChezMeta[] = [];
  for (const m of brut) {
    if (!m || typeof m !== 'object') continue;
    const x = m as Record<string, unknown>;
    const nom = typeof x.nom === 'string' ? x.nom.trim() : '';
    if (nom) out.push({ ...(x as Partial<ModeleLuChezMeta>), nom, etat: String(x.etat ?? '').toUpperCase() });
  }
  return out;
}

/** LES TROIS FORMES, LUES ENSEMBLE : `modeles` en tableau (la liste de Meta),
    `notes` (les notes), et `modeles` en objet (le registre d'avant le 18
    novembre 2026, qui compte comme des notes). */
export function modelesMetaLus(brut: unknown): ModelesMetaLus {
  const r = brut && typeof brut === 'object' && !Array.isArray(brut) ? (brut as Record<string, unknown>) : {};
  return {
    liste: listeLue(r.modeles),
    ...(typeof r.lusLe === 'string' ? { lusLe: r.lusLe } : {}),
    ...(typeof r.version === 'string' ? { version: r.version } : {}),
    notes: { ...notesLues(r.modeles), ...notesLues(r.notes) },
    ...(typeof r.parQui === 'string' ? { parQui: r.parQui } : {}),
    ...(typeof r.le === 'string' ? { le: r.le } : {}),
  };
}

/** Le statut de Meta dit par la Maison. En pause, en revue, en appel : il ne
    part pas encore (ou plus), c'est « déposé ». */
export function etatDitParMeta(statut: string): EtatDuModeleMeta {
  const s = String(statut).toUpperCase();
  if (s === 'APPROVED') return 'approuve';
  if (s === 'REJECTED' || s === 'DISABLED' || s === 'DELETED' || s === 'PENDING_DELETION' || s === 'ARCHIVED') return 'refuse';
  return 'depose';
}

/** L'ÉTAT D'UN MODÈLE : ce que Meta a dit à la dernière relecture, ou ce que
    la direction a noté ; les deux connus, le plus récent dit vrai (une note
    sans date cède à la liste). Ni l'un ni l'autre : « à déposer ». Un nom
    rendu dans plusieurs langues est approuvé si l'une l'est. */
export function etatDuModeleMeta(lu: ModelesMetaLus, nom: string): EtatDuModeleMeta {
  const chezMeta = lu.liste.filter((m) => m.nom === nom).map((m) => etatDitParMeta(m.etat));
  const deMeta: EtatDuModeleMeta | null = chezMeta.length === 0 ? null
    : chezMeta.includes('approuve') ? 'approuve' : chezMeta.includes('depose') ? 'depose' : 'refuse';
  const note = lu.notes[nom];
  if (!deMeta) return note?.etat ?? 'a-deposer';
  if (!note) return deMeta;
  const noteLe = Date.parse(note.le ?? '');
  const luLe = Date.parse(lu.lusLe ?? '');
  return Number.isFinite(noteLe) && (!Number.isFinite(luLe) || noteLe > luLe) ? note.etat : deMeta;
}

/** Le modèle peut-il partir ? Le document brut, tel que la base le rend. */
export const estApprouveChezMeta = (brut: unknown, nom: string): boolean =>
  etatDuModeleMeta(modelesMetaLus(brut), nom) === 'approuve';

/** Chaque modèle connu (de la liste ou des notes) et son état ; « à déposer » n'y figure pas. */
export function etatsConnus(lu: ModelesMetaLus): Partial<Record<string, 'depose' | 'approuve' | 'refuse'>> {
  const out: Partial<Record<string, 'depose' | 'approuve' | 'refuse'>> = {};
  for (const nom of new Set([...lu.liste.map((m) => m.nom), ...Object.keys(lu.notes)])) {
    const e = etatDuModeleMeta(lu, nom);
    if (e !== 'a-deposer') out[nom] = e;
  }
  return out;
}

/** LA RELECTURE CHEZ META S'AJOUTE AU DOCUMENT : la liste neuve, les notes gardées. */
export function avecLaListe(brut: unknown, liste: readonly ModeleLuChezMeta[], lusLe: string, version: string): DocumentDesModelesMeta {
  const lu = modelesMetaLus(brut);
  return {
    modeles: [...liste], lusLe, version,
    notes: lu.notes,
    ...(lu.parQui ? { parQui: lu.parQui } : {}),
    ...(lu.le ? { le: lu.le } : {}),
  };
}

/** UNE NOTE S'AJOUTE AU DOCUMENT : la liste de Meta gardée, les autres notes
    aussi. « À déposer » retire la note de ce modèle, et rien d'autre. */
export function avecLaNote(brut: unknown, nom: string, etat: EtatDuModeleMeta, parQui: string, le: string): DocumentDesModelesMeta {
  const lu = modelesMetaLus(brut);
  const notes = { ...lu.notes };
  if (etat === 'a-deposer') delete notes[nom];
  else notes[nom] = { etat, le, parQui };
  return {
    ...(lu.liste.length > 0 ? { modeles: lu.liste } : {}),
    ...(lu.lusLe ? { lusLe: lu.lusLe } : {}),
    ...(lu.version ? { version: lu.version } : {}),
    notes, parQui, le,
  };
}
/* ⟨/modeles-meta⟩ */

/** Un nom de modèle Meta (minuscules, chiffres, soulignés). */
export const estUnNomDeModeleMeta = (nom: string): boolean => NOM_DE_MODELE_META.test(nom);
