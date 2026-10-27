import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHead, WaGlyph } from '../_ui';
import { Button, toast, demande } from '../../../../ds/components';
import { autoriserLaPurge } from '../../../../shared/sync';
import { useBranch } from '../../../../shared/branches';
import { useAuth, useStaff } from '../../../../shared/auth';
import { clientsStore, useClients, type Client } from '../../../../shared/clients';
import {
  useMessagesWa, useFilsPrives, basculeLeSecret, filsDeLaMaison, resteEnClair,
  numeroWa, messagesWaStore, type Fil,
  pourquoiOnNeReecritPas, texteDeLaCorrection,
  messagesQuiSonnent, messageCite, filNeuf, lienWaMe, compteDesModeles, type MessageWa,
  laFenetreSePaie, REPONSES_GRATUITES_DU_MOIS,
  useFilsArchives, estArchive, archiveLeFil, desarchiveLeFil, filCorrespond, filEffacable,
  tetesDeLaMaison, teteDuNumero, estReserve, TIROIRS, TIROIR_DIT, type Tiroir, type PieceRecue,
  useFilsAutomate, automatesDesFils, numerosTenus,
  sonnentApresLAutomate, type VueDeLaSonnette, rattachementDuNumero,
} from '../../../../shared/conversations';
import { reglageDeLAutomate } from '../../../../shared/automate-wa';
import { supabase } from '../../../../shared/supabase';
import { motifDuRefus, adresseDeLaPieceRecue } from '../../../../shared/whatsapp';
import { useProviders } from '../../../../shared/prestataires';
import { useFournisseurs } from '../../../../shared/stock';
import { useEngagements } from '../../../../shared/engagements';
import { armeLaSonnette, sonne, cestLaNuit } from '../../../../shared/sonnette';
import { useSettings } from '../../../../shared/settings';
import { useStaff as useEquipe, useEnvois, useAutoConfig } from '../equipe/data';
import { EnvoisAutomatiques } from './EnvoisAutomatiques';
import { compteDuJournal, envoisDeLaPeriode, jourDuSalon, estEnvoiAutomatique, modeleDit } from '../../../../shared/envois';
import { heuresDuJour } from './_heures';
import { ClientPicker } from './_shared';
import { useEstDirection } from '../_vie';
import './clients.css';
import ReponsesDeLaMaison from './ReponsesDeLaMaison';
import { CaptureLue } from './CaptureLue';
import { ComposeurWhatsApp, etapeDite, heureDuMessage as heure, jourDuMessage as jour, type PoigneeDuComposeur } from './ComposeurWhatsApp';

/* LE BANDEAU DE L'AUTOMATE vit avec le composeur depuis le 27 octobre 2026
   (lot 3 de l'Assistant Maison) ; il reste exporté d'ici pour qui le montait
   par cet écran. */
export { BandeauDeLAutomate } from './ComposeurWhatsApp';

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

/* LES TROIS MODÈLES APPROUVÉS, LA RETENUE DE HUIT SECONDES ET TOUTE LA
   ZONE DE SAISIE vivent dans `ComposeurWhatsApp.tsx` depuis le 27 octobre
   2026 (lot 3 de l'Assistant Maison) : la vue « Les conversations » de
   l'Assistant les monte aussi, et un composeur ne s'écrit qu'une fois. */

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
export function PieceDuFil({ piece }: { piece: PieceRecue }) {
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

/* RATTACHER UN NUMÉRO INCONNU À UNE FICHE — jamais l'inverse, et jamais
   tout seul. On écrit le numéro sur la fiche choisie ; les messages
   rejoignent sa tête au prochain rendu, sans qu'aucun message ne bouge.
   Rend vrai quand c'est fait (l'écran ferme alors sa fenêtre), faux quand
   la main a dit non ou que la fiche manque. Exporté le 27 octobre 2026 : la
   vue « Les conversations » de l'Assistant Maison fait le même geste. */
export async function attache(clientId: string, numero: string, clients: readonly Client[]): Promise<boolean> {
  const c = clients.find((x) => x.id === clientId);
  if (!c) return false;
  const n = numeroWa(numero);
  /* LE PREMIER NUMÉRO NE S'ÉCRASE PAS : c'est le contact principal, celui
     des rappels. Un numéro qui écrit devient le SECOND, à moins que la
     fiche n'en ait aucun. LE SECOND NE S'ÉCRASE PLUS EN SILENCE (10 octobre
     2026, revue) : s'il est pris, une main lit le numéro qu'elle remplace
     et dit oui, sinon rien ne bouge. */
  const r = rattachementDuNumero(c, numero);
  if (r.geste === 'remplacer' && !await demande({
    quoi: 'Rattacher un numéro',
    titre: `Remplacer le second numéro de ${c.name.split(' ')[0]} ?`,
    dit: `Sa fiche porte déjà deux numéros : le second, +${r.ancien}, laisserait sa place à +${n}.`,
    suite: 'Son numéro principal ne change pas. L’ancien second disparaîtra de la fiche : ses messages ne la rejoindront plus.',
    accepter: 'Remplacer le second',
    refuser: 'Ne rien changer',
    dur: true,
  })) return false;
  if (r.geste !== 'deja') {
    const champ = r.champ;
    clientsStore.set((prev) => prev.map((x) => (x.id === clientId ? { ...x, [champ]: `+${n}` } : x)));
  }
  /* ON RATTACHE AUSSI L'HISTOIRE : les messages déjà reçus portent un
     `clientId` vide, et le rapprochement par numéro suffirait à l'écran,
     mais la fiche, le carnet et tout ce qui lira ces lignes demain veut
     l'identifiant écrit. */
  messagesWaStore.set((prev) => prev.map((m) => (numeroWa(m.numero) === n
    ? { ...m, clientId, branchId: m.branchId ?? c.branchId }
    : m)));
  toast(`Ce numéro est désormais celui de ${c.name.split(' ')[0]}.`);
  return true;
}

/* ══ LA ROUTE RESTE, L'ÉCRAN A DÉMÉNAGÉ · 27 octobre 2026, lot 3 ═══════════
   Les conversations vivent dans l'Assistant Maison (`/gerard?vue=
   conversations`, `LesConversations.tsx`) : une boîte par personne,
   WhatsApp, chat du site, demandes, appels et soucis réunis. Dix-neuf
   appelants (les fonctions serveur, la pastille de la salle, le Marketing,
   `cheminDeLaConversation`) mènent encore ici avec `?n=`, `?t=`, `?envois=1`,
   `?reponses=1` : la route les garde tous et les porte à la vue. L'écran
   d'avant reste à portée de main par `?ancien=1`, le temps que la vue fasse
   ses preuves. */
export default function Conversations() {
  const [params] = useSearchParams();
  if (params.get('ancien') === '1') return <ConversationsDAvant />;
  const suivants = new URLSearchParams(params);
  suivants.set('vue', 'conversations');
  return <Navigate replace to={`/gerard?${suivants.toString()}`} />;
}

export function ConversationsDAvant() {
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
  /* La pastille de la salle d'attente mène ici par `?envois=1` (2 octobre 2026). */
  /* LES RÉPONSES DE LA MAISON (14 octobre 2026) : le troisième volet, à côté
     des fils et des envois ; ce que l'automate répond aux questions. */
  const [vue, setVue] = useState<'fils' | 'envois' | 'reponses'>(() => (params.get('envois') === '1' ? 'envois' : params.get('reponses') === '1' ? 'reponses' : 'fils'));
  const demandeLesEnvois = params.get('envois') === '1';
  useEffect(() => { if (demandeLesEnvois) setVue('envois'); }, [demandeLesEnvois]);
  const [lesEnvois] = useEnvois();
  const aRegarderAujourdhui = useMemo(() => compteDuJournal(envoisDeLaPeriode(
    lesEnvois.filter((e) => e && e.canal !== 'push'), 'aujourdhui', jourDuSalon(new Date().toISOString()),
  )).aRegarder, [lesEnvois]);
  const [texte, setTexte] = useState('');
  const [voirPrives, setVoirPrives] = useState(false);
  /* LES FILS ARCHIVÉS — 15 septembre 2026. La vue les retrouve ; la
     direction seule les range et les rend. */
  const [voirArchives, setVoirArchives] = useState(false);
  const [archives, setArchives] = useFilsArchives();
  const quiArchive = useStaff();
  const [rattacher, setRattacher] = useState<Fil | null>(null);
  const estDirection = useEstDirection();
  const [reglages] = useSettings();
  /** Le message qu'on cite en répondant, s'il y en a un. */
  const [cite, setCite] = useState<MessageWa | null>(null);
  /* Les deux gestes du composeur que la tête du fil appelle (27 octobre 2026). */
  const poignee = useRef<PoigneeDuComposeur | null>(null);
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

  /* ══ LA MAISON RÉPOND SEULE · 9 octobre 2026 ════════════════════════
     Les fils de la réponse automatique (`fils_automate`, en direct) et son
     réglage : la durée d'une main de l'équipe se lit là, pas ici. */
  const [lignesDeLAutomate] = useFilsAutomate();
  const [configAuto] = useAutoConfig();
  const reglageAutomate = useMemo(() => reglageDeLAutomate(configAuto.automateWa), [configAuto.automateWa]);
  const automates = useMemo(
    () => automatesDesFils(lignesDeLAutomate, reglageAutomate.pauseHeures),
    [lignesDeLAutomate, reglageAutomate.pauseHeures],
  );

  /* ══ CE QUE LES MODÈLES COÛTENT CE MOIS-CI — 15 septembre 2026 ═════
     « Combien Meta facture une conversation de 24 h ? » (Yéman).

     LE PANNEAU DE LA PROMO NE DISAIT RIEN DU COÛT, alors que c'est justement
     le geste qui envoie des modèles hors fenêtre. Une dépense qu'on ne
     mesure jamais finit par surprendre à la facture.

     ON COMPTE DES MESSAGES, PAS DES FRANCS. La Maison n'a pas les tarifs du
     Bénin, ils bougent, et les inventer mettrait un chiffre faux sous les
     yeux de quelqu'un qui déciderait dessus. */
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
  /* L'AUTOMATE ENTRE DANS LE JUGE (9 octobre 2026) : un fil qu'il mène et
     dont il a traité le dernier mot n'attend pas la Maison ; une main passée,
     si. Ses messages ne répondent jamais à la place de la Maison. */
  const tous = useMemo(
    () => filsDeLaMaison(messages, tetes, prives, tick, branch.id, automates),
    [messages, tetes, prives, tick, branch.id, automates],
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
  /* LA RECHERCHE (2 octobre 2026) : un nom, des chiffres, un mot écrit. Elle
     traverse aussi les archives et les fils privés : on cherche quelqu'un,
     pas un rangement. */
  const [cherche, setCherche] = useState('');
  const enRecherche = cherche.trim().length > 0;
  const fils = useMemo(
    () => tous.filter((f) => f.tiroir === tiroirVu
      && (enRecherche
        ? filCorrespond(f, cherche)
        : (voirPrives || !f.prive) && (voirArchives ? estArchive(f, archives) : !estArchive(f, archives)))),
    [tous, tiroirVu, voirPrives, voirArchives, archives, cherche, enRecherche],
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

  /* LE FIL S'OUVRE SUR SON DERNIER MESSAGE. On fait défiler les bulles
     elles-mêmes, pas `scrollIntoView` : celui-ci faisait aussi glisser la
     page, et de côté sur un téléphone (2 octobre 2026). */
  useEffect(() => {
    const bulles = finDuFil.current?.parentElement;
    if (bulles) bulles.scrollTop = bulles.scrollHeight;
  }, [fil?.numero, fil?.messages.length]);

  /* ══ LE FIL EN PLEIN ÉCRAN SUR UN TÉLÉPHONE — 2 octobre 2026 ══════════
     « Make conversations responsive on mobile phone, cannot use it
     correctly » (Yéman). Le fil supposait une barre du Trône de 96 px ; elle
     en fait 127 sur un téléphone, et la saisie tombait sous l'écran. Le fil
     ouvert couvre désormais tout l'écran, comme dans WhatsApp, et prend la
     hauteur que le CLAVIER laisse : `visualViewport` la donne, la feuille de
     style la lit (`--vv-h`, `--vv-top`). Sur un grand écran, ces variables
     ne servent pas. */
  const filRef = useRef<HTMLDivElement>(null);
  const aUnFil = !!fil;
  useEffect(() => {
    const vv = window.visualViewport;
    const el = filRef.current;
    if (!vv || !el || !aUnFil) return;
    const pose = () => {
      el.style.setProperty('--vv-h', `${vv.height}px`);
      el.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    };
    /* Le clavier qui s'ouvre ne doit pas cacher le dernier message. */
    const auClavier = () => {
      pose();
      const bulles = finDuFil.current?.parentElement;
      if (bulles) bulles.scrollTop = bulles.scrollHeight;
    };
    pose();
    vv.addEventListener('resize', auClavier);
    vv.addEventListener('scroll', pose);
    return () => { vv.removeEventListener('resize', auClavier); vv.removeEventListener('scroll', pose); };
  }, [aUnFil]);

  /* Au doigt, les gestes d'une bulle (répondre, réagir, réécrire) ne
     paraissent que sur la bulle touchée : sous chaque bulle, ils doublaient
     la hauteur du fil. Et les actions du fil se rangent derrière « ⋯ ». */
  const [bulleTouchee, setBulleTouchee] = useState<string | null>(null);
  const [menuDuFil, setMenuDuFil] = useState(false);
  useEffect(() => { setBulleTouchee(null); setMenuDuFil(false); }, [fil?.numero]);

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
      /* Un fil que l'automate mène ne sonne pas (9 octobre 2026). */
      tenus: numerosTenus(automates, Date.now()),
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

  /* LA MAIN QUI PASSE SONNE AUSSI (relecture du 9 octobre 2026) : un fil
     que l'automate tenait et qui attend maintenant une personne (la main
     passée, un tour en échec, un message refusé par Meta). Aucun message
     neuf ne le dit : c'est le passage qui sonne (`sonnentApresLAutomate`). */
  const vusDeLAutomate = useRef<VueDeLaSonnette | null>(null);
  useEffect(() => {
    const { numeros, vue } = sonnentApresLAutomate({ avant: vusDeLAutomate.current, fils: tous, filOuvert: ouvertNum || undefined });
    vusDeLAutomate.current = vue;
    if (numeros.length === 0 || reglages.sonnette === false) return;
    const [ouvre, ferme] = heuresDuJour();
    if (cestLaNuit(new Date(), ouvre, ferme)) return;
    sonne();
    const qui = teteDuNumero(numeros[0], tetes)?.name ?? `+${numeros[0]}`;
    toast(numeros.length === 1
      ? `${qui} attend une personne de la Maison.`
      : `${numeros.length} conversations attendent une personne de la Maison.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tous]);

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
  /* EFFACER UN FIL SANS FICHE — la direction seule, après confirmation,
     sur tous les postes (voir `filEffacable`). */
  const effaceLeFil = async (f: Fil) => {
    if (!estDirection || !filEffacable(f)) return;
    if (!await demande({
      quoi: 'Conversation',
      titre: `Effacer la conversation avec ${f.nom} ?`,
      dit: `${f.messages.length} message${f.messages.length > 1 ? 's' : ''} disparaissent de tous les postes de la Maison.`,
      suite: 'Ce numéro n’a pas de fiche. S’il écrit de nouveau, un fil neuf s’ouvrira.',
      accepter: 'Effacer',
      refuser: 'Garder',
      dur: true,
    })) return;
    const n = f.numero;
    /* Le garde-fou des suppressions en masse protège la table d'un accident ;
       ici c'est un geste voulu, déclaré pour cette seule poussée. */
    autoriserLaPurge('messages_wa');
    messagesWaStore.set((prev) => prev.filter((m) => numeroWa(m.numero) !== n));
    if (estArchive(f, archives)) setArchives((prev) => desarchiveLeFil(prev, n));
    setParams({});
    toast('Conversation effacée.');
  };

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

  return (
    <div className={`tr-page trc-page-convs${fil ? ' a-fil' : ''}`}>
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
            <Button variant={vue === 'reponses' ? 'copper' : 'ghost'} size="sm" onClick={() => setVue((v) => (v === 'reponses' ? 'fils' : 'reponses'))}>
              {vue === 'reponses' ? 'Revenir aux conversations' : 'Ce que la Maison répond'}
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
            {/* Sur les fils seulement : au téléphone, le bouton flotte et couvrait
                les réponses de la Maison (14 octobre 2026). */}
            {vue === 'fils' && (
              <Button className="trc-nouveau" variant="copper" size="sm" onClick={() => { setCommencer(true); setNumeroNeuf(''); }}>
                Nouvelle conversation
              </Button>
            )}
          </div>
        }
      />

      {messages.length === 0 && vue === 'fils' && (
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

      {vue === 'reponses' && (
        <ReponsesDeLaMaison
          onOuvrirLeFil={(numero) => {
            const n = numeroWa(numero);
            setVue('fils');
            if (n) setParams({ n });
          }}
        />
      )}

      {vue === 'envois' && (
        <EnvoisAutomatiques
          typeInitial={params.get('type')}
          onOuvrirLeFil={(numero) => {
            const n = numeroWa(numero);
            setVue('fils');
            if (n) setParams({ n });
          }}
        />
      )}

      {/* ══ UNE CHOSE À LA FOIS SUR UN TÉLÉPHONE — 21 septembre 2026 ══
          « Make conversation page responsive on mobile phone » (Yéman).
          Sous 760 pixels, la feuille de style montre la liste OU le fil
          ouvert : `a-fil` dit lequel, et le bouton de retour ci-dessous
          referme le fil en vidant l'adresse. Sur un grand écran, rien ne
          change : les deux colonnes restent côte à côte. */}
      <div
        className={`trc-convs${fil ? ' a-fil' : ''}`}
        style={vue !== 'fils' ? { display: 'none' } : undefined}
      >
        {/* ── LA BOÎTE ── */}
        <div className="trc-convs__boite">
          {/* CHERCHER (2 octobre 2026) : un nom, des chiffres, un mot. */}
          <div className="trc-convs__cherche">
            <input
              type="search"
              value={cherche}
              onChange={(e) => setCherche(e.target.value)}
              placeholder="Chercher un nom, un numéro, un mot"
              aria-label="Chercher une conversation"
            />
            {enRecherche && (
              <span className="trc-sub" style={{ fontSize: 11.5 }}>
                {fils.length === 0 ? 'Aucun fil' : `${fils.length} fil${fils.length > 1 ? 's' : ''}`}, archives et fils privés compris
              </span>
            )}
          </div>
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
          {fils.length === 0 && messages.length > 0 && !enRecherche && (
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
                  {f.dernier.sens === 'sortant'
                    ? (f.dernier.auto === 'automate' ? 'Automate : ' : estEnvoiAutomatique(f.dernier.parQui) ? 'Le Trône : ' : 'Vous : ')
                    : f.dernier.canal === 'site' ? 'Le site : ' : ''}
                  {f.dernier.sens === 'entrant' && f.dernier.piece && !f.dernier.texte.startsWith(f.dernier.piece.nom)
                    ? `${f.dernier.piece.nom} · ` : ''}
                  {f.dernier.texte}
                </span>
                {/* LA RÉPONSE AUTOMATIQUE, VUE DE LA LISTE (9 octobre 2026) :
                    elle mène le fil (et dit où elle en est), ou elle a passé
                    la main, en brique, et l'alarme sonne. */}
                {f.automate?.tenue === 'tenu' && (
                  <span className="trc-conv__auto">
                    <span className="trc-horloge trc-horloge--automate">Automate · {etapeDite(f.automate.etape)}</span>
                  </span>
                )}
                {f.automate?.tenue === 'main' && (
                  <span className="trc-conv__auto">
                    <span className="trc-horloge trc-horloge--main">Main passée</span>
                  </span>
                )}
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
        <div className="trc-convs__fil" ref={filRef}>
          {!fil ? (
            <div className="trc-empty" style={{ margin: 'auto' }}>
              Choisissez un fil à gauche.
            </div>
          ) : (
            <>
              <div className={`trc-fil__tete${menuDuFil ? ' menu-ouvert' : ''}`}>
                <button
                  type="button"
                  className="trc-retour"
                  onClick={() => setParams({})}
                  aria-label="Revenir à la liste des conversations"
                >
                  ← Toutes les conversations
                </button>
                <span className="trc-fil__qui">
                  <b>{fil.nom}</b>
                  <span className="trc-sub" style={{ display: 'block', fontSize: 11.5 }}>
                    +{fil.numero}
                    {fil.sansFiche ? ' · aucune fiche' : ''}
                    {estReserve(fil.tiroir) ? ` · ${TIROIR_DIT[fil.tiroir].toLowerCase()} · direction seule` : ''}
                    {fil.automate?.tenue === 'tenu' ? ' · la Maison répond seule'
                      : fil.automate?.tenue === 'main' ? ' · main passée à l’équipe'
                        : fil.automate?.tenue === 'pause' ? ' · l’équipe a la main' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className="trc-fil__plus"
                  aria-label="Les actions de ce fil"
                  aria-expanded={menuDuFil}
                  onClick={() => setMenuDuFil((v) => !v)}
                >
                  ⋯
                </button>
                {/* Un choix fait dans le menu le referme. */}
                <span className="trc-fil__actions" onClick={() => setMenuDuFil(false)}>
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
                    /* L'automate ne voit pas cette sortie : il se tait (9 octobre 2026). */
                    onClick={() => poignee.current?.prendsLaMain('whatsapp')}
                  >
                    <WaGlyph taille={15} />
                    <span className="trc-wa__mot">Continuer dans WhatsApp</span>
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
                  {/* POSER UN RENDEZ-VOUS DEPUIS LE FIL (9 octobre 2026) : la
                      fenêtre du rendez-vous, la fiche déjà posée. Pas pour
                      l'équipe ni les prestataires. */}
                  {!estReserve(fil.tiroir) && (
                    <button type="button" className="trv-minibtn" onClick={() => poignee.current?.poseUnRendezVous(false)}>
                      Poser un rendez-vous
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
                  {estDirection && filEffacable(fil) && (
                    <button
                      type="button"
                      className="trv-minibtn"
                      title="Effacer ce fil de tous les postes : ce numéro n’a pas de fiche"
                      onClick={() => void effaceLeFil(fil)}
                      style={{ color: '#8f3b30' }}
                    >
                      Supprimer
                    </button>
                  )}
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
                  /* LA BULLE DE L'AUTOMATE A SON HABIT (9 octobre 2026) : elle
                     n'est ni un mot de l'équipe ni un modèle payé, et dit
                     l'étape qu'elle ouvre et les choix qu'elle proposait. */
                  const deLAutomate = m.sens === 'sortant' && m.auto === 'automate';
                  return (
                    <div key={m.id} style={{ display: 'contents' }}>
                      {nouveauJour && <span className="trc-jour">{jour(m.quand)}</span>}
                      <div
                        className={`trc-b trc-b--${m.sens === 'entrant' ? 'elle' : m.modele ? 'modele' : deLAutomate ? 'automate' : 'nous'}${bulleTouchee === m.id ? ' est-touchee' : ''}`}
                        onClick={() => setBulleTouchee((t) => (t === m.id ? null : m.id))}
                      >
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
                        {/* La capture d'un transfert, lue par Claude (19 octobre 2026) : à vérifier, puis inscrire ou écarter. */}
                        {m.sens === 'entrant' && m.piece?.type?.startsWith('image/') && <CaptureLue message={m} clientId={fil.clientId} />}
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
                        {deLAutomate && (m.choix ?? []).length > 0 && (
                          <span className="trc-b__choix" aria-label="Les choix proposés">
                            {(m.choix ?? []).map((c, k) => <span key={`${k}-${c}`}>{c}</span>)}
                          </span>
                        )}
                        <span className="trc-b__h">
                          {m.canal === 'site' ? 'Depuis le site · ' : ''}
                          {m.modele ? `Modèle ${modeleDit(m.modele)} · ` : ''}
                          {deLAutomate
                            ? `Automate${m.etape ? ` · ${etapeDite(m.etape)}` : ''} · `
                            : estEnvoiAutomatique(m.parQui) ? 'Parti tout seul · ' : ''}
                          {m.bouton?.id ? (m.bouton.id.startsWith('MND:') ? 'A touché un choix · ' : 'A touché un bouton · ') : ''}
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
                <div ref={finDuFil} />
              </div>

              {/* LA SAISIE, ET LA RÈGLE QU'ELLE PORTE : le composeur, extrait tel quel le
                  27 octobre 2026 (`ComposeurWhatsApp.tsx`), partagé avec la vue de l'Assistant. */}
              <ComposeurWhatsApp fil={fil} texte={texte} surTexte={setTexte} cite={cite} surCite={setCite} poignee={poignee} />
            </>
          )}
        </div>
      </div>

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
              Si elle en a déjà deux, on vous demandera avant de remplacer le second.
              <b> Aucune fiche n’est créée ici</b> : si c’est une nouvelle tête, ouvrez-la d’abord
              depuis Les clientes.
            </p>
            <ClientPicker
              value=""
              onChange={(id) => { if (id) void attache(id, rattacher.numero, clients).then((fait) => { if (fait) setRattacher(null); }); }}
              placeholder="Cherchez une cliente…"
            />
          </div>
        </div>
      )}
    </div>
  );
}
