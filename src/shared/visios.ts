import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import {
  REGLAGES_DE_DEPART, reglagesSurs, resumeSur,
  type ReglagesDeLaVisio, type ResumeDeLaVisio, type StatutDeLaVisio,
} from './visio-pur';

/* ══ LES VISIOS, CÔTÉ TRÔNE — 13 novembre 2026 (la Consultation, lot 3) ════
   Deux sources :
     · le document `mnd_visio` (les jours et les quarts d'heure ouverts),
       écrit par la direction seule (0209), amorcé par le premier poste ;
     · la table `visios` (0209), que la fonction `visio-salle` remplit à
       chaque réservation. L'équipe la lit et y écrit l'état et le résumé ;
       elle ne crée jamais de ligne (c'est la fonction, avec son jeton).
   La table n'est pas dans le magasin : la file B la relit toutes les trente
   secondes, et à chaque geste. */

export const visioStore = createStore<ReglagesDeLaVisio>('mnd_visio', REGLAGES_DE_DEPART());
bindDocument(visioStore, 'mnd_visio');

export function useReglagesDeLaVisio(): [ReglagesDeLaVisio, (fn: (r: ReglagesDeLaVisio) => ReglagesDeLaVisio, par?: string) => void] {
  const [brut] = useStore(visioStore);
  const r = useMemo(() => reglagesSurs(brut), [brut]);
  const ecris = (fn: (r: ReglagesDeLaVisio) => ReglagesDeLaVisio, par?: string) =>
    visioStore.set((avant) => ({ ...fn(reglagesSurs(avant)), modifieLe: new Date().toISOString(), ...(par ? { modifiePar: par } : {}) }));
  return [r, ecris];
}

export type Visio = {
  id: string;
  consultationId: string | null;
  debut: string;
  fin: string;
  nom: string;
  telephone: string;
  statut: StatutDeLaVisio;
  resume: ResumeDeLaVisio | null;
};

const versVisio = (l: Record<string, unknown>): Visio => ({
  id: String(l.id),
  consultationId: typeof l.consultation_id === 'string' ? l.consultation_id : null,
  debut: String(l.debut),
  fin: String(l.fin),
  nom: String(l.nom ?? ''),
  telephone: String(l.telephone ?? ''),
  statut: (String(l.statut) as StatutDeLaVisio),
  resume: resumeSur(l.resume),
});

/** Les visios d'hier à dans quinze jours, relues toutes les trente secondes. `absente` : la table n'existe pas encore (0209). */
export function useVisios(): { visios: Visio[]; absente: boolean; relis: () => Promise<void> } {
  const [visios, setVisios] = useState<Visio[]>([]);
  const [absente, setAbsente] = useState(false);
  const relis = useCallback(async () => {
    if (!supabase) return;
    const depuis = new Date(Date.now() - 86_400_000).toISOString();
    const jusque = new Date(Date.now() + 15 * 86_400_000).toISOString();
    const { data, error } = await supabase.from('visios')
      .select('id, consultation_id, debut, fin, nom, telephone, statut, resume')
      .gte('debut', depuis).lte('debut', jusque).order('debut', { ascending: true }).limit(200);
    if (error) { setAbsente(/does not exist|relation|schema cache/i.test(error.message)); return; }
    setAbsente(false);
    setVisios(((data ?? []) as Record<string, unknown>[]).map(versVisio));
  }, []);
  useEffect(() => {
    void relis();
    const t = window.setInterval(() => { void relis(); }, 30_000);
    return () => window.clearInterval(t);
  }, [relis]);
  return { visios, absente, relis };
}

/** L'état d'une visio (tenue, manquée, annulée), et le résumé quand il y en a un. */
export async function ecrisLaVisio(id: string, x: { statut?: StatutDeLaVisio; resume?: ResumeDeLaVisio }): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('visios').update({
    ...(x.statut ? { statut: x.statut } : {}),
    ...(x.resume ? { resume: x.resume } : {}),
    maj_le: new Date().toISOString(),
  }).eq('id', id);
  return !error;
}

/** L'entrée de la Maison dans la salle (propriétaire), par la session de l'équipe. */
export async function entreeDeLaMaison(id: string): Promise<{ url?: string; motif?: string; maintenant?: string }> {
  if (!supabase) return { motif: 'hors-ligne' };
  const { data, error } = await supabase.functions.invoke('visio-salle', { body: { geste: 'entrer-maison', id } });
  if (!error) {
    const d = (data ?? {}) as { ok?: boolean; url?: string; motif?: string; maintenant?: string };
    return d.ok && d.url ? { url: d.url, maintenant: d.maintenant } : { motif: d.motif ?? 'erreur', maintenant: d.maintenant };
  }
  try {
    const r = (error as { context?: Response }).context;
    const d = r && typeof r.json === 'function' ? ((await r.json()) as { motif?: string; maintenant?: string }) : null;
    if (d?.motif) return { motif: d.motif, maintenant: d.maintenant };
  } catch { /* corps illisible */ }
  return { motif: 'erreur' };
}

/** La clé du service de visio est-elle posée ? (la fonction le dit sans la montrer) */
export async function etatDuService(): Promise<{ joignable: boolean; cle: boolean; actif: boolean }> {
  if (!supabase) return { joignable: false, cle: false, actif: false };
  const { data, error } = await supabase.functions.invoke('visio-salle', { body: { geste: 'creneaux' } });
  const d = (data ?? {}) as { ok?: boolean; cle?: boolean; actif?: boolean };
  if (error || !d.ok) return { joignable: false, cle: false, actif: false };
  return { joignable: true, cle: d.cle === true, actif: d.actif === true };
}

/* ── LES LOCKS TÉMOINS (compartiment `temoins`, 0209) ───────────────── */

export const COMPARTIMENT_DES_TEMOINS = 'temoins';

/** Dépose une photo de témoin ; rend son chemin. */
export async function deposeUnTemoin(consultationId: string, f: File): Promise<string | null> {
  if (!supabase) return null;
  const ext = /png$/i.test(f.type) ? 'png' : /webp$/i.test(f.type) ? 'webp' : 'jpg';
  const chemin = `${consultationId}/${Date.now().toString(36)}.${ext}`;
  const { error } = await supabase.storage.from(COMPARTIMENT_DES_TEMOINS).upload(chemin, f, { contentType: f.type || 'image/jpeg', upsert: false });
  return error ? null : chemin;
}

/** Une adresse de lecture d'un témoin, valable une heure. */
export async function voirUnTemoin(chemin: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(COMPARTIMENT_DES_TEMOINS).createSignedUrl(chemin, 3600);
  return error ? null : data?.signedUrl ?? null;
}
