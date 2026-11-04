import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* UNE PIECE, UN SEUL WHATSAPP, EPROUVE — 1er novembre 2026.
   `node scripts/verifie-une-piece-un-message.mjs`

   La piece 0166 est partie deux fois le 31 octobre 2026 vers le meme
   numero, a 14 h 37 (le rituel honore) puis a 22 h 08 (l'encaissement d'un
   autre poste), avec le meme PDF. Le banc
   (`verifie-une-piece-un-message.harnais.ts`) tourne dans un PROCESSUS
   FILS ; son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). LA FAUTE NE S'ECRIT JAMAIS DANS LE DEPOT :
   elle est servie a esbuild au chargement du fichier, et au banc quand il lit
   une source ; l'empreinte md5 de chaque fichier est comparee avant et apres,
   dans un `finally`. Une faute dont le texte ne se trouve plus (exactement
   une fois) fait echouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const P = 'src/shared/une-piece-un-message-pur.ts';
const E = 'src/apps/trone/routes/vente/envoi-de-la-piece.ts';
const C = 'src/apps/trone/routes/vente/Caisse.tsx';
const A = 'src/apps/trone/routes/clients/actions.tsx';
const L = 'src/apps/trone/shell/useReglementsEnLigne.ts';
const R = 'src/shared/recu-whatsapp.ts';
const F = 'src/shared/facture-whatsapp.ts';
const W = 'src/shared/whatsapp.ts';
const M = 'supabase/migrations/0150_une_piece_un_message.sql';

const FAUTES = [
  /* #1 : la cle de renvoi garde les secondes : un double toucher enverrait deux fois. */
  { n: 1, fichier: P, avant: 'instantIso.slice(0, 16)', apres: 'instantIso' },
  /* #2 : decisionDEnvoi rend toujours envoie:true (la panne de la piece 0166). */
  { n: 2, fichier: P, avant: "  if (o.geste === 'renvoi') return { envoie: true, cle: CLE_DE_RENVOI(o.piece.id, o.instant) };\n  return { envoie: false, motif: `déjà ${ditLaPiecePartie(o.piece)}` };\n", apres: '  return { envoie: true, cle: CLE_DE_RENVOI(o.piece.id, o.instant) };\n' },
  /* #2 : le geste est regarde AVANT la marque : le bouton (toujours `renvoi`) sur une piece vierge prendrait
     la cle a la minute, jamais la cle de la piece, et un second poste repartirait sur une cle libre. */
  { n: 2, fichier: P, avant: "  if (!pieceDejaPartie(o.piece)) return { envoie: true, cle: CLE_DE_LA_PIECE(o.piece.id) };\n  if (o.geste === 'renvoi') return { envoie: true, cle: CLE_DE_RENVOI(o.piece.id, o.instant) };\n", apres: "  if (o.geste === 'renvoi') return { envoie: true, cle: CLE_DE_RENVOI(o.piece.id, o.instant) };\n  if (!pieceDejaPartie(o.piece)) return { envoie: true, cle: CLE_DE_LA_PIECE(o.piece.id) };\n" },
  /* #2 : enRouteAilleurs prend tout deja pour un papier chez elle, waId ou pas. */
  { n: 2, fichier: P, avant: '(r: { deja?: true; waId?: string }): boolean => !!r.deja && !r.waId;', apres: '(r: { deja?: true; waId?: string }): boolean => false;' },
  /* #3 : marqueLaPiecePartie ecrase la premiere marque. */
  { n: 3, fichier: P, avant: '  if (Number.isFinite(ancienne) && !(nouvelle < ancienne)) return p;\n', apres: '' },
  /* #4 : ditLaPiecePartie perd l'annee, ou parle en temps de Greenwich. */
  { n: 4, fichier: P, avant: "const jour = `${Number(lit('day'))} ${lit('month')} ${lit('year')}`;", apres: "const jour = `${Number(lit('day'))} ${lit('month')}`;" },
  { n: 4, fichier: P, avant: 'timeZone: fuseau,', apres: "timeZone: 'UTC'," },
  /* #5 : apresReglement n'appelle plus decisionDEnvoi ; aRegler non plus ; le recu part sans cle ;
     la marque du recu n'est plus posee ; la marque se pose meme sur un envoi garde hors ligne. */
  { n: 5, fichier: E, avant: "const decision = decisionDEnvoi({ piece, geste: 'auto', instant: new Date().toISOString() });", apres: 'const decision = { envoie: true as const, cle: `piece-${piece.id}` };' },
  { n: 5, fichier: E, avant: "const decision = decisionDEnvoi({ piece: avant, geste: o?.renvoi ? 'renvoi' : 'auto', instant: new Date().toISOString() });", apres: 'const decision = { envoie: true as const, cle: o?.renvoi ? `piece-${avant.id}-renvoi-${new Date().toISOString().slice(0, 16)}` : `piece-${avant.id}` };' },
  { n: 5, fichier: E, avant: 'parQui: quiEncaisse(), cleUnique: decision.cle,', apres: 'parQui: quiEncaisse(),' },
  { n: 5, fichier: E, avant: 'if (r.ok && !r.enAttente && !enRouteAilleurs(r)) noteLaPiecePartie(p.piece.id, infoDuDepart(r, MODELE_RECU));', apres: '' },
  { n: 5, fichier: E, avant: 'if (r.ok && !r.enAttente && !enRouteAilleurs(r)) noteLaPiecePartie(p.piece.id, infoDuDepart(r, MODELE_FACTURE));', apres: 'if (r.ok) noteLaPiecePartie(p.piece.id, infoDuDepart(r, MODELE_FACTURE));' },
  /* #5 : la marque se pose sur un deja sans waId (l autre poste attend Meta) ; « renvoyee » se dit sur une piece vierge. */
  { n: 5, fichier: E, avant: 'if (r.ok && !r.enAttente && !enRouteAilleurs(r)) noteLaPiecePartie(p.piece.id, infoDuDepart(r, MODELE_RECU));', apres: 'if (r.ok && !r.enAttente) noteLaPiecePartie(p.piece.id, infoDuDepart(r, MODELE_RECU));' },
  { n: 5, fichier: E, avant: 'dit(p.piece.number, r, !!o?.renvoi && pieceDejaPartie(avant));', apres: 'dit(p.piece.number, r, !!o?.renvoi);' },
  /* #6 : la Caisse n'envoie plus la cle, ou marque sur un deja sans waId ; le reglement en ligne ne marque plus
     la piece, ou la marque sur un deja sans waId. */
  { n: 6, fichier: C, avant: 'parQui: session?.user?.email ?? undefined, cleUnique: CLE_DE_LA_PIECE(inv.id),', apres: 'parQui: session?.user?.email ?? undefined,' },
  { n: 6, fichier: C, avant: 'if (r.ok && !r.enAttente && !enRouteAilleurs(r)) noteLaPiecePartie(inv.id,', apres: 'if (r.ok && !r.enAttente) noteLaPiecePartie(inv.id,' },
  { n: 6, fichier: L, avant: 'return partie ? marqueLaPiecePartie(q, partie) : q;', apres: 'return q;' },
  { n: 6, fichier: L, avant: 'const partie = r.enAttente || enRouteAilleurs(r) ? null : {', apres: 'const partie = r.enAttente ? null : {' },
  /* #7 : la cle reprend un suffixe d'etape (le recu, la facture a regler, le foyer). */
  { n: 7, fichier: R, avant: 'const cle = o.cleUnique ? { cleUnique: o.cleUnique } : {};', apres: 'const cle = o.cleUnique ? { cleUnique: `${o.cleUnique}-mot` } : {};' },
  { n: 7, fichier: F, avant: 'const cle = o.cle ? { cleUnique: o.cle } : {};', apres: 'const cle = o.cle ? { cleUnique: `facture-${o.cle}-mot` } : {};' },
  { n: 7, fichier: F, avant: 'const cle = { cleUnique: o.cle };\n  const mot = motDuFoyer(', apres: 'const cle = { cleUnique: `${o.cle}-mot` };\n  const mot = motDuFoyer(' },
  /* #8 : le SQL perd `is null` (il reecrirait les marques), ou perd updated_at (les postes ne reliraient pas). */
  { n: 8, fichier: M, avant: "   and i.data->'whatsapp' is null;", apres: ';' },
  { n: 8, fichier: M, avant: "'parQui', c.par_qui))),\n       updated_at = now()", apres: "'parQui', c.par_qui)))" },
  /* #8 : le plus RECENT message ferait foi ; les entrants compteraient ; un « en-route » avec waId (Meta l a
     pris, l accuse n est jamais revenu) ne marquerait plus ; les cles neuves ne seraient plus relues ; un
     numero porte par deux pieces marquerait les deux. */
  { n: 8, fichier: M, avant: 'order by piece_id, quand asc', apres: 'order by piece_id, quand desc' },
  { n: 8, fichier: M, avant: "m.data->>'sens' = 'sortant'", apres: "m.data->>'sens' = 'entrant'" },
  { n: 8, fichier: M, avant: "in ('remis', 'lu')\n          or (m.data->>'etat' = 'en-route' and coalesce(m.data->>'waId', '') <> ''))", apres: "in ('remis', 'lu'))" },
  { n: 8, fichier: M, avant: "\n          or s.cle = 'piece-' || i.id\n          or starts_with(s.cle, 'piece-' || i.id || '-renvoi-')", apres: '' },
  { n: 8, fichier: M, avant: "\n     and not exists (select 1 from public.invoices j\n                      where j.id <> i.id and j.data->>'number' = i.data->>'number')", apres: '' },
  /* #9 : whatsapp.ts perd deja (le type, puis la lecture de la reponse). */
  { n: 9, fichier: W, avant: 'enAttente?: true; deja?: true }', apres: 'enAttente?: true }' },
  { n: 9, fichier: W, avant: ', ...(d.deja ? { deja: true as const } : {}) };', apres: ' };' },
  /* #10 : « Terminer » le foyer renvoie une facture deja partie seule. */
  { n: 10, fichier: E, avant: 'const ouvertes = o?.renvoi ? aRegle : aRegle.filter((p) => !pieceDejaPartie(p));', apres: 'const ouvertes = aRegle;' },
  /* #11 : la fiche ne coupe plus le recu, la facture ou le foyer ; la case de l encaissement ne retient plus rien ; la Caisse ne suit plus la fiche. */
  { n: 11, fichier: E, avant: 'if (sansPapierPour(piece)) {', apres: 'if (false) {' },
  { n: 11, fichier: E, avant: 'if (!o?.renvoi && sansPapierPour(avant))', apres: 'if (false)' },
  { n: 11, fichier: E, avant: 'if (!o?.renvoi && destinataire.sansPapiersWa === true)', apres: 'if (false)' },
  { n: 11, fichier: A, avant: 'settleTotal + totalGamme > 0 && papierPart) {', apres: 'settleTotal + totalGamme > 0) {' },
  { n: 11, fichier: A, avant: 'onClick={() => termine(papierPart)}', apres: 'onClick={() => termine(true)}' },
  { n: 11, fichier: C, avant: 'client.sansPapiersWa !== true && ', apres: '' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const BANNIERE = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, location: { href: '', hash: '' }, setTimeout: () => 0 };
globalThis.document = { body: { dataset: {}, appendChild() {} }, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, remove() {} }), querySelectorAll: () => [] };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`;

async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-une-piece-un-message-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-une-piece-un-message.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      plugins: faute ? [{
        name: 'la-faute-remise',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = path.relative(racine, args.path).split(path.sep).join('/');
            if (rel !== faute.fichier) return undefined;
            const contents = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').split(faute.avant).join(faute.apres);
            return { contents, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) };
          });
        },
      }] : [],
      define: {
        'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }),
        __FAUTE__: JSON.stringify(faute ?? null),
      },
      banner: { js: BANNIERE },
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
    return { status: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (!prouve) {
  const r = await banc(null);
  process.stdout.write(r.sortie);
  process.exitCode = r.status ?? 1;
} else {
  let tiennent = 0;
  for (const f of FAUTES) {
    const texte = readFileSync(path.join(racine, f.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(f.avant).length - 1;
    const avant = md5(f.fichier);
    let verdict;
    try {
      if (fois !== 1) {
        verdict = `LA FAUTE NE SE POSE PLUS (${fois} occurrence(s) du texte)`;
      } else {
        const r = await banc(f);
        const ligne = r.sortie.split(/\r?\n/).find((l) => l.startsWith(`ECHEC #${f.n} `));
        verdict = r.status !== 0 && ligne ? `crie (${ligne.slice(0, 110)})` : `NE CRIE PAS (statut ${r.status})`;
      }
    } catch (e) {
      /* Une faute qui rend le fichier incompilable, un dossier refuse : la preuve le dit et continue
         sur les fautes suivantes, au lieu de mourir sur une trace de pile sans la ligne du total. */
      verdict = `LA MECANIQUE A CASSE (${String(e).replace(/\s+/g, ' ').slice(0, 100)})`;
    } finally {
      if (md5(f.fichier) !== avant) verdict = `LE FICHIER A CHANGE PENDANT LA PREUVE (${verdict})`;
    }
    const ok = verdict.startsWith('crie');
    if (ok) tiennent++;
    console.log(`${ok ? 'OK   ' : 'ECHEC'} faute #${f.n} ${f.avant.slice(0, 60).replace(/[^\x20-\x7e]/g, '?')} : ${verdict}`);
  }
  console.log(`${tiennent}/${FAUTES.length} fautes font crier le banc.`);
  if (tiennent !== FAUTES.length) process.exitCode = 1;
}
