/* Fichier calendrier (.ics) — le rappel « sur le téléphone » le plus fiable
   sans serveur de push : la cliente ajoute le rituel à son calendrier natif,
   qui la rappelle lui-même (alarme incluse). Compatible iOS / Android / desktop. */

export type IcsEvent = {
  title: string;
  description?: string;
  location?: string;
  dateIso: string; // YYYY-MM-DD
  time: string; // HH:mm
  durationMin: number;
  /** Minutes avant l'événement pour l'alarme (défaut 120). */
  alarmMin?: number;
};

const pad = (n: number) => String(n).padStart(2, '0');

const toIcsStamp = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Construit et télécharge un .ics contenant un ou plusieurs événements. */
export function downloadIcs(events: IcsEvent[], filename = 'rendez-vous-mnd.ics'): void {
  const now = new Date();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Maison MND//Ma Couronne//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  events.forEach((ev, i) => {
    const [h, m] = ev.time.split(':').map(Number);
    const start = new Date(`${ev.dateIso}T00:00:00`);
    start.setHours(h, m || 0, 0, 0);
    const end = new Date(start.getTime() + ev.durationMin * 60000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:mnd-${now.getTime()}-${i}@maison-mnd`,
      `DTSTAMP:${toIcsStamp(now)}`,
      `DTSTART:${toIcsStamp(start)}`,
      `DTEND:${toIcsStamp(end)}`,
      `SUMMARY:${esc(ev.title)}`,
      ...(ev.description ? [`DESCRIPTION:${esc(ev.description)}`] : []),
      ...(ev.location ? [`LOCATION:${esc(ev.location)}`] : []),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(ev.title)}`,
      `TRIGGER:-PT${Math.max(5, ev.alarmMin ?? 120)}M`,
      'END:VALARM',
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------- Notifications locales (app ouverte / installée) ---------- */

/** Demande la permission de notifier (no-op si déjà accordée/refusée). */
export async function askNotifyPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** Notification locale immédiate (si la permission est accordée). */
export function notifyLocal(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: undefined, silent: false });
  } catch {
    /* certains navigateurs mobiles exigent un service worker — silencieux */
  }
}
