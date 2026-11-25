import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { C, P, RUBRIQUES, defautsDeLaFiche, fiche } from './outils.mjs';

/* LES FICHES DE PROCÉDURE, ASSEMBLÉES — `node scripts/fiches-de-procedure/assemble.mjs [--catalogue <fichier>] [--sortie <dossier>]`.

   Lit le catalogue de la Maison (en ligne, par la clé publiable de
   `.env.local`, ou un relevé donné par `--catalogue`), puis les familles de
   fiches écrites dans `familles/*.mjs`, et rend :

     · `<sortie>/fiches.json` : une fiche par prestation, prête pour le
       document `mnd_fiches_de_procedure` (brouillon, lignes numérotées,
       origine de chaque ligne) et pour la page de validation ;
     · `<sortie>/rapport.txt` : ce qui manque ou cloche, en toutes lettres.

   TROIS RÈGLES, TENUES ICI :
     ① chaque soin du catalogue a SA fiche, une seule (ni archivé, ni atelier
        fermé, ni formation de l'Académie : comme l'écran du Catalogue) ;
     ② une prestation qui en COMPREND d'autres (forfait, venue, abonnement) et
        que personne n'a écrite à la main reçoit une fiche d'enchaînement,
        tirée de ce que le catalogue dit qu'elle comprend ; le rendez-vous
        apporte déjà la fiche de chaque prestation comprise ;
     ③ aucune fiche ne passe avec un défaut (`defautsDeLaFiche`) : sept
        rubriques, aucune vide, une origine par ligne, pas de chiffre de la
        pratique sans référence.

   Rien n'est écrit en base ici : `reglage.mjs` fait le fichier SQL. */

const ici = import.meta.dirname;
const racine = path.resolve(ici, '..', '..');
const arg = (nom) => { const i = process.argv.indexOf(nom); return i > 0 ? process.argv[i + 1] : undefined; };
const sortie = path.resolve(arg('--sortie') ?? path.join(ici, 'sortie'));

async function litLeCatalogue() {
  const releve = arg('--catalogue');
  if (releve) return JSON.parse(readFileSync(releve, 'utf8'));
  const env = readFileSync(path.join(racine, '.env.local'), 'utf8');
  const lis = (motif) => (env.match(motif)?.[1] ?? '').trim().replace(/^"|"$/g, '');
  const url = lis(/^VITE_SUPABASE_URL=(.*)$/m);
  const cle = lis(/^VITE_SUPABASE_(?:ANON|PUBLISHABLE)[A-Z_]*=(.*)$/m);
  if (!url || !cle) throw new Error('Pas d’adresse ou de clé publiable dans .env.local : passe --catalogue <fichier>.');
  const table = async (nom) => {
    const r = await fetch(`${url}/rest/v1/${nom}?select=id,data`, { headers: { apikey: cle, Authorization: `Bearer ${cle}` } });
    if (!r.ok) throw new Error(`${nom} : ${r.status}`);
    return (await r.json()).map((x) => x.data);
  };
  return { services: await table('catalog_services'), categories: await table('catalog_categories') };
}

const codeNu = (code) => (code ?? '').replace(/·[CML]$/, '');
const dureeDite = (min) => {
  const m = Math.round(min ?? 0);
  if (m <= 0) return '';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h === 0 ? `${m} min` : r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')}`;
};

const { services: tous, categories } = await litLeCatalogue();

/* Les prestations que ce chantier crée (offertes) : elles ont leur fiche
   avant même d'être en base. */
const { PRESTATIONS_OFFERTES } = await import(pathToFileURL(path.join(ici, 'prestations-offertes.mjs')).href);
const services = [...tous.filter((s) => !PRESTATIONS_OFFERTES.some((n) => n.id === s.id)), ...PRESTATIONS_OFFERTES];

const ouvertes = new Set(categories.filter((c) => c.enabled && !c.produits && !String(c.id).startsWith('aca-')).map((c) => c.id));
const soins = services.filter((s) => !s.archived && ouvertes.has(s.categoryId));
const parId = new Map(services.map((s) => [s.id, s]));
const cat = {
  sv: (id) => { const s = parId.get(id); if (!s) throw new Error(`prestation inconnue au catalogue : ${id}`); return s; },
  nom: (id) => parId.get(id)?.name ?? 'une prestation retirée du catalogue',
  existe: (id) => parId.has(id),
  duree: (id) => dureeDite(parId.get(id)?.durationMin),
  /** « court 30 min, mi-long 35 min, long 40 min », ou la durée seule. */
  dureeParLongueur: (id) => {
    const s = parId.get(id);
    const d = s?.dureeParLongueur ?? {};
    const dites = [['court', 'court'], ['mi-long', 'mi-long'], ['long', 'long']]
      .filter(([k]) => typeof d[k] === 'number').map(([k, mot]) => `${mot} ${dureeDite(d[k])}`);
    return dites.length ? dites.join(', ') : dureeDite(s?.durationMin);
  },
  /** Les formules du catalogue qui comprennent cette prestation, en une ligne (ou rien). */
  comprisDans: (id) => {
    const noms = soins.filter((s) => (s.includes ?? []).some((i) => i.serviceId === id)).map((s) => s.name.split(' · ')[0]);
    const uniques = [...new Set(noms)];
    return uniques.length ? [C(`Compris dans : ${uniques.join(' ; ')}.`)] : [];
  },
  dureeDite,
  soins,
};

/* ② La fiche d'enchaînement d'une prestation qui en comprend d'autres. */
function ficheDEnchainement(sv) {
  const inclus = (sv.includes ?? []).filter((i) => i.serviceId || i.categoryId || i.productId);
  const nomDe = (i) => (i.serviceId ? cat.nom(i.serviceId)
    : i.categoryId ? `la création de l’atelier ${categories.find((c) => c.id === i.categoryId)?.fon ?? i.categoryId}, au calibre de la cliente`
      : 'un produit de la Gamme, remis au comptoir');
  const duJour = inclus.filter((i) => !i.afterWeeks);
  const plusTard = inclus.filter((i) => !!i.afterWeeks).sort((a, b) => a.afterWeeks - b.afterWeeks);
  const description = (sv.description ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' ');
  const qui = [
    ...(sv.reserveEnfants ? [C('Réservé aux enfants (MND Kids).')] : []),
    ...(sv.desVenue ? [C(`Proposé à partir de la venue n° ${sv.desVenue}.`)] : []),
    ...(sv.fenetreApresVenue ? [C(`Se pose de ${sv.fenetreApresVenue.deSemaines} à ${sv.fenetreApresVenue.aSemaines} semaines après la dernière venue honorée.`)] : []),
    ...(sv.consultationAvant ? [C('Une consultation précède : vérifier qu’elle a eu lieu.')] : []),
  ];
  return fiche(sv.id, sv.name, {
    objectif: [
      description ? C(description) : C(`${sv.name} : ${inclus.length} prestations du catalogue, rendues ensemble.`),
      P('Rendre dans l’ordre les prestations comprises, chacune selon sa propre fiche.'),
    ],
    public: qui.length ? qui : [P('La cliente qui a pris cette formule : vérifier qu’elle est bien inscrite au rendez-vous.')],
    produits: [C('Ceux de chaque prestation comprise : voir sa fiche, dans le même rendez-vous.')],
    arrivee: [
      P('Relire ce qui se rend aujourd’hui et ce qui reste à venir dans la formule.'),
      C('Puis les vérifications de chaque prestation comprise : voir sa fiche.'),
    ],
    etapes: (duJour.length ? duJour : inclus).map((i) => C(`${nomDe(i)}${i.offert ? ', offert' : ''} : voir sa fiche.`)),
    conseils: [
      C('Ceux de chaque prestation rendue ce jour : voir sa fiche.'),
      ...(plusTard.length ? [P('Poser avec elle la venue suivante avant son départ.')] : []),
    ],
    suivi: [
      ...plusTard.map((i) => C(`${i.afterWeeks} semaine${i.afterWeeks > 1 ? 's' : ''} après : ${nomDe(i)}${i.offert ? ', offert' : ''}.`)),
      ...((sv.sessions ?? 1) > 1 ? [C(`${sv.sessions} séances au catalogue.`)] : []),
      ...(sv.sansRemise ? [C('Aucune remise sur cette prestation.')] : []),
      ...(!plusTard.length && (sv.sessions ?? 1) <= 1 ? [C('Tout se rend le jour même.')] : []),
    ],
  });
}

/* Les familles écrites à la main. Chacune rend ses fiches, le catalogue en main. */
const ecrites = [];
const dossier = path.join(ici, 'familles');
for (const f of readdirSync(dossier).filter((x) => x.endsWith('.mjs')).sort()) {
  const m = await import(pathToFileURL(path.join(dossier, f)).href);
  const rendues = typeof m.default === 'function' ? m.default(cat) : m.default;
  for (const x of rendues ?? []) ecrites.push({ ...x, famille: f });
}

const rapport = [];
const parPrestation = new Map();
for (const f of ecrites) {
  for (const id of f.pour) {
    if (!parId.has(id)) { rapport.push(`${f.famille} : « ${f.titre} » vise ${id}, absente du catalogue`); continue; }
    if (parPrestation.has(id)) rapport.push(`${f.famille} : ${id} a deja une fiche (${parPrestation.get(id).famille})`);
    parPrestation.set(id, f);
  }
}
let enchainements = 0;
for (const sv of soins) {
  if (parPrestation.has(sv.id)) continue;
  if ((sv.includes ?? []).some((i) => i.serviceId || i.categoryId || i.productId)) {
    parPrestation.set(sv.id, { ...ficheDEnchainement(sv), famille: '(enchainement)' });
    enchainements += 1;
  }
}
const sansFiche = soins.filter((s) => !parPrestation.has(s.id));
for (const s of sansFiche) rapport.push(`SANS FICHE : ${s.id} · ${s.name} (${s.categoryId})`);
const horsSoins = [...parPrestation.keys()].filter((id) => !soins.some((s) => s.id === id));
for (const id of horsSoins) rapport.push(`HORS DES SOINS : ${id} · ${cat.nom(id)} (archivee, atelier ferme ou Academie)`);

const prefixe = { objectif: 'ob', public: 'pu', produits: 'pr', arrivee: 'ar', etapes: 'et', conseils: 'co', suivi: 'su' };
const fiches = [];
for (const sv of soins) {
  const f = parPrestation.get(sv.id);
  if (!f) continue;
  for (const d of defautsDeLaFiche({ ...f, pour: [sv.id] })) rapport.push(`DEFAUT : ${d}`);
  const contenu = {};
  for (const r of RUBRIQUES) {
    contenu[r] = (f.contenu[r] ?? []).map((l, i) => ({ id: `${prefixe[r]}-${i + 1}`, ...l }));
  }
  const categorie = categories.find((c) => c.id === sv.categoryId);
  fiches.push({
    serviceId: sv.id,
    ...(codeNu(sv.code) ? { code: codeNu(sv.code) } : {}),
    /* Une fiche écrite pour plusieurs prestations porte le nom de chacune. */
    titre: f.pour.length > 1 || f.famille === '(enchainement)' ? sv.name : f.titre,
    brouillon: contenu,
    /* Pour la page de validation, pas pour le document. */
    _prestation: sv.name,
    _atelier: categorie?.fon ?? sv.categoryId,
    _ordreAtelier: categorie?.order ?? 0,
    _dureeMin: sv.durationMin ?? 0,
    _famille: f.famille.replace(/\.mjs$/, ''),
  });
}

mkdirSync(sortie, { recursive: true });
writeFileSync(path.join(sortie, 'fiches.json'), JSON.stringify(fiches, null, 1));
const compte = (source) => fiches.reduce((n, f) => n + RUBRIQUES.reduce((k, r) => k + f.brouillon[r].filter((l) => l.source === source).length, 0), 0);
const aValider = fiches.reduce((n, f) => n + RUBRIQUES.reduce((k, r) => k + f.brouillon[r].filter((l) => !!l.aValider).length, 0), 0);
const bilan = [
  `${soins.length} soins au catalogue, ${fiches.length} fiches (${fiches.length - enchainements} ecrites, ${enchainements} d enchainement), ${sansFiche.length} sans fiche.`,
  `Lignes : catalogue ${compte('catalogue')}, laboratoire ${compte('laboratoire')}, maison ${compte('maison')}, notice ${compte('notice')}, pratique ${compte('pratique')} ; ${aValider} a valider.`,
  rapport.length ? `${rapport.length} remarque(s) :` : 'Aucune remarque.',
  ...rapport,
];
writeFileSync(path.join(sortie, 'rapport.txt'), bilan.join('\n'));
console.log(bilan.slice(0, 40).join('\n'));
process.exit(rapport.some((r) => /^(DEFAUT|SANS FICHE|.* a deja une fiche|.* absente du catalogue)/.test(r)) ? 1 : 0);
