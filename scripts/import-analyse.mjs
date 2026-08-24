#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   DIAGNOSTIC DE L'ANCIEN ERP — avant d'écrire quoi que ce soit au Trône.

   Rejouable : la base Firestore bouge pendant qu'on la nettoie, et un
   diagnostic périmé fait prendre de mauvaises décisions. On ré-aspire,
   on relance, on compare.

     node scripts/firestore-export.mjs <clé.json> <dossier>
     node scripts/import-analyse.mjs <dossier>

   Ce qu'il établit :
     ① la base clientes (comptes + fiches sans compte) et ses doublons ;
     ② les rendez-vous orphelins, en séparant ceux qui se RATTACHENT à
        une fiche existante de ceux qui exigent une fiche neuve —
        c'est ce tri qui évite de recréer une cliente déjà là ;
     ③ l'étalon de réconciliation : les six totaux qui devront se
        retrouver à l'identique côté Supabase.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'firestore-export');
const J = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : []);

/* Téléphone : on ne garde que les 8 derniers chiffres — indicatif pays,
   espaces et zéros de tête varient d'une saisie à l'autre pour un même abonné. */
const tel = (p) => String(p ?? '').replace(/[^0-9]/g, '').replace(/^0+/, '').slice(-8);
/* Nom : sans accents, sans casse, sans ponctuation — « Ghislaine F. »
   et « Ghislaine Fictive » sont la même personne. */
const nom = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
/* Clé de nom insensible à l'ordre : « Aline B. » = « Boni A. ». */
const nomTrie = (s) => nom(s).split(' ').sort().join(' ');

const users = J('users.json'), pend = J('pendingClients.json');
const ap = J('appointments.json'), ventes = J('ventes.json'), devis = J('devis.json');
const dep = J('depenses.json'), caisse = J('caisseEntries.json');

const fiches = [...users.map((u) => ({ ...u, src: 'compte' })), ...pend.map((p) => ({ ...p, src: 'sans compte' }))];
const ids = new Set(fiches.map((f) => f._id));
const nomDe = (f) => `${f.firstName ?? ''} ${f.lastName ?? ''}`.trim();

console.log('═══ ① BASE CLIENTES ═══');
console.log(`comptes ${users.length} · fiches sans compte ${pend.length} · total ${fiches.length}`);

const parTel = new Map();
for (const f of fiches) {
  const t = tel(f.phone);
  if (!t) continue;
  if (!parTel.has(t)) parTel.set(t, []);
  parTel.get(t).push(f);
}
const partages = [...parTel.entries()].filter(([, v]) => v.length > 1);
const doublons = partages.filter(([, v]) => new Set(v.map((f) => nomTrie(nomDe(f)))).size === 1);
const familles = partages.filter(([, v]) => new Set(v.map((f) => nomTrie(nomDe(f)))).size > 1);
console.log(`numéros partagés ${partages.length} → doublons ${doublons.length} · familles ${familles.length}`);
for (const [t, v] of doublons) console.log(`  ⚠ DOUBLON ...${t} : ${v.map((f) => `${nomDe(f)} (${f.src})`).join('  |  ')}`);
for (const [t, v] of familles) console.log(`  · famille ...${t} : ${v.map((f) => nomDe(f)).join(' · ')}`);

console.log('\n═══ ② RENDEZ-VOUS ORPHELINS ═══');
/* Index de rattachement : téléphone+nom, avec la clé de nom insensible à l'ordre. */
const parTelNom = new Map();
for (const f of fiches) {
  const t = tel(f.phone);
  if (t) parTelNom.set(`${t}|${nomTrie(nomDe(f))}`, f);
}
const rattaches = new Map(), variantes = new Map(), aCreer = new Map();
for (const a of ap) {
  const ref = a.userId ?? a.clientId;
  if (ids.has(ref)) continue;
  const t = tel(a.clientPhone), n = nomTrie(a.clientName);
  const exact = t ? parTelNom.get(`${t}|${n}`) : undefined;
  if (exact) {
    const k = `${a.clientName} → ${nomDe(exact)} (${exact.src})`;
    rattaches.set(k, (rattaches.get(k) ?? 0) + 1);
  } else if (t && parTel.has(t)) {
    const k = `${a.clientName} ≈ ${parTel.get(t).map(nomDe).join(' / ')}`;
    variantes.set(k, (variantes.get(k) ?? 0) + 1);
  } else {
    const k = `${t}|${n}`;
    if (!aCreer.has(k)) aCreer.set(k, { nom: a.clientName, tel: a.clientPhone, locks: a.lockCount, rdv: 0, ca: 0 });
    const o = aCreer.get(k);
    o.rdv++; o.ca += Number(a.prixSeance) || 0;
    if (!o.locks && a.lockCount) o.locks = a.lockCount;
  }
}
const nbRatt = [...rattaches.values()].reduce((s, n) => s + n, 0);
const nbVar = [...variantes.values()].reduce((s, n) => s + n, 0);
const nbNeuf = [...aCreer.values()].reduce((s, o) => s + o.rdv, 0);
console.log(`orphelins ${nbRatt + nbVar + nbNeuf} → rattachables ${nbRatt} · variantes d'orthographe ${nbVar} · réellement neufs ${nbNeuf}`);
console.log(`fiches à créer : ${aCreer.size}`);
if (rattaches.size) { console.log('  rattachements exacts (tél + nom) :'); for (const [k, n] of rattaches) console.log(`    ${k} ×${n}`); }
if (variantes.size) { console.log('  ⚠ même téléphone, orthographe différente — à arbitrer :'); for (const [k, n] of variantes) console.log(`    ${k} ×${n}`); }
const sansTel = [...aCreer.values()].filter((o) => !tel(o.tel));
if (sansTel.length) console.log(`  ⚠ sans téléphone (${sansTel.length}) : ${sansTel.map((o) => `${o.nom} ×${o.rdv}`).join(' · ')}`);
console.log(`  → base finale : ${fiches.length} + ${aCreer.size} = ${fiches.length + aCreer.size} fiches`);

console.log('\n═══ ③ ÉTALON DE RÉCONCILIATION ═══');
const S = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const F = (n) => `${n.toLocaleString('fr-FR')} F`.padStart(16);
console.log('prestations (prixSeance) ' + F(S(ap, (a) => a.prixSeance)));
console.log('encaissé (amountPaid)    ' + F(S(ap, (a) => a.amountPaid)));
console.log('reste dû                 ' + F(S(ap, (a) => a.prixSeance) - S(ap, (a) => a.amountPaid)));
console.log('pourboires               ' + F(S(ap, (a) => a.pourboire)));
console.log('ventes produits          ' + F(S(ventes, (v) => v.finalAmount)));
console.log('devis                    ' + F(S(devis, (d) => d.finalAmount)));
console.log('dépenses                 ' + F(S(dep, (d) => d.amount)));
const st = {}; ap.forEach((a) => { st[a.status ?? '?'] = (st[a.status ?? '?'] ?? 0) + 1; });
const ps = {}; ap.forEach((a) => { ps[a.paymentStatus ?? '?'] = (ps[a.paymentStatus ?? '?'] ?? 0) + 1; });
console.log(`rendez-vous ${ap.length} :`, st, '\npaiements :', ps);
/* Entrées de caisse : celles qui DÉRIVENT d'un RDV ou d'une vente sont
   recalculées par Le Trône — les importer compterait l'argent deux fois. */
const derive = caisse.filter((e) => ['appointment', 'vente'].includes(e.sourceType));
console.log(`caisse ${caisse.length} entrées → ${derive.length} dérivées (NON importées, ${S(derive, (e) => e.amount).toLocaleString('fr-FR')} F) · ${caisse.length - derive.length} propres`);
