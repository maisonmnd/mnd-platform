import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LE « + RDV » EN TROIS QUESTIONS, EPROUVE — 24 octobre 2026.
   `node scripts/verifie-le-rdv-fluide.mjs`

   Le banc (`verifie-le-rdv-fluide.harnais.ts`) tourne dans un PROCESSUS
   FILS ; son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). LA FAUTE NE S'ECRIT JAMAIS DANS LE DEPOT :
   elle est servie a esbuild au chargement du fichier, et au banc quand il lit
   une source ; l'empreinte md5 de chaque fichier est comparee avant et apres,
   dans un `finally`. Une faute dont le texte ne se trouve plus (exactement
   une fois) fait echouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const P = 'src/apps/trone/routes/clients/rdv-fluide-pur.ts';
const C = 'src/apps/trone/routes/clients/_shared.tsx';

const FAUTES = [
  /* #1 : les places se jugent au maitre, oublient les fauteuils, ou rouvrent un jour passe. */
  { n: 1, fichier: P, avant: '    master: PERSONNE,', apres: "    master: '',"},
  { n: 1, fichier: P, avant: '    capSimultane: Math.max(0, Math.floor(o.sieges)),\n', apres: '' },
  { n: 1, fichier: P, avant: 'if (o.ouverture.closed || passe) return', apres: 'if (o.ouverture.closed) return' },
  /* #2 : des fauteuils pleins laissent passer, le maitre pris se lit a l'envers. */
  { n: 2, fichier: P, avant: 'if (sieges > 0 && ensemble.length >= sieges) {', apres: 'if (sieges > 0 && ensemble.length > sieges) {' },
  { n: 2, fichier: P, avant: 'ensemble.filter((a) => a.maitre === o.maitre)', apres: 'ensemble.filter((a) => a.maitre !== o.maitre)' },
  /* #3 : un rendez-vous allonge passe sous le plafond. */
  { n: 3, fichier: P, avant: ' || e.dureeMin > e.relu.dureeMin;', apres: ';' },
  /* #3 : un rituel honore relu se rejuge aux fauteuils ; voir les reglements exige d'enregistrer ; le calendrier repasse derriere. */
  { n: 3, fichier: P, avant: " || e.statut === 'annulé' || e.statut === 'honoré') return false;", apres: " || e.statut === 'annulé') return false;" },
  { n: 3, fichier: C, avant: '    if (!rienNaBouge && !save(status)) return;', apres: '    if (!save(status)) return;' },
  { n: 3, fichier: 'src/ds/ds.css', avant: '  position: fixed; z-index: calc(var(--z-modal) + 60);', apres: '  position: fixed; z-index: 1000;' },
  /* #4 : la creation propose un jour passe, une reprise passee ouvre la semaine. */
  { n: 4, fichier: P, avant: 'return !edition && lundi < aujourdhui ? aujourdhui : lundi;', apres: 'return lundi;' },
  /* Depuis le 24 octobre, la semaine s'ouvre sur aujourd'hui, plus sur la reprise : la faute la lui rend. */
  { n: 4, fichier: P, avant: '  return e.dateDuRdv || e.aujourdhui;', apres: '  return e.dateDuRdv || e.reprise || e.aujourdhui;' },
  /* #5 : le moment passe avant les prestations. */
  { n: 5, fichier: P, avant: "  if (!e.quoi) return 'quoi';\n  if (!e.quand) return 'quand';", apres: "  if (!e.quand) return 'quand';\n  if (!e.quoi) return 'quoi';" },
  /* #6 : un numero cherche une prestation. */
  { n: 6, fichier: P, avant: 'if (t.length < 2 || /^[\\d\\s+().-]+$/.test(t)) return [];', apres: 'if (t.length < 2) return [];' },
  /* #7 : le relu se gene lui-meme, le blocage tombe, le moment se devine, une rangee perd sa saisie,
     une place change de maitre, la reprise lit des rendez-vous a venir. */
  { n: 7, fichier: C, avant: ".filter((a) => a.date === iso && a.status !== 'annulé' && a.id !== appt?.id)", apres: ".filter((a) => a.date === iso && a.status !== 'annulé')" },
  { n: 7, fichier: C, avant: "    if (bloque && chosenStatus !== 'annulé') {", apres: '    if (false) {' },
  { n: 7, fichier: C, avant: "onClick={() => save('confirmé')} disabled={!pret || bloque}", apres: "onClick={() => save('confirmé')}" },
  { n: 7, fichier: C, avant: 'const [momentChoisi, setMomentChoisi] = useState(!!appt || !!initial?.time);', apres: 'const [momentChoisi, setMomentChoisi] = useState(true);' },
  { n: 7, fichier: C, avant: '<section className="trc-rdv4__volet" aria-label={titre} hidden={!ouvert}>', apres: '<section className="trc-rdv4__volet" aria-label={titre}>' },
  { n: 7, fichier: C, avant: "      poseLesPrestations(habitude.ids);\n      if (maitreHabituel) setMaster(maitreHabituel);\n      setRang('');", apres: "      setRang('');" },
  { n: 7, fichier: C, avant: '    setJourVu(iso);\n    setMomentChoisi(true);\n  };', apres: "    setJourVu(iso);\n    setMomentChoisi(true);\n    setMaster(branch.masters[0] ?? '');\n  };" },
  { n: 7, fichier: C, avant: "predictNextVisit(tousLesRdv.filter((a) => a.status === 'honoré' && a.id !== appt?.id)", apres: 'predictNextVisit(tousLesRdv.filter((a) => a.id !== appt?.id)' },
  /* #8 : sa date ne saute pas un jour ferme, le plus tot double sa date, son jour oublie, son heure ignoree,
     l egalite des heures, la confirmation decochee perdue au Trone ou a la fonction. */
  { n: 8, fichier: P, avant: '    const iso = premierJour(reprise);', apres: '    const iso = places(reprise).heures.length ? reprise : null;' },
  { n: 8, fichier: P, avant: '  if (tot && !props.some((p) => p.iso === tot)) {', apres: '  if (tot) {' },
  { n: 8, fichier: P, avant: '  if (o.jourHabituel !== null && o.jourHabituel !== undefined) {', apres: '  if (false) {' },
  { n: 8, fichier: P, avant: '  if (!voulue) return heures[0];', apres: '  return heures[0];' },
  { n: 8, fichier: P, avant: ' || (e[1].n === mieux[1].n && e[1].dernier > mieux[1].dernier)', apres: '' },
  { n: 8, fichier: C, avant: "        sansConfirmation: chosenStatus === 'confirmé' && !avecConfirmation ? true : undefined,\n", apres: '' },
  { n: 8, fichier: 'supabase/functions/confirmation-rdv/index.ts', avant: '  const rdvs = candidats.filter((a) => !a.sansConfirmation && !poseApresSonHeure(', apres: '  const rdvs = candidats.filter((a) => !poseApresSonHeure(' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const BANNIERE = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, location: { href: '', hash: '' }, setTimeout: () => 0 };
globalThis.document = { body: { dataset: {}, appendChild() {} }, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, remove() {} }), querySelectorAll: () => [] };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`;

async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-rdv-fluide-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-rdv-fluide.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      plugins: faute ? [{
        name: 'la-faute-remise',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = path.relative(racine, args.path).split(path.sep).join('/');
            if (rel !== faute.fichier) return undefined;
            const contents = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').split(faute.avant).join(faute.apres);
            return { contents, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) };
          });
        },
      }] : [],
      define: {
        'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }),
        __FAUTE__: JSON.stringify(faute ?? null),
      },
      banner: { js: BANNIERE },
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
    return { status: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (!prouve) {
  const r = await banc(null);
  process.stdout.write(r.sortie);
  process.exitCode = r.status ?? 1;
} else {
  let tiennent = 0;
  for (const f of FAUTES) {
    const texte = readFileSync(path.join(racine, f.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(f.avant).length - 1;
    const avant = md5(f.fichier);
    let verdict;
    try {
      if (fois !== 1) {
        verdict = `LA FAUTE NE SE POSE PLUS (${fois} occurrence(s) du texte)`;
      } else {
        const r = await banc(f);
        const ligne = r.sortie.split(/\r?\n/).find((l) => l.startsWith(`ECHEC #${f.n} `));
        verdict = r.status !== 0 && ligne ? `crie (${ligne.slice(0, 110)})` : `NE CRIE PAS (statut ${r.status})`;
      }
    } finally {
      if (md5(f.fichier) !== avant) verdict = `LE FICHIER A CHANGE PENDANT LA PREUVE (${verdict})`;
    }
    const ok = verdict.startsWith('crie');
    if (ok) tiennent++;
    console.log(`${ok ? 'OK   ' : 'ECHEC'} faute #${f.n} ${f.avant.slice(0, 60).replace(/[^\x20-\x7e]/g, '?')} : ${verdict}`);
  }
  console.log(`${tiennent}/${FAUTES.length} fautes font crier le banc.`);
  if (tiennent !== FAUTES.length) process.exitCode = 1;
}
