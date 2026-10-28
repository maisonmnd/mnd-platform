import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LA FACTURE DU FOYER, EPROUVEE — 27 octobre 2026.
   `node scripts/verifie-la-facture-du-foyer.mjs`

   Le banc (`verifie-la-facture-du-foyer.harnais.ts`) tourne dans un
   PROCESSUS FILS ; son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). LA FAUTE NE S'ECRIT JAMAIS DANS LE DEPOT :
   elle est servie a esbuild au chargement du fichier, et au banc quand il lit
   une source ; l'empreinte md5 de chaque fichier est comparee avant et apres,
   dans un `finally`. Une faute dont le texte ne se trouve plus (exactement
   une fois) fait echouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const P = 'src/shared/facture-du-foyer-pur.ts';
const ENVOI = 'src/apps/trone/routes/vente/envoi-de-la-piece.ts';
const CARNET = 'src/apps/trone/routes/clients/Carnet.tsx';
const ACTIONS = 'src/apps/trone/routes/clients/actions.tsx';
const PIECE = 'src/apps/trone/routes/vente/pdf-de-la-piece.ts';

const FAUTES = [
  /* #1 : deux fiches sans vrai numero deviennent un foyer. */
  { n: 1, fichier: P, avant: '  return na.length >= 8 && na === chiffres(b.phone);', apres: '  return na === chiffres(b.phone);' },
  /* #2 : le compte famille ne reunit plus. */
  { n: 2, fichier: P, avant: '  if (a.familyId && a.familyId === b.familyId) return true;', apres: '' },
  /* #3 : l'annule, l'autre jour, l'autre branche, l'archivee entrent ; l'ordre de l'heure se perd. */
  { n: 3, fichier: P, avant: "a.date === rdv.date && a.status !== 'annulé'", apres: "a.date === rdv.date" },
  { n: 3, fichier: P, avant: "  const ceux = rdvs.filter((a) => a.date === rdv.date", apres: "  const ceux = rdvs.filter((a) => true" },
  { n: 3, fichier: P, avant: "    && (a.branchId ?? '') === (rdv.branchId ?? '')\n", apres: '' },
  { n: 3, fichier: P, avant: '    && !parId.get(a.clientId)?.archived\n', apres: '' },
  { n: 3, fichier: P, avant: "  return ceux.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.clientId.localeCompare(b.clientId));", apres: '  return ceux;' },
  /* #4 : une tete seule devient un foyer. */
  { n: 4, fichier: P, avant: '  if (ceux.length < 2) return [];', apres: '  if (ceux.length < 1) return [];' },
  /* #5 : la cle garde l'ecriture du numero (deux ecritures = deux envois). */
  { n: 5, fichier: P, avant: '  `foyer-${jourIso}-${chiffres(numero)}`;', apres: '  `foyer-${jourIso}-${numero}`;' },
  /* #6 : le total disparait du mot ; le numero de piece entre dans le message. */
  { n: 6, fichier: P, avant: '\\nTotal à régler : ${o.totalDit}.', apres: '.' },
  { n: 6, fichier: ENVOI, avant: 'const lignes = ouvertes.map((p) => ({ prenom: prenomDe(p), resteDit:', apres: 'const lignes = ouvertes.map((p) => ({ prenom: `${prenomDe(p)} (${p.number})`, resteDit:' },
  /* #7 : le Terminer ne termine plus, l'apres coup ne renvoie plus, chaque tete au tarif de la premiere. */
  { n: 7, fichier: CARNET, avant: '{ terminer }), a.date, { renvoi: !terminer });', apres: '{ terminer }), a.date);' },
  { n: 7, fichier: CARNET, avant: "if (duJour.some((x) => x.status !== 'honoré')) {", apres: 'if (false) {' },
  { n: 7, fichier: ACTIONS, avant: '{ terminer: true }), appt.date);', apres: '{ terminer: false }), appt.date);' },
  { n: 7, fichier: ACTIONS, avant: '{ terminer: false }), appt.date, { renvoi: true });', apres: '{ terminer: false }), appt.date);' },
  { n: 7, fichier: ACTIONS, avant: 'const h = honoreSansEncaisser(frais, byId, tarifsDe(frais));', apres: 'const h = honoreSansEncaisser(frais, byId, tarifsDe(rdvs[0]));' },
  { n: 7, fichier: ACTIONS, avant: '    if (apptDueXof(frais, byId) <= 0) continue;\n', apres: '' },
  /* #8 : une piece soldee entre au total ; la piece seule part en foyer ; plus de cle. */
  { n: 8, fichier: ENVOI, avant: "p.kind === 'facture' && invoiceResteXof(p) > 0);", apres: "p.kind === 'facture');" },
  { n: 8, fichier: ENVOI, avant: '    if (ouvertes.length === 1) { await aRegler(ouvertes[0].id, jourDuRituel,', apres: '    if (false) { await aRegler(ouvertes[0].id, jourDuRituel,' },
  { n: 8, fichier: ENVOI, avant: 'cle: `${cleDuFoyer(jourDuRituel, destinataire.phone)}', apres: 'cle: `${Date.now()}' },
  /* #9 : le papier redit « RELEVE DE COMPTE » ; le modele dit « ci-jointe » seul. */
  { n: 9, fichier: 'src/shared/pdf.ts', avant: 'doc.text(d.titre ?? (', apres: 'doc.text((' },
  { n: 9, fichier: ENVOI, avant: "titre: 'FACTURE DU FOYER',", apres: '' },
  { n: 9, fichier: 'src/shared/facture-whatsapp.ts', avant: 'dateDite(o.jourIso), FACTURE_DU_FOYER_JOINTE, o.totalDit]', apres: "dateDite(o.jourIso), 'ci-jointe', o.totalDit]" },
  /* #10 a #12 (28 octobre 2026) : le papier du foyer, son QR, les tampons. */
  { n: 10, fichier: PIECE, avant: '${fmtDateFr(o.jourDe ? o.jourDe(p) : p.date)}', apres: '${(o.jourDe ? o.jourDe(p) : p.date).slice(5)}' },
  { n: 10, fichier: PIECE, avant: "      if (deja > 0) detail.push(`Déjà réglé · − ${o.fmt(deja)}`);\n", apres: '' },
  { n: 10, fichier: PIECE, avant: '  const totalXof = o.pieces.reduce((n, p) => n + invoiceResteXof(p), 0);', apres: '  const totalXof = o.pieces.reduce((n, p) => n + invoiceTotal(p), 0);' },
  { n: 11, fichier: PIECE, avant: '    qr: tg.qr,', apres: '    qr: momopay.qr,' },
  { n: 11, fichier: PIECE, avant: "    genre: 'tapgo',\n", apres: '' },
  { n: 11, fichier: PIECE, avant: '    code: tg.code,', apres: '    code: momopay.code,' },
  { n: 11, fichier: PIECE, avant: '  if (!tg) return { qr: momopay.qr, code: momopay.code };', apres: '  if (!tg) return momopay;' },
  { n: 12, fichier: 'src/shared/pdf.ts', avant: '  if (sceau) y = Math.max(y, yDuSceau + TAILLE_DU_SCEAU + 2);', apres: '' },
  { n: 12, fichier: 'src/shared/pdf.ts', avant: 'const paye = estLaMaisonMND(d.houseName) ? await chargeImageDuSite(TAMPON_PAYE.chemin) : null;', apres: 'const paye = null;' },
  { n: 12, fichier: 'src/apps/trone/routes/vente/FenetreDuPoint.tsx', avant: 'await invoicePdf(pdfDuFoyer({', apres: 'await invoicePdf(({' },
  /* #13 : le sceau repart a gauche, ou au-dessus des totaux ; le code marchand se perd, ou se pose sur un papier qui n'est pas de la Maison. */
  { n: 13, fichier: 'src/shared/pdf.ts', avant: "doc.addImage(sceau, 'PNG', rx - TAILLE_DU_SCEAU, yDuSceau,", apres: "doc.addImage(sceau, 'PNG', M + 4, yDuSceau," },
  { n: 13, fichier: 'src/shared/pdf.ts', avant: '  const yDuSceau = y - 2;', apres: '  const yDuSceau = y - 40;' },
  { n: 13, fichier: 'src/shared/pdf.ts', avant: 'Code Marchand ${CODE_MOMOPAY}', apres: '${CODE_MOMOPAY}' },
  { n: 13, fichier: 'src/shared/pdf.ts', avant: '  await pieDeLaMaison(doc, W, 290);', apres: '  await pieDeLaMaison(doc, W, 285);' },
  { n: 13, fichier: 'src/shared/pdf.ts', avant: "  if (estLaMaisonMND(d.houseName)) {\n    doc.setFont('helvetica', 'bold');\n    doc.setFontSize(8);\n    doc.setTextColor(INDIGO);", apres: "  {\n    doc.setFont('helvetica', 'bold');\n    doc.setFontSize(8);\n    doc.setTextColor(INDIGO);" },
];

const md5 =(rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

/* Le papier du foyer (#10 a #12) charge les magasins du Trone : un navigateur
   de banc, comme verifie-l-arrondi-du-code (28 octobre 2026). */
const BANNIERE = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, location: { href: '', hash: '' }, setTimeout: () => 0 };
globalThis.document = { body: { dataset: {}, appendChild() {} }, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, remove() {} }), querySelectorAll: () => [] };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`;

async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-facture-du-foyer-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-facture-du-foyer.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      plugins: faute ? [{
        name: 'la-faute-remise',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = path.relative(racine, args.path).split(path.sep).join('/');
            if (rel !== faute.fichier) return undefined;
            const contents = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').split(faute.avant).join(faute.apres);
            return { contents, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) };
          });
        },
      }] : [],
      define: {
        'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }),
        __FAUTE__: JSON.stringify(faute ?? null),
      },
      banner: { js: BANNIERE },
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
    return { status: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (!prouve) {
  const r = await banc(null);
  process.stdout.write(r.sortie);
  process.exitCode = r.status ?? 1;
} else {
  let tiennent = 0;
  for (const f of FAUTES) {
    const texte = readFileSync(path.join(racine, f.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(f.avant).length - 1;
    const avant = md5(f.fichier);
    let verdict;
    try {
      if (fois !== 1) {
        verdict = `LA FAUTE NE SE POSE PLUS (${fois} occurrence(s) du texte)`;
      } else {
        const r = await banc(f);
        const ligne = r.sortie.split(/\r?\n/).find((l) => l.startsWith(`ECHEC #${f.n} `));
        verdict = r.status !== 0 && ligne ? `crie (${ligne.slice(0, 110)})` : `NE CRIE PAS (statut ${r.status})`;
      }
    } finally {
      if (md5(f.fichier) !== avant) verdict = `LE FICHIER A CHANGE PENDANT LA PREUVE (${verdict})`;
    }
    const ok = verdict.startsWith('crie');
    if (ok) tiennent++;
    console.log(`${ok ? 'OK   ' : 'ECHEC'} faute #${f.n} ${f.avant.slice(0, 60).replace(/[^\x20-\x7e]/g, '?')} : ${verdict}`);
  }
  console.log(`${tiennent}/${FAUTES.length} fautes font crier le banc.`);
  if (tiennent !== FAUTES.length) process.exitCode = 1;
}
