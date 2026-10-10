// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* kkiapay-webhook — le filet. La cliente peut fermer son téléphone une seconde
 * après avoir payé : `kkiapay-verify` ne serait alors jamais appelée et l'argent
 * serait arrivé sans que la Maison le sache. KkiaPay, lui, appelle cette
 * fonction (5 tentatives, intervalle croissant) jusqu'à recevoir un 2xx.
 *
 * DÉPLOIEMENT PARTICULIER — cette fonction doit être joignable SANS jeton :
 *     supabase functions deploy kkiapay-webhook --no-verify-jwt
 * (KkiaPay n'a évidemment pas de session Supabase.) Sa porte n'est donc pas le
 * jeton mais DEUX serrures :
 *   ① l'en-tête `x-kkiapay-secret` doit correspondre au hash secret du tableau
 *      de bord (comparaison à temps constant) ;
 *   ② on ne croit JAMAIS le corps du message : le montant et le statut sont
 *      redemandés à KkiaPay avec les clés privée + secrète. Un webhook forgé ne
 *      peut donc rien créditer, même si la première serrure cédait.
 *
 * Secrets : KKIAPAY_WEBHOOK_SECRET, KKIAPAY_PUBLIC_KEY, KKIAPAY_PRIVATE_KEY,
 * KKIAPAY_SECRET_KEY, SERVICE_KEY. KKIAPAY_API_BASE pour le bac à sable.
 *
 * Le corps de `applyPayment` est le JUMEAU de celui de kkiapay-verify : chaque
 * fonction Edge se déploie seule (fichier collé tel quel), on assume la copie
 * plutôt qu'un module partagé qu'on oublierait de redéployer. Toute correction
 * ici doit être reportée là-bas.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
/* Route et en-têtes VÉRIFIÉS contre l'API le 28-07-2026 (non publiés par la
   documentation) : POST /api/v1/transactions/status, triplet
   x-api-key / x-private-key / x-secret-key. Bac à sable et production ont deux
   adresses distinctes — d'où KKIAPAY_API_BASE. */
const KKIA_BASE = Deno.env.get('KKIAPAY_API_BASE') ?? 'https://api.kkiapay.me';
const KKIA_VERIFY_PATH = '/api/v1/transactions/status';

/** La version de ce fichier, écrite au journal des fonctions à chaque
    passage. 10 octobre 2026 (revue de nuit) : le filet confirme aussi
    l'acompte d'une inscription à l'Académie, et un rejeu pose l'effet sur
    SA cible ; la carte cadeau liée à sa transaction. */
const VERSION = '2026-10-10-a';

/** Comparaison à temps constant — une comparaison naïve fuit le secret, octet
    par octet, par le temps de réponse. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type KkiaTransaction = { status?: string; amount?: number; fees?: number; source?: string; failureMessage?: string };

async function fetchTransaction(transactionId: string): Promise<KkiaTransaction> {
  const res = await fetch(`${KKIA_BASE}${KKIA_VERIFY_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('KKIAPAY_PUBLIC_KEY') ?? '',
      'x-private-key': Deno.env.get('KKIAPAY_PRIVATE_KEY') ?? '',
      'x-secret-key': Deno.env.get('KKIAPAY_SECRET_KEY') ?? '',
    },
    body: JSON.stringify({ transactionId }),
  });
  if (!res.ok) throw new Error(`upstream_${res.status}`);
  return (await res.json()) as KkiaTransaction;
}

/* ══ LE PAIEMENT APPLIQUÉ — JUMEAU À L'IDENTIQUE ══════════════════════
   Ce corps vit, mot pour mot, dans kkiapay-verify ET dans kkiapay-webhook
   (une fonction Edge se colle seule, elle n'importe rien). Le harnais
   `verifie-revue-serveur-site` compare les deux copies : toute correction
   se fait aux deux endroits, le même jour.

   CE QUI A CHANGÉ LE 10 OCTOBRE 2026 (revue de nuit) :
   ① UN REJEU N'EST PLUS UN MUR. Le filet arrive souvent AVANT la
     vérification ; celle-ci trouvait le registre déjà écrit (23505) et
     s'arrêtait là, sans poser l'effet sur ce qui était réglé. Une inscription
     à l'Académie restait ainsi sans acompte confirmé, « payée » à l'écran.
     Désormais l'effet se pose aussi sur un rejeu, mais SEULEMENT si la
     transaction inscrite au registre vise la MÊME cible : sans cette garde,
     un paiement réel servirait de clé pour régler autre chose. La fonction
     rend alors FAUX : la transaction appartient à une autre cible.
   ② CHAQUE EFFET RELIT SON DÛ. L'acompte d'un rendez-vous, la première
     échéance d'un abonnement, l'acompte d'une inscription : l'argent reçu
     doit les couvrir (un franc d'arrondi), et un dû absent ne se confirme
     pas. Les appelants le contrôlent déjà ; le contrôler ici aussi ferme la
     fenêtre entre leur lecture et cette écriture.
   ③ CHAQUE EFFET EST IDEMPOTENT. Un acompte déjà confirmé ne se réécrit
     pas, un versement d'abonnement ne s'inscrit qu'une fois, une
     inscription déjà réglée garde son premier règlement. */
async function applyPayment(admin: any, opts: {
  transactionId: string;
  tx: KkiaTransaction;
  partnerId: string;
  branchId: string;
  clientId?: string;
  /** L'abonnement réglé, quand c'en est un (29 août). */
  subId?: string;
  /** L'inscription à l'Académie réglée, quand c'en est une (17 septembre). */
  inscriptionId?: string;
  /** La consultation en ligne réglée, quand c'en est une (17 septembre). */
  consultationId?: string;
}): Promise<boolean> {
  const amount = Math.round(Number(opts.tx.amount ?? 0));
  const fees = Math.round(Number(opts.tx.fees ?? 0));
  const at = new Date().toISOString();
  const couvre = (du: number): boolean => du > 0 && amount + 1 >= du;

  // 1) Le registre. La clé primaire est l'identifiant KkiaPay : un paiement
  //    n'entre qu'une fois, quel que soit le nombre de rejeux.
  const { error: insErr } = await admin.from('payments').insert({
    id: opts.transactionId,
    branch_id: opts.branchId,
    data: {
      id: opts.transactionId,
      branchId: opts.branchId,
      provider: 'kkiapay',
      amountXof: amount,
      feesXof: fees,
      method: opts.tx.source ?? undefined,
      partnerId: opts.partnerId,
      clientId: opts.clientId,
      status: 'success',
      at,
    },
  });
  if (insErr) {
    if (insErr.code !== '23505') throw new Error(insErr.message);
    // Déjà au registre : l'effet ne se pose que pour la cible qu'il porte.
    const { data: inscrit } = await admin.from('payments').select('data').eq('id', opts.transactionId).maybeSingle();
    if (String(inscrit?.data?.partnerId ?? '') !== opts.partnerId) return false;
  }

  // 2) L'acompte du rendez-vous — posé par le SERVEUR, jamais par la cliente.
  if (opts.partnerId) {
    const { data: appt } = await admin.from('appointments').select('id, data').eq('id', opts.partnerId).maybeSingle();
    const d = (appt?.data ?? {}) as { depositXof?: number; depositConfirmed?: boolean };
    if (appt && d.depositConfirmed !== true && couvre(Math.round(Number(d.depositXof ?? 0)))) {
      await admin.from('appointments').update({ data: { ...d, depositXof: amount, depositConfirmed: true } }).eq('id', opts.partnerId);
    }
    // Pas de rendez-vous ? Le paiement reste au registre avec son partnerId :
    // le comptoir le rapprochera. On ne perd jamais un franc reçu.
  }

  /* 2bis) LE RÈGLEMENT D'UN ABONNEMENT — 29 août 2026. Il s'AJOUTE aux
     règlements existants (l'état de chaque échéance se dérive des versements,
     shared/echeancier.ts) ; l'identifiant du versement est celui de la
     transaction, deux rejeux n'inscrivent qu'une ligne. Le dû est la PREMIÈRE
     échéance quand elle a choisi de payer en deux fois, le prix entier sinon. */
  if (opts.subId) {
    const { data: sub } = await admin.from('subscribers').select('id, data').eq('id', opts.subId).maybeSingle();
    if (sub) {
      const d = (sub.data ?? {}) as { payments?: { id?: string }[]; status?: string; echeances?: { amountXof?: number }[]; priceXof?: number; mrrXof?: number };
      const deja = Array.isArray(d.payments) ? d.payments : [];
      const premiere = Array.isArray(d.echeances) && d.echeances.length > 0 ? Math.round(Number(d.echeances[0]?.amountXof ?? 0)) : 0;
      const du = premiere > 0 ? premiere : Math.round(Number(d.priceXof ?? d.mrrXof ?? 0));
      if (couvre(du) && !deja.some((x) => x?.id === opts.transactionId)) {
        await admin.from('subscribers').update({
          data: {
            ...d,
            payments: [...deja, { id: opts.transactionId, amountXof: amount, date: at.slice(0, 10), method: opts.tx.source ?? 'KkiaPay' }],
            /* Elle a payé : l'abonnement cesse d'être « neuf en attente ». */
            status: d.status === 'churn' ? d.status : 'active',
          },
        }).eq('id', opts.subId);
      }
    }
  }

  /* 2ter) L'INSCRIPTION À L'ACADÉMIE — 17 septembre 2026. La place n'est
     tenue qu'à l'acompte, que le SERVEUR fixe (0107, 40 % du parcours) et
     que lui seul confirme : le déclencheur de 0107 retire `acompteConfirme`
     de toute autre écriture. */
  if (opts.inscriptionId) {
    const { data: dem } = await admin.from('academie_demandes').select('id, data').eq('id', opts.inscriptionId).maybeSingle();
    const d = (dem?.data ?? {}) as { acompteXof?: number; acompteConfirme?: boolean };
    if (dem && d.acompteConfirme !== true && couvre(Math.round(Number(d.acompteXof ?? 0)))) {
      await admin.from('academie_demandes').update({
        data: { ...d, acompteConfirme: true, acompteVerseXof: amount, transactionId: opts.transactionId, payeLe: at },
      }).eq('id', opts.inscriptionId);
    }
  }

  /* 2quater) LA CONSULTATION EN LIGNE — 17 septembre 2026. Le paiement
     précède le questionnaire : si la ligne existe déjà (rejeu, filet tardif),
     on y pose le règlement ; sinon `push-notify` (tunnel-submit) relit le
     registre par `partnerId` au moment du dépôt. */
  if (opts.consultationId) {
    const { data: row } = await admin.from('consultations_queue').select('id, data').eq('id', opts.consultationId).maybeSingle();
    if (row) {
      const next = { ...(row.data ?? {}), paidXof: amount, transactionId: opts.transactionId, payeLe: at, reglement: 'kkiapay' };
      await admin.from('consultations_queue').update({ data: next }).eq('id', opts.consultationId);
    }
  }

  /* 3) AUCUNE dépense de commission. Les frais KkiaPay (1,9 % Mobile Money,
        4 % carte) sont à la charge de la CLIENTE : la Maison reçoit le montant
        demandé, entier. `feesXof` reste au registre pour la seule trace. */
  return true;
}

/* ══ LA CARTE CADEAU RÉGLÉE — 2 octobre 2026 ═══════════════════════════
   JUMELLE À L'IDENTIQUE dans kkiapay-verify et kkiapay-webhook (le harnais
   `verifie-cartes-cadeaux` compare les deux copies, et l'alphabet avec celui
   de `src/shared/cartes-cadeaux-pur.ts`).

   LE CODE NAÎT ICI, ET UNE SEULE FOIS. L'écriture est CONDITIONNELLE (la
   ligne n'a pas encore de code) : si la vérification et le filet arrivent
   ensemble, le second trouve la carte déjà réglée et rend LE MÊME code, au
   lieu d'en tirer un autre que l'acheteur verrait sans qu'il existe.
   L'avoir que porte la carte a un identifiant déduit d'elle : un rejeu ne
   le double pas. Le montant est celui de la COMMANDE, écrit avant le
   paiement ; les frais KkiaPay restent à l'acheteur. */
const ALPHABET_DU_CODE = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const tireUnCode = (): string => {
  const v = crypto.getRandomValues(new Uint32Array(8));
  const t = Array.from(v, (x) => ALPHABET_DU_CODE[x % ALPHABET_DU_CODE.length]).join('');
  return `MND-${t.slice(0, 4)}-${t.slice(4)}`;
};

async function regleLaCarte(admin: any, o: { carteId: string; transactionId: string }): Promise<{ code: string; valableJusquau: string } | null> {
  /* LA TRANSACTION EST CELLE DE CETTE CARTE — 10 octobre 2026 (revue de nuit).
     Rien ne reliait le paiement à la carte : une seule transaction réelle,
     rejouée avec l'identifiant d'une autre commande, réglait autant de cartes
     qu'on voulait, chacune avec son code et son avoir. Le registre dit à qui
     l'argent était destiné (`partnerId`, posé à sa première inscription) et
     combien est entré : la carte ne se règle que si c'est elle, et si c'est
     assez. Une carte déjà réglée ne rend son code qu'à SA transaction. */
  const { data: inscrit } = await admin.from('payments').select('data').eq('id', o.transactionId).maybeSingle();
  if (String(inscrit?.data?.partnerId ?? '') !== o.carteId) return null;
  const recu = Math.round(Number(inscrit?.data?.amountXof ?? 0));
  for (let essai = 0; essai < 6; essai++) {
    const { data: row } = await admin.from('cartes_cadeaux').select('id, branch_id, data').eq('id', o.carteId).maybeSingle();
    if (!row) return null;
    const c = (row.data ?? {}) as Record<string, any>;
    if (c.code) return c.transactionId === o.transactionId ? { code: String(c.code), valableJusquau: String(c.valableJusquau ?? '') } : null;
    /* UN GESTE NE SE RÈGLE PAS EN LIGNE (10 octobre 2026) : seul un montant
       a un prix écrit sur la commande. Un « geste » à montant glissé à la
       main ne devient pas « Création complète » pour 100 F. */
    if (c.objet !== 'montant') return null;
    if (c.statut !== 'a-regler') return null;
    const montant = Math.round(Number(c.montantXof ?? 0));
    if (montant <= 0 || recu + 1 < montant) return null;
    const at = new Date().toISOString();
    const d = new Date(at);
    const valable = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 12, d.getUTCDate())).toISOString().slice(0, 10);
    const creditId = `cre-${o.carteId}`;
    const code = tireUnCode();
    const next = {
      ...c, statut: 'reglee', code, valableJusquau: valable, payeLe: at,
      transactionId: o.transactionId, cashbox: 'KkiaPay', methode: 'KkiaPay', creditId,
    };
    const { data: pose, error } = await admin.from('cartes_cadeaux')
      .update({ data: next }).eq('id', o.carteId).is('data->>code', null).select('id');
    if (error) {
      if (error.code === '23505') continue; // ce code existe déjà ailleurs : on en tire un autre
      throw new Error(error.message);
    }
    if (!pose || pose.length === 0) continue; // réglée entre-temps : on relit, on rend son code
    const { error: e2 } = await admin.from('credit_movements').insert({
      id: creditId,
      branch_id: row.branch_id,
      data: {
        id: creditId, branchId: c.branchId ?? row.branch_id, holderType: 'carte', holderId: o.carteId,
        kind: 'depot', amountXof: montant, date: at, cashbox: 'KkiaPay', method: 'KkiaPay',
        note: `Carte cadeau ${code} · pour ${c.pour || '?'}, de la part de ${c.de || '?'}`,
      },
    });
    if (e2 && e2.code !== '23505') throw new Error(e2.message);
    return { code, valableJusquau: valable };
  }
  throw new Error('carte_non_reglee');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  // ① Serrure du secret. Réponse 200 quand même : un 4xx ferait retenter
  //    KkiaPay cinq fois pour rien, et renseignerait un attaquant sur sa cible.
  const secret = Deno.env.get('KKIAPAY_WEBHOOK_SECRET') ?? '';
  const sent = req.headers.get('x-kkiapay-secret') ?? '';
  if (!secret || !safeEqual(sent, secret)) {
    console.error('kkiapay-webhook: signature refusée');
    return new Response('ok', { status: 200 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* corps illisible */ }

  const transactionId = String(body?.transactionId ?? '');
  if (!transactionId) return new Response('ok', { status: 200 });

  // Un échec n'a rien à créditer — on accuse réception et on s'arrête.
  if (body?.isPaymentSucces === false || String(body?.event ?? '').includes('failed')) {
    console.log(`kkiapay-webhook: ${transactionId} échoué (${body?.failureMessage ?? '—'})`);
    return new Response('ok', { status: 200 });
  }

  try {
    // ② On ne croit pas le corps : on redemande à KkiaPay.
    const tx = await fetchTransaction(transactionId);
    if ((tx.status ?? '').toUpperCase() !== 'SUCCESS') return new Response('ok', { status: 200 });

    // Notre référence voyage dans `data` à l'ouverture du widget et revient
    // dans `stateData` ; `partnerId` en est le doublon de secours.
    let state: any = body?.stateData ?? {};
    if (typeof state === 'string') { try { state = JSON.parse(state); } catch { state = {}; } }
    const partnerId = String(state?.partnerId ?? body?.partnerId ?? '');
    let branchId = String(state?.branchId ?? '');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Branche inconnue (webhook plus ancien que l'app) : on la retrouve par ce
    // qui est réglé, pour que le paiement tombe dans la bonne maison.
    for (const table of ['subscribers', 'appointments', 'academie_demandes']) {
      if (branchId || !partnerId) break;
      const { data: br } = await admin.from(table).select('branch_id').eq('id', partnerId).maybeSingle();
      if (br?.branch_id) branchId = String(br.branch_id);
    }

    // LE MONTANT ATTENDU VIENT DU SERVEUR — 24 août 2026 (audit), jumeau du
    // contrôle de kkiapay-verify. On lit le dû SUR ce qui est réglé. Un paiement
    // réel INFÉRIEUR (100 F pour un acompte de 25 000 F) ne confirme rien : on
    // accuse réception (200, KkiaPay cesse de retenter) sans rien créditer, et
    // le comptoir rapprochera via le tableau KkiaPay.
    const paid = Math.round(Number(tx.amount ?? 0));
    /* LA CARTE CADEAU (`cc-…`) — 2 octobre 2026. Même lecture que
       kkiapay-verify : le montant de la commande déposée, jamais le corps, et
       seulement pour un MONTANT (10 octobre 2026). */
    if (partnerId.startsWith('cc-')) {
      const { data: cc } = await admin.from('cartes_cadeaux').select('branch_id, data').eq('id', partnerId).maybeSingle();
      const attendu = Math.round(Number(cc?.data?.montantXof ?? 0));
      if (!cc || cc.data?.objet !== 'montant' || attendu <= 0 || paid + 1 < attendu) {
        console.log(`kkiapay-webhook ${VERSION}: carte ${partnerId} non reglee (${paid} pour ${attendu})`);
        return new Response('ok', { status: 200 });
      }
      if (!branchId) branchId = String(cc.branch_id ?? '');
      await applyPayment(admin, { transactionId, tx, partnerId, branchId, clientId: state?.clientId });
      await regleLaCarte(admin, { carteId: partnerId, transactionId });
      return new Response('ok', { status: 200 });
    }
    /* CE QUE LA RÉFÉRENCE RÈGLE : un rendez-vous (`depositXof`), sinon un
       abonnement (sa première échéance, ou son prix entier), sinon une
       inscription à l'Académie (`acompteXof`, fixé par la base, 0107).
       L'INSCRIPTION MANQUAIT (10 octobre 2026, revue de nuit) : le widget de
       l'Académie part avec l'identifiant de la demande, et ce filet n'y
       reconnaissait rien. Quand la vérification ne venait pas, la place
       restait sans acompte confirmé, et personne au comptoir ne pouvait le
       poser (0107 réserve ce geste au serveur). */
    let subId: string | undefined;
    let inscriptionId: string | undefined;
    if (partnerId) {
      const { data: apptDue } = await admin
        .from('appointments').select('data').eq('id', partnerId).maybeSingle();
      let expected = Math.round(Number(apptDue?.data?.depositXof ?? 0));
      if (!apptDue) {
        const { data: subDue } = await admin
          .from('subscribers').select('data').eq('id', partnerId).maybeSingle();
        if (subDue) {
          subId = partnerId;
          const d = (subDue.data ?? {}) as { echeances?: { amountXof?: number }[]; priceXof?: number; mrrXof?: number };
          const premiere = Array.isArray(d.echeances) && d.echeances.length > 0
            ? Math.round(Number(d.echeances[0]?.amountXof ?? 0))
            : 0;
          expected = premiere > 0 ? premiere : Math.round(Number(d.priceXof ?? d.mrrXof ?? 0));
        } else {
          const { data: dem } = await admin
            .from('academie_demandes').select('data').eq('id', partnerId).maybeSingle();
          if (dem) {
            inscriptionId = partnerId;
            expected = Math.round(Number(dem.data?.acompteXof ?? 0));
          }
        }
      }
      if (expected > 0 && paid + 1 < expected) {
        console.log(`kkiapay-webhook ${VERSION}: ${transactionId} sous-payé (${paid} < ${expected}), non confirmé`);
        return new Response('ok', { status: 200 });
      }
    }

    await applyPayment(admin, { transactionId, tx, partnerId, branchId, clientId: state?.clientId, subId, inscriptionId });
    return new Response('ok', { status: 200 });
  } catch (e) {
    // Panne passagère (base ou KkiaPay) : on rend un 5xx EXPRÈS pour que
    // KkiaPay retente — l'insertion est idempotente, un rejeu ne coûte rien.
    console.error('kkiapay-webhook:', e instanceof Error ? e.message : String(e));
    return new Response('retry', { status: 500 });
  }
});
