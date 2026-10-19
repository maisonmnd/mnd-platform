import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import {
  CLE_DE_LA_TABLE_DU_DIAGNOSTIC, COFFRE_DES_PHOTOS_DU_DIAGNOSTIC, GARDE_DES_PHOTOS_JOURS, TABLE_DES_DIAGNOSTICS,
  ecarte, relecture, type Lecture, type Recommandation,
} from './ia-diagnostic-pur';

/* ══ LES DIAGNOSTICS AU TRÔNE — 19 octobre 2026 ══════════════════════════
   Les règles vivent dans `ia-diagnostic-pur` ; ici, la lecture, l'écoute
   et les gestes de la relecture.

   L'ÉCOUTE EST DIRECTE, PAS PAR LA SYNCHRO DES MAGASINS (comme les
   discussions du site) : un diagnostic est écrit par la fonction
   `diagnostic-locks`, jamais poussé depuis un magasin ; le Trône le lit puis
   l'écoute en temps réel, et la lecture d'une cliente arrive à l'écran à
   l'instant. Le personnel lit et relit ; la base refuse toute création par
   le navigateur (0137).

   LA TABLE « observation → rituel → produit » NE SE LIE PAS AU MAGASIN DES
   DOCUMENTS : la synchro amorcerait le document vide au premier poste venu,
   et la base (0137) refuse son écriture hors direction. Elle se lit et
   s'écrit à la main, depuis Paramètres, par la direction. */

export type DonneesDuDiagnostic = {
  appel?: string; consultationId?: string | null; consentementLe?: string; photos?: string[];
  lecture?: Lecture | null; recommandation?: Recommandation | null; texte?: string; sansLecture?: boolean;
  modele?: string | null; coutUsd?: number; correction?: string; photosEffaceesLe?: string;
};
export type DiagnosticAuTrone = {
  id: string; branch_id?: string | null; client_id?: string | null; source: 'consultation' | 'couronne';
  data: DonneesDuDiagnostic; etat: 'a-relire' | 'relu' | 'ferme'; cree_le: string;
  relu_par?: string | null; relu_le?: string | null;
};

type Etat = { diagnostics: DiagnosticAuTrone[]; pret: boolean; erreur: string | null };
let etat: Etat = { diagnostics: [], pret: false, erreur: null };
const abonnes = new Set<() => void>();
const pose = (p: Partial<Etat>) => { etat = { ...etat, ...p }; for (const f of abonnes) f(); };
const abonne = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };
const lis = () => etat;

const trie = (ds: DiagnosticAuTrone[]): DiagnosticAuTrone[] => [...ds].sort((a, b) => Date.parse(b.cree_le) - Date.parse(a.cree_le));
function poseLeDiagnostic(d: DiagnosticAuTrone | null | undefined): void {
  if (!d?.id) return;
  const i = etat.diagnostics.findIndex((x) => x.id === d.id);
  pose({ diagnostics: trie(i >= 0 ? etat.diagnostics.map((x, k) => (k === i ? { ...x, ...d } : x)) : [d, ...etat.diagnostics]) });
}

/** Ce que l'écran dit quand la base refuse : la table manque tant que 0137
    n'est pas collée. */
export const motDeLErreur = (message: string, code?: string): string =>
  (code === 'PGRST205' || code === '42P01' || /does not exist|schema cache/i.test(message)
    ? 'Les diagnostics photo ne sont pas encore en place : la migration 0137 attend d’être collée dans Supabase.'
    : `Les diagnostics ne se lisent pas : ${message}`);

let ecoute = false;
/** Lit (90 jours, la garde des photos) et écoute les diagnostics (idempotent). */
export function ecouteLesDiagnostics(): void {
  const sb = supabase;
  if (ecoute) return;
  if (!sb) { pose({ pret: true, erreur: 'Le Trône est hors ligne : les diagnostics se lisent avec le réseau.' }); return; }
  ecoute = true;
  const depuis = new Date(Date.now() - GARDE_DES_PHOTOS_JOURS * 86_400_000).toISOString();
  void sb.from(TABLE_DES_DIAGNOSTICS).select('*').gte('cree_le', depuis).order('cree_le', { ascending: false }).limit(300)
    .then(({ data, error }) => {
      if (error) { ecoute = false; pose({ pret: true, erreur: motDeLErreur(error.message, error.code) }); return; }
      const deja = new Map(etat.diagnostics.map((d) => [d.id, d]));
      const lus = ((data ?? []) as DiagnosticAuTrone[]).filter((d) => !deja.has(d.id));
      pose({ diagnostics: trie([...deja.values(), ...lus]), pret: true, erreur: null });
    });
  sb.channel('diagnostics-photo')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE_DES_DIAGNOSTICS }, (brut: unknown) => {
      const p = brut as { eventType?: string; new?: DiagnosticAuTrone; old?: { id?: string } };
      if (p.eventType === 'DELETE') { pose({ diagnostics: etat.diagnostics.filter((d) => d.id !== p.old?.id) }); return; }
      poseLeDiagnostic(p.new);
    })
    .subscribe();
}

export function useDiagnostics(actif = true): Etat {
  useEffect(() => { if (actif) ecouteLesDiagnostics(); }, [actif]);
  return useSyncExternalStore(abonne, lis, lis);
}

/* ── LES GESTES DE LA RELECTURE ─────────────────────────────────────────
   Chacun porte un « oui » : un bouton touché, jamais un effet de bord. */

/** Confirmer la lecture, avec ou sans mot du maître. `null` : c'est inscrit. */
export async function confirmeLaLecture(
  d: DiagnosticAuTrone,
  o: { correction?: string; rituelsRetires?: string[]; produitsRetires?: string[] },
  uid: string,
): Promise<string | null> {
  const sb = supabase;
  if (!sb) return 'Le Trône est hors ligne.';
  const champs = relecture(d.data, { ...o, par: uid, leIso: new Date().toISOString() });
  const { error } = await sb.from(TABLE_DES_DIAGNOSTICS).update(champs).eq('id', d.id);
  if (error) return error.message;
  poseLeDiagnostic({ ...d, ...champs });
  return null;
}

/** Écarter une lecture qui ne sert pas. */
export async function ecarteLaLecture(d: DiagnosticAuTrone, uid: string): Promise<string | null> {
  const sb = supabase;
  if (!sb) return 'Le Trône est hors ligne.';
  const champs = ecarte(uid, new Date().toISOString());
  const { error } = await sb.from(TABLE_DES_DIAGNOSTICS).update(champs).eq('id', d.id);
  if (error) return error.message;
  poseLeDiagnostic({ ...d, ...champs });
  return null;
}

/** Une photo du coffre privé, par une adresse signée de dix minutes,
    demandée au moment de regarder, jamais gardée. */
export async function adresseDeLaPhoto(chemin: string): Promise<string | null> {
  const sb = supabase;
  if (!sb || !chemin) return null;
  const { data, error } = await sb.storage.from(COFFRE_DES_PHOTOS_DU_DIAGNOSTIC).createSignedUrl(chemin, 600);
  return error || !data?.signedUrl ? null : data.signedUrl;
}

/* ── LA TABLE ET L'INTERRUPTEUR, LUS ET ÉCRITS PAR LA DIRECTION ──────── */

/** Le document de la table tel qu'il est en base (`null` : absent, la
    fonction prend la table par défaut). */
export async function lisLaTableDuDiagnostic(): Promise<{ doc: unknown; erreur: string | null }> {
  const sb = supabase;
  if (!sb) return { doc: null, erreur: 'Le Trône est hors ligne.' };
  const { data, error } = await sb.from('documents').select('data').eq('key', CLE_DE_LA_TABLE_DU_DIAGNOSTIC).maybeSingle();
  if (error) return { doc: null, erreur: error.message };
  return { doc: (data as { data?: unknown } | null)?.data ?? null, erreur: null };
}

/** Écrire la table (la base refuse hors direction, 0137). */
export async function ecrisLaTableDuDiagnostic(doc: unknown): Promise<string | null> {
  const sb = supabase;
  if (!sb) return 'Le Trône est hors ligne.';
  const { error } = await sb.from('documents').upsert({ key: CLE_DE_LA_TABLE_DU_DIAGNOSTIC, data: doc });
  return error ? (/42501|direction/i.test(`${error.code} ${error.message}`) ? 'La table du diagnostic appartient à la direction.' : error.message) : null;
}
