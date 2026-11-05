import { useMemo, useState } from 'react';
import { Modal, demande, toast } from '../../../../ds/components';
import { ChampDeDate } from '../../../../ds/dates';
import { fmtIn } from '../../../../shared/currency';
import { useStaff as useMaTete } from '../../../../shared/auth';
import { uid } from '../../../../shared/store';
import {
  cashboxCurrency, coffreStore, entreesHorsActiviteStore, expensesStore, gardeToutSonPasse, transfertsStore,
  useEntreesHorsActivite, useExpenseCategories,
  type Expense, type MouvementHorsActivite, type PieceJointe,
} from '../../../../shared/finance';
import { MOTIF_PRELEVEMENT } from '../../../../shared/compte-courant';
import { useClotures } from '../../../../shared/caisse-du-soir';
import {
  MOTIF_A_REGULARISER, aRegulariserDeLaRemise, ceQueChaqueMoisALaisse, dateProposeeDeLaRemise, derniereRemiseDe,
  dernierJourDuMois, lesMoisDe, pourquoiPasLaRemise, type Destinations, type RemiseDuTiroir,
} from '../../../../shared/remise-a-zero-pur';
import { useStaff } from '../equipe/data';
import { useCaisses } from './tiroirs';
import { ChampPieceJointe, monthKey, monthTitle, todayISO } from './_shared';
import './caisse-au-jour.css';

/* ══ REMETTRE LE TIROIR À 0 F — 5 novembre 2026 ═══════════════════════════
   Maquette « La caisse au jour le jour », validée. À la main, le dernier soir
   du mois (« Non, à la main chaque mois ») : on dit où est allé l'argent du
   tiroir ; ce qui n'a pas de justificatif s'écrit « À régulariser », tout
   seul. Le mois suivant commence à ce qui reste, 0 F d'ordinaire.

   CHAQUE DESTINATION EST UNE ÉCRITURE QUI EXISTAIT DÉJÀ : un transfert vers
   une autre caisse, un dépôt au coffre, une dépense, un prélèvement au
   compte courant. Seule « À régulariser » est neuve, et c'est une sortie hors
   activité : le résultat du mois ne bouge pas. Les règles vivent dans
   `shared/remise-a-zero-pur`. */

const lis = (v: string): number => {
  const t = v.replace(/[\s  ]/g, '').replace(',', '.');
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : NaN;
};
const jourEnLettres = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function RemiseAZero({ cashbox, onClose }: { cashbox: string; onClose: () => void }) {
  const aujourdhui = todayISO();
  const caisses = useCaisses(monthKey(aujourdhui));
  const { branch, currency, branchBoxes, boxMoves } = caisses;
  const box = branchBoxes.find((b) => b.name === cashbox);
  const devise = box ? cashboxCurrency(box) : currency;
  const f = (n: number) => fmtIn(n, devise);
  const me = useMaTete();
  const moi = me?.name?.trim() || 'Sans nom';
  const [horsActivite] = useEntreesHorsActivite();
  const [clotures] = useClotures();
  const [categories] = useExpenseCategories();
  const [staff] = useStaff();
  const associes = useMemo(() => staff.filter((m) => m && m.branchId === branch.id && m.associe === true), [staff, branch.id]);

  const [date, setDate] = useState(dateProposeeDeLaRemise(aujourdhui));
  const derniereRemiseLe = derniereRemiseDe(horsActivite, branch.id, cashbox);
  const derniereClotureLe = clotures
    .filter((c) => c.branchId === branch.id && c.cashbox === cashbox)
    .map((c) => c.date).sort().at(-1);

  /* Le livre au soir du jour choisi, et ce que chaque mois y a laissé depuis
     la remise d'avant (ou depuis le premier mouvement du tiroir). */
  const { livreXof, parMois } = useMemo(() => {
    const livre = boxMoves(cashbox, { de: date, a: date }).balance;
    let deMois: string;
    let depart: { xof: number; mois?: string } = { xof: 0 };
    if (derniereRemiseLe && derniereRemiseLe < date) {
      depart = { xof: boxMoves(cashbox, { de: derniereRemiseLe, a: derniereRemiseLe }).balance, mois: monthKey(derniereRemiseLe) };
      deMois = monthKey(derniereRemiseLe);
    } else {
      const tout = boxMoves(cashbox, { de: '1900-01-01', a: date });
      deMois = tout.moves[0] ? monthKey(tout.moves[0].date) : monthKey(date);
    }
    const fins = lesMoisDe(deMois, monthKey(date)).map((m) => {
      const fin = dernierJourDuMois(m) < date ? dernierJourDuMois(m) : date;
      return { mois: m, xof: boxMoves(cashbox, { de: fin, a: fin }).balance };
    });
    return { livreXof: livre, parMois: ceQueChaqueMoisALaisse(fins, depart) };
  }, [boxMoves, cashbox, date, derniereRemiseLe]);

  const [txt, setTxt] = useState({ banque: '', coffre: '', depense: '', prelevement: '', reste: '0' });
  const d: Destinations = {
    banque: lis(txt.banque), coffre: lis(txt.coffre), depense: lis(txt.depense), prelevement: lis(txt.prelevement), reste: lis(txt.reste),
  };
  const autres = branchBoxes.filter((b) => b.name !== cashbox && !gardeToutSonPasse(b) && cashboxCurrency(b) === devise);
  const [vers, setVers] = useState('');
  const [depLibelle, setDepLibelle] = useState('');
  const [depCategorie, setDepCategorie] = useState(categories[0]?.name ?? 'Divers');
  const [depFichier, setDepFichier] = useState<PieceJointe | undefined>();
  const [pourQui, setPourQui] = useState('');
  const associe = associes.find((a) => a.id === pourQui) ?? (associes.length === 1 ? associes[0] : undefined);
  const regul = aRegulariserDeLaRemise(livreXof, d);

  const empechement = pourquoiPasLaRemise({
    livreXof, d, date, aujourdhui, derniereClotureLe, derniereRemiseLe,
    banqueVers: vers, depenseLibelle: depLibelle, prelevementPour: associe?.id,
  });
  const [fait, setFait] = useState<string | null>(null);

  const ecrire = async () => {
    if (empechement || fait) return;
    const lignes = [
      d.banque > 0 ? `${f(d.banque)} versés à « ${vers} »` : null,
      d.coffre > 0 ? `${f(d.coffre)} au coffre` : null,
      d.depense > 0 ? `${f(d.depense)} en dépense « ${depLibelle.trim()} »` : null,
      d.prelevement > 0 && associe ? `${f(d.prelevement)} prélevés par ${associe.name}` : null,
      regul > 0 ? `${f(regul)} à régulariser` : null,
    ].filter(Boolean).join(' · ');
    if (!await demande({
      quoi: 'Remise à 0 F',
      titre: `Remettre « ${cashbox} » à ${f(d.reste)} au ${jourEnLettres(date)} ?`,
      dit: lignes,
      scelle: 'Le tiroir commence le jour suivant à ce qui reste. La remise se défait depuis « À régulariser » tant qu’aucune part n’est régularisée.',
      accepter: 'Écrire la remise',
      refuser: 'Revenir',
    })) return;
    const le = new Date().toISOString();
    const note = `Remise à 0 F du ${date.split('-').reverse().join('/')}`;
    const ecritures: RemiseDuTiroir['ecritures'] = [];
    if (d.banque > 0) {
      const id = `trf-${uid()}`;
      transfertsStore.set((prev) => [...prev, { id, branchId: branch.id, date, de: cashbox, vers, amountXof: d.banque, note }]);
      ecritures.push({ genre: 'transfert', id });
    }
    if (d.coffre > 0) {
      const id = `cof-${uid()}`;
      coffreStore.set((prev) => [...prev, { id, branchId: branch.id, kind: 'depot', amountXof: d.coffre, date, cashbox, note: `${note} · ${cashbox}` }]);
      ecritures.push({ genre: 'coffre', id });
    }
    if (d.depense > 0) {
      const id = `exp-${uid()}`;
      const e: Expense = {
        id, branchId: branch.id, label: depLibelle.trim(), amountXof: d.depense, date, cashbox, category: depCategorie,
        ...(depFichier ? { fichier: depFichier } : {}),
      };
      expensesStore.set((prev) => [e, ...prev]);
      ecritures.push({ genre: 'depense', id });
    }
    const nouveaux: MouvementHorsActivite[] = [];
    if (d.prelevement > 0 && associe) {
      const id = `hav-${uid()}`;
      nouveaux.push({
        id, branchId: branch.id, date, sens: 'sortie', motif: MOTIF_PRELEVEMENT, label: `${associe.name} · ${note}`,
        amountXof: d.prelevement, cashbox, staffId: associe.id,
      });
      ecritures.push({ genre: 'prelevement', id });
    }
    if (regul > 0) {
      nouveaux.push({
        id: `hav-${uid()}`, branchId: branch.id, date, sens: 'sortie', motif: MOTIF_A_REGULARISER,
        label: `${note} · sorti sans justificatif`, amountXof: regul, cashbox,
        remise: { livreXof, initialXof: regul, resteXof: d.reste, parMois, ecritures, regularisations: [], le, par: moi },
      });
    }
    if (nouveaux.length > 0) entreesHorsActiviteStore.set((prev) => [...prev, ...nouveaux]);
    const phrase = `« ${cashbox} » remis à ${f(d.reste)} au ${jourEnLettres(date)}${regul > 0 ? ` · ${f(regul)} à régulariser` : ''}.`;
    setFait(phrase);
    toast(phrase);
  };

  const champ = (cle: keyof typeof txt, id: string) => (
    <input
      id={id} className="mnd-input" inputMode="numeric" value={txt[cle]} disabled={!!fait}
      onChange={(e) => setTxt((t) => ({ ...t, [cle]: e.target.value }))} placeholder="0"
    />
  );

  return (
    <Modal title={`Remettre ${cashbox} à 0 F`} onClose={onClose} width={900}>
      <div className="cjj-remise">
        <div className="cjj-col">
          <label className="cjj-muet" style={{ display: 'grid', gap: 4 }}>
            Le soir de la remise
            <ChampDeDate value={date} onChange={(v) => { if (!fait) setDate(v); }} max={aujourdhui} ariaLabel="Le soir de la remise" />
          </label>
          <div className="cjj-grand">
            <small>Dans le tiroir au soir du {jourEnLettres(date)}, selon le livre</small>
            <b>{f(livreXof)}</b>
          </div>
          <div>
            <div className="cjj-muet" style={{ marginBottom: 2 }}>Ce que chaque mois a laissé dans le tiroir{derniereRemiseLe ? `, depuis la remise du ${derniereRemiseLe.split('-').reverse().join('/')}` : ''} :</div>
            {parMois.map((p) => (
              <div className="cjj-ligne" key={`${p.mois}-${p.reste ? 'r' : 'm'}`}>
                <span>{p.reste ? `Laissé à la remise d’avant` : monthTitle(p.mois)}</span>
                <span className="cjj-num">{p.xof < 0 ? '− ' : ''}{f(Math.abs(p.xof))}</span>
              </div>
            ))}
            {parMois.length === 0 && <div className="cjj-muet">Aucun mouvement.</div>}
          </div>
          <p className="cjj-muet">Le livre ne voit sortir que ce qui s’écrit : dépenses, coffre, transferts, prélèvements. Ce que vous ne savez pas dire devient « À régulariser », hors du résultat, jusqu’à sa pièce.</p>
        </div>

        <div className="cjj-col">
          <b style={{ fontSize: 14, color: 'var(--color-indigo)', fontWeight: 500 }}>Où est allé l’argent ?</b>
          <div>
            <div className="cjj-dest">
              <label htmlFor="rz-banque">Versé à la banque ou à l’épargne<small>un transfert vers la caisse qui l’a reçu</small></label>
              {champ('banque', 'rz-banque')}
              {d.banque > 0 && (
                <div className="cjj-plus">
                  <select className="mnd-input" value={vers} onChange={(e) => setVers(e.target.value)} aria-label="La caisse qui l’a reçu" disabled={!!fait}>
                    <option value="">La caisse qui l’a reçu…</option>
                    {autres.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="cjj-dest">
              <label htmlFor="rz-coffre">Mis au coffre<small>le coffre ne sort que vers la banque</small></label>
              {champ('coffre', 'rz-coffre')}
            </div>
            <div className="cjj-dest">
              <label htmlFor="rz-depense">Une dépense avec son justificatif<small>elle s’écrit dans Dépenses, ce soir-là</small></label>
              {champ('depense', 'rz-depense')}
              {d.depense > 0 && (
                <div className="cjj-plus">
                  <input className="mnd-input" value={depLibelle} onChange={(e) => setDepLibelle(e.target.value)} placeholder="Ce qu’elle a payé" aria-label="Ce qu’elle a payé" disabled={!!fait} />
                  <select className="mnd-input" value={depCategorie} onChange={(e) => setDepCategorie(e.target.value)} aria-label="Sa catégorie" disabled={!!fait}>
                    {categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <ChampPieceJointe branchId={branch.id} dossier="depense" valeur={depFichier} onChange={setDepFichier} />
                  </div>
                </div>
              )}
            </div>
            <div className="cjj-dest">
              <label htmlFor="rz-prelev">Pris par la direction<small>un prélèvement au compte courant de l’associé</small></label>
              {champ('prelevement', 'rz-prelev')}
              {d.prelevement > 0 && (
                <div className="cjj-plus">
                  {associes.length === 0
                    ? <span className="cjj-souci">Aucun associé coché dans l’Équipe : le prélèvement ne peut pas s’écrire.</span>
                    : (
                      <select className="mnd-input" value={associe?.id ?? ''} onChange={(e) => setPourQui(e.target.value)} aria-label="L’associé" disabled={!!fait}>
                        <option value="">L’associé…</option>
                        {associes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    )}
                </div>
              )}
            </div>
            <div className="cjj-dest">
              <label htmlFor="rz-reste">Reste dans le tiroir<small>0 F pour commencer le mois à vide</small></label>
              {champ('reste', 'rz-reste')}
            </div>
            <div className="cjj-dest is-regul">
              <label><b>À régulariser</b><small>sorti sans justificatif : le reste, calculé par le Trône</small></label>
              <span className="cjj-calc">{f(Math.max(0, regul))}</span>
            </div>
          </div>
          {empechement && !fait && <span className="cjj-souci">{empechement}</span>}
          {fait && <p className="cjj-fait">{fait}</p>}
          <div className="cjj-gestes">
            <button type="button" className="mnd-btn mnd-btn--ghost" onClick={onClose}>{fait ? 'Fermer' : 'Annuler'}</button>
            {!fait && (
              <button type="button" className="mnd-btn" disabled={!!empechement} title={empechement ?? ''} onClick={() => { void ecrire(); }}>
                {d.reste > 0 ? `Remettre à ${f(d.reste)}` : 'Remettre à 0 F'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
