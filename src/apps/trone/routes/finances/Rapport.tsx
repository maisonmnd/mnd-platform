/* LE RAPPORT DE CAISSE — le livre d'un tiroir, sur une feuille.

   Demandé le 22 août 2026, maquette validée (`public/maquette-rapport-de-caisse.html`).
   Le mois par défaut, une période libre en option, et LES CAISSES SE COCHENT
   UNE À UNE — « permets-moi de sélectionner les caisses de manière
   individuelle » : un rapport pour la banque ne porte pas les mêmes tiroirs
   qu'un rapport pour soi.

   IL NE RECALCULE RIEN. Chaque ligne, chaque solde vient de `boxMoves` — la
   source même que lit le relevé à l'écran. Un rapport qui referait les
   additions de son côté finirait par contredire l'écran, et c'est alors le
   papier qu'on croit. Le seul chiffre qu'il fabrique est le solde courant, par
   accumulation depuis le solde d'ouverture : s'il ne tombe pas sur le solde de
   clôture, c'est que la source ment, et ça se verra sur la feuille. */

import { useMemo, useState } from 'react';
import { Modal } from '../../../../ds/components';
import { fmtIn } from '../../../../shared/currency';
import { cashboxCurrency, caisseDiscrete, type Cashbox } from '../../../../shared/finance';
import { maisonNom } from '../../../../shared/identite';
import { identiteCourante } from '../../../../shared/journal';
import { cashbookPdf, type CashLedger, type CashGroup } from '../../../../shared/pdf';
import { useCaisses, soldeVisible } from './tiroirs';
import { monthKey, monthTitle, todayISO } from './_shared';

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
  /** La caisse d'où l'on vient — cochée seule au départ. */
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

  /* CE QUI NE S'IMPRIME PAS SE NOMME. Une caisse discrète refermée dirait son
     solde ligne à ligne : l'imprimer sans son code viderait le verrou de son
     sens. Mais un document amputé en silence vaudrait pire. */
  const fermees = branchBoxes.filter((c) => caisseDiscrete(c) && !soldeVisible(c, ouvertes));
  const lisibles = useMemo(
    () => branchBoxes.filter((c) => soldeVisible(c, ouvertes)),
    [branchBoxes, ouvertes],
  );
  const [choisies, setChoisies] = useState<ReadonlySet<string>>(
    () => new Set(lisibles.filter((c) => !nom || c.name === nom).map((c) => c.id)),
  );
  const retenues = lisibles.filter((c) => choisies.has(c.id));
  const bascule = (id: string) => setChoisies((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const periode = mode === 'periode' ? { de, a } : undefined;
  const debutISO = periode ? periode.de : premierJour(month);
  const finISO = periode ? periode.a : dernierJour(month);
  /* Sur le mois courant, la clôture n'est pas le 31 : c'est aujourd'hui. Dater
     la dernière ligne d'un jour à venir ferait lire un solde du futur. */
  const finLue = finISO > todayISO() ? todayISO() : finISO;
  const surPlusieursAnnees = debutISO.slice(0, 4) !== finLue.slice(0, 4);

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
      sub: [
        `${moves.length} mouvement${moves.length > 1 ? 's' : ''}`,
        c.horsBilan ? 'hors bilan' : null,
      ].filter(Boolean).join(' · '),
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

  const quand = periode
    ? `Du ${frLong(debutISO)} au ${frLong(finLue)}`
    : `${monthTitle(month)}${monthKey(month) === monthKey(todayISO())
      ? ` · arrêté au ${frLong(finLue)}`
      : ''}`;

  const editer = async () => {
    setErreur('');
    if (mode === 'periode' && de > a) { setErreur('La date de début est après celle de fin.'); return; }
    if (retenues.length === 0) { setErreur('Cochez au moins une caisse.'); return; }
    setEnCours(true);
    try {
      const par = identiteCourante().nom;
      const edite = `Édité le ${frLong(todayISO())} par ${par}`;
      const refus = fermees.map((c) => (
        `Absente de ce rapport : ${c.name} — caisse discrète refermée. `
        + 'Son livre ne s’imprime pas sans son code.'
      ));

      /* UNE SEULE CAISSE RETENUE MÉRITE SA PLEINE PAGE : les quatre cases de
         résumé n'ont de sens que sur une monnaie unique. À plusieurs, elles
         additionneraient ce qui ne s'additionne pas. */
      if (retenues.length === 1) {
        const seule = retenues[0];
        const l = construire(seule);
        const devise = cashboxCurrency(seule);
        await cashbookPdf({
          houseName: maisonNom(),
          eyebrow: 'Rapport de caisse',
          title: seule.name,
          meta: [`${branch.name} · ${devise}${seule.horsBilan ? ' · hors bilan' : ''}`, quand, edite],
          resume: [
            { label: l.openLabel, value: l.opening },
            { label: 'Entrées', value: l.totalIn || fmtIn(0, devise), tone: 'in' },
            { label: 'Sorties', value: l.totalOut || fmtIn(0, devise), tone: 'out' },
            { label: l.closeLabel, value: l.closing },
          ],
          groups: [{ ledgers: [l] }],
          refus: nom ? undefined : refus,
          filename: `rapport-caisse-${sansFioriture(seule.name)}-${debutISO}.pdf`,
        });
      } else {
        const auBilan = retenues.filter((c) => !c.horsBilan);
        const ecartees = retenues.filter((c) => !!c.horsBilan);
        await cashbookPdf({
          houseName: maisonNom(),
          eyebrow: 'Rapport des caisses',
          title: `Les caisses de ${branch.name}`,
          meta: [`${retenues.length} caisses retenues`, quand, edite],
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

  const boutonPeriode = (k: 'mois' | 'periode', l: string) => (
    <button
      key={k}
      className="trf-act"
      onClick={() => { setMode(k); setErreur(''); }}
      style={mode === k
        ? { background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)' }
        : undefined}
    >
      {l}
    </button>
  );

  return (
    <Modal title="Rapport de caisse" onClose={onClose} width={480}>
      {lisibles.length === 0 ? (
        <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
          Aucune caisse lisible. {fermees.length > 0
            ? 'Les caisses discrètes doivent être ouvertes avec leur code avant d’être imprimées.'
            : 'Déclarez une caisse d’abord.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
            Le livre de chaque tiroir sur une feuille : le solde au premier jour, tout ce qui entre
            et sort, le solde au dernier — et le solde qui court à chaque ligne.
          </div>

          {/* ── LA PÉRIODE ─────────────────────────────────────────────
              Le mois par défaut, la période libre en option — arbitrage de
              Yéman. Le mois est ce que Le Trône compte partout ailleurs. */}
          <div>
            <div className="mnd-field__label" style={{ marginBottom: 8 }}>La période</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {boutonPeriode('mois', monthTitle(month))}
              {boutonPeriode('periode', 'Une autre période')}
            </div>
            {mode === 'periode' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
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
          </div>

          {/* ── LES CAISSES, UNE À UNE ─────────────────────────────────
              Demandé le 22 août. Le rapport qu'on emporte à la banque ne
              porte pas les mêmes tiroirs que celui qu'on garde pour soi. */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <span className="mnd-field__label">Les caisses au rapport</span>
              <span style={{ display: 'flex', gap: 10 }}>
                <button
                  className="trf-lien"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontSize: 11.5, color: 'var(--color-copper)' }}
                  onClick={() => setChoisies(new Set(lisibles.map((c) => c.id)))}
                >
                  Toutes
                </button>
                <button
                  className="trf-lien"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontSize: 11.5, color: 'var(--ink-soft)' }}
                  onClick={() => setChoisies(new Set())}
                >
                  Aucune
                </button>
              </span>
            </div>

            <div style={{ border: '1px solid var(--hairline)', borderRadius: 3, maxHeight: '32vh', overflowY: 'auto' }}>
              {lisibles.map((c, i) => {
                const coche = choisies.has(c.id);
                const { balance } = boxMoves(c.name, periode);
                const devise = cashboxCurrency(c);
                return (
                  <label
                    key={c.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', cursor: 'pointer',
                      borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
                      background: coche ? 'var(--copper-50, #FAF1E9)' : 'transparent',
                    }}
                  >
                    <input type="checkbox" checked={coche} onChange={() => bascule(c.id)} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>{c.glyph} {c.name}</span>
                      <span className="mnd-muted" style={{ fontSize: 11, display: 'block', marginTop: 1 }}>
                        {devise}
                        {c.horsBilan ? ' · hors bilan' : ''}
                        {caisseDiscrete(c) ? ' · discrète' : ''}
                      </span>
                    </span>
                    <span className="mnd-serif" style={{ fontSize: 14, color: 'var(--color-indigo)', whiteSpace: 'nowrap' }}>
                      {fmtIn(balance, devise)}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 8 }}>
              {retenues.length === 0
                ? 'Aucune caisse cochée.'
                : retenues.length === 1
                  ? 'Une seule caisse : la feuille lui donne son résumé en quatre cases.'
                  : `${retenues.length} caisses, rangées par monnaie. Les monnaies ne s’additionnent pas.`}
            </div>
          </div>

          {fermees.length > 0 && (
            <div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--copper-700, #96412E)' }}>
              {fermees.map((c) => c.name).join(', ')} — caisse{fermees.length > 1 ? 's' : ''} discrète
              {fermees.length > 1 ? 's' : ''} refermée{fermees.length > 1 ? 's' : ''}. Le document dira
              {fermees.length > 1 ? ' leur' : ' son'} absence plutôt que de la taire.
            </div>
          )}

          {erreur && (
            <div style={{ fontSize: 12.5, color: 'var(--copper-700, #96412E)' }}>{erreur}</div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button className="mnd-btn mnd-btn--ghost" onClick={onClose}>Fermer</button>
        {lisibles.length > 0 && (
          <button className="mnd-btn" onClick={editer} disabled={enCours || retenues.length === 0}>
            {enCours ? 'Un instant…' : 'Éditer le PDF'}
          </button>
        )}
      </div>
    </Modal>
  );
}
