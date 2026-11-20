import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE PETIT SERVICE PARTAGE L'HEURE, EPROUVE (20 novembre 2026).
   `node scripts/verifie-le-petit-service.mjs` lance le harnais ; `--prouve`
   le relance sur chaque panne ci-dessous, et chaque panne doit le faire
   crier par une epreuve. Les pannes vivent dans la memoire du bundle (un
   greffon d'esbuild remplace le texte lu) ou dans une copie hors du depot
   pour les fichiers que le harnais LIT : rien de l'arbre partage ne bouge. */

const racine = path.resolve(import.meta.dirname, '..');
const PUR = 'src/shared/agenda-pur.ts';
const JUGE = 'src/shared/place-du-serveur.ts';
const OP = 'src/shared/opale-pur.ts';
const WA = 'supabase/functions/whatsapp-automate/index.ts';
const SQL = 'supabase/migrations/0240_le_petit_service_partage_l_heure.sql';

const PANNES = [
  { nom: 'un petit service jusqu a une heure et demie', fichier: PUR,
    r: [['dureeMin >= 1 && dureeMin <= PETIT_SERVICE_MIN;', 'dureeMin >= 1 && dureeMin <= 90;']] },
  { nom: 'un petit service seulement sous une heure', fichier: PUR,
    r: [['dureeMin >= 1 && dureeMin <= PETIT_SERVICE_MIN;', 'dureeMin >= 1 && dureeMin < PETIT_SERVICE_MIN;']] },
  { nom: 'il faut deux petits services pour partager', fichier: PUR,
    r: [['=> petitService(dureeA) || petitService(dureeB);', '=> petitService(dureeA) && petitService(dureeB);']] },
  { nom: 'Team ne partage plus avec un petit service', fichier: PUR,
    r: [['(!!nouvelleLourde && !!deja.lourde && !partagentLaPlace(nouvelleDureeMin, deja.dureeMin));', '(!!nouvelleLourde && !!deja.lourde);']] },
  { nom: 'Expert partage avec un petit service', fichier: PUR,
    r: [['  maitre !== MAITRE_QUI_PARTAGE || (!!nouvelleLourde', '  (maitre !== MAITRE_QUI_PARTAGE && !partagentLaPlace(nouvelleDureeMin, deja.dureeMin)) || (!!nouvelleLourde']] },
  { nom: 'creneauxLibres oublie la duree de la venue', fichier: PUR,
    r: [['.filter((a) => bloqueLaVenue(o.master, o.lourde, a, o.durationMin))', '.filter((a) => bloqueLaVenue(o.master, o.lourde, a))']] },
  { nom: 'le petit service prend une place en ligne (les heures)', fichier: PUR,
    r: [['&& !partagentLaPlace(o.durationMin, a.dureeMin)).length;', ').length;']] },
  { nom: 'trois chez Team quand l un est petit', fichier: PUR,
    r: [['if (duMaitre.filter((a) => m < a.debutMin + a.dureeMin && m + o.durationMin > a.debutMin).length >= DEUX_TETES_AU_PLUS) continue;', '']] },
  { nom: 'le petit service prend une place en ligne (le juge)', fichier: JUGE,
    r: [['&& !partagentLaPlace(dureeMin, a.dureeMin)).length >= sieges) {', ').length >= sieges) {']] },
  { nom: 'le juge oublie la duree de la venue', fichier: JUGE,
    r: [['const occupe = chevauchent.some((a) => bloqueLaVenue(m, p.lourde, a, dureeMin))', 'const occupe = chevauchent.some((a) => bloqueLaVenue(m, p.lourde, a))']] },
  { nom: 'vingt minutes de retard decalent la place', fichier: OP,
    r: [["  if (o.arriveeMin - o.rdvMin <= RETARD_SANS_DECALER_MIN) return 'attendue';\n", '']] },
  { nom: 'une arrivee imminente se decale quand meme', fichier: OP,
    r: [["  if (o.arriveeMin < o.maintenantMin + RETARD_AU_PLUS_TOT_MIN) return 'attendue';\n", '']] },
  { nom: 'le mot retard ne se reconnait plus', fichier: OP,
    r: [['const MOTS_DU_RETARD = /retard|', 'const MOTS_DU_RETARD = /en retard de|']] },
  { nom: 'au-dela oublie le petit service', fichier: WA,
    r: [['if (m === MAITRE_QUI_PARTAGE && siens.some((a) => bloqueLaVenue(m, p.lourde, a, fin - debut))) continue;', 'if (m === MAITRE_QUI_PARTAGE && p.lourde && siens.some((a) => a.lourde)) continue;']] },
  { nom: 'le retard libere avant de juger', fichier: WA,
    r: [["    const fait = await metsAReprogrammerWa(sb, r, 'opale', aujourdhui);\n    if (fait === 'non') return `Ce rendez-vous vient de changer : ${plusTard}`;\n", ''],
      ["    const maitre = String(r.data.master ?? '');\n    const gestes = gestesDuRdvWa(r);\n", "    const maitre = String(r.data.master ?? '');\n    const gestes = gestesDuRdvWa(r);\n    const fait = await metsAReprogrammerWa(sb, r, 'opale', aujourdhui);\n    if (fait === 'non') return `Ce rendez-vous vient de changer : ${plusTard}`;\n"]] },
  { nom: 'la base : un petit service jusqu a deux heures', fichier: SQL,
    r: [['select coalesce(p_duree between 1 and 60, false)', 'select coalesce(p_duree between 1 and 120, false)']] },
  { nom: 'la base : la pose compte la tete d une venue petite', fichier: SQL,
    r: [['  if public.petit_service(duree) then\n    lourde_venue := false;\n  end if;\n', '']] },
  { nom: 'la base : le garde compte les petits dans les places', fichier: SQL,
    r: [['  if dessous_places >= places then\n', '  if dessous >= places then\n']] },
  { nom: 'la base : le deplacement compte la tete d une venue petite', fichier: SQL,
    r: [['not (public.tete_lourde(d) and not public.petit_service(duree) and lourde_chez_lui)', 'not (public.tete_lourde(d) and lourde_chez_lui)']] },
  { nom: 'la base : la reprise prend un petit service dans les fauteuils', fichier: SQL,
    r: [["           and not public.petit_service(duree) and not public.petit_service(public.duree_du_rdv(a.data))\n       ) >= sieges then", '       ) >= sieges then']] },
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
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-petit-service-'));
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
      entryPoints: [path.join(racine, 'scripts/verifie-le-petit-service.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      plugins: [greffon],
    });
    const env = { ...process.env };
    delete env.PETIT_SERVICE_PANNE_FICHIER;
    delete env.PETIT_SERVICE_PANNE_COPIE;
    if (panne) {
      const copie = path.join(dossier, 'copie', panne.fichier);
      mkdirSync(path.dirname(copie), { recursive: true });
      writeFileSync(copie, texte);
      env.PETIT_SERVICE_PANNE_FICHIER = panne.fichier;
      env.PETIT_SERVICE_PANNE_COPIE = copie;
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
    let r;
    try { r = await lance(p); } catch (e) { console.log(`INTROUVABLE ${p.nom} : ${String(e?.message ?? e).slice(0, 120)}`); muettes++; continue; }
    const epreuve = (r.stdout ?? '').split('\n').find((l) => l.startsWith('ECHEC'));
    const crie = r.status !== 0 && !!epreuve;
    if (!crie) muettes++;
    console.log(`${crie ? 'CRIE ' : 'MUETTE'} ${p.nom}${epreuve ? `  (${epreuve.slice(6).split(' -> ')[0].trim()})` : r.status !== 0 ? '  (le harnais tombe)' : ''}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
