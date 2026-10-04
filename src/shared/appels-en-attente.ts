/* ══ LES ENVOIS QUI ATTENDENT LE RÉSEAU — 4 octobre 2026 ═════════════════
   Maquette « Le Trône hors ligne », validée. Temps 3.

   « Les gestes qui ont besoin d'Internet (WhatsApp, avis, envoi de facture) :
   mis en attente, partent au retour » (arbitrage du 3 octobre).

   Les DONNÉES ont leur file (temps 1). Ce module tient l'autre moitié : les
   APPELS aux fonctions de la Maison (un WhatsApp écrit à la main, un bulletin
   envoyé, une notification). Sans réseau, l'appel échouait et le geste était
   à refaire. Il se garde désormais sur l'appareil, et part de lui-même au
   retour du réseau, le plus ancien d'abord.

   PAS DE DOUBLON. Un message reçu deux fois par une cliente est pire qu'un
   message en retard. On ne garde que ce qui n'est CERTAINEMENT pas parti :
   le navigateur se sait hors ligne, ou la connexion n'a pas pu s'établir
   (« Failed to fetch »). Un refus du serveur, lui, se dit tout de suite et ne
   se rejoue jamais.

   KKIAPAY ET L'IA ne passent pas par ici : un paiement en ligne exige le
   réseau au moment où la cliente paie, et une suggestion n'a plus de sens une
   heure après. Ils refusent hors ligne, et le disent. */
import { supabase } from './supabase';

export type AppelEnAttente = {
  id: string;
  fonction: string;
  corps: unknown;
  /** Ce que l'écran dira de lui : « WhatsApp à Awa K. ». */
  dit: string;
  /** Quand il a été fait (ISO). */
  at: string;
};

export type Issue<D> = { parti: true; data: D } | { enAttente: true } | { erreur: unknown };

const surface = (): string => (typeof document !== 'undefined' && document.body?.dataset?.surface) || 'trone';
const CLE = (): string => `${surface()}::appels-en-attente`;
const ecouteurs = new Set<() => void>();
let version = 0;
const annonce = (): void => { version += 1; ecouteurs.forEach((f) => f()); };
export const abonneLesAppels = (f: () => void): (() => void) => { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; };
export const versionDesAppels = (): number => version;

export function lisLesAppels(): AppelEnAttente[] {
  try { return JSON.parse(localStorage.getItem(CLE()) || '[]') as AppelEnAttente[]; } catch { return []; }
}
const ecris = (l: readonly AppelEnAttente[]): void => {
  try { if (l.length) localStorage.setItem(CLE(), JSON.stringify(l)); else localStorage.removeItem(CLE()); } catch { /* stockage refusé */ }
  annonce();
};
export const appelsEnAttente = (): number => lisLesAppels().length;

/** Hors ligne pour de bon : le navigateur le dit, ou la connexion n'a pas pu
    s'établir. Un refus du serveur n'en est pas un. */
export const estHorsLigne = (err: unknown): boolean => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const e = err as { name?: string; message?: string; context?: { message?: string } } | null;
  const m = `${e?.name ?? ''} ${e?.message ?? ''} ${e?.context?.message ?? ''}`.toLowerCase();
  return m.includes('failed to fetch') || m.includes('fetcherror') || m.includes('networkerror') || m.includes('load failed')
    || m.includes('network request failed') || m.includes('err_internet_disconnected');
};

export function gardeUnAppel(fonction: string, corps: unknown, dit: string): void {
  const a: AppelEnAttente = { id: `ap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, fonction, corps, dit, at: new Date().toISOString() };
  ecris([...lisLesAppels(), a]);
  planifieLeVidage();
}

/** APPELER, OU GARDER POUR PLUS TARD. Hors ligne, l'appel ne part pas : il
    se garde, et l'écran le dit (« partira au retour du réseau »). */
export async function appelleOuGarde<D = unknown>(fonction: string, corps: unknown, dit: string): Promise<Issue<D>> {
  if (!supabase) return { erreur: new Error('Pas de connexion à la Maison.') };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    gardeUnAppel(fonction, corps, dit);
    return { enAttente: true };
  }
  try {
    const { data, error } = await supabase.functions.invoke(fonction, { body: corps as Record<string, unknown> });
    if (error) {
      if (estHorsLigne(error)) { gardeUnAppel(fonction, corps, dit); return { enAttente: true }; }
      return { erreur: error };
    }
    return { parti: true, data: data as D };
  } catch (err) {
    if (estHorsLigne(err)) { gardeUnAppel(fonction, corps, dit); return { enAttente: true }; }
    return { erreur: err };
  }
}

/* ── LE DÉPART AU RETOUR DU RÉSEAU ──────────────────────────────────────
   Un à un, le plus ancien d'abord. Une coupure en route arrête le tour (le
   reste attend le suivant) ; un refus du serveur retire l'appel et le note,
   pour qu'on sache qu'il n'est pas parti. */
export type AppelRefuse = AppelEnAttente & { refus: string; le: string };
const CLE_REFUS = (): string => `${surface()}::appels-refuses`;
export function lisLesRefus(): AppelRefuse[] {
  try { return JSON.parse(localStorage.getItem(CLE_REFUS()) || '[]') as AppelRefuse[]; } catch { return []; }
}
export function oublieLeRefus(id: string): void {
  try { localStorage.setItem(CLE_REFUS(), JSON.stringify(lisLesRefus().filter((r) => r.id !== id))); } catch { /* idem */ }
  annonce();
}
const noteUnRefus = (a: AppelEnAttente, refus: string): void => {
  try { localStorage.setItem(CLE_REFUS(), JSON.stringify([{ ...a, refus, le: new Date().toISOString() }, ...lisLesRefus()].slice(0, 50))); } catch { /* idem */ }
};

let enCours = false;
export async function videLesAppels(): Promise<number> {
  if (!supabase || enCours) return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  if (lisLesAppels().length === 0) return 0;
  enCours = true;
  let partis = 0;
  try {
    /* Une session vraie d'abord : hors ligne, le jeton a pu expirer, et
       supabase-js le rafraîchit à cette lecture. */
    await supabase.auth.getSession();
    for (const a of lisLesAppels()) {
      let issue: 'parti' | 'coupure' | string;
      try {
        const { error } = await supabase.functions.invoke(a.fonction, { body: a.corps as Record<string, unknown> });
        issue = !error ? 'parti' : estHorsLigne(error) ? 'coupure' : String((error as { message?: string }).message ?? error);
      } catch (err) {
        issue = estHorsLigne(err) ? 'coupure' : String((err as { message?: string })?.message ?? err);
      }
      if (issue === 'coupure') break;
      if (issue !== 'parti') noteUnRefus(a, issue);
      else partis += 1;
      ecris(lisLesAppels().filter((x) => x.id !== a.id));
    }
  } finally {
    enCours = false;
  }
  return partis;
}

let minuteur: ReturnType<typeof setTimeout> | undefined;
function planifieLeVidage(): void {
  if (minuteur) return;
  minuteur = setTimeout(() => {
    minuteur = undefined;
    void videLesAppels().then(() => { if (lisLesAppels().length) planifieLeVidage(); });
  }, 30_000);
  libere(minuteur);
}

/* Dans un harnais (Node), un minuteur ne retient pas le processus. */
function libere(t: unknown): void { (t as { unref?: () => void } | undefined)?.unref?.(); }

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void videLesAppels(); });
  /* À l'ouverture : ce qui attendait d'une séance d'avant repart. */
  libere(setTimeout(() => { void videLesAppels().then(() => { if (lisLesAppels().length) planifieLeVidage(); }); }, 5000));
}
