import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

/* LE SCEAU, EPROUVE · 22 novembre 2026.
   « I want to give to another session the build for the last two maquette
   that was made : devis en direct et le sceau de la seance. » Le Sceau,
   lot 1 : le direct et le sceau sur la page Regler qui existe. La regle vit
   dans src/shared/le-sceau-pur.ts ; la fonction regler-la-seance en porte la
   copie (roger-copie-serveur.mjs) et un `action: 'sceau'`.
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PUR = 'src/shared/le-sceau-pur.ts';
const FN = 'supabase/functions/regler-la-seance/index.ts';
const REGLER = 'src/shared/regler-la-seance-pur.ts';
const APP = 'src/apps/regler/App.tsx';
const SCEAU = 'src/ds/sceau.tsx';
const FIL = 'src/shared/le-fil-du-sceau.ts';
const TRONE = 'src/apps/trone/routes/clients/ReglementEnDirect.tsx';
const PANNES = [
  /* La règle */
  ['le geste peut dépasser ce qu elle doit', PUR, '  if (v > base) return { ok: false, raison: \'trop\' };', '  if (v > base * 10) return { ok: false, raison: \'trop\' };'],
  ['le pourcentage n a plus de plafond', PUR, '    if (v > PLAFOND_DU_GESTE_PCT) return { ok: false, raison: \'trop\' };', '    if (v > 100) return { ok: false, raison: \'trop\' };'],
  ['le geste s offre sur une note réglée', PUR, "  if (base <= 0) return { ok: false, raison: 'rien' };", "  if (base < 0) return { ok: false, raison: 'rien' };"],
  ['le sceau posé ne se voit plus', PUR, "  if (o.lien?.sceauLe) return 'regle';", "  if (o.lien?.payeLe) return 'regle';"],
  ['l argent reçu ne scelle plus', PUR, "  if (o.etat === 'reglee') return 'scelle';", "  if (o.etat === 'annule') return 'scelle';"],
  ['le fil ne porte plus le nom du jeton', PUR, 'export const filDuSceau = (jeton: string): string => `sceau-${String(jeton ?? \'\').trim()}`;', 'export const filDuSceau = (jeton: string): string => `maison-${String(jeton ?? \'\').trim()}`;'],
  ['le fil porte quelque chose', PUR, 'export const CHARGE_DU_FIL: Readonly<Record<string, never>> = Object.freeze({});', 'export const CHARGE_DU_FIL = Object.freeze({ prenom: \'Awa\', montant: 28000 }) as Readonly<Record<string, never>>;'],
  ['la maintenue dure un dixième de seconde', PUR, 'export const TENUE_DU_SCEAU_MS = 1100;', 'export const TENUE_DU_SCEAU_MS = 110;'],
  ['le sceau de la direction', PUR, "export const SCEAU_CUIVRE = 'assets/tampons/mnd-premium-cuivre.png';", "export const SCEAU_CUIVRE = 'assets/tampons/mnd-1-sceau.png';"],
  ['MTN par KkiaPay', PUR, "  { k: 'mtn', nom: 'MTN', rail: 'mtn', par: 'par MTN' },", "  { k: 'mtn', nom: 'MTN', rail: 'kkiapay', par: 'par MTN' },"],
  /* La page cliente */
  ['le bouton « Régler X » remis', APP, '<Sceau montantXof={total} disabled={ecran.k === \'paiement\' || mtnOccupe', '<button type="button" className="rg-regler" disabled={ecran.k === \'paiement\' || mtnOccupe'],
  ['la page n écoute plus le fil', APP, 'return ecouteLeFilDuSceau(jeton, () => { void relisEnDirect(); });', 'return () => undefined;'],
  ['la page ne dit plus le moyen au Trône', APP, 'void poseLeSceau(jeton, rail);', 'void 0;'],
  ['le dernier écran perd « Merci. »', APP, '<h2 className="rg-merci-titre">Merci.</h2>', '<h2 className="rg-merci-titre">C’est réglé</h2>'],
  ['le sceau part sans le doigt maintenu', SCEAU, 'minuteur.current = window.setTimeout(() => { minuteur.current = null; setTient(false); onTenue(); }, TENUE_DU_SCEAU_MS);', 'onTenue();'],
  ['le sceau ne s ouvre plus au clavier', SCEAU, '        onClick={(e) => { if (e.detail === 0) onTenue(); }}', '        onClick={() => undefined}'],
  ['le fil du téléphone reprend la session du poste', FIL, 'auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },', 'auth: {},'],
  ['le fil du téléphone écoute n importe quoi', FIL, "      c.on('broadcast', { event: SIGNAL_DU_SCEAU }, () => { if (vivant) onRelis(); });", "      c.on('broadcast', { event: '*' }, () => { if (vivant) onRelis(); });"],
  /* Le Trône */
  ['le Trône ne suit plus les cinq étapes', TRONE, '        {ETAPES_DU_FAUTEUIL.map((k) => {', '        {[].map((k: EtapeDuFauteuil) => {'],
  ['le Trône ne souffle plus', TRONE, '    souffleSurLeFilDuSceau(jeton);', '    void 0;'],
  ['le geste du Trône ne baisse plus la note', TRONE, '      globalDiscountXof: avant + lu.xof,', '      globalDiscountXof: avant,' ],
  ['le geste du Trône ne se retire plus', TRONE, '    const neuve: Invoice = { ...sans, globalDiscountXof: Math.max(0, avant - Number(geste.xof)) };', '    const neuve: Invoice = { ...sans, globalDiscountXof: Math.max(0, avant) };'],
  /* La fonction */
  ['le sceau n a plus de route', FN, "    if (b.action === 'sceau') return await sceau(req, b);\n", ''],
  ['le sceau ne se note plus sur le lien', FN, '  const lien = { ...d.lienDeReglement, sceauLe: new Date().toISOString(), moyen };', '  const lien = { ...d.lienDeReglement, moyen };'],
  /* Régler à deux */
  ['l invitée réutilise le jeton de la séance', FN, 'jetonDe(crypto.getRandomValues(new Uint8Array(LONGUEUR_DU_JETON)))', 'lien.jeton'],
  ['une séance réglée invite encore', FN, "  if (lien.payeLe) return json({ error: 'deja_reglee' }, 409);", ''],
  ['le prénom de l invitée n est plus borné', REGLER, "String(nom ?? '').replace(/\\s+/g, ' ').trim().slice(0, 18);", "String(nom ?? '');"],
  ['la page propose régler à deux à l invitée', APP, '            {!p.parInvitee && (', '            {true && ('],
  /* La sortie */
  ['la fonction accepte une place qu on ne lui a pas proposée', FN, "    if (!permises.some((x) => x.jour === jour && x.heure === heure)) return json({ error: 'place' }, 400);", ''],
  ['la page garde la place au lieu de la confirmer', APP, 'Confirmer cette place', 'Garder cette place'],
  ['les étoiles passent avant la place', APP, "        const etape = pr && !pr.reponse ? 'place' : (ecran.paye && !etoilesFaite ? 'etoiles' : 'merci');", "        const etape = ecran.paye && !etoilesFaite ? 'etoiles' : (pr && !pr.reponse ? 'place' : 'merci');"],
  /* Le QR */
  ['la page n offre plus le QR', APP, '          <QrSvg valeur={lienDeLInvitee}', '          <div valeur={lienDeLInvitee}'],
  /* Les étoiles d'un toucher */
  ['la fonction ne lit plus le jeton des étoiles', FN, "  const { data } = await admin.from('envois').select('data').eq('id', `env-${pieceId}-wa-avis`).limit(1);", '  const data: unknown[] = [];'],
  /* La Gamme */
  ['la gamme prend le prix de la page', FN, '    const ligne = { id, label: produit.nom, qty: 1, unitXof: produit.xof, discountPct: 0, produitId: produit.id };', '    const ligne = { id, label: produit.nom, qty: 1, unitXof: Number(b.prix) || 0, discountPct: 0, produitId: produit.id };'],
  ['la gamme vend deux fois le meme produit', FN, "    if (lignes.some((l) => l.id === id)) return json({ ok: true, deja: true });", ''],
  ['la page n a plus son etagere', APP, 'La Gamme · prendre un soin', 'La Gamme'],
  ['la fonction accepte n importe quel moyen', FN, "  if (!estUnJeton(jeton) || !MOYENS_DU_SCEAU.includes(moyen)) return json({ error: 'bad_request' }, 400);", '  if (!estUnJeton(jeton)) return json({ error: \'bad_request\' }, 400);'],
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

const dossier = path.join(racine, 'node_modules/.cache', `verifie-le-sceau-${process.pid}`);
const sortie = path.join(dossier, 'harnais.mjs');
mkdirSync(dossier, { recursive: true });
try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-le-sceau.harnais.ts')],
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
