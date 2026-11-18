import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LES RENDEZ-VOUS CÔTE À CÔTE, ÉPROUVÉS — 18 novembre 2026.
   « Quand les rendez-vous sont à la même heure, il y a un rendez-vous qui se
   cache. Rends-moi tout visible » (Yéman, vue jour du Calendrier).

   Ce banc éprouve :
     1. `voiesDuJour` (shared/voies-pur.ts) : seul, un rendez-vous garde toute
        la largeur ; deux à la même heure se partagent la colonne ; trois en
        prennent trois ; une chaîne réemploie la voie libérée ; deux rendez-vous
        qui se touchent (fin = début) ne se gênent pas ; l'ordre ne dépend pas
        de l'ordre d'arrivée ; une heure illisible reste seule ;
     2. le branchement : la vue jour range ses cartes par `voiesDuJour`, la fin
        tient compte de la hauteur minimale d'une carte, la largeur partagée
        est posée sur la carte.
   L'écran lui-même : `banc-des-rendez-vous-cote-a-cote` (Chrome).
   `--prouve` plante des pannes dans une COPIE des modules (dossier
   temporaire) et exige que chacune fasse crier le banc.
   Lance : node scripts/verifie-les-rendez-vous-cote-a-cote.mjs [--prouve] */

const racine = path.resolve(import.meta.dirname, '..');
const lis = (rel) => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
const d = mkdtempSync(path.join(tmpdir(), 'cote-a-cote-'));
const SOURCES = { voies: 'src/shared/voies-pur.ts', ecran: 'src/apps/trone/routes/clients/Calendrier.tsx' };

async function charge(textes, nom) {
  const dossier = path.join(d, nom);
  mkdirSync(dossier, { recursive: true });
  const f = path.join(dossier, 'voies-pur.ts');
  writeFileSync(f, textes.voies);
  const out = path.join(d, `${nom}.mjs`);
  await build({ entryPoints: [f], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
}

function eprouve(m, textes) {
  const fautes = [];
  const egal = (nom, obtenu, attendu) => {
    const a = JSON.stringify(obtenu); const b = JSON.stringify(attendu);
    if (a !== b) fautes.push(`${nom} : obtenu ${a}, attendu ${b}`);
  };
  const vrai = (nom, cond) => { if (!cond) fautes.push(nom); };
  const h = (hh, mm = 0) => hh * 60 + mm;
  const range = (plages) => Object.fromEntries([...m.voiesDuJour(plages)].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, v]) => [id, `${v.voie}/${v.voies}`]));
  const P = (id, d0, f0) => ({ id, debutMin: d0, finMin: f0 });

  /* ── 1. La règle ── */
  egal('seul, toute la largeur', range([P('a', h(10), h(11))]), { a: '0/1' });
  egal('le cas de Yéman : deux à 10 h chez le même maître, côte à côte',
    range([P('se', h(10), h(12, 20)), P('pa', h(10), h(11))]), { pa: '1/2', se: '0/2' });
  egal('… et le rendez-vous de 8 h 30 qui finit à 10 h reste plein',
    range([P('ek', h(8, 30), h(10)), P('se', h(10), h(12, 20)), P('pa', h(10), h(11))]), { ek: '0/1', pa: '1/2', se: '0/2' });
  egal('trois à la même heure : trois voies', range([P('a', h(9), h(10)), P('b', h(9), h(10)), P('c', h(9), h(10))]), { a: '0/3', b: '1/3', c: '2/3' });
  egal('une chaîne réemploie la voie libérée : deux voies, pas trois',
    range([P('a', h(9), h(10)), P('b', h(9, 30), h(10, 30)), P('c', h(10), h(11))]), { a: '0/2', b: '1/2', c: '0/2' });
  egal('qui se touchent ne se gênent pas', range([P('a', h(9), h(10)), P('b', h(10), h(11))]), { a: '0/1', b: '0/1' });
  egal('deux groupes le même jour : chacun sa largeur',
    range([P('a', h(9), h(10)), P('b', h(9), h(10)), P('c', h(15), h(16))]), { a: '0/2', b: '1/2', c: '0/1' });
  egal('à heure égale, le plus long à gauche', range([P('court', h(10), h(10, 30)), P('long', h(10), h(12))]), { court: '1/2', long: '0/2' });
  const ordre1 = range([P('x', h(10), h(11)), P('y', h(10), h(11)), P('z', h(10, 30), h(11))]);
  const ordre2 = range([P('z', h(10, 30), h(11)), P('y', h(10), h(11)), P('x', h(10), h(11))]);
  egal('l’ordre d’arrivée ne change rien (un rendu ne permute pas deux cartes)', ordre2, ordre1);
  egal('une heure illisible reste seule, pleine largeur', range([P('a', NaN, NaN), P('b', h(9), h(10))]), { a: '0/1', b: '0/1' });
  egal('rien, rien', range([]), {});
  /* Un long rendez-vous chevauche deux courts qui se suivent : 2 voies, les
     deux courts dans la même. */
  egal('un long à côté de deux courts qui se suivent',
    range([P('long', h(9), h(12)), P('c1', h(9), h(10)), P('c2', h(10), h(11))]), { c1: '1/2', c2: '1/2', long: '0/2' });

  /* ── 2. Le branchement ── */
  const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ');
  const ecran = sansCommentaires(textes.ecran);
  vrai('la vue jour range ses cartes par voiesDuJour, colonne par colonne',
    /dayCols\.map\(\(m\) => \{ const voies = voiesDuJour\(m\.appts\.map\(\(a\) => \{ const debutMin = timeToMin\(a\.time\); return \{ id: a\.id, debutMin, finMin: debutMin \+ Math\.max\(apptDurationMin\(a, byId\), CARTE_MIN_MIN\) \}; \}\)\);/.test(ecran));
  vrai('la fin compte la hauteur minimale d’une carte (30 px et 6 px d’écart)', /const CARTE_MIN_MIN = Math\.ceil\(\(\(30 \+ 6\) \/ HOUR_PX\) \* 60\);/.test(ecran));
  vrai('la largeur partagée est posée sur la carte',
    /const largeur = v\.voies > 1 \? \{ left: `calc\(6px \+ \(100% - 12px\) \* \$\{v\.voie\} \/ \$\{v\.voies\}\)`, right: 'auto', width: `calc\(\(100% - 12px\) \/ \$\{v\.voies\} - 4px\)` \} : \{\};/.test(ecran)
    && /style=\{\{ top, height: h, \.\.\.largeur \}\}/.test(ecran));
  /* L'essai réel du 18 novembre : sur une carte courte et partagée, le bouton
     du bas couvrait la ligne du nom. */
  vrai('« Encaisser » ne se pose en bas que sur une carte assez haute, sinon dans la ligne de la prestation',
    /const CARTE_ENCAISSER_PX = 64;/.test(ecran)
    && /\{aEncaisser\(a\) && h < CARTE_ENCAISSER_PX \? \( <button type="button" className="trc-cal__encaisser trc-cal__encaisser--ligne"/.test(ecran)
    && /\{aEncaisser\(a\) && h >= CARTE_ENCAISSER_PX && \(/.test(ecran));
  vrai('partagée et courte : le nom seul (l’heure reste dans l’infobulle)',
    /const courte = v\.voies > 1 && h < CARTE_DEUX_LIGNES_PX;/.test(ecran) && /\{!courte && <>\{a\.time\} ·\{' '\}<\/>\}/.test(ecran)
    && /title=\{`\$\{a\.time\} · \$\{nomDuRdv\(a\)\}/.test(ecran));
  return fautes;
}

const textes = Object.fromEntries(Object.entries(SOURCES).map(([k, rel]) => [k, lis(rel)]));
const prouve = process.argv.includes('--prouve');
let code = 0;
try {
  const fautes = eprouve(await charge(textes, 'vrai'), textes);
  if (!prouve) {
    for (const f of fautes) console.log(`ECHEC ${f}`);
    console.log(fautes.length ? `${fautes.length} échec(s).` : 'Les rendez-vous se rangent côte à côte : aucun ne se cache sous un autre.');
    code = fautes.length ? 1 : 0;
  } else if (fautes.length) {
    console.log('Le banc échoue déjà sur le vrai code : rien à prouver.'); for (const f of fautes) console.log(`  ${f}`); code = 1;
  } else {
    const PANNES = [
      ['tout prend la largeur entière (le défaut d’avant)', 'voies', "for (const g of groupe) out.set(g.id, { voie: g.voie, voies: finDesVoies.length });", 'for (const g of groupe) out.set(g.id, { voie: 0, voies: 1 });'],
      ['une voie libérée ne resert plus', 'voies', 'let voie = finDesVoies.findIndex((f) => f <= p.debutMin);', 'let voie = -1;'],
      ['deux qui se touchent se gênent', 'voies', 'if (p.debutMin >= finDuGroupe) ferme();', 'if (p.debutMin > finDuGroupe) ferme();'],
      ['la voie se lit à l’envers', 'voies', 'let voie = finDesVoies.findIndex((f) => f <= p.debutMin);', 'let voie = finDesVoies.findIndex((f) => f > p.debutMin);'],
      ['l’ordre d’arrivée décide', 'voies', '.sort((a, b) => a.debutMin - b.debutMin || b.finMin - a.finMin || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));', '.sort((a, b) => a.debutMin - b.debutMin);'],
      ['un groupe ne se ferme jamais', 'voies', 'if (p.debutMin >= finDuGroupe) ferme();', ''],
      ['la vue jour ne range plus', 'ecran', 'style={{ top, height: h, ...largeur }}', 'style={{ top, height: h }}'],
      ['la carte courte ne compte plus sa hauteur', 'ecran', 'finMin: debutMin + Math.max(apptDurationMin(a, byId), CARTE_MIN_MIN)', 'finMin: debutMin + apptDurationMin(a, byId)'],
      ['« Encaisser » se pose en bas de toute carte', 'ecran', '{aEncaisser(a) && h >= CARTE_ENCAISSER_PX && (', '{aEncaisser(a) && ('],
      ['la carte courte garde l’heure devant le nom', 'ecran', "{!courte && <>{a.time} ·{' '}</>}", "<>{a.time} ·{' '}</>"],
    ];
    let tenues = 0;
    for (const [nom, cle, avant, apres] of PANNES) {
      if (!textes[cle].includes(avant)) { console.log(`PANNE INTROUVABLE « ${nom} » : « ${avant} » n’est plus dans ${SOURCES[cle]}`); continue; }
      const copie = { ...textes, [cle]: textes[cle].replace(avant, apres) };
      let f;
      try { f = eprouve(await charge(copie, `panne-${tenues}-${nom.length}`), copie); } catch (e) { f = [`ne se construit plus : ${String(e).slice(0, 80)}`]; }
      if (f.length) { tenues++; console.log(`CRIE  ${nom} -> ${f[0]}`); } else console.log(`MUET  ${nom}`);
    }
    console.log(`${tenues}/${PANNES.length} pannes font crier le banc.`);
    code = tenues === PANNES.length ? 0 : 1;
  }
} finally {
  rmSync(d, { recursive: true, force: true });
}
process.exit(code);
