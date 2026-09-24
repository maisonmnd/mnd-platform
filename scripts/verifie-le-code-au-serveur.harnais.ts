/* LE CODE AU SERVEUR, ÉPROUVÉ — `node scripts/verifie-le-code-au-serveur.mjs`.

   `demande-submit` (fonction Edge) ne peut rien importer du dépôt : elle
   RECOPIE le noyau pur du code de l'offre. Deux calculs d'argent finissent
   toujours par diverger, et c'est au comptoir qu'on l'apprend. Ce harnais lit
   la copie entre ses deux repères, la fait tourner sur les mêmes cas que
   l'original (`src/shared/offres-pur.ts`) et exige le même résultat au franc.

   Il tient aussi les règles de sécurité à la lettre du fichier : le
   navigateur n'y dicte jamais un pourcentage ni une remise, la remise s'écrit
   PAR LIGNE et jamais en `discountPct` (qui porte sur tout le rendez-vous),
   et le code se lit dans `mnd_offers`. Les commentaires sont effacés avant
   la lecture : un exemple dans une explication n'est pas une instruction. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { codeNormalise, lignesDuCode, offreDuCode } from '../src/shared/offres-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const source = readFileSync(path.join(process.cwd(), 'supabase/functions/demande-submit/index.ts'), 'utf8');
/* Les commentaires effacés, les retours à la ligne gardés. */
const sansCommentaires = source
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
  .replace(/^[ \t]*\/\/.*$/gm, '');

/* ── La copie, extraite et exécutée ────────────────────────────────── */
const debut = source.indexOf('/* ══ COPIE DE offres-pur : DÉBUT ══ */');
const fin = source.indexOf('/* ══ COPIE DE offres-pur : FIN ══ */');
dit('la copie a ses deux reperes, dans l ordre', true, debut > 0 && fin > debut);
const bloc = source.slice(debut, fin);
/* esbuild, par son chemin dans le dépôt : le lanceur empaquette ce harnais
   dans un dossier temporaire, d'où « esbuild » ne se résout pas. */
const { transform } = await import(pathToFileURL(path.join(process.cwd(), 'node_modules/esbuild/lib/main.js')).href) as typeof import('esbuild');
const { code: js } = await transform(
  `${bloc}\nexport { codeNormalise, offreDuCode, lignesDuCode, dansLaSaison };`,
  { loader: 'ts', format: 'esm' },
);
const banc = mkdtempSync(path.join(os.tmpdir(), 'code-au-serveur-'));
const fichier = path.join(banc, 'copie.mjs');
writeFileSync(fichier, js);
type Copie = {
  codeNormalise: (v: unknown) => string;
  offreDuCode: (o: readonly any[], c: unknown, j: string) => any;
  lignesDuCode: (l: readonly any[], o: any) => any[];
  dansLaSaison: (o: any, j: string) => boolean;
};
let copie: Copie;
try {
  copie = await import(pathToFileURL(fichier).href);
} finally {
  rmSync(banc, { recursive: true, force: true });
}

/* ── Les mêmes cas, le même franc ──────────────────────────────────── */
for (const v of ['rentree 10', 'Rentree10', ' RENTREE10 ', 'x'.repeat(30), '', null, undefined, 42]) {
  dit(`codeNormalise(${JSON.stringify(v)}) : la meme main`, codeNormalise(v), copie.codeNormalise(v));
}

const LIGNES = [
  { id: 'lavage', prixXof: 12000, ferme: true },
  { id: 'reprise', prixXof: 20000, ferme: true },
  { id: 'styling', prixXof: 2000, ferme: true },
  { id: 'gbeji', prixXof: 0, ferme: false },
  { id: 'lavage', prixXof: 12000, ferme: true },
];
const OFFRES = [
  { id: 'rentree', active: true, du: '2026-09-01', au: '2026-09-30', code: 'RENTREE10', discountPct: 10, serviceIds: ['lavage', 'reprise', 'gbeji'] },
  { id: 'rose', active: true, du: '2026-10-01', au: '2026-10-31', code: 'ROSE15', discountPct: 15, serviceIds: ['soin'] },
  { id: 'noel', active: true, code: 'NOEL', serviceIds: ['styling'] },
  { id: 'vide', active: true, code: 'VIDE', discountPct: 20 },
  { id: 'fou', active: true, code: 'FOU', discountPct: 200, serviceIds: ['lavage'] },
  { id: 'dort', active: false, code: 'DORT', discountPct: 10, serviceIds: ['lavage'] },
];
for (const o of [OFFRES[0], OFFRES[2], OFFRES[3], OFFRES[4], null]) {
  dit(`lignesDuCode, offre ${o ? o.id : 'aucune'} : au franc pres`, lignesDuCode(LIGNES, o), copie.lignesDuCode(LIGNES, o));
}
dit('un panier de 34 000 avec RENTREE10 fait 30 800 : deux lignes couvertes, jamais le styling',
  30800, copie.lignesDuCode(LIGNES.slice(0, 3), OFFRES[0]).reduce((t: number, l: any) => t + l.net, 0));

const LE_15 = new Date('2026-09-15T10:00:00');
const LE_15_ISO = '2026-09-15';
for (const c of ['RENTREE10', 'rentree 10', 'ROSE15', 'NOEL', 'DORT', 'INCONNU', '']) {
  dit(`offreDuCode(${JSON.stringify(c)}) le 15 septembre : la meme offre`,
    offreDuCode(OFFRES, c, LE_15)?.id ?? null, copie.offreDuCode(OFFRES, c, LE_15_ISO)?.id ?? null);
}
dit('le 1er octobre, ROSE15 court et RENTREE10 ne court plus',
  ['rose', null], [copie.offreDuCode(OFFRES, 'ROSE15', '2026-10-01')?.id ?? null, copie.offreDuCode(OFFRES, 'RENTREE10', '2026-10-01')?.id ?? null]);

/* ── Les règles à la lettre du fichier, commentaires effacés ──────── */
dit('le navigateur ne dicte jamais un pourcentage ni une remise', false,
  /\b(?:d|body)\.(?:discountPct|remisesLignes|discountXof|pct)\b/.test(sansCommentaires));
dit('la remise du code s ecrit par ligne sur le rendez-vous', true, /remisesLignes:\s*duCode\.remisesLignes/.test(sansCommentaires));
dit('... et jamais en discountPct, qui porte sur tout le rendez-vous', false, /discountPct\s*:/.test(sansCommentaires));
dit('le code se lit dans mnd_offers', true, sansCommentaires.includes("'mnd_offers'"));
dit('le code se compte sur la demande et sur le rendez-vous, meme sans remise', true,
  /code:\s*duCode\.code/.test(sansCommentaires) && /codeOffre:\s*duCode\.code/.test(sansCommentaires));
dit('le jour de la saison se calcule dans le fuseau de la Maison', true, sansCommentaires.includes("timeZone: 'Africa/Porto-Novo'"));
dit('la copie ne dit pas plus que l original : pas de remise en francs inventee', false, /\bxof\s*:/.test(bloc));

if (ko) { console.log(`\n${ko} ECHEC(S).`); process.exit(1); }
console.log('\nTout est juste.');
