/* LA RÉCEPTION WHATSAPP, ÉPROUVÉE — 27 octobre 2026.
   `node scripts/verifie-la-reception-wa.mjs` (et `--prouve`).

   ① Les règles pures (shared/reception-wa-pur) : la consigne partagée et
      ses repères, la lecture de ce que Claude écrit (montants du catalogue
      seuls, aucun prix de création, ni numéro ni le mot banni), les calibres
      de la grille à toucher, le contexte (adresse, heures, première réponse).
   ② Le VRAI fichier à coller (`supabase/functions/reception-wa/index.ts`)
      tourne contre une base et un Claude simulés : la porte, le plafond du
      numéro, les prix de chaque calibre, le calibre touché, les juges, le
      repli sur Sonnet, Claude absent, le compte du mois. Les clientes sont
      des initiales ; aucun numéro ne part chez Claude.
   ① bis et ② bis, LA PAROLE EN CONTEXTE (2 novembre 2026, lot 3 de Perle) :
      les gestes après un message de Perle (garder-oui, deplacer, garder-non,
      locks-defaits, envie), offerts seulement quand le contexte le permet,
      écrits sous verrou, et jamais quand ils ne le doivent pas. */
import { readFileSync } from 'node:fs';
import {
  FENETRE_DU_FIL_MS, REPERES_DE_LA_CONSIGNE, calibreDuChoix, consigneDeLaReception, contexteDeLaReception, filDeLaFenetre, lectureDeLaReception, listeDesCalibres, montantsDe, connaitLeLieuDe, reponseSelonLeLieu,
  GESTES_DE_LA_PAROLE, contexteDeLaParole, dernierMotDePerle, ecrituresDuGeste, genreDuModele, gestesPermis, lectureDeLaParole, pieceDuGeste, schemaDeLaParole,
  accordApresLeOui,
} from '../src/shared/reception-wa-pur';
import { QUESTION_DE_L_ACCORD } from '../src/shared/accord-whatsapp-pur';
import { consigneDeLaReponse, contextePourClaude } from '../src/shared/ia-reponse-wa-pur';

let ko = 0; let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};

/* ── ① LES RÈGLES PURES ── */
const partagee = consigneDeLaReponse();
dit('chaque repere de la consigne partagee existe la-bas', REPERES_DE_LA_CONSIGNE.map(() => true), REPERES_DE_LA_CONSIGNE.map(([avant]) => partagee.includes(avant)));
const c = consigneDeLaReception();
dit('la consigne de la reception : elle repond elle-meme, dit qu elle est l assistant, et la suite', [true, false, true, true, true],
  [c.includes('Tu es l’assistant de la Maison MND'), c.includes('tu PROPOSES'), c.includes('"suite"'), c.includes('« l’assistant de la Maison »'), c.includes('Une création de locks ou une réparation commence TOUJOURS par une consultation')]);
/* L'essai du 28 octobre 2026, 0 h 41 : sur « Bonjour », Claude s'est excusé
   d'un ancien message et a passé la main, la Maison fermée. */
dit('la consigne : un ancien message ni la Maison fermee ne passent la main ; un bonjour ouvre la liste ; equipe jamais pour un rendez-vous', [true, true, true],
  [c.includes('Ni ce retard ni la Maison fermée ne sont une raison de passer la main'), c.includes('Un simple bonjour, sans autre demande : accueille-la en une phrase, sans question ; suite "reserver"'),
    c.includes('Jamais pour un bonjour, un rendez-vous, un prix, les heures ou l’adresse')]);
/* Le 31 octobre 2026 : un « Ok » de W. N. après sa confirmation, et Claude a
   répondu à un vocal et à un shampoing du 21 septembre. */
const midi = Date.parse('2026-10-31T12:00:00Z');
const aLHeure = (h: number) => new Date(midi - h * 3_600_000).toISOString();
dit('la fenetre du fil : 48 heures, un message sans date n entre pas', [48 * 3_600_000, ['47 h', '1 h']],
  [FENETRE_DU_FIL_MS, filDeLaFenetre([{ t: 'sept', quand: '2026-09-21T09:47:00Z' }, { t: '49 h', quand: aLHeure(49) }, { t: '47 h', quand: aLHeure(47) }, { t: 'sans date' }, { t: 'illisible', quand: 'hier' }, { t: '1 h', quand: aLHeure(1) }], midi).map((m) => m.t)]);
const PERMIS = new Set([35000, 40000, 50000, 15000]);
dit('les montants d un texte', [35000, 40000, 15000], montantsDe('De 35 000 F à 40000 FCFA, et 15 000 francs.'));
dit('une reponse sure passe telle quelle', { texte: 'Avec plaisir, Madame Naffi. Pour votre calibre, le resserrage est à 40 000 F.', suite: 'rien' },
  lectureDeLaReception({ texte: 'Avec plaisir, Madame Naffi. Pour votre calibre, le resserrage est à 40 000 F.', suite: 'rien' }, PERMIS));
dit('... un montant hors catalogue, un prix de creation, un prix avec la question des locks : rien', [null, null, null], [
  lectureDeLaReception({ texte: 'Le resserrage est à 42 000 F.', suite: 'rien' }, PERMIS),
  lectureDeLaReception({ texte: 'Une création est à 15 000 F.', suite: 'creation' }, PERMIS),
  lectureDeLaReception({ texte: 'C’est 35 000 F ; combien de locks portez-vous ?', suite: 'calibre' }, PERMIS),
]);
dit('... le mot banni, un numero, rien d ecrit : rien ; une suite inconnue devient rien', [null, null, null, 'rien'], [
  lectureDeLaReception({ texte: `Bienvenue au ${'sal' + 'on'}.`, suite: 'rien' }, PERMIS),
  lectureDeLaReception({ texte: 'Appelez le 01 51 99 77 99.', suite: 'rien' }, PERMIS),
  lectureDeLaReception({ texte: '   ', suite: 'rien' }, PERMIS),
  lectureDeLaReception({ texte: 'Avec plaisir.', suite: 'danser' }, PERMIS)?.suite,
]);
dit('... le tiret long devient une virgule', 'Avec plaisir, la Maison vous attend.', lectureDeLaReception({ texte: 'Avec plaisir — la Maison vous attend.', suite: 'rien' }, PERMIS)?.texte);
const BANDES = [{ id: 'medium', name: 'Medium', maxLocks: 150 }, { id: 'jumbo', name: 'Jumbo', maxLocks: 80 }, { id: 'galaxy', name: 'Galaxy', maxLocks: null }];
dit('les calibres de la grille, du plus large au plus fin, puis je ne sais pas', [['Jumbo', 'jusqu’à 80 locks'], ['Medium', '81 à 150 locks'], ['Galaxy', 'plus de 150 locks'], ['Je ne sais pas', 'La Maison les comptera avec vous']],
  listeDesCalibres(BANDES).map((l) => [l.titre, l.description]));
dit('le calibre touche se lit sous ses deux formes', [{ locks: 150, palier: '81 à 150 locks' }, 'inconnu', null, { locks: 80, palier: 'jusqu’à 80 locks' }],
  [calibreDuChoix('MND:7:calibre:medium', BANDES), calibreDuChoix('calibre:inconnu', BANDES), calibreDuChoix('MND:7:besoin:entretien', BANDES), calibreDuChoix('calibre:jumbo', BANDES)]);
const SEMAINE = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'].map((key) => ({ key, open: '08h00', close: '20h30', closed: key === 'dim' || key === 'lun' }));
const lundiSoir = Date.parse('2026-10-26T22:00:00Z');
const ctx = contexteDeLaReception({
  fil: [{ sens: 'entrant', texte: 'Bonsoir' }], fiche: null, catalogue: [], aujourdhui: '2026-10-26',
  semaine: SEMAINE, exceptions: [], maintenantMs: lundiSoir, premiereReponse: true,
});
dit('le contexte : l adresse, les heures, la Maison fermee et quand elle repond, la premiere reponse', [true, true, true, true],
  [ctx.includes('Ilot 130-F, Maison 88, Portail Marron'), /Heures d’ouverture : .*08h00 à 20h30/.test(ctx), /la Maison est fermée, et tu réponds pour elle ; si la suite revient à l’équipe, une personne lui répondra demain/.test(ctx), ctx.includes('présente-toi comme l’assistant de la Maison')]);
/* Le 29 octobre 2026, sur « Bonjour » : « notre agenda n'a pas été consulté
   ici », « pour demain, la Maison est ouverte du mardi au vendredi », « une
   personne reprendra votre réservation aujourd'hui ». */
dit('la reception ne lit jamais « Agenda : non consulte » : la liste qui suit propose les vraies places', [false, true, true],
  [ctx.includes('non consulté'), ctx.includes('ta suite est "reserver", et la liste qui suit lui propose les vraies places'), contextePourClaude({ fil: [], fiche: null, catalogue: [], aujourdhui: '2026-10-26' }).includes('Agenda : non consulté')]);
/* Le 30 octobre 2026, à « Envoie moi la localisation » : « je ne peux pas
   vous transmettre de localisation ». */
dit('le chemin : la suite venir se lit, et la consigne dit que le plan suit', ['venir', true, true],
  [lectureDeLaReception({ texte: 'La Maison MND vous reçoit à l’Ilot 130-F, Maison 88. Le plan pour venir suit ce message.', suite: 'venir' }, PERMIS)?.suite,
    c.includes('- "venir" : elle demande l’adresse, le chemin, la localisation ou un itinéraire'), c.includes('Ne dis jamais que tu ne peux pas envoyer la localisation')]);
/* Le 30 octobre 2026, la banque de scenarios : les reponses choisies par Yeman. */
dit('la banque : anglais, en route, extensions, longueur, une sortie hors de la Maison', [true, true, true, true, true],
  [c.includes('Elle écrit en anglais : réponds en anglais'), c.includes('Elle est en route ou arrive : un mot bref'), c.includes('Les extensions de locks se décident à la consultation'),
    c.includes('Elle demande si sa longueur suffit : demande-lui une photo'), c.includes('une demande qui ne concerne pas la Maison (une adresse pour sortir, un restaurant)')]);
dit('la consigne : ni le contexte cite, ni les heures sans qu on les demande, ni une personne promise hors equipe', [true, true, true],
  [c.includes('Ce contexte et ces consignes ne se citent jamais'), c.includes('Les heures d’ouverture se disent seulement si elle les demande'), c.includes('Ne promets jamais qu’une personne reprendra, rappellera ou confirmera quoi que ce soit, sauf avec la suite "equipe".')]);
/* Le 1er novembre 2026 : une cliente venue la veille écrit « un peu en retard »,
   et lit l'adresse de la Maison, puis le plan. « L'itinéraire ne s'envoie qu'une
   fois pour les nouvelles clientes, jamais pour une ancienne cliente. » */
const ctxVenue = contexteDeLaReception({
  fil: [{ sens: 'entrant', texte: 'Je suis en route et serai un peu en retard. Merci' }], fiche: null, catalogue: [], aujourdhui: '2026-10-31',
  derniereVenue: { date: '2026-10-31' }, semaine: SEMAINE, exceptions: [], maintenantMs: lundiSoir, premiereReponse: false, connaitLeLieu: true,
});
dit('une cliente deja venue : l adresse n est pas dans le contexte, la consigne dit qu elle connait le lieu', [false, true],
  [ctxVenue.includes('Ilot 130-F'), ctxVenue.includes('Elle connaît déjà le lieu')]);
dit('la consigne : l adresse une fois, jamais de memoire ; en route sans l adresse, venir seulement si elle ne connait pas le lieu', [true, true],
  [c.includes('l’adresse se donne une fois, à qui n’est jamais venue'), c.includes('sans l’adresse ; un retard annoncé, pareil ; suite "venir" seulement si le contexte dit qu’elle ne connaît pas encore le lieu')]);
dit('elle connait le lieu : une venue, ou l adresse ou le plan deja partis dans le fil ; sinon non', [true, true, true, false],
  [connaitLeLieuDe({ derniereVenue: { date: '2026-10-31' }, fil: [] }),
    connaitLeLieuDe({ derniereVenue: null, fil: [{ sens: 'sortant', texte: 'Nous sommes à l’Ilot 130-F, Maison 88.' }] }),
    connaitLeLieuDe({ derniereVenue: null, fil: [{ sens: 'sortant', texte: 'Maison MND sur Google Maps : https://maisonmnd.com/venir/' }] }),
    connaitLeLieuDe({ derniereVenue: null, fil: [{ sens: 'entrant', texte: 'Vous êtes à Suru-Léré ?' }, { sens: 'sortant', texte: 'Bonjour, avec plaisir.' }] })]);
const enRetard = { texte: 'Bien noté, Madame. Merci de nous prévenir. Prenez tout le temps nécessaire, nous vous attendons à la Maison, Ilot 130-F, Maison 88, Portail Marron, quartier Suru-Léré, Cotonou.', suite: 'rien' as const };
dit('elle connait le lieu : la phrase qui porte l adresse tombe, le reste part', 'Bien noté, Madame. Merci de nous prévenir.', reponseSelonLeLieu(enRetard, true).texte);
dit('elle ne le connait pas : rien ne change', enRetard.texte, reponseSelonLeLieu(enRetard, false).texte);
dit('un mot qui n etait que l adresse devient le mot bref', 'Bien noté, nous vous attendons.', reponseSelonLeLieu({ texte: 'Nous sommes à l’Ilot 130-F, Maison 88, Portail Marron.', suite: 'venir' }, true).texte);
dit('... et la suite venir reste a l automate, qui ne renvoie le plan que si elle demande le chemin', 'venir', reponseSelonLeLieu({ texte: 'Le plan pour venir suit ce message.', suite: 'venir' }, true).suite);
const automate = readFileSync('src/shared/automate-wa.ts', 'utf8');
dit('l automate : jamais le plan a une cliente deja venue sauf si elle demande le chemin, et un mot bref quand le plan ne part pas', [true, true],
  [automate.includes('if (titulaire?.derniereVenue && !(tour && demandeLeCheminWa(tour.texte))) return [];'), automate.includes("corps: plan.length > 0 ? r.texte : sansLAnnonce || 'Bien noté, nous vous attendons.'")]);

/* ── ① bis LA PAROLE EN CONTEXTE (2 novembre 2026, lot 3 de Perle) ── */
{
  const T0 = Date.parse('2026-11-02T10:00:00.000Z');
  const ilY = (h: number) => new Date(T0 - h * 3_600_000).toISOString();
  const AUJ = '2026-11-02';
  dit('P1 le genre d un modele de Perle : garder, l ancien gerard, la carte d anniversaire ; un autre modele : rien',
    ['garder', 'endormie', 'anniversaire', null, null],
    [genreDuModele('assistant_maison_garder'), genreDuModele('gerard_endormie'), genreDuModele('assistant_maison_carte_anniversaire'), genreDuModele('confirmation_rdv'), genreDuModele('assistant_maison_nouvelles_de_la_maison')]);
  const filGarder = [
    { sens: 'sortant', modele: 'assistant_maison_garder', quand: ilY(5), waId: 'w1' },
    { sens: 'entrant', quand: ilY(1) },
  ];
  dit('P2 le dernier mot de Perle : moins de 48 h, la cliente a ecrit apres', { genre: 'garder', quand: ilY(5), waId: 'w1' }, dernierMotDePerle(filGarder, T0));
  dit('P3 plus de 48 h : rien', null, dernierMotDePerle([{ sens: 'sortant', modele: 'assistant_maison_garder', quand: ilY(49) }, { sens: 'entrant', quand: ilY(1) }], T0));
  dit('P4 la cliente n a pas ecrit apres : rien', null, dernierMotDePerle([{ sens: 'entrant', quand: ilY(6) }, { sens: 'sortant', modele: 'assistant_maison_garder', quand: ilY(5) }], T0));
  dit('P5 un message d une personne de l equipe n est pas un mot de Perle', null, dernierMotDePerle([{ sens: 'sortant', parQui: 'Yéman', quand: ilY(5) }, { sens: 'entrant', quand: ilY(1) }], T0));
  const vise = { id: 'rdv-1', date: '2026-11-05', time: '10:00', status: 'confirmé' };
  const mot = { genre: 'garder' as const, quand: ilY(5) };
  dit('P6 apres « garder », sur un rendez-vous vivant : garder, deplacer, envie, locks', ['garder-oui', 'garder-non', 'deplacer', 'envie', 'locks-defaits'],
    gestesPermis({ mot, rdvVise: vise, clientId: 'c-n' }, AUJ));
  dit('P7 un rendez-vous annule ou honore : plus de garder ni de deplacer', [['locks-defaits'], ['locks-defaits']],
    [gestesPermis({ mot, rdvVise: { ...vise, status: 'annulé' }, clientId: 'c-n' }, AUJ), gestesPermis({ mot, rdvVise: { ...vise, status: 'honoré' }, clientId: 'c-n' }, AUJ)]);
  dit('P8 un rendez-vous passe : plus de garder', ['locks-defaits'], gestesPermis({ mot, rdvVise: { ...vise, date: '2026-11-01' }, clientId: 'c-n' }, AUJ));
  dit('P9 apres une carte d anniversaire, son rendez-vous a venir : deplacer et envie, jamais garder',
    ['deplacer', 'envie', 'locks-defaits'], gestesPermis({ mot: { genre: 'anniversaire', quand: ilY(5) }, rdvVise: vise, prochainRdv: vise, clientId: 'c-n' }, AUJ));
  dit('P10 sans mot de Perle, son prochain rendez-vous : deplacer seul', ['deplacer'], gestesPermis({ mot: null, prochainRdv: vise, clientId: 'c-n' }, AUJ));
  dit('P11 sans mot de Perle ni rendez-vous : rien', [], gestesPermis({ mot: null, clientId: 'c-n' }, AUJ));
  dit('P12 apres « endormie », sans rendez-vous : les locks seuls', ['locks-defaits'], gestesPermis({ mot: { genre: 'endormie', quand: ilY(5) }, clientId: 'c-n' }, AUJ));

  const permisGarder = gestesPermis({ mot, rdvVise: vise, clientId: 'c-n' }, AUJ);
  const montants = new Set([35000]);
  dit('P13 garder-oui permis : le texte passe les juges, l automate recoit « rien »', { texte: 'C’est noté, Madame. À jeudi.', suite: 'rien', geste: 'garder-oui' },
    lectureDeLaParole({ texte: 'C’est noté, Madame. À jeudi.', suite: 'garder-oui' }, montants, permisGarder));
  dit('P14 deplacer : la suite « deplacer » pour l automate', 'deplacer', lectureDeLaParole({ texte: 'Bien sûr, Madame. Voici d’autres places.', suite: 'deplacer' }, montants, permisGarder)?.suite);
  dit('P15 garder-non : la main a l equipe', 'equipe', lectureDeLaParole({ texte: 'C’est noté, Madame. Une personne de la Maison revient vers vous.', suite: 'garder-non' }, montants, permisGarder)?.suite);
  dit('P16 un geste hors de ce qui etait permis : rien ne part', null, lectureDeLaParole({ texte: 'C’est noté.', suite: 'garder-oui' }, montants, ['deplacer']));
  dit('P17 un geste avec un montant hors catalogue : rien ne part', null, lectureDeLaParole({ texte: 'C’est noté, ce sera 99 000 F.', suite: 'garder-oui' }, montants, permisGarder));
  dit('P18 l envie : sa cle et quelques mots', { envie: 'coloration', precision: 'une couleur cuivrée' },
    lectureDeLaParole({ texte: 'C’est noté pour la couleur.', suite: 'envie', envie: 'coloration', precision: 'une couleur cuivrée' }, montants, permisGarder)?.envie);
  dit('P19 une precision qui cite, ou trop longue, ou un numero : ecartee ; une cle inconnue : autre',
    [{ envie: 'autre' }, { envie: 'soin' }, { envie: 'soin' }],
    [lectureDeLaParole({ texte: 'Noté.', suite: 'envie', envie: 'tatouage', precision: '« comme ma sœur »' }, montants, permisGarder)?.envie,
      lectureDeLaParole({ texte: 'Noté.', suite: 'envie', envie: 'soin', precision: 'x'.repeat(61) }, montants, permisGarder)?.envie,
      lectureDeLaParole({ texte: 'Noté.', suite: 'envie', envie: 'soin', precision: 'appelez le 0197123456' }, montants, permisGarder)?.envie]);
  dit('P20 sans geste, la lecture de la reception, inchangee', lectureDeLaReception({ texte: 'Bonjour Madame.', suite: 'reserver' }, montants),
    lectureDeLaParole({ texte: 'Bonjour Madame.', suite: 'reserver' }, montants, permisGarder));

  const tous = GESTES_DE_LA_PAROLE.map((g) => ecrituresDuGeste(g, ilY(0), { envie: 'soin', precision: 'un soin hydratant' }));
  dit('P21 aucun geste n annule ni ne change un statut', false, tous.some((e) => e.rdv && ('status' in e.rdv)));
  dit('P22 garder-oui confirme, deplacer demande une autre heure, garder-non le dit sans annuler',
    [ilY(0), ilY(0), ilY(0)], [tous[0].rdv?.confirmeeParLaClienteLe, tous[1].rdv?.autreMomentDemandeLe, tous[2].rdv?.empecheeDitLe]);
  dit('P23 locks defaits : la fiche, datee, par Perle ; l envie : sur le rendez-vous, par Perle',
    [{ locksDefaits: true, locksDefaitsLe: ilY(0), locksDefaitsPar: 'Perle' }, { envie: 'soin', quand: ilY(0), precision: 'un soin hydratant', par: 'Perle' }],
    [tous[3].fiche, tous[4].rdv?.envieAvantSeance]);
  dit('P24 la ligne d envoi : oui, non, ou rien pour une envie', ['oui', 'oui', 'non', undefined, undefined], tous.map((e) => e.envoi?.reponse));
  dit('P25 le journal dit un fait daté, sans nom', 'Rendez-vous gardé par la cliente, sur WhatsApp, rendez-vous du jeudi 5 novembre 2026 à 10 h', pieceDuGeste('garder-oui', vise));
  const ctxG = contexteDeLaParole({ mot, rdvVise: vise, clientId: 'c-n' }, permisGarder, T0, AUJ);
  dit('P26 Claude lit le message de Perle, le rendez-vous avec l annee, et les seuls gestes permis', [true, true, true, false],
    [ctxG.includes('lui demander si elle le garde'), ctxG.includes('jeudi 5 novembre 2026 à 10 h'), ctxG.includes('"garder-oui"'), contexteDeLaParole({ mot: null, prochainRdv: vise }, ['deplacer'], T0, AUJ).includes('"garder-oui"')]);
  dit('P27 rien de permis : rien de plus a lire, le schema d avant', ['', false],
    [contexteDeLaParole({ mot: null }, [], T0, AUJ), JSON.stringify(schemaDeLaParole([])).includes('garder-oui')]);
  /* L'accord des nouvelles après un « oui je viens » écrit (maquette « Nouvelles par WhatsApp »). */
  const fiche0 = { nouvelles: null, nouvellesDemandeesLe: null };
  dit('A1 apres garder-oui, l automate qui sait : la question des nouvelles et ses deux boutons',
    [QUESTION_DE_L_ACCORD, ['NOUVELLES:oui', 'NOUVELLES:non']],
    [accordApresLeOui({ geste: 'garder-oui', sait: ['accord'], fiche: fiche0, aujourdhui: AUJ })?.texte,
      accordApresLeOui({ geste: 'garder-oui', sait: ['accord'], fiche: fiche0, aujourdhui: AUJ })?.boutons.map((b) => b.id)]);
  dit('A2 jamais : autre geste, automate qui ne sait pas, deja repondu, deja demandee, STOP, enfant par sa date ou son segment',
    [null, null, null, null, null, null, null],
    [accordApresLeOui({ geste: 'deplacer', sait: ['accord'], fiche: fiche0, aujourdhui: AUJ }),
      accordApresLeOui({ geste: 'garder-oui', sait: [], fiche: fiche0, aujourdhui: AUJ }),
      accordApresLeOui({ geste: 'garder-oui', sait: ['accord'], fiche: { nouvelles: { oui: false, le: '2026-10-21', par: 'comptoir' } }, aujourdhui: AUJ }),
      accordApresLeOui({ geste: 'garder-oui', sait: ['accord'], fiche: { nouvellesDemandeesLe: '2026-10-30T10:00:00.000Z' }, aujourdhui: AUJ }),
      accordApresLeOui({ geste: 'garder-oui', sait: ['accord'], fiche: { nouvelles: { oui: false, le: '2026-10-21', par: 'stop' } }, aujourdhui: AUJ }),
      accordApresLeOui({ geste: 'garder-oui', sait: ['accord'], fiche: { birthday: '2016-04-02' }, aujourdhui: AUJ }),
      accordApresLeOui({ geste: 'garder-oui', sait: ['accord'], fiche: { segments: ['Enfant'] }, aujourdhui: AUJ })]);
  dit('P28 le schema n offre que les gestes permis, et l envie avec ses champs', [true, false, true],
    [JSON.stringify(schemaDeLaParole(['deplacer'])).includes('"deplacer"'), JSON.stringify(schemaDeLaParole(['deplacer'])).includes('garder-oui'), JSON.stringify(schemaDeLaParole(['envie'])).includes('"precision"')]);
}

/* ── ② LE VRAI FICHIER, CONTRE UNE BASE ET UN CLAUDE SIMULÉS ── */
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const db: Record<string, Row[]> = {};
const lit = (r: Row, col: string): unknown => {
  const m = /^data->>(.+)$/.exec(col);
  if (m) { const v = r.data?.[m[1]]; return v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v); }
  return r[col];
};
/* Une ligne modifiée par quelqu'un d'autre entre la lecture et l'écriture (le verrou doit refuser). */
let bougeAvantLEcriture: string | null = null;
let estampille = 0;
class Requete {
  filtres: ((r: Row) => boolean)[] = []; mode: 'select' | 'upsert' | 'update' | 'insert' = 'select'; valeur: any = null; retour = false; // eslint-disable-line @typescript-eslint/no-explicit-any
  compte = false; tete = false; de = 0; a = Infinity; lim = Infinity; seul = false; ordre: string | null = null; desc = false; cols = '';
  constructor(public table: string) {}
  select(cols = '', o: { count?: string; head?: boolean } = {}) {
    if (this.mode === 'update') { this.retour = true; return this; }
    this.cols = cols; this.compte = !!o.count; this.tete = !!o.head; return this;
  }
  update(o: any) { this.mode = 'update'; this.valeur = o; return this; } // eslint-disable-line @typescript-eslint/no-explicit-any
  insert(o: any) { this.mode = 'insert'; this.valeur = o; return this; } // eslint-disable-line @typescript-eslint/no-explicit-any
  eq(c: string, v: unknown) { this.filtres.push((r) => String(lit(r, c) ?? '') === String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((r) => String(lit(r, c) ?? '') >= String(v)); return this; }
  in(c: string, vs: unknown[]) { this.filtres.push((r) => vs.map(String).includes(String(lit(r, c)))); return this; }
  order(c: string, o: { ascending?: boolean } = {}) { this.ordre = c; this.desc = o.ascending === false; return this; }
  range(de: number, a: number) { this.de = de; this.a = a; return this; }
  limit(k: number) { this.lim = k; return this; }
  maybeSingle() { this.seul = true; return this; }
  upsert(o: any) { this.mode = 'upsert'; this.valeur = o; return this; } // eslint-disable-line @typescript-eslint/no-explicit-any
  then(ok: (x: any) => any, ko2?: (e: any) => any) { return Promise.resolve(this.fais()).then(ok, ko2); } // eslint-disable-line @typescript-eslint/no-explicit-any
  fais(): any { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = (db[this.table] ??= []);
    const cle = this.table === 'documents' ? 'key' : 'id';
    if (this.mode === 'insert') {
      for (const row of Array.isArray(this.valeur) ? this.valeur : [this.valeur]) t.push(structuredClone(row));
      return { error: null };
    }
    if (this.mode === 'update') {
      if (bougeAvantLEcriture === this.table) for (const r of t) r.updated_at = `${r.updated_at}-bouge`;
      const touches = t.filter((r) => this.filtres.every((f) => f(r)));
      for (const r of touches) { Object.assign(r, JSON.parse(JSON.stringify(this.valeur))); r.updated_at = `u-${++estampille}`; }
      return { data: this.retour ? touches.map((r) => ({ id: r.id })) : null, error: null };
    }
    if (this.mode === 'upsert') {
      for (const row of Array.isArray(this.valeur) ? this.valeur : [this.valeur]) {
        const i = t.findIndex((r) => r[cle] === row[cle]);
        if (i < 0) t.push(structuredClone(row)); else t[i] = structuredClone(row);
      }
      return { error: null };
    }
    let lus = structuredClone(t.filter((r) => this.filtres.every((f) => f(r))));
    if (this.compte && this.tete) return { count: lus.length, data: null, error: null };
    if (this.ordre) { const o = this.ordre; lus.sort((x: Row, y: Row) => String(lit(x, o)).localeCompare(String(lit(y, o)))); if (this.desc) lus.reverse(); }
    lus = lus.slice(this.de, Math.min(this.a + 1, this.de + this.lim));
    return { data: this.seul ? (lus[0] ?? null) : lus, error: null };
  }
}
const base = { from: (t: string) => new Requete(t) };

/* Claude, simulé : ce qu'il reçoit est gardé, ce qu'il rend est choisi par l'épreuve. */
type Envoi = { model: string; system: string; messages: { role: string; content: string }[] };
const recus: Envoi[] = [];
let reponseDeClaude: (corps: Envoi) => { status: number; corps: unknown } = () => ({ status: 200, corps: {} });
const outil = (texte: string, suite: string) => ({ status: 200, corps: { content: [{ type: 'tool_use', name: 'reponds', input: { texte, suite } }], usage: { input_tokens: 2000, output_tokens: 100 } } });
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { body: string }) => {
  if (!String(url).startsWith('https://api.anthropic.com/')) throw new Error(`appel inattendu : ${url}`);
  const corps = JSON.parse(init.body) as Envoi;
  recus.push(corps);
  const r = reponseDeClaude(corps);
  return { status: r.status, text: async () => JSON.stringify(r.corps) };
};

let handler: ((req: Request) => Promise<Response>) | null = null;
const env: Record<string, string> = { SUPABASE_URL: 'http://base', CLE_SERVICE: 'service', ANTHROPIC_API_KEY: 'cle-de-test' };
const source = readFileSync(process.env.RECEPTION_FONCTION as string, 'utf8').replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";$/m, '');
new Function('createClient', 'Deno', source)(() => base, { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => { handler = h; } });
const appelle = async (o: { get?: boolean; cle?: string; corps?: unknown } = {}) => {
  const r = await handler!(new Request('http://f/reception-wa', o.get ? { method: 'GET' } : {
    method: 'POST', headers: { authorization: `Bearer ${o.cle ?? 'service'}`, 'content-type': 'application/json' }, body: JSON.stringify(o.corps ?? {}),
  }));
  return { status: r.status, corps: await r.json() as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const NUM = '2290197000001';
const maintenant = Date.now();
const il = (min: number) => new Date(maintenant - min * 60000).toISOString();
const remplis = () => {
  for (const k of Object.keys(db)) delete db[k];
  db.documents = [
    { key: 'mnd_settings', data: { hours: SEMAINE, mndPay: { actif: true } } },
    { key: 'mnd_model_bands', data: BANDES.map((b) => ({ ...b, coef: 1, durCoef: 1 })) },
    { key: 'mnd_payment_methods', data: ['Espèces', 'MTN MoMo', 'Carte', 42] },
  ];
  db.catalog_categories = [{ id: 'atl-ii', data: {} }, { id: 'atl-i-vekpe', data: {} }, { id: 'koko', data: {} }];
  db.catalog_services = [
    { id: 'sinsin-ess', data: { name: 'SÍNSIN™ Essentiel', categoryId: 'atl-ii', priceXof: 35000, tarifMode: 'calibre', priceFloors: { jumbo: 35000, medium: 40000, galaxy: 50000 } } },
    { id: 'vekpe-crea', data: { name: 'VÈKPÈ™ Création', categoryId: 'atl-i-vekpe', priceXof: 80000, consultationAvant: true } },
    { id: 'sv-koko-ori', data: { name: 'KÒKÒ™ Origine', categoryId: 'koko', priceXof: 15000 } },
  ];
  db.clients = [{ id: 'c-n', data: { id: 'c-n', name: 'N. M.' } }];
  db.messages_wa = [
    { id: 'm1', data: { numero: NUM, sens: 'entrant', texte: 'Bonsoir, combien pour refaire mes racines ?', quand: il(1), type: 'text' } },
  ];
};
const demande = { numero: NUM, clientId: 'c-n', fiche: { name: 'N. M.', civilite: 'madame' } };

remplis();
const g = await appelle({ get: true });
dit('GET : la version, et si la cle de Claude est posee, sans rien lire', [200, 'reception-wa', 'oui', 0], [g.status, g.corps.fonction, g.corps.claude, recus.length]);
dit('sans la cle service : refuse', 401, (await appelle({ cle: 'autre', corps: demande })).status);

reponseDeClaude = () => outil('Avec plaisir, Madame N. Pour un calibre de 81 à 150 locks, la reprise des racines est à 40 000 F.', 'rien');
const r1 = await appelle({ corps: demande });
const envoye = recus[recus.length - 1];
dit('une reponse sure : elle revient telle quelle, la suite avec', [true, 'rien', 'Avec plaisir, Madame N. Pour un calibre de 81 à 150 locks, la reprise des racines est à 40 000 F.'], [r1.corps.ok, r1.corps.suite, r1.corps.texte]);
dit('ce que Claude recoit : la consigne de la reception, Haiku d abord, le contexte de la Maison', ['claude-haiku-5-5', true, true, true],
  [envoye?.model, envoye?.system.includes('Tu es l’assistant de la Maison MND'), envoye?.messages[0]?.content.includes('Ilot 130-F'), envoye?.messages[0]?.content.includes('combien pour refaire mes racines')]);
dit('... les prix de chaque calibre, la creation sans prix, et jamais son numero', [true, true, false],
  [/SÍNSIN™ Essentiel, selon le nombre de locks : jusqu’à 80 locks, 35 000 F ; 81 à 150 locks, 40 000 F/.test(envoye?.messages[0]?.content ?? ''),
    /VÈKPÈ™ Création : consultation d’abord/.test(envoye?.messages[0]?.content ?? ''), JSON.stringify(envoye).includes(NUM)]);
/* Le 30 octobre 2026, la banque : « Can i pay with a card ». */
dit('... les moyens de paiement des Parametres (des mots seulement), et le lien en ligne quand FedaPay est allume', [true, true],
  [(envoye?.messages[0]?.content ?? '').includes('- Moyens de paiement à la Maison : Espèces, MTN MoMo, Carte.'),
    (envoye?.messages[0]?.content ?? '').includes('- Paiement à distance : la Maison envoie un lien de paiement en ligne (FedaPay), sur demande.')]);
dit('le compte du mois : un appel, ses jetons, son cout', [1, 2000, 100], (() => {
  const d = db.documents.find((x) => x.key === 'mnd_assistant_wa_compte')?.data ?? {};
  const m = Object.values(d)[0] as { appels?: number; entree?: number; sortie?: number } | undefined;
  return [m?.appels, m?.entree, m?.sortie];
})());
db.documents = db.documents.map((x: { key: string; data: unknown }) => (x.key === 'mnd_settings' ? { ...x, data: { hours: SEMAINE, mndPay: { actif: false } } } : x));
await appelle({ corps: demande });
dit('... FedaPay eteint : aucun lien en ligne promis', false, (recus[recus.length - 1]?.messages[0]?.content ?? '').includes('Paiement à distance'));
remplis();

/* W. N., le 30 octobre 2026 : son vocal et le shampoing du 21 septembre,
   puis la confirmation du Trône et son « Ok ». */
db.messages_wa = [
  { id: 'v1', data: { numero: NUM, sens: 'entrant', type: 'audio', texte: '', quand: il(40 * 1440) } },
  { id: 'v2', data: { numero: NUM, sens: 'sortant', texte: 'Brice sera là', quand: il(40 * 1440 - 1) } },
  { id: 'v3', data: { numero: NUM, sens: 'sortant', texte: 'W., j’ai ajouté ton shampoing sur ton RDV comme d’habitude', quand: il(40 * 1440 - 9) } },
  { id: 'v4', data: { numero: NUM, sens: 'sortant', type: 'template', texte: 'Bonjour W., c’est confirmé : votre rendez-vous est retenu samedi 31 octobre 2026 à 9 h.', quand: il(3) } },
  { id: 'v5', data: { numero: NUM, sens: 'entrant', type: 'text', texte: 'Ok', quand: il(1) } },
];
reponseDeClaude = () => outil('Avec plaisir, à demain.', 'rien');
await appelle({ corps: demande });
const vieux = recus[recus.length - 1]?.messages[0]?.content ?? '';
dit('un ancien vocal et un ancien shampoing ne vont plus chez Claude ; la confirmation et son Ok, si ; la Maison ne se represente pas', [false, false, true, true, true],
  [vieux.includes('message vocal'), vieux.includes('shampoing'), vieux.includes('c’est confirmé'), /Elle : Ok/.test(vieux), vieux.includes('La Maison a déjà répondu dans cette conversation')]);
db.messages_wa = db.messages_wa.filter((m: { id: string }) => m.id !== 'v4');
await appelle({ corps: demande });
dit('... la Maison n a ecrit qu en septembre : elle ne se presente pas pour autant', true,
  (recus[recus.length - 1]?.messages[0]?.content ?? '').includes('La Maison a déjà répondu dans cette conversation'));
remplis();

reponseDeClaude = () => outil('Une création de locks est à 80 000 F.', 'creation');
dit('un prix de creation : les juges l ecartent, rien ne part', [false, 'juges'], [(await appelle({ corps: demande })).corps.ok, (await appelle({ corps: demande })).corps.motif]);
reponseDeClaude = () => outil('Le resserrage est à 42 000 F.', 'rien');
dit('un montant hors catalogue : ecarte', false, (await appelle({ corps: demande })).corps.ok);

reponseDeClaude = () => outil('Pour vous indiquer le juste prix, combien de locks portez-vous, approximativement ?', 'calibre');
const r2 = await appelle({ corps: demande });
dit('calibre : la liste des calibres de la grille suit', [true, 'calibre', ['Jumbo', 'Medium', 'Galaxy', 'Je ne sais pas']], [r2.corps.ok, r2.corps.suite, (r2.corps.lignes ?? []).map((l: { titre: string }) => l.titre)]);

reponseDeClaude = () => outil('Merci. Pour votre calibre, la reprise des racines est à 40 000 F.', 'rien');
await appelle({ corps: { ...demande, choixId: 'MND:4:calibre:medium' } });
dit('le calibre touche : son nombre de locks et son prix a elle partent chez Claude', [true, true],
  [/annoncé par elle : environ 150/.test(recus[recus.length - 1]?.messages[0]?.content ?? ''), /SÍNSIN™ Essentiel : 40 000 F pour elle/.test(recus[recus.length - 1]?.messages[0]?.content ?? '')]);

reponseDeClaude = (corps) => (corps.model === 'claude-haiku-5-5' ? { status: 404, corps: { error: { type: 'not_found_error', message: 'model: claude-haiku-5-5' } } } : outil('Avec plaisir.', 'rien'));
const avantRepli = recus.length;
const r3 = await appelle({ corps: demande });
dit('Haiku inconnu : Sonnet prend le relais', [true, ['claude-haiku-5-5', 'claude-sonnet-5-5']], [r3.corps.ok, recus.slice(avantRepli).map((x) => x.model)]);

reponseDeClaude = () => ({ status: 529, corps: { error: { type: 'overloaded_error', message: 'surcharge' } } });
dit('Claude ne repond pas : ok faux, l automate envoie son secours', [false, 'claude'], [(await appelle({ corps: demande })).corps.ok, (await appelle({ corps: demande })).corps.motif]);

/* Le 1er novembre 2026, une cliente venue la veille : « un peu en retard ». */
remplis();
db.messages_wa = [{ id: 'r1', data: { numero: NUM, sens: 'entrant', type: 'text', texte: 'Je suis en route et serai un peu en retard. Merci beaucoup', quand: il(1) } }];
reponseDeClaude = () => outil('Bien noté, Madame. Merci de nous prévenir. Prenez tout le temps nécessaire, nous vous attendons à la Maison, Ilot 130-F, Maison 88, Portail Marron, quartier Suru-Léré, Cotonou.', 'venir');
const r5 = await appelle({ corps: { ...demande, derniereVenue: { date: '2026-10-31' } } });
dit('une cliente deja venue : Claude ne recoit pas l adresse, et la phrase qui la porte ne part pas', [false, true, 'Bien noté, Madame. Merci de nous prévenir.', 'venir'],
  [(recus[recus.length - 1]?.messages[0]?.content ?? '').includes('Ilot 130-F'), r5.corps.ok, r5.corps.texte, r5.corps.suite]);

remplis();
for (let k = 0; k < 20; k++) db.messages_wa.push({ id: `r${k}`, data: { numero: NUM, sens: 'sortant', reception: true, texte: 'x', quand: il(10 + k) } });
const avantPlafond = recus.length;
const r4 = await appelle({ corps: demande });
dit('vingt reponses en vingt-quatre heures : le plafond, Claude n est pas appele', [false, 'plafond', avantPlafond], [r4.corps.ok, r4.corps.motif, recus.length]);

/* ── ② bis LA PAROLE EN CONTEXTE, AU SERVEUR (2 novembre 2026) ──
   Une cliente répond en mots au « garder » de Perle, à une endormie, à une
   envie ; ou demande une autre heure pour son prochain rendez-vous. */
const demainCotonou = new Date(maintenant + 3_600_000 + 3 * 86_400_000).toISOString().slice(0, 10);
const scene = (o: { genre?: string; ilYa?: number; rdvStatus?: string; sansPerle?: boolean; texte: string }) => {
  remplis();
  db.clients = [{ id: 'c-n', updated_at: 'u-fiche', data: { id: 'c-n', name: 'N. M.' } }];
  db.appointments = [{ id: 'rdv-1', updated_at: 'u-rdv', data: { id: 'rdv-1', clientId: 'c-n', date: demainCotonou, time: '10:00', status: o.rdvStatus ?? 'confirmé' } }];
  db.journal_gestes = [];
  const genre = o.genre ?? 'garder';
  const modele = genre === 'anniversaire' ? 'assistant_maison_carte_anniversaire' : `assistant_maison_${genre}`;
  db.messages_wa = [
    ...(o.sansPerle ? [] : [{ id: 'p1', data: { numero: NUM, sens: 'sortant', type: 'text', modele, parQui: 'Assistant Maison', waId: 'w-perle', texte: 'Bonjour Madame N., votre rendez-vous approche.', quand: il(o.ilYa ?? 300) } }]),
    { id: 'm2', data: { numero: NUM, sens: 'entrant', type: 'text', texte: o.texte, quand: il(1) } },
  ];
  db.envois = o.sansPerle ? [] : [{ id: 'gerard-2026-11-02-c-n-whatsapp', updated_at: 'u-envoi', data: { type: 'gerard', genre, clientId: 'c-n', apptId: genre === 'garder' ? 'rdv-1' : '', waMessageId: 'w-perle' } }];
};
const schemaRecu = () => JSON.stringify((recus[recus.length - 1] as unknown as { tools?: { input_schema?: unknown }[] })?.tools?.[0]?.input_schema ?? {});
const rdv1 = () => db.appointments.find((r) => r.id === 'rdv-1');
const outilAvec = (input: Record<string, unknown>) => ({ status: 200, corps: { content: [{ type: 'tool_use', name: 'reponds', input }], usage: { input_tokens: 2000, output_tokens: 80 } } });

scene({ texte: 'Oui je viens, à jeudi' });
reponseDeClaude = () => outil('C’est noté, Madame. La Maison vous attend jeudi.', 'garder-oui');
const g1 = await appelle({ corps: demande });
dit('D1 « oui je viens » apres garder : confirme sur le rendez-vous, la ligne de Perle dit oui, l automate recoit « rien »',
  [true, 'rien', 'garder-oui', 'rdv-1', true, 'confirmé', 'oui', 'garder-oui'],
  [g1.corps.ok, g1.corps.suite, g1.corps.geste, g1.corps.rdvId, !!rdv1()?.data.confirmeeParLaClienteLe, rdv1()?.data.status, db.envois[0].data.reponse, db.envois[0].data.parole]);
dit('D2 Claude a lu le message de Perle, le rendez-vous avec l annee, et le geste offert', [true, true, true],
  [(recus[recus.length - 1]?.messages[0]?.content ?? '').includes('lui demander si elle le garde'),
    (recus[recus.length - 1]?.messages[0]?.content ?? '').includes(' 2026 à 10 h'), schemaRecu().includes('"garder-oui"')]);
dit('D3 le journal : porte assistant, par Perle, un fait sans nom', [1, 'assistant', 'Perle', 'appointments', false],
  [db.journal_gestes.length, db.journal_gestes[0]?.data.porte, db.journal_gestes[0]?.data.parNom, db.journal_gestes[0]?.data.table, JSON.stringify(db.journal_gestes).includes('N. M.')]);

/* L'accord des nouvelles, au serveur : la question part, la fiche marquée une fois pour toutes. */
scene({ texte: 'Oui je viens' });
reponseDeClaude = () => outil('C’est noté, Madame. La Maison vous attend jeudi.', 'garder-oui');
const a1 = await appelle({ corps: { ...demande, sait: ['accord'] } });
dit('A3 un oui je viens ecrit, l automate qui sait : la question suit avec ses deux boutons, la fiche est marquee et journalisee',
  [true, QUESTION_DE_L_ACCORD, 2, true, true],
  [a1.corps.ok, a1.corps.ensuite?.texte, a1.corps.ensuite?.boutons?.length, !!db.clients[0].data.nouvellesDemandeesLe,
    db.journal_gestes.some((j) => j.data.table === 'clients' && /Accord des nouvelles/.test(j.data.piece))]);
const a2 = await appelle({ corps: { ...demande, sait: ['accord'] } });
dit('A4 une seconde fois : plus de question (une seule fois pour toujours)', [true, false], [a2.corps.ok, 'ensuite' in a2.corps]);
scene({ texte: 'Oui je viens' });
db.clients[0].data.nouvelles = { oui: false, le: '2026-10-21', par: 'comptoir' };
reponseDeClaude = () => outil('C’est noté, Madame.', 'garder-oui');
const a3 = await appelle({ corps: { ...demande, sait: ['accord'] } });
dit('A5 elle a deja repondu au comptoir : ni question ni marque', [true, false, undefined], [a3.corps.ok, 'ensuite' in a3.corps, db.clients[0].data.nouvellesDemandeesLe]);
scene({ texte: 'Oui je viens' });
db.clients[0].data.birthday = '2015-06-01';
const a4 = await appelle({ corps: { ...demande, sait: ['accord'] } });
dit('A6 la fiche d un enfant : ni question ni marque (l accord se donne au comptoir, par le parent)', [true, false, undefined], [a4.corps.ok, 'ensuite' in a4.corps, db.clients[0].data.nouvellesDemandeesLe]);
scene({ texte: 'Oui je viens' });
const a5 = await appelle({ corps: demande });
dit('A7 un automate qui ne sait pas envoyer la question : ni question ni marque', [true, false, undefined], [a5.corps.ok, 'ensuite' in a5.corps, db.clients[0].data.nouvellesDemandeesLe]);

scene({ texte: 'Je préfère vendredi si possible' });
reponseDeClaude = () => outil('Bien sûr, Madame. Voici d’autres places.', 'deplacer');
const g2 = await appelle({ corps: demande });
dit('D4 une autre heure : la demande sur le rendez-vous, rien d annule, l automate recoit « deplacer » et le rendez-vous',
  [true, 'deplacer', 'rdv-1', true, 'confirmé'], [g2.corps.ok, g2.corps.suite, g2.corps.rdvId, !!rdv1()?.data.autreMomentDemandeLe, rdv1()?.data.status]);

scene({ texte: 'Désolée je ne pourrai pas venir finalement' });
reponseDeClaude = () => outil('C’est noté, Madame. Une personne de la Maison revient vers vous.', 'garder-non');
const g3 = await appelle({ corps: demande });
dit('D5 elle ne peut plus : dit sur le rendez-vous, JAMAIS annule, la main a l equipe, la ligne de Perle dit non',
  [true, 'equipe', true, 'confirmé', 'non'], [g3.corps.ok, g3.corps.suite, !!rdv1()?.data.empecheeDitLe, rdv1()?.data.status, db.envois[0].data.reponse]);

scene({ genre: 'endormie', texte: 'J’ai défait mes locks l’an dernier' });
reponseDeClaude = () => outil('C’est noté, Madame. Merci de nous l’avoir dit.', 'locks-defaits');
const g4 = await appelle({ corps: demande });
dit('D6 apres une endormie, locks defaits : la fiche le dit, datee, par Perle', [true, 'rien', true, true, 'Perle'],
  [g4.corps.ok, g4.corps.suite, db.clients[0].data.locksDefaits, !!db.clients[0].data.locksDefaitsLe, db.clients[0].data.locksDefaitsPar]);

scene({ genre: 'anniversaire', texte: 'Merci ! Pour jeudi je voudrais une couleur cuivrée' });
reponseDeClaude = () => outilAvec({ texte: 'Avec plaisir, Madame. C’est noté pour la couleur.', suite: 'envie', envie: 'coloration', precision: 'une couleur cuivrée' });
const g5 = await appelle({ corps: demande });
dit('D7 une envie apres une carte d anniversaire : notee sur le prochain rendez-vous, cle et quelques mots, par Perle',
  [true, 'rien', 'coloration', 'une couleur cuivrée', 'Perle', 'rdv-1'],
  [g5.corps.ok, g5.corps.suite, rdv1()?.data.envieAvantSeance?.envie, rdv1()?.data.envieAvantSeance?.precision, rdv1()?.data.envieAvantSeance?.par, g5.corps.rdvId]);
dit('D8 apres une carte d anniversaire, garder n est jamais offert', false, schemaRecu().includes('garder-oui'));

/* L'autre sens : ce qui ne doit jamais s'écrire. */
scene({ texte: 'oui', ilYa: 49 * 60 });
reponseDeClaude = () => outil('C’est noté, Madame.', 'garder-oui');
const k1 = await appelle({ corps: demande });
dit('K1 un garder de plus de 48 h : le geste n est pas offert, et rendu quand meme rien ne part ni ne s ecrit',
  [false, false, 'juges', false, 0], [schemaRecu().includes('garder-oui'), k1.corps.ok, k1.corps.motif, !!rdv1()?.data.confirmeeParLaClienteLe, db.journal_gestes.length]);

scene({ texte: 'oui je viens', rdvStatus: 'annulé' });
reponseDeClaude = () => outil('C’est noté, Madame.', 'garder-oui');
const k2 = await appelle({ corps: demande });
dit('K2 un rendez-vous deja annule : ni garder ni deplacer, rien ne s ecrit', [false, false, false, false],
  [schemaRecu().includes('garder-oui'), schemaRecu().includes('"deplacer"'), k2.corps.ok, !!rdv1()?.data.confirmeeParLaClienteLe]);

scene({ texte: 'oui je viens' });
reponseDeClaude = () => outil('C’est noté, Madame.', 'garder-oui');
bougeAvantLEcriture = 'appointments';
const k3 = await appelle({ corps: demande });
bougeAvantLEcriture = null;
dit('K3 le rendez-vous modifie entre la lecture et l ecriture : refuse, rien ne dit « c est note », ni journal ni ligne de Perle',
  [false, 'geste', false, 0, undefined], [k3.corps.ok, k3.corps.motif, !!rdv1()?.data.confirmeeParLaClienteLe, db.journal_gestes.length, db.envois[0].data.reponse]);

scene({ texte: 'Je voudrais décaler mon rendez-vous de jeudi', sansPerle: true });
reponseDeClaude = () => outil('Bien sûr, Madame. Voici d’autres places.', 'deplacer');
const k4 = await appelle({ corps: demande });
dit('K4 sans mot de Perle, son prochain rendez-vous : deplacer offert et ecrit, ni garder ni envie ni locks',
  [true, false, false, false, true, 'deplacer', 'rdv-1'],
  [schemaRecu().includes('"deplacer"'), schemaRecu().includes('garder-oui'), schemaRecu().includes('"envie"'), schemaRecu().includes('locks-defaits'), !!rdv1()?.data.autreMomentDemandeLe, k4.corps.suite, k4.corps.rdvId]);

scene({ texte: 'J’ai coupé mes locks', sansPerle: true });
db.appointments = [];
reponseDeClaude = () => outil('C’est noté, Madame.', 'locks-defaits');
const k5 = await appelle({ corps: demande });
dit('K5 sans mot de Perle ni rendez-vous : aucun geste offert, et rendu quand meme la fiche ne bouge pas', [false, false, undefined],
  [schemaRecu().includes('locks-defaits'), k5.corps.ok, db.clients[0].data.locksDefaits]);

scene({ texte: 'Oui à jeudi, et ce sera combien ?' });
reponseDeClaude = () => outil('C’est noté, Madame. Ce sera 99 000 F.', 'garder-oui');
const k6 = await appelle({ corps: demande });
dit('K6 un geste dont le texte porte un montant hors catalogue : rien ne part ni ne s ecrit', [false, false], [k6.corps.ok, !!rdv1()?.data.confirmeeParLaClienteLe]);

delete env.ANTHROPIC_API_KEY;
remplis();
dit('sans la cle de Claude : ok faux, rien n est lu', [false, 'cle-claude-absente'], [(await appelle({ corps: demande })).corps.ok, (await appelle({ corps: demande })).corps.motif]);

console.log(ko ? `\n${ko} echec(s) sur ${n}.` : `\nLa reception tient (${n} controles).`);
if (ko) process.exitCode = 1;
