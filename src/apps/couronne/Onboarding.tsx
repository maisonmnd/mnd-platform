import { asset } from '../../shared/asset';
import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  signInClient, signUpClient, startPasswordReset, verifyPasswordReset, updatePassword,
  signInWithGoogle, verifyInscription, renvoyerLaConfirmation,
} from '../../shared/auth';
import { pushNotifyStaff } from '../../shared/push';

/* Onboarding — slides photographiques puis connexion par e-mail + mot de passe
   (même principe que Le Trône). La cliente s'inscrit avec son nom, son e-mail et
   un mot de passe ; ou se connecte si elle a déjà un compte. La session s'ouvre
   côté Supabase et le verrou d'App bascule alors automatiquement sur l'app.

   Mot de passe oublié : code à 6 chiffres par e-mail, puis nouveau mot de passe.
   Le code et le nouveau mot de passe sont demandés sur le MÊME écran, à dessein :
   vérifier le code ouvre déjà la session, donc le verrou d'App retire cet écran
   aussitôt. En enchaînant les deux appels dans une seule soumission, le mot de
   passe est bien redéfini avant que la cliente ne parte dans l'app. */

/* UNE LIGNE PAR PANNEAU (14 août — « élimine tous les textes inutiles ») :
   le panneau se lit en une seconde, la photo fait le reste. */
const SLIDES = [
  {
    photo: asset('/assets/photos/portrait-3.jpg'),
    pos: 'center 25%',
    eyebrow: 'Bénin · Édition Souveraine',
    title: 'Ma Couronne.',
    copy: 'Vos rendez-vous, votre suivi, votre Cercle, dans votre poche.',
  },
  {
    photo: asset('/assets/photos/model-microlocks.jpg'),
    pos: 'center 20%',
    eyebrow: 'La maison vous guide',
    title: 'Réservez en sept temps.',
    copy: 'Quelques gestes, acompte Mobile Money compris.',
  },
  {
    photo: asset('/assets/photos/portrait-2.jpg'),
    pos: 'center 25%',
    eyebrow: 'Mèche après mèche',
    title: 'Suivez votre couronne.',
    copy: 'Chaque séance consignée dans votre Carnet de Suivi.',
  },
];

/* Traduit les erreurs Supabase Auth en messages clairs pour la cliente. */
const errMessage = (e: unknown, fallback: string): string => {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  const raw = msg.toLowerCase();
  if (/invalid login credentials/.test(raw))
    return 'E-mail ou mot de passe incorrect.';
  if (/user already registered|already registered/.test(raw))
    return 'Ce compte existe déjà, connectez-vous avec votre mot de passe.';
  if (/password should be at least|weak.?password/.test(raw))
    return 'Mot de passe trop court, au moins 6 caractères.';
  if (/email.*not confirmed|confirm/.test(raw))
    return 'E-mail non confirmé, vérifiez votre boîte, puis connectez-vous.';
  if (/expired|invalid.*(token|otp)|(token|otp).*invalid/.test(raw))
    return 'Code invalide ou expiré, demandez-en un nouveau.';
  if (/should be different|same.*password/.test(raw))
    return 'Choisissez un mot de passe différent de l’ancien.';
  if (/rate limit|too many/.test(raw))
    return 'Trop de tentatives, patientez quelques minutes.';
  if (/sending|smtp|500|unexpected/.test(raw))
    return 'L’envoi de l’e-mail a échoué côté maison, réessayez dans un instant.';
  return msg && msg !== '{}' ? msg : fallback;
};

/* Apple et WhatsApp SONT RETIRÉS (14 août, décision de Yéman) : leurs
   branchements ne valaient pas leur poids — Apple se paie à l'année, WhatsApp
   exige Twilio. UNE seule porte fédérée reste : Google, qui garantit
   l'adresse. L'e-mail + mot de passe demeure la porte de la maison. */
/* ══ OUVRIR SON COMPTE LA PREMIÈRE FOIS — 4 septembre 2026 ═════════
   « Les clientes reçoivent un code de connexion au lieu d'un lien. Je parle de
   la première inscription à Ma Couronne » (Yéman).

   LA PORTE RENVOYAIT VERS UNE PORTE CLOSE. L'écran disait « Compte créé,
   confirmez votre e-mail, puis connectez-vous » et ramenait à la connexion. Or
   le gabarit d'e-mail de la Maison a été réécrit le 31 août pour porter un CODE
   à 6 chiffres, celui dont Le Trône avait besoin. La cliente recevait donc six
   chiffres, et Ma Couronne n'offrait nulle part où les saisir : le compte
   existait, le code arrivait, et elle restait dehors.

   `inscription-code` est cette porte manquante. Elle attend le LIEN, qui reste
   le chemin le plus court, et accepte le CODE quand c'est lui qui arrive. Une
   porte qui ne s'ouvre que d'une façon se referme dès que le courrier change. */
type Mode = 'connexion' | 'inscription' | 'oubli' | 'oubli-code' | 'inscription-code';

/* LA MARQUE DE LA PORTE — dessinée en SVG local (rien ne se charge dehors),
   à la taille du texte. Une porte se reconnaît à sa marque avant son mot. */
const MarqueGoogle = () => (
  <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);
export default function Onboarding() {
  const [stage, setStage] = useState<'welcome' | 'auth'>('welcome');
  const [slide, setSlide] = useState(0);
  const [mode, setMode] = useState<Mode>('inscription');

  /* PRÉNOM ET NOM SÉPARÉS (13 août, demande de Yéman) : un seul bloc « Nom
     complet » mélangeait les deux — et la Maison lit le PRÉNOM en tête
     (« Bonjour, Merine. », les pastilles, les rappels). La fiche garde un nom
     unique : « Prénom Nom », composé à l'inscription. */
  const [prenom, setPrenom] = useState('');
  const [nomFamille, setNomFamille] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /* UN LIEN QUI A ÉCHOUÉ DOIT LE DIRE. Supabase raccompagne la cliente ici avec
     son motif dans l'adresse (lien expiré, déjà utilisé) ; sans cette lecture,
     elle retombe sur l'écran de connexion sans un mot et croit s'être trompée
     de mot de passe. On efface ensuite le motif de la barre d'adresse : il n'a
     plus rien à y faire, et un rechargement le rejouerait. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dansLeFragment = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''));
    const motif = dansLeFragment.get('error_description')
      ?? new URLSearchParams(window.location.search).get('error_description');
    if (!motif) return;
    const dit = /expired|invalid/i.test(motif)
      ? 'Ce lien de confirmation a expiré. Demandez-en un nouveau ci-dessous.'
      : 'La confirmation n’a pas abouti. Demandez un nouveau lien ci-dessous.';
    setStage('auth');
    setMode('connexion');
    setErr(dit);
    window.history.replaceState(null, '', window.location.pathname + window.location.search.replace(/[?&]error[^&]*/g, ''));
  }, []);

  /* Les slides défilent doucement tant que l'on reste sur l'accueil. */
  useEffect(() => {
    if (stage !== 'welcome') return;
    const t = window.setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 4600);
    return () => window.clearInterval(t);
  }, [stage]);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  const goAuth = (m: Mode) => {
    setMode(m);
    setErr(null);
    setNotice(null);
    setStage('auth');
  };

  /* Demande d'un code de réinitialisation. On annonce l'envoi sans dire si le
     compte existe — inutile de renseigner un inconnu sur nos clientes. */
  const askReset = async () => {
    if (!emailOk) {
      setErr('Saisissez une adresse e-mail valide.');
      return;
    }
    setErr(null);
    setNotice(null);
    setBusy(true);
    try {
      await startPasswordReset(email.trim());
      setCode('');
      setPassword('');
      setMode('oubli-code');
      setNotice('Si ce compte existe, un code à 6 chiffres vient de partir. Vérifiez vos indésirables.');
    } catch (e) {
      setErr(errMessage(e, 'Envoi impossible, réessayez dans un instant.'));
    } finally {
      setBusy(false);
    }
  };

  /* Code + nouveau mot de passe en une seule soumission (voir l'en-tête). */
  const confirmReset = async () => {
    if (code.trim().length < 6) {
      setErr('Saisissez le code à 6 chiffres reçu par e-mail.');
      return;
    }
    if (password.length < 6) {
      setErr('Mot de passe : au moins 6 caractères.');
      return;
    }
    setErr(null);
    setNotice(null);
    setBusy(true);
    try {
      await verifyPasswordReset(email.trim(), code.trim());
      await updatePassword(password);
      /* La session est ouverte : le verrou d'App bascule sur l'app. */
    } catch (e) {
      setErr(errMessage(e, 'Réinitialisation impossible, réessayez.'));
    } finally {
      setBusy(false);
    }
  };

  /* Le code d'inscription, là où il arrive. Le vérifier OUVRE la session : le
     verrou d'App retire l'écran de lui-même, il n'y a rien à faire ensuite. */
  const confirmInscription = async () => {
    if (code.trim().length < 6) {
      setErr('Saisissez le code à 6 chiffres reçu par e-mail.');
      return;
    }
    setErr(null);
    setNotice(null);
    setBusy(true);
    try {
      await verifyInscription(email.trim(), code.trim());
    } catch (e) {
      setErr(errMessage(e, 'Code invalide ou expiré, demandez-en un nouveau.'));
    } finally {
      setBusy(false);
    }
  };

  const renvoyer = async () => {
    setErr(null);
    setNotice(null);
    setBusy(true);
    try {
      await renvoyerLaConfirmation(email.trim());
      setNotice('C’est reparti. Regardez aussi vos indésirables.');
    } catch (e) {
      setErr(errMessage(e, 'Envoi impossible pour l’instant, réessayez dans un moment.'));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (mode === 'oubli') return askReset();
    if (mode === 'oubli-code') return confirmReset();
    if (mode === 'inscription-code') return confirmInscription();
    if (mode === 'inscription' && !prenom.trim()) {
      setErr('Indiquez votre prénom.');
      return;
    }
    if (mode === 'inscription' && !nomFamille.trim()) {
      setErr('Indiquez votre nom de famille.');
      return;
    }
    if (!emailOk) {
      setErr('Saisissez une adresse e-mail valide.');
      return;
    }
    if (password.length < 6) {
      setErr('Mot de passe : au moins 6 caractères.');
      return;
    }
    setErr(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'inscription') {
        /* « Prénom Nom » — l'ordre que toute la Maison lit (firstName, fiches). */
        const nomComplet = `${prenom.trim()} ${nomFamille.trim()}`.replace(/\s+/g, ' ').trim();
        const { needsConfirmation, dejaInscrite } = await signUpClient(email.trim(), password, nomComplet);
        /* ══ S'INSCRIRE AVEC UNE ADRESSE CONNUE, C'EST SE CONNECTER ══════
           « Ça lui a ouvert carrément un nouveau compte avec la même adresse »
           (Yéman, 5 septembre 2026).

           SUR UN TÉLÉPHONE, LE RACCOURCI S'OUVRE SUR L'ACCUEIL, et « Commencer »
           est le bouton le plus gros. Une cliente qui a déjà son espace le
           touche sans y penser — et Supabase laisse créer un second compte tant
           que le premier n'est pas confirmé. Elle se retrouvait devant un
           espace vide, sa couronne à côté.

           ON NE LA RENVOIE PAS À UN AUTRE FORMULAIRE : son mot de passe est
           déjà tapé, on essaie d'entrer avec. Si c'est le bon, elle est chez
           elle sans rien avoir à refaire ; sinon on le lui dit, à sa place. */
        if (dejaInscrite) {
          try {
            await signInClient(email.trim(), password);
          } catch {
            setMode('connexion');
            setPassword('');
            setNotice('Cette adresse a déjà son espace. Entrez son mot de passe, ou demandez-en un nouveau.');
          }
          setBusy(false);
          return;
        }
        /* Alerte le personnel du Trône (Web Push) d'une nouvelle inscription. */
        void pushNotifyStaff('Nouvelle inscription Ma Couronne', nomComplet, '/trone/#/customers');
        if (needsConfirmation) {
          /* ON NE LA RENVOIE PLUS VERS LA CONNEXION. Son compte existe, mais son
             adresse n'est pas confirmée : s'y présenter ne peut que refuser. */
          setCode('');
          setPassword('');
          setMode('inscription-code');
        }
        /* Sinon : la session s'ouvre et le verrou d'App montre l'app. */
      } else {
        await signInClient(email.trim(), password);
      }
    } catch (e) {
      setErr(errMessage(e, mode === 'inscription' ? 'Inscription impossible, réessayez.' : 'Connexion impossible, réessayez.'));
    } finally {
      setBusy(false);
    }
  };

  /* ================= WELCOME ================= */
  if (stage === 'welcome') {
    const s = SLIDES[slide];
    return (
      <div className="mc-onb">
        <div className="mc-onb__hero" key={slide}>
          <img className="mc-onb__photo" src={s.photo} alt="" style={{ objectPosition: s.pos }} />
          <div className="mc-onb__veil" />
          <img className="mc-onb__seal" src={asset('/assets/monograms/mono-copper.png')} alt="" />
          <div className="mc-onb__hero-text">
            <div className="mc-micro-eyebrow">{s.eyebrow}</div>
            <div className="mc-onb__title">{s.title}</div>
          </div>
        </div>
        <div className="mc-onb__body">
          <p className="mc-onb__copy" key={`c${slide}`}>{s.copy}</p>
          <div className="mc-onb__dots" role="tablist">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                aria-label={`Aller au panneau ${i + 1}`}
                className={`mc-onb__dot ${i === slide ? 'is-on' : ''}`}
                onClick={() => setSlide(i)}
              />
            ))}
          </div>
          <button className="mc-cta mc-cta--copper" onClick={() => goAuth('inscription')}>Commencer</button>
          <button className="mc-cta mc-cta--outline" onClick={() => goAuth('connexion')}>J’ai déjà un compte</button>
        </div>
      </div>
    );
  }

  /* ================= CONNEXION / INSCRIPTION ================= */
  return (
    <div className="mc-onb-form mc-fade">
      <button className="mc-linkback" onClick={() => setStage('welcome')}>← Retour</button>
      <img className="mc-onb-form__seal" src={asset('/assets/monograms/mono-indigo.png')} alt="" />
      <div className="mc-micro-eyebrow" style={{ marginTop: 22 }}>Connexion souveraine</div>
      <h1 className="mc-serif-title">
        {mode === 'inscription' ? 'Créer mon compte.'
          : mode === 'inscription-code' ? 'Ouvrez votre couronne.'
          : mode === 'oubli' ? 'Mot de passe oublié.'
          : mode === 'oubli-code' ? 'Nouveau mot de passe.'
          : 'Bon retour.'}
      </h1>
      <p className="mc-lead">
        {mode === 'inscription'
          ? 'Votre prénom, votre nom, votre e-mail, un mot de passe, la maison vous reconnaît.'
          : mode === 'inscription-code'
          ? `Votre compte est créé. Un courrier vient de partir vers ${email.trim()} : ouvrez le lien qu'il contient, votre couronne s'ouvre toute seule. Si c'est un code à 6 chiffres qui vous est arrivé, saisissez-le ici.`
          : mode === 'oubli'
          ? 'Indiquez votre e-mail : la maison vous envoie un code à 6 chiffres.'
          : mode === 'oubli-code'
          ? 'Saisissez le code reçu, puis choisissez votre nouveau mot de passe.'
          : 'Entrez votre e-mail et votre mot de passe.'}
      </p>

      {mode === 'inscription' && (
        <>
          <label className="mc-field-label" htmlFor="mc-prenom">Prénom</label>
          <div className="mc-emailline">
            <input
              id="mc-prenom"
              type="text"
              value={prenom}
              autoComplete="given-name"
              placeholder="Votre prénom"
              onChange={(e) => { setPrenom(e.target.value); setErr(null); }}
            />
          </div>
          <label className="mc-field-label" htmlFor="mc-nom">Nom de famille</label>
          <div className="mc-emailline">
            <input
              id="mc-nom"
              type="text"
              value={nomFamille}
              autoComplete="family-name"
              placeholder="Votre nom"
              onChange={(e) => { setNomFamille(e.target.value); setErr(null); }}
            />
          </div>
        </>
      )}

      {mode !== 'oubli-code' && mode !== 'inscription-code' && (
        <>
          <label className="mc-field-label" htmlFor="mc-email">Adresse e-mail</label>
          <div className="mc-emailline">
            <input
              id="mc-email"
              type="email"
              value={email}
              inputMode="email"
              autoComplete="email"
              placeholder="vous@exemple.com"
              onChange={(e) => { setEmail(e.target.value); setErr(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            />
          </div>
        </>
      )}

      {(mode === 'oubli-code' || mode === 'inscription-code') && (
        <>
          <label className="mc-field-label" htmlFor="mc-code">Code reçu par e-mail</label>
          <div className="mc-emailline">
            <input
              id="mc-code"
              type="text"
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6 chiffres"
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setErr(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            />
          </div>
        </>
      )}

      {mode !== 'oubli' && mode !== 'inscription-code' && (
        <>
          <label className="mc-field-label" htmlFor="mc-password">
            {mode === 'oubli-code' ? 'Nouveau mot de passe' : 'Mot de passe'}
          </label>
          <div className="mc-emailline">
            <input
              id="mc-password"
              type={showPw ? 'text' : 'password'}
              value={password}
              autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
              placeholder="Au moins 6 caractères"
              onChange={(e) => { setPassword(e.target.value); setErr(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            />
            <button
              type="button"
              className="mc-pw-toggle"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              title={showPw ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </>
      )}

      {err && <div className="mc-form-err">{err}</div>}
      {notice && <div className="mc-form-notice">{notice}</div>}

      <button className="mc-cta mc-cta--indigo" disabled={busy} onClick={() => void submit()}>
        {busy ? 'Un instant…'
          : mode === 'inscription' ? 'Créer mon compte'
          : mode === 'inscription-code' ? 'Confirmer mon adresse'
          : mode === 'oubli' ? 'Envoyer le code'
          : mode === 'oubli-code' ? 'Définir le mot de passe'
          : 'Se connecter'}
      </button>

      {/* LA PORTE FÉDÉRÉE (14 août — Google seul, décision de Yéman) : elle
          GARANTIT l'adresse, aucune ne peut être inventée. */}
      {(mode === 'connexion' || mode === 'inscription') && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 10px', color: 'var(--ink-soft)', fontSize: 11.5, fontFamily: 'var(--font-sans)' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--hairline)' }} aria-hidden="true" />
            ou
            <span style={{ flex: 1, height: 1, background: 'var(--hairline)' }} aria-hidden="true" />
          </div>
          <button
            type="button"
            className="mc-cta mc-cta--outline"
            disabled={busy}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}
            onClick={() => {
              setErr(null);
              setNotice(null);
              setBusy(true);
              signInWithGoogle().catch((e) => {
                setBusy(false);
                setErr(errMessage(e, 'Google indisponible pour le moment, entrez par e-mail, ou réessayez plus tard.'));
              });
            }}
          >
            <MarqueGoogle /> Continuer avec Google
          </button>
        </>
      )}

      {mode === 'connexion' && (
        <button
          type="button"
          className="mc-authswitch"
          onClick={() => { setMode('oubli'); setPassword(''); setErr(null); setNotice(null); }}
        >
          Mot de passe oublié ?
        </button>
      )}

      {mode === 'oubli-code' && (
        <button type="button" className="mc-authswitch" disabled={busy} onClick={() => void askReset()}>
          Renvoyer un code
        </button>
      )}

      {mode === 'inscription-code' && (
        <button type="button" className="mc-authswitch" disabled={busy} onClick={() => void renvoyer()}>
          Renvoyer le courrier
        </button>
      )}

      <button
        type="button"
        className="mc-authswitch"
        onClick={() => {
          setMode((m) => (m === 'connexion' ? 'inscription' : 'connexion'));
          setErr(null);
          setNotice(null);
        }}
      >
        {mode === 'connexion' ? 'Première fois ? Créer un compte' : 'Déjà un compte ? Se connecter'}
      </button>
    </div>
  );
}
