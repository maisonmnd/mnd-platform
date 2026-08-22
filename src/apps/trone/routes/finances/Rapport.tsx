/* LE RAPPORT DE CAISSE — le livre d'un tiroir, sur une feuille.

   Demandé le 22 août 2026, maquette validée (`public/maquette-rapport-de-caisse.html`).
   Deux formes, un seul moteur : UNE caisse (depuis son relevé) ou TOUTES
   (depuis l'écran des caisses).

   IL NE RECALCULE RIEN. Chaque ligne, chaque solde vient de `boxMoves` — la
   source même que lit le relevé à l'écran. Un rapport qui referait les
   additions de son côté finirait par contredire l'écran, et c'est alors le
   papier qu'on croit. Le seul chiffre qu'il fabrique est le solde courant,
   par accumulation depuis le solde d'ouverture : s'il ne tombe pas sur le
   solde de clôture, c'est que la source ment, et ça se verra sur la feuille. */

import { useMemo, useState } from 'react';
import { Modal } from '../../../../ds/components';
import { fmtIn } from '../../../../shared/currency';
import { cashboxCurrency, caisseDiscrete, type Cashbox } from '../../../../shared/finance';
import { maisonNom, DEVISE_MAISON } from '../../../../shared/identite';
import { identiteCourante } from '../../../../shared/journal';
import { cashbookPdf, type CashLedger, type CashGroup } from '../../../../shared/pdf';
import { useCaisses, soldeVisible } from './tiroirs';
import { monthKey, monthTitle, todayISO } from './_shared';

/* Le premier et le dernier jour d'un mois — les bornes par défaut. */
const premierJour = (mk: string): string => `${mk}-01`;
const dernierJour = (mk: string): string => {
  const [y, m] = mk.split('-').map(Number);
  return `${mk}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};

const frJour = (iso: string, avecAnnee: boolean): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', avecAnnee
    ? { day: '2-digit', month: 'short', year: '2-digit' }
    : { day: '2-digit', month: 'short' });

const frLong = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/* Un nom de fichier sans accent ni espace — il voyage par WhatsApp, par mail,
   et traverse des systèmes qui ne savent pas tous lire « é ». */
const sansFioriture = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

export function RapportDeCaisse({
  nom, month, onClose,
}: {
  /** Une seule caisse, ou toutes si absent. */
  nom?: string;
  month: string;
  onClose: () => void;
}) {
  const { branch, currency, branchBoxes, boxMoves, ouvertes } = useCaisses(month);
  const [mode, setMode] = useState<'mois' | 'periode'>('mois');
  const [de, setDe] = useState(premierJour(month));
  const [a, setA] = useState(dernierJour(month));
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const periode = mode === 'periode' ? { de, a } : undefined;
  const debutISO = periode ? periode.de : premierJour(month);
  const finISO = periode ? periode.a : dernierJour(month);
  /* Sur le mois courant, la clôture n'est pas le 31 : c'est aujourd'hui. Dater
     la dernière ligne d'un jour à venir ferait lire un solde du futur. */
  const finLue = monthKey(finISO) === monthKey(todayISO()) && finISO > todayISO() ? todayISO() : finISO;
  const surPlusieursAnnees = debutISO.slice(0, 4) !== finLue.slice(0, 4);

  /* CE QUI NE S'IMPRIME PAS SE NOMME. Une caisse discrète refermée dirait son
     solde ligne à ligne : l'imprimer sans son code viderait le verrou de son
     sens. Mais un document amputé en silence vaudrait pire. */
  const candidates = useMemo(
    () => (nom ? branchBoxes.filter((c) => c.name === nom) : branchBoxes),
    [branchBoxes, nom],
  );
  const fermees = candidates.filter((c) => caisseDiscrete(c) && !soldeVisible(c, ouvertes));
  const lisibles = candidates.filter((c) => soldeVisible(c, ouvertes));

  const construire = (c: Cashbox): CashLedger => {
    const { boxCur, startBalance, moves, balance } = boxMoves(c.name, periode);
    let courant = startBalance;
    const lignes = moves.map((m) => {
      courant += m.delta;
      return {
        date: frJour(m.date, surPlusieursAnnees),
        label: m.label,
        detail: m.sub || undefined,
        inn: m.delta > 0 ? fmtIn(m.delta, boxCur) : undefined,
        out: m.delta < 0 ? fmtIn(-m.delta, boxCur) : undefined,
        balance: fmtIn(courant, boxCur),
      };
    });
    const entrees = moves.filter((m) => m.delta > 0).reduce((s, m) => s + m.delta, 0);
    const sorties = moves.filter((m) => m.delta < 0).reduce((s, m) => s - m.delta, 0);
    return {
      name: c.name,
      sub: `${moves.length} mouvement${moves.length > 1 ? 's' : ''}`,
      openLabel: `Solde au ${frJour(debutISO, surPlusieursAnnees)}`,
      opening: fmtIn(startBalance, boxCur),
      closeLabel: `Solde au ${frJour(finLue, surPlusieursAnnees)}`,
      closing: fmtIn(balance, boxCur),
      totalIn: entrees > 0 ? fmtIn(entrees, boxCur) : '',
      totalOut: sorties > 0 ? fmtIn(sorties, boxCur) : '',
      moves: lignes,
    };
  };

  /* LA MAISON D'ABORD, les devises ensuite par ordre alphabétique — le même
     rangement qu'à l'écran, pour que la feuille et l'écran se lisent pareil. */
  const parDevise = (liste: Cashbox[]): CashGroup[] => {
    const carte = new Map<string, Cashbox[]>();
    for (const c of liste) {
      const d = cashboxCurrency(c);
      carte.set(d, [...(carte.get(d) ?? []), c]);
    }
    return [...carte.keys()]
      .sort((x, z) => (x === currency ? -1 : z === currency ? 1 : x.localeCompare(z)))
      .map((devise) => {
        const boxes = carte.get(devise)!;
        const total = boxes.reduce((s, c) => s + boxMoves(c.name, periode).balance, 0);
        return {
          heading: `${devise} · ${boxes.length} caisse${boxes.length > 1 ? 's' : ''} · ${fmtIn(total, devise)}`,
          ledgers: boxes.map(construire),
        };
      });
  };

  const editer = async () => {
    setErreur('');
    if (mode === 'periode' && de > a) { setErreur('La date de début est après celle de fin.'); return; }
    if (lisibles.length === 0) { setErreur('Aucune caisse à imprimer.'); return; }
    setEnCours(true);
    try {
      const quand = periode
        ? `Période du ${frLong(debutISO)} au ${frLong(finLue)}`
        : `${monthTitle(month)} — du ${frLong(debutISO)} au ${frLong(finLue)}`;
      const par = identiteCourante().nom;
      const meta = [quand, `Édité le ${frLong(todayISO())} par ${par}`];
      const refus = fermees.map((c) => (
        `Une caisse est absente de ce rapport : ${c.name} — caisse discrète refermée. `
        + 'Son livre ne s’imprime pas sans son code.'
      ));
      const pied = `${maisonNom()} · ${DEVISE_MAISON}`;

      if (nom) {
        const seule = lisibles[0];
        const l = construire(seule);
        const devise = cashboxCurrency(seule);
        await cashbookPdf({
          houseName: maisonNom(),
          eyebrow: 'Rapport de caisse',
          title: seule.name,
          meta: [`${branch.name} · ${devise}`, ...meta],
          resume: [
            { label: l.openLabel, value: l.opening },
            { label: 'Entrées', value: l.totalIn || fmtIn(0, devise), tone: 'in' },
            { label: 'Sorties', value: l.totalOut || fmtIn(0, devise), tone: 'out' },
            { label: l.closeLabel, value: l.closing },
          ],
          groups: [{ ledgers: [l] }],
          footer: pied,
          filename: `rapport-caisse-${sansFioriture(seule.name)}-${debutISO}.pdf`,
        });
      } else {
        const auBilan = lisibles.filter((c) => !c.horsBilan);
        const ecartees = lisibles.filter((c) => !!c.horsBilan);
        await cashbookPdf({
          houseName: maisonNom(),
          eyebrow: 'Rapport des caisses',
          title: `Les caisses de ${branch.name}`,
          meta,
          groups: parDevise(auBilan),
          aside: ecartees.length
            ? {
              heading: 'Hors bilan',
              note: 'Leur argent est réel et leurs mouvements se tiennent comme les autres. '
                + 'Elles n’entrent simplement dans aucun total de la Maison.',
              groups: parDevise(ecartees),
            }
            : undefined,
          refus,
          footer: pied,
          filename: `rapport-caisses-${sansFioriture(branch.name)}-${debutISO}.pdf`,
        });
      }
      onClose();
    } catch {
      setErreur('Le PDF n’a pas pu être fabriqué. Réessayez dans un instant.');
    } finally {
      setEnCours(false);
    }
  };

  const bloque = nom && lisibles.length === 0;

  return (
    <Modal title={nom ? `Rapport · ${nom}` : 'Rapport des caisses'} onClose={onClose} width={470}>
      {bloque ? (
        <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
          Cette caisse est discrète et refermée. Son rapport dirait son solde ligne à ligne —
          il faut l’ouvrir avec son code avant de l’imprimer.
        </div>
      ) : (
        <>
          <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginBottom: 14 }}>
            Le livre {nom ? 'de ce tiroir' : 'de chaque tiroir'} sur une feuille : le solde au premier
            jour, tout ce qui entre et sort, le solde au dernier — et le solde qui court à chaque ligne.
          </div>

          {/* LE MOIS PAR DÉFAUT, LA PÉRIODE EN OPTION — arbitrage de Yéman.
              Le mois est ce que Le Trône compte partout ailleurs ; la période
              libre ouvre le rapport annuel sans imposer deux dates chaque fois. */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {([['mois', `Le mois affiché — ${monthTitle(month)}`], ['periode', 'Une autre période']] as const).map(([k, l]) => (
              <button
                key={k}
                className={`trf-act ${mode === k ? '' : 'trf-act--ghost'}`}
                onClick={() => { setMode(k); setErreur(''); }}
                style={mode === k ? { background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)' } : undefined}
              >
                {l}
              </button>
            ))}
          </div>

          {mode === 'periode' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <label className="mnd-field">
                <span className="mnd-field__label">Du</span>
                <input className="mnd-input" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
              </label>
              <label className="mnd-field">
                <span className="mnd-field__label">Au</span>
                <input className="mnd-input" type="date" value={a} onChange={(e) => setA(e.target.value)} />
              </label>
            </div>
          )}

          {!nom && (
            <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 10 }}>
              {lisibles.length} caisse{lisibles.length > 1 ? 's' : ''} au rapport, rangée
              {lisibles.length > 1 ? 's' : ''} par monnaie. Les caisses hors bilan gardent leur
              propre section, comme à l’écran.
            </div>
          )}

          {fermees.length > 0 && !nom && (
            <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--trf-warning, #96412E)', marginBottom: 10 }}>
              {fermees.map((c) => c.name).join(', ')} — caisse{fermees.length > 1 ? 's' : ''} discrète
              {fermees.length > 1 ? 's' : ''} refermée{fermees.length > 1 ? 's' : ''}, absente
              {fermees.length > 1 ? 's' : ''} du rapport. Le document le dira.
            </div>
          )}

          {erreur && (
            <div style={{ fontSize: 12.5, color: 'var(--trf-warning, #96412E)', marginBottom: 10 }}>{erreur}</div>
          )}
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button className="mnd-btn mnd-btn--ghost" onClick={onClose}>Fermer</button>
        {!bloque && (
          <button className="mnd-btn" onClick={editer} disabled={enCours}>
            {enCours ? 'Un instant…' : 'Éditer le PDF'}
          </button>
        )}
      </div>
    </Modal>
  );
}
