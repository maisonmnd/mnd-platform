/* ═══════════════════════════════════════════════════════════════════
   RAPPELS-J1 — la fonction planifiée qui rappelle la veille.

   Réveillée par le cron (voir docs/BRANCHER-ENVOIS.md), elle :
     ① lit les rendez-vous de DEMAIN (au fuseau du salon, non annulés) ;
     ② envoie le rappel PUSH via la fonction `push-notify` déjà déployée
        (gratuit — pour toute cliente qui a installé Ma Couronne) ;
     ③ envoie le WhatsApp par l'API Meta SI les secrets sont posés
        (WA_TOKEN, WA_PHONE_ID, WA_TEMPLATE) — sinon elle passe, sans bruit :
        la « tournée du matin » du Trône prend le relais à la main ;
     ④ envoie le SMS SI les secrets sont posés (SMS_TWILIO_SID,
        SMS_TWILIO_TOKEN, SMS_FROM) — même règle ;
     ⑤ consigne CHAQUE tentative dans la table `envois` (0043) — une ligne
        par rendez-vous et par canal, à identifiant DÉTERMINISTE : le cron
        peut se réveiller dix fois, un rappel ne part qu'une.

   AUCUN SECRET ICI. Tout vient de l'environnement de la fonction
   (supabase secrets set …) — ce fichier vit dans un dépôt public.

   Déploiement : Supabase → Edge Functions → New function « rappels-j1 »
   → coller CE FICHIER ENTIER → Deploy. Puis poser le cron (voir le guide).
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

const TZ = 'Africa/Porto-Novo'; // le fuseau du salon — pas celui du serveur

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

/** Numéro béninois → format international sans « + » (exigé par Meta/Twilio).
    Les fiches portent le numéro comme il a été tapé : on nettoie, puis
    229… reste tel quel · 01XXXXXXXX (10 chiffres) se préfixe 229 ·
    XXXXXXXX (8 chiffres, ancien plan) se préfixe 22901. Autre forme :
    on la laisse — mieux vaut un échec consigné qu'une correction muette. */
const numeroIntl = (brut: string | undefined): string | null => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
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

  /* ── Demain, au fuseau du salon ─────────────────────────────────── */
  const demain = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: TZ });

  /* ── La voix de la Maison (nom, itinéraire) ─────────────────────── */
  const { data: docs } = await sb.from('documents').select('key, data')
    .in('key', ['mnd_house_identity', 'mnd_auto_config']);
  const nomMaison: string =
    (docs?.find((d) => d.key === 'mnd_house_identity')?.data?.nom ?? '').trim() || 'Maison MND';
  const cfg = (docs?.find((d) => d.key === 'mnd_auto_config')?.data ?? {}) as { itineraire?: string };

  /* ── Les rendez-vous de demain, non annulés ─────────────────────── */
  const { data: apptRows, error: errA } = await sb.from('appointments')
    .select('id, branch_id, data')
    .eq('data->>date', demain)
    .neq('data->>status', 'annulé');
  if (errA) return new Response(JSON.stringify({ erreur: errA.message }), { status: 500 });

  const rdvs: Rdv[] = (apptRows ?? []).map((r) => r.data as Rdv);
  if (rdvs.length === 0) {
    return new Response(JSON.stringify({ jour: demain, rdv: 0 }), { status: 200 });
  }

  /* ── Les fiches (nom + téléphone), en une lecture ───────────────── */
  const ids = [...new Set(rdvs.map((a) => a.clientId).filter(Boolean))];
  const { data: cliRows } = await sb.from('clients').select('id, data').in('id', ids);
  const fiches = new Map<string, Fiche>(
    (cliRows ?? []).map((r) => [r.id as string, { id: r.id, ...(r.data as object) } as Fiche]),
  );

  /* ── Le journal du jour — l'idempotence ─────────────────────────── */
  const { data: dejaRows } = await sb.from('envois').select('id').eq('data->>dateRdv', demain);
  const deja = new Set((dejaRows ?? []).map((r) => r.id as string));

  /* ── Les canaux configurés ──────────────────────────────────────── */
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  const WA_TEMPLATE = Deno.env.get('WA_TEMPLATE') ?? 'rappel_rdv';
  const SMS_SID = Deno.env.get('SMS_TWILIO_SID');
  const SMS_TOKEN = Deno.env.get('SMS_TWILIO_TOKEN');
  const SMS_FROM = Deno.env.get('SMS_FROM');

  const aInserer: { id: string; branch_id: string | null; data: Record<string, unknown> }[] = [];
  const consigne = (canal: string, a: Rdv, statut: string, detail?: string) => {
    aInserer.push({
      id: `env-${a.id}-${canal}`,
      branch_id: a.branchId ?? null,
      data: {
        id: `env-${a.id}-${canal}`, branchId: a.branchId, type: 'rappel-j1', canal,
        apptId: a.id, clientId: a.clientId, dateRdv: a.date, heure: a.time,
        statut, ...(detail ? { detail: detail.slice(0, 300) } : {}),
        quand: new Date().toISOString(),
      },
    });
  };

  let nPush = 0, nWa = 0, nSms = 0;

  for (const a of rdvs) {
    const fiche = fiches.get(a.clientId);
    const prenom = (a.clientName ?? fiche?.name ?? '').split(' ')[0] || 'Madame';

    /* ① PUSH — gratuit, via la fonction déjà déployée. */
    if (!deja.has(`env-${a.id}-push`)) {
      try {
        const r = await fetch(`${urlBase}/functions/v1/push-notify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${service}` },
          body: JSON.stringify({
            mode: 'to-client',
            clientId: a.clientId,
            title: `${nomMaison} · demain ${a.time}`,
            body: `${prenom}, votre rendez-vous est demain à ${a.time}. ${cfg.itineraire?.trim() ?? ''}`.trim(),
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

    /* ② WHATSAPP — seulement si la Maison a posé ses clés Meta.
       Le modèle approuvé attend deux variables : {{1}} le prénom,
       {{2}} l'heure (voir docs/BRANCHER-ENVOIS.md). */
    const tel = numeroIntl(fiche?.phone);
    if (WA_TOKEN && WA_PHONE_ID && tel && !deja.has(`env-${a.id}-whatsapp`)) {
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
                parameters: [{ type: 'text', text: prenom }, { type: 'text', text: a.time }],
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

    /* ③ SMS — seulement si la Maison a posé ses clés (forme Twilio ;
       autre fournisseur = adapter ce bloc, le reste ne bouge pas). */
    if (SMS_SID && SMS_TOKEN && SMS_FROM && tel && !deja.has(`env-${a.id}-sms`)) {
      try {
        const corps = new URLSearchParams({
          From: SMS_FROM,
          To: `+${tel}`,
          Body: `${nomMaison} — rappel : votre rendez-vous est demain à ${a.time}. Merci de nous prévenir en cas d'empêchement.`,
        });
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SMS_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            authorization: `Basic ${btoa(`${SMS_SID}:${SMS_TOKEN}`)}`,
          },
          body: corps.toString(),
        });
        if (r.ok) { consigne('sms', a, 'envoyé'); nSms++; }
        else consigne('sms', a, 'échec', await r.text());
      } catch (e) {
        consigne('sms', a, 'échec', String(e));
      }
    }
  }

  /* ── Le journal s'écrit en un geste (upsert : re-réveil sans doublon) ── */
  if (aInserer.length > 0) {
    const { error: errE } = await sb.from('envois').upsert(aInserer, { onConflict: 'id' });
    if (errE) return new Response(JSON.stringify({ erreur: errE.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ jour: demain, rdv: rdvs.length, push: nPush, whatsapp: nWa, sms: nSms }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
});
