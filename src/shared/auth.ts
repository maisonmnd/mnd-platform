import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isRemote } from './supabase';

/* Authentification — couche mince au-dessus de Supabase Auth.

   - Personnel (Le Trône / LOKAA) : e-mail + mot de passe. Le tout premier compte
     devient « souverain » (RPC `provision_first_staff`).
   - Cliente (Ma Couronne) : e-mail + mot de passe, avec réinitialisation par code
     à 6 chiffres. Les helpers OTP (e-mail, téléphone) restent plus bas : l'OTP
     e-mail a précédé le mot de passe, le téléphone attend un fournisseur SMS.

   L'application reste ouverte tant que l'ENFORCEMENT n'est pas demandé :
   `requireAuth` n'est vrai que si un backend existe ET VITE_REQUIRE_AUTH=true.
   Sans backend, tout est local et l'auth est inerte. */

/** Un backend est configuré (des sessions sont possibles). */
export const authEnabled = isRemote;

/** L'accès est-il verrouillé derrière une connexion ? (à coupler au durcissement RLS) */
export const requireAuth = isRemote && import.meta.env.VITE_REQUIRE_AUTH === 'true';

/** URL de retour des e-mails d'authentification : l'app courante (jamais localhost).
    Doit figurer dans « Redirect URLs » du tableau de bord Supabase. */
const appRedirect = (): string | undefined =>
  typeof window !== 'undefined' ? window.location.origin + import.meta.env.BASE_URL : undefined;

// ---------- Magasin de session (source externe pour React) ----------
type AuthState = { session: Session | null; loading: boolean };
let state: AuthState = { session: null, loading: isRemote };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const setState = (patch: Partial<AuthState>) => {
  state = { ...state, ...patch };
  emit();
};

if (supabase) {
  supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
  supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

// ---------- Actions personnel (e-mail + mot de passe) ----------
export async function signInEmail(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Backend non configuré.');
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  await ensureFounder(''); // no-op si le personnel existe déjà
}

/** Inscription — le premier compte fonde la Maison (souverain). */
export async function signUpEmail(
  email: string,
  password: string,
  name: string,
): Promise<{ needsConfirmation: boolean }> {
  if (!supabase) throw new Error('Backend non configuré.');
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: appRedirect() },
  });
  if (error) throw error;
  if (data.session) await ensureFounder(name);
  return { needsConfirmation: !data.session };
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/** Amorce le fondateur si le personnel est vide (idempotent, côté serveur). */
async function ensureFounder(name: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('provision_first_staff', { display_name: name });
  if (error) console.warn('[auth] provision_first_staff:', error.message);
}

// ---------- Actions cliente (e-mail + mot de passe) — Ma Couronne ----------
/** Connexion cliente par e-mail + mot de passe (comme Le Trône). */
export async function signInClient(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Backend non configuré.');
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/** Inscription cliente : nom + e-mail + mot de passe. Le nom est stocké dans les
    métadonnées du compte (`user_metadata.name`) et sert à nommer la fiche cliente.
    N'amorce PAS le personnel (contrairement à `signUpEmail` du Trône). */
export async function signUpClient(
  email: string,
  password: string,
  name: string,
): Promise<{ needsConfirmation: boolean }> {
  if (!supabase) throw new Error('Backend non configuré.');
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: appRedirect(), data: { name: name.trim() } },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

/* ---- Mot de passe oublié — code à 6 chiffres (même principe que l'OTP e-mail) ----
   Le gabarit « Reset Password » du tableau de bord doit exposer {{ .Token }} :
   sans lui l'e-mail ne montre qu'un lien, et la cliente n'a aucun code à saisir. */

/** Envoie un code de réinitialisation à 6 chiffres. Ne révèle pas si le compte existe. */
export async function startPasswordReset(email: string): Promise<void> {
  if (!supabase) throw new Error('Backend non configuré.');
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appRedirect() });
  if (error) throw error;
}

/** Vérifie le code reçu et ouvre une session de récupération. */
export async function verifyPasswordReset(email: string, token: string): Promise<void> {
  if (!supabase) throw new Error('Backend non configuré.');
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'recovery' });
  if (error) throw error;
}

/** Redéfinit le mot de passe du compte connecté (session de récupération ouverte). */
export async function updatePassword(password: string): Promise<void> {
  if (!supabase) throw new Error('Backend non configuré.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

// ---------- Actions cliente (OTP e-mail, sans mot de passe) — legacy Ma Couronne ----------
/** Envoie un code à 6 chiffres par e-mail (crée le compte si besoin). */
export async function startEmailOtp(email: string): Promise<void> {
  if (!supabase) throw new Error('Backend non configuré.');
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true, emailRedirectTo: appRedirect() },
  });
  if (error) throw error;
}

/** Vérifie le code reçu par e-mail et ouvre la session. */
export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  if (!supabase) throw new Error('Backend non configuré.');
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (error) throw error;
}

// ---------- Actions cliente (OTP téléphone) — prêtes si un fournisseur SMS est configuré ----------
export async function startPhoneOtp(phone: string): Promise<void> {
  if (!supabase) throw new Error('Backend non configuré.');
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<void> {
  if (!supabase) throw new Error('Backend non configuré.');
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
}

// ---------- Profil personnel ----------
export type StaffRole = 'souverain' | 'gerant' | 'maitre';
export type Staff = { user_id: string; name: string | null; role: StaffRole; rubrics: string[] };

export async function loadStaff(): Promise<Staff | null> {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase.from('staff').select('*').eq('user_id', uid).maybeSingle();
  if (error) {
    console.warn('[auth] loadStaff:', error.message);
    return null;
  }
  return (data as Staff) ?? null;
}

export function useStaff(): Staff | null {
  const { session } = useAuth();
  const [staff, setStaff] = useState<Staff | null>(null);
  useEffect(() => {
    let alive = true;
    if (!session) {
      setStaff(null);
      return;
    }
    void loadStaff().then((s) => {
      if (alive) setStaff(s);
    });
    return () => {
      alive = false;
    };
  }, [session?.user?.id]);
  return staff;
}
