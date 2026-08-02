#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   GÉNÉRATEUR D'IMPORT — ancien ERP Firestore → Le Trône (Supabase).

     node scripts/firestore-export.mjs <clé.json> <export>
     node scripts/import-genere.mjs <export> <catalogue-v6.json> <sortie.sql>

   N'ÉCRIT RIEN dans Supabase : il produit un fichier SQL à relire, puis à
   coller dans le SQL Editor. Rejouable — chaque ligne est un `upsert` sur
   son identifiant, donc relancer le même fichier corrige au lieu d'empiler.

   ── LES QUATRE INVARIANTS ────────────────────────────────────────
   ① LE PRIX EST FIGÉ. `priceXof` du rendez-vous porte le montant
      RÉELLEMENT facturé à l'époque. Aucun recalcul : le catalogue v6 a
      d'autres tarifs, et recalculer réécrirait l'histoire (3 M F d'écart
      constatés sur un import précédent de cette maison).
   ② L'ARGENT EST DATÉ. Chaque versement garde SA date : une avance de
      400 000 F reçue en avril pour un rituel de mai reste de l'argent
      d'avril. Sans ça, deux mois sont faux d'un coup.
   ③ DEUX ÉCRITURES POUR LA BRANCHE — `data->>'branchId'` ET la colonne
      `branch_id`. L'app lit la première, la sécurité RLS lit la seconde.
   ④ LES DATES SONT DES JOURS NUS (AAAA-MM-JJ). Une quarantaine d'écrans
      comparent la date au caractère près ; un horodatage n'y existe pas.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [, , exportDir, cataloguePath, outPath] = process.argv;
if (!exportDir || !cataloguePath || !outPath) {
  console.error('Usage : node scripts/import-genere.mjs <export> <catalogue-v6.json> <sortie.sql>');
  process.exit(1);
}
const D = resolve(exportDir);
const J = (f) => (existsSync(join(D, f)) ? JSON.parse(readFileSync(join(D, f), 'utf8')) : []);
const CAT = JSON.parse(readFileSync(resolve(cataloguePath), 'utf8'));

const BRANCH = 'br-40r6u6frno'; // MND HOME — la seule branche (les maisons se lisent au catalogue)
const PERSONA = 'p-initie';

/* ── La correspondance ancien rituel → code v6 ──────────────────────
   Établie ligne à ligne et validée. `null` = le rendez-vous porteur est
   ÉCARTÉ de l'import (la Maison le recréera elle-même).
   `#VEKPE` et `#LONGUEUR` sont des règles, pas des codes : voir plus bas. */
const MAP = {
  sinsin: 'ATL·II·E', 'rituel-mpxrsfv3': 'ATL·II·E', 'rituel-mpdkjmvq': 'ATL·II·L',
  'rituel-mp1lproe': 'PLT·05·ESS·C', 'rituel-mpf69yj3': 'PLT·05·SIG·C', 'rituel-mpdgup11': 'PLT·05·PRE·C',
  'rituel-mp2qnjwa': 'PLT·40·M',
  'gbigbi-essentiel': 'ATL·IV·GBE·C', 'gbigbi-profond': 'ATL·IV·GBP·C', alala: 'ATL·IV·ALA·C',
  dandan: 'PLT·10·M', wewe: 'PLT·20·C',
  'rituel-mp2ln2i4': 'KOKO·ORI', 'rituel-mr3szmso': 'KOKO·PRE', 'rituel-mpdjh1fz': 'KOKO·SUI',
  'rituel-mpbpz23b': 'ATL·III·COU·C', 'yekpe-couleur': 'ATL·III·COU·C',
  'rituel-mq6vpu7d': 'ATL·III·COU·C', 'rituel-mq3ln93q': 'ATL·III·COU·M',
  'rituel-mpdj61e5': 'PLT·50·STY·E', 'rituel-mpdj8t99': 'PLT·50·STY·S', 'rituel-mpdjbdm5': 'PLT·50·EVE·C',
  'rituel-mpdjcyh0': 'STU·A·VAN·C', 'rituel-mr6p76kx': 'STU·A·VAN·M', 'rituel-mqkoruz9': 'STU·A·NAT·M',
  'rituel-mpl2rty1': 'PLT·45·STD',        // VÈKPÈ™ Métamorphose = le défaisage
  'rituel-mpl3brcs': 'PLT·50·RET·C·C',    // VÈKPÈ™ Réveil = retouche post-création, offerte
  'rituel-mq6zu12s': 'PLT·55·L', 'rituel-mq6wbusw': 'PLT·55·E',
  'rituel-mpdikoo2': 'DDS·SHP·E',         // ZÀMÈ™ Produits client = droit de service
  'rituel-mpje726f': 'PLT·70·MAN·C',      // NÙTÓ™ Mains = manucure
  'rituel-mpdqjycc': null,                // SÍNSIN™ Ancrage — RDV écarté
  'vekpe-essentiel': '#VEKPE', 'vekpe-prestige': '#VEKPE', 'vekpe-signature': '#VEKPE',
  'rituel-mp78jdyc': '#VEKPE', 'rituel-mpmej91v': '#VEKPE',
  'rituel-mpmeio39': '#LONGUEUR',         // VÈKPÈ™ Mi-Long : supplément à 50 000, création au-delà
};

/* Les créations VÈKPÈ™ se rangent par le NOMBRE DE LOCKS, jamais par leur
   ancienne gamme commerciale : « Courts » couvrait de 100 à 455 locks, soit
   de Jumbo à Nano. Le nom ne disait pas la taille. */
const CALIBRES = [
  [100, 'ATL·I·JUM'], [180, 'ATL·I·MED'], [250, 'ATL·I·MIN'], [400, 'ATL·I·MIC'], [Infinity, 'ATL·I·NAN'],
];
const codeVekpe = (locks) => (CALIBRES.find(([max]) => (locks || 0) <= max) ?? CALIBRES[4])[1];

const svcByCode = new Map(CAT.services.map((s) => [s.code, s]));
const idOfCode = (code) => svcByCode.get(code)?.id;

/* ── Utilitaires ────────────────────────────────────────────────── */
const jour = (v) => (typeof v === 'string' ? v.slice(0, 10) : '');
const heure = (h) => String(h ?? '').replace(/h/i, ':').replace(/^(\d):/, '0$1:').slice(0, 5) || '09:00';
const nb = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const tel = (p) => String(p ?? '').replace(/[^0-9]/g, '').replace(/^0+/, '').slice(-8);
const txt = (s) => String(s ?? '').trim();
const sql = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const lit = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

const STATUT = { completed: 'honoré', confirmed: 'confirmé', cancelled: 'annulé' };

/* ── Les données de l'ancien ERP ────────────────────────────────── */
const users = J('users.json'), pend = J('pendingClients.json');
const ap = J('appointments.json'), ventes = J('ventes.json'), devis = J('devis.json');
const dep = J('depenses.json'), caisse = J('caisseEntries.json');
const subs = J('subscriptions.json'), tpls = J('subscriptionTemplates.json');
const depCfg = J('depenseConfig.json');

const fiches = [...users.map((u) => ({ ...u, compte: true })), ...pend.map((p) => ({ ...p, compte: false }))];
const nomDe = (f) => `${txt(f.firstName)} ${txt(f.lastName)}`.trim() || 'Sans nom';
const fichesById = new Map(fiches.map((f) => [f._id, f]));

/* ── ① Les rendez-vous ÉCARTÉS ──────────────────────────────────── */
const catalogueIds = new Set(Object.keys(MAP));
const ecarte = new Set();
for (const a of ap) {
  for (const s of a.services ?? []) {
    /* Prestation inconnue de la correspondance (forfaits supprimés) ou
       explicitement écartée : le rendez-vous entier sort de l'import. */
    if (!s.rituelId || !catalogueIds.has(s.rituelId) || MAP[s.rituelId] === null) ecarte.add(a._id);
  }
}

/* ── ② Les clientes ─────────────────────────────────────────────── */
const clients = [];
const clientIdOf = new Map(); // id ancien → id Trône (identique : on garde les identifiants)
for (const f of fiches) {
  const notes = Array.isArray(f.internalNotes)
    ? f.internalNotes.map((n) => (typeof n === 'string' ? n : n?.text ?? '')).filter(Boolean).join(' · ')
    : txt(f.internalNotes);
  const c = {
    id: f._id, branchId: BRANCH, name: nomDe(f), phone: txt(f.phone), city: '',
    persona: PERSONA, since: jour(f.createdAt ?? f._createdAt), segments: [],
    priceCoef: 1, loyaltyPoints: 0,
  };
  if (txt(f.email)) c.email = txt(f.email);
  if (nb(f.lockCount)) c.lockCount = nb(f.lockCount);
  if (jour(f.birthday ?? f.dateOfBirth)) c.birthday = jour(f.birthday ?? f.dateOfBirth);
  if (f.diaspora) c.diaspora = true;
  if (notes) c.notes = notes;
  clients.push(c);
  clientIdOf.set(f._id, f._id);
}

/* Les rendez-vous ORPHELINS — leur cliente n'a pas de fiche. On en crée une :
   un rendez-vous sans fiche est invisible au Carnet, au Calendrier et dans
   l'historique. Regroupement sur téléphone + nom : le téléphone seul
   fusionnerait des sœurs, plusieurs familles partagent un numéro. */
const parTelNom = new Map();
for (const f of fiches) {
  const t = tel(f.phone);
  if (t) parTelNom.set(`${t}|${nomDe(f).toLowerCase()}`, f._id);
}
const creees = new Map();
for (const a of ap) {
  if (ecarte.has(a._id)) continue;
  const ref = a.userId ?? a.clientId;
  if (fichesById.has(ref)) continue;
  const t = tel(a.clientPhone), n = txt(a.clientName);
  const existant = t ? parTelNom.get(`${t}|${n.toLowerCase()}`) : undefined;
  if (existant) { clientIdOf.set(a._id, existant); continue; }
  const cle = `${t}|${n.toLowerCase()}`;
  if (!creees.has(cle)) {
    const id = `cl-imp-${creees.size + 1}`;
    creees.set(cle, id);
    clients.push({
      id, branchId: BRANCH, name: n || 'Cliente de passage', phone: txt(a.clientPhone), city: '',
      persona: PERSONA, since: jour(a.dateISO), segments: ['Importée'],
      priceCoef: 1, loyaltyPoints: 0,
      ...(nb(a.lockCount) ? { lockCount: nb(a.lockCount) } : {}),
    });
  }
  clientIdOf.set(a._id, creees.get(cle));
}
const clientDuRdv = (a) => {
  const ref = a.userId ?? a.clientId;
  if (fichesById.has(ref)) return ref;
  const t = tel(a.clientPhone), n = txt(a.clientName).toLowerCase();
  return parTelNom.get(`${t}|${n}`) ?? creees.get(`${t}|${n}`) ?? clientIdOf.get(a._id) ?? '';
};

/* ── ③ Les comptes famille — un même téléphone, des noms différents ── */
const parTel = new Map();
for (const c of clients) {
  const t = tel(c.phone);
  if (!t) continue;
  if (!parTel.has(t)) parTel.set(t, []);
  parTel.get(t).push(c);
}
const families = [];
for (const [t, membres] of parTel) {
  if (membres.length < 2) continue;
  const noms = new Set(membres.map((m) => m.name.toLowerCase()));
  if (noms.size < 2) continue; // même nom = doublon, pas une famille
  const patronyme = membres[0].name.split(' ').slice(-1)[0];
  const id = `fam-${t}`;
  families.push({ id, branchId: BRANCH, name: `Famille ${patronyme}`, payerClientId: membres[0].id });
  for (const m of membres) m.familyId = id;
}

/* ── ④ Les rendez-vous ──────────────────────────────────────────── */
const appts = [];
const inconnus = new Map();
for (const a of ap) {
  if (ecarte.has(a._id)) continue;
  const serviceIds = [];
  for (const s of a.services ?? []) {
    let code = MAP[s.rituelId];
    if (code === '#VEKPE') code = codeVekpe(nb(a.lockCount));
    else if (code === '#LONGUEUR') code = nb(s.priceFixed ?? s.serviceRemise) > 100000 ? codeVekpe(nb(a.lockCount)) : 'SUP·40';
    const id = idOfCode(code);
    if (!id) { inconnus.set(code ?? s.rituelId, (inconnus.get(code ?? s.rituelId) ?? 0) + 1); continue; }
    serviceIds.push(id);
  }
  if (!serviceIds.length) continue;
  const paiements = (a.paymentHistory ?? []).map((p, i) => ({
    id: `pay-${a._id}-${i}`, amountXof: nb(p.amount), date: jour(p.date ?? p.dateISO),
    ...(p.method ? { method: p.method } : {}), ...(p.caisseId ? { cashbox: p.caisseId } : {}),
  })).filter((p) => p.amountXof > 0 && p.date);
  const r = {
    id: a._id, branchId: BRANCH, clientId: clientDuRdv(a), clientName: txt(a.clientName),
    serviceIds, date: jour(a.dateISO), time: heure(a.heure),
    master: txt(a.createdBy) === 'admin' ? '' : txt(a.createdBy),
    status: STATUT[a.status] ?? 'confirmé',
    priceXof: nb(a.prixSeance), // FIGÉ — jamais recalculé
    paidXof: nb(a.amountPaid),
  };
  if (paiements.length) r.payments = paiements;
  if (nb(a.remisePct)) r.discountPct = nb(a.remisePct);
  if (nb(a.remise)) r.discountXof = nb(a.remise);
  if (txt(a.notes) || txt(a.adminNotes)) r.note = [txt(a.notes), txt(a.adminNotes)].filter(Boolean).join(' · ');
  if (a.subscriptionId) { r.subId = a.subscriptionId; r.coveredBySub = true; }
  appts.push(r);
}

/* ── ⑤ Les factures — ventes de produits et devis ───────────────── */
const invoices = [];
for (const v of ventes) {
  const lignes = (v.items ?? []).map((it, i) => ({
    id: `l-${v._id}-${i}`, label: txt(it.name), qty: nb(it.qty) || 1, unitXof: nb(it.prix), discountPct: 0,
  }));
  if (!lignes.length) lignes.push({ id: `l-${v._id}-0`, label: txt(v.notes) || 'Vente', qty: 1, unitXof: nb(v.finalAmount), discountPct: 0 });
  invoices.push({
    id: v._id, branchId: BRANCH, kind: 'facture', number: txt(v.reference) || v._id,
    clientId: clientIdOf.get(v.clientId) ?? txt(v.clientId), clientName: txt(v.clientName),
    date: jour(v.dateISO), lines: lignes,
    globalDiscountPct: nb(v.remisePct), globalDiscountXof: nb(v.remise),
    theme: 'Rose', status: v.paymentStatus === 'paid' ? 'payée' : 'envoyée',
    ...(v.paymentMethod ? { payment: txt(v.paymentMethod) } : {}),
    ...(v.caisseId ? { cashbox: txt(v.caisseId) } : {}),
    ...(v.appointmentId ? { apptId: txt(v.appointmentId) } : {}),
  });
}
for (const d of devis) {
  invoices.push({
    id: d._id, branchId: BRANCH, kind: 'devis', number: txt(d.reference) || d._id,
    clientId: clientIdOf.get(d.clientId) ?? txt(d.clientId), clientName: txt(d.clientName),
    date: jour(d.dateISO),
    lines: (d.lineItems ?? []).map((l, i) => ({
      id: `l-${d._id}-${i}`, label: [txt(l.label), txt(l.sub)].filter(Boolean).join(' · '),
      qty: 1, unitXof: nb(l.amount), discountPct: 0,
    })),
    globalDiscountPct: nb(d.discountPct), globalDiscountXof: nb(d.discount),
    theme: 'Rose', status: d.status === 'accepted' ? 'acceptée' : d.status === 'sent' ? 'envoyée' : 'brouillon',
    ...(txt(d.notes) ? { note: txt(d.notes) } : {}),
  });
}

/* ── ⑥ Les dépenses ─────────────────────────────────────────────── */
const catsDep = new Map();
for (const c of depCfg) for (const it of c.items ?? c.categories ?? []) {
  if (it?.id) catsDep.set(it.id, txt(it.name ?? it.label));
}
const expenses = dep.map((e) => ({
  id: e._id, branchId: BRANCH, label: txt(e.label) || 'Dépense', amountXof: nb(e.amount),
  date: jour(e.dateISO), cashbox: txt(e.caisseId), category: catsDep.get(e.categoryId) ?? txt(e.categoryId) ?? 'Divers',
  ...(e.subcategoryId ? { subcategory: catsDep.get(e.subcategoryId) ?? txt(e.subcategoryId) } : {}),
  ...(txt(e.notes) ? { note: txt(e.notes) } : {}),
}));

/* ── ⑦ La caisse — SEULEMENT les entrées propres ────────────────── */
/* Les 65 entrées dérivées d'un rendez-vous ou d'une vente sont recalculées
   par Le Trône : les importer compterait l'argent deux fois. */
const coffre = caisse
  .filter((e) => !['appointment', 'vente'].includes(e.sourceType))
  .map((e) => ({
    id: e._id, branchId: BRANCH,
    kind: nb(e.amount) >= 0 ? 'depot' : 'virement',
    amountXof: Math.abs(nb(e.amount)), date: jour(e.dateISO),
    ...(txt(e.label) ? { note: txt(e.label) } : {}),
  }))
  .filter((e) => e.amountXof > 0);

/* ── ⑧ Les abonnements — formules et souscriptions ──────────────── */
const plans = tpls.map((t) => ({
  id: t._id, name: txt(t.nom), tag: 'Pack', priceXof: 0, line: txt(t.description).slice(0, 200),
  perks: [], popular: false, mode: 'pack',
  validityDays: t.validityDays ?? null, discountPct: nb(t.discountPct),
  included: (t.credits ?? []).map((c) => ({ serviceId: idOfCode(MAP[c.rituelId]) ?? '', qty: nb(c.qty) })).filter((i) => i.serviceId),
}));
const subscribers = subs.map((s) => ({
  id: s._id, branchId: BRANCH, clientId: clientIdOf.get(s.clientId) ?? txt(s.clientId),
  name: txt(s.clientName), planId: txt(s.templateId), slot: '', nextIso: '',
  since: '', sinceIso: jour(s.assignedDateISO), status: s.status === 'exhausted' ? 'exhausted' : 'active',
  mrrXof: 0, priceXof: nb(s.price), startIso: jour(s.assignedDateISO),
  expiresIso: s.expiresAt ? jour(s.expiresAt) : null,
  payments: (s.payments ?? []).map((p, i) => ({ id: `sp-${s._id}-${i}`, amountXof: nb(p.amount), date: jour(p.dateISO), method: txt(p.method) })),
  ...(txt(s.notes) ? { note: txt(s.notes) } : {}),
}));

/* ── ⑨ Les pourboires ───────────────────────────────────────────── */
const tips = ap.filter((a) => nb(a.pourboire) > 0 && !ecarte.has(a._id)).map((a) => ({
  id: `tip-${a._id}`, branchId: BRANCH, amountXof: nb(a.pourboire), date: jour(a.dateISO),
  master: '', apptId: a._id,
}));

/* ── L'ÉCRITURE ─────────────────────────────────────────────────── */
const bloc = (table, rows, branche = true) => {
  if (!rows.length) return `-- ${table} : rien à écrire\n`;
  const vals = rows.map((r) => `  (${lit(r.id)}, ${branche ? lit(r.branchId ?? BRANCH) : 'null'}, ${sql(r)})`).join(',\n');
  return `insert into public.${table} (id, branch_id, data) values\n${vals}\non conflict (id) do update set branch_id = excluded.branch_id, data = excluded.data;\n`;
};
const doc = (key, val) =>
  `insert into public.documents (key, data) values (${lit(key)}, ${sql(val)}) on conflict (key) do update set data = excluded.data;\n`;

const CALIBRES_DOC = [
  { id: 'cal-jumbo', name: 'Jumbo', maxLocks: 100, coef: 0.8, durCoef: 0.7 },
  { id: 'cal-medium', name: 'Medium', maxLocks: 180, coef: 1, durCoef: 1 },
  { id: 'cal-mini', name: 'Mini', maxLocks: 250, coef: 1.4, durCoef: 1.4 },
  { id: 'cal-micro', name: 'Micro', maxLocks: 400, coef: 1.8, durCoef: 1.9 },
  { id: 'cal-nano', name: 'Nano', maxLocks: 600, coef: 2.2, durCoef: 2.4 },
  { id: 'cal-galaxy', name: 'Galaxy', maxLocks: null, coef: 2.8, durCoef: 2.8 },
];

/* QUATRE FICHIERS, DANS L'ORDRE DES DÉPENDANCES. Un seul fichier de 350 Ko
   dans l'éditeur d'un navigateur est lourd et fragile ; découpé, chaque étape
   se joue et se vérifie séparément. L'ordre n'est pas libre : une prestation
   avant les catégories atterrit dans « À RECLASSER », un rendez-vous avant sa
   cliente pointe dans le vide. */
const PARTS = [
  ['1_socle', 'LE SOCLE — persona, catalogue v6, calibres', [
    '-- ① Le persona d\u2019accueil',
    bloc('personas', [{ id: PERSONA, branchId: null, name: 'Initi\u00e9e', essence: 'Elle franchit le seuil \u2014 la maison l\u2019accueille, l\u2019observe, et attend de la conna\u00eetre.', builtin: true }], false),
    '-- ② Le catalogue v6 — les CATÉGORIES D\u2019ABORD',
    bloc('catalog_categories', CAT.categories, false),
    bloc('catalog_services', CAT.services, false),
    bloc('catalog_products', CAT.products, false),
    '-- ③ Les calibres, du Jumbo au Galaxy',
    doc('mnd_model_bands', CALIBRES_DOC),
  ]],
  ['2_clientes', 'LE CRM — comptes famille puis clientes', [
    bloc('families', families),
    bloc('clients', clients),
  ]],
  ['3_rendezvous', 'LE CARNET — prix FIGÉS, versements DATÉS', [
    bloc('appointments', appts),
  ]],
  ['4_finances', 'LES FINANCES — factures, dépenses, coffre, abonnements, pourboires', [
    bloc('invoices', invoices),
    bloc('expenses', expenses),
    bloc('coffre_movements', coffre),
    bloc('plans', plans, false),
    bloc('subscribers', subscribers),
    bloc('tips', tips),
  ]],
];

const base = resolve(outPath).replace(/\.sql$/, '');
const entier = ['-- ═══ IMPORT MND — ancien ERP → Le Trône ═══', `-- Généré depuis ${D}`, 'begin;'];
const fichiers = [];
PARTS.forEach(([nom, titre, corps], i) => {
  const f = `${base}_${nom}.sql`;
  writeFileSync(f, [
    `-- ═══ IMPORT MND · ÉTAPE ${i + 1}/${PARTS.length} — ${titre} ═══`,
    `-- Généré depuis ${D}`,
    '-- Rejouable : chaque ligne est un upsert sur son identifiant.',
    '-- ⚠ Les étapes se jouent DANS L\u2019ORDRE.',
    'begin;', '', ...corps, '', 'commit;',
  ].join('\n'), 'utf8');
  fichiers.push(f);
  entier.push('', `-- ── ÉTAPE ${i + 1} · ${titre} ──`, ...corps);
});
entier.push('', 'commit;');
writeFileSync(resolve(outPath), entier.join('\n'), 'utf8');

/* ── LE RAPPORT ─────────────────────────────────────────────────── */
const S = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const F = (n) => `${n.toLocaleString('fr-FR')} F`;
console.log('═══ CE QUI SERA ÉCRIT ═══');
console.log(`  catégories        ${CAT.categories.length}`);
console.log(`  prestations       ${CAT.services.length}`);
console.log(`  produits          ${CAT.products.length}`);
console.log(`  comptes famille   ${families.length}`);
console.log(`  clientes          ${clients.length}   (dont ${creees.size} créées depuis un rendez-vous orphelin)`);
console.log(`  rendez-vous       ${appts.length}   —  ${F(S(appts, (a) => a.priceXof))} de prestations`);
console.log(`  versements datés  ${S(appts, (a) => (a.payments ?? []).length)}`);
console.log(`  factures et devis ${invoices.length}`);
console.log(`  dépenses          ${expenses.length}   —  ${F(S(expenses, (e) => e.amountXof))}`);
console.log(`  coffre            ${coffre.length}   —  ${F(S(coffre, (c) => c.amountXof))}`);
console.log(`  formules          ${plans.length} · abonnées ${subscribers.length}`);
console.log(`  pourboires        ${tips.length}   —  ${F(S(tips, (t) => t.amountXof))}`);

console.log('\n═══ RÉCONCILIATION ═══');
const apRetenus = ap.filter((a) => !ecarte.has(a._id));
const lignes = [
  ['prestations', S(apRetenus, (a) => a.prixSeance), S(appts, (a) => a.priceXof)],
  ['encaissé', S(apRetenus, (a) => a.amountPaid), S(appts, (a) => a.paidXof)],
  ['dépenses', S(dep, (e) => e.amount), S(expenses, (e) => e.amountXof)],
  ['pourboires', S(apRetenus, (a) => a.pourboire), S(tips, (t) => t.amountXof)],
];
let bon = true;
for (const [nom, avant, apres] of lignes) {
  const ok = avant === apres;
  if (!ok) bon = false;
  console.log(`  ${ok ? '✔' : '⚠'} ${nom.padEnd(14)} ancien ${F(avant).padStart(16)}   importé ${F(apres).padStart(16)}`);
}
console.log(`\n  rendez-vous écartés : ${ecarte.size} (${F(S(ap.filter((a) => ecarte.has(a._id)), (a) => a.prixSeance))})`);
if (inconnus.size) {
  console.log('\n⚠ CODES v6 INTROUVABLES — ces lignes ont été omises :');
  for (const [c, n] of inconnus) console.log(`   ${c} ×${n}`);
  bon = false;
}
console.log(`\n${bon ? '✔ Import cohérent — le SQL est prêt à relire.' : '⚠ Reprends les points ci-dessus AVANT de jouer le SQL.'}`);
console.log(`→ ${resolve(outPath)}`);
