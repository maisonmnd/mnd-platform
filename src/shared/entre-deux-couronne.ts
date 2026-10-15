import { supabase } from './supabase';
import { uid } from './store';
import {
  COMPARTIMENT_DES_PHOTOS, TABLE_DES_REPONSES, TABLE_DES_SIGNALEMENTS, reponseAuSignalement,
  type CleDeSouci, type Signalement,
} from './entre-deux-pur';

/* ══ ENTRE DEUX SÉANCES, CÔTÉ MA COURONNE — 15 octobre 2026 ═════════════
   La cliente DÉPOSE son signalement (0132 : sa ligne, ouverte, depuis Ma
   Couronne) et RELIT les siens ; elle ne réécrit jamais une ligne. Les
   réponses validées de la Maison se lisent par tous. Jamais d'exception :
   un téléphone qui perd le réseau ne doit pas voir un écran cassé. */

/** Les réponses VALIDÉES, par souci. */
export async function lisLesReponsesValidees(): Promise<Partial<Record<string, string>>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from(TABLE_DES_REPONSES).select('id, data');
  if (error) return {};
  const out: Partial<Record<string, string>> = {};
  for (const r of (data ?? []) as { id: string; data?: { texteValide?: string } }[]) {
    const t = String(r.data?.texteValide ?? '').trim();
    if (t) out[r.id] = t;
  }
  return out;
}

/** Les siens (et ceux de son foyer), les plus récents d'abord. */
export async function lisMesSignalements(): Promise<Signalement[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from(TABLE_DES_SIGNALEMENTS).select('data').order('updated_at', { ascending: false }).limit(60);
  if (error) return [];
  return ((data ?? []) as { data: Signalement }[]).map((r) => r.data).filter((s) => s && typeof s === 'object');
}

/* La photo : réduite sur le téléphone (1 600 px, JPEG), pour qu'elle parte
   même sur un réseau lent, puis rangée sous le dossier de la cliente. */
async function reduite(f: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b ?? f), 'image/jpeg', 0.82));
  } catch { return f; }
}
export async function deposeLaPhoto(clientId: string, f: File): Promise<string | null> {
  if (!supabase) return null;
  const chemin = `${clientId}/${new Date().toISOString().slice(0, 10)}-${uid()}.jpg`;
  const { error } = await supabase.storage.from(COMPARTIMENT_DES_PHOTOS).upload(chemin, await reduite(f), { contentType: 'image/jpeg', upsert: false });
  return error ? null : chemin;
}

/** Ce qu'elle lit quand elle répond « tout va bien ». */
export const BONNE_NOUVELLE = 'Merci ! Bonne nouvelle. À votre prochaine séance.';

/** Déposer : la ligne part, la réponse qu'elle reçoit tout de suite revient.
    `null` : rien n'est parti. */
export async function deposeUnSignalement(o: {
  branchId: string; clientId: string; soucis: CleDeSouci[]; texte?: string; photo?: string; point?: string; bien?: boolean;
  apptId?: string; maitre?: string; validees: Partial<Record<string, string>>;
}): Promise<{ reponse: string[] } | null> {
  if (!supabase) return null;
  const reponse = o.bien ? [BONNE_NOUVELLE] : reponseAuSignalement(o.soucis, o.validees);
  const s: Signalement = {
    id: `sig-${uid()}`, branchId: o.branchId, clientId: o.clientId, soucis: o.bien ? [] : o.soucis,
    ...(o.texte?.trim() ? { texte: o.texte.trim().slice(0, 1000) } : {}),
    ...(o.photo ? { photo: o.photo } : {}),
    canal: 'couronne', quand: new Date().toISOString(),
    ...(o.point ? { point: o.point } : {}),
    ...(o.bien ? { bien: true } : {}),
    ...(o.apptId ? { apptId: o.apptId } : {}),
    ...(o.maitre ? { maitre: o.maitre } : {}),
    etat: o.bien ? 'traite' : 'ouvert',
    reponse: reponse.join('\n'),
  };
  /* Le niveau n'est pas écrit : le Trône le recalcule depuis les soucis. */
  const { error } = await supabase.from(TABLE_DES_SIGNALEMENTS).insert({ id: s.id, branch_id: o.branchId || null, data: s });
  if (error) { console.warn('[entre-deux] dépôt refusé :', error.message); return null; }
  return { reponse };
}
