import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* L'IDENTITE DE LA MAISON, EPROUVEE — 10 octobre 2026.

   `node scripts/verifie-l-identite-de-la-maison.mjs`           le harnais ;
   `node scripts/verifie-l-identite-de-la-maison.mjs --prouve`  chaque faute
     remise, une a une : le harnais doit crier sur la ligne attendue, sinon
     il ne prouve rien.

   LES FAUTES SONT REMISES EN MEMOIRE, JAMAIS SUR LE DISQUE : un greffon
   d'esbuild les applique aux fichiers empaquetes, le harnais aux sources
   qu'il lit (`__FAUTE__`). Une autre session peut travailler dans le depot ;
   on ne lui reecrit pas un fichier sous les pieds. Les empreintes md5 des
   fichiers concernes sont relevees avant et apres : elles doivent etre
   identiques.

   identite.ts importe le magasin et la synchronisation : un navigateur de
   papier, aucune clef Supabase, rien ne parle au serveur. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const IDENTITE = 'src/shared/identite.ts';
const FAUTES = [
  { nom: 'la raison par defaut redevient ACIA 1', crie: 'ECHEC A. la raison par defaut est le registre de la Maison',
    mute: [{ fichier: IDENTITE, avant: '  raison: RAISON_MAISON_MND,\n', apres: '  raison: RAISON_ACIA_1,\n' }] },
  { nom: 'le paragraphe du site renomme l exploitante', crie: 'ECHEC A. aucun nom de personne',
    mute: [{ fichier: 'src/apps/revelateur/contenu.ts', avant: '${ED.nomCommercial} est une ${ED.forme} immatriculée', apres: '${ED.nomCommercial} est une ${ED.forme} de son exploitante, immatriculée' }] },
  { nom: 'un nom revient a la direction de la publication', crie: 'ECHEC A. aucun nom de personne',
    mute: [{ fichier: 'scripts/genere-revelateur.mjs', avant: '<b>Direction de la publication.</b> La direction de la ${echappe(COMMUN.nom)}, joignable à ${echappe(COMMUN.editeur.email)}.', apres: '<b>Direction de la publication.</b> ETS de l’exploitant.' }] },
  { nom: 'le motif d ACIA 1 s elargit', crie: 'ECHEC B. "ACIA 10" reste',
    mute: [{ fichier: IDENTITE, avant: String.raw`acia\s*1\s*(?:[·,]`, apres: String.raw`acia\s*1\d*\s*(?:[·,]` }] },
  { nom: 'la migration oublie l employeur', crie: 'ECHEC B. la raison migree, l employeur garde l ancienne',
    mute: [{ fichier: IDENTITE, avant: "  return { ...i, raison, employeur: (i.employeur ?? '').trim() || ancienne, raisonAvant: (i.raisonAvant ?? '').trim() || ancienne };", apres: "  return { ...i, raison, raisonAvant: (i.raisonAvant ?? '').trim() || ancienne };" }] },
  { nom: 'la correction des mentions ne filtre plus l entite', crie: 'ECHEC B. la ligne d ACIA 1 n est jamais une entree',
    mute: [{ fichier: 'src/shared/secretariat-pur.ts', avant: "  if (!m || m.entite !== 'mnd') return null;", apres: '  if (!m) return null;' }] },
  { nom: 'le Trone ne migre plus la raison', crie: 'ECHEC B. le Trone migre la raison au demarrage',
    mute: [{ fichier: 'src/apps/trone/main.tsx', avant: '\nmigreLaRaisonDeLaMaison();\n', apres: '\n' }] },
  { nom: 'le marqueur du poste n arrete plus rien', crie: 'ECHEC B. une fois marque, le poste ne rejoue plus',
    mute: [{ fichier: IDENTITE, avant: '  if (dejaMigre(MARQUEUR_RAISON)) return;\n', apres: '' }] },
  { nom: 'un octet change dans le cachet d ACIA 1', crie: 'ECHEC C. les images n ont pas bouge',
    mute: [{ fichier: 'public/assets/tampons/acia-cachet.png', octet: 1000 }] },
  { nom: 'le reglement interieur reprend la raison', crie: 'ECHEC D. Personnel.tsx nomme l employeur',
    mute: [{ fichier: 'src/apps/trone/routes/equipe/Personnel.tsx', avant: 'raison: maisonEmployeur(), ville: maisonVille(),', apres: 'raison: maisonRaison(), ville: maisonVille(),' }] },
  { nom: 'la raison d un document ne regarde plus sa date', crie: 'ECHEC D. une piece d avant la bascule garde ACIA 1',
    mute: [{ fichier: IDENTITE, avant: "  (jourIso ?? '').slice(0, 10) < BASCULE_DE_L_IDENTITE ? maisonRaisonAvantLaBascule() : maisonRaison();", apres: '  maisonRaison();' }] },
  { nom: 'un droit a l image reimprime prend la raison du jour', crie: 'ECHEC D. un droit a l image signe avant la bascule',
    mute: [{ fichier: 'src/shared/droit-image.ts', avant: "  const raison = o.raison?.trim() && (a.at ?? '').slice(0, 10) < BASCULE_DE_L_IDENTITE ? maisonRaisonAvantLaBascule() : o.raison;", apres: '  const raison = o.raison;' }] },
  { nom: 'le nom de la Maison se repete dans "Entre ..."', crie: 'ECHEC D. "Entre ..." ne repete pas le nom de la Maison',
    mute: [{ fichier: 'src/shared/registre.ts', avant: '  if (nom.toLowerCase() === maison.trim().toLowerCase()) return legales ? `${maison} (${legales})` : maison;\n', apres: '' }] },
  { nom: 'une lettre sans mentions n a plus de repli', crie: 'ECHEC A. une lettre de Maison MND sans mentions tapees prend le registre',
    mute: [{ fichier: 'src/shared/secretariat-pur.ts', avant: 'rccm: lu?.rccm?.trim() || REGISTRE_MAISON_MND.rccm', apres: "rccm: lu?.rccm?.trim() ?? ''" }] },
  { nom: 'le PDF perd sa ligne legale', crie: 'ECHEC D. le PDF de facture pose la ligne legale',
    mute: [{ fichier: 'src/shared/pdf.ts', avant: "    doc.text(pdfSafe(ligneLegaleSousLeNom(d.legal, maisonNom())), W / 2, 280.5, { align: 'center' });\n", apres: '' }] },
  /* ── Relecture du 10 octobre : une faute par constat corrigé ── */
  { nom: 'la fiche JSON-LD qui nomme les fondateurs reprend le RCCM', crie: 'ECHEC A. le noeud JSON-LD qui nomme une personne',
    mute: [{ fichier: 'scripts/genere-revelateur.mjs', avant: "  legalName: COMMUN.editeur.nomCommercial,\n", apres: "  legalName: COMMUN.editeur.nomCommercial,\n  identifier: { '@type': 'PropertyValue', propertyID: 'RCCM', value: COMMUN.editeur.rccm },\n" }] },
  { nom: 'la phrase du registre refait de la Maison sa propre enseigne', crie: 'ECHEC A. "Qui est la Maison MND" dit le registre',
    mute: [{ fichier: 'src/apps/revelateur/contenu.ts', avant: '« ${ED.nomCommercial} » en est à la fois l’enseigne et le nom commercial.', apres: '${ED.nomCommercial} est à la fois son enseigne et son nom commercial.' }] },
  { nom: 'les mentions legales refont de la Maison sa propre enseigne', crie: 'ECHEC A. la Maison n est pas sa propre enseigne',
    mute: [{ fichier: 'scripts/genere-revelateur.mjs', avant: '« ${echappe(COMMUN.editeur.nomCommercial)} » en est à la fois l’enseigne et le nom commercial.', apres: '${echappe(COMMUN.editeur.nomCommercial)} est à la fois son enseigne et son nom commercial.' }] },
  { nom: 'une retouche du registre n est plus remise', crie: 'ECHEC A. une retouche du registre est remise',
    mute: [{ fichier: 'src/apps/revelateur/contenu.ts', avant: "      if (s.type === 'texte' && s.cle === 'registre' && s.corps !== PHRASE_DU_REGISTRE) { s.corps = PHRASE_DU_REGISTRE; n++; }\n", apres: '' }] },
  { nom: 'le generateur n appelle plus la remise du registre', crie: 'ECHEC A. le generateur remet la phrase APRES les retouches',
    mute: [{ fichier: 'scripts/genere-revelateur.mjs', avant: '  const remis = contenu.remetsLaPhraseDuRegistre(PAGES);\n', apres: '  const remis = 0;\n' }] },
  { nom: 'une ligne MND aux numeros d ACIA 1 n est plus corrigee a la lecture', crie: 'ECHEC A. une ligne MND restee aux numeros d ACIA 1',
    mute: [{ fichier: 'src/shared/secretariat-pur.ts', avant: "  const lu = corrigeLesMentionsMND({ entite: 'mnd', rccm: m?.rccm, ifu: m?.ifu }) ?? m;\n", apres: '  const lu = m;\n' }] },
  { nom: 'le contrat de travail n est plus une piece d employeur', crie: 'ECHEC D. la liste des pieces d employeur',
    mute: [{ fichier: 'src/shared/secretariat-modeles.ts', avant: "  'attestation-travail', 'contrat-travail',\n", apres: "  'attestation-travail',\n" }] },
  { nom: 'l ecran cree la piece d employeur au nom choisi', crie: 'ECHEC D. l ecran cree la piece au nom de l employeur',
    mute: [{ fichier: 'src/apps/trone/routes/pilotage/Secretariat.tsx', avant: 'nouvellePiece({ branchId, entite: auNomDe,', apres: 'nouvellePiece({ branchId, entite,' }] },
  { nom: 'la raison d avant redevient une constante', crie: 'ECHEC D. avant la bascule, la raison d alors a la lettre',
    mute: [{ fichier: IDENTITE, avant: '  if (avant) return avant;\n', apres: '' }] },
  { nom: 'la migration ne garde plus la raison d avant', crie: 'ECHEC B. la raison remplacee est gardee a la lettre',
    mute: [{ fichier: IDENTITE, avant: ", raisonAvant: (i.raisonAvant ?? '').trim() || ancienne };", apres: ' };' }] },
  { nom: 'le PDF d avant la bascule regagne une ligne legale', crie: 'ECHEC D. le PDF d avant la bascule n avait pas de ligne legale',
    mute: [{ fichier: IDENTITE, avant: "  (jourIso ?? '').slice(0, 10) < BASCULE_DE_L_IDENTITE ? undefined : maisonRaison();", apres: '  maisonRaison();' }] },
  { nom: 'Factures repasse le PDF a la raison du jour', crie: 'ECHEC D. la facture : l ecran dit la raison de son jour',
    mute: [{ fichier: 'src/apps/trone/routes/vente/Factures.tsx', avant: 'legal: maisonRaisonDuPdfAu(d.date),', apres: 'legal: maisonRaisonAu(d.date),' }] },
  { nom: 'le pied du PDF repete le nom de la Maison', crie: 'ECHEC D. sous un pied qui nomme deja la Maison',
    mute: [{ fichier: 'src/shared/registre.ts', avant: '  return premier.toLowerCase() === (nom ?? \'\').trim().toLowerCase() && legales ? legales : r;\n', apres: '  return r;\n' }] },
  { nom: 'le PDF n emploie plus la ligne sans redite', crie: 'ECHEC D. le PDF de facture pose la ligne legale',
    mute: [{ fichier: 'src/shared/pdf.ts', avant: 'pdfSafe(ligneLegaleSousLeNom(d.legal, maisonNom()))', apres: 'pdfSafe(d.legal.trim())' }] },
  { nom: 'l aide de la raison redit societe', crie: 'ECHEC D. les ecrans de l identite ne disent pas',
    mute: [{ fichier: 'src/apps/trone/routes/systeme/Textes.tsx', avant: 'ne dit pas sous quel registre la Maison s’engage.', apres: 'lie un nom commercial, pas une société.' }] },
  { nom: 'payer.html change de marchand et garde l ancien en commentaire', crie: 'ECHEC E. le marchand Mobile Money garde son nom',
    mute: [{ fichier: 'public/payer.html', avant: '<b id="nomMarchand">ACIA1</b>', apres: '<b id="nomMarchand">Maison MND</b><!-- <b id="nomMarchand">ACIA1</b> -->' }] },
];

const BANNIERE = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`;

const relDe = (abs) => path.relative(racine, abs).split(path.sep).join('/');
const greffon = (mute) => ({
  name: 'faute-en-memoire',
  setup(b) {
    b.onLoad({ filter: /\.(ts|tsx|mjs|js)$/ }, (args) => {
      const rel = relDe(args.path);
      const ici = mute.filter((m) => m.fichier === rel && m.avant !== undefined);
      if (!ici.length) return undefined;
      let s = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n');
      for (const m of ici) s = s.split(m.avant).join(m.apres ?? '');
      return { contents: s, loader: path.extname(args.path).slice(1) === 'mjs' ? 'js' : path.extname(args.path).slice(1), resolveDir: path.dirname(args.path) };
    });
  },
});

const construisEtLance = async (mute) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-l-identite-de-la-maison-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-l-identite-de-la-maison.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      plugins: mute.length ? [greffon(mute)] : [],
      define: {
        'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }),
        ...(mute.length ? { __FAUTE__: JSON.stringify(mute) } : {}),
      },
      banner: { js: BANNIERE },
    });
    /* Dans un processus fils : le harnais finit par `process.exit`, qui
       tuerait le lanceur avant son `finally`. */
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
};

if (!prouve) {
  const r = await construisEtLance([]);
  process.stdout.write(`${r.stdout ?? ''}${r.stderr ?? ''}`);
  process.exitCode = r.status ?? 1;
} else {
  const fichiers = [...new Set(FAUTES.flatMap((f) => f.mute.map((m) => m.fichier)))].sort();
  const empreintes = () => Object.fromEntries(fichiers.map((f) => [f, createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex')]));
  const avant = empreintes();
  let tenues = 0;
  try {
    for (const f of FAUTES) {
      /* Une faute qui ne trouve plus son texte ne prouve rien : on le dit. */
      const perimee = f.mute.filter((m) => m.avant !== undefined && !readFileSync(path.join(racine, m.fichier), 'utf8').replace(/\r\n/g, '\n').includes(m.avant));
      if (perimee.length) { console.log(`PERIMEE ${f.nom} : texte introuvable dans ${perimee.map((m) => m.fichier).join(', ')}`); continue; }
      const r = await construisEtLance(f.mute);
      const sortie = `${r.stdout ?? ''}${r.stderr ?? ''}`;
      const crie = r.status !== 0 && sortie.split(/\r?\n/).some((l) => l.startsWith(f.crie));
      if (crie) tenues++;
      console.log(`${crie ? 'CRIE   ' : 'MUET   '} ${f.nom}${crie ? '' : `\n        attendu une ligne "${f.crie}"`}`);
      /* Ce que le harnais a dit sous cette faute : ses lignes en echec. */
      if (process.argv.includes('--montre') || !crie) {
        for (const l of sortie.split(/\r?\n/).filter((x) => /^ECHEC|^\s+(attendu|obtenu)|Error/.test(x)).slice(0, 8)) console.log(`        | ${l}`);
      }
    }
  } finally {
    const apres = empreintes();
    const bouges = fichiers.filter((f) => avant[f] !== apres[f]);
    console.log(`\nEmpreintes md5 des ${fichiers.length} fichiers fautes : ${bouges.length ? `BOUGEES (${bouges.join(', ')})` : 'identiques avant et apres'}.`);
    if (bouges.length) process.exitCode = 1;
  }
  const tient = tenues === FAUTES.length;
  console.log(tient ? `La preuve tient : ${tenues} fautes sur ${FAUTES.length} font crier le harnais.` : `LA PREUVE NE TIENT PAS : ${tenues} sur ${FAUTES.length}.`);
  if (!tient) process.exitCode = 1;
}
