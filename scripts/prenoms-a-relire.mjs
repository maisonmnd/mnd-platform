/* LES PRÉNOMS À RELIRE — 7 novembre 2026, lecture seule.

   « Les clientes comme Anne-Marie, comme Marie Gisèle, qui ont un prénom
   composé : c'est important que, quand on leur écrit, on écrive toujours,
   dans leur rendez-vous et dans leur messagerie WhatsApp, tout le prénom
   composé » (Yéman). Le Trône devine le prénom d'usage (shared/civilite
   `prenomDevine`) ; le champ « Prénom d'usage » de la fiche le corrige.
   Cette liste dit à Yéman les fiches à regarder :

     1. celles dont le prénom deviné n'est plus le premier mot (« Awa Reine
        KOSSI » : on écrira « Awa Reine », jusqu'ici « Awa ») ;
     2. les douteuses : trois mots ou plus sans NOM en capitales, où la règle
        n'a pas de quoi trancher (« Carla Ada Kossi » : Carla, ou Carla Ada ?) ;
     3. deux mots dont le premier est un prénom qui se compose (« Marie
        Reine » : un prénom composé sans nom, ou Marie et son nom ?).
   Une fiche qui porte déjà son prénom d'usage est réglée : elle est comptée,
   pas listée. Les fiches archivées ne comptent pas.

     node scripts/prenoms-a-relire.mjs            lit la base (mise-en-ligne requete, lecture seule)
     node scripts/prenoms-a-relire.mjs --stdin    lit le JSON des fiches sur l'entrée standard
                                                  ([{ "id", "nom", "usage" }], ou la sortie de requete --montre)

   LA SORTIE VA À L'ÉCRAN, JAMAIS DANS UN FICHIER DU DÉPÔT : elle porte des
   noms de clientes, et le dépôt est public. */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const racine = path.resolve(import.meta.dirname, '..');
const PAGE = 1000;

/* La règle du dépôt, telle quelle : jamais une copie. */
async function laRegle() {
  const dossier = mkdtempSync(path.join(tmpdir(), 'prenoms-a-relire-'));
  try {
    const sortie = path.join(dossier, 'civilite.mjs');
    await build({ entryPoints: [path.join(racine, 'src/shared/civilite.ts')], bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error' });
    return await import(pathToFileURL(sortie).href);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/* Le JSON d'une sortie de `requete --montre` : tout ce qui suit la ligne « N ligne(s) ». */
const jsonDe = (texte) => {
  const i = texte.indexOf('[');
  return i < 0 ? [] : JSON.parse(texte.slice(i));
};

/* Les fiches, par pages de mille (la base peut plafonner une réponse). */
function lisLaBase() {
  const fiches = [];
  for (let decalage = 0; ; decalage += PAGE) {
    const select = `select id, data->>'name' as nom, data->>'prenomUsage' as usage from public.clients `
      + `where coalesce(data->>'archived', '') <> 'true' order by id limit ${PAGE} offset ${decalage}`;
    const r = spawnSync(process.execPath, [path.join(racine, 'scripts/mise-en-ligne.mjs'), 'requete', select, '--montre'], { cwd: racine, encoding: 'utf8' });
    if (r.status !== 0) { console.error(r.stderr || r.stdout || 'la requete n a pas abouti'); process.exit(1); }
    const page = jsonDe(r.stdout);
    fiches.push(...page);
    if (page.length < PAGE) return fiches;
  }
}

const { prenomDevine, PRENOMS_QUI_SE_COMPOSENT } = await laRegle();
const fiches = process.argv.includes('--stdin') ? jsonDe(readFileSync(0, 'utf8')) : lisLaBase();

const mots = (nom) => String(nom ?? '').trim().split(/\s+/).filter(Boolean);
const enCapitales = (m) => /^[\p{Lu}'’-]+$/u.test(m) && (m.match(/\p{Lu}/gu) ?? []).length >= 2;
const composables = new Set(PRENOMS_QUI_SE_COMPOSENT.map((p) => p.toLowerCase()));

const reglees = [];
const changent = [];
const douteuses = [];
const deuxMots = [];
for (const f of fiches) {
  const nom = String(f.nom ?? '').trim();
  if (!nom) continue;
  if (String(f.usage ?? '').trim()) { reglees.push(f); continue; }
  const m = mots(nom);
  const devine = prenomDevine(nom);
  const ligne = `  ${nom}  →  ${devine}   (${f.id})`;
  if (devine !== m[0]) changent.push(ligne);
  else if (m.length >= 3 && !m.slice(1).some(enCapitales)) douteuses.push(ligne);
  else if (m.length === 2 && composables.has(m[0].toLowerCase()) && !enCapitales(m[1])) deuxMots.push(ligne);
}

const section = (titre, lignes) => {
  console.log(`\n${titre} : ${lignes.length}`);
  for (const l of lignes.sort((a, b) => a.localeCompare(b, 'fr'))) console.log(l);
};
console.log(`Les prénoms à relire : ${fiches.length} fiches lues, ${reglees.length} portent déjà leur prénom d'usage.`);
section('1. Le Trône écrira désormais plus que le premier mot', changent);
section('2. Douteuses : trois mots ou plus, sans NOM en capitales (le premier mot reste)', douteuses);
section('3. Deux mots, le premier se compose (Marie, Anne, Jean…) : prénom composé sans nom ?', deuxMots);
console.log('\nPour corriger : la fiche, « La joindre », « Prénom d’usage ». Vide, le Trône garde ce qu’il devine.');
