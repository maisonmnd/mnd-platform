import { asset } from '../../shared/asset';
import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { signInClient, signUpClient } from '../../shared/auth';
import { pushNotifyStaff } from '../../shared/push';

/* Onboarding — slides photographiques puis connexion par e-mail + mot de passe
   (même principe que Le Trône). La cliente s'inscrit avec son nom, son e-mail et
   un mot de passe ; ou se connecte si elle a déjà un compte. La session s'ouvre
   côté Supabase et le verrou d'App bascule alors automatiquement sur l'app. */

const SLIDES = [
  {
    photo: asset('/assets/photos/portrait-3.jpg'),
    pos: 'center 25%',
    eyebrow: 'Bénin · Édition Souveraine',
    title: 'Ma Couronne.',
    copy: 'Votre rituel, vos locks, votre lignée — réunis dans un seul espace. Réservez, suivez votre couronne, transmettez la reconnaissance.',
  },
  {
    photo: asset('/assets/photos/model-microlocks.jpg'),
    pos: 'center 20%',
    eyebrow: 'La maison vous guide',
    title: 'Réservez en sept temps.',
    copy: 'De l’objectif à l’acompte Mobile Money, chaque décision est simple, claire, accompagnée par vos maîtres.',
  },
  {
    photo: asset('/assets/photos/portrait-2.jpg'),
    pos: 'center 25%',
    eyebrow: 'Mèche après mèche',
    title: 'Suivez votre couronne.',
    copy: 'Avant, après, chaque séance consignée dans votre Carnet de Suivi — le héros, c’est vous. MND veille.',
  },
];

/* Traduit les erreurs Supabase Auth en messages clairs pour la cliente. */
const errMessage = (e: unknown, fallback: string): string => {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  const raw = msg.toLowerCase();
  if (/invalid login credentials/.test(raw))
    return 'E-mail ou mot de passe incorrect.';
  if (/user already registered|already registered/.test(raw))
    return 'Ce compte existe déjà — connectez-vous avec votre mot de passe.';
  if (/password should be at least|weak.?password/.test(raw))
    return 'Mot de passe trop court — au moins 6 caractères.';
  if (/email.*not confirmed|confirm/.test(raw))
    return 'E-mail non confirmé — vérifiez votre boîte, puis connectez-vous.';
  if (/rate limit|too many/.test(raw))
    return 'Trop de tentatives — patientez quelques minutes.';
  if (/sending|smtp|500|unexpected/.test(raw))
    return 'L’envoi de l’e-mail a échoué côté maison — réessayez dans un instant.';
  return msg && msg !== '{}' ? msg : fallback;
};

type Mode = 'connexion' | 'inscription';

export default function Onboarding() {
  const [stage, setStage] = useState<'welcome' | 'auth'>('welcome');
  const [slide, setSlide] = useState(0);
  const [mode, setMode] = useState<Mode>('inscription');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const submit = async () => {
    if (mode === 'inscription' && !name.trim()) {
      setErr('Indiquez votre nom.');
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
        const { needsConfirmation } = await signUpClient(email.trim(), password, name.trim());
        /* Alerte le personnel du Trône (Web Push) d'une nouvelle inscription. */
        void pushNotifyStaff('Nouvelle inscription Ma Couronne', name.trim(), '/trone/#/customers');
        if (needsConfirmation) {
          setNotice('Compte créé. Confirmez votre e-mail, puis connectez-vous.');
          setMode('connexion');
        }
        /* Sinon : la session s'ouvre et le verrou d'App montre l'app. */
      } else {
        await signInClient(email.trim(), password);
      }
    } catch (e) {
      setErr(errMessage(e, mode === 'inscription' ? 'Inscription impossible — réessayez.' : 'Connexion impossible — réessayez.'));
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
          <img src={s.photo} alt="" style={{ objectPosition: s.pos }} />
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
      <h1 className="mc-serif-title">{mode === 'inscription' ? 'Créer mon compte.' : 'Bon retour.'}</h1>
      <p className="mc-lead">
        {mode === 'inscription'
          ? 'Votre nom, votre e-mail, un mot de passe — la maison vous reconnaît.'
          : 'Entrez votre e-mail et votre mot de passe.'}
      </p>

      {mode === 'inscription' && (
        <>
          <label className="mc-field-label" htmlFor="mc-name">Nom complet</label>
          <div className="mc-emailline">
            <input
              id="mc-name"
              type="text"
              value={name}
              autoComplete="name"
              placeholder="Nom et prénom"
              onChange={(e) => { setName(e.target.value); setErr(null); }}
            />
          </div>
        </>
      )}

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
        />
      </div>

      <label className="mc-field-label" htmlFor="mc-password">Mot de passe</label>
      <div className="mc-emailline">
        <input
          id="mc-password"
          type={showPw ? 'text' : 'password'}
          value={password}
          autoComplete={mode === 'inscription' ? 'new-password' : 'current-password'}
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

      {err && <div className="mc-form-err">{err}</div>}
      {notice && <div className="mc-form-notice">{notice}</div>}

      <button className="mc-cta mc-cta--indigo" disabled={busy} onClick={() => void submit()}>
        {busy ? 'Un instant…' : mode === 'inscription' ? 'Créer mon compte' : 'Se connecter'}
      </button>

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
