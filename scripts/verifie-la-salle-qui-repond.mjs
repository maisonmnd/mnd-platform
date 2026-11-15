import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA SALLE QUI RÉPOND, ÉPROUVÉE — 15 novembre 2026.
   « Quand j'appuie le bouton Retenir ou Envoyer quand même, rien ne se passe.
   Le bouton, même en appuyant plusieurs fois, ne s'exécute pas. Il finit par
   partir, mais avec beaucoup de retard. Quand j'ai des messages que j'ai
   retenus, me donner la possibilité de les effacer pour ne plus les voir »
   (Yéman). Mesuré en ligne sur Perle › Conversations : la page gelait de 20 à
   52 secondes ; `jourDuSalon` y coûtait près de dix secondes sur cinquante.

   Ce banc éprouve :
     1. `jourDuSalon` (shared/envois.ts) rend EXACTEMENT ce que rendait
        l'ancien calcul, sur des milliers d'instants et quatre fuseaux, et
        coûte au moins cinq fois moins ;
     2. `departReel` (shared/salle-des-envois.ts) dit l'heure à laquelle le
        facteur portera vraiment : les heures calmes retiennent, la main et
        l'envoi programmé passent ;
     3. le branchement : le journal ne se recalcule que quand il change, le
        geste s'applique dès que le serveur l'a écrit, chaque ligne attend
        seule, « Effacer » et « Effacer les N retenus » existent.
   `--prouve` plante des pannes dans une COPIE des modules (dossier
   temporaire, aucun fichier du dépôt touché) et exige que chacune fasse
   crier le banc. Lance : node scripts/verifie-la-salle-qui-repond.mjs [--prouve] */

const racine = path.resolve(import.meta.dirname, '..');
const lis = (rel) => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
const d = mkdtempSync(path.join(tmpdir(), 'salle-qui-repond-'));

const SOURCES = {
  envois: 'src/shared/envois.ts',
  salle: 'src/shared/salle-des-envois.ts',
  ecran: 'src/apps/trone/routes/clients/SalleDesEnvois.tsx',
  journal: 'src/apps/trone/routes/clients/EnvoisAutomatiques.tsx',
  sync: 'src/shared/sync.ts',
};

async function charge(textes, nom) {
  const dossier = path.join(d, nom);
  const ecris = (rel, t) => { const f = path.join(dossier, rel); mkdirP(path.dirname(f)); writeFileSync(f, t); return f; };
  ecris('salle-des-envois.ts', textes.salle);
  ecris('envois.ts', textes.envois);
  const entree = ecris('entree.ts', "export * from './envois';\nexport { departReel, dansLesHeuresCalmes, REGLES_PAR_DEFAUT } from './salle-des-envois';\n");
  const out = path.join(d, `${nom}.mjs`);
  await build({ entryPoints: [entree], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
}
import { mkdirSync } from 'node:fs';
const mkdirP = (p) => mkdirSync(p, { recursive: true });

const ancienJour = (iso, fuseau = 'Africa/Porto-Novo') => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('en-CA', { timeZone: fuseau });
};

function eprouve(m, textes) {
  const fautes = [];
  const egal = (nom, obtenu, attendu) => {
    const a = JSON.stringify(obtenu); const b = JSON.stringify(attendu);
    if (a !== b) fautes.push(`${nom} : obtenu ${a}, attendu ${b}`);
  };
  const vrai = (nom, cond) => { if (!cond) fautes.push(nom); };

  /* ── 1. jourDuSalon : le même texte, moins cher ── */
  const fuseaux = ['Africa/Porto-Novo', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo'];
  let ecarts = 0; let premier = '';
  const debut = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 4000; i++) {
    /* Des instants serrés autour de minuit UTC et des changements d'heure, et d'autres au hasard. */
    const t = i < 2000 ? debut + i * 4 * 3_600_000 + (i % 7) * 59_000 : debut + Math.floor(((i * 2654435761) % 2 ** 32) / 2 ** 32 * 730 * 86_400_000);
    const iso = new Date(t).toISOString();
    for (const f of fuseaux) {
      const a = m.jourDuSalon(iso, f); const b = ancienJour(iso, f);
      if (a !== b) { ecarts++; if (!premier) premier = `${iso} ${f} : ${a} au lieu de ${b}`; }
    }
  }
  vrai(`jourDuSalon rend l'ancien texte sur 16 000 cas${premier ? ` (${ecarts} écarts, dont ${premier})` : ''}`, ecarts === 0);
  egal('00 h 30 à Cotonou reste le jour de Cotonou', m.jourDuSalon('2026-11-14T23:30:00.000Z'), '2026-11-15');
  egal('le fuseau par défaut est celui du salon', m.jourDuSalon('2026-11-14T22:59:59.000Z'), '2026-11-14');
  egal('une date illisible rend une chaîne vide', m.jourDuSalon('pas une date'), '');
  egal('une chaîne vide rend une chaîne vide', m.jourDuSalon(''), '');
  /* Le journal relit les mêmes envois à chaque rendu : quatre passes sur
     3 000 instants neufs (jamais lus plus haut), le meilleur de trois essais. */
  const isos = Array.from({ length: 3000 }, (_, i) => new Date(Date.UTC(2031, 0, 1) + i * 3_571_000 + 17).toISOString());
  const quatrePasses = (fn) => { const t0 = performance.now(); for (let p = 0; p < 4; p++) for (const x of isos) fn(x); return performance.now() - t0; };
  quatrePasses(ancienJour);
  const vieux = Math.min(quatrePasses(ancienJour), quatrePasses(ancienJour), quatrePasses(ancienJour));
  const neuf = quatrePasses(m.jourDuSalon); // la première mesure compte : elle paie les lectures neuves
  vrai(`jourDuSalon coûte au moins cinq fois moins sur le rendu du journal (neuf ${neuf.toFixed(1)} ms, ancien ${vieux.toFixed(1)} ms pour 4 × 3 000)`, neuf * 5 <= vieux);

  /* ── 2. departReel : l'heure à laquelle le facteur portera vraiment ── */
  const R = m.REGLES_PAR_DEFAUT; // 20 h à 8 h, heure du salon (UTC + 1)
  const a = (h, mn = 0) => Date.UTC(2026, 10, 15, h - 1, mn); // h = heure du salon, le 15 novembre 2026
  const iso = (t) => new Date(t).toISOString();
  egal('7 h 44, heure passée, heures calmes : il part à 8 h, et le dit',
    m.departReel({ partA: iso(a(7, 44)), calme: false }, a(7, 50), R), { partA: iso(a(8)), calme: true });
  egal('demandé à la main : il part à son heure, même la nuit',
    m.departReel({ partA: iso(a(7, 44)), calme: false, parLaMain: true }, a(7, 50), R), { partA: iso(a(7, 44)), calme: false });
  egal('un envoi programmé garde son heure exacte, même la nuit',
    m.departReel({ partA: iso(a(6, 30)), type: 'programme' }, a(6, 0), R), { partA: iso(a(6, 30)), calme: false });
  egal('en journée, rien ne change',
    m.departReel({ partA: iso(a(10, 20)), calme: false }, a(10, 12), R), { partA: iso(a(10, 20)), calme: false });
  egal('déposé à 19 h 55 pour 20 h 05 : il attend le matin',
    m.departReel({ partA: iso(a(20, 5)), calme: false }, a(19, 55), R), { partA: iso(Date.UTC(2026, 10, 16, 7)), calme: true });
  egal('déjà marqué « heures calmes » pour 8 h : 8 h, toujours dit calme',
    m.departReel({ partA: iso(a(8)), calme: true }, a(7, 40), R), { partA: iso(a(8)), calme: true });
  egal('sans heure, rien', m.departReel({ partA: undefined }, a(9), R), null);

  /* ── 3. Le branchement ── */
  const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ');
  const ecran = sansCommentaires(textes.ecran);
  const journal = sansCommentaires(textes.journal);
  const sync = sansCommentaires(textes.sync);
  vrai('le journal se calcule dans un useMemo (les quatre lectures)',
    /useMemo\(\(\) => \{ const p = envoisDeLaPeriode\(ici, filtre\.jour, aujourdhui\);[^}]*lignesDuJournal\(ici, filtre, aujourdhui\)[^}]*envoisDeLaPeriode\(ici, 'semaine', aujourdhui\)[^}]*envoisDeLaPeriode\(ici, '30-jours', aujourdhui\)[^}]*\}; \}, \[ici, filtre, aujourdhui\]\)/.test(journal));
  vrai('le journal n’appelle plus envoisDeLaPeriode hors du useMemo', (journal.match(/envoisDeLaPeriode\(/g) ?? []).length === 3);
  vrai('l’écriture du geste rend la ligne écrite', /\.eq\('data->>statut', ligne\.statut\)\.select\('id, data, updated_at'\)/.test(ecran));
  vrai('la ligne écrite s’applique comme le direct', /if \(ecrite\) \{ appliqueCommeLeDirect\('envois', ecrite\); return 'fait'; \}/.test(ecran));
  vrai('rien d’écrit : la ligne se relit et s’applique', /\.select\('id, data, updated_at'\)\.eq\('id', id\)\.limit\(1\);[^;]*;[^;]*; appliqueCommeLeDirect\('envois', vraie\);/.test(ecran));
  vrai('sync exporte appliqueCommeLeDirect, par l’écoute du direct',
    /export function appliqueCommeLeDirect\([^)]*\): void \{ ecoutesParTable\.get\(table\)\?\.\(\{ eventType: 'UPDATE', new: ligne/.test(sync));
  vrai('un geste ne fige plus toute la salle', !/enCours !== null/.test(ecran) && /const occupe = toutEnCours \|\| enCours\.has\(e\.id\);/.test(ecran));
  vrai('la ligne occupée le dit', /occupe \? \( <span aria-live="polite"[^>]*>Un instant…<\/span>/.test(ecran));
  vrai('« Effacer » écarte un retenu', /onClick=\{\(\) => void fais\(\[e\.id\], 'ecarter'\)\} > Effacer <\/Button>/.test(ecran));
  vrai('« Effacer les N retenus » demande d’abord', /onClick=\{\(\) => setEffacerTout\(true\)\} ?> Effacer les \{tenus\.length\} retenus/.test(ecran)
    && /fais\(tenus\.map\(\(e\) => e\.id\), 'ecarter'\)/.test(ecran));
  vrai('l’heure dite est celle du départ réel', /const depart = tenu \? null : departReel\(e, maintenant, regles\);/.test(ecran) && /quandIlPart\(depart, maintenant\)/.test(ecran));
  vrai('les gestes en nombre partent par paquets', /parPaquets\(ids, \(id\) => gesteDeLaSalle\(id, geste, qui, regles\)/.test(ecran));
  return fautes;
}

const textes = Object.fromEntries(Object.entries(SOURCES).map(([k, rel]) => [k, lis(rel)]));
const prouve = process.argv.includes('--prouve');
let code = 0;
try {
  const m = await charge(textes, 'vrai');
  const fautes = eprouve(m, textes);
  if (!prouve) {
    for (const f of fautes) console.log(`ECHEC ${f}`);
    console.log(fautes.length ? `${fautes.length} échec(s).` : 'La salle répond : le journal ne gèle plus la page, le geste se voit tout de suite, les retenus s’effacent.');
    code = fautes.length ? 1 : 0;
  } else {
    if (fautes.length) { console.log('Le banc échoue déjà sur le vrai code : rien à prouver.'); for (const f of fautes) console.log(`  ${f}`); code = 1; } else {
      const PANNES = [
        ['jourDuSalon refait un formateur à chaque appel, sans mémoire', 'envois', [
          ['const deja = joursDejaLus.get(cle);', 'const deja = undefined as string | undefined;'],
          ['const jour = f.format(t);', "const jour = new Date(t).toLocaleDateString('en-CA', { timeZone: fuseau });"],
        ]],
        ['jourDuSalon oublie le fuseau', 'envois', "new Intl.DateTimeFormat('en-CA', { timeZone: fuseau })", "new Intl.DateTimeFormat('en-CA')"],
        ['la mémoire du jour oublie le fuseau', 'envois', 'const cle = `${fuseau}|${iso}`;', 'const cle = iso;'],
        ['departReel oublie les heures calmes', 'salle', 'if (!dansLesHeuresCalmes(des, r)) return', 'if (true) return'],
        ['departReel retient aussi la main', 'salle', "if (e.parLaMain === true || e.type === 'programme')", "if (e.type === 'programme')"],
        ['le journal se recalcule à chaque rendu', 'journal', '}, [ici, filtre, aujourdhui]);', '}, [ici, filtre, aujourdhui, Math.random()]);'],
        ['le geste n’applique plus la ligne écrite', 'ecran', "if (ecrite) { appliqueCommeLeDirect('envois', ecrite); return 'fait'; }", "if (ecrite) { return 'fait'; }"],
        ['un geste fige de nouveau toute la salle', 'ecran', 'const occupe = toutEnCours || enCours.has(e.id);', 'const occupe = toutEnCours || enCours.size > 0;'],
        ['« Effacer » disparaît', 'ecran', '>\n                    Effacer\n', '>\n                    Ne jamais l’envoyer\n'],
        ['l’heure dite redevient celle du dépôt', 'ecran', 'const depart = tenu ? null : departReel(e, maintenant, regles);', 'const depart = null as ReturnType<typeof departReel>;'],
      ];
      let tenues = 0;
      for (const [nom, cle, avantOuPaires, apresSeul] of PANNES) {
        const paires = Array.isArray(avantOuPaires) ? avantOuPaires : [[avantOuPaires, apresSeul]];
        const manque = paires.find(([avant]) => !textes[cle].includes(avant));
        if (manque) { console.log(`PANNE INTROUVABLE « ${nom} » : « ${manque[0]} » n’est plus dans ${SOURCES[cle]}`); continue; }
        const copie = { ...textes, [cle]: paires.reduce((t, [avant, apres]) => t.replace(avant, apres), textes[cle]) };
        let f;
        try { f = eprouve(await charge(copie, `panne-${tenues}-${Math.random().toString(36).slice(2, 7)}`), copie); } catch (e) { f = [`ne se construit plus : ${String(e).slice(0, 80)}`]; }
        if (f.length) { tenues++; console.log(`CRIE  ${nom} -> ${f[0]}`); } else console.log(`MUET  ${nom}`);
      }
      console.log(`${tenues}/${PANNES.length} pannes font crier le banc.`);
      code = tenues === PANNES.length ? 0 : 1;
    }
  }
} finally {
  rmSync(d, { recursive: true, force: true });
}
process.exit(code);
