import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES PLACES LIMITEES, DE LA BASE AU SITE, EPROUVEES (4 novembre 2026).
   `node scripts/verifie-les-places-au-site.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier. Les pannes vivent EN MEMOIRE : un greffon d'esbuild remplace
   le texte des modules charges (la vraie fonction demande-submit comprise,
   ses imports `npm:` remplaces par une base simulee), et le harnais applique
   la meme panne aux fichiers qu'il lit au texte (la migration, le reglage,
   la page). L'empreinte de chaque fichier est comparee avant et apres ; une
   panne dont le texte ne se trouve plus exactement une fois fait echouer la
   preuve. `--voir <n>` montre la sortie entiere sous la panne n. */

const racine = path.resolve(import.meta.dirname, '..');
const HARNAIS = path.join(racine, 'scripts/verifie-les-places-au-site.harnais.ts');
const DS = 'supabase/functions/demande-submit/index.ts';
const EXPORTS_DE_LA_DEMANDE = '\nexport { placesLuesPour, estUnCodeDesPlaces, laPlaceCandidate, laPlaceTranchee };\n';
const M = 'supabase/migrations/0154_les_places_limitees.sql';
const R = 'supabase/reglage_places_limitees_20261104.sql';
const P = 'src/apps/revelateur/places-du-site-pur.ts';
const RS = 'src/apps/revelateur/ilots/Reserver.tsx';
const AG = 'src/apps/revelateur/agenda.ts';
const RP = 'src/apps/revelateur/remise-pure.ts';
const OF = 'src/apps/revelateur/ilots/Offres.tsx';

const PANNES = [
  /* La migration. */
  { nom: 'la base ne ferme pas un jour deja occupe', fichier: M,
    avant: "if public.abo_vrai(o->'jourVideSeulement') and coalesce(autres, 0) > 0 then", apres: 'if false then' },
  { nom: 'la base oublie l horizon', fichier: M,
    avant: 'if horizon > 0 and (p_jour - p_aujourdhui) > horizon then', apres: 'if false then' },
  { nom: 'la base ouvre un jour passe', fichier: M, avant: 'if p_jour < p_aujourdhui then', apres: 'if false then' },
  { nom: 'la base compte les annules', fichier: M, avant: "         and coalesce(a.data->>'status', '') <> 'annulé'\n         and (coalesce(p_sauf", apres: '         and (coalesce(p_sauf' },
  { nom: 'la base ne compte pas la place prise par son code', fichier: M,
    avant: "\n          or (code <> '' and public.code_d_offre_normalise(a.data->>'codeOffre') = code) as sienne", apres: ' as sienne' },
  { nom: 'la base compte une autre maison', fichier: M,
    avant: "         and (coalesce(p_branch, '') = '' or coalesce(a.data->>'branchId', '') in ('', p_branch))\n", apres: '\n' },
  { nom: 'la base compte la ligne relue', fichier: M, avant: "         and (coalesce(p_sauf, '') = '' or a.id <> p_sauf)\n", apres: '\n' },
  { nom: 'la porte se ferme aux clientes', fichier: M,
    avant: 'grant execute on function public.places_de_la_remise(text, date, date) to anon, authenticated, service_role;', apres: 'grant execute on function public.places_de_la_remise(text, date, date) to service_role;' },
  { nom: 'la porte lit quatre cents jours', fichier: M, avant: 'least(p_fin, p_debut + 59)', apres: 'least(p_fin, p_debut + 399)' },
  { nom: 'aujourd hui au fuseau du serveur', fichier: M,
    avant: "  le_jour_de_cotonou as (\n    select (now() at time zone 'Africa/Porto-Novo')::date as a", apres: '  le_jour_de_cotonou as (\n    select current_date as a' },
  { nom: 'la garde laisse passer le serveur (ecriture_de_la_maison)', fichier: M,
    avant: '  if public.is_staff() then\n    return new;\n  end if;\n\n  -- L\'offre', apres: '  if public.ecriture_de_la_maison() then\n    return new;\n  end if;\n\n  -- L\'offre' },
  { nom: 'la garde sans verrou', fichier: M,
    avant: "  perform pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || jour));\n  le_jour", apres: '  le_jour' },
  { nom: 'la garde rejuge une place tenue', fichier: M, avant: "  if tg_op = 'UPDATE'\n     and coalesce(old.data", apres: "  if false and tg_op = 'UPDATE'\n     and coalesce(old.data" },
  { nom: 'la garde ne refuse jamais', fichier: M, avant: 'if coalesce(reste, 0) <= 0 then', apres: 'if false then' },
  { nom: 'le juge des remises ouvert aux clientes', fichier: M,
    avant: 'revoke all on function public.une_seule_remise(text, date) from public, anon, authenticated;', apres: 'grant execute on function public.une_seule_remise(text, date) to anon;' },
  { nom: 'un prix convenu a zero franc compte', fichier: M, avant: "(e.value #>> '{}')::numeric > 0", apres: "(e.value #>> '{}')::numeric >= 0" },
  /* Le reglage. */
  { nom: 'cinq places au lieu de trois', fichier: R, avant: "'placesParJour', 3,", apres: "'placesParJour', 5," },
  { nom: 'le samedi dans les jours de la venue', fichier: R, avant: `'["Mar","Mer","Jeu","Ven"]'::jsonb`, apres: `'["Mar","Mer","Jeu","Ven","Sam"]'::jsonb` },
  { nom: 'la copie de repli sans RLS', fichier: R, avant: 'alter table public.repli_mnd_offers_20261104_places enable row level security;', apres: '' },
  { nom: 'le mercredi rallume', fichier: R, avant: '-- 2. LE RITUEL SÓWÀ™',
    apres: "update public.documents set data = jsonb_set(data, '{0,active}', 'true') where key = 'mnd_offers';\n-- 2. LE RITUEL SÓWÀ™" },
  { nom: 'le Sowa sans sa marque', fichier: R, avant: `set data = data || '{"sansRemise": true}'::jsonb`, apres: `set data = data || '{}'::jsonb` },
  /* Le serveur. */
  { nom: 'le code des places vaut un code tape', fichier: DS, avant: '    if (placeAttendue) duCode = { code: \'\' };\n', apres: '\n' },
  { nom: 'la place partie se pose en silence au plein tarif', fichier: DS,
    avant: "        if (placeAttendue) return json({ error: 'places_limitees' }, 409);", apres: '' },
  { nom: 'les prix convenus prennent une place', fichier: DS, avant: "  if (tete?.prixConvenus) return { raison: 'prix-convenus' };", apres: '' },
  { nom: 'une abonnee prend une place', fichier: DS, avant: "  if (tete?.abonnee) return { raison: 'abonnee' };", apres: '' },
  { nom: 'la remise famille et la place se cumulent', fichier: DS, avant: "  if (tete?.famille) return { raison: 'famille' };", apres: '' },
  { nom: 'des places illisibles valent trois', fichier: DS, avant: '  if (!lignes || !offreId) return null;', apres: '  if (!lignes || !offreId) return 3;' },
  { nom: 'la place partie sous verrou n est pas dite', fichier: DS,
    avant: "    } else if (duCode.placeLimitee && /PLACES_LIMITEES/.test(errPose?.message ?? '')) {", apres: '    } else if (false) {' },
  { nom: 'le tarif de la Maison n est pas lu', fichier: DS, avant: "if (!unAutreCode && d.tarifDeLaMaison !== true) {", apres: 'if (!unAutreCode) {' },
  { nom: 'le Sowa prend une remise au serveur', fichier: DS, avant: 'ferme: prix > 0 && !gesteSansRemise(s) };', apres: 'ferme: prix > 0 };' },
  { nom: 'un geste sans prix ferme passe pour une place partie', fichier: DS, avant: "  if (!lignes.some((l) => l.remisee)) return 'sans-effet';", apres: '  if (!lignes.some((l) => l.remisee)) return null;' },
  { nom: 'une place par-dessus un autre code', fichier: DS, avant: "const unAutreCode = !!duCode.code && duCode.raison !== 'inconnu';", apres: 'const unAutreCode = false;' },
  { nom: 'le lien de retour tait les prix convenus', fichier: DS, avant: '...(convenus ? { prixConvenus: true } : {}) });', apres: '});' },
  /* Dans le doute, pas de remise (4 novembre 2026, au soir). */
  { nom: 'une lecture du numero en panne laisse la place', fichier: DS, avant: "  if (!tete) return { raison: 'illisible' };\n", apres: '' },
  { nom: 'une reponse sans ses trois oui/non passe pour une tete sans remise', fichier: DS,
    avant: "  if (typeof d.prixConvenus !== 'boolean' || typeof d.abonnee !== 'boolean' || typeof d.famille !== 'boolean') {", apres: '  if (false) {' },
  { nom: 'la note tait le doute', fichier: DS,
    avant: "        : r === 'illisible' ? 'dans le doute, sans place limitée : ce que porte son numéro n’a pas pu se relire' : '';", apres: "        : '';" },
  { nom: 'la page tait le doute', fichier: P, avant: "  if (r === 'illisible') return PHRASE_DU_DOUTE;\n", apres: '' },
  /* Le site. */
  { nom: 'le site ne passe pas les places lues', fichier: P, avant: '{ ...v, placesConnues: placesConnuesDe(carte, o.id, v.dateIso) }', apres: '{ ...v }' },
  { nom: 'une ligne de places negative se lit', fichier: P, avant: '|| !Number.isInteger(n) || n < 0) continue;', apres: ') continue;' },
  { nom: 'le bandeau sur des jours a zero', fichier: P, avant: '(parOffre[o.id as string] ?? 0) > 0', apres: '(parOffre[o.id as string] ?? -1) >= 0' },
  { nom: 'le code des places passe pour un code', fichier: P, avant: 'return !!c && offres.some((o) => estAPlaces(o) && codeNormalise(o.code) === c);', apres: 'return false;' },
  { nom: 'un tiret long a l ecran', fichier: P, avant: "'Vos tarifs convenus s’appliquent.'", apres: "'Vos tarifs convenus — s’appliquent.'" },
  { nom: '« −0 % » pour une offre sans taux', fichier: P, avant: "return p > 0 ? `−${p} %` : '';", apres: 'return `−${p} %`;' },
  { nom: 'la page tape le code des places', fichier: RS, avant: 'const offreDuMoment = codeDesPlaces ? null : offreDuCodeTape;', apres: 'const offreDuMoment = offreDuCodeTape;' },
  { nom: 'la page ne dit pas la place partie', fichier: RS, avant: "if (code === 'places_limitees') {", apres: "if (code === 'jamais') {" },
  { nom: 'la page n envoie pas le tarif de la Maison', fichier: RS, avant: '...(tarifDeLaMaison ? { tarifDeLaMaison: true } : {}),', apres: '' },
  { nom: 'la page sans bandeau', fichier: RS, avant: '{desPlacesOuvertes && <p className="bandeau-des-places" role="note">{bandeauDesPlaces(desPlacesOuvertes)}</p>}', apres: '' },
  { nom: 'la page dit le prix sans le serveur', fichier: RS,
    avant: 'const offreConfirmee = offreDuMoment ?? offreDeBienvenue ?? (offreDuJour && !estAPlaces(offreDuJour) ? offreDuJour : offreDuServeur);', apres: 'const offreConfirmee = offreAppliquee;' },
  { nom: 'le site rejette sur une panne des places', fichier: AG,
    avant: "    return error ? {} : carteDesRemises(data);\n  } catch {\n    return {};\n  }", apres: "    if (error) throw new Error('places');\n    return carteDesRemises(data);\n  } finally {\n    /* rien */\n  }" },
  { nom: 'l offre a places revient au defilement', fichier: RP, avant: '    .filter((o) => !estAPlaces(o))\n', apres: '' },
  { nom: 'la carte des offres montre le code des places', fichier: OF, avant: '{estAPlaces(o) ? (', apres: '{false ? (' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const greffon = (panne) => ({
  name: 'faux-et-pannes',
  setup(b) {
    b.onResolve({ filter: /^npm:/ }, (a) => ({ path: a.path, namespace: 'faux' }));
    b.onLoad({ filter: /.*/, namespace: 'faux' }, (a) => ({
      loader: 'js',
      contents: a.path.startsWith('npm:@supabase/supabase-js')
        ? 'export const createClient = (...a) => globalThis.__faux.client(...a);'
        : 'export default { setVapidDetails() {}, async sendNotification() { return {}; } };',
    }));
    b.onLoad({ filter: /\.(ts|tsx)$/ }, (a) => {
      const rel = path.relative(racine, a.path).split(path.sep).join('/');
      if (rel !== DS && !(panne && panne.fichier === rel)) return undefined;
      let src = readFileSync(a.path, 'utf8').replace(/\r\n/g, '\n');
      if (panne && panne.fichier === rel) src = src.split(panne.avant).join(panne.apres);
      if (rel === DS) src += EXPORTS_DE_LA_DEMANDE;
      return { contents: src, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(a.path) };
    });
  },
});

async function lance(panne) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-places-au-site-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [HARNAIS], bundle: true, format: 'esm', platform: 'node', target: 'es2022',
      outfile: sortie, logLevel: 'silent', plugins: [greffon(panne)],
      /* La base du site, que Vite pose a la construction (offre-porte la lit). */
      define: { __PANNE__: JSON.stringify(panne ?? null), 'import.meta.env.BASE_URL': JSON.stringify('/') },
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
    return { status: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } catch (e) {
    return { status: 3, sortie: String(e?.message ?? e) };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const voir = process.argv.indexOf('--voir');
if (voir > 0) {
  const r = await lance(PANNES[Number(process.argv[voir + 1]) - 1] ?? null);
  process.stdout.write(r.sortie);
  process.exit(0);
}

const net = await lance(null);
process.stdout.write(net.sortie);
if (net.status !== 0) process.exit(1);

if (process.argv.includes('--prouve')) {
  let muettes = 0;
  for (const p of PANNES) {
    const texte = readFileSync(path.join(racine, p.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(p.avant).length - 1;
    const avant = md5(p.fichier);
    let verdict;
    if (fois !== 1) verdict = `INTROUVABLE (${fois} fois)`;
    else {
      const r = await lance(p);
      /* Une panne crie par un controle en ECHEC, jamais par un plantage : un
         harnais qui tombe ne dit pas ce qu'il a vu. */
      verdict = r.status !== 0 && /^ECHEC/m.test(r.sortie) ? 'CRIE ' : 'MUETTE';
    }
    if (md5(p.fichier) !== avant) verdict = `LE FICHIER A CHANGE (${verdict})`;
    if (verdict !== 'CRIE ') muettes++;
    console.log(`${verdict} ${p.nom}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) ou introuvable(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
