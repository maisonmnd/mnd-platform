import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* TERMINER ET REGLER, EPROUVE - 6 novembre 2026.
   `node scripts/verifie-terminer-et-regler.mjs` : le banc, dans un processus
   fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. Une preuve ne tourne jamais dans l'arbre commun :
   seulement dans une copie propre detachee.
   `--prouve --tranche=1/3` : la preuve en plusieurs passes (une faute sur
   trois, la premiere), pour un lanceur qui coupe les commandes longues ;
   les tranches 1/3, 2/3 et 3/3 ensemble couvrent toutes les fautes.
   `--prouve --seulement=frein,acompte` : les seules fautes dont le nom porte
   l'un de ces mots (la preuve d'une correction, sans rejouer les autres). */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const tranche = /^--tranche=(\d+)\/(\d+)$/.exec(process.argv.find((a) => a.startsWith('--tranche=')) ?? '');
const seulement = (process.argv.find((a) => a.startsWith('--seulement=')) ?? '').slice('--seulement='.length).split(',').filter(Boolean);

const PUR = 'src/shared/terminer-et-regler-pur.ts';
const TER = 'supabase/functions/terminer-et-regler/index.ts';
const REG = 'supabase/functions/regler-la-seance/index.ts';
const AU = 'supabase/functions/whatsapp-automate/index.ts';
const SHELL = 'src/apps/trone/shell/Shell.tsx';
const MAIN = 'src/apps/trone/shell/useLaFinDuRituel.ts';
const CARNET = 'src/apps/trone/routes/clients/Carnet.tsx';
const PANNEAU = 'src/apps/trone/routes/clients/ReglementEnDirect.tsx';
const GUETTEUR = 'src/apps/trone/shell/useReglementsEnLigne.ts';
const FICHE = 'src/apps/trone/routes/clients/Customers.tsx';
const ENCAISSEMENT = 'src/apps/trone/routes/clients/actions.tsx';
const TABS = 'src/apps/couronne/Tabs.tsx';
const CARTE = 'src/apps/couronne/RituelEnCours.tsx';
const SERVEUR = 'src/shared/terminer-et-regler-serveur.ts';
const ENTABS = 'src/apps/couronne/i18n/en-tabs.ts';
const REGLER = 'src/apps/regler/App.tsx';
const SITE = 'src/apps/revelateur/billet-du-rdv-pur.ts';
const ILOT = 'src/apps/revelateur/ilots/MonRendezVous.tsx';
const CONTENU = 'src/apps/revelateur/contenu.ts';
const GENERE = 'scripts/genere-revelateur.mjs';
const PANNES = [
  /* ── Le serveur : les vraies fonctions, rejouees ── */
  ['le reglement n honore plus', REG, "  return honneur ? ({ ...regle, status: 'honoré', honoreAuReglement: honneur } as RdvLu) : regle;", '  return regle;'],
  ['l honneur sans la marque que le Trone suit', REG, "({ ...regle, status: 'honoré', honoreAuReglement: honneur } as RdvLu)", "({ ...regle, status: 'honoré' } as RdvLu)"],
  ['un rejeu ne rattrape pas l honneur', REG, '    const honore = await suisLeRdv(rdv.id, null, piece.id, resteDeLaPiece(piece), new Date());\n', '    const honore = false;\n'],
  ['le foyer regle n honore pas', REG, 'tousHonores = (await suisLeRdv(x.rdv.id, v, x.piece.id, resteDeLaPiece(neuve), quand, true)) && tousHonores;', 'tousHonores = (await suisLeRdv(x.rdv.id, v, x.piece.id, 1, quand, true)) && tousHonores;'],
  ['la page dit « vous pouvez partir » sans honneur', REG, 'moyen: moyenDit(tx.source), honore: !!r.honore });', 'moyen: moyenDit(tx.source), honore: true });'],
  ['la page ne sait pas que le rendez-vous est honore', REG, "  const honore = !!(apres as { honoreAuReglement?: { le?: string } }).honoreAuReglement?.le;", '  const honore = false;'],
  ['la page renonce pendant que le Trone prepare la piece', REG, "    ...(e.etat === 'sans-piece' && o.rdv?.termineParElle?.le ? { enPreparation: true } : {}),\n", ''],
  ['le foyer se regle a moitie pret', REG, "      : avecPiece.length === 0 || enPreparation ? 'sans-piece'", "      : avecPiece.length === 0 ? 'sans-piece'"],
  ['la copie de l honneur derive dans regler-la-seance', REG, '  if (!Number.isFinite(reste) || Math.round(reste) > 0) return null;', '  if (!Number.isFinite(reste) || Math.round(reste) > 1) return null;'],
  ['la copie de la regle derive dans terminer-et-regler', TER, 'export const JOURS_APRES_DE_LA_RECHERCHE = 100;', 'export const JOURS_APRES_DE_LA_RECHERCHE = 101;'],
  ['la porte WhatsApp s ouvre sans la cle de service', TER, "    if (!parLeService(req)) return json({ ok: false, error: 'interdit' }, 403);\n", ''],
  ['Ma Couronne termine le rendez-vous d une autre', TER, "      if (!ligne || String(ligne.data?.clientId ?? '') !== ficheId) return json({ ok: false, error: 'introuvable' }, 404);", "      if (!ligne) return json({ ok: false, error: 'introuvable' }, 404);"],
  ['un echec ne compte plus : le frein par code est mort', TER, 'echecsDuCodeDansLHeure: dansLHeure - 1, echecsDuCodeDuJour: duJour - 1 })', 'echecsDuCodeDansLHeure: 0, echecsDuCodeDuJour: 0 })'],
  ['le frein n arrete plus rien', TER, "echecsDuCodeDuJour: duJour - 1 }) !== 'libre') {", "echecsDuCodeDuJour: duJour - 1 }) === 'jamais') {"],
  ['la reponse trahit un code qui existe', TER, "  if (!ligne || !SECRET_DES_LIENS) return json({ ok: false, error: 'introuvable' });", "  if (!ligne || !SECRET_DES_LIENS) return json({ ok: false, error: candidats.length ? 'chiffres' : 'introuvable' });"],
  /* Le frein tient en rafale, se ferme quand il ne se lit pas, et la recherche lit peu (relecture du 6 novembre 2026). */
  ['frein : la recherche compte avant de noter, une rafale passe l adresse', TER, "  const essaiDeLAdresse = await note('fin-retrouver', ip);", "  const essaiDeLAdresse: Essai = 0; setTimeout(() => { void note('fin-retrouver', ip); }, 0);"],
  ['frein : l essai du code se note apres coup, une rafale passe le code', TER, "  const essaiDuCode = code ? await note('fin-echec', code) : null;", "  const essaiDuCode: Essai = code ? 0 : null; if (code) setTimeout(() => { void note('fin-echec', code); }, 0);"],
  ['frein : l adresse laisse passer une recherche de trop', TER, 'essaisDeLAdresse: deLAdresse - 1,', 'essaisDeLAdresse: deLAdresse - 2,'],
  ['frein : un compte illisible passe pour zero', TER, '  return error ? null : (count ?? 0);', '  return error ? 0 : (count ?? 0);'],
  ['frein : un essai qui ne s inscrit pas n arrete rien', TER, '  return error ? null : ((data ?? [])[0]?.id ?? null);', '  return error ? 0 : ((data ?? [])[0]?.id ?? null);'],
  ['frein : un essai refuse reste inscrit', TER, '    await oublie(essaiDeLAdresse);\n    await oublie(essaiDuCode);\n', ''],
  ['frein : une recherche reussie compte pour un echec', TER, '  await oublie(essaiDuCode);\n  return json({ ok: true, v:', '  return json({ ok: true, v:'],
  ['frein : chaque essai relit cent jours de rendez-vous avec leurs donnees', TER, "admin.from('appointments').select('id')\n      .gte('data->>date', f.du)", "admin.from('appointments').select('id,branch_id,data,updated_at')\n      .gte('data->>date', f.du)"],
  ['frein : un code inconnu fait moins de travail qu un code connu', TER, "for (const id of ids.length ? ids : ['personne'])", 'for (const id of ids)'],
  ['frein : une porte ordinaire compte avant de noter', TER, '  const essai = await note(seau, ip);\n  const vus = await combien(seau, ip, 10);', '  const essai: Essai = 0; setTimeout(() => { void note(seau, ip); }, 0);\n  const vus = await combien(seau, ip, 10);'],
  ['frein : une porte ordinaire laisse passer un de trop', TER, 'vus > plafond) {', 'vus > plafond + 1) {'],
  ['le personnel prevenu a chaque toucher', TER, '  if (neuve) {', '  if (true) {'],
  ['le personnel n est plus prevenu', TER, '  if (neuve) {', '  if (false) {'],
  ['une seconde porte reecrit la premiere marque', TER, '      const marque = d.termineParElle?.le ? d.termineParElle : { le, par: porte };', '      const marque = { le, par: porte };'],
  ['un jeton forge termine', TER, "      if (!apptId) return json({ ok: false, error: 'lien' });\n      ids = [apptId];", '      ids = [String(apptId)];'],
  ['la marque se pose porte fermee', TER, '  const ouvertes = tetes.filter((t) => t.porte.ouverte);', '  const ouvertes = tetes;'],
  ['le serveur ecrit sur une ligne qui a bouge', TER, "    if (frais.updated_at) q = q.eq('updated_at', frais.updated_at);\n", ''],
  ['« Passe au comptoir » ignore par le serveur', TER, "      porte: porteDeLaFin({ rdv, maintenantMs: maintenant, passeAuComptoir: fiche?.passeAuComptoir === true,", '      porte: porteDeLaFin({ rdv, maintenantMs: maintenant, passeAuComptoir: false,'],
  ['le serveur honore a la declaration', TER, '      return { ...d, termineParElle: marque, ...avecLien };', "      return { ...d, termineParElle: marque, ...avecLien, status: 'honoré' };"],
  ['le billet dit son nom de famille', TER, "    rdv, reference: referenceDuRendezVous(l.id), prenom: String(fiche?.name ?? l.data?.clientName ?? ''),", "    rdv, reference: String(fiche?.name ?? ''), prenom: String(fiche?.name ?? l.data?.clientName ?? ''),"],
  /* ── Le Trone ── */
  ['le Trone ne monte pas la main de la fin du rituel', SHELL, '  useLaFinDuRituel();\n', ''],
  ['deux postes ecrivent deux pieces', MAIN, "          if (!(prise ?? []).length) { fait.delete(`piece-${cle}`); return; }\n\n          /* Le prix se fige", "          /* Le prix se fige"],
  ['la reservation de la piece sans condition', MAIN, "            ? ecriture.is('data->termineParElle->>pieceLe', null)", '            ? ecriture'],
  /* Une reservation qui n'aboutit pas ne bloque plus la piece (relecture du 6 novembre 2026). */
  ['reservation : l erreur de la lecture n est pas lue (le poste croit avoir essaye)', MAIN, '          if (lecture) throw new Error(lecture.message);\n', ''],
  ['reservation : l erreur de l ecriture n est pas lue', MAIN, '          if (refus) throw new Error(refus.message);\n', ''],
  ['reservation : un echec laisse le rendez-vous « fait » sur ce poste', MAIN, '          fait.delete(`piece-${cle}`);\n          retente();', '          retente();'],
  ['reservation : un echec ne se retente pas', MAIN, '          fait.delete(`piece-${cle}`);\n          retente();', '          fait.delete(`piece-${cle}`);'],
  ['reservation : celle qui n aboutit pas bloque la piece pour toujours', PUR, "  return o.maintenantMs - o.vueDepuisMs >= ATTENTE_D_UNE_RESERVATION_MS ? 'reprendre' : 'attendre';", "  return 'attendre';"],
  ['reservation : reprise aussitot, sans attendre le poste qui ecrit', PUR, 'export const ATTENTE_D_UNE_RESERVATION_MS = 90_000;', 'export const ATTENTE_D_UNE_RESERVATION_MS = 0;'],
  ['reservation : celle qu un poste n a pas encore vue se reprend', PUR, "  if (o.vueDepuisMs === null || !Number.isFinite(o.vueDepuisMs)) return 'attendre';", "  if (o.vueDepuisMs === null || !Number.isFinite(o.vueDepuisMs)) return 'reprendre';"],
  ['reservation : la reprise sans condition sur l ancienne (deux postes la reprennent)', MAIN, "            : ecriture.eq('data->termineParElle->>pieceLe', ancienne)).select('id');", "            : ecriture).select('id');"],
  ['reservation : la reprise ne regarde pas les pieces du serveur', MAIN, '            if ((dejaLa ?? []).length > 0) return;\n', ''],
  ['reservation : le delai court sur l heure d un autre poste', MAIN, 'vueDepuisMs: vue ? reservationsVues.get(cle) ?? null : null', 'vueDepuisMs: vue ? Date.parse(vue) : null'],
  ['reservation : une autre que celle que le poste a vue vieillir se reprend', MAIN, '          if (ancienne !== vue) { fait.delete(`piece-${cle}`); return; }\n', ''],
  ['reservation : aucun minuteur ne reveille l examen', MAIN, '    const minuteur = window.setTimeout(() => setTic((x) => x + 1), Math.max(1000, reveil + 500));', '    const minuteur = 0;'],
  ['reservation : un verdict rendu se redit a chaque reprise', MAIN, '      if (fait.has(`sans-${a.id}`)) continue;\n', ''],
  ['le Trone honore a la declaration', MAIN, '          const r = factureAEnvoyer(frais, byId, frais.branchId, tarifs.prixPlein, tarifs.gesteDe);', '          const r = factureAEnvoyer(frais, byId, frais.branchId, tarifs.prixPlein, tarifs.gesteDe); honorAppointment(frais, byId, { muet: true });'],
  ['la piece au prix de vitrine, pas au tarif de sa tete', MAIN, 'factureAEnvoyer(frais, byId, frais.branchId, tarifs.prixPlein, tarifs.gesteDe);', 'factureAEnvoyer(frais, byId, frais.branchId);'],
  ['le prix ne se fige pas avec la piece', MAIN, '{ ...x, ...prixAFiger(x, byId), termineParElle: { ...x.termineParElle, pieceLe } }', '{ ...x, termineParElle: { ...x.termineParElle, pieceLe } }'],
  ['une piece pour une declaration qui ne tient pas', MAIN, "pieceAPreparer(a, invoices.some((i) => i.apptId === a.id && i.kind === 'facture'))", "!invoices.some((i) => i.apptId === a.id && i.kind === 'facture')"],
  ['la piece s ecrit avant la lecture des tables', MAIN, "!tablePrete('appointments') || !tablePrete('invoices') || !tablePrete('clients') || byId.size === 0) return;", "byId.size === 0) return;"],
  ['les suites de l honneur se font deux fois', MAIN, ".eq('id', a.id).is('data->honoreAuReglement->>suitesLe', null).select('id');", ".eq('id', a.id).select('id');"],
  ['les suites de l honneur ne se font plus', MAIN, '        honorAppointment(a, byId, { muet: true });\n      })();', '      })();'],
  ['l acompte monte au-dela du total de la piece', PUR, '    const m = Math.min(reste, Math.max(0, Math.round(Number(d.amountXof) || 0)));', '    const m = Math.max(0, Math.round(Number(d.amountXof) || 0));'],
  ['l acompte entre dans un tiroir d aujourd hui', PUR, "date: d.date, amountXof: m, method: 'Acompte', note: d.note });", "date: d.date, amountXof: m, method: 'Espèces' as 'Acompte', note: d.note });"],
  ['l acompte perd sa date', PUR, "date: d.date, amountXof: m, method: 'Acompte', note: d.note });", "date: '', amountXof: m, method: 'Acompte', note: d.note });"],
  ['le Trone remonte l acompte sur une piece deja la', MAIN, '          if (!r.deja) {', '          if (true) {'],
  ['le Trone oublie l acompte : la page redemande le prix entier', MAIN, 'dejaRecu: lArgentDejaRecu(frais, frais.date) });', 'dejaRecu: [] });'],
  ['l acompte monte sans dire qu il est entre un autre jour', MAIN, ', depositCreditXof: (i.depositCreditXof ?? 0) + dejaXof } : i)));', ' } : i)));'],
  ['au comptoir, l acompte s ecrit une seconde fois sur la piece', ENCAISSEMENT, "      const depositCredit = depositReceived && alreadyPaid === 0 && !acompteDejaSurLaPiece ? deposit : 0;", "      const depositCredit = depositReceived && alreadyPaid === 0 ? deposit : 0;"],
  ['le comptoir ne regarde pas les « Acompte » de la piece ouverte', ENCAISSEMENT, ".some((v) => v.method === 'Acompte');\n      const depositCredit", ".some((v) => v.method === 'Avoir');\n      const depositCredit"],
  ['le Carnet tait la marque', CARNET, 'const marque = a.termineParElle ? marqueDeLaFinAuCarnet(a, resteDeSaPiece(a.id)) : null;', 'const marque = null as ReturnType<typeof marqueDeLaFinAuCarnet>;'],
  ['le panneau dit « Message parti » a celle qui a termine elle-meme', PANNEAU, "    fin\n      ? { nom: 'A terminé'", "    false\n      ? { nom: 'A terminé'"],
  ['« Depart sans caisse » pour tout reglement en ligne', GUETTEUR, 'const sansCaisse = !!appts.find((a) => a.id === p.apptId)?.termineParElle && invoiceResteXof(p) <= 0;', 'const sansCaisse = true;'],
  ['la case « Passe au comptoir » n ecrit rien', FICHE, 'onChange={(e) => patch({ passeAuComptoir: e.target.checked ? true : undefined })}', 'onChange={() => patch({})}'],
  /* ── La porte de Ma Couronne, et la page « Regler » ── */
  ['l accueil de Ma Couronne ne monte pas la carte', TABS, "        <RituelEnCours nomDuRituel={(a) => serviceNames(a, services)} />\n", ''],
  ['la carte montre le rituel d une autre', CARTE, '    rdvs: appts.filter((a) => a.clientId === monId),', '    rdvs: appts,'],
  ['la carte ignore « Passe au comptoir »', CARTE, '    passeAuComptoir: client?.passeAuComptoir === true,', '    passeAuComptoir: false,'],
  ['la carte termine sans son compte', CARTE, "await termineMonRituel(rdv.id, session?.access_token ?? '');", "await termineMonRituel(rdv.id, '');"],
  ['la carte mene au reglement porte fermee', CARTE, "    if (r.ok && r.etat === 'a-regler' && r.jeton) {", '    if (r.jeton) {'],
  ['Ma Couronne dit « vous pouvez partir » avant le reglement (la carte)', CARTE, "  if (carte.etat === 'regle') {", "  if (carte.etat !== 'en-cours') {"],
  ['le chemin de Ma Couronne sort de l origine', SERVEUR, "  const page = chemin.startsWith('/couronne/') ? '/trone/regler.html' : '/regler.html';", "  const page = 'https://maisonmnd.com/trone/regler.html';"],
  ['le retour a Ma Couronne se perd', SERVEUR, "  return chemin.startsWith('/trone/') ? '/couronne/' : '/couronne.html';", "  return '/';"],
  ['un refus se dit par son code', SERVEUR, "  if (r.ok && r.etat === 'comptoir') return 'Pour votre règlement, l’équipe vous attend au comptoir.';\n", ''],
  ['une phrase de refus sans anglais', ENTABS, "  'Il n’y a rien à régler pour ce rituel.': 'There is nothing to pay for this ritual.',\n", ''],
  ['la page Regler renonce pendant la preparation', REGLER, "    if (p.etat === 'sans-piece' && p.enPreparation) {", '    if (false) {'],
  /* L'attente n'epuise pas le frein de sa fonction (relecture du 6 novembre 2026). */
  ['la page relit toutes les 2,5 s, sans s espacer', SERVEUR, '  return essai < RELECTURES_RAPPROCHEES ? 2500 : 10_000;', '  return 2500;'],
  ['la page relit 72 fois (le frein de la fonction saute a la 61e)', SERVEUR, 'export const RELECTURES_DE_LA_PREPARATION = 27;', 'export const RELECTURES_DE_LA_PREPARATION = 72;'],
  ['le frein de la fonction passe pour une panne de la page', REGLER, "    if (r.error === 'trop') {", '    if (false) {'],
  ['pendant le frein, la page relit sans attendre', REGLER, 'Math.max(delai, 10_000)', 'delai'],
  ['le frein de la lecture desserre au serveur', REG, "permis(ipOf(req), 'regler-lire', 60)", "permis(ipOf(req), 'regler-lire', 6000)"],
  ['la page Regler dit « vous pouvez partir » a toutes', REGLER, 'honore: r.honore === true }); return; }', 'honore: true }); return; }'],
  ['la page Regler ne ramene pas a Ma Couronne', REGLER, '          {retourDemande() && <a className="rg-autre" href={retourAMaCouronne()}>Revenir à Ma Couronne</a>}\n', ''],
  /* ── La porte du site ── */
  ['le site distingue un code inconnu de chiffres faux', SITE, "  if (x.ok !== true) return x.error === 'introuvable' ? { etat: 'introuvable' } : { etat: 'panne' };", "  if (x.ok !== true) return x.error === 'introuvable' ? { etat: 'panne' } : { etat: 'introuvable' };"],
  ['le site croit un jeton qui n en est pas un', SITE, " || typeof x.v !== 'string' || !/^[A-Za-z0-9_-]{1,120}\\.[A-Za-z0-9_-]{22}$/.test(x.v)) return { etat: 'panne' };", ") return { etat: 'panne' };"],
  ['le site suit n importe quelle adresse de reglement', SITE, "  return typeof x.adresse === 'string' && /^https:\\/\\/maisonmnd\\.com\\/trone\\/payer\\.html\\?tg=r-[23456789a-z]{14}$/.test(x.adresse)\n", "  return typeof x.adresse === 'string'\n"],
  ['le bouton parait porte fermee', SITE, '  if (b.porte.ouverte) {\n    return b.aTermine', '  if (true) {\n    return b.aTermine'],
  ['le site affiche un montant qu il ne connait pas', SITE, "  const montant = b.resteXof !== null && b.resteXof > 0 ? francsDits(b.resteXof) : undefined;", '  const montant = francsDits(b.resteXof ?? 0);'],
  ['un billet au montant negatif se lit', SITE, '  if (reste !== null && (!Number.isFinite(reste) || reste < 0)) return null;\n', ''],
  ['un billet sans porte se lit', SITE, " || !porte || typeof porte.ouverte !== 'boolean' || typeof porte.raison !== 'string') return null;", ') return null;'],
  ['le code seul part au serveur', SITE, "  if (!quatreChiffresLus(chiffres)) return { champ: 'chiffres', dit: 'Quatre chiffres : les derniers de votre numéro.' };\n", ''],
  ['« regle » garde un bouton', SITE, "note: 'Votre reçu arrive sur WhatsApp, la facture jointe.', leJourMeme: true };", "note: 'Votre reçu arrive sur WhatsApp, la facture jointe.', bouton: 'Régler mon rituel', leJourMeme: true };"],
  ['la veille, Deplacer et Annuler disparaissent', SITE, "paraît ici : vous réglez depuis votre téléphone.', leJourMeme: false,", "paraît ici : vous réglez depuis votre téléphone.', leJourMeme: true,"],
  ['le lien du WhatsApp mene a une page qui n existe pas', SITE, "export const CHEMIN_POUR_RETROUVER = 'mon-rendez-vous/';", "export const CHEMIN_POUR_RETROUVER = 'retrouver/';"],
  ['la page termine par une autre porte', ILOT, "demandeALaFin({ action: 'terminer', porte: 'site', v: jeton })", "demandeALaFin({ action: 'terminer', porte: 'couronne', v: jeton })"],
  ['la page suit une adresse non relue', ILOT, "      if (r.etat === 'a-regler') { location.assign(r.adresse); return; }", "      if ((data as { adresse?: string })?.adresse) { location.assign((data as { adresse: string }).adresse); return; }"],
  ['le jour meme, Deplacer et Annuler restent', ILOT, '  const changer = aVenir && !reglement?.leJourMeme;', '  const changer = aVenir;'],
  ['la page de l agenda porte le reglement', ILOT, '  const reglement = !agendaSeul && billet ? reglementDuBillet(billet) : null;', '  const reglement = billet ? reglementDuBillet(billet) : null;'],
  ['la page /mon-rendez-vous/ s offre aux moteurs', CONTENU, "    horsDesMoteurs: 'La page où une cliente retrouve son rendez-vous avec son code de confirmation : elle ne sert qu’à celle qui a déjà un rendez-vous, jamais aux moteurs ni au plan du site.',\n", ''],
  ['le pied de page n y mene plus', CONTENU, "          { texte: 'Retrouver mon rendez-vous', vers: '/mon-rendez-vous/' },\n", ''],
  ['la page de la recherche monte le billet vide', GENERE, '<div data-ilot="rdv" data-genre="retrouver">', '<div data-ilot="rdv" data-genre="page">'],
  /* ── La porte du WhatsApp : la copie de la phrase (ses scenarios vivent dans verifie-opale) ── */
  ['la copie de la phrase derive dans whatsapp-automate', AU, '  if (/[?？]/.test(brut)) return false;\n', ''],
  /* ── La regle pure ── */
  ['la porte s ouvre avant l heure du rituel', PUR, "  if (!Number.isFinite(debut) || o.maintenantMs < debut) return ferme('avant-l-heure');", "  if (!Number.isFinite(debut)) return ferme('avant-l-heure');"],
  ['la porte reste ouverte apres minuit', PUR, "  if (jour < aujourdhui) return ferme('jour-passe');\n", ''],
  ['la porte s ouvre la veille', PUR, "  if (jour > aujourdhui) return ferme('pas-encore-le-jour');\n", ''],
  ['un rendez-vous annule ouvre la porte', PUR, "  if (r.status === 'annulé') return ferme('annule');\n  if (o.piece) {", '  if (o.piece) {'],
  ['un rendez-vous deja regle ouvre la porte', PUR, "    if (connu !== null && connu <= 0) return ferme(argentRecuDeLaFin(r) > 0 ? 'deja-regle' : 'rien-a-regler');", ''],
  ['une piece soldee ouvre encore la porte', PUR, "    if (Math.round(reste) <= 0) return ferme('deja-regle');\n", ''],
  ['une seance couverte par une formule ouvre la porte', PUR, "  } else if (r.coveredBySub) {\n    return ferme('rien-a-regler');\n", "  } else if (false) {\n    return ferme('rien-a-regler');\n"],
  ['« Passe au comptoir » n eteint plus rien', PUR, "  if (o.passeAuComptoir === true) return ferme('comptoir');\n", ''],
  ['un rendez-vous en attente ouvre la porte', PUR, "  if (r.status !== 'confirmé' && r.status !== 'honoré') return ferme('pas-confirme');\n", ''],
  ['un honore sans piece rouvre la porte', PUR, "  } else if (r.status === 'honoré') {\n    return ferme('clos');\n", "  } else if (false) {\n    return ferme('clos');\n"],
  ['Cotonou a l heure de Londres', PUR, 'export const DECALAGE_DE_LA_FIN_MS = 3_600_000;', 'export const DECALAGE_DE_LA_FIN_MS = 0;'],
  ['un acompte seulement demande se deduit', PUR, '  + (a.depositConfirmed ? Math.max(0, Number(a.depositXof) || 0) : 0);', '  + Math.max(0, Number(a.depositXof) || 0);'],
  ['la remise du rendez-vous oubliee', PUR, "  return Math.max(0, Math.round(a.priceXof * (1 - (Number(a.discountPct) || 0) / 100)) - (Number(a.discountXof) || 0));\n}\n\n/** L'argent", "  return Math.max(0, Math.round(a.priceXof));\n}\n\n/** L'argent"],
  ['la piece lue autrement que la page Regler', PUR, "p.payments.reduce((s, v) => s + nombreDeLaFin(v.amountXof), 0) : p.status === 'payée' ? total : 0;", 'p.payments.reduce((s, v) => s + nombreDeLaFin(v.amountXof), 0) : 0;'],
  ['une piece annulee passe pour la sienne', PUR, " && p.status !== 'annulée');\n  if (!siennes.length) return null;\n  return [...siennes].sort((a, b) => (resteDeLaPieceDeLaFin(b)", ");\n  if (!siennes.length) return null;\n  return [...siennes].sort((a, b) => (resteDeLaPieceDeLaFin(b)"],
  ['le code seul ouvre', PUR, '    if (proche && memeCode && memesChiffres) trouves.push(r);', '    if (proche && memeCode) trouves.push(r);'],
  ['les chiffres seuls ouvrent', PUR, '    if (proche && memeCode && memesChiffres) trouves.push(r);', '    if (proche && memesChiffres) trouves.push(r);'],
  ['la recherche sans borne', PUR, '    const proche = jour >= f.du && jour <= f.au;', '    const proche = true;'],
  ['la recherche remonte au-dela d hier', PUR, 'export const JOURS_AVANT_DE_LA_RECHERCHE = 1;', 'export const JOURS_AVANT_DE_LA_RECHERCHE = 30;'],
  ['un annule passe devant un vivant', PUR, "(a.status === 'annulé' ? 1 : 0) - (b.status === 'annulé' ? 1 : 0) || ecart(a) - ecart(b)", 'ecart(a) - ecart(b)'],
  ['trois chiffres suffisent', PUR, '  return c.length === 4 ? c : null;', '  return c.length >= 3 ? c : null;'],
  ['un signe hors de l alphabet passe pour un code', PUR, "  if (corps.length !== 4 || [...corps].some((c) => !SIGNES_DU_CODE_DE_LA_FIN.includes(c))) return null;", '  if (corps.length !== 4) return null;'],
  ['le frein par code leve', PUR, "  if (o.echecsDuCodeDansLHeure >= FREIN_DE_LA_RECHERCHE.echecsParHeure || o.echecsDuCodeDuJour >= FREIN_DE_LA_RECHERCHE.echecsParJour) return 'code';\n", ''],
  ['le frein par adresse leve', PUR, "  if (o.essaisDeLAdresse >= FREIN_DE_LA_RECHERCHE.parAdresse) return 'adresse';\n", ''],
  ['le frein desserre', PUR, 'echecsParHeure: 5, echecsParJour: 12', 'echecsParHeure: 500, echecsParJour: 1200'],
  ['le billet dit son nom entier', PUR, "    prenom: String(o.prenom ?? '').trim().split(/\\s+/)[0] ?? '',", "    prenom: String(o.prenom ?? '').trim(),"],
  ['le billet invente un montant sans prix fige', PUR, "  return prix === undefined ? null : Math.max(0, prix - argentRecuDeLaFin(a));", '  return Math.max(0, (prix ?? 0) - argentRecuDeLaFin(a));'],
  ['un jeton que la page Regler ne reconnait pas', PUR, "export const SIGNES_DU_JETON_DE_LA_FIN = '23456789abcdefghjkmnpqrstuvwxyz';", "export const SIGNES_DU_JETON_DE_LA_FIN = '0123456789abcdefghjkmnpqrstuvwxyz';"],
  ['l adresse du reglement mene ailleurs', PUR, "'https://maisonmnd.com/trone/payer.html?tg=r-'", "'https://maisonmnd.com/trone/payer.html?tg='"],
  ['un second toucher tire un autre lien', PUR, "    return estUnJetonDeLaFin(deja) ? { genre: 'seul', jeton: deja, neuf: false, apptIds: ids } : ", '    return '],
  ['le foyer garde un lien fait pour une autre liste', PUR, " && [...(l.apptIds ?? [])].sort().join('|') === ids.join('|'));", ');'],
  ['honore a la declaration, sans reglement', PUR, '  if (!Number.isFinite(reste) || Math.round(reste) > 0) return null;', '  if (!Number.isFinite(reste)) return null;'],
  ['honore sans declaration', PUR, '  if (!r || !r.termineParElle || !r.termineParElle.le) return null;', '  if (!r) return null;'],
  ['un rituel a venir honore', PUR, ' || jour > jourDeLaFin(o.maintenantMs)) return null;', ') return null;'],
  ['un reste illisible honore', PUR, '  if (!Number.isFinite(reste) || Math.round(reste) > 0) return null;', '  if (Math.round(reste) > 0) return null;'],
  ['un annule honore', PUR, "  if (r.status !== 'confirmé') return null;\n  const reste", '  const reste'],
  ['une declaration d avant l heure tient', PUR, '  return Number.isFinite(debut) && le >= debut && jourDeLaFin(le)', '  return Number.isFinite(debut) && jourDeLaFin(le)'],
  ['une declaration du lendemain tient', PUR, " && jourDeLaFin(le) === String(r.date ?? '').slice(0, 10);", ';'],
  ['la notification dit « Elle »', PUR, 'Règlement en cours depuis son téléphone, par', 'Elle règle depuis son téléphone, par'],
  /* « J'ai termine » : le message entier, et rien d'autre (relecture du 6 novembre 2026). */
  ['une question passe pour une declaration', PUR, '  if (/[?？]/.test(brut)) return false;\n', ''],
  ['la phrase n a plus a tenir jusqu au dernier mot (« j ai fini mes courses »)', PUR, '){0,2}$`);', '){0,2}`);'],
  ['la phrase peut commencer par autre chose', PUR, 'new RegExp(`^(?:${LIAISON_EN_TETE_DE_LA_FIN}', 'new RegExp(`(?:${LIAISON_EN_TETE_DE_LA_FIN}'],
  ['un determinant hors de la liste passe (ce soin)', PUR, "'(?:mon|ma|mes|le|la|notre|nos) (?:rdv|rendez vous|seance|", "'(?:mon|ma|mes|le|la|notre|nos|ce) (?:rdv|rendez vous|seance|"],
  ['un nom hors de la liste passe (mon travail)', PUR, "|reprise|resserrage)';", "|reprise|resserrage|travail|courses)';"],
  /* Seconde relecture du 6 novembre 2026 : ce qui s'elargit, ce qui se retire, les vingt minutes, celle qui nomme son rendez-vous. */
  ['phrase : le shampoing revient dans la liste (un flacon vide passe pour une fin)', PUR, "|reprise|resserrage)';", "|reprise|shampoing|resserrage)';"],
  ['phrase : « mes » n est plus un determinant', PUR, "'(?:mon|ma|mes|le|la|notre|nos) (?:rdv|rendez vous|seance|", "'(?:mon|ma|le|la|notre|nos) (?:rdv|rendez vous|seance|"],
  ['phrase : « d aujourd hui » apres ce qu elle a fini n est plus reconnu', PUR, '|fini|finie|finis|finies)(?: ${COMPLEMENT_DE_LA_FIN}(?: d aujourd hui)?)?`;', '|fini|finie|finis|finies)(?: ${COMPLEMENT_DE_LA_FIN})?`;'],
  ['phrase : « je paie » tout nu redevient une declaration', PUR, '|je regle|je paie|je paye) ${COMPLEMENT_DE_LA_FIN}(?: d aujourd hui)?)`;', '|je regle|je paie|je paye)(?: ${COMPLEMENT_DE_LA_FIN}(?: d aujourd hui)?)?)`;'],
  ['phrase : « je paie ma seance » n est plus reconnu', PUR, '|(?:je (?:peux|vais) (?:regler|payer)|je regle|je paie|je paye) ${COMPLEMENT_DE_LA_FIN}(?: d aujourd hui)?)`;', ')`;'],
  ['phrase : un mot de liaison en tete n est plus reconnu', PUR, 'new RegExp(`^(?:${LIAISON_EN_TETE_DE_LA_FIN} ){0,2}(?:', 'new RegExp(`^(?:'],
  ['phrase : un mot de tete hors de la liste passe (« pas fini »)', PUR, "'(?:oui|voila|ok|c est bon|cest bon|bien)';", "'(?:oui|voila|ok|c est bon|cest bon|bien|pas)';"],
  ['phrase : « Maison MND » en adresse n est plus retiree', PUR, "  return UNE_DECLARATION_DE_FIN.test(t.replace(ADRESSE_A_LA_MAISON_DE_LA_FIN, ' ').replace(/ +/g, ' ').trim());", '  return UNE_DECLARATION_DE_FIN.test(t);'],
  ['phrase : « je suis a la Maison MND » n est plus un trajet (l adresse retiree avant le garde)', PUR, '|svp|stp|madame|mme)\\b/g;', '|svp|stp|madame|mme|(?:la )?maison mnd)\\b/g;'],
  ['phrase : « je viens de terminer » n est plus reconnu', PUR, "  return vientDeFinirDeLaFin(t.replace(POLITESSE_DU_MESSAGE_DE_FIN, ' ').replace(/ +/g, ' ').trim());", "  return t.replace(POLITESSE_DU_MESSAGE_DE_FIN, ' ').replace(/ +/g, ' ').trim();"],
  ['phrase : « c est fini » nomme un rendez-vous', PUR, "  NOM_DU_RENDEZ_VOUS_DE_LA_FIN.test(motsDuMessageDeFin(texte)) || codeDansLeMessage(texte) !== null;", '  true;'],
  ['phrase : son code ne nomme plus son rendez-vous', PUR, "  NOM_DU_RENDEZ_VOUS_DE_LA_FIN.test(motsDuMessageDeFin(texte)) || codeDansLeMessage(texte) !== null;", '  NOM_DU_RENDEZ_VOUS_DE_LA_FIN.test(motsDuMessageDeFin(texte));'],
  ['phrase : « le lien de paiement » ne nomme plus rien', PUR, '/\\b(?:rdv|rendez vous|seance|rituel|lien de paiement)\\b/;', '/\\b(?:rdv|rendez vous|seance|rituel)\\b/;'],
  ['billet : un rendez-vous a venir paye d avance se dit « regle, vous pouvez partir »', PUR, '  const regle = dejaRegle && commence;', '  const regle = dejaRegle;'],
  ['billet : le matin avant l heure, paye d avance, « vous pouvez partir »', PUR, '  const commence = jour < aujourdhui || (jour === aujourdhui && Number.isFinite(debut) && o.maintenantMs >= debut);', '  const commence = jour <= aujourdhui;'],
  ['billet : la copie du serveur dit « regle » a un rendez-vous a venir', TER, '  const regle = dejaRegle && commence;', '  const regle = dejaRegle;'],
  ['billet : paye d avance, le site ne dit plus « deja regle »', SITE, "  if (b.porte.raison === 'deja-regle') return { sur: 'Déjà réglé', phrase: 'Ce rendez-vous est déjà réglé. Merci.', leJourMeme: false };\n", ''],
  ['billet : paye d avance, le site retire Deplacer et Annuler', SITE, "phrase: 'Ce rendez-vous est déjà réglé. Merci.', leJourMeme: false };", "phrase: 'Ce rendez-vous est déjà réglé. Merci.', leJourMeme: true };"],
  ['acompte : un acompte demande, pas verifie, laisse la porte ouverte', PUR, "  if (acompteAVerifier(r) > 0) return ferme('comptoir');\n", ''],
  ['acompte : un acompte verifie ferme la porte', PUR, '  (r && !r.depositConfirmed ? Math.max(0, Math.round(Number(r.depositXof) || 0)) : 0);', '  (r ? Math.max(0, Math.round(Number(r.depositXof) || 0)) : 0);'],
  ['acompte : la notification dit « Elle »', PUR, 'pas encore vérifié : le règlement se fait au comptoir.`,', 'pas encore vérifié : elle règle au comptoir.`,'],
  ['acompte : la copie du serveur laisse la porte ouverte', TER, "  if (acompteAVerifier(r) > 0) return ferme('comptoir');\n", ''],
  ['acompte : le personnel n apprend pas l acompte a verifier', TER, '    if (deja !== null && deja > 0) continue;\n', '    continue;\n'],
  ['acompte : le personnel prevenu a chaque message', TER, '    if (deja !== null && deja > 0) continue;\n', ''],
  ['acompte : « Passe au comptoir » passe pour un acompte a verifier', TER, " || t.fiche?.passeAuComptoir === true || acompteAVerifier(t.rdv) <= 0) continue;", ' || acompteAVerifier(t.rdv) <= 0) continue;'],
  ['vingt minutes : le delai de la porte WhatsApp saute', PUR, 'export const ATTENTE_DE_LA_PORTE_WHATSAPP_MS = 20 * 60_000;', 'export const ATTENTE_DE_LA_PORTE_WHATSAPP_MS = 0;'],
  ['vingt minutes : avant l heure passe pour « a peine commence »', PUR, '  return Number.isFinite(debut) && maintenantMs >= debut && maintenantMs < debut + ATTENTE_DE_LA_PORTE_WHATSAPP_MS;', '  return Number.isFinite(debut) && maintenantMs < debut + ATTENTE_DE_LA_PORTE_WHATSAPP_MS;'],
  ['vingt minutes : WhatsApp declare un rituel qui commence a peine', TER, "      porte: porte === 'whatsapp' && laPorte.ouverte && aPeineCommence(rdv, maintenant) ? { ouverte: false, raison: 'a-peine-commence' } : laPorte,", '      porte: laPorte,'],
  ['vingt minutes : le bouton de Ma Couronne attend lui aussi', TER, "      porte: porte === 'whatsapp' && laPorte.ouverte && aPeineCommence(rdv, maintenant) ?", '      porte: laPorte.ouverte && aPeineCommence(rdv, maintenant) ?'],
  ['vingt minutes : le rituel a peine commence se dit « deja regle » ou « comptoir » avant', TER, "const ORDRE_DES_REFUS: RaisonDuRefus[] = ['a-peine-commence', 'deja-regle',", "const ORDRE_DES_REFUS: RaisonDuRefus[] = ['deja-regle',"],
  ['un mot de mouvement ne retient plus (en route)', PUR, '|arrivons|route|chemin|', '|arrivons|chemin|'],
  ['« a la maison » ne retient plus', PUR, '|attendez|a la maison|chez moi)', '|attendez|chez moi)'],
  ['le garde du mouvement n est plus interroge', PUR, '  if (MOUVEMENT_OU_ATTENTE_DE_LA_FIN.test(t)) return false;\n', ''],
  ['la politesse n est plus retiree (merci)', PUR, '|cc|merci|svp|', '|cc|svp|'],
  ['le salut n est plus retire (bonjour)', PUR, '|a bientot|bonjour|bonsoir|', '|a bientot|bonsoir|'],
  ['« a bientot » passe pour une attente', PUR, '|bonne soiree|a bientot|bonjour|', '|bonne soiree|bonjour|'],
  ['« je veux regler » n est plus reconnu', PUR, '(?:(?:je (?:veux|voudrais|souhaite) (?:regler|payer)|(?:le )?lien de paiement)', '(?:(?:je (?:veux|voudrais|souhaite) (?:reserver)|(?:le )?lien de paiement)'],
  ['« termine » seul n est plus reconnu', PUR, "(?:est )?(?:termine|terminee|fini|finie)';", "(?:est )(?:termine|terminee|fini|finie)';"],
  ['un adverbe se glisse entre « j ai » et « fini »', PUR, 'ca y est(?: j ai| jai)?) (?:termine|terminee|termines', 'ca y est(?: j ai| jai)?) (?:bien )?(?:termine|terminee|termines'],
  ['son code ecrit avec sa declaration la casse', PUR, "  if (code) t = ` ${t} `.replace(` mnd ${code.slice(4).toLowerCase()} `, ' ').replace(` mnd${code.slice(4).toLowerCase()} `, ' ');\n", ''],
  ['un mot apres MND passe pour un code', PUR, "  if (m[1] !== '-' && !/\\d/.test(signes) && signes !== signes.toUpperCase()) return null;\n", ''],
  ['un lien de reglement part sans rendez-vous', PUR, '  const lien = o.code ? `${PAGE_POUR_RETROUVER_SON_RDV}?code=${o.code}` : PAGE_POUR_RETROUVER_SON_RDV;', "  const lien = 'https://maisonmnd.com/trone/payer.html?tg=r-22222222222222';"],
  ['un montant invente sur WhatsApp', PUR, '    const montant = o.resteXof !== null && o.resteXof > 0\n', '    const montant = true\n'],
  ['« deja regle » ne se dit plus', PUR, "votre rituel d'aujourd'hui est déjà réglé. Merci", "votre rituel d'aujourd'hui vous attend. Merci"],
  ['le Carnet dit « reglee » avant le reglement', PUR, "  if (r.honoreAuReglement?.le || (resteXof !== null && resteXof <= 0)) {", '  if (r.termineParElle?.le) {'],
  ['le Trone prepare une piece sans declaration valable', PUR, "  return !aDejaSaPiece && r.status === 'confirmé' && finValable(r);", "  return !aDejaSaPiece && r.status === 'confirmé';"],
  ['le Trone prepare deux pieces', PUR, "  return !aDejaSaPiece && r.status === 'confirmé' && finValable(r);", "  return r.status === 'confirmé' && finValable(r);"],
  ['les suites se font deux fois', PUR, ' && !r.honoreAuReglement.suitesLe;', ';'],
  ['Ma Couronne montre le bouton porte fermee', PUR, "    if (porte.ouverte) return { rdv, etat: 'en-cours', porte };", "    return { rdv, etat: 'en-cours', porte };"],
  ['Ma Couronne dit « vous pouvez partir » avant le reglement', PUR, "    if (rdv.termineParElle?.le && (rdv.honoreAuReglement?.le || porte.raison === 'deja-regle')) return { rdv, etat: 'regle', porte };", "    if (rdv.termineParElle?.le) return { rdv, etat: 'regle', porte };"],
  ['Ma Couronne garde « termine » sur un rendez-vous d hier', PUR, "    .filter((r) => String(r.date ?? '').slice(0, 10) === aujourdhui)\n", ''],
];

/** Les fautes de cette passe : toutes, ou une sur N (`--tranche=k/N`). */
const aProuver = (tranche ? PANNES.filter((_, i) => i % Number(tranche[2]) === Number(tranche[1]) - 1) : PANNES)
  .filter((x) => seulement.length === 0 || seulement.some((mot) => x[0].includes(mot)));

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-terminer-et-regler');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    /* Les VRAIES fonctions, transpilees ici sans leur import d'esm.sh : le
       harnais les rejoue contre une base, un KkiaPay et une horloge simules. */
    const env = { ...process.env };
    for (const [nom, cle] of [['terminer-et-regler', 'TER_FONCTION'], ['regler-la-seance', 'REG_FONCTION']]) {
      const source = readFileSync(path.join(racine, `supabase/functions/${nom}/index.ts`), 'utf8')
        .replace(/^import \{ createClient \} from 'https:\/\/esm\.sh\/@supabase\/supabase-js@2';\r?$/m, '');
      const { code } = await transform(source, { loader: 'ts', format: 'cjs', target: 'es2022' });
      const fichier = path.join(dossier, `${nom}.cjs`);
      writeFileSync(fichier, code);
      env[cle] = fichier;
    }
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-terminer-et-regler.harnais.ts')],
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
  const fichiers = [...new Set(PANNES.map((x) => x[1]))];
  const gardes = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const avant = new Map(fichiers.map((f) => [f, md5(f)]));
  let muettes = 0;
  try {
    for (const [nom, f, a, b] of aProuver) {
      const garde = gardes.get(f);
      const brut = garde.toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, () => b);
      writeFileSync(path.join(racine, f), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
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
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${aProuver.length} fautes${tranche ? ` (tranche ${tranche[1]} sur ${tranche[2]}, ${PANNES.length} en tout)` : ''}${seulement.length ? ` (les seules « ${seulement.join(', ')} », ${PANNES.length} en tout)` : ''}, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exit(muettes === 0 && intacts ? 0 : 1);
}

const r = await lanceLeBanc();
process.stdout.write(r.stdout ?? '');
if (r.stderr) process.stdout.write(r.stderr);
process.exit(r.status ?? 1);
