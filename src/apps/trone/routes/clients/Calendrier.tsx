import { useMemo, useRef, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Segs } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { OPEN_HOUR, CLOSE_HOUR, appointmentsStore, type Appointment } from '../../../../shared/agenda';
import {
  RdvModal, addDaysISO, apptDurationMin, apptLabel, frShort, fromISO, pad2, timeToMin, toISO, todayISO,
  useBranchAppointments, useBranchClients, useServicesById,
} from './_shared';
import { PayAppointmentModal } from './actions';

/* Calendrier — la journée par Maître, la semaine d'un regard. 08:00 → 18:00.
   Déplacer un rendez-vous : glisser le bloc vers un autre créneau (jour) ou un
   autre jour (semaine) ; cliquer l'ouvre en modification. */

const HOUR_PX = 56;
const SLOT_MIN = 30; // pas de la grille — calage identique au carnet

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
  const [payAppt, setPayAppt] = useState<Appointment | null>(null);

  /* — Déplacement direct (glisser-déposer natif) — */
  const [dragId, setDragId] = useState<string | null>(null); // rituel en cours de déplacement
  const [dropKey, setDropKey] = useState<string | null>(null); // zone survolée (surbrillance)
  const [hint, setHint] = useState<string | null>(null); // indication brève (chevauchement…)
  const grabOffsetY = useRef(0); // prise dans le bloc — pour un calage naturel
  const didDrag = useRef(false); // distingue glisser d'un simple clic
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashHint = (msg: string) => {
    setHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 2600);
  };

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente de passage';

  /* Marque « k/N » d'une séance appartenant à une série multi-séances. */
  const serieMark = (a: Appointment): string | null =>
    a.seriesIndex && a.seriesTotal && a.seriesTotal > 1 ? `${a.seriesIndex}/${a.seriesTotal}` : null;

  /* Chevauchement — même maître, même jour, statut non annulé (indication non bloquante). */
  const collides = (moved: Appointment, date: string, time: string, master: string): boolean => {
    const start = timeToMin(time);
    const end = start + apptDurationMin(moved, byId);
    return appts.some((a) => {
      if (a.id === moved.id || a.date !== date || a.master !== master || a.status === 'annulé') return false;
      const s2 = timeToMin(a.time);
      return start < s2 + apptDurationMin(a, byId) && s2 < end;
    });
  };

  /** Position Y (px, dans la colonne) → heure calée sur la grille, bornée à l'amplitude. */
  const yToTime = (y: number): string => {
    const raw = OPEN_HOUR * 60 + (y / HOUR_PX) * 60;
    const snapped = Math.round(raw / SLOT_MIN) * SLOT_MIN;
    const clamped = Math.max(OPEN_HOUR * 60, Math.min(CLOSE_HOUR * 60 - SLOT_MIN, snapped));
    return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
  };

  const onDragStart = (e: React.DragEvent, a: Appointment) => {
    setDragId(a.id);
    didDrag.current = true;
    grabOffsetY.current = e.nativeEvent.offsetY || 0;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', a.id); // Firefox exige une charge utile
  };

  const endDrag = () => {
    setDragId(null);
    setDropKey(null);
  };

  const onDragEnd = (e: React.DragEvent) => {
    endDrag();
    // Glisser abandonné hors zone : autoriser le prochain clic à rouvrir la modale.
    if (e.dataTransfer.dropEffect === 'none') didDrag.current = false;
  };

  const applyMove = (a: Appointment, next: { date: string; time: string; master: string }) => {
    if (a.date === next.date && a.time === next.time && a.master === next.master) return;
    appointmentsStore.set((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, date: next.date, time: next.time, master: next.master } : x)),
    );
    if (collides(a, next.date, next.time, next.master)) {
      flashHint(`Déplacé à ${next.time} — chevauchement avec un autre rituel de ${next.master}.`);
    } else {
      flashHint(`Rituel déplacé à ${frShort(next.date)} · ${next.time}.`);
    }
  };

  /* Dépose en vue jour : la colonne porte le maître, l'ordonnée donne l'heure. */
  const onDropDay = (e: React.DragEvent, master: string) => {
    e.preventDefault();
    const a = appts.find((x) => x.id === dragId);
    endDrag();
    if (!a) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top - grabOffsetY.current;
    applyMove(a, { date: anchor, time: yToTime(y), master });
  };

  /* Dépose en vue semaine : la colonne porte le jour ; heure et maître conservés. */
  const onDropWeek = (e: React.DragEvent, iso: string) => {
    e.preventDefault();
    const a = appts.find((x) => x.id === dragId);
    endDrag();
    if (!a) return;
    applyMove(a, { date: iso, time: a.time, master: a.master });
  };

  /* Après un glisser, neutralise le clic parasite qui rouvrirait la modale. */
  const clickAppt = (a: Appointment) => {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    setEditAppt(a);
  };

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
              <div
                className={`trc-cal__col ${dropKey === `d:${m.name}` ? 'is-drop' : ''}`}
                key={m.name}
                style={{ height: hours.length * HOUR_PX }}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropKey(`d:${m.name}`); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropKey((k) => (k === `d:${m.name}` ? null : k)); }}
                onDrop={(e) => onDropDay(e, m.name)}
              >
                {m.appts.map((a) => {
                  const startMin = timeToMin(a.time);
                  const dur = apptDurationMin(a, byId);
                  const top = ((startMin - OPEN_HOUR * 60) / 60) * HOUR_PX;
                  const h = Math.max(30, (dur / 60) * HOUR_PX - 6);
                  const live = anchor === today && nowMin >= startMin && nowMin < startMin + dur && a.status !== 'honoré';
                  const cls = live ? 'trc-cal__appt--deep' : a.status === 'honoré' ? 'trc-cal__appt--muted' : '';
                  return (
                    <div
                      className={`trc-cal__appt trc-cal__appt--drag ${cls} ${dragId === a.id ? 'is-dragging' : ''}`}
                      key={a.id}
                      style={{ top, height: h }}
                      title={`${apptLabel(a, byId)} — glisser pour déplacer, cliquer pour modifier`}
                      draggable
                      onDragStart={(e) => onDragStart(e, a)}
                      onDragEnd={onDragEnd}
                      onClick={() => clickAppt(a)}
                    >
                      <div className="trc-cal__appt-title">
                        {a.time} · {apptLabel(a, byId)}
                        {serieMark(a) && <span className="trc-cal__serie">{serieMark(a)}</span>}
                      </div>
                      <div className="trc-cal__appt-sub">{clientName(a.clientId)}</div>
                      {a.status !== 'honoré' && (
                        <button
                          className="trc-cal__encaisser"
                          draggable={false}
                          onClick={(e) => { e.stopPropagation(); setPayAppt(a); }}
                          title="Encaisser ce rituel"
                        >
                          Encaisser
                        </button>
                      )}
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
              <div
                className={`trc-week__day ${dropKey === `w:${d.iso}` ? 'is-drop' : ''}`}
                key={d.iso}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropKey(`w:${d.iso}`); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropKey((k) => (k === `w:${d.iso}` ? null : k)); }}
                onDrop={(e) => onDropWeek(e, d.iso)}
              >
                <div className="trc-week__head" style={d.isToday ? { background: 'var(--color-sable)' } : undefined}>
                  <div className="trc-week__dow">{d.dow}</div>
                  <div className="trc-week__num" style={d.isToday ? { color: 'var(--color-indigo)' } : undefined}>{d.num}</div>
                </div>
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 120 }}>
                  {d.appts.map((a) => {
                    const first = byId.get(a.serviceIds[0]);
                    const deep = a.status === 'confirmé' || a.status === 'en attente';
                    return (
                      <div
                        className={`trc-week__chip trc-week__chip--drag ${deep ? 'trc-week__chip--deep' : ''} ${dragId === a.id ? 'is-dragging' : ''}`}
                        key={a.id}
                        title={`${clientName(a.clientId)} · ${a.master} — glisser vers un autre jour, cliquer pour modifier`}
                        draggable
                        onDragStart={(e) => onDragStart(e, a)}
                        onDragEnd={onDragEnd}
                        onClick={() => clickAppt(a)}
                      >
                        <b>{a.time}</b>
                        <i>
                          {a.master[0]} · {first?.name ?? 'Rituel'}
                          {serieMark(a) ? ` · ${serieMark(a)}` : ''}
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

      {hint && <div className="trc-cal__toast" role="status">{hint}</div>}

      {modalOpen && <RdvModal onClose={() => setModalOpen(false)} initial={{ date: anchor }} />}
      {editAppt && <RdvModal onClose={() => setEditAppt(null)} appt={editAppt} />}
      {payAppt && <PayAppointmentModal appt={payAppt} onClose={() => setPayAppt(null)} />}
    </div>
  );
}
