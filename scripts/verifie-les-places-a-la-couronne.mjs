import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES PLACES LIMITEES A MA COURONNE, EPROUVEES (4 novembre 2026).
   `node scripts/verifie-les-places-a-la-couronne.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier. Les pannes vivent dans la memoire du bundle (un greffon
   d'esbuild remplace le texte lu) et dans la source que le harnais relit
   (`__PANNE__`), jamais dans le depot : l'empreinte de chaque fichier est
   comparee avant et apres. Une panne dont le texte ne se trouve plus
   exactement une fois fait echouer la preuve. */

const racine = path.resolve(import.meta.dirname, '..');
const P = 'src/apps/couronne/places-pure.ts';
const R = 'src/apps/couronne/reservation-pure.ts';
const B = 'src/apps/couronne/Booking.tsx';
const T = 'src/apps/couronne/Tabs.tsx';
const L = 'src/apps/couronne/lib.ts';
const M = 'src/apps/couronne/MesRendezVous.tsx';
const C = 'src/apps/couronne/Compose.tsx';
const A = 'src/apps/couronne/AchatFormule.tsx';
const K = 'src/apps/couronne/MaCarte.tsx';
const F = 'src/apps/couronne/MaFormule.tsx';
const Q = 'supabase/migrations/0155_le_foyer_sous_une_seule_remise.sql';

const PANNES = [
  /* La regle de Ma Couronne (places-pure). */
  { nom: 'les prix convenus et les abonnees prennent une place', fichier: P,
    avant: 'if (e.aucuneRemise || !e.dateIso) return null;', apres: 'if (!e.dateIso) return null;' },
  { nom: 'la place partie se repose au tarif de la Maison', fichier: P,
    avant: 'if (e.renonceLe && e.renonceLe === jour) return null;', apres: '' },
  { nom: 'l ancien mercredi revient par Ma Couronne', fichier: P,
    avant: 'if (!o || !estAPlaces(o)) continue;', apres: 'if (!o) continue;' },
  { nom: 'l horizon ne se rejuge pas', fichier: P,
    avant: '(horizon > 0 && joursEntre(e.aujourdhui, jour) > horizon)', apres: 'false' },
  { nom: 'un jour passe se remise', fichier: P,
    avant: 'if (!tenue && (jour < e.aujourdhui || ', apres: 'if (!tenue && (' },
  { nom: 'les places lues sont ignorees', fichier: P,
    avant: 'placesConnues: placesLues(e.carte, o, jour),', apres: 'placesConnues: 3,' },
  { nom: 'une place negative se lit', fichier: P,
    avant: '(carte[jour] ??= {})[offre] = Math.max(0, Math.floor(n));', apres: '(carte[jour] ??= {})[offre] = Math.floor(n);' },
  { nom: 'une fenetre relue garde un jour que la base ne dit plus', fichier: P,
    avant: '    else delete carte[j];\n', apres: '' },
  { nom: 'les places ne se lisent pas par le code', fichier: P,
    avant: 'if (code) for (const [k, v] of Object.entries(duJour))', apres: 'if (false) for (const [k, v] of Object.entries(duJour))' },
  { nom: 'une abonnee voit les remises', fichier: P,
    avant: 'tetes.some((x) => !!x && (!!x.prixConvenus || !!x.abonnee));', apres: 'tetes.some((x) => !!x && !!x.prixConvenus);' },
  { nom: 'la tete pour qui elle reserve ne compte pas', fichier: P,
    avant: 'abonnee: tetes.some((x) => !!x?.abonnee),', apres: 'abonnee: !!tetes[0]?.abonnee,' },
  { nom: 'une formule finie fait une abonnee', fichier: P,
    avant: '(releve?.contrats?.length ?? 0) > 0;', apres: 'true;' },
  { nom: 'le panier remise les prix convenus', fichier: P,
    avant: "  if (e.aucuneRemise) return { ...zero, retenue: 'aucune', prix: connu };\n", apres: '' },
  { nom: 'le geste de la Maison et une autre remise cumules', fichier: P,
    avant: "  if (e.geste) return { ...zero, retenue: 'geste', prix: connu };\n", apres: '' },
  { nom: 'la famille sur le Sowa', fichier: P,
    avant: 'const baseFamille = somme((l) => !l.forfait && !l.sansRemise);', apres: 'const baseFamille = somme((l) => !l.forfait);' },
  { nom: 'la famille ne ferme plus la place', fichier: P,
    avant: "  if (remiseFamille > 0) return { ...zero, pctFamille, remiseFamille, retenue: 'famille', prix: Math.max(0, connu - remiseFamille) };\n", apres: '' },
  { nom: 'l offre de saison mord sur le Sowa', fichier: P,
    avant: 'const base = connu - sansRemiseXof;', apres: 'const base = connu;' },
  { nom: 'la place mord sur le Sowa', fichier: P,
    avant: 'ferme: l.ferme && !l.sansRemise })),', apres: 'ferme: l.ferme })),' },
  { nom: 'pas d arrondi au millier', fichier: P,
    avant: 'const remisePlace = Math.max(0, r.retire - arrondiDuNet(r.net, r.retire));', apres: 'const remisePlace = r.retire;' },
  { nom: 'la ligne du Sowa dit une remise', fichier: P,
    avant: 'if (l.sansRemise || l.masque) return 0;', apres: 'if (l.masque) return 0;' },
  { nom: 'le refus PLACES_LIMITEES ne se reconnait pas', fichier: P,
    avant: '/\\bPLACES_LIMITEES:/.test(', apres: '/\\bXPLACES_LIMITEES:/.test(' },
  { nom: 'le refus de la base passe pour une panne de reseau', fichier: R,
    avant: "return estLaPlacePartie(message) ? 'place-partie' : 'echec';", apres: "return 'echec';" },
  /* Reserver (Booking). */
  { nom: 'Reserver : la remise famille d une tete aux prix convenus', fichier: B,
    avant: 'const famPctTete = remiseFamilleDeLaTete(famPctCompte, teteALaRemise);', apres: 'const famPctTete = famPctCompte;' },
  { nom: 'Reserver : l offre de saison aux prix convenus', fichier: B,
    avant: 'const discountPct = aucuneRemise ? 0 : (prefill?.discountPct ?? 0);', apres: 'const discountPct = prefill?.discountPct ?? 0;' },
  { nom: 'Reserver : la place pour une abonnee', fichier: B,
    avant: '    aucuneRemise,\n    dejaUnCode: discountPct > 0,', apres: '    dejaUnCode: discountPct > 0,' },
  { nom: 'Reserver : la place par-dessus la remise famille', fichier: B,
    avant: '      || leChiffreDuPanier({ lignes: lignesDe(panier), famillePct: famPctTete }).remiseFamille > 0,', apres: '      || false,' },
  { nom: 'Reserver : le panier remise une abonnee', fichier: B,
    avant: '      place,\n      aucuneRemise,\n', apres: '      place,\n' },
  { nom: 'Reserver : les places ne sont pas lues', fichier: B,
    avant: 'carte: placesDeLaRemiseDe(branch.id),', apres: 'carte: {},' },
  { nom: 'Reserver : la place sur le Sowa', fichier: B,
    avant: " && prixFerme(s, pricing) && !gesteSansRemise(s) };", apres: ' && prixFerme(s, pricing) };' },
  { nom: 'Reserver : la place partie s ecrit quand meme', fichier: B,
    avant: "if (verdict === 'place-partie' && laPlace) {", apres: 'if (false) {' },
  { nom: 'Reserver : confirmer au tarif repose la place', fichier: B,
    avant: '    setRenonceLe(placePartie.iso);\n', apres: '' },
  { nom: 'Reserver : le decompte ne se dit pas', fichier: B,
    avant: 'return n !== null && n > 0 ? t(ditLesPlaces(n)) : null;', apres: 'return null;' },
  /* L'accueil, le profil, le deplacement. */
  { nom: 'Accueil : le rail des offres aux prix convenus', fichier: L,
    avant: '    if (aucuneRemise) return { offers: [], endMin: null };\n', apres: '' },
  { nom: 'Accueil : une abonnee jugee sans son releve', fichier: L,
    avant: 'me ? { prixConvenus: aUnPrixConvenu(me), abonnee: formulesQuiCourent(releveMoi) } : null,', apres: 'me ? { prixConvenus: aUnPrixConvenu(me), abonnee: false } : null,' },
  { nom: 'Reserver pour sa fille : la fille non jugee', fichier: L,
    avant: 'autre ? { prixConvenus: aUnPrixConvenu(autre), abonnee: formulesQuiCourent(releveTete) } : null,', apres: 'null,' },
  { nom: 'les places ne se retiennent pas', fichier: L,
    avant: '        retiensLesPlacesDeLaRemise(branchId, du, au, laRemise);\n', apres: '' },
  { nom: 'une panne de la lecture des places se retient comme une reponse', fichier: L,
    avant: '.then((lue) => (lue.error ? null : lue.data as unknown), () => null);', apres: '.then((lue) => lue.data as unknown, () => [] as unknown);' },
  { nom: 'une panne de la lecture garde les places d avant', fichier: L,
    avant: 'lignes === null ? null : carteDesPlacesDeLaRemise(lignes),', apres: 'carteDesPlacesDeLaRemise(lignes ?? []),' },
  { nom: 'Profil : la remise famille dite aux prix convenus', fichier: T,
    avant: 'const famPctDit = remiseFamilleDeLaTete(famPctProfil, useLaTeteALaRemise());', apres: 'const famPctDit = famPctProfil;' },
  { nom: 'Deplacer : la place gardee se perd', fichier: M,
    avant: 'offreTenue: iso === editing.date ? placeTenue.id : undefined,', apres: 'offreTenue: undefined,' },
  { nom: 'Deplacer : le refus des places est muet', fichier: M,
    avant: ': estLaPlacePartie(parLaMaison.raison)', apres: ': false' },

  /* Ni les autres remises, en aucune circonstance (4 novembre 2026, au selecteur). */
  { nom: 'l avantage abonne pour une cliente aux prix convenus', fichier: P,
    avant: '(aucuneRemise ? 0 : Math.max(0, Math.round(pct || 0)));', apres: '(Math.max(0, Math.round(pct || 0)));' },
  { nom: 'la remise Foyer pour une abonnee', fichier: P,
    avant: 'export const rangDuFoyerPourElle = (rang: number, aucuneRemise: boolean): number => (aucuneRemise ? 1 : rang);',
    apres: 'export const rangDuFoyerPourElle = (rang: number, aucuneRemise: boolean): number => (aucuneRemise ? rang : rang);' },
  { nom: 'les soins offerts du Cercle pour une cliente aux prix convenus', fichier: P,
    avant: '(aucuneRemise ? [] : [...(soins ?? [])]);', apres: '([...(soins ?? [])]);' },
  { nom: 'Compose : l avantage abonne transmis au Trone', fichier: C,
    avant: 'const discountPct = avantageDuSurMesure(sm.aboPct, aucuneRemise);', apres: 'const discountPct = sm.aboPct;' },
  { nom: 'Compose : « −0 % » affiche', fichier: C,
    avant: '{count > 0 && discountPct > 0 && (', apres: '{count > 0 && (' },
  { nom: 'Compose : l onglet dit encore −15 %', fichier: C,
    avant: "{discountPct > 0 ? t('−{pct} % · dès {min} soins', { pct: discountPct, min: sm.aboMin }) : t('dès {min} soins', { min: sm.aboMin })}",
    apres: "{t('−{pct} % · dès {min} soins', { pct: sm.aboPct, min: sm.aboMin })}" },
  { nom: 'Compose : « de remise » sur nos abonnements', fichier: C,
    avant: '{remises && !aucuneRemise ? t(', apres: '{remises ? t(' },
  { nom: 'Compose : le gain des formules chiffre', fichier: C,
    avant: 'const gainDit = aucuneRemise ? 0 : g.gainXof;', apres: 'const gainDit = g.gainXof;' },
  { nom: 'AchatFormule : la remise Foyer s applique', fichier: A,
    avant: 'rangDansLeFoyer: rangDuFoyerPourElle(rang, aucuneRemise)', apres: 'rangDansLeFoyer: rang' },
  { nom: 'Accueil : « une recompense vous attend »', fichier: T,
    avant: 'soinsOffertsPourElle(soinsEnAttente(client?.soinsOfferts), aucuneRemise)', apres: 'soinsEnAttente(client?.soinsOfferts)' },
  { nom: 'Cercle : les sceaux du Foyer', fichier: T,
    avant: 'cercle.foyerOuvert && !aucuneRemise && (', apres: 'cercle.foyerOuvert && (' },
  { nom: 'Mon ambassade : ses recompenses montrees et gardees', fichier: K,
    avant: 'const sesSoins = soinsOffertsPourElle(client?.soinsOfferts, aucuneRemise);', apres: 'const sesSoins = client?.soinsOfferts ?? [];' },
  { nom: 'Mon ambassade : la regle promet une recompense', fichier: K,
    avant: "{aucuneRemise ? t('une branche chacune') : t('une récompense chacune')}", apres: "{t('une récompense chacune')}" },
  { nom: 'Ma formule : « vous gagnez »', fichier: F,
    avant: '    if (aucuneRemise) return null;\n', apres: '' },
  { nom: 'Ma formule : « X F de moins »', fichier: F,
    avant: 'if (!client || aucuneRemise) return null;', apres: 'if (!client) return null;' },
  { nom: '0155 : le rang ne lit pas le juge', fichier: Q,
    avant: 'select case when public.abo_foyer_sans_remise(p_tete, p_jour) then 1 else (', apres: 'select case when false then 1 else (' },
  { nom: '0155 : un prix convenu a zero franc compte', fichier: Q,
    avant: "(e.value #>> '{}')::numeric > 0)", apres: "(e.value #>> '{}')::numeric >= 0)" },
  { nom: '0155 : une formule retenue ne compte pas', fichier: Q,
    avant: "and (f.etat in ('retenue', 'en-cours', 'en-pause', 'epuisee')", apres: "and (f.etat in ('en-cours', 'en-pause', 'epuisee')" },
  { nom: '0155 : la lune reglee d une resiliee ne compte pas', fichier: Q,
    avant: "or (f.etat = 'resiliee' and f.dernier is not null", apres: "or (false and f.dernier is not null" },
  { nom: '0155 : le juge ouvert aux clientes', fichier: Q,
    avant: 'revoke all on function public.abo_foyer_sans_remise(text, date) from public, anon, authenticated;\n', apres: '' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-places-couronne-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-places-a-la-couronne.harnais.ts')],
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
