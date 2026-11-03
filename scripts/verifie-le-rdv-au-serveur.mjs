import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE RENDEZ-VOUS AU SERVEUR, ÉPROUVÉ : `node scripts/verifie-le-rdv-au-serveur.mjs`
   (et `--prouve` pour planter les pannes une à une).

   3 novembre 2026. Le harnais (verifie-le-rdv-au-serveur.harnais.ts) importe
   les VRAIES fonctions demande-submit et envois-partent : esbuild remplace
   leurs imports `npm:` par une base simulée, et fait sortir de demande-submit
   les quatre fonctions éprouvées. Chaque panne se plante EN MÉMOIRE, au
   chargement du fichier ou à sa lecture : l'arbre n'est jamais touché. Le
   harnais tourne dans un processus à lui (Deno et fetch y sont simulés). */

const racine = path.resolve(import.meta.dirname, '..');
const HARNAIS = path.join(racine, 'scripts/verifie-le-rdv-au-serveur.harnais.ts');
const EXPORTS_DE_LA_DEMANDE = '\nexport { envoieLAccuse, litLeRendezVous, envoieLeRetour, litLaCliente, prepareLeRetour, fichesDuNumero };\n';

const DS = 'supabase/functions/demande-submit/index.ts';
const EP = 'supabase/functions/envois-partent/index.ts';
const CR = 'supabase/functions/confirmation-rdv/index.ts';
const AM = 'scripts/serveur/assistants-maison.ts';
/** [ce qui casse, le fichier, le texte juste, le texte faux] */
const PANNES = [
  ['le modele a liens refuse ne laisse pas partir l ancien', DS, 'if (!liens || !refusDuModele(codeMeta)) break;', 'break;'],
  ['tout refus de Meta relance l ancien modele', DS, 'if (!liens || !refusDuModele(codeMeta)) break;', 'if (!liens) break;'],
  ['les jetons se signent avec la cle de la Maison', DS, "const SECRET_DES_LIENS = (Deno.env.get(NOM_DU_SECRET_DES_LIENS) ?? '').trim();", 'const SECRET_DES_LIENS = SERVICE_KEY;'],
  ['le retour attend l envoi et dit qu il est parti', DS, "  enTacheDeFond(envoieLeRetour(telephone).catch((e) => console.error('demande-submit: retour', String(e))));\n  return json({ ok: true });", '  return envoieLeRetour(telephone).then(() => json({ ok: true, envoye: true })) as unknown as Response;'],
  ['le retour repart plusieurs fois le meme jour', DS, 'if (errPris || (pris ?? []).length === 0) return;', 'if (errPris) return;'],
  ['l enfant au second numero passe avant la mere', DS, 'const candidates = (principales.length ? principales : fiches).slice(0, 4);', 'const candidates = fiches.slice(0, 4);'],
  ['la page du rendez-vous dit le nom entier', DS, 'appel, statut: etatDuRendezVous(a, aujourdhuiACotonou()),', 'appel, statut: etatDuRendezVous(a, aujourdhuiACotonou()), nom: a.clientName,'],
  ['la page du rendez-vous prend le seau des reservations', DS, "allowRate(ip, 'rdv_lire', 30)", 'allowRate(ip)'],
  ['le fil ne dit pas la reference', DS, "texte: genreAccuse === 'confirmation' ? texteDeLaConfirmation({ avecLiens, prenom, quand, reference }) : texteDeLAccuse(genreAccuse, prenom, quand),", 'texte: texteDeLAccuse(genreAccuse, prenom, quand),'],
  ['l identite d une autre fiche se relit', DS, "const clientId = await clientIdDuJetonDIdentite(SECRET_DES_LIENS, identite, aujourdhuiACotonou());", "const clientId = String(identite ?? '').split('~')[0] || null;"],
  ['le facteur ne prend jamais le repli', EP, 'if (!r.ok && colis.repli && Number.isInteger(codeDuRefus) && codeDuRefus >= 132000 && codeDuRefus < 133000) {', 'if (false) {'],
  ['le facteur prend le repli sur tout refus', EP, ' && codeDuRefus >= 132000 && codeDuRefus < 133000) {', ') {'],
  ['le fil du facteur garde le texte a liens', EP, 'texteAuFil: colis.repli.texteAuFil ?? colis.texteAuFil', 'texteAuFil: colis.texteAuFil'],
  ['confirmation-rdv relance l ancien sur tout refus', CR, '} else if (liens && refusDuModele(rep?.error?.code)) {', '} else if (liens) {'],
  ['confirmation-rdv depose sans repli', CR, 'repli: { modele: WA_TEMPLATE, composants: sansLiens, texteAuFil: texteDuFil },', ''],
  ['Opale depose sans repli', AM, 'repli: sansLiens,', ''],
];

const fauxModules = (panne) => ({
  name: 'faux-du-banc',
  setup(b) {
    b.onResolve({ filter: /^npm:/ }, (a) => ({ path: a.path, namespace: 'faux' }));
    b.onLoad({ filter: /.*/, namespace: 'faux' }, (a) => ({
      loader: 'js',
      contents: a.path.startsWith('npm:@supabase/supabase-js')
        ? 'export const createClient = (...a) => globalThis.__faux.client(...a);'
        : 'export default { setVapidDetails() {}, async sendNotification() { return {}; } };',
    }));
    b.onLoad({ filter: /supabase[\\/]functions[\\/](demande-submit|envois-partent)[\\/]index\.ts$/ }, (a) => {
      const rel = path.relative(racine, a.path).replace(/\\/g, '/');
      let src = readFileSync(a.path, 'utf8');
      if (panne && panne[1] === rel) {
        const de = panne[2].replace(/\n/g, src.includes('\r\n') ? '\r\n' : '\n');
        if (src.split(de).length !== 2) throw new Error(`PANNE INTROUVABLE : ${panne[0]}`);
        src = src.replace(de, panne[3]);
      }
      if (rel === DS) src += EXPORTS_DE_LA_DEMANDE;
      return { contents: src, loader: 'ts' };
    });
  },
});

async function tourne(panne) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-rdv-au-serveur-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [HARNAIS], bundle: true, format: 'esm', platform: 'node', target: 'es2022',
      outfile: sortie, logLevel: 'silent', plugins: [fauxModules(panne)],
      define: { __PANNE__: JSON.stringify(panne && (panne[1] === CR || panne[1] === AM) ? panne : null) },
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
    return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } catch (e) {
    return { code: 3, sortie: String(e?.message ?? e) };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/* `--voir <n>` : la sortie entière du banc sous la panne n (de 1 à PANNES.length). */
const voir = process.argv.indexOf('--voir');
if (voir > 0) {
  const r = await tourne(PANNES[Number(process.argv[voir + 1]) - 1] ?? null);
  process.stdout.write(r.sortie);
  process.exit(0);
}

const juste = await tourne(null);
process.stdout.write(juste.sortie);
if (juste.code !== 0) process.exitCode = 1;

if (process.argv.includes('--prouve')) {
  let criees = 0;
  for (const panne of PANNES) {
    const r = await tourne(panne);
    const introuvable = /PANNE INTROUVABLE/.test(r.sortie);
    const criee = !introuvable && r.code !== 0 && /ECHEC/.test(r.sortie);
    if (criee) criees++;
    else process.exitCode = 1;
    console.log(`${criee ? 'CRIEE ' : introuvable ? 'ABSENTE' : 'MUETTE'} ${panne[0]}${criee ? ` (${(r.sortie.match(/^ECHEC.*$/m) ?? [''])[0].slice(6, 70)})` : ''}`);
  }
  console.log(`\n${criees} pannes criees sur ${PANNES.length}.`);
}
