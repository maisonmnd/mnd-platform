import { useState } from 'react';
import { Button, Modal } from '../../../../ds/components';
import { fmtMoney } from '../../../../shared/currency';
import type { Expense } from '../../../../shared/finance';
import {
  MOT_DU_REFUS, PARTS_AU_PLUS, idDuPaiementPour, partsDuPaiement, partsSaisiesDe, refusDuPartage, resteARepartir, type PartSaisie,
} from '../../../../shared/partage-du-paiement-pur';

/* ══ LA FENÊTRE « PARTAGER CE PAIEMENT » — 13 novembre 2026 ══════════════
   Maquette `public/maquette-partager-un-paiement.html`, validée (« construis »).
   Le paiement en tête (son total, sa date, sa caisse, son reçu), puis une
   ligne par part : objet, catégorie, montant, « hors de la Maison ». Le reste
   à répartir se compte en direct, et « Enregistrer » attend qu'il soit à 0 F.
   La règle vit dans `shared/partage-du-paiement-pur.ts`. */

export function PartagerLePaiement({ base, partsExistantes, categories, currency, nouvelId, surEnregistrer, surFermer }: {
  /** La dépense à partager, ou la première part d'un paiement déjà partagé. */
  base: Expense;
  /** Les parts déjà posées, quand on reprend un paiement partagé. */
  partsExistantes?: Expense[];
  categories: string[];
  currency: string;
  nouvelId: () => string;
  /** Les parts à écrire, et celles qu'elles remplacent. */
  surEnregistrer: (nouvelles: Expense[], remplacees: Expense[]) => void;
  surFermer: () => void;
}) {
  const totalXof = base.paiement?.totalXof ?? base.amountXof;
  const libelle = base.paiement?.libelle ?? base.label;
  const [parts, setParts] = useState<PartSaisie[]>(() => (partsExistantes && partsExistantes.length > 1
    ? partsSaisiesDe(partsExistantes)
    : [
      { objet: base.label, categorie: base.category, montantXof: totalXof },
      { objet: '', categorie: base.category, montantXof: 0 },
    ]));

  /* La date se dit comme on la dit, avec son année. */
  const dateDite = (() => { const d = new Date(`${base.date}T12:00:00`); return Number.isNaN(d.getTime()) ? base.date : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); })();
  const reste = resteARepartir(totalXof, parts);
  const refus = refusDuPartage(totalXof, parts);
  const cats = Array.from(new Set([...categories, ...parts.map((p) => p.categorie)].filter(Boolean)));
  const change = (i: number, fn: (p: PartSaisie) => PartSaisie) => setParts((ps) => ps.map((p, j) => (j === i ? fn(p) : p)));
  /* « LE RESTE DANS LA PREMIÈRE PART » : on saisit les petites parts, la
     première prend ce qui reste, sans calcul de tête. */
  const resteDansLaPremiere = () => setParts((ps) => ps.map((p, j) => (j === 0
    ? { ...p, montantXof: totalXof - ps.slice(1).reduce((s, q) => s + (Math.round(Number(q.montantXof)) || 0), 0) }
    : p)));

  const enregistrer = () => {
    if (refus) return;
    const nouvelles = partsDuPaiement(base, parts, { idDuPaiement: idDuPaiementPour(base), totalXof, libelle, nouvelId });
    surEnregistrer(nouvelles, partsExistantes && partsExistantes.length > 0 ? partsExistantes : [base]);
  };

  return (
    <Modal title={partsExistantes ? 'Les parts de ce paiement.' : 'Partager ce paiement.'} onClose={surFermer} width={680}>
      <div className="trf-partage">
        <div className="trf-partage__paiement">
          <div>
            <span>{libelle}</span>
            <b>{fmtMoney(totalXof, currency)}</b>
          </div>
          <span>
            {dateDite}{base.cashbox ? ` · caisse « ${base.cashbox} »` : ''}{base.fichier ? ' · le reçu reste joint' : ''}
            {base.validation?.etat === 'attente' ? ' · à valider' : ''}
          </span>
        </div>

        <div className="trf-partage__parts">
          {parts.map((p, i) => (
            <div className="trf-partage__part" key={i}>
              <label className="trf-partage__objet">
                <span>Objet</span>
                <input value={p.objet} placeholder={i === 0 ? 'Courses du salon' : 'Ce que couvre cette part'} onChange={(e) => change(i, (x) => ({ ...x, objet: e.target.value }))} />
              </label>
              <label>
                <span>Catégorie</span>
                <select value={p.categorie} onChange={(e) => change(i, (x) => ({ ...x, categorie: e.target.value }))}>
                  {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>
                <span>Montant · {currency}</span>
                <input
                  type="number" inputMode="numeric" min={0} step={1}
                  value={Number.isFinite(p.montantXof) && p.montantXof !== 0 ? String(p.montantXof) : ''}
                  placeholder="0"
                  onChange={(e) => change(i, (x) => ({ ...x, montantXof: e.target.value === '' ? 0 : Number(e.target.value) }))}
                />
              </label>
              <button
                type="button" className="trf-partage__retirer"
                disabled={parts.length <= 2}
                title={parts.length <= 2 ? 'Un partage garde deux parts au moins' : 'Retirer cette part'}
                aria-label="Retirer cette part"
                onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}
              >×</button>
              <label className="trf-partage__hors">
                <input type="checkbox" checked={!!p.horsMaison} onChange={(e) => change(i, (x) => ({ ...x, horsMaison: e.target.checked }))} />
                <span>Hors de la Maison : cette part sort de la caisse, mais ne compte pas dans les dépenses du salon</span>
              </label>
            </div>
          ))}
        </div>

        <div className="trf-partage__ajouts">
          {parts.length < PARTS_AU_PLUS && (
            <Button variant="ghost" size="sm" onClick={() => setParts((ps) => [...ps, { objet: '', categorie: base.category, montantXof: 0 }])}>+ Une part</Button>
          )}
          {reste !== 0 && (
            <Button variant="ghost" size="sm" onClick={resteDansLaPremiere}>Le reste dans la 1re part</Button>
          )}
        </div>

        <div className={`trf-partage__reste ${reste === 0 ? 'is-ok' : 'is-ko'}`} role="status">
          <span>{reste === 0 ? 'Tout est réparti' : reste > 0 ? 'Reste à répartir' : 'Les parts dépassent le paiement de'}</span>
          <b>{fmtMoney(Math.abs(reste), currency)}</b>
        </div>
        {refus && refus !== 'reste' && <p className="trf-partage__mot">{MOT_DU_REFUS[refus]}</p>}

        <div className="trf-partage__gestes">
          <Button variant="ghost" onClick={surFermer}>Annuler</Button>
          <Button variant="copper" disabled={!!refus} onClick={enregistrer}>
            {`Enregistrer les ${parts.length} parts`}
          </Button>
        </div>
        <p className="trf-partage__mot">
          La date, la caisse, le reçu et la validation restent communs : le relevé de la caisse garde un seul mouvement de {fmtMoney(totalXof, currency)}.
        </p>
      </div>
    </Modal>
  );
}
