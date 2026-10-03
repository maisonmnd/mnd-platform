import { useMemo, useState } from 'react';
import { useBranch } from '../../shared/branches';
import { ecrisRendezVous, useAppointments, type Appointment } from '../../shared/agenda';
import { useClients, useFamilies } from '../../shared/clients';
import { tetesPortees } from '../../shared/accounts';
import { useServices } from '../../shared/catalog';
import { askNotifyPermission, downloadIcs, notifyLocal, type IcsEvent } from '../../shared/ics';
import { enablePush, pushNotify, pushNotifyStaff } from '../../shared/push';
import { useExceptionsHoraires, useSettings } from '../../shared/settings';
import { useBlocages } from '../../shared/blocages';
import {
  DOW_LETTERS,
  MONTHS,
  dayLabelIso,
  dayLabelIsoFr,
  fmtDuration,
  freeSlots,
  useCreneauxOccupes,
  pad2,
  todayIso,
  useClientId,
} from './lib';
import { t, prix } from './i18n';

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
      const miens = new Set([clientId, ...tetes.map((x) => x.id)]);
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
  /* Ses cinq derniers passages, en résumé (29 septembre 2026). */
  const past = mine.filter((a) => !isUpcoming(a)).slice(-5).reverse();

  /* `pourLaMaison` : ce qui part au Trône (push du personnel) reste en
     français ; ce qu'elle lit suit sa langue. */
  const names = (a: Appointment, pourLaMaison = false) => {
    const base = a.serviceIds.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean).join(' + ') ||
      (pourLaMaison ? 'Rituel de la maison' : t('Rituel de la maison'));
    /* Le rituel d'une tête portée se nomme : « — pour Keli ». */
    const tete = a.clientId !== clientId ? tetes.find((x) => x.id === a.clientId) : undefined;
    if (!tete) return base;
    const prenom = tete.name.split(' ')[0];
    return pourLaMaison ? `${base}, pour ${prenom}` : t('{rituel}, pour {prenom}', { rituel: base, prenom });
  };

  const durationOf = (a: Appointment) => {
    const total = a.serviceIds.reduce((n, id) => n + (services.find((s) => s.id === id)?.durationMin ?? 60), 0);
    return total || 60;
  };

  /* ---- Calendrier du téléphone : un événement par séance (série complète) ---- */
  const addToCalendar = (a: Appointment) => {
    const group = a.seriesId ? mine.filter((x) => x.seriesId === a.seriesId && x.status !== 'annulé') : [a];
    const events: IcsEvent[] = group.map((x) => ({
      title: `Maison MND · ${names(x)}`,
      description: x.seriesTotal
        ? t('Séance {i}/{n} · avec {maitre}', { i: x.seriesIndex ?? '', n: x.seriesTotal, maitre: x.master })
        : t('Avec {maitre}', { maitre: x.master }),
      location: branch.name,
      dateIso: x.date,
      time: x.time,
      durationMin: durationOf(x),
      alarmMin: 120,
    }));
    downloadIcs(events, 'rituel-maison-mnd.ics');
    toast(t('Fichier calendrier téléchargé, votre téléphone vous rappellera 2 h avant.'));
  };

  /* ---- Modifier : nouvelle date + heure, comme à la réservation ---- */
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [monthIdx, setMonthIdx] = useState(0);
  const [selIso, setSelIso] = useState<string | null>(null);

  /* QUATRE FENÊTRES, DONC TROIS MOIS PLEINS DEVANT SOI — 6 septembre 2026,
     « ouvrir le calendrier sur 4 mois pour le client ».

     MÊME RÈGLE QU'À LA RÉSERVATION, et ce n'est pas un détail de symétrie :
     une cliente qui peut RÉSERVER à quatre mois mais ne peut REPORTER qu'à
     trois se heurte au mur sur le chemin le plus agaçant des deux, celui où
     elle a déjà un rendez-vous et cherche à s'arranger. */
  const months = useMemo(() => {
    const d0 = new Date();
    return [0, 1, 2, 3].map((k) => {
      const d = new Date(d0.getFullYear(), d0.getMonth() + k, 1);
      return { y: d.getFullYear(), m: d.getMonth(), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
    });
  }, []);
  /* Borné : un index hors liste rendrait `month` indéfini, et l'écran blanc. */
  const month = months[Math.min(Math.max(0, monthIdx), months.length - 1)];

  /* L'agenda sans le rendez-vous déplacé : son propre créneau redevient libre. */
  const others = useMemo(() => (editing ? appts.filter((x) => x.id !== editing.id) : appts), [appts, editing]);

  /* Les murs du calendrier — `freeSlots` les lit dans les registres, l'abonnement
     d'ici re-rend la grille quand ils bougent. */
  const [blocages] = useBlocages();
  const [exceptions] = useExceptionsHoraires();

  /* CE QUE LE SALON A DÉJÀ PRIS, vu du serveur — la RLS ne montre à une
     cliente que ses propres rendez-vous (migration 0079).

     ET SANS CELUI QU'ELLE DÉPLACE : son ancien créneau doit redevenir libre,
     ici comme dans `others`. On le reconnaît à son jour, son heure et son
     maître, les trois seules choses que le serveur consent à dire. */
  const fenetreOccup = useMemo(() => {
    const p0 = months[0];
    const dn = months[months.length - 1];
    return {
      du: `${p0.y}-${pad2(p0.m + 1)}-01`,
      au: `${dn.y}-${pad2(dn.m + 1)}-${pad2(new Date(dn.y, dn.m + 1, 0).getDate())}`,
    };
  }, [months]);
  const occupesTous = useCreneauxOccupes(branch.id, fenetreOccup.du, fenetreOccup.au);
  const occupes = useMemo(() => (editing
    ? occupesTous.filter((c) => !(c.jour === editing.date && c.debut === editing.time && c.maitre === editing.master))
    : occupesTous), [occupesTous, editing]);

  /* Les heures d'ouverture arrivent APRÈS le premier rendu : sans elles dans
     les dépendances, la grille garde sa réponse d'avant. Voir Booking. */
  const [reglages] = useSettings();

  const calCells = useMemo(() => {
    if (!editing) return [];
    const dur = durationOf(editing);
    const first = new Date(month.y, month.m, 1);
    const daysIn = new Date(month.y, month.m + 1, 0).getDate();
    const cells: { key: string; day: number | null; iso?: string; free: boolean }[] = [];
    for (let i = 0; i < first.getDay(); i++) cells.push({ key: `b${i}`, day: null, free: false });
    for (let d = 1; d <= daysIn; d++) {
      const iso = `${month.y}-${pad2(month.m + 1)}-${pad2(d)}`;
      const free = iso >= today && freeSlots(iso, editing.master, dur, others, services, branch.id, occupes).length > 0;
      cells.push({ key: iso, day: d, iso, free });
    }
    return cells;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, month, others, services, branch.id, today, blocages, exceptions, occupes, reglages]);

  const dayTimes =
    editing && selIso ? freeSlots(selIso, editing.master, durationOf(editing), others, services, branch.id, occupes) : [];

  const openEdit = (a: Appointment) => {
    setEditing(a);
    setMonthIdx(0);
    setSelIso(null);
  };

  /* LE DÉPLACEMENT PORTE LE MÊME RISQUE QUE L'ANNULATION — un rituel déplacé
     ici et resté à sa vieille heure au Trône, c'est une cliente qui vient
     quand personne ne l'attend. Même chemin, même vérification, même aveu. */
  const reschedule = async (heure: string) => {
    if (!editing || !selIso) return;
    const a = editing;
    const iso = selIso;
    setEditing(null);
    setSelIso(null);
    /* Le libellé du Trône reste en français ; le sien suit sa langue. */
    const label = `${names(a, true)} · ${dayLabelIsoFr(iso)} à ${heure}`;
    const transmis = await ecrisRendezVous(a.id, { date: iso, time: heure, status: 'en attente' });
    if (!transmis) {
      toast(t('Déplacement non transmis, prévenez la maison.'));
      setNonTransmis({ a: { ...a, date: iso, time: heure }, geste: 'déplacement' });
      return;
    }
    void pushNotifyStaff(
      'Rendez-vous déplacé · Ma Couronne',
      `${a.clientName ?? 'Une cliente'} · ${label}, à confirmer`,
      '/trone/#/calendrier',
    );
    const body = t('{rituel} · {jour} à {heure}, en attente de confirmation de la maison.', { rituel: names(a), jour: dayLabelIso(iso), heure });
    const titre = t('Rendez-vous modifié');
    void enablePush(clientId).then((subbed) => {
      if (subbed) void pushNotify(clientId, titre, body, `${import.meta.env.BASE_URL}#/suivi`);
      else void askNotifyPermission().then((ok) => { if (ok) notifyLocal(titre, body); });
    });
    toast(t('Rendez-vous déplacé, la maison confirmera.'));
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
    const body = t('{rituel} du {jour} à {heure}, annulé.', { rituel: names(a), jour: dayLabelIso(a.date), heure: a.time });
    const titre = t('Rendez-vous annulé');
    if (transmis) {
      setNonTransmis(null);
      void pushNotifyStaff(
        'Rendez-vous annulé · Ma Couronne',
        `${a.clientName ?? 'Une cliente'} · ${names(a, true)} · ${dayLabelIsoFr(a.date)} à ${a.time}`,
        '/trone/#/calendrier',
      );
      void enablePush(clientId).then((subbed) => {
        if (subbed) void pushNotify(clientId, titre, body, `${import.meta.env.BASE_URL}#/suivi`);
        else void askNotifyPermission().then((ok) => { if (ok) notifyLocal(titre, body); });
      });
      toast(t('Rendez-vous annulé, la maison est prévenue.'));
      return;
    }
    /* DIRE VRAI : sur ce téléphone il est annulé, au salon il ne l'est pas.
       Tant qu'elle n'a pas appelé, le créneau lui reste réservé. */
    setNonTransmis({ a, geste: 'annulation' });
    toast(t('Annulation non transmise, prévenez la maison.'));
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
                ← {t('Mes rendez-vous')}
              </button>
              <h1 className="mc-flowhead__h1" style={{ marginTop: 8 }}>{t('Déplacer le rituel.')}</h1>
            </>
          ) : (
            <>
              <div className="mc-micro-eyebrow">{t('Votre agenda · la maison suit')}</div>
              <h1 className="mc-flowhead__h1" style={{ marginTop: 4 }}>{t('Mes rendez-vous.')}</h1>
            </>
          )}
        </div>
        <button className="mc-x" aria-label={t('Fermer')} onClick={onClose}>✕</button>
      </div>

      <div className="mc-scroll mc-flowbody">
        {/* L'ANNULATION QUI N'EST PAS PARTIE — elle reste à l'écran tant que le
            geste n'a pas abouti. Un toast s'efface en deux secondes ; un
            créneau qu'on croit rendu, non. */}
        {nonTransmis && (
          <div className="mc-nontransmis">
            <b>{nonTransmis.geste === 'annulation'
              ? t('Votre annulation n’est pas arrivée à la maison.')
              : t('Votre déplacement n’est pas arrivé à la maison.')}</b>
            <span>
              {nonTransmis.geste === 'annulation'
                ? t('{rituel}, annulé sur ce téléphone, mais la Maison garde encore votre créneau du {jour} à {heure}.', { rituel: names(nonTransmis.a), jour: dayLabelIso(nonTransmis.a.date), heure: nonTransmis.a.time })
                : t('{rituel}, déplacé sur ce téléphone au {jour} à {heure}, mais la Maison vous attend encore à l’ancienne heure.', { rituel: names(nonTransmis.a), jour: dayLabelIso(nonTransmis.a.date), heure: nonTransmis.a.time })}
              {' '}
              {branch.phone
                ? t('Appelez la maison au {tel}, ou réessayez dans un instant.', { tel: branch.phone })
                : t('Appelez la maison, ou réessayez dans un instant.')}
            </span>
            <button
              className="mc-textbtn"
              onClick={() => {
                const { a, geste } = nonTransmis;
                if (geste === 'annulation') void annuler(a);
                else void ecrisRendezVous(a.id, { date: a.date, time: a.time, status: 'en attente' })
                  .then((ok) => {
                    if (!ok) { toast(t('Toujours pas transmis, appelez la maison.')); return; }
                    setNonTransmis(null);
                    toast(t('Déplacement transmis, la maison confirmera.'));
                  });
              }}
            >
              {t('Réessayer')} →
            </button>
          </div>
        )}
        {editing ? (
          /* -------- déplacement : calendrier + heures libres -------- */
          <div className="mc-fade">
            <div className="mc-prefillnote">
              {t('{rituel} · actuellement {jour} à {heure} · avec {maitre}', { rituel: names(editing), jour: dayLabelIso(editing.date), heure: editing.time, maitre: editing.master })}
              {editing.seriesTotal ? <>{' · '}{t('séance {i}/{n}', { i: editing.seriesIndex ?? '', n: editing.seriesTotal })}</> : null}
            </div>
            <div className="mc-calnav">
              <button onClick={() => setMonthIdx(Math.max(0, monthIdx - 1))} disabled={monthIdx === 0}>‹</button>
              {/* Le mois se dit à l'affichage, dans sa langue (MONTHS suit la langue). */}
              <span>{`${MONTHS[month.m]} ${month.y}`}</span>
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
                      if (!c.free) { toast(t('Aucune disponibilité ce jour.')); return; }
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
              <span />{t('Jours avec créneaux libres')} · {fmtDuration(durationOf(editing))} · {t('maître {maitre}', { maitre: editing.master })}
            </div>

            {selIso && (
              <div className="mc-fade" style={{ marginTop: 20 }}>
                <div className="mc-micro-eyebrow" style={{ marginBottom: 10 }}>{dayLabelIso(selIso)} · {t('heures libres')}</div>
                <div className="mc-stack">
                  {dayTimes.map((heure) => (
                    <button key={heure} className="mc-slotcard" onClick={() => reschedule(heure)}>
                      <div>
                        <div className="mc-slotcard__time">{heure}</div>
                        <div className="mc-slotcard__who">{t('avec {maitre}', { maitre: editing.master })} · {fmtDuration(durationOf(editing))}</div>
                      </div>
                      <span className="mc-slotcard__free">{t('Choisir')}</span>
                    </button>
                  ))}
                  {dayTimes.length === 0 && (
                    <div className="mc-emptyline">{t('Plus de créneau ce jour, choisissez un autre jour.')}</div>
                  )}
                </div>
              </div>
            )}
            <div className="mc-footnote" style={{ textAlign: 'left', marginTop: 16 }}>
              {t('Le déplacement repasse le rendez-vous en attente, la maison le re-confirme.')}
            </div>
          </div>
        ) : (
          /* -------- liste : à venir puis passés récents -------- */
          <div className="mc-fade">
            <div className="mc-sectionlabel" style={{ margin: '0 0 10px' }}>{t('À venir')}</div>
            {upcoming.length === 0 && (
              <div className="mc-emptyzone">
                <div className="mc-emptyzone__glyph">♛</div>
                <div className="mc-emptyzone__t">{t('Aucun rituel à venir.')}</div>
                <div className="mc-emptyzone__s">
                  {t('Votre couronne mérite sa prochaine séance, la maison vous attend.')}
                </div>
                <button className="mc-cta mc-cta--copper" style={{ marginTop: 22 }} onClick={onBook}>
                  {t('Réserver un rituel')}
                </button>
              </div>
            )}
            <div className="mc-stack" style={{ gap: 10 }}>
              {upcoming.map((a) => (
                <div key={a.id} className="mc-rdvcard">
                  <div className="mc-rdvcard__top">
                    <span className="mc-rdvcard__when">{dayLabelIso(a.date)} · {a.time}</span>
                    <span className={`mc-stchip ${STATUS_META[a.status].cls}`}>{t(STATUS_META[a.status].label)}</span>
                  </div>
                  <div className="mc-rdvcard__svc">{names(a)}</div>
                  <div className="mc-rdvcard__meta">{t('avec {maitre}', { maitre: a.master })} · {fmtDuration(durationOf(a))} · {branch.name}</div>
                  {(a.seriesTotal || a.depositXof != null) && (
                    <div className="mc-rdvcard__chips">
                      {a.seriesTotal && <span className="mc-pillseal">{t('Séance {i}/{n}', { i: a.seriesIndex ?? '', n: a.seriesTotal })}</span>}
                      {a.depositXof != null && (
                        <span className="mc-pillseal">{a.depositConfirmed ? t('Acompte reçu') : t('Acompte')} · {prix(a.depositXof, currency)}</span>
                      )}
                    </div>
                  )}
                  <div className="mc-rdvcard__acts">
                    <button className="mc-rdvact" onClick={() => openEdit(a)}>{t('Modifier')}</button>
                    <button className="mc-rdvact" onClick={() => addToCalendar(a)}>{t('Calendrier')}</button>
                    <button className="mc-rdvact mc-rdvact--danger" onClick={() => setCancelling(a)}>{t('Annuler')}</button>
                  </div>
                </div>
              ))}
            </div>

            {past.length > 0 && (
              <>
                <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>{t('Passés récents')}</div>
                <div className="mc-stack" style={{ gap: 10 }}>
                  {past.map((a) => (
                    <div key={a.id} className="mc-rdvcard mc-rdvcard--past">
                      <div className="mc-rdvcard__top">
                        <span className="mc-rdvcard__when">{dayLabelIso(a.date)} · {a.time}</span>
                        <span className={`mc-stchip ${STATUS_META[a.status].cls}`}>{t(STATUS_META[a.status].label)}</span>
                      </div>
                      <div className="mc-rdvcard__svc">{names(a)}</div>
                      <div className="mc-rdvcard__meta">{t('avec {maitre}', { maitre: a.master })}</div>
                      {a.seriesTotal && (
                        <div className="mc-rdvcard__chips">
                          <span className="mc-pillseal">{t('Séance {i}/{n}', { i: a.seriesIndex ?? '', n: a.seriesTotal })}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {upcoming.length > 0 && (
              <div className="mc-footnote" style={{ textAlign: 'left', marginTop: 18 }}>
                {t('Les rappels passent par votre calendrier (bouton « Calendrier ») et par l’app ouverte, la maison ne peut pas encore vous notifier à distance.')}
              </div>
            )}
          </div>
        )}

        {/* -------- feuille de confirmation d'annulation -------- */}
        {cancelling && (
          <div className="mc-paysheet mc-fade">
            <div className="mc-paysheet__card mc-rise" style={{ textAlign: 'left' }}>
              <div className="mc-micro-eyebrow">{t('Annulation')}</div>
              <div className="mc-cancel__t">{t('Annuler ce rendez-vous ?')}</div>
              <div className="mc-cancel__s">
                {t('{rituel} · {jour} à {heure} · avec {maitre}.', { rituel: names(cancelling), jour: dayLabelIso(cancelling.date), heure: cancelling.time, maitre: cancelling.master })}
              </div>
              {cancelling.depositXof != null && (
                <div className="mc-cancel__warn">
                  {t('L’acompte de {montant} reste acquis à la maison.', { montant: prix(cancelling.depositXof, currency) })}
                </div>
              )}
              <div className="mc-cancel__acts">
                <button className="mc-cta mc-cta--danger" onClick={confirmCancel}>{t('Annuler le rendez-vous')}</button>
                <button className="mc-cta mc-cta--quiet" onClick={() => setCancelling(null)}>{t('Garder le rendez-vous')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
