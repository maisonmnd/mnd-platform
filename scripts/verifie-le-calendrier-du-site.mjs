import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/* LE CALENDRIER DU SITE, EPROUVE - 6 novembre 2026 (maquette
   maquette-calendrier-du-site.html, validee par Yeman : « construis »).
   La reservation du site public montre ce mois et les trois suivants, en
   grille, comme Ma Couronne :
   - la borne : le dernier jour du troisieme mois qui suit, compte a Cotonou,
     la meme pour le site (horizonDuSite), le juge du serveur
     (finDeLaReservation, dans l'original et dans chaque copie Edge) et le
     verrou (pose_si_libre, migration 0168) ;
   - la grille : lundi d'abord, libre, offre, peu de places, complet, ferme,
     les fleches grisees aux bornes, le mois montre d'abord, le doigt ;
   - main.ts et l'ilot lisent la meme borne ; plus de « Un autre jour » ;
   - 0168 : la borne neuve, et le reste identique a 0152 (la base).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PLACE = 'src/shared/place-du-serveur.ts';
const SITE = 'supabase/functions/demande-submit/index.ts';
const WA = 'supabase/functions/whatsapp-automate/index.ts';
const AGENDA = 'src/apps/revelateur/agenda.ts';
const MAIN = 'src/apps/revelateur/main.ts';
const ILOT = 'src/apps/revelateur/ilots/Reserver.tsx';
const PUR = 'src/apps/revelateur/calendrier-du-site-pur.ts';
const STYLE = 'src/apps/revelateur/revelateur.css';
const GEN = 'scripts/genere-revelateur.mjs';
const SQL = 'supabase/migrations/0168_la_reservation_jusqu_a_trois_mois_pleins.sql';
const PANNES = [
  /* La borne, au juge et dans ses copies */
  ['la borne un mois plus loin', PLACE, 'Number(m[2]) - 1 + 4, 0)', 'Number(m[2]) - 1 + 5, 0)'],
  ['le juge revient a quatre-vingt-dix jours glissants', PLACE, 'if (ecart < 1 || ecart > joursDeLaFenetre(ms)) return', 'if (ecart < 1 || ecart > 90) return'],
  ['le jour meme accepte', PLACE, 'if (ecart < 1 || ecart > joursDeLaFenetre(ms)) return', 'if (ecart < 0 || ecart > joursDeLaFenetre(ms)) return'],
  ['le juge compte a l heure UTC', PLACE, 'const jourDeCotonou = (ms: number): string => new Date(ms + 3_600_000).toISOString().slice(0, 10);', 'const jourDeCotonou = (ms: number): string => new Date(ms).toISOString().slice(0, 10);'],
  ['la copie du site garde l ancienne borne', SITE, 'Number(m[2]) - 1 + 4, 0)', 'Number(m[2]) - 1 + 5, 0)'],
  ['la copie de WhatsApp garde l ancienne borne', WA, 'if (ecart < 1 || ecart > joursDeLaFenetre(ms)) return', 'if (ecart < 1 || ecart > 90) return'],
  ['les places d un maitre passent la borne', WA, 'const n = Math.max(1, Math.min(joursDeLaFenetre(ms), Number.isFinite(voulu) && voulu > 0 ? voulu : 14));\n  const duree', 'const n = Math.max(1, Math.min(200, Number.isFinite(voulu) && voulu > 0 ? voulu : 14));\n  const duree'],
  /* L'horizon du site */
  ['l horizon du site deborde la borne', AGENDA, '    if (iso > au) break;', '    if (iso > au) { jours.push(iso); break; }'],
  ['l horizon du site compte a l heure UTC', AGENDA, 'const aujourdhui = jourDeCotonou(maintenant.getTime());\n  const au = finDeLaReservation(aujourdhui);', 'const aujourdhui = maintenant.toISOString().slice(0, 10);\n  const au = finDeLaReservation(aujourdhui);'],
  ['les journees fermees des Parametres oubliees', AGENDA, 'ouvertureDuJour(iso, agenda.semaine, agenda.exceptions).closed', 'ouvertureDuJour(iso, agenda.semaine, []).closed'],
  ['main.ts precharge vingt et un jours', MAIN, 'const { du, au } = horizonDuSite();', 'const { du, au } = { du: horizonDuSite().du, au: horizonDuSite().jours[20] };'],
  ['l ilot relit une autre fenetre', ILOT, 'void calendrierDuSite(horizon.du, horizon.au, initiales?.branchId)', 'void calendrierDuSite(horizon.du, horizon.jours[20], initiales?.branchId)'],
  /* La grille, a l ecran */
  ['« Un autre jour » revient', ILOT, '<p className="mois-du-site__horizon">', '<p><button type="button" className="btn btn--lien">Un autre jour</button></p><p className="mois-du-site__horizon">'],
  ['JOURS_PROPOSES revient', ILOT, '/* LE DÉFILEMENT SANS ÉLAN', 'const JOURS_PROPOSES = 21;\n/* LE DÉFILEMENT SANS ÉLAN'],
  ['un jour ferme se touche', ILOT, 'disabled={!libre}', 'disabled={false}'],
  ['aria-pressed disparait', ILOT, 'aria-pressed={libre ? jour === iso : undefined}', ''],
  ['le doigt ne tourne plus les mois', ILOT, 'if (k) tourneLeMois(k);', 'if (k) { /* rien */ }'],
  ['la borne se tait sous la grille', ILOT, '<p className="mois-du-site__horizon">Réservations ouvertes jusqu’au {dateDite(horizon.au)}.</p>', ''],
  ['les heures quittent le dessous du jour', ILOT, '<div className="heures venir" id="heures-du-jour">', '<div className="heures venir" id="heures-du-jour" hidden>'],
  ['« trois prochaines semaines » revient', ILOT, '`Aucune heure libre d’ici au ${dateDite(horizon.au)}. Écrivez-nous, nous trouverons ensemble.`', "'Aucune heure libre dans les trois prochaines semaines. Écrivez-nous, nous trouverons ensemble.'"],
  ['le mois montre ignore la premiere place', ILOT, 'premierePlace: places[0]?.iso ?? null,', 'premierePlace: null,'],
  ['la remise du jour posee sur un jour complet', ILOT, 'const duJour = libre ? remiseDuJourDe(iso) : null;', 'const duJour = remiseDuJourDe(iso);'],
  ['un tiret long a l ecran', ILOT, '>remise du jour</span>', '>remise — du jour</span>'],
  /* La regle pure */
  ['peu de places a trois heures', PUR, 'export const PEU_DE_PLACES = 2;', 'export const PEU_DE_PLACES = 3;'],
  ['la grille commence le dimanche', PUR, 'getUTCDay() + 6) % 7', 'getUTCDay()) % 7'],
  ['la fleche suivante ne se grise jamais', PUR, 'suivant: !!mois && mois < dernier', 'suivant: !!mois'],
  ['la fleche precedente ne se grise jamais', PUR, 'precedent: !!mois && mois > premier', 'precedent: !!mois'],
  ['le mois montre ignore le jour choisi', PUR, "    || (o.jour ? o.jour.slice(0, 7) : '')\n", ''],
  ['un jour ferme passe libre', PUR, "  if (o.ferme) return { etat: 'ferme', peu: false, heures: 0 };\n", ''],
  ['un jour complet passe libre', PUR, "  if (n === 0) return { etat: 'complet', peu: false, heures: 0 };\n", ''],
  ['le jour meme devient touchable', PUR, 'if (!o.iso || o.iso < o.du || o.iso > o.au)', 'if (!o.iso || o.iso > o.au)'],
  ['un toucher tourne le mois', PUR, 'if (Math.abs(dx) < GLISSE_MIN_PX || Math.abs(dx) <= Math.abs(dy) * 1.5) return 0;', 'if (Math.abs(dx) <= Math.abs(dy) * 1.5) return 0;'],
  /* La feuille du site */
  ['le jour libre en vert', STYLE, '.mois-du-site__jour.est-libre { cursor: pointer; color: var(--titre); background: var(--indigo-pale); }', '.mois-du-site__jour.est-libre { cursor: pointer; color: var(--titre); background: #E3F0E8; }'],
  ['le focus ne se voit plus', STYLE, '.mois-du-site__jour:focus-visible, .mois-du-site__fleche:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }\n', ''],
  ['le glisse anime malgre prefers-reduced-motion', STYLE, '@media (prefers-reduced-motion: reduce) { .mois-du-site__grille.vient-de-droite, .mois-du-site__grille.vient-de-gauche { animation: none; } }\n', ''],
  ['le bandeau de la fermeture quitte la colonne', GEN, '\'<div data-ilot="fermeture" data-genre="reserver"></div>\'', "''"],
  /* La migration */
  ['la migration garde quatre-vingt-dix jours', SQL, "  borne      text := to_char(date_trunc('month', now() at time zone 'Africa/Porto-Novo') + interval '4 months' - interval '1 day', 'YYYY-MM-DD');", "  borne      text := to_char((now() at time zone 'Africa/Porto-Novo') + interval '90 days', 'YYYY-MM-DD');"],
  ['la migration compte a l heure du serveur', SQL, "  borne      text := to_char(date_trunc('month', now() at time zone 'Africa/Porto-Novo')", "  borne      text := to_char(date_trunc('month', now())"],
  ['la migration oublie le jour meme', SQL, '  if jour <= aujourdhui or jour > borne then', '  if jour > borne then'],
  ['la migration touche autre chose', SQL, '  if cap_maison > 0 and (', '  if cap_maison > 1 and ('],
  ['la migration ouvre le verrou au public', SQL, 'revoke all on function public.pose_si_libre(jsonb, text[], jsonb, jsonb) from public, anon, authenticated;', 'revoke all on function public.pose_si_libre(jsonb, text[], jsonb, jsonb) from public;'],
  ['la migration repose le declencheur de l ouverture', SQL, '-- ── Contrôle', 'drop trigger if exists pas_avant_l_ouverture on public.appointments;\n\n-- ── Contrôle'],
  /* Les versions a deployer */
  ['la fonction du site garde sa version', SITE, "const VERSION = '2026-11-06-a · la réservation", "const VERSION = '2026-11-05-b · la réservation"],
  ['la fonction de WhatsApp garde sa version', WA, "const VERSION = '2026-11-06-a · la place jugee", "const VERSION = '2026-11-04-f · la place jugee"],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout, propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((x) => x[1]))];
  const gardes = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const avant = new Map(fichiers.map((f) => [f, md5(f)]));
  let muettes = 0;
  try {
    for (const [nom, f, a, b] of PANNES) {
      const garde = gardes.get(f);
      const brut = garde.toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, f), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, f), garde);
      }
    }
  } finally {
    for (const [f, g] of gardes) writeFileSync(path.join(racine, f), g);
  }
  const intacts = fichiers.every((f) => md5(f) === avant.get(f));
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exit(muettes === 0 && intacts ? 0 : 1);
}

process.chdir(racine);
const dossier = path.join(racine, 'node_modules', '.cache', `verifie-le-calendrier-du-site-${process.pid}`);
mkdirSync(dossier, { recursive: true });
let statut = 1;
try {
  const sortie = path.join(dossier, 'harnais.mjs');
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-le-calendrier-du-site.harnais.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    banner: {
      js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = globalThis.window ?? { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = globalThis.document ?? { body: { dataset: {} }, addEventListener() {} };`,
    },
  });
  const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  process.stdout.write(r.stdout ?? '');
  if (r.stderr) process.stdout.write(r.stderr);
  statut = r.status ?? 1;
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
void pathToFileURL;
process.exit(statut);
