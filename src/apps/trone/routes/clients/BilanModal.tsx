import { useMemo, useState } from 'react';
import { Button, Field, Input, Modal, toast } from '../../../../ds/components';
import { asset } from '../../../../shared/asset';
import type { Client } from '../../../../shared/clients';
import type { Appointment } from '../../../../shared/agenda';
import type { Service } from '../../../../shared/catalog';
import {
  JAUGES_SEED, RITUEL_SEED, dernierBilanDe, prochainNumeroBilan, remettreBilan, useBilans,
  type JaugeBilan, type TempsRituel,
} from '../../../../shared/bilans';
import { apptLabel, frShort, todayISO } from './_shared';

/* LA REMISE D'UN BILAN — le Carnet de Suivi s'écrit ICI, puis s'imprime.

   Avant, le bouton de la fiche ouvrait la papeterie : belle, pré-remplie,
   et AMNÉSIQUE — rien n'attestait la remise, rien ne se relisait. Désormais
   la maîtresse rédige dans cette modale, « Remettre » ENREGISTRE (la cliente
   le lit sur Ma Couronne), et « Imprimer » ouvre la même papeterie, portant
   exactement ce qui a été remis.

   LE PROCHAIN BILAN SE PRÉ-REMPLIT DU PRÉCÉDENT : jauges, rituel, durée —
   la couronne s'évalue dans la continuité, pas depuis une page blanche. */

const POINTS_VIDES = ['', '', ''];

export function BilanModal({ client, honored, byId, branchId, onClose }: {
  client: Client;
  honored: Appointment[];
  byId: Map<string, Service>;
  branchId: string;
  onClose: () => void;
}) {
  const [bilans] = useBilans();
  const precedent = dernierBilanDe(bilans, client.id);
  const template = useMemo(
    () => [...honored].sort((a, b) => b.date.localeCompare(a.date))[0],
    [honored],
  );

  const [date, setDate] = useState(template?.date ?? todayISO());
  const [prestation, setPrestation] = useState(template ? apptLabel(template, byId) : '');
  const [praticien, setPraticien] = useState(template?.master ?? precedent?.praticien ?? '');
  const [duree, setDuree] = useState(precedent?.duree ?? '');
  const [prochaineVisite, setProchaineVisite] = useState('');
  const [jauges, setJauges] = useState<JaugeBilan[]>(
    (precedent?.jauges?.length ? precedent.jauges : JAUGES_SEED).map((j) => ({ ...j })),
  );
  const [points, setPoints] = useState<string[]>(
    precedent?.points?.length ? [...precedent.points, '', ''].slice(0, 3) : POINTS_VIDES,
  );
  const [rituel, setRituel] = useState<TempsRituel[]>(
    (precedent?.rituel?.length ? precedent.rituel : RITUEL_SEED).map((t) => ({ ...t })),
  );
  const numero = prochainNumeroBilan(bilans);
  const [remisEnCours, setRemisEnCours] = useState(false);

  const setJauge = (i: number, patch: Partial<JaugeBilan>) =>
    setJauges((js) => js.map((j, k) => (k === i ? { ...j, ...patch } : j)));
  const setPoint = (i: number, v: string) => setPoints((ps) => ps.map((p, k) => (k === i ? v : p)));
  const setTemps = (i: number, v: string) => setRituel((ts) => ts.map((t, k) => (k === i ? { ...t, texte: v } : t)));

  /* La papeterie reçoit TOUT — méta par les champs, contenu par `b` (JSON,
     forme de la page). Elle imprime ce qui a été remis, au mot près. */
  const lienPapeterie = () => {
    const p = new URLSearchParams({ client: client.name, service: prestation, date, praticien, duree, next: prochaineVisite, num: numero });
    p.set('b', JSON.stringify({
      jauges: jauges.map((j) => ({ name: j.nom, note: j.note, value: j.valeur })),
      points: points.filter((t) => t.trim()),
      rituel: rituel.map((t) => ({ name: t.nom, cadence: t.cadence, txt: t.texte })),
    }));
    return `${asset('/bilan.html')}?${p.toString()}`;
  };

  const remettre = () => {
    if (remisEnCours) return;
    setRemisEnCours(true);
    remettreBilan({
      branchId,
      clientId: client.id,
      apptId: template?.id,
      numero,
      date,
      prestation: prestation.trim() || undefined,
      praticien: praticien.trim() || undefined,
      duree: duree.trim() || undefined,
      prochaineVisite: prochaineVisite.trim() || undefined,
      jauges,
      points: points.map((t) => t.trim()).filter(Boolean),
      rituel,
      remisLe: todayISO(),
    });
    toast(`Bilan ${numero} remis — ${client.name.split(' ')[0]} le lit sur Ma Couronne.`);
    onClose();
  };

  const lb: React.CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' };

  return (
    <Modal title={`Bilan de séance · ${client.name.split(' ')[0]}.`} onClose={onClose} width={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          {precedent
            ? `Pré-rempli du bilan ${precedent.numero} (${frShort(precedent.date)}) — la couronne s'évalue dans la continuité.`
            : 'Premier bilan de cette couronne — les Quatre Temps partent de la voix de la maison.'}
          {' '}Numéro : <b style={{ fontWeight: 500 }}>{numero}</b>.
        </div>

        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Séance du"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Durée"><Input value={duree} onChange={(e) => setDuree(e.target.value)} placeholder="2 h 30" /></Field>
        </div>
        <Field label="Prestation"><Input value={prestation} onChange={(e) => setPrestation(e.target.value)} /></Field>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Praticien"><Input value={praticien} onChange={(e) => setPraticien(e.target.value)} /></Field>
          <Field label="Prochaine visite conseillée"><Input value={prochaineVisite} onChange={(e) => setProchaineVisite(e.target.value)} placeholder="Semaine du 31 août" /></Field>
        </div>

        <div>
          <div style={lb}>L'état de la couronne</div>
          {jauges.map((j, i) => (
            <div key={j.nom} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--hairline)', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, minWidth: 130 }}>{j.nom}</span>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-label={`${j.nom} : ${v} sur 5`}
                    onClick={() => setJauge(i, { valeur: v })}
                    style={{
                      width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                      border: '1.5px solid var(--color-copper)',
                      background: v <= j.valeur ? 'var(--color-copper)' : 'transparent',
                    }}
                  />
                ))}
              </span>
              <Input value={j.note} onChange={(e) => setJauge(i, { note: e.target.value })} style={{ flex: 1, minWidth: 110, padding: '6px 10px', fontSize: 12.5 }} aria-label={`Note · ${j.nom}`} />
            </div>
          ))}
        </div>

        <div>
          <div style={lb}>Les points clés de la séance</div>
          {points.map((p, i) => (
            <textarea
              key={i}
              className="mnd-input"
              rows={2}
              value={p}
              placeholder={i === 0 ? 'Ce que la séance a fait, ce que la couronne a dit…' : 'Point suivant (facultatif)'}
              onChange={(e) => setPoint(i, e.target.value)}
              style={{ width: '100%', marginTop: 8, resize: 'vertical', fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5 }}
            />
          ))}
        </div>

        <div>
          <div style={lb}>Le rituel à domicile — les Quatre Temps</div>
          {rituel.map((t, i) => (
            <div key={t.nom} style={{ marginTop: 10 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>
                {t.nom} <span className="mnd-muted" style={{ fontFamily: 'var(--font-sans)', fontSize: 11 }}>· {t.cadence}</span>
              </div>
              <textarea
                className="mnd-input"
                rows={2}
                value={t.texte}
                onChange={(e) => setTemps(i, e.target.value)}
                style={{ width: '100%', marginTop: 5, resize: 'vertical', fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5 }}
                aria-label={`Rituel · ${t.nom}`}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <a className="mnd-btn mnd-btn--ghost" href={lienPapeterie()} target="_blank" rel="noreferrer">
            Imprimer / PDF
          </a>
          <Button variant="copper" onClick={remettre} disabled={remisEnCours}>
            Remettre à {client.name.split(' ')[0]}
          </Button>
        </div>
        <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
          « Remettre » inscrit le bilan au registre : la cliente le lit sur Ma Couronne, et le
          prochain bilan partira de celui-ci. L'impression reste possible avant comme après.
        </div>
      </div>
    </Modal>
  );
}
