import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal, Seal, Select } from '../../../../ds/components';
import { branchesStore, useBranch, type Branch } from '../../../../shared/branches';
import { COUNTRIES, CURRENCIES } from '../../../../shared/geo';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import './systeme.css';

/* Système · Branches — création complète (pays présélectionnables → indicatif +
   devise préchargés, toutes devises, sièges, maîtres, statut, logo + pictogramme).
   La branche choisie devient la branche active : elle recharge clients, finances,
   analytics et devises partout (via currentBranchStore). */

type SealColor = 'indigo' | 'copper' | 'ivoire' | 'obsidian' | 'or';
const SEAL_SET: SealColor[] = ['indigo', 'copper', 'ivoire', 'obsidian', 'or'];
const asSeal = (s?: string | null): SealColor => (SEAL_SET.includes((s ?? '') as SealColor) ? (s as SealColor) : 'copper');

const LOGO_OPTS: { k: SealColor; l: string }[] = [
  { k: 'copper', l: 'Cuivre' }, { k: 'indigo', l: 'Indigo' }, { k: 'or', l: 'Or' },
  { k: 'ivoire', l: 'Ivoire' }, { k: 'obsidian', l: 'Obsidienne' },
];
const PICTO_OPTS = ['◈', '❖', '▦', '⌂', '✦', '◍', '⬗', '⬣'];

/** Recette indicative du jour (démo) — base XOF, formatée dans la devise de la branche. */
const dailyXof = (b: Branch) => (b.status === 'active' ? b.seats * 68000 : 0);
const occupancy = (b: Branch) => (b.status === 'active' ? Math.min(96, 52 + b.seats * 6) : 0);

type BranchForm = {
  name: string;
  address: string;
  country: string;
  dial: string;
  phone: string;
  currency: string;
  logo: SealColor;
  pictogram: string;
  masters: number;
  seats: number;
  status: Branch['status'];
  curTouched: boolean;
};

const emptyForm = (): BranchForm => ({
  name: '', address: '', country: 'Bénin', dial: '+229', phone: '+229 ', currency: 'XOF',
  logo: 'copper', pictogram: '◈', masters: 3, seats: 4, status: 'paused', curTouched: false,
});

/** Ajuste la liste des maîtres à la taille voulue en préservant les noms existants. */
function reconcileMasters(existing: string[], count: number): string[] {
  const out = existing.slice(0, count);
  for (let i = out.length; i < count; i++) out.push(`Maître ${i + 1}`);
  return out;
}

export default function Branches() {
  const { branch, branches, setBranch } = useBranch();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<BranchForm>(emptyForm);

  const totals = useMemo(() => {
    const masters = branches.reduce((a, b) => a + b.masters.length, 0);
    const seats = branches.reduce((a, b) => a + b.seats, 0);
    const jourXof = branches.reduce((a, b) => a + dailyXof(b), 0);
    return { masters, seats, jourXof };
  }, [branches]);

  const patch = (p: Partial<BranchForm>) => setForm((f) => ({ ...f, ...p }));

  const onCountry = (name: string) => {
    const row = COUNTRIES.find((c) => c.name === name);
    if (!row) { patch({ country: name }); return; }
    const phoneEmpty = !form.phone || /^\+[0-9]*\s*$/.test(form.phone);
    patch({
      country: name,
      dial: row.dial,
      currency: form.curTouched ? form.currency : row.currency,
      phone: phoneEmpty ? row.dial + ' ' : form.phone,
    });
  };

  const openNew = () => { setEditId(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (b: Branch) => {
    setEditId(b.id);
    setForm({
      name: b.name, address: b.address, country: b.country, dial: b.dial,
      phone: b.phone ?? `${b.dial} `, currency: b.currency, logo: asSeal(b.logo),
      pictogram: b.pictogram ?? '◈', masters: b.masters.length || 1, seats: b.seats,
      status: b.status, curTouched: true,
    });
    setOpen(true);
  };

  const save = () => {
    if (!form.name.trim() || !form.address.trim()) return;
    const city = form.name.split('·')[0].trim() || form.address.split(',')[0].trim() || form.name.trim();
    if (editId) {
      branchesStore.set((prev) => prev.map((b) => (b.id === editId ? {
        ...b, name: form.name.trim(), city, address: form.address.trim(), country: form.country,
        dial: form.dial, phone: form.phone.trim(), currency: form.currency, logo: form.logo,
        pictogram: form.pictogram, seats: form.seats, masters: reconcileMasters(b.masters, form.masters),
        status: form.status,
      } : b)));
    } else {
      const nb: Branch = {
        id: `br-${uid()}`, name: form.name.trim(), city, country: form.country, dial: form.dial,
        phone: form.phone.trim(), currency: form.currency, address: form.address.trim(),
        seats: form.seats, masters: reconcileMasters([], form.masters), status: form.status,
        logo: form.logo, pictogram: form.pictogram,
      };
      branchesStore.set((prev) => [...prev, nb]);
    }
    setOpen(false);
  };

  const remove = (id: string) => {
    if (branches.length <= 1) return;
    branchesStore.set((prev) => prev.filter((b) => b.id !== id));
    if (branch.id === id) {
      const next = branches.find((b) => b.id !== id);
      if (next) setBranch(next.id);
    }
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Système · Le territoire"
        title="Branches."
        sub="Chaque branche reste souveraine de son carnet et de sa caisse — le Trône consolide, il ne dilue jamais."
        actions={<Button variant="copper" onClick={openNew}>+ Ajouter une branche</Button>}
      />

      <div className="sys-summary">
        <div>
          <div className="sys-summary__num">{branches.length}</div>
          <div className="sys-summary__label">branches</div>
        </div>
        <div className="sys-summary__sep" />
        <div>
          <div className="sys-summary__num">{totals.masters}</div>
          <div className="sys-summary__label">au fauteuil</div>
        </div>
        <div className="sys-summary__sep" />
        <div>
          <div className="sys-summary__num">{totals.seats}</div>
          <div className="sys-summary__label">fauteuils en service</div>
        </div>
        <div className="sys-summary__sep" />
        <div>
          <div className="sys-summary__num" style={{ color: 'var(--color-copper)' }}>{fmtMoney(totals.jourXof, branch.currency)}</div>
          <div className="sys-summary__label">aujourd’hui · consolidé</div>
        </div>
      </div>

      <div className="tr-grid tr-grid--3" style={{ alignItems: 'start' }}>
        {branches.map((b) => {
          const active = b.id === branch.id;
          return (
            <div key={b.id} className={`sys-branch ${active ? 'is-active' : ''}`} onClick={() => setBranch(b.id)}>
              {b.flagship && <div className="sys-branch__corner" aria-hidden="true" />}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span className="sys-branch__seal"><Seal color={asSeal(b.logo)} size={30} /></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span style={{ fontSize: 14, color: 'var(--color-copper)', flex: 'none' }}>{b.pictogram ?? '◈'}</span>
                    <span style={{ fontSize: 9.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--copper-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.flagship ? 'Siège · Maison mère' : 'Branche'}
                    </span>
                  </span>
                </div>
                <span className={`tre-pill ${b.status === 'active' ? 'tre-pill--ok' : 'tre-pill--warn'}`}>
                  {b.status === 'active' ? 'Ouverte' : 'En ouverture'}
                </span>
              </div>

              <div className="sys-branch__name">{b.name}</div>
              <div className="sys-branch__addr">{b.address}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 11, color: 'var(--ink-soft)' }}>
                <span>{b.country}</span><span style={{ color: 'var(--hairline)' }}>·</span><span>{b.phone ?? b.dial}</span>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 16, fontSize: 12, color: 'var(--ink)', alignItems: 'center', flexWrap: 'wrap' }}>
                <span>{b.masters.length} Maître{b.masters.length > 1 ? 's' : ''}</span>
                <span style={{ color: 'var(--hairline)' }}>·</span>
                <span>{b.seats} fauteuils</span>
                <span style={{ color: 'var(--hairline)' }}>·</span>
                <span style={{ fontSize: 10, letterSpacing: '.06em', color: 'var(--copper-700)', background: 'var(--copper-50)', borderRadius: 3, padding: '2px 7px' }}>{b.currency}</span>
              </div>

              <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Recette indicative · jour</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}>{dailyXof(b) ? fmtMoney(dailyXof(b), b.currency) : '—'}</span>
              </div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="tre-bar"><span className="tre-bar__fill" style={{ width: `${occupancy(b)}%`, background: 'var(--color-copper)' }} /></span>
                <span style={{ fontSize: 11, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{occupancy(b)} %</span>
              </div>

              <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="tre-link-btn" onClick={(e) => { e.stopPropagation(); openEdit(b); }}>Modifier</button>
                {!b.flagship && branches.length > 1 && (
                  <button className="tre-link-btn tre-link-btn--danger" style={{ marginLeft: 6 }} onClick={(e) => { e.stopPropagation(); remove(b.id); }}>Retirer</button>
                )}
              </div>

              {active && (
                <div style={{ marginTop: 14, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-700)', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 5, height: 5, background: 'var(--color-copper)', transform: 'rotate(45deg)' }} />
                  Branche active · au pilotage
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mnd-muted" style={{ marginTop: 22, fontSize: 11.5, maxWidth: 560, lineHeight: 1.6 }}>
        Choisir une branche recharge partout clients, finances, analytics et devises — la branche active impose sa devise sur tous les montants du Trône.
      </div>

      {open && (
        <Modal title={editId ? 'Modifier la branche.' : 'Nouvelle branche.'} onClose={() => setOpen(false)} width={600}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nom de la branche">
              <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Ex. Porto-Novo · La Résidence" />
            </Field>
            <Field label="Adresse">
              <Input value={form.address} onChange={(e) => patch({ address: e.target.value })} placeholder="Quartier, ville" />
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Pays">
                <Select value={form.country} onChange={(e) => onCountry(e.target.value)}>
                  {COUNTRIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Numéro de téléphone">
                <Input value={form.phone} onChange={(e) => patch({ phone: e.target.value })} inputMode="tel" placeholder="+229 01 00 00 00 00" />
              </Field>
            </div>
            <Field label="Devise de la branche">
              <Select value={form.currency} onChange={(e) => patch({ currency: e.target.value, curTouched: true })}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
              </Select>
            </Field>

            <div className="tr-grid tr-grid--2">
              <Field label="Maîtres au fauteuil">
                <div className="sys-stepper">
                  <button className="sys-stepper__btn" type="button" onClick={() => patch({ masters: Math.max(1, form.masters - 1) })}>−</button>
                  <span className="sys-stepper__val">{form.masters}</span>
                  <button className="sys-stepper__btn" type="button" onClick={() => patch({ masters: form.masters + 1 })}>+</button>
                </div>
              </Field>
              <Field label="Fauteuils">
                <div className="sys-stepper">
                  <button className="sys-stepper__btn" type="button" onClick={() => patch({ seats: Math.max(1, form.seats - 1) })}>−</button>
                  <span className="sys-stepper__val">{form.seats}</span>
                  <button className="sys-stepper__btn" type="button" onClick={() => patch({ seats: form.seats + 1 })}>+</button>
                </div>
              </Field>
            </div>

            <Field label="Logo de la branche">
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                {LOGO_OPTS.map((l) => (
                  <button
                    key={l.k}
                    type="button"
                    onClick={() => patch({ logo: l.k })}
                    title={l.l}
                    style={{
                      cursor: 'pointer', width: 50, height: 50, borderRadius: 6,
                      border: `1px solid ${form.logo === l.k ? 'var(--color-copper)' : 'var(--hairline)'}`,
                      boxShadow: form.logo === l.k ? '0 0 0 1px var(--color-copper) inset' : undefined,
                      background: 'var(--surface-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}
                  >
                    <Seal color={l.k} size={32} />
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Pictogramme">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {PICTO_OPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => patch({ pictogram: p })}
                    style={{
                      cursor: 'pointer', width: 40, height: 40, borderRadius: 6, fontSize: 18,
                      border: `1px solid ${form.pictogram === p ? 'var(--color-copper)' : 'var(--hairline)'}`,
                      background: form.pictogram === p ? 'var(--copper-50)' : 'var(--surface-card)',
                      color: form.pictogram === p ? 'var(--copper-700)' : 'var(--ink)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Statut à l’ouverture">
              <div style={{ display: 'flex', gap: 8 }}>
                {([['paused', 'En ouverture'], ['active', 'Ouverte']] as const).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    className={`tre-chip ${form.status === k ? 'is-on' : ''}`}
                    style={{ flex: 1, padding: 11 }}
                    onClick={() => patch({ status: k })}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={save} disabled={!form.name.trim() || !form.address.trim()}>
                {editId ? 'Enregistrer la branche' : 'Ajouter au territoire'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
