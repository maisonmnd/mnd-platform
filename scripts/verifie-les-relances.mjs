import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES RELANCES DES FACTURES, EPROUVEES — `node scripts/verifie-les-relances.mjs`.

   La maquette « Les relances » (18 octobre 2026) : les regles pures et la
   VRAIE tournee du serveur (relances-factures), rejouee contre une base simulee ;
   depuis le 21 novembre 2026, les relances programmees (« Le point »).

   `--prouve` relance le harnais sur chaque panne ci-dessous, et chaque panne
   doit le faire crier par une epreuve. Les pannes vivent dans la memoire du
   paquet (un greffon d'esbuild remplace le texte importe) et dans une copie
   hors du depot pour les fichiers que le harnais LIT (RELANCES_PANNES) : rien
   de l'arbre partage ne bouge.

   Le paquet s'ecrit sous node_modules/.cache, dans un dossier par lancement :
   le harnais y retrouve esbuild pour transpiler ce qu'il extrait des fonctions
   Deno, et deux lancements ne se marchent pas dessus. */

const racine = path.resolve(import.meta.dirname, '..');
const SRV = 'supabase/functions/relances-factures/index.ts';
const PUR = 'src/shared/relances-pur.ts';

/* Une regle du bloc copie se casse des deux cotes : sinon seule la
   comparaison des copies crierait, et l'on ne prouverait rien de l'epreuve. */
const desDeux = (avant, apres) => [[PUR, avant, apres], [SRV, avant, apres]];

const PANNES = [
  /* La tournee (relances-factures seule) */
  { nom: 'la suite eteinte ne laisse partir aucune programmee', r: [[SRV, "  if (!automatique && programmeesDuJour.length === 0) return { version: VERSION, relances: 'eteintes', programmees: 0 };", "  if (!automatique) return { version: VERSION, relances: 'eteintes', programmees: 0 };"]] },
  { nom: 'la tournee ne lit plus les plans', r: [[SRV, ".gte('data->relanceProgrammee->>le', '0')", ".gte('data->relanceProgrammee->>le', '9')"]] },
  { nom: 'arrete sur l une, l autre part', r: [[SRV, 'return !!p && !plansArretes.has(p.plan) && !plansSautesAujourdhui.has(p.plan) && relanceProgrammeeDuJour(p, aujourdhui);', 'return !!p && !plansSautesAujourdhui.has(p.plan) && relanceProgrammeeDuJour(p, aujourdhui);']] },
  { nom: 'la facture d un plan reste dans la suite automatique', r: [[SRV, '      if (planVivant(f)) continue;\n', '']] },
  { nom: 'sa reponse n arrete rien', r: [[SRV, "    if (aReponduDepuis(((msgs ?? []) as { data: { sens?: string; quand?: string } }[]).map((m) => m.data), plan.le)) { saute('programmee-a-repondu'); continue; }\n", '']] },
  { nom: 'reglee, elle part quand meme', r: [[SRV, "    if (!(reste > 0)) { saute('programmee-reglee'); continue; }\n", '']] },
  { nom: 'le lien paye ne compte pas', r: [[SRV, '    const reste = Math.max(0, resteDeLaFacture(f) - (payeParPiece.get(f.id) ?? 0));\n    if (!(reste > 0)) { saute(\'programmee-reglee\'); continue; }', "    const reste = resteDeLaFacture(f);\n    if (!(reste > 0)) { saute('programmee-reglee'); continue; }"]] },
  { nom: 'en pause, elle part', r: [[SRV, "    if (f.relancesPause) { saute('programmee-en-pause'); continue; }\n", '']] },
  { nom: 'la piece d une formule se relance sur son reste', r: [[SRV, "    if (estUnePieceDeFormule(f, piecesDeFormule)) { saute('programmee-piece-de-formule'); continue; }\n", '']] },
  { nom: 'deux factures du plan, deux messages', r: [[SRV, '    const cle = `${plan.plan}|${tel}`;', '    const cle = `${f.id}|${tel}`;']] },
  { nom: 'des jours differents partent sans le modele du point', r: [[SRV, "    if (forme === 'attend') { saute('programmee-attend-le-modele'); continue; }\n", '']] },
  { nom: 'deux plans, deux relances au meme numero le meme jour', r: [[SRV, "    if (relanceesAujourdhui.has(tel)) { saute('programmee-deja-relancee-aujourdhui'); continue; }\n", '']] },
  { nom: 'l automatique oublie le numero deja relance', r: [[SRV, "    if (relanceesAujourdhui.has(tel)) { saute('deja-relancee-aujourdhui'); continue; }\n", '']] },
  { nom: 'une ligne deja posee s ecrase', r: [[SRV, "    if (prise(idEnvoi)) { saute('programmee-deja-posee'); continue; }\n", '']] },
  { nom: 'deux numeros, un seul identifiant', r: [[SRV, 'idDeLaRelanceProgrammee((numerosDuPlan.get(g.plan.plan)?.size ?? 1) > 1 ? `${g.plan.plan}-${g.fiche.id}` : g.plan.plan, aujourdhui);', 'idDeLaRelanceProgrammee(g.plan.plan, aujourdhui);']] },
  { nom: 'le rang n est plus la place du jour dans le plan', r: [[SRV, 'n: plan.jours.indexOf(aujourdhui) + 1, forme,', 'n: 1, forme,']] },
  { nom: 'la ligne ne dit plus son plan', r: [[SRV, ', programmee: plan.plan },', ' },']] },
  { nom: 'le bilan ne compte plus les programmees', r: [[SRV, '    if (partie) programmeesParties++;', '    void partie;']] },
  { nom: 'le chemin commun oublie la porte d avance', r: [[SRV, '    const dAvance = laPorteDAvance(aDeposer, avanceDuDepot);', '    const dAvance = null as ReturnType<typeof laPorteDAvance>;']] },
  /* Les regles pures copiees (le Trone et la fonction, ensemble) */
  { nom: 'le plan part le dimanche', r: desDeux('  !!p && !p.arreteLe && !estUnDimanche(aujourdhui) && p.jours.includes(aujourdhui)', '  !!p && !p.arreteLe && p.jours.includes(aujourdhui)') },
  { nom: 'un jour saute part', r: desDeux("p.jours.includes(aujourdhui) && !(p.sautes ?? []).includes(aujourdhui);", 'p.jours.includes(aujourdhui);') },
  { nom: 'les jours du plan gardent le dimanche', r: desDeux('    const j = horsDuDimanche(jourPlusR(debut, k * p));', '    const j = jourPlusR(debut, k * p);') },
  { nom: 'cinq relances programmees', r: desDeux('export const RELANCES_PROGRAMMEES_AU_PLUS = 4;', 'export const RELANCES_PROGRAMMEES_AU_PLUS = 5;') },
  { nom: 'un plan sans jour se croit', r: desDeux('  if (!jours.length) return null;\n  return {\n    plan: r.plan.trim().slice(0, 60), jours, le: r.le,', '  return {\n    plan: r.plan.trim().slice(0, 60), jours, le: r.le,') },
  { nom: 'un plan sans date de programmation se croit', r: desDeux("if (!r || typeof r.plan !== 'string' || !r.plan.trim() || typeof r.le !== 'string') return null;", "if (!r || typeof r.plan !== 'string' || !r.plan.trim()) return null;") },
  /* Les gestes du Trone (hors du bloc copie) */
  { nom: 'sauter ne saute rien', r: [[PUR, '  return prochaine ? { ...p, sautes: [...new Set([...(p.sautes ?? []), prochaine])].sort() } : p;', '  return p;']] },
  { nom: 'sauter oublie aujourd hui', r: [[PUR, '  const prochaine = joursAVenirDuPlan(p, aujourdhui, true)[0];\n  return prochaine ?', '  const prochaine = joursAVenirDuPlan(p, aujourdhui)[0];\n  return prochaine ?']] },
  { nom: 'decaler avant demain', r: [[PUR, '  if (jour <= aujourdhui || (p.jours.includes(jour) && jour !== prochaine)) return p;', '  if (p.jours.includes(jour) && jour !== prochaine) return p;']] },
  { nom: 'decaler sur un autre jour du plan', r: [[PUR, '  if (jour <= aujourdhui || (p.jours.includes(jour) && jour !== prochaine)) return p;', '  if (jour <= aujourdhui) return p;']] },
  { nom: 'decaler au dimanche', r: [[PUR, '  const jour = horsDuDimanche(au);', '  const jour = au;']] },
  { nom: 'arreter n arrete rien', r: [[PUR, '({ ...p, arreteLe: quand });', '({ ...p });']] },
];

const lisLF = (rel) => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
/* Le texte de chaque fichier touche par la panne, apres elle. */
const applique = (panne) => {
  const textes = new Map();
  for (const [fichier, avant, apres] of panne.r) {
    const t = textes.get(fichier) ?? lisLF(fichier);
    if (!t.includes(avant)) throw new Error(`panne introuvable : ${panne.nom} (${fichier} : ${avant.slice(0, 60)})`);
    textes.set(fichier, t.replace(avant, () => apres));
  }
  return textes;
};

const cache = path.join(racine, 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(cache, 'verifie-les-relances-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    const textes = panne ? applique(panne) : new Map();
    const parChemin = new Map([...textes].map(([f, t]) => [path.normalize(path.join(racine, f)), t]));
    const greffon = {
      name: 'panne',
      setup(b) {
        b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
          const t = parChemin.get(path.normalize(args.path));
          return t === undefined ? undefined : { contents: t, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
        });
      },
    };
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-relances.harnais.ts')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: sortie,
      logLevel: 'error',
      external: ['esbuild'],
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      plugins: [greffon],
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    const env = { ...process.env };
    delete env.RELANCES_PANNES;
    if (textes.size) {
      const copies = {};
      for (const [f, t] of textes) {
        const copie = path.join(dossier, 'copie', f);
        mkdirSync(path.dirname(copie), { recursive: true });
        writeFileSync(copie, t);
        copies[f] = copie;
      }
      env.RELANCES_PANNES = JSON.stringify(copies);
    }
    return spawnSync(process.execPath, [sortie], { cwd: racine, env, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
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
    console.log(`${crie ? 'CRIE ' : 'MUETTE'} ${p.nom}${epreuve ? `  (${epreuve.slice(6).trim()})` : r.status !== 0 ? '  (le harnais tombe)' : ''}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
