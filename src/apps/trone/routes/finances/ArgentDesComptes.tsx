import { useEffect, useMemo, useState } from 'react';
import { Select, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { transfertsStore, useCashboxes, useTransferts } from '../../../../shared/finance';
import { useStaff as useMaFiche } from '../../../../shared/auth';
import { CAISSE_ANNEES_PASSEES, laCaisseDuPaiement } from '../../../../shared/caisses-des-caissiers-pur';
import { ANCIEN_NOM_MND_PAY, CAISSE_MND_PAY, estLaCaisseFedaPay, jourLocal } from '../../../../shared/mnd-pay-pur';
import { CAISSE_MTN_COLLECTION } from '../../../../shared/collecte-mtn-pur';
import { KKIAPAY_CASHBOX } from '../../../../shared/kkiapay';
import { jourDit } from '../../../../shared/gestes-conversation';
import {
  NOM_DU_COMPTE, argentDesComptes, dejaVire, moisDeLaPaie, paieAGarder, virementsDuLundi,
  type BulletinAGarder, type CompteDuPrestataire,
} from '../../../../shared/argent-des-comptes-pur';
import { asArray, ligneEstPayee, usePayrollRuns, type PayrollLine, type PayrollRun } from '../equipe/payroll';
import { useStaff } from '../equipe/data';
import { lisChezMtn } from '../equipe/paie-par-mtn';
import { useCaisses } from './tiroirs';
import { monthKey, todayISO } from './_shared';

/* ══ L'ARGENT DES COMPTES · 12 novembre 2026 ════════════════════════════
   Maquette « Le choix du moyen », choix ⑥ : la paie du 5 d'abord, le
   surplus à la banque chaque lundi. La règle est dans
   `shared/argent-des-comptes-pur.ts` ; ici, ses lectures et son geste.

   La direction seule la voit. Les bulletins et les numéros de paie ne se
   lisent que par le souverain (RLS) : au gérant, la carte montre les
   soldes et dit que le virement se fait du poste du souverain. Le solde du
   compte de paie MTN se lit chez MTN, à l'ouverture (`lisChezMtn`). Le
   geste « C'est viré » inscrit un virement par compte vers la banque, une
   fois par jour (identifiants fixes) : l'argent, lui, se vire chez chaque
   prestataire. */

export function ArgentDesComptes() {
  const { branch, currency } = useBranch();
  const [caisses] = useCashboxes();
  const [transferts] = useTransferts();
  const moi = useMaFiche();
  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  const souverain = moi?.role === 'souverain';
  const aujourdhui = jourLocal(new Date().toISOString()) || todayISO();
  const { boxBalance } = useCaisses(monthKey(aujourdhui));
  const [runs] = usePayrollRuns();
  const [fiches] = useStaff();
  const [soldePaie, setSoldePaie] = useState<number | null>(null);
  const [vers, setVers] = useState('');
  const [confirme, setConfirme] = useState(false);

  /* Le solde du compte de paie MTN, lu une fois à l'ouverture (direction). */
  useEffect(() => {
    if (!direction) return;
    let vivant = true;
    void lisChezMtn([]).then((r) => { if (vivant && typeof r.soldeXof === 'number') setSoldePaie(r.soldeXof); });
    return () => { vivant = false; };
  }, [direction]);

  const lesCaisses = useMemo(() => {
    const ici = caisses.filter((c) => c.branchId === branch.id && !c.archiveeLe && !c.caissierId);
    const momo = laCaisseDuPaiement(caisses, branch.id, 'momo');
    const trouve: Partial<Record<CompteDuPrestataire, { id: string; nom: string }>> = {};
    const collecte = ici.find((c) => c.name === CAISSE_MTN_COLLECTION);
    const feda = ici.find((c) => estLaCaisseFedaPay(c.name));
    const kkia = ici.find((c) => c.name === KKIAPAY_CASHBOX);
    if (collecte) trouve.mtnCollection = { id: collecte.id, nom: collecte.name };
    if (feda) trouve.fedapay = { id: feda.id, nom: feda.name };
    if (kkia) trouve.kkiapay = { id: kkia.id, nom: kkia.name };
    if (momo) trouve.momopay = { id: momo.id, nom: momo.name };
    return trouve;
  }, [caisses, branch.id]);

  /* LA PAIE PAS ENCORE VERSÉE : le mois d'avant et le mois en cours. */
  const paie = useMemo(() => {
    if (!souverain) return null;
    const mois = moisDeLaPaie(aujourdhui);
    const parFiche = new Map(asArray(fiches).map((f) => [f.id, f]));
    const bulletins: BulletinAGarder[] = asArray<PayrollRun>(runs)
      .filter((r) => r && mois.includes(r.period) && (!r.branchId || r.branchId === branch.id))
      .flatMap((r) => asArray<PayrollLine>(r.lines).map((l) => ({
        netXof: Number(l.result?.net) || 0,
        voie: parFiche.get(l.employeeId)?.mobileMoney?.operateur,
        paye: ligneEstPayee(l),
      })));
    return paieAGarder(bulletins);
  }, [souverain, runs, fiches, branch.id, aujourdhui]);

  if (!direction) return null;
  const soldes: Partial<Record<CompteDuPrestataire, { nom: string; soldeXof: number }>> = {};
  for (const [k, c] of Object.entries(lesCaisses) as [CompteDuPrestataire, { nom: string }][]) soldes[k] = { nom: c.nom, soldeXof: boxBalance(c.nom) };
  const a = argentDesComptes({ aujourdhui, caisses: soldes, paie, soldePaieMtnXof: soldePaie });
  if (!a.lignes.some((l) => l.soldeXof > 0)) return null;

  /* LE COMPTE DE BANQUE : jamais une caisse d'un paiement ni d'un prestataire. */
  const desPaiements = new Set([
    ...(['especes', 'momo', 'momoPrive', 'carte', 'cheque', 'autre'] as const).map((f) => laCaisseDuPaiement(caisses, branch.id, f)?.id),
    ...Object.values(lesCaisses).map((c) => c?.id),
  ].filter((x): x is string => !!x));
  const comptes = caisses.filter((c) => c.branchId === branch.id && !c.archiveeLe && !c.caissierId
    && (!c.currency || c.currency === currency) && !desPaiements.has(c.id)
    && ![CAISSE_ANNEES_PASSEES, CAISSE_MND_PAY, ANCIEN_NOM_MND_PAY, CAISSE_MTN_COLLECTION, KKIAPAY_CASHBOX].includes(c.name));
  const parDefaut = (comptes.find((c) => c.role === 'banque') ?? comptes.find((c) => /biic|banque|bank/i.test(c.name)))?.name ?? '';
  const banque = vers || parDefaut;
  const vire = dejaVire(transferts, aujourdhui, branch.id);
  const F = (n: number) => fmtMoney(n, currency);
  const lundiDit = a.lundi === aujourdhui ? 'aujourd’hui, lundi' : jourDit(a.lundi);

  const inscrire = () => {
    if (!banque) { toast('Choisissez le compte de la banque qui reçoit l’argent.'); return; }
    const v = virementsDuLundi(a, { jour: aujourdhui, branchId: branch.id, banque });
    transfertsStore.set((prev) => [...prev, ...v.filter((x) => !prev.some((t) => t.id === x.id))]);
    setConfirme(false);
    toast(`${F(a.versLaBanqueXof)} inscrits vers « ${banque} » : ${v.length} virement${v.length > 1 ? 's' : ''}.`);
  };

  const cell = { fontFamily: 'var(--font-sans)', fontSize: 12.5, padding: '6px 8px', borderTop: '1px solid var(--hairline)', verticalAlign: 'top' as const };
  return (
    <section data-argent-des-comptes={a.versLaBanqueXof} style={{ border: '1px solid var(--copper-300)', background: 'var(--copper-50)', borderRadius: 'var(--radius-md)', padding: '14px 16px', margin: '14px 0', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>L’argent des comptes · la paie d’abord, le reste à la banque</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>
          {soldePaie === null ? 'compte de paie MTN non lu' : `compte de paie MTN : ${F(soldePaie)}`}
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-soft)', textAlign: 'left' }}>
              <th style={{ padding: '4px 8px' }}>Compte</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Solde</th>
              <th style={{ padding: '4px 8px', textAlign: 'right' }}>Gardé</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>À la banque</th>
            </tr>
          </thead>
          <tbody>
            {a.lignes.filter((l) => l.caisse).map((l) => (
              <tr key={l.compte} data-compte={l.compte}>
                <td style={cell}>
                  <b style={{ color: 'var(--color-indigo)', fontWeight: 600 }}>{l.caisse || NOM_DU_COMPTE[l.compte]}</b>
                  <span style={{ display: 'block', color: 'var(--ink-soft)', fontSize: 11.5 }}>{l.dit}</span>
                </td>
                <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>{F(l.soldeXof)}</td>
                <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>{l.aPointer ? 'à pointer' : F(l.garderXof)}</td>
                <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{l.aPointer ? '·' : F(l.versBanqueXof)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {a.versLaPaieMtnXof > 0 && (
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--copper-700)' }}>
          À demander à MTN : {F(a.versLaPaieMtnXof)} de la collecte vers le compte de paie, avant le 5 à 18 h.
          {a.manquePaieMtnXof > 0 && ` Il manquera encore ${F(a.manquePaieMtnXof)}, à apporter par la banque.`}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13 }}>
          {vire ? 'Viré aujourd’hui, inscrit au Trône.' : `Vers la banque, ${lundiDit} : `}
          {!vire && <b style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400 }}>{F(a.versLaBanqueXof)}</b>}
        </span>
        {!vire && a.peutVirer && (
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select aria-label="Le compte de la banque qui reçoit l’argent" value={banque} onChange={(e) => setVers(e.target.value)} style={{ fontSize: 12 }}>
              <option value="">Vers le compte…</option>
              {comptes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </Select>
            {!confirme
              ? <button type="button" className="mnd-btn mnd-btn--copper" disabled={!banque} onClick={() => setConfirme(true)}>C’est viré</button>
              : (
                <>
                  <button type="button" className="mnd-btn mnd-btn--copper" onClick={inscrire}>Inscrire {F(a.versLaBanqueXof)} vers « {banque} »</button>
                  <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" onClick={() => setConfirme(false)}>Pas encore</button>
                </>
              )}
          </span>
        )}
        {!vire && !a.peutVirer && a.pourquoiPas && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, opacity: 0.85 }}>{a.pourquoiPas}</span>}
      </div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)' }}>
        « C’est viré » inscrit les virements au Trône, un par compte ; l’argent se vire chez chaque prestataire (FedaPay, KkiaPay, MTN). La paie gardée est le net des bulletins pas encore versés : on garde un peu plus, jamais moins.
      </div>
    </section>
  );
}
