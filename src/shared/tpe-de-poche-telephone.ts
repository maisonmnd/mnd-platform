/* LE TÉLÉPHONE DU TPE DE POCHE PARLE À SA FONCTION — 25 novembre 2026.
   Le téléphone n'a pas de compte : la fonction `tpe-de-poche` (Verify JWT
   éteint) le reconnaît à son jeton d'appareil. Comme la page « Régler »
   (regler-la-seance-serveur.ts), un simple fetch avec la clé publique : rien
   de la synchronisation du Trône n'entre dans cette page. Voir
   tpe-de-poche-pur.ts. */
import { estUnCodeSecretDuTpe, estUnJetonDAppareil, type LigneDuJourAuTpe, type TotalDuSoir } from './tpe-de-poche-pur';

const URL_PROJET = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const CLE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
export const FONCTION_DU_TPE = 'tpe-de-poche';

export type ReponseDuTpe = {
  ok?: boolean; raison?: string; version?: string;
  jeton?: string; nom?: string; membreId?: string; branchId?: string;
  jour?: string; lignes?: LigneDuJourAuTpe[];
  jetonDuLien?: string; resteXof?: number;
  /* Le lot 2 (26 novembre 2026) : les espèces, le total du soir, les plafonds. */
  especes?: boolean; total?: TotalDuSoir; resteDuJourXof?: number; plafondParPaiementXof?: number; montantXof?: number; deja?: boolean;
  /* Le lot 2b : « Autre montant ». */
  id?: string; autres?: AutreDuJour[];
};
/** Un autre montant du jour, tel que le téléphone le liste. */
export type AutreDuJour = { id: string; le: string; montantXof: number; motif: string; precision?: string; statut: string };

async function appel(corps: Record<string, unknown>): Promise<ReponseDuTpe> {
  if (!URL_PROJET) return { ok: false, raison: 'hors-ligne' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, raison: 'hors-ligne' };
  try {
    const r = await fetch(`${URL_PROJET}/functions/v1/${FONCTION_DU_TPE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CLE_ANON, Authorization: `Bearer ${CLE_ANON}` },
      body: JSON.stringify(corps),
    });
    return (await r.json().catch(() => ({ ok: false, raison: `http_${r.status}` }))) as ReponseDuTpe;
  } catch {
    return { ok: false, raison: 'reseau' };
  }
}

export const activeLeTelephone = (code: string, appareil: string) => appel({ action: 'activer', code, appareil });
export const lisLeJourDuTpe = (jeton: string) => appel({ action: 'jour', jeton });
export const ouvreLeRdvAuTpe = (jeton: string, rdvId: string) => appel({ action: 'ouvrir', jeton, rdvId });
/** Le lot 2 : l'employée déclare les billets reçus pour une séance (à remettre le soir). */
export const declareLesEspeces = (jeton: string, rdvId: string) => appel({ action: 'especes', jeton, rdvId });
/** Le lot 2b : préparer un autre montant, puis le dire payé (KkiaPay le confirme au serveur), ou abandonné. */
export const prepareLAutreMontant = (jeton: string, montantXof: number, motif: string, precision: string) => appel({ action: 'autre', jeton, montantXof, motif, precision });
export const confirmeLAutreMontant = (jeton: string, id: string, transactionId: string) => appel({ action: 'autre-paye', jeton, id, transactionId });
export const abandonneLAutreMontant = (jeton: string, id: string) => appel({ action: 'autre-abandon', jeton, id });

/* ── CE QUE LE TÉLÉPHONE GARDE ──
   Le jeton (il ne revient jamais du serveur une seconde fois) et l'empreinte
   du code secret, salée. Le dernier toucher vit dans l'onglet seulement :
   la page « Régler » ouverte puis refermée ne redemande pas le code avant
   deux minutes. Tout est entouré : une page privée peut refuser le stockage. */
const CLE = 'mnd-tpe-de-poche';
const CLE_DU_TOUCHER = 'mnd-tpe-de-poche-toucher';

export type TpeGarde = { jeton: string; nom: string; membreId: string; branchId: string; secret?: { sel: string; empreinte: string } };

export function lisLeTpeGarde(): TpeGarde | null {
  try {
    const t = JSON.parse(localStorage.getItem(CLE) ?? 'null') as TpeGarde | null;
    return t && estUnJetonDAppareil(t.jeton) ? t : null;
  } catch {
    return null;
  }
}
export function gardeLeTpe(t: TpeGarde | null): void {
  try {
    if (t) localStorage.setItem(CLE, JSON.stringify(t));
    else localStorage.removeItem(CLE);
  } catch { /* rien : le TPE redemandera son activation */ }
}
export function dernierToucher(): number {
  try { return Number(sessionStorage.getItem(CLE_DU_TOUCHER)) || 0; } catch { return 0; }
}
export function noteLeToucher(ms = Date.now()): void {
  try { sessionStorage.setItem(CLE_DU_TOUCHER, String(ms)); } catch { /* rien */ }
}
export function oublieLeToucher(): void {
  try { sessionStorage.removeItem(CLE_DU_TOUCHER); } catch { /* rien */ }
}

async function sha256(texte: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(h)].map((o) => o.toString(16).padStart(2, '0')).join('');
}
/** Le code secret, salé, en empreinte : jamais gardé en clair. */
export async function empreinteDuSecret(code: string): Promise<{ sel: string; empreinte: string }> {
  const sel = [...crypto.getRandomValues(new Uint8Array(12))].map((o) => o.toString(16).padStart(2, '0')).join('');
  return { sel, empreinte: await sha256(`${sel}:${code}`) };
}
export async function secretJuste(code: string, s: { sel: string; empreinte: string } | undefined): Promise<boolean> {
  if (!s || !estUnCodeSecretDuTpe(code)) return false;
  return (await sha256(`${s.sel}:${code}`)) === s.empreinte;
}

/** Le nom du téléphone, tel que la direction le lira : « iPhone », « Android · SM-A155F ». */
export function nomDuTelephone(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  const a = /Android [\d.]+;\s*([^;)]+)/i.exec(ua);
  if (a) return `Android · ${a[1].replace(/\s*Build\/.*$/i, '').trim()}`.slice(0, 60);
  if (/Android/i.test(ua)) return 'Android';
  return 'Téléphone';
}
