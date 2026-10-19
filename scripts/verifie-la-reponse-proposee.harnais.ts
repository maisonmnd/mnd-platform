/* LA RÉPONSE WHATSAPP PROPOSÉE, ÉPROUVÉE — `node scripts/verifie-la-reponse-proposee.mjs`.

   19 octobre 2026, chantier 4 des huit (maquette NKQMiMMY… validée) :
   « Dans Conversations : "Proposer une réponse". Claude lit le fil, sa fiche
   (civilité, prochain rendez-vous, reste dû), l'agenda et le catalogue, et
   écrit dans la voix de la Maison. Vous relisez, changez un mot, envoyez.
   Rien ne part seul : l'automate de réservation reste comme il est. »
   Prix : ceux du catalogue, « à partir de » pour les créations (14 octobre).
   Chez Claude : prénom et initiale, jamais un numéro (11 octobre).

   LES ATTENTES SONT ÉCRITES À LA MAIN d'après ces décisions, jamais déduites
   du code. Données d'exemple. */
import { readFileSync } from 'node:fs';
import {
  FIL_MAX, MOTS_MAX, SIGNES_MAX, SCHEMA_DE_LA_REPONSE,
  consigneDeLaReponse, contextePourClaude, dateDitePourClaude, derniereVenueDe, filPourClaude,
  lectureDeLaReponse, lignesDuCataloguePourClaude, motsDe, prochainRdvDe,
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
const CONVERSATIONS = 'src/apps/trone/routes/clients/Conversations.tsx';
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
const CATALOGUE = ['SÍNSIN™ Essentiel : 35 000 F', 'VÈKPÈ™ Jumbo : à partir de 135 000 F'];

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
  dit('le reste dû se dit en francs, sans numéro de pièce', [true, true], [c.includes('Reste dû sur ses factures : 15 000 F'), c.includes('ne cite aucun numéro de pièce')]);
  dit('sans rendez-vous à venir, on le dit', true, c.includes('Aucun rendez-vous à venir.'));
  dit('sans agenda, Claude n en promet aucune place et renvoie à la réservation en ligne', [true, true],
    [c.includes('Agenda : non consulté. Ne promets aucune place'), c.includes('maisonmnd.com/reserver/')]);
  dit('aujourd hui se dit avec son année', true, c.includes('Aujourd’hui : lundi 19 octobre 2026.'));
  dit('le catalogue est là, tel quel, et dit qu il est le seul prix permis', [true, true, true],
    [c.includes('- SÍNSIN™ Essentiel : 35 000 F'), c.includes('- VÈKPÈ™ Jumbo : à partir de 135 000 F'), c.includes('les seuls prix que tu peux donner')]);
}
{
  const texte = 'Bonjour Clarisse Dossou, rappelez-nous au 01 97 00 00 00 pour votre reprise.';
  const c = contextePourClaude({ fil: fil(2), fiche: CLARISSE, catalogue: [], aujourdhui: AUJOURDHUI, dejaProposee: texte });
  dit('la proposition écartée revient à Claude, mais anonymisée elle aussi (la seconde barrière)', [true, false, false, true],
    [c.includes('Une proposition a déjà été écartée'), /dossou/i.test(c), c.includes(NUMERO_DIT), c.includes('Clarisse D.')]);
}
dit('le fil seul : prénom et initiale, le numéro effacé, une photo ou un vocal ne se lisent pas',
  ['Elle : Je suis Clarisse D., au [numéro]', 'La Maison : Bien reçu'],
  filPourClaude([
    { sens: 'entrant', texte: 'Je suis Clarisse Dossou, au 01 97 00 00 00' },
    { sens: 'entrant', texte: '[photo]', type: 'image' },
    { sens: 'entrant', texte: '   ' },
    { sens: 'sortant', texte: 'Bien reçu' },
  ], [{ prenom: 'Clarisse', nom: 'Dossou' }]));
dit('une fiche muette dit le prénom seul (jamais « Madame » supposé) ; un monsieur se dit « Lui »', [true, true, true],
  [contextePourClaude({ fil: fil(1), fiche: { name: 'Ola Kossou' }, catalogue: [], aujourdhui: AUJOURDHUI }).includes('On l’appelle : Ola.'),
    contextePourClaude({ fil: fil(1), fiche: { name: 'Koffi Agbo', civilite: 'monsieur' }, catalogue: [], aujourdhui: AUJOURDHUI }).includes('On l’appelle : Monsieur Koffi.'),
    contextePourClaude({ fil: fil(1), fiche: { name: 'Koffi Agbo', civilite: 'monsieur' }, catalogue: [], aujourdhui: AUJOURDHUI }).includes('Lui : Message numéro 1')]);
{
  const sansFiche = contextePourClaude({ fil: fil(1), nomProfil: 'Awa Dossou', catalogue: [], aujourdhui: AUJOURDHUI });
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
    [c.includes('Son prochain rendez-vous : mercredi 21 octobre 2026 à 14:00 (SÍNSIN™ Essentiel, Lavage).'), c.includes('Sa dernière venue : jeudi 10 septembre 2026 (SÍNSIN™ Essentiel).'), c.includes('Rien à régler : ses factures sont soldées.')]);
  dit('une date se dit avec son année, toujours ; une date abîmée ne se dit pas', ['mercredi 21 octobre 2026 à 14:00', 'jeudi 1 janvier 2027', ''],
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
  ];
  dit('un entretien au prix du catalogue ; une création, une réparation, une « consultation avant » : « à partir de » ; un devis le dit ; masquée et archivée : rien',
    ['SÍNSIN™ Essentiel : 35 000 F', 'VÈKPÈ™ Jumbo : à partir de 135 000 F', 'FÍNFÍN™ Reprise : à partir de 50 000 F', 'Soin sur mesure : à partir de 20 000 F', 'Extensions : sur devis, après consultation', 'KÒKÒ™ Origine : 5 000 F'],
    lignesDuCataloguePourClaude(services, cats));
  dit('sans catalogue, Claude ne donne aucun montant', true,
    contextePourClaude({ fil: fil(1), fiche: CLARISSE, catalogue: [], aujourdhui: AUJOURDHUI }).includes('Catalogue : aucun prix disponible. Ne donne aucun montant'));
}

/* ── 5. LA CONSIGNE : LA VOIX DE LA MAISON ET SES INTERDITS ───────────── */
{
  const c = consigneDeLaReponse();
  dit('elle propose, elle n envoie rien ; la Maison, jamais « salon » ; le vouvoiement', [true, true, true],
    [c.includes('tu PROPOSES, tu n’envoies rien'), c.includes('On dit « la Maison », JAMAIS « salon »'), c.includes('Le vouvoiement, toujours')]);
  dit('les prix : ceux du catalogue seulement, « à partir de » pour une création ou une réparation', [true, true],
    [c.includes('uniquement ceux du catalogue donnés dans le contexte'), c.includes('Pour une création ou une réparation, le prix se dit toujours « à partir de »')]);
  dit('jamais une place promise sans l agenda ; la réservation en ligne sinon', [true, true],
    [c.includes('ne promets JAMAIS une place, une heure ni un jour qui ne figure pas dans l’agenda'), c.includes('maisonmnd.com/reserver/')]);
  dit('pas de diagnostic du cuir chevelu : on invite à passer ou à consulter', [true, true],
    [c.includes('Le cuir chevelu et les cheveux : aucun diagnostic ni avis à distance'), c.includes('Invite à passer à la Maison ou à prendre une consultation')]);
  dit('jamais un numéro de facture, de reçu, de devis, ni de téléphone', true, c.includes('Ne cite JAMAIS un numéro de facture, de reçu ou de devis, ni aucun numéro de téléphone'));
  dit('pas d émoji, pas de tiret long, 60 mots au plus, rien d inventé, pas de signature', [true, true, true, true, true],
    [c.includes('Pas d’émoji'), c.includes('pas de tiret long'), c.includes(`${MOTS_MAX} mots au plus`) && MOTS_MAX === 60, c.includes('N’invente rien'), c.includes('Ne signe pas')]);
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
  dit('le mot banni, au singulier, au pluriel, en majuscules : refusée', [null, null, null],
    [lectureDeLaReponse({ reponse: 'Venez au salon demain.' }), lectureDeLaReponse({ reponse: 'Nos Salons vous attendent.' }), lectureDeLaReponse({ reponse: 'SALON ouvert.' })]);
  dit('vide, blanc, absent, un nombre, un objet sans texte : rien', [null, null, null, null, null],
    [lectureDeLaReponse({ reponse: '' }), lectureDeLaReponse({ reponse: '   ' }), lectureDeLaReponse(null), lectureDeLaReponse(42), lectureDeLaReponse({ reponse: 7 })]);
  dit('le tiret long devient une virgule, le gras et les émojis tombent', 'La Maison vous reçoit, du lundi au samedi. À bientôt',
    lectureDeLaReponse({ reponse: 'La Maison vous reçoit — du lundi au samedi. **À bientôt** 😊✨' }));
  dit('un prix de la Maison et une date ISO ne sont pas des numéros', ['Comptez 135 000 F, le 2026-10-21.', 'Un VÈKPÈ™ Jumbo commence à 1 350 000 F.'],
    [lectureDeLaReponse({ reponse: 'Comptez 135 000 F, le 2026-10-21.' }), lectureDeLaReponse({ reponse: 'Un VÈKPÈ™ Jumbo commence à 1 350 000 F.' })]);
  const phrase = 'Votre couronne mérite ce soin et nous serons heureuses de vous recevoir bientôt à la Maison.';
  const longue = Array.from({ length: 6 }, () => phrase).join(' ');
  const coupee = lectureDeLaReponse({ reponse: longue }) ?? '';
  dit('trop longue : coupée aux phrases, soixante mots au plus, finie par un point', [true, true, true, motsDe(phrase) * 4],
    [motsDe(coupee) <= MOTS_MAX, coupee.length <= SIGNES_MAX, coupee.endsWith('.'), motsDe(coupee)]);
  const uneSeule = Array.from({ length: 90 }, (_, i) => `mot${i}`).join(' ');
  const c1 = lectureDeLaReponse({ reponse: uneSeule }) ?? '';
  dit('une seule phrase trop longue : coupée au mot, avec des points', [true, true, true], [motsDe(c1) <= MOTS_MAX, c1.endsWith('…'), c1.startsWith('mot0 mot1')]);
  dit('les sauts de ligne se fondent : un message WhatsApp, pas une lettre', 'Bonjour Madame Clarisse, bien reçu. À bientôt.',
    lectureDeLaReponse({ reponse: 'Bonjour Madame Clarisse,\n\nbien reçu.\nÀ bientôt.' }));
}

/* ── 7. LA PORTE : QUI PEUT DEMANDER (la direction, la Clientèle) ──────── */
dit('les réponses WhatsApp sont au département Clientèle, et à lui seul', ['dept-clientele'], DEPARTEMENTS_PAR_CHANTIER['reponse-wa']);
dit('la direction demande ; un maître, s il a la Clientèle ; les Finances n y donnent pas droit ; sans rôle, personne',
  [true, true, false, true, false, false],
  [peutDemander('souverain', 'reponse-wa', {}), peutDemander('gerant', 'reponse-wa', undefined), peutDemander('maitre', 'reponse-wa', {}),
    peutDemander('maitre', 'reponse-wa', { 'dept-clientele': true }), peutDemander('maitre', 'reponse-wa', { 'dept-finances': true }), peutDemander(undefined, 'reponse-wa', { 'dept-clientele': true })]);

/* ── 8. LA STRUCTURE : LE BOUTON DANS LE COMPOSEUR, L'ENVOI EXISTANT, L'AUTOMATE INTACT ── */
{
  const conv = sansCommentaires(lis(CONVERSATIONS));
  dit('Conversations importe le composant, et le monte une fois', [true, 1],
    [/import \{ ReponseProposee \} from '\.\/ReponseProposee';/.test(conv), (conv.match(/<ReponseProposee\b/g) ?? []).length]);
  const iSaisie = conv.indexOf('className="trc-saisie__envoi"');
  const iComp = conv.indexOf('<ReponseProposee');
  const iEnvoyer = conv.indexOf("{envoiEnCours ? 'Envoi…' : 'Envoyer'}");
  dit('... dans le composeur du fil ouvert, avant le bouton Envoyer', true, iSaisie > 0 && iComp > iSaisie && iEnvoyer > iComp && iEnvoyer - iSaisie < 2000);
  dit('... la proposition remplit la zone de saisie existante, et l équipe prend la main sur l automate', true,
    /<ReponseProposee key=\{fil\.numero\} fil=\{fil\} occupe=\{envoiEnCours\} surProposition=\{\(t\) => \{ prendsLaMain\('proposition'\); setTexte\(t\); \}\} \/>/.test(conv));
  dit('... « Envoyer » est le bouton qui existait, inchangé, par `envoie()`', true,
    /disabled=\{!!refus \|\| envoiEnCours\}\s*onClick=\{\(\) => void envoie\(\)\}\s*>\s*\{envoiEnCours \? 'Envoi…' : 'Envoyer'\}/.test(conv));

  const comp = sansCommentaires(lis(COMPOSANT));
  dit('le composant se tait sans la fonction posée et pour qui n a pas le chantier', [true, true],
    [/const sait = useSaitIaMaison\(\);/.test(comp), /if \(sait !== true \|\| !peutDemander\(moi\?\.role, 'reponse-wa', acces\[moi\?\.user_id \?\? ''\]\)\) return null;/.test(comp)]);
  const crochets = [...comp.matchAll(/\buse[A-Z]\w*\(/g)].map((m) => m.index ?? 0);
  dit('... tous ses crochets viennent avant son premier retour', true, crochets.length >= 8 && Math.max(...crochets) < comp.indexOf('return null;'));
  dit('... il demande à Claude par la porte commune : chantier reponse-wa, usage texte, la consigne, le schéma, et relit la réponse', [true, true, true, true],
    [/chantier: 'reponse-wa', usage: 'texte', systeme: consigneDeLaReponse\(\)/.test(comp), /schema: SCHEMA_DE_LA_REPONSE/.test(comp),
      /const texte = lectureDeLaReponse\(r\.data\);/.test(comp), /contextePourClaude\(\{/.test(comp)]);
  dit('... la proposition va dans la zone (surProposition), jamais au départ : aucun envoi, aucune écriture', [true, false, false],
    [/surProposition\(texte\);/.test(comp), /\benvoie\(|functions\.invoke|whatsapp-envoi|appelleOuGarde|\.insert\(|\.upsert\(/.test(comp), /'Envoyer'|>Envoyer</.test(comp)]);
  dit('... ses boutons : « Proposer une réponse », « Une autre »', [true, true], [comp.includes("'Proposer une réponse'"), comp.includes("'Une autre'")]);
  dit('... « Une autre » dit à Claude ce qu on a écarté', true, /dejaProposee: derniere \?\? undefined/.test(comp));
  dit('... le prénom, l initiale et le reste dû se lisent de la fiche et des factures, jamais des devis ni des brouillons', true,
    /f\.kind === 'facture' && f\.status !== 'brouillon'/.test(comp) && /invoiceResteXof\(f\)/.test(comp));

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
