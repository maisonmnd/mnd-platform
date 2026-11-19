import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* A REPROGRAMMER, EPROUVE (19 novembre 2026).
   `node scripts/verifie-a-reprogrammer.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier par une epreuve. Les pannes vivent dans la memoire du bundle
   (un greffon d'esbuild remplace le texte lu) ou dans une copie hors du depot
   pour les fichiers que le harnais LIT : rien de l'arbre partage ne bouge. */

const racine = path.resolve(import.meta.dirname, '..');
const PUR = 'src/shared/a-reprogrammer-pur.ts';
const SQL = 'supabase/migrations/0239_a_reprogrammer.sql';
const SH = 'src/apps/trone/routes/clients/_shared.tsx';
const AR = 'src/apps/trone/routes/clients/a-reprogrammer.ts';
const CAR = 'src/apps/trone/routes/clients/Carnet.tsx';
const RVT = 'src/apps/couronne/RendezVousTab.tsx';

const PANNES = [
  { nom: 'le report garde la place (statut confirme)', fichier: PUR,
    r: [["  return { status: 'annulé', aReprogrammerDepuis: new Date(maintenantMs).toISOString(), aReprogrammerPar: par };", "  return { status: 'confirmé' as 'annulé', aReprogrammerDepuis: new Date(maintenantMs).toISOString(), aReprogrammerPar: par };"]] },
  { nom: 'un annule seul passe pour a reprogrammer', fichier: PUR,
    r: [["  return !!a && a.status === 'annulé' && ecritLe(a.aReprogrammerDepuis);", "  return !!a && a.status === 'annulé';"]] },
  { nom: 'la relance a 24 heures (fenetre fermee)', fichier: PUR,
    r: [['export const RELANCE_DU_REPORT_APRES_MS = 23 * 3_600_000;', 'export const RELANCE_DU_REPORT_APRES_MS = 24 * 3_600_000;']] },
  { nom: 'la relance la nuit', fichier: PUR,
    r: [['  return m >= RELANCE_DU_REPORT_DE_MIN && m < RELANCE_DU_REPORT_A_MIN;\n}', '  return true;\n}']] },
  { nom: 'la relance deux fois', fichier: PUR,
    r: [['  if (!estAReprogrammer(o.a) || ecritLe(o.a.relanceDuReportLe) || o.dernierEntrantMs === null) return false;', '  if (!estAReprogrammer(o.a) || o.dernierEntrantMs === null) return false;']] },
  { nom: 'un bouton de plus de vingt signes', fichier: PUR,
    r: [['  if (long.length <= 20) return long;', '  return long;']] },
  { nom: 'l identifiant sans MND: (la reception ne le confie pas)', fichier: PUR,
    r: [['  return `MND:place|${qui}|${p.iso}|${p.heure}`.slice(0, 256);', '  return `place|${qui}|${p.iso}|${p.heure}`.slice(0, 256);']] },
  { nom: 'les places deja proposees reviennent', fichier: PUR,
    r: [['    if (deja.has(k) || vues.has(k) ||', '    if (vues.has(k) ||']] },
  { nom: 'ses habitudes oubliees', fichier: PUR,
    r: [['    if (o.habitudes?.jours.includes(rangDuJourDuReport(p.iso))) s += 25;\n', '']] },
  { nom: 'au-dela des fauteuils avant l heure suivante', fichier: PUR,
    r: [['  if (heures.length > 0) return { genre: \'dans-l-heure\', heures };\n', '']] },
  { nom: 'la reprise sans verrou', fichier: SQL,
    r: [["  perform pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || p_date));\n  select a.id, a.data, a.updated_at into rdv from public.appointments a where a.id = p_id for update;", "  select a.id, a.data, a.updated_at into rdv from public.appointments a where a.id = p_id;"]] },
  { nom: 'la reprise d un rendez-vous qui n est pas a reprogrammer', fichier: SQL,
    r: [["  if not (coalesce(d->>'status', '') = 'annulé' and btrim(coalesce(d->>'aReprogrammerDepuis', '')) <> '') then", "  if false then"]] },
  { nom: 'au-dela, deux tetes lourdes chez Team', fichier: SQL,
    r: [["      if not (m = 'Team' and lourde_venue and lourde_chez_lui) then\n        choisi := m;\n        exit;\n      end if;\n      continue;\n    end if;\n    if cap_maitre > 0 and (\n         select count(*) from public.appointments a\n          where a.id <> p_id", "      choisi := m;\n      exit;\n    end if;\n    if cap_maitre > 0 and (\n         select count(*) from public.appointments a\n          where a.id <> p_id"]] },
  { nom: 'la pose au-dela ouverte a tous', fichier: SQL,
    r: [["                             and coalesce(p_rdv->>'source', '') = 'whatsapp'\n                             and coalesce(p_rdv->>'poseePar', '') = 'Opale';", ';']] },
  { nom: 'Enregistrer garde les marques du report', fichier: SH,
    r: [["                ...(chosenStatus !== 'annulé' ? marquesDeLaRepriseAuTrone(x) : {}),\n", '']] },
  { nom: 'un rendez-vous honore se met a reprogrammer', fichier: AR,
    r: [["a.id === id && (a.status === 'confirmé' || a.status === 'en attente')", 'a.id === id']] },
  { nom: 'le Carnet le compte comme une annulation', fichier: CAR,
    r: [["garde: (a) => a.status === 'annulé' && !estAReprogrammer(a) },", "garde: (a) => a.status === 'annulé' },"]] },
  { nom: 'Ma Couronne le barre', fichier: RVT,
    r: [["${annulee && !reporte ? 'ab-rdvc--annulee' : ''}", "${annulee ? 'ab-rdvc--annulee' : ''}"]] },
];

const lisLF = (rel) => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
const applique = (panne) => {
  let t = lisLF(panne.fichier);
  for (const [avant, apres] of panne.r) {
    if (!t.includes(avant)) throw new Error(`panne introuvable : ${panne.nom} (${avant.slice(0, 60)})`);
    t = t.replace(avant, () => apres);
  }
  return t;
};

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-a-reprogrammer-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    const texte = panne ? applique(panne) : null;
    const cible = panne ? path.normalize(path.join(racine, panne.fichier)) : null;
    const greffon = {
      name: 'panne',
      setup(b) {
        if (!panne) return;
        b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
          if (path.normalize(args.path) !== cible) return undefined;
          return { contents: texte, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
        });
      },
    };
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-a-reprogrammer.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      plugins: [greffon],
    });
    const env = { ...process.env };
    delete env.REPORT_PANNE_FICHIER;
    delete env.REPORT_PANNE_COPIE;
    if (panne) {
      const copie = path.join(dossier, 'copie', panne.fichier);
      mkdirSync(path.dirname(copie), { recursive: true });
      writeFileSync(copie, texte);
      env.REPORT_PANNE_FICHIER = panne.fichier;
      env.REPORT_PANNE_COPIE = copie;
    }
    return spawnSync(process.execPath, [sortie], { cwd: racine, env, encoding: 'utf8' });
  } finally {
    setTimeout(() => rmSync(dossier, { recursive: true, force: true }), 0);
  }
};

const prouve = process.argv.includes('--prouve');
const net = await lance(null);
process.stdout.write(net.stdout);
if (net.status !== 0) { process.stderr.write(net.stderr); process.exit(1); }
if (prouve) {
  let muettes = 0;
  for (const p of PANNES) {
    const r = await lance(p);
    const epreuve = (r.stdout ?? '').split('\n').find((l) => l.startsWith('ECHEC'));
    const crie = r.status !== 0 && !!epreuve;
    if (!crie) muettes++;
    console.log(`${crie ? 'CRIE ' : 'MUETTE'} ${p.nom}${epreuve ? `  (${epreuve.slice(6).split(' -> ')[0].trim()})` : r.status !== 0 ? '  (le harnais tombe)' : ''}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
