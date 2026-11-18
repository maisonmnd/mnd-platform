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
   17 novembre 2026, la revue du chantier :
     4. `dateDite` rend le texte de `toLocaleDateString` / `toLocaleTimeString`
        pour les trois jeux d'options du journal et de la salle, cinq fois
        moins cher, et une chaîne vide pour un instant illisible ;
     5. « heures calmes » se tait à 8 h ; `peutPartir` connaît l'envoi
        programmé, par la même règle que l'écran (`traverseLesHeuresCalmes`) ;
     6. le branchement de la revue : la réponse d'une écriture se tait devant
        un direct plus récent (pas devant un écho de l'état d'avant), la
        ligne confirmée rend dépassée la lecture partie avant elle, une
        relecture ratée est une panne, « Pas maintenant » pose sa réponse sur
        une ligne déjà écartée ailleurs, la question « Effacer les N » se
        ferme, chaque avertissement suit sa ligne.
   Le comportement de la synchro elle-même : `verifie-le-direct-pendant-la-lecture`.
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
  programmes: 'src/shared/envois-programmes-pur.ts',
};

async function charge(textes, nom) {
  const dossier = path.join(d, nom);
  const ecris = (rel, t) => { const f = path.join(dossier, rel); mkdirP(path.dirname(f)); writeFileSync(f, t); return f; };
  ecris('salle-des-envois.ts', textes.salle);
  ecris('envois.ts', textes.envois);
  const entree = ecris('entree.ts', "export * from './envois';\nexport { departReel, dansLesHeuresCalmes, peutPartir, traverseLesHeuresCalmes, REGLES_PAR_DEFAUT } from './salle-des-envois';\n");
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
  egal('déposé la nuit pour 8 h, lu à 8 h 20 : plus « heures calmes » (revue)',
    m.departReel({ partA: iso(a(8)), calme: true }, a(8, 20), R), { partA: iso(a(8)), calme: false });
  egal('déposé à 19 h 55 pour 8 h demain, lu à 19 h 56 : « heures calmes » dès le dépôt (revue)',
    m.departReel({ partA: iso(Date.UTC(2026, 10, 16, 7)), calme: true }, a(19, 56), R), { partA: iso(Date.UTC(2026, 10, 16, 7)), calme: true });

  /* ── 4. dateDite : le texte de toLocale…String, un formateur gardé ── */
  const JOUR_COURT = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
  const HEURE_DU_SALON = { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Porto-Novo' };
  const JOUR_SANS_SEMAINE = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
  egal('JOUR_COURT est le jour court du journal', m.JOUR_COURT, JOUR_COURT);
  const jeux = [
    ['jour court', JOUR_COURT, (t) => new Date(t).toLocaleDateString('fr-FR', JOUR_COURT)],
    ['heure du salon', HEURE_DU_SALON, (t) => new Date(t).toLocaleTimeString('fr-FR', HEURE_DU_SALON)],
    ['jour sans semaine', JOUR_SANS_SEMAINE, (t) => new Date(t).toLocaleDateString('fr-FR', JOUR_SANS_SEMAINE)],
  ];
  for (const [nom, opts, ancien] of jeux) {
    let ecartsD = 0; let premierD = '';
    for (let i = 0; i < 2000; i++) {
      const t = debut + Math.floor(((i * 2654435761) % 2 ** 32) / 2 ** 32 * 900 * 86_400_000);
      const x = m.dateDite(t, opts); const y = ancien(t);
      if (x !== y) { ecartsD++; if (!premierD) premierD = `${new Date(t).toISOString()} : ${x} au lieu de ${y}`; }
    }
    vrai(`dateDite (${nom}) rend le texte d’avant sur 2 000 instants${premierD ? ` (${ecartsD} écarts, dont ${premierD})` : ''}`, ecartsD === 0);
  }
  egal('dateDite d’un instant illisible : une chaîne vide', m.dateDite(NaN, JOUR_COURT), '');
  const instants = Array.from({ length: 3000 }, (_, i) => Date.UTC(2032, 0, 1) + i * 3_571_000);
  const mesure = (fn) => { const t0 = performance.now(); for (const x of instants) fn(x); return performance.now() - t0; };
  mesure((t) => new Date(t).toLocaleDateString('fr-FR', JOUR_COURT));
  const vieuxD = Math.min(mesure((t) => new Date(t).toLocaleDateString('fr-FR', JOUR_COURT)), mesure((t) => new Date(t).toLocaleDateString('fr-FR', JOUR_COURT)));
  const neufD = mesure((t) => m.dateDite(t, JOUR_COURT));
  vrai(`dateDite coûte au moins cinq fois moins (neuf ${neufD.toFixed(1)} ms, ancien ${vieuxD.toFixed(1)} ms pour 3 000)`, neufD * 5 <= vieuxD);

  /* ── 5. Qui traverse les heures calmes : une seule règle (revue) ── */
  vrai('la main et l’envoi programmé traversent les heures calmes, pas le reste',
    m.traverseLesHeuresCalmes({ parLaMain: true }) && m.traverseLesHeuresCalmes({ type: 'programme' }) && !m.traverseLesHeuresCalmes({ type: 'confirmation' }));
  egal('peutPartir à 23 h : un envoi programmé part, comme chez le facteur',
    m.peutPartir({ id: 'x', statut: 'en-attente', partA: iso(a(22, 59)), type: 'programme' }, a(23), R), true);
  egal('peutPartir à 23 h : un rappel attend le matin',
    m.peutPartir({ id: 'x', statut: 'en-attente', partA: iso(a(22, 59)), type: 'rappel-j1' }, a(23), R), false);
  vrai('le type écrit dans la salle est celui des envois programmés',
    /export const TYPE_PROGRAMME = 'programme';/.test(textes.programmes) && /const TYPE_PROGRAMME_ICI = 'programme';/.test(textes.salle));

  /* ── 3. Le branchement ── */
  const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ');
  const ecran = sansCommentaires(textes.ecran);
  const journal = sansCommentaires(textes.journal);
  const sync = sansCommentaires(textes.sync);
  const salle = sansCommentaires(textes.salle);
  vrai('departReel et peutPartir lisent la même règle',
    /if \(traverseLesHeuresCalmes\(e\)\) return/.test(salle) && /return traverseLesHeuresCalmes\(e\) \|\| !dansLesHeuresCalmes\(maintenantMs, r\);/.test(salle));
  vrai('le journal se calcule dans un useMemo (les quatre lectures), seulement sur « Partis »',
    /useMemo\(\(\) => \{ if \(onglet !== 'partis'\) return \{[^;]*\}; const p = envoisDeLaPeriode\(ici, filtre\.jour, aujourdhui\);[^}]*lignesDuJournal\(ici, filtre, aujourdhui\)[^}]*envoisDeLaPeriode\(ici, 'semaine', aujourdhui\)[^}]*envoisDeLaPeriode\(ici, '30-jours', aujourdhui\)[^}]*\}; \}, \[ici, filtre, aujourdhui, onglet\]\)/.test(journal)
    && journal.indexOf('const [onglet, setOnglet] = useState') < journal.indexOf("if (onglet !== 'partis')"));
  vrai('le journal n’appelle plus envoisDeLaPeriode hors du useMemo', (journal.match(/envoisDeLaPeriode\(/g) ?? []).length === 3);
  vrai('ni le journal ni la salle ne refont un formateur de date par ligne', !/toLocale(?:Date|Time)?String\(/.test(journal) && !/toLocale(?:Date|Time)?String\(/.test(ecran)
    && /const heure = dateDite\(Date\.parse\(e\.quand\), HEURE_DU_SALON\);/.test(journal));
  vrai('l’écriture du geste rend la ligne écrite', /\.eq\('data->>statut', ligne\.statut\)\.select\('id, data, updated_at'\)/.test(ecran));
  vrai('la ligne écrite s’applique comme le direct, sauf s’il a dit plus récent',
    /const avantLEcriture = repereDuDirect\('envois', ligne\); const \{ data, error \} = await supabase\.from\('envois'\) \.update/.test(ecran)
    && /if \(ecrite\) \{ appliqueCommeLeDirect\('envois', ecrite, avantLEcriture\); return 'fait'; \}/.test(ecran));
  vrai('rien d’écrit : la ligne se relit, une relecture ratée est une panne',
    /const avantLaRelecture = repereDuDirect\('envois', envoisStore\.get\(\)\.find\(\(e\) => e\.id === id\) \?\? ligne\); const \{ data: relue, error: erreurDeRelecture \} = await supabase\.from\('envois'\)\.select\('id, data, updated_at'\)\.eq\('id', id\)\.limit\(1\); if \(erreurDeRelecture\) return 'panne';/.test(ecran)
    && /appliqueCommeLeDirect\('envois', vraie, avantLaRelecture\);/.test(ecran));
  vrai('« Pas maintenant » pose sa réponse sur une ligne déjà écartée ailleurs',
    /if \(!enPlus \|\| dejaDit\(enPlus, vraie\.data\)\) return 'fait';/.test(ecran)
    && /\.update\(\{ data: \{ \.\.\.vraie\.data, \.\.\.enPlus \} \}\)\.eq\('id', id\)\.eq\('data->>statut', vraie\.data\.statut\)/.test(ecran)
    && /\/\(\?:Le\|Par\)\$\/\.test\(k\) \? porte\[k\] !== undefined : porte\[k\] === v/.test(ecran));
  vrai('sync : la réponse d’une écriture se tait si le direct a apporté autre chose que notre écriture et que l’état d’avant',
    /if \(vu && vu\.n > depuis\.n && !memeContenu\(vu\.data, ligne\.data\) && !memeContenu\(vu\.data, depuis\.avant\)\) \{ ecoute\(\{ eventType: 'UPDATE', new: ligne, old: \{\}, confirmee: true, repereSeul: true \}[^;]*; return false; \}/.test(sync)
    && /noteLeDirect\(t, payload\); ecoutesParTable\.get\(t\)\?\.\(payload\);/.test(sync)
    && /if \(!tablesAuRepere\.has\(table\)\) return;/.test(sync));
  vrai('sync : la ligne confirmée (ou devancée) compte comme un geste, une lecture partie avant elle est jetée',
    /ecoute\(\{ eventType: 'UPDATE', new: ligne, old: \{\}, confirmee: true \}/.test(sync)
    && /\) => \{ if \(payload\.confirmee\) \{ generation \+= 1; confirmations \+= 1; derniereConfirmation = Date\.now\(\); if \(relectureRemise\) relisPlusTard\(\); if \(payload\.repereSeul\) return; \} const items = \[\.\.\.store\.get\(\)\];/.test(sync)
    && !/recusPendantLaLecture|noteSiUneLectureVole/.test(sync));
  vrai('sync : la première lecture et la fusion avec la file suivent la même règle',
    (sync.match(/if \(confirmations !== confirmationsAuDepart\)/g) ?? []).length === 3
    && /const \{ items: fusion, aPousser \} = await fusionne\(items\); if \(confirmations !== confirmationsAuDepart\) \{/.test(sync));
  vrai('sync : la lecture jetée se refait une fois, après la rafale',
    /if \(pousseesEnVol > 0 \|\| timer\) relectureDue = true; else relisPlusTard\(\); return; \}/.test(sync)
    && /const attendre = Math\.max\(PUSH_DEBOUNCE_MS, derniereConfirmation \+ 2 \* PUSH_DEBOUNCE_MS - Date\.now\(\)\);/.test(sync)
    && !/setTimeout\(\(\) => void refetch\(true\), PUSH_DEBOUNCE_MS\)/.test(sync));
  vrai('un geste ne fige plus toute la salle', !/enCours !== null/.test(ecran) && /const occupe = toutEnCours \|\| enCours\.has\(e\.id\);/.test(ecran));
  vrai('la ligne occupée le dit', /occupe \? \( <span aria-live="polite"[^>]*>Un instant…<\/span>/.test(ecran));
  vrai('« Effacer » écarte un retenu', /onClick=\{\(\) => void fais\(\[e\.id\], 'ecarter'\)\} > Effacer <\/Button>/.test(ecran));
  vrai('« Effacer les N retenus » demande d’abord', /onClick=\{\(\) => setEffacerTout\(true\)\} ?> Effacer les \{tenus\.length\} retenus/.test(ecran)
    && /fais\(tenus\.map\(\(e\) => e\.id\), 'ecarter', true\)/.test(ecran));
  vrai('la question « Effacer les N » se ferme quand sa liste fond, avant le return null',
    /useEffect\(\(\) => \{ if \(tenus\.length < 2 && !toutEnCours\) setEffacerTout\(false\); \}, \[tenus\.length, toutEnCours\]\);/.test(ecran)
    && ecran.indexOf('setEffacerTout(false); }, [tenus.length') < ecran.indexOf("if (enSalle.length === 0 && facteur !== 'absent') return null;"));
  vrai('un geste sur l’ensemble attend les lignes en vol',
    /const occupeAilleurs = toutEnCours \|\| enCours\.size > 0;/.test(ecran) && (ecran.match(/disabled=\{occupeAilleurs\}/g) ?? []).length === 3);
  vrai('chaque avertissement suit sa ligne : un succès ni un « trop tard » n’effacent la panne d’une autre',
    /setAvis\(\(a\) => new Map\(\[\.\.\.a\]\.filter\(\(\[id, x\]\) => x\.v === 'panne' && !ids\.includes\(id\)\)\)\);/.test(ecran)
    && /if \(neufs\.length\) setAvis\(\(a\) => \{ const n = new Map\(a\); for \(const \[id, x\] of neufs\) n\.set\(id, x\); return n; \}\);/.test(ecran)
    && /\]\.filter\(Boolean\)\.join\(' '\);/.test(ecran) && !/setMot\(/.test(ecran));
  vrai('une panne se tait quand sa ligne a bougé (une autre main a fait le geste)',
    /x\.v === 'panne' && enSalle\.some\(\(e\) => e\.id === id && e\.statut === x\.statut\)/.test(ecran)
    && /const statutDAvant = new Map\(ids\.map\(\(id\) => \[id, envoisStore\.get\(\)\.find\(\(e\) => e\.id === id\)\?\.statut\]\)\);/.test(ecran));
  vrai('« trop tard » s’accorde : un message parti ou touché, des messages partis ou touchés',
    /: trop tard, ce message vient de bouger \(parti, ou touché d’un autre poste\)\./.test(ecran) && /messages avaient déjà bougé \(partis, ou touchés d’un autre poste\)\./.test(ecran));
  vrai('« trop tard » ne dit plus que le message est parti', !/vient de partir|déjà partis|déjà parti\b/.test(ecran) && /vient de bouger/.test(ecran));
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
        ['la main ne traverse plus les heures calmes', 'salle', 'e.parLaMain === true || e.type === TYPE_PROGRAMME_ICI;', 'e.type === TYPE_PROGRAMME_ICI;'],
        ['le journal se recalcule à chaque rendu', 'journal', '}, [ici, filtre, aujourdhui, onglet]);', '}, [ici, filtre, aujourdhui, onglet, Math.random()]);'],
        ['le geste n’applique plus la ligne écrite', 'ecran', "if (ecrite) { appliqueCommeLeDirect('envois', ecrite, avantLEcriture); return 'fait'; }", "if (ecrite) { return 'fait'; }"],
        ['un geste fige de nouveau toute la salle', 'ecran', 'const occupe = toutEnCours || enCours.has(e.id);', 'const occupe = toutEnCours || enCours.size > 0;'],
        ['« Effacer » disparaît', 'ecran', '>\n                    Effacer\n', '>\n                    Ne jamais l’envoyer\n'],
        ['l’heure dite redevient celle du dépôt', 'ecran', 'const depart = tenu ? null : departReel(e, maintenant, regles);', 'const depart = null as ReturnType<typeof departReel>;'],
        /* La revue du 17 novembre 2026. */
        ['« heures calmes » survit à 8 h', 'salle', 'calme: e.calme === true && (t > maintenantMs || dansLesHeuresCalmes(maintenantMs, r)) }', 'calme: e.calme === true }'],
        ['« heures calmes » ne se dit qu’à partir de 20 h', 'salle', 'calme: e.calme === true && (t > maintenantMs || dansLesHeuresCalmes(maintenantMs, r)) }', 'calme: e.calme === true && dansLesHeuresCalmes(maintenantMs, r) }'],
        ['peutPartir oublie l’envoi programmé', 'salle', 'return traverseLesHeuresCalmes(e) || !dansLesHeuresCalmes(maintenantMs, r);', 'return e.parLaMain === true || !dansLesHeuresCalmes(maintenantMs, r);'],
        ['dateDite refait un formateur à chaque appel', 'envois', 'let f = formateursDeDate.get(cle);', 'let f = undefined as Intl.DateTimeFormat | undefined;'],
        ['dateDite lève sur un instant illisible', 'envois', "  if (!Number.isFinite(ms)) return '';\n  const cle = JSON.stringify(options);", '  const cle = JSON.stringify(options);'],
        ['les « Partis » refont un formateur par ligne', 'journal', 'const heure = dateDite(Date.parse(e.quand), HEURE_DU_SALON);', "const heure = new Date(e.quand).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU });"],
        ['le journal se relit sur un onglet fermé', 'journal', "if (onglet !== 'partis') return { periode: [] as typeof ici, compte: COMPTE_VIDE, lignes: [] as typeof ici, surLaSemaine: 0, surTrenteJours: 0 };", ''],
        ['la réponse d’une écriture recule sur le direct', 'ecran', "appliqueCommeLeDirect('envois', ecrite, avantLEcriture)", "appliqueCommeLeDirect('envois', ecrite)"],
        ['le direct ne dit plus de quelle ligne il parle', 'sync', 'noteLeDirect(t, payload);', ''],
        ['un écho de l’état d’avant fait taire la réponse', 'sync', ' && !memeContenu(vu.data, depuis.avant)) {', ') {'],
        ['une lecture partie avant le geste le défait de nouveau', 'sync', '          generation += 1;\n          confirmations += 1;', '          confirmations += 1;'],
        ['une réponse devancée laisse la lecture en vol défaire le direct', 'sync', "      ecoute({ eventType: 'UPDATE', new: ligne, old: {}, confirmee: true, repereSeul: true } as Parameters<EcouteDeTable>[0]);\n      return false;", '      return false;'],
        ['la première lecture recouvre une ligne confirmée', 'sync', '      lectureReussie();\n      if (confirmations !== confirmationsAuDepart) relisPlusTard();\n      return;', '      lectureReussie();\n      return;'],
        ['la fusion avec la file recouvre une ligne confirmée', 'sync', '      if (confirmations !== confirmationsAuDepart) {\n        if (pousseesEnVol', '      if (false) {\n        if (pousseesEnVol'],
        ['la rafale relit la table à chaque réponse', 'sync', '          if (relectureRemise) relisPlusTard();\n', ''],
        ['la relecture ratée redevient « trop tard »', 'ecran', "if (erreurDeRelecture) return 'panne';", ''],
        ['« Pas maintenant » se dit noté sans l’être', 'ecran', "if (!enPlus || dejaDit(enPlus, vraie.data)) return 'fait';", "return 'fait';"],
        ['la question « Effacer les N » survit à sa liste', 'ecran', 'if (tenus.length < 2 && !toutEnCours) setEffacerTout(false);', ''],
        ['un geste sur l’ensemble n’attend plus les lignes', 'ecran', 'const occupeAilleurs = toutEnCours || enCours.size > 0;', 'const occupeAilleurs = toutEnCours;'],
        ['un succès efface la panne d’un autre', 'ecran', 'if (neufs.length) setAvis((a) => { const n = new Map(a); for (const [id, x] of neufs) n.set(id, x); return n; });', 'setAvis(new Map(neufs));'],
        ['un nouveau geste efface la panne d’une autre ligne', 'ecran', "x.v === 'panne' && !ids.includes(id)", 'false'],
        ['une panne survit au geste fait par une autre main', 'ecran', ' && e.statut === x.statut', ''],
        ['« trop tard » redit « vient de partir »', 'ecran', ': trop tard, ce message vient de bouger (parti, ou touché d’un autre poste).', ': trop tard, ce message vient de partir.'],
        ['« trop tard » perd l’accord au singulier', 'ecran', ': trop tard, ce message vient de bouger (parti, ou touché d’un autre poste).', ': trop tard, ce message vient de bouger (partis, ou touchés d’un autre poste).'],
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
