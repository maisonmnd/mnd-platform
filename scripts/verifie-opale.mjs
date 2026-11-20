import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* OPALE, ÉPROUVÉE : `node scripts/verifie-opale.mjs` (et `--prouve` pour
   planter les pannes une à une).

   4 novembre 2026. Le harnais (verifie-opale.harnais.ts) importe la VRAIE
   fonction whatsapp-automate : esbuild remplace ses imports `npm:` par une
   base et un Claude simulés. Chaque panne se plante EN MÉMOIRE, au
   chargement du fichier ou à sa lecture (`__PANNE__`) : l'arbre n'est
   jamais touché, l'empreinte de chaque fichier est comparée avant et
   après. Une panne dont le texte ne se trouve pas exactement une fois fait
   échouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const HARNAIS = path.join(racine, 'scripts/verifie-opale.harnais.ts');
const AU = 'supabase/functions/whatsapp-automate/index.ts';
const WH = 'supabase/functions/whatsapp-webhook/index.ts';
const OP = 'src/shared/opale-pur.ts';

/** { nom, fichier, avant, apres } */
const PANNES = [
  { nom: 'l aiguillage oublie le reglage', fichier: AU, avant: "if (reglageDOpale(docs.get(CLE_D_OPALE)).qui === 'opale') {", apres: 'if (true) {' },
  { nom: 'Opale parle quand l equipe a la main', fichier: AU, avant: "if (pauseActive(main, ms)) { dis('opale · l equipe a la main'); return { pris: false }; }", apres: '' },
  { nom: 'Opale parle apres avoir passe la main', fichier: AU, avant: "  const laMainEstPassee = !!fil && etapeCourante(fil, main, ms, reglage.pauseHeures) === 'main' && !o.reprise;", apres: '  const laMainEstPassee = false;' },
  { nom: 'Opale parle apres avoir passe la main', fichier: AU, avant: 'if (!filAvant || !laMainNEstPasPrise({ mainPasseeLe: passeeLe, fil: filAvant, maintenantMs: ms })) {', apres: 'if (false) {' },
  /* L'AGENDA DE TOUTE LA FENÊTRE, 18 novembre 2026 (« libre » puis « vient d'être prise »). */
  { nom: 'l agenda ne lit que l horizon de l automate', fichier: AU, avant: 'aujourdhui, Math.max(reglage.horizonJours, joursDeLaFenetre(ms)));', apres: 'aujourdhui, reglage.horizonJours);' },
  { nom: 'la proposition ne relit pas sa journee', fichier: AU, avant: 'if (!await rafraichisLeJour(sb, agenda!, p.date, vue!.oublie)) return', apres: 'if (false) return' },
  { nom: 'le deplacement ne relit pas sa journee', fichier: AU, avant: 'if (!await rafraichisLeJour(sb, agenda!, date, vue!.oublie)) return', apres: 'if (false) return' },
  /* NE PERDRE AUCUN RENDEZ-VOUS, 18 novembre 2026. */
  { nom: 'Opale ne voit pas les photos', fichier: AU, avant: 'content: photos.length === 0 ? contexte : [', apres: 'content: true ? contexte : [' },
  { nom: 'la main que personne ne prend tient toujours', fichier: OP, avant: "  return !o.fil.some((m) => m.sens === 'sortant' && m.qui === 'equipe' && Date.parse(m.quand) >= le);", apres: '  return false;' },
  { nom: 'un mot de l equipe n arrete pas la reprise', fichier: OP, avant: "  return !o.fil.some((m) => m.sens === 'sortant' && m.qui === 'equipe' && Date.parse(m.quand) >= le);", apres: '  return true;' },
  { nom: 'la garde du rituel termine bloque la reprise', fichier: AU, avant: 'if (laMainEstPassee && !finDuRituel && !repriseDeLaMain) {', apres: 'if (laMainEstPassee && !finDuRituel) {' },
  { nom: 'une main qui reste a l equipe se perd a la reprise', fichier: AU, avant: "const repondEnReprise = !!repriseDeLaMain?.resteALEquipe && issue.issue.genre === 'parle';", apres: 'const repondEnReprise = false;' },
  { nom: 'la reprise remet l heure de la main a zero', fichier: OP, avant: "mainPasseeLe: memeMain ? avant.mainPasseeLe : maintenant,", apres: 'mainPasseeLe: maintenant,' },
  /* À reprogrammer, et jamais sans rendez-vous (19 novembre 2026). */
  { nom: 'le toucher et Changer l heure laisses a Claude', fichier: AU, avant: '  const parLeCode = !finDuRituel && !vocalIncompris && !o.relance && !laMainEstPassee ? await servisParLeCode() : false;', apres: '  const parLeCode = false;' },
  { nom: 'la reprise passe toujours au-dela des fauteuils', fichier: AU, avant: 'p_au_dela: !!auDela, p_par', apres: 'p_au_dela: true, p_par' },
  { nom: 'le report ne marque rien', fichier: AU, avant: '  const apres = { ...r.data, ...marquesDuReport(Date.now(), par) };', apres: "  const apres = { ...r.data, status: 'annulé' };" },
  { nom: 'jamais au-dela des fauteuils', fichier: AU, avant: '    const suite = suiteDeSaDemande(heure, { libre: (h) => libreDOpale(date, h, g.ids, lourde), auDela: (h) => auDelaDOpale(date, h, g.ids, lourde) });', apres: '    const suite = suiteDeSaDemande(heure, { libre: (h) => libreDOpale(date, h, g.ids, lourde), auDela: () => null });' },
  { nom: 'la relance part avant la 23e heure', fichier: AU, avant: '    if (!relanceDuReportDue({ a: r.data, dernierEntrantMs: sien ? sien.ms : null, maintenantMs: ms })) {', apres: '    if (!sien) {' },
  { nom: 'la relance redonne les memes dates', fichier: AU, avant: '      deja: placesDejaProposees(r.data), perdue: { iso: String(r.data.date ?? \'\'), heure: String(r.data.time ?? \'\') }, habitudes,', apres: '      perdue: { iso: String(r.data.date ?? \'\'), heure: String(r.data.time ?? \'\') }, habitudes,' },
  { nom: 'les boutons partent en texte', fichier: AU, avant: '    if (issue.boutons?.length) sortants.push(', apres: '    if (false) sortants.push(' },
  /* La dernière relance (20 novembre 2026). */
  { nom: 'la derniere relance apres un stop', fichier: AU, avant: "      if ((fiche.nouvelles as { par?: unknown } | undefined)?.par === 'stop') continue;\n", apres: '' },
  { nom: 'la derniere relance sans modele approuve', fichier: AU, avant: "  const modeleOuvert = estApprouveChezMeta(docs.get('mnd_modeles_meta'), MODELE_DE_LA_DERNIERE_RELANCE);", apres: '  const modeleOuvert = true;' },
  { nom: 'Plus tard ne note rien', fichier: AU, avant: "        await noteLesPlacesProposeesWa(sb, r, [], false, { refusDuReportLe: new Date().toISOString() });\n", apres: '' },
  /* Le plan part avec le chemin, toujours (19 novembre 2026). */
  { nom: 'le plan laisse au modele', fichier: AU, avant: "  if (!issue.silence && (demandeLeCheminWa(textesDuTour) || donneLeChemin(issue.texte, String(agenda?.lignes.branche.data?.address ?? '')))) issue.plan = true;\n", apres: '' },
  { nom: 'le lien pour venir redit', fichier: AU, avant: 'if (lien && !LIEU_DEJA_DIT.test(issue.texte)) sortants.push', apres: 'if (lien) sortants.push' },
  { nom: 'le jour meme ne se cherche pas', fichier: AU, avant: '...placesDuJourMemeWa(agenda!.agenda, g.ids, Date.now(), lourde), ', apres: '' },
  { nom: 'le jour meme sans l heure d avance', fichier: OP, avant: 'minutesDe(e.heure) < o.minutesDuJour + JOUR_MEME_DELAI_MIN', apres: 'minutesDe(e.heure) < o.minutesDuJour' },
  { nom: 'le jour meme se pose sans le juge du jour', fichier: AU, avant: 'const verdict = await poseSousVerrou(sb, agenda!, ecriture, vue!.oublie, jourMeme, lourdeVenue);', apres: 'const verdict = await poseSousVerrou(sb, agenda!, ecriture, vue!.oublie, false, lourdeVenue);' },
  { nom: 'la grille des locks ne se dit pas', fichier: AU, avant: '        const g = grilleDesLocks(id, tete);', apres: "        const g = { texte: '', valeurs: [] as number[] };" },
  { nom: 'les totaux de la grille ne sont pas permis', fichier: AU, avant: '      for (const s of sommes) permis.add(s);', apres: '' },
  { nom: 'une nouvelle se pose sans civilite', fichier: OP, avant: "  if (!prenom || !civilite) return { ok: false, pourquoi: 'Pour l’inscrire", apres: "  if (!prenom) return { ok: false, pourquoi: 'Pour l’inscrire" },
  { nom: 'la relance part deux fois', fichier: OP, avant: "  if (Number.isFinite(deja) && deja >= elle) return non('déjà relancée');", apres: '' },
  { nom: 'la relance part la nuit (le module pur)', fichier: OP, avant: "  if (min < RELANCE_DES_MIN || min >= RELANCE_JUSQU_A_MIN) return non('la nuit');", apres: '' },
  { nom: 'la relance part la nuit (la fonction)', fichier: AU, avant: "if (min < RELANCE_DES_MIN || min >= RELANCE_JUSQU_A_MIN) return { relancees: 0, vues: 0, raison: 'la nuit' };", apres: '' },
  { nom: 'la relance n est pas notee', fichier: OP, avant: 'const relanceLe = o.relance ? maintenant : ancienne.relanceLe;', apres: 'const relanceLe = ancienne.relanceLe;' },
  { nom: 'la consigne fait attendre le prix', fichier: OP, avant: 'Elle demande un prix : donne-le TOUT DE SUITE, dans ce message ; ne la fais jamais attendre un prix.', apres: '' },
  { nom: 'la consigne laisse partir sans place', fichier: OP, avant: "    'CONCLURE',\n", apres: '' },
  { nom: 'la trace n est pas signee Opale', fichier: AU, avant: 'm, rendu, parQui: OPALE, ', apres: 'm, rendu, ' },
  { nom: 'les juges ne lisent pas son message', fichier: AU, avant: 'const fautes = fautesDOpale(texte, { montantsPermis: permis, questionFranche, enfants: prenomsDesEnfants });', apres: 'const fautes: string[] = [];' },
  { nom: 'Claude injoignable laisse la cliente sans reponse', fichier: AU, avant: "dis('opale · claude injoignable', { motif: String((e as Error)?.message ?? e).slice(0, 120) });\n      secours = true;", apres: 'throw e;' },
  { nom: 'le plafond du numero ne tient pas', fichier: AU, avant: 'if ((dits ?? 0) >= MESSAGES_D_OPALE_PAR_JOUR) {', apres: 'if (false) {' },
  { nom: 'un prestataire est servi', fichier: AU, avant: "  if (o.tiroir !== 'equipe') return false;\n  const k = o.cle(o.numero);", apres: "  if (o.tiroir !== 'equipe') return true;\n  const k = o.cle(o.numero);" },
  { nom: 'confirmer pose sans son oui', fichier: AU, avant: '      if (!permisDe.ok) return permisDe.pourquoi;', apres: '' },
  { nom: 'la confirmation dite ne ferme pas sa ligne', fichier: AU, avant: "  if (issue.posee) await ditLaConfirmation(sb, issue.posee, premier ?? { detail: 'la confirmation n est pas partie dans la conversation' });", apres: '' },
  { nom: 'un merci recoit quand meme un message', fichier: AU, avant: '  if (!issue.silence) {\n    const etape: EtapeDuFil', apres: '  if (true) {\n    const etape: EtapeDuFil' },
  { nom: 'le plan part a une habituee', fichier: AU, avant: 'if (connaitLeLieu && !demande) return', apres: 'if (false && !demande) return' },
  { nom: 'le total du recapitulatif n est pas permis', fichier: AU, avant: '    if (complet && total > 0 && ids.length > 1) permis.add(total);\n    /* Chaque total possible de la venue, la grille comprise (500 au plus). */\n    if (possibles.length > 1) {', apres: '    if (false) {' },
  { nom: 'le contexte dit le numero', fichier: AU, avant: "l.push(`- fiche [${f.id}] : ${traits.join(' ; ')}.`);", apres: "l.push(`- fiche [${f.id}] : ${traits.join(' ; ')}. Son numero : 90000001.`);" },
  { nom: 'le moment du matin se lit a l envers', fichier: OP, avant: "if (s.moment === 'matin') return m < 12 * 60;", apres: "if (s.moment === 'matin') return m >= 12 * 60;" },
  { nom: 'confirmer permis avant la lecture du recapitulatif', fichier: OP, avant: '  if (Number.isFinite(premier) && premier < le) return', apres: '  if (false) return' },
  { nom: 'le webhook coupe le tour a 30 s', fichier: WH, avant: 'const AUTOMATE_EN_FOND_MS = 120_000;', apres: 'const AUTOMATE_EN_FOND_MS = 30_000;' },
  { nom: 'les places s arretent a quatorze jours', fichier: AU, avant: 'const horizonPour = (jour?: string): number => Math.min(joursDeLaFenetre(ms), Math.max(reglage.horizonJours, 30, jour ? joursJusqua(jour) + 7 : 0));', apres: 'const horizonPour = (_jour?: string): number => reglage.horizonJours;' },
  { nom: 'la reprise prend son mot de relais pour une reponse', fichier: AU, avant: "&& d.etape !== 'main') break;", apres: ') break;' },
  { nom: 'la consigne laisse dire deplace', fichier: OP, avant: ' : ne dis jamais qu’il a été déplacé.', apres: '.' },
  { nom: 'la consigne oublie la Maison MND', fichier: OP, avant: 'Quand tu nommes le lieu, écris « la Maison MND » en entier : « Nous vous attendons à la Maison MND ». ', apres: '' },
  { nom: 'Opale annonce l offre du moment', fichier: AU, avant: '    paiements, offres: [], catalogue,', apres: "    paiements, offres: offresDOpale(docs.get('mnd_offers'), aujourdhui), catalogue," },
  { nom: 'la consigne laisse parler des remises', fichier: OP, avant: 'Ne parle d’aucune remise, d’aucun code ni d’aucune offre : la Maison MND les applique elle-même, quand ils valent pour elle.', apres: 'L’offre du jour se dit telle quelle.' },
  { nom: 'une enfant parle sur le numero de sa mere', fichier: AU, avant: '  const adulte = portent.find(parleIci);', apres: '  const adulte = portent[0];' },
  { nom: 'la trace porte la premiere fiche du numero', fichier: AU, avant: '  const clientIdDuFil = ficheQuiParle?.id;', apres: '  const clientIdDuFil = fiches[0]?.id;' },
  { nom: 'Opale ne sait pas qui ecrit', fichier: AU, avant: '    fiches: fichesDOpale, ...(parentDOpale ? { parent: parentDOpale } : {}), rdvs, connaitLeLieu,', apres: '    fiches: fichesDOpale, rdvs, connaitLeLieu,' },
  { nom: 'le juge laisse saluer l enfant', fichier: AU, avant: 'questionFranche, enfants: prenomsDesEnfants });', apres: 'questionFranche });' },
  { nom: 'la consigne laisse saluer l enfant', fichier: OP, avant: 'Ne salue jamais l’enfant et ne l’appelle jamais par son prénom : ', apres: '' },
  { nom: 'la copie du bloc derive', fichier: AU, avant: 'export const MESSAGES_D_OPALE_PAR_JOUR = 40;', apres: 'export const MESSAGES_D_OPALE_PAR_JOUR = 400;' },
  /* « J'ai terminé mon RDV » : la porte du WhatsApp (6 novembre 2026). */
  { nom: 'un lien de reglement part sans rendez-vous du jour', fichier: AU, avant: '  if (rdvIds.length === 0) return sansRdv();\n', apres: '' },
  { nom: 'le rendez-vous d un autre jour passe pour celui du jour', fichier: AU, avant: ".in('data->>clientId', ids).eq('data->>date', x.aujourdhui).limit(12);", apres: ".in('data->>clientId', ids).limit(12);" },
  { nom: 'un rendez-vous annule passe pour celui du jour', fichier: AU, avant: ".filter((l) => l.data && ['confirmé', 'honoré'].includes(String(l.data.status ?? ''))).map((l) => l.id);", apres: '.filter((l) => l.data).map((l) => l.id);' },
  { nom: 'la fin du rituel passe par Claude', fichier: AU, avant: '  if (claude && !finDuRituel && !vocalIncompris && !parLeCode) {', apres: '  if (claude && !vocalIncompris && !parLeCode) {' },
  { nom: 'sans rendez-vous du jour, la main ne passe pas', fichier: AU, avant: '    if (finDuRituel.sansRdv) {', apres: '    if (false) {' },
  { nom: 'la fin du rituel n ecoute plus', fichier: AU, avant: '  if (!ditQuElleATermine(x.texte)) return null;\n  /* SANS RENDEZ-VOUS DU JOUR', apres: '  if (true) return null;\n  /* SANS RENDEZ-VOUS DU JOUR' },
  { nom: 'toute phrase passe pour « j ai termine »', fichier: AU, avant: '  if (!ditQuElleATermine(x.texte)) return null;\n  /* SANS RENDEZ-VOUS DU JOUR', apres: '  /* SANS RENDEZ-VOUS DU JOUR' },
  /* Seconde relecture du 6 novembre 2026 : sans rendez-vous du jour, seule celle qui le nomme reçoit la demande du code ; les vingt premières minutes ; les formes nues. */
  { nom: 'sans rendez-vous du jour, « c est fini » recoit la demande du code et la main passe', fichier: AU, avant: "=> (nommeSonRendezVous(x.texte)\n    ? { texte: motDeLaMaisonALaFin({ etat: 'sans-rdv'", apres: "=> (true\n    ? { texte: motDeLaMaisonALaFin({ etat: 'sans-rdv'" },
  { nom: 'celle qui nomme son rendez-vous ne recoit plus la demande du code', fichier: AU, avant: "=> (nommeSonRendezVous(x.texte)\n    ? { texte: motDeLaMaisonALaFin({ etat: 'sans-rdv'", apres: "=> (false\n    ? { texte: motDeLaMaisonALaFin({ etat: 'sans-rdv'" },
  { nom: 'le rituel a peine commence recoit une reponse toute faite', fichier: AU, avant: "    if (etat === 'sans-rdv') return sansRdv();\n    return null;", apres: "    if (etat === 'sans-rdv') return sansRdv();\n    return sansRdv();" },
  { nom: '« je paie » tout nu redevient une declaration', fichier: AU, avant: '|je regle|je paie|je paye) ${COMPLEMENT_DE_LA_FIN}(?: d aujourd hui)?)`;', apres: '|je regle|je paie|je paye)(?: ${COMPLEMENT_DE_LA_FIN}(?: d aujourd hui)?)?)`;' },
  { nom: 'un mot de liaison en tete n est plus reconnu (« voila, j ai termine »)', fichier: AU, avant: 'new RegExp(`^(?:${LIAISON_EN_TETE_DE_LA_FIN} ){0,2}(?:', apres: 'new RegExp(`^(?:' },
  { nom: '« je viens de terminer » passe pour un trajet', fichier: AU, avant: "  return vientDeFinirDeLaFin(t.replace(POLITESSE_DU_MESSAGE_DE_FIN, ' ').replace(/ +/g, ' ').trim());", apres: "  return t.replace(POLITESSE_DU_MESSAGE_DE_FIN, ' ').replace(/ +/g, ' ').trim();" },
  { nom: 'la fin du rituel passe par une autre porte', fichier: AU, avant: "body: JSON.stringify({ action: 'terminer', porte: 'whatsapp', rdvIds }),", apres: "body: JSON.stringify({ action: 'terminer', porte: 'site', rdvIds }),", },
  { nom: 'une fonction muette fait inventer une reponse', fichier: AU, avant: "    if (!r || r.ok !== true) { dis('fin du rituel · la fonction ne repond pas', { statut: res.status }); return null; }", apres: "    if (!r || r.ok !== true) return sansRdv();" },
  { nom: 'le salut de la fin va a la premiere fiche du numero', fichier: AU, avant: 'await reponseALaFinDuRituel(sb, { texte: tour.texte, fiches, aujourdhui, appel: appelDeLaVoix })', apres: 'await reponseALaFinDuRituel(sb, { texte: tour.texte, fiches, aujourdhui, appel: prenomDuNomWa(fiches[0]?.nom) })' },
  { nom: 'le montant est invente quand la fonction ne le dit pas', fichier: AU, avant: 'resteXof: r.resteXof !== null && Number.isFinite(reste) && reste > 0 ? reste : null, adresse: r.adresse', apres: 'resteXof: 12000, adresse: r.adresse' },
  /* Le message entier, et rien d'autre (relecture du 6 novembre 2026) : une cliente en retard ne reçoit pas de lien. */
  { nom: 'une cliente qui fait ses courses recoit un lien (la phrase n a plus a tenir en entier)', fichier: AU, avant: '){0,2}$`);', apres: '){0,2}`);' },
  { nom: 'une question recoit un lien', fichier: AU, avant: '  if (/[?？]/.test(brut)) return false;\n', apres: '' },
  { nom: 'une cliente en route recoit un lien (le message peut porter autre chose apres la forme)', fichier: AU, avant: 'const UNE_DECLARATION_DE_FIN = new RegExp(`^(?:', apres: 'const UNE_DECLARATION_DE_FIN = new RegExp(`(?:' },
  /* L'avis sur photo, avec un rendez-vous (17 novembre 2026). */
  { nom: 'la main passe pour la photo d un numero sans rendez-vous', fichier: AU, avant: "if (photoRefusee && (motif === 'media' || tourSansUnMot(nouveaux))) {", apres: 'if (false) {' },
  { nom: 'une photo seule passe la main par un autre motif', fichier: AU, avant: "(motif === 'media' || tourSansUnMot(nouveaux))", apres: "(motif === 'media')" },
  { nom: 'le lien de la consultation est laisse au modele', fichier: AU, avant: "  if (photoRefusee && !finDuRituel && !issue.silence && issue.issue.genre === 'parle' && !enAttente) issue.texte = avecLeLienDeLaConsultation(issue.texte, lienConsultation);\n", apres: '' },  { nom: 'une photo seule reste sans reponse', fichier: AU, avant: '      if (photoRefusee && tourSansUnMot(nouveaux)) return refusDeLAvisSurPhoto(lienConsultation);\n      issue.silence = true;', apres: '      issue.silence = true;' },
  { nom: 'Claude muet, la photo d une inconnue passe a l equipe', fichier: AU, avant: "if (secours && !issue.silence && photoRefusee && tourSansUnMot(nouveaux) && issue.issue.genre === 'parle') {", apres: 'if (false) {' },
  { nom: 'une suggestion sans son oui ouvre l avis sur photo', fichier: AU, avant: '  if (marqueDuRendezVous(a.suggereLe) && !marqueDuRendezVous(a.confirmeeParLaClienteLe)) return false;', apres: '  if (false) return false;' },
  { nom: 'une seance faite n ouvre plus l avis sur photo', fichier: AU, avant: '  if (aUnRendezVousPrisOuUneSeanceFaite(venues, aujourdhui)) return true;\n', apres: '' },
  { nom: 'un rendez-vous pris n ouvre plus l avis sur photo', fichier: AU, avant: "  return aUnRendezVousPrisOuUneSeanceFaite(((data ?? []) as Ligne[]).map((l) => (l.data ?? {}) as RendezVousLu), aujourdhui);", apres: '  return false;' },
  { nom: 'le contexte ne dit plus la porte a Opale', fichier: AU, avant: 'rdvs, connaitLeLieu, suivie,', apres: 'rdvs, connaitLeLieu,' },
  { nom: 'toute cliente passe pour suivie', fichier: AU, avant: "const photoRefusee = !!lienConsultation && photoSansRendezVous({ suivie, nouveaux });", apres: "const photoRefusee = !!lienConsultation && photoSansRendezVous({ suivie: true, nouveaux });" },
  { nom: 'un vocal joint a une photo ne revient plus a une personne', fichier: OP, avant: " && !nouveaux.some((m) => m.type === 'audio' || m.type === 'document');", apres: ';' },
  { nom: 'la consigne redemande une photo', fichier: OP, avant: ' Ne demande une photo que pour estimer leur nombre et leur longueur.', apres: '' },
  { nom: 'la consigne laisse un avis sur photo', fichier: OP, avant: 'Sa photo te sert au prix et à la place, jamais à un avis : ne dis rien de l’état de ses locks, ne conseille aucun soin à distance.', apres: 'Sa photo te sert à tout.' },
  { nom: 'le lien de la consultation se pose deux fois', fichier: OP, avant: '  if (!lien || !t || t.includes(lien)) return t;', apres: '  if (!lien || !t) return t;' },
  /* UN RETARD N'EST PAS UN EMPÊCHEMENT, LE PETIT SERVICE PARTAGE L'HEURE (20 novembre 2026). */
  { nom: 'le petit service ne partage plus Team', fichier: AU, avant: 'maitre !== MAITRE_QUI_PARTAGE || (!!nouvelleLourde && !!deja.lourde && !partagentLaPlace(nouvelleDureeMin, deja.dureeMin));', apres: 'maitre !== MAITRE_QUI_PARTAGE || (!!nouvelleLourde && !!deja.lourde);' },
  { nom: 'le petit service prend une place en ligne (le juge)', fichier: AU, avant: '&& duJour.filter((a) => debut < a.debutMin + a.dureeMin && fin > a.debutMin && !partagentLaPlace(dureeMin, a.dureeMin)).length >= sieges) {', apres: '&& duJour.filter((a) => debut < a.debutMin + a.dureeMin && fin > a.debutMin).length >= sieges) {' },
  { nom: 'le petit service prend une place en ligne (sa personne)', fichier: AU, avant: '&& !partagentLaPlace(duree, a.dureeMin)).length >= sieges) return', apres: ').length >= sieges) return' },
  { nom: 'Opale n a pas l outil du retard', fichier: AU, avant: "    if (nom === 'noter_un_retard') return noteLeRetardDOpale(e);\n", apres: '' },
  { nom: 'un retard libere sa place', fichier: AU, avant: "if (String(r.data.date ?? '') === aujourdhui && parleDUnRetard(textesPourLeTri(nouveaux))) {", apres: 'if (false) {' },
  { nom: 'le retard se decale sans que rien ne tienne', fichier: AU, avant: '    if (!tient.ok && auDela === null) {', apres: '    if (false) {' },
  { nom: 'vingt minutes de retard decalent sa place', fichier: OP, avant: "  if (o.arriveeMin - o.rdvMin <= RETARD_SANS_DECALER_MIN) return 'attendue';\n", apres: '' },
  { nom: 'la consigne oublie le retard', fichier: OP, avant: 'Appelle `noter_un_retard` avec ce rendez-vous et son heure d’arrivée', apres: 'Appelle `mettre_a_reprogrammer` avec ce rendez-vous et son heure d’arrivée' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const faux = (panne) => ({
  name: 'faux-du-banc',
  setup(b) {
    b.onResolve({ filter: /^npm:/ }, (a) => ({ path: a.path, namespace: 'faux' }));
    b.onLoad({ filter: /.*/, namespace: 'faux' }, (a) => ({
      loader: 'js',
      contents: a.path.startsWith('npm:@supabase/supabase-js')
        ? 'export const createClient = (...a) => globalThis.__faux.client(...a);'
        : a.path.startsWith('npm:@anthropic-ai/sdk')
          ? 'export default class Anthropic { constructor(o) { this.o = o; this.messages = { create: (c) => globalThis.__faux.claude(c) }; } }'
          : 'export default {};',
    }));
    b.onLoad({ filter: /\.(ts|tsx)$/ }, (a) => {
      const rel = path.relative(racine, a.path).split(path.sep).join('/');
      if (!panne || panne.fichier !== rel) return undefined;
      const src = readFileSync(a.path, 'utf8').replace(/\r\n/g, '\n');
      if (src.split(panne.avant).length !== 2) throw new Error(`PANNE INTROUVABLE : ${panne.nom}`);
      return { contents: src.replace(panne.avant, panne.apres), loader: 'ts', resolveDir: path.dirname(a.path) };
    });
  },
});

async function tourne(panne) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-opale-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [HARNAIS], bundle: true, format: 'esm', platform: 'node', target: 'es2022',
      outfile: sortie, logLevel: 'silent', plugins: [faux(panne)],
      define: { __PANNE__: JSON.stringify(panne ?? null) },
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
    return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } catch (e) {
    return { code: 1, sortie: String(e?.message ?? e) };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const net = await tourne(null);
process.stdout.write(net.sortie);
if (net.code !== 0) process.exit(1);
if (process.argv.includes('--prouve')) {
  let muettes = 0;
  for (const p of PANNES) {
    const texte = readFileSync(path.join(racine, p.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(p.avant).length - 1;
    const avant = md5(p.fichier);
    let verdict;
    if (fois !== 1) verdict = `INTROUVABLE (${fois} fois)`;
    else verdict = (await tourne(p)).code !== 0 ? 'CRIE ' : 'MUETTE';
    if (md5(p.fichier) !== avant) verdict = `LE FICHIER A CHANGE (${verdict})`;
    if (verdict !== 'CRIE ') muettes++;
    console.log(`${verdict} ${p.nom}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) ou introuvable(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
