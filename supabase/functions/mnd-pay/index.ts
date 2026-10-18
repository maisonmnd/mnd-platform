// mnd-pay - la caisse MND PAY parle a FedaPay.
//
// Premiere ligne volontairement pauvre (lecon du 14 septembre 2026) : un
// fichier colle a la main doit commencer par une ligne qui survit a un
// collage de travers.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ═══════════════════════════════════════════════════════════════════
   MND-PAY — 16 octobre 2026. Maquette UigU1Rr5… validée (« construis »).

   La caissière DEMANDE, FedaPay ENCAISSE, le Trône VOIT. Cette fonction est
   la seule porte du Trône vers FedaPay : la clé secrète ne quitte jamais le
   serveur, et seul le personnel l'ouvre.

   TROIS GESTES (et Tap & Go, 17 octobre 2026) :
     · `demander` : crée la transaction chez FedaPay, son jeton et sa page de
       paiement, écrit la demande dans `mnd_pay`, puis, pour MTN, Moov ou
       Celtiis, envoie la demande DIRECTEMENT sur le téléphone de la cliente.
       Si l'envoi direct échoue, la page de paiement reste : le comptoir
       montre son QR, rien n'est perdu.
     · `statut` : redemande la vérité à FedaPay (le filet quand le webhook
       tarde, ou n'est pas encore branché).
     · `annuler` : la caissière renonce. Si la cliente paie quand même, le
       webhook l'inscrira : un argent reçu ne se refuse jamais en silence.

   TAP & GO (moyen `tapgo`) : `demander` ne crée AUCUNE transaction, la
   cliente la fera naître en composant *601*14*<code>*<montant>#. On n'écrit
   qu'une ATTENTE du montant. Le webhook la reconnaît au montant
   (`rangeLeTapGo`) ; `statut` avec `chercher` relit les dernières
   transactions de FedaPay, au cas où le webhook tarderait.

   LE STATUT « PAYÉE » NE VIENT QUE DE FEDAPAY, relu ici ou par
   `mnd-pay-webhook`. Personne d'autre n'écrit la table (0133).

   SECRETS (Supabase › Edge Functions › Secrets, partagés) :
     FEDAPAY_SECRET_KEY   la clé secrète (sk_live_… ou sk_sandbox_…)
     FEDAPAY_ENV          « live » (défaut) ou « sandbox »
     MND_PAY_RETOUR       facultatif : la page où FedaPay ramène la cliente
     SUPABASE_SERVICE_ROLE_KEY (ou CLE_SERVICE) : déjà posée
   ═══════════════════════════════════════════════════════════════════ */

const VERSION = '2026-10-18-a';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const refus = (erreur: string, status = 400) => json({ erreur, version: VERSION }, status);

const SECRET = (Deno.env.get('FEDAPAY_SECRET_KEY') ?? '').trim();
const ENV = (Deno.env.get('FEDAPAY_ENV') ?? 'live').trim().toLowerCase();
const BASE = ENV === 'sandbox' || ENV === 'test' ? 'https://sandbox-api.fedapay.com/v1' : 'https://api.fedapay.com/v1';
const RETOUR = (Deno.env.get('MND_PAY_RETOUR') ?? 'https://maisonmnd.com/trone/paye.html').trim();

/** Au-delà, ce n'est plus une vente de comptoir : une faute de frappe. */
const PLAFOND_XOF = 5_000_000;
const MOYENS = ['mtn', 'moov', 'celtiis', 'carte', 'au_choix', 'tapgo'];
const AU_TELEPHONE = ['mtn', 'moov', 'celtiis'];
const MODES_DEFAUT: Record<string, string> = { mtn: 'mtn_open', moov: 'moov', celtiis: 'sbin' };

/** Parler à FedaPay. Une réponse 2xx rend son corps ; sinon une erreur qui
    dit ce que FedaPay a dit (le motif le plus court à lire). */
async function fedapay(methode: 'GET' | 'POST', chemin: string, corps?: unknown): Promise<any> {
  const rep = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: {
      authorization: `Bearer ${SECRET}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
  });
  const texte = await rep.text();
  let lu: any = null;
  try { lu = texte ? JSON.parse(texte) : null; } catch { lu = null; }
  if (!rep.ok) {
    const motif = motifDeFedaPay(lu);
    throw new Error(`FedaPay ${rep.status}${motif ? ` : ${motif.slice(0, 300)}` : ''}`);
  }
  return lu;
}

// ── DEBUT motifDeFedaPay (relu par scripts/verifie-mnd-pay)
/** CE QUE FEDAPAY DIT VRAIMENT — 17 octobre 2026. « La création de la
    transaction a échoué » seul ne dit pas POURQUOI (un lien de 10 079 F
    refusé au comptoir, sans autre mot) : le détail vit dans `errors`, un
    objet « champ → messages ». On rend la phrase ET le détail. */
function motifDeFedaPay(lu: any): string {
  const phrase = String(lu?.message ?? lu?.error ?? '').trim();
  const e = lu?.errors;
  let detail = '';
  if (Array.isArray(e)) detail = e.map(String).join(' ; ');
  else if (e && typeof e === 'object') {
    detail = Object.entries(e).map(([champ, v]) => `${champ} : ${Array.isArray(v) ? v.map(String).join(', ') : String(v)}`).join(' ; ');
  } else if (typeof e === 'string') detail = e;
  return [phrase, detail].filter(Boolean).join(' · ');
}
// ── FIN motifDeFedaPay

/** La transaction dans une réponse : FedaPay l'emballe sous « v1/transaction »
    (le SDK officiel retire ce préfixe, `Util::stripApiVersion`). */
const laTransaction = (r: any): any => r?.['v1/transaction'] ?? r?.transaction ?? r;

// ── DEBUT statutDepuisFedaPay (relu par scripts/verifie-mnd-pay : même règle que src/shared/mnd-pay-pur.ts)
function statutDepuisFedaPay(s: unknown): string {
  const v = String(s ?? '').toLowerCase();
  if (['approved', 'transferred', 'refunded', 'approved_partially_refunded', 'transferred_partially_refunded'].includes(v)) return 'payee';
  if (v === 'declined') return 'refusee';
  if (v === 'canceled' || v === 'cancelled') return 'annulee';
  if (v === 'expired') return 'expiree';
  return 'en_attente';
}
// ── FIN statutDepuisFedaPay

// ── DEBUT numeroPourFedaPay (même règle que src/shared/mnd-pay-pur.ts)
function numeroPourFedaPay(tel: unknown): { number: string; country: string } | null {
  const brut = String(tel ?? '').trim();
  if (!brut) return null;
  const chiffres = brut.replace(/\D/g, '');
  if (!chiffres) return null;
  let local = chiffres;
  if (brut.startsWith('+') || chiffres.startsWith('00')) {
    const sans = chiffres.replace(/^00/, '');
    if (!sans.startsWith('229')) return sans.length >= 8 ? { number: `+${sans}`, country: 'bj' } : null;
    local = sans.slice(3);
  } else if (chiffres.startsWith('229') && chiffres.length >= 11) {
    local = chiffres.slice(3);
  }
  /* Un ancien numéro (huit chiffres, sans zéro devant) reçoit son « 01 » ;
     huit chiffres qui commencent par 0 sont un numéro neuf tronqué : refusé,
     plutôt que de faire sonner le téléphone d'un inconnu. */
  if (local.length === 8 && !local.startsWith('0')) local = `01${local}`;
  if (local.length !== 10) return null;
  return { number: `+229${local}`, country: 'bj' };
}
// ── FIN numeroPourFedaPay

// ── DEBUT instantDe (même texte que src/shared/mnd-pay-pur.ts, relu par scripts/verifie-mnd-pay)
/** UN INSTANT DE FEDAPAY EN MILLISECONDES. Ses dates portent six décimales
    (« 2026-10-17T08:12:03.000000Z ») ou un espace au lieu du T ; sans fuseau,
    c'est l'heure universelle. NaN quand rien ne se lit. */
function instantDe(s: unknown): number {
  const brut = String(s ?? '').trim();
  if (!brut) return NaN;
  let iso = brut.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso)) iso += 'Z';
  return Date.parse(iso);
}
// ── FIN instantDe

// ── DEBUT rapprocheTapGo (même texte que src/shared/mnd-pay-pur.ts, relu par scripts/verifie-mnd-pay)
/** QUELLE ATTENTE CE PAIEMENT RÈGLE-T-IL ? Une attente Tap & Go, encore en
    attente, sans transaction, du même montant à un franc près. Au comptoir,
    posée au plus une demi-heure avant le paiement ; sur une FACTURE envoyée
    (genre « lien », 17 octobre 2026), le temps qu'elle paie : quarante-cinq
    jours. Deux minutes d'avance tolérées pour les horloges. Le comptoir passe
    d'abord : la cliente qui compose devant la caissière est celle qu'on
    attend. Une seule attente : c'est elle. Plusieurs : on ne choisit pas. */
function rapprocheTapGo(
  paiement: { montantXof: number; quandMs: number },
  attentes: readonly { id: string; moyen?: string; statut?: string; fedapayId?: number; totalXof?: number; creeLe?: string; genre?: string }[],
): { sorte: 'une'; id: string } | { sorte: 'aucune' } | { sorte: 'plusieurs'; ids: string[] } {
  const montant = Math.round(Number(paiement.montantXof) || 0);
  if (montant <= 0) return { sorte: 'aucune' };
  const valables = attentes.filter((a) => {
    if (a.moyen !== 'tapgo' || a.statut !== 'en_attente' || a.fedapayId) return false;
    if (Math.abs(Math.round(Number(a.totalXof) || 0) - montant) > 1) return false;
    const t = Date.parse(String(a.creeLe ?? ''));
    if (!Number.isFinite(t) || !Number.isFinite(paiement.quandMs)) return false;
    const ecart = paiement.quandMs - t;
    const fenetre = a.genre === 'lien' ? 45 * 86_400_000 : 30 * 60_000;
    return ecart >= -2 * 60_000 && ecart <= fenetre;
  });
  const auComptoir = valables.filter((a) => a.genre !== 'lien').map((a) => a.id);
  const ids = auComptoir.length > 0 ? auComptoir : valables.map((a) => a.id);
  if (ids.length === 1) return { sorte: 'une', id: ids[0] };
  return ids.length === 0 ? { sorte: 'aucune' } : { sorte: 'plusieurs', ids };
}
// ── FIN rapprocheTapGo

// ── DEBUT rangeLeTapGo (même texte dans mnd-pay et mnd-pay-webhook)
/** UN PAIEMENT QUE MND PAY N'A PAS CRÉÉ — Tap & Go, 17 octobre 2026 : la
    cliente a composé le code USSD de la Maison. La transaction a été RELUE
    chez FedaPay avant d'arriver ici. Seul un « payé » range quelque chose.
    Une attente du même montant, et une seule : elle passe « payée », et le
    comptoir qui l'attend s'encaisse seul. Aucune, ou plusieurs : la ligne
    s'écrit « À rattacher » (identifiant tiré de la transaction : deux appels
    simultanés n'en écrivent qu'une). */
async function rangeLeTapGo(admin: any, tx: any): Promise<string> {
  const fedapayId = Number(tx?.id);
  if (!Number.isFinite(fedapayId) || fedapayId <= 0) return 'sans transaction';
  if (statutDepuisFedaPay(tx?.status) !== 'payee') return 'pas encore payée';
  const { data: connue } = await admin.from('mnd_pay').select('id').eq('data->>fedapayId', String(fedapayId)).limit(1);
  if ((connue ?? []).length > 0) return 'deja';
  const montantXof = Math.round(Number(tx?.amount ?? 0));
  if (!(montantXof > 0)) return 'sans montant';
  const quand = instantDe(tx?.approved_at ?? tx?.created_at);
  const quandMs = Number.isFinite(quand) ? quand : Date.now();
  /* Les attentes d'une facture vivent quarante-cinq jours (17 octobre 2026). */
  const depuis = new Date(quandMs - 46 * 86_400_000).toISOString();
  const { data: lignes } = await admin.from('mnd_pay').select('id, branch_id, data')
    .eq('data->>moyen', 'tapgo').eq('data->>statut', 'en_attente').gte('updated_at', depuis).limit(500);
  const attentes = (lignes ?? []).map((l: any) => ({ ...(l.data ?? {}), id: String(l.id) }));
  const choix = rapprocheTapGo({ montantXof, quandMs }, attentes);
  const commun: Record<string, unknown> = {
    statut: 'payee',
    fedapayId,
    ...(tx?.reference ? { reference: String(tx.reference) } : {}),
    ...(tx?.mode ? { modeReel: String(tx.mode) } : {}),
    ...(Number.isFinite(Number(tx?.fees)) && Number(tx?.fees) > 0 ? { commissionXof: Math.round(Number(tx.fees)) } : {}),
    payeeLe: new Date(quandMs).toISOString(),
  };
  if (choix.sorte === 'une') {
    const ligne = (lignes ?? []).find((l: any) => String(l.id) === choix.id);
    const { error } = await admin.from('mnd_pay').update({ data: { ...(ligne?.data ?? {}), ...commun } })
      .eq('id', choix.id).eq('data->>statut', 'en_attente');
    if (error) throw new Error(error.message);
    return `rattachée à ${choix.id}`;
  }
  let branchId = choix.sorte === 'plusieurs'
    ? String((lignes ?? []).find((l: any) => String(l.id) === choix.ids[0])?.branch_id ?? '')
    : '';
  if (!branchId) {
    const { data: derniere } = await admin.from('mnd_pay').select('branch_id').not('branch_id', 'is', null)
      .order('updated_at', { ascending: false }).limit(1);
    branchId = String(derniere?.[0]?.branch_id ?? '');
  }
  if (!branchId) {
    const { data: branches } = await admin.from('branches').select('id').limit(1);
    branchId = String(branches?.[0]?.id ?? '');
  }
  const id = `tg-${fedapayId}`;
  const data = {
    id, branchId, genre: 'comptoir', moyen: 'tapgo', montantXof, fraisXof: 0, totalXof: montantXof,
    pieceId: '', libelle: 'Tap & Go, code composé par la cliente', creeLe: new Date(quandMs).toISOString(),
    ...commun,
    ...(choix.sorte === 'plusieurs' ? { raison: `${choix.ids.length} tickets attendaient ce montant : à rattacher à la main` } : {}),
  };
  const { error } = await admin.from('mnd_pay').insert({ id, branch_id: branchId || null, data });
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  return 'à rattacher';
}
// ── FIN rangeLeTapGo

/** LA TRANSACTION RELUE, POSÉE SUR LA DEMANDE. Un « payé » se pose même sur
    une demande annulée au comptoir : la cliente a payé, l'argent est là. Le
    montant reçu doit couvrir ce qui était demandé. */
async function poseLaTransaction(admin: any, ligne: { id: string; data: any }, tx: any): Promise<any> {
  const d = ligne.data ?? {};
  let statut = statutDepuisFedaPay(tx?.status);
  let raison: string | undefined;
  const recu = Math.round(Number(tx?.amount ?? 0));
  if (statut === 'payee' && recu + 1 < Math.round(Number(d.totalXof ?? 0))) {
    statut = 'refusee';
    raison = `montant reçu ${recu} F, attendu ${d.totalXof} F : à voir avec FedaPay`;
  }
  if (statut === d.statut && !raison) return d;
  if (d.statut === 'payee') return d; // un paiement reçu ne se défait pas ici
  const suite = {
    ...d,
    statut,
    ...(tx?.mode ? { modeReel: String(tx.mode) } : {}),
    ...(Number.isFinite(Number(tx?.fees)) && Number(tx?.fees) > 0 ? { commissionXof: Math.round(Number(tx.fees)) } : {}),
    ...(statut === 'payee' ? { payeeLe: String(tx?.approved_at ?? new Date().toISOString()) } : {}),
    ...(raison ? { raison } : statut === 'refusee' && tx?.last_error_code ? { raison: String(tx.last_error_code) } : {}),
  };
  const { error } = await admin.from('mnd_pay').update({ data: suite }).eq('id', ligne.id);
  if (error) throw new Error(error.message);
  return suite;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  /* LE DIAGNOSTIC : quels secrets sont posés (jamais leur valeur) et à quelle
     adresse on parle. Un 401 de FedaPay vient presque toujours d'une clé de
     bac à sable envoyée à la production, ou l'inverse. */
  if (req.method === 'GET') {
    return json({
      version: VERSION,
      base: BASE,
      secrets: {
        fedapay: SECRET !== '',
        cle: SECRET ? (SECRET.startsWith('sk_live') ? 'live' : SECRET.startsWith('sk_sandbox') ? 'sandbox' : 'autre') : 'absente',
        service: !!(Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),
      },
    });
  }
  if (req.method !== 'POST') return refus('POST seulement', 405);

  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!urlBase || !service) return refus('la fonction n’est pas configurée', 500);
  if (!SECRET) return refus('la clé FedaPay n’est pas posée (FEDAPAY_SECRET_KEY)', 500);

  /* SEUL LE PERSONNEL ENCAISSE. On demande à la base ce qu'elle pense du
     jeton présenté (`is_staff`), comme toutes les politiques : un jeton de
     cliente est un jeton valide, il n'ouvre pas la caisse. */
  const jeton = req.headers.get('authorization') ?? '';
  if (!jeton.toLowerCase().startsWith('bearer ')) return refus('session requise', 401);
  const commeAppelant = createClient(urlBase, anon, { global: { headers: { authorization: jeton } } });
  const { data: estPersonnel, error: errStaff } = await commeAppelant.rpc('is_staff');
  if (errStaff || estPersonnel !== true) return refus('réservé au personnel', 403);
  const { data: qui } = await commeAppelant.auth.getUser();
  const parQui = String(qui?.user?.email ?? '').slice(0, 120) || undefined;

  let corps: Record<string, any> = {};
  try { corps = await req.json(); } catch { return refus('corps illisible'); }
  const admin = createClient(urlBase, service, { auth: { persistSession: false } });
  const action = String(corps.action ?? '');

  try {
    if (action === 'demander') {
      const entier = (x: unknown) => Math.round(Number(x));
      const montantXof = entier(corps.montantXof);
      const pourboireXof = Math.max(0, entier(corps.pourboireXof ?? 0) || 0);
      const fraisXof = Math.max(0, entier(corps.fraisXof ?? 0) || 0);
      /* LES FRAIS OFFERTS (18 octobre 2026) : la cliente paie sans les frais,
         la Maison les prend. Gardés sur la demande pour la dépense du Trône,
         jamais plus d'un dixième de ce qui passe (une commission, pas un don). */
      const offertsLus = Math.max(0, entier(corps.fraisOffertsXof ?? 0) || 0);
      const moyen = String(corps.moyen ?? '');
      const genre = corps.genre === 'lien' ? 'lien' : 'comptoir';
      const branchId = String(corps.branchId ?? '').trim();
      const pieceId = String(corps.pieceId ?? '').trim();
      if (!MOYENS.includes(moyen)) return refus('moyen inconnu');
      if (!Number.isFinite(montantXof) || montantXof <= 0) return refus('le montant doit être positif');
      if (!branchId || !pieceId) return refus('la branche et la pièce sont requises');
      const totalXof = montantXof + pourboireXof + fraisXof;
      const fraisOffertsXof = fraisXof === 0 ? Math.min(offertsLus, Math.ceil((montantXof + pourboireXof) / 10)) : 0;
      const offre: Record<string, unknown> = fraisOffertsXof > 0
        ? { fraisOffertsXof, ...(corps.fraisOffertsPar ? { fraisOffertsPar: String(corps.fraisOffertsPar).replace(/\s+/g, ' ').trim().slice(0, 80) } : {}) }
        : {};
      if (totalXof > PLAFOND_XOF) return refus(`au-delà de ${PLAFOND_XOF.toLocaleString('fr-FR')} F, vérifiez le montant`);
      const auTelephone = AU_TELEPHONE.includes(moyen);
      const numero = numeroPourFedaPay(corps.telephone);
      if (auTelephone && !numero) return refus('ce numéro n’est pas lisible : dix chiffres, comme 01 97 00 00 00');
      const mode = auTelephone ? (String(corps.mode ?? '').trim() || MODES_DEFAUT[moyen]) : '';
      if (mode && !/^[a-z0-9_]{2,30}$/.test(mode)) return refus('code de moyen FedaPay illisible');

      const libelle = String(corps.libelle ?? 'Maison MND').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Maison MND';
      const id = `mp-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

      /* TAP & GO : une attente, rien chez FedaPay. Le montant EST la clé du
         rapprochement : c'est le total exact que la cliente composera. */
      if (moyen === 'tapgo') {
        /* UNE FACTURE, UNE ATTENTE (17 octobre 2026) : la même pièce au même
           total, c'est la même attente ; un reste qui a changé remplace
           l'ancienne, sinon deux attentes de la même facture se
           disputeraient le paiement. */
        if (genre === 'lien') {
          const { data: deja } = await admin.from('mnd_pay').select('id, data')
            .eq('data->>moyen', 'tapgo').eq('data->>statut', 'en_attente').eq('data->>pieceId', pieceId).limit(20);
          const meme = (deja ?? []).find((l: any) => Math.round(Number(l.data?.totalXof ?? 0)) === totalXof);
          if (meme) return json({ ok: true, version: VERSION, id: meme.id, url: '', directe: false, deja: true });
          for (const l of (deja ?? []) as any[]) {
            await admin.from('mnd_pay').update({ data: { ...l.data, statut: 'annulee', raison: 'remplacée : le reste de la pièce a changé' } }).eq('id', l.id);
          }
        }
        const attente: Record<string, unknown> = {
          id, branchId, genre, moyen, montantXof, fraisXof, ...offre, totalXof,
          ...(pourboireXof > 0 ? { pourboireXof } : {}),
          pieceId,
          ...(corps.pieceNumero ? { pieceNumero: String(corps.pieceNumero).slice(0, 40) } : {}),
          ...(corps.clientId ? { clientId: String(corps.clientId).slice(0, 80) } : {}),
          libelle,
          statut: 'en_attente',
          creeLe: new Date().toISOString(),
          ...(parQui ? { creePar: parQui } : {}),
        };
        const { error: errAttente } = await admin.from('mnd_pay').insert({ id, branch_id: branchId, data: attente });
        if (errAttente) throw new Error(errAttente.message);
        return json({ ok: true, version: VERSION, id, url: '', directe: false });
      }

      // ① La transaction, ② son jeton et sa page de paiement.
      const creee = laTransaction(await fedapay('POST', '/transactions', {
        description: libelle,
        amount: totalXof,
        currency: { iso: 'XOF' },
        callback_url: RETOUR,
      }));
      const fedapayId = Number(creee?.id);
      if (!Number.isFinite(fedapayId) || fedapayId <= 0) throw new Error('FedaPay n’a pas rendu de transaction');
      const jetonTx = await fedapay('POST', `/transactions/${fedapayId}/token`);
      const token = jetonTx?.token;
      const url = String(jetonTx?.url ?? '');

      const data: Record<string, unknown> = {
        id, branchId, genre, moyen, montantXof, fraisXof, ...offre, totalXof,
        ...(pourboireXof > 0 ? { pourboireXof } : {}),
        pieceId,
        ...(corps.pieceNumero ? { pieceNumero: String(corps.pieceNumero).slice(0, 40) } : {}),
        ...(corps.clientId ? { clientId: String(corps.clientId).slice(0, 80) } : {}),
        ...(numero ? { telephone: numero.number } : {}),
        libelle,
        statut: 'en_attente',
        fedapayId,
        ...(creee?.reference ? { reference: String(creee.reference) } : {}),
        ...(url ? { url } : {}),
        creeLe: new Date().toISOString(),
        ...(parQui ? { creePar: parQui } : {}),
      };
      // ③ La demande s'écrit AVANT l'envoi au téléphone : un paiement ne doit
      //    jamais arriver pour une demande qui n'existe pas encore.
      const { error: insErr } = await admin.from('mnd_pay').insert({ id, branch_id: branchId, data });
      if (insErr) throw new Error(insErr.message);

      // ④ L'envoi direct au téléphone. Refusé, la page reste : le comptoir
      //    montre son QR et la cliente paie autrement.
      let directe = false;
      let raison: string | undefined;
      if (auTelephone) {
        try {
          await fedapay('POST', `/${mode}`, { token, phone_number: numero });
          directe = true;
        } catch (e) {
          raison = e instanceof Error ? e.message : String(e);
          await admin.from('mnd_pay').update({ data: { ...data, raison: `envoi au téléphone refusé (${raison.slice(0, 160)}) : faites scanner le QR` } }).eq('id', id);
        }
      }
      return json({ ok: true, version: VERSION, id, url, directe, ...(raison ? { raison } : {}) });
    }

    if (action === 'statut' || action === 'annuler') {
      const id = String(corps.id ?? '');
      const { data: ligne } = await admin.from('mnd_pay').select('id, data').eq('id', id).maybeSingle();
      if (!ligne) return refus('demande introuvable', 404);
      let d = ligne.data ?? {};
      /* TAP & GO, LE FILET DU WEBHOOK : les dernières transactions de FedaPay,
         celles du même montant nées dans la demi-heure de l'attente. */
      if (d.moyen === 'tapgo' && !d.fedapayId && d.statut === 'en_attente' && corps.chercher === true) {
        const lu = await fedapay('GET', '/transactions?per_page=30');
        const liste: any[] = Array.isArray(lu?.['v1/transactions']) ? lu['v1/transactions']
          : Array.isArray(lu?.transactions) ? lu.transactions : Array.isArray(lu) ? lu : [];
        const depuis = Date.parse(String(d.creeLe ?? ''));
        const fenetre = d.genre === 'lien' ? 45 * 86_400_000 : 30 * 60_000;
        for (const tx of liste) {
          const t = instantDe(tx?.approved_at ?? tx?.created_at);
          if (!Number.isFinite(t) || !Number.isFinite(depuis) || t < depuis - 2 * 60_000 || t > depuis + fenetre) continue;
          if (Math.abs(Math.round(Number(tx?.amount ?? 0)) - Math.round(Number(d.totalXof ?? 0))) > 1) continue;
          await rangeLeTapGo(admin, tx);
        }
        const { data: relue } = await admin.from('mnd_pay').select('id, data').eq('id', id).maybeSingle();
        if (relue) d = relue.data ?? d;
      }
      if (d.fedapayId && d.statut !== 'payee') {
        const tx = laTransaction(await fedapay('GET', `/transactions/${d.fedapayId}`));
        d = await poseLaTransaction(admin, ligne, tx);
      }
      if (action === 'annuler' && d.statut === 'en_attente') {
        d = { ...d, statut: 'annulee', raison: `annulée au comptoir${parQui ? ` par ${parQui}` : ''}` };
        const { error } = await admin.from('mnd_pay').update({ data: d }).eq('id', id);
        if (error) throw new Error(error.message);
      }
      return json({ ok: true, version: VERSION, demande: d });
    }

    return refus('geste inconnu : demander, statut ou annuler');
  } catch (e) {
    return refus(e instanceof Error ? e.message : String(e), 502);
  }
});
