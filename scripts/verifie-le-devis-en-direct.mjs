import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

/* LE DEVIS EN DIRECT, EPROUVE · 22 novembre 2026.
   « Le meme systeme de connexion automatique entre le Trone et les portables
   de nos clients pour faire les devis […] des devis instantanes, avec
   Valider, Oui j accepte le devis, Oui je confirme ma place » (Yeman).
   Maquette FCTFNSr748gq1ecEHxhDMj, lot 1. La regle vit dans
   src/shared/devis-en-direct-pur.ts, et le cas du fauteuil dans
   src/shared/devis-remis-pur.ts (la regle du 17 novembre ne se leve pas).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier, et le
   banc doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PUR = 'src/shared/devis-en-direct-pur.ts';
const REMISE = 'src/shared/devis-remis-pur.ts';
const PIECE = 'src/shared/devis-en-direct.ts';
const PONT = 'public/payer.html';
const PAGE_DEVIS = 'src/apps/devis/App.tsx';
const PANNES = [
  /* Les prix et les durées */
  ['le prix ignore le calibre', PUR, 'export const prixDuModele = (baseXof: number, coef: number): number => arrondiDuDevis((Number(baseXof) || 0) * (Number(coef) || 1));', 'export const prixDuModele = (baseXof: number): number => arrondiDuDevis(Number(baseXof) || 0);'],
  ['le prix se dit au franc pres', PUR, 'export const ARRONDI_DU_DEVIS_XOF = 500;', 'export const ARRONDI_DU_DEVIS_XOF = 1;'],
  ['la duree ignore le calibre', PUR, '  Math.max(0, Math.round(((Number(minutes) || 0) * (Number(durCoef) || 1)) / 15) * 15);', '  Math.max(0, Math.round(Number(minutes) || 0));'],
  ['le calibre deborde sa borne', PUR, '    if (b.maxLocks === null || locks <= b.maxLocks) {', '    if (b.maxLocks === null || locks < b.maxLocks) {'],
  ['la premiere tranche commence a zero', PUR, '      const min = i === 0 ? 1 : Number(bands[i - 1].maxLocks ?? 0) + 1;', '      const min = i === 0 ? 0 : Number(bands[i - 1].maxLocks ?? 0) + 1;'],
  /* Les lignes */
  ['la consultation se deduit deux fois', PUR, "  return x > 0 ? { label, xof: -x, genre: 'consultation' } : null;", "  return x > 0 ? { label, xof: -2 * x, genre: 'consultation' } : null;"],
  ['le total passe sous zero', PUR, 'export const totalDuDevis = (lignes: readonly LigneDuDevisEnDirect[]): number =>\n  Math.max(0, lignes.reduce((s, l) => s + (Math.round(Number(l.xof) || 0)), 0));', 'export const totalDuDevis = (lignes: readonly LigneDuDevisEnDirect[]): number =>\n  lignes.reduce((s, l) => s + (Math.round(Number(l.xof) || 0)), 0);'],
  ['l acompte ignore le taux', PUR, '  Math.max(0, Math.round((Math.max(0, Math.round(Number(totalXof) || 0)) * Math.max(0, Math.min(100, Number(pct) || 0))) / 100));', '  Math.max(0, Math.round(Number(totalXof) || 0));'],
  /* Les trois oui */
  ['les mots des trois oui changent', PUR, "  valider: 'Valider',", "  valider: 'Je valide',"],
  ['on saute l acceptation', PUR, "  if (etape === 'devis' && geste === 'valider') return 'valide';", "  if (etape === 'devis' && (geste === 'valider' || geste === 'accepter')) return geste === 'accepter' ? 'accepte' : 'valide';"],
  ['un geste se rejoue', PUR, "  if (etape === 'valide' && geste === 'accepter') return 'accepte';", "  if ((etape === 'valide' || etape === 'accepte') && geste === 'accepter') return 'accepte';"],
  ['une piece payee n est plus scellee', PUR, "  if (payee) return 'scelle';", "  if (payee) return 'place';"],
  ['la place confirmee se dit tenue', PUR, "  e === 'confirmee' ? 'confirmée' : e === 'liberee' ? 'libérée' : 'tenue';", "  e === 'liberee' ? 'libérée' : 'tenue';"],
  /* La remise au fauteuil */
  ['la marque du fauteuil ne sert plus', REMISE, "  if (!d.auFauteuil?.le) return { ok: false, raison: 'Ce devis n’est pas marqué au fauteuil : il se remet au rendez-vous.' };", "  if (!d.auFauteuil?.le) return { ok: true, par: 'fauteuil' };"],
  ['n importe quel rendez-vous ouvre la porte', REMISE, "  if (duJour.length === 0) return { ok: false, raison: 'Elle n’a pas de rendez-vous aujourd’hui : le devis attend son rendez-vous.' };", "  if (duJour.length === -1) return { ok: false, raison: 'Elle n’a pas de rendez-vous aujourd’hui : le devis attend son rendez-vous.' };"],
  ['un rendez-vous annule ouvre la porte', REMISE, "  const duJour = ctx.rdvs.filter((a) => a.status !== 'annulé' && jourDeLInstant(a.date) === ctx.aujourdhui && tetes.includes(a.clientId));", "  const duJour = ctx.rdvs.filter((a) => jourDeLInstant(a.date) === ctx.aujourdhui && tetes.includes(a.clientId));"],
  /* La pièce et la page */
  ['le modèle conseillé est ignoré', PIECE, '  const m = o.modeles.find((x) => x.id === c?.modele) ?? o.modeles.find((x) => x.id === o.modeleConseille) ?? o.modeles[0];', '  const m = o.modeles.find((x) => x.id === c?.modele) ?? o.modeles[0];'],
  ['la consultation n est plus déduite', PIECE, '  const deduite = Math.min(Math.max(0, Math.round(brut)), Math.max(0, Math.round(Number(consultationRegleeXof) || 0)));', '  const deduite = 0;'],
  ['l option incluse n est plus offerte', PIECE, "discountPct: x.etat === 'incluse' ? 100 : 0", 'discountPct: 0'],
  ['la page donne le nom de famille', PIECE, "    prenom: String(o.prenom ?? '').trim().replace(/\\s+/g, ' ') || String(d.clientName ?? '').trim().split(/\\s+/)[0] || '',", "    prenom: String(d.clientName ?? ''),"],
  ['l etat du devis oublie l acceptation', PIECE, "  if (l.accepteLe || d.status === 'acceptée') return 'accepte';", "  if (l.placeLe) return 'accepte';"],
  /* La page cliente et son pont */
  ['le pont envoie le devis vers la page du reglement', PONT, "location.replace('devis.html?d=' + dj[1]);", "location.replace('regler.html?r=' + dj[1]);"],
  ['le deuxieme oui change de mot', PAGE_DEVIS, '            Oui, j’accepte le devis', '            J’accepte'],
  ['le dernier ecran ne signe plus la Maison', PAGE_DEVIS, '>Maison MND</p>', '>La Maison</p>'],
];
const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout, propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((x) => x[1]))];
  const gardes = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const avant = new Map(fichiers.map((f) => [f, md5(f)]));
  let muettes = 0;
  let absentes = 0;
  try {
    for (const [nom, f, a, b] of PANNES) {
      const brut = gardes.get(f).toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`ABSENTE  ${nom} (le texte a remettre n est plus dans ${f})`); absentes++; continue; }
      const neuf = texte.replace(a, b);
      writeFileSync(path.join(racine, f), crlf ? neuf.replace(/\n/g, '\r\n') : neuf);
      const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
      writeFileSync(path.join(racine, f), gardes.get(f));
      if (r.status === 0) { console.log(`MUETTE   ${nom}`); muettes++; } else console.log(`CRIEE    ${nom}`);
    }
  } finally {
    for (const [f, b] of gardes) writeFileSync(path.join(racine, f), b);
  }
  const intacts = fichiers.every((f) => md5(f) === avant.get(f));
  console.log(`\n${PANNES.length - muettes - absentes}/${PANNES.length} fautes criees${intacts ? ', fichiers rendus intacts' : ', FICHIERS ALTERES'}.`);
  process.exit(muettes || absentes || !intacts ? 1 : 0);
}

const dossier = path.join(racine, 'node_modules/.cache', `verifie-le-devis-en-direct-${process.pid}`);
const sortie = path.join(dossier, 'harnais.mjs');
mkdirSync(dossier, { recursive: true });
try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-le-devis-en-direct.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
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
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
