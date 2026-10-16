import { useCallback, useEffect, useRef, useState } from 'react';
import { reglagesDeLaConnexion, supabase } from './supabase';
import {
  CLE_COMPTE, CLE_ENTREE, cleDeLaProposition, cleDeLEmpreinte, compteAGarder, estUneCleRetiree, estUnePanneDeReseau, lisLEmpreinte, lisLeCompte,
  messageDeLEmpreinte, nomDeLAppareil, verrouilleALOuverture, verrouilleAuRetour,
  type CompteMemorise, type EmpreinteDeLAppareil,
} from './empreinte-pur';

/* ══ ENTRER PAR L'EMPREINTE, CÔTÉ NAVIGATEUR — 16 octobre 2026 ═════════
   Les règles sont dans `empreinte-pur`. Ici : les clés d'accès de
   supabase-js (`registerPasskey`, `signInWithPasskey`, `auth.passkey.*`),
   ce que l'appareil garde (le compte, sa clé), et le verrou du Trône.

   Hors ligne, la Maison ne peut pas vérifier la clé : le Trône demande
   alors au téléphone seul une preuve d'empreinte (WebAuthn, vérification
   de l'utilisateur exigée) pour rouvrir la session DÉJÀ gardée sur cet
   appareil, sept jours au plus comme avec le mot de passe. */

const lis = (k: string): unknown => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const ecris = (k: string, v: unknown): void => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* sans mémoire */ } };

/* ── Le compte dont l'appareil se souvient ── */
export const compteMemorise = (): CompteMemorise | null => lisLeCompte(lis(CLE_COMPTE));
export const memoriseLeCompte = (uid: string, prenom: string, email: string): void => { const c = compteAGarder(uid, prenom, email); if (c) ecris(CLE_COMPTE, c); };
export const oublieLeCompte = (): void => ecris(CLE_COMPTE, null);

/* ── La clé de CET appareil, pour ce compte ── */
export const empreinteDeLAppareil = (uid: string): EmpreinteDeLAppareil | null => (uid ? lisLEmpreinte(lis(cleDeLEmpreinte(uid))) : null);
const gardeLEmpreinte = (uid: string, e: EmpreinteDeLAppareil | null): void => { ecris(cleDeLEmpreinte(uid), e); avertis(); };
export const dejaProposee = (uid: string): boolean => !!lis(cleDeLaProposition(uid));
export const marqueProposee = (uid: string): void => ecris(cleDeLaProposition(uid), new Date().toISOString());
/** Qui vient d'entrer (mot de passe ou empreinte) n'est pas reverrouillé aussitôt. */
export const noteUneEntree = (): void => { try { sessionStorage.setItem(CLE_ENTREE, String(Date.now())); } catch { /* sans mémoire */ } };
const entreeLe = (): number | null => { try { const v = Number(sessionStorage.getItem(CLE_ENTREE)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; } };

/* Les écrans qui montrent l'état de l'empreinte se mettent à jour ensemble. */
const abonnes = new Set<() => void>();
const avertis = (): void => { abonnes.forEach((f) => f()); };
export function useEmpreinteDeLAppareil(uid: string): EmpreinteDeLAppareil | null {
  const [e, setE] = useState(() => empreinteDeLAppareil(uid));
  useEffect(() => { const f = () => setE(empreinteDeLAppareil(uid)); f(); abonnes.add(f); return () => { abonnes.delete(f); }; }, [uid]);
  return e;
}

/** LES CLÉS D'ACCÈS SONT-ELLES ALLUMÉES côté Maison (Supabase, Authentication) ? Tant qu'elles ne le
    sont pas, le Trône ne propose rien : publier avant l'interrupteur ne fait rien échouer. */
let allumees: Promise<boolean> | null = null;
export function clesAllumees(): Promise<boolean> {
  if (!allumees) {
    allumees = reglagesDeLaConnexion().then((r) => {
      if (!r) { allumees = null; return false; }
      return r.passkeys_enabled === true;
    });
  }
  return allumees;
}
export function useClesAllumees(): boolean | null {
  const [a, setA] = useState<boolean | null>(null);
  useEffect(() => { let vivant = true; void clesAllumees().then((v) => { if (vivant) setA(v); }); return () => { vivant = false; }; }, []);
  return a;
}

/** L'appareil sait-il lire une empreinte, un visage (ou Windows Hello) ? */
export async function appareilCapable(): Promise<boolean> {
  try {
    const P = (window as unknown as { PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } }).PublicKeyCredential;
    return !!P && typeof P.isUserVerifyingPlatformAuthenticatorAvailable === 'function' && await P.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}
export function useAppareilCapable(): boolean | null {
  const [c, setC] = useState<boolean | null>(null);
  useEffect(() => { let vivant = true; void appareilCapable().then((v) => { if (vivant) setC(v); }); return () => { vivant = false; }; }, []);
  return c;
}

async function nomDeCetAppareil(): Promise<string> {
  let modele = '';
  try {
    const d = (navigator as unknown as { userAgentData?: { getHighEntropyValues?: (h: string[]) => Promise<{ model?: string }> } }).userAgentData;
    if (d?.getHighEntropyValues) modele = (await d.getHighEntropyValues(['model'])).model ?? '';
  } catch { /* le modèle n'est pas dit : le nom reste générique */ }
  return nomDeLAppareil(navigator.userAgent, modele);
}

export type Resultat = { ok: true; uid?: string } | { ok: false; erreur: string; retiree?: boolean };

/** ACTIVER : le téléphone crée sa clé pour ce compte, la Maison l'enregistre, on lui donne le nom de l'appareil. */
export async function activeLEmpreinte(uid: string): Promise<Resultat> {
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison.' };
  try {
    const { data, error } = await supabase.auth.registerPasskey();
    if (error || !data) return { ok: false, erreur: messageDeLEmpreinte(error) };
    const nom = await nomDeCetAppareil();
    await supabase.auth.passkey.update({ passkeyId: data.id, friendlyName: nom }).catch(() => undefined);
    gardeLEmpreinte(uid, { passkeyId: data.id, nom, le: new Date().toISOString() });
    marqueProposee(uid);
    return { ok: true };
  } catch (e) { return { ok: false, erreur: messageDeLEmpreinte(e) }; }
}

/** Une preuve d'empreinte demandée au téléphone SEUL (hors ligne) : la clé de ce site, vérification exigée. */
async function preuveSurLAppareil(): Promise<boolean> {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  const c = await navigator.credentials.get({
    publicKey: { challenge, rpId: location.hostname, userVerification: 'required', timeout: 60_000, allowCredentials: [] },
  });
  return !!c;
}

/** ENTRER (ou déverrouiller) : la Maison vérifie la clé ; sans réseau, le téléphone seul rouvre la session gardée. */
export async function entreParLEmpreinte(o: { sessionGardee: boolean }): Promise<Resultat> {
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison.' };
  const surLAppareil = async (): Promise<Resultat> => {
    if (!o.sessionGardee) return { ok: false, erreur: 'Pas de réseau : la première entrée de la journée demande le réseau.' };
    try { return (await preuveSurLAppareil()) ? { ok: true } : { ok: false, erreur: messageDeLEmpreinte('NotAllowedError') }; }
    catch (e) { return { ok: false, erreur: messageDeLEmpreinte(e) }; }
  };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return surLAppareil();
  try {
    noteUneEntree();
    const { data, error } = await supabase.auth.signInWithPasskey();
    if (error) return estUnePanneDeReseau(error) ? surLAppareil() : { ok: false, erreur: messageDeLEmpreinte(error), retiree: estUneCleRetiree(error) };
    return { ok: true, uid: data?.user?.id };
  } catch (e) {
    return estUnePanneDeReseau(e) ? surLAppareil() : { ok: false, erreur: messageDeLEmpreinte(e) };
  }
}

export type CleDAcces = { id: string; nom: string; creeeLe: string; utiliseeLe?: string };
const enCle = (p: { id: string; friendly_name?: string; created_at: string; last_used_at?: string }): CleDAcces =>
  ({ id: p.id, nom: p.friendly_name || 'Clé d’accès', creeeLe: p.created_at, ...(p.last_used_at ? { utiliseeLe: p.last_used_at } : {}) });

/** Mes clés d'accès (un appareil par ligne). */
export async function mesCles(): Promise<{ cles: CleDAcces[]; erreur?: string }> {
  if (!supabase) return { cles: [], erreur: 'Pas de connexion à la Maison.' };
  try {
    const { data, error } = await supabase.auth.passkey.list();
    if (error) return { cles: [], erreur: messageDeLEmpreinte(error) };
    return { cles: (data ?? []).map(enCle) };
  } catch (e) { return { cles: [], erreur: messageDeLEmpreinte(e) }; }
}
/** Retirer une de mes clés : elle ne marche plus nulle part ; si c'était celle de cet appareil, il l'oublie. */
export async function retireMaCle(uid: string, passkeyId: string): Promise<Resultat> {
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison.' };
  try {
    const { error } = await supabase.auth.passkey.delete({ passkeyId });
    if (error) return { ok: false, erreur: messageDeLEmpreinte(error) };
    if (empreinteDeLAppareil(uid)?.passkeyId === passkeyId) gardeLEmpreinte(uid, null);
    return { ok: true };
  } catch (e) { return { ok: false, erreur: messageDeLEmpreinte(e) }; }
}
/** La clé de cet appareil a été retirée ailleurs (la Maison ne la connaît plus) : l'appareil l'oublie. */
export const oublieLEmpreinte = (uid: string): void => gardeLEmpreinte(uid, null);

/* ── LES CLÉS DE L'ÉQUIPE (la direction) : par la fonction `cles-d-acces` ── */
export type ClesDUnMembre = { userId: string; nom: string; role: string; cles: CleDAcces[] };
export async function clesDeLEquipe(): Promise<{ membres: ClesDUnMembre[]; erreur?: string }> {
  if (!supabase) return { membres: [], erreur: 'Pas de connexion à la Maison.' };
  const { data, error } = await supabase.functions.invoke('cles-d-acces', { body: { action: 'lister' } });
  if (error || !data || (data as { error?: string }).error) return { membres: [], erreur: (data as { error?: string } | null)?.error ?? 'La fonction cles-d-acces ne répond pas (est-elle posée dans Supabase ?).' };
  const membres = ((data as { membres?: { user_id: string; nom: string; role: string; cles: Parameters<typeof enCle>[0][] }[] }).membres ?? [])
    .map((m) => ({ userId: m.user_id, nom: m.nom, role: m.role, cles: (m.cles ?? []).map(enCle) }));
  return { membres };
}
export async function retireLaCleDe(userId: string, passkeyId: string): Promise<Resultat> {
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison.' };
  const { data, error } = await supabase.functions.invoke('cles-d-acces', { body: { action: 'retirer', userId, passkeyId } });
  if (error || (data as { error?: string } | null)?.error) return { ok: false, erreur: (data as { error?: string } | null)?.error ?? 'La clé n’a pas pu être retirée.' };
  return { ok: true };
}

/* ── LE VERROU DU TRÔNE ──
   Verrouillé à l'ouverture (session reprise sur l'appareil) et après cinq
   minutes hors du Trône, dès que l'empreinte est activée sur cet appareil. */
export function useVerrou(uid: string): { verrouille: boolean; deverrouille: () => void; verrouilleMaintenant: () => void } {
  const activee = !!useEmpreinteDeLAppareil(uid);
  const [verrouille, setVerrouille] = useState(() => verrouilleALOuverture({ activee: !!empreinteDeLAppareil(uid), entreeLe: entreeLe(), maintenant: Date.now() }));
  const cacheDepuis = useRef<number | null>(null);
  useEffect(() => {
    if (!activee) { setVerrouille(false); return undefined; }
    const change = () => {
      if (document.visibilityState === 'hidden') { cacheDepuis.current = Date.now(); return; }
      if (verrouilleAuRetour({ activee, cacheDepuis: cacheDepuis.current, maintenant: Date.now() })) setVerrouille(true);
      cacheDepuis.current = null;
    };
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, [activee]);
  const deverrouille = useCallback(() => { noteUneEntree(); setVerrouille(false); }, []);
  const verrouilleMaintenant = useCallback(() => setVerrouille(true), []);
  return { verrouille: verrouille && activee, deverrouille, verrouilleMaintenant };
}
