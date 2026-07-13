import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Segs } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { OPEN_HOUR, CLOSE_HOUR, type Appointment } from '../../../../shared/agenda';
import {
  RdvModal, addDaysISO, apptDurationMin, apptLabel, frShort, fromISO, pad2, timeToMin, toISO, todayISO,
  useBranchAppointments, useBranchClients, useServicesById,
} from './_shared';

/* Calendrier — la journée par Maître, la semaine d'un regard. 08:00 → 18:00. */

const HOUR_PX = 56;

export default function Calendrier() {
  const { branch } = useBranch();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const byId = useServicesById();
  const today = todayISO();

  const [view, setView] = useState<'jour' | 'semaine'>('jour');
  const [anchor, setAnchor] = useState(today);
  const [modalOpen, setModalOpen] = useState(false);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente de passage';

  const hours = useMemo(() => {
    const out: string[] = [];
    for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h++) out.push(`${pad2(h)}:00`);
    return out;
  }, []);

  /* — vue jour : colonnes par Maître — */
  const dayCols = useMemo(
    () =>
      branch.masters.map((m) => ({
        name: m,
        appts: appts
          .filter((a) => a.date === anchor && a.master === m && a.status !== 'annulé')
          .sort((a, b) => timeToMin(a.time) - timeToMin(b.time)),
      })),
    [branch.masters, appts, anchor],
  );

  /* — vue semaine : du lundi au dimanche autour de l'ancre — */
  const week = useMemo(() => {
    const d = fromISO(anchor);
    const dow = (d.getDay() + 6) % 7; // lundi = 0
    const monday = addDaysISO(anchor, -dow);
    return Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysISO(monday, i);
      return {
        iso,
        dow: fromISO(iso).toLocaleDateString('fr-FR', { weekday: 'short' }),
        num: fromISO(iso).getDate(),
        isToday: iso === today,
        appts: appts
          .filter((a) => a.date === iso && a.status !== 'annulé')
          .sort((a, b) => timeToMin(a.time) - timeToMin(b.time)),
      };
    });
  }, [anchor, appts, today]);

  const shift = (dir: 1 | -1) => setAnchor((cur) => addDaysISO(cur, view === 'jour' ? dir : dir * 7));

  const navLabel =
    view === 'jour'
      ? frShort(anchor)
      : `${frShort(week[0].iso)} → ${frShort(week[6].iso)}`;

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Le Carnet · Calendrier"
        title="Calendrier."
        actions={
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--hairline)', borderRadius: 2, padding: '8px 12px' }}>
              <button onClick={() => shift(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 13 }} aria-label="Précédent">‹</button>
              <button
                onClick={() => setAnchor(today)}
                title="Revenir à aujourd’hui"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, letterSpacing: '.06em', color: 'var(--color-indigo)' }}
              >
                {navLabel}
              </button>
              <button onClick={() => shift(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 13 }} aria-label="Suivant">›</button>
            </div>
            <Segs<'jour' | 'semaine'>
              options={[
                { value: 'jour', label: 'Jour' },
                { value: 'semaine', label: 'Semaine' },
              ]}
              value={view}
              onChange={setView}
            />
            <Button variant="copper" onClick={() => setModalOpen(true)}>+ Nouveau RDV</Button>
          </>
        }
      />

      {view === 'jour' && (
        <div className="trc-cal" style={{ marginTop: 0 }}>
          <div className="trc-cal__masters">
            <div style={{ width: 64, flex: 'none' }} />
            {dayCols.map((m) => (
              <div className="trc-cal__mhead" key={m.name}>
                <span
                  className="trc-avatar"
                  style={{ width: 34, height: 34, fontSize: 14 }}
                >
                  {m.name.slice(0, 2)}
                </span>
                <div>
                  <div className="trc-cal__mname">{m.name}</div>
                  <div className="trc-cal__mcount">{m.appts.length} rituel{m.appts.length > 1 ? 's' : ''}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="trc-cal__body">
            <div className="trc-cal__hours">
              {hours.map((h) => (
                <div className="trc-cal__hour" key={h}>
                  <span>{h}</span>
                </div>
              ))}
            </div>
            {dayCols.map((m) => (
              <div className="trc-cal__col" key={m.name} style={{ height: hours.length * HOUR_PX }}>
                {m.appts.map((a) => {
                  const startMin = timeToMin(a.time);
                  const dur = apptDurationMin(a, byId);
                  const top = ((startMin - OPEN_HOUR * 60) / 60) * HOUR_PX;
                  const h = Math.max(30, (dur / 60) * HOUR_PX - 6);
                  const live = anchor === today && nowMin >= startMin && nowMin < startMin + dur && a.status !== 'honoré';
                  const cls = live ? 'trc-cal__appt--deep' : a.status === 'honoré' ? 'trc-cal__appt--muted' : '';
                  return (
                    <div
                      className={`trc-cal__appt ${cls}`}
                      key={a.id}
                      style={{ top, height: h, cursor: 'pointer' }}
                      title={`${apptLabel(a, byId)} — cliquer pour modifier`}
                      onClick={() => setEditAppt(a)}
                    >
                      <div className="trc-cal__appt-title">
                        {a.time} · {apptLabel(a, byId)}
                      </div>
                      <div className="trc-cal__appt-sub">{clientName(a.clientId)}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'semaine' && (
        <div className="trc-cal" style={{ marginTop: 0 }}>
          <div className="trc-week">
            {week.map((d) => (
              <div className="trc-week__day" key={d.iso}>
                <div className="trc-week__head" style={d.isToday ? { background: 'var(--color-sable)' } : undefined}>
                  <div className="trc-week__dow">{d.dow}</div>
                  <div className="trc-week__num" style={d.isToday ? { color: 'var(--color-indigo)' } : undefined}>{d.num}</div>
                </div>
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {d.appts.map((a) => {
                    const first = byId.get(a.serviceIds[0]);
                    const deep = a.status === 'confirmé' || a.status === 'en attente';
                    return (
                      <div
                        className={`trc-week__chip ${deep ? 'trc-week__chip--deep' : ''}`}
                        key={a.id}
                        style={{ cursor: 'pointer' }}
                        title={`${clientName(a.clientId)} · ${a.master} — cliquer pour modifier`}
                        onClick={() => setEditAppt(a)}
                      >
                        <b>{a.time}</b>
                        <i>
                          {a.master[0]} · {first?.name ?? 'Rituel'}
                        </i>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalOpen && <RdvModal onClose={() => setModalOpen(false)} initial={{ date: anchor }} />}
      {editAppt && <RdvModal onClose={() => setEditAppt(null)} appt={editAppt} />}
    </div>
  );
}
