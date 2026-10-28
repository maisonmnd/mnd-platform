// mtn-momo-essais - les essais du Sandbox MTN MoMo, pour le dossier Open API.
//
// Premiere ligne volontairement pauvre (lecon du 14 septembre 2026).

// deno-lint-ignore-file no-explicit-any

/* ═══════════════════════════════════════════════════════════════════
   MTN-MOMO-ESSAIS · 28 octobre 2026.

   MTN demande, pour ouvrir l'Open API à Maison MND, « le résultat des tests
   effectués sur le Sandbox ». Cette fonction les fait, d'un seul appel, et
   rend un rapport que le dossier reprend :

     COLLECTION    utilisateur d'API, sa clé, le jeton ; « ce numéro a-t-il un
                   compte ? » ; une demande de paiement qui réussit, une que
                   la cliente refuse, chacune suivie jusqu'à son statut ; le
                   solde du compte.
     DISBURSEMENT  la même entrée ; un virement suivi jusqu'à son statut ;
                   le solde.
     RAPPELS       chaque demande donne à MTN notre adresse de rappel ; ce
                   qu'il y annonce est gardé (documents · mtn_momo_essais_rappels)
                   et relu à la fin.

   LE BAC À SABLE SEUL : l'adresse de MTN est écrite en dur, la monnaie est
   l'euro fictif du Sandbox. Aucun franc ne bouge, jamais.

   LES SECRETS NE SORTENT PAS : ni les clés d'abonnement, ni la clé de
   l'utilisateur d'API, ni le jeton ne figurent au rapport ; l'identifiant
   de l'utilisateur n'y paraît qu'en ses huit premiers signes.

   À DÉPLOYER SANS VÉRIFICATION DU JWT (« Verify JWT » éteint) : les rappels
   de MTN ne présentent pas de jeton Supabase. Le lancement, lui, demande la
   clé publique (anon) du projet en en-tête Authorization.

   SECRETS : MOMO_SANDBOX_COLLECTION_KEY et MOMO_SANDBOX_DISBURSEMENT_KEY
   (momodeveloper.mtn.com › Profile › la « Primary key » de chaque
   abonnement). SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY
   sont posés d'office par Supabase.

   GET                     version, et quelles clés sont posées (oui / non).
   POST ?lancer=1          les essais, le rapport en retour.
   POST|PUT ?rappel=<ref>  l'annonce de MTN pour une demande ou un virement.
   ═══════════════════════════════════════════════════════════════════ */

const VERSION = '2026-10-28-b';

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o, null, 2), { status, headers: { 'content-type': 'application/json' } });

// ── DEBUT deroule (relu et éprouvé par scripts/verifie-mtn-momo-essais)
const BASE = 'https://sandbox.momodeveloper.mtn.com';
const ENV_CIBLE = 'sandbox';
/** Le Sandbox ne connaît que l'euro, une monnaie d'essai. */
const DEVISE = 'EUR';
/** Les numéros d'essai de MTN : tout numéro hors de leur liste réussit ;
    46733123451 est celui d'une cliente qui refuse. */
const NUMERO_REUSSI = '46733123459';
const NUMERO_REFUSE = '46733123451';
const MONTANT = '100';
const EN_COURS = new Set(['PENDING', 'ONGOING']);

type Etape = { produit: string; etape: string; requete: string; http: number | null; ok: boolean; detail: string };
type Outils = {
  f: typeof fetch;
  attendre: (ms: number) => Promise<void>;
  uuid: () => string;
  pause: number;
  /** L'origine de nos rappels (https://<projet>.supabase.co), et l'adresse complète pour une référence. */
  origineRappel: string;
  adresseRappel: (ref: string) => string;
  lireRappels: () => Promise<Record<string, { status?: string; quand?: string }>>;
};

const court = (s: string) => s.slice(0, 8) + '…';

async function lis(r: Response): Promise<any> {
  const t = await r.text();
  try { return t ? JSON.parse(t) : null; } catch { return t.slice(0, 200); }
}

/** Le motif d'un échec, tel que MTN le dit, sans rien d'autre. */
const motif = (o: any): string => (o && typeof o === 'object' ? String(o.reason?.code ?? o.reason ?? o.code ?? o.message ?? '') : '').slice(0, 120);

/* 28 octobre 2026, premier essai réel (2026-10-28-a, 11 étapes sur 15) : une
   demande portant notre adresse de rappel est tombée en INVALID_CALLBACK_URL_HOST,
   le virement et les soldes en NOT_ALLOWED_TARGET_ENVIRONMENT. Désormais :
   les opérations se font d'abord SANS rappel ; le rappel s'éprouve à part,
   avec l'hôte nu puis, s'il est refusé, avec l'origine complète ; le solde
   se lit aussi par sa devise ; un virement refusé s'essaie en dépôt. Chaque
   tentative est au rapport, réussie ou non. */
async function produit(nom: 'collection' | 'disbursement', cle: string, o: Outils, etapes: Etape[]): Promise<string[]> {
  const refs: string[] = [];
  const note = (etape: string, requete: string, http: number | null, ok: boolean, detail: string) =>
    etapes.push({ produit: nom, etape, requete, http, ok, detail });
  const abo = { 'Ocp-Apim-Subscription-Key': cle };
  const appel = async (methode: string, chemin: string, entetes: Record<string, string>, corps?: unknown) => {
    try {
      const r = await o.f(BASE + chemin, {
        method: methode,
        headers: { ...abo, ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}), ...entetes },
        body: corps !== undefined ? JSON.stringify(corps) : undefined,
      });
      return { http: r.status, corps: await lis(r) };
    } catch (e) {
      return { http: null as number | null, corps: { message: String((e as Error)?.message ?? e) } };
    }
  };

  /** L'utilisateur d'API du Sandbox, sa clé, le jeton. `detaille` : une étape par appel. */
  const entree = async (hoteRappel: string, detaille: boolean, titre: string) => {
    const u = o.uuid();
    let r = await appel('POST', '/v1_0/apiuser', { 'X-Reference-Id': u }, { providerCallbackHost: hoteRappel });
    if (detaille) note('Créer l’utilisateur d’API', 'POST /v1_0/apiuser', r.http, r.http === 201, r.http === 201 ? `utilisateur ${court(u)}` : motif(r.corps));
    if (r.http !== 201) { if (!detaille) note(titre, 'POST /v1_0/apiuser', r.http, false, motif(r.corps)); return null; }
    r = await appel('GET', `/v1_0/apiuser/${u}`, {});
    if (detaille) note('Relire l’utilisateur', 'GET /v1_0/apiuser/{id}', r.http, r.http === 200,
      r.http === 200 ? `environnement ${r.corps?.targetEnvironment ?? '?'}, rappels vers ${r.corps?.providerCallbackHost ?? '?'}` : motif(r.corps));
    r = await appel('POST', `/v1_0/apiuser/${u}/apikey`, {});
    const apiKey = r.http === 201 ? String(r.corps?.apiKey ?? '') : '';
    if (detaille) note('Obtenir la clé de l’utilisateur', 'POST /v1_0/apiuser/{id}/apikey', r.http, !!apiKey, apiKey ? 'clé reçue (gardée sur le serveur)' : motif(r.corps));
    if (!apiKey) { if (!detaille) note(titre, 'POST /v1_0/apiuser/{id}/apikey', r.http, false, motif(r.corps)); return null; }
    r = await appel('POST', `/${nom}/token/`, { Authorization: 'Basic ' + btoa(`${u}:${apiKey}`) });
    const jeton = r.http === 200 ? String(r.corps?.access_token ?? '') : '';
    if (detaille) note('Obtenir le jeton d’accès', `POST /${nom}/token/`, r.http, !!jeton, jeton ? `jeton reçu, valable ${r.corps?.expires_in ?? '?'} s` : motif(r.corps));
    else note(titre, 'POST /v1_0/apiuser, puis sa clé et son jeton', r.http, !!jeton, jeton ? `utilisateur ${court(u)}, rappels vers ${hoteRappel}` : motif(r.corps));
    return jeton ? { Authorization: `Bearer ${jeton}`, 'X-Target-Environment': ENV_CIBLE } : null;
  };

  const auth = await entree(new URL(o.origineRappel).host, true, '');
  if (!auth) return refs;

  // Ce numéro a-t-il un compte MoMo ?
  let r = await appel('GET', `/${nom}/v1_0/accountholder/msisdn/${NUMERO_REUSSI}/active`, auth);
  note('Vérifier qu’un numéro a un compte', `GET /${nom}/v1_0/accountholder/msisdn/{numéro}/active`, r.http, r.http === 200, r.http === 200 ? `compte actif : ${r.corps?.result === true ? 'oui' : 'non'}` : motif(r.corps));

  /** Une opération, suivie jusqu'à son statut. */
  const suis = async (etape: string, cheminPost: string, corps: unknown, attendu: (s: string) => boolean, a: Record<string, string>, rappel: boolean) => {
    const ref = o.uuid();
    const entetes: Record<string, string> = { ...a, 'X-Reference-Id': ref };
    if (rappel) { entetes['X-Callback-Url'] = o.adresseRappel(ref); refs.push(ref); }
    const p = await appel('POST', cheminPost, entetes, corps);
    const requete = `POST ${cheminPost}${rappel ? ' (avec adresse de rappel)' : ''} puis GET ${cheminPost}/{référence}`;
    if (p.http !== 202) { note(etape, requete, p.http, false, motif(p.corps)); return { statut: 'REFUSEE', pourquoi: motif(p.corps) }; }
    let statut = 'PENDING';
    let lu: any = null;
    let http: number | null = null;
    for (let k = 0; k < 6; k++) {
      const g = await appel('GET', `${cheminPost}/${ref}`, a);
      http = g.http; lu = g.corps;
      statut = String(lu?.status ?? (g.http === 200 ? 'PENDING' : 'INCONNU'));
      if (!EN_COURS.has(statut)) break;
      await o.attendre(o.pause);
    }
    const piece = lu?.financialTransactionId ? `, transaction ${lu.financialTransactionId}` : '';
    const pourquoi = motif(lu);
    note(etape, requete, http, attendu(statut), `acceptée (202), statut ${statut}${piece}${pourquoi ? `, motif ${pourquoi}` : ''}`);
    return { statut, pourquoi };
  };
  const reussie = (s: string) => s === 'SUCCESSFUL';
  const montant = { amount: MONTANT, currency: DEVISE };
  const message = { payerMessage: 'Maison MND, essai', payeeNote: 'Essai Sandbox' };

  if (nom === 'collection') {
    const demande = (externalId: string, numero: string) => ({ ...montant, externalId, payer: { partyIdType: 'MSISDN', partyId: numero }, ...message });
    await suis('Demande de paiement qui réussit', '/collection/v1_0/requesttopay', demande('MND-ESSAI-1', NUMERO_REUSSI), reussie, auth, false);
    await suis('Demande de paiement refusée par la cliente', '/collection/v1_0/requesttopay', demande('MND-ESSAI-2', NUMERO_REFUSE), (s) => s === 'REJECTED' || s === 'FAILED', auth, false);
    const avec = await suis('Demande avec adresse de rappel', '/collection/v1_0/requesttopay', demande('MND-ESSAI-3', NUMERO_REUSSI), reussie, auth, true);
    if (avec.pourquoi === 'INVALID_CALLBACK_URL_HOST') {
      const auth2 = await entree(o.origineRappel, false, 'Second utilisateur, rappels vers l’origine complète');
      if (auth2) await suis('Demande avec adresse de rappel (origine complète)', '/collection/v1_0/requesttopay', demande('MND-ESSAI-4', NUMERO_REUSSI), reussie, auth2, true);
    }
  } else {
    const vers = (externalId: string) => ({ ...montant, externalId, payee: { partyIdType: 'MSISDN', partyId: NUMERO_REUSSI }, ...message });
    const v = await suis('Virement vers un compte MoMo', '/disbursement/v1_0/transfer', vers('MND-ESSAI-5'), reussie, auth, false);
    if (!reussie(v.statut)) await suis('Dépôt vers un compte MoMo', '/disbursement/v1_0/deposit', vers('MND-ESSAI-6'), reussie, auth, false);
  }

  // Le solde, puis le solde par sa devise si le premier est refusé.
  r = await appel('GET', `/${nom}/v1_0/account/balance`, auth);
  note('Lire le solde du compte', `GET /${nom}/v1_0/account/balance`, r.http, r.http === 200,
    r.http === 200 ? `solde ${r.corps?.availableBalance ?? '?'} ${r.corps?.currency ?? ''}`.trim() : motif(r.corps));
  if (r.http !== 200) {
    r = await appel('GET', `/${nom}/v1_0/account/balance/${DEVISE}`, auth);
    note('Lire le solde en euros', `GET /${nom}/v1_0/account/balance/${DEVISE}`, r.http, r.http === 200,
      r.http === 200 ? `solde ${r.corps?.availableBalance ?? '?'} ${r.corps?.currency ?? ''}`.trim() : motif(r.corps));
  }
  return refs;
}

/** LES ESSAIS, D'UN BOUT À L'AUTRE. Les clés absentes sont dites, jamais montrées. */
async function deroule(cles: { collection: string; disbursement: string }, o: Outils) {
  const etapes: Etape[] = [];
  const refs: string[] = [];
  for (const nom of ['collection', 'disbursement'] as const) {
    if (!cles[nom]) {
      etapes.push({ produit: nom, etape: 'Clé d’abonnement', requete: '', http: null, ok: false, detail: 'clé absente : secret à poser' });
      continue;
    }
    refs.push(...await produit(nom, cles[nom], o, etapes));
  }
  if (refs.length) await o.attendre(o.pause);
  let lus: Record<string, { status?: string; quand?: string }> = {};
  try { lus = await o.lireRappels(); } catch { lus = {}; }
  const rappels = refs.map((ref) => ({ reference: court(ref), recu: !!lus[ref], statut: lus[ref]?.status ?? null }));
  return {
    environnement: ENV_CIBLE,
    adresse: BASE,
    devise: DEVISE,
    montant: MONTANT,
    reussis: etapes.filter((e) => e.ok).length,
    total: etapes.length,
    etapes,
    rappels,
  };
}
// ── FIN deroule

const URL_PROJET = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const ANON = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();
const SERVICE = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const CLE_RAPPELS = 'mtn_momo_essais_rappels';
const REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cles = () => ({
  collection: (Deno.env.get('MOMO_SANDBOX_COLLECTION_KEY') ?? '').trim(),
  disbursement: (Deno.env.get('MOMO_SANDBOX_DISBURSEMENT_KEY') ?? '').trim(),
});

const service = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
async function rappelsGardes(): Promise<Record<string, { status?: string; quand?: string }>> {
  const r = await fetch(`${URL_PROJET}/rest/v1/documents?key=eq.${CLE_RAPPELS}&select=data`, { headers: service });
  const lignes = r.ok ? await r.json() : [];
  return (Array.isArray(lignes) && lignes[0]?.data?.parRef) || {};
}
async function gardeLeRappel(ref: string, status: string) {
  const parRef = await rappelsGardes();
  parRef[ref] = { status, quand: new Date().toISOString() };
  /* Les cinquante derniers suffisent : ce sont des essais. */
  const gardes = Object.fromEntries(Object.entries(parRef).sort((a, b) => String(b[1].quand).localeCompare(String(a[1].quand))).slice(0, 50));
  await fetch(`${URL_PROJET}/rest/v1/documents`, {
    method: 'POST',
    headers: { ...service, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: CLE_RAPPELS, data: { parRef: gardes } }),
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const k = cles();

  const ref = url.searchParams.get('rappel');
  if (ref !== null) {
    if (!REF.test(ref) || (req.method !== 'POST' && req.method !== 'PUT')) return json({ erreur: 'rappel illisible' }, 400);
    let corps: any = null;
    try { corps = await req.json(); } catch { /* corps vide */ }
    await gardeLeRappel(ref, String(corps?.status ?? 'SANS STATUT').slice(0, 30));
    return json({ recu: true });
  }

  if (req.method === 'GET') {
    return json({ fonction: 'mtn-momo-essais', version: VERSION, sandbox: true, cles: { collection: !!k.collection, disbursement: !!k.disbursement } });
  }

  if (req.method === 'POST' && url.searchParams.get('lancer') === '1') {
    const jeton = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!ANON || jeton !== ANON) return json({ erreur: 'clé du projet attendue' }, 401);
    const rapport = await deroule(k, {
      f: fetch,
      attendre: (ms) => new Promise((ok) => setTimeout(ok, ms)),
      uuid: () => crypto.randomUUID(),
      pause: Number(Deno.env.get('MOMO_ESSAIS_PAUSE_MS') ?? '2000'),
      origineRappel: new URL(URL_PROJET).origin,
      adresseRappel: (r) => `${URL_PROJET}/functions/v1/mtn-momo-essais?rappel=${r}`,
      lireRappels: rappelsGardes,
    });
    return json({ fonction: 'mtn-momo-essais', version: VERSION, quand: new Date().toISOString(), ...rapport });
  }

  return json({ erreur: 'demande inconnue' }, 404);
});
