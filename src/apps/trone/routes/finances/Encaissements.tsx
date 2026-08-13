import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Input, Segs } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAppointments } from '../../../../shared/agenda';
import { useClients } from '../../../../shared/clients';
import { useInvoices, usePayments, useCredits } from '../../../../shared/finance';
import { useApprenants, useSubscribers } from '../equipe/data';
import { buildReceipts, totalBy, receiptKindLabel, type Receipt, type ReceiptKind } from '../../../../shared/receipts';
import { apptLabel, useServicesById } from '../clients/_shared';
import { todayISO, monthKey, monthTitle, MonthNav, downloadCsv } from './_shared';
import { normName } from '../../../../shared/text';
import { receiptPdf } from '../../../../shared/pdf';
import { maisonNom } from '../../../../shared/identite';
import './finances.css';

/* Encaissements — le registre de TOUT ce qui entre, par toutes les portes :
   factures réglées au comptoir, acomptes (en ligne ou remis à la Maison),
   formations de l'Académie, règlements d'abonnement, dépôts d'avoir.

   C'est un registre de TRÉSORERIE, pas de chiffre d'affaires : il répond à
   « qu'est-ce qui est entré, quand, par quel moyen, dans quelle caisse, et sur
   quelle preuve ? ». La Synthèse, elle, répond à « qu'avons-nous gagné ? ».
   Les deux totaux diffèrent légitimement — le pourboire entre au tiroir sans
   être du revenu, l'avoir est du revenu sans être des billets. Ne jamais
   chercher à les faire coïncider.

   Tout est DÉRIVÉ (shared/receipts.ts) : aucun compteur n'est écrit, donc rien
   ne peut dériver de la réalité. */

const KINDS: { k: ReceiptKind | 'tous'; l: string }[] = [
  { k: 'tous', l: 'Tout' },
  { k: 'facture', l: 'Factures' },
  { k: 'acompte', l: 'Acomptes' },
  { k: 'formation', l: 'Formations' },
  { k: 'abonnement', l: 'Abonnements' },
  { k: 'avoir', l: 'Avoirs' },
  { k: 'pourboire', l: 'Pourboires' },
];

const frDay = (iso: string): string =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—';

export default function Encaissements() {
  const { branch, currency } = useBranch();
  const navigate = useNavigate();
  const [invoices] = useInvoices();
  const [online] = usePayments();
  const [appointments] = useAppointments();
  const [credits] = useCredits();
  const [apprenants] = useApprenants();
  const [subscribers] = useSubscribers();
  const [clients] = useClients();
  const byId = useServicesById();

  const [month, setMonth] = useState(monthKey(todayISO()));
  const [kind, setKind] = useState<ReceiptKind | 'tous'>('tous');
  const [q, setQ] = useState('');
  /* Un total ne vaut que si l'on peut l'ouvrir : cliquer « Espèces » ou
     « Caisse Principale » restreint le registre du dessous aux entrées qui le
     composent. Re-cliquer relâche. Les deux se cumulent — « Mobile Money » ×
     « Hors caisse » répond à une question qu'aucun des deux ne répond seul. */
  const [method, setMethod] = useState<string | null>(null);
  const [box, setBox] = useState<string | null>(null);
  const boxOf = (r: Receipt) => r.cashbox ?? 'Hors caisse';

  const all = useMemo(
    () => buildReceipts({
      branchId: branch.id,
      invoices,
      online,
      appointments,
      credits,
      formation: apprenants,
      abonnements: subscribers.map((s) => ({ id: s.id, clientId: s.clientId, name: s.name, payments: s.payments })),
      nameOf: (id) => clients.find((c) => c.id === id)?.name ?? 'Cliente de passage',
      apptLabel: (a) => apptLabel(a, byId),
    }),
    [branch.id, invoices, online, appointments, credits, apprenants, subscribers, clients, byId],
  );

  const ofMonth = useMemo(() => all.filter((r) => monthKey(r.date) === month), [all, month]);
  const shown = useMemo(() => {
    const needle = normName(q);
    return ofMonth
      .filter((r) => kind === 'tous' || r.kind === kind)
      .filter((r) => !method || r.method === method)
      .filter((r) => !box || boxOf(r) === box)
      .filter((r) => !needle || normName(r.clientName).includes(needle) || normName(r.ref ?? '').includes(needle));
  }, [ofMonth, kind, method, box, q]);

  const total = shown.reduce((s, r) => s + r.amountXof, 0);
  /* Les deux cartes restent le partage du MOIS ENTIER, jamais du filtre en
     cours : c'est ce qui permet de garder la vue d'ensemble sous les yeux
     pendant qu'on consulte un moyen en particulier. */
  const byMethod = useMemo(() => totalBy(ofMonth, (r) => r.method), [ofMonth]);
  /* `boxOf` sert ICI et dans le filtre : le libellé de repli (« Hors caisse »)
     doit être le MÊME des deux côtés, sinon cliquer la ligne ne trouverait rien. */
  const byBox = useMemo(() => totalBy(ofMonth, boxOf), [ofMonth]);
  const filtered = method !== null || box !== null;

  /* Ouvre la pièce d'origine : la facture, ou le rituel. La traçabilité ne vaut
     que si l'on peut remonter à la source en un clic. */
  const openSource = (r: Receipt) => {
    if (r.invoiceId) navigate(`/factures?id=${r.invoiceId}`);
    else if (r.apptId) navigate('/carnet');
  };

  /* Le reçu — la preuve papier que la Maison a reçu cette somme. Son numéro est
     DÉRIVÉ de l'encaissement : réémettre le même reçu redonne le même numéro. */
  const [busy, setBusy] = useState<string | null>(null);
  const printReceipt = async (r: Receipt) => {
    setBusy(r.id);
    try {
      await receiptPdf({
        /* La ligne pourboire d'une facture partage ses 6 derniers caractères
           avec la ligne de la facture (même pièce d'origine) : sans le préfixe
           « RP », les deux reçus porteraient le MÊME numéro. */
        number: `${r.kind === 'pourboire' ? 'RP' : 'R'}-${r.date.replace(/-/g, '')}-${r.id.slice(-6).toUpperCase()}`,
        houseName: maisonNom(),
        houseSub: `${branch.name} · ${branch.city}`,
        date: new Date(`${r.date}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
        clientName: r.clientName,
        label: r.label,
        kind: receiptKindLabel(r.kind),
        amount: fmtMoney(r.amountXof, currency),
        method: r.method,
        cashbox: r.cashbox,
        ref: r.ref,
      });
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () =>
    downloadCsv(`encaissements-${month}`, [
      ['Date', 'Nature', 'Cliente', 'Objet', 'Moyen', 'Caisse', 'Référence', `Montant (${currency})`],
      ...shown.map((r) => [r.date, receiptKindLabel(r.kind), r.clientName, r.label, r.method, r.cashbox ?? '', r.ref ?? '', r.amountXof]),
    ]);

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Finances · trésorerie"
        title="Encaissements."
        sub="Tout ce que la Maison reçoit, d’où que ça vienne — et la preuve de chaque entrée. Registre de trésorerie : il compte l’argent entré, quand la Synthèse compte ce qui est gagné."
        actions={
          <>
            <MonthNav month={month} onChange={setMonth} />
            <Button variant="ghost" onClick={exportCsv} disabled={shown.length === 0}>Exporter</Button>
          </>
        }
      />

      {/* Totaux du mois — par moyen puis par caisse. */}
      <div className="tr-cols" style={{ '--cols': '1fr 1fr', gap: 18, alignItems: 'start' } as CSSProperties}>
        <div className="trf-panel">
          <div className="mnd-eyebrow">Par moyen de règlement</div>
          {byMethod.length === 0 ? (
            <div className="trf-empty" style={{ marginTop: 12 }}>Rien d’encaissé en {monthTitle(month)}.</div>
          ) : (
            byMethod.map((m) => (
              <button
                type="button"
                className="trf-linerow trf-linerow--split trf-linerow--btn trf-click"
                key={m.k}
                aria-pressed={method === m.k}
                title={method === m.k ? 'Relâcher ce filtre' : `Ne voir que les entrées en ${m.k}`}
                onClick={() => setMethod((prev) => (prev === m.k ? null : m.k))}
              >
                <span>{m.k}<span className="mnd-muted"> · {m.n} entrée{m.n > 1 ? 's' : ''}</span></span>
                <span>{fmtMoney(m.total, currency)}</span>
              </button>
            ))
          )}
        </div>
        <div className="trf-panel">
          <div className="mnd-eyebrow">Par caisse</div>
          {byBox.length === 0 ? (
            <div className="trf-empty" style={{ marginTop: 12 }}>—</div>
          ) : (
            byBox.map((b) => (
              <button
                type="button"
                className="trf-linerow trf-linerow--split trf-linerow--btn trf-click"
                key={b.k}
                aria-pressed={box === b.k}
                title={box === b.k ? 'Relâcher ce filtre' : `Ne voir que les entrées de ${b.k}`}
                onClick={() => setBox((prev) => (prev === b.k ? null : b.k))}
              >
                <span>{b.k}<span className="mnd-muted"> · {b.n} entrée{b.n > 1 ? 's' : ''}</span></span>
                <span>{fmtMoney(b.total, currency)}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="trc-toolbar" style={{ marginTop: 20 }}>
        <Segs<ReceiptKind | 'tous'>
          options={KINDS.map((k) => ({ value: k.k, label: k.l }))}
          value={kind}
          onChange={setKind}
        />
        {filtered && (
          <button
            type="button"
            className="trf-chip"
            onClick={() => { setMethod(null); setBox(null); }}
            title="Revenir à tout le mois"
          >
            {[method, box].filter(Boolean).join(' · ')} ✕
          </button>
        )}
        <div className="trc-searchwrap">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une cliente, une référence…"
            aria-label="Rechercher un encaissement"
          />
        </div>
      </div>

      <div className="trf-panel" style={{ marginTop: 14 }}>
        <div className="trf-linerow trf-linerow--split trf-linerow--head">
          {/* Le filtre s'écrit EN MOTS dans l'en-tête : un registre restreint qui
              ne le dit pas se lit comme le registre entier — et l'export porte
              le même sous-ensemble. */}
          <span>
            {shown.length} encaissement{shown.length > 1 ? 's' : ''} · {monthTitle(month)}
            {method && ` · ${method}`}{box && ` · ${box}`}
          </span>
          <span>{fmtMoney(total, currency)}</span>
        </div>
        {shown.length === 0 ? (
          <div className="trf-empty" style={{ marginTop: 14 }}>
            Aucun encaissement ne répond à ce filtre.
          </div>
        ) : (
          shown.map((r) => (
            <div
              key={r.id}
              className="trf-linerow trf-linerow--split trf-linerow--click"
              role="button"
              tabIndex={0}
              onClick={() => openSource(r)}
              onKeyDown={(e) => { if (e.key === 'Enter') openSource(r); }}
              title={r.invoiceId ? 'Ouvrir la facture' : r.apptId ? 'Ouvrir le carnet' : undefined}
            >
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ fontWeight: 'var(--weight-medium)' }}>{r.clientName}</b>
                  <span className="trc-src">{receiptKindLabel(r.kind)}</span>
                  {r.ref && <span className="mnd-muted" style={{ fontSize: 11 }}>{r.ref}</span>}
                </span>
                <span className="mnd-muted" style={{ fontSize: 11.5, textAlign: 'left' }}>
                  {frDay(r.date)} · {r.label} · {r.method}{r.cashbox ? ` · ${r.cashbox}` : ''}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>
                  {fmtMoney(r.amountXof, currency)}
                </span>
                <button
                  type="button"
                  className="trf-rowbtn"
                  onClick={(e) => { e.stopPropagation(); void printReceipt(r); }}
                  disabled={busy === r.id}
                  title="Éditer le reçu de cet encaissement"
                >
                  {busy === r.id ? '…' : 'Reçu'}
                </button>
              </span>
            </div>
          ))
        )}
      </div>

      <p className="mnd-muted" style={{ fontSize: 11.5, marginTop: 14, lineHeight: 1.6 }}>
        Un acompte figure au jour où il est reçu ; la facture qui le solde n’encaisse alors que le reste.
        Le pourboire a sa propre ligne, créditée à la caisse Pourboires — l’argent des mains, jamais celui
        de la facture. L’avoir n’est pas compté (c’est un crédit, pas des billets) —
        d’où l’écart normal avec le chiffre d’affaires de la Synthèse.
      </p>
    </div>
  );
}
