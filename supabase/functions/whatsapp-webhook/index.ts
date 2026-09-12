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

   Déploiement : Supabase → Edge Functions → New function « whatsapp-webhook »
   → coller CE FICHIER ENTIER → Deploy → décocher « Verify JWT ». Puis, chez
   Meta : WhatsApp Manager → Configuration → Webhooks → l'URL de la fonction
   et le jeton de vérification, et s'abonner au champ « messages ».
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

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

/** Le texte d'un message, quel que soit son habit. Une image, un audio, un
    contact n'ont pas de texte : on garde la LÉGENDE si elle existe, sinon on
    nomme le genre. Afficher un blanc laisserait croire à un message vide, et
    l'on répondrait à côté. */
const texteDuMessage = (m: Record<string, any>): string => {
  const t = m.type as string | undefined;
  if (t === 'text') return String(m.text?.body ?? '');
  if (t === 'button') return String(m.button?.text ?? '');
  if (t === 'interactive') {
    return String(m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '');
  }
  const legende = m.image?.caption ?? m.video?.caption ?? m.document?.caption;
  if (legende) return String(legende);
  const NOMS: Record<string, string> = {
    image: 'une photo', video: 'une vidéo', audio: 'un message vocal',
    document: 'un document', sticker: 'un autocollant', location: 'sa position',
    contacts: 'une fiche de contact',
  };
  return NOMS[t ?? ''] ?? 'un message que le Trône ne sait pas encore afficher';
};

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
    return new Response(JSON.stringify({
      fonction: 'whatsapp-webhook',
      secrets: {
        WA_VERIFY_TOKEN: lg('WA_VERIFY_TOKEN') || 'ABSENT',
        WA_APP_SECRET: lg('WA_APP_SECRET') || 'ABSENT',
        CLE_SERVICE: lg('CLE_SERVICE') || 'ABSENT',
        SUPABASE_URL: lg('SUPABASE_URL') || 'ABSENT',
      },
      /* Si vous lisez ceci dans un navigateur SANS être connecté, c'est que
         « Verify JWT » est bien décoché. C'est la preuve qu'on cherchait. */
      jwt: 'décoché, sinon vous ne liriez pas ceci',
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

  let charge: Record<string, any> = {};
  try { charge = JSON.parse(brut); } catch { return new Response('ok', { status: 200 }); }

  /* ── ③ CE QUE L'APPEL PORTE ─────────────────────────────────────── */
  type Entrant = {
    waId: string; numero: string; texte: string; type: string; quand: string;
    nomProfil?: string; numeroMaison?: string;
  };
  const entrants: Entrant[] = [];
  const accuses: { waId: string; etat: string; detail?: string; numero: string }[] = [];

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
        entrants.push({
          waId: String(m.id),
          numeroMaison,
          numero: de,
          texte: texteDuMessage(m),
          type: String(m.type ?? 'text'),
          /* Meta date en SECONDES ; le Trône lit des ISO. */
          quand: new Date(Number(m.timestamp ?? 0) * 1000 || Date.now()).toISOString(),
          nomProfil: profils.get(String(m.from)),
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
    entrees: (charge.entry ?? []).length,
    champs: (charge.entry ?? []).flatMap((e: Record<string, any>) => e.changes ?? [])
      .map((c: Record<string, any>) => c.field ?? '?'),
    messages: entrants.length,
    accuses: accuses.length,
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

  /* ── ⑤ ON RANGE. Identifiant DÉTERMINISTE `wa-<id Meta>` : Meta rappelle
     volontiers deux fois le même message, il ne s'écrira qu'une. */
  if (entrants.length > 0) {
    const lignes = entrants.map((e) => {
      const tete = teteDuNumero(e.numero);
      return {
        id: `wa-${e.waId}`,
        branch_id: tete?.branchId ?? null,
        data: {
          id: `wa-${e.waId}`, waId: e.waId, branchId: tete?.branchId,
          sens: 'entrant', numero: e.numero, clientId: tete?.id,
          nomProfil: e.nomProfil, texte: e.texte, type: e.type, quand: e.quand,
          numeroMaison: e.numeroMaison || undefined,
        },
      };
    });
    const { error } = await sb.from('messages_wa').upsert(lignes, { onConflict: 'id' });
    if (error) console.error(`whatsapp-webhook · ÉCHEC ÉCRITURE · ${error.message}`);
    else dis('messages rangés', { combien: lignes.length, rattaches: lignes.filter((l) => l.data.clientId).length });
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

  return new Response(
    JSON.stringify({ recus: entrants.length, accuses: accuses.length }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
});
