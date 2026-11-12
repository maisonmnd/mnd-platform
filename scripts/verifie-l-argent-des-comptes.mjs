import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

/* L'ARGENT DES COMPTES, ÉPROUVÉ · 12 novembre 2026 (maquette DnRyTv95…, choix ⑥).
   La règle vit dans src/shared/argent-des-comptes-pur.ts ; elle est pure. Le
   banc lit aussi la carte de Finances › Les caisses et le correctif
   d'Encaisser (la caisse de « Payer par MTN »).
   `--prouve` : chaque faute est remise une à une dans le vrai fichier (copie
   gardée, restauration dans un finally, empreintes comparées), et le banc
   doit crier à chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PUR = 'src/shared/argent-des-comptes-pur.ts';
const CARTE = 'src/apps/trone/routes/finances/ArgentDesComptes.tsx';
const CAISSES = 'src/apps/trone/routes/finances/Caisses.tsx';
const ACTIONS = 'src/apps/trone/routes/clients/actions.tsx';
const PANNES = [
  ['un bulletin paye se garde encore', PUR, '    if (b.paye || net <= 0) continue;', '    if (net <= 0) continue;'],
  ['un bulletin sans numero ne se garde pas', PUR, '  const paieMtn = paie ? paie.mtnXof + paie.sansVoieXof : 0;', '  const paieMtn = paie ? paie.mtnXof : 0;'],
  ['le solde du compte de paie oublie', PUR, '  const besoinMtn = paie ? Math.max(0, paieMtn - Math.max(0, Math.round(o.soldePaieMtnXof ?? 0))) : 0;', '  const besoinMtn = paie ? paieMtn : 0;'],
  ['la collecte garde plus que son solde', PUR, '  const versLaPaieMtnXof = Math.min(sCollecte, besoinMtn);', '  const versLaPaieMtnXof = besoinMtn;'],
  ['le manque n est plus dit', PUR, '  const manquePaieMtnXof = Math.max(0, besoinMtn - versLaPaieMtnXof);', '  const manquePaieMtnXof = 0;'],
  ['la paie Moov gardee sur FedaPay qui ne verse pas', PUR, '  const moovGarde = paie && o.moovParFedaPay ? Math.min(sFeda, paie.moovXof) : 0;', '  const moovGarde = paie ? Math.min(sFeda, paie.moovXof) : 0;'],
  ['MoMoPay part sans etre pointe', PUR, "compte: 'momopay', soldeXof: sMomo, garderXof: sMomo, versBanqueXof: 0,", "compte: 'momopay', soldeXof: sMomo, garderXof: 0, versBanqueXof: sMomo,"],
  ['le virement permis sans la paie', PUR, '  const peutVirer = !!paie && versLaBanqueXof > 0;', '  const peutVirer = versLaBanqueXof > 0;'],
  ['un solde negatif retire de l argent', PUR, '  const solde = (c: CompteDuPrestataire) => Math.max(0, Math.round(Number(o.caisses[c]?.soldeXof) || 0));', '  const solde = (c: CompteDuPrestataire) => Math.round(Number(o.caisses[c]?.soldeXof) || 0);'],
  ['le lundi se trompe de semaine', PUR, '  const decale = j === 1 ? 0 : (8 - j) % 7;', '  const decale = (8 - j) % 7 || 7;'],
  ['janvier oublie decembre', PUR, '  const avant = m === 1 ? `${a - 1}-12` :', '  const avant = m === 1 ? `${a}-12` :'],
  ['un virement a zero inscrit', PUR, '  return a.lignes.filter((l) => l.caisse && l.versBanqueXof > 0).map((l) => ({', '  return a.lignes.filter((l) => l.caisse).map((l) => ({'],
  ['l identifiant du virement change a chaque fois', PUR, '`trf-lundi-${branchId}-${jour}-${compte}`;', '`trf-lundi-${branchId}-${jour}-${compte}-${Math.random()}`;'],
  ['la carte montree a toute l equipe', CARTE, '  if (!direction) return null;\n', ''],
  ['la paie lue par le gerant', CARTE, '    if (!souverain) return null;\n', ''],
  ['un virement inscrit deux fois', CARTE, '...v.filter((x) => !prev.some((t) => t.id === x.id))', '...v'],
  ['le virement vers une caisse de prestataire', CARTE, '    ...Object.values(lesCaisses).map((c) => c?.id),\n', ''],
  ['la carte quitte Les caisses', CAISSES, '      <ArgentDesComptes />', ''],
  ['Payer par MTN dit MoMoPay', ACTIONS, "    if (pt.tuile === 'mtn') {", '    if (false) {'],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout, propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((x) => x[1]))];
  const gardes = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const avant = new Map(fichiers.map((f) => [f, md5(f)]));
  let muettes = 0;
  let absentes = 0;
  try {
    for (const [nom, f, a, b] of PANNES) {
      const brut = gardes.get(f).toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`ABSENTE  ${nom} (le texte a remettre n est plus dans ${f})`); absentes++; continue; }
      const neuf = texte.replace(a, b);
      writeFileSync(path.join(racine, f), crlf ? neuf.replace(/\n/g, '\r\n') : neuf);
      const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
      writeFileSync(path.join(racine, f), gardes.get(f));
      if (r.status === 0) { console.log(`MUETTE   ${nom}`); muettes++; } else console.log(`CRIEE    ${nom}`);
    }
  } finally {
    for (const [f, b] of gardes) writeFileSync(path.join(racine, f), b);
  }
  const intacts = fichiers.every((f) => md5(f) === avant.get(f));
  console.log(`\n${PANNES.length - muettes - absentes}/${PANNES.length} fautes criees${intacts ? ', fichiers rendus intacts' : ', FICHIERS ALTERES'}.`);
  process.exit(muettes || absentes || !intacts ? 1 : 0);
}

const dossier = path.join(racine, 'node_modules/.cache', `verifie-l-argent-des-comptes-${process.pid}`);
const sortie = path.join(dossier, 'harnais.mjs');
mkdirSync(dossier, { recursive: true });
try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-l-argent-des-comptes.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    loader: { '.css': 'empty' },
  });
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
