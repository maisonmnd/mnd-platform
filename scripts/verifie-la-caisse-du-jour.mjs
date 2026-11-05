import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA CAISSE DU JOUR, EPROUVEE - 5 novembre 2026 (sur le modele de verifie-la-caisse-au-jour-le-jour).
   `node scripts/verifie-la-caisse-du-jour.mjs` : le banc, dans un processus
   fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-caisse-du-jour');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-caisse-du-jour.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/caisse-du-jour-pur.ts';
const ECRAN = 'src/apps/trone/routes/finances/JournalDeCaisse.tsx';
const FINANCE = 'src/shared/finance.ts';
const PANNES = [
  ['le disponible oublie les pourboires', PUR, 'disponibleXof: matinXof + versementsXof + pourboiresXof + autresEntreesXof - sortiesXof,', 'disponibleXof: matinXof + versementsXof + autresEntreesXof - sortiesXof,'],
  ['le disponible oublie les sorties', PUR, 'disponibleXof: matinXof + versementsXof + pourboiresXof + autresEntreesXof - sortiesXof,', 'disponibleXof: matinXof + versementsXof + pourboiresXof + autresEntreesXof,'],
  ['les transferts recus disparaissent', PUR, "const autresEntrees = moves.filter((m) => !m.invoiceId && m.delta > 0);", "const autresEntrees = moves.filter((m) => false && m.delta > 0);"],
  ['une depense du jour en attente ne sort pas', PUR, "    ...attenteDuJour.map((e) => ({ date: e.date, delta: -e.xof, label: e.label, sub: 'En attente de validation', expenseId: e.id, enAttente: true as const })),\n", ''],
  ['le matin ignore le compte de la veille', PUR, 'livreMatinXof - attenteAvant, derniere: o.derniere })', 'livreMatinXof - attenteAvant, derniere: undefined })'],
  ['le matin ignore les depenses en attente d avant', PUR, 'livreMatinXof - attenteAvant, derniere: o.derniere })', 'livreMatinXof, derniere: o.derniere })'],
  ['le matin perd les pourboires gardes', PUR, 'derniere: o.derniere }) + pourboiresDuMatinXof;', 'derniere: o.derniere });'],
  ['le matin recompte les pourboires d avant la cloture', PUR, 'o.derniere?.date && o.derniere.date > suivi ? o.derniere.date : suivi;', 'suivi;'],
  ['les pourboires d avant le suivi reviennent', PUR, 'p.jour > gardesDepuis && p.jour < jour', 'p.jour < jour'],
  ['la remise a 0 F n emporte pas les pourboires', PUR, 'const suivi = o.suiviDepuis && o.suiviDepuis > SUIVI_DES_POURBOIRES_DEPUIS ? o.suiviDepuis : SUIVI_DES_POURBOIRES_DEPUIS;', 'const suivi = SUIVI_DES_POURBOIRES_DEPUIS;'],
  ['une remise ne baisse pas ce qui reste a remettre', PUR, 'aRemettreXof: Math.max(0, recus - remis),', 'aRemettreXof: Math.max(0, recus),'],
  ['une remise plus grande que les pourboires passe', PUR, '  if (o.xof > o.aRemettreXof) return', '  if (false) return'],
  ['une remise glissee avant une cloture', PUR, 'if (o.derniereClotureLe && o.jour < o.derniereClotureLe) return', 'if (false) return'],
  ['la remise s ecrit a regulariser', PUR, "sens: 'sortie', motif: MOTIF_POURBOIRES_REMIS,", "sens: 'sortie', motif: 'À régulariser' as typeof MOTIF_POURBOIRES_REMIS,"],
  ['les remises d un autre tiroir comptent', PUR, 'm.branchId === branchId && m.cashbox === cashbox && m.sens === \'sortie\' && m.motif === MOTIF_POURBOIRES_REMIS', 'm.branchId === branchId && m.sens === \'sortie\' && m.motif === MOTIF_POURBOIRES_REMIS'],
  ['la remise ouverte a toute l equipe', ECRAN, '=> estDirection && !l.vue.verrouillee', '=> !l.vue.verrouillee'],
  ['le motif de la remise absent du modele', FINANCE, "  'Pourboires remis à l’équipe',\n", ''],
  ['le livre de la cloture garde les attentes', PUR, 'livreAClotureXof: livreSoirXof - attenteAvant - somme(attenteDuJour.map((e) => e.xof)),', 'livreAClotureXof: livreSoirXof,'],
  ['les totaux somment les decochees', PUR, '    if (!cochees.has(l.caisse.nom)) continue;\n', ''],
  ['le compte somme les caisses non comptees', PUR, '    if (l.compteXof !== null) {\n      t.comptees += 1;', '    if (true) {\n      t.comptees += 1;'],
  ['le pourboire arrive avec le dernier versement', PUR, 'const jour = vs.map(leJour).sort()[0];', 'const jour = vs.map(leJour).sort().at(-1)!;'],
  ['le pourboire va au premier versement', PUR, 'const porteur = ceJour.find((p) => estEnEspeces(p.method)) ?? ceJour[0];', 'const porteur = ceJour[0];'],
  ['le pourboire en devise compte deux fois', PUR, '    if (!(xof > 0) || i.fx) continue;', '    if (!(xof > 0)) continue;'],
  ['l avoir apporte un pourboire', PUR, "invoiceReglements(i).filter((p) => p.method !== 'Avoir' && p.method !== 'Acompte' && p.amountXof > 0);", "invoiceReglements(i).filter((p) => p.amountXof > 0);"],
  ['le comptoir oublie MoMoPay', PUR, "  ajoute(laCaisseDuPaiement(ici, branchId, 'momo'));\n", ''],
  ['le comptoir prend une caisse rangee', PUR, 'const ici = boxes.filter((b) => b.branchId === branchId && !b.archiveeLe);', 'const ici = boxes.filter((b) => b.branchId === branchId);'],
  ['la banque cochee au depart', PUR, 'duComptoir && (c.bouge || c.matinXof !== 0 || c.disponibleXof !== 0);', '(c.bouge || c.matinXof !== 0 || c.disponibleXof !== 0);'],
  ['une caisse vide cochee au depart', PUR, 'duComptoir && (c.bouge || c.matinXof !== 0 || c.disponibleXof !== 0);', 'duComptoir;'],
  ['la cloture reprise reste close', PUR, 'if (duJour && !aRefaire(duJour)) return', 'if (duJour) return'],
  ['un jour d avant se recloture', PUR, "  if (pourquoi) return { etat: 'bloquee', pourquoi };\n", ''],
  ['une caisse close se recompte a la saisie', PUR, "  if (etat.etat === 'close') return { compteXof: etat.cloture.compteXof, ecartXof: etat.cloture.ecartXof };\n", ''],
  ['le bouton ignore la journee ouverte', PUR, '  if (!o.journeeClose) return', '  if (false) return'],
  ['le bouton s allume sans tout compter', PUR, 'const aCompter = ouvertes.filter((c) => c.compteXof === null || c.compteXof < 0);', 'const aCompter = ouvertes.filter((c) => c.compteXof !== null && c.compteXof < 0);'],
  ['un ecart passe sans motif', PUR, "const sansMotif = ouvertes.filter((c) => (c.ecartXof ?? 0) !== 0 && !c.motif.trim());", "const sansMotif = ouvertes.filter((c) => (c.ecartXof ?? 0) !== 0 && !c.motif);"],
  ['la cloture attend le livre sans pourboires', PUR, 'attenduXof: c.caisse.disponibleXof, compteXof: c.compteXof,', 'attenduXof: c.caisse.livreSoirXof, compteXof: c.compteXof,'],
  ['une caisse close se recloture en double', PUR, "    if (c.etat.etat !== 'ouverte' || c.compteXof === null) continue;", '    if (c.compteXof === null) continue;'],
  ['la cloture oublie la reprise', PUR, "      ...(c.etat.reprend ? { reprend: c.etat.reprend } : {}),\n    }));", '    }));'],
  ['un montant illisible se lit', PUR, "if (!t || !/^\\d+(\\.\\d+)?$/.test(t)) return null;", 'if (!t) return null;'],
  ['l ecran lit le livre du mois', ECRAN, 'boxMoves(box.name, { de: jour, a: jour })', "boxMoves(box.name, { de: `${jour.slice(0, 7)}-01`, a: jour })"],
  ['l ecran oublie la mesure des vieilles clotures', ECRAN, 'livreXof: livreDeLaCloture(brute, horsActiviteJusquAu(box.name, brute.date))', 'livreXof: brute.livreXof'],
  ['l ecran oublie la journee close', ECRAN, 'journeeClose={clotureOuverteAuxGestes}', 'journeeClose={true}'],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); console.log(propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((p) => p[1]))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, fichier, a, b] of PANNES) {
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, fichier), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = await lanceLeBanc();
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, fichier), gardes[fichier]);
      }
    }
  } finally {
    for (const f of fichiers) writeFileSync(path.join(racine, f), gardes[f]);
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exitCode = muettes === 0 && intacts ? 0 : 1;
}
