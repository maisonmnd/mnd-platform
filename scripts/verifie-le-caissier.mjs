import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE CAISSIER DE GRENAT, EPROUVE (13 novembre 2026).
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
const MAIN = 'src/apps/trone/shell/useLeCaissier.ts';
const SHELL = 'src/apps/trone/shell/Shell.tsx';
const LJ = 'src/apps/trone/routes/finances/LaJournee.tsx';
const CARTE = 'src/apps/trone/routes/systeme/CarteClotureDeGrenat.tsx';
const MAINGR = 'src/apps/trone/shell/useLaMainDeGrenat.ts';
const LUS = [P, FN, SQL, MAIN, SHELL, LJ, CARTE, MAINGR];

const PANNES = [
  /* La regle : quand prevenir, quand demander. */
  { nom: 'le comptoir est prevenu a la fin, sans les quinze minutes', fichier: P, avant: 'if (!marque.demandeLe && ici.minutes >= c.finMin + COMPTOIR_PREVENU_APRES_MIN) {', apres: 'if (!marque.demandeLe && ici.minutes >= c.finMin) {' },
  { nom: 'le comptoir est prevenu a chaque passage', fichier: P, avant: 'if (!marque.demandeLe && ici.minutes >= c.finMin + COMPTOIR_PREVENU_APRES_MIN) {', apres: 'if (ici.minutes >= c.finMin + COMPTOIR_PREVENU_APRES_MIN) {' },
  { nom: 'la facture est redemandee a chaque passage', fichier: P, avant: 'if (!marque.pieceDemandeeLe && factureVers !== null', apres: 'if (factureVers !== null' },
  { nom: 'la facture est demandee avant son heure', fichier: P, avant: 'factureVers !== null && ici.minutes >= factureVers\n', apres: 'factureVers !== null\n' },
  { nom: 'la facture part seule apres 23 h', fichier: P, avant: 'return a <= DERNIERE_FACTURE_SEULE_MIN ? a : null;', apres: 'return a;' },
  { nom: 'la facture du matin se rattrape le soir', fichier: P, avant: '&& ici.minutes <= Math.min(factureVers + FENETRE_DE_LA_FACTURE_MIN, DERNIERE_FACTURE_SEULE_MIN)) {', apres: '&& ici.minutes <= DERNIERE_FACTURE_SEULE_MIN) {' },
  { nom: 'la derniere facture seule revient a 19 h 30', fichier: P, avant: 'export const DERNIERE_FACTURE_SEULE_MIN = 23 * 60;', apres: 'export const DERNIERE_FACTURE_SEULE_MIN = 19 * 60 + 30;' },
  { nom: 'une facture du comptoir est doublee', fichier: P, avant: 'const factureVers = pourquoiPas || c.pieceId ? null', apres: 'const factureVers = pourquoiPas ? null' },
  { nom: 'le lendemain, le caissier travaille encore', fichier: P, avant: "  if (ici.jour !== f.jour) return [];\n  const sorties", apres: '  const sorties' },
  { nom: 'eteint, le caissier decide encore', fichier: P, avant: "export function decisionsDuCaissier(f: FaitsDuCaissier): DecisionDuCaissier[] {\n  if (!f.reglages.actif) return [];", apres: 'export function decisionsDuCaissier(f: FaitsDuCaissier): DecisionDuCaissier[] {' },
  { nom: 'un delai inconnu est accepte', fichier: P, avant: 'DELAIS_DE_LA_FACTURE.includes(delai) ? delai', apres: 'Number.isFinite(delai) ? delai' },
  { nom: 'la facture part malgre « passe au comptoir »', fichier: P, avant: "  if (soignee.passeAuComptoir || (payeuse && payeuse.passeAuComptoir)) return 'elle passe toujours au comptoir';\n", apres: '' },
  { nom: 'la facture part malgre un acompte a verifier', fichier: P, avant: "  if ((Number(a.depositXof) || 0) > 0 && !a.depositConfirmed) return 'un acompte attend d’être vérifié';\n", apres: '' },
  { nom: 'la facture part sur une partie deja encaissee', fichier: P, avant: "  if (argentDuCarnet(a) + acompteRecu(a) > 0) return 'une partie est déjà encaissée';\n", apres: '' },
  { nom: 'la facture part malgre « retenir sa facture »', fichier: P, avant: "  if (a.caissier?.retenueLe) return 'retenue au comptoir';\n", apres: '' },
  { nom: 'la facture part sans numero', fichier: P, avant: "  if (!destinataire.aUnNumero) return 'pas de numéro sur sa fiche';\n", apres: '' },
  { nom: 'la facture part malgre « pas de papiers par WhatsApp »', fichier: P, avant: "  if (destinataire.sansPapiersWa) return 'pas de facture par WhatsApp (sa fiche le dit)';\n", apres: '' },
  { nom: 'la payeuse d un rituel offert est oubliee', fichier: P, avant: 'const destinataire = payeuse?.aUnNumero ? payeuse : soignee;', apres: 'const destinataire = soignee;' },
  { nom: 'le rituel termine par elle est suivi', fichier: P, avant: "if (!a || a.status !== 'confirmé' || a.termineParElle) return null;", apres: "if (!a || a.status !== 'confirmé') return null;" },
  { nom: 'la notification dit le nom en clair', fichier: P, avant: "return { titre: `À encaisser · ${c.qui || 'une cliente'}`", apres: "return { titre: `À encaisser · ${c.qui || 'une cliente'} (Celine Dossa)`" },
  /* Les gestes surs. */
  { nom: 'le recu part sans les quinze minutes du comptoir', fichier: P, avant: 'return Number.isFinite(calme) && f.maintenantMs - calme >= RECU_APRES_MIN * 60_000;', apres: 'return true;' },
  { nom: 'une facture du comptoir part entre deux clotures', fichier: P, avant: "if (!a || a.id !== g.rdvId || !a.caissier?.pieceDemandeeLe || a.status !== 'confirmé') return false;", apres: "if (!a || a.id !== g.rdvId || a.status !== 'confirmé') return false;" },
  { nom: 'la facture retenue part quand meme', fichier: P, avant: '  if (pourquoiPasDeFactureSeule(a, f.fiches)) return false;\n  const c = f.constats', apres: '  const c = f.constats' },
  { nom: 'eteint, le caissier fait encore les gestes', fichier: P, avant: "export function gesteDuCaissier(g: GesteSur, f: FaitsDuCaissier): boolean {\n  if (!f.reglages.actif) return false;", apres: 'export function gesteDuCaissier(g: GesteSur, f: FaitsDuCaissier): boolean {' },
  /* La piece au Trone. */
  { nom: 'une seconde piece s ecrit', fichier: P, avant: "&& !a.termineParElle && !aDejaUnePiece;", apres: '&& !a.termineParElle;' },
  { nom: 'une piece s ecrit malgre l encaissement', fichier: P, avant: "return !!a.caissier?.pieceDemandeeLe && !a.caissier.retenueLe && a.status === 'confirmé'", apres: 'return !!a.caissier?.pieceDemandeeLe && !a.caissier.retenueLe' },
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
  { nom: 'deux postes ecrivent la piece', fichier: MAIN, avant: "? ecriture.is('data->caissier->>pieceLe', null)", apres: '? ecriture', disque: true },
  { nom: 'la main du caissier ne relit pas la ligne', fichier: MAIN, avant: 'if (!d || !pieceDuCaissierAEcrire(d as never, false)) return;', apres: 'if (!d) return;', disque: true },
  { nom: 'le Shell ne monte pas la main du caissier', fichier: SHELL, avant: '  useLeCaissier();', apres: '', disque: true },
  { nom: 'le papier du caissier attend le matin', fichier: MAINGR, avant: '? { partA: Date.now() + REGLES_PAR_DEFAUT.salleMin * 60_000, calme: false }', apres: '? heureDeDepart(Date.now(), REGLES_PAR_DEFAUT)', disque: true },
  { nom: 'le facteur retient la nuit le papier du caissier', fichier: MAINGR, avant: "...(duCaissier ? { parLaMain: true } : {})", apres: '', disque: true },
  { nom: 'retenir ne dit plus qui', fichier: LJ, avant: 'retenueLe: new Date().toISOString(), retenuePar: moi', apres: 'retenueLe: new Date().toISOString()', disque: true },
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
