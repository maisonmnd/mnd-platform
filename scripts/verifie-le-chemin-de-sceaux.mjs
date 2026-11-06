import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE CHEMIN DE SCEAUX, EPROUVE - 6 novembre 2026 (lot 1 de l'abonnement refait).
   `node scripts/verifie-le-chemin-de-sceaux.mjs` : le banc, dans un processus
   fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PUR = 'src/shared/chemin-de-sceaux-pur.ts';
const ABO = 'src/apps/couronne/Abonnee.tsx';
const SES = 'src/apps/couronne/SesFormules.tsx';
const TABS = 'src/apps/couronne/Tabs.tsx';
const CSS = 'src/apps/couronne/abonnee.css';
const EN = 'src/apps/couronne/i18n/en-abonnee.ts';
const PANNES = [
  ['le chemin range par matiere, comme la barre d hier', PUR, '  if (daccord) {', '  if (daccord && false) {'],
  ['le chemin contredit la ligne du releve', PUR, "  const daccord = compte('faite') === l.faites && compte('manquee') === l.manquees && compte('reservee') === l.reservees;", '  const daccord = true;'],
  ['plus de sceaux que de seances vendues', PUR, '  pas.length = Math.min(pas.length, total);\n', ''],
  ['les perdues se disent disponibles', PUR, "etat: perdue ? 'perdue' : 'disponible' });", "etat: 'disponible' });"],
  ['une annulee prend un sceau', PUR, 'c.attribuees.filter((s) => s.compte && l.seances.includes(s.id));', 'c.attribuees.filter((s) => l.seances.includes(s.id));'],
  ['la seance d une autre prestation prend un sceau', PUR, 'c.attribuees.filter((s) => s.compte && l.seances.includes(s.id));', 'c.attribuees.filter((s) => s.compte);'],
  ['le sans limite recoit un chemin', PUR, '  if (l.incluses === null) return null;\n', ''],
  ['une manquee se dit reservee', PUR, "s.etat === 'manquee' ? 'manquee' : 'reservee'", "s.etat === 'manquee' ? 'reservee' : 'reservee'"],
  ['les seances reelles perdent leur date', PUR, 'etat: etatDuPas(s), id: s.id, date: s.date, time: s.time });', 'etat: etatDuPas(s) });'],
  ['la carte de l accueil sans chemin', ABO, '          <Chemin pas={cheminDeLaLigne(c, l, perdue)} voile={voile} />\n', ''],
  ['le chemin lu deux fois par un lecteur d ecran', ABO, "${voile ? 'is-voile' : ''}`} aria-hidden=\"true\">", "${voile ? 'is-voile' : ''}`}>"],
  ['Ma formule sans chemin', SES, '        <CheminDuPli c={c} l={l} />\n', ''],
  ['aucune rubrique ouverte a l arrivee', SES, '(() => (releve.contrats[0] ? `${releve.contrats[0].sub.id}:seances` : null));', '(null);'],
  ['le resume du reglement dit toujours tout regle', SES, "  return ar.resteXof > 0 ? t('Reste {montant}', { montant: prix(ar.resteXof) }) : t('Tout est réglé');", "  return t('Tout est réglé');"],
  ['la lune en pause se dit reglee', SES, "    if (c.etat === 'en-pause' && ar.luneARegler) return t('Lune à régler');\n", ''],
  ['le resume des seances invente son compte', SES, '  return <Legende l={l} perdue={lignePerdue(c)} />;', "  return t('{n} prestations', { n: l.faites });"],
  ['deux alertes en haut de l accueil', TABS, '        {soon && !(abonneeA && releveA?.alerte) && (', '        {soon && ('],
  ['la manquee sans son dessin', CSS, '.ab-pas--manquee .ab-pas__fond { fill: var(--mc-error); stroke: var(--mc-error); }\n', ''],
  ['une couleur ecrite en dur dans le chemin', CSS, '.ab-pas__hachure { fill: var(--accent); }', '.ab-pas__hachure { fill: #B97A4A; }'],
  ['le chiffre d une perdue en noir le jour', CSS, '.ab-pas--perdue .ab-pas__n { fill: var(--obsidian-300); }', '.ab-pas--perdue .ab-pas__n { fill: var(--ink-mute); }'],
  ['le chiffre d une manquee illisible le soir', CSS, '.ab-pas--manquee .ab-pas__n { fill: var(--paper); }', '.ab-pas--manquee .ab-pas__n { fill: var(--ab-sur-cuivre); }'],
  ['le chiffre d une reservee noye dans les hachures', CSS, ' paint-order: stroke; stroke: var(--surface-card); stroke-width: 10px; stroke-linejoin: round; }', ' }'],
  ['la legende repetee dans la rubrique ouverte', CSS, '.ab-rub.is-ouverte .ab-rub__resume { display: none; }\n', ''],
  ['une phrase neuve sans son anglais', EN, "  'Lune à régler': 'Moon to pay',\n", ''],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-le-chemin-de-sceaux');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-chemin-de-sceaux.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

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

const r = await lanceLeBanc();
process.stdout.write(r.stdout ?? '');
if (r.stderr) process.stdout.write(r.stderr);
process.exit(r.status ?? 1);
