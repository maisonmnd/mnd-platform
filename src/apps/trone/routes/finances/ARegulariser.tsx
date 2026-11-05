import { useMemo, useState } from 'react';
import { demande, toast } from '../../../../ds/components';
import { fmtMoney } from '../../../../shared/currency';
import { useStaff as useMaTete } from '../../../../shared/auth';
import { uid } from '../../../../shared/store';
import { useBranch } from '../../../../shared/branches';
import {
  coffreStore, entreesHorsActiviteStore, expensesStore, transfertsStore,
  useEntreesHorsActivite, useExpenseCategories,
  type Expense, type MouvementHorsActivite, type PieceJointe,
} from '../../../../shared/finance';
import { MOTIF_PRELEVEMENT } from '../../../../shared/compte-courant';
import {
  apresLaRegularisation, dernierJourDuMois, estARegulariser, pourquoiPasLaRegularisation, resteARegulariser, seDefait,
  type Regularisation,
} from '../../../../shared/remise-a-zero-pur';
import { useStaff } from '../equipe/data';
import { useEstDirection } from '../_vie';
import { ChampPieceJointe, monthLabel } from './_shared';
import './caisse-au-jour.css';

/* ══ « À RÉGULARISER » — 5 novembre 2026 ══════════════════════════════════
   Maquette « La caisse au jour le jour », validée. L'argent sorti des
   tiroirs sans justificatif, écrit par la remise à 0 F. Ce n'est ni une
   dépense ni un revenu : il attend sa pièce. Une part retrouvée devient une
   dépense du bon mois, ou un prélèvement de l'associé, et quitte « À
   régulariser » ; le tiroir ne bouge pas une seconde fois. */

const lis = (v: string): number => {
  const t = v.replace(/[\s  ]/g, '').replace(',', '.');
  const n = Number(t);
  return t && Number.isFinite(n) ? Math.round(n) : NaN;
};
const jourDit = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

type Form = { id: string; devient: 'depense' | 'prelevement'; quoi: string; montant: string; mois: string; categorie: string; fichier?: PieceJointe; associe: string };

export function ARegulariser() {
  const { branch, currency: devise } = useBranch();
  const f = (n: number) => fmtMoney(n, devise);
  const [horsActivite] = useEntreesHorsActivite();
  const [categories] = useExpenseCategories();
  const [staff] = useStaff();
  const estDirection = useEstDirection();
  const me = useMaTete();
  const moi = me?.name?.trim() || 'Sans nom';
  const associes = useMemo(() => staff.filter((m) => m && m.branchId === branch.id && m.associe === true), [staff, branch.id]);

  const lignes = useMemo(
    () => horsActivite.filter((m) => m.branchId === branch.id && estARegulariser(m)).sort((a, b) => b.date.localeCompare(a.date)),
    [horsActivite, branch.id],
  );
  const total = resteARegulariser(horsActivite, branch.id);
  const [form, setForm] = useState<Form | null>(null);
  const [souci, setSouci] = useState('');

  if (lignes.length === 0) return null;

  const ouvre = (m: MouvementHorsActivite, devient: Form['devient']) => {
    const mois = m.remise?.parMois.filter((p) => !p.reste && p.xof > 0).map((p) => p.mois).at(-1) ?? m.date.slice(0, 7);
    setSouci('');
    setForm({ id: m.id, devient, quoi: '', montant: '', mois, categorie: categories[0]?.name ?? 'Divers', associe: associes.length === 1 ? associes[0].id : '' });
  };

  const regularise = (m: MouvementHorsActivite) => {
    if (!form) return;
    const xof = lis(form.montant);
    const fin = dernierJourDuMois(form.mois);
    const date = fin < m.date.slice(0, 10) ? fin : m.date.slice(0, 10);
    const associe = associes.find((a) => a.id === form.associe);
    const pourquoi = pourquoiPasLaRegularisation({
      resteXof: m.amountXof, xof, quoi: form.quoi, devient: form.devient, date, remiseLe: m.date, associe: associe?.id,
    });
    if (pourquoi) { setSouci(pourquoi); return; }
    const ecritureId = form.devient === 'depense' ? `exp-${uid()}` : `hav-${uid()}`;
    if (form.devient === 'depense') {
      const e: Expense = {
        id: ecritureId, branchId: branch.id, label: form.quoi.trim(), amountXof: xof, date, cashbox: m.cashbox, category: form.categorie,
        ...(form.fichier ? { fichier: form.fichier } : {}),
      };
      expensesStore.set((prev) => [e, ...prev]);
    }
    const r: Regularisation = {
      id: `reg-${uid()}`, le: new Date().toISOString(), par: moi, xof, devient: form.devient, ecritureId, quoi: form.quoi.trim(), date,
    };
    entreesHorsActiviteStore.set((prev) => {
      const suite = prev.map((x) => (x.id === m.id ? apresLaRegularisation(x, r) : x));
      return form.devient === 'prelevement' && associe
        ? [...suite, {
          id: ecritureId, branchId: branch.id, date, sens: 'sortie' as const, motif: MOTIF_PRELEVEMENT,
          label: `${associe.name} · ${form.quoi.trim()}`, amountXof: xof, cashbox: m.cashbox, staffId: associe.id,
        }]
        : suite;
    });
    toast(`${f(xof)} régularisés : ${form.devient === 'depense' ? `dépense de ${monthLabel(form.mois)}` : `prélèvement de ${associe?.name ?? 'l’associé'}`}.`);
    setForm(null);
  };

  const defaire = async (m: MouvementHorsActivite) => {
    if (!m.remise || !seDefait(m)) return;
    const ec = m.remise.ecritures;
    if (!await demande({
      quoi: 'À régulariser',
      titre: `Défaire la remise à 0 F du ${jourDit(m.date)} ?`,
      dit: `« ${m.cashbox} » reprend ${f(m.amountXof)} à régulariser${ec.length ? `, et les ${ec.length} autre${ec.length > 1 ? 's' : ''} écriture${ec.length > 1 ? 's' : ''} de la remise s’effacent` : ''}.`,
      scelle: 'Le livre du tiroir revient à ce qu’il disait avant la remise.',
      accepter: 'Défaire la remise',
      refuser: 'La garder',
      dur: true,
    })) return;
    const ids = (g: string) => new Set(ec.filter((e) => e.genre === g).map((e) => e.id));
    const t = ids('transfert'); const c = ids('coffre'); const dp = ids('depense'); const p = ids('prelevement');
    if (t.size) transfertsStore.set((prev) => prev.filter((x) => !t.has(x.id)));
    if (c.size) coffreStore.set((prev) => prev.filter((x) => !c.has(x.id)));
    if (dp.size) expensesStore.set((prev) => prev.filter((x) => !dp.has(x.id)));
    entreesHorsActiviteStore.set((prev) => prev.filter((x) => x.id !== m.id && !p.has(x.id)));
    toast('Remise défaite. Le tiroir reprend son livre d’avant.');
  };

  return (
    <section className="cjj-registre" aria-label="À régulariser">
      <div className="cjj-registre__tete">
        <div>
          <small>À régulariser · toutes caisses</small>
          <b>{f(total)}</b>
        </div>
        <p>L’argent sorti des tiroirs sans justificatif. Ce n’est ni une dépense ni un revenu : il attend sa pièce. Dès qu’une pièce se retrouve, la part devient une dépense du bon mois et quitte « À régulariser ».</p>
      </div>
      {lignes.map((m) => {
        const r = m.remise;
        const ouvert = form?.id === m.id ? form : null;
        return (
          <div className="cjj-piece" key={m.id}>
            <div className="cjj-piece__haut">
              <b>{jourDit(m.date)} · {m.cashbox}{r ? ' · remise à 0 F' : ''}</b>
              <span>{r ? `${f(m.amountXof)} sur ${f(r.initialXof)} à régulariser` : `${f(m.amountXof)} à régulariser`}</span>
            </div>
            {r && r.parMois.length > 0 && (
              <>
                <span className="cjj-muet">Ce que chaque mois avait laissé dans le tiroir :</span>
                <div className="cjj-mois">
                  {r.parMois.map((p) => (
                    <div key={`${p.mois}-${p.reste ? 'r' : 'm'}`}>
                      <span>{p.reste ? 'Remise d’avant' : monthLabel(p.mois)}</span>
                      <b>{p.xof < 0 ? '− ' : ''}{f(Math.abs(p.xof))}</b>
                    </div>
                  ))}
                </div>
              </>
            )}
            {estDirection && m.amountXof > 0 && !ouvert && (
              <div className="cjj-gestes" style={{ justifyContent: 'flex-start' }}>
                <button type="button" className="trf-act" onClick={() => ouvre(m, 'depense')}>Justifier une partie</button>
                <button type="button" className="trf-act" onClick={() => ouvre(m, 'prelevement')}>C’était un prélèvement</button>
                {seDefait(m) && <button type="button" className="trf-act" style={{ color: 'var(--copper-700)' }} onClick={() => { void defaire(m); }}>Défaire la remise</button>}
              </div>
            )}
            {ouvert && (
              <form className="cjj-form" onSubmit={(e) => { e.preventDefault(); regularise(m); }}>
                <label htmlFor={`rg-quoi-${m.id}`}>{ouvert.devient === 'depense' ? 'Ce qui a été payé' : 'Pour quoi la direction l’a pris'}
                  <input id={`rg-quoi-${m.id}`} className="mnd-input" value={ouvert.quoi} onChange={(e) => setForm({ ...ouvert, quoi: e.target.value })} />
                </label>
                <label htmlFor={`rg-xof-${m.id}`}>Montant
                  <input id={`rg-xof-${m.id}`} className="mnd-input" inputMode="numeric" value={ouvert.montant} onChange={(e) => setForm({ ...ouvert, montant: e.target.value })} />
                </label>
                <label htmlFor={`rg-mois-${m.id}`}>Mois
                  <select id={`rg-mois-${m.id}`} className="mnd-input" value={ouvert.mois} onChange={(e) => setForm({ ...ouvert, mois: e.target.value })}>
                    {[...new Set([...(r?.parMois.filter((p) => !p.reste).map((p) => p.mois) ?? []), m.date.slice(0, 7)])].sort().map((mo) => (
                      <option key={mo} value={mo}>{monthLabel(mo)}</option>
                    ))}
                  </select>
                </label>
                {ouvert.devient === 'depense' ? (
                  <label htmlFor={`rg-cat-${m.id}`}>Catégorie
                    <select id={`rg-cat-${m.id}`} className="mnd-input" value={ouvert.categorie} onChange={(e) => setForm({ ...ouvert, categorie: e.target.value })}>
                      {categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </label>
                ) : (
                  <label htmlFor={`rg-qui-${m.id}`}>L’associé
                    <select id={`rg-qui-${m.id}`} className="mnd-input" value={ouvert.associe} onChange={(e) => setForm({ ...ouvert, associe: e.target.value })}>
                      <option value="">L’associé…</option>
                      {associes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </label>
                )}
                {ouvert.devient === 'depense' && (
                  <div className="cjj-plein">
                    <ChampPieceJointe branchId={branch.id} dossier="depense" valeur={ouvert.fichier} onChange={(p) => setForm({ ...ouvert, fichier: p })} />
                  </div>
                )}
                <div className="cjj-gestes cjj-plein" style={{ justifyContent: 'flex-start' }}>
                  <button type="submit" className="mnd-btn">Régulariser</button>
                  <button type="button" className="mnd-btn mnd-btn--ghost" onClick={() => setForm(null)}>Retour</button>
                  {souci && <span className="cjj-souci">{souci}</span>}
                </div>
              </form>
            )}
            {r && r.regularisations.length > 0 && (
              <div className="cjj-journal">
                {[...r.regularisations].reverse().map((g) => (
                  <div key={g.id}>
                    <span>{g.devient === 'depense' ? `Devenu dépense du ${g.date.split('-').reverse().join('/')}` : 'Devenu prélèvement'} · {g.quoi}<small> · {g.par ?? ''}</small></span>
                    <span className="cjj-num">− {f(g.xof)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
