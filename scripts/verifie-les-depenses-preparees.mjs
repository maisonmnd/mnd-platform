import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES DEPENSES PREPAREES PAR GRENAT, EPROUVEES (5 novembre 2026).
   `node scripts/verifie-les-depenses-preparees.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier. Les pannes vivent dans la memoire du bundle (un greffon
   d'esbuild remplace le texte lu), jamais dans le depot : l'empreinte de
   chaque fichier est comparee avant et apres. Une panne « disque » touche un
   fichier que le harnais LIT : on monte alors un depot fantome ou ce seul
   fichier change. Une panne dont le texte ne se trouve plus exactement une
   fois fait echouer la preuve. */

const racine = path.resolve(import.meta.dirname, '..');
const P = 'src/shared/depense-en-une-phrase-pur.ts';
const E = 'src/shared/engagements-du-mois-pur.ts';
const DEP = 'src/apps/trone/routes/finances/Depenses.tsx';
const CAISSE = 'src/apps/trone/routes/vente/Caisse.tsx';
const CASE = 'src/apps/trone/routes/finances/DepenseEnUnePhrase.tsx';
const ENG = 'src/apps/trone/routes/finances/EngagementsDuMois.tsx';
/* Les engagements a la direction seule (0160, 5 novembre 2026). */
const MIG = 'supabase/migrations/0160_les_engagements_a_la_direction.sql';
const ESSAI = 'supabase/essai_0160_a_blanc.sql';
const STORE = 'src/shared/engagements-du-mois.ts';
const AUTH = 'src/shared/auth.ts';
/* Tout ce que le harnais LIT (readFileSync). */
const LUS = [DEP, CAISSE, CASE, ENG, E, P, MIG, ESSAI, STORE, AUTH];

const PANNES = [
  /* La phrase. */
  { nom: 'le montant qui dit ses francs ne passe plus devant', fichier: P, avant: 'const retenus = marques.length > 0 ? marques : candidats;', apres: 'const retenus = candidats;' },
  { nom: '« 3 mille » vaut trois', fichier: P, avant: 'valeur *= 1000; a += 1; marque = true;', apres: 'a += 1; marque = true;' },
  { nom: '« hier » reste aujourd hui', fichier: P, avant: "date = decale(ctx.aujourdhui, -1); jourDit = 'hier';", apres: "jourDit = 'hier';" },
  { nom: '« especes » ne mene a aucune caisse', fichier: P, avant: "if (!caisse) { caisse = ctx.caisseDesEspeces; caisseDite = 'especes'; }", apres: "if (!caisse) { caisseDite = 'especes'; }" },
  { nom: '« MoMo » mene a MoMo Prive', fichier: P, avant: 'caisse = prive ? ctx.caisseMomoPrive : ctx.caisseMomo;', apres: 'caisse = ctx.caisseMomoPrive;' },
  { nom: '« Autres » se lit sans « caisse »', fichier: P, avant: 'if (x.mots.length === 1 && NOMS_COMMUNS.has(x.mots[0]) && !apresCaisse) continue;', apres: '' },
  { nom: '« paye par Brice » se perd', fichier: P, avant: 'porteur = r.nom; avancee = aSaPoche;', apres: 'avancee = aSaPoche;' },
  { nom: 'un inconnu paye sans question', fichier: P, avant: 'if (porteurInconnu) questions.push(', apres: 'if (false) questions.push(' },
  { nom: '« par zem » devient un porteur', fichier: P, avant: "} else if (m === 'par') {\n      const r = lisUnNom(i + 1); if (r) retiens(r, i, false, true);", apres: "} else if (m === 'par') {\n      const r = lisUnNom(i + 1); if (r) retiens(r, i, false, false);" },
  { nom: 'le transport n est plus de la Logistique', fichier: P, avant: "mots: /^(transports?|taxis?|", apres: "mots: /^(taxis?|" },
  { nom: 'le mois du libelle perd son annee', fichier: P, avant: 'morceaux.push(String(an));', apres: '' },
  { nom: 'pas de montant, pas de question', fichier: P, avant: "questions.push('Combien ? Je ne lis pas de montant dans la phrase.');", apres: '' },
  { nom: 'deux montants, Grenat en devine un', fichier: P, avant: 'if (retenus.length === 1 || (retenus.length > 1 && montantsVus.length === 1)) {', apres: 'if (retenus.length >= 1) {' },
  { nom: 'un jour a venir passe', fichier: P, avant: 'if (date > ctx.aujourdhui) questions.push(', apres: 'if (false) questions.push(' },
  { nom: 'un prestataire se pose', fichier: P, avant: 'if (prestataire) {', apres: 'if (false) {' },
  { nom: 'la famille entre au Trone', fichier: P, avant: '.some((m) => MOTS_DE_LA_FAMILLE.test(m))', apres: '.some(() => false)' },
  { nom: 'le doublon du jour se pose', fichier: P, avant: 'if (deja) {', apres: 'if (false) {' },
  { nom: 'la phrase de l equipe s enregistre acquise', fichier: P, avant: 'const acquise = enregistreeAcquise(o.role);', apres: 'const acquise = true;' },
  { nom: 'un role inconnu s enregistre acquis', fichier: P, avant: "role === 'souverain' || role === 'gerant';", apres: "role !== 'maitre';" },
  { nom: 'la Maison a paye ne s ecrit pas', fichier: P, avant: '...(l.laMaisonAPaye && !l.porteur ? { laMaisonAPaye: true } : {}),', apres: '' },
  { nom: 'un compte de l equipe signe d un autre nom', fichier: P, avant: 'if (ctx.signeDe) { porteur = ctx.signeDe;', apres: 'if (ctx.signeDe) { porteur = porteur ?? ctx.signeDe;' },
  /* Les engagements. */
  { nom: 'la ligne deja la se repose', fichier: E, avant: "if (ids.has(d.id)) dejaLa.push({ cle, id: d.id, pourquoi: 'meme-ligne' });", apres: "if (false) dejaLa.push({ cle, id: d.id, pourquoi: 'meme-ligne' });" },
  { nom: 'le mois prepare ne s inscrit pas', fichier: E, avant: '      faits.push(m);\n', apres: '\n' },
  { nom: 'Grenat prepare avant le jour', fichier: E, avant: 'if (dateDuMois(e.jour, m) > aujourdhui) continue;', apres: '' },
  { nom: 'le rattrapage remonte sans fin', fichier: E, avant: 'for (let m = e.depuis > plusTot ? e.depuis : plusTot;', apres: 'for (let m = e.depuis;' },
  { nom: 'la depense preparee arrive validee', fichier: E, avant: "validation: { etat: 'attente' as const, soumisLe: maintenantISO, soumisPar: GRENAT },", apres: "validation: { etat: 'validee' as const, soumisLe: maintenantISO, soumisPar: GRENAT }," },
  { nom: 'le 31 de novembre existe', fichier: E, avant: 'Math.min(Math.max(1, Math.floor(jour)), dernierJour(mois))', apres: 'Math.max(1, Math.floor(jour))' },
  { nom: 'la saisie a la main ne ferme pas le mois', fichier: E, avant: "if (main) dejaLa.push({ cle, id: main.id, pourquoi: 'saisie-a-la-main' });", apres: "if (false) dejaLa.push({ cle, id: main.id, pourquoi: 'saisie-a-la-main' });" },
  { nom: 'une saisie refusee ferme le mois', fichier: E, avant: "    if (e.validation?.etat === 'refusee') continue;\n    const leurs = motsDe(", apres: '    const leurs = motsDe(' },
  { nom: 'un engagement en pause se prepare', fichier: E, avant: 'if (!e.actif || !estUnMois(e.depuis)', apres: 'if (!estUnMois(e.depuis)' },
  { nom: 'la reprise repart du mois deja compte', fichier: E, avant: 'const premier = moisSuivant(moisDe(String(d.date ?? o.aujourdhui)));', apres: 'const premier = moisDe(String(d.date ?? o.aujourdhui));' },
  { nom: 'une mensuelle reprise se repropose', fichier: E, avant: ' && !reprises.has(d.id));', apres: ');' },
  { nom: 'la reprise perd son porteur', fichier: E, avant: "...(String(d.porteur ?? '').trim() ? { porteur: String(d.porteur).trim() } : {}),", apres: '' },
  /* Les ecrans (le harnais les lit). */
  { nom: 'Depenses ne prepare plus les engagements', fichier: DEP, avant: '  usePreparationDesEngagements();\n', apres: '\n', disque: true },
  { nom: 'Valider tout ouvert sans la regle', fichier: DEP, avant: 'ids.has(x.id) && x.validation && peutValider(monProfil?.role, monNom, x)', apres: 'ids.has(x.id) && x.validation', disque: true },
  { nom: 'la case quitte Depenses', fichier: DEP, avant: '      <DepenseEnUnePhrase />\n', apres: '\n', disque: true },
  { nom: 'la case descend dans le ticket de la Caisse', fichier: CAISSE, avant: '      <DepenseEnUnePhrase ou="caisse" />\n', apres: '', disque: true,
    plus: { avant: '        <div className="trv-pos-grid">', apres: '        <DepenseEnUnePhrase ou="caisse" />\n        <div className="trv-pos-grid">' } },
  { nom: 'la case pose sans relire le magasin', fichier: CASE, avant: 'const j = jugeLaPhrase(lecture, { branchId: branch.id, existantes: toutes, prestataires });\n    if (!j.ok)', apres: 'const j = jugement;\n    if (!j.ok)', disque: true },
  { nom: 'la preparation tourne hors ligne', fichier: ENG, avant: "if (typeof navigator !== 'undefined' && navigator.onLine === false) return;", apres: '', disque: true },
  { nom: 'un crochet sous le retour des engagements', fichier: ENG, avant: '  if (!direction) return null;\n', apres: '  if (!direction) return null;\n  const [x] = useState(0); void x;\n', disque: true },
  /* Les engagements a la direction seule (0160). */
  { nom: '0160 reserve aussi une autre cle a la direction', fichier: MIG, avant: "  select array['mnd_engagements_du_mois']::text[]", apres: "  select array['mnd_engagements_du_mois', 'mnd_porteurs']::text[]", disque: true },
  { nom: '0160 : la regle devient permissive (elle ne retient plus rien)', fichier: MIG, avant: '  as restrictive\n', apres: '  as permissive\n', disque: true },
  { nom: '0160 : le gerant n est plus de la direction', fichier: MIG, avant: '  using (not (key = any(public.cles_de_la_direction())) or public.est_direction())\n', apres: '  using (not (key = any(public.cles_de_la_direction())) or public.is_souverain())\n', disque: true },
  { nom: '0160 : l ecriture n est plus gardee', fichier: MIG, avant: '  with check (not (key = any(public.cles_de_la_direction())) or public.est_direction());', apres: '  with check (true);', disque: true },
  { nom: '0160 reecrit une regle d avant', fichier: MIG, avant: '-- ⟨/0160⟩', apres: 'drop policy if exists docs_staff_lire on public.documents;\n-- ⟨/0160⟩', disque: true },
  { nom: '0160 touche une donnee', fichier: MIG, avant: '-- ⟨/0160⟩', apres: "update public.documents set data = '[]'::jsonb where key = 'mnd_engagements_du_mois';\n-- ⟨/0160⟩", disque: true },
  { nom: 'l essai ne porte plus la migration a l identique', fichier: ESSAI, avant: '  as restrictive\n', apres: '  as permissive\n', disque: true },
  { nom: 'l essai ne compare plus les autres cles', fichier: ESSAI, avant: "if (av -> 'cles' ->> k) is not distinct from (ap -> 'cles' ->> k) then", apres: 'if true then', disque: true },
  { nom: 'l essai laisse la migration derriere lui', fichier: ESSAI, avant: "  raise exception 'ESSAI 0160 : % | %'", apres: "  raise notice 'ESSAI 0160 : % | %'", disque: true },
  { nom: 'les engagements se montrent a l equipe', fichier: ENG, avant: '  if (!direction) return null;\n', apres: '\n', disque: true },
  { nom: 'la preparation tourne pour l equipe', fichier: ENG, avant: '    if (!direction) return;\n', apres: '\n', disque: true },
  { nom: 'l equipe compte comme la direction', fichier: ENG, avant: "role === 'souverain' || role === 'gerant';", apres: 'role !== undefined;', disque: true },
  { nom: 'la deconnexion garde les engagements sur le poste', fichier: AUTH, avant: "  'mnd_engagements_du_mois',\n];", apres: '];', disque: true },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');
const applique = (texte, p) => {
  let t = texte.split(p.avant).join(p.apres);
  if (p.plus) t = t.split(p.plus.avant).join(p.plus.apres);
  return t;
};

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-depenses-preparees-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    let cwd = racine;
    if (panne?.disque) {
      cwd = path.join(dossier, 'depot');
      for (const rel of LUS) {
        const texte = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
        const cible = path.join(cwd, rel);
        mkdirSync(path.dirname(cible), { recursive: true });
        writeFileSync(cible, rel === panne.fichier ? applique(texte, panne) : texte);
      }
    }
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-depenses-preparees.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      plugins: panne && !panne.disque ? [{
        name: 'panne',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = path.relative(racine, args.path).split(path.sep).join('/');
            if (rel !== panne.fichier) return undefined;
            const contents = applique(readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n'), panne);
            return { contents, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) };
          });
        },
      }] : [],
    });
    return spawnSync(process.execPath, [sortie], { cwd, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
};

const prouve = process.argv.includes('--prouve');
const net = await lance(null);
process.stdout.write(net.stdout ?? '');
if (net.status !== 0) { process.stderr.write(net.stderr ?? ''); process.exit(1); }
if (prouve) {
  let muettes = 0;
  for (const p of PANNES) {
    const texte = readFileSync(path.join(racine, p.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(p.avant).length - 1;
    const foisPlus = p.plus ? texte.split(p.plus.avant).length - 1 : 1;
    const avant = md5(p.fichier);
    let verdict;
    if (fois !== 1 || foisPlus !== 1) verdict = `INTROUVABLE (${fois} fois${p.plus ? `, ${foisPlus}` : ''})`;
    else {
      const r = await lance(p);
      verdict = r.status !== 0 ? 'CRIE ' : 'MUETTE';
    }
    if (md5(p.fichier) !== avant) verdict = `LE FICHIER A CHANGE (${verdict})`;
    if (verdict !== 'CRIE ') muettes++;
    console.log(`${verdict} ${p.nom}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) ou introuvable(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
