import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES PLACES LIMITEES, EPROUVEES (4 novembre 2026).
   `node scripts/verifie-les-places-limitees.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier. Les pannes vivent dans la memoire du bundle (un greffon
   d'esbuild remplace le texte lu), jamais dans le depot : l'empreinte de
   chaque fichier est comparee avant et apres. Une panne dont le texte ne se
   trouve plus exactement une fois fait echouer la preuve. */

const racine = path.resolve(import.meta.dirname, '..');
const P = 'src/shared/offres-pur.ts';

const PANNES = [
  { nom: 'le decompte oublie les places prises', fichier: P,
    avant: 'return Math.max(0, Math.floor(o.placesParJour as number) - occ.prises);', apres: 'return Math.max(0, Math.floor(o.placesParJour as number));' },
  { nom: 'un jour deja occupe ouvre ses places', fichier: P,
    avant: 'if (o.jourVideSeulement && occ.autres > 0) return 0;', apres: '' },
  { nom: 'pas d horizon', fichier: P,
    avant: 'if (horizon > 0 && joursEntre(aujourdhui, j) > horizon) return null;', apres: '' },
  { nom: 'le samedi remise', fichier: P,
    avant: 'if (!jour || !o.joursDeLaVenue!.includes(jour)) return false;', apres: 'if (!jour) return false;' },
  { nom: 'un jour passe s ouvre', fichier: P,
    avant: 'if (!laVenueTombeBien(o, j) || j < aujourdhui) return null;', apres: 'if (!laVenueTombeBien(o, j)) return null;' },
  { nom: 'une place prise se perd', fichier: P,
    avant: 'const tenue = !!o.id && v.offreTenue === o.id;', apres: 'const tenue = false;' },
  { nom: 'les prix convenus prennent une place', fichier: P,
    avant: 'if (v.prixConvenus || v.autreRemise) continue;', apres: 'if (v.autreRemise) continue;' },
  { nom: 'deux remises cumulees', fichier: P,
    avant: 'if (v.prixConvenus || v.autreRemise) continue;', apres: 'if (v.prixConvenus) continue;' },
  { nom: 'un jour non compte remise', fichier: P,
    avant: 'if (!o?.active || !estAPlaces(o) || !occ || !dateIso) return null;',
    apres: 'if (!occ) return 3; if (!o?.active || !estAPlaces(o) || !dateIso) return null;' },
  { nom: 'les annules se comptent', fichier: P,
    avant: "if (!r || String(r.date ?? '').slice(0, 10) !== dateIso || r.status === 'annulé') continue;", apres: "if (!r || String(r.date ?? '').slice(0, 10) !== dateIso) continue;" },
  { nom: 'le rendez-vous relu se compte', fichier: P,
    avant: 'if (e.saufId && r.id === e.saufId) continue;', apres: '' },
  { nom: 'une autre maison se compte', fichier: P,
    avant: 'if (e.branchId && r.branchId && r.branchId !== e.branchId) continue;', apres: '' },
  { nom: 'le code ne compte pas la place', fichier: P,
    avant: "const sienne = (!!offre.id && r.offreId === offre.id) || (!!code && codeNormalise(r.codeOffre) === code);",
    apres: "const sienne = !!offre.id && r.offreId === offre.id;" },
  { nom: 'il reste 1 places', fichier: P,
    avant: "n === 1 ? 'Remise : il reste une place' : `Remise : il reste ${n} places`", apres: "`Remise : il reste ${n} places`" },
  { nom: 'les places lues sont ignorees', fichier: P,
    avant: 'const restantes = v.placesConnues !== undefined', apres: 'const restantes = false' },
  { nom: 'la famille par-dessus les prix convenus', fichier: P,
    avant: 'tete.prixConvenus || tete.abonnee ? 0 : Math.max(0, Math.round(pct));', apres: 'tete.abonnee ? 0 : Math.max(0, Math.round(pct));' },
  { nom: 'la famille par-dessus un abonnement', fichier: P,
    avant: 'tete.prixConvenus || tete.abonnee ? 0 : Math.max(0, Math.round(pct));', apres: 'tete.prixConvenus ? 0 : Math.max(0, Math.round(pct));' },
  { nom: 'le Sowa prend une remise', fichier: P,
    avant: '=> !!s?.sansRemise;', apres: '=> false;' },
  { nom: 'une offre eteinte compte', fichier: P,
    avant: 'if (!o?.active || !estAPlaces(o) || !occ || !dateIso) return null;', apres: 'if (!estAPlaces(o) || !occ || !dateIso) return null;' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-places-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-places-limitees.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      plugins: panne ? [{
        name: 'panne',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = path.relative(racine, args.path).split(path.sep).join('/');
            if (rel !== panne.fichier) return undefined;
            const contents = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').split(panne.avant).join(panne.apres);
            return { contents, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) };
          });
        },
      }] : [],
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
};

const prouve = process.argv.includes('--prouve');
const net = await lance(null);
process.stdout.write(net.stdout ?? '');
if (net.status !== 0) { process.stderr.write(net.stderr ?? ''); process.exit(1); }
if (prouve) {
  let muettes = 0;
  for (const p of PANNES) {
    const texte = readFileSync(path.join(racine, p.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(p.avant).length - 1;
    const avant = md5(p.fichier);
    let verdict;
    if (fois !== 1) verdict = `INTROUVABLE (${fois} fois)`;
    else {
      const r = await lance(p);
      verdict = r.status !== 0 ? 'CRIE ' : 'MUETTE';
    }
    if (md5(p.fichier) !== avant) verdict = `LE FICHIER A CHANGE (${verdict})`;
    if (verdict !== 'CRIE ') muettes++;
    console.log(`${verdict} ${p.nom}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) ou introuvable(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
