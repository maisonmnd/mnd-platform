import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE BILLET REGLE ET SA FACTURE, EPROUVES - 7 novembre 2026.
   « Il faut avoir une autre facon d'ecrire les rendez-vous qui sont deja
   passes et qui sont deja regles, pouvoir telecharger le PDF » (Yeman, la
   page maisonmnd.com/rdv/?v=). Le banc tient :
   - le serveur (la VRAIE fonction terminer-et-regler, rejouee contre une base
     simulee) : `facture` seulement piece soldee, argent recu, rituel commence ;
     rien de la caisse, de la main, du theme, des identifiants, de la fiche ;
     seulement SA piece ; « Mes RDV » jusqu'a douze mois ;
   - la regle pure (src/shared/billet-regle-pur.ts) et sa copie serveur ;
   - le site : la facture relue avant d'etre crue, « Regle le 4 novembre
     2026. Merci, Anne. » et le bouton, le jour meme la phrase d'avant et le
     bouton, passe non regle : rien, a venir : inchange ;
   - un seul PDF : `donneesDuPdfDeLaPiece` rend, piece pour piece, ce que
     rendait l'ancien corps de `buildPdfData` (garde ici, dans le harnais) ;
     le site passe par elle, et le papier ne tire pas la synchronisation.
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. Une faute dans un bloc recopie se pose dans
   l'original ET dans la copie : c'est la regle qui doit crier, pas la
   comparaison des copies. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const BR = 'src/shared/billet-regle-pur.ts';
const TER = 'supabase/functions/terminer-et-regler/index.ts';
const TPUR = 'src/shared/terminer-et-regler-pur.ts';
const SITE = 'src/apps/revelateur/billet-du-rdv-pur.ts';
const ILOT = 'src/apps/revelateur/ilots/MonRendezVous.tsx';
const FDB = 'src/apps/revelateur/facture-du-billet.ts';
const PAPIER = 'src/shared/pdf-de-la-piece-pur.ts';
const CROCHET = 'src/apps/trone/routes/vente/pdf-de-la-piece.ts';
const PDF = 'src/shared/pdf.ts';
const IDP = 'src/shared/identite-du-papier.ts';
const IDENTITE = 'src/shared/identite.ts';
const DEUX = [BR, TER];
const PANNES = [
  /* ── La regle du serveur (l'original et sa copie, ensemble) ── */
  ['la facture se joint avant l heure du rituel', DEUX, '  return jour < aujourdhui || (jour === aujourdhui && Number.isFinite(debut) && o.maintenantMs >= debut);\n}', '  return jour <= aujourdhui;\n}'],
  ['la facture se joint a une piece qui doit encore', DEUX, '  if (resteDeLaPieceDeLaFin(p) > 0 || argentDeLaPieceDuBillet(p) <= 0) return false;', '  if (argentDeLaPieceDuBillet(p) <= 0) return false;'],
  ['la facture se joint sans argent recu', DEUX, '  if (resteDeLaPieceDeLaFin(p) > 0 || argentDeLaPieceDuBillet(p) <= 0) return false;', '  if (resteDeLaPieceDeLaFin(p) > 0) return false;'],
  ['la facture se joint a un rendez-vous annule', DEUX, " || p.status === 'annulée' || o.rdv.status === 'annulé') return false;", " || p.status === 'annulée') return false;"],
  ['la facture porte la caisse des versements', DEUX, "    return { date: String(v.date ?? '').slice(0, 10), method: String(v.method ?? ''), amountXof: nombreDuBillet(v.amountXof), ...(fx ? { fx } : {}) };", "    return { date: String(v.date ?? '').slice(0, 10), method: String(v.method ?? ''), amountXof: nombreDuBillet(v.amountXof), cashbox: v.cashbox, ...(fx ? { fx } : {}) } as VersementDeLaFactureDuBillet;"],
  ['la facture porte la fiche et la main', DEUX, "    status: String(p.status ?? ''),\n", "    status: String(p.status ?? ''), clientId: p.clientId, encaissePar: p.encaissePar,\n"],
  ['le jour du reglement est celui du premier versement', DEUX, '  return jours.length ? jours[jours.length - 1] : String(p.date ?? \'\').slice(0, 10);', '  return jours.length ? jours[0] : String(p.date ?? \'\').slice(0, 10);'],
  ['la payeuse d un enfant se perd', DEUX, "    payeuse: !p.forClientId || p.forClientId === p.clientId ? null : String(p.clientId ?? ''),", '    payeuse: null,'],
  ['le premier maitre part meme quand la piece nomme sa main', DEUX, "    ...(typeof p.master !== 'string' && !texteDuBillet(p.note) && typeof maitres[0] === 'string' ? { maitre: maitres[0] as string } : {}),", "    ...(typeof maitres[0] === 'string' ? { maitre: maitres[0] as string } : {}),"],
  /* ── La fonction : leBillet, la version, la copie, la borne ── */
  ['le billet joint la facture sans juger', TER, '  if (!piece || !factureAJoindreAuBillet({ rdv, piece, maintenantMs })) return billet;', '  if (!piece) return billet;'],
  ['le billet recopie la piece en bloc', TER, '  return facture ? { ...billet, facture } : billet;', '  return facture ? { ...billet, facture: { ...facture, piece: brute as never } } : billet;'],
  ['le billet lit une autre piece que la sienne', TER, '  return pieceDuRdvDeLaFin(pieces, rdvId);\n}\n/** La branche', '  return (pieces[0] ?? null) as PieceDeLaFin | null;\n}\n/** La branche'],
  ['la version ne monte pas', TER, "const VERSION = '2026-11-07-b ·", "const VERSION = '2026-11-06-b ·"],
  ['la copie de la regle derive dans la fonction', TER, '  if (!JOUR_DU_BILLET.test(jour)) return false;', '  if (!JOUR_DU_BILLET.test(jour)) return true;'],
  ['« Mes RDV » ne remonte plus douze mois', [TPUR, TER], 'export const JOURS_AVANT_DE_LA_RECHERCHE = 365;', 'export const JOURS_AVANT_DE_LA_RECHERCHE = 1;'],
  /* ── Le site : la lecture et les mots ── */
  ['passe et regle, la page dit encore « vous pouvez partir »', SITE, '    if (aujourdhui && b.jour < aujourdhui) {', '    if (false) {'],
  ['la date du reglement perd son annee', SITE, 'phrase: `Réglé le ${dateDite(b.facture.regleLe)}. ${merci}`', "phrase: `Réglé le ${dateDite(b.facture.regleLe).replace(/ \\d{4}$/, '')}. ${merci}`"],
  ['passe et regle, le montant est le reste et non le total', SITE, 'montant: francsDits(totalDeLaFactureDuBillet(b.facture))', 'montant: francsDits(b.resteXof ?? 0)'],
  ['le jour meme, pas de bouton de la facture', SITE, "    return { sur: 'Réglé', phrase: `${merci} Vous pouvez partir : la Maison est prévenue.`, ...facture, note:", "    return { sur: 'Réglé', phrase: `${merci} Vous pouvez partir : la Maison est prévenue.`, note:"],
  ['passe non regle, la page parle d argent', SITE, "    };\n  }\n  return null;\n}", "    };\n  }\n  return b.etat === 'passe' ? { sur: 'À régler', phrase: 'Il reste un montant à régler.', leJourMeme: false } : null;\n}"],
  ['le billet croit une facture sans la relire', SITE, '  const facture = b.facture === undefined ? null : factureLue(b.facture);', '  const facture = (b.facture ?? null) as FactureDuBillet | null;'],
  ['la relecture garde une piece qui doit encore', BR, '  if (resteDeLaPieceDeLaFin(commeLaFin) > 0 || argentDeLaPieceDuBillet(commeLaFin) <= 0) return null;\n', ''],
  ['la relecture garde des champs inconnus', BR, '    payments.push({ date: jour, method, amountXof, ...(fx ? { fx } : {}) });', '    payments.push({ ...brut, date: jour, method, amountXof } as VersementDeLaFactureDuBillet);'],
  ['le papier du site met une ligne legale avant la bascule', BR, '    legal: f.piece.date < BASCULE_DE_L_IDENTITE ? undefined : (f.maison.raison?.trim() || RAISON_MAISON_MND),', '    legal: f.maison.raison?.trim() || RAISON_MAISON_MND,'],
  /* ── Un seul PDF ── */
  ['la regle du papier change la remise', PAPIER, '    discount: disc > 0 ?', '    discount: disc >= 0 ?'],
  ['la regle du papier oublie la payeuse', PAPIER, "    ...(ctx.payeuse ? { payeurName: ctx.payeuse } : {}),\n", ''],
  ['le Trone ne tend plus la payeuse a la regle', CROCHET, '    payeuse: payeurAutreQue(d),\n', ''],
  ['le Trone garde son propre corps', CROCHET, '  const buildPdfData = (d: Invoice): InvoicePdfData => donneesDuPdfDeLaPiece(d, {', '  const buildPdfData = (d: Invoice): InvoicePdfData => ({ ...donneesDuPdfDeLaPiece(d, {'],
  ['le site ne passe plus par la regle du Trone', BR, '  papier.donneesDuPdfDeLaPiece(pieceDuPapierDuSite(f), contexteDuPapierDuSite(f, papier));', '  ({ ...papier.donneesDuPdfDeLaPiece(pieceDuPapierDuSite(f), contexteDuPapierDuSite(f, papier)), note: \'\' });'],
  /* ── Le papier sans la synchronisation ── */
  ['pdf.ts tire de nouveau identite.ts (et la synchronisation)', PDF, "import { identiteDuPapier } from './identite-du-papier';\n", "import { identiteDuPapier } from './identite-du-papier';\nimport './identite';\n"],
  ['l ilot charge le PDF des son ouverture', ILOT, "import { telechargeLaFactureDuBillet } from '../facture-du-billet';\n", "import { telechargeLaFactureDuBillet } from '../facture-du-billet';\nimport { invoicePdf as _constructeur } from '../../../shared/pdf';\nvoid _constructeur;\n"],
  ['l aide du telechargement charge la regle du papier d avance', FDB, "import { papierDuBillet, type FactureDuBillet } from '../../shared/billet-regle-pur';\n", "import { papierDuBillet, type FactureDuBillet } from '../../shared/billet-regle-pur';\nimport { ligneSousLeVerrou as _ligne } from '../../shared/pdf-de-la-piece-pur';\nvoid _ligne;\n"],
  ['l ilot ne demande plus la facture', ILOT, '      await telechargeLaFactureDuBillet(facture);\n', ''],
  ['un echec de la facture se tait', ILOT, '      setPapier({ enCours: false, dit: FACTURE_EN_PANNE });', "      setPapier({ enCours: false, dit: '' });"],
  ['la devise par defaut du papier derive', IDP, "  devise: 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là',", "  devise: 'mi nyo dekpe',"],
  ['identite.ts ne confie plus son nom au papier', IDENTITE, 'confieLIdentiteAuPapier({ nom: maisonNom, devise: DEVISE_COMPLETE, estLaMaison: estLaMaisonMND });\n', ''],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');
const fichiersDe = (f) => (Array.isArray(f) ? f : [f]);

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', `verifie-le-billet-regle-${process.pid}`);
  mkdirSync(dossier, { recursive: true });
  try {
    const env = { ...process.env };
    /* La VRAIE fonction, transpilee sans son import d'esm.sh : le harnais la
       rejoue contre une base et une horloge simulees. */
    const source = readFileSync(path.join(racine, TER), 'utf8')
      .replace(/^import \{ createClient \} from 'https:\/\/esm\.sh\/@supabase\/supabase-js@2';\r?$/m, '');
    const { code } = await transform(source, { loader: 'ts', format: 'cjs', target: 'es2022' });
    env.BILLET_FONCTION = path.join(dossier, 'terminer-et-regler.cjs');
    writeFileSync(env.BILLET_FONCTION, code);
    /* LE GRAPHE DU PAPIER, VU DU SITE : l'ilot et tout ce qu'il charge, a la
       demande compris (esbuild range les import() dans le meme paquet). */
    const graphe = await build({
      entryPoints: [path.join(racine, ILOT)], bundle: true, write: false, metafile: true, format: 'esm', platform: 'browser',
      outdir: path.join(dossier, 'graphe'), logLevel: 'silent', external: ['jspdf'], loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/' }) },
    });
    env.BILLET_GRAPHE = JSON.stringify(Object.keys(graphe.metafile.inputs).map((f) => f.replace(/\\/g, '/')));
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-billet-regle.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }) },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', env });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout, propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.flatMap((x) => fichiersDe(x[1])))];
  const gardes = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const avant = new Map(fichiers.map((f) => [f, md5(f)]));
  let muettes = 0;
  try {
    for (const [nom, cible, a, b] of PANNES) {
      const touches = fichiersDe(cible);
      const introuvables = touches.filter((f) => !gardes.get(f).toString('utf8').replace(/\r\n/g, '\n').includes(a));
      if (introuvables.length) { console.log(`INTROUVABLE ${nom} (${introuvables.join(', ')})`); muettes++; continue; }
      for (const f of touches) {
        const brut = gardes.get(f).toString('utf8');
        const crlf = brut.includes('\r\n');
        const casse = brut.replace(/\r\n/g, '\n').replace(a, () => b);
        writeFileSync(path.join(racine, f), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      }
      try {
        const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        for (const f of touches) writeFileSync(path.join(racine, f), gardes.get(f));
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

process.chdir(racine);
const r = await lanceLeBanc();
process.stdout.write(r.stdout ?? '');
if (r.stderr) process.stdout.write(r.stderr);
process.exit(r.status ?? 1);
