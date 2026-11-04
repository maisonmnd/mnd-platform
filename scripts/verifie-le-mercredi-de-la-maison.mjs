import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE MERCREDI DE LA MAISON, EPROUVE (2 novembre 2026).
   `node scripts/verifie-le-mercredi-de-la-maison.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier. Les pannes vivent dans la memoire du bundle (un greffon
   d'esbuild remplace le texte lu) et dans la lecture des sources par le
   harnais (`__PANNE__`), jamais dans le depot : l'empreinte de chaque fichier
   est comparee avant et apres. Une panne dont le texte ne se trouve plus
   exactement une fois fait echouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const P = 'src/shared/offres-pur.ts';
const C = 'src/apps/trone/routes/vente/Caisse.tsx';
const F = 'src/apps/trone/routes/vente/caisse-fluide-pur.ts';
const S = 'src/apps/trone/routes/clients/_shared.tsx';
const B = 'src/apps/couronne/Booking.tsx';
const L = 'src/apps/couronne/lib.ts';
const R = 'src/apps/revelateur/ilots/Reserver.tsx';
const E = 'src/apps/trone/routes/equipe/EditeurDesOffres.tsx';
const D = 'supabase/functions/demande-submit/index.ts';
const Q = 'supabase/reglage_mercredi_de_la_maison_20261102.sql';
const Q2 = 'supabase/reglage_mercredi_soins_seuls_20261104.sql';
const PR = 'src/shared/prochain-rituel-pur.ts';
const BL = 'src/apps/trone/routes/vente/SonProchainRituel.tsx';

/* 4 novembre 2026 : les pannes du cablage du mercredi (Caisse, fenetre,
   Ma Couronne, Son prochain rituel, la plus forte des deux) sont parties avec
   lui ; leurs pareilles vivent dans les bancs verifie-les-places-*. */
const PANNES = [
  /* Les huit pannes demandees, et celles qui les suivent dans chaque porte. */
  { nom: 'un mardi remise', fichier: P,
    avant: 'if (!jour || !o.joursDeLaVenue!.includes(jour)) return false;', apres: 'if (!jour) return false;' },
  { nom: 'le jour regarde compte au lieu du jour de la venue', fichier: P,
    avant: 'return laVenueTombeBien(o, venueIso === undefined ? isoDuJour(now) : venueIso);', apres: 'return laVenueTombeBien(o, isoDuJour(now));' },
  { nom: 'le site juge sur le jour regarde', fichier: R,
    avant: 'offreDuCode(offres, code, new Date(), jour || null)', apres: 'offreDuCode(offres, code)' },
  { nom: 'un abonnement remise', fichier: P,
    avant: 'if (v.dejaUnCode || v.couvertParAbonnement || v.forfait || v.ecartee || !v.dateIso) return null;', apres: 'if (v.dejaUnCode || v.forfait || v.ecartee || !v.dateIso) return null;' },
  { nom: 'deux codes cumules', fichier: P,
    avant: 'if (v.dejaUnCode || v.couvertParAbonnement', apres: 'if (v.couvertParAbonnement' },
  { nom: 'deux codes cumules sur le site', fichier: R,
    avant: 'const unAutreCode = !!offreDuMoment || FORME_DU_CODE.test(codeNormalise(code));', apres: 'const unAutreCode = false;' },
  { nom: 'pas d arrondi au millier', fichier: P,
    avant: 'return Math.min(remise, reste === 0 ? 0 : palier - reste);', apres: 'return 0;' },
  { nom: 'pas d arrondi dans la fenetre', fichier: S,
    avant: 'const grossXof = keepFrozen ? (frozenXof as number) : grossBase + arrondiDuCode;', apres: 'const grossXof = keepFrozen ? (frozenXof as number) : grossBase;' },
  { nom: 'pas d arrondi au prix fige', fichier: S,
    avant: 'priceXof: effCovered ? 0 : needsAmount ? effGross : grossBase + arrondiDuCode,', apres: 'priceXof: effCovered ? 0 : needsAmount ? effGross : grossBase,' },
  { nom: 'pas d arrondi sur le site', fichier: R,
    avant: 'const prixTotal = compte.net + arrondi;', apres: 'const prixTotal = compte.net;' },
  { nom: 'un serviceIds vide qui solde tout', fichier: P,
    avant: 'if (!(o.serviceIds ?? []).some((id) => gestes.has(id))) continue;', apres: 'if ((o.serviceIds ?? []).length > 0 && !(o.serviceIds ?? []).some((id) => gestes.has(id))) continue;' },
  { nom: 'un serviceIds vide qui solde ses lignes', fichier: P,
    avant: 'const porte = pct > 0 && l.ferme && l.prixXof > 0 && couvre.has(l.id);', apres: 'const porte = pct > 0 && l.ferme && l.prixXof > 0 && (couvre.size === 0 || couvre.has(l.id));' },
  { nom: 'la carte de Ma Couronne pre-remplit la remise', fichier: L,
    avant: 'discountPct: porteSurLeJourDeLaVenue(o) ? 0 : (o.discountPct ?? 0),', apres: 'discountPct: o.discountPct ?? 0,' },
  { nom: 'la Caisse propose le mercredi comme une saison', fichier: F,
    avant: 'if (!o.code || porteSurLeJourDeLaVenue(o)) continue;', apres: 'if (!o.code) continue;' },
  { nom: 'la fenetre ne pose pas le code', fichier: S,
    avant: '...(poseDuMercredi ? { codeOffre: poseDuMercredi.codeOffre, ...(poseDuMercredi.offreId ? { offreId: poseDuMercredi.offreId } : {}) } : {}),', apres: '' },
  { nom: 'deplace au jeudi, la remise du mercredi reste', fichier: P,
    avant: 'return remises.map((r, i) => (r && pct > 0 && r.pct === pct && !r.xof && couvre.has(rdv.serviceIds[i]) ? null : r));', apres: 'return remises;' },
  { nom: 'le code ecrase la remise de la main', fichier: P,
    avant: 'if (remiseDeLaMain(main)) return { ...(main as { pct?: number; xof?: number }) };', apres: '' },
  { nom: 'le site oublie d envoyer le code', fichier: R,
    avant: ': offreDuJour?.code ? { code: codeNormalise(offreDuJour.code) } : {}),', apres: ': {}),' },
  { nom: 'le serveur juge sur aujourd hui', fichier: D,
    avant: 'offreDuCode(candidates, code, jourDeLaMaison(), o.date ?? null)', apres: 'offreDuCode(candidates, code, jourDeLaMaison())' },
  { nom: 'le serveur borne le mercredi a une fois', fichier: D,
    avant: 'if (duCode.remisesLignes && !duCode.chaqueVenue && await codeDejaUtilise', apres: 'if (duCode.remisesLignes && await codeDejaUtilise' },
  { nom: 'la copie du serveur remise un mardi', fichier: D,
    avant: 'if (!jour || !o.joursDeLaVenue!.includes(jour)) return false;', apres: 'if (!jour) return false;' },
  { nom: 'l editeur n enregistre pas les jours de la venue', fichier: E,
    avant: 'joursDeLaVenue: offerForm.joursDeLaVenue.length\n        ? OFFER_DAYS', apres: 'joursDeLaVenue: false\n        ? OFFER_DAYS' },
  { nom: 'le reglage oublie le jour de la venue', fichier: Q,
    avant: "    'joursDeLaVenue', '[\"Mer\"]'::jsonb,\n", apres: '' },
  { nom: 'la table de repli sans RLS', fichier: Q,
    avant: 'alter table public.repli_mnd_offers_20261102 enable row level security;', apres: '' },
  { nom: 'le reglage ajoute deux fois', fichier: Q,
    avant: '   and not exists (', apres: '   and true or exists (' },
  /* Les shampoings, lavages et soins seuls (Yeman, 4 novembre 2026). */
  { nom: 'les soins seuls gardent la reprise', fichier: Q2,
    avant: "       'sv-plt-40-m',               --", apres: "       'sv-plt-40-m', 'sv-atl-ii-e', --" },
  { nom: 'les soins seuls oublient le soin 2 en 1', fichier: Q2,
    avant: "       'sv-forfait-sv-plt-60-wd-c', --", apres: '       --' },
  { nom: 'les soins seuls prennent un geste Kids', fichier: Q2,
    avant: "       'sv-dds-shp-e',              --", apres: "       'sv-dds-shp-e', 'sv-kids-kloklo', --" },
  { nom: 'les soins seuls sans repli RLS', fichier: Q2,
    avant: 'alter table public.repli_mnd_offers_20261104 enable row level security;', apres: '' },
  { nom: 'les soins seuls touchent toutes les offres', fichier: Q2,
    avant: "case when upper(coalesce(t.e->>'code', '')) = 'MERCREDI15'", apres: 'case when true' },
  { nom: 'les soins seuls melangent les offres', fichier: Q2,
    avant: '                  order by t.n)', apres: '                  )' },
  { nom: 'les soins seuls se reecrivent a chaque fois', fichier: Q2,
    avant: "        and ((e->'serviceIds') is distinct from neuf.ids or not (e @> neuf.mots))", apres: '' },
  { nom: 'les soins seuls disent encore le rituel', fichier: Q2,
    avant: 'sur vos shampoings, lavages et soins, le jour', apres: 'sur votre rituel, le jour' },
  /* La plus forte des deux (Yeman, au selecteur, 2 novembre 2026 au soir). */
  { nom: 'la plus faible gardee', fichier: P,
    avant: "if (mercrediXof > familleXof) return { retenue: 'mercredi', familleXof, mercrediXof };", apres: "if (mercrediXof < familleXof) return { retenue: 'mercredi', familleXof, mercrediXof };" },
  { nom: 'a egalite, le mercredi', fichier: P,
    avant: "if (mercrediXof > familleXof) return { retenue: 'mercredi', familleXof, mercrediXof };", apres: "if (mercrediXof >= familleXof && mercrediXof > 0) return { retenue: 'mercredi', familleXof, mercrediXof };" },
  { nom: 'le mercredi compare avant son arrondi', fichier: P,
    avant: 'const mercrediXof = Math.max(0, Math.round(e.sansLuiXof) - avec - arrondiXof);', apres: 'const mercrediXof = Math.max(0, Math.round(e.sansLuiXof) - avec);' },
  /* Son prochain rituel, a la Caisse. */
  { nom: 'le prochain rituel d un mercredi sans code', fichier: PR,
    avant: '    ...(o.offreDuJour ? {', apres: '    ...(false ? {' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const BANNIERE = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, location: { href: '', hash: '' }, setTimeout: () => 0 };
globalThis.document = { body: { dataset: {}, appendChild() {} }, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, remove() {} }), querySelectorAll: () => [] };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`;

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-mercredi-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-mercredi-de-la-maison.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
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
      define: {
        'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }),
        __PANNE__: JSON.stringify(panne ?? null),
      },
      banner: { js: BANNIERE },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
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
