import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES MODÈLES CHEZ META ET LA PLACE TENUE, ÉPROUVÉS - 18 novembre 2026.
   `node scripts/verifie-les-modeles-chez-meta.mjs` : le banc
   (verifie-les-modeles-chez-meta.harnais.ts), dans un processus fils. Il
   rejoue la regle pure, le vrai Trone qui note, la VRAIE fonction
   modeles-meta (esbuild remplace ses imports `npm:` par une base, un Meta et
   un Deno simules), chaque lecteur du document, 0236 dans PGlite
   (BANC_PGLITE=<dossier qui porte node_modules/@electric-sql/pglite>) et la
   vraie page /reserver/ ecrite par genere-revelateur. Rien ne touche la
   vraie base, aucun message ne part.

   `--prouve` (exige PGlite) : chaque faute est posee une a une dans le vrai
   fichier (dans l'original ET dans ses copies quand la regle est recopiee),
   copie gardee, restauration dans un finally, empreintes comparees ; le banc
   doit crier a chacune. Le site est reecrit propre a la fin. Les deux
   defauts du 18 novembre 2026 y reviennent : la page qui promet une place
   ferme, et l'ecriture qui efface l'autre forme du document. */

const racine = path.resolve(import.meta.dirname, '..');
const HARNAIS = path.join(racine, 'scripts/verifie-les-modeles-chez-meta.harnais.ts');

const fauxModules = {
  name: 'faux-du-banc',
  setup(b) {
    b.onResolve({ filter: /^(npm:|https:\/\/esm\.sh)/ }, (a) => ({ path: a.path, namespace: 'faux' }));
    b.onLoad({ filter: /.*/, namespace: 'faux' }, (a) => ({
      loader: 'js',
      contents: /supabase-js/.test(a.path)
        ? 'export const createClient = (...a) => globalThis.__faux.client(...a);'
        : 'export default {};',
    }));
  },
};

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', `verifie-les-modeles-chez-meta-${process.pid}`);
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [HARNAIS], bundle: true, format: 'esm', platform: 'node', target: 'es2022',
      outfile: sortie, logLevel: 'silent', plugins: [fauxModules], loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', timeout: 300_000 });
  } catch (e) {
    return { status: 3, stdout: '', stderr: String(e?.message ?? e) };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/modeles-meta-pur.ts';
const DS = 'supabase/functions/demande-submit/index.ts';
const FM = 'supabase/functions/modeles-meta/index.ts';
/** La regle recopiee : l'original et ses deux copies, ensemble. */
const REGLE = [PUR, DS, FM];
const MAGASIN = 'src/shared/modeles-meta.ts';
const SQL = 'supabase/migrations/0236_les_modeles_meta_gardent_leurs_deux_formes.sql';
const CONTENU = 'src/apps/revelateur/contenu.ts';
const GENERE = 'scripts/genere-revelateur.mjs';
const CSS = 'src/apps/revelateur/revelateur.css';
const ILOT = 'src/apps/revelateur/ilots/Reserver.tsx';
const PORTES = 'src/apps/revelateur/ilots/PortesDeLaConsultation.tsx';

/** [ce qui casse, le ou les fichiers, le texte juste, le texte faux] */
const PANNES = [
  /* ── 1. La page promet une place ferme ── */
  ['/reserver/ redit « C est reserve, a votre nom des l envoi »', CONTENU,
    "      ['Votre place est tenue', 'Deux heures, à votre nom.'],\n      ['Vous confirmez sur WhatsApp', 'Touchez « Je confirme » : sans réponse, la place se libère.'],",
    "      ['C’est réservé', \"Le créneau est à votre nom dès l'envoi : la Maison a vérifié qu'il était libre.\"],\n      ['La confirmation arrive sur WhatsApp', \"La Maison choisit qui s'occupe de vous.\"],"],
  ['la page ne suit plus la reponse : une seule suite', GENERE, "`${etapes(suite, 'ensuite__attente')}${etapes(f.suiteFerme, 'ensuite__ferme')}`", "`${etapes(suite, 'ensuite__attente')}`"],
  ['la suite ferme se montre avant l envoi', GENERE, "`${etapes(suite, 'ensuite__attente')}${etapes(f.suiteFerme, 'ensuite__ferme')}`", "`${etapes(f.suiteFerme, 'ensuite__attente')}${etapes(suite, 'ensuite__ferme')}`"],
  ['la feuille ne cache pas la suite ferme', CSS, '.ensuite .ensuite__ferme { display: none; }\n', ''],
  ['la feuille garde « Je confirme » sous une place ferme', CSS, 'body.est-ferme .ensuite .ensuite__attente { display: none; }\n', ''],
  ['l ilot ne dit jamais la place ferme', ILOT, "      document.body.classList.toggle('est-ferme', recu?.etat === 'confirme');\n", ''],
  ['l ilot dit ferme une place en attente', ILOT, "document.body.classList.toggle('est-ferme', recu?.etat === 'confirme');", "document.body.classList.toggle('est-ferme', !!recu);"],
  ['la bande de fin promet encore un diagnostic sans rendez-vous', GENERE, 'La Maison vous attend à Cotonou : un rendez-vous, ou simplement un mot.', 'La Maison vous attend à Cotonou : un diagnostic, un rendez-vous, ou simplement un mot.'],
  ['le billet de la consultation dit « C est reserve » a une place en attente', PORTES, " : recu.etat === 'en-attente' ? 'Place tenue' : 'C’est réservé'}</p>", " : 'C’est réservé'}</p>"],
  /* ── 2. Une écriture efface l'autre forme ── */
  ['une note remplace la liste (la regle)', REGLE, '    ...(lu.liste.length > 0 ? { modeles: lu.liste } : {}),\n', ''],
  ['une relecture efface les notes (la regle)', REGLE, '    notes: lu.notes,\n', ''],
  ['le registre d avant ne se lit plus', REGLE, '    notes: { ...notesLues(r.modeles), ...notesLues(r.notes) },', '    notes: notesLues(r.notes),'],
  ['les notes ne se lisent plus', REGLE, '    notes: { ...notesLues(r.modeles), ...notesLues(r.notes) },', '    notes: notesLues(r.modeles),'],
  ['une note plus recente que la liste ne compte pas', REGLE, '  if (!note) return deMeta;\n  const noteLe', '  if (note || !note) return deMeta;\n  const noteLe'],
  ['la liste ne compte plus (la note seule)', REGLE, "  if (!deMeta) return note?.etat ?? 'a-deposer';", "  if (deMeta || !deMeta) return note?.etat ?? 'a-deposer';"],
  ['le Trone note a l ancienne (le registre seul)', MAGASIN, 'modelesMetaStore.set((prev) => avecLaNote(prev, nom, etat, parQui, le));', 'modelesMetaStore.set((prev) => ({ modeles: { ...registreLu(prev).notes, [nom]: { etat, le, parQui } }, parQui, le }) as RegistreDesModelesMeta);'],
  ['la fonction ecrit la liste seule', FM, 'data: avecLaListe(avant?.data, modeles, lusLe, VERSION) }', 'data: { lusLe, modeles, version: VERSION } }'],
  ['la fonction ecrit par-dessus un document illisible', FM, "  if (illisible) console.error('modeles-meta: document illisible, la liste ne s’écrit pas', illisible.message);\n  else {", '  {'],
  ['la bascule de l attente relit la liste a la main', DS, "  return estApprouveChezMeta(data?.data, nom) ? nom : '';",
    "  const modeles = ((data?.data ?? null) as { modeles?: unknown } | null)?.modeles;\n  return Array.isArray(modeles) && (modeles as { nom?: unknown; etat?: unknown }[]).some((m) => m?.nom === nom && String(m?.etat ?? '').toUpperCase() === 'APPROVED') ? nom : '';"],
  ['la proposition du Trone relit la liste a la main', 'src/apps/trone/routes/vente/SonProchainRituel.tsx', "        setEtat(etatDuModeleMeta(lu, nom) === 'approuve');",
    "        const m = lu.liste.find((x) => x?.nom === nom);\n        setEtat(!!m && String(m.etat ?? '').toUpperCase() === 'APPROVED');"],
  ['les modeles Meta relisent la liste a la main', 'src/apps/trone/routes/clients/ModelesMeta.tsx', '        const garde = modelesMetaLus(doc?.data);', '        const garde = (doc?.data ?? null) as LectureMeta | null; void modelesMetaLus; if (garde && Array.isArray(garde.modeles)) {}'],
  ['un lecteur neuf, hors de la regle', 'src/shared/messages-de-l-abonnee.ts', "export const modeleProchaineSeanceApprouve = (): boolean =>", "export const CLE_DU_DOCUMENT = 'mnd_modeles_meta';\nexport const modeleProchaineSeanceApprouve = (): boolean =>"],
  /* ── La base (0236) ── */
  ['la base laisse le registre d avant remplacer les notes', SQL, "  if jsonb_typeof(neuf->'modeles') = 'object' then\n    neuf := (neuf - 'modeles')", "  if false then\n    neuf := (neuf - 'modeles')"],
  ['la base laisse une ecriture sans liste effacer la liste', SQL, "  if jsonb_typeof(ancien->'modeles') = 'array'\n     and (", "  if false\n     and ("],
  ['la base laisse une liste en retard passer', SQL, "\n          or coalesce(neuf->>'lusLe', '') collate \"C\" < coalesce(ancien->>'lusLe', '') collate \"C\") then", ') then'],
  ['la base laisse une relecture effacer les notes', SQL, "  if jsonb_typeof(neuf->'notes') is distinct from 'object'\n     or coalesce(neuf->>'lusLe', '') collate \"C\" > coalesce(ancien->>'lusLe', '') collate \"C\" then", '  if false then'],
  ['la base remet une note retiree', SQL, "  if jsonb_typeof(neuf->'notes') is distinct from 'object'\n     or coalesce(neuf->>'lusLe', '') collate \"C\" > coalesce(ancien->>'lusLe', '') collate \"C\" then", '  if true then'],
  ['la garde touche les autres documents', SQL, "  when (new.key = 'mnd_modeles_meta')\n", ''],
];

const fichiersDe = (x) => (Array.isArray(x) ? x : [x]);
const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');
const siteSurLeCodePropre = () => spawnSync(process.execPath, ['scripts/genere-revelateur.mjs'], { cwd: racine, encoding: 'utf8', env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } });

if (!process.argv.includes('--prouve')) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  if (!process.env.BANC_PGLITE) { console.log('--prouve exige PGlite : BANC_PGLITE=<dossier qui porte node_modules/@electric-sql/pglite>'); process.exit(1); }
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); console.log(propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.flatMap((p) => fichiersDe(p[1])))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, cibles, a, b] of PANNES) {
      let introuvable = '';
      for (const f of fichiersDe(cibles)) {
        const brut = gardes[f].toString('utf8');
        const crlf = brut.includes('\r\n');
        const texte = brut.replace(/\r\n/g, '\n');
        if (texte.split(a).length !== 2) { introuvable = f; break; }
        const casse = texte.replace(a, () => b);
        writeFileSync(path.join(racine, f), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      }
      try {
        if (introuvable) { console.log(`INTROUVABLE ${nom} (${introuvable})`); muettes++; continue; }
        const r = await lanceLeBanc();
        const premier = ((r.stdout ?? '').match(/^ECHEC.*$/m) ?? [''])[0].slice(6, 90);
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE   ${nom}${premier ? ` (${premier})` : r.stderr ? ` (${String(r.stderr).split('\n')[0].slice(0, 80)})` : ''}`);
      } finally {
        for (const f of fichiersDe(cibles)) writeFileSync(path.join(racine, f), gardes[f]);
      }
    }
  } finally {
    for (const f of fichiers) writeFileSync(path.join(racine, f), gardes[f]);
    siteSurLeCodePropre();
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(`\n${PANNES.length - muettes}/${PANNES.length} pannes criees${intacts ? ', fichiers restaures a l identique, site reecrit propre' : ', FICHIERS ALTERES'}.`);
  process.exitCode = muettes || !intacts ? 1 : 0;
}
