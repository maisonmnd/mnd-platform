import { useState, type ReactNode, type FormEvent } from 'react';
import { Seal, Button, Field, Input } from '../../../ds/components';
import { useAuth, requireAuth, signInEmail, signUpEmail } from '../../../shared/auth';
import './auth.css';

/* Porte d'entrée du Trône. Tant que l'enforcement n'est pas demandé
   (`requireAuth` faux), l'application s'affiche comme aujourd'hui.
   Sinon : session présente → l'ERP ; sinon → l'écran de connexion. */

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (!requireAuth) return <>{children}</>;
  if (loading) return <AuthSplash>La Maison s'éveille…</AuthSplash>;
  if (!session) return <Login />;
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

type Mode = 'connexion' | 'fondation';

function Login() {
  const [mode, setMode] = useState<Mode>('connexion');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'fondation') {
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
            <h1 className="mnd-serif tra-title">Maison MND</h1>
          </div>
        </div>

        <p className="tra-lede mnd-muted">
          {mode === 'connexion'
            ? 'Entrez dans la salle du conseil.'
            : 'Fondez la Maison — ce premier compte devient souverain.'}
        </p>

        {mode === 'fondation' && (
          <Field label="Votre nom">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du fondateur" autoComplete="name" />
          </Field>
        )}

        <Field label="E-mail">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>

        <Field label="Mot de passe">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'fondation' ? 'new-password' : 'current-password'}
          />
        </Field>

        {error && <div className="tra-error">{error}</div>}
        {notice && <div className="tra-notice">{notice}</div>}

        <Button type="submit" disabled={busy} size="lg" className="tra-submit">
          {busy ? 'Un instant…' : mode === 'connexion' ? 'Se connecter' : 'Fonder la Maison'}
        </Button>

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
  if (/user already registered/i.test(m)) return 'Ce compte existe déjà — connectez-vous.';
  if (/email.*confirm/i.test(m)) return 'E-mail non confirmé. Vérifiez votre boîte.';
  return m;
}
