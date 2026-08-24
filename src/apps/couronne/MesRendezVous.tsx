import { useMemo, useState } from 'react';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import { ecrisRendezVous, useAppointments, type Appointment } from '../../shared/agenda';
import { useClients, useFamilies } from '../../shared/clients';
import { tetesPortees } from '../../shared/accounts';
import { useServices } from '../../shared/catalog';
import { askNotifyPermission, downloadIcs, notifyLocal, type IcsEvent } from '../../shared/ics';
import { enablePush, pushNotify, pushNotifyStaff } from '../../shared/push';
import { useExceptionsHoraires } from '../../shared/settings';
import { useBlocages } from '../../shared/blocages';
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
  /* LE FOYER ENTIER (TEMPS 2) : les rendez-vous des têtes qu'elle porte se
     lisent ici aussi — réserver pour Keli puis ne plus la voir serait pire
     que ne rien ouvrir. La RLS (0036) ne montre que les mineurs de SA famille. */
  const [tousClients] = useClients();
  const [familles] = useFamilies();
  const moi = tousClients.find((c) => c.id === clientId);
  const tetes = useMemo(
    () => (moi ? tetesPortees(moi, tousClients, familles, todayIso()) : []),
    [moi, tousClients, familles],
  );

  const mine = useMemo(
    () => {
      const miens = new Set([clientId, ...tetes.map((t) => t.id)]);
      return appts
        .filter((a) => miens.has(a.clientId))
        .slice()
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    },
    [appts, clientId, tetes]
  );

  const now = new Date();
  const nowTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const today = todayIso();
  const isUpcoming = (a: Appointment) =>
    (a.status === 'confirmé' || a.status === 'en attente') &&
    (a.date > today || (a.date === today && a.time >= nowTime));

  const upcoming = mine.filter(isUpcoming);
  const past = mine.filter((a) => !isUpcoming(a)).slice(-6).reverse();

  const names = (a: Appointment) => {
    const base = a.serviceIds.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean).join(' + ') ||
      'Rituel de la maison';
    /* Le rituel d'une tête portée se nomme : « — pour Keli ». */
    const tete = a.clientId !== clientId ? tetes.find((t) => t.id === a.clientId) : undefined;
    return tete ? `${base}, pour ${tete.name.split(' ')[0]}` : base;
  };

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
    toast('Fichier calendrier téléchargé, votre téléphone vous rappellera 2 h avant.');
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

  /* Les murs du calendrier — `freeSlots` les lit dans les registres, l'abonnement
     d'ici re-rend la grille quand ils bougent. */
  const [blocages] = useBlocages();
  const [exceptions] = useExceptionsHoraires();

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
  }, [editing, month, others, services, branch.id, today, blocages, exceptions]);

  const dayTimes =
    editing && selIso ? freeSlots(selIso, editing.master, durationOf(editing), others, services, branch.id) : [];

  const openEdit = (a: Appointment) => {
    setEditing(a);
    setMonthIdx(0);
    setSelIso(null);
  };

  /* LE DÉPLACEMENT PORTE LE MÊME RISQUE QUE L'ANNULATION — un rituel déplacé
     ici et resté à sa vieille heure au Trône, c'est une cliente qui vient
     quand personne ne l'attend. Même chemin, même vérification, même aveu. */
  const reschedule = async (t: string) => {
    if (!editing || !selIso) return;
    const a = editing;
    const iso = selIso;
    setEditing(null);
    setSelIso(null);
    const label = `${names(a)} · ${dayLabelIso(iso)} à ${t}`;
    const transmis = await ecrisRendezVous(a.id, { date: iso, time: t, status: 'en attente' });
    if (!transmis) {
      toast('Déplacement non transmis, prévenez la maison.');
      setNonTransmis({ a: { ...a, date: iso, time: t }, geste: 'déplacement' });
      return;
    }
    void pushNotifyStaff(
      'Rendez-vous déplacé · Ma Couronne',
      `${a.clientName ?? 'Une cliente'} · ${label}, à confirmer`,
      '/trone/#/calendrier',
    );
    const body = `${label}, en attente de confirmation de la maison.`;
    void enablePush(clientId).then((subbed) => {
      if (subbed) void pushNotify(clientId, 'Rendez-vous modifié', body, `${import.meta.env.BASE_URL}#/suivi`);
      else void askNotifyPermission().then((ok) => { if (ok) notifyLocal('Rendez-vous modifié', body); });
    });
    toast('Rendez-vous déplacé, la maison confirmera.');
  };

  /* ---- Annuler : confirmation explicite, l'acompte reste acquis ---- */
  const [cancelling, setCancelling] = useState<Appointment | null>(null);

  /* L'ANNULATION QUI N'ARRIVAIT PAS (16 août) — le rituel du 19 août, annulé
     ici, n'est jamais revenu annulé au Trône : l'écriture partait, le serveur
     l'écartait sans un mot, et l'écran félicitait. Trois défauts réparés :
     ① on DEMANDE au serveur ce qu'il a fait (`ecrisRendezVous`) ; ② si rien
     n'est passé, on le DIT — une bande cuivre, pas un toast vert qui s'efface ;
     ③ LA MAISON EST PRÉVENUE : le seul push partait à la cliente elle-même,
     personne au salon n'apprenait qu'un créneau se libérait. */
  /* CE QUI N'EST PAS PARTI — le rendez-vous tel qu'elle le veut, et le geste
     qu'elle a fait. Les deux sont nécessaires pour le redire et le refaire. */
  const [nonTransmis, setNonTransmis] = useState<{ a: Appointment; geste: 'annulation' | 'déplacement' } | null>(null);

  const annuler = async (a: Appointment) => {
    const transmis = await ecrisRendezVous(a.id, { status: 'annulé' });
    const body = `${names(a)} du ${dayLabelIso(a.date)} à ${a.time}, annulé.`;
    if (transmis) {
      setNonTransmis(null);
      void pushNotifyStaff(
        'Rendez-vous annulé · Ma Couronne',
        `${a.clientName ?? 'Une cliente'} · ${names(a)} · ${dayLabelIso(a.date)} à ${a.time}`,
        '/trone/#/calendrier',
      );
      void enablePush(clientId).then((subbed) => {
        if (subbed) void pushNotify(clientId, 'Rendez-vous annulé', body, `${import.meta.env.BASE_URL}#/suivi`);
        else void askNotifyPermission().then((ok) => { if (ok) notifyLocal('Rendez-vous annulé', body); });
      });
      toast('Rendez-vous annulé, la maison est prévenue.');
      return;
    }
    /* DIRE VRAI : sur ce téléphone il est annulé, au salon il ne l'est pas.
       Tant qu'elle n'a pas appelé, le créneau lui reste réservé. */
    setNonTransmis({ a, geste: 'annulation' });
    toast('Annulation non transmise, prévenez la maison.');
  };

  const confirmCancel = () => {
    if (!cancelling) return;
    const a = cancelling;
    setCancelling(null);
    void annuler(a);
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
        {/* L'ANNULATION QUI N'EST PAS PARTIE — elle reste à l'écran tant que le
            geste n'a pas abouti. Un toast s'efface en deux secondes ; un
            créneau qu'on croit rendu, non. */}
        {nonTransmis && (
          <div className="mc-nontransmis">
            <b>Votre {nonTransmis.geste} n’est pas arrivée à la maison.</b>
            <span>
              {names(nonTransmis.a)} — {nonTransmis.geste === 'annulation'
                ? `annulé sur ce téléphone, mais le salon garde encore votre créneau du ${dayLabelIso(nonTransmis.a.date)} à ${nonTransmis.a.time}`
                : `déplacé sur ce téléphone au ${dayLabelIso(nonTransmis.a.date)} à ${nonTransmis.a.time}, mais le salon vous attend encore à l’ancienne heure`}.
              Appelez la maison{branch.phone ? ` au ${branch.phone}` : ''}, ou réessayez dans un instant.
            </span>
            <button
              className="mc-textbtn"
              onClick={() => {
                const { a, geste } = nonTransmis;
                if (geste === 'annulation') void annuler(a);
                else void ecrisRendezVous(a.id, { date: a.date, time: a.time, status: 'en attente' })
                  .then((ok) => {
                    if (!ok) { toast('Toujours pas transmis, appelez la maison.'); return; }
                    setNonTransmis(null);
                    toast('Déplacement transmis, la maison confirmera.');
                  });
              }}
            >
              Réessayer →
            </button>
          </div>
        )}
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
                    <div className="mc-emptyline">Plus de créneau ce jour, choisissez un autre jour.</div>
                  )}
                </div>
              </div>
            )}
            <div className="mc-footnote" style={{ textAlign: 'left', marginTop: 16 }}>
              Le déplacement repasse le rendez-vous en attente, la maison le re-confirme.
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
                  Votre couronne mérite sa prochaine séance, la maison vous attend.
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
                Les rappels passent par votre calendrier (bouton « Calendrier ») et par l’app ouverte,
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
