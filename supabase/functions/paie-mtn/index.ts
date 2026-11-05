// paie-mtn - la paie par MTN : les envois de la Maison par l'API MTN, par le relais.
//
// Premiere ligne volontairement pauvre (lecon du 14 septembre 2026).

/* ═══════════════════════════════════════════════════════════════════
   PAIE-MTN · 5 novembre 2026, lot 2 de la paie (maquette
   6bNGeh7nyABotDAXppWRoX, version 3, « construis »).

   Le Trône confie ici, après le toucher de la direction, les envois de la
   paie et du test de 100 F. La fonction les écrit au registre
   (`paie_envois_mtn`, 0163) avec leur référence, puis les envoie à leur
   heure par l'API MTN (Disbursement), et relit chez MTN ce qu'il en est.

   PAR LE RELAIS, SEULEMENT. MTN n'accepte que l'adresse fixe du serveur de
   la Maison : chaque appel va à MOMO_RELAIS_URL avec l'en-tête X-Relais-Cle,
   et le relais le transmet tel quel à proxy.momoapi.mtn.com.

   UN BULLETIN, UN SEUL ENVOI.
   · La référence (X-Reference-Id) est écrite AVANT l'appel ; MTN refuse
     une référence déjà reçue (409).
   · Une ligne passe de « programmé » à « part » par une écriture
     conditionnelle : deux passages en même temps n'envoient pas deux fois.
   · Sans réponse de MTN, on RELIT la même référence ; on ne renvoie, avec
     la même référence, que si MTN dit ne pas la connaître (trois fois au
     plus).
   · Après un refus, seul un nouveau toucher (« renvoyer ») crée un envoi,
     avec une nouvelle référence.

   QUI APPELLE.
   · La direction (souverain, gérant), avec son jeton : etat, lire,
     programmer, tester, annuler, renvoyer, relire.
   · Le passage de la base (cron, clé de service) : les envois dus et les
     réponses attendues, rien d'autre.

   LES CLÉS NE SORTENT PAS : ni l'utilisateur d'API, ni sa clé, ni la clé
   d'abonnement, ni le jeton, ni la clé du relais ne figurent dans une
   réponse ou un journal.

   SECRETS : MOMO_PROD_DISBURSEMENT_USER, MOMO_PROD_DISBURSEMENT_KEY,
   MOMO_PROD_DISBURSEMENT_SUBSCRIPTION, MOMO_TARGET_ENV (mtnbenin),
   MOMO_RELAIS_URL, MOMO_RELAIS_CLE. SUPABASE_URL et
   SUPABASE_SERVICE_ROLE_KEY sont posés d'office.

   GET   la version, et ce qui est posé (oui / non), jamais une valeur.
   POST  { action, … } : voir plus bas.
   ═══════════════════════════════════════════════════════════════════ */

const VERSION = '2026-11-05-a';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const env = (k: string) => (Deno.env.get(k) ?? '').trim();
const PROJET = () => env('SUPABASE_URL').replace(/\/$/, '');
const SERVICE = () => env('SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
/** Les clés de service posées : le passage de la base présente l'une d'elles. */
const CLES_DE_SERVICE = () => [env('SERVICE_KEY'), env('CLE_SERVICE'), env('SUPABASE_SERVICE_ROLE_KEY')].filter(Boolean);

// ── DEBUT regles (relues et éprouvées par scripts/verifie-la-paie-par-mtn)
const DEVISE = 'XOF';
const MAX_PAR_ENVOI = 2_000_000;
const MAX_ESSAI = 500;
const MAX_TENTATIVES = 3;
const MAX_NUMEROS = 40;
const RE_MSISDN = /^22901\d{8}$/;
const RE_REFERENCE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RE_PERIODE = /^\d{4}-\d{2}$/;
const DIRECTION = new Set(['souverain', 'gerant']);
const A_RELIRE = ['envoi', 'envoye', 'sans-reponse'];

type Envoi = {
  reference: string; genre: 'paie' | 'essai'; run_id: string | null; periode: string | null; essai_id: string | null;
  employee_id: string; nom: string; msisdn: string; montant_xof: number; etat: string; part_a: string;
  programme_par: string; programme_le?: string; tentatives?: number; transaction_mtn?: string | null;
  raison?: string | null; note?: string | null; remplace?: string | null;
};

/** Un envoi confié par le Trône, relu champ par champ : rien d'autre n'entre au registre. */
function envoiLu(x: any, genre: 'paie' | 'essai', par: string, maintenant: string): Envoi | string {
  if (!x || typeof x !== 'object') return 'envoi illisible';
  const reference = String(x.reference ?? '');
  if (!RE_REFERENCE.test(reference)) return 'référence illisible';
  const msisdn = String(x.msisdn ?? '');
  if (!RE_MSISDN.test(msisdn)) return 'numéro MTN illisible';
  const montant = Number(x.montantXof);
  const max = genre === 'essai' ? MAX_ESSAI : MAX_PAR_ENVOI;
  if (!Number.isInteger(montant) || montant < 1 || montant > max) return `montant hors bornes (1 à ${max} F)`;
  const nom = String(x.nom ?? '').trim().slice(0, 120);
  const employee_id = String(x.employeeId ?? '').trim();
  if (!nom || !employee_id) return 'personne illisible';
  let part_a = maintenant;
  let run_id: string | null = null, periode: string | null = null, essai_id: string | null = null;
  if (genre === 'paie') {
    run_id = String(x.runId ?? '').trim();
    periode = String(x.periode ?? '');
    if (!run_id || !RE_PERIODE.test(periode)) return 'paie du mois illisible';
    const ms = Date.parse(String(x.partA ?? ''));
    if (!Number.isFinite(ms)) return 'heure de départ illisible';
    part_a = new Date(ms).toISOString();
  } else {
    essai_id = String(x.essaiId ?? '').trim();
    if (!/^essai-\d{12}$/.test(essai_id)) return 'test illisible';
  }
  return { reference: reference.toLowerCase(), genre, run_id, periode, essai_id, employee_id, nom, msisdn, montant_xof: montant, etat: 'programme', part_a, programme_par: par };
}

/** Ce que MTN répond à un envoi (POST transfer), en un état du registre. */
function issueDuDepart(http: number, corps: any): { etat: string; raison?: string } {
  if (http === 202 || http === 200 || http === 201) return { etat: 'envoye' };
  /* 409 : MTN a déjà cette référence. L'envoi est parti une fois ; on le relira. */
  if (http === 409) return { etat: 'envoye' };
  if (http === 0 || http >= 500) return { etat: 'sans-reponse' };
  if (http === 401 || http === 403) return { etat: 'refuse', raison: 'ACCES_REFUSE' };
  return { etat: 'refuse', raison: String(corps?.code ?? corps?.reason ?? `HTTP_${http}`) };
}

/** Ce que MTN dit d'un envoi relu (GET transfer/{ref}). `renvoie` : MTN ne le connaît pas. */
function issueDeLaRelecture(http: number, corps: any, etatAvant: string, tentatives: number): { etat: string; raison?: string; transaction?: string; renvoie?: boolean } {
  if (http === 200) {
    const s = String(corps?.status ?? '').toUpperCase();
    if (s === 'SUCCESSFUL') return { etat: 'recu', transaction: corps?.financialTransactionId ? String(corps.financialTransactionId) : undefined };
    if (s === 'FAILED' || s === 'REJECTED') {
      const r = corps?.reason;
      return { etat: 'refuse', raison: String((typeof r === 'object' ? r?.code : r) ?? 'FAILED') };
    }
    return { etat: 'envoye' };
  }
  if (http === 404) {
    /* MTN ne connaît pas la référence : l'envoi n'est jamais arrivé. On le
       renvoie avec LA MÊME référence, trois fois au plus ; après, c'est un
       refus qui se dit (rien n'est parti). Un envoi que MTN avait accepté
       (« envoyé ») et qu'il dirait ne plus connaître reste à relire. */
    if (etatAvant === 'envoye') return { etat: 'envoye' };
    if (tentatives < MAX_TENTATIVES) return { etat: etatAvant, renvoie: true };
    return { etat: 'refuse', raison: 'INCONNU_CHEZ_MTN' };
  }
  return { etat: etatAvant === 'envoi' ? 'sans-reponse' : etatAvant };
}

/** Le nom que MTN rend pour un numéro (basicuserinfo). */
const nomDeMtn = (c: any): string | null => {
  const n = [c?.given_name, c?.family_name].filter((x) => typeof x === 'string' && x.trim()).join(' ').trim();
  return n || (typeof c?.name === 'string' && c.name.trim() ? c.name.trim() : null);
};
const soldeDeMtn = (c: any): number | null => {
  const n = Number(c?.availableBalance);
  return Number.isFinite(n) ? Math.floor(n) : null;
};
// ── FIN regles

/* ── La base, par la clé de service ── */
const enTetesBase = () => ({ apikey: SERVICE(), Authorization: `Bearer ${SERVICE()}`, 'Content-Type': 'application/json' });
async function base(chemin: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; corps: any }> {
  const r = await fetch(`${PROJET()}/rest/v1/${chemin}`, { ...init, headers: { ...enTetesBase(), ...(init.headers ?? {}) } });
  const t = await r.text().catch(() => '');
  let corps: any = null;
  try { corps = t ? JSON.parse(t) : null; } catch { corps = t; }
  return { ok: r.ok, status: r.status, corps };
}
const enListe = (refs: string[]) => `(${refs.map((r) => `"${r}"`).join(',')})`;
async function ecris(reference: string, patch: Record<string, unknown>, siEtat?: string): Promise<boolean> {
  const filtre = `reference=eq.${reference}${siEtat ? `&etat=eq.${siEtat}` : ''}`;
  const r = await base(`paie_envois_mtn?${filtre}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return r.ok && Array.isArray(r.corps) && r.corps.length === 1;
}

/* ── MTN, par le relais ── */
const cles = () => ({
  utilisateur: env('MOMO_PROD_DISBURSEMENT_USER'),
  cle: env('MOMO_PROD_DISBURSEMENT_KEY'),
  abonnement: env('MOMO_PROD_DISBURSEMENT_SUBSCRIPTION'),
  relais: env('MOMO_RELAIS_URL').replace(/\/$/, ''),
  relaisCle: env('MOMO_RELAIS_CLE'),
  cible: env('MOMO_TARGET_ENV') || 'mtnbenin',
});
const pret = () => { const k = cles(); return !!(k.utilisateur && k.cle && k.abonnement && k.relais && k.relaisCle); };

async function mtn(chemin: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ http: number; corps: any }> {
  const k = cles();
  try {
    const r = await fetch(`${k.relais}${chemin}`, {
      method: init.method ?? 'GET',
      headers: { 'X-Relais-Cle': k.relaisCle, 'Ocp-Apim-Subscription-Key': k.abonnement, ...(init.headers ?? {}) },
      body: init.body,
      signal: AbortSignal.timeout(20_000),
    });
    const t = await r.text().catch(() => '');
    let corps: any = null;
    try { corps = t ? JSON.parse(t) : null; } catch { corps = null; }
    return { http: r.status, corps };
  } catch {
    return { http: 0, corps: null };
  }
}
let jetonDuPassage: string | null = null;
async function jeton(): Promise<string | null> {
  if (jetonDuPassage) return jetonDuPassage;
  const k = cles();
  const r = await mtn('/disbursement/token/', { method: 'POST', headers: { Authorization: `Basic ${btoa(`${k.utilisateur}:${k.cle}`)}` } });
  jetonDuPassage = r.http === 200 && typeof r.corps?.access_token === 'string' ? r.corps.access_token : null;
  return jetonDuPassage;
}
async function mtnAuth(chemin: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  const j = await jeton();
  if (!j) return { http: 401, corps: { code: 'ACCES_REFUSE' } };
  return mtn(chemin, { ...init, headers: { Authorization: `Bearer ${j}`, 'X-Target-Environment': cles().cible, ...(init.headers ?? {}) } });
}
async function solde(): Promise<number | null> {
  const r = await mtnAuth('/disbursement/v1_0/account/balance');
  return r.http === 200 ? soldeDeMtn(r.corps) : null;
}

/* ── L'envoi, une ligne ── */
const externalIdDe = (e: Envoi) => (e.genre === 'essai' ? `${e.essai_id}-${e.employee_id}` : `paie-${e.periode}-${e.employee_id}`).slice(0, 64);
async function pars(e: Envoi): Promise<string> {
  const r = await mtnAuth('/disbursement/v1_0/transfer', {
    method: 'POST',
    headers: { 'X-Reference-Id': e.reference, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: String(e.montant_xof), currency: DEVISE, externalId: externalIdDe(e),
      payee: { partyIdType: 'MSISDN', partyId: e.msisdn },
      payerMessage: 'Maison MND',
      payeeNote: e.genre === 'essai' ? 'Essai de paie Maison MND' : `Salaire ${e.periode} Maison MND`,
    }),
  });
  const issue = issueDuDepart(r.http, r.corps);
  await ecris(e.reference, { etat: issue.etat, ...(issue.raison ? { raison: issue.raison, repondu_le: new Date().toISOString() } : {}) });
  return issue.etat;
}

/* ── LE PASSAGE : les envois dus, puis les réponses attendues ── */
async function passage(references?: string[]) {
  const bilan = { partis: 0, recus: 0, refuses: 0, attendent: 0, solde: null as number | null, note: '' };
  const filtre = references?.length ? `&reference=in.${enListe(references)}` : '';
  const lus = await base(`paie_envois_mtn?select=*&etat=in.(programme,envoi,envoye,sans-reponse)${filtre}&order=programme_le.asc&limit=200`);
  if (!lus.ok) return { ...bilan, note: 'Le registre n’a pas pu être lu.' };
  const lignes = (lus.corps ?? []) as Envoi[];
  if (!lignes.length) return bilan;
  if (!pret()) return { ...bilan, note: 'Les clés MTN ne sont pas posées : rien ne part.' };

  const maintenant = Date.now();
  const dus = lignes.filter((e) => e.etat === 'programme' && Date.parse(e.part_a) <= maintenant);
  if (dus.length) {
    /* LE SOLDE D'ABORD : un envoi qui ne peut pas être couvert ne part pas,
       aucun, et chacun le dit ; le passage suivant réessaie. */
    const total = dus.reduce((s, e) => s + e.montant_xof, 0);
    bilan.solde = await solde();
    if (bilan.solde == null || bilan.solde < total) {
      const note = bilan.solde == null
        ? 'Le solde du compte de paie MTN n’a pas pu être lu : rien n’est parti, le passage suivant réessaie.'
        : `Le solde du compte de paie MTN ne couvre pas l’envoi : il manque ${total - bilan.solde} F. Rien n’est parti.`;
      for (const e of dus) await ecris(e.reference, { note }, 'programme');
      bilan.note = note;
    } else {
      for (const e of dus) {
        /* L'écriture conditionnelle : seul celui qui la gagne envoie. */
        const pris = await ecris(e.reference, { etat: 'envoi', tentatives: (e.tentatives ?? 0) + 1, envoye_le: new Date().toISOString(), note: null }, 'programme');
        if (!pris) continue;
        e.etat = await pars(e);
        e.tentatives = (e.tentatives ?? 0) + 1;
        bilan.partis++;
        if (e.etat === 'refuse') bilan.refuses++;
      }
    }
  }

  for (const e of lignes) {
    if (!A_RELIRE.includes(e.etat)) continue;
    const r = await mtnAuth(`/disbursement/v1_0/transfer/${e.reference}`);
    const issue = issueDeLaRelecture(r.http, r.corps, e.etat, e.tentatives ?? 0);
    if (issue.renvoie) {
      const pris = await ecris(e.reference, { etat: 'envoi', tentatives: (e.tentatives ?? 0) + 1 }, e.etat);
      if (pris) { e.etat = await pars(e); if (e.etat === 'refuse') bilan.refuses++; else bilan.attendent++; }
      continue;
    }
    if (issue.etat === 'recu') {
      await ecris(e.reference, { etat: 'recu', repondu_le: new Date().toISOString(), ...(issue.transaction ? { transaction_mtn: issue.transaction } : {}), note: null }, e.etat);
      bilan.recus++;
    } else if (issue.etat === 'refuse') {
      await ecris(e.reference, { etat: 'refuse', raison: issue.raison, repondu_le: new Date().toISOString() }, e.etat);
      bilan.refuses++;
    } else {
      if (issue.etat !== e.etat) await ecris(e.reference, { etat: issue.etat }, e.etat);
      bilan.attendent++;
    }
  }
  return bilan;
}

/* ── Qui appelle ── */
async function direction(req: Request): Promise<{ par: string } | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt || CLES_DE_SERVICE().includes(jwt)) return null;
  const u = await fetch(`${PROJET()}/auth/v1/user`, { headers: { apikey: SERVICE(), Authorization: `Bearer ${jwt}` } }).catch(() => null);
  if (!u || !u.ok) return null;
  const uid = (await u.json().catch(() => null))?.id;
  if (typeof uid !== 'string' || !/^[0-9a-f-]{36}$/i.test(uid)) return null;
  const s = await base(`staff?user_id=eq.${uid}&select=role,name&limit=1`);
  const moi = Array.isArray(s.corps) ? s.corps[0] : null;
  if (!moi || !DIRECTION.has(String(moi.role))) return null;
  return { par: String(moi.name ?? '').trim() || 'La direction' };
}
const estLePassage = (req: Request) => {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  return !!jwt && CLES_DE_SERVICE().includes(jwt);
};

const etat = () => {
  const k = cles();
  return {
    version: VERSION, pret: pret(), environnement: k.cible,
    cles: { utilisateur: !!k.utilisateur, cle: !!k.cle, abonnement: !!k.abonnement },
    relais: !!(k.relais && k.relaisCle),
  };
};

async function inscris(envois: Envoi[]): Promise<{ inscrits: string[]; refuses: { reference: string; erreur: string }[] }> {
  const inscrits: string[] = [];
  const refuses: { reference: string; erreur: string }[] = [];
  for (const e of envois) {
    const r = await base('paie_envois_mtn', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(e) });
    if (r.ok) inscrits.push(e.reference);
    else refuses.push({ reference: e.reference, erreur: r.status === 409 ? 'déjà programmé pour cette personne' : 'le registre a refusé l’envoi' });
  }
  return { inscrits, refuses };
}

Deno.serve(async (req) => {
  jetonDuPassage = null;
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json(etat());
  if (req.method !== 'POST') return json({ erreur: 'méthode' }, 405);

  if (estLePassage(req)) return json({ passage: await passage() });

  const qui = await direction(req);
  if (!qui) return json({ erreur: 'Seule la direction confie un envoi à MTN.' }, 403);
  const corps = await req.json().catch(() => ({})) as any;
  const action = String(corps?.action ?? '');
  const maintenant = new Date().toISOString();

  if (action === 'etat') return json(etat());
  if (!pret()) return json({ ...etat(), erreur: 'Les clés MTN ne sont pas encore posées : rien ne part.' }, 503);

  if (action === 'lire') {
    const numeros = [...new Set((Array.isArray(corps.numeros) ? corps.numeros : []).map(String))].filter((n) => RE_MSISDN.test(n)).slice(0, MAX_NUMEROS);
    const sortie: Record<string, { actif: boolean | null; nom: string | null }> = {};
    for (const n of numeros) {
      const a = await mtnAuth(`/disbursement/v1_0/accountholder/msisdn/${n}/active`);
      const b = await mtnAuth(`/disbursement/v1_0/accountholder/msisdn/${n}/basicuserinfo`);
      sortie[n] = { actif: a.http === 200 ? a.corps?.result === true : null, nom: b.http === 200 ? nomDeMtn(b.corps) : null };
    }
    return json({ le: maintenant, soldeXof: await solde(), numeros: sortie });
  }

  if (action === 'programmer' || action === 'tester') {
    const genre = action === 'tester' ? 'essai' : 'paie';
    const liste = Array.isArray(corps.envois) ? corps.envois.slice(0, 60) : [];
    const lus: Envoi[] = [];
    const refuses: { reference: string; erreur: string }[] = [];
    for (const x of liste) {
      const e = envoiLu(genre === 'essai' ? { ...x, essaiId: corps.essaiId } : x, genre, qui.par, maintenant);
      if (typeof e === 'string') refuses.push({ reference: String(x?.reference ?? ''), erreur: e }); else lus.push(e);
    }
    const r = await inscris(lus);
    console.log('[paie-mtn]', action, { par: qui.par, inscrits: r.inscrits.length, refuses: refuses.length + r.refuses.length });
    const sortie: any = { inscrits: r.inscrits, refuses: [...refuses, ...r.refuses] };
    /* Le test part aussitôt ; la paie attend son heure (le passage). */
    if (genre === 'essai' && r.inscrits.length) sortie.passage = await passage(r.inscrits);
    return json(sortie);
  }

  if (action === 'annuler') {
    const refs = (Array.isArray(corps.references) ? corps.references : []).map(String).filter((x: string) => RE_REFERENCE.test(x)).slice(0, 200);
    if (!refs.length) return json({ annules: 0 });
    const r = await base(`paie_envois_mtn?reference=in.${enListe(refs)}&etat=eq.programme`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ etat: 'annule', annule_par: qui.par, annule_le: maintenant, updated_at: maintenant }),
    });
    return json({ annules: Array.isArray(r.corps) ? r.corps.length : 0 });
  }

  if (action === 'renvoyer') {
    const ancienne = String(corps.reference ?? '');
    const nouvelle = String(corps.nouvelle ?? '').toLowerCase();
    if (!RE_REFERENCE.test(ancienne) || !RE_REFERENCE.test(nouvelle) || ancienne === nouvelle) return json({ erreur: 'références illisibles' }, 400);
    const lu = await base(`paie_envois_mtn?reference=eq.${ancienne}&select=*`);
    const avant = Array.isArray(lu.corps) ? lu.corps[0] as Envoi : null;
    if (!avant) return json({ erreur: 'envoi introuvable' }, 404);
    if (avant.etat !== 'refuse') return json({ erreur: 'seul un envoi refusé se renvoie' }, 409);
    const msisdn = RE_MSISDN.test(String(corps.msisdn ?? '')) ? String(corps.msisdn) : avant.msisdn;
    const e: Envoi = {
      reference: nouvelle, genre: avant.genre, run_id: avant.run_id, periode: avant.periode, essai_id: avant.essai_id,
      employee_id: avant.employee_id, nom: avant.nom, msisdn, montant_xof: avant.montant_xof,
      etat: 'programme', part_a: maintenant, programme_par: qui.par, remplace: avant.reference,
    };
    const r = await inscris([e]);
    if (!r.inscrits.length) return json({ erreur: r.refuses[0]?.erreur ?? 'refusé' }, 409);
    return json({ inscrits: r.inscrits, passage: await passage(r.inscrits) });
  }

  if (action === 'relire') return json({ passage: await passage() });

  return json({ erreur: 'action inconnue' }, 400);
});
