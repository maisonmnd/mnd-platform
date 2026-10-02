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
/* ══ UNE VENUE SAISIE APRÈS COUP NE REÇOIT RIEN — 13 septembre 2026 ══════
   « Chaque fois que je pose un rendez-vous dans le passé, n'envoie aucun
   WhatsApp, aucun rappel, rien à la cliente par l'API » (Yéman).

   La facture d'un rituel posé APRÈS son heure (un carnet rattrapé, une venue
   notée le soir) ne déclenche pas la demande d'avis. Le juge est le même que
   dans confirmation-rdv et `shared/agenda.ts` : l'instant du rendez-vous,
   comparé à l'instant de sa pose, signé par la base (0092) sinon `creeLe`. */
const momentDuRdv = (a: { date: string; time?: string }): number => {
  const h = /^\d{1,2}:\d{2}$/.test(a.time ?? '') ? (a.time as string).padStart(5, '0') : '23:59';
  return new Date(`${a.date}T${h}:00+01:00`).getTime();
};

const poseApresSonHeure = (a: { date: string; time?: string; creeLe?: string }, poseLe?: string): boolean => {
  const quand = Date.parse(poseLe ?? a.creeLe ?? '');
  return Number.isFinite(quand) && momentDuRdv(a) <= quand;
};

// deno-lint-ignore no-explicit-any
const posesSignees = async (sb: any, ids: string[]): Promise<Map<string, string>> => {
  const m = new Map<string, string>();
  if (ids.length === 0) return m;
  const { data, error } = await sb.from('traces').select('piece_id, fait_le')
    .eq('table_name', 'appointments').eq('operation', 'pose').in('piece_id', ids);
  if (error) return m;
  for (const r of (data ?? []) as { piece_id: string; fait_le: string }[]) {
    if (!m.has(r.piece_id)) m.set(r.piece_id, r.fait_le);
  }
  return m;
};

type RdvLie = {
  id: string;
  date: string;
  time?: string;
  creeLe?: string;
  invoiceId?: string;
  payments?: { invoiceId?: string }[];
};

type Piece = {
  id: string;
  branchId?: string;
  apptId?: string;
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
/* ══ MADAME NAFFI — 2 octobre 2026 ═════════════════════════════════════
   La Maison écrit « Madame Naffi » : la civilité de la fiche, puis le prénom.
   Une fiche qui ne dit rien est une dame ; une fiche au masculin d'avant ce
   jour est « Monsieur ». Recopié de `src/shared/civilite.ts` (une fonction
   Edge ne lit rien du dépôt) ; `verifie-civilite` tient la copie. */
const appelDe = (d: { name?: unknown; civilite?: unknown; auMasculin?: unknown } | null | undefined, repli?: unknown): string => {
  const civ = d?.civilite === 'monsieur' || d?.civilite === 'mademoiselle' || d?.civilite === 'madame'
    ? d.civilite : d?.auMasculin === true ? 'monsieur' : 'madame';
  const mot = civ === 'monsieur' ? 'Monsieur' : civ === 'mademoiselle' ? 'Mademoiselle' : 'Madame';
  const prenom = String(d?.name ?? repli ?? '').trim().split(/\s+/)[0] ?? '';
  return prenom ? `${mot} ${prenom}` : mot;
};

type Fiche = { id: string; name?: string; phone?: string };

/* ══ LA SALLE D'ATTENTE — 2 octobre 2026 ═══════════════════════════════
   « Est-ce possible d'intercepter un message qui part vers chez un client ?
   D'arrêter l'envoi à cause de l'heure tardive ou autre raison, erreur… »
   (Yéman). Cette fonction ne s'adresse plus à la cliente : elle DÉPOSE son
   message dans le journal des envois, statut « en-attente », avec son heure
   de départ (dix minutes de salle, jamais pendant les heures calmes) et son
   colis. Le facteur `envois-partent`, réveillé chaque minute, le porte, sauf
   si une main l'a retenu depuis le Trône.

   SI LE FACTEUR SE TAIT depuis plus de cinq minutes, on envoie comme avant :
   mieux vaut un message parti sans salle qu'un message déposé que personne ne
   porterait.

   LE CALCUL EST RECOPIÉ de `src/shared/salle-des-envois.ts` ; le harnais
   `verifie-la-salle-des-envois` tient les deux ensemble. */
const DECALAGE_DU_SALON_H = 1;
type ReglesDeLaSalle = { salleMin: number; calmeDe: number; calmeA: number };
const REGLES_PAR_DEFAUT: ReglesDeLaSalle = { salleMin: 10, calmeDe: 20, calmeA: 8 };
const FACTEUR_VIVANT_MS = 5 * 60_000;
function reglesDepuis(cfg: { salleMin?: unknown; calmeDe?: unknown; calmeA?: unknown } | null | undefined): ReglesDeLaSalle {
  const n = (v: unknown, min: number, max: number, defaut: number): number => {
    const x = Number(v);
    return Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : defaut;
  };
  return {
    salleMin: n(cfg?.salleMin, 1, 120, REGLES_PAR_DEFAUT.salleMin),
    calmeDe: n(cfg?.calmeDe, 0, 23, REGLES_PAR_DEFAUT.calmeDe),
    calmeA: n(cfg?.calmeA, 0, 23, REGLES_PAR_DEFAUT.calmeA),
  };
}
const heureDuSalon = (ms: number): number => {
  const d = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
};
function dansLesHeuresCalmes(ms: number, r: ReglesDeLaSalle): boolean {
  if (r.calmeDe === r.calmeA) return false;
  const h = heureDuSalon(ms);
  return r.calmeDe < r.calmeA ? (h >= r.calmeDe && h < r.calmeA) : (h >= r.calmeDe || h < r.calmeA);
}
function finDesHeuresCalmes(ms: number, r: ReglesDeLaSalle): number {
  const local = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  const fin = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), r.calmeA, 0, 0) - DECALAGE_DU_SALON_H * 3_600_000;
  return fin > ms ? fin : fin + 86_400_000;
}
function heureDeDepart(maintenantMs: number, r: ReglesDeLaSalle): { partA: number; calme: boolean } {
  const apresLaSalle = maintenantMs + r.salleMin * 60_000;
  if (!dansLesHeuresCalmes(apresLaSalle, r)) return { partA: apresLaSalle, calme: false };
  return { partA: finDesHeuresCalmes(apresLaSalle, r), calme: true };
}
const facteurVivant = (vuLe: string | undefined | null, maintenantMs: number): boolean => {
  const t = Date.parse(vuLe ?? '');
  return Number.isFinite(t) && maintenantMs - t <= FACTEUR_VIVANT_MS && t - maintenantMs <= FACTEUR_VIVANT_MS;
};
/* ── fin du calcul recopié ── */

/** Ce qu'une ligne déposée porte en plus de son identité : quand elle part,
    à qui (le prénom, pour l'écran de la salle) et de quoi l'envoyer. */
const depot = (maintenantMs: number, r: ReglesDeLaSalle, colis: Record<string, unknown>, prenom?: string): Record<string, unknown> => {
  const { partA, calme } = heureDeDepart(maintenantMs, r);
  return {
    deposeLe: new Date(maintenantMs).toISOString(), partA: new Date(partA).toISOString(),
    ...(calme ? { calme: true } : {}), ...(prenom ? { prenom } : {}), colis,
  };
};
/** Les verdicts qui ne verrouillent pas : un raté se retente, un message
    périmé (rendez-vous déplacé pendant l'attente) peut se redéposer. */
const SE_RETENTE = new Set(['échec', 'périmé']);

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
  /* ══ LA CLÉ SERVICE, NOUVELLE FAMILLE — 7 septembre 2026 ═══════════
     Depuis la rotation des clés (fuite du 2 août), le projet vit sur les
     clés « sb_… » : la legacy service_role (eyJ…) injectée par la
     plateforme ne prouve plus rien, et cette garde répondait 401 chaque
     soir, en silence. La Maison pose le secret de fonction CLE_SERVICE
     (la clé secrète sb_secret_…) ; la même valeur vit au Vault
     (« service_role_key »), c'est elle que `appelle_fonction_edge`
     envoie. Sans CLE_SERVICE posée, l'ancien monde continue tel quel. */
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';

  /* Seul le cron (armé de la clé service) réveille l'envoi : cette fonction
     lit des téléphones et écrit au journal. */
  const cleRecue = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!service || cleRecue !== service) {
    /* LES LONGUEURS SEULES, JAMAIS LES VALEURS : elles suffisent à situer la
       panne (sb_secret ≈ 40-50 signes · legacy eyJ… ≈ 200 et plus · 0 = rien
       de posé de ce côté-là). */
    return new Response(
      JSON.stringify({ erreur: 'réservé au cron', attendueLg: service.length, recueLg: cleRecue.length }),
      { status: 401 },
    );
  }

  const sb = createClient(urlBase, service);

  /* ── ① L'interrupteur de la Maison ──────────────────────────────── */
  const { data: docs } = await sb.from('documents').select('key, data')
    .in('key', ['mnd_auto_config', 'mnd_house_identity', 'mnd_facteur']);
  const cfg = (docs?.find((d) => d.key === 'mnd_auto_config')?.data ?? {}) as
    { reviewLink?: string; avisAuto?: boolean; salleMin?: unknown; calmeDe?: unknown; calmeA?: unknown };
  /* LA SALLE EST OUVERTE si le facteur a donné signe de vie dans les cinq minutes. */
  const regles = reglesDepuis(cfg);
  const salleOuverte = facteurVivant((docs?.find((d) => d.key === 'mnd_facteur')?.data as { vuLe?: string } | undefined)?.vuLe, Date.now());
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

  /* TOUTES LES FACTURES SOLDÉES, PAGE PAR PAGE — 1er octobre 2026. Supabase
     plafonne chaque réponse à mille lignes. « La première pièce réglée de la
     tête » se juge sur TOUTES ses pièces : au-delà de mille factures, une
     tranche ferait passer une habituée pour une nouvelle venue, et lui
     redemanderait un avis. On lit donc à la suite du dernier id lu. */
  // deno-lint-ignore no-explicit-any
  const invRows: any[] = [];
  {
    let apres: string | null = null;
    for (let tour = 0; tour < 2000; tour += 1) {
      let q = sb.from('invoices')
        .select('id, branch_id, data')
        .eq('data->>kind', 'facture')
        .eq('data->>status', 'payée')
        .order('id', { ascending: true })
        .limit(1000);
      if (apres !== null) q = q.gt('id', apres);
      const { data: page, error: errI } = await q;
      if (errI) return new Response(JSON.stringify({ erreur: errI.message }), { status: 500 });
      invRows.push(...(page ?? []));
      if ((page ?? []).length < 1000) break;
      apres = page![page!.length - 1].id as string;
    }
  }

  const toutes: Piece[] = invRows.map((r) => r.data as Piece);
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
  const consigne = (p: Piece, statut: string, detail?: string, plus?: Record<string, unknown>) => {
    const id = `env-${p.id}-wa-avis`;
    aInserer.push({
      id,
      branch_id: p.branchId ?? null,
      data: {
        id, branchId: p.branchId, type: 'avis-google', canal: 'whatsapp',
        apptId: '', invoiceId: p.id, clientId: p.clientId, dateRdv: jourDuSolde(p),
        statut, ...(detail ? { detail: detail.slice(0, 300) } : {}),
        quand: new Date().toISOString(),
        ...(plus ?? {}),
      },
    });
  };

  /* ── Les venues saisies après coup : consignées, jamais écrites ────
     Le verdict « sans-envoi » verrouille : une venue passée ne redevient
     jamais une première venue à fêter. */
  const tetes = [...new Set(aFaire.map((p) => p.clientId!).filter(Boolean))];
  const { data: rdvRows } = await sb.from('appointments').select('id, data').in('data->>clientId', tetes);
  const rdvsLies: RdvLie[] = (rdvRows ?? []).map((r) => ({ ...(r.data as RdvLie), id: r.id as string }));
  const poses = await posesSignees(sb, rdvsLies.map((a) => a.id));
  const apresCoup = (p: Piece): boolean => rdvsLies.some((a) =>
    (a.id === p.apptId || a.invoiceId === p.id || (a.payments ?? []).some((v) => v.invoiceId === p.id))
    && poseApresSonHeure(a, poses.get(a.id)));

  let nWa = 0;
  let nEcartes = 0;
  let nDeposes = 0;
  for (const p of aFaire) {
    if (apresCoup(p)) {
      consigne(p, 'sans-envoi', 'rendez-vous posé après son heure');
      nEcartes++;
      continue;
    }
    const fiche = fiches.get(p.clientId!);
    const tel = numeroIntl(fiche?.phone);
    if (!tel) { consigne(p, 'sans-abonnement', 'fiche sans téléphone'); continue; }
    const prenom = appelDe(fiche, p.clientName);
    /* EN SALLE : le facteur portera, sauf si une main le retient. */
    if (salleOuverte) {
      consigne(p, 'en-attente', undefined, depot(Date.now(), regles, {
        genre: 'whatsapp', numero: tel, modele: WA_TEMPLATE, parQui: 'la Maison, automatiquement',
        texteAuFil: `Bonjour ${prenom}, merci de votre visite. Votre avis nous aide : ${lien}`,
        composants: [{ type: 'body', parameters: [{ type: 'text', text: prenom }, { type: 'text', text: lien }] }],
      }, prenom));
      nDeposes++;
      continue;
    }
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
    JSON.stringify({ actif: true, maison: nomMaison, jour: aujourdhui, premieres: aFaire.length, ecartes: nEcartes, salle: salleOuverte, deposes: nDeposes, envoyes: nWa }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
});
