import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* L'EQUIPE DU MATIN, EPROUVEE (21 novembre 2026).
   `node scripts/verifie-l-equipe-du-matin.mjs` lance le harnais ; `--prouve`
   le relance sur chaque panne ci-dessous, et chaque panne doit le faire
   crier par une epreuve. Les pannes vivent dans la memoire du bundle (un
   greffon d'esbuild remplace le texte lu) ou dans une copie hors du depot
   pour les fichiers que le harnais LIT : rien de l'arbre partage ne bouge. */

const racine = path.resolve(import.meta.dirname, '..');
const PUR = 'src/shared/equipe-du-matin-pur.ts';
const SALLE = 'src/shared/salle-des-envois.ts';
const FACTEUR = 'supabase/functions/envois-partent/index.ts';
const WEB = 'supabase/functions/whatsapp-webhook/index.ts';
const FN = 'supabase/functions/equipe-du-matin/index.ts';
const SQL = 'supabase/migrations/0243_l_equipe_du_matin.sql';
const PAGE = 'src/apps/trone/routes/clients/Gerard.tsx';

const PANNES = [
  { nom: '11 h compte comme avant', fichier: PUR, r: [['return rdvs.find((r) => { const m = minuteDuRdv(r.time); return m === null || m < limiteMin; }) ?? null;', 'return rdvs.find((r) => { const m = minuteDuRdv(r.time); return m === null || m <= limiteMin; }) ?? null;']] },
  { nom: 'une heure illisible compte comme apres', fichier: PUR, r: [['return rdvs.find((r) => { const m = minuteDuRdv(r.time); return m === null || m < limiteMin; }) ?? null;', 'return rdvs.find((r) => { const m = minuteDuRdv(r.time); return m !== null && m < limiteMin; }) ?? null;']] },
  { nom: 'un rendez-vous annule compte', fichier: PUR, r: [["export const STATUTS_QUI_COMPTENT: readonly string[] = ['confirmé', 'en attente', 'honoré'];", "export const STATUTS_QUI_COMPTENT: readonly string[] = ['confirmé', 'en attente', 'honoré', 'annulé'];"]] },
  { nom: 'la journee part sans rendez-vous', fichier: PUR, r: [['    const planning = duJour.length > 0 ? presents : [];', '    const planning = presents;']] },
  { nom: 'la question part avec un rendez-vous avant 11 h', fichier: PUR, r: [['    if (rienAvant(duJour) && presents.length > 0) {', '    if (presents.length > 0) {']] },
  { nom: 'la Maison fermee ne fait rien taire', fichier: PUR, r: [['    if (!ouvert) return { branchId, ouvert,', '    if (ouvert === null) return { branchId, ouvert,']] },
  { nom: 'le repos du planning est oublie', fichier: PUR, r: [["      if (auReposCeJour(o.planning, d.staffId, o.jour)) { saute('au-repos'); continue; }\n", '']] },
  { nom: 'une fiche partie recoit encore', fichier: PUR, r: [["      if (propreDuMatin(f.archiveeLe)) { saute('partie'); continue; }\n", '']] },
  { nom: 'allume par defaut', fichier: PUR, r: [['return { actif: o.actif === true, destinataires,', 'return { actif: o.actif !== false, destinataires,']] },
  { nom: 'la limite par defaut a 8 h 30', fichier: PUR, r: [["export const LIMITE_PAR_DEFAUT = '07:30';", "export const LIMITE_PAR_DEFAUT = '08:30';"]] },
  { nom: 'une reponse apres la limite vaut', fichier: PUR, r: [['  if (o.maintenantMs > Date.parse(p.limite)) {', '  if (false) {']] },
  { nom: 'on choisit deux fois', fichier: PUR, r: [["  if (p.etat === 'choisie') return { ok: false, code: 'deja',", "  if (p.etat === 'jamais') return { ok: false, code: 'deja',"]] },
  { nom: 'un rendez-vous arrive avant 11 h ne compte plus', fichier: PUR, r: [['  const avant = premierAvant(o.rdvsDuJour);', '  const avant = null;']] },
  { nom: 'le mur s arrete a l heure d arrivee', fichier: PUR, r: [["  fin: `${String(heure).padStart(2, '0')}h${String(INSTALLATION_MIN).padStart(2, '0')}`,", "  fin: `${String(heure).padStart(2, '0')}h00`,"]] },
  { nom: 'le bouton accepte 11 h', fichier: PUR, r: [['export const RE_BOUTON_DE_L_EQUIPE = /^EQUIPE_TARD:(\\d{4}-\\d{2}-\\d{2}):(9|10)$/;', 'export const RE_BOUTON_DE_L_EQUIPE = /^EQUIPE_TARD:(\\d{4}-\\d{2}-\\d{2}):(9|10|11)$/;']] },
  { nom: 'une variable garde ses sauts de ligne', fichier: PUR, r: [["export const variableDuModele = (s: unknown): string => String(s ?? '').replace(/[\\r\\n\\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();", "export const variableDuModele = (s: unknown): string => String(s ?? '').trim();"]] },
  { nom: 'la liste deborde de sa variable', fichier: PUR, r: [['  if (tout.length <= auPlus) return tout;', '  return tout;']] },
  { nom: 'la question part un jour qui ouvre a 9 h', fichier: PUR, r: [["      if (ouverture !== null && ouverture > HEURE_HABITUELLE * 60) saute('ouvre-apres-8-h');\n      else if (!decideur", '      if (!decideur']] },
  { nom: 'l exception d ouverture est oubliee', fichier: PUR, r: [['  return minuteDeLHoraire(ex?.open) ?? minuteDeLHoraire(h.open) ?? HEURE_HABITUELLE * 60;', '  return minuteDeLHoraire(h.open) ?? HEURE_HABITUELLE * 60;']] },
  { nom: 'le passage reveille a 5 h 30', fichier: PUR, r: [['export const PASSAGE_DES_MIN = 5 * 60 + 45;', 'export const PASSAGE_DES_MIN = 5 * 60;']] },
  { nom: 'la salle retient l equipe pendant les heures calmes', fichier: SALLE, r: [['  e.parLaMain === true || e.type === TYPE_PROGRAMME_ICI || e.type === TYPE_DE_L_EQUIPE_ICI;', '  e.parLaMain === true || e.type === TYPE_PROGRAMME_ICI;']] },
  { nom: 'le facteur retient l equipe pendant les heures calmes', fichier: FACTEUR, r: [[' || l.data.type === TYPE_DE_L_EQUIPE_DU_MATIN))', '))']] },
  { nom: 'l automate lit le bouton', fichier: WEB, r: [['        if (lisLeBoutonDeLEquipe(e.bouton?.id)) continue;\n', '']] },
  { nom: 'le bouton part sans son numero', fichier: WEB, r: [["body: JSON.stringify({ geste: 'repondre', jour: b.jour, heure: b.heure, numero: e.numero }),", "body: JSON.stringify({ geste: 'repondre', jour: b.jour, heure: b.heure }),"]] },
  { nom: 'la devise recopiee a la main', fichier: FN, r: [["const DEVISE = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';", "const DEVISE = 'mi nyo dekpe, votre beaute est deja la';"]] },
  { nom: 'l equipe prevenue avant le mur', fichier: FN, r: [["  const { error: errMur } = await sb.from('blocages').upsert({", "  const { error: errMur } = await sb.from('blocages').select({"]] },
  { nom: 'le Trone repond sans la direction', fichier: FN, r: [['    if (errDirection || estDirection !== true) return json(', '    if (errDirection) return json(']] },
  { nom: 'un autre numero repond', fichier: FN, r: [['x.numeroDuDecideur.slice(-8) === numeroDuMatin(o.numero).slice(-8)', 'true']] },
  { nom: 'le reveil a 7 h a Cotonou', fichier: SQL, r: [["select cron.schedule('equipe-du-matin', '0 5 * * *',", "select cron.schedule('equipe-du-matin', '0 6 * * *',"]] },
  { nom: 'le personnel ecrit le document du matin', fichier: SQL, r: [["  as restrictive for update to anon, authenticated\n  using (key <> 'mnd_equipe_du_matin')", "  as restrictive for update to anon, authenticated\n  using (true)"]] },
  { nom: 'la question pour tout le personnel', fichier: PAGE, r: [['const questionDuMatin = direction && estOuverte(propositionDuMatin, maintenantMatin) ? propositionDuMatin : null;', 'const questionDuMatin = estOuverte(propositionDuMatin, maintenantMatin) ? propositionDuMatin : null;']] },
];

const lisLF = (rel) => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
const applique = (panne) => {
  let t = lisLF(panne.fichier);
  for (const [avant, apres] of panne.r) {
    if (!t.includes(avant)) throw new Error(`panne introuvable : ${panne.nom} (${avant.slice(0, 60)})`);
    t = t.replace(avant, () => apres);
  }
  return t;
};

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-equipe-du-matin-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    const texte = panne ? applique(panne) : null;
    const cible = panne ? path.normalize(path.join(racine, panne.fichier)) : null;
    const greffon = {
      name: 'panne',
      setup(b) {
        if (!panne) return;
        b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
          if (path.normalize(args.path) !== cible) return undefined;
          return { contents: texte, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
        });
      },
    };
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-l-equipe-du-matin.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      plugins: [greffon],
    });
    const env = { ...process.env };
    delete env.EQUIPE_PANNE_FICHIER;
    delete env.EQUIPE_PANNE_COPIE;
    if (panne) {
      const copie = path.join(dossier, 'copie', panne.fichier);
      mkdirSync(path.dirname(copie), { recursive: true });
      writeFileSync(copie, texte);
      env.EQUIPE_PANNE_FICHIER = panne.fichier;
      env.EQUIPE_PANNE_COPIE = copie;
    }
    return spawnSync(process.execPath, [sortie], { cwd: racine, env, encoding: 'utf8' });
  } finally {
    setTimeout(() => rmSync(dossier, { recursive: true, force: true }), 0);
  }
};

const prouve = process.argv.includes('--prouve');
const net = await lance(null);
process.stdout.write(net.stdout);
if (net.status !== 0) { process.stderr.write(net.stderr); process.exit(1); }
if (prouve) {
  let muettes = 0;
  for (const p of PANNES) {
    let r;
    try { r = await lance(p); } catch (e) { console.log(`INTROUVABLE ${p.nom} : ${String(e?.message ?? e).slice(0, 120)}`); muettes++; continue; }
    const epreuve = (r.stdout ?? '').split('\n').find((l) => l.startsWith('ECHEC'));
    const crie = r.status !== 0 && !!epreuve;
    if (!crie) muettes++;
    const chute = String(r.stderr ?? '').split(/\r?\n/).find((l) => /Error/.test(l))?.trim().slice(0, 140) ?? '';
    console.log(`${crie ? 'CRIE ' : 'MUETTE'} ${p.nom}${epreuve ? `  (${epreuve.slice(6).split(' -> ')[0].trim()})` : r.status !== 0 ? `  (le harnais tombe : ${chute})` : ''}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
