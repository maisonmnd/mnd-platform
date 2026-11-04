import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../../ds/components';
import { ChampDeDate } from '../../../../ds/dates';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients } from '../../../../shared/clients';
import { useCashboxes, useInvoices, invoiceReglements, type Invoice, type InvoicePayment, type PaymentMethod } from '../../../../shared/finance';
import { useEstDirection } from '../_vie';
import { JournalMndPay } from '../vente/JournalMndPay';
import { ClotureDuTiroir } from './ClotureDuTiroir';
import '../vente/vente.css';
import './caisse-du-soir.css';

/* ══ LA CAISSE DU JOUR, EN FIN DE « LA JOURNÉE » — 4 novembre 2026 ══════
   « La caisse du jour en fin de page… combiner le travail et supprimer la
   barre de navigation de la caisse du jour » (Yéman, maquette 9KCMgAb1…,
   « construis »). Ce journal vivait dans la Caisse, derrière l'onglet
   « Journal de caisse » ; il est DÉPLACÉ ici, tel quel : le jour (Hier,
   Aujourd'hui, une date), les caisses, les chiffres par moyen, les
   versements un par un, les pourboires, et « Clôturer la caisse » qui ouvre
   le comptage habituel du tiroir pour ce jour.

   CE QUI CHANGE : « Clôturer la caisse » ne s'allume que quand la journée
   est close (la clôture de Grenat, en haut de la page). Sinon le bouton
   reste éteint et la carte dit ce qui reste : un tiroir compté trop tôt
   mentirait. Le comptage lui-même (`ClotureDuTiroir`) n'a pas bougé. */

const fmtDateFr = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};
/** La veille d'un jour ISO, en heure locale. */
const veilleIso = (iso: string): string => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

export function JournalDeCaisse({ jour, onJour, aujourdhui, clotureOuverteAuxGestes, pourquoiPasEncore }: {
  /** Le jour du journal (et de la clôture), choisi par la page. */
  jour: string;
  onJour: (iso: string) => void;
  aujourdhui: string;
  /** La journée est close : « Clôturer la caisse » s'allume. */
  clotureOuverteAuxGestes: boolean;
  /** Ce qui reste, dit, quand elle ne l'est pas. */
  pourquoiPasEncore: string;
}) {
  const navigate = useNavigate();
  const { branch, currency } = useBranch();
  const [invoices] = useInvoices();
  const [clients] = useClients();
  const [cashboxes] = useCashboxes();
  const estDirection = useEstDirection();
  const branchCashboxes = cashboxes.filter((c) => c.branchId === branch.id);
  const [journalCaisse, setJournalCaisse] = useState<string>('Toutes');
  const [clotureOuverte, setClotureOuverte] = useState(false);

  /* — journal du jour — CE QUI EST ENTRÉ EN CAISSE CE JOUR-LÀ, versement par
     versement, comme le relevé du tiroir (tiroirs.tsx) — jamais « la pièce en
     bloc à sa date ». Corrigé le 24 août : le total sommait `invoiceTotal` de
     chaque pièce datée du jour, donc (1) il comptait la part réglée par AVOIR
     (un crédit, pas des billets) et l'ACOMPTE déjà entré un autre jour ; (2) un
     versement reçu aujourd'hui sur une pièce d'hier n'apparaissait pas, et une
     pièce du jour à moitié réglée comptait en entier ; (3) la ventilation
     MoMo/Espèces/Carte imputait tout le total au PREMIER moyen d'une pièce
     multi-moyens. On lit désormais les versements, chacun à son jour, sa caisse
     et son moyen — l'avoir et l'acompte écartés (même règle qu'`invoiceCaisseAu`). */
  const caisseDuVersement = (i: Invoice, p: InvoicePayment) => p.cashbox ?? i.cashbox ?? 'Caisse principale';
  const versementsDuJour = invoices
    .filter((i) => i.branchId === branch.id && i.kind === 'facture')
    .flatMap((i) =>
      invoiceReglements(i)
        .filter((p) => (p.date ?? i.date) === jour && p.method !== 'Avoir' && p.method !== 'Acompte')
        .map((p) => ({ inv: i, p })),
    )
    .filter((e) => journalCaisse === 'Toutes' || caisseDuVersement(e.inv, e.p) === journalCaisse);
  const journalTotal = versementsDuJour.reduce((s, e) => s + e.p.amountXof, 0);
  /* Le pourboire est un fait de la PIÈCE, pas d'un versement : on le lit sur les
     pièces DISTINCTES qui ont reçu un versement ce jour, sans le compter deux
     fois quand une pièce a été réglée en plusieurs fois. Hors chiffre d'affaires,
     à reverser aux maîtres. */
  const piecesDuJour = [...new Map(versementsDuJour.map((e) => [e.inv.id, e.inv])).values()];
  const tipsTotal = piecesDuJour.reduce((s, i) => s + (i.tipXof ?? 0), 0);
  const sumBy = (fn: (p?: PaymentMethod) => boolean) =>
    versementsDuJour.filter((e) => fn(e.p.method)).reduce((s, e) => s + e.p.amountXof, 0);
  const clientName = (i: Invoice) => clients.find((c) => c.id === i.clientId)?.name ?? i.clientName ?? '—';
  const journalDateLabel = (() => {
    /* L'année sur la date (règle de la Maison). */
    const s = new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  return (
    <div data-journal="caisse-du-jour">
      <JournalMndPay branchId={branch.id} jour={jour} currency={currency} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="trv-sec-label trv-sec-label--copper" style={{ marginBottom: 6 }}>Caisse · Journal · {journalDateLabel}</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 30, lineHeight: 1.05, color: 'var(--color-indigo)' }}>La caisse du jour.</div>
          {/* LE JOUR DU JOURNAL SE CHOISIT — 4 octobre 2026. « Choisir la date
              pour clôturer la caisse » (Yéman, 1 h 56) : « Clôturer la caisse »
              prend le jour affiché. Avant 6 h, la veille est proposée. */}
          <div className="cds-jour" style={{ marginTop: 12 }}>
            <span className="cds-jour__mot">Le jour</span>
            <button type="button" className={`cds-bouton${jour === veilleIso(aujourdhui) ? ' is-indigo' : ''}`} onClick={() => onJour(veilleIso(aujourdhui))}>Hier</button>
            <button type="button" className={`cds-bouton${jour === aujourdhui ? ' is-indigo' : ''}`} onClick={() => onJour(aujourdhui)}>Aujourd’hui</button>
            <ChampDeDate value={jour} onChange={(v) => { if (v) onJour(v); }} sens="arriere" max={aujourdhui} compact ariaLabel="Le jour du journal" />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {['Toutes', ...branchCashboxes.map((c) => c.name)].map((n) => (
              <button key={n} className={`trv-pill ${journalCaisse === n ? 'is-active' : ''}`} onClick={() => setJournalCaisse(n)}>
                {n === 'Toutes' ? 'Toutes les caisses' : n}
              </button>
            ))}
          </div>
        </div>
        {/* LA CAISSE DU SOIR — 3 octobre 2026 : le comptage des tiroirs
            (maquette « Le pointage du jour »). DEPUIS LE 4 NOVEMBRE 2026, il ne
            s'ouvre que sur une journée close (la clôture de Grenat). */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, maxWidth: 360 }}>
          <Button variant="ghost" disabled={!clotureOuverteAuxGestes} onClick={() => setClotureOuverte(true)}>Clôturer la caisse</Button>
          {!clotureOuverteAuxGestes && (
            <span className="jdc-pas-encore" style={{ fontSize: 12, color: 'var(--copper-700)', textAlign: 'right', lineHeight: 1.45 }}>{pourquoiPasEncore}</span>
          )}
        </div>
        {clotureOuverte && <ClotureDuTiroir tiroir={journalCaisse !== 'Toutes' ? journalCaisse : undefined} jour={jour} onClose={() => setClotureOuverte(false)} />}
      </div>

      <div className="tr-grid tr-cols" style={{ '--cols': '1.3fr 1fr 1fr 1fr 1fr', '--cols-md': 'repeat(3, minmax(0,1fr))', '--cols-sm': 'repeat(2, minmax(0,1fr))', marginBottom: 24 } as CSSProperties}>
        <div className="trv-kpi trv-kpi--copper">
          <div className="l">Total encaissé · jour</div>
          <div className="v">{fmtMoney(journalTotal, currency)}</div>
          <div className="c">{versementsDuJour.length} versement{versementsDuJour.length > 1 ? 's' : ''}</div>
        </div>
        <div className="trv-kpi"><div className="l">Mobile Money</div><div className="v">{fmtMoney(sumBy((p) => p === 'MTN MoMo' || p === 'Moov'), currency)}</div></div>
        <div className="trv-kpi"><div className="l">Espèces</div><div className="v">{fmtMoney(sumBy((p) => p === 'Espèces'), currency)}</div></div>
        <div className="trv-kpi"><div className="l">Carte</div><div className="v">{fmtMoney(sumBy((p) => p === 'Carte'), currency)}</div></div>
        <div className="trv-kpi"><div className="l">WhatsApp</div><div className="v">{fmtMoney(sumBy((p) => p === 'Lien WhatsApp'), currency)}</div></div>
      </div>

      {tipsTotal > 0 && (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 5, padding: '14px 18px', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink-soft)' }}>
            Pourboires encaissés · à reverser aux maîtres : <strong style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, color: 'var(--copper-600)' }}>{fmtMoney(tipsTotal, currency)}</strong>
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink-soft)' }}>
            Encaissé en caisse (dont pourboires) : <strong style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, color: 'var(--color-indigo)' }}>{fmtMoney(journalTotal + tipsTotal, currency)}</strong>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 5, overflow: 'hidden' }}>
        <div className="trv-journal-head">
          <span className="trv-th">N°</span>
          <span className="trv-th">Date</span>
          <span className="trv-th">Détail</span>
          <span className="trv-th">Paiement</span>
          <span className="trv-th" style={{ textAlign: 'right' }}>Montant</span>
        </div>
        {versementsDuJour.map(({ inv: i, p }) => (
          <div
            key={`${i.id}-${p.id}`}
            className="trv-journal-row"
            onClick={() => navigate(`/factures?id=${i.id}`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/factures?id=${i.id}`); } }}
            style={{ cursor: 'pointer' }}
            title="Ouvrir la facture"
            role="button"
            tabIndex={0}
          >
            <span style={{ fontFamily: 'var(--font-sans)', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, letterSpacing: '.04em', color: 'var(--copper-600)' }}>
              {i.number.slice(-8)}
              {/* ── MODIFIER UN ENCAISSEMENT — 15 septembre 2026 ────────
                  « Dans encaissement je veux le bouton modifier » (Yéman).
                  LA DIRECTION SEULE (décision du 15 septembre) : corriger un
                  encaissement, c'est déplacer de l'argent déjà compté. IL MÈNE
                  À L'ÉDITEUR QUI EXISTE, dans Factures & devis : deux éditeurs
                  pour une facture finiraient par ne plus dire la même chose. */}
              {estDirection && (
                <button
                  type="button"
                  className="trv-minibtn"
                  style={{ marginLeft: 8 }}
                  title="Modifier cet encaissement"
                  onClick={(e) => { e.stopPropagation(); navigate(`/factures?id=${i.id}&modifier=1`); }}
                >
                  Modifier
                </button>
              )}
            </span>
            <span>
              <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink)' }}>{fmtDateFr(p.date ?? i.date)}</span>
              <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{p.time ?? i.time ?? '—'}</span>
            </span>
            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>
                {i.lines.map((l) => (l.qty > 1 ? `${l.label} ×${l.qty}` : l.label)).join(' · ')}
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 3 }}>
                {clientName(i)} · {caisseDuVersement(i, p)}
              </div>
            </div>
            <div>
              <span className={`trv-paychip ${p.method === 'MTN MoMo' || p.method === 'Moov' ? 'momo' : ''}`}>{p.method}</span>
            </div>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)', textAlign: 'right' }}>
              {fmtMoney(p.amountXof, currency)}
            </span>
          </div>
        ))}
        {versementsDuJour.length === 0 && (
          <div style={{ padding: '26px 24px', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-soft)' }}>
            {jour === aujourdhui ? 'Aucun encaissement pour cette caisse aujourd’hui. Le premier ticket du jour ouvrira le journal.' : 'Aucun encaissement pour cette caisse ce jour-là.'}
          </div>
        )}
      </div>
    </div>
  );
}
