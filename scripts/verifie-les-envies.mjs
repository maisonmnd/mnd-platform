import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/* VOS ENVIES ET LE PARCOURS EN AFFICHES, EPROUVES - 17 novembre 2026 (maquette
   « La consultation en affiches », validee par Yeman : « construis »).

   `node scripts/verifie-les-envies.mjs`            le banc
   `node scripts/verifie-les-envies.mjs --prouve`   puis chaque faute

   Le harnais (verifie-les-envies.harnais.ts) importe les vrais modules : le
   document des envies et son aiguillage (envies-pur), les ecrans et les mots
   du parcours (parcours-en-affiches-pur), le juge du serveur
   (place-du-serveur) ; il relit aussi l'ilot, « Votre moment », l'ecran du
   Trone et la migration 0231. Empaquete par esbuild, comme les autres bancs.

   LE NAVIGATEUR NE RECOIT PLUS LE CALCUL : le banc empaquette aussi l'ilot
   comme le site le livre (esbuild, elagage des importations inutiles) et y
   cherche les traces de la lecture, de la fourchette et de la semence des
   besoins. Aucune ne doit rester.

   LE REGLAGE DE LA DECOLORATION (supabase/reglage_la_decoloration_se_reserve_
   20261117.sql) se joue pour de vrai quand PGlite est la :
     BANC_PGLITE=<dossier qui porte node_modules/@electric-sql/pglite> node scripts/verifie-les-envies.mjs
   contre une table `documents` simulee : le seuil, la garde et la case du
   site levés pour elle seule, le reste intact, et rejoué sans rien changer.
   LE REGLAGE DU GBATA (supabase/reglage_le_gbata_suit_le_nombre_de_locks_
   20261118.sql) aussi, contre une table `catalog_services` simulee : la seule
   GBATA Essentiel suit le modele et perd sa consultation avant, rejoue sans
   rien changer, sa copie de repli sous RLS.
   Sans PGlite, cette partie se saute et le dit ; son texte reste tenu.

   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. Sortie ASCII : la console de Windows. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const ENVIES = 'src/shared/envies-pur.ts';
const MAGASIN = 'src/shared/envies.ts';
const PUR = 'src/apps/revelateur/parcours-en-affiches-pur.ts';
const ILOT = 'src/apps/revelateur/ilots/Consultation.tsx';
const PORTES = 'src/apps/revelateur/ilots/PortesDeLaConsultation.tsx';
const STYLE = 'src/apps/revelateur/ilots/consultation.css';
const TRONE = 'src/apps/trone/routes/systeme/VosEnvies.tsx';
const ONGLETS = 'src/apps/trone/routes/systeme/BesoinsEtRegles.tsx';
const BESOINS = 'src/shared/besoins.ts';
const SQL = 'supabase/migrations/0231_vos_envies.sql';
const PAGE = 'src/apps/revelateur/contenu.ts';
const SEMENCE = 'src/shared/besoins-pur.ts';
const REGLAGE = 'supabase/reglage_la_decoloration_se_reserve_20261117.sql';
const REGLAGE_GBATA = 'supabase/reglage_le_gbata_suit_le_nombre_de_locks_20261118.sql';
const AGENDA = 'src/apps/revelateur/agenda.ts';

const PANNES = [
  /* La semence */
  ['Creer nait en Visio', ENVIES, "{ id: 'creer', nom: 'Créer', groupes: ['privee'], rituels: [] }", "{ id: 'creer', nom: 'Créer', groupes: ['visio'], rituels: [] }"],
  ['Volume nait en Rituel', ENVIES, "{ id: 'volume', nom: 'Volume', groupes: ['visio'], rituels: [] }", "{ id: 'volume', nom: 'Volume', groupes: ['rituel'], rituels: [] }"],
  ['la restriction de depart disparait', ENVIES, "paires: [['creer', 'reparer']],", 'paires: [],'],
  ['une famille change d identifiant', ENVIES, "{ id: 'entretien', nom: 'Entretien'", "{ id: 'entretenir', nom: 'Entretien'"],
  ['un nom d affiche trop long', ENVIES, "nom: 'Grands jours'", "nom: 'Grands jours et style de fete'"],
  ['le Lavage part sur un detox que la garde ecarte', ENVIES, "rituels: ['sv-plt-05-sig-c'] }", "rituels: ['sv-plt-20-c'] }"],
  ['la Couleur part sur la decoloration', ENVIES, "rituels: ['sv-atl-iii-cou-c'] }", "rituels: ['sv-atl-iii-sub-c'] }"],
  ['le tarif des cheveux naturels change tout seul', ENVIES, 'naturels: { prixXof: 25000, lot: 75 } },\n  /* GBÀTÀ', 'naturels: { prixXof: 20000, lot: 75 } },\n  /* GBÀTÀ'],
  ['le modele nait sans la consultation privee', ENVIES, "modele: { rdv: ['visio', 'privee'], naturels", "modele: { rdv: ['visio'], naturels"],
  /* La lecture sure */
  ['Rituel n est plus seul', ENVIES, "if (lus.includes('rituel') || lus.length === 0) return ['rituel'];", "if (lus.length === 0) return ['rituel'];"],
  ['un rendez-vous vide passe', ENVIES, 'return lus.length ? lus : [...RENDEZ_VOUS];', 'return lus;'],
  ['une restriction sur une envie retiree reste', ENVIES, 'if (a === b || !ids.has(a) || !ids.has(b) || paires.some((p) => memePaire(p, a, b))) continue;', 'if (a === b || paires.some((p) => memePaire(p, a, b))) continue;'],
  ['un nom ne se coupe plus', ENVIES, ".trim().slice(0, NOM_MAX);", '.trim();'],
  ['un tarif negatif passe', ENVIES, 'return Number.isFinite(n) && n > 0 ? n : defaut;', 'return Number.isFinite(n) ? n : defaut;'],
  /* Les gestes du Trone */
  ['deux envies du meme nom', ENVIES, "return r.envies.some((e) => e.id !== saufId && plie(e.nom) === plie(n)) ? 'pris' : null;", 'return null;'],
  ['une envie neuve nait en Visio', ENVIES, "{ id, nom: propre(nom), groupes: ['rituel'], rituels: [] }", "{ id, nom: propre(nom), groupes: ['visio'], rituels: [] }"],
  ['le dernier groupe se retire', ENVIES, 'if (!groupes.length || groupes.join() === e.groupes.join()) return r;', 'if (groupes.join() === e.groupes.join()) return r;'],
  ['Rituel s ajoute a la Visio', ENVIES, "if (g === 'rituel') groupes = ['rituel'];", "if (g === 'rituel') groupes = ['rituel', ...e.groupes];"],
  ['retirer une envie laisse ses restrictions', ENVIES, 'range({ ...r, envies: r.envies.filter((e) => e.id !== id) });', '({ ...r, envies: r.envies.filter((e) => e.id !== id) });'],
  ['une restriction en double s ecrit', ENVIES, 'if (a === b || !connue(a) || !connue(b) || r.paires.some((p) => memePaire(p, a, b))) return r;', 'if (a === b || !connue(a) || !connue(b)) return r;'],
  ['le rendez-vous d un parcours a part se vide', ENVIES, 'return neuf.length ? neuf : rdv;', 'return neuf;'],
  /* Ce que le site montre */
  ['une envie ecartee s affiche', ENVIES, "e.nom.trim() !== '' && !r.ecarts.some((x) => x.reponse === reponse && x.envie === e.id)", "e.nom.trim() !== ''"],
  ['une envie sans nom s affiche', ENVIES, "r.envies.filter((e) => e.nom.trim() !== '' && !r.ecarts", 'r.envies.filter((e) => !r.ecarts'],
  ['une envie sans nom se choisit', ENVIES, "if (!r.envies.some((e) => e.id === id && e.nom.trim() !== '') || !seTouche(r, choisies, id)) return [...choisies];", 'if (!r.envies.some((e) => e.id === id) || !seTouche(r, choisies, id)) return [...choisies];'],
  ['la restriction ne grise que dans un sens', ENVIES, '    if (b === id && choisies.includes(a)) return a;\n', ''],
  ['six envies', ENVIES, 'export const ENVIES_MAX = 5;', 'export const ENVIES_MAX = 6;'],
  ['une envie choisie ne se retire plus', ENVIES, 'choisies.includes(id) || (choisies.length < ENVIES_MAX && interditePar(r, choisies, id) === null);', 'choisies.length < ENVIES_MAX && interditePar(r, choisies, id) === null;'],
  ['une envie interdite reste choisie apres un reglage', ENVIES, '|| gardees.length >= ENVIES_MAX || interditePar(r, gardees, id) !== null) continue;', '|| gardees.length >= ENVIES_MAX) continue;'],
  /* L aiguillage */
  ['une envie sans rituel mene a un rituel vide', ENVIES, 'const tient = e.rituels.length > 0 && e.rituels.every(', 'const tient = e.rituels.every('],
  ['un rituel que le serveur refuserait est propose', ENVIES, 'e.rituels.every((s) => c.seReserve(s) && !(c.ecartees ?? []).includes(s))\n', 'e.rituels.every((s) => !(c.ecartees ?? []).includes(s))\n'],
  ['la garde peau n ecarte plus rien', ENVIES, 'e.rituels.every((s) => c.seReserve(s) && !(c.ecartees ?? []).includes(s))\n', 'e.rituels.every((s) => c.seReserve(s))\n'],
  ['un rituel qui ne tient pas dans une journee se reserve', ENVIES, '\n      && (c.tient?.(e.rituels) ?? true);', ';'],
  ['une envie sans rituel mene a la consultation privee', ENVIES, "return tient ? { rituel: [...e.rituels] } : { rdv: ['visio'] };", "return tient ? { rituel: [...e.rituels] } : { rdv: ['privee'] };"],
  ['la privee seule ne l emporte plus', ENVIES, "const visio = !priveeSeule && vus.some((g) => g.includes('visio'));", "const visio = vus.some((g) => g.includes('visio'));"],
  ['la visio fermee reste affichee', ENVIES, 'return visio && !visioOuverte ? { visio: false, privee: true } : { visio, privee };', 'return { visio, privee };'],
  ['la visio seule affiche aussi la privee', ENVIES, "const privee = priveeSeule || !visio || vus.some((g) => g.includes('privee'));", 'const privee = true;'],
  ['un septieme geste entre dans la venue', ENVIES, 'if (prestations.length + neufs.length <= GESTES_MAX &&', 'if (prestations.length + neufs.length <= GESTES_MAX + 2 &&'],
  ['une venue qui deborde d une journee se reserve', ENVIES, ' && (c.tient?.([...prestations, ...neufs]) ?? true)) {', ') {'],
  ['une prestation commune se compte deux fois', ENVIES, 'const neufs = p.rituel.filter((s) => !prestations.includes(s));', 'const neufs = p.rituel;'],
  ['une envie restee sans nom compte encore', ENVIES, "filter((e): e is Envie => !!e && e.nom.trim() !== '');", 'filter((e): e is Envie => !!e);'],
  ['Cheveux libres passe par la visio', ENVIES, "if (ensuite === 'libres' && r.defaire.rituel && c.seReserve(", "if (ensuite === 'jamais' && r.defaire.rituel && c.seReserve("],
  ['Nouvelles locks se reserve sans regard', ENVIES, "if (ensuite === 'libres' && r.defaire.rituel && c.seReserve(", 'if (r.defaire.rituel && c.seReserve('],
  ['le rituel de Cheveux libres propose alors que le serveur le refuserait', ENVIES, 'r.defaire.rituel && c.seReserve(r.defaire.rituel) && (c.tient', 'r.defaire.rituel && (c.tient'],
  ['Cheveux libres se reserve pour une tete qui ne tient pas dans une journee', ENVIES, ' && (c.tient?.([r.defaire.rituel]) ?? true)) {', ') {'],
  ['le modele propose un rituel', ENVIES, "({ rituel: null, regard: { envies: [], ...rendezVousDe([r.modele.rdv], c.visioOuverte) } });", "({ rituel: { prestations: ['x'], envies: [] }, regard: { envies: [], ...rendezVousDe([r.modele.rdv], c.visioOuverte) } });"],
  /* Le prix suit le Catalogue, la duree suit le calibre, la journee tient */
  ['Cheveux libres prend le plus grand prix', PUR, 'if (prix.length) return Math.min(...prix);', 'if (prix.length) return Math.max(...prix);'],
  ['le site multiplie le prix d office, sans suit le modele', PUR, '.map((bande) => prixSelonLeCalibre(s, { bande,', '.map((bande) => prixSelonLeCalibre({ ...s, scalesWithModel: true }, { bande,'],
  ['le bareme suspendu s applique encore', PUR, 'lockCount: representantDeLaBande(bande, o.bandes), sets: o.sets, cats: o.cats, baremeSuspendu: o.baremeSuspendu }))', 'lockCount: representantDeLaBande(bande, o.bandes), sets: o.sets, cats: o.cats, baremeSuspendu: false }))'],
  ['un prix s invente sans catalogue', PUR, 'return prixSelonLeCalibre(s, { sets: o.sets, cats: o.cats, baremeSuspendu: o.baremeSuspendu }) ?? 0;', 'return prixSelonLeCalibre(s, { sets: o.sets, cats: o.cats, baremeSuspendu: o.baremeSuspendu }) ?? 80000;'],
  ['la derniere tranche se compte a son plafond lu', PUR, '.map((b) => representantDeLaBande(b, bandes));', '.map((b) => b.maxLocks ?? 0);'],
  ['une journee deborde la fermeture', ENVIES, 'return !opening.closed && creneauxLibres({ opening, durationMin: dureeMin, occupes: [], master: \'\' }).length > 0;', 'return !opening.closed;'],
  ['la duree ne suit plus le calibre', ENVIES, 'return dureeDesPrestations(ids, gestesAuCalibre(services.filter((s) => ids.includes(s.id)), o));', 'return dureeDesPrestations(ids, services);'],
  ['le Trone dit la tranche qui ne tient pas', ENVIES, '    if (!tientDansUneJournee(dureeAuCompte(ids, services, { ...o, lockCount: compte }), semaine)) return avant;', '    if (!tientDansUneJournee(dureeAuCompte(ids, services, { ...o, lockCount: compte }), semaine)) return compte;'],
  ['un prix se coupe sur deux lignes', ENVIES, ".trim().replace(/ /g, '\\u00a0');", '.trim();'],
  /* Ce qui se reserve en ligne */
  ['une prestation a consultation avant se reserve', ENVIES, "  if (!estUneConsultation(s, cats) && exigeConsultation(s, cats)) return 'consultation';\n", ''],
  ['une prestation decochee pour le site se reserve', ENVIES, "  if (masquePourLeSite(s, masques, cats)) return 'masquee';\n", ''],
  ['un atelier hors reservation se reserve', ENVIES, "  if (!reservableSurLeSite(s, cats, masques)) return 'hors-atelier';\n", ''],
  ['une prestation archivee se reserve', ENVIES, "  if (s.archived || s.enabled === false) return 'eteinte';\n", ''],
  ['un geste a fenetre se reserve', ENVIES, "  if (s.fenetreApresVenue) return 'fenetre';\n", ''],
  ['le juge du site lit les familles nues : le defaisage n y est plus', ENVIES, '  const cats = famillesDeLaPorteDuSite(familles);', '  const cats = familles;'],
  ['la liste de /reserver/ ignore le defaisage', AGENDA, 'reservableSurLeSite(s, familles, agenda.masques)', 'reservableSurLeSite(s, cats, agenda.masques)'],
  /* Le parcours */
  ['le rendez-vous porte un numero', PUR, 'return i >= 0 && i < NOMBRE_DE_QUESTIONS ? i + 1 : null;', 'return i >= 0 ? i + 1 : null;'],
  ['le modele pose la duree avant l epaisseur', PUR, "modele: ['epaisseur', 'longueur', 'duree'],", "modele: ['duree', 'longueur', 'epaisseur'],"],
  ['une question vide ne se saute plus', PUR, 'const tous = ecransDe(p).filter((e) => e === ecran || !sautes.includes(e));\n  return tous[Math.min(', 'const tous = ecransDe(p);\n  return tous[Math.min('],
  ['une impasse reste apres le retrait de sa derniere envie', PUR, "o.choisies === 0 && o.montrees > 0) return 'envies';", "o.choisies === 0 && o.montrees > 99) return 'envies';"],
  ['les mots de la privee ne suivent plus le parcours', PUR, "const sansLocks = p === 'modele';", 'const sansLocks = false;'],
  ['la visio redevient « regarde vos locks avec vous »', PUR, 'Un maître de la Maison répond à vos inquiétudes, en quelques minutes', 'Un maître de la Maison regarde vos locks avec vous, en direct'],
  ['la derniere tranche garde son plafond', PUR, 'const haut = i === tri.length - 1 ? null : (b.maxLocks ?? null);', 'const haut = b.maxLocks ?? null;'],
  ['le nom de la Maison passe avant le nombre', PUR, "t.de <= 1 ? `Jusqu’à ${t.a}` : `${t.de} à ${t.a}`);", "t.de <= 1 ? `Moins de ${t.a}` : `${t.de} à ${t.a}`);"],
  ['le bareme lu est trie sur place', PUR, 'const tri = bandes.filter((b) => !!b && !!b.id && !!b.name).sort(', 'const tri = (bandes as Bande[]).sort('],
  ['Extra fins ne tient que le Nano', PUR, 'tranches: i < dernier ? tranches.slice(i, i + 1) : tranches.slice(i) }))', 'tranches: tranches.slice(i, i + 1) }))'],
  ['Je ne sais pas s affiche tel quel sur la fiche du modele', PUR, "['Longueur', !l || l.id === 'inconnue' ? A_VOIR : l.nom],\n      ['Avec',", "['Longueur', !l ? A_VOIR : l.nom],\n      ['Avec',"],
  ['Je ne sais pas s affiche tel quel sur la fiche a defaire', PUR, "['Ensuite', !x || x.id === 'inconnu' ? A_VOIR : x.nom],", "['Ensuite', !x ? A_VOIR : x.nom],"],
  ['Je ne sais pas part tel quel au Trone', PUR, "['Longueur', r.longueur === 'inconnue' ? A_VOIR : LONGUEURS_DITES", "['Longueur', r.longueur === 'jamais' ? A_VOIR : LONGUEURS_DITES"],
  ['« extensions » revient', PUR, "{ id: 'naturels', nom: 'Cheveux naturels', dit: 'en option', fiche: 'Cheveux naturels en option' }", "{ id: 'naturels', nom: 'Extensions', dit: 'en option', fiche: 'Extensions en option' }"],
  ['un repere de longueur diverge du Trone', PUR, "repere: 'des épaules aux omoplates'", "repere: 'des épaules au milieu du dos'"],
  ['un besoin sans prestation parait', PUR, '|| !Array.isArray(b.prestations) || b.prestations.length === 0) continue;', ') continue;'],
  ['Tout voir ne montre que quatre besoins', PUR, 'const montres = tout ? siens : siens.slice(0, BESOINS_D_ABORD);', 'const montres = siens.slice(0, BESOINS_D_ABORD);'],
  ['cinq besoins d abord', PUR, 'export const BESOINS_D_ABORD = 4;', 'export const BESOINS_D_ABORD = 5;'],
  ['la visio se range a l heure UTC', PUR, 'dit: heureEnMots(heureDeLInstant(c.debut)) }', 'dit: heureEnMots(c.debut.slice(11, 16)) }'],
  ['un jour sans heure libre se propose', PUR, '    if (heures.length) out.push({ jour, heures });', '    out.push({ jour, heures });'],
  ['cinq jours en puces', PUR, 'export const JOURS_EN_PUCES = 4;', 'export const JOURS_EN_PUCES = 5;'],
  ['le jour choisi au calendrier ne devient pas une puce', PUR, 'ouverts.some((j) => j.jour === choisi) ? [...quatre, choisi] : quatre;', 'ouverts.some((j) => j.jour === choisi) ? quatre : quatre;'],
  ['une date sans annee', PUR, '${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;\n  return `${t.charAt(0)', '${MOIS[d.getUTCMonth()]}`;\n  return `${t.charAt(0)'],
  ['changer de reponse sans changer de parcours efface tout', PUR, 'return r.locks && parcoursDe(r.locks) === parcoursDe(locks) ? { ...r, locks } : { ...REPONSES_VIDES, pour: r.pour, locks };', 'return { ...REPONSES_VIDES, pour: r.pour, locks };'],
  ['changer de parcours garde les reponses de l autre', PUR, 'return r.locks && parcoursDe(r.locks) === parcoursDe(locks) ? { ...r, locks } : { ...REPONSES_VIDES, pour: r.pour, locks };', 'return { ...r, locks };'],
  ['le depot porte une estimation', PUR, "    modalite: 'auto',\n", "    modalite: 'auto',\n    estimation: { lignes: [], aConfirmer: [], min: 0, max: 0, aChiffrer: 0 },\n"],
  ['le creneau choisi ne part pas avec le depot', PUR, '    ...(o.moment ? { moment: o.moment } : {}),\n', ''],
  ['la garde peau ne part pas avec le depot', PUR, "    ...(o.besoins.some((b) => b.garde) ? { garde: 'peau' as const } : {}),\n", ''],
  ['des locks a defaire se disent « nees ailleurs »', PUR, "...(r.locks && r.locks !== 'defaire' ? { nees: r.locks } : {}),", "...(r.locks ? { nees: r.locks === 'defaire' ? 'ailleurs' as const : r.locks } : {}),"],
  ['le numero perd son indicatif', PUR, 'return /^(\\+|00)/.test(n) ? n : `${indicatif} ${n}`.trim();', 'return n;'],
  /* L ilot et « Votre moment » */
  ['l ilot recalcule une lecture', ILOT, "import './consultation.css';", "import './consultation.css';\nimport { qualifie } from '../../../shared/besoins-pur';\nvoid qualifie;"],
  ['« Notre lecture » revient', ILOT, "{affiches.regard ? 'Votre rendez-vous' : 'Votre rituel'}", "{affiches.regard ? 'Notre lecture' : 'Votre rituel'}"],
  ['le prix de la privee ecrit en dur', ILOT, 'const cPrivee = chiffreEtSigne(argent(PRIX_DE_LA_CONSULTATION_PRIVEE_XOF));', 'const cPrivee = chiffreEtSigne(argent(15000));'],
  ['un prix affiche sans fmtMoney', ILOT, "const argent = (xof: number) => insecable(fmtMoney(xof, d?.devise ?? 'XOF'));", "const argent = (xof: number) => `${xof} F`;"],
  ['le site propose un rituel sans demander au juge', ILOT, "seReserve: (id) => etatEnLigne(service(id), agenda.categories, agenda.masques) === 'ok',", 'seReserve: () => true,'],
  ['les envies ne viennent plus du document', ILOT, "envies: enviesSures(doc('mnd_envies')),", 'envies: enviesSures(null),'],
  ['les mots de la privee recopies dans l ilot', ILOT, 'ligne={dits.privee.ligne}', "ligne={parcours === 'modele' ? 'À la Maison, devant vos cheveux' : 'À la Maison, devant vos locks'}"],
  ['Tout voir ne montre rien de plus', ILOT, 'besoinsAMontrer(d.besoins, e.id, toutVoir.includes(e.id))', 'besoinsAMontrer(d.besoins, e.id, false)'],
  ['une envie retiree reste choisie dans l ilot', ILOT, 'const envies = rangeLesChoisies(d.envies, repBrutes.envies, repBrutes.locks);', 'const envies = repBrutes.envies;'],
  ['l impasse revient dans l ilot', ILOT, 'const ecran = ecranTenu(ecranVoulu, parcours, { choisies: d ? rep.envies.length : 1, montrees: montrees.length });', 'const ecran = ecranVoulu;'],
  ['le prenom s efface en changeant de rendez-vous', ILOT, 'const [qui, setQui] = useState<Coordonnees>(COORDONNEES_VIDES);', 'const qui = COORDONNEES_VIDES; const setQui = (_: Coordonnees) => {};'],
  ['le Cheveux libres au prix du catalogue, sans la regle du Catalogue', ILOT, 'return total + prixAPartirDe(s, tranchesDites, { bandes: agenda.bandes, sets: agenda.bandSets, cats: agenda.categories, baremeSuspendu: agenda.baremeSuspendu });', 'return total + Number(s.priceXof ?? 0);'],
  ['l ilot multiplie le prix d office', ILOT, 'return total + prixAPartirDe(s, tranchesDites, { bandes: agenda.bandes, sets: agenda.bandSets, cats: agenda.categories, baremeSuspendu: agenda.baremeSuspendu });', 'return total + prixAPartirDe(s, tranchesDites, { bandes: agenda.bandes, sets: agenda.bandSets, cats: agenda.categories, baremeSuspendu: agenda.baremeSuspendu }) * 1;\n      void (Number(s.priceXof ?? 0) * 1.4);'],
  ['l ilot ne juge plus la journee', ILOT, 'tient: (ids) => (comptes.length ? comptes : [0]).every(', 'tient: (ids) => [0].every('],
  ['la place tenue est celle de la plus petite tete', ILOT, 'Math.max(0, ...comptes)', 'Math.min(...comptes)'],
  ['l ilot importe un magasin du Trone', ILOT, "import './consultation.css';", "import './consultation.css';\nimport { besoinsStore } from '../../../shared/besoins';\nvoid besoinsStore;"],
  ['le lien de la visio s affiche', PORTES, '<p className="ca-note">{note}</p>', '<p className="ca-note">{note}</p><p className="ca-note">{location.origin}{recu.changer}</p>'],
  ['le billet de la visio ne dit plus le WhatsApp', PORTES, "? 'Le lien arrive sur votre WhatsApp.'", "? 'Gardez ce lien : c’est votre entrée dans la salle.'"],
  ['le billet de la visio promet un Je confirme', PORTES, "? 'Le lien arrive sur votre WhatsApp.'", "? 'Le lien arrive sur votre WhatsApp. Répondez « Je confirme » : sans réponse, la place se libère.'"],
  ['les heures d un rituel ignorent son calibre', PORTES, 'heuresLibres({ agenda: agendaDuChoix,', 'heuresLibres({ agenda,'],
  ['le bilan sous cle au billet d un rituel', PORTES, "{recu.genre !== 'rituel' && <Scelle texte=\"Il s’ouvre à ce rendez-vous.\" />}", '<Scelle texte="Il s’ouvre à ce rendez-vous." />'],
  ['le creneau de la privee ne part plus a la verification', PORTES, 'expectedXof: prix, branchId: agenda.branchId, moment });', 'expectedXof: prix, branchId: agenda.branchId });'],
  ['la privee se depose sans son creneau', PORTES, "const id = await depose('privee', moment);", "const id = await depose('privee');"],
  ['la limite de la visio n est plus lue', PORTES, "const motif = String(r.motif ?? r.raison ?? '');", "const motif = String(r.motif ?? '');"],
  ['les jours viennent d une liste', PORTES, 'const horizon = useMemo(() => horizonDuSite(), []);', "const horizon = useMemo(() => ({ du: '2026-11-18', au: '2027-01-31', jours: ['2026-11-18', '2026-11-19'] }), []);"],
  ['un jour complet se touche au calendrier', PORTES, 'disabled={!libres.has(iso)}', 'disabled={false}'],
  ['le rituel ne passe plus par la reservation du site', PORTES, "supabase.functions.invoke('demande-submit', {", "supabase.functions.invoke('demande-directe', {"],
  ['l etat du serveur n est pas lu', PORTES, "r.etat === 'en-attente' ? 'en-attente' : r.etat === 'confirme' || r.confirme === true ? 'confirme' : 'demande'", "r.confirme === true ? 'confirme' : 'demande'"],
  ['le billet mene a la salle par son chemin a jeton', PORTES, "cheminSur(r.changer) || (typeof r.billet === 'string' && !('jeton' in r) ? cheminSur(r.chemin) : '');", 'cheminSur(r.changer) || cheminSur(r.chemin);'],
  ['un second depot part', PORTES, '    if (depot) return depot;\n', ''],
  ['l identifiant rendu par le serveur est ignore', PORTES, "const id = typeof r.id === 'string' && FORME_DE_LA_CONSULTATION.test(r.id) ? r.id : propose;", 'const id = propose;'],
  ['la privee reglee ne se pose plus au Carnet', PORTES, "const pose = await appelle('visio-salle', { geste: 'reserver-privee', consultationId: id, moment })", 'const pose = await Promise.resolve({ ok: true } as Record<string, unknown>)'],
  ['la privee ignore les moments du serveur', PORTES, '          if (jours) setPrivees(jours); else void leCarnet();', '          void jours; void leCarnet();'],
  ['un moment mal ecrit passe', PUR, "const heure = typeof o.heure === 'string' && /^\\d{2}:\\d{2}$/.test(o.heure) ? o.heure : '';", "const heure = typeof o.heure === 'string' ? o.heure : '';"],
  ['les points repartent avec le depot', PUR, '    besoins: o.besoins.map((b) => ({ id: b.id, mots: b.mots })),', '    besoins: o.besoins.map((b) => ({ id: b.id, mots: b.mots, points: 10 })),'],
  ['le depot dit ce qui a ete regle', PUR, '    branchId: o.branchId,\n    status:', '    paidXof: 0,\n    branchId: o.branchId,\n    status:'],
  ['un moment pris passe pour tenu', PORTES, "etat: tenu ? 'confirme' : refusee ? 'a-fixer' : 'demande'", "etat: tenu || refusee ? 'confirme' : 'demande'"],
  ['le refus du numero n est plus dit', PORTES, "    } else if (motif === 'numero') {", "    } else if (motif === 'numero-jamais') {"],
  ['le billet mene a une adresse venue d ailleurs', PORTES, "(typeof x === 'string' && /^\\/[A-Za-z0-9#]/.test(x) ? x : '')", "(typeof x === 'string' ? x : '')"],
  ['le nombre d une affiche se coupe', PORTES, '<span className="ca-aff__nombre">{chiffre}</span>', '{chiffre}'],
  ['le prenom vit dans « Votre moment »', PORTES, 'const { prenom, numero, pays } = qui;', "const [prenom] = useState(''); const { numero, pays } = qui;"],
  ['un jour touche efface son numero', PORTES, 'const choisisLeJour = (iso: string) => { setJour(iso);', "const choisisLeJour = (iso: string) => { surQui({ ...qui, numero: '' }); setJour(iso);"],
  ['un nom s ecrit en HTML brut', PORTES, '<span className="ca-aff__nom">{nom}</span>', '<span className="ca-aff__nom" dangerouslySetInnerHTML={{ __html: nom }} />'],
  /* La feuille */
  ['les affiches penchent', STYLE, '.ca-aff:disabled { cursor: default; }', '.ca-aff:disabled { cursor: default; }\n.ca-aff:nth-child(even) .ca-aff__c { transform: rotate(-2.4deg); }'],
  ['un rayon de douze pixels', STYLE, '.ca-cal__c { min-height: 38px; min-width: 0; padding: 0; border: 1px solid var(--filet); border-radius: 2px;', '.ca-cal__c { min-height: 38px; min-width: 0; padding: 0; border: 1px solid var(--filet); border-radius: 12px;'],
  ['une autre police', STYLE, '.ca-titre { margin: 0; font-family: var(--serif);', ".ca-titre { margin: 0; font-family: 'Playfair Display', serif;"],
  ['le nombre d une affiche peut se couper', STYLE, '.ca-aff__nombre { flex: none; white-space: nowrap; }', '.ca-aff__nombre { flex: none; white-space: normal; }'],
  ['une grille elargit la colonne', STYLE, '.ca-affiches { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; min-width: 0; }', '.ca-affiches { display: grid; gap: 10px; min-width: 0; }'],
  ['le nom d une affiche pousse la colonne', STYLE, 'font-size: clamp(22px, 13vw - 17px, 38px);', 'font-size: 38px;'],
  ['le mouvement ne s eteint plus', STYLE, '@media (prefers-reduced-motion: reduce) { .ca-ecran { animation: none; } .ca * { transition: none !important; } }', ''],
  /* Le Trone */
  ['l onglet Vos envies disparait', ONGLETS, "{onglet === 'envies' && <VosEnvies estDirection={estDirection} />}", ''],
  ['Vos envies s ecrit hors direction', TRONE, '<fieldset disabled={!estDirection} className="tev-champs">', '<fieldset className="tev-champs">'],
  ['le Trone ne dit plus « rituel a choisir »', TRONE, '{e.rituels.length === 0 && <span className="tev-signal">Rituel à choisir. En attendant, le site propose la visio.</span>}', ''],
  ['le Trone dit le Gbata au bareme meme sans suit le modele', TRONE, '{libres.scalesWithModel === true', '{true'],
  ['le Trone ne dit plus la journee', TRONE, 'auDelaDUneJournee([libres.id], services, { bandes, sets: jeux, categories: cats, suspendu: reglages.baremeSuspendu === true }, reglages.hours)', 'null'],
  ['le Trone ne juge plus par la regle du serveur', TRONE, 'const etat = (id: string) => etatEnLigne(parId.get(id), cats, vitrine.siteMasques);', "const etat = (_: string) => 'ok' as const;"],
  ['le document change de cle', MAGASIN, "export const CLE_DES_ENVIES = 'mnd_envies';", "export const CLE_DES_ENVIES = 'mnd_envie';"],
  ['le magasin change de cle', MAGASIN, "createStore<ReglagesDesEnvies>('mnd_envies', ENVIES_DE_DEPART())", "createStore<ReglagesDesEnvies>('mnd_envie', ENVIES_DE_DEPART())"],
  ['le document ne se synchronise plus', MAGASIN, 'bindDocument(enviesStore, CLE_DES_ENVIES);', ''],
  ['un geste refuse signe quand meme', MAGASIN, 'return neuf === sur ? avant : { ...neuf,', 'return { ...neuf,'],
  ['les familles reviennent a mnd_besoins', BESOINS, 'familles: enviesSures(envies).envies.map((e) => ({ id: e.id, nom: e.nom || e.id }))', 'familles: reglagesSurs(brut).familles'],
  /* La migration */
  ['0231 ferme la lecture au site', SQL, 'create policy docs_envies_lire on public.documents for select to anon, authenticated', 'create policy docs_envies_lire on public.documents for select to authenticated'],
  ['0231 laisse tout le personnel ecrire', SQL, "  as restrictive for update to anon, authenticated\n  using (key <> 'mnd_envies' or public.est_direction())\n  with check (key <> 'mnd_envies' or public.est_direction());", "  as restrictive for update to anon, authenticated\n  using (true)\n  with check (true);"],
  ['0231 ferme aussi la lecture a l equipe', SQL, 'as restrictive for delete to anon, authenticated', 'as restrictive for all to anon, authenticated'],
  ['0231 reecrit la liste blanche des autres', SQL, '-- ⟨/0231⟩', "drop policy if exists docs_pub_read on public.documents;\n-- ⟨/0231⟩"],
  /* La decoloration se reserve directement */
  ['la decoloration reprend son seuil', SEMENCE, "'coula', 'trans', 'soig'", "'coula', 'soig'"],
  ['la garde peau ecarte de nouveau la decoloration', SEMENCE, 'ecartesParLaPeau: [P.wewe, P.wedec, P.wd, P.momc],', 'ecartesParLaPeau: [P.wewe, P.wedec, P.wd, P.momc, P.trans],'],
  ['la garde peau lache le detox', SEMENCE, 'ecartesParLaPeau: [P.wewe, P.wedec, P.wd, P.momc],', 'ecartesParLaPeau: [P.wedec, P.wd, P.momc],'],
  ['la garde peau lache Le Moment Cuir chevelu', SEMENCE, 'ecartesParLaPeau: [P.wewe, P.wedec, P.wd, P.momc],', 'ecartesParLaPeau: [P.wewe, P.wedec, P.wd],'],
  ['le Trone dit encore la decoloration ecartee', ONGLETS, 'écarte détox et décapant tant que', 'écarte détox, décapant et décoloration tant que'],
  ['la lecture d essai du Trone dit encore la decoloration ecartee', ONGLETS, 'Détox et décapant sont écartés tant qu', 'Détox, décapant et décoloration sont écartés tant qu'],
  ['le reglage sort le detox de la garde', REGLAGE, "from jsonb_array_elements(d.data->'ecartesParLaPeau') with ordinality as t(e, ord)\n                         where e <> '\"sv-atl-iii-sub-c\"'::jsonb)", "from jsonb_array_elements(d.data->'ecartesParLaPeau') with ordinality as t(e, ord)\n                         where e <> '\"sv-plt-20-c\"'::jsonb)"],
  ['le reglage vide la garde', REGLAGE, "                         where e <> '\"sv-atl-iii-sub-c\"'::jsonb), '[]'::jsonb),\n              'modifieLe'", "                         where false), '[]'::jsonb),\n              'modifieLe'"],
  ['le reglage oublie le seuil', REGLAGE, "else d.data->'sansSeuil' || '[\"sv-atl-iii-sub-c\"]'::jsonb end,", "else d.data->'sansSeuil' end,"],
  ['le reglage oublie la case du site', REGLAGE, "where d.key = 'mnd_vitrine_config'\n   and jsonb_typeof", "where d.key = 'mnd_vitrine_config_jamais'\n   and jsonb_typeof"],
  ['le reglage recoche tout le site', REGLAGE, "from jsonb_array_elements(d.data->'siteMasques'->'services') with ordinality as t(e, ord)\n                    where e <> '\"sv-atl-iii-sub-c\"'::jsonb)", "from jsonb_array_elements(d.data->'siteMasques'->'services') with ordinality as t(e, ord)\n                    where false)"],
  ['le reglage demasque aussi Ma Couronne', REGLAGE, "         '{siteMasques,services}',", "         '{hiddenServices}',"],
  ['le reglage se rejoue en reecrivant', REGLAGE, "   and (not (d.data->'sansSeuil' @> '[\"sv-atl-iii-sub-c\"]'::jsonb)\n        or d.data->'ecartesParLaPeau' @> '[\"sv-atl-iii-sub-c\"]'::jsonb);", ';'],
  /* Le reglage du Gbata */
  ['le reglage du Gbata touche toutes les prestations', REGLAGE_GBATA, " where id = 'sv-plt-45-std'\n   and (coalesce", " where true\n   and (coalesce"],
  ['le reglage du Gbata garde la consultation avant', REGLAGE_GBATA, "'consultationAvant', false)", "'consultationAvant', true)"],
  ['le reglage du Gbata se rejoue en reecrivant', REGLAGE_GBATA, "   and (coalesce((data->>'scalesWithModel')::boolean, false) = false\n        or coalesce((data->>'consultationAvant')::boolean, false) = true);", ';'],
  ['la copie de repli du Gbata sans RLS', REGLAGE_GBATA, 'alter table public.repli_le_gbata_suit_le_nombre_de_locks_20261118 enable row level security;', ''],
  ['le reglage du Gbata eteint suit le modele', REGLAGE_GBATA, "jsonb_build_object('scalesWithModel', true,", "jsonb_build_object('scalesWithModel', false,"],
  /* La page */
  ['la page promet encore une estimation', PAGE, "ligne: 'Cinq questions, puis votre rendez-vous.',", "ligne: 'Une lecture et une estimation, sans rien payer.',"],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

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
      const casse = texte.replace(a, b);
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

/** Le fichier de reglage, joue contre une table `documents` simulee. Vrai si tout tient (ou si PGlite manque). */
async function joueLeReglage() {
  const ou = process.env.BANC_PGLITE;
  let PGlite = null;
  if (ou) { try { PGlite = (await import(pathToFileURL(path.join(ou, 'node_modules/@electric-sql/pglite/dist/index.js')).href)).PGlite ?? null; } catch { PGlite = null; } }
  if (!PGlite) { console.log('SAUTE les reglages (decoloration, Gbata) ne se jouent pas ici, PGlite absent (BANC_PGLITE=<dossier qui porte node_modules/@electric-sql/pglite>)'); return true; }
  const DECO = 'sv-atl-iii-sub-c';
  const besoins = {
    version: 1, seuils: [0, 20, 40, 70], bornes: [15000, 40000, 100000], besoins: [{ id: 'bs-080', famille: 'couleur', mots: 'x', points: 25, prestations: [DECO] }],
    sansSeuil: ['sv-plt-20-c', 'sv-atl-iii-ecl-c'], paliersPoses: { 'sv-atl-i-med': 2 },
    ecartesParLaPeau: ['sv-plt-20-c', 'sv-dds-dec', 'sv-forfait-sv-plt-60-wd-c', 'sv-le-moment-cuir-chevelu', DECO],
  };
  const vitrine = { autoplay: true, hiddenServices: ['sv-cache', DECO], siteMasques: { services: ['sv-a', DECO, 'sv-b'], categories: ['sup'] } };
  const abime = { sansSeuil: 'texte', ecartesParLaPeau: [DECO] };
  const db = new PGlite();
  let ko = 0;
  /* jsonb range les cles a sa facon : la comparaison ne tient pas compte de leur ordre. */
  const range = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
  const dit = (nom, attendu, obtenu) => {
    const ok = range(attendu) === range(obtenu);
    if (!ok) ko += 1;
    console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${range(obtenu)}`}`);
  };
  try {
    await db.exec('create table public.documents (key text primary key, data jsonb, updated_at timestamptz not null default now());');
    for (const [cle, data] of [['mnd_besoins', besoins], ['mnd_vitrine_config', vitrine], ['mnd_settings', { hours: [] }], ['mnd_besoins_abime', abime]]) {
      await db.query("insert into public.documents (key, data, updated_at) values ($1, $2::jsonb, '2026-11-13T00:00:00Z')", [cle, JSON.stringify(data)]);
    }
    const sql = readFileSync(path.join(racine, REGLAGE), 'utf8');
    const lis = async () => Object.fromEntries((await db.query('select key, data, updated_at from public.documents')).rows.map((r) => [r.key, { data: r.data, le: new Date(r.updated_at).toISOString() }]));
    await db.exec(sql);
    const un = await lis();
    const b = un.mnd_besoins.data;
    const v = un.mnd_vitrine_config.data;
    dit('PGlite : la decoloration rejoint les prestations sans seuil, les autres y restent', ['sv-plt-20-c', 'sv-atl-iii-ecl-c', DECO], b.sansSeuil);
    dit('PGlite : la garde peau ne l ecarte plus, et ecarte toujours les quatre autres, dans l ordre', ['sv-plt-20-c', 'sv-dds-dec', 'sv-forfait-sv-plt-60-wd-c', 'sv-le-moment-cuir-chevelu'], b.ecartesParLaPeau);
    dit('PGlite : rien d autre ne bouge dans les besoins, et le reglage signe', [besoins.besoins, besoins.seuils, besoins.bornes, besoins.paliersPoses, true, true],
      [b.besoins, b.seuils, b.bornes, b.paliersPoses, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(String(b.modifieLe)), /17 novembre 2026/.test(String(b.modifiePar))]);
    dit('PGlite : la case du site est recochee pour elle seule ; Ma Couronne et le comptoir ne bougent pas', [['sv-a', 'sv-b'], ['sup'], ['sv-cache', DECO], true],
      [v.siteMasques.services, v.siteMasques.categories, v.hiddenServices, v.autoplay]);
    dit('PGlite : un autre document, ou un document abime, n est pas touche', [{ hours: [] }, '2026-11-13T00:00:00.000Z', abime, '2026-11-13T00:00:00.000Z'],
      [un.mnd_settings.data, un.mnd_settings.le, un.mnd_besoins_abime.data, un.mnd_besoins_abime.le]);
    dit('PGlite : les deux documents changes portent une date neuve', [true, true], [un.mnd_besoins.le !== '2026-11-13T00:00:00.000Z', un.mnd_vitrine_config.le !== '2026-11-13T00:00:00.000Z']);
    await db.exec("update public.documents set updated_at = '2026-11-14T00:00:00Z'");
    await db.exec(sql);
    const deux = await lis();
    dit('PGlite : rejoue, le reglage ne change rien', [un.mnd_besoins.data, un.mnd_vitrine_config.data, '2026-11-14T00:00:00.000Z', '2026-11-14T00:00:00.000Z'],
      [deux.mnd_besoins.data, deux.mnd_vitrine_config.data, deux.mnd_besoins.le, deux.mnd_vitrine_config.le]);

    /* LE GBATA SE PAIE SELON LE NOMBRE DE LOCKS (18 novembre 2026). */
    const std = { id: 'sv-plt-45-std', name: 'GBATA Essentiel', priceXof: 80000, priceMode: 'variable', priceToXof: 120000, categoryId: 'cat-defaisage', durationMin: 300, consultationAvant: true };
    const integral = { id: 'sv-plt-45-int', name: 'GBATA Integral', priceXof: 150000, priceMode: 'fixe', categoryId: 'cat-defaisage', durationMin: 480, consultationAvant: true };
    const autre = { id: 'sv-autre', name: 'Autre', priceXof: 10000, categoryId: 'atl-ii-gbeji', durationMin: 60, consultationAvant: true };
    await db.exec('create table public.catalog_services (id text primary key, data jsonb, updated_at timestamptz not null default now());');
    for (const s of [std, integral, autre]) {
      await db.query("insert into public.catalog_services (id, data, updated_at) values ($1, $2::jsonb, '2026-11-13T00:00:00Z')", [s.id, JSON.stringify(s)]);
    }
    const sqlGbata = readFileSync(path.join(racine, REGLAGE_GBATA), 'utf8');
    const catalogue = async () => Object.fromEntries((await db.query('select id, data, updated_at from public.catalog_services')).rows.map((r) => [r.id, { data: r.data, le: new Date(r.updated_at).toISOString() }]));
    await db.exec(sqlGbata);
    const g1 = await catalogue();
    dit('PGlite : GBATA Essentiel suit le modele et perd sa consultation avant ; le reste de sa fiche ne bouge pas', [{ ...std, scalesWithModel: true, consultationAvant: false }, true],
      [g1['sv-plt-45-std'].data, g1['sv-plt-45-std'].le !== '2026-11-13T00:00:00.000Z']);
    dit('PGlite : l Integral et les autres prestations ne bougent pas', [integral, autre, '2026-11-13T00:00:00.000Z', '2026-11-13T00:00:00.000Z'],
      [g1['sv-plt-45-int'].data, g1['sv-autre'].data, g1['sv-plt-45-int'].le, g1['sv-autre'].le]);
    const repli = (await db.query("select c.relrowsecurity as rls, (select count(*)::int from public.repli_le_gbata_suit_le_nombre_de_locks_20261118) as n from pg_class c where c.relname = 'repli_le_gbata_suit_le_nombre_de_locks_20261118'")).rows[0];
    dit('PGlite : la copie de repli garde la fiche d avant, sous RLS', [true, 1], [repli?.rls, repli?.n]);
    await db.exec("update public.catalog_services set updated_at = '2026-11-14T00:00:00Z'");
    await db.exec(sqlGbata);
    const g2 = await catalogue();
    const repli2 = (await db.query('select data from public.repli_le_gbata_suit_le_nombre_de_locks_20261118')).rows;
    dit('PGlite : rejoue, le reglage du Gbata ne change rien, et sa copie de repli ne se refait pas', [g1['sv-plt-45-std'].data, '2026-11-14T00:00:00.000Z', [std]],
      [g2['sv-plt-45-std'].data, g2['sv-plt-45-std'].le, repli2.map((r) => r.data)]);
  } catch (e) {
    ko += 1;
    console.log(`ECHEC PGlite : le reglage ne se joue pas : ${String(e?.message ?? e).split('\n')[0]}`);
  } finally {
    try { await db.close(); } catch { /* deja fermee */ }
  }
  return ko === 0;
}

process.chdir(racine);
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-envies-'));
let statut = 1;
try {
  const sortie = path.join(dossier, 'harnais.mjs');
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-les-envies.harnais.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    banner: {
      js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = globalThis.window ?? { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = globalThis.document ?? { body: { dataset: {} }, addEventListener() {} };`,
    },
  });
  const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  process.stdout.write(r.stdout ?? '');
  if (r.stderr) process.stdout.write(r.stderr);
  statut = r.status ?? 1;

  /* L'ilot tel que le navigateur le recoit. */
  const livre = path.join(dossier, 'ilot.js');
  await build({
    entryPoints: [path.join(racine, ILOT)], bundle: true, format: 'esm', platform: 'browser', outfile: livre, logLevel: 'error',
    loader: { '.css': 'empty' }, jsx: 'automatic', treeShaking: true,
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_KKIAPAY_PUBLIC_KEY: '', BASE_URL: '/' }) },
  });
  const texte = readFileSync(livre, 'utf8');
  const TRACES = [
    ['la lecture (qualifie)', 'function qualifie('],
    ['la lecture (qualifie)', 'il faut la consultation priv'],
    ['la fourchette (fourchetteDe)', 'function fourchetteDe('],
    ['la fourchette (fourchetteDe)', 'auDelaDesLocks'],
    ['la somme des fourchettes', 'aChiffrer'],
    ['les paliers de la lecture', 'paliersPoses'],
    ['la semence des besoins', 'BESOINS_DE_DEPART'],
    ['la semence des besoins', 'mes premi'],
  ];
  const restes = [...new Set(TRACES.filter(([, t]) => texte.includes(t)).map(([nom]) => nom))];
  if (restes.length) { statut = 1; console.log(`ECHEC le navigateur recoit encore : ${restes.join(', ')}`); }
  else console.log(`OK    le navigateur ne recoit ni lecture, ni fourchette, ni semence des besoins (ilot empaquete : ${Math.round(texte.length / 1024)} Ko)`);

  /* LE VRAI REGLAGE, DANS PGLITE. */
  if (!(await joueLeReglage())) statut = 1;
} catch (e) {
  /* Une faute qui ne se construit plus (une importation interdite, un type cassé) est une faute criée. */
  console.log(`ECHEC : le harnais ne se construit pas : ${String(e?.message ?? e).split('\n')[0]}`);
  statut = 1;
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
process.exit(statut);
