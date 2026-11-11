import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE RENDEZ-VOUS DU SITE, REGLER ET DEPLACER, EPROUVE : `node scripts/verifie-le-rdv-du-site.mjs`
   (et `--prouve` pour planter les pannes une a une).

   7 novembre 2026. « Permettre a la cliente de REGLER son RDV directement
   sur le site » et « DEPLACER son RDV depuis le site, ouvrir le calendrier et
   changer de date » (Yeman), sur la page maisonmnd.com/rdv/?v=. Le harnais
   (verifie-le-rdv-du-site.harnais.ts) importe les VRAIES fonctions
   demande-submit et terminer-et-regler : esbuild remplace leurs imports par
   une base, un Meta et un Deno simules, et une horloge qui ne bouge pas. Tout
   est invente ; RIEN ne touche la vraie base, et aucun paiement ne part.
   Chaque panne se plante EN MEMOIRE, au chargement du fichier ou a sa
   lecture : l'arbre n'est jamais touche. Une faute dans un bloc recopie se
   pose dans l'original ET dans la copie (une cible a deux fichiers) : c'est
   la regle qui doit crier, pas la comparaison des copies. */

const racine = path.resolve(import.meta.dirname, '..');
const HARNAIS = path.join(racine, 'scripts/verifie-le-rdv-du-site.harnais.ts');
const EXPORTS_DE_LA_DEMANDE = '\nexport { rdvPourLaPage, confirmeLeDeplacement };\n';

const DS = 'supabase/functions/demande-submit/index.ts';
const TER = 'supabase/functions/terminer-et-regler/index.ts';
const REGLE = 'src/shared/deplacer-du-site-pur.ts';
const SITE = 'src/apps/revelateur/billet-du-rdv-pur.ts';
const DEPL = 'src/apps/revelateur/deplacer-du-site-pur.ts';
const ILOT = 'src/apps/revelateur/ilots/MonRendezVous.tsx';
const CAL = 'src/apps/revelateur/ilots/DeplacerLeRendezVous.tsx';
const CSS = 'src/apps/revelateur/revelateur.css';
const DEUX = [REGLE, DS];

/** [ce qui casse, le ou les fichiers, le texte juste, le texte faux] */
export const PANNES = [
  /* ── La regle des 24 heures (l'original et sa copie, ensemble) ── */
  ['les 24 heures deviennent 12', DEUX, 'export const DELAI_POUR_DEPLACER_MS = 24 * 3_600_000;', 'export const DELAI_POUR_DEPLACER_MS = 12 * 3_600_000;'],
  ['pile 24 heures se deplace encore', DEUX, 'return debut - maintenantMs > DELAI_POUR_DEPLACER_MS ? \'permis\' : \'trop-tard\';', 'return debut - maintenantMs >= DELAI_POUR_DEPLACER_MS ? \'permis\' : \'trop-tard\';'],
  ['un rendez-vous annule se deplace', DEUX, "  if (r.status === 'annulé') return 'annule';\n  if (r.status !== 'confirmé' && r.status !== 'en attente') return 'passe';", "  if (r.status !== 'confirmé' && r.status !== 'en attente') return 'passe';"],
  ['un rendez-vous honore se deplace', DEUX, "if (r.status !== 'confirmé' && r.status !== 'en attente') return 'passe';", "if (r.status !== 'confirmé' && r.status !== 'en attente' && r.status !== 'honoré') return 'passe';"],
  ['une heure deja venue se deplace', DEUX, "  if (debut <= maintenantMs) return 'passe';\n", ''],
  ['la place d arrivee n est pas jugee a 24 heures', DEUX, "  return debut - maintenantMs > DELAI_POUR_DEPLACER_MS ? null : 'creneau_trop_proche';", '  return null;'],
  ['l heure se compte a l heure UTC', DEUX, 'return Date.parse(`${d}T${h}:00+01:00`);', 'return Date.parse(`${d}T${h}:00Z`);'],
  /* ── La fonction demande-submit : les places et le deplacement ── */
  ['les places oublient la place d arrivee a 24 heures', DS, "      .filter((h) => arriveeRecevable({ date: iso, time: h }, ms) === null && !(iso === sauf.date && h === sauf.time));", '      .filter((h) => !(iso === sauf.date && h === sauf.time));'],
  ['les places proposent la place d origine', DS, "      .filter((h) => arriveeRecevable({ date: iso, time: h }, ms) === null && !(iso === sauf.date && h === sauf.time));", '      .filter((h) => arriveeRecevable({ date: iso, time: h }, ms) === null);'],
  ['les places ne rendent pas sa propre place libre', DS, '  const sans = agendaSansLeRdvDuSite(agenda, maitre, sauf);\n  const aujourdhui = jourDeCotonou(ms);', '  const sans = agenda;\n  const aujourdhui = jourDeCotonou(ms);'],
  ['les places passent la borne de la reservation', DS, 'for (let i = 1; i <= joursDeLaFenetre(ms); i += 1) {\n    const iso = isoApresJours(aujourdhui, i);\n    const opening = ouvertureDuJour(iso, sans.semaine, sans.exceptions);\n    if (opening.closed) { fermes.push(iso); continue; }', 'for (let i = 1; i <= joursDeLaFenetre(ms) + 30; i += 1) {\n    const iso = isoApresJours(aujourdhui, i);\n    const opening = ouvertureDuJour(iso, sans.semaine, sans.exceptions);\n    if (opening.closed) { fermes.push(iso); continue; }'],
  ['les places proposent un jour ferme', DS, '    if (opening.closed) { fermes.push(iso); continue; }\n    const libres = creneauxLibres({', '    const libres = creneauxLibres({'],
  ['les places lisent les murs d un autre maitre', DS, 'bloques: plagesBloquees(sans.murs, sans.branchId, iso, maitre), master: maitre,', 'bloques: [], master: maitre,'],
  ['les places ne regardent plus les fauteuils', DS, 'capMaison: sans.capMaison, capMaitre: sans.capMaitre, capSimultane: sans.sieges, maintenantMin: null,\n    });\n    const heures', 'capMaison: sans.capMaison, capMaitre: sans.capMaitre, capSimultane: 0, maintenantMin: null,\n    });\n    const heures'],
  ['la place prise ne se juge plus', DS, '  if (sans.sieges > 0 && duJour.filter((a) => chevauche(a.debutMin, a.debutMin + a.dureeMin)).length >= sans.sieges) return { ok: false, erreur: \'creneau_pris\' };\n  const siens', '  const siens'],
  ['le maitre occupe ne se juge plus', DS, "  return occupe ? { ok: false, erreur: 'creneau_pris' } : { ok: true };\n}\n\n/** Son maître", '  return { ok: true };\n}\n\n/** Son maître'],
  ['sa propre place n est pas rendue libre au deplacement', DS, '  const sans = agendaSansLeRdvDuSite(agenda, maitre, sauf);\n  const duJour = occupesDuJour(sans.occupes, p.date);', '  const sans = agenda;\n  const duJour = occupesDuJour(sans.occupes, p.date);'],
  ['un jour ferme se reserve au deplacement', DS, "  if (fenetre.closed) return { ok: false, erreur: 'creneau_ferme' };\n  const debut = minutesDeHhmm(p.time);\n  const fin = debut + Math.max(1, Math.round(Number(p.dureeMin) || 60));\n  if (debut < fenetre.openMin", "  const debut = minutesDeHhmm(p.time);\n  const fin = debut + Math.max(1, Math.round(Number(p.dureeMin) || 60));\n  if (debut < fenetre.openMin"],
  ['la place d arrivee n est pas jugee a 24 heures au deplacement', DS, "const recevable = laPlaceEstRecevable({ date, time }, ms) ?? arriveeRecevable({ date, time }, ms);", "const recevable = laPlaceEstRecevable({ date, time }, ms);"],
  ['la meme place se deplace', DS, "    if (date === avant.date && time === avant.time) return json({ ok: false, error: 'meme_place' });\n", ''],
  ['l agenda du deplacement croit une lecture manquee', DS, "if (lectureManquee || pris.length >= PLAFOND_D_UNE_REPONSE) {", "if (false) {"],
  ['l ecriture ne se fait plus sous condition', DS, ".eq('id', apptId).eq('updated_at', ligne.updatedAt).select('id');", ".eq('id', apptId).select('id');"],
  ['une ligne qui a bouge n est pas rejugee', DS, '    if (!Array.isArray(ecrit) || ecrit.length === 0) continue;', '    if (!Array.isArray(ecrit) || ecrit.length === 0) return json({ ok: true, verdict: \'deplace\', rdv: await rdvPourLaPage(apptId), confirmation: \'sans\' });'],
  ['le deplacement change le maitre', DS, "const apres = { ...reste, date, time, deplaceLe: le, deplacePar: 'site', deplaceDe: { date: avant.date, time: avant.time } };", "const apres = { ...reste, date, time, master: 'Team', deplaceLe: le, deplacePar: 'site', deplaceDe: { date: avant.date, time: avant.time } };"],
  ['le deplacement change le statut', DS, "const apres = { ...reste, date, time, deplaceLe: le, deplacePar: 'site', deplaceDe: { date: avant.date, time: avant.time } };", "const apres = { ...reste, date, time, status: 'en attente', deplaceLe: le, deplacePar: 'site', deplaceDe: { date: avant.date, time: avant.time } };"],
  ['le deplacement oublie sa marque pour le facteur', DS, "const apres = { ...reste, date, time, deplaceLe: le, deplacePar: 'site', deplaceDe: { date: avant.date, time: avant.time } };", "const apres = { ...reste, date, time, deplacePar: 'site', deplaceDe: { date: avant.date, time: avant.time } };"],
  ['le deplacement garde la marque « autre moment demande »', DS, "    const { autreMomentDemandeLe: _marque, ...reste } = a;\n", "    const reste = a;\n"],
  ['le deplacement pose une remise', DS, "const apres = { ...reste, date, time, deplaceLe: le,", "const apres = { ...reste, date, time, remisesLignes: [{ pct: 15 }], deplaceLe: le,"],
  ['un rejeu se refait', DS, "    if (a.date === date && a.time === time && a.deplacePar === 'site') {", "    if (false) {"],
  ['la confirmation part sans reserver sa ligne', DS, "}, { onConflict: 'id', ignoreDuplicates: true }).select('id');\n  if (errReserve)", "}, { onConflict: 'id' }).select('id');\n  if (errReserve)"],
  ['la confirmation part meme sans ligne reservee', DS, "  if (!Array.isArray(reservee) || reservee.length === 0) return 'deja';\n", ''],
  ['un rendez-vous en attente se dit confirme', DS, "const envoi = a.status === 'confirmé'\n", "const envoi = true\n"],
  ['la confirmation oublie son numero a prevenir', DS, "const numero = String(a.numeroAPrevenir ?? '').trim() || String(fiche?.data?.phone ?? '').trim()", "const numero = String(fiche?.data?.phone ?? '').trim()"],
  ['l appel prend le premier mot du nom', DS, "    ? appelDe(fiche.data as { name?: unknown; prenomUsage?: unknown; civilite?: unknown; auMasculin?: unknown }, a.clientName)\n    : appelDe(laDemande?.civilite ? { civilite: laDemande.civilite } : null, laDemande?.prenom ?? a.clientName);\n  const numero", "    ? `Mme ${String(fiche.data.name ?? '').split(' ')[0]}`\n    : appelDe(laDemande?.civilite ? { civilite: laDemande.civilite } : null, laDemande?.prenom ?? a.clientName);\n  const numero"],
  ['l equipe n est pas prevenue du deplacement', DS, "    await auPlus(alerteLePersonnel(\n      'Rendez-vous déplacé depuis le site',", "    await auPlus(((..._a: unknown[]) => Promise.resolve(0))(\n      'Rendez-vous déplacé depuis le site',"],
  ['un deplacement n ecrit rien au journal', DS, "    const { error: errJ } = await admin.from('journal_gestes').upsert({", "    const { error: errJ } = await admin.from('journal_gestes_oubli').upsert({"],
  ['le deplacement ne prend aucun frein par jeton', DS, "if (!(await allowRate(apptId, 'rdv_deplacer_jeton', 8)))", "if (false)"],
  ['le deplacement ne prend aucun frein par adresse', DS, "if (!(await allowRate(ip, 'rdv_deplacer', 10)))", "if (false)"],
  ['les places prennent le seau de la lecture', DS, "allowRate(ip, 'rdv_places', 30)", "allowRate(ip, 'rdv_lire', 30)"],
  ['un jeton forge deplace', DS, "  const apptId = await apptIdDuJeton(SECRET_DES_LIENS, body.v);\n  if (!apptId) return json({ ok: false, error: 'lien' });\n  if (!(await allowRate(apptId, 'rdv_deplacer_jeton', 8)))", "  const apptId = String(body.v ?? '').split('.')[0];\n  if (!apptId) return json({ ok: false, error: 'lien' });\n  if (!(await allowRate(apptId, 'rdv_deplacer_jeton', 8)))"],
  ['la version de demande-submit ne monte pas', DS, "const VERSION = '2026-11-07-a ·", "const VERSION = '2026-11-06-a ·"],
  ['le cas deja-deplace ne dit plus rien de la confirmation', DS, "return json({ ok: true, verdict: 'deja', rdv: await rdvPourLaPage(apptId), confirmation: 'deja' });", "return json({ ok: true, verdict: 'deja', rdv: await rdvPourLaPage(apptId) });"],
  /* ── La fonction terminer-et-regler : regler ── */
  ['le billet ne dit plus si la porte d avance est ouverte', TER, "const billet = momentDuReglement(rdv, maintenantMs) === 'avance'", "const billet = false"],
  ['regler se contente du jeton sans le verifier', TER, "  const apptId = await apptIdDuJeton(SECRET_DES_LIENS, b.v);\n  if (!apptId) return json({ ok: false, error: 'lien' });\n  if (!(await permis(apptId, 'fin-regler-jeton', 12)))", "  const apptId = String(b.v ?? '').split('.')[0];\n  if (!apptId) return json({ ok: false, error: 'lien' });\n  if (!(await permis(apptId, 'fin-regler-jeton', 12)))"],
  ['regler ne juge pas la porte', TER, "  if (!laPorte.ouverte) return json({ ok: true, etat: laPorte.raison, quand: 'avance' });\n  return await poseLeLienAvantApres({ ligne, rdv, quand: 'avance', laPorte, maintenant, par: 'site' });", "  return await poseLeLienAvantApres({ ligne, rdv, quand: 'avance', laPorte: { ...laPorte, resteXof: laPorte.resteXof ?? 0 }, maintenant, par: 'site' });"],
  ['regler juge le moment du jour meme', TER, "const laPorte = porteAvantApres({ quand: 'avance', rdv, maintenantMs: maintenant, passeAuComptoir: fiche?.passeAuComptoir === true, piece: reste === null ? null : { resteXof: reste } });\n  if (!laPorte.ouverte) return json({ ok: true, etat: laPorte.raison, quand: 'avance' });\n  return await poseLeLienAvantApres({ ligne, rdv, quand: 'avance'", "const laPorte = porteAvantApres({ quand: 'avance', rdv, maintenantMs: 0, passeAuComptoir: fiche?.passeAuComptoir === true, piece: reste === null ? null : { resteXof: reste } });\n  if (!laPorte.ouverte) return json({ ok: true, etat: laPorte.raison, quand: 'avance' });\n  return await poseLeLienAvantApres({ ligne, rdv, quand: 'avance'"],
  ['regler lit un montant envoye par la page', TER, "return await poseLeLienAvantApres({ ligne, rdv, quand: 'avance', laPorte, maintenant, par: 'site' });", "return await poseLeLienAvantApres({ ligne, rdv, quand: 'avance', laPorte: { ...laPorte, resteXof: Number(b.montant) || laPorte.resteXof }, maintenant, par: 'site' });"],
  ['regler ne prend aucun frein par jeton', TER, "if (!(await permis(apptId, 'fin-regler-jeton', 12)))", "if (false)"],
  ['regler ne prend aucun frein par adresse', TER, "if (!(await permis(ipOf(req), 'fin-regler-site', 20)))", "if (false)"],
  ['la version de terminer-et-regler ne monte pas', TER, "const VERSION = '2026-11-11-a ·", "const VERSION = '2026-11-07-c ·"],
  /* ── La page : les mots et la lecture ── */
  ['le bouton « Regler » paraît sans que le serveur l ait dit', SITE, '    if (b.avance?.ouverte) {', '    if (b.avance?.ouverte !== false) {'],
  ['le bouton « Regler » vient d un montant de la page', SITE, "return { sur: 'À régler', ...(montant ? { montant } : {}), phrase: PHRASE_REGLER_DES_MAINTENANT, bouton: REGLER_DES_MAINTENANT, leJourMeme: false };", "return { sur: 'À régler', montant: '1 F', phrase: PHRASE_REGLER_DES_MAINTENANT, bouton: REGLER_DES_MAINTENANT, leJourMeme: false };"],
  ['la page promet le comptoir pour un prix absent', SITE, "phrase: b.avance.raison === 'comptoir' ? PHRASE_REGLER_AU_COMPTOIR : PHRASE_REGLER_LE_JOUR_VENU, leJourMeme: false,", "phrase: PHRASE_REGLER_AU_COMPTOIR, leJourMeme: false,"],
  ['la phrase du comptoir se perd', SITE, "phrase: b.avance.raison === 'comptoir' ? PHRASE_REGLER_AU_COMPTOIR : PHRASE_REGLER_LE_JOUR_VENU, leJourMeme: false,", "phrase: PHRASE_REGLER_LE_JOUR_VENU, leJourMeme: false,"],
  ['un tiret dans la phrase du jour venu', SITE, "export const PHRASE_REGLER_LE_JOUR_VENU = 'Le règlement en ligne s’ouvre le jour de votre rituel.';", "export const PHRASE_REGLER_LE_JOUR_VENU = 'Le règlement en ligne — il s’ouvre le jour de votre rituel.';"],
  ['la billet croit une porte sans la relire', SITE, "typeof av.ouverte === 'boolean' && typeof av.raison === 'string' ? { ouverte: av.ouverte, raison: av.raison } : null;", "true ? { ouverte: (av as { ouverte: boolean }).ouverte, raison: String(av?.raison) } : null;"],
  ['l adresse du reglement n est plus verifiee', SITE, "return typeof x.adresse === 'string' && /^https:\\/\\/maisonmnd\\.com\\/trone\\/payer\\.html\\?tg=r-[23456789a-z]{14}$/.test(x.adresse)", "return typeof x.adresse === 'string'"],
  ['la page lit des places sans les verifier', DEPL, "    if (!JOUR.test(iso) || !Array.isArray(heures)) return { etat: 'panne' };", '    if (!Array.isArray(heures)) return { etat: \'panne\' };'],
  ['la page accepte trop de jours', DEPL, "  if (entrees.length > JOURS_AU_PLUS) return { etat: 'panne' };", ''],
  ['une place prise se dit en panne', DEPL, "    if (PLACE_PERDUE.includes(e)) return { etat: 'refus', raison: 'place_prise' };", ''],
  ['un agenda illisible se dit « place prise »', DEPL, "'creneau_invalide', 'creneau_trop_proche'];", "'creneau_invalide', 'creneau_trop_proche', 'agenda_illisible'];"],
  ['la page croit un deplacement sans verdict', DEPL, "  if (x.verdict !== 'deplace' && x.verdict !== 'deja') return { etat: 'refus', raison: 'panne' };\n", ''],
  ['le bouton Deplacer s ouvre a 24 heures pile', DEPL, "  return v === 'permis' ? 'ouvert' : v === 'trop-tard' ? 'ecrire' : 'rien';", "  return v === 'permis' || v === 'trop-tard' ? 'ouvert' : 'rien';"],
  ['la phrase du trop tard dit « salon »', DEPL, "trop_tard: 'Il reste 24 h ou moins avant votre rituel : pour le déplacer, écrivez à la Maison sur WhatsApp.',", "trop_tard: 'Il reste 24 h ou moins avant votre rituel : pour le déplacer, écrivez au salon sur WhatsApp.',"],
  /* ── La page : l'ilot et le calendrier ── */
  ['l ilot envoie un montant a « regler »', ILOT, "demandeALaFin({ action: 'regler', v: jeton })", "demandeALaFin({ action: 'regler', v: jeton, resteXof: 1 })"],
  ['l ilot ne mene plus a la page Regler', ILOT, "      const r = reglerLue(data, statut);\n      if (r.etat === 'a-regler') { location.assign(r.adresse); return; }", "      const r = reglerLue(data, statut);\n      if (r.etat === 'a-regler') { return; }"],
  ['le bouton « Regler dès maintenant » lance « terminer »', ILOT, "void (reglement.bouton === REGLER_DES_MAINTENANT ? regle() : termine());", "void termine();"],
  ['Deplacer n ouvre jamais le calendrier', ILOT, "{boutonDeplacer === 'ouvert' && !agendaSeul", "{false && !agendaSeul"],
  ['le calendrier s ouvre meme a moins de 24 heures', ILOT, "{boutonDeplacer === 'ouvert' && !agendaSeul", "{boutonDeplacer !== 'rien' && !agendaSeul"],
  ['l ecran « deplace » dit le premier mot du nom', ILOT, "<h2>{nr.appel ? `${nr.appel}, c’est noté.` : 'C’est noté.'}</h2>", "<h2>{nr.appel ? `${nr.appel.split(' ')[0]}, c’est noté.` : 'C’est noté.'}</h2>"],
  ['l ecran « deplace » garde la mauvaise reference', ILOT, "const nr = { ...deplace.rdv, reference: deplace.rdv.reference || (apptId ? referenceDuRendezVous(apptId) : '') };", "const nr = { ...deplace.rdv, reference: '' };"],
  ['l ecran « deplace » perd son agenda', ILOT, 'download={nomDuFichierAgenda(nr.date)}>Ajouter à mon agenda</a>', 'download={nomDuFichierAgenda(r?.date ?? nr.date)}>Ajouter à mon agenda</a>'],
  ['le calendrier du deplacement oublie la grille de la reservation', CAL, 'className="mois-du-site"', 'className="mois-du-rdv"'],
  ['le calendrier du deplacement ne grise plus les jours fermes', CAL, 'disabled={!libre}', 'disabled={false}'],
  ['le calendrier du deplacement promet une remise', CAL, '<span><i className="mois-du-site__l-actuel" aria-hidden="true" />votre date</span>', '<span><i className="mois-du-site__l-offre" aria-hidden="true" />remise du jour</span>'],
  ['le calendrier envoie le maitre ou le prix', CAL, "{ rdv: 'deplacer', v: jeton, date: jour, time: heure }", "{ rdv: 'deplacer', v: jeton, date: jour, time: heure, master: 'Team', priceXof: 1 }"],
  ['le calendrier perd le jour choisi apres une place prise', CAL, "if (r.raison === 'place_prise') { setHeure(null); setEssai((n) => n + 1); }", "if (r.raison === 'place_prise') { setJour(null); setHeure(null); setEssai((n) => n + 1); }"],
  ['le calendrier deplace sans heure choisie', CAL, 'disabled={!jour || !heure || enCours}', 'disabled={enCours}'],
  ['le calendrier lit le jeton ailleurs que dans l adresse', CAL, "jetonDeLAdresse(typeof location === 'undefined' ? '' : location.search)", "'ap-a.AAAAAAAAAAAAAAAAAAAAAA'"],
  ['l ilot charge la synchronisation du Trone', ILOT, "import DeplacerLeRendezVous from './DeplacerLeRendezVous';\n", "import DeplacerLeRendezVous from './DeplacerLeRendezVous';\nimport '../../../shared/identite';\n"],
  ['le calendrier charge la synchronisation du Trone', CAL, "import { client } from '../maison';\n", "import { client } from '../maison';\nimport '../../../shared/sync';\n"],
  ['la grille a une largeur fixe', CSS, '.rdv-page__deplacer { display: grid; gap: 10px; min-width: 0;', '.rdv-page__deplacer { display: grid; gap: 10px; min-width: 520px;'],
  ['la copie de la regle derive dans demande-submit', [DS], 'export const DELAI_POUR_DEPLACER_MS = 24 * 3_600_000;', 'export const DELAI_POUR_DEPLACER_MS = 24 * 3_600_001;'],
];

const fichiersDe = (x) => (Array.isArray(x) ? x : [x]);
const lf = (s) => s.replace(/\r\n/g, '\n');

/** Applique la panne a un texte, EN MEMOIRE, ou le rend tel quel. `null` : le texte juste est introuvable. */
function applique(rel, src, panne) {
  if (!panne || !fichiersDe(panne[1]).includes(rel)) return src;
  const crlf = src.includes('\r\n');
  const juste = lf(src);
  if (juste.split(panne[2]).length !== 2) throw new Error(`PANNE INTROUVABLE : ${panne[0]} (${rel})`);
  const casse = juste.replace(panne[2], () => panne[3]);
  return crlf ? casse.replace(/\n/g, '\r\n') : casse;
}

const fauxModules = (panne) => ({
  name: 'faux-du-banc',
  setup(b) {
    b.onResolve({ filter: /^(npm:|https:\/\/esm\.sh)/ }, (a) => ({ path: a.path, namespace: 'faux' }));
    b.onLoad({ filter: /.*/, namespace: 'faux' }, (a) => ({
      loader: 'js',
      contents: /supabase-js/.test(a.path)
        ? 'export const createClient = (...a) => globalThis.__faux.client(...a);'
        : 'export default { setVapidDetails() {}, async sendNotification(abonne, charge) { (globalThis.__push ||= []).push(JSON.parse(charge)); return {}; } };',
    }));
    b.onLoad({ filter: /\.(ts|tsx)$/ }, (a) => {
      if (a.path.includes('node_modules')) return undefined;
      const rel = path.relative(racine, a.path).replace(/\\/g, '/');
      if (rel.startsWith('..')) return undefined;
      let src = readFileSync(a.path, 'utf8');
      src = applique(rel, src, panne);
      if (rel === DS) src += EXPORTS_DE_LA_DEMANDE;
      return { contents: src, loader: a.path.endsWith('.tsx') ? 'tsx' : 'ts' };
    });
  },
});

/** Le graphe de l'ilot, vu du site : tout ce que la page charge, a la demande compris. */
async function grapheDeLIlot(panne) {
  const g = await build({
    entryPoints: [path.join(racine, ILOT)], bundle: true, write: false, metafile: true, format: 'esm', platform: 'browser',
    outdir: path.join(tmpdir(), 'graphe-rdv-du-site'), logLevel: 'silent', loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/' }) }, plugins: [fauxModules(panne)],
  });
  return Object.keys(g.metafile.inputs).map((f) => f.replace(/\\/g, '/'));
}

async function tourne(panne) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-rdv-du-site-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    const graphe = await grapheDeLIlot(panne);
    await build({
      entryPoints: [HARNAIS], bundle: true, format: 'esm', platform: 'node', target: 'es2022',
      outfile: sortie, logLevel: 'silent', plugins: [fauxModules(panne)], loader: { '.css': 'empty' },
      define: {
        __PANNE__: JSON.stringify(panne ? [panne[0], fichiersDe(panne[1]), panne[2], panne[3]] : null),
        'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }),
      },
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', env: { ...process.env, RDV_GRAPHE: JSON.stringify(graphe) } });
    return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } catch (e) {
    return { code: 3, sortie: String(e?.message ?? e) };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/* `--voir <n>` : la sortie entiere du banc sous la panne n (de 1 a PANNES.length). */
const voir = process.argv.indexOf('--voir');
if (voir > 0) {
  const r = await tourne(PANNES[Number(process.argv[voir + 1]) - 1] ?? null);
  process.stdout.write(r.sortie);
  process.exit(0);
}

const juste = await tourne(null);
process.stdout.write(juste.sortie);
if (juste.code !== 0) process.exitCode = 1;

if (process.argv.includes('--prouve')) {
  let criees = 0;
  for (const panne of PANNES) {
    const r = await tourne(panne);
    const introuvable = /PANNE INTROUVABLE/.test(r.sortie);
    const criee = !introuvable && r.code !== 0 && /ECHEC/.test(r.sortie);
    if (criee) criees++;
    else process.exitCode = 1;
    console.log(`${criee ? 'CRIEE ' : introuvable ? 'ABSENTE' : 'MUETTE'} ${panne[0]}${criee ? ` (${(r.sortie.match(/^ECHEC.*$/m) ?? [''])[0].slice(6, 70)})` : introuvable ? ` (${r.sortie.match(/PANNE INTROUVABLE[^\n]*/)?.[0] ?? ''})` : ''}`);
  }
  console.log(`\n${criees} pannes criees sur ${PANNES.length}.`);
}
