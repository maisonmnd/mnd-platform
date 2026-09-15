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

   Déploiement : Supabase → Edge Functions → New function « whatsapp-webhook »
   → coller CE FICHIER ENTIER → Deploy → décocher « Verify JWT ». Puis, chez
   Meta : WhatsApp Manager → Configuration → Webhooks → l'URL de la fonction
   et le jeton de vérification, et s'abonner au champ « messages ».
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

/** LA VERSION DE CE FICHIER, dite par le contrôle de santé. Sans elle on ne
    sait pas quel code tourne vraiment. À incrémenter à chaque déploiement. */
const VERSION = '2026-09-15-c · l équipe et les prestataires';

/** LE POIDS QU'UNE PIÈCE REÇUE PEUT FAIRE : le plafond du compartiment
    `whatsapp` (0102). Au-delà, le fichier reste chez Meta et le fil le dit. */
const TAILLE_MAX_PIECE = 16 * 1024 * 1024;

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
    });
    const meta = await r1.json().catch(() => ({}));
    if (!r1.ok || !meta?.url) {
      dis('pièce · Meta refuse l adresse', { statut: r1.status, motif: String(meta?.error?.message ?? '').slice(0, 120) });
      return null;
    }
    if (Number(meta.file_size ?? 0) > TAILLE_MAX_PIECE) return { tropLourde: true };
    const r2 = await fetch(String(meta.url), { headers: { authorization: `Bearer ${jeton}` } });
    if (!r2.ok) { dis('pièce · le fichier ne se lit pas', { statut: r2.status }); return null; }
    const octets = new Uint8Array(await r2.arrayBuffer());
    if (octets.length > TAILLE_MAX_PIECE) return { tropLourde: true };
    return { octets, mime: String(meta.mime_type ?? '').split(';')[0].trim() || 'application/octet-stream' };
  } catch (e) {
    dis('pièce · échec', { detail: String(e).slice(0, 160) });
    return null;
  }
}

/* ══ LES DEUX MESSAGES QUI PARTENT SEULS ═════════════════════════════
   Ils partent dans la fenêtre qu'elle vient d'ouvrir en écrivant, donc sans
   modèle. Chacun laisse une ligne dans le fil, comme tout ce que la Maison
   envoie, signée « Le Trône » — la direction voit ce qui est parti sans
   elle. JAMAIS DEUX FOIS EN VINGT-QUATRE HEURES pour un même numéro et un
   même motif : un prestataire qui envoie trois photos reçoit un seul merci. */
async function ditDepuisLeTrone(
  sb: ReturnType<typeof createClient>, jeton: string, phoneId: string,
  o: {
    numero: string; texte: string; auto: 'accuse' | 'formulaire' | 'transmis';
    branchId?: string; interactive?: Record<string, unknown>;
  },
): Promise<void> {
  const depuis = new Date(Date.now() - FENETRE_MS).toISOString();
  const { data: deja } = await sb.from('messages_wa').select('id')
    .eq('data->>numero', o.numero).eq('data->>sens', 'sortant').eq('data->>auto', o.auto)
    .gte('data->>quand', depuis).limit(1);
  if ((deja ?? []).length > 0) return;

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
    });
    const rep = await r.json().catch(() => ({}));
    if (r.ok && rep?.messages?.[0]?.id) waId = String(rep.messages[0].id);
    else { etat = 'non-remis'; detail = String(rep?.error?.message ?? `HTTP ${r.status}`).slice(0, 300); }
  } catch (e) {
    etat = 'non-remis';
    detail = String(e).slice(0, 300);
  }
  const id = waId ? `wa-${waId}` : `wa-local-${crypto.randomUUID()}`;
  const { error } = await sb.from('messages_wa').upsert({
    id, branch_id: o.branchId ?? null,
    data: {
      id, waId: waId || undefined, branchId: o.branchId, sens: 'sortant', numero: o.numero,
      texte: o.texte, type: o.interactive ? 'interactive' : 'text', quand: new Date().toISOString(),
      etat, detail, parQui: 'Le Trône', auto: o.auto,
    },
  }, { onConflict: 'id' });
  if (error) console.error(`whatsapp-webhook · AUTO · ${error.message}`);
  else dis('parti tout seul', { auto: o.auto, etat });
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
          { headers: { authorization: `Bearer ${jeton}` } },
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
          { headers: { authorization: `Bearer ${jeton}` } },
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
          { headers: { authorization: `Bearer ${tok}` } },
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
          { headers: { authorization: `Bearer ${tok}` } },
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

  /* ── ④ LES FICHES, POUR RATTACHER — une seule lecture.
     La Maison compte quelques centaines de têtes : on les lit toutes et l'on
     rapproche en mémoire. Le jour où elles seront dix mille, il faudra un
     index sur le numéro plutôt que ce balayage, et ce commentaire sera le
     rappel qu'on le savait. */
  let fiches: { id: string; branchId?: string; numeros: string[] }[] = [];
  if (entrants.length > 0) {
    const { data } = await sb.from('clients').select('id, data');
    fiches = (data ?? []).map((r: any) => ({
      id: r.id as string,
      branchId: r.data?.branchId,
      numeros: [numeroWa(r.data?.phone), numeroWa(r.data?.phone2)].filter(Boolean),
    }));
  }
  const teteDuNumero = (n: string) => fiches.find((f) => f.numeros.includes(n));

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
  if (entrants.length > 0) {
    const lignes = entrants.map((e) => {
      const tete = teteDuNumero(e.numero);
      const laTete = tetes.get(e.numero);
      const piece = pieces.get(e.waId);
      return {
        id: `wa-${e.waId}`,
        branch_id: tete?.branchId ?? laTete?.branchId ?? null,
        data: {
          id: `wa-${e.waId}`, waId: e.waId, branchId: tete?.branchId ?? laTete?.branchId,
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
    const { error } = await sb.from('messages_wa').upsert(lignes, { onConflict: 'id', ignoreDuplicates: true });
    if (error) console.error(`whatsapp-webhook · ÉCHEC ÉCRITURE · ${error.message}`);
    else {
      dis('messages rangés', {
        combien: lignes.length,
        rattaches: lignes.filter((l) => l.data.clientId).length,
        tiroirs: entrants.map((e) => tiroirDe(e.numero)),
      });
    }
  }

  /* ── ⑤ bis CE QU'UN BOUTON FAIT — 15 septembre 2026 ─────────────────
     « RECU:<versement> » : il dit avoir reçu l'argent. « PASENCORE:<versement> » :
     il dit ne pas l'avoir reçu, et le dossier le signale. Le bouton est une
     trace, pas une signature : la décharge reste à signer sur l'écran. */
  for (const e of entrants) {
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

  /* ── ⑤ ter LE FORMULAIRE DE CONGÉ — 15 septembre 2026 ───────────────
     Sa réponse devient une DEMANDE, à décider dans Temps & absences. Rien
     n'est accordé ici : le Trône transmet, la direction décide. Un même
     formulaire n'en fait jamais deux (identifiant dérivé du message). */
  for (const e of entrants) {
    if (!e.formulaire) continue;
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

  /* ── ⑥ LES ACCUSÉS. Ils corrigent DEUX journaux, et c'est voulu : les
     rappels automatiques vivent dans `envois`, les conversations dans
     `messages_wa`, et Meta ne sait pas lequel il vient de livrer. */
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
      }
    }
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
       Maison qui reconnait la personne. */
    const { data: fichesA } = avant.clientId ? { data: null } : await sb.from('clients').select('id, data');
    const tete = avant.clientId
      ? { id: String(avant.clientId), branchId: avant.branchId as string | undefined }
      : (fichesA ?? []).map((r: any) => ({
        id: r.id as string,
        branchId: r.data?.branchId as string | undefined,
        numeros: [numeroWa(r.data?.phone), numeroWa(r.data?.phone2)].filter(Boolean),
      })).find((f: any) => f.numeros.includes(a.numero));

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

  return new Response(
    JSON.stringify({
      recus: entrants.length, accuses: accuses.length,
      reactions: reactions.length, appels: appels.length,
      pieces: pieces.size, version: VERSION,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
});
