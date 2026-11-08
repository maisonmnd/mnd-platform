import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* L'ACCUEIL DE MA COURONNE REORGANISE, EPROUVE - 8 novembre 2026 (maquette validee
   par « construis » : « il y a trop d'informations, trop condensees »).
   `node scripts/verifie-l-accueil-de-la-couronne.mjs` : le banc, dans un processus
   fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const TABS = 'src/apps/couronne/Tabs.tsx';
const ABO = 'src/apps/couronne/Abonnee.tsx';
const CSS = 'src/apps/couronne/couronne.css';
const EN = 'src/apps/couronne/i18n/en-tabs.ts';
const PANNES = [
  ['la photo revient en haut de l accueil', TABS, '<div className="mc-homehead">', '<div className="mc-homehead"><img className="mc-homehero__photo" alt="" />'],
  ['la cloche perd son compte', TABS, '<Cloche />{notifCount > 0 && <span className="mc-bell__count">{notifCount}</span>}', '<Cloche />'],
  ['la pastille de la couronne disparait', TABS, 'className="mc-crownpill" aria-expanded', 'className="mc-pilule" aria-expanded'],
  ['les gestes passent avant la seance', TABS, '        {carteProchaine}\n        {lesGestes}\n', '        {lesGestes}\n        {carteProchaine}\n'],
  ['les offres passent avant les gestes', TABS, '        {lesGestes}\n', '        {lesOffres}\n        {lesGestes}\n'],
  ['la liste passe avant les offres', TABS, '        {lesOffres}\n        {laListe}\n', '        {laListe}\n        {lesOffres}\n'],
  ['la formule passe avant les gestes', TABS, '        {lesGestes}\n        {LE_TABLEAU_DE_BORD}\n', '        {LE_TABLEAU_DE_BORD}\n        {lesGestes}\n'],
  ['la fermeture annoncee glisse sous la seance', TABS, '        <FermetureAnnoncee />\n', ''],
  ['le bandeau du rappel revient', TABS, '{pastilleQuiApproche}', '{pastilleQuiApproche}<button className="mc-remindbanner" />'],
  ['la pastille oublie la regle d une seule alerte', TABS, '        {soon && !(abonneeA && releveA?.alerte) && (', '        {soon && ('],
  ['la pastille ne dit plus Demain', TABS, "  if (n === 1) return t('Demain');\n", ''],
  ['la date de la seance redevient petite, les gestes en grand', TABS, '<div className="mc-nextrdv__service">{jourDit(next.date)} · {heureDite(next.time)}</div>', '<div className="mc-nextrdv__when">{jourDit(next.date)} · {heureDite(next.time)}</div>'],
  ['la duree du rituel se tait', TABS, ' · {fmtDuration(dureeDuRendezVous(next, dureesParPrestation))}', ''],
  ['« Ouvrir » n ouvre plus la fiche', TABS, 'className="mc-nextrdv__cta" onClick={() => onOpenRdv(next.id)}>', 'className="mc-nextrdv__cta" onClick={() => onOpenRdv()}>'],
  ['sans rituel, plus de « Reserver » dans la carte', TABS, '<button type="button" className="mc-nextrdv__cta" onClick={() => onOpenBooking()}>{t(\'Réserver\')}</button>', ''],
  ['« Reserver un rituel » perd son geste', TABS, "className=\"mc-cta mc-cta--copper\" onClick={() => onOpenBooking()}>\n          {t('Réserver un rituel')}", "className=\"mc-cta mc-cta--copper\" onClick={() => undefined}>\n          {t('Réserver un rituel')}"],
  ['« Sur-mesure » perd son geste', TABS, 'onClick={onOpenCompose}>', 'onClick={() => undefined}>'],
  ['une abonnee lit deux fois « Reserver »', TABS, "const reserveIci = !moduleHidden(client, 'reserver') && !abonneeA;", "const reserveIci = !moduleHidden(client, 'reserver');"],
  ['le tableau de bord perd un geste', TABS, '        onRenoncer={abonnee.onRenoncer}\n', ''],
  ['la seance se glisse de nouveau dans le tableau de bord', TABS, '        onAcheter={abonnee.onAcheter}\n      />\n      {!moduleHidden', '        onAcheter={abonnee.onAcheter}\n        avantLeSolde={carteProchaine}\n      />\n      {!moduleHidden'],
  ['le pli de l attention quitte Abonnee.tsx', ABO, '      <PliDeLAttention teteId={releve.clientId} prenom={prenom} />\n', ''],
  ['la liste perd le bilan', TABS, "onClick={() => setLireBilan(true)}", "onClick={() => undefined}"],
  ['la liste perd la carte De main en main', TABS, "<Rang key=\"carte\" icone={<Sparkles size={16} />} onClick={onOpenCarte}>", "<Rang key=\"carte\" icone={<Sparkles size={16} />}>"],
  ['la recommandation ne se reserve plus', TABS, "onClick={peutReserver ? () => onOpenBooking({ serviceId: recoPresta.service.id }) : undefined}", 'onClick={undefined}'],
  ['Les produits disparaissent de la liste', TABS, "<div className=\"mc-liste__t\">{t('Les produits')}</div>", "<div className=\"mc-liste__t\">{t('Produits')}</div>"],
  ['Le Cercle disparait de la liste', TABS, "    abonnee?.goCercle && (\n", "    false && (\n"],
  ['une ligne parait sans sa donnee', TABS, '    monBilan && (\n', '    true && (\n'],
  ['la liste perd son titre', TABS, "<div className=\"mc-sectionlabel\">{t('Pour vous')}</div>\n      ", ''],
  ['les offres paraissent meme sans offre', TABS, "const lesOffres = offers.length > 0 && !moduleHidden(client, 'offres') ? (", "const lesOffres = !moduleHidden(client, 'offres') ? ("],
  ['une couleur ecrite en dur dans le bloc de l accueil', CSS, '.mc-liste__t { font-size: 14px;', '.mc-liste__t { color: #1E2150; font-size: 14px;'],
  ['la gouttiere de 22 px revient', CSS, '.mc-pagepad--accueil { padding: 14px 16px 0; }', '.mc-pagepad--accueil { padding: 14px 22px 0; }'],
  ['une largeur fixe au-dela du telephone', CSS, '.mc-homehead { padding:', '.mc-homehead { width: 420px; padding:'],
  ['le serif perd son equilibre', CSS, '  margin-top: 4px;\n  text-wrap: balance;\n', '  margin-top: 4px;\n'],
  ['la cloche repart en absolu', CSS, '.mc-bell {\n  position: relative;', '.mc-bell {\n  position: absolute;'],
  ['les deux gestes s empilent', CSS, '.mc-gestes { display: grid; grid-template-columns: 1.25fr 1fr;', '.mc-gestes { display: grid; grid-template-columns: 1fr;'],
  ['le CSS mort du hero revient', CSS, '/* ══ fin de l\'accueil réorganisé ══ */', '/* ══ fin de l\'accueil réorganisé ══ */\n.mc-homehero { height: 300px; }'],
  ['une phrase neuve sans son anglais', EN, "  'Demain': 'Tomorrow',\n", ''],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-l-accueil-de-la-couronne');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-l-accueil-de-la-couronne.harnais.ts')],
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
