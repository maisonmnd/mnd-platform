/* LE LIEN DU RENDEZ-VOUS, ÉPROUVÉ — `node scripts/verifie-le-lien-du-rdv.mjs`.

   3 novembre 2026 : la référence lisible, le jeton signé des boutons de la
   confirmation WhatsApp, les composants du modèle avec ou sans liens, les
   mots pour déplacer ou annuler, le fichier .ics, le jeton d'identité du
   retour d'une cliente. Tout est inventé. Sortie ASCII : la console de Windows. */
import {
  ALPHABET_DE_LA_REFERENCE, FORME_DE_LA_REFERENCE, FORME_DU_JETON_DU_RDV, FORME_DU_JETON_D_IDENTITE, URL_DU_RDV, URL_DE_L_AGENDA,
  referenceDuRendezVous, jetonDuRendezVous, apptIdDuJeton, composantsDeLaConfirmation, texteDeLaConfirmation,
  motPourDeplacer, motPourAnnuler, ficheAgendaICS, jetonDIdentite, clientIdDuJetonDIdentite, JOURS_DU_JETON_D_IDENTITE,
  NOM_DU_SECRET_DES_LIENS, refusDuModele, etatDuRendezVous, coordonneesDeLaFiche, gestesDuDernierRituel,
  jetonDuLienDuRetour, gestesDitsDuRetour,
} from '../src/shared/lien-du-rdv-pur';
import { jetonDuLien, lienLu } from '../src/shared/lien-reservation';
import { readFileSync } from 'node:fs';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
};
const SECRET = 'un-secret-de-banc-qui-ne-sert-a-rien-d-autre';

/* 1. La reference. */
const ref = referenceDuRendezVous('rdv-5986667f-51b3-467f-8e4f-e6d221a16a4c');
dit('L1 la reference a la forme MND-XXXX', true, FORME_DE_LA_REFERENCE.test(ref));
dit('L2 la meme pour le meme rendez-vous', ref, referenceDuRendezVous('rdv-5986667f-51b3-467f-8e4f-e6d221a16a4c'));
dit('L3 une autre pour un autre', false, ref === referenceDuRendezVous('rdv-5986667f-51b3-467f-8e4f-e6d221a16a4d'));
dit('L4 l alphabet n a ni 0, ni O, ni 1, ni I', false, /[0O1I]/.test(ALPHABET_DE_LA_REFERENCE));
dit('L5 trente-deux signes', 32, ALPHABET_DE_LA_REFERENCE.length);
const refs = new Set(['ap-mb1csazio3', '31t7xp2646', 'rdv-300fb803-ecee-4b75-9623-c992d1c7239a', 'ap-4th4n8zx8l', 'cwvens0ryt'].map(referenceDuRendezVous));
dit('L6 cinq rendez-vous reels, cinq references distinctes', 5, refs.size);
/* La valeur gravee : si le calcul change, toute reference deja dite a une cliente changerait avec lui. */
dit('L6b la reference du banc est gravee', 'MND-4XT3', ref);

/* 2. Le jeton du rendez-vous. */
const jeton = await jetonDuRendezVous(SECRET, 'ap-mb1csazio3');
dit('L7 le jeton est un seul mot, identifiant puis signature de 22 signes', true, FORME_DU_JETON_DU_RDV.test(jeton) && jeton.startsWith('ap-mb1csazio3.'));
dit('L8 le jeton se relit avec le meme secret', 'ap-mb1csazio3', await apptIdDuJeton(SECRET, jeton));
dit('L9 un autre secret ne le relit pas', null, await apptIdDuJeton('un-autre-secret', jeton));
dit('L10 une signature retouchee ne passe pas', null, await apptIdDuJeton(SECRET, jeton.slice(0, -1) + (jeton.endsWith('A') ? 'B' : 'A')));
dit('L11 un identifiant retouche ne passe pas', null, await apptIdDuJeton(SECRET, 'ap-mb1csazio4' + jeton.slice('ap-mb1csazio3'.length)));
dit('L12 rien, ni un mot au hasard, ne passe', [null, null, null], [await apptIdDuJeton(SECRET, ''), await apptIdDuJeton(SECRET, 'bonjour'), await apptIdDuJeton(SECRET, undefined)]);
dit('L13 sans secret, aucun jeton ne se relit', null, await apptIdDuJeton('', jeton));
let refuse = false;
try { await jetonDuRendezVous(SECRET, 'un id avec des espaces.et un point'); } catch { refuse = true; }
dit('L14 un identifiant impossible n a pas de jeton', true, refuse);
dit('L15 le jeton tient dans un bouton Meta ([A-Za-z0-9._~-], 500 au plus)', true, /^[A-Za-z0-9._~-]{1,500}$/.test(jeton));
dit('L16 les deux adresses fixes sont celles du site', true, URL_DU_RDV === 'https://maisonmnd.com/rdv/?v=' && URL_DE_L_AGENDA === 'https://maisonmnd.com/rdv/agenda/?v=');

/* 3. Les composants du modele. */
const sans = composantsDeLaConfirmation({ avecLiens: false, prenom: 'Mme A.', quand: 'samedi 8 novembre 2026 à 10 h', reference: ref, jeton });
dit('L17 sans liens : le corps seul, deux variables', [{ type: 'body', parameters: [{ type: 'text', text: 'Mme A.' }, { type: 'text', text: 'samedi 8 novembre 2026 à 10 h' }] }], sans);
const avec = composantsDeLaConfirmation({ avecLiens: true, prenom: 'Mme A.', quand: 'samedi 8 novembre 2026 à 10 h', reference: ref, jeton }) as { type: string; sub_type?: string; index?: string; parameters: { text: string }[] }[];
dit('L18 avec liens : le corps a trois variables, la reference en troisieme', [3, ref], [avec[0].parameters.length, avec[0].parameters[2].text]);
dit('L19 deux boutons a URL, index 0 et 1, chacun avec le jeton', [['button', 'url', '0', jeton], ['button', 'url', '1', jeton]],
  avec.slice(1).map((c) => [c.type, c.sub_type, c.index, c.parameters[0].text]));
dit('L20 le texte du fil, avec liens, dit la reference et le bouton', true, texteDeLaConfirmation({ avecLiens: true, prenom: 'Mme A.', quand: 'samedi', reference: ref }).includes(`Votre référence : ${ref}`));
dit('L21 le texte du fil, sans liens, est celui d avant', 'Bonjour Mme A., c\'est confirmé : votre rendez-vous est retenu samedi. Nous vous attendons. Merci de nous prévenir en cas d\'empêchement.',
  texteDeLaConfirmation({ avecLiens: false, prenom: 'Mme A.', quand: 'samedi', reference: ref }));

/* 4. Les mots pour deplacer et annuler. */
const d = motPourDeplacer('samedi 8 novembre 2026 à 10 h', ref);
const a = motPourAnnuler('samedi 8 novembre 2026 à 10 h', ref);
dit('L22 deplacer dit le moment et la reference', true, d.includes('déplacer') && d.includes('samedi 8 novembre 2026 à 10 h') && d.includes(ref));
dit('L23 annuler dit le moment et la reference', true, a.includes('annuler') && a.includes(ref));
dit('L24 ni tiret long, ni point d exclamation, ni salon', [false, false, false], [/—/.test(d + a), /!/.test(d + a), /salon/i.test(d + a)]);

/* 5. Le fichier .ics. */
const ics = ficheAgendaICS({ apptId: 'ap-mb1csazio3', date: '2026-11-08', heure: '10:00', dureeMin: 90, titre: 'Maison MND · Retwist', note: 'Réf. MND-TEST; à Cotonou' });
dit('L25 un calendrier entier, un evenement', true, ics.startsWith('BEGIN:VCALENDAR') && ics.includes('BEGIN:VEVENT') && ics.endsWith('END:VCALENDAR'));
dit('L26 a l heure de Cotonou, de 10 h a 11 h 30', true, ics.includes('DTSTART;TZID=Africa/Porto-Novo:20261108T100000') && ics.includes('DTEND;TZID=Africa/Porto-Novo:20261108T113000'));
dit('L27 une duree sous l heure prend une heure', true, ficheAgendaICS({ apptId: 'x', date: '2026-11-08', heure: '10:00', dureeMin: 20, titre: 't', note: '' }).includes('DTEND;TZID=Africa/Porto-Novo:20261108T110000'));
dit('L28 le point-virgule de la note est echappe, l identifiant fait l UID', true, ics.includes('DESCRIPTION:Réf. MND-TEST\\; à Cotonou') && ics.includes('UID:ap-mb1csazio3@maisonmnd.com'));
dit('L29 des lignes CRLF, comme la norme', true, ics.includes('\r\n') && !/[^\r]\n/.test(ics));

/* 6. Le jeton d identite du retour. */
const ident = await jetonDIdentite(SECRET, 'MND-KNHU', '2026-11-10');
dit('L30 le jeton d identite a sa forme : fiche, jour, signature', true, FORME_DU_JETON_D_IDENTITE.test(ident) && ident.startsWith('MND-KNHU~20261110~'));
dit('L31 il se relit le jour meme et avant', ['MND-KNHU', 'MND-KNHU'], [await clientIdDuJetonDIdentite(SECRET, ident, '2026-11-10'), await clientIdDuJetonDIdentite(SECRET, ident, '2026-11-03')]);
dit('L32 passe le jour, il ne vaut plus', null, await clientIdDuJetonDIdentite(SECRET, ident, '2026-11-11'));
dit('L33 une fiche retouchee ne passe pas', null, await clientIdDuJetonDIdentite(SECRET, 'MND-KNHV' + ident.slice('MND-KNHU'.length), '2026-11-03'));
dit('L34 un jour retouche ne passe pas', null, await clientIdDuJetonDIdentite(SECRET, ident.replace('20261110', '20271110'), '2026-11-03'));
dit('L35 un autre secret ne le relit pas', null, await clientIdDuJetonDIdentite('autre', ident, '2026-11-03'));
dit('L36 sept jours de validite', 7, JOURS_DU_JETON_D_IDENTITE);
const r = jetonDuLien({ besoin: 'entretien', gestes: ['sv-a', 'sv-b'], identite: ident });
dit('L37 le jeton d identite voyage dans le lien prepare et se relit', { gestes: ['sv-a', 'sv-b'], calibre: '', identite: ident }, lienLu(`?r=${r}`));
dit('L38 le lien entier tient dans un bouton Meta', true, /^[A-Za-z0-9._~-]{1,500}$/.test(r));

/* 7. Les regles du serveur (3 novembre 2026). */
dit('L41 le secret des liens est celui que la plateforme pose partout', 'SUPABASE_SERVICE_ROLE_KEY', NOM_DU_SECRET_DES_LIENS);
dit('L42 Meta refuse le modele : #132000 a #132999 seulement', [true, true, true, false, false, false, false],
  [refusDuModele(132001), refusDuModele('132015'), refusDuModele(132000), refusDuModele(131026), refusDuModele(133000), refusDuModele(undefined), refusDuModele(132001.5)]);
dit('L43 l etat du rendez-vous : annule, honore, passe, a venir, le jour meme a venir', ['annule', 'passe', 'passe', 'a-venir', 'a-venir'], [
  etatDuRendezVous({ date: '2026-11-08', status: 'annulé' }, '2026-11-03'),
  etatDuRendezVous({ date: '2026-11-03', status: 'honoré' }, '2026-11-03'),
  etatDuRendezVous({ date: '2026-11-02', status: 'confirmé' }, '2026-11-03'),
  etatDuRendezVous({ date: '2026-11-08', status: 'confirmé' }, '2026-11-03'),
  etatDuRendezVous({ date: '2026-11-03', status: 'en attente' }, '2026-11-03T18:00:00Z'),
]);
dit('L44 une fiche beninoise : prenom, nom, civilite, indicatif et chiffres', { prenom: 'Adjoa', nom: 'Koffi Mensah', civilite: 'madame', numero: '0197000000', dial: '+229' },
  coordonneesDeLaFiche({ name: ' Adjoa  Koffi Mensah ', civilite: 'madame', phone: '+229 01 97 00 00 00' }));
dit('L45 la civilite ne se suppose pas, un numero local reste au Benin', { prenom: 'Sena', nom: '', civilite: '', numero: '0197000000', dial: '+229' },
  coordonneesDeLaFiche({ name: 'Sena', civilite: 'docteur', phone: '01 97 00 00 00' }));
dit('L46 un numero francais se coupe a +33', { numero: '612345678', dial: '+33' }, (({ numero, dial }) => ({ numero, dial }))(coordonneesDeLaFiche({ name: 'A', phone: '0033612345678' })));
dit('L47 un pays inconnu garde tout son plus et un indicatif vide', { numero: '+9715012345678', dial: '' }, (({ numero, dial }) => ({ numero, dial }))(coordonneesDeLaFiche({ name: 'A', phone: '+9715012345678' })));
const rdvs = [
  { date: '2026-10-01', status: 'honoré', serviceIds: ['sv-a', 'sv-b'] },
  { date: '2026-10-20', status: 'honoré', serviceIds: ['sv-c', 'sv-c', 'mauvais id'] },
  { date: '2026-10-25', status: 'annulé', serviceIds: ['sv-x'] },
  { date: '2026-11-20', status: 'confirmé', serviceIds: ['sv-z'] },
];
dit('L48 les gestes du dernier rituel passe, sans doublon ni id douteux, jamais un annule', ['sv-c'], gestesDuDernierRituel(rdvs, '2026-11-03'));
dit('L49 sans rituel passe, ceux du prochain ; sans rien, rien', [['sv-z'], []], [gestesDuDernierRituel(rdvs.slice(3), '2026-11-03'), gestesDuDernierRituel([], '2026-11-03')]);

dit('L50 au masculin dit monsieur, sans rien supposer d autre', ['monsieur', ''], [coordonneesDeLaFiche({ name: 'Jean', auMasculin: true }).civilite, coordonneesDeLaFiche({ name: 'Jean', auMasculin: 'oui' }).civilite]);
const motRetour = jetonDuLienDuRetour(['sv-a', 'sv-b', 'pas bon'], ident);
dit('L51 le lien du retour se relit par le site : ses gestes et son identite', { gestes: ['sv-a', 'sv-b'], calibre: '', identite: ident }, lienLu(`?r=${motRetour}`));
dit('L52 il a la forme exacte de jetonDuLien, et tient dans un bouton Meta', [jetonDuLien({ besoin: 'entretien', gestes: ['sv-a', 'sv-b'], identite: ident }), true], [motRetour, /^[A-Za-z0-9._~-]{1,500}$/.test(motRetour)]);
dit('L53 les gestes dits, ou la venue', ['Retwist et Shampoing', 'votre prochaine venue'], [gestesDitsDuRetour(['Retwist', '', 'Shampoing']), gestesDitsDuRetour([])]);

/* 8. Le bloc est entre ses reperes, pour les copies des fonctions. */
const src = readFileSync('src/shared/lien-du-rdv-pur.ts', 'utf8');
dit('L39 le bloc est entre ses reperes', true, src.includes('/* ⟨lien-du-rdv⟩ */') && src.includes('/* ⟨/lien-du-rdv⟩ */'));
dit('L40 rien hors du bloc que le commentaire d en-tete', true, src.slice(0, src.indexOf('/* ⟨lien-du-rdv⟩ */')).replace(/\/\*[\s\S]*?\*\//g, '').trim() === '');

console.log(`\n${n - ko}/${n} epreuves tenues${ko ? ` ; ${ko} en echec` : ''}.`);
