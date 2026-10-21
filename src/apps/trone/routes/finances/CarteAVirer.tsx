import { useState } from 'react';
import { Select, toast } from '../../../../ds/components';
import { uid } from '../../../../shared/store';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { transfertsStore, useCashboxes } from '../../../../shared/finance';
import { CAISSE_ANNEES_PASSEES, CAISSES_DES_PAIEMENTS, laCaisseDuPaiement, type FamilleDeCaisse } from '../../../../shared/caisses-des-caissiers-pur';
import { CAISSE_MND_PAY, jourLocal } from '../../../../shared/mnd-pay-pur';
import { jourDit } from '../../../../shared/gestes-conversation';
import { useCaisses } from './tiroirs';
import { monthKey, todayISO } from './_shared';

/* ══ LA CARTE À VIRER À LA BANQUE — 21 octobre 2026 ═════════════════════
   « Carte » : « une caisse où l'argent attend que la banque verse celui du
   terminal » (sa décision au sélecteur). Le jour où la banque l'a versé, un
   geste : le solde de « Carte » passe au compte choisi, comme les chèques
   déposés. Le compte : un compte de la branche dans sa devise, jamais une
   caisse d'un paiement (Espèces, MTN MoMoPay…), ni les années passées, ni
   MND PAY, ni la caisse d'un caissier. */
const DES_PAIEMENTS: readonly FamilleDeCaisse[] = ['especes', 'momo', 'momoPrive', 'carte', 'cheque', 'autre'];

export function CarteAVirer() {
  const { branch, currency } = useBranch();
  const [caisses] = useCashboxes();
  const { boxBalance } = useCaisses(monthKey(todayISO()));
  const [vers, setVers] = useState('');
  const carte = laCaisseDuPaiement(caisses, branch.id, 'carte');
  if (!carte) return null;
  const solde = Math.round(boxBalance(carte.name));
  if (solde <= 0) return null;

  const desPaiements = new Set(DES_PAIEMENTS.map((f) => laCaisseDuPaiement(caisses, branch.id, f)?.id).filter((x): x is string => !!x));
  const comptes = caisses.filter((c) => c.branchId === branch.id && !c.archiveeLe && !c.caissierId
    && (!c.currency || c.currency === currency)
    && !desPaiements.has(c.id)
    && ![CAISSE_ANNEES_PASSEES, CAISSE_MND_PAY].includes(c.name));
  const parDefaut = (comptes.find((c) => c.role === 'banque') ?? comptes.find((c) => /biic|banque|bank/i.test(c.name)))?.name ?? '';
  const compte = vers || parDefaut;
  const aujourdhui = jourLocal(new Date().toISOString());

  const virer = () => {
    if (!compte) { toast('Choisissez le compte de la banque qui a reçu l’argent de la carte.'); return; }
    transfertsStore.set((prev) => [...prev, {
      id: `trf-carte-${uid()}`, branchId: branch.id, date: aujourdhui, de: carte.name, vers: compte, amountXof: solde,
      note: `La banque a versé les paiements par carte : « ${carte.name} » passe à « ${compte} »`,
    }]);
    toast(`${fmtMoney(solde, currency)} virés de « ${carte.name} » à « ${compte} » le ${jourDit(aujourdhui)}.`);
  };

  return (
    <section data-carte-a-virer={solde} style={{ border: '1px solid var(--copper-300)', background: 'var(--copper-50)', borderRadius: 'var(--radius-md)', padding: '14px 16px', margin: '14px 0', display: 'grid', gap: 8 }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>{CAISSES_DES_PAIEMENTS.carte.nom} · à virer à la banque</div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13 }}>
        « {carte.name} » tient <b style={{ fontWeight: 600 }}>{fmtMoney(solde, currency)}</b>, payés par carte. Quand la banque les a versés, virez-les au compte.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select aria-label="Le compte qui a reçu l’argent de la carte" value={compte} onChange={(e) => setVers(e.target.value)} style={{ fontSize: 12 }}>
          <option value="">Vers le compte…</option>
          {comptes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </Select>
        <button type="button" className="mnd-btn mnd-btn--copper" disabled={!compte} onClick={virer}>
          Virer {fmtMoney(solde, currency)}
        </button>
      </div>
    </section>
  );
}
