/* ═══════════════════════════════════════════════════════════════════
   AVIS-GOOGLE — la fonction planifiée qui demande un avis à la première venue.

   « Je veux l'envoi sans main » (Yéman, 19 août 2026). Réveillée par le cron
   toutes les heures d'ouverture, elle :
     ① ne fait RIEN tant que l'interrupteur « avis sans main » des Paramètres
        est éteint (`mnd_auto_config.avisAuto`) — c'est la Maison qui allume,
        pas une clé posée en douce ;
     ② lit les factures SOLDÉES des deux derniers jours (fuseau du salon) ;
     ③ ne garde que la PREMIÈRE pièce réglée de chaque tête — une habituée
        relancée à chaque passage finirait par ne plus rien laisser ;
     ④ envoie le modèle WhatsApp approuvé ({{1}} prénom, {{2}} lien d'avis)
        par l'API Meta SI les clés sont posées (WA_TOKEN, WA_PHONE_ID,
        WA_TEMPLATE_AVIS) — sinon elle passe, sans bruit : le comptoir garde
        son geste d'un tap ;
     ⑤ consigne CHAQUE tentative dans la table `envois` (0043), identifiant
        DÉTERMINISTE `env-<facture>-wa-avis` : le cron peut se réveiller dix
        fois, une cliente n'est jamais écrite deux fois.

   AUCUN SECRET ICI. Tout vient de l'environnement de la fonction
   (supabase secrets set …) — ce fichier vit dans un dépôt public.

   Déploiement : Supabase → Edge Functions → New function « avis-google »
   → coller CE FICHIER ENTIER → Deploy. Puis le cron et le modèle Meta
   (voir docs/BRANCHER-ENVOIS.md, étape 5).
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

const TZ = 'Africa/Porto-Novo'; // le fuseau du salon — pas celui du serveur

/* Le lien d'avis de la Maison — public par nature (c'est celui qu'on DONNE).
   La valeur vivante est dans Paramètres (`mnd_auto_config.reviewLink`) ;
   ceci n'est que le repli, identique au défaut du Trône. */
const REVIEW_LINK_DEFAUT = 'https://g.page/r/CYEt1s4BqvZDEBE/review';

type Ligne = { qty: number; unitXof: number; discountPct?: number; discountXof?: number };
type Versement = { date?: string; amountXof: number };
type Piece = {
  id: string;
  branchId?: string;
  kind: string;
  clientId?: string;
  clientName?: string;
  date: string;
  lines?: Ligne[];
  globalDiscountPct?: number;
  globalDiscountXof?: number;
  status?: string;
  payments?: Versement[];
};
type Fiche = { id: string; name?: string; phone?: string };

/** Ce que la pièce a reçu — le journal des versements, sinon la pièce payée
    entière (les pièces d'avant le 17 août n'ont pas de journal). */
const regleXof = (p: Piece): number =>
  p.payments && p.payments.length > 0
    ? p.payments.reduce((s, v) => s + (v.amountXof || 0), 0)
    : (p.status === 'payée' ? totalXof(p) : 0);

const totalXof = (p: Piece): number => {
  const sub = (p.lines ?? []).reduce((s, l) =>
    s + Math.max(0, l.qty * l.unitXof * (1 - (l.discountPct ?? 0) / 100) - (l.discountXof ?? 0)), 0);
  return Math.max(0, Math.round(sub * (1 - (p.globalDiscountPct ?? 0) / 100)) - (p.globalDiscountXof ?? 0));
};

/** Le jour du DERNIER argent entré — c'est lui qui date le solde. */
const jourDuSolde = (p: Piece): string =>
  (p.payments && p.payments.length > 0
    ? p.payments.map((v) => v.date ?? '').sort().at(-1) ?? p.date
    : p.date);

/** Numéro béninois → format international sans « + » (exigé par Meta) —
    même règle que rappels-j1. */
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

  /* Seul le cron (armé de la clé service) réveille l'envoi : cette fonction
     lit des téléphones et écrit au journal. */
  if (!service || (req.headers.get('authorization') ?? '') !== `Bearer ${service}`) {
    return new Response(JSON.stringify({ erreur: 'réservé au cron' }), { status: 401 });
  }

  const sb = createClient(urlBase, service);

  /* ── ① L'interrupteur de la Maison ──────────────────────────────── */
  const { data: docs } = await sb.from('documents').select('key, data')
    .in('key', ['mnd_auto_config', 'mnd_house_identity']);
  const cfg = (docs?.find((d) => d.key === 'mnd_auto_config')?.data ?? {}) as
    { reviewLink?: string; avisAuto?: boolean };
  if (cfg.avisAuto !== true) {
    return new Response(JSON.stringify({ actif: false }), { status: 200 });
  }
  const lien = (cfg.reviewLink ?? '').trim() || REVIEW_LINK_DEFAUT;
  const nomMaison: string =
    ((docs?.find((d) => d.key === 'mnd_house_identity')?.data as { nom?: string })?.nom ?? '').trim() || 'Maison MND';

  /* ── ④ (tôt) Les clés Meta — sans elles, on passe sans bruit ────── */
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  const WA_TEMPLATE = Deno.env.get('WA_TEMPLATE_AVIS') ?? 'avis_google';
  if (!WA_TOKEN || !WA_PHONE_ID) {
    return new Response(JSON.stringify({ actif: true, cles: false }), { status: 200 });
  }

  /* ── ② Les factures soldées des deux derniers jours ──────────────
     Deux jours, pas un : un rituel soldé après le dernier réveil du soir
     doit être rattrapé le lendemain matin, pas oublié. L'idempotence du
     journal rend la fenêtre large sans risque de doublon. */
  const aujourdhui = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const hier = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA', { timeZone: TZ });

  const { data: invRows, error: errI } = await sb.from('invoices')
    .select('id, branch_id, data')
    .eq('data->>kind', 'facture')
    .eq('data->>status', 'payée');
  if (errI) return new Response(JSON.stringify({ erreur: errI.message }), { status: 500 });

  const toutes: Piece[] = (invRows ?? []).map((r) => r.data as Piece);
  const fraiches = toutes.filter((p) => {
    const j = jourDuSolde(p);
    return (j === aujourdhui || j === hier) && (p.clientId ?? '') !== '' && regleXof(p) > 0;
  });
  if (fraiches.length === 0) {
    return new Response(JSON.stringify({ actif: true, jour: aujourdhui, candidates: 0 }), { status: 200 });
  }

  /* ── ③ La PREMIÈRE pièce réglée de la tête, et elle seule ───────── */
  const premieres = fraiches.filter((p) =>
    !toutes.some((autre) => autre.id !== p.id
      && (autre.clientId ?? '') === p.clientId
      && regleXof(autre) > 0
      && jourDuSolde(autre) < jourDuSolde(p)));

  /* ── Le journal — l'idempotence avant tout envoi ────────────────── */
  const cles = premieres.map((p) => `env-${p.id}-wa-avis`);
  const { data: dejaRows } = await sb.from('envois').select('id').in('id', cles);
  const deja = new Set((dejaRows ?? []).map((r) => r.id as string));
  const aFaire = premieres.filter((p) => !deja.has(`env-${p.id}-wa-avis`));
  if (aFaire.length === 0) {
    return new Response(JSON.stringify({ actif: true, jour: aujourdhui, deja: premieres.length }), { status: 200 });
  }

  /* ── Les fiches (prénom + téléphone), en une lecture ────────────── */
  const ids = [...new Set(aFaire.map((p) => p.clientId!).filter(Boolean))];
  const { data: cliRows } = await sb.from('clients').select('id, data').in('id', ids);
  const fiches = new Map<string, Fiche>(
    (cliRows ?? []).map((r) => [r.id as string, { id: r.id, ...(r.data as object) } as Fiche]),
  );

  const aInserer: { id: string; branch_id: string | null; data: Record<string, unknown> }[] = [];
  const consigne = (p: Piece, statut: string, detail?: string) => {
    const id = `env-${p.id}-wa-avis`;
    aInserer.push({
      id,
      branch_id: p.branchId ?? null,
      data: {
        id, branchId: p.branchId, type: 'avis-google', canal: 'whatsapp',
        apptId: '', invoiceId: p.id, clientId: p.clientId, dateRdv: jourDuSolde(p),
        statut, ...(detail ? { detail: detail.slice(0, 300) } : {}),
        quand: new Date().toISOString(),
      },
    });
  };

  let nWa = 0;
  for (const p of aFaire) {
    const fiche = fiches.get(p.clientId!);
    const tel = numeroIntl(fiche?.phone);
    if (!tel) { consigne(p, 'sans-abonnement', 'fiche sans téléphone'); continue; }
    const prenom = ((fiche?.name ?? p.clientName ?? '').trim().split(/\s+/)[0]) || 'Madame';
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
              parameters: [{ type: 'text', text: prenom }, { type: 'text', text: lien }],
            }],
          },
        }),
      });
      if (r.ok) { consigne(p, 'envoyé'); nWa++; }
      else consigne(p, 'échec', await r.text());
    } catch (e) {
      consigne(p, 'échec', String(e));
    }
  }

  /* ── Le journal s'écrit en un geste (upsert : re-réveil sans doublon) ── */
  if (aInserer.length > 0) {
    const { error: errE } = await sb.from('envois').upsert(aInserer, { onConflict: 'id' });
    if (errE) return new Response(JSON.stringify({ erreur: errE.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ actif: true, maison: nomMaison, jour: aujourdhui, premieres: aFaire.length, envoyes: nWa }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
});
