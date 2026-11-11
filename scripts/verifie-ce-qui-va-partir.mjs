import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* CE QUI VA PARTIR, EPROUVE (5 novembre 2026).
   `node scripts/verifie-ce-qui-va-partir.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier. Les pannes vivent dans la memoire du bundle (un greffon
   d'esbuild remplace le texte lu du module pur) et dans la lecture des
   sources par le harnais (`__PANNE__`, pour le facteur, les fonctions, la
   migration, le Trone), jamais dans le depot : l'empreinte de chaque fichier
   est comparee avant et apres. Une panne dont le texte ne se trouve pas
   exactement une fois fait echouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const A = 'src/shared/arret-d-avance-pur.ts';
const C = 'src/shared/ce-qui-va-partir-pur.ts';
const CM = 'src/shared/conseil-du-matin-pur.ts';
const EP = 'supabase/functions/envois-partent/index.ts';
const RJ = 'supabase/functions/rappels-j1/index.ts';
const CF = 'supabase/functions/confirmation-rdv/index.ts';
const AVI = 'supabase/functions/avis-google/index.ts';
const RF = 'supabase/functions/relances-factures/index.ts';
const RE = 'supabase/functions/rappels-d-echeance/index.ts';
const FC = 'supabase/functions/fete-de-couronne/index.ts';
const AM = 'supabase/functions/assistant-maison/index.ts';
const SQL = 'supabase/migrations/0197_ce_qui_va_partir.sql';
const AV = 'src/apps/trone/routes/clients/AVenir.tsx';
const EA = 'src/apps/trone/routes/clients/EnvoisAutomatiques.tsx';
const MM = 'src/apps/trone/routes/clients/ModelesMeta.tsx';
const FM = 'supabase/functions/modeles-meta/index.ts';
const DN = 'src/apps/trone/routes/clients/ce-qui-va-partir-donnees.ts';
const GD = 'src/apps/trone/routes/clients/gerard-donnees.ts';
const CSS = 'src/apps/trone/routes/clients/clients.css';

const PANNES = [
  /* La cle */
  { nom: 'la relance perd son rang', fichier: A, avant: 'if (m) return `relance:${m[1]}:${m[2]}`;', apres: 'if (m) return `relance:${m[1]}`;' },
  { nom: 'garder ne nomme plus son rendez-vous', fichier: A, avant: "    if (genre === 'garder' && rdv) return `garder:${rdv}`;\n", apres: '' },
  { nom: 'la carte d anniversaire sans son annee', fichier: A, avant: 'return `anniv:${motDAvance(l?.clientId)}:${jour.slice(0, 4)}`;', apres: 'return `anniv:${motDAvance(l?.clientId)}`;' },
  /* La porte d'avance */
  { nom: 'remettre ne leve pas l arret', fichier: A, avant: '    if (motDAvance(a.remisLe) && motDAvance(a.remisLe) >= motDAvance(a.arreteLe)) continue;\n', apres: '' },
  { nom: 'le SMS d un rappel arrete part quand meme', fichier: A, avant: '  if (arret) {\n    const par', apres: "  if (arret && motDAvance(l?.colis?.genre) === 'whatsapp') {\n    const par" },
  { nom: 'le repli oublie', fichier: A, avant: 'if (repli && repli !== modele && !modeleEnPause(repli, o.pauses)) {', apres: 'if (false) {' },
  { nom: 'la pause sans la marque d Opale', fichier: A, avant: "return { statut: 'périmé', detail: `retenu par Opale : ${v.motif}`, modeleEnPause: v.modele };", apres: "return { statut: 'périmé', detail: v.motif, modeleEnPause: v.modele };" },
  { nom: 'l arret ecrit perime', fichier: A, avant: "return { statut: 'écarté', ecartePar: v.par,", apres: "return { statut: 'périmé', ecartePar: v.par," },
  { nom: 'l heure de l arret sans l annee', fichier: A, avant: '${MOIS_DITS[d.getUTCMonth()]} ${d.getUTCFullYear()} à', apres: '${MOIS_DITS[d.getUTCMonth()]} à' },
  /* La veille d'Opale */
  { nom: 'un message en route casse la serie', fichier: A, avant: "['non-remis', 'remis', 'lu'].includes(motDAvance(m.etat))", apres: "['non-remis', 'remis', 'lu', 'en-route'].includes(motDAvance(m.etat))" },
  { nom: 'la pause au sixieme', fichier: A, avant: 'const NON_REMIS_EN_PAUSE_AU = 5;', apres: 'const NON_REMIS_EN_PAUSE_AU = 6;' },
  { nom: 'le signal au troisieme', fichier: A, avant: 'const NON_REMIS_SIGNALE_AU = 2;', apres: 'const NON_REMIS_SIGNALE_AU = 3;' },
  /* La prevision */
  { nom: 'oui je viens ne tait plus le rappel', fichier: C, avant: '      if (rappelDeLaVeilleSeTait(a)) continue;\n', apres: '' },
  { nom: 'un rendez-vous honore garde son rappel', fichier: C, avant: "a.status === 'annulé' || a.status === 'honoré'", apres: "a.status === 'annulé'" },
  { nom: 'le passage du soir fait est ignore', fichier: C, avant: 'if (veille === aujourdhui && heureNow >= e.heures.premier) passage =', apres: 'if (false) passage =' },
  { nom: 'le foyer recoit un message par tete', fichier: C, avant: 'for (const f of foyersAPrevenir(tetes.filter((t) => !couvertes.has(t.id)))) {', apres: 'for (const f of tetes.filter((t) => !couvertes.has(t.id)).map((t) => ({ cle: t.id, porteur: t, tetes: [t] }))) {' },
  { nom: 'un echec verrouille comme un envoi', fichier: C, avant: "export const verrouille = (l: LigneDuJournal): boolean => !SE_RETENTE.has(l.statut ?? '') || retenuParOpale(l);", apres: 'export const verrouille = (l: LigneDuJournal): boolean => !!l;' },
  { nom: 'le jour meme prevu malgre les heures calmes', fichier: C, avant: '    if (calme && jourDeCotonou(partA) >= jour) continue;\n', apres: '' },
  { nom: 'une relance le dimanche', fichier: C, avant: '      jour = horsDuDimanche(jour);\n', apres: '' },
  { nom: 'la tournee de 10 h passee ignoree', fichier: C, avant: '      if (jour === aujourdhui && tourneePassee) jour = jourPlusR(aujourdhui, 1);\n', apres: '' },
  { nom: 'les relances hors service prevues', fichier: C, avant: '  if (!r || !r.enService) return [];', apres: '  if (!r) return [];' },
  { nom: 'Tap & Go eteint oublie', fichier: C, avant: 'return reglages?.mndPay?.actif === true && reglages?.mndPay?.tapgo?.actif !== false;', apres: 'return true;' },
  { nom: 'l arret ne se voit pas', fichier: C, avant: "  if (arret) return { ...m, etat: 'arrete',", apres: "  if (arret && false) return { ...m, etat: 'arrete'," },
  { nom: 'la pause ne se voit pas', fichier: C, avant: "  if (v?.verdict === 'en-pause') return { ...m, etat: 'en-pause', pause: m.modele };\n", apres: '' },
  { nom: 'l equipe voit le nom entier', fichier: C, avant: "  if (direction) return mots.join(' ');\n", apres: "  return mots.join(' ');\n" },
  { nom: 'Perle prevue deux fois', fichier: C, avant: '      if (vus.has(deja)) continue;\n', apres: '' },
  { nom: 'huit jours au lieu de sept', fichier: C, avant: 'export const JOURS_A_VENIR = 7;', apres: 'export const JOURS_A_VENIR = 8;' },
  { nom: 'remettre apres son heure', fichier: C, avant: "m.etat === 'arrete' && m.partA > maintenantMs;", apres: "m.etat === 'arrete';" },
  { nom: 'les remis comptes comme lus', fichier: C, avant: "if (m.etat === 'lu') lus += 1;", apres: "if (m.etat === 'lu' || m.etat === 'remis') lus += 1;" },
  { nom: 'le cerveau de Perle rejoue aujourd hui apres son passage', fichier: C, avant: "if (k === 0 && (o.passageFaitLe === aujourdhui || heureDeCotonou(o.maintenantMs) >= HEURE_DU_PASSAGE_A)) continue;", apres: 'if (false) continue;' },
  /* Le mot de 7 h */
  { nom: 'le mot du matin oublie la salle', fichier: CM, avant: '  const salle = entier(e.enSalle);', apres: '  const salle = 0;' },
  { nom: 'le mot du matin dit un nom', fichier: CM, avant: "const modeleSage = (m: unknown): string | null => (/^[a-z0-9_]{2,60}$/.test(String(m ?? '')) ? String(m) : null);", apres: "const modeleSage = (m: unknown): string | null => (String(m ?? '') || null);" },
  /* Le facteur */
  { nom: 'le facteur saute la porte d avance', fichier: EP, avant: 'const dAvance = laPorteDAvance(devant, avance);', apres: 'const dAvance = null as VerdictDAvance | null;' },
  { nom: 'une lecture en panne laisse partir', fichier: EP, avant: "    if (!avance) { await ecris({ statut: 'échec', detail: 'la porte d’Opale n’a pas pu lire les arrêts et les pauses' }); echecs++; continue; }\n", apres: '' },
  { nom: 'l arretee perd son colis', fichier: EP, avant: "{ ...retenue, colis: colisDepose, partA: l.data.partA } : retenue", apres: 'retenue : retenue' },
  { nom: 'Opale ne met jamais en pause', fichier: EP, avant: "if (typeof serie === 'number' && veilleDuModele(serie) === 'pause') {", apres: 'if (false) {' },
  { nom: 'la reprise de la direction oubliee', fichier: EP, avant: 'const depuis = Math.max(Date.now() - VEILLE_DES_NON_REMIS_MS, Number.isFinite(reprise) ? reprise : 0);', apres: 'const depuis = Date.now() - VEILLE_DES_NON_REMIS_MS;' },
  { nom: 'le facteur juge avant de relire le rendez-vous', fichier: EP, avant: '      const motif = pourquoiIlNePartPlus(repris ?? l.data, rdv, Date.now());', apres: '      const motif = null as string | null; void pourquoiIlNePartPlus;' },
  /* Les fonctions qui deposent */
  { nom: 'rappels-j1 ne lit plus l arret', fichier: RJ, avant: "? laPorteDAvance({ id: `env-${a.id}-whatsapp`, type: 'rappel-j1', apptId: a.id, colis: colisDuRappel }, avanceDuDepot) : null;", apres: '? null : null;' },
  { nom: 'rappels-j1 oublie le SMS', fichier: RJ, avant: "? laPorteDAvance({ id: `env-${a.id}-sms`, type: 'rappel-j1', apptId: a.id, colis: { genre: 'sms' } }, avanceDuDepot) : null;", apres: '? null : null;' },
  { nom: 'la confirmation envoie le modele a liens en pause', fichier: CF, avant: "const liensEnPause = dAvanceConf?.verdict === 'repli';", apres: 'const liensEnPause = false;' },
  { nom: 'la demande d avis ne lit plus l arret', fichier: AVI, avant: "const dAvance = laPorteDAvance({ id: `env-${p.id}-wa-avis`, type: 'avis-google', invoiceId: p.id, colis: colisDeLAvis }, avanceDuDepot);", apres: 'const dAvance = null;' },
  { nom: 'les relances ne lisent plus l arret', fichier: RF, avant: 'const dAvance = laPorteDAvance(aDeposer, avanceDuDepot);', apres: 'const dAvance = null;' },
  { nom: 'l echeance ne lit plus l arret', fichier: RE, avant: 'const dAvance = laPorteDAvance(aDeposer, avanceDuDepot);', apres: 'const dAvance = null;' },
  { nom: 'la fete ne lit plus l arret', fichier: FC, avant: 'const dAvance = laPorteDAvance(aDeposer, avanceDuDepot);', apres: 'const dAvance = null;' },
  { nom: 'les relances perdent la lecture', fichier: RF, avant: '  const avanceDuDepot = await litLesArretsEtLesPauses(sb);\n', apres: '  const avanceDuDepot = { arrets: [], pauses: [] };\n' },
  { nom: 'Perle depose sans la porte d avance', fichier: AM, avant: '.map((l) => retenueSiArretee(l))', apres: '.map((l) => l)' },
  /* La migration */
  { nom: 'tout le personnel arrete un message', fichier: SQL, avant: "create policy envois_arretes_ecrire on public.envois_arretes for insert to authenticated\n  with check (public.est_direction());", apres: "create policy envois_arretes_ecrire on public.envois_arretes for insert to authenticated\n  with check (public.is_staff());" },
  { nom: 'les pauses hors de la RLS', fichier: SQL, avant: 'alter table public.modeles_en_pause enable row level security;\n', apres: '' },
  { nom: 'un arret s efface', fichier: SQL, avant: 'revoke delete, truncate on public.envois_arretes from anon, authenticated;', apres: 'create policy envois_arretes_efface on public.envois_arretes for delete to authenticated using (true);' },
  /* Le Trone */
  { nom: 'l equipe arrete un message', fichier: AV, avant: "{direction && !arretee && m.etat !== 'en-pause' && (", apres: "{!arretee && m.etat !== 'en-pause' && (" },
  { nom: 'l onglet a venir disparait', fichier: EA, avant: "{onglet === 'a-venir' && <AVenir />}", apres: '' },
  { nom: 'l equipe met un modele en pause', fichier: MM, avant: '{direction ? (', apres: '{true ? (' },
  /* La fonction modeles-meta */
  { nom: 'le personnel reprend chez Meta', fichier: FM, avant: "if (qui !== 'direction' && qui !== 'service') return json({ erreur: 'la direction seule reprend un modèle', version: VERSION }, 403);", apres: "if (false) return json({ erreur: 'la direction seule reprend un modèle', version: VERSION }, 403);" },
  { nom: 'le jeton Meta rendu au Trone', fichier: FM, avant: 'return json({ version: VERSION, lusLe, modeles });', apres: 'return json({ version: VERSION, lusLe, modeles, jeton: WA_TOKEN });' },
  /* Les mots */
  { nom: 'un tiret long a l ecran', fichier: AV, avant: '>Rien de prévu.<', apres: '>Rien de prévu — vraiment.<' },
  /* La reprise du 8 novembre 2026 */
  { nom: 'les fiches d essai paraissent', fichier: C, avant: '    .filter((m) => !estUnMessageDEssai(m, e.essais))\n', apres: '' },
  { nom: 'le doute d Opale se tait', fichier: C, avant: 'return doute ? { ...m, aVerifier: doute } : m;', apres: 'return m;' },
  { nom: 'un genre inconnu fait planter la liste', fichier: C, avant: "  return GENRES_PREVUS[t] ?? { dit: TYPE_DIT[t] ?? (t || 'Message'), sorte: 'autre', raison: () => 'Déposé dans la salle d’attente.' };", apres: '  return GENRES_PREVUS[t];' },
  { nom: 'la salle ne montre que les WhatsApp', fichier: C, avant: "    const enSalle = ATTEND_ENCORE.has(String(l.statut ?? ''));", apres: "    const enSalle = ATTEND_ENCORE.has(String(l.statut ?? '')) && l.colis?.genre === 'whatsapp';" },
  { nom: 'le lot 4 oublie du registre', fichier: C, avant: "  'veille-attention': { dit: 'Rappel de la veille · l’attention'", apres: "  'veille-attention-x': { dit: 'Rappel de la veille · l’attention'" },
  { nom: 'le fil compte les essais par leur numero', fichier: C, avant: '  const numeros = new Set(fichesDEssai.map((f) => numeroWa(f.phone)).filter(Boolean));\n  return messages.filter((m): m is M => !!m && !(m.clientId && ids.has(m.clientId)) && !(m.numero && numeros.has(numeroWa(m.numero))));', apres: '  return messages.filter((m): m is M => !!m && !(m.clientId && ids.has(m.clientId)));' },
  { nom: 'le prenom d usage ignore', fichier: C, avant: 'appel: appelDe((fiche ?? null) as Parameters<typeof appelDe>[0], a.clientName)', apres: 'appel: `Mme ${prenomDeLaTete(fiche?.name ?? a.clientName)}`' },
  { nom: 'le filtre Autre toujours la', fichier: C, avant: ".filter(([k]) => k !== 'autre' || liste.some((m) => m.sorte === 'autre'));", apres: ';' },
  { nom: 'la prise lit les factures d essai', fichier: DN, avant: 'const [factures] = usePiecesDeLaMaison();', apres: 'const [factures] = useInvoices();' },
  { nom: 'Perle rejouee sans les essais (elle ne dirait plus ce que dit le serveur)', fichier: GD, avant: 'export function useEntreesDeLAssistant(): EntreesSansLeJour {\n  const { branch } = useBranch();\n  const appts = useBranchAppointmentsAvecEssais();', apres: 'export function useEntreesDeLAssistant(): EntreesSansLeJour {\n  const { branch } = useBranch();\n  const appts = useBranchAppointments();' },
  { nom: 'la brique revient', fichier: CSS, avant: '.trc-avenir__dit { grid-column: 2 / -1; font-size: 12.5px; color: var(--copper-700, #7C4C2C); margin: 0; }', apres: '.trc-avenir__dit { grid-column: 2 / -1; font-size: 12.5px; color: var(--color-brique, #96412E); margin: 0; }' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-ce-qui-va-partir-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-ce-qui-va-partir.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      plugins: panne ? [{
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
      define: { __PANNE__: JSON.stringify(panne ?? null) },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
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
