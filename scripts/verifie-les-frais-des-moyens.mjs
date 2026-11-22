import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

/* LES FRAIS DES MOYENS DE PAIEMENT, EPROUVES · 22 novembre 2026.
   « Je veux un espace dans mes parametres ou je corrige les frais de carte a
   2,3 %, et tous les frais lies aux differents moyens de paiement MTN,
   KkiaPay, FedaPay » (Yeman). La regle vit dans
   src/shared/frais-des-moyens-pur.ts ; le serveur MTN en porte sa lecture
   (collecte-mtn-pur.ts, recopiee dans la fonction). Le harnais confronte
   les defauts, la lecture d un taux, les comptes au taux regle et chaque
   ecran qui dit ou compte des frais.
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const FDM = 'src/shared/frais-des-moyens-pur.ts';
const MTNPUR = 'src/shared/collecte-mtn-pur.ts';
const SRV = 'supabase/functions/collecte-mtn/index.ts';
const CHOIX = 'src/shared/choix-du-moyen-pur.ts';
const MOMO = 'src/shared/momopay-de-la-maison-pur.ts';
const ACTIONS = 'src/apps/trone/routes/clients/actions.tsx';
const PAGE = 'src/apps/regler/Mtn.tsx';
const CARTE = 'src/apps/trone/routes/systeme/CarteDesFrais.tsx';
const KK = 'src/apps/trone/routes/clients/KkiapayAuTrone.tsx';
const PDF = 'src/apps/trone/routes/vente/pdf-de-la-piece.ts';
const PANNES = [
  /* La regle */
  ['un taux de 50 % accepte', FDM, 'export const TAUX_MAX_PCT = 10;', 'export const TAUX_MAX_PCT = 100;'],
  ['le taux pose ignore', FDM, '  tauxLu(f?.[cle]) ?? FRAIS_PAR_DEFAUT[cle];', '  FRAIS_PAR_DEFAUT[cle];'],
  ['une saisie illisible efface le taux', FDM, '  if (!vide && t === undefined) return null;\n', ''],
  ['Tap & Go ecrit dans les frais de la Maison', FDM, "    return { ...s, mndPay: { ...(s.mndPay ?? {}), tapgo: tg } };", "    return { ...s, frais: { ...(s.frais ?? {}), carteTerminalPct: t } };"],
  ['KkiaPay mobile reste a 1,9 %', CHOIX, 'export const FRAIS_KKIAPAY_MOBILE_PCT = 1.5;', 'export const FRAIS_KKIAPAY_MOBILE_PCT = 1.9;'],
  ['la phrase MTN garde 1,6 % ecrit en dur', CHOIX, '(frais de ${dit(c.taux?.mtnAjoutePct ?? TAUX_AJOUTE_MTN_PCT)} % ajoutés pour elle)', '(frais de 1,6 % ajoutés pour elle)'],
  ['MoMoPay garde 1,2 %', MOMO, '  return Math.ceil(reste / (1 - p / 100) / 50 - 1e-9) * 50;', '  return Math.ceil(reste / (1 - TAUX_MOMOPAY_PCT / 100) / 50 - 1e-9) * 50;'],
  /* Le serveur MTN */
  ['le serveur lit un taux de 50 %', MTNPUR, 'const TAUX_MAX_DES_FRAIS_PCT = 10;', 'const TAUX_MAX_DES_FRAIS_PCT = 100;'],
  ['le serveur prend le taux ajoute pour le retenu', MTNPUR, '    retenuPct: tauxDesReglages(r.mtnRetenuPct,', '    retenuPct: tauxDesReglages(r.mtnAjoutePct,'],
  ['la demande ignore le taux lu', MTNPUR, '  const fraisAjoutes = fraisAjoutesMtn(reste + pourboire, o.tauxAjoutePct);', '  const fraisAjoutes = fraisAjoutesMtn(reste + pourboire);'],
  ['la fonction ne passe pas le taux a la demande', SRV, '    tauxAjoutePct: (await lesTaux()).ajoutePct,\n', ''],
  ['le GET ne dit pas le taux', SRV, ", fraisAjoutesPct: (await lesTaux()).ajoutePct }); // la santé", ' }); // la santé'],
  ['la pose garde 1,2 %', SRV, '    const frais = fraisDeMtn(c.montant_xof, taux.retenuPct);', '    const frais = fraisDeMtn(c.montant_xof);'],
  /* Les ecrans */
  ['la carte au terminal garde 2,3 %', ACTIONS, 'fraisDeCarteXof(montantDe(pt), tauxCarte)', 'fraisDeCarteXof(montantDe(pt))'],
  ['une phrase du choix sans les taux', ACTIONS, 'enDevise: fxOn, aLaMain: p.aLaMain, kkiapay: etatKkiapay, taux: tauxDesPhrases,', 'enDevise: fxOn, aLaMain: p.aLaMain, kkiapay: etatKkiapay,'],
  ['la page Regler compte a 1,6 %', PAGE, '  const frais = fraisAjoutesMtn(totalXof, tauxMtn);', '  const frais = fraisAjoutesMtn(totalXof);'],
  ['tout le personnel ecrit un taux', CARTE, "    if (!estDirection) { toast('Ce réglage appartient à la direction.');", "    if (false) { toast('Ce réglage appartient à la direction.');"],
  ['KkiaPay ouvert sans le numero tape', KK, '...(numeroLu ? { phone: numeroLu.slice(3) } : {})', '...(telephone ? { phone: telephone } : {})'],
  ['le code MoMoPay du foyer a 1,2 %', PDF, 'montantMomopayFraisCompris(resteXof, o.momopayPct)', 'montantMomopayFraisCompris(resteXof)'],
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

const dossier = path.join(racine, 'node_modules/.cache', `verifie-les-frais-des-moyens-${process.pid}`);
const sortie = path.join(dossier, 'harnais.mjs');
mkdirSync(dossier, { recursive: true });
try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-les-frais-des-moyens.harnais.ts')],
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
