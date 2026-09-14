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
   de fichier.

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
const VERSION = '2026-09-14-b · pièces jointes et sonde';

const FENETRE_MS = 24 * 60 * 60 * 1000;

/** LE POIDS QU'UNE PIÈCE PEUT FAIRE, en octets réels.

    Cinq mégaoctets : c'est le plafond de Meta pour une image, et c'est déjà
    beaucoup pour une facture ou un bilan, qui pèsent quelques dizaines de
    kilooctets. Le fichier arrive en base64, donc un tiers plus lourd sur le
    fil — la garde compte les octets RÉELS, pas la chaîne. */
const TAILLE_MAX = 5 * 1024 * 1024;

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
    }
    const phone = Deno.env.get('WA_PHONE_ID');
    const tok = Deno.env.get('WA_TOKEN');
    if (phone && tok) {
      try {
        const r = await fetch(
          `https://graph.facebook.com/v20.0/${phone}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,platform_type`,
          { headers: { authorization: `Bearer ${tok}` } },
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
  const clientId = corps.clientId ? String(corps.clientId) : undefined;
  const branchId = corps.branchId ? String(corps.branchId) : undefined;
  const parQui = corps.parQui ? String(corps.parQui).slice(0, 80) : undefined;

  /* LA PIÈCE JOINTE, quand il y en a une : `{ nom, type, donnees }`. */
  const piece = corps.piece && typeof corps.piece === 'object' ? corps.piece : null;
  const pieceNom = piece ? String(piece.nom ?? 'piece').slice(0, 120) : '';
  const pieceType = piece ? String(piece.type ?? 'application/octet-stream') : '';
  const pieceB64 = piece ? String(piece.donnees ?? '') : '';

  if (!numero) return refus('ce fil n’a pas de numéro lisible');
  if (!modele && !texte && !piece) return refus('le message est vide');
  /* UN MODÈLE NE PORTE PAS DE FICHIER — c'est la règle de Meta, pas la
     nôtre. Le dire ici évite un refus obscur de l'API. */
  if (modele && piece) return refus('un modèle approuvé ne peut pas porter de pièce jointe');

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

  const sb = createClient(urlBase, service);

  /* ── ② LA FENÊTRE, SUR LES DONNÉES DU MOMENT ──────────────────────
     Un modèle approuvé passe hors fenêtre : c'est tout son objet, et c'est
     aussi ce que Meta facture. Le texte libre et les pièces jointes, eux,
     exigent qu'ELLE ait écrit dans les 24 heures — jamais que NOUS ayons
     écrit : c'est la faute naturelle, et elle ferait refuser l'envoi sans
     qu'on comprenne. */
  if (!modele) {
    const depuis = new Date(Date.now() - FENETRE_MS).toISOString();
    const { data: entrants } = await sb.from('messages_wa').select('id')
      .eq('data->>numero', numero).eq('data->>sens', 'entrant')
      .gte('data->>quand', depuis).limit(1);
    if (!(entrants ?? []).length) {
      return refus(
        'La fenêtre de 24 heures est fermée. WhatsApp n’accepte plus qu’un modèle approuvé.',
        409,
      );
    }
  }

  /* ── ③ LE DÉPÔT DE LA PIÈCE CHEZ META ─────────────────────────────
     On dépose, Meta rend un identifiant, et c'est lui seul qu'on envoie.
     Aucune adresse n'existe : ni chez nous, ni chez eux, rien qu'un
     identifiant que l'API seule sait résoudre. */
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
      });
      const rep = await r.json().catch(() => ({}));
      if (!r.ok || !rep?.id) {
        return refus(String(rep?.error?.message ?? `dépôt refusé (HTTP ${r.status})`).slice(0, 300), 502);
      }
      mediaId = String(rep.id);
    } catch (e) {
      return refus(`le dépôt de la pièce a échoué : ${String(e).slice(0, 200)}`, 502);
    }
  }

  /* ── ④ L'ENVOI ────────────────────────────────────────────────────── */
  const famille = mediaId ? familleDuType(pieceType) : 'text';
  let charge: Record<string, unknown>;
  if (modele) {
    charge = {
      messaging_product: 'whatsapp', to: numero, type: 'template',
      template: {
        name: modele, language: { code: 'fr' },
        ...(variables.length
          ? { components: [{ type: 'body', parameters: variables.map((t) => ({ type: 'text', text: t })) }] }
          : {}),
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
  } else {
    charge = { messaging_product: 'whatsapp', to: numero, type: 'text', text: { body: texte } };
  }

  let waId = '';
  let etat = 'en-route';
  let detail: string | undefined;
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
      body: JSON.stringify(charge),
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
  const id = waId ? `wa-${waId}` : `wa-local-${crypto.randomUUID()}`;
  const quand = new Date().toISOString();
  const ditDansLeFil = modele
    ? (texte || `Modèle « ${modele} »`)
    : (mediaId ? (texte ? `${pieceNom} · ${texte}` : pieceNom) : texte);
  const { error: errTrace } = await sb.from('messages_wa').upsert({
    id,
    branch_id: branchId ?? null,
    data: {
      id, waId: waId || undefined, branchId, sens: 'sortant', numero, clientId,
      texte: ditDansLeFil,
      type: mediaId ? famille : 'text',
      quand, etat, detail, modele: modele || undefined, parQui,
      ...(mediaId ? { piece: { nom: pieceNom, type: pieceType, octets: octets?.length ?? 0 } } : {}),
    },
  }, { onConflict: 'id' });
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
