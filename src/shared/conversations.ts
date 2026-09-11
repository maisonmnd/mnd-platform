import { createStore, useStore } from './store';
import { bindCollection } from './sync';

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

/* LA SYNCHRO — la table `messages_wa` (0086). Le fil vit dans la Maison, pas
   dans un navigateur : une conversation lue sur la tablette du salon doit se
   retrouver sur le téléphone du soir.

   LES FILS PRIVÉS, EUX, NE SE SYNCHRONISENT PAS et c'est délibéré : ce
   drapeau ferme un ÉCRAN, il ne verrouille pas la base, et le faire voyager
   donnerait l'illusion d'un coffre qui n'existe pas. Il vit là où il est
   posé. Le jour où la Maison voudra un vrai verrou, ce sera une politique
   RLS et une notion de propriétaire, pas une case de plus. */
bindCollection(messagesWaStore, 'messages_wa');
