import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LA REVUE DU 10 OCTOBRE 2026, LOT « CLIENTS-RESTE », EPROUVEE.
   `node scripts/verifie-revue-clients-reste.mjs`

   Le banc (`verifie-revue-clients-reste.harnais.ts`) tourne dans un PROCESSUS
   FILS : il finit par `process.exit`, et le lanceur doit garder la main pour
   effacer son dossier temporaire dans le `finally`.

   `--prouve` remet chaque faute UNE A UNE dans le vrai fichier (copie de
   sauvegarde, remplacement exact, banc, restauration dans un `finally`, md5
   identique apres), et exige que le banc crie sur l'epreuve qui la garde.
   Un banc qui passe avec la faute remise ne prouve rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-revue-clients-reste-'));
const sortie = path.join(dossier, 'harnais.mjs');
const md5 = (f) => createHash('md5').update(readFileSync(f)).digest('hex');

const construis = () => build({
  entryPoints: [path.join(racine, 'scripts/verifie-revue-clients-reste.harnais.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: sortie,
  logLevel: 'error',
  loader: { '.css': 'empty' },
  define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
});
const lance = () => spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });

const C = 'src/apps/trone/routes/clients';
/* Chaque faute : le fichier, le texte corrige, la faute d'avant, et
   l'epreuve qui doit crier. */
const FAUTES = [
  [`${C}/QrCodes.tsx`, "window.open('', '_blank', 'width=520,height=760');", "window.open('', '_blank', 'noopener,width=520,height=760');", 'A1 '],
  [`${C}/Vitrine.tsx`, "window.open('', '_blank', 'width=520,height=760');", "window.open('', '_blank', 'noopener,width=520,height=760');", 'A1 '],
  [`${C}/QrCodes.tsx`, '  fen.opener = null;\n', '', 'A2 '],
  [`${C}/Vitrine.tsx`, "(portee === 'site' ? tapisDuSite(", "(portee === 'jamais' ? tapisDuSite(", 'B3 '],
  [`${C}/tapis-du-site.ts`, 'reservableSurLeSite(s, cats, masques ?? {})', 'reservableSurLeSite(s, cats, {})', 'B1 '],
  [`${C}/LeBilanDeLaSeance.tsx`, 'garde({ ...noteVive.current, brouillon: b', 'garde({ ...note, brouillon: b', 'C1 '],
  [`${C}/EditeurDuSite.tsx`, 'brouillonDuSiteStore.set((b) => resteDuBrouillon(b, parti));', 'brouillonDuSiteStore.set({ pages: {} });', 'D3 '],
  ['src/shared/site-retouches.ts', 'if (!(cle in envoye) || envoye[cle] !== v) reste[cle] = v;', 'if (!(cle in envoye)) reste[cle] = v;', 'D1 '],
  [`${C}/BilanModal.tsx`, 'Séance du {frShortAn(b.date)}', 'Séance du {frShort(b.date)}', 'E2 '],
  [`${C}/CarteDeMarrainePanneau.tsx`, "{ day: 'numeric', month: 'short', year: 'numeric' }", "{ day: 'numeric', month: 'short' }", 'E1 '],
  [`${C}/Demandes.tsx`, "{ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }", "{ weekday: 'long', day: 'numeric', month: 'long' }", 'E1 '],
  [`${C}/EnvoisAutomatiques.tsx`, "const jour = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });", "const jour = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });", 'E1 '],
  [`${C}/SalleDesEnvois.tsx`, "{ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }", "{ weekday: 'short', day: 'numeric', month: 'short' }", 'E1 '],
  ['src/apps/trone/routes/pilotage/Dashboard.tsx', '/${d.date.slice(0, 4)}', '', 'E3 '],
  ['src/shared/ambassade.ts', 'if (sesNoms.some((n) => deja.has(n))) {', 'if (deja.has(f.recompenseId)) {', 'F2 '],
  ['src/shared/offers.ts', 'dont le prix se dit à la Maison', 'dont le prix se dit au salon', 'G1 '],
  ['src/shared/parcours.ts', 'remises à des clientes de la Maison', 'remises à des clientes du salon', 'G1 '],
  /* Reprise du 10 octobre 2026 : la faute du `sed` elle-meme, un accent grave
     en tete de chaque ligne, remise sur le fichier qu'elle a casse et sur un
     ecran (.tsx). Le texte corrige vaut `null` : la faute est une fonction
     qui recoit le fichier entier. La construction du banc echoue alors ;
     le banc deja construit lit la syntaxe sur le disque et doit crier H1. */
  ['src/shared/site-retouches.ts', null, (t) => t.split('\n').map((l) => `\`${l}`).join('\n'), 'H1 '],
  [`${C}/EditeurDuSite.tsx`, null, (t) => t.split('\n').map((l) => `\`${l}`).join('\n'), 'H1 '],
];

try {
  await construis();
  const r = lance();
  process.stdout.write(`${r.stdout ?? ''}${r.stderr ?? ''}`);
  let code = r.status ?? 1;
  if (prouve) {
    if (code !== 0) {
      console.log('\nLe banc echoue deja sur le code corrige : la preuve ne peut pas commencer.');
    } else {
      let tenues = 0;
      for (const [rel, bon, faute, epreuve] of FAUTES) {
        const f = path.join(racine, rel);
        const avant = md5(f);
        const sauve = path.join(dossier, `sauve-${tenues}-${path.basename(f)}`);
        copyFileSync(f, sauve);
        let cri = false;
        try {
          const texte = readFileSync(f, 'utf8');
          if (bon === null) {
            const abime = faute(texte);
            if (abime === texte) throw new Error(`${rel} : la faute ne change rien`);
            writeFileSync(f, abime);
          } else {
          /* Le fichier peut etre en CRLF : le texte cherche suit ses fins de ligne. */
          const fin = texte.includes('\r\n') ? '\r\n' : '\n';
          const a = bon.replace(/\n/g, fin);
          const n = texte.split(a).length - 1;
          if (n !== 1) throw new Error(`${rel} : ${n} occurrence(s) du texte corrige, la faute ne peut pas se remettre`);
          writeFileSync(f, texte.replace(a, () => faute.replace(/\n/g, fin)));
          }
          await construis().catch(() => {});
          const rf = lance();
          const dite = `${rf.stdout ?? ''}${rf.stderr ?? ''}`;
          cri = rf.status !== 0 && dite.includes(`ECHEC ${epreuve}`);
        } finally {
          copyFileSync(sauve, f);
        }
        const apres = md5(f);
        const intact = apres === avant;
        console.log(`${cri && intact ? 'CRIE ' : 'MUET '} ${rel} -> ${epreuve.trim()}${intact ? '' : ' (FICHIER NON RESTAURE)'}`);
        if (cri && intact) tenues += 1;
      }
      await construis();
      const tient = tenues === FAUTES.length;
      console.log(tient
        ? `\nLa preuve tient : les ${FAUTES.length} fautes remises font crier le banc, chaque fichier rendu a l'octet pres.`
        : `\nLA PREUVE NE TIENT PAS : ${FAUTES.length - tenues} faute(s) sans cri.`);
      code = tient ? 0 : 1;
    }
  }
  process.exitCode = code;
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
