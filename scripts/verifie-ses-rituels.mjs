import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* SES RITUELS, ÉPROUVÉS (2 novembre 2026). `node scripts/verifie-ses-rituels.mjs`
   lance le harnais ; `--prouve` le relance sur chaque panne ci-dessous, et
   chaque panne doit le faire crier. Les pannes vivent dans la mémoire du
   bundle (un greffon d'esbuild remplace le texte lu), jamais dans le dépôt :
   le banc se prouve sans rien toucher de l'arbre partagé. */

const racine = path.resolve(import.meta.dirname, '..');
const PUR = path.join(racine, 'src/shared/ses-rituels-pur.ts');
const BOOKING = path.join(racine, 'src/apps/couronne/Booking.tsx');

const PANNES = [
  { nom: 'le confirmé passé ne compte pas', fichier: PUR,
    avant: "(a.status === 'confirmé' && a.date.slice(0, 10) < aujourdhui)", apres: 'false' },
  { nom: 'le confirmé du jour même compte', fichier: PUR,
    avant: 'a.date.slice(0, 10) < aujourdhui', apres: 'a.date.slice(0, 10) <= aujourdhui' },
  { nom: 'le successeur n est jamais lu', fichier: PUR,
    avant: 'const neuf = o.successeur?.(id);', apres: 'const neuf = undefined as string | undefined;' },
  { nom: 'un geste fermé se retire en silence', fichier: PUR,
    avant: 'complet = false;\n      break;', apres: 'continue;' },
  { nom: 'deux fois le même rituel', fichier: PUR,
    avant: 'if (vus.has(k)) continue;', apres: '' },
  { nom: 'une création comptée comme routine', fichier: PUR,
    avant: 'if (o.estCreation && a.serviceIds.some(o.estCreation)) continue;', apres: '' },
  { nom: 'le plus ancien d abord', fichier: PUR,
    avant: "`${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`)", apres: "`${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`)" },
  { nom: 'les RDV d une autre cliente', fichier: PUR,
    avant: 'a.clientId === o.clientId && ', apres: '' },
  { nom: 'la longueur lue sur un RDV à venir', fichier: PUR,
    avant: "a.clientId === clientId && !!a.longueur && estUneVenuePassee(a, aujourdhui)", apres: "a.clientId === clientId && !!a.longueur && a.status !== 'annulé'" },
  { nom: 'la longueur la plus ancienne', fichier: PUR,
    avant: "  const d = rdvs\n    .filter((a) => a.clientId === clientId && !!a.longueur && estUneVenuePassee(a, aujourdhui))\n    .sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`))[0];",
    apres: "  const d = rdvs\n    .filter((a) => a.clientId === clientId && !!a.longueur && estUneVenuePassee(a, aujourdhui))\n    .sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`))[0];" },
  { nom: 'Ma Couronne tarife sans la longueur vue', fichier: BOOKING,
    avant: 'const pricing = pricingOf(cibleTarifee ?? undefined, bands, sets, tousCats);', apres: 'const pricing = pricingOf(cible ?? undefined, bands, sets, tousCats);' },
  { nom: 'Ma Couronne ne montre que le dernier', fichier: BOOKING,
    avant: "sesRituels.map((r, i) => laFormule(r.ids, i === 0 ? t('Comme la dernière fois') : t('Comme le {date}', { date: jourDuRituel(r.date) })))",
    apres: "derniereVenue && laFormule(derniereVenue, t('Comme la dernière fois'))" },
  { nom: 'Ma Couronne oublie les successeurs', fichier: BOOKING,
    avant: 'successeur: (id) => SUCCESSEURS[id],', apres: '' },
];

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-ses-rituels-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    const greffon = {
      name: 'panne',
      setup(b) {
        if (!panne) return;
        const cible = path.normalize(panne.fichier);
        b.onLoad({ filter: /ses-rituels-pur\.ts$/ }, (args) => {
          if (path.normalize(args.path) !== cible) return undefined;
          const t = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n');
          if (!t.includes(panne.avant)) throw new Error(`panne introuvable : ${panne.nom}`);
          return { contents: t.replace(panne.avant, panne.apres), loader: 'ts' };
        });
      },
    };
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-ses-rituels.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      plugins: [greffon],
    });
    /* Booking.tsx est LU par le harnais (readFileSync), pas importé : sa panne
       passe par une copie que le harnais lit à la place, via l'environnement. */
    const env = { ...process.env };
    if (panne && path.normalize(panne.fichier) === path.normalize(BOOKING)) {
      const t = readFileSync(BOOKING, 'utf8').replace(/\r\n/g, '\n');
      if (!t.includes(panne.avant)) throw new Error(`panne introuvable : ${panne.nom}`);
      const copie = path.join(dossier, 'Booking.tsx');
      (await import('node:fs')).writeFileSync(copie, t.replace(panne.avant, panne.apres));
      env.SES_RITUELS_BOOKING = copie;
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
