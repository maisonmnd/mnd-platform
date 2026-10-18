import { useState } from 'react';
import { fmtMoney } from '../../../../shared/currency';
import { useClients } from '../../../../shared/clients';
import { useSettings } from '../../../../shared/settings';
import { ligneFacture, nouvelleFacture, useInvoices } from '../../../../shared/finance';
import {
  CAISSE_MND_PAY, aRattacher, jourLocal, moyenDeLaPiece, versementDeLaDemande,
} from '../../../../shared/mnd-pay-pur';
import { mndPayOuvert, useDemandesMndPay } from '../../../../shared/mnd-pay';

/* ══ MND PAY AU JOURNAL DE LA CAISSE — 16 octobre 2026 ═════════════════
   « Le soir : rien à rapprocher » (maquette UigU1Rr5…). Ce que MND PAY a
   reçu ce jour, moyen par moyen, les frais payés par les clientes, la
   commission que FedaPay dit avoir retenue ; et, surtout, L'ARGENT À
   RATTACHER : un paiement confirmé qu'aucune pièce ne porte (un ticket
   abandonné après le vert, un lien dont la facture a disparu). Un geste lui
   fait sa pièce : on ne perd jamais un franc reçu. */
export function JournalMndPay({ branchId, jour, currency }: { branchId: string; jour: string; currency: string }) {
  const [settings] = useSettings();
  const actif = mndPayOuvert(settings.mndPay);
  const demandes = useDemandesMndPay(branchId, actif);
  const [invoices, setInvoices] = useInvoices();
  const [clients] = useClients();
  const [fait, setFait] = useState<string | null>(null);
  if (!actif) return null;

  const duJour = demandes.filter((d) => jourLocal(d.payeeLe ?? d.creeLe) === jour);
  const payees = duJour.filter((d) => d.statut === 'payee');
  const enAttente = duJour.filter((d) => d.statut === 'en_attente').length;
  const parMoyen = new Map<string, { n: number; xof: number }>();
  for (const d of payees) {
    const k = moyenDeLaPiece(d);
    const v = parMoyen.get(k) ?? { n: 0, xof: 0 };
    parMoyen.set(k, { n: v.n + 1, xof: v.xof + d.montantXof });
  }
  const total = payees.reduce((n, d) => n + d.montantXof, 0);
  const frais = payees.reduce((n, d) => n + d.fraisXof, 0);
  const offerts = payees.filter((d) => (d.fraisOffertsXof ?? 0) > 0);
  const fraisOfferts = offerts.reduce((n, d) => n + (d.commissionXof && d.commissionXof > 0 ? d.commissionXof : (d.fraisOffertsXof ?? 0)), 0);
  const pourboires = payees.reduce((n, d) => n + (d.pourboireXof ?? 0), 0);
  const commission = payees.reduce((n, d) => n + (d.commissionXof ?? 0), 0);
  const orphelines = aRattacher(demandes, invoices, Date.now());
  const nomDe = (id?: string) => (id ? clients.find((c) => c.id === id)?.name : undefined);

  const faisLaPiece = (id: string) => {
    const d = orphelines.find((x) => x.id === id);
    if (!d) return;
    const piece = nouvelleFacture({
      branchId, serie: 'MND', status: 'payée',
      clientId: d.clientId ?? '',
      clientName: d.clientId ? undefined : 'Cliente MND PAY',
      date: jourLocal(d.payeeLe ?? d.creeLe),
      lines: [ligneFacture(`Règlement ${d.moyen === 'tapgo' ? 'Tap & Go' : 'MND PAY'}${d.reference ? ` · réf. ${d.reference}` : ''}`, d.montantXof, 1, 0)],
      payment: moyenDeLaPiece(d),
      cashbox: CAISSE_MND_PAY,
    });
    setInvoices((prev) => [{ ...piece, payments: [versementDeLaDemande(d)] }, ...prev]);
    setFait(`Pièce ${piece.number} créée pour ${fmtMoney(d.montantXof, currency)}.${d.pourboireXof ? ` Le pourboire de ${fmtMoney(d.pourboireXof, currency)} reste à noter dans Pourboires.` : ''}`);
  };

  const ligne = { display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-indigo)', padding: '6px 0', borderTop: '1px solid var(--hairline)' } as const;

  return (
    <div style={{ border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', padding: '14px 16px', marginBottom: 18 }} data-mnd-pay="journal">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <span className="trv-sec-label trv-sec-label--copper">MND PAY · ce jour</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)' }}>confirmé par FedaPay, rapproché seul</span>
      </div>
      {payees.length === 0 && <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink-soft)', padding: '6px 0' }}>Aucun paiement MND PAY ce jour{enAttente ? `, ${enAttente} en attente` : ''}.</div>}
      {[...parMoyen.entries()].map(([k, v]) => (
        <div key={k} style={ligne}><span>{k} <span style={{ color: 'var(--ink-soft)', fontSize: 11.5 }}>{v.n} paiement{v.n > 1 ? 's' : ''}</span></span><span>{fmtMoney(v.xof, currency)}</span></div>
      ))}
      {payees.length > 0 && (
        <>
          <div style={{ ...ligne, fontWeight: 600 }}><span>Pour les pièces</span><span>{fmtMoney(total, currency)}</span></div>
          {pourboires > 0 && <div style={ligne}><span>Pourboires reçus avec</span><span>{fmtMoney(pourboires, currency)}</span></div>}
          <div style={ligne}><span>Frais payés par les clientes</span><span>{fmtMoney(frais, currency)}</span></div>
          {offerts.length > 0 && (
            <div style={ligne} data-frais-offerts={offerts.length}>
              <span>Frais offerts par la Maison <span style={{ color: 'var(--ink-soft)', fontSize: 11.5 }}>{[...new Set(offerts.map((d) => d.fraisOffertsPar).filter(Boolean))].join(', ') || 'sans nom'}</span></span>
              <span>−{fmtMoney(fraisOfferts, currency)}</span>
            </div>
          )}
          {commission > 0 && <div style={ligne}><span>Commission dite par FedaPay</span><span>−{fmtMoney(commission, currency)}</span></div>}
          {enAttente > 0 && <div style={{ ...ligne, color: 'var(--copper-700)' }}><span>Encore en attente</span><span>{enAttente}</span></div>}
        </>
      )}
      {orphelines.length > 0 && (
        <div style={{ marginTop: 12, border: '1px dashed var(--copper-300)', borderRadius: 'var(--radius-md)', padding: '10px 12px', display: 'grid', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>À rattacher · {orphelines.length}</span>
          {orphelines.map((d) => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--color-indigo)' }}>
              <span>
                {nomDe(d.clientId) ?? 'Sans fiche'} · {fmtMoney(d.montantXof, currency)} · {moyenDeLaPiece(d)}
                <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)' }}>
                  {jourLocal(d.payeeLe ?? d.creeLe)}{d.reference ? ` · réf. ${d.reference}` : ''}{d.genre === 'lien' ? ' · lien dont la pièce a disparu' : d.moyen === 'tapgo' && !d.pieceId ? ` · Tap & Go, aucun ticket ne l’attendait${d.raison ? ` (${d.raison})` : ''}` : ' · ticket fermé sans lui'}
                </span>
              </span>
              <button type="button" className="mnd-btn mnd-btn--copper mnd-btn--sm" onClick={() => faisLaPiece(d.id)}>Créer sa pièce</button>
            </div>
          ))}
        </div>
      )}
      {fait && <div className="trv-pdf-hint" style={{ marginTop: 10 }}>{fait}</div>}
    </div>
  );
}
