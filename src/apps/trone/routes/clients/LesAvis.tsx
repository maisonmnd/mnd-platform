import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, EllipsisVertical, Search, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { jourCourtAn } from '../../../../shared/calendrier';
import { SIGNATURE_DES_AVIS, jourLocalDe, type BrouillonsDAvis } from '../../../../shared/ia-avis-pur';
import { JOURS_ENTRE_DEUX_DEMANDES, NOTE_A_RECONQUERIR, type LiensDesAvis } from '../../../../shared/avis-fiches-pur';
import { useLiensDesAvis } from '../../../../shared/avis-fiches';
import {
  ageCourt, estUneNoteBasse, etatDeLAvis, noteDesDixDerniers, ordreDeLaListe, publieesCeMois, type AvisDeLaRubrique,
} from '../../../../shared/avis-rubrique-pur';
import { moisACotonou } from '../../../../shared/ia-budget-pur';
import { ENVOIS_POUR_MESURER, JOURS_DE_REPONSE } from '../../../../shared/previsions-pur';
import { devenuDe, type EnvoiLu } from '../../../../shared/envois';
import { useAutoConfig, useEnvois } from '../equipe/data';
import { DIT_DE_L_ETAT, ETOILES, PanneauDeLAvis, PiedDesAvisGoogle, useLesAvisGoogle } from './AvisGoogle';
import type { PropsDUneVue } from './Gerard';
import './les-conversations.css';

/* ══ LES AVIS, VUE DE L'ASSISTANT MAISON · 27 octobre 2026, lot 3 ══════════
   Spécification `docs/spec-assistant-maison.md` §5.3, maquette validée
   `public/maquette-assistant-maison.html` (vue 3). D'une seule voix, signée
   Maison MND, reliée à la fiche :

     - quatre tuiles : reçus sans réponse, réponses prêtes à relire, publiées
       ce mois (à l'heure de Cotonou), la note Google et celle des dix derniers ;
     - UNE liste repliée, « Les avis Google » : ce qui attend un geste d'abord,
       1 à 3 étoiles en tête, puis du plus récent au plus ancien
       (`ordreDeLaListe`) ; sur la ligne les étoiles, le prénom tel qu'il
       paraît, la langue, l'extrait, l'âge en un mot et l'état ; un seul
       panneau ouvert (`PanneauDeLAvis`, dans `AvisGoogle.tsx`) ;
     - « Préparer les dix suivants », un à la fois ;
     - deux cartes de faits : « Demandes d'avis » (les lignes `envois` de type
       avis-google du mois, les avis revenus sous 14 jours, un taux seulement
       à partir de 20 envois) et « Qui publie » (rien ne part seul : ce qui
       est vrai aujourd'hui, aucune mécanique nouvelle, le choix 7 reste à elle).

   18 NOVEMBRE 2026, DANS LE CADRE DES CONVERSATIONS (lot 2 de « exactement
   comme WhatsApp », maquette J6ZeXBFaesywB5Q42F1TRN, planche 2) : toute la
   page ; la liste à gauche (« Avis Google », la note, la recherche, les
   puces Tous / À répondre / Prêtes à relire / 1 à 3 étoiles / Répondus, une
   ligne par avis, le nom en gras tant qu'il attend), l'avis ouvert à droite
   (son panneau, tel quel : l'avis, sa fiche, la case du site, la réponse de
   la Maison) ; sans avis ouvert, la note en grand, les compteurs et les deux
   cartes de faits. Les quatre tuiles s'effacent : leurs nombres sont là.

   Les pièces qui portent une promesse des harnais (la série des brouillons,
   la réponse sous l'avis, la fiche, la case du site) vivent dans
   `AvisGoogle.tsx` ; `useLesAvisGoogle` n'est monté qu'ici, une fois par page. */

const PAS = 20;
const SIGNES_DE_L_EXTRAIT = 96;
const initialeDe = (nom: string): string => (nom.trim().charAt(0) || '·').toUpperCase();
const extraitDe = (t: string, n = SIGNES_DE_L_EXTRAIT): string => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const uneDecimale = (n: number): string => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** « 2026-10 » → « octobre 2026 ». */
const moisDit = (mois: string): string => new Date(`${mois}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/* ── LES DEMANDES D'AVIS DU MOIS ────────────────────────────────────────────
   Une demande est « partie » quand Meta l'a prise (lu, remis, en route) ou
   quand une main l'a envoyée ; en salle d'attente, elle attend encore ; un
   échec ne compte pas. Un avis « revenu » : un avis relié à la cliente de la
   demande (`mnd_avis_fiches`), publié sur Google dans les 14 jours qui
   suivent (`JOURS_DE_REPONSE`). Le taux ne se dit qu'à partir de 20 envois
   (`ENVOIS_POUR_MESURER`) : sous ce seuil, « à mesurer ». */
const DEMANDE_PARTIE = new Set(['lu', 'remis', 'en-route', 'a-la-main']);
const EN_SALLE = new Set(['en-attente', 'retenu', 'en-envoi']);
type DemandesDuMois = { envoyees: number; revenues: number; taux: number | null; enSalle: number; sansSuite: number };

function demandesDAvisDuMois(envois: readonly EnvoiLu[], avis: readonly AvisDeLaRubrique[], liens: LiensDesAvis, mois: string): DemandesDuMois {
  const publiesPar = new Map<string, number[]>();
  for (const a of avis) {
    const cid = liens[a.cle]?.clientId;
    const t = Date.parse(String(a.publieLe ?? ''));
    if (!cid || !Number.isFinite(t)) continue;
    const l = publiesPar.get(cid);
    if (l) l.push(t); else publiesPar.set(cid, [t]);
  }
  let envoyees = 0;
  let revenues = 0;
  let enSalle = 0;
  let sansSuite = 0;
  for (const e of envois) {
    if (e.type !== 'avis-google') continue;
    const t = Date.parse(e.quand);
    if (!Number.isFinite(t) || moisACotonou(new Date(t)) !== mois) continue;
    if (EN_SALLE.has(e.statut)) { enSalle++; continue; }
    if (!DEMANDE_PARTIE.has(devenuDe(e))) { sansSuite++; continue; }
    envoyees++;
    const siens = e.clientId ? publiesPar.get(e.clientId) : undefined;
    if (siens?.some((tp) => tp >= t && tp <= t + JOURS_DE_REPONSE * 86_400_000)) revenues++;
  }
  return { envoyees, revenues, enSalle, sansSuite, taux: envoyees >= ENVOIS_POUR_MESURER ? Math.round((revenues / envoyees) * 100) : null };
}

/** Ce qui est vrai de la publication : les réponses notées publiées au Trône
    (collées ou parties par le pont), celles parties du Trône, la première. */
function faitsDeLaPublication(brouillons: BrouillonsDAvis): { relues: number; parLeTrone: number; premiere: string | null } {
  let relues = 0;
  let parLeTrone = 0;
  let premiere: string | null = null;
  for (const b of Object.values(brouillons)) {
    if (!b?.publieeLe) continue;
    relues++;
    if (b.parLeTrone) {
      parLeTrone++;
      if (!premiere || b.publieeLe < premiere) premiere = b.publieeLe;
    }
  }
  return { relues, parLeTrone, premiere };
}

/* LES PUCES DE LA LISTE (18 novembre 2026) : tous, ceux qui attendent un geste, les réponses prêtes, les notes basses, les répondus. */
type PuceDesAvis = 'tous' | 'arepondre' | 'pretes' | 'bas' | 'repondus';
const PUCES_DES_AVIS: readonly { k: PuceDesAvis; dit: string }[] = [
  { k: 'tous', dit: 'Tous' }, { k: 'arepondre', dit: 'À répondre' }, { k: 'pretes', dit: 'Prêtes à relire' }, { k: 'bas', dit: '1 à 3 étoiles' }, { k: 'repondus', dit: 'Répondus' },
];
/** Le téléphone (900 px et moins) : la liste OU l'avis ouvert, comme les Conversations. */
function useEtroit(largeur = 900): boolean {
  const [etroit, setEtroit] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(`(max-width: ${largeur}px)`).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(`(max-width: ${largeur}px)`);
    const lis = () => setEtroit(mq.matches);
    mq.addEventListener('change', lis);
    return () => mq.removeEventListener('change', lis);
  }, [largeur]);
  return etroit;
}

export default function LesAvis({ cerveau }: PropsDUneVue) {
  const d = useLesAvisGoogle();
  const [envois] = useEnvois();
  const [liens] = useLiensDesAvis();
  const [cfg] = useAutoConfig();
  const [params, setParams] = useSearchParams();
  const demande = params.get('avis');
  const [ouvert, setOuvert] = useState<string | null>(demande);
  const [enModification, setEnModification] = useState<string | null>(null);
  const [combien, setCombien] = useState(PAS);
  const [cherche, setCherche] = useState('');
  const [puce, setPuce] = useState<PuceDesAvis>('tous');
  const [menu, setMenu] = useState(false);
  const etroit = useEtroit();
  const { avis, brouillons, maintenant, releve, releveLe, deGoogle, comptes, duSite, anciens, anciensEnTout, serie, prepareLesDix, peutRepondre, pont, sansNom } = d;

  const mois = moisACotonou(new Date(maintenant));
  const publiees = useMemo(() => publieesCeMois(avis, brouillons, mois), [avis, brouillons, mois]);
  const dixDerniers = useMemo(() => noteDesDixDerniers(avis), [avis]);
  const ordonnes = useMemo(() => ordreDeLaListe(avis, brouillons, maintenant), [avis, brouillons, maintenant]);
  const q = cherche.trim().toLowerCase();
  const etatDe = (a: AvisDeLaRubrique) => etatDeLAvis(a, brouillons[a.cle], maintenant);
  const dansLaPuce = (a: AvisDeLaRubrique, p: PuceDesAvis): boolean => {
    const e = etatDe(a);
    if (p === 'arepondre') return e !== 'publiee' && e !== 'ecartee';
    if (p === 'pretes') return e === 'prete';
    if (p === 'bas') return estUneNoteBasse(a.note);
    if (p === 'repondus') return e === 'publiee';
    return true;
  };
  const vus = useMemo(
    () => (q ? ordonnes.filter((a) => `${a.auteur} ${a.texte} ${a.traduction ?? ''}`.toLowerCase().includes(q)) : ordonnes.filter((a) => dansLaPuce(a, puce))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordonnes, q, puce, brouillons, maintenant],
  );
  const demandes = useMemo(() => demandesDAvisDuMois(envois, avis, liens, mois), [envois, avis, liens, mois]);
  const publication = useMemo(() => faitsDeLaPublication(brouillons), [brouillons]);

  /* L'avis demandé d'un lien (la fiche cliente, l'alerte, l'ancienne adresse)
     s'ouvre, même loin dans la liste : on déplie jusqu'à lui. */
  useEffect(() => {
    if (!demande) return;
    setOuvert(demande);
    const i = ordonnes.findIndex((a) => a.cle === demande);
    if (i >= 0) setCombien((n) => Math.max(n, i + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demande, avis.length]);
  const ouvre = (cle: string | null) => {
    setOuvert(cle);
    setEnModification(null);
    if (params.get('avis')) setParams((p) => { p.delete('avis'); return p; }, { replace: true });
  };

  const note = releve?.note ?? 0;
  const nombre = releve?.nombre ?? avis.length;
  const arrives = !!releve || !!deGoogle;
  const avisOuvert = ouvert ? avis.find((a) => a.cle === ouvert) ?? null : null;
  /* Le menu ⋮ se ferme au clic ailleurs et à Échap. */
  useEffect(() => {
    if (!menu) return undefined;
    const ferme = (e: Event) => { if (!(e.target as Element | null)?.closest?.('[data-menu]')) setMenu(false); };
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', ferme);
    document.addEventListener('keydown', echap);
    return () => { document.removeEventListener('pointerdown', ferme); document.removeEventListener('keydown', echap); };
  }, [menu]);
  const nDeLaPuce = (p: PuceDesAvis): number => avis.filter((a) => dansLaPuce(a, p)).length;

  /** Une ligne, comme celles des Conversations : l'initiale, le prénom tel
      qu'il paraît, l'âge, les étoiles, l'extrait et l'état ; le nom en gras
      tant que l'avis attend un geste. */
  const ligneDe = (a: AvisDeLaRubrique) => {
    const b = brouillons[a.cle];
    const e = etatDeLAvis(a, b, maintenant);
    const bas = estUneNoteBasse(a.note);
    const aRepondre = e !== 'publiee' && e !== 'ecartee';
    const estOuvert = ouvert === a.cle;
    const age = ageCourt(a.publieLe, maintenant);
    const langue = (b?.langue ?? a.langueOriginale ?? '').toLowerCase();
    const mot = bas && e === 'prete' ? 'À lire d’abord' : DIT_DE_L_ETAT[e].mot;
    return (
      <li key={a.cle} className={`trc-am__avis${estOuvert ? ' est-ouverte' : ''}${aRepondre ? ' est-a-repondre' : ''}`}>
        <button type="button" className={`trc-ger__ligne trc-av__ligne${estOuvert ? ' est-courante' : ''}`} aria-expanded={estOuvert} onClick={() => ouvre(estOuvert ? null : a.cle)}>
          <span className={`trc-bx__avatar${bas && aRepondre ? ' trc-av__avatar--terre' : aRepondre ? ' trc-av__avatar--cuivre' : ''}`} aria-hidden="true">{initialeDe(a.auteur)}</span>
          <span className="trc-av__corps">
            <span className="trc-av__haut">
              <span className="trc-ger__qui"><b>{a.auteur || 'Sans nom'}</b>{langue && langue !== 'fr' ? <em>{langue}</em> : null}</span>
              <span className="trc-av__age">{age}</span>
            </span>
            <span className="trc-av__bas">
              {ETOILES(a.note, bas ? 'bas' : 'or')}
              <span className="trc-av__extrait">{a.texte ? extraitDe(a.texte) : 'Une note, sans texte.'}</span>
              <span className="trc-am__droite"><b className={`trc-av__etat trc-av__etat--${bas && aRepondre ? 'bas' : e}`}>{mot}</b></span>
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <section className={`trc-bx trc-bx-vue trc-av${etroit && avisOuvert ? ' est-ouverte' : ''}`} aria-label="Les avis Google">
      {/* LA LISTE : « Avis Google », la note, la recherche, les puces, une ligne par avis. */}
      <div className="trc-bx__liste">
        <div className="trc-bx__entete">
          <h2 className="trc-bx__titre">Avis Google</h2>
          <span className="trc-bx__plus-zone" data-menu="">
            <button type="button" className={`trc-bx__icone trc-bx__plus${menu ? ' est-choisi' : ''}`} aria-label="Les outils des avis" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              <EllipsisVertical size={19} aria-hidden="true" />
            </button>
            {menu && (
              <div className="trc-bx__menu-liste trc-bx__menu-outils" role="menu">
                <button type="button" role="menuitem" onClick={() => { ouvre(null); setMenu(false); }}><b>La note et les demandes d’avis</b><span>les chiffres du mois</span></button>
                {peutRepondre && anciensEnTout > 0 && (
                  <button type="button" role="menuitem" disabled={!!serie || anciens.length === 0} onClick={() => { setMenu(false); void prepareLesDix(); }}>
                    <b>Préparer les dix suivants</b><span>{serie ? `Claude prépare ${serie.fait + 1} sur ${serie.sur}…` : `${anciensEnTout} ancien${anciensEnTout > 1 ? 's' : ''} avis sans réponse ni proposition`}</span>
                  </button>
                )}
                {releve?.fiche && <a role="menuitem" href={releve.fiche} target="_blank" rel="noreferrer" onClick={() => setMenu(false)}><b>Voir la fiche Google</b><span>dans un nouvel onglet</span></a>}
              </div>
            )}
          </span>
        </div>
        <p className="trc-av__resume">
          {note > 0 && <><b>{uneDecimale(note)}</b> sur Google · </>}
          <span className="trc-am__resume"><b>{avis.length}</b> avis · sans réponse {comptes.sans} · prêtes {comptes.relire} · {duSite.length} sur le site</span>
        </p>
        {sansNom > 0 && (
          <p className="trc-avr__alerte-make trc-av__alerte">
            {sansNom === deGoogle?.length ? 'Les noms des autrices n’arrivent pas encore de Make' : `${sansNom} avis sont arrivés sans le nom de leur autrice`} :
            {' '}le champ <b>auteur</b> du scénario « Avis vers le Trône » est à corriger, puis l’import à relancer. Sans nom, un avis ne peut pas aller sur le site.
          </p>
        )}
        <div className="trc-bx__commandes">
          <label className="trc-bx__cherche-zone">
            <Search size={17} aria-hidden="true" />
            <input type="search" className="trc-bx__cherche" value={cherche} placeholder="Un prénom, un mot" aria-label="Chercher un avis"
              onChange={(e) => { setCherche(e.target.value); setCombien(PAS); }} />
          </label>
          <div className="trc-bx__segments" role="tablist" aria-label="Quels avis">
            {PUCES_DES_AVIS.map((p) => {
              const choisi = puce === p.k;
              const n = nDeLaPuce(p.k);
              return (
                <button key={p.k} type="button" role="tab" aria-selected={choisi} className={`${choisi ? 'est-choisi' : ''}${p.k === 'arepondre' && n > 0 ? ' est-vive' : ''}`} onClick={() => { setPuce(p.k); setCombien(PAS); }}>
                  {p.dit}{p.k !== 'tous' && <em>{n}</em>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="trc-bx__defile">
          {!arrives && <p className="trc-ger__vide">Les avis ne sont pas encore arrivés.</p>}
          {arrives && vus.length === 0 && <p className="trc-ger__vide">{q ? 'Aucun avis ne correspond.' : puce === 'tous' ? 'Aucun avis pour l’instant.' : 'Aucun avis ici.'}</p>}
          <ul className="trc-ger__liste trc-bx__lignes">{vus.slice(0, combien).map(ligneDe)}</ul>
          {vus.length > combien && (
            <button type="button" className="trc-avr__plus trc-av__plus" onClick={() => setCombien((n) => n + PAS)}>
              Voir {Math.min(PAS, vus.length - combien)} avis de plus · {vus.length - combien} restent
            </button>
          )}
        </div>
      </div>

      {avisOuvert ? (
        /* L'AVIS OUVERT, à droite : sa tête, puis son panneau tel quel (l'avis, sa fiche, la case du site, la réponse de la Maison). */
        <section className={`trc-bx__conv trc-av__ouvert${etroit ? ' trc-am__plein' : ''}`} aria-label={`L’avis de ${avisOuvert.auteur || 'sans nom'}`}>
          <div className={etroit ? 'trc-am__tete trc-bx__tete' : 'trc-bx__tete'}>
            {etroit && <button type="button" className="trc-bx__icone" onClick={() => ouvre(null)} aria-label="Revenir à la liste des avis"><ArrowLeft size={19} aria-hidden="true" /></button>}
            <span className={`trc-bx__avatar trc-bx__avatar--tete${estUneNoteBasse(avisOuvert.note) ? ' trc-av__avatar--terre' : ''}`} aria-hidden="true">{initialeDe(avisOuvert.auteur)}</span>
            <span className="trc-bx__nom trc-bx__nom--outil">
              <b>{avisOuvert.auteur || 'Sans nom'}</b>
              <span>{avisOuvert.note} étoile{avisOuvert.note > 1 ? 's' : ''} · {DIT_DE_L_ETAT[etatDe(avisOuvert)].mot}{ageCourt(avisOuvert.publieLe, maintenant) ? ` · ${ageCourt(avisOuvert.publieLe, maintenant)}` : ''}</span>
            </span>
            {!etroit && <button type="button" className="trc-bx__icone" onClick={() => ouvre(null)} aria-label="Fermer l’avis" title="Fermer"><X size={19} aria-hidden="true" /></button>}
          </div>
          <div className="trc-av__fil">
            <PanneauDeLAvis a={avisOuvert} donnees={d} edite={enModification === avisOuvert.cle} surModifier={setEnModification} />
          </div>
        </section>
      ) : !etroit ? (
        /* SANS AVIS OUVERT : la note en grand, les compteurs, les deux cartes de faits. Aucune mécanique nouvelle ici. */
        <section className="trc-bx__conv trc-av__accueil" aria-label="La note de la Maison">
          <div className="trc-av__accueil-corps">
            <div className="trc-av__note">
              <b>{note > 0 ? uneDecimale(note) : '·'}</b>
              {note > 0 && ETOILES(Math.round(note), 'or')}
              <span>{nombre} avis Google{dixDerniers.note !== null ? ` · les ${dixDerniers.n} derniers : ${uneDecimale(dixDerniers.note)}` : ''}</span>
            </div>
            <div className="trc-av__chiffres">
              <span className={comptes.sans ? 'est-alarme' : ''}><b>{comptes.sans}</b>reçu{comptes.sans > 1 ? 's' : ''} sans réponse</span>
              <span><b>{comptes.relire}</b>réponse{comptes.relire > 1 ? 's' : ''} prête{comptes.relire > 1 ? 's' : ''} à relire</span>
              <span><b>{publiees.total}</b>publiée{publiees.total > 1 ? 's' : ''} en {moisDit(mois)}{publiees.parLeTrone ? ` · ${publiees.parLeTrone} depuis le Trône` : ''}</span>
            </div>
            <div className="trc-am__cartes trc-av__cartes">
              <div className="trc-am__carte trc-am__carte--cuivre">
                <span className="trc-am__sur">Demandes d’avis</span>
                <b>{demandes.envoyees} <small style={{ fontSize: 14, color: 'var(--ink-soft)' }}>envoyée{demandes.envoyees > 1 ? 's' : ''} en {moisDit(mois)}</small></b>
                <p>
                  {demandes.revenues} avis revenu{demandes.revenues > 1 ? 's' : ''} sous {JOURS_DE_REPONSE} jours
                  {' · '}{demandes.taux !== null ? `${demandes.taux} %` : `taux à mesurer · ${demandes.envoyees} sur ${ENVOIS_POUR_MESURER}`}
                  {demandes.enSalle ? ` · ${demandes.enSalle} en salle d’attente` : ''}
                  {demandes.sansSuite ? ` · ${demandes.sansSuite} sans suite` : ''}
                </p>
                <p className="trc-ger__doux">
                  Première venue soldée, puis une fois tous les {JOURS_ENTRE_DEUX_DEMANDES} jours. Jusqu’à {NOTE_A_RECONQUERIR} étoiles : redemandée à chaque passage, jusqu’au prochain 4 ou 5.
                  {' '}{cfg.avisAuto ? 'La fonction l’envoie seule, à la première pièce soldée.' : 'Automate éteint : le comptoir ouvre WhatsApp à l’encaissement.'}
                </p>
              </div>
              <div className="trc-am__carte">
                <span className="trc-am__sur">Qui publie</span>
                <b>À la main</b>
                <p>
                  {publication.parLeTrone} réponse{publication.parLeTrone > 1 ? 's' : ''} partie{publication.parLeTrone > 1 ? 's' : ''} du Trône
                  {publication.premiere ? `, la première le ${jourCourtAn(jourLocalDe(publication.premiere))}` : ', jamais encore'}
                  {' · '}{publication.relues} réponse{publication.relues > 1 ? 's' : ''} relue{publication.relues > 1 ? 's' : ''} et notée{publication.relues > 1 ? 's' : ''} publiée{publication.relues > 1 ? 's' : ''}
                  {' · '}pont Make : {pont ? (pont.publie ? 'posé, « Publier sur Google » en deux touchers' : 'posé sans publication, copier-coller') : 'pas encore sondé'}
                </p>
                <p className="trc-ger__doux">Rien ne part seul : chaque réponse attend votre lecture, 1 à 3 étoiles toujours. Les réponses sont signées « {SIGNATURE_DES_AVIS} ».</p>
              </div>
            </div>
            {peutRepondre && anciensEnTout > 0 && (
              <div className="trc-am__gestes">
                <span className="trc-ger__doux">{serie ? `Claude prépare ${serie.fait + 1} sur ${serie.sur}…` : `${anciensEnTout} ancien${anciensEnTout > 1 ? 's' : ''} avis sans réponse ni proposition.`}</span>
                <button type="button" className="trc-ger__btn" disabled={!!serie || anciens.length === 0} onClick={() => void prepareLesDix()}>Préparer les dix suivants</button>
              </div>
            )}
            <PiedDesAvisGoogle donnees={d} />
          </div>
        </section>
      ) : null}
    </section>
  );
}
