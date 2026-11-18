import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE RENDEZ-VOUS SUGGERE, EPROUVE - 15 novembre 2026 (sur le modele de verifie-la-carte-du-prochain-rituel).
   `node scripts/verifie-le-rendez-vous-suggere.mjs` : le banc, dans un
   processus fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-le-rendez-vous-suggere');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-rendez-vous-suggere.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/rendez-vous-suggere-pur.ts';
const CARTE = 'src/shared/carte-du-prochain-rituel-pur.ts';
const RAPPEL = 'src/shared/heures-des-rappels-pur.ts';
const EXPRESS = 'src/shared/reservation-express.ts';
const CONF = 'supabase/functions/confirmation-rdv/index.ts';
const RJ1 = 'supabase/functions/rappels-j1/index.ts';
const PANNES = [
  ['une reprise d avant devient une suggestion', PUR, "return !!a && a.status === 'confirmé' && marquePosee(a.suggereLe) && !marquePosee(a.confirmeeParLaClienteLe);", "return !!a && a.status === 'confirmé' && !marquePosee(a.confirmeeParLaClienteLe);"],
  ['son oui ne la confirme pas', PUR, "return !!a && a.status === 'confirmé' && marquePosee(a.suggereLe) && !marquePosee(a.confirmeeParLaClienteLe);", "return !!a && a.status === 'confirmé' && marquePosee(a.suggereLe);"],
  ['la proposition dit « votre rendez-vous »', PUR, 'notre proposition du ${o.quand} pour votre prochain rituel', 'votre rendez-vous du ${o.quand} pour votre prochain rituel'],
  ['les boutons s inversent', PUR, "index: '0', parameters: [{ type: 'payload', payload: `REPRISE_OK:${o.apptId}` }]", "index: '0', parameters: [{ type: 'payload', payload: `REPRISE_AUTRE:${o.apptId}` }]"],
  ['le rythme ne se lit plus', PUR, '    if (e < ecart - 1e-9) { ecart = e; meilleure = n; }\n', ''],
  ['une puce tombe sur un jour ferme', PUR, '    if (p.ferme || p.heures.length === 0) continue;\n', ''],
  ['une puce oublie son heure', PUR, '        ? sienne\n', '        ? p.heures[0]\n'],
  ['la pose oublie la marque', PUR, "(qui === 'suggere' ? { suggereLe: maintenantIso } : {});", '({});'],
  ['le comptoir lit un nom', PUR, "return mots.slice(0, 2).map((m) => `${m.charAt(0).toUpperCase()}.`).join(' ');", "return mots.join(' ');"],
  ['a confirmer se compte avec les confirmes', PUR, '    if (estSuggere(a)) aConfirmer += 1; else confirmes += 1;', '    confirmes += 1;'],
  ['viser pose le rendez-vous', CARTE, "if (!e.valide) return { etat: { ...e, place: g.place, modif: false, pied: 'rien' }, effets: [] };\n      if (memePlace(e.place, g.place) || !e.rdvId) return { etat: { ...e, modif: false }, effets: [] };\n      return { etat: { ...e, place: g.place, modif: false }, effets: [{ genre: 'deplacer', rdvId: e.rdvId, place: g.place }] };\n    }\n    case 'revenir'", "if (!e.valide) return { etat: { ...e, place: g.place, valide: true, rdvId: 'v', modif: false, pied: 'rien' }, effets: [{ genre: 'poser', id: 'v', place: g.place }] };\n      if (memePlace(e.place, g.place) || !e.rdvId) return { etat: { ...e, modif: false }, effets: [] };\n      return { etat: { ...e, place: g.place, modif: false }, effets: [{ genre: 'deplacer', rdvId: e.rdvId, place: g.place }] };\n    }\n    case 'revenir'"],
  ['la pastille dit confirme d une suggestion', CARTE, "  if (!e.dejaLa && o.suggere) return { texte: change ? 'Suggéré · changé' : 'Suggéré', ton: 'suggere' };\n", ''],
  ['la fenetre promet la proposition sans son modele', CARTE, "    if (o.sansModele) return { genre: 'sans-modele',", "    if (false) return { genre: 'sans-modele',"],
  ['la fermeture d une suggestion dit la confirmation', CARTE, '    if (o.suggere) {\n      return o.sansModele', '    if (false) {\n      return o.sansModele'],
  ['une suggestion sans oui recoit la veille', RAPPEL, '  if (!oui) return true;\n  const t = Date.parse', '  if (!oui) return false;\n  const t = Date.parse'],
  ['un oui de six semaines tait la veille', RAPPEL, "  return String(a.confirmeeParLaClienteLe).slice(0, 10) >= new Date(t - 3 * 86_400_000).toISOString().slice(0, 10);", '  return true;'],
  ['la relance vise les reprises d avant', EXPRESS, "&& !!a.clientId && !!a.suggereLe\n    && !a.confirmeeParLaClienteLe", "&& !!a.clientId && !!a.repriseDe\n    && !a.confirmeeParLaClienteLe"],
  ['le serveur confirme une suggestion', CONF, 'for (const a of aEnvoyer.filter((x) => !estSuggere(x))) {', 'for (const a of aEnvoyer) {'],
  ['le serveur relance les reprises d avant', RJ1, "&& !!a.clientId && !!a.suggereLe\n    && !a.confirmeeParLaClienteLe && !a.autreMomentDemandeLe && !a.attenduJusquAu);", "&& !!a.clientId && !!a.repriseDe\n    && !a.confirmeeParLaClienteLe && !a.autreMomentDemandeLe && !a.attenduJusquAu);"],
  ['Gerard garde une suggestion', 'src/shared/gerard-pur.ts', 'if (r && !r.suggere && ecartJours(A, r.date) === GARDER_AVANT', 'if (r && ecartJours(A, r.date) === GARDER_AVANT'],
  ['l assistant dit « votre rendez-vous » d une proposition', 'src/shared/ia-reponse-wa-pur.ts', '      ? rdv.suggere\n', '      ? false\n'],
  ['Ma Couronne dit confirmee une proposition', 'src/shared/abonnee-pur.ts', "  if (estSuggere(a) && !a.attenduJusquAu) return 'proposee';\n", ''],
  ['le webhook compare le numero a l identique', 'supabase/functions/whatsapp-webhook/index.ts', "if (!fiche || !fiche.numeros.some((n) => cleWa(n) === cleWa(e.numero))) { dis('reprise · numéro étranger au rendez-vous'); continue; }", "if (!fiche || !fiche.numeros.includes(e.numero)) { dis('reprise · numéro étranger au rendez-vous'); continue; }"],
  ['la proposition perd sa question finale', PUR, ' : ${o.gestes}. Cette date vous convient-elle ?`;', ' : ${o.gestes}.`;'],
  ['« Suggéré par la Maison » n est plus le defaut', 'src/apps/trone/routes/vente/SonProchainRituel.tsx', "useState<QuiAChoisi>('suggere')", "useState<QuiAChoisi>('choisi')"],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

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
  console.log(`\n${PANNES.length - muettes}/${PANNES.length} pannes criees${intacts ? ', fichiers restaures a l identique' : ', FICHIERS ALTERES'}.`);
  process.exitCode = muettes || !intacts ? 1 : 0;
}
