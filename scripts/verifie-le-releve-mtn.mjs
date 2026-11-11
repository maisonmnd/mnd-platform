import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE RELEVE DES COMPTES MTN, EPROUVE - 12 novembre 2026.
   `node scripts/verifie-le-releve-mtn.mjs` : le banc, dans un processus fils
   (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PUR = 'src/shared/releve-mtn-pur.ts';
const VUE = 'src/apps/trone/routes/finances/ReleveMtn.tsx';
const PAGE = 'src/apps/trone/routes/finances/MtnMoMo.tsx';
const COL = 'src/apps/trone/routes/finances/CompteDeCollecteMtn.tsx';
const FN = 'supabase/functions/paie-mtn/index.ts';
const PANNES = [
  ['le jour de Cotonou devient celui de UTC', PUR, 'export const jourACotonou = (ms: number): string => {\n  const d = new Date(ms + HEURE_MS);', 'export const jourACotonou = (ms: number): string => {\n  const d = new Date(ms);'],
  ['le mois dernier finit le 30', PUR, '-${p2(new Date(Date.UTC(pa, pm, 0)).getUTCDate())}`;', '-30`;'],
  ['janvier n a pas de mois dernier', PUR, '      const [pa, pm] = m === 1 ? [a - 1, 12] : [a, m - 1];', '      const [pa, pm] = [a, m - 1];'],
  ['une periode libre a l envers passe', PUR, '      if (du > au) return null;\n', ''],
  ['le dernier jour est exclu', PUR, 'jusquAMs: debutDuJour(au) + JOUR_MS };', 'jusquAMs: debutDuJour(au) };'],
  ['un refus compte dans le total', PUR, "  const recus = dedans.filter((x) => x.etat === 'recu');", '  const recus = dedans;'],
  ['un annule entre dans le releve', PUR, " && x.etat !== 'annule';", ';'],
  ['les frais de la collecte s oublient', PUR, '  const fraisXof = recus.reduce((s, x) => s + x.fraisXof, 0);', '  const fraisXof = 0;'],
  ['le decaissement prend des frais', PUR, '    fraisXof: 0,\n    etat: etatDeLEnvoi(e.etat),', '    fraisXof: Math.round(entier(e.montant_xof) / 100),\n    etat: etatDeLEnvoi(e.etat),'],
  ['le mouvement se date a la demande', PUR, '    quand: e.repondu_le ?? e.envoye_le ?? e.programme_le,', '    quand: e.programme_le,'],
  ['le numero sort en clair du CSV', PUR, "x.transaction ?? '', x.reference, masque(x.msisdn)]);", "x.transaction ?? '', x.reference, String(x.msisdn ?? '')]);"],
  ['le releve ne lit qu une page', VUE, '    if (!data || data.length < PAGE) break;', '    break;'],
  ['le decaissement sans releve', PAGE, '      <ReleveMtn compte="decaissement" />\n', ''],
  ['la collecte sans releve', COL, '      <ReleveMtn compte="collecte" />\n', ''],
  ['le numero de decaissement ne s affiche plus', PAGE, "{numero ?? 'numéro à poser'}", "{'numéro à poser'}"],
  ['un montant avec espaces se coupe en deux', PUR, "  if (/^[\\d\\s.]+$/.test(t)) return [t.replace(/[\\s.]/g, '')];\n", ''],
  ['la recherche tient aux accents', PUR, "const sansAccent = (s: string): string => s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();", "const sansAccent = (s: string): string => s.toLowerCase();"],
  ['un bout de numero ne se retrouve plus', PUR, '  const nombres = [chiffres(x.msisdn), String(x.montantXof), chiffres(x.transaction), chiffres(x.reference)];', '  const nombres = [String(x.montantXof)];'],
  ['un annule se retrouve', PUR, "  return mouvements.filter((x) => x.etat !== 'annule' && mouvementTrouve(x, mots))", '  return mouvements.filter((x) => mouvementTrouve(x, mots))'],
  ['la page perd sa recherche', PAGE, '            <RechercheMtn />\n', ''],
  ['le mode de couleur ne se garde plus', PAGE, '    try { localStorage.setItem(CLE_DU_MODE, m); }', '    try { void m; }'],
  ['paie-mtn ne rend plus le numero', FN, ', numeros: sortie, numero: numeroDuCompte() });', ', numeros: sortie });'],
  ['le numero se montre a tous (GET)', FN, 'numero: !!numeroDuCompte() },', 'numero: numeroDuCompte() },'],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-le-releve-mtn');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-releve-mtn.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout, propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((x) => x[1]))];
  const gardes = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const avant = new Map(fichiers.map((f) => [f, md5(f)]));
  let muettes = 0;
  try {
    for (const [nom, f, a, b] of PANNES) {
      const garde = gardes.get(f);
      const brut = garde.toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, f), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, f), garde);
      }
    }
  } finally {
    for (const [f, g] of gardes) writeFileSync(path.join(racine, f), g);
  }
  const intacts = fichiers.every((f) => md5(f) === avant.get(f));
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exit(muettes === 0 && intacts ? 0 : 1);
}

const r = await lanceLeBanc();
process.stdout.write(r.stdout ?? '');
if (r.stderr) process.stdout.write(r.stderr);
process.exit(r.status ?? 1);
