// whatsapp-envoi - la voix de la Maison dans une conversation.
//
// LA PREMIERE LIGNE EST VOLONTAIREMENT PAUVRE - 14 septembre 2026.
// Le deploiement a echoue une fois sur « Unexpected character '=' at
// index.ts:1:6 » : le « /* » d'ouverture s'etait perdu au collage, et le
// parseur a bute sur la ligne de decor qui suivait, sans rien dire d'utile.
// Un fichier qu'on colle a la main dans un navigateur doit commencer par
// quelque chose qui survit a un collage de travers. Le decor vient apres.

/* ═══════════════════════════════════════════════════════════════════
   WHATSAPP-ENVOI — la voix de la Maison dans une conversation.

   Maquette `public/maquette-les-conversations.html`, validée le 11 septembre
   2026. Le Trône peut enfin RÉPONDRE, et non plus seulement ouvrir un
   brouillon dans une autre application.

   POURQUOI UNE FONCTION, ET PAS UN APPEL DEPUIS LE NAVIGATEUR : le jeton
   permanent Meta autorise à écrire au nom de la Maison à n'importe quel
   numéro. Le poser dans un navigateur, c'est le publier. Il ne quitte jamais
   le serveur, et l'écran ne connaît que cette porte.

   ═══ LES PIÈCES JOINTES — 14 septembre 2026 ═══════════════════════
   « Comment aussi joindre des fichiers ? » (Yéman). Maquette
   `public/maquette-la-conversation-outillee.html`.

   RIEN DE PUBLIC — c'est la décision, et elle a un prix. WhatsApp accepte
   deux façons d'envoyer un fichier : lui donner une ADRESSE qu'il ira
   chercher, ou le lui DÉPOSER. La première est simple et laisse derrière
   elle une URL atteignable par quiconque la devine ou la retrouve dans un
   historique ; une facture, un bilan, la photo d'une cliente n'ont rien à
   faire au bout d'un lien public. On dépose donc, et l'on ne garde que
   l'identifiant que Meta rend. Le prix : le fichier TRAVERSE cette fonction,
   donc il est plafonné (voir `TAILLE_MAX`), là où un lien n'aurait rien
   coûté. C'est le bon prix.

   LE FICHIER NE TOUCHE JAMAIS LE COFFRE DE LA MAISON. Le ranger dans
   Supabase Storage pour le renvoyer ensuite recréerait exactement l'adresse
   qu'on refuse, et doublerait le stockage d'une pièce qui existe déjà.

   ═══ LA FENÊTRE DE 24 HEURES EST VÉRIFIÉE ICI AUSSI ═══════════════
   L'écran la tient déjà, et il a raison de la tenir : un refus se dit avant
   le clic. Mais un écran se contourne, se recharge avec un vieil état, ou
   garde une fenêtre ouverte à l'affichage pendant qu'elle s'est fermée à la
   seconde. Le serveur retranche donc la même règle, sur les données du moment.
   Deux gardes pour une règle, ce n'est pas une redite : l'une sert à
   RENSEIGNER, l'autre à EMPÊCHER. Une pièce jointe n'y échappe pas — hors
   fenêtre, Meta n'accepte qu'un modèle approuvé, et un modèle ne porte pas
   de fichier… sauf dans son EN-TÊTE (voir ci-dessous).

   ═══ L'ÉQUIPE ET LES PRESTATAIRES — 15 septembre 2026 ═══════════════
   Maquette `public/maquette-lequipe-sur-whatsapp.html`, validée.

   ① LA PORTE RÉSERVÉE. Un fil de l'équipe ou d'un prestataire ne se lit
      qu'à la direction (0102). Il ne s'ÉCRIT donc qu'à la direction : on
      demande à la base (`tiroir_du_numero`, puis `est_direction`) et l'on
      refuse le reste. Un compte du personnel qui taperait un numéro
      d'employée à la main écrirait dans un fil qu'il ne verra jamais.

   ② UN MODÈLE PEUT PORTER UN DOCUMENT, dans son en-tête — c'est ainsi que
      le bulletin de paie part hors fenêtre (`bulletin_du_mois`). La pièce
      se dépose chez Meta comme n'importe quelle autre, et son identifiant
      part dans le composant `header`. `enTete: 'document'` le demande.

   ③ DES BOUTONS DE RÉPONSE, trois au plus. Dans la fenêtre : un message
      interactif. Hors fenêtre : les réponses rapides d'un modèle, dont
      chaque bouton porte l'identifiant qu'on lui donne (`RECU:<versement>`),
      que le webhook lira. Le titre est ce qu'il lit ; l'identifiant ce que
      le Trône fait.

   ═══ LA MAISON RÉPOND SUR WHATSAPP · 9 octobre 2026 ═══════════════
   Décision de la direction : pour les clientes, `whatsapp-automate` parle de
   rendez-vous et pose le rendez-vous au toucher « Je confirme ». Il se tait
   dès que l'équipe parle. L'écran pose la main à la première lettre tapée ;
   CETTE PORTE EST LA SECONDE SÉCURITÉ : tout message que l'équipe envoie
   d'ici met le fil en pause (`pause_le_fil`, 0125), même si l'écran a perdu
   sa connexion, et même sur un fil que l'automate n'a jamais touché. Il ne
   coupe donc jamais une conversation humaine. La durée se lit en base
   (`automateWa.pauseHeures`, 24 h par défaut). La pause ne fait JAMAIS
   échouer l'envoi : sans 0125, le message part comme avant.

   AUCUN SECRET ICI :
     · WA_TOKEN, WA_PHONE_ID — l'API Meta (déjà posés pour les rappels).
     · CLE_SERVICE           — pour écrire dans `messages_wa`.
     · SUPABASE_ANON_KEY     — pour vérifier que l'appelant est du personnel.

   Déploiement : Supabase → Edge Functions → « whatsapp-envoi » → coller CE
   FICHIER ENTIER → Deploy. « Verify JWT » reste COCHÉ : seule une session
   ouverte du Trône doit pouvoir écrire au nom de la Maison.
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

/** LA VERSION DE CE FICHIER, dite par la sonde.

    Sans elle, on ne sait pas quel code tourne vraiment : une fonction
    déployée n'a pas de nom de branche, pas de commit, rien. Toute une soirée
    s'est perdue le 14 septembre à chercher dans le dépôt une panne qui venait
    d'une version plus ancienne restée en ligne. À incrémenter à chaque
    déploiement. */
const VERSION = '2026-10-10-a · Meta borne dans le temps, la fenetre sans le site, une cle d unicite';

const FENETRE_MS = 24 * 60 * 60 * 1000;

/* ══ META RÉPOND DANS LE TEMPS, OU PAS DU TOUT · 10 octobre 2026 ═══════
   Revue de code : aucun appel à Graph n'avait de borne. Un envoi qui pend
   n'écrivait ni sa trace ni la pause de l'automate, et l'écran recevait une
   erreur de réseau sans savoir si le message était parti. Dix secondes pour
   un message (la borne de `whatsapp-automate`), trente pour le dépôt d'une
   pièce qui peut peser cinq mégaoctets. Un délai dépassé tombe dans le
   `catch` existant : « non remis », sa raison, la trace, la pause. */
const DELAI_DE_META_MS = 10_000;
const DELAI_DU_DEPOT_MS = 30_000;

/** UNE CLÉ D'UNICITÉ, 120 signes au plus, devient un identifiant de ligne
    sûr : son empreinte SHA-256, tronquée. Deux clés différentes ne se
    rencontrent pas sur 128 bits ; la clé elle-même reste lisible dans `data`. */
const idDeLaCle = async (cle: string): Promise<string> => {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cle)));
  return `wa-cle-${[...h.slice(0, 16)].map((o) => o.toString(16).padStart(2, '0')).join('')}`;
};
/** Une réservation sans réponse de Meta depuis plus longtemps que ceci est
    abandonnée (la fonction est morte entre les deux) : on peut la reprendre. */
const RESERVATION_ABANDONNEE_MS = 5 * 60 * 1000;

/** LE POIDS QU'UNE PIÈCE PEUT FAIRE, en octets réels.

    Cinq mégaoctets : c'est le plafond de Meta pour une image, et c'est déjà
    beaucoup pour une facture ou un bilan, qui pèsent quelques dizaines de
    kilooctets. Le fichier arrive en base64, donc un tiers plus lourd sur le
    fil — la garde compte les octets RÉELS, pas la chaîne. */
const TAILLE_MAX = 5 * 1024 * 1024;

/** Trois boutons, vingt signes chacun : c'est la règle de WhatsApp. */
const BOUTONS_MAX = 3;
const TITRE_MAX = 20;

/** CE QUE WHATSAPP SAIT MONTRER, et sous quel nom il faut le lui annoncer.
    Un type inconnu part en `document` : il s'affichera comme une pièce à
    télécharger, ce qui est toujours vrai et jamais faux. */
const familleDuType = (mime: string): 'image' | 'video' | 'audio' | 'document' => {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'document';
};

/** Numéro → format Meta. MÊME RÈGLE que `numeroWa` (shared/conversations.ts)
    et que le webhook, recopiée : une fonction Edge n'importe rien du dépôt. */
const numeroWa = (brut: string | undefined): string => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};

/* ══ LE NAVIGATEUR DEMANDE LA PERMISSION AVANT DE PARLER ═════════════
   14 septembre 2026, au soir. « Failed to send a request to the Edge
   Function » (Yéman), et la base ne portait AUCUNE ligne sortante depuis le
   premier jour. La cause tenait en trois lignes absentes.

   LE TRÔNE VIT SUR maisonmnd.github.io, LA FONCTION SUR supabase.co : ce sont
   deux origines. Avant d'envoyer un POST qui porte un en-tête `authorization`
   et du JSON, le navigateur envoie d'abord un OPTIONS pour demander la
   permission. Cette fonction répondait « POST seulement », sans en-tête
   d'autorisation d'origine : la permission était refusée, et le vrai POST
   n'est JAMAIS parti. Ni erreur côté serveur, ni ligne en base, ni message
   chez la cliente — rien, parce que rien n'avait quitté le navigateur.

   ELLE ÉTAIT LA SEULE À LES OUBLIER. `suggest-client`, `push-notify` et
   `kkiapay-verify`, toutes appelées depuis le navigateur elles aussi, les
   portent depuis toujours. C'est pour cela qu'elles marchent.

   ET CHAQUE RÉPONSE LES PORTE, y compris les REFUS. Sans elles sur un 400, le
   navigateur interdit de LIRE le corps : la phrase « la fenêtre de 24 heures
   est fermée » existerait, partirait, et resterait illisible. Un refus qu'on
   ne peut pas lire ne vaut pas mieux qu'un silence. */
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const refus = (texte: string, code = 400) =>
  new Response(JSON.stringify({ erreur: texte }), {
    status: code, headers: { ...CORS, 'content-type': 'application/json' },
  });

/** Le base64 d'une pièce, avec ou sans son en-tête `data:`. */
const enOctets = (b64: string): Uint8Array => {
  const nu = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
  const brut = atob(nu);
  const out = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i += 1) out[i] = brut.charCodeAt(i);
  return out;
};

Deno.serve(async (req) => {
  /* La demande de permission du navigateur. Elle passe AVANT tout le reste :
     elle ne porte ni jeton ni corps, et la juger comme un envoi la refuserait. */
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  /* ══ LA SONDE — 14 septembre 2026, au soir ═══════════════════════════
     « Ça dit message envoyé mais rien ne va sur le téléphone du client »
     (Yéman), et la base ne portait AUCUNE ligne sortante : ni refus, ni
     trace. Deux pannes se ressemblent alors, et il a fallu deviner.

     Une sonde tranche en une seconde : elle dit quelle version est déployée,
     si la clé de service sait vraiment écrire dans `messages_wa`, et ce que
     Meta répond sur le numéro. ELLE N'ENVOIE RIEN et ne montre AUCUN SECRET —
     on ne voit que des oui et des non.

     Ouvrir : `…/functions/v1/whatsapp-envoi?sonde=1` dans un navigateur. */
  if (req.method === 'GET' && new URL(req.url).searchParams.has('sonde')) {
    const u = Deno.env.get('SUPABASE_URL') ?? '';
    const cle = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
    const rapport: Record<string, unknown> = {
      version: VERSION,
      urlDeLaBase: !!u,
      cleDeService: cle ? `posée (${cle.length} signes)` : 'ABSENTE',
      jetonMeta: Deno.env.get('WA_TOKEN') ? 'posé' : 'ABSENT',
      numeroMeta: Deno.env.get('WA_PHONE_ID') ? 'posé' : 'ABSENT',
    };
    if (u && cle) {
      /* ON ÉCRIT VRAIMENT, puis on efface : une clé qui a l'air bonne et une
         clé qui écrit ne sont pas la même chose, et c'est précisément la
         différence qui a coûté cette soirée. */
      const sonde = createClient(u, cle);
      const id = `wa-sonde-${crypto.randomUUID()}`;
      const { error: errEcrit } = await sonde.from('messages_wa').upsert({
        id, branch_id: null, data: { id, sens: 'sonde', numero: '', texte: 'sonde', quand: new Date().toISOString() },
      }, { onConflict: 'id' });
      rapport.ecritureDansMessagesWa = errEcrit ? `REFUSÉE : ${errEcrit.message}` : 'elle passe';
      if (!errEcrit) await sonde.from('messages_wa').delete().eq('id', id);
      /* LA PORTE DE 0102 EST-ELLE POSÉE ? Sans elle, un fil d'employée se
         lirait par tout le personnel. */
      const { error: errTiroir } = await sonde.rpc('tiroir_du_numero', { n: '0' });
      rapport.migration0102 = errTiroir ? `ABSENTE : ${errTiroir.message}` : 'posée';
      /* LA PAUSE DE L'AUTOMATE (0125). Un numéro trop court ne pose rien :
         `pause_le_fil` rend null sans écrire, la sonde reste muette. */
      const { error: errPause } = await sonde.rpc('pause_le_fil', { p_numero: '0', p_par: null, p_motif: 'sonde' });
      rapport.migration0125 = errPause ? `ABSENTE : ${errPause.message}` : 'posée';
    }
    const phone = Deno.env.get('WA_PHONE_ID');
    const tok = Deno.env.get('WA_TOKEN');
    if (phone && tok) {
      try {
        const r = await fetch(
          `https://graph.facebook.com/v20.0/${phone}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,platform_type`,
          { headers: { authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(DELAI_DE_META_MS) },
        );
        const rep = await r.json().catch(() => ({}));
        rapport.ceNumeroChezMeta = r.ok
          ? {
            /* Les quatre derniers chiffres suffisent à le reconnaître sans
               l'écrire en entier dans une page que l'on collera ailleurs. */
            finDuNumero: String(rep.display_phone_number ?? '').slice(-4),
            nom: rep.verified_name,
            qualite: rep.quality_rating,
            verification: rep.code_verification_status,
            genre: rep.platform_type,
            aLire: rep.platform_type === 'NOT_APPLICABLE'
              ? 'genre inconnu — vérifiez que ce n’est pas le numéro de TEST'
              : 'CLOUD_API attendu ; un numéro de test ne livre qu’à une liste blanche',
          }
          : { refusDeMeta: String(rep?.error?.message ?? `HTTP ${r.status}`) };
      } catch (e) {
        rapport.ceNumeroChezMeta = { erreur: String(e).slice(0, 200) };
      }
    }
    return new Response(JSON.stringify(rapport, null, 2), {
      status: 200, headers: { ...CORS, 'content-type': 'application/json' },
    });
  }

  if (req.method !== 'POST') return refus('POST seulement', 405);

  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  if (!urlBase || !service) return refus('la fonction n’est pas configurée', 500);
  if (!WA_TOKEN || !WA_PHONE_ID) return refus('les clés Meta ne sont pas posées', 500);

  /* ── ① SEUL LE PERSONNEL PARLE AU NOM DE LA MAISON ────────────────
     On ne se fie pas au JWT présenté : on demande à la base ce qu'elle en
     pense (`is_staff`, sécurité définie, la même que toutes les politiques).
     Un jeton d'une cliente de Ma Couronne est un jeton valide — il ne donne
     pas le droit d'écrire aux autres clientes. */
  const jeton = req.headers.get('authorization') ?? '';
  if (!jeton.toLowerCase().startsWith('bearer ')) return refus('session requise', 401);
  const commeAppelant = createClient(urlBase, anon, {
    global: { headers: { authorization: jeton } },
  });
  const { data: estPersonnel, error: errStaff } = await commeAppelant.rpc('is_staff');
  if (errStaff || estPersonnel !== true) return refus('réservé au personnel', 403);

  let corps: Record<string, any> = {};
  try { corps = await req.json(); } catch { return refus('corps illisible'); }

  const numero = numeroWa(String(corps.numero ?? ''));
  const texte = String(corps.texte ?? '').trim();
  const modele = corps.modele ? String(corps.modele) : '';
  const variables: string[] = Array.isArray(corps.variables) ? corps.variables.map(String) : [];
  /* LE BOUTON À URL DYNAMIQUE — 28 septembre 2026, modèle `reservation_preparee`.
     Meta ajoute ce mot à l'URL fixe du bouton (https://maisonmnd.com/reserver/?r=).
     Un seul mot, fait de caractères qu'aucune adresse ne réécrit ; tout autre
     chose est refusé plutôt que d'envoyer un lien cassé. */
  const boutonUrl = corps.boutonUrl ? String(corps.boutonUrl) : '';
  if (boutonUrl && !/^[A-Za-z0-9._~-]{1,500}$/.test(boutonUrl)) return refus('le paramètre du bouton n’a pas la forme attendue');
  const clientId = corps.clientId ? String(corps.clientId) : undefined;
  const branchId = corps.branchId ? String(corps.branchId) : undefined;
  const parQui = corps.parQui ? String(corps.parQui).slice(0, 80) : undefined;
  /** LA CLÉ D'UNICITÉ (10 octobre 2026, revue de code) : un message que deux
      postes peuvent calculer au même instant (le merci d'une ambassadrice)
      la porte, et il ne part qu'une fois. Sans elle, rien ne change. */
  const cleUnique = corps.cleUnique ? String(corps.cleUnique).slice(0, 120) : '';
  /** Le modèle porte un document en en-tête (le bulletin de paie). */
  /* 28 septembre 2026 : l'en-tête peut aussi être une IMAGE (la carte de
     marraine du modèle `parrainage_merci`). */
  const enTete = corps.enTete === 'document' ? 'document' : corps.enTete === 'image' ? 'image' : '';
  /** Les boutons de réponse : `{ id, titre }`, trois au plus. */
  const boutons: { id: string; titre: string }[] = Array.isArray(corps.boutons)
    ? corps.boutons
      .map((b: any) => ({ id: String(b?.id ?? '').slice(0, 200), titre: String(b?.titre ?? '').trim().slice(0, TITRE_MAX) }))
      .filter((b: { id: string; titre: string }) => b.id && b.titre)
      .slice(0, BOUTONS_MAX)
    : [];

  /* ── LES TROIS GESTES DU FIL — 14 septembre 2026 ───────────────────
     Citer, reagir, dire qu on a lu. Ce sont les seuls que l API donne en
     plus d envoyer : elle ne sait ni editer ni effacer. */
  /** Le message que celui-ci cite. WhatsApp l appelle un « contexte ». */
  const citeWaId = corps.citeWaId ? String(corps.citeWaId) : '';
  /** Poser une reaction : `{ surWaId, emoji }`. Un emoji vide la retire —
      c est ainsi que Meta l entend, et c est aussi ainsi qu il l annonce. */
  const reaction = corps.reaction && typeof corps.reaction === 'object'
    ? { surWaId: String(corps.reaction.surWaId ?? ''), emoji: String(corps.reaction.emoji ?? '') }
    : null;
  /** Dire a Meta qu on a lu ce message entrant : les deux coches bleues. */
  const marquerLu = corps.marquerLu ? String(corps.marquerLu) : '';

  /* LA PIÈCE JOINTE, quand il y en a une : `{ nom, type, donnees }`. */
  const piece = corps.piece && typeof corps.piece === 'object' ? corps.piece : null;
  const pieceNom = piece ? String(piece.nom ?? 'piece').slice(0, 120) : '';
  const pieceType = piece ? String(piece.type ?? 'application/octet-stream') : '';
  const pieceB64 = piece ? String(piece.donnees ?? '') : '';

  const sb0 = createClient(urlBase, service);

  /* ══ MARQUER LU — ni un envoi, ni une fenetre a respecter ══════════
     Dire qu on a lu ne compte pas comme un message : Meta ne le facture pas
     et la fenetre de 24 heures ne s y applique pas. On sort donc avant tout
     le reste, et l on ne pose aucune ligne dans le fil — un accuse de lecture
     n est pas une parole. */
  if (marquerLu) {
    try {
      const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: marquerLu }),
        signal: AbortSignal.timeout(DELAI_DE_META_MS),
      });
      const rep = await r.json().catch(() => ({}));
      if (!r.ok) return refus(String(rep?.error?.message ?? `HTTP ${r.status}`).slice(0, 300), 502);
    } catch (e) {
      return refus(String(e).slice(0, 200), 502);
    }
    /* ON L INSCRIT SUR LE MESSAGE LU, pour ne pas le redire a chaque
       ouverture du fil : Meta compte les appels, et un accuse repete
       n apprend rien de plus a la cliente. */
    const { data: l } = await sb0.from('messages_wa').select('id, data')
      .eq('data->>waId', marquerLu).limit(1);
    const ligne = (l ?? [])[0] as { id: string; data: Record<string, unknown> } | undefined;
    if (ligne) {
      await sb0.from('messages_wa').update({
        data: { ...ligne.data, luParLaMaisonLe: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }).eq('id', ligne.id);
    }
    return new Response(JSON.stringify({ lu: marquerLu, version: VERSION }), {
      status: 200, headers: { ...CORS, 'content-type': 'application/json' },
    });
  }

  if (!numero) return refus('ce fil n’a pas de numéro lisible');

  /* ── ① bis LA PORTE RÉSERVÉE — 15 septembre 2026 ───────────────────
     Un fil de l'équipe ou d'un prestataire ne s'écrit qu'à la direction,
     parce qu'il ne se lit qu'à elle (0102). La base juge le numéro, puis
     le compte ; cette fonction ne fait que relayer ses deux réponses.
     Sans 0102 (la fonction n'existe pas), on continue comme avant : mieux
     vaut une Maison qui parle qu'une Maison muette par prudence. */
  {
    const { data: tiroir, error: errTiroir } = await commeAppelant.rpc('tiroir_du_numero', { n: numero });
    if (!errTiroir && tiroir && tiroir !== 'clientes') {
      const { data: estDirection } = await commeAppelant.rpc('est_direction');
      if (estDirection !== true) {
        return refus('Ce fil est réservé à la direction : c’est un numéro de l’équipe ou d’un prestataire.', 403);
      }
    }
  }

  /* ══ UNE REACTION — un geste, pas un message ═══════════════════════
     Elle ne rouvre pas la fenetre de 24 heures et ne se facture pas. Elle ne
     fait pas non plus de ligne dans le fil : elle se pose SUR le message
     qu elle vise, comme dans WhatsApp. */
  if (reaction) {
    if (!reaction.surWaId) return refus('une réaction vise un message : lequel ?');
    try {
      const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp', recipient_type: 'individual', to: numero,
          type: 'reaction',
          reaction: { message_id: reaction.surWaId, emoji: reaction.emoji },
        }),
        signal: AbortSignal.timeout(DELAI_DE_META_MS),
      });
      const rep = await r.json().catch(() => ({}));
      if (!r.ok) return refus(String(rep?.error?.message ?? `HTTP ${r.status}`).slice(0, 300), 502);
    } catch (e) {
      return refus(String(e).slice(0, 200), 502);
    }
    const { data: l } = await sb0.from('messages_wa').select('id, data')
      .eq('data->>waId', reaction.surWaId).limit(1);
    const ligne = (l ?? [])[0] as { id: string; data: Record<string, unknown> } | undefined;
    if (ligne) {
      /* UNE SEULE REACTION PAR PERSONNE : WhatsApp remplace la precedente, et
         garder les deux ferait mentir le fil. */
      const avant = (ligne.data.reactions ?? []) as { par: string }[];
      const sansLaNotre = avant.filter((x) => x.par !== 'nous');
      const apres = reaction.emoji
        ? [...sansLaNotre, { par: 'nous', emoji: reaction.emoji, quand: new Date().toISOString() }]
        : sansLaNotre;
      await sb0.from('messages_wa').update({
        data: { ...ligne.data, reactions: apres },
        updated_at: new Date().toISOString(),
      }).eq('id', ligne.id);
    }
    return new Response(JSON.stringify({ reaction: reaction.emoji || 'retirée', version: VERSION }), {
      status: 200, headers: { ...CORS, 'content-type': 'application/json' },
    });
  }

  if (!modele && !texte && !piece) return refus('le message est vide');
  /* UN MODÈLE NE PORTE PAS DE FICHIER — c'est la règle de Meta, pas la
     nôtre… sauf dans son EN-TÊTE, quand il a été approuvé avec (le
     bulletin). Le dire ici évite un refus obscur de l'API. */
  if (modele && piece && !enTete) return refus('un modèle approuvé ne peut pas porter de pièce jointe, sauf en en-tête (enTete: document ou image)');
  if (modele && enTete && !piece) return refus('ce modèle attend une pièce en en-tête, et elle manque');
  if (!modele && boutons.length > 0 && !texte) return refus('des boutons accompagnent un texte : lequel ?');
  if (!modele && boutons.length > 0 && piece) return refus('des boutons ne s’ajoutent pas à une pièce jointe');

  let octets: Uint8Array | null = null;
  if (piece) {
    if (!pieceB64) return refus('la pièce jointe est vide');
    try { octets = enOctets(pieceB64); } catch { return refus('la pièce jointe est illisible'); }
    if (octets.length > TAILLE_MAX) {
      return refus(
        `Cette pièce pèse ${Math.round(octets.length / 1024 / 102.4) / 10} Mo. La Maison n’envoie rien par un lien public, donc le fichier passe par le serveur : au-delà de 5 Mo, allégez-le d’abord.`,
        413,
      );
    }
  }

  const sb = sb0;

  /* ── ② LA FENÊTRE, SUR LES DONNÉES DU MOMENT ──────────────────────
     Un modèle approuvé passe hors fenêtre : c'est tout son objet, et c'est
     aussi ce que Meta facture. Le texte libre et les pièces jointes, eux,
     exigent qu'ELLE ait écrit dans les 24 heures — jamais que NOUS ayons
     écrit : c'est la faute naturelle, et elle ferait refuser l'envoi sans
     qu'on comprenne.

     UNE DEMANDE DU SITE N'OUVRE RIEN (10 octobre 2026, revue de code).
     `demande-submit` range la demande du site dans son fil, sens « entrant »,
     `canal: 'site'` : Meta ne l'a jamais vue, la fenêtre reste fermée.
     L'écran le savait (`fenetreDe`), pas cette garde ; un envoi gardé hors
     ligne puis rejoué passait, Meta le refusait, et la pause coupait quand
     même l'automate. `canal` absent est un vrai message WhatsApp : le
     `is.null` le garde, car en SQL `null <> 'site'` n'est pas vrai. */
  if (!modele) {
    const depuis = new Date(Date.now() - FENETRE_MS).toISOString();
    const { data: entrants } = await sb.from('messages_wa').select('id')
      .eq('data->>numero', numero).eq('data->>sens', 'entrant')
      .or('data->>canal.is.null,data->>canal.neq.site')
      .gte('data->>quand', depuis).limit(1);
    if (!(entrants ?? []).length) {
      return refus(
        'La fenêtre de 24 heures est fermée. WhatsApp n’accepte plus qu’un modèle approuvé.',
        409,
      );
    }
  }

  /* ── ② bis LA CLÉ D'UNICITÉ SE RÉSERVE AVANT DE PARLER · 10 octobre 2026 ──
     Revue de code (constat 79) : le merci d'une ambassadrice se calcule sur
     chaque poste ouvert, et deux postes l'envoyaient deux fois. Une lecture
     puis un envoi laisseraient passer deux appels simultanés ; on écrit donc
     d'abord une ligne à identifiant DÉRIVÉ de la clé (`ignoreDuplicates` +
     `.select` ne la rend qu'à qui l'a vraiment écrite). Celui qui la trouve
     déjà prise rend `deja: true`, l'identifiant existant, et n'envoie rien.
     Seule une tentative refusée par Meta (« non remis ») ou abandonnée en
     route (`RESERVATION_ABANDONNEE_MS`, aucune réponse de Meta) se reprend,
     et par une mise à jour CONDITIONNELLE sur l'état et l'instant lus :
     deux reprises simultanées, une seule passe. La ligne réservée devient
     la trace, complétée après la réponse de Meta (l'accusé la retrouve par
     `waId`). Aucune migration n'est nécessaire : la clé primaire suffit. */
  let idReserve = '';
  let reservation: Record<string, unknown> | null = null;
  const relacheLaCle = async (pourquoi: string) => {
    if (!idReserve || !reservation) return;
    await sb.from('messages_wa').update({
      data: { ...reservation, etat: 'non-remis', detail: pourquoi.slice(0, 300) },
      updated_at: new Date().toISOString(),
    }).eq('id', idReserve);
  };
  if (cleUnique) {
    idReserve = await idDeLaCle(cleUnique);
    const quandReserve = new Date().toISOString();
    reservation = {
      id: idReserve, branchId, sens: 'sortant', numero, clientId,
      texte: texte || (modele ? `Modèle « ${modele} »` : pieceNom),
      type: 'text', quand: quandReserve, etat: 'en-route', modele: modele || undefined, parQui, cleUnique,
    };
    const deja = (avant: { waId?: string; quand?: string }) => new Response(JSON.stringify({
      id: idReserve, waId: avant.waId, quand: avant.quand, deja: true, version: VERSION,
    }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
    const { data: prise, error: errPrise } = await sb.from('messages_wa')
      .upsert({ id: idReserve, branch_id: branchId ?? null, data: reservation }, { onConflict: 'id', ignoreDuplicates: true })
      .select('id');
    if (errPrise) return refus(`la clé d’unicité n’a pas pu être réservée : ${errPrise.message}`.slice(0, 300), 500);
    if (!(prise ?? []).length) {
      const { data: l } = await sb.from('messages_wa').select('id, data').eq('id', idReserve).limit(1);
      const avant = (((l ?? [])[0] as { data?: Record<string, unknown> } | undefined)?.data ?? {}) as { waId?: string; etat?: string; quand?: string };
      const depuis = Date.parse(String(avant.quand ?? ''));
      const reprenable = avant.etat === 'non-remis'
        || (!avant.waId && avant.etat === 'en-route' && Number.isFinite(depuis) && Date.now() - depuis > RESERVATION_ABANDONNEE_MS);
      if (!reprenable) return deja(avant);
      const { data: reprise } = await sb.from('messages_wa').update({ data: reservation, updated_at: quandReserve })
        .eq('id', idReserve).eq('data->>etat', String(avant.etat)).eq('data->>quand', String(avant.quand))
        .select('id');
      if (!(reprise ?? []).length) return deja(avant);
    }
  }

  /* ── ③ LE DÉPÔT DE LA PIÈCE CHEZ META ─────────────────────────────
     On dépose, Meta rend un identifiant, et c'est lui seul qu'on envoie.
     Aucune adresse n'existe : ni chez nous, ni chez eux, rien qu'un
     identifiant que l'API seule sait résoudre. Un dépôt raté rend la clé
     d'unicité (« non remis ») : rien n'est parti, on pourra réessayer. */
  let mediaId = '';
  if (octets) {
    try {
      const fd = new FormData();
      fd.append('messaging_product', 'whatsapp');
      fd.append('type', pieceType);
      fd.append('file', new Blob([octets], { type: pieceType }), pieceNom);
      const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/media`, {
        method: 'POST',
        headers: { authorization: `Bearer ${WA_TOKEN}` },
        body: fd,
        signal: AbortSignal.timeout(DELAI_DU_DEPOT_MS),
      });
      const rep = await r.json().catch(() => ({}));
      if (!r.ok || !rep?.id) {
        const motif = String(rep?.error?.message ?? `dépôt refusé (HTTP ${r.status})`).slice(0, 300);
        await relacheLaCle(motif);
        return refus(motif, 502);
      }
      mediaId = String(rep.id);
    } catch (e) {
      const motif = `le dépôt de la pièce a échoué : ${String(e).slice(0, 200)}`;
      await relacheLaCle(motif);
      return refus(motif, 502);
    }
  }

  /* ── ④ L'ENVOI ────────────────────────────────────────────────────── */
  const famille = mediaId ? familleDuType(pieceType) : 'text';
  let charge: Record<string, unknown>;
  if (modele) {
    /* LES COMPOSANTS D'UN MODÈLE, dans l'ordre où Meta les attend : l'en-tête
       (le document), le corps (ses variables), puis chaque bouton de réponse
       rapide avec l'identifiant qu'il portera en revenant. */
    const composants: Record<string, unknown>[] = [];
    if (enTete && mediaId) {
      composants.push({
        type: 'header',
        parameters: [enTete === 'image'
          ? { type: 'image', image: { id: mediaId } }
          : { type: 'document', document: { id: mediaId, filename: pieceNom } }],
      });
    }
    if (variables.length) {
      composants.push({ type: 'body', parameters: variables.map((t) => ({ type: 'text', text: t })) });
    }
    if (boutonUrl) {
      composants.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: boutonUrl }] });
    }
    boutons.forEach((b, i) => {
      composants.push({
        type: 'button', sub_type: 'quick_reply', index: String(i),
        parameters: [{ type: 'payload', payload: b.id }],
      });
    });
    charge = {
      messaging_product: 'whatsapp', to: numero, type: 'template',
      template: {
        name: modele, language: { code: 'fr' },
        ...(composants.length ? { components: composants } : {}),
      },
    };
  } else if (mediaId) {
    /* LA LÉGENDE VOYAGE AVEC LA PIÈCE quand le type l'accepte. Un document
       porte en plus son NOM : sans lui, la cliente reçoit un fichier qui
       s'appelle comme un identifiant, et ne sait pas ce qu'elle ouvre. */
    const corpsMedia: Record<string, unknown> = { id: mediaId };
    if (famille === 'document') corpsMedia.filename = pieceNom;
    if (texte && famille !== 'audio') corpsMedia.caption = texte;
    charge = { messaging_product: 'whatsapp', to: numero, type: famille, [famille]: corpsMedia };
  } else if (boutons.length > 0) {
    /* UN MESSAGE À BOUTONS, dans la fenêtre : WhatsApp les dessine sous le
       texte, et rend l'identifiant du bouton touché. */
    charge = {
      messaging_product: 'whatsapp', to: numero, type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: texte },
        action: { buttons: boutons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.titre } })) },
      },
    };
  } else {
    charge = { messaging_product: 'whatsapp', to: numero, type: 'text', text: { body: texte } };
  }

  /* LA CITATION SE POSE SUR N IMPORTE QUEL MESSAGE, texte comme piece jointe.
     C est le seul moyen que l API donne de DESIGNER un message precis, et
     c est ce qui rend une reponse lisible quand elle a pose trois questions
     d affilee. Un modele approuve, lui, ne cite rien : Meta ne l accepte pas. */
  if (citeWaId && !modele) charge.context = { message_id: citeWaId };

  let waId = '';
  let etat = 'en-route';
  let detail: string | undefined;
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
      body: JSON.stringify(charge),
      signal: AbortSignal.timeout(DELAI_DE_META_MS),
    });
    const rep = await r.json().catch(() => ({}));
    if (r.ok && rep?.messages?.[0]?.id) {
      waId = String(rep.messages[0].id);
    } else {
      etat = 'non-remis';
      /* CE QUE META REFUSE, DIT EN ENTIER (tronqué à 300 signes). Un « échec »
         sans sa raison se cherche pendant des semaines : la Maison a déjà
         payé cette leçon sur le cron du soir. */
      detail = String(rep?.error?.message ?? `HTTP ${r.status}`).slice(0, 300);
    }
  } catch (e) {
    etat = 'non-remis';
    detail = String(e).slice(0, 300);
  }

  /* ── ⑤ ON GARDE TRACE, MÊME D'UN RATÉ ────────────────────────────
     Un message refusé qui ne laisserait rien derrière lui ferait croire qu'on
     n'a jamais écrit, et l'on réécrirait la même chose. L'identifiant se
     déduit de celui de Meta quand il existe, pour que l'accusé du webhook
     retrouve sa ligne.

     LE FIL GARDE CE QUI A ÉTÉ MONTRÉ, ET QUAND. On n'y range PAS le fichier
     — seulement son nom et son genre. Une base qui porterait les pièces
     jointes en base64 referait la faute des photos de fiches du 29 août :
     deux mégaoctets redescendus à chaque ouverture, sur chaque poste. */
  /* Une clé d'unicité garde SA ligne, réservée plus haut : c'est elle qui
     tient la porte au prochain envoi de la même clé. */
  const id = idReserve || (waId ? `wa-${waId}` : `wa-local-${crypto.randomUUID()}`);
  const quand = new Date().toISOString();
  const ditDansLeFil = modele
    ? (texte || `Modèle « ${modele} »${mediaId ? ` · ${pieceNom}` : ''}`)
    : (mediaId ? (texte ? `${pieceNom} · ${texte}` : pieceNom) : texte);
  const { error: errTrace } = await sb.from('messages_wa').upsert({
    id,
    branch_id: branchId ?? null,
    data: {
      id, waId: waId || undefined, branchId, sens: 'sortant', numero, clientId,
      texte: ditDansLeFil,
      type: mediaId && !modele ? famille : (boutons.length && !modele ? 'interactive' : 'text'),
      quand, etat, detail, modele: modele || undefined, parQui,
      ...(cleUnique ? { cleUnique } : {}),
      ...(mediaId ? { piece: { nom: pieceNom, type: pieceType, octets: octets?.length ?? 0 } } : {}),
      ...(boutons.length ? { boutons } : {}),
    },
  }, { onConflict: 'id' });

  /* ── ⑤ bis L'ÉQUIPE A PARLÉ : L'AUTOMATE SE TAIT · 9 octobre 2026 ────
     Après la trace, et même si elle a raté ou si Meta a refusé : la Maison a
     voulu parler, c'est elle qui tient le fil. `pause_le_fil` (0125) pose la
     ligne `main-<numéro>` pour `automateWa.pauseHeures`, et `avance_le_fil`
     refuse ensuite d'écrire : un tour de l'automate déjà lancé se tait. Une
     pause impossible (0125 absente, base lente) ne fait JAMAIS échouer
     l'envoi : elle se dit au journal, sans numéro. */
  try {
    const { error: errPause } = await sb.rpc('pause_le_fil', {
      p_numero: numero, p_par: parQui ?? null, p_motif: 'envoi-equipe',
    });
    if (errPause) console.error('whatsapp-envoi: pause de l automate', errPause.message.slice(0, 160));
  } catch (e) {
    console.error('whatsapp-envoi: pause de l automate', String(e).slice(0, 160));
  }

  /* ══ ON NE DIT JAMAIS « ENVOYÉ » SANS AVOIR CONSIGNÉ ═══════════════
     14 septembre 2026, au soir. La trace ratée partait en `console.error`
     et la fonction répondait 200 : l'écran annonçait « Message envoyé », la
     base ne portait rien, et la cliente ne recevait rien. Trois vérités
     contradictoires, aucune visible.

     UN MESSAGE QUE LA MAISON NE SE RAPPELLE PAS SERA RENVOYÉ. Et surtout, une
     écriture refusée ici veut presque toujours dire que la clé de service
     n'en est pas une — donc que rien d'autre non plus ne marche. Le taire
     était la faute. */
  if (errTrace) {
    console.error('whatsapp-envoi: trace', errTrace.message);
    return new Response(JSON.stringify({
      erreur: `Le message est parti chez WhatsApp, mais la Maison n’a pas pu en garder la trace : ${errTrace.message}. Vérifiez la clé de service de la fonction.`,
      waId, version: VERSION,
    }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
  }

  if (etat === 'non-remis') {
    return new Response(JSON.stringify({ erreur: detail ?? 'refusé par WhatsApp', id }), {
      status: 502, headers: { ...CORS, 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ id, waId, quand, version: VERSION, piece: mediaId ? famille : undefined }), {
    status: 200, headers: { ...CORS, 'content-type': 'application/json' },
  });
});
