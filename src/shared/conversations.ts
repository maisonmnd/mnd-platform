import { createStore, useStore } from './store';
import { bindCollection, bindDocument } from './sync';

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

    LE RAPPROCHEMENT SE JOUE ICI. Une fiche porte « +229 0166144465 », Meta
    renvoie « 2290166144465 », et si les deux ne se réduisent pas au même
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
    if (m.sens !== 'entrant') continue;
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
  fenetre: Fenetre;
  /** Le dernier mot vient d'elle et personne n'a répondu. */
  attendUneReponse: boolean;
};

export type TeteConnue = { id: string; name: string; phone?: string; phone2?: string; branchId: string };

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
): Fil[] {
  /* LE RAPPROCHEMENT PAR NUMÉRO, LES DEUX LIGNES DE LA FICHE. Le second
     numéro est un recours (un mari, une sœur) : un message qui en vient
     appartient tout de même à sa tête, et le classer « inconnu » à côté de
     sa propre fiche serait la faute la plus vexante de l'écran. */
  const parNumero = new Map<string, TeteConnue>();
  for (const t of tetes) {
    for (const brut of [t.phone, t.phone2]) {
      const n = numeroWa(brut);
      if (n && !parNumero.has(n)) parNumero.set(n, t);
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
    fils.push({
      numero,
      clientId: tete?.id,
      nom: tete?.name ?? liste.find((m) => m.nomProfil)?.nomProfil ?? numero,
      sansFiche: !tete,
      prive: prives.includes(numero),
      messages: liste,
      dernier,
      fenetre: fenetreDe(liste, maintenant),
      attendUneReponse: dernier.sens === 'entrant',
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
    clientId: tete?.id,
    nom: tete?.name ?? `+${n}`,
    sansFiche: !tete,
    prive: false,
    messages: [],
    dernier: fantome,
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

/** CE MODÈLE A-T-IL ÉTÉ FACTURÉ ?

    ON NE L'A PAS ÉCRIT AU MOMENT DE L'ENVOI, et c'est trop tard pour les
    messages d'hier — mais on peut le RETROUVER : un modèle est gratuit s'il
    est parti alors qu'elle avait écrit dans les 24 heures d'avant. Le fil
    porte cette information depuis toujours.

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
  /** Ceux que Meta facture : partis hors fenêtre. */
  factures: number;
  /** Ceux qui sont partis dans une fenêtre ouverte, donc gratuits. */
  gratuits: number;
  /** Le détail par modèle, du plus envoyé au moins envoyé. */
  parModele: { nom: string; factures: number; gratuits: number }[];
};

/** CE QUE LA MAISON A ENVOYÉ CE MOIS-CI, modèle par modèle. */
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
  return {
    mois,
    envoyes: duMois.length,
    factures,
    gratuits: duMois.length - factures,
    parModele: [...par.entries()]
      .map(([nom, l]) => ({ nom, ...l }))
      .sort((a, b) => (b.factures + b.gratuits) - (a.factures + a.gratuits) || a.nom.localeCompare(b.nom)),
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
}): MessageWa[] {
  if (o.premiereLecture) return [];
  const connus = new Set(o.avant.map((m) => m.id));
  const ouvert = numeroWa(o.filOuvert);
  return o.apres.filter((m) => !connus.has(m.id)
    && m.sens === 'entrant'
    && !(ouvert && numeroWa(m.numero) === ouvert));
}

/** CE QUE LA CLOCHE DOIT COMPTER : les fils dont le dernier mot vient d'elle
    et que personne n'a repris. La cloche ignorait les conversations jusqu'ici. */
export const filsQuiAttendent = (fils: readonly Fil[], archives: ArchivesDesFils = {}): Fil[] =>
  /* UN FIL ARCHIVÉ N'ATTEND PLUS : la direction l'a rangé en connaissance de
     cause. S'il reçoit un mot de plus, il sort de l'archive, et attend de
     nouveau. */
  fils.filter((f) => f.attendUneReponse && !estArchive(f, archives));

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
