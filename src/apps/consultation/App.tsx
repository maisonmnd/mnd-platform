import { asset } from '../../shared/asset';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Seal } from '../../ds/components';
import { fmtMoney } from '../../shared/currency';
import { COUNTRIES, currencyByCode } from '../../shared/geo';
import { consultationsQueueStore, type OnlineConsultation } from '../../shared/bridges';
import { pushNotifyStaff } from '../../shared/push';
import { supabase } from '../../shared/supabase';
import { appointmentsStore, type Appointment } from '../../shared/agenda';
import { createStore, uid, useStore } from '../../shared/store';
import {
  ANALYSE_LINES, ANALYSE_STEPS, CURRENCY_CHOICES, DOW_NAMES, DOW_SHORT, ETAT_CREATION, ETAT_SOS,
  FEE_XOF, HAIR_CHIPS, HORIZON_CHIPS, INSPO_CHIPS, LEN_CHIPS, LIFE_CHIPS, MILESTONES, MOMO_ACCOUNT,
  MOMO_USSD, NUIT_CHIPS, PAYS_CHIPS, ROUTINE_CHIPS, SOS_GOAL_CHIPS, SOS_ZONE_CHIPS, TIMES, TREAT_CHIPS,
  WASH_CHIPS, computeDiag, horizonToMilestone, initialAnswers, initialPhotos, isoDate, kitOf, monthsFrom,
  projMetrics, protocoleTemps, roadmapOf, scoreTag, scoreTone, stageOf,
  type Answers, type CurrencyChoice, type Parcours, type PhotoSlot,
} from './data';

/* La Consultation — le rite d'entrée mondial de la Maison MND.
   Huit temps numérotés, du seuil à la porte du salon. */

/* Déverrouillage persisté localement (l'accès survit au rechargement).
   PRODUCTION : le paiement réel passe par le widget KkiaPay — le succès renvoie
   un signal à l'écran ET un webhook serveur marque la consultation payée ;
   ici, le succès est simulé côté client (1,5 s de traitement). */
type Access = { paid: boolean; ref: string | null; at: string | null };
const accessStore = createStore<Access>('mnd_consultation_access', { paid: false, ref: null, at: null });

type Scene =
  | 'seuil' | 'acces'
  | 'portrait' | 'preuves' | 'habitudes' | 'vision'
  | 'analyse' | 'diagnostic' | 'projection' | 'protocole' | 'reserver'
  | 'bienvenue';

const RAIL: { id: Scene; label: string }[] = [
  { id: 'portrait', label: 'Portrait' },
  { id: 'preuves', label: 'Preuves' },
  { id: 'habitudes', label: 'Habitudes' },
  { id: 'vision', label: 'Vision' },
  { id: 'diagnostic', label: 'Diagnostic' },
  { id: 'projection', label: 'Projection' },
  { id: 'protocole', label: 'Protocole' },
  { id: 'reserver', label: 'Réserver' },
];

const RAIL_IDX: Record<Scene, number> = {
  seuil: -1, acces: -1,
  portrait: 0, preuves: 1, habitudes: 2, vision: 3, analyse: 3,
  diagnostic: 4, projection: 5, protocole: 6, reserver: 7, bienvenue: 8,
};

/* ---------- petites briques ---------- */

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`lc-chip${on ? ' is-on' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

function CardChip({ on, onClick, title, desc }: { on: boolean; onClick: () => void; title: ReactNode; desc?: ReactNode }) {
  return (
    <button type="button" className={`lc-cardchip${on ? ' is-on' : ''}`} onClick={onClick}>
      <span className="lc-cardchip__t">{title}</span>
      {desc != null && <span className="lc-cardchip__d">{desc}</span>}
    </button>
  );
}

function FieldError({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return <div className="lc-err">{children}</div>;
}

/** QR décoratif — motif déterministe évoquant le paiement marchand MoMo. */
function QrBlock() {
  const N = 21;
  const rects: ReactNode[] = [];
  const finder = (r: number, c: number): boolean | null => {
    const corners: [number, number][] = [[0, 0], [0, N - 7], [N - 7, 0]];
    for (const [br, bc] of corners) {
      if (r >= br && r < br + 7 && c >= bc && c < bc + 7) {
        const rr = r - br, cc = c - bc;
        return rr === 0 || rr === 6 || cc === 0 || cc === 6 || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4);
      }
    }
    return null;
  };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const f = finder(r, c);
      const on = f !== null ? f : (r * c + r * 3 + c * 7 + 5) % 3 === 0;
      if (on) rects.push(<rect key={`${r}-${c}`} x={c * 4} y={r * 4} width={3.4} height={3.4} />);
    }
  }
  return (
    <svg className="lc-qr__svg" viewBox="0 0 84 84" aria-hidden="true">
      {rects}
    </svg>
  );
}

function Nav({
  onBack, backLabel = '← Retour', onNext, nextLabel = 'Continuer →', ready = true, error,
}: {
  onBack: () => void;
  backLabel?: string;
  onNext: () => void;
  nextLabel?: string;
  ready?: boolean;
  error?: string | null;
}) {
  return (
    <div className="lc-navwrap">
      {error && <div className="lc-navwrap__error">{error}</div>}
      <div className="lc-nav">
        <button type="button" className="lc-back" onClick={onBack}>{backLabel}</button>
        <button type="button" className={`lc-next${ready ? '' : ' is-off'}`} onClick={onNext}>{nextLabel}</button>
      </div>
    </div>
  );
}

/* ---------- l'application ---------- */

export default function App() {
  const [scene, setSceneRaw] = useState<Scene>('seuil');
  const [parcours, setParcours] = useState<Parcours>('creation');
  const [cur, setCur] = useState<CurrencyChoice>('XOF');
  const [curOpen, setCurOpen] = useState(false);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [photos, setPhotos] = useState<PhotoSlot[]>(initialPhotos);
  const [access, setAccess] = useStore(accessStore);
  const [toast, setToast] = useState<string | null>(null);
  const [tried, setTried] = useState<Record<string, boolean>>({});

  // paywall
  const [payTab, setPayTab] = useState<'momo' | 'paypal' | 'card'>('momo');
  const [momoOp, setMomoOp] = useState('MTN');
  const [payPhone, setPayPhone] = useState('');
  const [card, setCard] = useState({ num: '', exp: '', cvc: '' });
  const [paying, setPaying] = useState(false);

  // analyse & projection
  const [analysePct, setAnalysePct] = useState(0);
  const [activeMs, setActiveMs] = useState(6);

  // réservation
  const [mode, setMode] = useState<'salon' | 'visio' | null>(null);
  const [calIdx, setCalIdx] = useState(0);
  const [selDate, setSelDate] = useState<{ iso: string; label: string } | null>(null);
  const [selTime, setSelTime] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  const today = useMemo(() => new Date(), []);
  const months = useMemo(() => monthsFrom(today, 2), [today]);
  const toastTimer = useRef<number | undefined>(undefined);
  const payTimer = useRef<number | undefined>(undefined);

  const sos = parcours === 'sos';
  const pathLabel = sos ? 'SOS Locks' : 'Création';
  const fee = fmtMoney(FEE_XOF, cur);
  const diag = useMemo(() => computeDiag(answers, parcours), [answers, parcours]);
  const prenom = answers.nom.trim().split(/\s+/)[0] || '';

  const go = (s: Scene) => {
    setSceneRaw(s);
    setCurOpen(false);
    window.scrollTo({ top: 0 });
  };

  const fire = (msg: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  };

  useEffect(() => () => {
    window.clearTimeout(toastTimer.current);
    window.clearTimeout(payTimer.current);
  }, []);

  const setA = (patch: Partial<Answers>) => setAnswers((a) => ({ ...a, ...patch }));
  const toggleIn = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);

  /* ---- validations par étape ---- */
  const phoneOk = answers.phone.replace(/\D/g, '').length >= 6;
  const missPortrait: [boolean, string][] = [
    [!answers.nom.trim(), 'votre nom'],
    [!phoneOk, 'un téléphone joignable'],
    [!answers.ville.trim(), 'votre ville'],
    [!answers.pays, 'votre pays'],
    [!answers.hairType, 'la nature du cheveu'],
    [!answers.etat, sos ? 'l’âge de vos locks' : 'l’état de vos cheveux'],
  ];
  const portraitMissing = missPortrait.filter(([b]) => b).map(([, l]) => l);
  const ready1 = portraitMissing.length === 0;

  const missHab: [boolean, string][] = [
    [!answers.washFreq, 'la fréquence de lavage'],
    [answers.treatments.length === 0, 'les traitements subis'],
    [!answers.routine, 'votre routine'],
    [!answers.nuit, 'la protection de nuit'],
  ];
  const habMissing = missHab.filter(([b]) => b).map(([, l]) => l);
  const ready3 = habMissing.length === 0;

  const missVision: [boolean, string][] = sos
    ? [
        [answers.sosGoals.length === 0, 'au moins un objectif'],
        [!answers.horizon, 'votre échéance'],
      ]
    : [
        [!answers.goalLen, 'la longueur rêvée'],
        [!answers.inspo, 'le style qui vous appelle'],
        [!answers.horizon, 'votre échéance'],
      ];
  const visionMissing = missVision.filter(([b]) => b).map(([, l]) => l);
  const ready4 = visionMissing.length === 0;

  const readyBook = mode !== null && selDate !== null && selTime !== null;

  /* ---- entrée dans un parcours ---- */
  const enterParcours = (p: Parcours) => {
    setParcours(p);
    setAnswers((a) => ({ ...a, etat: null, goalLen: null, inspo: null, sosGoals: [], sosZones: [], horizon: null }));
    setTried({});
    if (access.paid) {
      fire(`Accès déjà réglé — vos ${fee} restent crédités sur votre premier rituel.`);
      go('portrait');
    } else {
      setPayTab('momo');
      go('acces');
    }
  };

  /* ---- paiement simulé ---- */
  const payNow = () => {
    if (paying) return;
    if (payTab === 'momo' && payPhone.replace(/\D/g, '').length < 8) {
      fire('Renseignez le numéro Mobile Money à débiter.');
      return;
    }
    setPaying(true);
    fire('KkiaPay · transaction en cours…');
    window.clearTimeout(payTimer.current);
    payTimer.current = window.setTimeout(() => {
      setPaying(false);
      // PRODUCTION : c'est le webhook serveur KkiaPay qui marque l'accès payé.
      setAccess({ paid: true, ref: 'MND-' + uid().toUpperCase(), at: new Date().toISOString() });
      fire('Paiement confirmé — la consultation est déverrouillée.');
      go('portrait');
    }, 1500);
  };

  const copyUssd = async () => {
    try {
      await navigator.clipboard.writeText(MOMO_USSD);
      fire('Syntaxe copiée — composez-la sur votre téléphone.');
    } catch {
      fire('Copie indisponible — recopiez la syntaxe affichée.');
    }
  };

  /* ---- photos ---- */
  const onPhoto = (key: string, file: File | null) => {
    if (!file) return;
    setPhotos((ps) =>
      ps.map((p) => {
        if (p.key !== key) return p;
        if (p.url) URL.revokeObjectURL(p.url);
        return { ...p, url: URL.createObjectURL(file), fileName: file.name };
      })
    );
  };
  const clearPhoto = (key: string) => {
    setPhotos((ps) =>
      ps.map((p) => {
        if (p.key !== key) return p;
        if (p.url) URL.revokeObjectURL(p.url);
        return { ...p, url: null, fileName: null };
      })
    );
  };

  /* ---- analyse animée (~2 s) ---- */
  useEffect(() => {
    if (scene !== 'analyse') return;
    setAnalysePct(0);
    const iv = window.setInterval(() => {
      setAnalysePct((p) => Math.min(100, p + 3));
    }, 55);
    return () => window.clearInterval(iv);
  }, [scene]);

  useEffect(() => {
    if (scene !== 'analyse' || analysePct < 100) return;
    const t = window.setTimeout(() => go('diagnostic'), 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, analysePct]);

  useEffect(() => {
    if (scene === 'projection') setActiveMs(horizonToMilestone(answers.horizon));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  const startAnalyse = () => {
    setTried((t) => ({ ...t, vision: true }));
    if (!ready4) {
      fire(`Complétez : ${visionMissing.join(', ')}.`);
      return;
    }
    go('analyse');
  };

  /* ---- confirmation : pont vers le Trône ---- */
  const confirm = () => {
    if (booked) return;
    if (!readyBook || !mode || !selDate || !selTime) {
      fire('Choisissez le lieu, la date et l’heure.');
      return;
    }
    const consultation: OnlineConsultation = {
      id: uid(),
      createdAt: new Date().toISOString(),
      parcours,
      client: {
        name: answers.nom.trim() || 'Invitée',
        phone: `${answers.dial} ${answers.phone.trim()}`.trim(),
        city: answers.ville.trim(),
        currency: cur,
      },
      answers: {
        pays: answers.pays,
        natureCheveu: answers.hairType,
        etat: answers.etat,
        frequenceLavage: answers.washFreq,
        traitements: answers.treatments,
        routine: answers.routine,
        protectionNuit: answers.nuit,
        modeDeVie: answers.lifestyle,
        longueur: answers.goalLen,
        style: answers.inspo,
        objectifsSos: answers.sosGoals,
        zonesSos: answers.sosZones,
        horizon: answers.horizon,
        photos: photos.filter((p) => p.url).map((p) => p.label),
        prescription: diag.service.name,
        cadence: diag.cadence,
        valeurPrestationXof: diag.service.priceXof,
      },
      diagnostic: { palier: diag.palier, scores: { ...diag.scores } },
      reservation: { mode, date: selDate.iso, time: selTime },
      paidXof: FEE_XOF,
      status: 'nouvelle',
    };
    consultationsQueueStore.set((q) => [consultation, ...q]);
    /* Dépôt côté serveur + alerte du personnel en UN appel, LIMITÉ EN DÉBIT par IP
       (fonction Edge, mode tunnel-submit) — l'INSERT anonyme direct est fermé.
       Le magasin local reste écrit (pont même-navigateur vers Le Trône) ; si la
       fonction échoue (hors-ligne, pas encore déployée), on retombe sur l'ancienne
       alerte directe, la ligne locale suivant alors la synchronisation. */
    void (async () => {
      let ok = false;
      if (supabase) {
        try {
          const { data, error } = await supabase.functions.invoke('push-notify', {
            body: {
              mode: 'tunnel-submit',
              consultation: { id: consultation.id, data: consultation },
              title: 'Nouvelle consultation en ligne',
              body: `${consultation.client.name} · ${pathLabel}`,
              url: '/trone/#/consultations',
            },
          });
          ok = !error && (data as { ok?: boolean } | null)?.ok === true;
        } catch {
          ok = false;
        }
      }
      if (!ok) {
        void pushNotifyStaff(
          'Nouvelle consultation en ligne',
          `${consultation.client.name} · ${pathLabel}`,
          '/trone/#/consultations',
        );
      }
    })();

    if (mode === 'salon') {
      const appt: Appointment = {
        id: uid(),
        branchId: 'cotonou-flagship',
        clientId: 'consult-' + consultation.id,
        serviceIds: [diag.service.id],
        date: selDate.iso,
        time: selTime,
        master: diag.service.master,
        status: 'en attente',
        depositXof: FEE_XOF,
        note: `Consultation en ligne · ${pathLabel} · ${consultation.client.name}`,
        source: 'consultation',
      };
      appointmentsStore.set((list) => [...list, appt]);
    }
    setBooked(true);
    go('bienvenue');
  };

  const restart = () => {
    photos.forEach((p) => { if (p.url) URL.revokeObjectURL(p.url); });
    setAnswers(initialAnswers);
    setPhotos(initialPhotos);
    setTried({});
    setMode(null);
    setCalIdx(0);
    setSelDate(null);
    setSelTime(null);
    setBooked(false);
    setPayPhone('');
    setCard({ num: '', exp: '', cvc: '' });
    // Un nouveau rite requiert un nouvel accès — le crédit précédent est déjà scellé au dossier transmis.
    setAccess({ paid: false, ref: null, at: null });
    go('seuil');
  };

  /* ================================================================ rendu */

  const railIdx = RAIL_IDX[scene];
  const railShow = railIdx >= 0 && scene !== 'bienvenue' && scene !== 'analyse';
  const curSym = currencyByCode(cur)?.symbol ?? cur;

  return (
    <div className="lc-app">
      {/* ===== barre haute ===== */}
      <header className="lc-topbar">
        <button type="button" className="lc-brand" onClick={() => go('seuil')}>
          <Seal color="copper" size={26} />
          <span>
            <span className="lc-brand__name">Maison MND</span>
            <span className="lc-brand__sub">La Consultation Souveraine</span>
          </span>
        </button>

        {railShow && (
          <nav className="lc-rail" aria-label="Les huit temps">
            {RAIL.map((r, i) => {
              const done = railIdx > i;
              const active = railIdx === i;
              return (
                <div className="lc-rail__seg" key={r.id}>
                  <button
                    type="button"
                    className={`lc-rail__step${active ? ' is-active' : ''}${done ? ' is-done' : ''}`}
                    onClick={() => { if (done || active) go(r.id); }}
                  >
                    <span className="lc-rail__dot">{done ? '✓' : i + 1}</span>
                    <span className="lc-rail__label">{r.label}</span>
                  </button>
                  {i < RAIL.length - 1 && <span className={`lc-rail__line${done ? ' is-done' : ''}`} />}
                </div>
              );
            })}
          </nav>
        )}

        <div className="lc-cur">
          <button type="button" className={`lc-cur__btn${curOpen ? ' is-open' : ''}`} onClick={() => setCurOpen((o) => !o)}>
            <span className="lc-cur__sym">{curSym}</span>
            {cur}
            <span className="lc-cur__caret">▾</span>
          </button>
          {curOpen && (
            <>
              <div className="lc-cur__backdrop" onClick={() => setCurOpen(false)} />
              <div className="lc-cur__menu">
                {CURRENCY_CHOICES.map((code) => (
                  <button
                    type="button"
                    key={code}
                    className={`lc-cur__item${cur === code ? ' is-on' : ''}`}
                    onClick={() => { setCur(code); setCurOpen(false); }}
                  >
                    <span>{currencyByCode(code)?.name ?? code} · {code}</span>
                    <span className="lc-cur__isym">{currencyByCode(code)?.symbol ?? code}</span>
                  </button>
                ))}
                <div className="lc-cur__note">Pivot XOF · taux indicatifs · paiement mondial</div>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="lc-stage">
        {/* ============ LE SEUIL ============ */}
        {scene === 'seuil' && (
          <section className="lc-seuil mnd-rise">
            <div className="lc-seuil__copy">
              <div className="lc-eyebrow">mi nyɔ́ ɖɛkpɛ · nous sommes beaux</div>
              <h1 className="lc-display">Avant le rituel,<br />le diagnostic.</h1>
              <p className="lc-lead">
                La première rencontre avec la Maison se fait ici, où que vous soyez dans le monde.
                Quelques photos, vos habitudes, votre vision — et l’intelligence de la Maison lit votre
                couronne, projette son avenir, et compose votre protocole.{' '}
                <span className="lc-strong">Puis vous franchissez la porte du salon, déjà attendue.</span>
              </p>

              <div className="lc-label lc-seuil__voies">Choisissez votre voie</div>
              <div className="lc-doors">
                <button type="button" className="lc-door" onClick={() => enterParcours('creation')}>
                  <span className="lc-door__seal"><Seal color="copper" size={18} /></span>
                  <span className="lc-door__name">Création</span>
                  <span className="lc-door__desc">Ma première couronne. Je pars de mes cheveux libres vers des locks nées dans les règles de l’art.</span>
                  <span className="lc-door__cta">Première pose →</span>
                </button>
                <button type="button" className="lc-door lc-door--sos" onClick={() => enterParcours('sos')}>
                  <span className="lc-door__urgence">Urgence</span>
                  <span className="lc-door__seal lc-door__seal--copper">✚</span>
                  <span className="lc-door__name">SOS Locks</span>
                  <span className="lc-door__desc">Mes locks souffrent — casse, amincissement, racines fragiles. Je veux les sauver et les restaurer.</span>
                  <span className="lc-door__cta lc-door__cta--copper">Restauration →</span>
                </button>
              </div>

              <div className="lc-stats">
                <div className="lc-stats__item">
                  <div className="lc-stats__v">12 min</div>
                  <div className="lc-stats__l">la consultation</div>
                </div>
                <div className="lc-stats__sep" />
                <div className="lc-stats__item">
                  <div className="lc-stats__v">Mondial</div>
                  <div className="lc-stats__l">où que vous soyez</div>
                </div>
                <div className="lc-stats__sep" />
                <div className="lc-stats__item">
                  <div className="lc-stats__v">{fee}</div>
                  <div className="lc-stats__l">crédités sur votre premier rituel</div>
                </div>
              </div>
            </div>

            <div className="lc-seuil__photo">
              <img src={asset("/assets/photos/model-microlocks.jpg")} alt="" />
              <div className="lc-seuil__veil" />
              <figure className="lc-seuil__quote">
                <span className="lc-filet" />
                <blockquote>« Avant d’être une coiffure, le lock est une lignée. Avant d’être une marque, MND est une couronne. »</blockquote>
              </figure>
            </div>
          </section>
        )}

        {/* ============ L'ACCÈS · paywall ============ */}
        {scene === 'acces' && (
          <section className="lc-acces mnd-rise">
            <div className="lc-acces__inner">
              <div className="lc-acces__head">
                <div className="lc-eyebrow">{pathLabel} · L’accès à la Maison</div>
                <h2 className="lc-h2">Déverrouillez votre consultation.</h2>
                <p className="lc-intro lc-acces__intro">
                  La consultation souveraine se règle à l’entrée — <span className="lc-strong">{fee}</span>,
                  intégralement crédités sur votre premier rituel au salon.
                </p>
              </div>

              <div className="lc-pay">
                <div className="lc-pay__head">
                  <div className="lc-pay__brand">
                    <span className="lc-pay__k">k</span>
                    <span>
                      <span className="lc-pay__kkia">KkiaPay</span>
                      <span className="lc-pay__secure">Paiement sécurisé</span>
                    </span>
                  </div>
                  <div className="lc-pay__amount">
                    <span className="lc-pay__amountl">Montant</span>
                    <span className="lc-pay__amountv">{fee}</span>
                  </div>
                </div>

                <div className="lc-pay__tabs">
                  {([
                    ['momo', 'Mobile Money', 'MTN · Moov · Celtis'],
                    ['paypal', 'PayPal', 'diaspora'],
                    ['card', 'Carte', 'Visa · MC'],
                  ] as const).map(([k, n, sub]) => (
                    <button type="button" key={k} className={`lc-pay__tab${payTab === k ? ' is-on' : ''}`} onClick={() => setPayTab(k)}>
                      <span className="lc-pay__tabn">{n}</span>
                      <span className="lc-pay__tabsub">{sub}</span>
                    </button>
                  ))}
                </div>

                <div className="lc-pay__body">
                  {payTab === 'momo' && (
                    <div className="lc-momo">
                      <div className="lc-momo__left">
                        <div className="lc-qr">
                          <QrBlock />
                        </div>
                        <div className="lc-momo__acct">Compte marchand MND · n° {MOMO_ACCOUNT}</div>
                      </div>
                      <div className="lc-momo__right">
                        <div className="lc-label lc-label--copper">Mobile Money · {momoOp}</div>
                        <div className="lc-momo__ops">
                          {['MTN', 'Moov', 'Celtis'].map((op) => (
                            <Chip key={op} on={momoOp === op} onClick={() => setMomoOp(op)}>{op}</Chip>
                          ))}
                        </div>
                        <div className="lc-momo__phone">
                          <span className="lc-momo__dial">+229</span>
                          <input
                            className="lc-input lc-momo__num"
                            placeholder="01 97 00 00 00"
                            inputMode="tel"
                            value={payPhone}
                            onChange={(e) => setPayPhone(e.target.value)}
                          />
                        </div>
                        <div className="lc-momo__or">Scannez le QR, ou composez sur votre téléphone :</div>
                        <button type="button" className="lc-ussd" onClick={copyUssd} title="Copier la syntaxe">
                          <span className="lc-ussd__code">{MOMO_USSD}</span>
                          <span className="lc-ussd__copy">Copier</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {payTab === 'paypal' && (
                    <div className="lc-paypal">
                      <div className="lc-label">Pour la diaspora</div>
                      <div className="lc-paypal__btn">
                        <span className="lc-paypal__pay">Pay</span>
                        <span className="lc-paypal__pal">Pal</span>
                      </div>
                      <p className="lc-paypal__note">
                        Réglez en EUR, USD ou CAD depuis votre compte PayPal — la confiance de la diaspora, où qu’elle vive.
                      </p>
                    </div>
                  )}

                  {payTab === 'card' && (
                    <div className="lc-card">
                      <div className="lc-card__head">
                        <span className="lc-label">Carte bancaire</span>
                        <span className="lc-card__nets">
                          <span className="lc-card__net">VISA</span>
                          <span className="lc-card__net">Mastercard</span>
                        </span>
                      </div>
                      <input
                        className="lc-input lc-card__num"
                        placeholder="Numéro de carte"
                        inputMode="numeric"
                        value={card.num}
                        onChange={(e) => setCard((c) => ({ ...c, num: e.target.value }))}
                      />
                      <div className="lc-card__row">
                        <input
                          className="lc-input"
                          placeholder="Exp. MM / AA"
                          value={card.exp}
                          onChange={(e) => setCard((c) => ({ ...c, exp: e.target.value }))}
                        />
                        <input
                          className="lc-input"
                          placeholder="CVC"
                          inputMode="numeric"
                          value={card.cvc}
                          onChange={(e) => setCard((c) => ({ ...c, cvc: e.target.value }))}
                        />
                      </div>
                      <div className="lc-card__note">Visa & Mastercard du monde entier, traités par KkiaPay. 3-D Secure activé.</div>
                    </div>
                  )}
                </div>

                <div className="lc-pay__foot">
                  <button type="button" className={`lc-pay__btn${paying ? ' is-paying' : ''}`} onClick={payNow}>
                    {paying ? 'Transaction en cours…' : `Payer ${fee}`}
                  </button>
                  <div className="lc-pay__webhook">
                    <span className="lc-dot lc-dot--ok" />
                    À la réussite, KkiaPay renvoie le signal à l’écran (accès débloqué instantanément) et notifie
                    nos serveurs par webhook — aucun SMS à lire, partout, à toute heure.
                  </div>
                </div>
              </div>

              <div className="lc-acces__under">
                <button type="button" className="lc-back" onClick={() => go('seuil')}>← Changer de voie</button>
                <div className="lc-acces__assurance">
                  <span className="lc-dot lc-dot--ok" />
                  Paiement chiffré · référence unique · crédité au salon
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ============ 1 · PORTRAIT ============ */}
        {scene === 'portrait' && (
          <section className="lc-step mnd-rise" style={{ maxWidth: 780 }}>
            <div className="lc-eyebrow">{pathLabel} · Étape 1 sur 8</div>
            <h2 className="lc-h2">Faisons connaissance.</h2>
            <p className="lc-intro">La Maison s’adresse à vous par votre nom. Le reste oriente déjà la lecture.</p>

            <label className="lc-label" htmlFor="lc-nom">Votre nom</label>
            <input
              id="lc-nom"
              className="lc-input lc-input--serif"
              placeholder="Nom et prénom"
              value={answers.nom}
              onChange={(e) => setA({ nom: e.target.value })}
            />
            <FieldError show={!!tried.portrait && !answers.nom.trim()}>La Maison a besoin de votre nom.</FieldError>

            <div className="lc-cols2">
              <div>
                <label className="lc-label">Votre téléphone</label>
                <div className="lc-phone">
                  <select
                    className="lc-select lc-phone__dial"
                    value={answers.dial}
                    onChange={(e) => setA({ dial: e.target.value })}
                    aria-label="Indicatif"
                  >
                    {[...new Set(COUNTRIES.map((c) => c.dial))].map((dial) => (
                      <option key={dial} value={dial}>{dial}</option>
                    ))}
                  </select>
                  <input
                    className="lc-input lc-phone__num"
                    placeholder="01 97 00 00 00"
                    inputMode="tel"
                    value={answers.phone}
                    onChange={(e) => setA({ phone: e.target.value })}
                  />
                </div>
                <FieldError show={!!tried.portrait && !phoneOk}>Un numéro joignable, pour sceller le rendez-vous.</FieldError>
              </div>
              <div>
                <label className="lc-label" htmlFor="lc-ville">Votre ville</label>
                <input
                  id="lc-ville"
                  className="lc-input"
                  placeholder="Cotonou, Paris, Montréal…"
                  value={answers.ville}
                  onChange={(e) => setA({ ville: e.target.value })}
                />
                <FieldError show={!!tried.portrait && !answers.ville.trim()}>Dites à la Maison où vous vivez.</FieldError>
              </div>
            </div>

            <label className="lc-label">Votre pays</label>
            <div className="lc-chips">
              {PAYS_CHIPS.map((p) => (
                <Chip
                  key={p.name}
                  on={answers.pays === p.name}
                  onClick={() => {
                    setA({ pays: p.name, dial: p.dial });
                    setCur(p.currency);
                  }}
                >
                  {p.name}
                </Chip>
              ))}
            </div>

            <label className="lc-label">La nature de votre cheveu</label>
            <div className="lc-grid4">
              {HAIR_CHIPS.map(([code, desc]) => (
                <CardChip key={code} on={answers.hairType === code} onClick={() => setA({ hairType: code })} title={code} desc={desc} />
              ))}
            </div>
            <FieldError show={!!tried.portrait && !answers.hairType}>Choisissez la nature la plus proche.</FieldError>

            <label className="lc-label">{sos ? 'L’âge de vos locks' : 'L’état actuel de vos cheveux'}</label>
            <div className="lc-chips">
              {(sos ? ETAT_SOS : ETAT_CREATION).map(([k, name, desc]) => (
                <Chip key={k} on={answers.etat === k} onClick={() => setA({ etat: k })}>
                  {name} <span className="lc-chip__sub">· {desc}</span>
                </Chip>
              ))}
            </div>
            <FieldError show={!!tried.portrait && !answers.etat}>
              {sos ? 'L’âge des locks oriente la restauration.' : 'L’état de départ oriente la pose.'}
            </FieldError>

            <Nav
              onBack={() => go('seuil')}
              onNext={() => {
                setTried((t) => ({ ...t, portrait: true }));
                if (!ready1) { fire(`Complétez : ${portraitMissing.join(', ')}.`); return; }
                go('preuves');
              }}
              ready={ready1}
              error={tried.portrait && !ready1 ? `Il manque : ${portraitMissing.join(', ')}.` : null}
            />
          </section>
        )}

        {/* ============ 2 · PREUVES ============ */}
        {scene === 'preuves' && (
          <section className="lc-step mnd-rise" style={{ maxWidth: 880 }}>
            <div className="lc-eyebrow">{pathLabel} · Étape 2 sur 8</div>
            <h2 className="lc-h2">Montrez votre couronne.</h2>
            <p className="lc-intro" style={{ maxWidth: 560 }}>
              Trois angles suffisent à l’intelligence pour lire la densité, la santé du cuir chevelu et l’état
              des pointes. Vos images restent privées — elles ne servent qu’à votre diagnostic.
            </p>
            <div className="lc-pill-hint"><span className="lc-dot lc-dot--copper" />Déposez une image sur chaque cadre</div>

            <div className="lc-photos">
              {photos.map((p) => (
                <div key={p.key} className="lc-photo">
                  <div className="lc-label">{p.label}</div>
                  <label className={`lc-photo__frame${p.url ? ' has-img' : ''}`}>
                    {p.url ? (
                      <img src={p.url} alt={p.label} />
                    ) : (
                      <span className="lc-photo__ph">
                        <span className="lc-photo__phv">{p.ph}</span>
                        <span className="lc-photo__phl">Choisir une photo</span>
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => onPhoto(p.key, e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {p.url && (
                    <button type="button" className="lc-photo__remove" onClick={() => clearPhoto(p.key)}>
                      Retirer {p.fileName ? `· ${p.fileName}` : ''}
                    </button>
                  )}
                  <div className="lc-photo__tip">{p.tip}</div>
                </div>
              ))}
            </div>

            <div className="lc-note">
              <Seal color="indigo" size={22} style={{ opacity: 0.6 }} />
              <span>Pas de photo sous la main ? Vous pourrez les présenter au Maître le jour du rendez-vous — le diagnostic s’affine alors en salon.</span>
            </div>

            <Nav onBack={() => go('portrait')} onNext={() => go('habitudes')} />
          </section>
        )}

        {/* ============ 3 · HABITUDES ============ */}
        {scene === 'habitudes' && (
          <section className="lc-step mnd-rise" style={{ maxWidth: 820 }}>
            <div className="lc-eyebrow">{pathLabel} · Étape 3 sur 8</div>
            <h2 className="lc-h2">Vos habitudes, sans détour.</h2>
            <p className="lc-intro">La vérité du quotidien vaut mieux que l’idéal. C’est elle qui rend le protocole juste.</p>

            <label className="lc-label">À quelle fréquence lavez-vous ?</label>
            <div className="lc-grid4">
              {WASH_CHIPS.map(([k, name]) => (
                <CardChip key={k} on={answers.washFreq === k} onClick={() => setA({ washFreq: k })} title={name} />
              ))}
            </div>
            <FieldError show={!!tried.habitudes && !answers.washFreq}>La fréquence de lavage pèse sur le cuir chevelu.</FieldError>

            <label className="lc-label">Traitements chimiques subis <span className="lc-label__plus">· plusieurs choix</span></label>
            <div className="lc-hint">L’historique chimique pèse lourd sur l’intégrité de la fibre.</div>
            <div className="lc-chips">
              {TREAT_CHIPS.map(([k, name]) => {
                const on = answers.treatments.includes(k);
                return (
                  <Chip
                    key={k}
                    on={on}
                    onClick={() => {
                      if (k === 'aucun') { setA({ treatments: on ? [] : ['aucun'] }); return; }
                      setA({ treatments: toggleIn(answers.treatments.filter((x) => x !== 'aucun'), k) });
                    }}
                  >
                    <span className="lc-chip__mark">{on ? '✓' : '+'}</span>{name}
                  </Chip>
                );
              })}
            </div>
            <FieldError show={!!tried.habitudes && answers.treatments.length === 0}>Même « Aucun » se déclare.</FieldError>

            <label className="lc-label">Votre routine actuelle</label>
            <div className="lc-grid3">
              {ROUTINE_CHIPS.map(([k, name, desc]) => (
                <CardChip key={k} on={answers.routine === k} onClick={() => setA({ routine: k })} title={name} desc={desc} />
              ))}
            </div>
            <FieldError show={!!tried.habitudes && !answers.routine}>Votre routine réelle, sans idéal.</FieldError>

            <label className="lc-label">La nuit, votre couronne dort…</label>
            <div className="lc-chips">
              {NUIT_CHIPS.map(([k, name]) => (
                <Chip key={k} on={answers.nuit === k} onClick={() => setA({ nuit: k })}>{name}</Chip>
              ))}
            </div>
            <FieldError show={!!tried.habitudes && !answers.nuit}>La nuit fait la moitié du soin.</FieldError>

            <label className="lc-label">Votre mode de vie <span className="lc-label__plus">· plusieurs choix</span></label>
            <div className="lc-hint">Sport, eau, climat — la couronne vit ce que vous vivez.</div>
            <div className="lc-chips">
              {LIFE_CHIPS.map(([k, name]) => (
                <Chip key={k} on={answers.lifestyle.includes(k)} onClick={() => setA({ lifestyle: toggleIn(answers.lifestyle, k) })}>
                  {name}
                </Chip>
              ))}
            </div>

            <Nav
              onBack={() => go('preuves')}
              onNext={() => {
                setTried((t) => ({ ...t, habitudes: true }));
                if (!ready3) { fire(`Complétez : ${habMissing.join(', ')}.`); return; }
                go('vision');
              }}
              ready={ready3}
              error={tried.habitudes && !ready3 ? `Il manque : ${habMissing.join(', ')}.` : null}
            />
          </section>
        )}

        {/* ============ 4 · VISION ============ */}
        {scene === 'vision' && (
          <section className="lc-step mnd-rise" style={{ maxWidth: 820 }}>
            <div className="lc-eyebrow">{pathLabel} · Étape 4 sur 8</div>
            <h2 className="lc-h2">{sos ? 'Que faut-il restaurer ?' : 'Où voulez-vous arriver ?'}</h2>
            <p className="lc-intro">
              {sos
                ? 'Dites à la Maison ce qui doit être sauvé. Le protocole s’y consacrera.'
                : 'Donnez à la Maison votre désir. La projection s’y accordera.'}
            </p>

            {!sos && (
              <>
                <label className="lc-label">La longueur rêvée</label>
                <div className="lc-grid4">
                  {LEN_CHIPS.map(([k, name, desc]) => (
                    <CardChip key={k} on={answers.goalLen === k} onClick={() => setA({ goalLen: k })} title={name} desc={desc} />
                  ))}
                </div>
                <FieldError show={!!tried.vision && !answers.goalLen}>La longueur donne l’horizon de la projection.</FieldError>

                <label className="lc-label">Le style qui vous appelle</label>
                <div className="lc-grid3">
                  {INSPO_CHIPS.map(([k, name, desc]) => (
                    <CardChip key={k} on={answers.inspo === k} onClick={() => setA({ inspo: k })} title={name} desc={desc} />
                  ))}
                </div>
                <FieldError show={!!tried.vision && !answers.inspo}>Le style guide la prescription.</FieldError>
              </>
            )}

            {sos && (
              <>
                <label className="lc-label">Votre objectif de restauration <span className="lc-label__plus">· plusieurs choix</span></label>
                <div className="lc-grid3">
                  {SOS_GOAL_CHIPS.map(([name, desc]) => {
                    const on = answers.sosGoals.includes(name);
                    return (
                      <CardChip
                        key={name}
                        on={on}
                        onClick={() => setA({ sosGoals: toggleIn(answers.sosGoals, name) })}
                        title={`${on ? '✓ ' : ''}${name}`}
                        desc={desc}
                      />
                    );
                  })}
                </div>
                <FieldError show={!!tried.vision && answers.sosGoals.length === 0}>Au moins un objectif, pour consacrer le protocole.</FieldError>

                <label className="lc-label">Vos zones de souffrance <span className="lc-label__plus">· plusieurs choix</span></label>
                <div className="lc-hint">Où la couronne faiblit-elle le plus ?</div>
                <div className="lc-chips">
                  {SOS_ZONE_CHIPS.map(([k, name]) => (
                    <Chip key={k} on={answers.sosZones.includes(k)} onClick={() => setA({ sosZones: toggleIn(answers.sosZones, k) })}>
                      {name}
                    </Chip>
                  ))}
                </div>
              </>
            )}

            <label className="lc-label">Votre échéance · le plus beau résultat</label>
            <div className="lc-grid2">
              {HORIZON_CHIPS.map((name) => (
                <CardChip key={name} on={answers.horizon === name} onClick={() => setA({ horizon: name })} title={name} />
              ))}
            </div>
            <FieldError show={!!tried.vision && !answers.horizon}>L’échéance rythme la feuille de route.</FieldError>

            <Nav
              onBack={() => go('habitudes')}
              onNext={startAnalyse}
              nextLabel="Lancer l’analyse →"
              ready={ready4}
              error={tried.vision && !ready4 ? `Il manque : ${visionMissing.join(', ')}.` : null}
            />
          </section>
        )}

        {/* ============ ANALYSE ============ */}
        {scene === 'analyse' && (
          <section className="lc-analyse">
            <div className="lc-analyse__ring">
              <div className="lc-analyse__ring-track" />
              <div className="lc-analyse__ring-arc" />
              <div className="lc-analyse__seal"><Seal color="copper" size={46} /></div>
            </div>
            <div className="lc-analyse__eyebrow">L’intelligence de la Maison lit votre couronne</div>
            <div className="lc-analyse__line">{ANALYSE_LINES[Math.min(4, Math.floor(analysePct / 20))]}</div>
            <div className="lc-analyse__bar">
              <div className="lc-analyse__fill" style={{ width: `${analysePct}%` }} />
            </div>
            <div className="lc-analyse__step">{ANALYSE_STEPS[Math.min(4, Math.floor(analysePct / 20))]}</div>
          </section>
        )}

        {/* ============ 5 · DIAGNOSTIC ============ */}
        {scene === 'diagnostic' && (
          <section className="lc-step mnd-rise" style={{ maxWidth: 980 }}>
            <div className="lc-diag__head">
              <div>
                <div className="lc-eyebrow">Le diagnostic · {prenom || 'votre couronne'} · Étape 5 sur 8</div>
                <h2 className="lc-h2">Ce que lit la Maison.</h2>
              </div>
              <div className="lc-diag__palier">
                <div className="lc-label">Palier de départ</div>
                <div className="lc-diag__palierv">{diag.palier}</div>
              </div>
            </div>

            <div className="lc-diag__grid">
              <div className="lc-panel">
                <div className="lc-label lc-panel__title">L’état de votre couronne</div>
                <Gauges scores={[
                  ['Hydratation', diag.scores.hydratation],
                  ['Santé du cuir chevelu', diag.scores.cuir],
                  ['Intégrité de la fibre', diag.scores.integrite],
                  ['Densité', diag.scores.densite],
                  ['Maturité des locks', diag.scores.maturite],
                ]} />
              </div>

              <div className="lc-diag__side">
                <div className="lc-panel lc-panel--indigo">
                  <div className="lc-label lc-label--copperlight">La lecture</div>
                  <p className="lc-panel__read">{diag.lecture}</p>
                </div>
                <div className="lc-panel">
                  <div className="lc-label lc-label--copper">Ce qu’il faut surveiller</div>
                  <div className="lc-flags">
                    {diag.flags.map((f) => (
                      <div key={f.t} className="lc-flag">
                        <span className={`lc-dot lc-dot--${f.tone}`} />
                        <span>{f.t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <Nav
              onBack={() => go('vision')}
              backLabel="← Revoir mes réponses"
              onNext={() => go('projection')}
              nextLabel="Voir ma projection →"
            />
          </section>
        )}

        {/* ============ 6 · PROJECTION SOUVERAINE ============ */}
        {scene === 'projection' && (
          <section className="lc-proj mnd-rise">
            <div className="lc-proj__inner">
              <div className="lc-proj__head">
                <div>
                  <div className="lc-eyebrow lc-eyebrow--invert">La Projection Souveraine · technologie MND · Étape 6 sur 8</div>
                  <h2 className="lc-h2 lc-h2--ivoire">{sos ? 'Voyez votre couronne renaître.' : 'Voyez votre couronne grandir.'}</h2>
                </div>
                <div className="lc-proj__horizon">
                  <div className="lc-label lc-label--indigo100">Horizon visé</div>
                  <div className="lc-proj__horizonv">{answers.horizon ?? 'D’ici un an'}</div>
                </div>
              </div>
              <p className="lc-proj__intro">
                {sos
                  ? 'Parcourez les chapitres du temps. La Maison projette la restauration de vos locks — la santé qui remonte, mèche après mèche, à partir de votre diagnostic.'
                  : 'Parcourez les chapitres du temps. La Maison projette l’évolution de vos locks, horizon après horizon — longueur, densité, maturité — à partir de votre diagnostic et de votre mode de vie.'}
              </p>

              <div className="lc-chapters">
                {MILESTONES.map((m) => {
                  const [stage, narrative] = stageOf(m, parcours);
                  const metrics = projMetrics(m, parcours, diag);
                  const active = activeMs === m;
                  return (
                    <button type="button" key={m} className={`lc-chapter${active ? ' is-active' : ''}`} onClick={() => setActiveMs(m)}>
                      <span className="lc-chapter__rail">
                        <span className="lc-chapter__dot" />
                        <span className="lc-chapter__line" />
                      </span>
                      <span className="lc-chapter__m">M{m}</span>
                      <span className="lc-chapter__body">
                        <span className="lc-chapter__when">
                          {m === 0 ? (sos ? 'Le jour du sauvetage' : 'Le jour de la pose') : `À ${m} mois`}
                        </span>
                        <span className="lc-chapter__stage">{stage}</span>
                        <span className="lc-chapter__narr">{narrative}</span>
                        <span className="lc-chapter__metrics">
                          {metrics.map((mt) => (
                            <span key={mt.l} className="lc-metric">
                              <span className="lc-metric__row">
                                <span className="lc-metric__l">{mt.l}</span>
                                <span className="lc-metric__v">{mt.v}</span>
                              </span>
                              <span className="lc-metric__bar">
                                <span className="lc-metric__fill" style={{ width: active ? `${mt.pct}%` : '0%' }} />
                              </span>
                            </span>
                          ))}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="lc-nav lc-nav--invert">
                <button type="button" className="lc-back lc-back--invert" onClick={() => go('diagnostic')}>← Diagnostic</button>
                <button type="button" className="lc-next lc-next--copper" onClick={() => go('protocole')}>Mon protocole →</button>
              </div>
            </div>
          </section>
        )}

        {/* ============ 7 · PROTOCOLE ============ */}
        {scene === 'protocole' && (
          <section className="lc-step mnd-rise" style={{ maxWidth: 1000 }}>
            <div className="lc-eyebrow">Le protocole souverain · {prenom || 'votre couronne'} · Étape 7 sur 8</div>
            <h2 className="lc-h2">Votre rituel, écrit à la main.</h2>
            <p className="lc-intro" style={{ maxWidth: 600 }}>
              Quatre temps, composés pour votre couronne et votre quotidien. C’est le standard de la Maison —
              le même qui se joue au salon, désormais le vôtre.
            </p>

            <div className="lc-temps">
              {protocoleTemps(diag, parcours).map((t) => (
                <div key={t.no} className="lc-temp">
                  <div className="lc-temp__no">{t.no}</div>
                  <div className="lc-temp__n">{t.n}</div>
                  <div className="lc-temp__g">{t.g}</div>
                  <div className="lc-temp__prodl">Le produit</div>
                  <div className="lc-temp__prod">{t.prod}</div>
                </div>
              ))}
            </div>

            <div className="lc-proto__grid">
              <div className="lc-panel">
                <div className="lc-label lc-panel__title">La feuille de route · salon + maison</div>
                {roadmapOf(diag, parcours).map((r, i, arr) => (
                  <div key={r.when} className="lc-road">
                    <div className="lc-road__rail">
                      <span className={`lc-road__dot${r.tag === 'Salon' ? ' is-salon' : ''}`} />
                      {i < arr.length - 1 && <span className="lc-road__line" />}
                    </div>
                    <div className="lc-road__body">
                      <div className="lc-road__meta">
                        <span className="lc-road__when">{r.when}</span>
                        <span className={`lc-road__tag${r.tag === 'Salon' ? ' is-salon' : ''}`}>{r.tag}</span>
                      </div>
                      <div className="lc-road__t">{r.t}</div>
                      <div className="lc-road__s">{r.s}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="lc-panel lc-panel--obsidian lc-prescription">
                <div className="lc-label lc-label--copperlight">La prescription de la Maison</div>
                <div className="lc-prescription__n">{diag.service.name}</div>
                <div className="lc-prescription__c">{diag.cadence} · Maître {diag.service.master}</div>

                <div className="lc-prescription__kit">
                  <div className="lc-label lc-label--copperlight">Votre trousse maison</div>
                  {kitOf().map((k) => (
                    <div key={k.n} className="lc-prescription__row">
                      <span>{k.n}</span>
                      <span className="lc-prescription__price">{fmtMoney(k.priceXof, cur)}</span>
                    </div>
                  ))}
                </div>

                <div className="lc-prescription__total">
                  <span className="lc-prescription__totall">Valeur du parcours</span>
                  <span className="lc-prescription__totalv">
                    {fmtMoney(diag.service.priceXof + kitOf().reduce((s, k) => s + k.priceXof, 0), cur)}
                  </span>
                </div>
                <div className="lc-prescription__credit">Vos {fee} d’accès sont déjà crédités sur la première séance.</div>
              </div>
            </div>

            <Nav
              onBack={() => go('projection')}
              backLabel="← Projection"
              onNext={() => go('reserver')}
              nextLabel="Réserver ma première séance →"
            />
          </section>
        )}

        {/* ============ 8 · RÉSERVER ============ */}
        {scene === 'reserver' && (
          <section className="lc-step mnd-rise" style={{ maxWidth: 960 }}>
            <div className="lc-eyebrow">Dernière étape · la porte s’ouvre · Étape 8 sur 8</div>
            <h2 className="lc-h2">Réservez. Entrez.</h2>
            <p className="lc-intro" style={{ maxWidth: 600 }}>
              Les frais de consultation sont <span className="lc-strong">intégralement crédités</span> sur votre
              première séance. Vous arrivez attendue, votre protocole déjà entre les mains du Maître.
            </p>

            <div className="lc-resa">
              <div className="lc-resa__left">
                <div className="lc-panel">
                  <div className="lc-label lc-panel__title">La rencontre</div>
                  <div className="lc-grid2">
                    <CardChip
                      on={mode === 'salon'}
                      onClick={() => setMode('salon')}
                      title="Cotonou · Flagship"
                      desc="Haie Vive · siège de la Maison"
                    />
                    <CardChip
                      on={mode === 'visio'}
                      onClick={() => setMode('visio')}
                      title="À distance · visio"
                      desc="entretien vidéo + relais local"
                    />
                  </div>
                </div>

                <div className="lc-panel">
                  <div className="lc-label lc-panel__title">Votre créneau · date & heure</div>
                  <div className="lc-cal__head">
                    <button
                      type="button"
                      className="lc-cal__navbtn"
                      onClick={() => setCalIdx((i) => Math.max(0, i - 1))}
                      disabled={calIdx === 0}
                    >‹</button>
                    <span className="lc-cal__month">{months[calIdx].label}</span>
                    <button
                      type="button"
                      className="lc-cal__navbtn"
                      onClick={() => setCalIdx((i) => Math.min(months.length - 1, i + 1))}
                      disabled={calIdx === months.length - 1}
                    >›</button>
                  </div>
                  <div className="lc-cal__dows">
                    {DOW_SHORT.map((d, i) => <div key={i}>{d}</div>)}
                  </div>
                  <div className="lc-cal__grid">
                    {(() => {
                      const cal = months[calIdx];
                      const firstDow = new Date(cal.y, cal.m, 1).getDay();
                      const daysIn = new Date(cal.y, cal.m + 1, 0).getDate();
                      const cells: ReactNode[] = [];
                      for (let i = 0; i < firstDow; i++) cells.push(<span key={`b${i}`} className="lc-cal__blank" />);
                      for (let d = 1; d <= daysIn; d++) {
                        const dt = new Date(cal.y, cal.m, d);
                        const iso = isoDate(cal.y, cal.m, d);
                        const past = dt < new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
                        const closed = dt.getDay() === 1;
                        const sel = selDate?.iso === iso;
                        const label = `${DOW_NAMES[dt.getDay()]}. ${d} ${cal.label.split(' ')[0].toLowerCase()}`;
                        cells.push(
                          <button
                            type="button"
                            key={iso}
                            className={`lc-cal__cell${sel ? ' is-sel' : ''}${past || closed ? ' is-off' : ''}`}
                            onClick={() => {
                              if (past) { fire('Ce jour est déjà passé — la Maison regarde devant.'); return; }
                              if (closed) { fire('La Maison est fermée le lundi.'); return; }
                              setSelDate({ iso, label });
                              setSelTime(null);
                            }}
                          >
                            {d}
                          </button>
                        );
                      }
                      return cells;
                    })()}
                  </div>

                  {selDate && (
                    <div className="lc-times">
                      <div className="lc-label lc-label--copper">{selDate.label} · choisissez l’heure</div>
                      <div className="lc-times__grid">
                        {TIMES.map((t) => (
                          <button
                            type="button"
                            key={t}
                            className={`lc-time${selTime === t ? ' is-sel' : ''}`}
                            onClick={() => setSelTime(t)}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="lc-panel">
                  <div className="lc-label lc-panel__title">Le solde</div>
                  <div className="lc-hint" style={{ marginBottom: 0 }}>
                    Les frais de consultation sont déjà réglés via KkiaPay et crédités à 100 %. Le solde de la
                    prestation se règle {mode === 'visio' ? 'à la séance' : 'au salon'} — carte, mobile money ou
                    espèces, comme il vous plaira.
                  </div>
                </div>
              </div>

              {/* dossier récapitulatif */}
              <aside className="lc-summary">
                <div className="lc-label lc-label--copperlight">Votre dossier</div>
                <div className="lc-summary__name">{answers.nom.trim() || 'Invitée'}</div>
                <div className="lc-summary__line">{pathLabel} · {answers.pays ?? '—'} · {diag.palier}</div>

                <div className="lc-summary__rows">
                  <div className="lc-summary__row"><span>Prescription</span><span className="lc-summary__val">{diag.service.name}</span></div>
                  <div className="lc-summary__row"><span>Rencontre</span><span className="lc-summary__val">{mode === 'salon' ? 'Cotonou · Flagship' : mode === 'visio' ? 'À distance · visio' : '—'}</span></div>
                  <div className="lc-summary__row"><span>Créneau</span><span className="lc-summary__val">{selDate ? `${selDate.label} · ${selTime ?? '—:—'}` : '—'}</span></div>
                </div>

                <div className="lc-summary__money">
                  <div className="lc-summary__mrow">
                    <span>Première séance</span>
                    <span>{fmtMoney(diag.service.priceXof, cur)}</span>
                  </div>
                  <div className="lc-summary__mrow lc-summary__mrow--credit">
                    <span><span className="lc-check">✓</span>Frais de consultation crédités</span>
                    <span>− {fee}</span>
                  </div>
                  <div className="lc-summary__msep" />
                  <div className="lc-summary__mrow lc-summary__mrow--total">
                    <span>Solde {mode === 'visio' ? 'à la séance' : 'au salon'}</span>
                    <span className="lc-summary__total">{fmtMoney(Math.max(0, diag.service.priceXof - FEE_XOF), cur)}</span>
                  </div>
                </div>

                <button type="button" className={`lc-next lc-next--copper lc-summary__cta${readyBook ? '' : ' is-off'}`} onClick={confirm}>
                  Confirmer ma séance →
                </button>
                <div className="lc-summary__foot">Transmis à l’instant à la Maison. Vous recevrez votre dossier par e-mail & WhatsApp.</div>
              </aside>
            </div>

            <div className="lc-nav" style={{ marginTop: 32 }}>
              <button type="button" className="lc-back" onClick={() => go('protocole')}>← Protocole</button>
            </div>
          </section>
        )}

        {/* ============ BIENVENUE ============ */}
        {scene === 'bienvenue' && (
          <section className="lc-fin mnd-rise">
            <div className="lc-fin__photo">
              <img src={asset("/assets/photos/portrait-3.jpg")} alt="" />
              <div className="lc-fin__veil" />
            </div>
            <div className="lc-fin__copy">
              <span className="lc-fin__seal"><Seal color="copper" size={26} /></span>
              <div className="lc-eyebrow lc-fin__eyebrow">Le dossier est scellé</div>
              <h1 className="lc-display lc-fin__title">Bienvenue à la<br />Maison, {prenom || 'chère couronne'}.</h1>
              <p className="lc-lead lc-fin__lead">
                Votre consultation est transmise au Trône — le Maître la reçoit avec votre diagnostic, votre
                projection et votre protocole. Vos frais de consultation ({fee}) sont réglés et crédités sur
                votre première séance.
              </p>
              <p className="lc-fin__devise">Transmise au Trône. La maison vous attend.</p>

              <div className="lc-fin__steps">
                {[
                  { no: '1', t: 'Votre dossier arrive', s: 'Diagnostic, projection & protocole par e-mail et WhatsApp.' },
                  { no: '2', t: 'La Maison vous confirme', s: 'Le salon valide le créneau sous 24 h.' },
                  { no: '3', t: 'Vous entrez', s: `${mode === 'visio' ? 'En visio' : 'Cotonou · Flagship'} · déjà attendue, déjà lue.` },
                ].map((n) => (
                  <div key={n.no} className="lc-fin__step">
                    <span className="lc-fin__no">{n.no}</span>
                    <span>
                      <span className="lc-fin__stept">{n.t}</span>
                      <span className="lc-fin__steps_">{n.s}</span>
                    </span>
                  </div>
                ))}
              </div>

              <button type="button" className="lc-restart" onClick={restart}>Nouvelle consultation</button>
            </div>
          </section>
        )}
      </main>

      {toast && (
        <div className="lc-toast" role="status">
          <span className="lc-dot lc-dot--ok" />
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---------- jauges du diagnostic (révélation progressive) ---------- */

function Gauges({ scores }: { scores: [string, number][] }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setOn(true), 80);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="lc-gauges">
      {scores.map(([l, n], i) => (
        <div key={l} className="lc-gauge" style={{ transitionDelay: `${i * 90}ms`, opacity: on ? 1 : 0 }}>
          <div className="lc-gauge__row">
            <span className="lc-gauge__l">{l}</span>
            <span className={`lc-gauge__tag lc-gauge__tag--${scoreTone(n)}`}>{scoreTag(n)}</span>
          </div>
          <div className="lc-gauge__bar">
            <div
              className={`lc-gauge__fill lc-gauge__fill--${scoreTone(n)}`}
              style={{ width: on ? `${n}%` : '0%', transitionDelay: `${120 + i * 90}ms` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
