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

/* 20 octobre 2026 (le parcours de l'abonnée) : une demande qui règle un
   contrat s'inscrit au contrat ET à sa pièce (`verse_sur_l_abonnement`).

   12 novembre 2026 (le choix du moyen, lot C, « chacun secours de
   l'autre ») : UNE ENTRÉE PUBLIQUE pour la page « Régler » d'un
   rendez-vous, quand KkiaPay ne s'y ouvre pas. Par le jeton du rendez-vous
   seulement, sous limite de débit, jamais avec une session :
     · `regler-ouvert`   : FedaPay est-il ouvert, et ses taux (rien d'autre) ;
     · `regler-demander` : une demande « au choix » au montant DU SERVEUR (le
       reste de SA pièce, plus un merci plafonné s'il est permis, plus les
       frais de FedaPay au taux de la Maison), écrite au registre AVANT
       l'appel à FedaPay, qui ramène la cliente à la page Régler ;
     · `regler-statut`   : l'état de CETTE demande, relu chez FedaPay, et rien
       d'autre. Payée, elle se pose sur sa pièce et son rendez-vous (ici, ou
       par mnd-pay-webhook), sans qu'un Trône soit ouvert.
   Les règles : src/shared/regler-par-fedapay-pur.ts, recopiées plus bas.
   LA PORTE DE LA PAGE NE PORTE PAS DE JWT (sa clé est « publishable ») :
   la fonction se déploie « Verify JWT » ÉTEINT ; les gestes du personnel
   restent gardés ici, par `is_staff` sur le jeton présenté. */
const VERSION = '2026-11-12-b';

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

// ── DEBUT duDuContrat (éprouvé par scripts/verifie-le-serveur-de-l-abonnee : même réponse que argentDuContrat)
function duDuContrat(d: any, piece: any, plan: any, jour: string): { duXof: number; resteXof: number; raison?: 'resiliee' | 'effacee' | 'suspendue' | 'deja_regle' } {
  const n = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const iso = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const plus = (s: string, k: number): string => new Date(Date.parse(`${s}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
  const ouvre = (s: string): string => (iso(s) && new Date(`${s}T12:00:00Z`).getUTCDay() === 0 ? plus(s, 1) : s);
  /* LE VERSÉ : le contrat d'abord, puis sa pièce, réunis par identifiant. */
  const verses = new Map<string, number>();
  for (const p of Array.isArray(d?.payments) ? d.payments : []) if (p?.id) verses.set(String(p.id), n(p.amountXof));
  for (const p of Array.isArray(piece?.payments) ? piece.payments : []) if (p?.id && !verses.has(String(p.id))) verses.set(String(p.id), n(p.amountXof));
  const verse = [...verses.values()].reduce((s, x) => s + x, 0);
  const paquet = plan?.mode === 'pack';
  const prix = n(d?.prixConvenuXof ?? (paquet ? d?.priceXof : undefined) ?? plan?.priceXof ?? 0);
  if (d?.resilieeLe ? String(d.resilieeLe) <= jour : d?.status === 'churn') return { duXof: 0, resteXof: 0, raison: 'resiliee' };
  const ech = Array.isArray(d?.echeances) && d.echeances.length
    ? [...d.echeances].sort((a: any, b: any) => n(a?.numero) - n(b?.numero)).map((e: any) => n(e?.amountXof))
    : paquet && prix > 0 ? [prix] : [];
  /* LA RETENUE : prise en ligne, rien de réglé, sept jours (le lundi si le
     septième est un dimanche), puis effacée. */
  if (d?.origine === 'couronne' && verse <= 0) {
    if (d?.renonceeLe && String(d.renonceeLe) <= jour) return { duXof: 0, resteXof: 0, raison: 'effacee' };
    const debut = iso(d?.startIso) ? d.startIso : d?.sinceIso;
    if (iso(debut) && jour > ouvre(plus(debut, 7))) return { duXof: 0, resteXof: 0, raison: 'effacee' };
    return { duXof: ech[0] ?? prix, resteXof: ech.length ? ech.reduce((s: number, x: number) => s + x, 0) : prix };
  }
  /* UNE LUNE : jamais une dette, elle se règle d'avance ou pour sortir de la
     pause ; pas pendant une suspension. */
  if (!ech.length) {
    const s = d?.suspendue;
    if (s && s.du <= jour && jour <= s.au) return { duXof: 0, resteXof: 0, raison: 'suspendue' };
    if (paquet || !iso(d?.nextIso) || !(prix > 0)) return { duXof: 0, resteXof: 0, raison: 'deja_regle' };
    return { duXof: prix, resteXof: prix };
  }
  let reserve = Math.max(0, verse);
  let du = 0;
  let reste = 0;
  for (const m of ech) {
    const pris = Math.min(reserve, m);
    reserve -= pris;
    if (m - pris > 0 && du === 0) du = m - pris;
    reste += m - pris;
  }
  return du > 0 ? { duXof: du, resteXof: reste } : { duXof: 0, resteXof: 0, raison: 'deja_regle' };
}
// ── FIN duDuContrat

// ── DEBUT leContratEtSaPiece (même texte dans kkiapay-verify, kkiapay-webhook, mnd-pay et mnd-pay-webhook)
/** Le jour à Cotonou (UTC+1, sans heure d'été). */
const jourDeCotonou = (): string => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
/** La pièce et la formule d'un contrat, relues pour juger son dû. */
async function leContratEtSaPiece(admin: any, d: any): Promise<{ piece: any; plan: any }> {
  const piece = d?.invoiceId
    ? (await admin.from('invoices').select('data').eq('id', String(d.invoiceId)).maybeSingle())?.data?.data ?? null
    : null;
  const plan = d?.planId
    ? (await admin.from('plans').select('data').eq('id', String(d.planId)).maybeSingle())?.data?.data ?? null
    : null;
  return { piece, plan };
}
// ── FIN leContratEtSaPiece

/* ══ L'ARGENT D'UN CONTRAT — 20 octobre 2026 (le parcours de l'abonnée) ══
   « Le contrat fait foi, la pièce suit » (décision 6). Une demande MND PAY
   qui règle la pièce d'un abonnement (ou nomme son contrat, `subId`) ne
   s'inscrit plus seulement sur la pièce : `verse_sur_l_abonnement` (0138)
   l'écrit au contrat ET à la pièce, sous l'identifiant de la demande, le
   même que celui que le Trône inscrit (`versementDeLaDemande`) : deux
   inscriptions n'en font qu'une. Le montant demandé ne dépasse jamais ce
   que le contrat attend encore. Même texte dans mnd-pay et mnd-pay-webhook. */
// ── DEBUT moyenDeLaPiece (même corps que src/shared/mnd-pay-pur.ts)
function moyenDeLaPiece(d: any): string {
  const m = String(d.modeReel ?? '').toLowerCase();
  if (m.startsWith('mtn')) return 'MTN MoMo';
  if (m.startsWith('moov')) return 'Moov';
  if (m === 'sbin' || m.startsWith('celtiis')) return 'Celtiis';
  if (m && /card|visa|master|carte/.test(m)) return 'Carte';
  if (d.moyen === 'mtn') return 'MTN MoMo';
  if (d.moyen === 'moov') return 'Moov';
  if (d.moyen === 'celtiis') return 'Celtiis';
  if (d.moyen === 'carte') return 'Carte';
  return 'FedaPay';
}
// ── FIN moyenDeLaPiece

// ── DEBUT leContratDeLaDemande (même texte dans mnd-pay et mnd-pay-webhook)
/** Le contrat que règle une demande : celui qu'elle nomme, sinon le seul
    dont la pièce est la sienne. Rien s'il n'y en a pas, ou plusieurs. */
async function leContratDeLaDemande(admin: any, subId: unknown, pieceId: unknown): Promise<{ id: string; data: any; piece: any; plan: any } | null> {
  let ligne: any = null;
  if (String(subId ?? '').trim()) {
    ligne = (await admin.from('subscribers').select('id, data').eq('id', String(subId).trim()).maybeSingle())?.data ?? null;
  } else if (String(pieceId ?? '').trim()) {
    const { data: lies } = await admin.from('subscribers').select('id, data').eq('data->>invoiceId', String(pieceId).trim()).limit(2);
    ligne = Array.isArray(lies) && lies.length === 1 ? lies[0] : null;
  }
  if (!ligne) return null;
  const { piece, plan } = await leContratEtSaPiece(admin, ligne.data ?? {});
  return { id: String(ligne.id), data: ligne.data ?? {}, piece, plan };
}
// ── FIN leContratDeLaDemande

// ── DEBUT verseSurLeContratDeLaDemande (même texte dans mnd-pay et mnd-pay-webhook)
/** UNE DEMANDE PAYÉE QUI RÈGLE UN CONTRAT : le versement passe par le seul
    chemin de l'argent. Le jour est celui où FedaPay a confirmé, à Cotonou.
    Rejouée, elle n'écrit rien de plus. */
async function verseSurLeContratDeLaDemande(admin: any, d: any): Promise<string> {
  if (d?.statut !== 'payee' || !d?.id) return 'pas payée';
  const contrat = await leContratDeLaDemande(admin, d.subId, d.pieceId);
  if (!contrat) return 'sans contrat';
  const t = Date.parse(String(d.payeeLe ?? d.creeLe ?? ''));
  const jour = Number.isFinite(t) ? new Date(t + 3_600_000).toISOString().slice(0, 10) : jourDeCotonou();
  const { data: r, error } = await admin.rpc('verse_sur_l_abonnement', {
    p_sub_id: contrat.id,
    p_versement: {
      id: String(d.id), montantXof: Math.round(Number(d.montantXof ?? 0)), date: jour, moyen: moyenDeLaPiece(d),
      cashbox: 'FedaPay', source: 'mnd-pay', note: `FedaPay${d.reference ? ` · réf. ${d.reference}` : ''}`,
    },
  });
  if (error) throw new Error(error.message);
  return r?.ok === false ? `refusé : ${r.raison}` : r?.dejaVerse ? 'déjà inscrit' : 'inscrit au contrat';
}
// ── FIN verseSurLeContratDeLaDemande

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

/* ══ LA PAGE « RÉGLER », SON SECOURS FEDAPAY — 12 novembre 2026 ═════════
   Le choix du moyen, lot C. Les règles vivent dans
   src/shared/regler-par-fedapay-pur.ts ; la fonction en porte des COPIES,
   entre leurs repères, que scripts/fedapay-copie-serveur.mjs réécrit et que
   le banc verifie-regler-par-fedapay compare, caractère pour caractère : la
   pièce et le versement (regler-la-seance-pur.ts), les frais
   (mnd-pay-pur.ts), l'honneur au règlement (terminer-et-regler-pur.ts), et
   le bloc ⟨regler-par-fedapay⟩. */

// ── DEBUT copie de shared/regler-la-seance-pur.ts (fedapay-copie-serveur la réécrit, verifie-regler-par-fedapay la compare)
export type LienDeReglement = {
  jeton: string;
  creeLe: string;
  /** Le message parti (le Trône l'écrit quand WhatsApp l'a pris). */
  envoyeLe?: string;
  /** Première ouverture de la page par la cliente (écrite par le serveur). */
  ouvertLe?: string;
  /** Le dernier règlement reçu par ce lien. */
  payeLe?: string;
  /** Tap & Go proposé à côté, tant que le reste n'a pas bougé. */
  tapgo?: { resteXof: number; parametre: string; totalXof: number };
};

export type ReglementEnLigne = {
  id: string;
  transactionId: string;
  payeLe: string;
  montantXof: number;
  pourboireXof: number;
  fraisXof: number;
  moyen?: string;
  partsLe?: string;
  recuLe?: string;
};

export type LigneLue = { label?: string; qty?: number; unitXof?: number; discountPct?: number; discountXof?: number };

export type VersementLu = { id: string; amountXof: number; date?: string; method?: string; cashbox?: string; time?: string; note?: string; invoiceId?: string };

export type PieceLue = {
  id: string; kind?: string; status?: string; number?: string; date?: string;
  clientId?: string; forClientId?: string; clientName?: string; apptId?: string;
  lines?: LigneLue[]; globalDiscountPct?: number; globalDiscountXof?: number;
  payments?: VersementLu[]; payment?: string; cashbox?: string; time?: string;
  tipXof?: number; reglementsEnLigne?: ReglementEnLigne[];
};

export type RdvLu = {
  id: string; clientId?: string; clientName?: string; date?: string; time?: string;
  master?: string; status?: string; payments?: VersementLu[]; paidXof?: number;
  lienDeReglement?: LienDeReglement;
  lienDuFoyer?: LienDuFoyer;
  /** Elle a déclaré avoir terminé (6 novembre 2026, terminer-et-regler-pur.ts) :
      sa pièce se prépare au Trône, la page l'attend au lieu de renoncer. */
  termineParElle?: { le?: string } | null;
};

export type LienDuFoyer = {
  jeton: string;
  /** Les rendez-vous que le lien règle ensemble, tels que le Trône les a cochés. */
  apptIds: string[];
  creeLe: string;
  envoyeLe?: string;
  ouvertLe?: string;
  payeLe?: string;
};

export const ALPHABET_DU_JETON = '23456789abcdefghjkmnpqrstuvwxyz';

export const LONGUEUR_DU_JETON = 14;

export const estUnJeton = (s: unknown): s is string =>
  typeof s === 'string' && s.length === LONGUEUR_DU_JETON && [...s].every((c) => ALPHABET_DU_JETON.includes(c));

const n = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0);

export const netDeLaLigne = (l: LigneLue): number =>
  Math.max(0, n(l.qty) * n(l.unitXof) * (1 - n(l.discountPct) / 100) - n(l.discountXof));

export const totalDeLaPiece = (p: PieceLue): number => {
  const sub = (p.lines ?? []).reduce((s, l) => s + netDeLaLigne(l), 0);
  return Math.max(0, Math.round(sub * (1 - n(p.globalDiscountPct) / 100)) - n(p.globalDiscountXof));
};

export const regleDeLaPiece = (p: PieceLue): number => {
  if (p.payments && p.payments.length > 0) return p.payments.reduce((s, v) => s + n(v.amountXof), 0);
  return p.status === 'payée' ? totalDeLaPiece(p) : 0;
};

export const resteDeLaPiece = (p: PieceLue): number => Math.max(0, totalDeLaPiece(p) - regleDeLaPiece(p));

export function laPieceDuRdv(pieces: readonly PieceLue[], rdvId: string): PieceLue | null {
  const siennes = pieces.filter((p) => p && p.apptId === rdvId && (p.kind ?? 'facture') === 'facture' && p.status !== 'annulée');
  if (!siennes.length) return null;
  return [...siennes].sort((a, b) => (resteDeLaPiece(b) > 0 ? 1 : 0) - (resteDeLaPiece(a) > 0 ? 1 : 0) || String(b.date ?? '').localeCompare(String(a.date ?? '')))[0];
}

export function rdvRegle(r: RdvLu, v: VersementLu, pieceId: string, parLeFoyer = false): RdvLu {
  if ((r.payments ?? []).some((x) => x.id === v.id)) return r;
  const payes = r.payments?.length ? r.payments.reduce((s, x) => s + n(x.amountXof), 0) : n(r.paidXof);
  const payeLe = `${v.date}T${v.time ?? '00:00'}`;
  return {
    ...r,
    paidXof: payes + n(v.amountXof),
    payments: [...(r.payments ?? []), { id: v.id, amountXof: v.amountXof, date: v.date, method: v.method, cashbox: v.cashbox, invoiceId: pieceId }],
    ...(!parLeFoyer && r.lienDeReglement ? { lienDeReglement: { ...r.lienDeReglement, payeLe } } : {}),
    ...(parLeFoyer && r.lienDuFoyer ? { lienDuFoyer: { ...r.lienDuFoyer, payeLe } } : {}),
  };
}
// ── FIN copie de shared/regler-la-seance-pur.ts

// ── DEBUT copie de shared/mnd-pay-pur.ts (fedapay-copie-serveur la réécrit, verifie-regler-par-fedapay la compare)
export type MoyenMndPay = 'mtn' | 'moov' | 'celtiis' | 'carte' | 'au_choix' | 'tapgo';

export type ReglagesMndPay = {
  /** MND PAY s'allume ici, une fois le compte FedaPay ouvert et les clés posées. */
  actif?: boolean;
  /** Les frais ajoutés pour la cliente, en pourcentage du montant. 1,8 % est
      la grille affichée par FedaPay pour MTN et Moov au Bénin (16 octobre 2026). */
  tauxMobilePct?: number;
  /** Le taux de la carte, à recopier de son contrat FedaPay. */
  tauxCartePct?: number;
  /** Les codes de FedaPay pour la demande directe (à corriger si le premier
      essai dit autre chose : la documentation n'est pas d'accord avec elle-même). */
  modes?: Partial<Record<'mtn' | 'moov' | 'celtiis', string>>;
  /** Zelle, noté à la main : le compte américain qui le reçoit. */
  zelle?: { actif?: boolean; adresse?: string; titulaire?: string };
  /** TAP & GO (17 octobre 2026) : le code USSD de la Maison chez FedaPay.
      Allumé par défaut avec MND PAY ; `code` est le code marchand à cinq
      chiffres de la page Tap & Go, `tauxPct` sa commission. */
  tapgo?: { actif?: boolean; code?: string; tauxPct?: number };
};

export const TAUX_MOBILE_DEFAUT = 1.8;

export const TAUX_TAPGO_DEFAUT = 1.6;

const f = (x: number): number => Math.max(0, Math.round(Number.isFinite(x) ? x : 0));

export function tauxDe(moyen: MoyenMndPay, r: ReglagesMndPay | undefined): number {
  const mobile = Math.max(0, Number(r?.tauxMobilePct ?? TAUX_MOBILE_DEFAUT) || 0);
  const carte = Math.max(0, Number(r?.tauxCartePct ?? 0) || 0) || mobile;
  if (moyen === 'tapgo') {
    const t = Number(r?.tapgo?.tauxPct ?? TAUX_TAPGO_DEFAUT);
    return Number.isFinite(t) && t >= 0 ? t : TAUX_TAPGO_DEFAUT;
  }
  if (moyen === 'carte') return carte;
  if (moyen === 'au_choix') return Math.max(mobile, carte);
  return mobile;
}

export function fraisPour(baseXof: number, moyen: MoyenMndPay, r: ReglagesMndPay | undefined): number {
  const base = f(baseXof);
  if (base <= 0) return 0;
  const pct = tauxDe(moyen, r);
  return pct > 0 ? Math.ceil((base * pct) / 100 - 1e-9) : 0;
}

export function compteDeLaDemande(e: { montantXof: number; pourboireXof?: number; moyen: MoyenMndPay; reglages?: ReglagesMndPay; fraisOfferts?: boolean }): {
  montantXof: number; pourboireXof: number; fraisXof: number; totalXof: number; fraisOffertsXof?: number;
} {
  const montantXof = f(e.montantXof);
  const pourboireXof = f(e.pourboireXof ?? 0);
  /* Les frais portent sur tout ce qui passe chez FedaPay, pourboire compris :
     il traverse le même tuyau, il en paie la même commission. */
  const dus = fraisPour(montantXof + pourboireXof, e.moyen, e.reglages);
  const offerts = !!e.fraisOfferts && dus > 0;
  const fraisXof = offerts ? 0 : dus;
  return { montantXof, pourboireXof, fraisXof, totalXof: montantXof + pourboireXof + fraisXof, ...(offerts ? { fraisOffertsXof: dus } : {}) };
}
// ── FIN copie de shared/mnd-pay-pur.ts

/* ⟨honneur-au-reglement⟩ */
/** Par quelle porte elle a déclaré avoir terminé. */
export type PorteDeLaFin = 'couronne' | 'site' | 'whatsapp';
/** La marque posée sur le rendez-vous à sa déclaration (le serveur seul
    l'écrit). `pieceLe` : un poste du Trône a réservé l'écriture de sa pièce
    (une écriture conditionnelle, un seul poste la fait). */
export type MarqueDeLaFin = { le: string; par: PorteDeLaFin; pieceLe?: string };
/** La marque posée au règlement : le serveur passe « honoré », un poste du
    Trône réserve les suites (`suitesLe`) et les fait, comme au comptoir. */
export type MarqueDeLHonneur = { le: string; suitesLe?: string };
/** Cotonou : UTC+1 toute l'année. */
export const DECALAGE_DE_LA_FIN_MS = 3_600_000;
export const jourDeLaFin = (ms: number): string => new Date(ms + DECALAGE_DE_LA_FIN_MS).toISOString().slice(0, 10);

/** HONORÉ QUAND ELLE A RÉGLÉ. Rend la marque à poser, ou null : elle n'a
    rien déclaré (le chemin d'avant ne bouge pas), le rendez-vous n'est plus
    « confirmé », il reste à régler, ou le rituel est à venir. Un reste
    illisible n'honore jamais. */
export function honneurAuReglement(o: {
  rdv: { status?: string; date?: string; termineParElle?: MarqueDeLaFin | null } | null;
  resteXof: number;
  maintenantMs: number;
}): MarqueDeLHonneur | null {
  const r = o.rdv;
  if (!r || !r.termineParElle || !r.termineParElle.le) return null;
  if (r.status !== 'confirmé') return null;
  const reste = Number(o.resteXof);
  if (!Number.isFinite(reste) || Math.round(reste) > 0) return null;
  const jour = String(r.date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || jour > jourDeLaFin(o.maintenantMs)) return null;
  return { le: new Date(o.maintenantMs).toISOString() };
}
/* ⟨/honneur-au-reglement⟩ */

/* ⟨regler-par-fedapay⟩ */
/** Le genre d'une demande née sur la page Régler, au registre `mnd_pay`.
    Ni « lien » (le Trône inscrirait lui-même le versement, sans le merci),
    ni « comptoir » : c'est le serveur qui la pose sur sa pièce. */
export const GENRE_DU_LIEN_REGLER = 'regler';
/** La page de paiement de FedaPay : elle y choisit mobile money ou carte. */
export const MOYEN_DU_LIEN_REGLER = 'au_choix';
/** La caisse de l'argent reçu par FedaPay (celle du Trône, `CAISSE_MND_PAY`). */
export const CAISSE_FEDAPAY_DU_LIEN = 'FedaPay';
/** Son nom d'avant le 12 novembre 2026 : il vaut encore la caisse FedaPay. */
export const ANCIEN_NOM_MND_PAY = 'MND PAY';
/** Le merci, de 0 à 100 000 F : la règle de « Payer par MTN ». */
export const MERCI_MAX_DU_LIEN = 100_000;
/** Au-delà, ce n'est plus une séance : un montant à vérifier (le plafond de mnd-pay). */
export const PLAFOND_DU_LIEN_XOF = 5_000_000;
/** Une demande encore en attente, du même total, se reprend une demi-heure :
    deux touchers ne font pas deux transactions chez FedaPay. */
export const REPRISE_DU_LIEN_MS = 30 * 60_000;
/** Une demande payée que le serveur n'a pas pu poser paraît « à rattacher »
    au Trône passé ce délai (une panne entre les deux). */
export const DELAI_DU_LIEN_REGLER_MS = 10 * 60_000;
/** L'identifiant d'une demande au registre : « mp- » et vingt signes hexadécimaux, tirés par le serveur. */
export const RE_DEMANDE_DU_LIEN = /^mp-[0-9a-f]{20}$/;
/** Ce que FedaPay montre sur sa page : jamais un nom, jamais un numéro de pièce. */
export const LIBELLE_DU_LIEN_REGLER = 'Maison MND · règlement de la séance';
/** Qui a demandé, au registre. */
export const DEMANDEE_PAR_LE_LIEN = 'la cliente, par son lien Régler';

const entier = (x: unknown): number => (Number.isFinite(Number(x)) ? Math.round(Number(x)) : 0);

/** Le merci tapé : un entier de 0 à 100 000 F ; rien quand la pièce en porte déjà un. */
export function merciDuLien(x: unknown, permis: boolean): number {
  const v = Math.floor(Number(x));
  if (!permis || !Number.isFinite(v) || v <= 0) return 0;
  return Math.min(MERCI_MAX_DU_LIEN, v);
}

/** LES RÉGLAGES DE LA MAISON qui comptent ici, lus dans le document
    `mnd_settings` (sa clé `mndPay`) : FedaPay allumé, et ses deux taux. Un
    taux illisible ne se lit pas (le défaut de mnd-pay-pur s'applique). */
export function reglagesDuLien(doc: unknown): ReglagesMndPay {
  const m = (doc && typeof doc === 'object' ? (doc as { mndPay?: unknown }).mndPay : null) as Record<string, unknown> | null;
  if (!m || typeof m !== 'object') return {};
  const taux = (x: unknown): number | undefined => {
    const v = Number(x);
    return x !== undefined && x !== null && x !== '' && Number.isFinite(v) && v >= 0 && v <= 20 ? v : undefined;
  };
  const mobile = taux(m.tauxMobilePct);
  const carte = taux(m.tauxCartePct);
  return { actif: m.actif === true, ...(mobile !== undefined ? { tauxMobilePct: mobile } : {}), ...(carte !== undefined ? { tauxCartePct: carte } : {}) };
}

/** FedaPay se propose sur la page : allumé par la Maison, et sa clé posée au serveur. */
export const fedapayOuvertAuLien = (o: { reglages: ReglagesMndPay | undefined; clePosee: boolean }): boolean =>
  o.reglages?.actif === true && o.clePosee === true;

/** LE COMPTE DU SERVEUR : le reste de la pièce, le merci (s'il est permis),
    les frais de FedaPay ajoutés (le taux le plus haut des deux, puisqu'elle
    choisit sur la page de FedaPay après que le montant est écrit), le total.
    `deja_reglee` : rien à régler ; `montant` : au-delà du plafond. */
export function compteDuLien(o: { resteXof: number; merciXof: unknown; merciPermis: boolean; reglages: ReglagesMndPay | undefined }):
  { ok: true; montantXof: number; pourboireXof: number; fraisXof: number; totalXof: number } | { ok: false; raison: 'deja_reglee' | 'montant' } {
  const reste = entier(o.resteXof);
  if (reste < 1) return { ok: false, raison: 'deja_reglee' };
  const c = compteDeLaDemande({ montantXof: reste, pourboireXof: merciDuLien(o.merciXof, o.merciPermis), moyen: MOYEN_DU_LIEN_REGLER, reglages: o.reglages });
  if (c.totalXof > PLAFOND_DU_LIEN_XOF) return { ok: false, raison: 'montant' };
  return { ok: true, montantXof: c.montantXof, pourboireXof: c.pourboireXof, fraisXof: c.fraisXof, totalXof: c.totalXof };
}

/** Une adresse de la machine même (le développement) : jamais un autre site. */
const boucleLocale = (u: URL): boolean => (u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');

/** OÙ FEDAPAY LA RAMÈNE. Aucun domaine écrit ici : l'adresse se déduit de la
    page de retour que la Maison a déjà donnée à FedaPay (`MND_PAY_RETOUR`,
    paye.html du Trône), dont regler.html est la voisine. La page peut dire la
    sienne : elle n'est prise que si elle vit sur le MÊME site (ou sur la
    machine même, en développement) et se nomme regler.html. Le serveur écrit
    lui-même la suite (`r` : le jeton, `fp` : la demande) : rien d'autre ne
    voyage. Rend null quand la page de la Maison ne se lit pas. */
export function retourDuLien(o: { pageDeRetourDeLaMaison: string; pageDemandee?: unknown; jeton: string; demandeId: string }): string | null {
  let maison: URL;
  try { maison = new URL(String(o.pageDeRetourDeLaMaison ?? '').trim()); } catch { return null; }
  if (maison.protocol !== 'https:' && !boucleLocale(maison)) return null;
  let page = new URL('regler.html', maison);
  if (typeof o.pageDemandee === 'string' && o.pageDemandee.trim()) {
    try {
      const p = new URL(o.pageDemandee.trim());
      if ((p.origin === maison.origin || boucleLocale(p)) && /\/regler\.html$/.test(p.pathname)) page = new URL(`${p.origin}${p.pathname}`);
    } catch { /* une adresse illisible ne change rien */ }
  }
  /* Ni la requête ni l'ancre d'aucune des deux ne survivent : la suite est celle du serveur. */
  page.searchParams.set('r', o.jeton);
  page.searchParams.set('fp', o.demandeId);
  return page.toString();
}

/** Une demande du registre, telle que le serveur la lit. */
export type DemandeDuLien = {
  id: string; branchId?: string; genre?: string; moyen?: string; statut?: string;
  montantXof?: number; pourboireXof?: number; fraisXof?: number; totalXof?: number;
  pieceId?: string; pieceNumero?: string; clientId?: string; rdvId?: string;
  fedapayId?: number; reference?: string; url?: string; modeReel?: string;
  creeLe?: string; payeeLe?: string; poseLe?: string; aRapprocher?: string; raison?: string;
};

/** LA DEMANDE ÉCRITE AU REGISTRE AVANT L'APPEL À FEDAPAY : tout vient du
    serveur (le rendez-vous et la pièce relus, le compte), rien de la page. */
export function demandeDuLien(o: {
  id: string; branchId: string; rdvId: string;
  piece: { id: string; number?: string; clientId?: string };
  compte: { montantXof: number; pourboireXof: number; fraisXof: number; totalXof: number };
  creeLe: string;
}): DemandeDuLien & Record<string, unknown> {
  return {
    id: o.id, branchId: o.branchId, genre: GENRE_DU_LIEN_REGLER, moyen: MOYEN_DU_LIEN_REGLER,
    montantXof: o.compte.montantXof, fraisXof: o.compte.fraisXof, totalXof: o.compte.totalXof,
    ...(o.compte.pourboireXof > 0 ? { pourboireXof: o.compte.pourboireXof } : {}),
    pieceId: o.piece.id, ...(o.piece.number ? { pieceNumero: String(o.piece.number).slice(0, 40) } : {}),
    ...(o.piece.clientId ? { clientId: String(o.piece.clientId).slice(0, 80) } : {}),
    rdvId: o.rdvId, libelle: LIBELLE_DU_LIEN_REGLER, statut: 'en_attente', creeLe: o.creeLe, creePar: DEMANDEE_PAR_LE_LIEN,
  };
}

/** LA DEMANDE À REPRENDRE : du même rendez-vous, encore en attente, partie
    chez FedaPay (sa page existe), au MÊME total, de moins d'une demi-heure. */
export function demandeAReprendre(lignes: readonly DemandeDuLien[], rdvId: string, totalXof: number, maintenantMs: number): DemandeDuLien | null {
  const bonnes = lignes.filter((d) => d.genre === GENRE_DU_LIEN_REGLER && d.rdvId === rdvId && d.statut === 'en_attente'
    && !!d.fedapayId && !!d.url && entier(d.totalXof) === entier(totalXof)
    && maintenantMs - (Date.parse(String(d.creeLe ?? '')) || 0) < REPRISE_DU_LIEN_MS);
  return [...bonnes].sort((a, b) => String(b.creeLe ?? '').localeCompare(String(a.creeLe ?? '')))[0] ?? null;
}

/** Les demandes du même rendez-vous qu'une neuve remplace (un autre merci,
    un reste qui a changé) : encore en attente. Si l'une est payée quand
    même, FedaPay le dira, et l'argent ne se perd pas. */
export const demandesRemplacees = (lignes: readonly DemandeDuLien[], rdvId: string): DemandeDuLien[] =>
  lignes.filter((d) => d.genre === GENRE_DU_LIEN_REGLER && d.rdvId === rdvId && d.statut === 'en_attente');

/** CE QUE LA PAGE VOIT D'UNE DEMANDE, et rien d'autre : son état, ce qui
    règle la séance (le reste et le merci), le total payé, l'honneur. Ni
    l'identifiant de FedaPay, ni sa référence, ni la pièce, ni un numéro. */
export function statutDuLienPourLaPage(d: DemandeDuLien, honore = false): {
  etat: 'attente' | 'payee' | 'refusee' | 'expiree' | 'annulee'; regleXof: number; totalXof: number; honore?: true;
} {
  const etat = d.statut === 'payee' ? 'payee' : d.statut === 'refusee' ? 'refusee' : d.statut === 'expiree' ? 'expiree' : d.statut === 'annulee' ? 'annulee' : 'attente';
  return {
    etat, regleXof: entier(d.montantXof) + entier(d.pourboireXof), totalXof: entier(d.totalXof),
    ...(etat === 'payee' && honore ? { honore: true as const } : {}),
  };
}

/** LE PARTAGE QUAND FEDAPAY CONFIRME : la pièce relue doit encore AU MOINS
    le reste demandé ; le versement est ce reste, le merci celui qu'elle a
    choisi. Réglée entre-temps, ou un reste qui a baissé : à rapprocher.
    On ne devine jamais un merci. */
export function partageDuLien(d: DemandeDuLien, resteActuelXof: number):
  { ok: true; versementXof: number; pourboireXof: number } | { ok: false; raison: 'deja_reglee' | 'reste_change' } {
  const actuel = entier(resteActuelXof);
  const demande = entier(d.montantXof);
  if (actuel <= 0) return { ok: false, raison: 'deja_reglee' };
  if (demande <= 0 || actuel < demande) return { ok: false, raison: 'reste_change' };
  return { ok: true, versementXof: demande, pourboireXof: Math.max(0, entier(d.pourboireXof)) };
}

/** Le jour et l'heure de Cotonou (UTC+1, sans heure d'été) d'un instant. */
export function quandACotonou(ms: number): { date: string; time: string } {
  const iso = new Date(ms + 3_600_000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** LE VERSEMENT POSÉ SUR LA PIÈCE ET LE RENDEZ-VOUS : l'identifiant de la
    demande (celui que le Trône inscrirait : deux écritures n'en font qu'une),
    le moyen qu'elle a vraiment pris, la caisse FedaPay. */
export function versementDuLien(d: DemandeDuLien, quandMs: number): VersementLu {
  const q = quandACotonou(quandMs);
  const frais = entier(d.fraisXof);
  return {
    id: d.id, date: q.date, time: q.time, amountXof: entier(d.montantXof),
    method: moyenDeLaPiece({ moyen: (d.moyen ?? MOYEN_DU_LIEN_REGLER) as 'au_choix', modeReel: d.modeReel }),
    cashbox: CAISSE_FEDAPAY_DU_LIEN,
    note: `FedaPay${d.reference ? ` · réf. ${d.reference}` : ''} · réglé par son lien Régler${frais > 0 ? ` · frais ${frais} F payés par la cliente` : ''}`,
  };
}

/** LA TRACE DU RÈGLEMENT sur la pièce : la forme d'un règlement en ligne. */
export function traceDuLien(d: DemandeDuLien, v: VersementLu, quandMs: number, pourboireXof: number): ReglementEnLigne {
  return {
    id: v.id, transactionId: d.fedapayId ? String(d.fedapayId) : d.id, payeLe: new Date(quandMs).toISOString(),
    montantXof: v.amountXof, pourboireXof: Math.max(0, entier(pourboireXof)), fraisXof: entier(d.fraisXof), moyen: CAISSE_FEDAPAY_DU_LIEN,
  };
}

/** LA PIÈCE APRÈS LE RÈGLEMENT : le versement, le statut qui suit l'argent,
    le merci à part (tipXof), la trace. La forme de `pieceReglee`
    (regler-la-seance-pur.ts), la caisse FedaPay en plus. */
export function pieceRegleeParLeLien(p: PieceLue, v: VersementLu, pourboireXof: number, trace: ReglementEnLigne): PieceLue {
  const payments = [...(p.payments ?? []), v];
  const suivante: PieceLue = { ...p, payments };
  const solde = resteDeLaPiece(suivante) <= 0;
  return {
    ...suivante,
    status: solde ? 'payée' : p.status,
    payment: p.payment ?? CAISSE_FEDAPAY_DU_LIEN,
    cashbox: p.cashbox ?? CAISSE_FEDAPAY_DU_LIEN,
    time: p.time ?? v.time,
    ...(pourboireXof > 0 ? { tipXof: entier(p.tipXof) + entier(pourboireXof) } : {}),
    reglementsEnLigne: [...(p.reglementsEnLigne ?? []).filter((r) => r.id !== trace.id), trace],
  };
}

/** LE RENDEZ-VOUS SUIT SA PIÈCE : le même versement (`rdvRegle`), puis
    l'honneur si elle avait déclaré avoir terminé et que tout est réglé. */
export function rdvApresLeLien(avant: RdvLu, v: VersementLu, pieceId: string, resteApresXof: number, maintenantMs: number): RdvLu {
  const regle = rdvRegle(avant, v, pieceId);
  const honneur = honneurAuReglement({ rdv: regle as unknown as Parameters<typeof honneurAuReglement>[0]['rdv'], resteXof: resteApresXof, maintenantMs });
  return honneur ? ({ ...regle, status: 'honoré', honoreAuReglement: honneur } as RdvLu) : regle;
}

/** La caisse FedaPay de la branche, si le Trône ne l'a pas encore posée : la
    même que la sienne (même identifiant, aucun doublon). */
export const caisseFedaPayNeuve = (branchId: string) => ({
  id: `cb-mndpay-${branchId}`, branchId, name: CAISSE_FEDAPAY_DU_LIEN, sub: 'Avant le reversement', glyph: '◈', openingXof: 0,
});
/** Une caisse de la branche est-elle déjà la caisse FedaPay ? */
export const estDejaLaCaisseFedaPay = (nom: unknown): boolean => nom === CAISSE_FEDAPAY_DU_LIEN || nom === ANCIEN_NOM_MND_PAY;
/* ⟨/regler-par-fedapay⟩ */

// ── DEBUT poseLeReglementDuLien (même texte dans mnd-pay et mnd-pay-webhook)
/** Le rendez-vous suit sa pièce, relu à l'instant et écrit sous condition (le
    Trône écrit les mêmes lignes). Rend vrai quand il porte l'honneur du
    règlement (posé ici ou déjà là) : la page dit alors « vous pouvez partir ». */
async function suisLeRdvDuLien(admin: any, rdvId: string, v: VersementLu, pieceId: string, resteApresXof: number, quandMs: number): Promise<boolean> {
  for (let essai = 0; essai < 3; essai++) {
    const { data: l, error } = await admin.from('appointments').select('id, data, updated_at').eq('id', rdvId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!l) return false;
    const avant: RdvLu = { ...(l.data ?? {}), id: l.id };
    const apres = rdvApresLeLien(avant, v, pieceId, resteApresXof, quandMs);
    const honore = !!(apres as { honoreAuReglement?: { le?: string } }).honoreAuReglement?.le;
    if (apres === avant) return honore;
    let q = admin.from('appointments').update({ data: apres }).eq('id', rdvId);
    if (l.updated_at) q = q.eq('updated_at', l.updated_at);
    const { data: ecrites, error: refus } = await q.select('id');
    if (refus) throw new Error(refus.message);
    if ((ecrites ?? []).length) return honore;
  }
  return false;
}

/** La caisse FedaPay de la branche, née ici si le Trône ne l'a pas encore posée (même identifiant que la sienne). */
async function laCaisseFedaPayDuLien(admin: any, branchId: string): Promise<void> {
  if (!branchId) return;
  const { data: caisses } = await admin.from('cashboxes').select('id, data').eq('branch_id', branchId).limit(200);
  if (!Array.isArray(caisses) || caisses.some((c: any) => estDejaLaCaisseFedaPay(c?.data?.name))) return;
  const c = caisseFedaPayNeuve(branchId);
  const { error } = await admin.from('cashboxes').insert({ id: c.id, branch_id: branchId, data: c });
  if (error && !/duplicate|unique|23505/i.test(`${error.code ?? ''} ${error.message ?? ''}`)) throw new Error(error.message);
}

/** Une marque sur la demande (`poseLe`, `aRapprocher`), sur la ligne relue. */
async function marqueLaDemandeDuLien(admin: any, id: string, patch: Record<string, unknown>): Promise<void> {
  const { data: l } = await admin.from('mnd_pay').select('id, data').eq('id', id).maybeSingle();
  if (!l) return;
  const { error } = await admin.from('mnd_pay').update({ data: { ...(l.data ?? {}), ...patch } }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** LA SÉANCE RÉGLÉE PAR FEDAPAY, SANS TRÔNE OUVERT. Une demande de la page
    Régler, PAYÉE (le statut ne vient que de FedaPay, relu) : le versement se
    pose sur SA pièce, relue à l'instant et écrite sous condition, puis sur son
    rendez-vous (et l'honneur, si elle avait terminé elle-même), la caisse
    FedaPay naît s'il le faut, et la demande porte `poseLe`. Réglée
    entre-temps, reste qui a baissé, pièce disparue : `aRapprocher`, l'argent
    reste au registre. Rejouée, elle ne double rien : le versement porte
    l'identifiant de la demande. UNE PIÈCE DE CONTRAT ne s'écrit jamais ici
    (« le contrat fait foi, la pièce suit ») : `verse_sur_l_abonnement`,
    appelé avant, l'a déjà portée ; sinon, elle est à rapprocher. */
async function poseLeReglementDuLien(admin: any, ligne: { id: string; data: any }): Promise<{ pose: boolean; honore: boolean; raison?: string }> {
  const d: DemandeDuLien = { ...(ligne.data ?? {}), id: String(ligne.data?.id ?? ligne.id) };
  if (d.genre !== GENRE_DU_LIEN_REGLER || d.statut !== 'payee' || !d.pieceId || !d.rdvId) return { pose: false, honore: false };
  if (d.aRapprocher) return { pose: false, honore: false, raison: String(d.aRapprocher) };
  if (d.poseLe) {
    const { data: r } = await admin.from('appointments').select('id, data').eq('id', d.rdvId).maybeSingle();
    return { pose: true, honore: !!r?.data?.honoreAuReglement?.le && r?.data?.status === 'honoré' };
  }
  const t = instantDe(d.payeeLe);
  const quandMs = Number.isFinite(t) ? t : Date.now();
  for (let essai = 0; essai < 3; essai++) {
    const { data: lp, error } = await admin.from('invoices').select('id, branch_id, data, updated_at').eq('id', d.pieceId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!lp || lp.data?.status === 'annulée') {
      await marqueLaDemandeDuLien(admin, ligne.id, { aRapprocher: 'piece_introuvable' });
      return { pose: false, honore: false, raison: 'piece_introuvable' };
    }
    const piece: PieceLue = { ...(lp.data ?? {}), id: lp.id };
    const deja = (piece.payments ?? []).find((x) => x?.id === d.id);
    if (deja) {
      /* UN REJEU : l'argent est sur la pièce ; le rendez-vous le suit s'il ne l'a pas encore. */
      const honore = await suisLeRdvDuLien(admin, d.rdvId, deja, piece.id, resteDeLaPiece(piece), quandMs);
      await marqueLaDemandeDuLien(admin, ligne.id, { poseLe: new Date().toISOString() });
      return { pose: true, honore };
    }
    if (await leContratDeLaDemande(admin, undefined, d.pieceId)) {
      await marqueLaDemandeDuLien(admin, ligne.id, { aRapprocher: 'contrat' });
      return { pose: false, honore: false, raison: 'contrat' };
    }
    const partage = partageDuLien(d, resteDeLaPiece(piece));
    if (!partage.ok) {
      await marqueLaDemandeDuLien(admin, ligne.id, { aRapprocher: partage.raison });
      return { pose: false, honore: false, raison: partage.raison };
    }
    const v = versementDuLien(d, quandMs);
    const neuve = pieceRegleeParLeLien(piece, v, partage.pourboireXof, traceDuLien(d, v, quandMs, partage.pourboireXof));
    let q = admin.from('invoices').update({ data: neuve }).eq('id', piece.id);
    if (lp.updated_at) q = q.eq('updated_at', lp.updated_at);
    const { data: ecrites, error: refus } = await q.select('id');
    if (refus) throw new Error(refus.message);
    /* La pièce a bougé entre la lecture et l'écriture : on relit, on rejuge. */
    if (!(ecrites ?? []).length) continue;
    const honore = await suisLeRdvDuLien(admin, d.rdvId, v, piece.id, resteDeLaPiece(neuve), quandMs);
    await laCaisseFedaPayDuLien(admin, String(lp.branch_id ?? d.branchId ?? ''));
    await marqueLaDemandeDuLien(admin, ligne.id, { poseLe: new Date().toISOString() });
    console.log('[fedapay] lien Régler posé', { demande: d.id.slice(0, 8), versementXof: partage.versementXof, pourboireXof: partage.pourboireXof });
    return { pose: true, honore };
  }
  return { pose: false, honore: false, raison: 'ecriture' };
}
// ── FIN poseLeReglementDuLien

/* ── L'ENTRÉE PUBLIQUE DE LA PAGE RÉGLER (mnd-pay seulement) ─────────── */
const repDuLien = (o: Record<string, unknown>, status = 200) => json({ ...o, version: VERSION }, status);
const ipDuLien = (req: Request): string => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'inconnue';

/** La limite de débit, la table des demandes du site (0007), comme regler-la-seance et collecte-mtn. */
async function permisDuLien(admin: any, ip: string, seau: string, plafond: number): Promise<boolean> {
  const depuis = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count, error } = await admin.from('edge_rate_limits').select('*', { count: 'exact', head: true })
    .eq('bucket', seau).eq('ip', ip).gte('at', depuis);
  if (error) return true; // table absente : ne pas bloquer un règlement
  if ((count ?? 0) >= plafond) return false;
  await admin.from('edge_rate_limits').insert({ bucket: seau, ip });
  return true;
}

/** Les réglages de la Maison (document `mnd_settings`) : FedaPay allumé, ses taux. Illisibles : fermé. */
async function lesReglagesDuLien(admin: any): Promise<ReglagesMndPay> {
  const { data, error } = await admin.from('documents').select('key, data').eq('key', 'mnd_settings').limit(1);
  if (error || !Array.isArray(data) || !data.length) return {};
  return reglagesDuLien(data[0]?.data);
}

/** Le rendez-vous du jeton : un seul, sinon personne. */
async function leRdvDuJetonDuLien(admin: any, jeton: string): Promise<{ id: string; branch_id: string | null; data: any } | null> {
  const { data, error } = await admin.from('appointments').select('id, branch_id, data').eq('data->lienDeReglement->>jeton', jeton).limit(2);
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length === 1 ? data[0] : null;
}

/** SA pièce : une facture qui porte son identifiant, jamais annulée (`laPieceDuRdv`). */
async function laPieceDuRdvDuLien(admin: any, rdvId: string): Promise<PieceLue | null> {
  const { data, error } = await admin.from('invoices').select('id, branch_id, data').eq('data->>apptId', rdvId).limit(20);
  if (error) throw new Error(error.message);
  return laPieceDuRdv((data ?? []).map((l: any) => ({ ...(l.data ?? {}), id: String(l.id) })), rdvId);
}

/** LA DEMANDE DE LA PAGE : tout vient du serveur, sauf le merci et l'adresse de la page (vérifiée). */
async function demandeDuLienRegler(req: Request, corps: Record<string, any>, admin: any): Promise<Response> {
  if (!(await permisDuLien(admin, ipDuLien(req), 'fedapay-regler-demander', 12))) return repDuLien({ erreur: 'trop' }, 429);
  const jeton = String(corps.jeton ?? '').trim();
  if (!estUnJeton(jeton)) return repDuLien({ erreur: 'lien' }, 400);
  const reglages = await lesReglagesDuLien(admin);
  if (!fedapayOuvertAuLien({ reglages, clePosee: SECRET !== '' })) return repDuLien({ erreur: 'fermee' }, 503);
  const rdv = await leRdvDuJetonDuLien(admin, jeton);
  if (!rdv) return repDuLien({ erreur: 'lien' }, 404);
  if (rdv.data?.status === 'annulé') return repDuLien({ erreur: 'annule' }, 409);
  const piece = await laPieceDuRdvDuLien(admin, rdv.id);
  if (!piece) return repDuLien({ erreur: 'sans_piece' }, 409);
  const compte = compteDuLien({ resteXof: resteDeLaPiece(piece), merciXof: corps.pourboireXof, merciPermis: !(Number(piece.tipXof) > 0), reglages });
  if (!compte.ok) return repDuLien({ erreur: compte.raison }, compte.raison === 'deja_reglee' ? 409 : 400);
  const montants = { montantXof: compte.montantXof, pourboireXof: compte.pourboireXof, fraisXof: compte.fraisXof, totalXof: compte.totalXof };

  /* Deux touchers ne font pas deux transactions : la même demande, au même total, se reprend. */
  const { data: vivantes, error: errV } = await admin.from('mnd_pay').select('id, data').eq('data->>rdvId', rdv.id).eq('data->>statut', 'en_attente').limit(20);
  if (errV) throw new Error(errV.message);
  const lues: DemandeDuLien[] = (vivantes ?? []).map((l: any) => ({ ...(l.data ?? {}), id: String(l.id) }));
  const reprise = demandeAReprendre(lues, rdv.id, compte.totalXof, Date.now());
  if (reprise) return repDuLien({ ok: true, id: reprise.id, url: reprise.url, deja: true, ...montants });

  const id = `mp-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const retour = retourDuLien({ pageDeRetourDeLaMaison: RETOUR, pageDemandee: corps.retour, jeton, demandeId: id });
  if (!retour) return repDuLien({ erreur: 'indisponible' }, 503);
  const branchId = String(rdv.branch_id ?? '');
  const data = demandeDuLien({ id, branchId, rdvId: rdv.id, piece, compte: montants, creeLe: new Date().toISOString() });

  /* ① LA DEMANDE AU REGISTRE, AVANT L'APPEL À FEDAPAY : un paiement ne doit
     jamais arriver pour une demande qui n'existe pas encore. */
  const { error: insErr } = await admin.from('mnd_pay').insert({ id, branch_id: branchId || null, data });
  if (insErr) return repDuLien({ erreur: 'registre' }, 503);
  /* Celles qu'elle remplace (un autre merci, un reste qui a bougé). Payée
     quand même, l'une d'elles le serait par FedaPay : rien ne se perd. */
  for (const vieille of demandesRemplacees(lues, rdv.id)) {
    const l = (vivantes ?? []).find((x: any) => String(x.id) === vieille.id);
    await admin.from('mnd_pay').update({ data: { ...(l?.data ?? {}), statut: 'annulee', raison: 'remplacée par une nouvelle demande de la page Régler' } })
      .eq('id', vieille.id).eq('data->>statut', 'en_attente');
  }

  /* ② LA TRANSACTION ET SA PAGE DE PAIEMENT, au total du serveur. */
  try {
    const creee = laTransaction(await fedapay('POST', '/transactions', {
      description: LIBELLE_DU_LIEN_REGLER, amount: compte.totalXof, currency: { iso: 'XOF' }, callback_url: retour,
    }));
    const fedapayId = Number(creee?.id);
    if (!Number.isFinite(fedapayId) || fedapayId <= 0) throw new Error('FedaPay n’a pas rendu de transaction');
    const jt = await fedapay('POST', `/transactions/${fedapayId}/token`);
    const url = String(jt?.url ?? '');
    if (!/^https:\/\//.test(url)) throw new Error('FedaPay n’a pas rendu de page de paiement');
    const { error: majErr } = await admin.from('mnd_pay').update({
      data: { ...data, fedapayId, ...(creee?.reference ? { reference: String(creee.reference) } : {}), url },
    }).eq('id', id);
    if (majErr) throw new Error(majErr.message);
    console.log('[mnd-pay] regler-demander', { demande: id.slice(0, 8), totalXof: compte.totalXof });
    return repDuLien({ ok: true, id, url, ...montants });
  } catch (e) {
    const motif = (e instanceof Error ? e.message : String(e)).slice(0, 160);
    await admin.from('mnd_pay').update({ data: { ...data, statut: 'annulee', raison: `FedaPay n’a pas répondu (${motif}) : rien n’a été demandé à la cliente` } }).eq('id', id);
    console.error('[mnd-pay] regler-demander', motif);
    return repDuLien({ erreur: 'indisponible' }, 502);
  }
}

/** L'ÉTAT DE CETTE DEMANDE, ET D'ELLE SEULE : le jeton ET l'identifiant
    doivent se répondre (la demande est celle de son rendez-vous) ; sinon,
    « introuvable », la même réponse pour un jeton faux ou une demande d'autrui. */
async function statutDuLienRegler(req: Request, corps: Record<string, any>, admin: any): Promise<Response> {
  if (!(await permisDuLien(admin, ipDuLien(req), 'fedapay-regler-statut', 150))) return repDuLien({ erreur: 'trop' }, 429);
  const jeton = String(corps.jeton ?? '').trim();
  const id = String(corps.id ?? '').trim();
  if (!estUnJeton(jeton) || !RE_DEMANDE_DU_LIEN.test(id)) return repDuLien({ erreur: 'lien' }, 400);
  const rdv = await leRdvDuJetonDuLien(admin, jeton);
  const { data: ligne } = await admin.from('mnd_pay').select('id, data').eq('id', id).maybeSingle();
  let d: any = ligne?.data ?? null;
  if (!rdv || !ligne || d?.genre !== GENRE_DU_LIEN_REGLER || String(d?.rdvId ?? '') !== rdv.id) return repDuLien({ erreur: 'introuvable' }, 404);
  /* La vérité vient de FedaPay, relue ici (le filet quand le webhook tarde). */
  if ((d.statut === 'en_attente' || d.statut === 'annulee') && d.fedapayId && SECRET) {
    try {
      const tx = laTransaction(await fedapay('GET', `/transactions/${d.fedapayId}`));
      /* Une demande remplacée ne revient pas « en attente » : seul un « payé » la touche. */
      if (d.statut === 'en_attente' || statutDepuisFedaPay(tx?.status) === 'payee') d = await poseLaTransaction(admin, { id: ligne.id, data: d }, tx);
    } catch (e) {
      console.error('[mnd-pay] regler-statut', (e instanceof Error ? e.message : String(e)).slice(0, 160));
    }
  }
  let honore = false;
  if (d.statut === 'payee') {
    /* Une pièce de contrat passe par le seul chemin de l'argent d'abord (idempotent). */
    try { await verseSurLeContratDeLaDemande(admin, { ...d, id: d.id ?? ligne.id }); } catch (e) {
      console.error('[mnd-pay] contrat du lien Régler', (e instanceof Error ? e.message : String(e)).slice(0, 160));
    }
    try { honore = (await poseLeReglementDuLien(admin, { id: ligne.id, data: d })).honore; } catch (e) {
      console.error('[mnd-pay] pose du lien Régler', (e instanceof Error ? e.message : String(e)).slice(0, 160));
    }
  }
  return repDuLien({ ok: true, ...statutDuLienPourLaPage(d, honore) });
}

/** LA PAGE RÉGLER, son aiguillage. Une panne imprévue se dit sans rien de ce que la Maison sait. */
async function laPageRegler(req: Request, action: string, corps: Record<string, any>, admin: any): Promise<Response> {
  try {
    if (action === 'regler-ouvert') {
      if (!(await permisDuLien(admin, ipDuLien(req), 'fedapay-regler-ouvert', 60))) return repDuLien({ erreur: 'trop' }, 429);
      const r = await lesReglagesDuLien(admin);
      const ouverte = fedapayOuvertAuLien({ reglages: r, clePosee: SECRET !== '' });
      return repDuLien({
        ok: true, ouverte,
        ...(ouverte ? { taux: { ...(r.tauxMobilePct !== undefined ? { tauxMobilePct: r.tauxMobilePct } : {}), ...(r.tauxCartePct !== undefined ? { tauxCartePct: r.tauxCartePct } : {}) } } : {}),
      });
    }
    if (action === 'regler-demander') return await demandeDuLienRegler(req, corps, admin);
    if (action === 'regler-statut') return await statutDuLienRegler(req, corps, admin);
    return repDuLien({ erreur: 'action' }, 400);
  } catch (e) {
    console.error('[mnd-pay] page Régler', (e instanceof Error ? e.message : String(e)).slice(0, 160));
    return repDuLien({ erreur: 'serveur' }, 500);
  }
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

  let corps: Record<string, any> = {};
  try { corps = await req.json(); } catch { return refus('corps illisible'); }
  const action = String(corps?.action ?? '');

  /* LA PAGE « RÉGLER » (12 novembre 2026, lot C) : par son jeton, sans
     session. Elle ne touche à aucun geste du personnel. */
  if (action.startsWith('regler-')) {
    if (!urlBase || !service) return repDuLien({ erreur: 'indisponible' }, 503);
    return await laPageRegler(req, action, corps, createClient(urlBase, service, { auth: { persistSession: false } }));
  }

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

  const admin = createClient(urlBase, service, { auth: { persistSession: false } });

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
      const subIdDemande = String(corps.subId ?? '').trim();
      if (!MOYENS.includes(moyen)) return refus('moyen inconnu');
      if (!Number.isFinite(montantXof) || montantXof <= 0) return refus('le montant doit être positif');
      if (!branchId || (!pieceId && !subIdDemande)) return refus('la branche et la pièce sont requises');
      /* LA PIÈCE D'UN CONTRAT (20 octobre 2026) : jamais au-delà de ce que le
         contrat attend encore, le versé du contrat et de sa pièce réunis. Un
         contrat sans pièce encore (souscrit en ligne) se nomme par `subId`. */
      const contrat = await leContratDeLaDemande(admin, subIdDemande, pieceId);
      if (subIdDemande && !contrat) return refus('ce contrat est introuvable', 404);
      if (contrat) {
        const attendu = duDuContrat(contrat.data, contrat.piece, contrat.plan, jourDeCotonou());
        if (!attendu.raison && montantXof > attendu.resteXof + 1) {
          return refus(`au-delà de ce que le contrat attend encore (${attendu.resteXof.toLocaleString('fr-FR')} F)`);
        }
      }
      const duContrat: Record<string, unknown> = contrat ? { subId: contrat.id } : {};
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
          pieceId, ...duContrat,
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
        pieceId, ...duContrat,
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
      /* PAYÉE, ELLE RÈGLE SON CONTRAT (20 octobre 2026). Un échec n'empêche
         pas le comptoir de voir le paiement : la relecture suivante le
         reprend, le versement est idempotent. */
      let contrat: string | undefined;
      if (d.statut === 'payee') {
        try { contrat = await verseSurLeContratDeLaDemande(admin, { ...d, id: d.id ?? id }); } catch (e) {
          contrat = `à reprendre : ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
        }
      }
      /* LA PAGE RÉGLER (12 novembre 2026, lot C) : payée et pas encore posée
         (une panne entre les deux), la relire du Trône la pose sur SA pièce. */
      if (d.statut === 'payee' && d.genre === GENRE_DU_LIEN_REGLER && !d.poseLe && !d.aRapprocher) {
        try {
          await poseLeReglementDuLien(admin, { id, data: d });
          const { data: relue } = await admin.from('mnd_pay').select('id, data').eq('id', id).maybeSingle();
          if (relue) d = relue.data ?? d;
        } catch (e) {
          console.error('[mnd-pay] pose du lien Régler', (e instanceof Error ? e.message : String(e)).slice(0, 160));
        }
      }
      return json({ ok: true, version: VERSION, demande: d, ...(contrat ? { contrat } : {}) });
    }

    return refus('geste inconnu : demander, statut ou annuler');
  } catch (e) {
    return refus(e instanceof Error ? e.message : String(e), 502);
  }
});
