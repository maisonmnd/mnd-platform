import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES PREVISIONS REFAITES, EPROUVEES : `node scripts/verifie-les-previsions-refaites.mjs [--prouve]`
   (11 novembre 2026, « L'UI/l'UX des previsions est mediocre. Refais-moi une
   belle et professionnelle », Y. ; maquette PYPe8AbTyxytSBxZLDiMZ7). Le
   harnais tient les regles d'affichage pures et que l'ecran les branche :
   horizon et vue separes, quatre tuiles, jauge bornee a 100 %, leviers tries
   par gain, un seul panneau du detail ouvert, `?vue=francs` lu. `--prouve` :
   chaque faute est remise une a une (copie gardee, restauration dans un
   finally, empreintes comparees), et le banc doit crier a chacune. */
const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-les-previsions-refaites');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({ entryPoints: [path.join(racine, 'scripts/verifie-les-previsions-refaites.harnais.ts')], bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error' });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const AFF = 'src/apps/trone/routes/pilotage/previsions-affichage-pur.ts';
const ECRAN = 'src/apps/trone/routes/pilotage/Previsions.tsx';
/* [nom, fichier, chaine exacte, remplacement] : chaque panne doit faire crier le banc. */
const PANNES = [
  ['la jauge deborde du plafond', AFF, 'const total = Math.max(o.plafond, poses + attendus + marketing, 0);', 'const total = Math.max(o.plafond, 0);'],
  ['la jauge garde une part negative', AFF, 'const poses = Math.max(0, o.poses);', 'const poses = o.poses;'],
  ['les leviers du moins rentable au plus rentable', AFF, 'b.rdv - a.rdv ||', 'a.rdv - b.rdv ||'],
  ['la liste du calcul triee sur place', AFF, 'return [...leviers].sort(', 'return (leviers as T[]).sort('],
  ['la ligne ouverte ne se referme plus', AFF, '(ouvert === cle ? null : cle)', '(cle)'],
  ['?vue=francs n ouvre plus En francs', AFF, "(v === 'francs' ? 'francs' :", "(v === 'franc' ? 'francs' :"],
  ['un horizon devient une vue', AFF, "{ cle: 'passe', nom: '12 derniers mois' },", "{ cle: 'passe', nom: '12 derniers mois' }, { cle: '4s' as VueDesPrevisions, nom: '4 semaines' },"],
  ['le remplissage sans le marketing', AFF, 'avec: Math.max(0, prevision + marketing) / plafond', 'avec: Math.max(0, prevision) / plafond'],
  ['un jour creux peint en plein', AFF, "if (j.creux) return 'creux';", ''],
  ['le calcul ne suit plus l horizon', ECRAN, 'usePrevisions(horizon, rdvs)', "usePrevisions('4s', rdvs)"],
  ['l horizon reste actif hors de A venir', ECRAN, "disabled={vue !== 'avenir'} onClick={() => setHorizon(h)}", 'disabled={false} onClick={() => setHorizon(h)}'],
  ['l ecran ne lit plus l adresse', ECRAN, "vueDeLAdresse(params.get('vue'))", 'vueDeLAdresse(null)'],
  ['la tuile du remplissage disparait', ECRAN, '<small>Remplissage</small>', '<small>Rythme</small>'],
  ['la jauge ne lit plus ses parts bornees', ECRAN, 'style={{ width: `${jauge.poses * 100}%` }}', 'style={{ width: `${p.poses.rdv}%` }}'],
  ['les leviers dans l ordre du calcul', ECRAN, 'const leviers = leviersParGain(p.leviers);', 'const leviers = p.leviers;'],
  ['le detail s ouvre tout ferme', ECRAN, 'useState<PanneauDuDetail | null>(PANNEAU_OUVERT_AU_DEPART)', 'useState<PanneauDuDetail | null>(null)'],
  ['le bouton du detail ne dit plus s il est ouvert', ECRAN, 'aria-expanded={est}', 'aria-expanded={false}'],
  ['une case du jour ne mene plus a son calendrier', ECRAN, 'onClick={() => navigate(`/calendrier?jour=${j.iso}`)}', "onClick={() => navigate('/calendrier')}"],
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
