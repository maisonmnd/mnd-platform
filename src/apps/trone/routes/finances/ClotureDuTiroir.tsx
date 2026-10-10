import { useMemo, useState } from 'react';
import { Modal } from '../../../../ds/components';
import { fmtIn } from '../../../../shared/currency';
import { useStaff as useMaTete } from '../../../../shared/auth';
import { uid } from '../../../../shared/store';
import {
  aValider as aValiderDepenses, cashboxCurrency, coffreStore, expenseTotal, expensesStore, soumission, useEntreesHorsActivite, useExpenseCategories, useExpenses,
  type Cashbox, type Expense, type PieceJointe,
} from '../../../../shared/finance';
import { cloturesStore, useClotures } from '../../../../shared/caisse-du-soir';
import {
  COUPURES, attenduDuTiroir, derniereCloture, fondPropose, jourPropose, livreDeLaCloture, nouvelleCloture, pourquoiOnNeCloturePas, pourquoiPasCeJour,
  sommeDuBilletage, surplusAuCoffre, tiroirsQuiSeComptent, tiroirsSansCloture, versementParDefaut, type Cloture,
} from '../../../../shared/caisse-du-soir-pur';
import { useCaisses } from './tiroirs';
import { ChampDeDate } from '../../../../ds/dates';
import { ChampPieceJointe, monthKey, todayISO, useRegistreEncaissements } from './_shared';
import './caisse-du-soir.css';

/* ══ LA CAISSE DU SOIR — 3 octobre 2026 ══════════════════════════════════
   Maquette « Le pointage du jour », validée. Le bouton « Clôturer la
   caisse » ne faisait que changer d'onglet : aucun comptage n'existait.

   LE TRÔNE DIT CE QUI DEVRAIT ÊTRE, LA MAIN DIT CE QUI EST. L'attendu part
   de ce que la dernière clôture a LAISSÉ (le compté, jamais l'attendu : un
   écart ne se reporte pas en silence), plus tout ce que le livre du tiroir
   a bougé depuis, moins les dépenses qui attendent leur validation (l'argent
   est sorti, le livre ne le dit pas encore).

   UN ÉCART NE BLOQUE PAS, il s'explique. Et souvent il n'est qu'une dépense
   faite pour la Maison et pas encore écrite (Yéman, 3 octobre) : elle
   s'écrit ici, l'attendu se refait, et seul le reste demande un mot.

   LE FOND FIXE reste dans le tiroir ; le surplus est proposé au coffre. */

const jeSoumetsPour = (role?: string) => role !== 'souverain' && role !== 'gerant';
const heureDe = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
const nombre = (v: string): number | null => {
  const t = v.replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
};

const veilleDe = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const jourDit = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export function ClotureDuTiroir({ onClose, tiroir: tiroirDemande, jour: jourDemande }: { onClose: () => void; tiroir?: string; jour?: string }) {
  const aujourdhui = todayISO();
  /* LE JOUR CLÔTURÉ SE CHOISIT — 4 octobre 2026 (« choisir la date pour
     clôturer la caisse », à 1 h 40 : c'est la veille qu'on comptait). Avant
     6 h, la veille est proposée. */
  const [jour, setJour] = useState(jourDemande ?? jourPropose(new Date()));
  const caisses = useCaisses(monthKey(aujourdhui));
  const { branch, currency, branchBoxes } = caisses;
  const [clotures] = useClotures();
  const [expenses] = useExpenses();
  const [horsActivite] = useEntreesHorsActivite();
  const registre = useRegistreEncaissements();
  const me = useMaTete();
  const moi = me?.name?.trim() || 'Sans nom';

  /* Les tiroirs qui se comptent : ni le bocal des pourboires (l'argent des
     mains), ni KkiaPay (l'argent vit chez le prestataire), ni ce qui est
     hors bilan. */
  const tiroirs = tiroirsQuiSeComptent(branchBoxes, branch.id);
  const aClore = useMemo(() => new Set(tiroirsSansCloture({
    branchId: branch.id, date: jour, registre, depenses: expenses, clotures,
    /* Une sortie hors activité fait bouger le tiroir sans passer au
       registre (10 octobre 2026) : voir `tiroirsSansCloture`. */
    horsActivite,
  })), [branch.id, jour, registre, expenses, clotures, horsActivite]);
  const ceJour = jour === aujourdhui ? 'aujourd’hui' : jour === veilleDe(aujourdhui) ? 'hier' : 'ce jour-là';
  const [choisi, setChoisi] = useState<string | null>(tiroirDemande ?? null);
  const box = tiroirs.find((b) => b.name === choisi);

  return (
    <Modal title={box ? `Clôturer · ${box.name} · ${jourDit(jour)}` : 'La caisse du soir'} onClose={onClose} width={box ? 820 : 560}>
      {!box ? (
        <>
          <div className="mnd-muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
            Chaque tiroir se compte le soir par celui qui le tient. Le Trône dit ce qui devrait y être ; un écart s’explique, et la direction le lit le lendemain.
          </div>
          <div className="cds-jour">
            <span className="cds-jour__mot">Le jour clôturé</span>
            <button type="button" className={`cds-bouton${jour === veilleDe(aujourdhui) ? ' is-indigo' : ''}`} onClick={() => setJour(veilleDe(aujourdhui))}>Hier</button>
            <button type="button" className={`cds-bouton${jour === aujourdhui ? ' is-indigo' : ''}`} onClick={() => setJour(aujourdhui)}>Aujourd’hui</button>
            <ChampDeDate value={jour} onChange={(v) => { if (v) setJour(v); }} sens="arriere" max={aujourdhui} compact ariaLabel="Le jour clôturé" />
          </div>
          <p className="cds-jour__dit">{jourDit(jour)}</p>
          <div className="cds-tiroirs">
            {tiroirs.length === 0 && <div className="trc-empty">Aucun tiroir déclaré pour cette branche.</div>}
            {tiroirs.map((b) => {
              const dernier = clotures
                .filter((c) => c.branchId === branch.id && c.cashbox === b.name && c.date === jour)
                .sort((x, y) => y.le.localeCompare(x.le))[0];
              const etat = dernier
                ? `Clôturé à ${heureDe(dernier.le)} par ${dernier.par} · ${dernier.ecartXof === 0 ? 'juste' : `écart ${dernier.ecartXof > 0 ? '+' : '−'} ${fmtIn(Math.abs(dernier.ecartXof), cashboxCurrency(b))}`}${dernier.validation?.verdict === 'repris' ? ' · la direction demande de recompter' : ''}`
                : aClore.has(b.name) ? `À clôturer : il a bougé ${ceJour}.` : `Rien n’a bougé ${ceJour}.`;
              return (
                <div className="cds-tiroir" key={b.id}>
                  <b>{b.name}</b>
                  <small>{etat}</small>
                  <button type="button" className={`cds-bouton${!dernier && aClore.has(b.name) ? ' is-plein' : ''}`} onClick={() => setChoisi(b.name)}>
                    {dernier ? 'Recompter' : 'Compter'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <Comptage
          box={box}
          jour={jour}
          aujourdhui={aujourdhui}
          moi={moi}
          role={me?.role}
          clotures={clotures}
          expenses={expenses}
          caisses={caisses}
          monnaie={currency}
          onRetour={() => setChoisi(null)}
          onFini={onClose}
        />
      )}
    </Modal>
  );
}

function Comptage({ box, jour, aujourdhui, moi, role, clotures, expenses, caisses, monnaie, onRetour, onFini }: {
  box: Cashbox;
  /** Le jour clôturé (choisi). */
  jour: string;
  aujourdhui: string;
  moi: string;
  role?: string;
  clotures: Cloture[];
  expenses: Expense[];
  caisses: ReturnType<typeof useCaisses>;
  monnaie: string;
  onRetour: () => void;
  onFini: () => void;
}) {
  const { branch } = caisses;
  const devise = cashboxCurrency(box);
  const enDevise = devise !== monnaie;
  const f = (n: number) => fmtIn(n, devise);
  const [categories] = useExpenseCategories();

  /* LE LIVRE DU TIROIR AU SOIR DU JOUR CHOISI : son solde à la fin de ce
     jour (jamais un versement daté du lendemain), moins les dépenses de ce
     jour ou d'avant qui attendent une validation. */
  const duJour = caisses.boxMoves(box.name, { de: jour, a: jour });
  const enAttente = aValiderDepenses(expenses, branch.id)
    .filter((e) => e.cashbox === box.name && !e.avancee && e.date <= jour)
    .reduce((n, e) => n + expenseTotal(e), 0);
  const livreMaintenant = duJour.balance - enAttente;
  /* Une clôture d'avant le 10 octobre 2026 a retenu un livre sans le hors
     activité du tiroir : on le remet à la même mesure que celui de ce soir,
     sinon l'écart d'un prélèvement déjà compté reviendrait (`livreDeLaCloture`). */
  const derniereBrute = derniereCloture(clotures, branch.id, box.name, jour);
  const derniere = derniereBrute
    ? { ...derniereBrute, livreXof: livreDeLaCloture(derniereBrute, caisses.horsActiviteJusquAu(box.name, derniereBrute.date)) }
    : undefined;
  const attendu = attenduDuTiroir({ livreMaintenantXof: livreMaintenant, derniere });
  const horsBorne = pourquoiPasCeJour({ clotures, branchId: branch.id, cashbox: box.name, jour, aujourdhui });

  /* Ce qui explique l'attendu, ligne par ligne. « Autres mouvements » couvre
     ce qui a bougé entre la clôture précédente et ce jour (un jour sans
     clôture, un versement saisi après la clôture d'avant). */
  const mouvementsDuJour = derniere && derniere.date === jour ? [] : duJour.moves;
  const base = derniere ? derniere.laisseXof : duJour.startBalance;
  const sommeDuJour = mouvementsDuJour.reduce((s, m) => s + m.delta, 0);
  const autres = attendu - base - sommeDuJour + enAttente;

  const [total, setTotal] = useState('');
  const [billets, setBillets] = useState<Record<string, string>>({});
  const [parBillets, setParBillets] = useState(false);
  const billetsNum = Object.fromEntries(Object.entries(billets).map(([k, v]) => [k, Number(v) || 0]));
  const compte = parBillets ? sommeDuBilletage(billetsNum) : nombre(total);
  const ecart = compte === null ? 0 : compte - attendu;

  const [note, setNote] = useState('');
  const [fondTexte, setFondTexte] = useState(String(fondPropose(derniere)));
  const fond = Math.max(0, nombre(fondTexte) ?? 0);
  const surplus = compte === null ? 0 : surplusAuCoffre(compte, fond);
  const [versement, setVersement] = useState<boolean | null>(null);
  /* Proposé, jamais imposé : un tiroir Mobile Money ne se vide pas au coffre.
     Le code disait le contraire de ce commentaire jusqu'au 10 octobre 2026 :
     sans geste, tout tiroir en francs versait son surplus. Seul un tiroir
     d'espèces part coché désormais (`versementParDefaut`). */
  const coche = versement ?? versementParDefaut(box);
  const verse = !enDevise && coche && surplus > 0 ? surplus : 0;

  /* « C'ÉTAIT UNE DÉPENSE » */
  const [depOuverte, setDepOuverte] = useState(false);
  const [depLibelle, setDepLibelle] = useState('');
  const [depMontant, setDepMontant] = useState('');
  const [depCategorie, setDepCategorie] = useState(categories[0]?.name ?? 'Divers');
  const [depFichier, setDepFichier] = useState<PieceJointe | undefined>();
  const [depensesEcrites, setDepensesEcrites] = useState<string[]>([]);
  const [souci, setSouci] = useState('');

  const ecrisLaDepense = () => {
    const m = nombre(depMontant);
    if (!depLibelle.trim()) { setSouci('Dites ce qui a été acheté.'); return; }
    if (!m || m <= 0) { setSouci('Le montant de la dépense manque.'); return; }
    const e: Expense = {
      id: `exp-${uid()}`,
      branchId: branch.id,
      label: depLibelle.trim(),
      amountXof: m,
      date: jour,
      cashbox: box.name,
      category: depCategorie,
      ...(depFichier ? { fichier: depFichier } : {}),
      /* Le rôle tranche, comme dans Dépenses : un employé soumet. */
      ...(jeSoumetsPour(role) ? { validation: soumission(moi, new Date().toISOString()) } : {}),
    };
    expensesStore.set((prev) => [e, ...prev]);
    setDepensesEcrites((prev) => [...prev, e.id]);
    setDepOuverte(false); setDepLibelle(''); setDepMontant(''); setDepFichier(undefined); setSouci('');
  };

  const [fait, setFait] = useState<Cloture | null>(null);
  const empechement = horsBorne ?? pourquoiOnNeCloturePas({ compteXof: compte, ecartXof: ecart, note, verseAuCoffreXof: verse });
  const repriseDe = clotures
    .filter((c) => c.branchId === branch.id && c.cashbox === box.name && c.validation?.verdict === 'repris')
    .filter((c) => !clotures.some((x) => x.reprend === c.id))
    .sort((a, b) => b.le.localeCompare(a.le))[0];

  const cloturer = () => {
    if (empechement || compte === null) return;
    const le = new Date().toISOString();
    if (verse > 0) {
      coffreStore.set((prev) => [...prev, {
        id: `cof-${uid()}`, branchId: branch.id, kind: 'depot', amountXof: verse, date: jour,
        cashbox: box.name, note: `Clôture du soir · ${box.name} · fond de ${f(fond)} laissé`,
      }]);
    }
    const c = nouvelleCloture({
      id: `clo-${uid()}`, branchId: branch.id, cashbox: box.name, date: jour,
      attenduXof: attendu, compteXof: compte,
      ...(parBillets ? { billets: billetsNum } : {}),
      note, depenses: depensesEcrites, fondXof: fond, verseAuCoffreXof: verse,
      livreAvantCoffreXof: livreMaintenant, par: moi, le,
      ...(repriseDe ? { reprend: repriseDe.id } : {}),
    });
    cloturesStore.set((prev) => [...prev, c]);
    setFait(c);
  };

  if (fait) {
    return (
      <div>
        <div className={`cds-verdict ${fait.ecartXof === 0 ? 'is-juste' : 'is-ecart'}`}>
          Clôturé à {heureDe(fait.le)} · compté <b>{f(fait.compteXof)}</b>
          {fait.ecartXof === 0 ? ', le compte est juste.' : `, écart ${fait.ecartXof > 0 ? '+' : '−'} ${f(Math.abs(fait.ecartXof))} déclaré : la direction le lira.`}
        </div>
        {fait.verseAuCoffreXof > 0 && <p className="mnd-muted" style={{ fontSize: 12.5 }}>{f(fait.verseAuCoffreXof)} versés au coffre, {f(fait.laisseXof)} restent dans le tiroir.</p>}
        <div className="cds-gestes">
          <button type="button" className="cds-bouton" onClick={onRetour}>Les autres tiroirs</button>
          <button type="button" className="cds-bouton is-indigo" onClick={onFini}>Fermer</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {repriseDe && (
        <div className="cds-afacturer" style={{ marginTop: 0, marginBottom: 12 }}>
          <b>La direction demande de recompter</b> la clôture du {repriseDe.date}{repriseDe.validation?.mot ? ` : « ${repriseDe.validation.mot} »` : '.'}
        </div>
      )}
      <div className="cds-cloture">
        <div>
          <table className="cds-calcul">
            <tbody>
              <tr>
                <td>{derniere ? <>Laissé à la clôture du {derniere.date}<small>compté par {derniere.par}, fond compris</small></> : 'Dans le tiroir ce matin, selon le livre'}</td>
                <td>{f(base)}</td>
              </tr>
              {mouvementsDuJour.map((m, i) => (
                <tr key={i}>
                  <td>{m.label}{m.sub ? <small>{m.sub}</small> : null}</td>
                  <td>{m.delta >= 0 ? '+ ' : '− '}{f(Math.abs(m.delta))}</td>
                </tr>
              ))}
              {enAttente > 0 && (
                <tr>
                  <td>Dépenses en attente de validation<small>sorties du tiroir, pas encore au livre</small></td>
                  <td>− {f(enAttente)}</td>
                </tr>
              )}
              {autres !== 0 && (
                <tr>
                  <td>Autres mouvements depuis la dernière clôture<small>un jour sans clôture, ou une saisie faite après</small></td>
                  <td>{autres >= 0 ? '+ ' : '− '}{f(Math.abs(autres))}</td>
                </tr>
              )}
              <tr className="is-total"><td>Attendu dans le tiroir</td><td>{f(attendu)}</td></tr>
            </tbody>
          </table>
        </div>

        <div>
          {!parBillets ? (
            <label className="cds-champ" style={{ marginTop: 0 }}>
              Ce que vous comptez {enDevise ? `(en ${devise})` : ''}
              <input className="mnd-input" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="Le total, ou le solde lu sur le téléphone" />
            </label>
          ) : (
            <div className="cds-billets">
              {COUPURES.map((c) => (
                <label key={c}><span>{c.toLocaleString('fr-FR')} ×</span>
                  <input className="mnd-input" inputMode="numeric" value={billets[String(c)] ?? ''} onChange={(e) => setBillets((b) => ({ ...b, [String(c)]: e.target.value.replace(/[^0-9]/g, '') }))} />
                </label>
              ))}
              <label><span>pièces</span>
                <input className="mnd-input" inputMode="numeric" title="Le total des pièces" value={billets.pieces ?? ''} onChange={(e) => setBillets((b) => ({ ...b, pieces: e.target.value.replace(/[^0-9]/g, '') }))} />
              </label>
            </div>
          )}
          {!enDevise && (
            <button type="button" className="cds-bouton" style={{ marginTop: 8 }} onClick={() => setParBillets((v) => !v)}>
              {parBillets ? 'Taper le total' : 'Compter billet par billet'}
            </button>
          )}

          {compte !== null && (
            <div className={`cds-verdict ${ecart === 0 ? 'is-juste' : 'is-ecart'}`}>
              Compté <b>{f(compte)}</b>{ecart === 0 ? ', le compte est juste.' : <>, écart <b>{ecart > 0 ? '+ ' : '− '}{f(Math.abs(ecart))}</b>.</>}
            </div>
          )}

          {compte !== null && ecart < 0 && !depOuverte && (
            <button type="button" className="cds-bouton" style={{ marginTop: 8 }} onClick={() => { setDepOuverte(true); setDepMontant(String(Math.abs(ecart))); }}>
              C’était une dépense
            </button>
          )}
          {depOuverte && (
            <div className="cds-depense">
              <div className="cds-depense__ligne">
                <input className="mnd-input" value={depLibelle} onChange={(e) => setDepLibelle(e.target.value)} placeholder="Ce qui a été acheté (eau, coursier…)" />
                <input className="mnd-input" inputMode="numeric" value={depMontant} onChange={(e) => setDepMontant(e.target.value)} placeholder="Montant" style={{ flex: '0 1 120px' }} />
              </div>
              <div className="cds-depense__ligne">
                <select className="mnd-select" value={depCategorie} onChange={(e) => setDepCategorie(e.target.value)}>
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <ChampPieceJointe branchId={branch.id} dossier="depense" valeur={depFichier} onChange={setDepFichier} />
              <div className="cds-gestes" style={{ marginTop: 0 }}>
                <button type="button" className="cds-bouton is-plein" onClick={ecrisLaDepense}>Écrire la dépense</button>
                <button type="button" className="cds-bouton" onClick={() => { setDepOuverte(false); setSouci(''); }}>Annuler</button>
                {jeSoumetsPour(role) && <span className="mnd-muted" style={{ fontSize: 11.5 }}>Elle part à la direction pour validation, et sort déjà de l’attendu.</span>}
              </div>
            </div>
          )}
          {depensesEcrites.length > 0 && (
            <p className="mnd-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
              {depensesEcrites.length} dépense{depensesEcrites.length > 1 ? 's' : ''} écrite{depensesEcrites.length > 1 ? 's' : ''} pendant ce comptage : l’attendu en tient compte.
            </p>
          )}

          {compte !== null && ecart !== 0 && (
            <label className="cds-champ">
              Ce qui explique l’écart (obligatoire)
              <textarea className="mnd-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : monnaie rendue en trop à 17 h, la cliente a été appelée." />
            </label>
          )}

          {!enDevise && compte !== null && (
            <div className="cds-coffre">
              <label>Fond qui reste dans le tiroir
                <input className="mnd-input" inputMode="numeric" value={fondTexte} onChange={(e) => setFondTexte(e.target.value)} style={{ width: 110 }} />
              </label>
              {surplus > 0 && (
                <label>
                  <input type="checkbox" checked={coche} onChange={(e) => setVersement(e.target.checked)} />
                  Verser le surplus au coffre : {f(surplus)}
                </label>
              )}
            </div>
          )}

          {souci && <p className="cds-souci">{souci}</p>}
          <div className="cds-gestes">
            <button type="button" className="cds-bouton" onClick={onRetour}>Retour</button>
            <button type="button" className="cds-bouton is-plein" disabled={!!empechement} title={empechement ?? ''} onClick={cloturer}>Clôturer le tiroir</button>
            {empechement && (compte !== null || horsBorne) && <span className="cds-souci">{empechement}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
