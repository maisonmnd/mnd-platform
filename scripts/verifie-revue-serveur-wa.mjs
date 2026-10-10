import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA REVUE DU 10 OCTOBRE 2026, LOT « SERVEUR-WA », EPROUVEE —
   `node scripts/verifie-revue-serveur-wa.mjs`.

   Le banc vit dans `verifie-revue-serveur-wa.harnais.ts` et tourne dans un
   processus fils (un `process.exit` du banc ne tue pas le lanceur avant son
   `finally` : le dossier temporaire s'efface toujours). Le lanceur y depose
   `whatsapp-webhook` et `whatsapp-envoi` TELS QU'ILS SERONT COLLES dans
   Supabase, transformes en JavaScript, leurs deux imports npm remplaces par
   un faux module que le banc tient (`globalThis.__fauxSupabase`).

   `--prouve` REMET CHAQUE FAUTE, UNE A UNE : le fichier est lu, son empreinte
   prise, la faute d'avant reposee a la place de la correction, le banc
   rejoue, puis le fichier rendu tel quel dans un `finally` et son empreinte
   comparee. Le banc doit crier sur l'epreuve de CETTE faute, sinon il ne
   prouve rien. Les motifs sont entre apostrophes droites, jamais dans un
   gabarit : un `${...}` y serait evalue, et le controle serait mort. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const FONCTIONS = ['whatsapp-webhook', 'whatsapp-envoi'];

/** Un passage du banc : construit, lance dans un fils, rend sa sortie. */
async function banc(muet) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-revue-serveur-wa-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    const cale = path.join(dossier, 'faux-npm.mjs');
    writeFileSync(cale, [
      'const f = globalThis.__fauxSupabase;',
      'export const createClient = (...a) => f.createClient(...a);',
      'export default { setVapidDetails: (...a) => f.webpush.setVapidDetails(...a), sendNotification: (...a) => f.webpush.sendNotification(...a) };',
      '',
    ].join('\n'));
    const url = pathToFileURL(cale).href;
    for (const nom of FONCTIONS) {
      const brut = readFileSync(path.join(racine, `supabase/functions/${nom}/index.ts`), 'utf8');
      const src = brut.split("'npm:@supabase/supabase-js@2'").join(`'${url}'`).split("'npm:web-push@3.6.7'").join(`'${url}'`);
      const { code } = await transform(src, { loader: 'ts', format: 'esm' });
      writeFileSync(path.join(dossier, `${nom}.mjs`), code);
    }
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-revue-serveur-wa.harnais.ts')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: sortie,
      logLevel: 'error',
    });
    const r = spawnSync(process.execPath, [sortie, dossier], { cwd: racine, encoding: 'utf8', timeout: 120_000 });
    const texte = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    if (!muet) process.stdout.write(texte);
    return { status: r.status ?? 1, texte };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const HOOK = 'supabase/functions/whatsapp-webhook/index.ts';
const ENVOI = 'supabase/functions/whatsapp-envoi/index.ts';
/* LES FAUTES D'AVANT, une par constat (ou par chemin d'un constat). `cri`
   est le debut du nom de l'epreuve qui doit tomber. */
const FAUTES = [
  { n: 'n0 (piece)', f: HOOK, cri: 'n0 une piece qui pend',
    paires: [['      headers: { authorization: `Bearer ${jeton}` },\n      signal: AbortSignal.timeout(DELAI_DE_META_MS),\n    });\n    const meta = await r1.json()',
      '      headers: { authorization: `Bearer ${jeton}` },\n    });\n    const meta = await r1.json()']] },
  { n: 'n0 (fichier)', f: HOOK, cri: 'n0 chaque fetch de whatsapp-webhook',
    paires: [['      signal: AbortSignal.timeout(DELAI_DU_FICHIER_MS),\n', '']] },
  { n: 'n0 (accuse)', f: HOOK, cri: 'n0 chaque fetch de whatsapp-webhook',
    paires: [['      body: JSON.stringify(charge),\n      signal: AbortSignal.timeout(DELAI_DE_META_MS),\n    });', '      body: JSON.stringify(charge),\n    });']] },
  { n: 'n1 (envoi)', f: ENVOI, cri: 'n1 un envoi qui pend',
    paires: [['      body: JSON.stringify(charge),\n      signal: AbortSignal.timeout(DELAI_DE_META_MS),\n    });', '      body: JSON.stringify(charge),\n    });']] },
  { n: 'n1 (depot)', f: ENVOI, cri: 'n1 chaque fetch de whatsapp-envoi',
    paires: [['        signal: AbortSignal.timeout(DELAI_DU_DEPOT_MS),\n', '']] },
  { n: 'n2', f: ENVOI, cri: 'n2 une demande du site',
    paires: [["      .or('data->>canal.is.null,data->>canal.neq.site')\n", '']] },
  { n: 'n3', f: HOOK, cri: 'n3 deux livraisons',
    /* La faute d'avant : aucune reservation, la seule ecriture vient apres
       la reponse de Graph (oter le seul `return` ne suffit pas a la remettre :
       la fenetre de course se reduirait a un tour de boucle). */
    paires: [["  const { data: reservee, error: errReserve } = await sb.from('messages_wa')\n    .upsert(ligne('', 'en-route'), { onConflict: 'id', ignoreDuplicates: true }).select('id');",
      "  const { data: reservee, error: errReserve } = { data: [{ id }], error: null as { message: string } | null };"]] },
  { n: 'n4 (reprise)', f: HOOK, cri: 'n4 une relivraison',
    paires: [["    if (!estNeuf(e)) continue;\n    const m = (e.bouton?.id ?? '').match(/^REPRISE_", "    const m = (e.bouton?.id ?? '').match(/^REPRISE_"]] },
  { n: 'n4 (versement)', f: HOOK, cri: 'n4 chaque boucle',
    paires: [["    if (!estNeuf(e)) continue;\n    const id = e.bouton?.id ?? '';", "    const id = e.bouton?.id ?? '';"]] },
  { n: 'n4 (conge)', f: HOOK, cri: 'n4 chaque boucle',
    paires: [['    if (!estNeuf(e) || !e.formulaire) continue;', '    if (!e.formulaire) continue;']] },
  { n: 'n4 (automatiques)', f: HOOK, cri: 'n4 chaque boucle',
    paires: [['      if (!estNeuf(e)) continue;\n      const tete = tetes.get(e.numero);', '      const tete = tetes.get(e.numero);']] },
  { n: 'n79 (course)', f: ENVOI, cri: 'n79 deux postes',
    paires: [['  if (cleUnique) {\n    idReserve = await idDeLaCle(cleUnique);', '  if (false && cleUnique) {\n    idReserve = await idDeLaCle(cleUnique);']] },
  { n: 'n79 (reprise)', f: ENVOI, cri: 'n79 un merci refuse',
    paires: [["      const reprenable = avant.etat === 'non-remis'", "      const reprenable = avant.etat === 'jamais'"]] },
];

const empreinte = (s) => createHash('md5').update(s).digest('hex');

if (!prouve) {
  const r = await banc(false);
  process.exitCode = r.status;
} else {
  let faux = 0;
  const net = await banc(true);
  console.log(`Code corrige : ${net.status === 0 ? 'le banc passe' : 'LE BANC ECHOUE'}`);
  if (net.status !== 0) { process.stdout.write(net.texte); faux++; }
  for (const faute of FAUTES) {
    const p = path.join(racine, faute.f);
    const avant = readFileSync(p, 'utf8');
    const md5Avant = empreinte(avant);
    let reponse = '';
    let restaure = false;
    try {
      let fautif = avant;
      const fin = avant.includes('\r\n') ? '\r\n' : '\n';
      for (const [brutCorrige, brutAncien] of faute.paires) {
        const corrige = brutCorrige.replace(/\n/g, fin);
        const ancien = brutAncien.replace(/\n/g, fin);
        const n = fautif.split(corrige).length - 1;
        if (n !== 1) throw new Error(`motif trouve ${n} fois dans ${faute.f} : ${corrige.slice(0, 60)}`);
        fautif = fautif.replace(corrige, () => ancien);
      }
      writeFileSync(p, fautif);
      const r = await banc(true);
      const echec = new RegExp(`^ECHEC ${faute.cri}`, 'm').test(r.texte);
      reponse = r.status !== 0 && echec ? 'le banc crie' : `LE BANC SE TAIT (statut ${r.status})`;
      if (!(r.status !== 0 && echec)) { faux++; process.stdout.write(r.texte); }
    } catch (e) {
      reponse = `IMPOSSIBLE : ${e.message}`;
      faux++;
    } finally {
      writeFileSync(p, avant);
      restaure = empreinte(readFileSync(p, 'utf8')) === md5Avant;
      if (!restaure) faux++;
    }
    console.log(`${faute.n.padEnd(20)} ${reponse.padEnd(28)} md5 ${md5Avant} ${restaure ? 'rendu identique' : 'NON RENDU'}`);
  }
  console.log(faux === 0
    ? `\nLa preuve tient : ${FAUTES.length} fautes remises, le banc crie sur chacune, chaque fichier rendu octet pour octet.`
    : `\nLA PREUVE NE TIENT PAS (${faux} defaut(s)).`);
  process.exitCode = faux === 0 ? 0 : 1;
}
