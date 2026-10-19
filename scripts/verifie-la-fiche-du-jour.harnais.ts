/* LA FICHE DU JOUR, ÉPROUVÉE — `node scripts/verifie-la-fiche-du-jour.mjs`.

   19 octobre 2026, chantier 7 des huit (maquette NKQMiMMY…, « Tout me
   va »). Le texte validé : « Awa K. · 10 h · Entretien · Maître : Brice.
   "Avant de la recevoir" : 4e entretien ; racines serrées la dernière fois,
   soin hydratant conseillé. / Elle a parlé de vacances en décembre 2026 :
   proposer une date avant le départ. / Reste 5 000 F sur son rituel du
   2 octobre 2026. Trois lignes, jamais plus. » Sa décision : « En ouvrant le
   rendez-vous : écrite à ce moment-là, gardée pour la journée. Rien ne
   tourne la nuit. » Accès : direction, Clientèle, Atelier.

   LES ATTENTES VIENNENT DE CES CHOIX, JAMAIS DU CODE. Données d'exemple.
   Aucun appel à la vraie fonction : le magasin tourne sur un faux Claude
   (voir le .mjs), qui compte les appels. */
import { readFileSync, readdirSync } from 'node:fs';
import {
  BILANS_RETENUS, CHANTIER_FICHE_DU_JOUR, CLE_DES_FICHES_DU_JOUR, GARDE_DES_FICHES_JOURS, LIGNES_MAX, LIGNE_PREMIERE_VENUE,
  MESSAGES_RETENUS, MOTS_MAX_PAR_LIGNE, RITUELS_RETENUS, SCHEMA_DE_LA_FICHE, SIGNES_MAX_PAR_LIGNE, USAGE_FICHE_DU_JOUR,
  aPreparer, aujourdhuiACotonou, consigneDeLaFiche, dateDite, ficheValable, fichesPurgees, heureDeLInstant, heureDite, jourDeLInstant, jourPlus,
  lectureDeLaFiche, lignesGardees, matiere, matiereVide, montantsDits, montantsPermis, personnesDe, prenomDeLaFiche,
  type FicheGardee, type FichesDuJour, type MatiereDeLaFiche,
} from '../src/shared/ia-fiche-du-jour-pur';
import { fichesDuJourStore, ficheEnCours, prepareLaFiche, purgeLesFiches } from '../src/shared/ia-fiche-du-jour';
import { DEPARTEMENTS_PAR_CHANTIER, defautDeLaDemande, peutDemander, type DemandeIa } from '../src/shared/ia-maison-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const PUR = 'src/shared/ia-fiche-du-jour-pur.ts';
const MAGASIN = 'src/shared/ia-fiche-du-jour.ts';
const ECRAN = 'src/apps/trone/routes/clients/FicheDuJour.tsx';
const FICHE_DU_RDV = 'src/apps/trone/routes/clients/_shared.tsx';

/* ── 1. LA MATIÈRE : RASSEMBLÉE, ANONYMISÉE, DATÉE ──────────────────── */
dit('ses choix : trois lignes, vingt mots, 6 rituels, 3 bilans, 6 messages, sept jours de garde',
  [3, 20, 6, 3, 6, 7], [LIGNES_MAX, MOTS_MAX_PAR_LIGNE, RITUELS_RETENUS, BILANS_RETENUS, MESSAGES_RETENUS, GARDE_DES_FICHES_JOURS]);
dit('le chantier et son usage : fiche-du-jour, le modèle rapide (texte), un document mnd_ia_fiches_du_jour',
  ['fiche-du-jour', 'texte', 'mnd_ia_fiches_du_jour'], [CHANTIER_FICHE_DU_JOUR, USAGE_FICHE_DU_JOUR, CLE_DES_FICHES_DU_JOUR]);
dit('une date se dit avec son année, « 1er » compris ; une date illisible ne s invente pas',
  ['2 octobre 2026', '1er janvier 2027', '', '', '19 octobre 2026'],
  [dateDite('2026-10-02'), dateDite('2027-01-01'), dateDite('n importe quoi'), dateDite('2026-13-40'), dateDite('2026-10-19T10:00:00Z')]);
dit('l heure se dit à la française', ['10 h', '14 h 30', ''], [heureDite('10:00'), heureDite('14:30'), heureDite('')]);
dit('prénom et initiale, la règle de l anonymiseur ; sans nom, le prénom ; sans rien, « la cliente »',
  ['Awa K.', 'Awa', 'la cliente'], [prenomDeLaFiche('Awa Kossou Dossou'), prenomDeLaFiche('Awa'), prenomDeLaFiche('  ')]);
dit('les formes du nom à reconnaître : le nom entier derrière le prénom, puis chaque nom seul',
  [{ prenom: 'Awa', nom: 'Kossou Dossou' }, { nom: 'Kossou' }, { nom: 'Dossou' }], personnesDe('Awa Kossou Dossou'));
dit('... mais pas une particule seule (« De », « La ») : ce sont aussi des mots de tous les jours',
  [{ prenom: 'Marie', nom: 'De La Fontaine' }, { nom: 'Fontaine' }], personnesDe('Marie De La Fontaine'));

/* UNE FICHE ENTIÈRE, AVEC TOUT CE QUI NE DOIT PAS PARTIR : numéros, adresse,
   ville, nom entier, et les papiers de la famille (la bourse scolaire). On la
   passe telle quelle : la matière ne doit en LIRE que le nom et l'arrivée. */
const CLIENTE = {
  id: 'c-awa', name: 'Awa Kossou Dossou', phone: '+229 01 97 00 00 00', phone2: '0196112233', email: 'awa@exemple.bj',
  city: 'Cotonou', since: '2024-03-10', notes: 'Rappeler au 0197000000', lockCount: 320,
  bourse: { lycee: 'Lycée Béhanzin', passeport: 'B1234567', revenu: 450000 }, famille: { mere: 'Rosine Dossou' },
};
const honore = (date: string, prestations: string[], note?: string) => ({ date, time: '10:00', status: 'honoré', prestations, maitre: 'Brice', note });
const RITUELS = [
  honore('2026-10-02', ['Entretien'], 'Racines serrées · Rappeler Awa Kossou Dossou au 01 96 11 22 33 · soeur@mail.com · Dossou a aimé le soin'),
  honore('2026-09-04', ['Entretien', 'Soin hydratant']),
  honore('2026-08-07', ['Entretien']),
  honore('2026-07-10', ['Entretien']),
  honore('2026-06-12', ['Entretien']),
  honore('2026-05-15', ['Entretien']),
  honore('2026-04-17', ['Entretien']),
  honore('2026-03-20', ['Pose']),
  { date: '2026-09-20', time: '09:00', status: 'annulé', prestations: ['Entretien'], maitre: 'Brice' },
  { date: '2026-09-28', time: '09:00', status: 'confirmé', prestations: ['Entretien'], maitre: 'Brice' },
  { date: '2026-10-25', time: '09:00', status: 'confirmé', prestations: ['Entretien'], maitre: 'Brice' },
];
const bilan = (date: string, diagnostic: string) => ({
  date, prestation: 'Entretien', diagnostic, sens: 'Les racines tiennent.', solutions: 'Un soin hydratant à la prochaine venue.',
  points: ['Racines serrées', 'Cuir chevelu apaisé', 'Pointes sèches', 'Un quatrième point de trop'], resume: 'Tout va bien.', prochaineVisite: 'dans quatre semaines',
});
const BILANS = [
  bilan('2026-07-10', 'Ancien bilan.'), bilan('2026-10-02', 'Racines serrées, Awa Dossou a bien suivi la routine.'),
  bilan('2026-09-04', 'Bilan de septembre.'), bilan('2026-08-07', 'Bilan d août.'),
];
const MESSAGES = [
  { canal: 'whatsapp' as const, quand: '2026-10-15T09:12:00Z', texte: 'Bonjour, je pars en vacances en décembre 2026. Mon nouveau numéro : 0197000000' },
  { canal: 'entre-deux' as const, quand: '2026-10-09T18:00:00Z', soucis: ['Locks sèches'], texte: 'Ça tire un peu aux racines.' },
  { canal: 'entre-deux' as const, quand: '2026-09-11T18:00:00Z', bien: true },
  { canal: 'whatsapp' as const, quand: '2026-09-02T08:00:00Z', texte: 'Merci pour le soin !' },
  { canal: 'entre-deux' as const, quand: '2026-08-14T18:00:00Z', soucis: ['Démangeaisons'] },
  { canal: 'whatsapp' as const, quand: '2026-08-01T08:00:00Z', texte: 'Je confirme mon rendez-vous.' },
  { canal: 'entre-deux' as const, quand: '2026-07-17T18:00:00Z', bien: true },
  { canal: 'whatsapp' as const, quand: '2026-06-20T08:00:00Z', texte: 'Un message trop vieux pour compter.' },
  { canal: 'whatsapp' as const, quand: '2026-10-16T08:00:00Z', texte: '   ' },
];
const RESTE = [{ xof: 5000, rituelDu: '2026-10-02' }, { xof: 0, rituelDu: '2026-09-04' }, { xof: 2500.4, rituelDu: '2026-08-07' }, { xof: -300, rituelDu: '2026-07-10' }];
const PROCHAIN = { date: '2026-10-19', time: '10:00', prestations: ['Entretien'], maitre: 'Brice' };

const m = matiere(CLIENTE, RITUELS, BILANS, MESSAGES, RESTE, PROCHAIN);
const brut = JSON.stringify(m);
dit('la tête : prénom et initiale, l année d arrivée, le compte des venues honorées', { prenom: 'Awa K.', depuis: '2024', venues: 8 }, m.tete);
dit('ni numéro, ni adresse, ni ville, ni nom entier ne partent (fiche, note du carnet, message)',
  [false, false, false, false, false, false, false, false],
  [brut.includes('97 00 00'), brut.includes('0196112233'), brut.includes('96 11 22 33'), brut.includes('0197000000'),
    brut.includes('awa@exemple'), brut.includes('soeur@mail'), brut.includes('Cotonou'), /Kossou|Dossou/.test(brut)]);
dit('les papiers de la famille ne partent JAMAIS (bourse, passeport, revenu, mère)', [false, false, false, false, false, false],
  [brut.includes('bourse'), brut.includes('Béhanzin'), brut.includes('B1234567'), brut.includes('450000'), brut.includes('Rosine'), brut.includes('famille')]);
dit('le compte de locks et les notes de la fiche ne partent pas non plus', [false, false], [brut.includes('320'), brut.includes('Rappeler au')]);
dit('les clés qui partent sont celles de la matière, rien d autre', ['bilans', 'messages', 'prochain', 'reste', 'rituels', 'tete'], Object.keys(m).sort());
dit('son nom dans une note devient prénom et initiale', true, /Rappeler Awa K\. au \[numéro\]/.test(m.rituels[0].note ?? ''));
dit('les six derniers rituels HONORÉS avant le rendez-vous, les plus récents d abord ; l annulé, le jamais honoré et l à-venir n y sont pas',
  ['2 octobre 2026', '4 septembre 2026', '7 août 2026', '10 juillet 2026', '12 juin 2026', '15 mai 2026'], m.rituels.map((r) => r.le));
dit('un rituel dit ses prestations et son maître', [['Entretien', 'Soin hydratant'], 'Brice'], [m.rituels[1].prestations, m.rituels[1].maitre]);
dit('les trois derniers bilans, les plus récents d abord, trois points au plus',
  [['2 octobre 2026', '4 septembre 2026', '7 août 2026'], 3], [m.bilans.map((b) => b.le), m.bilans[0].points.length]);
dit('le bilan dit ce qu on a vu, anonymisé, et ce qu on propose', ['Racines serrées, Awa D. a bien suivi la routine.', 'Un soin hydratant à la prochaine venue.'], [m.bilans[0].vu, m.bilans[0].propose]);
dit('les six derniers messages, Entre deux séances et WhatsApp confondus, les plus récents d abord ; un message blanc ne compte pas',
  ['15 octobre 2026', '9 octobre 2026', '11 septembre 2026', '2 septembre 2026', '14 août 2026', '1er août 2026'], m.messages.map((x) => x.le));
dit('un message d Entre deux séances dit ses soucis ou « tout va bien » ; le canal est nommé',
  ['Entre deux séances', 'Soucis : Locks sèches. Ça tire un peu aux racines.', 'Tout va bien.', 'WhatsApp'],
  [m.messages[1].canal, m.messages[1].texte, m.messages[2].texte, m.messages[0].canal]);
dit('le reste dû : les montants positifs, arrondis, avec la date du rituel et son année',
  [{ xof: 5000, rituelDu: '2 octobre 2026' }, { xof: 2500, rituelDu: '7 août 2026' }], m.reste);
dit('le rendez-vous qui vient : le jour avec l année, l heure, la prestation, le maître',
  { le: '19 octobre 2026', heure: '10 h', prestations: ['Entretien'], maitre: 'Brice' }, m.prochain);
dit('toute date de la matière porte son année', true,
  [...m.rituels.map((r) => r.le), ...m.bilans.map((b) => b.le), ...m.messages.map((x) => x.le), ...m.reste.map((r) => r.rituelDu), m.prochain.le].every((d) => /\b\d{4}$/.test(d)));
dit('une première venue : rien à lire, la Maison le sait sans appel', [true, false],
  [matiereVide(matiere({ name: 'Ola Sow' }, [], [], [], [], PROCHAIN)), matiereVide(matiere({ name: 'Ola Sow' }, [], [], [MESSAGES[0]], [], PROCHAIN))]);
dit('une fiche sans nom ne casse rien', 'la cliente', matiere({ name: '' }, [], [], [], [], PROCHAIN).tete.prenom);
{
  /* Reprise du 19 octobre 2026 : le jour d'un message est celui de COTONOU
     (0 h 30 le 15 à Cotonou = 23 h 30 le 14 en UTC), les instants se trient
     en millisecondes, une demande du site se dit « Le site ». */
  const nuit = matiere({ name: 'Marie De La Fontaine' }, [honore('2026-10-02', ['Entretien'], 'La racine tire, Marie De La Fontaine l a dit')], [], [
    { canal: 'whatsapp', quand: '2026-10-14T23:30:00Z', texte: 'Avant' },
    { canal: 'whatsapp', quand: '2026-10-14T23:30:00.500Z', texte: 'Après' },
    { canal: 'site', quand: '2026-10-14T22:00:00Z', texte: 'Demande de pose depuis le site' },
  ], [], PROCHAIN);
  dit('un message de 0 h 30 à Cotonou porte le jour de Cotonou', ['15 octobre 2026', '15 octobre 2026', '14 octobre 2026'], nuit.messages.map((x) => x.le));
  dit('les instants se trient en millisecondes, pas en texte (« .500Z » est après « Z »)', ['Après', 'Avant', 'Demande de pose depuis le site'], nuit.messages.map((x) => x.texte));
  dit('une demande du site n est pas un WhatsApp : « Le site »', 'Le site', nuit.messages[2].canal);
  dit('une particule du nom ne mange pas les mots de la note ; le nom entier, si', 'La racine tire, Marie D. l a dit', nuit.rituels[0].note);
}

/* ── 2. LA CONSIGNE : CE QU'ELLE INTERDIT ───────────────────────────── */
{
  const c = consigneDeLaFiche();
  dit('la consigne : trois lignes au plus, vingt mots, l ordre locks / à lui dire / ce qu elle doit', [true, true, true],
    [/JAMAIS plus de trois/.test(c), /20 mots au plus/.test(c), /1\) où en sont ses locks ; 2\) ce qu’il faut lui dire ; 3\) ce qu’elle doit encore/.test(c)]);
  dit('... rien d inventé : une ligne de moins, ou « première venue »', [true, true, true],
    [/N’inventez rien/.test(c), /une ligne de moins/.test(c), c.includes(LIGNE_PREMIERE_VENUE)]);
  dit('... jamais de prix sauf le reste dû tel qu il est donné, avec l année', [true, true], [/JAMAIS de prix/.test(c), /reste dû tel qu’il est donné/.test(c)]);
  dit('... aucun conseil médical, jamais « salon », pas de tiret cadratin, l année sur les dates, prénom et initiale', [true, true, true, true, true],
    [/Aucun avis ni conseil médical/.test(c), /jamais le mot « salon »/.test(c), /Pas de tiret cadratin/.test(c), /Toute date porte son année/.test(c), /prénom et l’initiale/.test(c)]);
  dit('... elle est pour le maître et l accueil de la Maison MND', true, /pour le maître et pour l’accueil de la Maison MND/.test(c));
  dit('la forme attendue : { lignes: string[] }, sans bornes dans le schéma (la relecture borne)', [true, false],
    [JSON.stringify(SCHEMA_DE_LA_FICHE).includes('"lignes":{"type":"array","items":{"type":"string"}'), /maxItems|minItems|maxLength/.test(JSON.stringify(SCHEMA_DE_LA_FICHE))]);
}

/* ── 3. LA LECTURE : ON NE FAIT PAS CONFIANCE À LA SORTIE ───────────── */
dit('quatre lignes rendues, trois gardées', ['Un', 'Deux', 'Trois'], lectureDeLaFiche({ lignes: ['Un', 'Deux', 'Trois', 'Quatre'] }));
dit('une ligne vide ou illisible tombe', ['Une seule'], lectureDeLaFiche({ lignes: ['', '   ', 42, null, 'Une seule'] }));
dit('« salon » est refusé, la ligne entière', ['Racines à regarder à la séance.'], lectureDeLaFiche({ lignes: ['Revenez au salon vendredi.', 'Racines à regarder à la séance.'] }));
dit('un prix qui n est pas le reste dû donné est refusé ; le reste dû tel qu il est donné passe',
  [[], ['Reste 5 000 F sur son rituel du 2 octobre 2026.'], []],
  [lectureDeLaFiche({ lignes: ['Un soin coûte 15 000 F.'] }, [5000]), lectureDeLaFiche({ lignes: ['Reste 5 000 F sur son rituel du 2 octobre 2026.'] }, [5000]),
    lectureDeLaFiche({ lignes: ['Reste 5 000 F sur son rituel du 2 octobre 2026.'] }, [])]);
dit('... un prix SANS sa monnaie est un prix aussi (« 15 000 », « 15000 »)', [[], []],
  [lectureDeLaFiche({ lignes: ['Un soin à 15 000 pour la prochaine fois.'] }, [5000]), lectureDeLaFiche({ lignes: ['Prévoir 15000 pour le soin.'] }, [5000])]);
dit('... la somme de ses restes dus passe ; un seul reste ne permet pas de somme', [['Reste 7 500 F en tout sur ses rituels de 2026.'], []],
  [lectureDeLaFiche({ lignes: ['Reste 7 500 F en tout sur ses rituels de 2026.'] }, [5000, 2500]), lectureDeLaFiche({ lignes: ['Reste 7 500 F en tout sur ses rituels de 2026.'] }, [5000])]);
dit('... une date, une heure, un rang ne sont pas des prix (« le 2 février 2027 » passe)',
  ['Elle revient le 2 février 2027, proposer une date avant.', '4e entretien à 10 h, le 1er décembre 2026.'],
  lectureDeLaFiche({ lignes: ['Elle revient le 2 février 2027, proposer une date avant.', '4e entretien à 10 h, le 1er décembre 2026.'] }, [5000]));
dit('les montants qu une ligne écrit', [[5000], [15000, 3000], [], [15000], [2500], [1200], [12000]],
  [montantsDits('Reste 5 000 F le 2 octobre 2026'), montantsDits('15000 FCFA puis 3 000 francs'), montantsDits('4e entretien, 10 h, le 2 février 2027'),
    montantsDits('Un soin à 15 000'), montantsDits('2 500 XOF'), montantsDits('1 200 F CFA'), montantsDits('12000')]);
dit('les montants permis : chaque reste, et leur somme quand il y en a plusieurs', [[5000], [5000, 2500, 7500], []],
  [montantsPermis([5000]), montantsPermis([5000, 2500]), montantsPermis([0, -3])]);
dit('un numéro ou une adresse glissés dans une ligne la font tomber', [], lectureDeLaFiche({ lignes: ['La rappeler au 01 97 00 00 00.', 'Écrire à awa@exemple.bj'] }));
dit('le tiret long devient une virgule ; la puce et le numéro en tête s effacent ; les blancs se resserrent',
  ['Racines serrées la dernière fois, soin hydratant conseillé.', 'Elle part en décembre 2026.'],
  lectureDeLaFiche({ lignes: ['1. Racines serrées la dernière fois — soin hydratant conseillé.', '-   Elle part   en décembre 2026.'] }));
{
  const longue = lectureDeLaFiche({ lignes: ['mot '.repeat(80)] })[0];
  dit('une ligne trop longue est coupée proprement', [true, true], [longue.length <= SIGNES_MAX_PAR_LIGNE, longue.endsWith('…')]);
}
dit('une sortie abîmée ne casse rien : rien, un texte, une liste nue', [[], ['A', 'B'], ['C']],
  [lectureDeLaFiche(null), lectureDeLaFiche('A\nB\n'), lectureDeLaFiche(['C'])]);
dit('un objet sans lignes rend vide', [], lectureDeLaFiche({ texte: 'pas la bonne forme' }));
dit('une fiche gardée se relit aussi à l écran : des textes, trois au plus', [['A', 'B', 'C'], []],
  [lignesGardees({ jour: '2026-10-19', lignes: ['A', 42, '  ', 'B', 'C', 'D'] as never, le: '2026-10-19T08:00:00Z', modele: 'm' }), lignesGardees(undefined)]);

/* ── 4. LA GARDE : ÉCRITE À L'OUVERTURE, GARDÉE POUR LA JOURNÉE ─────── */
{
  const f = { jour: '2026-10-22', lignes: ['Une ligne'], le: '2026-10-19T09:12:00.000Z', modele: 'claude-haiku-5-5' };
  dit('même rendez-vous, même jour : la fiche gardée sert, pas de second appel', true, ficheValable(f, '2026-10-22', '2026-10-19'));
  dit('le jour suivant : périmée, elle se refait à l ouverture', false, ficheValable(f, '2026-10-22', '2026-10-20'));
  dit('le rendez-vous déplacé : périmée aussi', false, ficheValable(f, '2026-10-23', '2026-10-19'));
  dit('rien de gardé, ou une entrée abîmée : à écrire', [false, false, false],
    [ficheValable(undefined, '2026-10-22', '2026-10-19'), ficheValable({ jour: '2026-10-22', le: '2026-10-19T09:00:00Z' } as never, '2026-10-22', '2026-10-19'),
      ficheValable({ ...f, le: 'jamais' }, '2026-10-22', '2026-10-19')]);
  /* LA JOURNÉE EST CELLE DE COTONOU (UTC+1) : écrite à 0 h 30 le 19 octobre
     2026 (23 h 30 le 18 en UTC), elle vaut le 19 ; écrite à 0 h 30 le 20,
     elle ne vaut plus le 19. */
  dit('la journée est celle de Cotonou : 0 h 30 le 19 octobre 2026 vaut pour le 19, pas pour le 18', [true, false, false, true],
    [ficheValable({ ...f, le: '2026-10-18T23:30:00Z' }, '2026-10-22', '2026-10-19'), ficheValable({ ...f, le: '2026-10-18T23:30:00Z' }, '2026-10-22', '2026-10-18'),
      ficheValable({ ...f, le: '2026-10-19T23:30:00Z' }, '2026-10-22', '2026-10-19'), ficheValable({ ...f, le: '2026-10-19T23:30:00Z' }, '2026-10-22', '2026-10-20')]);
  dit('aujourd hui à Cotonou, l heure à Cotonou', ['2026-10-19', '2026-10-19', '9 h 12', '10 h', '', '2026-10-19', '2026-10-19', ''],
    [aujourdhuiACotonou(new Date('2026-10-18T23:30:00Z')), aujourdhuiACotonou(new Date('2026-10-19T22:59:00Z')),
      heureDeLInstant('2026-10-19T08:12:00Z'), heureDeLInstant('2026-10-19T09:00:00Z'), heureDeLInstant('x'),
      jourDeLInstant('2026-10-19'), jourDeLInstant('2026-10-18T23:30:00Z'), jourDeLInstant('jamais')]);
  const fiches: FichesDuJour = {
    'rdv-vieille': { jour: '2026-10-11', lignes: ['x'], le: '2026-10-11T08:00:00Z', modele: 'm' },
    /* 23 h 59 le 11 à Cotonou : huit jours avant le 19, dehors. */
    'rdv-huit': { jour: '2026-10-11', lignes: ['x'], le: '2026-10-11T22:59:00Z', modele: 'm' },
    /* 0 h 01 le 12 à Cotonou (23 h 01 le 11 en UTC) : sept jours pile, gardée. */
    'rdv-sept': { jour: '2026-10-12', lignes: ['x'], le: '2026-10-11T23:01:00Z', modele: 'm' },
    'rdv-hier': { jour: '2026-10-18', lignes: ['x'], le: '2026-10-18T10:00:00Z', modele: 'm' },
    'rdv-abimee': { jour: '2026-10-18' } as never,
    'rdv-sans-date': { jour: '2026-10-18', lignes: ['x'], le: 'jamais', modele: 'm' },
  };
  dit('la purge : plus de sept jours (à Cotonou), dehors ; sept jours pile, gardée ; une entrée abîmée ou sans date part', ['rdv-sept', 'rdv-hier'], Object.keys(fichesPurgees(fiches, '2026-10-19')));
  const rien: FichesDuJour = { a: { jour: '2026-10-19', lignes: [], le: '2026-10-19T08:00:00Z', modele: 'm' } };
  dit('rien à purger : le même objet revient (le magasin ne réécrit rien)', true, fichesPurgees(rien, '2026-10-19') === rien);
  dit('un document vide ou absent ne casse rien', [{}, {}], [fichesPurgees(null, '2026-10-19'), fichesPurgees(undefined, '2026-10-19')]);
  dit('la limite de la garde se compte en jours', '2026-10-12', jourPlus('2026-10-19', -GARDE_DES_FICHES_JOURS));
}
dit('la fiche ne se prépare que pour un rendez-vous du jour ou à venir, qui attend encore la cliente',
  [true, true, false, false, false, true],
  [aPreparer({ date: '2026-10-19', status: 'confirmé' }, '2026-10-19'), aPreparer({ date: '2026-10-25', status: 'en attente' }, '2026-10-19'),
    aPreparer({ date: '2026-10-18', status: 'confirmé' }, '2026-10-19'), aPreparer({ date: '2026-10-19', status: 'honoré' }, '2026-10-19'),
    aPreparer({ date: '2026-10-25', status: 'annulé' }, '2026-10-19'), aPreparer({ date: '2026-10-19' }, '2026-10-19')]);

/* ── 5. LE MAGASIN, POUR DE VRAI, SUR UN FAUX CLAUDE ─────────────────── */
{
  const appels: DemandeIa[] = [];
  let reponse: (d: DemandeIa) => unknown = () => ({
    ok: true, texte: '', modele: 'claude-haiku-5-5', coutUsd: 0.001, resteUsd: 59,
    data: { lignes: [
      '4e entretien ; racines serrées la dernière fois — soin hydratant conseillé.',
      'Elle a parlé de vacances en décembre 2026 : proposer une date avant le départ.',
      'Reste 5 000 F sur son rituel du 2 octobre 2026.',
      'Une quatrième ligne de trop.',
    ] },
  });
  let ouvre: () => void = () => {};
  let retenue: Promise<void> | null = null;
  (globalThis as { __fauxClaude?: unknown }).__fauxClaude = async (d: DemandeIa) => {
    appels.push(d);
    if (retenue) await retenue;
    return reponse(d);
  };
  let compositions = 0;
  const compose = (): MatiereDeLaFiche => { compositions++; return m; };
  const LUNDI = new Date('2026-10-19T08:00:00Z');   // 9 h à Cotonou, le 19 octobre 2026
  const LUNDI_SOIR = new Date('2026-10-19T19:00:00Z');
  const MARDI = new Date('2026-10-20T08:00:00Z');
  const gardee = (id: string): FicheGardee | undefined => fichesDuJourStore.get()[id];
  const ATTENDUES = [
    '4e entretien ; racines serrées la dernière fois, soin hydratant conseillé.',
    'Elle a parlé de vacances en décembre 2026 : proposer une date avant le départ.',
    'Reste 5 000 F sur son rituel du 2 octobre 2026.',
  ];

  /* a. Le Carnet et le Calendrier ouvrent le même rendez-vous ensemble. */
  retenue = new Promise<void>((r) => { ouvre = r; });
  const p1 = prepareLaFiche('rdv-awa', '2026-10-19', compose, 'ouverture', LUNDI);
  const p2 = prepareLaFiche('rdv-awa', '2026-10-19', compose, 'ouverture', LUNDI);
  const pendant = ficheEnCours('rdv-awa');
  ouvre(); retenue = null;
  const [r1, r2] = await Promise.all([p1, p2]);
  dit('deux ouvertures du même rendez-vous en même temps : UN appel, la même fiche pour les deux', [1, true, true, true],
    [appels.length, pendant, r1.ok && r2.ok, JSON.stringify(r1) === JSON.stringify(r2)]);
  dit('... la fiche est relue (trois lignes, tiret long remplacé) et gardée pour CE jour de rendez-vous, avec son heure et son modèle',
    { jour: '2026-10-19', lignes: ATTENDUES, le: '2026-10-19T08:00:00.000Z', modele: 'claude-haiku-5-5' }, gardee('rdv-awa'));
  dit('... plus rien en cours après', false, ficheEnCours('rdv-awa'));

  /* b. Ce qui part chez Claude. */
  const d = appels[0];
  dit('la demande : le chantier fiche-du-jour, le modèle rapide, la consigne, la forme, quatre cents jetons, aucune image',
    ['fiche-du-jour', 'texte', true, true, 400, undefined],
    [d.chantier, d.usage, d.systeme === consigneDeLaFiche(), JSON.stringify(d.schema) === JSON.stringify(SCHEMA_DE_LA_FICHE), d.maxTokens, d.images]);
  dit('... recevable par la porte commune (le contrat ia-maison)', null, defautDeLaDemande(d));
  dit('... un seul message, de la Maison, qui porte la matière anonymisée et rien d autre', [1, 'user', true, false, false],
    [d.messages.length, d.messages[0].role, JSON.stringify(JSON.parse(d.messages[0].content)) === JSON.stringify(m),
      /Kossou|Dossou|0197000000|awa@exemple/.test(d.messages[0].content), /B1234567|Béhanzin/.test(d.messages[0].content)]);

  /* c. On la rouvre dans la journée. */
  const r3 = await prepareLaFiche('rdv-awa', '2026-10-19', compose, 'ouverture', LUNDI_SOIR);
  dit('rouverte le soir même : la fiche gardée sert, AUCUN appel, la matière ne se recompose même pas', [1, 1, true],
    [appels.length, compositions, r3.ok && JSON.stringify(r3.fiche.lignes) === JSON.stringify(ATTENDUES)]);

  /* c'. La fiche écrite par UN AUTRE POSTE (le Calendrier de l'accueil),
     arrivée par le document : ce poste-ci ne l'a jamais demandée. */
  fichesDuJourStore.set((prev) => ({ ...prev, 'rdv-autre-poste': { jour: '2026-10-19', lignes: ['Écrite à l accueil.'], le: '2026-10-19T07:30:00.000Z', modele: 'claude-haiku-5-5' } }));
  const r5 = await prepareLaFiche('rdv-autre-poste', '2026-10-19', compose, 'ouverture', LUNDI_SOIR);
  dit('la fiche écrite par un autre poste sert telle quelle : personne ne paie deux fois la même journée', [1, 1, ['Écrite à l accueil.']],
    [appels.length, compositions, r5.ok ? r5.fiche.lignes : []]);
  fichesDuJourStore.set((prev) => { const { ['rdv-autre-poste']: _lue, ...reste } = prev; return reste; });

  /* d. Le lendemain. */
  await prepareLaFiche('rdv-awa', '2026-10-19', compose, 'ouverture', MARDI);
  dit('le lendemain : périmée, elle se refait à l ouverture (un appel de plus), écrite le 20', [2, '2026-10-20T08:00:00.000Z'], [appels.length, gardee('rdv-awa')?.le]);

  /* e. « Refaire ». */
  reponse = () => ({ ok: true, texte: '', modele: 'claude-sonnet-5-5', coutUsd: 0.002, resteUsd: 58, data: { lignes: ['Racines à regarder à la séance.'] } });
  await prepareLaFiche('rdv-awa', '2026-10-19', compose, 'refaire', MARDI);
  dit('« Refaire » redemande même quand la fiche du jour est là, et la remplace', [3, ['Racines à regarder à la séance.'], 'claude-sonnet-5-5'],
    [appels.length, gardee('rdv-awa')?.lignes, gardee('rdv-awa')?.modele]);

  /* f. La fiche gardée s'est perdue (un autre poste a réécrit le document). */
  fichesDuJourStore.set((prev) => { const { ['rdv-awa']: _perdue, ...reste } = prev; return reste; });
  const r4 = await prepareLaFiche('rdv-awa', '2026-10-19', compose, 'ouverture', MARDI);
  dit('la fiche perdue en route : la réouverture montre la dernière réponse du jour, sans repayer', [3, true],
    [appels.length, r4.ok && JSON.stringify(r4.fiche.lignes) === JSON.stringify(['Racines à regarder à la séance.'])]);

  /* g. Claude échoue (le plafond du mois, par exemple). */
  reponse = () => ({ ok: false, erreur: 'budget', message: 'Le plafond du mois est atteint.' });
  const e1 = await prepareLaFiche('rdv-erreur', '2026-10-19', compose, 'ouverture', LUNDI);
  const apresLEchec = appels.length;
  const e2 = await prepareLaFiche('rdv-erreur', '2026-10-19', compose, 'ouverture', LUNDI_SOIR);
  dit('un échec : rien n est gardé, le message est dit ; rouvrir le même jour ne redemande PAS', [4, false, 'Le plafond du mois est atteint.', 4, 'Le plafond du mois est atteint.'],
    [apresLEchec, 'rdv-erreur' in fichesDuJourStore.get(), e1.ok ? '' : e1.message, appels.length, e2.ok ? '' : e2.message]);
  await prepareLaFiche('rdv-erreur', '2026-10-19', compose, 'refaire', LUNDI_SOIR);
  dit('... « Refaire » redemande, lui', 5, appels.length);

  /* h. Claude jette une erreur au lieu de répondre. */
  reponse = () => { throw new Error('coupure'); };
  const e3 = await prepareLaFiche('rdv-coupure', '2026-10-19', compose, 'ouverture', LUNDI);
  dit('une exception ne casse rien : une réponse « non », rien de gardé', [false, false], [e3.ok, 'rdv-coupure' in fichesDuJourStore.get()]);

  /* i. Une première venue. */
  const avant = appels.length;
  const premiere = await prepareLaFiche('rdv-ola', '2026-10-19', () => matiere({ name: 'Ola Sow' }, [], [], [], [], PROCHAIN), 'ouverture', LUNDI);
  dit('une première venue : AUCUN appel, la Maison écrit sa ligne elle-même', [0, [LIGNE_PREMIERE_VENUE], 'maison', true],
    [appels.length - avant, gardee('rdv-ola')?.lignes, gardee('rdv-ola')?.modele, premiere.ok]);

  /* j. La purge à l'ouverture. */
  fichesDuJourStore.set((prev) => ({ ...prev, 'rdv-vieille': { jour: '2026-10-01', lignes: ['x'], le: '2026-10-01T08:00:00Z', modele: 'm' } }));
  purgeLesFiches('2026-10-20');
  dit('purgeLesFiches retire la fiche de plus de sept jours et garde celle du jour', ['rdv-ola'], Object.keys(fichesDuJourStore.get()));
  const objet = fichesDuJourStore.get();
  purgeLesFiches('2026-10-20');
  dit('... et n écrit rien quand il n y a rien à purger', true, fichesDuJourStore.get() === objet);
}

/* ── 6. LA PORTE : DIRECTION, CLIENTÈLE, ATELIER ───────────────────── */
dit('la fiche du jour est ouverte à la Clientèle et à l Atelier (la direction a tout)', ['dept-clientele', 'dept-atelier'], DEPARTEMENTS_PAR_CHANTIER['fiche-du-jour']);
dit('qui peut demander : souverain, gérant, un maître de la Clientèle ou de l Atelier ; pas les Finances, pas sans rôle',
  [true, true, false, true, true, false, false],
  [peutDemander('souverain', 'fiche-du-jour', {}), peutDemander('gerant', 'fiche-du-jour', {}), peutDemander('maitre', 'fiche-du-jour', {}),
    peutDemander('maitre', 'fiche-du-jour', { 'dept-clientele': true }), peutDemander('maitre', 'fiche-du-jour', { 'dept-atelier': true }),
    peutDemander('maitre', 'fiche-du-jour', { 'dept-finances': true }), peutDemander(undefined, 'fiche-du-jour', { 'dept-clientele': true })]);

/* ── 7. LA STRUCTURE : LE BLOC, LA PORTE, AUCUNE TÂCHE DE NUIT ──────── */
{
  const pur = sansCommentaires(lis(PUR));
  dit('le module pur ne touche ni magasin, ni synchro, ni réseau, ni écran', false, /from '\.\/(store|sync|supabase|ia-maison)'|from 'react'/.test(pur));
  dit('... chaque texte libre passe par pourClaude avant de partir', true, /pourClaude\(String\(t \?\? ''\), personnes\)/.test(pur));

  const magasin = sansCommentaires(lis(MAGASIN));
  dit('le magasin : un document synchronisé, sa clé en toutes lettres (verifie-cles-uniques), la même que CLE_DES_FICHES_DU_JOUR', [true, true],
    [magasin.includes(`createStore<FichesDuJour>('${CLE_DES_FICHES_DU_JOUR}', {})`), magasin.includes(`bindDocument(fichesDuJourStore, '${CLE_DES_FICHES_DU_JOUR}')`)]);
  dit('... la demande passe par la porte commune, au chantier fiche-du-jour, usage texte, avec la forme attendue', [true, true, true, true, false],
    [/demandeAClaude</.test(magasin), /chantier: CHANTIER_FICHE_DU_JOUR/.test(magasin), /usage: USAGE_FICHE_DU_JOUR/.test(magasin),
      /schema: SCHEMA_DE_LA_FICHE/.test(magasin), /functions\.invoke|fetch\(/.test(magasin)]);
  dit('... ce qui revient est relu, le reste dû donné pour seul prix admis', true, /lectureDeLaFiche\(r\.data, m\.reste\.map\(\(x\) => x\.xof\)\)/.test(magasin));
  dit('... rien ne tourne la nuit : ni minuterie, ni réveil, ni cron dans le magasin', false, /setInterval|setTimeout|requestIdleCallback|cron|schedule/i.test(magasin));

  const ecran = sansCommentaires(lis(ECRAN));
  dit('le bloc est gardé par la fonction posée ET le département de la personne', [true, true, true],
    [/const sait = useSaitIaMaison\(\);/.test(ecran), /peutDemander\(moi\.role, CHANTIER_FICHE_DU_JOUR, acces\)/.test(ecran), /const actif = sait === true && peut && preparable && !!client;/.test(ecran)]);
  dit('... seulement pour un rendez-vous du jour ou à venir (le jour de Cotonou) ; sinon rien', [true, true, true],
    [/const aujourdhui = aujourdhuiACotonou\(\);/.test(ecran), /const preparable = aPreparer\(appt, aujourdhui\);/.test(ecran), /if \(!actif\) return null;/.test(ecran)]);
  dit('... un seul chemin vers Claude, le magasin et son verrou ; l écran n appelle jamais la fonction lui-même', [true, false],
    [/prepareLaFiche\(appt\.id, appt\.date, \(\) => composeLaMatiere\(c\), quand\)/.test(ecran), /demandeAClaude|functions\.invoke|fetch\(/.test(ecran)]);
  dit('... à l ouverture, la fiche du jour sert telle quelle ; sinon une demande « ouverture »', [true, true],
    [/const valable = ficheValable\(gardee, appt\.date, aujourdhui\);/.test(ecran), /if \(valable\) return;\s*prepare\('ouverture'\);/.test(ecran)]);
  dit('... la purge des vieilles fiches à l ouverture, et le bouton discret « Refaire »', [true, true],
    [/purgeLesFiches\(aujourdhui\);/.test(ecran), /onClick=\{\(\) => prepare\('refaire'\)\} disabled=\{occupe\}>Refaire<\/Button>/.test(ecran)]);
  dit('... une proposition, teintée cuivre « à vérifier », relue avant d être montrée ; rien ne s inscrit sur la fiche, rien ne part', [true, true, false],
    [/Claude · à vérifier/.test(ecran), /const lignes = lignesGardees\(fiche\);/.test(ecran), /envoieSurWhatsApp|pushToClient|appointmentsStore\.set|clientsStore\.set|\.insert\(/.test(ecran)]);
  dit('... la matière se compose champ par champ (jamais la fiche entière)', [true, false], [/\{ name: c\.name, since: c\.since \}/.test(ecran), /matiere\(\s*c,|matiere\(client,/.test(ecran)]);
  dit('... un fil WhatsApp marqué privé n entre pas dans la matière ; seuls ses messages REÇUS y entrent', [true, true],
    [/!estFilPrive\(m\.numero, prives\)/.test(ecran), /m\.clientId === c\.id && m\.sens === 'entrant'/.test(ecran)]);
  dit('... aucune minuterie, aucun réveil, aucune liste du matin', false, /setInterval|setTimeout|requestIdleCallback|cron|schedule/i.test(ecran));
  dit('... jamais « salon », pas de tiret cadratin à l écran', [false, false], [/\bsalon/i.test(ecran), ecran.includes('—')]);
  {
    const retour = ecran.indexOf('if (!actif) return null;');
    const crochets = [...ecran.matchAll(/\buse[A-Z]\w*\(/g)].map((x) => x.index ?? -1);
    dit('... tous les crochets avant le premier retour (React n° 300)', true, retour > 0 && crochets.length > 0 && crochets.every((i) => i < retour));
  }

  const fiche = lis(FICHE_DU_RDV);
  const corps = sansCommentaires(fiche);
  const debutRdv = corps.indexOf('export function RdvModal(');
  const finRdv = corps.indexOf('export function PortesWhatsApp(');
  const montage = corps.indexOf('<FicheDuJour ');
  dit('la fiche du rendez-vous importe le bloc, une fois', 1, (corps.match(/import \{ FicheDuJour \} from '\.\/FicheDuJour';/g) ?? []).length);
  dit('... et le monte UNE fois, dans RdvModal, pour un rendez-vous existant, avec la cliente, le catalogue et le reste dû', [1, true, true],
    [(corps.match(/<FicheDuJour /g) ?? []).length, montage > debutRdv && montage < finRdv,
      /\{appt && <FicheDuJour appt=\{appt\} client=\{rdvClient\} byId=\{byId\} resteDu=\{\(a\) => apptDueXof\(a, byId\)\} \/>\}/.test(corps)]);

  /* RIEN NE TOURNE LA NUIT : aucune fonction Supabase, aucune migration,
     aucun cron ne connaît la fiche du jour.
     LA PORTE COMMUNE EST À PART (19 octobre 2026, à la fusion des huit
     chantiers) : `ia-maison` recopie le contrat, qui NOMME les huit chantiers
     (la liste `CHANTIERS_IA` et leurs départements), mais elle ne fait que
     répondre à une demande du Trône ; elle ne compose ni ne programme rien.
     On la juge sans cette copie : hors du bloc ⟨ia-maison⟩, elle ne doit pas
     plus connaître la fiche du jour que les autres. */
  const fonctions = readdirSync('supabase/functions').filter((d) => !d.startsWith('_'));
  const sansLeContrat = (src: string): string => src.replace(/\/\* ⟨ia-maison⟩ \*\/[\s\S]*?\/\* ⟨\/ia-maison⟩ \*\//, '');
  const fonctionsQuiLaConnaissent = fonctions.filter((d) => {
    try { return /fiche-du-jour|fiches_du_jour|FicheDuJour/.test(sansLeContrat(readFileSync(`supabase/functions/${d}/index.ts`, 'utf8'))); } catch { return false; }
  });
  dit('aucune fonction Supabase ne porte la fiche du jour (pas de tâche de nuit, pas de liste du matin)', [], fonctionsQuiLaConnaissent);
  const migrations = readdirSync('supabase/migrations').filter((f) => /mnd_ia_fiches_du_jour|fiche_du_jour|fiche-du-jour/.test(readFileSync(`supabase/migrations/${f}`, 'utf8')));
  dit('aucune migration, aucun cron : le document vit dans `documents`, réservé au personnel par 0130', [], migrations);
}

console.log(ko === 0 ? '\nTOUT VA BIEN : la fiche du jour tient ses promesses.' : `\n${ko} ÉCHEC(S)`);
if (ko) process.exitCode = 1;
