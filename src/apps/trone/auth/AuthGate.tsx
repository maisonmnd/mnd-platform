import { useState, useEffect, type ReactNode, type FormEvent } from 'react';
import { Seal, Button, Field, Input } from '../../../ds/components';
import { maisonNom } from '../../../shared/identite';
import {
  useAuth, requireAuth, signInEmail, signUpEmail, signOut, loadStaff,
  startPasswordReset, verifyPasswordReset, updatePassword,
} from '../../../shared/auth';
import './auth.css';

/* Porte d'entrée du Trône. Tant que l'enforcement n'est pas demandé
   (`requireAuth` faux), l'application s'affiche comme aujourd'hui.
   Sinon : session + compte rattaché au personnel → l'ERP ; sinon connexion ou
   écran « en attente d'autorisation » (un compte créé sans rattachement au
   personnel ne peut pas entrer — le premier compte devient souverain). */

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (!requireAuth) return <>{children}</>;
  if (loading) return <AuthSplash>La Maison s'éveille…</AuthSplash>;
  if (!session) return <Login />;
  return <StaffGate>{children}</StaffGate>;
}

/* Vérifie que l'utilisateur connecté est bien rattaché au personnel. */
function StaffGate({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    void loadStaff().then((s) => {
      if (alive) setState(s ? 'ok' : 'denied');
    });
    return () => {
      alive = false;
    };
  }, [session?.user?.id]);

  if (state === 'loading') return <AuthSplash>Vérification de vos accès…</AuthSplash>;
  if (state === 'denied') {
    return (
      <div className="tra-shell">
        <div className="tra-card">
          <Seal color="or" size={40} />
          <div className="mnd-eyebrow" style={{ marginTop: 8 }}>Accès en attente</div>
          <h1 className="mnd-serif tra-title">Compte non rattaché.</h1>
          <p className="tra-lede mnd-muted">
            Votre compte existe, mais il n'est pas encore rattaché au personnel de la Maison.
            Un souverain doit vous autoriser depuis Le Trône.
          </p>
          <Button variant="ghost" onClick={() => void signOut()} className="tra-submit">
            Se déconnecter
          </Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function AuthSplash({ children }: { children: ReactNode }) {
  return (
    <div className="tra-shell">
      <div className="tra-card">
        <Seal color="or" size={44} />
        <p className="tra-splash mnd-serif">{children}</p>
      </div>
    </div>
  );
}

/* 'oubli' → demande d'un code ; 'oubli-code' → code + nouveau mot de passe.
   Les deux sont sur le même écran à dessein : vérifier le code ouvre déjà la
   session, donc le gate retirerait l'écran avant la saisie du mot de passe.
   Les deux appels s'enchaînent dans une seule soumission. */
type Mode = 'connexion' | 'fondation' | 'oubli' | 'oubli-code';

function Login() {
  const [mode, setMode] = useState<Mode>('connexion');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /* Envoi d'un code. On n'indique jamais si le compte existe. */
  const askReset = async () => {
    await startPasswordReset(email);
    setCode('');
    setPassword('');
    setMode('oubli-code');
    setNotice('Si ce compte existe, un code à 6 chiffres vient de partir. Vérifiez vos indésirables.');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'oubli') {
        await askReset();
      } else if (mode === 'oubli-code') {
        if (code.trim().length < 6) {
          setError('Saisissez le code à 6 chiffres reçu par e-mail.');
          return;
        }
        await verifyPasswordReset(email, code.trim());
        await updatePassword(password);
        // La session est ouverte : le gate vérifie le rattachement et laisse entrer.
      } else if (mode === 'fondation') {
        const { needsConfirmation } = await signUpEmail(email, password, name);
        if (needsConfirmation) {
          setNotice('Compte créé. Confirmez votre e-mail, puis connectez-vous.');
          setMode('connexion');
        }
        // Sinon, la session s'ouvre et le gate laisse entrer.
      } else {
        await signInEmail(email, password);
      }
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tra-shell">
      <form className="tra-card" onSubmit={submit}>
        <div className="tra-head">
          <Seal color="or" size={40} />
          <div>
            <div className="mnd-eyebrow">Le Trône</div>
            <h1 className="mnd-serif tra-title">{maisonNom()}</h1>
          </div>
        </div>

        <p className="tra-lede mnd-muted">
          {mode === 'connexion'
            ? 'Entrez dans la salle du conseil.'
            : mode === 'fondation'
            ? 'Fondez la Maison, ce premier compte devient souverain.'
            : mode === 'oubli'
            ? 'Indiquez votre e-mail : la Maison vous envoie un code à 6 chiffres.'
            : 'Saisissez le code reçu, puis choisissez votre nouveau mot de passe.'}
        </p>

        {mode === 'fondation' && (
          <Field label="Votre nom">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du fondateur" autoComplete="name" />
          </Field>
        )}

        {mode !== 'oubli-code' && (
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
        )}

        {mode === 'oubli-code' && (
          <Field label="Code reçu par e-mail">
            <Input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
              inputMode="numeric"
              maxLength={6}
              placeholder="6 chiffres"
              autoComplete="one-time-code"
            />
          </Field>
        )}

        {mode !== 'oubli' && (
          <Field label={mode === 'oubli-code' ? 'Nouveau mot de passe' : 'Mot de passe'}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
            />
          </Field>
        )}

        {error && <div className="tra-error">{error}</div>}
        {notice && <div className="tra-notice">{notice}</div>}

        <Button type="submit" disabled={busy} size="lg" className="tra-submit">
          {busy ? 'Un instant…'
            : mode === 'connexion' ? 'Se connecter'
            : mode === 'fondation' ? 'Fonder la Maison'
            : mode === 'oubli' ? 'Envoyer le code'
            : 'Définir le mot de passe'}
        </Button>

        {mode === 'connexion' && (
          <button
            type="button"
            className="tra-switch"
            onClick={() => { setMode('oubli'); setPassword(''); setError(null); setNotice(null); }}
          >
            Mot de passe oublié ?
          </button>
        )}

        {mode === 'oubli-code' && (
          <button
            type="button"
            className="tra-switch"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              setNotice(null);
              void askReset().catch((err) => setError(messageFor(err))).finally(() => setBusy(false));
            }}
          >
            Renvoyer un code
          </button>
        )}

        <button
          type="button"
          className="tra-switch"
          onClick={() => {
            setMode((m) => (m === 'connexion' ? 'fondation' : 'connexion'));
            setError(null);
            setNotice(null);
          }}
        >
          {mode === 'connexion' ? 'Première fois ? Fonder la Maison' : 'Déjà un compte ? Se connecter'}
        </button>
      </form>
    </div>
  );
}

function messageFor(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
  if (/user already registered/i.test(m)) return 'Ce compte existe déjà, connectez-vous.';
  if (/email.*confirm/i.test(m)) return 'E-mail non confirmé. Vérifiez votre boîte.';
  if (/expired|invalid.*(token|otp)|(token|otp).*invalid/i.test(m))
    return 'Code invalide ou expiré, demandez-en un nouveau.';
  if (/should be different|same.*password/i.test(m))
    return 'Choisissez un mot de passe différent de l’ancien.';
  if (/rate limit|too many/i.test(m)) return 'Trop de tentatives, patientez quelques minutes.';
  if (/sending|smtp|500|unexpected/i.test(m))
    return 'L’envoi de l’e-mail a échoué côté maison, réessayez dans un instant.';
  return m;
}
