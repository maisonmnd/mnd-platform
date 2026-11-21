import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* DEMANDER A PERLE, EPROUVE - 21 novembre 2026 (sur le modele de verifie-le-rendez-vous-suggere).
   `node scripts/verifie-demander-a-perle.mjs` : le banc, dans un processus
   fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. Le banc tourne a l'heure de Chine, comme l'ordinateur
   du bureau : rien de Perle ne doit suivre l'heure du poste. */

process.env.TZ = 'Asia/Shanghai';

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-demander-a-perle');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-demander-a-perle.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
      loader: { '.css': 'empty', '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.webp': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, location: { href: '', hash: '' }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
globalThis.document = { body: { dataset: {} }, documentElement: { dataset: {}, style: {} }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/perle-pur.ts';
const ECRAN = 'src/apps/trone/routes/pilotage/DemanderAPerle.tsx';
const DONNEES = 'src/apps/trone/routes/pilotage/perle-donnees.ts';
const ROUTES = 'src/apps/trone/routes/index.tsx';
const PANNES = [
  ['le plan garde une lecture inconnue', PUR, '    if (!NOMS_DES_LECTURES.includes(l.nom as NomDeLecture)) continue;\n', ''],
  ['le plan depasse quatre lectures', PUR, '    if (lectures.length >= LECTURES_MAX) break;\n', ''],
  ['le plan garde les doublons', PUR, '    if (vues.has(cle)) continue;\n', ''],
  ['une reponse d avance survit aux lectures', PUR, "  return lectures.length ? { reponse: '', lectures } : { reponse, lectures: [] };", '  return { reponse, lectures };'],
  ['une date mal formee passe', PUR, "(typeof v === 'string' && ISO_JOUR.test(v.trim()) && !Number.isNaN(Date.parse(`${v.trim()}T12:00:00Z`)) ? v.trim() : undefined);", "(typeof v === 'string' ? v.trim() : undefined);"],
  ['Perle peut envoyer et encaisser', PUR, "  'Tu lis et tu réponds, tu ne fais rien : tu n’envoies aucun message, tu ne poses ni ne déplaces aucun rendez-vous, tu ne déplaces jamais d’argent. Si on te demande d’agir, dis que tu ne le fais pas et nomme l’écran du Trône où la direction le fait.',\n", ''],
  ['Perle peut inventer un chiffre', PUR, "  'N’invente AUCUN chiffre ni aucun fait : tu n’utilises que les faits qu’on te donne. S’il en manque un, dis-le en une phrase, et dis dans quel écran du Trône le trouver.',\n", ''],
  ['la question part entiere', PUR, "{ role: 'user', content: o.question.trim().slice(0, 1200) }],\n    schema: SCHEMA_DU_PLAN,", "{ role: 'user', content: o.question }],\n    schema: SCHEMA_DU_PLAN,"],
  ['le fil d avant commence par Perle', PUR, "  while (gardes.length && gardes[0].role !== 'user') gardes.shift();\n", ''],
  ['les faits ne sont plus bornes', PUR, '    if (texte.length > part) {', '    if (false) {'],
  ['la coupe tombe au milieu d une ligne', PUR, "coupe.slice(0, Math.max(coupe.lastIndexOf('\\n'), 200))", 'coupe'],
  ['le tiret cadratin reste', PUR, ".replace(CADRATIN, ', ')", ''],
  ['la fenetre des rendez-vous n est plus bornee', PUR, '  return { du, au: au > borne ? borne : au };\n}\n\n/** LA FENÊTRE DES DÉPENSES', '  return { du, au };\n}\n\n/** LA FENÊTRE DES DÉPENSES'],
  ['le prenom seul designe une cliente dans la question', PUR, '    if (!vus) continue;\n', ''],
  ['une initiale retrouve n importe quel mot', PUR, 'mots.some((m, i) => i > 0 && m.startsWith(d))', 'true'],
  ['un rituel honore reste au fauteuil', PUR, "    .filter((r) => r.status === 'confirmé' && r.heureMin <= minutes", '    .filter((r) => r.heureMin <= minutes'],
  ['En direct tait ce qui reste a encaisser', PUR, '  if (f.aEncaisser.n > 0) {', '  if (false) {'],
  ['En direct propose des places un jour ferme', PUR, '  if (f.ferme) {', '  if (false) {'],
  ['la porte s ouvre a l equipe', ROUTES, "export const ROUTES_DIRECTION = ['/journal', '/pourboires', '/mtn', '/demander'];", "export const ROUTES_DIRECTION = ['/journal', '/pourboires', '/mtn'];"],
  ['la question part avec le nom complet', ECRAN, 'const pourElle = perle.pourClaude(q);', 'const pourElle = q;'],
  ['les tours d avant partent avec les noms', ECRAN, "{ role: 'user' as const, content: perle.pourClaude(e.question) },", "{ role: 'user' as const, content: e.question },"],
  ['l ecran oublie sa garde', ECRAN, "const direction = moi?.role === 'souverain' || moi?.role === 'gerant';", 'const direction = true;'],
  ['les fiches d essai entrent dans les faits', DONNEES, 'const [toutesLesFiches] = useClientsDeLaMaison();', 'const [toutesLesFiches] = useClients();'],
  ['un numero part dans les faits', DONNEES, 'texte: sansCoordonnees(texte)', 'texte'],
  ['Perle lit l heure du poste', DONNEES, 'useMemo(() => momentDuSalon(tick), [tick])', 'useMemo(() => ({ jour: todayISO(), minutes: new Date(tick).getHours() * 60 }), [tick])'],
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
      if (texte.split(a).length !== 2) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, () => b);
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
  console.log(`\n${PANNES.length - muettes}/${PANNES.length} pannes criees${intacts ? ', fichiers restaures a l identique' : ', FICHIERS ALTERES'}.`);
  process.exitCode = muettes || !intacts ? 1 : 0;
}
