import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../shared/supabase';
import { asset } from '../../shared/asset';
import { fmtMoney } from '../../shared/currency';
import { DEVISE_COMPLETE } from '../../shared/identite';
import { TexteFon } from '../../ds/fon';
import { t } from './i18n';
import { PRIX_DE_LA_CONSULTATION_PRIVEE_XOF } from '../../shared/estimation-pur';
import {
  AVANT_L_ENTREE_MIN, COMPTE_A_REBOURS_S, DUREE_MIN, SUITES,
  affichesDeLaSuite, anneauAllume, attenteDite, casesDuMois, creneauDit, ecouleDit, heureDite, jourCourtDit, lectureDite, minutesSecondes, moisDit,
  parJour, phaseDe, pourLeBilan, resteS, resumeSur, suiteRetenue,
  type Creneau, type ResumeDeLaVisio, type StatutDeLaVisio,
} from '../../shared/visio-pur';
import './visio.css';

/* ══ LA SALLE DE VISIO, DANS MA COURONNE — 13 novembre 2026 (lot 3) ════════
   Maquette V2 (la salle d'attente), V3 (l'appel et son compte à rebours) et
   la fin. Elle s'ouvre par un lien `/couronne/#/visio/<id>.<jeton>`, SANS
   COMPTE : le jeton suffit, comme le lien d'un rendez-vous.

   DEUX LIENS, UNE PAGE (17 novembre 2026, « La consultation en affiches ») :
     · LE LIEN D'ENTRÉE ne part que sur WhatsApp : lui seul ouvre la salle ;
     · LE BILLET, rendu à la réservation, montre l'heure, la change et
       l'annule, mais n'entre pas. Un numéro qui n'est pas le sien n'a donc
       jamais de visio.
   « Changer l'heure » : jusqu'à deux heures avant, deux fois au plus ; la
   fonction juge, la page ne propose le geste que s'il est encore permis.
   À la fin, le bilan s'ouvre, puis les affiches de la suite : « Votre
   rituel », déjà rempli par la Maison, et/ou « Consultation privée ».

   L'HEURE EST CELLE DU SERVEUR : chaque réponse de `visio-salle` dit
   `maintenant`, la page en tire son décalage. La cliente et la Maison
   voient donc les mêmes 120 secondes, et c'est le service de visio qui
   ferme la salle à 15:00, pas cette page. */

type Changement = { permis: boolean; reste: number; max: number; avantMin: number };
type Etat = {
  debut: string; fin: string; statut: StatutDeLaVisio; prenom: string;
  consultationId: string | null; resume: ResumeDeLaVisio | null; actif: boolean;
  /** Le billet de la réservation : il n'ouvre pas la salle. */
  billet: boolean;
  changement: Changement;
  /** Son parcours : elle n'a pas encore de locks (ses affiches parlent de ses cheveux et de sa création). */
  sansLocks: boolean;
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

/** Le délai du changement, dit court : « 2 h », « 90 min ». */
const delaiDit = (min: number): string => (min % 60 === 0 ? t('{n} h', { n: min / 60 }) : t('{n} min', { n: min }));

/** Le changement tel que la fonction le dit ; une fonction d'avant ne dit rien : rien n'est proposé. */
function changementSur(x: unknown): Changement {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
  return { permis: o.permis === true, reste: n(o.reste), max: n(o.max), avantMin: n(o.avantMin) };
}

export default function SalleDeVisio({ id, jeton }: { id: string; jeton: string }) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [inconnue, setInconnue] = useState(false);
  const [panne, setPanne] = useState(false);
  const [entree, setEntree] = useState<string | null>(null);
  const [entre, setEntre] = useState(false);
  const [mot, setMot] = useState<string | null>(null);
  const [annuler, setAnnuler] = useState(false);
  const [change, setChange] = useState(false);
  const [dit, setDit] = useState<string | null>(null);
  const decalage = useRef(0);
  const suiteDite = useRef(false);
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
        resume: resumeSur(r.resume), actif: r.actif === true, billet: r.billet === true, changement: changementSur(r.changement),
        sansLocks: r.sansLocks === true,
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

  /* LA SUITE VUE ICI : le WhatsApp des affiches, encore en salle, ne part plus. Une fois. */
  const suiteAffichee = !!etat && phase === 'fermee' && !!etat.resume;
  useEffect(() => {
    if (!suiteAffichee || suiteDite.current) return;
    suiteDite.current = true;
    void appelle({ geste: 'suite-vue', id, jeton }).catch(() => { /* le WhatsApp partira : rien de perdu */ });
  }, [suiteAffichee, id, jeton]);

  const entrer = async () => {
    if (entre) return;
    setEntre(true);
    setMot(null);
    try {
      const r = await appelle({ geste: 'entrer', id, jeton });
      recale(r);
      if (r.ok && typeof r.url === 'string') setEntree(r.url);
      else if (r.motif === 'trop-tot') setMot(t('La salle s’ouvre {n} minutes avant votre créneau.', { n: AVANT_L_ENTREE_MIN }));
      else if (r.motif === 'fermee') { setMot(null); void litLEtat(); }
      else if (r.motif === 'annulee') void litLEtat();
      else if (r.motif === 'par-whatsapp') setMot(t('Votre lien d’entrée est sur votre WhatsApp.'));
      else setMot(t('La salle ne s’ouvre pas pour l’instant. Écrivez à la Maison sur WhatsApp : elle vous répond.'));
    } catch {
      setMot(t('La salle ne répond pas. Vérifiez votre connexion, puis réessayez.'));
    } finally {
      setEntre(false);
    }
  };

  const annule = async () => {
    try {
      const r = await appelle({ geste: 'annuler', id, jeton });
      if (r.ok) void litLEtat();
      else setMot(t('Il est trop tard pour annuler en ligne. Écrivez à la Maison.'));
    } catch {
      setMot(t('L’annulation n’a pas abouti. Réessayez, ou écrivez à la Maison.'));
    } finally {
      setAnnuler(false);
    }
  };

  const pied = <p className="mv-devise"><TexteFon texte={DEVISE_COMPLETE} penche /></p>;
  const sceau = <img className="mv-sceau" src={asset('/assets/monograms/mono-copper.png')} alt="" />;

  if (inconnue) {
    return (
      <main className="mv-page"><section className="mv-carte">{sceau}
        <h1 className="mv-titre">{t('Ce lien de visio n’est pas reconnu.')}</h1>
        <p className="mv-texte">{t('Vérifiez qu’il est complet, tel que la Maison vous l’a donné. Sinon, écrivez-nous sur WhatsApp.')}</p>
        <a className="mv-bouton mv-bouton--lien" href="/couronne/">{t('Ouvrir Ma Couronne')}</a>
      </section>{pied}</main>
    );
  }
  if (!etat) {
    return (
      <main className="mv-page"><section className="mv-carte">{sceau}
        <p className="mv-texte">{panne ? t('La salle ne répond pas pour l’instant. Rechargez la page dans un moment.') : t('Votre visio se prépare…')}</p>
      </section>{pied}</main>
    );
  }

  /* ── ANNULÉE ── */
  if (etat.statut === 'annulée') {
    return (
      <main className="mv-page"><section className="mv-carte">{sceau}
        <p className="mv-sur">{t('Visio')} · {creneauDit(etat.debut)}</p>
        <h1 className="mv-titre">{t('Cette visio est annulée.')}</h1>
        <p className="mv-texte">{t('Vous pouvez en réserver une autre depuis votre consultation, ou écrire à la Maison.')}</p>
        <a className="mv-bouton" href="/consultation/">{t('Ma consultation')}</a>
      </section>{pied}</main>
    );
  }

  /* ── ELLE N'A PAS EU LIEU ── */
  if (etat.statut === 'manquée') {
    return (
      <main className="mv-page"><section className="mv-carte">{sceau}
        <p className="mv-sur">{t('Visio')} · {creneauDit(etat.debut)}</p>
        <h1 className="mv-titre">{t('Cette visio n’a pas eu lieu.')}</h1>
        <div className="mv-rangee">
          <a className="mv-bouton" href="/consultation/">{t('Ma consultation')}</a>
          <a className="mv-bouton mv-bouton--lien" href="/couronne/">{t('Ma Couronne')}</a>
        </div>
      </section>{pied}</main>
    );
  }

  /* ── 15:00 · LA VISIO EST TERMINÉE : LE BILAN S'OUVRE, PUIS LA SUITE ── */
  if (phase === 'fermee') {
    const r = etat.resume;
    /* Une seule fonction écrit les affiches, selon son parcours : la page ne choisit aucun mot. */
    const affiches = affichesDeLaSuite(r, etat.consultationId, etat.sansLocks);
    const suite = r ? suiteRetenue(r) : undefined;
    /* Un résumé d'avant le 17 novembre 2026 : « des soins suffisent », sans rituel choisi. */
    const soinsDAvant = !!r && !affiches.rituel && !affiches.privee && suite === 'soins';
    const devisDAvant = !!r && !affiches.rituel && !affiches.privee && suite === 'devis';
    return (
      <main className="mv-page"><section className="mv-carte mv-fin">
        <p className="mv-sur">{t('Visio terminée')}</p>
        <h1 className="mv-titre">{r ? t('Votre bilan') : etat.prenom ? t('Merci, {prenom}.', { prenom: etat.prenom }) : t('Merci.')}</h1>
        {r ? (
          <div className="mv-bilan">
            <p className="mv-bilan__tete">
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <b>{t('Remis par la Maison')}</b>
            </p>
            <dl className="mv-resume">
              {lectureDite(r) && <><dt>{t('Lecture confirmée')}</dt><dd>{lectureDite(r)}</dd></>}
              {r.estimationXof && !affiches.rituel && <><dt>{t('Estimation ajustée')}</dt><dd><span className="mv-prix">{fmtMoney(r.estimationXof, 'XOF')}</span></dd></>}
              {devisDAvant && <><dt>{t('La suite')}</dt><dd>{SUITES.find((s) => s.id === 'devis')?.pourElle}</dd></>}
              {r.mot && <><dt>{t('Le mot de la Maison')}</dt><dd>{t(pourLeBilan(r.mot))}</dd></>}
            </dl>
          </div>
        ) : (
          <p className="mv-texte">{t('La salle est fermée. La Maison écrit votre résumé : il paraît ici dans quelques minutes, et elle vous l’envoie sur WhatsApp.')}</p>
        )}
        {(affiches.rituel || affiches.privee || soinsDAvant) && (
          <>
            <p className="mv-sur">{t('La suite')}</p>
            <div className="mv-affiches">
              {affiches.rituel && (
                <Affiche couleur="indigo" href={affiches.rituel.chemin} nom={t(affiches.rituel.nom)} ligne={affiches.rituel.noms.join(' + ')}
                  chiffre={r?.estimationXof ? fmtMoney(r.estimationXof, 'XOF') : ''} unite={t('estimés')} />
              )}
              {soinsDAvant && <Affiche couleur="indigo" href="/reserver/?besoin=entretien" nom={t('Votre rituel')} ligne="" chiffre="" unite="" />}
              {affiches.privee && (
                <Affiche couleur="cuivre" href={affiches.privee.chemin} nom={t(affiches.privee.nom)} ligne={t(affiches.privee.ligne)}
                  chiffre={fmtMoney(PRIX_DE_LA_CONSULTATION_PRIVEE_XOF, 'XOF')} unite={t(affiches.privee.unite)} />
              )}
            </div>
          </>
        )}
        <div className="mv-rangee">
          <a className="mv-bouton mv-bouton--lien" href="/couronne/">{t('Ma Couronne')}</a>
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
          <span className="mv-qui">{t('Visio gratuite')} · Maison MND</span>
        </header>
        <div className={`mv-cadre ${rebours ? 'is-rebours' : ''}`}>
          <iframe className="mv-video" src={entree} title={t('La visio avec la Maison')} allow="camera; microphone; fullscreen; speaker; display-capture; autoplay" />
          {/* L'anneau des deux dernières minutes court autour de l'image. */}
          <svg className="mv-anneau" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <rect x="0.6" y="0.6" width="98.8" height="98.8" rx="1.2" pathLength={1}
              style={{ strokeDashoffset: 1 - anneauAllume(reste) }} />
          </svg>
          {rebours && (
            <div className="mv-rebours" role="status" aria-live="polite">
              <b>{minutesSecondes(reste)}</b>
              <span>{t('la Maison résume et vous propose la suite')}</span>
            </div>
          )}
        </div>
        <p className="mv-note">{t('À {a}, un compte à rebours de deux minutes s’allume. À {b}, la salle se ferme d’elle-même.', { a: minutesSecondes(DUREE_MIN * 60 - COMPTE_A_REBOURS_S), b: minutesSecondes(DUREE_MIN * 60) })}</p>
      </main>
    );
  }

  /* ── CHANGER L'HEURE ── */
  if (change) {
    return (
      <main className="mv-page"><section className="mv-carte">{sceau}
        <ChangerLHeure id={id} jeton={jeton} debut={etat.debut}
          onGarde={() => setChange(false)}
          onChange={(m) => { setChange(false); setDit(m); void litLEtat(); }} />
      </section>{pied}</main>
    );
  }

  /* ── LA SALLE D'ATTENTE (ET LE BILLET) ── */
  const peutEntrer = phase !== 'attente';
  const c = etat.changement;
  return (
    <main className="mv-page"><section className="mv-carte">{sceau}
      <p className="mv-sur">{t('Visio gratuite · {n} minutes', { n: DUREE_MIN })}</p>
      <h1 className="mv-titre">{creneauDit(etat.debut)}</h1>
      {dit && <p className="mv-legende" role="status">{dit}</p>}
      <p className="mv-texte">
        {phase === 'attente'
          ? t('Votre visio commence {quand}. La salle s’ouvre {n} minutes avant.', { quand: attenteDite(debutMs - maintenant), n: AVANT_L_ENTREE_MIN })
          : phase === 'ouverte' ? t('Votre visio commence {quand}. Vous pouvez entrer.', { quand: attenteDite(debutMs - maintenant) }) : t('Votre visio a commencé. Entrez : la fin reste fixée à l’heure prévue.')}
      </p>
      {etat.billet ? (
        <p className="mv-legende">{t('Votre lien d’entrée est sur votre WhatsApp.')}</p>
      ) : (
        <>
          <ol className="mv-deroule">
            <li><b>{t('0 à 13 min')}</b><span>{t('On regarde vos locks ensemble.')}</span></li>
            <li><b>{t('13 à 15 min')}</b><span>{t('Le compte à rebours : on résume, on vous propose la suite.')}</span></li>
            <li><b>{t('15 min')}</b><span>{t('La salle se ferme d’elle-même. Votre résumé arrive ici.')}</span></li>
          </ol>
          <p className="mv-legende">{t('Votre téléphone vous demandera la caméra et le micro en entrant : acceptez-les. Un endroit calme et bien éclairé aide la Maison à bien voir vos racines.')}</p>
          {!etat.actif && <p className="mv-legende">{t('La salle n’est pas encore ouverte côté Maison. Si rien ne change à l’heure dite, écrivez-nous sur WhatsApp.')}</p>}
        </>
      )}
      <div className="mv-rangee">
        {!etat.billet && (
          <button type="button" className="mv-bouton" disabled={!peutEntrer || entre} onClick={() => void entrer()}>
            {entre ? t('Ouverture de la salle') : t('Entrer dans la salle')}
          </button>
        )}
        {c.permis && !annuler && <button type="button" className={`mv-bouton ${etat.billet ? '' : 'mv-bouton--lien'}`} onClick={() => { setDit(null); setChange(true); }}>{t('Changer l’heure')}</button>}
        {phase === 'attente' && !annuler && <button type="button" className="mv-bouton mv-bouton--lien" onClick={() => setAnnuler(true)}>{t('Je ne pourrai pas venir')}</button>}
      </div>
      {c.permis && !annuler && <p className="mv-legende">{t('Jusqu’à {delai} avant, {n} fois au plus.', { delai: delaiDit(c.avantMin), n: c.max })}</p>}
      {annuler && (
        <div className="mv-confirme">
          <p>{t('Annuler votre visio du {quand} ?', { quand: creneauDit(etat.debut) })}</p>
          {c.avantMin > 0 && maintenant > debutMs - c.avantMin * 60_000 && <p className="mv-legende">{t('À moins de {delai} de l’heure, elle compte comme faite.', { delai: delaiDit(c.avantMin) })}</p>}
          <div className="mv-rangee">
            <button type="button" className="mv-bouton" onClick={() => void annule()}>{t('Oui, l’annuler')}</button>
            <button type="button" className="mv-bouton mv-bouton--lien" onClick={() => setAnnuler(false)}>{t('Non, je viens')}</button>
          </div>
        </div>
      )}
      {mot && <p className="mv-erreur" role="alert">{mot}</p>}
    </section>{pied}</main>
  );
}

/* ── UNE AFFICHE : un bloc de couleur, une carte claire au coin coupé, un nom,
   une ligne, un grand nombre. Elle mène à la suite d'un toucher. ── */
function Affiche({ couleur, href, nom, ligne, chiffre, unite }: { couleur: 'indigo' | 'cuivre'; href: string; nom: string; ligne: string; chiffre: string; unite: string }) {
  return (
    <a className={`mv-aff mv-aff--${couleur}`} href={href}>
      <span className="mv-aff__c">
        <span className="mv-aff__nom">{nom}</span>
        {ligne && <span className="mv-aff__ligne">{ligne}</span>}
        {/* Un prix ne se coupe jamais sur deux lignes. */}
        {chiffre && <span className="mv-aff__chiffre"><span className="mv-prix">{chiffre}</span>{unite && <small>{unite}</small>}</span>}
      </span>
      <span className="mv-aff__plus" aria-hidden="true">+</span>
    </a>
  );
}

/* ── VOTRE MOMENT : quatre jours, « Plus de dates » ouvre le calendrier, puis
   les heures. La fonction écrit la nouvelle heure, libère l'ancienne, et
   l'envoie sur WhatsApp. ── */
function ChangerLHeure({ id, jeton, debut, onGarde, onChange }: { id: string; jeton: string; debut: string; onGarde: () => void; onChange: (mot: string) => void }) {
  const [creneaux, setCreneaux] = useState<Creneau[] | null>(null);
  const [jour, setJour] = useState('');
  const [choisi, setChoisi] = useState('');
  const [calendrier, setCalendrier] = useState(false);
  const [mois, setMois] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [mot, setMot] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    appelle({ geste: 'creneaux' })
      .then((r) => { if (vivant) setCreneaux(r.ok && Array.isArray(r.creneaux) ? (r.creneaux as Creneau[]) : []); })
      .catch(() => { if (vivant) setCreneaux([]); });
    return () => { vivant = false; };
  }, []);

  const jours = parJour(creneaux ?? []);
  const premiers = jours.slice(0, 4).map((j) => j.jour);
  const puces = jour && !premiers.includes(jour) ? [...premiers, jour] : premiers;
  const duJour = jours.find((j) => j.jour === jour)?.creneaux ?? [];
  const lesMois = [...new Set(jours.map((j) => j.jour.slice(0, 7)))];
  const moisVu = mois || jour.slice(0, 7) || lesMois[0] || '';
  const rang = lesMois.indexOf(moisVu);

  const changeLHeure = async () => {
    if (!choisi || envoi) return;
    setEnvoi(true);
    setMot(null);
    try {
      const r = await appelle({ geste: 'deplacer', id, jeton, debut: choisi });
      if (r.ok) { onChange(r.parWhatsApp === true ? t('Heure changée. Elle arrive sur votre WhatsApp.') : t('Heure changée.')); return; }
      setMot(r.motif === 'pris' ? t('Ce quart d’heure vient d’être pris. Choisissez-en un autre.')
        : r.motif === 'trop-tard' ? t('Il est trop tard pour changer l’heure en ligne. Écrivez à la Maison.')
        : r.motif === 'trop-de-fois' ? t('Vous avez déjà changé l’heure autant de fois que possible. Écrivez à la Maison.')
        : r.motif === 'rate_limited' ? t('Trop d’essais d’un coup. Réessayez dans quelques minutes.')
        : t('Le changement n’a pas abouti. Réessayez, ou écrivez à la Maison.'));
    } catch {
      setMot(t('Le changement n’a pas abouti. Réessayez, ou écrivez à la Maison.'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <p className="mv-sur">{t('Vous changez l’heure de votre visio')} · {creneauDit(debut)}</p>
      <h1 className="mv-titre">{t('Votre moment')}</h1>
      {creneaux !== null && jours.length === 0 && <p className="mv-texte">{t('Aucun autre quart d’heure n’est libre pour l’instant.')}</p>}
      {jours.length > 0 && (
        <div className="mv-puces" role="group" aria-label={t('Le jour')}>
          {puces.map((j) => (
            <button key={j} type="button" className="mv-puce" aria-pressed={jour === j} onClick={() => { setJour(j); setChoisi(''); }}>{jourCourtDit(j)}</button>
          ))}
          {jours.length > 4 && (
            <button type="button" className="mv-puce mv-puce--plus" aria-expanded={calendrier} onClick={() => { setCalendrier(!calendrier); setMois(''); }}>
              {calendrier ? t('Fermer le calendrier') : t('Plus de dates')}
            </button>
          )}
        </div>
      )}
      {calendrier && moisVu && (
        <div className="mv-cal">
          <div className="mv-cal__tete">
            <button type="button" className="mv-cal__nav" aria-label={t('Mois précédent')} disabled={rang <= 0} onClick={() => setMois(lesMois[rang - 1])}>‹</button>
            <span>{moisDit(moisVu)}</span>
            <button type="button" className="mv-cal__nav" aria-label={t('Mois suivant')} disabled={rang < 0 || rang >= lesMois.length - 1} onClick={() => setMois(lesMois[rang + 1])}>›</button>
          </div>
          <div className="mv-cal__grille">
            {casesDuMois(moisVu).map((c, i) => (c
              ? <button key={c} type="button" className="mv-cal__c" disabled={!jours.some((j) => j.jour === c)} aria-pressed={jour === c} onClick={() => { setJour(c); setChoisi(''); setCalendrier(false); }}>{Number(c.slice(8))}</button>
              : <span key={`v${i}`} />))}
          </div>
        </div>
      )}
      {duJour.length > 0 && (
        <div className="mv-puces" role="group" aria-label={t('L’heure')}>
          {duJour.map((c) => (
            <button key={c.debut} type="button" className="mv-puce" aria-pressed={choisi === c.debut} onClick={() => setChoisi(c.debut)}>{heureDite(c.debut)}</button>
          ))}
        </div>
      )}
      <div className="mv-rangee">
        <button type="button" className="mv-bouton" disabled={!choisi || envoi} onClick={() => void changeLHeure()}>{t('Changer l’heure')}</button>
        <button type="button" className="mv-bouton mv-bouton--lien" onClick={onGarde}>{t('Garder mon heure')}</button>
      </div>
      {mot && <p className="mv-erreur" role="alert">{mot}</p>}
    </>
  );
}
