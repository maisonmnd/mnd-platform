/* SIGNER UN PDF, ÉPROUVÉ — 15 octobre 2026.

   « Ouvrir les PDF téléchargés depuis le secrétariat, éditer le document, et
   mettre les signatures et les tampons sur autant de pages nécessaires »
   (Yéman). Maquette UrJJzwSH…, choix cochés : depuis chaque PDF du
   Secrétariat et depuis l'ordinateur ; une COPIE signée à côté de
   l'original ; on ajoute, on n'efface jamais ; chacun son paraphe comme sa
   signature ; cette page, toutes, ou « 1, 3-5 » ; tourner et retirer une
   page dans la copie ; le téléphone aussi.

   Les attentes sont écrites ici à la main, depuis ces promesses. La plus
   forte : ce qu'on pose à un endroit de la page TELLE QU'ON LA VOIT s'y
   retrouve, droit, quel que soit le tour de la page. Le banc ne la
   recalcule pas avec les formules de l'atelier : il écrit la copie, la
   relit avec pdf.js (le lecteur qui l'affichera) et mesure où les pièces
   tombent à l'écran. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFName, degrees } from 'pdf-lib';
import {
  GENRES_IMAGES, contenuDeLaCopie, genreDeLImage, nomDeLaCopie, pagesDeLaSelection, repeteSurLesPages, resteDesPages,
  tailleApresLeCoin, tailleDite, tourFinal, type PoseSurPdf,
} from '../src/shared/pdf-signe-pur';
import { facteurDuCoin } from '../src/shared/secretariat-pur';
import { PdfProtege, ecritLaCopie } from '../src/shared/pdf-signe';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const racine = path.resolve(process.cwd());
const lis = (f: string) => readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const pres = (a: number, b: number, tol = 0.6) => Math.abs(a - b) <= tol;

/* ── 1. LES PAGES ── */
dit('« 1, 3-5 » sur 6 pages = pages 1, 3, 4, 5 (comptees depuis 0 : 0, 2, 3, 4)', [0, 2, 3, 4], pagesDeLaSelection('1, 3-5', 6));
dit('« 5-3 » se lit comme « 3-5 »', [2, 3, 4], pagesDeLaSelection('5-3', 6));
dit('une page hors du document, ou illisible, est ignoree', [1], pagesDeLaSelection('0, 7, abc, 2', 6));
dit('une page dite deux fois ne compte qu une fois', [1, 2], pagesDeLaSelection('2, 2-3', 6));
dit('points-virgules et espaces separent aussi', [0, 1, 3], pagesDeLaSelection('1;2 4', 6));
dit('rien d ecrit = aucune page', [], pagesDeLaSelection('', 6));
{
  const p: PoseSurPdf = { id: 'a', page: 0, genre: 'paraphe', x: 0.8, y: 0.9, largeur: 0.1, image: 'paraphe' };
  let n = 0; const id = () => `n${(n += 1)}`;
  const toutes = repeteSurLesPages(p, [0, 1, 2], [p], id);
  dit('« sur toutes les pages » : le paraphe de la page 1 va sur les 2 autres, au meme endroit', [[1, 0.8, 0.9], [2, 0.8, 0.9]], toutes.map((q) => [q.page, q.x, q.y]));
  dit('... chacun a son identifiant', true, new Set([p, ...toutes].map((q) => q.id)).size === 3);
  dit('... sans doubler une piece deja la', [1], repeteSurLesPages(p, [0, 1, 2], [p, { ...p, id: 'b', page: 2 }], id).map((q) => q.page));
}
dit('un quart de tour sur une page a 90 = 180 ; sur une page a 270 = 0', [180, 0], [tourFinal(90, 1), tourFinal(270, 1)]);
dit('trois quarts de tour sur une page droite = 270 ; aucun = son tour', [270, 90], [tourFinal(0, 3), tourFinal(90, undefined)]);
dit('une copie garde au moins une page', [0, 2], [resteDesPages({ tours: {}, retirees: [0, 1, 2] }, 3), resteDesPages({ tours: {}, retirees: [1, 1, 9] }, 3)]);

/* ── 2. LE NOM ET LE JOURNAL DE LA COPIE ── */
dit('le nom dit « signe le » avec l annee', 'Contrat de bail · signé le 15 octobre 2026.pdf', nomDeLaCopie('Contrat de bail.pdf', '2026-10-15'));
dit('re-signer une copie ne double pas la mention', 'Contrat de bail · signé le 1er novembre 2026.pdf', nomDeLaCopie('Contrat de bail · signé le 15 octobre 2026.pdf', '2026-11-01'));
dit('un nom vide devient « Document »', 'Document · signé le 3 janvier 2027.pdf', nomDeLaCopie('', '2027-01-03'));
{
  const poses: PoseSurPdf[] = [
    { id: '1', page: 0, genre: 'paraphe', x: 0.8, y: 0.9, largeur: 0.1, image: 'paraphe' },
    { id: '2', page: 1, genre: 'paraphe', x: 0.8, y: 0.9, largeur: 0.1, image: 'paraphe' },
    { id: '3', page: 2, genre: 'paraphe', x: 0.8, y: 0.9, largeur: 0.1, image: 'paraphe' },
    { id: '4', page: 3, genre: 'paraphe', x: 0.8, y: 0.9, largeur: 0.1, image: 'paraphe' },
    { id: '5', page: 2, genre: 'signature', x: 0.5, y: 0.7, largeur: 0.26, image: 'signature' },
    { id: '6', page: 2, genre: 'tampon', x: 0.2, y: 0.7, largeur: 0.2, image: 'tampon:mnd-6-dentele' },
    { id: '7', page: 2, genre: 'lu', x: 0.5, y: 0.65, largeur: 0, texte: 'Lu et approuvé' },
  ];
  /* L'ordre des lignes n'est pas une promesse : on compare ce qu'elles disent. */
  dit('le journal : ce que la copie porte, en clair (la page 4 retiree ne compte plus, un tour complet non plus)',
    ['1 page retirée sur 4', '1 page tournée', '1 signature', '1 tampon', '1 « Lu et approuvé »', '3 paraphes sur 3 pages'].sort(),
    contenuDeLaCopie(poses, { tours: { 0: 1, 1: 4 }, retirees: [3] }, 4).sort());
}

/* ── 3. LES IMAGES ── */
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const morceau = (type: string, data: Buffer) => { const t = Buffer.from(type, 'ascii'); const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, c]); };
/** Un PNG de l × h, encre bleu nuit sur fond transparent. */
function png(l: number, h: number): Uint8Array {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(l, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const brut = Buffer.alloc((l * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < l; x += 1) brut.set([30, 33, 80, x === y ? 255 : 0], y * (l * 4 + 1) + 1 + x * 4);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), morceau('IHDR', ihdr), morceau('IDAT', deflateSync(brut)), morceau('IEND', Buffer.alloc(0))]));
}
const SIGNATURE = png(40, 20);
dit('un PNG se reconnait a ses octets, un JPEG aussi, un SVG non', ['png', 'jpg', null],
  [genreDeLImage(SIGNATURE), genreDeLImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])), genreDeLImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))]);

/* ── 4. LA COPIE, ÉCRITE PUIS RELUE PAR PDF.JS ── */
type Page = { tour: number; recadre?: [number, number, number, number] };
const PAGES: Page[] = [
  { tour: 0 }, // tournée ici d'un quart → 90
  { tour: 90 },
  { tour: 180 },
  { tour: 270 },
  { tour: 0, recadre: [30, 40, 500, 700] },
  { tour: 90, recadre: [30, 40, 500, 700] },
  { tour: 0 }, // retirée de la copie
];
const original = await (async () => {
  const d = await PDFDocument.create();
  for (const p of PAGES) {
    const pg = d.addPage([595, 842]);
    pg.setRotation(degrees(p.tour));
    if (p.recadre) pg.setCropBox(...p.recadre);
  }
  return d.save();
})();
const empreinte = (o: Uint8Array) => createHash('sha256').update(o).digest('hex');
const avant = empreinte(original);
const POS = { x: 0.12, y: 0.2 };
const SIG = { x: 0.55, y: 0.6, largeur: 0.3 };
const poses: PoseSurPdf[] = PAGES.flatMap((_, i) => [
  { id: `t${i}`, page: i, genre: 'texte', x: POS.x, y: POS.y, largeur: 0, texte: `Page ${i + 1}`, taille: 11 },
  { id: `s${i}`, page: i, genre: 'signature', x: SIG.x, y: SIG.y, largeur: SIG.largeur, image: 'signature' },
] as PoseSurPdf[]);
const copie = await ecritLaCopie(original, poses, { tours: { 0: 1 }, retirees: [6] }, { signature: { octets: SIGNATURE, type: 'png', ratio: 20 / 40 } });
dit('l original n est pas touche : memes octets apres la copie', avant, empreinte(original));
/* updateMetadata: false, sinon pdf-lib réécrit lui-même le « Producer » en relisant. */
const relue = await PDFDocument.load(copie, { updateMetadata: false });
dit('la page retiree n est plus dans la copie : 7 - 1 = 6 pages', 6, relue.getPageCount());
dit('les tours de la copie : la page 1 tournee ici, les autres gardent le leur', [90, 90, 180, 270, 0, 90], relue.getPages().map((p) => p.getRotation().angle));
dit('la copie dit qui l a ecrite', 'Maison MND · Le Trône', relue.getProducer());

const pdfjs = await import(pathToFileURL(path.join(racine, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(racine, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
const lu = await pdfjs.getDocument({ data: copie.slice(), verbosity: 0 }).promise;
type Mat = [number, number, number, number, number, number];
const fois = (m: Mat, n: Mat): Mat => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const point = (m: Mat, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
for (let i = 0; i < 6; i += 1) {
  const page = await lu.getPage(i + 1);
  const vue = page.getViewport({ scale: 1 });
  const W = vue.width, H = vue.height;
  const nom = `page ${i + 1} (tour ${page.rotate}${PAGES[i].recadre ? ', recadree' : ''})`;
  const attenduW = page.rotate % 180 ? (PAGES[i].recadre ? 700 : 842) : (PAGES[i].recadre ? 500 : 595);
  dit(`${nom} : la page vue a la bonne largeur`, attenduW, Math.round(W));
  /* Le texte : sa ligne de base commence à 12 % de la largeur vue, à 20 % de
     la hauteur vue plus les 8/10 de sa taille ; il se lit de gauche à droite. */
  const t = (await page.getTextContent()).items.find((it: { str?: string }) => it.str === `Page ${i + 1}`) as { transform: Mat } | undefined;
  if (!t) { dit(`${nom} : le texte est dans la copie`, true, false); continue; }
  const m = fois(vue.transform as Mat, t.transform);
  dit(`${nom} : le texte tombe la ou on l a pose`, true, pres(m[4], POS.x * W) && pres(m[5], POS.y * H + 0.8 * 11));
  dit(`${nom} : le texte est droit (horizontal, de gauche a droite)`, true, m[0] > 0 && Math.abs(m[1]) < 1e-6);
  /* La signature : son coin haut-gauche à (55 %, 60 %), sa largeur 30 % de la
     largeur vue vers la droite, sa hauteur la moitié vers le bas. */
  const ops = await page.getOperatorList();
  const pile: Mat[] = []; let ctm: Mat = [1, 0, 0, 1, 0, 0]; let vue_im: { hg: { x: number; y: number }; bd: { x: number; y: number } } | null = null;
  for (let k = 0; k < ops.fnArray.length; k += 1) {
    const f = ops.fnArray[k], a = ops.argsArray[k];
    if (f === pdfjs.OPS.save) pile.push(ctm);
    else if (f === pdfjs.OPS.restore) ctm = pile.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (f === pdfjs.OPS.transform) ctm = fois(ctm, a as Mat);
    else if (f === pdfjs.OPS.paintImageXObject) {
      const ecran = fois(vue.transform as Mat, ctm);
      vue_im = { hg: point(ecran, 0, 1), bd: point(ecran, 1, 0) };
    }
  }
  if (!vue_im) { dit(`${nom} : la signature est dans la copie`, true, false); continue; }
  const l = SIG.largeur * W;
  dit(`${nom} : la signature tombe la ou on l a posee, droite et a sa taille`, true,
    pres(vue_im.hg.x, SIG.x * W) && pres(vue_im.hg.y, SIG.y * H) && pres(vue_im.bd.x, SIG.x * W + l) && pres(vue_im.bd.y, SIG.y * H + l * 0.5));
}
await lu.destroy();

/* Un PDF protégé par un mot de passe : refusé en clair, pas une erreur obscure. */
{
  const d = await PDFDocument.load(original);
  d.context.trailerInfo.Encrypt = d.context.obj({ Filter: PDFName.of('Standard'), V: 1, R: 2 });
  const protege = await d.save();
  let dite = '';
  try { await ecritLaCopie(protege, [], { tours: {}, retirees: [] }, {}); } catch (e) { dite = e instanceof PdfProtege ? 'protege' : String(e); }
  dit('un PDF a mot de passe est refuse avec une phrase claire', 'protege', dite);
}
/* UNE IMAGE (16 octobre 2026) : posée sur la page, à moitié de sa largeur,
   elle tombe là où on l'a mise, à sa taille. */
{
  const d = await PDFDocument.create(); d.addPage([595, 842]);
  const c = await ecritLaCopie(await d.save(), [{ id: 'i', page: 0, genre: 'image', x: 0.2, y: 0.3, largeur: 0.5, image: 'image:plan' }], { tours: {}, retirees: [] }, { 'image:plan': { octets: png(80, 60), type: 'png', ratio: 60 / 80 } });
  const lu3 = await pdfjs.getDocument({ data: c.slice(), verbosity: 0 }).promise;
  const pg = await lu3.getPage(1);
  const vue = pg.getViewport({ scale: 1 });
  const ops = await pg.getOperatorList();
  let ctm: Mat = [1, 0, 0, 1, 0, 0]; const pile: Mat[] = []; let ou: { hg: { x: number; y: number }; bd: { x: number; y: number } } | null = null;
  for (let k = 0; k < ops.fnArray.length; k += 1) {
    const f = ops.fnArray[k], a = ops.argsArray[k];
    if (f === pdfjs.OPS.save) pile.push(ctm); else if (f === pdfjs.OPS.restore) ctm = pile.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (f === pdfjs.OPS.transform) ctm = fois(ctm, a as Mat);
    else if (f === pdfjs.OPS.paintImageXObject) { const e = fois(vue.transform as Mat, ctm); ou = { hg: point(e, 0, 1), bd: point(e, 1, 0) }; }
  }
  dit('une image posee tombe a sa place, a la moitie de la page, dans sa forme (297,5 x 223,1 pt)', true,
    !!ou && pres(ou.hg.x, 0.2 * 595) && pres(ou.hg.y, 0.3 * 842) && pres(ou.bd.x - ou.hg.x, 297.5) && pres(ou.bd.y - ou.hg.y, 297.5 * 0.75));
  await lu3.destroy();
}
/* Le texte écrit garde ses accents ; ce que la police ne sait pas écrire ne fait pas tout échouer. */
{
  const d = await PDFDocument.create(); d.addPage([595, 842]);
  const c = await ecritLaCopie(await d.save(), [{ id: 'x', page: 0, genre: 'texte', x: 0.1, y: 0.1, largeur: 0, texte: 'Reçu à Cotonou, l’été ✓ ɖɛ', taille: 11 }], { tours: {}, retirees: [] }, {});
  const lu2 = await pdfjs.getDocument({ data: c.slice(), verbosity: 0 }).promise;
  const s = (await (await lu2.getPage(1)).getTextContent()).items.map((it: { str?: string }) => it.str ?? '').join('');
  dit('les accents et l apostrophe courbe passent, l inconnu devient « ? » sans tout faire echouer', 'Reçu à Cotonou, l’été ? ??', s);
  await lu2.destroy();
}

/* ── 4 bis. TIRER LE COIN (16 octobre 2026) ──
   « Je dois pouvoir réduire ou agrandir la taille du tampon et de la
   signature » (Yéman). Attentes à la main. */
dit('tirer le coin d une moitie de la piece en diagonale : x 1,5 ; d un quart vers l interieur : x 0,75', [1.5, 0.75],
  [Number(facteurDuCoin(50, 20, 100, 40).toFixed(2)), Number(facteurDuCoin(-25, -10, 100, 40).toFixed(2))]);
/* Hors de la diagonale, le coin va au point de la diagonale le plus proche
   du doigt : un pas de toute la largeur à l'horizontale sur une pièce de
   100 x 40 = 1 + 100² / (100² + 40²) = 1,86 ; un pas de toute la hauteur à
   la verticale = 1 + 40² / 11 600 = 1,14 (sur la diagonale seule, une
   mauvaise lecture du coin donnerait la même chose : ces deux-là la voient). */
dit('le doigt hors de la diagonale : x 1,86 a l horizontale, x 1,14 a la verticale', [1.86, 1.14],
  [Number(facteurDuCoin(100, 0, 100, 40).toFixed(2)), Number(facteurDuCoin(0, 40, 100, 40).toFixed(2))]);
dit('un tampon de 20 % de large tire a x 1,5 fait 30 %', 0.3, Number(((tailleApresLeCoin({ genre: 'tampon', x: 0.1, largeur: 0.2 }, 1.5) as { largeur: number }).largeur).toFixed(4)));
dit('... jamais au-dela du bord droit de la page, jamais plus petit que 4 %', [0.3, 0.04],
  [Number(((tailleApresLeCoin({ genre: 'image', x: 0.7, largeur: 0.25 }, 3) as { largeur: number }).largeur).toFixed(4)), (tailleApresLeCoin({ genre: 'signature', x: 0, largeur: 0.26 }, 0.05) as { largeur: number }).largeur]);
dit('un texte de 11 pt tire a x 1,5 fait 16,5 pt ; de 6 a 40 pt au plus', [16.5, 40, 6],
  [(tailleApresLeCoin({ genre: 'texte', x: 0, largeur: 0, taille: 11 }, 1.5) as { taille: number }).taille, (tailleApresLeCoin({ genre: 'lu', x: 0, largeur: 0, taille: 30 }, 2) as { taille: number }).taille, (tailleApresLeCoin({ genre: 'date', x: 0, largeur: 0 }, 0.1) as { taille: number }).taille]);
dit('en tirant, la poignee dit « 150 % » d un tampon, « 14 pt » d un texte', ['150 %', '14 pt'], [tailleDite({ genre: 'tampon', largeur: 0.3 }), tailleDite({ genre: 'texte', largeur: 0, taille: 14 })]);
dit('le journal compte les images posees', ['1 image'], contenuDeLaCopie([{ id: 'i', page: 0, genre: 'image', x: 0, y: 0, largeur: 0.4, image: 'image:a' }], { tours: {}, retirees: [] }, 1));

/* ── 5. LE CÂBLAGE ── */
const atelier = sansCommentaires(lis('src/apps/trone/routes/pilotage/secretariat/SignerUnPdf.tsx'));
const ecriture = sansCommentaires(lis('src/shared/pdf-signe.ts'));
const pur = sansCommentaires(lis('src/shared/pdf-signe-pur.ts'));
const admin = sansCommentaires(lis('src/apps/trone/routes/pilotage/secretariat/_admin.tsx'));
const page = sansCommentaires(lis('src/apps/trone/routes/pilotage/Secretariat.tsx'));
const secretariat = sansCommentaires(lis('src/shared/secretariat.ts'));

dit('chacun SA signature : l atelier ne charge que la signature de qui est connecte',
  ['chargeMaSignature(moi)'], [...new Set(atelier.match(/chargeMaSignature\([^)]*\)/g) ?? [])]);
dit('... et que SON paraphe', ['chargeMonParaphe(moi)'], [...new Set(atelier.match(/chargeMonParaphe\([^)]*\)/g) ?? [])]);
dit('... il ne lit aucune autre signature (pas de liste des signataires a poser)', false, /signaturesDe|chargeLaSignatureDe|\.download\(/.test(atelier));
dit('le paraphe vit dans le dossier prive de chacun, a cote de sa signature', true,
  /cheminDeMonParaphe\s*=\s*\(userId: string\)\s*=>\s*`\$\{userId\}\/paraphe\.png`/.test(secretariat) && /from\('signatures'\)\.upload\(cheminDeMonParaphe\(userId\)/.test(secretariat));
/* Neuf depuis le 16 octobre : « Une image » demandée par Yéman ; toujours aucun outil pour masquer. */
dit('on ajoute, on n efface jamais : neuf outils, aucun pour masquer', ['signature', 'paraphe', 'tampon', 'recu', 'image', 'texte', 'date', 'lu', 'coche'],
  [...(/export type GenreDePose = ([^;]+);/.exec(pur)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]));
dit('... ni rectangle blanc ni cache dans l ecriture de la copie', false, /drawRectangle|drawSvgPath|masqu|blanc|white/i.test(ecriture));
dit('... les cinq outils d image : ceux de la maquette, plus « Une image »', ['signature', 'paraphe', 'tampon', 'recu', 'image'], [...GENRES_IMAGES]);
dit('« Une image » prend une photo, une capture ou un PDF (sa premiere page, rendue par pdf.js)', true,
  /accept="image\/png,image\/jpeg,image\/webp,image\/gif,application\/pdf,\.pdf"/.test(atelier) && /premierePageEnImage\(f\)/.test(atelier) && /await doc\.getPage\(1\)/.test(atelier));
dit('... une grande photo est ramenee a 2 000 px (la copie reste legere)', true, /Math\.min\(1, 2000 \/ Math\.max\(/.test(atelier));
dit('le rond cuivre n apparait que sur la piece choisie, et agrandit par la regle commune', true,
  /const poignee = \(p: PoseSurPdf\) => p\.id === choisie && !retiree && \(/.test(atelier) && /tailleApresLeCoin\(p, facteurDuCoin\(/.test(atelier) && (atelier.match(/\{poignee\(p\)\}/g) ?? []).length === 2);
dit('la copie se range A COTE de l original : la liste des fichiers s allonge', true, /fichiers: \[\.\.\.ligne\.fichiers, f\]/.test(atelier) && /deposeLesFichiers\(ligne\.id,/.test(atelier));
dit('... jamais a sa place : l atelier n efface ni ne remplace aucun fichier', false,
  /storage|effaceLaLigne|upsert|fichiers: \[f\]|fichiers\.filter|fichiers: r\.fichiers/.test(atelier));
dit('... la copie dit de quel original elle vient, quand, par qui, et ce qu elle porte', true,
  /copieDe: ouverture\.source\.chemin/.test(atelier) && /signeLe:/.test(atelier) && /signePar: monNom/.test(atelier) && /contenu: contenuDeLaCopie\(/.test(atelier));
dit('... le nom de la copie porte la date avec l annee', true, /nom: nomDeLaCopie\(ouverture\.nom, aujourdhui\(\)\)/.test(atelier));
dit('pdf.js ne pese que dans cet ecran : l atelier est charge a la demande', true, /lazy\(\(\) => import\('\.\/SignerUnPdf'\)/.test(admin) && !/from '\.\/SignerUnPdf'/.test(admin));
{
  const { readdirSync } = await import('node:fs');
  const sources = (readdirSync(path.join(racine, 'src'), { recursive: true }) as string[]).filter((f) => /\.(ts|tsx)$/.test(f));
  const lecteurs = sources.filter((f) => /pdfjs-dist/.test(readFileSync(path.join(racine, 'src', f), 'utf8'))).map((f) => f.replace(/\\/g, '/'));
  dit('... et personne d autre n importe pdf.js', ['apps/trone/routes/pilotage/secretariat/SignerUnPdf.tsx'], lecteurs);
}
dit('chaque PDF du Secretariat s ouvre dans l atelier (« Ouvrir et signer »)', true, /Ouvrir et signer/.test(admin) && /<AtelierDuPdf ouverture=\{signer\}/.test(admin));
dit('... et un PDF de l ordinateur aussi (« Signer un PDF »), jusqu a 10 Mo', true,
  /Signer un PDF/.test(page) && /accept="application\/pdf,\.pdf"/.test(page) && /10 \* 1024 \* 1024/.test(page) && /<AtelierDuPdf ouverture=\{pdfASigner\}/.test(page));
dit('... une copie ouverte de l ordinateur demande sur quelle ligne se ranger', true, /!ouverture\.ligne && \(\s*<Select value=\{rangerSur\}/.test(atelier));
dit('tourner et retirer une page, dans la copie seulement', true, /Tourner/.test(atelier) && /Retirer cette page/.test(atelier) && /Remettre la page/.test(atelier));
dit('« sur toutes les pages » et une selection « 1, 3-5 »', true, /Sur toutes les pages/.test(atelier) && /pagesDeLaSelection\(selection, nbPages\)/.test(atelier));
const css = lis('src/apps/trone/routes/pilotage/pilotage.css');
dit('le telephone : on glisse une piece au doigt sans faire defiler la page, les outils passent sur deux colonnes', true,
  /\.spdf-pose \{[^}]*touch-action: none/.test(css) && /@media \(max-width: 760px\) \{ \.spdf-outils \{ grid-template-columns: repeat\(2/.test(css));
dit('la feuille reste blanche, meme en mode sombre (c est du papier)', true, /\.spdf-feuille \{[^}]*background: #FFFFFF/.test(css));

console.log(ko ? `\n${ko} ECHEC(S)` : '\nSigner un PDF : tout tient.');
if (ko) process.exitCode = 1;
