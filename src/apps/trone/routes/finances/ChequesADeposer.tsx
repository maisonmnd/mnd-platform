import { useMemo, useState } from 'react';
import { Select, toast } from '../../../../ds/components';
import { uid } from '../../../../shared/store';
import { useBranch } from '../../../../shared/branches';
import { useClients } from '../../../../shared/clients';
import { fmtMoney } from '../../../../shared/currency';
import { invoicesStore, quiEncaisse, transfertsStore, useCashboxes, useInvoices } from '../../../../shared/finance';
import { CAISSE_ANNEES_PASSEES, laCaisseDuPaiement, nomDeLaCaisse, type FamilleDeCaisse } from '../../../../shared/caisses-des-caissiers-pur';
import { CAISSE_MND_PAY } from '../../../../shared/mnd-pay-pur';
import { jourDit } from '../../../../shared/gestes-conversation';
import { jourLocal } from '../../../../shared/mnd-pay-pur';
import { chequesADeposer, traceDite, virementDuDepot } from '../../../../shared/trace-du-moyen-pur';

/* ══ LES CHÈQUES À DÉPOSER — 18 octobre 2026 ═══════════════════════════
   Maquette « Chèque et carte » validée : les chèques encaissés avec leur
   trace et pas encore portés à la banque, le total à porter, et « Marquer
   déposés ». Les chèques d'avant la trace n'y paraissent pas : rien ne dit
   s'ils ont été déposés. */
export function ChequesADeposer() {
  const { branch, currency } = useBranch();
  const [pieces] = useInvoices();
  const [clients] = useClients();
  const [ecartes, setEcartes] = useState<Set<string>>(new Set());
  const [caisses] = useCashboxes();
  /* LE COMPTE QUI REÇOIT LE DÉPÔT : un compte de la branche en francs (jamais
     une caisse de caissier, ni une caisse en devise, ni les années passées, ni
     MND PAY). L'épargne et les comptes hors bilan en sont : la BIIC est l'un
     d'eux (le tri du 19 octobre 2026), et c'est là que le chèque se dépose. */
  /* LA CAISSE DES CHÈQUES sous son nom du moment (« Chèque » depuis le
     21 octobre 2026, « Chèques à déposer » avant le panneau des noms). Les
     caisses des paiements (Espèces, Carte…) ne sont pas des comptes de
     banque : elles ne reçoivent jamais un dépôt. */
  const CAISSE_CHEQUES = nomDeLaCaisse(caisses, branch.id, 'cheque');
  const desPaiements = new Set((['especes', 'momo', 'momoPrive', 'carte', 'cheque', 'autre'] as FamilleDeCaisse[])
    .map((f) => laCaisseDuPaiement(caisses, branch.id, f)?.id).filter((x): x is string => !!x));
  const comptes = caisses.filter((c) => c.branchId === branch.id && !c.archiveeLe && !c.caissierId
    && (!c.currency || c.currency === currency)
    && !desPaiements.has(c.id)
    && ![CAISSE_CHEQUES, CAISSE_ANNEES_PASSEES, CAISSE_MND_PAY].includes(c.name));
  const parDefaut = (comptes.find((c) => c.role === 'banque') ?? comptes.find((c) => /biic|banque|bank/i.test(c.name)))?.name ?? '';
  const [vers, setVers] = useState('');
  const compte = vers || parDefaut;
  const nomDe = (id?: string, repli?: string) => clients.find((c) => c.id === id)?.name || repli || 'Cliente';
  const liste = useMemo(() => chequesADeposer(pieces, branch.id, nomDe), [pieces, branch.id, clients]); // eslint-disable-line react-hooks/exhaustive-deps
  if (liste.length === 0) return null;
  const choisis = liste.filter((c) => !ecartes.has(c.paymentId));
  const total = choisis.reduce((n, c) => n + c.montantXof, 0);
  const aujourdhui = jourLocal(new Date().toISOString());

  const virement = virementDuDepot({ cheques: choisis, caisseDesCheques: CAISSE_CHEQUES, vers: compte, jour: aujourdhui, branchId: branch.id, id: `trf-${uid()}` });
  const aVirer = choisis.some((c) => c.cashbox === CAISSE_CHEQUES);

  const deposer = () => {
    if (choisis.length === 0) return;
    if (aVirer && !virement) { toast('Choisissez le compte de la banque qui reçoit le dépôt.'); return; }
    const ids = new Set(choisis.map((c) => c.paymentId));
    const par = quiEncaisse();
    /* Le total entré dans « Chèques à déposer » passe au compte de la banque. */
    if (virement) transfertsStore.set((prev) => [...prev, virement]);
    invoicesStore.set((prev) => prev.map((i) => ((i.payments ?? []).some((v) => ids.has(v.id))
      ? { ...i, payments: (i.payments ?? []).map((v) => (ids.has(v.id) && v.trace ? { ...v, trace: { ...v.trace, deposeLe: aujourdhui, ...(par ? { deposePar: par } : {}) } } : v)) }
      : i)));
    setEcartes(new Set());
    toast(`${choisis.length} chèque${choisis.length > 1 ? 's' : ''} déposé${choisis.length > 1 ? 's' : ''} le ${jourDit(aujourdhui)} · ${fmtMoney(total, currency)}${virement ? `, virés à « ${virement.vers} »` : ''}.`);
  };

  return (
    <section data-cheques-a-deposer={liste.length} style={{ border: '1px solid var(--copper-300)', background: 'var(--copper-50)', borderRadius: 'var(--radius-md)', padding: '14px 16px', margin: '14px 0', display: 'grid', gap: 8 }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>Chèques à déposer</div>
      {liste.map((c) => (
        <label key={c.paymentId} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 10, alignItems: 'baseline', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
          <input
            type="checkbox"
            id={`depot-${c.paymentId}`}
            checked={!ecartes.has(c.paymentId)}
            onChange={() => setEcartes((avant) => { const s = new Set(avant); if (s.has(c.paymentId)) s.delete(c.paymentId); else s.add(c.paymentId); return s; })}
          />
          <span>{c.client} · {traceDite(c.trace) || 'chèque'} · {jourDit(c.date)}</span>
          <b style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(c.montantXof, currency)}</b>
        </label>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--copper-300)', paddingTop: 8 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13 }}>Total à porter à la banque · <b style={{ fontWeight: 600 }}>{fmtMoney(total, currency)}</b></span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {aVirer && (
            <Select aria-label="Le compte qui reçoit le dépôt" value={compte} onChange={(e) => setVers(e.target.value)} style={{ fontSize: 12 }}>
              <option value="">Vers le compte…</option>
              {comptes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </Select>
          )}
          <button type="button" className="mnd-btn mnd-btn--sm" disabled={choisis.length === 0 || (aVirer && !virement)} onClick={deposer}>
            Marquer déposés le {jourDit(aujourdhui)}
          </button>
        </span>
      </div>
    </section>
  );
}
