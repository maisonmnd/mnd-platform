import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { useAppointments } from '../../../../shared/agenda';
import { useClients } from '../../../../shared/clients';
import {
  useCoffre, coffreStore, coffreBalance, coffreSignedXof, invoiceTotal, useInvoices,
  type CoffreMovement,
} from '../../../../shared/finance';
import { apptNetXof, useServicesById, ClientPicker } from '../clients/_shared';
import { todayISO, monthKey } from './_shared';
import './finances.css';

/* Coffre-fort — l'épargne souveraine de la maison. On y met de côté une part du
   chiffre DÉJÀ gagné (dépôts, souvent adossés à une cliente). C'est un registre
   SÉPARÉ : il n'entre ni dans le chiffre d'affaires ni dans les dépenses.
   VERROU : aucune dépense n'est possible depuis le coffre — la seule sortie est
   un virement vers la banque. Le solde ne fait que grandir, sauf virement. */

const frMoneyDay = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

/* Courbe de croissance — solde cumulé dans le temps, du premier mouvement à
   aujourd'hui. Aire remplie sous la ligne : on VOIT l'argent monter. */
function GrowthChart({ moves, currency }: { moves: CoffreMovement[]; currency: string }) {
  const pts = useMemo(() => {
    if (moves.length === 0) return [];
    const sorted = [...moves].sort((a, b) => a.date.localeCompare(b.date));
    const t = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
    const out: { t: number; bal: number }[] = [];
    let bal = 0;
    out.push({ t: t(sorted[0].date), bal: 0 }); // socle : on part de 0
    for (const m of sorted) {
      bal += coffreSignedXof(m);
      out.push({ t: t(m.date), bal: Math.max(0, bal) });
    }
    const nowIso = todayISO();
    if (t(nowIso) > out[out.length - 1].t) out.push({ t: t(nowIso), bal: Math.max(0, bal) });
    return out;
  }, [moves]);

  if (pts.length < 2) {
    return (
      <div className="trf-coffre-chart trf-coffre-chart--empty">
        Le coffre commence à croître — chaque versement dessinera sa courbe.
      </div>
    );
  }

  const W = 640, H = 170, padB = 22, padT = 12;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const maxBal = Math.max(1, ...pts.map((p) => p.bal));
  const x = (t: number) => (t1 === t0 ? W : ((t - t0) / (t1 - t0)) * W);
  const y = (b: number) => padT + (1 - b / maxBal) * (H - padT - padB);
  /* Ligne en escalier : le solde tient entre deux mouvements. */
  const line: string[] = [];
  pts.forEach((p, i) => {
    if (i === 0) line.push(`M ${x(p.t).toFixed(1)} ${y(p.bal).toFixed(1)}`);
    else {
      line.push(`L ${x(p.t).toFixed(1)} ${y(pts[i - 1].bal).toFixed(1)}`);
      line.push(`L ${x(p.t).toFixed(1)} ${y(p.bal).toFixed(1)}`);
    }
  });
  const linePath = line.join(' ');
  const areaPath = `${linePath} L ${W} ${H - padB} L 0 ${H - padB} Z`;

  return (
    <div className="trf-coffre-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Croissance du coffre-fort">
        <defs>
          <linearGradient id="coffreFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-copper)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-copper)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line x1="0" y1={H - padB} x2={W} y2={H - padB} stroke="var(--hairline)" strokeWidth="1" />
        <path d={areaPath} fill="url(#coffreFill)" />
        <path d={linePath} fill="none" stroke="var(--color-copper)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.slice(1).map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.bal)} r="2.6" fill="var(--color-indigo)" />
        ))}
      </svg>
      <div className="trf-coffre-chart__axis">
        <span>{frMoneyDay(new Date(t0).toISOString().slice(0, 10))}</span>
        <span>{fmtMoney(maxBal, currency)} max</span>
        <span>Aujourd’hui</span>
      </div>
    </div>
  );
}

export default function Coffre() {
  const { branch, currency } = useBranch();
  const [allMoves] = useCoffre();
  const [appts] = useAppointments();
  const [clients] = useClients();
  const [invoices] = useInvoices();
  const byId = useServicesById();

  const moves = useMemo(
    () => allMoves.filter((m) => m.branchId === branch.id).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [allMoves, branch.id],
  );
  const balance = coffreBalance(moves);
  const totalIn = moves.filter((m) => m.kind === 'depot').reduce((s, m) => s + m.amountXof, 0);
  const totalOut = moves.filter((m) => m.kind === 'virement').reduce((s, m) => s + m.amountXof, 0);
  const thisMonth = monthKey(todayISO());
  const inThisMonth = moves
    .filter((m) => m.kind === 'depot' && monthKey(m.date) === thisMonth)
    .reduce((s, m) => s + m.amountXof, 0);

  /* Chiffre réalisé d'une cliente — pour proposer une part à mettre de côté.
     Rituels honorés (net) + factures payées hors règlements de RDV. */
  const clientRevenue = useMemo(() => {
    const linked = new Set(appts.filter((a) => a.invoiceId).map((a) => a.invoiceId));
    return (clientId: string) => {
      const hon = appts.filter((a) => a.branchId === branch.id && a.clientId === clientId && a.status === 'honoré');
      const extras = invoices.filter(
        (i) => i.branchId === branch.id && i.clientId === clientId && i.kind === 'facture' && i.status === 'payée'
          && !linked.has(i.id) && !i.lines.some((l) => l.label.startsWith('Règlement ·')),
      );
      return hon.reduce((s, a) => s + apptNetXof(a, byId), 0) + extras.reduce((s, i) => s + invoiceTotal(i), 0);
    };
  }, [appts, invoices, branch.id, byId]);

  const [depositOpen, setDepositOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const removeMove = (m: CoffreMovement) => {
    const label = m.kind === 'depot' ? 'ce dépôt' : 'ce virement';
    if (!window.confirm(`Retirer ${label} du registre ? (correction d’écriture — n’envoie ni ne rend d’argent)`)) return;
    coffreStore.set((prev) => prev.filter((x) => x.id !== m.id));
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Finances · épargne souveraine"
        title="Le Coffre-fort."
        sub="Mettez de côté une part du chiffre déjà gagné. Le coffre est verrouillé : aucune dépense possible — la seule sortie est un virement vers la banque."
        actions={
          <>
            <Button variant="ghost" onClick={() => setTransferOpen(true)} disabled={balance <= 0}>Virement bancaire</Button>
            <Button variant="copper" onClick={() => setDepositOpen(true)}>+ Verser au coffre</Button>
          </>
        }
      />

      {/* Solde — la pièce maîtresse : l'argent qui grandit. */}
      <Card className="trf-coffre-hero" style={{ padding: 24, marginBottom: 18 }}>
        <div className="trf-coffre-hero__label">Solde du coffre-fort · {branch.name}</div>
        <div className="trf-coffre-hero__value">{fmtMoney(balance, currency)}</div>
        <div className="trf-coffre-hero__lock">
          <span className="trf-coffre-hero__lockdot" /> Verrouillé — aucune dépense possible, sortie uniquement par virement bancaire.
        </div>
        <GrowthChart moves={moves} currency={currency} />
      </Card>

      <div className="tr-grid tr-grid--3" style={{ marginBottom: 18 }}>
        <Card filet="copper" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Total versé</div>
          <div className="mnd-stat__value" style={{ fontSize: 28 }}>{fmtMoney(totalIn, currency)}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>depuis l’ouverture du coffre</div>
        </Card>
        <Card filet="indigo" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Versé ce mois</div>
          <div className="mnd-stat__value" style={{ fontSize: 28 }}>{fmtMoney(inThisMonth, currency)}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>épargne du mois en cours</div>
        </Card>
        <Card filet="indigo" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Sorti vers la banque</div>
          <div className="mnd-stat__value" style={{ fontSize: 28 }}>{fmtMoney(totalOut, currency)}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>virements bancaires cumulés</div>
        </Card>
      </div>

      {/* Registre des mouvements */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div className="trf-coffre-ledger__head">
          <span>Mouvements du coffre · {moves.length}</span>
        </div>
        {moves.length === 0 ? (
          <div className="trf-empty" style={{ padding: 28 }}>
            Le coffre est vide. « Verser au coffre » met de côté une part du chiffre — l’argent commencera à grandir.
          </div>
        ) : (
          <div className="trf-coffre-ledger">
            {moves.map((m) => (
              <div className="trf-coffre-row" key={m.id}>
                <span className={`trf-coffre-row__icon trf-coffre-row__icon--${m.kind}`}>{m.kind === 'depot' ? '↑' : '↓'}</span>
                <span className="trf-coffre-row__main">
                  <span className="trf-coffre-row__title">
                    {m.kind === 'depot'
                      ? (m.clientName ? `Versement · ${m.clientName}` : 'Versement au coffre')
                      : `Virement bancaire${m.bank ? ` · ${m.bank}` : ''}`}
                  </span>
                  <span className="trf-coffre-row__meta">
                    {frMoneyDay(m.date)}{m.note ? ` · ${m.note}` : ''}
                  </span>
                </span>
                <span className={`trf-coffre-row__amount trf-coffre-row__amount--${m.kind}`}>
                  {m.kind === 'depot' ? '+' : '−'}{fmtMoney(m.amountXof, currency)}
                </span>
                <button className="trf-coffre-row__del" title="Retirer cette écriture (correction)" aria-label="Retirer cette écriture" onClick={() => removeMove(m)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {depositOpen && (
        <DepositModal
          onClose={() => setDepositOpen(false)}
          currency={currency}
          clients={clients.filter((c) => c.branchId === branch.id && !c.archived)}
          clientRevenue={clientRevenue}
          onSave={(mv) => {
            coffreStore.set((prev) => [...prev, mv]);
            setDepositOpen(false);
          }}
          branchId={branch.id}
        />
      )}
      {transferOpen && (
        <TransferModal
          onClose={() => setTransferOpen(false)}
          currency={currency}
          balance={balance}
          lastBank={moves.find((m) => m.kind === 'virement' && m.bank)?.bank ?? ''}
          onSave={(mv) => {
            coffreStore.set((prev) => [...prev, mv]);
            setTransferOpen(false);
          }}
          branchId={branch.id}
        />
      )}
    </div>
  );
}

/* ---------- Verser au coffre — dépôt, souvent adossé au revenu d'une cliente ---------- */
function DepositModal({
  onClose, currency, clients, clientRevenue, onSave, branchId,
}: {
  onClose: () => void;
  currency: string;
  clients: ReturnType<typeof useClients>[0];
  clientRevenue: (id: string) => number;
  onSave: (m: CoffreMovement) => void;
  branchId: string;
}) {
  const [clientId, setClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const amountNum = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
  const rev = clientId ? clientRevenue(clientId) : 0;
  const clientName = clients.find((c) => c.id === clientId)?.name;

  const save = () => {
    if (amountNum <= 0) return;
    onSave({
      id: uid(), branchId, kind: 'depot', amountXof: amountNum, date: date || todayISO(),
      clientId: clientId || undefined, clientName: clientName || undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <Modal title="Verser au coffre-fort." onClose={onClose} width={500}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Adosser à une cliente · facultatif">
          <ClientPicker value={clientId} onChange={setClientId} placeholder="Choisir la cliente dont on met de côté le revenu…" />
        </Field>

        {clientId && (
          <div className="trf-coffre-suggest">
            <div className="trf-coffre-suggest__rev">
              Chiffre réalisé de {clientName?.split(' ')[0]} : <b>{fmtMoney(rev, currency)}</b>
            </div>
            <div className="trf-coffre-suggest__chips">
              {[10, 20, 50, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className="tre-chip"
                  disabled={rev <= 0}
                  onClick={() => setAmount(String(Math.round((rev * pct) / 100)))}
                >
                  {pct}%{rev > 0 ? ` · ${fmtMoney(Math.round((rev * pct) / 100), currency)}` : ''}
                </button>
              ))}
            </div>
            <div className="mnd-muted" style={{ fontSize: 10.5 }}>
              Le versement met de côté cette somme — le chiffre d’affaires déjà réalisé reste inchangé.
            </div>
          </div>
        )}

        <Field label={`Montant à verser (${currency})`}>
          <Input inputMode="numeric" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
        </Field>
        <Field label="Date du versement">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note · facultatif">
          <Textarea rows={2} value={note} placeholder="Ex. épargne du mois, mise de côté prudente…" onChange={(e) => setNote(e.target.value)} />
        </Field>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="copper" style={{ flex: 1 }} onClick={save} disabled={amountNum <= 0}>
            Verser {amountNum > 0 ? fmtMoney(amountNum, currency) : ''} au coffre
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Virement vers la banque — la SEULE sortie autorisée ---------- */
function TransferModal({
  onClose, currency, balance, lastBank, onSave, branchId,
}: {
  onClose: () => void;
  currency: string;
  balance: number;
  lastBank: string;
  onSave: (m: CoffreMovement) => void;
  branchId: string;
}) {
  const [amount, setAmount] = useState(String(balance));
  const [bank, setBank] = useState(lastBank);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const amountNum = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
  const tooMuch = amountNum > balance;
  const canSave = amountNum > 0 && !tooMuch && bank.trim() !== '';

  const save = () => {
    if (!canSave) return;
    onSave({
      id: uid(), branchId, kind: 'virement', amountXof: amountNum, date: date || todayISO(),
      bank: bank.trim(), note: note.trim() || undefined,
    });
  };

  return (
    <Modal title="Virement vers la banque." onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="trf-coffre-suggest" style={{ background: 'var(--surface-card)' }}>
          <div className="mnd-muted" style={{ fontSize: 12 }}>
            Solde disponible : <b style={{ color: 'var(--color-indigo)' }}>{fmtMoney(balance, currency)}</b>. C’est la seule sortie du coffre — l’argent va vers la banque, jamais vers une dépense.
          </div>
        </div>
        <Field label="Banque / compte destinataire">
          <Input value={bank} placeholder="Ex. Ecobank · MND Épargne" onChange={(e) => setBank(e.target.value)} />
        </Field>
        <Field label={`Montant du virement (${currency})`}>
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
          {tooMuch && <div style={{ fontSize: 11.5, color: '#8f3b30', marginTop: 6 }}>Le virement dépasse le solde du coffre.</div>}
        </Field>
        <Field label="Date du virement">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Référence · facultatif">
          <Textarea rows={2} value={note} placeholder="Ex. n° de bordereau, motif…" onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="indigo" style={{ flex: 1 }} onClick={save} disabled={!canSave}>
            Virer {amountNum > 0 && !tooMuch ? fmtMoney(amountNum, currency) : ''} vers la banque
          </Button>
        </div>
      </div>
    </Modal>
  );
}
