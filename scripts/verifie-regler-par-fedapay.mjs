import { build, transform } from 'esbuild';
import { createHash, createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ecartsDesCopies } from './fedapay-copie-serveur.mjs';

/* RÉGLER PAR FEDAPAY, LE SECOURS DE KKIAPAY, ÉPROUVÉ · 12 novembre 2026
   (le choix du moyen, lot C : « chacun secours de l'autre »).
   Trois bancs en un :
   - les RÈGLES PURES (src/shared/regler-par-fedapay-pur.ts, et ce que
     mnd-pay-pur en tire au Trône), regroupées ici ;
   - les VRAIS fichiers du serveur (supabase/functions/mnd-pay et
     mnd-pay-webhook), transpilés et servis par un faux Deno, contre un faux
     FedaPay et une fausse base (le client supabase-js est simulé) : rien ne
     sort, fetch est remplacé ;
   - le widget KkiaPay rejoué (ce qui est une panne, ce qui n'en est pas),
     la page Régler, le Trône (LienMndPay, le journal), lus dans leur texte.
   Gardes éprouvées : le jeton, le montant du serveur, les frais du serveur,
   le merci, la limite de débit, la demande au registre AVANT l'appel, le
   statut limité à SA demande, aucune clé dans une réponse, la pose sans
   Trône (webhook et relecture), l'écriture sous condition, « à rapprocher »,
   la pièce de contrat jamais écrite ici, l'adresse de retour sans domaine.
   `--prouve` : chaque faute est remise une à une dans le vrai fichier (copie
   gardée, restauration dans un finally, empreintes comparées), et le banc
   doit crier à chacune. Personnes, numéros et montants inventés. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const MP = 'supabase/functions/mnd-pay/index.ts';
const WH = 'supabase/functions/mnd-pay-webhook/index.ts';
const PUR = 'src/shared/regler-par-fedapay-pur.ts';
const PUR_TRONE = 'src/shared/mnd-pay-pur.ts';
const WIDGET = 'src/shared/kkiapay-widget.ts';
const APP = 'src/apps/regler/App.tsx';
const BLOC = 'src/apps/regler/FedaPay.tsx';
const CLIENT_PAGE = 'src/shared/regler-par-fedapay-serveur.ts';
const LIEN = 'src/apps/trone/routes/vente/LienMndPay.tsx';
const FACTURES = 'src/apps/trone/routes/vente/Factures.tsx';
const JOURNAL = 'src/apps/trone/routes/vente/JournalMndPay.tsx';
/** « LES DEUX » : une faute du texte commun aux deux fonctions se remet dans l'une et l'autre. */
const LES_DEUX = 'LES_DEUX';

const PANNES = [
  /* Le jeton */
  ['le jeton mal forme passe', MP, "  if (!estUnJeton(jeton)) return repDuLien({ erreur: 'lien' }, 400);\n  const reglages", '  const reglages'],
  ['le rendez-vous pris de la page, pas du jeton', MP, '  const rdv = await leRdvDuJetonDuLien(admin, jeton);\n  if (!rdv) return repDuLien({ erreur: \'lien\' }, 404);',
    "  const rdv = corps.rdvId ? (await admin.from('appointments').select('id, branch_id, data').eq('id', String(corps.rdvId)).maybeSingle()).data : await leRdvDuJetonDuLien(admin, jeton);\n  if (!rdv) return repDuLien({ erreur: 'lien' }, 404);"],
  ['un jeton porte par deux rendez-vous en choisit un', MP, '  return Array.isArray(data) && data.length === 1 ? data[0] : null;', '  return Array.isArray(data) && data.length ? data[0] : null;'],
  ['FedaPay eteint par la Maison s ouvre quand meme', MP, "  if (!fedapayOuvertAuLien({ reglages, clePosee: SECRET !== '' })) return repDuLien({ erreur: 'fermee' }, 503);\n", ''],
  ['un rendez-vous annule se regle', MP, "  if (rdv.data?.status === 'annulé') return repDuLien({ erreur: 'annule' }, 409);\n", ''],
  /* Le montant du serveur, les frais, le merci */
  ['le montant pris de la page', MP, '  const compte = compteDuLien({ resteXof: resteDeLaPiece(piece),', '  const compte = compteDuLien({ resteXof: Number(corps.montantXof ?? resteDeLaPiece(piece)),'],
  ['les frais au taux du mobile money (la carte passerait au rabais)', PUR, '  const c = compteDeLaDemande({ montantXof: reste, pourboireXof: merciDuLien(o.merciXof, o.merciPermis), moyen: MOYEN_DU_LIEN_REGLER,', "  const c = compteDeLaDemande({ montantXof: reste, pourboireXof: merciDuLien(o.merciXof, o.merciPermis), moyen: 'mtn',"],
  ['les frais oublies', MP, "      description: LIBELLE_DU_LIEN_REGLER, amount: compte.totalXof,", '      description: LIBELLE_DU_LIEN_REGLER, amount: compte.montantXof + compte.pourboireXof,'],
  ['un taux illisible de la Maison est pris tel quel', PUR, '    return x !== undefined && x !== null && x !== \'\' && Number.isFinite(v) && v >= 0 && v <= 20 ? v : undefined;', '    return x !== undefined && x !== null && x !== \'\' ? v : undefined;'],
  ['le merci permis sur une piece qui en porte deja un', MP, 'merciPermis: !(Number(piece.tipXof) > 0), reglages });', 'merciPermis: true, reglages });'],
  ['le merci sans plafond', PUR, '  return Math.min(MERCI_MAX_DU_LIEN, v);', '  return v;'],
  ['un merci negatif retire du reste', PUR, '  if (!permis || !Number.isFinite(v) || v <= 0) return 0;', '  if (!permis || !Number.isFinite(v)) return 0;'],
  ['le plafond oublie', PUR, "  if (c.totalXof > PLAFOND_DU_LIEN_XOF) return { ok: false, raison: 'montant' };\n", ''],
  /* La limite de débit */
  ['la demande sans limite de debit', MP, "  if (!(await permisDuLien(admin, ipDuLien(req), 'fedapay-regler-demander', 12))) return repDuLien({ erreur: 'trop' }, 429);\n", ''],
  ['le statut sans limite de debit', MP, "  if (!(await permisDuLien(admin, ipDuLien(req), 'fedapay-regler-statut', 150))) return repDuLien({ erreur: 'trop' }, 429);\n", ''],
  /* Le registre avant l'appel */
  ['FedaPay appele quand le registre refuse la demande', MP, "  if (insErr) return repDuLien({ erreur: 'registre' }, 503);\n", ''],
  ['une panne de FedaPay laisse la demande en attente', MP, "    await admin.from('mnd_pay').update({ data: { ...data, statut: 'annulee', raison: `FedaPay n’a pas répondu (${motif}) : rien n’a été demandé à la cliente` } }).eq('id', id);\n", ''],
  ['deux touchers, deux transactions', MP, '  if (reprise) return repDuLien({ ok: true, id: reprise.id, url: reprise.url, deja: true, ...montants });\n', ''],
  ['un autre merci reprend l ancienne demande', PUR, '    && !!d.fedapayId && !!d.url && entier(d.totalXof) === entier(totalXof)', '    && !!d.fedapayId && !!d.url'],
  /* L'adresse de retour */
  ['l adresse de retour d un autre site est prise', PUR, '      if ((p.origin === maison.origin || boucleLocale(p)) && /\\/regler\\.html$/.test(p.pathname)) page = new URL(`${p.origin}${p.pathname}`);', '      page = new URL(`${p.origin}${p.pathname}`);'],
  ['une autre page de la Maison que regler.html est prise', PUR, '      if ((p.origin === maison.origin || boucleLocale(p)) && /\\/regler\\.html$/.test(p.pathname)) page', '      if ((p.origin === maison.origin || boucleLocale(p))) page'],
  /* Le statut limité à SA demande, et aucune clé */
  ['le statut d une demande d un autre rendez-vous', MP, " || String(d?.rdvId ?? '') !== rdv.id) return repDuLien({ erreur: 'introuvable' }, 404);", ") return repDuLien({ erreur: 'introuvable' }, 404);"],
  ['le statut montre l identifiant de FedaPay et la page de paiement', PUR, '    etat, regleXof: entier(d.montantXof) + entier(d.pourboireXof), totalXof: entier(d.totalXof),', '    etat, regleXof: entier(d.montantXof) + entier(d.pourboireXof), totalXof: entier(d.totalXof), fedapayId: d.fedapayId, url: d.url,'],
  ['la cle FedaPay dans une reponse', MP, '        ok: true, ouverte,\n', '        ok: true, ouverte, cle: SECRET,\n'],
  ['une panne imprevue montre son detail', MP, "    return repDuLien({ erreur: 'serveur' }, 500);\n  }\n}", "    return repDuLien({ erreur: 'serveur', detail: String(e) + ' ' + (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '') }, 500);\n  }\n}"],
  /* La pose, sans Trône */
  ['le webhook ne pose plus la seance', WH, '      const lien = suite.genre === GENRE_DU_LIEN_REGLER ? await poseLeReglementDuLien(admin, { id: ligne.id, data: suite }) : null;', '      const lien = null;'],
  ['le rejeu du webhook ne reprend plus la pose', WH, '      const lien = d.genre === GENRE_DU_LIEN_REGLER ? await poseLeReglementDuLien(admin, { id: ligne.id, data: d }) : null;', '      const lien = null;'],
  ['la relecture de la page ne pose plus', MP, '    try { honore = (await poseLeReglementDuLien(admin, { id: ligne.id, data: d })).honore; } catch (e) {', '    try { honore = false; } catch (e) {'],
  ['la piece ecrite sans condition', LES_DEUX, '    if (lp.updated_at) q = q.eq(\'updated_at\', lp.updated_at);\n', ''],
  ['le rendez-vous ne suit plus sa piece', LES_DEUX, '    const honore = await suisLeRdvDuLien(admin, d.rdvId, v, piece.id, resteDeLaPiece(neuve), quandMs);\n    await laCaisseFedaPayDuLien', '    const honore = false;\n    await laCaisseFedaPayDuLien'],
  ['la caisse FedaPay ne nait pas', LES_DEUX, "    await laCaisseFedaPayDuLien(admin, String(lp.branch_id ?? d.branchId ?? ''));\n", ''],
  ['un rejeu repose le versement', LES_DEUX, '    const deja = (piece.payments ?? []).find((x) => x?.id === d.id);', '    const deja = undefined as VersementLu | undefined;'],
  ['une piece de contrat s ecrit directement', LES_DEUX, '    if (await leContratDeLaDemande(admin, undefined, d.pieceId)) {', '    if (false) {'],
  ['un montant recu trop court se pose', WH, '  if (statut === \'payee\' && recu + 1 < Math.round(Number(d.totalXof ?? 0))) {', '  if (false) {'],
  ['un reste qui baisse se pose quand meme', PUR, "  if (demande <= 0 || actuel < demande) return { ok: false, raison: 'reste_change' };\n", ''],
  ['le merci perdu sur la piece', PUR, '    ...(pourboireXof > 0 ? { tipXof: entier(p.tipXof) + entier(pourboireXof) } : {}),\n', ''],
  ['la caisse KkiaPay au lieu de FedaPay', PUR, "export const CAISSE_FEDAPAY_DU_LIEN = 'FedaPay';", "export const CAISSE_FEDAPAY_DU_LIEN = 'KkiaPay';"],
  ['le versement prend un autre identifiant que la demande', PUR, '    id: d.id, date: q.date, time: q.time, amountXof: entier(d.montantXof),', '    id: `fp-${d.id}`, date: q.date, time: q.time, amountXof: entier(d.montantXof),'],
  /* Le Trône */
  ['le Trone inscrit lui-meme la demande de la page Regler', PUR_TRONE, "    if (d.genre !== 'lien' || d.statut !== 'payee' || deja.has(d.id)) continue;", "    if ((d.genre !== 'lien' && d.genre !== 'regler') || d.statut !== 'payee' || deja.has(d.id)) continue;"],
  ['« a rapprocher » ne parait pas au journal', PUR_TRONE, '      if (d.aRapprocher) return true;\n', ''],
  ['LienMndPay ignore la sante de FedaPay', LIEN, '  if (sante.fedapay.ouvert && !sante.fedapay.repond) {', '  if (false) {'],
  ['Factures ne donne plus le rendez-vous de la piece', FACTURES, '                  apptId={selected.apptId}\n', ''],
  ['la panne vue sur une vraie demande ne s apprend plus', LIEN, "    if (!r.ok) { if (r.panne) signaleUnePanne('fedapay'); setErreur(r.erreur); return; }", '    if (!r.ok) { setErreur(r.erreur); return; }'],
  /* La page et le widget */
  ['FedaPay parait quand KkiaPay marche', APP, "            {(kkiaEnPanne || (!!retourFp && retourFp !== 'lecture')) && (!p.sansPiece && !p.tetes", '            {(true) && (!p.sansPiece && !p.tetes'],
  ['FedaPay ouvert pendant la demande MTN', APP, '                  bloque={mtnOccupe || ecran.k === \'paiement\' || retourFp === \'lecture\'} />', "                  bloque={ecran.k === 'paiement' || retourFp === 'lecture'} />"],
  ['une annulation de la cliente passe pour une panne', WIDGET, '    p?.reject(message === ECHEC_SANS_MOTIF ? new PanneDeKkiapay(message) : new Error(message));', '    p?.reject(new PanneDeKkiapay(message));'],
  ['le script injoignable n est plus une panne', WIDGET, "    el.onerror = () => { scriptPromise = null; reject(new PanneDeKkiapay('Le service de paiement est injoignable.')); };", "    el.onerror = () => { scriptPromise = null; reject(new Error('Le service de paiement est injoignable.')); };"],
  ['la page envoie un montant', CLIENT_PAGE, "  appel({ action: 'regler-demander', jeton, pourboireXof, retour });", "  appel({ action: 'regler-demander', jeton, pourboireXof, retour, montantXof: 1 });"],
  ['au retour, l adresse de FedaPay fait foi', APP, "        if (s.etat === 'payee') {", "        if (s.etat === 'payee' || new URLSearchParams(window.location.search).get('status') === 'approved') {"],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout.slice(-3000), propre.stderr.slice(-2000)); process.exit(1); }
  const fichiers = [...new Set([...PANNES.map((x) => x[1]).filter((f) => f !== LES_DEUX), MP, WH])];
  const gardes = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const avant = new Map(fichiers.map((f) => [f, md5(f)]));
  let muettes = 0;
  const casse = (f, a, b) => {
    const brut = gardes.get(f).toString('utf8');
    const crlf = brut.includes('\r\n');
    const texte = brut.replace(/\r\n/g, '\n');
    if (!texte.includes(a)) return false;
    const neuf = texte.replace(a, b);
    writeFileSync(path.join(racine, f), crlf ? neuf.replace(/\n/g, '\r\n') : neuf);
    return true;
  };
  const rends = () => { for (const [f, g] of gardes) writeFileSync(path.join(racine, f), g); };
  try {
    for (const [nom, f, a, b] of PANNES) {
      /* Une faute dans l'original des règles vit aussi dans les copies des deux
         fonctions ; une faute du texte commun, dans l'une et l'autre. */
      const cibles = f === LES_DEUX ? [MP, WH] : f === PUR ? [PUR, MP, WH] : [f];
      const touchees = cibles.map((c) => casse(c, a, b));
      if (!touchees.every(Boolean)) { console.log(`INTROUVABLE ${nom} (${cibles.filter((_, i) => !touchees[i]).join(', ')})`); muettes++; rends(); continue; }
      try {
        const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        rends();
      }
    }
  } finally {
    rends();
  }
  const intacts = fichiers.every((f) => md5(f) === avant.get(f)) && ecartsDesCopies(racine).length === 0;
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exit(muettes === 0 && intacts ? 0 : 1);
}

let echecs = 0;
let oks = 0;
const dit = (nom, ok, vu = '') => { console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${String(vu).slice(0, 600)}`}`); if (!ok) echecs++; else oks++; };
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lis = (f) => readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

const dossier = path.join(racine, 'node_modules', '.cache', `verifie-regler-par-fedapay-${process.pid}`);
mkdirSync(dossier, { recursive: true });

/* ══ 1. LES RÈGLES PURES ══ */
let R; let T0;
try {
  await build({ entryPoints: [path.join(racine, PUR)], bundle: true, format: 'esm', platform: 'node', outfile: path.join(dossier, 'pur.mjs'), logLevel: 'error' });
  R = await import(pathToFileURL(path.join(dossier, 'pur.mjs')).href);
  await build({ entryPoints: [path.join(racine, PUR_TRONE)], bundle: true, format: 'esm', platform: 'node', outfile: path.join(dossier, 'trone.mjs'), logLevel: 'error' });
  T0 = await import(pathToFileURL(path.join(dossier, 'trone.mjs')).href);
} catch (e) { rmSync(dossier, { recursive: true, force: true }); throw e; }

dit('les fonctions portent la copie exacte des regles (regler-par-fedapay, la piece, les frais, l honneur) : fedapay-copie-serveur', ecartsDesCopies(racine).length === 0, ecartsDesCopies(racine).join(' ; '));
dit('le merci : un entier de 0 a 100 000 F, rien quand la piece en porte deja un, jamais negatif',
  egal([R.merciDuLien(2000, true), R.merciDuLien(-5, true), R.merciDuLien(2000, false), R.merciDuLien(500000, true), R.merciDuLien('abc', true), R.merciDuLien(1500.7, true)], [2000, 0, 0, 100000, 0, 1500]), '');
dit('les reglages de la Maison : allume, ses deux taux ; un taux illisible ou absurde ne se lit pas ; sans document : ferme',
  egal([R.reglagesDuLien({ mndPay: { actif: true, tauxMobilePct: 1.8, tauxCartePct: '3' } }), R.reglagesDuLien({ mndPay: { actif: 'oui', tauxMobilePct: 'x', tauxCartePct: 99 } }), R.reglagesDuLien(null)],
    [{ actif: true, tauxMobilePct: 1.8, tauxCartePct: 3 }, { actif: false }, {}]), JSON.stringify(R.reglagesDuLien({ mndPay: { actif: 'oui', tauxMobilePct: 'x', tauxCartePct: 99 } })));
dit('FedaPay ouvert a la page seulement allume ET sa cle posee', egal([R.fedapayOuvertAuLien({ reglages: { actif: true }, clePosee: true }), R.fedapayOuvertAuLien({ reglages: { actif: true }, clePosee: false }), R.fedapayOuvertAuLien({ reglages: {}, clePosee: true })], [true, false, false]), '');
{
  const r = { actif: true, tauxMobilePct: 1.8, tauxCartePct: 3 };
  dit('le compte du serveur : le reste, le merci, les frais AJOUTES au plus haut des deux taux (elle choisit apres), au franc superieur',
    egal([R.compteDuLien({ resteXof: 30000, merciXof: 2000, merciPermis: true, reglages: r }), R.compteDuLien({ resteXof: 30000, merciXof: 2000, merciPermis: false, reglages: r }),
      R.compteDuLien({ resteXof: 30000, merciXof: 0, merciPermis: true, reglages: { actif: true } })],
    [{ ok: true, montantXof: 30000, pourboireXof: 2000, fraisXof: 960, totalXof: 32960 }, { ok: true, montantXof: 30000, pourboireXof: 0, fraisXof: 900, totalXof: 30900 },
      { ok: true, montantXof: 30000, pourboireXof: 0, fraisXof: 540, totalXof: 30540 }]), JSON.stringify(R.compteDuLien({ resteXof: 30000, merciXof: 2000, merciPermis: true, reglages: r })));
  dit('... rien a regler, ou au-dela de 5 000 000 F : refuse', egal([R.compteDuLien({ resteXof: 0, merciXof: 0, merciPermis: true, reglages: r }), R.compteDuLien({ resteXof: 4_900_000, merciXof: 100000, merciPermis: true, reglages: r })],
    [{ ok: false, raison: 'deja_reglee' }, { ok: false, raison: 'montant' }]), '');
}
{
  const M = 'https://maison-essai.example/trone/paye.html';
  const u = (p) => R.retourDuLien({ pageDeRetourDeLaMaison: M, pageDemandee: p, jeton: '23456789abcdef', demandeId: 'mp-0123456789abcdef0123' });
  dit('l adresse de retour : la voisine regler.html de la page de retour de la Maison, la suite ecrite par le serveur seul',
    egal([u(undefined), u('https://maison-essai.example/trone/regler.html?r=autre&fp=x#h'), u('https://autre-site.example/regler.html'), u('http://localhost:5173/regler.html'), u('https://maison-essai.example/trone/payer.html')],
      ['https://maison-essai.example/trone/regler.html?r=23456789abcdef&fp=mp-0123456789abcdef0123', 'https://maison-essai.example/trone/regler.html?r=23456789abcdef&fp=mp-0123456789abcdef0123',
        'https://maison-essai.example/trone/regler.html?r=23456789abcdef&fp=mp-0123456789abcdef0123', 'http://localhost:5173/regler.html?r=23456789abcdef&fp=mp-0123456789abcdef0123',
        'https://maison-essai.example/trone/regler.html?r=23456789abcdef&fp=mp-0123456789abcdef0123']),
    JSON.stringify([u('https://autre-site.example/regler.html'), u('https://maison-essai.example/trone/regler.html?r=autre&fp=x#h')]));
  dit('... une page de la Maison illisible ou en http : pas d adresse', egal([R.retourDuLien({ pageDeRetourDeLaMaison: 'rien', jeton: 'j', demandeId: 'd' }), R.retourDuLien({ pageDeRetourDeLaMaison: 'http://maison-essai.example/paye.html', jeton: 'j', demandeId: 'd' })], [null, null]), '');
}
{
  const t = Date.parse('2026-11-12T10:00:00Z');
  const d = (id, x) => ({ id, genre: 'regler', rdvId: 'r1', statut: 'en_attente', fedapayId: 7, url: 'https://pay', totalXof: 32960, creeLe: new Date(t - 60_000).toISOString(), ...x });
  dit('reprendre : la meme demande du meme rendez-vous, en attente, partie, au meme total, de moins d une demi-heure ; sinon aucune',
    egal([R.demandeAReprendre([d('a')], 'r1', 32960, t)?.id, R.demandeAReprendre([d('a')], 'r1', 30900, t), R.demandeAReprendre([d('a', { creeLe: new Date(t - 31 * 60_000).toISOString() })], 'r1', 32960, t),
      R.demandeAReprendre([d('a', { url: '' })], 'r1', 32960, t), R.demandeAReprendre([d('a', { rdvId: 'r2' })], 'r1', 32960, t), R.demandeAReprendre([d('a', { statut: 'payee' })], 'r1', 32960, t)],
    ['a', null, null, null, null, null]), '');
  const vue = R.statutDuLienPourLaPage({ ...d('a'), statut: 'payee', montantXof: 30000, pourboireXof: 2000, reference: 'trx', pieceId: 'p1', fraisXof: 960 }, true);
  dit('ce que la page voit : l etat, ce qui regle la seance, le total, l honneur ; ni FedaPay, ni la piece, ni la page de paiement',
    egal(Object.keys(vue).sort(), ['etat', 'honore', 'regleXof', 'totalXof']) && vue.regleXof === 32000 && vue.totalXof === 32960
    && egal(['en_attente', 'refusee', 'expiree', 'annulee', 'inconnu'].map((s) => R.statutDuLienPourLaPage({ id: 'x', statut: s }).etat), ['attente', 'refusee', 'expiree', 'annulee', 'attente'])
    && R.statutDuLienPourLaPage({ id: 'x', statut: 'en_attente' }, true).honore === undefined, JSON.stringify(vue));
  dit('le partage a la confirmation : le reste demande et son merci ; reglee entre-temps ou reste baisse : a rapprocher ; un reste qui monte garde le demande',
    egal([R.partageDuLien({ id: 'x', montantXof: 30000, pourboireXof: 2000 }, 30000), R.partageDuLien({ id: 'x', montantXof: 30000 }, 35000), R.partageDuLien({ id: 'x', montantXof: 30000 }, 20000), R.partageDuLien({ id: 'x', montantXof: 30000 }, 0)],
      [{ ok: true, versementXof: 30000, pourboireXof: 2000 }, { ok: true, versementXof: 30000, pourboireXof: 0 }, { ok: false, raison: 'reste_change' }, { ok: false, raison: 'deja_reglee' }]), '');
  const dd = { id: 'mp-0123456789abcdef0123', moyen: 'au_choix', modeReel: 'mtn_open', montantXof: 30000, pourboireXof: 2000, fraisXof: 960, reference: 'trx_9001', fedapayId: 9001 };
  const quand = Date.parse('2026-11-12T10:05:00Z');
  const v = R.versementDuLien(dd, quand);
  dit('le versement : l identifiant de la demande, le moyen vraiment pris, caisse FedaPay, jour et heure de Cotonou, les frais dits payes par elle',
    v.id === dd.id && v.method === 'MTN MoMo' && v.cashbox === 'FedaPay' && v.date === '2026-11-12' && v.time === '11:05' && v.amountXof === 30000 && /frais 960 F payés par la cliente/.test(v.note) && /lien Régler/.test(v.note)
    && R.versementDuLien({ ...dd, modeReel: 'card' }, quand).method === 'Carte', JSON.stringify(v));
  const trace = R.traceDuLien(dd, v, quand, 2000);
  const piece = { id: 'p1', lines: [{ label: 'SÍNSIN Essentiel', qty: 1, unitXof: 30000 }], payments: [], status: 'émise' };
  const neuve = R.pieceRegleeParLeLien(piece, v, 2000, trace);
  dit('la piece reglee : soldee « payee », le versement, le merci a part (tipXof), la trace d un reglement en ligne, la caisse FedaPay',
    neuve.status === 'payée' && neuve.payments.length === 1 && neuve.tipXof === 2000 && neuve.reglementsEnLigne.length === 1 && neuve.reglementsEnLigne[0].pourboireXof === 2000
    && neuve.reglementsEnLigne[0].moyen === 'FedaPay' && neuve.reglementsEnLigne[0].transactionId === '9001' && neuve.cashbox === 'FedaPay' && neuve.payment === 'FedaPay', JSON.stringify(neuve));
  const rdv = { id: 'r1', date: '2026-11-12', time: '08:30', status: 'confirmé', termineParElle: { le: '2026-11-12T09:00:00Z', par: 'couronne' }, payments: [], lienDeReglement: { jeton: 'j', creeLe: 'x' } };
  const h = R.rdvApresLeLien(rdv, v, 'p1', 0, quand);
  dit('le rendez-vous suit sa piece, son lien dit paye ; honore seulement si elle avait termine elle-meme et que tout est regle',
    h.status === 'honoré' && !!h.honoreAuReglement?.le && h.payments[0].id === v.id && h.payments[0].invoiceId === 'p1' && h.paidXof === 30000 && !!h.lienDeReglement.payeLe
    && R.rdvApresLeLien({ ...rdv, termineParElle: undefined }, v, 'p1', 0, quand).status === 'confirmé' && R.rdvApresLeLien(h, v, 'p1', 0, quand).payments.length === 1, JSON.stringify(h));
  dit('la caisse FedaPay neuve : celle du Trone (meme identifiant), l ancien nom la vaut encore',
    egal(R.caisseFedaPayNeuve('br-1'), { id: 'cb-mndpay-br-1', branchId: 'br-1', name: 'FedaPay', sub: 'Avant le reversement', glyph: '◈', openingXof: 0 }) && R.estDejaLaCaisseFedaPay('MND PAY') && !R.estDejaLaCaisseFedaPay('KkiaPay'), '');
}
{
  /* LE TRÔNE (mnd-pay-pur) : jamais d'inscription par le poste, « à rattacher » seulement quand il le faut. */
  const maintenant = Date.parse('2026-11-12T12:00:00Z');
  const d = (id, x) => ({ id, branchId: 'br-1', genre: 'regler', moyen: 'au_choix', montantXof: 30000, fraisXof: 960, totalXof: 32960, pieceId: 'p1', libelle: 'x', statut: 'payee', creeLe: '2026-11-12T11:00:00Z', payeeLe: '2026-11-12T11:55:00Z', ...x });
  const pieces = [{ id: 'p1', status: 'émise', payments: [] }];
  dit('le Trone n inscrit jamais lui-meme une demande de la page Regler (le serveur la pose, avec son merci)',
    T0.piecesReglees(pieces, [d('a')], () => 30000).inscrits.length === 0 && T0.piecesReglees(pieces, [d('b', { genre: 'lien' })], () => 30000).inscrits.length === 1, '');
  const ids = (l) => T0.aRattacher(l, pieces, maintenant).map((x) => x.id);
  dit('au journal : a rattacher quand le serveur l a dite a rapprocher, ou dix minutes sans pose ; jamais une demande posee (son versement inscrit)',
    egal(ids([d('a'), d('b', { aRapprocher: 'deja_reglee' }), d('c', { payeeLe: '2026-11-12T11:40:00Z' })]), ['b', 'c'])
    && egal(T0.aRattacher([d('c', { payeeLe: '2026-11-12T11:40:00Z' })], [{ id: 'p1', payments: [{ id: 'c', amountXof: 30000 }] }], maintenant).map((x) => x.id), [])
    && T0.DELAI_DU_LIEN_REGLER_MS === R.DELAI_DU_LIEN_REGLER_MS, JSON.stringify(ids([d('a'), d('b', { aRapprocher: 'deja_reglee' }), d('c', { payeeLe: '2026-11-12T11:40:00Z' })])));
  dit('le mot du lien Regler au Trone : la phrase de Factures, mot pour mot',
    R.motDuLienRegler('Mme Awa', '30 000 F', 'L') === 'Bonjour Mme Awa, pour régler 30 000 F depuis votre téléphone (MTN, Moov, Celtiis ou carte), touchez « Régler » sur cette page :\nL'
    && lis(FACTURES).includes('depuis votre téléphone (MTN, Moov, Celtiis ou carte), touchez « Régler » sur cette page :\\n${l}'), R.motDuLienRegler('A', 'B', 'L'));
}

/* ══ 2. LE WIDGET KKIAPAY : ce qui est une panne, ce qui n'en est pas ══ */
{
  const fabrique = async (cle, nom) => {
    const sortie = path.join(dossier, `${nom}.mjs`);
    await build({ entryPoints: [path.join(racine, WIDGET)], bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      define: { 'import.meta.env': JSON.stringify({ VITE_KKIAPAY_PUBLIC_KEY: cle, VITE_KKIAPAY_SANDBOX: 'true' }) } });
    return import(pathToFileURL(sortie).href);
  };
  const monde = { scriptCharge: true, echec: null, succes: null, ouvert: 0, leve: false };
  globalThis.navigator ??= { onLine: true };
  globalThis.window = globalThis;
  globalThis.document = {
    createElement: () => ({}),
    head: { appendChild: (el) => {
      if (!monde.scriptCharge) { setTimeout(() => el.onerror?.(), 0); return; }
      globalThis.openKkiapayWidget = () => { monde.ouvert++; if (monde.leve) throw new Error('widget casse'); };
      globalThis.addSuccessListener = (cb) => { monde.succes = cb; };
      globalThis.addFailedListener = (cb) => { monde.echec = cb; };
      setTimeout(() => el.onload?.(), 0);
    } },
  };
  const W = await fabrique('pk_essai_publique', 'widget');
  const essai = async (declenche) => {
    const p = W.payWithKkiapay({ amountXof: 1000, partnerId: 'reg-r1', branchId: 'br-1' }).then(() => 'paye', (e) => e);
    await new Promise((r) => setTimeout(r, 5));
    declenche();
    return p;
  };
  const annule = await essai(() => monde.echec?.({ reason: { message: 'TRANSACTION CANCELLED by user' } }));
  const refuse = await essai(() => monde.echec?.({ reason: { message: 'insufficient_fund' } }));
  const muet = await essai(() => monde.echec?.({}));
  monde.leve = true;
  const leve = await essai(() => {});
  monde.leve = false;
  dit('KkiaPay : annulee par elle ou refusee par l operateur, ce n est pas une panne ; un echec sans motif ou un widget qui leve, si',
    egal([W.estUnePanneDeKkiapay(annule), W.estUnePanneDeKkiapay(refuse), W.estUnePanneDeKkiapay(muet), W.estUnePanneDeKkiapay(leve)], [false, false, true, true])
    && annule.message === 'Paiement annulé.' && refuse.message === 'Solde insuffisant sur le compte débité.', [annule?.message, refuse?.message, muet?.message, leve?.message].join(' | '));
  const W2 = await fabrique('pk_essai_publique', 'widget2');
  /* Une page neuve : le widget n'est pas encore là, son script ne charge pas. */
  delete globalThis.openKkiapayWidget; delete globalThis.addSuccessListener; delete globalThis.addFailedListener;
  monde.scriptCharge = false;
  const injoignable = await W2.payWithKkiapay({ amountXof: 1000, partnerId: 'reg-r1', branchId: 'br-1' }).then(() => 'paye', (e) => e);
  const W3 = await fabrique('', 'widget3');
  const sansCle = await W3.payWithKkiapay({ amountXof: 1000, partnerId: 'reg-r1', branchId: 'br-1' }).then(() => 'paye', (e) => e);
  globalThis.navigator.onLine = false;
  const horsLigne = await W2.payWithKkiapay({ amountXof: 1000, partnerId: 'reg-r1', branchId: 'br-1' }).then(() => 'paye', (e) => e);
  globalThis.navigator.onLine = true;
  dit('KkiaPay : son script injoignable, ou pas de cle, c est une panne ; hors ligne, non (FedaPay n y ferait rien de mieux)',
    W2.estUnePanneDeKkiapay(injoignable) && W3.estUnePanneDeKkiapay(sansCle) && !W3.kkiapayPeutSOuvrir() && W.kkiapayPeutSOuvrir() && !W2.estUnePanneDeKkiapay(horsLigne),
    [injoignable?.message, sansCle?.message, horsLigne?.message].join(' | '));
  delete globalThis.document;
}

/* ══ 3. LE SERVEUR, contre un faux FedaPay et une fausse base ══ */
const PROJET = 'https://projet-essai.supabase.co';
const SERVICE = 'service-SECRETE-essai';
const SECRET_FP = 'sk_sandbox_SECRET-FEDAPAY-essai';
const SECRET_WH = 'wh_sandbox_SECRET-WEBHOOK-essai';
const ANON = 'anon-publique-essai';
const BASE_FP = 'https://sandbox-api.fedapay.com';
const ENV = {
  SUPABASE_URL: PROJET, SUPABASE_SERVICE_ROLE_KEY: SERVICE, SUPABASE_ANON_KEY: ANON, FEDAPAY_SECRET_KEY: SECRET_FP, FEDAPAY_WEBHOOK_SECRET: SECRET_WH,
  FEDAPAY_ENV: 'sandbox', MND_PAY_RETOUR: 'https://maison-essai.example/trone/paye.html',
};
const SECRETS = [SERVICE, SECRET_FP, SECRET_WH];
const JWT_PERSONNEL = 'jwt-personnel-essai';

let T = {};
let journal = [];
let horloge = 0;
let txs = new Map();
let prochainId = 9000;
let fedapayMuet = false;
let registreRefuse = false;
let rpcRefuse = false;
let aCourse = null; // une écriture du comptoir entre la lecture et l'écriture du serveur
let pannes = {}; // table -> nombre de lectures qui échouent (une coupure de la base)
const reponses = [];
const estampe = () => new Date(Date.parse('2026-11-12T08:00:00Z') + (++horloge) * 1000).toISOString();
const remiseAZero = () => {
  T = { appointments: [], invoices: [], mnd_pay: [], documents: [], cashboxes: [], edge_rate_limits: [], subscribers: [], plans: [], branches: [{ id: 'br-1' }], clients: [] };
  journal = []; txs = new Map(); fedapayMuet = false; registreRefuse = false; rpcRefuse = false; aCourse = null; pannes = {};
};
remiseAZero();
const valeur = (r, col) => {
  if (!col.startsWith('data')) return r[col];
  const parts = col.slice(4).split(/->>?/).filter(Boolean);
  let x = r.data;
  for (const p of parts) x = x == null ? undefined : x[p];
  return x;
};
class Requete {
  constructor(table) { this.table = table; this.f = []; this.mode = 'select'; this.lim = Infinity; this.seul = false; this.compte = false; this.retour = false; this.tri = null; }
  select(_c, o) { if (this.mode !== 'select') this.retour = true; if (o?.count) this.compte = true; return this; }
  eq(c, v) { this.f.push((r) => { const x = valeur(r, c); return x !== undefined && x !== null && String(x) === String(v); }); return this; }
  neq(c, v) { this.f.push((r) => String(valeur(r, c)) !== String(v)); return this; }
  gte(c, v) { this.f.push((r) => String(valeur(r, c) ?? '') >= String(v)); return this; }
  not(c) { this.f.push((r) => valeur(r, c) != null); return this; }
  in(c, l) { this.f.push((r) => l.map(String).includes(String(valeur(r, c)))); return this; }
  order(c, o) { this.tri = { c, asc: o?.ascending !== false }; return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.seul = true; return this; }
  insert(row) { this.mode = 'insert'; this.valeur = row; return this; }
  update(p) { this.mode = 'update'; this.valeur = p; return this; }
  then(ok, ko) { return Promise.resolve().then(() => this.fais()).then(ok, ko); }
  fais() {
    const t = (T[this.table] ??= []);
    if (this.mode === 'insert') {
      journal.push({ quoi: `insert ${this.table}`, id: this.valeur?.id });
      if (this.table === 'mnd_pay' && registreRefuse) return { data: null, error: { code: '57014', message: 'registre en panne' } };
      const row = structuredClone(this.valeur);
      if (row.id && t.some((r) => r.id === row.id)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
      if (this.table === 'edge_rate_limits') row.at = new Date().toISOString(); else row.updated_at = estampe();
      t.push(row);
      return { data: null, error: null };
    }
    if (this.mode === 'select' && pannes[this.table] > 0) { pannes[this.table]--; return { data: null, error: { message: 'connexion perdue' } }; }
    const lus = t.filter((r) => this.f.every((g) => g(r)));
    if (this.mode === 'update') {
      journal.push({ quoi: `update ${this.table}`, ids: lus.map((r) => r.id) });
      for (const r of lus) { Object.assign(r, structuredClone(this.valeur)); r.updated_at = estampe(); }
      return { data: this.retour ? structuredClone(lus.map((r) => ({ id: r.id }))) : null, error: null };
    }
    if (this.compte) return { count: lus.length, data: null, error: null };
    let l = lus;
    if (this.tri) { const k = this.tri; l = [...l].sort((a, b) => String(valeur(a, k.c)).localeCompare(String(valeur(b, k.c))) * (k.asc ? 1 : -1)); }
    const data = structuredClone(l.slice(0, this.lim));
    if (this.table === 'invoices' && aCourse && data.some((x) => x.id === aCourse.id)) {
      /* Le comptoir écrit la pièce juste après la lecture du serveur. */
      const vraie = t.find((x) => x.id === aCourse.id);
      vraie.data = { ...vraie.data, payments: [...(vraie.data.payments ?? []), aCourse.versement] };
      vraie.updated_at = estampe();
      aCourse = null;
    }
    return { data: this.seul ? (data[0] ?? null) : data, error: null };
  }
}
function createClient(_url, cle, o) {
  const entete = String(o?.global?.headers?.authorization ?? '');
  return {
    from: (t) => new Requete(t),
    auth: { getUser: async () => ({ data: { user: entete === `Bearer ${JWT_PERSONNEL}` ? { email: 'equipe@essai.example' } : null } }) },
    rpc: async (nom, args) => {
      journal.push({ quoi: `rpc ${nom}` });
      if (nom === 'is_staff') return cle === SERVICE ? { data: true, error: null } : { data: entete === `Bearer ${JWT_PERSONNEL}`, error: null };
      if (nom === 'verse_sur_l_abonnement') {
        if (rpcRefuse) return { data: { ok: false, raison: 'refus_de_l_essai' }, error: null };
        const sub = T.subscribers.find((s) => s.id === args.p_sub_id);
        const piece = T.invoices.find((i) => i.id === sub?.data?.invoiceId);
        if (piece && !(piece.data.payments ?? []).some((p) => p.id === args.p_versement.id)) {
          piece.data = { ...piece.data, payments: [...(piece.data.payments ?? []), { id: args.p_versement.id, amountXof: args.p_versement.montantXof, cashbox: 'FedaPay' }] };
          piece.updated_at = estampe();
        }
        return { data: { ok: true }, error: null };
      }
      return { data: null, error: { message: `rpc inconnue ${nom}` } };
    },
  };
}
const rep = (status, corps) => new Response(corps === undefined ? '' : JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });
async function fauxFetch(entree, init = {}) {
  const url = new URL(String(entree));
  const methode = (init.method ?? 'GET').toUpperCase();
  const h = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const corps = init.body ? JSON.parse(init.body) : undefined;
  if (url.origin !== BASE_FP) { journal.push({ quoi: `hors du monde ${url.href}` }); return rep(599, { message: 'hors du monde simule' }); }
  const p = url.pathname.replace(/^\/v1/, '');
  journal.push({ quoi: `fedapay ${methode} ${p}`, corps });
  if (fedapayMuet) throw new TypeError('fetch failed');
  if (h.authorization !== `Bearer ${SECRET_FP}`) return rep(401, { message: 'clé refusée' });
  let m;
  if (methode === 'POST' && p === '/transactions') {
    const id = ++prochainId;
    const tx = { id, reference: `trx_${id}`, status: 'pending', amount: corps.amount, description: corps.description, callback_url: corps.callback_url, mode: null };
    txs.set(id, tx);
    return rep(200, { 'v1/transaction': tx });
  }
  if (methode === 'POST' && (m = p.match(/^\/transactions\/(\d+)\/token$/))) return txs.has(Number(m[1])) ? rep(200, { token: `tok${m[1]}`, url: `https://checkout-essai.example/pay/tok${m[1]}` }) : rep(404, { message: 'inconnue' });
  if (methode === 'GET' && (m = p.match(/^\/transactions\/(\d+)$/))) { const tx = txs.get(Number(m[1])); return tx ? rep(200, { 'v1/transaction': tx }) : rep(404, { message: 'inconnue' }); }
  return rep(404, { message: `inattendu ${methode} ${p}` });
}

const gestionnaires = {};
for (const [f, nom] of [[MP, 'mndPay'], [WH, 'webhook']]) {
  const source = readFileSync(path.join(racine, f), 'utf8').replace(/^import \{ createClient \} from 'https:\/\/esm\.sh\/@supabase\/supabase-js@2';$/m, '');
  const { code } = await transform(source, { loader: 'ts', format: 'cjs', target: 'es2022' });
  const module = { exports: {} };
  /* Le journal des fonctions se tait : le banc dit ce qu'il voit. */
  const muet = { log() {}, error() {}, warn() {}, info() {} };
  new Function('createClient', 'Deno', 'fetch', 'module', 'exports', 'console', code)(
    createClient, { env: { get: (k) => ENV[k] }, serve: (g) => { gestionnaires[nom] = g; } }, fauxFetch, module, module.exports, muet,
  );
}
rmSync(dossier, { recursive: true, force: true });

let ip = 1;
const appelle = async (nom, init) => {
  const r = await gestionnaires[nom](new Request(`${PROJET}/functions/v1/${nom === 'webhook' ? 'mnd-pay-webhook' : 'mnd-pay'}`, init));
  const t = await r.text();
  reponses.push(t);
  let o = null; try { o = JSON.parse(t); } catch { o = null; }
  return { status: r.status, o, t };
};
const page = (corps, ipDe = ip) => appelle('mndPay', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${ipDe}`, apikey: 'sb_publishable_essai', authorization: 'Bearer sb_publishable_essai' }, body: JSON.stringify(corps) });
const personnel = (corps, jwt = JWT_PERSONNEL) => appelle('mndPay', { method: 'POST', headers: { 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) }, body: JSON.stringify(corps) });
const signe = (corps, s = SECRET_WH) => { const t = Math.floor(Date.now() / 1000); return `t=${t},s=${createHmac('sha256', s).update(`${t}.${corps}`).digest('hex')}`; };
const webhook = (fedapayId, signer = true) => {
  const corps = JSON.stringify({ name: 'transaction.approved', entity: { id: fedapayId, klass: 'v1/transaction' } });
  return appelle('webhook', { method: 'POST', headers: { 'content-type': 'application/json', ...(signer ? { 'x-fedapay-signature': signe(corps) } : {}) }, body: corps });
};
const approuve = (fedapayId, x = {}) => { const tx = txs.get(fedapayId); Object.assign(tx, { status: 'approved', approved_at: new Date().toISOString(), mode: 'mtn_open', fees: 593, ...x }); };
const demande = (id) => T.mnd_pay.find((x) => x.id === id)?.data;
const pieceDe = (id) => T.invoices.find((x) => x.id === id)?.data;
const rdvDe = (id) => T.appointments.find((x) => x.id === id)?.data;
const versFedaPay = (quoi) => journal.filter((j) => j.quoi.startsWith(`fedapay ${quoi ?? ''}`));
const JOUR = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const JETON = '23456789abcdef';
const JETON2 = 'abcdefghjkmnpq';
const JETON_INCONNU = 'zzzzzzzzzzzzzz';
const reglages = (x = {}) => { T.documents = [{ key: 'mnd_settings', data: { mndPay: { actif: true, tauxMobilePct: 1.8, tauxCartePct: 3, ...x } } }]; };

/** Le monde d'une séance : son rendez-vous du jour (son jeton), sa pièce. */
function seance(o = {}) {
  const id = o.id ?? 'r1';
  const pid = o.pid ?? 'p1';
  T.appointments.push({ id, branch_id: 'br-1', updated_at: estampe(), data: {
    id, clientId: 'c1', clientName: 'Paulette KOSSOU', date: o.date ?? JOUR, time: '08:30', status: o.status ?? 'confirmé', payments: [],
    lienDeReglement: { jeton: o.jeton ?? JETON, creeLe: '2026-11-12T08:00:00Z' }, ...(o.rdv ?? {}),
  } });
  if (o.piece !== false) {
    T.invoices.push({ id: pid, branch_id: 'br-1', updated_at: estampe(), data: {
      id: pid, kind: 'facture', status: 'émise', apptId: id, clientId: 'c1', number: 'MND-2026-0900', date: JOUR,
      lines: [{ label: 'SÍNSIN Essentiel', qty: 1, unitXof: o.du ?? 30000 }], payments: [], ...(o.pieceData ?? {}),
    } });
  }
}

/* ── La santé et la porte du personnel ne bougent pas ── */
{
  remiseAZero();
  const g = await appelle('mndPay', { method: 'GET' });
  dit('le GET de mnd-pay : sa version 2026-11-12-b, la cle FedaPay dite posee, jamais sa valeur', g.status === 200 && g.o?.version === '2026-11-12-b' && g.o?.secrets?.fedapay === true && g.o?.secrets?.cle === 'sandbox', g.t);
  const w = await appelle('webhook', { method: 'GET' });
  dit('le GET du webhook : sa version 2026-11-12-b', w.o?.version === '2026-11-12-b', w.t);
  const sans = await personnel({ action: 'demander', moyen: 'au_choix', montantXof: 1000, branchId: 'br-1', pieceId: 'p1' }, null);
  const cliente = await personnel({ action: 'demander', moyen: 'au_choix', montantXof: 1000, branchId: 'br-1', pieceId: 'p1' }, 'jwt-de-cliente');
  const publique = await page({ action: 'demander', moyen: 'au_choix', montantXof: 1000, branchId: 'br-1', pieceId: 'p1' });
  dit('les gestes du personnel restent au personnel : sans session 401, une cliente 403, la cle publique 403, et FedaPay n est pas appele',
    sans.status === 401 && cliente.status === 403 && publique.status === 403 && versFedaPay().length === 0, [sans.status, cliente.status, publique.status].join(' '));
}

/* ── Le jeton ── */
{
  remiseAZero(); ip = 10; reglages(); seance();
  const mal = await page({ action: 'regler-demander', jeton: 'abc' });
  const inconnu = await page({ action: 'regler-demander', jeton: JETON_INCONNU, rdvId: 'r1' });
  dit('un jeton mal forme : 400 ; un jeton inconnu : 404, meme avec l identifiant du rendez-vous ; rien au registre, rien chez FedaPay',
    mal.status === 400 && mal.o?.erreur === 'lien' && inconnu.status === 404 && inconnu.o?.erreur === 'lien' && T.mnd_pay.length === 0 && versFedaPay().length === 0, `${mal.t} ${inconnu.t}`);
  seance({ id: 'r9', pid: 'p9', jeton: JETON2 }); seance({ id: 'r10', pid: 'p10', jeton: JETON2 });
  const double = await page({ action: 'regler-demander', jeton: JETON2 });
  dit('un jeton porte par deux rendez-vous ne regle personne', double.status === 404 && T.mnd_pay.length === 0, double.t);
  T.appointments.find((a) => a.id === 'r1').data.status = 'annulé';
  const annule = await page({ action: 'regler-demander', jeton: JETON });
  dit('un rendez-vous annule ne se regle pas', annule.status === 409 && annule.o?.erreur === 'annule' && T.mnd_pay.length === 0, annule.t);
}

/* ── FedaPay fermé par la Maison ── */
{
  remiseAZero(); ip = 11; seance();
  const o1 = await page({ action: 'regler-ouvert', jeton: JETON });
  const d1 = await page({ action: 'regler-demander', jeton: JETON });
  reglages({ actif: false });
  const o2 = await page({ action: 'regler-ouvert', jeton: JETON });
  const d2 = await page({ action: 'regler-demander', jeton: JETON });
  reglages();
  const o3 = await page({ action: 'regler-ouvert', jeton: JETON });
  dit('sans reglages, ou FedaPay eteint : ferme, la demande refusee, rien au registre ; allume : ouvert et ses deux taux, rien d autre',
    o1.o?.ouverte === false && d1.status === 503 && d1.o?.erreur === 'fermee' && o2.o?.ouverte === false && !o2.o?.taux && d2.status === 503 && T.mnd_pay.length === 0 && versFedaPay().length === 0
    && o3.o?.ouverte === true && egal(o3.o?.taux, { tauxMobilePct: 1.8, tauxCartePct: 3 }) && egal(Object.keys(o3.o ?? {}).sort(), ['ok', 'ouverte', 'taux', 'version']), `${o1.t} ${d1.t} ${o3.t}`);
}

/* ── La demande : le montant du serveur, ses frais, son merci, le registre avant l'appel ── */
let idNominale; let fpNominale;
{
  remiseAZero(); ip = 12; reglages(); seance();
  const r = await page({ action: 'regler-demander', jeton: JETON, pourboireXof: 2000, montantXof: 5, totalXof: 5, fraisXof: 0, retour: 'https://maison-essai.example/trone/regler.html' });
  idNominale = r.o?.id;
  const d = demande(idNominale);
  fpNominale = d?.fedapayId;
  const posteFp = versFedaPay('POST /transactions').find((j) => j.quoi === 'fedapay POST /transactions');
  dit('la demande : le reste de SA piece (30 000 F), son merci (2 000 F), les frais au taux de la Maison (960 F) ; ce que la page dit du montant est ignore',
    r.status === 200 && r.o?.montantXof === 30000 && r.o?.pourboireXof === 2000 && r.o?.fraisXof === 960 && r.o?.totalXof === 32960 && posteFp?.corps?.amount === 32960
    && d?.montantXof === 30000 && d?.pourboireXof === 2000 && d?.fraisXof === 960 && d?.totalXof === 32960, r.t);
  dit('... au registre : genre « regler », son rendez-vous et sa piece, en attente, la transaction et sa page ; ni nom ni numero dans le libelle de FedaPay',
    d?.genre === 'regler' && d?.rdvId === 'r1' && d?.pieceId === 'p1' && d?.statut === 'en_attente' && d?.moyen === 'au_choix' && Number(d?.fedapayId) > 0 && /^https:\/\/checkout-essai/.test(d?.url ?? '')
    && T.mnd_pay[0]?.branch_id === 'br-1' && posteFp?.corps?.description === 'Maison MND · règlement de la séance' && /^mp-[0-9a-f]{20}$/.test(idNominale ?? ''), JSON.stringify(d));
  const iRegistre = journal.findIndex((j) => j.quoi === 'insert mnd_pay');
  const iFedaPay = journal.findIndex((j) => j.quoi === 'fedapay POST /transactions');
  dit('... la demande ecrite au registre AVANT l appel a FedaPay', iRegistre >= 0 && iFedaPay > iRegistre, `${iRegistre} ${iFedaPay}`);
  dit('... FedaPay la ramene a la page Regler de la Maison, la suite ecrite par le serveur (r = son jeton, fp = sa demande)',
    posteFp?.corps?.callback_url === `https://maison-essai.example/trone/regler.html?r=${JETON}&fp=${idNominale}`, posteFp?.corps?.callback_url);
  dit('... la page recoit sa demande, sa page de paiement et ses montants, sans cle ni identifiant de FedaPay',
    egal(Object.keys(r.o ?? {}).sort(), ['fraisXof', 'id', 'montantXof', 'ok', 'pourboireXof', 'totalXof', 'url', 'version']), r.t);
  dit('... la piece n a pas bouge : rien n est regle sur la seule demande', (pieceDe('p1').payments ?? []).length === 0 && pieceDe('p1').status === 'émise', JSON.stringify(pieceDe('p1')));

  const again = await page({ action: 'regler-demander', jeton: JETON, pourboireXof: 2000 });
  dit('deux touchers au meme total : la meme demande, aucune seconde transaction', again.o?.id === idNominale && again.o?.deja === true && versFedaPay('POST /transactions').filter((j) => j.quoi === 'fedapay POST /transactions').length === 1, again.t);
  const autre = await page({ action: 'regler-demander', jeton: JETON, pourboireXof: 1000 });
  dit('un autre merci : une demande neuve, l ancienne remplacee (annulee), jamais deux en attente',
    autre.status === 200 && autre.o?.id !== idNominale && autre.o?.totalXof === 31930 && demande(idNominale)?.statut === 'annulee' && T.mnd_pay.filter((x) => x.data.statut === 'en_attente').length === 1, autre.t);
}
{
  remiseAZero(); ip = 13; reglages(); seance({ pieceData: { tipXof: 500 } });
  const r = await page({ action: 'regler-demander', jeton: JETON, pourboireXof: 2000 });
  dit('une piece qui porte deja un merci : aucun merci de plus, les frais sur le reste seul', r.o?.pourboireXof === 0 && r.o?.totalXof === 30900, r.t);
  remiseAZero(); ip = 14; reglages(); seance();
  const g = await page({ action: 'regler-demander', jeton: JETON, pourboireXof: 900000 });
  const n = await page({ action: 'regler-demander', jeton: JETON, pourboireXof: -5000 }, 15);
  dit('le merci plafonne a 100 000 F ; un merci negatif ne retire rien', g.o?.pourboireXof === 100000 && n.o?.pourboireXof === 0 && n.o?.montantXof === 30000, `${g.t} ${n.t}`);
  remiseAZero(); ip = 16; reglages({ tauxCartePct: 'trois' }); seance();
  const t = await page({ action: 'regler-demander', jeton: JETON });
  dit('un taux illisible dans les reglages : le taux par defaut (1,8 %), jamais NaN', t.o?.fraisXof === 540 && t.o?.totalXof === 30540, t.t);
  remiseAZero(); ip = 17; reglages(); seance({ du: 6_000_000 });
  const p = await page({ action: 'regler-demander', jeton: JETON });
  dit('au-dela de 5 000 000 F : refuse, rien chez FedaPay', p.status === 400 && p.o?.erreur === 'montant' && versFedaPay().length === 0, p.t);
  remiseAZero(); ip = 18; reglages(); seance({ pieceData: { payments: [{ id: 'esp-1', amountXof: 30000 }] } });
  const deja = await page({ action: 'regler-demander', jeton: JETON });
  dit('une seance deja reglee ne se redemande pas', deja.status === 409 && deja.o?.erreur === 'deja_reglee' && T.mnd_pay.length === 0, deja.t);
  remiseAZero(); ip = 19; reglages(); seance({ piece: false });
  const sp = await page({ action: 'regler-demander', jeton: JETON });
  dit('sans piece encore : « pas encore pret », rien au registre', sp.status === 409 && sp.o?.erreur === 'sans_piece' && T.mnd_pay.length === 0, sp.t);
}

/* ── L'adresse de retour ── */
{
  remiseAZero(); ip = 20; reglages(); seance();
  await page({ action: 'regler-demander', jeton: JETON, retour: 'https://autre-site.example/regler.html' });
  const a = versFedaPay('POST /transactions').find((j) => j.quoi === 'fedapay POST /transactions')?.corps?.callback_url;
  remiseAZero(); reglages(); seance();
  await page({ action: 'regler-demander', jeton: JETON, retour: 'https://maison-essai.example/trone/regler.html?r=autre&fp=x' }, 21);
  const b = versFedaPay('POST /transactions').find((j) => j.quoi === 'fedapay POST /transactions')?.corps?.callback_url;
  dit('l adresse d un autre site est ignoree ; la suite que la page aurait ecrite aussi', /^https:\/\/maison-essai\.example\/trone\/regler\.html\?r=23456789abcdef&fp=mp-[0-9a-f]{20}$/.test(a ?? '') && /^https:\/\/maison-essai\.example\/trone\/regler\.html\?r=23456789abcdef&fp=mp-[0-9a-f]{20}$/.test(b ?? ''), `${a} ${b}`);
}

/* ── La limite de débit ── */
{
  remiseAZero(); ip = 30; reglages(); seance();
  const statuts = [];
  for (let i = 0; i < 13; i++) statuts.push((await page({ action: 'regler-demander', jeton: JETON, pourboireXof: i * 100 })).status);
  dit('douze demandes par adresse en dix minutes, pas une de plus (429)', statuts.slice(0, 12).every((s) => s === 200) && statuts[12] === 429 && versFedaPay('POST /transactions').filter((j) => j.quoi === 'fedapay POST /transactions').length === 12, statuts.join(' '));
  const lu = [];
  const id = T.mnd_pay.find((x) => x.data.statut === 'en_attente')?.id;
  for (let i = 0; i < 151; i++) lu.push((await page({ action: 'regler-statut', jeton: JETON, id }, 31)).status);
  dit('cent cinquante lectures de statut par adresse en dix minutes, pas une de plus', lu.slice(0, 150).every((s) => s === 200) && lu[150] === 429, `${lu.filter((s) => s === 200).length} / ${lu[150]}`);
}

/* ── Le registre, et FedaPay muet ── */
{
  remiseAZero(); ip = 40; reglages(); seance();
  registreRefuse = true;
  const r = await page({ action: 'regler-demander', jeton: JETON });
  dit('le registre refuse la demande : rien n est demande a FedaPay', r.status === 503 && r.o?.erreur === 'registre' && versFedaPay().length === 0, r.t);
  registreRefuse = false;
  fedapayMuet = true;
  const m = await page({ action: 'regler-demander', jeton: JETON }, 41);
  const d = T.mnd_pay[0]?.data;
  dit('FedaPay muet : 502 « indisponible », la demande close « annulee » sans page de paiement, rien d autre dit',
    m.status === 502 && m.o?.erreur === 'indisponible' && !m.o?.url && d?.statut === 'annulee' && !d?.url && egal(Object.keys(m.o ?? {}).sort(), ['erreur', 'version']), `${m.t} ${JSON.stringify(d)}`);
  fedapayMuet = false;
}

/* ── Le statut : SA demande, et rien d'autre ── */
{
  remiseAZero(); ip = 50; reglages(); seance(); seance({ id: 'r2', pid: 'p2', jeton: JETON2 });
  const a = await page({ action: 'regler-demander', jeton: JETON });
  const b = await page({ action: 'regler-demander', jeton: JETON2 }, 51);
  const s1 = await page({ action: 'regler-statut', jeton: JETON, id: a.o?.id });
  const croise = await page({ action: 'regler-statut', jeton: JETON, id: b.o?.id });
  const faux = await page({ action: 'regler-statut', jeton: JETON, id: 'mp-00000000000000000000' });
  const mal = await page({ action: 'regler-statut', jeton: JETON, id: '../p1' });
  dit('le statut d une demande en attente : « attente », ses montants, rien d autre (ni FedaPay, ni piece, ni page)',
    s1.status === 200 && s1.o?.etat === 'attente' && s1.o?.regleXof === 30000 && s1.o?.totalXof === 30900 && egal(Object.keys(s1.o ?? {}).sort(), ['etat', 'ok', 'regleXof', 'totalXof', 'version']), s1.t);
  dit('la demande d un autre rendez-vous, une demande inconnue : la meme reponse « introuvable » ; un identifiant mal forme : 400',
    croise.status === 404 && croise.o?.erreur === 'introuvable' && faux.status === 404 && faux.t.replace(/"version":"[^"]+"/, '') === croise.t.replace(/"version":"[^"]+"/, '') && mal.status === 400, `${croise.t} ${faux.t} ${mal.t}`);
  /* Une demande du personnel (un lien de Factures) ne se lit pas par une page Régler. */
  T.mnd_pay.push({ id: 'mp-11111111111111111111', branch_id: 'br-1', updated_at: estampe(), data: { id: 'mp-11111111111111111111', genre: 'lien', rdvId: 'r1', pieceId: 'p1', statut: 'en_attente', montantXof: 1, totalXof: 1 } });
  const staff = await page({ action: 'regler-statut', jeton: JETON, id: 'mp-11111111111111111111' });
  dit('une demande du personnel ne se lit pas par la page Regler', staff.status === 404, staff.t);
}

/* ── La pose sans Trône : le webhook ── */
{
  remiseAZero(); ip = 60; reglages(); seance({ rdv: { termineParElle: { le: '2026-11-12T08:50:00Z', par: 'couronne' } } });
  const r = await page({ action: 'regler-demander', jeton: JETON, pourboireXof: 2000 });
  const id = r.o?.id;
  const fp = demande(id)?.fedapayId;
  const muet = await webhook(fp, false);
  dit('un appel non signe ne fait rien bouger', muet.status === 401 && demande(id)?.statut === 'en_attente' && (pieceDe('p1').payments ?? []).length === 0, muet.t);
  approuve(fp);
  const w = await webhook(fp);
  const p = pieceDe('p1');
  const v = (p.payments ?? [])[0];
  dit('FedaPay confirme (webhook signe, transaction relue) : la piece se regle SEULE, sans Trone ouvert',
    w.status === 200 && w.o?.pose === true && demande(id)?.statut === 'payee' && !!demande(id)?.poseLe && p.status === 'payée' && p.payments.length === 1, `${w.t} ${JSON.stringify(p)}`);
  dit('... le versement : l identifiant de la demande, 30 000 F, MTN MoMo (le moyen vraiment pris), caisse FedaPay ; le merci a part ; la trace pour le Trone',
    v?.id === id && v?.amountXof === 30000 && v?.method === 'MTN MoMo' && v?.cashbox === 'FedaPay' && p.tipXof === 2000 && p.reglementsEnLigne?.[0]?.id === id && p.reglementsEnLigne?.[0]?.pourboireXof === 2000 && p.reglementsEnLigne?.[0]?.fraisXof === 960, JSON.stringify(p));
  const rd = rdvDe('r1');
  dit('... le rendez-vous suit (meme versement, sa piece nommee, son lien dit paye) ; elle avait termine elle-meme : honore',
    rd.payments?.[0]?.id === id && rd.payments?.[0]?.invoiceId === 'p1' && rd.paidXof === 30000 && !!rd.lienDeReglement?.payeLe && rd.status === 'honoré' && !!rd.honoreAuReglement?.le, JSON.stringify(rd));
  dit('... la caisse FedaPay de la branche nait (le meme identifiant que celle du Trone)', T.cashboxes.length === 1 && T.cashboxes[0].id === 'cb-mndpay-br-1' && T.cashboxes[0].data.name === 'FedaPay', JSON.stringify(T.cashboxes));
  const w2 = await webhook(fp);
  dit('un rejeu de FedaPay ne double rien', w2.status === 200 && pieceDe('p1').payments.length === 1 && pieceDe('p1').tipXof === 2000 && rdvDe('r1').payments.length === 1 && T.cashboxes.length === 1, w2.t);
  const s = await page({ action: 'regler-statut', jeton: JETON, id });
  dit('la page relit : « payee », 32 000 F reglent la seance, elle peut partir', s.o?.etat === 'payee' && s.o?.regleXof === 32000 && s.o?.honore === true && pieceDe('p1').payments.length === 1, s.t);
}

/* ── La pose par la relecture de la page, quand le webhook tarde ── */
{
  remiseAZero(); ip = 70; reglages(); seance();
  const r = await page({ action: 'regler-demander', jeton: JETON });
  const id = r.o?.id;
  const s0 = await page({ action: 'regler-statut', jeton: JETON, id });
  dit('FedaPay dit « en attente » : la page attend, la piece intacte', s0.o?.etat === 'attente' && (pieceDe('p1').payments ?? []).length === 0, s0.t);
  approuve(demande(id)?.fedapayId, { mode: 'card' });
  const s = await page({ action: 'regler-statut', jeton: JETON, id });
  dit('le webhook tarde : la relecture de la page relit FedaPay et pose la seance elle-meme (carte)', s.o?.etat === 'payee' && pieceDe('p1').payments?.[0]?.method === 'Carte' && pieceDe('p1').status === 'payée' && !!demande(id)?.poseLe && s.o?.honore === undefined, s.t);
  const w = await webhook(demande(id)?.fedapayId);
  dit('... puis le webhook arrive : rien de plus', w.status === 200 && pieceDe('p1').payments.length === 1, w.t);
  fedapayMuet = true;
  remiseAZero(); ip = 71; reglages(); seance();
  const r2 = await page({ action: 'regler-demander', jeton: JETON });
  fedapayMuet = true;
  const s2 = await page({ action: 'regler-statut', jeton: JETON, id: r2.o?.id });
  dit('FedaPay muet a la relecture : la page dit ce que le registre sait, sans tomber', s2.status === 200 && s2.o?.etat === 'attente', s2.t);
  fedapayMuet = false;
}

/* ── À rapprocher, montant court, écriture sous condition, contrat ── */
{
  remiseAZero(); ip = 80; reglages(); seance();
  const r = await page({ action: 'regler-demander', jeton: JETON, pourboireXof: 1000 });
  T.invoices[0].data.payments = [{ id: 'esp-1', amountXof: 30000, cashbox: 'Tiroir' }];
  T.invoices[0].data.status = 'payée';
  approuve(demande(r.o?.id)?.fedapayId);
  await webhook(demande(r.o?.id)?.fedapayId);
  dit('reglee au comptoir entre-temps : l argent reste au registre « a rapprocher », la piece n est pas payee deux fois',
    demande(r.o?.id)?.statut === 'payee' && demande(r.o?.id)?.aRapprocher === 'deja_reglee' && pieceDe('p1').payments.length === 1 && !pieceDe('p1').tipXof, JSON.stringify(demande(r.o?.id)));

  remiseAZero(); ip = 81; reglages(); seance();
  const b = await page({ action: 'regler-demander', jeton: JETON });
  T.invoices[0].data.lines = [{ label: 'SÍNSIN Essentiel', qty: 1, unitXof: 20000 }];
  approuve(demande(b.o?.id)?.fedapayId);
  await webhook(demande(b.o?.id)?.fedapayId);
  dit('un reste qui a baisse : a rapprocher, jamais un merci invente', demande(b.o?.id)?.aRapprocher === 'reste_change' && (pieceDe('p1').payments ?? []).length === 0, JSON.stringify(demande(b.o?.id)));

  remiseAZero(); ip = 82; reglages(); seance();
  const c = await page({ action: 'regler-demander', jeton: JETON });
  approuve(demande(c.o?.id)?.fedapayId, { amount: 1000 });
  await webhook(demande(c.o?.id)?.fedapayId);
  dit('FedaPay recoit moins que le total demande : refusee, rien sur la piece', demande(c.o?.id)?.statut === 'refusee' && (pieceDe('p1').payments ?? []).length === 0, JSON.stringify(demande(c.o?.id)));

  remiseAZero(); ip = 83; reglages(); seance();
  const e = await page({ action: 'regler-demander', jeton: JETON });
  aCourse = { id: 'p1', versement: { id: 'esp-2', amountXof: 5000, cashbox: 'Tiroir' } };
  T.invoices[0].data.lines = [{ label: 'SÍNSIN Essentiel', qty: 1, unitXof: 35000 }];
  approuve(demande(e.o?.id)?.fedapayId);
  await webhook(demande(e.o?.id)?.fedapayId);
  dit('le comptoir ecrit la piece entre la lecture et l ecriture du serveur : rien ne se perd, la piece relue, les deux versements',
    egal((pieceDe('p1').payments ?? []).map((x) => x.id).sort(), ['esp-2', e.o?.id].sort()) && pieceDe('p1').status === 'payée', JSON.stringify(pieceDe('p1').payments));

  remiseAZero(); ip = 84; reglages(); seance();
  T.subscribers.push({ id: 'sub-1', branch_id: 'br-1', data: { id: 'sub-1', invoiceId: 'p1', planId: 'pl-1' } });
  const k = await page({ action: 'regler-demander', jeton: JETON });
  rpcRefuse = true;
  approuve(demande(k.o?.id)?.fedapayId);
  await webhook(demande(k.o?.id)?.fedapayId);
  dit('la piece d un contrat ne s ecrit jamais ici : le contrat refuse, elle reste « a rapprocher », la piece intacte',
    demande(k.o?.id)?.aRapprocher === 'contrat' && (pieceDe('p1').payments ?? []).length === 0, JSON.stringify(demande(k.o?.id)));
  remiseAZero(); ip = 85; reglages(); seance();
  T.subscribers.push({ id: 'sub-1', branch_id: 'br-1', data: { id: 'sub-1', invoiceId: 'p1', planId: 'pl-1' } });
  const k2 = await page({ action: 'regler-demander', jeton: JETON });
  approuve(demande(k2.o?.id)?.fedapayId);
  await webhook(demande(k2.o?.id)?.fedapayId);
  dit('... le contrat accepte : le seul chemin de l argent (verse_sur_l_abonnement) porte la piece, une fois', (pieceDe('p1').payments ?? []).length === 1 && journal.some((j) => j.quoi === 'rpc verse_sur_l_abonnement') && !!demande(k2.o?.id)?.poseLe, JSON.stringify(pieceDe('p1').payments));
}

/* ── Une coupure de la base : le webhook rend 500, FedaPay rejoue, la pose reprend ── */
{
  remiseAZero(); ip = 86; reglages(); seance();
  const r = await page({ action: 'regler-demander', jeton: JETON });
  const fp = demande(r.o?.id)?.fedapayId;
  approuve(fp);
  pannes.invoices = 1;
  const w1 = await webhook(fp);
  const avant = (pieceDe('p1').payments ?? []).length;
  const w2 = await webhook(fp);
  dit('la pose coupee par la base : le webhook rend 500 (FedaPay rejoue), et le rejeu « deja payee » reprend la pose, sans la page',
    w1.status === 500 && avant === 0 && demande(r.o?.id)?.statut === 'payee' && w2.status === 200 && w2.o?.pose === true && pieceDe('p1').payments?.length === 1, `${w1.t} ${w2.t}`);
  pannes.appointments = 1;
  const p = await page({ action: 'regler-demander', jeton: JETON }, 87);
  dit('une panne imprevue de la page Regler : 500 « serveur », rien de ce que la Maison sait', p.status === 500 && egal(Object.keys(p.o ?? {}).sort(), ['erreur', 'version']) && p.o?.erreur === 'serveur', p.t);
}

/* ── Le Trône relit une demande de la page restée sans pose ── */
{
  remiseAZero(); ip = 90; reglages(); seance();
  const r = await page({ action: 'regler-demander', jeton: JETON });
  const id = r.o?.id;
  const ligne = T.mnd_pay.find((x) => x.id === id);
  approuve(ligne.data.fedapayId);
  ligne.data = { ...ligne.data, statut: 'payee', payeeLe: new Date().toISOString() };
  const s = await personnel({ action: 'statut', id });
  dit('« La poser sur sa piece » au Trone : la relecture du personnel pose la seance restee sans pose', s.status === 200 && !!s.o?.demande?.poseLe && pieceDe('p1').payments?.[0]?.id === id, s.t);
}

/* ── Aucune clé dans aucune réponse ── */
dit(`aucune cle (service, FedaPay, webhook) dans aucune des ${reponses.length} reponses du banc`, reponses.every((t) => !SECRETS.some((s) => t.includes(s))), reponses.find((t) => SECRETS.some((s) => t.includes(s)))?.slice(0, 300));
dit('aucun appel hors du monde simule (ni base reelle, ni FedaPay reel)', !journal.some((j) => j.quoi.startsWith('hors du monde')), JSON.stringify(journal.filter((j) => j.quoi.startsWith('hors du monde'))));

/* ══ 4. LA PAGE ET LE TRÔNE, dans leur texte ══ */
{
  const app = sansCommentaires(lis(APP));
  dit('la page : KkiaPay comme avant quand il marche ; FedaPay seulement quand KkiaPay ne s ouvre pas (ou au retour de FedaPay) ; une panne de KkiaPay seulement, jamais son annulation',
    /\{kkiapayPeutSOuvrir\(\) && retourFp !== 'lecture' && \(/.test(app) && /disabled=\{ecran\.k === 'paiement' \|\| mtnOccupe\}/.test(app)
    && /\{\(kkiaEnPanne \|\| \(!!retourFp && retourFp !== 'lecture'\)\) && \(!p\.sansPiece && !p\.tetes/.test(app)
    && /if \(estUnePanneDeKkiapay\(e\)\) \{ setKkiaEnPanne\(true\);/.test(app) && /useState\(\(\) => !kkiapayPeutSOuvrir\(\)\)/.test(app), '');
  dit('la page : FedaPay se tient a l ecart pendant une demande MTN, un paiement qui part, un retour qui se confirme',
    /bloque=\{mtnOccupe \|\| ecran\.k === 'paiement' \|\| retourFp === 'lecture'\}/.test(app), '');
  dit('au retour de FedaPay : l etat de SA demande relu au serveur, jamais ce que l adresse dit ; « reglee » seulement sur « payee »',
    /const s = await statutFedaPay\(jeton, demandeFp\);/.test(app) && /if \(s\.etat === 'payee'\) \{/.test(app) && !/get\('status'\)/.test(app) && /for \(const k of \['fp', 'id', 'status'\]\) u\.searchParams\.delete\(k\);/.test(app), '');
  const bloc = sansCommentaires(lis(BLOC));
  const client = sansCommentaires(lis(CLIENT_PAGE));
  dit('le bloc FedaPay dit ses frais avant le geste, par la regle du serveur, et n envoie que le jeton, le merci et l adresse de la page',
    /compteDuLien\(\{ resteXof: reste, merciXof, merciPermis,/.test(bloc) && /Frais de FedaPay, ajoutés/.test(bloc)
    && /demandeFedaPay\(jeton, merciPermis \? merciXof : 0, `\$\{window\.location\.origin\}\$\{window\.location\.pathname\}`\)/.test(bloc)
    && /appel\(\{ action: 'regler-demander', jeton, pourboireXof, retour \}\)/.test(client) && !/montantXof|totalXof:/.test(client.replace(/montantXof\?: number; pourboireXof\?: number; fraisXof\?: number; totalXof\?: number;/, '')), '');
  dit('aucun domaine ecrit dans les fichiers neufs', ![PUR, BLOC, CLIENT_PAGE, 'scripts/fedapay-copie-serveur.mjs'].some((f) => /maisonmnd|\.com\b/i.test(lis(f))) && (lis(MP).match(/maisonmnd\.com/g) ?? []).length === 1, '');
  dit('la page n emporte pas l ERP (ni identite, ni synchro, ni supabase, ni finance)', ![APP, BLOC, CLIENT_PAGE, PUR].some((f) => /shared\/(identite|sync|supabase|finance)'|from '\.\/(identite|sync|supabase|finance)'/.test(lis(f))), '');
  const lien = sansCommentaires(lis(LIEN));
  dit('LienMndPay : FedaPay muet, une ligne et, a la place, la page Regler du rendez-vous de la piece (poser au toucher) ; sans rendez-vous, la ligne seule',
    /const sante = useLaSanteDesMoyens\(/.test(lien) && /if \(sante\.fedapay\.ouvert && !sante\.fedapay\.repond\) \{/.test(lien) && /const j = apptId \? poseLeLienDeReglement\(apptId\) : null;/.test(lien)
    && /motDuLienRegler\(appel, fmtMoney\(resteXof, currency\), adresseDuLien\(j\)\)/.test(lien) && /\{aSonRdv && \(/.test(lien) && /cheminDeLaConversation\(telephone, msg\)/.test(lien), '');
  dit('LienMndPay : une vraie demande muette s apprend a la sante, une reussite l efface',
    /if \(!r\.ok\) \{ if \(r\.panne\) signaleUnePanne\('fedapay'\); setErreur\(r\.erreur\); return; \}\s*signaleUneReussite\('fedapay'\);/.test(lien), '');
  dit('Factures donne a LienMndPay le rendez-vous de la piece ; la carte d abonnement non (une piece de contrat)', /apptId=\{selected\.apptId\}/.test(lis(FACTURES)) && !/apptId=/.test(lis('src/apps/trone/routes/clients/CarteAbonnement.tsx')), '');
  const journalTexte = sansCommentaires(lis(JOURNAL));
  dit('le journal : une demande de la page Regler sans pose se relit sur SA piece (jamais une seconde piece) ; a rapprocher, dit en clair',
    /d\.genre === 'regler' && !d\.aRapprocher\s*\? <button[^>]*onClick=\{\(\) => \{ void relisLaDemande\(d\.id\)/.test(journalTexte) && /reste_change: 'le reste de sa pièce avait changé'/.test(journalTexte), '');
  const mp = lis(MP);
  dit('mnd-pay : la page Regler passe avant toute session, et la porte du personnel reste celle d avant (is_staff)',
    mp.indexOf("if (action.startsWith('regler-')) {") > 0 && mp.indexOf("if (action.startsWith('regler-')) {") < mp.indexOf("const { data: estPersonnel, error: errStaff } = await commeAppelant.rpc('is_staff');"), '');
}

console.log(echecs === 0 ? `\nRegler par FedaPay tient : ${oks} controles.` : `\n${echecs} controle(s) en echec sur ${oks + echecs}.`);
process.exit(echecs === 0 ? 0 : 1);
