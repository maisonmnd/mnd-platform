import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { CLE_DES_AVIS_DE_GOOGLE, defautDeLaReponse, type AvisAApparier, type AvisDeGoogle } from './avis-google-pont-pur';

/* ══ LE PONT DES AVIS, CÔTÉ TRÔNE — 25 octobre 2026 ═════════════════════
   Les règles vivent dans `avis-google-pont-pur` ; ici, trois lectures et un
   geste : l'état du pont (la fonction le dit au GET), les avis que Make a
   apportés (`mnd_avis_google_tous`), et « Publier sur Google », qui ne part
   QUE d'un toucher de la personne, après lecture. Rien ici ne publie seul :
   ni la préparation des brouillons, ni l'ouverture de l'onglet. */

const FONCTION = 'avis-google-pont';

export type EtatDuPont = { version: string; recoit: boolean; publie: boolean };

/* La version et l'état, lus une fois par page : un GET rend 405 avec eux. */
let etatConnu: Promise<EtatDuPont | null> | null = null;
function etatDuPont(): Promise<EtatDuPont | null> {
  if (etatConnu) return etatConnu;
  etatConnu = (async () => {
    try {
      const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');
      const cle = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      if (!supabase || !url || !cle) return null;
      const r = await fetch(`${url}/functions/v1/${FONCTION}`, { headers: { apikey: cle, authorization: `Bearer ${cle}` } });
      const j = await r.json().catch(() => ({})) as Partial<EtatDuPont>;
      return typeof j.version === 'string' ? { version: j.version, recoit: j.recoit === true, publie: j.publie === true } : null;
    } catch { return null; }
  })();
  return etatConnu;
}

/** L'état du pont : null tant qu'on ne sait pas, ou si la fonction n'est pas posée. */
export function useEtatDuPont(): EtatDuPont | null {
  const [etat, setEtat] = useState<EtatDuPont | null>(null);
  useEffect(() => {
    let vivant = true;
    void etatDuPont().then((e) => { if (vivant) setEtat(e); });
    return () => { vivant = false; };
  }, []);
  return etat;
}

/** LES AVIS QUE MAKE A APPORTÉS, lus à l'ouverture de l'écran (l'équipe
    seule peut lire ce document). Null tant que rien n'est arrivé. */
export function useAvisDeGoogle(): AvisDeGoogle[] | null {
  const [avis, setAvis] = useState<AvisDeGoogle[] | null>(null);
  useEffect(() => {
    let vivant = true;
    if (!supabase) return;
    void supabase.from('documents').select('data').eq('key', CLE_DES_AVIS_DE_GOOGLE).maybeSingle()
      .then(({ data }) => {
        const tous = (data as { data?: { avis?: Record<string, AvisDeGoogle> } } | null)?.data?.avis;
        if (vivant && tous && typeof tous === 'object') setAvis(Object.values(tous).filter((a) => a && typeof a.name === 'string'));
      });
    return () => { vivant = false; };
  }, []);
  return avis;
}

export type IssueDeLaPublication = { ok: true; le: string } | { ok: false; erreur: string; message: string };

/** PUBLIER SUR GOOGLE, au toucher : la fonction retrouve l'avis chez Google,
    Make pose la réponse, Google confirme. Une réponse refusée ici ne part pas. */
export async function publieSurGoogle(avis: AvisAApparier, reponse: string): Promise<IssueDeLaPublication> {
  const defaut = defautDeLaReponse(reponse);
  if (defaut) return { ok: false, erreur: 'format', message: `Rien n’est parti : ${defaut}.` };
  const sb = supabase;
  if (!sb) return { ok: false, erreur: 'hors-ligne', message: 'Le Trône est hors ligne : rien n’est parti.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, erreur: 'reseau', message: 'Pas de réseau : rien n’est parti.' };
  const corps = {
    action: 'publier',
    avis: { auteur: avis.auteur, texte: avis.texte, ...(avis.texteOriginal ? { texteOriginal: avis.texteOriginal } : {}), ...(avis.publieLe ? { publieLe: avis.publieLe } : {}) },
    reponse: reponse.trim(),
  };
  try {
    const { data, error } = await sb.functions.invoke(FONCTION, { body: corps });
    if (error) {
      const ctx = (error as { context?: Response })?.context;
      const lu = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) as { erreur?: string; message?: string } | null : null;
      if (lu?.message) return { ok: false, erreur: lu.erreur ?? 'pont', message: lu.message };
      return { ok: false, erreur: 'reseau', message: `Le pont n’a pas répondu (${error.message}). Regardez l’avis sur Google avant de recommencer.` };
    }
    const r = (data ?? {}) as { ok?: boolean; le?: string; erreur?: string; message?: string };
    if (r.ok === true) return { ok: true, le: typeof r.le === 'string' ? r.le : new Date().toISOString() };
    return { ok: false, erreur: r.erreur ?? 'pont', message: r.message ?? 'Le pont n’a rien confirmé. Regardez l’avis sur Google avant de recommencer.' };
  } catch (e) {
    return { ok: false, erreur: 'reseau', message: `Le pont n’a pas répondu (${String((e as Error)?.message ?? e)}). Regardez l’avis sur Google avant de recommencer.` };
  }
}
