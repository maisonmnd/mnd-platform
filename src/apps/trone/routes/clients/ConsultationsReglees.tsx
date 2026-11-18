import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../../ds/components';
import { useStore } from '../../../../shared/store';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { lienWaMe } from '../../../../shared/conversations';
import { saFicheDite } from '../../../../shared/lecture-de-la-maison-pur';
import { consultationsQueueStore, type OnlineConsultation } from '../../../../shared/bridges';
import { deposeUnTemoin, momentsDeLaPrivee, poseLaPrivee, voirUnTemoin, type ConsultationSuivie } from '../../../../shared/visios';
import { jourDit } from '../../../../shared/visio-pur';
import type { MomentChoisi } from '../../../../shared/consultation-privee-pur';

/* ══ C · LES CONSULTATIONS PRIVÉES RÉGLÉES — 13 novembre 2026 (lot 3) ══════
   Maquette T1, la file C. Une consultation gratuite du site, dont la cliente
   a réglé les 15 000 F de la consultation privée juste après sa lecture
   (KkiaPay, vérifié par `kkiapay-verify` sur l'identifiant de la
   consultation). Ici, la Maison :
     · voit son rendez-vous du Carnet : depuis le 17 novembre 2026, le moment
       se choisit au paiement et la fonction `visio-salle` le pose sous le
       verrou des places ; un moment qui n'était plus libre, ou une
       consultation réglée sans moment, se pose d'ici (« Poser au Carnet ») ;
     · à défaut, fixe le moment avec elle (WhatsApp), et le note ;
     · pose les photos des locks témoins faites devant elle (trois au plus,
       compartiment `temoins`, lu par l'équipe seule) ;
     · prépare le devis ferme, la consultation déduite. */

const lab = { fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-soft)', fontWeight: 600 };
const TEMOINS_AU_PLUS = 3;

/** Une consultation de la file C : déposée sur le site, réglée, pas fermée. */
export const estReglee = (o: OnlineConsultation): boolean => o.modalite === 'auto' && o.paidXof > 0 && o.status !== 'fermée';

const ecris = (id: string, fn: (o: OnlineConsultation) => OnlineConsultation) =>
  consultationsQueueStore.set((prev) => prev.map((o) => (o.id === id ? fn(o) : o)));

export function ConsultationsReglees() {
  const [queue] = useStore(consultationsQueueStore);
  const { currency } = useBranch();
  const navigate = useNavigate();
  const reglees = queue.filter(estReglee).sort((a, b) => (b.payeLe ?? b.createdAt).localeCompare(a.payeLe ?? a.createdAt));
  /* LE FILET : une consultation réglée dont le moment choisi n'a pas encore sa
     place au Carnet (le site a été fermé avant la pose) la reçoit ici, une
     fois, par la même fonction et sous le même verrou. Refusée, elle ne se
     retente pas seule : la Maison choisit un autre moment. */
  const tentees = useRef(new Set<string>());
  useEffect(() => {
    for (const o of reglees as ConsultationSuivie[]) {
      if (!o.momentVoulu || o.rdvId || o.momentRefuse || tentees.current.has(o.id)) continue;
      tentees.current.add(o.id);
      void poseLaPrivee(o.id);
    }
  });
  if (!reglees.length) return null;
  const argent = (n: number) => fmtMoney(n, currency);

  return (
    <section style={{ marginBottom: 26, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-indigo)' }}>C · Consultations privées réglées</span>
        <span className="mnd-muted" style={{ fontSize: 12 }}>{reglees.length} · réglées en ligne après leur lecture · le montant est déduit du rituel</span>
      </div>
      {reglees.map((o) => {
        const e = o.estimation;
        const prenom = o.client.name.trim().split(/\s+/)[0] ?? '';
        const wa = lienWaMe(o.client.phone, `Bonjour ${prenom}, ici la Maison MND. Votre consultation privée est bien réglée, merci. Quel moment vous convient pour venir à la Maison ?`);
        return (
          <article key={o.id} style={{ border: '1px solid var(--hairline)', borderLeft: `2px solid ${o.momentFixe ? 'var(--hairline)' : 'var(--copper-500)'}`, borderRadius: 3, background: 'var(--surface-card)', padding: '14px 16px', display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span>
                <b style={{ fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 400, color: 'var(--color-indigo)' }}>{o.client.name}</b>
                <span className="mnd-muted" style={{ fontSize: 12, marginLeft: 8 }}>{o.client.phone}{o.payeLe ? ` · réglée le ${new Date(o.payeLe).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</span>
              </span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="trv-status trv-status--payee">{argent(o.paidXof)} réglés</span>
                {o.garde === 'peau' && <span className="trv-status trv-status--envoyee">garde médicale</span>}
                {(o as ConsultationSuivie).rdvId && <span className="trv-status trv-status--envoyee">au Carnet</span>}
                {!o.momentFixe && <span className="trv-status trv-status--avalider">moment à fixer</span>}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div>
                <div style={lab}>Ce qu’elle a coché</div>
                <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>{(o.besoins ?? []).map((b) => b.mots).join(' · ') || (saFicheDite(o.answers) ? '' : 'rien de coché')}</p>
                {saFicheDite(o.answers) && <p className="mnd-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{saFicheDite(o.answers)}</p>}
              </div>
              <div>
                <div style={lab}>Lecture du moteur</div>
                <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>
                  {(e?.lignes.filter((l) => l.retenue) ?? []).map((l) => l.nom).join(' · ') || 'rien de retenu'}
                  {e ? ` · ${e.min === e.max ? argent(e.min) : `${argent(e.min)} à ${argent(e.max)}`}` : ''}
                </p>
              </div>
              <MomentFixe o={o} />
            </div>
            <AuCarnet o={o as ConsultationSuivie} />
            <Temoins o={o} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {wa && <Button size="sm" variant="ghost" onClick={() => window.open(wa, '_blank', 'noopener')}>Écrire pour fixer le moment</Button>}
              <Button size="sm" onClick={() => navigate(`/factures?nouveau=devis&consultation=${encodeURIComponent(o.id)}&ferme=1`)}>Préparer le devis ferme</Button>
              <Button size="sm" variant="ghost" onClick={() => ecris(o.id, (x) => ({ ...x, status: 'fermée' }))}>Fermer</Button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

/* ── AU CARNET — 17 novembre 2026 ──────────────────────────────────────────
   La consultation privée est un vrai rendez-vous : posé par `visio-salle`
   sous le verrou des places, aux heures que l'agenda propose (jamais le jour
   même, premier rendez-vous à 08:30). Ici, la Maison voit où il en est, et le
   pose elle-même quand le moment choisi n'était plus libre. */
const raisonDite = (r: string): string =>
  r === 'creneau_pris' ? 'la place a été prise entre-temps'
    : r === 'creneau_ferme' ? 'la Maison est fermée ce jour-là'
    : r === 'creneau_hors_fenetre' ? 'le jour est trop proche ou trop loin'
    : r === 'creneau_plafond' ? 'la journée est pleine'
    : r === 'a-regler' ? 'le règlement n’est pas au registre'
    : 'la place n’a pas pu être posée';

function AuCarnet({ o }: { o: ConsultationSuivie }) {
  const [moments, setMoments] = useState<MomentChoisi[] | null>(null);
  const [jour, setJour] = useState('');
  const [heure, setHeure] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [mot, setMot] = useState<string | null>(null);
  if (o.rdvId) {
    return <p className="mnd-muted" style={{ fontSize: 12.5, margin: 0 }}>Au Carnet : {o.rdv ? `${jourDit(o.rdv.date)} · ${o.rdv.time}` : o.momentFixe ?? 'rendez-vous posé'}.</p>;
  }
  const ouvre = async () => {
    setMot(null);
    const m = await momentsDeLaPrivee();
    setMoments(m);
    setJour(m[0]?.jour ?? '');
    setHeure('');
  };
  const pose = async () => {
    if (!jour || !heure || envoi) return;
    setEnvoi(true);
    const r = await poseLaPrivee(o.id, { jour, heure });
    setEnvoi(false);
    if (r.ok) { setMoments(null); setMot(`Posée au Carnet : ${jourDit(jour)} · ${heure}.`); } else setMot(`Pas posée : ${raisonDite(r.motif ?? '')}.`);
  };
  const jours = [...new Set((moments ?? []).map((m) => m.jour))];
  const heures = (moments ?? []).filter((m) => m.jour === jour).map((m) => m.heure);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {o.momentVoulu && (
        <p className="mnd-muted" style={{ fontSize: 12.5, margin: 0 }}>
          Moment choisi au paiement : {jourDit(o.momentVoulu.jour)} · {o.momentVoulu.heure}
          {o.momentRefuse ? `, pas posé : ${raisonDite(o.momentRefuse.raison)}.` : ', en cours de pose au Carnet.'}
        </p>
      )}
      {moments === null
        ? <div><Button size="sm" variant="ghost" onClick={() => void ouvre()}>Poser au Carnet</Button></div>
        : moments.length === 0
          ? <p className="mnd-muted" style={{ fontSize: 12.5, margin: 0 }}>Aucun moment libre à proposer : l’agenda ne se lit pas, ou les prochains jours sont pleins.</p>
          : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="mnd-input" style={{ width: 'auto' }} aria-label="Le jour" value={jour} onChange={(e) => { setJour(e.target.value); setHeure(''); }}>
                {jours.map((j) => <option key={j} value={j}>{jourDit(j)}</option>)}
              </select>
              <select className="mnd-input" style={{ width: 'auto' }} aria-label="L’heure" value={heure} onChange={(e) => setHeure(e.target.value)}>
                <option value="">l’heure</option>
                {heures.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <Button size="sm" disabled={!heure || envoi} onClick={() => void pose()}>{envoi ? 'Pose' : 'Poser au Carnet'}</Button>
              <Button size="sm" variant="ghost" onClick={() => setMoments(null)}>Fermer</Button>
            </div>
          )}
      {mot && <p className="mnd-muted" role="status" style={{ fontSize: 12.5, margin: 0 }}>{mot}</p>}
    </div>
  );
}

function MomentFixe({ o }: { o: OnlineConsultation }) {
  const [texte, setTexte] = useState(o.momentFixe ?? '');
  useEffect(() => { setTexte(o.momentFixe ?? ''); }, [o.momentFixe]);
  return (
    <div>
      <label style={lab} htmlFor={`mf-${o.id}`}>Le moment fixé</label>
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <input id={`mf-${o.id}`} className="mnd-input" style={{ flex: 1, minWidth: 0 }} placeholder="mercredi 18 novembre, 10 h" value={texte} onChange={(e) => setTexte(e.target.value)} />
        <Button size="sm" variant="ghost" disabled={texte.trim() === (o.momentFixe ?? '')} onClick={() => ecris(o.id, (x) => ({ ...x, momentFixe: texte.trim() || undefined, status: texte.trim() ? 'traitée' : x.status }))}>Noter</Button>
      </div>
    </div>
  );
}

function Temoins({ o }: { o: OnlineConsultation }) {
  const chemins = o.temoins ?? [];
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  const [mot, setMot] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    for (const c of chemins) {
      if (urls[c]) continue;
      void voirUnTemoin(c).then((u) => { if (vivant && u) setUrls((x) => ({ ...x, [c]: u })); });
    }
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chemins.join('|')]);
  const ajoute = async (f: File | undefined) => {
    if (!f || envoi) return;
    setEnvoi(true);
    setMot(null);
    const chemin = await deposeUnTemoin(o.id, f);
    setEnvoi(false);
    if (!chemin) { setMot('La photo n’est pas partie. Le compartiment des témoins arrive avec la migration 0209.'); return; }
    ecris(o.id, (x) => ({ ...x, temoins: [...(x.temoins ?? []), chemin].slice(0, TEMOINS_AU_PLUS) }));
  };
  return (
    <div>
      <div style={lab}>Locks témoins</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
        {chemins.map((c, i) => (
          <a key={c} href={urls[c]} target="_blank" rel="noopener" style={{ width: 72, height: 72, borderRadius: 2, border: '1px solid var(--hairline)', background: urls[c] ? `center / cover no-repeat url("${urls[c]}")` : 'var(--indigo-50)', display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--ink-soft)', textDecoration: 'none' }} aria-label={`Témoin ${i + 1}`}>
            {urls[c] ? '' : `témoin ${i + 1}`}
          </a>
        ))}
        {chemins.length < TEMOINS_AU_PLUS && (
          <label style={{ width: 72, height: 72, borderRadius: 2, border: '1px dashed var(--hairline)', display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--ink-soft)', cursor: 'pointer', textAlign: 'center' }}>
            {envoi ? 'envoi' : `témoin ${chemins.length + 1}`}
            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { void ajoute(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        )}
      </div>
      {mot && <p className="mnd-muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{mot}</p>}
    </div>
  );
}
