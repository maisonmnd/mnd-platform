import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CIBLE, fichierAttendu } from './conseil-du-matin-serveur.mjs';

/* LE CONSEIL DU MATIN, EPROUVE - 2 novembre 2026, sur le modele de verifie-les-assistants.mjs.
   `node scripts/verifie-le-conseil-du-matin.mjs` : le fichier de la fonction conseil-du-matin
   doit etre a jour avec le depot, puis le harnais (verifie-le-conseil-du-matin.harnais.ts)
   tourne, la fonction regroupee depuis les sources du moment.
   `--prouve` : chaque panne est posee EN MEMOIRE (les modules par un greffon
   d esbuild, les fichiers lus par le texte que lit le harnais), jamais sur le
   disque. Le banc doit crier a chacune. A lancer dans une copie detachee. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const PUR = 'src/shared/conseil-du-matin-pur.ts';
const SERVEUR = 'scripts/serveur/conseil-du-matin.ts';
const SQL = 'supabase/migrations/0151_la_maison_intelligente.sql';
const ECRAN = 'src/apps/trone/routes/pilotage/ConseilDuMatin.tsx';

const PANNES = [
  // le pur
  ['le jour dit oublie l annee', PUR, '  return `${JOURS[d.getUTCDay()]} ${j === 1 ? \'1er\' : j} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;', '  return `${JOURS[d.getUTCDay()]} ${j === 1 ? \'1er\' : j} ${MOIS[d.getUTCMonth()]}`;'],
  ['ce qui presse n est plus borne', PUR, 'export const PRESSE_AU_PLUS = 5;', 'export const PRESSE_AU_PLUS = 50;'],
  ['le reste n est plus compte', PUR, "    presse[PRESSE_AU_PLUS - 1] = { texte: `Et ${reste} autres points, dans Les assistants.`, ton: 'attention' };\n", ''],
  ['les taches de la nuit passent apres tout', PUR, "    points.push({ rang: 1, ton: 'alerte', texte: `${capitale(tacheDite(t.tache))}", "    points.push({ rang: 9, ton: 'alerte', texte: `${capitale(tacheDite(t.tache))}"],
  ['une tache au nom etrange passe', PUR, "  if (!s || s.length > 60 || /\\d{5,}/.test(s.replace(/[\\s_-]/g, '')) || !/^[\\p{L}\\p{N}][\\p{L}\\p{N} _-]*$/u.test(s)) return 'une tâche du serveur';", "  if (!s) return 'une tâche du serveur';"],
  ['un assistant au repos de nuit presse', PUR, "    else if (e.etat === 'endormi' && dansLaVeille(heure, r)) {", "    else if (e.etat === 'endormi') {"],
  ['un empeche ne presse plus', PUR, "    if (e.etat === 'empeche') points.push(", "    if (false) points.push("],
  ['une carte echue presse encore', PUR, "    if (!decisionEnAttente({ tranchee: (c.tranchee ?? null) as Parameters<typeof decisionEnAttente>[0]['tranchee'], echeance: c.echeance ?? null }, maintenantMs)) continue;\n", ''],
  ['une carte jeune presse', PUR, '    if (!Number.isFinite(ne) || maintenantMs - ne < CARTE_ANCIENNE_H * 3_600_000) continue;', '    if (!Number.isFinite(ne)) continue;'],
  ['la carte nomme le nom de la base', PUR, "    const qui = nomDe(c.assistant) ?? 'un professionnel';", "    const qui = (f.assistants ?? []).find((a) => a.id === c.assistant)?.nom ?? 'un professionnel';"],
  ['les credits proches se taisent', PUR, '    if (l.alerte === \'ok\') continue;\n    points.push({ rang: 4,', '    if (l.alerte !== \'depasse\') continue;\n    points.push({ rang: 4,'],
  ['les depenses a valider se taisent', PUR, '  if (dep > 0) points.push(', '  if (dep > 99) points.push('],
  ['les places tenues se taisent', PUR, '  if (places > 0) points.push(', '  if (false) points.push('],
  ['les lacunes se taisent', PUR, '  if (manquees.length) points.push(', '  if (false) points.push('],
  ['le bilan dit son mot libre', PUR, "    lignes.push(`Le bilan ${de(nomDe(id) as string)} : ${parts.length ? parts.join(', ') : 'rien à compter'}.`);", "    lignes.push(`Le bilan ${de(nomDe(id) as string)} : ${parts.length ? parts.join(', ') : 'rien à compter'}. ${String(b.mot ?? '')}`);"],
  ['un bilan d un intrus passe', PUR, '    if (!nomDe(b.assistant)) continue;\n', ''],
  ['les annules comptent aujourd hui', PUR, "  const rdvs = (f.rdvDuJour ?? []).filter((r) => String(r.status ?? '') !== 'annulé');", '  const rdvs = f.rdvDuJour ?? [];'],
  ['le fauteuil prend le maitre brut', PUR, "    const p = prenomPropre(f.equipe?.[String(r.master ?? '')]) ?? 'sans maître nommé';", "    const p = String(f.equipe?.[String(r.master ?? '')] ?? r.master ?? '');"],
  ['le lundi tombe le mardi', PUR, '    lundi: c.jour === 1 ? lundi(f, jour) : null,', '    lundi: lundi(f, jour),'],
  ['la cible prend une date passee', PUR, '  const cible = cibles.find((x) => x.le >= jour) ?? null;', '  const cible = cibles[0] ?? null;'],
  ['la revue tombe chaque jour', PUR, "    revue: jour.endsWith('-01') ?", '    revue: true ?'],
  ['le loin ne se dit plus', PUR, "' Mode « Je suis loin ».' : ''", "'' : ''"],
  // la fonction
  ['sans cle, la fonction ecrit quand meme', SERVEUR, "    if (!porte) return json({ ok: false, motif: 'reserve-au-cron-et-aux-souverains', version: VERSION }, 403);", "    if (false) return json({ ok: false, motif: 'reserve-au-cron-et-aux-souverains', version: VERSION }, 403);"],
  ['un maitre passe pour un souverain', SERVEUR, ".eq('user_id', uid).eq('role', 'souverain').maybeSingle();", ".eq('user_id', uid).maybeSingle();"],
  ['le souverain notifie aussi', SERVEUR, "    if (source === 'cron' && !notifieLe) {", '    if (!notifieLe) {'],
  ['chaque relance renotifie', SERVEUR, "    if (source === 'cron' && !notifieLe) {", "    if (source === 'cron') {"],
  ['un essai notifie comme le cron', SERVEUR, "=== 'essai' ? 'essai' : porte;", "=== 'essai' ? porte : porte;"],
  ['une seule page de mille lignes', SERVEUR, 'const PAGES_AU_PLUS = 20;', 'const PAGES_AU_PLUS = 1;'],
  ['hier deborde sur ce matin', SERVEUR, ".gte('data->>quand', debutHier).lt('data->>quand', debutJour)", ".gte('data->>quand', debutHier)"],
  ['le nom de la cliente sort des rendez-vous', SERVEUR, '.map((r) => ({ time: r.data?.time, master: r.data?.master, status: r.data?.status })))', '.map((r) => ({ ...r.data })))'],
  ['le lundi compte les rendez-vous, pas les clientes', SERVEUR, "      return new Set(lignes.map((r) => String(r.data?.clientId ?? '')).filter(Boolean)).size;", '      return lignes.length;'],
  ['un relais perime reste a traiter', SERVEUR, "      .filter((r) => !r.perime_le || String(r.perime_le) > maintenant).length),", '      .length),'],
  ['une lecture manquee tue la page', SERVEUR, "    try { return await f(); } catch (e) { lacunes.push(cle);", '    try { return await f(); } catch (e) { throw e;'],
  ['un souverain deux fois notifie deux fois', SERVEUR, "  const ids = [...new Set(((data ?? []) as Ligne[]).map((s) => String(s.user_id ?? '')).filter(Boolean))];", "  const ids = ((data ?? []) as Ligne[]).map((s) => String(s.user_id ?? '')).filter(Boolean);"],
  ['la fonction garde une ancienne version', SERVEUR, "const VERSION = '2026-11-04-a';", "const VERSION = '2026-11-02-b';"],
  // le câblage
  ['la tache de Saphir part a 6 h de Cotonou', SQL, "select cron.schedule('conseil-du-matin', '0 6 * * *',", "select cron.schedule('conseil-du-matin', '0 5 * * *',"],
  ['le composant lit une autre table', ECRAN, ".from('conseil_du_matin')", ".from('conseil')"],
];

const greffon = (panne) => ({
  name: 'panne-en-memoire',
  setup(b) {
    if (!panne || !panne.fichier.endsWith('.ts')) return;
    const cible = path.join(racine, panne.fichier).replace(/\\/g, '/');
    b.onLoad({ filter: /\.ts$/ }, (args) => {
      if (args.path.replace(/\\/g, '/') !== cible) return undefined;
      return { contents: readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').replace(panne.avant, panne.apres), loader: 'ts' };
    });
  },
});

async function lance(panne) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-conseil-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  const fonction = path.join(dossier, 'conseil-du-matin.js');
  try {
    const f = await build({
      entryPoints: [path.join(racine, SERVEUR)],
      bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', write: false,
      external: ['npm:*'], charset: 'utf8', legalComments: 'none', logLevel: 'silent', mainFields: ['module', 'main'], plugins: [greffon(panne)],
    });
    writeFileSync(fonction, f.outputFiles[0].text);
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-conseil-du-matin.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' }, plugins: [greffon(panne)],
    });
    return spawnSync(process.execPath, [sortie], {
      cwd: racine, encoding: 'utf8',
      env: { ...process.env, CONSEIL_FONCTION: fonction, ...(panne ? { CONSEIL_PANNE: JSON.stringify(panne) } : {}) },
    });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const present = (() => { try { return readFileSync(path.join(racine, CIBLE), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } })();
if (present !== await fichierAttendu(racine)) {
  console.log(`ECHEC ${CIBLE} a pris du retard sur le depot : node scripts/conseil-du-matin-serveur.mjs`);
  process.exit(1);
}
const net = await lance(null);
process.stdout.write(net.stdout ?? '');
if (net.status !== 0) { process.stderr.write(net.stderr ?? ''); process.exit(1); }
if (!prouve) process.exit(0);

let muettes = 0;
for (const [nom, fichier, avant, apres] of PANNES) {
  const texte = readFileSync(path.join(racine, fichier), 'utf8').replace(/\r\n/g, '\n');
  if (texte.split(avant).length !== 2) { muettes += 1; console.log(`MUETTE introuvable : ${nom}`); continue; }
  const r = await lance({ fichier, avant, apres });
  if (r.status === 0) { muettes += 1; console.log(`MUETTE ${nom}`); } else console.log(`CRIE  ${nom}`);
}
console.log(muettes === 0 ? `\nLa preuve tient : ${PANNES.length} pannes, le banc crie a chacune.` : `\n${muettes} panne(s) muette(s).`);
process.exit(muettes ? 1 : 0);
