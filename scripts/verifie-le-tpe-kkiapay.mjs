import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE TPE KKIAPAY, EPROUVE - 22 novembre 2026.
   `node scripts/verifie-le-tpe-kkiapay.mjs` : le banc, dans un processus fils.
   `--prouve` : chaque faute est remise une a une dans le vrai fichier, et le
   banc doit crier a chacune. Le paquet s ecrit dans un dossier PAR LANCEMENT ;
   chaque ecriture reessaie cinq secondes (OneDrive tient parfois un fichier) ;
   une restauration ratee se crie avec son remede. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', `verifie-le-tpe-kkiapay-${process.pid}`);
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-tpe-kkiapay.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const TRACE = 'src/shared/trace-du-moyen-pur.ts';
const TPE = 'src/shared/tpe-kkiapay-pur.ts';
const FN = 'supabase/functions/kkiapay-tpe/index.ts';
const ECRAN = 'src/apps/trone/routes/vente/TraceDuMoyen.tsx';
const ENC = 'src/apps/trone/routes/clients/actions.tsx';
const PANNES = [
  ['le TPE retombe dans la famille carte', TRACE, "  if (/^carte\\s*·\\s*kkiapay/.test(m)) return 'kkiapay';\n", ''],
  ['une reference pas verifiee suffit', TRACE, '    if (!k.verifieeLe) return false;\n', ''],
  ['un montant trop court passe', TRACE, '    return kkiapayCouvre(k, montantXof) !== false;', '    return true;'],
  ['KkiaPay muet bloque l encaissement', TRACE, '    if (k.injoignable) return true;\n', ''],
  ['la reference ne s ecrit plus sur le versement', TRACE, '        ref: refKkiapayPropre(k.ref),', "        ref: '',"],
  ['un paiement en ligne se propose au TPE', TPE, "  if (String(d.partnerId ?? '').trim()) return null;\n", ''],
  ['un paiement deja pris se propose encore', TPE, '      if (o.dejaPris.has(r.ref) || vus.has(r.ref)) return false;', '      if (vus.has(r.ref)) return false;'],
  ['le bon montant n est plus en tete', TPE, '.sort((a, b) => Number(b.juste) - Number(a.juste) || Date.parse(b.at) - Date.parse(a.at));', '.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));'],
  ['l heure n est plus celle de Cotonou', TPE, '  const d = new Date(t + 60 * 60_000);', '  const d = new Date(t);'],
  ['la fonction ne verifie plus le personnel', FN, "  if (errStaff || estPersonnel !== true) return json({ ok: false, raison: 'refusee', version: VERSION }, 403);\n", ''],
  ['la fonction croit un statut non abouti', FN, "  if (statut !== 'SUCCESS') return json({ ok: false, raison: 'pas-reussie', statut, version: VERSION });\n", ''],
  ['un paiement en ligne se rend comme un paiement du TPE', FN, "    if (deja && String(deja.data?.partnerId ?? '').trim()) return json({ ok: false, raison: 'deja-en-ligne', version: VERSION });\n", ''],
  ['le navigateur ne la lit plus', FN, "  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });\n", ''],
  ['l ecran redemande le n° d autorisation', ECRAN, "      ) : famille === 'kkiapay' ? (\n        <ChampsDuTpe t={t} pose={pose} branchId={branchId} montantXof={montantXof} id={id} />\n", ''],
  ['une reference deja prise se revérifie', ECRAN, "    if (pris.has(ref)) { pose({ kkiapay: undefined }); setMessage('Cette référence règle déjà une autre pièce.'); return; }\n", ''],
  ['l encaissement juge sans le montant', ENC, '    return fam && m > 0 && !traceSuffit(fam, pt.trace, m) ? fam : null;', '    return fam && m > 0 && !traceSuffit(fam, pt.trace) ? fam : null;'],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const ecris = (f, contenu) => {
  let derniere;
  for (let i = 0; i < 25; i++) {
    try { writeFileSync(path.join(racine, f), contenu); return; } catch (e) { derniere = e; pause(200); }
  }
  throw derniere;
};

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); console.log(propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((p) => p[1]))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, fichier, a, b] of PANNES) {
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (texte.split(a).length !== 2) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, () => b);
      ecris(fichier, crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = await lanceLeBanc();
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        ecris(fichier, gardes[fichier]);
      }
    }
  } finally {
    for (const f of fichiers) {
      try { ecris(f, gardes[f]); } catch { console.log(`RESTAURATION RATEE de ${f} : la panne y est peut-etre restee. Remede : git checkout -- ${f}`); }
    }
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(`\n${PANNES.length - muettes}/${PANNES.length} pannes criees${intacts ? ', fichiers restaures a l identique' : ', FICHIERS ALTERES'}.`);
  process.exitCode = muettes || !intacts ? 1 : 0;
}
