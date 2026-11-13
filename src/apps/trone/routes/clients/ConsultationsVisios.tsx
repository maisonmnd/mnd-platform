import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../../ds/components';
import { useStore } from '../../../../shared/store';
import { useBranch } from '../../../../shared/branches';
import { useStaff } from '../../../../shared/auth';
import { fmtMoney } from '../../../../shared/currency';
import { consultationsQueueStore, type OnlineConsultation } from '../../../../shared/bridges';
import { ecrisLaVisio, entreeDeLaMaison, useVisios, type Visio } from '../../../../shared/visios';
import {
  AVANT_L_ENTREE_MIN, DUREE_MIN, LONGUEURS, NIVEAUX, SUITES,
  anneauAllume, ecouleDit, heureDite, jourDeCotonou, jourDit, minutesSecondes, phaseDe, priveeObligatoire, resteS,
  type ResumeDeLaVisio,
} from '../../../../shared/visio-pur';
import './visios.css';

/* ══ B · LES VISIOS — 13 novembre 2026 (la Consultation, lot 3) ════════════
   Maquette V4 et « La porte B ». Les visios réservées sur le site (fonction
   `visio-salle`), celles du jour d'abord. La Maison entre dans la salle
   d'ici (propriétaire), voit le même compte à rebours que la cliente, et
   écrit la lecture confirmée en trois touches : le niveau, la longueur, la
   suite. La cliente la reçoit quand la salle se ferme. */

const lab = { fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-soft)', fontWeight: 600 };
const statutDit: Record<Visio['statut'], string> = { 'réservée': 'réservée', 'annulée': 'annulée', tenue: 'tenue', 'manquée': 'manquée' };

export function ConsultationsVisios() {
  const { visios, absente, relis } = useVisios();
  const [queue] = useStore(consultationsQueueStore);
  const { currency } = useBranch();
  const [salle, setSalle] = useState<Visio | null>(null);
  const [resume, setResume] = useState<string | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setMaintenant(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  if (absente) {
    return (
      <section style={{ marginBottom: 26 }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-indigo)' }}>B · Visios</span>
        <p className="mnd-muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>La table des visios arrive avec la migration 0209 : rien à montrer tant qu’elle n’est pas passée.</p>
      </section>
    );
  }
  const visibles = visios.filter((v) => v.statut !== 'annulée' || Date.parse(v.debut) > maintenant - 86_400_000);
  if (!visibles.length) return null;
  const aujourdhui = jourDeCotonou(maintenant);
  const duJour = visibles.filter((v) => jourDeCotonou(Date.parse(v.debut)) === aujourdhui && v.statut !== 'annulée').length;
  const argent = (n: number) => fmtMoney(n, currency);
  const consultationDe = (v: Visio): OnlineConsultation | undefined => (v.consultationId ? queue.find((o) => o.id === v.consultationId) : undefined);

  return (
    <section style={{ marginBottom: 26, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-indigo)' }}>B · Visios</span>
        <span className="mnd-muted" style={{ fontSize: 12 }}>{duJour} aujourd’hui · quinze minutes, la salle se ferme d’elle-même</span>
      </div>
      {visibles.map((v) => {
        const debutMs = Date.parse(v.debut);
        const finMs = Date.parse(v.fin);
        const phase = phaseDe(debutMs, finMs, maintenant);
        const c = consultationDe(v);
        const jour = jourDeCotonou(debutMs);
        const enCours = phase === 'echange' || phase === 'rebours';
        return (
          <article key={v.id} className={`tvz-carte ${enCours ? 'is-en-cours' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span>
                <b style={{ fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 400, color: 'var(--color-indigo)' }}>{v.nom}</b>
                <span className="mnd-muted" style={{ fontSize: 12, marginLeft: 8 }}>{v.telephone}</span>
              </span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13 }}>{jour === aujourdhui ? 'aujourd’hui' : jourDit(jour)} · {heureDite(v.debut)} à {heureDite(v.fin)}</span>
                {enCours && <span className="trv-status trv-status--avalider">en cours · reste {minutesSecondes(resteS(finMs, maintenant))}</span>}
                {!enCours && <span className={`trv-status ${v.statut === 'tenue' ? 'trv-status--payee' : v.statut === 'réservée' ? 'trv-status--envoyee' : ''}`}>{statutDit[v.statut]}</span>}
              </span>
            </div>
            {c && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div>
                  <div style={lab}>Ce qu’elle a coché</div>
                  <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>{(c.besoins ?? []).map((b) => b.mots).join(' · ') || 'rien de coché'}</p>
                </div>
                <div>
                  <div style={lab}>L’estimation du site</div>
                  <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>
                    {c.estimation ? (c.estimation.min === c.estimation.max ? argent(c.estimation.min) : `${argent(c.estimation.min)} à ${argent(c.estimation.max)}`) : 'aucune'}
                    {c.couronne?.locks ? ` · ${c.couronne.locks} locks` : c.couronne?.calibreDit ? ` · calibre ${c.couronne.calibreDit}` : ''}
                    {c.garde === 'peau' ? ' · garde médicale' : ''}
                  </p>
                </div>
              </div>
            )}
            {v.resume && <p style={{ margin: 0, fontSize: 13.5 }}><span style={lab}>Le résumé · </span>{resumeDit(v.resume, argent)}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {v.statut !== 'annulée' && phase !== 'attente' && phase !== 'fermee' && <Button size="sm" onClick={() => setSalle(v)}>Entrer dans la salle</Button>}
              {v.statut !== 'annulée' && <Button size="sm" variant="ghost" onClick={() => setResume(resume === v.id ? null : v.id)}>{v.resume ? 'Revoir le résumé' : 'Le résumé'}</Button>}
              {v.statut === 'réservée' && phase === 'fermee' && <Button size="sm" variant="ghost" onClick={() => void ecrisLaVisio(v.id, { statut: 'manquée' }).then(relis)}>Elle n’est pas venue</Button>}
              {v.statut === 'réservée' && phase === 'attente' && <Button size="sm" variant="ghost" onClick={() => void ecrisLaVisio(v.id, { statut: 'annulée' }).then(relis)}>Annuler</Button>}
            </div>
            {resume === v.id && <ResumeEnTroisTouches visio={v} onEcrit={() => { setResume(null); void relis(); }} />}
          </article>
        );
      })}
      {salle && <SalleCoteMaison visio={salle} onQuitte={() => { setSalle(null); void relis(); }} />}
    </section>
  );
}

function resumeDit(r: ResumeDeLaVisio, argent: (n: number) => string): string {
  return [
    NIVEAUX.find((n) => n.id === r.niveau)?.dit,
    LONGUEURS.find((l) => l.id === r.longueur)?.dit.toLowerCase(),
    r.suite ? `suite : ${SUITES.find((s) => s.id === r.suite)?.dit.toLowerCase()}` : '',
    r.estimationXof ? argent(r.estimationXof) : '',
    r.par ? `par ${r.par}` : '',
  ].filter(Boolean).join(' · ');
}

/* ── V4 · LE RÉSUMÉ EN TROIS TOUCHES ───────────────────────────────────── */
function ResumeEnTroisTouches({ visio, onEcrit, sombre = false }: { visio: Visio; onEcrit: () => void; sombre?: boolean }) {
  const moi = useStaff();
  const { currency } = useBranch();
  const [r, setR] = useState<ResumeDeLaVisio>(visio.resume ?? {});
  const [montant, setMontant] = useState(visio.resume?.estimationXof ? String(visio.resume.estimationXof) : '');
  const [envoi, setEnvoi] = useState(false);
  const [mot, setMot] = useState<string | null>(null);
  const obligatoire = priveeObligatoire(r.niveau);
  const puce = <T extends string>(actif: boolean, dit: string, fait: () => void, cle: T) => (
    <button key={cle} type="button" className={`tvz-puce ${actif ? 'is-on' : ''}`} aria-pressed={actif} onClick={fait}>{dit}</button>
  );
  const envoie = async () => {
    if (envoi) return;
    setEnvoi(true);
    const n = Math.round(Number(montant.replace(/\s/g, '')));
    const resume: ResumeDeLaVisio = {
      ...r, ...(obligatoire ? { suite: 'privee' } : {}),
      ...(Number.isFinite(n) && n > 0 ? { estimationXof: n } : { estimationXof: undefined }),
      par: moi?.name ?? undefined, le: new Date().toISOString(),
    };
    const ok = await ecrisLaVisio(visio.id, { resume, statut: 'tenue' });
    setEnvoi(false);
    if (ok) onEcrit(); else setMot('Le résumé n’a pas été écrit. Réessayez.');
  };
  return (
    <div className={`tvz-resume ${sombre ? 'is-sombre' : ''}`}>
      <div>
        <div className="tvz-lab">Niveau constaté</div>
        <div className="tvz-puces">{NIVEAUX.map((n) => puce(r.niveau === n.id, n.dit, () => setR({ ...r, niveau: n.id }), n.id))}</div>
      </div>
      <div>
        <div className="tvz-lab">Longueur</div>
        <div className="tvz-puces">{LONGUEURS.map((l) => puce(r.longueur === l.id, l.dit, () => setR({ ...r, longueur: l.id }), l.id))}</div>
      </div>
      <div>
        <div className="tvz-lab">La suite</div>
        <div className="tvz-puces">{SUITES.map((s) => puce((obligatoire ? 'privee' : r.suite) === s.id, s.dit, () => !obligatoire && setR({ ...r, suite: s.id }), s.id))}</div>
        {obligatoire && <p className="tvz-note">Consultation privée obligatoire à partir de la réparation intensive.</p>}
      </div>
      <div className="tvz-ligne">
        <label className="tvz-lab" htmlFor={`tvz-m-${visio.id}`}>Estimation ajustée</label>
        <input id={`tvz-m-${visio.id}`} className="tvz-champ" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value.replace(/[^\d\s]/g, ''))} placeholder="en francs" />
        {Number(montant.replace(/\s/g, '')) > 0 && <span className="tvz-note">{fmtMoney(Number(montant.replace(/\s/g, '')), currency)}</span>}
      </div>
      <div>
        <label className="tvz-lab" htmlFor={`tvz-t-${visio.id}`}>Un mot pour elle (facultatif)</label>
        <textarea id={`tvz-t-${visio.id}`} className="tvz-champ" rows={2} maxLength={400} value={r.mot ?? ''} onChange={(e) => setR({ ...r, mot: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="sm" onClick={() => void envoie()} disabled={envoi || !r.niveau}>{envoi ? 'Envoi' : 'Envoyer avant la fin'}</Button>
        <span className="tvz-note">Elle le reçoit quand la salle se ferme.</span>
      </div>
      {mot && <p className="tvz-note" role="alert">{mot}</p>}
    </div>
  );
}

/* ── LA SALLE, CÔTÉ MAISON ─────────────────────────────────────────────── */
function SalleCoteMaison({ visio, onQuitte }: { visio: Visio; onQuitte: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [mot, setMot] = useState<string | null>(null);
  const [ecrit, setEcrit] = useState(false);
  const decalage = useRef(0);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setMaintenant(Date.now() + decalage.current), 250); return () => window.clearInterval(t); }, []);
  useEffect(() => {
    let vivant = true;
    void entreeDeLaMaison(visio.id).then((r) => {
      if (!vivant) return;
      const m = r.maintenant ? Date.parse(r.maintenant) : NaN;
      if (Number.isFinite(m)) decalage.current = m - Date.now();
      if (r.url) setUrl(r.url);
      else setMot(r.motif === 'sans-service' ? 'Le service de visio n’est pas branché : la clé Daily manque.'
        : r.motif === 'trop-tot' ? `La salle s’ouvre ${AVANT_L_ENTREE_MIN} minutes avant le créneau.`
        : r.motif === 'fermee' ? 'La salle est fermée.' : 'La salle ne s’ouvre pas. Réessayez dans un instant.');
    });
    return () => { vivant = false; };
  }, [visio.id]);
  const debutMs = Date.parse(visio.debut);
  const finMs = Date.parse(visio.fin);
  const phase = phaseDe(debutMs, finMs, maintenant);
  const reste = resteS(finMs, maintenant);
  useEffect(() => { if (phase === 'fermee') setUrl(null); }, [phase]);
  return (
    <div className="tvz-salle" role="dialog" aria-modal="true" aria-label={`Visio avec ${visio.nom}`}>
      <header className="tvz-salle__barre">
        <span className="tvz-horloge">{ecouleDit(debutMs, maintenant)} <small>/ {minutesSecondes(DUREE_MIN * 60)}</small></span>
        <span>{visio.nom} · reste {minutesSecondes(reste)}</span>
        <Button size="sm" variant="ghost" onClick={onQuitte}>Quitter la salle</Button>
      </header>
      <div className="tvz-salle__corps">
        <div className={`tvz-cadre ${phase === 'rebours' ? 'is-rebours' : ''}`}>
          {url && <iframe className="tvz-video" src={url} title={`Visio avec ${visio.nom}`} allow="camera; microphone; fullscreen; speaker; display-capture; autoplay" />}
          {!url && <p className="tvz-attente">{phase === 'fermee' ? `${minutesSecondes(DUREE_MIN * 60)} · la visio est terminée.` : mot ?? 'Ouverture de la salle…'}</p>}
          <svg className="tvz-anneau" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <rect x="0.6" y="0.6" width="98.8" height="98.8" rx="1.2" pathLength={1} style={{ strokeDashoffset: 1 - anneauAllume(reste) }} />
          </svg>
          {phase === 'rebours' && <div className="tvz-rebours" role="status"><b>{minutesSecondes(reste)}</b> résumez et proposez la suite</div>}
        </div>
        <aside className="tvz-salle__cote">
          <div className="tvz-lab" style={{ color: 'var(--indigo-200)' }}>Le résumé, en trois touches</div>
          <ResumeEnTroisTouches visio={visio} sombre onEcrit={() => setEcrit(true)} />
          {ecrit && <p className="tvz-note" style={{ color: 'var(--indigo-100)' }}>Résumé écrit : elle le reçoit à la fermeture. Vous pouvez encore le corriger.</p>}
        </aside>
      </div>
    </div>
  );
}
