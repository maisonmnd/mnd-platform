import { useMemo, useState } from 'react';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import { appointmentsStore, useAppointments, type Appointment } from '../../shared/agenda';
import { useServices } from '../../shared/catalog';
import { askNotifyPermission, downloadIcs, notifyLocal, type IcsEvent } from '../../shared/ics';
import { enablePush, pushNotify } from '../../shared/push';
import {
  DOW_LETTERS,
  MONTHS,
  dayLabelIso,
  fmtDuration,
  freeSlots,
  pad2,
  todayIso,
  useClientId,
} from './lib';

/* MES RENDEZ-VOUS — voir, déplacer, annuler.
   Le déplacement reprend le calendrier de la réservation (créneaux libres réels) ;
   il repasse le rendez-vous « en attente » pour que la maison re-confirme.
   « Calendrier » télécharge un fichier .ics : le rappel natif du téléphone. */

type Props = { onClose: () => void; onBook: () => void; toast: (msg: string) => void };

const STATUS_META: Record<Appointment['status'], { label: string; cls: string }> = {
  'confirmé': { label: 'Confirmé', cls: 'mc-stchip--ok' },
  'en attente': { label: 'En attente', cls: 'mc-stchip--wait' },
  'honoré': { label: 'Honoré', cls: 'mc-stchip--info' },
  'annulé': { label: 'Annulé', cls: 'mc-stchip--off' },
};

export default function MesRendezVous({ onClose, onBook, toast }: Props) {
  const { branch, currency } = useBranch();
  const [services] = useServices();
  const [appts] = useAppointments();
  const clientId = useClientId();

  const mine = useMemo(
    () =>
      appts
        .filter((a) => a.clientId === clientId)
        .slice()
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [appts, clientId]
  );

  const now = new Date();
  const nowTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const today = todayIso();
  const isUpcoming = (a: Appointment) =>
    (a.status === 'confirmé' || a.status === 'en attente') &&
    (a.date > today || (a.date === today && a.time >= nowTime));

  const upcoming = mine.filter(isUpcoming);
  const past = mine.filter((a) => !isUpcoming(a)).slice(-6).reverse();

  const names = (a: Appointment) =>
    a.serviceIds.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean).join(' + ') ||
    'Rituel de la maison';

  const durationOf = (a: Appointment) => {
    const t = a.serviceIds.reduce((n, id) => n + (services.find((s) => s.id === id)?.durationMin ?? 60), 0);
    return t || 60;
  };

  /* ---- Calendrier du téléphone : un événement par séance (série complète) ---- */
  const addToCalendar = (a: Appointment) => {
    const group = a.seriesId ? mine.filter((x) => x.seriesId === a.seriesId && x.status !== 'annulé') : [a];
    const events: IcsEvent[] = group.map((x) => ({
      title: `Maison MND · ${names(x)}`,
      description: x.seriesTotal ? `Séance ${x.seriesIndex}/${x.seriesTotal} · avec ${x.master}` : `Avec ${x.master}`,
      location: branch.name,
      dateIso: x.date,
      time: x.time,
      durationMin: durationOf(x),
      alarmMin: 120,
    }));
    downloadIcs(events, 'rituel-maison-mnd.ics');
    toast('Fichier calendrier téléchargé — votre téléphone vous rappellera 2 h avant.');
  };

  /* ---- Modifier : nouvelle date + heure, comme à la réservation ---- */
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [monthIdx, setMonthIdx] = useState(0);
  const [selIso, setSelIso] = useState<string | null>(null);

  const months = useMemo(() => {
    const d0 = new Date();
    return [0, 1].map((k) => {
      const d = new Date(d0.getFullYear(), d0.getMonth() + k, 1);
      return { y: d.getFullYear(), m: d.getMonth(), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
    });
  }, []);
  const month = months[monthIdx];

  /* L'agenda sans le rendez-vous déplacé : son propre créneau redevient libre. */
  const others = useMemo(() => (editing ? appts.filter((x) => x.id !== editing.id) : appts), [appts, editing]);

  const calCells = useMemo(() => {
    if (!editing) return [];
    const dur = durationOf(editing);
    const first = new Date(month.y, month.m, 1);
    const daysIn = new Date(month.y, month.m + 1, 0).getDate();
    const cells: { key: string; day: number | null; iso?: string; free: boolean }[] = [];
    for (let i = 0; i < first.getDay(); i++) cells.push({ key: `b${i}`, day: null, free: false });
    for (let d = 1; d <= daysIn; d++) {
      const iso = `${month.y}-${pad2(month.m + 1)}-${pad2(d)}`;
      const free = iso >= today && freeSlots(iso, editing.master, dur, others, services, branch.id).length > 0;
      cells.push({ key: iso, day: d, iso, free });
    }
    return cells;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, month, others, services, branch.id, today]);

  const dayTimes =
    editing && selIso ? freeSlots(selIso, editing.master, durationOf(editing), others, services, branch.id) : [];

  const openEdit = (a: Appointment) => {
    setEditing(a);
    setMonthIdx(0);
    setSelIso(null);
  };

  const reschedule = (t: string) => {
    if (!editing || !selIso) return;
    const label = `${names(editing)} · ${dayLabelIso(selIso)} à ${t}`;
    appointmentsStore.set((prev) =>
      prev.map((x) => (x.id === editing.id ? { ...x, date: selIso, time: t, status: 'en attente' as const } : x))
    );
    const body = `${label} — en attente de confirmation de la maison.`;
    void enablePush(clientId).then((subbed) => {
      if (subbed) void pushNotify(clientId, 'Rendez-vous modifié', body, `${import.meta.env.BASE_URL}#/suivi`);
      else void askNotifyPermission().then((ok) => { if (ok) notifyLocal('Rendez-vous modifié', body); });
    });
    toast('Rendez-vous déplacé — la maison confirmera.');
    setEditing(null);
    setSelIso(null);
  };

  /* ---- Annuler : confirmation explicite, l'acompte reste acquis ---- */
  const [cancelling, setCancelling] = useState<Appointment | null>(null);

  const confirmCancel = () => {
    if (!cancelling) return;
    const a = cancelling;
    appointmentsStore.set((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: 'annulé' as const } : x)));
    const body = `${names(a)} du ${dayLabelIso(a.date)} à ${a.time} — annulé.`;
    void enablePush(clientId).then((subbed) => {
      if (subbed) void pushNotify(clientId, 'Rendez-vous annulé', body, `${import.meta.env.BASE_URL}#/suivi`);
      else void askNotifyPermission().then((ok) => { if (ok) notifyLocal('Rendez-vous annulé', body); });
    });
    toast('Rendez-vous annulé.');
    setCancelling(null);
  };

  return (
    <div className="mc-overlayscreen mc-slide" style={{ zIndex: 42 }}>
      <div className="mc-flowhead mc-flowhead--split">
        <div>
          {editing ? (
            <>
              <button className="mc-linkback" onClick={() => { setEditing(null); setSelIso(null); }}>
                ← Mes rendez-vous
              </button>
              <h1 className="mc-flowhead__h1" style={{ marginTop: 8 }}>Déplacer le rituel.</h1>
            </>
          ) : (
            <>
              <div className="mc-micro-eyebrow">Votre agenda · la maison suit</div>
              <h1 className="mc-flowhead__h1" style={{ marginTop: 4 }}>Mes rendez-vous.</h1>
            </>
          )}
        </div>
        <button className="mc-x" aria-label="Fermer" onClick={onClose}>✕</button>
      </div>

      <div className="mc-scroll mc-flowbody">
        {editing ? (
          /* -------- déplacement : calendrier + heures libres -------- */
          <div className="mc-fade">
            <div className="mc-prefillnote">
              {names(editing)} · actuellement {dayLabelIso(editing.date)} à {editing.time} · avec {editing.master}
              {editing.seriesTotal ? ` · séance ${editing.seriesIndex}/${editing.seriesTotal}` : ''}
            </div>
            <div className="mc-calnav">
              <button onClick={() => setMonthIdx(Math.max(0, monthIdx - 1))} disabled={monthIdx === 0}>‹</button>
              <span>{month.label}</span>
              <button
                onClick={() => setMonthIdx(Math.min(months.length - 1, monthIdx + 1))}
                disabled={monthIdx === months.length - 1}
              >
                ›
              </button>
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
                      setSelIso(c.iso!);
                    }}
                  >
                    {c.day}
                    {c.free && c.iso !== selIso && <i />}
                  </button>
                )
              )}
            </div>
            <div className="mc-callegend">
              <span />Jours avec créneaux libres · {fmtDuration(durationOf(editing))} · maître {editing.master}
            </div>

            {selIso && (
              <div className="mc-fade" style={{ marginTop: 20 }}>
                <div className="mc-micro-eyebrow" style={{ marginBottom: 10 }}>{dayLabelIso(selIso)} · heures libres</div>
                <div className="mc-stack">
                  {dayTimes.map((t) => (
                    <button key={t} className="mc-slotcard" onClick={() => reschedule(t)}>
                      <div>
                        <div className="mc-slotcard__time">{t}</div>
                        <div className="mc-slotcard__who">avec {editing.master} · {fmtDuration(durationOf(editing))}</div>
                      </div>
                      <span className="mc-slotcard__free">Choisir</span>
                    </button>
                  ))}
                  {dayTimes.length === 0 && (
                    <div className="mc-emptyline">Plus de créneau ce jour — choisissez un autre jour.</div>
                  )}
                </div>
              </div>
            )}
            <div className="mc-footnote" style={{ textAlign: 'left', marginTop: 16 }}>
              Le déplacement repasse le rendez-vous en attente — la maison le re-confirme.
            </div>
          </div>
        ) : (
          /* -------- liste : à venir puis passés récents -------- */
          <div className="mc-fade">
            <div className="mc-sectionlabel" style={{ margin: '0 0 10px' }}>À venir</div>
            {upcoming.length === 0 && (
              <div className="mc-emptyzone">
                <div className="mc-emptyzone__glyph">♛</div>
                <div className="mc-emptyzone__t">Aucun rituel à venir.</div>
                <div className="mc-emptyzone__s">
                  Votre couronne mérite sa prochaine séance — la maison vous attend.
                </div>
                <button className="mc-cta mc-cta--copper" style={{ marginTop: 22 }} onClick={onBook}>
                  Réserver un rituel
                </button>
              </div>
            )}
            <div className="mc-stack" style={{ gap: 10 }}>
              {upcoming.map((a) => (
                <div key={a.id} className="mc-rdvcard">
                  <div className="mc-rdvcard__top">
                    <span className="mc-rdvcard__when">{dayLabelIso(a.date)} · {a.time}</span>
                    <span className={`mc-stchip ${STATUS_META[a.status].cls}`}>{STATUS_META[a.status].label}</span>
                  </div>
                  <div className="mc-rdvcard__svc">{names(a)}</div>
                  <div className="mc-rdvcard__meta">avec {a.master} · {fmtDuration(durationOf(a))} · {branch.name}</div>
                  {(a.seriesTotal || a.depositXof != null) && (
                    <div className="mc-rdvcard__chips">
                      {a.seriesTotal && <span className="mc-pillseal">Séance {a.seriesIndex}/{a.seriesTotal}</span>}
                      {a.depositXof != null && (
                        <span className="mc-pillseal">{a.depositConfirmed ? 'Acompte reçu' : 'Acompte'} · {fmtMoney(a.depositXof, currency)}</span>
                      )}
                    </div>
                  )}
                  <div className="mc-rdvcard__acts">
                    <button className="mc-rdvact" onClick={() => openEdit(a)}>Modifier</button>
                    <button className="mc-rdvact" onClick={() => addToCalendar(a)}>Calendrier</button>
                    <button className="mc-rdvact mc-rdvact--danger" onClick={() => setCancelling(a)}>Annuler</button>
                  </div>
                </div>
              ))}
            </div>

            {past.length > 0 && (
              <>
                <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>Passés récents</div>
                <div className="mc-stack" style={{ gap: 10 }}>
                  {past.map((a) => (
                    <div key={a.id} className="mc-rdvcard mc-rdvcard--past">
                      <div className="mc-rdvcard__top">
                        <span className="mc-rdvcard__when">{dayLabelIso(a.date)} · {a.time}</span>
                        <span className={`mc-stchip ${STATUS_META[a.status].cls}`}>{STATUS_META[a.status].label}</span>
                      </div>
                      <div className="mc-rdvcard__svc">{names(a)}</div>
                      <div className="mc-rdvcard__meta">avec {a.master}</div>
                      {a.seriesTotal && (
                        <div className="mc-rdvcard__chips">
                          <span className="mc-pillseal">Séance {a.seriesIndex}/{a.seriesTotal}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {upcoming.length > 0 && (
              <div className="mc-footnote" style={{ textAlign: 'left', marginTop: 18 }}>
                Les rappels passent par votre calendrier (bouton « Calendrier ») et par l’app ouverte —
                la maison ne peut pas encore vous notifier à distance.
              </div>
            )}
          </div>
        )}

        {/* -------- feuille de confirmation d'annulation -------- */}
        {cancelling && (
          <div className="mc-paysheet mc-fade">
            <div className="mc-paysheet__card mc-rise" style={{ textAlign: 'left' }}>
              <div className="mc-micro-eyebrow">Annulation</div>
              <div className="mc-cancel__t">Annuler ce rendez-vous ?</div>
              <div className="mc-cancel__s">
                {names(cancelling)} · {dayLabelIso(cancelling.date)} à {cancelling.time} · avec {cancelling.master}.
              </div>
              {cancelling.depositXof != null && (
                <div className="mc-cancel__warn">
                  L’acompte de {fmtMoney(cancelling.depositXof, currency)} reste acquis à la maison.
                </div>
              )}
              <div className="mc-cancel__acts">
                <button className="mc-cta mc-cta--danger" onClick={confirmCancel}>Annuler le rendez-vous</button>
                <button className="mc-cta mc-cta--quiet" onClick={() => setCancelling(null)}>Garder le rendez-vous</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
