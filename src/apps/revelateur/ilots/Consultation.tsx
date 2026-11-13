import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { COMMUN } from '../contenu';
import { client, lienWhatsApp, maison } from '../maison';
import { mesure } from '../mesure';
import { raisonDuRefus } from '../refus-du-serveur';
import { fmtMoney } from '../../../shared/currency';
import {
  AUCUNE_PREUVE, BESOINS_DE_DEPART, qualifie, reglagesSurs,
  type Besoin, type LigneQualifiee, type ReglagesDesBesoins,
} from '../../../shared/besoins-pur';
import {
  bornesDesCalibres, calibreDuNombre, fourchetteDe, proposableEnLigne, somme,
  type CalibreBrut, type Fourchette, type LongueurDite, type PrestationBrute,
} from '../../../shared/estimation-pur';
import type { OnlineConsultation } from '../../../shared/bridges';
import { FORME_DE_LA_CONSULTATION } from '../../../shared/visio-pur';
import { PortesDeLaConsultation, type Depot as DepotFait } from './PortesDeLaConsultation';

/* ══ LA CONSULTATION GRATUITE — 13 novembre 2026 (la Consultation, lot 2) ═══
   Maquette « La Consultation MND », écrans S1 à S5. « Le problème c'est
   qu'en entrée de jeu les gens ne voient pas l'utilité de payer un
   diagnostic » (Yéman) : ici, rien à payer. Elle dit ce qu'elle veut, coche
   ce qu'elle reconnaît, décrit sa couronne ; la Maison lui rend une lecture
   et une estimation au catalogue du jour. La consultation privée, payée,
   reste l'étape qui ouvre l'atelier pour une création ou une réparation.

   LES MOTS VIENNENT DU TRÔNE (document `mnd_besoins`, Système › Besoins et
   règles), les prix du catalogue ; rien n'est écrit ici en dur. Si le
   document est illisible, la semence du lot 1 prend le relais.

   LE NAVIGATEUR N'ÉCRIT JAMAIS EN BASE : le dépôt passe par la fonction
   `push-notify` (mode tunnel-submit), qui retire tout montant reçu et
   prévient l'équipe. */

type Etape = 'qui' | 'envies' | 'besoins' | 'couronne' | 'lecture' | 'deposee';
const RAIL: { e: Etape; t: string }[] = [
  { e: 'qui', t: 'Vous' }, { e: 'envies', t: 'Vos envies' }, { e: 'besoins', t: 'Vos besoins' },
  { e: 'couronne', t: 'Votre couronne' }, { e: 'lecture', t: 'Notre lecture' },
];

type Donnees = {
  reglages: ReglagesDesBesoins;
  services: Map<string, PrestationBrute>;
  calibres: CalibreBrut[];
  branchId: string;
  devise: string;
  whatsapp: string;
};

const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;

async function charge(): Promise<Donnees | null> {
  const [supabase, m] = await Promise.all([client(), maison()]);
  if (!supabase || !m) return null;
  const [svc, cats, docs] = await Promise.all([
    supabase.from('catalog_services').select('id,data'),
    supabase.from('catalog_categories').select('id,data'),
    supabase.from('documents').select('key,data').in('key', ['mnd_besoins', 'mnd_model_bands']),
  ]);
  if (svc.error || cats.error) throw new Error('catalogue illisible');
  const fermees = new Set((cats.data ?? []).filter((c) => (c.data as { enabled?: boolean } | null)?.enabled === false).map((c) => String(c.id)));
  const services = new Map<string, PrestationBrute>();
  for (const l of svc.data ?? []) {
    const d = (l.data ?? {}) as PrestationBrute;
    const s: PrestationBrute = { ...d, id: String(l.id), name: String(d.name ?? '') };
    if (proposableEnLigne(s) && !fermees.has(String(s.categoryId ?? ''))) services.set(s.id, s);
  }
  const doc = (k: string) => (docs.data ?? []).find((x) => x.key === k)?.data;
  return {
    /* Illisible (la clé n'est pas encore publique) : la semence du lot 1. */
    reglages: doc('mnd_besoins') ? reglagesSurs(doc('mnd_besoins')) : BESOINS_DE_DEPART(),
    services,
    calibres: Array.isArray(doc('mnd_model_bands')) ? (doc('mnd_model_bands') as CalibreBrut[]) : [],
    branchId: m.branchId, devise: m.devise, whatsapp: m.whatsapp,
  };
}

/** Ce qui manque, dit pour la cliente : jamais « points », jamais « palier ». */
const pourquoiDit = (l: LigneQualifiee): string =>
  l.manques.some((m) => m.startsWith('écartée'))
    ? 'Pas avant que la Maison ait vu votre cuir chevelu.'
    : l.manques.some((m) => m.includes('consultation privée'))
      ? 'Se décide à la consultation privée, devant vos locks.'
      : 'La Maison doit d’abord voir vos locks : en visio ou à la consultation privée.';

export default function Consultation() {
  const [d, setD] = useState<Donnees | null>(null);
  const [panne, setPanne] = useState(false);
  const [etape, setEtape] = useState<Etape>('qui');
  const [pour, setPour] = useState<'moi' | 'enfant' | ''>('');
  const [nees, setNees] = useState<'maison' | 'ailleurs' | 'aucune' | ''>('');
  const [familles, setFamilles] = useState<string[]>([]);
  const [choisis, setChoisis] = useState<string[]>([]);
  const [connu, setConnu] = useState<boolean | null>(null);
  const [locks, setLocks] = useState('');
  const [calibreId, setCalibreId] = useState('');
  const [longueur, setLongueur] = useState<LongueurDite | 'inconnue' | ''>('');
  const [sensibilites, setSensibilites] = useState('');
  const [retenues, setRetenues] = useState<string[] | null>(null);
  /* Lot 3 : la consultation déposée (pour réserver la visio ou régler la privée), et l'arrivée par `?privee=<id>` après la visio. */
  const [depot, setDepot] = useState<DepotFait | null>(null);
  const privee = useMemo(() => { try { const p = new URLSearchParams(location.search).get('privee') ?? ''; return FORME_DE_LA_CONSULTATION.test(p) ? p : ''; } catch { return ''; } }, []);
  const titre = useRef<HTMLHeadingElement>(null);
  const aBouge = useRef(false);

  useEffect(() => { charge().then(setD).catch(() => setPanne(true)); }, []);
  useEffect(() => { if (aBouge.current) titre.current?.focus(); }, [etape]);
  const va = (e: Etape) => {
    aBouge.current = true;
    if (e === 'envies' && etape === 'qui') mesure('consultation_commencee');
    if (e === 'lecture') mesure('consultation_lue', { genre: familles.join(',') });
    setEtape(e);
  };

  const r = d?.reglages;
  const nLocks = connu ? Math.max(0, parseInt(locks.replace(/\D/g, ''), 10) || 0) : 0;
  const lon: LongueurDite = longueur === 'inconnue' ? '' : longueur;
  const calibre = connu && nLocks > 0 && d ? calibreDuNombre(nLocks, d.calibres) : (calibreId || undefined);

  const q = useMemo(() => {
    if (!d || !r) return null;
    const prixDe = (id: string) => {
      const s = d.services.get(id);
      if (!s) return undefined;
      if (s.priceXof && s.priceXof > 0) return s.priceXof;
      const p = Object.values(s.prixParLongueur ?? {}).filter((n): n is number => typeof n === 'number' && n > 0);
      return p.length ? Math.min(...p) : undefined;
    };
    const res = qualifie(r, choisis, AUCUNE_PREUVE, prixDe);
    return { ...res, lignes: res.lignes.filter((l) => d.services.has(l.serviceId)) };
  }, [d, r, choisis]);

  const fourchette = (id: string): Fourchette | null => {
    const s = d?.services.get(id);
    return s && d ? fourchetteDe(s, { locks: nLocks || undefined, calibreId: calibre, longueur: lon, calibres: d.calibres }) : null;
  };
  const proposees = q?.lignes.filter((l) => l.ok) ?? [];
  const aConfirmer = q?.lignes.filter((l) => !l.ok) ?? [];
  const retenuesEffectives = retenues ?? (proposees[0] ? [proposees[0].serviceId] : []);
  const total = somme(retenuesEffectives.map(fourchette));
  const argent = (n: number) => fmtMoney(n, d?.devise ?? 'XOF');
  const ditFourchette = (f: Fourchette | null) => (!f ? 'chiffrée par la Maison' : f.min === f.max ? argent(f.min) : `${argent(f.min)} à ${argent(f.max)}`);

  if (panne) {
    return (
      <div className="triage"><div className="merci">
        <p className="sur">La consultation</p>
        <h2>La consultation en ligne ne répond pas pour l’instant.</h2>
        <p>Écrivez-nous sur WhatsApp : la Maison vous répond pendant ses heures d’ouverture.</p>
      </div></div>
    );
  }
  if (!d || !r) return <div className="triage"><p className="sur">La consultation se prépare…</p></div>;

  /* ── APRÈS LA VISIO : LA CONSULTATION PRIVÉE, DIRECTEMENT ── */
  if (privee && etape === 'qui') {
    return (
      <div className="triage">
        <div className="merci">
          <p className="sur">Votre consultation privée</p>
          <h2>La Maison vous reçoit, devant vos locks.</h2>
          <p>Votre lecture et votre visio sont à la Maison. Il reste à réserver la consultation privée.</p>
        </div>
        <PortesDeLaConsultation depot={{ id: privee, prenom: '', tel: '' }} branchId={d.branchId} devise={d.devise} whatsapp={d.whatsapp} atelier seulementPrivee />
        <p className="legende" style={{ marginTop: 14 }}>Une nouvelle lecture ? <a href={base('/consultation/')}>Recommencer la consultation gratuite</a>.</p>
      </div>
    );
  }

  const idx = RAIL.findIndex((x) => x.e === etape);
  const rail = (
    <div className="etapes" aria-label="Les étapes de la consultation">
      {RAIL.map((x, i) => <span key={x.e} className={i < idx || etape === 'deposee' ? 'fait' : ''} title={x.t} />)}
    </div>
  );
  const sur = (t: string) => <p className="sur">{RAIL[idx]?.t ?? 'La consultation'}{t ? ` · ${t}` : ''}</p>;
  const reponse = (on: boolean, texte: string, onClick: () => void, sousTexte?: string, cle?: string) => (
    <button type="button" key={cle ?? texte} className="reponse reponse--case" aria-pressed={on} onClick={onClick}>
      <i aria-hidden="true">{on && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M5 12l5 5 9-11" /></svg>}</i>
      <span>{texte}{sousTexte && <small style={{ display: 'block', opacity: 0.75 }}>{sousTexte}</small>}</span>
    </button>
  );
  const nav = (retour: Etape | null, suite: Etape | null, pret: boolean, texte = 'Continuer') => (
    <div className="rangee" style={{ marginTop: 18, justifyContent: 'space-between' }}>
      {retour ? <button type="button" className="btn btn--lien retour" onClick={() => va(retour)}>Revenir</button> : <span />}
      {suite && <button type="button" className="btn btn--fort" disabled={!pret} onClick={() => va(suite)}>{texte}</button>}
    </div>
  );

  /* ── 1 · VOUS ── */
  if (etape === 'qui') {
    return (
      <div className="triage">{rail}
        <div className={`question${aBouge.current ? ' venir' : ''}`}>
          {sur('gratuit, sans engagement')}
          <h2 ref={titre} tabIndex={-1}>Pour qui est cette consultation ?</h2>
          <div className="reponses">
            {reponse(pour === 'moi', 'Pour moi', () => setPour('moi'))}
            {reponse(pour === 'enfant', 'Pour mon enfant', () => { setPour('enfant'); if (!familles.length) setFamilles(['enfants']); })}
          </div>
          <h2 style={{ marginTop: 22 }}>Où en sont les locks ?</h2>
          <div className="reponses">
            {reponse(nees === 'maison', 'Des locks faites à la Maison', () => setNees('maison'))}
            {reponse(nees === 'ailleurs', 'Des locks faites ailleurs', () => setNees('ailleurs'))}
            {reponse(nees === 'aucune', 'Pas encore de locks', () => { setNees('aucune'); if (!familles.length) setFamilles(['creer']); })}
          </div>
          {nav(null, 'envies', !!pour && !!nees, 'Commencer')}
          <p className="legende" style={{ marginTop: 12 }}>Environ six minutes. Rien à payer, aucun compte à créer.</p>
        </div>
      </div>
    );
  }

  /* ── 2 · VOS ENVIES ── */
  if (etape === 'envies') {
    const bascule = (id: string) => setFamilles((f) => (f.includes(id) ? f.filter((x) => x !== id) : f.length >= 2 ? [f[1], id] : [...f, id]));
    return (
      <div className="triage">{rail}
        <div className="question venir">
          {sur('deux choix au plus')}
          <h2 ref={titre} tabIndex={-1}>Que souhaitez-vous pour votre couronne ?</h2>
          <div className="reponses">
            {r.familles.filter((f) => r.besoins.some((b) => b.famille === f.id && b.prestations.length > 0)).map((f) => reponse(familles.includes(f.id), f.nom, () => bascule(f.id), undefined, f.id))}
          </div>
          {nav('qui', 'besoins', familles.length > 0)}
        </div>
      </div>
    );
  }

  /* ── 3 · VOS BESOINS ── */
  if (etape === 'besoins') {
    const bascule = (id: string) => setChoisis((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
    const visibles = (b: Besoin) => familles.includes(b.famille) && b.prestations.some((s) => d.services.has(s));
    return (
      <div className="triage">{rail}
        <div className="question venir">
          {sur('plusieurs réponses possibles')}
          <h2 ref={titre} tabIndex={-1}>Qu’est-ce qui vous parle ?</h2>
          {familles.map((fid) => {
            const f = r.familles.find((x) => x.id === fid);
            const bs = r.besoins.filter((b) => b.famille === fid && visibles(b));
            if (!f || !bs.length) return null;
            return (
              <div key={fid} style={{ marginTop: 14 }}>
                <p className="sur" style={{ marginBottom: 8 }}>{f.nom}</p>
                <div className="reponses">{bs.map((b) => reponse(choisis.includes(b.id), b.mots, () => bascule(b.id), undefined, b.id))}</div>
              </div>
            );
          })}
          {nav('envies', 'couronne', choisis.length > 0, `Continuer${choisis.length ? ` (${choisis.length})` : ''}`)}
        </div>
      </div>
    );
  }

  /* ── 4 · VOTRE COURONNE ── */
  if (etape === 'couronne') {
    const bornes = bornesDesCalibres(d.calibres);
    const creation = nees === 'aucune';
    return (
      <div className="triage">{rail}
        <div className="question venir">
          {sur('')}
          <h2 ref={titre} tabIndex={-1}>{creation ? 'Quelle épaisseur de locks aimeriez-vous ?' : 'Combien de locks portez-vous ?'}</h2>
          {!creation && (
            <div className="reponses">
              {reponse(connu === true, 'Je connais le nombre', () => setConnu(true))}
              {reponse(connu === false, 'Je ne sais pas', () => setConnu(false))}
            </div>
          )}
          {!creation && connu === true && (
            <div className="champ" style={{ marginTop: 12, maxWidth: 260 }}>
              <label htmlFor="cg-locks">Nombre de locks</label>
              <input id="cg-locks" inputMode="numeric" value={locks} onChange={(e) => setLocks(e.target.value)} placeholder="Par exemple 120" />
            </div>
          )}
          {(creation || connu === false) && bornes.length > 0 && (
            <>
              <p className="legende" style={{ marginTop: 12 }}>Choisissez l’épaisseur qui ressemble {creation ? 'à ce que vous voulez' : 'aux vôtres'}.</p>
              <div className="reponses">
                {bornes.map((b) => reponse(calibreId === b.id, b.nom, () => setCalibreId(b.id), b.min <= 1 ? `jusqu’à ${b.max} locks` : `${b.min} à ${b.max} locks`, b.id))}
              </div>
            </>
          )}
          <h2 style={{ marginTop: 22 }}>{creation ? 'Et la longueur de vos cheveux ?' : 'Et leur longueur ?'}</h2>
          <div className="reponses">
            {reponse(longueur === 'court', 'Courtes', () => setLongueur('court'))}
            {reponse(longueur === 'mi-long', 'Mi-longues', () => setLongueur('mi-long'))}
            {reponse(longueur === 'long', 'Longues', () => setLongueur('long'))}
            {reponse(longueur === 'inconnue', 'Je ne sais pas', () => setLongueur('inconnue'))}
          </div>
          <div className="champ" style={{ marginTop: 18 }}>
            <label htmlFor="cg-sens">Une allergie, une sensibilité, les huiles essentielles ? (facultatif)</label>
            <input id="cg-sens" value={sensibilites} onChange={(e) => setSensibilites(e.target.value)} placeholder="Par exemple : je ne supporte pas les huiles essentielles" />
          </div>
          {nav('besoins', 'lecture', !!longueur && (creation ? true : connu !== null), 'Voir ma lecture')}
        </div>
      </div>
    );
  }

  /* ── 5 · NOTRE LECTURE ET L'ESTIMATION ── */
  const nom = (id: string) => d.services.get(id)?.name ?? '';
  const pourQuoi = (id: string) => r.besoins.filter((b) => choisis.includes(b.id) && b.prestations.includes(id)).map((b) => b.mots);
  const bascule = (id: string) => setRetenues((x) => {
    const c = x ?? retenuesEffectives;
    return c.includes(id) ? c.filter((y) => y !== id) : [...c, id];
  });

  if (etape === 'lecture') {
    return (
      <div className="triage">{rail}
        <div className="question venir">
          {sur('préliminaire')}
          <h2 ref={titre} tabIndex={-1}>{proposees.length ? 'Voici ce que la Maison vous propose.' : 'La Maison doit d’abord voir vos locks.'}</h2>
          {q?.peau && (
            <p className="maison" style={{ marginTop: 10 }}>
              Plaques ou psoriasis : la Maison ne pose pas de diagnostic médical. L’avis d’un dermatologue d’abord ; la Maison lit votre cuir chevelu et lave en douceur, sans détox ni décapant, tant qu’elle ne l’a pas vu.
            </p>
          )}
          {proposees.length > 0 && (
            <div className="reponses" style={{ marginTop: 12 }}>
              {proposees.map((l) => reponse(retenuesEffectives.includes(l.serviceId), nom(l.serviceId), () => bascule(l.serviceId),
                `${ditFourchette(fourchette(l.serviceId))} · pour : ${pourQuoi(l.serviceId).join(' ; ').toLowerCase()}`, l.serviceId))}
            </div>
          )}
          {aConfirmer.length > 0 && (
            <>
              <p className="sur" style={{ marginTop: 18 }}>Plus complètes, à confirmer par la Maison</p>
              {/* Des cartes comme les autres, mais qu'on ne coche pas : c'est la Maison qui décide. */}
              <div className="reponses">
                {aConfirmer.map((l) => (
                  <div key={l.serviceId} className="reponse" aria-disabled="true" style={{ cursor: 'default', opacity: 0.85 }}>
                    <span>{nom(l.serviceId)}<small style={{ display: 'block', opacity: 0.75 }}>{ditFourchette(fourchette(l.serviceId))} · {pourquoiDit(l)}</small></span>
                  </div>
                ))}
              </div>
            </>
          )}
          {retenuesEffectives.length > 0 && (
            <div className="merci" style={{ marginTop: 18 }}>
              <p className="sur">Votre estimation</p>
              <h2 style={{ margin: '4px 0' }}>{total.min === total.max ? argent(total.min) : `${argent(total.min)} à ${argent(total.max)}`}{total.aChiffrer ? ' et ce que la Maison chiffrera' : ''}</h2>
              <p>Une première orientation. Le prix ferme est donné par la Maison, après confirmation{lon ? '' : ' (la longueur, quand vous ne la savez pas, élargit la fourchette)'}.</p>
            </div>
          )}
          <Depot d={d} r={r} etat={{ pour, nees, familles, choisis, nLocks, calibre, lon, sensibilites, proposees, aConfirmer, retenues: retenuesEffectives, total, peau: !!q?.peau }}
            fourchette={fourchette} nom={nom} onDepose={(x) => { setDepot(x); va('deposee'); }} />
          {nav('couronne', null, true)}
        </div>
      </div>
    );
  }

  /* ── APRÈS LE DÉPÔT ── */
  const porte = familles.includes('creer') ? 'creation' : familles.includes('enfants') ? 'enfant'
    : familles.some((f) => ['reparer', 'structure', 'volume'].includes(f)) ? 'reparation' : 'entretien';
  const atelier = familles.some((f) => ['creer', 'reparer', 'structure', 'volume'].includes(f)) || !!q?.peau;
  const resume = `Bonjour, je viens de faire ma consultation gratuite sur le site : ${r.besoins.filter((b) => choisis.includes(b.id)).map((b) => b.mots.toLowerCase()).join(' ; ')}.`;
  return (
    <div className="triage">{rail}
      <div className="merci">
        <p className="sur">Votre lecture est à la Maison</p>
        <h2 ref={titre} tabIndex={-1}>Merci. La Maison la relit et vous écrit sur WhatsApp.</h2>
        <p>Pour la confirmer et passer à votre rituel, choisissez comment la Maison la regarde avec vous.</p>
        <div className="rangee" style={{ marginTop: 10 }}>
          <a className="btn btn--lien" href={lienWhatsApp(d.whatsapp, resume)} target="_blank" rel="noopener" onClick={() => mesure('whatsapp_clique', { parcours: porte, genre: 'consultation' })}>Écrire à la Maison</a>
          <a className="btn btn--lien" href={base(`/reserver/?besoin=${porte}`)} onClick={() => mesure('parcours_choisi', { parcours: porte, genre: 'consultation' })}>Réserver un rituel directement</a>
        </div>
      </div>
      {depot && <PortesDeLaConsultation depot={depot} branchId={d.branchId} devise={d.devise} whatsapp={d.whatsapp} atelier={atelier} />}
      <p className="legende" style={{ marginTop: 14 }}>Vous voulez seulement une routine de soins ? <a href={base('/mon-parcours/')}>Le diagnostic en cinq questions</a>.</p>
    </div>
  );
}

/* ── LE DÉPÔT ─────────────────────────────────────────────────────────── */
type Etat = {
  pour: string; nees: string; familles: string[]; choisis: string[]; nLocks: number; calibre?: string; lon: LongueurDite; sensibilites: string;
  proposees: LigneQualifiee[]; aConfirmer: LigneQualifiee[]; retenues: string[]; total: { min: number; max: number; aChiffrer: number }; peau: boolean;
};
function Depot({ d, r, etat, fourchette, nom, onDepose }: {
  d: Donnees; r: ReglagesDesBesoins; etat: Etat; fourchette: (id: string) => Fourchette | null; nom: (id: string) => string; onDepose: (x: DepotFait) => void;
}) {
  const f = COMMUN.formulaire;
  const [prenom, setPrenom] = useState('');
  const [tel, setTel] = useState('');
  const [consent, setConsent] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const envoie = async (e: FormEvent) => {
    e.preventDefault();
    if (envoi) return;
    if (!prenom.trim()) { setErreur('Votre prénom, pour que la Maison vous appelle par votre nom.'); return; }
    if (tel.replace(/\D/g, '').length < 8) { setErreur(f.erreurNumero); return; }
    if (!consent) { setErreur('Cochez la case pour que la Maison garde votre lecture.'); return; }
    setErreur(null);
    setEnvoi(true);
    try {
      const supabase = await client();
      if (!supabase) { setErreur('La Maison n’est pas joignable pour l’instant. Écrivez-nous sur WhatsApp.'); return; }
      const id = `cg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const calibreDit = etat.calibre ? bornesDesCalibres(d.calibres).find((b) => b.id === etat.calibre)?.nom : undefined;
      const besoins = r.besoins.filter((b) => etat.choisis.includes(b.id)).map((b) => ({ id: b.id, mots: b.mots, points: b.points }));
      const c: OnlineConsultation = {
        id, createdAt: new Date().toISOString(),
        parcours: etat.familles.includes('creer') ? 'creation' : 'sos',
        client: { name: prenom.trim(), phone: tel.trim(), city: '', currency: d.devise },
        answers: { familles: etat.familles, besoins: besoins.map((b) => b.mots) },
        paidXof: 0, branchId: d.branchId, status: 'nouvelle',
        modalite: 'auto', besoins,
        couronne: {
          ...(etat.nLocks ? { locks: etat.nLocks } : {}), ...(etat.calibre ? { calibreId: etat.calibre } : {}), ...(calibreDit ? { calibreDit } : {}),
          ...(etat.lon ? { longueur: etat.lon } : {}), nees: etat.nees as 'maison' | 'ailleurs' | 'aucune', pour: etat.pour as 'moi' | 'enfant',
          ...(etat.sensibilites.trim() ? { sensibilites: etat.sensibilites.trim().slice(0, 300) } : {}),
        },
        estimation: {
          lignes: etat.proposees.map((l) => { const x = fourchette(l.serviceId); return { serviceId: l.serviceId, nom: nom(l.serviceId), min: x?.min ?? null, max: x?.max ?? null, retenue: etat.retenues.includes(l.serviceId) }; }),
          aConfirmer: etat.aConfirmer.map((l) => ({ serviceId: l.serviceId, nom: nom(l.serviceId), pourquoi: pourquoiDit(l) })),
          min: etat.total.min, max: etat.total.max, aChiffrer: etat.total.aChiffrer,
        },
        ...(etat.peau ? { garde: 'peau' as const } : {}),
      };
      const fourchetteDite = etat.total.min === etat.total.max ? fmtMoney(etat.total.min, d.devise) : `${fmtMoney(etat.total.min, d.devise)} à ${fmtMoney(etat.total.max, d.devise)}`;
      const { data, error } = await supabase.functions.invoke('push-notify', {
        body: {
          mode: 'tunnel-submit',
          consultation: { id, data: c },
          title: `Consultation gratuite · ${prenom.trim()}`,
          body: `${besoins.length} besoin${besoins.length > 1 ? 's' : ''} · estimation ${fourchetteDite}${etat.peau ? ' · garde médicale' : ''}`,
          url: '/trone/#/consultations',
        },
      });
      const rep = (data ?? {}) as { ok?: boolean };
      if (error || !rep.ok) {
        const code = await raisonDuRefus(data, error);
        setErreur(code.includes('429') || code.includes('rate') ? 'Trop d’envois d’un coup. Réessayez dans quelques minutes, ou écrivez-nous sur WhatsApp.' : 'L’envoi n’a pas abouti. Réessayez, ou écrivez-nous sur WhatsApp.');
        return;
      }
      mesure('consultation_deposee', { genre: etat.familles.join(',') });
      onDepose({ id, prenom: prenom.trim(), tel: tel.trim() });
    } catch {
      setErreur('L’envoi n’a pas abouti. Réessayez, ou écrivez-nous sur WhatsApp.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form className="formulaire garder" onSubmit={(e) => void envoie(e)} noValidate style={{ marginTop: 18 }}>
      <p className="sur">Garder ma lecture et la faire confirmer</p>
      <div className="deux-champs">
        <div className="champ"><label htmlFor="cg-prenom">{f.prenom}</label><input id="cg-prenom" name="prenom" autoComplete="given-name" value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
        <div className="champ"><label htmlFor="cg-numero">{f.numero}</label><input id="cg-numero" name="numero" inputMode="tel" autoComplete="tel" value={tel} onChange={(e) => setTel(e.target.value)} required /></div>
      </div>
      <label className="consentement"><input type="checkbox" id="cg-consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>{f.consentement}</span></label>
      <button className="btn btn--fort" type="submit" disabled={envoi}>{envoi ? 'Envoi en cours' : 'Envoyer ma lecture à la Maison'}</button>
      {erreur && <p className="erreur" role="alert">{erreur}</p>}
    </form>
  );
}

