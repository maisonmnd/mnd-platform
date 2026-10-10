import { createStore, useStore } from './store';
import { bindCollection, bindDocument } from './sync';
import { estEnvoiAutomatique } from './envois';
import {
  vueDeLAutomate, silenceDeLAlarme, REGLAGE_LIVRE,
  type EtapeDuFil, type VueDeLAutomate, type EtatDuFil, type MainDuFil, type TenueDuFil,
} from './automate-wa';

/* ══ LES CONVERSATIONS — 11 septembre 2026 ═══════════════════════════
   Maquette `public/maquette-les-conversations.html`, validée.

   « Comment je réussis à construire les conversations WhatsApp dans le
   trône ? » (Yéman).

   Le Trône parlait sans entendre. Trois modèles partaient seuls, la cloche
   ouvrait des brouillons, et rien ne revenait : ce qu'une cliente répondait
   vivait dans un téléphone, pas dans la Maison. Personne d'autre ne le
   voyait, rien ne s'en souvenait, et retrouver ce qu'elle avait demandé
   demandait de faire défiler six mois de fil.

   LA FENÊTRE DE 24 HEURES COMMANDE TOUT LE RESTE, et ce n'est pas un détail
   technique : c'est la loi de WhatsApp. On écrit librement pendant les
   24 heures qui suivent SON dernier message ; passé ce délai, Meta n'accepte
   plus qu'un modèle approuvé. C'est ce qui fait rater la plupart des boîtes
   WhatsApp : on tape un texte, on appuie, et ça échoue avec une erreur
   illisible. L'écran doit donc porter la règle LUI-MÊME, visiblement. */

/** Le numéro réduit à ses chiffres, au format que Meta emploie (sans « + »).

    LE RAPPROCHEMENT SE JOUE ICI. Une fiche porte « +229 0197000088 », Meta
    renvoie « 2290197000088 », et si les deux ne se réduisent pas au même
    chiffre, les messages d'une cliente tombent dans « inconnu » à côté de sa
    propre fiche. Même règle que `numeroIntl` des fonctions Edge, recopiée
    parce qu'une fonction Edge ne peut rien importer d'ici. */
export const numeroWa = (brut: string | undefined): string => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};

export type SensDuMessage = 'entrant' | 'sortant';

/** L'état d'un message SORTANT, tel que Meta le rapporte au fil de l'eau.
    Un entrant n'en a pas : il est là, c'est tout. */
export type EtatDuMessage = 'en-route' | 'remis' | 'lu' | 'non-remis';

export type MessageWa = {
  id: string;
  /** VENU DU SITE — 28 septembre 2026. « Quand la cliente fait une demande sur
      le site, j'aimerais que son message atterrisse dans les Conversations »
      (Yéman). `demande-submit` écrit la demande dans le fil de son numéro,
      comme un message d'elle, marqué `canal: 'site'`. Ce n'est PAS un message
      WhatsApp : Meta ne l'a pas vu, il n'ouvre pas la fenêtre de 24 heures
      (voir `fenetreDe`), et l'écran le dit « Depuis le site ». */
  canal?: 'site';
  branchId?: string;
  /** L'identifiant Meta — c'est lui qui rend le webhook idempotent. */
  waId?: string;
  sens: SensDuMessage;
  /** Le numéro de la cliente, réduit (`numeroWa`). Toujours présent. */
  numero: string;
  /** La fiche, quand on a su la retrouver. Absente = tête inconnue. */
  clientId?: string;
  /** Le nom que WhatsApp annonce, pour une tête sans fiche. */
  nomProfil?: string;
  texte: string;
  /** `text`, `image`, `audio`… Ce qui n'est pas du texte n'est pas encore
      affiché : l'étape des photos viendra quand les trois premières
      tourneront (voir la maquette). */
  type?: string;
  /** ISO complet — l'instant, pas le jour. */
  quand: string;
  etat?: EtatDuMessage;
  /** Ce que Meta répond quand il refuse : « numéro invalide », « modèle
      suspendu »… Une erreur sans sa raison se cherche pendant des semaines. */
  detail?: string;
  /** Envoyé par un modèle approuvé, et lequel. Un modèle rouvre une
      conversation facturée : l'écran doit pouvoir le dire. */
  modele?: string;
  /** Qui l'a écrit, côté Maison. */
  parQui?: string;
  /** PAR QUEL NUMÉRO DE LA MAISON — l'identifiant Meta du numéro qui a reçu
      ou envoyé (11 septembre 2026, question de Yéman : « je voudrais avoir
      2 numéros WhatsApp enregistrés »).

      LE CHAMP EST POSÉ AVANT LE SECOND NUMÉRO, et c'est délibéré : Meta le
      donne à chaque message, il ne coûte rien à garder, et il ne se
      RETROUVERAIT JAMAIS après coup. Le jour où la Maison branchera une
      seconde ligne, tout l'historique saura déjà de laquelle il vient ;
      sans lui, deux ans de conversations deviendraient indistinguables. */
  numeroMaison?: string;

  /* ══ LES GESTES DU FIL — 14 septembre 2026 ═════════════════════════
     « J'aimerais éditer des messages qui sont partis. Les mêmes
     fonctionnalités que WhatsApp » (Yéman). Maquette
     `public/maquette-rattraper-un-message.html`, validée.

     UN MESSAGE PARTI NE SE MODIFIE PAS CHEZ LA CLIENTE, et ce n'est pas un
     choix de la Maison : l'API Business ne sait ni éditer ni effacer. Ce que
     ces champs portent est donc ce que l'API permet VRAIMENT — citer,
     réagir, dire qu'on a lu — plus la réécriture du fil de la Maison, qui
     est une décision assumée (voir `reecritLe`). */

  /** LE MESSAGE QUE CELUI-CI CITE, par son identifiant Meta.

      DANS LES DEUX SENS : ce qu'on cite, et ce qu'ELLE cite — ses citations
      étaient perdues jusqu'ici, le webhook ne lisait pas le « contexte » que
      Meta envoie pourtant depuis le premier jour. Une réponse à la troisième
      question sur quatre arrivait donc sans qu'on sache laquelle.

      ON NE GARDE QUE L'IDENTIFIANT, jamais une copie du texte cité. Le fil a
      déjà ce texte, et le recopier ici le figerait : un message réécrit
      ferait alors mentir sa propre citation. */
  citeWaId?: string;

  /** LES RÉACTIONS POSÉES SUR CE MESSAGE. Une par personne : WhatsApp
      remplace la précédente, on fait pareil. Un `emoji` vide veut dire
      qu'elle a été retirée — c'est ainsi que Meta l'annonce. */
  reactions?: { par: 'nous' | 'elle'; emoji: string; quand: string }[];

  /** L'ACCUSÉ DE LECTURE QUE LA MAISON A ENVOYÉ pour ce message entrant.
      Sans lui on le renverrait à chaque ouverture du fil, et Meta compte. */
  luParLaMaisonLe?: string;

  /* ── LA RÉÉCRITURE — décision de Yéman, 14 septembre 2026 ──────────
     « La correction ne cite pas l'original, l'original n'est pas barré,
     daté, et juste réécrit. »

     LE FIL DU TRÔNE PORTE LE TEXTE JUSTE, sans rature ni mention. C'est ce
     qui a été demandé, et cela a un prix qui doit rester écrit quelque part :
     sur le téléphone de la cliente, le message d'origine est TOUJOURS là,
     inchangé. Le fil de la Maison montre donc, à cet endroit, un texte
     qu'elle n'a jamais reçu — et c'est pour cela qu'un message de correction
     part avec, sans quoi la Maison serait seule à savoir.

     L'ANCIEN TEXTE N'EST PAS PERDU : la trace de la base le garde (migration
     0097), avec l'heure et le nom de qui a corrigé. Elle est écrite par la
     base et personne ne peut la retoucher. Ces deux champs-ci ne servent
     qu'à empêcher une réécriture de repartir chez Meta — ils ne s'affichent
     pas. */
  reecritLe?: string;
  reecritPar?: string;

  /* ══ L'ÉQUIPE SUR WHATSAPP — 15 septembre 2026 ═════════════════════
     Maquette `public/maquette-lequipe-sur-whatsapp.html`, validée. */

  /** LE TIROIR, POSÉ PAR LA BASE (0102) : elle reconnaît le numéro dans
      l'équipe, le répertoire des prestataires et les fournisseurs, et c'est
      elle qui ferme la porte — un fil réservé n'existe pas pour un compte du
      personnel. L'écran le lit ; il ne l'écrit jamais. */
  tiroir?: Tiroir;
  /** La fiche d'équipe, du répertoire ou du fournisseur, quand la base l'a
      retrouvée. Même rôle que `clientId` pour une cliente. */
  staffId?: string;
  prestataireId?: string;
  fournisseurId?: string;
  /** CE QU'ON A REÇU, OU ENVOYÉ, EN PIÈCE. Un message sortant ne garde que
      le nom et le poids (voir whatsapp-envoi) ; un message reçu garde en
      plus où le fichier est rangé, depuis que le webhook va le chercher chez
      Meta au lieu de le laisser se perdre. */
  piece?: PieceRecue;
  /** LE BOUTON QU'ELLE A TOUCHÉ, avec son identifiant : c'est lui qui agit
      (« RECU:<versement> » confirme une réception), le titre n'est que ce
      qu'elle a lu. */
  bouton?: { id?: string; texte: string };
  /** LA RÉPONSE D'UN FORMULAIRE (un Flow WhatsApp), telle que Meta la rend.
      Le webhook en fait quelque chose (une demande de congé) ; le fil garde
      ce qu'elle a rempli, pour le relire. */
  formulaire?: { nom?: string; reponse: Record<string, unknown> };
  /** UN MESSAGE PARTI TOUT SEUL, et pourquoi : l'accusé d'un devis reçu, le
      formulaire de congé proposé. Deux seulement, dits d'avance dans la
      maquette. Ils portent `parQui: 'Le Trône'`. */
  auto?: 'accuse' | 'formulaire' | 'transmis' | 'reprise-ok' | 'reprise-autre' | 'automate';
  /** LA RÉPONSE AUTOMATIQUE QUI RÉSERVE · 9 octobre 2026 (`shared/automate-wa`).
      Un message `auto: 'automate'` dit l'étape qu'il ouvre et les choix
      qu'il proposait, tels qu'elle les a lus : le fil du Trône les montre au
      lieu de « Parti tout seul ». Il ne compte JAMAIS comme une réponse de
      la Maison (la règle d'alarme le saute). */
  etape?: EtapeDuFil;
  choix?: string[];
  /** UNE PIÈCE REÇUE D'UN PRESTATAIRE, RANGÉE DANS SON DOSSIER — l'identifiant
      de l'engagement. Absent avec une pièce : elle attend « à ranger ». */
  rangeDans?: string;
};

/** OÙ VIT LA PIÈCE REÇUE. `coffre` dit le compartiment : `whatsapp` (0102)
    par défaut, `engagements` quand le webhook l'a rangée dans un dossier.
    `tropLourde` : elle dépassait le plafond, et le fichier est resté chez Meta. */
export type PieceRecue = {
  nom: string;
  type: string;
  octets?: number;
  chemin?: string;
  coffre?: string;
  mediaId?: string;
  tropLourde?: boolean;
};

export const messagesWaStore = createStore<MessageWa[]>('mnd_messages_wa', []);
export const useMessagesWa = () => useStore(messagesWaStore);

/* ── LES FILS MARQUÉS PRIVÉS ──────────────────────────────────────────
   « Tout le personnel, sauf ce que je marque privé » (Yéman, 11 septembre).

   LE DRAPEAU NE VIT PAS SUR LES MESSAGES. Le poser sur chaque ligne
   obligerait à réécrire tout un fil pour le fermer, et un fil à moitié
   réécrit serait à moitié privé — exactement le genre de demi-mesure qui se
   découvre le mauvais jour. Il vit donc sur le FIL, désigné par le numéro :
   une clé, un geste, tout le fil suit.

   CE N'EST PAS UN VERROU DE SÉCURITÉ, ET L'ÉCRAN DOIT LE DIRE. La table est
   ouverte à tout le personnel par RLS ; ce drapeau ferme l'écran, pas la
   base. Le présenter comme un coffre serait mentir à la Maison. */
export const filsPrivesStore = createStore<string[]>('mnd_fils_prives', []);
export const useFilsPrives = () => useStore(filsPrivesStore);

export const estFilPrive = (numero: string, prives: readonly string[]): boolean =>
  prives.includes(numeroWa(numero));

export function basculeLeSecret(numero: string): void {
  const n = numeroWa(numero);
  if (!n) return;
  filsPrivesStore.set((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
}

/* ══ ARCHIVER UN FIL — 15 septembre 2026 ═════════════════════════════
   « Supprimer une conversation WhatsApp » (Yéman). Tranché le même jour :
   ARCHIVER, et LA DIRECTION SEULE.

   RIEN NE PEUT EFFACER CE QU'ELLE A REÇU. Meta n'offre aucun moyen de retirer
   un message du téléphone d'une cliente : « supprimer » dans le Trône
   n'aurait effacé que la mémoire de la Maison, pas la conversation. Et la
   mémoire de la Maison est précisément ce qui permet de répondre à « vous ne
   m'aviez pas dit ça ».

   ARCHIVER N'EFFACE RIEN. Le fil quitte la liste, ses messages restent en
   base, et la vue « Archivées » le retrouve.

   ELLE REVIENT SEULE. Une archive vaut jusqu'au message suivant, dans un sens
   ou dans l'autre : on la juge contre les messages du fil, pas contre une case
   qu'il faudrait penser à décocher. Une cliente qui réécrit ne se perd pas
   dans un tiroir.

   ELLE VOYAGE, CONTRAIREMENT AUX FILS PRIVÉS. Ranger sa liste sur le téléphone
   pour la retrouver en désordre sur la tablette du salon n'aurait aucun sens :
   l'archive vit dans le document partagé `mnd_fils_archives`, hors de la liste
   blanche publique (0042), donc lisible du seul personnel.

   LA DIRECTION SEULE, ET C'EST UNE GARDE D'ÉCRAN. Les documents s'écrivent par
   tout le personnel (0006). Rien n'étant effacé, un verrou en base ne vaudrait
   pas une migration ; l'archive porte en revanche qui l'a posée, et quand. */

export type ArchiveDuFil = { le: string; par?: string };
/** Par numéro réduit, comme les fils eux-mêmes. */
export type ArchivesDesFils = Record<string, ArchiveDuFil>;

export const filsArchivesStore = createStore<ArchivesDesFils>('mnd_fils_archives', {});
export const useFilsArchives = () => useStore(filsArchivesStore);

/** RETIRÉS DE L'ALARME — 18 septembre 2026. « Tu peux me donner la main pour
    enlever le message » (Yéman). Un retrait ne touche QUE l'alarme du tableau
    de bord : le fil reste dans l'écran des conversations, à sa place, et la
    cloche le compte toujours. C'est dire « celui-là n'appelle pas de réponse »
    sans le ranger. MÊME FORME ET MÊME RÈGLE QUE L'ARCHIVE : un mot de plus
    après le retrait le ramène, et `estArchive` en juge. Partagé entre les
    appareils, parce qu'un retrait fait sur l'ordinateur doit valoir sur le
    téléphone. */
export const alarmeRetiresStore = createStore<ArchivesDesFils>('mnd_alarme_retires', {});
export const useAlarmeRetires = () => useStore(alarmeRetiresStore);

/** CE FIL EST-IL RANGÉ ? Oui tant qu'aucun de ses messages n'est plus récent
    que l'archive. Les instants se comparent en millisecondes, jamais en texte :
    « 10:00:00Z » et « 10:00:00.000Z » disent la même heure et ne se trient pas
    pareil. */
export function estArchive(fil: Pick<Fil, 'numero' | 'messages'>, archives: ArchivesDesFils): boolean {
  const a = archives[numeroWa(fil.numero)];
  if (!a) return false;
  const le = Date.parse(a.le);
  if (!Number.isFinite(le)) return false;
  return fil.messages.every((m) => {
    const t = Date.parse(m.quand);
    return !Number.isFinite(t) || t <= le;
  });
}

export function archiveLeFil(
  archives: ArchivesDesFils, numero: string, par: string | undefined, quand: string,
): ArchivesDesFils {
  const n = numeroWa(numero);
  if (!n) return archives;
  return { ...archives, [n]: par ? { le: quand, par } : { le: quand } };
}

export function desarchiveLeFil(archives: ArchivesDesFils, numero: string): ArchivesDesFils {
  const n = numeroWa(numero);
  if (!n || !(n in archives)) return archives;
  const { [n]: _retiree, ...reste } = archives;
  return reste;
}

/* ══ LA FENÊTRE DE 24 HEURES ═════════════════════════════════════════
   La seule règle qui doive être visible à l'écran avant qu'on tape un mot. */

export const FENETRE_MS = 24 * 60 * 60 * 1000;

export type Fenetre = {
  ouverte: boolean;
  /** Millisecondes restantes. Zéro quand elle est fermée. */
  resteMs: number;
  /** L'instant du dernier message REÇU, celui qui a ouvert la fenêtre. */
  depuis?: string;
};

/** LA FENÊTRE SE COMPTE SUR SON DERNIER MESSAGE À ELLE, jamais sur le nôtre.

    C'est la faute naturelle : on croit qu'écrire prolonge la conversation.
    Non — seul ce qu'ELLE envoie rouvre les 24 heures. Une Maison qui
    compterait ses propres messages croirait la fenêtre ouverte et verrait
    ses envois refusés sans comprendre. */
export function fenetreDe(messages: readonly MessageWa[], maintenant: number): Fenetre {
  let dernier = 0;
  let quand: string | undefined;
  for (const m of messages) {
    if (m.sens !== 'entrant' || m.canal === 'site') continue;
    const t = Date.parse(m.quand);
    if (Number.isFinite(t) && t > dernier) { dernier = t; quand = m.quand; }
  }
  if (!dernier) return { ouverte: false, resteMs: 0 };
  const reste = dernier + FENETRE_MS - maintenant;
  return { ouverte: reste > 0, resteMs: reste > 0 ? reste : 0, depuis: quand };
}

/** « 22 h 56 », « 1 h 20 », « 14 min » — le temps qui reste, tel qu'on le dit.
    Sous l'heure on passe aux minutes : « 0 h 14 » se lit mal et inquiète mal. */
export const resteEnClair = (ms: number): string => {
  if (ms <= 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r > 0 ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
};

/* ── LES FILS ────────────────────────────────────────────────────────── */

/* ══ TROIS TIROIRS, UN NUMÉRO — 15 septembre 2026 ═══════════════════

   « How can this be done and arrive directly on the trone with employees
   and prestataires » (Yéman). Maquette `maquette-lequipe-sur-whatsapp.html`.

   LE NUMÉRO DE LA MAISON NE CONNAISSAIT QUE LES CLIENTES. Une maître qui
   écrit, un menuisier qui envoie son devis tombaient « sans fiche », à côté
   de leur propre fiche d'équipe ou de fournisseur. Trois tiroirs désormais,
   et LA BASE FERME LES DEUX DERNIERS À LA DIRECTION (0102) : ici on ne fait
   que nommer, ranger et afficher.

   L'ÉQUIPE D'ABORD. Une employée qui est aussi cliente va dans Équipe, avec
   un lien vers sa fiche cliente : ce qu'elle dit de son congé ne se lit pas
   parmi les clientes. C'est la décision du 15 septembre, et `RANG_DU_TIROIR`
   la porte — la même priorité que `tete_du_numero()` en base. */
export type Tiroir = 'clientes' | 'equipe' | 'prestataires';
export const TIROIRS: readonly Tiroir[] = ['clientes', 'equipe', 'prestataires'];
export const TIROIR_DIT: Record<Tiroir, string> = {
  clientes: 'Clientes', equipe: 'Équipe', prestataires: 'Prestataires',
};
const RANG_DU_TIROIR: Record<Tiroir, number> = { equipe: 0, prestataires: 1, clientes: 2 };
/** Un tiroir que la base réserve à la direction. */
export const estReserve = (t: Tiroir | undefined): boolean => t === 'equipe' || t === 'prestataires';

/* ══ CHERCHER UN FIL — 2 octobre 2026 ════════════════════════════════════
   « Comment rechercher une conversation ? Le nom d'une cliente ? » (Yéman).
   On cherche comme on se souvient : un bout de nom (sans se soucier des
   accents ni des majuscules), quelques chiffres du numéro, ou un mot qu'elle
   a écrit. Tous les mots tapés doivent se trouver. */
const sansAccents = (t: string): string => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function filCorrespond(f: { nom: string; numero: string; messages: readonly { texte?: string }[] }, recherche: string): boolean {
  /* Un numéro se tape par paires (« 97 71 16 ») : on recolle les chiffres
     avant de couper en mots, sinon chaque paire serait un mot trop court. */
  const mots = sansAccents(recherche).replace(/(\d)[\s.-]+(?=\d)/g, '$1').trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return true;
  const nom = sansAccents(f.nom);
  const chiffres = f.numero.replace(/\D/g, '');
  const textes = f.messages.map((m) => sansAccents(m.texte ?? '')).join(' ');
  return mots.every((mot) => {
    const enChiffres = mot.replace(/\D/g, '');
    if (enChiffres.length >= 3 && enChiffres.length === mot.replace(/[\s+().-]/g, '').length) return chiffres.includes(enChiffres);
    return nom.includes(mot) || textes.includes(mot);
  });
}

/* ══ EFFACER UN FIL — 2 octobre 2026 ═════════════════════════════════════
   « Comment supprimer des conversations comme dans WhatsApp ? » (Yéman).
   Arbitrage au sélecteur : on EFFACE les fils SANS FICHE (spams, inconnus,
   numéros de passage), la direction seule, après confirmation, sur tous les
   postes. Le fil d'une personne qui a une fiche ne s'efface pas : il
   s'archive, son histoire appartient à la Maison. */
export const filEffacable = (f: { sansFiche: boolean; messages: readonly unknown[] }): boolean =>
  f.sansFiche && f.messages.length > 0;

export type Fil = {
  /** La clé du fil : le numéro réduit. Une tête sans fiche en a un aussi. */
  numero: string;
  clientId?: string;
  /** Le nom à afficher : celui de la fiche, sinon le profil WhatsApp, sinon
      le numéro lui-même. Jamais « Inconnu » tout court : un fil qu'on ne
      sait pas nommer ne se rouvre pas. */
  nom: string;
  /** Sans fiche : l'écran propose de l'attacher, il ne crée jamais seul. */
  sansFiche: boolean;
  prive: boolean;
  messages: MessageWa[];
  dernier: MessageWa;
  /** LE DERNIER MESSAGE QUI COMPTE · 10 octobre 2026 (revue) : le dernier,
      modèles partis seuls et mots de l'automate sautés. C'est sur lui que se
      juge `attendUneReponse`, et c'est lui que l'alarme doit montrer : sa
      question, pas la confirmation automatique arrivée derrière. */
  dernierQuiCompte: MessageWa;
  fenetre: Fenetre;
  /** Le dernier mot vient d'elle et personne n'a répondu. */
  attendUneReponse: boolean;
  /** Son tiroir : celui de sa tête, sinon celui que la base a écrit sur ses
      messages (une personne partie de l'équipe garde un fil réservé). */
  tiroir: Tiroir;
  /** Où s'ouvre sa fiche dans le Trône, quand elle en a une. */
  fiche?: string;
  /** CE QUE LA RÉPONSE AUTOMATIQUE EN FAIT · 9 octobre 2026 : tenu, en
      pause, main passée, fini (`vueDeLAutomate`, shared/automate-wa).
      Absent : l'automate n'a jamais touché ce fil. */
  automate?: VueDeLAutomate;
};

export type TeteConnue = {
  id: string;
  name: string;
  phone?: string;
  phone2?: string;
  branchId: string;
  /** Absent = une cliente : c'est ce qu'étaient toutes les têtes avant. */
  tiroir?: Tiroir;
  /** Le chemin de sa fiche dans le Trône. */
  fiche?: string;
};

/** TOUTES LES TÊTES QUE LE NUMÉRO PEUT RECONNAÎTRE, dans un seul carnet.
    Les formes sont réduites au strict nécessaire : ce module ne connaît ni
    la fiche d'équipe ni le fournisseur, seulement un nom et des numéros. */
export function tetesDeLaMaison(o: {
  clientes: readonly { id: string; name: string; phone?: string; phone2?: string; branchId: string }[];
  equipe?: readonly { id: string; name: string; phone?: string; branchId: string }[];
  prestataires?: readonly { id: string; name: string; phone?: string; branchId: string; archived?: boolean }[];
  fournisseurs?: readonly { id: string; nom: string; telephone?: string; branchId: string; actif?: boolean }[];
  /** LES PRESTATAIRES D'UN ENGAGEMENT SANS FICHE FOURNISSEUR — 19 septembre
      2026. « Est-ce possible de rattacher la fiche automatiquement au numéro
      qui écrit ? » (Yéman), devant un menuisier à qui l'on venait d'annoncer
      un versement et que l'écran disait « sans fiche ». Depuis le 17, son
      numéro vit sur le DOSSIER (`telephone`) quand il n'a pas de fiche
      fournisseur ; avec une fiche, c'est elle qui le porte, et elle est déjà
      lue ci-dessus. Le clic mène au dossier lui-même. */
  engagements?: readonly { id: string; prestataire: string; telephone?: string; fournisseurId?: string; branchId: string }[];
}): TeteConnue[] {
  return [
    ...(o.equipe ?? []).map((m): TeteConnue => ({
      id: m.id, name: m.name, phone: m.phone, branchId: m.branchId, tiroir: 'equipe', fiche: '/personnel',
    })),
    ...(o.prestataires ?? []).filter((p) => !p.archived).map((p): TeteConnue => ({
      id: p.id, name: p.name, phone: p.phone, branchId: p.branchId, tiroir: 'prestataires', fiche: '/prestataires',
    })),
    ...(o.fournisseurs ?? []).filter((f) => f.actif !== false).map((f): TeteConnue => ({
      id: f.id, name: f.nom, phone: f.telephone, branchId: f.branchId, tiroir: 'prestataires', fiche: '/engagements',
    })),
    ...(o.engagements ?? []).filter((e) => !e.fournisseurId && e.telephone?.trim()).map((e): TeteConnue => ({
      id: e.id, name: e.prestataire, phone: e.telephone, branchId: e.branchId, tiroir: 'prestataires',
      fiche: `/engagements?id=${encodeURIComponent(e.id)}`,
    })),
    ...o.clientes.map((c): TeteConnue => ({
      id: c.id, name: c.name, phone: c.phone, phone2: c.phone2, branchId: c.branchId,
      tiroir: 'clientes', fiche: `/customers?id=${c.id}`,
    })),
  ];
}

/** LA TÊTE D'UN NUMÉRO, l'équipe d'abord. `undefined` pour un inconnu. */
export function teteDuNumero(numero: string | undefined, tetes: readonly TeteConnue[]): TeteConnue | undefined {
  const n = numeroWa(numero);
  if (!n) return undefined;
  let trouvee: TeteConnue | undefined;
  for (const t of tetes) {
    if (numeroWa(t.phone) !== n && numeroWa(t.phone2) !== n) continue;
    if (!trouvee || RANG_DU_TIROIR[t.tiroir ?? 'clientes'] < RANG_DU_TIROIR[trouvee.tiroir ?? 'clientes']) trouvee = t;
  }
  return trouvee;
}

/** LE TIROIR D'UN FIL SANS TÊTE : ce que la base a écrit sur ses messages.
    Une seule ligne réservée réserve le fil — même règle qu'en 0102. */
const tiroirDesMessages = (messages: readonly Pick<MessageWa, 'tiroir'>[]): Tiroir => {
  let t: Tiroir = 'clientes';
  for (const m of messages) {
    if (m.tiroir && RANG_DU_TIROIR[m.tiroir] < RANG_DU_TIROIR[t]) t = m.tiroir;
  }
  return t;
};

/** LES FILS DE LA MAISON, du plus vif au plus calme.

    L'ORDRE EST UNE PRIORITÉ, PAS UNE DATE. Celles qui attendent une réponse
    remontent, quel que soit le jour : un fil d'hier sans réponse presse plus
    qu'un fil de ce matin déjà traité. Le reste suit par date. */
export function filsDeLaMaison(
  messages: readonly MessageWa[],
  tetes: readonly TeteConnue[],
  prives: readonly string[],
  maintenant: number,
  branchId?: string,
  /** CE QUE LA RÉPONSE AUTOMATIQUE FAIT DE CHAQUE NUMÉRO (9 octobre 2026),
      tiré de `fils_automate` par `automatesDesFils`. Absent : l'écran juge
      comme avant, un message de l'automate ne répondant toujours pas. */
  automates?: AutomatesDesFils,
): Fil[] {
  /* LE RAPPROCHEMENT PAR NUMÉRO, LES DEUX LIGNES DE LA FICHE. Le second
     numéro est un recours (un mari, une sœur) : un message qui en vient
     appartient tout de même à sa tête, et le classer « inconnu » à côté de
     sa propre fiche serait la faute la plus vexante de l'écran. */
  /* L'ÉQUIPE D'ABORD quand un numéro est sur deux fiches : une employée qui
     est aussi cliente se lit dans Équipe (décision du 15 septembre). */
  const parNumero = new Map<string, TeteConnue>();
  for (const t of tetes) {
    for (const brut of [t.phone, t.phone2]) {
      const n = numeroWa(brut);
      if (!n) continue;
      const deja = parNumero.get(n);
      if (!deja || RANG_DU_TIROIR[t.tiroir ?? 'clientes'] < RANG_DU_TIROIR[deja.tiroir ?? 'clientes']) parNumero.set(n, t);
    }
  }

  const paquets = new Map<string, MessageWa[]>();
  for (const m of messages) {
    const n = numeroWa(m.numero);
    if (!n) continue;
    const tete = parNumero.get(n);
    /* LA BRANCHE SE LIT SUR LA FICHE, pas sur le message : un message reçu
       ne sait pas de quelle maison il relève. Un fil SANS fiche appartient à
       toutes les branches, faute de savoir — le cacher reviendrait à perdre
       une cliente qui écrit pour la première fois. */
    if (branchId && tete && tete.branchId !== branchId) continue;
    const p = paquets.get(n);
    if (p) p.push(m); else paquets.set(n, [m]);
  }

  const fils: Fil[] = [];
  for (const [numero, liste] of paquets) {
    liste.sort((a, b) => a.quand.localeCompare(b.quand));
    const tete = parNumero.get(numero);
    const dernier = liste[liste.length - 1];
    /* ══ UN MODÈLE PARTI TOUT SEUL NE RÉPOND À PERSONNE — 18 septembre 2026 ══
       Un fil se disait « répondu » dès que son dernier message était sortant.
       Or la Maison envoie seule ses rappels (depuis le 11), ses
       confirmations et ses accusés (depuis le 18) : une cliente qui écrit
       « je peux décaler ? », puis reçoit sa confirmation automatique, voyait
       son fil passer pour traité, et l’alarme s’éteignait sans que personne
       ait lu sa question. Le juge regarde donc le dernier message qui COMPTE :
       un modèle envoyé automatiquement n’en est pas un. Ce qu’une personne
       écrit de sa main, modèle ou non, répond toujours. */
    /* ══ L'AUTOMATE NE RÉPOND PAS À LA PLACE DE LA MAISON · 9 octobre 2026 ══
       Ses messages (`auto: 'automate'`) se sautent comme les modèles partis
       seuls : s'il échoue, se tait ou passe la main, la question d'elle reste
       la dernière qui compte, et l'alarme sonne. Ce qui l'éteint, c'est le fil
       lui-même (`laReponseDeLAutomateSuffit`) : un parcours qu'il mène et dont
       il a traité le dernier mot n'attend pas la Maison. */
    const dernierQuiCompte = [...liste].reverse()
      .find((x) => !(x.sens === 'sortant'
        && ((!!x.modele && estEnvoiAutomatique(x.parQui)) || x.auto === 'automate'))) ?? dernier;
    const elleAttend = dernierQuiCompte.sens === 'entrant';
    const auto = automates?.get(numero);
    const vue = vueDuNumero(automates, numero, maintenant);
    /* UNE RÉPONSE DE L'AUTOMATE QUE META N'A PAS REMISE ne répond à rien
       (relecture du 9 octobre 2026) : acceptée à l'envoi, elle est revenue
       « non remis » par l'accusé. Elle attend toujours, l'alarme sonne. */
    const reponseNonRemise = elleAttend && liste.some((x) => x.sens === 'sortant' && x.auto === 'automate'
      && x.etat === 'non-remis' && x.quand >= dernierQuiCompte.quand);
    const repondueParLAutomate = elleAttend && !reponseNonRemise && !!vue && !!auto
      && laReponseDeLAutomateSuffit(vue.tenue, auto.fil, dernierQuiCompte.quand, maintenant);
    fils.push({
      numero,
      /* `clientId` reste celui d'une CLIENTE : une tête d'équipe ne l'est
         pas, et les gestes du fil (facture, relevé, promo) ne la concernent
         pas. */
      clientId: tete && (tete.tiroir ?? 'clientes') === 'clientes' ? tete.id : undefined,
      nom: tete?.name ?? liste.find((m) => m.nomProfil)?.nomProfil ?? numero,
      sansFiche: !tete,
      prive: prives.includes(numero),
      messages: liste,
      dernier,
      dernierQuiCompte,
      fenetre: fenetreDe(liste, maintenant),
      attendUneReponse: elleAttend && !repondueParLAutomate,
      tiroir: tete?.tiroir ?? tiroirDesMessages(liste),
      fiche: tete?.fiche,
      ...(vue ? { automate: vue } : {}),
    });
  }

  return fils.sort((a, b) =>
    Number(b.attendUneReponse) - Number(a.attendUneReponse)
    || b.dernier.quand.localeCompare(a.dernier.quand));
}

/** POURQUOI CE MESSAGE NE PEUT PAS PARTIR — ou `null` s'il le peut.

    LE REFUS SE DIT AVANT LE CLIC, jamais après. Laisser partir puis afficher
    l'erreur de Meta, c'est faire découvrir la règle un message sur deux, en
    langue étrangère et sans remède. */
export function pourquoiLEnvoiEstImpossible(o: {
  texte: string;
  fenetre: Fenetre;
  /** Un modèle approuvé passe hors fenêtre : c'est tout son objet. */
  modele?: string;
  numero: string;
}): string | null {
  if (!numeroWa(o.numero)) return 'Ce fil n’a pas de numéro lisible.';
  if (o.modele) return null;
  if (!o.texte.trim()) return 'Le message est vide.';
  if (!o.fenetre.ouverte) {
    return o.fenetre.depuis
      ? 'La fenêtre de 24 heures est fermée. WhatsApp n’accepte plus qu’un modèle approuvé.'
      : 'Elle ne vous a jamais écrit : seul un modèle approuvé peut ouvrir la conversation.';
  }
  return null;
}

/* ══ LE NUMÉRO MÈNE AU TRÔNE, PAS DEHORS — 14 septembre 2026 ═════════

   « Quand je clique le numéro WhatsApp dans Clientes et dans Carnet,
   j'aimerais que ça m'ouvre la page WhatsApp dans Conversations directement
   dans le Trône. Ne sors pas du Trône » (Yéman).

   C'ÉTAIT UNE INCOHÉRENCE, ET ELLE DATAIT D'AVANT LES CONVERSATIONS. Les
   numéros ouvraient `wa.me` — un onglet de plus, une autre application, et
   surtout un message écrit AILLEURS : le Trône n'en gardait aucune trace, la
   cliente répondait dans un fil que la Maison ne voyait pas, et la
   conversation se coupait en deux. Depuis le 11 septembre, le Trône SAIT
   parler ; il n'y a plus aucune raison d'en sortir.

   UN MESSAGE PRÉ-ÉCRIT VOYAGE AVEC. Plusieurs endroits de la Maison
   ouvraient `wa.me` AVEC un texte déjà composé — le rappel de la veille, la
   relance d'un impayé, le mot d'anniversaire. Ce texte suit : il se retrouve
   dans la zone de saisie des Conversations, prêt à être relu. On garde donc
   le geste, on change seulement l'endroit où il aboutit. */
/** L'AUTRE PORTE — l'application WhatsApp du téléphone.

    ── DEUX PORTES, PAS UNE — 15 septembre 2026 ──────────────────────
    « Je veux garder la possibilité d'ouvrir le wa.me WhatsApp app de mon
    téléphone et en même temps la possibilité de rester dans le Trône »
    (Yéman).

    LA VEILLE, J'AVAIS TROP CORRIGÉ. Dix-neuf liens sortaient du Trône, et je
    les ai tous ramenés dedans — ce qui était juste pour la trace, et faux
    pour la main. Il y a des moments où l'on VEUT l'application : au bout du
    salon sans la tablette, pour un vocal, pour une photo prise à l'instant,
    pour ce que le Trône ne sait pas encore faire.

    CE QU'IL FAUT SAVOIR EN SORTANT, et l'écran le dit : un message écrit dans
    l'application n'entre PAS dans le fil de la Maison. Ce n'est pas un défaut
    à corriger, c'est le prix de cette porte-là — WhatsApp ne raconte à
    personne ce qu'on tape dans son application. On choisit donc en sachant,
    au lieu de le découvrir. */
export const lienWaMe = (
  brut: string | undefined, texte?: string,
): string | null => {
  const n = numeroWa(brut);
  if (!n) return null;
  const t = (texte ?? '').trim();
  return t ? `https://wa.me/${n}?text=${encodeURIComponent(t)}` : `https://wa.me/${n}`;
};

export const cheminDeLaConversation = (
  brut: string | undefined, texte?: string,
): string | null => {
  const n = numeroWa(brut);
  if (!n) return null;
  /* LE TEXTE EST BORNÉ. Une adresse trop longue se fait couper par certains
     navigateurs, et un message tronqué au milieu d'une phrase est pire qu'un
     message absent. Mille signes couvrent largement tout ce que la Maison
     écrit d'un geste. */
  const t = (texte ?? '').trim().slice(0, 1000);
  return t ? `/conversations?n=${n}&t=${encodeURIComponent(t)}` : `/conversations?n=${n}`;
};

/** LE MÊME FIL, PRÊT À ÊTRE POSÉ DANS UN `href` — 17 septembre 2026.

    `cheminDeLaConversation` rend une ROUTE du Trône. Un `<Link to=…>` et un
    `navigate(…)` la comprennent ; un `href` brut, NON : le navigateur la
    résout sur la RACINE du domaine. La cloche de rappel du calendrier l'a
    appris en production, en ouvrant « Site not found » (capture de Yéman).

    Le Trône route par le dièse : cette fonction le pose, pour que le lien
    d'un fil soit posable partout sans y penser. */
export const lienDuFil = (
  brut: string | undefined, texte?: string,
): string | null => {
  const chemin = cheminDeLaConversation(brut, texte);
  return chemin ? `#${chemin}` : null;
};

/* ══ UN FIL QUI N'EXISTE PAS ENCORE ══════════════════════════════════

   LA PLUPART DES TÊTES N'ONT JAMAIS ÉCRIT. Un fil naît du premier message
   reçu : ouvrir le numéro d'une cliente qui ne s'est jamais manifestée ne
   trouverait donc RIEN, et l'écran resterait vide sans rien expliquer — ce
   qui serait pire que l'ancien lien vers `wa.me`.

   ON FABRIQUE DONC UN FIL VIDE, et il dit la vérité : elle ne vous a jamais
   écrit, la fenêtre est fermée, seul un modèle approuvé peut ouvrir la
   conversation. C'est exactement ce que WhatsApp permet, ni plus ni moins, et
   l'écran le portait déjà pour les fils refroidis. */
export function filNeuf(numero: string, tete?: TeteConnue): Fil | null {
  const n = numeroWa(numero);
  if (!n) return null;
  /* UN FIL SANS MESSAGE N'A PAS DE DERNIER. On en fabrique un, jamais rendu à
     l'écran (la liste est vide), mais que le reste du code peut lire sans se
     garder à chaque ligne — `dernier` est promis par le type. */
  const fantome: MessageWa = {
    id: `neuf-${n}`, sens: 'entrant', numero: n, texte: '', quand: new Date(0).toISOString(),
  };
  return {
    numero: n,
    clientId: tete && (tete.tiroir ?? 'clientes') === 'clientes' ? tete.id : undefined,
    nom: tete?.name ?? `+${n}`,
    sansFiche: !tete,
    prive: false,
    messages: [],
    dernier: fantome,
    dernierQuiCompte: fantome,
    tiroir: tete?.tiroir ?? 'clientes',
    fiche: tete?.fiche,
    /* JAMAIS OUVERTE : elle n'a rien écrit, donc rien n'a démarré la fenêtre
       de 24 heures. `depuis` reste absent, et l'écran dit « elle ne vous a
       jamais écrit » plutôt que « la fenêtre est fermée » — ce n'est pas la
       même chose, et le remède non plus. */
    fenetre: { ouverte: false, resteMs: 0 },
    attendUneReponse: false,
  };
}

/** LE MESSAGE QUE CELUI-CI CITE, retrouvé dans le fil.

    Il peut manquer : un fil ne remonte pas à l'infini, et elle peut citer un
    message d'il y a six mois. L'écran doit alors dire « un message plus
    ancien » plutôt que de faire semblant. */
export const messageCite = (
  messages: readonly MessageWa[], citeWaId: string | undefined,
): MessageWa | undefined =>
  (citeWaId ? messages.find((m) => m.waId === citeWaId) : undefined);

/* ══ CE QUE META FACTURE VRAIMENT — 15 septembre 2026 ════════════════

   « Combien Meta facture une conversation de 24 h ? » (Yéman).

   CE MODÈLE N'EXISTE PLUS, et trois écrans de la Maison le racontaient
   encore. Jusqu'en juin 2025, Meta facturait À LA CONVERSATION : une fenêtre
   de 24 heures ouverte par un modèle se payait une fois, et tout ce qui
   suivait était compris.

   DEPUIS LE 1er JUILLET 2025, C'EST AU MESSAGE. Et la nuance n'est pas
   cosmétique, elle change la décision :

     · la FENÊTRE DE SERVICE est gratuite — quand elle vous écrit, les
       24 heures qui suivent ne coûtent rien, autant de messages qu'on veut ;
     · un MODÈLE ENVOYÉ DANS une fenêtre ouverte est gratuit lui aussi ;
     · ce qui se paie, c'est un MODÈLE ENVOYÉ HORS FENÊTRE, au message, et le
       tarif dépend de sa catégorie (marketing, utilitaire, authentification)
       et du pays.

   Sous l'ancien modèle, une fois la conversation payée on pouvait tout dire.
   Aujourd'hui, chaque modèle hors fenêtre compte, et répondre ensuite dans la
   fenêtre ne coûte rien.

   ON COMPTE DES MESSAGES, PAS DES FRANCS. La Maison n'a pas les tarifs du
   Bénin, ils bougent, et les inventer mettrait un chiffre faux sous les yeux
   de quelqu'un qui déciderait dessus. Le compteur dit COMBIEN ; le tarif se
   lit chez Meta. */

/* ══ LE 1er OCTOBRE 2026, LA FENÊTRE SE PAIE — 15 septembre 2026 ══════

   CE QUI PRÉCÈDE CESSE D'ÊTRE VRAI LE 1er OCTOBRE 2026. Meta l'a écrit dans
   sa documentation (« Upcoming pricing updates », messages hors modèle) :

     · une RÉPONSE LIBRE dans la fenêtre se paie au message, au tarif des
       utilitaires du pays. Chaque numéro reçoit 1 000 réponses gratuites
       par mois, sans report d'un mois sur l'autre ;
     · un MODÈLE UTILITAIRE envoyé dans une fenêtre ouverte se paie aussi.

   UNE ERREUR PLUS ANCIENNE SE CORRIGE AU PASSAGE. Même avant octobre, seul
   un modèle UTILITAIRE était offert dans la fenêtre : un modèle marketing
   s'est toujours payé. Le compteur tenait `avis_google` pour gratuit dès
   qu'elle avait écrit la veille ; il le compte désormais facturé.

   LA DATE EST DANS LE CODE, PAS DANS UNE MISE EN LIGNE. Les écrans lisent
   `laFenetreSePaie()` et changent de phrase d'eux-mêmes le 1er octobre :
   rien à republier ce jour-là, et rien d'annoncé trop tôt d'ici là. */

/** L'instant où la fenêtre cesse d'être gratuite, minuit UTC. */
export const LA_FENETRE_SE_PAIE_DES = Date.parse('2026-10-01T00:00:00Z');
/** Les réponses libres offertes chaque mois, par numéro de la Maison. */
export const REPONSES_GRATUITES_DU_MOIS = 1000;
export const laFenetreSePaie = (instant: number = Date.now()): boolean =>
  instant >= LA_FENETRE_SE_PAIE_DES;

/** LA CATÉGORIE META DE CHAQUE MODÈLE, telle qu'approuvée (voir
    docs/BRANCHER-ENVOIS.md). Un modèle absent d'ici est tenu pour marketing :
    on répond « facturé » quand on ne sait pas. Un modèle nouvellement
    approuvé s'ajoute ici le jour même. */
export const CATEGORIE_DES_MODELES: Readonly<Record<string, 'utilitaire' | 'marketing'>> = {
  rappel_rdv: 'utilitaire',
  confirmation_rdv: 'utilitaire',
  /* LA REPRISE PROPOSÉE — 29 septembre 2026 : elle rappelle un rendez-vous
     déjà posé et demande de le tenir. Utilitaire, comme le rappel. */
  reprise_proposee: 'utilitaire',
  avis_google: 'marketing',
  /* L'ÉQUIPE ET LES PRESTATAIRES — 15 septembre 2026, à faire approuver
     (docs/BRANCHER-ENVOIS.md, étape 6). Tous utilitaires : un bulletin, une
     décision, une annonce de versement ne vendent rien. */
  bulletin_du_mois: 'utilitaire',
  decision_conge: 'utilitaire',
  versement_engagement: 'utilitaire',
  /* LA FIN DE PAQUET — 15 septembre 2026 (étape 7). Il informe, il ne vend
     pas : c'est ce qui le garde utilitaire. */
  fin_de_paquet: 'utilitaire',
  /* LE BILAN DE SÉANCE — 4 octobre 2026, à faire approuver : il remet un
     document après une séance, il ne vend rien. */
  bilan_de_seance: 'utilitaire',
};

/** Le modèle de la fin de paquet, envoyé par le Trône lui-même
    (`shared/fin-de-paquet.ts`). */
export const MODELE_FIN_DE_PAQUET = 'fin_de_paquet';

/** LES MODÈLES DE L'ÉQUIPE ET DES PRESTATAIRES, par leur nom Meta. Ils ne
    s'envoient pas depuis le fil : chacun part de l'écran qui décide (la Paie,
    Temps & absences, les Engagements), avec ses variables. */
export const MODELE_BULLETIN = 'bulletin_du_mois';
export const MODELE_DECISION_CONGE = 'decision_conge';
export const MODELE_VERSEMENT = 'versement_engagement';

/** CE MODÈLE A-T-IL ÉTÉ FACTURÉ ?

    ON NE L'A PAS ÉCRIT AU MOMENT DE L'ENVOI, et c'est trop tard pour les
    messages d'hier, mais on peut le RETROUVER. Un modèle n'est gratuit qu'à
    trois conditions : il est UTILITAIRE, il est parti AVANT le 1er octobre
    2026, et elle avait écrit dans les 24 heures d'avant. Le fil porte tout
    cela depuis toujours.

    ON RÉPOND « FACTURÉ » QUAND ON NE SAIT PAS. Un compteur qui sous-estime la
    dépense ne sert à rien : mieux vaut annoncer un peu trop que rassurer à
    tort. */
export function modeleFacture(
  m: Pick<MessageWa, 'sens' | 'modele' | 'numero' | 'quand'>,
  tous: readonly Pick<MessageWa, 'sens' | 'numero' | 'quand'>[],
): boolean {
  if (m.sens !== 'sortant' || !m.modele) return false;
  const quand = Date.parse(m.quand);
  if (!Number.isFinite(quand)) return true;
  if (CATEGORIE_DES_MODELES[m.modele] !== 'utilitaire') return true;
  if (laFenetreSePaie(quand)) return true;
  const n = numeroWa(m.numero);
  return !tous.some((x) => x.sens === 'entrant'
    && numeroWa(x.numero) === n
    && Date.parse(x.quand) <= quand
    && quand - Date.parse(x.quand) < FENETRE_MS);
}

export type CompteDesModeles = {
  /** « 2026-09 ». */
  mois: string;
  /** Tous les modèles partis ce mois-ci, gratuits compris. */
  envoyes: number;
  /** Ceux que Meta facture. */
  factures: number;
  /** Les utilitaires partis dans une fenêtre ouverte, avant le 1er octobre 2026. */
  gratuits: number;
  /** Le détail par modèle, du plus envoyé au moins envoyé. */
  parModele: { nom: string; factures: number; gratuits: number }[];
  /** LES RÉPONSES LIBRES DU MOIS qui entrent dans le palier de Meta. Zéro
      pour un mois d'avant octobre 2026 : elles ne se comptaient pas. */
  reponses: number;
  /** Au-delà des réponses gratuites du mois : celles que Meta facture. */
  reponsesFacturees: number;
};

/** UNE RÉPONSE QUE META COMPTE : sortante, écrite sans modèle, pas refusée.
    Une réaction ou un accusé de lecture ne sont pas des messages du fil. Une
    heure illisible compte : on répond « facturé » quand on ne sait pas. */
const reponseQuiCompte = (m: MessageWa): boolean => {
  if (m.sens !== 'sortant' || m.modele || m.etat === 'non-remis') return false;
  const t = Date.parse(m.quand);
  return !Number.isFinite(t) || laFenetreSePaie(t);
};

/** CE QUE LA MAISON A ENVOYÉ CE MOIS-CI, modèle par modèle, et ses réponses. */
export function compteDesModeles(
  messages: readonly MessageWa[], mois: string, branchId?: string,
): CompteDesModeles {
  const duMois = messages.filter((m) => m.sens === 'sortant' && m.modele
    && (m.quand ?? '').slice(0, 7) === mois
    && (!branchId || !m.branchId || m.branchId === branchId));
  const par = new Map<string, { factures: number; gratuits: number }>();
  let factures = 0;
  for (const m of duMois) {
    const nom = m.modele as string;
    const ligne = par.get(nom) ?? { factures: 0, gratuits: 0 };
    if (modeleFacture(m, messages)) { ligne.factures += 1; factures += 1; } else ligne.gratuits += 1;
    par.set(nom, ligne);
  }
  /* LE PALIER EST PAR NUMÉRO, PAS PAR BRANCHE. Les branches partagent le
     numéro de la Maison : les compter chacune à part ferait croire à deux
     paliers là où Meta n'en offre qu'un. */
  const reponses = messages.filter((m) => (m.quand ?? '').slice(0, 7) === mois && reponseQuiCompte(m)).length;
  return {
    mois,
    envoyes: duMois.length,
    factures,
    gratuits: duMois.length - factures,
    parModele: [...par.entries()]
      .map(([nom, l]) => ({ nom, ...l }))
      .sort((a, b) => (b.factures + b.gratuits) - (a.factures + a.gratuits) || a.nom.localeCompare(b.nom)),
    reponses,
    reponsesFacturees: Math.max(0, reponses - REPONSES_GRATUITES_DU_MOIS),
  };
}

/* ══ LES HUIT SECONDES QUI SAUVENT — 14 septembre 2026 ═══════════════

   Derrière « je voudrais éditer », il y a presque toujours une faute qu'on
   vient de voir partir. Le meilleur remède n'est pas de la corriger : c'est
   de ne pas l'envoyer.

   LE MESSAGE PARAIT DANS LE FIL TOUT DE SUITE, mais il ne quitte la Maison
   qu'au bout du délai. Pendant ce temps, un seul geste : le retenir. C'est le
   seul vrai « annuler l'envoi » qui existe, et il ne demande la permission de
   personne — ni celle de Meta, ni celle de la cliente.

   HUIT SECONDES, ET PAS TROIS. Trois ne suffisent pas à relire ; trente font
   attendre le comptoir pour rien. Huit, c'est le temps du réflexe : on
   appuie, on relit, on voit la faute. Zéro coupe la retenue pour qui n'en
   veut pas. */
export const DELAI_DE_RETENUE_MS = 8000;

/** Le délai tel qu'il est réglé, borné à ce qui a du sens. Au-delà d'une
    minute ce n'est plus une retenue, c'est une file d'attente. */
export const delaiDeRetenue = (secondes: number | undefined): number => {
  const s = Number(secondes);
  if (!Number.isFinite(s) || s < 0) return DELAI_DE_RETENUE_MS;
  return Math.min(60, Math.round(s)) * 1000;
};

/** CE QU'IL RESTE À ATTENDRE, en secondes entières, pour l'afficher. */
export const resteDeLaRetenue = (posteLe: number, delaiMs: number, maintenant: number): number =>
  Math.max(0, Math.ceil((posteLe + delaiMs - maintenant) / 1000));

/** CE QUE `keepalive` PORTE ENCORE — 10 octobre 2026 (revue). Le navigateur
    refuse toute requête `keepalive` dont le corps dépasse 64 Kio, et le refus
    se perd en silence : l'onglet est déjà fermé. Une photo de 50 Ko, en
    base64 dans le corps, suffit à passer la borne. On garde une marge sous la
    limite, comptée en OCTETS (un accent en vaut deux). */
export const KEEPALIVE_MAX_OCTETS = 60_000;

/** LE CORPS D'UN ENVOI PEUT-IL PARTIR PAR `keepalive` en fermant l'onglet ?
    Sinon, il se garde sur l'appareil et part à la prochaine ouverture. */
export const partEnFermant = (corpsJson: string): boolean =>
  new TextEncoder().encode(corpsJson).length <= KEEPALIVE_MAX_OCTETS;

/* ══ RATTACHER UN NUMÉRO À UNE FICHE — 10 octobre 2026 (revue) ═════════
   Une fiche porte deux numéros. Le premier ne s'écrase jamais : c'est celui
   des rappels. Le second s'écrivait sans regarder s'il était pris, et l'ancien
   second (un mari, une sœur) disparaissait de la fiche en silence : ses
   messages ne rejoignaient plus la tête. Il ne se remplace plus qu'avec
   l'accord d'une main, qui lit le numéro qu'elle remplace. */
export type Rattachement =
  /** Le numéro est déjà sur la fiche : rien à écrire, seul le fil la rejoint. */
  | { geste: 'deja' }
  /** Une place est libre : on y écrit le numéro. */
  | { geste: 'ecrire'; champ: 'phone' | 'phone2' }
  /** Les deux places sont prises : remplacer le second demande un accord. */
  | { geste: 'remplacer'; champ: 'phone2'; ancien: string };

export function rattachementDuNumero(
  fiche: { phone?: string; phone2?: string },
  numero: string,
): Rattachement {
  const n = numeroWa(numero);
  const premier = numeroWa(fiche.phone);
  const second = numeroWa(fiche.phone2);
  if (n && (n === premier || n === second)) return { geste: 'deja' };
  if (!premier) return { geste: 'ecrire', champ: 'phone' };
  if (!second) return { geste: 'ecrire', champ: 'phone2' };
  return { geste: 'remplacer', champ: 'phone2', ancien: second };
}

/* ══ RÉÉCRIRE UN MESSAGE PARTI ═══════════════════════════════════════ */

/** POURQUOI CE MESSAGE NE SE RÉÉCRIT PAS — la phrase du comptoir, ou `null`.

    QUI L'A ÉCRIT, ET LA DIRECTION. Réécrire efface du fil ce que la cliente a
    pourtant reçu : ce n'est pas un geste anodin, et il se rattache à un nom.
    La trace de la base dit qui, dans tous les cas. */
export function pourquoiOnNeReecritPas(o: {
  message: Pick<MessageWa, 'sens' | 'modele' | 'etat' | 'parQui' | 'type'>;
  moi?: string;
  estDirection: boolean;
}): string | null {
  const m = o.message;
  if (m.sens !== 'sortant') return 'On ne réécrit que ce que la Maison a écrit.';
  /* UN MODÈLE EST UN TEXTE APPROUVÉ PAR META : le réécrire dans le fil
     laisserait croire qu'on a envoyé autre chose que ce que Meta a validé. */
  if (m.modele) return 'Un modèle approuvé ne se réécrit pas : son texte est celui que Meta a validé.';
  if (m.type && m.type !== 'text') return 'Seul un message de texte se réécrit.';
  if (m.etat === 'non-remis') return 'Ce message n’est jamais parti : renvoyez-le plutôt que de le réécrire.';
  if (o.estDirection) return null;
  if (!o.moi || !m.parQui) return 'Seule la direction peut réécrire un message qui n’est pas le sien.';
  if (m.parQui.toLowerCase() !== o.moi.toLowerCase()) {
    return 'Ce message est d’une autre main : seule la direction peut le réécrire.';
  }
  return null;
}

/** LE MOT DE LA CORRECTION, déjà écrit et toujours relu avant de partir.

    IL NE CITE PAS LA FAUTE et ne la répète pas : on ne souligne pas sa propre
    erreur devant une cliente. Il porte le texte juste, et c'est tout. */
export const texteDeLaCorrection = (neuf: string, prenom?: string): string => {
  const t = neuf.trim();
  const tete = prenom ? `${prenom}, petite correction : ` : 'Petite correction : ';
  /* LA PREMIÈRE LETTRE REDEVIENT MINUSCULE quand elle suit les deux points,
     sauf si c'est un nom propre — on ne devine pas, on ne touche qu'à ce qui
     est sûrement une phrase : une capitale suivie d'une minuscule.

     L'APOSTROPHE COMPTE COMME UNE LIAISON. « C'est bien samedi » commence par
     une capitale suivie d'une apostrophe, pas d'une minuscule : sans ce cas,
     la moitié des phrases françaises gardaient leur majuscule au milieu de la
     correction. */
  const suite = /^[A-ZÀÂÉÈÊÎÔÛÇ]['’]?[a-zà-ÿ]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  return `${tete}${suite}`;
};

/* ══ LA SONNETTE — 14 septembre 2026 ═════════════════════════════════

   « Je voudrais une sonnette quand un nouveau message vient dans le Trône »
   (Yéman). Aujourd'hui un message qui arrive ne fait aucun bruit, et la
   cloche ne le compte même pas.

   QUATRE PIÈGES, ET ILS SE LISENT TOUS ICI :

   ① AU CHARGEMENT, le Trône lit tout le mois. Sans garde, la sonnette
      sonnerait cinquante fois d'affilée, et l'on couperait le son dans la
      journée. Elle ne sonne que pour ce qui arrive APRÈS que l'écran s'est
      posé — d'où `premiereLecture`.
   ② NOS PROPRES MESSAGES NE SONNENT PAS. Évident, et pourtant c'est la
      faute la plus courante.
   ③ UNE RAFALE FAIT UNE SONNERIE. Trois messages d'une même cliente en dix
      secondes ne doivent pas carillonner trois fois : cette fonction rend
      CE QUI EST NEUF, l'appelant sonne une fois si la liste n'est pas vide.
   ④ LE FIL OUVERT À L'ÉCRAN NE SONNE PAS : on est en train de lui parler. */
export function messagesQuiSonnent(o: {
  avant: readonly Pick<MessageWa, 'id'>[];
  apres: readonly MessageWa[];
  /** Le numéro du fil ouvert à l'écran, s'il y en a un. */
  filOuvert?: string;
  /** Vrai tant que le premier chargement n'est pas passé. */
  premiereLecture: boolean;
  /** ⑤ LES FILS QUE L'AUTOMATE MÈNE (9 octobre 2026, `numerosTenus`) : elle
      touche un choix, il lui répond dans la seconde ; la Maison n'a rien à
      faire, la sonnette se tait. Une main passée sonne de nouveau. */
  tenus?: Iterable<string>;
}): MessageWa[] {
  if (o.premiereLecture) return [];
  const connus = new Set(o.avant.map((m) => m.id));
  const ouvert = numeroWa(o.filOuvert);
  const tenus = new Set([...(o.tenus ?? [])].map((n) => numeroWa(n)).filter(Boolean));
  return o.apres.filter((m) => !connus.has(m.id)
    && m.sens === 'entrant'
    && !(ouvert && numeroWa(m.numero) === ouvert)
    && !tenus.has(numeroWa(m.numero)));
}

/** CE QUE LA CLOCHE DOIT COMPTER : les fils dont le dernier mot vient d'elle
    et que personne n'a repris. La cloche ignorait les conversations jusqu'ici. */
export const filsQuiAttendent = (fils: readonly Fil[], archives: ArchivesDesFils = {}): Fil[] =>
  /* UN FIL ARCHIVÉ N'ATTEND PLUS : la direction l'a rangé en connaissance de
     cause. S'il reçoit un mot de plus, il sort de l'archive, et attend de
     nouveau. */
  fils.filter((f) => f.attendUneReponse && !estArchive(f, archives));

/** L'ALARME DU TABLEAU DE BORD — 18 septembre 2026. « Quand je reçois des
    messages WhatsApp il faut absolument pouvoir répondre dans la fenêtre de
    24 h. Je veux que tous les nouveaux messages viennent sur mon tableau de
    bord avec une alarme rouge tant que je ne réponds pas » (Yéman).

    LE MÊME JUGE QUE LA CLOCHE : `filsQuiAttendent`. L'alarme ne peut donc
    jamais dire autre chose que la cloche et que l'écran des conversations.
    Répondre, même par un modèle, l'éteint ; archiver aussi, parce que c'est
    dire en connaissance de cause qu'aucune réponse n'est due.

    LES SEULES FENÊTRES OUVERTES — révisé le même jour. « Quand la fenêtre est
    fermée je ne peux plus rien faire. Faire apparaître les messages qui ont
    une fenêtre ouverte de 24 h » (Yéman). Une fenêtre fermée quitte donc
    l'alarme d'elle-même, à la minute où elle se ferme ; le fil reste dans
    l'écran des conversations et la cloche le compte encore, rien ne se perd.
    Celle qui se ferme le plus tôt passe en tête : c'est là qu'une réponse
    libre et gratuite se perd si l'on attend.

    RETIRER À LA MAIN : `retires`, même forme que l'archive et même règle, un
    mot de plus le ramène. Pour un « merci » qui n'appelle pas de réponse.

    LES TIROIRS VUS : la direction voit tout, le personnel les seules
    clientes, exactement comme l'écran des conversations. */
export const filsSansReponse = (
  fils: readonly Fil[],
  archives: ArchivesDesFils = {},
  tiroirs: readonly Tiroir[] = TIROIRS,
  retires: ArchivesDesFils = {},
): Fil[] =>
  filsQuiAttendent(fils, archives)
    .filter((f) => f.fenetre.ouverte && tiroirs.includes(f.tiroir) && !estArchive(f, retires))
    .sort((a, b) => a.fenetre.resteMs - b.fenetre.resteMs);

/* ══ LA NOTIFICATION SUR LE TÉLÉPHONE — 18 septembre 2026 ══════════════

   « Construis la notification sur mon téléphone » (Yéman). L'alarme du
   tableau de bord ne se voit que si le Trône est ouvert ; celle-ci arrive
   même Trône fermé, dès que le webhook range un message.

   CE QU'ELLE DIT, ET CE QU'ELLE TAIT :
   · UNE CLIENTE : son PRÉNOM seul, jamais le texte. Un écran verrouillé se lit
     par-dessus l'épaule, au salon ; le prénom suffit pour savoir qu'il faut
     répondre, et le fil dit le reste.
   · UN MESSAGE DE L'ÉQUIPE OU D'UN PRESTATAIRE : la base réserve ces tiroirs
     à la direction (0102). Le reste du personnel n'en est pas prévenu du
     tout, et la direction l'est SANS nom.
   · PLUSIEURS PERSONNES D'UN COUP : on les compte, et le clic mène au tableau
     de bord, où l'alarme les range.

   LA COPIE DANS LE WEBHOOK : `supabase/functions/whatsapp-webhook` porte une
   copie de cette fonction, parce qu'une fonction Edge n'importe rien du dépôt.
   LES DEUX CHANGENT ENSEMBLE ; celle-ci est éprouvée par
   `scripts/verifie-alarme-whatsapp`. */
export type ArriveeWa = { numero: string; tiroir: string; nom: string };
export type AlerteTelephone = { titre: string; corps: string; url: string };

/** Le prénom : le premier mot du nom. Un numéro reste un numéro. */
export const prenomDe = (nom: string): string => nom.trim().split(/\s+/)[0] || nom;

export function alerteDuTelephone(
  arrivees: readonly ArriveeWa[],
  pourLaDirection: boolean,
): AlerteTelephone | null {
  const visibles = pourLaDirection ? arrivees : arrivees.filter((a) => a.tiroir === 'clientes');
  const numeros = [...new Set(visibles.map((a) => a.numero))];
  if (numeros.length === 0) return null;
  if (numeros.length === 1) {
    const a = visibles.find((x) => x.numero === numeros[0]) as ArriveeWa;
    const url = `/trone/#/conversations?n=${a.numero}`;
    return a.tiroir === 'clientes'
      ? { titre: `${prenomDe(a.nom)} vous écrit sur WhatsApp`, corps: 'Vous avez 24 h pour lui répondre librement.', url }
      : { titre: 'Un message WhatsApp réservé à la direction', corps: 'Ouvrez le Trône pour le lire. Vous avez 24 h pour répondre librement.', url };
  }
  return {
    titre: `${numeros.length} personnes vous écrivent sur WhatsApp`,
    corps: 'Vous avez 24 h pour leur répondre librement.',
    url: '/trone/#/',
  };
}

/* ══ LA MAISON RÉPOND SUR WHATSAPP · 9 octobre 2026 ═══════════════════════
   Maquette « Réserver sur WhatsApp », validée le 9 octobre 2026 (façon B).
   La réponse automatique (`shared/automate-wa`, fonction `whatsapp-automate`)
   parle aux clientes qui demandent un rendez-vous, leur propose de vraies
   places et pose le rendez-vous confirmé à leur « Je confirme ».

   DEUX LIGNES PAR NUMÉRO dans `fils_automate` (0125) :
     · `fil-<numéro>`, l'état du parcours. Le SERVEUR seul l'écrit : le
       Trône le lit, et la base ignorerait sans un mot ce qu'il y écrirait ;
     · `main-<numéro>`, la main de l'équipe. Prendre ou rendre la main est un
       geste de la main : il passe par le magasin, comme tout geste du Trône.
       La base n'en garde que l'heure de la pause, sa fin, son motif et
       l'heure où elle a été rendue, 72 heures au plus, et signe elle-même qui.

   CE QUE L'ÉCRAN EN TIRE : la pastille, le bandeau, et la règle d'alarme
   (`laReponseDeLAutomateSuffit`). Un message de l'automate ne répond jamais
   à la place de la Maison ; c'est le fil qui dit s'il a fait le travail. */

/** Une ligne de `fils_automate`, telle que la base la rend : l'état du
    parcours ou la main de l'équipe (voir `automatesDesFils`). */
export type LigneDesFilsAutomate = { id: string; branchId?: string; numero?: string; [champ: string]: unknown };

export const filsAutomateStore = createStore<LigneDesFilsAutomate[]>('mnd_fils_automate', []);
export const useFilsAutomate = () => useStore(filsAutomateStore);

/** Ce que la base sait d'un numéro : son parcours, la main de l'équipe, et
    combien d'heures une main tient (le réglage `automateWa.pauseHeures`). */
export type AutomateDuNumero = { fil: EtatDuFil | null; main: MainDuFil | null; pauseHeures: number };
export type AutomatesDesFils = ReadonlyMap<string, AutomateDuNumero>;

/** LE GENRE D'UNE LIGNE, à son identifiant ; à défaut, à sa forme (un
    parcours a une étape, une main a ses heures). */
const genreDeLaLigne = (l: LigneDesFilsAutomate): 'fil' | 'main' | null => {
  const id = typeof l.id === 'string' ? l.id : '';
  if (id.startsWith('fil-')) return 'fil';
  if (id.startsWith('main-')) return 'main';
  if (typeof l.etape === 'string') return 'fil';
  if ('pauseLe' in l || 'rendueLe' in l || 'jusqua' in l) return 'main';
  return null;
};

/** LES LIGNES DE LA TABLE, RANGÉES PAR NUMÉRO (réduit, `numeroWa`). */
export function automatesDesFils(
  lignes: readonly LigneDesFilsAutomate[],
  pauseHeures: number = REGLAGE_LIVRE.pauseHeures,
): Map<string, AutomateDuNumero> {
  const m = new Map<string, AutomateDuNumero>();
  for (const l of lignes) {
    if (!l || typeof l !== 'object') continue;
    const genre = genreDeLaLigne(l);
    if (!genre) continue;
    const brut = typeof l.numero === 'string' && l.numero
      ? l.numero
      : (typeof l.id === 'string' ? l.id.replace(/^(fil|main)-/, '') : '');
    const n = numeroWa(brut);
    if (!n) continue;
    const a = m.get(n) ?? { fil: null, main: null, pauseHeures };
    if (genre === 'fil') a.fil = l as unknown as EtatDuFil;
    else a.main = l as unknown as MainDuFil;
    m.set(n, a);
  }
  return m;
}

/** CE QUE L'AUTOMATE FAIT DE CE NUMÉRO, maintenant. `undefined` tant qu'il
    n'a jamais mené ce fil : une main posée par `whatsapp-envoi` sur une
    conversation ordinaire (il pose la pause à chaque envoi de l'équipe) ne
    fait ni pastille ni bandeau. */
export function vueDuNumero(
  automates: AutomatesDesFils | undefined, numero: string, maintenant: number,
): VueDeLAutomate | undefined {
  const a = automates?.get(numeroWa(numero));
  if (!a?.fil) return undefined;
  return vueDeLAutomate(a.fil, a.main, maintenant, a.pauseHeures);
}

/** LE DERNIER MOT D'ELLE A-T-IL EU SA RÉPONSE PAR L'AUTOMATE ?

    Oui quand il mène le fil, ou vient de le finir (rendez-vous posé, parcours
    arrêté), et qu'il a traité ce mot-là ; oui aussi pour un message de moins
    d'une minute sur un fil qu'il mène, le temps d'un tour (`silenceDeLAlarme`).

    OUI ENCORE QUAND LE FIL EST RETOMBÉ AU REPOS sans que la main ait passé :
    le rendez-vous de la veille, un parcours qu'elle a laissé en route. Il a
    répondu à son dernier mot, c'est elle qui n'a pas poursuivi. Sans cela,
    chaque fil mené par l'automate redeviendrait « en attente » au bout de
    24 heures, et remonterait en tête pour toujours.

    NON pour une main passée (elle attend une personne), une pause de
    l'équipe (l'équipe a pris la main, c'est à elle de répondre), et tout mot
    arrivé après ce qu'il a traité. */
export function laReponseDeLAutomateSuffit(
  tenue: TenueDuFil, fil: EtatDuFil | null | undefined, sonDernierMot: string | undefined, maintenant: number,
): boolean {
  if (silenceDeLAlarme(tenue, fil, sonDernierMot, maintenant)) return true;
  if (tenue !== 'aucun' || !fil || fil.etape === 'main') return false;
  const elle = Date.parse(sonDernierMot ?? '');
  const traite = Date.parse(fil.dernierEntrantQuand ?? '');
  return Number.isFinite(elle) && Number.isFinite(traite) && elle <= traite;
}

/** CE QUE LA SONNETTE A VU D'UN FIL MENÉ PAR L'AUTOMATE, d'un rendu à
    l'autre : attendait-il une réponse, et l'automate le tenait-il ? */
export type VueDeLaSonnette = ReadonlyMap<string, { attend: boolean; tenue?: TenueDuFil }>;

/** LA MAIN QUI PASSE SONNE (relecture du 9 octobre 2026).

    La sonnette juge un message AU MOMENT OÙ IL ARRIVE : sur un fil que
    l'automate mène, elle se tait (`messagesQuiSonnent`, ⑤). Quand l'automate
    passe la main quelques secondes plus tard (« Parler à la Maison », un
    prix, une photo, deux écarts, un message refusé par Meta) ou échoue son
    tour, aucun message neuf ne la réveille. C'est donc le PASSAGE qui sonne :
    un fil que l'automate TENAIT et qui n'attendait rien, et qui attend
    maintenant une personne. Un fil qui n'était pas tenu a déjà sonné à
    l'arrivée de son message : il ne sonne pas deux fois. Jamais au premier
    chargement (`avant` nul), jamais le fil ouvert à l'écran. */
export function sonnentApresLAutomate(o: {
  avant: VueDeLaSonnette | null;
  fils: readonly Pick<Fil, 'numero' | 'attendUneReponse' | 'automate'>[];
  filOuvert?: string;
}): { numeros: string[]; vue: Map<string, { attend: boolean; tenue?: TenueDuFil }> } {
  const vue = new Map<string, { attend: boolean; tenue?: TenueDuFil }>();
  const numeros: string[] = [];
  const ouvert = numeroWa(o.filOuvert);
  for (const f of o.fils) {
    const n = numeroWa(f.numero);
    if (!n) continue;
    vue.set(n, { attend: f.attendUneReponse, ...(f.automate ? { tenue: f.automate.tenue } : {}) });
    const avant = o.avant?.get(n);
    if (!o.avant || !avant || avant.attend || avant.tenue !== 'tenu') continue;
    if (!f.attendUneReponse || (ouvert && n === ouvert)) continue;
    numeros.push(n);
  }
  return { numeros, vue };
}

/** LES NUMÉROS QUE L'AUTOMATE MÈNE EN CE MOMENT : la sonnette s'y tait. */
export function numerosTenus(automates: AutomatesDesFils, maintenant: number): Set<string> {
  const s = new Set<string>();
  for (const n of automates.keys()) {
    if (vueDuNumero(automates, n, maintenant)?.tenue === 'tenu') s.add(n);
  }
  return s;
}

const instantDuFil = (iso: unknown): number => {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** L'ÉQUIPE PREND LA MAIN : l'automate se tait sur ce fil pendant
    `pauseHeures` (24 h livrées). Écrit la seule ligne `main-<numéro>`,
    jamais le parcours.

    LA PAUSE NE PART JAMAIS AVANT CE QUI L'A RENDUE : si l'horloge du poste
    retarde sur celle du serveur, une pause posée juste après « Rendre à
    l'automate » tomberait avant, et ne tiendrait pas. */
export function poseLaMain(
  numero: string, motif: string,
  o: { pauseHeures?: number; maintenant?: number; branchId?: string } = {},
): boolean {
  const n = numeroWa(numero);
  if (!n) return false;
  const id = `main-${n}`;
  const heures = Math.min(72, Math.max(1, Math.round(Number(o.pauseHeures) || REGLAGE_LIVRE.pauseHeures)));
  const maintenant = o.maintenant ?? Date.now();
  filsAutomateStore.set((prev) => {
    const avant = prev.find((l) => l.id === id);
    const pose = Math.max(maintenant, instantDuFil(avant?.rendueLe) + 1);
    const ligne: LigneDesFilsAutomate = {
      ...(avant ?? {}),
      id,
      numero: n,
      ...(o.branchId && !avant?.branchId ? { branchId: o.branchId } : {}),
      pauseLe: new Date(pose).toISOString(),
      jusqua: new Date(pose + heures * 3_600_000).toISOString(),
      motif: (motif || 'equipe').slice(0, 40),
    };
    return avant ? prev.map((l) => (l.id === id ? ligne : l)) : [...prev, ligne];
  });
  return true;
}

/** L'ÉQUIPE REND LA MAIN À L'AUTOMATE. Il ne dit rien sur le moment : il
    reprend au prochain message de la cliente, à l'étape où il en était
    (`etapeCourante`). L'heure rendue n'est jamais avant la pause ni avant la
    main qu'il avait passée, quelle que soit l'horloge du poste. */
export function rendsALAutomate(
  numero: string,
  o: { maintenant?: number; mainPasseeLe?: string; branchId?: string } = {},
): boolean {
  const n = numeroWa(numero);
  if (!n) return false;
  const id = `main-${n}`;
  const maintenant = o.maintenant ?? Date.now();
  filsAutomateStore.set((prev) => {
    const avant = prev.find((l) => l.id === id);
    const rendue = Math.max(maintenant, instantDuFil(avant?.pauseLe), instantDuFil(o.mainPasseeLe));
    const ligne: LigneDesFilsAutomate = {
      ...(avant ?? {}),
      id,
      numero: n,
      ...(o.branchId && !avant?.branchId ? { branchId: o.branchId } : {}),
      rendueLe: new Date(rendue).toISOString(),
    };
    return avant ? prev.map((l) => (l.id === id ? ligne : l)) : [...prev, ligne];
  });
  return true;
}

/* LA SYNCHRO — la table `messages_wa` (0086). Le fil vit dans la Maison, pas
   dans un navigateur : une conversation lue sur la tablette du salon doit se
   retrouver sur le téléphone du soir.

   LES FILS PRIVÉS, EUX, NE SE SYNCHRONISENT PAS et c'est délibéré : ce
   drapeau ferme un ÉCRAN, il ne verrouille pas la base, et le faire voyager
   donnerait l'illusion d'un coffre qui n'existe pas. Il vit là où il est
   posé. Le jour où la Maison voudra un vrai verrou, ce sera une politique
   RLS et une notion de propriétaire, pas une case de plus. */
bindCollection(messagesWaStore, 'messages_wa');
/* L'ARCHIVE, ELLE, VOYAGE : voir « Archiver un fil ». */
bindDocument(filsArchivesStore, 'mnd_fils_archives');
bindDocument(alarmeRetiresStore, 'mnd_alarme_retires');
/* LES FILS DE LA RÉPONSE AUTOMATIQUE (0125), en direct : le bandeau suit le
   parcours étape par étape. Lus par le personnel (clientes) et la direction
   (tout) ; seule la ligne `main-` part d'ici. */
bindCollection(filsAutomateStore, 'fils_automate');
