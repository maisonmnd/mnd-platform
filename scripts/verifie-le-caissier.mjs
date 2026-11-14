import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE CAISSIER DE GRENAT, EPROUVE (13 novembre 2026, revu le 14 : aucune facture sans la direction).
   `node scripts/verifie-le-caissier.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier. Les pannes de la regle vivent dans la memoire du bundle (un
   greffon d'esbuild remplace le texte lu) ; celles de la fonction, de la
   migration et du Trone, lues par le harnais, vivent dans un depot fantome
   ecrit dans un dossier temporaire, jamais dans le depot : l'empreinte de
   chaque fichier est comparee avant et apres. Une panne dont le texte ne se
   trouve plus exactement une fois fait echouer la preuve. */

const racine = path.resolve(import.meta.dirname, '..');
const P = 'src/shared/le-caissier-pur.ts';
const FN = 'supabase/functions/cloture-du-jour/index.ts';
const SQL = 'supabase/migrations/0207_le_caissier_de_grenat.sql';
const SHELL = 'src/apps/trone/shell/Shell.tsx';
const LJ = 'src/apps/trone/routes/finances/LaJournee.tsx';
const CARTE = 'src/apps/trone/routes/systeme/CarteClotureDeGrenat.tsx';
const MAINGR = 'src/apps/trone/shell/useLaMainDeGrenat.ts';
const CLO = 'src/shared/cloture-du-jour-pur.ts';
const LUS = [P, FN, SQL, SHELL, LJ, CARTE, MAINGR, CLO];

const PANNES = [
  /* La regle : prevenir le comptoir. */
  { nom: 'le comptoir est prevenu a la fin, sans les quinze minutes', fichier: P, avant: 'if (ici.minutes < c.finMin + COMPTOIR_PREVENU_APRES_MIN) continue;', apres: 'if (ici.minutes < c.finMin) continue;' },
  { nom: 'le comptoir est prevenu a chaque passage', fichier: P, avant: 'if (!s || s.a.caissier?.demandeLe) continue;', apres: 'if (!s) continue;' },
  { nom: 'le lendemain, le caissier travaille encore', fichier: P, avant: "  if (ici.jour !== f.jour) return [];\n  const sorties", apres: '  const sorties' },
  { nom: 'eteint, le caissier decide encore', fichier: P, avant: "export function decisionsDuCaissier(f: FaitsDuCaissier): DecisionDuCaissier[] {\n  if (!f.reglages.actif) return [];", apres: 'export function decisionsDuCaissier(f: FaitsDuCaissier): DecisionDuCaissier[] {' },
  { nom: 'le rituel termine par elle est suivi', fichier: P, avant: "if (!a || a.status !== 'confirmé' || a.termineParElle) return null;", apres: "if (!a || a.status !== 'confirmé') return null;" },
  { nom: 'la notification dit le nom en clair', fichier: P, avant: "titre: `À encaisser · ${c.qui || 'une cliente'}`,", apres: "titre: `À encaisser · ${c.qui || 'une cliente'} (Celine Dossa)`," },
  { nom: 'la notification promet une facture seule', fichier: P, avant: "Encaissez-la ; sa facture ne part qu’avec l’accord de la direction (La journée).", apres: 'Sans encaissement, sa facture partira seule dans une heure.' },
  /* Aucune facture ne part seule. */
  { nom: 'le caissier envoie une facture a regler', fichier: P, avant: "  if (g.papier !== 'recu') return false;\n", apres: '' },
  { nom: 'la cloture renvoie seule la facture a regler', fichier: CLO, avant: "} else if (genre === 'facture') {", apres: '} else if (false) {' },
  { nom: 'le recu part sans les quinze minutes du comptoir', fichier: P, avant: 'return !!p && Number.isFinite(calme) && f.maintenantMs - calme >= RECU_APRES_MIN * 60_000;', apres: 'return !!p;' },
  { nom: 'eteint, le caissier fait encore les gestes', fichier: P, avant: "export function gesteDuCaissier(g: GesteSur, f: FaitsDuCaissier): boolean {\n  if (!f.reglages.actif) return false;", apres: 'export function gesteDuCaissier(g: GesteSur, f: FaitsDuCaissier): boolean {' },
  /* Ce que la direction voit. */
  { nom: 'la facture se propose sans numero', fichier: P, avant: "  if (!destinataire.aUnNumero) return 'pas de numéro sur sa fiche';\n", apres: '' },
  { nom: 'la facture se propose malgre « pas de papiers par WhatsApp »', fichier: P, avant: "  if (destinataire.sansPapiersWa) return 'pas de facture par WhatsApp (sa fiche le dit)';\n", apres: '' },
  { nom: 'la payeuse d un rituel offert est oubliee', fichier: P, avant: 'const destinataire = payeuse?.aUnNumero ? payeuse : soignee;\n  if (!soignee || !destinataire) return', apres: 'const destinataire = soignee;\n  if (!soignee || !destinataire) return' },
  { nom: 'l acompte a verifier n est pas dit', fichier: P, avant: "  if ((Number(a.depositXof) || 0) > 0 && !a.depositConfirmed) dits.push('un acompte attend d’être vérifié');\n", apres: '' },
  { nom: 'passe au comptoir n est pas dit', fichier: P, avant: "  if (soignee?.passeAuComptoir || payeuse?.passeAuComptoir) dits.push('elle règle d’habitude au comptoir');\n", apres: '' },
  /* La fonction, la migration, le Trone (lus sur le disque). */
  { nom: 'la marque s ecrit sans condition', fichier: FN, avant: ".eq('id', frais.id).eq('updated_at', frais.updated_at).select('id, branch_id, data, updated_at');", apres: ".eq('id', frais.id).select('id, branch_id, data, updated_at');", disque: true },
  { nom: 'la decision ne se rejuge pas sur la ligne fraiche', fichier: FN, avant: 'if (!decisionsDuCaissier(faitsDuCaissier(constatsFrais, rdvsFrais)).some((x) => x.cle === d.cle))', apres: 'if (false)', disque: true },
  { nom: 'l essai ecrit les marques', fichier: FN, avant: "if (essai) { faits.push({ genre: d.genre, cle: d.cle, dit: `(essai, rien écrit) ${ditLa}` }); continue; }", apres: '', disque: true },
  { nom: 'le caissier fait tous les gestes de la cloture', fichier: FN, avant: 'if (caisse && !gesteDuCaissier(g, faitsDuCaissier(premiere.rdvs))) continue;', apres: '', disque: true },
  { nom: 'le caissier reecrit le compte rendu et le bilan', fichier: FN, avant: "if (caisse) {\n      dis('caisse'", apres: "if (false) {\n      dis('caisse'", disque: true },
  { nom: 'la copie du serveur derive', fichier: FN, avant: 'export const RECU_APRES_MIN = 15;', apres: 'export const RECU_APRES_MIN = 5;', disque: true },
  { nom: 'eteint, la fonction travaille', fichier: FN, avant: 'if (caisse && !reglagesCaissier.actif) {', apres: 'if (false) {', disque: true },
  { nom: '0207 : le caissier a chaque minute', fichier: SQL, avant: "'*/5 6-22 * * *'", apres: "'* 6-22 * * *'", disque: true },
  { nom: '0207 : le moment oublie', fichier: SQL, avant: `'{"source":"cron","moment":"caisse"}'::jsonb`, apres: `'{"source":"cron"}'::jsonb`, disque: true },
  { nom: 'tout le personnel voit « Envoyer sa facture »', fichier: LJ, avant: '{souverain && l.peutEnvoyer && <button type="button" className="lj-g" data-geste="envoyer-sa-facture"', apres: '{l.peutEnvoyer && <button type="button" className="lj-g" data-geste="envoyer-sa-facture"', disque: true },
  { nom: 'le geste d envoi ne garde pas la direction', fichier: LJ, avant: "const envoieSaFacture = (rdvId: string) => {\n    if (!souverain) { toast('La direction seule autorise l’envoi d’une facture.'); return; }", apres: 'const envoieSaFacture = (rdvId: string) => {', disque: true },
  { nom: 'les factures a autoriser ne se montrent pas', fichier: LJ, avant: 'data-lj="a-autoriser"', apres: 'data-lj="autre"', disque: true },
  { nom: 'le recu du caissier attend le matin', fichier: MAINGR, avant: '? { partA: Date.now() + REGLES_PAR_DEFAUT.salleMin * 60_000, calme: false }', apres: '? heureDeDepart(Date.now(), REGLES_PAR_DEFAUT)', disque: true },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-caissier-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    let cwd = racine;
    if (panne?.disque) {
      cwd = path.join(dossier, 'depot');
      for (const rel of LUS) {
        const texte = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
        const cible = path.join(cwd, rel);
        mkdirSync(path.dirname(cible), { recursive: true });
        writeFileSync(cible, rel === panne.fichier ? texte.split(panne.avant).join(panne.apres) : texte);
      }
    }
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-caissier.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      plugins: panne && !panne.disque ? [{
        name: 'panne',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = path.relative(racine, args.path).split(path.sep).join('/');
            if (rel !== panne.fichier) return undefined;
            const contents = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').split(panne.avant).join(panne.apres);
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
    const avant = md5(p.fichier);
    let verdict;
    if (fois !== 1) verdict = `INTROUVABLE (${fois} fois)`;
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
