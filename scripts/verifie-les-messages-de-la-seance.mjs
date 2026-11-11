import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES MESSAGES DE LA SÉANCE, ÉPROUVÉS — 11 novembre 2026 (lots 4 et 5 de
   l'abonnement refait). `node scripts/verifie-les-messages-de-la-seance.mjs`.

   Le banc vit dans `verifie-les-messages-de-la-seance.harnais.ts` et tourne
   dans un processus fils. Il rejoue la règle pure, le vrai dépôt du Trône sur
   ses vrais magasins, et les VRAIES fonctions rappels-j1, envois-partent et
   whatsapp-webhook contre une base, un Meta, un Deno et une horloge simulés.

   `--prouve` : chaque faute ci-dessous ([nom, fichier(s), avant, après]) est
   posée DANS LA MÉMOIRE DU PAQUET (un greffon d'esbuild remplace le texte lu,
   et les fichiers que le banc lit en texte passent par la même faute), jamais
   dans le dépôt. Le banc doit crier à chacune. Une faute dont le texte ne se
   trouve pas exactement une fois dans chacun de ses fichiers fait échouer la
   preuve : elle ne prouverait rien. Une faute qui vise une règle recopiée la
   pose dans l'original ET dans ses copies, comme une règle fausse au dépôt le
   serait partout. Les empreintes des fichiers sont comparées avant et après.
   `--voir <n>` : la sortie du banc sous la faute n. */

const racine = path.resolve(import.meta.dirname, '..');
const HARNAIS = path.join(racine, 'scripts/verifie-les-messages-de-la-seance.harnais.ts');
const PUR = 'src/shared/messages-de-l-abonnee-pur.ts';
const DEPOT = 'src/shared/messages-de-l-abonnee.ts';
const RJ = 'supabase/functions/rappels-j1/index.ts';
const EP = 'supabase/functions/envois-partent/index.ts';
const WH = 'supabase/functions/whatsapp-webhook/index.ts';
const SQL = 'supabase/migrations/0198_la_prochaine_seance_posee_par_la_maison.sql';
const DOC = 'docs/modeles-whatsapp-abonnement.md';
const CONTENU = 'src/apps/revelateur/contenu.ts';
const FACONS = 'src/apps/revelateur/formules-du-site-pur.ts';
const GENERE = 'scripts/genere-revelateur.mjs';
const PARTIR = 'src/shared/ce-qui-va-partir-pur.ts';

/** [nom, fichier ou fichiers, avant, après] */
const PANNES = [
  /* ── la veille ── */
  ['la veille dit l attention a un rendez-vous pose sans confirmation', [PUR, RJ],
    "|| a.coverKind === 'forfait' || a.sansConfirmation === true) continue;", "|| a.coverKind === 'forfait') continue;"],
  ['un panier seulement propose suffit a la veille', [PUR, RJ],
    "if (!p || p.etat !== 'valide' || p.remiseLe) continue;", 'if (!p || p.remiseLe) continue;'],
  ['le rappel d un foyer dit l attention pour une seule tete', [PUR, RJ],
    'o.tetes.every((id) => o.attendues.has(id))', 'o.tetes.some((id) => o.attendues.has(id))'],
  ['sans secret, la veille choisit quand meme l attention', [PUR, RJ],
    'const avecAttention = !!o.modeleAttention && o.tetes.length > 0', 'const avecAttention = o.tetes.length > 0'],
  ['le rappel d hier ne voyage plus en repli', [PUR, RJ],
    '    repli: { modele: o.modeleDuRappel, composants: corps(), texteAuFil: phraseDeLaVeille(o.appel, o.heure) },\n', ''],
  ['l envoi direct de rappels-j1 dit l attention', RJ,
    "                name: WA_TEMPLATE,\n                language: { code: 'fr' },\n                components: [{\n                  type: 'body',",
    "                name: rappel.modele,\n                language: { code: 'fr' },\n                components: [{\n                  type: 'body',"],
  ['rappels-j1 ne lit plus les paniers', RJ, ".from('attention_paniers')", ".from('attention_paniers_absente')"],
  ['la ligne de la veille ne dit plus son genre', RJ,
    "        ditSonGenre();\n        consigne('whatsapp', a, 'en-attente'", "        consigne('whatsapp', a, 'en-attente'"],
  /* ── la place proposée ── */
  ['la proposition tombe un dimanche', PUR, '    if (j === 0) continue;\n', ''],
  ['ses jours ne comptent plus', PUR, '    if (sesJours.length > 0 && !sesJours.includes(j)) continue;\n', ''],
  ['un jour ferme se propose', PUR, '    if (o.estFerme(iso)) continue;\n', ''],
  ['hors du contrat ou sur une lune non reglee', PUR, '    if (!o.peutPorter(iso)) continue;\n', ''],
  ['une place avant demain', PUR, '  const depart = attendu > o.demain ? attendu : o.demain;', '  const depart = attendu;'],
  ['l heure d habitude oubliee', PUR, '    const time = placeLaPlusProche(o.placesLibres(iso), o.heure);', '    const time = placeLaPlusProche(o.placesLibres(iso), null);'],
  /* ── pourquoi pas de message ── */
  ['un rendez-vous suivant ne tait plus le message au depot', PUR, "  if (dejaUnSuivant(o.rdvs, o.seance)) return 'deja-un-suivant';\n", ''],
  ['une seance ancienne propose encore', PUR,
    "  if (!ISO.test(o.seance.date) || o.seance.date < jourPlus(o.jour, -1)) return 'seance-ancienne';\n", ''],
  ['le modele non approuve part quand meme', PUR, "  if (!o.modeleApprouve) return 'modele-non-approuve';\n", ''],
  ['STOP ne tait plus', PUR, "  if (o.stop) return 'stop';\n", ''],
  ['un forfait recoit le message', PUR, "  if (o.seance.coverKind === 'forfait') return 'un-forfait';\n", ''],
  ['le suivant compte un rendez-vous annule', [PUR, EP, WH],
    "a.clientId !== seance.clientId || a.status === 'annulé' || a.status === 'honoré') continue;", "a.clientId !== seance.clientId || a.status === 'honoré') continue;"],
  /* ── le dépôt du Trône ── */
  ['le second numero de la fiche est pris', DEPOT,
    'const numero = numeroWa(telDuRdv(seance, fiche));', 'const numero = numeroWa(telDuRdv(seance, fiche)) || numeroWa(fiche?.phone2);'],
  ['la ligne nomme la seance comme rendez-vous', PUR,
    'clientId: o.seance.clientId, seanceId: o.seance.id,', 'clientId: o.seance.clientId, apptId: o.seance.id, seanceId: o.seance.id,'],
  ['le depot oublie le facteur et ecrit quand meme', DEPOT,
    "    console.warn('[mnd-prochaine-seance] le facteur se tait : rien n’est déposé pour', seance.id);\n    return 'facteur-muet';\n",
    "    console.warn('[mnd-prochaine-seance] le facteur se tait : rien n’est déposé pour', seance.id);\n"],
  /* ── le départ ── */
  ['le facteur ne relit plus la suite', EP, '    if (l.data.type === TYPE_DE_LA_PROCHAINE_SEANCE) {', "    if (l.data.type === 'jamais') {"],
  ['le facteur ne relit plus la seance', EP,
    "  if (!seance || seance.status !== 'honoré' || !seance.date) return 'la séance n’est plus marquée faite';",
    "  if (!seance || !seance.date) return 'la séance n’est plus marquée faite';"],
  /* ── les boutons ── */
  ['un autre numero repond pour elle', WH, 'if (!numeroParti || numeroParti !== cleWa(e.numero)) {', 'if (!numeroParti) {'],
  ['Oui pose une seconde seance', WH, '    if (suivant) {\n', '    if (suivant && false) {\n'],
  ['la confirmation n est plus dite dans la conversation', WH, '      p_envoi: {', '      p_envoi_oublie: {'],
  ['Une autre date pose une seance', WH, "    if (b.geste === 'autre' || !proposition) {", '    if (!proposition) {'],
  ['la ligne de confirmation reste en cours', WH, '    await ditLaConfirmationDeLaSeance(sb, verdict.apptId, dit);\n', ''],
  ['une seconde reponse compte encore', WH, "    if (ligne.data.reponse) { dis('prochaine séance · déjà répondu'); continue; }\n", ''],
  /* ── la base ── */
  ['0198 ouverte aux sessions', SQL, 'from public, anon, authenticated;', 'from public, anon;'],
  ['0198 ne pose plus la ligne de confirmation', SQL, '    insert into public.envois (id, branch_id, data)', '    -- insert into public.envois (id, branch_id, data)'],
  ['0198 ne verifie plus la tete du contrat', SQL, "  if p_client_id <> coalesce(v_sub.data->>'clientId', '') then", '  if false then'],
  ['0198 pose sans le juge de la formule', SQL,
    '  v_raison := public.abo_peut_porter(v_sub.id, p_service_id, v_quand, v_jour, null);\n  if v_raison is not null then',
    '  v_raison := null;\n  if v_raison is not null then'],
  /* ── les mots ── */
  ['un tiret long dans une phrase de la cliente', [PUR, WH], '`Bien sûr, ${appel}. Dites-nous ici', '`Bien sûr — ${appel}. Dites-nous ici'],
  ['la veille dit « au salon »', [PUR, RJ], 'demain à ${heure} à la Maison MND. Une attention', 'demain à ${heure} au salon. Une attention'],
  ['la fiche Meta ne dit plus le corps du code', PUR,
    "corps: 'Merci, {{1}}. Votre prochaine séance : {{2}} ?',", "corps: 'Merci {{1}}, votre prochaine séance : {{2}} ?',"],
  ['le document des modeles perd le secret de la veille', DOC, '`WA_TEMPLATE_RAPPEL_ATTENTION = rappel_rdv_attention`', '`WA_TEMPLATE_RAPPEL = rappel_rdv_attention`'],
  /* ── la page du site ── */
  ['la page Abonnements dit un prix', CONTENU, "texte: 'Vos venues prises d’avance, la dernière offerte.'", "texte: 'Vos venues prises d’avance, dès 28 000 F.'"],
  ['une formule fermee sur la page', FACONS, '  for (const p of ouvertesALaVente(plans)) {', '  for (const p of plans) {'],
  ['Voir ma formule ne mene plus a Ma Couronne', CONTENU, "{ texte: 'Voir ma formule', vers: 'soeur:couronne' }", "{ texte: 'Voir ma formule', vers: '/reserver/' }"],
  ['le generateur laisse passer un chiffre', GENERE, '.filter((n) => !/\\d/.test(n))', ''],
  /* ── Ce qui va partir ── */
  ['A venir lit le type au lieu du genre', PARTIR, '  const t = genreDeLaLigne(l);', "  const t = String(l.type ?? '').trim();"],
];

const commeListe = (f) => (Array.isArray(f) ? f : [f]);
const lf = (s) => s.replace(/\r\n/g, '\n');

const greffon = (panne) => ({
  name: 'faux-et-pannes',
  setup(b) {
    b.onResolve({ filter: /^npm:/ }, (a) => ({ path: a.path, namespace: 'faux-npm' }));
    b.onLoad({ filter: /.*/, namespace: 'faux-npm' }, () => ({
      loader: 'js',
      contents: [
        'export const createClient = (...a) => globalThis.__faux.client(...a);',
        'export default { setVapidDetails: (...a) => globalThis.__faux.webpush.setVapidDetails(...a), sendNotification: (...a) => globalThis.__faux.webpush.sendNotification(...a) };',
      ].join('\n'),
    }));
    /* Le dépôt du Trône parle à un faux Supabase ; le reste du Trône garde le sien (absent : tout est local). */
    b.onResolve({ filter: /^\.\/supabase$/ }, (a) => (/messages-de-l-abonnee\.ts$/.test(a.importer) ? { path: 'supabase-du-trone', namespace: 'faux-trone' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'faux-trone' }, () => ({ loader: 'js', contents: 'export const supabase = globalThis.__fauxTrone;' }));
    b.onLoad({ filter: /\.(ts|tsx)$/ }, (a) => {
      if (/node_modules/.test(a.path)) return undefined;
      const rel = path.relative(racine, a.path).replace(/\\/g, '/');
      let src = lf(readFileSync(a.path, 'utf8'));
      if (panne && commeListe(panne[1]).includes(rel)) {
        if (src.split(panne[2]).length !== 2) throw new Error(`PANNE INTROUVABLE : ${panne[0]} dans ${rel}`);
        src = src.replace(panne[2], () => panne[3]);
      }
      return { contents: src, loader: a.path.endsWith('x') ? 'tsx' : 'ts' };
    });
  },
});

async function tourne(panne) {
  const dossier = path.join(racine, 'node_modules', '.cache', `verifie-les-messages-de-la-seance-${process.pid}`);
  mkdirSync(dossier, { recursive: true });
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    if (panne) {
      for (const f of commeListe(panne[1])) {
        const t = lf(readFileSync(path.join(racine, f), 'utf8'));
        if (t.split(panne[2]).length !== 2) return { code: 3, sortie: `PANNE INTROUVABLE : ${panne[0]} dans ${f}\n` };
      }
    }
    await build({
      entryPoints: [HARNAIS], bundle: true, format: 'esm', platform: 'node', target: 'es2022',
      outfile: sortie, logLevel: 'silent', plugins: [greffon(panne)], loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };
globalThis.__fauxTrone = { from: (...a) => globalThis.__baseDuTrone.from(...a), rpc: (...a) => globalThis.__baseDuTrone.rpc(...a) };`,
      },
    });
    const env = { ...process.env, BANC_PANNE: panne ? JSON.stringify({ fichiers: commeListe(panne[1]), avant: panne[2], apres: panne[3] }) : '' };
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', env, timeout: 180_000 });
    return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } catch (e) {
    return { code: 3, sortie: String(e?.message ?? e) };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');
const SURVEILLES = [...new Set([path.relative(racine, HARNAIS).replace(/\\/g, '/'), ...PANNES.flatMap((p) => commeListe(p[1]))])];
const empreintes = Object.fromEntries(SURVEILLES.map((f) => [f, md5(f)]));

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
  if (juste.code !== 0) { console.log('\nLe banc ne passe pas sur le code propre : la preuve ne se tente pas.'); process.exit(1); }
  let criees = 0;
  for (const panne of PANNES) {
    const r = await tourne(panne);
    const introuvable = /PANNE INTROUVABLE/.test(r.sortie);
    const criee = !introuvable && r.code !== 0 && /ECHEC/.test(r.sortie);
    if (criee) criees++;
    else process.exitCode = 1;
    console.log(`${criee ? 'CRIEE  ' : introuvable ? 'ABSENTE' : 'MUETTE '} ${panne[0]}${criee ? ` (${(r.sortie.match(/^ECHEC.*$/m) ?? [''])[0].slice(6, 90)})` : introuvable ? ` : ${r.sortie.trim().slice(0, 160)}` : ''}`);
  }
  console.log(`\n${criees} pannes criees sur ${PANNES.length}.`);
  const touches = Object.entries(empreintes).filter(([f, h]) => md5(f) !== h).map(([f]) => f);
  if (touches.length) { console.log(`L ARBRE A BOUGE : ${touches.join(', ')}`); process.exitCode = 1; }
  else console.log('Aucun fichier du depot n a bouge.');
}
