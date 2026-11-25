import { build } from 'esbuild';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA PRESTATION EN CLAIR, ÉPROUVÉE — 25 novembre 2026.
   « Quand les clients reçoivent leurs rendez-vous ou leurs factures, ils ne
   savent pas que Rituel Sówà™ est le traitement anti-poux, ni que Le Souffle
   est un lavage » (Yéman). Chaque prestation porte `enClair` ; le juge
   `nomEtEnClair` (shared/en-clair-pur) le pose à côté du nom.
   Ce banc vérifie :
   · le juge : « Nom (mots en clair) », le nom seul sans mots ou quand le nom
     les dit déjà, les espaces tenus ; la recherche par le nom d'une ligne ;
   · la facture PDF : la ligne garde son nom écrit et dit ses mots à côté,
     avant la remise ; sans le crochet (le site), rien ne change ;
   · le réglage SQL : des mots courts, sans marque ni ™, en minuscule, sans
     tiret cadratin ni émoji ; la garde qui ne retouche pas un mot posé ; le repli ;
   · les branchements : Ma Couronne, la facture du Trône et celle du foyer,
     le rappel de la cloche, le Catalogue ;
   · les copies du juge dans les fonctions Edge, caractère pour caractère.
   `--prouve` plante des pannes dans une copie et exige que chacune fasse
   crier le banc.
   Lance : node scripts/verifie-en-clair.mjs [--prouve] */

const racine = path.resolve(import.meta.dirname, '..');
const lis = (rel) => readFileSync(path.join(racine, rel), 'utf8');
const d = mkdtempSync(path.join(tmpdir(), 'en-clair-'));
const SOURCE = 'src/shared/en-clair-pur.ts';
const PDF = 'src/shared/pdf-de-la-piece-pur.ts';
const SQL = 'supabase/reglage_les_prestations_en_clair_20261125.sql';
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u;
const MARQUES = /VÈKPÈ|SÍNSIN|FÍNFÍN|YÈKPÈ|GBÀTÀ|DÀNDÀN|KLƆKLƆ|KÒKÒ|GBÌGBÌ|GBÈJÍ|VÍVÍVÓ|WÈWÈ|ÀLÀLÀ|Sówà|Prélude|Souffle/iu;

const entre = (s, nom) => {
  const a = s.indexOf(`/* ⟨${nom}⟩ */`);
  const b = s.indexOf(`/* ⟨/${nom}⟩ */`);
  return a < 0 || b < 0 ? null : s.slice(a, b);
};

/* Les surfaces que lit une cliente : chacune doit passer par le juge. */
const BRANCHEMENTS = [
  ['Ma Couronne : les noms de ses rendez-vous', 'src/apps/couronne/Tabs.tsx', /\.map\(\(s\) => nomEtEnClair\(s\.name, s\.enClair\)\)/],
  ['Ma Couronne : ses rendez-vous, en liste', 'src/apps/couronne/MesRendezVous.tsx', /pourLaMaison \? s\.name : nomEtEnClair\(s\.name, s\.enClair\)/],
  ['Ma Couronne : le détail du rendez-vous', 'src/apps/couronne/MesRendezVous.tsx', /\{s \? nomEtEnClair\(s\.name, s\.enClair\) : t\('Rituel de la maison'\)\}/],
  ['Ma Couronne : l’onglet des rendez-vous', 'src/apps/couronne/RendezVousTab.tsx', /nomEtEnClair\(s\.name, s\.enClair\)/],
  ['Ma Couronne : le choix des rituels', 'src/apps/couronne/Booking.tsx', /mc-presta__name">\{nomEtEnClair\(s\.name, s\.enClair\)\}/],
  ['Ma Couronne : le récapitulatif', 'src/apps/couronne/Booking.tsx', /mc-recapcard__svcname">\{nomEtEnClair\(s\.name, s\.enClair\)\}/],
  ['la facture du Trône', 'src/apps/trone/routes/vente/pdf-de-la-piece.ts', /contenuDeLaLigne,\s*enClairDeLaLigne,\s*\}\);/],
  ['la facture du Trône : le catalogue d’aujourd’hui', 'src/apps/trone/routes/vente/pdf-de-la-piece.ts', /enClairDuLibelle\(l\.label, services\)/],
  ['la facture du foyer et le point', 'src/apps/trone/routes/vente/pdf-de-la-piece.ts', /nomEtEnClair\(l\.label, o\.enClairDe\?\.\(l\)\)/],
  ['la facture du foyer, envoyée', 'src/apps/trone/routes/vente/envoi-de-la-piece.ts', /nomDe,\s*enClairDe: enClairDeLaLigne,/],
  ['le point du compte, envoyé', 'src/apps/trone/routes/vente/envoi-de-la-piece.ts', /contenuDe: contenuDeLaLigne,\s*enClairDe: enClairDeLaLigne,/],
  ['le point, en fenêtre', 'src/apps/trone/routes/vente/FenetreDuPoint.tsx', /enClairDe: enClairDeLaLigne/],
  ['le rappel de la cloche', 'src/apps/trone/routes/clients/_shared.tsx', /rituels: apptServices\(a, byId\)\.map\(\(x\) => nomEtEnClair\(x\.name, x\.enClair\)\)/],
  ['le Catalogue : le champ', 'src/apps/trone/routes/vente/Catalogue.tsx', /enClair: svcForm\.enClair\.replace\(\/\\s\+\/g, ' '\)\.trim\(\) \|\| undefined/],
  /* Le second lot, le même jour : les messages et la page de règlement. */
  ['Ma Couronne : son reçu', 'src/apps/couronne/RituelEnCours.tsx', /nomEtEnClair\(l\.label, enClairDuLibelle\(l\.label, services\)\)/],
  ['rdv_a_confirmer (une demande du site)', 'supabase/functions/demande-submit/index.ts', /return s\?\.name \? nomEtEnClair\(s\.name, s\.enClair\) : sid;/],
  ['proposition_rituel', 'supabase/functions/confirmation-rdv/index.ts', /nomEtEnClair\(String\(r\.data\?\.name \?\? ''\)\.split\(' · '\)\[0\], r\.data\?\.enClair\)/],
  ['reprise_proposee (la relance à trois jours)', 'supabase/functions/rappels-j1/index.ts', /nomEtEnClair\(String\(r\.data\?\.name \?\? ''\)\.split\(' · '\)\[0\], r\.data\?\.enClair\)/],
  ['l’aperçu du Trône dit comme proposition_rituel', 'src/apps/trone/routes/vente/SonProchainRituel.tsx', /\.map\(\(s\) => nomEtEnClair\(s\.name\.split\(' · '\)\[0\], s\.enClair\)\)/],
  ['« C’est réservé » de Perle', 'supabase/functions/whatsapp-automate/index.ts', /return nom \? nomEtEnClair\(nom, enClairDuGeste\.get\(id\)\) : '';/],
  ['la page de règlement, une tête', 'supabase/functions/regler-la-seance/index.ts', /page: await avecLesMotsEnClair\(pageDuLien\(/],
  ['la page de règlement, le foyer', 'supabase/functions/regler-la-seance/index.ts', /page: await avecLesMotsEnClair\(pageDuFoyer\(/],
];
/* Les fonctions qui portent la copie du juge. */
const FONCTIONS_AVEC_COPIE = ['demande-submit', 'confirmation-rdv', 'rappels-j1', 'whatsapp-automate', 'regler-la-seance'];

async function charge(sources, nom) {
  const dossier = path.join(d, nom);
  for (const [rel, texte] of Object.entries(sources)) {
    const f = path.join(dossier, rel);
    const { mkdirSync } = await import('node:fs');
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, texte);
  }
  const entree = path.join(dossier, 'entree.ts');
  writeFileSync(entree, `export * from './${SOURCE.replace(/\.ts$/, '')}';\nexport { donneesDuPdfDeLaPiece } from './${PDF.replace(/\.ts$/, '')}';\n`);
  const out = path.join(dossier, 'entree.mjs');
  await build({ entryPoints: [entree], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
}

/* Les sources que le PDF importe, recopiées telles quelles dans le dossier
   d'essai (le banc éprouve une copie, jamais le dépôt). */
function sourcesDuPdf() {
  const vus = {};
  const suit = (rel) => {
    if (vus[rel] !== undefined) return;
    const texte = lis(rel);
    vus[rel] = texte;
    for (const m of texte.matchAll(/from '(\.[^']+)'/g)) {
      const cible = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        if (existsSync(path.join(racine, cible + ext))) { suit(cible + ext); break; }
      }
    }
  };
  suit(PDF);
  suit(SOURCE);
  return vus;
}

function epreuves(m, textes) {
  const echecs = [];
  const dit = (nom, attendu, obtenu) => {
    if (JSON.stringify(attendu) !== JSON.stringify(obtenu)) echecs.push(`${nom} : attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`);
  };
  const vrai = (nom, ok) => { if (!ok) echecs.push(nom); };

  /* ── Le juge ── */
  dit('le nom puis ses mots en clair', 'Rituel Sówà™ (traitement anti-poux)', m.nomEtEnClair('Rituel Sówà™', 'traitement anti-poux'));
  dit('les espaces tenus', 'KLƆKLƆ™ Essentiel · Le Souffle (lavage doux)', m.nomEtEnClair('  KLƆKLƆ™ Essentiel ·  Le Souffle ', ' lavage   doux '));
  dit('sans mots, le nom seul', 'Démontage ancienne coiffure', m.nomEtEnClair('Démontage ancienne coiffure', ''));
  dit('sans mots (absent), le nom seul', 'Démontage ancienne coiffure', m.nomEtEnClair('Démontage ancienne coiffure', undefined));
  dit('le nom qui les dit déjà ne les redit pas', 'Rituel Express · lavage et retouche', m.nomEtEnClair('Rituel Express · lavage et retouche', 'Lavage et retouche'));
  dit('sans accents ni majuscules pour le dire', 'Pendant le rituel · pédicure', m.nomEtEnClair('Pendant le rituel · pédicure', 'PEDICURE'));
  dit('enClairDe : propre', 'lavage doux', m.enClairDe({ enClair: '  lavage   doux ' }));
  dit('enClairDe : rien', '', m.enClairDe({ enClair: 42 }));
  const cat = [{ name: 'Rituel Sówà™', enClair: 'traitement anti-poux' }, { name: 'Couronne Cocon', enClair: '' }, { name: 'KLƆKLƆ™ Essentiel · Le Souffle', enClair: 'lavage doux' }];
  dit('la ligne retrouve sa prestation par son nom', 'traitement anti-poux', m.enClairDuLibelle('Rituel Sówà™', cat));
  dit('le nom de la ligne, espaces tenus', 'lavage doux', m.enClairDuLibelle('KLƆKLƆ™ Essentiel ·  Le Souffle', cat));
  dit('une ligne sans prestation de ce nom', '', m.enClairDuLibelle('Règlement · Rituel Sówà™', cat));
  dit('une prestation sans mots', '', m.enClairDuLibelle('Couronne Cocon', cat));

  /* ── La facture PDF ── */
  const piece = {
    id: 'f1', kind: 'facture', number: 'F-2026-0001', date: '2026-11-25', clientId: 'c1', status: 'payée', payment: 'Espèces',
    lines: [
      { label: 'Rituel Sówà™', qty: 1, unitXof: 17000, discountPct: 0 },
      { label: 'KLƆKLƆ™ Essentiel · Le Souffle', qty: 1, unitXof: 8000, discountPct: 10 },
      { label: 'Démontage ancienne coiffure', qty: 1, unitXof: 3000, discountPct: 0 },
    ],
    payments: [],
  };
  const ctx = { maison: 'Maison MND', devise: 'XOF', nomPourLePdf: 'Alma', appel: 'Alma', contenuDeLaLigne: () => [] };
  let avec = null, sans = null;
  try {
    avec = m.donneesDuPdfDeLaPiece(piece, { ...ctx, enClairDeLaLigne: (l) => m.enClairDuLibelle(l.label, cat) });
    sans = m.donneesDuPdfDeLaPiece(piece, ctx);
  } catch (e) { echecs.push(`la facture PDF ne se construit pas : ${e.message}`); }
  if (avec && sans) {
    dit('la facture dit les mots en clair', 'Rituel Sówà™ (traitement anti-poux)', avec.lines[0].label);
    vrai('la facture dit les mots avant la remise', /^KLƆKLƆ™ Essentiel · Le Souffle \(lavage doux\) · remise −10 %$/u.test(avec.lines[1].label));
    dit('une ligne sans mots reste telle quelle', 'Démontage ancienne coiffure', avec.lines[2].label);
    dit('sans le crochet (le site), rien ne change', 'Rituel Sówà™', sans.lines[0].label);
    dit('les montants ne bougent pas', sans.lines.map((l) => l.total), avec.lines.map((l) => l.total));
  }

  /* ── Le réglage SQL ── */
  const sql = textes[SQL];
  const valeurs = [...sql.matchAll(/^\s+\(\$t\$([^$]+)\$t\$, \$t\$([^$]+)\$t\$\)/gm)].map((x) => [x[1], x[2]]);
  vrai('le réglage porte des mots en clair', valeurs.length >= 80);
  const ids = valeurs.map(([id]) => id);
  vrai('le réglage ne pose pas deux fois la même prestation', new Set(ids).size === ids.length);
  for (const [id, mots] of valeurs) {
    vrai(`${id} : des mots courts (60 au plus)`, mots.length > 0 && mots.length <= 60);
    vrai(`${id} : sans marque ni ™`, !MARQUES.test(mots) && !/[™®]/u.test(mots));
    vrai(`${id} : en minuscule`, mots[0] === mots[0].toLocaleLowerCase('fr') || /^[A-Z]{2}/.test(mots));
    vrai(`${id} : sans tiret cadratin ni émoji`, !/[—–]/u.test(mots) && !EMOJI.test(mots));
  }
  for (const [id, attendu] of [['1740l5ysxj', 'traitement anti-poux'], ['sv-plt-05-ess-c', 'lavage doux']]) {
    dit(`les deux exemples de Yéman : ${id}`, attendu, valeurs.find(([i]) => i === id)?.[1]);
  }
  vrai('la garde : un mot déjà posé ne se retouche pas', /and coalesce\(c\.data->>'enClair', ''\) = '';/.test(sql));
  vrai('le repli avant tout', sql.indexOf('create table if not exists public.repli_catalog_services_20261125_en_clair') >= 0
    && sql.indexOf('repli_catalog_services_20261125_en_clair') < sql.indexOf('update public.catalog_services'));
  vrai('le réglage n’écrit que le champ enClair', /set data = jsonb_set\(c\.data, '\{enClair\}', to_jsonb\(v\.en_clair\)\),/.test(sql));

  /* ── Les branchements ── */
  for (const [nom, rel, motif] of BRANCHEMENTS) vrai(`branché : ${nom}`, motif.test(textes[rel]));

  /* ── Les copies dans les fonctions Edge ── */
  const juge = entre(textes[SOURCE], 'en-clair');
  vrai('le juge est entre ses repères', !!juge);
  for (const f of FONCTIONS_AVEC_COPIE) vrai(`${f} porte la copie du juge`, entre(textes[`supabase/functions/${f}/index.ts`] ?? '', 'en-clair') !== null);
  for (const [rel, texte] of Object.entries(textes)) {
    if (!rel.startsWith('supabase/functions/')) continue;
    const copie = entre(texte, 'en-clair');
    if (copie !== null) vrai(`la copie de ${rel} est celle du dépôt`, copie === juge);
  }
  return echecs;
}

function lesTextes() {
  const t = { [SOURCE]: lis(SOURCE), [PDF]: lis(PDF), [SQL]: lis(SQL) };
  for (const [, rel] of BRANCHEMENTS) t[rel] = lis(rel);
  for (const f of readdirSync(path.join(racine, 'supabase/functions'), { withFileTypes: true })) {
    if (!f.isDirectory()) continue;
    const rel = `supabase/functions/${f.name}/index.ts`;
    if (existsSync(path.join(racine, rel))) t[rel] = lis(rel);
  }
  return t;
}

async function passe(textes, nom) {
  const sources = { ...sourcesDuPdf(), [SOURCE]: textes[SOURCE], [PDF]: textes[PDF] };
  const m = await charge(sources, nom);
  return epreuves(m, textes);
}

const PANNES = [
  ['sans parenthèses', SOURCE, '`${n} (${e})`', '`${n} ${e}`'],
  ['le nom qui les dit les redit', SOURCE, 'return sansAccentsEnClair(n).includes(sansAccentsEnClair(e)) ? n : `${n} (${e})`;', 'return `${n} (${e})`;'],
  ['la ligne cherchée sans tenir ses espaces', SOURCE, "x.name.replace(/\\s+/g, ' ').trim() === l", 'x.name === libelle'],
  ['la facture oublie les mots', PDF, 'const nom = nomEtEnClair(l.label, ctx.enClairDeLaLigne?.(l));', 'const nom = l.label;'],
  ['les mots après la remise', PDF, "label: remise ? `${nom} · remise ${remise}` : nom,", "label: remise ? `${l.label} · remise ${remise}` : nom,"],
  ['le Trône ne tend pas le crochet', 'src/apps/trone/routes/vente/pdf-de-la-piece.ts', '    contenuDeLaLigne,\n    enClairDeLaLigne,\n  });', '    contenuDeLaLigne,\n  });'],
  ['la cloche oublie les mots', 'src/apps/trone/routes/clients/_shared.tsx', 'map((x) => nomEtEnClair(x.name, x.enClair))', 'map((x) => x.name)'],
  ['Ma Couronne oublie les mots', 'src/apps/couronne/Tabs.tsx', '.map((s) => nomEtEnClair(s.name, s.enClair))', '.map((s) => s.name)'],
  ['une copie du juge s’écarte', 'supabase/functions/regler-la-seance/index.ts', "`${n} (${e})`", "`${n} — ${e}`"],
  ['Perle oublie les mots', 'supabase/functions/whatsapp-automate/index.ts', 'return nom ? nomEtEnClair(nom, enClairDuGeste.get(id)) : \'\';', 'return nom ?? \'\';'],
  ['la page de règlement oublie les mots', 'supabase/functions/regler-la-seance/index.ts', 'page: await avecLesMotsEnClair(pageDuLien(', 'page: await (pageDuLien('],
  ['la garde du réglage tombe', SQL, "   and coalesce(c.data->>'enClair', '') = '';", ';'],
  ['un mot avec sa marque', SQL, '$t$lavage doux$t$', '$t$KLƆKLƆ™ lavage doux$t$'],
];

let code = 0;
try {
  const textes = lesTextes();
  const echecs = await passe(textes, 'depot');
  if (echecs.length) {
    console.error(`ÉCHEC — ${echecs.length} épreuve(s) :`);
    for (const e of echecs) console.error(`  · ${e}`);
    code = 1;
  } else {
    console.log('La prestation en clair : toutes les épreuves passent.');
  }
  if (process.argv.includes('--prouve') && code === 0) {
    let crie = 0;
    for (const [i, [nom, rel, brutAvant, brutApres]] of PANNES.entries()) {
      /* Un fichier écrit sous Windows porte des \r\n : la panne les suit. */
      const crlf = !textes[rel].includes(brutAvant) && textes[rel].includes(brutAvant.replace(/\n/g, '\r\n'));
      const avant = crlf ? brutAvant.replace(/\n/g, '\r\n') : brutAvant;
      const apres = crlf ? brutApres.replace(/\n/g, '\r\n') : brutApres;
      if (!textes[rel].includes(avant)) { console.error(`  panne introuvable : ${nom}`); code = 1; continue; }
      const t = { ...textes, [rel]: textes[rel].replace(avant, apres) };
      let e;
      try { e = await passe(t, `panne-${i}`); } catch (err) { e = [String(err)]; }
      if (e.length) crie++; else { console.error(`  la panne « ${nom} » passe sans bruit`); code = 1; }
    }
    console.log(`--prouve : ${crie}/${PANNES.length} pannes font crier le banc.`);
  }
} finally {
  rmSync(d, { recursive: true, force: true });
}
process.exit(code);
