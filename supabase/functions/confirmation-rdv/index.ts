/* ═══════════════════════════════════════════════════════════════════
   CONFIRMATION-RDV — le mot qui part dès qu'un rendez-vous est pris.

   « Je peux avoir une confirmation WhatsApp automatique pour tous les
   nouveaux RDV ? » (Yéman, 28 août 2026). Oui — et voici comment, avec ce
   qu'il faut savoir.

   ELLE BALAIE, ELLE N'ÉCOUTE PAS. Un rendez-vous peut naître de quatre
   endroits : le Calendrier du Trône, le bouton « + RDV », la modale d'appel
   reçu, et Ma Couronne. Brancher l'envoi sur CHAQUE écran, c'est quatre
   occasions de l'oublier, et zéro confirmation le jour où une cliente ferme
   son téléphone avant que la page ait fini. Le cron passe donc toutes les dix
   minutes et confirme ce qui est neuf, d'où qu'il vienne.

   L'IDEMPOTENCE EST DANS L'IDENTIFIANT. Chaque envoi s'inscrit dans `envois`
   sous `conf-<rdv>-<canal>` : le cron peut se réveiller cent fois, une
   cliente ne reçoit qu'une confirmation. C'est la même règle que `rappels-j1`,
   et c'est elle qui rend le balayage sûr.

   ON NE CONFIRME PAS LE PASSÉ. Un rendez-vous déjà tenu, ou annulé, ne reçoit
   rien : « votre rendez-vous est confirmé » sur un rituel d'hier ferait douter
   de tout le reste.

   LE WHATSAPP N'EST ENVOYÉ QUE SI LES CLÉS META SONT POSÉES (WA_TOKEN,
   WA_PHONE_ID, WA_TEMPLATE_CONF). Sans elles, la fonction envoie le push et
   passe, SANS BRUIT — exactement comme `rappels-j1`. Le jour où la
   vérification Meta aboutit, le WhatsApp part sans qu'on retouche une ligne.

   AUCUN SECRET ICI. Tout vient de l'environnement (supabase secrets set …) —
   ce fichier vit dans un dépôt public.

   Déploiement : Supabase → Edge Functions → New function « confirmation-rdv »
   → coller CE FICHIER ENTIER → Deploy. Puis le cron, toutes les 10 minutes
   (voir docs/BRANCHER-ENVOIS.md).
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

const TZ = 'Africa/Porto-Novo'; // le fuseau du salon — pas celui du serveur

/** La fenêtre de rattrapage : on regarde les rendez-vous touchés dans les
    deux dernières heures. Large devant un cron de dix minutes, pour qu'une
    panne d'une heure ne fasse perdre aucune confirmation — l'identifiant
    déterministe empêche de toute façon le doublon. */
const FENETRE_MS = 2 * 60 * 60 * 1000;

type Rdv = {
  id: string;
  branchId?: string;
  clientId: string;
  clientName?: string;
  date: string;
  time: string;
  status: string;
};

type Fiche = { id: string; name?: string; phone?: string };

/** Numéro béninois → format international sans « + » (exigé par Meta).
    Même règle que `rappels-j1` : 229… reste tel quel · 01XXXXXXXX se préfixe
    229 · XXXXXXXX (ancien plan) se préfixe 22901. Autre forme : on la laisse,
    mieux vaut un échec consigné qu'une correction muette. */
const numeroIntl = (brut: string | undefined): string | null => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};

/** « vendredi 28 août » — la date telle qu'on la dit, pas telle qu'on la code. */
const jourEnClair = (iso: string): string => {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ,
    });
  } catch { return iso; }
};

Deno.serve(async (req) => {
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';

  /* Seul le cron (armé de la clé service) a le droit de réveiller l'envoi :
     cette fonction lit des téléphones et écrit au journal. */
  if (!service || (req.headers.get('authorization') ?? '') !== `Bearer ${service}`) {
    return new Response(JSON.stringify({ erreur: 'réservé au cron' }), { status: 401 });
  }

  const sb = createClient(urlBase, service);

  const aujourdhui = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const depuis = new Date(Date.now() - FENETRE_MS).toISOString();

  /* ── La voix de la Maison ────────────────────────────────────────── */
  const { data: docs } = await sb.from('documents').select('key, data')
    .in('key', ['mnd_house_identity', 'mnd_auto_config']);
  const nomMaison: string =
    (docs?.find((d) => d.key === 'mnd_house_identity')?.data?.nom ?? '').trim() || 'Maison MND';
  const cfg = (docs?.find((d) => d.key === 'mnd_auto_config')?.data ?? {}) as { itineraire?: string };

  /* ── Les rendez-vous NEUFS, à venir, non annulés ─────────────────── */
  const { data: apptRows, error: errA } = await sb.from('appointments')
    .select('id, branch_id, data, updated_at')
    .gte('updated_at', depuis)
    .limit(500);
  if (errA) {
    return new Response(JSON.stringify({ erreur: errA.message }), { status: 500 });
  }

  const rdvs: Rdv[] = (apptRows ?? [])
    .map((r) => ({ ...(r.data as Rdv), id: r.id as string, branchId: (r.branch_id as string) ?? undefined }))
    /* NI LE PASSÉ NI L'ANNULÉ : « votre rendez-vous est confirmé » sur un
       rituel d'hier ferait douter de tout le reste. */
    .filter((a) => a.status !== 'annulé' && a.date >= aujourdhui && a.clientId);

  if (rdvs.length === 0) {
    return new Response(JSON.stringify({ vus: 0, push: 0, whatsapp: 0 }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  /* ── Les fiches, pour le prénom et le téléphone ──────────────────── */
  const { data: ficheRows } = await sb.from('clients')
    .select('id, data')
    .in('id', [...new Set(rdvs.map((a) => a.clientId))]);
  const fiches = new Map<string, Fiche>(
    (ficheRows ?? []).map((r) => [r.id as string, { id: r.id as string, ...(r.data as Fiche) }]),
  );

  /* ── CE QUI EST DÉJÀ PARTI — l'idempotence ───────────────────────
     On demande les identifiants exacts qu'on s'apprête à écrire : le cron
     peut se réveiller cent fois, une cliente ne reçoit qu'une confirmation. */
  const attendus = rdvs.flatMap((a) => [`conf-${a.id}-push`, `conf-${a.id}-whatsapp`]);
  const { data: dejaRows } = await sb.from('envois').select('id').in('id', attendus);
  const deja = new Set((dejaRows ?? []).map((r) => r.id as string));

  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  /* Un modèle À PART de celui du rappel : Meta approuve chaque modèle pour un
     usage, et confirmer n'est pas rappeler. */
  const WA_TEMPLATE = Deno.env.get('WA_TEMPLATE_CONF') ?? 'confirmation_rdv';

  const aInserer: { id: string; branch_id: string | null; data: Record<string, unknown> }[] = [];
  const consigne = (canal: string, a: Rdv, statut: string, detail?: string) => {
    aInserer.push({
      id: `conf-${a.id}-${canal}`,
      branch_id: a.branchId ?? null,
      data: {
        id: `conf-${a.id}-${canal}`, branchId: a.branchId, type: 'confirmation', canal,
        apptId: a.id, clientId: a.clientId, dateRdv: a.date, heure: a.time,
        statut, ...(detail ? { detail: detail.slice(0, 300) } : {}),
        quand: new Date().toISOString(),
      },
    });
  };

  let nPush = 0, nWa = 0;

  for (const a of rdvs) {
    const fiche = fiches.get(a.clientId);
    const prenom = (a.clientName ?? fiche?.name ?? '').split(' ')[0] || 'Madame';
    const quand = `${jourEnClair(a.date)} à ${a.time}`;

    /* ① PUSH — gratuit, et il part DÈS AUJOURD'HUI, sans aucune clé Meta. */
    if (!deja.has(`conf-${a.id}-push`)) {
      try {
        const r = await fetch(`${urlBase}/functions/v1/push-notify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${service}` },
          body: JSON.stringify({
            mode: 'to-client',
            clientId: a.clientId,
            title: `${nomMaison} · c'est confirmé`,
            body: `${prenom}, votre rendez-vous est retenu ${quand}. ${cfg.itineraire?.trim() ?? ''}`.trim(),
            url: '/couronne/',
          }),
        });
        const sent = ((await r.json().catch(() => ({}))) as { sent?: number }).sent ?? 0;
        consigne('push', a, sent > 0 ? 'envoyé' : 'sans-abonnement');
        if (sent > 0) nPush++;
      } catch (e) {
        consigne('push', a, 'échec', String(e));
      }
    }

    /* ② WHATSAPP — seulement si la Maison a posé ses clés Meta. Le modèle
       approuvé attend deux variables : {{1}} le prénom, {{2}} le moment
       (« vendredi 28 août à 14:00 »). Sans les clés, on passe sans bruit. */
    const tel = numeroIntl(fiche?.phone);
    if (WA_TOKEN && WA_PHONE_ID && tel && !deja.has(`conf-${a.id}-whatsapp`)) {
      try {
        const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: tel,
            type: 'template',
            template: {
              name: WA_TEMPLATE,
              language: { code: 'fr' },
              components: [{
                type: 'body',
                parameters: [{ type: 'text', text: prenom }, { type: 'text', text: quand }],
              }],
            },
          }),
        });
        if (r.ok) { consigne('whatsapp', a, 'envoyé'); nWa++; }
        else consigne('whatsapp', a, 'échec', await r.text());
      } catch (e) {
        consigne('whatsapp', a, 'échec', String(e));
      }
    }
  }

  /* ── Le journal, d'un seul geste ─────────────────────────────────
     `upsert` plutôt qu'`insert` : deux réveils simultanés du cron ne doivent
     pas faire échouer la course, seulement écrire la même ligne. */
  if (aInserer.length > 0) {
    await sb.from('envois').upsert(aInserer, { onConflict: 'id' });
  }

  return new Response(
    JSON.stringify({ vus: rdvs.length, push: nPush, whatsapp: nWa, modele: WA_TEMPLATE }),
    { headers: { 'content-type': 'application/json' } },
  );
});
