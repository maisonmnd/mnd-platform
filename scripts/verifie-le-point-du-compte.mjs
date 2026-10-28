import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LE POINT DU COMPTE, EPROUVE — 28 octobre 2026.
   `node scripts/verifie-le-point-du-compte.mjs`

   Le banc (`verifie-le-point-du-compte.harnais.ts`) tourne dans un
   PROCESSUS FILS ; son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). LA FAUTE NE S'ECRIT JAMAIS DANS LE DEPOT :
   elle est servie a esbuild au chargement du fichier, et au banc quand il lit
   une source ; l'empreinte md5 de chaque fichier est comparee avant et apres,
   dans un `finally`. Une faute dont le texte ne se trouve plus (exactement
   une fois) fait echouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');


const PUR = 'src/shared/point-du-compte-pur.ts';
const WA = 'src/shared/facture-whatsapp.ts';
const FEN = 'src/apps/trone/routes/vente/FenetreDuPoint.tsx';
const FAC = 'src/apps/trone/routes/vente/Factures.tsx';
const ENVOI = 'src/apps/trone/routes/vente/envoi-de-la-piece.ts';
const FAUTES = [
  /* #1 : le payeur. */
  { n: 1, fichier: PUR, avant: '  return c?.payerClientId || teteId;', apres: '  return teteId;' },
  /* Le payeur hors du compte : sans lui, ses filles ne sont plus de son compte (#2). */
  { n: 2, fichier: PUR, avant: ' ?? comptes.find((c) => c.payerClientId === tete.id);', apres: ';' },
  /* #2 : les tetes du compte. */
  { n: 2, fichier: PUR, avant: 'if (t.familyId === c.id && !t.archived) ids.add(t.id);', apres: 'if (t.familyId === c.id) ids.add(t.id);' },
  /* #3 : les factures du point. */
  { n: 3, fichier: PUR, avant: ' || (!!p.forClientId && du.has(p.forClientId)))', apres: ')' },
  { n: 3, fichier: PUR, avant: " && (p.branchId ?? '') === o.branchId", apres: '' },
  { n: 3, fichier: PUR, avant: '      && o.resteDe(p) > 0)', apres: '      )' },
  { n: 3, fichier: PUR, avant: "    .filter((p) => (p.kind ?? 'facture') === 'facture' && ", apres: '    .filter((p) => ' },
  /* #4 : l'etendue des jours. */
  { n: 4, fichier: PUR, avant: '    : `du ${jourEtMois(a)} ${a.slice(0, 4)} au ${jourEtMois(b)} ${b.slice(0, 4)}`;', apres: '    : `du ${jourEtMois(a)} au ${jourEtMois(b)} ${b.slice(0, 4)}`;' },
  { n: 4, fichier: PUR, avant: "  return `${j === 1 ? '1er' : j} ", apres: '  return `${j} ' },
  /* #5 : rituels ou factures. */
  { n: 5, fichier: PUR, avant: "pieces.every((p) => !!p.apptId) ? (n > 1 ? 'rituels' : 'rituel')", apres: "true ? (n > 1 ? 'rituels' : 'rituel')" },
  /* #6 : chaque prenom une fois. */
  { n: 6, fichier: PUR, avant: 'if (prenom && !vus.includes(prenom)) vus.push(prenom);', apres: 'if (prenom) vus.push(prenom);' },
  /* #7 : le mot. */
  { n: 7, fichier: PUR, avant: "o.payeurParmiLesTetes || o.prenoms.length === 0 ? 'de votre compte'", apres: "true ? 'de votre compte'" },
  { n: 7, fichier: PUR, avant: '${o.phrase}, ${o.totalDit} à régler.', apres: '${o.phrase}, ${o.totalDit} à régler (MND-0000).' },
  /* #8 : la cle, le modele. */
  { n: 8, fichier: PUR, avant: '  `point-${jourIso}-${chiffres(numero)}`;', apres: '  `point-${jourIso}-${numero}`;' },
  { n: 8, fichier: PUR, avant: "export const MODELE_DU_POINT = 'point_du_compte';", apres: "export const MODELE_DU_POINT = 'facture_du_rituel';" },
  /* #9 : l'envoi. */
  { n: 9, fichier: WA, avant: "    ...base, piece, enTete: 'document', modele: MODELE_DU_POINT,", apres: "    ...base, enTete: 'document', modele: MODELE_DU_POINT," },
  { n: 9, fichier: WA, avant: '  if (m.ok || !refusDuModele(m.erreur)) return m;\n\n  const l = await envoie({\n    ...base, modele: MODELE_TAPGO, variables: variablesTapGo(appelDe(o.client), o.tapgo.totalDit), boutonUrl: o.tapgo.parametre, ...cle(\'lien\'),\n  });\n  return l.ok ? { ...l, repli: \'lien\' } : { ok: false, erreur: `${l.erreur} (et « ${MODELE_DU_POINT} »', apres: '  return m;\n\n  const l = await envoie({\n    ...base, modele: MODELE_TAPGO, variables: variablesTapGo(appelDe(o.client), o.tapgo.totalDit), boutonUrl: o.tapgo.parametre, ...cle(\'lien\'),\n  });\n  return l.ok ? { ...l, repli: \'lien\' } : { ok: false, erreur: `${l.erreur} (et « ${MODELE_DU_POINT} »' },
  { n: 9, fichier: WA, avant: "  if (!tel) return { ok: false, erreur: 'Pas de numéro sur la fiche du payeur : le point n’est pas parti.' };", apres: '' },
  /* #10 : les entrees et la fenetre. */
  { n: 10, fichier: FAC, avant: '<BoutonDuPoint teteId={selected.forClientId ?? selected.clientId} onOpen={setPointDe} />', apres: 'null' },
  { n: 10, fichier: FEN, avant: 'ouvert: pieces.length >= SEUIL_DU_POINT', apres: 'ouvert: pieces.length >= 1' },
  { n: 10, fichier: FEN, avant: 'const payeurId = payeurDuCompte(teteId, clients, families);', apres: 'const payeurId = teteId;' },
  /* #11 : l'envoi du Trone. */
  { n: 11, fichier: ENVOI, avant: '(unSeulJour ? saitReglerLeFoyer(version) : saitReglerLePoint(version)) ? poseLeLienDuFoyer(rdvs) : null', apres: 'saitReglerLeFoyer(version) ? poseLeLienDuFoyer(rdvs) : null' },
  { n: 11, fichier: ENVOI, avant: 'payeurParmiLesTetes: ouvertes.some((p) => (p.forClientId ?? p.clientId) === payeur.id),', apres: 'payeurParmiLesTetes: true,' },
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
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-point-du-compte-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-point-du-compte.harnais.ts')],
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
