import { useEffect, useMemo, useState } from 'react';
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
  const { avis, brouillons, maintenant, releve, releveLe, deGoogle, comptes, duSite, anciens, anciensEnTout, serie, prepareLesDix, peutRepondre, pont, sansNom } = d;

  const mois = moisACotonou(new Date(maintenant));
  const publiees = useMemo(() => publieesCeMois(avis, brouillons, mois), [avis, brouillons, mois]);
  const dixDerniers = useMemo(() => noteDesDixDerniers(avis), [avis]);
  const ordonnes = useMemo(() => ordreDeLaListe(avis, brouillons, maintenant), [avis, brouillons, maintenant]);
  const q = cherche.trim().toLowerCase();
  const vus = useMemo(
    () => (q ? ordonnes.filter((a) => `${a.auteur} ${a.texte} ${a.traduction ?? ''}`.toLowerCase().includes(q)) : ordonnes),
    [ordonnes, q],
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

  return (
    <>
      {/* LES QUATRE TUILES : sans réponse (terre), prêtes (vert), publiées ce mois (indigo), la note (or). */}
      <div className="trc-am__tuiles">
        <div className={`trc-am__tuile trc-am__tuile--terre${comptes.sans ? ' est-alarme' : ''}`}>
          <b>{comptes.sans}</b>
          <span>reçu{comptes.sans > 1 ? 's' : ''} sans réponse · {avis.length} avis Google</span>
        </div>
        <div className="trc-am__tuile trc-am__tuile--vert">
          <b>{comptes.relire}</b>
          <span>réponse{comptes.relire > 1 ? 's' : ''} prête{comptes.relire > 1 ? 's' : ''} à relire</span>
        </div>
        <div className="trc-am__tuile">
          <b>{publiees.total}</b>
          <span>publiée{publiees.total > 1 ? 's' : ''} en {moisDit(mois)} · {publiees.parLeTrone ? `${publiees.parLeTrone} depuis le Trône` : 'aucune depuis le Trône'}</span>
        </div>
        <div className="trc-am__tuile trc-am__tuile--or">
          <b>{note > 0 ? uneDecimale(note) : '·'}</b>
          <span>note Google · {nombre} avis{dixDerniers.note !== null ? ` · les ${dixDerniers.n} derniers : ${uneDecimale(dixDerniers.note)}` : ''}</span>
        </div>
      </div>

      {/* LES AVIS GOOGLE, EN LISTE REPLIÉE : un panneau ouvert à la fois. */}
      <section className="trc-ger__carte">
        <div className="trc-ger__haut">
          {/* La signature dite est celle que la réponse porte vraiment (`SIGNATURE_DES_AVIS`) ; « Maison MND » seule au lot 4. */}
          <h3>Les avis Google <span>sans réponse d’abord · 1 à 3 étoiles en tête · signée « {SIGNATURE_DES_AVIS} »</span></h3>
          <span className="trc-am__resume">
            <b>{avis.length}</b> avis · sans réponse {comptes.sans} · prêtes {comptes.relire} · {duSite.length} sur le site
          </span>
        </div>
        {sansNom > 0 && (
          <p className="trc-avr__alerte-make">
            {sansNom === deGoogle?.length ? 'Les noms des autrices n’arrivent pas encore de Make' : `${sansNom} avis sont arrivés sans le nom de leur autrice`} :
            {' '}le champ <b>auteur</b> du scénario « Avis vers le Trône » est à corriger, puis l’import à relancer. Sans nom, un avis ne peut pas aller sur le site.
          </p>
        )}
        {avis.length > PAS && (
          <input className="mnd-input" type="search" value={cherche} placeholder="Chercher un prénom, un mot" aria-label="Chercher un avis"
            onChange={(e) => { setCherche(e.target.value); setCombien(PAS); }} />
        )}
        {!arrives && <p className="trc-ger__vide">Les avis ne sont pas encore arrivés.</p>}
        {arrives && vus.length === 0 && <p className="trc-ger__vide">{q ? 'Aucun avis ne correspond.' : 'Aucun avis pour l’instant.'}</p>}
        <ul className="trc-ger__liste">
          {vus.slice(0, combien).map((a) => {
            const b = brouillons[a.cle];
            const e = etatDeLAvis(a, b, maintenant);
            const bas = estUneNoteBasse(a.note);
            const aRepondre = e !== 'publiee';
            const estOuvert = ouvert === a.cle;
            const age = ageCourt(a.publieLe, maintenant);
            const langue = (b?.langue ?? a.langueOriginale ?? '').toLowerCase();
            const lien = liens[a.cle];
            const fiche = lien?.clientId ? `reliée · ${cerveau.nomDe(lien.clientId) || 'fiche effacée'}` : lien?.sansFiche ? 'sans fiche, par choix' : '';
            const mot = bas && e === 'prete' ? 'À lire d’abord' : DIT_DE_L_ETAT[e].mot;
            const sous = e === 'publiee' && a.reponduLe ? `publiée le ${jourCourtAn(jourLocalDe(a.reponduLe))}`
              : bas && aRepondre ? 'jamais publiée seule'
                : b?.le && aRepondre ? `brouillon du ${jourCourtAn(jourLocalDe(b.le))}` : '';
            return (
              <li key={a.cle} className={`trc-ger__rangee trc-am__avis${estOuvert ? ' est-ouverte' : ''}`}>
                <button type="button" className="trc-ger__ligne trc-am__ligne" aria-expanded={estOuvert} onClick={() => ouvre(estOuvert ? null : a.cle)}>
                  <span className={`trc-am__avatar${bas && aRepondre ? ' trc-am__avatar--terre' : aRepondre ? ' trc-am__avatar--cuivre' : ''}`} aria-hidden="true">{initialeDe(a.auteur)}</span>
                  <span className="trc-ger__qui">{ETOILES(a.note, bas ? 'bas' : 'or')} <b>{a.auteur || 'Sans nom'}</b>{langue && langue !== 'fr' ? <em>{langue}</em> : null}</span>
                  <span className="trc-ger__canal">{a.texte ? `« ${extraitDe(a.texte)} »` : 'Une note, sans texte.'}{age ? ` · ${age}` : ''}</span>
                  {fiche ? <span className={`trc-ger__genre${lien?.clientId ? ' trc-ger__genre--garder' : ''}`}>{fiche}</span> : <span className="trc-ger__canal" />}
                  <span className="trc-am__droite">
                    <b className={bas && aRepondre ? 'trc-am__alarme' : ''} style={{ fontSize: 14, fontFamily: 'var(--font-sans)' }}>{mot}</b>
                    <small>{sous}</small>
                  </span>
                </button>
                {estOuvert && <PanneauDeLAvis a={a} donnees={d} edite={enModification === a.cle} surModifier={setEnModification} />}
              </li>
            );
          })}
        </ul>
        {vus.length > combien && (
          <button type="button" className="trc-avr__plus" onClick={() => setCombien((n) => n + PAS)}>
            Voir {Math.min(PAS, vus.length - combien)} avis de plus · {vus.length - combien} restent
          </button>
        )}
        {peutRepondre && anciensEnTout > 0 && (
          <div className="trc-am__gestes">
            <span className="trc-ger__doux">{serie ? `Claude prépare ${serie.fait + 1} sur ${serie.sur}…` : `${anciensEnTout} ancien${anciensEnTout > 1 ? 's' : ''} avis sans réponse ni proposition.`}</span>
            <button type="button" className="trc-ger__btn" disabled={!!serie || anciens.length === 0} onClick={() => void prepareLesDix()}>Préparer les dix suivants</button>
          </div>
        )}
      </section>

      {/* DEUX CARTES DE FAITS : les demandes d'avis, qui publie. Aucune mécanique nouvelle ici. */}
      <div className="trc-am__cartes">
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
          <p className="trc-ger__doux">Rien ne part seul : chaque réponse attend votre lecture, 1 à 3 étoiles toujours. Publier seul les 4 et 5 étoiles après 24 h est le choix 7 de la spécification : rien n’est posé ici tant qu’il n’est pas tranché.</p>
        </div>
      </div>

      <PiedDesAvisGoogle donnees={d} />
    </>
  );
}
