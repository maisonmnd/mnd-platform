import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHead, WaGlyph } from '../_ui';
import { Button, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useAuth, useStaff } from '../../../../shared/auth';
import { supabase } from '../../../../shared/supabase';
import { clientsStore, useClients } from '../../../../shared/clients';
import {
  useMessagesWa, useFilsPrives, basculeLeSecret, filsDeLaMaison, resteEnClair,
  pourquoiLEnvoiEstImpossible, numeroWa, messagesWaStore, type Fil,
  delaiDeRetenue, resteDeLaRetenue, pourquoiOnNeReecritPas, texteDeLaCorrection,
  messagesQuiSonnent, messageCite, filNeuf, lienWaMe, compteDesModeles, type MessageWa,
  laFenetreSePaie, REPONSES_GRATUITES_DU_MOIS,
  useFilsArchives, estArchive, archiveLeFil, desarchiveLeFil,
  tetesDeLaMaison, teteDuNumero, estReserve, TIROIRS, TIROIR_DIT, type Tiroir, type PieceRecue,
} from '../../../../shared/conversations';
import { motifDuRefus, adresseDeLaPieceRecue } from '../../../../shared/whatsapp';
import { useProviders } from '../../../../shared/prestataires';
import { useFournisseurs } from '../../../../shared/stock';
import { useEngagements } from '../../../../shared/engagements';
import { armeLaSonnette, sonne, cestLaNuit } from '../../../../shared/sonnette';
import { adresseDesFonctions, cleAnonyme } from '../../../../shared/supabase';
import { useSettings } from '../../../../shared/settings';
import { useStaff as useEquipe, useEnvois } from '../equipe/data';
import { EnvoisAutomatiques } from './EnvoisAutomatiques';
import { compteDuJournal, envoisDeLaPeriode, jourDuSalon, estEnvoiAutomatique, modeleDit } from '../../../../shared/envois';
import { heuresDuJour } from './_heures';
import { ClientPicker } from './_shared';
import { useEstDirection } from '../_vie';
import {
  useGestesDuFil, BarreDesGestes, ChoisirUnFichier, PanneauDeLaPromo,
  type PieceRendue, type Geste,
} from './_gestes';
import './clients.css';

/* ═══════════════════════════════════════════════════════════════════
   LES CONVERSATIONS — maquette `public/maquette-les-conversations.html`,
   validée le 11 septembre 2026.

   « Comment je réussis à construire les conversations WhatsApp dans le
   trône ? » (Yéman).

   LE TRÔNE PARLAIT SANS ENTENDRE. Trois modèles partaient seuls, la cloche
   ouvrait des brouillons, et rien ne revenait : ce qu'une cliente répondait
   vivait dans un téléphone, pas dans la Maison.

   LA FENÊTRE DE 24 HEURES DESSINE CET ÉCRAN, et rien d'autre. On écrit
   librement pendant les 24 heures qui suivent SON dernier message ; passé ce
   délai, Meta n'accepte plus qu'un modèle approuvé. C'est ce qui fait rater
   la plupart des boîtes WhatsApp : on tape un texte, on appuie, et ça échoue
   avec une erreur illisible. L'écran porte donc la règle lui-même, et la
   zone de saisie se ferme AVANT qu'on ait tapé, plutôt qu'après.
   ═══════════════════════════════════════════════════════════════════ */

/** Les trois modèles approuvés de la Maison. Ce sont les seules phrases que
    WhatsApp accepte hors fenêtre, et chacune rouvre une conversation que Meta
    facture : l'écran le dit, il ne le cache pas. */
const MODELES = [
  { nom: 'rappel_rdv', dit: 'Rappel de rendez-vous', variables: 2 },
  { nom: 'confirmation_rdv', dit: 'Confirmation de rendez-vous', variables: 2 },
  { nom: 'avis_google', dit: 'Demande d’avis Google', variables: 1 },
] as const;

const heure = (iso: string) => {
  const d = new Date(iso);
  return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
};
const jour = (iso: string) => {
  const d = new Date(iso);
  const auj = new Date();
  const memeJour = d.toDateString() === auj.toDateString();
  if (memeJour) return 'Aujourd’hui';
  const hier = new Date(auj.getTime() - 86_400_000);
  if (d.toDateString() === hier.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' });
};

const initiales = (nom: string) =>
  nom.split(/\s+/).map((m) => m.charAt(0)).slice(0, 2).join('').toUpperCase() || '·';

/* `motifDuRefus` vit dans `shared/whatsapp` depuis le 15 septembre 2026 : la
   Paie, Temps & absences et les Engagements envoient aussi, et lisent le même
   refus. */

/* ══ UNE PIÈCE REÇUE, DANS LE FIL — 15 septembre 2026 ═══════════════
   Le fil écrivait « une photo » et le fichier se perdait chez Meta. Le
   webhook le range désormais dans le coffre (0102) ; ici on le montre, par
   une adresse signée qui vaut une heure et que la base refuse à qui n'a pas
   le droit de lire. Une image se voit, un vocal s'écoute, le reste s'ouvre. */
function PieceDuFil({ piece }: { piece: PieceRecue }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    if (!piece.chemin) { setUrl(null); return undefined; }
    void adresseDeLaPieceRecue(piece).then((u) => { if (vivant) setUrl(u); });
    return () => { vivant = false; };
  }, [piece]);
  if (piece.tropLourde) {
    return <span className="trc-b__piece trc-b__piece--mot">{piece.nom} · trop lourde pour être gardée, elle est restée chez Meta.</span>;
  }
  if (!piece.chemin) {
    return <span className="trc-b__piece trc-b__piece--mot">{piece.nom}{piece.octets ? ` · ${Math.round(piece.octets / 1024)} Ko` : ''}</span>;
  }
  if (!url) return <span className="trc-b__piece trc-b__piece--mot">{piece.nom} · chargement…</span>;
  if (piece.type.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="trc-b__piece">
        <img src={url} alt={piece.nom} className="trc-b__img" />
      </a>
    );
  }
  if (piece.type.startsWith('audio/')) {
    return <audio controls src={url} className="trc-b__audio" preload="none" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="trc-b__piece trc-b__piece--doc">
      Ouvrir {piece.nom}
    </a>
  );
}

/* ── LES HEURES DU SALON, POUR CE JOUR-CI ─────────────────────────────
   Elles vivent par jour de semaine (`mnd_salon_hours`) et s'écrivent
   « 09h00 », à la française. La sonnette, elle, compare des « 09:00 » : on
   traduit ici plutôt que d'imposer un format au réglage que la Maison lit
   tous les jours.

   UN JOUR DE FERMETURE EST UNE NUIT ENTIÈRE : le salon n'ouvre pas, donc la
   sonnette se tait. Une tablette oubliée un dimanche ne carillonne pas. */
/* Les heures du salon vivent dans `./_heures` depuis le 18 septembre 2026 :
   l'alarme du tableau de bord se tait la nuit selon la même définition. */

/** LES DEUX RÉACTIONS DE LA MAISON. Le mot est en français sur le bouton ;
    le signe est ce qui part chez Meta, et une réaction EST un signe — c'est
    la seule chose que WhatsApp sache poser sur un message. */
const REACTIONS = [
  { mot: 'Cœur', signe: String.fromCodePoint(0x2764, 0xfe0f) },
  { mot: 'Pouce', signe: String.fromCodePoint(0x1f44d) },
] as const;

/** CE QU'UN MESSAGE RETENU PORTE, le temps de son compte à rebours. */
type Attente = {
  texte: string;
  piece: PieceRendue | null;
  citeWaId?: string;
  modele?: string;
  variables: string[];
  numero: string;
  clientId?: string;
  posteLe: number;
};

export default function Conversations() {
  const navigate = useNavigate();
  const { branch } = useBranch();
  const { session } = useAuth();
  const [clients] = useClients();
  const [messages] = useMessagesWa();
  const [prives] = useFilsPrives();
  const [params, setParams] = useSearchParams();
  /* ══ LES ENVOIS AUTOMATIQUES — 18 septembre 2026 ═══════════════════
     Arbitrage ④ : le journal de ce que la Maison envoie seule vit ICI, à
     côté des fils. Le bouton dit ce qui est à regarder aujourd'hui avant
     qu'on l'ouvre. Les fils restent montés pendant qu'on lit le journal :
     y revenir retrouve la conversation là où on l'avait laissée. */
  const [vue, setVue] = useState<'fils' | 'envois'>('fils');
  const [lesEnvois] = useEnvois();
  const aRegarderAujourdhui = useMemo(() => compteDuJournal(envoisDeLaPeriode(
    lesEnvois.filter((e) => e && e.canal !== 'push'), 'aujourdhui', jourDuSalon(new Date().toISOString()),
  )).aRegarder, [lesEnvois]);
  const [texte, setTexte] = useState('');
  const [envoiEnCours, setEnvoi] = useState(false);
  const [voirPrives, setVoirPrives] = useState(false);
  /* LES FILS ARCHIVÉS — 15 septembre 2026. La vue les retrouve ; la
     direction seule les range et les rend. */
  const [voirArchives, setVoirArchives] = useState(false);
  const [archives, setArchives] = useFilsArchives();
  const quiArchive = useStaff();
  const [rattacher, setRattacher] = useState<Fil | null>(null);
  /* LA PIÈCE EN ATTENTE — choisie, pas encore envoyée. Elle se relit comme
     le texte : on doit pouvoir la retirer avant d'appuyer. */
  const [piece, setPiece] = useState<PieceRendue | null>(null);
  const [promoOuverte, setPromoOuverte] = useState(false);
  const estDirection = useEstDirection();
  const [reglages] = useSettings();
  /* LE MESSAGE RETENU — il paraît dans le fil, mais n'a pas encore quitté la
     Maison. Un seul à la fois : « retenir » n'a de sens que sur le dernier. */
  const [enAttente, setEnAttente] = useState<Attente | null>(null);
  /** Le message qu'on cite en répondant, s'il y en a un. */
  const [cite, setCite] = useState<MessageWa | null>(null);
  /** Le message qu'on est en train de réécrire, et son texte neuf. */
  const [reecrit, setReecrit] = useState<{ m: MessageWa; texte: string } | null>(null);
  /* ── COMMENCER UNE CONVERSATION — 15 septembre 2026 ────────────────
     « Me permettre de commencer une nouvelle discussion WhatsApp » (Yéman).
     Le Trône savait déjà OUVRIR un fil qui n'existe pas (`filNeuf`), mais
     rien ne permettait d'en désigner un : il fallait passer par la fiche
     d'une cliente. */
  const [commencer, setCommencer] = useState(false);
  const [numeroNeuf, setNumeroNeuf] = useState('');
  /* ══ TROIS TIROIRS, UN NUMÉRO — 15 septembre 2026 ═════════════════
     Maquette `public/maquette-lequipe-sur-whatsapp.html`, validée. Clientes,
     Équipe, Prestataires : LA BASE RÉSERVE LES DEUX DERNIERS À LA DIRECTION
     (0102), le personnel ne voit que les clientes, comme avant. L'écran ne
     fait que nommer et ranger ; la porte est en base. */
  const [tiroir, setTiroir] = useState<Tiroir>('clientes');
  const [equipe] = useEquipe();
  const [prestataires] = useProviders();
  const [fournisseurs] = useFournisseurs();
  const [engagements] = useEngagements();

  /* ══ CE QUE LES MODÈLES COÛTENT CE MOIS-CI — 15 septembre 2026 ═════
     « Combien Meta facture une conversation de 24 h ? » (Yéman).

     LE PANNEAU DE LA PROMO NE DISAIT RIEN DU COÛT, alors que c'est justement
     le geste qui envoie des modèles hors fenêtre. Une dépense qu'on ne
     mesure jamais finit par surprendre à la facture.

     ON COMPTE DES MESSAGES, PAS DES FRANCS. La Maison n'a pas les tarifs du
     Bénin, ils bougent, et les inventer mettrait un chiffre faux sous les
     yeux de quelqu'un qui déciderait dessus. */
  /* ── UN MODÈLE SE CONFIRME AVANT DE PARTIR — 15 septembre 2026 ────
     « Si j'appuie un des modèles je dois avoir un message qui m'avertit que
     je vais être facturé » (Yéman).

     ICI, C'EST TOUJOURS VRAI. Les modèles ne paraissent que lorsque la
     fenêtre est FERMÉE — un modèle envoyé dans une fenêtre ouverte serait
     gratuit, mais ce cas-là n'existe pas à cet endroit de l'écran. Chaque
     clic engage donc une dépense, et un geste qui coûte ne doit pas partir
     d'un seul clic. */
  const [modeleAConfirmer, setModeleAConfirmer] = useState<{ nom: string; dit: string } | null>(null);

  const moisCourant = new Date().toISOString().slice(0, 7);
  const modelesDuMois = useMemo(
    () => compteDesModeles(messages, moisCourant, branch.id),
    [messages, moisCourant, branch.id],
  );
  const finDuFil = useRef<HTMLDivElement>(null);

  /* L'HORLOGE BAT, SINON LA FENÊTRE MENT. Un écran ouvert depuis une heure
     afficherait « 23 h restantes » alors qu'il en reste 22 : on relit la
     règle chaque minute plutôt que de laisser la page vieillir. */
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  /* TOUTES LES TÊTES QUE LE NUMÉRO RECONNAÎT, l'équipe d'abord : une employée
     qui est aussi cliente se lit dans Équipe. Même priorité que la base. */
  const tetes = useMemo(
    () => tetesDeLaMaison({ clientes: clients, equipe, prestataires, fournisseurs, engagements }),
    [clients, equipe, prestataires, fournisseurs, engagements],
  );
  const tous = useMemo(
    () => filsDeLaMaison(messages, tetes, prives, tick, branch.id),
    [messages, tetes, prives, tick, branch.id],
  );
  /* « TOUT LE PERSONNEL, SAUF CE QUE JE MARQUE PRIVÉ » (Yéman, 11 septembre).
     Le fil privé se replie, il ne s'efface pas : un bouton le rouvre, et
     l'écran dit franchement que ce n'est pas un coffre. */
  /* L'ARCHIVE NE RETIRE UN FIL QUE DE LA LISTE. `tous` le garde : un lien
     venu des Clientes ou du Carnet doit rouvrir le VRAI fil, avec son
     histoire, et non un fil neuf qui ferait croire qu'elle n'a jamais écrit. */
  /* LE TIROIR OUVERT, ET LUI SEUL. Un compte du personnel ne voit que les
     clientes : la base ne lui livre rien d'autre, et l'écran ne montrerait
     pas non plus un vieux cache. */
  const tiroirVu: Tiroir = estDirection ? tiroir : 'clientes';
  const fils = useMemo(
    () => tous.filter((f) => f.tiroir === tiroirVu
      && (voirPrives || !f.prive)
      && (voirArchives ? estArchive(f, archives) : !estArchive(f, archives))),
    [tous, tiroirVu, voirPrives, voirArchives, archives],
  );
  const nPrives = tous.filter((f) => f.tiroir === tiroirVu && f.prive).length;
  const nArchives = tous.filter((f) => f.tiroir === tiroirVu && estArchive(f, archives)).length;
  /* CE QUI ATTEND, PAR TIROIR — pour que l'onglet le dise avant qu'on l'ouvre. */
  const attendent = useMemo(() => {
    const n: Record<Tiroir, number> = { clientes: 0, equipe: 0, prestataires: 0 };
    for (const f of tous) if (f.attendUneReponse && !estArchive(f, archives)) n[f.tiroir] += 1;
    return n;
  }, [tous, archives]);

  const ouvertNum = params.get('n') ?? '';
  /* ── LE NUMÉRO PEUT VENIR D'AILLEURS — 14 septembre 2026 ──────────
     « Ne sors pas du Trône » (Yéman). Clientes et le Carnet mènent désormais
     ici, et la plupart des têtes n'ont JAMAIS écrit : leur fil n'existe donc
     pas. On en fabrique un vide plutôt que de laisser un écran muet, et il
     dit la vérité — elle ne vous a jamais écrit, seul un modèle ouvre la
     conversation. */
  const filTrouve = tous.find((f) => f.numero === numeroWa(ouvertNum))
    ?? (ouvertNum ? filNeuf(ouvertNum, teteDuNumero(ouvertNum, tetes)) : null);
  /* UN FIL RÉSERVÉ NE S'OUVRE PAS À UN COMPTE DU PERSONNEL, même par un lien :
     la base ne lui en livre pas les messages, et un fil vide ferait croire
     que la personne n'a jamais écrit. On le dit, plutôt que de faire semblant. */
  const filInterdit = !!filTrouve && !estDirection && estReserve(filTrouve.tiroir);
  const fil = filInterdit ? null : filTrouve;
  /* LE TIROIR SUIT LE FIL OUVERT : un lien depuis la Paie ouvre Équipe. */
  useEffect(() => {
    if (fil && estDirection && fil.tiroir !== tiroir) setTiroir(fil.tiroir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fil?.numero]);
  const ouvre = (n: string) => {
    setParams(n ? { n } : {}, { replace: true });
    setTexte('');
  };

  /* ── LE MESSAGE PRÉ-ÉCRIT QUI ARRIVE D'AILLEURS ────────────────────
     Le rappel de la veille, la relance d'un impayé, le mot d'anniversaire :
     ils ouvraient `wa.me` avec leur texte. Ils ouvrent maintenant ce fil, et
     leur texte se pose dans la zone de saisie — à relire, jamais à envoyer
     tout seul.

     ON L'EFFACE DE L'ADRESSE AUSSITÔT. Sans cela, un rafraîchissement le
     reposerait par-dessus ce qu'on est en train d'écrire, et la zone de
     saisie se battrait contre la barre du navigateur. */
  const texteVenu = params.get('t') ?? '';
  useEffect(() => {
    if (!texteVenu) return;
    setTexte(texteVenu);
    const n = params.get('n');
    setParams(n ? { n } : {}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texteVenu]);

  useEffect(() => {
    finDuFil.current?.scrollIntoView({ block: 'end' });
  }, [fil?.numero, fil?.messages.length]);

  /* ── LES DIX GESTES ────────────────────────────────────────────────
     Maquette `public/maquette-la-conversation-outillee.html`, validée le
     14 septembre 2026. Le juge est pur et vit dans `shared/gestes-conversation` :
     ici on ne fait que le nourrir et dessiner ce qu'il rend. */
  const { gestes, codesVivants } = useGestesDuFil(fil
    ? { numero: fil.numero, nom: fil.nom, clientId: fil.clientId, fenetreOuverte: fil.fenetre.ouverte }
    : null);

  /* UNE PIÈCE SEULE EST UN MESSAGE : WhatsApp accepte un fichier sans
     légende, et refuser ici obligerait à écrire « voici » pour rien. */
  const refus = fil
    ? (piece && fil.fenetre.ouverte
      ? null
      : pourquoiLEnvoiEstImpossible({ texte, fenetre: fil.fenetre, numero: fil.numero }))
    : 'Choisissez un fil.';

  /* UN GESTE REMPLIT LA ZONE, IL N'ENVOIE PAS. C'est une main qui relit.
     Ce qu'il AVERTIT se dit tout de suite : un compteur que la cliente
     contestera est pire qu'un silence, et l'écran doit le dire AVANT. */
  const poseLeGeste = (g: Geste) => {
    if (g.eteint) { toast(g.eteint); return; }
    if (g.compose) setTexte(g.compose);
    if (g.avertit) toast(g.avertit);
    if (g.piece && g.piece.quoi !== 'facture' && g.piece.quoi !== 'devis') {
      /* ON NE PROMET PAS UN FICHIER QU'ON N'A PAS. Le bilan vit dans une page
         imprimable, les photos de séance n'ont pas encore de logement : le
         message part seul, et l'écran le dit plutôt que d'annoncer une pièce
         absente. Voir la maquette, « où vivent les photos d'une séance ». */
      toast(`${g.piece.nom} : le texte est prêt, la pièce ne se joint pas encore.`);
    }
  };

  /* ══ LES HUIT SECONDES QUI SAUVENT — 14 septembre 2026 ═══════════════
     « J'aimerais éditer des messages qui sont partis » (Yéman). Un message
     parti ne se modifie pas chez la cliente : le meilleur remède n'est donc
     pas de le corriger, c'est de ne pas l'envoyer. */
  const delaiMs = delaiDeRetenue(reglages.retenueSecondes);

  /* L'HORLOGE DU COMPTE À REBOURS. Elle ne tourne QUE tant qu'un message
     attend : un intervalle qui bat pour rien réveille l'onglet toute la
     journée et vide la batterie de la tablette. */
  const [tacTac, setTacTac] = useState(0);
  useEffect(() => {
    if (!enAttente) return undefined;
    const t = window.setInterval(() => setTacTac((n) => n + 1), 500);
    return () => window.clearInterval(t);
  }, [enAttente]);
  void tacTac;

  const partir = async (a: Attente, enFermant = false) => {
    const corps = {
      numero: a.numero,
      texte: a.modele ? '' : a.texte,
      modele: a.modele ?? '',
      variables: a.variables,
      clientId: a.clientId,
      branchId: branch.id,
      parQui: session?.user?.email ?? undefined,
      ...(a.citeWaId ? { citeWaId: a.citeWaId } : {}),
      /* RIEN DE PUBLIC : les octets traversent la fonction, qui les dépose
         chez Meta. Aucune adresse n'existe, ni chez nous ni ailleurs. */
      ...(a.piece && !a.modele ? { piece: a.piece } : {}),
    };
    /* ── EN FERMANT L'ONGLET, ON PART QUAND MÊME ──────────────────────
       Le navigateur annule les requêtes en vol d'une page qui se ferme ;
       `keepalive` les laisse finir. Un message qu'on croit envoyé et qui
       n'est jamais parti est pire qu'un message qu'on aurait voulu retenir. */
    if (enFermant) {
      const base = adresseDesFonctions;
      const jeton = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!base || !jeton) return;
      void fetch(`${base}/whatsapp-envoi`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${jeton}`,
          ...(cleAnonyme ? { apikey: cleAnonyme } : {}),
        },
        body: JSON.stringify(corps),
      });
      return;
    }
    setEnvoi(true);
    try {
      const { error } = await supabase!.functions.invoke('whatsapp-envoi', { body: corps });
      if (error) throw error;
      toast(a.modele ? `Modèle « ${a.modele} » envoyé.` : 'Message envoyé.');
    } catch (e) {
      toast(`Non envoyé : ${await motifDuRefus(e)}`);
    } finally {
      setEnvoi(false);
    }
  };

  /* LE DÉPART SE DÉCLENCHE AU BOUT DU COMPTE. */
  const attenteEnCours = useRef<Attente | null>(null);
  attenteEnCours.current = enAttente;
  useEffect(() => {
    if (!enAttente) return undefined;
    const t = window.setTimeout(() => {
      setEnAttente(null);
      void partir(enAttente);
    }, Math.max(0, enAttente.posteLe + delaiMs - Date.now()));
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enAttente, delaiMs]);

  /* L'ONGLET QUI SE FERME NE MANGE PAS LE MESSAGE. `pagehide` plutôt que
     `beforeunload` : c'est le seul que les navigateurs mobiles honorent. */
  useEffect(() => {
    const surFermeture = () => {
      const a = attenteEnCours.current;
      if (a) void partir(a, true);
    };
    window.addEventListener('pagehide', surFermeture);
    return () => window.removeEventListener('pagehide', surFermeture);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── L'ENVOI PASSE PAR LA FONCTION, JAMAIS PAR LE NAVIGATEUR ────────
     Le jeton Meta autorise à écrire au nom de la Maison à n'importe quel
     numéro : le poser ici, ce serait le publier. */
  const envoie = async (modele?: string, variables: string[] = []) => {
    if (!fil || envoiEnCours) return;
    if (!modele && refus) { toast(refus); return; }
    /* SANS SUPABASE, RIEN NE PART, et l'écran le dit. La Maison peut tourner
       hors ligne pour lire son carnet ; écrire à une cliente, non. */
    if (!supabase) { toast('Pas de connexion à la Maison : le message n’est pas parti.'); return; }

    /* ON POSTE, ON N'ENVOIE PAS ENCORE. Le message paraît dans le fil tout de
       suite ; il ne quitte la Maison qu'au bout du délai. C'est le seul vrai
       « annuler l'envoi » qui existe, et il ne demande la permission de
       personne — ni celle de Meta, ni celle de la cliente.

       LE MOTIF D'UN REFUS VIT DANS LE CORPS, PAS DANS LE MESSAGE : voir
       `motifDuRefus`, plus haut. C'est `partir` qui le lit désormais. */
    const aPoster: Attente = {
      texte: texte.trim(),
      piece: modele ? null : piece,
      citeWaId: cite?.waId,
      modele,
      variables,
      numero: fil.numero,
      clientId: fil.clientId,
      posteLe: Date.now(),
    };
    setTexte('');
    setPiece(null);
    setCite(null);

    /* UN SEUL MESSAGE RETENU À LA FOIS : le précédent part tout de suite,
       sinon « retenir » ne désignerait plus rien. */
    if (enAttente) void partir(enAttente);
    /* UN MODÈLE NE SE RETIENT PAS. Son texte est fixe et approuvé par Meta :
       il n'y a aucune faute de frappe à rattraper, et la confirmation qui
       vient de l'annoncer a déjà joué ce rôle, mieux. Lui imposer huit
       secondes de plus ferait attendre pour rien. */
    if (modele) { void partir(aPoster); return; }
    if (delaiMs <= 0) { void partir(aPoster); return; }
    setEnAttente(aPoster);
  };

  /* RETENIR — le texte revient dans la zone de saisie, tel quel. */
  const retenir = () => {
    if (!enAttente) return;
    setTexte(enAttente.texte);
    setPiece(enAttente.piece);
    setEnAttente(null);
    toast('Retenu. Il n’est pas parti.');
  };

  /* ══ LA SONNETTE — 14 septembre 2026 ═══════════════════════════════
     « Je voudrais une sonnette quand un nouveau message vient dans le
     Trône » (Yéman). Les quatre pièges sont jugés dans
     `shared/conversations.ts` ; ici on se contente de sonner UNE fois. */
  const vus = useRef<{ ids: string[]; premiere: boolean }>({ ids: [], premiere: true });
  useEffect(() => {
    const sonnants = messagesQuiSonnent({
      avant: vus.current.ids.map((id) => ({ id })),
      apres: messages,
      filOuvert: ouvertNum || undefined,
      premiereLecture: vus.current.premiere,
    });
    vus.current = { ids: messages.map((m) => m.id), premiere: false };
    if (sonnants.length === 0 || reglages.sonnette === false) return;
    /* UNE TABLETTE OUBLIÉE ALLUMÉE NE SONNE PAS À DEUX HEURES DU MATIN. */
    const [ouvre, ferme] = heuresDuJour();
    if (cestLaNuit(new Date(), ouvre, ferme)) return;
    /* UNE RAFALE FAIT UNE SONNERIE, pas trois. */
    sonne();
    const premier = sonnants[0];
    const qui = teteDuNumero(premier.numero, tetes)?.name
      ?? premier.nomProfil
      ?? `+${premier.numero}`;
    toast(sonnants.length === 1
      ? `${qui} vous écrit.`
      : `${sonnants.length} messages viennent d’arriver.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  /* LE NAVIGATEUR REFUSE TOUT SON avant qu'on ait touché la page — une
     protection contre les publicités sonores, et elle s'applique à nous
     aussi. On arme au premier geste, quel qu'il soit. */
  useEffect(() => {
    const arme = () => armeLaSonnette();
    window.addEventListener('pointerdown', arme);
    window.addEventListener('keydown', arme);
    return () => {
      window.removeEventListener('pointerdown', arme);
      window.removeEventListener('keydown', arme);
    };
  }, []);

  /* ══ MARQUER LU — les deux coches bleues ═══════════════════════════
     Elle voit qu'on l'a lue, donc elle attend au lieu de réécrire. Et elle
     voit aussi qu'on l'a lue SANS répondre : d'où le réglage. */
  useEffect(() => {
    if (!fil || !supabase || reglages.cochesBleues === false) return;
    const aDire = fil.messages.filter((m) => m.sens === 'entrant' && m.waId && !m.luParLaMaisonLe);
    if (aDire.length === 0) return;
    /* LE DERNIER SUFFIT : Meta marque lu tout ce qui le précède, et le dire
       message par message multiplierait les appels pour rien. */
    const dernier = aDire[aDire.length - 1];
    void supabase.functions.invoke('whatsapp-envoi', { body: { marquerLu: dernier.waId } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fil?.numero, fil?.messages.length, reglages.cochesBleues]);

  /* ══ RÉÉCRIRE UN MESSAGE PARTI — décision de Yéman, 14 septembre ════
     Le fil du Trône porte le texte juste, sans rature ni mention. Le prix est
     assumé et il doit rester dit : sur le téléphone de la cliente, l'original
     est TOUJOURS là — et c'est pour cela qu'un mot de correction part avec.

     L'ANCIEN TEXTE N'EST PAS PERDU : la trace de la base le garde (0097),
     avec l'heure et le nom de qui a corrigé. Elle est écrite par la base ;
     personne ne peut la retoucher. */
  const reecrisLeMessage = (m: MessageWa, neuf: string) => {
    const t = neuf.trim();
    if (!t || t === m.texte) { setReecrit(null); return; }
    const empeche = pourquoiOnNeReecritPas({
      message: m, moi: session?.user?.email ?? undefined, estDirection,
    });
    if (empeche) { toast(empeche); return; }
    messagesWaStore.set((prev) => prev.map((x) => (x.id === m.id
      ? { ...x, texte: t, reecritLe: new Date().toISOString(), reecritPar: session?.user?.email }
      : x)));
    setReecrit(null);
    /* ET LA CLIENTE L'APPREND, sinon la Maison serait seule à savoir. Le mot
       se relit avant de partir, comme tout le reste. */
    const prenom = fil && !fil.sansFiche ? fil.nom.split(/\s+/)[0] : undefined;
    setTexte(texteDeLaCorrection(t, prenom));
    toast('Le fil est corrigé. Relisez le mot de correction avant de l’envoyer.');
  };

  /* ══ UNE RÉACTION — un geste, pas un message ═══════════════════════
     Elle ne rouvre pas la fenêtre de 24 heures et ne se facture pas. Elle ne
     fait pas non plus de ligne dans le fil : elle se pose SUR le message. */
  const reagis = async (m: MessageWa, signe: string) => {
    if (!m.waId || !supabase || !fil) return;
    try {
      const { error } = await supabase.functions.invoke('whatsapp-envoi', {
        body: { numero: fil.numero, reaction: { surWaId: m.waId, emoji: signe } },
      });
      if (error) throw error;
    } catch (e) {
      toast(`Réaction non posée : ${await motifDuRefus(e)}`);
    }
  };

  /* ARCHIVER, RENDRE — la direction seule. Le fil reste ouvert à l'écran :
     on voit ce qu'on vient de ranger, et le bouton pour le rendre est à
     l'endroit même où l'on vient d'appuyer. */
  const basculeLArchive = (f: Fil) => {
    if (!estDirection || f.messages.length === 0) return;
    if (estArchive(f, archives)) {
      setArchives((prev) => desarchiveLeFil(prev, f.numero));
      toast('Conversation rendue à la liste.');
      return;
    }
    setArchives((prev) => archiveLeFil(prev, f.numero, quiArchive?.name?.trim() || undefined, new Date().toISOString()));
    toast('Conversation archivée. Rien n’est effacé, et elle revient seule au prochain message.');
  };

  /* RATTACHER UN NUMÉRO INCONNU À UNE FICHE — jamais l'inverse, et jamais
     tout seul. On écrit le numéro sur la fiche choisie ; les messages
     rejoignent sa tête au prochain rendu, sans qu'aucun message ne bouge. */
  const attache = (clientId: string, numero: string) => {
    const c = clients.find((x) => x.id === clientId);
    if (!c) return;
    const n = numeroWa(numero);
    /* LE PREMIER NUMÉRO NE S'ÉCRASE PAS : c'est le contact principal, celui
       des rappels. Un numéro qui écrit devient le SECOND, à moins que la
       fiche n'en ait aucun. */
    const champ = numeroWa(c.phone) ? 'phone2' : 'phone';
    clientsStore.set((prev) => prev.map((x) => (x.id === clientId ? { ...x, [champ]: `+${n}` } : x)));
    /* ON RATTACHE AUSSI L'HISTOIRE : les messages déjà reçus portent un
       `clientId` vide, et le rapprochement par numéro suffirait à l'écran —
       mais la fiche, le carnet et tout ce qui lira ces lignes demain veut
       l'identifiant écrit. */
    messagesWaStore.set((prev) => prev.map((m) => (numeroWa(m.numero) === n
      ? { ...m, clientId, branchId: m.branchId ?? c.branchId }
      : m)));
    setRattacher(null);
    toast(`Ce numéro est désormais celui de ${c.name.split(' ')[0]}.`);
  };

  return (
    <div className="tr-page">
      <PageHead
        eyebrow="Clients & agenda · ce qu’elles nous écrivent"
        title="Les conversations."
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {(nArchives > 0 || voirArchives) && (
              <Button variant="ghost" size="sm" onClick={() => setVoirArchives((v) => !v)}>
                {voirArchives ? 'Revenir aux conversations' : `Archivées (${nArchives})`}
              </Button>
            )}
            {nPrives > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setVoirPrives((v) => !v)}>
                {voirPrives ? 'Replier les fils privés' : `Voir les ${nPrives} fils privés`}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate('/customers')}>
              Les clientes
            </Button>
            <Button variant={vue === 'envois' ? 'copper' : 'ghost'} size="sm" onClick={() => setVue((v) => (v === 'envois' ? 'fils' : 'envois'))}>
              {vue === 'envois'
                ? 'Revenir aux conversations'
                : `Envois automatiques${aRegarderAujourdhui > 0 ? ` · ${aRegarderAujourdhui} à regarder` : ''}`}
            </Button>
            {(modelesDuMois.envoyes > 0 || modelesDuMois.reponses > 0) && (
              <span
                className="trc-sub"
                style={{ fontSize: 11.5, marginRight: 'auto' }}
                title={modelesDuMois.parModele
                  .map((m) => `${m.nom} · ${m.factures} facturés, ${m.gratuits} gratuits`)
                  .join('\n')}
              >
                Ce mois : <b>{modelesDuMois.factures}</b> modèle{modelesDuMois.factures > 1 ? 's' : ''} facturé{modelesDuMois.factures > 1 ? 's' : ''}
                {modelesDuMois.gratuits > 0 ? `, ${modelesDuMois.gratuits} gratuit${modelesDuMois.gratuits > 1 ? 's' : ''}` : ''}
                {/* DEPUIS LE 1er OCTOBRE 2026, LES RÉPONSES COMPTENT AUSSI : voir
                    `laFenetreSePaie`. Le palier se lit ici, là où l'on décide
                    d'écrire, pas sur la facture de Meta un mois plus tard. */}
                {laFenetreSePaie() && (
                  <>
                    {' · '}<b>{modelesDuMois.reponses}</b> réponse{modelesDuMois.reponses > 1 ? 's' : ''} sur
                    {' '}{REPONSES_GRATUITES_DU_MOIS.toLocaleString('fr-FR')} gratuites
                    {modelesDuMois.reponsesFacturees > 0
                      ? `, ${modelesDuMois.reponsesFacturees} facturée${modelesDuMois.reponsesFacturees > 1 ? 's' : ''}`
                      : ''}
                  </>
                )}
              </span>
            )}
            <Button variant="copper" size="sm" onClick={() => { setCommencer(true); setNumeroNeuf(''); }}>
              Nouvelle conversation
            </Button>
          </div>
        }
      />

      {messages.length === 0 && (
        <div className="trc-passage-banner">
          Aucune conversation pour l’instant. Le Trône n’entend que depuis que l’oreille est posée :
          <b> Meta ne livre rien du passé</b>, le fil commence au premier message reçu. Si vos clientes
          vous écrivent sur un autre numéro que celui branché sur l’API, elles n’arriveront pas ici.
        </div>
      )}

      {filInterdit && (
        <div className="trc-passage-banner">
          <b>Ce fil est réservé à la direction</b> : c’est le numéro d’une personne de l’équipe ou d’un
          prestataire. Ce qui s’y dit ne se lit pas ici.
        </div>
      )}

      {vue === 'envois' && (
        <EnvoisAutomatiques
          onOuvrirLeFil={(numero) => {
            const n = numeroWa(numero);
            setVue('fils');
            if (n) setParams({ n });
          }}
        />
      )}

      <div className="trc-convs" style={vue === 'envois' ? { display: 'none' } : undefined}>
        {/* ── LA BOÎTE ── */}
        <div className="trc-convs__boite">
          {/* LES TROIS TIROIRS — la direction seule les voit tous. Le compte
              dit ce qui attend une réponse, pas ce qui existe. */}
          {estDirection && (
            <div className="trc-tabs trc-tiroirs">
              {TIROIRS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`trc-tab${tiroir === t ? ' is-active' : ''}`}
                  onClick={() => { setTiroir(t); setVoirArchives(false); }}
                >
                  {TIROIR_DIT[t]}{attendent[t] > 0 ? ` · ${attendent[t]}` : ''}
                </button>
              ))}
            </div>
          )}
          {estDirection && estReserve(tiroir) && (
            <div className="trc-sub" style={{ fontSize: 11.5, lineHeight: 1.55, padding: '10px 14px' }}>
              {tiroir === 'equipe'
                ? 'Les fils de l’équipe. Seule la direction les lit : on y parle de bulletins et d’absences.'
                : 'Les fils des prestataires et des fournisseurs. Seule la direction les lit : on y parle de devis et d’argent versé.'}
            </div>
          )}
          {voirArchives && (
            <div className="trc-sub" style={{ fontSize: 11.5, lineHeight: 1.55, padding: '10px 14px' }}>
              Les conversations archivées. Rien n’y est effacé, et chacune revient seule dans la liste
              dès qu’un message part ou arrive.
            </div>
          )}
          {fils.length === 0 && messages.length > 0 && (
            <div className="trc-empty">
              {voirArchives
                ? 'Aucune conversation archivée.'
                : tiroirVu === 'clientes'
                  ? 'Aucun fil sur cette branche.'
                  : 'Personne n’a encore écrit dans ce tiroir. Un fil naît de son premier message, ou d’un envoi depuis la Paie, Temps & absences ou les Engagements.'}
            </div>
          )}
          {fils.map((f) => (
            <button
              key={f.numero}
              type="button"
              className={`trc-conv${f.numero === ouvertNum ? ' is-ouvert' : ''}${f.attendUneReponse ? ' est-vif' : ''}`}
              onClick={() => ouvre(f.numero)}
            >
              <span className={`trc-conv__rond${f.sansFiche ? ' est-inconnu' : ''}`}>
                {f.sansFiche ? '?' : initiales(f.nom)}
              </span>
              <span className="trc-conv__c">
                <span className="trc-conv__n">{f.nom}</span>
                <span className="trc-conv__d">
                  {f.dernier.sens === 'sortant' ? (estEnvoiAutomatique(f.dernier.parQui) ? 'Le Trône : ' : 'Vous : ') : ''}
                  {f.dernier.sens === 'entrant' && f.dernier.piece && !f.dernier.texte.startsWith(f.dernier.piece.nom)
                    ? `${f.dernier.piece.nom} · ` : ''}
                  {f.dernier.texte}
                </span>
              </span>
              <span className="trc-conv__r">
                <b>{jour(f.dernier.quand) === 'Aujourd’hui' ? heure(f.dernier.quand) : jour(f.dernier.quand)}</b>
                {f.sansFiche ? (
                  <span className="trc-horloge trc-horloge--inc">Sans fiche</span>
                ) : f.fenetre.ouverte ? (
                  <span className="trc-horloge trc-horloge--ouverte">{resteEnClair(f.fenetre.resteMs)}</span>
                ) : (
                  <span className="trc-horloge trc-horloge--close">Fermée</span>
                )}
                {f.prive && <span className="trc-horloge">Privé</span>}
              </span>
            </button>
          ))}
        </div>

        {/* ── LE FIL ── */}
        <div className="trc-convs__fil">
          {!fil ? (
            <div className="trc-empty" style={{ margin: 'auto' }}>
              Choisissez un fil à gauche.
            </div>
          ) : (
            <>
              <div className="trc-fil__tete">
                <span>
                  <b>{fil.nom}</b>
                  <span className="trc-sub" style={{ display: 'block', fontSize: 11.5 }}>
                    +{fil.numero}
                    {fil.sansFiche ? ' · aucune fiche' : ''}
                    {estReserve(fil.tiroir) ? ` · ${TIROIR_DIT[fil.tiroir].toLowerCase()} · direction seule` : ''}
                  </span>
                </span>
                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                  {/* ══ L'AUTRE PORTE — 15 septembre 2026 ═══════════════════
                      « Je veux garder la possibilité d'ouvrir le wa.me
                      WhatsApp app de mon téléphone et en même temps la
                      possibilité de rester dans le Trône » (Yéman).

                      ELLE EST ICI, ET ELLE COUVRE TOUT. Depuis le 14
                      septembre, chaque numéro de la Maison mène à ce fil :
                      une seule porte de sortie posée là les dessert donc
                      TOUS, plutôt que dix-neuf boutons recopiés qui
                      finiraient par diverger.

                      ELLE EMPORTE CE QU'ON A ÉCRIT : le texte de la zone de
                      saisie part avec, sinon il faudrait le retaper dans
                      l'application — et l'on ne sortirait jamais. */}
                  <a
                    className="trc-wa trc-wa--seul"
                    href={lienWaMe(fil.numero, texte) ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    title="Continuer dans l’application WhatsApp. Ce qui s’y écrit n’entre pas dans le fil de la Maison."
                    aria-label="Ouvrir cette conversation dans l’application WhatsApp"
                  >
                    <WaGlyph taille={15} />
                  </a>
                  {fil.sansFiche ? (
                    /* UN FIL RÉSERVÉ SANS FICHE : la personne a quitté l'équipe
                       ou le répertoire. On ne le rattache pas à une cliente, ce
                       serait rouvrir ses bulletins au personnel. */
                    estReserve(fil.tiroir) ? (
                      <span className="trc-sub" style={{ fontSize: 11 }}>Sans fiche : la personne n’est plus dans l’équipe ni au répertoire.</span>
                    ) : (
                      <button type="button" className="trv-minibtn" onClick={() => setRattacher(fil)}>
                        Rattacher à une fiche
                      </button>
                    )
                  ) : (
                    /* LA FICHE SELON LE TIROIR : la cliente, la fiche d'équipe,
                       le répertoire, les engagements. */
                    <button
                      type="button"
                      className="trv-minibtn"
                      onClick={() => navigate(fil.fiche ?? `/customers?id=${fil.clientId}`)}
                    >
                      {fil.tiroir === 'equipe' ? 'Sa fiche d’équipe'
                        : fil.tiroir === 'prestataires' ? (fil.fiche === '/engagements' ? 'Ses engagements' : 'Le répertoire')
                          : 'Ouvrir sa fiche'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="trv-minibtn"
                    title={fil.prive
                      ? 'Rouvrir ce fil au personnel'
                      : 'Replier ce fil : il ne paraîtra plus dans la liste, sans être verrouillé'}
                    onClick={() => basculeLeSecret(fil.numero)}
                  >
                    {fil.prive ? 'Rouvrir' : 'Marquer privé'}
                  </button>
                  {estDirection && fil.messages.length > 0 && (
                    <button
                      type="button"
                      className="trv-minibtn"
                      title={estArchive(fil, archives)
                        ? 'Rendre cette conversation à la liste'
                        : 'Retirer de la liste sans rien effacer. Elle revient seule au prochain message.'}
                      onClick={() => basculeLArchive(fil)}
                    >
                      {estArchive(fil, archives) ? 'Désarchiver' : 'Archiver'}
                    </button>
                  )}
                </span>
              </div>

              <div className="trc-bulles">
                {fil.messages.map((m, i) => {
                  const nouveauJour = i === 0 || jour(fil.messages[i - 1].quand) !== jour(m.quand);
                  return (
                    <div key={m.id} style={{ display: 'contents' }}>
                      {nouveauJour && <span className="trc-jour">{jour(m.quand)}</span>}
                      <div className={`trc-b trc-b--${m.sens === 'entrant' ? 'elle' : m.modele ? 'modele' : 'nous'}`}>
                        {/* CE QUE CE MESSAGE CITE. Le fil a déjà le texte : on
                            ne garde que l'identifiant, sinon un message réécrit
                            ferait mentir sa propre citation. Un message plus
                            ancien que le fil ne se retrouve pas, et l'écran le
                            dit plutôt que de faire semblant. */}
                        {m.citeWaId && (
                          <span className="trc-cite">
                            {messageCite(fil.messages, m.citeWaId)?.texte ?? 'un message plus ancien'}
                          </span>
                        )}
                        {/* LA PIÈCE REÇUE, VISIBLE — le webhook la garde
                            depuis le 15 septembre. Une pièce ENVOYÉE n'a pas
                            de chemin : seuls son nom et son poids restent. */}
                        {m.sens === 'entrant' && m.piece && <PieceDuFil piece={m.piece} />}
                        {m.rangeDans && m.rangeDans !== '-' && (
                          <span className="trc-b__note">
                            Rangée dans son engagement, comme devis à saisir.{' '}
                            <button type="button" onClick={() => navigate(`/engagements?id=${m.rangeDans}`)}>Ouvrir le dossier</button>
                          </span>
                        )}
                        {m.sens === 'entrant' && m.piece?.chemin && !m.rangeDans && fil.tiroir === 'prestataires' && (
                          <span className="trc-b__note">
                            À ranger dans un engagement.{' '}
                            <button type="button" onClick={() => navigate('/engagements?ranger=1')}>Ouvrir les engagements</button>
                          </span>
                        )}
                        {m.formulaire && (
                          <span className="trc-b__note">
                            Formulaire{m.formulaire.nom ? ` « ${m.formulaire.nom} »` : ''} :{' '}
                            {Object.entries(m.formulaire.reponse).map(([k, v]) => `${k} ${String(v)}`).join(' · ')}
                          </span>
                        )}
                        {reecrit?.m.id === m.id ? (
                          <>
                            <textarea
                              className="mnd-input"
                              rows={2}
                              autoFocus
                              value={reecrit.texte}
                              onChange={(e) => setReecrit({ m, texte: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') setReecrit(null);
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  reecrisLeMessage(m, reecrit.texte);
                                }
                              }}
                            />
                            <span className="trc-b__h">Entrée pour corriger, Échap pour laisser</span>
                          </>
                        ) : m.texte}
                        <span className="trc-b__h">
                          {m.modele ? `Modèle ${modeleDit(m.modele)} · ` : ''}
                          {estEnvoiAutomatique(m.parQui) ? 'Parti tout seul · ' : ''}
                          {m.bouton?.id ? 'A touché un bouton · ' : ''}
                          {heure(m.quand)}
                          {m.etat === 'lu' ? ' · lu' : m.etat === 'remis' ? ' · remis'
                            : m.etat === 'non-remis' ? ' · non remis' : m.etat === 'en-route' ? ' · en route' : ''}
                          {m.detail ? ` · ${m.detail}` : ''}
                        </span>
                        {/* LES RÉACTIONS SE POSENT SUR LE MESSAGE, comme dans
                            WhatsApp : elles ne font pas de ligne dans le fil. */}
                        {(m.reactions ?? []).length > 0 && (
                          <span className="trc-reacts">
                            {(m.reactions ?? []).map((r) => r.emoji).join(' ')}
                          </span>
                        )}
                        {fil.fenetre.ouverte && m.waId && !reecrit && (
                          <span className="trc-b__gestes">
                            <button type="button" onClick={() => setCite(m)}>Répondre</button>
                            {REACTIONS.map((r) => (
                              <button key={r.mot} type="button" onClick={() => void reagis(m, r.signe)}>
                                {r.mot}
                              </button>
                            ))}
                            {m.sens === 'sortant' && !pourquoiOnNeReecritPas({
                              message: m, moi: session?.user?.email ?? undefined, estDirection,
                            }) && (
                              <button type="button" onClick={() => setReecrit({ m, texte: m.texte })}>
                                Réécrire
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* LE MESSAGE RETENU — il paraît, mais n'a pas encore quitté
                    la Maison. Quelques secondes pour se raviser. */}
                {enAttente && enAttente.numero === fil.numero && (
                  <div className="trc-b trc-b--attente">
                    {enAttente.texte || enAttente.piece?.nom || `Modèle ${enAttente.modele}`}
                    <span className="trc-b__h">
                      part dans {resteDeLaRetenue(enAttente.posteLe, delaiMs, Date.now())} secondes
                    </span>
                    <span className="trc-b__gestes">
                      <button type="button" onClick={retenir}>Retenir</button>
                      <button
                        type="button"
                        onClick={() => { const a = enAttente; setEnAttente(null); void partir(a); }}
                      >
                        Envoyer maintenant
                      </button>
                    </span>
                  </div>
                )}
                <div ref={finDuFil} />
              </div>

              {/* ── LA SAISIE, ET LA RÈGLE QU'ELLE PORTE ── */}
              <div className={`trc-saisie${fil.fenetre.ouverte ? '' : ' est-close'}`}>
                <div className="trc-saisie__q">
                  {fil.fenetre.ouverte ? (
                    <>
                      <span className="trc-horloge trc-horloge--ouverte">
                        Fenêtre ouverte · {resteEnClair(fil.fenetre.resteMs)}
                      </span>
                      <span className="trc-sub" style={{ fontSize: 12 }}>
                        Elle a écrit à {heure(fil.fenetre.depuis ?? fil.dernier.quand)}. Vous pouvez répondre
                        librement jusque-là demain.
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="trc-horloge trc-horloge--close">
                        {fil.fenetre.depuis ? 'Fenêtre fermée' : 'Elle ne vous a jamais écrit'}
                      </span>
                      {/* ── CE QUE META FACTURE VRAIMENT — 15 septembre 2026 ──
                          Cette phrase disait « un modèle rouvre une conversation
                          de 24 h, et Meta LA facture ». C'était vrai jusqu'en
                          juin 2025 ; depuis le 1er juillet 2025 Meta facture AU
                          MESSAGE, et la conversation n'est plus l'unité.

                          LA NUANCE CHANGE LA DÉCISION : sous l'ancien modèle,
                          une fois la conversation payée on pouvait tout dire.
                          Aujourd'hui c'est chaque modèle hors fenêtre qui
                          compte — et répondre ensuite dans la fenêtre qu'il
                          ouvre ne coûte rien. */}
                      <span className="trc-sub" style={{ fontSize: 12 }}>
                        WhatsApp n’accepte plus que vos modèles approuvés. <b>Meta facture
                        le modèle</b>, pas la conversation : une fois qu’elle vous aura
                        répondu, {laFenetreSePaie()
                          ? `vos réponses entrent dans les ${REPONSES_GRATUITES_DU_MOIS.toLocaleString('fr-FR')} gratuites du mois.`
                          : `les 24 h qui suivent sont gratuites jusqu’au 30 septembre, puis ${REPONSES_GRATUITES_DU_MOIS.toLocaleString('fr-FR')} réponses gratuites par mois.`}
                      </span>
                    </>
                  )}
                </div>

                {fil.fenetre.ouverte ? (
                  <>
                    {/* ── LA BARRE D'OUTILS ──────────────────────────────
                        Dix gestes, chacun disant son état, et deux portes
                        pour les fichiers. Un geste REMPLIT la zone ; c'est
                        une main qui relit et qui envoie. */}
                    <div className="trc-gestes-rangee">
                      <ChoisirUnFichier surFichier={setPiece} occupe={envoiEnCours} />
                      <BarreDesGestes
                        gestes={gestes}
                        surGeste={poseLeGeste}
                        surPromo={() => setPromoOuverte(true)}
                        occupe={envoiEnCours}
                      />
                    </div>

                    {/* CE QU'ON CITE, au-dessus de ce qu'on écrit — comme
                        WhatsApp le montre à la cliente. */}
                    {cite && (
                      <div className="trc-piece">
                        <span className="trc-piece__v">Cite</span>
                        <span className="trc-piece__n">{cite.texte}</span>
                        <button type="button" className="trc-piece__x" onClick={() => setCite(null)}>
                          Ne plus citer
                        </button>
                      </div>
                    )}

                    {piece && (
                      <div className="trc-piece">
                        <span className="trc-piece__v">{piece.type.startsWith('image/') ? 'IMG' : 'PDF'}</span>
                        <span className="trc-piece__n">{piece.nom}</span>
                        <button type="button" className="trc-piece__x" onClick={() => setPiece(null)}>
                          Retirer
                        </button>
                      </div>
                    )}

                    <textarea
                      className="mnd-input"
                      rows={2}
                      value={texte}
                      placeholder={`Écrivez à ${fil.nom.split(' ')[0]}…`}
                      onChange={(e) => setTexte(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void envoie(); }
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="trc-sub" style={{ fontSize: 11, marginRight: 'auto' }}>
                        La devise ne se pose pas ici : elle signe ce que la Maison écrit seule.
                      </span>
                      <Button
                        variant="copper"
                        size="sm"
                        disabled={!!refus || envoiEnCours}
                        onClick={() => void envoie()}
                      >
                        {envoiEnCours ? 'Envoi…' : 'Envoyer'}
                      </Button>
                    </div>
                  </>
                ) : estReserve(fil.tiroir) ? (
                  /* LES MODÈLES DES CLIENTES NE SERVENT PAS ICI : un rappel de
                     rendez-vous à une employée n'aurait pas de sens. Ses
                     modèles à elle partent de l'écran qui décide. */
                  <p className="trc-sub" style={{ margin: 0 }}>
                    Hors fenêtre, écrivez-lui depuis l’écran qui décide : <b>la Paie</b> pour un bulletin,
                    <b> Temps & absences</b> pour un congé, <b>les Engagements</b> pour un versement.
                    Chacun part par son modèle approuvé. Ou attendez qu’elle écrive : la fenêtre se rouvre.
                  </p>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {MODELES.map((m) => (
                      <Button
                        key={m.nom}
                        variant="copper"
                        size="sm"
                        disabled={envoiEnCours}
                        title={`${m.dit} · ${m.nom}`}
                        onClick={() => setModeleAConfirmer({ nom: m.nom, dit: m.dit })}
                      >
                        {m.dit}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* LA PROMO FLASH — un code par cliente, à usage unique, 48 heures.
          La direction seule en crée : une remise est de l'argent qui sort.
          La vraie barrière est la RLS (0093) ; celle-ci n'est que la
          politesse de ne pas montrer un bouton qui refusera. */}
      {promoOuverte && fil?.clientId && (
        <PanneauDeLaPromo
          tete={{ id: fil.clientId, name: fil.nom }}
          estDirection={estDirection}
          parQui={session?.user?.email ?? undefined}
          vivants={codesVivants}
          surCode={(c, message) => {
            setTexte(message);
            setPromoOuverte(false);
            toast(`Code ${c.code} posé. Relisez le message avant de l’envoyer.`);
          }}
          surFermer={() => setPromoOuverte(false)}
        />
      )}

      {/* ══ UN MODÈLE SE CONFIRME AVANT DE PARTIR — 15 septembre 2026 ═══
          « Si j'appuie un des modèles je dois avoir un message qui m'avertit
          que je vais être facturé » (Yéman).

          ON DIT COMBIEN, PAS EN FRANCS. La Maison n'a pas les tarifs du Bénin
          et les inventer mettrait un chiffre faux sous les yeux de quelqu'un
          qui déciderait dessus. Le RANG dans le mois, lui, est exact et rend
          la dépense tangible : « le douzième ce mois-ci » se comprend mieux
          qu'un tarif hors contexte.

          ET L'ON RAPPELLE CE QUI EST GRATUIT, parce que c'est souvent la
          meilleure décision : attendre qu'elle écrive ne coûte rien. */}
      {modeleAConfirmer && fil && (
        <div className="trc-modal-fond" onClick={() => setModeleAConfirmer(null)}>
          <div className="trc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trc-modal__t">Ce modèle sera facturé</div>
            <p className="trc-sub" style={{ marginTop: 0 }}>
              <b>{modeleAConfirmer.dit}</b> partira à <b>{fil.nom}</b>.
              Sa fenêtre est fermée : WhatsApp n’accepte qu’un modèle approuvé, et
              <b> Meta facture ce message</b> au tarif de sa catégorie.
            </p>
            <p className="trc-sub">
              Ce sera le <b>{modelesDuMois.factures + 1}<sup>e</sup></b> modèle facturé
              de la Maison ce mois-ci.
              {modelesDuMois.gratuits > 0
                ? ` ${modelesDuMois.gratuits} autre${modelesDuMois.gratuits > 1 ? 's sont partis' : ' est parti'} sans rien coûter.`
                : ''}
            </p>
            <p className="trc-sub">
              {laFenetreSePaie() ? (
                <>
                  <b>Ce qui peut ne rien coûter :</b> attendre qu’elle vous écrive. Vos réponses
                  entrent alors dans les {REPONSES_GRATUITES_DU_MOIS.toLocaleString('fr-FR')} gratuites
                  du mois, dont <b>{modelesDuMois.reponses}</b> déjà utilisée{modelesDuMois.reponses > 1 ? 's' : ''}.
                </>
              ) : (
                <>
                  <b>Ce qui ne coûte rien :</b> attendre qu’elle vous écrive. Les 24 heures qui
                  suivent son message sont gratuites jusqu’au 30 septembre, puis
                  {' '}{REPONSES_GRATUITES_DU_MOIS.toLocaleString('fr-FR')} réponses gratuites par mois.
                </>
              )}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button variant="ghost" size="sm" onClick={() => setModeleAConfirmer(null)}>
                Ne pas envoyer
              </Button>
              <Button
                variant="copper"
                size="sm"
                disabled={envoiEnCours}
                onClick={() => {
                  const m = modeleAConfirmer;
                  setModeleAConfirmer(null);
                  void envoie(m.nom);
                }}
              >
                Envoyer quand même
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══ COMMENCER UNE CONVERSATION — 15 septembre 2026 ═══════════════
          « Me permettre de commencer une nouvelle discussion WhatsApp »
          (Yéman).

          DEUX PORTES, ET LA PREMIÈRE EST LA BONNE. On désigne une tête de la
          Maison — son numéro est déjà sur sa fiche, et le fil naîtra rattaché
          à elle. Un numéro tapé à la main reste possible (une fournisseuse,
          une tête qui n'a pas encore de fiche), mais il ouvre un fil SANS
          FICHE, qu'il faudra rattacher ensuite.

          ET L'ÉCRAN DIT LA RÈGLE AVANT LE CLIC : une tête qui ne vous a jamais
          écrit ne se joint que par un modèle approuvé, et chaque modèle est
          facturé par Meta — le MODÈLE, pas la conversation qu'il ouvre (la
          facturation est passée au message le 1er juillet 2025). Ce n'est pas
          une surprise à découvrir après. */}
      {commencer && (
        <div className="trc-modal-fond" onClick={() => setCommencer(false)}>
          <div className="trc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trc-modal__t">Commencer une conversation</div>
            <p className="trc-sub" style={{ marginTop: 0 }}>
              <b>Si elle ne vous a jamais écrit</b>, WhatsApp n’acceptera qu’un de vos
              trois modèles approuvés, <b>et Meta facture ce modèle-là</b>, pas la
              conversation qu’il ouvre. Si elle vous a écrit dans les 24 heures, vous
              écrirez librement, {laFenetreSePaie()
                ? `dans la limite des ${REPONSES_GRATUITES_DU_MOIS.toLocaleString('fr-FR')} réponses gratuites du mois.`
                : 'et sans un franc jusqu’au 30 septembre.'}
            </p>

            <div className="trc-sec-label" style={{ marginBottom: 6 }}>Une tête de la Maison</div>
            <ClientPicker
              value=""
              onChange={(id) => {
                const c = clients.find((x) => x.id === id);
                if (!c) return;
                const n = numeroWa(c.phone) || numeroWa(c.phone2);
                if (!n) {
                  toast(`${c.name.split(' ')[0]} n’a pas de numéro sur sa fiche.`);
                  return;
                }
                setCommencer(false);
                ouvre(n);
              }}
              placeholder="Cherchez une cliente…"
            />

            <div className="trc-sec-label" style={{ margin: '16px 0 6px' }}>Ou un numéro</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="mnd-input"
                value={numeroNeuf}
                onChange={(e) => setNumeroNeuf(e.target.value)}
                style={{ flex: 1, minWidth: 180 }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const n = numeroWa(numeroNeuf);
                  if (!n) { toast('Ce numéro n’est pas lisible.'); return; }
                  setCommencer(false);
                  ouvre(n);
                }}
              />
              <Button
                variant="copper"
                size="sm"
                disabled={!numeroWa(numeroNeuf)}
                onClick={() => {
                  const n = numeroWa(numeroNeuf);
                  if (!n) return;
                  setCommencer(false);
                  ouvre(n);
                }}
              >
                Ouvrir
              </Button>
            </div>
            {numeroNeuf.trim() && !numeroWa(numeroNeuf) && (
              <p className="trc-sub" style={{ color: 'var(--color-brique, #96412E)' }}>
                Ce numéro n’est pas lisible. Huit chiffres, ou le numéro complet avec son indicatif.
              </p>
            )}
            {(() => {
              const n = numeroWa(numeroNeuf);
              if (!n) return null;
              const t = teteDuNumero(n, tetes);
              if (!t) {
                return (
                  <p className="trc-sub">
                    Aucune fiche ne porte ce numéro : le fil s’ouvrira <b>sans fiche</b>,
                    et vous pourrez le rattacher ensuite.
                  </p>
                );
              }
              if (!estReserve(t.tiroir)) return null;
              return (
                <p className="trc-sub">
                  C’est le numéro de <b>{t.name}</b> ({TIROIR_DIT[t.tiroir as Tiroir].toLowerCase()}).
                  {estDirection
                    ? ' Le fil s’ouvrira dans son tiroir, réservé à la direction.'
                    : ' Ce fil est réservé à la direction : il ne s’ouvrira pas ici.'}
                </p>
              );
            })()}
          </div>
        </div>
      )}

      {/* RATTACHER — on choisit une tête EXISTANTE. Créer une fiche depuis un
          numéro qui écrit remplirait la base de démarcheurs en un mois. */}
      {rattacher && (
        <div className="trc-modal-fond" onClick={() => setRattacher(null)}>
          <div className="trc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trc-modal__t">
              À qui appartient le +{rattacher.numero} ?
            </div>
            <p className="trc-sub" style={{ marginTop: 0 }}>
              Le numéro s’écrira sur la fiche choisie, et tout ce fil la rejoindra.
              Si elle a déjà un numéro principal, celui-ci devient son second.
              <b> Aucune fiche n’est créée ici</b> : si c’est une nouvelle tête, ouvrez-la d’abord
              depuis Les clientes.
            </p>
            <ClientPicker
              value=""
              onChange={(id) => id && attache(id, rattacher.numero)}
              placeholder="Cherchez une cliente…"
            />
          </div>
        </div>
      )}
    </div>
  );
}
