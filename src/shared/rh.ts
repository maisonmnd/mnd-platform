import { createStore, useStore, uid } from './store';
import { supabase } from './supabase';
import { bindCollection, bindDocument } from './sync';
import { allege, copieEnMemoire, ESSAIS_D_ENVOI } from './papiers';
import { TAILLE_MAX, typeDuFichier } from './papiers-pur';
import type { Fichier, LigneRh, Planning, ReglagesRh } from './rh-pur';

/* ══ LA DIRECTION DES RESSOURCES HUMAINES, CÔTÉ TRÔNE — 14 octobre 2026 ══

   Les magasins et les écritures. La base (0130) décide de qui lit et écrit :
   le souverain tient tout ; chacune lit ce qui la concerne quand c'est
   partagé avec elle. Les règles vivent dans `rh-pur.ts`. */

const enListe = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]).filter((x) => x && typeof x === 'object') : []);
const maintenant = (): string => new Date().toISOString();

/* ── Le registre (table `rh`) ── */
export const registreRhStore = createStore<LigneRh[]>('mnd_rh', []);
bindCollection(registreRhStore, 'rh');
export const useRegistreRh = (): LigneRh[] => enListe<LigneRh>(useStore(registreRhStore)[0]);

/* ── Le planning, les réglages, les listes d'arrivée (documents écrits par
      le souverain, lus du personnel : 0130). ── */
export const planningStore = createStore<Planning>('mnd_planning', {});
bindDocument(planningStore, 'mnd_planning');
export const usePlanning = () => useStore(planningStore);
export const reglagesRhStore = createStore<ReglagesRh>('mnd_rh_reglages', {});
bindDocument(reglagesRhStore, 'mnd_rh_reglages');
export const useReglagesRh = () => useStore(reglagesRhStore);
export const modelesDArriveeStore = createStore<Record<string, string[]>>('mnd_integration', {});
bindDocument(modelesDArriveeStore, 'mnd_integration');
export const useModelesDArrivee = () => useStore(modelesDArriveeStore);

/* ── Les bulletins (table `bulletins`) : publiés au passage « payé » ── */
export type BulletinPublie = {
  id: string;
  branchId: string;
  runId: string;
  period: string;
  employeeId: string;
  name: string;
  netXof: number;
  publieLe: string;
  /** Ce que bulletin.html lit pour se remplir (voir `BulletinLink`, payroll.ts). */
  lien: Record<string, string | number | boolean | undefined>;
};
export const bulletinsStore = createStore<BulletinPublie[]>('mnd_bulletins', []);
bindCollection(bulletinsStore, 'bulletins');
export const useBulletins = (): BulletinPublie[] => enListe<BulletinPublie>(useStore(bulletinsStore)[0]);

/* ── Écrire au registre ── */
export function nouvelleLigneRh<L extends LigneRh>(o: Omit<L, 'id' | 'creeLe' | 'creePar'> & { par: string }): L {
  const { par, ...reste } = o as Omit<L, 'id' | 'creeLe' | 'creePar'> & { par: string };
  const prefixe = String((reste as { genre: string }).genre).slice(0, 3);
  const l = { id: `rh-${prefixe}-${uid()}`, creeLe: maintenant(), creePar: par, ...reste } as unknown as L;
  registreRhStore.set((prev) => [l, ...enListe<LigneRh>(prev)]);
  return l;
}
export function retoucheRh<L extends LigneRh>(l: L, patch: Partial<L>): L {
  const neuf = { ...l, ...patch, majLe: maintenant() } as L;
  registreRhStore.set((prev) => enListe<LigneRh>(prev).map((x) => (x.id === l.id ? neuf : x)));
  return neuf;
}
export const effaceLaLigneRh = (l: LigneRh): void => registreRhStore.set((prev) => enListe<LigneRh>(prev).filter((x) => x.id !== l.id));

/* ── Les pièces du dossier (compartiment privé `rh`, 0130) ──
   `<fiche>/direction/…` : le souverain seul ; `<fiche>/partage/…` : elle aussi. */
const COMPARTIMENT = 'rh';
const dit = (m: string): string =>
  /bucket not found|not found/i.test(m) ? 'Le compartiment des dossiers n’existe pas encore : la migration 0130 n’a pas été passée.'
    : /row-level security|permission|unauthorized|42501|403/i.test(m) ? 'Seule la direction dépose une pièce au dossier.'
      : /fetch|network|load failed|timed out|aborted/i.test(m) ? `La pièce n’a pas pu partir (le réseau a coupé). Réessayez. Détail : ${m}`
        : m;

export async function prendsLaPiece(f: File): Promise<{ fichier?: File; erreur?: string }> {
  return copieEnMemoire(f);
}
export async function deposeLaPiece(staffId: string, pieceId: string, partage: boolean, f: File): Promise<{ fichier?: Fichier; erreur?: string }> {
  if (!supabase) return { erreur: 'Pas de connexion à la Maison.' };
  if (!typeDuFichier(f.name, f.type)) return { erreur: `« ${f.name} » : seuls les PDF et les photos sont acceptés.` };
  let corps: Blob;
  try { corps = await allege(f); } catch { return { erreur: `« ${f.name} » : cette photo ne s’ouvre pas sur ce téléphone.` }; }
  if (corps.size > TAILLE_MAX) return { erreur: `« ${f.name} » dépasse 10 Mo.` };
  const type = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(corps.type) ? corps.type : 'image/jpeg';
  const chemin = `${staffId}/${partage ? 'partage' : 'direction'}/${pieceId}-${Date.now()}.${type === 'application/pdf' ? 'pdf' : 'jpg'}`;
  let derniere = '';
  for (let essai = 1; essai <= ESSAIS_D_ENVOI; essai += 1) {
    const { error } = await supabase.storage.from(COMPARTIMENT).upload(chemin, corps, { contentType: type, upsert: true });
    if (!error) { derniere = ''; break; }
    derniere = error.message;
    if (!/fetch|network|load failed|timed out|aborted/i.test(derniere)) break;
    await new Promise((r) => setTimeout(r, 1500 * essai));
  }
  if (derniere) return { erreur: `« ${f.name} » : ${dit(derniere)}` };
  return { fichier: { chemin, nom: f.name, type, taille: corps.size } };
}
/** Un lien d'une minute : une capture du lien ne mène nulle part. */
export async function lienDeLaPiece(chemin: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.storage.from(COMPARTIMENT).createSignedUrl(chemin, 60);
  return data?.signedUrl ?? null;
}
export async function retireLaPiece(chemin: string): Promise<void> {
  if (!supabase) return;
  await supabase.storage.from(COMPARTIMENT).remove([chemin]);
}
