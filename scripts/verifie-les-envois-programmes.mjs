import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES ENVOIS PROGRAMMÉS, ÉPROUVÉS : `node scripts/verifie-les-envois-programmes.mjs`
   (et `--prouve` pour planter les fautes une à une, `--voir <n>` pour lire
   la sortie sous la faute n).

   13 novembre 2026, maquette validée (« construis »). Le harnais
   (verifie-les-envois-programmes.harnais.ts) éprouve la règle pure
   (`src/shared/envois-programmes-pur.ts`), puis fait tourner le VRAI facteur
   (`supabase/functions/envois-partent`) contre une base, un Meta, un
   push-notify et une horloge simulés : la fenêtre ouverte (le texte), fermée
   (le modèle d'ouverture, puis le message à sa réponse), le message privé
   (la consigne à Opale), la nuit (l'heure exacte), « me demander avant »,
   par l'app, la fois suivante posée une fois, une seule fois par message,
   plusieurs clientes, la pièce du Trône tirée à l'envoi, les appels
   convertis sans perte ni doublon. Il lit aussi les écrans (le menu Créer,
   le partage, la file). Chaque faute se plante EN MÉMOIRE au chargement :
   l'arbre n'est jamais touché. Une faute dans la règle pure se plante aussi
   dans sa copie du facteur, comme le ferait la copie. Tout est inventé. */

const racine = path.resolve(import.meta.dirname, '..');
const HARNAIS = path.join(racine, 'scripts/verifie-les-envois-programmes.harnais.ts');
const PUR = 'src/shared/envois-programmes-pur.ts';
const EP = 'supabase/functions/envois-partent/index.ts';
const SALLE = 'src/shared/salle-des-envois.ts';

/** [ce qui casse, le fichier, le texte juste, le texte faux] */
export const PANNES = [
  /* La règle */
  ['la fenetre ouverte ne compte plus', PUR, "  if (f.fenetreOuverte) return { voie: 'texte' };\n", ''],
  ['nos propres messages ouvrent la fenetre', PUR, "  !!m && m.sens === 'entrant' && m.canal !== 'site';", "  !!m && m.canal !== 'site';"],
  ['une demande du site ouvre la fenetre', PUR, "  !!m && m.sens === 'entrant' && m.canal !== 'site';", "  !!m && m.sens === 'entrant';"],
  ['me demander avant ne retient plus', PUR, "  if (c.demander === true && !l.ouiLe) return { voie: 'demander' };\n", ''],
  ['par l app part seul', PUR, "  if (c.mode === 'app') return { voie: 'app' };\n", ''],
  ['le prive ne passe plus par Opale', PUR, "  if (c.prive === true) return f.opaleEveillee ? { voie: 'opale' } : { voie: 'revoir', motif: MOTIF_OPALE_ENDORMIE };\n", ''],
  ['Opale toujours eveillee', PUR, '  if (!a || !a.empreinte) return false;', '  return true;'],
  ['deux modeles d ouverture au meme numero', PUR, "  if (f.porteOuverteDe) return { voie: 'rejoint', de: f.porteOuverteDe };\n", ''],
  ['le modele pas approuve part quand meme', PUR, "  if (!f.modeleDOuverture) return { voie: 'revoir', motif: MOTIF_MODELE_PAS_APPROUVE };\n", ''],
  ['la piece du Trone part sans etre tiree', PUR, "  if (pieceATirer(c.piece)) return { voie: 'tirer' };\n", ''],
  ['STOP oublie', PUR, '  if (o.fiche?.nouvelles && o.fiche.nouvelles.oui === false && o.fiche.nouvelles.par === \'stop\') return MOTIF_STOP;\n', ''],
  ['le rendez-vous deplace part quand meme', PUR, "    if ((r.date ?? '') !== (l.dateRdv ?? '') || (r.time ?? '') !== (l.heure ?? '')) return 'le rendez-vous dont parle le message a été déplacé';\n", ''],
  ['la fiche relue ne prime plus sur le numero programme', PUR, '  numeroDuProgramme(fiche?.phone) || numeroDuProgramme(fiche?.phone2) || numeroDuProgramme(l.colis?.numero);', '  numeroDuProgramme(l.colis?.numero);'],
  ['le mois glisse au 28', PUR, '      ms = Date.UTC(y, m, Math.min(D, joursDuMois(y, m)), h, mi);', '      ms = Date.UTC(y, m, Math.min(D, 28), h, mi);'],
  ['la fois suivante sans identifiant fixe', PUR, '    id: `${l.serieId}-${l.occurrence + 1}`, type: TYPE_PROGRAMME,', '    id: `${l.serieId}-${l.occurrence + 1}-${maintenantMs}`, type: TYPE_PROGRAMME,'],
  ['la legende depasse 1 024 signes', PUR, "  const legende = media.famille !== 'audio' && t.length > 0 && t.length <= 1024;", "  const legende = media.famille !== 'audio' && t.length > 0;"],
  ['la consigne depasse mille signes', PUR, '  return t.length <= 1000 ? t : null;', '  return t;'],
  ['un appel converti deux fois', PUR, '    if (o.dejaLa(id)) { marques.push({ appelId: a.id, envoiId: id }); continue; }\n', ''],
  ['un appel sans numero se perd en silence', PUR, '    if (!numero) { sansNumero.push(a.id); continue; }', '    if (!numero) continue;'],
  ['un ancien appel part sans oui', PUR, '      id, type: TYPE_PROGRAMME, canal: \'whatsapp\', statut: A_VALIDER, branchId: a.branchId,', '      id, type: TYPE_PROGRAMME, canal: \'whatsapp\', statut: \'en-attente\', branchId: a.branchId,'],
  ['plusieurs clientes : le prenom de la premiere pour toutes', PUR, '    const texte = signe(texteDeLaCliente(p.texte, { prenom: d.prenom, motif: p.motif, rendezVous: rdv?.dit }));', '    const texte = signe(texteDeLaCliente(p.texte, { prenom: destinataires[0].prenom, motif: p.motif, rendezVous: rdv?.dit }));'],
  ['le oui part avant son heure', PUR, '  const part = Math.max(Number.isFinite(prevu) ? prevu : maintenantMs, maintenantMs);', '  const part = maintenantMs;'],
  /* Le facteur */
  ['la nuit retient l envoi programme', EP, " && (!calme || l.data.parLaMain === true || l.data.type === TYPE_PROGRAMME))", ' && (!calme || l.data.parLaMain === true))'],
  ['la prise en main sans condition', EP, ".update({ data: { ...l.data, prisLe: maintenant, statut: 'en-envoi' } })\n      .eq('id', l.id).eq('data->>statut', 'en-attente').select('id');", ".update({ data: { ...l.data, prisLe: maintenant, statut: 'en-envoi' } })\n      .eq('id', l.id).select('id');"],
  ['la cle du message ignoree', EP, "  if ('deja' in cle) {\n    await ecrisLeProgramme(c.sb, row.id, { ...l, statut: 'envoyé', detail: 'déjà parti : la clé du message est au fil',", "  if (false && 'deja' in cle) {\n    await ecrisLeProgramme(c.sb, row.id, { ...l, statut: 'envoyé', detail: 'déjà parti : la clé du message est au fil',"],
  ['le message part sans sa reponse', EP, '    if (aReponduDepuis(fil, l.porteLe)) {', '    if (true) {'],
  ['sept jours sans reponse : jamais a revoir', EP, '    if (Number.isFinite(porte) && maintenantMs - porte > ATTENTE_DE_LA_REPONSE_MS) {', '    if (false) {'],
  ['la consigne va a Perle', EP, "de_user_id: l.auteurUserId, pour: 'opale',", "de_user_id: l.auteurUserId, pour: 'perle',"],
  ['la reponse d Opale ignoree', EP, "      if (k.statut === 'faite') {", "      if (k.statut === 'jamais') {"],
  ['l echec se dit deux fois', EP, '  const deja = !!l.prevenuLe;', '  const deja = false;'],
  ['l annonce sonne pour l envoi par l app', EP, '&& partSeul(l) && Number.isFinite(partAde(l))', '&& Number.isFinite(partAde(l))'],
  ['la fois suivante oubliee', EP, '  const suivanteId = await laSuiteDuProgramme(c, row, l);\n', '  const suivanteId = undefined;\n'],
  ['la piece ne part pas chez Meta', EP, '    const m = await laPieceChezMeta(c.sb, colis.piece, c.token, c.phoneId);', "    const m = { refus: 'oubliee' } as { refus: string };"],
  ['le modele d ouverture sans la porte', EP, '  const vp = laPorte(devant, faits);', "  const vp = { verdict: 'passe' } as ReturnType<typeof laPorte>;"],
  ['l automate parle encore apres l envoi', EP, "  try { await c.sb.rpc('pause_le_fil', { p_numero: numero, p_par: colis.parQui, p_motif: 'envoi-programme' }); } catch { /* sans 0125, rien */ }", ''],
  ['l arret de la direction ignore', EP, "  if (arret && arret.verdict === 'arrete') {", '  if (false) {'],
  /* La salle */
  ['le relache oublie l heure programmee', SALLE, '  if (Number.isFinite(prevu)) {', '  if (false) {'],
];

const fauxModules = (panne) => ({
  name: 'faux-du-banc',
  setup(b) {
    b.onResolve({ filter: /^npm:/ }, (a) => ({ path: a.path, namespace: 'faux' }));
    b.onLoad({ filter: /.*/, namespace: 'faux' }, (a) => ({
      loader: 'js',
      contents: a.path.startsWith('npm:@supabase/supabase-js')
        ? 'export const createClient = (...a) => globalThis.__faux.client(...a);'
        : 'export default {};',
    }));
    b.onLoad({ filter: /(envois-programmes-pur|salle-des-envois)\.ts$|supabase[\\/]functions[\\/]envois-partent[\\/]index\.ts$/ }, (a) => {
      const rel = path.relative(racine, a.path).replace(/\\/g, '/');
      let src = readFileSync(a.path, 'utf8').replace(/\r\n/g, '\n');
      /* Une faute de la règle vit aussi dans la copie du facteur. */
      if (panne && (panne[1] === rel || (panne[1] === PUR && rel === EP))) {
        if (src.split(panne[2]).length !== 2) {
          if (rel === panne[1]) throw new Error(`PANNE INTROUVABLE : ${panne[0]}`);
        } else src = src.replace(panne[2], panne[3]);
      }
      return { contents: src, loader: 'ts' };
    });
  },
});

const BANNIERE = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, location: { href: '', origin: 'http://banc.local', pathname: '/' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`;

async function tourne(panne) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-envois-programmes-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [HARNAIS], bundle: true, format: 'esm', platform: 'node', target: 'es2022',
      outfile: sortie, logLevel: 'silent', plugins: [fauxModules(panne)], loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: { js: BANNIERE },
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } catch (e) {
    return { code: 3, sortie: String(e?.message ?? e) };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const voir = process.argv.indexOf('--voir');
if (voir > 0) {
  const r = await tourne(PANNES[Number(process.argv[voir + 1]) - 1] ?? null);
  process.stdout.write(r.sortie);
  process.exit(0);
}

const juste = await tourne(null);
process.stdout.write(juste.sortie);
if (juste.code !== 0) process.exitCode = 1;

if (process.argv.includes('--prouve')) {
  let criees = 0;
  for (const panne of PANNES) {
    const r = await tourne(panne);
    const introuvable = /PANNE INTROUVABLE/.test(r.sortie);
    const criee = !introuvable && r.code !== 0 && /ECHEC/.test(r.sortie);
    if (criee) criees++;
    else process.exitCode = 1;
    console.log(`${criee ? 'CRIEE ' : introuvable ? 'ABSENTE' : 'MUETTE'} ${panne[0]}${criee ? ` (${(r.sortie.match(/^ECHEC.*$/m) ?? [''])[0].slice(6, 90)})` : ''}`);
  }
  console.log(`\n${criees} fautes criees sur ${PANNES.length}.`);
}
