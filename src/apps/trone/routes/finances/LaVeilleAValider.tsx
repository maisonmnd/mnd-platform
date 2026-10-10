import { useMemo, useState } from 'react';
import { fmtIn } from '../../../../shared/currency';
import { useStaff as useMaTete } from '../../../../shared/auth';
import { cashboxCurrency, useCashboxes, useEntreesHorsActivite, useExpenses } from '../../../../shared/finance';
import { cloturesStore, useClotures } from '../../../../shared/caisse-du-soir';
import { aValider, pourquoiOnNeValidePas, tiroirsQuiSeComptent, tiroirsSansCloture, type Cloture } from '../../../../shared/caisse-du-soir-pur';
import { useBranch } from '../../../../shared/branches';
import { useRegistreEncaissements, todayISO } from './_shared';
import { ClotureDuTiroir } from './ClotureDuTiroir';
import './caisse-du-soir.css';

/* ══ LA VEILLE À VALIDER — 3 octobre 2026 ════════════════════════════════
   Maquette « Le pointage du jour », validée. En tête du tableau de bord,
   pour la direction : chaque écart déclaré et pas encore tranché, et les
   tiroirs qui ont bougé hier sans être clôturés. « Un écart déclaré est une
   erreur ; un écart découvert est une faute » (règlement intérieur).

   SEUL LE SOUVERAIN décide (Brice et Yéman, arbitrage du 3 octobre), jamais
   celui qui a déclaré l'écart ; la base le garde aussi (0113). Le gérant
   voit, sans boutons. Les autres ne voient rien. */

const hier = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};
const jourDit = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

export function LaVeilleAValider() {
  const me = useMaTete();
  const { branch } = useBranch();
  const [clotures] = useClotures();
  const [boxes] = useCashboxes();
  const [expenses] = useExpenses();
  const [horsActivite] = useEntreesHorsActivite();
  const registre = useRegistreEncaissements();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [reprise, setReprise] = useState<string | null>(null);
  const [mot, setMot] = useState('');
  const moi = me?.name?.trim() || 'Sans nom';
  const souverain = me?.role === 'souverain';
  const voit = souverain || me?.role === 'gerant';

  const veille = hier(todayISO());
  const ecarts = useMemo(() => aValider(clotures, branch.id), [clotures, branch.id]);
  /* Seuls les tiroirs que la fenêtre de clôture laisse compter (10 octobre
     2026) : une caisse hors bilan qui a bougé hier n'est pas un oubli. */
  const oublies = useMemo(() => tiroirsSansCloture({
    branchId: branch.id, date: veille, registre, depenses: expenses, clotures,
    seComptent: new Set(tiroirsQuiSeComptent(boxes, branch.id).map((b) => b.name)),
    /* Un prélèvement de l'associé, seul mouvement de la veille, est un oubli
       à signaler : il n'entre pas au registre (10 octobre 2026). */
    horsActivite,
  }), [branch.id, veille, registre, expenses, clotures, boxes, horsActivite]);

  if (!voit || (ecarts.length === 0 && oublies.length === 0)) return null;

  const deviseDe = (nom: string) => {
    const b = boxes.find((x) => x.branchId === branch.id && x.name === nom);
    return b ? cashboxCurrency(b) : 'XOF';
  };
  const decide = (c: Cloture, verdict: 'accepte' | 'repris', motDit?: string) => {
    cloturesStore.set((prev) => prev.map((x) => (x.id === c.id
      ? { ...x, validation: { verdict, par: moi, le: new Date().toISOString(), ...(motDit?.trim() ? { mot: motDit.trim() } : {}) } }
      : x)));
    setReprise(null); setMot('');
  };

  return (
    <div style={{ marginTop: 22, border: '1px solid var(--hairline)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--hairline)', background: 'var(--copper-50, #FAF1E9)' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}>Les caisses à valider</span>
        <span className="mnd-muted" style={{ fontSize: 12 }}>
          {[ecarts.length ? `${ecarts.length} écart${ecarts.length > 1 ? 's' : ''} déclaré${ecarts.length > 1 ? 's' : ''}` : null,
            oublies.length ? `${oublies.length} tiroir${oublies.length > 1 ? 's' : ''} pas clôturé${oublies.length > 1 ? 's' : ''} hier` : null].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="cds-veille" style={{ padding: '0 16px 6px' }}>
        {ecarts.map((c) => {
          const f = (n: number) => fmtIn(n, deviseDe(c.cashbox));
          const empeche = pourquoiOnNeValidePas({ estSouverain: souverain, moi, cloture: c });
          return (
            <div className="cds-veille__ligne" key={c.id}>
              <div>
                <b>{c.cashbox} · {jourDit(c.date)}</b>
                <small>
                  Clôturé à {new Date(c.le).toTimeString().slice(0, 5)} par {c.par} · attendu {f(c.attenduXof)}, compté {f(c.compteXof)}
                  {c.depenses?.length ? ` · ${c.depenses.length} dépense${c.depenses.length > 1 ? 's' : ''} écrite${c.depenses.length > 1 ? 's' : ''} au comptage` : ''}
                </small>
                {c.note && <small><q>{c.note}</q></small>}
              </div>
              <span className="cds-puce is-ecart">{c.ecartXof > 0 ? '+ ' : '− '}{f(Math.abs(c.ecartXof))}</span>
              {souverain ? (
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" className="cds-bouton is-indigo" disabled={!!empeche} title={empeche ?? ''} onClick={() => decide(c, 'accepte')}>Accepter</button>
                  <button type="button" className="cds-bouton" disabled={!!empeche} title={empeche ?? ''} onClick={() => { setReprise(c.id); setMot(''); }}>Reprendre</button>
                </span>
              ) : <span className="mnd-muted" style={{ fontSize: 12 }}>La direction tranche.</span>}
              {souverain && empeche && <small className="cds-souci" style={{ gridColumn: '1 / -1' }}>{empeche}</small>}
              {reprise === c.id && (
                <div className="cds-veille__mot">
                  <input className="mnd-input" value={mot} onChange={(e) => setMot(e.target.value)} placeholder="Un mot pour celui qui recompte" autoFocus />
                  <button type="button" className="cds-bouton is-plein" onClick={() => decide(c, 'repris', mot)}>Rouvrir le tiroir</button>
                  <button type="button" className="cds-bouton" onClick={() => setReprise(null)}>Annuler</button>
                </div>
              )}
            </div>
          );
        })}
        {oublies.map((nom) => (
          <div className="cds-veille__ligne" key={`oubli-${nom}`}>
            <div>
              <b>{nom} · {jourDit(veille)}</b>
              <small>Il a bougé hier et n’a pas été clôturé. Le prochain comptage couvrira ces jours-là.</small>
            </div>
            <span className="cds-puce is-attente">pas clôturé</span>
            <button type="button" className="cds-bouton" onClick={() => setOuvert(nom)}>Compter maintenant</button>
          </div>
        ))}
      </div>
      {ouvert && <ClotureDuTiroir tiroir={ouvert} jour={veille} onClose={() => setOuvert(null)} />}
    </div>
  );
}
