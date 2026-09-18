// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function — demande-submit
//
// LA SEULE PORTE PAR LAQUELLE LE SITE PUBLIC DÉPOSE UNE DEMANDE — 17 septembre 2026.
//
// Le site révélateur ne connaît personne : une visiteuse laisse un prénom et
// un numéro, sans compte. La relecture de l'audit a fixé la règle : plus
// aucun dépôt anonyme direct en base (0106 avait rouvert ce que 0007 avait
// fermé). Cette fonction, avec le service role :
//   1. applique la limite de débit de 0007 (`edge_rate_limits`, par IP) ;
//   2. normalise le téléphone en E.164 et refuse ce qui n'en est pas un ;
//   3. refuse un doublon (même numéro, même place, ou même besoin dans les
//      24 h) en renvoyant l'identifiant déjà connu, sans rien réécrire ;
//   4. génère l'identifiant elle-même, résout la branche dans `branches`
//      (la Maison phare par défaut : jamais un identifiant écrit en dur) ;
//   5. écrit la ligne dans `demandes`, puis alerte le personnel.
// Le navigateur ne choisit ni l'identifiant, ni le statut, ni la date.
//
// ══ ET, DEPUIS LE 17 SEPTEMBRE, ELLE POSE LE RENDEZ-VOUS ══════════════
// « Est-ce possible de tomber directement sur les consultations et réserver
// directement, sans passer par un message WhatsApp ? Même chose pour les
// entretiens et les soins » (Yéman). Quand la demande porte une place
// (`serviceIds`, `date`, `time`), on REVÉRIFIE tout ici avant d'écrire :
// le jour est-il ouvert, l'heure tient-elle dans la fenêtre, le maître
// est-il libre, un mur barre-t-il la plage, le plafond du jour est-il
// atteint. L'écran propose ; le serveur dispose. Le rendez-vous naît
// « en attente » : la Maison le confirme depuis Le Trône.
//
// LE CALCUL EST RECOPIÉ, PAS IMPORTÉ : une fonction Edge ne lit rien du
// dépôt. Sa source de vérité est `src/shared/agenda-pur.ts`, éprouvé par
// `scripts/verifie-agenda-pur.mjs` — les deux doivent changer ensemble.
//
// Déployez via le tableau de bord (Edge Functions → New function → coller ce
// fichier EN ENTIER). Secrets : SERVICE_KEY (comme push-notify) ; pour
// l'alerte, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (les mêmes).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
/* La clé service : CLE_SERVICE (la famille sb_secret, depuis la rotation du
   7 septembre), sinon SERVICE_KEY comme push-notify, sinon celle de la plateforme. */
const SERVICE_KEY = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@maison-mnd.bj';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* ── La limite de débit, la même que le tunnel (0007) ─────────────── */
const RATE_BUCKET = 'demandes';
const RATE_MAX = 6;          // 6 dépôts…
const RATE_WINDOW_MIN = 10;  // …par 10 minutes et par IP

const ipOf = (req: Request): string =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

async function allowRate(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_WINDOW_MIN * 60_000).toISOString();
  const { count, error } = await admin
    .from('edge_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('bucket', RATE_BUCKET).eq('ip', ip).gte('at', since);
  if (error) return true; // table absente : ne pas bloquer
  if ((count ?? 0) >= RATE_MAX) return false;
  await admin.from('edge_rate_limits').insert({ bucket: RATE_BUCKET, ip });
  return true;
}

/* ── Le téléphone, en E.164 ─────────────────────────────────────────
   Même règle que `shared/demandes.ts` côté Trône : les chiffres seuls ; un
   numéro déjà international garde son indicatif ; un numéro local béninois
   (8 chiffres à l'ancienne, 10 depuis 2024) reçoit +229 ; en dessous de
   8 chiffres, ce n'est pas un numéro. */
function telephoneNormalise(brut: string, dial = '+229'): string {
  const t = String(brut ?? '').trim();
  const international = t.startsWith('+') || t.startsWith('00');
  const chiffres = t.replace(/\D/g, '').replace(/^00/, '');
  if (chiffres.length < 8) return '';
  if (international) return chiffres.length >= 10 ? `+${chiffres}` : '';
  const indicatif = dial.replace(/\D/g, '');
  if (chiffres.length > 10 && chiffres.startsWith(indicatif)) return `+${chiffres}`;
  /* Huit chiffres à l'ancienne : tout numéro béninois en a dix depuis 2024,
     le 01 s'ajoute, comme le fait `numeroWa` côté Maison. */
  if (indicatif === '229' && chiffres.length === 8) return `+22901${chiffres}`;
  return `+${indicatif}${chiffres}`;
}

const GENRES = new Set(['prospect', 'rdv']);
const BESOINS = new Set(['creation', 'reparation', 'entretien', 'enfant', 'formation', 'inconnu']);
const texte = (v: unknown, max: number): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

async function brancheParDefaut(voulue: string): Promise<{ id: string; maitres: string[] }> {
  const { data: rows } = await admin.from('branches').select('id, data');
  const branches = (rows ?? []) as { id: string; data?: { flagship?: boolean; status?: string; masters?: string[] } }[];
  const choisie = (voulue && branches.find((b) => b.id === voulue))
    || branches.find((b) => b.data?.flagship && b.data?.status !== 'paused')
    || branches[0];
  return { id: choisie?.id ?? 'maison', maitres: (choisie?.data?.masters ?? []).filter(Boolean) };
}

/* ══ LE CALENDRIER, RECOPIÉ DE `shared/agenda-pur.ts` ═══════════════ */

const hourToMin = (h: string): number => {
  const m = /^(\d{1,2})h(\d{2})?$/.exec(String(h ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : 9 * 60;
};
const minutesDeHhmm = (hhmm: string): number => {
  const [h, m] = String(hhmm ?? '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

type Fenetre = { closed: boolean; openMin: number; closeMin: number };
type HeureSemaine = { key: string; open: string; close: string; closed: boolean };
type Exception = { date: string; staffId?: string; open?: string; close?: string; closed?: boolean };

function ouvertureDuJour(dateIso: string, semaine: HeureSemaine[], exceptions: Exception[]): Fenetre {
  const FERME: Fenetre = { closed: true, openMin: 0, closeMin: 0 };
  const dow = new Date(`${dateIso}T00:00:00`).getDay();
  const jour = semaine.find((h) => h.key === JOURS[dow]);
  if (!jour || jour.closed) return FERME;
  const base: Fenetre = { closed: false, openMin: hourToMin(jour.open), closeMin: hourToMin(jour.close) };
  const ex = exceptions.find((e) => e.date === dateIso && !e.staffId);
  if (!ex) return base;
  if (ex.closed) return FERME;
  return {
    closed: false,
    openMin: ex.open?.trim() ? hourToMin(ex.open) : base.openMin,
    closeMin: ex.close?.trim() ? hourToMin(ex.close) : base.closeMin,
  };
}

/* ══ CE QUE LA MAISON A DÉCOCHÉ POUR LE SITE ═══════════════════════
   « Il y a des services que je ne voudrais pas sur le site » (Yéman,
   17 septembre 2026). La Maison décoche depuis la régie de la Vitrine,
   onglet « Sur le site public » ; la liste vit dans
   `mnd_vitrine_config.siteMasques`, À PART de `hiddenServices` et
   `hiddenCategories`, qui règlent le comptoir et Ma Couronne.

   SANS CE REFUS, DÉCOCHER NE SERAIT QU'UN DÉCOR : l'écran cesserait de
   proposer, mais un appel direct à cette fonction réserverait encore, et le
   rendez-vous naîtrait dans le carnet. L'écran propose, le serveur dispose.

   RECOPIÉ DE `src/shared/catalogue-pur.ts` (`masquePourLeSite`), éprouvé par
   `scripts/verifie-qualification.mjs` : les deux changent ensemble. */
type MasquesDuSite = { services?: string[]; categories?: string[] };

function masquePourLeSite(
  s: { id: string; categoryId: string },
  masques: MasquesDuSite | undefined,
  cats: { id: string; parentId?: string }[],
): boolean {
  if (!masques) return false;
  if ((masques.services ?? []).includes(s.id)) return true;
  const caches = masques.categories ?? [];
  if (caches.length === 0) return false;
  let cur: string | undefined = s.categoryId;
  for (let i = 0; cur && i < 8; i += 1) {
    if (caches.includes(cur)) return true;
    cur = cats.find((c) => c.id === cur)?.parentId;
  }
  return false;
}

/* ══ LA PLACE DEMANDÉE, REVÉRIFIÉE ICI ═════════════════════════════
   Rend l'erreur à dire, ou la durée et le maître si la place tient. L'écran
   a déjà jugé, mais un écran vieux d'une minute, un retour en arrière du
   navigateur ou un appel direct à cette fonction ne jugent rien du tout. */
async function laPlaceTient(o: {
  branchId: string;
  maitres: string[];
  serviceIds: string[];
  date: string;
  time: string;
  master: string;
}): Promise<{ erreur: string } | { dureeMin: number; master: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date) || !/^\d{2}:\d{2}$/.test(o.time)) return { erreur: 'creneau_invalide' };

  /* Jamais le jour même ni le passé : la Maison prépare la venue. Jamais
     au-delà de trois mois : un carnet ne se remplit pas à l'aveugle. */
  const jour = new Date(`${o.date}T00:00:00`);
  const aujourdHui = new Date();
  aujourdHui.setHours(0, 0, 0, 0);
  const joursDEcart = Math.round((jour.getTime() - aujourdHui.getTime()) / 86_400_000);
  if (!(joursDEcart >= 1 && joursDEcart <= 90)) return { erreur: 'creneau_hors_fenetre' };

  const [docs, services, categories, blocages, rdvs] = await Promise.all([
    admin.from('documents').select('key, data').in('key', ['mnd_settings', 'mnd_horaires_exceptions', 'mnd_vitrine_config']),
    admin.from('catalog_services').select('id, data'),
    admin.from('catalog_categories').select('id, data'),
    admin.from('blocages').select('id, data'),
    admin.from('appointments').select('id, data').eq('data->>branchId', o.branchId).eq('data->>date', o.date),
  ]);

  const reglages = ((docs.data ?? []) as { key: string; data?: any }[]).find((d) => d.key === 'mnd_settings')?.data ?? {};
  const exceptions = (((docs.data ?? []) as { key: string; data?: any }[]).find((d) => d.key === 'mnd_horaires_exceptions')?.data ?? []) as Exception[];
  const semaine = (Array.isArray(reglages.hours) ? reglages.hours : []) as HeureSemaine[];

  /* Sans horaires en base, on refuse : ouvrir un jour que la Maison ferme
     est pire que de demander un rappel (la leçon du lundi 12 octobre). */
  const fenetre = ouvertureDuJour(o.date, semaine, exceptions);
  if (fenetre.closed) return { erreur: 'creneau_ferme' };

  const catalogue = ((services.data ?? []) as { id: string; data?: { categoryId?: string; durationMin?: number; enabled?: boolean; archived?: boolean } }[]);
  const connus = o.serviceIds.filter((id) => catalogue.some((s) => s.id === id && s.data?.enabled !== false && !s.data?.archived));
  if (connus.length === 0) return { erreur: 'prestation_inconnue' };

  /* CE QUE LA MAISON A DÉCOCHÉ NE SE RÉSERVE PAS, même par un appel direct. */
  const masques = (((docs.data ?? []) as { key: string; data?: any }[])
    .find((d) => d.key === 'mnd_vitrine_config')?.data?.siteMasques ?? {}) as MasquesDuSite;
  const arbre = ((categories.data ?? []) as { id: string; data?: { parentId?: string } }[])
    .map((c) => ({ id: c.id, parentId: c.data?.parentId }));
  const retiree = connus.some((id) => masquePourLeSite(
    { id, categoryId: catalogue.find((x) => x.id === id)?.data?.categoryId ?? '' }, masques, arbre));
  if (retiree) return { erreur: 'prestation_retiree' };
  const dureeMin = Math.max(60, connus.reduce((s, id) =>
    s + Number(catalogue.find((x) => x.id === id)?.data?.durationMin ?? 60), 0));

  const debut = minutesDeHhmm(o.time);
  if (debut < fenetre.openMin || debut + dureeMin > fenetre.closeMin) return { erreur: 'creneau_hors_ouverture' };

  /* Le maître : celui que l'écran a retenu s'il est de la Maison, sinon le
     premier. Un maître inventé ne doit pas ouvrir un agenda parallèle. */
  const master = o.maitres.includes(o.master) ? o.master : (o.maitres[0] ?? '');

  const poses = ((rdvs.data ?? []) as { id: string; data?: any }[])
    .map((r) => r.data)
    .filter((a) => a && String(a.status ?? '') !== 'annulé' && String(a.time ?? '') !== '');
  const dureeDe = (a: any): number => Math.max(60, (Array.isArray(a.serviceIds) ? a.serviceIds : [])
    .reduce((s: number, id: string) => s + Number(catalogue.find((x) => x.id === id)?.data?.durationMin ?? 60), 0));

  const capMaison = Number(reglages.maxRdvParJourMaison ?? 0);
  const capMaitre = Number(reglages.maxRdvParJourMaitre ?? 0);
  if (capMaison > 0 && poses.length >= capMaison) return { erreur: 'creneau_plafond' };
  const duMaitre = poses.filter((a) => String(a.master ?? '') === master);
  if (capMaitre > 0 && duMaitre.length >= capMaitre) return { erreur: 'creneau_plafond' };

  const murs = ((blocages.data ?? []) as { id: string; data?: any }[])
    .map((b) => b.data)
    .filter((b) => b && b.branchId === o.branchId && b.date === o.date && (!b.master || b.master === master))
    .map((b) => [b.debut?.trim() ? hourToMin(b.debut) : 0, b.fin?.trim() ? hourToMin(b.fin) : 24 * 60] as [number, number])
    .filter(([s, e]) => e > s);

  const occupe: [number, number][] = duMaitre.map((a) => {
    const d = minutesDeHhmm(String(a.time));
    return [d, d + dureeDe(a)];
  });
  const chevauche = [...occupe, ...murs].some(([s, e]) => debut < e && debut + dureeMin > s);
  if (chevauche) return { erreur: 'creneau_pris' };

  return { dureeMin, master };
}

async function alerteLePersonnel(titre: string, corps: string, url: string): Promise<number> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const { data: staff } = await admin.from('staff').select('user_id');
  const ids = (staff ?? []).map((s: { user_id: string }) => s.user_id);
  if (ids.length === 0) return 0;
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth,client_id').in('client_id', ids);
  let n = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: titre, body: corps, url, tag: 'mnd-staff' }),
      );
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
  }
  return n;
}

/* ══ L'ACCUSÉ, DANS LA SECONDE — 18 septembre 2026 ═══════════════════════
   « Accusé tout de suite, puis confirmation » (Yéman, maquette
   `maquette-le-journal-des-envois.html`). La visiteuse qui vient de réserver
   reçoit un mot sur WhatsApp avant même d'avoir fermé la page : sa demande
   est arrivée, la Maison confirme bientôt. « C'est confirmé » ne partira
   qu'au moment où la Maison validera (confirmation-rdv).

   ENVOYÉ D'ICI, PAS PAR LE BALAYAGE : c'est le seul message qu'elle attend en
   fermant la page, et dix minutes de silence après « Réserver » se lisent
   comme un échec.

   SEULEMENT POUR UNE PLACE RÉSERVÉE (arbitrage ③) : une question sans
   créneau reçoit la réponse de la Maison, à la main. Elle a coché la case
   qui autorise la Maison à la contacter au sujet de sa demande : l'accusé
   n'en dit pas plus. Modèle Meta à part, `demande_recue` (UTILITY), car une
   demande reçue n'est pas un rendez-vous confirmé.

   JAMAIS UN REFUS DE RÉSERVATION : sans clés Meta, il ne part pas, sans
   bruit ; un échec s'écrit au journal `envois` avec son motif, et la place
   reste réservée. L'identifiant Meta se garde, au journal et dans le fil :
   c'est lui qui rapproche « remis » et « lu » quand le webhook les apporte. */
const TZ = 'Africa/Porto-Novo';

/** « 10 h », « 14 h 30 » : l'heure telle qu'on la dit. Recopiée de
    confirmation-rdv (une fonction Edge n'importe rien du dépôt). */
const heureLisible = (hhmm: string | undefined): string => {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm ?? '')) return hhmm ?? '';
  const [h, m] = (hhmm as string).split(':');
  const minutes = Number(m);
  return Number.isFinite(minutes) && minutes > 0
    ? `${Number(h)} h ${String(minutes).padStart(2, '0')}`
    : `${Number(h)} h`;
};

/** « vendredi 20 septembre ». Recopiée de confirmation-rdv. */
const jourEnClair = (iso: string): string => {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ,
    });
  } catch { return iso; }
};

async function envoieLAccuse(o: {
  apptId: string; demandeId: string; branchId: string; prenom: string; telephone: string; date: string; time: string;
}): Promise<string> {
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  const MODELE = Deno.env.get('WA_TEMPLATE_ACCUSE') ?? 'demande_recue';
  if (!WA_TOKEN || !WA_PHONE_ID) return 'sans-cles';
  /* Meta veut le numéro international sans « + » ; le serveur l'a déjà mis
     en E.164 (telephoneNormalise). */
  const tel = o.telephone.replace(/\D/g, '');
  if (!tel) return 'sans-numero';
  const prenom = o.prenom || 'Madame';
  const quand = `${jourEnClair(o.date)} à ${heureLisible(o.time)}`;

  let statut = 'échec';
  let detail: string | undefined;
  let codeMeta: number | undefined;
  let waId = '';
  try {
    /* Huit secondes au plus : la visiteuse attend la réponse du bouton. */
    const garde = new AbortController();
    const minuterie = setTimeout(() => garde.abort(), 8000);
    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: tel,
        type: 'template',
        template: {
          name: MODELE,
          language: { code: 'fr' },
          components: [{
            type: 'body',
            parameters: [{ type: 'text', text: prenom }, { type: 'text', text: quand }],
          }],
        },
      }),
      signal: garde.signal,
    });
    clearTimeout(minuterie);
    const rep = await r.json().catch(() => ({})) as { messages?: { id?: string }[]; error?: { code?: number; message?: string } };
    waId = String(rep?.messages?.[0]?.id ?? '');
    if (r.ok) {
      statut = 'envoyé';
      if (!waId) detail = 'accepté sans identifiant Meta';
    } else {
      codeMeta = Number(rep?.error?.code) || undefined;
      detail = String(rep?.error?.message ?? `HTTP ${r.status}`);
    }
  } catch (e) {
    detail = String(e);
  }

  const id = `acc-${o.apptId}-whatsapp`;
  const maintenant = new Date().toISOString();
  await admin.from('envois').upsert({
    id,
    branch_id: o.branchId,
    data: {
      id, branchId: o.branchId, type: 'accuse', canal: 'whatsapp',
      apptId: o.apptId, demandeId: o.demandeId, prenom, numero: `+${tel}`,
      dateRdv: o.date, heure: o.time, statut,
      ...(detail ? { detail: detail.slice(0, 300) } : {}),
      ...(codeMeta ? { codeMeta } : {}),
      ...(waId ? { waMessageId: waId } : {}),
      quand: maintenant,
    },
  }, { onConflict: 'id' });

  /* DANS LE FIL : la Maison voit ce que la visiteuse a reçu avant de lui
     répondre. Même forme que les rappels (rappels-j1). */
  if (waId) {
    const idFil = `wa-${waId}`;
    const { error } = await admin.from('messages_wa').upsert({
      id: idFil,
      branch_id: o.branchId,
      data: {
        id: idFil, waId, branchId: o.branchId, sens: 'sortant', numero: tel, clientId: '',
        texte: `Bonjour ${prenom}, la Maison MND a bien reçu votre demande de rendez-vous pour ${quand}. Nous vous confirmons très vite, sur ce numéro.`,
        type: 'text', quand: maintenant, etat: 'en-route', modele: MODELE, parQui: 'Le Trône',
      },
    }, { onConflict: 'id' });
    if (error) console.error('demande-submit: fil', error.message);
  }
  return statut;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!(await allowRate(ipOf(req)))) return json({ error: 'rate_limited' }, 429);

  const corps = await req.text();
  if (corps.length > 5_000) return json({ error: 'too_large' }, 400);
  let body: Record<string, unknown>;
  try { body = JSON.parse(corps); } catch { return json({ error: 'bad_request' }, 400); }

  const genre = String(body.genre ?? 'prospect');
  const d = (body.data ?? {}) as Record<string, unknown>;
  if (!GENRES.has(genre)) return json({ error: 'genre' }, 400);
  if (d.consentement !== true) return json({ error: 'consentement' }, 400);

  const telephone = telephoneNormalise(String(d.telephone ?? ''), String(d.dial ?? '+229'));
  if (!telephone) return json({ error: 'telephone' }, 400);
  const besoin = BESOINS.has(String(d.besoin)) ? String(d.besoin) : 'inconnu';
  const prenom = texte(d.prenom, 60);
  const email = texte(d.email, 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'email' }, 400);

  /* La place demandée, s'il y en a une. */
  const serviceIds = Array.isArray(d.serviceIds)
    ? (d.serviceIds as unknown[]).slice(0, 6).map((x) => texte(x, 60)).filter(Boolean)
    : [];
  const date = texte(d.date, 10);
  const time = texte(d.time, 5);
  const avecPlace = serviceIds.length > 0 && !!date && !!time;

  /* Le doublon : la MÊME PLACE pour le même numéro, ou le même besoin dans
     les 24 h. On rend l'identifiant connu, la Maison n'a qu'une ligne. */
  const depuis = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const deja = admin.from('demandes').select('id, data').eq('data->>telephone', telephone).limit(1);
  const { data: memes } = avecPlace
    ? await deja.eq('data->>date', date).eq('data->>time', time)
    : await deja.eq('data->>besoin', besoin).gte('updated_at', depuis);
  if (memes && memes.length > 0) return json({ ok: true, id: memes[0].id, deja: true });

  const id = `dem-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const branche = await brancheParDefaut(String(d.branchId ?? ''));
  const branchId = branche.id;

  /* ── La place, revérifiée AVANT d'écrire quoi que ce soit ───────── */
  let master = '';
  if (avecPlace) {
    const verdict = await laPlaceTient({
      branchId, maitres: branche.maitres, serviceIds, date, time, master: texte(d.master, 60),
    });
    if ('erreur' in verdict) return json({ error: verdict.erreur }, 409);
    master = verdict.master;
  }

  const demande = {
    id,
    genre,
    createdAt: now,
    branchId,
    prenom,
    telephone,
    ...(email ? { email } : {}),
    besoin,
    ...(d.profil ? { profil: texte(d.profil, 80) } : {}),
    ...(d.mot ? { mot: texte(d.mot, 1000) } : {}),
    source: 'site',
    ...(d.page ? { page: texte(d.page, 120) } : {}),
    ...(d.campagne ? { campagne: texte(d.campagne, 80) } : {}),
    ...(avecPlace ? { serviceIds, date, time, master } : {}),
    consentementLe: now,
    statut: 'nouvelle',
  } as Record<string, unknown>;

  const { error } = await admin.from('demandes').insert({ id, genre, branch_id: branchId, data: demande });
  if (error) return json({ error: 'insert_failed' }, 500);

  /* ── LE RENDEZ-VOUS, POSÉ EN ATTENTE ───────────────────────────────
     `clientId` reste VIDE : personne n'a de fiche, et en inventer une à
     chaque dépôt polluerait le carnet. Le Trône la crée quand la Maison
     confirme (« En faire une cliente »), et rattache alors ce rendez-vous.
     La RLS de `appointments` (0006, `owned_by_data`) fait que cette ligne
     n'est lisible QUE par le personnel : un clientId vide n'appartient à
     aucune session. */
  let apptId: string | undefined;
  if (avecPlace) {
    const candidat = `rdv-${crypto.randomUUID()}`;
    const note = ['Réservé depuis le site', d.mot ? texte(d.mot, 300) : ''].filter(Boolean).join(' · ');
    const appt = {
      id: candidat,
      branchId,
      clientId: '',
      clientName: prenom || 'Demande du site',
      serviceIds,
      date,
      time,
      master,
      status: 'en attente',
      source: 'site',
      creeLe: now,
      note,
    };
    const { error: errRdv } = await admin.from('appointments').insert({ id: candidat, branch_id: branchId, data: appt });
    if (!errRdv) {
      apptId = candidat;
      await admin.from('demandes').update({ data: { ...demande, apptId } }).eq('id', id);
    }
    /* Si l'écriture échoue, la demande vit quand même et la Maison
       rappellera : on ne perd jamais une visiteuse pour une ligne. */
  }

  /* L'ACCUSÉ — pour une place réellement posée, jamais pour une question.
     Un échec ne défait rien : la place est prise, le journal le dira. */
  const accuse = apptId
    ? await envoieLAccuse({ apptId, demandeId: id, branchId, prenom, telephone, date, time })
      .catch((e) => { console.error('demande-submit: accusé', String(e)); return 'échec'; })
    : 'sans-place';

  const quand = avecPlace ? ` · ${date} à ${time}` : '';
  const sent = await alerteLePersonnel(
    avecPlace ? 'Place demandée depuis le site' : (genre === 'rdv' ? 'Demande de rendez-vous depuis le site' : 'Nouvelle demande depuis le site'),
    `${prenom || 'Une visiteuse'} · ${besoin}${quand}`,
    avecPlace ? '/trone/#/calendrier' : '/trone/#/demandes',
  ).catch(() => 0);
  return json({ ok: true, id, apptId, sent, accuse });
});
