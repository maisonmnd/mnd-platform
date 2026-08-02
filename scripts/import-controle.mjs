#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   CONTRÔLE DE PROPRETÉ DE L'ANCIEN ERP — la liste des corrections.

   Rejouable après chaque passe de nettoyage dans Firebase :
     node scripts/firestore-export.mjs <clé.json> <dossier>
     node scripts/import-controle.mjs <dossier>

   Ne signale QUE ce qu'un humain doit trancher. Tout ce qui se répare
   au mapping (renommages, rattachements) est délibérément absent :
   l'y faire figurer ferait corriger deux fois la même chose.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'firestore-export');
/* Jour de référence : passé en 2e argument, sinon aucun contrôle de futur
   (Date.now() rendrait le rapport non reproductible d'un jour à l'autre). */
const AUJ = process.argv[3] ?? '2026-08-02';
const J = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : []);

const ap = J('appointments.json');
const at = J('services.json');
const users = J('users.json'), pend = J('pendingClients.json');

const rit = new Map();
for (const a of at) for (const r of a.rituels ?? []) rit.set(r.id, { nom: (r.nom ?? '').trim(), rate: r.ratePerLock, type: r.pricingType });
const compo = (a) => (a.services ?? []).map((s) => (s.rituelNom ?? '?').trim()).join(' + ');
const ref = (a) => a.reference ?? 'SANS RÉFÉRENCE';
const F = (n) => `${Number(n ?? 0).toLocaleString('fr-FR')} F`;

let total = 0;
const bloc = (titre, lignes) => {
  total += lignes.length;
  console.log(`\n${lignes.length ? '⚠' : '✔'} ${titre} — ${lignes.length}`);
  lignes.forEach((l) => console.log(`   ${l}`));
};

/* ① Doublons : même cliente, même jour, même composition. */
const vus = new Map();
for (const a of ap) {
  const k = `${a.clientName ?? ''}|${a.dateISO}|${compo(a)}`;
  if (!vus.has(k)) vus.set(k, []);
  vus.get(k).push(a);
}
bloc('RENDEZ-VOUS EN DOUBLE (même cliente, même jour, même composition)',
  [...vus.values()].filter((l) => l.length > 1).map((l) =>
    `${l[0].dateISO}  ${l[0].clientName}  « ${compo(l[0])} »  ×${l.length}\n${
      l.map((a) => `        ${ref(a).padEnd(21)}${F(a.prixSeance).padStart(12)}  payé ${F(a.amountPaid).padStart(12)}  ${a.paymentStatus ?? '?'}  créé ${(a._createdAt ?? '').slice(0, 16)}`).join('\n')}`));

/* « VÈKPÈ™ Réveil » n'est PAS une création : c'est la retouche post-création,
   offerte, donc légitimement à 0 F et sans calibre à renseigner. Sans cette
   exception, les contrôles ② et ⑦ la signalent deux fois chacun à tort. */
const estRetouche = (s) => /^VÈKPÈ.*Réveil/i.test((s.rituelNom ?? '').trim());
const estCreation = (s) => /^VÈKPÈ/.test((s.rituelNom ?? '').trim()) && !estRetouche(s);

/* ② Créations VÈKPÈ sans calibre — le calibre commande tous les prix futurs. */
bloc('CRÉATIONS VÈKPÈ SANS NOMBRE DE LOCKS',
  ap.filter((a) => !a.lockCount && (a.services ?? []).some(estCreation))
    .map((a) => `${a.dateISO}  ${ref(a).padEnd(21)}${(a.clientName ?? '?').padEnd(24)}${F(a.prixSeance).padStart(12)}  ${compo(a)}`));

/* ③ Prestations citées par un rendez-vous mais absentes du catalogue. */
const manquants = new Map();
for (const a of ap) for (const s of a.services ?? []) {
  if (s.rituelId && !rit.has(s.rituelId)) {
    const k = `${s.rituelId} — ${(s.rituelNom ?? '?').trim()}`;
    manquants.set(k, (manquants.get(k) ?? 0) + 1);
  }
}
bloc('PRESTATIONS CITÉES MAIS ABSENTES DU CATALOGUE', [...manquants].map(([k, n]) => `${k}  ×${n}`));

/* ④ Deux fiches pour un même nom : l'historique et le chiffre se coupent en deux. */
const parNom = new Map();
for (const [id, r] of rit) {
  const k = r.nom.toLowerCase();
  if (!parNom.has(k)) parNom.set(k, []);
  parNom.get(k).push(`${id} (${r.rate ? `${r.rate} F/lock` : 'prix ferme'})`);
}
bloc('PRESTATIONS EN DOUBLE AU CATALOGUE',
  [...parNom].filter(([, ids]) => ids.length > 1).map(([nom, ids]) => `« ${nom} » → ${ids.join('  ET  ')}`));

/* ⑤ Référence recopiée d'un ancien rendez-vous.
   La référence porte normalement le jour du rendez-vous (369 fois sur 379). Un
   écart seul ne prouve rien : un rendez-vous DÉPLACÉ garde son ancienne
   référence, et c'est sans conséquence — la date fait foi, la référence n'est
   qu'une étiquette. Ce qui accuse, c'est la fiche CRÉÉE le jour même de son
   rendez-vous mais portant une référence vieille de plus d'un mois : elle a été
   recopiée depuis une autre, et la copie peut cacher un doublon que le contrôle
   ① ne voit pas si la composition a été retouchée depuis. */
const jours = (a, b) => Math.abs(new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000;
bloc('RÉFÉRENCE RECOPIÉE D\'UN AUTRE RENDEZ-VOUS',
  ap.filter((a) => {
    const m = (a.reference ?? '').match(/MND-(\d{4})(\d{2})(\d{2})/);
    if (!m || !a.dateISO) return false;
    const refDate = `${m[1]}-${m[2]}-${m[3]}`;
    if (refDate === a.dateISO) return false;
    const cree = (a.createdAt ?? a._createdAt ?? '').slice(0, 10);
    return cree === a.dateISO && jours(refDate, a.dateISO) > 30;
  }).map((a) => `${a.reference}  →  daté ${a.dateISO}, créé le même jour  ${(a.clientName ?? '?').padEnd(24)}${F(a.prixSeance)}`));

/* ⑥ « Honoré » alors que le jour n'est pas venu. */
bloc('« HONORÉ » MAIS DATÉ DANS LE FUTUR',
  ap.filter((a) => a.status === 'completed' && a.dateISO > AUJ)
    .map((a) => `${a.dateISO}  ${ref(a).padEnd(21)}${(a.clientName ?? '?').padEnd(24)}${F(a.prixSeance)}`));

/* ⑦ Réalisé et facturé zéro, hors abonnement. */
bloc('HONORÉS À 0 F HORS ABONNEMENT',
  ap.filter((a) => !a.prixSeance && a.status === 'completed' && !a.subscriptionId
    && !(a.services ?? []).every(estRetouche)) // retouche offerte : 0 F est normal
    .map((a) => `${a.dateISO}  ${ref(a).padEnd(21)}${(a.clientName ?? '?').padEnd(24)}${compo(a)}`));

/* ⑧ Encaissé au-delà du dû (pourboire non saisi, ou erreur). */
bloc('ENCAISSÉ SUPÉRIEUR AU DÛ',
  ap.filter((a) => Number(a.amountPaid ?? 0) > Number(a.prixSeance ?? 0) + Number(a.pourboire ?? 0))
    .map((a) => `${a.dateISO}  ${ref(a).padEnd(21)}${(a.clientName ?? '?').padEnd(24)}dû ${F(a.prixSeance)} · payé ${F(a.amountPaid)}`));

bloc('SANS STATUT DE PAIEMENT',
  ap.filter((a) => !a.paymentStatus).map((a) => `${a.dateISO}  ${ref(a).padEnd(21)}${(a.clientName ?? '?').padEnd(24)}${compo(a) || '(aucune prestation)'}`));

/* Contexte — pas des corrections, mais les nombres qui bougent. */
const fiches = [...users, ...pend];
const sansCalibre = fiches.filter((c) => !c.lockCount && c.hasLocks !== false).length;
const S = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
console.log(`\n─── contexte ───`);
console.log(`fiches ${fiches.length} · sans calibre ${sansCalibre} (se remplissent au KÒKÒ™, pas une correction)`);
console.log(`rendez-vous ${ap.length} · prestations ${F(S(ap, (a) => a.prixSeance))} · encaissé ${F(S(ap, (a) => a.amountPaid))}`);
console.log(`\n${total === 0 ? '✔✔ BASE PROPRE — rien à trancher' : `RESTE ${total} POINT(S) À TRANCHER`}`);
