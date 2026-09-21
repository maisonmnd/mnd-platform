import { useState, useEffect, type ReactNode, type FormEvent } from 'react';
import { Seal, Button, Field, Input } from '../../../ds/components';
import { maisonNom } from '../../../shared/identite';
import { useClients } from '../../../shared/clients';
import {
  useAuth, requireAuth, signInEmail, signUpEmail, signOut, loadStaff,
  startPasswordReset, verifyPasswordReset, updatePassword, origineDeLaSession, verifyInscription,
  renvoyerLaConfirmation, secondesAvantRenvoi, ATTENTE_ENTRE_RENVOIS,
  PanneDAcces } from '../../../shared/auth';
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

/* Vérifie que l'utilisateur connecté est bien rattaché au personnel.

   ── LE TRÔNE RESTE AU TRÔNE — 31 août 2026 ────────────────────────
   « Tout est très confus. Le Trône reste au Trône, Ma Couronne sur Ma
   Couronne. Que les comptes ne se mélangent pas » (Yéman).

   Une cliente qui arrivait ici lisait « votre compte n'est pas encore rattaché
   au personnel, un souverain doit vous autoriser ». C'est faux et c'est
   dangereux : elle n'a rien à faire rattacher, et cette phrase invitait le
   souverain à lui ouvrir l'ERP entier depuis « Comptes en attente ».

   La porte la reconnaît donc et la raccompagne chez elle. Les deux preuves,
   la même qu'à l'écran des accès : la marque posée à l'inscription, et la
   fiche cliente. */
function StaffGate({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  /* QUATRE RÉPONSES, PAS TROIS — 14 septembre 2026. « Vérification de vos
     accès… » et le Trône n'en sortait plus : la lecture avait été emportée
     par un `ERR_NETWORK_CHANGED`, la promesse rejetée n'a jamais traversé le
     `then`, et l'état est resté « je cherche » pour toujours.

     UNE PANNE NE SE CONFOND PAS AVEC UN REFUS. La dire « refus » aurait mis
     un souverain dehors avec un écran lui expliquant qu'il attend son
     autorisation ; la taire fige la porte. Elle se dit, elle se réessaie
     toute seule, et elle ne ferme rien. */
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'panne'>('loading');
  const [raison, setRaison] = useState('');
  const [essai, setEssai] = useState(0);
  const [clients] = useClients();
  const uid = session?.user?.id ?? '';
  const estCliente = origineDeLaSession(session) === 'couronne'
    || (!!uid && clients.some((c) => c.id === uid || c.authUserId === uid));

  useEffect(() => {
    let alive = true;
    setState('loading');
    void loadStaff()
      .then((s) => {
        if (alive) setState(s ? 'ok' : 'denied');
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setRaison(e instanceof PanneDAcces ? e.raison : String((e as { message?: string })?.message ?? e));
        setState('panne');
      });
    return () => {
      alive = false;
    };
  }, [session?.user?.id, essai]);

  /* ELLE SE RELÈVE TOUTE SEULE. Un réseau qui cligne ne doit pas demander un
     geste : on redemande, de plus en plus espacé, et le bouton n'est là que
     pour qui ne veut pas attendre. */
  useEffect(() => {
    if (state !== 'panne') return undefined;
    const attente = Math.min(30_000, 2000 * 2 ** Math.min(essai, 4));
    const t = window.setTimeout(() => setEssai((n) => n + 1), attente);
    return () => window.clearTimeout(t);
  }, [state, essai]);

  if (state === 'loading') return <AuthSplash>Vérification de vos accès…</AuthSplash>;
  if (state === 'panne') {
    return (
      <div className="tra-shell">
        <div className="tra-card">
          <Seal color="copper" size={40} />
          <div className="mnd-eyebrow" style={{ marginTop: 8 }}>La Maison n’a pas répondu</div>
          <h1 className="mnd-serif tra-title">Votre accès n’est pas en cause.</h1>
          <p className="tra-lede mnd-muted">
            La connexion s’est interrompue pendant la vérification. Ce n’est ni un refus ni une
            porte fermée : le Trône redemande tout seul, de plus en plus espacé.
            {raison ? <> Ce que le réseau a dit : <b>{raison}</b>.</> : null}
          </p>
          <Button variant="copper" onClick={() => setEssai((n) => n + 1)} className="tra-submit">
            Réessayer maintenant
          </Button>
          <Button variant="ghost" onClick={() => void signOut()} className="tra-submit">
            Se déconnecter
          </Button>
        </div>
      </div>
    );
  }
  if (state === 'denied' && estCliente) {
    return (
      <div className="tra-shell">
        <div className="tra-card">
          <Seal color="copper" size={40} />
          <div className="mnd-eyebrow" style={{ marginTop: 8 }}>Ce n'est pas votre porte</div>
          <h1 className="mnd-serif tra-title">Votre espace est Ma Couronne.</h1>
          <p className="tra-lede mnd-muted">
            Ce compte est celui d'une cliente de la Maison. Le Trône est l'atelier, réservé à
            l'équipe. Vos rendez-vous, votre suivi et votre formule vous attendent dans
            Ma Couronne, avec ce même compte.
          </p>
          <a className="tra-submit mnd-btn mnd-btn--copper" href="/couronne/" style={{ textDecoration: 'none', textAlign: 'center' }}>
            Ouvrir Ma Couronne
          </a>
          <Button variant="ghost" onClick={() => void signOut()} className="tra-submit">
            Se déconnecter
          </Button>
        </div>
      </div>
    );
  }
  if (state === 'denied') {
    return (
      <div className="tra-shell">
        <div className="tra-card">
          <Seal color="copper" size={40} />
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
        <Seal color="copper" size={44} />
        <p className="tra-splash mnd-serif">{children}</p>
      </div>
    </div>
  );
}

/* 'oubli' → demande d'un code ; 'oubli-code' → code + nouveau mot de passe.
   Les deux sont sur le même écran à dessein : vérifier le code ouvre déjà la
   session, donc le gate retirerait l'écran avant la saisie du mot de passe.
   Les deux appels s'enchaînent dans une seule soumission. */
/* `inscription-code` : le gabarit Supabase envoie un CODE, pas un lien —
   voir `verifyInscription`. La porte le prend là où il arrive. */
type Mode = 'connexion' | 'fondation' | 'oubli' | 'oubli-code' | 'inscription-code';

function Login() {
  const [mode, setMode] = useState<Mode>('connexion');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /* L'ATTENTE AVANT DE RENVOYER — 21 septembre 2026. « Quand je ne reçois pas
     le code, avoir un bouton qui me permet de renvoyer le code » (Yéman). Le
     serveur refuse deux envois trop rapprochés : le bouton le dit et compte,
     au lieu de laisser cliquer dans le vide. */
  const [attente, setAttente] = useState(0);

  useEffect(() => {
    if (attente <= 0) return;
    const t = window.setInterval(() => setAttente((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, [attente > 0]);

  /* Envoi d'un code. On n'indique jamais si le compte existe. */
  const askReset = async () => {
    await startPasswordReset(email);
    setCode('');
    setPassword('');
    setMode('oubli-code');
    setNotice('Si ce compte existe, un code à 6 chiffres vient de partir. Vérifiez vos indésirables.');
  };

  /* RENVOYER LE CODE, selon la porte où l'on se tient : la confirmation
     d'inscription, ou le mot de passe oublié. */
  const renvoieLeCode = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'inscription-code') {
        await renvoyerLaConfirmation(email);
        setNotice('Un nouveau code vient de partir. Vérifiez aussi vos indésirables.');
      } else {
        await askReset();
      }
      setAttente(ATTENTE_ENTRE_RENVOIS);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      const dans = secondesAvantRenvoi(m);
      if (dans > 0) { setAttente(dans); setError(`Un code vient déjà de partir. Réessayez dans ${dans} secondes.`); }
      else setError(messageFor(err));
    } finally {
      setBusy(false);
    }
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
      } else if (mode === 'inscription-code') {
        if (code.trim().length < 6) {
          setError('Saisissez le code à 6 chiffres reçu par e-mail.');
          return;
        }
        await verifyInscription(email, code.trim());
        /* La session s'ouvre : le gate vérifie le rattachement et dit la
           suite — entrée pour le personnel, attente pour les autres. */
      } else if (mode === 'fondation') {
        const { needsConfirmation } = await signUpEmail(email, password, name);
        if (needsConfirmation) {
          /* ON NE RENVOIE PLUS VERS UNE PORTE CLOSE — 31 août 2026. L'écran
             disait « confirmez votre e-mail, puis connectez-vous » et
             ramenait à la connexion : or l'e-mail porte un CODE, qui n'avait
             nulle part où être saisi. Le compte existait, le code arrivait,
             et la porte restait fermée. */
          setNotice('Compte créé. Saisissez le code à 6 chiffres reçu par e-mail.');
          setMode('inscription-code');
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
          <Seal color="copper" size={40} />
          <div>
            <div className="mnd-eyebrow">Le Trône</div>
            <h1 className="mnd-serif tra-title">{maisonNom()}</h1>
          </div>
        </div>

        <p className="tra-lede mnd-muted">
          {mode === 'connexion'
            ? 'Entrez dans la salle du conseil.'
            : mode === 'fondation'
            /* LE BOUTON MENTAIT AUX SUIVANTS — 31 août 2026. Il n'y a qu'une
               fondation ; les comptes d'après attendent d'être autorisés. Le
               dire ici évite qu'une collègue croie devenir souveraine, et
               qu'une cliente croie devoir passer par là. */
            ? 'Créez votre compte d’équipe. Le tout premier fonde la Maison ; les suivants attendent qu’un souverain les autorise. Vous êtes cliente ? C’est dans Ma Couronne.'
            : mode === 'oubli'
            ? 'Indiquez votre e-mail : la Maison vous envoie un code à 6 chiffres.'
            : mode === 'inscription-code'
            ? 'Votre compte est créé. Saisissez le code à 6 chiffres reçu par e-mail pour confirmer votre adresse.'
            : 'Saisissez le code reçu, puis choisissez votre nouveau mot de passe.'}
        </p>

        {mode === 'fondation' && (
          <Field label="Votre nom">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du fondateur" autoComplete="name" />
          </Field>
        )}

        {mode !== 'oubli-code' && mode !== 'inscription-code' && (
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
        )}

        {(mode === 'oubli-code' || mode === 'inscription-code') && (
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

        {/* À la confirmation, le mot de passe est DÉJÀ choisi : le redemander
            ferait croire qu'on peut en changer, et l'écran mentirait. */}
        {mode !== 'oubli' && mode !== 'inscription-code' && (
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
            /* LE BOUTON DISAIT ENCORE « FONDER LA MAISON » — 31 août 2026.
               Le texte au-dessus avait été corrigé, pas lui : une collègue qui
               crée son compte croyait encore fonder quelque chose. */
            : mode === 'fondation' ? 'Créer mon compte'
            : mode === 'oubli' ? 'Envoyer le code'
            : mode === 'inscription-code' ? 'Confirmer mon adresse'
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

        {(mode === 'oubli-code' || mode === 'inscription-code') && (
          <button
            type="button"
            className="tra-switch"
            disabled={busy || attente > 0}
            onClick={() => { void renvoieLeCode(); }}
          >
            {attente > 0 ? `Renvoyer le code dans ${attente} s` : 'Je n’ai rien reçu, renvoyer le code'}
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
          {mode === 'connexion' ? 'Vous êtes de l’équipe ? Créer un compte' : 'Déjà un compte ? Se connecter'}
        </button>
      </form>
    </div>
  );
}

function messageFor(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  /* UNE ERREUR VIDE N'EST PAS UN MESSAGE — 21 septembre 2026. Quand le
     serveur de courrier refuse (adresse inexistante, identifiants refusés),
     Supabase renvoie un corps vide et l'écran affichait « {} » dans un cadre,
     que personne ne pouvait comprendre. */
  if (!m.trim() || m.trim() === '{}' || m === '[object Object]' || /^\{\s*\}$/.test(m.trim())) {
    return 'L’e-mail n’a pas pu être envoyé. Vérifiez que l’adresse existe vraiment, puis réessayez.';
  }
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
