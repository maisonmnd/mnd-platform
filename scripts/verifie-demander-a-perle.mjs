import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* DEMANDER A PERLE, EPROUVE - 21 novembre 2026 (sur le modele de verifie-le-rendez-vous-suggere).
   `node scripts/verifie-demander-a-perle.mjs` : le banc, dans un processus
   fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. Le banc tourne a l'heure de Chine, comme l'ordinateur
   du bureau : rien de Perle ne doit suivre l'heure du poste. */

process.env.TZ = 'Asia/Shanghai';

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  /* UN DOSSIER PAR LANCEMENT (21 novembre 2026) : `node_modules` est une jonction
     commune a toutes les copies du depot ; deux bancs lances en meme temps dans
     deux copies ecrivaient le meme paquet, et l un executait la panne de l autre. */
  const dossier = path.join(racine, 'node_modules', '.cache', `verifie-demander-a-perle-${process.pid}`);
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-demander-a-perle.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
      loader: { '.css': 'empty', '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.webp': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, location: { href: '', hash: '' }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
globalThis.document = { body: { dataset: {} }, documentElement: { dataset: {}, style: {} }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/perle-pur.ts';
const ECRAN = 'src/apps/trone/routes/pilotage/DemanderAPerle.tsx';
const DONNEES = 'src/apps/trone/routes/pilotage/perle-donnees.ts';
const ROUTES = 'src/apps/trone/routes/index.tsx';
const PANNES = [
  ['le plan garde une lecture inconnue', PUR, '    if (!NOMS_DES_LECTURES.includes(l.nom as NomDeLecture)) continue;\n', ''],
  ['le plan depasse quatre lectures', PUR, '    if (lectures.length >= LECTURES_MAX) break;\n', ''],
  ['le plan garde les doublons', PUR, '    if (vues.has(cle)) continue;\n', ''],
  ['une reponse d avance survit aux lectures', PUR, "  if (lectures.length) return { reponse: '', lectures, internet: '', message: null, avis: null };", "  if (lectures.length) return { reponse, lectures, internet: '', message: null, avis: null };"],
  /* Internet (21 novembre 2026). */
  ['une question qui a ses lectures part aussi sur internet', PUR, "  if (lectures.length) return { reponse: '', lectures, internet: '', message: null, avis: null };", "  if (lectures.length) return { reponse: '', lectures, internet: typeof d.internet === 'string' ? d.internet : '', message: null, avis: null };"],
  ['internet garde la reponse d avance', PUR, "  return internet ? { reponse: '', lectures: [], internet, message: null, avis: null }", '  return internet ? { reponse, lectures: [], internet, message: null, avis: null }'],
  ['le plan propose internet sans la fonction', PUR, "    o.internet\n      ? 'Une question qui porte sur le monde hors de la Maison", "    true\n      ? 'Une question qui porte sur le monde hors de la Maison"],
  /* Preparer une reponse (second lot, 21 novembre 2026). */
  ['un objet vide detourne une question', PUR, '  if (!cliente && !plusAncienne) return null;\n', ''],
  ['les lectures passent devant la reponse a preparer', PUR, "  if (message) return { reponse: '', lectures: [], internet: '', message, avis: null };\n", ''],
  ['la regle des messages disparait du plan', PUR, '  if (o.messages) consignes.push(REGLE_DES_MESSAGES);\n', ''],
  ['une heure sans son jour se garde', PUR, '  if (jour && h) { propre.jour = jour;', '  if (h) { propre.jour = jour;'],
  ['une place prise se dit libre', PUR, '  return libres.has(o.heure)\n', '  return true\n'],
  ['une place passee se propose', PUR, '  if (o.jour < o.aujourdhui || (o.jour === o.aujourdhui && h * 60 + min <= o.maintenantMin)) {', '  if (false) {'],
  ['un jour ferme se propose', PUR, "  if (o.ferme) return { ...base, etat: 'fermee'", "  if (false) return { ...base, etat: 'fermee'"],
  ['un fil prive part chez Claude', PUR, '  const ouvert = (f: F): boolean => filOuvertAClaude(f);', '  const ouvert = (_f: F): boolean => true;'],
  ['entre deux clientes, Perle choisit seule', PUR, "  if (avecFil.length > 1) return { etat: 'plusieurs', clientes: avecFil.map((x) => x.c.etiquette) };\n", ''],
  ['la suivante reprend une conversation deja preparee', PUR, 'const suivante = o.enAttente.find((f) => ouvert(f) && !faits.has(f.numero));', 'const suivante = o.enAttente.find((f) => ouvert(f));'],
  ['une autre cliente citee dans la consigne devient destinataire', PUR, '  return communes.length ? communes : parLeNom.length ? parLeNom : parLaQuestion;', '  return [...parLeNom, ...parLaQuestion];'],
  ['la consigne de la direction ne dit plus qu elle relit', PUR, "    `LA DIRECTION, qui relira ce message et l’enverra elle-même, demande que la réponse dise ceci : « ${c} ».`,", '    `Dis ceci : « ${c} ».`,'],
  ['la consigne part avec les noms', ECRAN, 'const consigne = perle.pourClaude(o.demande.consigne);', 'const consigne = o.demande.consigne;'],
  ['le brouillon s ouvre sans la devise', ECRAN, 'cheminDeLaConversation(e.brouillon.numero, signeLeMessage(e.brouillon.texte))', 'cheminDeLaConversation(e.brouillon.numero, e.brouillon.texte)'],
  ['le brouillon ne passe plus par le juge des reponses', ECRAN, 'const texteDuBrouillon = lectureDeLaReponse(r2.data);', "const texteDuBrouillon = String((r2.data as { reponse?: unknown } | null)?.reponse ?? '');"],
  ['une fenetre fermee depense quand meme', ECRAN, '    if (!f.fenetre.ouverte) return dit(', '    if (false) return dit('],
  ['une place prise part dans le contexte', ECRAN, "verdict?.etat === 'libre' && verdict.jour > perle.jour", 'verdict && verdict.jour > perle.jour'],
  ['la reponse gardee porte le nom entier', ECRAN, 'const reponse = `J’ai préparé une réponse pour ${qui} :', 'const reponse = `J’ai préparé une réponse pour ${f.nom} :'],
  ['le plan ne sait plus preparer une reponse', ECRAN, 'demandeDuPlan({ ...contexte, internet, messages: true, avis: true })', 'demandeDuPlan({ ...contexte, internet, avis: true })'],
  ['le contexte de la reponse suit le jour du poste', DONNEES, 'contexteDe(f, { ...o, aujourdhui: jour })', 'contexteDe(f, o)'],
  ['les reperes de temps ne partent plus avec le fil', ECRAN, "          + reperesDeTemps({ dernierLe: momentDuSalon(Date.parse(dernier.quand)), maintenant: { jour: perle.jour, minutes: perle.minutes } })\n", ''],
  ['un moment passe peut s annoncer comme a venir', PUR, "    'Un rendez-vous dont le jour ou l’heure est déjà passé ne s’annonce jamais comme à venir : n’écris pour lui ni « nous vous attendons » ni « est maintenu ». Si son message parle d’un moment passé, réponds en tenant compte du temps écoulé.',\n", ''],
  ['un brouillon ecarte bloque la conversation', ECRAN, "e.brouillon && e.brouillon.etat !== 'ecarte' ? [e.brouillon.numero] : []", 'e.brouillon ? [e.brouillon.numero] : []'],
  ['Perle dit que rien n attend quand tout a son brouillon', PUR, "    return o.enAttente.some(ouvert) ? { etat: 'deja-preparees' } : { etat: 'rien-n-attend' };", "    return { etat: 'rien-n-attend' };"],
  /* Repondre a un avis Google (second lot, 21 novembre 2026). */
  ['un objet vide detourne une question vers les avis', PUR, '  return auteur || plusRecent ? { auteur, plusRecent } : null;', '  return { auteur, plusRecent };'],
  ['les lectures passent devant l avis a repondre', PUR, "  if (avis) return { reponse: '', lectures: [], internet: '', message: null, avis };\n", ''],
  ['la regle des avis disparait du plan', PUR, '  if (o.avis) consignes.push(REGLE_DES_AVIS);\n', ''],
  ['Perle repropose un avis deja montre', PUR, 'const suivant = o.avis.find((a) => attend(a) && !vus.has(a.cle));', 'const suivant = o.avis.find((a) => attend(a));'],
  ['Perle dit que rien n attend quand tous les avis sont deja montres', PUR, "    return o.avis.some(attend) ? { etat: 'deja-montres' } : { etat: 'rien-n-attend' };", "    return { etat: 'rien-n-attend' };"],
  ['entre deux avis de la meme personne, Perle choisit seule', PUR, "  if (enAttente.length > 1) return { etat: 'plusieurs', n: enAttente.length };\n", ''],
  ['un avis deja repondu passe devant celui qui attend', PUR, "return { etat: 'trouve', cle: (enAttente[0] ?? siens[0]).cle };", "return { etat: 'trouve', cle: siens[0].cle };"],
  ['En direct tait les reponses aux avis a relire', PUR, '  if (aRelire > 0) {', '  if (false) {'],
  ['un avis deja pret se repaie', ECRAN, "    if (a.etat === 'nouveau' || ancien) {", '    if (true) {'],
  ['une reponse retouchee se remplace depuis Perle', ECRAN, '{!publiee && !retouchee && (', '{!publiee && ('],
  ['la lecture des avis porte le nom entier', DONNEES, "${prenomDeLAuteur(a.auteur) || 'sans nom'} : ${pourClaude(mots, pleinsNoms)}", '${a.auteur} : ${mots}'],
  ['ce que Perle garde nomme l auteur de l avis en entier', ECRAN, 'pour l’avis ${deQui(prenom)} : elle se relit', 'pour l’avis ${deQui(a.auteur)} : elle se relit'],
  ['l elision tombe', PUR, "? `d’${nom.trim()}` : `de ${nom.trim()}`", '? `de ${nom.trim()}` : `de ${nom.trim()}`'],
  ['le plan ne sait plus repondre aux avis', ECRAN, 'internet, messages: true, avis: true })', 'internet, messages: true })'],
  ['la recherche n est plus marquee web', PUR, "    usage: 'texte',\n    web: true,\n", "    usage: 'texte',\n"],
  ['une cliente reste dans ce qui part sur internet', PUR, '(_m, avant: string) => `${avant}une cliente`', '(m: string) => m'],
  ['un lien qui n est pas une adresse web passe dans les sources', PUR, String.raw`!/^https?:\/\/[^\s<>"']+$/i.test(url) || `, ''],
  ['les sources se repetent', PUR, ' || vues.has(url) || vues.size >= 6) continue;', ' || vues.size >= 6) continue;'],
  ['la question part sur internet sans passer par pourInternet', ECRAN, 'question: perle.pourInternet(plan.internet)', 'question: plan.internet'],
  ['pourInternet garde les clientes', DONNEES, 'sansLesClientes(pourElle(texte), clients.map((c) => prenomDeLaFiche(c.name)))', 'pourElle(texte)'],
  ['l ecran propose internet sur une vieille fonction', ECRAN, 'setInternet(saitInternet(x));', 'setInternet(true);'],
  ['une source s ouvre en gardant la main sur le Trone', ECRAN, 'target="_blank" rel="noopener noreferrer"', 'target="_blank"'],
  ['une date mal formee passe', PUR, "(typeof v === 'string' && ISO_JOUR.test(v.trim()) && !Number.isNaN(Date.parse(`${v.trim()}T12:00:00Z`)) ? v.trim() : undefined);", "(typeof v === 'string' ? v.trim() : undefined);"],
  ['Perle peut envoyer et encaisser', PUR, "  'Tu lis et tu réponds, tu ne fais rien : tu n’envoies aucun message, tu ne poses ni ne déplaces aucun rendez-vous, tu ne déplaces jamais d’argent. Si on te demande d’agir, dis que tu ne le fais pas et nomme l’écran du Trône où la direction le fait.',\n", ''],
  ['Perle peut inventer un chiffre', PUR, "  'N’invente AUCUN chiffre ni aucun fait : tu n’utilises que les faits qu’on te donne. S’il en manque un, dis-le en une phrase, et dis dans quel écran du Trône le trouver.',\n", ''],
  ['la question part entiere', PUR, "{ role: 'user', content: o.question.trim().slice(0, 1200) }],\n    schema: SCHEMA_DU_PLAN,", "{ role: 'user', content: o.question }],\n    schema: SCHEMA_DU_PLAN,"],
  ['le fil d avant commence par Perle', PUR, "  while (gardes.length && gardes[0].role !== 'user') gardes.shift();\n", ''],
  ['les faits ne sont plus bornes', PUR, '    if (texte.length > part) {', '    if (false) {'],
  ['la coupe tombe au milieu d une ligne', PUR, "coupe.slice(0, Math.max(coupe.lastIndexOf('\\n'), 200))", 'coupe'],
  ['le tiret cadratin reste', PUR, ".replace(CADRATIN, ', ')", ''],
  ['une duree se lit comme une heure', PUR, "return m % 60 ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${h} heure${h > 1 ? 's' : ''}`;", "return m % 60 ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${h} h`;"],
  ['l apostrophe droite reste', PUR, ".replace(/(\\p{L})'(?=\\p{L})/gu, '$1’')", ''],
  ['la fenetre des rendez-vous n est plus bornee', PUR, '  return { du, au: au > borne ? borne : au };\n}\n\n/** LA FENÊTRE DES DÉPENSES', '  return { du, au };\n}\n\n/** LA FENÊTRE DES DÉPENSES'],
  ['le prenom seul designe une cliente dans la question', PUR, '    if (!vus) continue;\n', ''],
  ['une initiale retrouve n importe quel mot', PUR, 'mots.some((m, i) => i > 0 && m.startsWith(d))', 'true'],
  ['un rituel honore reste au fauteuil', PUR, "    .filter((r) => r.status === 'confirmé' && r.heureMin <= minutes", '    .filter((r) => r.heureMin <= minutes'],
  ['En direct tait ce qui reste a encaisser', PUR, '  if (f.aEncaisser.n > 0) {', '  if (false) {'],
  ['En direct propose des places un jour ferme', PUR, '  if (f.ferme) {', '  if (false) {'],
  ['la porte s ouvre a l equipe', ROUTES, "export const ROUTES_DIRECTION = ['/journal', '/pourboires', '/mtn', '/demander'];", "export const ROUTES_DIRECTION = ['/journal', '/pourboires', '/mtn'];"],
  ['la question part avec le nom complet', ECRAN, 'const pourElle = perle.pourClaude(q);', 'const pourElle = q;'],
  ['les tours d avant partent avec les noms', ECRAN, "{ role: 'user' as const, content: perle.pourClaude(e.question) },", "{ role: 'user' as const, content: e.question },"],
  ['l ecran oublie sa garde', ECRAN, "const direction = moi?.role === 'souverain' || moi?.role === 'gerant';", 'const direction = true;'],
  ['les fiches d essai entrent dans les faits', DONNEES, 'const [toutesLesFiches] = useClientsDeLaMaison();', 'const [toutesLesFiches] = useClients();'],
  ['un numero part dans les faits', DONNEES, 'texte: sansCoordonnees(texte)', 'texte'],
  ['Perle lit l heure du poste', DONNEES, 'useMemo(() => momentDuSalon(tick), [tick])', 'useMemo(() => ({ jour: todayISO(), minutes: new Date(tick).getHours() * 60 }), [tick])'],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

/* ECRIRE, EN INSISTANT - 21 novembre 2026. Le depot vit sous OneDrive : un
   fichier peut etre tenu une fraction de seconde. Une preuve s est arretee sur
   « UNKNOWN: unknown error, open », au moment de RENDRE le fichier, et la panne
   est restee dans le code. On reessaie donc pendant cinq secondes ; si la
   restauration echoue pour de bon, on le crie avec le remede. */
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const ecris = (f, contenu) => {
  let derniere;
  for (let i = 0; i < 25; i++) {
    try { writeFileSync(path.join(racine, f), contenu); return; } catch (e) { derniere = e; pause(200); }
  }
  throw derniere;
};

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); console.log(propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((p) => p[1]))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, fichier, a, b] of PANNES) {
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (texte.split(a).length !== 2) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, () => b);
      ecris(fichier, crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = await lanceLeBanc();
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        ecris(fichier, gardes[fichier]);
      }
    }
  } finally {
    for (const f of fichiers) {
      try { ecris(f, gardes[f]); } catch { console.log(`RESTAURATION RATEE de ${f} : la panne y est peut-etre restee. Remede : git checkout -- ${f}`); }
    }
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(`\n${PANNES.length - muettes}/${PANNES.length} pannes criees${intacts ? ', fichiers restaures a l identique' : ', FICHIERS ALTERES'}.`);
  process.exitCode = muettes || !intacts ? 1 : 0;
}
