import { useEffect, useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { clientsStore, crownStylesStore, useCrownStyles, usePersonas, type Client } from '../../../../shared/clients';
import type { Appointment } from '../../../../shared/agenda';
import { useInvoices, invoiceTotal, type Invoice } from '../../../../shared/finance';
import { usePointsHistory } from '../../../../shared/offers';
import { useClientSessions, isOnline } from '../../../../shared/activity';
import { uid } from '../../../../shared/store';
import { PayAppointmentModal } from './actions';
import {
  Avatar, Drawer, RdvModal, StatusPill, addDaysISO, apptDueXof, apptLabel, apptNetXof, frLong, frShort, frDay,
  fromISO, relDays, timeToMin, todayISO, useBranchAppointments, useBranchClients, useServicesById,
} from './_shared';
import './clients.css';

/* Customers — le CRM 360 : recherche, tri, indicateurs, segments, persona attribué,
   prochain RDV prédit, fiche complète (finances, présence Ma Couronne, commandes,
   rendez-vous à venir, fidélité, historique) et ajout d'une cliente. */

const GRID = '2.1fr 1fr 0.95fr 0.95fr 0.55fr 132px';
const SEGMENT_PRESETS = ['VIP', 'Abonnée', 'Nouvelle', 'Diaspora', 'Famille', 'Cercle', 'Régulier', 'Dormante'];

type SortKey = 'nom' | 'visite' | 'depense' | 'points';

/** Chiffres seulement — pour wa.me et la recherche téléphone. */
const digitsOf = (s: string) => s.replace(/\D/g, '');
/** Href téléphone — garde le + international. */
const telHref = (s: string) => `tel:${s.replace(/[^+\d]/g, '')}`;

/** Durée éditoriale : « 45 min », « 3 h 20 min ». */
const fmtDur = (sec: number): string => {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h} h ${r} min` : `${h} h`;
};

/** Âge éditorial de la couronne : « 24 j », « 8 mois », « 2 ans 3 mois ». */
const crownAge = (iso: string): string => {
  const days = Math.max(0, Math.round((Date.now() - fromISO(iso).getTime()) / 86400000));
  if (days < 30) return `${days} j`;
  if (days < 365) return `${Math.max(1, Math.round(days / 30))} mois`;
  const years = Math.floor(days / 365);
  const months = Math.round((days % 365) / 30);
  const y = `${years} an${years > 1 ? 's' : ''}`;
  return months > 0 ? `${y} ${months} mois` : y;
};

/** Anniversaire — date longue « 12 mars 1990 ». */
const frBirthday = (iso: string) =>
  fromISO(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Âge révolu + jours avant le prochain anniversaire (fenêtre discrète des 14 j). */
function bdayInfo(iso: string): { age: number; daysUntil: number; soon: boolean } {
  const b = fromISO(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const hadThisYear =
    today.getMonth() > b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() >= b.getDate());
  const age = today.getFullYear() - b.getFullYear() - (hadThisYear ? 0 : 1);
  const next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
  if (next.getTime() < today.getTime()) next.setFullYear(today.getFullYear() + 1);
  const daysUntil = Math.round((next.getTime() - today.getTime()) / 86400000);
  return { age, daysUntil, soon: daysUntil >= 0 && daysUntil <= 14 };
}

/* ---------- Note de la maison : texte libre + blocs de consultation ---------- */
type ConsultQA = { q: string; a: string };
type ConsultBlock = { name: string; date: string; qa: ConsultQA[] };
const CONSULT_HEADER = /^── Consultation · (.+) ──$/;

/** Sépare la note en (texte libre) + (blocs consultation) + (texte brut des blocs, pour ré-enregistrer). */
function splitNotes(raw: string | undefined): { free: string; consultRaw: string; blocks: ConsultBlock[] } {
  const lines = (raw ?? '').split('\n');
  let firstIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (CONSULT_HEADER.test(lines[i])) { firstIdx = i; break; }
  }
  const free = (firstIdx === -1 ? lines : lines.slice(0, firstIdx)).join('\n').trim();
  const consultRaw = firstIdx === -1 ? '' : lines.slice(firstIdx).join('\n').trim();
  const blocks: ConsultBlock[] = [];
  let cur: { name: string; date: string; qa: ConsultQA[]; a: ConsultQA | null } | null = null;
  const closeQA = () => { if (cur && cur.a) { cur.qa.push(cur.a); cur.a = null; } };
  const flush = () => { if (cur) { closeQA(); blocks.push({ name: cur.name, date: cur.date, qa: cur.qa }); cur = null; } };
  for (const line of consultRaw ? consultRaw.split('\n') : []) {
    const h = line.match(CONSULT_HEADER);
    if (h) {
      flush();
      const inner = h[1];
      const idx = inner.lastIndexOf(' · ');
      cur = { name: idx >= 0 ? inner.slice(0, idx) : inner, date: idx >= 0 ? inner.slice(idx + 3) : '', qa: [], a: null };
      continue;
    }
    if (!cur) continue;
    const qm = line.match(/^\d+\.\s?(.*)$/);
    if (qm) { closeQA(); cur.a = { q: qm[1].trim(), a: '' }; continue; }
    const am = line.match(/^\s*→\s?(.*)$/);
    if (am && cur.a) { cur.a.a = cur.a.a ? `${cur.a.a}\n${am[1]}` : am[1]; continue; }
    const t = line.trim();
    if (t && cur.a) cur.a.a = cur.a.a ? `${cur.a.a}\n${t}` : t;
  }
  flush();
  return { free, consultRaw, blocks };
}

/** Rendu des consultations en cartes distinctes (en-tête cuivre serif + Q/R). */
function ConsultCards({ blocks }: { blocks: ConsultBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <div className="trc-consults">
      {blocks.map((b, i) => (
        <div className="trc-consult-card" key={i}>
          <div className="trc-consult-card__head">
            <span className="trc-consult-card__name">{b.name}</span>
            {b.date && <span className="trc-consult-card__date">{b.date}</span>}
          </div>
          <div className="trc-consult-card__body">
            {b.qa.map((qa, j) => (
              <div className="trc-consult-qa" key={j}>
                <div className="trc-consult-qa__q">{qa.q}</div>
                <div className="trc-consult-qa__a">{qa.a || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Champ « Style de couronne » — liste éditable (crownStylesStore) + ajout inline. */
function CrownStyleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [styles] = useCrownStyles();
  const addStyle = () => {
    const name = window.prompt('Nom du nouveau style de couronne :')?.trim();
    if (!name) return;
    crownStylesStore.set((prev) =>
      prev.some((s) => s.toLowerCase() === name.toLowerCase()) ? prev : [...prev, name],
    );
    onChange(name);
  };
  return (
    <div className="mnd-field">
      <span className="mnd-field__label">Style de couronne</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
        <Select value={value} onChange={(e) => onChange(e.target.value)} style={{ flex: 1, minWidth: 0 }}>
          <option value="">—</option>
          {styles.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <button
          type="button"
          className="trc-crown-add"
          onClick={addStyle}
          aria-label="Ajouter un style"
          title="Ajouter un style de couronne"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function Customers() {
  const { currency } = useBranch();
  const clients = useBranchClients();
  const appts = useBranchAppointments();
  const [invoices] = useInvoices();
  const [sessions] = useClientSessions();
  const byId = useServicesById();
  const [personas] = usePersonas();
  const today = todayISO();

  const [seg, setSeg] = useState('Tous');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('nom');
  const [selId, setSelId] = useState<string | null>(null);
  const [rdvFor, setRdvFor] = useState<Client | null>(null);
  const [intake, setIntake] = useState(false);

  /* Recherche vivante — légèrement différée pour rester fluide sur les grandes maisons. */
  useEffect(() => {
    const t = window.setTimeout(() => setQ(query.trim().toLowerCase()), 180);
    return () => window.clearTimeout(t);
  }, [query]);

  /* La présence Ma Couronne se rafraîchit toute seule (battement de 30 s). */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  const personaName = (id: string) => personas.find((p) => p.id === id)?.name ?? 'À classer';

  const apptsOf = (id: string) => appts.filter((a) => a.clientId === id);

  const predictNext = (id: string): { iso: string | null; predicted: boolean } => {
    const mine = apptsOf(id);
    const upcoming = mine
      .filter((a) => a.date >= today && a.status !== 'annulé' && a.status !== 'honoré')
      .sort((a, b) => a.date.localeCompare(b.date) || timeToMin(a.time) - timeToMin(b.time))[0];
    if (upcoming) return { iso: upcoming.date, predicted: false };
    const honored = mine.filter((a) => a.status === 'honoré').sort((a, b) => a.date.localeCompare(b.date));
    if (honored.length >= 2) {
      let gaps = 0;
      for (let i = 1; i < honored.length; i++) {
        gaps += Math.round((new Date(honored[i].date).getTime() - new Date(honored[i - 1].date).getTime()) / 86400000);
      }
      const avg = Math.max(14, Math.round(gaps / (honored.length - 1)));
      return { iso: addDaysISO(honored[honored.length - 1].date, avg), predicted: true };
    }
    if (honored.length === 1) return { iso: addDaysISO(honored[0].date, 30), predicted: true };
    return { iso: null, predicted: false };
  };

  /* Chiffres de la maison par cliente : dépense à vie (rituels honorés au net
     + factures payées hors règlements de RDV, pour ne rien compter deux fois)
     et dernière visite. */
  const stats = useMemo(() => {
    const linked = new Set<string>();
    for (const a of appts) if (a.invoiceId) linked.add(a.invoiceId);
    const m = new Map<string, { spend: number; lastISO: string | null }>();
    for (const c of clients) m.set(c.id, { spend: 0, lastISO: null });
    for (const a of appts) {
      const s = m.get(a.clientId);
      if (!s || a.status !== 'honoré') continue;
      s.spend += apptNetXof(a, byId);
      if (!s.lastISO || a.date > s.lastISO) s.lastISO = a.date;
    }
    for (const inv of invoices) {
      const s = m.get(inv.clientId);
      if (!s) continue;
      if (inv.kind === 'facture' && inv.status === 'payée' && !linked.has(inv.id)
        && !inv.lines.some((l) => l.label.startsWith('Règlement ·'))) {
        s.spend += invoiceTotal(inv);
      }
    }
    return m;
  }, [clients, appts, invoices, byId]);

  /* Qui est sur Ma Couronne en ce moment. */
  const onlineIds = useMemo(() => {
    void tick;
    const set = new Set<string>();
    for (const s of sessions) if (isOnline(s)) set.add(s.clientId);
    return set;
  }, [sessions, tick]);

  /* Indicateurs de tête de page. */
  const monthKey = today.slice(0, 7);
  const newThisMonth = clients.filter((c) => (c.since ?? '').slice(0, 7) === monthKey).length;
  const bdaySoonCount = clients.filter((c) => c.birthday && bdayInfo(c.birthday).daysUntil <= 30).length;
  const onlineCount = clients.filter((c) => onlineIds.has(c.id)).length;

  const segments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of clients) for (const s of c.segments) counts.set(s, (counts.get(s) ?? 0) + 1);
    return [{ label: 'Tous', count: clients.length }, ...[...counts].map(([label, count]) => ({ label, count }))];
  }, [clients]);

  const filtered = useMemo(() => {
    let list = seg === 'Tous' ? clients : clients.filter((c) => c.segments.includes(seg));
    if (q) {
      const qd = digitsOf(q);
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) || (qd !== '' && digitsOf(c.phone).includes(qd)),
      );
    }
    const st = (id: string) => stats.get(id);
    const arr = [...list];
    if (sort === 'nom') arr.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    else if (sort === 'visite') arr.sort((a, b) => (st(b.id)?.lastISO ?? '').localeCompare(st(a.id)?.lastISO ?? ''));
    else if (sort === 'depense') arr.sort((a, b) => (st(b.id)?.spend ?? 0) - (st(a.id)?.spend ?? 0));
    else if (sort === 'points') arr.sort((a, b) => (b.loyaltyPoints ?? 0) - (a.loyaltyPoints ?? 0));
    return arr;
  }, [clients, seg, q, sort, stats]);

  const selected = clients.find((c) => c.id === selId) ?? null;

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="CRM · Le Suivi"
        title="Têtes couronnées."
        actions={<Button variant="indigo" onClick={() => setIntake(true)}>+ Nouvelle cliente</Button>}
      />

      {/* Indicateurs de la maison */}
      <div className="trc-kpis">
        <div className="trc-kpi"><b>{clients.length}</b><span>Têtes couronnées</span></div>
        <div className="trc-kpi"><b>{newThisMonth}</b><span>Nouvelles ce mois</span></div>
        <div className="trc-kpi"><b>{bdaySoonCount}</b><span>Anniversaires sous 30 j</span></div>
        <div className={`trc-kpi ${onlineCount > 0 ? 'trc-kpi--live' : ''}`}>
          <b>{onlineCount}</b><span>En ligne · Ma Couronne</span>
        </div>
      </div>

      {/* Recherche & tri */}
      <div className="trc-toolbar">
        <div className="trc-searchwrap">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une cliente (nom, téléphone)…"
            aria-label="Rechercher une cliente"
          />
        </div>
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ width: 200, flex: 'none' }} aria-label="Trier les clientes">
          <option value="nom">Tri · Nom</option>
          <option value="visite">Tri · Dernière visite</option>
          <option value="depense">Tri · Dépensé</option>
          <option value="points">Tri · Points</option>
        </Select>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        {segments.map((s) => (
          <button key={s.label} className={`trc-chip ${seg === s.label ? 'is-active' : ''}`} onClick={() => setSeg(s.label)}>
            {s.label} <span className="count">{s.count}</span>
          </button>
        ))}
      </div>

      <div className="trc-sheet trc-crm-sheet">
        <div className="trc-sheet__head" style={{ gridTemplateColumns: GRID }}>
          <span>Cliente</span>
          <span>Prochain RDV</span>
          <span>Dernière visite</span>
          <span>Dépensé</span>
          <span>Points</span>
          <span />
        </div>
        {filtered.length === 0 && (
          <div className="trc-empty">
            {clients.length === 0
              ? 'Aucune tête couronnée — ajoutez la première.'
              : q
                ? `Aucune cliente ne répond à « ${query.trim()} ».`
                : 'Aucune tête couronnée sur ce segment.'}
          </div>
        )}
        {filtered.map((c) => {
          const next = predictNext(c.id);
          const st = stats.get(c.id);
          const online = onlineIds.has(c.id);
          const bd = c.birthday ? bdayInfo(c.birthday) : null;
          const phoneDigits = digitsOf(c.phone);
          return (
            <div className="trc-sheet__row" style={{ gridTemplateColumns: GRID, cursor: 'pointer' }} key={c.id} onClick={() => setSelId(c.id)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span className="trc-avatarwrap">
                  <Avatar client={c} size={36} />
                  {online && <span className="trc-dot-online" title="En ligne sur Ma Couronne" />}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span className="trc-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    {bd && bd.daysUntil <= 30 && (
                      <span className="trc-bday-chip">{bd.daysUntil === 0 ? 'Anniv. aujourd’hui' : `Anniv. J−${bd.daysUntil}`}</span>
                    )}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, minWidth: 0 }}>
                    <span style={{ flex: 'none', borderRadius: 999, padding: '2px 9px', background: 'var(--indigo-50)', fontSize: 10, letterSpacing: '.02em', color: 'var(--indigo-600)' }}>
                      {personaName(c.persona)}
                    </span>
                    <span className="trc-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.phone || '—'}</span>
                  </span>
                </span>
              </span>
              <span style={{ fontSize: 13, color: next.predicted ? 'var(--copper-600)' : 'var(--color-indigo)', fontStyle: next.predicted ? 'italic' : 'normal' }}>
                {next.iso ? (next.predicted ? `≈ ${frShort(next.iso)}` : frShort(next.iso)) : '—'}
              </span>
              <span className="trc-sub">{st?.lastISO ? relDays(st.lastISO) : 'jamais venue'}</span>
              <span className="trc-money">{st && st.spend > 0 ? fmtMoney(st.spend, currency) : '—'}</span>
              <span className="trc-sub">{c.loyaltyPoints ?? 0}</span>
              <span className="trc-rowacts">
                {c.phone ? (
                  <a className="trc-rowact" href={telHref(c.phone)} onClick={(e) => e.stopPropagation()} title={`Appeler ${c.name}`}>Tél</a>
                ) : (
                  <span className="trc-rowact is-off" aria-hidden>Tél</span>
                )}
                {phoneDigits ? (
                  <a className="trc-rowact" href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title={`WhatsApp ${c.name}`}>WA</a>
                ) : (
                  <span className="trc-rowact is-off" aria-hidden>WA</span>
                )}
                <button
                  type="button"
                  className="trc-rowact trc-rowact--rdv"
                  onClick={(e) => { e.stopPropagation(); setRdvFor(c); }}
                  title={`Proposer un rendez-vous à ${c.name}`}
                >
                  + RDV
                </button>
              </span>
            </div>
          );
        })}
      </div>

      {selected && (
        <Customer360
          client={selected}
          personaName={personaName(selected.persona)}
          onClose={() => setSelId(null)}
          appts={apptsOf(selected.id)}
          byId={byId}
          predicted={predictNext(selected.id)}
        />
      )}

      {rdvFor && (
        <RdvModal
          onClose={() => setRdvFor(null)}
          initial={{ clientId: rdvFor.id }}
          title={`Rendez-vous · ${rdvFor.name.split(' ')[0]}.`}
        />
      )}

      {intake && <IntakeModal onClose={() => setIntake(false)} personas={personas} />}
    </div>
  );
}

/* ---------- Fiche 360 ---------- */
function Customer360({
  client, personaName, onClose, appts, byId, predicted,
}: {
  client: Client;
  personaName: string;
  onClose: () => void;
  appts: ReturnType<typeof useBranchAppointments>;
  byId: ReturnType<typeof useServicesById>;
  predicted: { iso: string | null; predicted: boolean };
}) {
  const { branch, currency } = useBranch();
  const [personas] = usePersonas();
  const [invoices] = useInvoices();
  const [pointsHistory] = usePointsHistory();
  const [sessions] = useClientSessions();
  const [bookOpen, setBookOpen] = useState(false);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [payAppt, setPayAppt] = useState<Appointment | null>(null);
  const [pickPersona, setPickPersona] = useState(false);
  const today = todayISO();

  /* La couronne — persistance immédiate ; ce bloc alimente le statut dans Ma Couronne. */
  const patch = (p: Partial<Client>) =>
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, ...p } : c)));

  /* Note de la maison — texte libre éditable, consultations préservées à part. */
  const parsedNotes = splitNotes(client.notes);
  const [consultOpen, setConsultOpen] = useState(false);
  const [noteText, setNoteText] = useState(parsedNotes.free);
  const noteDirty = noteText.trim() !== parsedNotes.free;
  const saveNote = () => {
    const merged = [noteText.trim(), parsedNotes.consultRaw].filter(Boolean).join('\n\n');
    patch({ notes: merged || undefined });
  };

  const bday = client.birthday ? bdayInfo(client.birthday) : null;
  const phoneDigits = digitsOf(client.phone);

  /* ----- Fiche financière ----- */
  const honored = appts.filter((a) => a.status === 'honoré');
  const myInvoices = invoices.filter((i) => i.clientId === client.id);
  const linkedIds = useMemo(() => {
    const set = new Set<string>();
    for (const a of appts) if (a.invoiceId) set.add(a.invoiceId);
    return set;
  }, [appts]);
  /* Factures payées hors règlements de RDV (produits, POS) — évite le double comptage. */
  const paidExtras = myInvoices.filter((i) =>
    i.kind === 'facture' && i.status === 'payée' && !linkedIds.has(i.id)
    && !i.lines.some((l) => l.label.startsWith('Règlement ·')),
  );
  const spend = honored.reduce((s, a) => s + apptNetXof(a, byId), 0)
    + paidExtras.reduce((s, i) => s + invoiceTotal(i), 0);
  const basketCount = honored.length + paidExtras.length;
  const basket = basketCount > 0 ? Math.round(spend / basketCount) : 0;

  /* Solde dû — tout RDV non annulé dont il reste à encaisser. */
  const owing = appts
    .filter((a) => a.status !== 'annulé' && apptDueXof(a, byId) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const due = owing.reduce((s, a) => s + apptDueXof(a, byId), 0);

  const myPoints = pointsHistory.filter((e) => e.clientId === client.id).slice(0, 4);

  /* ----- Présence Ma Couronne ----- */
  const mySessions = sessions.filter((s) => s.clientId === client.id);
  const onlineNow = mySessions.some((s) => isOnline(s));
  const lastSeenISO = mySessions.reduce<string | null>(
    (acc, s) => (!acc || s.lastSeenAt > acc ? s.lastSeenAt : acc), null,
  );
  const totalSec = mySessions.reduce((s, x) => s + (x.durationSec || 0), 0);
  const lastScreen = mySessions
    .slice()
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0]?.screen;

  /* ----- Commandes — ses devis produits ----- */
  const orders = myInvoices
    .filter((i) => i.kind === 'devis')
    .sort((a, b) => b.date.localeCompare(a.date));

  /* ----- Rendez-vous ----- */
  const history = [...appts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const upcomingAll = appts
    .filter((a) => a.date >= today && a.status !== 'annulé' && a.status !== 'honoré')
    .sort((a, b) => a.date.localeCompare(b.date) || timeToMin(a.time) - timeToMin(b.time));
  const upcoming = upcomingAll[0];

  const setPersona = (persona: string) => {
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, persona } : c)));
    setPickPersona(false);
  };

  /* Retrait doux — la cliente disparaît des listes sans quitter la Maison. */
  const archiveClient = () => {
    if (!window.confirm(`Archiver ${client.name} ? Elle sortira des listes sans être supprimée.`)) return;
    patch({ archived: true });
    onClose();
  };

  /* Suppression définitive — les rendez-vous restent au carnet. */
  const deleteClient = () => {
    const warn = appts.length > 0 ? ' Ses rendez-vous resteront au carnet.' : '';
    if (!window.confirm(`Supprimer définitivement ${client.name} ?${warn} Cette action est irréversible.`)) return;
    clientsStore.set((prev) => prev.filter((c) => c.id !== client.id));
    onClose();
  };

  const orderStatusClass = (s: Invoice['status']) =>
    s === 'payée' || s === 'acceptée' ? 'trc-src' : 'trc-src trc-src--indigo';

  return (
    <Drawer onClose={onClose}>
      <div className="trc-drawer__cover">
        <button className="trc-drawer__close" onClick={onClose} aria-label="Fermer">✕</button>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, width: '100%', minWidth: 0 }}>
          <span className="trc-avatarwrap">
            <Avatar client={client} size={64} />
            {onlineNow && <span className="trc-dot-online" title="En ligne sur Ma Couronne" />}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 26, color: 'var(--color-ivoire)', lineHeight: 1 }}>{client.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--indigo-100)', marginTop: 6 }}>{personaName} · {client.city}</div>
            {client.phone && (
              <div className="trc-cover-acts">
                <a className="trc-cover-act" href={telHref(client.phone)}>Appeler</a>
                {phoneDigits && (
                  <a className="trc-cover-act" href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer">WhatsApp</a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Prochain RDV — réel ou prédit */}
        <div className="trc-next">
          <div className="trc-next__eyebrow">{upcoming ? 'Prochain rendez-vous' : 'Prochain rendez-vous · prédit'}</div>
          <div className="trc-next__date">
            {upcoming ? `${frLong(upcoming.date)} · ${upcoming.time}` : predicted.iso ? `≈ ${frLong(predicted.iso)}` : 'À reconquérir'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--indigo-100)', marginTop: 6 }}>
            {upcoming ? `${apptLabel(upcoming, byId)} · ${upcoming.master}` : 'La maison anticipe sa cadence — proposez le fauteuil.'}
          </div>
          <Button variant="copper" size="sm" style={{ marginTop: 12 }} onClick={() => setBookOpen(true)}>+ Proposer un rendez-vous</Button>
        </div>

        {/* Rendez-vous à venir — la liste complète, cliquable pour modifier */}
        {upcomingAll.length > 0 && (
          <div>
            <span className="trc-microlabel">Rendez-vous à venir · {upcomingAll.length}</span>
            <div className="trc-upcoming">
              {upcomingAll.map((a) => (
                <button key={a.id} type="button" className="trc-upcoming__row" onClick={() => setEditAppt(a)} title="Modifier ce rendez-vous">
                  <span className="trc-upcoming__date">{frShort(a.date)} · {a.time}</span>
                  <span className="trc-upcoming__svc">
                    {apptLabel(a, byId)} · {a.master}
                    {a.seriesIndex && a.seriesTotal ? <span className="trc-serie-chip" style={{ marginLeft: 6 }}>{a.seriesIndex}/{a.seriesTotal}</span> : null}
                  </span>
                  <StatusPill status={a.status} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Fiche financière */}
        <div>
          <span className="trc-microlabel">Fiche financière</span>
          <div className="trc-finrow">
            <div className="trc-ministat"><b>{fmtMoney(spend, currency)}</b><span>Total dépensé</span></div>
            <div className="trc-ministat"><b>{basket > 0 ? fmtMoney(basket, currency) : '—'}</b><span>Panier moyen</span></div>
            <div className="trc-ministat"><b>{honored.length}</b><span>Séances</span></div>
            <div className="trc-ministat"><b>{client.loyaltyPoints ?? 0}</b><span>Points cercle</span></div>
          </div>
          {due > 0 && (
            <div className="trc-due">
              <div>
                <span className="trc-due__label">Solde dû · {owing.length} rituel{owing.length > 1 ? 's' : ''}</span>
                <span className="trc-due__amount">{fmtMoney(due, currency)}</span>
              </div>
              <Button variant="copper" size="sm" onClick={() => setPayAppt(owing[0])}>Encaisser</Button>
            </div>
          )}
          {myPoints.length > 0 && (
            <div className="trc-ptlog">
              {myPoints.map((e) => (
                <div className="trc-ptlog__row" key={e.id}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</span>
                  <span className="trc-sub" style={{ flex: 'none' }}>{frDay(e.at.slice(0, 10))}</span>
                  <span className="trc-ptlog__pts">{e.pts > 0 ? `+${e.pts}` : e.pts} pts</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Présence Ma Couronne — ligne discrète */}
        <div>
          <span className="trc-microlabel">Présence Ma Couronne</span>
          <div className={`trc-presence ${onlineNow ? 'is-online' : ''}`}>
            <span className="trc-presence__dot" />
            <span>
              {mySessions.length === 0
                ? 'Jamais connectée à Ma Couronne.'
                : onlineNow
                  ? `En ligne maintenant${lastScreen ? ` · ${lastScreen}` : ''}${totalSec > 0 ? ` · ${fmtDur(totalSec)} au total` : ''}`
                  : `Vue ${lastSeenISO ? relDays(lastSeenISO.slice(0, 10)) : '—'}${totalSec > 0 ? ` · ${fmtDur(totalSec)} au total` : ''}`}
            </span>
          </div>
        </div>

        {/* Identité */}
        <div>
          <span className="trc-microlabel">Identité</span>
          <div className="trc-idgrid">
            <div className="trc-idrow"><span>Téléphone</span><span>{client.phone || '—'}</span></div>
            <div className="trc-idrow"><span>Ville</span><span>{client.city || '—'}</span></div>
            <div className="trc-idrow"><span>Cliente depuis</span><span>{client.since ? frLong(client.since) : '—'}</span></div>
            <div className="trc-idrow"><span>Segment</span><span>{client.segments[0] ?? '—'}</span></div>
          </div>
          <div className="trc-bday">
            <div className="trc-bday__field">
              <Field label="Anniversaire">
                <Input type="date" value={client.birthday ?? ''} onChange={(e) => patch({ birthday: e.target.value || undefined })} />
              </Field>
            </div>
            {client.birthday && bday && (
              <div className="trc-bday__info">
                <span className="trc-bday__age">{frBirthday(client.birthday)} · {bday.age} ans</span>
                {bday.soon && <span className="trc-bday-chip">Anniversaire bientôt</span>}
              </div>
            )}
          </div>
        </div>

        {/* La couronne — partagé avec Ma Couronne */}
        <div>
          <span className="trc-microlabel">La couronne · statut Ma Couronne</span>
          <div className="trc-crown">
            <div className="trc-crown__style">{client.crownStyle ?? 'Style à définir'}</div>
            <div className="trc-crown__meta">
              {client.lockCount ? `${client.lockCount} locks` : 'Locks à compter'}
              {' · '}
              {client.crownSince ? `couronnée depuis ${crownAge(client.crownSince)}` : 'naissance à renseigner'}
              {client.preferredMaster ? ` · fidèle à ${client.preferredMaster}` : ''}
            </div>
            <div className="trc-crown__grid">
              <CrownStyleField
                value={client.crownStyle ?? ''}
                onChange={(v) => patch({ crownStyle: v || undefined })}
              />
              <Field label="Nombre de locks">
                <Input
                  type="number"
                  min={0}
                  value={client.lockCount ?? ''}
                  onChange={(e) => patch({ lockCount: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
                  placeholder="—"
                />
              </Field>
              <Field label="Couronne depuis">
                <Input
                  type="date"
                  value={client.crownSince ?? ''}
                  onChange={(e) => patch({ crownSince: e.target.value || undefined })}
                />
              </Field>
              <Field label="Maître préféré(e)">
                <Select value={client.preferredMaster ?? ''} onChange={(e) => patch({ preferredMaster: e.target.value || undefined })}>
                  <option value="">—</option>
                  {branch.masters.map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
              </Field>
            </div>
          </div>
        </div>

        {/* Persona & segments — deux colonnes sur le panneau élargi */}
        <div className="tr-grid tr-grid--2">
          <div>
            <span className="trc-microlabel">Persona attribué</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--hairline)', borderRadius: 3, padding: '10px 13px', background: 'var(--surface-card)' }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{personaName}</span>
              <button style={{ background: 'none', border: '1px solid var(--color-argile)', borderRadius: 2, cursor: 'pointer', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-indigo)', padding: '7px 12px' }} onClick={() => setPickPersona((v) => !v)}>
                Changer ▾
              </button>
            </div>
            {pickPersona && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {personas.map((p) => (
                  <button key={p.id} className={`trc-chip ${p.id === client.persona ? 'is-active' : ''}`} onClick={() => setPersona(p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className="trc-microlabel">Segments</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {client.segments.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Aucun segment.</span>}
              {client.segments.map((s) => <span key={s} className="trc-src">{s}</span>)}
            </div>
          </div>
        </div>

        {/* Commandes — ses devis produits */}
        <div>
          <span className="trc-microlabel">Commandes · {orders.length}</span>
          {orders.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Aucune commande — ses devis apparaîtront ici.</div>
          )}
          {orders.length > 0 && (
            <div className="trc-orders">
              {orders.map((o) => (
                <div className="trc-order" key={o.id}>
                  <span className="trc-order__id">
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--color-indigo)' }}>{o.number}</span>
                    <span className="trc-sub" style={{ marginLeft: 8 }}>{frDay(o.date)}</span>
                  </span>
                  <span className="trc-order__total">{fmtMoney(invoiceTotal(o), currency)}</span>
                  <span className={orderStatusClass(o.status)}>{o.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Historique */}
        <div>
          <span className="trc-microlabel">Historique du carnet</span>
          {history.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Aucun passage enregistré.</div>}
          <div className="trc-timeline" style={{ flexDirection: 'column', gap: 0 }}>
            {history.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div className="trc-timeline__rail">
                  <span className="trc-timeline__dot" style={{ background: a.status === 'honoré' ? 'var(--color-copper)' : 'var(--indigo-200)' }} />
                  {i < history.length - 1 && <span className="trc-timeline__line" />}
                </div>
                <div style={{ paddingBottom: 14, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{frDay(a.date)} · {a.time}</span>
                    <StatusPill status={a.status} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3 }}>{apptLabel(a, byId)} · {a.master}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Consultations — repliable pour alléger la fiche */}
        {parsedNotes.blocks.length > 0 && (
          <div>
            <button
              type="button"
              className="trc-consult-toggle"
              onClick={() => setConsultOpen((v) => !v)}
              aria-expanded={consultOpen}
            >
              <span className="trc-microlabel">Consultations · {parsedNotes.blocks.length}</span>
              <span className="trc-consult-toggle__chev">{consultOpen ? 'Masquer ▲' : 'Afficher ▼'}</span>
            </button>
            {consultOpen && <ConsultCards blocks={parsedNotes.blocks} />}
          </div>
        )}

        {/* Note de la maison — texte libre éditable */}
        <div>
          <span className="trc-microlabel">Note de la maison</span>
          <textarea
            className="trc-dossier-notes"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Une attention, une préférence, un détail du rituel…"
            rows={3}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button variant="indigo" size="sm" disabled={!noteDirty} onClick={saveNote}>Enregistrer</Button>
          </div>
        </div>

        {/* Retrait de la Maison — archive (doux) ou suppression définitive */}
        <div className="trc-danger">
          <span className="trc-microlabel">Retirer de la Maison</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={archiveClient}>
              Archiver la cliente
            </Button>
            <button type="button" className="trc-danger__btn" onClick={deleteClient}>
              Supprimer la cliente
            </button>
          </div>
          <p className="trc-danger__note">
            L’archivage la retire des listes sans l’effacer. La suppression est définitive.
          </p>
        </div>
      </div>

      {bookOpen && <RdvModal onClose={() => setBookOpen(false)} initial={{ clientId: client.id }} title={`Rendez-vous · ${client.name.split(' ')[0]}.`} />}
      {editAppt && <RdvModal onClose={() => setEditAppt(null)} appt={editAppt} />}
      {payAppt && <PayAppointmentModal appt={payAppt} onClose={() => setPayAppt(null)} />}
    </Drawer>
  );
}

/* ---------- Ajout d'une cliente ---------- */
function IntakeModal({ onClose, personas }: { onClose: () => void; personas: ReturnType<typeof usePersonas>[0] }) {
  const { branch } = useBranch();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(branch.dial + ' ');
  const [city, setCity] = useState(branch.city);
  const [persona, setPersona] = useState(personas[0]?.id ?? '');
  const [birthday, setBirthday] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [segments, setSegments] = useState<string[]>([]);
  const [crownStyle, setCrownStyle] = useState('');
  const [lockCount, setLockCount] = useState('');
  const [crownSince, setCrownSince] = useState('');
  const [preferredMaster, setPreferredMaster] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onPhoto = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const toggleSeg = (s: string) => setSegments((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const save = () => {
    if (!name.trim()) { setError('Donnez un nom à la tête couronnée.'); return; }
    const client: Client = {
      id: uid(),
      branchId: branch.id,
      name: name.trim(),
      phone: phone.trim(),
      city: city.trim() || branch.city,
      persona,
      since: todayISO(),
      photo,
      segments,
      priceCoef: 1.0,
      loyaltyPoints: 0,
      birthday: birthday || undefined,
      diaspora: branch.country !== 'Bénin' && branch.country !== "Côte d’Ivoire",
      crownStyle: crownStyle || undefined,
      lockCount: lockCount === '' ? undefined : Math.max(0, Number(lockCount)),
      crownSince: crownSince || undefined,
      preferredMaster: preferredMaster || undefined,
    };
    clientsStore.set((prev) => [...prev, client]);
    onClose();
  };

  return (
    <Modal title="Nouvelle tête couronnée." onClose={onClose} width={540}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {photo ? (
            <img src={photo} alt="" className="trc-avatar" style={{ width: 64, height: 64 }} />
          ) : (
            <span className="trc-avatar" style={{ width: 64, height: 64, fontSize: 24 }}>{name.trim() ? name.trim()[0] : '＋'}</span>
          )}
          <label style={{ cursor: 'pointer', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--copper-600)', border: '1px dashed var(--copper-500)', borderRadius: 2, padding: '9px 14px' }}>
            Ajouter une photo
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
        </div>

        <Field label="Nom complet">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom et prénom" />
        </Field>

        <div className="tr-grid tr-grid--2">
          <Field label="Téléphone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Ville">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
        </div>

        <div className="tr-grid tr-grid--2">
          <Field label="Persona de départ">
            <Select value={persona} onChange={(e) => setPersona(e.target.value)}>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Anniversaire">
            <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
          </Field>
        </div>

        <div>
          <span className="trc-microlabel">La couronne · partagé avec Ma Couronne</span>
          <div className="tr-grid tr-grid--2">
            <CrownStyleField value={crownStyle} onChange={setCrownStyle} />
            <Field label="Nombre de locks">
              <Input type="number" min={0} value={lockCount} onChange={(e) => setLockCount(e.target.value)} placeholder="—" />
            </Field>
            <Field label="Couronne depuis">
              <Input type="date" value={crownSince} onChange={(e) => setCrownSince(e.target.value)} />
            </Field>
            <Field label="Maître préféré(e)">
              <Select value={preferredMaster} onChange={(e) => setPreferredMaster(e.target.value)}>
                <option value="">—</option>
                {branch.masters.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>
          </div>
        </div>

        <div>
          <span className="trc-microlabel">Segments</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {SEGMENT_PRESETS.map((s) => (
              <button key={s} className={`trc-chip ${segments.includes(s) ? 'is-active' : ''}`} onClick={() => toggleSeg(s)}>{s}</button>
            ))}
          </div>
        </div>

        {error && <div style={{ fontSize: 12, color: 'var(--copper-700)' }}>{error}</div>}

        <Button variant="indigo" onClick={save}>Enregistrer la cliente</Button>
      </div>
    </Modal>
  );
}
