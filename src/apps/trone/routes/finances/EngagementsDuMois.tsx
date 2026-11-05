import { useEffect, useMemo, useState } from 'react';
import { Modal, Field, Input, Select, toast, demande } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { uid } from '../../../../shared/store';
import { useStaff } from '../../../../shared/auth';
import { useExpenses, useCashboxes, useExpenseCategories, type Expense, type PieceJointe } from '../../../../shared/finance';
import { quandTablePrete, quandDocumentDescendu } from '../../../../shared/sync';
import { useEngagementsDuMois } from '../../../../shared/engagements-du-mois';
import {
  CLE_DES_ENGAGEMENTS, depensesAPreparer, engagementValide, jourEcrit, mensuellesAReprendre, moisEcrit, premierMois,
  repriseDeLaMensuelle, totalDesEngagements, type EngagementDuMois,
} from '../../../../shared/engagements-du-mois-pur';
import { dateEcrite, francs } from '../../../../shared/depense-en-une-phrase-pur';
import { todayISO, ChampPieceJointe } from './_shared';
import './depenses-preparees.css';

/* ══ LES ENGAGEMENTS DE CHAQUE MOIS — 5 novembre 2026 ══════════════════════
   Maquette « Les dépenses préparées par Grenat », source 3 : le loyer,
   internet, l'électricité, les abonnements se posent une fois, avec leur
   jour du mois et leur caisse ; le jour venu, Grenat prépare la dépense, à
   valider. La règle (et la reprise d'une ancienne dépense mensuelle) :
   `shared/engagements-du-mois-pur`. DIRECTION SEULE : les engagements disent
   le train de vie de la Maison. */

export const estDirection = (role: string | undefined): boolean => role === 'souverain' || role === 'gerant';

/* ── LA PRÉPARATION AU TRÔNE ─────────────────────────────────────────────
   En attendant la fonction du serveur (cloture-du-jour l'appellera), le
   poste de la direction prépare à l'ouverture de Dépenses : EN LIGNE
   seulement, une fois les dépenses et les engagements descendus. Un poste
   resté hors ligne avec une copie d'hier pourrait sinon reposer « à
   valider » une dépense déjà validée ailleurs. L'identifiant tiré de la clé
   fait le reste : deux postes écrivent la même ligne. */
export function usePreparationDesEngagements(): void {
  const moi = useStaff();
  const direction = estDirection(moi?.role);
  const [engagements, setEngagements] = useEngagementsDuMois();
  const [toutes, setExpenses] = useExpenses();
  const [pret, setPret] = useState(false);
  useEffect(() => {
    if (!direction) return;
    let vivant = true;
    let depenses = false;
    let doc = false;
    const voir = () => { if (vivant && depenses && doc) setPret(true); };
    quandTablePrete('expenses', () => { depenses = true; voir(); });
    void quandDocumentDescendu(CLE_DES_ENGAGEMENTS).then(() => { doc = true; voir(); });
    return () => { vivant = false; };
  }, [direction]);
  useEffect(() => {
    if (!direction || !pret || engagements.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const r = depensesAPreparer({ engagements, existantes: toutes, aujourdhui: todayISO(), maintenantISO: new Date().toISOString() });
    if (!r.change) return;
    if (r.aPoser.length) {
      const neuves = r.aPoser as unknown as Expense[];
      setExpenses((prev) => [...neuves.filter((n) => !prev.some((x) => x.id === n.id)), ...prev]);
      toast(r.aPoser.length > 1
        ? `Grenat a préparé ${r.aPoser.length} dépenses de vos engagements, à valider.`
        : `Grenat a préparé « ${r.aPoser[0].label} », à valider.`);
    }
    setEngagements(r.engagements);
  }, [direction, pret, engagements, toutes, setExpenses, setEngagements]);
}

type Forme = { id: string | null; libelle: string; montant: string; categorie: string; caisse: string; jour: string; depuis: string; actif: boolean; piece?: PieceJointe };

export function EngagementsDuMois() {
  const { branch } = useBranch();
  const moi = useStaff();
  const direction = estDirection(moi?.role);
  const [engagements, setEngagements] = useEngagementsDuMois();
  const [toutes, setExpenses] = useExpenses();
  const [boites] = useCashboxes();
  const [categories] = useExpenseCategories();
  const [ouvert, setOuvert] = useState(false);
  const [forme, setForme] = useState<Forme | null>(null);
  const [souci, setSouci] = useState('');

  const siens = useMemo(() => engagements.filter((e) => e.branchId === branch.id), [engagements, branch.id]);
  const actifs = siens.filter((e) => e.actif);
  const aReprendre = useMemo(() => mensuellesAReprendre(toutes, engagements, branch.id), [toutes, engagements, branch.id]);
  const caisses = useMemo(() => boites.filter((c) => c.branchId === branch.id && !c.archiveeLe).map((c) => c.name), [boites, branch.id]);
  const total = totalDesEngagements(engagements, branch.id);

  if (!direction) return null;

  const nouveau = () => {
    const jour = Number(todayISO().slice(8, 10));
    setSouci('');
    setForme({ id: null, libelle: '', montant: '', categorie: '', caisse: '', jour: String(jour), depuis: premierMois(jour, todayISO()), actif: true });
  };
  const modifie = (e: EngagementDuMois) => {
    setSouci('');
    setForme({ id: e.id, libelle: e.libelle, montant: String(e.montantXof), categorie: e.categorie, caisse: e.caisse, jour: String(e.jour), depuis: e.depuis, actif: e.actif, piece: e.piece });
  };
  const enregistre = () => {
    if (!forme) return;
    const jour = Number(forme.jour);
    const montantXof = Number(forme.montant.replace(/\D/g, '')) || 0;
    const brouillon: Partial<EngagementDuMois> = { libelle: forme.libelle.trim(), montantXof, categorie: forme.categorie, jour, depuis: forme.depuis };
    const faute = engagementValide(brouillon) ?? (forme.caisse ? null : 'Choisissez la caisse d’où il sort.');
    if (faute) { setSouci(faute); return; }
    if (forme.id) {
      setEngagements((prev) => prev.map((e) => (e.id === forme.id ? {
        ...e, libelle: forme.libelle.trim(), montantXof, categorie: forme.categorie, caisse: forme.caisse, jour, depuis: forme.depuis, actif: forme.actif,
        ...(forme.piece ? { piece: forme.piece } : { piece: undefined }),
      } : e)));
    } else {
      const e: EngagementDuMois = {
        id: `eng${uid()}`, branchId: branch.id, libelle: forme.libelle.trim(), montantXof, categorie: forme.categorie, caisse: forme.caisse,
        jour, actif: forme.actif, depuis: forme.depuis, ...(forme.piece ? { piece: forme.piece } : {}),
        creeLe: new Date().toISOString(), creePar: (moi?.name ?? '').trim() || 'La Maison',
      };
      setEngagements((prev) => [...prev, e]);
    }
    setForme(null);
  };
  const bascule = (e: EngagementDuMois) => setEngagements((prev) => prev.map((x) => (x.id === e.id ? { ...x, actif: !x.actif } : x)));
  const retire = async (e: EngagementDuMois) => {
    if (!await demande({
      quoi: 'Les engagements de chaque mois',
      titre: `Retirer « ${e.libelle} » ?`,
      dit: 'Grenat ne le préparera plus. Les dépenses déjà préparées restent, avec leur validation.',
      accepter: 'Retirer l’engagement',
      refuser: 'Le garder',
      dur: true,
    })) return;
    setEngagements((prev) => prev.filter((x) => x.id !== e.id));
  };
  const reprends = async (d: Expense) => {
    const r = repriseDeLaMensuelle(d, { id: `eng${uid()}`, aujourdhui: todayISO(), parQui: (moi?.name ?? '').trim() || 'La Maison', maintenantISO: new Date().toISOString() });
    if (!await demande({
      quoi: 'Les engagements de chaque mois',
      titre: `Reprendre « ${d.label} » dans les engagements ?`,
      dit: `Cette dépense mensuelle de ${francs(d.amountXof)} compte chaque mois depuis le ${dateEcrite(d.date)}, sans validation ni pièce, et n’est sortie de « ${d.cashbox || 'sa caisse'} » qu’une fois. Reprise, elle redevient la dépense de ${moisEcrit(d.date.slice(0, 7))}, et Grenat prépare chaque mois ${jourEcrit(r.engagement.jour)}, à valider, depuis ${moisEcrit(r.engagement.depuis)}. Refusez ce qui n’a pas eu lieu.`,
      accepter: 'Reprendre',
      refuser: 'Laisser comme avant',
    })) return;
    setExpenses((prev) => prev.map((x) => (x.id === d.id ? { ...x, recurring: null } : x)));
    setEngagements((prev) => [...prev, r.engagement]);
    setOuvert(true);
    toast(`« ${d.label} » est un engagement : Grenat le prépare ${jourEcrit(r.engagement.jour)}.`);
  };

  return (
    <div className="trf-panel dpg-eng" data-engagements="section">
      <button type="button" className="dpg-eng__tete" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        <span className="dpg-eng__titre">Les engagements de chaque mois</span>
        <span className="dpg-eng__resume">
          {actifs.length === 0 ? 'Aucun engagement actif' : `${actifs.length} actif${actifs.length > 1 ? 's' : ''} · ${francs(total)} par mois`}
          {aReprendre.length > 0 ? ` · ${aReprendre.length} dépense${aReprendre.length > 1 ? 's' : ''} mensuelle${aReprendre.length > 1 ? 's' : ''} à reprendre` : ''}
        </span>
        <span className="trf-act">{ouvert ? 'Fermer' : 'Ouvrir'}</span>
      </button>
      {ouvert && (
        <div className="dpg-eng__liste">
          <p className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>
            Le jour venu, Grenat prépare la dépense, à valider, avec la pièce de l’engagement. Une fois par mois, jamais deux.
          </p>
          {aReprendre.map((d) => (
            <div key={d.id} className="dpg-eng__ligne dpg-eng__reprise" data-engagement-reprise={d.id}>
              <span className="dpg-eng__nom">{d.label}</span>
              <span className="dpg-eng__xof">{francs(d.amountXof)}</span>
              <span className="dpg-eng__meta">
                Dépense mensuelle depuis le {dateEcrite(d.date)} · {d.category}{d.cashbox ? ` · ${d.cashbox}` : ''}{d.porteur ? ` · ${d.porteur}` : ''}.
                Elle compte chaque mois sans validation ni pièce.
              </span>
              <span className="dpg-eng__gestes">
                <button type="button" className="trf-act" onClick={() => void reprends(d)}>Reprendre dans les engagements</button>
              </span>
            </div>
          ))}
          {siens.map((e) => (
            <div key={e.id} className={`dpg-eng__ligne${e.actif ? '' : ' is-eteint'}`} data-engagement={e.id}>
              <span className="dpg-eng__nom">{e.libelle}</span>
              <span className="dpg-eng__xof">{francs(e.montantXof)}</span>
              <span className="dpg-eng__meta">
                {e.categorie} · {e.caisse || 'sans caisse'} · {jourEcrit(e.jour)} · depuis {moisEcrit(e.depuis)}
                {e.faits?.length ? ` · dernier préparé : ${moisEcrit(e.faits[e.faits.length - 1])}` : ''}
                {e.piece ? ' · pièce jointe' : ' · sans pièce'}
                {e.actif ? '' : ' · en pause'}
              </span>
              <span className="dpg-eng__gestes">
                <button type="button" className="trf-act" onClick={() => modifie(e)}>Modifier</button>
                <button type="button" className="trf-act" onClick={() => bascule(e)}>{e.actif ? 'Mettre en pause' : 'Reprendre'}</button>
                <button type="button" className="trf-act trf-act--ghost" onClick={() => void retire(e)}>Retirer</button>
              </span>
            </div>
          ))}
          <div><button type="button" className="trf-act" onClick={nouveau}>+ Engagement</button></div>
        </div>
      )}
      {forme && (
        <Modal title={forme.id ? 'Modifier l’engagement' : 'Un engagement de chaque mois'} onClose={() => setForme(null)}>
          <div className="dpg-eng__forme">
            <Field label="Libellé"><Input value={forme.libelle} placeholder="Loyer de la Maison, Internet, Électricité…" onChange={(e) => setForme({ ...forme, libelle: e.target.value })} /></Field>
            <div className="dpg-eng__deux">
              <Field label="Montant (F)"><Input inputMode="numeric" value={forme.montant} onChange={(e) => setForme({ ...forme, montant: e.target.value })} /></Field>
              <Field label="Jour du mois"><Input type="number" min={1} max={31} value={forme.jour} onChange={(e) => setForme({ ...forme, jour: e.target.value })} /></Field>
            </div>
            <div className="dpg-eng__deux">
              <Field label="Catégorie">
                <Select value={forme.categorie} onChange={(e) => setForme({ ...forme, categorie: e.target.value })}>
                  <option value="">Choisir…</option>
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Caisse">
                <Select value={forme.caisse} onChange={(e) => setForme({ ...forme, caisse: e.target.value })}>
                  <option value="">Choisir…</option>
                  {caisses.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Premier mois préparé"><Input type="month" value={forme.depuis} onChange={(e) => setForme({ ...forme, depuis: e.target.value })} /></Field>
            <Field label="La pièce de l’engagement (le bail, le contrat), jointe à chaque dépense">
              <ChampPieceJointe branchId={branch.id} dossier="depense" valeur={forme.piece} onChange={(p) => setForme({ ...forme, piece: p })} />
            </Field>
            {souci && <p className="dpg-phrase__demande" style={{ margin: 0 }}>{souci}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="trf-act" onClick={() => setForme(null)}>Annuler</button>
              <button type="button" className="trf-act dpg-phrase__poser" onClick={enregistre}>Enregistrer l’engagement</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default EngagementsDuMois;
