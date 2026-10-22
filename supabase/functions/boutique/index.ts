// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* boutique — la caisse en ligne de la Boutique de la Maison (22 octobre 2026).
 *
 * « Construis la boutique de la Maison avec ses produits » (Yéman). Le site
 * (sans compte) et Ma Couronne (avec son compte) passent tous deux par ici :
 *
 *   commander  — relit le CATALOGUE, la date d'ouverture et les frais de
 *                livraison, refait le compte, puis écrit la commande comme
 *                celles de Ma Couronne : un devis CMD-… dans Factures.
 *                Le prix ne vient JAMAIS du navigateur.
 *   regler     — après le widget KkiaPay : redemande la vérité à KkiaPay,
 *                contrôle le montant contre la pièce ET le catalogue, inscrit
 *                la transaction au registre `payments` (référence cmd-<id>)
 *                et pose le versement sur la pièce, caisse KkiaPay. Rejouable :
 *                le Trône s'en sert aussi pour rapprocher un paiement que la
 *                fonction de rappel a gardé seul (page fermée trop tôt).
 *   prevenir   — « Me prévenir » : le numéro va dans le document privé
 *                `mnd_boutique_prevenir`, que seul le Trône lit.
 *
 * Verify JWT : ÉTEINT (le site n'a pas de compte). Un jeton de cliente, s'il
 * vient, rattache la commande à sa fiche.
 * Secrets : ceux de kkiapay-verify (KKIAPAY_PUBLIC_KEY, KKIAPAY_PRIVATE_KEY,
 * KKIAPAY_SECRET_KEY, KKIAPAY_API_BASE) et SERVICE_KEY. Déjà posés sur le
 * projet : rien à ajouter.
 */

const VERSION = '2026-10-22-a';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KKIA_BASE = Deno.env.get('KKIAPAY_API_BASE') ?? 'https://api.kkiapay.me';
const KKIA_VERIFY_PATH = '/api/v1/transactions/status';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify({ version: VERSION, ...(obj as object) }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── DEBUT copie de shared/boutique-pur.ts (verifie-la-boutique la compare, mot pour mot)
export type RayonId = 'quotidien' | 'soin' | 'accessoires' | 'coffrets' | 'maison' | 'mnd229' | 'kids';

export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export type FicheBoutique = {
  rayon: RayonId;
  /** Le nom montré à la cliente quand il diffère du nom du catalogue
      (« Le Quotidien » pour « T-shirt Le Quotidien »). */
  titre?: string;
  /** La ligne sous le titre : ingrédients, couleurs. */
  sous?: string;
  /** Format ou tailles : « 250 ml », « Du XS au XXL ». */
  format: string;
  /** Ce qu'on en fait, ou ce que montre le devant. */
  usage: string;
  /** Le flacon, le dos, la matière. */
  detail?: string;
  /** Fichiers sous /assets/boutique/ (jamais une adresse entière). */
  image: string;
  dos?: string;
  /** Le short assorti : son image ici, son PRODUIT à part (`shortDe`). */
  short?: string;
  /** Sur un short : l'identifiant de son t-shirt. Un short n'a pas de carte,
      il se choisit dans la fiche de son t-shirt. */
  shortDe?: string;
  tailles?: string[];
  /** « Édition d'octobre » : le mois se lit dans le nom. */
  edition?: string;
  /** Le t-shirt Nom de couronne : la commande porte le nom tapé. */
  perso?: boolean;
  /** Retiré de la vente par la Maison : visible, « Bientôt ». Absent = en vente. */
  enVente?: boolean;
  ordre: number;
};

export type ArticleLu = { id: string; name: string; priceXof: number; stock: number; boutique?: FicheBoutique };

const DECALAGE_COTONOU_MS = 60 * 60 * 1000;

export const moisDeCotonou = (maintenant: Date): number => new Date(maintenant.getTime() + DECALAGE_COTONOU_MS).getUTCMonth() + 1;

export function boutiqueOuverte(ouverture: string | undefined, maintenant: Date): boolean {
  const t = Date.parse(ouverture ?? '');
  return Number.isFinite(t) && t <= maintenant.getTime();
}

export function moisDeLEdition(edition: string | undefined): number {
  if (!edition) return 0;
  const i = MOIS.findIndex((m) => edition.includes(m));
  return i + 1;
}

export const enSaison = (mois: number, moisVu: number): boolean => !mois || moisVu === mois || moisVu === ((mois + 10) % 12) + 1;

export type EtatArticle = 'vendable' | 'bientot' | 'cache';

export function etatDeLArticle(a: ArticleLu, maintenant: Date): EtatArticle {
  const f = a.boutique;
  if (!f || f.shortDe) return 'cache';
  if (!enSaison(moisDeLEdition(f.edition), moisDeCotonou(maintenant))) return 'cache';
  if (f.enVente === false || !(a.priceXof > 0) || !(a.stock > 0)) return 'bientot';
  return 'vendable';
}

export function shortVendable(short: ArticleLu | undefined, tshirt: ArticleLu, maintenant: Date): boolean {
  if (!short?.boutique) return false;
  if (etatDeLArticle(tshirt, maintenant) === 'cache') return false;
  return short.boutique.enVente !== false && short.priceXof > 0 && short.stock > 0;
}

export type LigneDemandee = { id: string; qte: number; taille?: string; perso?: string };

export type Remise = 'retrait' | 'livraison';

export type RefusDeCommande =
  | 'fermee' | 'vide' | 'trop' | 'inconnu' | 'pas-en-vente' | 'stock' | 'taille' | 'perso' | 'adresse';

export const MAX_LIGNES = 20;

export const MAX_QTE = 10;

export function chiffreLaCommande(o: {
  lignes: LigneDemandee[];
  catalogue: ArticleLu[];
  remise: Remise;
  adresse?: string;
  fraisLivraisonXof: number;
  ouverture: string | undefined;
  maintenant: Date;
}): { ok: true; lignes: { article: ArticleLu; qte: number; taille?: string; perso?: string; unitXof: number }[]; produitsXof: number; fraisXof: number; totalXof: number } | { ok: false; refus: RefusDeCommande; id?: string } {
  if (!boutiqueOuverte(o.ouverture, o.maintenant)) return { ok: false, refus: 'fermee' };
  if (!Array.isArray(o.lignes) || o.lignes.length === 0) return { ok: false, refus: 'vide' };
  if (o.lignes.length > MAX_LIGNES) return { ok: false, refus: 'trop' };
  const parId = new Map(o.catalogue.map((a) => [a.id, a]));
  const voulu = new Map<string, number>();
  const sortie: { article: ArticleLu; qte: number; taille?: string; perso?: string; unitXof: number }[] = [];
  for (const l of o.lignes) {
    const qte = Math.floor(Number(l?.qte));
    if (!(qte >= 1 && qte <= MAX_QTE)) return { ok: false, refus: 'trop', id: l?.id };
    const a = parId.get(String(l?.id ?? ''));
    if (!a?.boutique) return { ok: false, refus: 'inconnu', id: l?.id };
    const f = a.boutique;
    const tshirt = f.shortDe ? parId.get(f.shortDe) : undefined;
    if (f.shortDe ? !tshirt || !shortVendable(a, tshirt, o.maintenant) : etatDeLArticle(a, o.maintenant) !== 'vendable') {
      return { ok: false, refus: 'pas-en-vente', id: a.id };
    }
    const tailles = f.tailles ?? [];
    const taille = String(l.taille ?? '').trim();
    if (tailles.length ? !tailles.includes(taille) : taille !== '') return { ok: false, refus: 'taille', id: a.id };
    const perso = String(l.perso ?? '').trim().slice(0, 24);
    if (f.perso && !perso) return { ok: false, refus: 'perso', id: a.id };
    voulu.set(a.id, (voulu.get(a.id) ?? 0) + qte);
    if ((voulu.get(a.id) ?? 0) > a.stock) return { ok: false, refus: 'stock', id: a.id };
    sortie.push({ article: a, qte, ...(taille ? { taille } : {}), ...(f.perso ? { perso } : {}), unitXof: Math.round(a.priceXof) });
  }
  if (o.remise === 'livraison' && !String(o.adresse ?? '').trim()) return { ok: false, refus: 'adresse' };
  const produitsXof = sortie.reduce((n, l) => n + l.unitXof * l.qte, 0);
  const fraisXof = o.remise === 'livraison' ? Math.max(0, Math.round(o.fraisLivraisonXof)) : 0;
  return { ok: true, lignes: sortie, produitsXof, fraisXof, totalXof: produitsXof + fraisXof };
}

export const libelleDeLigne = (a: ArticleLu, taille?: string, perso?: string): string =>
  [a.name, taille, perso ? `« ${perso} »` : ''].filter(Boolean).join(' · ');

export const LIBELLE_LIVRAISON = 'Livraison dans Cotonou';

export function duDeLaPiece(lignes: { produitId?: string; label?: string; qty: number; unitXof: number }[], prixDuCatalogue: (id: string) => number): number {
  let du = 0;
  for (const l of lignes) {
    const q = Math.max(0, Math.round(Number(l.qty) || 0));
    const ecrit = Math.max(0, Math.round(Number(l.unitXof) || 0));
    const cat = l.produitId ? Math.max(0, Math.round(prixDuCatalogue(l.produitId) || 0)) : 0;
    du += q * Math.max(ecrit, cat);
  }
  return du;
}

export const numeroDeCommande = (annee: number, tirage: number): string => `CMD-${annee}-${String(Math.abs(Math.floor(tirage)) % 10000).padStart(4, '0')}`;

export const PREFIXE_PAIEMENT = 'cmd-';

export const referenceDePaiement = (commandeId: string): string => `${PREFIXE_PAIEMENT}${commandeId}`;

export const cleDuNumero = (numero: string | undefined): string => String(numero ?? '').replace(/\D/g, '').slice(-8);

export const numeroValable = (numero: string | undefined): boolean => cleDuNumero(numero).length === 8;
// ── FIN copie de shared/boutique-pur.ts

/* ── La limite de débit, la même table que les demandes du site (0007) ── */
const ipOf = (req: Request): string => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
async function permis(ip: string, seau: string, plafond: number): Promise<boolean> {
  const depuis = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count, error } = await admin.from('edge_rate_limits').select('*', { count: 'exact', head: true })
    .eq('bucket', seau).eq('ip', ip).gte('at', depuis);
  if (error) return true; // table absente : ne pas bloquer une vente
  if ((count ?? 0) >= plafond) return false;
  await admin.from('edge_rate_limits').insert({ bucket: seau, ip });
  return true;
}

const document = async (key: string): Promise<any> =>
  (await admin.from('documents').select('data').eq('key', key).maybeSingle())?.data?.data ?? null;

/** Le jour de Cotonou, AAAA-MM-JJ, et l'heure HH:mm. */
const jourDeCotonou = (d = new Date()): string => new Date(d.getTime() + DECALAGE_COTONOU_MS).toISOString().slice(0, 10);
const heureDeCotonou = (d = new Date()): string => new Date(d.getTime() + DECALAGE_COTONOU_MS).toISOString().slice(11, 16);

/** Le catalogue lu pour ces identifiants, et les t-shirts de leurs shorts. */
async function catalogue(ids: string[]): Promise<ArticleLu[]> {
  const voulus = [...new Set(ids.map(String).filter(Boolean))].slice(0, 60);
  if (!voulus.length) return [];
  const { data } = await admin.from('catalog_products').select('id,data').in('id', voulus);
  const lus: ArticleLu[] = (data ?? []).map((r: any) => ({ ...(r.data ?? {}), id: r.id }));
  const parents = lus.map((a) => a.boutique?.shortDe).filter((x): x is string => !!x && !voulus.includes(x));
  if (parents.length) {
    const { data: p } = await admin.from('catalog_products').select('id,data').in('id', parents);
    for (const r of p ?? []) lus.push({ ...(r.data ?? {}), id: r.id });
  }
  return lus.map((a) => ({ ...a, priceXof: Math.round(Number(a.priceXof) || 0), stock: Math.round(Number(a.stock) || 0) }));
}

/** La cliente d'un numéro : la seule fiche de la branche dont les huit
    derniers chiffres concordent. Deux fiches ou aucune : on n'en devine pas. */
async function clienteDuNumero(branchId: string, cle: string): Promise<{ id: string; name: string } | null> {
  if (cle.length !== 8) return null;
  const trouvees: { id: string; name: string }[] = [];
  for (let de = 0; de < 20000; de += 1000) {
    const { data, error } = await admin.from('clients').select('id,data').eq('branch_id', branchId).range(de, de + 999);
    if (error || !data) break;
    for (const r of data) {
      const d = r.data ?? {};
      if (cleDuNumero(d.phone) === cle || cleDuNumero(d.phone2) === cle) trouvees.push({ id: r.id, name: String(d.name ?? '') });
    }
    if (data.length < 1000) break;
  }
  return trouvees.length === 1 ? trouvees[0] : null;
}

/** Une cliente de Ma Couronne : son jeton dit qui elle est. */
async function clienteDuJeton(req: Request): Promise<string | null> {
  const h = req.headers.get('authorization') ?? '';
  const jeton = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!jeton || jeton.split('.').length !== 3) return null;
  try {
    const { data } = await admin.auth.getUser(jeton);
    return data?.user?.id ?? null;
  } catch { return null; }
}

/** SA FICHE, pas son compte. Une fiche ADOPTÉE garde l'identifiant que le
    Trône lui a donné ; le compte n'y est noté que dans `authUserId`. Rattacher
    la commande au compte la poserait sur une fiche qui n'existe pas. */
async function ficheDuCompte(uid: string): Promise<{ id: string; name: string } | null> {
  const { data: meme } = await admin.from('clients').select('id,data').eq('id', uid).maybeSingle();
  if (meme) return { id: meme.id, name: String(meme.data?.name ?? '') };
  const { data: adoptees } = await admin.from('clients').select('id,data').eq('data->>authUserId', uid).limit(2);
  return adoptees?.length === 1 ? { id: adoptees[0].id, name: String(adoptees[0].data?.name ?? '') } : null;
}

/* ══ commander ═══════════════════════════════════════════════════════════ */
async function commander(req: Request, b: any) {
  if (!(await permis(ipOf(req), 'boutique', 8))) return json({ error: 'trop_de_commandes' }, 429);
  const cfg = (await document('mnd_vitrine_config')) ?? {};
  const branchId = String(cfg.branchId ?? '');
  if (!branchId) return json({ error: 'maison_introuvable' }, 500);
  const reglages = (await document('mnd_settings')) ?? {};
  const lignes: LigneDemandee[] = Array.isArray(b.lignes) ? b.lignes.slice(0, MAX_LIGNES + 1) : [];
  const remise: Remise = b.remise === 'livraison' ? 'livraison' : 'retrait';
  const adresse = String(b.adresse ?? '').trim().slice(0, 300);
  const nom = String(b.nom ?? '').trim().slice(0, 80);
  const numero = String(b.numero ?? '').trim().slice(0, 30);
  const paiement = b.paiement === 'kkiapay' ? 'kkiapay' : 'maison';
  const origine = b.origine === 'couronne' ? 'couronne' : 'site';

  const clienteJeton = await clienteDuJeton(req);
  if (!clienteJeton && (!nom || !numeroValable(numero))) return json({ error: 'coordonnees' }, 400);

  const cat = await catalogue(lignes.map((l) => String(l?.id ?? '')));
  const c = chiffreLaCommande({
    lignes, catalogue: cat, remise, adresse,
    fraisLivraisonXof: Number.isFinite(Number(reglages.deliveryFeeXof)) ? Number(reglages.deliveryFeeXof) : 2000,
    ouverture: cfg.boutique?.ouverture, maintenant: new Date(),
  });
  if (!c.ok) return json({ error: c.refus, id: c.id }, c.refus === 'fermee' ? 403 : 409);

  /* La cliente : son compte, sinon son numéro, sinon personne (le Trône la
     rattachera). Le nom tapé reste sur la pièce dans tous les cas. */
  let clientId = clienteJeton ?? '';
  let clientName = nom;
  if (clienteJeton) {
    const fiche = await ficheDuCompte(clienteJeton);
    if (fiche) { clientId = fiche.id; clientName = fiche.name || nom; }
  } else {
    const trouvee = await clienteDuNumero(branchId, cleDuNumero(numero));
    if (trouvee) clientId = trouvee.id;
  }

  const id = crypto.randomUUID();
  const annee = Number(jourDeCotonou().slice(0, 4));
  let number = '';
  for (let essai = 0; essai < 5 && !number; essai++) {
    const n = numeroDeCommande(annee, crypto.getRandomValues(new Uint32Array(1))[0]);
    const { data: pris } = await admin.from('invoices').select('id').eq('data->>number', n).limit(1);
    if (!pris?.length) number = n;
  }
  if (!number) return json({ error: 'numero' }, 500);

  const pieceLignes = c.lignes.map((l) => ({
    id: crypto.randomUUID(), label: libelleDeLigne(l.article, l.taille, l.perso), qty: l.qte, unitXof: l.unitXof,
    discountPct: 0, produitId: l.article.id,
  }));
  if (c.fraisXof > 0) pieceLignes.push({ id: crypto.randomUUID(), label: LIBELLE_LIVRAISON, qty: 1, unitXof: c.fraisXof, discountPct: 0, produitId: undefined as any });
  /* La note ne dit pas « réglée » : la cliente peut fermer KkiaPay et choisir
     de régler au retrait. Ce qui est payé se lit sur les versements de la
     pièce, jamais ici. */
  const note = [
    remise === 'livraison' ? `Livraison dans Cotonou : ${adresse}` : 'Retrait à la Maison',
    numero ? `WhatsApp : ${numero}` : '',
  ].filter(Boolean).join('\n');
  const piece = {
    id, branchId, kind: 'devis', number, clientId, date: jourDeCotonou(), lines: pieceLignes,
    globalDiscountPct: 0, theme: 'Souffle', status: 'envoyée', clientName, note,
    boutique: { origine, remise, numero, ...(adresse ? { adresse } : {}), paiement, totalXof: c.totalXof, creeLe: new Date().toISOString(), etat: 'a-preparer' },
  };
  const { error } = await admin.from('invoices').insert({ id, branch_id: branchId, data: piece });
  if (error) return json({ error: 'ecriture', detail: error.message }, 500);
  return json({ ok: true, commandeId: id, numero: number, totalXof: c.totalXof, reference: referenceDePaiement(id), branchId });
}

/* ══ regler ══════════════════════════════════════════════════════════════ */
type KkiaTransaction = { status?: string; amount?: number; fees?: number; source?: string; failureMessage?: string };
async function transaction(transactionId: string): Promise<KkiaTransaction> {
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
    const detail = await res.text().catch(() => '');
    throw new Error(res.status === 404 ? 'transaction_introuvable' : `kkiapay_${res.status} ${detail.slice(0, 160)}`);
  }
  return (await res.json()) as KkiaTransaction;
}

async function regler(b: any) {
  const commandeId = String(b.commandeId ?? '').trim();
  const transactionId = String(b.transactionId ?? '').trim();
  if (!commandeId || !transactionId) return json({ error: 'bad_request' }, 400);
  const { data: row } = await admin.from('invoices').select('branch_id,data').eq('id', commandeId).maybeSingle();
  const d = row?.data as any;
  if (!d?.boutique) return json({ error: 'commande_introuvable' }, 404);
  const versementId = `kkia-${transactionId}`;
  if ((d.payments ?? []).some((p: any) => p.id === versementId)) return json({ ok: true, deja: true, numero: d.number });

  const tx = await transaction(transactionId);
  if ((tx.status ?? '').toUpperCase() !== 'SUCCESS') return json({ error: 'echec', detail: tx.failureMessage ?? tx.status ?? '' }, 402);

  /* Ce qui est dû se relit sur la pièce ET le catalogue (au plus haut des
     deux), jamais dans le corps : une ligne baissée par le navigateur ne fait
     pas payer moins. */
  const cat = await catalogue((d.lines ?? []).map((l: any) => String(l.produitId ?? '')));
  const prix = new Map(cat.map((a) => [a.id, a.priceXof]));
  const du = duDeLaPiece(d.lines ?? [], (pid) => prix.get(pid) ?? 0);
  const verse = (d.payments ?? []).reduce((n: number, p: any) => n + Math.round(Number(p.amountXof) || 0), 0);
  const attendu = Math.max(0, du - verse);
  const paye = Math.round(Number(tx.amount ?? 0));
  if (attendu <= 0) return json({ error: 'deja_reglee', numero: d.number }, 409);
  if (paye + 1 < attendu) return json({ error: 'montant', payeXof: paye, attenduXof: attendu }, 402);

  // 1) Le registre : la clé est la transaction ; elle ne règle qu'UNE pièce.
  const reference = referenceDePaiement(commandeId);
  const { error: insErr } = await admin.from('payments').insert({
    id: transactionId, branch_id: row!.branch_id,
    data: {
      id: transactionId, branchId: row!.branch_id, provider: 'kkiapay', amountXof: paye,
      feesXof: Math.round(Number(tx.fees ?? 0)), method: tx.source ?? undefined, partnerId: reference,
      clientId: d.clientId || undefined, status: 'success', at: new Date().toISOString(),
    },
  });
  if (insErr) {
    if (insErr.code !== '23505') throw new Error(insErr.message);
    const { data: inscrit } = await admin.from('payments').select('data').eq('id', transactionId).maybeSingle();
    if (String(inscrit?.data?.partnerId ?? '') !== reference) return json({ error: 'transaction_deja_utilisee' }, 409);
  }

  // 2) Le versement sur la pièce : c'est LUI qui entre à la caisse KkiaPay.
  const maintenant = new Date();
  const versement = { id: versementId, date: jourDeCotonou(maintenant), amountXof: paye, method: 'KkiaPay', cashbox: 'KkiaPay', time: heureDeCotonou(maintenant), note: `Boutique · transaction ${transactionId}` };
  const payments = [...(d.payments ?? []), versement];
  const solde = payments.reduce((n: number, p: any) => n + Math.round(Number(p.amountXof) || 0), 0) + 1 >= du;
  const neuf = {
    ...d, payments, payment: d.payment ?? 'KkiaPay', cashbox: d.cashbox ?? 'KkiaPay', time: d.time ?? versement.time,
    status: solde ? 'payée' : d.status,
    boutique: { ...d.boutique, paiement: 'kkiapay', payeLe: maintenant.toISOString() },
  };
  const { error: majErr } = await admin.from('invoices').update({ data: neuf }).eq('id', commandeId);
  if (majErr) throw new Error(majErr.message);
  return json({ ok: true, numero: d.number, payeXof: paye });
}

/* ══ prevenir ════════════════════════════════════════════════════════════ */
async function prevenir(req: Request, b: any) {
  if (!(await permis(ipOf(req), 'boutique-prevenir', 12))) return json({ error: 'trop' }, 429);
  const produitId = String(b.produitId ?? '').trim();
  const numero = String(b.numero ?? '').trim().slice(0, 30);
  const compte = await clienteDuJeton(req);
  const clienteJeton = compte ? ((await ficheDuCompte(compte))?.id ?? compte) : null;
  if (!produitId || (!clienteJeton && !numeroValable(numero))) return json({ error: 'coordonnees' }, 400);
  const [a] = await catalogue([produitId]);
  if (!a?.boutique) return json({ error: 'inconnu' }, 404);
  const cle = cleDuNumero(numero);
  const doc = (await document('mnd_boutique_prevenir')) ?? { liste: [] };
  const liste: any[] = Array.isArray(doc.liste) ? doc.liste : [];
  const deja = liste.some((x) => x.produitId === produitId && !x.prevenuLe && ((cle && x.cle === cle) || (clienteJeton && x.clientId === clienteJeton)));
  if (!deja) {
    liste.push({
      id: crypto.randomUUID(), produitId, numero, cle, nom: String(b.nom ?? '').trim().slice(0, 80),
      ...(clienteJeton ? { clientId: clienteJeton } : {}), le: new Date().toISOString(),
    });
    const garde = liste.slice(-3000);
    const { error } = await admin.from('documents').upsert({ key: 'mnd_boutique_prevenir', data: { ...doc, liste: garde } });
    if (error) return json({ error: 'ecriture' }, 500);
  }
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') {
    return json({
      ok: true,
      secrets: {
        public: !!Deno.env.get('KKIAPAY_PUBLIC_KEY'), private: !!Deno.env.get('KKIAPAY_PRIVATE_KEY'),
        secret: !!Deno.env.get('KKIAPAY_SECRET_KEY'), service: !!SERVICE_KEY,
      },
    });
  }
  try {
    const b = await req.json().catch(() => ({}));
    if (b.action === 'commander') return await commander(req, b);
    if (b.action === 'regler') return await regler(b);
    if (b.action === 'prevenir') return await prevenir(req, b);
    return json({ error: 'action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
