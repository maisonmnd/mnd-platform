import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, toast } from '../../../../ds/components';
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
  FILTRES_DE_LA_BOITE, FILTRE_DIT, boitesDeLaMaison, boitesDuFiltre, comptesDesFiltres, heureACotonou, repondusSousUneHeure,
  reponsesGratuitesRestantes, type AuteurDeBulle, type Boite, type Bulle, type EnvoiDeLaBoite, type FiltreDeLaBoite, type SourceDeBulle,
} from '../../../../shared/boite-unique-pur';
import { ClientPicker, RdvModal, useBranchAppointments, useBranchClients, type RdvInitial } from './_shared';
import { ComposeurWhatsApp, type PoigneeDuComposeur } from './ComposeurWhatsApp';
import { PieceDuFil, attache } from './Conversations';
import { CaptureLue } from './CaptureLue';
import { LeSouci } from './EntreDeuxSeances';
import { convertir } from './Demandes';
import { ficheConnueDe, ouvreLaFiche } from './Discussions';
import ReponsesDeLaMaison, { useCompteDesReponses } from './ReponsesDeLaMaison';
import { EnvoisAutomatiques } from './EnvoisAutomatiques';
import type { PropsDUneVue } from './Gerard';
import './clients.css';

/* ══ LES CONVERSATIONS, VUE DE L'ASSISTANT MAISON · 27 octobre 2026, lot 3 ══
   Spécification `docs/spec-assistant-maison.md` §5.2, maquette validée
   `public/maquette-assistant-maison.html` (vue 2). UNE BOÎTE PAR PERSONNE :
   ses fils WhatsApp, le chat du site, ses demandes et vocaux, ses appels,
   ses soucis d'Entre deux séances, et tout ce que la Maison lui a écrit,
   fusionnés dans l'ordre du temps par `shared/boite-unique-pur`.

   UN SEUL JUGE « attend une réponse » (celui des fils, `Fil.attendUneReponse`,
   composé avec ceux des autres pièces par le pur), UNE SEULE SONNERIE (celle
   des Conversations, montée ici une fois, étendue au chat, aux demandes et
   aux soucis Santé sous les mêmes quatre règles). Le composeur est celui des
   Conversations d'avant, extrait tel quel (`ComposeurWhatsApp`) : la retenue
   de huit secondes, la fenêtre de 24 heures, les dix gestes.

   L'ÉCRAN EST UNE LISTE REPLIÉE : trois tuiles, quatre filtres, une ligne par
   personne (avatar à initiales, puces de canal, son dernier mot et depuis
   quand, à droite qui a la main et son prochain RDV avec l'année), UN panneau
   ouvert à la fois. Au téléphone (900 px et moins) : la liste, ses tuiles
   repliées en une ligne chiffrée, OU la boîte ouverte qui couvre l'écran
   (tête, bulles, fiche et gestes repliés, composeur sous le pouce), jamais
   les deux empilées (banc du téléphone, 27 octobre 2026). Le cerveau de
   l'Assistant arrive en props : « Ce qu'il retient d'elle » lit sa fiche
   (`FicheDeGerard`), jamais un second calcul. */

const SOURCE_DITE: Record<SourceDeBulle, string> = {
  whatsapp: 'WhatsApp', chat: 'chat du site', demande: 'site', vocal: 'vocal du site', appel: 'appel', couronne: 'Ma Couronne', comptoir: 'comptoir',
};
const TON_DE_LA_SOURCE: Record<SourceDeBulle, 'cuivre' | 'indigo'> = {
  whatsapp: 'cuivre', chat: 'indigo', demande: 'indigo', vocal: 'indigo', appel: 'indigo', couronne: 'indigo', comptoir: 'indigo',
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
const court = (t: string, n = 64): string => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
/** Un numéro de téléphone dans ses mots ne se montre pas (« Ce qu'elles disent », sans nom ni numéro). */
const sansNumero = (t: string): string => t.replace(/\+?\d[\d\s.-]{6,}\d/g, '…');

/** Le téléphone : jusqu'à 900 px la liste OU le panneau, jamais les deux. Le
    seuil est celui de l'ancien écran (une colonne sous 900 px) : un téléphone
    couché fait 844 px, une tablette debout 820, et c'est dans cette bande que
    la liste et le fil s'empilaient le 13 octobre 2026 (banc du téléphone). */
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

/** Les six lignes chiffrées de « Ce qu'il retient d'elle ». */
type Retenu = { cle: string; valeur: string; alarme?: boolean };

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
    return FILTRES_DE_LA_BOITE.includes(f as FiltreDeLaBoite) ? (f as FiltreDeLaBoite) : 'attend';
  });
  /* UN PANNEAU OUVERT À LA FOIS : la clé de la boîte. */
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [texte, setTexte] = useState('');
  const [cite, setCite] = useState<MessageWa | null>(null);
  const [plusOuvert, setPlusOuvert] = useState(false);
  const [souciOuvert, setSouciOuvert] = useState<string | null>(null);
  const [rattacher, setRattacher] = useState<Boite | null>(null);
  const [rdvPour, setRdvPour] = useState<RdvInitial | null>(null);
  const [brouillonDuChat, setBrouillonDuChat] = useState('');
  const [chatEnVol, setChatEnVol] = useState(false);
  const [envoisOuverts, setEnvoisOuverts] = useState(() => params.get('envois') === '1');
  const [reponsesOuvertes, setReponsesOuvertes] = useState(() => params.get('reponses') === '1');
  const poignee = useRef<PoigneeDuComposeur | null>(null);
  /* La rangée de la boîte ouverte : au téléphone, elle couvre l'écran et lit la hauteur que le clavier laisse. */
  const rangeeOuverte = useRef<HTMLLIElement | null>(null);
  /* Les bulles de la boîte ouverte : on les ouvre sur le dernier mot. */
  const filOuvert = useRef<HTMLDivElement | null>(null);
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
  const fils = useMemo(() => {
    const vus = tous.filter((f) => f.tiroir === 'clientes' && !estArchive(f, archives) && (!f.prive || f.numero === nDemande));
    if (nDemande && !tous.some((f) => f.numero === nDemande)) {
      const neuf = filNeuf(nDemande, teteDuNumero(nDemande, tetes));
      if (neuf && !estReserve(neuf.tiroir)) vus.push(neuf);
    }
    return vus;
  }, [tous, archives, nDemande, tetes]);
  const envoisLus = envois as unknown as EnvoiDeLaBoite[];
  const entreeDesBoites = useMemo(() => ({
    fils, discussions, demandes, appelsWa, appels, signalements, envois: envoisLus, clientes: clients, maintenant: tick, branchId: branch.id, tiroirs: ['clientes'] as const,
  }), [fils, discussions, demandes, appelsWa, appels, signalements, envoisLus, clients, tick, branch.id]);
  const boitesBrutes = useMemo(() => boitesDeLaMaison(entreeDesBoites), [entreeDesBoites]);

  /* LA BOÎTE QU'UN LIEN DÉSIGNE : `?n=` (un numéro), `?c=` (une fiche), `?d=` (une discussion). */
  const cDemande = params.get('c');
  const dDemande = params.get('d');
  const cleDemandee = useMemo(() => {
    if (cDemande) return boitesBrutes.find((b) => b.clientId === cDemande)?.cle ?? null;
    if (nDemande) return boitesBrutes.find((b) => b.numero === nDemande || b.fils.some((f) => f.numero === nDemande))?.cle ?? null;
    if (dDemande) return boitesBrutes.find((b) => b.discussions.some((d) => d.id === dDemande))?.cle ?? null;
    return null;
  }, [boitesBrutes, cDemande, nDemande, dDemande]);
  useEffect(() => {
    if (!cleDemandee) return;
    setOuverte(cleDemandee);
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
  const visibles = useMemo(() => boitesDuFiltre(boites, filtre), [boites, filtre]);
  const boite = boites.find((b) => b.cle === ouverte) ?? null;
  /* Au téléphone, une boîte ouverte prend tout l'écran : la liste s'efface derrière elle. */
  const ouvertEtroit = etroit && !!boite;

  /* LES TROIS TUILES : qui attend (dont Santé, dont la fenêtre qui ferme sous
     une heure), répondues sous 1 h aujourd'hui (le jour de Cotonou, par une
     main humaine seulement), réponses gratuites restantes ce mois. */
  const attendent = useMemo(() => {
    const qui = boites.filter((b) => b.attendUneReponse);
    return { total: qui.length, sante: qui.filter((b) => b.sante).length, fenetre: qui.filter((b) => b.fenetreFermeBientot).length };
  }, [boites]);
  const nowIso = new Date(tick).toISOString();
  const jourDeCotonou = jourACotonou(nowIso);
  const repondues = useMemo(() => repondusSousUneHeure(messages, jourDeCotonou, tick), [messages, jourDeCotonou, tick]);
  const gratuites = useMemo(() => reponsesGratuitesRestantes(messages, jourDeCotonou.slice(0, 7), branch.id), [messages, jourDeCotonou, branch.id]);

  /* CE QU'IL RETIENT D'ELLE lit la fiche de l'Assistant (une seule lecture par écran). */
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
  /* Un panneau qui change referme « Plus », le souci et le brouillon du chat. */
  useEffect(() => { setPlusOuvert(false); setSouciOuvert(null); setBrouillonDuChat(''); setCite(null); setBulleTouchee(null); }, [ouverte]);
  /* AU TÉLÉPHONE, LA BOÎTE OUVERTE COUVRE L'ÉCRAN (27 octobre 2026, banc du
     téléphone). Jusqu'à 900 px, la rangée ouverte sort de la liste et prend
     tout l'écran (`trc-am__plein`, assistant-maison.css), comme le fil des
     Conversations d'avant depuis le 2 octobre 2026 : la tête en haut, les
     bulles qui défilent seules, la saisie sous le pouce. Elle prend la hauteur
     que le CLAVIER laisse : `visualViewport` la donne, la feuille la lit
     (`--vv-h`, `--vv-top`). On n'amène plus la rangée à l'écran par
     scrollIntoView : sous les tuiles et les filtres, « Envoyer » finissait à
     850 px d'un écran de 844 (debout) et à 478 px d'un écran de 390 (couché).
     La promesse du 21 septembre, du 28 et du 2 octobre : le fil et sa saisie
     tiennent dans l'écran, « Envoyer » aussi. */
  useEffect(() => {
    const el = rangeeOuverte.current;
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
  };
  const choisitLeFiltre = (f: FiltreDeLaBoite) => {
    setFiltre(f);
    const suivants = new URLSearchParams(params);
    if (f === 'attend') suivants.delete('filtre'); else suivants.set('filtre', f);
    setParams(suivants, { replace: true });
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

  /** Les six lignes de « Ce qu'il retient d'elle », chiffrées, avec l'année. */
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

  /* Au téléphone, la boîte ouverte est la seule rangée (elle couvre l'écran), même si elle vient de quitter le filtre. */
  const lignes = ouvertEtroit ? (boite ? [boite] : []) : visibles;

  /* LES TROIS TUILES : qui attend (terre), répondues sous 1 h (vert), gratuites restantes (vert). */
  const tuiles = (
    <div className="trc-am__tuiles">
      <div className={`trc-am__tuile trc-am__tuile--terre${attendent.sante ? ' est-alarme' : ''}`}>
        <b>{attendent.total}</b>
        <span>attendent une réponse · Santé {attendent.sante}{attendent.fenetre ? ` · fenêtre qui ferme sous 1 h ${attendent.fenetre}` : ''}</span>
      </div>
      <div className="trc-am__tuile trc-am__tuile--vert">
        <b>{repondues.repondues} <small>/ {repondues.questions}</small></b>
        <span>répondues sous 1 h aujourd’hui{repondues.enCours ? ` · ${repondues.enCours} en cours` : ''}</span>
      </div>
      <div className="trc-am__tuile trc-am__tuile--vert">
        <b>{gratuites.restantes.toLocaleString('fr-FR')}</b>
        <span>réponses gratuites restantes ce mois · {gratuites.utilisees} sur {gratuites.plafond.toLocaleString('fr-FR')} utilisées</span>
        <div className="trc-am__barre" aria-hidden="true"><i style={{ width: `${Math.round((gratuites.restantes / gratuites.plafond) * 100)}%` }} /></div>
      </div>
    </div>
  );

  return (
    <>
      {/* Au téléphone (27 octobre 2026, banc du téléphone), les tuiles se replient en une ligne chiffrée : la première
          boîte de la liste naissait à 911 px d'un écran de 844. Le résumé sur la ligne, les tuiles dessous à la demande. */}
      {etroit ? (
        <details className="trc-am__repli trc-am__chiffres">
          <summary>
            <span className="trc-am__resume">
              <b>{attendent.total}</b> attend{attendent.total > 1 ? 'ent' : ''} · Santé {attendent.sante} · <b>{repondues.repondues}</b> / {repondues.questions} sous 1 h · <b>{gratuites.restantes.toLocaleString('fr-FR')}</b> gratuites
            </span>
          </summary>
          {tuiles}
        </details>
      ) : tuiles}

      {/* UNE BOÎTE PAR PERSONNE : quatre filtres, une ligne par personne, un panneau ouvert. */}
      <section className="trc-ger__carte trc-am__boites">
        <div className="trc-ger__haut">
          <h3>Une boîte par personne <span>WhatsApp, chat du site, demandes, appels, soucis</span></h3>
          <span className="trc-am__resume"><b>{comptes.tout}</b> personne{comptes.tout > 1 ? 's' : ''} · {comptes.attend} attend{comptes.attend > 1 ? 'ent' : ''} · site {comptes.site} · soucis {comptes['entre-deux']}</span>
        </div>
        {/* Les filtres : en classe, pas en style inline (un `flexWrap` inline est inatteignable par la feuille du téléphone). */}
        <div className="trc-tabs trc-am__filtres" role="group" aria-label="Filtres">
          {FILTRES_DE_LA_BOITE.map((f) => (
            <button key={f} type="button" className={`trc-tab${filtre === f ? ' is-active' : ''}`} aria-pressed={filtre === f} onClick={() => choisitLeFiltre(f)}>
              {FILTRE_DIT[f]} · {comptes[f]}
            </button>
          ))}
        </div>
        {visibles.length === 0 && (
          <p className="trc-ger__vide">{filtre === 'attend' ? 'Personne n’attend de réponse : chaque fil, chaque demande et chaque souci a sa suite.' : 'Aucune boîte ici.'}</p>
        )}
        <ul className="trc-ger__liste">
          {lignes.map((b) => {
            const ouvert = boite?.cle === b.cle;
            const f = b.clientId ? ficheDe.get(b.clientId) : undefined;
            const dernier = b.derniereDElle ?? b.derniere;
            const mot = dernier ? (dernier.texte.trim() || (dernier.source === 'chat' ? 'discussion du site' : SOURCE_DITE[dernier.source])) : 'rien encore';
            const ton = b.sante ? 'terre' : b.fil ? 'cuivre' : 'indigo';
            const prochain = (f?.rdvs ?? []).filter((r) => r.date >= cerveau.ctx.aujourdhui && r.status !== 'annulé' && !r.venu).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time))[0];
            const tel = lienTel(b.numero ?? cerveau.clientDe(b.clientId ?? '')?.phone);
            const messagesParId = ouvert ? new Map(b.fils.flatMap((x) => x.messages).map((m) => [m.id, m])) : null;
            const demandeATraiter = b.demandes.find((d) => dansLeFiltre(d, 'a-traiter'));
            const discussion = b.discussions[0];
            const souciAClore = b.soucisOuverts.find((s) => s.id === souciOuvert);
            const resteDu = f?.resteDu ?? 0;
            /* LA LIGNE : avatar, nom et puces, son dernier mot, qui a la main et son prochain RDV.
               Au téléphone, c'est aussi la tête de la boîte ouverte (compactée par `trc-am__tete`). */
            const ligne = (
              <button type="button" className={`trc-ger__ligne trc-am__attente${b.enRetard ? ' est-en-retard' : ''}`} aria-expanded={ouvert} onClick={() => ouvre(ouvert ? null : b)}>
                <span className={`trc-am__avatar trc-am__avatar--${ton}`} aria-hidden="true">{b.initiales}</span>
                <span className="trc-am__qui">
                  <b>
                    {b.nom}
                    {b.sante && <em className="trc-am__puce trc-am__puce--terre">Santé</em>}
                    {b.niveauDuSouci === 'voir' && <em className="trc-am__puce trc-am__puce--cuivre">À voir</em>}
                    {b.canaux.map((c) => <em key={c} className={`trc-am__puce trc-am__puce--${TON_DE_LA_SOURCE[c]}`}>{SOURCE_DITE[c]}</em>)}
                    {b.fil?.automate?.tenue === 'tenu' && <em className="trc-am__puce">automate</em>}
                    {b.fil?.prive && <em className="trc-am__puce">privé</em>}
                  </b>
                  <span>« {court(mot)} »{b.depuisMs !== undefined ? ` · ${depuisDit(b.depuisMs)}` : ''}</span>
                </span>
                <span className="trc-am__gestes">
                  <span className="trc-am__droite">
                    <b className={b.attendUneReponse ? 'trc-am__alarme' : ''} style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, whiteSpace: 'normal', textAlign: 'right', maxWidth: 280, color: b.attendUneReponse ? undefined : 'var(--ink-soft)' }}>{b.quiALaMain}</b>
                    <small>
                      {resteDu > 0 ? <i className="trc-am__alarme">{enFrancs(resteDu)} dus</i> : null}
                      {resteDu > 0 && prochain ? ' · ' : ''}
                      {prochain ? `RDV ${jourDit(prochain.date)}` : ''}
                    </small>
                  </span>
                </span>
              </button>
            );
            /* CE QU'IL RETIENT D'ELLE ET LES GESTES : un panneau à deux colonnes sur un grand écran,
               un repli dans la boîte au téléphone (le résumé chiffré sur la ligne, le détail à la demande). */
            const fiche = ouvert ? (
              <>
                {/* CE QU'IL RETIENT D'ELLE : six lignes chiffrées, lues sur sa fiche de l'Assistant. */}
                <div className="trc-ger__pourquoi">
                  <h4 className="trc-am__sous">Ce qu’il retient d’elle <span>{b.clientId ? 'lu sur sa fiche' : 'sans fiche'}</span></h4>
                  {b.clientId ? (
                    <ul className="trc-am__puces">
                      {retenu(b).map((l) => <li key={l.cle}><span className="trc-am__cle">{l.cle}</span> <span className={l.alarme ? 'trc-am__alarme' : ''}>{l.valeur}</span></li>)}
                    </ul>
                  ) : <p className="trc-ger__doux">Aucune fiche ne porte ce numéro : rattachez-le, ou faites-en une cliente, et l’Assistant la lira.</p>}
                </div>
                {/* LES GESTES : les trois qui servent, puis « Plus ». */}
                <div className="trc-ger__pourquoi">
                  <h4 className="trc-am__sous">Les gestes <span>{b.quiALaMain}</span></h4>
                  <div className="trc-am__gestes">
                    {tel && <a className={`trc-ger__btn${b.sante ? ' trc-ger__btn--alarme' : ''}`} href={tel}>Appeler</a>}
                    {b.soucisOuverts.length > 0 && !souciAClore && (
                      <button type="button" className="trc-ger__btn" onClick={() => setSouciOuvert(b.soucisOuverts[0].id)}>Noter et clore</button>
                    )}
                    <button type="button" className="trc-ger__btn" onClick={() => {
                      if (b.fil && poignee.current) { poignee.current.poseUnRendezVous(false); return; }
                      const d = demandeATraiter;
                      setRdvPour({ clientId: b.clientId, ...(d?.serviceIds?.length ? { serviceIds: [...d.serviceIds] } : {}), ...(d?.date ? { date: d.date } : {}), ...(d?.time ? { time: d.time } : {}) });
                    }}>Poser le RDV</button>
                    {b.clientId
                      ? <Link className="trc-ger__btn" to={`/customers?id=${b.clientId}`}>Ouvrir sa fiche</Link>
                      : demandeATraiter
                        ? <button type="button" className="trc-ger__btn trc-ger__btn--cuivre" onClick={() => convertir(demandeATraiter, navigate)}>En faire une cliente</button>
                        : discussion
                          ? <button type="button" className="trc-ger__btn trc-ger__btn--cuivre" onClick={() => ouvreLaFiche(discussion, ficheConnueDe(discussion), navigate)}>En faire une cliente</button>
                          : b.fil ? <button type="button" className="trc-ger__btn" onClick={() => setRattacher(b)}>Rattacher à une fiche</button> : null}
                    <button type="button" className="trc-ger__btn trc-am__btn--calme" aria-expanded={plusOuvert} onClick={() => setPlusOuvert((v) => !v)}>{plusOuvert ? 'Moins' : 'Plus'}</button>
                  </div>
                  {plusOuvert && (
                    <div className="trc-am__gestes">
                      {b.soucisOuverts.length > 0 && <button type="button" className="trc-ger__btn" onClick={() => proposeDAvancer(b)}>Proposer d’avancer</button>}
                      {b.clientId && <Link className="trc-ger__btn" to="/gerard?vue=offres">Remise à son nom</Link>}
                      {b.numero && (
                        <a className="trc-ger__btn" href={lienWaMe(b.numero, texte) ?? '#'} target="_blank" rel="noreferrer" onClick={() => poignee.current?.prendsLaMain('whatsapp')}
                          title="Continuer dans l’application WhatsApp. Ce qui s’y écrit n’entre pas dans le fil de la Maison.">Continuer dans WhatsApp</a>
                      )}
                      {demandeATraiter && demandeATraiter.statut === 'nouvelle' && (
                        <button type="button" className="trc-ger__btn" onClick={() => { poseLaDemande(demandeATraiter, { statut: 'rappelee', rappeleeLe: new Date().toISOString() }); toast('Demande notée rappelée.'); }}>Demande rappelée</button>
                      )}
                      {demandeATraiter && (
                        <button type="button" className="trc-ger__btn" onClick={() => { poseLaDemande(demandeATraiter, { statut: 'traitee' }); toast('Demande traitée : elle quitte « À traiter ».'); }}>Demande traitée</button>
                      )}
                      {b.appels.filter((a) => !a.fait).map((a) => (
                        <button key={a.id} type="button" className="trc-ger__btn" onClick={() => { marquerAppelFait(a.id); toast('Appel noté fait.'); }}>Appel rappelé</button>
                      ))}
                      {discussion && discussion.etat !== 'close' && (
                        <button type="button" className="trc-ger__btn" onClick={() => void changeLEtat(discussion.id, 'close').then((motif) => { if (motif) toast(motif); else toast('Discussion close.'); })}>Clore le chat</button>
                      )}
                      {b.fil && estDirection && b.fil.messages.length > 0 && (
                        <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => basculeLArchive(b.fil!)}>{estArchive(b.fil, archives) ? 'Désarchiver' : 'Archiver'}</button>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : null;
            return (
              <li key={b.cle} ref={ouvert ? rangeeOuverte : undefined} className={`trc-ger__rangee${ouvert ? ' est-ouverte' : ''}${ouvert && etroit ? ' trc-am__plein' : ''}`}>
                {/* AU TÉLÉPHONE, LA BOÎTE OUVERTE COUVRE L'ÉCRAN (`trc-am__plein`) : la tête porte le retour à la liste. */}
                {ouvert && etroit ? (
                  <div className="trc-am__tete">
                    <button type="button" className="trc-am__retour" onClick={() => ouvre(null)} aria-label="Revenir à la liste des conversations">←</button>
                    {ligne}
                  </div>
                ) : ligne}
                {ouvert && (
                  <div className="trc-am__corps">
                    {/* LE FIL FUSIONNÉ, dans l'ordre du temps : chaque bulle dit sa source et son auteur ; ce qui est parti seul se grise.
                        Sur un grand écran il se borne à 52vh ; au téléphone c'est la feuille qui lui donne la hauteur qui reste. */}
                    <div ref={filOuvert} className="trc-bulles" style={etroit ? undefined : { maxHeight: '52vh' }}>
                      {b.bulles.length === 0 && <span className="trc-jour">Elle ne vous a jamais écrit, et rien n’est parti vers elle</span>}
                      {b.bulles.map((x: Bulle, i) => {
                        const jourX = jourACotonou(x.quand);
                        const nouveauJour = i === 0 || jourACotonou(b.bulles[i - 1].quand) !== jourX;
                        const m = x.de.table === 'messages_wa' ? messagesParId?.get(x.de.id) : undefined;
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
                                {m && b.fil?.fenetre.ouverte && m.waId && (
                                  <span className="trc-b__gestes">
                                    <button type="button" onClick={() => setCite(m)}>Répondre</button>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {etroit ? (
                      <details className="trc-am__repli trc-am__fiche">
                        <summary>
                          <h4 className="trc-am__sous">Sa fiche et les gestes</h4>
                          <span className="trc-am__resume">{b.quiALaMain}{prochain ? ` · RDV ${jourDit(prochain.date)}` : ''}{resteDu > 0 ? ` · ${enFrancs(resteDu)} dus` : ''}</span>
                        </summary>
                        <div className="trc-am__fiche-corps">{fiche}</div>
                      </details>
                    ) : (
                      <div className="trc-ger__panneau" style={{ padding: 0 }}>{fiche}</div>
                    )}

                    {/* LE SOUCI OUVERT, à noter et clore (l'écran d'Entre deux séances, tel quel). */}
                    {souciAClore && (
                      <div className="trc-am__souci">
                        <LeSouci s={souciAClore} client={cerveau.clientDe(souciAClore.clientId)} appts={appts} moi={moi?.name ?? ''} onClose={() => setSouciOuvert(null)} />
                      </div>
                    )}

                    {/* LE COMPOSEUR WHATSAPP (la fenêtre de 24 h, la retenue, les dix gestes), ou la réponse au chat du site.
                        Au téléphone, la feuille le colle en bas de la boîte, borné, « Envoyer » dedans. */}
                    {b.fil ? (
                      <div className="trc-convs__fil" style={{ minHeight: 0 }}>
                        <ComposeurWhatsApp fil={b.fil} texte={texte} surTexte={setTexte} cite={cite} surCite={setCite} poignee={poignee} />
                      </div>
                    ) : b.discussionId && discussion && discussion.etat !== 'close' && moi ? (
                      <form className="trc-saisie" style={{ border: '1px solid var(--hairline)', borderRadius: 3, display: 'grid', gap: 8 }} onSubmit={(e) => { e.preventDefault(); void repondSurLeChat(b); }}>
                        <span className="trc-sub" style={{ fontSize: 12 }}>Répondre sur le chat du site, au nom de la Maison (jamais d’un prénom).</span>
                        <textarea className="mnd-input" rows={2} value={brouillonDuChat} placeholder="Répondre au nom de la Maison" onChange={(e) => setBrouillonDuChat(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void repondSurLeChat(b); } }} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <Button type="submit" variant="copper" size="sm" disabled={chatEnVol || !brouillonDuChat.trim()}>{chatEnVol ? 'Envoi…' : 'Répondre sur le chat'}</Button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="trc-ger__deux trc-am__deux">
        {/* CE QUE LA MAISON RÉPOND : une seule liste, 13 + 8, « n validées sur 21 » ; la direction valide. */}
        <details className="trc-ger__carte trc-am__repli" open={reponsesOuvertes} onToggle={(e) => setReponsesOuvertes(e.currentTarget.open)}>
          <summary>
            <h3>Ce que la Maison répond <span>une seule bibliothèque</span></h3>
            <span className="trc-am__resume"><b>{compteDesReponses.validees}</b> validée{compteDesReponses.validees > 1 ? 's' : ''} sur {compteDesReponses.total} · conseil {compteDesReponses.conseil.validees} / {compteDesReponses.conseil.total} · soucis {compteDesReponses.soucis.validees} / {compteDesReponses.soucis.total}</span>
          </summary>
          {reponsesOuvertes && (
            <ReponsesDeLaMaison onOuvrirLeFil={(numero) => { const n = numeroWa(numero); const b = n ? boites.find((x) => x.numero === n || x.fils.some((f) => f.numero === n)) : undefined; if (b) ouvre(b); else if (n) { const suivants = new URLSearchParams(params); suivants.set('n', n); setParams(suivants, { replace: true }); } }} />
          )}
        </details>
        {/* CE QU'ELLES DISENT : leurs mots des 60 derniers jours, sans nom ni numéro. */}
        <section className="trc-ger__carte">
          <h3>Ce qu’elles disent <span>{JOURS_DE_LEURS_MOTS} derniers jours, sans nom ni numéro</span></h3>
          {leursMots.length === 0
            ? <p className="trc-ger__doux">Aucun mot de cliente sur WhatsApp ces {JOURS_DE_LEURS_MOTS} derniers jours.</p>
            : <p className="trc-ger__doux" style={{ fontSize: 13.5, color: 'var(--ink)' }}>{leursMots.map((m) => `« ${m.texte} »`).join(' · ')}</p>}
        </section>
      </div>

      {/* CE QUI PART : le journal des envois et la salle d'attente, repliés ; `?envois=1` l'ouvre (la pastille de la salle, le Marketing). */}
      <details className="trc-ger__carte trc-am__repli" open={envoisOuverts} onToggle={(e) => setEnvoisOuverts(e.currentTarget.open)}>
        <summary>
          <h3>Ce qui part <span>la salle d’attente et le journal</span></h3>
          <span className="trc-am__resume">envois automatiques, tous types</span>
        </summary>
        {envoisOuverts && (
          <EnvoisAutomatiques typeInitial={params.get('type')} onOuvrirLeFil={(numero) => { const n = numeroWa(numero); const b = n ? boites.find((x) => x.numero === n || x.fils.some((f) => f.numero === n)) : undefined; if (b) ouvre(b); else if (n) { const suivants = new URLSearchParams(params); suivants.set('n', n); setParams(suivants, { replace: true }); } }} />
        )}
      </details>

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
   · « Proposer d'avancer » passe encore par la zone de saisie ou wa.me, pas par
     une ligne `envois` en salle d'attente ;
   · « Encaisser » et « Son bilan » sont les gestes de la barre du composeur
     (lien MoMo, texte du bilan), pas un lien KkiaPay dédié ;
   · la réécriture d'un message parti et les réactions restent dans les
     Conversations d'avant (`/conversations?ancien=1`). */
