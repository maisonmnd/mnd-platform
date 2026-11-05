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
  FILTRE_DIT, boiteDuNumero, boitesDeLaMaison, boitesDuFiltre, cleDuFilRange, comptesDesFiltres, heureACotonou, type AuteurDeBulle, type Boite, type Bulle, type EnvoiDeLaBoite, type FiltreDeLaBoite, type SourceDeBulle,
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
import { badgeDe, enAttenteDElle, enSalleDAttente, quiTient, tenueDite, type Tenue } from '../../../../shared/qui-tient-pur';
import { prendsLaBoite, rendsLaBoite, usePrises } from '../../../../shared/qui-tient';
import { ALLUMAGE_DIT, AUTOMATISATIONS_REELLES, GROUPES_DES_AUTOMATISATIONS, compteDuMois, moisDuSalon, type AutomatisationReelle } from '../../../../shared/automatisations-reelles-pur';
import { reglesDepuis } from '../../../../shared/salle-des-envois';
import type { EnvoiLu } from '../../../../shared/envois';
import { useStaff } from '../equipe/data';
import { useFamilies } from '../../../../shared/clients';
import { ArrowRight, CalendarPlus, Check, ChevronDown, Phone, UserRound, X } from 'lucide-react';

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

/* LES QUATRE ONGLETS (4 novembre 2026, maquette PeKLwgLpMsmupgqHCyUSuc) :
   « À traiter » (la salle d'attente, puis ce que l'équipe tient, puis les
   mercis), « En attente » (la Maison a écrit la dernière, elle doit
   répondre), « Toutes », et « Règles » (ce qui part seul, en Quand → Alors). */
type Onglet = 'traiter' | 'attente' | 'toutes' | 'regles';
const ONGLETS: readonly { k: Onglet; dit: string }[] = [
  { k: 'traiter', dit: 'À traiter' }, { k: 'attente', dit: 'En attente' }, { k: 'toutes', dit: 'Toutes' }, { k: 'regles', dit: 'Règles' },
];
/** Ce qu'une règle fait de la salle d'attente des envois : les réponses à
    ce qu'elle vient d'écrire partent tout de suite (choix du 2 octobre
    2026) ; le reste attend dans « Ce qui part ». */
const PART_TOUT_DE_SUITE = new Set(['automate-wa', 'accuse']);
const SANS_LA_SALLE = new Set(['push-rappels', 'avis-premiere-venue']);

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
  const [onglet, setOnglet] = useState<Onglet>(() => {
    const o = params.get('onglet');
    if (o === 'attente' || o === 'regles') return o;
    const f = params.get('filtre');
    return f && f !== 'attend' ? 'toutes' : 'traiter';
  });
  /* La salle d'attente se replie d'un geste ; la prise s'écrit dans `mnd_qui_tient`. */
  const [salleRepliee, setSalleRepliee] = useState(false);
  const [menuTenue, setMenuTenue] = useState(false);
  /* L'action suggérée se masque pour CETTE boîte et CETTE phrase ; une autre phrase la remontre. */
  const [suggestionCachee, setSuggestionCachee] = useState<string | null>(null);
  const [regle, setRegle] = useState<string>(AUTOMATISATIONS_REELLES[0]?.id ?? '');
  const [prises] = usePrises();
  const [equipe] = useStaff();
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
  /* SA FICHE, EN TIROIR (4 novembre 2026) : fermée d'office, elle s'ouvre
     par « Sa fiche » par-dessus la conversation, jamais en colonne fixe. */
  const [ficheOuverte, setFicheOuverte] = useState(false);
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
  const [familles] = useFamilies();
  const tetes = useMemo(() => tetesDeLaMaison({ clientes: clients, familles }), [clients, familles]);
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
    fils, discussions, demandes, appelsWa, appels, signalements, envois: envoisLus, clientes: clients, familles, maintenant: tick, branchId: branch.id, tiroirs: [...new Set(['clientes' as const, ...fils.map((f) => f.tiroir)])],
    riensARepondre: riens, tri,
  }), [fils, discussions, demandes, appelsWa, appels, signalements, envoisLus, clients, familles, tick, branch.id, riens, tri]);
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
    if (b && (onglet === 'regles' || (onglet === 'attente' && !enAttenteDElle(b, tick)) || !b.filtres.includes(filtre))) { setFiltre('tout'); setOnglet('toutes'); }
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
  /* QUI TIENT CHAQUE BOÎTE (4 novembre 2026) : la prise écrite, l'automate,
     Perle, la dernière main de l'équipe (`qui-tient-pur`). « À traiter » se
     lit en trois temps : la SALLE D'ATTENTE (personne ne la tient encore),
     ce que l'équipe tient, puis les mercis sans question. */
  const tenues = useMemo(() => new Map(boites.map((b) => [b.cle, quiTient(b, prises, tick)])), [boites, prises, tick]);
  const tenueDe = (b: Boite): Tenue => tenues.get(b.cle) ?? { qui: 'personne' };
  const aTraiter = useMemo(() => {
    const vivantes = groupes.filter((x) => x.g !== 'merci').flatMap((x) => x.boites);
    return {
      salle: vivantes.filter((b) => enSalleDAttente(b, tenueDe(b))),
      tenues: vivantes.filter((b) => !enSalleDAttente(b, tenueDe(b))),
      mercis: groupes.find((x) => x.g === 'merci')?.boites ?? [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupes, tenues]);
  /* EN ATTENTE : la Maison a écrit la dernière, il y a moins de 7 jours ; la plus récente d'abord. */
  const enAttente = useMemo(() => boites.filter((b) => enAttenteDElle(b, tick))
    .sort((x, y) => (y.derniere?.quand ?? '').localeCompare(x.derniere?.quand ?? '')), [boites, tick]);
  const ordre = useMemo(() => {
    if (recherche) {
      const chiffres = chiffresSeuls(recherche);
      return boites.filter((b) => plat(`${b.nom} ${b.bulles.slice(-30).map((x) => x.texte).join(' ')}`).includes(recherche)
        || (chiffres.length >= 4 && chiffresSeuls(b.numero).includes(chiffres)));
    }
    if (onglet === 'regles') return [];
    if (onglet === 'attente') return enAttente;
    if (onglet === 'traiter' && filtre === 'attend') return [...aTraiter.salle, ...aTraiter.tenues, ...aTraiter.mercis];
    return visibles;
  }, [recherche, boites, onglet, filtre, aTraiter, enAttente, visibles]);
  const boite = boites.find((b) => b.cle === ouverte) ?? null;
  /* Au téléphone, une conversation ouverte prend tout l'écran : la liste s'efface derrière elle. */
  const ouvertEtroit = etroit && !!boite && onglet !== 'regles';

  /* SUR UN GRAND ÉCRAN, LA PREMIÈRE CONVERSATION S'OUVRE SEULE : la colonne
     de droite n'est jamais vide quand il y a quelqu'un à qui répondre. */
  useEffect(() => {
    if (etroit || cleDemandee) return;
    if (ouverte && boites.some((b) => b.cle === ouverte)) return;
    const premiere = ordre[0];
    if (premiere) setOuverte(premiere.cle);
  }, [etroit, cleDemandee, ouverte, boites, ordre]);

  /* LA LIGNE CHIFFRÉE S'EFFACE (4 novembre 2026) : les nombres des onglets
     disent qui attend ; seul un souci Santé se signale en tête. */
  const santeEnAttente = useMemo(() => boites.filter((b) => b.attendUneReponse && b.sante).length, [boites]);
  const nowIso = new Date(tick).toISOString();
  /* L'ÉQUIPE QUI PEUT TENIR UNE CONVERSATION : les fiches de la branche qui
     ont un compte au Trône (son adresse de connexion, ou un accès préparé). */
  const moiNom = moi?.name?.trim() ?? '';
  const lEquipe = useMemo(() => equipe
    .filter((m) => (!m.branchId || m.branchId === branch.id) && (m.compteMail || m.roleDAcces) && !/part|sorti|ancien|archiv/i.test(m.statut ?? ''))
    .map((m) => m.name.trim()).filter((n, i, t) => n && t.indexOf(n) === i && n.toLowerCase() !== moiNom.toLowerCase())
    .sort((a, b) => a.localeCompare(b, 'fr')), [equipe, branch.id, moiNom]);
  /* LES RÈGLES : ce qui part seul, compté ce mois-ci par le journal des envois. */
  const reglesDeLaSalle = reglesDepuis(cfg);
  const moisCourant = moisDuSalon(nowIso);

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
  useEffect(() => { setSouciOuvert(null); setBrouillonDuChat(''); setCite(null); setBulleTouchee(null); setMenuTenue(false); }, [ouverte]);
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
    setOnglet(f === 'attend' ? 'traiter' : 'toutes');
    const suivants = new URLSearchParams(params);
    suivants.delete('onglet');
    if (f === 'attend') suivants.delete('filtre'); else suivants.set('filtre', f);
    setParams(suivants, { replace: true });
  };
  const choisitLOnglet = (o: Onglet) => {
    if (o === 'traiter') { choisitLeFiltre('attend'); return; }
    if (o === 'toutes') { choisitLeFiltre('tout'); return; }
    setOnglet(o);
    setMenuTenue(false);
    const suivants = new URLSearchParams(params);
    suivants.delete('filtre');
    suivants.set('onglet', o);
    setParams(suivants, { replace: true });
  };
  /* « JE LA PRENDS », et le menu « Gérée par » : la prise s'écrit pour toute
     l'équipe. Prendre un fil que l'automate tient lui fait reprendre la main. */
  const prends = (b: Boite, nom: string = moiNom) => {
    if (!nom) { toast('Votre nom manque à votre compte : la prise ne peut pas s’écrire.'); return; }
    prendsLaBoite(b.cle, nom, moiNom || undefined, new Date().toISOString());
    if (b.fil?.automate?.tenue === 'tenu' && boite?.cle === b.cle) poignee.current?.prendsLaMain('reprendre', true);
    setMenuTenue(false);
    toast(nom === moiNom ? `Vous tenez la conversation avec ${b.nom}.` : `${nom} tient la conversation avec ${b.nom}.`);
  };
  const rendsALaSalle = (b: Boite) => {
    rendsLaBoite(b.cle);
    setMenuTenue(false);
    toast(`${b.nom} retourne en salle d’attente.`);
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

  /** LE BADGE D'UNE BOÎTE, un seul (`badgeDe`) : il part de la pastille d'À traiter. */
  const badgeDeLaBoite = (b: Boite) => badgeDe(b, { pastille: pastilleDe(b), tenue: tenueDe(b), merci: groupeDe(b, tick) === 'merci', maintenant: tick });

  /** UNE LIGNE DE LA LISTE : l'avatar, le nom, depuis quand, son dernier mot,
      UN badge et qui la tient. En salle d'attente, « Je la prends » à côté. */
  const ligneDe = (b: Boite, enSalle = false) => {
    const dernier = b.derniereDElle ?? b.derniere;
    const mot = dernier ? (dernier.texte.trim() || (dernier.source === 'chat' ? 'discussion du site' : SOURCE_DITE[dernier.source])) : 'rien encore';
    const badge = badgeDeLaBoite(b);
    const tenue = tenueDite(tenueDe(b), moiNom);
    const courante = boite?.cle === b.cle;
    const nouvelle = badge.cle === 'nouveau';
    return (
      <li key={b.cle} className={enSalle ? 'trc-bx__en-salle' : undefined}>
        <button
          type="button" data-cle={b.cle}
          className={`trc-bx__ligne${courante ? ' est-courante' : ''}${nouvelle ? ' est-nouvelle' : ''}`}
          aria-current={courante ? 'true' : undefined}
          onClick={() => ouvre(b)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ouvre(b); prendLaSaisie(); } }}
        >
          <span className={`trc-bx__avatar${nouvelle ? ' est-nouvelle' : ''}`} aria-hidden="true">{b.initiales}</span>
          <span className="trc-bx__qui">
            <span className="trc-bx__haut">
              <b>{b.nom}</b>
              {b.depuisMs !== undefined && <span className="trc-bx__depuis">{depuisDit(b.depuisMs)}</span>}
            </span>
            <span className="trc-bx__mot">{dernier ? `${SOURCE_DITE[dernier.source]} : ` : ''}{court(mot)}</span>
            <span className="trc-bx__pied">
              <span className={`trc-bx__pastille trc-bx__badge--${badge.ton}`}>{badge.dit}</span>
              <span className={`trc-bx__tient trc-bx__tient--${tenue.ton}`}><i aria-hidden="true">{tenue.initiale}</i>{tenue.dit}</span>
            </span>
          </span>
        </button>
        {enSalle && <button type="button" className="trc-bx__prendre" onClick={() => prends(b)}>Je la prends</button>}
      </li>
    );
  };
  /** LA RÈGLE OUVERTE, et son compte du mois. */
  const regleOuverte: AutomatisationReelle | undefined = AUTOMATISATIONS_REELLES.find((a) => a.id === regle) ?? AUTOMATISATIONS_REELLES[0];
  const etatDeLaRegle = (a: AutomatisationReelle): string => (a.allumage === 'reglage' || a.allumage === 'ici' ? (a.reglage ? `réglable · ${a.reglage.dit}` : 'réglable ici') : ALLUMAGE_DIT[a.allumage]);
  const gardesDeLaRegle = (a: AutomatisationReelle): string[] => {
    if (PART_TOUT_DE_SUITE.has(a.id)) return ['Part tout de suite : c’est elle qui vient d’écrire.'];
    if (SANS_LA_SALLE.has(a.id)) return [a.pasCompte ? `${a.pasCompte[0].toUpperCase()}${a.pasCompte.slice(1)}.` : 'Ne passe pas par WhatsApp.'];
    return [
      `Attend ${reglesDeLaSalle.salleMin} minutes dans « Ce qui part » : vous pouvez le retenir ou l’écarter.`,
      `Heures calmes de ${reglesDeLaSalle.calmeDe} h à ${reglesDeLaSalle.calmeA} h : il part le matin.`,
    ];
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
    if (!estDirection || !b.sansFiche || b.parentDe || !b.fil || !b.numero) return null;
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
          {estDirection && b.sansFiche && !b.parentDe && b.fil && b.numero && !b.tri && aConfirmer !== b.cle && (
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
    const tenue = tenueDe(b);
    const tenueLue = tenueDite(tenue, moiNom);
    const cleDeLaSuggestion = `${b.cle}|${faire.phrase}`;
    /* « RIEN À FAIRE. » SEUL NE S'AFFICHE PLUS (5 novembre 2026) : sans geste
       ni rendez-vous à dire, le bandeau ne disait rien et prenait, au
       téléphone, la place de trois bulles. */
    const rienADire = faire.gestes.length === 0 && faire.phrase === 'Rien à faire.';
    const suggestionVisible = suggestionCachee !== cleDeLaSuggestion && !rienADire;
    return (
      <section
        ref={convOuverte}
        className={`trc-bx__conv${ouvertEtroit ? ' trc-am__plein' : ''}`}
        aria-label={`La conversation avec ${b.nom}`}
        onKeyDown={echapDansLaConversation}
      >
        {/* LA TÊTE : au téléphone le retour à la liste ; partout le nom, ses canaux, QUI LA TIENT, et une barre d'outils compacte. */}
        <div className={etroit ? 'trc-am__tete trc-bx__tete' : 'trc-bx__tete'}>
          {etroit && <button type="button" className="trc-am__retour" onClick={() => ouvre(null)} aria-label="Revenir à la liste des conversations">←</button>}
          <span className="trc-bx__nom">
            <b>{b.nom}</b>
            <span>{sous}</span>
          </span>
          <span className="trc-bx__geree">
            <button type="button" className="trc-bx__geree-btn" aria-expanded={menuTenue} onClick={() => setMenuTenue((v) => !v)}>
              <span className="trc-bx__geree-dit">Gérée par</span>
              <span className={`trc-bx__tient trc-bx__tient--${tenueLue.ton}`}><i aria-hidden="true">{tenueLue.initiale}</i>{tenueLue.dit}</span>
              <ChevronDown size={13} aria-hidden="true" />
            </button>
            {menuTenue && (
              <span className="trc-bx__geree-menu" role="menu">
                <span className="trc-bx__geree-titre">Qui tient cette conversation</span>
                {moiNom && (
                  <button type="button" role="menuitem" className={tenueLue.ton === 'vous' ? 'est-choisi' : ''} onClick={() => prends(b)}>
                    <span className="trc-bx__tient trc-bx__tient--vous"><i aria-hidden="true">{moiNom[0]?.toUpperCase()}</i>Vous</span><small>je la prends</small>
                  </button>
                )}
                {lEquipe.map((nom) => (
                  <button key={nom} type="button" role="menuitem" className={tenue.qui === 'equipe' && tenue.nom === nom ? 'est-choisi' : ''} onClick={() => prends(b, nom)}>
                    <span className="trc-bx__tient trc-bx__tient--equipe"><i aria-hidden="true">{nom[0]?.toUpperCase()}</i>{nom}</span><small>la lui confier</small>
                  </button>
                ))}
                {(tenue.qui === 'perle' || tenue.qui === 'automate') && (
                  <span className="trc-bx__geree-note">{tenueLue.dit} tient ce fil{b.fil?.automate?.tenue === 'tenu' ? ' : la prendre lui fait reprendre la main' : ''}.</span>
                )}
                {tenue.qui === 'equipe' && tenue.prise && (
                  <button type="button" role="menuitem" onClick={() => rendsALaSalle(b)}>
                    <span className="trc-bx__tient trc-bx__tient--personne"><i aria-hidden="true">?</i>Personne</span><small>la remettre en salle d’attente</small>
                  </button>
                )}
              </span>
            )}
          </span>
          <span className="trc-bx__boutons" role="toolbar" aria-label="Les gestes de la conversation">
            {tel && !etroit && <a className="trc-bx__outil-btn" href={tel}><Phone size={14} aria-hidden="true" />Appeler</a>}
            {!etroit && <button type="button" className="trc-bx__outil-btn" onClick={() => poseLeRdv(b)}><CalendarPlus size={14} aria-hidden="true" />RDV</button>}
            {!etroit && <button type="button" className={`trc-bx__outil-btn${ficheOuverte ? ' est-choisi' : ''}`} aria-pressed={ficheOuverte} onClick={() => setFicheOuverte((v) => !v)}><UserRound size={14} aria-hidden="true" />Sa fiche</button>}
            {b.attendUneReponse && !etroit && <button type="button" className="trc-bx__outil-btn" onClick={() => range(b)}><Check size={14} aria-hidden="true" />Rien à répondre</button>}
            {estDirection && b.sansFiche && !b.parentDe && b.fil && b.numero && !b.tri && aConfirmer !== b.cle && <button type="button" className="trc-bx__outil-btn" onClick={() => setAConfirmer(b.cle)}>Bloquer ce numéro</button>}
            <button type="button" className="trc-bx__outil-btn trc-bx__suivante" onClick={suivante}>Suivante<ArrowRight size={14} aria-hidden="true" /></button>
          </span>
        </div>
        <div className="trc-am__corps">
          {/* LE TRI DES DÉMARCHEURS dans la conversation (4 novembre 2026) : bloqué, proposition, ou la confirmation de « Bloquer ce numéro », sans ouvrir sa fiche. */}
          {(b.tri || aConfirmer === b.cle) && <div className="trc-bx__tri-conv">{leTri(b)}</div>}
          {/* L'ACTION SUGGÉRÉE (4 novembre 2026) : « Ce qu'il faut faire » en bandeau discret, sa phrase et ses gestes, le principal d'abord ; elle se masque pour cette phrase. */}
          {suggestionVisible && (
            <div className={`trc-bx__faire trc-bx__faire--${tonDuFaire}${faire.gestes.length === 0 ? ' est-sans-geste' : ''}`}>
              <p className="trc-bx__faire-titre">Action suggérée</p>
              <p className="trc-bx__faire-phrase">{faire.phrase}</p>
              {faire.gestes.length > 0 && (
                <div className="trc-bx__faire-gestes">
                  {faire.gestes.map((g, i) => (g.cle === 'appeler' && tel
                    ? <a key={g.cle} className={`trc-ger__btn${i === 0 ? ' trc-bx__principal' : ''}`} href={tel}>{g.dit}</a>
                    : <button key={g.cle} type="button" className={`trc-ger__btn${i === 0 ? ' trc-bx__principal' : ''}`} onClick={() => faisLeGeste(g.cle, b)}>{g.dit}</button>))}
                </div>
              )}
              <button type="button" className="trc-bx__faire-x" onClick={() => setSuggestionCachee(cleDeLaSuggestion)} aria-label="Masquer l’action suggérée"><X size={14} aria-hidden="true" /></button>
            </div>
          )}

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
      {/* LA TÊTE DE LA BOÎTE (4 novembre 2026) : la ligne chiffrée s'efface ; un souci Santé seul s'y signale, et les outils restent à droite. */}
      <div className="trc-bx__resume trc-bx-vue">
        <p>{santeEnAttente > 0 && <span className="trc-am__alarme">{santeEnAttente} souci{santeEnAttente > 1 ? 's' : ''} Santé à rappeler sous 24 h</span>}</p>
        <div className="trc-bx__menu">
          <button type="button" className="trc-ger__btn" aria-expanded={menuOutils} onClick={() => setMenuOutils((v) => !v)}>Outils de la boîte ▾</button>
          {menuOutils && (
            <div className="trc-bx__menu-liste" role="menu">
              <button type="button" role="menuitem" onClick={() => ouvreLOutil('reponses')}><b>Réponses toutes prêtes</b><span>{compteDesReponses.validees} validée{compteDesReponses.validees > 1 ? 's' : ''} sur {compteDesReponses.total}</span></button>
              <button type="button" role="menuitem" onClick={() => ouvreLOutil('envois')}><b>Ce qui part</b><span>les envois retenus et le journal</span></button>
              <button type="button" role="menuitem" onClick={() => ouvreLOutil('mots')}><b>Ce qu’elles disent</b><span>leurs mots des {JOURS_DE_LEURS_MOTS} derniers jours</span></button>
              <button type="button" role="menuitem" onClick={() => ouvreLOutil('scenarios')}><b>Banque de scénarios</b><span>{banqueAValider > 0 ? `${banqueAValider} cas à valider` : 'les vrais messages, rejoués à chaque changement'}</span></button>
            </div>
          )}
        </div>
      </div>

      {/* LA BOÎTE : la liste, la conversation, sa fiche. */}
      <section ref={boiteRef} className={`trc-bx trc-bx-vue${ouvertEtroit ? ' est-ouverte' : ''}`} aria-label="Les conversations">
        <div className="trc-bx__liste" ref={listeRef} onKeyDown={auClavierDansLaListe}>
          <div className="trc-bx__commandes">
            {/* LES QUATRE ONGLETS, leur nombre à côté (4 novembre 2026). */}
            <div className="trc-bx__segments" role="tablist" aria-label="Quelles conversations">
              {ONGLETS.map((o) => {
                const choisi = onglet === o.k;
                const n = o.k === 'traiter' ? comptes.attend : o.k === 'attente' ? enAttente.length : o.k === 'toutes' ? comptes.tout : AUTOMATISATIONS_REELLES.length;
                return (
                  <button key={o.k} type="button" role="tab" aria-selected={choisi} aria-pressed={choisi} className={choisi ? 'est-choisi' : ''} onClick={() => choisitLOnglet(o.k)}>
                    {o.dit}<em>{n}</em>
                  </button>
                );
              })}
            </div>
            {onglet !== 'regles' && (
              <input
                type="search" className="mnd-input trc-bx__cherche" value={cherche} onChange={(e) => setCherche(e.target.value)}
                placeholder="Un nom, un numéro, un mot" aria-label="Chercher une conversation"
              />
            )}
          </div>

          <div className="trc-bx__defile">
            {recherche ? (
              <>
                <h3 className="trc-bx__groupe">Résultats · {ordre.length}</h3>
                {ordre.length === 0 ? <p className="trc-ger__vide">Personne ne répond à « {cherche.trim()} ».</p> : <ul className="trc-bx__lignes">{ordre.map((b) => ligneDe(b))}</ul>}
              </>
            ) : onglet === 'regles' ? (
              <>
                {/* LES RÈGLES : ce qui part seul, rangé comme dans Marketing › Automatisations ; « Ce qui part » en tête. */}
                <div className="trc-bx__envois">
                  <span><b>Ce qui part</b>Tout message automatique attend {reglesDeLaSalle.salleMin} minutes avant de partir.</span>
                  <button type="button" className="trc-bx__prendre" onClick={() => ouvreLOutil('envois')}>Voir</button>
                </div>
                {GROUPES_DES_AUTOMATISATIONS.map((g) => {
                  const regles = AUTOMATISATIONS_REELLES.filter((a) => a.groupe === g.k);
                  if (regles.length === 0) return null;
                  return (
                    <div key={g.k}>
                      <h3 className="trc-bx__groupe">{g.dit}</h3>
                      <ul className="trc-bx__lignes">
                        {regles.map((a) => (
                          <li key={a.id}>
                            <button type="button" className={`trc-bx__regle${regleOuverte?.id === a.id ? ' est-courante' : ''}`} aria-current={regleOuverte?.id === a.id ? 'true' : undefined} onClick={() => setRegle(a.id)}>
                              <b>{a.quand}</b>
                              <span>{a.quoi}</span>
                              <span className="trc-bx__allume">{etatDeLaRegle(a)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </>
            ) : onglet === 'traiter' && filtre === 'attend' ? (
              ordre.length === 0
                ? <p className="trc-ger__vide">Plus rien à traiter : chaque message, chaque demande et chaque souci a sa suite.</p>
                : (
                  <>
                    {/* LA SALLE D'ATTENTE : elles attendent, et personne ne les tient encore. */}
                    {aTraiter.salle.length > 0 && (
                      <div className="trc-bx__salle">
                        <button type="button" className="trc-bx__salle-tete" aria-expanded={!salleRepliee} onClick={() => setSalleRepliee((v) => !v)}>
                          <b>Salle d’attente · {aTraiter.salle.length}</b>
                          <span>personne ne s’en occupe encore</span>
                          <ChevronDown size={14} aria-hidden="true" className={salleRepliee ? '' : 'est-ouvert'} />
                        </button>
                        {!salleRepliee && <ul className="trc-bx__lignes">{aTraiter.salle.map((b) => ligneDe(b, true))}</ul>}
                      </div>
                    )}
                    {aTraiter.tenues.length > 0 && (
                      <div>
                        <h3 className="trc-bx__groupe">L’équipe s’en occupe · {aTraiter.tenues.length}</h3>
                        <ul className="trc-bx__lignes">{aTraiter.tenues.map((b) => ligneDe(b))}</ul>
                      </div>
                    )}
                    {aTraiter.mercis.length > 0 && (
                      <div>
                        <div className="trc-bx__groupe-tete">
                          <h3 className="trc-bx__groupe">{GROUPE_DIT.merci} · {aTraiter.mercis.length}</h3>
                          <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => rangeLesMercis(aTraiter.mercis)}>Tout ranger</button>
                        </div>
                        <ul className="trc-bx__lignes">{aTraiter.mercis.map((b) => ligneDe(b))}</ul>
                      </div>
                    )}
                  </>
                )
            ) : onglet === 'attente' ? (
              <>
                <h3 className="trc-bx__groupe">Elles doivent répondre · {enAttente.length}</h3>
                {enAttente.length === 0 ? <p className="trc-ger__vide">Personne ne doit de réponse à la Maison cette semaine.</p> : <ul className="trc-bx__lignes">{enAttente.map((b) => ligneDe(b))}</ul>}
              </>
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
                {ordre.length === 0 ? <p className="trc-ger__vide">{filtre === 'bloques' ? 'Aucun numéro bloqué.' : 'Aucune proposition.'}</p> : <ul className="trc-bx__lignes">{ordre.map((b) => ligneDe(b))}</ul>}
              </>
            ) : (
              ordre.length === 0 ? <p className="trc-ger__vide">Aucune conversation ici.</p> : <ul className="trc-bx__lignes">{ordre.map((b) => ligneDe(b))}</ul>
            )}
          </div>
          {/* LE PIED DE LA LISTE : le tri des démarcheurs (29 octobre 2026), ce que Claude a rangé et ce qui est bloqué ; dans « Toutes », le site et les soucis. */}
          {onglet !== 'regles' && (
            <div className="trc-bx__pied-liste">
              <div className="trc-bx__puces" role="group" aria-label="Le tri">
                {(['propositions', 'bloques'] as const).map((f) => (
                  <button key={f} type="button" aria-pressed={filtre === f} className={filtre === f ? 'est-choisi' : ''} onClick={() => choisitLeFiltre(filtre === f ? 'attend' : f)}>
                    {FILTRE_DIT[f]} · {comptes[f]}
                  </button>
                ))}
              </div>
              {onglet === 'toutes' && dansToutes && (
                <div className="trc-bx__puces" role="group" aria-label="Seulement">
                  {(['site', 'entre-deux'] as const).map((f) => (
                    <button key={f} type="button" aria-pressed={filtre === f} className={filtre === f ? 'est-choisi' : ''} onClick={() => choisitLeFiltre(filtre === f ? 'tout' : f)}>
                      {FILTRE_DIT[f]} · {comptes[f]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {onglet === 'regles' && !recherche && regleOuverte ? (
          /* LA RÈGLE OUVERTE : Quand → Alors, ses garde-fous, où elle se règle, et ce qu'elle a fait ce mois-ci. */
          <section className="trc-bx__conv trc-bx__regle-ouverte" aria-label={`La règle : ${regleOuverte.quand}`}>
            {(() => {
              const c = compteDuMois(envoisLus as unknown as EnvoiLu[], regleOuverte.types, moisCourant, branch.id);
              const groupe = GROUPES_DES_AUTOMATISATIONS.find((g) => g.k === regleOuverte.groupe)?.dit ?? '';
              return (
                <div className="trc-bx__regle-corps">
                  <p className="trc-bx__regle-groupe">{groupe}</p>
                  <div className="trc-bx__flux">
                    <div><span>Quand</span><b>{regleOuverte.quand}</b></div>
                    <ArrowRight size={20} aria-hidden="true" className="trc-bx__fleche" />
                    <div><span>Alors</span><b>{regleOuverte.quoi}</b></div>
                  </div>
                  <div>
                    <p className="trc-bx__regle-groupe">Les garde-fous</p>
                    <ul className="trc-bx__gardes">{gardesDeLaRegle(regleOuverte).map((g) => <li key={g}>{g}</li>)}</ul>
                  </div>
                  <dl className="trc-bx__chiffres">
                    <div><dt>État</dt><dd>{etatDeLaRegle(regleOuverte)}</dd></div>
                    <div><dt>Ce mois-ci</dt><dd>{regleOuverte.types.length === 0 ? (regleOuverte.pasCompte ?? 'non compté') : `${c.partis} parti${c.partis > 1 ? 's' : ''}${c.aRegarder ? ` · ${c.aRegarder} à regarder` : ''}`}</dd></div>
                    {regleOuverte.modeles.length > 0 && <div><dt>Modèle{regleOuverte.modeles.length > 1 ? 's' : ''} Meta</dt><dd>{regleOuverte.modeles.join(', ')}</dd></div>}
                  </dl>
                  <div className="trc-bx__autres">
                    <Link className="trc-ger__btn" to={regleOuverte.reglage?.vers ?? '/marketing?tab=auto'}>{regleOuverte.reglage ? `Régler dans ${regleOuverte.reglage.dit}` : 'Voir dans Marketing › Automatisations'}</Link>
                    {!PART_TOUT_DE_SUITE.has(regleOuverte.id) && !SANS_LA_SALLE.has(regleOuverte.id) && <button type="button" className="trc-ger__btn" onClick={() => ouvreLOutil('envois')}>Voir ce qui part</button>}
                  </div>
                </div>
              );
            })()}
          </section>
        ) : boite ? conversation(boite) : !etroit ? (
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
              <h3>Ce qui part <span>les envois retenus et le journal</span></h3>
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
