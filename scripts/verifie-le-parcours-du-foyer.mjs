import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE PARCOURS DU FOYER, ÉPROUVÉ (4 novembre 2026). `node scripts/verifie-le-parcours-du-foyer.mjs`
   lance le harnais ; `--prouve` le relance sur chaque panne ci-dessous, et
   chaque panne doit le faire crier. Les pannes vivent dans la mémoire du
   bundle (un greffon d'esbuild remplace le texte lu des règles pures), ou
   dans une copie temporaire que le harnais lit à la place (le SQL et les
   écrans, qu'il lit sans les importer) : jamais dans le dépôt. */

const racine = path.resolve(import.meta.dirname, '..');
const PUR = path.join(racine, 'src/shared/foyer-pur.ts');
const FACTURE = path.join(racine, 'src/shared/facture-du-foyer-pur.ts');
const SQL = path.join(racine, 'supabase/reglage_foyer_jk_fk_20261104.sql');
const SHARED = path.join(racine, 'src/apps/trone/routes/clients/_shared.tsx');
const CARNET = path.join(racine, 'src/apps/trone/routes/clients/Carnet.tsx');
const CALENDRIER = path.join(racine, 'src/apps/trone/routes/clients/Calendrier.tsx');
const COMPTES = path.join(racine, 'src/apps/trone/routes/finances/Comptes.tsx');
const GESTES = path.join(racine, 'src/apps/trone/routes/clients/foyer-gestes.ts');
/* Les fichiers lus par le harnais, et la variable qui lui donne la copie. */
const LUS = new Map([[SQL, 'FOYER_SQL'], [SHARED, 'FOYER_SHARED'], [CARNET, 'FOYER_CARNET'], [CALENDRIER, 'FOYER_CALENDRIER'], [COMPTES, 'FOYER_COMPTES'], [GESTES, 'FOYER_GESTES']]);

const PANNES = [
  /* Les sept pannes demandées. */
  { nom: 'le déplacement d une seule tête', fichier: PUR,
    avant: 'return [elle, ...autres.filter(bouge).map((a) =>', apres: 'return [elle, ...autres.filter(() => false).map((a) =>' },
  { nom: 'l annulation sans question (la règle)', fichier: PUR,
    avant: '  if (autres.length === 0) return null;\n  const n = autres.length + 1;', apres: '  return null;\n  const n = autres.length + 1;' },
  { nom: 'l annulation sans question (le Carnet)', fichier: CARNET,
    avant: 'const r = await quiAnnuler(a);', apres: 'const r = { ids: [a.id], demande: false };' },
  { nom: 'l annulation sans question (la fenêtre)', fichier: SHARED,
    avant: 'const qui = await quiAnnuler(', apres: 'const qui = { ids: [appt.id], demande: false } ?? (' },
  { nom: 'la petite au tarif adulte', fichier: PUR,
    avant: "  if (kids === 'oui') {", apres: "  if (kids === 'oui' && false) {" },
  { nom: 'un foyer qui se forme sans la case', fichier: PUR,
    avant: 'if (!elle || !o.famille?.toujoursEnsemble || elle.familyId !== o.famille.id) return rien;', apres: 'if (!elle) return rien;' },
  { nom: 'un foyer qui se forme sans la même heure', fichier: PUR,
    avant: 'if (a.date !== rdv.date || a.time !== rdv.time ||', apres: 'if (a.date !== rdv.date ||' },
  { nom: '« seulement elle » qui déplace quand même l autre', fichier: PUR,
    avant: '  if (o.seulementElle) return [autres.length > 0 ? { ...elle, detache: true } : elle];\n', apres: '' },
  { nom: 'la facture du foyer qui ne réunit plus le foyer', fichier: FACTURE,
    avant: '  if (a.familyId && a.familyId === b.familyId) return true;\n', apres: '' },
  { nom: 'le réglage SQL sans repli', fichier: SQL,
    avant: "create table if not exists public.repli_foyer_rdv_20261104 as\n  select id, branch_id, data, updated_at from public.appointments\n   where id in ('i4gg2fee0t', 'ni8vhz0g87');\n", apres: '' },
  /* Et celles qui gardent le reste honnête. */
  { nom: 'le repli sans RLS', fichier: SQL,
    avant: 'alter table public.repli_foyer_famille_20261104 enable row level security;', apres: '' },
  { nom: 'une écriture avant le repli', fichier: SQL,
    avant: 'create table if not exists public.repli_foyer_rdv_20261104 as',
    apres: "update public.appointments set updated_at = now() where id = 'i4gg2fee0t';\ncreate table if not exists public.repli_foyer_rdv_20261104 as" },
  { nom: 'le foyer posé sur une seule des deux', fichier: SQL,
    avant: '   and (select vivantes from deux)\n', apres: '' },
  { nom: 'les lier sans le même compte', fichier: PUR,
    avant: 'if (!f || f.archived || f.familyId !== fam) return false;', apres: 'if (!f || f.archived) return false;' },
  { nom: 'le prénom devient le nom de famille', fichier: PUR,
    avant: "  return mots[0] ?? '';\n};", apres: "  return mots[mots.length - 1] ?? '';\n};" },
  { nom: 'une sœur honorée déplacée', fichier: PUR,
    avant: '...autres.filter(bouge).map(', apres: '...autres.map(' },
  { nom: 'une sœur d un autre jour emmenée', fichier: PUR,
    avant: 'a.foyerId === rdv.foyerId && a.date === rdv.date', apres: 'a.foyerId === rdv.foyerId' },
  { nom: 'deux fois le même geste', fichier: PUR,
    avant: 'if (!serviceIds.includes(l.id)) serviceIds.push(l.id);', apres: 'serviceIds.push(l.id);' },
  { nom: 'une sœur déjà posée reposée', fichier: PUR,
    avant: '    if (sien) {', apres: '    if (sien && false) {' },
  { nom: 'deux sœurs chez le même maître libre', fichier: PUR,
    avant: '!pris.has(x)', apres: 'true' },
  { nom: 'la fenêtre oublie le foyer au déplacement', fichier: SHARED,
    avant: 'const d = deplacementDuFoyer({ rdv: avantDeLEcriture, rdvs: appointmentsStore.get(), date, time, seulementElle });',
    apres: 'const d = [] as ReturnType<typeof deplacementDuFoyer>;' },
  { nom: 'la fenêtre pose seule', fichier: SHARED,
    avant: 'suites: [...suites, ...desCompagnes],', apres: 'suites,' },
  { nom: 'le calendrier glisse une seule tête', fichier: CALENDRIER,
    avant: 'const n = deplaceAvecLeFoyer(a, next);',
    apres: 'appointmentsStore.set((prev) => prev.map((x) => (x.id === a.id ? { ...x, date: next.date, time: next.time, master: next.master } : x))); const n = 1;' },
  { nom: 'l éditeur du compte efface la case', fichier: COMPTES,
    avant: '      ...(family ?? {}),\n', apres: '' },
];

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-parcours-du-foyer-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    const greffon = {
      name: 'panne',
      setup(b) {
        if (!panne || LUS.has(path.normalize(panne.fichier))) return;
        const cible = path.normalize(panne.fichier);
        b.onLoad({ filter: /(foyer-pur|facture-du-foyer-pur)\.ts$/ }, (args) => {
          if (path.normalize(args.path) !== cible) return undefined;
          const t = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n');
          if (!t.includes(panne.avant)) throw new Error(`panne introuvable : ${panne.nom}`);
          return { contents: t.replace(panne.avant, panne.apres), loader: 'ts' };
        });
      },
    };
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-parcours-du-foyer.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      plugins: [greffon],
    });
    const env = { ...process.env };
    const lu = panne && LUS.get(path.normalize(panne.fichier));
    if (lu) {
      const t = readFileSync(panne.fichier, 'utf8').replace(/\r\n/g, '\n');
      if (!t.includes(panne.avant)) throw new Error(`panne introuvable : ${panne.nom}`);
      const copie = path.join(dossier, path.basename(panne.fichier));
      writeFileSync(copie, t.replace(panne.avant, panne.apres));
      env[lu] = copie;
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
    const crie = r.status !== 0;
    if (!crie) muettes++;
    console.log(`${crie ? 'CRIE ' : 'MUETTE'} ${p.nom}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
