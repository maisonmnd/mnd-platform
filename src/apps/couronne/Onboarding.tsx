import { asset } from '../../shared/asset';
import { useEffect, useRef, useState } from 'react';
import { startEmailOtp, verifyEmailOtp } from '../../shared/auth';

/* Onboarding — slides photographiques puis connexion par e-mail + code à 6 chiffres.
   Sans mot de passe : la maison vous reconnaît. La session s'ouvre côté Supabase
   (verifyEmailOtp) ; le verrou d'App bascule alors automatiquement sur l'app. */

const SLIDES = [
  {
    // Photo sans logo incrusté (l'ancienne ma-couronne-hero.png portait un logo
    // gravé → double logo avec le sceau). Le sceau cuivre suffit à signer la marque.
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
  if (/rate limit|too many|over_email_send/.test(raw))
    return 'Trop de demandes de code — patientez quelques minutes avant de réessayer.';
  if (/for security purposes|only request this after|seconds/.test(raw))
    return 'Patientez quelques secondes avant de redemander un code.';
  if (/expired|invalid|otp|token/.test(raw))
    return 'Code expiré ou incorrect — demandez un nouveau code (n’utilisez pas le lien de l’e-mail).';
  if (/sending|confirmation email|unexpected|smtp|500/.test(raw))
    return 'L’envoi de l’e-mail a échoué côté maison — réessayez dans un instant, ou prévenez-nous.';
  if (/email.*disabled|provider|signups? not allowed/.test(raw))
    return 'La connexion par e-mail n’est pas encore activée côté maison.';
  return msg && msg !== '{}' ? msg : fallback;
};

export default function Onboarding() {
  const [stage, setStage] = useState<'welcome' | 'email' | 'otp'>('welcome');
  const [slide, setSlide] = useState(0);

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* Les slides défilent doucement tant que l'on reste sur l'accueil. */
  useEffect(() => {
    if (stage !== 'welcome') return;
    const t = window.setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 4600);
    return () => window.clearInterval(t);
  }, [stage]);

  /* ---- Code à 6 chiffres ---- */
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [resendIn, setResendIn] = useState(45);
  useEffect(() => {
    if (stage !== 'otp' || resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [stage, resendIn]);

  const digits = otp.join('');
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  const sendCode = async () => {
    if (!emailOk) {
      setErr('Saisissez une adresse e-mail valide.');
      return;
    }
    setErr(null);
    setSending(true);
    try {
      await startEmailOtp(email.trim());
      setOtp(['', '', '', '', '', '']);
      setResendIn(60);
      setStage('otp');
    } catch (e) {
      setErr(errMessage(e, 'Envoi impossible — réessayez dans un instant.'));
    } finally {
      setSending(false);
    }
  };

  const resend = async () => {
    setErr(null);
    try {
      await startEmailOtp(email.trim());
      setResendIn(60);
    } catch (e) {
      setErr(errMessage(e, 'Renvoi impossible — réessayez.'));
    }
  };

  const enterApp = async () => {
    if (digits.length < 6) {
      setErr('Saisissez le code à 6 chiffres reçu par e-mail.');
      return;
    }
    setErr(null);
    setVerifying(true);
    try {
      await verifyEmailOtp(email.trim(), digits);
      /* Succès : onAuthStateChange ouvre la session, le verrou d'App montre l'app. */
    } catch (e) {
      setErr(errMessage(e, 'Code invalide ou expiré — vérifiez et réessayez.'));
      setVerifying(false);
    }
  };

  const onOtpChange = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1);
    setOtp((prev) => {
      const next = [...prev];
      next[i] = d;
      return next;
    });
    setErr(null);
    if (d && i < 5) boxRefs.current[i + 1]?.focus();
  };
  const onOtpKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) boxRefs.current[i - 1]?.focus();
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
          <button className="mc-cta mc-cta--copper" onClick={() => setStage('email')}>Commencer</button>
          <button className="mc-cta mc-cta--outline" onClick={() => setStage('email')}>J’ai déjà un compte</button>
        </div>
      </div>
    );
  }

  /* ================= E-MAIL ================= */
  if (stage === 'email') {
    return (
      <div className="mc-onb-form mc-fade">
        <button className="mc-linkback" onClick={() => setStage('welcome')}>← Retour</button>
        <img className="mc-onb-form__seal" src={asset('/assets/monograms/mono-indigo.png')} alt="" />
        <div className="mc-micro-eyebrow" style={{ marginTop: 22 }}>Connexion souveraine</div>
        <h1 className="mc-serif-title">Votre e-mail.</h1>
        <p className="mc-lead">Un code de vérification vous sera transmis par e-mail. Sans mot de passe — la maison vous reconnaît.</p>

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
            onKeyDown={(e) => { if (e.key === 'Enter') void sendCode(); }}
          />
        </div>

        {err && <div className="mc-form-err">{err}</div>}

        <div className="mc-langrow">
          <span>Langue</span>
          <span className="mc-langrow__on">FR</span>
          <span className="mc-langrow__off">EN</span>
        </div>
        <button className="mc-cta mc-cta--indigo" disabled={sending} onClick={() => void sendCode()}>
          {sending ? 'Envoi…' : 'Recevoir mon code'}
        </button>
      </div>
    );
  }

  /* ================= CODE ================= */
  return (
    <div className="mc-onb-form mc-fade">
      <button className="mc-linkback" onClick={() => setStage('email')}>← Retour</button>
      <img className="mc-onb-form__seal" src={asset('/assets/monograms/mono-indigo.png')} alt="" />
      <div className="mc-micro-eyebrow" style={{ marginTop: 22 }}>Vérification</div>
      <h1 className="mc-serif-title">Votre code.</h1>
      <p className="mc-lead">
        Saisissez le code à 6 chiffres reçu par e-mail à {email.trim()}.
        Entrez le code ici — inutile de cliquer sur le lien.
      </p>

      <div className="mc-otp">
        {otp.map((v, i) => (
          <input
            key={i}
            ref={(el) => { boxRefs.current[i] = el; }}
            className="mc-otp__box"
            value={v}
            inputMode="numeric"
            maxLength={2}
            aria-label={`Chiffre ${i + 1}`}
            onChange={(e) => onOtpChange(i, e.target.value)}
            onKeyDown={(e) => onOtpKey(i, e)}
          />
        ))}
      </div>

      {err && <div className="mc-form-err">{err}</div>}

      <div className="mc-resend">
        {resendIn > 0 ? (
          <>Renvoyer le code dans <span>0:{resendIn < 10 ? `0${resendIn}` : resendIn}</span></>
        ) : (
          <button className="mc-resend__btn" onClick={() => void resend()}>Renvoyer le code</button>
        )}
      </div>

      <button
        className="mc-cta mc-cta--copper"
        style={{ marginTop: 'auto' }}
        disabled={verifying}
        onClick={() => void enterApp()}
      >
        {verifying ? 'Vérification…' : 'Entrer dans Ma Couronne'}
      </button>
    </div>
  );
}
