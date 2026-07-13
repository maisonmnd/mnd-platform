import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { CROWN_STYLES, clientsStore, usePersonas, type Client } from '../../../../shared/clients';
import { uid } from '../../../../shared/store';
import {
  Avatar, Drawer, RdvModal, StatusPill, addDaysISO, apptLabel, apptTotalXof, frLong, frShort, frDay,
  fromISO, relDays, timeToMin, todayISO, useBranchAppointments, useBranchClients, useServicesById,
} from './_shared';
import './clients.css';

/* Customers — le CRM 360 : segments, persona attribué, prochain RDV prédit,
   fiche complète (dépense, fidélité, historique) et ajout d'une cliente. */

const GRID = '1.7fr 1fr 1fr 1fr 0.8fr 34px';
const SEGMENT_PRESETS = ['VIP', 'Abonnée', 'Nouvelle', 'Diaspora', 'Famille', 'Cercle', 'Régulier', 'Dormante'];

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

export default function Customers() {
  const clients = useBranchClients();
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const [personas] = usePersonas();
  const today = todayISO();

  const [seg, setSeg] = useState('Tous');
  const [selId, setSelId] = useState<string | null>(null);
  const [intake, setIntake] = useState(false);

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

  const lastVisit = (id: string) => {
    const last = apptsOf(id).filter((a) => a.status === 'honoré').sort((a, b) => b.date.localeCompare(a.date))[0];
    return last ? relDays(last.date) : 'jamais venue';
  };

  const segments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of clients) for (const s of c.segments) counts.set(s, (counts.get(s) ?? 0) + 1);
    return [{ label: 'Tous', count: clients.length }, ...[...counts].map(([label, count]) => ({ label, count }))];
  }, [clients]);

  const filtered = seg === 'Tous' ? clients : clients.filter((c) => c.segments.includes(seg));
  const selected = clients.find((c) => c.id === selId) ?? null;

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="CRM · Le Suivi"
        title="Têtes couronnées."
        actions={<Button variant="indigo" onClick={() => setIntake(true)}>+ Nouvelle cliente</Button>}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        {segments.map((s) => (
          <button key={s.label} className={`trc-chip ${seg === s.label ? 'is-active' : ''}`} onClick={() => setSeg(s.label)}>
            {s.label} <span className="count">{s.count}</span>
          </button>
        ))}
      </div>

      <div className="trc-sheet">
        <div className="trc-sheet__head" style={{ gridTemplateColumns: GRID }}>
          <span>Cliente</span>
          <span>Téléphone</span>
          <span>Prochain RDV</span>
          <span>Dernière visite</span>
          <span>Segment</span>
          <span />
        </div>
        {filtered.length === 0 && <div className="trc-empty">Aucune tête couronnée sur ce segment.</div>}
        {filtered.map((c) => {
          const next = predictNext(c.id);
          return (
            <div className="trc-sheet__row" style={{ gridTemplateColumns: GRID, cursor: 'pointer' }} key={c.id} onClick={() => setSelId(c.id)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <Avatar client={c} size={36} />
                <span style={{ minWidth: 0 }}>
                  <span className="trc-name" style={{ display: 'block' }}>{c.name}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, borderRadius: 999, padding: '2px 9px', background: 'var(--indigo-50)' }}>
                    <span style={{ fontSize: 10, letterSpacing: '.02em', color: 'var(--indigo-600)' }}>{personaName(c.persona)}</span>
                  </span>
                </span>
              </span>
              <span className="trc-sub">{c.phone}</span>
              <span style={{ fontSize: 13, color: next.predicted ? 'var(--copper-600)' : 'var(--color-indigo)', fontStyle: next.predicted ? 'italic' : 'normal' }}>
                {next.iso ? (next.predicted ? `≈ ${frShort(next.iso)}` : frShort(next.iso)) : '—'}
              </span>
              <span className="trc-sub">{lastVisit(c.id)}</span>
              <span><span className="trc-src">{c.segments[0] ?? '—'}</span></span>
              <span style={{ color: 'var(--color-copper)', textAlign: 'right' }}>→</span>
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
  const [bookOpen, setBookOpen] = useState(false);
  const [pickPersona, setPickPersona] = useState(false);
  const today = todayISO();

  /* La couronne — persistance immédiate ; ce bloc alimente le statut dans Ma Couronne. */
  const patch = (p: Partial<Client>) =>
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, ...p } : c)));

  const honored = appts.filter((a) => a.status === 'honoré');
  const spend = honored.reduce((s, a) => s + apptTotalXof(a, byId), 0);
  const history = [...appts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const upcoming = appts
    .filter((a) => a.date >= today && a.status !== 'annulé' && a.status !== 'honoré')
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const setPersona = (persona: string) => {
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, persona } : c)));
    setPickPersona(false);
  };

  return (
    <Drawer onClose={onClose}>
      <div className="trc-drawer__cover">
        <button className="trc-drawer__close" onClick={onClose} aria-label="Fermer">✕</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar client={client} size={64} />
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 26, color: 'var(--color-ivoire)', lineHeight: 1 }}>{client.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--indigo-100)', marginTop: 6 }}>{personaName} · {client.city}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Prochain RDV prédit */}
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

        {/* Ministats */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="trc-ministat"><b>{fmtMoney(spend, currency)}</b><span>Dépense cumulée</span></div>
          <div className="trc-ministat"><b>{honored.length}</b><span>Séances</span></div>
          <div className="trc-ministat"><b>{client.loyaltyPoints}</b><span>Points cercle</span></div>
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
              <Field label="Style de couronne">
                <Select value={client.crownStyle ?? ''} onChange={(e) => patch({ crownStyle: e.target.value || undefined })}>
                  <option value="">—</option>
                  {CROWN_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
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

        {/* Persona */}
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

        {/* Segments */}
        <div>
          <span className="trc-microlabel">Segments</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {client.segments.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Aucun segment.</span>}
            {client.segments.map((s) => <span key={s} className="trc-src">{s}</span>)}
          </div>
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

        {client.notes && (
          <div>
            <span className="trc-microlabel">Note de la maison</span>
            <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink)' }}>{client.notes}</div>
          </div>
        )}
      </div>

      {bookOpen && <RdvModal onClose={() => setBookOpen(false)} initial={{ clientId: client.id }} title={`Rendez-vous · ${client.name.split(' ')[0]}.`} />}
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

        <Field label="Persona de départ">
          <Select value={persona} onChange={(e) => setPersona(e.target.value)}>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>

        <div>
          <span className="trc-microlabel">La couronne · partagé avec Ma Couronne</span>
          <div className="tr-grid tr-grid--2">
            <Field label="Style de couronne">
              <Select value={crownStyle} onChange={(e) => setCrownStyle(e.target.value)}>
                <option value="">—</option>
                {CROWN_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
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
