import { useMemo, useState, type ReactNode } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Eyebrow, Input, Textarea } from '../../../../ds/components';
import { Toggle } from '../equipe/ui';
import { useBranch } from '../../../../shared/branches';
import { currencyByCode } from '../../../../shared/geo';
import { HOUR_OPTIONS, useSettings, type DayHours } from '../../../../shared/settings';
import { useCrownStyles, useSegments } from '../../../../shared/clients';
import { useServices } from '../../../../shared/catalog';
import { usePaymentMethods, paymentMethodsStore } from '../../../../shared/finance';
import { createStore, useStore } from '../../../../shared/store';
import '../equipe/equipe.css'; // styles des composants partagés (Toggle, tre-*)
import './systeme.css';

/* Système · Paramètres — jours & heures d'ouverture, accès ERP du personnel par
   rubrique de domaine (codes d'accès envoyables), et les liens d'automatisation. */

type FieldRow = { l: string; v: string };
type ToggleRow = { k: string; l: string; sub: string };

/* ---------- Identité de la Maison & rituel par défaut — champs éditables ----------
   Persistés en localStorage (clé `mnd_house_identity`) via le magasin partagé.
   Ces réglages ne trouvaient pas de foyer dans `settings` (bascules) ni dans
   `houseSettingsStore` (Record<string, boolean>) : on leur donne un magasin dédié. */
type HouseIdentity = {
  nom: string;
  raison: string;
  fuseau: string;
  dureeRituel: string;
  fenetreAnnulation: string;
};

const DEFAULT_IDENTITY: HouseIdentity = {
  nom: 'Maison MND',
  raison: 'MND SARL · RCCM COT-B-2021',
  fuseau: 'Cotonou · GMT+1',
  dureeRituel: '2 h 30',
  fenetreAnnulation: '48 h avant',
};

const houseIdentityStore = createStore<HouseIdentity>('mnd_house_identity', DEFAULT_IDENTITY);
import { bindDocument } from '../../../../shared/sync';
bindDocument(houseIdentityStore, 'mnd_house_identity'); // synchronisé Supabase (multi-appareils)
const useHouseIdentity = () => useStore(houseIdentityStore);

const FUSEAU_OPTIONS = [
  'Cotonou · GMT+1', 'Abidjan · GMT', 'Lomé · GMT', 'Dakar · GMT',
  'Lagos · GMT+1', 'Douala · GMT+1', 'Paris · GMT+2',
];
const DUREE_OPTIONS = [
  '45 min', '1 h', '1 h 30', '2 h', '2 h 30', '3 h', '3 h 30', '4 h', '4 h 30', '5 h', '6 h',
];
const ANNULATION_OPTIONS = ['24 h avant', '48 h avant', '72 h avant', 'Aucune fenêtre'];

const RITUEL_TOGGLES: ToggleRow[] = [
  { k: 'rappel', l: 'Rappels automatiques', sub: 'SMS + WhatsApp · J-1 et H-2' },
];
const NOTIF_TOGGLES: ToggleRow[] = [
  { k: 'notifRdv', l: 'Nouveau rendez-vous', sub: 'au Maître concerné' },
  { k: 'notifStock', l: 'Seuil de réassort atteint', sub: 'à l’Atelier & à l’Accueil' },
  { k: 'notifPaie', l: 'Clôture de paie', sub: 'à la matriarche' },
  { k: 'notifCercle', l: 'Nouvelle introduction du Cercle', sub: 'à toute la Maison' },
];
const ACCES_TOGGLES: ToggleRow[] = [
  { k: 'auth', l: 'Double authentification', sub: 'requise pour les Maîtres' },
  { k: 'sauvegarde', l: 'Sauvegarde quotidienne', sub: 'chiffrée · conservée 90 jours' },
  { k: 'export', l: 'Export souverain autorisé', sub: 'la Maison peut tout emporter' },
];

/* ----- Accès ERP · rôles par rubrique de domaine ----- */
const DOMAINS: { k: string; l: string }[] = [
  { k: 'pilotage', l: 'Pilotage' },
  { k: 'clients', l: 'Clients & Agenda' },
  { k: 'vente', l: 'Vente' },
  { k: 'finances', l: 'Finances' },
  { k: 'equipe', l: 'Équipe & Croissance' },
  { k: 'academie', l: 'Académie' },
  { k: 'systeme', l: 'Système' },
];
type Role = { k: string; label: string; desc: string; perms: string[] };
const ROLE_DEFS: Role[] = [
  { k: 'souverain', label: 'Souverain·e', desc: 'Accès total — la Maison entière.', perms: ['pilotage', 'clients', 'vente', 'finances', 'equipe', 'academie', 'systeme'] },
  { k: 'gerant', label: 'Gérant·e', desc: 'Pilote tout sauf l’âme système.', perms: ['pilotage', 'clients', 'vente', 'finances', 'equipe', 'academie'] },
  { k: 'maitre', label: 'Maître', desc: 'Son carnet, ses clientes, l’offre.', perms: ['pilotage', 'clients', 'vente', 'academie'] },
  { k: 'praticien', label: 'Praticien·ne', desc: 'Carnet & agenda, rien de plus.', perms: ['clients'] },
  { k: 'accueil', label: 'Accueil', desc: 'Réception, caisse, clientes.', perms: ['clients', 'vente'] },
];

/** Code d'accès stable, dérivé du rôle — même logique que le prototype. */
function accessCode(seedStr: string): string {
  const seed = (seedStr + '·mnd').split('').reduce((a, c) => a + c.charCodeAt(0) * 7, 0);
  const A = 'ACDEFGHJKLMNPQRTUVWXY3479';
  let n = seed, s = '';
  for (let i = 0; i < 8; i++) { s += A[n % A.length]; n = Math.floor(n / 3) + (i + 1) * 131; }
  return 'MND-' + s.slice(0, 4) + '-' + s.slice(4, 8);
}

function FieldRowView({ l, v }: FieldRow) {
  return (
    <div className="sys-row">
      <div className="sys-row__label">{l}</div>
      <span className="sys-row__value">{v}</span>
    </div>
  );
}

/** Ligne de réglage éditable — libellé (+ sous-titre) à gauche, contrôle à droite. */
function EditRow({ l, sub, children }: { l: string; sub?: string; children: ReactNode }) {
  return (
    <div className="sys-row">
      <div>
        <div className="sys-row__label">{l}</div>
        {sub && <div className="sys-row__sub">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

export default function Parametres() {
  const { branch, currency } = useBranch();
  const [settings, setSettings] = useSettings();
  const [services] = useServices();
  const [identity, setIdentity] = useHouseIdentity();
  const [crownStyles, setCrownStyles] = useCrownStyles();
  const [segments, setSegments] = useSegments();
  const [payMethods] = usePaymentMethods();
  const [saved, setSaved] = useState(false);
  const [sentRole, setSentRole] = useState<string | null>(null);
  const [newStyle, setNewStyle] = useState('');
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [newSeg, setNewSeg] = useState('');
  const [segEditIdx, setSegEditIdx] = useState<number | null>(null);
  const [segEditVal, setSegEditVal] = useState('');
  const [newPay, setNewPay] = useState('');
  const [payEditIdx, setPayEditIdx] = useState<number | null>(null);
  const [payEditVal, setPayEditVal] = useState('');

  const curName = currencyByCode(currency)?.name ?? currency;

  const toggle = (k: string) =>
    setSettings((s) => ({ ...s, toggles: { ...s.toggles, [k]: !s.toggles[k] } }));

  /** Écrit un champ d'identité / de rituel dans le magasin dédié (persistance immédiate). */
  const setIdent = (field: keyof HouseIdentity, val: string) =>
    setIdentity((s) => ({ ...s, [field]: val }));

  /** Acompte exigé en ligne (%) — borné 0–100, entier ; lu par Ma Couronne. */
  const setDepositPct = (raw: string) => {
    const n = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
    setSettings((s) => ({ ...s, onlineDepositPct: n }));
  };

  /** Frais de livraison à domicile (XOF) — entier ≥ 0 ; lu par Ma Couronne · Gamme. */
  const setDeliveryFee = (raw: string) => {
    const n = Math.max(0, Math.round(Number(raw) || 0));
    setSettings((s) => ({ ...s, deliveryFeeXof: n }));
  };

  /** Prestations qui exigent un acompte — bascule dans la liste des Paramètres. */
  const depositIds = settings.depositServiceIds ?? [];
  const toggleDepositService = (id: string) =>
    setSettings((s) => {
      const cur = s.depositServiceIds ?? [];
      return { ...s, depositServiceIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });

  /* ----- Styles de couronne — liste éditable (trim + dédoublonnage) ----- */
  const normalizeStyles = (list: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of list) {
      const t = s.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  };
  const addStyle = () => {
    const t = newStyle.trim();
    if (!t) return;
    setCrownStyles((prev) => normalizeStyles([...prev, t]));
    setNewStyle('');
  };
  const startRename = (idx: number, current: string) => { setEditIdx(idx); setEditVal(current); };
  const commitRename = (idx: number) => {
    const t = editVal.trim();
    if (t) setCrownStyles((prev) => normalizeStyles(prev.map((s, i) => (i === idx ? t : s))));
    setEditIdx(null);
    setEditVal('');
  };
  const removeStyle = (idx: number, name: string) => {
    if (!window.confirm(`Retirer le style « ${name} » ? Il ne sera plus proposé au CRM ni à Ma Couronne.`)) return;
    setCrownStyles((prev) => prev.filter((_, i) => i !== idx));
    if (editIdx === idx) setEditIdx(null);
  };

  /* ----- Segments de clientèle — même gestion (ajout / renommage / retrait) ----- */
  const addSeg = () => {
    const t = newSeg.trim();
    if (!t) return;
    setSegments((prev) => normalizeStyles([...prev, t]));
    setNewSeg('');
  };
  const commitSegRename = (idx: number) => {
    const t = segEditVal.trim();
    if (t) setSegments((prev) => normalizeStyles(prev.map((s, i) => (i === idx ? t : s))));
    setSegEditIdx(null);
    setSegEditVal('');
  };
  const removeSeg = (idx: number, name: string) => {
    if (!window.confirm(`Retirer le segment « ${name} » ? Il ne sera plus proposé dans le CRM (les fiches déjà taguées le gardent).`)) return;
    setSegments((prev) => prev.filter((_, i) => i !== idx));
    if (segEditIdx === idx) setSegEditIdx(null);
  };

  /* ----- Modes de paiement — même gestion (ajout / renommage / retrait) ----- */
  const addPay = () => {
    const t = newPay.trim();
    if (!t) return;
    paymentMethodsStore.set((prev) => normalizeStyles([...prev, t]));
    setNewPay('');
  };
  const commitPayRename = (idx: number) => {
    const t = payEditVal.trim();
    if (t) paymentMethodsStore.set((prev) => normalizeStyles(prev.map((s, i) => (i === idx ? t : s))));
    setPayEditIdx(null);
    setPayEditVal('');
  };
  const removePay = (idx: number, name: string) => {
    if (!window.confirm(`Retirer le mode de paiement « ${name} » ? Il ne sera plus proposé à l’encaissement (Factures & Académie).`)) return;
    paymentMethodsStore.set((prev) => prev.filter((_, i) => i !== idx));
    if (payEditIdx === idx) setPayEditIdx(null);
  };

  const setHour = (key: string, field: keyof DayHours, val: string | boolean) =>
    setSettings((s) => ({
      ...s,
      hours: s.hours.map((d) => (d.key === key ? { ...d, [field]: val } : d)),
    }));

  const setAuto = (field: keyof typeof settings.automations, val: string) =>
    setSettings((s) => ({ ...s, automations: { ...s.automations, [field]: val } }));

  const openDays = useMemo(() => settings.hours.filter((d) => !d.closed).length, [settings.hours]);

  const save = () => { setSaved(true); window.setTimeout(() => setSaved(false), 2400); };

  const ToggleRows = ({ rows }: { rows: ToggleRow[] }) => (
    <>
      {rows.map((r) => (
        <div key={r.k} className="sys-row">
          <div>
            <div className="sys-row__label">{r.l}</div>
            <div className="sys-row__sub">{r.sub}</div>
          </div>
          <Toggle on={!!settings.toggles[r.k]} onToggle={() => toggle(r.k)} />
        </div>
      ))}
    </>
  );

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Système · La Maison"
        title="Paramètres."
        sub={`${branch.name} — les règles qui cadrent chaque rendez-vous, et les accès de ceux qui servent.`}
        actions={<Button variant="copper" onClick={save}>Enregistrer</Button>}
      />

      {saved && (
        <div className="tre-inline-note" style={{ marginBottom: 16 }}>
          <span className="mark">✦</span>
          <span>Paramètres enregistrés — la Maison retient vos réglages.</span>
        </div>
      )}

      <div className="tr-grid tr-grid--2" style={{ alignItems: 'start' }}>
        <Card className="sys-section">
          <div className="sys-section__title">Identité de la Maison</div>
          <div className="sys-section__cap">Ce que la Maison montre au monde.</div>
          <EditRow l="Nom de la Maison">
            <input
              className="sys-input"
              value={identity.nom}
              onChange={(e) => setIdent('nom', e.target.value)}
              aria-label="Nom de la Maison"
            />
          </EditRow>
          <EditRow l="Raison sociale">
            <input
              className="sys-input"
              value={identity.raison}
              onChange={(e) => setIdent('raison', e.target.value)}
              aria-label="Raison sociale"
            />
          </EditRow>
          <EditRow l="Fuseau horaire">
            <select
              className="sys-select"
              value={identity.fuseau}
              onChange={(e) => setIdent('fuseau', e.target.value)}
              aria-label="Fuseau horaire"
            >
              {FUSEAU_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </EditRow>
          <FieldRowView l="Devise de référence" v={`${curName} · ${currency}`} />
        </Card>

        <Card className="sys-section">
          <div className="sys-section__title">Le rituel par défaut</div>
          <div className="sys-section__cap">Les règles qui cadrent chaque rendez-vous.</div>
          <EditRow l="Durée standard d’un rituel" sub="Le temps réservé au fauteuil par défaut.">
            <select
              className="sys-select"
              value={identity.dureeRituel}
              onChange={(e) => setIdent('dureeRituel', e.target.value)}
              aria-label="Durée standard d’un rituel"
            >
              {DUREE_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </EditRow>
          <EditRow l="Fenêtre d’annulation" sub="Délai au-delà duquel l’acompte est retenu.">
            <select
              className="sys-select"
              value={identity.fenetreAnnulation}
              onChange={(e) => setIdent('fenetreAnnulation', e.target.value)}
              aria-label="Fenêtre d’annulation"
            >
              {ANNULATION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </EditRow>
          <div className="sys-row">
            <div>
              <div className="sys-row__label">Acompte exigé en ligne (%)</div>
              <div className="sys-row__sub">Ce que la cliente règle à la réservation sur Ma Couronne.</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                className="sys-select"
                type="number"
                min={0}
                max={100}
                step={1}
                value={settings.onlineDepositPct}
                onChange={(e) => setDepositPct(e.target.value)}
                style={{ width: 78, textAlign: 'right', fontFamily: 'var(--font-serif)' }}
                aria-label="Acompte exigé en ligne en pourcentage"
              />
              <span className="sys-row__value">%</span>
            </div>
          </div>
          <div className="sys-row" style={{ display: 'block' }}>
            <div style={{ marginBottom: 8 }}>
              <div className="sys-row__label">Prestations exigeant un acompte</div>
              <div className="sys-row__sub">
                Seules les prestations sélectionnées demandent l’acompte (au taux ci-dessus), au Trône
                comme sur Ma Couronne. Aucune sélectionnée = aucun acompte, confirmation directe.
              </div>
            </div>
            {services.length === 0 ? (
              <div className="sys-row__sub">Aucune prestation au catalogue.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {services.map((sv) => {
                  const on = depositIds.includes(sv.id);
                  return (
                    <button
                      key={sv.id}
                      type="button"
                      onClick={() => toggleDepositService(sv.id)}
                      style={{
                        border: `1px solid ${on ? 'var(--color-copper)' : 'var(--hairline)'}`,
                        borderRadius: 3,
                        padding: '7px 12px',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                        background: on ? 'var(--color-copper)' : 'var(--surface-card)',
                        color: on ? 'var(--color-ivoire)' : 'var(--ink)',
                      }}
                    >
                      {sv.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="sys-row">
            <div>
              <div className="sys-row__label">Frais de livraison à domicile</div>
              <div className="sys-row__sub">Ajoutés en ligne à la commande produits sur Ma Couronne. 0 = livraison offerte.</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                className="sys-select"
                type="number"
                min={0}
                step={500}
                value={settings.deliveryFeeXof}
                onChange={(e) => setDeliveryFee(e.target.value)}
                style={{ width: 96, textAlign: 'right', fontFamily: 'var(--font-serif)' }}
                aria-label="Frais de livraison à domicile en francs CFA"
              />
              <span className="sys-row__value">F</span>
            </div>
          </div>
          <ToggleRows rows={RITUEL_TOGGLES} />
        </Card>

        <Card className="sys-section">
          <div className="sys-section__title">Notifications</div>
          <div className="sys-section__cap">Qui est prévenu, et quand.</div>
          <ToggleRows rows={NOTIF_TOGGLES} />
        </Card>

        <Card className="sys-section">
          <div className="sys-section__title">Accès & souveraineté</div>
          <div className="sys-section__cap">La Maison reste maîtresse de ses données.</div>
          <ToggleRows rows={ACCES_TOGGLES} />
          <FieldRowView l="Hébergement des données" v="Souverain · Afrique de l’Ouest" />
        </Card>
      </div>

      {/* ---------- Jours & heures d'ouverture ---------- */}
      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
          <div>
            <div className="sys-section__title">Jours & heures d’ouverture</div>
            <div className="sys-section__cap">Le salon n’accepte des rendez-vous que pendant ces plages.</div>
          </div>
          <span className="sys-badge-count">{openDays} / 7 jours</span>
        </div>
        {settings.hours.map((d) => (
          <div key={d.key} className="sys-day" style={{ opacity: d.closed ? 0.6 : 1 }}>
            <div className="sys-day__name">{d.label}</div>
            <Toggle
              on={!d.closed}
              onToggle={() => setHour(d.key, 'closed', !d.closed)}
              label={d.closed ? 'Fermé' : 'Ouvert'}
            />
            {d.closed ? (
              <div className="sys-day__closed">Fermé ce jour</div>
            ) : (
              <div className="sys-day__hours">
                <select className="sys-select" value={d.open} onChange={(e) => setHour(d.key, 'open', e.target.value)}>
                  {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>→</span>
                <select className="sys-select" value={d.close} onChange={(e) => setHour(d.key, 'close', e.target.value)}>
                  {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            )}
          </div>
        ))}
      </Card>

      {/* ---------- Catalogue · styles de couronne ---------- */}
      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
          <div>
            <div className="sys-section__title">Catalogue · styles de couronne</div>
            <div className="sys-section__cap">
              La liste des styles proposée partout — fiches CRM et Ma Couronne. Ajoutez, renommez, retirez ;
              les changements se propagent aussitôt.
            </div>
          </div>
          <span className="sys-badge-count">{crownStyles.length} style{crownStyles.length > 1 ? 's' : ''}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {crownStyles.map((s, i) => (
            <div key={`${s}-${i}`} className="sys-row sys-row--items">
              {editIdx === i ? (
                <>
                  <input
                    className="sys-select"
                    value={editVal}
                    autoFocus
                    onChange={(e) => setEditVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(i); if (e.key === 'Escape') setEditIdx(null); }}
                    style={{ flex: 1, marginRight: 12 }}
                    aria-label="Renommer le style"
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="copper" onClick={() => commitRename(i)}>Valider</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditIdx(null)}>Annuler</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="sys-row__label" style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{s}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="ghost" onClick={() => startRename(i, s)}>Renommer</Button>
                    <Button size="sm" variant="ghost" style={{ color: 'var(--copper-700)' }} onClick={() => removeStyle(i, s)}>Retirer</Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {crownStyles.length === 0 && (
            <div className="sys-row" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-soft)' }}>
              Aucun style pour l’instant — ajoutez le premier ci-dessous.
            </div>
          )}
        </div>

        <div className="sys-additem" style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Input
            value={newStyle}
            onChange={(e) => setNewStyle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addStyle(); }}
            placeholder="Nouveau style — ex. Microlocks"
            style={{ flex: 1 }}
          />
          <Button variant="copper" onClick={addStyle} disabled={!newStyle.trim()}>Ajouter</Button>
        </div>
      </Card>

      {/* ---------- CRM · segments de clientèle ---------- */}
      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
          <div>
            <div className="sys-section__title">CRM · segments de clientèle</div>
            <div className="sys-section__cap">
              Les segments proposés dans les fiches clientes (VIP, Prospect, Cercle…). Ajoutez, renommez, retirez ;
              une fiche déjà taguée conserve ses segments même s’ils sont retirés d’ici.
            </div>
          </div>
          <span className="sys-badge-count">{segments.length} segment{segments.length > 1 ? 's' : ''}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {segments.map((s, i) => (
            <div key={`${s}-${i}`} className="sys-row sys-row--items">
              {segEditIdx === i ? (
                <>
                  <input
                    className="sys-select"
                    value={segEditVal}
                    autoFocus
                    onChange={(e) => setSegEditVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitSegRename(i); if (e.key === 'Escape') setSegEditIdx(null); }}
                    style={{ flex: 1, marginRight: 12 }}
                    aria-label="Renommer le segment"
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="copper" onClick={() => commitSegRename(i)}>Valider</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSegEditIdx(null)}>Annuler</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="sys-row__label" style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{s}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="ghost" onClick={() => { setSegEditIdx(i); setSegEditVal(s); }}>Renommer</Button>
                    <Button size="sm" variant="ghost" style={{ color: 'var(--copper-700)' }} onClick={() => removeSeg(i, s)}>Retirer</Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {segments.length === 0 && (
            <div className="sys-row" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-soft)' }}>
              Aucun segment — ajoutez le premier ci-dessous.
            </div>
          )}
        </div>

        <div className="sys-additem" style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Input
            value={newSeg}
            onChange={(e) => setNewSeg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addSeg(); }}
            placeholder="Nouveau segment — ex. Fidèle"
            style={{ flex: 1 }}
          />
          <Button variant="copper" onClick={addSeg} disabled={!newSeg.trim()}>Ajouter</Button>
        </div>
      </Card>

      {/* ---------- Encaissement · modes de paiement ---------- */}
      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
          <div>
            <div className="sys-section__title">Encaissement · modes de paiement</div>
            <div className="sys-section__cap">
              Les moyens de règlement proposés à l’encaissement — Factures &amp; Académie. Ajoutez, renommez, retirez ;
              les changements se propagent aussitôt.
            </div>
          </div>
          <span className="sys-badge-count">{payMethods.length} mode{payMethods.length > 1 ? 's' : ''}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {payMethods.map((s, i) => (
            <div key={`${s}-${i}`} className="sys-row sys-row--items">
              {payEditIdx === i ? (
                <>
                  <input
                    className="sys-select"
                    value={payEditVal}
                    autoFocus
                    onChange={(e) => setPayEditVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitPayRename(i); if (e.key === 'Escape') setPayEditIdx(null); }}
                    style={{ flex: 1, marginRight: 12 }}
                    aria-label="Renommer le mode de paiement"
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="copper" onClick={() => commitPayRename(i)}>Valider</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPayEditIdx(null)}>Annuler</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="sys-row__label" style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{s}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="ghost" onClick={() => { setPayEditIdx(i); setPayEditVal(s); }}>Renommer</Button>
                    <Button size="sm" variant="ghost" style={{ color: 'var(--copper-700)' }} onClick={() => removePay(i, s)}>Retirer</Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {payMethods.length === 0 && (
            <div className="sys-row" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-soft)' }}>
              Aucun mode de paiement — ajoutez le premier ci-dessous.
            </div>
          )}
        </div>

        <div className="sys-additem" style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Input
            value={newPay}
            onChange={(e) => setNewPay(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addPay(); }}
            placeholder="Nouveau mode — ex. Orange Money"
            style={{ flex: 1 }}
          />
          <Button variant="copper" onClick={addPay} disabled={!newPay.trim()}>Ajouter</Button>
        </div>
      </Card>

      {/* ---------- Accès ERP · rôles & codes ---------- */}
      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div className="sys-section__title">Accès ERP du personnel</div>
        <div className="sys-section__cap">
          Chaque rôle ouvre certaines rubriques de domaine. Envoyez à un membre son code d’accès —
          il rejoint le Trône avec exactement les droits de son rang, rien de plus.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          {ROLE_DEFS.map((role) => {
            const code = accessCode(role.k);
            return (
              <div key={role.k} style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}>{role.label}</div>
                    <div className="sys-row__sub">{role.desc}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="sys-code">{code}</span>
                    <Button size="sm" variant="ghost" onClick={() => { setSentRole(role.k); window.setTimeout(() => setSentRole((c) => (c === role.k ? null : c)), 2400); }}>
                      Envoyer le code
                    </Button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {DOMAINS.map((dom) => {
                    const on = role.perms.includes(dom.k);
                    return (
                      <span key={dom.k} className={`tre-chip ${on ? 'is-on' : ''}`} style={{ cursor: 'default', opacity: on ? 1 : 0.55 }}>
                        {dom.l}
                      </span>
                    );
                  })}
                </div>
                {sentRole === role.k && (
                  <div className="sys-row__sub" style={{ color: 'var(--copper-700)', marginTop: 8 }}>
                    Code {code} envoyé par WhatsApp au futur {role.label}.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ---------- Automatisations · IA ---------- */}
      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div className="sys-section__title">Automatisations · informations pour l’IA</div>
        <div className="sys-section__cap" style={{ maxWidth: 640 }}>
          Renseignez les liens et le texte utilisés par les messages automatiques (rappels, relances,
          invitations). Le Trône les insère tels quels dans les envois WhatsApp et SMS.
        </div>
        <div className="tr-grid tr-grid--2" style={{ marginTop: 8 }}>
          <label className="mnd-field">
            <span className="mnd-field__label">Lien de paiement Mobile Money</span>
            <Input value={settings.automations.momoLink} onChange={(e) => setAuto('momoLink', e.target.value)} placeholder="https://pay.moov-africa.bj/…" />
          </label>
          <label className="mnd-field">
            <span className="mnd-field__label">Lien Google Maps (itinéraire)</span>
            <Input value={settings.automations.mapsLink} onChange={(e) => setAuto('mapsLink', e.target.value)} placeholder="https://maps.google.com/?q=…" />
          </label>
          <label className="mnd-field" style={{ gridColumn: '1 / -1' }}>
            <span className="mnd-field__label">Lien Google Avis</span>
            <Input value={settings.automations.reviewLink} onChange={(e) => setAuto('reviewLink', e.target.value)} placeholder="https://g.page/r/…/review" />
          </label>
          <label className="mnd-field" style={{ gridColumn: '1 / -1' }}>
            <span className="mnd-field__label">Itinéraire · texte libre</span>
            <Textarea rows={2} value={settings.automations.itineraire} onChange={(e) => setAuto('itineraire', e.target.value)} placeholder="Ex. En face de la pharmacie Fifadji, portail vert, 2ᵉ étage." />
          </label>
        </div>
        <div style={{ marginTop: 4 }}>
          <Eyebrow>Insérés tels quels dans chaque envoi automatique</Eyebrow>
        </div>
      </Card>
    </div>
  );
}
