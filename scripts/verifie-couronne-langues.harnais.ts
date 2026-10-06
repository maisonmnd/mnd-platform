/* MA COURONNE EN DEUX LANGUES, EPROUVEE — `node scripts/verifie-couronne-langues.mjs`.

   3 octobre 2026, maquette « Ma Couronne, sombre et bilingue » validee. La
   phrase francaise est la cle du dictionnaire anglais : une cle qui differe
   d'un seul caractere (une apostrophe droite pour une typographique, une
   espace fine) et l'anglais ne parait jamais, sans aucune erreur. Ce harnais
   lit chaque `t('...')` des ecrans et tient la promesse :
     - chaque phrase passee a t() a son anglais ;
     - chaque {variable} du francais se retrouve dans l'anglais, et rien d'autre ;
     - l'anglais n'ecrit ni « salon » ni tiret cadratin, et garde les noms fon ;
     - une meme phrase n'a qu'un seul anglais ;
     - la mecanique : sans traduction, le francais revient (jamais un blanc). */
import { readFileSync, readdirSync } from 'node:fs';
import { EN } from '../src/apps/couronne/i18n/en';
import { t, changeLaLangue, argent, prix } from '../src/apps/couronne/i18n';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu).slice(0, 400)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* 1. La mecanique. */
changeLaLangue('fr');
dit('en francais, la phrase revient telle quelle', 'Bonjour, Awa.', t('Bonjour, {prenom}.', { prenom: 'Awa' }));
changeLaLangue('en');
dit('en anglais, l onglet Profil devient Profile', 'Profile', t('Profil'));
dit('... une phrase sans traduction revient en francais, jamais en blanc', 'Phrase absente du dictionnaire', t('Phrase absente du dictionnaire'));
dit('... les montants se separent a l anglaise', '25,000 F CFA', argent(25000));
changeLaLangue('fr');
dit('... et a la francaise', '25 000 F CFA', argent(25000).replace(/ (?=\d)/g, ' '));

/* 2. Chaque t('...') des ecrans a son anglais. */
const DOSSIER = 'src/apps/couronne';
const fichiers = readdirSync(DOSSIER).filter((f) => /\.(tsx|ts)$/.test(f) && f !== 'i18n.ts');
const lireLitteral = (q: string, corps: string): string => {
  /* Le litteral tel que JavaScript le lit (echappements compris). */
  // eslint-disable-next-line no-new-func
  return new Function(`return ${q}${corps}${q};`)() as string;
};
const appels: { fichier: string; fr: string }[] = [];
for (const f of fichiers) {
  const src = readFileSync(`${DOSSIER}/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of src.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    appels.push({ fichier: f, fr: lireLitteral(m[1], m[2]) });
  }
}
dit('les ecrans passent par t() (plus de 300 phrases)', true, appels.length >= 300);
const manquantes = [...new Set(appels.filter((a) => !(a.fr in EN)).map((a) => `${a.fichier}: ${a.fr}`))];
dit('chaque phrase passee a t() a son anglais', [], manquantes.slice(0, 15));

/* 2 bis. Le francais visible qui n'est pas passe par t() : texte entre deux
   balises JSX, et attributs lus par la cliente. Les noms propres et les noms
   fon passent ; une phrase francaise non, elle resterait francaise en anglais. */
const MOTS_FR = /\b(le|la|les|vous|votre|vos|une|des|du|pour|avec|est|sur|dans|pas|mon|ma|mes)\b/i;
const restes: string[] = [];
for (const f of fichiers.filter((x) => x.endsWith('.tsx'))) {
  const src = readFileSync(`${DOSSIER}/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  for (const m of src.matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ][^<>{}]*)</g)) {
    const txt = m[1].replace(/\s+/g, ' ').trim();
    if (txt.length > 2 && MOTS_FR.test(txt) && !/=>|&&|\|\||===|;/.test(txt)) restes.push(`${f}: ${txt.slice(0, 70)}`);
  }
  for (const m of src.matchAll(/\b(placeholder|aria-label|title|alt)="([^"]+)"/g)) {
    if (MOTS_FR.test(m[2])) restes.push(`${f}: ${m[1]}="${m[2].slice(0, 60)}"`);
  }
}
dit('aucune phrase francaise visible hors de t()', [], restes.slice(0, 20));

/* 2 ter. CE QUI PART A LA MAISON RESTE EN FRANCAIS. Le Trone lit le francais :
   l'alerte du personnel, la note posee sur le rendez-vous et le message
   WhatsApp pre-rempli pour la Maison ne passent jamais par t(), prix(), ni
   par une date qui suit la langue (dayLabelIso / jourDit ; dayLabelIsoFr oui). */
const SUIT_LA_LANGUE = /\bt\(|\bprix\(|\bargent\(|\bjourDit\(|\bdayLabelIso\(|\bdayLabel\(|\bfmtDuration\(/;
const appelEntier = (src: string, debut: number): string => {
  let prof = 0;
  for (let i = src.indexOf('(', debut); i < src.length; i++) {
    if (src[i] === '(') prof++;
    else if (src[i] === ')' && --prof === 0) return src.slice(debut, i + 1);
  }
  return src.slice(debut);
};
const versLaMaison: string[] = [];
let gestesVus = 0;
for (const f of fichiers.filter((x) => x.endsWith('.tsx'))) {
  const src = readFileSync(`${DOSSIER}/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of src.matchAll(/\b(pushNotifyStaff|notes\.push|baseNotes\.push)\(|wa\.me\/\$\{numero\}\?text=/g)) {
    gestesVus++;
    const appel = appelEntier(src, m.index!);
    if (SUIT_LA_LANGUE.test(appel)) versLaMaison.push(`${f}: ${appel.replace(/\s+/g, ' ').slice(0, 90)}`);
  }
}
dit('ce qui part a la Maison reste en francais (alertes, notes, WhatsApp)', [], versLaMaison);
dit('... et ces gestes sont bien trouves (au moins 10)', true, gestesVus >= 10);

/* 2 quater. Les montants que la cliente lit. */
changeLaLangue('en');
dit('prix() en anglais : 25,000', true, /^25,000\b/.test(prix(25000)));
changeLaLangue('fr');
dit('... et en francais : 25 000', true, /^25[\s  ]000\b/.test(prix(25000)));

/* 3. Les variables. */
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const desaccords = Object.entries(EN).filter(([fr, en]) => vars(fr) !== vars(en)).map(([fr, en]) => `${fr} => ${en}`);
dit('chaque {variable} du francais se retrouve dans l anglais', [], desaccords.slice(0, 10));

/* 4. La voix de la Maison. */
dit('l anglais n ecrit jamais « salon »', [], Object.values(EN).filter((en) => /\bsalons?\b/i.test(en)).slice(0, 10));
dit('... ni tiret cadratin', [], Object.values(EN).filter((en) => en.includes('—')).slice(0, 10));
/* Le francais que la cliente lit non plus (3 octobre : quinze « au salon »
   et deux tirets etaient restes dans les ecrans). Un « — » seul, marque d'une
   valeur absente, n'est pas une phrase. */
const lusEnFrancais = [...new Set([...appels.map((a) => a.fr), ...Object.keys(EN)])];
dit('le francais lu par la cliente n ecrit jamais « salon »', [], lusEnFrancais.filter((fr) => /\bsalons?\b/i.test(fr)).slice(0, 10));
dit('... ni tiret cadratin dans une phrase', [], lusEnFrancais.filter((fr) => fr.includes('—') && fr.trim() !== '—').slice(0, 10));
const FON = ['KLƆKLƆ', 'SÍNSIN', 'DÀNDÀN', 'VÈKPÈ', 'Maison MND', 'Ma Couronne', 'mi nyɔ́ ɖɛkpɛ'];
const fonPerdus = Object.entries(EN).flatMap(([fr, en]) => FON.filter((n) => fr.includes(n) && !en.includes(n)).map((n) => `${n} : ${en}`));
dit('les noms fon, la Maison et Ma Couronne restent tels quels', [], fonPerdus.slice(0, 10));
dit('aucune traduction vide', [], Object.entries(EN).filter(([, en]) => !en.trim()).map(([fr]) => fr));

/* 5. Une phrase, un seul anglais (les dictionnaires se reunissent par ecrasement). */
const doublons: string[] = [];
const vus = new Map<string, string>();
for (const f of readdirSync(`${DOSSIER}/i18n`).filter((x) => x.startsWith('en-'))) {
  const src = readFileSync(`${DOSSIER}/i18n/${f}`, 'utf8');
  for (const m of src.matchAll(/^\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1\s*:\s*(['"])((?:\\.|(?!\3)[^\\\n])*)\3/gm)) {
    const fr = lireLitteral(m[1], m[2]); const en = lireLitteral(m[3], m[4]);
    if (vus.has(fr) && vus.get(fr) !== en) doublons.push(`${f}: ${fr}`);
    vus.set(fr, en);
  }
}
dit('une meme phrase n a qu un seul anglais', [], doublons.slice(0, 10));

console.log(ko === 0 ? '\nMa Couronne parle ses deux langues.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
