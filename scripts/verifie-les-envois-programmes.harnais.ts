/* LES ENVOIS PROGRAMMÉS, ÉPROUVÉS — `node scripts/verifie-les-envois-programmes.mjs`.

   13 novembre 2026. I. La règle pure. II. Le vrai facteur (envois-partent)
   contre une base, un Meta, un push-notify et une horloge simulés. III. Les
   écrans, lus. Personnes, numéros et messages inventés. Sortie ASCII : la
   console de Windows. */
import { readFileSync } from 'node:fs';
import {
  TYPE_PROGRAMME, A_VALIDER, ATTEND_SA_REPONSE, CONFIE_A_OPALE, PAR_L_APP, PIECE_A_TIRER, A_REVOIR,
  MOTIF_STOP, MOTIF_OPALE_ENDORMIE, MOTIF_MODELE_PAS_APPROUVE, MOTIF_SANS_REPONSE, MODELE_D_OUVERTURE, CORPS_D_OUVERTURE,
  prochaineFois, ligneSuivante, fenetreOuverte, aReponduDepuis, voieDuProgramme, numeroDeLEnvoi, opaleEveillee,
  messagesAPorter, texteDeLaConsigne, texteDOuverture, composantsDOuverture, pourquoiLeProgrammeNePartPas,
  lignesDeLaProgrammation, appelsAConvertir, idDeLEnvoiDeLAppel, texteSuiteASonAppel, leOui, retiensLeProgramme,
  envoyeParLApp, pasEnvoyeParLApp, reprogramme, ongletDe, pastillesDe, programmeDansLaSalle, instantChoisi, quandDit,
  pieceRefusee, cheminDuFichier, texteDeLaCliente, modeleDeMessage,
  type LigneProgrammee, type Programmation, type Destinataire,
} from '../src/shared/envois-programmes-pur';
import { relache, retiens, REGLES_PAR_DEFAUT } from '../src/shared/salle-des-envois';
import { REGISTRE_DES_MODELES, entreeDe } from '../src/shared/porte-des-modeles-pur';
import { messageAppel } from '../src/shared/appels';
import { DEVISE_COMPLETE } from '../src/shared/identite';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu).slice(0, 400)}`}`);
};
const vrai = (nom: string, ok: boolean, vu: unknown = '') => dit(nom, true, ok ? true : vu);

/* ── L'horloge : `new Date()` et `Date.now()` lisent la nôtre ── */
const VraieDate = Date;
let horloge = Date.parse('2026-11-13T15:00:00Z'); // 16 h à Cotonou
class DateDeBanc extends VraieDate {
  constructor(...a: unknown[]) { if (a.length === 0) super(horloge); else super(...(a as [string])); }
  static now(): number { return horloge; }
}
(globalThis as unknown as { Date: unknown }).Date = DateDeBanc;
const iso = (ms: number) => new VraieDate(ms).toISOString();
const MIN = 60_000; const H = 3_600_000; const J = 86_400_000;
const signe = (t: string) => `${t}\n\nmi nyɔ́ ɖɛkpɛ`;

/* ══ I. LA RÈGLE ══════════════════════════════════════════════════════ */
{
  const ancre = iso(Date.parse('2026-01-31T09:00:00+01:00'));
  dit('chaque mois depuis le 31 janvier : 28 fevrier, puis 31 mars, jamais le 28 mars',
    ['2026-02-28T08:00:00.000Z', '2026-03-31T08:00:00.000Z'],
    [prochaineFois(ancre, 'mois', Date.parse(ancre)), prochaineFois(ancre, 'mois', Date.parse('2026-02-28T08:00:00Z'))]);
  const bissextile = iso(Date.parse('2028-02-29T10:00:00+01:00'));
  dit('chaque annee depuis un 29 fevrier : le 28 les autres annees', '2029-02-28T09:00:00.000Z', prochaineFois(bissextile, 'annee', Date.parse(bissextile)));
  dit('chaque jour, chaque semaine ; une fois : rien', ['2026-01-02T08:00:00.000Z', '2026-01-08T08:00:00.000Z', null],
    [prochaineFois('2026-01-01T08:00:00.000Z', 'jour', Date.parse('2026-01-01T08:00:00Z')), prochaineFois('2026-01-01T08:00:00.000Z', 'semaine', Date.parse('2026-01-01T08:00:00Z')),
      prochaineFois('2026-01-01T08:00:00.000Z', 'jamais', 0)]);
  dit('la fois suivante saute ce qui est deja passe', '2026-01-10T08:00:00.000Z', prochaineFois('2026-01-01T08:00:00.000Z', 'jour', Date.parse('2026-01-09T12:00:00Z')));

  const ouvert = [{ sens: 'entrant', numero: '2290197000001', quand: iso(horloge - 3 * H) }];
  dit('la fenetre : elle a ecrit il y a 3 h, ouverte ; il y a 25 h, fermee ; nos messages et le site n ouvrent rien',
    [true, false, false, false],
    [fenetreOuverte(ouvert, horloge), fenetreOuverte([{ sens: 'entrant', quand: iso(horloge - 25 * H) }], horloge),
      fenetreOuverte([{ sens: 'sortant', quand: iso(horloge - H) }], horloge), fenetreOuverte([{ sens: 'entrant', canal: 'site', quand: iso(horloge - H) }], horloge)]);
  dit('sa reponse : un message d elle apres le modele, pas avant', [true, false],
    [aReponduDepuis([{ sens: 'entrant', quand: iso(horloge) }], iso(horloge - MIN)), aReponduDepuis([{ sens: 'entrant', quand: iso(horloge - 2 * MIN) }], iso(horloge - MIN))]);

  const colis = { genre: 'programme' as const, numero: '2290197000001', texte: 'x', agent: 'perle' as const, parQui: 'Perle', mode: 'seul' as const, repeter: 'jamais' as const, appel: 'Mme Awa' };
  const f = { fenetreOuverte: false, opaleEveillee: false, modeleDOuverture: MODELE_D_OUVERTURE, porteOuverteDe: null };
  dit('la voie : app, demander, tirer, texte, opale, revoir (Opale endormie), rejoint, revoir (modele pas approuve), ouverture',
    ['app', 'demander', 'tirer', 'texte', 'opale', 'revoir', 'rejoint', 'revoir', 'ouverture', 'texte'],
    [voieDuProgramme({ colis: { ...colis, mode: 'app' } }, f).voie, voieDuProgramme({ colis: { ...colis, demander: true } }, f).voie,
      voieDuProgramme({ colis: { ...colis, piece: { genre: 'facture' } } }, f).voie, voieDuProgramme({ colis }, { ...f, fenetreOuverte: true }).voie,
      voieDuProgramme({ colis: { ...colis, prive: true } }, { ...f, opaleEveillee: true }).voie, voieDuProgramme({ colis: { ...colis, prive: true } }, f).voie,
      voieDuProgramme({ colis }, { ...f, porteOuverteDe: 'autre' }).voie, voieDuProgramme({ colis }, { ...f, modeleDOuverture: '' }).voie,
      voieDuProgramme({ colis }, f).voie, voieDuProgramme({ colis: { ...colis, demander: true }, ouiLe: iso(horloge) }, { ...f, fenetreOuverte: true }).voie]);
  dit('privé, fenetre ouverte : par le WhatsApp de la Maison, sans Opale', 'texte', voieDuProgramme({ colis: { ...colis, prive: true } }, { ...f, fenetreOuverte: true }).voie);
  dit('Opale eveillee : son guetteur depuis 3 min, ou son passage depuis 45 ; sans jeton, jamais', [true, true, false, false],
    [opaleEveillee({ empreinte: 'e', guette_le: iso(horloge - 2 * MIN) }, horloge), opaleEveillee({ empreinte: 'e', vu_le: iso(horloge - 40 * MIN) }, horloge),
      opaleEveillee({ empreinte: 'e', guette_le: iso(horloge - 5 * MIN), vu_le: iso(horloge - 50 * MIN) }, horloge), opaleEveillee({ guette_le: iso(horloge) }, horloge)]);
  dit('le numero relu : la fiche d aujourd hui, sinon son second, sinon celui programme', ['2290166000000', '2290155000000', '2290197000001'],
    [numeroDeLEnvoi({ colis }, { phone: '01 66 00 00 00' }), numeroDeLEnvoi({ colis }, { phone: '', phone2: '+229 0155000000' }), numeroDeLEnvoi({ colis }, null)]);
  dit('relu avant de partir : fiche disparue, sans numero, STOP, rendez-vous deplace ou annule', [
    'la fiche n’existe plus', 'pas de numéro WhatsApp sur la fiche', MOTIF_STOP,
    'le rendez-vous dont parle le message a été déplacé', 'le rendez-vous dont parle le message a été annulé', null], [
    pourquoiLeProgrammeNePartPas({ clientId: 'c', colis }, { fiche: null, maintenantMs: horloge }),
    pourquoiLeProgrammeNePartPas({ colis: { ...colis, numero: '' } }, { maintenantMs: horloge }),
    pourquoiLeProgrammeNePartPas({ clientId: 'c', colis }, { fiche: { phone: '0197000001', nouvelles: { oui: false, par: 'stop' } }, maintenantMs: horloge }),
    pourquoiLeProgrammeNePartPas({ colis, apptId: 'r', dateRdv: '2026-11-20', heure: '10:00' }, { rdv: { date: '2026-11-21', time: '10:00', status: 'confirmé' }, maintenantMs: horloge }),
    pourquoiLeProgrammeNePartPas({ colis, apptId: 'r', dateRdv: '2026-11-20', heure: '10:00' }, { rdv: { date: '2026-11-20', time: '10:00', status: 'annulé' }, maintenantMs: horloge }),
    pourquoiLeProgrammeNePartPas({ colis, apptId: 'r', dateRdv: '2026-11-20', heure: '10:00' }, { rdv: { date: '2026-11-20', time: '10:00', status: 'confirmé' }, maintenantMs: horloge }),
  ]);
  const media = { id: 'm1', famille: 'document' as const, nom: 'facture.pdf' };
  dit('ce qui part chez Meta : le texte ; la piece et sa legende ; la piece puis le texte au-dela de 1 024 signes',
    [['text'], ['document'], ['document', 'text']],
    [messagesAPorter('229', 'Bonjour', null).map((m) => m.type), messagesAPorter('229', 'Bonjour', media).map((m) => m.type), messagesAPorter('229', 'x'.repeat(1100), media).map((m) => m.type)]);
  vrai('la legende porte le texte et le nom du document', JSON.stringify(messagesAPorter('229', 'Bonjour', media)[0]).includes('"caption":"Bonjour"') && JSON.stringify(messagesAPorter('229', 'Bonjour', media)[0]).includes('"filename":"facture.pdf"'));
  const consigne = texteDeLaConsigne({ auteur: 'Yéman', numero: '2290197000001', prenom: 'Awa', texte: 'Bonjour Awa', piece: { nom: 'photo.jpg', lien: 'https://signe.example/x' } }) ?? '';
  vrai('la consigne a Opale : qui, le numero, le texte mot pour mot, la piece, la reponse attendue',
    consigne.startsWith('Envoi programmé par Yéman') && consigne.includes('+2290197000001') && consigne.includes('\nBonjour Awa\n') && consigne.includes('https://signe.example/x') && consigne.includes('--statut faite'), consigne);
  dit('... plus de mille signes : pas de consigne', null, texteDeLaConsigne({ auteur: 'Y', numero: '229', texte: 'x'.repeat(1000) }));
  dit('le modele d ouverture : le corps depose, l appel au {{1}}', ['Bonjour Mme Awa, la Maison MND a un message pour vous. Touchez « Lire le message », ou répondez simplement, pour le recevoir ici.', 'Mme Awa'],
    [texteDOuverture('Mme Awa'), (composantsDOuverture('Mme Awa')[0] as { parameters: { text: string }[] }).parameters[0].text]);
  const reg = REGISTRE_DES_MODELES.find((e) => e.famille === 'ouverture');
  dit('la porte des modeles le connait : type programme, le secret, l appel, une fois par tete, toutes les portes',
    { modeles: [MODELE_D_OUVERTURE], secrets: ['WA_TEMPLATE_OUVERTURE'], type: 'programme', appel: 1, rdv: false, rappel: false, unParTete: true, porte: 'toutes' },
    reg && { modeles: reg.modeles, secrets: reg.secrets, type: reg.type, appel: reg.appel, rdv: reg.rdv, rappel: reg.rappel, unParTete: reg.unParTete, porte: reg.porte });
  dit('... et une ligne programmee y entre par son type', 'ouverture', entreeDe({ type: TYPE_PROGRAMME })?.famille);

  /* Le formulaire. */
  const t0 = Date.parse('2026-11-13T15:05:00Z');
  dit('quand : dans 1 h (a la minute), ce soir 18 h, demain 9 h, le jour choisi ; ce soir passe : demain 18 h',
    ['2026-11-13T16:05:00.000Z', '2026-11-13T17:00:00.000Z', '2026-11-14T08:00:00.000Z', '2026-12-03T08:30:00.000Z', '2026-11-14T17:00:00.000Z'],
    [iso(instantChoisi('h1', t0) as number), iso(instantChoisi('soir', t0) as number), iso(instantChoisi('demain9', t0) as number),
      iso(instantChoisi('autre', t0, '2026-12-03', '09:30') as number), iso(instantChoisi('soir', Date.parse('2026-11-13T19:00:00Z')) as number)]);
  dit('quand dit : aujourd hui, demain, et l annee sur une date', ['Aujourd’hui · 16 h 30', 'Demain · 9 h', 'jeu. 3 déc. 2026 · 9 h 30'],
    [quandDit('2026-11-13T15:30:00Z', t0), quandDit('2026-11-14T08:00:00Z', t0), quandDit('2026-12-03T08:30:00Z', t0)]);
  dit('un fichier : photo, PDF ; ni webp ni gros fichier', [null, null, true, true],
    [pieceRefusee({ type: 'image/jpeg', octets: 1_000_000 }), pieceRefusee({ type: 'application/pdf', octets: 10_000_000 }),
      typeof pieceRefusee({ type: 'image/webp', octets: 1000 }) === 'string', typeof pieceRefusee({ type: 'image/png', octets: 6 * 1024 * 1024 }) === 'string']);
  dit('le chemin du fichier : le lot, jamais un nom de cliente', 'prog-x/piece.pdf', cheminDuFichier('prog-x', 'Facture Awa KOSSI.PDF'));
  dit('« Suite a son appel » est le texte de messageAppel, le motif dedans', messageAppel({ nom: 'Anne Marie KOSSI', motif: 'son retwist' }), texteSuiteASonAppel('Anne Marie KOSSI', 'son retwist'));
  dit('... et le modele du formulaire dit la meme chose', texteSuiteASonAppel('Awa KOSSI', 'son retwist'),
    texteDeLaCliente(modeleDeMessage('appel').texte, { prenom: 'Awa', motif: 'son retwist' }));
  dit('un numero sans nom (le partage d un inconnu) : « Bonjour, », jamais « Bonjour , »', 'Bonjour, la Maison MND a bien reçu votre appel. Quand vous conviendrait-il de passer ?',
    texteDeLaCliente(modeleDeMessage('appel').texte, { prenom: '' }));
}

/* ── Une programmation de banc ── */
let lots = 0;
const prog = (o: Partial<Programmation> = {}): Programmation => ({
  lotId: `prog-banc-${++lots}`, branchId: 'br-1', modele: 'libre', texte: 'Bonjour {prénom}, voici votre message.', prevuMs: horloge - MIN,
  repeter: 'jamais', agent: 'perle', mode: 'seul', telephone: 'moi', demander: false, prive: false, auteur: 'Yéman', auteurUserId: 'u-yeman', ...o,
});
const awa: Destinataire = { clientId: 'cl-awa', nom: 'Awa KOSSI', prenom: 'Awa', appel: 'Mme Awa', numero: '2290197000001' };
const sika: Destinataire = { clientId: 'cl-sika', nom: 'Sika DOSSOU', prenom: 'Sika', appel: 'Mme Sika', numero: '2290197000002' };
const ola: Destinataire = { clientId: 'cl-ola', nom: 'Ola AGBO', prenom: 'Ola', appel: 'M. Ola', numero: '2290197000003' };
const lignes = (p: Programmation, d: Destinataire[] = [awa]) => lignesDeLaProgrammation(p, d, horloge, signe);
{
  const trois = lignes(prog({ texte: 'Bonjour {prénom}, la Maison MND pense à vous.' }), [awa, sika, ola]);
  dit('plusieurs clientes : une ligne chacune, a son prenom, jamais le numero d une autre',
    [['Bonjour Awa', '2290197000001'], ['Bonjour Sika', '2290197000002'], ['Bonjour Ola', '2290197000003'], 3, true],
    [...trois.map((l) => [l.colis.texte.slice(0, l.colis.texte.indexOf(',')), l.colis.numero]), new Set(trois.map((l) => l.id)).size,
      trois.every((l) => trois.filter((x) => x !== l).every((x) => !l.colis.texte.includes(x.numero as string)))]);
  vrai('... chacune signee de la devise, posee par le code', trois.every((l) => l.colis.texte.endsWith('mi nyɔ́ ɖɛkpɛ')));
  const l = trois[0];
  const s = ligneSuivante({ ...l, colis: { ...l.colis, repeter: 'semaine' } }, horloge);
  dit('la fois suivante : la meme serie, n + 1, sept jours plus tard, en attente, sans oui ni porte',
    [`${l.serieId}-2`, 2, iso(Date.parse(l.prevuA) + 7 * J), 'en-attente'], [s?.id, s?.occurrence, s?.prevuA, s?.statut]);
  dit('... une piece du Trone se tirera de nouveau, un fichier se garde', [undefined, 'a/piece.pdf'], [
    (ligneSuivante({ ...l, colis: { ...l.colis, repeter: 'mois', piece: { genre: 'facture', invoiceId: 'i', chemin: 'x.pdf' } } }, horloge)?.colis.piece as { chemin?: string } | undefined)?.chemin,
    (ligneSuivante({ ...l, colis: { ...l.colis, repeter: 'mois', piece: { genre: 'fichier', chemin: 'a/piece.pdf', nom: 'p.pdf', type: 'application/pdf', octets: 1 } } }, horloge)?.colis.piece as { chemin?: string } | undefined)?.chemin]);
  const aValider = { ...l, statut: A_VALIDER, prevuA: iso(horloge + H) };
  dit('le oui : a son heure si elle n est pas venue, sinon tout de suite ; seulement a valider',
    [iso(horloge + H), iso(horloge), null], [leOui(aValider, 'Yéman', horloge)?.partA, leOui({ ...aValider, prevuA: iso(horloge - H) }, 'Y', horloge)?.partA, leOui(l, 'Y', horloge)]);
  dit('retenir, envoye par l app, pas envoye : les gestes de la file', ['retenu', 'envoyé', true, PAR_L_APP],
    [retiensLeProgramme({ ...l, statut: PAR_L_APP }, 'Y', horloge)?.statut, envoyeParLApp({ ...l, statut: PAR_L_APP }, 'Y', horloge)?.statut,
      envoyeParLApp({ ...l, statut: PAR_L_APP }, 'Y', horloge)?.parLApp, pasEnvoyeParLApp(envoyeParLApp({ ...l, statut: PAR_L_APP }, 'Y', horloge)!)?.statut]);
  const corrige = reprogramme({ ...l, statut: A_REVOIR, detail: 'x', porteLe: 'y', prevenuLe: 'z' }, { texte: 'neuf', prevuMs: horloge + H, maintenantMs: horloge });
  dit('corriger et reprogrammer : en attente, a sa nouvelle heure, sans les traces de l echec', ['en-attente', iso(horloge + H), 'neuf', undefined, undefined, undefined],
    [corrige?.statut, corrige?.partA, corrige?.colis.texte, corrige?.detail, corrige?.porteLe, corrige?.prevenuLe]);
  dit('les onglets : a venir, partis, a revoir ; ecarte nulle part', ['a-venir', 'a-venir', 'a-venir', 'partis', 'a-revoir', null],
    [ongletDe({ statut: 'en-attente' }), ongletDe({ statut: A_VALIDER }), ongletDe({ statut: ATTEND_SA_REPONSE }), ongletDe({ statut: 'envoyé' }), ongletDe({ statut: A_REVOIR }), ongletDe({ statut: 'écarté' })]);
  vrai('les pastilles : par l app, votre oui, la porte, Opale, la repetition',
    pastillesDe({ ...l, colis: { ...l.colis, mode: 'app' } }, horloge)[0].dit.startsWith('par l’app') && pastillesDe({ ...l, statut: A_VALIDER }, horloge)[0].dit === 'attend votre oui'
    && pastillesDe({ ...l, statut: CONFIE_A_OPALE }, horloge)[0].dit.includes('Opale') && pastillesDe({ ...l, colis: { ...l.colis, repeter: 'annee' } }, horloge).some((p) => p.dit === 'chaque année'));
  dit('dans la salle : un envoi programme dans l heure qui vient, retenu, ou passe ; pas celui du mois prochain', [true, false, true, true],
    [programmeDansLaSalle({ type: TYPE_PROGRAMME, statut: 'en-attente', partA: iso(horloge + 30 * MIN) }, horloge), programmeDansLaSalle({ type: TYPE_PROGRAMME, statut: 'en-attente', partA: iso(horloge + 30 * J) }, horloge),
      programmeDansLaSalle({ type: TYPE_PROGRAMME, statut: 'retenu', partA: iso(horloge + 30 * J) }, horloge), programmeDansLaSalle({ type: 'rappel-j1', statut: 'en-attente', partA: iso(horloge + 30 * J) }, horloge)]);
  const tenu = retiens({ ...l, statut: 'en-attente', prevuA: iso(horloge + 5 * H), partA: iso(horloge + 5 * H) }, 'Y', iso(horloge));
  dit('la salle : relache, un envoi programme garde son heure, meme la nuit ; un autre reprend dix minutes',
    [iso(horloge + 5 * H), false, iso(horloge + 10 * MIN)],
    [relache(tenu!, horloge, REGLES_PAR_DEFAUT)?.partA, relache(tenu!, horloge, REGLES_PAR_DEFAUT)?.calme, relache({ id: 'x', statut: 'retenu' }, horloge, REGLES_PAR_DEFAUT)?.partA]);
}
{
  /* Les appels déjà notés. */
  const appels = [
    { id: 'ap1', branchId: 'br-1', clientId: 'cl-awa', nom: 'Awa KOSSI', motif: 'son retwist', suite: 'rappel' as const, quand: '2026-11-14', fait: false, at: '2026-11-12T10:00:00Z' },
    { id: 'ap2', branchId: 'br-1', nom: 'Rachida', phone: '01 97 00 00 09', motif: '', suite: 'rappel' as const, fait: false, at: '2026-11-12T10:00:00Z' },
    { id: 'ap3', branchId: 'br-1', nom: 'Sans numero', motif: 'x', suite: 'rappel' as const, fait: false, at: '2026-11-12T10:00:00Z' },
    { id: 'ap4', branchId: 'br-1', nom: 'Deja fait', phone: '0197000010', motif: '', suite: 'rappel' as const, fait: true, at: '2026-11-12T10:00:00Z' },
    { id: 'ap5', branchId: 'br-1', nom: 'RDV a caler', phone: '0197000011', motif: '', suite: 'rdv' as const, fait: false, at: '2026-11-12T10:00:00Z' },
  ];
  const deja = new Set<string>();
  const o = {
    dejaLa: (id: string) => deja.has(id), fiche: (id: string) => (id === 'cl-awa' ? { name: 'Awa KOSSI', phone: '+229 0197000001', civilite: 'madame' } : undefined),
    appelDe: (f: { name?: string } | undefined, nom: string) => (f ? 'Mme Awa' : nom), signe, maintenantMs: horloge, auteur: 'le journal des appels',
  };
  const r1 = appelsAConvertir(appels, o);
  dit('les appels a rappeler non faits deviennent des envois a valider, a leur date a 9 h, au texte de messageAppel',
    [[idDeLEnvoiDeLAppel('ap1'), A_VALIDER, '2026-11-14T08:00:00.000Z', '2290197000001'], [idDeLEnvoiDeLAppel('ap2'), A_VALIDER, iso(Date.parse('2026-11-13T09:00:00+01:00')), '2290197000009']],
    r1.lignes.map((l) => [l.id, l.statut, l.prevuA, l.numero]));
  vrai('... le texte est celui de messageAppel, signe', r1.lignes[0].colis.texte === signe(messageAppel({ nom: 'Awa KOSSI', motif: 'son retwist' })), r1.lignes[0].colis.texte);
  dit('... aucun perdu : sans numero, il le dit ; fait et rendez-vous a caler ne bougent pas', [['ap3'], ['ap1', 'ap2']], [r1.sansNumero, r1.marques.map((m) => m.appelId)]);
  for (const l of r1.lignes) deja.add(l.id);
  const r2 = appelsAConvertir(appels, o);
  dit('convertis deux fois : aucune ligne de plus, la marque posee', [0, ['ap1', 'ap2']], [r2.lignes.length, r2.marques.map((m) => m.appelId)]);
  dit('... un appel deja marque ne se relit plus', 0, appelsAConvertir(appels.map((a) => ({ ...a, envoiId: 'x' })), o).marques.length);
}

/* ══ II. LE VRAI FACTEUR ═════════════════════════════════════════════ */
type Ligne = Record<string, any>;
const TABLES: Record<string, Ligne[]> = {};
const table = (t: string): Ligne[] => (TABLES[t] ??= []);
const cleDe = (t: string): string => (t === 'documents' ? 'key' : 'id');
function valeur(l: Ligne, col: string): unknown {
  const m = /^data((?:->[A-Za-z0-9_]+)*)->>([A-Za-z0-9_]+)$/.exec(col);
  if (!m) return l[col];
  let v: any = l.data;
  for (const k of m[1].split('->').filter(Boolean)) v = v?.[k];
  v = v?.[m[2]];
  return v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
}
function projette(l: Ligne, cols: string): Ligne {
  if (!cols || cols.trim() === '*') return structuredClone(l);
  const r: Ligne = {};
  for (const brut of cols.split(',').map((c) => c.trim()).filter(Boolean)) r[brut] = structuredClone(valeur(l, brut));
  return r;
}
class Requete {
  private filtres: ((l: Ligne) => boolean)[] = [];
  private mode: 'select' | 'update' | 'upsert' | 'insert' = 'select';
  private cols = '*';
  private rendre = false;
  private plafond = Infinity;
  private seule = false;
  private charge: any = null;
  private options: any = {};
  constructor(private t: string) {}
  select(cols = '*') { if (this.mode === 'select') this.cols = cols; else { this.rendre = true; this.cols = cols; } return this; }
  eq(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c)) === String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') >= String(v)); return this; }
  in(c: string, vs: unknown[]) { const s = new Set(vs.map(String)); this.filtres.push((l) => s.has(String(valeur(l, c)))); return this; }
  is(c: string, v: unknown) { this.filtres.push((l) => (valeur(l, c) ?? null) === v); return this; }
  range(a: number, b: number) { this.plafond = b - a + 1; return this; }
  limit(k: number) { this.plafond = k; return this; }
  order() { return this; }
  maybeSingle() { this.seule = true; return this; }
  update(d: any) { this.mode = 'update'; this.charge = d; return this; }
  upsert(d: any, o: any = {}) { this.mode = 'upsert'; this.charge = d; this.options = o; return this; }
  insert(d: any) { this.mode = 'insert'; this.charge = d; return this; }
  private execute(): { data: any; error: any } {
    const lignes = table(this.t);
    const cle = this.options.onConflict ?? cleDe(this.t);
    if (this.mode === 'insert' || this.mode === 'upsert') {
      const faites: Ligne[] = [];
      for (const brut of [].concat(this.charge)) {
        const l: Ligne = structuredClone(brut);
        const i = lignes.findIndex((x) => x[cle] !== undefined && x[cle] === l[cle]);
        if (i >= 0) { if (this.mode === 'insert' || this.options.ignoreDuplicates) continue; lignes[i] = l; } else lignes.push(l);
        faites.push(l);
      }
      return { data: this.rendre ? faites.map((l) => projette(l, this.cols)) : null, error: null };
    }
    const vues = lignes.filter((l) => this.filtres.every((f) => f(l)));
    if (this.mode === 'update') {
      for (const l of vues) Object.assign(l, structuredClone(this.charge));
      return { data: this.rendre ? vues.map((l) => projette(l, this.cols)) : null, error: null };
    }
    const data = vues.slice(0, this.plafond).map((l) => projette(l, this.cols));
    return this.seule ? { data: data[0] ?? null, error: null } : { data, error: null };
  }
  then(ok: (r: any) => unknown, ko2?: (e: unknown) => unknown) {
    try { return Promise.resolve(this.execute()).then(ok, ko2); } catch (e) { return Promise.reject(e).then(ok, ko2); }
  }
}
const COMPARTIMENT = new Map<string, { octets: Uint8Array; type: string }>();
const RPC: { nom: string; args: any }[] = [];
const client = {
  from: (t: string) => new Requete(t),
  rpc: async (nom: string, args: any) => { RPC.push({ nom, args }); return { data: null, error: null }; },
  storage: {
    from: (b: string) => ({
      download: async (chemin: string) => {
        const f = b === 'envois-programmes' ? COMPARTIMENT.get(chemin) : undefined;
        return f ? { data: new Blob([f.octets], { type: f.type }), error: null } : { data: null, error: { message: 'Object not found' } };
      },
      createSignedUrl: async (chemin: string, s: number) => (COMPARTIMENT.has(chemin) ? { data: { signedUrl: `https://banc.local/signe/${chemin}?e=${s}` }, error: null } : { data: null, error: { message: 'absent' } }),
      remove: async (chemins: string[]) => { for (const c of chemins) COMPARTIMENT.delete(c); return { data: null, error: null }; },
    }),
  },
};

const ENV: Record<string, string | undefined> = {
  SUPABASE_URL: 'http://faux.local', SUPABASE_SERVICE_ROLE_KEY: 'service-de-banc', WA_TOKEN: 'jeton-meta-de-banc', WA_PHONE_ID: '1234',
  WA_TEMPLATE_OUVERTURE: MODELE_D_OUVERTURE,
};
const SERVIS: ((req: Request) => Promise<Response>)[] = [];
type Envoye = { type: string; to: string; corps: any };
let META: Envoye[] = [];
let MEDIAS: { nom: string; type: string }[] = [];
let PUSH: any[] = [];
let REFUS_META: Record<string, { code: number; message: string }> = {};
let numeroWa = 0;
(globalThis as any).__faux = { client: () => client };
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] }, serve: (h: any) => { SERVIS.push(h); } };
(globalThis as any).fetch = async (url: string, init?: { body?: unknown }) => {
  const u = String(url);
  if (u.includes('graph.facebook.com') && u.endsWith('/media')) {
    const fd = init?.body as FormData;
    const f = fd.get('file') as File;
    MEDIAS.push({ nom: f.name, type: String(fd.get('type')) });
    return new Response(JSON.stringify({ id: `media-${MEDIAS.length}` }), { status: 200 });
  }
  if (u.includes('graph.facebook.com')) {
    const corps = JSON.parse(String(init?.body ?? '{}'));
    const refus = REFUS_META[corps.to];
    if (refus) return new Response(JSON.stringify({ error: refus }), { status: 400 });
    META.push({ type: corps.type, to: corps.to, corps });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.banc${++numeroWa}` }] }), { status: 200 });
  }
  if (u.includes('/functions/v1/push-notify')) { PUSH.push(JSON.parse(String(init?.body ?? '{}'))); return new Response(JSON.stringify({ sent: 1 }), { status: 200 }); }
  return new Response('{}', { status: 404 });
};
console.error = () => {};

await import('../supabase/functions/envois-partent/index.ts');
const [facteur] = SERVIS;
const reveil = async (): Promise<any> => {
  const r = await facteur(new Request('http://faux.local/functions/v1/envois-partent', { method: 'POST', headers: { authorization: 'Bearer service-de-banc' } }));
  return r.json();
};
const remise = () => {
  for (const k of Object.keys(TABLES)) delete TABLES[k];
  COMPARTIMENT.clear(); RPC.length = 0; META = []; MEDIAS = []; PUSH = []; REFUS_META = {};
  ENV.WA_TEMPLATE_OUVERTURE = MODELE_D_OUVERTURE;
  horloge = Date.parse('2026-11-13T15:00:00Z');
  table('clients').push(
    { id: 'cl-awa', branch_id: 'br-1', data: { id: 'cl-awa', name: 'Awa KOSSI', civilite: 'madame', phone: '+229 01 97 00 00 01' } },
    { id: 'cl-sika', branch_id: 'br-1', data: { id: 'cl-sika', name: 'Sika DOSSOU', civilite: 'madame', phone: '+229 01 97 00 00 02' } },
    { id: 'cl-ola', branch_id: 'br-1', data: { id: 'cl-ola', name: 'Ola AGBO', civilite: 'monsieur', phone: '+229 01 97 00 00 03' } },
  );
};
const pose = (...ls: LigneProgrammee[]) => { for (const l of ls) table('envois').push({ id: l.id, branch_id: 'br-1', data: structuredClone(l) }); return ls; };
const lue = (id: string): LigneProgrammee => table('envois').find((r) => r.id === id)?.data;
const ecrit = (numero: string, ilYa: number) => table('messages_wa').push({ id: `in-${numero}-${ilYa}-${Math.random()}`, data: { sens: 'entrant', numero, quand: iso(horloge - ilYa) } });
const textes = () => META.filter((m) => m.type === 'text');
/** Les sonneries chez qui l'a programme (jamais l'annonce des dix minutes, a toute l'equipe). */
const aLAuteur = () => PUSH.filter((p) => String(p.url ?? '').includes('appels?envoi='));
const modeles = () => META.filter((m) => m.type === 'template');

/* 1. Fenêtre ouverte : le texte, tel quel, au nom de Perle. */
{
  remise();
  ecrit('2290197000001', 3 * H);
  const [l] = pose(...lignes(prog()));
  const r = await reveil();
  const ligne = lue(l.id);
  const fil = table('messages_wa').find((m) => m.data?.envoiId === l.id);
  dit('fenetre ouverte : le message part tel quel, un texte au numero, sans modele', [1, 0, '2290197000001', 'envoyé'],
    [textes().length, modeles().length, textes()[0]?.to, ligne?.statut]);
  vrai('... son texte est celui programme, au prenom et signe', textes()[0]?.corps?.text?.body === l.colis.texte && l.colis.texte.startsWith('Bonjour Awa'), textes()[0]);
  dit('... au fil, signe au nom de Perle, avec son identifiant Meta ; l automate se tait', ['Perle', 'wamid.banc1', 'envoi-programme'],
    [fil?.data?.parQui, fil?.data?.waId, RPC.find((x) => x.nom === 'pause_le_fil')?.args?.p_motif]);
  dit('... le facteur le compte', 1, r.programmesPartis);
}

/* 2. Fenêtre fermée : le modèle d'ouverture, puis le message à sa réponse. */
{
  remise();
  ecrit('2290197000001', 30 * H);
  const [l] = pose(...lignes(prog()));
  await reveil();
  dit('fenetre fermee : le modele d ouverture seul, l appel au {{1}}, la ligne attend sa reponse',
    [1, 0, MODELE_D_OUVERTURE, 'Mme Awa', ATTEND_SA_REPONSE],
    [modeles().length, textes().length, modeles()[0]?.corps?.template?.name, modeles()[0]?.corps?.template?.components?.[0]?.parameters?.[0]?.text, lue(l.id)?.statut]);
  const filOuverture = table('messages_wa').find((m) => m.data?.modele === MODELE_D_OUVERTURE);
  vrai('... le fil garde le modele d ouverture et son texte', !!filOuverture && filOuverture.data.texte === CORPS_D_OUVERTURE.replace('{{1}}', 'Mme Awa'), filOuverture?.data);
  horloge += 5 * MIN;
  await reveil();
  dit('... sans sa reponse, rien de plus', [1, 0, ATTEND_SA_REPONSE], [modeles().length, textes().length, lue(l.id)?.statut]);
  horloge += 30 * MIN;
  ecrit('2290197000001', 0);
  horloge += MIN;
  await reveil();
  dit('... elle repond : le message part, la ligne le dit (parti a sa reponse)', [1, 1, 'envoyé', true],
    [modeles().length, textes().length, lue(l.id)?.statut, pastillesDe(lue(l.id), horloge)[0].dit === 'parti à sa réponse']);
  await reveil();
  dit('... une seule fois : un reveil de plus ne renvoie rien', [1, 1], [modeles().length, textes().length]);
}

/* 3. Deux lignes, le même numéro, fenêtre fermée : un seul modèle d'ouverture. */
{
  remise();
  const [a] = pose(...lignes(prog({ texte: 'Premier message.' })));
  const [b] = pose(...lignes(prog({ texte: 'Second message.' })));
  await reveil();
  dit('deux envois au meme numero, fenetre fermee : un seul modele, l autre l attend avec lui', [1, ATTEND_SA_REPONSE, ATTEND_SA_REPONSE, a.id],
    [modeles().length, lue(a.id)?.statut, lue(b.id)?.statut, lue(b.id)?.porteDe]);
  horloge += 10 * MIN; ecrit('2290197000001', 0); horloge += MIN;
  await reveil();
  dit('... a sa reponse, les deux messages partent', [2, 'envoyé', 'envoyé'], [textes().length, lue(a.id)?.statut, lue(b.id)?.statut]);
}

/* 3 bis. La porte d'Opale garde le modèle d'ouverture : jamais deux fois à la même fiche, la civilité de la fiche. */
{
  remise();
  table('messages_wa').push({ id: 'wa-avant', data: { sens: 'sortant', numero: '2290197000001', clientId: 'cl-awa', modele: MODELE_D_OUVERTURE, texte: 'Bonjour Mme Awa, autre chose', etat: 'remis', quand: iso(horloge - 2 * H) } });
  const [l] = pose(...lignes(prog()));
  await reveil();
  dit('la porte d Opale : le modele d ouverture deja parti a cette fiche depuis 20 h, il ne repart pas', [0, A_REVOIR, true],
    [META.length, lue(l.id)?.statut, String(lue(l.id)?.detail).startsWith('retenu par Opale')]);
}
{
  remise();
  const [l] = pose(...lignes(prog(), [{ ...awa, appel: 'Awa' }]));
  await reveil();
  dit('... et l appel corrige par la civilite de la fiche (Awa devient Mme Awa)', ['Mme Awa', ATTEND_SA_REPONSE],
    [modeles()[0]?.corps?.template?.components?.[0]?.parameters?.[0]?.text, lue(l.id)?.statut]);
}

/* 4. Le modèle pas encore approuvé : « À revoir », dit une fois. */
{
  remise();
  ENV.WA_TEMPLATE_OUVERTURE = undefined;
  const [l] = pose(...lignes(prog()));
  await reveil();
  dit('modele pas encore approuve : rien ne part, la ligne est a revoir et le dit', [0, A_REVOIR, MOTIF_MODELE_PAS_APPROUVE], [META.length, lue(l.id)?.statut, lue(l.id)?.detail]);
  dit('... qui l a programme le sait, une fois, sur son telephone', [1, 'to-staff', 'u-yeman'], [aLAuteur().length, aLAuteur()[0]?.mode, aLAuteur()[0]?.userId]);
}

/* 5. Privé, fenêtre fermée : Opale, par WhatsApp Web. */
{
  remise();
  table('assistants').push({ id: 'opale', empreinte: 'emp', vu_le: iso(horloge - 2 * H), guette_le: iso(horloge - MIN) });
  COMPARTIMENT.set('prog-x/piece.jpg', { octets: new Uint8Array([1, 2, 3]), type: 'image/jpeg' });
  const [l] = pose(...lignes(prog({ prive: true, piece: { genre: 'fichier', chemin: 'prog-x/piece.jpg', nom: 'photo.jpg', type: 'image/jpeg', octets: 3 } })));
  await reveil();
  const k = table('assistants_consignes').find((c) => c.id === `consigne-${l.id}`);
  dit('prive et fenetre fermee : aucun modele, une consigne a Opale, au nom de qui l a programme', [0, 'opale', 'envoyee', 'u-yeman', CONFIE_A_OPALE],
    [META.length, k?.pour, k?.statut, k?.de_user_id, lue(l.id)?.statut]);
  vrai('... la consigne porte le numero, le texte et le lien signe de la piece', !!k && k.texte.includes('+2290197000001') && k.texte.includes(l.colis.texte) && k.texte.includes('https://banc.local/signe/prog-x/piece.jpg'), k?.texte);
  await reveil();
  dit('... une seule consigne', 1, table('assistants_consignes').length);
  k.statut = 'faite'; k.reponse = 'parti à 16 h 01';
  await reveil();
  dit('... Opale repond « faite » : la ligne est partie, envoyee par Opale', ['envoyé', true, 'envoyé par Opale'], [lue(l.id)?.statut, lue(l.id)?.parOpale, pastillesDe(lue(l.id), horloge)[0].dit]);
}
{
  remise();
  table('assistants').push({ id: 'opale', empreinte: 'emp', vu_le: iso(horloge - 3 * H), guette_le: iso(horloge - 2 * H) });
  const [l] = pose(...lignes(prog({ prive: true })));
  await reveil();
  dit('prive, Opale endormie : a revoir, sans consigne ni modele', [A_REVOIR, MOTIF_OPALE_ENDORMIE, 0, 0],
    [lue(l.id)?.statut, lue(l.id)?.detail, (TABLES.assistants_consignes ?? []).length, META.length]);
}

/* 6. La nuit : l'heure exacte. */
{
  remise();
  horloge = Date.parse('2026-11-13T22:30:00Z'); // 23 h 30 à Cotonou
  ecrit('2290197000001', H);
  const [l] = pose(...lignes(prog({ prevuMs: horloge - MIN })));
  table('envois').push({ id: 'env-r1-whatsapp', branch_id: 'br-1', data: { id: 'env-r1-whatsapp', type: 'rappel-j1', canal: 'whatsapp', statut: 'en-attente', partA: iso(horloge - MIN), apptId: 'r1',
    colis: { genre: 'whatsapp', numero: '2290197000005', modele: 'rappel_rdv', composants: [] } } });
  const r = await reveil();
  dit('la nuit (23 h 30) : l envoi programme part a l heure exacte ; le rappel automatique attend le matin', [true, 'envoyé', 1, 'en-attente'],
    [r.heuresCalmes, lue(l.id)?.statut, textes().length, table('envois').find((x) => x.id === 'env-r1-whatsapp')?.data?.statut]);
}

/* 7. « Me demander avant » : rien sans le oui. */
{
  remise();
  ecrit('2290197000001', H);
  const [l] = pose(...lignes(prog({ demander: true })));
  await reveil();
  dit('me demander avant : a l heure dite, rien ne part, la ligne attend le oui, le telephone de qui l a programme sonne',
    [0, A_VALIDER, 'to-staff', 'u-yeman', true], [META.length, lue(l.id)?.statut, aLAuteur()[0]?.mode, aLAuteur()[0]?.userId, String(aLAuteur()[0]?.url).includes(encodeURIComponent(l.id))]);
  horloge += 2 * H;
  await reveil();
  dit('... sans reponse, il attend', [0, A_VALIDER], [META.length, lue(l.id)?.statut]);
  const oui = leOui(lue(l.id), 'Yéman', horloge)!;
  table('envois').find((x) => x.id === l.id)!.data = oui;
  await reveil();
  dit('... le oui donne : il part', [1, 'envoyé'], [textes().length, lue(l.id)?.statut]);
}

/* 8. Par l'app : le téléphone sonne, rien ne part du serveur. */
{
  remise();
  const [l] = pose(...lignes(prog({ mode: 'app' })));
  const [c] = pose(...lignes(prog({ mode: 'app', telephone: 'comptoir' }), [sika]));
  const [s] = pose(...lignes(prog({ prevuMs: horloge + 5 * MIN }), [ola]));
  const [s2] = pose(...lignes(prog({ prevuMs: horloge + 5 * MIN, mode: 'app' }), [ola]));
  await reveil();
  dit('par l app : rien chez Meta, la ligne est prete, votre telephone sonne ; celui du comptoir : l equipe',
    [0, PAR_L_APP, PAR_L_APP], [META.length, lue(l.id)?.statut, lue(c.id)?.statut]);
  const pourL = PUSH.find((p) => String(p.url).includes(encodeURIComponent(l.id)));
  const pourC = PUSH.find((p) => String(p.url).includes(encodeURIComponent(c.id)));
  dit('... les deux sonneries', [['to-staff', 'u-yeman'], ['staff', undefined], true], [[pourL?.mode, pourL?.userId], [pourC?.mode, pourC?.userId], /est prêt$/.test(String(pourL?.title))]);
  const annonce = PUSH.find((p) => p.mode === 'staff' && /va partir|vont partir/.test(String(p.title)));
  vrai('... l annonce des dix minutes dit l envoi programme qui part seul, pas celui par l app', !!annonce && /Envoi programmé/.test(String(annonce.body)) && !!lue(s.id)?.annonceLe && !lue(s2.id)?.annonceLe, annonce);
}

/* 9. La fois suivante, posée une fois. */
{
  remise();
  ecrit('2290197000001', H);
  const [l] = pose(...lignes(prog({ repeter: 'semaine' })));
  await reveil();
  await reveil();
  const suivantes = table('envois').filter((x) => x.data?.serieId === l.serieId);
  dit('un envoi repete part, puis se reprogramme seul, une fois, sept jours plus tard', [1, 2, `${l.serieId}-2`, 'en-attente', iso(Date.parse(l.prevuA) + 7 * J)],
    [textes().length, suivantes.length, lue(l.id)?.suivanteId, lue(`${l.serieId}-2`)?.statut, lue(`${l.serieId}-2`)?.prevuA]);
}

/* 10. Une seule fois : deux facteurs au même instant. */
{
  remise();
  ecrit('2290197000001', H);
  const [l] = pose(...lignes(prog()));
  await Promise.all([reveil(), reveil()]);
  dit('deux reveils simultanes : un seul message', [1, 'envoyé'], [textes().length, lue(l.id)?.statut]);
}
{
  remise();
  const [l] = pose(...lignes(prog({ demander: true })));
  await Promise.all([reveil(), reveil()]);
  dit('... et une seule prise en main : « me demander avant » ne sonne qu une fois', [1, A_VALIDER], [aLAuteur().length, lue(l.id)?.statut]);
}
{
  remise();
  ecrit('2290197000001', H);
  const [l] = pose(...lignes(prog()));
  /* Coupé après Meta, avant d'écrire : la clé du message est au fil, avec son waId. */
  const { createHash } = await import('node:crypto');
  const id = `wa-cle-${createHash('sha256').update(`programme-${l.id}-message`).digest('hex').slice(0, 32)}`;
  table('messages_wa').push({ id, data: { id, sens: 'sortant', numero: '2290197000001', etat: 'remis', waId: 'wamid.avant', quand: iso(horloge - 10 * MIN) } });
  await reveil();
  dit('la cle du message deja au fil (facteur coupe en route) : rien ne repart, la ligne est partie', [0, 'envoyé', 'wamid.avant'], [META.length, lue(l.id)?.statut, lue(l.id)?.waMessageId]);
}

/* 11. Plusieurs clientes : un message chacune. */
{
  remise();
  for (const num of ['2290197000001', '2290197000002', '2290197000003']) ecrit(num, H);
  const trois = pose(...lignes(prog({ texte: 'Bonjour {prénom}, la Maison MND pense à vous.' }), [awa, sika, ola]));
  await reveil();
  dit('plusieurs clientes : trois messages, chacune a son numero et a son prenom, jamais un groupe',
    [['2290197000001', 'Bonjour Awa'], ['2290197000002', 'Bonjour Sika'], ['2290197000003', 'Bonjour Ola'], ['envoyé', 'envoyé', 'envoyé']],
    [...textes().map((t) => [t.to, String(t.corps.text.body).slice(0, String(t.corps.text.body).indexOf(','))]).sort(), trois.map((l) => lue(l.id)?.statut)]);
}

/* 12. La pièce du Trône, tirée au moment d'envoyer. */
{
  remise();
  ecrit('2290197000001', H);
  const [l] = pose(...lignes(prog({ agent: 'grenat', piece: { genre: 'facture', invoiceId: 'inv-1' } })));
  await reveil();
  dit('sa facture : a l heure dite, la ligne attend qu un Trone ouvert la tire ; rien ne part sans elle', [PIECE_A_TIRER, 0], [lue(l.id)?.statut, META.length]);
  /* Le Trône la tire : son PDF du moment, rangé au compartiment, la ligne rendue. */
  COMPARTIMENT.set(`${l.lotId}/facture-inv-1.pdf`, { octets: new Uint8Array([37, 80, 68, 70]), type: 'application/pdf' });
  const avant = lue(l.id);
  table('envois').find((x) => x.id === l.id)!.data = { ...avant, statut: 'en-attente', partA: iso(horloge), colis: { ...avant.colis, piece: { ...avant.colis.piece, chemin: `${l.lotId}/facture-inv-1.pdf`, nom: 'Facture F-0769.pdf', type: 'application/pdf', tireeLe: iso(horloge) } } };
  await reveil();
  dit('... tiree : le PDF depose chez Meta, le message part avec elle (document, legende), au nom de Grenat',
    [[{ nom: 'Facture F-0769.pdf', type: 'application/pdf' }], 'document', 'Facture F-0769.pdf', true, 'envoyé', 'Grenat'],
    [MEDIAS, META[0]?.type, META[0]?.corps?.document?.filename, META[0]?.corps?.document?.caption === l.colis.texte, lue(l.id)?.statut,
      table('messages_wa').find((m) => m.data?.envoiId === l.id)?.data?.parQui]);
  dit('... la piece tiree pour cette fois quitte le compartiment', false, COMPARTIMENT.has(`${l.lotId}/facture-inv-1.pdf`));
}

/* 13. Relu avant de partir : STOP, rendez-vous déplacé, l'arrêt de la direction. */
{
  remise();
  table('clients').find((c) => c.id === 'cl-awa')!.data.nouvelles = { oui: false, le: iso(horloge - J), par: 'stop' };
  ecrit('2290197000001', H);
  const [l] = pose(...lignes(prog()));
  await reveil();
  dit('elle a ecrit STOP : rien ne part, a revoir, et pourquoi', [0, A_REVOIR, MOTIF_STOP], [META.length, lue(l.id)?.statut, lue(l.id)?.detail]);
}
{
  remise();
  ecrit('2290197000001', H);
  table('appointments').push({ id: 'rdv-1', data: { date: '2026-11-21', time: '11:00', status: 'confirmé', clientId: 'cl-awa' } });
  const [l] = pose(...lignes(prog({ modele: 'rdv' }), [{ ...awa, rendezVous: { apptId: 'rdv-1', date: '2026-11-20', time: '10:00', dit: 'le vendredi 20 novembre 2026 à 10 h' } }]));
  await reveil();
  dit('le rendez-vous dont il parle a ete deplace : il ne part pas', [0, A_REVOIR, 'le rendez-vous dont parle le message a été déplacé'], [META.length, lue(l.id)?.statut, lue(l.id)?.detail]);
}
{
  remise();
  ecrit('2290197000001', H);
  const [l] = pose(...lignes(prog()));
  table('envois_arretes').push({ id: `ligne:${l.id}`, data: { cle: `ligne:${l.id}`, arreteLe: iso(horloge - MIN), arretePar: 'Yéman' } });
  await reveil();
  dit('arrete d avance par la direction (Ce qui va partir) : ecarte, rien ne part', [0, 'écarté'], [META.length, lue(l.id)?.statut]);
}

/* 14. Sept jours sans réponse ; l'échec dit une fois. */
{
  remise();
  const [l] = pose(...lignes(prog()));
  table('envois').find((x) => x.id === l.id)!.data = { ...l, statut: ATTEND_SA_REPONSE, porteLe: iso(horloge - 8 * J), prevenuLe: iso(horloge - 9 * J) };
  await reveil();
  dit('sept jours sans reponse au modele : a revoir ; l auteur deja prevenu ne l est pas deux fois', [A_REVOIR, MOTIF_SANS_REPONSE, 0, 0],
    [lue(l.id)?.statut, lue(l.id)?.detail, aLAuteur().length, META.length]);
}

/* 15. Les écrans, lus. */
{
  const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  const menu = lis('src/apps/trone/shell/MenuCreer.tsx');
  const shell = lis('src/apps/trone/shell/Shell.tsx');
  const index = lis('src/apps/trone/routes/index.tsx');
  const page = lis('src/apps/trone/routes/clients/Appels.tsx');
  const form = lis('src/apps/trone/shell/ProgrammerUnWhatsApp.tsx');
  const ep = lis('supabase/functions/envois-partent/index.ts');
  dit('le menu Creer : « Programmer un WhatsApp » remplace « Appel reçu »', [true, false],
    [menu.includes("label: 'Programmer un WhatsApp'"), menu.includes("label: 'Appel reçu'")]);
  dit('le partage « Partager › Le Trone » ouvre le formulaire, le numero pose', [true, false],
    [/setProgrammerInitial\(\{ phone, nom: phone \? undefined : texte\.slice\(0, 60\) \}\)/.test(shell), shell.includes('<AppelRecuModal')]);
  dit('Conversations › « Les envois programmes » (l adresse /appels gardee)', true,
    index.includes("{ path: '/appels', label: 'Les envois programmés' }"));
  dit('la file : a venir, partis, a revoir, et les appels notes', [true, true, true, true],
    ['À venir', 'Partis', 'À revoir', 'Les appels notés'].map((t) => page.includes(t)));
  dit('le formulaire signe par signeLeMessage, jamais a la main ; ni emoji', [true, false],
    [form.includes('signeLeMessage'), /mi ny|ɖɛkpɛ/.test(form) || /\p{Extended_Pictographic}/u.test(form)]);
  dit('le formulaire : le premier modele est « Suite a son appel », « Poser le rendez-vous » garde', [true, true],
    [form.includes('Poser le rendez-vous'), form.includes("useState<CleDuModeleDeMessage>('appel')")]);
  dit('le facteur porte la regle, caractere pour caractere, et le dit dans sa version', [true, true],
    [ep.includes('/* ⟨envois-programmes⟩ */') && ep.includes(lis('src/shared/envois-programmes-pur.ts').split('/* ⟨envois-programmes⟩ */')[1].split('/* ⟨/envois-programmes⟩ */')[0]),
      /const VERSION = '2026-11-13-a [^']*les envois programmés/.test(ep)]);
  const doc = lis('docs/modeles-whatsapp-envois-programmes.md');
  dit('le document du modele d ouverture : son nom, son corps mot pour mot, le pied de la devise, son secret', [true, true, true, true],
    [doc.includes('`un_message_pour_vous`'), doc.includes(CORPS_D_OUVERTURE), doc.includes(DEVISE_COMPLETE), doc.includes('`WA_TEMPLATE_OUVERTURE = un_message_pour_vous`')]);
  const charte = lis('docs/ASSISTANTS.md');
  dit('la charte dit a Opale l envoi programme : tout de suite, une fois, mot pour mot, puis « faite »', true,
    charte.includes('6. **Un envoi programmé, à envoyer par WhatsApp Web**') && charte.includes('consigne repondre --id <id> --statut faite --reponse "parti à <heure>"'));
  dit('la maquette dit sa validation', true, lis('public/maquette-les-envois-programmes.html').includes('validée le 13 novembre 2026 (« construis »)'));
  const sql = lis('supabase/migrations/0206_les_envois_programmes.sql');
  dit('0206 : le compartiment est prive, au personnel seul, 16 Mo', [true, true, 4, true],
    [/'envois-programmes',\n {2}'envois-programmes',\n {2}false,/.test(sql), /set public = false/.test(sql), (sql.match(/create policy envois_programmes_\w+ on storage\.objects for \w+ to authenticated/g) ?? []).length,
      (sql.match(/bucket_id = 'envois-programmes' and public\.is_staff\(\)/g) ?? []).length === 5 && sql.includes('16777216')]);
}

console.log(ko === 0 ? `\nTout tient : ${n} epreuves.` : `\n${ko} ECHEC sur ${n}.`);
