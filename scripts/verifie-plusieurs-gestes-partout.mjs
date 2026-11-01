import { readFileSync } from 'node:fs';
import path from 'node:path';

/* PLUSIEURS GESTES SUR CHAQUE PORTE DU SITE, EPROUVE — 1er novembre 2026.
   `node scripts/verifie-plusieurs-gestes-partout.mjs` (et `--prouve`).

   « Sur tous les boutons de reserver sur le site, le selecteur multiservice
   doit marcher » (Yeman). Deux trous, bouches dans
   src/apps/revelateur/ilots/Reserver.tsx :
     1. une formule touchee (porte entretien, code d'offre) ou la derniere
        venue refaite ne laissait que « modifier », qui effacait tout :
        « Ajouter un geste » garde les gestes pris et ouvre la composition ;
     2. la reparation, la creation et MND Kids n'offraient que leur
        consultation : « Ajouter un geste a la consultation » ouvre les
        gestes d'entretien du site, comptes dans le panier, la duree, le prix
        et les heures libres.

   Banc de SOURCE (lecture du fichier sans commentaires), essaye en vrai le
   1er novembre 2026 sur le site local. `--prouve` remet chaque faute UNE A
   UNE, en memoire seulement (le fichier n'est jamais ecrit), et exige que le
   banc crie sur le bon constat. Une faute dont le texte ne se trouve pas
   exactement une fois fait echouer la preuve. Sortie ASCII. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const FICHIER = 'src/apps/revelateur/ilots/Reserver.tsx';
const brut = readFileSync(path.join(racine, FICHIER), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

function controles(src) {
  const s = sansCommentaires(src);
  const fonction = (nom) => {
    const i = s.indexOf(`const ${nom} = () => {`);
    if (i < 0) return '';
    return s.slice(i, s.indexOf('\n  };', i));
  };
  const ajouter = fonction('ajouterUnGeste');
  return [
    [1, 'ajouterUnGeste ouvre la composition sans effacer les gestes pris', [true, true, false, true],
      [ajouter.includes('setComposer(true)'), ajouter.includes('setRepondu(false)'), ajouter.includes('setServiceIds'), ajouter.includes('setLaCouleur(false)')]],
    [2, 'apres une formule : « Ajouter un geste a cette venue » branche sur ajouterUnGeste', 1,
      (s.match(/onClick=\{ajouterUnGeste\}>Ajouter un geste à cette venue</g) ?? []).length],
    [3, 'Bon retour : « Ajouter un geste » branche sur ajouterUnGeste, avant « Autre chose »', true,
      /onClick=\{ajouterUnGeste\}>Ajouter un geste<\/button>\s*<button type="button" className="btn btn--lien" onClick=\{autreChose\}>Autre chose/.test(s)],
    [4, 'une consultation recoit les gestes d entretien du site', true,
      /\(agenda && consultation \? prestationsReservables\(agenda, 'entretien'\) : \[\]\)/.test(s)],
    [5, 'le panier, la duree et le prix lisent la consultation ET les gestes ajoutes', [true, true],
      [/const offerts = useMemo\(\(\) => \[\.\.\.prestations, \.\.\.ajouts\]/.test(s), /serviceIds\.map\(\(id\) => offerts\.find\(\(s\) => s\.id === id\)\)/.test(s)]],
    [6, 'le bloc « Avec la consultation » coche avec boutonGeste, comme partout', [true, true],
      [/consultation && groupesDesAjouts\.length > 0 &&/.test(s), /groupesDesAjouts\.map\(\(g\) => \{[\s\S]*?g\.items\.map\(boutonGeste\)/.test(s)]],
    [7, 'les calibres se montrent pour les gestes ajoutes a une consultation', true,
      /const lesCalibres = \(!consultation \|\| ajoutsOuverts \|\| ajoutsPris\) && bandes\.length > 0/.test(s)],
    [8, 'un lien prepare garde aussi les gestes ajoutes a une consultation', true,
      /prepare\.gestes\.filter\(\(id\) => offerts\.some\(\(p\) => p\.id === id\)\)/.test(s)],
  ];
}

const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function banc(src, bavard) {
  const echecs = [];
  for (const [n, nom, attendu, obtenu] of controles(src)) {
    const ok = egal(attendu, obtenu);
    if (!ok) echecs.push(n);
    if (bavard) console.log(`${ok ? 'OK   ' : 'ECHEC'} #${n} ${nom} -> ${JSON.stringify(obtenu)}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}`}`);
  }
  return echecs;
}

const FAUTES = [
  { n: 1, avant: '    setComposer(true);\n    setRepondu(false);\n    setRang(0);', apres: '    setServiceIds([]);\n    setComposer(true);\n    setRepondu(false);\n    setRang(0);' },
  { n: 1, avant: '    setLaCouleur(false);\n    setComposer(true);', apres: '    setComposer(true);' },
  { n: 2, avant: '<p><button type="button" className="btn btn--lien" onClick={ajouterUnGeste}>Ajouter un geste à cette venue</button></p>', apres: '' },
  { n: 3, avant: '<button type="button" className="btn btn--lien" onClick={ajouterUnGeste}>Ajouter un geste</button>\n', apres: '' },
  { n: 4, avant: "(agenda && consultation ? prestationsReservables(agenda, 'entretien') : [])", apres: '([] as PrestationPublique[])' },
  { n: 5, avant: 'serviceIds.map((id) => offerts.find((s) => s.id === id))', apres: 'serviceIds.map((id) => prestations.find((s) => s.id === id))' },
  { n: 6, avant: '{deplie && <div className="gestes">{g.items.map(boutonGeste)}</div>}', apres: '{deplie && <div className="gestes" />}' },
  { n: 7, avant: 'const lesCalibres = (!consultation || ajoutsOuverts || ajoutsPris) && bandes.length > 0', apres: 'const lesCalibres = !consultation && bandes.length > 0' },
  { n: 8, avant: 'prepare.gestes.filter((id) => offerts.some((p) => p.id === id))', apres: 'prepare.gestes.filter((id) => prestations.some((p) => p.id === id))' },
];

if (!prouve) {
  const e = banc(brut, true);
  console.log(e.length === 0 ? 'Plusieurs gestes sur chaque porte : tout tient.' : `${e.length} constat(s) en echec.`);
  process.exitCode = e.length === 0 ? 0 : 1;
} else {
  let criees = 0;
  for (const f of FAUTES) {
    const fois = brut.split(f.avant).length - 1;
    if (fois !== 1) { console.log(`FAUTE INTROUVABLE #${f.n} (${fois} fois) : ${f.avant.slice(0, 60)}`); continue; }
    const e = banc(brut.replace(f.avant, f.apres), false);
    const crie = e.includes(f.n);
    if (crie) criees++;
    console.log(`${crie ? 'OK   ' : 'MUET '} faute #${f.n} ${f.avant.slice(0, 60).replace(/\n/g, ' ')} -> ${crie ? 'crie' : `ne crie pas (echecs ${JSON.stringify(e)})`}`);
  }
  console.log(`${criees}/${FAUTES.length} fautes font crier le banc.`);
  process.exitCode = criees === FAUTES.length ? 0 : 1;
}
