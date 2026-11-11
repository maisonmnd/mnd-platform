import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ecartsDesCopies } from './collecte-copie-serveur.mjs';

/* RÉGLER PAR MTN, ÉPROUVÉ · 11 novembre 2026 (maquette AdAaYXGStQetsXHFkZzUW5).
   Deux bancs en un :
   - les RÈGLES PURES (src/shared/collecte-mtn-pur.ts), regroupées ici ;
   - les VRAIS fichiers du serveur (supabase/functions/collecte-mtn et
     mtn-momo-rappel), transpilés et servis par un faux Deno, contre un faux
     relais MTN et une fausse base. Aucun appel ne sort : fetch est remplacé.
   Lot A : aucun argent ne bouge. La direction seule lit le solde et fait
   l'essai sans argent ; tout passe par le relais, avec les clés de COLLECTE
   (jamais celles de la paie) ; aucune clé ni aucun jeton dans une réponse ;
   le numéro de collecte vient d'un réglage du serveur, jamais du dépôt.
   Lot B : l'interrupteur fermé ferme tout ; il ne s'ouvre qu'après un essai
   reçu ; la référence est écrite AVANT l'appel ; le montant est celui du
   serveur, jamais celui de la page ; « réglé » seulement sur SUCCESSFUL relu
   chez MTN (PENDING puis SUCCESSFUL, FAILED, rappel sans statut, rappel
   menteur, double rappel) ; une seule pose ; la caisse, la trace, les frais ;
   le comptoir ne dit que prénom, initiale et reste.
   `--prouve` : chaque faute est remise une à une dans le vrai fichier (copie
   gardée, restauration dans un finally, empreintes comparées), et le banc
   doit crier à chacune. Personnes, numéros et montants inventés. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const FONCTION = 'supabase/functions/collecte-mtn/index.ts';
const RAPPEL = 'supabase/functions/mtn-momo-rappel/index.ts';
const PUR = 'src/shared/collecte-mtn-pur.ts';
const BANDEAU = 'src/apps/trone/routes/finances/CompteDeCollecteMtn.tsx';
const CLIENT = 'src/apps/trone/routes/finances/collecte-mtn.ts';
const ENCAISSEMENTS = 'src/apps/trone/routes/finances/Encaissements.tsx';
const PAGE_MTN = 'src/apps/trone/routes/finances/MtnMoMo.tsx';
const ROUTES_DU_TRONE = 'src/apps/trone/routes/index.tsx';
const SQL = 'supabase/migrations/0200_regler_par_mtn.sql';
const PAGE = 'src/apps/regler/App.tsx';
const MTN_PAGE = 'src/apps/regler/Mtn.tsx';
const MAIN = 'src/apps/regler/main.tsx';
const SERVEUR_PAGE = 'src/shared/collecte-mtn-serveur.ts';
const CONFIRME = 'src/apps/trone/routes/clients/ConfirmeParMtn.tsx';
const ACTIONS = 'src/apps/trone/routes/clients/actions.tsx';
const QR = 'scripts/fabrique-le-qr-du-comptoir.mjs';
const CAISSES = 'src/shared/caisses-des-caissiers-pur.ts';
const PANNES = [
  /* Le serveur, lot A */
  ['n importe qui lit le solde', FONCTION, "  if (!moi || !DIRECTION.has(String(moi.role))) return null;", '  if (!moi) return null;'],
  ['le relais muet fait tomber la fonction', FONCTION, '  } catch {\n    return { http: 0, corps: null };\n  }', '  } finally { /* rien */ }'],
  ['MTN appele sans le relais', FONCTION, "    const r = await fetch(`${k.relais}${chemin}`, {", "    const r = await fetch(`https://proxy.momoapi.mtn.com${chemin}`, {"],
  ['la cle du relais oubliee', FONCTION, "      headers: { 'X-Relais-Cle': k.relaisCle, 'Ocp-Apim-Subscription-Key': k.abonnement, ...(init.headers ?? {}) },", "      headers: { 'Ocp-Apim-Subscription-Key': k.abonnement, ...(init.headers ?? {}) },"],
  ['les cles de la paie prises pour la collecte', FONCTION, "  abonnement: env('MOMO_PROD_COLLECTION_SUBSCRIPTION'),", "  abonnement: env('MOMO_PROD_DISBURSEMENT_SUBSCRIPTION'),"],
  ['le jeton demande a la paie', FONCTION, "  const r = await mtn('/collection/token/', {", "  const r = await mtn('/disbursement/token/', {"],
  ['une cle montree au GET', FONCTION, "    cles: { utilisateur: !!k.utilisateur, cle: !!k.cle, abonnement: !!k.abonnement, numero: !!c.numero, compte: !!c.compte },", '    cles: { utilisateur: k.utilisateur, cle: k.cle, abonnement: k.abonnement, numero: c.numero, compte: c.compte },'],
  ['l environnement mtnbenin oublie', FONCTION, "  return mtn(chemin, { ...init, headers: { Authorization: `Bearer ${j.jeton}`, 'X-Target-Environment': cles().cible, ...(init.headers ?? {}) } });", "  return mtn(chemin, { ...init, headers: { Authorization: `Bearer ${j.jeton}`, ...(init.headers ?? {}) } });"],
  ['sans les cles, l essai part quand meme', FONCTION, "    if (!pret()) return json({ ...sante(), le, ...leCompte(), soldeXof: null, souci: souciDuCompte({ pret: false }) }, 503);", ''],
  ['le numero de collecte ecrit en dur', FONCTION, "  numero: numeroDitMtn(env('MOMO_PROD_COLLECTION_NUMERO')) || null,", "  numero: '01 90 00 00 99',"],
  ['un numero illisible demande a MTN', FONCTION, "    if (msisdn && s.jetonHttp === 200) {", '    if (s.jetonHttp === 200) {'],
  ['le jeton se perd dans la reponse', FONCTION, "      jeton: { ok: s.jetonHttp === 200, http: s.jetonHttp },", "      jeton: { ok: s.jetonHttp === 200, http: s.jetonHttp, valeur: jetonDuPassage?.jeton },"],
  /* Le serveur, lot B */
  ['l interrupteur ferme n arrete plus la demande', FONCTION, "  if (!reglage.ouverte) return json({ erreur: 'fermee' }, 503);", ''],
  ['un reglage illisible vaut ouvert', FONCTION, '  if (!l) return { ouverte: false, rappel: false, lu: false };', '  if (!l) return { ouverte: true, rappel: true, lu: false };'],
  ['l interrupteur s ouvre sans essai recu', FONCTION, "        if (!peutOuvrirLaCollecte((Array.isArray(essais.corps) ? essais.corps : []) as CollecteMtn[])) {", '        if (false) {'],
  ['l equipe ouvre l interrupteur', FONCTION, "  if (['solde', 'essai', 'essai-paiement', 'interrupteur', 'relire'].includes(action)) {", "  if (action === 'interrupteur') return json({ ouverte: true });\n  if (['solde', 'essai', 'essai-paiement', 'interrupteur', 'relire'].includes(action)) {"],
  ['MTN appele quand le registre refuse la reference', FONCTION, "  if (!ins.ok) return json({ erreur: 'registre' }, 503);", ''],
  ['le montant pris de la page', FONCTION, "    msisdn, resteXof: reste, pourboireXof: pourboireLu(corps.pourboireXof, !((Number(piece.tipXof) || 0) > 0)),", "    msisdn, resteXof: Number(corps.montantXof ?? reste), pourboireXof: pourboireLu(corps.pourboireXof, !((Number(piece.tipXof) || 0) > 0)),"],
  ['le merci permis sur une piece qui en a deja un', FONCTION, "pourboireLu(corps.pourboireXof, !((Number(piece.tipXof) || 0) > 0))", 'pourboireLu(corps.pourboireXof, true)'],
  ['deux demandes a la fois', FONCTION, "  if (demandeEnCours((Array.isArray(vivantes.corps) ? vivantes.corps : []) as CollecteMtn[], rdv.id, Date.now())) return json({ erreur: 'en_cours' }, 409);", ''],
  ['la piece ecrite sans condition', FONCTION, "    const w = await base(`invoices?id=eq.${enc(piece.id)}${ligne.updated_at ? `&updated_at=eq.${enc(ligne.updated_at)}` : ''}`, {", '    const w = await base(`invoices?id=eq.${enc(piece.id)}`, {'],
  ['le rendez-vous ne suit plus sa piece', FONCTION, '    const s = await suisLeRdv(c.rdv_id, v, piece.id, resteDeLaPiece(neuve), quand.getTime());', "    const s = { honore: false, nom: '' };"],
  ['les frais de MTN oublies', FONCTION, "      await base('expenses', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ id: d.id, branch_id: branche, data: d }) });", ''],
  ['la caisse MTN ne nait pas', FONCTION, '    await laCaisse(branche);\n', ''],
  ['le recu gagne sans ecriture conditionnelle', FONCTION, "    }, c.etat);\n    if (recue && recue.genre === 'reglement') await poser(recue);", "    });\n    if (recue && recue.genre === 'reglement') await poser(recue);"],
  ['un recu reste sans pose apres une panne', FONCTION, "  for (const c of (Array.isArray(aPoser.corps) ? aPoser.corps : []) as CollecteMtn[]) {", '  for (const c of [] as CollecteMtn[]) {'],
  ['l adresse de rappel oubliee', FONCTION, "      ...(rappel ? { 'X-Callback-Url': `${PROJET()}/functions/v1/mtn-momo-rappel/collection` } : {}),", ''],
  ['le comptoir repond interrupteur ferme', FONCTION, "  if (!reglage.ouverte) return json({ ok: true, ouverte: false, rdvs: [] });", ''],
  ['la limite de debit oubliee', FONCTION, "  if (!(await permis(req, 'collecte-demander', 12))) return json({ erreur: 'trop' }, 429);", ''],
  /* Le rappel */
  ['le rappel ne demande plus de relecture', RAPPEL, "    await fetch(`${projet}/functions/v1/collecte-mtn`, {", '    if (false) await fetch(`${projet}/functions/v1/collecte-mtn`, {'],
  ['le rappel de la paie transmis a la collecte', RAPPEL, "  if (voie === 'collection' && reference && SERVICE()) {", '  if (reference && SERVICE()) {'],
  /* Les règles */
  ['un numero a huit chiffres se complete', PUR, "  if (c.length === 10 && c.startsWith('01')) c = `229${c}`;", "  if (c.length === 10 && c.startsWith('01')) c = `229${c}`;\n  if (c.length === 8) c = `22901${c}`;"],
  ['un numero Moov passe pour MTN', PUR, "const PREFIXES_MTN_DU_BENIN: readonly string[] = ['42', '46',", "const PREFIXES_MTN_DU_BENIN: readonly string[] = ['95', '42', '46',"],
  ['le masque montre tout le numero', PUR, "  return d ? `${d.slice(0, 5)} •• •• ${d.slice(-2)}` : '';", '  return d;'],
  ['un solde absent devient zero', PUR, "  if (c?.availableBalance === undefined || c?.availableBalance === null || c?.availableBalance === '') return null;", ''],
  ['le relais muet se tait', PUR, "  if (j === 0) return 'Le relais MTN ne répond pas : le serveur de la Maison est-il allumé ?';", ''],
  ['PENDING vaut paye', PUR, "    if (s === 'SUCCESSFUL') return { etat: 'recu',", "    if (s === 'SUCCESSFUL' || s === 'PENDING') return { etat: 'recu',"],
  ['un refus reste en attente', PUR, "    if (['FAILED', 'REJECTED', 'TIMEOUT', 'EXPIRED', 'CANCELLED', 'CANCELED'].includes(s)) {", '    if (false) {'],
  ['une demande acceptee se renvoie quand MTN l oublie', PUR, "    if (etatAvant === 'attente') return { etat: 'attente' };\n", ''],
  ['les renvois sans fin', PUR, '    if (tentatives < MAX_TENTATIVES_MTN) return { etat: etatAvant, renvoie: true };', '    return { etat: etatAvant, renvoie: true };'],
  ['un silence de MTN vaut refus', PUR, "  if (http === 0 || http >= 500) return { etat: 'sans-reponse' };", "  if (http === 0 || http >= 500) return { etat: 'refuse', raison: 'SILENCE' };"],
  ['MTN relu sans frein', PUR, '  return !Number.isFinite(lue) || maintenantMs - lue >= RELECTURE_MIN_MS;', '  return true;'],
  ['un reste qui baisse invente un merci', PUR, "  if (demandeXof <= 0 || actuel < demandeXof) return { ok: false, raison: 'reste_change' };", ''],
  ['les frais a 1,9 %', PUR, 'const TAUX_DES_FRAIS_MTN = 0.012;', 'const TAUX_DES_FRAIS_MTN = 0.019;'],
  ['la caisse KkiaPay au lieu de MTN', PUR, "const CAISSE_MTN_COLLECTION = 'MTN Collection';", "const CAISSE_MTN_COLLECTION = 'KkiaPay';"],
  ['le numero entier sur la piece', PUR, "    note: `Réglé par MTN depuis le ${numeroMasque(o.msisdn)}", "    note: `Réglé par MTN depuis le ${numeroDitMtn(o.msisdn)}"],
  ['le merci perdu sur la piece', PUR, "    ...(pourboireXof > 0 ? { tipXof: (Number(p.tipXof) || 0) + Math.round(pourboireXof) } : {}),", ''],
  ['le comptoir dit le nom entier', PUR, "  return [prenom, initiale ? `${initiale}.` : ''].filter(Boolean).join(' ');", '  return nom;'],
  ['le comptoir rend l identifiant du rendez-vous', PUR, '  trouves.map((t, n) => ({ n, prenom: t.prenom,', '  trouves.map((t, n) => ({ n, rdvId: t.rdvId, prenom: t.prenom,'],
  ['le comptoir trouve un annule', PUR, " && x.rdv.status !== 'annulé')", ')'],
  ['le comptoir trouve un autre jour', PUR, "    .filter((x) => String(x.rdv.date ?? '').slice(0, 10) === o.jour && x.rdv.status !== 'annulé')", "    .filter((x) => x.rdv.status !== 'annulé')"],
  ['un essai a 1 000 F', PUR, 'const MONTANT_ESSAI_MTN_MAX = 500;', 'const MONTANT_ESSAI_MTN_MAX = 1000;'],
  /* La base */
  ['l equipe ecrit au registre', SQL, 'revoke all on public.collectes_mtn from anon, authenticated;', '-- (revoke retire)'],
  ['l interrupteur ouvert a la pose', SQL, '  ouverte     boolean not null default false,', '  ouverte     boolean not null default true,'],
  ['l equipe lit le registre', SQL, "create policy direction_lit on public.collectes_mtn for select to authenticated\n  using (public.est_direction());", "create policy direction_lit on public.collectes_mtn for select to authenticated\n  using (true);"],
  ['un reglement sans rendez-vous entre au registre', SQL, "    (genre = 'reglement' and origine in ('lien', 'comptoir') and rdv_id is not null and piece_id is not null", "    (genre = 'reglement' and origine in ('lien', 'comptoir')"],
  /* Le Trône et les pages */
  ['le bandeau montre le solde a toute l equipe', BANDEAU, '  if (!direction) return null;\n', ''],
  ['le solde ne se relit plus chaque minute', CLIENT, '    const t = window.setInterval(() => { if (document.visibilityState === \'visible\') relire(); }, 60_000);', '    const t = window.setInterval(() => { if (document.visibilityState === \'visible\') relire(); }, 600_000);'],
  ['le bandeau quitte sa page MTN MoMo', PAGE_MTN, '<CompteDeCollecteMtn onOuvreLeRdv={setRdvAOuvrir} />', ''],
  ['« Confirme par MTN » quitte le rendez-vous', ACTIONS, '          <ConfirmeParMtn appt={appt} />\n', ''],
  ['MTN propose sur le foyer et l avance', PAGE, '            {!p.sansPiece && !p.tetes && (', '            {('],
  ['KkiaPay ouvert pendant l attente MTN', PAGE, "disabled={ecran.k === 'paiement' || mtnOccupe}", "disabled={ecran.k === 'paiement'}"],
  ['la page envoie un montant', SERVEUR_PAGE, "appel({ action: 'demander', jeton, msisdn, pourboireXof })", "appel({ action: 'demander', jeton, msisdn, pourboireXof, montantXof: 1 })"],
  ['la caisse MTN se compte au tiroir le soir', CAISSES, '  CAISSE_MTN_COLLECTION,\n];', '];'],
  ['le MoMoPay de la Maison sort du comptage du soir', CAISSES, '  CAISSE_MTN_COLLECTION,\n];', '  CAISSE_MTN_COLLECTION, CAISSE_MTN,\n];'],
  ['le QR ne mene plus au comptoir', MAIN, "new URLSearchParams(window.location.search).has('comptoir')", "new URLSearchParams(window.location.search).has('mtn')"],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout, propre.stderr); process.exit(1); }
  const fichiers = [...new Set([...PANNES.map((x) => x[1]), FONCTION])];
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
  try {
    for (const [nom, f, a, b] of PANNES) {
      if (!casse(f, a, b)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      /* Une faute dans l'original des règles vit aussi dans la copie du
         serveur : on la remet là aussi, comme le ferait la copie. */
      if (f === PUR && !casse(FONCTION, a, b)) { console.log(`INTROUVABLE (copie) ${nom}`); muettes++; writeFileSync(path.join(racine, f), gardes.get(f)); continue; }
      try {
        const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, f), gardes.get(f));
        if (f === PUR) writeFileSync(path.join(racine, FONCTION), gardes.get(FONCTION));
      }
    }
  } finally {
    for (const [f, g] of gardes) writeFileSync(path.join(racine, f), g);
  }
  const intacts = fichiers.every((f) => md5(f) === avant.get(f)) && ecartsDesCopies(racine).length === 0;
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exit(muettes === 0 && intacts ? 0 : 1);
}

let echecs = 0;
let oks = 0;
const dit = (nom, ok, vu = '') => { console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${vu}`}`); if (!ok) echecs++; else oks++; };
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lis = (f) => readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ══ 1. LES RÈGLES PURES ══ */
const dossier = path.join(racine, 'node_modules', '.cache', `verifie-collecte-mtn-${process.pid}`);
mkdirSync(dossier, { recursive: true });
const dossierDuTrone = path.join(racine, 'node_modules', '.cache', `verifie-collecte-mtn-trone-${process.pid}`);
mkdirSync(dossierDuTrone, { recursive: true });
let R;
{
  const sortie = path.join(dossier, 'pur.mjs');
  await build({ entryPoints: [path.join(racine, PUR)], bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error' });
  R = await import(pathToFileURL(sortie).href);
}

/* ── Lot A ── */
dit('le numero se lit : dix chiffres, +229, 00229 ; huit chiffres refuses, jamais completes',
  egal(['01 97 12 34 56', '+229 01 97 12 34 56', '00229 0197123456', '97123456', '229 97 12 34 56', '', 'abc'].map(R.msisdnDe),
    ['2290197123456', '2290197123456', '2290197123456', null, null, null, null]),
  JSON.stringify(['01 97 12 34 56', '97123456'].map(R.msisdnDe)));
dit('MTN d abord pour un numero MTN (51, 52, 61, 66, 67, 69, 90, 91, 96, 97) ; Moov (55, 58, 60, 63, 64, 65, 68, 94, 95, 98, 99) et Celtiis (40, 41, 43, 44) non',
  ['0151000001', '0152000001', '0161000001', '0166000001', '0167000001', '0169000001', '0190000001', '0191000001', '0196000001', '0197000001'].every(R.estUnNumeroMtn)
  && !['0155000001', '0158000001', '0160000001', '0163000001', '0164000001', '0165000001', '0168000001', '0194000001', '0195000001', '0198000001', '0199000001', '0140000001', '0141000001', '0143000001', '0144000001', '97000001'].some(R.estUnNumeroMtn),
  R.PREFIXES_MTN_DU_BENIN.join(','));
dit('le numero se dit « 01 97 12 34 56 » et se masque « 01 97 •• •• 56 »', egal([R.numeroDitMtn('2290197123456'), R.numeroMasque('0197123456'), R.numeroMasque('rien')], ['01 97 12 34 56', '01 97 •• •• 56', '']),
  JSON.stringify([R.numeroDitMtn('2290197123456'), R.numeroMasque('0197123456')]));
dit('le nom chez MTN : prenom et nom, sinon name, sinon rien', egal([R.nomDeMtnCollecte({ given_name: 'AWA', family_name: 'K.' }), R.nomDeMtnCollecte({ name: ' Sika ' }), R.nomDeMtnCollecte({}), R.nomDeMtnCollecte(null)], ['AWA K.', 'Sika', null, null]), '');
dit('le solde : un nombre lu, sinon rien (jamais zero par defaut)', egal([R.soldeDeMtnCollecte({ availableBalance: '412500.75' }), R.soldeDeMtnCollecte({}), R.soldeDeMtnCollecte({ availableBalance: 'x' }), R.soldeDeMtnCollecte(null)], [412500, null, null, null]), '');
dit('le souci se dit en clair : cles absentes, relais muet, relais qui refuse, cles refusees, solde illisible ; rien quand tout va',
  [R.souciDuCompte({ pret: false }), R.souciDuCompte({ pret: true, jetonHttp: 0 }), R.souciDuCompte({ pret: true, jetonHttp: 403 }), R.souciDuCompte({ pret: true, jetonHttp: 401 }), R.souciDuCompte({ pret: true, jetonHttp: 200, soldeHttp: 500 })].every((x) => typeof x === 'string' && x.length > 20 && !/—/.test(x))
  && R.souciDuCompte({ pret: true, jetonHttp: 200, soldeHttp: 200 }) === null && /relais MTN ne répond pas/.test(R.souciDuCompte({ pret: true, jetonHttp: 0 })),
  R.souciDuCompte({ pret: true, jetonHttp: 0 }));
dit('« il y a » : a l instant, 12 s, 3 min, 2 h', egal([R.ilYaDit(500), R.ilYaDit(12_000), R.ilYaDit(185_000), R.ilYaDit(7_300_000)], ['à l’instant', 'il y a 12 s', 'il y a 3 min', 'il y a 2 h']), '');
dit('la fonction porte la copie exacte des regles, de la piece, de l honneur et du prenom (collecte-copie-serveur)', ecartsDesCopies(racine).length === 0, ecartsDesCopies(racine).join(' ; '));

/* ── Lot B ── */
const REF = (i) => `${String(i).padStart(8, '0')}-0000-4000-8000-${String(i).padStart(12, '0')}`;
dit('les frais de MTN : 1,2 %, au franc pres (30 000 F : 360 F ; 32 000 F : 384 F)', egal([R.fraisDeMtn(30000), R.fraisDeMtn(32000), R.fraisDeMtn(100), R.fraisDeMtn(0)], [360, 384, 1, 0]), '');
dit('le merci : un entier de 0 a 100 000 F, rien quand il n est pas permis, jamais negatif',
  egal([R.pourboireLu(2000, true), R.pourboireLu(-5, true), R.pourboireLu(2000, false), R.pourboireLu(500000, true), R.pourboireLu('abc', true), R.pourboireLu(1500.7, true)], [2000, 0, 0, 100000, 0, 1500]), '');
{
  const d = R.demandeDeReglement({ reference: REF(1), origine: 'lien', rdvId: 'r1', pieceId: 'p1', branchId: 'br', msisdn: '01 97 00 00 01', resteXof: 30000, pourboireXof: 2000 });
  dit('la demande d un reglement : le reste du serveur plus le merci, ecrite « demande », par la cliente',
    typeof d === 'object' && d.montant_xof === 32000 && d.reste_xof === 30000 && d.pourboire_xof === 2000 && d.etat === 'demande' && d.msisdn === '2290197000001' && d.genre === 'reglement', JSON.stringify(d));
  dit('... refusee : numero illisible, rien a regler, plus de 2 000 000 F, reference illisible',
    egal([R.demandeDeReglement({ reference: REF(1), origine: 'lien', rdvId: 'r', pieceId: 'p', branchId: null, msisdn: '97000001', resteXof: 100, pourboireXof: 0 }),
      R.demandeDeReglement({ reference: REF(1), origine: 'lien', rdvId: 'r', pieceId: 'p', branchId: null, msisdn: '0197000001', resteXof: 0, pourboireXof: 0 }),
      R.demandeDeReglement({ reference: REF(1), origine: 'lien', rdvId: 'r', pieceId: 'p', branchId: null, msisdn: '0197000001', resteXof: 1_999_000, pourboireXof: 5000 }),
      R.demandeDeReglement({ reference: 'pas-une-ref', origine: 'lien', rdvId: 'r', pieceId: 'p', branchId: null, msisdn: '0197000001', resteXof: 100, pourboireXof: 0 })],
    ['numero', 'deja_reglee', 'montant', 'référence illisible']), '');
  const e = R.demandeDEssai({ reference: REF(2), msisdn: '0197000001', par: 'Y. B.' });
  dit('l essai : 100 F par defaut, 500 F au plus, au nom de qui le fait', typeof e === 'object' && e.montant_xof === 100 && e.genre === 'essai' && e.demande_par === 'Y. B.'
    && R.demandeDEssai({ reference: REF(2), msisdn: '0197000001', montantXof: 600, par: 'Y' }) === 'montant' && R.demandeDEssai({ reference: REF(2), msisdn: '0197000001', montantXof: 500, par: 'Y' }).montant_xof === 500, JSON.stringify(e));
}
dit('ce que MTN repond a la demande : 202 et 409 en attente, 5xx et silence sans reponse, 401 acces refuse, 400 refus dit',
  egal([R.issueDeLaDemande(202), R.issueDeLaDemande(409), R.issueDeLaDemande(500), R.issueDeLaDemande(0), R.issueDeLaDemande(401), R.issueDeLaDemande(400, { code: 'PAYER_NOT_FOUND' })],
    [{ etat: 'attente' }, { etat: 'attente' }, { etat: 'sans-reponse' }, { etat: 'sans-reponse' }, { etat: 'refuse', raison: 'ACCES_REFUSE' }, { etat: 'refuse', raison: 'PAYER_NOT_FOUND' }]), '');
dit('ce que MTN dit d une demande relue : seul SUCCESSFUL vaut recu ; FAILED refuse ; PENDING attend ; 404 se renvoie trois fois, jamais une demande acceptee',
  egal([R.issueDuStatut(200, { status: 'SUCCESSFUL', financialTransactionId: '9001' }, 'attente', 0), R.issueDuStatut(200, { status: 'FAILED', reason: 'APPROVAL_REJECTED' }, 'attente', 0),
    R.issueDuStatut(200, { status: 'FAILED', reason: { code: 'NOT_ENOUGH_FUNDS' } }, 'attente', 0), R.issueDuStatut(200, { status: 'PENDING' }, 'attente', 0),
    R.issueDuStatut(404, null, 'attente', 0), R.issueDuStatut(404, null, 'sans-reponse', 0), R.issueDuStatut(404, null, 'sans-reponse', 3), R.issueDuStatut(503, null, 'demande', 0)],
  [{ etat: 'recu', transaction: '9001' }, { etat: 'refuse', raison: 'APPROVAL_REJECTED' }, { etat: 'refuse', raison: 'NOT_ENOUGH_FUNDS' }, { etat: 'attente' },
    { etat: 'attente' }, { etat: 'sans-reponse', renvoie: true }, { etat: 'refuse', raison: 'INCONNU_CHEZ_MTN' }, { etat: 'sans-reponse' }]),
  JSON.stringify(R.issueDuStatut(404, null, 'attente', 0)));
{
  const t0 = Date.parse('2026-11-11T10:00:00Z');
  dit('relire : une demande en vol attend 30 s ; deux lectures a moins de 4 s : une seule ; une demande finie ne se relit plus',
    egal([R.aRelire({ etat: 'demande', demande_le: new Date(t0).toISOString() }, t0 + 10_000), R.aRelire({ etat: 'demande', demande_le: new Date(t0).toISOString() }, t0 + 31_000),
      R.aRelire({ etat: 'attente', relu_le: new Date(t0).toISOString() }, t0 + 2_000), R.aRelire({ etat: 'attente', relu_le: new Date(t0).toISOString() }, t0 + 4_000), R.aRelire({ etat: 'recu' }, t0)],
    [false, true, false, true, false]), '');
  dit('une demande vivante de moins de trois minutes retient le rendez-vous', egal([
    R.demandeEnCours([{ etat: 'attente', demande_le: new Date(t0).toISOString(), rdv_id: 'r1' }], 'r1', t0 + 60_000),
    R.demandeEnCours([{ etat: 'attente', demande_le: new Date(t0).toISOString(), rdv_id: 'r1' }], 'r1', t0 + 200_000),
    R.demandeEnCours([{ etat: 'refuse', demande_le: new Date(t0).toISOString(), rdv_id: 'r1' }], 'r1', t0 + 60_000),
    R.demandeEnCours([{ etat: 'attente', demande_le: new Date(t0).toISOString(), rdv_id: 'r2' }], 'r1', t0 + 60_000)], [true, false, false, false]), '');
}
dit('le partage a la confirmation : le reste demande et le merci choisi ; reglee entre-temps ou reste baisse : a rapprocher, jamais un merci invente',
  egal([R.partageConfirme({ resteXof: 30000, pourboireXof: 2000 }, 30000), R.partageConfirme({ resteXof: 30000, pourboireXof: 0 }, 35000),
    R.partageConfirme({ resteXof: 30000, pourboireXof: 2000 }, 20000), R.partageConfirme({ resteXof: 30000, pourboireXof: 0 }, 0)],
  [{ ok: true, versementXof: 30000, pourboireXof: 2000 }, { ok: true, versementXof: 30000, pourboireXof: 0 }, { ok: false, raison: 'reste_change' }, { ok: false, raison: 'deja_reglee' }]), '');
{
  const quand = new Date('2026-11-11T10:02:00Z');
  const v = R.versementMtn({ reference: REF(3), montantXof: 30000, quand, msisdn: '2290197000001', transaction: '9003' });
  dit('le versement : mtn-<reference>, caisse et moyen « MTN Collection », jour et heure de Cotonou, numero masque seulement',
    v.id === `mtn-${REF(3)}` && v.cashbox === 'MTN Collection' && v.method === 'MTN Collection' && v.date === '2026-11-11' && v.time === '11:02' && v.amountXof === 30000
    && v.note.includes('01 97 •• •• 01') && !v.note.includes('01 97 00 00 01'), JSON.stringify(v));
  const trace = R.traceMtn({ v, reference: REF(3), transaction: '9003', quand, pourboireXof: 2000, fraisXof: 384, msisdn: '2290197000001' });
  dit('la trace : la forme d un reglement en ligne (le Trone partage le merci et envoie le recu), « MTN », la reference et le numero masque',
    trace.id === v.id && trace.montantXof === 30000 && trace.pourboireXof === 2000 && trace.fraisXof === 384 && trace.moyen === 'MTN' && trace.referenceMtn === REF(3) && trace.numeroMasque === '01 97 •• •• 01' && trace.transactionId === '9003' && R.estUneTraceMtn(trace) && !R.estUneTraceMtn({ id: 'kkia-1' }), JSON.stringify(trace));
  const piece = { id: 'p1', lines: [{ label: 'SÍNSIN Essentiel', qty: 1, unitXof: 30000 }], payments: [], status: 'émise' };
  const neuve = R.pieceRegleeParMtn(piece, v, 2000, trace);
  dit('la piece reglee : soldee « payee », le versement, le merci a part (tipXof), la trace, la caisse MTN',
    neuve.status === 'payée' && neuve.payments.length === 1 && neuve.tipXof === 2000 && neuve.reglementsEnLigne.length === 1 && neuve.cashbox === 'MTN Collection', JSON.stringify(neuve));
  const partielle = R.pieceRegleeParMtn({ ...piece, lines: [{ qty: 1, unitXof: 50000 }] }, v, 0, trace);
  dit('... une piece pas soldee garde son statut, sans merci', partielle.status === 'émise' && partielle.tipXof === undefined, JSON.stringify(partielle));
  const jour = '2026-11-11';
  const rdv = { id: 'r1', date: jour, time: '08:30', status: 'confirmé', termineParElle: { le: '2026-11-11T09:00:00Z', par: 'couronne' }, payments: [] };
  const honore = R.rdvApresMtn(rdv, v, 'p1', 0, Date.parse('2026-11-11T11:00:00Z'));
  const pasHonore = R.rdvApresMtn({ ...rdv, termineParElle: undefined }, v, 'p1', 0, Date.parse('2026-11-11T11:00:00Z'));
  dit('le rendez-vous suit sa piece ; honore seulement si elle avait termine elle-meme et que tout est regle (la regle de regler-la-seance)',
    honore.status === 'honoré' && !!honore.honoreAuReglement?.le && honore.payments[0].id === v.id && honore.payments[0].invoiceId === 'p1' && honore.paidXof === 30000
    && pasHonore.status === 'confirmé' && R.rdvApresMtn(honore, v, 'p1', 0, Date.parse('2026-11-11T11:00:00Z')).payments.length === 1, JSON.stringify(honore));
  const dep = R.depenseDesFraisMtn({ reference: REF(3), branchId: 'br', fraisXof: 384, jour, qui: 'Paulette K.' });
  dit('les frais : une depense de la Maison, payee par la caisse MTN, « Frais bancaires · Commissions Mobile Money »',
    dep.id === `exp-mtn-${REF(3)}` && dep.amountXof === 384 && dep.cashbox === 'MTN Collection' && dep.category === 'Frais bancaires' && dep.subcategory === 'Commissions Mobile Money' && dep.laMaisonAPaye === true, JSON.stringify(dep));
}
dit('le prenom du comptoir : prenom d usage et initiale du NOM, jamais le nom entier',
  egal([R.prenomEtInitiale({ name: 'Paulette KOSSOU' }), R.prenomEtInitiale({ name: 'Anne Marie KOSSI' }), R.prenomEtInitiale({ name: 'Awa Reine KOSSI', prenomUsage: 'Reine' }),
    R.prenomEtInitiale({ name: 'Marie - Ange Kpadé' }), R.prenomEtInitiale({ name: 'Sika' }), R.prenomEtInitiale(null, 'Ophélie Kiki')],
  ['Paulette K.', 'Anne Marie K.', 'Reine K.', 'Marie-Ange K.', 'Sika', 'Ophélie K.']),
  JSON.stringify([R.prenomEtInitiale({ name: 'Awa Reine KOSSI', prenomUsage: 'Reine' }), R.prenomEtInitiale({ name: 'Marie - Ange Kpadé' })]));
{
  const jour = '2026-11-11';
  const piece = (id, apptId, du, tip = 0) => ({ id, apptId, lines: [{ label: 'Soin', qty: 1, unitXof: du }], payments: [], tipXof: tip });
  const rdvs = [
    { rdv: { id: 'r-b', date: jour, time: '14:00', status: 'confirmé', clientName: 'Paulette KOSSOU' }, fiche: { name: 'Paulette KOSSOU', phone: '01 97 00 00 01' }, piece: piece('p-b', 'r-b', 15000, 500) },
    { rdv: { id: 'r-a', date: jour, time: '08:30', status: 'confirmé', clientName: 'Paulette KOSSOU' }, fiche: { name: 'Paulette KOSSOU', phone: '+229 0197000001' }, piece: piece('p-a', 'r-a', 30000) },
    { rdv: { id: 'r-c', date: jour, time: '10:00', status: 'annulé' }, fiche: { name: 'Paulette KOSSOU', phone: '0197000001' }, piece: null },
    { rdv: { id: 'r-d', date: '2026-11-12', time: '10:00', status: 'confirmé' }, fiche: { name: 'Paulette KOSSOU', phone: '0197000001' }, piece: null },
    { rdv: { id: 'r-e', date: jour, time: '11:00', status: 'confirmé', numeroAPrevenir: '0197000001', clientName: 'Nael Kossou' }, fiche: { name: 'Nael Kossou', phone: '' }, piece: null },
    { rdv: { id: 'r-f', date: jour, time: '09:00', status: 'confirmé' }, fiche: { name: 'Sena Agbo', phone: '0197000002' }, piece: piece('p-f', 'r-f', 10000) },
  ];
  const t = R.rdvsDuNumero({ msisdn: '01 97 00 00 01', jour, rdvs });
  dit('le comptoir : les rendez-vous du jour de CE numero (fiche ou numero a prevenir), dans l ordre de l heure, ni annule ni autre jour, trois au plus',
    egal(t.map((x) => [x.rdvId, x.etat, x.resteXof, x.pourboire, x.prenom]), [['r-a', 'a-regler', 30000, true, 'Paulette K.'], ['r-e', 'sans-piece', 0, false, 'Nael K.'], ['r-b', 'a-regler', 15000, false, 'Paulette K.']]),
    JSON.stringify(t));
  const page = R.pageDuComptoir(t);
  dit('... la page n en recoit qu un rang, un prenom et une initiale, un etat et un reste : ni identifiant, ni lignes, ni numero',
    egal(Object.keys(page[0]).sort(), ['etat', 'n', 'pourboire', 'prenom', 'resteXof']) && !JSON.stringify(page).includes('KOSSOU') && !JSON.stringify(page).includes('r-a') && !JSON.stringify(page).includes('0197'), JSON.stringify(page));
  dit('... un numero illisible ne trouve rien', R.rdvsDuNumero({ msisdn: '97000001', jour, rdvs }).length === 0, '');
}
dit('la raison d un refus se dit en clair a la cliente ; un code inconnu se dit tel quel',
  egal([R.raisonDiteALaCliente('APPROVAL_REJECTED'), R.raisonDiteALaCliente('NOT_ENOUGH_FUNDS'), R.raisonDiteALaCliente('ZZZ'), R.raisonDiteALaCliente(null)],
    ['la demande a été refusée sur le téléphone', 'le solde MTN ne suffit pas', 'MTN dit ZZZ', 'MTN n’a pas dit pourquoi']), '');
dit('l interrupteur ne s ouvre qu apres un essai RECU', egal([R.peutOuvrirLaCollecte([{ genre: 'essai', etat: 'attente' }, { genre: 'reglement', etat: 'recu' }]), R.peutOuvrirLaCollecte([{ genre: 'essai', etat: 'recu' }])], [false, true]), '');
{
  const c = (i, etat, jourIso, montant, extra = {}) => ({ reference: REF(i), genre: 'reglement', etat, montant_xof: montant, demande_le: jourIso, repondu_le: jourIso, ...extra });
  const j = R.reglementsMtnDuJour([c(1, 'recu', '2026-11-11T09:40:00Z', 32000, { frais_xof: 384 }), c(2, 'recu', '2026-11-11T12:05:00Z', 30000), c(3, 'refuse', '2026-11-11T13:00:00Z', 10000),
    c(4, 'recu', '2026-11-10T22:59:00Z', 5000), c(5, 'recu', '2026-11-10T23:01:00Z', 7000), { ...c(6, 'recu', '2026-11-11T10:00:00Z', 100), genre: 'essai' }], '2026-11-11');
  dit('les reglements MTN du jour (de Cotonou) : les plus recents d abord ; seul le confirme compte, frais compris ; l essai n en est pas',
    egal(j.lignes.map((x) => x.reference), [REF(3), REF(2), REF(1), REF(5)]) && j.recus === 3 && j.recuXof === 69000 && j.fraisXof === 384 + 360 + 84, JSON.stringify({ l: j.lignes.map((x) => x.reference), j: { ...j, lignes: undefined } }));
}

/* ══ 2. LE SERVEUR, contre un faux relais MTN et une fausse base ══ */
const PROJET = 'https://projet-essai.supabase.co';
const SERVICE = 'service-secrete-essai';
const RELAIS = 'https://relais-essai.example';
const RELAIS_CLE = 'CLE-DU-RELAIS-SECRETE';
const C_USER = '7dbbf2d7-0000-4000-8000-00000000c011';
const C_KEY = 'CLE-COLLECTE-SECRETE';
const C_ABO = 'ABO-COLLECTE-SECRET';
const D_ABO = 'ABO-PAIE-SECRET';
const NUMERO_DE_COLLECTE = '0190000099';
const ENV = {
  SUPABASE_URL: PROJET, SUPABASE_SERVICE_ROLE_KEY: SERVICE, CLE_SERVICE: 'cle-service-du-coffre',
  MOMO_RELAIS_URL: RELAIS, MOMO_RELAIS_CLE: RELAIS_CLE, MOMO_TARGET_ENV: 'mtnbenin',
  MOMO_PROD_COLLECTION_USER: C_USER, MOMO_PROD_COLLECTION_KEY: C_KEY, MOMO_PROD_COLLECTION_SUBSCRIPTION: C_ABO,
  MOMO_PROD_DISBURSEMENT_USER: 'paie-user', MOMO_PROD_DISBURSEMENT_KEY: 'CLE-PAIE-SECRETE', MOMO_PROD_DISBURSEMENT_SUBSCRIPTION: D_ABO,
  MOMO_PROD_COLLECTION_NUMERO: NUMERO_DE_COLLECTE, MOMO_PROD_COLLECTION_COMPTE: 'CompteEssai.sp',
};
const SECRETS = [SERVICE, 'cle-service-du-coffre', RELAIS_CLE, C_KEY, C_ABO, D_ABO, 'CLE-PAIE-SECRETE', 'JETON-COLLECTE-SECRET'];
const JWT_DIRECTION = 'jwt-direction';
const JWT_EQUIPE = 'jwt-equipe';
const COMPTES = { [JWT_DIRECTION]: '11111111-1111-4111-8111-111111111111', [JWT_EQUIPE]: '22222222-2222-4222-8222-222222222222' };
const STAFF = { [COMPTES[JWT_DIRECTION]]: { role: 'souverain', name: 'Y. B.' }, [COMPTES[JWT_EQUIPE]]: { role: 'coiffeuse', name: 'A. K.' } };

/* Les numéros inventés et ce que MTN en fait. */
const N = {
  bon: '2290197000001', inactif: '2290197000005', vite: '2290197000011', refuse: '2290197000012', lent: '2290197000013',
  muet: '2290197000014', perdu: '2290197000015', jamais: '2290197000016', oublie: '2290197000017', fige: '2290197000018',
};
const NOMS = { [N.bon]: ['AWA', 'KOSSOU'] };

let journal = [];
let soldeMtn = 412_500;
let jetonRefuse = false;
let relaisMuet = false;
let rtp = new Map();         // référence -> { msisdn, corps, lu, posts }
let perduUneFois = new Set();
let liberes = new Set();     // demandes « figées » que MTN finit par dire réussies
let T = {};                  // les tables
let horloge = 0;
let registreRefuse = false;
let aCourse = null;          // une pièce écrite par le comptoir entre la lecture et l'écriture du serveur
const remiseAZero = () => {
  journal = []; soldeMtn = 412_500; jetonRefuse = false; relaisMuet = false; rtp = new Map(); perduUneFois = new Set(); liberes = new Set();
  registreRefuse = false; aCourse = null;
  T = { staff: [], collectes_mtn: [], collecte_mtn_reglage: [{ id: 1, ouverte: false, rappel: true }], appointments: [], invoices: [], clients: [], cashboxes: [], expenses: [], edge_rate_limits: [] };
};
remiseAZero();
const estampe = () => new Date(Date.parse('2026-01-01T00:00:00Z') + (++horloge) * 1000).toISOString();

const rep = (status, corps) => new Response(corps === undefined ? '' : JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });
const chemin = (r, k) => {
  const morceaux = k.split(/->>?/);
  let v = r;
  for (const m of morceaux) v = v == null ? undefined : v[m];
  return v;
};
const filtreDe = (url) => {
  const f = [];
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    if (v.startsWith('eq.')) f.push((r) => String(chemin(r, k)) === v.slice(3));
    else if (v.startsWith('in.(')) { const l = v.slice(4, -1).split(',').map((x) => x.replace(/^"|"$/g, '')); f.push((r) => l.includes(String(chemin(r, k)))); }
    else if (v.startsWith('gte.')) f.push((r) => String(chemin(r, k) ?? '') >= v.slice(4));
    else if (v.startsWith('lt.')) f.push((r) => String(chemin(r, k) ?? '') < v.slice(3));
    else if (v === 'is.null') f.push((r) => chemin(r, k) == null);
    else f.push(() => false);
  }
  return (r) => f.every((x) => x(r));
};
const contrainteDuRegistre = (r) => /^22901\d{8}$/.test(r.msisdn) && r.montant_xof >= 1 && r.montant_xof <= 2_000_000
  && ((r.genre === 'reglement' && r.rdv_id && r.piece_id && r.reste_xof >= 1 && r.montant_xof === r.reste_xof + r.pourboire_xof)
    || (r.genre === 'essai' && !r.rdv_id && r.montant_xof <= 500));

function base(url, methode, h, corps) {
  if (h.apikey !== SERVICE || h.authorization !== `Bearer ${SERVICE}`) return rep(401, { message: 'service attendu' });
  const table = url.pathname.replace('/rest/v1/', '');
  if (table === 'staff') {
    const uid = url.searchParams.get('user_id')?.replace(/^eq\./, '');
    return rep(200, STAFF[uid] ? [STAFF[uid]] : []);
  }
  const lignes = T[table];
  if (!lignes) return rep(404, { message: `table inconnue ${table}` });
  const garde = filtreDe(url);
  const cle = table === 'collectes_mtn' ? 'reference' : table === 'edge_rate_limits' ? null : 'id';
  if (methode === 'GET') {
    let l = lignes.filter(garde).map((r) => structuredClone(r));
    const lim = Number(url.searchParams.get('limit') ?? 0);
    if (lim) l = l.slice(0, lim);
    if (table === 'invoices' && aCourse && l.some((x) => x.id === aCourse.id)) {
      /* Le comptoir écrit la pièce juste après la lecture du serveur. */
      const vraie = lignes.find((x) => x.id === aCourse.id);
      vraie.data = { ...vraie.data, payments: [...(vraie.data.payments ?? []), aCourse.versement] };
      vraie.updated_at = estampe();
      aCourse = null;
    }
    return rep(200, l);
  }
  if (methode === 'POST') {
    const r = { ...corps };
    if (table === 'collectes_mtn') {
      if (registreRefuse) return rep(500, { message: 'registre en panne' });
      if (!contrainteDuRegistre(r)) return rep(400, { code: '23514' });
      Object.assign(r, { tentatives: 0, demande_le: new Date().toISOString(), ...r });
    }
    if (table === 'edge_rate_limits') r.at = new Date().toISOString();
    if (cle && lignes.some((x) => x[cle] === r[cle])) return /ignore-duplicates/.test(h.prefer ?? '') ? rep(201) : rep(409, { code: '23505' });
    if (table !== 'collectes_mtn' && table !== 'edge_rate_limits') r.updated_at = estampe();
    lignes.push(r);
    return rep(201);
  }
  if (methode === 'PATCH') {
    const touches = lignes.filter(garde);
    for (const t of touches) { Object.assign(t, corps); if (table !== 'collectes_mtn') t.updated_at = estampe(); }
    return rep(200, touches.map((t) => structuredClone(t)));
  }
  return rep(405);
}

function mtn(url, methode, h, corps) {
  if (relaisMuet) return null;
  if (h['x-relais-cle'] !== RELAIS_CLE) return rep(403, { message: 'refusé' });
  if (h['ocp-apim-subscription-key'] !== C_ABO) return rep(401, { message: 'missing subscription key' });
  const p = url.pathname;
  if (p.startsWith('/disbursement/')) return rep(500, { message: 'la collecte ne parle jamais a la paie' });
  if (methode === 'POST' && p === '/collection/token/') {
    if (jetonRefuse) return rep(401, { error: 'login' });
    return h.authorization === `Basic ${btoa(`${C_USER}:${C_KEY}`)}` ? rep(200, { access_token: 'JETON-COLLECTE-SECRET', token_type: 'access_token', expires_in: 3600 }) : rep(401, { error: 'login' });
  }
  if (h.authorization !== 'Bearer JETON-COLLECTE-SECRET') return rep(401, { message: 'jeton' });
  if (h['x-target-environment'] !== 'mtnbenin') return rep(500, { code: 'NOT_ALLOWED_TARGET_ENVIRONMENT' });
  let m;
  if (methode === 'GET' && p === '/collection/v1_0/account/balance') return rep(200, { availableBalance: String(soldeMtn), currency: 'XOF' });
  if (methode === 'GET' && (m = p.match(/^\/collection\/v1_0\/accountholder\/msisdn\/(\d+)\/active$/))) return rep(200, { result: m[1] !== N.inactif });
  if (methode === 'GET' && (m = p.match(/^\/collection\/v1_0\/accountholder\/msisdn\/(\d+)\/basicuserinfo$/))) {
    const n = NOMS[m[1]]; return n ? rep(200, { given_name: n[0], family_name: n[1] }) : rep(404, { code: 'NOT_FOUND' });
  }
  if (methode === 'POST' && p === '/collection/v1_0/requesttopay') {
    const ref = h['x-reference-id'];
    if (!/^[0-9a-f-]{36}$/.test(ref ?? '')) return rep(400, { code: 'REFERENCE_ID_INVALID' });
    if (corps?.currency !== 'XOF' || corps?.payer?.partyIdType !== 'MSISDN' || !/^\d+$/.test(corps?.amount ?? '') || corps?.externalId !== ref) return rep(400, { code: 'INVALID_REQUEST' });
    if (rtp.has(ref)) { rtp.get(ref).posts++; return rep(409, { code: 'RESOURCE_ALREADY_EXIST' }); }
    const msisdn = corps.payer.partyId;
    if (msisdn === N.perdu && !perduUneFois.has(ref)) { perduUneFois.add(ref); return rep(500, { code: 'INTERNAL_PROCESSING_ERROR' }); }
    if (msisdn === N.jamais) return rep(500, { code: 'INTERNAL_PROCESSING_ERROR' });
    rtp.set(ref, { msisdn, corps, lu: 0, posts: 1, rappel: h['x-callback-url'] ?? null });
    if (msisdn === N.muet) return rep(500, { code: 'INTERNAL_PROCESSING_ERROR' });
    return rep(202);
  }
  if (methode === 'GET' && (m = p.match(/^\/collection\/v1_0\/requesttopay\/([^/]+)$/))) {
    const t = rtp.get(m[1]);
    if (!t) return rep(404, { code: 'RESOURCE_NOT_FOUND' });
    t.lu++;
    const base0 = { amount: t.corps.amount, currency: 'XOF', externalId: m[1], payer: t.corps.payer };
    const reussi = { ...base0, status: 'SUCCESSFUL', financialTransactionId: `9${String(t.lu).padStart(3, '0')}${m[1].slice(0, 4)}` };
    if (t.msisdn === N.refuse) return rep(200, { ...base0, status: 'FAILED', reason: 'APPROVAL_REJECTED' });
    if (t.msisdn === N.vite || t.msisdn === N.muet || t.msisdn === N.perdu) return rep(200, reussi);
    if (t.msisdn === N.bon) return rep(200, t.lu < 2 ? { ...base0, status: 'PENDING' } : reussi);
    if (t.msisdn === N.lent) return rep(200, t.lu < 3 ? { ...base0, status: 'PENDING' } : reussi);
    if (t.msisdn === N.oublie) return t.lu < 3 ? rep(404, { code: 'RESOURCE_NOT_FOUND' }) : rep(200, reussi);
    if (t.msisdn === N.fige) return rep(200, liberes.has(m[1]) ? reussi : { ...base0, status: 'PENDING' });
    return rep(200, { ...base0, status: 'PENDING' });
  }
  return rep(404, { message: `inattendu ${methode} ${p}` });
}

const gestionnaires = [];
async function fauxFetch(entree, init = {}) {
  const url = new URL(String(entree));
  const methode = (init.method ?? 'GET').toUpperCase();
  const h = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const corps = init.body ? JSON.parse(init.body) : undefined;
  journal.push({ methode, url: url.href, chemin: url.pathname, origine: url.origin, h, corps });
  if (url.origin === PROJET && url.pathname === '/auth/v1/user') {
    const jwt = (h.authorization ?? '').replace('Bearer ', '');
    return COMPTES[jwt] ? rep(200, { id: COMPTES[jwt] }) : rep(401, { message: 'jeton' });
  }
  if (url.origin === PROJET && url.pathname.startsWith('/rest/v1/')) return base(url, methode, h, corps);
  /* Le rappel appelle la collecte par la clé de service : le même monde. */
  if (url.origin === PROJET && url.pathname === '/functions/v1/collecte-mtn') return gestionnaires[0](new Request(url.href, init));
  if (url.origin === RELAIS) {
    const r = mtn(url, methode, h, corps);
    if (r === null) throw new TypeError('fetch failed');
    return r;
  }
  return rep(599, { message: `hors du monde simule : ${url.origin}` });
}

globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (f) => { gestionnaires.push(f); } };
globalThis.fetch = fauxFetch;
try {
  for (const [f, nom] of [[FONCTION, 'fonction.mjs'], [RAPPEL, 'rappel.mjs']]) {
    const { code } = await transform(readFileSync(path.join(racine, f), 'utf8'), { loader: 'ts', format: 'esm' });
    const sortie = path.join(dossier, nom);
    writeFileSync(sortie, code);
    await import(pathToFileURL(sortie).href);
  }
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

let ip = 1;
const appelle = async (init = {}, ou = `${PROJET}/functions/v1/collecte-mtn`, g = 0) => {
  const r = await gestionnaires[g](new Request(ou, { ...init, headers: { 'x-forwarded-for': `10.0.0.${ip}`, ...(init.headers ?? {}) } }));
  const t = await r.text();
  let o = null; try { o = JSON.parse(t); } catch { o = null; }
  return { status: r.status, o, t };
};
const poste = (jwt, corps) => appelle({ method: 'POST', headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
const direction = (corps) => poste(JWT_DIRECTION, corps);
const page = (corps) => poste('cle-anon-publique', corps);
const cron = () => poste(SERVICE, { source: 'cron' });
const rappel = (corps, voie = 'collection', methode = 'PUT') => appelle({ method: methode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }, `${PROJET}/functions/v1/mtn-momo-rappel/${voie}`, 1);
const sansSecret = (t) => !SECRETS.some((s) => t.includes(s));
const versMtn = () => journal.filter((j) => j.origine === RELAIS);
const demandesMtn = (ref) => journal.filter((j) => j.origine === RELAIS && j.methode === 'POST' && j.chemin === '/collection/v1_0/requesttopay' && (!ref || j.h['x-reference-id'] === ref));
const collecte = (ref) => T.collectes_mtn.find((c) => c.reference === ref);
const vieillis = (ref, ms = 120_000) => { const c = collecte(ref); if (c) { c.demande_le = new Date(Date.now() - ms).toISOString(); c.relu_le = c.relu_le ? new Date(Date.now() - ms).toISOString() : c.relu_le; } };
const pieceDe = (id) => T.invoices.find((x) => x.id === id)?.data;
const rdvDe = (id) => T.appointments.find((x) => x.id === id)?.data;
const JOUR = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const JETON = '23456789abcdef';
const JETON2 = 'abcdefghjkmnpq';

/** Le monde d'une séance : une cliente, son rendez-vous du jour, sa pièce. */
function seance(o = {}) {
  const id = o.id ?? 'r1';
  const pid = o.pid ?? 'p1';
  T.clients.push({ id: o.cid ?? 'c1', branch_id: 'br-1', data: { id: o.cid ?? 'c1', name: o.nom ?? 'Paulette KOSSOU', phone: o.phone ?? '01 97 00 00 01' } });
  T.appointments.push({ id, branch_id: 'br-1', updated_at: estampe(), data: {
    id, clientId: o.cid ?? 'c1', clientName: o.nom ?? 'Paulette KOSSOU', date: o.date ?? JOUR, time: o.time ?? '08:30', status: o.status ?? 'confirmé',
    payments: [], ...(o.jeton !== null ? { lienDeReglement: { jeton: o.jeton ?? JETON, creeLe: '2026-11-11T08:00:00Z' } } : {}), ...(o.rdv ?? {}),
  } });
  if (o.piece !== false) {
    T.invoices.push({ id: pid, branch_id: 'br-1', updated_at: estampe(), data: {
      id: pid, kind: 'facture', status: 'émise', apptId: id, clientId: o.cid ?? 'c1', date: JOUR,
      lines: [{ label: 'SÍNSIN Essentiel', qty: 1, unitXof: o.du ?? 30000 }], payments: [], ...(o.pieceData ?? {}),
    } });
  }
}
const ouvre = () => { T.collecte_mtn_reglage[0].ouverte = true; };

/* ── Lot A : la santé ── */
{
  remiseAZero();
  const r = await appelle({ method: 'GET' });
  dit('le GET dit sa version, ce qui est pose, et l interrupteur ferme, sans aucune valeur', r.status === 200 && r.o?.pret === true && /^\d{4}-\d{2}-\d{2}-[a-z]$/.test(r.o?.version) && r.o?.cles?.numero === true && r.o?.ouverte === false && sansSecret(r.t) && !r.t.includes('0190000099') && !r.t.includes('CompteEssai'), r.t.slice(0, 300));
  const s = await poste(null, { action: 'sante' });
  dit('la sante se lit aussi en POST, sans jeton', s.status === 200 && s.o?.version === r.o?.version, s.t);
  dit('la sante n appelle jamais MTN', versMtn().length === 0, JSON.stringify(versMtn().map((j) => j.chemin)));
  const cle = ENV.MOMO_PROD_COLLECTION_KEY; delete ENV.MOMO_PROD_COLLECTION_KEY;
  const r2 = await appelle({ method: 'GET' });
  dit('une cle absente : pas pret, et dit laquelle manque', r2.o?.pret === false && r2.o?.cles?.cle === false && r2.o?.cles?.utilisateur === true, r2.t);
  const r3 = await direction({ action: 'solde' });
  dit('sans les cles : rien n est demande a MTN, et le souci se dit', r3.status === 503 && /pas encore posés/.test(r3.o?.souci ?? '') && versMtn().length === 0, r3.t);
  ENV.MOMO_PROD_COLLECTION_KEY = cle;
}

/* ── Lot A : qui appelle ── */
{
  remiseAZero();
  const sans = await poste(null, { action: 'solde' });
  const equipe = await poste(JWT_EQUIPE, { action: 'solde' });
  const service = await poste(SERVICE, { action: 'solde' });
  const essaiEquipe = await poste(JWT_EQUIPE, { action: 'essai', numero: N.bon });
  const centEquipe = await poste(JWT_EQUIPE, { action: 'essai-paiement', numero: N.vite });
  const basculeEquipe = await poste(JWT_EQUIPE, { action: 'interrupteur', ouvrir: true });
  dit('le solde, les essais, l interrupteur : refuses sans jeton, a l equipe ; la cle de service ne fait que le passage',
    [sans, equipe, essaiEquipe, centEquipe, basculeEquipe].every((x) => x.status === 403) && service.status === 200 && 'passage' in (service.o ?? {}) && T.collecte_mtn_reglage[0].ouverte === false,
    [sans, equipe, service, essaiEquipe, centEquipe, basculeEquipe].map((x) => x.status).join(' '));
  dit('... et MTN n a pas ete appele', versMtn().length === 0, JSON.stringify(versMtn().map((j) => j.chemin)));
  const inconnue = await direction({ action: 'rien' });
  dit('une action inconnue est refusee', inconnue.status === 400, inconnue.t);
}

/* ── Lot A : le solde en direct ── */
{
  remiseAZero();
  const r = await direction({ action: 'solde' });
  dit('le solde : le montant chez MTN, le numero de collecte lu dans son reglage, le nom du compte, l heure, l interrupteur',
    r.status === 200 && r.o?.soldeXof === 412500 && r.o?.numero === '01 90 00 00 99' && r.o?.compte === 'CompteEssai.sp' && !!Date.parse(r.o?.le) && r.o?.souci === null && r.o?.reglement?.ouverte === false, r.t);
  dit('le solde ne montre aucune cle ni jeton', sansSecret(r.t), r.t);
  dit('chaque appel a MTN passe par le relais, avec sa cle, l abonnement de COLLECTE et l environnement mtnbenin',
    versMtn().length === 2 && versMtn().every((j) => j.h['x-relais-cle'] === RELAIS_CLE && j.h['ocp-apim-subscription-key'] === C_ABO && (j.chemin === '/collection/token/' || j.h['x-target-environment'] === 'mtnbenin')),
    JSON.stringify(versMtn().map((j) => j.chemin)));
  dit('le jeton se demande a la collecte, avec l utilisateur et la cle de collecte', versMtn()[0]?.chemin === '/collection/token/' && versMtn()[0]?.h.authorization === `Basic ${btoa(`${C_USER}:${C_KEY}`)}`, JSON.stringify(versMtn()[0]?.chemin));
  const garde = ENV.MOMO_PROD_COLLECTION_NUMERO; delete ENV.MOMO_PROD_COLLECTION_NUMERO;
  const r2 = await direction({ action: 'solde' });
  dit('sans son reglage, le numero manque (le Trone dit « numero a poser »)', r2.status === 200 && r2.o?.numero === null && r2.o?.soldeXof === 412500, r2.t);
  ENV.MOMO_PROD_COLLECTION_NUMERO = garde;
  jetonRefuse = true;
  const r3 = await direction({ action: 'solde' });
  dit('les cles refusees par MTN : pas de solde, le souci dit les cles', r3.o?.soldeXof === null && /refuse les clés de collecte/.test(r3.o?.souci ?? ''), r3.t);
  jetonRefuse = false;
  relaisMuet = true;
  const r4 = await direction({ action: 'solde' });
  dit('le relais muet : pas de solde, le souci le dit en clair', r4.o?.soldeXof === null && /relais MTN ne répond pas/.test(r4.o?.souci ?? ''), r4.t);
  relaisMuet = false;
}

/* ── Lot A : l'essai sans argent ── */
{
  remiseAZero();
  const r = await direction({ action: 'essai', numero: '01 97 00 00 01' });
  dit('l essai : le jeton recu, le solde lu, le numero actif et son nom chez MTN',
    r.status === 200 && r.o?.jeton?.ok === true && r.o?.solde?.xof === 412500 && r.o?.verifie?.actif === true && r.o?.verifie?.nom === 'AWA KOSSOU' && r.o?.verifie?.dit === '01 97 00 00 01' && r.o?.verifie?.mtn === true, r.t);
  const r2 = await direction({ action: 'essai', numero: '01 97 00 00 05' });
  dit('un numero inactif se dit inactif, sans nom', r2.o?.verifie?.actif === false && r2.o?.verifie?.nom === null, r2.t);
  const avant = versMtn().length;
  const r3 = await direction({ action: 'essai', numero: '97000001' });
  dit('un numero illisible ne se demande pas a MTN, et se dit', r3.o?.numeroIllisible === true && r3.o?.verifie === null && !versMtn().slice(avant).some((j) => /accountholder/.test(j.chemin)), r3.t);
  dit('aucun argent ne bouge : ni demande de paiement, ni envoi', !journal.some((j) => /requesttopay|transfer|deposit|refund/i.test(j.chemin)), JSON.stringify([...new Set(journal.map((j) => j.chemin))]));
  dit('l essai ne montre aucune cle ni jeton', sansSecret(r.t) && sansSecret(r2.t) && sansSecret(r3.t), r.t);
}

/* ── Lot B : l'interrupteur fermé ferme tout ── */
{
  remiseAZero(); ip = 20;
  seance();
  const c = await page({ action: 'comptoir', numero: '01 97 00 00 01' });
  const d = await page({ action: 'demander', jeton: JETON, msisdn: '0197000001', pourboireXof: 0 });
  dit('interrupteur ferme : le comptoir ne dit rien, la demande est refusee, rien au registre, rien chez MTN',
    c.o?.ouverte === false && egal(c.o?.rdvs, []) && d.status === 503 && d.o?.erreur === 'fermee' && T.collectes_mtn.length === 0 && demandesMtn().length === 0, `${c.t} ${d.t}`);
  T.collecte_mtn_reglage = undefined;
  const g = await appelle({ method: 'GET' });
  const d2 = await page({ action: 'demander', jeton: JETON, msisdn: '0197000001' });
  dit('le reglage absent (migration pas passee) : ferme, jamais ouvert', g.o?.ouverte === false && d2.status === 503 && demandesMtn().length === 0, `${g.t} ${d2.t}`);
}

/* ── Lot B : l'essai de 100 F, puis l'ouverture ── */
{
  remiseAZero(); ip = 21;
  const sansEssai = await direction({ action: 'interrupteur', ouvrir: true });
  dit('l interrupteur ne s ouvre pas sans un essai recu, et le dit', sansEssai.status === 409 && /essai de 100 F/.test(sansEssai.o?.erreur ?? '') && T.collecte_mtn_reglage[0].ouverte === false, sansEssai.t);
  const trop = await direction({ action: 'essai-paiement', numero: N.vite, montantXof: 600 });
  dit('un essai au-dela de 500 F est refuse par le serveur, rien ne part', trop.status === 400 && demandesMtn().length === 0 && T.collectes_mtn.length === 0, trop.t);
  const e = await direction({ action: 'essai-paiement', numero: '01 97 00 00 11' });
  const ligne = collecte(e.o?.reference);
  dit('l essai de 100 F : la reference au registre AVANT l appel, une demande de 100 F en francs, a ce numero, sous cette reference',
    e.status === 200 && ligne?.genre === 'essai' && ligne?.montant_xof === 100 && demandesMtn(e.o.reference).length === 1
    && demandesMtn(e.o.reference)[0].corps.amount === '100' && demandesMtn(e.o.reference)[0].corps.payer.partyId === N.vite
    && journal.findIndex((j) => j.chemin === '/rest/v1/collectes_mtn' && j.methode === 'POST') < journal.findIndex((j) => j.chemin === '/collection/v1_0/requesttopay'), e.t);
  const s = await page({ action: 'statut', reference: e.o?.reference });
  dit('... MTN dit reussi : l essai est recu, rien n est pose nulle part (ni piece, ni caisse, ni depense)', s.o?.etat === 'recu' && collecte(e.o.reference).etat === 'recu' && T.cashboxes.length === 0 && T.expenses.length === 0, s.t);
  const o = await direction({ action: 'interrupteur', ouvrir: true });
  dit('apres l essai recu : la direction ouvre, et son nom est garde', o.status === 200 && o.o?.ouverte === true && T.collecte_mtn_reglage[0].ouverte === true && T.collecte_mtn_reglage[0].change_par === 'Y. B.', o.t);
  const f = await direction({ action: 'interrupteur', ouvrir: false });
  dit('... et ferme d un geste', f.o?.ouverte === false && T.collecte_mtn_reglage[0].ouverte === false, f.t);
}

/* ── Lot B : par le lien, PENDING puis SUCCESSFUL ── */
let refLien;
{
  remiseAZero(); ip = 22; ouvre();
  seance();
  const r = await page({ action: 'demander', jeton: JETON, msisdn: '01 97 00 00 01', pourboireXof: 2000, montantXof: 5, resteXof: 5 });
  refLien = r.o?.reference;
  const c = collecte(refLien);
  const posteMtn = demandesMtn(refLien)[0];
  dit('la demande par le lien : le reste de SA piece (30 000 F) plus le merci (2 000 F) ; le montant de la page est ignore',
    r.status === 200 && r.o?.montantXof === 32000 && r.o?.etat === 'attente' && c?.montant_xof === 32000 && c?.reste_xof === 30000 && c?.pourboire_xof === 2000 && posteMtn?.corps.amount === '32000', r.t);
  dit('... la reference ecrite au registre avant l appel, et donnee a MTN comme X-Reference-Id et identifiant externe',
    journal.findIndex((j) => j.chemin === '/rest/v1/collectes_mtn' && j.methode === 'POST') < journal.findIndex((j) => j.chemin === '/collection/v1_0/requesttopay')
    && posteMtn.corps.externalId === refLien && /^[0-9a-f-]{36}$/.test(refLien), '');
  dit('... l adresse de rappel donnee a MTN est celle declaree (mtn-momo-rappel/collection), du projet', posteMtn.h['x-callback-url'] === `${PROJET}/functions/v1/mtn-momo-rappel/collection`, posteMtn.h['x-callback-url']);
  dit('... la piece n a pas bouge : rien n est regle sur la seule demande', (pieceDe('p1').payments ?? []).length === 0 && pieceDe('p1').status === 'émise', JSON.stringify(pieceDe('p1')));
  const s1 = await page({ action: 'statut', reference: refLien });
  dit('MTN dit PENDING : la page attend, la piece n a pas bouge', s1.o?.etat === 'attente' && (pieceDe('p1').payments ?? []).length === 0, s1.t);
  const lus = versMtn().filter((j) => j.chemin.endsWith(refLien)).length;
  const s2 = await page({ action: 'statut', reference: refLien });
  dit('deux lectures a moins de quatre secondes : une seule chez MTN', s2.o?.etat === 'attente' && versMtn().filter((j) => j.chemin.endsWith(refLien)).length === lus, `${lus}`);
  collecte(refLien).relu_le = new Date(Date.now() - 10_000).toISOString();
  const s3 = await page({ action: 'statut', reference: refLien });
  const p = pieceDe('p1');
  const v = p.payments?.[0];
  const trace = p.reglementsEnLigne?.[0];
  dit('MTN dit SUCCESSFUL : la piece est reglee (30 000 F, caisse « MTN Collection », mtn-<reference>), le merci a part, la trace « MTN »',
    s3.o?.etat === 'recu' && s3.o?.montantXof === 32000 && p.status === 'payée' && p.payments.length === 1 && v.id === `mtn-${refLien}` && v.amountXof === 30000 && v.cashbox === 'MTN Collection' && v.method === 'MTN Collection'
    && p.tipXof === 2000 && trace?.moyen === 'MTN' && trace?.pourboireXof === 2000 && trace?.fraisXof === 384 && trace?.referenceMtn === refLien && trace?.numeroMasque === '01 97 •• •• 01', JSON.stringify(p));
  const rdv = rdvDe('r1');
  dit('... le rendez-vous suit sa piece (le meme versement, sa piece nommee) et son lien dit quand il a paye',
    rdv.payments?.length === 1 && rdv.payments[0].id === v.id && rdv.payments[0].invoiceId === 'p1' && rdv.paidXof === 30000 && !!rdv.lienDeReglement?.payeLe && rdv.status === 'confirmé', JSON.stringify(rdv));
  dit('... la caisse « MTN Collection » nait, une seule', T.cashboxes.filter((b) => b.data?.name === 'MTN Collection').length === 1 && T.cashboxes[0].id === 'cb-mtn-collection-br-1', JSON.stringify(T.cashboxes));
  const dep = T.expenses[0]?.data;
  dit('... les frais de MTN (1,2 % de 32 000 F : 384 F) en depense de la Maison, payee par la caisse MTN, « Paulette K. »',
    T.expenses.length === 1 && dep.amountXof === 384 && dep.cashbox === 'MTN Collection' && dep.category === 'Frais bancaires' && dep.label === 'Frais MTN (1,2 %) · Paulette K.', JSON.stringify(dep));
  dit('... le registre dit recu, la transaction de MTN, la pose et les frais', collecte(refLien).etat === 'recu' && !!collecte(refLien).transaction_mtn && !!collecte(refLien).pose_le && collecte(refLien).frais_xof === 384, JSON.stringify(collecte(refLien)));
  const s4 = await page({ action: 'statut', reference: refLien });
  await cron();
  collecte(refLien).relu_le = new Date(Date.now() - 600_000).toISOString();
  await cron();
  dit('relu encore, et le passage : rien ne se pose deux fois, MTN n est plus lu', s4.o?.etat === 'recu' && pieceDe('p1').payments.length === 1 && rdvDe('r1').payments.length === 1 && T.expenses.length === 1
    && versMtn().filter((j) => j.chemin.endsWith(refLien)).length === lus + 1, `${pieceDe('p1').payments.length} ${versMtn().filter((j) => j.chemin.endsWith(refLien)).length}`);
  dit('rien de ce que la page recoit ne montre une cle, un jeton ou le numero entier', [r, s1, s3].every((x) => sansSecret(x.t) && !x.t.includes('0197000001') && !x.t.includes('229019700')), r.t);
  const d2 = await page({ action: 'demander', jeton: JETON, msisdn: '0197000001' });
  dit('la seance reglee : une nouvelle demande est refusee (deja reglee), rien ne part', d2.status === 409 && d2.o?.erreur === 'deja_reglee' && demandesMtn().length === 1, d2.t);
}

/* ── Lot B : FAILED ── */
{
  remiseAZero(); ip = 23; ouvre();
  seance();
  const r = await page({ action: 'demander', jeton: JETON, msisdn: '01 97 00 00 12' });
  const s = await page({ action: 'statut', reference: r.o?.reference });
  dit('MTN dit FAILED : refuse, la raison dite en clair, la piece intacte', s.o?.etat === 'refuse' && s.o?.raison === 'la demande a été refusée sur le téléphone' && (pieceDe('p1').payments ?? []).length === 0 && T.cashboxes.length === 0, s.t);
  const r2 = await page({ action: 'demander', jeton: JETON, msisdn: '01 97 00 00 11' });
  dit('... et elle peut recommencer aussitot (un refus ne retient pas le rendez-vous)', r2.status === 200 && r2.o?.etat === 'attente', r2.t);
}

/* ── Lot B : deux demandes à la fois, le merci, le lien inconnu ── */
{
  remiseAZero(); ip = 24; ouvre();
  seance({ pieceData: { tipXof: 1000 } });
  const r1 = await page({ action: 'demander', jeton: JETON, msisdn: '01 97 00 00 18', pourboireXof: 3000 });
  const r2 = await page({ action: 'demander', jeton: JETON, msisdn: '01 97 00 00 18', pourboireXof: 3000 });
  dit('une demande en cours retient le rendez-vous trois minutes : la seconde est refusee, une seule part chez MTN', r1.status === 200 && r2.status === 409 && r2.o?.erreur === 'en_cours' && demandesMtn().length === 1, `${r1.t} ${r2.t}`);
  dit('une piece qui porte deja un merci : pas de second merci, le reste seul est demande', collecte(r1.o.reference)?.pourboire_xof === 0 && demandesMtn()[0].corps.amount === '30000', JSON.stringify(collecte(r1.o?.reference)));
  const inconnu = await page({ action: 'demander', jeton: JETON2, msisdn: '01 97 00 00 18' });
  const illisible = await page({ action: 'demander', jeton: 'pas un jeton', msisdn: '01 97 00 00 18' });
  const numero = await page({ action: 'demander', jeton: JETON, msisdn: '97000018' });
  dit('un lien inconnu, un jeton illisible, un numero illisible : refuses, rien ne part', inconnu.status === 404 && illisible.status === 400 && numero.status === 400 && demandesMtn().length === 1, `${inconnu.t} ${illisible.t} ${numero.t}`);
}

/* ── Lot B : le rappel ne fait que relire ── */
{
  remiseAZero(); ip = 25; ouvre();
  seance();
  const r = await page({ action: 'demander', jeton: JETON, msisdn: '01 97 00 00 18', pourboireXof: 0 });
  const ref = r.o?.reference;
  const g = await appelle({ method: 'GET' }, `${PROJET}/functions/v1/mtn-momo-rappel/collection`, 1);
  dit('le rappel dit sa version au GET', g.status === 200 && /^\d{4}-\d{2}-\d{2}-[a-z]$/.test(g.o?.version ?? ''), g.t);
  const menteur = await rappel({ referenceId: ref, externalId: ref, status: 'SUCCESSFUL', financialTransactionId: '1', amount: '30000' });
  dit('un rappel « SUCCESSFUL » quand MTN dit encore PENDING : rien n est regle (la relecture fait foi)', menteur.status === 200 && collecte(ref).etat === 'attente' && (pieceDe('p1').payments ?? []).length === 0, JSON.stringify(collecte(ref)));
  dit('... le rappel a bien demande une relecture chez MTN, par la cle de service', versMtn().some((j) => j.chemin.endsWith(ref)) && journal.some((j) => j.chemin === '/functions/v1/collecte-mtn' && j.h.authorization === `Bearer ${SERVICE}`), '');
  const avant = journal.length;
  const sans = await rappel({ status: 'SUCCESSFUL' });
  dit('un rappel sans reference : accuse, rien de relu, rien d ecrit', sans.status === 200 && !journal.slice(avant).some((j) => j.chemin === '/functions/v1/collecte-mtn' || j.origine === RELAIS), '');
  const paie = await rappel({ referenceId: ref, status: 'SUCCESSFUL' }, 'disbursement', 'POST');
  dit('un rappel de la paie : accuse, jamais transmis a la collecte', paie.status === 200 && !journal.slice(avant).some((j) => j.chemin === '/functions/v1/collecte-mtn'), '');
  liberes.add(ref);
  collecte(ref).relu_le = new Date(Date.now() - 10_000).toISOString();
  const [a, b] = await Promise.all([rappel({ referenceId: ref }), rappel({ externalId: ref, status: 'SUCCESSFUL' })]);
  collecte(ref).relu_le = new Date(Date.now() - 10_000).toISOString();
  await rappel({ externalId: ref });
  dit('MTN dit enfin SUCCESSFUL, trois rappels (dont deux ensemble) : la seance est reglee une seule fois',
    a.status === 200 && b.status === 200 && collecte(ref).etat === 'recu' && pieceDe('p1').payments.length === 1 && rdvDe('r1').payments.length === 1 && T.expenses.length === 1 && T.cashboxes.length === 1,
    JSON.stringify({ c: collecte(ref), n: pieceDe('p1').payments?.length }));
  const poses = journal.filter((j) => j.methode === 'PATCH' && j.chemin === '/rest/v1/collectes_mtn' && j.corps?.pose_le).length;
  dit('... deux relectures ensemble : une seule gagne « recu » (ecriture conditionnelle), une seule pose', poses === 1, `${poses}`);
  dit('le rappel ne repond rien de ce que la Maison sait', [menteur, sans, paie, a].every((x) => egal(x.o, { ok: true })), menteur.t);
}

/* ── Lot B : MTN muet, perdu, oublieux, jamais ── */
{
  remiseAZero(); ip = 26; ouvre();
  seance({ id: 'r1', pid: 'p1', jeton: JETON });
  seance({ id: 'r2', pid: 'p2', jeton: JETON2, cid: 'c2', nom: 'Sena AGBO', phone: '0197000099' });
  seance({ id: 'r3', pid: 'p3', jeton: 'bcdefghjkmnpqr', cid: 'c3', nom: 'Awa HOUNSA', phone: '0197000098' });
  seance({ id: 'r4', pid: 'p4', jeton: 'cdefghjkmnpqrs', cid: 'c4', nom: 'Ines DOSSA', phone: '0197000097' });
  const muet = await page({ action: 'demander', jeton: JETON, msisdn: '01 97 00 00 14' });
  dit('MTN prend la demande mais repond 500 : « sans reponse », a relire, jamais renvoyee', muet.o?.etat === 'attente' && collecte(muet.o.reference).etat === 'sans-reponse', JSON.stringify(collecte(muet.o?.reference)));
  const perdu = await page({ action: 'demander', jeton: JETON2, msisdn: '01 97 00 00 15' });
  const oublie = await page({ action: 'demander', jeton: 'bcdefghjkmnpqr', msisdn: '01 97 00 00 17' });
  const jamais = await page({ action: 'demander', jeton: 'cdefghjkmnpqrs', msisdn: '01 97 00 00 16' });
  for (let i = 0; i < 5; i++) {
    for (const x of [muet, perdu, oublie, jamais]) vieillis(x.o.reference);
    await cron();
  }
  dit('muet : relue, recue, une seule demande chez MTN', collecte(muet.o.reference).etat === 'recu' && demandesMtn(muet.o.reference).length === 1 && pieceDe('p1').payments.length === 1, `${demandesMtn(muet.o.reference).length}`);
  dit('perdue (MTN ne l a jamais recue) : renvoyee sous la MEME reference, une seule demande prise par MTN, puis recue',
    collecte(perdu.o.reference).etat === 'recu' && demandesMtn(perdu.o.reference).length === 2 && rtp.get(perdu.o.reference)?.posts === 1 && pieceDe('p2').payments.length === 1, `${demandesMtn(perdu.o.reference).length}`);
  dit('acceptee puis oubliee un temps par MTN : relue, jamais renvoyee, puis recue', collecte(oublie.o.reference).etat === 'recu' && demandesMtn(oublie.o.reference).length === 1 && pieceDe('p3').payments.length === 1, `${demandesMtn(oublie.o.reference).length}`);
  dit('jamais prise par MTN : trois renvois au plus, puis refusee « MTN n a pas recu la demande », la piece intacte',
    collecte(jamais.o.reference).etat === 'refuse' && collecte(jamais.o.reference).raison === 'INCONNU_CHEZ_MTN' && demandesMtn(jamais.o.reference).length === 4 && (pieceDe('p4').payments ?? []).length === 0,
    `${demandesMtn(jamais.o.reference).length} ${JSON.stringify(collecte(jamais.o.reference))}`);
}

/* ── Lot B : le reste a bougé avant la réponse ── */
{
  remiseAZero(); ip = 27; ouvre();
  seance({ id: 'r1', pid: 'p1', jeton: JETON });
  seance({ id: 'r2', pid: 'p2', jeton: JETON2, cid: 'c2', nom: 'Sena AGBO', phone: '0197000099' });
  const baisse = await page({ action: 'demander', jeton: JETON, msisdn: '01 97 00 00 11', pourboireXof: 1000 });
  pieceDe('p1').payments = [{ id: 'esp-1', amountXof: 10000, method: 'Espèces', cashbox: 'Espèces' }];
  const reglee = await page({ action: 'demander', jeton: JETON2, msisdn: '01 97 00 00 11' });
  pieceDe('p2').payments = [{ id: 'esp-2', amountXof: 30000, method: 'Espèces', cashbox: 'Espèces' }];
  await page({ action: 'statut', reference: baisse.o.reference });
  await page({ action: 'statut', reference: reglee.o.reference });
  dit('le reste a baisse au comptoir avant la reponse : l argent reste au registre, « a rapprocher », aucun merci invente',
    collecte(baisse.o.reference).etat === 'recu' && collecte(baisse.o.reference).a_rapprocher === 'reste_change' && !collecte(baisse.o.reference).pose_le
    && pieceDe('p1').payments.length === 1 && !pieceDe('p1').tipXof && T.expenses.length === 0, JSON.stringify(collecte(baisse.o.reference)));
  dit('reglee au comptoir avant la reponse : « a rapprocher », la piece intacte', collecte(reglee.o.reference).a_rapprocher === 'deja_reglee' && pieceDe('p2').payments.length === 1, JSON.stringify(collecte(reglee.o.reference)));
}

/* ── Lot B : une écriture du comptoir entre la lecture et l'écriture ── */
{
  remiseAZero(); ip = 28; ouvre();
  seance();
  const r = await page({ action: 'demander', jeton: JETON, msisdn: '01 97 00 00 11' });
  aCourse = { id: 'p1', versement: { id: 'esp-course', amountXof: 5000, method: 'Espèces', cashbox: 'Espèces' } };
  await page({ action: 'statut', reference: r.o.reference });
  dit('le comptoir ecrit la piece pendant la pose : rien n est ecrase ; le reste a baisse, l argent attend « a rapprocher »',
    pieceDe('p1').payments.some((x) => x.id === 'esp-course') && !pieceDe('p1').payments.some((x) => x.id.startsWith('mtn-')) && collecte(r.o.reference).a_rapprocher === 'reste_change',
    JSON.stringify({ p: pieceDe('p1').payments, c: collecte(r.o.reference) }));
}

/* ── Lot B : une panne entre « reçu » et la pose ── */
{
  remiseAZero(); ip = 29; ouvre();
  seance();
  const r = await page({ action: 'demander', jeton: JETON, msisdn: '01 97 00 00 11' });
  Object.assign(collecte(r.o.reference), { etat: 'recu', repondu_le: new Date(Date.now() - 120_000).toISOString(), transaction_mtn: '777' });
  await cron(); await cron();
  dit('recu mais pas pose (une panne) : le passage pose, une seule fois', pieceDe('p1').payments.length === 1 && !!collecte(r.o.reference).pose_le && rdvDe('r1').payments.length === 1 && T.expenses.length === 1, JSON.stringify(collecte(r.o.reference)));
}

/* ── Lot B : elle avait terminé elle-même (Ma Couronne) ── */
{
  remiseAZero(); ip = 30; ouvre();
  seance({ rdv: { termineParElle: { le: new Date(Date.now() - 600_000).toISOString(), par: 'couronne' } } });
  const r = await page({ action: 'demander', jeton: JETON, msisdn: '01 97 00 00 11' });
  const s = await page({ action: 'statut', reference: r.o.reference });
  dit('elle avait termine elle-meme : reglee par MTN, le rendez-vous passe honore, et la page lui dit qu elle peut partir',
    s.o?.etat === 'recu' && s.o?.honore === true && rdvDe('r1').status === 'honoré' && !!rdvDe('r1').honoreAuReglement?.le, JSON.stringify({ s: s.o, r: rdvDe('r1') }));
}

/* ── Lot B : le comptoir ── */
{
  remiseAZero(); ip = 31; ouvre();
  seance({ id: 'r-a', pid: 'p-a', jeton: null, time: '08:30' });
  seance({ id: 'r-x', pid: 'p-x', jeton: null, time: '10:00', cid: 'c9', nom: 'Sena AGBO', phone: '0197000099' });
  seance({ id: 'r-y', pid: 'p-y', jeton: null, time: '11:00', status: 'annulé' });
  const c = await page({ action: 'comptoir', numero: '01 97 00 00 01' });
  dit('le comptoir : SON rendez-vous du jour, son prenom et l initiale, son reste ; rien d autre (ni identifiant, ni lignes, ni numero)',
    c.status === 200 && c.o?.ouverte === true && egal(c.o?.rdvs, [{ n: 0, prenom: 'Paulette K.', etat: 'a-regler', resteXof: 30000, pourboire: true }])
    && !c.t.includes('KOSSOU') && !c.t.includes('SÍNSIN') && !c.t.includes('r-a') && !c.t.includes('p-a'), c.t);
  const personne = await page({ action: 'comptoir', numero: '01 97 00 00 50' });
  dit('un numero sans rendez-vous aujourd hui : rien', egal(personne.o?.rdvs, []), personne.t);
  const d = await page({ action: 'demander', comptoir: { numero: '01 97 00 00 01', n: 0 }, pourboireXof: 1000, montantXof: 10 });
  dit('la demande du comptoir : au numero tape, le reste de SA piece et le merci, origine « comptoir »',
    d.status === 200 && d.o?.montantXof === 31000 && collecte(d.o.reference)?.origine === 'comptoir' && collecte(d.o.reference)?.rdv_id === 'r-a'
    && demandesMtn(d.o.reference)[0]?.corps.payer.partyId === N.bon && demandesMtn(d.o.reference)[0]?.corps.amount === '31000', d.t);
  const d2 = await page({ action: 'demander', comptoir: { numero: '01 97 00 00 01', n: 2 } });
  dit('un rang qui n existe pas : introuvable, rien ne part', d2.status === 404 && demandesMtn().length === 1, d2.t);
}

/* ── Lot B : le registre en panne, la limite de débit ── */
{
  remiseAZero(); ip = 32; ouvre();
  seance();
  registreRefuse = true;
  const r = await page({ action: 'demander', jeton: JETON, msisdn: '01 97 00 00 11' });
  dit('le registre refuse la reference : MTN n est pas appele', r.status === 503 && r.o?.erreur === 'registre' && demandesMtn().length === 0, r.t);
  registreRefuse = false;
  ip = 33;
  let derniere;
  for (let i = 0; i < 13; i++) derniere = await page({ action: 'demander', jeton: JETON2, msisdn: '01 97 00 00 11' });
  dit('treize demandes de la meme adresse en dix minutes : la treizieme est freinee', derniere.status === 429, derniere.t);
  ip = 34;
  const s0 = await page({ action: 'statut', reference: 'pas-une-ref' });
  const s1 = await page({ action: 'statut', reference: REF(99) });
  dit('le statut d une reference illisible ou inconnue : refuse, rien chez MTN', s0.status === 400 && s1.status === 404 && !versMtn().some((j) => /requesttopay\//.test(j.chemin)), `${s0.t} ${s1.t}`);
}

/* ══ 3. LA BASE, LES PAGES ET LE TRÔNE, lus dans leurs fichiers ══ */
{
  const sql = lis(SQL);
  dit('0200 : le registre et l interrupteur sous RLS, la direction lit, l equipe n ecrit pas ; fermé a la pose ; le passage toutes les 2 minutes',
    /alter table public\.collectes_mtn enable row level security;/.test(sql) && /alter table public\.collecte_mtn_reglage enable row level security;/.test(sql)
    && (sql.match(/using \(public\.est_direction\(\)\);/g) ?? []).length === 2 && /revoke all on public\.collectes_mtn from anon, authenticated;/.test(sql)
    && /revoke all on public\.collecte_mtn_reglage from anon, authenticated;/.test(sql) && /ouverte     boolean not null default false,/.test(sql)
    && /cron\.schedule\('collecte-par-mtn', '\*\/2 \* \* \* \*'/.test(sql) && /reference       uuid primary key,/.test(sql), '');
  dit('0200 : un reglement porte son rendez-vous et sa piece, et son montant est le reste plus le merci ; un essai, 500 F au plus',
    /genre = 'reglement' and origine in \('lien', 'comptoir'\) and rdv_id is not null and piece_id is not null/.test(sql) && /montant_xof = reste_xof \+ pourboire_xof/.test(sql) && /montant_xof <= 500/.test(sql), '');
  const app = sansCommentaires(lis(PAGE));
  dit('la page « Regler » : MTN seulement pour une seance avec sa piece (ni foyer, ni avance), KkiaPay retenu pendant l attente, la page ne decide d aucun montant',
    /\{!p\.sansPiece && !p\.tetes && \(/.test(app) && /disabled=\{ecran\.k === 'paiement' \|\| mtnOccupe\}/.test(app) && !/resteXof\s*=/.test(app) && /pourboireXof=\{p\.pourboire \? pourboire : 0\}/.test(app), '');
  const serveur = lis(SERVEUR_PAGE);
  dit('les pages n envoient que le numero et le merci, jamais un montant', /appel\(\{ action: 'demander', jeton, msisdn, pourboireXof \}\)/.test(serveur) && /appel\(\{ action: 'demander', comptoir: \{ numero, n \}, pourboireXof \}\)/.test(serveur) && !/montantXof:/.test(serveur.replace(/montantXof\?: number;/, '')), '');
  const mtnPage = lis(MTN_PAGE);
  dit('la page MTN : « Validez sur votre telephone », *880#, aucun frais, « reglé » seulement sur la reponse relue', /Validez sur votre téléphone/.test(mtnPage) && /\*880#/.test(mtnPage) && /Aucun frais pour vous\./.test(mtnPage) && /if \(s\.etat === 'recu'\)/.test(mtnPage), '');
  dit('le QR mene au comptoir : regler.html?comptoir, l adresse lue chez GitHub, jamais ecrite', /has\('comptoir'\)/.test(lis(MAIN)) && /const CHEMIN_DU_COMPTOIR = '\/trone\/regler\.html\?comptoir';/.test(lis(QR)) && /origineDuCompte/.test(lis(QR)) && !/\b[\w-]+\.(?:com|bj|net|org|io)\b/i.test(sansCommentaires(lis(QR)).replace(/www\.w3\.org/g, '')), '');
  const bandeau = lis(BANDEAU);
  const client = lis(CLIENT);
  /* 11 novembre 2026 au soir : « une page à part pour MTN collecte et disbursement, je ne veux pas ça dans Encaissements » (Yéman). */
  dit('le bandeau vit sur sa page Finances › MTN MoMo (direction seule), plus dans Encaissements, et chaque reglement du jour ouvre son rendez-vous',
    /<CompteDeCollecteMtn onOuvreLeRdv=\{setRdvAOuvrir\} \/>/.test(lis(PAGE_MTN)) && !/<CompteDeCollecteMtn/.test(lis(ENCAISSEMENTS))
      && /path: '\/mtn', label: 'MTN MoMo'/.test(lis(ROUTES_DU_TRONE)) && /export const ROUTES_DIRECTION = \[[^\]]*'\/mtn'/.test(lis(ROUTES_DU_TRONE)) && /onOuvreLeRdv\(c\.rdv_id\)/.test(bandeau), '');
  dit('la direction seule le voit (souverain, gerant)', /const direction = moi\?\.role === 'souverain' \|\| moi\?\.role === 'gerant';/.test(bandeau) && /  if \(!direction\) return null;\n/.test(bandeau), '');
  dit('le solde se relit chaque minute ecran ouvert, au retour sur l ecran, et d un geste', /relire\(\); \}, 60_000\);/.test(client) && /visibilitychange/.test(client) && /Relire maintenant/.test(bandeau), '');
  dit('sans numero, le bandeau dit « numero a poser » ; il dit l heure de la derniere lecture et le souci en clair',
    /lecture\?\.numero \?\? 'numéro à poser'/.test(bandeau) && /lu à \{/.test(bandeau) && /role="alert"/.test(bandeau), '');
  dit('l interrupteur au Trone : « Ouvrir aux clientes » seulement apres l essai recu', /disabled=\{bascule \|\| \(!ouverte && !essaiRecu\)\}/.test(bandeau) && /Ouvrir aux clientes/.test(bandeau), '');
  {
    /* La règle elle-même, rejouée : MTN Collection hors du comptage du soir,
       et surtout PAS le MoMoPay de la Maison (« MTN MoMoPay »), qui se compte. */
    const sortie = path.join(dossierDuTrone, 'caisses.mjs');
    await build({ entryPoints: [path.join(racine, CAISSES)], bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error' });
    const C = await import(pathToFileURL(sortie).href);
    dit('la caisse « MTN Collection » ne se compte pas au tiroir le soir (l argent est chez MTN) ; le MoMoPay de la Maison, si',
      C.HORS_CLOTURE.includes('MTN Collection') && !C.HORS_CLOTURE.includes('MTN MoMoPay') && !C.HORS_CLOTURE.includes(C.CAISSE_MTN), JSON.stringify(C.HORS_CLOTURE));
  }
  dit('« Confirme par MTN » sur l encaissement du rendez-vous', /<ConfirmeParMtn appt=\{appt\} \/>/.test(lis(ACTIONS)) && /Confirmé par MTN à \{heureDite\(t\.payeLe\)\} · numéro \{t\.numeroMasque\} · caisse « \{t\.caisse\} »/.test(lis(CONFIRME)), '');
  /* Le dépôt est public : aucun numéro mobile (01 et huit chiffres, espacés
     ou non) ni identifiant de compte MTN (« ….sp ») dans ce qui part en
     ligne. Le banc, lui, n'écrit que des numéros inventés. */
  const UN_NUMERO = /\b01(?:[\s.]?\d{2}){4}\b/;
  const UN_COMPTE_MTN = /\b[A-Za-z][\w-]*\.sp\b/;
  const fichiers = [FONCTION, RAPPEL, PUR, BANDEAU, CLIENT, SQL, PAGE, MTN_PAGE, SERVEUR_PAGE, CONFIRME, QR, 'scripts/collecte-copie-serveur.mjs'];
  const fautifs = fichiers.filter((f) => UN_NUMERO.test(lis(f)) || UN_COMPTE_MTN.test(lis(f)));
  dit('aucun numero ni compte MTN dans le depot public (fonctions, regles, base, pages, Trone, QR)', fautifs.length === 0, fautifs.join(', '));
  const textes = [bandeau, client, mtnPage, lis(CONFIRME), lis(SERVEUR_PAGE)];
  dit('les textes du Trone et des pages sans tiret long', !textes.some((t) => sansCommentaires(t).includes('—')), '');
}

/* Tout le journal : jamais MTN en direct */
dit('aucun appel ne sort du monde simule', !journal.some((j) => ![PROJET, RELAIS].includes(j.origine)), JSON.stringify([...new Set(journal.map((j) => j.origine))]));

rmSync(dossierDuTrone, { recursive: true, force: true });
console.log(echecs === 0 ? `\nRegler par MTN tient : ${oks} controles.` : `\n${echecs} ECHEC(S) sur ${oks + echecs}`);
process.exit(echecs === 0 ? 0 : 1);
