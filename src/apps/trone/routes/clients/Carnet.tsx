import { useEffect, useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Input } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { normName } from '../../../../shared/text';
import { appointmentsStore, type Appointment } from '../../../../shared/agenda';
import { useCategories, MAISONS, type Maison } from '../../../../shared/catalog';
import {
  Avatar, PayStatusPill, RdvModal, ReminderBell, SourceBadge, StatusPill, type RdvInitial,
  addDaysISO, apptLabel, apptTotalXof, apptDueXof, apptDepositCreditXof, frDay, timeToMin, todayISO, useBranchAppointments, useBranchClients, useServicesById,
} from './_shared';
import { honorAppointment, PayAppointmentModal } from './actions';

/* Le Carnet — le registre des rendez-vous : multi-services, duplication, statuts. */

const GRID = '96px 90px 1.3fr 1.6fr 0.9fr 232px';

export default function Carnet() {
  const { currency } = useBranch();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const byId = useServicesById();
  const [categories] = useCategories();
  const today = todayISO();

  const [modal, setModal] = useState<{ initial?: RdvInitial; title?: string; appt?: Appointment } | null>(null);
  const [payAppt, setPayAppt] = useState<Appointment | null>(null); // encaissement (partiel / total / pourboire)
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [maison, setMaison] = useState<Maison | ''>('');

  /* Ferme le menu ⋯ à un clic hors menu (le bouton et le menu stoppent la propagation). */
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);

  const clientOf = (id: string) => clients.find((c) => c.id === id);

  const { upcoming, past } = useMemo(() => {
    /* Recherche par nom de cliente — taper les premières lettres suffit
       (insensible aux accents : « agnes » trouve « Agnès ») ; le nom porté par
       le RDV sert de repli pour les têtes de passage sans fiche. */
    const qn = normName(query);
    const nameOf = (a: Appointment) => clients.find((c) => c.id === a.clientId)?.name ?? a.clientName ?? '';
    /* LA MAISON D'UN RENDEZ-VOUS NE SE STOCKE PAS — elle se lit des prestations.
       L'Atelier MND™ et le Studio ACƆ™ partagent une branche, une caisse et un
       plateau : seul le geste les distingue. Une visite mixte (un resserrage
       PUIS des tresses) appartient donc aux deux, et se montre sous les deux
       filtres — la couper en deux fabriquerait un rendez-vous qui n'a pas eu
       lieu. Les prestations du plateau technique, qui n'ont pas de maison, ne
       tranchent rien : elles ne suffisent pas à ranger une visite d'un côté. */
    const maisonDe = (sid: string) => categories.find((c) => c.id === byId.get(sid)?.categoryId)?.maison;
    const estDeLaMaison = (a: Appointment) =>
      maison === '' || a.serviceIds.some((sid) => maisonDe(sid) === maison);
    const match = (a: Appointment) =>
      (qn === '' || normName(nameOf(a)).includes(qn)) && estDeLaMaison(a);
    const upcoming = appts
      .filter((a) => a.date >= today && a.status !== 'honoré' && a.status !== 'annulé' && match(a))
      .sort((a, b) => a.date.localeCompare(b.date) || timeToMin(a.time) - timeToMin(b.time));
    const past = appts
      .filter((a) => !(a.date >= today && a.status !== 'honoré' && a.status !== 'annulé') && match(a))
      .sort((a, b) => b.date.localeCompare(a.date) || timeToMin(b.time) - timeToMin(a.time));
    return { upcoming, past };
  }, [appts, today, query, clients, maison, categories, byId]);

  const setStatus = (id: string, status: Appointment['status']) =>
    appointmentsStore.set((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));

  /* Suppression définitive d'un rendez-vous (depuis le menu ⋯) — confirmation requise. */
  const deleteAppt = (a: Appointment) => {
    if (!window.confirm('Supprimer définitivement ce rendez-vous ? Cette action est irréversible.')) return;
    appointmentsStore.set((prev) => prev.filter((x) => x.id !== a.id));
  };

  const duplicateLast = (clientId: string) => {
    const last = appts
      .filter((a) => a.clientId === clientId && a.status !== 'annulé')
      .sort((a, b) => b.date.localeCompare(a.date) || timeToMin(b.time) - timeToMin(a.time))[0];
    if (!last) return;
    setModal({
      title: 'Dupliquer le dernier rendez-vous.',
      initial: {
        clientId: last.clientId,
        serviceIds: [...last.serviceIds],
        master: last.master,
        time: last.time,
        date: addDaysISO(last.date > today ? last.date : today, 7),
      },
    });
  };

  /* Chiffres seulement — ce qu'attend wa.me. Un numéro vide rend '' et la
     pastille ne s'affiche pas : mieux vaut rien qu'un lien mort. */
  const tel = (s?: string) => String(s ?? '').replace(/\D/g, '');

  const renderRow = (a: Appointment) => {
    const c = clientOf(a.clientId);
    const canConfirm = a.status === 'en attente';
    const canHonor = a.status === 'confirmé';
    const canCancel = a.status === 'confirmé' || a.status === 'en attente';
    const isSeriesIncluded = !!(a.seriesIndex && a.seriesIndex > 1); // séance 2..N : valeur 0, non encaissable seule
    const dueX = apptDueXof(a, byId);
    const partlyPaid = (a.paidXof ?? 0) > 0 || apptDepositCreditXof(a) > 0;
    // Impayé à signaler : solde restant dû sur un RDV déjà réglé en partie, ou passé/du jour.
    const showReste = !isSeriesIncluded && dueX > 0 && (partlyPaid || a.date <= today);
    const canEncaisser = a.status !== 'annulé' && !isSeriesIncluded;
    return (
      <div
        className="trc-sheet__row"
        style={{ gridTemplateColumns: GRID, cursor: 'pointer' }}
        key={a.id}
        onClick={() => setModal({ appt: a })}
        title="Modifier ce rendez-vous"
      >
        <span className="trc-date">{frDay(a.date)}</span>
        <span className="trc-time">{a.time}</span>
        <span className="trc-carnet__client" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {c && <Avatar client={c} size={30} />}
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="trc-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c?.name ?? a.clientName ?? 'Cliente de passage'}
            </span>
            {/* LE TÉLÉPHONE, AU CARNET. C'est ici qu'on cherche à joindre quelqu'un
                — pour prévenir d'un retard, confirmer une venue, relancer un
                impayé — et il n'y figurait pas : il fallait quitter le Carnet,
                ouvrir Clientes, retrouver la fiche. Un clic ouvre WhatsApp ;
                `stopPropagation` empêche d'ouvrir le rendez-vous au passage. */}
            {tel(c?.phone) && (
              <a
                className="trc-wa"
                href={`https://wa.me/${tel(c?.phone)}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`Écrire sur WhatsApp`}
                style={{ alignSelf: 'flex-start' }}
              >
                <span className="trc-wa__num">{c?.phone}</span>
              </a>
            )}
          </span>
        </span>
        <span className="trc-carnet__svc" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{apptLabel(a, byId)}</span>
          {a.serviceIds.length > 1 && <span className="trc-src trc-src--indigo">{a.serviceIds.length} services</span>}
          <SourceBadge source={a.source} />
        </span>
        <span className="trc-carnet__amount" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {a.coveredBySub ? (
            <span
              className="trc-serie-chip"
              style={{ background: 'var(--copper-50)', color: 'var(--copper-700)', borderColor: 'var(--copper-300)' }}
              title="Rituel couvert par l’abonnement — rien à facturer, décompté du quota du cycle"
            >
              ★ Inclus · abonnement
            </span>
          ) : a.seriesIndex && a.seriesIndex > 1 ? (
            <span className="trc-serie-incluse">
              Séance {a.seriesIndex}/{a.seriesTotal ?? a.seriesIndex} · incluse
            </span>
          ) : (
            <>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>
                {fmtMoney(apptTotalXof(a, byId), currency)}
              </span>
              {(a.seriesTotal ?? 0) > 1 && <span className="trc-serie-chip">Séance 1/{a.seriesTotal}</span>}
              {showReste && (
                <span
                  className="trc-serie-chip"
                  style={{ background: 'var(--copper-50)', color: 'var(--copper-700)', borderColor: 'var(--copper-300)' }}
                  title="Solde restant dû — encaissez via le menu ⋯"
                >
                  reste {fmtMoney(dueX, currency)}
                </span>
              )}
            </>
          )}
        </span>
        <span className="trc-carnet__status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
          <PayStatusPill a={a} byId={byId} />
          <StatusPill status={a.status} />
          <ReminderBell appt={a} client={c} byId={byId} />
          <span className="trc-menuwrap" onClick={(e) => e.stopPropagation()}>
            <button
              className="trc-dots"
              aria-label="Actions"
              onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === a.id ? null : a.id); }}
            >
              ⋯
            </button>
            {menuFor === a.id && (
              <div className="trc-menu">
                {canEncaisser && (
                  <button onClick={() => { setPayAppt(a); setMenuFor(null); }}>
                    Encaisser {dueX > 0 ? `· reste ${fmtMoney(dueX, currency)}` : '(pourboire)'}
                  </button>
                )}
                <button onClick={() => { setModal({ appt: a }); setMenuFor(null); }}>Modifier le rendez-vous</button>
                {canConfirm && (
                  <button onClick={() => { setStatus(a.id, 'confirmé'); setMenuFor(null); }}>Confirmer le rendez-vous</button>
                )}
                {canHonor && (
                  <button onClick={() => { honorAppointment(a, byId); setMenuFor(null); }}>Marquer honoré</button>
                )}
                <button onClick={() => { duplicateLast(a.clientId); setMenuFor(null); }}>
                  ⟳ Dupliquer le dernier RDV {c ? `de ${c.name.split(' ')[0]}` : ''}
                </button>
                {canCancel && (
                  <button className="is-danger" onClick={() => { setStatus(a.id, 'annulé'); setMenuFor(null); }}>
                    Annuler le rendez-vous
                  </button>
                )}
                <button className="is-danger" onClick={() => { deleteAppt(a); setMenuFor(null); }}>
                  Supprimer définitivement
                </button>
              </div>
            )}
          </span>
        </span>
      </div>
    );
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Le Carnet · Agenda"
        title="Rendez-vous."
        actions={
          <>
            <Button variant="ghost" onClick={() => setModal({ initial: { date: addDaysISO(today, -1) }, title: 'Rendez-vous passé.' })}>
              + RDV passé
            </Button>
            <Button variant="copper" onClick={() => setModal({})}>+ Nouveau RDV</Button>
          </>
        }
      />

      <div className="trc-toolbar">
        <div className="trc-searchwrap">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un rendez-vous par cliente…"
            aria-label="Rechercher un rendez-vous par cliente"
          />
        </div>
        {/* LA BASCULE DES DEUX MAISONS. Le 3 août 2026, un rendez-vous du
            Studio saisi depuis l'Atelier restait introuvable : il était au bon
            endroit — une seule branche — mais rien ne permettait de le
            retrouver par sa maison. */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} role="group" aria-label="Filtrer par maison">
          {([['', 'Tout'], ...MAISONS.map((m) => [m.k, m.fon] as const)] as ReadonlyArray<readonly [string, string]>).map(
            ([id, label]) => {
              const actif = maison === id;
              return (
                <button
                  key={id || 'tout'}
                  type="button"
                  onClick={() => setMaison(id as Maison | '')}
                  aria-pressed={actif}
                  style={{
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 11.5,
                    letterSpacing: '.04em',
                    padding: '7px 13px',
                    borderRadius: 999,
                    whiteSpace: 'nowrap',
                    border: `1px solid ${actif ? 'var(--copper-600)' : 'var(--line)'}`,
                    background: actif ? 'var(--copper-600)' : 'transparent',
                    color: actif ? '#fff' : 'var(--ink-soft)',
                  }}
                >
                  {label}
                </button>
              );
            },
          )}
        </div>
      </div>

      <div className="trc-sheet trc-carnet">
        <div className="trc-sheet__head" style={{ gridTemplateColumns: GRID }}>
          <span>Date</span>
          <span>Heure</span>
          <span>Cliente</span>
          <span>Services</span>
          <span>Montant</span>
          <span style={{ textAlign: 'right' }}>Statut</span>
        </div>

        <div className="trc-sheet__group">Rendez-vous à venir ({upcoming.length})</div>
        {upcoming.length === 0 && (
          <div className="trc-empty">
            {query.trim() ? `Aucun rendez-vous à venir pour « ${query.trim()} ».` : 'Le carnet est libre — la maison respire.'}
          </div>
        )}
        {upcoming.map(renderRow)}

        <div className="trc-sheet__group">Rendez-vous passés ({past.length})</div>
        {past.length === 0 && (
          <div className="trc-empty">
            {query.trim() ? `Aucun rendez-vous passé pour « ${query.trim()} ».` : 'Aucun rendez-vous passé sur cette branche.'}
          </div>
        )}
        {past.map(renderRow)}
      </div>

      {modal && <RdvModal onClose={() => setModal(null)} initial={modal.initial} appt={modal.appt} title={modal.title} />}
      {payAppt && <PayAppointmentModal appt={payAppt} onClose={() => setPayAppt(null)} />}
    </div>
  );
}
