import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/* COMPARE LE SITE SERVI AU SITE CONSTRUIT, OCTET POUR OCTET — 31 octobre 2026.

   publie.mjs compare déjà le servi à dist-sites/ ; ce banc-ci se lance APRÈS,
   depuis la copie propre qui vient de construire, pour la preuve finale
   que demande chaque « servi » aux sessions sœurs. Il vivait dans les
   brouillons d'une session ; la mise en ligne automatique (scripts/mise-en-ligne.mjs,
   agent « mise-en-ligne ») en a besoin partout.

   Un fichier qui ne diffère que par ses fins de ligne (CRLF de Windows contre
   LF servi) compte comme identique, et le compte le dit à part.

   Usage : node scripts/verifie-le-servi.mjs dist-sites/trone https://<domaine>/trone/ */

const [dist, baseBrute] = process.argv.slice(2);
if (!dist || !baseBrute) {
  console.error('Usage : node scripts/verifie-le-servi.mjs <dossier construit> <adresse servie>');
  process.exit(1);
}
const base = baseBrute.endsWith('/') ? baseBrute : `${baseBrute}/`;

const liste = [];
const parcours = (d) => {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) parcours(p);
    else liste.push(path.relative(dist, p).split(path.sep).join('/'));
  }
};
parcours(dist);

const CR = 13;
const LF = 10;
const sansCR = (b) => {
  const sortie = [];
  for (let i = 0; i < b.length; i++) if (!(b[i] === CR && b[i + 1] === LF)) sortie.push(b[i]);
  return Buffer.from(sortie);
};
const empreinte = (b) => createHash('sha256').update(b).digest('hex');

const t = Date.now();
let identiques = 0;
let auCRLFPres = 0;
const ecarts = [];
const un = async (f) => {
  for (let essai = 0; essai < 3; essai++) {
    try {
      const r = await fetch(`${base}${f.split('/').map(encodeURIComponent).join('/')}?octets=${t}`);
      if (!r.ok) { if (essai === 2) ecarts.push(`${r.status} ${f}`); continue; }
      const servi = Buffer.from(await r.arrayBuffer());
      const local = readFileSync(path.join(dist, f));
      if (empreinte(servi) === empreinte(local)) { identiques++; return; }
      if (empreinte(sansCR(servi)) === empreinte(sansCR(local))) { identiques++; auCRLFPres++; return; }
      if (essai === 2) ecarts.push(`DIFFÉRENT ${f}`);
    } catch (e) {
      if (essai === 2) ecarts.push(`ERREUR ${f} ${e.message}`);
    }
  }
};
for (let i = 0; i < liste.length; i += 16) await Promise.all(liste.slice(i, i + 16).map(un));
console.log(`${identiques}/${liste.length} identiques${auCRLFPres ? ` (dont ${auCRLFPres} au seul CRLF près)` : ''}`);
for (const e of ecarts) console.log(e);
process.exit(ecarts.length ? 1 : 0);
