import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES RECUS DES CONVERSATIONS, EPROUVES - 6 novembre 2026 (sur le modele de verifie-qui-tient).
   « Je ne remarque jamais quand j'ai de nouveaux messages qui arrivent dans
   la conversation » (Yeman).
   `node scripts/verifie-recus.mjs` : le banc, dans un processus fils (le
   paquet s'ecrit sous node_modules/.cache et s'efface dans un finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune.
   `--prouve --seulement=perle,titre` : les seules fautes dont le nom porte
   l'un de ces mots. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const seulement = (process.argv.find((a) => a.startsWith('--seulement=')) ?? '').slice('--seulement='.length).split(',').filter(Boolean);

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-recus');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-recus.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/recus-pur.ts';
const MAGASIN = 'src/shared/conversations-lues.ts';
const ECRAN = 'src/apps/trone/routes/clients/LesConversations.tsx';
const SHELL = 'src/apps/trone/shell/Shell.tsx';
const PASTILLE = 'src/apps/trone/shell/PastilleDesRecus.tsx';
const CROCHET = 'src/apps/trone/shell/useRecus.ts';
const CSS = 'src/apps/trone/routes/clients/les-conversations.css';
/* [nom, fichier, chaine exacte, remplacement] : chaque panne doit faire crier le banc. */
const PANNES = [
  /* ── Le pur : ce qui est recu ── */
  ['la lecture oubliee', PUR, '  if (Number.isFinite(lu) && t <= lu) return null;\n', ''],
  ['la lecture comparee en texte', PUR, '  if (Number.isFinite(lu) && t <= lu) return null;\n', "  if (lues?.[b.cle] && dernier.quand <= (lues?.[b.cle] ?? '')) return null;\n"],
  ['une lecture illisible vaut lecture', PUR, '  if (Number.isFinite(lu) && t <= lu) return null;\n', '  if (!Number.isFinite(lu) ? !!lues?.[b.cle] : t <= lu) return null;\n'],
  ['Perle fait sortir des recus', PUR, "if (x.auteur === 'equipe' && q > derniereMain)", "if ((x.auteur === 'equipe' || x.auteur === 'assistant') && q > derniereMain)"],
  ['l automate fait sortir des recus', PUR, "if (x.auteur === 'equipe' && q > derniereMain)", "if ((x.auteur === 'equipe' || x.auteur === 'automate') && q > derniereMain)"],
  ['la main de l equipe ne fait plus sortir', PUR, '  if (derniereMain > t) return null;\n', ''],
  ['« Perle a repondu » jamais dit', PUR, '    if (VOIX_DE_PERLE.has(x.auteur) && q >= t) perle = true;\n', ''],
  ['« Perle a repondu » dit pour une reponse d avant', PUR, '    if (VOIX_DE_PERLE.has(x.auteur) && q >= t) perle = true;\n', '    if (VOIX_DE_PERLE.has(x.auteur)) perle = true;\n'],
  ['un modele passe pour Perle', PUR, "new Set<AuteurDeBulle>(['assistant', 'automate'])", "new Set<AuteurDeBulle>(['assistant', 'automate', 'modele'])"],
  ['un appel note compte comme un message', PUR, "new Set<SourceDeBulle>(['whatsapp', 'chat', 'vocal', 'demande', 'couronne'])", "new Set<SourceDeBulle>(['whatsapp', 'chat', 'vocal', 'demande', 'couronne', 'appel'])"],
  ['Ma Couronne oubliee', PUR, "'demande', 'couronne'])", "'demande'])"],
  ['le vocal oublie', PUR, "'chat', 'vocal', 'demande'", "'chat', 'demande'"],
  ['le chat du site oublie', PUR, "['whatsapp', 'chat', 'vocal',", "['whatsapp', 'vocal',"],
  ['le message de la Maison passe pour le sien', PUR, "x.auteur === 'elle' && SOURCES_RECUES.has(x.source)", 'SOURCES_RECUES.has(x.source)'],
  ['les demarcheurs recus', PUR, '  if (b.tri) return null;\n', ''],
  ['tout le passe recu au premier matin', PUR, '  if (!Number.isFinite(t) || t < DEBUT_MS) return null;', '  if (!Number.isFinite(t)) return null;'],
  ['le seuil a minuit UTC', PUR, "export const DEBUT_DES_RECUS = '2026-11-06T00:00:00+01:00';", "export const DEBUT_DES_RECUS = '2026-11-06T00:00:00Z';"],
  ['la plus ancienne en tete', PUR, '    .sort((x, y) => ms(y.quand) - ms(x.quand));', '    .sort((x, y) => ms(x.quand) - ms(y.quand));'],
  ['le nombre compte tout le fil', PUR, '  const borne = Math.max(Number.isFinite(lu) ? lu : Number.NEGATIVE_INFINITY, derniereMain, DEBUT_MS - 1);', '  const borne = Number.NEGATIVE_INFINITY;'],
  ['le nombre oublie la main de l equipe', PUR, ', derniereMain, DEBUT_MS - 1);', ', DEBUT_MS - 1);'],
  ['le nombre oublie la lecture', PUR, 'Math.max(Number.isFinite(lu) ? lu : Number.NEGATIVE_INFINITY, derniereMain', 'Math.max(derniereMain'],
  ['l ISO a lire prend la derniere bulle, meme de Perle', PUR, 'export const isoALire = (b: Pick<Boite, \'bulles\'>): string | undefined => dernierMessageDElle(b)?.quand;', "export const isoALire = (b: Pick<Boite, 'bulles'>): string | undefined => b.bulles[b.bulles.length - 1]?.quand;"],
  ['l adresse prend la fiche avant le numero', PUR, '  if (b.numero) return `n=${encodeURIComponent(b.numero)}`;\n  if (b.clientId)', '  if (b.clientId) return `c=${encodeURIComponent(b.clientId)}`;\n  if (b.numero) return `n=${encodeURIComponent(b.numero)}`;\n  if (b.clientId)'],
  /* ── Le pur : lu ── */
  ['« lu » reecrit une marque plus recente', PUR, '  return !Number.isFinite(deja) || deja < t;', '  return true;'],
  ['« lu » ecrit deux fois le meme instant', PUR, '  return !Number.isFinite(deja) || deja < t;', '  return !Number.isFinite(deja) || deja <= t;'],
  ['« lu » ecrit une ISO illisible', PUR, '  if (!Number.isFinite(t)) return false;\n  const deja', '  const deja'],
  /* ── Le pur : les mots ── */
  ['« hier » oublie', PUR, '  if (jour === jourDe(new Date(aujourdhui.getTime() - 86_400_000))) return `hier ${heure}`;\n', ''],
  ['l heure lue en UTC, pas a Cotonou', PUR, 'const COTONOU_MS = 3_600_000;', 'const COTONOU_MS = 0;'],
  ['les minutes perdent leur zero', PUR, "String(d.getUTCMinutes()).padStart(2, '0')", 'String(d.getUTCMinutes())'],
  ['le 1er du mois dit « 1 »', PUR, "${n === 1 ? '1er' : n}", '${n}'],
  ['l autre annee tait son annee', PUR, ' ? date : `${date} ${d.getUTCFullYear()}`;', ' ? date : date;'],
  ['le titre a zero garde « (0) »', PUR, '(n > 0 ? `(${n}) ${titreDeBase(base)}`', '(n >= 0 ? `(${n}) ${titreDeBase(base)}`'],
  ['le titre double sa parenthese', PUR, "titre.replace(/^\\(\\d+\\)\\s*/, '')", 'titre'],
  ['la pastille dit « 3 recu »', PUR, "${n > 1 ? 's' : ''}${h ?", '${h ?'],
  ['la pastille compte la plus ancienne', PUR, '  const h = heureRecueDite(recus[0].quand, maintenantMs);', '  const h = heureRecueDite(recus[recus.length - 1].quand, maintenantMs);'],
  /* ── Le magasin : le document partage ── */
  ['le document n est plus partage', MAGASIN, "bindDocument(conversationsLuesStore, 'mnd_conversations_lues');\n", ''],
  ['le magasin ecrit sans juger', MAGASIN, '  if (!aMarquer(conversationsLuesStore.get(), cle, iso) || !iso) return;\n', '  if (!iso) return;\n'],
  /* ── L ecran ── */
  ['« lu » marque dans un onglet cache', ECRAN, '    if (!cleOuverte || !sousLesYeux || !isoRecue || ouverteALaMain !== cleOuverte) return;', '    if (!cleOuverte || !isoRecue || ouverteALaMain !== cleOuverte) return;'],
  ['« lu » ne suit plus la bulle qui arrive boite ouverte', ECRAN, '  }, [cleOuverte, sousLesYeux, isoRecue, ouverteALaMain]);', '  }, [cleOuverte, sousLesYeux, ouverteALaMain]);'],
  /* Le premier matin (7 novembre 2026) : la premiere de la liste s ouvrait seule et se disait lue. */
  ['matin : la recue qui s ouvre seule se dit lue (le defaut du 7 novembre)', ECRAN, ' || !isoRecue || ouverteALaMain !== cleOuverte) return;', ' || !isoRecue) return;'],
  ['matin : l ouverture automatique passe pour une ouverture de la main', ECRAN, '    if (premiere) setOuverte(premiere.cle);', '    if (premiere) { setOuverte(premiere.cle); setOuverteALaMain(premiere.cle); }'],
  ['matin : un lien reste dans l adresse se dit lu au rechargement', ECRAN, '  useEffect(() => {\n    if (!cleDemandee) return;\n    setOuverte(cleDemandee);\n', '  useEffect(() => {\n    if (!cleDemandee) return;\n    setOuverte(cleDemandee);\n    setOuverteALaMain(cleDemandee);\n'],
  ['matin : le clic sur la ligne ne fait plus lu', ECRAN, '    setOuverteALaMain(b?.cle ?? null);\n', ''],
  ['matin : un geste dans la conversation ne vaut plus ouverture', ECRAN, '        onPointerDownCapture={() => setOuverteALaMain(b.cle)}\n', ''],
  ['matin : « ouvre=1 » reste dans l adresse', ECRAN, "    suivants.delete('ouvre');\n", ''],
  ['matin : la pastille n ouvre plus de la main', PASTILLE, ' : \'\'}&ouvre=1`)}', " : ''}`)}"],
  ['les recus ne sont plus en tete d A traiter', ECRAN, 'return [...tete, ...aTraiter.salle, ...aTraiter.tenues, ...aTraiter.mercis];', 'return [...aTraiter.salle, ...aTraiter.tenues, ...aTraiter.mercis];'],
  ['Toutes sans ses recus', ECRAN, " || (onglet === 'toutes' && filtre === 'tout'));", ');'],
  ['la rangee des recus disparait de Toutes', ECRAN, "                  {/* « Toutes » : les reçus en tête, puis le reste, sans les redire. */}\n                  {rangeeDesRecus()}\n", ''],
  ['le nom recu n est plus en gras', CSS, '.trc-bx__ligne.est-recue .trc-bx__haut b { font-weight: 700; }', '.trc-bx__ligne.est-recue .trc-bx__haut b { font-weight: 500; }'],
  ['la pastille du nombre passe au vert', CSS, '  background: var(--color-copper); color: #FFFFFF; border-radius: 10px;\n  font: 600 11px/1', '  background: var(--am-vert); color: #FFFFFF; border-radius: 10px;\n  font: 600 11px/1'],
  ['« Perle a repondu » ne se dit plus', ECRAN, "                  {recu.perleARepondu && <span className=\"trc-bx__pastille trc-bx__badge--cuivre\">Perle a répondu</span>}\n", ''],
  /* ── Le Shell, la pastille, le compte ── */
  ['la barre ne compte plus', SHELL, "      {it.path === '/gerard' && nbRecus > 0 && (", "      {false && nbRecus > 0 && ("],
  ['le titre de l onglet ne bouge plus', SHELL, '  useEffect(() => { document.title = titreDeLOnglet(titreDuTrone, nbRecus); }, [titreDuTrone, nbRecus]);\n', ''],
  ['la pastille du haut n est plus montee', SHELL, "{peutVoir(role, '/gerard', mesDomaines) && <PastilleDesRecus recus={recus} />}", '{null}'],
  ['la feuille de la pastille ronde n est plus chargee', SHELL, "import './shell.css';\n", ''],
  ['la pastille sonne une seconde fois', PASTILLE, '  const premiere = plusRecente(recus);\n', '  const premiere = plusRecente(recus);\n  if (premiere) sonne();\n'],
  ['la pastille mene a l ecran sans la conversation', PASTILLE, "navigate(`/gerard?vue=conversations${premiere.adresse ? `&${premiere.adresse}` : ''}&ouvre=1`)", "navigate('/gerard?vue=conversations&ouvre=1')"],
  ['le Shell compte aussi les tiroirs de la direction', CROCHET, "tiroirs: ['clientes'],", ''],
];

const aProuver = PANNES.filter((x) => seulement.length === 0 || seulement.some((mot) => x[0].includes(mot)));
const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

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
    for (const [nom, fichier, a, b] of aProuver) {
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, () => b);
      writeFileSync(path.join(racine, fichier), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = await lanceLeBanc();
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, fichier), gardes[fichier]);
      }
    }
  } finally {
    for (const f of fichiers) writeFileSync(path.join(racine, f), gardes[f]);
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${aProuver.length} fautes${seulement.length ? ` (les seules « ${seulement.join(', ')} », ${PANNES.length} en tout)` : ''}, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exitCode = muettes === 0 && intacts ? 0 : 1;
}
