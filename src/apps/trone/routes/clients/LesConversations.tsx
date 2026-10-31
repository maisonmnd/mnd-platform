import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Modal, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { prenomSeul } from '../../../../shared/civilite';
import { useSettings } from '../../../../shared/settings';
import {
  archiveLeFil, automatesDesFils, desarchiveLeFil, estArchive, estReserve, filNeuf, filsDeLaMaison, lienWaMe, messagesQuiSonnent,
  numeroWa, numerosTenus, sonnentApresLAutomate, teteDuNumero, tetesDeLaMaison, useFilsArchives, useFilsAutomate, useFilsPrives,
  useMessagesWa, type Fil, type MessageWa, type VueDeLaSonnette,
} from '../../../../shared/conversations';
import { reglageDeLAutomate } from '../../../../shared/automate-wa';
import { armeLaSonnette, cestLaNuit, sonne } from '../../../../shared/sonnette';
import { heuresDuJour } from './_heures';
import { changeLEtat, repondre, useDiscussions, useMessagesDe } from '../../../../shared/discussions';
import { dansLeFiltre, demandesStore, useDemandes, type Demande } from '../../../../shared/demandes';
import { useAppelsWa } from '../../../../shared/appels-wa';
import { marquerAppelFait, useAppels } from '../../../../shared/appels';
import { useSignalements } from '../../../../shared/entre-deux';
import { NIVEAUX, niveauDe } from '../../../../shared/entre-deux-pur';
import { useAutoConfig, useEnvois } from '../equipe/data';
import { codesVivantsDe, useCodesPromo } from '../../../../shared/promos';
import { derniersMessagesHorsService, estUnService, jourACotonou } from '../../../../shared/dernier-message-pur';
import { typeDit } from '../../../../shared/envois';
import { jourDit, heureDite, type FicheDeGerard } from '../../../../shared/gerard-pur';
import { francs as enFrancs } from '../../../../shared/ia-faits-pur';
import { dureeDite as depuisDit } from '../../../../shared/assistant-aujourdhui-pur';
import {
  FILTRE_DIT, boiteDuNumero, boitesDeLaMaison, boitesDuFiltre, cleDuFilRange, comptesDesFiltres, heureACotonou, repondusSousUneHeure,
  reponsesGratuitesRestantes, type AuteurDeBulle, type Boite, type Bulle, type EnvoiDeLaBoite, type FiltreDeLaBoite, type SourceDeBulle,
} from '../../../../shared/boite-unique-pur';
import {
  GROUPES_A_TRAITER, GROUPE_DIT, ceQuIlFautFaire, groupeDe, pastilleDe, type GesteATraiter,
} from '../../../../shared/a-traiter-pur';
import { deRangeLaBoite, rangeLaBoite, useRiensARepondre } from '../../../../shared/rien-a-repondre';
import { ClientPicker, RdvModal, useBranchAppointments, useBranchClients, type RdvInitial } from './_shared';
import { ComposeurWhatsApp, type PoigneeDuComposeur } from './ComposeurWhatsApp';
import { PieceDuFil, attache } from './Conversations';
import { CaptureLue } from './CaptureLue';
import { LeSouci } from './EntreDeuxSeances';
import { convertir } from './Demandes';
import { ficheConnueDe, ouvreLaFiche } from './Discussions';
import ReponsesDeLaMaison, { useCompteDesReponses } from './ReponsesDeLaMaison';
import BanqueDeScenarios from './BanqueDeScenarios';
import { banqueStore, useBanque } from '../../../../shared/banque-scenarios';
import { ajouteDesCas, banqueLue, idDuCas, texteDuCas } from '../../../../shared/banque-scenarios-pur';
import { EnvoisAutomatiques } from './EnvoisAutomatiques';
import type { PropsDUneVue } from './Gerard';
import './clients.css';
import './les-conversations.css';
import { bloqueLesNumeros, debloqueLeNumero, relisLesDernieresHeures, rendsLaCliente, useTriDesMessages, type ProposeParLaPasse } from '../../../../shared/tri-des-messages';
import { motifDit } from '../../../../shared/tri-des-messages-pur';

/* ══ LES CONVERSATIONS, VUE DE L'ASSISTANT MAISON ══════════════════════════
   27 octobre 2026, lot 3 : spécification `docs/spec-assistant-maison.md`
   §5.2. UNE BOÎTE PAR PERSONNE : ses fils WhatsApp, le chat du site, ses
   demandes et vocaux, ses appels, ses soucis d'Entre deux séances, et tout
   ce que la Maison lui a écrit, fusionnés dans l'ordre du temps par
   `shared/boite-unique-pur`.

   27 OCTOBRE 2026, LE SOIR : « je ne comprends pas bien la partie
   conversation. Peux-tu me faire une UI plus facile, une navigation plus
   fluide ? » (Yéman, sur une capture). Maquette HCVUUyvAxSxNFqQ82FXYpp,
   validée (« ok perfect build ») :
   · LA LISTE À GAUCHE, LA CONVERSATION À DROITE, sa fiche en colonne
     repliable ; au téléphone (900 px et moins) la liste OU la conversation
     en plein écran, jamais les deux (banc du téléphone) ;
   · « À TRAITER » ET « TOUTES », une recherche ; « À traiter » rangé en
     trois groupes (maintenant, plus anciennes, un merci sans question :
     `a-traiter-pur`) ; le site et les soucis en deux puces discrètes ;
   · UNE PASTILLE PAR LIGNE, en mots simples (`pastilleDe`), à la place de
     cinq puces de canal et de « fenêtre fermée » ;
   · « CE QU'IL FAUT FAIRE » en tête de la conversation : une phrase et ses
     gestes, le principal d'abord (`ceQuIlFautFaire`) ;
   · « RIEN À RÉPONDRE » range une boîte jusqu'à son prochain message
     (`mnd_rien_a_repondre`), et « Suivante » ou les flèches passent à la
     suivante ;
   · une seule ligne chiffrée à la place des trois tuiles ; les réponses
     toutes prêtes, ce qui part et ce qu'elles disent sous « Outils ».

   UN SEUL JUGE « attend une réponse » (celui des fils, `Fil.attendUneReponse`,
   composé avec ceux des autres pièces par le pur), UNE SEULE SONNERIE (celle
   des Conversations, montée ici une fois). Le composeur est celui des
   Conversations d'avant (`ComposeurWhatsApp`) : la retenue de huit secondes,
   la fenêtre de 24 heures, les modèles hors fenêtre, les dix gestes. Le
   cerveau de l'Assistant arrive en props : « Sa fiche » lit `FicheDeGerard`,
   jamais un second calcul. */

const SOURCE_DITE: Record<SourceDeBulle, string> = {
  whatsapp: 'WhatsApp', chat: 'chat du site', demande: 'site', vocal: 'vocal du site', appel: 'appel', couronne: 'Ma Couronne', comptoir: 'comptoir',
};
const AUTEUR_DIT: Record<AuteurDeBulle, string> = {
  elle: 'elle', equipe: 'l’équipe', assistant: 'l’Assistant', automate: 'l’automate', modele: 'modèle parti seul', chat: 'réponse automatique', systeme: '',
};
/* Les bulles reprennent l'habit du fil des Conversations (`clients.css`) : à
   elle, à nous, le modèle payé, l'automate ; ce qui est parti seul se grise. */
const CLASSE_DE_L_AUTEUR: Record<AuteurDeBulle, string> = {
  elle: 'trc-b--elle', equipe: 'trc-b--nous', assistant: 'trc-b--modele', automate: 'trc-b--automate', modele: 'trc-b--modele', chat: 'trc-b--automate', systeme: '',
};
const JOURS_DE_LEURS_MOTS = 60;
const chiffresSeuls = (t: string | undefined): string => (t ?? '').replace(/\D/g, '');
/** `tel:` depuis un numéro de fiche (+229 01 51 …) ou un numéro réduit (22901…). */
const lienTel = (brut: string | undefined): string | null => { const d = chiffresSeuls(brut); return d ? `tel:+${d}` : null; };
const court = (t: string, n = 70): string => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
/** Un numéro de téléphone dans ses mots ne se montre pas (« Ce qu'elles disent », sans nom ni numéro). */
const sansNumero = (t: string): string => t.replace(/\+?\d[\d\s.-]{6,}\d/g, '…');
/** La recherche : sans accents ni majuscules. */
const plat = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Le numéro dit lisiblement : +229 01 97 00 00 11. */
const numeroDit = (n: string | undefined): string => {
  const d = chiffresSeuls(n);
  if (!d) return '';
  if (d.startsWith('229') && d.length === 13) return `+229 ${d.slice(3).replace(/(\d{2})(?=\d)/g, '$1 ')}`;
  return `+${d}`;
};

/** Le téléphone : jusqu'à 900 px la liste OU la conversation, jamais les
    deux. Un téléphone couché fait 844 px, une tablette debout 820, et c'est
    dans cette bande que la liste et le fil s'empilaient le 13 octobre 2026
    (banc du téléphone). */
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

/** Les six lignes chiffrées de « Sa fiche ». */
type Retenu = { cle: string; valeur: string; alarme?: boolean };
type Outil = 'reponses' | 'envois' | 'mots' | 'scenarios';

export default function LesConversations({ cerveau, moi }: PropsDUneVue) {
  /* Les crochets, tous, AVANT le premier retour (banc verifie-l-ordre-des-crochets). */
  const { branch } = useBranch();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const estDirection = moi?.role === 'souverain' || moi?.role === 'gerant';
  const clients = useBranchClients();
  const appts = useBranchAppointments();
  const [messages] = useMessagesWa();
  const [prives] = useFilsPrives();
  const [archives, setArchives] = useFilsArchives();
  const [lignesDeLAutomate] = useFilsAutomate();
  const [cfg] = useAutoConfig();
  const [reglages] = useSettings();
  const { discussions } = useDiscussions();
  const [demandes] = useDemandes();
  const [appelsWa] = useAppelsWa();
  const [appels] = useAppels();
  const signalementsTous = useSignalements();
  const [envois] = useEnvois();
  const [codes] = useCodesPromo();
  const [riens] = useRiensARepondre();
  const compteDesReponses = useCompteDesReponses();
  const etroit = useEtroit();
  /* L'horloge bat : « depuis 26 h » et la fenêtre de 24 h se relisent chaque minute. */
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const [filtre, setFiltre] = useState<FiltreDeLaBoite>(() => {
    const f = params.get('filtre');
    return f === 'tout' || f === 'site' || f === 'entre-deux' || f === 'propositions' || f === 'bloques' ? f : 'attend';
  });
  const [cherche, setCherche] = useState('');
  /* UNE CONVERSATION OUVERTE À LA FOIS : la clé de la boîte. */
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [texte, setTexte] = useState('');
  const [cite, setCite] = useState<MessageWa | null>(null);
  const [souciOuvert, setSouciOuvert] = useState<string | null>(null);
  const [rattacher, setRattacher] = useState<Boite | null>(null);
  const [rdvPour, setRdvPour] = useState<RdvInitial | null>(null);
  const [brouillonDuChat, setBrouillonDuChat] = useState('');
  const [chatEnVol, setChatEnVol] = useState(false);
  /* Sa fiche s'ouvre d'elle-même sur un grand écran ; plus étroit, elle passerait par-dessus la conversation. */
  const [ficheOuverte, setFicheOuverte] = useState(() => typeof window === 'undefined' || window.innerWidth > 1280);
  const [menuOutils, setMenuOutils] = useState(false);
  const [outil, setOutil] = useState<Outil | null>(() => (params.get('envois') === '1' ? 'envois' : params.get('reponses') === '1' ? 'reponses' : params.get('scenarios') === '1' ? 'scenarios' : null));
  /* LA BANQUE DE SCÉNARIOS (30 octobre 2026) : « Mauvaise réponse » y range
     le message d'elle et l'ouvre ; le compteur dit ce qui attend. */
  const [casAOuvrir, setCasAOuvrir] = useState<{ id: string; n: number } | null>(null);
  const [banqueBrute] = useBanque();
  const banqueAValider = useMemo(() => banqueLue(banqueBrute).cas.filter((c) => c.etat === 'propose').length, [banqueBrute]);
  const poignee = useRef<PoigneeDuComposeur | null>(null);
  /* La conversation ouverte : au téléphone, elle couvre l'écran et lit la hauteur que le clavier laisse. */
  const convOuverte = useRef<HTMLElement | null>(null);
  /* Les bulles de la conversation ouverte : on les ouvre sur le dernier mot. */
  const filOuvert = useRef<HTMLDivElement | null>(null);
  const listeRef = useRef<HTMLDivElement | null>(null);
  const boiteRef = useRef<HTMLElement | null>(null);
  const outilRef = useRef<HTMLDivElement | null>(null);
  /* Au doigt, les gestes d'une bulle paraissent sur la bulle touchée seulement (`est-touchee`, clients.css). */
  const [bulleTouchee, setBulleTouchee] = useState<string | null>(null);

  const signalements = useMemo(() => signalementsTous.filter((s) => !s.branchId || s.branchId === branch.id), [signalementsTous, branch.id]);
  /* LE JUGE WHATSAPP EST CELUI DES CONVERSATIONS : `filsDeLaMaison` rend
     `Fil.attendUneReponse` ; on le lit, on ne le refait pas. L'automate
     entre dans le juge (9 octobre 2026) par `automatesDesFils`. */
  const tetes = useMemo(() => tetesDeLaMaison({ clientes: clients }), [clients]);
  const automates = useMemo(() => automatesDesFils(lignesDeLAutomate, reglageDeLAutomate(cfg.automateWa).pauseHeures), [lignesDeLAutomate, cfg.automateWa]);
  const tous = useMemo(() => filsDeLaMaison(messages, tetes, prives, tick, branch.id, automates), [messages, tetes, prives, tick, branch.id, automates]);
  /* LE NUMÉRO PEUT VENIR D'AILLEURS (`?n=`, dix-neuf appelants) : une cliente
     qui n'a jamais écrit n'a pas de fil ; on en fabrique un vide qui dit la
     vérité (`filNeuf`), plutôt qu'un écran muet. Les fils privés restent
     repliés (« tout le personnel, sauf ce que je marque privé », 11 sept.),
     sauf celui qu'un lien désigne. */
  const nDemande = numeroWa(params.get('n') ?? '');
  /* Un fil d'équipe ou de prestataire (le numéro de la direction, 31 octobre
     2026) reste à la direction seule : un lien qui le désigne l'ouvre pour
     elle, comme l'écran d'avant, au lieu de la fiche qui partage son numéro. */
  const fils = useMemo(() => {
    const vus = tous.filter((f) => (f.tiroir === 'clientes' || (estDirection && f.numero === nDemande)) && !estArchive(f, archives) && (!f.prive || f.numero === nDemande));
    if (nDemande && !tous.some((f) => f.numero === nDemande)) {
      const neuf = filNeuf(nDemande, teteDuNumero(nDemande, tetes));
      if (neuf && !estReserve(neuf.tiroir)) vus.push(neuf);
    }
    return vus;
  }, [tous, archives, nDemande, tetes, estDirection]);
  /* LE TRI DES DÉMARCHEURS (29 octobre 2026) : le registre du serveur, et la passe des dernières 24 heures. */
  const { tri, relis: relisLeTri } = useTriDesMessages();
  const [passe, setPasse] = useState<{ enCours: boolean; lus?: number; proposes: ProposeParLaPasse[]; coches: string[]; erreur?: string } | null>(null);
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  const envoisLus = envois as unknown as EnvoiDeLaBoite[];
  const entreeDesBoites = useMemo(() => ({
    fils, discussions, demandes, appelsWa, appels, signalements, envois: envoisLus, clientes: clients, maintenant: tick, branchId: branch.id, tiroirs: [...new Set(['clientes' as const, ...fils.map((f) => f.tiroir)])],
    riensARepondre: riens, tri,
  }), [fils, discussions, demandes, appelsWa, appels, signalements, envoisLus, clients, tick, branch.id, riens, tri]);
  const boitesBrutes = useMemo(() => boitesDeLaMaison(entreeDesBoites), [entreeDesBoites]);

  /* LA BOÎTE QU'UN LIEN DÉSIGNE : `?n=` (un numéro), `?c=` (une fiche), `?d=` (une discussion). */
  const cDemande = params.get('c');
  const dDemande = params.get('d');
  const cleDemandee = useMemo(() => {
    if (cDemande) return boitesBrutes.find((b) => b.clientId === cDemande)?.cle ?? null;
    if (nDemande) return boiteDuNumero(boitesBrutes, nDemande);
    if (dDemande) return boitesBrutes.find((b) => b.discussions.some((d) => d.id === dDemande))?.cle ?? null;
    return null;
  }, [boitesBrutes, cDemande, nDemande, dDemande]);
  /* SUR UN GRAND ÉCRAN, LA BOÎTE VIENT À L'ÉCRAN quand on ouvre une
     conversation (un clic, une flèche, un lien) : elle a la hauteur de
     l'écran, et « Envoyer » ne doit jamais rester sous son bord. */
  const ameneLaBoite = () => window.requestAnimationFrame(() => {
    const el = boiteRef.current;
    if (!el || window.matchMedia?.('(max-width: 900px)').matches) return;
    const r = el.getBoundingClientRect();
    /* D'un coup, pas en douceur : un défilement doux s'interrompt quand le fil, à côté, descend sur son dernier mot. */
    if (r.top < 0 || r.bottom > window.innerHeight + 4) el.scrollIntoView({ block: 'start' });
  });
  useEffect(() => {
    if (!cleDemandee) return;
    setOuverte(cleDemandee);
    ameneLaBoite();
    /* Le filtre s'ouvre si la boîte désignée n'y paraît pas : un lien ne doit jamais mener à une liste qui la cache. */
    const b = boitesBrutes.find((x) => x.cle === cleDemandee);
    if (b && !b.filtres.includes(filtre)) setFiltre('tout');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleDemandee]);
  /* LE MESSAGE PRÉ-ÉCRIT QUI ARRIVE D'AILLEURS (`?t=`) se pose dans la zone, à
     relire, et s'efface de l'adresse aussitôt : un rafraîchissement ne doit
     pas le reposer par-dessus ce qu'on écrit. */
  const texteVenu = params.get('t') ?? '';
  useEffect(() => {
    if (!texteVenu) return;
    setTexte(texteVenu);
    const suivants = new URLSearchParams(params);
    suivants.delete('t');
    setParams(suivants, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texteVenu]);

  /* LES MESSAGES D'UNE DISCUSSION SE CHARGENT À L'OUVERTURE (limite 500) : la
     boîte ouverte, et elle seule, les reçoit dans son fil. */
  const ouverteBrute = boitesBrutes.find((b) => b.cle === ouverte);
  const messagesDuChat = useMessagesDe(ouverteBrute?.discussionId ?? null);
  const boites = useMemo(() => {
    const id = ouverteBrute?.discussionId;
    if (!id || messagesDuChat.length === 0) return boitesBrutes;
    return boitesDeLaMaison({ ...entreeDesBoites, messagesDesDiscussions: { [id]: messagesDuChat } });
  }, [boitesBrutes, entreeDesBoites, ouverteBrute?.discussionId, messagesDuChat]);
  const comptes = useMemo(() => comptesDesFiltres(boites), [boites]);
  const dansToutes = filtre === 'tout' || filtre === 'site' || filtre === 'entre-deux';
  const visibles = useMemo(() => boitesDuFiltre(boites, filtre), [boites, filtre]);

  /* LA LISTE DANS SON ORDRE : la recherche d'abord (dans toutes les boîtes),
     sinon « À traiter » par groupes (maintenant, plus anciennes, un merci),
     sinon le filtre choisi. C'est cet ordre que « Suivante » et les flèches
     parcourent. */
  const recherche = plat(cherche.trim());
  const groupes = useMemo(() => GROUPES_A_TRAITER.map((g) => ({ g, boites: boites.filter((b) => groupeDe(b, tick) === g) })), [boites, tick]);
  const ordre = useMemo(() => {
    if (recherche) {
      const chiffres = chiffresSeuls(recherche);
      return boites.filter((b) => plat(`${b.nom} ${b.bulles.slice(-30).map((x) => x.texte).join(' ')}`).includes(recherche)
        || (chiffres.length >= 4 && chiffresSeuls(b.numero).includes(chiffres)));
    }
    if (filtre === 'attend') return groupes.flatMap((x) => x.boites);
    return visibles;
  }, [recherche, boites, filtre, groupes, visibles]);
  const boite = boites.find((b) => b.cle === ouverte) ?? null;
  /* Au téléphone, une conversation ouverte prend tout l'écran : la liste s'efface derrière elle. */
  const ouvertEtroit = etroit && !!boite;

  /* SUR UN GRAND ÉCRAN, LA PREMIÈRE CONVERSATION S'OUVRE SEULE : la colonne
     de droite n'est jamais vide quand il y a quelqu'un à qui répondre. */
  useEffect(() => {
    if (etroit || cleDemandee) return;
    if (ouverte && boites.some((b) => b.cle === ouverte)) return;
    const premiere = ordre[0];
    if (premiere) setOuverte(premiere.cle);
  }, [etroit, cleDemandee, ouverte, boites, ordre]);

  /* LA LIGNE CHIFFRÉE : qui attend, par groupe ; répondues sous 1 h
     aujourd'hui (le jour de Cotonou, une main humaine seulement) ; réponses
     gratuites restantes ce mois. */
  const attendent = useMemo(() => {
    const qui = boites.filter((b) => b.attendUneReponse);
    return { total: qui.length, sante: qui.filter((b) => b.sante).length };
  }, [boites]);
  const parGroupe = useMemo(() => Object.fromEntries(groupes.map((x) => [x.g, x.boites.length])) as Record<string, number>, [groupes]);
  const nowIso = new Date(tick).toISOString();
  const jourDeCotonou = jourACotonou(nowIso);
  const repondues = useMemo(() => repondusSousUneHeure(messages, jourDeCotonou, tick), [messages, jourDeCotonou, tick]);
  const gratuites = useMemo(() => reponsesGratuitesRestantes(messages, jourDeCotonou.slice(0, 7), branch.id), [messages, jourDeCotonou, branch.id]);

  /* SA FICHE lit la fiche de l'Assistant (une seule lecture par écran). */
  const ficheDe = useMemo(() => new Map(cerveau.fiches.map((f) => [f.id, f])), [cerveau.fiches]);
  const dernierHorsService = useMemo(
    () => derniersMessagesHorsService(envoisLus, messages.filter((m) => m.sens === 'sortant' && m.clientId).map((m) => ({ sens: m.sens, clientId: m.clientId, quand: m.quand }))),
    [envoisLus, messages],
  );
  /* CE QU'ELLES DISENT : leurs mots des 60 derniers jours, sans nom ni numéro, cinq phrases. */
  const leursMots = useMemo(() => {
    const depuis = tick - JOURS_DE_LEURS_MOTS * 86_400_000;
    return messages
      .filter((m) => m.sens === 'entrant' && m.canal !== 'site' && !estReserve(m.tiroir) && Date.parse(m.quand) >= depuis)
      .map((m) => ({ quand: m.quand, texte: sansNumero(m.texte.replace(/\s+/g, ' ').trim()) }))
      .filter((m) => m.texte.length >= 12 && m.texte.length <= 160)
      .sort((a, b) => b.quand.localeCompare(a.quand))
      .slice(0, 5);
  }, [messages, tick]);

  /* ══ LA SONNETTE, UNE FOIS ═══════════════════════════════════════════
     Les quatre pièges sont jugés dans `shared/conversations.ts`
     (`messagesQuiSonnent`) ; ici on sonne UNE fois par rafale, jamais la
     nuit, jamais pour la boîte ouverte ni pour un fil que l'automate tient. */
  const numeroOuvert = boite?.numero;
  const vus = useRef<{ ids: string[]; premiere: boolean }>({ ids: [], premiere: true });
  useEffect(() => {
    const sonnants = messagesQuiSonnent({
      avant: vus.current.ids.map((id) => ({ id })),
      apres: messages,
      filOuvert: numeroOuvert,
      premiereLecture: vus.current.premiere,
      tenus: numerosTenus(automates, Date.now()),
    });
    vus.current = { ids: messages.map((m) => m.id), premiere: false };
    if (sonnants.length === 0 || reglages.sonnette === false) return;
    const [ouvre, ferme] = heuresDuJour();
    if (cestLaNuit(new Date(), ouvre, ferme)) return;
    sonne();
    const premier = sonnants[0];
    const qui = teteDuNumero(premier.numero, tetes)?.name ?? premier.nomProfil ?? `+${premier.numero}`;
    toast(sonnants.length === 1 ? `${qui} vous écrit.` : `${sonnants.length} messages viennent d’arriver.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);
  /* LA MAIN QUI PASSE SONNE AUSSI (`sonnentApresLAutomate`). */
  const vusDeLAutomate = useRef<VueDeLaSonnette | null>(null);
  useEffect(() => {
    const { numeros, vue } = sonnentApresLAutomate({ avant: vusDeLAutomate.current, fils: tous, filOuvert: numeroOuvert });
    vusDeLAutomate.current = vue;
    if (numeros.length === 0 || reglages.sonnette === false) return;
    const [ouvre, ferme] = heuresDuJour();
    if (cestLaNuit(new Date(), ouvre, ferme)) return;
    sonne();
    const qui = teteDuNumero(numeros[0], tetes)?.name ?? `+${numeros[0]}`;
    toast(numeros.length === 1 ? `${qui} attend une personne de la Maison.` : `${numeros.length} conversations attendent une personne de la Maison.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tous]);
  /* CE QUI SONNE AUSSI (27 octobre 2026) : une discussion neuve du site, une
     demande neuve, un souci Santé ouvert. Mêmes règles : pas au premier
     chargement, pas la boîte ouverte, une rafale = une sonnerie, pas la nuit. */
  const vusAilleurs = useRef<{ cles: Set<string>; premiere: boolean }>({ cles: new Set(), premiere: true });
  useEffect(() => {
    const cles = new Map<string, string>();
    for (const d of discussions) if (d.etat === 'ouverte' && d.dernier_de === 'visiteuse') cles.set(`chat-${d.id}-${d.derniere_le}`, `d:${d.id}`);
    for (const d of demandes) if (d.statut === 'nouvelle' && !d.archiveeLe) cles.set(`demande-${d.id}`, `q:${d.id}`);
    for (const s of signalements) if (s.etat === 'ouvert' && !s.bien && (s.soucis ?? []).length > 0 && niveauDe(s.soucis) === 'sante') cles.set(`souci-${s.id}`, `c:${s.clientId}`);
    const neufs = [...cles.entries()].filter(([k, boiteDe]) => !vusAilleurs.current.cles.has(k) && !(boite && (boite.cle === boiteDe || boite.discussions.some((d) => `d:${d.id}` === boiteDe) || boite.demandes.some((d) => `q:${d.id}` === boiteDe))));
    const premiere = vusAilleurs.current.premiere;
    vusAilleurs.current = { cles: new Set(cles.keys()), premiere: false };
    if (premiere || neufs.length === 0 || reglages.sonnette === false) return;
    const [ouvre, ferme] = heuresDuJour();
    if (cestLaNuit(new Date(), ouvre, ferme)) return;
    sonne();
    const sante = neufs.filter(([k]) => k.startsWith('souci-')).length;
    toast(sante ? `${sante} souci${sante > 1 ? 's' : ''} Santé : une personne de la Maison rappelle sous 24 h.` : neufs.length === 1 ? 'Quelqu’un écrit depuis le site.' : `${neufs.length} messages viennent du site.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discussions, demandes, signalements]);
  /* Le navigateur refuse tout son avant qu'on ait touché la page : on arme au premier geste. */
  useEffect(() => {
    const arme = () => armeLaSonnette();
    window.addEventListener('pointerdown', arme);
    window.addEventListener('keydown', arme);
    return () => { window.removeEventListener('pointerdown', arme); window.removeEventListener('keydown', arme); };
  }, []);
  /* Une conversation qui change referme le souci, le brouillon du chat, la citation. */
  useEffect(() => { setSouciOuvert(null); setBrouillonDuChat(''); setCite(null); setBulleTouchee(null); }, [ouverte]);
  /* AU TÉLÉPHONE, LA CONVERSATION OUVERTE COUVRE L'ÉCRAN (27 octobre 2026,
     banc du téléphone) : `trc-am__plein` (assistant-maison.css). Elle prend
     la hauteur que le CLAVIER laisse : `visualViewport` la donne, la feuille
     la lit (`--vv-h`, `--vv-top`). La promesse du 21 septembre, du 28 et du
     2 octobre : le fil et sa saisie tiennent dans l'écran, « Envoyer » aussi. */
  useEffect(() => {
    const el = convOuverte.current;
    if (!ouvertEtroit || !el) return undefined;
    const vv = window.visualViewport;
    const pose = () => {
      if (!vv) return;
      el.style.setProperty('--vv-h', `${Math.round(vv.height)}px`);
      el.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
    };
    /* Le clavier qui s'ouvre ne doit pas cacher le dernier message. */
    const auClavier = () => { pose(); const f = filOuvert.current; if (f) f.scrollTop = f.scrollHeight; };
    pose();
    vv?.addEventListener('resize', auClavier);
    vv?.addEventListener('scroll', pose);
    return () => { vv?.removeEventListener('resize', auClavier); vv?.removeEventListener('scroll', pose); };
  }, [ouvertEtroit, boite?.cle]);
  /* LE FIL S'OUVRE SUR SON DERNIER MOT, comme WhatsApp : le dernier message
     est en bas, et c'est lui qu'on lit d'abord ; une bulle qui arrive y descend. */
  const nbBulles = boite?.bulles.length ?? 0;
  useEffect(() => {
    const f = filOuvert.current;
    if (f) f.scrollTop = f.scrollHeight;
  }, [boite?.cle, nbBulles]);

  /* ── Les gestes ── */
  const ouvre = (b: Boite | null) => {
    const suivants = new URLSearchParams(params);
    for (const k of ['n', 'c', 'd', 't']) suivants.delete(k);
    if (b) {
      if (b.numero) suivants.set('n', b.numero); else if (b.clientId) suivants.set('c', b.clientId); else if (b.discussionId) suivants.set('d', b.discussionId);
    }
    setOuverte(b?.cle ?? null);
    setTexte('');
    setParams(suivants, { replace: true });
    if (b) ameneLaBoite();
  };
  const choisitLeFiltre = (f: FiltreDeLaBoite) => {
    setFiltre(f);
    const suivants = new URLSearchParams(params);
    if (f === 'attend') suivants.delete('filtre'); else suivants.set('filtre', f);
    setParams(suivants, { replace: true });
  };
  /** La boîte qui suit celle-ci dans l'ordre de la liste (on revient au début après la dernière). */
  const apres = (cle: string | undefined, liste: readonly Boite[] = ordre): Boite | null => {
    const autres = liste.filter((b) => b.cle !== cle);
    if (autres.length === 0) return null;
    const i = liste.findIndex((b) => b.cle === cle);
    return i < 0 ? autres[0] : (liste.slice(i + 1).find((b) => b.cle !== cle) ?? autres[0]);
  };
  const suivante = () => {
    const b = apres(boite?.cle);
    if (b) { ouvre(b); return; }
    toast('C’est la seule de la liste.');
  };
  /** La zone d'écriture de la conversation ouverte prend le doigt (ou les modèles, fenêtre fermée). */
  const prendLaSaisie = () => {
    window.setTimeout(() => {
      const conv = convOuverte.current;
      const zone = conv?.querySelector<HTMLElement>('.trc-convs__fil textarea, .trc-bx__chat textarea') ?? conv?.querySelector<HTMLElement>('.trc-saisie');
      zone?.scrollIntoView({ block: 'nearest' });
      if (zone instanceof HTMLTextAreaElement) zone.focus();
    }, 60);
  };
  const clesDe = (b: Boite): string[] => [b.cle, ...b.fils.map((f) => cleDuFilRange(f.numero))];
  /* RIEN À RÉPONDRE : la boîte quitte « À traiter » jusqu'à son prochain
     message, et la suivante s'ouvre. */
  const range = (b: Boite) => {
    const prochaine = apres(b.cle);
    rangeLaBoite(clesDe(b), moi?.name?.trim() || undefined, new Date().toISOString());
    toast(`${b.nom} : rien à répondre. Elle revient seule à son prochain message.`);
    if (filtre === 'attend' && !recherche) { if (prochaine) ouvre(prochaine); else ouvre(null); }
  };
  const rangeLesMercis = (liste: readonly Boite[]) => {
    const quand = new Date().toISOString();
    rangeLaBoite(liste.flatMap(clesDe), moi?.name?.trim() || undefined, quand);
    toast(`${liste.length} merci${liste.length > 1 ? 's' : ''} rangé${liste.length > 1 ? 's' : ''} : rien à répondre.`);
  };
  const poseLaDemande = (d: Demande, patch: Partial<Demande>) => demandesStore.set((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...patch } : x)));
  const repondSurLeChat = async (b: Boite) => {
    if (!b.discussionId || !moi || chatEnVol || !brouillonDuChat.trim()) return;
    setChatEnVol(true);
    const motif = await repondre(b.discussionId, brouillonDuChat, moi.user_id);
    setChatEnVol(false);
    if (motif) { toast(motif); return; }
    setBrouillonDuChat('');
  };
  const basculeLArchive = (f: Fil) => {
    if (!estDirection || f.messages.length === 0) return;
    if (estArchive(f, archives)) { setArchives((prev) => desarchiveLeFil(prev, f.numero)); toast('Conversation rendue à la liste.'); return; }
    setArchives((prev) => archiveLeFil(prev, f.numero, moi?.name?.trim() || undefined, new Date().toISOString()));
    toast('Conversation archivée. Rien n’est effacé, et elle revient seule au prochain message.');
  };
  const proposeDAvancer = (b: Boite) => {
    const f = b.clientId ? ficheDe.get(b.clientId) : undefined;
    /* Sans fiche de l'Assistant, le prénom de la fiche cliente d'abord (comme `appelDe`) ; « Madame, Monsieur » en dernier recours, jamais une civilité supposée. */
    const appel = f?.appel ?? ((b.clientId ? prenomSeul(b.nom) : '') || 'Madame, Monsieur');
    const mot = `Bonjour ${appel}, ici la Maison MND. Pour vos locks, nous vous proposons d’avancer votre rendez-vous. Choisissez l’heure qui vous va dans Ma Couronne, ou répondez-nous ici.`;
    if (b.fil?.fenetre.ouverte) { setTexte(mot); toast('Message posé dans la zone : relisez-le avant de l’envoyer.'); return; }
    const lien = lienWaMe(b.numero ?? cerveau.clientDe(b.clientId ?? '')?.phone, mot);
    if (lien) window.open(lien, '_blank', 'noopener'); else toast('Pas de numéro : appelez-la.');
  };
  const poseLeRdv = (b: Boite) => {
    if (b.fil && poignee.current) { poignee.current.poseUnRendezVous(false); return; }
    const d = b.demandes.find((x) => dansLeFiltre(x, 'a-traiter'));
    setRdvPour({ clientId: b.clientId, ...(d?.serviceIds?.length ? { serviceIds: [...d.serviceIds] } : {}), ...(d?.date ? { date: d.date } : {}), ...(d?.time ? { time: d.time } : {}) });
  };
  const ouvreLOutil = (o: Outil) => {
    setOutil(o);
    setMenuOutils(false);
    window.setTimeout(() => outilRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  /** « MAUVAISE RÉPONSE » sur une bulle de l'automate ou de l'assistant : le
      dernier message d'elle avant cette réponse entre dans la banque, et la
      banque s'ouvre sur lui pour dire ce qu'il fallait répondre. */
  const mauvaiseReponse = (m: MessageWa) => {
    const limite = Date.parse(m.quand);
    const n = numeroWa(m.numero);
    const elle = messages
      .filter((x) => x.sens === 'entrant' && numeroWa(x.numero) === n && Date.parse(x.quand) <= limite && (x.texte ?? '').trim())
      .sort((x, y) => y.quand.localeCompare(x.quand))[0];
    const texte = texteDuCas(elle?.texte ?? '');
    if (!elle || !texte) { toast('Aucun message écrit d’elle avant cette réponse.'); return; }
    banqueStore.set((bq) => ajouteDesCas(banqueLue(bq), [{ texte, quand: elle.quand, source: 'mauvaise-reponse' }], new Date().toISOString()).banque);
    setCasAOuvrir((c) => ({ id: idDuCas(texte), n: (c?.n ?? 0) + 1 }));
    ouvreLOutil('scenarios');
    toast('Son message est dans la banque : dites ce qu’il fallait répondre.');
  };
  const ouvreLeFilDe = (numero: string) => {
    const n = numeroWa(numero);
    const b = n ? boites.find((x) => x.numero === n || x.fils.some((f) => f.numero === n)) : undefined;
    if (b) ouvre(b);
    else if (n) { const suivants = new URLSearchParams(params); suivants.set('n', n); setParams(suivants, { replace: true }); }
  };

  /* ── Le clavier : les flèches parcourent la liste, Entrée écrit, Échap revient ── */
  const focusLaLigne = (cle: string) => window.requestAnimationFrame(() => {
    const el = [...(listeRef.current?.querySelectorAll<HTMLButtonElement>('.trc-bx__ligne') ?? [])].find((x) => x.dataset.cle === cle);
    el?.focus();
  });
  const auClavierDansLaListe = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (ordre.length === 0) return;
    e.preventDefault();
    const i = ordre.findIndex((b) => b.cle === boite?.cle);
    const j = e.key === 'ArrowDown' ? Math.min(ordre.length - 1, i + 1) : Math.max(0, i - 1);
    const b = ordre[j];
    if (!b) return;
    ouvre(b);
    focusLaLigne(b.cle);
  };
  const echapDansLaConversation = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (etroit) { ouvre(null); return; }
    if (boite) focusLaLigne(boite.cle);
  };

  /** Les six lignes de « Sa fiche », chiffrées, avec l'année. */
  const retenu = (b: Boite): Retenu[] => {
    const f: FicheDeGerard | undefined = b.clientId ? ficheDe.get(b.clientId) : undefined;
    const aujourdhui = cerveau.ctx.aujourdhui;
    const prochain = (f?.rdvs ?? []).filter((r) => r.date >= aujourdhui && r.status !== 'annulé' && !r.venu).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time))[0];
    const derniere = (f?.rdvs ?? []).filter((r) => r.venu).sort((x, y) => x.date.localeCompare(y.date)).pop();
    const code = b.clientId ? codesVivantsDe(codes, b.clientId, nowIso, branch.id)[0] : undefined;
    const souci = b.soucisOuverts[0];
    const jourHS = b.clientId ? dernierHorsService.get(b.clientId) : undefined;
    const parQuiHS = (() => {
      if (!jourHS || !b.clientId) return '';
      const e = envoisLus.filter((x) => x.clientId === b.clientId && !estUnService(x) && jourACotonou(x.deposeLe ?? x.quand) === jourHS).sort((x, y) => (y.deposeLe ?? y.quand).localeCompare(x.deposeLe ?? x.quand))[0];
      if (e) return `${typeDit(e.type)}${e.parQui ? ` · ${e.parQui}` : ''}`;
      const m = messages.filter((x) => x.sens === 'sortant' && x.clientId === b.clientId && jourACotonou(x.quand) === jourHS).sort((x, y) => y.quand.localeCompare(x.quand))[0];
      return m ? `WhatsApp${m.parQui ? ` · ${m.parQui}` : ''}` : '';
    })();
    return [
      { cle: 'Prochain RDV', valeur: prochain ? `${jourDit(prochain.date)} à ${heureDite(prochain.time)}` : f?.cadence.iso ? `aucun posé · cadence attendue le ${jourDit(f.cadence.iso)}` : 'aucun posé, pas de cadence connue' },
      { cle: 'Dernière venue', valeur: derniere ? jourDit(derniere.date) : 'jamais venue' },
      { cle: 'Reste dû', valeur: enFrancs(f?.resteDu ?? 0), alarme: (f?.resteDu ?? 0) > 0 },
      { cle: 'Remise à son nom', valeur: code ? `${code.code}${code.remisePct ? ` · −${code.remisePct} %` : code.remiseXof ? ` · −${enFrancs(code.remiseXof)}` : ''} · jusqu’au ${jourDit(jourACotonou(code.expireLe))}` : 'aucune en cours' },
      { cle: 'Souci ouvert', valeur: souci ? `${NIVEAUX[niveauDe(souci.soucis)]} · depuis le ${jourDit(jourACotonou(souci.quand))}${b.enRetard ? ' · en retard' : ''}` : 'aucun', alarme: !!souci },
      { cle: 'Dernier message hors service', valeur: jourHS ? `${jourDit(jourHS)}${parQuiHS ? ` · ${parQuiHS}` : ''}` : 'aucun' },
    ];
  };
  const prochainRdvDe = (b: Boite): string | undefined => {
    const f = b.clientId ? ficheDe.get(b.clientId) : undefined;
    const r = (f?.rdvs ?? []).filter((x) => x.date >= cerveau.ctx.aujourdhui && x.status !== 'annulé' && !x.venu).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time))[0];
    return r ? `${jourDit(r.date)} à ${heureDite(r.time)}` : undefined;
  };

  /** UNE LIGNE DE LA LISTE : l'avatar, le nom, depuis quand, son dernier mot et UNE pastille. */
  const ligneDe = (b: Boite) => {
    const dernier = b.derniereDElle ?? b.derniere;
    const mot = dernier ? (dernier.texte.trim() || (dernier.source === 'chat' ? 'discussion du site' : SOURCE_DITE[dernier.source])) : 'rien encore';
    const p = pastilleDe(b);
    const courante = boite?.cle === b.cle;
    const ton = b.sante || p.ton === 'terre' ? 'terre' : dernier?.source === 'whatsapp' ? 'cuivre' : 'indigo';
    return (
      <li key={b.cle}>
        <button
          type="button" data-cle={b.cle}
          className={`trc-bx__ligne${courante ? ' est-courante' : ''}`}
          aria-current={courante ? 'true' : undefined}
          onClick={() => ouvre(b)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ouvre(b); prendLaSaisie(); } }}
        >
          <span className={`trc-am__avatar trc-am__avatar--${ton}`} aria-hidden="true">{b.initiales}</span>
          <span className="trc-bx__qui">
            <span className="trc-bx__haut">
              <b>{b.nom}</b>
              {b.depuisMs !== undefined && <span className="trc-bx__depuis">{depuisDit(b.depuisMs)}</span>}
            </span>
            <span className="trc-bx__mot">{dernier ? `${SOURCE_DITE[dernier.source]} : ` : ''}{court(mot)}</span>
            <span className={`trc-bx__pastille trc-bx__pastille--${p.ton}`}>{p.dit}</span>
          </span>
        </button>
      </li>
    );
  };

  /* ── Les gestes du tri des démarcheurs ── */
  const bloqueLaBoite = async (b: Boite) => {
    if (!b.numero) return;
    setAConfirmer(null);
    const r = await bloqueLesNumeros([b.numero]);
    if (!r.ok) { toast(r.erreur); return; }
    relisLeTri();
    toast(r.data.bloques > 0 ? 'Numéro bloqué : il ne peut plus écrire à la Maison.' : 'Pas bloqué : ce numéro a une fiche ou a déjà échangé avec la Maison.');
  };
  const rendLaBoite = async (b: Boite) => {
    if (!b.numero || !b.tri) return;
    const r = b.tri.etat === 'bloque' ? await debloqueLeNumero(b.numero) : await rendsLaCliente(b.numero);
    if (!r.ok) { toast(r.erreur); return; }
    relisLeTri();
    toast(b.tri.etat === 'bloque'
      ? (r.data.meta ? 'Débloqué : le fil revient dans « À traiter », et ce numéro ne sera plus jugé.' : 'Rendu à « À traiter », mais WhatsApp n’a pas confirmé le déblocage.')
      : 'Rendu à « À traiter » : ce numéro ne sera plus jugé.');
  };
  const lanceLaPasse = async () => {
    setPasse({ enCours: true, proposes: [], coches: [] });
    const r = await relisLesDernieresHeures();
    if (!r.ok) { setPasse({ enCours: false, proposes: [], coches: [], erreur: r.erreur }); return; }
    setPasse({ enCours: false, lus: r.data.lus, proposes: r.data.proposes, coches: r.data.proposes.filter((x) => x.verdict === 'demarchage').map((x) => x.numero) });
  };
  const bloqueLesCoches = async () => {
    if (!passe || passe.coches.length === 0) return;
    const r = await bloqueLesNumeros(passe.coches);
    if (!r.ok) { toast(r.erreur); return; }
    relisLeTri();
    setPasse(null);
    toast(`${r.data.bloques} numéro${r.data.bloques > 1 ? 's' : ''} bloqué${r.data.bloques > 1 ? 's' : ''}${r.data.refuses ? ` ; ${r.data.refuses} gardé${r.data.refuses > 1 ? 's' : ''} (fiche ou échange passé)` : ''}.`);
  };
  /** Ce que le tri dit d'une boîte, en tête de sa fiche. */
  const leTri = (b: Boite) => {
    if (b.tri) {
      const e = b.tri.entree;
      const le = jourDit(e.quand.slice(0, 10));
      return (
        <div className="trc-bx__tri" role="note">
          <b>{b.tri.etat === 'bloque' ? 'Bloqué' : 'Proposition'}</b>
          <span>{motifDit(e, b.tri.etat)} · {b.tri.etat === 'bloque' ? 'bloqué' : 'rangé'} le {le}</span>
          {b.tri.etat === 'bloque' && e.meta === 'echec' && <span className="trc-am__alarme">WhatsApp a refusé le blocage : le fil est rangé, mais le numéro peut encore écrire.</span>}
          {estDirection && (
            <span className="trc-bx__tri-gestes">
              <button type="button" className="trc-ger__btn" onClick={() => void rendLaBoite(b)}>{b.tri.etat === 'bloque' ? 'Débloquer' : 'C’est une cliente'}</button>
              {b.tri.etat === 'proposition' && <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => void bloqueLaBoite(b)}>Bloquer</button>}
            </span>
          )}
        </div>
      );
    }
    if (!estDirection || !b.sansFiche || !b.fil || !b.numero) return null;
    return aConfirmer === b.cle ? (
      <div className="trc-bx__tri" role="note">
        <span>Bloquer ce numéro chez WhatsApp : il ne pourra plus écrire à la Maison. Ses messages restent lisibles dans « Bloqués ».</span>
        <span className="trc-bx__tri-gestes">
          <button type="button" className="trc-ger__btn trc-ger__btn--cuivre" onClick={() => void bloqueLaBoite(b)}>Bloquer</button>
          <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => setAConfirmer(null)}>Annuler</button>
        </span>
      </div>
    ) : null;
  };

  /** SA FICHE ET LES AUTRES GESTES : la colonne de droite sur un grand écran, un repli au téléphone. */
  const ficheEtGestes = (b: Boite) => {
    const demandeATraiter = b.demandes.find((d) => dansLeFiltre(d, 'a-traiter'));
    const discussion = b.discussions[0];
    return (
      <>
        {leTri(b)}
        <h3 className="trc-bx__sous">Sa fiche, en chiffres <span>{b.clientId ? 'lue sur sa fiche' : 'sans fiche'}</span></h3>
        {b.clientId ? (
          <dl className="trc-bx__chiffres">
            {retenu(b).map((l) => (
              <div key={l.cle}><dt>{l.cle}</dt><dd className={l.alarme ? 'trc-am__alarme' : ''}>{l.valeur}</dd></div>
            ))}
          </dl>
        ) : <p className="trc-ger__doux">Aucune fiche ne porte ce numéro : rattachez-le, ou faites-en une cliente, et l’Assistant la lira.</p>}
        <div className="trc-bx__autres">
          {b.clientId
            ? <Link className="trc-ger__btn" to={`/customers?id=${b.clientId}`}>Ouvrir sa fiche</Link>
            : demandeATraiter
              ? <button type="button" className="trc-ger__btn trc-ger__btn--cuivre" onClick={() => convertir(demandeATraiter, navigate)}>En faire une cliente</button>
              : discussion
                ? <button type="button" className="trc-ger__btn trc-ger__btn--cuivre" onClick={() => ouvreLaFiche(discussion, ficheConnueDe(discussion), navigate)}>En faire une cliente</button>
                : b.fil ? <button type="button" className="trc-ger__btn" onClick={() => setRattacher(b)}>Rattacher à une fiche</button> : null}
          {b.soucisOuverts.length > 0 && <button type="button" className="trc-ger__btn" onClick={() => proposeDAvancer(b)}>Proposer d’avancer</button>}
          {b.clientId && <Link className="trc-ger__btn" to="/gerard?vue=offres">Remise à son nom</Link>}
          {b.numero && (
            <a className="trc-ger__btn" href={lienWaMe(b.numero, texte) ?? '#'} target="_blank" rel="noreferrer" onClick={() => poignee.current?.prendsLaMain('whatsapp')}
              title="Continuer dans l’application WhatsApp. Ce qui s’y écrit n’entre pas dans le fil de la Maison.">Continuer dans WhatsApp</a>
          )}
          {demandeATraiter && demandeATraiter.statut === 'nouvelle' && (
            <button type="button" className="trc-ger__btn" onClick={() => { poseLaDemande(demandeATraiter, { statut: 'rappelee', rappeleeLe: new Date().toISOString() }); toast('Demande notée rappelée.'); }}>Demande rappelée</button>
          )}
          {discussion && discussion.etat !== 'close' && (
            <button type="button" className="trc-ger__btn" onClick={() => void changeLEtat(discussion.id, 'close').then((motif) => { if (motif) toast(motif); else toast('Discussion close.'); })}>Clore le chat</button>
          )}
          {b.rangee && (
            <button type="button" className="trc-ger__btn" onClick={() => { deRangeLaBoite(clesDe(b)); toast('Remise dans « À traiter ».'); }}>Remettre à traiter</button>
          )}
          {b.fil && estDirection && b.fil.messages.length > 0 && (
            <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => basculeLArchive(b.fil!)}>{estArchive(b.fil, archives) ? 'Désarchiver' : 'Archiver'}</button>
          )}
          {estDirection && b.sansFiche && b.fil && b.numero && !b.tri && aConfirmer !== b.cle && (
            <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => setAConfirmer(b.cle)}>Bloquer ce numéro</button>
          )}
        </div>
      </>
    );
  };

  /* ── Les gestes de « Ce qu'il faut faire » ── */
  const faisLeGeste = (cle: GesteATraiter, b: Boite) => {
    const demandeATraiter = b.demandes.find((d) => dansLeFiltre(d, 'a-traiter'));
    const discussion = b.discussions[0];
    switch (cle) {
      case 'noter-souci': setSouciOuvert(b.soucisOuverts[0]?.id ?? null); return;
      case 'repondre': case 'modele': case 'repondre-chat': prendLaSaisie(); return;
      case 'rien-a-repondre': range(b); return;
      case 'poser-rdv': poseLeRdv(b); return;
      case 'voir-sa-place': { const d = b.demandes.find((x) => x.apptId); navigate(d?.date ? `/calendrier?jour=${d.date}` : '/calendrier'); return; }
      case 'demande-traitee': if (demandeATraiter) { poseLaDemande(demandeATraiter, { statut: 'traitee' }); toast('Demande traitée : elle quitte « À traiter ».'); } return;
      case 'appel-fait': for (const a of b.appels.filter((x) => !x.fait)) marquerAppelFait(a.id); toast('Appel noté fait.'); return;
      case 'en-faire-une-cliente':
        if (demandeATraiter) convertir(demandeATraiter, navigate);
        else if (discussion) ouvreLaFiche(discussion, ficheConnueDe(discussion), navigate);
        return;
      default: return;
    }
  };

  const conversation = (b: Boite) => {
    const tel = lienTel(b.numero ?? cerveau.clientDe(b.clientId ?? '')?.phone);
    const messagesParId = new Map(b.fils.flatMap((x) => x.messages).map((m) => [m.id, m]));
    const discussion = b.discussions[0];
    const souciAClore = b.soucisOuverts.find((s) => s.id === souciOuvert);
    const faire = ceQuIlFautFaire(b, { maintenant: tick, prochainRdv: prochainRdvDe(b) });
    const p = pastilleDe(b);
    const tonDuFaire = !b.attendUneReponse ? 'calme' : p.ton === 'terre' ? 'terre' : 'cuivre';
    const sous = [b.canaux.map((c) => SOURCE_DITE[c]).join(', '), numeroDit(b.numero), b.sansFiche ? 'sans fiche' : ''].filter(Boolean).join(' · ');
    return (
      <section
        ref={convOuverte}
        className={`trc-bx__conv${ouvertEtroit ? ' trc-am__plein' : ''}`}
        aria-label={`La conversation avec ${b.nom}`}
        onKeyDown={echapDansLaConversation}
      >
        {/* LA TÊTE : au téléphone le retour à la liste ; partout le nom, ses canaux, et les gestes de tous les jours. */}
        <div className={etroit ? 'trc-am__tete trc-bx__tete' : 'trc-bx__tete'}>
          {etroit && <button type="button" className="trc-am__retour" onClick={() => ouvre(null)} aria-label="Revenir à la liste des conversations">←</button>}
          <span className={`trc-am__avatar trc-am__avatar--${b.sante ? 'terre' : b.fil ? 'cuivre' : 'indigo'}`} aria-hidden="true">{b.initiales}</span>
          <span className="trc-bx__nom">
            <b>{b.nom}</b>
            <span>{sous}</span>
          </span>
          <span className="trc-bx__boutons">
            {tel && !etroit && <a className="trc-ger__btn" href={tel}>Appeler</a>}
            {!etroit && <button type="button" className="trc-ger__btn" onClick={() => poseLeRdv(b)}>Poser un RDV</button>}
            {!etroit && <button type="button" className="trc-ger__btn" aria-pressed={ficheOuverte} onClick={() => setFicheOuverte((v) => !v)}>Sa fiche</button>}
            <button type="button" className="trc-ger__btn trc-bx__suivante" onClick={suivante}>Suivante →</button>
          </span>
        </div>
        <div className="trc-am__corps">
          {/* CE QU'IL FAUT FAIRE : une phrase, et ses gestes, le principal d'abord. */}
          <div className={`trc-bx__faire trc-bx__faire--${tonDuFaire}`}>
            <p className="trc-bx__faire-titre">Ce qu’il faut faire</p>
            <p className="trc-bx__faire-phrase">{faire.phrase}</p>
            {faire.gestes.length > 0 && (
              <div className="trc-bx__faire-gestes">
                {faire.gestes.map((g, i) => (g.cle === 'appeler' && tel
                  ? <a key={g.cle} className={`trc-ger__btn${i === 0 ? ' trc-bx__principal' : ''}`} href={tel}>{g.dit}</a>
                  : <button key={g.cle} type="button" className={`trc-ger__btn${i === 0 ? ' trc-bx__principal' : ''}`} onClick={() => faisLeGeste(g.cle, b)}>{g.dit}</button>))}
              </div>
            )}
          </div>

          {/* LE FIL FUSIONNÉ, dans l'ordre du temps : chaque bulle dit sa source et son auteur ; ce qui est parti seul se grise. */}
          <div ref={filOuvert} className="trc-bulles">
            {b.bulles.length === 0 && <span className="trc-jour">Elle ne vous a jamais écrit, et rien n’est parti vers elle</span>}
            {b.bulles.map((x: Bulle, i) => {
              const jourX = jourACotonou(x.quand);
              const nouveauJour = i === 0 || jourACotonou(b.bulles[i - 1].quand) !== jourX;
              const m = x.de.table === 'messages_wa' ? messagesParId.get(x.de.id) : undefined;
              const classe = CLASSE_DE_L_AUTEUR[x.auteur];
              return (
                <div key={x.id} style={{ display: 'contents' }}>
                  {nouveauJour && <span className="trc-jour">{jourDit(jourX)}</span>}
                  {x.auteur === 'systeme' ? (
                    <span className="trc-jour" style={{ letterSpacing: 0, textTransform: 'none', fontSize: 11.5, textAlign: 'center' }}>{x.texte} · {heureACotonou(x.quand)}</span>
                  ) : (
                    <div className={`trc-b ${classe}${bulleTouchee === x.id ? ' est-touchee' : ''}`} style={x.gris ? { opacity: 0.72 } : undefined} onClick={() => setBulleTouchee((t) => (t === x.id ? null : x.id))}>
                      {m?.sens === 'entrant' && m.piece && <PieceDuFil piece={m.piece} />}
                      {m?.sens === 'entrant' && m.piece?.type?.startsWith('image/') && <CaptureLue message={m} clientId={b.clientId} />}
                      {x.texte}
                      {x.bouton && x.texte !== x.bouton ? <span className="trc-b__note">A touché « {x.bouton} »</span> : null}
                      <span className="trc-b__h">
                        {SOURCE_DITE[x.source]}{x.niveau ? ` · ${NIVEAUX[x.niveau]}` : ''} · {AUTEUR_DIT[x.auteur]}{x.parQui && x.auteur !== 'elle' ? ` (${x.parQui})` : ''}
                        {x.modele ? ` · modèle ${x.modele}` : ''} · {heureACotonou(x.quand)}{x.etat ? ` · ${x.etat}` : ''}
                      </span>
                      {m && ((b.fil?.fenetre.ouverte && m.waId) || (m.sens === 'sortant' && (x.auteur === 'automate' || x.auteur === 'assistant'))) && (
                        <span className="trc-b__gestes">
                          {b.fil?.fenetre.ouverte && m.waId && <button type="button" onClick={() => setCite(m)}>Répondre</button>}
                          {m.sens === 'sortant' && (x.auteur === 'automate' || x.auteur === 'assistant') && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); mauvaiseReponse(m); }}>Mauvaise réponse</button>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Au téléphone, sa fiche et les autres gestes se replient sous le fil (le résumé chiffré sur la ligne). */}
          {etroit && (
            <details className="trc-am__repli trc-am__fiche">
              <summary>
                <h4 className="trc-am__sous">Sa fiche et les autres gestes</h4>
                <span className="trc-am__resume">{prochainRdvDe(b) ? `RDV ${prochainRdvDe(b)}` : 'aucun RDV posé'}</span>
              </summary>
              <div className="trc-am__fiche-corps">{ficheEtGestes(b)}</div>
            </details>
          )}

          {/* LE SOUCI OUVERT, à noter et clore (l'écran d'Entre deux séances, tel quel). */}
          {souciAClore && (
            <div className="trc-am__souci">
              <LeSouci s={souciAClore} client={cerveau.clientDe(souciAClore.clientId)} appts={appts} moi={moi?.name ?? ''} onClose={() => setSouciOuvert(null)} />
            </div>
          )}

          {/* LE COMPOSEUR WHATSAPP (la fenêtre de 24 h, la retenue, les modèles, les dix gestes), ou la réponse au chat du site. */}
          {b.fil ? (
            <div className="trc-convs__fil" style={{ minHeight: 0 }}>
              <ComposeurWhatsApp fil={b.fil} texte={texte} surTexte={setTexte} cite={cite} surCite={setCite} poignee={poignee} />
            </div>
          ) : b.discussionId && discussion && discussion.etat !== 'close' && moi ? (
            <form className="trc-saisie trc-bx__chat" onSubmit={(e) => { e.preventDefault(); void repondSurLeChat(b); }}>
              <label className="trc-sub" htmlFor="trc-bx-chat">Répondre sur le chat du site, au nom de la Maison (jamais d’un prénom).</label>
              <div className="trc-saisie__envoi trc-bx__chat-ligne">
                <textarea id="trc-bx-chat" className="mnd-input" rows={2} value={brouillonDuChat} placeholder="Écrire au nom de la Maison" onChange={(e) => setBrouillonDuChat(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void repondSurLeChat(b); } }} />
                <Button type="submit" variant="copper" size="sm" disabled={chatEnVol || !brouillonDuChat.trim()}>{chatEnVol ? 'Envoi…' : 'Envoyer'}</Button>
              </div>
            </form>
          ) : (
            <p className="trc-bx__sans-fil">
              {b.numero ? 'Pas de fil WhatsApp avec elle : appelez-la, ou écrivez-lui un modèle depuis sa fiche.' : 'Pas de numéro pour lui écrire : elle se joint par sa demande ou son appel.'}
            </p>
          )}
        </div>
      </section>
    );
  };

  return (
    <>
      {/* LA LIGNE CHIFFRÉE, à la place des trois tuiles ; les outils de la boîte, à droite. */}
      <div className="trc-bx__resume">
        <p>
          <b className="trc-bx__gros">{attendent.total}</b> à traiter{attendent.total ? ' : ' : ''}
          {attendent.total > 0 && <>
            <b>{parGroupe.maintenant ?? 0}</b> maintenant, <b>{parGroupe.plus ?? 0}</b> plus ancienne{(parGroupe.plus ?? 0) > 1 ? 's' : ''}, <b>{parGroupe.merci ?? 0}</b> merci à ranger
          </>}
          {attendent.sante > 0 && <span className="trc-am__alarme"> · dont {attendent.sante} Santé</span>}
          <span className="trc-bx__doux"> · {repondues.repondues} sur {repondues.questions} répondues sous 1 h aujourd’hui{repondues.enCours ? ` (${repondues.enCours} en cours)` : ''} · {gratuites.restantes.toLocaleString('fr-FR')} réponses gratuites restantes ce mois</span>
        </p>
        <div className="trc-bx__menu">
          <button type="button" className="trc-ger__btn" aria-expanded={menuOutils} onClick={() => setMenuOutils((v) => !v)}>Outils de la boîte ▾</button>
          {menuOutils && (
            <div className="trc-bx__menu-liste" role="menu">
              <button type="button" role="menuitem" onClick={() => ouvreLOutil('reponses')}><b>Réponses toutes prêtes</b><span>{compteDesReponses.validees} validée{compteDesReponses.validees > 1 ? 's' : ''} sur {compteDesReponses.total}</span></button>
              <button type="button" role="menuitem" onClick={() => ouvreLOutil('envois')}><b>Ce qui part</b><span>la salle d’attente et le journal des envois</span></button>
              <button type="button" role="menuitem" onClick={() => ouvreLOutil('mots')}><b>Ce qu’elles disent</b><span>leurs mots des {JOURS_DE_LEURS_MOTS} derniers jours</span></button>
              <button type="button" role="menuitem" onClick={() => ouvreLOutil('scenarios')}><b>Banque de scénarios</b><span>{banqueAValider > 0 ? `${banqueAValider} cas à valider` : 'les vrais messages, rejoués à chaque changement'}</span></button>
            </div>
          )}
        </div>
      </div>

      {/* LA BOÎTE : la liste, la conversation, sa fiche. */}
      <section ref={boiteRef} className={`trc-bx${ouvertEtroit ? ' est-ouverte' : ''}${boite && ficheOuverte && !etroit ? ' avec-fiche' : ''}`} aria-label="Les conversations">
        <div className="trc-bx__liste" ref={listeRef} onKeyDown={auClavierDansLaListe}>
          <div className="trc-bx__commandes">
            <input
              type="search" className="mnd-input trc-bx__cherche" value={cherche} onChange={(e) => setCherche(e.target.value)}
              placeholder="Chercher un nom, un numéro, un mot" aria-label="Chercher une conversation"
            />
            <div className="trc-bx__segments" role="group" aria-label="Quelles conversations">
              <button type="button" aria-pressed={filtre === 'attend'} className={filtre === 'attend' ? 'est-choisi' : ''} onClick={() => choisitLeFiltre('attend')}>À traiter · {comptes.attend}</button>
              <button type="button" aria-pressed={dansToutes} className={dansToutes ? 'est-choisi' : ''} onClick={() => choisitLeFiltre('tout')}>Toutes · {comptes.tout}</button>
            </div>
            {/* LE TRI DES DÉMARCHEURS (29 octobre 2026) : ce que Claude a rangé, et ce qui est bloqué. */}
            <div className="trc-bx__puces" role="group" aria-label="Le tri">
              {(['propositions', 'bloques'] as const).map((f) => (
                <button key={f} type="button" aria-pressed={filtre === f} className={filtre === f ? 'est-choisi' : ''} onClick={() => choisitLeFiltre(filtre === f ? 'attend' : f)}>
                  {FILTRE_DIT[f]} · {comptes[f]}
                </button>
              ))}
            </div>
            {dansToutes && (
              <div className="trc-bx__puces" role="group" aria-label="Seulement">
                {(['site', 'entre-deux'] as const).map((f) => (
                  <button key={f} type="button" aria-pressed={filtre === f} className={filtre === f ? 'est-choisi' : ''} onClick={() => choisitLeFiltre(filtre === f ? 'tout' : f)}>
                    {FILTRE_DIT[f]} · {comptes[f]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="trc-bx__defile">
            {recherche ? (
              <>
                <h3 className="trc-bx__groupe">Résultats · {ordre.length}</h3>
                {ordre.length === 0 ? <p className="trc-ger__vide">Personne ne répond à « {cherche.trim()} ».</p> : <ul className="trc-bx__lignes">{ordre.map(ligneDe)}</ul>}
              </>
            ) : filtre === 'attend' ? (
              ordre.length === 0
                ? <p className="trc-ger__vide">Plus rien à traiter : chaque message, chaque demande et chaque souci a sa suite.</p>
                : groupes.filter((x) => x.boites.length > 0).map((x) => (
                  <div key={x.g}>
                    <div className="trc-bx__groupe-tete">
                      <h3 className="trc-bx__groupe">{GROUPE_DIT[x.g]} · {x.boites.length}</h3>
                      {x.g === 'merci' && <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => rangeLesMercis(x.boites)}>Tout ranger</button>}
                    </div>
                    <ul className="trc-bx__lignes">{x.boites.map(ligneDe)}</ul>
                  </div>
                ))
            ) : filtre === 'bloques' || filtre === 'propositions' ? (
              <>
                <p className="trc-ger__doux trc-bx__tri-aide">
                  {filtre === 'bloques'
                    ? 'Les démarcheurs bloqués chez WhatsApp : ils ne peuvent plus écrire à la Maison. « Débloquer » les rend à « À traiter ».'
                    : 'Les propositions qui parlent de cheveux (fournisseurs, formations) : personne ne leur répond, vous les lisez quand vous voulez.'}
                </p>
                {filtre === 'bloques' && estDirection && (
                  <button type="button" className="trc-ger__btn trc-bx__tri-passe" onClick={() => void lanceLaPasse()}>Relire les dernières 24 h</button>
                )}
                {ordre.length === 0 ? <p className="trc-ger__vide">{filtre === 'bloques' ? 'Aucun numéro bloqué.' : 'Aucune proposition.'}</p> : <ul className="trc-bx__lignes">{ordre.map(ligneDe)}</ul>}
              </>
            ) : (
              ordre.length === 0 ? <p className="trc-ger__vide">Aucune conversation ici.</p> : <ul className="trc-bx__lignes">{ordre.map(ligneDe)}</ul>
            )}
          </div>
          {!etroit && <p className="trc-bx__aide">Au clavier : flèches haut et bas pour passer de l’une à l’autre, Entrée pour écrire, Échap pour revenir à la liste.</p>}
        </div>

        {boite ? conversation(boite) : !etroit ? (
          <div className="trc-bx__conv trc-bx__conv--vide"><p>Choisissez une conversation dans la liste.</p></div>
        ) : null}

        {passe && (
          <Modal title="Les fils sans fiche des dernières 24 heures" onClose={() => setPasse(null)} width={600}>
            <div className="trc-bx__passe">
              {passe.enCours && <p className="trc-ger__doux">Claude relit les premiers messages des numéros inconnus…</p>}
              {passe.erreur && <p className="trc-am__alarme">{passe.erreur}</p>}
              {!passe.enCours && !passe.erreur && (
                passe.proposes.length === 0
                  ? <p className="trc-ger__doux">{passe.lus ?? 0} numéro{(passe.lus ?? 0) > 1 ? 's' : ''} relu{(passe.lus ?? 0) > 1 ? 's' : ''} : aucun démarcheur.</p>
                  : (
                    <>
                      <p className="trc-ger__doux">{passe.lus} numéro{(passe.lus ?? 0) > 1 ? 's' : ''} relu{(passe.lus ?? 0) > 1 ? 's' : ''}. Cochez ceux à bloquer : rien n’est bloqué sans vous.</p>
                      <ul className="trc-bx__passe-liste">
                        {passe.proposes.map((x) => (
                          <li key={x.numero}>
                            <label>
                              <input type="checkbox" checked={passe.coches.includes(x.numero)}
                                onChange={(ev) => setPasse((p) => p && ({ ...p, coches: ev.target.checked ? [...p.coches, x.numero] : p.coches.filter((n) => n !== x.numero) }))} />
                              <span><b>{x.nom || `+${x.numero}`}</b> · {x.verdict === 'demarchage' ? 'Démarchage' : 'Proposition'} : {x.motif}<small>« {x.extrait} »</small></span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      <div className="trc-am__gestes">
                        <button type="button" className="trc-ger__btn trc-ger__btn--cuivre" disabled={passe.coches.length === 0} onClick={() => void bloqueLesCoches()}>Bloquer les cochés ({passe.coches.length})</button>
                        <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => setPasse(null)}>Fermer</button>
                      </div>
                    </>
                  )
              )}
            </div>
          </Modal>
        )}

        {boite && ficheOuverte && !etroit && (
          <aside className="trc-bx__fiche" aria-label="Sa fiche">
            <button type="button" className="trc-bx__fermer" onClick={() => setFicheOuverte(false)} aria-label="Fermer sa fiche">×</button>
            {ficheEtGestes(boite)}
          </aside>
        )}
      </section>

      {/* LES OUTILS DE LA BOÎTE, un à la fois, sous la boîte ; `?reponses=1` et `?envois=1` les ouvrent. */}
      <div ref={outilRef}>
        {outil === 'reponses' && (
          <section className="trc-ger__carte trc-bx__outil">
            <div className="trc-ger__haut">
              <h3>Réponses toutes prêtes <span>{compteDesReponses.validees} validée{compteDesReponses.validees > 1 ? 's' : ''} sur {compteDesReponses.total}</span></h3>
              <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => setOutil(null)}>Fermer</button>
            </div>
            <ReponsesDeLaMaison onOuvrirLeFil={ouvreLeFilDe} />
          </section>
        )}
        {outil === 'envois' && (
          <section className="trc-ger__carte trc-bx__outil">
            <div className="trc-ger__haut">
              <h3>Ce qui part <span>la salle d’attente et le journal</span></h3>
              <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => setOutil(null)}>Fermer</button>
            </div>
            <EnvoisAutomatiques typeInitial={params.get('type')} onOuvrirLeFil={ouvreLeFilDe} />
          </section>
        )}
        {outil === 'mots' && (
          <section className="trc-ger__carte trc-bx__outil">
            <div className="trc-ger__haut">
              <h3>Ce qu’elles disent <span>{JOURS_DE_LEURS_MOTS} derniers jours, sans nom ni numéro</span></h3>
              <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => setOutil(null)}>Fermer</button>
            </div>
            {leursMots.length === 0
              ? <p className="trc-ger__doux">Aucun mot de cliente sur WhatsApp ces {JOURS_DE_LEURS_MOTS} derniers jours.</p>
              : <p className="trc-ger__doux" style={{ fontSize: 13.5, color: 'var(--ink)' }}>{leursMots.map((m) => `« ${m.texte} »`).join(' · ')}</p>}
          </section>
        )}
        {outil === 'scenarios' && (
          <section className="trc-ger__carte trc-bx__outil">
            <div className="trc-ger__haut">
              <h3>Banque de scénarios <span>les vrais messages, rejoués à chaque changement</span></h3>
              <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => setOutil(null)}>Fermer</button>
            </div>
            <BanqueDeScenarios casAOuvrir={casAOuvrir} />
          </section>
        )}
      </div>

      {rdvPour && <RdvModal title="Poser le RDV" initial={rdvPour} onClose={() => setRdvPour(null)} />}

      {/* RATTACHER : on choisit une tête EXISTANTE, jamais une fiche créée seule. */}
      {rattacher?.numero && (
        <div className="trc-modal-fond" onClick={() => setRattacher(null)}>
          <div className="trc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trc-modal__t">À qui appartient le +{rattacher.numero} ?</div>
            <p className="trc-sub" style={{ marginTop: 0 }}>
              Le numéro s’écrira sur la fiche choisie, et tout ce fil la rejoindra. <b>Aucune fiche n’est créée ici</b> : si c’est une nouvelle tête, ouvrez-la d’abord depuis Les clientes.
            </p>
            <ClientPicker value="" onChange={(id) => { if (id && rattacher.numero) void attache(id, rattacher.numero, clients).then((fait) => { if (fait) setRattacher(null); }); }} placeholder="Cherchez une cliente…" />
          </div>
        </div>
      )}
    </>
  );
}

/* Ce qui reste à cet écran, dit franchement (27 octobre 2026) :
   · « Ce qu'il faut faire » dit ce que le Trône sait (la source, le délai,
     la fenêtre, son RDV) ; il ne lit pas ses mots au-delà du « merci » ;
   · « Proposer d'avancer » passe encore par la zone de saisie ou wa.me, pas par
     une ligne `envois` en salle d'attente ;
   · la réécriture d'un message parti et les réactions restent dans les
     Conversations d'avant (`/conversations?ancien=1`). */
