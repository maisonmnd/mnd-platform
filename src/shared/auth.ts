import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isRemote } from './supabase';
import { purgeLocalKeys } from './store';

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

/* Clés RH & paie purgées du cache local à la déconnexion : salaires, avances,
   pointages, congés, dossiers du personnel, pourboires, primes/retenues/taux et
   codes d'accès. Sur un poste partagé, fermer l'onglet sans se déconnecter les
   laisserait lisibles (DevTools) — la déconnexion, elle, efface le disque. Les
   données re-hydratent depuis Supabase (sous RLS) à la prochaine connexion. */
const SENSITIVE_KEYS = [
  'mnd_payroll_runs', 'mnd_salary_advances', 'mnd_payroll_advances', 'mnd_attendance', 'mnd_leave_requests',
  'mnd_staff', 'mnd_tips_v2', 'mnd_tips',
  'mnd_primes', 'mnd_retenues', 'mnd_commission_rates', 'mnd_paie_overrides', 'mnd_paie_confirm',
  'mnd_access_codes',
  /* LES FICHES CLIENTES AUSSI. Elles restaient en clair dans le navigateur
     apres la deconnexion — nom, telephone, e-mail, anniversaire, et les notes
     de consultation sur le cuir chevelu, serialisees dans `client.notes`.
     Sur la tablette du comptoir, fermer la session ne retirait rien ; et le
     tunnel public « La Consultation » etant servi depuis la MEME origine
     (/trone/), toute faille sur cette page y avait acces de plein droit. */
  'mnd_clients', 'mnd_appointments', 'mnd_invoices', 'mnd_families',
  'mnd_consult_forms', 'mnd_consultations_queue', 'mnd_client_sessions',
];

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
  purgeLocalKeys(SENSITIVE_KEYS);
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

/** Connexion / inscription par GOOGLE — l'adresse est GARANTIE par Google :
    aucune adresse inventée ne peut ouvrir un compte par cette porte (demande
    de Yéman, 13 août — « yemanboya3@gmail.com » entrait avec un simple mot de
    passe). Nécessite le fournisseur Google activé au tableau de bord Supabase
    (Authentication → Providers → Google) et l'URL de l'app dans les
    « Redirect URLs ». La page PART chez Google : pas de retour d'erreur
    au-delà du lancement. */
export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Backend non configuré.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: appRedirect() },
  });
  if (error) throw error;
}

/* Les portes Apple et WhatsApp sont RETIRÉES (14 août, décision de Yéman) :
   leurs branchements ne valaient pas leur poids — Apple se paie à l'année,
   WhatsApp exige Twilio. Google reste la seule porte fédérée. */

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
