import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../../../ds/components';
import { useStore } from '../../../../shared/store';
import { useBranch } from '../../../../shared/branches';
import { useStaff } from '../../../../shared/auth';
import { fmtMoney } from '../../../../shared/currency';
import { appointmentsStore } from '../../../../shared/agenda';
import { useCategories, useServices } from '../../../../shared/catalog';
import { consultationsQueueStore, vitrineConfigStore, type OnlineConsultation } from '../../../../shared/bridges';
import {
  creneauxDeLaVisio, deplaceLaVisio, ecrisLaVisio, entreeDeLaMaison, envoieLaSuite, messageDeLaSuite, messageDuLien, nouveauLien, useVisios,
  type ConsultationSuivie, type Visio,
} from '../../../../shared/visios';
import { lienWaMe } from '../../../../shared/conversations';
import { reservableSurLeSite } from '../../../../shared/place-du-serveur';
import {
  AVANT_L_ENTREE_MIN, DUREE_MIN, LONGUEURS, NIVEAUX, RITUEL_AU_PLUS, SUITES,
  affichesDeLaSuite, anneauAllume, creneauDit, ecouleDit, heureDite, jourCourtDit, jourDeCotonou, jourDit, minutesSecondes, parJour, phaseDe,
  priveeObligatoire, resteS, resumeOuvert, sansLocksEncore, type Creneau, type ResumeDeLaVisio, type RituelPropose,
} from '../../../../shared/visio-pur';
import './visios.css';

/* ══ B · LES VISIOS — 13 novembre 2026 (la Consultation, lot 3) ════════════
   Maquette V4 et « La porte B ». Les visios réservées sur le site (fonction
   `visio-salle`), celles du jour d'abord. La Maison entre dans la salle
   d'ici (propriétaire), voit le même compte à rebours que la cliente, et
   écrit la lecture confirmée en trois touches : le niveau, la longueur, la
   suite. La cliente la reçoit quand la salle se ferme.

   17 novembre 2026 (« La consultation en affiches ») : « Déplacer » change
   l'heure d'une visio réservée (la nouvelle heure part sur WhatsApp) ; la
   suite se propose en un geste, un rituel du catalogue ou la consultation
   privée, que la cliente retrouve en affiches sur sa page et sur WhatsApp ;
   une visio dont le lien n'est pas parti le dit. */

const lab = { fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-soft)', fontWeight: 600 };
const statutDit: Record<Visio['statut'], string> = { 'réservée': 'réservée', 'annulée': 'annulée', tenue: 'tenue', 'manquée': 'manquée' };
const prenomDe = (nom: string): string => nom.trim().split(/\s+/)[0] ?? '';

export function ConsultationsVisios() {
  const { visios, absente, relis } = useVisios();
  const [queue] = useStore(consultationsQueueStore);
  const { currency } = useBranch();
  const [salle, setSalle] = useState<Visio | null>(null);
  const [resume, setResume] = useState<string | null>(null);
  const [deplace, setDeplace] = useState<string | null>(null);
  /* LE LIEN RENVOYÉ (14 novembre 2026) : le dernier lien fabriqué, par visio, gardé à l'écran pour le copier. */
  const [liens, setLiens] = useState<Record<string, { lien?: string; mot: string }>>({});
  const dis = (id: string, mot: string, lien?: string) => setLiens((x) => ({ ...x, [id]: { mot, ...(lien ? { lien } : {}) } }));
  const envoieLeLien = async (v: Visio) => {
    /* La fenêtre s'ouvre AU CLIC (un navigateur bloque celle ouverte après une attente), puis reçoit WhatsApp. */
    const fenetre = window.open('', '_blank');
    setLiens((x) => ({ ...x, [v.id]: { mot: 'Fabrication du lien…' } }));
    const r = await nouveauLien(v.id);
    if (!r.chemin) {
      fenetre?.close();
      setLiens((x) => ({ ...x, [v.id]: { mot: r.motif === 'fermee' ? 'La visio est passée : plus de lien à envoyer.' : r.motif === 'annulee' ? 'Visio annulée.' : 'Le lien n’a pas pu être fabriqué. Réessayez.' } }));
      return;
    }
    const lien = `${window.location.origin}${r.chemin}`;
    const prenom = prenomDe(v.nom);
    const wa = lienWaMe(v.telephone, messageDuLien(prenom, creneauDit(v.debut), lien));
    if (wa && fenetre) { fenetre.opener = null; fenetre.location.href = wa; } else fenetre?.close();
    setLiens((x) => ({ ...x, [v.id]: { lien, mot: wa ? 'Lien neuf : WhatsApp s’ouvre avec le message prêt, il reste à l’envoyer. L’ancien lien n’ouvre plus la salle.' : 'Numéro illisible pour WhatsApp : copiez le lien ci-dessous.' } }));
    void relis();
  };
  /* Annulée par la Maison : sa ligne du Carnet, s'il y en a une, s'annule avec elle. */
  const annule = async (v: Visio) => {
    const ok = await ecrisLaVisio(v.id, { statut: 'annulée' });
    if (ok && v.rdvId) appointmentsStore.set((prev) => prev.map((a) => (a.id === v.rdvId ? { ...a, status: 'annulé' as const } : a)));
    void relis();
  };
  /* APRÈS LA VISIO, À LA MAIN : les mêmes affiches que sa page, dans un WhatsApp prêt. */
  const ecrisLaSuite = (v: Visio) => {
    /* Les mêmes mots que sa page : ils suivent son parcours (`affichesDeLaSuite`). */
    const a = affichesDeLaSuite(v.resume, v.consultationId, sansLocksEncore(queue.find((o) => o.id === v.consultationId)));
    const origine = window.location.origin;
    const wa = lienWaMe(v.telephone, messageDeLaSuite(prenomDe(v.nom), {
      ...(a.rituel ? { rituel: { nom: a.rituel.nom, noms: a.rituel.noms, lien: `${origine}${a.rituel.chemin}` } } : {}),
      ...(a.privee ? { privee: { nom: a.privee.nom, ligne: a.privee.ligne, lien: `${origine}${a.privee.chemin}` } } : {}),
    }));
    if (wa) window.open(wa, '_blank', 'noopener'); else dis(v.id, 'Numéro illisible pour WhatsApp.');
  };
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
        /* Le résumé s'ouvre au début de la visio (ou se relit s'il existe déjà). */
        const resumable = v.statut !== 'annulée' && (resumeOuvert(phase) || !!v.resume);
        /* Déplacer : tant qu'elle est réservée et n'a pas commencé. */
        const deplacable = v.statut === 'réservée' && maintenant < debutMs;
        const affiches = v.statut === 'tenue' ? affichesDeLaSuite(v.resume, v.consultationId) : {};
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
                {v.statut === 'réservée' && phase !== 'fermee' && v.lienEtat === 'a-envoyer' && <span className="trv-status trv-status--avalider">lien à envoyer</span>}
              </span>
            </div>
            {v.statut === 'réservée' && v.deplaceeDe && (
              <p className="tvz-note" style={{ margin: 0 }}>
                Déplacée depuis {creneauDit(v.deplaceeDe)}{v.deplacements > 0 ? ` · ${v.deplacements} changement${v.deplacements > 1 ? 's' : ''} par elle` : ''}.
              </p>
            )}
            {c && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div>
                  <div style={lab}>Ce qu’elle a coché</div>
                  <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>{(c.besoins ?? []).map((b) => b.mots).join(' · ') || 'rien de coché'}</p>
                </div>
                <div>
                  <div style={lab}>La lecture de la Maison</div>
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
              {v.statut === 'réservée' && phase !== 'fermee' && <Button size="sm" variant="ghost" onClick={() => void envoieLeLien(v)}>Envoyer le lien</Button>}
              {deplacable && <Button size="sm" variant="ghost" onClick={() => setDeplace(deplace === v.id ? null : v.id)}>Déplacer</Button>}
              {resumable && <Button size="sm" variant="ghost" onClick={() => setResume(resume === v.id ? null : v.id)}>{v.resume ? 'Revoir le résumé' : 'Le résumé'}</Button>}
              {(affiches.rituel || affiches.privee) && <Button size="sm" variant="ghost" onClick={() => ecrisLaSuite(v)}>Lui écrire la suite</Button>}
              {v.statut === 'réservée' && phase === 'fermee' && <Button size="sm" variant="ghost" onClick={() => void ecrisLaVisio(v.id, { statut: 'manquée' }).then(relis)}>Elle n’est pas venue</Button>}
              {v.statut === 'réservée' && phase === 'attente' && <Button size="sm" variant="ghost" onClick={() => void annule(v)}>Annuler</Button>}
            </div>
            {liens[v.id] && (
              <p className="tvz-note" role="status" style={{ margin: 0 }}>
                {liens[v.id].mot}
                {liens[v.id].lien && <><br /><span style={{ wordBreak: 'break-all', color: 'var(--ink)' }}>{liens[v.id].lien}</span></>}
              </p>
            )}
            {deplace === v.id && deplacable && (
              <DeplacerLaVisio visio={v} onFait={(mot) => { setDeplace(null); dis(v.id, mot); void relis(); }} />
            )}
            {resume === v.id && resumable && <ResumeEnTroisTouches visio={v} consultation={c} onEcrit={(mot) => { setResume(null); if (mot) dis(v.id, mot); void relis(); }} />}
          </article>
        );
      })}
      {salle && <SalleCoteMaison visio={salle} consultation={consultationDe(salle)} onQuitte={() => { setSalle(null); void relis(); }} />}
    </section>
  );
}

function resumeDit(r: ResumeDeLaVisio, argent: (n: number) => string): string {
  const a = affichesDeLaSuite(r);
  return [
    NIVEAUX.find((n) => n.id === r.niveau)?.dit,
    LONGUEURS.find((l) => l.id === r.longueur)?.dit.toLowerCase(),
    a.rituel ? `rituel proposé : ${a.rituel.noms.join(' + ') || 'à réserver'}` : '',
    a.privee ? 'consultation privée proposée' : '',
    !a.rituel && !a.privee && r.suite ? `suite : ${SUITES.find((s) => s.id === r.suite)?.dit.toLowerCase()}` : '',
    r.estimationXof ? argent(r.estimationXof) : '',
    r.par ? `par ${r.par}` : '',
  ].filter(Boolean).join(' · ');
}

/* ── DÉPLACER — 17 novembre 2026 ───────────────────────────────────────────
   « Permets de modifier l'heure d'une visio qui a été confirmée » (Yéman).
   Les quarts d'heure libres viennent de la fonction ; c'est elle qui écrit
   la nouvelle heure, libère l'ancienne et dépose le WhatsApp. Un déplacement
   par la Maison ne compte pas dans les deux changements de la cliente. */
function DeplacerLaVisio({ visio, onFait }: { visio: Visio; onFait: (mot: string) => void }) {
  const [creneaux, setCreneaux] = useState<Creneau[] | null>(null);
  const [jour, setJour] = useState('');
  const [choisi, setChoisi] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [mot, setMot] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    void creneauxDeLaVisio().then((c) => { if (vivant) { setCreneaux(c); setJour(parJour(c)[0]?.jour ?? ''); } });
    return () => { vivant = false; };
  }, []);
  const jours = parJour(creneaux ?? []);
  const duJour = jours.find((j) => j.jour === jour)?.creneaux ?? [];
  const deplace = async () => {
    if (!choisi || envoi) return;
    setEnvoi(true);
    setMot(null);
    const r = await deplaceLaVisio(visio.id, choisi);
    setEnvoi(false);
    if (r.ok) {
      onFait(r.parWhatsApp
        ? `Déplacée au ${creneauDit(choisi)}. La nouvelle heure part sur WhatsApp, avec un lien neuf : l’ancien n’ouvre plus la salle.`
        : `Déplacée au ${creneauDit(choisi)}. Le WhatsApp n’est pas parti : envoyez-lui le lien.`);
      return;
    }
    setMot(r.motif === 'pris' ? 'Ce quart d’heure vient d’être pris. Choisissez-en un autre.'
      : r.motif === 'trop-tard' ? 'La visio a commencé : elle ne se déplace plus.'
      : r.motif === 'pas-reservee' ? 'Cette visio n’est plus réservée.'
      : r.motif === 'a-change' ? 'La visio vient de changer : relisez la file.'
      : 'Le déplacement n’a pas abouti. Réessayez.');
  };
  return (
    <div className="tvz-resume">
      <div>
        <div className="tvz-lab">Déplacer la visio du {creneauDit(visio.debut)}</div>
        {creneaux === null && <p className="tvz-note">Lecture des quarts d’heure libres…</p>}
        {creneaux !== null && jours.length === 0 && <p className="tvz-note">Aucun quart d’heure libre avec les réglages de la visio.</p>}
        {jours.length > 0 && (
          <div className="tvz-puces" role="group" aria-label="Le jour">
            {jours.map((j) => (
              <button key={j.jour} type="button" className={`tvz-puce ${jour === j.jour ? 'is-on' : ''}`} aria-pressed={jour === j.jour} onClick={() => { setJour(j.jour); setChoisi(''); }}>{jourCourtDit(j.jour)}</button>
            ))}
          </div>
        )}
      </div>
      {duJour.length > 0 && (
        <div className="tvz-puces" role="group" aria-label="L’heure">
          {duJour.map((c) => (
            <button key={c.debut} type="button" className={`tvz-puce ${choisi === c.debut ? 'is-on' : ''}`} aria-pressed={choisi === c.debut} onClick={() => setChoisi(c.debut)}>{heureDite(c.debut)}</button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="sm" onClick={() => void deplace()} disabled={!choisi || envoi}>{envoi ? 'Déplacement' : choisi ? `Déplacer au ${creneauDit(choisi)}` : 'Choisissez une heure'}</Button>
        <span className="tvz-note">L’ancien quart d’heure se libère aussitôt.</span>
      </div>
      {mot && <p className="tvz-note" role="alert">{mot}</p>}
    </div>
  );
}

/* ── LE RITUEL QUE LE MAÎTRE PROPOSE — 17 novembre 2026 ────────────────────
   Des prestations du catalogue, celles qui se réservent en ligne (une
   création ou une réparation passe par la consultation privée) : la cliente
   les retrouve déjà cochées sur la page de réservation, et prend son créneau. */
function ChoixDuRituel({ choisis, onChange }: { choisis: string[]; onChange: (ids: string[]) => void }) {
  const [services] = useServices();
  const [categories] = useCategories();
  const [vitrine] = useStore(vitrineConfigStore);
  const [cherche, setCherche] = useState('');
  const reservables = useMemo(() => {
    const masques = { services: vitrine.siteMasques?.services ?? [], categories: vitrine.siteMasques?.categories ?? [] };
    return services.filter((s) => !!s.name && reservableSurLeSite(s, categories, masques));
  }, [services, categories, vitrine.siteMasques]);
  const q = cherche.trim().toLowerCase();
  const visibles = (q ? reservables.filter((s) => s.name.toLowerCase().includes(q)) : reservables).slice(0, 40);
  const bascule = (id: string) => onChange(choisis.includes(id) ? choisis.filter((x) => x !== id) : [...choisis, id].slice(0, RITUEL_AU_PLUS));
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <input className="tvz-champ" value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Chercher une prestation" aria-label="Chercher une prestation" />
      <div className="tvz-puces" style={{ maxHeight: 148, overflowY: 'auto' }}>
        {visibles.map((s) => (
          <button key={s.id} type="button" className={`tvz-puce ${choisis.includes(s.id) ? 'is-on' : ''}`} aria-pressed={choisis.includes(s.id)} onClick={() => bascule(s.id)}>{s.name}</button>
        ))}
        {visibles.length === 0 && <span className="tvz-note">Aucune prestation réservable en ligne à ce nom.</span>}
      </div>
      <span className="tvz-note">{choisis.length} sur {RITUEL_AU_PLUS} · celles qui se réservent sur le site ; le reste passe par la consultation privée.</span>
    </div>
  );
}

/* ── V4 · LE RÉSUMÉ EN TROIS TOUCHES ───────────────────────────────────── */
function ResumeEnTroisTouches({ visio, consultation, onEcrit, sombre = false }: { visio: Visio; consultation?: OnlineConsultation; onEcrit: (mot?: string) => void; sombre?: boolean }) {
  const moi = useStaff();
  const { currency } = useBranch();
  const [services] = useServices();
  const [r, setR] = useState<ResumeDeLaVisio>(visio.resume ?? {});
  const [montant, setMontant] = useState(visio.resume?.estimationXof ? String(visio.resume.estimationXof) : '');
  /* La suite, en un geste : un rituel du catalogue, la consultation privée, ou les deux. */
  const [rituelOuvert, setRituelOuvert] = useState(!!visio.resume?.rituel);
  const [gestes, setGestes] = useState<string[]>(visio.resume?.rituel?.serviceIds ?? []);
  const [privee, setPrivee] = useState(visio.resume?.privee === true || visio.resume?.suite === 'privee');
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
    const nomDe = (id: string) => services.find((s) => s.id === id)?.name ?? visio.resume?.rituel?.noms[visio.resume.rituel.serviceIds.indexOf(id)] ?? '';
    const rituel: RituelPropose | undefined = !obligatoire && rituelOuvert && gestes.length
      ? { besoin: consultation?.couronne?.pour === 'enfant' ? 'enfant' : 'entretien', serviceIds: gestes, noms: gestes.map(nomDe) }
      : undefined;
    const avecPrivee = obligatoire || privee;
    const { suite: _avant, rituel: _r, privee: _p, ...reste } = r;
    const resume: ResumeDeLaVisio = {
      ...reste,
      ...(rituel ? { rituel } : {}),
      ...(avecPrivee ? { privee: true } : {}),
      /* Le mot d'avant, gardé pour les écrans qui le lisent encore. */
      ...(avecPrivee ? { suite: 'privee' as const } : rituel ? { suite: 'soins' as const } : {}),
      ...(Number.isFinite(n) && n > 0 ? { estimationXof: n } : { estimationXof: undefined }),
      par: moi?.name ?? undefined, le: new Date().toISOString(),
    };
    const ok = await ecrisLaVisio(visio.id, { resume, statut: 'tenue' });
    if (!ok) { setEnvoi(false); setMot('Le résumé n’a pas été écrit. Réessayez.'); return; }
    /* La consultation garde l'état de sa visio : c'est lui qui ouvre la remise du bilan. */
    if (visio.consultationId) {
      consultationsQueueStore.set((prev) => prev.map((o) => (o.id === visio.consultationId
        ? ({ ...o, visio: { id: visio.id, debut: visio.debut, statut: 'tenue', tenueLe: resume.le } } as ConsultationSuivie)
        : o)));
    }
    /* Les affiches partent aussi sur WhatsApp, à la fin de la visio, si elle a fermé sa page. */
    let dit: string | undefined;
    if (rituel || avecPrivee) {
      const s = await envoieLaSuite(visio.id);
      const parti = (x?: string) => x === 'en-attente' || x === 'envoyé';
      dit = !s.ok ? 'Résumé écrit. Le WhatsApp de la suite n’a pas été déposé : « Lui écrire la suite » l’envoie à la main.'
        : [
          rituel ? (parti(s.rituel) ? 'Son rituel part sur WhatsApp à la fin de la visio.' : 'Son rituel ne part pas seul sur WhatsApp : « Lui écrire la suite ».') : '',
          avecPrivee ? (parti(s.privee) ? 'La consultation privée part sur WhatsApp à la fin de la visio.' : 'La consultation privée ne part pas seule sur WhatsApp (modèle pas encore approuvé) : « Lui écrire la suite ».') : '',
        ].filter(Boolean).join(' ');
    }
    setEnvoi(false);
    onEcrit(dit);
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
        <div className="tvz-lab">La suite · ce qu’elle verra en affiches</div>
        <div className="tvz-puces">
          {puce(!obligatoire && rituelOuvert, 'Un rituel', () => !obligatoire && setRituelOuvert(!rituelOuvert), 'rituel')}
          {puce(obligatoire || privee, 'Consultation privée', () => !obligatoire && setPrivee(!privee), 'privee')}
        </div>
        {obligatoire && <p className="tvz-note">Consultation privée obligatoire à partir de la réparation intensive : elle seule s’affiche.</p>}
        {!obligatoire && rituelOuvert && <div style={{ marginTop: 8 }}><ChoixDuRituel choisis={gestes} onChange={setGestes} /></div>}
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
function SalleCoteMaison({ visio, consultation, onQuitte }: { visio: Visio; consultation?: OnlineConsultation; onQuitte: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [mot, setMot] = useState<string | null>(null);
  const [ecrit, setEcrit] = useState<string | null>(null);
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
          {resumeOuvert(phase)
            ? <ResumeEnTroisTouches visio={visio} sombre consultation={consultation} onEcrit={(dit) => setEcrit(dit ?? '')} />
            : <p className="tvz-note" style={{ color: 'var(--indigo-100)' }}>Le résumé s’ouvre au début de la visio, à {heureDite(visio.debut)}.</p>}
          {ecrit !== null && <p className="tvz-note" style={{ color: 'var(--indigo-100)' }}>Résumé écrit : elle le reçoit à la fermeture. Vous pouvez encore le corriger.{ecrit ? ` ${ecrit}` : ''}</p>}
        </aside>
      </div>
    </div>
  );
}
