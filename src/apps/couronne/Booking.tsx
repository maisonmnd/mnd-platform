import { asset } from '../../shared/asset';
import { useMemo, useRef, useState } from 'react';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import { appointmentsStore, useAppointments, type Appointment } from '../../shared/agenda';
import { uid } from '../../shared/store';
import type { Service } from '../../shared/catalog';
import {
  CLIENT_ID,
  DOW_LETTERS,
  MONTHS,
  PALIERS,
  QUATRE_TEMPS,
  dayLabelIso,
  fmtDuration,
  freeSlots,
  isoOf,
  pad2,
  todayIso,
  useVisibleCatalog,
  type BookingPrefill,
} from './lib';

/* RÉSERVER EN 7 TEMPS
   objectif → palier → prestation → créneau → récapitulatif → acompte 30 % → confirmé */

const TITLES = ['Votre objectif.', 'Le palier.', 'La prestation.', 'Le créneau.', 'Récapitulatif.', 'L’acompte.', 'Confirmé.'];
const EYEBROWS = [
  'Réserver · 1 décision',
  'Réserver · palier d’expérience',
  'Réserver · prestation',
  'Réserver · disponibilité',
  'Réserver · les quatre temps',
  'Réserver · Mobile Money',
  'Réserver · scellé',
];

const PAY_METHODS = [
  { k: 'mtn', n: 'MTN MoMo' },
  { k: 'moov', n: 'Moov Money' },
] as const;
type PayKey = (typeof PAY_METHODS)[number]['k'];

type Props = {
  prefill?: BookingPrefill;
  onClose: () => void;
  toast: (msg: string) => void;
};

export default function Booking({ prefill, onClose, toast }: Props) {
  const { branch, currency } = useBranch();
  const { cats, services } = useVisibleCatalog();
  const [appts] = useAppointments();

  const prefService = prefill ? services.find((s) => s.id === prefill.serviceId) ?? null : null;

  const [step, setStep] = useState(prefService ? 3 : 0);
  const [catId, setCatId] = useState<string | null>(prefService?.categoryId ?? null);
  const [palier, setPalier] = useState<Service['palier'] | null>(prefService?.palier ?? null);
  const [service, setService] = useState<Service | null>(prefService);
  const [monthIdx, setMonthIdx] = useState(0);
  const [selIso, setSelIso] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [pay, setPay] = useState<PayKey | null>(null);
  const [paying, setPaying] = useState(false);
  const payTimer = useRef<number | undefined>(undefined);

  const discountPct = prefill?.discountPct ?? 0;
  const offerLabel = prefill?.offerLabel;

  /* Prix effectif (offre appliquée) + acompte 30 %. */
  const price = service ? Math.round(service.priceXof * (1 - discountPct / 100)) : 0;
  const deposit = Math.round(price * 0.3);

  /* Catégories réservables : au moins une prestation visible. */
  const bookableCats = cats.filter((c) => services.some((s) => s.categoryId === c.id));
  const catServices = services.filter((s) => s.categoryId === catId);
  const stepServices = catServices.filter((s) => s.palier === palier);

  /* ---- Calendrier : mois courant + mois suivant, disponibilité calculée par maître ---- */
  const months = useMemo(() => {
    const now = new Date();
    return [0, 1].map((k) => {
      const d = new Date(now.getFullYear(), now.getMonth() + k, 1);
      return { y: d.getFullYear(), m: d.getMonth(), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
    });
  }, []);

  const month = months[monthIdx];
  const calCells = useMemo(() => {
    if (!service) return [];
    const first = new Date(month.y, month.m, 1);
    const daysIn = new Date(month.y, month.m + 1, 0).getDate();
    const today = todayIso();
    const cells: { key: string; day: number | null; iso?: string; free: boolean }[] = [];
    for (let i = 0; i < first.getDay(); i++) cells.push({ key: `b${i}`, day: null, free: false });
    for (let d = 1; d <= daysIn; d++) {
      const iso = `${month.y}-${pad2(month.m + 1)}-${pad2(d)}`;
      const past = iso < today;
      const free = !past && freeSlots(iso, service.master, service.durationMin, appts, services, branch.id).length > 0;
      cells.push({ key: iso, day: d, iso, free });
    }
    return cells;
  }, [month, service, appts, services, branch.id]);

  const dayTimes = selIso && service
    ? freeSlots(selIso, service.master, service.durationMin, appts, services, branch.id)
    : [];

  /* ---- Navigation ---- */
  const back = () => {
    if (paying) return;
    if (step === 0) { onClose(); return; }
    if (step === 3) { setSelIso(null); setTime(null); }
    setStep(step - 1);
  };

  /* ---- Paiement simulé + écriture dans l'agenda partagé ---- */
  const settle = () => {
    if (!pay) { toast('Choisissez votre moyen de paiement.'); return; }
    if (!service || !selIso || !time) return;
    setPaying(true);
    window.clearTimeout(payTimer.current);
    payTimer.current = window.setTimeout(() => {
      const appt: Appointment = {
        id: uid(),
        branchId: branch.id,
        clientId: CLIENT_ID,
        serviceIds: [service.id],
        date: selIso,
        time,
        master: service.master,
        status: 'en attente',
        depositXof: deposit,
        source: 'couronne',
        note: offerLabel ? `Offre instantanée · ${offerLabel}` : undefined,
      };
      appointmentsStore.set((prev) => [...prev, appt]);
      setPaying(false);
      setStep(6);
    }, 1700);
  };

  const priceLabel = (s: Service, pct = 0) =>
    s.hidePrice ? 'Prix en salon' : fmtMoney(Math.round(s.priceXof * (1 - pct / 100)), currency);

  const payMethodName = PAY_METHODS.find((p) => p.k === pay)?.n ?? 'Mobile Money';

  return (
    <div className="mc-overlayscreen mc-slide">
      {/* -------- entête + progression -------- */}
      <div className="mc-flowhead">
        <div className="mc-flowhead__row">
          {step < 6 ? (
            <button className="mc-linkback" onClick={back}>{step === 0 ? '← Annuler' : '← Retour'}</button>
          ) : <span />}
          <button className="mc-x" aria-label="Fermer" onClick={onClose}>✕</button>
        </div>
        <div className="mc-progress"><div style={{ width: `${((step + 1) / 7) * 100}%` }} /></div>
        <div className="mc-flowhead__titles">
          <div>
            <div className="mc-micro-eyebrow">{EYEBROWS[step]}</div>
            <h1 className="mc-flowhead__h1">{TITLES[step]}</h1>
          </div>
          <span className="mc-flowhead__count">{step + 1} / 7</span>
        </div>
      </div>

      <div className="mc-scroll mc-flowbody">

        {/* -------- 1 · objectif -------- */}
        {step === 0 && (
          <div className="mc-stack mc-fade">
            {bookableCats.map((c) => (
              <button
                key={c.id}
                className="mc-rowcard"
                onClick={() => { setCatId(c.id); setPalier(null); setService(null); setStep(1); }}
              >
                <div>
                  <div className="mc-rowcard__fon">{c.fon}</div>
                  <div className="mc-rowcard__sub">{c.label}</div>
                </div>
                <span className="mc-rowcard__arrow">→</span>
              </button>
            ))}
          </div>
        )}

        {/* -------- 2 · palier -------- */}
        {step === 1 && (
          <div className="mc-stack mc-fade" style={{ gap: 12 }}>
            {PALIERS.map((p) => {
              const n = catServices.filter((s) => s.palier === p.key).length;
              return (
                <button
                  key={p.key}
                  className={`mc-paliercard ${n === 0 ? 'is-off' : ''}`}
                  disabled={n === 0}
                  onClick={() => { setPalier(p.key); setService(null); setStep(2); }}
                >
                  <span className="mc-paliercard__filet" />
                  <div className="mc-paliercard__name">{p.key}</div>
                  <div className="mc-paliercard__sub">
                    {n === 0 ? 'Aucune prestation à ce palier pour cet objectif.' : p.sub}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* -------- 3 · prestation -------- */}
        {step === 2 && (
          <div className="mc-stack mc-fade">
            {stepServices.map((s) => (
              <button
                key={s.id}
                className="mc-svccard"
                onClick={() => { setService(s); setSelIso(null); setTime(null); setMonthIdx(0); setStep(3); }}
              >
                <div className="mc-svccard__top">
                  <div className="mc-svccard__name">{s.name}</div>
                  <div className="mc-svccard__price">{priceLabel(s)}</div>
                </div>
                <div className="mc-svccard__meta">
                  {fmtDuration(s.durationMin)} · {s.sessions} séance{s.sessions > 1 ? 's' : ''} · avec {s.master}
                </div>
                {s.description && <div className="mc-svccard__meta">{s.description}</div>}
                {s.sessions > 1 && <span className="mc-pillseal">Série liée · J1 → J{s.sessions}</span>}
              </button>
            ))}
          </div>
        )}

        {/* -------- 4 · créneau -------- */}
        {step === 3 && service && (
          <div className="mc-fade">
            {(discountPct > 0 || prefService) && (
              <div className="mc-prefillnote">
                {service.name}
                {discountPct > 0 ? ` · ${offerLabel ?? 'offre appliquée'} · −${discountPct} %` : ' · avec ' + service.master}
              </div>
            )}
            <div className="mc-calnav">
              <button onClick={() => setMonthIdx(Math.max(0, monthIdx - 1))} disabled={monthIdx === 0}>‹</button>
              <span>{month.label}</span>
              <button onClick={() => setMonthIdx(Math.min(months.length - 1, monthIdx + 1))} disabled={monthIdx === months.length - 1}>›</button>
            </div>
            <div className="mc-calgrid mc-calgrid--dows">
              {DOW_LETTERS.map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="mc-calgrid">
              {calCells.map((c) =>
                c.day === null ? (
                  <span key={c.key} />
                ) : (
                  <button
                    key={c.key}
                    className={`mc-calday ${c.iso === selIso ? 'is-sel' : ''} ${c.free ? 'is-free' : 'is-off'}`}
                    onClick={() => {
                      if (!c.free) { toast('Aucune disponibilité ce jour.'); return; }
                      setSelIso(c.iso!); setTime(null);
                    }}
                  >
                    {c.day}
                    {c.free && c.iso !== selIso && <i />}
                  </button>
                )
              )}
            </div>
            <div className="mc-callegend"><span />Jours avec créneaux libres · maître {service.master}</div>

            {selIso && (
              <div className="mc-fade" style={{ marginTop: 20 }}>
                <div className="mc-micro-eyebrow" style={{ marginBottom: 10 }}>{dayLabelIso(selIso)} · heures libres</div>
                <div className="mc-stack">
                  {dayTimes.map((t) => (
                    <button key={t} className="mc-slotcard" onClick={() => { setTime(t); setStep(4); }}>
                      <div>
                        <div className="mc-slotcard__time">{t}</div>
                        <div className="mc-slotcard__who">avec {service.master}</div>
                      </div>
                      <span className="mc-slotcard__free">Libre</span>
                    </button>
                  ))}
                  {dayTimes.length === 0 && <div className="mc-emptyline">Plus de créneau ce jour — choisissez un autre jour.</div>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* -------- 5 · récapitulatif -------- */}
        {step === 4 && service && selIso && time && (
          <div className="mc-fade">
            <div className="mc-recapcard">
              <div className="mc-recapcard__row">
                <div className="mc-recapcard__name">{service.name}</div>
                <div className="mc-recapcard__price">{priceLabel(service, discountPct)}</div>
              </div>
              <div className="mc-recapcard__meta">{palier ?? service.palier} · {fmtDuration(service.durationMin)} · avec {service.master}</div>
              {discountPct > 0 && !service.hidePrice && (
                <div className="mc-recapcard__deal">
                  {offerLabel ?? 'Offre instantanée'} · −{discountPct} % <s>{fmtMoney(service.priceXof, currency)}</s>
                </div>
              )}
              <div className="mc-hairline" />
              <div className="mc-recapcard__line"><span>Créneau</span><span>{dayLabelIso(selIso)} · {time}</span></div>
              <div className="mc-recapcard__line"><span>Maison</span><span>{branch.name}</span></div>
            </div>

            <div className="mc-sectionlabel">Les quatre temps</div>
            {QUATRE_TEMPS.map((t) => (
              <div key={t.no} className="mc-temps">
                <span className="mc-temps__no">{t.no}</span>
                <div>
                  <div className="mc-temps__n">{t.n}</div>
                  <div className="mc-temps__g">{t.g}</div>
                </div>
              </div>
            ))}

            <button className="mc-cta mc-cta--indigo" style={{ marginTop: 6 }} onClick={() => setStep(5)}>
              Continuer · acompte
            </button>
          </div>
        )}

        {/* -------- 6 · acompte 30 % -------- */}
        {step === 5 && service && (
          <div className="mc-fade">
            <div className="mc-depositcard">
              <div className="mc-depositcard__label">Acompte à régler</div>
              <div className="mc-depositcard__amount">{fmtMoney(deposit, currency)}</div>
              <div className="mc-depositcard__sub">
                {service.hidePrice ? '30 % de la prestation · solde au salon' : `30 % de ${fmtMoney(price, currency)} · solde au salon`}
              </div>
            </div>
            <div className="mc-sectionlabel">Mobile Money</div>
            <div className="mc-stack">
              {PAY_METHODS.map((pm) => (
                <button
                  key={pm.k}
                  className={`mc-paycard ${pay === pm.k ? 'is-on' : ''}`}
                  onClick={() => setPay(pm.k)}
                >
                  <span>{pm.n}</span>
                  <span className="mc-paycard__dot" />
                </button>
              ))}
            </div>
            <button className="mc-cta mc-cta--copper" style={{ marginTop: 22 }} onClick={settle} disabled={paying}>
              Régler {fmtMoney(deposit, currency)}
            </button>
            <div className="mc-footnote">Reçu envoyé sur WhatsApp.</div>

            {paying && (
              <div className="mc-paysheet mc-fade">
                <div className="mc-paysheet__card mc-rise">
                  <div className="mc-micro-eyebrow">{payMethodName} · paiement sécurisé</div>
                  <div className="mc-paysheet__amount">{fmtMoney(deposit, currency)}</div>
                  <div className="mc-paysheet__hint">Confirmez sur votre téléphone — une demande vient de vous être envoyée.</div>
                  <div className="mc-paysheet__pulse"><span /><span /><span /></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* -------- 7 · confirmé -------- */}
        {step === 6 && service && selIso && time && (
          <div className="mc-confirm mc-rise">
            <div className="mc-confirm__seal"><img src={asset("/assets/monograms/mono-copper.png")} alt="" /></div>
            <h2>Votre rituel est scellé.</h2>
            <p>Confirmation envoyée sur WhatsApp. Un rappel vous parviendra la veille — la maison vous attend.</p>
            <div className="mc-recapcard" style={{ textAlign: 'left' }}>
              <div className="mc-recapcard__name">{service.name}</div>
              <div className="mc-recapcard__meta">{dayLabelIso(selIso)} · {time} · avec {service.master}</div>
              <div className="mc-hairline" />
              <div className="mc-recapcard__line"><span>Acompte réglé</span><span>{fmtMoney(deposit, currency)}</span></div>
              <div className="mc-recapcard__line"><span>Statut</span><span>En attente de la maison</span></div>
            </div>
            <button className="mc-cta mc-cta--indigo" style={{ marginTop: 20 }} onClick={() => { toast('Ajouté à votre calendrier.'); }}>
              Ajouter au calendrier
            </button>
            <button className="mc-quietbtn" onClick={onClose}>Revenir à l’accueil</button>
          </div>
        )}
      </div>
    </div>
  );
}
