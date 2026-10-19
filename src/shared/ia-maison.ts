import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { defautDeLaDemande, saitIaMaison, type DemandeIa, type ReponseIa } from './ia-maison-pur';

/* ══ DEMANDER À CLAUDE, DEPUIS LE TRÔNE — 19 octobre 2026 ═══════════════
   Les règles vivent dans `ia-maison-pur` ; ici, l'appel. Un seul chemin
   pour les huit chantiers : la fonction `ia-maison`, avec la session de la
   personne (c'est elle qui prouve qu'on est de l'équipe).

   UNE DEMANDE NE PART JAMAIS EN DIFFÉRÉ. Sans réseau, on le dit : une
   lecture de photo arrivée une heure plus tard n'aide plus personne. */

const FONCTION = 'ia-maison';

export async function demandeAClaude<T = unknown>(d: DemandeIa): Promise<ReponseIa<T>> {
  const defaut = defautDeLaDemande(d);
  if (defaut) return { ok: false, erreur: 'format', message: `La demande n’est pas recevable : ${defaut}.` };
  const sb = supabase;
  if (!sb) return { ok: false, erreur: 'hors-ligne', message: 'Le Trône est hors ligne : Claude ne peut pas lire pour l’instant.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, erreur: 'reseau', message: 'Pas de réseau : réessayez quand il revient.' };
  try {
    const { data, error } = await sb.functions.invoke(FONCTION, { body: d });
    if (error) {
      /* La fonction rend sa raison dans le corps, même en erreur. */
      const corps = await lisLeCorps(error);
      if (corps?.erreur) return corps as ReponseIa<T>;
      if (/not found/i.test(String(error.message))) return { ok: false, erreur: 'version', message: 'La fonction ia-maison n’est pas encore posée dans Supabase.' };
      return { ok: false, erreur: 'reseau', message: `Claude n’a pas répondu : ${error.message}` };
    }
    const r = (data ?? {}) as ReponseIa<T>;
    if (typeof (r as { ok?: unknown }).ok !== 'boolean') return { ok: false, erreur: 'reseau', message: 'Réponse illisible de la fonction ia-maison.' };
    return r;
  } catch (e) {
    return { ok: false, erreur: 'reseau', message: `Claude n’a pas répondu : ${String((e as Error)?.message ?? e)}` };
  }
}

async function lisLeCorps(error: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (error as { context?: Response })?.context;
  if (!ctx || typeof ctx.json !== 'function') return null;
  try { return await ctx.json() as Record<string, unknown>; } catch { return null; }
}

/* ── LA VERSION DE LA FONCTION, LUE UNE FOIS ───────────────────────────
   Un GET à la fonction répond 405 avec sa version : avant qu'elle soit
   posée, les boutons des chantiers se taisent au lieu d'échouer. */
let versionConnue: Promise<string | undefined> | null = null;
export function versionDeIaMaison(): Promise<string | undefined> {
  if (versionConnue) return versionConnue;
  versionConnue = (async () => {
    const sb = supabase;
    if (!sb) return undefined;
    try {
      const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');
      const cle = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      if (!url || !cle) return undefined;
      const r = await fetch(`${url}/functions/v1/${FONCTION}`, { headers: { apikey: cle, authorization: `Bearer ${cle}` } });
      const j = await r.json().catch(() => ({})) as { version?: string };
      return typeof j.version === 'string' ? j.version : undefined;
    } catch { return undefined; }
  })();
  return versionConnue;
}

/** La fonction est-elle posée et à jour ? `null` tant qu'on ne sait pas. */
export function useSaitIaMaison(): boolean | null {
  const [sait, setSait] = useState<boolean | null>(null);
  useEffect(() => {
    let vivant = true;
    void versionDeIaMaison().then((v) => { if (vivant) setSait(saitIaMaison(v)); });
    return () => { vivant = false; };
  }, []);
  return sait;
}

/* ── UNE PHOTO, RÉDUITE AVANT DE PARTIR ─────────────────────────────────
   Une photo de téléphone fait 3 à 8 Mo ; Claude lit aussi bien à 1 600 px
   de côté, et la demande reste sous le plafond de la fonction. Le JPEG
   garde la couleur des reçus et des locks ; le PNG ne sert qu'aux captures
   d'écran, qu'on garde telles quelles si elles sont déjà petites. */
export async function photoPourClaude(fichier: Blob, maxPx = 1600, qualite = 0.82): Promise<{ base64: string; mime: string }> {
  const bitmap = await createImageBitmap(fichier);
  const k = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const l = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const petite = fichier.type === 'image/png' && k === 1 && fichier.size < 1_500_000;
  if (petite) { bitmap.close(); return { base64: await enBase64(fichier), mime: 'image/png' }; }
  const toile = document.createElement('canvas');
  toile.width = l; toile.height = h;
  const ctx = toile.getContext('2d');
  if (!ctx) { bitmap.close(); return { base64: await enBase64(fichier), mime: fichier.type || 'image/jpeg' }; }
  ctx.drawImage(bitmap, 0, 0, l, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => toile.toBlob(r, 'image/jpeg', qualite));
  if (!blob) return { base64: await enBase64(fichier), mime: fichier.type || 'image/jpeg' };
  return { base64: await enBase64(blob), mime: 'image/jpeg' };
}

function enBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}
