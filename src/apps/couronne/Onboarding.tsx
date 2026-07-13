import { asset } from '../../shared/asset';
import { useEffect, useRef, useState } from 'react';
import { useBranch } from '../../shared/branches';
import { clientsStore } from '../../shared/clients';
import { CLIENT_ID, sessionStore, useClient } from './lib';

/* Onboarding — slides photographiques, connexion par téléphone + OTP WhatsApp.
   Sans mot de passe : la maison vous reconnaît. */

const SLIDES = [
  {
    photo: asset('/assets/photos/ma-couronne-hero.png'),
    pos: 'center 30%',
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

export default function Onboarding() {
  const { branch } = useBranch();
  const client = useClient();
  const dial = branch.dial || '+229';

  const [stage, setStage] = useState<'welcome' | 'phone' | 'otp'>('welcome');
  const [slide, setSlide] = useState(0);
  /* Aucun numéro de démonstration — le profil réel, s'il existe, pré-remplit. */
  const defaultPhone = (client?.phone ?? '').replace(/^\+\d+\s*/, '');
  const [phone, setPhone] = useState(defaultPhone);
  const [channel, setChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
  const [err, setErr] = useState<string | null>(null);

  /* Les slides défilent doucement tant que l'on reste sur l'accueil. */
  useEffect(() => {
    if (stage !== 'welcome') return;
    const t = window.setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 4600);
    return () => window.clearInterval(t);
  }, [stage]);

  /* ---- OTP ---- */
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [resendIn, setResendIn] = useState(45);
  useEffect(() => {
    if (stage !== 'otp' || resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [stage, resendIn]);

  const digits = otp.join('');
  const phoneDigits = phone.replace(/\D/g, '');

  const toOtp = () => {
    if (phoneDigits.length < 8) {
      setErr('Saisissez un numéro valide — 8 chiffres au moins.');
      return;
    }
    setErr(null);
    setOtp(['', '', '', '', '', '']);
    setResendIn(45);
    setStage('otp');
  };

  const enterApp = () => {
    if (digits.length < 4) {
      setErr('Saisissez le code reçu — 4 à 6 chiffres.');
      return;
    }
    setErr(null);
    const fullPhone = `${dial} ${phone.trim()}`;
    /* Le numéro vérifié devient celui du profil — le CRM partagé reste la vérité. */
    clientsStore.set((prev) => prev.map((c) => (c.id === CLIENT_ID ? { ...c, phone: fullPhone } : c)));
    sessionStore.set({
      phone: fullPhone,
      clientId: CLIENT_ID,
      loggedAt: new Date().toISOString(),
    });
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
          <img className="mc-onb__seal" src={asset("/assets/monograms/mono-copper.png")} alt="" />
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
          <button className="mc-cta mc-cta--copper" onClick={() => setStage('phone')}>Commencer</button>
          <button className="mc-cta mc-cta--outline" onClick={() => setStage('phone')}>J’ai déjà un compte</button>
        </div>
      </div>
    );
  }

  /* ================= PHONE ================= */
  if (stage === 'phone') {
    return (
      <div className="mc-onb-form mc-fade">
        <button className="mc-linkback" onClick={() => setStage('welcome')}>← Retour</button>
        <img className="mc-onb-form__seal" src={asset("/assets/monograms/mono-indigo.png")} alt="" />
        <div className="mc-micro-eyebrow" style={{ marginTop: 22 }}>Connexion souveraine</div>
        <h1 className="mc-serif-title">Votre téléphone.</h1>
        <p className="mc-lead">Un code de vérification vous sera transmis. Sans mot de passe — la maison vous reconnaît.</p>

        <label className="mc-field-label" htmlFor="mc-phone">Numéro WhatsApp</label>
        <div className="mc-phoneline">
          <span className="mc-phoneline__dial">{dial}</span>
          <input
            id="mc-phone"
            value={phone}
            inputMode="tel"
            autoComplete="tel"
            placeholder="Votre numéro"
            onChange={(e) => { setPhone(e.target.value); setErr(null); }}
          />
        </div>

        <div className="mc-channels">
          <button
            className={`mc-channel ${channel === 'whatsapp' ? 'is-on' : ''}`}
            onClick={() => setChannel('whatsapp')}
          >
            Par WhatsApp
          </button>
          <button
            className={`mc-channel ${channel === 'sms' ? 'is-on' : ''}`}
            onClick={() => setChannel('sms')}
          >
            Par SMS
          </button>
        </div>

        {err && <div className="mc-form-err">{err}</div>}

        <div className="mc-langrow">
          <span>Langue</span>
          <span className="mc-langrow__on">FR</span>
          <span className="mc-langrow__off">EN</span>
        </div>
        <button className="mc-cta mc-cta--indigo" onClick={toOtp}>Recevoir mon code</button>
      </div>
    );
  }

  /* ================= OTP ================= */
  return (
    <div className="mc-onb-form mc-fade">
      <button className="mc-linkback" onClick={() => setStage('phone')}>← Retour</button>
      <img className="mc-onb-form__seal" src={asset("/assets/monograms/mono-indigo.png")} alt="" />
      <div className="mc-micro-eyebrow" style={{ marginTop: 22 }}>Vérification</div>
      <h1 className="mc-serif-title">Votre code.</h1>
      <p className="mc-lead">
        Transmis {channel === 'whatsapp' ? 'sur WhatsApp' : 'par SMS'} au {dial} {phone.trim()}.
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
          <button className="mc-resend__btn" onClick={() => setResendIn(45)}>Renvoyer le code</button>
        )}
      </div>

      <button className="mc-cta mc-cta--copper" style={{ marginTop: 'auto' }} onClick={enterApp}>
        Entrer dans Ma Couronne
      </button>
    </div>
  );
}
