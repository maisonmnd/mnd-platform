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
/* Le second bloc : la résolution du code, qui ne touche ni la base ni le
   réseau, extraite pour tourner POUR DE VRAI plutôt que d'être jugée sur la
   lettre du fichier. Ce qui interroge la base reste dehors, et se juge, lui,
   à la lettre, plus bas. */
const debutR = source.indexOf('/* ══ RÉSOLUTION DU CODE : DÉBUT ══ */');
const finR = source.indexOf('/* ══ RÉSOLUTION DU CODE : FIN ══ */');
dit('la resolution a ses deux reperes, apres la copie', true, debutR > fin && finR > debutR);
const blocR = source.slice(debutR, finR);
dit('... et ne touche ni la base ni le reseau', [false, false],
  [/\badmin\./.test(blocR), /\bfetch\(/.test(blocR)]);
/* esbuild, par son chemin dans le dépôt : le lanceur empaquette ce harnais
   dans un dossier temporaire, d'où « esbuild » ne se résout pas. */
const { transform } = await import(pathToFileURL(path.join(process.cwd(), 'node_modules/esbuild/lib/main.js')).href) as typeof import('esbuild');
const { code: js } = await transform(
  `${bloc}${blocR}\nexport { codeNormalise, offreDuCode, lignesDuCode, dansLaSaison, remiseDuCode, raisonEnClair };`,
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
  remiseDuCode: (o: any) => { code: string; offreId?: string; remisesLignes?: ({ pct: number } | null)[]; raison?: string };
  raisonEnClair: (v: any) => string;
};
let copie: Copie;
try {
  copie = await import(pathToFileURL(fichier).href);
} finally {
  rmSync(banc, { recursive: true, force: true });
}

const raisonEnClairDe = (v: unknown) => copie.raisonEnClair(v);

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

/* ── UNE FOIS PAR PERSONNE, ET JAMAIS CUMULÉ ───────────────────────
   « Le code est utilisable une fois par personne. Non cumulable » (Yéman,
   24 septembre 2026). Ce qui se juge ici pour de vrai : quelle remise le
   serveur accorde, et quelle RAISON il donne quand il n'accorde rien. Une
   remise refusée sans raison se découvre au comptoir, devant la cliente. */
const CATALOGUE = [
  { id: 'lavage', data: { priceXof: 12000, priceMode: 'fixe' } },
  { id: 'reprise', data: { priceXof: 20000, priceMode: 'fixe' } },
  { id: 'styling', data: { priceXof: 2000, priceMode: 'fixe' } },
  { id: 'gbeji', data: { priceXof: 30000, priceMode: 'devis' } },
];
const LA_MAISON = 'br-maison';
const OFFRES_DU_JOUR = [
  { id: 'off-rentree', active: true, code: 'RENTREE10', discountPct: 10, serviceIds: ['lavage', 'reprise'] },
  { id: 'off-noel', active: true, code: 'NOEL', serviceIds: ['styling'] },
  { id: 'off-gbeji', active: true, code: 'GBEJI10', discountPct: 10, serviceIds: ['gbeji'] },
  { id: 'off-passee', active: true, code: 'ETE20', discountPct: 20, du: '2026-06-01', au: '2026-08-31', serviceIds: ['lavage'] },
  { id: 'off-ailleurs', active: true, branchId: 'br-autre', code: 'AILLEURS10', discountPct: 10, serviceIds: ['lavage'] },
];
const verdict = (code: unknown, serviceIds: string[], branchId = LA_MAISON) =>
  copie.remiseDuCode({ code, serviceIds, branchId, catalogue: CATALOGUE, offres: OFFRES_DU_JOUR });

dit('le code qui mord ne remise QUE les lignes couvertes, dans l ordre des prestations',
  { code: 'RENTREE10', offreId: 'off-rentree', remisesLignes: [{ pct: 10 }, null, { pct: 10 }] },
  verdict('RENTREE10', ['lavage', 'styling', 'reprise']));
dit('... et sans raison, puisqu il a mordu', undefined, verdict('RENTREE10', ['lavage']).raison);
dit('un code inconnu s inscrit et se dit inconnu',
  { code: 'JAMAISVU', raison: 'inconnu' }, verdict('JAMAISVU', ['lavage']));
dit('un code hors saison se dit inconnu lui aussi', 'inconnu', verdict('ETE20', ['lavage']).raison);
dit('le code d une autre branche ne mord pas ici', 'inconnu', verdict('AILLEURS10', ['lavage']).raison);
dit('un cadeau garde son offre et ne retire rien',
  { code: 'NOEL', offreId: 'off-noel', raison: 'sans-effet' }, verdict('NOEL', ['styling']));
dit('un code qui ne porte sur aucun geste choisi le dit', 'sans-effet', verdict('RENTREE10', ['styling']).raison);
dit('un prix qui se dit au salon ne se remise pas', 'sans-effet', verdict('GBEJI10', ['gbeji']).raison);
dit('sans code, rien a dire', { code: '' }, verdict('', ['lavage']));
dit('la casse et les espaces ne changent rien', 'off-rentree', verdict(' rentree 10 ', ['lavage']).offreId);

dit('la note dit la raison en clair, pour qui ne connait pas nos mots',
  ['code RENTREE10', 'code RENTREE10 déjà utilisé par ce numéro', 'code JAMAISVU (aucune offre en cours)',
    'code NOEL (ne porte sur aucun geste choisi)', ''],
  [raisonEnClairDe({ code: 'RENTREE10' }), raisonEnClairDe({ code: 'RENTREE10', raison: 'deja-utilise' }),
    raisonEnClairDe({ code: 'JAMAISVU', raison: 'inconnu' }), raisonEnClairDe({ code: 'NOEL', raison: 'sans-effet' }),
    raisonEnClairDe({ code: '' })]);

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

/* Ce qui interroge la base ne s'exécute pas ici : il se juge à la lettre. */
dit('l usage se cherche sur le numero, le code, et le code REELLEMENT applique', true,
  /'data->>telephone'/.test(sansCommentaires) && /'data->>code'/.test(sansCommentaires)
    && /'data->>codeApplique'/.test(sansCommentaires));
dit('la remise ne s accorde qu APRES avoir cherche un usage anterieur', true,
  /if \(duCode\.remisesLignes && await codeDejaUtilise\(duCode\.code, telephone\)\)/.test(sansCommentaires));
dit('... et un usage trouve retire les remises, en gardant le code et sa raison', true,
  /duCode = \{ code: duCode\.code, offreId: duCode\.offreId, raison: 'deja-utilise' \}/.test(sansCommentaires));
dit('le navigateur ne dicte jamais l usage deja pris', false, /\b(?:d|body)\.code(?:Applique|Raison)\b/.test(sansCommentaires));
dit('une remise deja prise ne refuse JAMAIS la reservation', false,
  /error:\s*'[^']*(?:code|deja|utilis)/i.test(sansCommentaires));
dit('l usage ne se pose qu apres un rendez-vous reellement inscrit', true,
  /apptId = candidat;[\s\S]{0,400}codeApplique: true/.test(sansCommentaires));
dit('... et seulement quand la remise a porte', true,
  /duCode\.remisesLignes \? \{ codeApplique: true \}/.test(sansCommentaires));
/* ANCRÉ SUR LA RÉPONSE, et non sur le fichier : « codeRaison » s'écrit aussi
   sur la demande et sur le rendez-vous, donc le chercher n'importe où ne
   prouvait pas qu'il remonte à la page. Éprouvé en le retirant. */
const reponse = sansCommentaires.slice(sansCommentaires.lastIndexOf('return json({'));
dit('la raison remonte a la page, pour se dire au clic', true,
  /codeRaison: duCode\.raison/.test(reponse) && /codeApplique: !!duCode\.remisesLignes/.test(reponse));
dit('une lecture d usage impossible laisse passer la remise plutot que de la refuser', true,
  /if \(error\) \{\s*console\.error\([^)]*\);\s*return false;/.test(sansCommentaires));

if (ko) { console.log(`\n${ko} ECHEC(S).`); process.exit(1); }
console.log('\nTout est juste.');
