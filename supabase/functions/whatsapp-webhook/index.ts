// whatsapp-webhook - l oreille de la Maison.
//
// LA PREMIERE LIGNE EST VOLONTAIREMENT PAUVRE - 14 septembre 2026.
// Un deploiement a echoue ce jour-la sur « Unexpected character '=' at
// index.ts:1:6 » : le « /* » d ouverture s etait perdu au collage, et le
// parseur a bute sur la ligne de decor qui suivait, sans rien dire d utile.
// Un fichier qu on colle a la main dans un navigateur doit commencer par
// quelque chose qui survit a un collage de travers. Le decor vient apres.

/* ═══════════════════════════════════════════════════════════════════
   WHATSAPP-WEBHOOK — l'oreille de la Maison.

   Maquette `public/maquette-les-conversations.html`, validée le 11 septembre
   2026. Jusqu'ici Le Trône PARLAIT SANS ENTENDRE : trois modèles partaient
   seuls, la cloche ouvrait des brouillons, et rien ne revenait. Ce qu'une
   cliente répondait vivait dans un téléphone, pas dans la Maison.

   Meta appelle cette adresse à chaque mouvement. Elle fait deux choses :

     ① LES MESSAGES REÇUS se rangent dans `messages_wa` (0086), rattachés à
        leur fiche quand le numéro la retrouve. Une tête inconnue garde son
        numéro et son nom de profil : ON NE CRÉE JAMAIS DE FICHE TOUT SEUL,
        une base qui se remplit à chaque démarcheur se salit en un mois.

     ② LES ACCUSÉS (remis, lu, échoué) corrigent le journal `envois`. Jusqu'à
        aujourd'hui il écrivait « envoyé » dès que Meta ACCEPTAIT la requête :
        un message jamais remis se lisait comme parti. La tournée du matin
        peut enfin dire la vérité.

   ═══ L'ÉQUIPE ET LES PRESTATAIRES — 15 septembre 2026 ═══════════════
   Maquette `public/maquette-lequipe-sur-whatsapp.html`, validée.

   LE NUMÉRO NE CONNAISSAIT QUE LES CLIENTES. Quatre choses de plus, et rien
   d'autre :

     ③ QUI ÉCRIT. La base range chaque message dans son tiroir (0102,
        `tete_du_numero`) : équipe, prestataire, cliente. Cette fonction lui
        DEMANDE, elle ne décide pas — un seul juge, en base, qui ferme aussi
        la porte aux comptes du personnel.

     ④ CE QU'ON REÇOIT SE GARDE. Une photo, un PDF, un vocal arrivaient comme
        « une photo » : l'identifiant Meta expire, le fichier se perdait. On va
        le chercher chez Meta et on le range dans le compartiment `whatsapp`
        (0102) — ou, pour un prestataire qui n'a qu'un dossier ouvert, dans
        le coffre de cet engagement, comme un devis reçu « à saisir ».
        PERSONNE NE LIT LE DEVIS À LA PLACE DE LA DIRECTION : un montant lu
        par une machine sur une photo serait faux, et faux dans un
        engagement est pire que vide.

     ⑤ UN BOUTON AGIT. « Oui, bien reçu » sur l'annonce d'un versement
        confirme la réception dans le dossier ; « Pas encore » le signale.
        Le titre du bouton n'est que ce qu'il a lu — c'est l'identifiant qui
        porte le geste.

     ⑥ LE FORMULAIRE DE CONGÉ. Une employée qui parle de congé reçoit le
        formulaire (un Flow WhatsApp, `WA_FLOW_CONGE`) ; sa réponse devient
        une demande dans Temps & absences, à décider. Sans `WA_FLOW_CONGE`,
        rien ne part : la direction répond à la main.

   DEUX MESSAGES SEULEMENT PARTENT TOUT SEULS, dits d'avance dans la
   maquette : l'accusé d'une pièce reçue d'un prestataire, et le formulaire
   de congé. Ils portent `parQui: 'Le Trône'`, et jamais deux fois en
   vingt-quatre heures. Pas de robot : la Maison reconnaît, range, prévient.

   ══ LA MAISON RÉPOND ET RÉSERVE · décision de la direction, 9 octobre 2026 ══
   Maquette « Réserver sur WhatsApp », validée le 9 octobre 2026 (façon B :
   une conversation à boutons et à listes qui propose de vraies places libres).

   « PAS DE ROBOT » A VALU JUSQU'À CE JOUR. Depuis, pour les CLIENTES
   seulement, une seconde fonction, `whatsapp-automate`, prend la parole :
     · quand elle parle de rendez-vous, et au premier message d'un numéro
       inconnu (« merci pour hier » ne déclenche rien) ;
     · elle propose de vraies places libres et pose le rendez-vous CONFIRMÉ
       au toucher « Je confirme », comme le site, la nuit comprise ;
     · pas de modèle de langue : des boutons, des listes et quelques mots
       reconnus (les jours, demain, matin, après-midi, annuler). Au deuxième
       écart, la main passe à l'équipe, et l'alarme se rallume ;
     · L'ANNULATION N'EST JAMAIS AUTOMATIQUE : elle se transmet à l'équipe ;
     · elle se tait dès que l'équipe parle (la main posée à l'écran, et
       `pause_le_fil` dans whatsapp-envoi) ;
     · un interrupteur à trois positions dans les réglages de la Maison
       (éteint, essai, ouvert), LIVRÉ EN ESSAI AVEC UNE LISTE VIDE : personne
       n'est servi tant que la direction n'a pas saisi ses numéros.

   CE FICHIER NE CHANGE PAS DE MÉTIER : il range les messages, puis confie
   les messages NEUFS (jamais une seconde livraison de Meta) à l'automate,
   en tâche de fond (`EdgeRuntime.waitUntil`), après quoi il répond à Meta
   sans l'attendre. L'automate juge seul qui il sert (`numeroServi`) ; si
   ce tour n'est pas à lui, s'il échoue ou s'il tarde, la notification
   habituelle part, et rien ne s'écrit en double. Pendant qu'il tient le
   fil, c'est lui qui dit ce qui mérite de sonner : un rendez-vous posé, ou
   la main passée. L'ÉQUIPE ET LES PRESTATAIRES N'ONT TOUJOURS AUCUN ROBOT :
   un numéro de l'équipe n'est servi que s'il est inscrit en essai par la
   direction, un prestataire jamais.

   ═══ CETTE ADRESSE EST PUBLIQUE ═══════════════════════════════════
   Meta ne peut présenter aucun jeton : il faut donc DÉCOCHER « Verify JWT »
   sur cette fonction dans le tableau de bord Supabase. C'est voulu, et c'est
   pourquoi la signature ci-dessous n'est pas une précaution mais LA serrure :
   sans elle, quiconque connaît l'adresse peut poster de faux messages dans la
   boîte des clientes de la Maison.

   AUCUN SECRET ICI. Tout vient de l'environnement (supabase secrets set …) —
   ce fichier vit dans un dépôt public, et une fuite a déjà eu lieu.
     · WA_VERIFY_TOKEN — une chaîne que la Maison invente, recopiée chez Meta.
     · WA_APP_SECRET   — le secret de l'application Meta (App Secret).
     · CLE_SERVICE     — la clé secrète Supabase, pour écrire dans les tables.
     · WA_TOKEN, WA_PHONE_ID — pour aller chercher les pièces chez Meta et
                          envoyer les deux messages automatiques (les mêmes
                          clés que whatsapp-envoi).
     · WA_FLOW_CONGE   — l'identifiant du Flow « Demander un congé », publié
                          dans WhatsApp Manager (docs/BRANCHER-ENVOIS.md).
     · CLE_SERVICE sert aussi de porte vers `whatsapp-automate` (le même
       secret que le cron vers confirmation-rdv) : aucun secret neuf.

   Déploiement : Supabase → Edge Functions → New function « whatsapp-webhook »
   → coller CE FICHIER ENTIER → Deploy → décocher « Verify JWT ». Puis, chez
   Meta : WhatsApp Manager → Configuration → Webhooks → l'URL de la fonction
   et le jeton de vérification, et s'abonner au champ « messages ».
   ═══════════════════════════════════════════════════════════════════ */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
/* La meme bibliotheque et la meme version que push-notify, avec les memes
   secrets (VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT) : les secrets Edge
   valent pour toutes les fonctions du projet. */
import webpush from 'npm:web-push@3.6.7';

/** LA VERSION DE CE FICHIER, dite par le contrôle de santé. Sans elle on ne
    sait pas quel code tourne vraiment. À incrémenter à chaque déploiement. */
const VERSION = '2026-11-11-a · les boutons de la paie (PAIE_RECU, PAIE_PASENCORE) s écrivent sur le registre des envois MTN, venus du seul numéro à qui le message est parti, sans automate ni sonnerie ; une fiche sans date de naissance sous un payeur ne parle pas sur son numero : le payeur parle ; une fiche d enfant n est jamais la voix du numero : le message et l appel portent l adulte, le payeur, ou personne ; les boutons de garder : changer l heure va a l automate, je ne peux plus passe la main ; Opale a 120 s pour son tour ; la prochaine séance de l abonnée (PROCHAINE_OK, PROCHAINE_AUTRE) : « Oui, je réserve » pose la séance couverte par sa formule sous le verrou du serveur (reserver_une_seance_incluse_par_la_maison, 0198) et la confirme en une phrase, la ligne conf-<rdv>-whatsapp taisant le modèle de confirmation-rdv sauf si la phrase ne part pas ; une suite déjà posée ne se pose pas deux fois ; « Une autre date » passe la main à la conversation sans rien poser ; venus du seul numéro à qui le message est parti';

/** LE POIDS QU'UNE PIÈCE REÇUE PEUT FAIRE : le plafond du compartiment
    `whatsapp` (0102). Au-delà, le fichier reste chez Meta et le fil le dit. */
const TAILLE_MAX_PIECE = 16 * 1024 * 1024;

/* ══ META RÉPOND DANS LE TEMPS, OU PAS DU TOUT · 10 octobre 2026 ═══════
   Revue de code : aucun appel à Graph n'avait de borne. Les pièces se
   téléchargent AVANT que les messages de la livraison soient rangés ; un
   Graph ou un CDN qui pend, et rien n'était écrit, l'alerte ne partait pas,
   l'automate n'était pas confié. Dix secondes pour une réponse de Graph
   (la borne de `whatsapp-automate`), vingt pour le fichier lui-même, qui
   peut peser seize mégaoctets. Un délai dépassé tombe dans le `catch`
   existant : la pièce reste nommée sans chemin, le message s'écrit. */
const DELAI_DE_META_MS = 10_000;
const DELAI_DU_FICHIER_MS = 20_000;

const FENETRE_MS = 24 * 60 * 60 * 1000;

/** Numéro → format Meta (chiffres, sans « + »). MÊME RÈGLE que `numeroWa`
    de `shared/conversations.ts`, recopiée parce qu'une fonction Edge ne peut
    rien importer du dépôt. Si les deux divergeaient, les messages d'une
    cliente tomberaient dans « inconnu » à côté de sa propre fiche. */
const numeroWa = (brut: string | undefined): string => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};
/** LA CLÉ POUR COMPARER (13 octobre 2026) : 229 97 00 00 99 (Meta) et
    229 01 97 00 00 99 (la fiche) sont le même numéro. Même règle que `cleWa`
    de l'automate et `cle_du_numero_wa` en base. */
const cleWa = (brut: unknown): string => {
  const d = numeroWa(String(brut ?? ''));
  return d.length === 13 && d.startsWith('22901') ? `229${d.slice(5)}` : d;
};

/** LA SIGNATURE DE META, sur le corps BRUT — jamais sur le JSON reparsé :
    un objet réécrit ne rend pas les mêmes octets, et la signature tomberait
    toujours fausse. Comparaison à temps constant : comparer deux empreintes
    avec `===` laisse fuir, caractère par caractère, où l'on s'est arrêté. */
/* ══ SUR LES OCTETS, JAMAIS SUR LE TEXTE — 12 septembre 2026 ═══════
   La première version lisait le corps avec `req.text()`, puis le RÉ-ENCODAIT
   pour calculer l'empreinte. Ce détour est juste tant que la charge est de
   l'ASCII pur, et faux dès qu'elle porte un accent, une apostrophe courbe ou
   un émoji : le décodage-réencodage ne rend pas toujours les mêmes octets, et
   Meta, lui, signe ce qu'il a VRAIMENT envoyé.

   On signe donc les octets reçus, tels quels. C'est la seule façon de comparer
   deux empreintes de la même chose. */
const empreinte = async (octets: Uint8Array, secret: string): Promise<string> => {
  const cle = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cle, octets as unknown as ArrayBuffer);
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Comparaison à temps constant — comparer deux empreintes avec `===` laisse
    fuir, caractère par caractère, où l'on s'est arrêté. */
const memeEmpreinte = (a: string, b: string): boolean => {
  if (a.length !== 64 || b.length !== 64) return false;
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/** Ce que Meta rapporte → ce que la Maison en dit. Un verdict inconnu ne
    devient JAMAIS « remis » : mieux vaut une Maison qui doute qu'une Maison
    qui croit avoir écrit. */
const ETAT: Record<string, string> = {
  sent: 'en-route', delivered: 'remis', read: 'lu', failed: 'non-remis',
};

/** LES ETAPES D UN APPEL, traduites une fois.

    RECOPIEE DE `shared/appels-wa.ts` (`etatDeMeta`) — une fonction Edge
    n importe rien du depot, et cette table-la doit dire la meme chose des
    deux cotes, sans quoi le carnet et l ecran se contrediraient. */
const ETAT_APPEL: Record<string, string> = {
  ringing: 'sonne',
  connect: 'pris',
  accepted: 'pris',
  terminate: 'fini',
  completed: 'fini',
  rejected: 'refuse',
  declined: 'refuse',
  missed: 'manque',
  failed: 'refuse',
};

/** Ce qu'un message dit, quel que soit son habit, et ce qu'il porte en plus.

    Une image, un audio, un contact n'ont pas de texte : on garde la LÉGENDE
    si elle existe, sinon on nomme le genre. Afficher un blanc laisserait
    croire à un message vide, et l'on répondrait à côté.

    UN BOUTON PORTE UN IDENTIFIANT, et c'est lui qui compte : le titre est ce
    qu'elle a lu, l'identifiant ce que le Trône fait. Un FORMULAIRE (Flow)
    rend un JSON que Meta range sous `nfm_reply.response_json`. */
type Lecture = {
  texte: string;
  bouton?: { id?: string; texte: string };
  formulaire?: { nom?: string; reponse: Record<string, unknown> };
  media?: { id: string; mime: string; nom: string; genre: 'image' | 'document' | 'audio' | 'video' };
};

const NOMS: Record<string, string> = {
  image: 'une photo', video: 'une vidéo', audio: 'un message vocal',
  document: 'un document', sticker: 'un autocollant', location: 'sa position',
  contacts: 'une fiche de contact',
};

const lectureDuMessage = (m: Record<string, any>): Lecture => {
  const t = m.type as string | undefined;
  if (t === 'text') return { texte: String(m.text?.body ?? '') };
  /* Le bouton d'un MODÈLE (réponse rapide) : `payload` est l'identifiant. */
  if (t === 'button') {
    const texte = String(m.button?.text ?? '');
    const id = m.button?.payload ? String(m.button.payload) : undefined;
    return { texte, bouton: { id, texte } };
  }
  if (t === 'interactive') {
    const i = m.interactive ?? {};
    if (i.nfm_reply) {
      let reponse: Record<string, unknown> = {};
      try { reponse = JSON.parse(String(i.nfm_reply.response_json ?? '{}')); } catch { /* illisible */ }
      return {
        texte: String(i.nfm_reply.body ?? 'a rempli un formulaire'),
        formulaire: { nom: i.nfm_reply.name ? String(i.nfm_reply.name) : undefined, reponse },
      };
    }
    const r = i.button_reply ?? i.list_reply;
    const texte = String(r?.title ?? '');
    return { texte, bouton: { id: r?.id ? String(r.id) : undefined, texte } };
  }
  const legende = m.image?.caption ?? m.video?.caption ?? m.document?.caption;
  const texte = legende ? String(legende) : (NOMS[t ?? ''] ?? 'un message que le Trône ne sait pas encore afficher');
  if (t === 'image' || t === 'document' || t === 'audio' || t === 'video') {
    const corps = m[t] ?? {};
    if (corps.id) {
      const mime = String(corps.mime_type ?? '').split(';')[0].trim() || 'application/octet-stream';
      const ext = EXTENSION[mime] ?? '';
      const nom = t === 'document' && corps.filename
        ? String(corps.filename)
        : `${t === 'image' ? 'photo' : t === 'audio' ? 'vocal' : 'video'}${ext}`;
      return { texte, media: { id: String(corps.id), mime, nom, genre: t } };
    }
  }
  return { texte };
};

/** L'extension qui va avec ce que Meta annonce — pour que le fichier s'ouvre
    d'un tap chez qui le télécharge. */
const EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'application/pdf': '.pdf', 'text/plain': '.txt',
  'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/aac': '.aac', 'audio/amr': '.amr',
  'video/mp4': '.mp4', 'video/3gpp': '.3gp',
};

/** Un nom de fichier qui survit à un chemin : accents ôtés, signes réduits,
    coupé à quatre-vingts signes. Même règle que le coffre des engagements. */
const nomPropre = (nom: string): string =>
  nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80) || 'piece';

/** L'identifiant Meta réduit à ce qui tient dans un chemin. */
const cleCourte = (waId: string): string => waId.replace(/[^A-Za-z0-9]/g, '').slice(-24) || 'x';

/* ══ ELLE PARLE MAINTENANT — 12 septembre 2026 ══════════════════════
   « Mon message n'atteint toujours pas le serveur. Résous le problème par
   toi-même » (Yéman), après une heure de contrôles tous verts.

   MA FAUTE : cette fonction ne disait RIEN quand tout allait bien. Le journal
   ne portait que « booted » et « shutdown », et l'on ne pouvait pas
   distinguer « rien n'est arrivé » de « quelque chose est arrivé et je l'ai
   jeté ». Toute la chaîne Meta était prouvée verte, et l'on tournait en rond
   faute d'un seul mot de ce côté-ci.

   UN JOURNAL QUI NE PARLE QU'EN CAS D'ERREUR NE SERT À RIEN quand la panne
   est un SILENCE. Elle dit donc désormais ce qu'elle reçoit à chaque appel,
   et ce qu'elle en fait.

   RIEN DE PERSONNEL N'Y PASSE : la méthode, des longueurs, des comptes, et
   le genre des événements. Jamais un texte, jamais un numéro, jamais un
   jeton. Un journal qui recopierait le message d'une cliente serait une
   fuite de plus, dans un projet qui en a déjà connu une. */
const dis = (quoi: string, o: Record<string, unknown> = {}) =>
  console.log(`whatsapp-webhook · ${quoi} · ${JSON.stringify(o)}`);

/* ══ LES PIÈCES, CHEZ META PUIS DANS LE COFFRE — 15 septembre 2026 ═══
   Meta ne livre pas le fichier : il livre un IDENTIFIANT, qu'il faut échanger
   contre une adresse, puis lire avec le jeton. L'adresse expire en quelques
   minutes, l'identifiant en quelques jours : ce qu'on ne va pas chercher tout
   de suite est perdu. */
async function telechargeChezMeta(
  mediaId: string, jeton: string,
): Promise<{ octets: Uint8Array; mime: string } | { tropLourde: true; octets?: undefined; mime?: undefined } | null> {
  try {
    const r1 = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(mediaId)}`, {
      headers: { authorization: `Bearer ${jeton}` },
      signal: AbortSignal.timeout(DELAI_DE_META_MS),
    });
    const meta = await r1.json().catch(() => ({}));
    if (!r1.ok || !meta?.url) {
      dis('pièce · Meta refuse l adresse', { statut: r1.status, motif: String(meta?.error?.message ?? '').slice(0, 120) });
      return null;
    }
    if (Number(meta.file_size ?? 0) > TAILLE_MAX_PIECE) return { tropLourde: true };
    const r2 = await fetch(String(meta.url), {
      headers: { authorization: `Bearer ${jeton}` },
      signal: AbortSignal.timeout(DELAI_DU_FICHIER_MS),
    });
    if (!r2.ok) { dis('pièce · le fichier ne se lit pas', { statut: r2.status }); return null; }
    const octets = new Uint8Array(await r2.arrayBuffer());
    if (octets.length > TAILLE_MAX_PIECE) return { tropLourde: true };
    return { octets, mime: String(meta.mime_type ?? '').split(';')[0].trim() || 'application/octet-stream' };
  } catch (e) {
    dis('pièce · échec', { detail: String(e).slice(0, 160) });
    return null;
  }
}

/* ── LA REPRISE DITE COMME ON PARLE — 29 septembre 2026 ───────────────────
   « mardi 14 octobre 2026 à 10 h » : recopiées de confirmation-rdv (une
   fonction Edge n'importe rien du dépôt). Une heure absente n'est pas minuit.
   L'ANNÉE, TOUJOURS, sur une date dite à une cliente (9 octobre 2026 : la
   reprise ne la disait pas, la règle de la Maison le veut). */
const jourDeLaReprise = (iso: string): string => {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Porto-Novo',
    });
  } catch { return iso; }
};

/* ══ LE PRÉNOM COMPOSÉ — 7 novembre 2026 ══════════════════════════════════
   « Quand on leur écrit, on écrive toujours, dans leur rendez-vous et dans
   leur messagerie WhatsApp, tout le prénom composé » (Yéman) : le prénom
   d'usage de la fiche, sinon celui que le Trône devine du nom. Recopié de
   `src/shared/civilite.ts` entre ses repères ; verifie-le-prenom-d-usage
   et le banc des douze lunes tiennent la copie. */
/* ⟨prenom-d-usage⟩ */
/** LES PRÉNOMS QUI SE COMPOSENT (liste du 7 novembre 2026) : en tête d'un nom
    de trois mots ou plus sans NOM en capitales, ils prennent le mot suivant. */
const PRENOMS_QUI_SE_COMPOSENT: readonly string[] = ['Marie', 'Anne', 'Jean', 'Paul', 'Pierre', 'Louis'];
/** Les particules d'un nom de famille : « de », « da », « d'Agbo »… */
const PARTICULE_DU_NOM = /^(?:de|da|do|dos|das|du|des|di|del|della|van|von|le|la|d['’]\S*)$/i;
/** Un mot tout en capitales : au moins deux lettres, accents compris, l'apostrophe et le trait d'union admis. */
const motEnCapitales = (m: string): boolean => /^[\p{Lu}'’-]+$/u.test(m) && (m.match(/\p{Lu}/gu) ?? []).length >= 2;
/** La capitale d'un second prénom écrit en minuscules ; rien d'autre ne bouge. */
const capitaleDuSecond = (m: string): string => (/^\p{Ll}/u.test(m) ? `${m.charAt(0).toUpperCase()}${m.slice(1)}` : m);

/** LE PRÉNOM QUE LE TRÔNE DEVINE d'un nom complet (les règles 2 à 5). Le
    trait d'union se recolle dans le prénom, jamais vers un NOM en capitales
    (« Awa - KOSSI » reste deux mots). */
const prenomDevine = (nom: unknown): string => {
  const mots = String(nom ?? '').trim().replace(/\s+/g, ' ')
    .replace(/(\S+) ?- ?(?=(\S+))/g, (tout: string, g: string, d: string) => (motEnCapitales(g) || motEnCapitales(d) ? tout : `${g}-`))
    .split(' ').filter(Boolean);
  if (mots.length === 0) return '';
  const nomDeFamille = mots.findIndex((m, i) => i > 0 && motEnCapitales(m));
  if (nomDeFamille > 0) {
    const fin = mots.findIndex((m, i) => i > 0 && (i >= nomDeFamille || !/^\p{L}/u.test(m)));
    const prenoms = mots.slice(0, fin);
    while (prenoms.length > 1 && PARTICULE_DU_NOM.test(prenoms[prenoms.length - 1])) prenoms.pop();
    return prenoms.map((m, i) => (i > 0 && !PARTICULE_DU_NOM.test(m) ? capitaleDuSecond(m) : m)).join(' ');
  }
  const premier = mots[0].toLowerCase();
  const second = mots[1] ?? '';
  if (mots.length >= 3 && PRENOMS_QUI_SE_COMPOSENT.some((p) => p.toLowerCase() === premier) && /^\p{L}/u.test(second) && !PARTICULE_DU_NOM.test(second)) {
    return `${mots[0]} ${capitaleDuSecond(second)}`;
  }
  return mots[0];
};

/** LE PRÉNOM D'USAGE d'une cliente : celui de sa fiche, sinon celui que le
    Trône devine de son nom. `repli` sert quand la fiche manque mais qu'un nom
    est connu ailleurs (le rendez-vous, la demande du site). */
const prenomDUsage = (c: { name?: unknown; prenomUsage?: unknown } | null | undefined, repli?: unknown): string => {
  const note = String(c?.prenomUsage ?? '').trim().replace(/\s+/g, ' ');
  return note || prenomDevine(c?.name ?? repli);
};
/* ⟨/prenom-d-usage⟩ */
/* ══ MADAME NAFFI — 2 octobre 2026 ═════════════════════════════════════
   La Maison écrit « Madame Naffi » : la civilité de la fiche, puis le prénom.
   Une fiche qui ne dit rien est une dame ; une fiche au masculin d'avant ce
   jour est « Monsieur ». Recopié de `src/shared/civilite.ts` (une fonction
   Edge ne lit rien du dépôt) ; `verifie-civilite` tient la copie. Le
   9 octobre 2026, la reprise disait encore « C'est noté, Naffi ». */
const appelDe = (d: { name?: unknown; prenomUsage?: unknown; civilite?: unknown; auMasculin?: unknown } | null | undefined, repli?: unknown): string => {
  const civ = d?.civilite === 'monsieur' || d?.civilite === 'mademoiselle' || d?.civilite === 'madame'
    ? d.civilite : d?.auMasculin === true ? 'monsieur' : '';
  /* Tout le prénom composé (7 novembre 2026) : « Mme Anne Marie », jamais « Mme Anne ». */
  const prenom = prenomDUsage(d, repli);
  /* La civilité inconnue ne se suppose plus (13 octobre 2026) : le prénom seul. */
  if (!civ) return prenom || 'Madame, Monsieur';
  /* Abrégée devant le prénom (28 octobre 2026) : « M. Jean-Luc », « Mme Shadé » ; seule, en entier. */
  if (prenom) return `${civ === 'monsieur' ? 'M.' : civ === 'mademoiselle' ? 'Mlle' : 'Mme'} ${prenom}`;
  return civ === 'monsieur' ? 'Monsieur' : civ === 'mademoiselle' ? 'Mademoiselle' : 'Madame';
};
const heureDeLaReprise = (hhmm: string | undefined): string => {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm ?? '')) return hhmm ?? '';
  const [h, m] = (hhmm as string).split(':');
  const minutes = Number(m);
  return Number.isFinite(minutes) && minutes > 0
    ? `${Number(h)} h ${String(minutes).padStart(2, '0')}`
    : `${Number(h)} h`;
};

/* ══ LA PROCHAINE SÉANCE DE L'ABONNÉE — 8 novembre 2026 (lot 4 de l'abonnement refait) ══
   « Merci, Awa. Votre prochaine séance : samedi 23 janvier 2027 à 9 h ? »,
   déposé en salle par le Trône quand sa séance de formule est marquée faite
   (shared/messages-de-l-abonnee.ts). Ses deux boutons reviennent ici :
   « Oui, je réserve » (PROCHAINE_OK:<séance>) pose la place proposée,
   couverte par sa formule, sous le verrou du serveur ; « Une autre date »
   (PROCHAINE_AUTRE:<séance>) passe la main à la conversation, sans rien
   poser. Les mots et les clés sont RECOPIÉS tels quels de
   `src/shared/messages-de-l-abonnee-pur.ts` (`node scripts/terminer-copie-
   serveur.mjs` ; verifie-les-douze-lunes R8 et verifie-les-messages-de-la-
   seance les comparent). NE RIEN RETOUCHER ENTRE LES REPÈRES. */
/* ⟨prochaine-seance⟩ */
/** Le modèle Meta du message d'après la séance (deux boutons). Son nom est
    FIXE : le Trône le dépose quand la direction l'a noté « approuvé » dans le
    registre des modèles (shared/modeles-meta). */
const MODELE_PROCHAINE_SEANCE = 'prochaine_seance';
/** Le `type` et le `genre` de la ligne d'envoi déposée en salle. */
const TYPE_APRES_SEANCE = 'apres-seance';
const GENRE_APRES_SEANCE = 'apres-seance';
const BOUTONS_DE_LA_PROCHAINE_SEANCE = ['Oui, je réserve', 'Une autre date'] as const;
type GesteDeLaProchaineSeance = 'oui' | 'autre';

/** LA CLÉ D'UNICITÉ : une ligne par séance honorée, pour toujours. */
const idDeLaProchaineSeance = (rdvId: string): string => `prochaine-seance-${rdvId}`;
/** Ce que chaque bouton rapporte au webhook : la séance honorée qu'il suit. */
const chargeDuBoutonDeLaProchaineSeance = (rdvId: string, geste: GesteDeLaProchaineSeance): string =>
  `PROCHAINE_${geste === 'oui' ? 'OK' : 'AUTRE'}:${rdvId}`;
/** Le bouton touché, relu ; `null` si ce n'est pas un bouton de la prochaine séance. */
function lisLeBoutonDeLaProchaineSeance(id: unknown): { rdvId: string; geste: GesteDeLaProchaineSeance } | null {
  const m = /^PROCHAINE_(OK|AUTRE):([A-Za-z0-9_-]{1,80})$/.exec(String(id ?? ''));
  return m ? { rdvId: m[2], geste: m[1] === 'OK' ? 'oui' : 'autre' } : null;
}

/** Les mots du modèle, variables posées : {{1}} l'appel, {{2}} le moment
    (« samedi 23 janvier 2027 à 9 h », l'année toujours). */
const texteDeLaProchaineSeance = (appel: string, moment: string): string => `Merci, ${appel}. Votre prochaine séance : ${moment} ?`;
/** Ce que le fil du Trône garde : le texte et ses deux boutons, entre crochets. */
const texteAuFilDeLaProchaineSeance = (appel: string, moment: string): string =>
  `${texteDeLaProchaineSeance(appel, moment)} [${BOUTONS_DE_LA_PROCHAINE_SEANCE[0]}] [${BOUTONS_DE_LA_PROCHAINE_SEANCE[1]}]`;
/** Les composants du modèle : le corps, puis les deux réponses rapides. */
const composantsDeLaProchaineSeance = (appel: string, moment: string, rdvId: string): unknown[] => [
  { type: 'body', parameters: [{ type: 'text', text: appel }, { type: 'text', text: moment }] },
  { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: chargeDuBoutonDeLaProchaineSeance(rdvId, 'oui') }] },
  { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: chargeDuBoutonDeLaProchaineSeance(rdvId, 'autre') }] },
];

/** CE QUE « OUI » POSE : la place proposée, gardée sur la ligne d'envoi (le
    bouton ne porte que la séance ; la ligne porte le reste). */
type PropositionDeSeance = { subId: string; serviceId: string; date: string; time: string; clientId: string };
/** La proposition relue sans confiance : chaque champ présent et bien formé, sinon rien. */
function propositionLisible(x: unknown): PropositionDeSeance | null {
  if (!x || typeof x !== 'object') return null;
  const p = x as Record<string, unknown>;
  const texte = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const subId = texte(p.subId); const serviceId = texte(p.serviceId); const date = texte(p.date); const time = texte(p.time); const clientId = texte(p.clientId);
  if (!subId || !serviceId || !clientId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  return { subId, serviceId, date, time, clientId };
}

/** « Oui, je réserve » : LA confirmation, dite dans la conversation (comme
    l'automate) ; la ligne `conf-<rdv>-whatsapp`, posée avec la séance, tait
    le modèle de confirmation-rdv, qui ne reprend la main que si cette phrase
    ne part pas. Un rendez-vous se dit « confirmé pour le … ». */
const reponseAuOui = (appel: string, moment: string): string =>
  `C’est noté, ${appel} : votre séance est confirmée pour le ${moment} à la Maison MND.`;
/** « Oui » quand un rendez-vous suivant a été posé depuis le message (le
    comptoir, Ma Couronne) : rien ne se pose une seconde fois. */
const reponseDejaReservee = (appel: string, moment: string): string =>
  `C’est déjà fait, ${appel} : votre prochaine séance est confirmée pour le ${moment} à la Maison MND.`;
/** « Une autre date » : la main passe à la conversation, rien n'est posé. */
const reponseALAutreDate = (appel: string): string =>
  `Bien sûr, ${appel}. Dites-nous ici le jour qui vous va : la Maison MND vous propose une heure.`;
/** « Oui » sur une place que le serveur ne peut plus poser (prise entre-temps,
    formule qui ne porte plus) : la main passe, comme pour une autre date. */
const reponseALaPlacePrise = (appel: string): string =>
  `Cette place vient d’être prise, ${appel}. Dites-nous ici le jour qui vous va : la Maison MND vous propose une heure.`;
/* ⟨/prochaine-seance⟩ */
/* LE RENDEZ-VOUS SUIVANT, RELU AU « OUI » (11 novembre 2026) : posé depuis le
   message (le comptoir, Ma Couronne), rien ne se pose une seconde fois. Bloc
   RECOPIÉ de `src/shared/messages-de-l-abonnee-pur.ts`, comme le précédent.
   NE RIEN RETOUCHER ENTRE LES REPÈRES. */
/* ⟨deja-un-suivant⟩ */
/** Un rendez-vous de la tête, pour savoir si un suivant est déjà posé. */
type RdvDeLaTete = { id: string; clientId: string; date: string; time?: string; status: string };
/** LE RENDEZ-VOUS SUIVANT, S'IL EST DÉJÀ POSÉ : le plus proche rendez-vous
    de la même tête, ni annulé ni honoré, après la séance (le même jour plus
    tard compris). `null` : elle n'a pas encore sa place. Jugé trois fois :
    au dépôt (le Trône), au départ (le facteur : la carte « Son prochain
    rituel » pose souvent la suite pendant les dix minutes de salle), et au
    « Oui » (le webhook : rien ne se pose une seconde fois). */
function leSuivant<R extends RdvDeLaTete>(rdvs: readonly R[], seance: { id: string; clientId: string; date: string; time?: string }): R | null {
  let mieux: R | null = null;
  for (const a of rdvs) {
    if (!a || a.id === seance.id || a.clientId !== seance.clientId || a.status === 'annulé' || a.status === 'honoré') continue;
    const apres = a.date > seance.date || (a.date === seance.date && String(a.time ?? '') > String(seance.time ?? ''));
    if (!apres) continue;
    if (!mieux || a.date < mieux.date || (a.date === mieux.date && String(a.time ?? '') < String(mieux.time ?? ''))) mieux = a;
  }
  return mieux;
}
/** Un rendez-vous suivant existe-t-il déjà ? Alors pas de message : elle a déjà sa place. */
const dejaUnSuivant = (rdvs: readonly RdvDeLaTete[], seance: { id: string; clientId: string; date: string; time?: string }): boolean =>
  leSuivant(rdvs, seance) !== null;
/* ⟨/deja-un-suivant⟩ */

/** LA SUITE DE LA SÉANCE, relue en base : la séance (sa date, son heure) et
    les rendez-vous de sa tête depuis ce jour. `null` : aucune suite, ou une
    lecture impossible (le serveur jugera seul, sur un crédit libre). */
async function suivantDeLaSeance(sb: ReturnType<typeof createClient>, seanceId: string, clientId: string): Promise<RdvDeLaTete | null> {
  if (!seanceId || !clientId) return null;
  const { data: s, error: errS } = await sb.from('appointments').select('id, data').eq('id', seanceId).limit(1);
  const seance = ((s ?? [])[0] as { id: string; data?: Partial<RdvDeLaTete> } | undefined)?.data;
  if (errS || !seance?.date) return null;
  const { data: siens, error } = await sb.from('appointments').select('id, data')
    .eq('data->>clientId', clientId).gte('data->>date', seance.date).limit(500);
  if (error) return null;
  const rdvs = ((siens ?? []) as { id: string; data?: Partial<RdvDeLaTete> }[]).map((r) => ({
    id: r.id, clientId: String(r.data?.clientId ?? ''), date: String(r.data?.date ?? ''), time: r.data?.time, status: String(r.data?.status ?? ''),
  }));
  return leSuivant(rdvs, { id: seanceId, clientId, date: seance.date, time: seance.time });
}

/** LA LIGNE DE CONFIRMATION de la séance posée par « Oui »
    (`conf-<rdv>-whatsapp`, posée « en cours » avec elle par 0198) : la
    phrase partie, « envoyé » ; sinon « échec », et le modèle de
    confirmation-rdv prend le relais. Comme `ditLaConfirmation` de
    whatsapp-automate : un verdict déjà tombé ne se réécrit pas. */
async function ditLaConfirmationDeLaSeance(sb: ReturnType<typeof createClient>, apptId: string, dit: DitDuTrone): Promise<void> {
  const id = `conf-${apptId}-whatsapp`;
  const { data, error } = await sb.from('envois').select('id, data').eq('id', id).limit(1);
  if (error) { dis('prochaine séance · confirmation illisible', { motif: error.message.slice(0, 120) }); return; }
  const ligne = ((data ?? []) as { id: string; data: Record<string, unknown> }[])[0];
  if (!ligne || ligne.data?.statut !== 'en cours') return;
  const maintenant = new Date().toISOString();
  const neuf = dit?.waId
    ? { ...ligne.data, statut: 'envoyé', waMessageId: dit.waId, detail: 'dit dans la conversation, après la séance', quand: maintenant }
    : { ...ligne.data, statut: 'échec', detail: String(dit?.detail ?? 'la phrase n’est pas partie dans la conversation').slice(0, 300), quand: maintenant };
  const { error: errEcrit } = await sb.from('envois').update({ data: neuf, updated_at: maintenant })
    .eq('id', id).eq('data->>statut', 'en cours');
  if (errEcrit) dis('prochaine séance · confirmation refusée', { motif: errEcrit.message.slice(0, 120) });
}

/* ══ LES DEUX MESSAGES QUI PARTENT SEULS ═════════════════════════════
   Ils partent dans la fenêtre qu'elle vient d'ouvrir en écrivant, donc sans
   modèle. Chacun laisse une ligne dans le fil, comme tout ce que la Maison
   envoie, signée « Le Trône » — la direction voit ce qui est parti sans
   elle. JAMAIS DEUX FOIS EN VINGT-QUATRE HEURES pour un même numéro et un
   même motif : un prestataire qui envoie trois photos reçoit un seul merci. */
/** Les messages qui partent seuls, chacun une fois par jour et par numéro. */
type AutoDuTrone = 'accuse' | 'formulaire' | 'transmis' | 'reprise-ok' | 'reprise-autre' | 'point-bien' | 'point-souci' | 'point-recu' | 'point-avant'
  | 'assistant-oui' | 'assistant-autre' | 'assistant-non' | 'assistant-empechee' | 'assistant-carte' | 'stop' | 'franche'
  | 'accord-demande' | 'accord-oui' | 'accord-non';
/** La prochaine séance de l'abonnée (8 et 11 novembre 2026) : posée, une autre date, une place prise entre-temps, une suite déjà posée. */
type AutoDeLaProchaineSeance = 'prochaine-oui' | 'prochaine-autre' | 'prochaine-prise' | 'prochaine-deja';

/** Ce que la phrase est devenue (11 novembre 2026, pour la ligne de
    confirmation de la prochaine séance) : `null` quand rien n'est parti
    d'ici (déjà dite dans les 24 heures, ou prise par une autre livraison). */
type DitDuTrone = { waId: string; etat: string; detail?: string } | null;

async function ditDepuisLeTrone(
  sb: ReturnType<typeof createClient>, jeton: string, phoneId: string,
  o: {
    numero: string; texte: string; auto: AutoDuTrone | AutoDeLaProchaineSeance;
    branchId?: string; interactive?: Record<string, unknown>;
  },
): Promise<DitDuTrone> {
  const depuis = new Date(Date.now() - FENETRE_MS).toISOString();
  const { data: deja } = await sb.from('messages_wa').select('id')
    .eq('data->>numero', o.numero).eq('data->>sens', 'sortant').eq('data->>auto', o.auto)
    .gte('data->>quand', depuis).limit(1);
  if ((deja ?? []).length > 0) return null;

  /* ── LA PLACE SE RÉSERVE AVANT DE PARLER · 10 octobre 2026 ───────────
     Revue de code : la garde ci-dessus est une lecture, et la ligne qui
     l'arme ne s'écrivait qu'APRÈS la réponse de Graph. Deux livraisons de
     Meta traitées en même temps passaient toutes deux la lecture, et le
     prestataire recevait deux « Bien reçu, merci ». On écrit donc d'abord
     une ligne à identifiant DÉTERMINISTE (le motif, le numéro, le jour de
     Cotonou) : la base n'en garde qu'une, `ignoreDuplicates` + `.select`
     ne la rend qu'à celui qui l'a vraiment écrite, et lui seul parle. La
     ligne porte déjà le texte, « en route » : l'écran la montre comme tout
     message qui part. La lecture des 24 heures reste : elle tient la règle
     d'une fois par vingt-quatre heures glissantes, la réservation tient
     la course. */
  const jourDeCotonou = new Date(Date.now() + 3600000).toISOString().slice(0, 10);
  const id = `wa-auto-${o.auto}-${o.numero}-${jourDeCotonou}`;
  const ligne = (waId: string, etat: string, detail?: string) => ({
    id, branch_id: o.branchId ?? null,
    data: {
      id, waId: waId || undefined, branchId: o.branchId, sens: 'sortant', numero: o.numero,
      texte: o.texte, type: o.interactive ? 'interactive' : 'text', quand: new Date().toISOString(),
      etat, detail, parQui: 'Le Trône', auto: o.auto,
    },
  });
  const { data: reservee, error: errReserve } = await sb.from('messages_wa')
    .upsert(ligne('', 'en-route'), { onConflict: 'id', ignoreDuplicates: true }).select('id');
  if (errReserve) { console.error(`whatsapp-webhook · AUTO · ${errReserve.message}`); return null; }
  if (!(reservee ?? []).length) { dis('deja parti par une autre livraison', { auto: o.auto }); return null; }

  const charge = o.interactive
    ? { messaging_product: 'whatsapp', to: o.numero, type: 'interactive', interactive: o.interactive }
    : { messaging_product: 'whatsapp', to: o.numero, type: 'text', text: { body: o.texte } };
  let waId = '';
  let etat = 'en-route';
  let detail: string | undefined;
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton}` },
      body: JSON.stringify(charge),
      signal: AbortSignal.timeout(DELAI_DE_META_MS),
    });
    const rep = await r.json().catch(() => ({}));
    if (r.ok && rep?.messages?.[0]?.id) waId = String(rep.messages[0].id);
    else { etat = 'non-remis'; detail = String(rep?.error?.message ?? `HTTP ${r.status}`).slice(0, 300); }
  } catch (e) {
    etat = 'non-remis';
    detail = String(e).slice(0, 300);
  }
  /* LA MÊME LIGNE, COMPLÉTÉE : l'accusé de Meta la retrouve par `waId`. */
  const { error } = await sb.from('messages_wa').upsert(ligne(waId, etat, detail), { onConflict: 'id' });
  if (error) console.error(`whatsapp-webhook · AUTO · ${error.message}`);
  else dis('parti tout seul', { auto: o.auto, etat });
  return { waId, etat, ...(detail ? { detail } : {}) };
}

/** « 2026-11-03 » depuis ce qu'un Flow rend : une date ISO, ou un instant
    en millisecondes selon la version du formulaire. Vide si illisible. */
const jourDuFlow = (v: unknown): string => {
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{9,}$/.test(s)) {
    const d = new Date(Number(s));
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '';
  }
  return '';
};

/** Jours calendaires inclus entre deux dates ISO. Même règle que
    `daysInclusive` (equipe/payroll.ts). */
const joursInclus = (du: string, au: string): number => {
  const a = new Date(`${du}T12:00:00Z`).getTime();
  const b = new Date(`${au}T12:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
};

/* ══ LES POINTS D'ÉTAPE, CE QUE LES RÉPONSES VEULENT DIRE — 17 octobre 2026 ══
   Copie marquée des règles de src/shared/entre-deux-pur.ts (une fonction
   Edge ne lit rien du dépôt) ; scripts/verifie-points-d-etape la confronte
   à l'original, réponse par réponse. */
// ── DEBUT pointsDuWebhook
type CleDeSouciWa = 'seches' | 'cassantes' | 'inegales' | 'pousse' | 'odeur' | 'gratte' | 'chute' | 'autre';
type EnvieAvantWa = 'soin' | 'coloration' | 'coiffure' | 'autre';
const SOUCIS_WA: readonly { cle: CleDeSouciWa; dit: string; niveau: 'conseil' | 'voir' | 'sante'; avancer?: boolean }[] = [
  { cle: 'seches', dit: 'Sèches', niveau: 'conseil' },
  { cle: 'cassantes', dit: 'Cassantes, qui s’amincissent', niveau: 'voir', avancer: true },
  { cle: 'inegales', dit: 'Inégales, racines qui s’emmêlent', niveau: 'voir', avancer: true },
  { cle: 'pousse', dit: 'Racines qui ont trop poussé', niveau: 'conseil', avancer: true },
  { cle: 'odeur', dit: 'Odeur, séchage long', niveau: 'conseil' },
  { cle: 'gratte', dit: 'Ça gratte, plaques, rougeurs', niveau: 'sante' },
  { cle: 'chute', dit: 'Chute, trous, douleur', niveau: 'sante' },
  { cle: 'autre', dit: 'Autre chose', niveau: 'voir' },
];
const ENVIES_AVANT_WA: readonly { cle: EnvieAvantWa; dit: string }[] = [
  { cle: 'soin', dit: 'un soin' }, { cle: 'coloration', dit: 'une coloration' },
  { cle: 'coiffure', dit: 'une coiffure spéciale' }, { cle: 'autre', dit: 'autre chose' },
];
const TITRE_COURT: Record<CleDeSouciWa, string> = {
  seches: 'Sèches', cassantes: 'Cassantes', inegales: 'Inégales, emmêlées', pousse: 'Racines trop longues',
  odeur: 'Odeur, séchage long', gratte: 'Ça gratte, rougeurs', chute: 'Chute, trous, douleur', autre: 'Autre chose',
};
const MOT_DE_LA_LISTE = 'Qu’est-ce qui se passe ? Choisissez ce qui ressemble le plus à ce que vous voyez.';
const BOUTON_DE_LA_LISTE = 'Voir les soucis';
const MERCI_BIEN = 'Merci ! Bonne nouvelle. À votre prochaine séance.';
const ACCUSE_POINT = 'Merci de nous l’avoir dit. La Maison vous répond très vite.';
const ACCUSE_SANTE_POINT = 'Merci de nous l’avoir dit. La Maison vous rappelle très vite. En attendant, ne mettez aucun produit nouveau.';
type ReponseAuPointWa =
  | { geste: 'bien' | 'souci'; apptId: string }
  | { geste: 'liste'; apptId: string; cle: CleDeSouciWa }
  | { geste: 'avant'; apptId: string; envie: EnvieAvantWa };
function lisLaReponseAuPoint(id: string): ReponseAuPointWa | null {
  const m = String(id ?? '').match(/^POINT_(BIEN|SOUCI|LISTE|AVANT):([A-Za-z0-9_-]{1,80})(?::([a-z]{1,20}))?$/);
  if (!m) return null;
  const [, quoi, apptId, arg] = m;
  if (quoi === 'BIEN' || quoi === 'SOUCI') return arg ? null : { geste: quoi === 'BIEN' ? 'bien' : 'souci', apptId };
  if (quoi === 'LISTE') return SOUCIS_WA.some((s) => s.cle === arg) ? { geste: 'liste', apptId, cle: arg as CleDeSouciWa } : null;
  return ENVIES_AVANT_WA.some((e) => e.cle === arg) ? { geste: 'avant', apptId, envie: arg as EnvieAvantWa } : null;
}
const lignesDeLaListe = (apptId: string): { id: string; titre: string; description: string }[] =>
  SOUCIS_WA.map((s) => ({ id: `POINT_LISTE:${apptId}:${s.cle}`, titre: TITRE_COURT[s.cle], description: s.dit.slice(0, 72) }));
function reponseAuSouciDuPoint(cle: CleDeSouciWa, validees: Partial<Record<string, string>>): string[] {
  const s = SOUCIS_WA.find((x) => x.cle === cle);
  if (s?.niveau === 'sante') return [ACCUSE_SANTE_POINT];
  const valide = (validees[cle] ?? '').trim();
  const plus: string[] = [];
  if (cle === 'autre') plus.push('Dites-nous en quelques mots ce que vous voyez, ici même.');
  if (s?.avancer) plus.push('Si vous le souhaitez, nous pouvons avancer votre prochaine séance : dites-le-nous ici.');
  return [valide || ACCUSE_POINT, ...plus];
}
function reponseAvant(appel: string, envie: EnvieAvantWa, jour: string): string {
  if (envie === 'autre') return `Merci, ${appel} ! Dites-nous en quelques mots ce qui vous ferait plaisir pour votre séance du ${jour} : nous préparons votre venue.`;
  const dit = ENVIES_AVANT_WA.find((e) => e.cle === envie)?.dit ?? 'votre envie';
  return `Merci, ${appel} ! Nous notons votre envie : ${dit}. Nous vous écrivons très vite pour préparer votre séance du ${jour}.`;
}
// ── FIN pointsDuWebhook

/* ══ LA NOTIFICATION SUR LE TELEPHONE — 18 septembre 2026 ══════════════

   « Construis la notification sur mon telephone » (Yeman). L alarme du
   tableau de bord ne se voit que Trone ouvert ; celle-ci arrive meme Trone
   ferme, des qu un message est range.

   COPIE de `alerteDuTelephone` (src/shared/conversations.ts), eprouvee par
   scripts/verifie-alarme-whatsapp. Une fonction Edge n importe rien du depot :
   LES DEUX CHANGENT ENSEMBLE.

   POURQUOI PAS push-notify : son mode staff est plafonne a six appels par dix
   minutes et par adresse, plafond partage avec le tunnel public. Tous les
   appels du webhook partiraient de la meme adresse, et un samedi charge
   perdrait des alertes sans bruit. On envoie donc d ici, avec la meme
   bibliotheque et les memes cles.

   CE QU ELLE DIT : le PRENOM d une cliente, jamais le texte, car un ecran
   verrouille se lit par-dessus l epaule. Un message de l equipe ou d un
   prestataire ne previent que la direction, et sans nom (0102). */
type Arrivee = { numero: string; tiroir: string; nom: string };
type Alerte = { titre: string; corps: string; url: string };

/* Le prénom seul : `prenomDe`, recopié de foyer-pur (⟨prenom-de⟩, plus bas). */

function alerteDuTelephone(arrivees: readonly Arrivee[], pourLaDirection: boolean): Alerte | null {
  const visibles = pourLaDirection ? arrivees : arrivees.filter((a) => a.tiroir === 'clientes');
  const numeros = [...new Set(visibles.map((a) => a.numero))];
  if (numeros.length === 0) return null;
  if (numeros.length === 1) {
    const a = visibles.find((x) => x.numero === numeros[0]) as Arrivee;
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

/** Previent les telephones abonnes. Ne leve JAMAIS : une alerte manquee ne
    doit pas faire echouer le rangement du message, ni la reponse a Meta. */
async function alerteLePersonnel(sb: SupabaseClient, arrivees: Arrivee[]): Promise<void> {
  if (arrivees.length === 0) return;
  await previensLesTelephones(sb, alerteDuTelephone(arrivees, true), alerteDuTelephone(arrivees, false), arrivees.length);
}

/** L ENVOI LUI-MEME, pour une alerte deja faite : celle des arrivees
    (ci-dessus), ou celle que rend l automate (un rendez-vous pose, la main
    passee · 9 octobre 2026). Une alerte nulle ne part pas. Ne leve JAMAIS. */
async function previensLesTelephones(
  sb: SupabaseClient, pourLaDirection: Alerte | null, pourLesAutres: Alerte | null, messages: number,
): Promise<void> {
  if (!pourLaDirection && !pourLesAutres) return;
  const pub = Deno.env.get('VAPID_PUBLIC');
  const priv = Deno.env.get('VAPID_PRIVATE');
  if (!pub || !priv) { dis('alerte · cles VAPID absentes'); return; }
  try {
    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@maison-mnd.bj', pub, priv);
  } catch (e) {
    dis('alerte · cles VAPID refusees', { motif: String(e).slice(0, 120) });
    return;
  }
  const { data: staff, error } = await sb.from('staff').select('user_id, role');
  if (error) { dis('alerte · equipe illisible', { motif: error.message.slice(0, 120) }); return; }
  const estDirection = (role: unknown) => role === 'souverain' || role === 'gerant';
  const direction = (staff ?? []).filter((s: any) => estDirection(s.role)).map((s: any) => String(s.user_id));
  const autres = (staff ?? []).filter((s: any) => !estDirection(s.role)).map((s: any) => String(s.user_id));

  const envoie = async (uids: string[], a: Alerte | null): Promise<number> => {
    if (!a || uids.length === 0) return 0;
    const { data: abonnes } = await sb.from('push_subscriptions').select('endpoint,p256dh,auth').in('client_id', uids);
    let n = 0;
    for (const s of (abonnes ?? []) as any[]) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: a.titre, body: a.corps, url: a.url }),
        );
        n++;
      } catch (e) {
        /* Un abonnement mort (telephone change, permission retiree) se retire,
           comme le fait push-notify. */
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    }
    return n;
  };

  const n = (await envoie(direction, pourLaDirection))
    + (await envoie(autres, pourLesAutres));
  dis('alerte · telephones prevenus', { envois: n, messages });
}

/* ══ LA MAISON RÉPOND ET RÉSERVE · 9 octobre 2026 ══════════════════════
   Les messages NEUFS d'un numéro (jamais une seconde livraison) sont confiés
   à `whatsapp-automate`, un appel par numéro, porte fermée par CLE_SERVICE
   (comme le cron vers confirmation-rdv). Il juge seul qui il sert, et rend
   `{ pris, alerte? }` :
     · pris: false, une erreur, un retard : la notification habituelle part,
       et l'alarme du Trône sonne comme avant. Une panne se voit, elle ne
       crée jamais de doublon (une relivraison n'est jamais neuve) ;
     · pris: true : l'automate tient le fil. Il ne sonne que pour ce qui
       demande la Maison, un rendez-vous posé ou la main passée, avec le
       prénom seul, jamais le texte.
   EN TÂCHE DE FOND : `EdgeRuntime.waitUntil` laisse répondre 200 à Meta
   sans attendre la conversation (l'automate attend 2,5 s « en train
   d'écrire », lit l'agenda, pose sous verrou). Sans elle, le webhook attend
   la même tâche, 8 s au plus. */
/* Opale (4 novembre 2026) lit tout, appelle ses outils et Claude : son
   tour tient en 85 s au plus, on lui en laisse 120. */
const AUTOMATE_EN_FOND_MS = 120_000;
const AUTOMATE_SANS_FOND_MS = 8_000;

type Confie = { numero: string; tiroir: string; waIds: string[]; nom: string };
type ReponseDeLAutomate = { pris: boolean; alerte?: Alerte };

/** `EdgeRuntime.waitUntil`, s'il existe ici. Le contrôle de santé le dit. */
const tacheDeFond = (): ((p: Promise<unknown>) => void) | null => {
  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  const attends = er?.waitUntil;
  return typeof attends === 'function' ? (p) => attends.call(er, p) : null;
};

/** UN NUMÉRO CONFIÉ À L'AUTOMATE. Ne lève jamais : tout ce qui n'est pas
    un « pris » lisible vaut `pris: false`, et la notification part. */
async function passeALAutomate(
  urlBase: string, service: string, c: Confie, delaiMs: number,
): Promise<ReponseDeLAutomate> {
  return demandeALAutomate(urlBase, service, { numero: c.numero, tiroir: c.tiroir, waIds: c.waIds }, delaiMs);
}

/** L'APPEL LUI-MÊME : un tour (`waIds`) ou un rattrapage (`apresCoup`). */
async function demandeALAutomate(
  urlBase: string, service: string, corps: Record<string, unknown>, delaiMs: number,
): Promise<ReponseDeLAutomate> {
  try {
    const r = await fetch(`${urlBase.replace(/\/+$/, '')}/functions/v1/whatsapp-automate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${service}` },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(delaiMs),
    });
    const rep = await r.json().catch(() => ({})) as { pris?: unknown; alerte?: Partial<Alerte> | null };
    if (!r.ok) {
      dis('automate · refus', { statut: r.status });
      return { pris: false };
    }
    const a = rep?.alerte;
    const alerte = a && typeof a.titre === 'string' && typeof a.corps === 'string' && typeof a.url === 'string'
      ? { titre: a.titre.slice(0, 120), corps: a.corps.slice(0, 200), url: a.url.slice(0, 200) }
      : undefined;
    return { pris: rep?.pris === true, ...(alerte ? { alerte } : {}) };
  } catch (e) {
    dis('automate · injoignable ou trop lent', { motif: String(e).slice(0, 120) });
    return { pris: false };
  }
}

/** LES NUMÉROS CONFIÉS, ensemble, puis ce qui doit sonner. Une alerte de
    l'automate sur un fil de l'équipe (un numéro d'essai de la direction) ne
    va qu'à la direction, comme tout message de l'équipe (0102). */
async function confieALAutomate(
  sb: SupabaseClient, urlBase: string, service: string, confies: Confie[], delaiMs: number,
): Promise<void> {
  try {
    const reponses = await Promise.all(confies.map((c) => passeALAutomate(urlBase, service, c, delaiMs)));
    const repli: Arrivee[] = [];
    for (let i = 0; i < confies.length; i += 1) {
      const c = confies[i];
      const r = reponses[i];
      if (!r.pris) {
        for (let k = 0; k < c.waIds.length; k += 1) repli.push({ numero: c.numero, tiroir: c.tiroir, nom: c.nom });
        continue;
      }
      if (r.alerte) await previensLesTelephones(sb, r.alerte, c.tiroir === 'clientes' ? r.alerte : null, c.waIds.length);
    }
    dis('automate · tours rendus', { confies: confies.length, pris: reponses.filter((r) => r.pris).length });
    await alerteLePersonnel(sb, repli);
  } catch (e) {
    dis('automate · echec', { motif: String(e).slice(0, 120) });
  }
}

/** UN MESSAGE DE L'AUTOMATE REFUSÉ APRÈS COUP par Meta (l'accusé
    « failed ») : chaque numéro est rendu à l'automate, qui passe la main
    d'un parcours en cours et rend l'alerte. Le tiroir vient de la base,
    comme pour un message reçu. Ne lève jamais. */
async function rattrapeLesRefus(
  sb: SupabaseClient, urlBase: string, service: string, numeros: string[], delaiMs: number,
): Promise<void> {
  try {
    for (const numero of numeros) {
      const { data: tete } = await sb.rpc('tete_du_numero', { n: numero });
      const tiroir = String((tete as { tiroir?: string } | null)?.tiroir ?? 'clientes');
      if (tiroir !== 'clientes' && tiroir !== 'equipe') continue;
      const r = await demandeALAutomate(urlBase, service, { numero, tiroir, apresCoup: 'envoi-refuse' }, delaiMs);
      if (r.alerte) await previensLesTelephones(sb, r.alerte, tiroir === 'clientes' ? r.alerte : null, 1);
    }
  } catch (e) {
    dis('automate · rattrapage en echec', { motif: String(e).slice(0, 120) });
  }
}

/* ══ LES FICHES D'UN NUMÉRO · 9 octobre 2026 ═══════════════════════════
   Ce fichier lisait `clients` d'un seul select, puis rapprochait les
   numéros avec un `find` : au-delà de mille fiches, une cliente connue
   passait pour inconnue, et seule la première fiche d'un numéro était vue.
   `fiches_du_numero` (0125) rend en UNE valeur les fiches non archivées
   dont `phone` ou `phone2` est ce numéro, celles du premier numéro d'abord,
   puis leur famille. Le rapprochement garde sa règle : une fiche ne vaut
   pour un numéro que si elle le PORTE (`numeros`), un enfant de la famille
   sans numéro à lui n'est jamais pris pour celle qui écrit.

   SANS 0125 (la RPC absente ou en panne), on lit la table PAR PAGES : le
   plafond de mille ne revient pas par la porte de secours, et l'oreille
   rattache toujours. Le journal le dit. */
type FicheDuNumero = { id: string; nom?: string; prenomUsage?: string; civilite?: string; auMasculin?: boolean; branchId?: string; numeros: string[] };

/* TOUTE LA TABLE, PAGE PAR PAGE. Recopié TEL QUEL de
   `src/shared/lecture-entiere.ts`, de `PAGE_DE_LECTURE` à la fin du fichier
   (l'original ne porte pas de repères : la copie entre les siens doit s'y
   retrouver mot pour mot). Une erreur en route rend l'erreur et AUCUNE
   ligne. */
/* ⟨lecture-entiere⟩ */
export const PAGE_DE_LECTURE = 1000;

type ErreurDeLecture = { message: string };
export type ReponseDePage<L> = { data: L[] | null; error: ErreurDeLecture | null };
/** Lit une page : les `taille` premières lignes dont l'`id` suit `apres`
    (toutes depuis le début si `apres` est nul), dans l'ordre croissant des `id`. */
export type LecteurDePage<L extends { id: string }> = (apres: string | null, taille: number) => PromiseLike<ReponseDePage<L>>;

/* Deux mille pages font deux millions de lignes : au-delà, ce n'est plus une
   table qu'on charge dans un navigateur, c'est une boucle qui ne finit pas. */
const PAGES_AU_PLUS = 2000;

export async function litToutesLesPages<L extends { id: string }>(
  page: LecteurDePage<L>,
  taille: number = PAGE_DE_LECTURE,
): Promise<ReponseDePage<L>> {
  const vues = new Map<string, L>();
  let apres: string | null = null;
  for (let tour = 0; tour < PAGES_AU_PLUS; tour += 1) {
    const { data, error } = await page(apres, taille);
    if (error) return { data: null, error };
    const lignes = data ?? [];
    for (const l of lignes) vues.set(l.id, l);
    if (lignes.length < taille) return { data: [...vues.values()], error: null };
    apres = lignes[lignes.length - 1].id;
  }
  return { data: null, error: { message: 'lecture interminable : la table ne finit pas' } };
}
/* ⟨/lecture-entiere⟩ */

/* ══ CE QUE L'ASSISTANT MAISON ENTEND — 27 octobre 2026 ══════════════════
   Ses boutons (« GERARD:<ligne>:<geste> »), « STOP », la question franche.
   Copie de src/shared/assistant-reponses-pur.ts, refaite par
   `node scripts/copie-dans-le-centre.mjs --fonction supabase/functions/whatsapp-webhook/index.ts` ;
   `verifie-gerard` crie si elle a pris du retard. */
// ── DÉBUT DE LA COPIE : src/shared/assistant-reponses-pur.ts ──
/* ══ CE QUE L'ASSISTANT MAISON ENTEND — 27 octobre 2026 ══════════════════
   Maquette v4, lot 2 : « l'oreille ». Ce module ne dépend de rien : le
   webhook WhatsApp le porte en COPIE entre ses repères
   (`node scripts/copie-dans-le-centre.mjs --fonction supabase/functions/whatsapp-webhook/index.ts`),
   et `verifie-gerard` crie si la copie a pris du retard.

     · LES BOUTONS de ses modèles portent l'identifiant de leur ligne
       d'envoi (« GERARD:<ligne>:<geste> ») : la réponse s'écrit sur la
       ligne (oui, non), l'automate de réservation ne la prend pas (il ne
       lit que les boutons « MND: »), et la Maison répond d'une phrase.
     · « STOP » : plus aucune nouvelle de la Maison, les rappels de RDV
       continuent (ce sont des services).
     · LA QUESTION FRANCHE : à « c'est un robot ? », il ne ment jamais. */

/** Le geste d'un bouton, d'après son libellé. */
export type GesteDuBouton = 'OUI' | 'SOIN' | 'AUTRE' | 'NON' | 'MERCI' | 'CARTE';
export const GESTE_DU_LIBELLE: Record<string, GesteDuBouton> = {
  'Oui, je viens': 'OUI', 'Changer l’heure': 'AUTRE', 'Je ne peux plus': 'NON',
  'Oui': 'OUI', 'Avec le soin': 'SOIN', 'Pas cette fois': 'NON', 'Une autre date': 'AUTRE',
  'Merci, je réserve': 'OUI', 'Merci': 'MERCI', 'Une place': 'OUI', 'La carte cadeau': 'CARTE',
  'Prendre un RDV': 'OUI', 'Pas pour l’instant': 'NON',
};
export const PREFIXE_DU_BOUTON = 'GERARD';

/** L'identifiant qu'un bouton porte chez Meta (128 signes au plus). */
export const charge = (ligneId: string, libelle: string): string =>
  `${PREFIXE_DU_BOUTON}:${ligneId}:${GESTE_DU_LIBELLE[libelle] ?? 'OUI'}`.slice(0, 128);

/** Le bouton touché, relu : sa ligne d'envoi et son geste ; `null` si ce n'est pas un bouton de l'Assistant. */
export function lisLeBoutonDeLAssistant(id: string | undefined): { ligneId: string; geste: GesteDuBouton } | null {
  const m = /^GERARD:(gerard-\d{4}-\d{2}-\d{2}-.+-(?:whatsapp|push|wa-main)):(OUI|SOIN|AUTRE|NON|MERCI|CARTE)$/.exec(String(id ?? ''));
  return m ? { ligneId: m[1], geste: m[2] as GesteDuBouton } : null;
}

/** Ce que la ligne retient : oui (elle veut une place), non (pas maintenant), rien pour un merci. */
export const reponseDuGeste = (g: GesteDuBouton): 'oui' | 'non' | undefined =>
  g === 'NON' ? 'non' : g === 'MERCI' ? undefined : 'oui';

/** « STOP » et ses variantes, seuls dans le message. */
export const estUnStop = (texte: string): boolean =>
  /^\s*(stop|arr[eê]t(ez|er)?|d[ée]sabonne(r|z)?(-| )?(moi)?|unsubscribe|plus de messages?)\s*[.!]*\s*$/i.test(String(texte ?? ''));
export const ACCUSE_DU_STOP = 'C’est noté : la Maison ne vous enverra plus ses nouvelles. Les rappels de vos rendez-vous continuent.';

/** Une cliente qui demande franchement si elle parle à une personne. */
export const estUneQuestionFranche = (texte: string): boolean =>
  /\b(robot|chatbot|bot|ia|intelligence artificielle|machine)\b|\b(message|réponse|reponse)s? automatiques?\b|\bje parle (à|a) qui\b|\bc.est (bien |vraiment )?g[ée]rard\b|\bune vraie personne\b|\bun (être )?humain\b/i.test(String(texte ?? ''));
/* 2 novembre 2026 : « Gérard n'existe plus » (Yéman). L'assistant des clientes
   s'appelle Perle entre nous ; devant une cliente, il reste « l'assistant de la
   Maison » et ne nomme personne. */
export const REPONSE_FRANCHE = 'Je suis l’assistant automatique de la Maison pour les rendez-vous. Si vous préférez, je préviens une personne de l’équipe, qui vous écrit dans la journée.';

/** LA PHRASE DE RETOUR à un bouton, et sa clé de réservation (une par jour et par numéro). */
export function retourDuBouton(o: {
  geste: GesteDuBouton; garder: boolean; appel: string; quand?: string; couronneUrl: string; offrirUrl: string;
}): { auto: string; texte: string } | null {
  const { appel } = o;
  if (o.geste === 'MERCI') return null;
  if (o.garder) {
    if (o.geste === 'OUI' && o.quand) return { auto: 'assistant-oui', texte: `C’est noté, ${appel} : la Maison vous attend ${o.quand}.` };
    /* « Je ne peux plus » (2 novembre 2026, lot 3 de Perle) : rien n'est
       annulé, la Maison est prévenue et reprend la conversation. */
    if (o.geste === 'NON') return { auto: 'assistant-empechee', texte: `C’est noté, ${appel} : nous prévenons la Maison, qui vous écrit ici au sujet de votre rendez-vous${o.quand ? ` ${o.quand}` : ''}.` };
    /* « Changer l'heure » : l'automate propose ses places et déplace ; cette
       phrase n'est plus que son SECOURS, quand il ne répond pas. */
    return { auto: 'assistant-autre', texte: `Bien sûr, ${appel}. Choisissez votre nouveau moment dans Ma Couronne : ${o.couronneUrl}\nOu répondez ici avec le jour qui vous va, la Maison vous propose une heure.` };
  }
  if (o.geste === 'NON') return { auto: 'assistant-non', texte: `C’est noté, ${appel}. La Maison reste là quand l’envie vous prend.` };
  if (o.geste === 'CARTE') return { auto: 'assistant-carte', texte: `Avec plaisir, ${appel} ! La carte cadeau de la Maison se commande ici : ${o.offrirUrl}` };
  const soin = o.geste === 'SOIN' ? ', nous notons le soin' : '';
  return { auto: 'assistant-oui', texte: `Avec plaisir, ${appel}${soin} ! Choisissez votre place dans Ma Couronne : ${o.couronneUrl}\nOu répondez ici avec le jour et l’heure qui vous vont, la Maison vous confirme.` };
}

/* ══ LES BOUTONS DE « GARDER » — 2 novembre 2026, lot 3 de Perle ══════════
   Spec v4 (docs/spec-assistant-maison.md, l. 391 et 400) et choix de Yéman
   du 2 novembre 2026 (le déplacement se fait seul, sous verrou) :
     · « Oui, je viens » : le rendez-vous est gardé, rien d'autre ne part ;
     · « Changer l'heure » : un autre moment demandé (À faire allume la
       ligne), et le webhook transmet le bouton à l'automate avec
       `deplacer: { rdvId }` : il propose ses places et déplace le rendez-vous
       sous verrou. S'il ne répond pas, la phrase de Ma Couronne en secours et
       l'équipe prévenue ;
     · « Je ne peux plus » : RIEN N'EST ANNULÉ. Une marque datée sur le
       rendez-vous (`empecheeDitLe` : À faire dit « ne peut plus venir »), la
       main passe à l'équipe sur ce fil (l'automate se tait : la ligne
       `main-<numéro>` de `fils_automate`, celle que pose le Trône quand une
       personne écrit), le téléphone de l'équipe sonne (le prénom, jamais un
       texte) et la cliente reçoit une phrase sobre. */
export const MOTIF_NE_PEUT_PLUS = 'ne-peut-plus';
/** La main passée à l'équipe tient vingt-quatre heures, la pause livrée de l'automate. */
export const PAUSE_NE_PEUT_PLUS_H = 24;

export type MarquesDuGarder = { confirmeeParLaClienteLe?: string; autreMomentDemandeLe?: string; empecheeDitLe?: string };
export type SuiteDuGarder = {
  /** Ce que le rendez-vous reçoit : une marque datée, jamais un statut. Une
      clé à `undefined` efface la marque d'une réponse précédente. */
  marques: MarquesDuGarder;
  /** La main passe à l'équipe sur ce fil (pause de l'automate). */
  main?: { motif: string; heures: number };
  /** Ce qui sonne chez l'équipe : le prénom et le rendez-vous, jamais le texte. */
  alerte?: { titre: string; corps: string };
  /** « Changer l'heure » : l'automate ouvre ses places en mode déplacement. */
  deplacer?: boolean;
};

/** La suite d'un bouton touché sous un message « garder ». `null` : rien sur
    le rendez-vous (un merci). */
export function suiteDuGarder(geste: GesteDuBouton, o: { quandIso: string; prenom: string; quand?: string }): SuiteDuGarder | null {
  const rdv = o.quand ? `Rendez-vous ${o.quand}` : 'Son rendez-vous';
  if (geste === 'OUI' || geste === 'SOIN') {
    return { marques: { confirmeeParLaClienteLe: o.quandIso, autreMomentDemandeLe: undefined, empecheeDitLe: undefined } };
  }
  if (geste === 'NON') {
    return {
      marques: { empecheeDitLe: o.quandIso, confirmeeParLaClienteLe: undefined, autreMomentDemandeLe: undefined },
      main: { motif: MOTIF_NE_PEUT_PLUS, heures: PAUSE_NE_PEUT_PLUS_H },
      alerte: { titre: `${o.prenom} ne peut plus venir`, corps: `${rdv} : rien n’est annulé. Écrivez-lui pour le déplacer ou l’annuler.` },
    };
  }
  if (geste === 'AUTRE') {
    return {
      marques: { autreMomentDemandeLe: o.quandIso, confirmeeParLaClienteLe: undefined, empecheeDitLe: undefined },
      alerte: { titre: `${o.prenom} veut changer l’heure`, corps: `${rdv} : proposez-lui une autre place.` },
      deplacer: true,
    };
  }
  return null;
}

/** LA MAIN À L'ÉQUIPE sur ce fil : la ligne `main-<numéro>` de
    `fils_automate`, telle que le Trône la pose (`poseLaMain`). La pause ne
    part jamais avant la dernière main rendue ; une pause d'une personne
    encore en cours est gardée telle quelle, seulement prolongée. */
export function mainPourLEquipe(
  avant: Record<string, unknown> | null | undefined, numero: string, motif: string, heures: number, maintenantMs: number,
): Record<string, unknown> {
  const ms = (v: unknown): number => { const x = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(x) ? x : 0; };
  const id = `main-${numero}`;
  const fin = (debut: number): string => new Date(Math.max(debut + heures * 3_600_000, ms(avant?.jusqua))).toISOString();
  if (avant && ms(avant.jusqua) > maintenantMs && ms(avant.pauseLe) > ms(avant.rendueLe)) {
    return { ...avant, id, numero, jusqua: fin(maintenantMs) };
  }
  const pose = Math.max(maintenantMs, ms(avant?.rendueLe) + 1);
  return { ...(avant ?? {}), id, numero, pauseLe: new Date(pose).toISOString(), jusqua: fin(pose), motif: motif.slice(0, 40), par: 'Assistant Maison' };
}
// ── FIN DE LA COPIE ──

/* ══ LES NOUVELLES PAR WHATSAPP — 2 novembre 2026 ═══════════════════════
   Maquette Q6aGAyTUKKJc6c2roJgHhN, choix de Yéman (« construis ») : l'accord
   des nouvelles est demandé une seule fois, juste après « Oui, je viens »,
   et ses deux boutons le donnent, daté, de source « whatsapp ». Le bloc
   ci-dessous est la COPIE de src/shared/accord-whatsapp-pur.ts entre ses
   bornes, à l'identique : verifie-gerard compare les deux textes. */
/* ⟨accord-whatsapp⟩ */
/** La question, dans la voix de la Maison (vouvoiement, sans « ! » ni emoji). */
export const QUESTION_DE_L_ACCORD =
  'Souhaitez-vous aussi recevoir les nouvelles de la Maison : les envies de saison, les offres et les places qui se libèrent ? Deux messages par mois au plus, et STOP à tout moment.';

/** Les deux boutons de réponse rapide (session de 24 h : pas de modèle Meta). */
export const BOUTON_ACCORD_OUI = 'NOUVELLES:oui';
export const BOUTON_ACCORD_NON = 'NOUVELLES:non';
export const BOUTONS_DE_L_ACCORD = [
  { id: BOUTON_ACCORD_OUI, titre: 'Oui, volontiers' },
  { id: BOUTON_ACCORD_NON, titre: 'Non merci' },
] as const;

/** Ce que la Maison répond à chaque bouton. */
export const MERCI_DE_L_ACCORD = 'Merci. Vous recevrez nos nouvelles ; un STOP suffit pour les arrêter.';
export const MERCI_DU_REFUS = 'Bien entendu. Vous continuerez de recevoir vos rappels et vos confirmations, rien d\'autre.';

/** La promesse tenue : au plus deux messages par mois et par personne pour
    tout ce qui n'est pas un service (envies, offres, relances, fêtes, place
    libérée). Les rappels, les confirmations, « garder », les reçus, les
    factures n'y comptent pas. */
export const PLAFOND_DES_NOUVELLES_PAR_MOIS = 2;
export const FENETRE_DU_PLAFOND_JOURS = 30;

/** Le moment où la question peut suivre. */
export type MomentDeLAccord = 'oui-je-viens' | 'recu';
export const MOMENTS_DE_L_ACCORD: readonly MomentDeLAccord[] = ['oui-je-viens', 'recu'];

/** Ce que la règle lit d'une fiche. */
export type FichePourLAccord = {
  nouvelles?: { oui: boolean; le: string; par: string } | null;
  /** Quand la question a été posée sur WhatsApp (une seule fois, pour toujours). */
  nouvellesDemandeesLe?: string | null;
  archived?: boolean | null;
  segments?: readonly string[] | null;
  birthday?: string | null;
};

/** La question peut-elle suivre maintenant ? Jamais si elle a déjà répondu
    (oui, non ou STOP), jamais si elle a déjà été demandée sur WhatsApp,
    jamais pour une fiche archivée ou un enfant (l'accord se donne au
    comptoir, par le parent), jamais hors de la fenêtre de 24 heures (un
    message libre n'y passe pas). */
export function doitDemanderLAccord(
  f: FichePourLAccord,
  o: { moment: MomentDeLAccord; fenetreOuverte: boolean; estEnfant: boolean },
): { oui: true } | { oui: false; pourquoi: string } {
  if (!(MOMENTS_DE_L_ACCORD as readonly string[]).includes(o.moment)) return { oui: false, pourquoi: 'moment' };
  if (f.nouvelles) return { oui: false, pourquoi: f.nouvelles.par === 'stop' ? 'stop' : 'deja-repondu' };
  if (f.nouvellesDemandeesLe) return { oui: false, pourquoi: 'deja-demande' };
  if (f.archived) return { oui: false, pourquoi: 'archivee' };
  if (o.estEnfant || (f.segments ?? []).includes('Enfant')) return { oui: false, pourquoi: 'enfant' };
  if (!o.fenetreOuverte) return { oui: false, pourquoi: 'fenetre' };
  return { oui: true };
}

/** La réponse à un bouton : l'accord daté, de source WhatsApp, ou null. */
export function accordDuBouton(idDuBouton: string, maintenantISO: string): { oui: boolean; le: string; par: 'whatsapp' } | null {
  const le = String(maintenantISO).slice(0, 10);
  if (idDuBouton === BOUTON_ACCORD_OUI) return { oui: true, le, par: 'whatsapp' };
  if (idDuBouton === BOUTON_ACCORD_NON) return { oui: false, le, par: 'whatsapp' };
  return null;
}

/** Les genres d'envoi qui comptent dans la promesse (tout sauf un service).
    La carte d'anniversaire compte aussi : la question promet deux messages,
    pas deux nouvelles et un voeu (tranché le 2 novembre 2026). */
export const GENRES_QUI_COMPTENT = ['avant', 'envie', 'place', 'anniversaire', 'carte', 'carte-foyer', 'fetes', 'endormie', 'nouvelles', 'campagne', 'relance'] as const;

/** Combien de nouvelles lui sont parties dans les trente derniers jours. */
export function nouvellesDuMois(envois: readonly { genre?: string | null; quand?: string | null; statut?: string | null }[], maintenantMs: number): number {
  const depuis = maintenantMs - FENETRE_DU_PLAFOND_JOURS * 24 * 60 * 60_000;
  return envois.filter((e) => {
    if (!e.genre || !(GENRES_QUI_COMPTENT as readonly string[]).includes(e.genre)) return false;
    if (e.statut && /annul|ecart|refus|echec/i.test(e.statut)) return false;
    const t = Date.parse(e.quand ?? '');
    return Number.isFinite(t) && t >= depuis && t <= maintenantMs;
  }).length;
}

/** La promesse permet-elle une nouvelle de plus ? */
export const promesseTenue = (dejaCeMois: number): boolean => dejaCeMois < PLAFOND_DES_NOUVELLES_PAR_MOIS;
/* ⟨/accord-whatsapp⟩ */

/* ══ LA VOIX DU NUMÉRO, JAMAIS UNE FICHE D'ENFANT · 4 novembre 2026 ═══
   « Une fiche d'enfant ne doit jamais être la voix d'un numéro WhatsApp »
   (Yéman). Recopiés tels quels, dans cet ordre : l'âge (clients-pur), le
   prénom (foyer-pur, qui sert aussi l'alerte du téléphone), la règle du
   Trône (voix-du-numero-pur), puis ce que le serveur en fait pour un fil
   (voix-du-fil-pur). verifie-les-douze-lunes compare les textes. */
/* ⟨age-de⟩ */
/** L'âge en années révolues, ou `undefined` si la date de naissance manque. */
export function ageDe(birthday: string | undefined, aujourdhui: string): number | undefined {
  if (!birthday) return undefined;
  const n = new Date(`${birthday}T00:00:00`);
  const j = new Date(`${aujourdhui}T00:00:00`);
  if (Number.isNaN(n.getTime()) || Number.isNaN(j.getTime())) return undefined;
  let a = j.getFullYear() - n.getFullYear();
  const m = j.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && j.getDate() < n.getDate())) a -= 1;
  return a;
}

/** Est-elle mineure ? SANS DATE DE NAISSANCE, LA RÉPONSE EST NON — et c'est
    voulu : la minorité ouvre l'accès du parent à ses données, elle ne se
    présume pas. La règle échoue fermée, ce qui oblige à renseigner la date. */
export const estMineur = (client: { birthday?: string }, aujourdhui: string): boolean => {
  const a = ageDe(client.birthday, aujourdhui);
  return a !== undefined && a < 18;
};
/* ⟨/age-de⟩ */

/* ⟨prenom-de⟩ */
const CIVILITES = /^(m\.?|mr\.?|mme\.?|mlle\.?|madame|mademoiselle|monsieur|dr\.?)$/i;

/** LE PRÉNOM SEUL : jamais le nom de famille, et jamais une civilité (la
    Maison ne la suppose pas ; une civilité écrite en tête du nom se saute).
    Sans nom : une chaîne vide. TOUT LE PRÉNOM COMPOSÉ (7 novembre 2026) :
    le prénom d'usage noté sur la fiche (`usage`), sinon celui que le Trône
    devine (« Anne Marie GAYE » donne « Anne Marie »), plus le premier mot. */
export const prenomDe = (nom?: string | null, usage?: string | null): string => {
  const mots = String(nom ?? '').trim().split(/\s+/).filter(Boolean);
  while (mots.length > 1 && CIVILITES.test(mots[0])) mots.shift();
  return prenomDUsage({ name: mots.join(' '), prenomUsage: usage });
};

/** « A. et B. », « A., B. et C. » : les prénoms du foyer, dits ensemble. */
export const prenomsDits = (prenoms: readonly string[]): string => {
  const p = prenoms.filter(Boolean);
  return p.length > 1 ? `${p.slice(0, -1).join(', ')} et ${p[p.length - 1]}` : (p[0] ?? '');
};
/* ⟨/prenom-de⟩ */

/* ⟨voix-du-numero⟩ */
/** La clé de comparaison d'un numéro (229 01 97… et 229 97… sont le même). */
const cleDuNumero = (brut: string | undefined): string => {
  const d = numeroWa(brut);
  return d.length === 13 && d.startsWith('22901') ? `229${d.slice(5)}` : d;
};

/** Le nom qu'une fiche donne à l'un de ses numéros, quand c'est celui d'un parent. */
export const LIBELLE_PARENTAL = /^\s*(maman|papa|m[èe]re|p[èe]re|parents?|tuteur|tutrice)\b/i;

export type FicheParlante = {
  id: string;
  name: string;
  branchId: string;
  phone?: string;
  phone2?: string;
  phoneNom?: string;
  phone2Nom?: string;
  birthday?: string;
  familyId?: string;
  archived?: boolean;
};
export type FamillePayeuse = { id: string; payerClientId?: string };

/** LA FICHE PARLE-T-ELLE SUR CE NUMÉRO ? Non si elle est mineure, ou si elle
    nomme ce numéro comme celui d'un parent. */
export function parleSurCeNumero(f: FicheParlante, champ: 'phone' | 'phone2', aujourdhui: string): boolean {
  if (estMineur(f, aujourdhui)) return false;
  const nom = champ === 'phone' ? f.phoneNom : f.phone2Nom;
  return !LIBELLE_PARENTAL.test(nom ?? '');
}

/** SANS DATE DE NAISSANCE, SOUS UN PAYEUR : la fiche ne parle pas sur le
    numéro du parent qui règle son compte famille, ni sur aucun numéro quand
    ce parent n'en a pas. `fiches` : celles qu'on connaît (le payeur parmi
    elles, sinon on ne juge pas). */
export function muetteSousSonPayeur(
  f: FicheParlante, champ: 'phone' | 'phone2', fiches: readonly FicheParlante[],
  familles: readonly FamillePayeuse[] | undefined, aujourdhui: string,
): boolean {
  if (ageDe(f.birthday, aujourdhui) !== undefined || !f.familyId) return false;
  const payeurId = (familles ?? []).find((fa) => fa.id === f.familyId)?.payerClientId;
  if (!payeurId || payeurId === f.id) return false;
  const payeur = fiches.find((x) => x.id === payeurId && !x.archived);
  if (!payeur) return false;
  const k = cleDuNumero(f[champ]);
  const p1 = cleDuNumero(payeur.phone);
  const p2 = cleDuNumero(payeur.phone2);
  return (!p1 && !p2) || (!!k && (p1 === k || p2 === k));
}

export type VoixDuNumero =
  /** Une fiche adulte parle sur ce numéro (elle le porte, ou elle règle le compte des enfants qui le portent). */
  | { genre: 'fiche'; numero: string; fiche: FicheParlante; enfants: string[] }
  /** Personne n'a de fiche pour ce numéro : la voix porte le nom que les enfants lui donnent. */
  | { genre: 'sans-fiche'; numero: string; nom: string; branchId: string; enfants: string[] };

/** LES VOIX DES NUMÉROS QUE SEULS DES ENFANTS PORTENT (clé du numéro → voix),
    et, pour chaque fiche, les numéros sur lesquels elle parle. Un numéro porté
    par un adulte n'a pas d'entrée ici : il parle déjà par sa fiche. */
export function voixDesNumeros(o: {
  fiches: readonly FicheParlante[];
  familles?: readonly FamillePayeuse[];
  aujourdhui: string;
}): { voix: Map<string, VoixDuNumero>; parle: (f: FicheParlante, champ: 'phone' | 'phone2') => boolean } {
  const vivantes = o.fiches.filter((f) => !f.archived);
  const parle = (f: FicheParlante, champ: 'phone' | 'phone2') =>
    parleSurCeNumero(f, champ, o.aujourdhui) && !muetteSousSonPayeur(f, champ, vivantes, o.familles, o.aujourdhui);
  const adultes = new Set<string>();
  const enfants = new Map<string, { brut: string; fiche: FicheParlante; libelle?: string }[]>();
  for (const f of vivantes) {
    for (const champ of ['phone', 'phone2'] as const) {
      const brut = f[champ];
      const k = cleDuNumero(brut);
      if (!k || !brut) continue;
      if (parle(f, champ)) { adultes.add(k); continue; }
      const liste = enfants.get(k) ?? [];
      if (!liste.some((x) => x.fiche.id === f.id)) liste.push({ brut, fiche: f, libelle: champ === 'phone' ? f.phoneNom : f.phone2Nom });
      enfants.set(k, liste);
    }
  }
  const voix = new Map<string, VoixDuNumero>();
  for (const [k, liste] of enfants) {
    if (adultes.has(k)) continue;
    const ids = liste.map((x) => x.fiche.id);
    const famille = (o.familles ?? []).find((fa) => liste.some((x) => x.fiche.familyId && x.fiche.familyId === fa.id));
    const payeur = famille?.payerClientId ? vivantes.find((f) => f.id === famille.payerClientId) : undefined;
    /* Le payeur parle sur ce numéro s'il n'en a pas à lui : la mère qui règle
       le compte de ses filles écrit du téléphone que portent les filles. */
    const payeurSansNumero = !!payeur && !cleDuNumero(payeur.phone) && !cleDuNumero(payeur.phone2);
    if (payeur && payeurSansNumero && !ids.includes(payeur.id)) {
      voix.set(k, { genre: 'fiche', numero: liste[0].brut, fiche: payeur, enfants: ids });
      continue;
    }
    const libelle = (liste.find((x) => LIBELLE_PARENTAL.test(x.libelle ?? ''))?.libelle ?? '').trim();
    const qui = libelle ? `${libelle[0].toUpperCase()}${libelle.slice(1).toLowerCase()}` : 'Parent';
    const prenoms = prenomsDits([...new Set(liste.map((x) => prenomDe(x.fiche.name)).filter(Boolean))]);
    /* « Maman d'A. », « Parent de J. » : l'élision devant une voyelle. */
    const de = /^[aeiouyàâäéèêëîïôöûüh]/i.test(prenoms) ? 'd’' : 'de ';
    voix.set(k, { genre: 'sans-fiche', numero: liste[0].brut, nom: `${qui} ${de}${prenoms}`, branchId: liste[0].fiche.branchId, enfants: ids });
  }
  return { voix, parle };
}
/* ⟨/voix-du-numero⟩ */

/* ⟨voix-du-fil⟩ */
/** Une ligne de la base telle qu'on la lit : `clients` ou `families`. */
export type LigneDeLaVoix = { id: string; data?: Record<string, unknown> | null };
/** Lit des lignes par leurs identifiants ; `null` : la base ne répond pas. */
export type LecteurDeLaVoix = (table: 'clients' | 'families', ids: readonly string[]) => Promise<readonly LigneDeLaVoix[] | null>;
/** La fiche qui parle, telle qu'un message la porte et qu'on l'appelle. */
export type FicheDeLaVoix = { id: string; name: string; branchId: string; civilite?: 'madame' | 'mademoiselle' | 'monsieur'; auMasculin?: boolean };
export type VoixDuFil = {
  /** L'adulte qui porte ce numéro, sinon le parent qui règle le compte des enfants. */
  fiche?: FicheDeLaVoix;
  /** La fiche qui parle est celle du parent payeur : elle ne porte pas ce numéro. */
  payeur?: boolean;
  /** Personne n'a de fiche : le nom que la fiche des enfants lui donne (« Maman d'A. »). */
  nom?: string;
  /** Les fiches qui portent ce numéro sans y parler : les enfants. */
  muettes: string[];
};

const texteDeLaVoix = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const ficheParlanteDe = (l: LigneDeLaVoix): FicheParlante => ({
  id: String(l.id),
  name: texteDeLaVoix(l.data?.name) ?? '',
  branchId: texteDeLaVoix(l.data?.branchId) ?? '',
  phone: texteDeLaVoix(l.data?.phone),
  phone2: texteDeLaVoix(l.data?.phone2),
  phoneNom: texteDeLaVoix(l.data?.phoneNom),
  phone2Nom: texteDeLaVoix(l.data?.phone2Nom),
  birthday: texteDeLaVoix(l.data?.birthday),
  familyId: texteDeLaVoix(l.data?.familyId),
  archived: l.data?.archived === true,
});
const ficheDeLaVoix = (f: FicheParlante, l: LigneDeLaVoix | undefined): FicheDeLaVoix => {
  const c = l?.data?.civilite;
  return {
    id: f.id, name: f.name, branchId: f.branchId,
    ...(c === 'madame' || c === 'mademoiselle' || c === 'monsieur' ? { civilite: c } : {}),
    ...(l?.data?.auMasculin === true ? { auMasculin: true } : {}),
  };
};

/** QUI PARLE SUR CE NUMÉRO, pour un fil du serveur. `ids` : les fiches que la
    base rattache au numéro (celles qui le portent, et leur famille). `null` :
    la base ne répond pas, et le fil n'est rattaché à personne. */
export async function laVoixDuFil(numero: string, ids: readonly string[], lis: LecteurDeLaVoix, aujourdhui: string): Promise<VoixDuFil | null> {
  const cle = (brut: string | undefined): string => {
    const d = numeroWa(brut);
    return d.length === 13 && d.startsWith('22901') ? `229${d.slice(5)}` : d;
  };
  const k = cle(numero);
  const uniques = [...new Set(ids.filter(Boolean))];
  if (!k || uniques.length === 0) return { muettes: [] };
  const lues = await lis('clients', uniques);
  if (!lues) return null;
  const lignes = new Map(lues.map((l) => [String(l.id), l]));
  const fiches = lues.map(ficheParlanteDe).filter((f) => !f.archived);
  const porte = (f: FicheParlante, champ: 'phone' | 'phone2'): boolean => cle(f[champ]) === k;
  const portent = fiches.filter((f) => porte(f, 'phone') || porte(f, 'phone2'));
  if (portent.length === 0) return { muettes: [] };
  /* Les comptes famille de celles qui le portent, et leurs payeurs : un
     enfant SANS DATE DE NAISSANCE se juge par eux (`muetteSousSonPayeur`). */
  const foyers = [...new Set(portent.map((f) => f.familyId).filter((x): x is string => !!x))];
  const familles: FamillePayeuse[] = foyers.length === 0 ? [] : ((await lis('families', foyers)) ?? [])
    .map((l) => ({ id: String(l.id), payerClientId: texteDeLaVoix(l.data?.payerClientId) }));
  const absents = [...new Set(familles.map((f) => f.payerClientId).filter((x): x is string => !!x && !lignes.has(x)))];
  const payeurs = absents.length === 0 ? [] : ((await lis('clients', absents)) ?? []);
  for (const l of payeurs) lignes.set(String(l.id), l);
  const connues = [...fiches, ...payeurs.map(ficheParlanteDe).filter((f) => !f.archived)];
  const parleIci = (f: FicheParlante): boolean => (['phone', 'phone2'] as const)
    .some((c) => porte(f, c) && parleSurCeNumero(f, c, aujourdhui) && !muetteSousSonPayeur(f, c, connues, familles, aujourdhui));
  const muettes = portent.filter((f) => !parleIci(f)).map((f) => f.id);
  const adulte = portent.find(parleIci);
  if (adulte) return { fiche: ficheDeLaVoix(adulte, lignes.get(adulte.id)), muettes };
  /* Seuls des enfants le portent : le parent qui règle leur compte famille. */
  const { voix } = voixDesNumeros({ fiches: connues, familles, aujourdhui });
  const v = voix.get(k);
  if (v?.genre === 'fiche') return { fiche: ficheDeLaVoix(v.fiche, lignes.get(v.fiche.id)), payeur: true, muettes };
  if (v?.genre === 'sans-fiche') return { nom: v.nom, muettes };
  return { muettes };
}
/* ⟨/voix-du-fil⟩ */

/** LE LECTEUR DE LA VOIX : les lignes entières, par leurs identifiants ;
    `null` si la base ne répond pas (le message n'est alors rattaché à personne). */
function lecteurDeLaVoix(sb: SupabaseClient): LecteurDeLaVoix {
  return async (t, ids) => {
    try {
      const { data, error } = await sb.from(t).select('id, data').in('id', [...ids]);
      if (error) { dis('voix · lecture impossible', { table: t, motif: error.message.slice(0, 120) }); return null; }
      return (data ?? []) as LigneDeLaVoix[];
    } catch (e) {
      dis('voix · lecture impossible', { table: t, motif: String(e).slice(0, 120) });
      return null;
    }
  };
}

/** Ce qui signe au journal ce que l'Assistant fait sur une fiche. */
const PAR_L_ASSISTANT = 'Assistant Maison';

/** Une fiche lue avec son instant d'écriture, pour l'écrire sous verrou. */
type LigneDeFiche = { id: string; branch_id?: string | null; data: Record<string, any>; updated_at: string };

async function lisLaFiche(sb: SupabaseClient, id: string): Promise<LigneDeFiche | null> {
  const { data } = await sb.from('clients').select('id, branch_id, data, updated_at').eq('id', id).limit(1);
  return ((data ?? [])[0] as LigneDeFiche | undefined) ?? null;
}

/** LA FICHE ÉCRITE SOUS VERROU (l'instant lu, que `clients_touch` avance à
    chaque écriture) : une écriture perdue relit et rejuge, deux fois au plus.
    `change` rend la fiche d'après, ou `null` pour ne rien écrire. */
async function ecrisLaFicheSousVerrou(
  sb: SupabaseClient, id: string, change: (d: Record<string, any>) => Record<string, any> | null,
): Promise<{ ecrite: boolean; avant?: LigneDeFiche }> {
  for (let essai = 0; essai < 2; essai += 1) {
    const l = await lisLaFiche(sb, id);
    if (!l) return { ecrite: false };
    const apres = change(l.data ?? {});
    if (!apres) return { ecrite: false, avant: l };
    const { data, error } = await sb.from('clients').update({ data: apres }).eq('id', id).eq('updated_at', l.updated_at).select('id');
    if (error) { dis('fiche · écriture refusée', { motif: error.message.slice(0, 120) }); return { ecrite: false, avant: l }; }
    if ((data ?? []).length > 0) return { ecrite: true, avant: l };
  }
  return { ecrite: false };
}

/** Mineure ce jour-là, d'après sa date de naissance (AAAA-MM-JJ) ; sans date, non. */
function estMineurLe(naissance: unknown, jourIso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(naissance ?? ''));
  const j = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jourIso);
  if (!m || !j) return false;
  let age = Number(j[1]) - Number(m[1]);
  if (Number(j[2]) * 100 + Number(j[3]) < Number(m[2]) * 100 + Number(m[3])) age -= 1;
  return age < 18;
}

/** Un geste de l'Assistant sur une fiche, au journal : le fait, jamais le texte d'un message. */
async function journaliseLAccord(
  sb: SupabaseClient, g: { branchId?: string; pieceId: string; piece: string; champs: { champ: string; avant: string; apres: string }[] },
): Promise<void> {
  const id = `geste-${globalThis.crypto.randomUUID()}`;
  const geste = {
    id, ...(g.branchId ? { branchId: g.branchId } : {}), quand: new Date().toISOString(), parNom: PAR_L_ASSISTANT,
    porte: 'assistant', verbe: 'modifie', table: 'clients', ecran: 'WhatsApp de la Maison', pieceId: g.pieceId, piece: g.piece, champs: g.champs,
  };
  try { await sb.from('journal_gestes').insert({ id, branch_id: g.branchId ?? null, data: geste }); } catch { /* le journal ne fait jamais tomber le webhook */ }
}

/** LA QUESTION DE L'ACCORD, après « Oui, je viens » : une seule fois pour
    toujours. La marque `nouvellesDemandeesLe` s'écrit d'abord, sous verrou,
    dans l'écriture qui juge : seule la livraison qui l'a écrite pose la
    question, avec ses deux boutons. */
async function demandeLAccordDesNouvelles(
  sb: SupabaseClient, jeton: string, phoneId: string, o: { numero: string; clientId: string; branchId?: string },
): Promise<void> {
  const maintenant = new Date().toISOString();
  let pourquoi = 'non-ecrite';
  const r = await ecrisLaFicheSousVerrou(sb, o.clientId, (d) => {
    const juge = doitDemanderLAccord(d as FichePourLAccord, { moment: 'oui-je-viens', fenetreOuverte: true, estEnfant: estMineurLe(d.birthday, maintenant.slice(0, 10)) });
    if (!juge.oui) { pourquoi = 'pourquoi' in juge ? juge.pourquoi : 'non'; return null; }
    return { ...d, nouvellesDemandeesLe: maintenant };
  });
  if (!r.ecrite) { dis('accord · pas demandé', { pourquoi }); return; }
  await journaliseLAccord(sb, { branchId: o.branchId, pieceId: o.clientId, piece: 'Accord des nouvelles demandé sur WhatsApp', champs: [{ champ: 'Nouvelles demandées', avant: '', apres: maintenant.slice(0, 10) }] });
  await ditDepuisLeTrone(sb, jeton, phoneId, {
    numero: o.numero, branchId: o.branchId, auto: 'accord-demande', texte: QUESTION_DE_L_ACCORD,
    interactive: {
      type: 'button',
      body: { text: QUESTION_DE_L_ACCORD },
      action: { buttons: BOUTONS_DE_L_ACCORD.map((x) => ({ type: 'reply', reply: { id: x.id, title: x.titre } })) },
    },
  });
  dis('accord · demandé');
}

/** Un bouton de Perle : ceux de ses modèles, et les deux de l'accord. Ni
    l'automate ni l'alerte générique ne les prennent : ⑤ bis·4 les traite. */
const estUnBoutonDePerle = (id: string | undefined): boolean => !!lisLeBoutonDeLAssistant(id) || !!accordDuBouton(String(id ?? ''), '');
/** LES BOUTONS DE LA PAIE (6 novembre 2026) : « Oui, bien reçu » et « Pas encore »
    sous le WhatsApp que paie-mtn dépose quand MTN dit le salaire reçu. */
const RE_BOUTON_DE_LA_PAIE = /^PAIE_(RECU|PASENCORE):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const estUnBoutonDeLaPaie = (id: string | undefined): boolean => RE_BOUTON_DE_LA_PAIE.test(String(id ?? ''));
/** LES BOUTONS DE LA PROCHAINE SÉANCE (8 novembre 2026) : « Oui, je réserve » et
    « Une autre date » sous le message que le Trône dépose après une séance de
    formule. Ni l'automate ni l'alerte générique ne les prennent : ⑤ bis·5
    les traite, et prévient l'équipe lui-même quand la main passe. */
const estUnBoutonDeLaProchaineSeance = (id: string | undefined): boolean => !!lisLeBoutonDeLaProchaineSeance(id);

/** UN LECTEUR DE FICHES POUR UN APPEL : une RPC par numéro, gardée ; la
    table par pages une seule fois, si la RPC manque. Ne lève jamais : une
    lecture impossible rend « aucune fiche », le message se range quand même
    (sans fiche, comme une tête inconnue), et le journal le dit. */
function lecteurDesFiches(sb: SupabaseClient): (n: string) => Promise<FicheDuNumero[]> {
  const vus = new Map<string, Promise<FicheDuNumero[]>>();
  type LigneDeFiche = { id: string; data?: Record<string, unknown> | null };
  type FicheLue = FicheDuNumero & { premier: string };
  let parPages: Promise<FicheLue[]> | null = null;
  const toutes = (): Promise<FicheLue[]> => {
    if (parPages) return parPages;
    parPages = (async () => {
      const { data, error } = await litToutesLesPages<LigneDeFiche>((apres, taille) => {
        let page = sb.from('clients').select('id, data');
        if (apres !== null) page = page.gt('id', apres);
        return page.order('id', { ascending: true }).limit(taille) as unknown as PromiseLike<ReponseDePage<LigneDeFiche>>;
      });
      if (error) { dis('fiches · illisibles', { motif: error.message.slice(0, 120) }); return []; }
      return (data ?? [])
        .filter((r) => r.data?.archived !== true)
        .map((r) => ({
          id: String(r.id),
          nom: typeof r.data?.name === 'string' ? r.data.name : undefined,
          prenomUsage: typeof r.data?.prenomUsage === 'string' ? r.data.prenomUsage : undefined,
          civilite: typeof r.data?.civilite === 'string' ? r.data.civilite : undefined,
          auMasculin: r.data?.auMasculin === true,
          branchId: typeof r.data?.branchId === 'string' ? r.data.branchId : undefined,
          premier: numeroWa(r.data?.phone as string | undefined),
          numeros: [numeroWa(r.data?.phone as string | undefined), numeroWa(r.data?.phone2 as string | undefined)].filter(Boolean),
        }));
    })();
    return parPages;
  };
  return (n: string) => {
    if (!n) return Promise.resolve([]);
    const deja = vus.get(n);
    if (deja) return deja;
    const lu = (async (): Promise<FicheDuNumero[]> => {
      try {
        const { data, error } = await sb.rpc('fiches_du_numero', { n });
        if (!error && Array.isArray(data)) {
          return (data as Record<string, unknown>[]).map((f) => ({
            id: String(f.id ?? ''),
            nom: typeof f.nom === 'string' ? f.nom : undefined,
            prenomUsage: typeof f.prenomUsage === 'string' ? f.prenomUsage : undefined,
            civilite: typeof f.civilite === 'string' ? f.civilite : undefined,
            auMasculin: f.auMasculin === true,
            branchId: typeof f.branchId === 'string' ? f.branchId : undefined,
            numeros: Array.isArray(f.numeros) ? (f.numeros as unknown[]).map((x) => String(x ?? '')).filter(Boolean) : [],
          })).filter((f) => f.id);
        }
        dis('fiches_du_numero · absente, lecture par pages', { motif: String(error?.message ?? 'reponse illisible').slice(0, 120) });
      } catch (e) {
        dis('fiches_du_numero · echec, lecture par pages', { motif: String(e).slice(0, 120) });
      }
      /* Celles qui le portent en premier numéro d'abord, comme la RPC. */
      const cle = cleWa(n);
      const portent = (await toutes()).filter((f) => f.numeros.some((x) => cleWa(x) === cle));
      return [...portent.filter((f) => cleWa(f.premier) === cle), ...portent.filter((f) => cleWa(f.premier) !== cle)]
        .map(({ premier: _premier, ...f }) => f);
    })();
    vus.set(n, lu);
    return lu;
  };
}

Deno.serve(async (req) => {
  /* LE PREMIER MOT, AVANT TOUTE GARDE : si cette ligne ne paraît pas au
     journal, c'est que Meta n'a jamais atteint la fonction, et le reste du
     diagnostic est inutile. C'est précisément ce qu'on ne savait pas. */
  dis('appel', {
    methode: req.method,
    signature: req.headers.get('x-hub-signature-256') ? 'présente' : 'ABSENTE',
  });

  /* ── ⓪ LE CONTRÔLE DE SANTÉ — ouvre l'adresse dans un navigateur.
     Meta appelle toujours avec `hub.mode` ; un GET sans lui vient donc d'un
     humain qui cherche à comprendre. On lui dit ce qui est posé et ce qui
     manque, EN LONGUEURS SEULES : assez pour trancher, rien à voler. */
  if (req.method === 'GET' && !new URL(req.url).searchParams.get('hub.mode')) {
    const lg = (n: string) => (Deno.env.get(n) ?? '').trim().length;

    /* ══ META TRANCHE LUI-MÊME — 12 septembre 2026 ═══════════════════
       « SIGNATURE INVALIDE PAR LES DEUX CALCULS », trois fois de suite, et
       aucun moyen de savoir si le secret posé avait changé ni s'il valait
       mieux que le précédent. On tournait en rond à comparer des empreintes
       sans jamais pouvoir dire à qui le secret appartenait.

       LA RÉPONSE EST CHEZ META, ET ELLE EST GRATUITE. Un jeton
       d'application se fabrique en collant `identifiant|secret` : si le
       couple est juste, Graph répond le nom de l'app ; s'il est faux, il
       refuse. Une requête, une certitude, et plus une seule supposition.

       `?verifie=<identifiant de l'app>` — l'identifiant n'est pas un secret,
       il s'affiche dans l'URL du tableau de bord Meta. Le SECRET, lui, ne
       sort jamais d'ici : on n'en rend que le verdict et le nom de l'app. */
    /* ══ QUEL NUMÉRO LE TRÔNE SERT-IL VRAIMENT ? — 12 septembre 2026 ══
       Le faux message de Meta arrive, les vrais non. Toute la chaîne est donc
       prouvée, et il ne reste qu'une hypothèse : le numéro branché sur l'API
       n'est pas celui qu'on teste. C'est le piège classique du Cloud API —
       Meta prête un numéro d'essai au début, il envoie très bien vers cinq
       destinataires autorisés, et il ne reçoit jamais rien pour le vrai
       numéro de la Maison.

       `WA_PHONE_ID` sait qui il est ; il suffit de le lui demander. Une
       requête, et l'on saura si l'on teste la bonne ligne. */
    /* ══ L'ÉTAT COMPLET DU COMPTE — 12 septembre 2026 ═══════════════
       Le faux message de Meta traverse toute la chaîne ; les vrais ne
       provoquent AUCUN appel. Ma fonction écrit son premier mot avant toute
       garde : si cette ligne manque, Meta ne nous a pas appelés. Le défaut
       n'est donc pas dans le Trône, et trois hypothèses successives se sont
       révélées fausses.

       ON CESSE DE DEVINER. Meta sait dans quel état est ce compte et ses
       numéros : le statut de connexion, la vérification du code, le débit
       autorisé, la qualité. Aucun de ces champs n'apparaît dans les écrans
       du tableau de bord, et l'un d'eux dira pourquoi l'entrée est muette.

       `?numeros=<identifiant du compte WhatsApp>`. */
    const leCompte = new URL(req.url).searchParams.get('numeros');
    if (leCompte) {
      const jeton = (Deno.env.get('WA_TOKEN') ?? '').trim();
      if (!jeton) {
        return new Response(JSON.stringify({ verdict: 'WA_TOKEN manque' }, null, 2),
          { status: 200, headers: { 'content-type': 'application/json' } });
      }
      try {
        const champs = 'id,display_phone_number,verified_name,status,code_verification_status,'
          + 'quality_rating,platform_type,throughput,name_status,messaging_limit_tier';
        const r = await fetch(
          `https://graph.facebook.com/v20.0/${encodeURIComponent(leCompte)}/phone_numbers?fields=${champs}`,
          { headers: { authorization: `Bearer ${jeton}` }, signal: AbortSignal.timeout(DELAI_DE_META_MS) },
        );
        const rep = await r.json().catch(() => ({}));
        const branche = (Deno.env.get('WA_PHONE_ID') ?? '').trim();
        return new Response(JSON.stringify(
          r.ok
            ? {
              compte: leCompte,
              numeroBrancheSurLeTrone: branche,
              numeros: (rep.data ?? []).map((n: Record<string, unknown>) => ({
                ...n,
                estCeluiDuTrone: String(n.id) === branche,
              })),
              aLire: 'status doit valoir CONNECTED et code_verification_status VERIFIED. '
                + 'Tout autre valeur explique une entrée muette.',
            }
            : { verdict: 'Meta refuse', refusDeMeta: String(rep?.error?.message ?? `HTTP ${r.status}`) },
          null, 2), { status: 200, headers: { 'content-type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ verdict: 'Meta injoignable', detail: String(e) }, null, 2),
          { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }

    if (new URL(req.url).searchParams.get('numero')) {
      const jeton = (Deno.env.get('WA_TOKEN') ?? '').trim();
      const phoneId = (Deno.env.get('WA_PHONE_ID') ?? '').trim();
      if (!jeton || !phoneId) {
        return new Response(JSON.stringify({ verdict: 'WA_TOKEN ou WA_PHONE_ID manque' }, null, 2),
          { status: 200, headers: { 'content-type': 'application/json' } });
      }
      try {
        const r = await fetch(
          `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}`
          + '?fields=display_phone_number,verified_name,quality_rating,platform_type,code_verification_status',
          { headers: { authorization: `Bearer ${jeton}` }, signal: AbortSignal.timeout(DELAI_DE_META_MS) },
        );
        const rep = await r.json().catch(() => ({}));
        return new Response(JSON.stringify(
          r.ok && rep?.display_phone_number
            ? {
              verdict: 'LE TRÔNE EST BRANCHÉ SUR CE NUMÉRO',
              numero: rep.display_phone_number,
              nomAffiche: rep.verified_name,
              qualite: rep.quality_rating,
              plateforme: rep.platform_type,
              suite: 'Si ce n’est pas le numéro que vous testez, c’est toute l’explication : '
                + 'écrivez à CELUI-CI, ou rebranchez WA_PHONE_ID sur le bon.',
            }
            : { verdict: 'Meta refuse de nommer ce numéro', refusDeMeta: String(rep?.error?.message ?? `HTTP ${r.status}`) },
          null, 2), { status: 200, headers: { 'content-type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ verdict: 'Meta injoignable', detail: String(e) }, null, 2),
          { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }

    /* ══ LES APPELS SONT-ILS OUVERTS SUR NOTRE NUMERO ? ════════════════
       « N'oublie pas que je dois recevoir les appels WhatsApp » (Yeman,
       14 septembre 2026).

       Meta a ouvert une API d'appels vocaux aux entreprises, mais elle n'est
       pas active partout ni sur tous les numeros, et la disponibilite varie
       par pays. Tout le chantier depend de cette reponse-la : inutile
       d'ecrire une ligne d'audio avant de la connaitre.

       Plutot que d'envoyer quelqu'un fouiller une console, on demande a Meta.
       Cette sonde n'envoie rien, ne change rien, et ne montre aucun secret.

       `?appels=1` — le numero est celui deja pose dans WA_PHONE_ID. */
    if (new URL(req.url).searchParams.has('appels')) {
      const phone = Deno.env.get('WA_PHONE_ID');
      const tok = Deno.env.get('WA_TOKEN');
      if (!phone || !tok) {
        return new Response(JSON.stringify({
          verdict: 'les cles Meta ne sont pas posees sur cette fonction',
        }, null, 2), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      const rapport: Record<string, unknown> = {};
      /* ① CE QUE LE NUMERO DIT DE LUI-MEME. `platform_type` distingue un vrai
         numero CLOUD_API d'un numero de test, et le nom verifie confirme que
         l'on interroge bien celui de la Maison. */
      try {
        const r = await fetch(
          `https://graph.facebook.com/v20.0/${phone}?fields=display_phone_number,verified_name,platform_type,code_verification_status`,
          { headers: { authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(DELAI_DE_META_MS) },
        );
        const rep = await r.json().catch(() => ({}));
        rapport.leNumero = r.ok
          ? {
            finDuNumero: String(rep.display_phone_number ?? '').slice(-4),
            nom: rep.verified_name,
            genre: rep.platform_type,
            verification: rep.code_verification_status,
          }
          : { refusDeMeta: String(rep?.error?.message ?? `HTTP ${r.status}`) };
      } catch (e) {
        rapport.leNumero = { erreur: String(e).slice(0, 200) };
      }
      /* ② LES REGLAGES D'APPEL. Si Meta ne connait pas ce champ, c'est que
         l'API d'appels n'est pas ouverte pour ce numero — et c'est la
         reponse, meme si elle arrive sous forme de refus. */
      try {
        const r = await fetch(
          `https://graph.facebook.com/v20.0/${phone}/settings?include_fields=calling`,
          { headers: { authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(DELAI_DE_META_MS) },
        );
        const rep = await r.json().catch(() => ({}));
        rapport.lesAppels = r.ok
          ? { reglages: rep?.calling ?? rep, aLire: 'status ENABLED = les appels sont ouverts' }
          : {
            refusDeMeta: String(rep?.error?.message ?? `HTTP ${r.status}`),
            aLire: 'un refus ici veut presque toujours dire que l API d appels '
              + 'n est pas ouverte pour ce numero, ou pas dans ce pays',
          };
      } catch (e) {
        rapport.lesAppels = { erreur: String(e).slice(0, 200) };
      }
      rapport.etEnsuite = 'Si les appels sont ouverts, il reste a abonner le webhook '
        + 'au champ « calls » et a porter l audio dans le navigateur. Si Meta refuse, '
        + 'le chantier s arrete ici et « Les Appels » reste le carnet qu on remplit a la main.';
      return new Response(JSON.stringify(rapport, null, 2), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }

    const aVerifier = new URL(req.url).searchParams.get('verifie');
    if (aVerifier) {
      const secret = (Deno.env.get('WA_APP_SECRET') ?? '').trim();
      if (!secret) {
        return new Response(JSON.stringify({ verdict: 'WA_APP_SECRET n’est pas posé' }, null, 2),
          { status: 200, headers: { 'content-type': 'application/json' } });
      }
      try {
        const r = await fetch(
          `https://graph.facebook.com/v20.0/${encodeURIComponent(aVerifier)}`
          + `?fields=name,id&access_token=${encodeURIComponent(`${aVerifier}|${secret}`)}`,
          { signal: AbortSignal.timeout(DELAI_DE_META_MS) },
        );
        const rep = await r.json().catch(() => ({}));
        return new Response(JSON.stringify(
          r.ok && rep?.id
            ? {
              verdict: 'LE SECRET EST BIEN CELUI DE CETTE APPLICATION',
              application: rep.name,
              identifiant: rep.id,
              suite: 'Si les signatures échouent malgré cela, la cause est ailleurs : dites-le-moi.',
            }
            : {
              verdict: 'LE SECRET N’APPARTIENT PAS À CETTE APPLICATION',
              refusDeMeta: String(rep?.error?.message ?? `HTTP ${r.status}`),
              suite: 'Reprenez l’App Secret dans App settings > Basic de CETTE app-là.',
            },
          null, 2), { status: 200, headers: { 'content-type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ verdict: 'Meta injoignable', detail: String(e) }, null, 2),
          { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({
      fonction: 'whatsapp-webhook',
      version: VERSION,
      secrets: {
        WA_VERIFY_TOKEN: lg('WA_VERIFY_TOKEN') || 'ABSENT',
        WA_APP_SECRET: lg('WA_APP_SECRET') || 'ABSENT',
        CLE_SERVICE: lg('CLE_SERVICE') || 'ABSENT',
        SUPABASE_URL: lg('SUPABASE_URL') || 'ABSENT',
        WA_TOKEN: lg('WA_TOKEN') || 'ABSENT — les pièces reçues ne seront pas gardées',
        WA_PHONE_ID: lg('WA_PHONE_ID') || 'ABSENT',
        WA_FLOW_CONGE: lg('WA_FLOW_CONGE') || 'ABSENT — le formulaire de congé ne partira pas',
      },
      /* Si vous lisez ceci dans un navigateur SANS être connecté, c'est que
         « Verify JWT » est bien décoché. C'est la preuve qu'on cherchait. */
      jwt: 'décoché, sinon vous ne liriez pas ceci',
      /* LA TÂCHE DE FOND (9 octobre 2026) : jamais éprouvée dans ce dépôt
         avant la réponse automatique. `true` : le webhook répond à Meta sans
         attendre l'automate. `false` : il l'attend, 8 s au plus. */
      tacheDeFond: tacheDeFond() !== null,
      automate: 'whatsapp-automate, confié des messages neufs ; il juge seul qui il sert (réglage automateWa)',
      pourVerifierLeSecret: 'ajoutez ?verifie=<identifiant de votre app Meta> à cette adresse',
      pourSavoirQuelNumero: 'ajoutez ?numero=1 à cette adresse',
      pourVoirTousLesNumeros: 'ajoutez ?numeros=<identifiant du compte WhatsApp> à cette adresse',
      pourSavoirSiLesAppelsSontOuverts: 'ajoutez ?appels=1 à cette adresse',
    }, null, 2), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  /* ── ① LA POIGNÉE DE MAIN — Meta vérifie que l'adresse nous appartient.
     Elle n'arrive qu'une fois, au branchement, mais sans elle rien ne se
     configure et l'on cherche pendant une heure. */
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const attendu = (Deno.env.get('WA_VERIFY_TOKEN') ?? '').trim();
    const recu = (url.searchParams.get('hub.verify_token') ?? '').trim();
    const defi = url.searchParams.get('hub.challenge') ?? '';
    if (attendu && url.searchParams.get('hub.mode') === 'subscribe' && recu === attendu && defi) {
      return new Response(defi, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    /* LES LONGUEURS SEULES, JAMAIS LES VALEURS — assez pour situer la panne
       (0 = secret non posé), rien pour l'attaquant. */
    return new Response(
      JSON.stringify({ erreur: 'jeton refusé', attendueLg: attendu.length, recueLg: recu.length }),
      { status: 403 },
    );
  }

  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  /* ── ② LA SERRURE. Un refus répond « ok » quand même : une erreur ferait
     retenter Meta pendant des heures et renseignerait un attaquant sur sa
     cible. Même règle que `kkiapay-webhook`. */
  /* LES OCTETS D'ABORD, le texte ensuite : l'empreinte se calcule sur ce qui
     est arrivé, pas sur ce qu'on en a compris. */
  const octets = new Uint8Array(await req.arrayBuffer());
  const brut = new TextDecoder().decode(octets);
  const secret = (Deno.env.get('WA_APP_SECRET') ?? '').trim();
  const entete = req.headers.get('x-hub-signature-256') ?? '';
  if (!secret) {
    /* DEUX REFUS QUI SE RESSEMBLAIENT. « Signature refusée » ne disait pas
       si le secret manquait ou si l'empreinte était fausse : deux causes,
       deux remèdes, et un seul message pour les deux. */
    console.error('whatsapp-webhook · REFUS · WA_APP_SECRET n’est pas posé');
    return new Response('ok', { status: 200 });
  }
  const recue = entete.replace(/^sha256=/i, '').trim().toLowerCase();
  /* DEUX CALCULS POUR SÉPARER DEUX CAUSES. Si l'empreinte des OCTETS tombe
     juste et pas celle du TEXTE, c'était l'encodage — le défaut d'hier soir.
     Si aucune des deux ne tombe, le secret n'est pas le bon, et aucun code
     ne réparera cela : il faut le reprendre chez Meta. Sans cette distinction
     on chercherait des jours dans le mauvais endroit. */
  const parOctets = await empreinte(octets, secret);
  const parTexte = await empreinte(new TextEncoder().encode(brut), secret);
  const okOctets = memeEmpreinte(parOctets, recue);
  const okTexte = memeEmpreinte(parTexte, recue);
  if (!okOctets && !okTexte) {
    console.error(
      'whatsapp-webhook · REFUS · SIGNATURE INVALIDE PAR LES DEUX CALCULS. '
      + 'Ce n’est donc pas un problème d’encodage : le WA_APP_SECRET posé ne '
      + 'correspond pas à l’application qui envoie. Reprenez-le dans Meta, '
      + `App settings > Basic > App Secret, de l’app qui porte le webhook. secretLg=${secret.length} corpsLg=${octets.length}`,
    );
    return new Response('ok', { status: 200 });
  }
  dis('signature acceptée', { par: okOctets ? 'octets' : 'texte', corpsLg: octets.length });

  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';
  if (!service || !urlBase) {
    console.error('whatsapp-webhook: CLE_SERVICE ou SUPABASE_URL manque');
    return new Response('ok', { status: 200 });
  }
  const sb = createClient(urlBase, service);
  /* Les tours confiés à l'automate quand la tâche de fond manque : on les
     attend juste avant de répondre, 8 s au plus (voir ⑤ quinquies). */
  const automateEnCours: Promise<void>[] = [];
  /* Les clés Meta servent à aller chercher les pièces et à envoyer les deux
     messages automatiques. Absentes, l'oreille entend quand même — elle ne
     garde pas les pièces, et le dit au contrôle de santé. */
  const jetonMeta = (Deno.env.get('WA_TOKEN') ?? '').trim();
  const phoneIdMeta = (Deno.env.get('WA_PHONE_ID') ?? '').trim();
  const flowConge = (Deno.env.get('WA_FLOW_CONGE') ?? '').trim();

  let charge: Record<string, any> = {};
  try { charge = JSON.parse(brut); } catch { return new Response('ok', { status: 200 }); }

  /* ── ③ CE QUE L'APPEL PORTE ─────────────────────────────────────── */
  type Entrant = {
    waId: string; numero: string; texte: string; type: string; quand: string;
    nomProfil?: string; numeroMaison?: string;
    /** L identifiant du message qu elle cite, quand elle repond a l un des
      notres ou des siens. Voir le commentaire long a la lecture. */
    citeWaId?: string;
    bouton?: Lecture['bouton'];
    formulaire?: Lecture['formulaire'];
    media?: Lecture['media'];
  };
  const entrants: Entrant[] = [];
  const accuses: { waId: string; etat: string; detail?: string; numero: string }[] = [];
  /* LES REACTIONS QU ELLE POSE. Elles ne font pas de ligne dans le fil :
     elles se posent sur le message qu elles visent. */
  const reactions: { surWaId: string; emoji: string; quand: string }[] = [];
  /* ══ LES APPELS — 14 septembre 2026 ════════════════════════════════
     « N oublie pas que je dois recevoir les appels WhatsApp » (Yeman).

     META NOMME LES ETAPES A SA FACON, et l API d appels est jeune : les noms
     de champs peuvent bouger. On lit donc LARGEMENT — plusieurs noms
     possibles pour la meme chose — et l on JOURNALISE la charge brute quand
     on ne reconnait rien. Un evenement qu on ne sait pas lire doit laisser
     une trace lisible, sinon on le cherchera a l aveugle.

     UN VERDICT INCONNU NE DEVIENT JAMAIS « PRIS » : mieux vaut une Maison qui
     doute qu une Maison qui croit avoir repondu. */
  const appels: {
    callId: string; numero: string; etat: string; quand: string;
    sens: 'entrant' | 'sortant'; dureeS?: number; detail?: string;
  }[] = [];

  for (const entree of charge.entry ?? []) {
    for (const ch of entree.changes ?? []) {
      const v = ch.value ?? {};
      /* PAR QUEL NUMÉRO DE LA MAISON. Meta le donne à chaque appel, et il ne
         se retrouverait jamais après coup : on le garde AVANT même que la
         Maison ait une seconde ligne, pour que l'historique sache déjà de
         laquelle il vient le jour où elle en branchera une. */
      const numeroMaison = String(v.metadata?.phone_number_id ?? '');
      const profils = new Map<string, string>();
      for (const c of v.contacts ?? []) {
        if (c?.wa_id && c?.profile?.name) profils.set(String(c.wa_id), String(c.profile.name));
      }
      for (const m of v.messages ?? []) {
        if (!m?.id || !m?.from) continue;
        const de = numeroWa(String(m.from));

        /* ══ UNE REACTION N EST PAS UN MESSAGE — 14 septembre 2026 ═══
           Meta l annonce comme un message de type `reaction`, mais elle ne
           dit rien par elle-meme : elle se pose SUR un autre message. La
           ranger dans le fil y mettrait des lignes vides, et la cliente
           passerait pour avoir ecrit sans rien dire.

           UN EMOJI VIDE VEUT DIRE QU ELLE L A RETIREE : c est ainsi que Meta
           l annonce, et l on retire la sienne plutot que d en poser une
           invisible. */
        if (String(m.type ?? '') === 'reaction' && m.reaction?.message_id) {
          reactions.push({
            surWaId: String(m.reaction.message_id),
            emoji: String(m.reaction.emoji ?? ''),
            quand: new Date(Number(m.timestamp ?? 0) * 1000 || Date.now()).toISOString(),
          });
          continue;
        }

        const lu = lectureDuMessage(m);
        entrants.push({
          waId: String(m.id),
          numeroMaison,
          numero: de,
          texte: lu.texte,
          type: String(m.type ?? 'text'),
          /* Meta date en SECONDES ; le Trône lit des ISO. */
          quand: new Date(Number(m.timestamp ?? 0) * 1000 || Date.now()).toISOString(),
          nomProfil: profils.get(String(m.from)),
          /* ══ CE QU ELLE CITE — perdu jusqu au 14 septembre ═══════════
             Meta nomme cela un « contexte » : l identifiant du message
             auquel elle repond. Il etait la depuis le premier jour et
             personne ne le lisait, si bien qu une reponse a la troisieme
             question sur quatre arrivait sans qu on sache laquelle.

             ON NE GARDE QUE L IDENTIFIANT ICI : le texte du message cite se
             retrouve dans le fil, qui l a deja. Le recopier le figerait, et
             un message reecrit ferait mentir sa propre citation. */
          citeWaId: m.context?.id ? String(m.context.id) : undefined,
          bouton: lu.bouton,
          formulaire: lu.formulaire,
          media: lu.media,
        });
      }
      /* LE CHAMP `calls` — Meta l envoie quand une cliente appelle, puis a
         chaque etape. Le meme identifiant revient a chaque fois : c est lui
         qui relie « ca sonne » a « c est fini ». */
      for (const c of v.calls ?? []) {
        const callId = String(c?.id ?? '');
        if (!callId) continue;
        const brutEtat = String(c?.event ?? c?.status ?? '').toLowerCase();
        const etat = ETAT_APPEL[brutEtat] ?? '';
        if (!etat) {
          /* ON NE DEVINE PAS. On garde ce que Meta a dit, pour pouvoir le
             lire demain dans les journaux plutot que de chercher a l aveugle. */
          dis('appel · verdict inconnu', { callId, brutEtat, charge: c });
          continue;
        }
        const quandS = Number(c?.timestamp ?? 0);
        appels.push({
          callId,
          numero: numeroWa(String(c?.from ?? '')),
          etat,
          quand: new Date(quandS ? quandS * 1000 : Date.now()).toISOString(),
          /* UNE CLIENTE QUI APPELLE est un appel ENTRANT ; la Maison qui
             appelle est sortant. Meta le dit par `direction`, et sans lui on
             se fie a qui est l emetteur. */
          sens: String(c?.direction ?? '').toUpperCase().startsWith('BUSINESS')
            ? 'sortant' : 'entrant',
          dureeS: Number.isFinite(Number(c?.duration)) ? Number(c.duration) : undefined,
          detail: c?.error?.message ? String(c.error.message).slice(0, 200) : undefined,
        });
      }

      for (const st of v.statuses ?? []) {
        if (!st?.id || !st?.status) continue;
        const etat = ETAT[String(st.status)];
        if (!etat) continue;
        const err = (st.errors ?? [])[0];
        accuses.push({
          waId: String(st.id),
          etat,
          detail: err ? String(err.title ?? err.message ?? err.code ?? '').slice(0, 300) : undefined,
          numero: numeroWa(String(st.recipient_id ?? '')),
        });
      }
    }
  }

  /* CE QUE L'APPEL PORTAIT VRAIMENT. C'est LA ligne qui manquait : un appel
     à zéro message et zéro accusé veut dire que Meta nous parle d'autre
     chose, et ce n'est pas du tout la même panne qu'un appel jamais venu. */
  dis('charge lue', {
    appels: appels.length,
    entrees: (charge.entry ?? []).length,
    champs: (charge.entry ?? []).flatMap((e: Record<string, any>) => e.changes ?? [])
      .map((c: Record<string, any>) => c.field ?? '?'),
    messages: entrants.length,
    accuses: accuses.length,
    pieces: entrants.filter((e) => e.media).length,
    boutons: entrants.filter((e) => e.bouton?.id).length,
    formulaires: entrants.filter((e) => e.formulaire).length,
  });

  /* ── ④ LES FICHES, POUR RATTACHER — par numéro, 9 octobre 2026.
     Jusqu'à ce jour, une seule lecture de toute la table, puis un `find` en
     mémoire : « le jour où elles seront dix mille, il faudra un index sur le
     numéro », disait ce commentaire. Le jour est venu plus tôt, à MILLE :
     Supabase ne rend jamais plus de mille lignes, et une cliente connue
     passait pour inconnue. `fiches_du_numero` (0125) lit par index, en une
     valeur, les fiches de CE numéro (voir `lecteurDesFiches`). Le nom sert à
     la notification du téléphone : elle en dit le prénom. La civilité, à la
     reprise : « C'est noté, Madame Naffi ». */
  const fichesDe = lecteurDesFiches(sb);
  const fichesParNumero = new Map<string, FicheDuNumero[]>();
  for (const n of new Set(entrants.map((e) => e.numero))) fichesParNumero.set(n, await fichesDe(n));
  const fiches: FicheDuNumero[] = [...fichesParNumero.values()].flat();

  /* ── ④ ter LA VOIX DU NUMÉRO, JAMAIS UNE FICHE D'ENFANT — 4 novembre 2026
     « Une fiche d'enfant ne doit jamais être la voix d'un numéro » (Yéman).
     La mère écrit du numéro que portent ses deux filles : son message se
     rangeait sur la première fiche qui le porte, une enfant. La voix est
     l'adulte qui porte le numéro, sinon le parent qui règle le compte
     famille des enfants, sinon personne (⟨voix-du-fil⟩). Les rendez-vous
     des enfants restent les leurs ; la branche, celle de leurs fiches. */
  const aujourdhuiACotonou = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const lisLaVoix = lecteurDeLaVoix(sb);
  const voixDe = async (n: string): Promise<VoixDuFil | null> =>
    laVoixDuFil(n, (await fichesDe(n)).map((f) => f.id), lisLaVoix, aujourdhuiACotonou);
  const voixParNumero = new Map<string, VoixDuFil | null>();
  for (const n of fichesParNumero.keys()) voixParNumero.set(n, await voixDe(n));
  const teteDuNumero = (n: string): { id: string; nom: string; branchId?: string } | undefined => {
    const f = voixParNumero.get(n)?.fiche;
    return f ? { id: f.id, nom: f.name, ...(f.branchId ? { branchId: f.branchId } : {}) } : undefined;
  };
  const brancheDuNumero = (n: string): string | undefined =>
    teteDuNumero(n)?.branchId ?? (fichesParNumero.get(n) ?? []).find((f) => f.branchId)?.branchId;

  /* ── ④ bis QUI ÉCRIT, SELON LA BASE — 15 septembre 2026 ─────────────
     `tete_du_numero` (0102) est le seul juge : l'équipe d'abord, puis les
     prestataires, puis les fournisseurs. On lui demande une fois par numéro. */
  type Tete = { tiroir: string; staffId?: string; prestataireId?: string; fournisseurId?: string; branchId?: string };
  const tetes = new Map<string, Tete>();
  for (const n of new Set(entrants.map((e) => e.numero))) {
    const { data, error } = await sb.rpc('tete_du_numero', { n });
    if (error) { dis('tete_du_numero · refus', { motif: error.message.slice(0, 120) }); continue; }
    tetes.set(n, (data ?? { tiroir: 'clientes' }) as Tete);
  }
  const tiroirDe = (n: string) => tetes.get(n)?.tiroir ?? 'clientes';

  /* ── ④ ter LES PIÈCES, RANGÉES — 15 septembre 2026 ──────────────────
     Une pièce se dépose AVANT d'écrire la ligne : elle ne s'écrit qu'une
     fois, complète. Pour un prestataire qui n'a qu'un dossier ouvert, elle
     va dans le coffre de ce dossier, comme un devis « à saisir » ; sinon dans
     le compartiment `whatsapp`, « à ranger » par la direction. */
  type PieceRangee = {
    nom: string; type: string; octets?: number; chemin?: string; coffre?: string; mediaId: string; tropLourde?: boolean;
  };
  const pieces = new Map<string, PieceRangee>();
  const rangeDans = new Map<string, string>();
  const aujourdhui = new Date().toISOString().slice(0, 10);

  /** LE SEUL DOSSIER OUVERT d'un fournisseur, ou rien. Un dossier est
      ouvert tant qu'il n'est ni abandonné ni soldé — même lecture que
      `etatDuDossier` (shared/engagements.ts), refaite ici en cinq lignes
      parce qu'une fonction Edge n'importe rien du dépôt. */
  const dossierUnique = async (fournisseurId: string): Promise<{ id: string; branchId?: string } | null> => {
    const { data: dossiers } = await sb.from('engagements').select('id, branch_id, data')
      .eq('data->>fournisseurId', fournisseurId);
    const vivants = (dossiers ?? []).filter((d: any) => !d.data?.abandonneLe);
    if (vivants.length === 0) return null;
    const ids = vivants.map((d: any) => d.id as string);
    const [{ data: devis }, { data: versements }] = await Promise.all([
      sb.from('devis_recus').select('data').in('data->>engagementId', ids),
      sb.from('versements_engagement').select('data').in('data->>engagementId', ids),
    ]);
    const ouverts = vivants.filter((d: any) => {
      const retenu = (devis ?? []).filter((x: any) => x.data?.engagementId === d.id && x.data?.etat === 'retenu')
        .reduce((s: number, x: any) => s + Math.max(0, Number(x.data?.montantXof ?? 0)), 0);
      const verse = (versements ?? []).filter((x: any) => x.data?.engagementId === d.id && x.data?.verseLe)
        .reduce((s: number, x: any) => s + Math.max(0, Number(x.data?.montantXof ?? 0)), 0);
      return !(retenu > 0 && verse >= retenu);
    });
    return ouverts.length === 1 ? { id: ouverts[0].id, branchId: ouverts[0].branch_id ?? undefined } : null;
  };

  for (const e of entrants) {
    if (!e.media) continue;
    const base: PieceRangee = { nom: e.media.nom, type: e.media.mime, mediaId: e.media.id };
    if (!jetonMeta) { pieces.set(e.waId, base); continue; }
    const lu = await telechargeChezMeta(e.media.id, jetonMeta);
    if (!lu) { pieces.set(e.waId, base); continue; }
    if (lu.tropLourde) { pieces.set(e.waId, { ...base, tropLourde: true }); continue; }
    const type = lu.mime || e.media.mime;
    const nom = e.media.nom;
    const cle = cleCourte(e.waId);

    let coffre = 'whatsapp';
    let chemin = `${e.numero}/${cle}-${nomPropre(nom)}`;
    const tete = tetes.get(e.numero);
    let dossier: { id: string; branchId?: string } | null = null;
    if (tete?.tiroir === 'prestataires' && tete.fournisseurId) {
      dossier = await dossierUnique(tete.fournisseurId);
      if (dossier) {
        const branche = dossier.branchId ?? tete.branchId ?? 'sans-branche';
        coffre = 'engagements';
        chemin = `${branche}/pieces/${dossier.id}/${cle}-${nomPropre(nom)}`;
      }
    }
    const { error } = await sb.storage.from(coffre).upload(chemin, lu.octets, { contentType: type, upsert: true });
    if (error) {
      dis('pièce · dépôt refusé', { coffre, motif: error.message.slice(0, 120) });
      pieces.set(e.waId, base);
      continue;
    }
    pieces.set(e.waId, { nom, type, octets: lu.octets.length, chemin, coffre, mediaId: e.media.id });
    dis('pièce rangée', { coffre, genre: e.media.genre, octets: lu.octets.length, dansUnDossier: !!dossier });

    /* LE DEVIS ENTRE AU DOSSIER, VIDE DE CHIFFRES : la direction les tape en
       le lisant. La garde de 0099 le laisse « reçu », comme toute saisie du
       comptoir. Un même message n'en fait jamais deux (identifiant dérivé). */
    if (dossier) {
      const id = `dvr-wa-${cle}`;
      const { error: errDevis } = await sb.from('devis_recus').upsert({
        id, branch_id: dossier.branchId ?? tete?.branchId ?? null,
        data: {
          id, branchId: dossier.branchId ?? tete?.branchId, engagementId: dossier.id,
          recuLe: aujourdhui, montantXof: 0, etat: 'recu',
          description: `Reçu par WhatsApp, à saisir${e.texte && e.texte !== NOMS[e.type] ? ` · ${e.texte.slice(0, 200)}` : ''}`,
          fichier: { chemin, nom, type, taille: lu.octets.length },
          recuParWhatsApp: { waId: e.waId, quand: e.quand },
        },
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (errDevis) dis('devis · écriture refusée', { motif: errDevis.message.slice(0, 120) });
      else rangeDans.set(e.waId, dossier.id);
    }
  }

  /* ── ⑤ ON RANGE. Identifiant DÉTERMINISTE `wa-<id Meta>` : Meta rappelle
     volontiers deux fois le même message, il ne s'écrira qu'une.

     ET IL NE S'ÉCRASE PAS : une seconde livraison du même message ne doit
     pas effacer l'accusé, la réaction ou la lecture posés entre-temps.
     `ignoreDuplicates` laisse la première ligne tranquille. */
  /* LES GESTES NE SE REJOUENT PAS · 10 octobre 2026. Revue de code : les
     boutons (RECU, REPRISE_OK, REPRISE_AUTRE), le formulaire de congé et
     les deux messages qui partent seuls parcouraient TOUS les entrants,
     relivraisons comprises. Une relivraison tardive de « Un autre moment »
     effaçait un « Je confirme » touché depuis. Ils ne jouent plus que les
     messages NEUFS, comme l'automate. Si l'écriture elle-même échoue, on ne
     sait pas lesquels le sont : on les joue tous, comme avant, plutôt que
     de perdre un geste que Meta ne relivrera pas (il a reçu son 200). */
  let neufs: Set<string> | null = null;
  const estNeuf = (e: Entrant): boolean => neufs === null || neufs.has(`wa-${e.waId}`);
  if (entrants.length > 0) {
    const lignes = entrants.map((e) => {
      const tete = teteDuNumero(e.numero);
      const branche = brancheDuNumero(e.numero);
      const laTete = tetes.get(e.numero);
      const piece = pieces.get(e.waId);
      return {
        id: `wa-${e.waId}`,
        branch_id: branche ?? laTete?.branchId ?? null,
        data: {
          id: `wa-${e.waId}`, waId: e.waId, branchId: branche ?? laTete?.branchId,
          sens: 'entrant', numero: e.numero, clientId: tete?.id,
          nomProfil: e.nomProfil, texte: e.texte, type: e.type, quand: e.quand,
          numeroMaison: e.numeroMaison || undefined,
          /* CE QU ELLE CITE — l identifiant seul ; le fil a deja le texte. */
          citeWaId: e.citeWaId,
          ...(piece ? { piece } : {}),
          ...(e.bouton ? { bouton: e.bouton } : {}),
          ...(e.formulaire ? { formulaire: e.formulaire } : {}),
          ...(rangeDans.has(e.waId) ? { rangeDans: rangeDans.get(e.waId) } : {}),
        },
      };
    });
    /* `.select('id')` rend les SEULES lignes vraiment ecrites : avec
       ignoreDuplicates, une seconde livraison du meme message ne revient pas.
       C est ce qui empeche la notification de sonner deux fois. */
    const { data: ecrits, error } = await sb.from('messages_wa')
      .upsert(lignes, { onConflict: 'id', ignoreDuplicates: true }).select('id');
    if (error) console.error(`whatsapp-webhook · ÉCHEC ÉCRITURE · ${error.message}`);
    else {
      dis('messages rangés', {
        combien: lignes.length,
        rattaches: lignes.filter((l) => l.data.clientId).length,
        tiroirs: entrants.map((e) => tiroirDe(e.numero)),
      });
      /* ── ⑤ quater LA NOTIFICATION SUR LE TELEPHONE — 18 septembre 2026 ── */
      neufs = new Set(((ecrits ?? []) as { id: string }[]).map((r) => r.id));
      const nomDe = (e: Entrant): string => teteDuNumero(e.numero)?.nom ?? e.nomProfil ?? `+${e.numero}`;

      /* ── ⑤ quinquies LA MAISON RÉPOND ET RÉSERVE — 9 octobre 2026 ──────
         Les seuls messages NEUFS, regroupés par numéro, des tiroirs Clientes
         et Équipe (un numéro de l'équipe n'est servi que s'il est inscrit en
         essai par la direction : l'automate en juge). Jamais un prestataire,
         jamais un numéro dont la base n'a pas dit le tiroir : au moindre
         doute, la Maison répond elle-même. Ces numéros-là ne sonnent pas
         ici : l'automate dit ce qui doit sonner (`confieALAutomate`). */
      const confies = new Map<string, Confie>();
      for (const e of entrants) {
        if (!neufs.has(`wa-${e.waId}`) || !tetes.has(e.numero)) continue;
        /* STOP et la question franche ne vont pas à l'automate (27 octobre 2026) :
           la Maison y répond elle-même (⑤ bis·4), et le personnel est prévenu. */
        if (!e.bouton && (estUnStop(e.texte) || estUneQuestionFranche(e.texte))) continue;
        /* LES BOUTONS DE PERLE (2 novembre 2026, lot 3) : ceux de ses modèles et
           les deux de l'accord des nouvelles. L'automate ne les lit pas dans son
           tour ; ⑤ bis·4 les traite, et lui transmet « Changer l'heure » avec le
           rendez-vous à déplacer. */
        if (estUnBoutonDePerle(e.bouton?.id)) continue;
        /* Les boutons de la paie (⑤ bis·1) : une réponse au registre, pas une conversation. */
        if (estUnBoutonDeLaPaie(e.bouton?.id)) continue;
        /* Les boutons de la prochaine séance (⑤ bis·5, 8 novembre 2026) : une
           place posée ou la main passée, pas un tour de l'automate. */
        if (estUnBoutonDeLaProchaineSeance(e.bouton?.id)) continue;
        const tiroir = tiroirDe(e.numero);
        if (tiroir !== 'clientes' && tiroir !== 'equipe') continue;
        const c = confies.get(e.numero) ?? { numero: e.numero, tiroir, waIds: [], nom: nomDe(e) };
        c.waIds.push(e.waId);
        confies.set(e.numero, c);
      }
      if (confies.size > 0) {
        const enFond = tacheDeFond();
        const tache = confieALAutomate(sb, urlBase, service, [...confies.values()],
          enFond ? AUTOMATE_EN_FOND_MS : AUTOMATE_SANS_FOND_MS);
        if (enFond) enFond(tache);
        else automateEnCours.push(tache);
        dis('automate · numeros confies', { combien: confies.size, enFond: !!enFond });
      }

      const arrivees: Arrivee[] = entrants
        .filter((e) => estNeuf(e) && !confies.has(e.numero) && !estUnBoutonDeLaProchaineSeance(e.bouton?.id) && !estUnBoutonDePerle(e.bouton?.id) && !estUnBoutonDeLaPaie(e.bouton?.id))
        .map((e) => ({
          numero: e.numero,
          tiroir: tiroirDe(e.numero),
          nom: nomDe(e),
        }));
      try {
        await alerteLePersonnel(sb, arrivees);
      } catch (e) {
        dis('alerte · echec', { motif: String(e).slice(0, 120) });
      }
    }
  }

  /* ── ⑤ bis CE QU'UN BOUTON FAIT — 15 septembre 2026 ─────────────────
     « RECU:<versement> » : il dit avoir reçu l'argent. « PASENCORE:<versement> » :
     il dit ne pas l'avoir reçu, et le dossier le signale. Le bouton est une
     trace, pas une signature : la décharge reste à signer sur l'écran. */
  for (const e of entrants) {
    if (!estNeuf(e)) continue;
    const id = e.bouton?.id ?? '';
    const m = id.match(/^(RECU|PASENCORE):(.+)$/);
    if (!m) continue;
    const { data: l } = await sb.from('versements_engagement').select('id, data').eq('id', m[2]).limit(1);
    const ligne = (l ?? [])[0] as { id: string; data: Record<string, unknown> } | undefined;
    if (!ligne) { dis('bouton · versement introuvable'); continue; }
    const patch = m[1] === 'RECU'
      ? { recuLe: e.quand, recuPar: 'whatsapp', contesteLe: undefined }
      : { contesteLe: e.quand };
    const { error } = await sb.from('versements_engagement').update({
      data: { ...ligne.data, ...patch },
      updated_at: new Date().toISOString(),
    }).eq('id', ligne.id);
    if (error) dis('bouton · écriture refusée', { motif: error.message.slice(0, 120) });
    else dis('bouton · versement', { geste: m[1] });
  }

  /* ── ⑤ bis·1 LA PAIE, REÇUE OU PAS — 6 novembre 2026 ────────────────
     « Oui, bien reçu » (PAIE_RECU:<référence>) ou « Pas encore »
     (PAIE_PASENCORE:<référence>), sous le WhatsApp que paie-mtn dépose en
     salle quand MTN dit le salaire reçu. La réponse s'écrit sur l'envoi du
     registre (paie_envois_mtn, 0165) ; « Pas encore » y prévient la direction.
     SEUL SON NUMÉRO RÉPOND : le bouton ne vaut que venu du numéro à qui le
     message est parti (le colis de l'envoi `paie-<référence>-whatsapp`). */
  for (const e of entrants) {
    if (!estNeuf(e)) continue;
    const m = (e.bouton?.id ?? '').match(RE_BOUTON_DE_LA_PAIE);
    if (!m) continue;
    const reference = m[2].toLowerCase();
    const { data: env } = await sb.from('envois').select('data').eq('id', `paie-${reference}-whatsapp`).limit(1);
    const numeroParti = String(((env ?? [])[0] as { data?: { colis?: { numero?: string } } } | undefined)?.data?.colis?.numero ?? '').replace(/\D/g, '');
    if (!numeroParti || numeroParti !== String(e.numero ?? '').replace(/\D/g, '')) { dis('bouton · paie, numéro étranger'); continue; }
    const { error } = await sb.from('paie_envois_mtn').update({
      reponse_employe: m[1].toUpperCase() === 'RECU' ? 'bien-recu' : 'pas-encore',
      reponse_employe_le: e.quand || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('reference', reference).eq('etat', 'recu');
    if (error) dis('bouton · paie, écriture refusée', { motif: error.message.slice(0, 120) });
    else dis('bouton · paie', { geste: m[1].toUpperCase() });
  }

  /* ── ⑤ bis·2 LA REPRISE, CONFIRMÉE D'UNE TOUCHE — 29 septembre 2026 ──
     « Je confirme » (REPRISE_OK:<rdv>) ou « Un autre moment »
     (REPRISE_AUTRE:<rdv>), sous le message que rappels-j1 envoie trois jours
     avant une reprise posée à la caisse. La réponse s'écrit sur le rendez-vous :
     « Je confirme » éteint la relance d'À faire, « Un autre moment » la garde
     allumée avec son motif, et la Maison propose une heure. Le rendez-vous
     n'est JAMAIS annulé ici : c'est un geste de la Maison.

     SEUL SON NUMÉRO RÉPOND POUR ELLE : le bouton ne vaut que venu du numéro
     de la fiche du rendez-vous, celui à qui le message est parti. */
  for (const e of entrants) {
    if (!estNeuf(e)) continue;
    const m = (e.bouton?.id ?? '').match(/^REPRISE_(OK|AUTRE):(.+)$/);
    if (!m) continue;
    const { data: l } = await sb.from('appointments').select('id, branch_id, data').eq('id', m[2]).limit(1);
    const ligne = (l ?? [])[0] as { id: string; branch_id?: string; data: Record<string, unknown> } | undefined;
    if (!ligne) { dis('reprise · rendez-vous introuvable'); continue; }
    const rdv = ligne.data as { clientId?: string; clientName?: string; date?: string; time?: string; status?: string; branchId?: string };
    const fiche = fiches.find((f) => f.id === rdv.clientId);
    if (!fiche || !fiche.numeros.includes(e.numero)) { dis('reprise · numéro étranger au rendez-vous'); continue; }
    if (rdv.status === 'annulé' || rdv.status === 'honoré') { dis('reprise · rendez-vous déjà clos'); continue; }
    const ok = m[1] === 'OK';
    const patch = ok
      ? { confirmeeParLaClienteLe: e.quand, relanceFaite: true, autreMomentDemandeLe: undefined }
      : { autreMomentDemandeLe: e.quand, confirmeeParLaClienteLe: undefined };
    const { error } = await sb.from('appointments').update({ data: { ...ligne.data, ...patch } }).eq('id', ligne.id);
    if (error) { dis('reprise · écriture refusée', { motif: error.message.slice(0, 120) }); continue; }
    dis('reprise · réponse', { geste: m[1] });
    if (!jetonMeta || !phoneIdMeta) continue;
    /* « Madame Naffi », jamais le premier mot seul (9 octobre 2026). */
    const appel = appelDe({ name: fiche.nom, prenomUsage: fiche.prenomUsage, civilite: fiche.civilite, auMasculin: fiche.auMasculin }, rdv.clientName);
    const quand = `${jourDeLaReprise(rdv.date ?? '')} à ${heureDeLaReprise(rdv.time)}`;
    const couronne = (Deno.env.get('COURONNE_URL') ?? 'https://maisonmnd.com/couronne/').trim();
    await ditDepuisLeTrone(sb, jetonMeta, phoneIdMeta, ok
      ? {
        numero: e.numero, branchId: rdv.branchId ?? fiche.branchId, auto: 'reprise-ok',
        texte: `C'est noté, ${appel} : ${quand}. La Maison vous attend.`,
      }
      : {
        numero: e.numero, branchId: rdv.branchId ?? fiche.branchId, auto: 'reprise-autre',
        texte: `Bien sûr, ${appel}. Choisissez votre nouveau moment dans Ma Couronne : ${couronne}\nOu répondez ici avec le jour qui vous va, la Maison vous propose une heure.`,
      });
  }

  /* ── ⑤ bis·3 LES POINTS D'ÉTAPE, SUR WHATSAPP — 17 octobre 2026 ────────
     « Entre deux séances », lot 2. Sous les modèles que rappels-j1 envoie :
       · « Tout va bien » (POINT_BIEN:<séance>) : un signalement « tout va
         bien », déjà traité, et le merci de Ma Couronne ;
       · « J'ai un souci » (POINT_SOUCI:<séance>) : la liste des soucis ;
       · une ligne de la liste (POINT_LISTE:<séance>:<souci>) : un
         signalement OUVERT, qui entre dans la file du Trône rangé par
         urgence, et la réponse validée par la direction (rien d'autre :
         en Santé, l'accusé seul, jamais un conseil écrit) ;
       · avant la séance (POINT_AVANT:<séance>:<envie>) : son envie s'écrit
         sur le rendez-vous, et la Maison prépare sa venue.
     Le personnel est déjà prévenu plus haut (l'automate n'a pas pris ces
     boutons) : chaque réponse paraît dans ses Conversations.

     SEUL SON NUMÉRO RÉPOND POUR ELLE, comparé sous sa forme courte (cleWa) :
     un ancien numéro à huit chiffres se reconnaît aussi. */
  for (const e of entrants) {
    if (!estNeuf(e)) continue;
    const p = lisLaReponseAuPoint(e.bouton?.id ?? '');
    if (!p) continue;
    const { data: l } = await sb.from('appointments').select('id, branch_id, data').eq('id', p.apptId).limit(1);
    const ligne = (l ?? [])[0] as { id: string; branch_id?: string; data: Record<string, unknown> } | undefined;
    if (!ligne) { dis('point · séance introuvable'); continue; }
    const rdv = ligne.data as { clientId?: string; clientName?: string; date?: string; branchId?: string; master?: string };
    const fiche = fiches.find((f) => f.id === rdv.clientId);
    if (!fiche || !fiche.numeros.some((n) => cleWa(n) === cleWa(e.numero))) { dis('point · numéro étranger à la séance'); continue; }
    const appel = appelDe({ name: fiche.nom, prenomUsage: fiche.prenomUsage, civilite: fiche.civilite, auMasculin: fiche.auMasculin }, rdv.clientName);
    const branchId = rdv.branchId ?? fiche.branchId;

    if (p.geste === 'avant') {
      const { error } = await sb.from('appointments').update({
        data: { ...ligne.data, envieAvantSeance: { envie: p.envie, quand: e.quand } },
      }).eq('id', ligne.id);
      if (error) { dis('point · envie refusée', { motif: error.message.slice(0, 120) }); continue; }
      dis('point · envie', { envie: p.envie });
      if (jetonMeta && phoneIdMeta) {
        await ditDepuisLeTrone(sb, jetonMeta, phoneIdMeta, {
          numero: e.numero, branchId, auto: 'point-avant', texte: reponseAvant(appel, p.envie, jourDeLaReprise(rdv.date ?? '')),
        });
      }
      continue;
    }

    if (p.geste === 'souci') {
      dis('point · liste demandée');
      if (jetonMeta && phoneIdMeta) {
        await ditDepuisLeTrone(sb, jetonMeta, phoneIdMeta, {
          numero: e.numero, branchId, auto: 'point-souci', texte: MOT_DE_LA_LISTE,
          interactive: {
            type: 'list',
            body: { text: MOT_DE_LA_LISTE },
            action: {
              button: BOUTON_DE_LA_LISTE,
              sections: [{ title: 'Vos locks', rows: lignesDeLaListe(ligne.id).map((r) => ({ id: r.id, title: r.titre, description: r.description })) }],
            },
          },
        });
      }
      continue;
    }

    /* « Tout va bien », ou un souci choisi dans la liste : un signalement. */
    const cles = p.geste === 'liste' ? [p.cle] : [];
    const validees: Record<string, string> = {};
    if (cles.length) {
      const { data: rep } = await sb.from('entre_deux_reponses').select('id, data').in('id', cles);
      for (const r of (rep ?? []) as { id: string; data?: { texteValide?: string } }[]) {
        const t = (r.data?.texteValide ?? '').trim();
        if (t) validees[r.id] = t;
      }
    }
    const reponse = p.geste === 'liste' ? reponseAuSouciDuPoint(p.cle, validees) : [MERCI_BIEN];
    const bien = p.geste === 'bien';
    const idSig = `sig-wa-${cleCourte(e.waId)}`;
    const { error } = await sb.from('signalements').upsert({
      id: idSig,
      branch_id: branchId ?? null,
      data: {
        id: idSig, branchId, clientId: rdv.clientId, soucis: cles, canal: 'whatsapp', quand: e.quand,
        point: `pe-${ligne.id}-apres`, apptId: ligne.id,
        ...(rdv.master ? { maitre: rdv.master } : {}),
        ...(bien ? { bien: true } : {}),
        etat: bien ? 'traite' : 'ouvert',
        reponse: reponse.join('\n'),
      },
    }, { onConflict: 'id', ignoreDuplicates: true });
    /* La borne de la base (dix signalements par jour et par cliente, 0132)
       se dit au journal ; elle a parlé dans ses Conversations, la Maison le voit. */
    if (error) { dis('point · signalement refusé', { motif: error.message.slice(0, 120) }); continue; }
    dis('point · signalement', { bien, cles: cles.join(',') });
    if (jetonMeta && phoneIdMeta) {
      await ditDepuisLeTrone(sb, jetonMeta, phoneIdMeta, {
        numero: e.numero, branchId, auto: bien ? 'point-bien' : 'point-recu', texte: reponse.join('\n'),
      });
    }
  }

  /* ── ⑤ bis·5 LA PROCHAINE SÉANCE DE L'ABONNÉE — 8 novembre 2026 ─────────
     Lot 4 de l'abonnement refait. Sous « Merci, Awa. Votre prochaine séance :
     samedi 23 janvier 2027 à 9 h ? », déposé en salle par le Trône quand sa
     séance de formule a été marquée faite :
       · « Oui, je réserve » (PROCHAINE_OK:<séance>) : la place gardée sur la
         ligne d'envoi (`proposition`) se pose par le serveur, couverte par sa
         formule, sous le même verrou que Ma Couronne
         (`reserver_une_seance_incluse_par_la_maison`, migration 0198 : la
         formule à elle, en vie ce jour-là, sur une lune réglée, un crédit
         libre, la place libre). Posée : UNE phrase, qui est sa confirmation ;
         la ligne `conf-<rdv>-whatsapp`, posée avec la séance, tait le modèle
         de confirmation-rdv, qui ne reprend la main que si la phrase ne part
         pas (comme l'automate, 11 novembre 2026). Refusée (une autre main a
         pris la place, la formule ne porte plus) : la main passe, l'équipe
         est prévenue. Une suite déjà posée depuis le message (le comptoir,
         Ma Couronne) : rien ne se pose, elle lit sa date (⟨deja-un-suivant⟩).
       · « Une autre date » (PROCHAINE_AUTRE:<séance>) : rien n'est posé ; la
         réponse s'écrit sur la ligne, l'équipe est prévenue (son prénom,
         jamais un texte), et la cliente est invitée à dire son jour ici.
     UNE SEULE RÉPONSE COMPTE par ligne ; SEUL LE NUMÉRO À QUI LE MESSAGE EST
     PARTI RÉPOND POUR ELLE (son colis : le numéro de sa fiche, ou le numéro
     à prévenir de sa séance, celui du parent d'une enfant), comparé sous sa
     forme courte (cleWa), comme les boutons de la paie (11 novembre 2026). */
  for (const e of entrants) {
    if (!estNeuf(e)) continue;
    const b = lisLeBoutonDeLaProchaineSeance(e.bouton?.id);
    if (!b) continue;
    const { data: l } = await sb.from('envois').select('id, branch_id, data').eq('id', idDeLaProchaineSeance(b.rdvId)).limit(1);
    const ligne = (l ?? [])[0] as { id: string; branch_id?: string; data: Record<string, any> } | undefined;
    if (!ligne || ligne.data?.type !== TYPE_APRES_SEANCE) { dis('prochaine séance · ligne introuvable'); continue; }
    const numeroParti = cleWa(String(ligne.data.colis?.numero ?? ''));
    if (!numeroParti || numeroParti !== cleWa(e.numero)) { dis('prochaine séance · numéro étranger à la ligne'); continue; }
    if (ligne.data.reponse) { dis('prochaine séance · déjà répondu'); continue; }
    const fiche = fiches.find((f) => f.id === ligne.data.clientId);
    /* L'appel du {{1}} que le message a dit (`appel`, posé au dépôt). */
    const appel = String(ligne.data.appel ?? '').trim()
      || (fiche ? appelDe({ name: fiche.nom, prenomUsage: fiche.prenomUsage, civilite: fiche.civilite, auMasculin: fiche.auMasculin }) : '')
      || String(ligne.data.prenom ?? '').trim() || 'Madame, Monsieur';
    const branchId = (ligne.data.branchId as string | undefined) ?? fiche?.branchId;
    const proposition = propositionLisible(ligne.data.proposition);
    const repond = async (reponse: Record<string, unknown>): Promise<boolean> => {
      const { error } = await sb.from('envois').update({
        data: { ...ligne.data, reponse: { le: e.quand, ...reponse } }, updated_at: new Date().toISOString(),
      }).eq('id', ligne.id);
      if (error) dis('prochaine séance · réponse refusée', { motif: error.message.slice(0, 120) });
      return !error;
    };
    const laMainPasse = async (geste: 'autre' | 'oui', texte: string, auto: AutoDeLaProchaineSeance, refus?: string) => {
      if (!(await repond({ geste, ...(refus ? { refus } : {}) }))) return;
      /* Le personnel lit son prénom, jamais un texte (un écran verrouillé se
         lit par-dessus l'épaule) ; « oui » sur une place qui ne se pose plus
         se dit tel quel, pour que l'équipe rappelle vite. */
      const qui = String(ligne.data.prenom ?? '').trim() || (fiche ? prenomDe(String(fiche.nom ?? ''), fiche.prenomUsage) : '') || 'Une abonnée';
      const alerte: Alerte = {
        titre: geste === 'autre' ? `${qui} souhaite une autre date` : `${qui} a dit oui : la place ne s’est pas posée`,
        corps: 'Sa prochaine séance de formule : proposez-lui une heure dans la conversation.',
        url: `/trone/#/conversations?n=${e.numero}`,
      };
      await previensLesTelephones(sb, alerte, alerte, 1);
      if (jetonMeta && phoneIdMeta) await ditDepuisLeTrone(sb, jetonMeta, phoneIdMeta, { numero: e.numero, branchId, auto, texte });
    };
    if (b.geste === 'autre' || !proposition) {
      dis('prochaine séance · une autre date', { proposition: !!proposition });
      await laMainPasse('autre', reponseALAutreDate(appel), 'prochaine-autre', proposition ? undefined : 'proposition illisible');
      continue;
    }
    /* UNE SUITE DÉJÀ POSÉE DEPUIS LE MESSAGE : rien ne se pose une seconde
       fois, elle lit la date qu'elle a. Une lecture impossible laisse juger
       le serveur (il ne pose que sur un crédit libre). */
    const suivant = await suivantDeLaSeance(sb, String(ligne.data.seanceId ?? b.rdvId), proposition.clientId);
    if (suivant) {
      dis('prochaine séance · une suite est déjà posée');
      if ((await repond({ geste: 'oui', refus: 'deja-un-suivant', apptId: suivant.id })) && jetonMeta && phoneIdMeta) {
        await ditDepuisLeTrone(sb, jetonMeta, phoneIdMeta, {
          numero: e.numero, branchId, auto: 'prochaine-deja',
          texte: reponseDejaReservee(appel, `${jourDeLaReprise(suivant.date)} à ${heureDeLaReprise(suivant.time)}`),
        });
      }
      continue;
    }
    /* « OUI » : le serveur juge et pose, sous verrou ; rien n'est écrit ici
       avant son verdict. La ligne de confirmation voyage avec la pose. */
    const moment = `${jourDeLaReprise(proposition.date)} à ${heureDeLaReprise(proposition.time)}`;
    const { data: pose, error: errPose } = await sb.rpc('reserver_une_seance_incluse_par_la_maison', {
      p_client_id: proposition.clientId, p_sub_id: proposition.subId, p_service_id: proposition.serviceId,
      p_date: proposition.date, p_time: proposition.time, p_source: 'whatsapp',
      p_envoi: {
        branchId, type: 'confirmation', canal: 'whatsapp', clientId: proposition.clientId, prenom: appel, numero: `+${e.numero}`,
        dateRdv: proposition.date, heure: proposition.time, moment, statut: 'en cours',
        detail: 'dit dans la conversation, après la séance', quand: new Date().toISOString(),
      },
    });
    const verdict = (pose ?? null) as { ok?: boolean; raison?: string; apptId?: string } | null;
    if (errPose || !verdict?.ok || !verdict.apptId) {
      const raison = errPose ? String(errPose.message ?? 'refus').slice(0, 120) : String(verdict?.raison ?? 'refus');
      dis('prochaine séance · la place ne se pose pas', { raison });
      await laMainPasse('oui', reponseALaPlacePrise(appel), 'prochaine-prise', raison);
      continue;
    }
    await repond({ geste: 'oui', apptId: verdict.apptId });
    dis('prochaine séance · posée');
    const dit = jetonMeta && phoneIdMeta
      ? await ditDepuisLeTrone(sb, jetonMeta, phoneIdMeta, { numero: e.numero, branchId, auto: 'prochaine-oui', texte: reponseAuOui(appel, moment) })
      : null;
    await ditLaConfirmationDeLaSeance(sb, verdict.apptId, dit);
  }

  /* ── ⑤ ter LE FORMULAIRE DE CONGÉ — 15 septembre 2026 ───────────────
     Sa réponse devient une DEMANDE, à décider dans Temps & absences. Rien
     n'est accordé ici : le Trône transmet, la direction décide. Un même
     formulaire n'en fait jamais deux (identifiant dérivé du message). */
  for (const e of entrants) {
    if (!estNeuf(e) || !e.formulaire) continue;
    const tete = tetes.get(e.numero);
    if (tete?.tiroir !== 'equipe' || !tete.staffId) { dis('formulaire · pas de l équipe'); continue; }
    const r = e.formulaire.reponse ?? {};
    const du = jourDuFlow(r.du);
    const au = jourDuFlow(r.au) || du;
    const jours = joursInclus(du, au);
    if (!du || jours <= 0) { dis('formulaire · dates illisibles'); continue; }
    const nature = String(r.nature ?? '').toLowerCase() === 'maladie' ? 'maladie' : 'conge';
    const mot = String(r.mot ?? '').trim().slice(0, 300);
    const id = `lv-wa-${cleCourte(e.waId)}`;
    const { error } = await sb.from('leave_requests').upsert({
      id, branch_id: tete.branchId ?? null,
      data: {
        id, employeeId: tete.staffId, type: nature,
        startDate: du, endDate: au, days: jours,
        reason: mot || undefined,
        status: 'demande', branchId: tete.branchId,
        source: 'whatsapp', waId: e.waId, recueLe: e.quand,
      },
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) { dis('formulaire · écriture refusée', { motif: error.message.slice(0, 120) }); continue; }
    dis('formulaire · demande posée', { nature, jours });
    if (jetonMeta && phoneIdMeta) {
      await ditDepuisLeTrone(sb, jetonMeta, phoneIdMeta, {
        numero: e.numero, branchId: tete.branchId, auto: 'transmis',
        texte: 'Votre demande est transmise à la direction. Elle vous répond ici.',
      });
    }
  }

  /* ── ⑤ quater LES DEUX MESSAGES QUI PARTENT SEULS ────────────────────
     Dans la fenêtre qu'elle vient d'ouvrir, donc gratuits jusqu'au
     30 septembre 2026, puis comptés parmi les réponses du mois. */
  if (jetonMeta && phoneIdMeta) {
    for (const e of entrants) {
      if (!estNeuf(e)) continue;
      const tete = tetes.get(e.numero);
      if (!tete) continue;
      /* L'ACCUSÉ D'UNE PIÈCE REÇUE D'UN PRESTATAIRE. Il sait que la Maison
         l'a, et la direction reviendra vers lui : rien d'autre. */
      if (tete.tiroir === 'prestataires' && e.media && pieces.get(e.waId)?.chemin) {
        await ditDepuisLeTrone(sb, jetonMeta, phoneIdMeta, {
          numero: e.numero, branchId: tete.branchId, auto: 'accuse',
          texte: 'Bien reçu, merci. La direction revient vers vous.',
        });
      }
      /* LE FORMULAIRE DE CONGÉ, à qui en parle. Sans Flow publié, rien ne
         part et la direction répond à la main — l'écran le sait. */
      if (tete.tiroir === 'equipe' && e.type === 'text' && flowConge
        && /\b(cong[ée]s?|absence|malade|maladie|repos)\b/i.test(e.texte)) {
        await ditDepuisLeTrone(sb, jetonMeta, phoneIdMeta, {
          numero: e.numero, branchId: tete.branchId, auto: 'formulaire',
          texte: 'Remplissez ce formulaire : la direction vous répond ici.',
          interactive: {
            type: 'flow',
            header: { type: 'text', text: 'Demander un congé' },
            body: { text: 'Remplissez ce formulaire : la direction vous répond ici.' },
            action: {
              name: 'flow',
              parameters: {
                flow_message_version: '3',
                flow_id: flowConge,
                flow_cta: 'Remplir la demande',
                flow_action: 'navigate',
                flow_action_payload: { screen: 'DEMANDE' },
              },
            },
          },
        });
      }
    }
  }

  /* ── ⑤ bis·4 L'ASSISTANT MAISON ENTEND — 27 octobre 2026 ──────────────
     Maquette v4, lot 2.
       · SES BOUTONS portent leur ligne d'envoi : la réponse s'y écrit (oui,
         non ; un merci ne dit rien), pour « garder » aussi sur le rendez-vous
         (comme la reprise : confirmée, ou un autre moment demandé ; jamais
         annulé ici), et la Maison répond d'une phrase.
       · STOP : plus aucune nouvelle de la Maison sur chacune de ses fiches
         (`nouvelles` = non, par « stop ») ; ses rappels de RDV continuent.
       · LA QUESTION FRANCHE (« c'est un robot ? ») : si le dernier message
         parti vers ce numéro est parti seul, la réponse franche ; si une
         personne de l'équipe écrivait, rien : elle répond elle-même.
     SEUL SON NUMÉRO RÉPOND POUR ELLE, comparé sous sa forme courte. */
  const couronneUrl = (Deno.env.get('COURONNE_URL') ?? 'https://maisonmnd.com/couronne/').trim();
  const offrirUrl = (Deno.env.get('OFFRIR_URL') ?? 'https://maisonmnd.com/offrir/').trim();
  for (const e of entrants) {
    if (!estNeuf(e)) continue;
    const b = lisLeBoutonDeLAssistant(e.bouton?.id);
    if (!b) continue;
    const { data: l } = await sb.from('envois').select('id, branch_id, data').eq('id', b.ligneId).limit(1);
    const ligne = (l ?? [])[0] as { id: string; branch_id?: string; data: Record<string, any> } | undefined;
    if (!ligne || ligne.data?.type !== 'gerard') { dis('assistant · ligne introuvable'); continue; }
    const fiche = fiches.find((f) => f.id === ligne.data.clientId);
    if (!fiche || !fiche.numeros.some((n) => cleWa(n) === cleWa(e.numero))) { dis('assistant · numéro étranger à la ligne'); continue; }
    const reponse = reponseDuGeste(b.geste);
    const { error } = await sb.from('envois').update({
      data: { ...ligne.data, ...(reponse ? { reponse } : {}), bouton: b.geste, reponduLe: e.quand },
    }).eq('id', ligne.id);
    if (error) { dis('assistant · réponse refusée', { motif: error.message.slice(0, 120) }); continue; }
    dis('assistant · réponse', { geste: b.geste, genre: ligne.data.genre });
    const garder = ligne.data.genre === 'garder' && !!ligne.data.apptId;
    let quand: string | undefined;
    /* LES BOUTONS DE « GARDER » (2 novembre 2026, lot 3 de Perle) : la suite
       vient de `suiteDuGarder` (copie ci-dessus). Une marque datée sur le
       rendez-vous, jamais un statut ; « Je ne peux plus » passe la main à
       l'équipe ; « Changer l'heure » va à l'automate. */
    let suite: SuiteDuGarder | null = null;
    let rdvAGarder: string | undefined;
    if (garder) {
      const { data: r } = await sb.from('appointments').select('id, data').eq('id', ligne.data.apptId).limit(1);
      const rdvLigne = (r ?? [])[0] as { id: string; data: Record<string, any> } | undefined;
      const rdv = rdvLigne?.data;
      if (rdvLigne && rdv && rdv.status !== 'annulé' && rdv.status !== 'honoré') {
        quand = `${jourDeLaReprise(rdv.date ?? '')} à ${heureDeLaReprise(rdv.time)}`;
        rdvAGarder = rdvLigne.id;
        suite = suiteDuGarder(b.geste, { quandIso: e.quand, prenom: prenomDe(String(fiche.nom ?? ''), fiche.prenomUsage), quand });
        if (suite) {
          const { error: errRdv } = await sb.from('appointments').update({ data: { ...rdv, ...suite.marques } }).eq('id', rdvLigne.id);
          if (errRdv) dis('assistant · rendez-vous refusé', { motif: errRdv.message.slice(0, 120) });
        }
        if (suite?.main) {
          /* LA MAIN À L'ÉQUIPE : la ligne que pose le Trône quand une personne
             écrit ; l'automate se tait sur ce fil le temps de la pause. */
          const idMain = `main-${e.numero}`;
          const { data: m } = await sb.from('fils_automate').select('id, data').eq('id', idMain).limit(1);
          const avant = (((m ?? [])[0] as { data?: Record<string, unknown> } | undefined)?.data) ?? null;
          const { error: errMain } = await sb.from('fils_automate').upsert(
            { id: idMain, branch_id: fiche.branchId ?? null, data: mainPourLEquipe(avant, e.numero, suite.main.motif, suite.main.heures, Date.now()) },
            { onConflict: 'id' });
          if (errMain) dis('assistant · main refusée', { motif: errMain.message.slice(0, 120) });
        }
      }
    }
    const alerteDuGarder: Alerte | null = suite?.alerte
      ? { titre: suite.alerte.titre, corps: suite.alerte.corps, url: `/trone/#/conversations?n=${e.numero}` }
      : null;
    const appel = appelDe({ name: fiche.nom, prenomUsage: fiche.prenomUsage, civilite: fiche.civilite, auMasculin: fiche.auMasculin });
    const retour = retourDuBouton({ geste: b.geste, garder, appel, quand, couronneUrl, offrirUrl });
    if (suite?.deplacer && rdvAGarder && service && urlBase) {
      /* « CHANGER L'HEURE » VA À L'AUTOMATE (choix de Yéman, 2 novembre 2026) :
         il ouvre ses places en mode déplacement et déplace le rendez-vous sous
         verrou (morceau C, `deplacer: { rdvId }`). S'il ne prend pas le fil,
         la phrase de Ma Couronne en secours et l'équipe prévenue. En tâche
         de fond, comme les autres tours confiés. */
      const enFond = tacheDeFond();
      const numero = e.numero;
      const branchId = fiche.branchId;
      const tache = (async () => {
        const rep = await demandeALAutomate(urlBase, service, { numero, tiroir: tiroirDe(numero), waIds: [e.waId], deplacer: { rdvId: rdvAGarder } },
          enFond ? AUTOMATE_EN_FOND_MS : AUTOMATE_SANS_FOND_MS);
        dis('assistant · changer l heure confié', { pris: rep.pris });
        if (rep.pris) {
          if (rep.alerte) await previensLesTelephones(sb, rep.alerte, rep.alerte, 1);
          return;
        }
        await previensLesTelephones(sb, alerteDuGarder, alerteDuGarder, 1);
        if (retour && jetonMeta && phoneIdMeta) {
          await ditDepuisLeTrone(sb, jetonMeta, phoneIdMeta, { numero, branchId, auto: retour.auto as AutoDuTrone, texte: retour.texte });
        }
      })();
      if (enFond) enFond(tache);
      else automateEnCours.push(tache);
      continue;
    }
    if (alerteDuGarder) await previensLesTelephones(sb, alerteDuGarder, alerteDuGarder, 1);
    if (!jetonMeta || !phoneIdMeta) continue;
    if (retour) await ditDepuisLeTrone(sb, jetonMeta, phoneIdMeta, { numero: e.numero, branchId: fiche.branchId, auto: retour.auto as AutoDuTrone, texte: retour.texte });
    /* L'ACCORD DES NOUVELLES (maquette « Nouvelles par WhatsApp ») : après le
       merci de « Oui, je viens », la question, une fois pour toujours. */
    if (garder && b.geste === 'OUI' && suite) {
      await demandeLAccordDesNouvelles(sb, jetonMeta, phoneIdMeta, { numero: e.numero, clientId: fiche.id, branchId: fiche.branchId });
    }
  }
  /* LA RÉPONSE À LA QUESTION DE L'ACCORD : « Oui, volontiers » ou « Non merci ».
     L'accord, daté, de source « whatsapp », va à la fiche à qui la question
     a été posée (à défaut, la tête du numéro), sous verrou ; le journal porte
     le geste sans texte ; la cliente reçoit le merci. */
  for (const e of entrants) {
    if (!estNeuf(e)) continue;
    const accord = accordDuBouton(String(e.bouton?.id ?? ''), e.quand);
    if (!accord || tiroirDe(e.numero) !== 'clientes') continue;
    const siennes = fichesParNumero.get(e.numero) ?? [];
    const lues = await Promise.all(siennes.map((f) => lisLaFiche(sb, f.id)));
    const demandees = lues.filter((l): l is LigneDeFiche => !!l && !!l.data?.nouvellesDemandeesLe).map((l) => l.id);
    const tete = teteDuNumero(e.numero);
    const cibles = demandees.length > 0 ? demandees : tete ? [tete.id] : [];
    let ecrites = 0;
    for (const id of cibles) {
      const r = await ecrisLaFicheSousVerrou(sb, id, (d) => ({ ...d, nouvelles: accord }));
      if (!r.ecrite) continue;
      ecrites += 1;
      const avant = r.avant?.data?.nouvelles as { oui?: boolean } | undefined;
      await journaliseLAccord(sb, {
        branchId: r.avant?.data?.branchId, pieceId: id, piece: `Accord des nouvelles : ${accord.oui ? 'oui' : 'non'}, sur WhatsApp`,
        champs: [{ champ: 'Nouvelles', avant: avant ? (avant.oui ? 'oui' : 'non') : 'pas encore', apres: accord.oui ? 'oui' : 'non' }],
      });
    }
    dis('accord · réponse', { oui: accord.oui, fiches: ecrites });
    if (ecrites > 0 && jetonMeta && phoneIdMeta) {
      await ditDepuisLeTrone(sb, jetonMeta, phoneIdMeta, {
        numero: e.numero, branchId: tete?.branchId ?? brancheDuNumero(e.numero), auto: accord.oui ? 'accord-oui' : 'accord-non', texte: accord.oui ? MERCI_DE_L_ACCORD : MERCI_DU_REFUS,
      });
    }
  }
  for (const e of entrants) {
    if (!estNeuf(e) || e.bouton || !estUnStop(e.texte) || tiroirDe(e.numero) !== 'clientes') continue;
    const siennes = fichesParNumero.get(e.numero) ?? [];
    let tues = 0;
    for (const f of siennes) {
      const { data: c } = await sb.from('clients').select('id, data').eq('id', f.id).limit(1);
      const row = (c ?? [])[0] as { id: string; data: Record<string, any> } | undefined;
      if (!row) continue;
      const { error } = await sb.from('clients').update({ data: { ...row.data, nouvelles: { oui: false, le: aujourdhui, par: 'stop' } } }).eq('id', row.id);
      if (error) dis('assistant · stop refusé', { motif: error.message.slice(0, 120) });
      else tues++;
    }
    dis('assistant · stop', { fiches: tues });
    if (tues > 0 && jetonMeta && phoneIdMeta) {
      await ditDepuisLeTrone(sb, jetonMeta, phoneIdMeta, { numero: e.numero, branchId: siennes[0].branchId, auto: 'stop', texte: ACCUSE_DU_STOP });
    }
  }
  for (const e of entrants) {
    if (!estNeuf(e) || e.bouton || !estUneQuestionFranche(e.texte) || tiroirDe(e.numero) !== 'clientes') continue;
    const { data: avant } = await sb.from('messages_wa').select('data')
      .eq('data->>numero', e.numero).eq('data->>sens', 'sortant').order('data->>quand', { ascending: false }).limit(1);
    const dernier = ((avant ?? [])[0] as { data?: Record<string, any> } | undefined)?.data;
    const partiSeul = !!dernier && (!!dernier.auto || ['Le Trône', 'Assistant Maison', 'Gérard'].includes(String(dernier.parQui ?? ''))
      || /automatiquement/i.test(String(dernier.parQui ?? '')));
    dis('assistant · question franche', { partiSeul });
    if (!partiSeul || !jetonMeta || !phoneIdMeta) continue;
    await ditDepuisLeTrone(sb, jetonMeta, phoneIdMeta, { numero: e.numero, branchId: brancheDuNumero(e.numero), auto: 'franche', texte: REPONSE_FRANCHE });
  }

  /* ── ⑥ LES ACCUSÉS. Ils corrigent DEUX journaux, et c'est voulu : les
     rappels automatiques vivent dans `envois`, les conversations dans
     `messages_wa`, et Meta ne sait pas lequel il vient de livrer. */
  /* LES RÉPONSES DE L'AUTOMATE QUE META REFUSE APRÈS COUP (relecture du
     9 octobre 2026) : le numéro est rendu à l'automate (`apresCoup`), qui
     passe la main d'un parcours en cours et dit ce qui doit sonner. */
  const refusesApresCoup = new Set<string>();
  for (const a of accuses) {
    const { data: lignes } = await sb.from('envois').select('id, data')
      .eq('data->>waMessageId', a.waId).limit(1);
    const ligne = (lignes ?? [])[0] as { id: string; data: Record<string, unknown> } | undefined;
    if (ligne) {
      await sb.from('envois').update({
        data: {
          ...ligne.data,
          etat: a.etat,
          ...(a.detail ? { detail: a.detail } : {}),
          /* LE STATUT DU JOURNAL SUIT L'ACCUSÉ : un message que Meta refuse
             plus tard n'est pas « envoyé », et la tournée du matin doit le
             réclamer à la main. Les autres verdicts ne le rouvrent pas. */
          ...(a.etat === 'non-remis' ? { statut: 'échec' } : {}),
          accuseLe: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      }).eq('id', ligne.id);
    }

    const { data: msgs } = await sb.from('messages_wa').select('id, data')
      .eq('data->>waId', a.waId).limit(1);
    const msg = (msgs ?? [])[0] as { id: string; data: Record<string, unknown> } | undefined;
    if (msg) {
      /* UN ACCUSÉ NE RECULE PAS. Meta livre « remis » et « lu » dans un ordre
         qu'il ne garantit pas : sans cette garde, un « remis » en retard
         effacerait un « lu » déjà reçu, et l'écran perdrait une information
         qu'il avait eue. */
      const RANG: Record<string, number> = { 'en-route': 1, remis: 2, lu: 3, 'non-remis': 3 };
      const avant = String((msg.data as { etat?: string }).etat ?? '');
      if ((RANG[a.etat] ?? 0) >= (RANG[avant] ?? 0)) {
        await sb.from('messages_wa').update({
          data: { ...msg.data, etat: a.etat, ...(a.detail ? { detail: a.detail } : {}) },
          updated_at: new Date().toISOString(),
        }).eq('id', msg.id);
        if (a.etat === 'non-remis' && avant !== 'non-remis' && (msg.data as { auto?: string }).auto === 'automate') {
          const n = numeroWa(String((msg.data as { numero?: string }).numero ?? a.numero ?? ''));
          if (n) refusesApresCoup.add(n);
        }
      }
    }
  }
  if (refusesApresCoup.size > 0 && service && urlBase) {
    const fond = tacheDeFond();
    const rattrapage = rattrapeLesRefus(sb, urlBase, service, [...refusesApresCoup],
      fond ? AUTOMATE_EN_FOND_MS : AUTOMATE_SANS_FOND_MS);
    if (fond) fond(rattrapage);
    else automateEnCours.push(rattrapage);
    dis('automate · refus apres coup confies', { combien: refusesApresCoup.size, enFond: !!fond });
  }

  /* ── ⑥ LES REACTIONS QU ELLE POSE ──────────────────────────────────
     Une par personne : WhatsApp remplace la precedente, on fait pareil.
     Un emoji vide la retire. */
  for (const r of reactions) {
    const { data: l } = await sb.from('messages_wa').select('id, data')
      .eq('data->>waId', r.surWaId).limit(1);
    const ligne = (l ?? [])[0] as { id: string; data: Record<string, unknown> } | undefined;
    if (!ligne) continue;
    const avant = (ligne.data.reactions ?? []) as { par: string }[];
    const sansLaSienne = avant.filter((x) => x.par !== 'elle');
    const apres = r.emoji
      ? [...sansLaSienne, { par: 'elle', emoji: r.emoji, quand: r.quand }]
      : sansLaSienne;
    await sb.from('messages_wa').update({
      data: { ...ligne.data, reactions: apres },
      updated_at: new Date().toISOString(),
    }).eq('id', ligne.id);
  }

  /* ── ⑦ LES APPELS ──────────────────────────────────────────────────
     L identifiant est DETERMINISTE (`wa-call-<id Meta>`) : Meta repete
     volontiers le meme evenement, il ne s ecrira qu une fois. Chaque etape
     COMPLETE la ligne plutot que de la refaire — la garde de 0098 protege
     ensuite ce qui ne doit plus bouger (qui a decroche, l heure de la
     sonnerie, le rappel deja pose). */
  for (const a of appels) {
    const id = `wa-call-${a.callId}`;
    const { data: deja } = await sb.from('appels_wa').select('id, data').eq('id', id).limit(1);
    const avant = ((deja ?? [])[0]?.data ?? {}) as Record<string, unknown>;
    /* LA TETE, quand on la connait. Meta ne donne qu un numero : c est la
       Maison qui reconnait la personne. Par `fiches_du_numero` depuis le
       9 octobre 2026 : la table entiere lue d un trait s arretait a mille.
       Depuis le 4 novembre 2026, sa VOIX : jamais une fiche d enfant. */
    const voixDeLAppel = avant.clientId ? undefined : (await voixDe(a.numero))?.fiche;
    const tete = avant.clientId
      ? { id: String(avant.clientId), branchId: avant.branchId as string | undefined }
      : voixDeLAppel ? { id: voixDeLAppel.id, branchId: voixDeLAppel.branchId || undefined } : undefined;

    const data: Record<string, unknown> = {
      ...avant,
      id,
      callId: a.callId,
      numero: a.numero,
      sens: a.sens,
      etat: a.etat,
      /* L HEURE DE LA SONNERIE NE SE POSE QU UNE FOIS : c est elle qui ancre
         toutes les durees. La garde de 0098 la protege ensuite. */
      sonneLe: avant.sonneLe ?? a.quand,
      clientId: tete?.id ?? avant.clientId,
      branchId: tete?.branchId ?? avant.branchId,
      ...(a.etat === 'pris' && !avant.prisLe ? { prisLe: a.quand } : {}),
      ...(a.etat === 'fini' || a.etat === 'manque' || a.etat === 'refuse'
        ? { finiLe: a.quand } : {}),
      ...(a.dureeS !== undefined ? { dureeS: a.dureeS } : {}),
      ...(a.detail ? { detail: a.detail } : {}),
    };
    const { error } = await sb.from('appels_wa').upsert({
      id, branch_id: (data.branchId as string) ?? null, data,
    }, { onConflict: 'id' });
    if (error) console.error(`whatsapp-webhook · APPEL · ${error.message}`);
  }
  if (appels.length) dis('appels rangés', { combien: appels.length });

  /* SANS TÂCHE DE FOND, l'automate s'attend ici, borné (8 s par appel) :
     un retard n'écrit jamais rien en double, une relivraison n'est jamais
     neuve. Avec elle, la liste est vide et Meta a sa réponse tout de suite. */
  if (automateEnCours.length > 0) await Promise.all(automateEnCours);

  return new Response(
    JSON.stringify({
      recus: entrants.length, accuses: accuses.length,
      reactions: reactions.length, appels: appels.length,
      pieces: pieces.size, version: VERSION,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
});
