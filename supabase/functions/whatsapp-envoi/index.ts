/* ═══════════════════════════════════════════════════════════════════
   WHATSAPP-ENVOI — la voix de la Maison dans une conversation.

   Maquette `public/maquette-les-conversations.html`, validée le 11 septembre
   2026. Le Trône peut enfin RÉPONDRE, et non plus seulement ouvrir un
   brouillon dans une autre application.

   POURQUOI UNE FONCTION, ET PAS UN APPEL DEPUIS LE NAVIGATEUR : le jeton
   permanent Meta autorise à écrire au nom de la Maison à n'importe quel
   numéro. Le poser dans un navigateur, c'est le publier. Il ne quitte jamais
   le serveur, et l'écran ne connaît que cette porte.

   ═══ LA FENÊTRE DE 24 HEURES EST VÉRIFIÉE ICI AUSSI ═══════════════
   L'écran la tient déjà, et il a raison de la tenir : un refus se dit avant
   le clic. Mais un écran se contourne, se recharge avec un vieil état, ou
   garde une fenêtre ouverte à l'affichage pendant qu'elle s'est fermée à la
   seconde. Le serveur retranche donc la même règle, sur les données du moment.
   Deux gardes pour une règle, ce n'est pas une redite : l'une sert à
   RENSEIGNER, l'autre à EMPÊCHER.

   AUCUN SECRET ICI :
     · WA_TOKEN, WA_PHONE_ID — l'API Meta (déjà posés pour les rappels).
     · CLE_SERVICE           — pour écrire dans `messages_wa`.
     · SUPABASE_ANON_KEY     — pour vérifier que l'appelant est du personnel.

   Déploiement : Supabase → Edge Functions → New function « whatsapp-envoi »
   → coller CE FICHIER ENTIER → Deploy. « Verify JWT » reste COCHÉ : seule
   une session ouverte du Trône doit pouvoir écrire au nom de la Maison.
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

const FENETRE_MS = 24 * 60 * 60 * 1000;

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

const refus = (texte: string, code = 400) =>
  new Response(JSON.stringify({ erreur: texte }), {
    status: code, headers: { 'content-type': 'application/json' },
  });

Deno.serve(async (req) => {
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

  if (!numero) return refus('ce fil n’a pas de numéro lisible');
  if (!modele && !texte) return refus('le message est vide');

  const sb = createClient(urlBase, service);

  /* ── ② LA FENÊTRE, SUR LES DONNÉES DU MOMENT ──────────────────────
     Un modèle approuvé passe hors fenêtre : c'est tout son objet, et c'est
     aussi ce que Meta facture. Le texte libre, lui, exige qu'ELLE ait écrit
     dans les 24 heures — jamais que NOUS ayons écrit : c'est la faute
     naturelle, et elle ferait refuser l'envoi sans qu'on comprenne. */
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

  /* ── ③ L'ENVOI ────────────────────────────────────────────────────── */
  const charge = modele
    ? {
      messaging_product: 'whatsapp', to: numero, type: 'template',
      template: {
        name: modele, language: { code: 'fr' },
        ...(variables.length
          ? { components: [{ type: 'body', parameters: variables.map((t) => ({ type: 'text', text: t })) }] }
          : {}),
      },
    }
    : { messaging_product: 'whatsapp', to: numero, type: 'text', text: { body: texte } };

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

  /* ── ④ ON GARDE TRACE, MÊME D'UN RATÉ ────────────────────────────
     Un message refusé qui ne laisserait rien derrière lui ferait croire qu'on
     n'a jamais écrit, et l'on réécrirait la même chose. L'identifiant se
     déduit de celui de Meta quand il existe, pour que l'accusé du webhook
     retrouve sa ligne. */
  const id = waId ? `wa-${waId}` : `wa-local-${crypto.randomUUID()}`;
  const quand = new Date().toISOString();
  const { error } = await sb.from('messages_wa').upsert({
    id,
    branch_id: branchId ?? null,
    data: {
      id, waId: waId || undefined, branchId, sens: 'sortant', numero, clientId,
      texte: modele ? (texte || `Modèle « ${modele} »`) : texte,
      type: 'text', quand, etat, detail, modele: modele || undefined, parQui,
    },
  }, { onConflict: 'id' });
  if (error) console.error('whatsapp-envoi: trace', error.message);

  if (etat === 'non-remis') {
    return new Response(JSON.stringify({ erreur: detail ?? 'refusé par WhatsApp', id }), {
      status: 502, headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ id, waId, quand }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
});
