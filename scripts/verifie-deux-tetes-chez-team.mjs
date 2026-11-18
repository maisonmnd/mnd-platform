import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* DEUX TETES CHEZ TEAM, EPROUVE (18 novembre 2026).
   `node scripts/verifie-deux-tetes-chez-team.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier par une epreuve. Les pannes vivent dans la memoire du bundle
   (un greffon d'esbuild remplace le texte lu) ou dans une copie hors du depot
   pour les fichiers que le harnais LIT : rien de l'arbre partage ne bouge. */

const racine = path.resolve(import.meta.dirname, '..');
const PUR = 'src/shared/agenda-pur.ts';
const JUGE = 'src/shared/place-du-serveur.ts';
const SQL = 'supabase/migrations/0238_deux_tetes_chez_team.sql';
const WA = 'supabase/functions/whatsapp-automate/index.ts';
const DS = 'supabase/functions/demande-submit/index.ts';

const PANNES = [
  { nom: 'Team bloque toujours (la regle pure)', fichier: PUR,
    r: [['maitre !== MAITRE_QUI_PARTAGE || (!!nouvelleLourde && !!deja.lourde);', 'true;']] },
  { nom: 'deux lourdes ensemble (la regle pure)', fichier: PUR,
    r: [['maitre !== MAITRE_QUI_PARTAGE || (!!nouvelleLourde && !!deja.lourde);', 'maitre !== MAITRE_QUI_PARTAGE;']] },
  { nom: 'le seuil passe a plus de 150', fichier: PUR,
    r: [['return Number.isFinite(n) && n >= SEUIL_TETE_LOURDE;', 'return Number.isFinite(n) && n > SEUIL_TETE_LOURDE;']] },
  { nom: 'trois chez Team (creneauxLibres)', fichier: PUR,
    r: [['if (duMaitre.filter((a) => m < a.debutMin + a.dureeMin && m + o.durationMin > a.debutMin).length >= DEUX_TETES_AU_PLUS) continue;', '']] },
  { nom: 'creneauxLibres oublie la tete de la venue', fichier: PUR,
    r: [['.filter((a) => bloqueLaVenue(o.master, o.lourde, a))', '.filter((a) => bloqueLaVenue(o.master, false, a))']] },
  { nom: 'le juge oublie la tete de la venue', fichier: JUGE,
    r: [['const occupe = chevauchent.some((a) => bloqueLaVenue(m, p.lourde, a))', 'const occupe = chevauchent.some((a) => bloqueLaVenue(m, false, a))']] },
  { nom: 'trois chez Team (le juge)', fichier: JUGE,
    r: [['      || chevauchent.length >= DEUX_TETES_AU_PLUS\n      || plagesBloquees(agenda.murs', '      || plagesBloquees(agenda.murs']] },
  { nom: 'Team qui partage avant un maitre seul', fichier: JUGE,
    r: [['return { ok: true, dureeMin, maitres: [...libres, ...partages] };', 'return { ok: true, dureeMin, maitres: [...partages, ...libres] };']] },
  { nom: '« lourde » perdue en lisant les creneaux', fichier: JUGE,
    r: [[', ...(c.lourde === true ? { lourde: true } : {}) };', ' };']] },
  { nom: 'les places de chaque jour ignorees', fichier: JUGE,
    r: [['return typeof lu === \'number\' && Number.isInteger(lu) && lu >= 0 ? lu : agenda.sieges;', 'return agenda.sieges;']] },
  { nom: 'placesLibres oublie la tete', fichier: JUGE,
    r: [['        maintenantMin: null,\n        ...(lourde ? { lourde: true } : {}),', '        maintenantMin: null,']] },
  { nom: 'le verrou laisse deux lourdes', fichier: SQL,
    r: [["if partage is null and m = 'Team' and chez_lui < 2 and not (lourde_venue and lourde_chez_lui) then", "if partage is null and m = 'Team' and chez_lui < 2 then"]] },
  { nom: 'le verrou prend Team avant un maitre seul', fichier: SQL,
    r: [['    if chez_lui = 0 then\n      choisi := m;\n      exit;\n    end if;', '    if chez_lui < 2 then\n      choisi := m;\n      exit;\n    end if;']] },
  { nom: 'le garde laisse trois chez Team', fichier: SQL,
    r: [["and not (maitre = 'Team' and chez_lui < 2 and not (public.tete_lourde(new.data) and lourde_chez_lui)) then", "and not (maitre = 'Team' and not (public.tete_lourde(new.data) and lourde_chez_lui)) then"]] },
  { nom: 'le deplacement du site laisse deux lourdes', fichier: SQL,
    r: [["and not (maitre = 'Team' and chez_lui < 2 and not (public.tete_lourde(d) and lourde_chez_lui)) then", "and not (maitre = 'Team' and chez_lui < 2) then"]] },
  { nom: 'le seuil de la base a 100', fichier: SQL,
    r: [['then btrim(p)::numeric >= 150 else false end', 'then btrim(p)::numeric >= 100 else false end']] },
  { nom: 'la tete annoncee oubliee par la base', fichier: SQL,
    r: [["  select public.locks_lourds(p_data->>'locksAnnonces')\n      or ", '  select ']] },
  { nom: 'creneaux_occupes sans « lourde »', fichier: SQL,
    r: [['    public.duree_du_rdv(a.data)      as duree,\n    public.tete_lourde(a.data)       as lourde\n', '    public.duree_du_rdv(a.data)      as duree\n']] },
  { nom: 'Opale propose sans sa tete', fichier: WA,
    r: [['laPlaceTient(agenda!.agenda, { date: p.date, time: p.heure, serviceIds: p.gestes, ...(lourdeVenue ? { lourde: true } : {}) }, ms, p.date === aujourdhui)', 'laPlaceTient(agenda!.agenda, { date: p.date, time: p.heure, serviceIds: p.gestes }, ms, p.date === aujourdhui)']] },
  { nom: 'Opale ne lit pas les places du jour', fichier: WA,
    r: [['    ...(places ? { places } : {}),\n', '']] },
  { nom: 'Opale n ecrit pas les locks dits', fichier: WA,
    r: [['            ...(a.locks ? { locksAnnonces: a.locks } : {}),\n', '']] },
  { nom: 'le site n ecrit pas la tete annoncee', fichier: DS,
    r: [['      ...(lockCount > 0 ? { locksAnnonces: lockCount } : {}),\n', '']] },
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
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-deux-tetes-'));
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
      entryPoints: [path.join(racine, 'scripts/verifie-deux-tetes-chez-team.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      plugins: [greffon],
    });
    const env = { ...process.env };
    delete env.DEUX_TETES_PANNE_FICHIER;
    delete env.DEUX_TETES_PANNE_COPIE;
    if (panne) {
      const copie = path.join(dossier, 'copie', panne.fichier);
      mkdirSync(path.dirname(copie), { recursive: true });
      writeFileSync(copie, texte);
      env.DEUX_TETES_PANNE_FICHIER = panne.fichier;
      env.DEUX_TETES_PANNE_COPIE = copie;
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
