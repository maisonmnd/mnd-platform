import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients, type Client } from '../../../../shared/clients';
import { appointmentsStore, useAppointments, type Appointment } from '../../../../shared/agenda';
import { useServices, type Service } from '../../../../shared/catalog';
import { depositForServices, depositPctFor, useSettings } from '../../../../shared/settings';
import { uid } from '../../../../shared/store';
import './clients.css';

/* Outils communs du domaine Clients & Agenda — dates, pastilles, tiroir, modale RDV. */

/* ---------- Dates ---------- */
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export const fromISO = (iso: string) => new Date(`${iso}T12:00:00`);
export const addDaysISO = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « Lun. 13 juil. » */
export const frShort = (iso: string) =>
  cap(fromISO(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }));

/** « Lundi 13 juillet » */
export const frLong = (iso: string) =>
  cap(fromISO(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));

/** « 13 juil. » */
export const frDay = (iso: string) =>
  fromISO(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export const timeToMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Écart relatif éditorial : « aujourd'hui », « il y a 4 j », « il y a 2 mois ». */
export function relDays(iso: string): string {
  const diff = Math.round((Date.now() - fromISO(iso).getTime()) / 86400000);
  if (diff <= 0) return 'aujourd’hui';
  if (diff === 1) return 'hier';
  if (diff < 30) return `il y a ${diff} j`;
  const months = Math.round(diff / 30);
  return `il y a ${months} mois`;
}

/* ---------- Rendez-vous ---------- */
export const apptServices = (a: Appointment, byId: Map<string, Service>): Service[] =>
  a.serviceIds.map((id) => byId.get(id)).filter((s): s is Service => !!s);

export const apptDurationMin = (a: Appointment, byId: Map<string, Service>) =>
  apptServices(a, byId).reduce((sum, s) => sum + s.durationMin, 0) || 60;

/* Série multi-séances : la prestation n'est facturée qu'UNE fois.
   Le montant est porté par la séance 1 ; les séances suivantes valent 0
   (partout : tableau de bord, carnet, synthèse, fidélité, impayés). */
export const apptTotalXof = (a: Appointment, byId: Map<string, Service>) => {
  if (a.seriesIndex && a.seriesIndex > 1) return 0;
  /* Un prix figé l'emporte sur le catalogue : le rituel a été facturé À CE
     PRIX-LÀ, et le catalogue a bougé depuis. Le relire au tarif du jour
     réécrirait l'histoire — c'est ce que faisaient les RDV repris de l'ancien
     ERP, à 3 M F près. La règle des séries reste au-dessus : une séance 2+ ne
     vaut rien, prix figé ou non. */
  if (typeof a.priceXof === 'number') return a.priceXof;
  return apptServices(a, byId).reduce((sum, s) => sum + s.priceXof, 0);
};

/** Total après remise du RDV : le pourcentage d'abord, puis la remise en CFA.
    Jamais négatif — une remise en CFA supérieure au reste rend le rituel offert. */
export const apptNetXof = (a: Appointment, byId: Map<string, Service>) =>
  Math.max(0, Math.round(apptTotalXof(a, byId) * (1 - (a.discountPct ?? 0) / 100)) - (a.discountXof ?? 0));

/** Facteur de remise EFFECTIF d'un RDV (0–1) — le pourcentage ET la remise en
    CFA, cette dernière répartie au prorata des prestations. À utiliser pour
    toute ventilation par prestation ou par maître : appliquer seulement
    `discountPct` surévaluerait le chiffre d'affaires dès qu'une remise manuelle
    existe, et les ventilations ne sommeraient plus au net encaissé. */
export const apptDiscountFactor = (a: Appointment, byId: Map<string, Service>): number => {
  const gross = apptTotalXof(a, byId);
  if (gross <= 0) return 0;
  return apptNetXof(a, byId) / gross;
};

/** Reste à encaisser : net − acompte − déjà encaissé (jamais négatif). */
export const apptDueXof = (a: Appointment, byId: Map<string, Service>) =>
  Math.max(0, apptNetXof(a, byId) - (a.depositXof ?? 0) - (a.paidXof ?? 0));

/** État de règlement d'un RDV — support de la pastille payé/partiel/impayé/gratuit. */
export function apptPayState(a: Appointment, byId: Map<string, Service>): 'payé' | 'partiel' | 'impayé' | 'gratuit' {
  const net = apptNetXof(a, byId);
  if (net <= 0) return 'gratuit';
  const due = apptDueXof(a, byId);
  if (due <= 0) return 'payé';
  const paid = (a.paidXof ?? 0) + (a.depositXof ?? 0);
  return paid > 0 ? 'partiel' : 'impayé';
}

export const apptLabel = (a: Appointment, byId: Map<string, Service>) =>
  apptServices(a, byId).map((s) => s.name).join(' + ') || '—';

export function useServicesById(): Map<string, Service> {
  const [services] = useServices();
  return useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
}

export function useBranchClients(): Client[] {
  const { branch } = useBranch();
  const [clients] = useClients();
  return useMemo(() => clients.filter((c) => c.branchId === branch.id && !c.archived), [clients, branch.id]);
}

export function useBranchAppointments(): Appointment[] {
  const { branch } = useBranch();
  const [appointments] = useAppointments();
  return useMemo(() => appointments.filter((a) => a.branchId === branch.id), [appointments, branch.id]);
}

/* ---------- Pastilles ---------- */
const STATUS_CLASS: Record<Appointment['status'], string> = {
  'confirmé': 'trc-pill--confirme',
  'en attente': 'trc-pill--attente',
  'honoré': 'trc-pill--honore',
  'annulé': 'trc-pill--annule',
};

export function StatusPill({ status }: { status: Appointment['status'] }) {
  return <span className={`trc-pill ${STATUS_CLASS[status]}`}>{status}</span>;
}

/* Pastille de règlement — verte (payé), cuivre (partiel), rouge (impayé) ; rien si gratuit. */
export function PayStatusPill({ a, byId }: { a: Appointment; byId: Map<string, Service> }) {
  const state = apptPayState(a, byId);
  if (state === 'gratuit') return null;
  const color = state === 'payé' ? 'var(--trf-success)' : state === 'partiel' ? 'var(--color-copper)' : '#8f3b30';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        borderRadius: 'var(--radius-pill)',
        padding: '2px 7px',
        border: `1px solid ${color}`,
        color,
        whiteSpace: 'nowrap',
        lineHeight: 1.35,
      }}
    >
      {state}
    </span>
  );
}

const SOURCE_LABEL: Record<string, string> = { couronne: 'Ma Couronne', consultation: 'Consultation', trone: 'Le Trône' };

export function SourceBadge({ source }: { source?: Appointment['source'] }) {
  if (!source || source === 'trone') return null;
  return <span className={`trc-src ${source === 'consultation' ? 'trc-src--indigo' : ''}`}>{SOURCE_LABEL[source]}</span>;
}

/* ---------- Avatar (photo ou initiales) ---------- */
export function Avatar({ client, size = 36 }: { client: Pick<Client, 'name' | 'photo'>; size?: number }) {
  const initials = client.name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('');
  if (client.photo) {
    return <img className="trc-avatar" src={client.photo} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  }
  return (
    <span className="trc-avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </span>
  );
}

/* ---------- Tiroir latéral ---------- */
export function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="trc-drawer-veil" onClick={onClose} />
      <div className="trc-drawer">{children}</div>
    </>
  );
}

/* ---------- Créneaux 08:00 → 18:00 ---------- */
export const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 8; h < 18; h++) {
    out.push(`${pad2(h)}:00`, `${pad2(h)}:30`);
  }
  return out;
})();

/* ---------- Modale rendez-vous — création & modification ---------- */
export type RdvInitial = Partial<Pick<Appointment, 'clientId' | 'serviceIds' | 'date' | 'time' | 'master' | 'note'>>;

const RDV_STATUSES: Appointment['status'][] = ['en attente', 'confirmé', 'honoré', 'annulé'];

export function RdvModal({
  onClose,
  initial,
  appt,
  title,
  onEncaisser,
}: {
  onClose: () => void;
  initial?: RdvInitial;
  /** Rendez-vous existant — la modale passe en mode modification (statut, suppression). */
  appt?: Appointment;
  title?: string;
  /** Encaisser depuis la modale — n'apparaît qu'en modification d'un RDV existant. */
  onEncaisser?: (a: Appointment) => void;
}) {
  const { branch, currency } = useBranch();
  const clients = useBranchClients();
  const branchAppts = useBranchAppointments();
  const [services] = useServices();
  const byId = useServicesById();

  const [clientId, setClientId] = useState(appt?.clientId ?? initial?.clientId ?? clients[0]?.id ?? '');
  const [serviceIds, setServiceIds] = useState<string[]>(appt?.serviceIds ?? initial?.serviceIds ?? []);
  const [date, setDate] = useState(appt?.date ?? initial?.date ?? todayISO());
  const [time, setTime] = useState(appt?.time ?? initial?.time ?? '09:00');
  const [master, setMaster] = useState(appt?.master ?? initial?.master ?? branch.masters[0] ?? '');
  const [status, setStatus] = useState<Appointment['status']>(appt?.status ?? 'confirmé');
  const [note, setNote] = useState(appt?.note ?? initial?.note ?? '');
  const [discountPct, setDiscountPct] = useState<number>(appt?.discountPct ?? 0);
  const [discountXof, setDiscountXof] = useState<number>(appt?.discountXof ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [settings] = useSettings();

  const chosen = serviceIds.map((id) => byId.get(id)).filter((s): s is Service => !!s);
  const remaining = services.filter((s) => !serviceIds.includes(s.id)).sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.order - b.order);
  /* La modale recompose TOUJOURS au catalogue du jour : c'est ce que le maître
     voit et valide. Un RDV au prix figé (repris de l'ancien ERP) s'affiche donc
     au tarif actuel, et l'enregistrer abandonne le prix figé — voir `save()`.
     On le dit à l'écran plutôt que de laisser l'historique se réécrire en silence. */
  const frozenXof = appt?.priceXof;
  const grossXof = chosen.reduce((s, sv) => s + sv.priceXof, 0);
  const frozenDiffers = typeof frozenXof === 'number' && Math.round(frozenXof) !== Math.round(grossXof);
  /* Pourcentage d'abord, puis remise en CFA — jamais sous zéro. Même ordre que
     `apptNetXof`, sinon l'aperçu de la modale mentirait sur le net encaissé. */
  const totalXof = Math.max(0, Math.round(grossXof * (1 - discountPct / 100)) - discountXof);
  /* Acompte piloté par Paramètres : SEULEMENT les prestations qui l'exigent,
     CHACUNE à son propre taux. Aucune (ou taux 0) → pas d'acompte. */
  const depositServiceIds = chosen.filter((s) => depositPctFor(s.id) > 0).map((s) => s.id);
  /* La remise en CFA ne se répartit pas prestation par prestation : l'acompte se
     calcule sur le prix remisé en %, puis on le plafonne au net — réclamer un
     acompte supérieur au total à payer n'aurait aucun sens. */
  const depositXof = Math.min(depositForServices(chosen, discountPct), totalXof);
  const hasDeposit = depositXof > 0;
  /* Un pourcentage n'est affichable que s'il est unique parmi les prestations
     concernées ; sinon seul le montant a du sens. */
  const depositRates = [...new Set(chosen.map((s) => depositPctFor(s.id)).filter((p) => p > 0))];
  const depositPct = depositRates.length === 1 ? depositRates[0] : null;

  /* Chevauchement — même maître, même jour, statut non annulé (indication non bloquante). */
  const overlap = useMemo(() => {
    const start = timeToMin(time);
    const end = start + (chosen.reduce((s, sv) => s + sv.durationMin, 0) || 60);
    return branchAppts.find((a) => {
      if (a.id === appt?.id || a.date !== date || a.master !== master || a.status === 'annulé') return false;
      const s2 = timeToMin(a.time);
      return start < s2 + apptDurationMin(a, byId) && s2 < end;
    });
  }, [branchAppts, appt?.id, date, time, master, chosen, byId]);

  const overlapName = overlap ? clients.find((c) => c.id === overlap.clientId)?.name ?? 'une cliente' : '';

  const save = (chosenStatus: Appointment['status']) => {
    if (!clientId) {
      setError('Choisissez une tête couronnée.');
      return;
    }
    if (serviceIds.length === 0) {
      setError('Ajoutez au moins une prestation.');
      return;
    }
    if (appt) {
      appointmentsStore.set((prev) =>
        prev.map((x) =>
          x.id === appt.id
            ? { ...x, clientId, serviceIds, date, time, master, status: chosenStatus, note: note.trim() || undefined,
                discountPct: discountPct || undefined, discountXof: discountXof || undefined,
                /* Le maître vient de valider un total calculé au catalogue : on
                   abandonne le prix figé, sinon le RDV afficherait un montant que
                   personne n'a approuvé. */
                priceXof: undefined,
                depositServiceIds, depositXof }
            : x,
        ),
      );
    } else {
      const created: Appointment = {
        id: uid(),
        branchId: branch.id,
        clientId,
        serviceIds,
        date,
        time,
        master,
        status: chosenStatus,
        source: 'trone',
        note: note.trim() || undefined,
        discountPct: discountPct || undefined,
        discountXof: discountXof || undefined,
        depositServiceIds,
        depositXof,
      };
      appointmentsStore.set((prev) => [...prev, created]);
    }
    onClose();
  };

  const remove = () => {
    if (!appt) return;
    if (!window.confirm('Supprimer ce rendez-vous ? Cette action est définitive.')) return;
    appointmentsStore.set((prev) => prev.filter((x) => x.id !== appt.id));
    onClose();
  };

  return (
    <Modal title={title ?? (appt ? 'Modifier le rendez-vous.' : 'Nouveau rendez-vous.')} onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Tête couronnée">
          <ClientPicker value={clientId} onChange={setClientId} placeholder="Rechercher une cliente (nom, téléphone)…" />
        </Field>

        <div>
          <span className="trc-microlabel">Prestations</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {chosen.map((sv) => (
              <div
                key={sv.id}
                style={{
                  border: '1px solid var(--hairline)', borderRadius: 2, padding: '11px 14px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, background: 'var(--surface-card)',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, color: 'var(--color-indigo)' }}>{sv.name}</span>
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>
                    {Math.round(sv.durationMin / 60 * 10) / 10} h · {sv.sessions > 1 ? `${sv.sessions} séances · ` : ''}palier {sv.palier}
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                  <span style={{ fontSize: 13 }}>{sv.hidePrice ? 'sur devis' : fmtMoney(sv.priceXof, currency)}</span>
                  <button
                    onClick={() => setServiceIds((ids) => ids.filter((id) => id !== sv.id))}
                    aria-label="Retirer"
                    style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 13 }}
                  >
                    ✕
                  </button>
                </span>
              </div>
            ))}
            <Select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  setServiceIds((ids) => [...ids, e.target.value]);
                }
              }}
              style={{ borderStyle: 'dashed', color: 'var(--copper-600)' }}
            >
              <option value="" disabled>
                + Ajouter une prestation…
              </option>
              {remaining.map((sv) => (
                <option key={sv.id} value={sv.id}>
                  {sv.name} · {fmtMoney(sv.priceXof, currency)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="tr-grid tr-grid--2">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Heure">
            <Select value={time} onChange={(e) => setTime(e.target.value)}>
              {!TIME_SLOTS.includes(time) && <option value={time}>{time}</option>}
              {TIME_SLOTS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="tr-grid tr-grid--2">
          <Field label="Maître au fauteuil">
            <Select value={master} onChange={(e) => setMaster(e.target.value)}>
              {branch.masters.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          {appt ? (
            <Field label="Statut">
              <Select value={status} onChange={(e) => setStatus(e.target.value as Appointment['status'])}>
                {RDV_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <span />
          )}
        </div>

        {overlap && (
          <div className="trc-overlap">
            Attention — {master} reçoit déjà {overlapName} à {overlap.time} ce jour-là. Les deux rituels se chevauchent ;
            vous pouvez tout de même enregistrer.
          </div>
        )}

        <Field label="Note du carnet">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Une attention, une préférence…" />
        </Field>

        {/* Remise — accessible à la prise de RDV (tableau de bord, carnet, calendrier). */}
        <Field label="Remise sur le rituel (%)">
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 5, 10, 15, 20].map((p) => (
              <button
                key={p}
                type="button"
                className={`trc-disc ${discountPct === p ? 'is-on' : ''}`}
                onClick={() => setDiscountPct(p)}
              >
                {p === 0 ? 'Aucune' : `−${p}%`}
              </button>
            ))}
            <input
              className="mnd-input"
              type="number"
              min={0}
              max={100}
              value={discountPct}
              onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
              style={{ width: 68, textAlign: 'right' }}
              aria-label="Remise personnalisée"
            />
          </div>
        </Field>

        {/* Remise en CFA — geste de comptoir, retranchée après le pourcentage. */}
        <Field label={`Remise manuelle (${currency})`}>
          <input
            className="mnd-input"
            type="number"
            min={0}
            value={discountXof}
            onChange={(e) => setDiscountXof(Math.max(0, Math.round(Number(e.target.value) || 0)))}
            style={{ width: 140, textAlign: 'right' }}
            placeholder="0"
            aria-label={`Remise manuelle en ${currency}`}
          />
        </Field>

        {/* Un RDV repris de l'ancien ERP porte le prix auquel il a VRAIMENT été
            facturé. La modale, elle, recompose au catalogue du jour. On prévient
            plutôt que de laisser l'enregistrement réécrire l'historique. */}
        {frozenDiffers && (
          <div style={{ fontSize: 12, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', padding: '9px 11px', lineHeight: 1.5 }}>
            Ce rituel a été facturé <b>{fmtMoney(frozenXof!, currency)}</b> ; au catalogue d’aujourd’hui
            il vaut {fmtMoney(grossXof, currency)}. Enregistrer adoptera le tarif actuel — et l’historique
            de ce rituel changera.
          </div>
        )}

        <div className="trc-total">
          {(discountPct > 0 || discountXof > 0) && (
            <div className="trc-total__row">
              <span>
                Sous-total
                {discountPct > 0 ? ` · remise −${discountPct}%` : ''}
                {discountXof > 0 ? ` · remise −${fmtMoney(discountXof, currency)}` : ''}
              </span>
              <span className="trc-total__num"><s style={{ color: 'var(--ink-soft)' }}>{fmtMoney(grossXof, currency)}</s></span>
            </div>
          )}
          <div className="trc-total__row">
            <span>Total prestations</span>
            <span className="trc-total__num">{fmtMoney(totalXof, currency)}</span>
          </div>
          {hasDeposit && (
            <div className="trc-total__row">
              <span>
                Acompte Mobile Money{depositPct !== null ? ` · ${depositPct} %` : ' · taux variables'}
                {depositServiceIds.length < chosen.length ? ' (partiel)' : ''}
              </span>
              <span className="trc-total__num">{fmtMoney(depositXof, currency)}</span>
            </div>
          )}
        </div>

        {error && (
          <div style={{ fontSize: 12, color: 'var(--copper-700)' }}>{error}</div>
        )}

        {appt ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="copper" onClick={() => save(status)}>
              Enregistrer les modifications
            </Button>
            {onEncaisser && (
              <Button variant="ghost" onClick={() => onEncaisser(appt)}>
                Encaisser
              </Button>
            )}
            <Button variant="ghost" onClick={remove} style={{ color: 'var(--copper-700)' }}>
              Supprimer le rendez-vous
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="copper" onClick={() => save('confirmé')}>
              {hasDeposit ? 'Confirmer & demander l’acompte' : 'Confirmer le rendez-vous'}
            </Button>
            <Button variant="ghost" onClick={() => save('en attente')}>
              Enregistrer en attente
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------- Sélecteur de cliente — recherche par nom / téléphone ---------- */
export function ClientPicker({
  value,
  onChange,
  placeholder = 'Rechercher une cliente…',
  allowWalkIn = false,
}: {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  allowWalkIn?: boolean;
}) {
  const clients = useBranchClients();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = clients.find((c) => c.id === value);
  const digits = (s: string) => s.replace(/\D/g, '');
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return clients.slice(0, 8);
    return clients.filter((c) => c.name.toLowerCase().includes(q) || digits(c.phone).includes(digits(q))).slice(0, 8);
  }, [clients, q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const display = open ? query : selected?.name ?? (value === 'walkin' && allowWalkIn ? 'Cliente de passage' : '');

  return (
    <div className="trc-clientpick" ref={wrapRef}>
      <input
        className="mnd-input"
        value={display}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && (
        <div className="trc-clientpick__menu" role="listbox">
          {allowWalkIn && (
            <button type="button" className="trc-clientpick__opt" onClick={() => { onChange('walkin'); setOpen(false); }}>
              <span className="trc-clientpick__n">Cliente de passage</span>
              <span className="trc-clientpick__m">walk-in</span>
            </button>
          )}
          {results.map((c) => (
            <button key={c.id} type="button" className="trc-clientpick__opt" onClick={() => { onChange(c.id); setOpen(false); }}>
              <span className="trc-clientpick__n">{c.name}</span>
              <span className="trc-clientpick__m">{c.phone || c.city}</span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="trc-clientpick__empty">Aucune cliente — {q ? 'affinez la recherche' : 'ajoutez-en une'}.</div>
          )}
        </div>
      )}
    </div>
  );
}
