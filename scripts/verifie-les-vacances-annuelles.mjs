import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES VACANCES ANNUELLES, EPROUVEES - 6 novembre 2026 (maquette 1Jc1m2bUp8rovJ5tmejBAo).
   `node scripts/verifie-les-vacances-annuelles.mjs` : le banc, dans un
   processus fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PUR = 'src/shared/vacances-pur.ts';
const PAIE = 'src/apps/trone/routes/equipe/payroll.ts';
const TEMPS = 'src/apps/trone/routes/equipe/TempsAbsences.tsx';
const VAC = 'src/apps/trone/routes/equipe/rh/VacancesAnnuelles.tsx';
const COFFRE = 'src/shared/engagements-coffre.ts';
const PANNES = [
  ['les jours ouvres au lieu des calendaires', PUR, '  return Math.round((enUtc(au) - enUtc(du)) / 86_400_000) + 1;', '  return Math.round((enUtc(au) - enUtc(du)) / 86_400_000);'],
  ['la reprise le lendemain, meme ferme', PUR, '  for (let n = 0; n < 120 && ouvertureDuJour(d, semaine, exceptions).closed; n += 1) d = ajouteJours(d, 1);', ''],
  ['une demande compte au solde', PUR, "export const compteAuSolde = (l: CongeLu): boolean => l.status === 'approuve' && (l.type === 'conge' || l.type === 'vacances');", "export const compteAuSolde = (l: CongeLu): boolean => l.type === 'conge' || l.type === 'vacances';"],
  ['la maladie compte au solde', PUR, "export const compteAuSolde = (l: CongeLu): boolean => l.status === 'approuve' && (l.type === 'conge' || l.type === 'vacances');", "export const compteAuSolde = (l: CongeLu): boolean => l.status === 'approuve';"],
  ['un droit plein a qui arrive en cours d annee', PUR, '    else if (a === annee) mois = Math.max(0, 12 - (m - 1) - (j > 1 ? 1 : 0));', '    else if (a === annee) mois = 12;'],
  ['les chevauchements passent', PUR, "    if (deja) return `Déjà en congé du ${jourLong(deja.startDate)} au ${jourLong(deja.endDate)} : ces jours ne se comptent pas deux fois.`;", ''],
  ['la fermeture double un conge', PUR, '    .filter((m) => !pourquoiPasLaPeriode({ du: o.du, au: o.au, employeeId: m.id, conges: o.conges }))', '    .filter(() => true)'],
  ['la fermeture refait un jour deja ferme', PUR, '    if (o.exceptions.some((x) => x.date === d && !x.staffId && x.closed)) continue;', ''],
  ['l inventaire devient un conge', PUR, "    if (statutDuJour(out, staffId, d) === 'inventaire') continue;\n", ''],
  ['retirer efface tout le planning', PUR, "    if (statutDuJour(out, staffId, d) === 'conge') out = poseLeJour(out, staffId, d, '');", "    out = poseLeJour(out, staffId, d, '');"],
  ['deux conges disent deuxieme', PUR, "  n === 2 && i === 1 ? (feminin ? 'Seconde' : 'Second') : (feminin ? ORDINAUX_F : ORDINAUX)[i] ?? `${i + 1}e`;", '  (feminin ? ORDINAUX_F : ORDINAUX)[i] ?? `${i + 1}e`;'],
  ['le total sans son detail', PUR, "    total: `${jours.length > 1 ? `${jours.join(' + ')} = ` : ''}${somme} jour${somme > 1 ? 's' : ''}`,", "    total: `${somme} jour${somme > 1 ? 's' : ''}`,"],
  ['le reste compte la seule fiche', PUR, '  const pris = o.prisDansLAnnee ?? somme;', '  const pris = somme;'],
  ['le solde ignore les vacances', PAIE, "(l.type === 'conge' || l.type === 'vacances') && l.status === 'approuve')", "l.type === 'conge' && l.status === 'approuve')"],
  ['le reste toujours au pluriel', PUR, "  return `Reste de votre droit de l’année : ${r} jour${r > 1 ? 's' : ''} sur ${droit}.`;", "  return `Reste de votre droit de l’année : ${r} jours sur ${droit}.`;"],
  ['l onglet disparait', TEMPS, "tab === 'vacances' ? <VacancesAnnuelles /> : <Conges />}", '<Conges />}'],
  ['les vacances dans la liste des demandes', TEMPS, " && l.type !== 'vacances')", ')'],
  ['l accord ne fait plus la fiche', TEMPS, "    if (l && status === 'approuve' && l.type === 'conge') void ficheDuCongeAccorde({ ...l, status: 'approuve' }, false);\n", ''],
  ['caler sans le planning', VAC, '      planningStore.set((p) => poseLesVacances(p, m.id, f.du, f.au));\n', ''],
  ['caler sans la fiche', VAC, '      const ok = await fiche(m, [...conges, l as unknown as CongeLu], true, false);', '      const ok = false;'],
  ['la fermeture sans les journees fermees', VAC, '      if (fermes.length) exceptionsHorairesStore.set((prev) => [...(prev ?? []), ...fermes]);\n', ''],
  ['retirer une fermeture laisse la Maison fermee', VAC, '    if (l.fermeture) exceptionsHorairesStore.set((prev) => (prev ?? []).filter((x) => !String(x.id ?? \'\').startsWith(`hx-${l.fermeture}-`)));\n', ''],
  ['les prestataires hors de l onglet', VAC, "staff.filter((m) => m.branchId === branch.id && !estPartie(m, new Date().toISOString().slice(0, 10)))", "staff.filter((m) => m.branchId === branch.id && !estPartie(m, new Date().toISOString().slice(0, 10)) && m.contractType !== 'prestataire')"],
  ['la fiche dans la partie lue par tous', COFFRE, '  `${DOSSIER_DES_CONGES}/identite/${staffId}`;', '  `${DOSSIER_DES_CONGES}/pieces/${staffId}`;'],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-les-vacances-annuelles');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-vacances-annuelles.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k), key: (i) => [...__m.keys()][i] ?? null, get length() { return __m.size; } };
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
