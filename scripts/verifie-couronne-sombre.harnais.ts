/* MA COURONNE LE SOIR, EPROUVEE — `node scripts/verifie-couronne-sombre.mjs`.

   3 octobre 2026, maquette « Ma Couronne, sombre et bilingue » validee. La
   preuve visuelle (chaque texte mesure, le jour compare element par element)
   est le banc `scripts/banc-couronne-sombre.mjs`, qui demande un Chrome. Ce
   harnais-ci tient, sans navigateur, ce qui peut deriver en silence :
     - la nuit est ecrite DEUX fois (telephone sombre / « Sombre » choisi) :
       les deux blocs doivent dire exactement la meme chose ;
     - chaque bouton qui devient cuivre le soir dit aussi la couleur de son
       texte (le 3 octobre, « Choisir » restait ivoire sur cuivre, 2:1) ;
     - aucun indigo TEXTE n'echappe au jeton du soir ;
     - le choix de Profil se lit sous la meme cle avant et apres le chargement. */
import { readFileSync } from 'node:fs';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const sansCom = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const css = readFileSync('src/apps/couronne/couronne.css', 'utf8').replace(/\r\n/g, '\n');

/* 1. Les deux nuits disent la meme chose. */
const corps = (debut: string) => {
  const a = css.indexOf(debut);
  if (a < 0) return null;
  const b = css.indexOf('{', a) + 1;
  const c = css.indexOf('}', b);
  return sansCom(css.slice(b, c)).split('\n').map((l) => l.trim()).filter(Boolean).sort().join('\n');
};
const auto = corps(':root:not([data-mc-theme="clair"])');
const choisi = corps(':root[data-mc-theme="sombre"]');
dit('la nuit du telephone et la nuit choisie existent', [true, true], [!!auto, !!choisi]);
dit('... et disent exactement la meme chose', true, !!auto && auto === choisi);
dit('... sur fond indigo profond, jamais obsidienne', true, !!auto && /--paper: #15173A;/.test(auto) && !/:\s*(#14141B|var\(--color-obsidian\))/i.test(auto ?? ''));

/* 2. Chaque jeton de nuit a sa valeur de jour. */
const jour = corps(':root {\n  --mc-encre') ?? '';
const noms = (t: string) => [...t.matchAll(/(--mc-[\w-]+):/g)].map((m) => m[1]).sort();
dit('chaque jeton --mc- de nuit a sa valeur de jour', [], noms(auto ?? '').filter((n) => !noms(jour).includes(n) && !/^--mc-(success|error|hairline-soft)$/.test(n)));

/* 3. Les boutons pleins disent la couleur de leur texte. */
const regles = [...sansCom(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), corps: m[2] }));
const pleins = regles.filter((r) => /background[^;]*var\(--mc-plein\)/.test(r.corps) && !/:hover/.test(r.sel));
const sansTexte = pleins.filter((r) => !/(?<![-\w])color:\s*var\(--mc-sur-plein\)/.test(r.corps)
  && !regles.some((x) => x.sel.startsWith(r.sel + ' ') && /color:\s*var\(--mc-sur-plein/.test(x.corps)));
dit('chaque fond cuivre du soir porte son texte de nuit', [], sansTexte.map((r) => r.sel));
dit('... ils sont bien la (boutons, jour et heure choisis)', true, pleins.length >= 10);

/* 4. Aucun indigo texte n'echappe au jeton. */
const apres = sansCom(css.slice(css.indexOf(':root[data-mc-theme="sombre"]')));
dit('aucune couleur de texte indigo en dur', [], [...apres.matchAll(/(?<![-\w])color:\s*(var\(--color-indigo[^)]*\)|#1E2150)/gi)].map((m) => m[0]));

/* 5. Le choix de Profil : meme cle avant et apres le chargement. */
const html = readFileSync('couronne.html', 'utf8');
const theme = readFileSync('src/apps/couronne/theme.ts', 'utf8');
const cle = (theme.match(/CLE_DU_THEME = '([^']+)'/) ?? [])[1];
dit('la page et le module lisent la meme cle', true, !!cle && html.includes(`localStorage.getItem('${cle}')`));
dit('Profil propose Auto, Clair, Sombre', true, /\(\['auto', 'clair', 'sombre'\] as const\)\.map/.test(readFileSync('src/apps/couronne/Tabs.tsx', 'utf8')));

console.log(ko === 0 ? '\nMa Couronne tient sa nuit.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
