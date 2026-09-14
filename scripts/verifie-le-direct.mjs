import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/* CE QUE LE TRONE ECOUTE, FACE A CE QUE LA BASE PUBLIE.

   14 septembre 2026. Six tables etaient ecoutees depuis toujours et publiees
   jamais : documents, avances_remboursements, demandes_formule, emprunts,
   entrees_hors_activite, motifs_foyer. Chacune est nee dans une migration qui
   a cree sa table, pose sa RLS et ses index, et oublie la ligne de
   publication. Cinq fois sur soixante-deux, la ligne n a pas ete recopiee.

   RIEN NE LE SIGNALAIT. Un canal sur une table non publiee echoue, et jusqu au
   13 septembre subscribe() ne rendait son verdict a personne : il se taisait.
   L ecriture passait toujours, mais l ecran ne se mettait a jour qu au filet
   d une minute. Le retard est la panne la plus difficile a nommer.

   CE SCRIPT NE LIT PAS LA BASE — il ne peut pas, la publication vit la-bas.
   Il fait la moitie du travail qu on oublie : dresser la liste de ce que le
   depot ECOUTE, et donner la requete qui dit ce que la base PUBLIE.

   Usage :
     node scripts/verifie-le-direct.mjs
       → la liste des tables ecoutees, et la requete a passer.

     node scripts/verifie-le-direct.mjs publiees.txt
       → le meme croisement, fait pour vous. Le fichier peut etre le JSON
         rendu par Supabase, ou une simple liste de noms : on n en garde que
         les identifiants. */

const racine = path.resolve(import.meta.dirname, '..');

const fichiersDe = (dossier) => {
  const out = [];
  for (const e of readdirSync(dossier)) {
    const p = path.join(dossier, e);
    if (statSync(p).isDirectory()) out.push(...fichiersDe(p));
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
};

const ecoutees = new Set();
for (const f of fichiersDe(path.join(racine, 'src'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/bindCollection\([A-Za-z0-9_]+,\s*'([a-z0-9_]+)'/g)) {
    ecoutees.add(m[1]);
  }
  /* `bindDocument` ne nomme pas de table : tous les documents vivent dans
     `documents`, et un seul canal les sert depuis le 14 septembre. */
  if (/bindDocument\(/.test(src)) ecoutees.add('documents');
}

const REQUETE = `select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;`;

const donne = process.argv[2];
if (!donne) {
  console.log(`Le Trone ecoute ${ecoutees.size} tables en direct :\n`);
  console.log([...ecoutees].sort().join('\n'));
  console.log(`\nPassez ceci dans le SQL editor, puis relancez avec le resultat :\n\n${REQUETE}\n`);
  console.log(`  node scripts/verifie-le-direct.mjs publiees.txt`);
  process.exit(0);
}

const brut = readFileSync(path.resolve(donne), 'utf8');
/* On n en garde que les identifiants : le JSON de Supabase, une liste a la
   ligne, ou un copier-coller de tableau font tous l affaire. */
const publiees = new Set((brut.match(/[a-z][a-z0-9_]{2,}/g) ?? [])
  .filter((m) => !['publiee_en_direct', 'tablename', 'select', 'from', 'where', 'and', 'order', 'by', 'public', 'schemaname', 'pubname', 'supabase_realtime'].includes(m)));

const muettes = [...ecoutees].filter((t) => !publiees.has(t)).sort();
const inutiles = [...publiees].filter((t) => !ecoutees.has(t)).sort();

if (inutiles.length) {
  console.log(`Publiees mais non ecoutees (sans consequence) : ${inutiles.join(', ')}\n`);
}

if (muettes.length === 0) {
  console.log(`Les ${ecoutees.size} tables ecoutees sont toutes publiees. Le direct tient.`);
  process.exit(0);
}

console.error('ECOUTEES MAIS NON PUBLIEES — leurs canaux echouent pour toujours :\n');
for (const t of muettes) console.error(`  ${t}`);
console.error(`\nA passer en base :\n`);
console.error(muettes.map((t) => `alter publication supabase_realtime add table public.${t};`).join('\n'));
process.exit(1);
