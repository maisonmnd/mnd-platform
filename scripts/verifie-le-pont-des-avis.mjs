import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE PONT DES AVIS, EPROUVE — 25 octobre 2026.
   `node scripts/verifie-le-pont-des-avis.mjs` : le banc, dans un processus
   fils (le paquet s'ecrit sous node_modules/.cache, ou le harnais retrouve
   esbuild pour rejouer la fonction Deno ; il s'efface dans un finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-le-pont-des-avis');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-pont-des-avis.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/avis-google-pont-pur.ts';
const FONCTION = 'supabase/functions/avis-google-pont/index.ts';
const ECRAN = 'src/apps/trone/routes/clients/ReponseAUnAvis.tsx';
const PANNES = [
  ['deux avis a egalite : on devine', PUR, 'if (proches.length > 1 && proches[0].d === proches[1].d) return null;', ''],
  ['le nom d avis n est plus verifie', PUR, 'const NOM_D_AVIS = /^accounts\\/[0-9]+\\/locations\\/[0-9]+\\/reviews\\/[A-Za-z0-9_-]+$/;', 'const NOM_D_AVIS = /^accounts\\/.+$/;'],
  ['Make fait oublier la reponse du Trone', PUR, 'const garde = !a.reponse && avant?.reponse', 'const garde = false && avant?.reponse'],
  ['sans nom, la date seule suffit', PUR, '      && aPlat(g.texte).includes(debutSeul));', '      && true);'],
  ['les champs de Make lus avec leurs majuscules', PUR, '    const cle = k.trim().toLowerCase();', '    const cle = k;'],
  ['la rubrique oublie la cle de Places', 'src/shared/avis-rubrique-pur.ts', 'cle: p ? idDeLAvis(p) : cleDeGoogle(g.name),', 'cle: cleDeGoogle(g.name),'],
  ['les dix suivants prennent les recents', 'src/shared/avis-rubrique-pur.ts', 'return avis.filter((a) => !estRecent(a, maintenant) && etatDeLAvis', 'return avis.filter((a) => true && etatDeLAvis'],
  ['la fonction ignore le nom de l avis', FONCTION, 'const g = (parSonNom ? doc.avis?.[parSonNom] : undefined)', 'const g = (undefined)'],
  ['les Finances publient', PUR, "export const DEPARTEMENTS_QUI_PUBLIENT: readonly string[] = ['dept-clientele', 'dept-marketing'];", "export const DEPARTEMENTS_QUI_PUBLIENT: readonly string[] = ['dept-clientele', 'dept-marketing', 'dept-finances'];"],
  ['le jeton n est plus verifie', FONCTION, "if (!memeSecret((req.headers.get('x-jeton') ?? '').trim(), JETON)) return refus(403, 'jeton', 'Jeton refusé.');", ''],
  ['le departement n est plus verifie', FONCTION, "if (!peutPublier((ligne as { role?: string }).role, matrice[uid])) return refus(403, 'equipe', 'Publier sur Google n’est pas ouvert à votre département.');", ''],
  ['un 200 de Make suffit, sans le statut de Google', FONCTION, "if (statut !== 200 || dit !== '200') {", 'if (statut !== 200) {'],
  ['le chemin de Make publie', FONCTION, "if (req.headers.has('x-jeton')) return await recoisUnAvis(req);", "if (req.headers.has('x-jeton') && !req.headers.get('content-type')?.includes('json')) return await recoisUnAvis(req);"],
  ['publier sans la question', ECRAN, '<Button variant="copper" size="sm" onClick={() => setConfirme(true)}', '<Button variant="copper" size="sm" onClick={() => void publier()}'],
  ['publie note avant le oui', ECRAN, 'if (r.ok) {\n        marquePublieeParLeTrone(id, r.le);', 'marquePublieeParLeTrone(id, r.le);\n      if (r.ok) {'],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((p) => p[1]))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, fichier, a, b] of PANNES) {
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, fichier), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = await lanceLeBanc();
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, fichier), gardes[fichier]);
      }
    }
  } finally {
    for (const f of fichiers) writeFileSync(path.join(racine, f), gardes[f]);
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exitCode = muettes === 0 && intacts ? 0 : 1;
}
