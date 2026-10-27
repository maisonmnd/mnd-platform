/* LA RÉPONSE WHATSAPP PROPOSÉE, ÉPROUVÉE — `node scripts/verifie-la-reponse-proposee.mjs`.

   19 octobre 2026, chantier 4 des huit (maquette NKQMiMMY… validée) :
   « Dans Conversations : "Proposer une réponse". Claude lit le fil, sa fiche
   (civilité, prochain rendez-vous, reste dû), l'agenda et le catalogue, et
   écrit dans la voix de la Maison. Vous relisez, changez un mot, envoyez.
   Rien ne part seul : l'automate de réservation reste comme il est. »
   Prix : ceux du catalogue ; depuis le 27 octobre 2026, une création ou une
   réparation n'en porte aucun (la consultation, puis le devis écrit), le reste
   se dit par palier de locks, son nombre de locks d'abord, la voix premium.
   Chez Claude : prénom et initiale, jamais un numéro (11 octobre).

   « Ne pas faire voir mon retard aux clients » (18 octobre) : ce qu'elle doit
   ne s'annonce pas de soi-même.

   LES ATTENTES SONT ÉCRITES À LA MAIN d'après ces décisions, jamais déduites
   du code. Données d'exemple.

   REPRISE DU 19 OCTOBRE 2026, au soir : trois attentes de la première main
   étaient fausses en fait, et sont corrigées ici (le 1er janvier 2027 est un
   VENDREDI ; une phrase de seize mots tient trois fois dans soixante, pas
   quatre ; « SÍNSIN™ » garde son ™, c'était le code qui le perdait). */
import { readFileSync } from 'node:fs';
import {
  FIL_MAX, MOTS_MAX, SIGNES_MAX, SCHEMA_DE_LA_REPONSE,
  consigneDeLaReponse, contextePourClaude, dateDitePourClaude, derniereVenueDe, etatDeLaZone, filOuvertAClaude, filPourClaude,
  lectureDeLaReponse, lignesDuCataloguePourClaude, motsDe, prochainRdvDe, zoneAProteger,
  LIENS_DE_LA_MAISON, paliersDeLocks,
} from '../src/shared/ia-reponse-wa-pur';
import { DEPARTEMENTS_PAR_CHANTIER, peutDemander } from '../src/shared/ia-maison-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const PUR = 'src/shared/ia-reponse-wa-pur.ts';
const COMPOSANT = 'src/apps/trone/routes/clients/ReponseProposee.tsx';
const CSS = 'src/apps/trone/routes/clients/reponse-proposee.css';
/* Le composeur du fil a quitté Conversations.tsx pour ComposeurWhatsApp.tsx le
   27 octobre 2026 (lot 3, Assistant Maison) : la promesse suit, mêmes mots. */
const COMPOSEUR = 'src/apps/trone/routes/clients/ComposeurWhatsApp.tsx';
const AUTOMATE = 'src/shared/automate-wa.ts';
const AUTOMATE_EDGE = 'supabase/functions/whatsapp-automate/index.ts';

/* Les données d'exemple : une cliente, son numéro, un fil de quinze messages. */
const NUMERO_DIT = '01 97 00 00 00';
const NUMERO_E164 = '+2290197000000';
const CLARISSE = { name: 'Clarisse Dossou', civilite: 'madame' as const, phone: NUMERO_E164 };
const fil = (n: number) => Array.from({ length: n }, (_, i) => ({
  sens: (i % 2 === 0 ? 'entrant' : 'sortant') as 'entrant' | 'sortant',
  texte: `Message numéro ${i + 1}${i === 0 ? ` de Clarisse Dossou, joignable au ${NUMERO_DIT}` : ''}${i === n - 1 ? ` : DOSSOU Clarisse demande un prix, rappel au ${NUMERO_E164}` : ''}`,
}));
const AUJOURDHUI = '2026-10-19';
const CATALOGUE = ['SÍNSIN™ Essentiel : 35 000 F', 'VÈKPÈ™ Jumbo : consultation d’abord, devis remis par écrit après la consultation (aucun prix avant)'];

/* ── 1. L'ANONYMISATION : CE QUI PART CHEZ CLAUDE ─────────────────────── */
{
  const c = contextePourClaude({ fil: fil(15), fiche: CLARISSE, prochainRdv: null, resteDu: 15000, catalogue: CATALOGUE, aujourdhui: AUJOURDHUI });
  dit('la cliente se dit « Clarisse D. », et on dit comment on l appelle : « Madame Clarisse »', [true, true],
    [c.includes('La cliente : Clarisse D.'), c.includes('On l’appelle : Madame Clarisse.')]);
  dit('son nom entier n atteint jamais le contexte, dans aucun ordre', [false, false],
    [/dossou/i.test(c), /Clarisse Dossou|DOSSOU Clarisse/.test(c)]);
  dit('son numéro n atteint jamais le contexte, ni dit, ni au format de Meta', [false, false, false],
    [c.includes(NUMERO_DIT), c.includes('2290197'), /\d(?:[\s.\-]?\d){7,}/.test(c.replace(/\d{4}-\d{2}-\d{2}/g, ''))]);
  dit('le fil se borne aux douze derniers messages, le plus récent en bas', [12, false, true, true, true],
    [FIL_MAX, c.includes('Message numéro 3'), c.includes('Message numéro 4'), c.includes('Message numéro 15'), c.indexOf('Message numéro 4') < c.indexOf('Message numéro 15')]);
  dit('elle parle, la Maison répond : chaque tour dit qui', [true, true], [c.includes('Elle : Message numéro 15'), c.includes('La Maison : Message numéro 14')]);
  dit('le reste dû se dit en francs, sans numéro de pièce', [true, true], [c.includes('Reste dû sur son compte : 15 000 F.'), c.includes('ne cite aucun numéro de pièce')]);
  dit('... et Claude n en parle que si elle en parle : jamais de relance glissée (retard invisible, 18 octobre)', true,
    c.includes('N’en parle QUE si son message porte sur ce qu’elle doit ou sur un règlement'));
  const abime = (resteDu: number) => contextePourClaude({ fil: fil(1), fiche: CLARISSE, resteDu, catalogue: [], aujourdhui: AUJOURDHUI });
  dit('... un reste dû abîmé (négatif, pas un nombre) ne se dit pas du tout ; sans fiche non plus', [false, false, false],
    [/Reste dû|Rien à régler/.test(abime(-5000)), /Reste dû|Rien à régler/.test(abime(Number.NaN)),
      /Reste dû|Rien à régler/.test(contextePourClaude({ fil: fil(1), resteDu: 15000, catalogue: [], aujourdhui: AUJOURDHUI }))]);
  dit('sans rendez-vous à venir, on le dit', true, c.includes('Aucun rendez-vous à venir.'));
  dit('sans agenda, Claude n en promet aucune place et renvoie à la réservation en ligne', [true, true],
    [c.includes('Agenda : non consulté. Ne promets aucune place'), c.includes('maisonmnd.com/reserver/')]);
  dit('aujourd hui se dit avec son année', true, c.includes('Aujourd’hui : lundi 19 octobre 2026.'));
  dit('le catalogue est là, tel quel, et dit qu il est le seul prix permis', [true, true, true],
    [c.includes('- SÍNSIN™ Essentiel : 35 000 F'), c.includes('- VÈKPÈ™ Jumbo : consultation d’abord, devis remis par écrit après la consultation (aucun prix avant)'), c.includes('les seuls prix que tu peux donner')]);
}
{
  const texte = 'Bonjour Clarisse Dossou, rappelez-nous au 01 97 00 00 00 pour votre reprise.';
  const c = contextePourClaude({ fil: fil(2), fiche: CLARISSE, catalogue: [], aujourdhui: AUJOURDHUI, dejaProposee: texte });
  dit('la proposition écartée revient à Claude, mais anonymisée elle aussi (la seconde barrière)', [true, false, false, true],
    [c.includes('Une proposition a déjà été écartée'), /dossou/i.test(c), c.includes(NUMERO_DIT), c.includes('Clarisse D.')]);
}
dit('le fil seul : prénom et initiale, le numéro effacé ; une photo ou un vocal se disent par leur nature, jamais leur contenu ; un vide ne se lit pas',
  ['Elle : Je suis Clarisse D., au [numéro]', 'Elle : [une photo]', 'Elle : [une photo] Et pour ça ?', 'Elle : [un message vocal]', 'La Maison : Bien reçu'],
  filPourClaude([
    { sens: 'entrant', texte: 'Je suis Clarisse Dossou, au 01 97 00 00 00' },
    { sens: 'entrant', texte: 'une photo', type: 'image' },
    { sens: 'entrant', texte: 'Et pour ça ?', type: 'image' },
    { sens: 'entrant', texte: 'un message vocal', type: 'audio' },
    { sens: 'entrant', texte: '   ' },
    { sens: 'sortant', texte: 'Bien reçu' },
  ], [{ prenom: 'Clarisse', nom: 'Dossou' }]));
dit('le fil : le bouton qu elle touche et le modèle parti se lisent ; une réaction, un type inconnu, un message « non remis » ne se lisent pas',
  ['La Maison : Votre rendez-vous de demain tient-il ?', 'Elle : Oui, je confirme', 'Elle : Choisir une autre heure'],
  filPourClaude([
    { sens: 'sortant', texte: 'Votre rendez-vous de demain tient-il ?', type: 'template' },
    { sens: 'entrant', texte: 'Oui, je confirme', type: 'button' },
    { sens: 'entrant', texte: 'Choisir une autre heure', type: 'interactive' },
    { sens: 'entrant', texte: '❤', type: 'reaction' },
    { sens: 'entrant', texte: 'un message que le Trône ne sait pas encore afficher', type: 'unsupported' },
    { sens: 'sortant', texte: 'Ce message n est jamais arrivé', etat: 'non-remis' },
  ], []));
dit('le fil : son nom de famille seul ne passe pas non plus (« Madame Dossou » devient « Madame D. »)',
  ['Elle : C est Madame D., la maman de Clarisse D.'],
  filPourClaude([{ sens: 'entrant', texte: 'C est Madame Dossou, la maman de Clarisse DOSSOU' }], [{ prenom: 'Clarisse', nom: 'Dossou' }]));
{
  const c = contextePourClaude({ fil: [{ sens: 'entrant', texte: 'Bonjour, ici DOSSOU Clarisse' }], fiche: { name: 'DOSSOU Clarisse', civilite: 'madame' }, catalogue: [], aujourdhui: AUJOURDHUI });
  dit('une fiche écrite à la façon des papiers (« DOSSOU Clarisse ») : « Clarisse D. », « Madame Clarisse », et le nom de famille jamais', [true, true, false],
    [c.includes('La cliente : Clarisse D.'), c.includes('On l’appelle : Madame Clarisse.'), /dossou/i.test(c)]);
}
dit('seuls les fils des clientes s ouvrent à Claude : ni l équipe, ni les prestataires, ni un fil marqué privé',
  [true, true, false, false, false, false],
  [filOuvertAClaude({ tiroir: 'clientes', prive: false }), filOuvertAClaude({ prive: false }), filOuvertAClaude({ tiroir: 'equipe', prive: false }),
    filOuvertAClaude({ tiroir: 'prestataires', prive: false }), filOuvertAClaude({ tiroir: 'clientes', prive: true }), filOuvertAClaude(null)]);
dit('une fiche muette dit le prénom seul (jamais « Madame » supposé) ; un monsieur se dit « Lui »', [true, true, true],
  [contextePourClaude({ fil: fil(1), fiche: { name: 'Ola Kossou' }, catalogue: [], aujourdhui: AUJOURDHUI }).includes('On l’appelle : Ola.'),
    contextePourClaude({ fil: fil(1), fiche: { name: 'Koffi Agbo', civilite: 'monsieur' }, catalogue: [], aujourdhui: AUJOURDHUI }).includes('On l’appelle : Monsieur Koffi.'),
    contextePourClaude({ fil: fil(1), fiche: { name: 'Koffi Agbo', civilite: 'monsieur' }, catalogue: [], aujourdhui: AUJOURDHUI }).includes('Lui : Message numéro 1')]);
{
  const sansFiche = contextePourClaude({ fil: [{ sens: 'entrant', texte: 'Bonjour, Awa Dossou, sœur de Madame DOSSOU' }], nomProfil: 'Awa Dossou', catalogue: [], aujourdhui: AUJOURDHUI });
  dit('sans fiche, le nom du profil WhatsApp se dit en initiale, et rien de connu de plus', [true, true, false, true],
    [sansFiche.includes('La cliente : Awa D.'), sansFiche.includes('On l’appelle : Awa.'), /dossou/i.test(sansFiche), sansFiche.includes('Elle n’a pas de fiche à la Maison')]);
  const numerique = contextePourClaude({ fil: fil(1), nomProfil: '+229 01 97 00 00 00', catalogue: [], aujourdhui: AUJOURDHUI });
  dit('un profil qui n est qu un numéro ne se dit pas : « sans fiche », « Madame, Monsieur », aucun chiffre', [true, true, false],
    [numerique.includes('La cliente : sans fiche.'), numerique.includes('On l’appelle : Madame, Monsieur.'), /\d/.test(numerique.split('\n')[1])]);
}

/* ── 2. LA FICHE : RENDEZ-VOUS, VENUE, DATES AVEC L'ANNÉE ─────────────── */
{
  const appts = [
    { date: '2026-10-25', time: '09:00', status: 'confirmé', clientId: 'c1', serviceIds: ['s-ess'] },
    { date: '2026-10-21', time: '14:00', status: 'en attente', clientId: 'c1', serviceIds: ['s-ess', 's-lav'] },
    { date: '2026-10-20', time: '10:00', status: 'annulé', clientId: 'c1', serviceIds: ['s-ess'] },
    { date: '2026-10-22', time: '11:00', status: 'confirmé', clientId: 'c2', serviceIds: ['s-ess'] },
    { date: '2026-09-10', time: '10:00', status: 'honoré', clientId: 'c1', serviceIds: ['s-ess'] },
    { date: '2026-08-01', time: '10:00', status: 'honoré', clientId: 'c1', serviceIds: ['s-lav'] },
  ];
  const nomDe = (id: string) => ({ 's-ess': 'SÍNSIN™ Essentiel', 's-lav': 'Lavage' } as Record<string, string>)[id] ?? '';
  dit('le prochain rendez-vous : le plus proche, confirmé ou en attente, jamais annulé ni d une autre', { date: '2026-10-21', time: '14:00', gestes: ['SÍNSIN™ Essentiel', 'Lavage'] },
    prochainRdvDe(appts, 'c1', AUJOURDHUI, nomDe));
  dit('la dernière venue : la plus récente honorée', { date: '2026-09-10', gestes: ['SÍNSIN™ Essentiel'] }, derniereVenueDe(appts, 'c1', AUJOURDHUI, nomDe));
  dit('personne d autre : rien', [null, null], [prochainRdvDe(appts, 'c9', AUJOURDHUI), derniereVenueDe(appts, 'c9', AUJOURDHUI)]);
  const c = contextePourClaude({ fil: fil(1), fiche: CLARISSE, prochainRdv: prochainRdvDe(appts, 'c1', AUJOURDHUI, nomDe), derniereVenue: derniereVenueDe(appts, 'c1', AUJOURDHUI, nomDe), resteDu: 0, catalogue: [], aujourdhui: AUJOURDHUI });
  dit('le rendez-vous et la venue se disent avec l année, et les gestes', [true, true, true],
    [c.includes('Son prochain rendez-vous : mercredi 21 octobre 2026 à 14:00 (SÍNSIN™ Essentiel, Lavage).'), c.includes('Sa dernière venue : jeudi 10 septembre 2026 (SÍNSIN™ Essentiel).'), c.includes('Rien à régler : son compte est soldé.')]);
  dit('une date se dit avec son année, toujours ; une date abîmée ne se dit pas', ['mercredi 21 octobre 2026 à 14:00', 'vendredi 1 janvier 2027', ''],
    [dateDitePourClaude('2026-10-21', '14:00'), dateDitePourClaude('2027-01-01'), dateDitePourClaude('demain')]);
}

/* ── 3. L'AGENDA : LES PLACES, DANS L'ORDRE DU SITE ───────────────────── */
{
  const heures = [{ heure: '10:00' }, { heure: '09:00' }, { heure: '14:00' }];
  const jours = ['2026-10-23', '2026-10-20', '2026-10-21', '2026-10-22'].map((iso) => ({ iso, heures }));
  const c = contextePourClaude({ fil: fil(1), fiche: CLARISSE, places: jours, catalogue: [], aujourdhui: AUJOURDHUI });
  const ligne = c.split('\n').find((l) => l.startsWith('Prochaines places libres')) ?? '';
  dit('les places : six, deux par jour d abord (la première du matin, la première de l après-midi), dans l ordre du temps',
    'Prochaines places libres (les seules que tu peux proposer) : mardi 20 octobre 2026 à 09:00 ; mardi 20 octobre 2026 à 14:00 ; mercredi 21 octobre 2026 à 09:00 ; mercredi 21 octobre 2026 à 14:00 ; jeudi 22 octobre 2026 à 09:00 ; jeudi 22 octobre 2026 à 14:00.',
    ligne);
  dit('... le quatrième jour et les 10:00 ne s y trouvent pas', [false, false], [ligne.includes('23 octobre'), ligne.includes('10:00')]);
  dit('agenda consulté mais vide : rien de promis, la Maison rappelle', true,
    contextePourClaude({ fil: fil(1), fiche: CLARISSE, places: [], catalogue: [], aujourdhui: AUJOURDHUI }).includes('Agenda consulté : aucune place libre prochainement. Ne promets rien'));
  /* Une place se propose à partir de demain, comme le site : ni aujourd'hui, ni hier. */
  const passees = contextePourClaude({ fil: fil(1), fiche: CLARISSE, places: [{ iso: '2026-10-18', heures }, { iso: AUJOURDHUI, heures }, { iso: 'demain', heures }], catalogue: [], aujourdhui: AUJOURDHUI });
  dit('... une place d hier, du jour même ou à la date abîmée ne part jamais : l agenda se dit alors vide', [false, false, true],
    [passees.includes('18 octobre 2026'), passees.includes('lundi 19 octobre 2026 à'), passees.includes('Agenda consulté : aucune place libre prochainement.')]);
}

/* ── 4. LE CATALOGUE : LES PRIX DU JOUR, « À PARTIR DE » POUR UNE CRÉATION ── */
{
  const cats = [{ id: 'atl-i-vekpe' }, { id: 'atl-iv-finfin' }, { id: 'finfin-enfant', parentId: 'atl-iv-finfin' }, { id: 'atl-ii' }, { id: 'koko' }];
  const services = [
    { id: 'sv-atl-ii-e', name: 'SÍNSIN™ Essentiel', categoryId: 'atl-ii', priceXof: 35000, hidePrice: false },
    { id: 'sv-atl-i-jum', name: 'VÈKPÈ™ Jumbo', categoryId: 'atl-i-vekpe', priceXof: 135000, hidePrice: false },
    { id: 'sv-rep', name: 'FÍNFÍN™ Reprise', categoryId: 'finfin-enfant', priceXof: 50000, hidePrice: false },
    { id: 'sv-regard', name: 'Soin sur mesure', categoryId: 'atl-ii', priceXof: 20000, hidePrice: false, consultationAvant: true },
    { id: 'sv-devis', name: 'Extensions', categoryId: 'atl-ii', priceXof: 0, hidePrice: false, priceMode: 'devis' as const },
    { id: 'sv-cache', name: 'Prix caché', categoryId: 'atl-ii', priceXof: 99000, hidePrice: true },
    { id: 'sv-vieux', name: 'Archivée', categoryId: 'atl-ii', priceXof: 10000, hidePrice: false, archived: true },
    { id: 'sv-koko-ori', name: 'KÒKÒ™ Origine', categoryId: 'koko', priceXof: 5000, hidePrice: false },
    { id: 'sv-var', name: 'Lavage profond', categoryId: 'atl-ii', priceXof: 8000, hidePrice: false, priceMode: 'variable' as const },
  ];
  const AUCUN = 'consultation d’abord, devis remis par écrit après la consultation (aucun prix avant)';
  dit('un entretien au prix du catalogue ; une création, une réparation, une « consultation avant », un devis : AUCUN prix, la consultation puis le devis écrit ; un prix variable : « à partir de » ; masquée et archivée : rien',
    ['SÍNSIN™ Essentiel : 35 000 F', `VÈKPÈ™ Jumbo : ${AUCUN}`, `FÍNFÍN™ Reprise : ${AUCUN}`, `Soin sur mesure : ${AUCUN}`, `Extensions : ${AUCUN}`, 'KÒKÒ™ Origine : 5 000 F', 'Lavage profond : à partir de 8 000 F'],
    lignesDuCataloguePourClaude(services, cats));
  dit('... aucun montant ne survit pour une création ou une réparation, même porteur d un prix de palier', [false, false],
    [lignesDuCataloguePourClaude([{ ...services[1], prixParPalier: [{ palier: 'jusqu’à 80 locks', prixXof: 135000 }] }], cats)[0].includes('F'),
      lignesDuCataloguePourClaude([{ ...services[2], prixPourElle: 50000 }], cats)[0].includes('50 000')]);
  const paliers = [{ palier: 'jusqu’à 80 locks', prixXof: 35000 }, { palier: '81 à 150 locks', prixXof: 40000 }, { palier: 'plus de 550 locks', prixXof: 60000 }];
  dit('le reste au prix de la carte PAR PALIER de locks ; un prix qui ne bouge pas se dit seul ; son prix à elle quand son nombre est connu',
    ['SÍNSIN™ Essentiel, selon le nombre de locks : jusqu’à 80 locks, 35 000 F ; 81 à 150 locks, 40 000 F ; plus de 550 locks, 60 000 F', 'KÒKÒ™ Origine : 5 000 F', 'SÍNSIN™ Essentiel : 40 000 F pour elle, d’après son nombre de locks'],
    [lignesDuCataloguePourClaude([{ ...services[0], prixParPalier: paliers }], cats)[0],
      lignesDuCataloguePourClaude([{ ...services[7], prixParPalier: [{ palier: 'jusqu’à 80 locks', prixXof: 5000 }, { palier: '81 à 150 locks', prixXof: 5000 }] }], cats)[0],
      lignesDuCataloguePourClaude([{ ...services[0], prixParPalier: paliers, prixPourElle: 40000 }], cats)[0]]);
  dit('les paliers se nomment comme sur la réservation du site, et chacun a son nombre représentatif', [['jusqu’à 80 locks', 80], ['81 à 150 locks', 150], ['plus de 550 locks', 650]],
    paliersDeLocks([{ id: 'c', maxLocks: 550 }, { id: 'a', maxLocks: 80 }, { id: 'b', maxLocks: 150 }, { id: 'd', maxLocks: null }]).filter((x) => x.id !== 'c').map((x) => [x.palier, x.locks]));
  dit('sans catalogue, Claude ne donne aucun montant', true,
    contextePourClaude({ fil: fil(1), fiche: CLARISSE, catalogue: [], aujourdhui: AUJOURDHUI }).includes('Catalogue : aucun prix disponible. Ne donne aucun montant'));
}

/* ── LA VOIX DU 27 OCTOBRE 2026 : SON NOMBRE DE LOCKS, LES LIENS, LA CIVILITÉ ── */
{
  const base = { fil: fil(2), fiche: CLARISSE, catalogue: CATALOGUE, aujourdhui: AUJOURDHUI };
  dit('son nombre de locks : compté à la Maison, sinon annoncé par elle, sinon à lui demander', [true, true, true],
    [contextePourClaude({ ...base, locks: { compte: 140, declare: 90 } }).includes('Son nombre de locks, compté à la Maison : environ 140.'),
      contextePourClaude({ ...base, locks: { declare: 90 } }).includes('Son nombre de locks, annoncé par elle : environ 90 (pas encore compté à la Maison).'),
      contextePourClaude(base).includes('Son nombre de locks : inconnu. Avant tout prix qui en dépend, demande-le-lui, approximativement.')]);
  const c = contextePourClaude(base);
  dit('les trois liens de la Maison, tels que le site les ouvre', [true, true, true, 'https://maisonmnd.com/reserver/?besoin=entretien'],
    [c.includes(LIENS_DE_LA_MAISON.catalogue), c.includes(LIENS_DE_LA_MAISON.creation), c.includes(LIENS_DE_LA_MAISON.reparation), LIENS_DE_LA_MAISON.catalogue]);
  dit('une fiche sans civilité notée le dit ; une civilité notée ne le dit pas', [true, false],
    [contextePourClaude({ ...base, fiche: { name: 'Clarisse Dossou' } }).includes('Sa civilité n’est pas notée sur sa fiche.'), c.includes('Sa civilité n’est pas notée')]);
  dit('un lien de la Maison passe la lecture (aucun numéro, aucun mot banni)', 'Avec plaisir. Nos soins et leurs prix : https://maisonmnd.com/reserver/?besoin=entretien',
    lectureDeLaReponse({ reponse: 'Avec plaisir. Nos soins et leurs prix : https://maisonmnd.com/reserver/?besoin=entretien' }));
}

/* ── 5. LA CONSIGNE : LA VOIX DE LA MAISON ET SES INTERDITS ───────────── */
{
  const c = consigneDeLaReponse();
  dit('elle propose, elle n envoie rien ; la Maison, jamais « salon » ; le vouvoiement', [true, true, true],
    [c.includes('tu PROPOSES, tu n’envoies rien'), c.includes('On dit « la Maison », JAMAIS « salon »'), c.includes('Le vouvoiement, toujours')]);
  dit('les prix comme sur maisonmnd.com : création et réparation, la consultation puis le devis écrit, aucun « à partir de » ; le reste au prix de la carte, avec le lien du catalogue ; son nombre de locks demandé avant tout prix',
    [true, true, true, true, false],
    [c.includes('Une création de locks ou une réparation commence TOUJOURS par une consultation. N’en donne AUCUN prix, ni « à partir de »'),
      c.includes('la Maison remet son devis par écrit après la consultation'),
      c.includes('Tu peux donner le lien du catalogue en ligne'),
      c.includes('demande-lui d’abord, avec délicatesse, combien de locks elle porte approximativement, sans citer de montant'),
      c.includes('le prix se dit toujours « à partir de »')]);
  dit('la voix premium de la Maison : une maison d exception, jamais familière ni commerciale, un exemple du ton', [true, true, true],
    [c.includes('celle d’une maison d’exception : élégante, posée, attentionnée'), c.includes('Jamais familière, jamais commerciale, jamais pressante'), c.includes('Le ton, par exemple : « Avec plaisir, Madame Clarisse.')]);
  dit('pour inscrire un rendez-vous : comment devons-nous vous appeler, puis Madame ou Monsieur, jamais une civilité supposée', true,
    c.includes('« Pour inscrire votre rendez-vous, comment devons-nous vous appeler ? », puis « Madame ou Monsieur ? »'));
  dit('jamais une place promise sans l agenda ; la réservation en ligne sinon', [true, true],
    [c.includes('ne promets JAMAIS une place, une heure ni un jour qui ne figure pas dans l’agenda'), c.includes('maisonmnd.com/reserver/')]);
  dit('pas de diagnostic du cuir chevelu : on invite à passer ou à consulter', [true, true],
    [c.includes('Le cuir chevelu et les cheveux : aucun diagnostic ni avis à distance'), c.includes('Invite à passer à la Maison ou à prendre une consultation')]);
  dit('jamais un numéro de facture, de reçu, de devis, ni de téléphone', true, c.includes('Ne cite JAMAIS un numéro de facture, de reçu ou de devis, ni aucun numéro de téléphone'));
  dit('ce qu elle doit : jamais de soi-même, aucune relance (ne pas faire voir le retard)', [true, true],
    [c.includes('Ce qu’elle doit : n’en parle jamais de toi-même'), c.includes('aucune relance')]);
  dit('une photo ou un vocal : Claude ne les voit pas, ne décrit ni ne juge rien', [true, true],
    [c.includes('tu ne les vois pas et ne les entends pas'), c.includes('Ne décris rien, ne juge rien')]);
  dit('pas d émoji, pas de tiret long, 70 mots au plus, rien d inventé, pas de signature', [true, true, true, true, true],
    [c.includes('Pas d’émoji'), c.includes('pas de tiret long'), c.includes(`${MOTS_MAX} mots au plus`) && MOTS_MAX === 70, c.includes('N’invente rien'), c.includes('Ne signe pas')]);
  dit('le schéma attend un seul champ : la réponse', [['reponse'], 'object', false],
    [SCHEMA_DE_LA_REPONSE.required, SCHEMA_DE_LA_REPONSE.type, SCHEMA_DE_LA_REPONSE.additionalProperties]);
}

/* ── 6. LA LECTURE : CE QUE CLAUDE A ÉCRIT, AVANT QU'ON LE RELISE ─────── */
{
  const bonne = 'Bonjour Madame Clarisse, votre resserrage SÍNSIN™ Essentiel est à 35 000 F. Votre rendez-vous du mercredi 21 octobre 2026 à 14:00 est bien noté. À très vite à la Maison.';
  dit('une bonne réponse passe telle quelle, par l objet du schéma ou par un texte nu', [bonne, bonne], [lectureDeLaReponse({ reponse: bonne }), lectureDeLaReponse(bonne)]);
  dit('un numéro de téléphone : refusée, dit ou au format de Meta', [null, null],
    [lectureDeLaReponse({ reponse: 'Appelez-nous au 01 97 00 00 00.' }), lectureDeLaReponse({ reponse: 'WhatsApp +2290197000000' })]);
  dit('un numéro de facture ou de reçu : refusée', [null, null],
    [lectureDeLaReponse({ reponse: 'Votre facture MND-2026-0042 reste à régler.' }), lectureDeLaReponse({ reponse: 'Reçu n° 20261019001 ci-joint.' })]);
  dit('... même court : un devis, une pièce du rituel, une commande, une ancienne série, un « n° 42 »', [null, null, null, null, null],
    [lectureDeLaReponse({ reponse: 'Le devis MND-D-2026-7 est prêt.' }), lectureDeLaReponse({ reponse: 'Votre pièce F-2026-12 est soldée.' }),
      lectureDeLaReponse({ reponse: 'Commande CMD-4821 partie.' }), lectureDeLaReponse({ reponse: 'Ancienne facture mnd-v-310.' }),
      lectureDeLaReponse({ reponse: 'Voir la facture n° 42.' })]);
  dit('le mot banni, au singulier, au pluriel, en majuscules : refusée', [null, null, null],
    [lectureDeLaReponse({ reponse: 'Venez au salon demain.' }), lectureDeLaReponse({ reponse: 'Nos Salons vous attendent.' }), lectureDeLaReponse({ reponse: 'SALON ouvert.' })]);
  dit('vide, blanc, absent, un nombre, un objet sans texte : rien', [null, null, null, null, null],
    [lectureDeLaReponse({ reponse: '' }), lectureDeLaReponse({ reponse: '   ' }), lectureDeLaReponse(null), lectureDeLaReponse(42), lectureDeLaReponse({ reponse: 7 })]);
  dit('le tiret long devient une virgule, le gras et les émojis tombent', 'La Maison vous reçoit, du lundi au samedi. À bientôt',
    lectureDeLaReponse({ reponse: 'La Maison vous reçoit — du lundi au samedi. **À bientôt** 😊✨' }));
  dit('... mais les signes des marques restent : « SÍNSIN™ », « ® », « © »', 'SÍNSIN™ Essentiel et KÒKÒ® Origine, © la Maison.',
    lectureDeLaReponse({ reponse: 'SÍNSIN™ Essentiel et KÒKÒ® Origine, © la Maison. 🌿' }));
  dit('un prix de la Maison et une date ISO ne sont pas des numéros', ['Comptez 135 000 F, le 2026-10-21.', 'Un VÈKPÈ™ Jumbo commence à 1 350 000 F.'],
    [lectureDeLaReponse({ reponse: 'Comptez 135 000 F, le 2026-10-21.' }), lectureDeLaReponse({ reponse: 'Un VÈKPÈ™ Jumbo commence à 1 350 000 F.' })]);
  const phrase = 'Votre couronne mérite ce soin et nous serons heureuses de vous recevoir bientôt à la Maison.';
  const longue = Array.from({ length: 6 }, () => phrase).join(' ');
  const coupee = lectureDeLaReponse({ reponse: longue }) ?? '';
  /* Seize mots par phrase, comptés à la main : quatre tiennent (64), la cinquième ferait 80 > 70. */
  dit('trop longue : coupée aux phrases, soixante-dix mots au plus, finie par un point (quatre phrases de seize mots)', [true, true, true, 64],
    [motsDe(coupee) <= MOTS_MAX, coupee.length <= SIGNES_MAX, coupee.endsWith('.'), motsDe(coupee)]);
  const uneSeule = Array.from({ length: 90 }, (_, i) => `mot${i}`).join(' ');
  const c1 = lectureDeLaReponse({ reponse: uneSeule }) ?? '';
  dit('une seule phrase trop longue : coupée au mot, avec des points', [true, true, true], [motsDe(c1) <= MOTS_MAX, c1.endsWith('…'), c1.startsWith('mot0 mot1')]);
  dit('les sauts de ligne se fondent : un message WhatsApp, pas une lettre', 'Bonjour Madame Clarisse, bien reçu. À bientôt.',
    lectureDeLaReponse({ reponse: 'Bonjour Madame Clarisse,\n\nbien reçu.\nÀ bientôt.' }));
}

/* ── 6 bis. LA ZONE DE SAISIE : LA PROPOSITION À VÉRIFIER, LA MAIN PROTÉGÉE ── */
{
  const p = 'Bonjour Madame Clarisse, bien reçu.';
  dit('la zone : vide ; la proposition mot pour mot (à vérifier) ; un mot changé (la sienne) ; écrite seule', ['vide', 'proposee', 'retouchee', 'a-la-main', 'vide'],
    [etatDeLaZone('', p), etatDeLaZone(p, p), etatDeLaZone('Bonjour Madame Clarisse, bien reçu, merci.', p), etatDeLaZone('Je vous rappelle.', null), etatDeLaZone('   ', null)]);
  dit('une proposition ne remplace jamais en silence ce que la main a écrit ou retouché ; elle remplace la sienne, ou une zone vide', [true, true, false, false],
    [zoneAProteger('Je vous rappelle.', null), zoneAProteger('Bonjour Madame Clarisse, bien reçu, merci.', p), zoneAProteger(p, p), zoneAProteger('', p)]);
}

/* ── 7. LA PORTE : QUI PEUT DEMANDER (la direction, la Clientèle) ──────── */
dit('les réponses WhatsApp sont au département Clientèle, et à lui seul', ['dept-clientele'], DEPARTEMENTS_PAR_CHANTIER['reponse-wa']);
dit('la direction demande ; un maître, s il a la Clientèle ; les Finances n y donnent pas droit ; sans rôle, personne',
  [true, true, false, true, false, false],
  [peutDemander('souverain', 'reponse-wa', {}), peutDemander('gerant', 'reponse-wa', undefined), peutDemander('maitre', 'reponse-wa', {}),
    peutDemander('maitre', 'reponse-wa', { 'dept-clientele': true }), peutDemander('maitre', 'reponse-wa', { 'dept-finances': true }), peutDemander(undefined, 'reponse-wa', { 'dept-clientele': true })]);

/* ── 8. LA STRUCTURE : LE BOUTON DANS LE COMPOSEUR, L'ENVOI EXISTANT, L'AUTOMATE INTACT ── */
{
  const conv = sansCommentaires(lis(COMPOSEUR));
  dit('le composeur du fil (ComposeurWhatsApp) importe le composant, et le monte une fois', [true, 1],
    [/import \{ ReponseProposee \} from '\.\/ReponseProposee';/.test(conv), (conv.match(/<ReponseProposee\b/g) ?? []).length]);
  const iSaisie = conv.indexOf('className="trc-saisie__envoi"');
  const iComp = conv.indexOf('<ReponseProposee');
  const iEnvoyer = conv.indexOf("{envoiEnCours ? 'Envoi…' : 'Envoyer'}");
  dit('... dans le composeur du fil ouvert, avant le bouton Envoyer', true, iSaisie > 0 && iComp > iSaisie && iEnvoyer > iComp && iEnvoyer - iSaisie < 2000);
  /* La zone est tenue par l'hôte (`surTexte`, LesConversations) depuis le 27 octobre 2026 : la proposition la remplit par lui. */
  dit('... la proposition remplit la zone de saisie existante (la zone vidée sans réveiller personne), et l équipe prend la main sur l automate', true,
    /<ReponseProposee key=\{fil\.numero\} fil=\{fil\} texte=\{texte\} occupe=\{envoiEnCours\} surProposition=\{\(t\) => \{ if \(t\) prendsLaMain\('proposition'\); surTexte\(t\); \}\} \/>/.test(conv));
  dit('... « Envoyer » est le bouton qui existait, inchangé, par `envoie()`', true,
    /disabled=\{!!refus \|\| envoiEnCours\}\s*onClick=\{\(\) => void envoie\(\)\}\s*>\s*\{envoiEnCours \? 'Envoi…' : 'Envoyer'\}/.test(conv));

  const comp = sansCommentaires(lis(COMPOSANT));
  dit('le composant se tait sans la fonction posée, pour qui n a pas le chantier, et hors des fils des clientes', [true, true],
    [/const sait = useSaitIaMaison\(\);/.test(comp),
      /if \(sait !== true \|\| !filOuvertAClaude\(fil\) \|\| !peutDemander\(moi\?\.role, 'reponse-wa', acces\[moi\?\.user_id \?\? ''\]\)\) return null;/.test(comp)]);
  const crochets = [...comp.matchAll(/\buse[A-Z]\w*\(/g)].map((m) => m.index ?? 0);
  dit('... tous ses crochets viennent avant son premier retour', true, crochets.length >= 12 && Math.max(...crochets) < comp.indexOf('return null;'));
  dit('... il demande à Claude par la porte commune : chantier reponse-wa, usage texte, la consigne, le schéma, et relit la réponse', [true, true, true, true],
    [/chantier: 'reponse-wa', usage: 'texte', systeme: consigneDeLaReponse\(\)/.test(comp), /schema: SCHEMA_DE_LA_REPONSE/.test(comp),
      /const proposee = lectureDeLaReponse\(r\.data\);/.test(comp), /contextePourClaude\(\{/.test(comp)]);
  dit('... la proposition va dans la zone (surProposition), jamais au départ : aucun envoi, aucune écriture', [true, false, false],
    [/surProposition\(proposee\);/.test(comp), /\benvoie\(|functions\.invoke|whatsapp-envoi|appelleOuGarde|\.insert\(|\.upsert\(|Store\.set\(|poseLaMain/.test(comp), /'Envoyer'|>Envoyer</.test(comp)]);
  dit('... ses boutons : « Proposer une réponse », « Une autre », « Écarter » (qui vide la zone)', [true, true, true, true],
    [comp.includes("'Proposer une réponse'"), comp.includes("'Une autre'"), comp.includes('onClick={ecarter}>Écarter<'), /const ecarter = \(\) => \{[^}]*surProposition\(''\);/.test(comp)]);
  dit('... « Une autre » dit à Claude ce qu on a écarté', true, /const aEcarter = zone === 'proposee' \|\| zone === 'retouchee' \? derniere : ecartee;/.test(comp) && /dejaProposee: aEcarter \?\? undefined/.test(comp));
  dit('... ce que la main a écrit ne se remplace qu après lui avoir demandé ; ce qu elle écrit pendant que Claude cherche reste', [true, true],
    [/if \(zoneAProteger\(texte, derniere\) && !await demande\(\{/.test(comp), /if \(zoneVive\.current !== auDepart && zoneAProteger\(zoneVive\.current, derniere\)\) \{[^}]*return;/.test(comp)]);
  const iVivant = comp.indexOf('if (!vivant.current) return;');
  dit('... une réponse arrivée après qu on a quitté le fil ne se pose pas dans la zone d un autre', true,
    iVivant > comp.indexOf('await demandeAClaude') && iVivant < comp.indexOf('surProposition(proposee);') && /return \(\) => \{ vivant\.current = false; \};/.test(comp));
  dit('... le reste dû est celui de sa fiche, du même juge que le compte (le rituel fait foi), jamais les factures seules', [true, false],
    [/lignesImpayees\(ecrituresDeLaTete\(ecrituresDuCompte\(\{/.test(comp) && /netDuRituel: \(a\) => apptNetXof\(a, byId\), dûDuRituel: \(a\) => apptDueXof\(a, byId\)/.test(comp) && /\}\), fiche\.id\)\)\.reduce\(\(s, l\) => s \+ l\.resteXof, 0\)/.test(comp),
      /invoiceResteXof/.test(comp)]);
  dit('... la zone qui porte la proposition se dit « à vérifier » et se teinte cuivre', [true, true, true],
    [/data-reponse-proposee=\{etat === 'cherche' \? 'cherche' : zone === 'proposee' \? 'a-verifier' : 'prete'\}/.test(comp),
      comp.includes("import './reponse-proposee.css';"),
      /\.trc-saisie:has\(\.trc-reponse-proposee\[data-reponse-proposee="a-verifier"\]\) > \.trc-saisie__texte \{[^}]*var\(--copper-50/.test(lis(CSS))]);

  const pur = sansCommentaires(lis(PUR));
  dit('le module pur réutilise les prix de l automate et la porte de la qualification : une seule règle des prix', [true, true, true],
    [/import \{ prixDuCatalogue, prixDitWa \} from '\.\/automate-wa';/.test(pur), /import \{ porteDe \} from '\.\/qualification';/.test(pur), /import \{ prochainesPlaces \} from '\.\/reservation-express';/.test(pur)]);
  dit('... et il est pur : ni magasin, ni réseau, ni React', false, /from '\.\/(supabase|store|sync)'|from 'react'/.test(pur));
  dit('... l anonymisation vient de ia-anonymise-pur et la civilité de civilite', [true, true],
    [/import \{ prenomEtInitiale, pourClaude, type Personne \} from '\.\/ia-anonymise-pur';/.test(pur), /import \{ appelDe \} from '\.\/civilite';/.test(pur)]);

  const auto = lis(AUTOMATE);
  const edge = lis(AUTOMATE_EDGE);
  dit('l automate de réservation ne change pas : il ne sait rien de ce chantier, ni au Trône ni dans sa copie Edge', [false, false],
    [/ia-reponse-wa|demandeAClaude|ia-maison|consigneDeLaReponse/.test(auto), /ia-reponse-wa|demandeAClaude|ia-maison|consigneDeLaReponse/.test(edge)]);
}

console.log(ko === 0 ? '\nTOUT VA BIEN : la réponse proposée tient ses promesses.' : `\n${ko} ÉCHEC(S)`);
if (ko) process.exitCode = 1;
