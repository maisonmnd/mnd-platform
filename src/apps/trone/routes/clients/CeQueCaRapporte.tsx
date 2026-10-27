import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useBranch } from '../../../../shared/branches';
import { supabase } from '../../../../shared/supabase';
import { DEVISE_COMPLETE } from '../../../../shared/identite';
import { TexteFon } from '../../../../ds/fon';
import { jourAn, jourCourtAn } from '../../../../shared/calendrier';
import { useSettings } from '../../../../shared/settings';
import { CATEGORIE_DES_MODELES, cheminDeLaConversation, useMessagesWa } from '../../../../shared/conversations';
import { useCodesPromo } from '../../../../shared/promos';
import { normaliseLeCode } from '../../../../shared/promos-pur';
import { apptPaidXof } from '../../../../shared/agenda-pur';
import { reglageDeLAutomate } from '../../../../shared/automate-wa';
import { reglesDepuis, resumeDeLaSalle } from '../../../../shared/salle-des-envois';
import { compteDuJournal, envoisDeLaPeriode, jourDuSalon } from '../../../../shared/envois';
import { jourACotonou } from '../../../../shared/dernier-message-pur';
import { AUTOMATISATIONS_REELLES } from '../../../../shared/automatisations-reelles-pur';
import { ENVOIS_POUR_MESURER, JOURS_DE_REPONSE } from '../../../../shared/previsions-pur';
import { moisACotonou } from '../../../../shared/ia-budget-pur';
import { CLE_DU_COMPTEUR_DES_HUIT, dollarsDits } from '../../../../shared/ia-maison-pur';
import { CLE_DU_COMPTEUR_DU_DIAGNOSTIC } from '../../../../shared/ia-diagnostic-pur';
import { useSaitIaMaison } from '../../../../shared/ia-maison';
import { changeLesReglages, useCompteur, useReglages } from '../../../../shared/ia-centre';
import { enPermanence } from '../../../../shared/chat-du-site-pur';
import { useDiscussions } from '../../../../shared/discussions';
import { heureDuSalonDite } from '../../../../shared/assistant-aujourdhui-pur';
import {
  ANNIV_VALABLE_JOURS, COMBINER_AVANT, CREUX_A, CREUX_DE, ECART_MIN, ENDORMIE_DES_JOURS, ENDORMIE_ECART, ENDORMIE_FOIS_MAX,
  ENVIE_AVANT_CADENCE_MIN, ENVIE_REFUSEE_ATTEND, ENVIE_TOUS_LES_JOURS, ENVIE_TOUS_LES_JOURS_EN_FETES, FETES_AU, FETES_DU,
  GARDER_AVANT, GARDER_SI_POSE_DEPUIS, GENRE_DIT, MODELES_DE_GERARD, NOEL_AU, NOEL_DU, PREMIERE_ENVIE_APRES,
  RELANCE_APRES_CADENCE, RELANCE_TOUS_LES_JOURS, RELANCE_TOUS_LES_JOURS_EN_FETES, REMISE_ANNIV_PCT, REMISE_CREUX_PCT, SIGNATURE, UNE_VENUE_APRES,
  type GenreDeMessage,
} from '../../../../shared/gerard-pur';
import { estActif, eteinsLaSituation, marqueLeModeleApprouve, metEnPause } from '../../../../shared/gerard';
import {
  DEBUT_DU_COMPTE, JOURS_D_UNE_SEMAINE, VOIX_DE_LA_MAISON, aQuiIlPeutEcrire, claudeDuMois, deuxVoixLaMemeSemaine, francsDits, parSituation, periodeDuCompte,
  phraseDuVerdict, quiEcritSeul,
  type AccordLu, type Case, type ChoixDePeriode, type DocumentDuCompteur, type EnvoiDuCompte, type EtatLu, type LigneDeVoix, type LigneDuCompte,
  type MessageDuCompte, type SondeLue,
} from '../../../../shared/rapporte-pur';
import {
  ETATS_DU_MODELE, ETAT_DU_MODELE_DIT, etatDuModele, etatsNotes, noteLeModele, registreLu, useModelesMeta, type EtatDuModeleMeta,
} from '../../../../shared/modeles-meta';
import { useAutoConfig, useEnvois } from '../equipe/data';
import { useBranchAppointments, useBranchClients } from './_shared';
import { EnvoisAutomatiques } from './EnvoisAutomatiques';
import type { PropsDUneVue } from './Gerard';

/* ══ CE QUE ÇA RAPPORTE, VUE DE L'ASSISTANT MAISON · 27 octobre 2026, lot 3 ══
   Spécification `docs/spec-assistant-maison.md` §5.5 et §6.5, maquette validée
   `public/maquette-assistant-maison.html` (vue 5). « Le compte de l'Assistant
   une fois par semaine : par situation, ce qu'il a coûté et fait revenir ; à
   qui il peut écrire ; qui écrit seul avec l'état réel ; ce que Claude coûte ;
   le journal de ce qui part ; ses règles et ses modèles. »

   TOUT LE CALCUL VIT DANS `shared/rapporte-pur` (éprouvé par
   `verifie-ce-que-ca-rapporte`) ; cet écran lit les magasins, donne au pur ce
   qu'il demande, et montre. Ses règles :
     · sous 20 envois, « à mesurer », jamais un taux ; la phrase de verdict a
       une forme fixe (`phraseDuVerdict`), jamais un chiffre à la main ;
     · le barème Meta n'est pas renseigné (`mnd_tarifs_meta`, lot 4) : le coût
       Meta se dit « non renseigné », il ne s'invente pas ;
     · « Qui écrit seul » lit l'état RÉEL : l'interrupteur aux MÊMES clés que
       Paramètres (et écrit par les mêmes fonctions), la fonction posée par un
       GET sans POST (bouton « Sonder », direction), le secret nommé, le modèle
       Meta noté à la main dans `mnd_modeles_meta`, le dernier passage et les
       partis du mois dans `envois` ;
     · « Claude ce mois » lit le compteur des huit ENTIER (`parChantier` n'est
       pas un mois), le Centre et le diagnostic photo à côté ; le plafond est
       celui d'aujourd'hui, 120 $ ; les 150 $ et les parts par usage arrivent
       au lot 4 ;
     · « Ce qui part » monte la salle d'attente et le journal UNE fois
       (`EnvoisAutomatiques` porte déjà `SalleDesEnvois`), sur trente jours ;
     · un seul repli ouvert à la fois ; chaque date de cliente porte son année. */

const FUSEAU = 'Africa/Porto-Novo';

/** LES FONCTIONS QU'UN GET NE DÉCLENCHE PAS (sonde du 26 octobre 2026,
    `scripts/sonde-les-fonctions.mjs`) : route GET explicite, ou refus de tout
    ce qui n'est pas POST. Les autres (`confirmation-rdv`, `envois-partent`,
    `rappels-j1`…) n'ont pas de garde de méthode : un GET pourrait lancer le
    travail, on ne les sonde jamais ; leur état est celui du facteur. */
export const FONCTIONS_SONDABLES: readonly string[] = [
  'avis-google', 'avis-google-pont', 'boutique', 'centre-de-commande', 'demande-submit', 'diagnostic-locks', 'discussion',
  'fete-de-couronne', 'ia-maison', 'kkiapay-webhook', 'mnd-pay', 'mnd-pay-webhook', 'rappels-d-echeance', 'regler-la-seance',
  'relances-factures', 'whatsapp-automate', 'whatsapp-envoi', 'whatsapp-webhook',
];

const secretsLus = (x: unknown): Record<string, number> | undefined => {
  if (!x || typeof x !== 'object') return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) if (typeof v === 'number') out[k] = v;
  return Object.keys(out).length ? out : undefined;
};

/** UN GET À UNE FONCTION POSÉE, comme `systeme/CarteRelances.tsx` : la
    version qu'elle déclare et la longueur de ses secrets, jamais un POST.
    405 et 401 sont des réponses (la fonction est là) ; 404, elle manque. */
export async function sondeLaFonction(sb: SupabaseClient, nom: string): Promise<SondeLue> {
  if (!FONCTIONS_SONDABLES.includes(nom)) return { http: 0, erreur: 'pas sondable' };
  try {
    const { data, error } = await sb.functions.invoke(nom, { method: 'GET' });
    if (!error) {
      const d = (data && typeof data === 'object' ? data : {}) as { version?: unknown; secrets?: unknown };
      return { http: 200, ...(typeof d.version === 'string' ? { version: d.version } : {}), ...(secretsLus(d.secrets) ? { secrets: secretsLus(d.secrets) } : {}) };
    }
    const ctx = (error as { context?: unknown }).context;
    const http = ctx instanceof Response ? ctx.status : 0;
    let corps: Record<string, unknown> = {};
    if (ctx instanceof Response) { try { corps = (await ctx.json()) as Record<string, unknown>; } catch { corps = {}; } }
    return {
      http,
      ...(typeof corps.version === 'string' ? { version: corps.version } : {}),
      ...(secretsLus(corps.secrets) ? { secrets: secretsLus(corps.secrets) } : {}),
      erreur: typeof corps.erreur === 'string' ? corps.erreur : String((error as { message?: string }).message ?? 'sans réponse'),
    };
  } catch (e) {
    return { http: 0, erreur: String((e as Error)?.message ?? e) };
  }
}

/** UN DOCUMENT LU DIRECTEMENT, sans magasin : les compteurs que la fonction
    seule écrit, et le signe de vie du facteur (relu chaque minute, comme la
    salle). `undefined` : pas encore lu ; `null` : absent, ou pas de serveur. */
function useDocumentLu<T>(cle: string, toutesLesMs?: number): T | null | undefined {
  const [doc, setDoc] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    const sb = supabase;
    if (!sb) { setDoc(null); return undefined; }
    let vivant = true;
    const lis = async () => {
      const { data, error } = await sb.from('documents').select('data').eq('key', cle).maybeSingle();
      if (!vivant) return;
      setDoc(error ? null : ((data?.data ?? null) as T | null));
    };
    void lis();
    if (!toutesLesMs) return () => { vivant = false; };
    const t = window.setInterval(() => { void lis(); }, toutesLesMs);
    return () => { vivant = false; window.clearInterval(t); };
  }, [cle, toutesLesMs]);
  return doc;
}

const PERIODES: readonly { cle: ChoixDePeriode; titre: string }[] = [
  { cle: 'semaine', titre: 'Semaine' },
  { cle: 'mois', titre: 'Mois' },
  { cle: 'depuis', titre: `Depuis le ${jourAn(DEBUT_DU_COMPTE)}` },
];
type Repli = 'part' | 'regles' | 'modeles';
const virgule = (x: number): string => x.toFixed(1).replace('.', ',');
const pct = (x: number | null): string => (x === null ? '·' : `${Math.round(x * 100)} %`);
/** « Lun. 26 oct. 2026 · 8 h 10 » ; un jour seul quand l'instant n'en a pas. */
const passageDit = (iso: string | null): string => {
  if (!iso) return 'jamais';
  const jour = jourACotonou(iso);
  const t = Date.parse(iso);
  return iso.endsWith('T00:00:00.000Z') || !Number.isFinite(t) ? jourCourtAn(jour) : `${jourCourtAn(jour)} · ${heureDuSalonDite(t)}`;
};
const classeDeLaCase = (c: Case): string => (c.etat === 'alarme' ? 'trc-am__alarme' : c.etat === 'inconnu' || c.etat === 'doux' ? 'trc-ger__doux' : '');
const estUnGenre = (cle: string): cle is GenreDeMessage => cle in GENRE_DIT;
/** Les modèles Meta des autres voix (hors les huit de l'Assistant), à noter aussi. */
const AUTRES_MODELES: readonly string[] = [...new Set([
  ...AUTOMATISATIONS_REELLES.flatMap((a) => a.modeles),
  ...VOIX_DE_LA_MAISON.flatMap((v) => v.modeles),
])].filter((m) => !Object.values(MODELES_DE_GERARD).some((g) => g.nom === m)).sort();
const NOMS_SONDES: readonly string[] = [...new Set(VOIX_DE_LA_MAISON.flatMap((v) => v.fonctions))].filter((n) => FONCTIONS_SONDABLES.includes(n));

export default function CeQueCaRapporte({ cerveau, reglages, moi }: PropsDUneVue) {
  const { branch } = useBranch();
  const navigate = useNavigate();
  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  const [envois] = useEnvois();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const [codes] = useCodesPromo();
  const [messages] = useMessagesWa();
  const [cfg, setCfg] = useAutoConfig();
  const [settings, setSettings] = useSettings();
  const [reglagesDuCentre] = useReglages();
  const [compteurDuCentre] = useCompteur();
  const { permanences } = useDiscussions();
  const saitIaMaison = useSaitIaMaison();
  const [registreBrut] = useModelesMeta();
  const huit = useDocumentLu<DocumentDuCompteur>(CLE_DU_COMPTEUR_DES_HUIT);
  const diagnostic = useDocumentLu<DocumentDuCompteur>(CLE_DU_COMPTEUR_DU_DIAGNOSTIC);
  const facteur = useDocumentLu<{ vuLe?: string; version?: string }>('mnd_facteur', 60_000);
  /* L'horloge bat : le mois, la période et le signe de vie se relisent chaque minute. */
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const [choix, setChoix] = useState<ChoixDePeriode>('mois');
  const [repli, setRepli] = useState<Repli | null>(null);
  const [sondes, setSondes] = useState<Partial<Record<string, SondeLue | null>> | undefined>(undefined);
  const [sondeEnCours, setSondeEnCours] = useState(false);
  const [copie, setCopie] = useState<string | null>(null);

  const aujourdhui = jourDuSalon(new Date(tick).toISOString(), FUSEAU);
  const periode = useMemo(() => periodeDuCompte(choix, aujourdhui), [choix, aujourdhui]);
  const envoisIci = useMemo(
    () => (envois as unknown as EnvoiDuCompte[]).filter((e) => e && (!e.branchId || e.branchId === branch.id)),
    [envois, branch.id],
  );
  /* Les rendez-vous, avec l'encaissé déjà compté (`apptPaidXof`) : le pur ne lit pas l'agenda. */
  const rdvs = useMemo(() => appts.map((a) => ({ id: a.id, clientId: a.clientId, status: a.status, date: a.date, creeLe: a.creeLe, encaisseXof: apptPaidXof(a) })), [appts]);
  const codesLus = useMemo(
    () => codes.filter((c) => c.branchId === branch.id).map((c) => ({ code: c.code, clientId: c.clientId, utiliseLe: c.utiliseLe, remiseReelleXof: c.remiseReelleXof })),
    [codes, branch.id],
  );
  const parChantier = useMemo(() => {
    const d = (huit as { parChantier?: unknown } | null | undefined)?.parChantier;
    return d && typeof d === 'object' ? (d as Record<string, Record<string, { usd?: number }>>) : null;
  }, [huit]);
  /* LE TABLEAU PAR SITUATION : le barème Meta n'est pas posé (lot 4), on le dit. */
  const compte = useMemo(
    () => parSituation({ envois: envoisIci, rdvs, codes: codesLus, periode, tarifs: null, categorieDuModele: (m) => CATEGORIE_DES_MODELES[m], parChantier, normaliseLeCode }),
    [envoisIci, rdvs, codesLus, periode, parChantier],
  );
  const messagesLus = useMemo(() => messages.filter((m) => !m.branchId || m.branchId === branch.id) as readonly MessageDuCompte[], [messages, branch.id]);
  const deuxVoix = useMemo(() => deuxVoixLaMemeSemaine(envoisIci, messagesLus, periode), [envoisIci, messagesLus, periode]);
  /* LA PORTÉE : les fiches du cerveau (lues une fois par écran), les accords datés des fiches. */
  const accords = useMemo<AccordLu[]>(() => clients.flatMap((c) => (c.nouvelles ? [{ oui: c.nouvelles.oui === true, le: c.nouvelles.le }] : [])), [clients]);
  const portee = useMemo(() => aQuiIlPeutEcrire(cerveau.fiches, { accords, aujourdhui }), [cerveau.fiches, accords, aujourdhui]);
  const claude = useMemo(() => claudeDuMois({ huit, centre: compteurDuCentre, diagnostic, quand: new Date(tick) }), [huit, compteurDuCentre, diagnostic, tick]);
  const registre = useMemo(() => registreLu(registreBrut), [registreBrut]);
  /* LES MODÈLES NOTÉS : le registre, et `mnd_gerard.approuves` qui fait partir seul un modèle de l'Assistant. */
  const modelesNotes = useMemo(() => {
    const notes = etatsNotes(registre);
    for (const nom of reglages.approuves) notes[nom] = 'approuve';
    return notes;
  }, [registre, reglages.approuves]);
  const automate = useMemo(() => reglageDeLAutomate(cfg.automateWa), [cfg.automateWa]);
  const etatLu = useMemo<EtatLu>(() => ({
    maintenantMs: tick,
    mois: moisACotonou(new Date(tick)),
    envois: envoisIci,
    branchId: branch.id,
    sondes,
    facteur,
    gerard: { mode: reglages.mode, dernierPassage: reglages.dernierPassage },
    automateWa: { mode: automate.mode },
    avisAuto: cfg.avisAuto === true,
    relancesActives: settings.relances?.actives === true,
    mndPayActif: settings.mndPay?.actif === true,
    /* Le chat : quelqu'un de permanence au Trône ; sinon la fonction `discussion`
       répond par Claude quand elle est posée (sa sonde le dit) et que la clé est
       là (`ia-maison` posée en est le signe le plus proche : on ne promet rien de plus). */
    chat: { permanence: enPermanence(permanences, tick).length > 0, claude: sondes?.discussion ? saitIaMaison === true && (sondes.discussion.http === 405 || sondes.discussion.http === 200) : undefined },
    centreAutomatique: reglagesDuCentre.automatique !== false,
    modelesMeta: modelesNotes,
  }), [tick, envoisIci, branch.id, sondes, facteur, reglages.mode, reglages.dernierPassage, automate.mode, cfg.avisAuto, settings.relances?.actives, settings.mndPay?.actif, permanences, saitIaMaison, reglagesDuCentre.automatique, modelesNotes]);
  const voix = useMemo(() => quiEcritSeul(AUTOMATISATIONS_REELLES, etatLu), [etatLu]);
  const salle = useMemo(() => resumeDeLaSalle(envoisIci, tick), [envoisIci, tick]);
  const trenteJours = useMemo(() => compteDuJournal(envoisDeLaPeriode(envoisIci, '30-jours', aujourdhui)), [envoisIci, aujourdhui]);
  const regles = useMemo(() => reglesDepuis(cfg), [cfg]);
  const alarmes = voix.filter((v) => v.alarme).length;
  const approuvesDeGerard = Object.values(MODELES_DE_GERARD).filter((m) => modelesNotes[m.nom] === 'approuve').length;
  const par = moi?.name ?? 'La direction';

  /* ── Les gestes ── */
  const sonder = async () => {
    const sb = supabase;
    if (!sb || sondeEnCours) return;
    setSondeEnCours(true);
    const lues = await Promise.all(NOMS_SONDES.map(async (nom) => [nom, await sondeLaFonction(sb, nom)] as const));
    setSondes(Object.fromEntries(lues));
    setSondeEnCours(false);
  };
  /* LES INTERRUPTEURS, aux mêmes clés que Paramètres, par les mêmes fonctions. */
  const bascule = (v: LigneDeVoix) => {
    if (!direction) return;
    switch (v.id) {
      case 'assistant': metEnPause(estActif(reglages), par); return;
      case 'automate': setCfg((prev) => ({ ...prev, automateWa: { ...automate, mode: automate.mode === 'ouvert' ? 'eteint' : 'ouvert' } })); return;
      case 'relances': setSettings((s) => ({ ...s, relances: { ...(s.relances ?? {}), ...(s.relances?.actives ? { actives: false } : { actives: true, depuis: s.relances?.depuis ?? aujourdhui }) } })); return;
      case 'avis': setCfg((prev) => ({ ...prev, avisAuto: prev.avisAuto !== true })); return;
      case 'centre': changeLesReglages({ automatique: reglagesDuCentre.automatique === false }, par); return;
      default:
    }
  };
  const motDuBouton = (v: LigneDeVoix): string | null => {
    switch (v.id) {
      case 'assistant': return estActif(reglages) ? 'Pause' : 'Allumer';
      case 'automate': return automate.mode === 'ouvert' ? 'Éteindre' : 'Ouvrir';
      case 'relances': return settings.relances?.actives ? 'Éteindre' : 'Allumer';
      case 'avis': return cfg.avisAuto === true ? 'Éteindre' : 'Allumer';
      case 'centre': return reglagesDuCentre.automatique === false ? 'Rallumer' : 'Couper';
      default: return null;
    }
  };
  const noteLEtat = (nom: string, etat: EtatDuModeleMeta) => {
    if (!direction) return;
    noteLeModele(nom, etat, par);
    /* Un modèle de l'Assistant approuvé part seul au passage du matin : une seule vérité. */
    if (Object.values(MODELES_DE_GERARD).some((m) => m.nom === nom)) marqueLeModeleApprouve(nom, etat === 'approuve', par);
  };
  const copier = (cle: string, texte: string) => {
    void navigator.clipboard?.writeText(texte).then(() => setCopie(cle), () => setCopie(null));
  };
  const surRepli = (cle: Repli) => (e: SyntheticEvent<HTMLDetailsElement>) => {
    if (e.currentTarget.open) setRepli(cle);
    else setRepli((r) => (r === cle ? null : r));
  };
  const ouvreLeFil = (numero: string) => {
    const chemin = cheminDeLaConversation(numero);
    if (chemin) navigate(chemin);
  };
  const venuesDites = (l: LigneDuCompte): string => {
    if (l.service) return l.tenus === null ? '·' : `${l.tenus} tenus`;
    return l.taux === null ? String(l.venuesGagnees) : `${l.venuesGagnees} · ${pct(l.taux)}`;
  };
  const remiseEtMeta = (l: LigneDuCompte): string => (l.coutMetaXof === null ? `${francsDits(l.remiseXof)} + Meta non renseigné` : francsDits(l.remiseXof + l.coutMetaXof));
  const t = compte.total;

  return (
    <>
      {/* LA PÉRIODE, puis la phrase de verdict : forme fixe, jamais un chiffre à la main. */}
      <section className="trc-ger__carte">
        <div className="trc-ger__haut">
          <div className="mnd-segs" role="group" aria-label="Période du compte" style={{ flexWrap: 'wrap', maxWidth: '100%' }}>
            {PERIODES.map((p) => (
              <button key={p.cle} type="button" className={`mnd-seg${choix === p.cle ? ' is-active' : ''}`} aria-pressed={choix === p.cle} onClick={() => setChoix(p.cle)}>{p.titre}</button>
            ))}
          </div>
          <span className="trc-am__resume">du {jourAn(periode.du)} au {jourAn(periode.au)}</span>
        </div>
        <p style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 20, lineHeight: 1.35, color: 'var(--color-indigo)' }}>{phraseDuVerdict(t)}</p>
      </section>

      {/* LES QUATRE TUILES : encaissé, remise, Meta, le coût d'une venue. */}
      <div className="trc-am__tuiles">
        <div className="trc-am__tuile trc-am__tuile--vert"><b>{francsDits(t.encaisseXof)}</b><span>encaissés après un message · {t.venuesGagnees} venue{t.venuesGagnees > 1 ? 's' : ''} gagnée{t.venuesGagnees > 1 ? 's' : ''}</span></div>
        <div className="trc-am__tuile trc-am__tuile--cuivre"><b>{francsDits(t.remiseXof)}</b><span>de remise accordée · {t.envoyes} message{t.envoyes > 1 ? 's' : ''} parti{t.envoyes > 1 ? 's' : ''}</span></div>
        <div className="trc-am__tuile trc-am__tuile--cuivre">
          <b>{t.coutMetaXof === null ? '·' : francsDits(t.coutMetaXof)}</b>
          <span>{t.coutMetaXof === null ? `payés à Meta : barème non renseigné · ${t.parCanal.meta} message${t.parCanal.meta > 1 ? 's' : ''} Meta, Ma Couronne ${t.parCanal.couronne}` : `payés à Meta · ${t.parCanal.meta} messages, Ma Couronne ${t.parCanal.couronne} à 0 F`}</span>
        </div>
        <div className="trc-am__tuile">
          <b>{t.coutDUneVenue === null ? '·' : francsDits(t.coutDUneVenue)}</b>
          <span>{t.coutDUneVenue === null ? (t.envoyes < ENVOIS_POUR_MESURER ? `le coût d’une venue · à mesurer, ${t.envoyes} sur ${ENVOIS_POUR_MESURER}` : 'le coût d’une venue · barème Meta non renseigné') : 'le coût d’une venue gagnée'}</span>
        </div>
      </div>

      {/* PAR SITUATION : une ligne par situation, le total ; « Éteindre » à 20 envois et plus. */}
      <section className="trc-ger__carte">
        <div className="trc-ger__haut">
          <h3>Par situation <span>Ma Couronne compte 0 F</span></h3>
          <span className="trc-am__resume"><b>{compte.lignes.length}</b> situation{compte.lignes.length > 1 ? 's' : ''} · {t.envoyes} envoyé{t.envoyes > 1 ? 's' : ''} · {t.remis} remis</span>
        </div>
        {compte.lignes.length === 0 && <p className="trc-ger__vide">Rien n’est parti sur cette période.</p>}
        {compte.lignes.length > 0 && (
          <div className="mnd-scroll-x">
            <table>
              <thead><tr><th>Situation</th><th className="d">Envoyés</th><th className="d">Remis</th><th className="d">Venues</th><th className="d">Encaissé</th><th className="d">Remise + Meta</th><th className="d">Rendement</th><th>Verdict</th></tr></thead>
              <tbody>
                {compte.lignes.map((l) => {
                  const genre = estUnGenre(l.cle) ? l.cle : null;
                  const eteinte = genre !== null && reglages.eteintes.includes(genre);
                  return (
                    <tr key={l.cle}>
                      <td>{l.dit}{eteinte ? <small className="trc-am__alarme"> · éteinte</small> : null}</td>
                      <td className="d">{l.envoyes}</td>
                      <td className="d">{l.remis}</td>
                      <td className="d">{venuesDites(l)}</td>
                      <td className="d">{l.service ? '·' : francsDits(l.encaisseXof)}</td>
                      <td className="d">{remiseEtMeta(l)}</td>
                      <td className="d">{l.rendement === null ? '·' : virgule(l.rendement)}</td>
                      <td>
                        <span className={l.verdict.etat === 'a-eteindre' ? 'trc-am__alarme' : l.verdict.etat === 'a-mesurer' ? 'trc-ger__doux' : ''}>{l.verdict.dit}</span>
                        {direction && genre !== null && (l.verdict.etat === 'a-eteindre' || eteinte) && (
                          <button type="button" className="trc-ger__btn" style={{ marginLeft: 8 }} onClick={() => eteinsLaSituation(genre, !eteinte, par)}>{eteinte ? 'Rallumer' : 'Éteindre'}</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td><b>{t.verdict.dit}</b></td>
                  <td className="d"><b>{t.envoyes}</b></td>
                  <td className="d"><b>{t.remis}</b></td>
                  <td className="d"><b>{t.venuesGagnees}{t.tenus !== null ? ` + ${t.tenus} tenus` : ''}</b></td>
                  <td className="d"><b>{francsDits(t.encaisseXof)}</b></td>
                  <td className="d"><b>{remiseEtMeta(t)}</b></td>
                  <td className="d"><b>{t.rendement === null ? '·' : virgule(t.rendement)}</b></td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="trc-ger__doux">
          Venue gagnée : un RDV pris dans les {JOURS_DE_REPONSE} jours après le message, honoré, encaissé ; une fois par cliente et par fenêtre. Sous {ENVOIS_POUR_MESURER} envois : « à mesurer », jamais un taux inventé.
          {!compte.metaRenseigne ? ' Coût Meta : le barème par catégorie (mnd_tarifs_meta) n’est pas renseigné, rien n’est inventé ; il arrive au lot 4.' : ''}
        </p>
      </section>

      <div className="trc-ger__deux trc-am__deux">
        {/* À QUI IL PEUT ÉCRIRE : la portée, et le premier chiffre à faire monter. */}
        <section className="trc-ger__carte">
          <div className="trc-ger__haut">
            <h3>À qui il peut écrire <span>le premier chiffre à faire monter</span></h3>
            <span className="trc-am__resume"><b>{portee.joignables}</b> joignable{portee.joignables > 1 ? 's' : ''} sur {portee.vivantes}</span>
          </div>
          <div className="trc-am__tuiles">
            <div className="trc-am__tuile"><b>{portee.vivantes}</b><span>fiches vivantes · {portee.ecartees} écartée{portee.ecartees > 1 ? 's' : ''}</span><div className="trc-am__barre" aria-hidden="true"><i style={{ width: '100%' }} /></div></div>
            <div className="trc-am__tuile trc-am__tuile--vert"><b>{portee.couronne}</b><span>Ma Couronne : tout, à 0 F</span><div className="trc-am__barre" aria-hidden="true"><i style={{ width: `${portee.vivantes ? Math.round(100 * portee.couronne / portee.vivantes) : 0}%` }} /></div></div>
            <div className="trc-am__tuile trc-am__tuile--cuivre"><b>{portee.accordWhatsApp}</b><span>accord WhatsApp « Nouvelles de la Maison »</span><div className="trc-am__barre" aria-hidden="true"><i style={{ width: `${portee.vivantes ? Math.round(100 * portee.accordWhatsApp / portee.vivantes) : 0}%` }} /></div></div>
            <div className="trc-am__tuile"><b>{portee.sansTelephone}</b><span>sans téléphone ni Ma Couronne : rien</span><div className="trc-am__barre" aria-hidden="true"><i style={{ width: `${portee.vivantes ? Math.round(100 * portee.sansTelephone / portee.vivantes) : 0}%` }} /></div></div>
          </div>
          <ul className="trc-am__puces">
            <li><span className="trc-am__cle">Sans accord, service seulement</span> <span>{portee.sansAccord}</span></li>
            <li><span className="trc-am__cle">Stop</span> <span>{portee.stop}</span></li>
            <li><span className="trc-am__cle">Au calme (souci ouvert, reste dû)</span> <span>{portee.auCalme}</span></li>
            <li><span className="trc-am__cle">Enfants d’un foyer (le parent reçoit)</span> <span>{portee.enfantsDuFoyer}</span></li>
          </ul>
          <h4 className="trc-am__sous">Les accords notés <span>par semaine, {portee.courbe.length} semaines</span></h4>
          <div className="mnd-scroll-x">
            <table>
              <thead><tr><th>Semaine du</th>{portee.courbe.map((c) => <th key={c.lundi} className="d" style={{ textTransform: 'none', letterSpacing: 0 }}>{jourAn(c.lundi)}</th>)}</tr></thead>
              <tbody><tr><td>Accords</td>{portee.courbe.map((c) => <td key={c.lundi} className="d"><b>{c.accords}</b></td>)}</tr></tbody>
            </table>
          </div>
          <p className="trc-ger__doux">L’accord se recueille à la Caisse (la case « Nouvelles de la Maison ») et dans Ma Couronne. Sans accord, WhatsApp ne porte que les services.</p>
        </section>

        {/* CLAUDE CE MOIS : le compteur des huit, le Centre et le diagnostic à côté. */}
        <section className="trc-ger__carte">
          <div className="trc-ger__haut">
            <h3>Claude ce mois <span>un seul compteur · plafond {claude.plafond} $</span></h3>
            <span className="trc-am__resume"><b>{dollarsDits(claude.usd)}</b> sur {claude.plafond} $ · {claude.appels} appel{claude.appels > 1 ? 's' : ''}</span>
          </div>
          <div className="trc-am__tuile trc-am__tuile--or" role="img" aria-label={`${dollarsDits(claude.usd)} dépensés sur ${claude.plafond} dollars`}>
            <b>{dollarsDits(claude.usd)}</b>
            <span>{huit === undefined ? 'compteur en lecture…' : huit === null ? 'compteur des huit absent : rien n’a tourné, ou pas de serveur' : `dépensés en ${claude.mois} sur ${claude.plafond} $`}</span>
            <div className="trc-am__barre" aria-hidden="true"><i style={{ width: `${Math.round(claude.part * 100)}%` }} /></div>
          </div>
          <div className="mnd-scroll-x">
            <table>
              <thead><tr><th>Usage</th><th className="d">Appels</th><th className="d">Dépensé</th></tr></thead>
              <tbody>
                {claude.parChantier.length === 0 && <tr><td colSpan={3} className="trc-ger__doux">Aucun chantier détaillé ce mois.</td></tr>}
                {claude.parChantier.map((c) => <tr key={c.chantier}><td>{c.chantier}</td><td className="d">{c.appels}</td><td className="d">{dollarsDits(c.usd)}</td></tr>)}
                <tr><td>Centre de commande (son plafond à part)</td><td className="d">·</td><td className="d">{dollarsDits(claude.centreUsd)}</td></tr>
                <tr><td>Diagnostic photo</td><td className="d">·</td><td className="d">{dollarsDits(claude.diagnosticUsd)}</td></tr>
                <tr><td><b>Tout ce qui a tourné</b></td><td className="d" /><td className="d"><b>{dollarsDits(claude.totalUsd)}</b></td></tr>
              </tbody>
            </table>
          </div>
          <p className="trc-ger__doux">Plafond de {claude.plafond} $ aujourd’hui ; les 150 $ et les parts par usage (conversations, pièces, réponse proposée, avis) arrivent au lot 4.</p>
        </section>
      </div>

      {/* QUI ÉCRIT SEUL : une ligne par voix, l'état réel lu de dehors. Une case rouge = une promesse à vide. */}
      <section className="trc-ger__carte">
        <div className="trc-ger__haut">
          <h3>Qui écrit seul <span>l’état réel de chaque voix</span></h3>
          <span className="trc-am__resume">
            <b>{voix.length}</b> voix{alarmes ? <i className="trc-am__alarme"> · {alarmes} promesse{alarmes > 1 ? 's' : ''} à vide</i> : ' · aucune promesse à vide'}
            {sondes ? ` · sondées à ${heureDuSalonDite(tick)}` : ' · fonctions pas sondées'}
          </span>
        </div>
        <div className="trc-am__gestes">
          {direction && <button type="button" className="trc-ger__btn trc-ger__btn--cuivre" disabled={sondeEnCours || !supabase} onClick={() => { void sonder(); }}>{sondeEnCours ? 'Sonde en cours…' : 'Sonder les fonctions'}</button>}
          <small className="trc-ger__doux">Un GET à chacune des {NOMS_SONDES.length} fonctions sondables : la version qu’elle déclare, ses secrets nommés ; jamais un envoi. Confirmation, rappel J-1 et le facteur n’ont pas de GET : leur état est le signe de vie du facteur.</small>
        </div>
        <div className="mnd-scroll-x">
          <table>
            <thead><tr><th>Voix</th><th>Allumé</th><th>Posée</th><th>Secret</th><th>Modèle Meta</th><th>Dernier passage</th><th className="d">Ce mois</th></tr></thead>
            <tbody>
              {voix.map((v) => {
                const mot = direction ? motDuBouton(v) : null;
                return (
                  <tr key={v.id}>
                    <td>{v.alarme ? <span className="trc-am__puce trc-am__puce--terre" aria-label="une promesse à vide">!</span> : null} {v.nom}</td>
                    <td>
                      <span className={classeDeLaCase(v.allume)}>{v.allume.dit}</span>
                      {mot && <button type="button" className="trc-ger__btn" style={{ marginLeft: 8 }} onClick={() => bascule(v)}
                        /* L'interrupteur de l'avis venait de Paramètres (27 octobre 2026) : son sens y était dit, il se dit ici. */
                        title={v.id === 'avis' ? 'Allumée : la Maison écrit elle-même à chaque première venue soldée, le comptoir n’ouvre plus WhatsApp. Éteinte : WhatsApp s’ouvre au comptoir, un toucher pour envoyer.' : undefined}>{mot}</button>}
                    </td>
                    <td className={classeDeLaCase(v.posee)}>{v.posee.dit}</td>
                    <td className={classeDeLaCase(v.secret)}>{v.secret.dit}</td>
                    <td className={classeDeLaCase(v.modeleMeta)}>{v.modeleMeta.dit}</td>
                    <td>{passageDit(v.dernierPassage)}</td>
                    <td className="d">{v.partisCeMois === null ? <small className="trc-ger__doux">{v.compteDit ?? '·'}</small> : v.partisCeMois}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* CE QUI PART, replié : la salle d'attente et le journal, montés une fois ; deux voix la même semaine. */}
      <details className="trc-ger__carte trc-am__repli" open={repli === 'part'} onToggle={surRepli('part')}>
        <summary>
          <h3>Ce qui part <span>salle d’attente et journal sur 30 jours</span></h3>
          <span className="trc-am__resume">
            <b>{salle.attente}</b> en attente · {salle.tenus} retenu{salle.tenus > 1 ? 's' : ''}{salle.prochainDansMin !== null ? ` · prochain départ dans ${salle.prochainDansMin} min` : ''}
            {' · '}{trenteJours.partis} parti{trenteJours.partis > 1 ? 's' : ''} en 30 jours{trenteJours.aRegarder ? <i className="trc-am__alarme"> · {trenteJours.aRegarder} à regarder</i> : ''}
            {' · '}<span className={deuxVoix.nombre ? 'trc-am__alarme' : ''}>deux voix la même semaine : {deuxVoix.nombre}</span>
          </span>
        </summary>
        {repli === 'part' && (
          <>
            {deuxVoix.nombre > 0 && (
              <p className="trc-ger__doux">
                Deux messages hors service en {JOURS_D_UNE_SEMAINE} jours, toutes voix confondues (visé 0) : {deuxVoix.clientes.map((c) => `${cerveau.nomDe(c.clientId) || c.clientId} (${c.jours.map((j) => jourAn(j)).join(', ')})`).join(' · ')}
              </p>
            )}
            <EnvoisAutomatiques onOuvrirLeFil={ouvreLeFil} jourInitial="30-jours" />
          </>
        )}
      </details>

      {/* SES RÈGLES, repliées, direction : les chiffres figés du cerveau, lus aux mêmes constantes que l'écran Aujourd'hui. */}
      {direction && (
        <details className="trc-ger__carte trc-am__repli" open={repli === 'regles'} onToggle={surRepli('regles')}>
          <summary>
            <h3>Ses règles <span>les chiffres figés du cerveau</span></h3>
            <span className="trc-am__resume"><b>{ECART_MIN}</b> jours entre deux messages · {reglages.remisesParSemaine} remises et {francsDits(reglages.plafondFrancs)} par semaine · calme de {regles.calmeDe} h à {regles.calmeA} h</span>
          </summary>
          <div className="mnd-scroll-x">
            <table>
              <tbody>
                <tr><td>Entre deux messages hors service</td><td className="d"><b>{ECART_MIN}</b> jours</td><td>toutes voix comptées ; garder son RDV et les services passent toujours</td></tr>
                <tr><td>Garder son RDV</td><td className="d"><b>J-{GARDER_AVANT}</b></td><td>pour un RDV pris depuis plus de {GARDER_SI_POSE_DEPUIS} jours ; la veille, le rappel habituel</td></tr>
                <tr><td>Tout combiner</td><td className="d"><b>J-{COMBINER_AVANT}</b></td><td>avant sa date de cadence ; une envie se tait à moins de {ENVIE_AVANT_CADENCE_MIN} jours</td></tr>
                <tr><td>Première envie</td><td className="d"><b>J+{PREMIERE_ENVIE_APRES}</b></td><td>puis tous les {ENVIE_TOUS_LES_JOURS} jours ({ENVIE_TOUS_LES_JOURS_EN_FETES} en fêtes) ; refusée, elle attend {ENVIE_REFUSEE_ATTEND} jours</td></tr>
                <tr><td>Retard</td><td className="d">cadence + <b>{RELANCE_APRES_CADENCE}</b> jours</td><td>relance toutes les {RELANCE_TOUS_LES_JOURS / 7} semaines ({RELANCE_TOUS_LES_JOURS_EN_FETES / 7} en fêtes)</td></tr>
                <tr><td>Une seule venue · endormie</td><td className="d"><b>{UNE_VENUE_APRES}</b> · <b>{ENDORMIE_DES_JOURS}</b> jours</td><td>une endormie {ENDORMIE_FOIS_MAX} fois au plus, à {ENDORMIE_ECART} jours d’écart</td></tr>
                <tr><td>Jours creux</td><td className="d">de <b>{CREUX_DE}</b> à <b>{CREUX_A}</b> jours</td><td>remise {REMISE_CREUX_PCT} % ; anniversaire {REMISE_ANNIV_PCT} % sur {ANNIV_VALABLE_JOURS} jours</td></tr>
                <tr><td>Remises par semaine, tout compris</td><td className="d"><b>{reglages.remisesParSemaine}</b> · <b>{francsDits(reglages.plafondFrancs)}</b></td><td>jamais deux à la fois ; réglées dans Aujourd’hui</td></tr>
                <tr><td>Saison des fêtes · Noël</td><td className="d"><b>{FETES_DU.replace('-', '/')}</b> au <b>{FETES_AU.replace('-', '/')}</b></td><td>le message de Noël du {NOEL_DU.replace('-', '/')} au {NOEL_AU.replace('-', '/')}, sans remise</td></tr>
                <tr><td>Salle d’attente</td><td className="d"><b>{regles.salleMin}</b> min</td><td>heures calmes de {regles.calmeDe} h à {regles.calmeA} h (mnd_auto_config)</td></tr>
                <tr><td>Verdict</td><td className="d"><b>{ENVOIS_POUR_MESURER}</b> envois</td><td>venue gagnée sous {JOURS_DE_REPONSE} jours ; utile si taux ≥ 10 % et rendement ≥ 3 ; à éteindre si 0 venue ou rendement sous 1</td></tr>
                <tr><td>Situations éteintes</td><td className="d"><b>{reglages.eteintes.length}</b></td><td>{reglages.eteintes.length ? reglages.eteintes.map((g) => GENRE_DIT[g]).join(', ') : 'aucune'}</td></tr>
                <tr><td>Signature</td><td className="d"><b>{SIGNATURE}</b></td><td>jamais de prix, jamais de civilité supposée ; à « c’est un robot ? », il ne nie pas</td></tr>
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* SES MODÈLES CHEZ META, repliés, direction : les 7 + 1, Copier, et l'état noté à la main. */}
      {direction && (
        <details className="trc-ger__carte trc-am__repli" open={repli === 'modeles'} onToggle={surRepli('modeles')}>
          <summary>
            <h3>Ses modèles chez Meta <span>7 + 1 · état noté à la main</span></h3>
            <span className="trc-am__resume"><b className={approuvesDeGerard === 0 ? 'trc-am__alarme' : ''}>{approuvesDeGerard}</b> approuvé{approuvesDeGerard > 1 ? 's' : ''} sur {Object.keys(MODELES_DE_GERARD).length}</span>
          </summary>
          <p className="trc-ger__doux">Dans le gestionnaire WhatsApp de Meta, un modèle par ligne : le nom, la catégorie, le corps tel quel ({'{{1}}'}, {'{{2}}'}… sont les variables), le pied « <TexteFon texte={DEVISE_COMPLETE} /> », les boutons. Notez ici ce que Meta a répondu : un modèle approuvé de l’Assistant part seul au passage du matin.</p>
          <ul className="trc-ger__modeles">
            {Object.entries(MODELES_DE_GERARD).map(([cle, m]) => {
              const bloc = `${m.nom}\n${m.categorie}\n\n${m.corps}\n\n${DEVISE_COMPLETE}\n\nBoutons : ${m.boutons.join(' · ')}`;
              const etat: EtatDuModeleMeta = modelesNotes[m.nom] === 'approuve' ? 'approuve' : etatDuModele(registre, m.nom);
              return (
                <li key={cle}>
                  <div>
                    <b>{m.nom}</b>
                    <small>{m.categorie === 'UTILITY' ? 'Utilitaire · service' : 'Marketing · sous accord'} · {m.boutons.join(' · ')}</small>
                    <label className="trc-ger__doux" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <span className={etat === 'approuve' ? '' : 'trc-am__alarme'}>{ETAT_DU_MODELE_DIT[etat]}</span>
                      <select aria-label={`État du modèle ${m.nom} chez Meta`} value={etat} onChange={(e) => noteLEtat(m.nom, e.target.value as EtatDuModeleMeta)} style={{ font: 'inherit', fontSize: 12 }}>
                        {ETATS_DU_MODELE.map((x) => <option key={x} value={x}>{ETAT_DU_MODELE_DIT[x]}</option>)}
                      </select>
                    </label>
                  </div>
                  <p className="trc-ger__texte">{m.corps}</p>
                  <button type="button" className="trc-ger__btn" onClick={() => copier(cle, bloc)}>{copie === cle ? 'Copié' : 'Copier'}</button>
                </li>
              );
            })}
          </ul>
          <h4 className="trc-am__sous">Les autres modèles de la Maison <span>{AUTRES_MODELES.length} noms · ce qu’en dit Meta</span></h4>
          <ul className="trc-am__puces">
            {AUTRES_MODELES.map((nom) => {
              const etat = etatDuModele(registre, nom);
              return (
                <li key={nom}>
                  <span className="trc-am__cle" style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{nom}</span>
                  <span>
                    <select aria-label={`État du modèle ${nom} chez Meta`} value={etat} onChange={(e) => noteLEtat(nom, e.target.value as EtatDuModeleMeta)} style={{ font: 'inherit', fontSize: 12 }}>
                      {ETATS_DU_MODELE.map((x) => <option key={x} value={x}>{ETAT_DU_MODELE_DIT[x]}</option>)}
                    </select>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </>
  );
}
