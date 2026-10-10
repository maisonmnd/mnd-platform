// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* kkiapay-verify — le SEUL endroit qui a le droit de dire « l'acompte est reçu ».
 *
 * Appelée par Ma Couronne juste après que le widget KkiaPay a annoncé un succès.
 * Cette annonce ne prouve rien (n'importe qui peut appeler cette fonction avec
 * un identifiant inventé) : on redemande donc la vérité à KkiaPay avec les clés
 * privée + secrète, et on CONTRÔLE LE MONTANT. Sans ce contrôle, une cliente
 * paierait 100 F pour un acompte de 25 000 F.
 *
 * Effets, tous idempotents (la clé primaire de `payments` EST l'identifiant de
 * transaction — la fonction peut être rejouée, et le webhook fait la même chose
 * de son côté ; le premier arrivé écrit, le second ne double rien) :
 *   1. enregistre le paiement dans `payments` ;
 *   2. pose `depositConfirmed: true` sur le rendez-vous ;
 *   3. inscrit la commission KkiaPay en DÉPENSE de la caisse KkiaPay —
 *      décision de la Maison : le chiffre d'affaires reste BRUT (la cliente a
 *      bien payé ce montant), les frais sont une charge de la Maison.
 *
 * Secrets à poser sur la fonction : KKIAPAY_PUBLIC_KEY, KKIAPAY_PRIVATE_KEY,
 * KKIAPAY_SECRET_KEY, et SERVICE_KEY (clé de service Supabase, comme push-notify).
 * KKIAPAY_API_BASE bascule vers le bac à sable.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/* Route et en-têtes VÉRIFIÉS contre l'API le 28-07-2026 (la documentation
   publique ne les publie pas) : `POST /api/v1/transactions/status` répond 401
   INVALID_KEY sans clés — donc la route existe — et accepte le triplet
   x-api-key / x-private-key / x-secret-key. Bac à sable et production vivent à
   deux adresses distinctes (api-sandbox / api), d'où KKIAPAY_API_BASE.
   Isolés ici pour qu'un changement chez KkiaPay ne coûte qu'une ligne. */
const KKIA_BASE = Deno.env.get('KKIAPAY_API_BASE') ?? 'https://api.kkiapay.me';
const KKIA_VERIFY_PATH = '/api/v1/transactions/status';

/** La version de ce fichier, rendue dans chaque réponse : dire ce qui tourne
    vraiment évite de chercher une panne dans un fichier qui n'est pas celui
    qu'on croit déployé. 10 octobre 2026 : une transaction, une cible ; le
    montant attendu de CETTE cible, jamais du corps ; la carte cadeau liée à
    sa transaction (revue de nuit). */
const VERSION = '2026-10-10-a';

/* LA CONSULTATION EN LIGNE SE PAIE AVANT D'EXISTER — 17 septembre 2026.
   Aucune ligne à relire : la barre est celle de la Maison, tenue ICI, et
   jamais par le corps de la requête. Le tunnel affiche le même montant
   (FEE_XOF, consultation/data.ts) ; le changer se fait aux deux endroits, et
   ce secret optionnel évite de redéployer pour un tarif. */
const CONSULTATION_FEE_XOF = Math.round(Number(Deno.env.get('CONSULTATION_FEE_XOF') ?? 15000));

type KkiaTransaction = {
  status?: string;
  amount?: number;
  fees?: number;
  source?: string;
  performed_at?: string;
  failureMessage?: string;
};

/** Demande la vérité à KkiaPay. Lève si la transaction est introuvable. */
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
  if (!res.ok) {
    /* On emporte le motif de KkiaPay : « INVALID_KEY » et « transaction
       introuvable » se soignent très différemment, et sans ce détail on cherche
       à l'aveugle. */
    const detail = await res.text().catch(() => '');
    throw new Error(res.status === 404 ? 'not_found' : `upstream_${res.status} ${detail.slice(0, 160)}`);
  }
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { transactionId, apptId, subId, inscriptionId, consultationId, carteId, branchId, clientId } = await req.json();
    if (!transactionId || !branchId) return json({ error: 'bad_request', version: VERSION }, 400);

    /* UNE TRANSACTION, UNE CIBLE — 10 octobre 2026 (revue de nuit). Le corps
       pouvait nommer un rendez-vous ET une inscription : le montant attendu
       se lisait sur l'une, s'écrasait avec celui de l'autre (zéro pour une
       inscription inventée), et l'acompte du rendez-vous se confirmait pour
       100 F. Avec une carte en plus, le même argent comptait deux fois. Un
       paiement règle UNE chose : deux cibles, ou aucune, se refusent avant
       même de parler à KkiaPay. */
    const cibles = [apptId, subId, inscriptionId, consultationId, carteId].filter((c) => String(c ?? '').trim() !== '');
    if (cibles.length !== 1) return json({ error: cibles.length > 1 ? 'cibles_multiples' : 'cible_absente', version: VERSION }, 400);

    const tx = await fetchTransaction(String(transactionId));
    if ((tx.status ?? '').toUpperCase() !== 'SUCCESS') {
      return json({ error: 'failed', detail: tx.failureMessage ?? tx.status ?? '' }, 402);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    /* LE MONTANT ATTENDU VIENT DU SERVEUR, PAS DU CLIENT — 24 août 2026 (audit),
       et SEULEMENT DE LA CIBLE — 10 octobre 2026. `expectedXof` du corps ne
       sert plus à rien, pas même de repli : un repli à zéro sautait tout le
       contrôle. Une cible introuvable, ou sans montant, se refuse (404), sauf
       un cas : le rendez-vous de Ma Couronne, qui se paie AVANT de s'écrire
       (Booking, « on paie, le serveur vérifie, puis la réservation s'écrit »).
       Absent ici, il n'a rien à confirmer : le paiement entre au registre
       seul, et le filet confirmera l'acompte quand la fiche portera son dû. */
    let expected = 0;
    if (apptId) {
      const { data: apptDue } = await admin
        .from('appointments').select('data').eq('id', String(apptId)).maybeSingle();
      if (apptDue) {
        expected = Math.round(Number(apptDue?.data?.depositXof ?? 0));
        if (expected <= 0) return json({ error: 'cible_sans_montant', version: VERSION }, 404);
      }
    }
    /* L'ABONNEMENT PRIS DEPUIS MA COURONNE — 29 août 2026. Ce qu'on attend
       d'elle est la PREMIÈRE ÉCHÉANCE quand elle a choisi de payer en deux
       fois, et le prix entier sinon. `souscrire_a_une_formule` (0077) a écrit
       l'un ou l'autre à la signature. Sans quoi une cliente ouvrirait une
       Année à 405 000 F en réglant 100 F. */
    if (subId) {
      const { data: row } = await admin
        .from('subscribers').select('id, data').eq('id', String(subId)).maybeSingle();
      const d = (row?.data ?? {}) as { echeances?: { amountXof?: number }[]; priceXof?: number; mrrXof?: number };
      const premiere = Array.isArray(d.echeances) && d.echeances.length > 0
        ? Math.round(Number(d.echeances[0]?.amountXof ?? 0))
        : 0;
      expected = premiere > 0 ? premiere : Math.round(Number(d.priceXof ?? d.mrrXof ?? 0));
      if (!row || expected <= 0) return json({ error: 'cible_sans_montant', version: VERSION }, 404);
    }
    /* L'INSCRIPTION À L'ACADÉMIE — 17 septembre 2026. Le site dépose la
       demande AVANT d'ouvrir le widget ; l'acompte y est fixé par la base
       (0107). On le relit ici ; sans lui, on refuse. */
    if (inscriptionId) {
      const { data: dem } = await admin
        .from('academie_demandes').select('data').eq('id', String(inscriptionId)).maybeSingle();
      expected = Math.round(Number(dem?.data?.acompteXof ?? 0));
      if (expected <= 0) return json({ error: 'cible_sans_montant', version: VERSION }, 404);
    }
    /* LA CONSULTATION EN LIGNE — 17 septembre 2026. Pas de ligne à relire :
       la barre est celle de la Maison, tenue par le serveur. */
    if (consultationId) expected = CONSULTATION_FEE_XOF;
    /* LA CARTE CADEAU — 2 octobre 2026. Le site dépose la commande AVANT
       d'ouvrir KkiaPay, montant écrit (et borné par la base). On le relit
       ici ; seul un MONTANT se règle en ligne (10 octobre 2026). */
    if (carteId) {
      const { data: cc } = await admin
        .from('cartes_cadeaux').select('data').eq('id', String(carteId)).maybeSingle();
      expected = Math.round(Number(cc?.data?.montantXof ?? 0));
      if (cc?.data?.objet !== 'montant' || expected <= 0) return json({ error: 'carte_introuvable', version: VERSION }, 404);
    }

    // Le contrôle qui protège la Maison : on n'ouvre rien tant que le montant
    // reçu n'atteint pas ce qui est attendu (tolérance d'un franc d'arrondi).
    const paid = Math.round(Number(tx.amount ?? 0));
    if (expected > 0 && paid + 1 < expected) {
      return json({ error: 'amount_mismatch', amountXof: paid, expectedXof: expected, version: VERSION }, 402);
    }

    /* Une transaction déjà inscrite pour une AUTRE cible ne règle rien ici :
       on le dit (409) au lieu d'un « ok » qui ferait croire à un paiement. */
    const pourCetteCible = await applyPayment(admin, {
      transactionId: String(transactionId),
      tx,
      /* La référence est la cible, et elle seule : c'est elle qui relie le
         paiement à ce qu'il règle, au registre comme au comptoir. */
      partnerId: String(cibles[0]),
      branchId: String(branchId),
      clientId: clientId ? String(clientId) : undefined,
      subId: subId ? String(subId) : undefined,
      inscriptionId: inscriptionId ? String(inscriptionId) : undefined,
      consultationId: consultationId ? String(consultationId) : undefined,
    });
    if (!pourCetteCible) return json({ error: 'transaction_deja_utilisee', version: VERSION }, 409);

    /* La carte se règle APRÈS le registre : si le paiement y était déjà
       (rejeu, filet passé avant), elle se règle quand même, ou rend son code,
       mais seulement pour SA transaction (voir regleLaCarte). */
    const carte = carteId
      ? await regleLaCarte(admin, { carteId: String(carteId), transactionId: String(transactionId) })
      : null;
    if (carteId && !carte) return json({ error: 'carte_non_reglee', version: VERSION }, 409);

    return json({ ok: true, version: VERSION, amountXof: paid, feesXof: Math.round(Number(tx.fees ?? 0)), method: tx.source, ...(carte ? { carte } : {}) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    /* Diagnostic d'installation : QUELS secrets sont posés (jamais leur valeur)
       et à QUELLE adresse on a parlé. Un 401 vient presque toujours de l'un des
       deux — clés absentes, ou clés de bac à sable envoyées à la production
       parce que KKIAPAY_API_BASE manque. */
    return json({
      error: msg,
      base: KKIA_BASE,
      secrets: {
        public: !!Deno.env.get('KKIAPAY_PUBLIC_KEY'),
        private: !!Deno.env.get('KKIAPAY_PRIVATE_KEY'),
        secret: !!Deno.env.get('KKIAPAY_SECRET_KEY'),
        service: !!SERVICE_KEY,
      },
    }, msg === 'not_found' ? 404 : 500);
  }
});
