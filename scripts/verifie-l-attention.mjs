import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* L'ATTENTION, EPROUVEE - 6 novembre 2026 (lots 2 et 3 de l'abonnement refait).
   `node scripts/verifie-l-attention.mjs` : le banc, dans un processus fils
   (le paquet s'ecrit sous node_modules/.cache et s'efface). Le vrai SQL se
   joue dans PGlite quand BANC_PGLITE nomme un dossier qui le porte
   (node_modules/@electric-sql/pglite) ; sans lui, cette partie se saute et
   le dit.
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. Les fautes marquees SQL ne crient qu'avec PGlite ou
   par le texte : lancez la preuve AVEC BANC_PGLITE. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PUR = 'src/shared/attentions-pur.ts';
const SQL = 'supabase/migrations/0170_l_attention.sql';
const PANNES = [
  ['un article a la carte au-dessus de 1 500 F', PUR, '    if (p < PRIX_A_LA_CARTE.min || p > PRIX_A_LA_CARTE.max) return', '    if (p < PRIX_A_LA_CARTE.min) return'],
  ['cinq articles proposes en fin de rendez-vous', PUR, 'export const PROPOSES_EN_FIN_DE_RDV = 3;', 'export const PROPOSES_EN_FIN_DE_RDV = 5;'],
  ['deux fois le meme present a la meme personne', PUR, "a.niveau === (or ? 'or' : 'offert') && possible(a) && dernierRecu(a.id) < 0);", "a.niveau === (or ? 'or' : 'offert') && possible(a));"],
  ['un article ecarte lui est propose', PUR, '    !a.retire && !histoire.ecartes.includes(a.id) && (typeof', '    !a.retire && (typeof'],
  ['une piece deja promise est promise deux fois', PUR, "(typeof a.reserve !== 'number' || a.reserve > (promis.get(a.id) ?? 0));", "(typeof a.reserve !== 'number' || a.reserve >= 0);"],
  ['un sceau d or a la lune', PUR, "  s.mode === 'pack' && s.rang !== null && s.total !== null", '  s.rang !== null && s.total !== null'],
  ['le mot suppose un genre', PUR, '  return `Merci de nous confier votre couronne${a}. Elle garde son rythme, et nous y veillons avec vous.`;', '  return `Vous êtes revenue${a}. Merci.`;'],
  ['la remise ne fige pas les noms', PUR, '      recu: { ...(boire ? { boire } : {}), ...(gout ? { gout } : {}), ...(present ? { present } : {}) },', '      recu: {},'],
  ['la remise ne sort rien de la reserve', PUR, '? { ...a, reserve: Math.max(0, a.reserve - 1) } : a)),', '? { ...a } : a)),'],
  ['la veille compte un panier non valide', PUR, "!!p && p.etat === 'valide' && !p.remiseLe)", '!!p && !p.remiseLe)'],
  ['elle lit un panier seulement propose', PUR, "p.clientId === o.clientId && p.etat === 'valide' && !o.annules.includes(p.apptId)", 'p.clientId === o.clientId && !o.annules.includes(p.apptId)'],
  ['elle lit le present d un panier scelle', PUR, "    return { ...tete, etat: 'scellee', arrivee: !!p.arriveeLe, ...(indice ? { indice } : {}) };", "    return { ...tete, etat: 'scellee', arrivee: !!p.arriveeLe, present: p.present, ...(indice ? { indice } : {}) } as AttentionLue;"],
  ['un prix suppose dans les articles dictes', PUR, "  { nom: 'La Béninoise bien glacée', rayon: 'boire', niveau: 'carte', reserve: 0 },", "  { nom: 'La Béninoise bien glacée', rayon: 'boire', niveau: 'carte', prixXof: 1000, reserve: 0 },"],
  ['SQL : une table lisible par une cliente', SQL, "for select to authenticated using (public.is_staff())', t);", "for select to authenticated using (public.is_staff() or public.est_ma_tete(data->>''clientId''))', t);"],
  ['SQL : le serveur rend la boisson d un panier scelle', SQL, "when n = 1 then jsonb_build_object('etat', 'scellee', 'arrivee', (d ? 'arriveeLe'))", "when n = 1 then jsonb_build_object('etat', 'scellee', 'arrivee', (d ? 'arriveeLe'), 'boire', d->>'boire')"],
  ['SQL : le serveur rend un panier non valide', SQL, "     where p.data->>'etat' = 'valide'\n", '     where true\n'],
  ['SQL : le serveur rend le panier d une autre', SQL, "       and public.est_ma_tete(coalesce(p.data->>'clientId', ''))\n", ''],
  ['SQL : le serveur rend le panier d une seance annulee', SQL, "       and not exists (select 1 from public.appointments a where a.id = p.id and a.data->>'status' = 'annulé')\n", ''],
  ['SQL : la fonction reste ouverte a anon', SQL, 'revoke all on function public.mes_attentions(text) from public, anon;', '-- (ouverte)'],
  ['Ma Couronne embarque les paniers de la Maison', 'src/apps/couronne/MesAttentions.tsx', "import { DENTELE } from './sceau';", "import { DENTELE } from './sceau';\nimport { paniersDAttentionStore } from '../../shared/attentions';\nvoid paniersDAttentionStore;"],
  ['Ma Couronne embarque la liste des presents', 'src/apps/couronne/MesAttentions.tsx', "import type { AttentionLue } from '../../shared/attentions-pur';", "import { ARTICLES_DICTES, type AttentionLue } from '../../shared/attentions-pur';\nvoid ARTICLES_DICTES;"],
  ['le pli disparait de l accueil', 'src/apps/couronne/Abonnee.tsx', '      <PliDeLAttention teteId={releve.clientId} prenom={prenom} />\n', ''],
  ['le pli suppose un genre', 'src/apps/couronne/MesAttentions.tsx', "t('Bienvenue à la Maison MND. Votre attention vous est remise au fauteuil, avec sa carte.')", "t('Vous êtes arrivée. Votre attention vous est remise au fauteuil, avec sa carte.')"],
  ['une fin de carnet invisible', PUR, "    if (s && estLeSceauDOr({ mode: 'pack', rang: s.rang, total: s.total })) {", '    if (s && s.rang === 0) {'],
  ['une abonnee avec rendez-vous dite sans rendez-vous', PUR, "    if (c.etat !== 'en-cours' || !c.sub.clientId || prochaineSeance(c, jour)) continue;", "    if (c.etat !== 'en-cours' || !c.sub.clientId) continue;"],
  ['le panier remis se dit au feminin', PUR, 'return `Panier servi et remis${', 'return `Servie et remise${'],
  ['un article offert recoit un produit', 'src/shared/attentions.ts', "  if (a.niveau !== 'carte' || a.prixXof === undefined || pourquoiPasCetArticle(a)) return a;\n  const prixXof = a.prixXof;", "  if (a.niveau === 'or') return a;\n  const prixXof = a.prixXof ?? 0;"],
  ['la categorie des attentions s ouvre aux vitrines', 'src/shared/attentions.ts', "label: 'À la carte, en fin de rendez-vous', enabled: false, produits: true,", "label: 'À la carte, en fin de rendez-vous', enabled: true, produits: true,"],
  ['la vente ne sort rien de la reserve', 'src/shared/attentions.ts', "    ? { ...a, reserve: Math.max(0, a.reserve - (vendus.get(a.produitId) ?? 0)) } : a)));", '    ? { ...a } : a)));'],
  ['les articles dictes se posent deux fois', 'src/shared/attentions.ts', '  if (deja) return 0;\n', ''],
  ['l encaissement ne note plus la vente', 'src/apps/trone/routes/clients/actions.tsx', '      sortLesArticlesVendus(lignesGamme);\n', ''],
  ['Avant de partir disparait de l encaissement', 'src/apps/trone/routes/clients/actions.tsx', '            <AvantDePartir branchId={branch.id} produits={produitsBranche} panier={panier} auPanier={auPanier} currency={currency} />\n', ''],
  ['un article au-dessus de 1 500 F se propose a l encaissement', 'src/apps/trone/routes/clients/AvantDePartir.tsx', ' && x.produit.priceXof <= PRIX_A_LA_CARTE.max),', '),'],
  ['le panier disparait de la fiche du rendez-vous', 'src/apps/trone/routes/clients/SeanceDeLaFormule.tsx', '      {s.compte && <PanierDeLaSeance apptId={frais.id} />}\n', ''],
  ['Arrivee possible sur un panier non valide', 'src/apps/trone/routes/clients/PanierDeLaSeance.tsx', "{panier && temps === 'pret' && (", '{panier && ('],
  ['l ecran ne s ouvre plus sur aujourd hui', 'src/apps/trone/routes/equipe/Abonnements.tsx', "useState<Tab>('jour')", "useState<Tab>('moteur')"],
  ['les paniers restent sur un poste deconnecte', 'src/shared/auth.ts', "  'mnd_attention_articles', 'mnd_attention_paniers', 'mnd_attention_reglages',\n", ''],
  ['l onglet Les attentions disparait', 'src/apps/trone/routes/equipe/Abonnements.tsx', "{ k: 'attentions', l: 'Les attentions' }, ", ''],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', `verifie-l-attention-${process.pid}`);
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-l-attention.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', loader: { '.css': 'empty' },
      external: ['esbuild', '@electric-sql/pglite'],
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' }, setInterval() { return 0; }, clearInterval() {} };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout, propre.stderr); process.exit(1); }
  if (/^SAUTE 3/m.test(propre.stdout)) console.log('ATTENTION : PGlite absent, le vrai SQL ne se joue pas ; les fautes SQL ne crient que par le texte.');
  const fichiers = [...new Set(PANNES.map((x) => x[1]))];
  const gardes = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const avant = new Map(fichiers.map((f) => [f, md5(f)]));
  let muettes = 0;
  try {
    for (const [nom, f, a, b] of PANNES) {
      const garde = gardes.get(f);
      const brut = garde.toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (texte.split(a).length !== 2) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, f), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, f), garde);
      }
    }
  } finally {
    for (const [f, g] of gardes) writeFileSync(path.join(racine, f), g);
  }
  const intacts = fichiers.every((f) => md5(f) === avant.get(f));
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exit(muettes === 0 && intacts ? 0 : 1);
}

const r = await lanceLeBanc();
process.stdout.write(r.stdout ?? '');
if (r.stderr) process.stdout.write(r.stderr);
process.exit(r.status ?? 1);
