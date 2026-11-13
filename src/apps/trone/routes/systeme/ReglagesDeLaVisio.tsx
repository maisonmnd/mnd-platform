import { useEffect, useState } from 'react';
import { Button } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { etatDuService, useReglagesDeLaVisio } from '../../../../shared/visios';
import { DUREE_MIN, creneauxOuverts, heureDite, jourCourtDit, parJour } from '../../../../shared/visio-pur';

/* ══ LA VISIO, SES RÉGLAGES — 13 novembre 2026 (la Consultation, lot 3) ════
   Système › Besoins et règles › La visio. Les jours et les quarts d'heure
   que la Maison ouvre (« quatre par matinée, réglable »), combien de jours
   à l'avance, le délai avant un créneau, et l'interrupteur. Le site ne
   propose la visio que si elle est allumée ICI ET que la clé du service de
   visio (Daily) est posée chez Supabase : l'écran dit les deux. Écrit par
   la direction seule (0209). */

const JOURS = [
  { n: 1, dit: 'lundi' }, { n: 2, dit: 'mardi' }, { n: 3, dit: 'mercredi' }, { n: 4, dit: 'jeudi' },
  { n: 5, dit: 'vendredi' }, { n: 6, dit: 'samedi' }, { n: 7, dit: 'dimanche' },
];
const lab = { fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-soft)', fontWeight: 600, display: 'block', marginBottom: 6 };

export function ReglagesDeLaVisio({ estDirection }: { estDirection: boolean }) {
  const [r, ecris] = useReglagesDeLaVisio();
  const moi = useStaff();
  const par = moi?.name ?? undefined;
  const [service, setService] = useState<{ joignable: boolean; cle: boolean; actif: boolean } | null>(null);
  const [heure, setHeure] = useState('');
  useEffect(() => { void etatDuService().then(setService); }, [r.actif]);
  const apercu = parJour(creneauxOuverts(r, Date.now(), [])).slice(0, 5);

  const ajouteHeure = () => {
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(heure)) return;
    ecris((d) => ({ ...d, heures: [...new Set([...d.heures, heure])].sort() }), par);
    setHeure('');
  };

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 760 }}>
      <p className="mnd-muted" style={{ margin: 0, fontSize: 13 }}>
        Des quarts d’heure de visio gratuite, réservés depuis la consultation du site. Chaque visio dure {DUREE_MIN} minutes ;
        le compte à rebours s’allume à 13 minutes et la salle se ferme d’elle-même à 15.
      </p>

      <div style={{ border: '1px solid var(--hairline)', borderRadius: 3, padding: '12px 14px', display: 'grid', gap: 6, fontSize: 13.5 }}>
        <span style={lab}>L’état</span>
        <span>Ici : <b>{r.actif ? 'allumée' : 'éteinte'}</b>.</span>
        <span>
          Le service de visio :{' '}
          {!service ? 'vérification…'
            : !service.joignable ? <b>la fonction visio-salle ne répond pas encore</b>
            : service.cle ? <b>branché</b> : <b>la clé Daily manque</b>}.
        </span>
        <span className="mnd-muted" style={{ fontSize: 12.5 }}>
          {service?.actif ? 'Le site propose la visio.' : 'Le site ne propose pas encore la visio : il faut les deux.'}
          {service && service.joignable && !service.cle ? ' La clé se crée sur un compte Daily, ouvert par la Maison ; la session la pose ensuite comme secret.' : ''}
        </span>
      </div>

      <fieldset disabled={!estDirection} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 20 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
          <input type="checkbox" checked={r.actif} onChange={(e) => ecris((d) => ({ ...d, actif: e.target.checked }), par)} />
          Proposer la visio gratuite sur le site
        </label>

        <div>
          <span style={lab}>Les jours</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {JOURS.map((j) => {
              const on = r.jours.includes(j.n);
              return (
                <button key={j.n} type="button" className={`trv-tab ${on ? 'is-active' : ''}`} aria-pressed={on}
                  onClick={() => ecris((d) => ({ ...d, jours: on ? d.jours.filter((x) => x !== j.n) : [...d.jours, j.n].sort() }), par)}>
                  {j.dit}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span style={lab}>Les quarts d’heure (heure de Cotonou)</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {r.heures.map((h) => (
              <span key={h} className="trv-status" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                {h}
                <button type="button" aria-label={`Retirer ${h}`} onClick={() => ecris((d) => ({ ...d, heures: d.heures.filter((x) => x !== h) }), par)}
                  style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--ink-soft)', padding: 0 }}>×</button>
              </span>
            ))}
            <input className="mnd-input" style={{ width: 90 }} type="time" step={900} value={heure} onChange={(e) => setHeure(e.target.value)} aria-label="Un quart d’heure à ajouter" />
            <Button size="sm" variant="ghost" onClick={ajouteHeure} disabled={!heure}>Ajouter</Button>
          </div>
          <p className="mnd-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>{r.heures.length} visio{r.heures.length > 1 ? 's' : ''} au plus par jour ouvert.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <label style={{ fontSize: 13.5 }}>
            <span style={lab}>Proposée … jours à l’avance</span>
            <input className="mnd-input" inputMode="numeric" value={r.horizonJours} onChange={(e) => ecris((d) => ({ ...d, horizonJours: Number(e.target.value.replace(/\D/g, '')) || 1 }), par)} />
          </label>
          <label style={{ fontSize: 13.5 }}>
            <span style={lab}>Pas de créneau à moins de … minutes</span>
            <input className="mnd-input" inputMode="numeric" value={r.delaiMin} onChange={(e) => ecris((d) => ({ ...d, delaiMin: Number(e.target.value.replace(/\D/g, '')) || 0 }), par)} />
          </label>
          <label style={{ fontSize: 13.5 }}>
            <span style={lab}>Visios à venir par numéro</span>
            <input className="mnd-input" inputMode="numeric" value={r.parTelephone} onChange={(e) => ecris((d) => ({ ...d, parTelephone: Number(e.target.value.replace(/\D/g, '')) || 1 }), par)} />
          </label>
        </div>
      </fieldset>

      <div>
        <span style={lab}>Ce que verra le site (sans compter les créneaux déjà pris)</span>
        {apercu.length ? (
          <div style={{ display: 'grid', gap: 4, fontSize: 13.5 }}>
            {apercu.map((j) => <span key={j.jour}><b style={{ fontWeight: 500 }}>{jourCourtDit(j.jour)}</b> · {j.creneaux.map((c) => heureDite(c.debut)).join(', ')}</span>)}
          </div>
        ) : <p className="mnd-muted" style={{ fontSize: 13, margin: 0 }}>Aucun créneau avec ces réglages.</p>}
        {r.modifieLe && <p className="mnd-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Modifié le {new Date(r.modifieLe).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}{r.modifiePar ? ` par ${r.modifiePar}` : ''}.</p>}
      </div>
    </div>
  );
}
