import { createStore, useStore } from './store';
import { bindDocument } from './sync';

/* ══ LE REGISTRE DES MODÈLES META · 27 octobre 2026, lot 3 ══════════════════
   Spécification de l'Assistant Maison (§5.5, « Qui écrit seul » et « Ses
   modèles chez Meta ») : l'état d'un modèle WhatsApp (déposé, approuvé,
   refusé) n'existait nulle part dans le dépôt ; Meta ne le dit à aucune
   fonction. La direction le NOTE ici, à la main, le jour où elle le lit dans
   le gestionnaire WhatsApp. Un modèle jamais noté est « à déposer » : c'est
   la vérité par défaut, jamais une promesse.

   Un seul document, `mnd_modeles_meta`, lié comme les autres réglages de la
   Maison (`bindDocument`) : chaque poste le lit, la direction l'écrit. Pour
   les huit modèles de l'Assistant, « approuvé » a une conséquence de plus :
   `mnd_gerard.approuves` (gerard.ts, `marqueLeModeleApprouve`) fait partir
   le modèle seul au passage du matin. L'écran qui note l'état écrit les
   deux, pour qu'une seule vérité gouverne le départ. */

export type EtatDuModeleMeta = 'a-deposer' | 'depose' | 'approuve' | 'refuse';
export const ETATS_DU_MODELE: readonly EtatDuModeleMeta[] = ['a-deposer', 'depose', 'approuve', 'refuse'];
export const ETAT_DU_MODELE_DIT: Record<EtatDuModeleMeta, string> = {
  'a-deposer': 'à déposer', depose: 'déposé', approuve: 'approuvé', refuse: 'refusé',
};

export type NoteDuModele = { etat: EtatDuModeleMeta; le?: string; parQui?: string };
export type RegistreDesModelesMeta = {
  /** Par nom Meta (`assistant_maison_garder`, `confirmation_rdv`…). Absent : à déposer. */
  modeles: Record<string, NoteDuModele>;
  parQui?: string;
  le?: string;
};

export const REGISTRE_VIDE: RegistreDesModelesMeta = { modeles: {} };

export const modelesMetaStore = createStore<RegistreDesModelesMeta>('mnd_modeles_meta', REGISTRE_VIDE);
export const useModelesMeta = () => useStore(modelesMetaStore);
bindDocument(modelesMetaStore, 'mnd_modeles_meta');

const estUnEtat = (x: unknown): x is EtatDuModeleMeta => typeof x === 'string' && (ETATS_DU_MODELE as readonly string[]).includes(x);
const NOM_META = /^[a-z0-9_]{1,120}$/;

/** Le registre lu sans confiance : un état inconnu ou un nom qui n'est pas
    un nom de modèle Meta tombent ; le reste se garde tel quel. */
export function registreLu(brut: unknown): RegistreDesModelesMeta {
  const r = brut && typeof brut === 'object' ? (brut as Record<string, unknown>) : {};
  const bruts = r.modeles && typeof r.modeles === 'object' ? (r.modeles as Record<string, unknown>) : {};
  const modeles: Record<string, NoteDuModele> = {};
  for (const [nom, n] of Object.entries(bruts)) {
    if (!NOM_META.test(nom) || !n || typeof n !== 'object') continue;
    const note = n as Record<string, unknown>;
    if (!estUnEtat(note.etat)) continue;
    modeles[nom] = {
      etat: note.etat,
      ...(typeof note.le === 'string' ? { le: note.le } : {}),
      ...(typeof note.parQui === 'string' ? { parQui: note.parQui } : {}),
    };
  }
  return { modeles, ...(typeof r.parQui === 'string' ? { parQui: r.parQui } : {}), ...(typeof r.le === 'string' ? { le: r.le } : {}) };
}

/** L'état d'un modèle : noté, sinon « à déposer ». */
export const etatDuModele = (registre: RegistreDesModelesMeta, nom: string): EtatDuModeleMeta =>
  registre.modeles[nom]?.etat ?? 'a-deposer';

/** Ce que le compte (`quiEcritSeul`, rapporte-pur) lit : nom → état noté.
    Un « à déposer » n'y figure pas, le compte le tient pour non approuvé. */
export function etatsNotes(registre: RegistreDesModelesMeta): Partial<Record<string, 'depose' | 'approuve' | 'refuse'>> {
  const out: Partial<Record<string, 'depose' | 'approuve' | 'refuse'>> = {};
  for (const [nom, n] of Object.entries(registre.modeles)) if (n.etat !== 'a-deposer') out[nom] = n.etat;
  return out;
}

/** La direction note l'état d'un modèle, le jour où elle le lit chez Meta. « À déposer » efface la note. */
export function noteLeModele(nom: string, etat: EtatDuModeleMeta, parQui: string): void {
  if (!NOM_META.test(nom)) return;
  const le = new Date().toISOString();
  modelesMetaStore.set((prev) => {
    const r = registreLu(prev);
    const modeles = { ...r.modeles };
    if (etat === 'a-deposer') delete modeles[nom]; else modeles[nom] = { etat, le, parQui };
    return { modeles, parQui, le };
  });
}
