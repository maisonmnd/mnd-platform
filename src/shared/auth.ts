import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isRemote } from './supabase';

/* Authentification — couche mince au-dessus de Supabase Auth.

   - Personnel (Le Trône / LOKAA) : e-mail + mot de passe. Le tout premier compte
     devient « souverain » (RPC `provision_first_staff`).
   - Cliente (Ma Couronne) : OTP téléphone (WhatsApp/SMS) — helpers prêts, à
     activer quand un fournisseur de messagerie est configuré côté Supabase.

   L'application reste ouverte tant que l'ENFORCEMENT n'est pas demandé :
   `requireAuth` n'est vrai que si un backend existe ET VITE_REQUIRE_AUTH=true.
   Sans backend, tout est local et l'auth est inerte. */

/** Un backend est configuré (des sessions sont possibles). */
export const authEnabled = isRemote;

/** L'accès est-il verrouillé derrière une connexion ? (à coupler au durcissement RLS) */
export const requireAuth = isRemote && import.meta.env.VITE_REQUIRE_AUTH === 'true';

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
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
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

// ---------- Actions cliente (OTP téléphone) — prêtes pour Ma Couronne ----------
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
