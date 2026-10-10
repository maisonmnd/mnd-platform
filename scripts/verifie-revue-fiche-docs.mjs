import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LA REVUE DU 10 OCTOBRE 2026, LOT « FICHE-DOCS », EPROUVEE.
   `node scripts/verifie-revue-fiche-docs.mjs`

   Le banc (`verifie-revue-fiche-docs.harnais.ts`) tourne dans un PROCESSUS
   FILS : il finit par `process.exit`, et le lanceur doit garder la main pour
   effacer son dossier temporaire dans le `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie sur
   l'epreuve qui la garde. Un banc qui passe avec la faute remise ne prouve
   rien.

   Reprise du 10 octobre 2026 : la preuve ne touche PLUS l'arbre de travail.
   D'autres sessions ecrivent dans mnd-platform en meme temps ; remettre une
   faute dans le vrai Customers.tsx puis le restaurer depuis une copie prise
   avant effacait sans bruit ce qu'une autre session y aurait ecrit entre
   les deux, et le md5 « d'avant » annoncait justement « rendu a l'octet
   pres ». La preuve travaille donc sur une COPIE de src/ (et du banc) dans
   le dossier temporaire ; les paquets se lisent dans le vrai node_modules
   par `nodePaths` (comme verifie-la-lecture-du-magasin), sans jonction a
   defaire. Toute ecriture passe par `ecrisDansLaCopie`, qui refuse un
   chemin hors de la copie. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-revue-fiche-docs-'));
const copie = path.join(dossier, 'arbre');
const BANC = 'scripts/verifie-revue-fiche-docs.harnais.ts';
const md5 = (f) => createHash('md5').update(readFileSync(f)).digest('hex');

const construis = (depuis, sortie) => build({
  entryPoints: [path.join(depuis, BANC)],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: sortie,
  logLevel: 'error',
  nodePaths: [path.join(racine, 'node_modules')],
  loader: { '.css': 'empty' },
  define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
  banner: {
    /* Les magasins (l'identite de la Maison) lisent un localStorage et
       parlent a une fenetre : une memoire et une fenetre muettes suffisent. */
    js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k), key: () => null, length: 0 };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, location: { href: '', hash: '' }, setTimeout: () => 0 };
globalThis.document = { addEventListener() {}, body: { dataset: {} }, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} } }), querySelectorAll: () => [] };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
  },
});
/* Le banc lit les sources par chemin relatif : il tourne DANS l'arbre qu'il
   eprouve (le vrai pour le banc, la copie pour la preuve). */
const lance = (sortie, cwd) => spawnSync(process.execPath, [sortie], { cwd, encoding: 'utf8' });

const dansLaCopie = (f) => {
  const rel = path.relative(copie, f);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};
const ecrisDansLaCopie = (f, texte) => {
  if (!dansLaCopie(f)) throw new Error(`ecriture refusee hors de la copie : ${f}`);
  writeFileSync(f, texte);
};
const restaureDansLaCopie = (sauve, f) => {
  if (!dansLaCopie(f)) throw new Error(`restauration refusee hors de la copie : ${f}`);
  copyFileSync(sauve, f);
};

const CU = 'src/apps/trone/routes/clients/Customers.tsx';
const PR = 'src/apps/trone/routes/pilotage/Predictions.tsx';
const PA = 'src/apps/trone/routes/systeme/Parametres.tsx';
const SP = 'src/shared/secretariat-pur.ts';
const ED = 'src/apps/trone/routes/pilotage/secretariat/Editeur.tsx';
/* Chaque faute : le fichier, le texte corrige, la faute d'avant, et
   l'epreuve qui doit crier. */
const FAUTES = [
  /* A. la reprise annoncee */
  [CU, 'const repriseActive = !client.sansRepriseAuto && !!rythme;', 'const repriseActive = !client.sansRepriseAuto && (!!client.rythmeSemaines || !!cadenceObs);', 'A2 '],
  [CU, '<b>{rythme.semaines} semaines</b>', '<b>{client.rythmeSemaines ?? cadenceObs!.semaines} semaines</b>', 'A3 '],
  [CU, "      : estDiaspora(client) ? { court: 'diaspora', dit: 'elle vit à l’étranger, pas de reprise sans rythme posé' }\n", '', 'A4 '],
  /* B. la civilite */
  [CU, '`Bonjour ${appelDe(c)},\\n\\n`', '`Bonjour ${prenom},\\n\\n`', 'B1 '],
  [CU, 'message={`Bonjour ${appelDe(client)}, la Maison MND', 'message={`Bonjour ${prenom}, la Maison MND', 'B1 '],
  /* C. le tiret cadratin */
  [CU, ": ','} son téléphone", ": ' —'} son téléphone", 'C1 '],
  [CU, "{', '}compté par", "{' — '}compté par", 'C1 '],
  [CU, 'rituels lui ont été offerts`} :{\' \'}', 'rituels lui ont été offerts`} —{\' \'}', 'C1 '],
  [CU, 'séances`} :{\' \'}', 'séances`} —{\' \'}', 'C1 '],
  [CU, 'cumulés{palierFoyer ? <>, sceau « ', 'cumulés{palierFoyer ? <> — sceau « ', 'C1 '],
  [CU, 'en centimètres, facultatif : c', 'en centimètres — facultatif, c', 'C1 '],
  [PR, "${m.question.replace(' ?', '')}, ne plus prédire son retour", "${m.question.replace(' ?', '')} — ne plus prédire son retour", 'C1 '],
  [PR, '<b>Jamais un jour fermé</b> : {joursFermes}', '<b>Jamais un jour fermé</b> — {joursFermes}', 'C1 '],
  [PA, "${f.raison}`).join(' ; ')}", "${f.raison}`).join(' — ')}", 'C1 '],
  /* Reprise : une incise ENTRE DEUX BALISES (l'ancien permis la taisait),
     et un « — x — » hors d'un menu. */
  [PR, '<b>Jamais un jour fermé</b> : {joursFermes}', '<b>Jamais un jour fermé</b> — <i>{joursFermes}</i>', 'C1 '],
  [CU, '<option value="">— aucun —</option>', '<span>— aucun —</span>', 'C1 '],
  /* D. la serie du secretariat */
  [SP, "  p.etat === 'a-signer' && !p.numero;", "  p.etat === 'a-signer' || p.etat === 'signe';", 'D1 '],
  [ED, '{direction && signaturesRetirables(p) && <Button', "{direction && (p.etat === 'a-signer' || p.etat === 'signe') && <Button", 'D2 '],
  /* Reprise : « Corriger » refuse a une piece deja annulee. */
  [SP, "(p.etat === 'signe' || p.etat === 'annule') && !!p.numero;", "p.etat === 'signe' && !!p.numero;", 'D3 '],
  [ED, '{corrigeable(p) && <Button', "{p.etat === 'signe' && <Button", 'D4 '],
  /* E. la memoire de cet appareil */
  [PA, 'const [memoire, setMemoire] = useState(litLaMemoire);', 'const memoire = litLaMemoire(); const setMemoire = (_m: unknown) => {};', 'E1 '],
  /* F. la ligne legale du releve */
  [CU, '      legal: maisonRaisonDuPdfAu(jour),\n', '', 'F1 '],
  [CU, 'legal: maisonRaisonDuPdfAu(jour),', 'legal: maisonRaison(),', 'F1 '],
  [CU, '      date: jour,\n', '      date: todayISO(),\n', 'F1 '],
];

try {
  const sortie = path.join(dossier, 'harnais.mjs');
  await construis(racine, sortie);
  const r = lance(sortie, racine);
  process.stdout.write(`${r.stdout ?? ''}${r.stderr ?? ''}`);
  let code = r.status ?? 1;
  if (prouve) {
    if (code !== 0) {
      console.log('\nLe banc echoue deja sur le code corrige : la preuve ne peut pas commencer.');
    } else {
      /* La copie : src/ entier (le banc importe src/shared), le banc, et ce
         que lit esbuild a la racine. */
      mkdirSync(path.join(copie, 'scripts'), { recursive: true });
      cpSync(path.join(racine, 'src'), path.join(copie, 'src'), { recursive: true });
      copyFileSync(path.join(racine, BANC), path.join(copie, BANC));
      for (const f of ['tsconfig.json', 'package.json']) {
        if (existsSync(path.join(racine, f))) copyFileSync(path.join(racine, f), path.join(copie, f));
      }
      const sortieCopie = path.join(dossier, 'harnais-copie.mjs');
      await construis(copie, sortieCopie);
      const r0 = lance(sortieCopie, copie);
      if (r0.status !== 0) {
        process.stdout.write(`${r0.stdout ?? ''}${r0.stderr ?? ''}`);
        console.log('\nLa copie echoue avant toute faute (un fichier saisi en cours d ecriture ?) : relancer.');
        code = 1;
      } else {
        let tenues = 0;
        let i = 0;
        for (const [rel, bon, faute, epreuve] of FAUTES) {
          const f = path.join(copie, rel);
          const avant = md5(f);
          const sauve = path.join(dossier, `sauve-${i++}-${path.basename(f)}`);
          copyFileSync(f, sauve);
          let cri = false;
          try {
            const texte = readFileSync(f, 'utf8');
            /* Le fichier peut etre en CRLF : le texte cherche suit ses fins de ligne. */
            const fin = texte.includes('\r\n') ? '\r\n' : '\n';
            const a = bon.replace(/\n/g, fin);
            const n = texte.split(a).length - 1;
            if (n !== 1) throw new Error(`${rel} : ${n} occurrence(s) du texte corrige, la faute ne peut pas se remettre`);
            ecrisDansLaCopie(f, texte.replace(a, () => faute.replace(/\n/g, fin)));
            await construis(copie, sortieCopie).catch(() => {});
            const rf = lance(sortieCopie, copie);
            const dite = `${rf.stdout ?? ''}${rf.stderr ?? ''}`;
            cri = rf.status !== 0 && dite.includes(`ECHEC ${epreuve}`);
          } catch (e) {
            console.log(String(e?.message ?? e));
          } finally {
            restaureDansLaCopie(sauve, f);
          }
          const intact = md5(f) === avant;
          console.log(`${cri && intact ? 'CRIE ' : 'MUET '} ${rel} -> ${epreuve.trim()}${intact ? '' : ' (COPIE NON RESTAUREE)'}`);
          if (cri && intact) tenues += 1;
        }
        const tient = tenues === FAUTES.length;
        console.log(tient
          ? `\nLa preuve tient : les ${FAUTES.length} fautes remises dans une copie font crier le banc, chaque fichier de la copie rendu a l'octet pres ; l'arbre de travail n'a pas ete ecrit.`
          : `\nLA PREUVE NE TIENT PAS : ${FAUTES.length - tenues} faute(s) sans cri.`);
        code = tient ? 0 : 1;
      }
    }
  }
  process.exitCode = code;
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
