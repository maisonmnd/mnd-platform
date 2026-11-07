import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA FENETRE DE GBEJI FIDELITE, EPROUVEE — 7 novembre 2026.
   `node scripts/verifie-fenetre-de-fidelite.mjs` : le banc, dans un processus
   fils (le paquet s'ecrit sous node_modules/.cache et s'efface dans un finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc doit
   crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-fenetre-de-fidelite');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-fenetre-de-fidelite.harnais.ts')],
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
  } catch (e) {
    return { status: 1, stdout: `ECHEC construction : ${String(e?.message ?? e).slice(0, 300)}\n`, stderr: '' };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const CAT = 'src/shared/catalogue-pur.ts';
const PLACE = 'src/shared/place-du-serveur.ts';
const PRIX = 'src/shared/pricing.ts';
const DS = 'supabase/functions/demande-submit/index.ts';
const WA = 'supabase/functions/whatsapp-automate/index.ts';
const BK = 'src/apps/couronne/Booking.tsx';
const SH = 'src/apps/trone/routes/clients/_shared.tsx';
const SITE = 'src/apps/revelateur/agenda.ts';
const ELAGUE = 'src/apps/revelateur/agenda-assemble.ts';
const EN = 'src/apps/couronne/i18n/en-booking.ts';
const MIG = 'supabase/migrations/0183_fidelite_fenetre.sql';

/* [nom, fichier, a remplacer, par quoi] */
const PANNES = [
  ['28 jours exclus (la borne basse perd un jour)', CAT, 'ecart >= w.min && ecart <= w.max', 'ecart > w.min && ecart <= w.max'],
  ['42 jours exclus (la borne haute perd un jour)', CAT, 'ecart >= w.min && ecart <= w.max', 'ecart >= w.min && ecart < w.max'],
  ['la semaine compte huit jours', CAT, 'min: Math.round(de * 7), max: Math.round(a * 7)', 'min: Math.round(de * 8), max: Math.round(a * 8)'],
  ['sans aucune venue, le pack passe', CAT, '  if (!w || !dateRdv || !derniereVenue) return false;', '  if (!w || !dateRdv) return false;\n  if (!derniereVenue) return true;'],
  ['un honore posterieur au rendez-vous compte', CAT, "|| j >= avantIso) continue;", ') continue;'],
  ['un rendez-vous non honore compte comme venue', CAT, "if (r.status !== 'honoré' || r.clientId !== clientId) continue;", 'if (r.clientId !== clientId) continue;'],
  ['la premiere venue au lieu de la derniere', CAT, 'j > meilleure', 'j < meilleure'],
  ['la fenetre d une cliente d une autre fiche', CAT, "r.clientId !== clientId) continue;\n    const j", "false) continue;\n    const j"],
  ['la fenetre se juge a aujourd hui, pas au rendez-vous (Ma Couronne)', BK, 'dateRdv: jourDeLaVenue, aujourdhui: todayIso() }', 'dateRdv: todayIso(), aujourdhui: todayIso() }'],
  ['estProposable ignore la fenetre', PRIX, '&& (!sv.fenetreApresVenue || !fenetre', '&& (true || !sv.fenetreApresVenue || !fenetre'],
  ['Ma Couronne n ecrit plus le dernier mot hors fenetre', BK, 'if (horsFenetre?.fenetreApresVenue) {', 'if (false && horsFenetre?.fenetreApresVenue) {'],
  ['le serveur n a pas la fenetre (champ non lu)', PLACE, '...(fenetreEnJours(objet(d.fenetreApresVenue) as FenetreApresVenue)', '...(false && fenetreEnJours(objet(d.fenetreApresVenue) as FenetreApresVenue)'],
  ['le serveur ne refuse plus hors fenetre', PLACE, '&& !dansLaFenetreDeVenue(s.fenetreApresVenue, quand?.date, quand?.derniereVenue))) return', '&& false)) return'],
  ['le site oublie de cacher le pack a fenetre', SITE, 'reservableSurLeSite(s, cats, agenda.masques) && !s.fenetreApresVenue;', 'reservableSurLeSite(s, cats, agenda.masques);'],
  ['la page du site perd le champ', ELAGUE, "  'fenetreApresVenue',\n", ''],
  ['demande-submit ne donne pas la venue au juge', DS, 'serviceIds: o.serviceIds, derniereVenue }, maintenant)', 'serviceIds: o.serviceIds }, maintenant)'],
  ['demande-submit ne lit pas le numero', DS, 'laPlaceDemandee({ branche: branche.ligne, serviceIds, date, time, telephone })', 'laPlaceDemandee({ branche: branche.ligne, serviceIds, date, time })'],
  ['whatsapp propose le pack a fenetre', WA, '&& !s.fenetreApresVenue,', ','],
  ['whatsapp pose sans juger la venue', WA, 'serviceIds: rdv.serviceIds, derniereVenue }, Date.now())', 'serviceIds: rdv.serviceIds }, Date.now())'],
  ['le Trone interdit au lieu d avertir', SH, '.filter((sv) => estProposable(sv, pricing, venuesTete, !!familleDuCompte, verdictKids));', '.filter((sv) => estProposable(sv, pricing, venuesTete, !!familleDuCompte, verdictKids, { derniereVenue: null }));'],
  ['le Trone n avertit plus', PRIX, 'if (!f || dansLaFenetreDeVenue(f, dateRdv, derniereVenue)) return null;', 'if (!f || true) return null;'],
  ['la phrase anglaise manque', EN, "'Disponible entre {de} et {a} semaines après votre dernière venue': 'Available between {de} and {a} weeks after your last visit',", ''],
  ['la migration pose 7 semaines', MIG, '"aSemaines": 6}}', '"aSemaines": 7}}'],
  ['un caractere change dans la copie de demande-submit', DS, 'export function joursEntreDates(', 'export function joursEntreDatez('],
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
      const casse = texte.replace(a, () => b);
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
