/* ══ OUVRIR LE TRÔNE SANS RÉSEAU — 4 octobre 2026 ═════════════════════════
   Maquette « Le Trône hors ligne », validée. Temps 2.

   « La dernière personne connectée, 7 jours » (arbitrage du 3 octobre). Sans
   réseau, le Trône ne pouvait ni rafraîchir la session (il montrait la page
   de connexion dès que le jeton d'une heure avait expiré) ni relire qui est
   connecté (il restait sur « Un instant… », tous les écrans fermés).

   CE QUI SE GARDE, sur l'appareil, à chaque ouverture EN LIGNE :
   · l'heure de la dernière connexion confirmée par le serveur, et pour qui ;
   · la tête (rôle, droits) de cette personne.
   Sans réseau, le Trône s'ouvre sur la session que supabase-js a laissée dans
   son tiroir, et sur cette tête, tant que la dernière connexion en ligne date
   de moins de 7 jours. Au-delà, il redemande la connexion. Les gestes faits
   pendant ce temps vont dans la file d'attente (temps 1) et partent dès que
   le réseau rend une session vraie.

   Les règles sont pures (`sessionHorsLigneValable`), le harnais
   `verifie-le-trone-hors-ligne` les éprouve. */
import { cleDeSession, supabase } from './supabase';

export const JOURS_HORS_LIGNE = 7;
const JOUR_MS = 86_400_000;

type Notee = { uid: string; le: string };
type TeteGardee<T> = { uid: string; le: string; tete: T };

const cleConnexion = (): string => `mnd_hors_ligne::connexion::${cleDeSession ?? 'local'}`;
const cleTete = (): string => `mnd_hors_ligne::tete::${cleDeSession ?? 'local'}`;

const lis = <T>(k: string): T | null => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
};
const ecris = (k: string, v: unknown): void => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage refusé */ } };

/** Une date encore dans le délai des 7 jours ? */
export const dansLeDelai = (le: string | undefined, maintenant: number, jours = JOURS_HORS_LIGNE): boolean => {
  if (!le) return false;
  const t = Date.parse(le);
  return Number.isFinite(t) && t <= maintenant + 60_000 && maintenant - t <= jours * JOUR_MS;
};

/** LA RÈGLE. La session laissée par supabase-js vaut hors ligne si elle
    appartient à la personne dont la dernière connexion EN LIGNE date de moins
    de 7 jours. Rend l'identifiant, ou `null`. */
export function sessionHorsLigneValable(o: {
  stockee: { user?: { id?: string } } | null;
  notee: Notee | null;
  maintenant: number;
}): string | null {
  const uid = o.stockee?.user?.id;
  if (!uid || !o.notee || o.notee.uid !== uid) return null;
  return dansLeDelai(o.notee.le, o.maintenant) ? uid : null;
}

/** À chaque session confirmée par le serveur. */
export const noteLaConnexionEnLigne = (uid: string): void => ecris(cleConnexion(), { uid, le: new Date().toISOString() } satisfies Notee);

/** La session que supabase-js a laissée, si elle vaut encore hors ligne. */
export function sessionGardee<S = unknown>(maintenant = Date.now()): S | null {
  if (!cleDeSession) return null;
  const brut = lis<Record<string, unknown>>(cleDeSession);
  /* supabase-js range la session telle quelle ; d'anciennes versions
     l'enveloppaient dans `currentSession`. */
  const stockee = (brut && (brut.currentSession as Record<string, unknown> | undefined)) ?? brut;
  const uid = sessionHorsLigneValable({ stockee: stockee as { user?: { id?: string } } | null, notee: lis<Notee>(cleConnexion()), maintenant });
  return uid ? (stockee as unknown as S) : null;
}

/** Combien de jours restent avant de devoir se reconnecter. */
export function joursRestants(maintenant = Date.now()): number | null {
  const n = lis<Notee>(cleConnexion());
  if (!n) return null;
  return Math.max(0, Math.ceil((Date.parse(n.le) + JOURS_HORS_LIGNE * JOUR_MS - maintenant) / JOUR_MS));
}

export const garderLaTete = <T>(uid: string, tete: T): void => ecris(cleTete(), { uid, le: new Date().toISOString(), tete } satisfies TeteGardee<T>);

/** La tête gardée de cette personne, si sa dernière connexion en ligne date
    de moins de 7 jours. */
export function teteGardee<T>(uid: string | undefined, maintenant = Date.now()): T | null {
  if (!uid) return null;
  const t = lis<TeteGardee<T>>(cleTete());
  const n = lis<Notee>(cleConnexion());
  if (!t || t.uid !== uid || !n || n.uid !== uid || !dansLeDelai(n.le, maintenant)) return null;
  return t.tete;
}

/** Se déconnecter efface ce qui permettrait de rouvrir sans réseau. */
export function oublieLeHorsLigne(): void {
  try { localStorage.removeItem(cleConnexion()); localStorage.removeItem(cleTete()); } catch { /* idem */ }
}

/** Le serveur est-il vraiment hors d'atteinte ? Le navigateur peut se croire
    en ligne sur un réseau qui ne mène nulle part : on frappe à la porte
    d'authentification, cinq secondes au plus. Toute réponse dit « joignable ». */
export async function serveurInjoignable(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const base = (supabase as unknown as { supabaseUrl?: string } | null)?.supabaseUrl ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined);
  if (!base) return false;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    await fetch(`${base.replace(/\/$/, '')}/auth/v1/health`, { method: 'GET', mode: 'no-cors', signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    return false;
  } catch {
    return true;
  }
}
