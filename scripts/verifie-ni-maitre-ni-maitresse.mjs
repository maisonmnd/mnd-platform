/* NI « VOTRE MAÎTRE » NI « VOTRE MAÎTRESSE » — `node scripts/verifie-ni-maitre-ni-maitresse.mjs`.

   2 novembre 2026. P. A. demande dans Ma Couronne pourquoi son rituel ne
   paraît plus, et reçoit « Merci de nous l'avoir dit. Votre maîtresse vous
   répond. » Yéman : « n'utilise plus ces mots, votre maître, votre
   maîtresse ». C'est la Maison qui répond, et c'est « nous ».

   Ce banc lit tout ce qu'une cliente peut lire (Ma Couronne, le site, la
   consultation, les pages Régler, Bilan et Carte, les règles pures qu'elles
   partagent avec le Trône, et les fonctions Edge qui écrivent sur WhatsApp)
   et crie à la première « maître » ou « maîtresse » hors d'un commentaire.
   Le métier reste un métier : l'Académie, le certificat et l'espace
   d'équipe du Trône gardent « Maître Locticien » et « Maîtresse » comme
   titres, ils ne sont pas lus par une cliente.

   PROUVÉ DANS LES DEUX SENS : avant de lire le dépôt, le banc vérifie sur
   des sources fabriquées qu'il voit une faute écrite (chaîne, gabarit, texte
   JSX) et qu'il ne voit ni un commentaire, ni un identifiant sans accent, ni
   « naître » ou « connaître ». */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const racine = process.cwd();
let ko = 0;
const dit = (nom, attendu, obtenu) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* Les commentaires deviennent des blancs (les lignes gardent leur numéro). */
const sansCommentaires = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, avant) => avant + ' '.repeat(m.length - avant.length));

const MOT = /(?<!\p{L})ma[îÎ]tre(?:sse)?s?(?!\p{L})/giu;
export function fautes(source) {
  const lignes = sansCommentaires(source).split('\n');
  const vues = [];
  lignes.forEach((l, i) => { for (const m of l.matchAll(MOT)) vues.push({ ligne: i + 1, mot: m[0] }); });
  return vues;
}

/* ── LE BANC SE PROUVE D'ABORD ── */
dit('une chaine qui dit « votre maîtresse » est vue', 1, fautes("const A = 'Votre maîtresse vous répond.';").length);
dit('un texte JSX qui dit « au Maître » est vu', 1, fautes('<p>Montrez-la au Maître.</p>').length);
dit('un gabarit qui dit « un maître » est vu', 1, fautes('const t = `${x} un maître relit`;').length);
dit('« MAÎTRES » en capitales est vu', 1, fautes('const t = "NOS MAÎTRES";').length);
dit('un commentaire de bloc ne compte pas', 0, fautes('/* la maîtresse rappelle */ const a = 1;').length);
dit('un commentaire de ligne ne compte pas', 0, fautes('const a = 1; // le maître choisit').length);
dit('un commentaire JSX ne compte pas', 0, fautes('{/* LA MAÎTRESSE NE SE DIT PAS ICI */}').length);
dit('un identifiant sans accent ne compte pas', 0, fautes('const maitre = a.maitre; maitresPermis(x);').length);
dit('« naître », « connaître », « disparaître » ne comptent pas', 0, fautes("const t = 'Voyez-la renaître, vous connaîtrez la durée, sans disparaître.';").length);
dit('une adresse avec // ne coupe pas la ligne', 1, fautes("const u = 'https://x.y/'; const t = 'votre maître';").length);

/* ── CE QU'UNE CLIENTE LIT ── */
const DOSSIERS = ['src/apps/couronne', 'src/apps/revelateur', 'src/apps/consultation', 'src/apps/regler', 'src/apps/bilan', 'src/apps/carte'];
const FICHIERS = [
  'src/shared/entre-deux-pur.ts', 'src/shared/gerard-entre-deux-pur.ts', 'src/shared/gerard-pur.ts',
  'src/shared/automate-wa.ts', 'src/shared/reception-wa-pur.ts', 'src/shared/phrase-de-rendez-vous-pur.ts',
];
/* Ce qui reste permis, et pourquoi. */
const PERMIS = [
  /* une note posée sur le RDV, lue au Trône seulement */
  { fichier: 'src/apps/couronne/Booking.tsx', fragment: 'Maîtres multiples · ' },
  /* la règle elle-même, dans la consigne du rédacteur des bilans */
  { fichier: 'supabase/functions/bilan-redige/index.ts', fragment: 'JAMAIS « votre maître », « votre maîtresse »' },
];
/* Les fonctions qui ne parlent qu'à l'équipe : le métier s'y nomme. Toute
   autre fonction est lue, y compris celles qui naîtront demain. */
const FONCTIONS_DE_L_EQUIPE = new Set(['suggest-client', 'assistants-maison', 'conseil-du-matin', 'dictee-au-propre']);

const lus = [];
const parcours = (d) => {
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) parcours(p);
    else if (/\.(tsx?|mjs|js|html)$/.test(n)) lus.push(p);
  }
};
for (const d of DOSSIERS) if (existsSync(path.join(racine, d))) parcours(path.join(racine, d));
for (const f of FICHIERS) if (existsSync(path.join(racine, f))) lus.push(path.join(racine, f));
const fonctions = path.join(racine, 'supabase/functions');
for (const n of readdirSync(fonctions)) {
  if (FONCTIONS_DE_L_EQUIPE.has(n)) continue;
  const p = path.join(fonctions, n, 'index.ts');
  if (existsSync(p)) lus.push(p);
}

const trouvees = [];
for (const p of lus) {
  const rel = path.relative(racine, p).split(path.sep).join('/');
  const texte = readFileSync(p, 'utf8');
  const lignes = texte.split('\n');
  for (const f of fautes(texte)) {
    const ligne = lignes[f.ligne - 1];
    if (PERMIS.some((x) => x.fichier === rel && ligne.includes(x.fragment))) continue;
    trouvees.push(`${rel}:${f.ligne} « ${ligne.trim().slice(0, 110)} »`);
  }
}
dit(`aucune cliente ne lit « maître » ni « maîtresse » (${lus.length} fichiers lus)`, [], trouvees);
dit('le banc a bien lu Ma Couronne, le site et les fonctions', true,
  lus.some((p) => p.includes('EntreDeux.tsx')) && lus.some((p) => p.includes('revelateur')) && lus.some((p) => p.includes(path.join('whatsapp-webhook', 'index.ts'))));

if (ko) { console.log(`\n${ko} ECHEC(S).`); process.exit(1); }
console.log('\nTout est juste.');
