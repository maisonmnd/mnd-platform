import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { motDuRefus, type EtatDuDiagnostic, type Lecture, type Recommandation } from './ia-diagnostic-pur';

/* ══ LE DIAGNOSTIC PHOTO, CÔTÉ CLIENTE — 19 octobre 2026 ═════════════════
   Les règles vivent dans `ia-diagnostic-pur` ; ici, l'appel à la fonction
   `diagnostic-locks`, pour La Consultation et pour Ma Couronne.

   PAS LA PORTE DU PERSONNEL. Les clientes n'ont pas de compte du Trône :
   ce module n'importe pas `ia-maison`. La Consultation envoie la clé
   publique (JAMAIS une session : sur le même navigateur que le Trône, la
   session serait celle de l'équipe, et la fonction refuse le personnel) ;
   Ma Couronne envoie la session de la cliente.

   UN ENVOI NE PART JAMAIS EN DIFFÉRÉ, et jamais sans la case de l'accord
   cochée : c'est l'écran qui le garde (`defautDeLEnvoi`), la fonction le
   revérifie (`consentement: 'oui'`). */

const FONCTION = 'diagnostic-locks';

export type DiagnosticDeLaCliente = {
  id: string; cree_le: string; etat: EtatDuDiagnostic | string;
  lecture: Lecture | null; recommandation: Recommandation | null; texte: string;
  correction: string | null; relu_le: string | null; photosEffaceesLe: string | null; mot: string;
};
export type LectureRendue =
  | { ok: true; id: string; etat: string; lecture: Lecture | null; recommandation: Recommandation | null; texte: string; mot: string }
  | { ok: false; erreur: string; message: string };
/** La consultation payée qui ouvre la porte (La Consultation seulement). */
export type PreuveDeConsultation = { consultationId: string; transactionId: string };

async function appelle(corps: Record<string, unknown>, avecLaSession: boolean): Promise<{ status: number; corps: Record<string, unknown> } | null> {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');
  const cle = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !cle) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  let jeton = cle;
  if (avecLaSession && supabase) {
    try { jeton = (await supabase.auth.getSession()).data.session?.access_token ?? cle; } catch { jeton = cle; }
  }
  try {
    const r = await fetch(`${url}/functions/v1/${FONCTION}`, {
      method: 'POST',
      headers: { apikey: cle, authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const lu = await r.json().catch(() => ({})) as Record<string, unknown>;
    return { status: r.status, corps: lu };
  } catch {
    return null;
  }
}

/* ── L'INTERRUPTEUR, LU UNE FOIS PAR PAGE ───────────────────────────────
   Fermé tant que la direction ne l'allume pas, et fermé aussi tant que la
   fonction n'est pas posée : l'écran se tait, rien ne change. */
let ouvertConnu: Promise<boolean> | null = null;
export function diagnosticOuvert(): Promise<boolean> {
  if (!ouvertConnu) {
    ouvertConnu = appelle({ action: 'etat' }, false).then((r) => r?.status === 200 && r.corps.ouvert === true);
  }
  return ouvertConnu;
}
/** Pour le Trône (Paramètres › Vérifier) : la fonction est-elle posée, et
    que lit-elle de l'interrupteur ? Sans rien envoyer d'autre. */
export async function etatDeLaFonction(): Promise<{ posee: boolean; ouvert: boolean; version: string }> {
  const r = await appelle({ action: 'etat' }, false);
  const posee = r?.status === 200 && r.corps.ok === true;
  return { posee, ouvert: posee && r?.corps.ouvert === true, version: typeof r?.corps.version === 'string' ? r.corps.version : '' };
}
export function useDiagnosticOuvert(): boolean {
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    let vivant = true;
    void diagnosticOuvert().then((o) => { if (vivant) setOuvert(o); });
    return () => { vivant = false; };
  }, []);
  return ouvert;
}

/** SES LECTURES : par sa session (Ma Couronne) ou par sa consultation payée. */
export async function mesDiagnostics(preuve?: PreuveDeConsultation): Promise<DiagnosticDeLaCliente[]> {
  const r = await appelle({ action: 'lire', ...(preuve ?? {}) }, !preuve);
  if (!r || r.status !== 200 || !Array.isArray(r.corps.diagnostics)) return [];
  return r.corps.diagnostics as DiagnosticDeLaCliente[];
}

/** LES PHOTOS PARTENT, AVEC L'ACCORD. Le corps porte `consentement: 'oui'`
    parce que la case est cochée ; l'écran n'appelle pas sans elle. */
export async function envoieLesPhotos(photos: { base64: string; mime: string }[], preuve?: PreuveDeConsultation): Promise<LectureRendue> {
  const r = await appelle({ action: 'lire-photos', consentement: 'oui', photos, ...(preuve ?? {}) }, !preuve);
  if (!r) return { ok: false, erreur: 'reseau', message: motDuRefus('reseau') };
  if (r.status !== 200 || r.corps.ok !== true) {
    const code = typeof r.corps.error === 'string' ? r.corps.error : 'erreur';
    return { ok: false, erreur: code, message: motDuRefus(code) };
  }
  const c = r.corps as Record<string, unknown>;
  return {
    ok: true, id: String(c.id ?? ''), etat: String(c.etat ?? 'a-relire'),
    lecture: (c.lecture ?? null) as Lecture | null, recommandation: (c.recommandation ?? null) as Recommandation | null,
    texte: typeof c.texte === 'string' ? c.texte : '', mot: typeof c.mot === 'string' ? c.mot : '',
  };
}

/* ── UNE PHOTO, RÉDUITE AVANT DE PARTIR ─────────────────────────────────
   Recopiée en petit de `photoPourClaude` (ia-maison) : la cliente n'importe
   rien de la porte du personnel. 1 600 px de côté, JPEG : le coffre et
   Claude lisent aussi bien, et quatre photos tiennent sous le plafond. */
export async function photoReduite(fichier: Blob, maxPx = 1600, qualite = 0.82): Promise<{ base64: string; mime: string }> {
  try {
    const bitmap = await createImageBitmap(fichier);
    const k = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const toile = document.createElement('canvas');
    toile.width = Math.max(1, Math.round(bitmap.width * k));
    toile.height = Math.max(1, Math.round(bitmap.height * k));
    const ctx = toile.getContext('2d');
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, toile.width, toile.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((res) => toile.toBlob(res, 'image/jpeg', qualite));
      if (blob) return { base64: await enBase64(blob), mime: 'image/jpeg' };
    } else {
      bitmap.close();
    }
  } catch { /* le navigateur ne sait pas lire ce format : on l'envoie tel quel, la fonction jugera */ }
  return { base64: await enBase64(fichier), mime: fichier.type || 'image/jpeg' };
}

function enBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}
