/* LA FOURCHETTE DU MODÈLE, ÉPROUVÉE — 16 octobre 2026.

   « Je ne veux plus que les clients voient leur nombre précis de locks, juste
   la marge du modèle » (Yéman). Le compte exact reste au Trône ; la cliente lit
   son calibre et la tranche qui le définit (« Micro · de 251 à 350 locks »).

   CE QUI EST ÉPROUVÉ :
     1. les bornes d'une tranche : plancher = plafond du dessous + 1, pas de
        plancher pour la première, pas de plafond pour la dernière ;
     2. la tranche dite est celle que la Maison FACTURE, marge comprise ;
     3. le bilan, qui part chez la cliente, dit le modèle et jamais le compte ;
     4. LA RÈGLE, dans le code de Ma Couronne et de son aperçu au Trône : le
        compte d'une tête n'entre dans aucun texte affiché (ni accolade JSX, ni
        variable d'une phrase traduite, ni gabarit « … locks »). Il ne sert qu'à
        trouver le calibre et le prix. */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { bornesDuModele, fourchetteDite, modeleDit, MODEL_BANDS_SEED, type ModelBand } from '../src/shared/pricing';
import { contexteDuBilan } from '../src/shared/bilan-assistant-pur';
import { EN_TABS } from '../src/apps/couronne/i18n/en-tabs';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
/* Lancé depuis la racine du dépôt (le paquet construit vit ailleurs). */
const racine = process.cwd();
/* Commentaires effacés AVANT de lire : une note qui cite l'ancien code ne doit
   ni faire crier le banc ni le faire taire. Les chaînes sont sautées : un
   « 'image/*' » ouvrirait sinon un faux commentaire qui avalerait la suite
   (EntreDeux.tsx en porte un). */
const sansCommentaires = (f: string) => sansCommentairesDe(readFileSync(path.join(racine, f), 'utf8'));
function sansCommentairesDe(src: string): string {
  let out = '';
  for (let i = 0; i < src.length;) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const fin = src.indexOf('*/', i + 2); i = fin < 0 ? src.length : fin + 2; continue; }
    if (c === '/' && src[i + 1] === '/' && (i === 0 || /[\s;{}(),]/.test(src[i - 1]))) { while (i < src.length && src[i] !== '\n') i++; continue; }
    /* Une chaîne simple s'arrête au bout de la ligne : une apostrophe de texte
       JSX (« aujourd'hui ») n'avale ainsi qu'une ligne, jamais le fichier. */
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; if (c !== '`' && src[j] === '\n') break; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

/* Le barème de la Maison (sept calibres, Galaxy sans plafond). */
const B = MODEL_BANDS_SEED;
const par = (nom: string) => B.find((b) => b.name === nom)!;

/* ── 1. LES BORNES ─────────────────────────────────────────────────── */
dit('la premiere tranche n a pas de plancher', { min: null, max: 80 }, bornesDuModele(par('Jumbo'), B));
dit('une tranche du milieu part du plafond du dessous plus un', { min: 251, max: 350 }, bornesDuModele(par('Micro'), B));
dit('la derniere n a pas de plafond', { min: 551, max: null }, bornesDuModele(par('Galaxy'), B));
dit('l ordre de saisie ne compte pas (bareme melange)', { min: 251, max: 350 }, bornesDuModele(par('Micro'), [...B].reverse()));
dit('les trois phrases', ['jusqu’à 80 locks', 'de 251 à 350 locks', 'plus de 550 locks'],
  [fourchetteDite(par('Jumbo'), B), fourchetteDite(par('Micro'), B), fourchetteDite(par('Galaxy'), B)]);
const grand: ModelBand[] = [
  { id: 'a', name: 'Fin', maxLocks: 999, coef: 1, durCoef: 1 },
  { id: 'b', name: 'Dense', maxLocks: 1200, coef: 1, durCoef: 1 },
  { id: 'c', name: 'Hors', maxLocks: null, coef: 1, durCoef: 1 },
];
dit('les milliers se lisent a la francaise (espace)', [true, true],
  [/^de 1\s000 à 1\s200 locks$/u.test(fourchetteDite(grand[1], grand)), /^plus de 1\s200 locks$/u.test(fourchetteDite(grand[2], grand))]);

/* ── 2. LA TRANCHE FACTURÉE ─────────────────────────────────────────── */
dit('337 locks : Micro et sa fourchette', 'Micro, de 251 à 350 locks', modeleDit(337, B));
dit('360 locks sans marge : Nano', 'Nano, de 351 à 450 locks', modeleDit(360, B));
dit('360 locks avec la marge : Micro, comme a la caisse', 'Micro, de 251 à 350 locks', modeleDit(360, B, true));
dit('sans comptage, rien', undefined, modeleDit(undefined, B));
dit('aucune phrase ne porte le compte de la tete', [false, false, false],
  [modeleDit(337, B)!.includes('337'), modeleDit(360, B, true)!.includes('360'), modeleDit(700, B)!.includes('700')]);

/* ── 3. LE BILAN ────────────────────────────────────────────────────── */
const note = { nature: 'afro' as const, vu: [], metisse: [], attendu: 'Racines sèches.', retenir: '' };
const ctx = contexteDuBilan({
  fiche: { name: 'Awa Dossou', lockCount: 337, modele: modeleDit(337, B, false) } as Parameters<typeof contexteDuBilan>[0]['fiche'],
  note, seance: { date: '16 octobre 2026', prestations: ['SÍNSIN™ Essentiel'], praticien: 'Brice' }, bilansPasses: [],
});
dit('le bilan dit le modele', 'Micro, de 251 à 350 locks', ctx.cheveu.modele);
dit('le bilan ne dit jamais le compte exact', false, JSON.stringify(ctx).includes('337'));
dit('... ni sous l ancienne cle locks', false, 'locks' in ctx.cheveu);
const bilanEcran = sansCommentaires('src/apps/trone/routes/clients/LeBilanDeLaSeance.tsx');
dit('l ecran du bilan passe le modele dit, marge comprise', true,
  /modele:\s*modeleDit\(client\.lockCount,\s*bands,\s*client\.margeCalibre\)/.test(bilanEcran));

/* ── 4. LA RÈGLE DANS LE CODE ───────────────────────────────────────── */
const couronne = path.join(racine, 'src/apps/couronne');
/* Ma Couronne entière ; au Trône, le TÉLÉPHONE de l'écran Vitrines seulement :
   la fiche de l'équipe, à sa gauche, garde le compte exact (c'est le sien). */
const TELEPHONE = '----- Colonne droite : le téléphone -----';
const sources: [string, string?][] = readdirSync(couronne).filter((f) => /\.tsx?$/.test(f)).map((f) => [`src/apps/couronne/${f}`]);
sources.push(['src/apps/trone/routes/clients/Vitrine.tsx', TELEPHONE]);
const lis = (f: string, depuis?: string) => {
  const src = sansCommentaires(f);
  if (!depuis) return src;
  /* La borne est un commentaire : on la cherche dans le fichier brut, puis on
     efface les commentaires de la suite seulement. */
  const brut = readFileSync(path.join(racine, f), 'utf8');
  const i = brut.indexOf(depuis);
  if (i < 0) { fautes.push(`${f} : la borne « ${depuis} » a disparu, le banc ne sait plus où commence le téléphone`); return ''; }
  return sansCommentairesDe(brut.slice(i + depuis.length));
};
/* Un compte de tête : lockCount, lockCountDeclare, avec ou sans chaîne optionnelle. */
const COMPTE = String.raw`[\w?.!]*lockCount\w*`;
const MOTIFS: [string, RegExp][] = [
  /* {client?.lockCount} ou {client?.lockCount ?? '—'} rendu tel quel */
  ['accolade JSX', new RegExp(String.raw`\{\s*${COMPTE}\s*(\?\?[^}]*)?\}`, 'g')],
  /* t('… {n} locks', { n: client.lockCount }) */
  ['variable d une phrase traduite', new RegExp(String.raw`\bt\(\s*'[^']*'\s*,\s*\{[^}]*:\s*${COMPTE}`, 'g')],
  /* `… ${client.lockCount} locks` */
  ['gabarit', new RegExp(String.raw`\$\{\s*${COMPTE}[^}]*\}`, 'g')],
  /* [[client.lockCount ?? '—', 'Locks'], …] : une tuile valeur / libellé, que
     le libellé soit écrit ou calculé. Une liste de dépendances React
     (« [client?.lockCount, bands] ») n'est pas une tuile : elle passe. */
  ['tuile', new RegExp(String.raw`\[\s*\[\s*${COMPTE}|\[\s*${COMPTE}\s*(\?\?[^,\]]*)?,\s*['\x60]`, 'g')],
];
const fautes: string[] = [];
for (const [f, depuis] of sources) {
  const src = lis(f, depuis);
  for (const [nom, re] of MOTIFS) for (const m of src.matchAll(re)) fautes.push(`${f} (${nom}) : ${m[0].slice(0, 70)}`);
}
for (const x of fautes) console.log(`       ${x}`);
dit('le compte d une tete n entre dans aucun texte de Ma Couronne ni de son apercu', 0, fautes.length);
/* La règle ne doit pas être morte : chaque motif reconnaît la faute qu'il garde. */
dit('les quatre motifs crient sur la faute qu ils gardent', [1, 1, 1, 1], [
  `<div>{client?.lockCount ?? '—'}</div>`,
  `t('Couronne {calibre} · {n} locks', { calibre: cal, n: client?.lockCount ?? '' })`,
  'return `Couronne ${cal} · ${client.lockCount} locks`;',
  `{[[client.lockCount ?? '—', 'Locks'], [honoredCount, 'Rituels honorés']]}`,
].map((s, i) => [...s.matchAll(MOTIFS[i][1])].length));
dit('la fiche de l equipe, hors du telephone, n est pas lue', true,
  readFileSync(path.join(racine, 'src/apps/trone/routes/clients/Vitrine.tsx'), 'utf8').indexOf(TELEPHONE) > 0);
/* … et se taisent devant l'usage permis : trouver le calibre. */
dit('trouver le calibre par le compte reste permis (et une liste de dependances)', 0,
  ['calibreDeLaTete(client?.lockCount, bands, client?.margeCalibre)', '}), [client?.lockCount, client?.lockCountDeclare, bands]);']
    .reduce((n, s) => n + MOTIFS.reduce((k, [, re]) => k + [...s.matchAll(re)].length, 0), 0));

/* Les phrases anglaises : aucune ne garde la place d'un compte de tête. */
const anciennes = Object.keys(EN_TABS).filter((k) => /\{n\} locks/.test(k) && k !== 'plus de {n} locks');
dit('aucune phrase anglaise ne porte encore « {n} locks » d un compte', [], anciennes);
dit('les phrases de la fourchette sont traduites', [true, true, true, true, true],
  ['Couronne {calibre} · {fourchette}', 'jusqu’à {max} locks', 'de {min} à {max} locks', 'plus de {n} locks', 'Fourchette du modèle'].map((k) => k in EN_TABS));

console.log(ko === 0 ? '\nLa cliente lit sa fourchette, jamais son compte.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
