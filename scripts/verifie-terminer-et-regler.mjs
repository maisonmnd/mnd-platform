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
   seulement dans une copie propre detachee. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PUR = 'src/shared/terminer-et-regler-pur.ts';
const TER = 'supabase/functions/terminer-et-regler/index.ts';
const REG = 'supabase/functions/regler-la-seance/index.ts';
const AU = 'supabase/functions/whatsapp-automate/index.ts';
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
  ['un echec ne compte plus : le frein par code est mort', TER, "    if (code) await note('fin-echec', code);\n", ''],
  ['le frein n arrete plus rien', TER, "  if (frein !== 'libre') return json({ ok: false, error: 'trop' }, 429);\n", ''],
  ['la reponse trahit un code qui existe', TER, "    return json({ ok: false, error: 'introuvable' });", "    return json({ ok: false, error: candidats.length ? 'chiffres' : 'introuvable' });"],
  ['le personnel prevenu a chaque toucher', TER, '  if (neuve) {', '  if (true) {'],
  ['le personnel n est plus prevenu', TER, '  if (neuve) {', '  if (false) {'],
  ['une seconde porte reecrit la premiere marque', TER, '      const marque = d.termineParElle?.le ? d.termineParElle : { le, par: porte };', '      const marque = { le, par: porte };'],
  ['un jeton forge termine', TER, "      if (!apptId) return json({ ok: false, error: 'lien' });\n      ids = [apptId];", '      ids = [String(apptId)];'],
  ['la marque se pose porte fermee', TER, '  const ouvertes = tetes.filter((t) => t.porte.ouverte);', '  const ouvertes = tetes;'],
  ['le serveur ecrit sur une ligne qui a bouge', TER, "    if (frais.updated_at) q = q.eq('updated_at', frais.updated_at);\n", ''],
  ['« Passe au comptoir » ignore par le serveur', TER, "      porte: porteDeLaFin({ rdv, maintenantMs: maintenant, passeAuComptoir: fiche?.passeAuComptoir === true,", '      porte: porteDeLaFin({ rdv, maintenantMs: maintenant, passeAuComptoir: false,'],
  ['le serveur honore a la declaration', TER, '      return { ...d, termineParElle: marque, ...avecLien };', "      return { ...d, termineParElle: marque, ...avecLien, status: 'honoré' };"],
  ['le billet dit son nom de famille', TER, "    rdv, reference: referenceDuRendezVous(l.id), prenom: String(fiche?.name ?? l.data?.clientName ?? ''),", "    rdv, reference: String(fiche?.name ?? ''), prenom: String(fiche?.name ?? l.data?.clientName ?? ''),"],
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
  ['la copie de la phrase derive dans whatsapp-automate', AU, "  if (!t || t.split(' ').length > 14) return false;", "  if (!t || t.split(' ').length > 15) return false;"],
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
  ['une negation passe pour une declaration', PUR, '/\\b(pas|jamais|quand|', '/\\b(jamais|quand|'],
  ['un autre achat passe pour une declaration', PUR, '|abonnement|formule|commande|', '|formule|'],
  ['une longue phrase passe pour une declaration', PUR, "  if (!t || t.split(' ').length > 14) return false;", '  if (!t) return false;'],
  ['« je veux regler » n est plus reconnu', PUR, '  return ELLE_A_FINI.test(t) || FIN_EN_PEU_DE_MOTS.test(t) || ELLE_VEUT_REGLER.test(t);', '  return ELLE_A_FINI.test(t) || FIN_EN_PEU_DE_MOTS.test(t);'],
  ['« termine » seul n est plus reconnu', PUR, '  return ELLE_A_FINI.test(t) || FIN_EN_PEU_DE_MOTS.test(t) || ELLE_VEUT_REGLER.test(t);', '  return ELLE_A_FINI.test(t) || ELLE_VEUT_REGLER.test(t);'],
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
    for (const [nom, f, a, b] of PANNES) {
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
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exit(muettes === 0 && intacts ? 0 : 1);
}

const r = await lanceLeBanc();
process.stdout.write(r.stdout ?? '');
if (r.stderr) process.stdout.write(r.stderr);
process.exit(r.status ?? 1);
