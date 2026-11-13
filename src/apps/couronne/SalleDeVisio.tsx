import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../shared/supabase';
import { asset } from '../../shared/asset';
import { fmtMoney } from '../../shared/currency';
import { DEVISE_COMPLETE } from '../../shared/identite';
import {
  AVANT_L_ENTREE_MIN, COMPTE_A_REBOURS_S, DUREE_MIN, SUITES,
  anneauAllume, attenteDite, creneauDit, ecouleDit, lectureDite, minutesSecondes, phaseDe, resteS, resumeSur, suiteRetenue,
  type ResumeDeLaVisio, type StatutDeLaVisio,
} from '../../shared/visio-pur';
import './visio.css';

/* ══ LA SALLE DE VISIO, DANS MA COURONNE — 13 novembre 2026 (lot 3) ════════
   Maquette V2 (la salle d'attente), V3 (l'appel et son compte à rebours) et
   la fin. Elle s'ouvre par le lien reçu à la réservation
   (`/couronne/#/visio/<id>.<jeton>`), SANS COMPTE : le jeton suffit, comme
   le lien d'un rendez-vous. WhatsApp porte ce lien ; il ne porte jamais
   l'appel, que la Maison ne pourrait pas couper.

   L'HEURE EST CELLE DU SERVEUR : chaque réponse de `visio-salle` dit
   `maintenant`, la page en tire son décalage. La cliente et la Maison
   voient donc les mêmes 120 secondes, et c'est le service de visio qui
   ferme la salle à 15:00, pas cette page. */

type Etat = {
  debut: string; fin: string; statut: StatutDeLaVisio; prenom: string;
  consultationId: string | null; resume: ResumeDeLaVisio | null; actif: boolean;
};
type Reponse = Record<string, unknown> & { ok?: boolean; motif?: string; maintenant?: string };

async function appelle(corps: Record<string, unknown>): Promise<Reponse> {
  if (!supabase) throw new Error('hors-ligne');
  const { data, error } = await supabase.functions.invoke('visio-salle', { body: corps });
  if (!error) return (data ?? {}) as Reponse;
  /* Un refus (404, 409) porte sa raison dans le corps : on la lit. */
  try {
    const r = (error as { context?: Response }).context;
    const d = r && typeof r.json === 'function' ? ((await r.json()) as Reponse) : null;
    if (d) return d;
  } catch { /* corps illisible */ }
  throw error;
}

export default function SalleDeVisio({ id, jeton }: { id: string; jeton: string }) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [inconnue, setInconnue] = useState(false);
  const [panne, setPanne] = useState(false);
  const [entree, setEntree] = useState<string | null>(null);
  const [entre, setEntre] = useState(false);
  const [mot, setMot] = useState<string | null>(null);
  const [annuler, setAnnuler] = useState(false);
  const decalage = useRef(0);
  const [maintenant, setMaintenant] = useState(() => Date.now());

  const recale = (r: Reponse) => {
    const m = typeof r.maintenant === 'string' ? Date.parse(r.maintenant) : NaN;
    if (Number.isFinite(m)) decalage.current = m - Date.now();
  };

  const litLEtat = useCallback(async () => {
    try {
      const r = await appelle({ geste: 'etat', id, jeton });
      recale(r);
      if (!r.ok) { if (r.motif === 'inconnue') setInconnue(true); else setPanne(true); return; }
      setPanne(false);
      setEtat({
        debut: String(r.debut), fin: String(r.fin), statut: r.statut as StatutDeLaVisio, prenom: String(r.prenom ?? ''),
        consultationId: typeof r.consultationId === 'string' ? r.consultationId : null,
        resume: resumeSur(r.resume), actif: r.actif === true,
      });
    } catch {
      setPanne(true);
    }
  }, [id, jeton]);

  useEffect(() => { void litLEtat(); }, [litLEtat]);
  useEffect(() => {
    const t = window.setInterval(() => setMaintenant(Date.now() + decalage.current), 250);
    return () => window.clearInterval(t);
  }, []);

  const debutMs = etat ? Date.parse(etat.debut) : 0;
  const finMs = etat ? Date.parse(etat.fin) : 0;
  const phase = etat ? phaseDe(debutMs, finMs, maintenant) : 'attente';

  /* Fermée : la page quitte la salle (le service l'a déjà fermée), puis attend le résumé de la Maison. */
  useEffect(() => {
    if (phase === 'fermee') setEntree(null);
  }, [phase]);
  useEffect(() => {
    if (!etat || phase !== 'fermee' || etat.resume || maintenant > finMs + 30 * 60_000) return;
    const t = window.setTimeout(() => { void litLEtat(); }, 15_000);
    return () => window.clearTimeout(t);
  }, [etat, phase, maintenant, finMs, litLEtat]);

  const entrer = async () => {
    if (entre) return;
    setEntre(true);
    setMot(null);
    try {
      const r = await appelle({ geste: 'entrer', id, jeton });
      recale(r);
      if (r.ok && typeof r.url === 'string') setEntree(r.url);
      else if (r.motif === 'trop-tot') setMot(`La salle s’ouvre ${AVANT_L_ENTREE_MIN} minutes avant votre créneau.`);
      else if (r.motif === 'fermee') { setMot(null); void litLEtat(); }
      else if (r.motif === 'annulee') void litLEtat();
      else setMot('La salle ne s’ouvre pas pour l’instant. Écrivez à la Maison sur WhatsApp : elle vous répond.');
    } catch {
      setMot('La salle ne répond pas. Vérifiez votre connexion, puis réessayez.');
    } finally {
      setEntre(false);
    }
  };

  const annule = async () => {
    try {
      const r = await appelle({ geste: 'annuler', id, jeton });
      if (r.ok) void litLEtat();
      else setMot('Il est trop tard pour annuler en ligne. Écrivez à la Maison.');
    } catch {
      setMot('L’annulation n’a pas abouti. Réessayez, ou écrivez à la Maison.');
    } finally {
      setAnnuler(false);
    }
  };

  const pied = <p className="mv-devise">{DEVISE_COMPLETE}</p>;
  const sceau = <img className="mv-sceau" src={asset('/assets/monograms/mono-copper.png')} alt="" />;

  if (inconnue) {
    return (
      <main className="mv-page"><section className="mv-carte">{sceau}
        <h1 className="mv-titre">Ce lien de visio n’est pas reconnu.</h1>
        <p className="mv-texte">Vérifiez qu’il est complet, tel que la Maison vous l’a donné. Sinon, écrivez-nous sur WhatsApp.</p>
        <a className="mv-bouton mv-bouton--lien" href="/couronne/">Ouvrir Ma Couronne</a>
      </section>{pied}</main>
    );
  }
  if (!etat) {
    return (
      <main className="mv-page"><section className="mv-carte">{sceau}
        <p className="mv-texte">{panne ? 'La salle ne répond pas pour l’instant. Rechargez la page dans un moment.' : 'Votre visio se prépare…'}</p>
      </section>{pied}</main>
    );
  }

  /* ── ANNULÉE ── */
  if (etat.statut === 'annulée') {
    return (
      <main className="mv-page"><section className="mv-carte">{sceau}
        <p className="mv-sur">Visio · {creneauDit(etat.debut)}</p>
        <h1 className="mv-titre">Cette visio est annulée.</h1>
        <p className="mv-texte">Vous pouvez en réserver une autre depuis votre consultation, ou écrire à la Maison.</p>
        <a className="mv-bouton" href="/consultation/">Ma consultation</a>
      </section>{pied}</main>
    );
  }

  /* ── 15:00 · LA VISIO EST TERMINÉE ── */
  if (phase === 'fermee' || etat.statut === 'manquée') {
    const r = etat.resume;
    const suite = r ? suiteRetenue(r) : undefined;
    const privee = suite === 'privee';
    return (
      <main className="mv-page"><section className="mv-carte mv-fin">
        <p className="mv-sur">{minutesSecondes(DUREE_MIN * 60)} · la visio est terminée</p>
        <h1 className="mv-titre">Merci{etat.prenom ? `, ${etat.prenom}` : ''}.</h1>
        {r ? (
          <dl className="mv-resume">
            {lectureDite(r) && <><dt>Lecture confirmée</dt><dd>{lectureDite(r)}</dd></>}
            {r.estimationXof && <><dt>Estimation ajustée</dt><dd>{fmtMoney(r.estimationXof, 'XOF')}</dd></>}
            {suite && <><dt>La suite</dt><dd>{SUITES.find((s) => s.id === suite)?.pourElle}</dd></>}
            {r.mot && <><dt>Le mot de la Maison</dt><dd>{r.mot}</dd></>}
          </dl>
        ) : (
          <p className="mv-texte">La salle est fermée. La Maison écrit votre résumé : il paraît ici dans quelques minutes, et elle vous l’envoie sur WhatsApp.</p>
        )}
        <div className="mv-rangee">
          {(privee || !r) && (
            <a className="mv-bouton" href={`/consultation/${etat.consultationId ? `?privee=${encodeURIComponent(etat.consultationId)}` : ''}`}>
              Réserver la consultation privée
            </a>
          )}
          {r && suite === 'soins' && <a className="mv-bouton" href="/reserver/?besoin=entretien">Réserver mon rituel</a>}
          <a className="mv-bouton mv-bouton--lien" href="/couronne/">Ma Couronne</a>
        </div>
      </section>{pied}</main>
    );
  }

  /* ── L'APPEL ── */
  if (entree) {
    const reste = resteS(finMs, maintenant);
    const rebours = phase === 'rebours';
    return (
      <main className="mv-scene">
        <header className="mv-barre">
          <span className="mv-horloge">{ecouleDit(debutMs, maintenant)} <span className="mv-horloge__sur">/ {minutesSecondes(DUREE_MIN * 60)}</span></span>
          <span className="mv-qui">Visio gratuite · Maison MND</span>
        </header>
        <div className={`mv-cadre ${rebours ? 'is-rebours' : ''}`}>
          <iframe className="mv-video" src={entree} title="La visio avec la Maison" allow="camera; microphone; fullscreen; speaker; display-capture; autoplay" />
          {/* L'anneau des deux dernières minutes court autour de l'image. */}
          <svg className="mv-anneau" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <rect x="0.6" y="0.6" width="98.8" height="98.8" rx="1.2" pathLength={1}
              style={{ strokeDashoffset: 1 - anneauAllume(reste) }} />
          </svg>
          {rebours && (
            <div className="mv-rebours" role="status" aria-live="polite">
              <b>{minutesSecondes(reste)}</b>
              <span>la Maison résume et vous propose la suite</span>
            </div>
          )}
        </div>
        <p className="mv-note">À {minutesSecondes(DUREE_MIN * 60 - COMPTE_A_REBOURS_S)}, un compte à rebours de deux minutes s’allume. À {minutesSecondes(DUREE_MIN * 60)}, la salle se ferme d’elle-même.</p>
      </main>
    );
  }

  /* ── LA SALLE D'ATTENTE ── */
  const peutEntrer = phase !== 'attente';
  return (
    <main className="mv-page"><section className="mv-carte">{sceau}
      <p className="mv-sur">Visio gratuite · {DUREE_MIN} minutes</p>
      <h1 className="mv-titre">{creneauDit(etat.debut)}</h1>
      <p className="mv-texte">
        {phase === 'attente'
          ? `Votre visio commence ${attenteDite(debutMs - maintenant)}. La salle s’ouvre ${AVANT_L_ENTREE_MIN} minutes avant.`
          : phase === 'ouverte' ? `Votre visio commence ${attenteDite(debutMs - maintenant)}. Vous pouvez entrer.` : 'Votre visio a commencé. Entrez : la fin reste fixée à l’heure prévue.'}
      </p>
      <ol className="mv-deroule">
        <li><b>0 à 13 min</b><span>On regarde vos locks ensemble.</span></li>
        <li><b>13 à 15 min</b><span>Le compte à rebours : on résume, on vous propose la suite.</span></li>
        <li><b>15 min</b><span>La salle se ferme d’elle-même. Votre résumé arrive ici.</span></li>
      </ol>
      <p className="mv-legende">Votre téléphone vous demandera la caméra et le micro en entrant : acceptez-les. Un endroit calme et bien éclairé aide la Maison à bien voir vos racines.</p>
      {!etat.actif && <p className="mv-legende">La salle n’est pas encore ouverte côté Maison. Si rien ne change à l’heure dite, écrivez-nous sur WhatsApp.</p>}
      <div className="mv-rangee">
        <button type="button" className="mv-bouton" disabled={!peutEntrer || entre} onClick={() => void entrer()}>
          {entre ? 'Ouverture de la salle' : 'Entrer dans la salle'}
        </button>
        {phase === 'attente' && !annuler && <button type="button" className="mv-bouton mv-bouton--lien" onClick={() => setAnnuler(true)}>Je ne pourrai pas venir</button>}
      </div>
      {annuler && (
        <div className="mv-confirme">
          <p>Annuler votre visio du {creneauDit(etat.debut)} ?</p>
          <div className="mv-rangee">
            <button type="button" className="mv-bouton" onClick={() => void annule()}>Oui, l’annuler</button>
            <button type="button" className="mv-bouton mv-bouton--lien" onClick={() => setAnnuler(false)}>Non, je viens</button>
          </div>
        </div>
      )}
      {mot && <p className="mv-erreur" role="alert">{mot}</p>}
    </section>{pied}</main>
  );
}
