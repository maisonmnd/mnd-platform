import { useEffect, useState, type FormEvent } from 'react';
import { COMMUN } from '../contenu';
import { client, lienWhatsApp, maison } from '../maison';
import { mesure } from '../mesure';
import type { Besoin } from '../../../shared/qualification';

/* LE DIAGNOSTIC LOCKS — 27 septembre 2026, maquette validée. « J'aime
   beaucoup le quiz hair, on peut avoir une forme de quiz pour notre style de
   cheveux aussi, adapter les questions pour les locks, et faire des
   recommandations et une routine de soins » (Yéman).

   Le triage à trois questions devient cinq questions : où en sont les locks,
   le cheveu, le cuir chevelu, ce qui préoccupe, le rythme. La sortie n'est
   plus seulement une porte : c'est une porte ET une routine, chez soi et à
   la Maison, composée d'après les réponses. Rien n'est promis que le site ne
   tienne : la routine part sur WhatsApp par un lien pré-rempli, et s'inscrit
   à la fiche par la même fonction Edge que le rappel (`demande-submit`, en
   genre prospect, la routine dans le mot). Le navigateur n'écrit jamais en
   base.

   LES CONSEILS SONT DES GESTES, PAS DES PRODUITS : la voix du site n'écrit ni
   prix ni marque dans une recommandation, et un conseil de geste reste juste
   quel que soit le flacon. */

type Cle = 'etat' | 'cheveu' | 'cuir' | 'soucis' | 'rythme';
/* DEUX QUESTIONS SE COCHENT — 28 septembre 2026 : « sur la page 3 et 4 du
   diagnostic, crée des cases à cocher, plusieurs options sont possibles »
   (Yéman). Le cuir chevelu et les préoccupations acceptent plusieurs
   réponses ; chacune a une réponse « rien de tout ça » (`exclusif`) qui
   efface les autres, et que toute autre efface. */
type Question = { cle: Cle; titre: string; multi?: boolean; exclusif?: string; reponses: [string, string][] };
type Reponses = { etat?: string; cheveu?: string; cuir?: string[]; soucis?: string[]; rythme?: string };
type Porte = { besoin: Besoin; sur: string; titre: string; texte: string; vers: string; bouton: string; image: string };

const QUESTIONS: Question[] = [
  { cle: 'etat', titre: 'Où en êtes-vous ?', reponses: [
    ['aucune', 'Pas encore de locks'], ['jeunes', 'Des locks de moins d’un an'], ['mures', 'Des locks de un à cinq ans'],
    ['anciennes', 'Des locks de plus de cinq ans'], ['enfant', 'C’est pour mon enfant'],
  ] },
  { cle: 'cheveu', titre: 'Votre cheveu, au naturel', reponses: [
    ['fin', 'Fin et souple'], ['epais', 'Dense et épais'], ['moyen', 'Entre les deux'], ['inconnu', 'Je ne sais pas'],
  ] },
  { cle: 'cuir', titre: 'Votre cuir chevelu', multi: true, exclusif: 'ok', reponses: [
    ['sec', 'Il tiraille, il est sec'], ['gras', 'Il regraisse vite, il démange'], ['ok', 'Il est plutôt tranquille'],
    ['sensible', 'Il est sensible : pellicules, irritations'],
  ] },
  { cle: 'soucis', titre: 'Ce qui vous préoccupe', multi: true, exclusif: 'rien', reponses: [
    ['casse', 'Casse ou amincissement'], ['racines', 'Racines à reprendre'], ['secheresse', 'Sécheresse des longueurs'],
    ['residus', 'Résidus ou odeur après le lavage'], ['changement', 'Envie de changement : couleur, forme'], ['rien', 'Rien, je veux garder le cap'],
  ] },
  { cle: 'rythme', titre: 'Votre rythme', reponses: [
    ['mensuel', 'Je peux venir chaque mois'], ['six', 'Toutes les six à huit semaines'], ['voyage', 'Je voyage, difficile de prévoir'],
    ['apprendre', 'Je veux apprendre à faire moi-même'],
  ] },
];

/* Les portes. La formation garde sa page, elle ne se réserve pas en ligne ;
   les quatre autres mènent au calendrier (creation et reparation par la
   consultation, entretien tel quel, enfant par l'échange avec les parents). */
const PORTES: Record<string, Porte> = {
  creation: { besoin: 'creation', sur: 'Première Couronne', titre: 'Votre couronne commence ici.', texte: 'Une création débute par une consultation : on regarde le cheveu, on décide de la taille et de la méthode, puis on pose.', vers: '/premiere-couronne/', bouton: 'Voir la Première Couronne', image: 'portrait-accueil.jpg' },
  reparation: { besoin: 'reparation', sur: 'Réparation', titre: 'Regardons d’abord.', texte: 'Une réparation se décide après avoir vu, zone par zone, jamais avant.', vers: '/reparation-locks/', bouton: 'Voir la Réparation', image: 'regard.jpg' },
  entretien: { besoin: 'entretien', sur: 'Entretien', titre: 'Vos locks ont juste besoin de leur rendez-vous.', texte: 'Lavage, resserrage, hydratation, à votre rythme. Pas de consultation : choisissez votre geste et votre créneau.', vers: '/entretien-locks/', bouton: 'Voir l’entretien', image: 'entretien.jpg' },
  kids: { besoin: 'enfant', sur: 'MND Kids', titre: 'Pour votre enfant, tout va plus doucement.', texte: 'Une séance courte, des gestes légers, et le temps qu’il faut. On commence par un échange avec vous.', vers: '/mnd-kids/', bouton: 'Voir MND Kids', image: 'mnd-kids.jpg' },
  formation: { besoin: 'formation', sur: 'Académie MND', titre: 'Apprendre à faire, et à bien faire.', texte: 'La méthode, les gestes, la tenue d’une couronne puis d’un salon.', vers: '/formations/', bouton: 'Voir les formations', image: 'attention.jpg' },
};

type Routine = { porte: Porte; semaine: string[]; mois: string[]; saison: string[]; maison: string };

/* LA ROUTINE SE COMPOSE D'APRÈS LES RÉPONSES. Chaque phrase est un geste
   qu'on peut faire chez soi ou demander à la Maison ; aucune ne nomme un
   produit. La porte suit la même logique que le triage d'avant : sans locks
   on crée, un enfant va chez MND Kids, une casse ou un changement passent
   par le regard de la réparation, le reste est de l'entretien. */
export function composeLaRoutine(r: Reponses): Routine {
  const s = new Set(r.soucis ?? []);
  let cle = 'entretien';
  if (r.etat === 'enfant') cle = 'kids';
  else if (r.etat === 'aucune') cle = 'creation';
  else if (r.rythme === 'apprendre') cle = 'formation';
  else if (s.has('casse') || s.has('changement') || (s.has('racines') && r.etat === 'anciennes')) cle = 'reparation';

  const semaine: string[] = [];
  const parCuir: Record<string, string> = {
    sec: 'Brumisez le cuir chevelu d’eau puis d’une huile légère, sans charger les longueurs.',
    gras: 'Un lavage doux par semaine, clarifiant et sans résidu, et pas d’huile sur le cuir chevelu.',
    ok: 'Un lavage doux tous les sept à dix jours, une brume d’eau les autres jours.',
    sensible: 'Un lavage apaisant, sans sulfates ni parfum, puis quelques gouttes d’un sérum calmant sur le cuir chevelu.',
  };
  for (const k of r.cuir ?? []) if (parCuir[k]) semaine.push(parCuir[k]);
  semaine.push('Dormez sous un foulard ou une taie en satin : c’est la moitié de l’hydratation.');
  if (s.has('secheresse')) semaine.push('Sur les longueurs, un lait hydratant léger une fois par semaine, jamais de beurre épais.');
  if (s.has('residus')) semaine.push('Rincez longtemps, essorez à la serviette microfibre, séchez complètement : l’odeur vient de l’humidité qui reste.');

  const mois: string[] = [];
  const parEtat: Record<string, string> = {
    aucune: 'Avant la pose : deux ou trois lavages clarifiants et aucun produit lourd, pour que le cheveu accroche.',
    jeunes: 'Resserrage toutes les quatre à six semaines : c’est la période où la couronne se forme, on ne la laisse pas se défaire.',
    mures: 'Resserrage toutes les six à huit semaines, et un lavage profond à la Maison.',
    anciennes: 'Toutes les six à huit semaines : allègement des racines et contrôle des longueurs, qui portent leur poids.',
    enfant: 'Une séance courte toutes les six à huit semaines, sans tension sur les racines.',
  };
  if (r.etat && parEtat[r.etat]) mois.push(parEtat[r.etat]);
  if (s.has('casse')) mois.push('Une séance de réparation avant le prochain resserrage : on ne resserre pas ce qui casse.');
  if (r.cheveu === 'fin') mois.push('Cheveu fin : jamais un resserrage trop serré, des locks un peu plus larges qui tiendront des années.');

  const saison = ['Un soin profond à la vapeur, protéiné ou hydratant selon la saison, et un bilan de la couronne avec la Maison.'];
  if (s.has('changement')) saison.push('Le changement (couleur végétale, nouvelle forme) se décide au bilan, quand la couronne est saine.');

  const parRythme: Record<string, string> = {
    mensuel: 'Un rendez-vous chaque mois : la Maison vous propose l’abonnement, pour ne plus y penser.',
    six: 'Toutes les six à huit semaines : la Maison vous rappelle quand c’est le moment.',
    voyage: 'Vous voyagez : la Maison vous écrit avant vos passages à Cotonou, et vous garde la routine de voyage.',
    apprendre: 'Vous voulez faire vous-même : l’Académie MND commence par la tenue de votre propre couronne.',
  };
  return { porte: PORTES[cle], semaine, mois, saison, maison: parRythme[r.rythme ?? ''] ?? '' };
}

/* La routine en une seule page de texte : ce que WhatsApp reçoit, ce que la
   fiche garde. Les réponses en tête, pour que la Maison sache d'où elle
   vient. */
function routineEnTexte(r: Reponses, t: Routine): string {
  const mot = (cle: Cle, v?: string) => QUESTIONS.find((q) => q.cle === cle)?.reponses.find(([k]) => k === v)?.[1] ?? '';
  const soucis = (r.soucis ?? []).map((v) => mot('soucis', v)).filter(Boolean).join(', ');
  const cuir = (r.cuir ?? []).map((v) => mot('cuir', v)).filter(Boolean).join(', ');
  return [
    'Mon diagnostic locks (maisonmnd) :',
    `État : ${mot('etat', r.etat)}. Cheveu : ${mot('cheveu', r.cheveu)}. Cuir chevelu : ${cuir || 'non dit'}.`,
    `Préoccupations : ${soucis || 'aucune'}. Rythme : ${mot('rythme', r.rythme)}.`,
    `Ma porte : ${t.porte.sur}.`,
    `Chaque semaine : ${t.semaine.join(' ')}`,
    `Chaque mois : ${t.mois.join(' ')}`,
    `Chaque saison : ${t.saison.join(' ')}`,
    t.maison ? `À la Maison : ${t.maison}` : '',
  ].filter(Boolean).join('\n');
}

const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;
const RESERVABLES = new Set<Besoin>(['creation', 'reparation', 'entretien', 'enfant']);

export default function Triage() {
  const [etape, setEtape] = useState(0);
  const [rep, setRep] = useState<Reponses>({});
  const [numero, setNumero] = useState('');
  useEffect(() => { void maison().then((m) => setNumero(m?.whatsapp ?? '')); }, []);

  const fini = etape >= QUESTIONS.length;
  const routine = fini ? composeLaRoutine(rep) : null;

  const repond = (q: Question, v: string) => {
    if (etape === 0) mesure('triage_commence');
    if (q.multi) {
      const choisis = new Set((rep[q.cle] as string[] | undefined) ?? []);
      if (q.exclusif && v === q.exclusif) choisis.clear(); else if (q.exclusif) choisis.delete(q.exclusif);
      if (choisis.has(v)) choisis.delete(v); else choisis.add(v);
      setRep({ ...rep, [q.cle]: [...choisis] });
      return;
    }
    const suivant = { ...rep, [q.cle]: v };
    setRep(suivant);
    if (etape + 1 >= QUESTIONS.length) {
      const t = composeLaRoutine(suivant);
      mesure('triage_termine', { sortie: t.porte.besoin, parcours: t.porte.besoin });
    }
    setEtape(etape + 1);
  };
  const continueMulti = (q: Question) => {
    const deja = (rep[q.cle] as string[] | undefined) ?? [];
    const suivant = deja.length || !q.exclusif ? rep : { ...rep, [q.cle]: [q.exclusif] };
    setRep(suivant);
    if (etape + 1 >= QUESTIONS.length) {
      const t = composeLaRoutine(suivant);
      mesure('triage_termine', { sortie: t.porte.besoin, parcours: t.porte.besoin });
    }
    setEtape(etape + 1);
  };
  const recommence = () => { setRep({}); setEtape(0); };

  if (fini && routine) {
    return <Resultat rep={rep} routine={routine} numero={numero} recommence={recommence} />;
  }
  const q = QUESTIONS[etape];
  const choisis = new Set(q.multi ? ((rep[q.cle] as string[] | undefined) ?? []) : []);
  return (
    <div className="triage">
      <div className="etapes">{QUESTIONS.map((x, i) => <span key={x.cle} className={i < etape ? 'fait' : ''} />)}</div>
      <div className="question venir" key={q.cle}>
        <p className="sur">Question {etape + 1} sur {QUESTIONS.length}{q.multi ? ' · plusieurs réponses possibles' : ''}</p>
        <h2>{q.titre}</h2>
        <div className="reponses">
          {q.reponses.map(([v, texte]) => (
            <button type="button" className={`reponse${q.multi ? ' reponse--case' : ''}`} key={v} aria-pressed={q.multi ? choisis.has(v) : undefined} onClick={() => repond(q, v)}>
              <i aria-hidden="true">{q.multi && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M5 12l5 5 9-11" /></svg>}</i><span>{texte}</span>
            </button>
          ))}
        </div>
        <div className="rangee" style={{ marginTop: 18, justifyContent: 'space-between' }}>
          {etape > 0 ? <button type="button" className="btn btn--lien retour" onClick={() => setEtape(etape - 1)}>Revenir</button> : <span />}
          {q.multi && <button type="button" className="btn btn--fort" onClick={() => continueMulti(q)}>Continuer{choisis.size > 0 ? ` (${choisis.size})` : ''}</button>}
        </div>
      </div>
    </div>
  );
}

function Resultat({ rep, routine, numero, recommence }: { rep: Reponses; routine: Routine; numero: string; recommence: () => void }) {
  const { porte } = routine;
  const texte = routineEnTexte(rep, routine);
  const [prenom, setPrenom] = useState('');
  const [tel, setTel] = useState('');
  const [consent, setConsent] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [garde, setGarde] = useState(false);
  /* « La routine, comme un guide à suivre, à noter ou mémoriser quelque
     part » (Yéman, 28 septembre 2026) : chaque geste est une ligne à cocher
     chez soi, et la routine se copie d'un geste, en plus de WhatsApp et de
     la fiche. */
  const [copie, setCopie] = useState(false);
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      window.prompt('Copiez votre routine :', texte);
    }
  };
  const f = COMMUN.formulaire;

  /* La routine s'inscrit à la fiche par la fonction Edge du rappel : genre
     prospect, le besoin de la porte, la routine dans le mot. Le Trône la
     lit dans la demande, à côté du numéro. */
  const garder = async (e: FormEvent) => {
    e.preventDefault();
    if (envoi) return;
    if (tel.replace(/\D/g, '').length < 8) { setErreur(f.erreurNumero); return; }
    if (!consent) { setErreur('Cochez la case pour que la Maison garde votre routine.'); return; }
    setErreur(null);
    setEnvoi(true);
    try {
      const supabase = await client();
      if (!supabase) { setErreur('La fiche n’est pas reliée pour l’instant. Envoyez votre routine sur WhatsApp.'); return; }
      const { data, error } = await supabase.functions.invoke('demande-submit', {
        body: { genre: 'prospect', data: { prenom, telephone: tel, besoin: porte.besoin, profil: 'Diagnostic locks', mot: texte, page: location.pathname, consentement: true } },
      });
      const r = (data ?? {}) as { ok?: boolean; error?: string };
      if (error || !r.ok) {
        const code = r.error ?? (error?.message ?? '');
        setErreur(code.includes('telephone') ? f.erreurNumero : 'L’envoi n’a pas abouti. Envoyez votre routine sur WhatsApp, nous la gardons.');
        return;
      }
      setGarde(true);
      mesure('prospect_depose', { parcours: porte.besoin, genre: 'diagnostic' });
    } catch {
      setErreur('L’envoi n’a pas abouti. Envoyez votre routine sur WhatsApp, nous la gardons.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="triage">
      <div className="etapes">{QUESTIONS.map((x) => <span key={x.cle} className="fait" />)}</div>
      <div className="sortie">
        <p className="sur">Votre porte</p>
        <div className="porte-r">
          <img src={`/assets/photos/site/${porte.image}`} alt="" width="800" height="1000" loading="lazy" />
          <div><h2>{porte.sur}</h2><p>{porte.texte}</p></div>
        </div>
        <p className="sur" style={{ marginTop: 10 }}>Votre guide, en trois temps</p>
        <p className="guide__note">Chaque ligne est un geste à suivre chez vous. Gardez le guide : sur WhatsApp, copié, ou à votre fiche.</p>
        <div className="routine routine--guide">
          <div><b>Chaque semaine</b><ol>{routine.semaine.map((t) => <li key={t}>{t}</li>)}</ol></div>
          <div><b>Chaque mois</b><ol>{routine.mois.map((t) => <li key={t}>{t}</li>)}</ol></div>
          <div><b>Chaque saison</b><ol>{routine.saison.map((t) => <li key={t}>{t}</li>)}</ol></div>
        </div>
        {routine.maison && <p className="maison">{routine.maison}</p>}
        <div className="rangee">
          {porte.besoin === 'formation' ? (
            <a className="btn btn--plein" href={base(porte.vers)} onClick={() => mesure('parcours_choisi', { parcours: porte.besoin })}>{porte.bouton}</a>
          ) : (
            <a className="btn btn--plein" href={base(RESERVABLES.has(porte.besoin) ? `/reserver/?besoin=${porte.besoin}` : `/rappel/?besoin=${porte.besoin}`)} onClick={() => mesure('parcours_choisi', { parcours: porte.besoin })}>Réserver ce parcours</a>
          )}
          <a className="btn" href={lienWhatsApp(numero, texte)} target="_blank" rel="noopener" onClick={() => mesure('whatsapp_clique', { parcours: porte.besoin })}>Recevoir ma routine sur WhatsApp</a>
          <button type="button" className="btn" onClick={() => void copier()}>{copie ? 'Routine copiée' : 'Copier ma routine'}</button>
          {porte.besoin !== 'formation' && <a className="btn btn--lien" href={base(porte.vers)}>{porte.bouton}</a>}
        </div>
      </div>
      {garde ? (
        <div className="merci" style={{ marginTop: 18 }}>
          <p className="sur">Routine gardée</p>
          <h2>Votre routine est à votre fiche.</h2>
          <p>La Maison la retrouve à votre prochain rendez-vous, et vous écrit sur WhatsApp pendant ses heures d’ouverture.</p>
        </div>
      ) : (
        <form className="formulaire garder" onSubmit={(e) => void garder(e)} noValidate style={{ marginTop: 18 }}>
          <p className="sur">Garder ma routine à ma fiche</p>
          <div className="deux-champs">
            <div className="champ"><label htmlFor="diag-prenom">{f.prenom}</label><input id="diag-prenom" name="prenom" autoComplete="given-name" value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
            <div className="champ"><label htmlFor="diag-numero">{f.numero}</label><input id="diag-numero" name="numero" inputMode="tel" autoComplete="tel" value={tel} onChange={(e) => setTel(e.target.value)} required /></div>
          </div>
          <label className="consentement"><input type="checkbox" id="diag-consent" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>{f.consentement}</span></label>
          <button className="btn btn--fort" type="submit" disabled={envoi}>{envoi ? 'Envoi en cours' : 'Garder ma routine'}</button>
          {erreur && <p className="erreur" role="alert">{erreur}</p>}
        </form>
      )}
      <div className="rangee" style={{ marginTop: 22 }}><button type="button" className="btn btn--lien" onClick={recommence}>Refaire le diagnostic</button></div>
    </div>
  );
}
