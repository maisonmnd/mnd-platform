import { demande, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { cashboxesStore, transfertsStore, useToutesLesCaisses } from '../../../../shared/finance';
import { laCaisseDuPaiement, nomDeLaCaisse } from '../../../../shared/caisses-des-caissiers-pur';
import { CODE_MOMOPAY, ID_CAISSE_ACIA1, idDuVirementMomopay, virementDeLAncienMomopay } from '../../../../shared/momopay-de-la-maison-pur';
import { useEstDirection } from '../_vie';
import { useCaisses } from './tiroirs';
import { monthKey, todayISO } from './_shared';

/* ══ L'ANCIEN MOMOPAY — 19 octobre 2026 ══════════════════════════════════
   La Maison a son propre compte MoMoPay (code 909099). Sa décision : une
   caisse neuve, « MoMoPay Maison MND », et l'ancienne caisse d'ACIA 1 s'y
   vide, puis se range. Un geste de la direction, qui se défait. Le Trône
   écrit le virement ; l'argent, lui, se vire d'un compte MTN à l'autre. */
export function AncienMomopay() {
  const { branch, currency } = useBranch();
  const [toutes] = useToutesLesCaisses();
  const estDirection = useEstDirection();
  const { boxBalance } = useCaisses(monthKey(todayISO()));
  if (!estDirection) return null;

  const ancienne = toutes.find((b) => b.id === ID_CAISSE_ACIA1 && b.branchId === branch.id);
  if (!ancienne) return null;
  /* La caisse MoMoPay de la Maison sous son nom du moment (« MTN MoMoPay »
     depuis le 21 octobre 2026), retrouvée par son identifiant. */
  const CAISSE_MOMOPAY_MAISON = nomDeLaCaisse(toutes, branch.id, 'momo');
  const petit = { fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink)' } as const;

  if (ancienne.rangeeAuMomopay) {
    return (
      <div style={{ ...petit, margin: '10px 0', color: 'var(--ink-soft)' }} data-ancien-momopay="fait">
        « {ancienne.name} », l’ancien MoMoPay d’ACIA 1, est vidée dans « {CAISSE_MOMOPAY_MAISON} » et rangée.{' '}
        <button
          type="button"
          className="tre-link-btn"
          onClick={async () => {
            if (!await demande({
              quoi: 'Les caisses',
              titre: `Faire revenir « ${ancienne.name} » ?`,
              dit: 'Le virement vers la caisse MoMoPay de la Maison s’efface, et l’ancienne caisse revient avec son solde.',
              accepter: 'Faire revenir',
              refuser: 'La laisser rangée',
            })) return;
            transfertsStore.set((prev) => prev.filter((t) => t.id !== idDuVirementMomopay(ancienne.id)));
            cashboxesStore.set((prev) => prev.map((b) => {
              if (b.id !== ancienne.id) return b;
              const { archiveeLe: _a, rangeeAuMomopay: _r, ...reste } = b;
              return reste as typeof b;
            }));
            toast(`« ${ancienne.name} » est revenue.`);
          }}
        >
          Défaire
        </button>
      </div>
    );
  }
  if (ancienne.archiveeLe) return null;

  const neuve = laCaisseDuPaiement(toutes, branch.id, 'momo');
  const solde = Math.round(boxBalance(ancienne.name));
  const boite = { border: '1px solid var(--copper-300)', background: 'var(--copper-50)', borderRadius: 'var(--radius-md)', padding: '14px 16px', margin: '14px 0', display: 'grid', gap: 10 } as const;

  const vider = () => {
    if (!neuve) return;
    const v = virementDeLAncienMomopay({ ancienne, neuve, solde, jour: todayISO(), branchId: branch.id });
    if (v) transfertsStore.set((prev) => (prev.some((t) => t.id === v.id) ? prev : [...prev, v]));
    const le = new Date().toISOString();
    cashboxesStore.set((prev) => prev.map((b) => (b.id === ancienne.id ? { ...b, archiveeLe: le, rangeeAuMomopay: le } : b)));
    toast(`« ${ancienne.name} » est vidée dans « ${CAISSE_MOMOPAY_MAISON} » et rangée.`);
  };

  return (
    <section style={boite} data-ancien-momopay="a-faire">
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>Le nouveau MoMoPay de la Maison</div>
      <div style={petit}>
        La Maison a son propre compte MoMoPay : code {CODE_MOMOPAY}, au nom de MAISON MND. Les paiements MTN vont
        désormais dans « {CAISSE_MOMOPAY_MAISON} ». L’ancienne caisse « {ancienne.name} » (le compte d’ACIA 1)
        {solde ? <> tient {fmtMoney(solde, currency)} : ils passent dans la caisse neuve,</> : <> est à zéro :</>} puis elle se range.
        Pensez à virer aussi l’argent d’un compte MTN à l’autre.
      </div>
      {!neuve && <div style={{ ...petit, color: 'var(--copper-700)' }}>La caisse « {CAISSE_MOMOPAY_MAISON} » naît à la prochaine ouverture du Trône par la direction.</div>}
      <div>
        <button type="button" className="mnd-btn mnd-btn--copper" disabled={!neuve} onClick={vider}>
          {solde ? `Virer ${fmtMoney(Math.abs(solde), currency)} et ranger « ${ancienne.name} »` : `Ranger « ${ancienne.name} »`}
        </button>
      </div>
    </section>
  );
}
