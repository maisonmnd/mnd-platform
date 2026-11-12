import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

/* LE CHOIX DU MOYEN, ÉPROUVÉ · 12 novembre 2026 (maquette DnRyTv95…).
   La règle vit dans src/shared/choix-du-moyen-pur.ts ; elle est pure. Le banc
   lit aussi la fenêtre Encaisser, les panneaux MTN et FedaPay et la lecture
   de la santé (texte).
   `--prouve` : chaque faute est remise une à une dans le vrai fichier (copie
   gardée, restauration dans un finally, empreintes comparées), et le banc
   doit crier à chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PUR = 'src/shared/choix-du-moyen-pur.ts';
const ACTIONS = 'src/apps/trone/routes/clients/actions.tsx';
const FEDA = 'src/apps/trone/routes/vente/MndPay.tsx';
const CLIENT = 'src/shared/mnd-pay.ts';
const MTN = 'src/apps/trone/routes/clients/PayerParMtnAuTrone.tsx';
const SANTE = 'src/apps/trone/routes/clients/sante-des-moyens.ts';
const PANNES = [
  /* La règle */
  ['MoMoPay avant FedaPay', PUR, "  return ['mtn', 'fedapay', 'tapgo', 'momopay'];", "  return ['mtn', 'momopay', 'fedapay', 'tapgo'];"],
  ['un numero Moov commence par MTN', PUR, "  if (m && !estUnNumeroMtn(m)) return ['fedapay', 'tapgo', 'momopay'];", ''],
  ['la carte commence par le terminal', PUR, "  if (voie === 'carte') return ['carteFedapay', 'terminal'];", "  if (voie === 'carte') return ['terminal', 'carteFedapay'];"],
  ['le plafond MTN oublie', PUR, "    if (c.montantXof > PLAFOND_MTN_XOF) return 'au-delà de 2 000 000 F';", ''],
  ['MTN pris par plusieurs parts', PUR, "    if (c.plusieursParts) return 'MTN règle tout le reste en une seule fois';", ''],
  ['MTN en devise', PUR, "    if (c.enDevise) return 'MTN ne prend que des francs';", ''],
  ['FedaPay pris deux fois', PUR, "    if (c.fedapayPris) return 'une autre part passe déjà par FedaPay';", ''],
  ['Tap & Go propose eteint', PUR, "    if (r === 'tapgo' && !c.tapGoOuvert) return 'Tap & Go n’est pas ouvert';", ''],
  ['un prestataire en panne reste propose', PUR, '    if (!s.ouvert || !s.repond) return', '    if (!s.ouvert) return'],
  ['un moyen ferme se dit en panne', PUR, '  const enPanne = prestataires.filter((p) => c.sante[p].ouvert && !c.sante[p].repond);', '  const enPanne = prestataires.filter((p) => !c.sante[p].ouvert || !c.sante[p].repond);'],
  ['le moyen touche a la main gagne meme en panne', PUR, '  const pris = c.aLaMain && libres.some((l) => l.rail === c.aLaMain) ? c.aLaMain : null;', '  const pris = c.aLaMain ?? null;'],
  ['MoMoPay propose a un numero Moov', PUR, "  const premier = libres.find((l) => !(l.rail === 'momopay' && horsMtn))?.rail ?? null;", '  const premier = libres[0]?.rail ?? null;'],
  ['la panne oubliee aussitot', PUR, 'export const PANNE_RETENUE_MS = 10 * 60_000;', 'export const PANNE_RETENUE_MS = 0;'],
  ['la sante relue toutes les dix minutes', PUR, 'export const RELECTURE_DE_LA_SANTE_MS = 60_000;', 'export const RELECTURE_DE_LA_SANTE_MS = 600_000;'],
  ['la fonction muette vaut une reponse', PUR, "  if (o.lecture === null) return { ouvert: true, repond: false, pourquoi: `${nom} ne répond pas` };", ''],
  ['MTN ferme par la direction reste propose', PUR, "  if (p === 'mtn' && o.lecture && o.lecture.ouvert === false) {", "  if (false) {"],
  ['FedaPay eteint reste propose', PUR, "  if (p === 'fedapay' && o.allume === false) return", "  if (false) return"],
  ['hors ligne, tout repond', PUR, '  if (!o.enLigne) return { ouvert: true, repond: false, pourquoi: HORS_LIGNE };', ''],
  ['hors ligne se dit deux fois, comme une panne', PUR, '    : raisons.includes(HORS_LIGNE)\n', '    : false\n'],
  ['deux pannes au singulier', PUR, '. ${enPanne.length > 1', '. ${enPanne.length > 9'],
  ['une panne qui dure change de depuis', PUR, '  if (avant && maintenantMs - avant.le < PANNE_RETENUE_MS) return { depuis: avant.depuis, le: maintenantMs };', ''],
  ['un refus 4xx compte pour une panne', PUR, '  return typeof o.status === \'number\' && (o.status === 0 || o.status >= 500);', "  return typeof o.status === 'number';"],
  ['une coupure du poste compte pour une panne', PUR, '  if (o.horsLigne) return false;', ''],
  ['l heure dite en UTC', PUR, '  const d = new Date(ms + 60 * 60_000);', '  const d = new Date(ms);'],
  /* La fenêtre Encaisser */
  ['la bascule touche une part qui a demande', ACTIONS, '      if (!ch || !ch.rail || p.engage || p.mnd) return p;', '      if (!ch || !ch.rail || p.mnd) return p;'],
  ['une part engagee change de tuile', ACTIONS, 'disabled={prise || !!p.mnd || !!p.engage}', 'disabled={prise || !!p.mnd}'],
  ['FedaPay pris par une part suivante ignore', ACTIONS, "      const fedapayPris = tuiles.some((t) => t === 'mndpay')", "      const fedapayPris = false && tuiles.some((t) => t === 'mndpay')"],
  ['la panne MTN n est plus signalee', ACTIONS, "onPanne={() => signaleUnePanne('mtn')}", 'onPanne={() => undefined}'],
  ['la panne FedaPay n est plus signalee', ACTIONS, "onPanne={() => signaleUnePanne('fedapay')}", 'onPanne={() => undefined}'],
  ['Mobile money offert en devise', ACTIONS, "TUILES_VUES.filter((t) => (t.id !== 'mobile' || !fxOn)", 'TUILES_VUES.filter((t) => (true'],
  ['le panneau FedaPay montre la carte sous Mobile money', ACTIONS, "p.voie === 'mobile' ? MOYENS_FEDAPAY_MOBILE : undefined}", "p.voie === 'mobile' ? undefined : undefined}"],
  ['la capture lue repart de la regle', ACTIONS, "aLaMain: 'momopay' as const } : {};", '} : {};'],
  ['la sante n est plus relue', ACTIONS, '  const sante = useLaSanteDesMoyens(true, mndOn);', '  const sante = useLaSanteDesMoyens(false, mndOn);'],
  /* Les panneaux et la santé */
  ['FedaPay en panne se tait', FEDA, '      if (r.panne) p.onPanne?.();\n', ''],
  ['le panneau FedaPay change de moyen en pleine demande', FEDA, '    if (p.moyenDeDepart && !demandeId) setMoyen(p.moyenDeDepart);', '    if (p.moyenDeDepart) setMoyen(p.moyenDeDepart);'],
  ['un 502 de FedaPay n est pas une panne', CLIENT, "...(estUnePanneDeFedaPay(error) ? { panne: true } : {})", '...({})'],
  ['MTN indisponible se tait', MTN, '        if (PANNES_MTN.has(code)) onPanne?.();\n', ''],
  ['une demande MTN sans reponse libere la part', MTN, "etat.k === 'attente' || etat.k === 'delai' || etat.k === 'recu';", "etat.k === 'attente';"],
  ['la sante relue meme ecran cache', SANTE, "if (document.visibilityState === 'visible') void relisLaSante();", 'void relisLaSante();'],
  ['deux lectures a la fois', SANTE, '  if (enCours) return enCours;\n', ''],
  ['la fonction MTN muette vaut ouverte', SANTE, "const mtn: LectureDuPrestataire = m ? { pret: m.pret === true, ouvert: m.ouverte === true, le } : null;", 'const mtn: LectureDuPrestataire = { pret: true, ouvert: true, le };'],
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

const dossier = path.join(racine, 'node_modules/.cache', `verifie-le-choix-du-moyen-${process.pid}`);
const sortie = path.join(dossier, 'harnais.mjs');
mkdirSync(dossier, { recursive: true });
try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-le-choix-du-moyen.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    loader: { '.css': 'empty' },
  });
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
