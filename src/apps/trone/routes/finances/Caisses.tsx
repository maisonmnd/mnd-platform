import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eyebrow, Modal } from '../../../../ds/components';
import { fmtIn, fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { CURRENCIES } from '../../../../shared/geo';
import {
  useCashboxes, useInvoices, useTransferts, cashboxCurrency,
  type Cashbox,
} from '../../../../shared/finance';
import { useCoffre, useCredits } from '../../../../shared/finance';
import { todayISO, monthKey, monthLabel, MonthNav } from './_shared';
import { useCaisses, ReleveCaisse } from './tiroirs';
import './finances.css';

/* ── LES CAISSES · L'ÉCRAN — 22 août 2026 ───────────────────────────
   « Est-ce que je ne devrais pas avoir un bouton revenu tout comme j'ai un
   bouton dépenses ? Et créer mes caisses depuis ces caisses revenus ? »

   L'instinct était juste, mais pas sur le mot. L'écran des revenus existe :
   c'est Encaissements — et il ne faut PAS l'appeler « Revenus », parce qu'il
   mesure la trésorerie (ce qui est entré) quand la Synthèse mesure le chiffre
   d'affaires (ce qui a été gagné). Les deux diffèrent légitimement : un
   pourboire entre au tiroir sans être du revenu, un avoir est du revenu sans
   être des billets. Les nommer pareil ferait croire à une erreur chaque fois
   qu'ils ne coïncident pas.

   CE QUI ÉTAIT VRAIMENT MAL RANGÉ, ce sont les caisses. Elles vivaient sous
   « Dépenses » par accident d'histoire. Or une caisse n'appartient pas aux
   dépenses : c'est le tiroir par lequel TOUT passe — ce qui entre comme ce
   qui sort. Elle a donc son écran, et Dépenses comme Encaissements y
   renvoient. Les calculs, eux, restent à une seule source (`useCaisses`). */

type BoxForm = { name: string; sub: string; glyph: string; opening: string; currency: string };
const GLYPHS = ['◈', '❖', '✦', '❈', '◆', '✧', '⬡', '❉'];

export default function Caisses() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(monthKey(todayISO()));
  const monthName = monthLabel(month);
  const isCurrent = month === monthKey(todayISO());

  const { branch, currency, branchBoxes, boxBalance, boxMonthFlux, treasury } = useCaisses(month);
  const [, setCashboxes] = useCashboxes();
  const [invoices, setInvoices] = useInvoices();
  const [transferts, setTransferts] = useTransferts();
  const [, setCoffre] = useCoffre();
  const [, setCreditMvts] = useCredits();

  const [boxDrill, setBoxDrill] = useState<string | null>(null);

  /* ── Créer, renommer, retirer une caisse ── */
  const [boxOpen, setBoxOpen] = useState(false);
  const [boxEditingId, setBoxEditingId] = useState<string | null>(null);
  const [boxForm, setBoxForm] = useState<BoxForm>({ name: '', sub: '', glyph: '◈', opening: '', currency: '' });

  const openNewBox = () => {
    setBoxEditingId(null);
    setBoxForm({ name: '', sub: '', glyph: '◈', opening: '', currency: '' });
    setBoxOpen(true);
  };
  const openEditBox = (c: Cashbox) => {
    setBoxEditingId(c.id);
    setBoxForm({ name: c.name, sub: c.sub, glyph: c.glyph, opening: String(c.openingXof || ''), currency: c.currency ?? '' });
    setBoxOpen(true);
  };

  const saveBox = () => {
    const name = boxForm.name.trim();
    if (!name) return;
    const sub = boxForm.sub.trim() || 'Caisse';
    const glyph = boxForm.glyph.trim() || '◈';
    const opening = parseInt(boxForm.opening || '0', 10) || 0;
    if (boxEditingId) {
      const prevBox = branchBoxes.find((b) => b.id === boxEditingId);
      const oldName = prevBox?.name;
      setCashboxes((prev) => prev.map((b) => (b.id === boxEditingId
        ? { ...b, name, sub, glyph, openingXof: opening, currency: boxForm.currency || undefined }
        : b)));
      if (oldName && oldName !== name) {
        /* RENOMMER N'ORPHELINE PERSONNE — 21 août 2026. Le nom EST la clé : il
           n'y a pas d'identifiant partagé entre une caisse et ses écritures.
           Tout ce qui la nomme doit suivre, le JOURNAL DES VERSEMENTS compris —
           c'est lui, et lui seul, que le solde interroge. */
        setInvoices((prev) => prev.map((i) => {
          const piece = i.cashbox === oldName;
          const journal = (i.payments ?? []).some((p) => p.cashbox === oldName);
          if (!piece && !journal) return i;
          return {
            ...i,
            ...(piece ? { cashbox: name } : {}),
            ...(journal ? { payments: i.payments!.map((p) => (p.cashbox === oldName ? { ...p, cashbox: name } : p)) } : {}),
          };
        }));
        setCoffre((prev) => prev.map((m) => (m.cashbox === oldName ? { ...m, cashbox: name } : m)));
        setCreditMvts((prev) => prev.map((m) => (m.cashbox === oldName ? { ...m, cashbox: name } : m)));
        setTransferts((prev) => prev.map((t) => ({
          ...t,
          de: t.de === oldName ? name : t.de,
          vers: t.vers === oldName ? name : t.vers,
        })));
      }
    } else {
      setCashboxes((prev) => [...prev, {
        id: uid(), branchId: branch.id, name, sub, glyph,
        openingXof: opening, currency: boxForm.currency || undefined,
      }]);
    }
    setBoxOpen(false);
  };

  const deleteBox = (c: Cashbox) => {
    if (!window.confirm(
      `Retirer la caisse « ${c.name} » ? Les écritures qui la nomment ne sont PAS supprimées — `
      + 'elles resteront rattachées à un tiroir qui n’existe plus.',
    )) return;
    setCashboxes((prev) => prev.filter((b) => b.id !== c.id));
  };

  /* ── Le transfert entre caisses ── */
  const [trOuvert, setTrOuvert] = useState(false);
  const [fTr, setFTr] = useState({ de: '', vers: '', montant: '', recu: '', note: '', date: todayISO() });
  const caisseDe = branchBoxes.find((c) => c.name === fTr.de);
  const caisseVers = branchBoxes.find((c) => c.name === fTr.vers);
  const deviseDe = caisseDe ? cashboxCurrency(caisseDe) : currency;
  const deviseVers = caisseVers ? cashboxCurrency(caisseVers) : currency;
  const changeDeDevise = !!caisseDe && !!caisseVers && deviseDe !== deviseVers;

  const enregistrerTransfert = () => {
    const montant = parseInt(fTr.montant.replace(/[^0-9]/g, ''), 10) || 0;
    const recu = parseInt(fTr.recu.replace(/[^0-9]/g, ''), 10) || 0;
    if (!fTr.de || !fTr.vers || fTr.de === fTr.vers || montant <= 0) return;
    if (changeDeDevise && recu <= 0) return;
    setTransferts((prev) => [...prev, {
      id: `trf-${uid()}`, branchId: branch.id, date: fTr.date || todayISO(),
      de: fTr.de, vers: fTr.vers, amountXof: montant,
      recuXof: changeDeDevise ? recu : undefined,
      note: fTr.note.trim() || undefined,
    }]);
    setTrOuvert(false);
    setFTr((f) => ({ ...f, montant: '', recu: '', note: '' }));
  };

  const transfertsDuMois = transferts
    .filter((t) => t.branchId === branch.id && monthKey(t.date) === month)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="mnd-rise">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>Finances · les tiroirs de la Maison</Eyebrow>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 38, color: 'var(--color-indigo)', margin: '6px 0 0', lineHeight: 1 }}>Les caisses.</h2>
        </div>
        <button
          className="trf-act"
          style={{ background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)', padding: '12px 18px' }}
          onClick={openNewBox}
        >
          + Nouvelle caisse
        </button>
      </div>

      <div className="trf-toolbar">
        <MonthNav month={month} onChange={setMonth} />
      </div>

      <div className="trf-obsidian" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="trf-obsidian__eyebrow">Trésorerie disponible · toutes caisses · {isCurrent ? 'à ce jour' : `fin ${monthName}`}</div>
          <div className="trf-obsidian__value">{fmtMoney(treasury, currency)}</div>
          {/* LES DEVISES NE S'ADDITIONNENT PAS : la trésorerie ne somme que les
              caisses de la Maison. Un tiroir en euros dit son total chez lui. */}
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--indigo-100)', marginTop: 6 }}>
            Les caisses en devise ne s’y ajoutent pas — deux monnaies ne font pas un total.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flex: 'none', flexWrap: 'wrap' }}>
          {branchBoxes.length > 1 && (
            <button className="trf-act" style={{ color: 'var(--color-ivoire)', borderColor: 'var(--hairline-invert)', padding: '12px 16px' }} onClick={() => setTrOuvert(true)}>⇄ Transférer</button>
          )}
          <button className="trf-act" style={{ color: 'var(--color-ivoire)', borderColor: 'var(--hairline-invert)', padding: '12px 16px' }} onClick={() => navigate('/encaissements')}>Les encaissements →</button>
          <button className="trf-act" style={{ background: 'var(--color-copper)', color: 'var(--color-ivoire)', borderColor: 'var(--color-copper)', padding: '12px 16px' }} onClick={() => navigate('/depenses')}>Les dépenses →</button>
        </div>
      </div>

      {branchBoxes.length === 0 ? (
        <div className="trf-empty" style={{ textAlign: 'left', lineHeight: 1.7, padding: 24 }}>
          <b style={{ color: 'var(--color-indigo)', fontWeight: 500 }}>Aucune caisse déclarée.</b><br />
          Une caisse est un tiroir réel : le comptoir, un compte Mobile Money, une enveloppe en
          devise. Tout ce qui entre et tout ce qui sort passe par l’une d’elles — et c’est ce qui
          permet de dire, à tout moment, ce que la Maison a sous la main.
        </div>
      ) : (
        <div className="tr-grid tr-grid--3">
          {branchBoxes.map((c) => {
            const bal = boxBalance(c.name);
            const boxCur = cashboxCurrency(c);
            const low = boxCur === currency && bal < 100000;
            const { inn, out } = boxMonthFlux(c.name);
            return (
              <div className="trf-caisse" key={c.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                    <span className="trf-caisse__glyph">{c.glyph}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="trf-caisse__name">{c.name}</div>
                      <div className="trf-caisse__sub">{c.sub}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 5, flex: 'none' }}>
                    <button className="trf-iconbtn" title="Modifier la caisse" onClick={() => openEditBox(c)}>Modifier</button>
                    <button className="trf-iconbtn trf-iconbtn--danger" title="Retirer la caisse" onClick={() => deleteBox(c)}>Retirer</button>
                  </div>
                </div>
                <button className="trf-caisse__open" onClick={() => setBoxDrill(c.name)} title="Voir les mouvements de cette caisse">
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                    Solde · {isCurrent ? 'à ce jour' : `fin ${monthName}`}{boxCur !== currency ? ` · ${boxCur}` : ''}
                  </div>
                  <div className="trf-caisse__bal" style={{ color: low ? 'var(--trf-warning)' : 'var(--color-indigo)' }}>{fmtIn(bal, boxCur)}</div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, marginTop: 4, display: 'flex', gap: 10, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ color: 'var(--trf-success)' }}>+ {fmtIn(inn, boxCur)}</span>
                    <span style={{ color: 'var(--color-copper)' }}>− {fmtIn(out, boxCur)}</span>
                    <span style={{ color: 'var(--ink-soft)' }}>en {monthName}</span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {transfertsDuMois.length > 0 && (
        <div className="trf-panel" style={{ marginTop: 18 }}>
          <div className="trf-panel__title">Transferts · {monthName}</div>
          {transfertsDuMois.map((t) => (
            <div className="trf-linerow trf-linerow--split" key={t.id}>
              <span>
                {t.de} <span className="mnd-muted">→</span> {t.vers}
                {t.note ? <span className="mnd-muted"> · {t.note}</span> : null}
              </span>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>
                {fmtMoney(t.amountXof, currency)}
                {t.recuXof != null && t.recuXof !== t.amountXof ? ` → ${t.recuXof}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {boxDrill && (
        <ReleveCaisse nom={boxDrill} month={month} onClose={() => setBoxDrill(null)} />
      )}

      {boxOpen && (
        <Modal title={boxEditingId ? 'Modifier la caisse' : 'Nouvelle caisse'} onClose={() => setBoxOpen(false)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label className="mnd-field">
              <span className="mnd-field__label">Nom de la caisse</span>
              <input className="mnd-input" value={boxForm.name} placeholder="Caisse Principale · Tiroir EUR…" onChange={(e) => setBoxForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="mnd-field">
              <span className="mnd-field__label">Ce qu’elle est · facultatif</span>
              <input className="mnd-input" value={boxForm.sub} placeholder="Caisse manuelle · compte Mobile Money…" onChange={(e) => setBoxForm((f) => ({ ...f, sub: e.target.value }))} />
            </label>
            <div>
              <div className="mnd-field__label" style={{ marginBottom: 9 }}>Son signe</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {GLYPHS.map((g) => (
                  <button key={g} type="button" className={`trf-chip ${boxForm.glyph === g ? 'is-active' : ''}`} onClick={() => setBoxForm((f) => ({ ...f, glyph: g }))}>{g}</button>
                ))}
              </div>
            </div>
            <label className="mnd-field">
              <span className="mnd-field__label">Devise tenue</span>
              <select className="mnd-input" value={boxForm.currency} onChange={(e) => setBoxForm((f) => ({ ...f, currency: e.target.value }))}>
                <option value="">{currency} — la devise de la Maison</option>
                {CURRENCIES.filter((c) => c.code !== currency).map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
              <span className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, display: 'block', lineHeight: 1.5 }}>
                Une caisse en devise compte SES billets et n’entre pas dans la trésorerie en {currency}.
              </span>
            </label>
            <label className="mnd-field">
              <span className="mnd-field__label">Solde d’ouverture · {boxForm.currency || currency}</span>
              <input
                className="mnd-input" inputMode="numeric" value={boxForm.opening} placeholder="0"
                onChange={(e) => setBoxForm((f) => ({ ...f, opening: e.target.value.replace(/[^0-9]/g, '') }))}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
              />
              <span className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, display: 'block', lineHeight: 1.5 }}>
                Ce qu’elle contenait avant que Le Trône ne la suive. Tout le reste se calcule.
              </span>
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="mnd-btn mnd-btn--ghost" onClick={() => setBoxOpen(false)}>Annuler</button>
              <button className="mnd-btn" onClick={saveBox}>{boxEditingId ? 'Enregistrer' : 'Créer la caisse'}</button>
            </div>
          </div>
        </Modal>
      )}

      {trOuvert && (
        <Modal title="Transférer entre caisses" onClose={() => setTrOuvert(false)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
              L’argent change de tiroir : la caisse de départ baisse, celle d’arrivée monte.
              <b> Rien n’est dépensé, rien n’est encaissé</b> — un transfert ne paraîtra ni dans
              vos dépenses ni dans vos encaissements.
            </div>
            <div className="tr-cols" style={{ '--cols': '1fr 1fr', gap: 14 } as CSSProperties}>
              <label className="mnd-field">
                <span className="mnd-field__label">D’où il part</span>
                <select className="mnd-input" value={fTr.de} onChange={(e) => setFTr((f) => ({ ...f, de: e.target.value }))}>
                  <option value="">Choisir…</option>
                  {branchBoxes.map((c) => <option key={c.id} value={c.name}>{c.name} · {fmtIn(boxBalance(c.name), cashboxCurrency(c))}</option>)}
                </select>
              </label>
              <label className="mnd-field">
                <span className="mnd-field__label">Où il arrive</span>
                <select className="mnd-input" value={fTr.vers} onChange={(e) => setFTr((f) => ({ ...f, vers: e.target.value }))}>
                  <option value="">Choisir…</option>
                  {branchBoxes.filter((c) => c.name !== fTr.de).map((c) => <option key={c.id} value={c.name}>{c.name} · {fmtIn(boxBalance(c.name), cashboxCurrency(c))}</option>)}
                </select>
              </label>
            </div>
            <label className="mnd-field">
              <span className="mnd-field__label">Montant qui sort · {deviseDe}</span>
              <input
                className="mnd-input" inputMode="numeric" value={fTr.montant} placeholder="0"
                onChange={(e) => setFTr((f) => ({ ...f, montant: e.target.value.replace(/[^0-9]/g, '') }))}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
              />
            </label>
            {changeDeDevise && (
              <label className="mnd-field">
                <span className="mnd-field__label">Montant réellement reçu · {deviseVers}</span>
                <input
                  className="mnd-input" inputMode="numeric" value={fTr.recu} placeholder="0"
                  onChange={(e) => setFTr((f) => ({ ...f, recu: e.target.value.replace(/[^0-9]/g, '') }))}
                  style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
                />
                <span className="mnd-muted" style={{ fontSize: 11, marginTop: 5, display: 'block', lineHeight: 1.5 }}>
                  Les deux caisses ne tiennent pas la même monnaie. Saisissez ce qui entre vraiment —
                  c’est ce chiffre qui fera foi, pas une conversion d’aujourd’hui.
                </span>
              </label>
            )}
            <label className="mnd-field">
              <span className="mnd-field__label">Date</span>
              <input className="mnd-input" type="date" value={fTr.date} onChange={(e) => setFTr((f) => ({ ...f, date: e.target.value }))} />
            </label>
            <label className="mnd-field">
              <span className="mnd-field__label">Motif · facultatif</span>
              <input className="mnd-input" value={fTr.note} placeholder="Ex. approvisionner le comptoir…" onChange={(e) => setFTr((f) => ({ ...f, note: e.target.value }))} />
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="mnd-btn mnd-btn--ghost" onClick={() => setTrOuvert(false)}>Annuler</button>
              <button className="mnd-btn" onClick={enregistrerTransfert}>Transférer</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
