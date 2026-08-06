import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Segs } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { bornesDuSalon, appointmentsStore, type Appointment } from '../../../../shared/agenda';
import {
  PayStatusPill, RdvModal, ReminderBell, addDaysISO, apptDurationMin, apptLabel, frShort, fromISO, pad2, timeToMin, toISO, todayISO,
  useBranchAppointments, useBranchClients, useServicesById, type RdvInitial,
} from './_shared';
import { PayAppointmentModal } from './actions';
import { useStaff as useMyStaff } from '../../../../shared/auth';
import { useSettings } from '../../../../shared/settings';
import { staffAccessStore } from '../equipe/data';
import { useStore } from '../../../../shared/store';
import { voitLesPrix } from '../index';

/* Calendrier — la journée par Maître, la semaine d'un regard. 08:00 → 18:00.
   Déplacer un rendez-vous : glisser le bloc vers un autre créneau (jour) ou un
   autre jour (semaine) ; cliquer l'ouvre en modification. */

const HOUR_PX = 56;
const SLOT_MIN = 30; // pas de la grille — calage identique au carnet
const WEEKDAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']; // en-tête de la vue mois

/* Vrai sur téléphone (≤ 640 px) — bascule la vue en agenda vertical / pile de jours. */
function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

export default function Calendrier() {
  const moi = useMyStaff();
  /* LA GRILLE SUIT LES HEURES DU SALON. Elle était figée à 8 h – 18 h pendant
     que « Mon mois » jugeait la ponctualité sur 9 h – 20 h : un maître arrivé
     à 8 h 55 pouvait se croire en retard, et le fauteuil de 19 h n'existait
     pas à l'écran. */
  const [reglagesMaison] = useSettings();
  const { ouverture: OPEN_HOUR, fermeture: CLOSE_HOUR } = bornesDuSalon(
    Object.fromEntries(reglagesMaison.hours.map((d) => [d.key, { open: d.open, close: d.close, closed: d.closed }])),
  );
  /* CE N'EST PAS LE ROLE QUI DECIDE DES PRIX, C'EST LE DOMAINE OUVERT. Gerard
     tient le secretariat ET le fauteuil : maitre par son role, il encaisse
     pourtant, et un comptoir sans montants ne sert a rien. */
  const mesDomaines = useStore(staffAccessStore)[0][moi?.user_id ?? ''] ?? {};
  const estMaitre = !voitLesPrix(moi?.role, mesDomaines);
  const { branch } = useBranch();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const byId = useServicesById();
  const today = todayISO();

  const isPhone = useIsPhone();
  const [view, setView] = useState<'jour' | 'semaine' | 'mois'>('jour');
  const [anchor, setAnchor] = useState(today);
  /* Prise de RDV : pré-remplissage du nouveau rendez-vous (jour touché, et en vue
     jour l'heure + le maître de la colonne). null = pas de création en cours. */
  const [createInit, setCreateInit] = useState<RdvInitial | null>(null);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [payAppt, setPayAppt] = useState<Appointment | null>(null);

  /* — Déplacement direct (glisser-déposer natif) — */
  const [dragId, setDragId] = useState<string | null>(null); // rituel en cours de déplacement
  const [dropKey, setDropKey] = useState<string | null>(null); // zone survolée (surbrillance)
  const [hint, setHint] = useState<string | null>(null); // indication brève (chevauchement…)
  const grabOffsetY = useRef(0); // prise dans le bloc — pour un calage naturel
  const didDrag = useRef(false); // distingue glisser d'un simple clic
  const touchStart = useRef<{ x: number; y: number; moved: boolean } | null>(null); // tap vs glissement tactile
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashHint = (msg: string) => {
    setHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 2600);
  };

  const clientOf = (id: string) => clients.find((c) => c.id === id);
  const clientName = (id: string) => clientOf(id)?.name ?? 'Cliente de passage';

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

  const onDragEnd = () => {
    endDrag();
    // Après un glisser (réussi OU abandonné), libère le clic suivant — sinon le
    // prochain clic réel serait avalé par le garde-fou didDrag. Différé (setTimeout 0)
    // pour gober l'éventuel clic parasite qui suivrait immédiatement le dépôt.
    window.setTimeout(() => { didDrag.current = false; }, 0);
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

  /* — Déplacement au doigt (tactile) — miroir du glisser natif, sans HTML5 DnD.
     Les événements tactiles restent ciblés sur le bloc d'origine ; on retrouve la
     colonne survolée via elementFromPoint aux attributs data-daycol / data-weekday. */
  const onTouchStartAppt = (e: React.TouchEvent, a: Appointment) => {
    setDragId(a.id);
    // On NE marque PAS encore didDrag : un simple tap doit ouvrir la modale.
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, moved: false };
    // Prise dans le bloc (vue jour) — pour un calage naturel de l'heure.
    grabOffsetY.current = t.clientY - e.currentTarget.getBoundingClientRect().top;
  };

  const onTouchMoveDrag = (e: React.TouchEvent) => {
    if (!dragId || !touchStart.current) return;
    const t = e.touches[0];
    // En deçà du seuil, c'est encore un tap : on laisse faire (pas de déplacement).
    if (!touchStart.current.moved && Math.hypot(t.clientX - touchStart.current.x, t.clientY - touchStart.current.y) < 8) return;
    touchStart.current.moved = true;
    didDrag.current = true; // désormais c'est un glissement : neutralise le clic parasite
    e.preventDefault(); // empêche le défilement de la page pendant le glisser
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const dayCol = el?.closest('[data-daycol]');
    const weekDay = el?.closest('[data-weekday]');
    if (dayCol) setDropKey(`d:${dayCol.getAttribute('data-daycol')}`);
    else if (weekDay) setDropKey(`w:${weekDay.getAttribute('data-weekday')}`);
    else setDropKey(null);
  };

  const onTouchEndDrag = (e: React.TouchEvent) => {
    const moved = touchStart.current?.moved ?? false;
    touchStart.current = null;
    // Tap sans glissement : on ne déplace rien, le clic ouvrira la modale.
    if (!moved) { endDrag(); return; }
    const a = appts.find((x) => x.id === dragId);
    const t = e.changedTouches[0];
    const el = t ? document.elementFromPoint(t.clientX, t.clientY) : null;
    if (a && el) {
      if (view === 'jour') {
        const dayCol = el.closest('[data-daycol]');
        const master = dayCol?.getAttribute('data-daycol');
        if (dayCol && master) {
          const rect = dayCol.getBoundingClientRect();
          const y = t.clientY - rect.top - grabOffsetY.current;
          applyMove(a, { date: anchor, time: yToTime(y), master });
        }
      } else if (view === 'semaine' || view === 'mois') {
        const weekDay = el.closest('[data-weekday]');
        const iso = weekDay?.getAttribute('data-weekday');
        if (weekDay && iso) applyMove(a, { date: iso, time: a.time, master: a.master });
      }
    }
    endDrag();
    // Le glissement a posé didDrag=true : on le libère pour ne pas avaler le tap suivant.
    window.setTimeout(() => { didDrag.current = false; }, 0);
  };

  /* Après un glisser, neutralise le clic parasite qui rouvrirait la modale. */
  const clickAppt = (a: Appointment) => {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    setEditAppt(a);
  };

  /* Toucher un créneau VIDE d'une colonne-maître (vue jour) ouvre la prise de RDV,
     pré-remplie du jour, de l'heure calée sur la grille et du maître de la colonne.
     On ignore les touchers sur un rituel ou un bouton (leurs propres gestes), et le
     clic parasite qui suit un glisser. « Non assigné » → aucun maître imposé. */
  const clickDaySlot = (e: React.MouseEvent, master: string) => {
    if (didDrag.current) { didDrag.current = false; return; }
    const el = e.target as HTMLElement;
    if (el.closest('.trc-cal__appt') || el.closest('button')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const time = yToTime(e.clientY - rect.top);
    const known = branch.masters.includes(master);
    setCreateInit(known ? { date: anchor, time, master } : { date: anchor, time });
  };

  /* Toucher un jour VIDE (vue semaine) ouvre la prise de RDV pré-remplie de ce jour. */
  const clickWeekDay = (e: React.MouseEvent, iso: string) => {
    if (didDrag.current) { didDrag.current = false; return; }
    const el = e.target as HTMLElement;
    if (el.closest('.trc-week__chip') || el.closest('button')) return;
    setCreateInit({ date: iso });
  };

  /* Ouvre la journée dans la vue Jour (depuis un numéro de case du mois). */
  const openDay = (iso: string) => { setAnchor(iso); setView('jour'); };

  /* Case du mois : un chip ouvre le rituel ; sur téléphone toute la case ouvre la
     journée (les cases sont trop petites pour manipuler des rituels) ; sur grand
     écran, le vide prend un rendez-vous ce jour-là. */
  const clickMonthCell = (e: React.MouseEvent, iso: string) => {
    if (didDrag.current) { didDrag.current = false; return; }
    const el = e.target as HTMLElement;
    if (el.closest('.trc-month__chip') || el.closest('button')) return;
    if (isPhone) { openDay(iso); return; }
    setCreateInit({ date: iso });
  };

  const hours = useMemo(() => {
    const out: string[] = [];
    for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h++) out.push(`${pad2(h)}:00`);
    return out;
  }, []);

  /* — vue jour : colonnes par Maître —
     On part des maîtres de la branche, MAIS on ajoute une colonne pour tout maître
     présent dans les RDV du jour et absent de la liste (y compris un maître vide,
     regroupé sous « Non assigné »). Sans ça, un rendez-vous dont le maître ne
     correspond à aucune colonne disparaissait purement du planning du jour. */
  const dayCols = useMemo(() => {
    const dayAppts = appts
      .filter((a) => a.date === anchor && a.status !== 'annulé')
      .sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
    const known = new Set(branch.masters);
    const cols = branch.masters.map((m) => ({ name: m, appts: dayAppts.filter((a) => a.master === m) }));
    for (const m of [...new Set(dayAppts.filter((a) => !known.has(a.master)).map((a) => a.master))]) {
      cols.push({ name: m || 'Non assigné', appts: dayAppts.filter((a) => a.master === m) });
    }
    return cols;
  }, [branch.masters, appts, anchor]);

  /* — vue jour sur TÉLÉPHONE : agenda vertical (tous maîtres confondus, par heure) —
     la grille multi-colonnes est illisible sur un petit écran ; on la remplace par
     une liste claire, chaque rituel touchable pour l'ouvrir. */
  const dayList = useMemo(
    () => appts
      .filter((a) => a.date === anchor && a.status !== 'annulé')
      .sort((a, b) => timeToMin(a.time) - timeToMin(b.time)),
    [appts, anchor],
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

  /* — vue mois : grille de semaines (lundi → dimanche) couvrant le mois de l'ancre —
     On part du lundi de la semaine du 1er, jusqu'au dimanche de la semaine du dernier
     jour : 5 ou 6 rangées selon le mois. Les jours hors-mois restent affichés (estompés)
     pour une grille pleine, cliquables comme les autres. */
  const monthCells = useMemo(() => {
    const d = fromISO(anchor);
    const year = d.getFullYear();
    const mon = d.getMonth();
    const firstDow = (new Date(year, mon, 1).getDay() + 6) % 7; // lundi = 0
    const startIso = addDaysISO(toISO(new Date(year, mon, 1)), -firstDow);
    const daysInMonth = new Date(year, mon + 1, 0).getDate();
    const rows = Math.ceil((firstDow + daysInMonth) / 7);
    return Array.from({ length: rows * 7 }, (_, i) => {
      const iso = addDaysISO(startIso, i);
      const dd = fromISO(iso);
      return {
        iso,
        num: dd.getDate(),
        inMonth: dd.getMonth() === mon,
        isToday: iso === today,
        appts: appts
          .filter((a) => a.date === iso && a.status !== 'annulé')
          .sort((a, b) => timeToMin(a.time) - timeToMin(b.time)),
      };
    });
  }, [anchor, appts, today]);

  const shift = (dir: 1 | -1) => setAnchor((cur) => {
    if (view === 'mois') {
      const d = fromISO(cur);
      return toISO(new Date(d.getFullYear(), d.getMonth() + dir, 1)); // 1er du mois voisin
    }
    return addDaysISO(cur, view === 'jour' ? dir : dir * 7);
  });

  const navLabel =
    view === 'jour'
      ? frShort(anchor)
      : view === 'semaine'
        ? `${frShort(week[0].iso)} → ${frShort(week[6].iso)}`
        : fromISO(anchor).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

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
            <Segs<'jour' | 'semaine' | 'mois'>
              options={[
                { value: 'jour', label: 'Jour' },
                { value: 'semaine', label: 'Semaine' },
                { value: 'mois', label: 'Mois' },
              ]}
              value={view}
              onChange={setView}
            />
            <Button variant="copper" onClick={() => setCreateInit({ date: anchor })}>+ Nouveau RDV</Button>
          </>
        }
      />

      {/* Vue JOUR · téléphone — agenda vertical, tous maîtres confondus */}
      {view === 'jour' && isPhone && (
        <div className="trc-agenda">
          {dayList.length === 0 ? (
            <div className="trc-agenda__empty">
              Aucun rituel ce jour — touchez « + » pour en prendre un.
            </div>
          ) : (
            dayList.map((a) => {
              const startMin = timeToMin(a.time);
              const dur = apptDurationMin(a, byId);
              const live = anchor === today && nowMin >= startMin && nowMin < startMin + dur && a.status !== 'honoré';
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`trc-agenda__row ${live ? 'is-live' : ''} ${a.status === 'honoré' ? 'is-muted' : ''}`}
                  onClick={() => setEditAppt(a)}
                >
                  <span className="trc-agenda__time">{a.time}</span>
                  <span className="trc-agenda__main">
                    <span className="trc-agenda__client">
                      {clientName(a.clientId)}
                      {serieMark(a) && <span className="trc-cal__serie">{serieMark(a)}</span>}
                    </span>
                    <span className="trc-agenda__svc">{apptLabel(a, byId)} · {a.master}</span>
                  </span>
                  <span className="trc-agenda__side" onClick={(e) => e.stopPropagation()}>
                    <PayStatusPill a={a} byId={byId} />
                    <ReminderBell appt={a} client={clientOf(a.clientId)} byId={byId} className="trc-remind--sm" size={13} />
                    {a.status !== 'honoré' && (
                      <button type="button" className="trc-agenda__pay" onClick={(e) => { e.stopPropagation(); setPayAppt(a); }}>Encaisser</button>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}

      {view === 'jour' && !isPhone && (
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
                data-daycol={m.name}
                style={{ height: hours.length * HOUR_PX, cursor: 'copy' }}
                title="Touchez un créneau libre pour prendre un rendez-vous"
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropKey(`d:${m.name}`); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropKey((k) => (k === `d:${m.name}` ? null : k)); }}
                onDrop={(e) => onDropDay(e, m.name)}
                onClick={(e) => clickDaySlot(e, m.name)}
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
                      title={`${clientName(a.clientId)} · ${apptLabel(a, byId)} — glisser pour déplacer, cliquer pour modifier`}
                      draggable
                      onDragStart={(e) => onDragStart(e, a)}
                      onDragEnd={onDragEnd}
                      onTouchStart={(e) => onTouchStartAppt(e, a)}
                      onTouchMove={onTouchMoveDrag}
                      onTouchEnd={onTouchEndDrag}
                      onClick={() => clickAppt(a)}
                    >
                      {/* Rappel WhatsApp — épinglé au coin haut-droit, à l'écart du
                          bouton Encaisser ; invisible sur un rituel passé ou honoré. */}
                      <ReminderBell appt={a} client={clientOf(a.clientId)} byId={byId} className="trc-remind--cal" size={12} />
                      {/* La cliente d'abord : un rituel de 30 min ne fait que 30 px
                          de haut, et `overflow: hidden` n'y laisse tenir qu'UNE
                          ligne. C'est le nom qui doit survivre à la coupe, pas le
                          rituel — on lit un carnet pour savoir qui vient. */}
                      <div className="trc-cal__appt-title">
                        {a.time} · {clientName(a.clientId)}
                        {serieMark(a) && <span className="trc-cal__serie">{serieMark(a)}</span>}
                      </div>
                      <div className="trc-cal__appt-sub" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apptLabel(a, byId)}</span>
                        <span style={{ pointerEvents: 'none', flex: 'none' }}><PayStatusPill a={a} byId={byId} /></span>
                      </div>
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

      {/* Vue SEMAINE · téléphone — pile de jours, pleine largeur */}
      {view === 'semaine' && isPhone && (
        <div className="trc-weekstack">
          {week.map((d) => (
            <div
              key={d.iso}
              className={`trc-weekstack__day ${d.isToday ? 'is-today' : ''}`}
              onClick={(e) => clickWeekDay(e, d.iso)}
            >
              <div className="trc-weekstack__head">
                <span className="trc-weekstack__dow">{d.dow} {d.num}</span>
                <span className="trc-weekstack__count">{d.appts.length} rituel{d.appts.length > 1 ? 's' : ''}</span>
              </div>
              {d.appts.length === 0 ? (
                <div className="trc-weekstack__empty">Libre — touchez pour prendre un rendez-vous.</div>
              ) : (
                d.appts.map((a) => {
                  const first = byId.get(a.serviceIds[0]);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className="trc-agenda__row"
                      onClick={(e) => { e.stopPropagation(); setEditAppt(a); }}
                    >
                      <span className="trc-agenda__time">{a.time}</span>
                      <span className="trc-agenda__main">
                        <span className="trc-agenda__client">
                          {clientName(a.clientId)}
                          {serieMark(a) && <span className="trc-cal__serie">{serieMark(a)}</span>}
                        </span>
                        <span className="trc-agenda__svc">{first?.name ?? 'Rituel'} · {a.master}</span>
                      </span>
                      <span className="trc-agenda__side">
                        <span style={{ pointerEvents: 'none' }}><PayStatusPill a={a} byId={byId} /></span>
                        <ReminderBell appt={a} client={clientOf(a.clientId)} byId={byId} className="trc-remind--sm" size={13} />
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ))}
        </div>
      )}

      {view === 'semaine' && !isPhone && (
        <div className="trc-cal" style={{ marginTop: 0 }}>
          <div className="trc-week">
            {week.map((d) => (
              <div
                className={`trc-week__day ${dropKey === `w:${d.iso}` ? 'is-drop' : ''}`}
                key={d.iso}
                data-weekday={d.iso}
                style={{ cursor: 'copy' }}
                title="Touchez un jour pour prendre un rendez-vous"
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropKey(`w:${d.iso}`); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropKey((k) => (k === `w:${d.iso}` ? null : k)); }}
                onDrop={(e) => onDropWeek(e, d.iso)}
                onClick={(e) => clickWeekDay(e, d.iso)}
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
                        onTouchStart={(e) => onTouchStartAppt(e, a)}
                        onTouchMove={onTouchMoveDrag}
                        onTouchEnd={onTouchEndDrag}
                        onClick={() => clickAppt(a)}
                      >
                        <b>{a.time}</b>
                        {/* Le nom sort de l'infobulle : sur une semaine on cherche
                            une cliente, pas une heure. */}
                        <i className="trc-week__who">{clientName(a.clientId)}</i>
                        <i>
                          {a.master[0]} · {first?.name ?? 'Rituel'}
                          {serieMark(a) ? ` · ${serieMark(a)}` : ''}
                        </i>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                          <span style={{ pointerEvents: 'none', display: 'inline-flex' }}>
                            <PayStatusPill a={a} byId={byId} />
                          </span>
                          <ReminderBell appt={a} client={clientOf(a.clientId)} byId={byId} className="trc-remind--chip" size={12} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vue MOIS — grille de semaines. Le numéro ouvre la journée, un chip ouvre le
          rituel, un jour vide prend un rendez-vous ; glisser un chip le déplace. */}
      {view === 'mois' && (
        <div className="trc-month">
          <div className="trc-month__head">
            {WEEKDAYS.map((w) => (
              <div className="trc-month__dow" key={w}>{w}</div>
            ))}
          </div>
          <div className="trc-month__grid">
            {monthCells.map((c) => (
              <div
                key={c.iso}
                className={`trc-month__cell ${c.inMonth ? '' : 'is-out'} ${c.isToday ? 'is-today' : ''} ${dropKey === `w:${c.iso}` ? 'is-drop' : ''}`}
                data-weekday={c.iso}
                style={{ cursor: 'copy' }}
                title={isPhone ? 'Toucher pour ouvrir la journée' : 'Cliquer un jour vide pour prendre un rendez-vous'}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropKey(`w:${c.iso}`); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropKey((k) => (k === `w:${c.iso}` ? null : k)); }}
                onDrop={(e) => onDropWeek(e, c.iso)}
                onClick={(e) => clickMonthCell(e, c.iso)}
              >
                <div className="trc-month__daynum">
                  <button
                    type="button"
                    className={`trc-month__numbtn ${c.isToday ? 'is-today' : ''}`}
                    onClick={(e) => { e.stopPropagation(); openDay(c.iso); }}
                    title="Ouvrir la journée"
                  >
                    {c.num}
                  </button>
                  {c.appts.length > 0 && <span className="trc-month__count">{c.appts.length}</span>}
                </div>
                {/* Chips détaillés — grand écran seulement (les cases mobiles n'ont pas la place). */}
                {!isPhone && c.appts.length > 0 && (
                  <div className="trc-month__list">
                    {c.appts.slice(0, 3).map((a) => (
                      <div
                        key={a.id}
                        className={`trc-month__chip trc-month__chip--drag ${a.status === 'honoré' ? 'is-muted' : ''} ${dragId === a.id ? 'is-dragging' : ''}`}
                        title={`${a.time} · ${clientName(a.clientId)} · ${apptLabel(a, byId)} — glisser vers un autre jour, cliquer pour modifier`}
                        draggable
                        onDragStart={(e) => onDragStart(e, a)}
                        onDragEnd={onDragEnd}
                        onTouchStart={(e) => onTouchStartAppt(e, a)}
                        onTouchMove={onTouchMoveDrag}
                        onTouchEnd={onTouchEndDrag}
                        onClick={(e) => { e.stopPropagation(); clickAppt(a); }}
                      >
                        <b>{a.time}</b> <span className="trc-month__who">{clientName(a.clientId)}</span>
                      </div>
                    ))}
                    {c.appts.length > 3 && (
                      <button
                        type="button"
                        className="trc-month__more"
                        onClick={(e) => { e.stopPropagation(); openDay(c.iso); }}
                      >
                        +{c.appts.length - 3} autres
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {hint && <div className="trc-cal__toast" role="status">{hint}</div>}

      {/* Bouton flottant — prise de RDV au pouce, toujours à portée sur mobile. */}
      <button
        className="trc-cal__fab"
        aria-label="Prendre un rendez-vous"
        title="Prendre un rendez-vous"
        onClick={() => setCreateInit({ date: anchor })}
      >
        +
      </button>

      {/* LE CALENDRIER NE PORTE AUCUN MONTANT — mais les modales qu'il ouvre en
          portent : la fiche du rendez-vous affiche le prix de chaque prestation,
          et l'encaissement toute la caisse. Un maître vient y lire sa journée et
          remplir ses mains, pas le chiffre de la Maison.

          On lui laisse donc la fiche du rituel EN LECTURE (`sansPrix`), et on lui
          ferme l'encaissement. Masquer le bouton n'aurait pas suffi : la modale
          s'ouvre aussi depuis la fiche. */}
      {createInit && !estMaitre && <RdvModal onClose={() => setCreateInit(null)} initial={createInit} />}
      {editAppt && (
        <RdvModal
          onClose={() => setEditAppt(null)}
          appt={editAppt}
          sansPrix={estMaitre}
          onEncaisser={estMaitre ? undefined : (a) => { setEditAppt(null); setPayAppt(a); }}
        />
      )}
      {payAppt && !estMaitre && <PayAppointmentModal appt={payAppt} onClose={() => setPayAppt(null)} />}
    </div>
  );
}
