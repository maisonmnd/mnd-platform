/* LA REVUE DU 10 OCTOBRE 2026, LOT « MESSAGES », ÉPROUVÉE —
   `node scripts/verifie-revue-messages.mjs` (et `--prouve`).

   Quatorze constats sur ce que la Maison écrit à ses clientes, et sur le
   chemin qui le fait partir :
   · un message retenu perdu quand on quitte l'écran (n7), envoyé deux fois
     quand un modèle part pendant sa retenue (n8), perdu en fermant l'onglet
     avec une pièce trop lourde (n9) ;
   · un second numéro écrasé en silence au rattachement (n10) ;
   · des dates sans l'année dans les gestes du fil (n11), la relance J-3 et
     le rappel (n73), la fin de paquet (n74), le code de promotion (n80), le
     bilan de séance (n86) ;
   · la cliente appelée sans sa civilité : fin de paquet (n75), rappel d'une
     demande (n76), code de promotion (n80) ;
   · l'alarme qui montre la confirmation automatique au lieu de sa question
     (n12), un partage annoncé « bloqué » à tort (n13), une sonnette qui ne se
     réarme plus (n14).

   LES ATTENTES SONT ÉCRITES EN DUR, jamais tirées du code éprouvé. Ce qui
   vit dans un écran (le compte à rebours, le rattachement, l'alarme, le
   panneau de la promo) se lit dans la source, commentaires effacés, motifs
   en String.raw. */
import { readFileSync } from 'node:fs';
import {
  filsDeLaMaison, filNeuf, partEnFermant, rattachementDuNumero, type MessageWa,
} from '../src/shared/conversations';
import { jourDit as jourDuGeste, jourEtHeureDits } from '../src/shared/gestes-conversation';
import { ouvreWhatsAppAvecLePdf } from '../src/shared/partage-whatsapp';
import { armeLaSonnette, laSonnetteEstArmee } from '../src/shared/sonnette';
import { momentCourt, texteDeLaRelance, texteDuRappel } from '../src/shared/rappel';
import { variablesDeLaFinDePaquet, phraseDeLaFinDePaquet } from '../src/shared/fin-de-paquet';
import type { FinDePaquet } from '../src/shared/abonnements';
import { messageDeRappel } from '../src/shared/demandes';
import { instantDit } from '../src/shared/promos';
import { messageDuBilan, variablesDuModeleBilan, annonceDuBilan } from '../src/shared/bilan-document';
import type { Bilan } from '../src/shared/bilans';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* Une source, commentaires effacés : un motif cité dans un commentaire ne
   doit jamais faire passer un contrôle. */
const source = (rel: string): string => readFileSync(rel, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\s*\}/g, '{}');

const conversations = source('src/apps/trone/routes/clients/Conversations.tsx');
const alarme = source('src/apps/trone/routes/pilotage/AlarmeWhatsApp.tsx');
const gestes = source('src/apps/trone/routes/clients/_gestes.tsx');

/* ── n7 · L'ÉCRAN QU'ON QUITTE NE MANGE PAS LE MESSAGE ─────────────────
   Un effet dont le NETTOYAGE (le démontage) fait partir l'attente en cours. */
dit('n7 le demontage fait partir le message retenu', true,
  new RegExp(String.raw`useEffect\(\(\) => \(\) => \{\s*const a = attenteEnCours\.current;\s*if \(a\) partirUneFoisRef\.current\(a\);\s*\}, \[\]\);`).test(conversations));
dit('n7 ... par la reference du dernier rendu, pas la copie du premier', true,
  new RegExp(String.raw`partirUneFoisRef\.current = partirUneFois;`).test(conversations));

/* ── n8 · UN MESSAGE RETENU NE PART QU'UNE FOIS ───────────────────────── */
dit('n8 le message suivant vide l attente avant de la faire partir', true,
  new RegExp(String.raw`if \(enAttente\) \{ const a = enAttente; setEnAttente\(null\); partirUneFois\(a\); \}`).test(conversations));
dit('n8 ... et plus aucun partir(enAttente) nu', [],
  conversations.match(new RegExp(String.raw`void partir\(enAttente\)`, 'g')) ?? []);
dit('n8 une attente partie ne repart plus', true,
  new RegExp(String.raw`if \(dejaPartis\.current\.has\(a\)\) return;\s*dejaPartis\.current\.add\(a\);\s*void partir\(a, enFermant\);`).test(conversations));

/* ── n9 · EN FERMANT, UNE PIÈCE TROP LOURDE SE GARDE ───────────────────── */
const petit = JSON.stringify({ numero: '2290197000088', texte: 'Bonjour' });
const photo = JSON.stringify({ numero: '2290197000088', piece: { donnees: `data:image/jpeg;base64,${'A'.repeat(68_000)}` } });
const accents = JSON.stringify({ texte: 'é'.repeat(31_000) });
dit('n9 un texte court part par keepalive', true, partEnFermant(petit));
dit('n9 une photo de 50 Ko en base64 ne part pas par keepalive', false, partEnFermant(photo));
dit('n9 la borne se compte en octets (31 000 accents = 62 000 octets)', false, partEnFermant(accents));
const fermant = conversations.slice(conversations.indexOf('if (enFermant) {'), conversations.indexOf('keepalive: true'));
dit('n9 la borne de taille garde l appel AVANT le keepalive', true,
  new RegExp(String.raw`if \(!partEnFermant\(JSON\.stringify\(corps\)\)\) \{ gardeUnAppel\('whatsapp-envoi', corps,`).test(fermant));

/* ── n10 · LE SECOND NUMÉRO NE S'ÉCRASE PLUS EN SILENCE ────────────────── */
dit('n10 fiche a deux numeros : remplacer, en nommant l ancien',
  { geste: 'remplacer', champ: 'phone2', ancien: '2290196000011' },
  rattachementDuNumero({ phone: '+229 0197000088', phone2: '+229 0196000011' }, '2290195000022'));
dit('n10 fiche a un numero : le second', { geste: 'ecrire', champ: 'phone2' },
  rattachementDuNumero({ phone: '+229 0197000088' }, '2290195000022'));
dit('n10 fiche sans numero : le premier', { geste: 'ecrire', champ: 'phone' },
  rattachementDuNumero({}, '2290195000022'));
dit('n10 numero deja sur la fiche : rien a ecrire', { geste: 'deja' },
  rattachementDuNumero({ phone: '+229 0197000088', phone2: '+229 0196000011' }, '2290196000011'));
dit('n10 l ecran demande l accord avant de remplacer', true,
  new RegExp(String.raw`const r = rattachementDuNumero\(c, numero\);\s*if \(r\.geste === 'remplacer' && !await demande\(\{`).test(conversations));
dit('n10 ... et ne choisit plus le champ a l aveugle', [],
  conversations.match(new RegExp(String.raw`numeroWa\(c\.phone\) \? 'phone2' : 'phone'`, 'g')) ?? []);

/* ── n11 · LES GESTES DU FIL DISENT L'ANNÉE ───────────────────────────── */
dit('n11 un jour du geste porte son annee', 'dimanche 6 septembre 2026', jourDuGeste('2026-09-06'));
dit('n11 ... avec l heure aussi', 'samedi 12 juin 2027 à 10 h 30', jourEtHeureDits('2027-06-12', '10:30'));

/* ── n12 · L'ALARME MONTRE SA QUESTION ────────────────────────────────── */
const T = Date.parse('2026-10-10T10:00:00Z');
const msg = (o: Partial<MessageWa>): MessageWa =>
  ({ id: 'm', sens: 'entrant', numero: '2290197000088', texte: '', quand: new Date(T).toISOString(), ...o });
const [fil] = filsDeLaMaison([
  msg({ id: 'q', texte: 'je peux décaler ?', quand: new Date(T - 2 * 3600_000).toISOString() }),
  msg({ id: 'c', sens: 'sortant', modele: 'confirmation_rdv', parQui: 'la Maison, automatiquement',
    texte: 'Votre rendez-vous est confirmé.', quand: new Date(T - 3600_000).toISOString() }),
], [], [], T);
dit('n12 le fil attend toujours une reponse', true, fil?.attendUneReponse);
dit('n12 le dernier qui compte est sa question', 'je peux décaler ?', fil?.dernierQuiCompte?.texte);
dit('n12 ... et son heure est celle de la question', new Date(T - 2 * 3600_000).toISOString(), fil?.dernierQuiCompte?.quand);
dit('n12 un fil neuf a aussi son dernier qui compte', true, !!filNeuf('2290197000088')?.dernierQuiCompte);
dit('n12 l alarme lit le dernier qui compte (texte et heure)', [true, true], [
  new RegExp(String.raw`const m: MessageWa = f\.dernierQuiCompte;`).test(alarme),
  new RegExp(String.raw`quandRecu\(f\.dernierQuiCompte\.quand, tick\)`).test(alarme),
]);
dit('n12 ... et plus jamais f.dernier', [], alarme.match(/\bf\.dernier\b(?!QuiCompte)/g) ?? []);

/* ── n13 · LE PARTAGE NE SE DIT PLUS BLOQUÉ À TORT ─────────────────────
   La fenêtre simulée suit la norme : avec 'noopener', `open` rend null même
   quand l'onglet s'ouvre. */
type Ouverture = { lien: string; options?: string };
const ouvertures: Ouverture[] = [];
const onglet: { opener: unknown } = { opener: 'notre page' };
let bloque = false;
const w = globalThis.window as unknown as Record<string, unknown>;
w.open = (lien: string, _cible?: string, options?: string) => {
  ouvertures.push({ lien, options });
  if (bloque) return null;
  return /noopener/.test(options ?? '') ? null : onglet;
};
const fichier = new File([new Uint8Array([37, 80, 68, 70])], 'Lettre.pdf', { type: 'application/pdf' });

/* ── n14 · LA SONNETTE SE RÉARME ─────────────────────────────────────── */
let reprises = 0;
const contextes: { state: string }[] = [];
class FauxContexte {
  state = 'suspended';
  constructor() { contextes.push(this); }
  resume() { reprises++; this.state = 'running'; return Promise.resolve(); }
}
w.AudioContext = FauxContexte;

/* ── n73 · LA RELANCE ET LE RAPPEL DISENT L'ANNÉE ─────────────────────── */
const relance = texteDeLaRelance({
  prenom: 'Madame R.', jourIso: '2026-11-13', heure: '10:00', aujourdhuiIso: '2026-10-10', maison: 'Maison MND',
});
dit('n73 la relance J-3 porte l annee, meme celle de cette annee', true,
  relance.includes('prévu le vendredi 13 novembre 2026 à 10 h.'));
const rappel = texteDuRappel({
  prenom: 'Madame R.', jourIso: '2026-10-20', heure: '09:00', aujourdhuiIso: '2026-10-10', demainIso: '2026-10-11',
  rituels: [], maison: 'Maison MND',
});
dit('n73 le rappel au-dela de demain porte l annee', true,
  rappel.includes('prévu pour le mardi 20 octobre 2026 à 9 h.'));
dit('n73 l ecran de l equipe garde la forme courte', 'mardi 20 octobre à 9 h',
  momentCourt({ jourIso: '2026-10-20', heure: '09:00', aujourdhuiIso: '2026-10-10', demainIso: '2026-10-11' }));

/* ── n74 · n75 · LA FIN DE PAQUET : L'ANNÉE ET SA CIVILITÉ ────────────── */
const paquet = (o: Partial<FinDePaquet>): FinDePaquet => ({
  sub: { id: 's1' }, clientId: 'c1', nom: 'K. K.', formule: 'Prolongement 6 soins', reste: 1,
  jusquau: '2027-01-12', motif: 'date-proche', ...o,
} as unknown as FinDePaquet);
dit('n74 n75 un abonne marque Monsieur, un paquet qui finit l an prochain',
  ['Monsieur K.', '1 séance', 'Prolongement 6 soins', 'valable jusqu’au 12 janvier 2027'],
  variablesDeLaFinDePaquet(paquet({}), { name: 'K. K.', civilite: 'monsieur' }));
dit('n75 une fiche muette est une dame', 'Madame R.',
  variablesDeLaFinDePaquet(paquet({ nom: 'R. A.' }), { name: 'R. A.' })[0]);
dit('n75 sans fiche, le nom du contrat et Madame', 'Madame R.',
  variablesDeLaFinDePaquet(paquet({ nom: 'R. A.' }))[0]);
dit('n74 n75 la phrase du fil suit',
  'Bonjour Monsieur K., il vous reste 1 séance sur votre Prolongement 6 soins, valable jusqu’au 12 janvier 2027. Pensez à réserver : nous vous gardons votre place.',
  phraseDeLaFinDePaquet(paquet({}), { name: 'K. K.', civilite: 'monsieur' }));

/* ── n76 · LE RAPPEL D'UNE DEMANDE, AVEC SA CIVILITÉ ──────────────────── */
dit('n76 une demande ou il a choisi Monsieur', true,
  messageDeRappel({ prenom: 'K.', besoin: 'creation', civilite: 'monsieur' }).startsWith('Bonjour Monsieur K., ici la Maison MND.'));
dit('n76 une demande du site sans civilite', true,
  messageDeRappel({ prenom: 'A.', besoin: 'inconnu' }).startsWith('Bonjour Madame A., ici la Maison MND.'));
dit('n76 sans prenom, Madame seul', true,
  messageDeRappel({ prenom: ' ', besoin: 'inconnu' }).startsWith('Bonjour Madame, ici'));

/* ── n80 · LE CODE DE PROMOTION : L'ANNÉE ET SA CIVILITÉ ──────────────── */
dit('n80 l instant porte l annee', 'vendredi 16 octobre 2026 à 14 h', instantDit('2026-10-16T13:00:00Z'));
dit('n80 le message du code commence par son appel', true,
  new RegExp(String.raw`const message = \`\$\{appel\}, la Maison vous offre`).test(gestes));
dit('n80 ... et l appel vient de appelDe sur sa fiche', true,
  new RegExp(String.raw`const appel = appelDe\(clients\.find\(\(c\) => c\.id === tete\.id\), tete\.name\);`).test(gestes));

/* ── n86 · LE BILAN DE SÉANCE DIT L'ANNÉE ─────────────────────────────── */
const bilan = { id: 'b1', branchId: 'b1', clientId: 'c1', numero: 'MND-BS-2026-0001', date: '2026-10-04',
  jauges: [], points: [], rituel: [], remisLe: '2026-10-04' } as unknown as Bilan;
const awa = { name: 'Awa K.' };
dit('n86 le mot du bilan porte l annee', true,
  messageDuBilan(bilan, awa).includes('voici le bilan de votre séance du 4 octobre 2026,'));
dit('n86 les variables du modele Meta', ['Madame Awa', '4 octobre 2026'], variablesDuModeleBilan(bilan, awa));
dit('n86 la notification de Ma Couronne',
  'Madame Awa, votre bilan du 4 octobre 2026 est prêt, avec votre routine à la maison.', annonceDuBilan(bilan, awa));

/* ── REPRISE (10 octobre 2026) · L'ÉCHANTILLON DOCUMENTÉ EST CE QUE LE CODE
   ENVOIE ─────────────────────────────────────────────────────────────────
   n74, n75 et n86 ont changé la forme de trois variables de modèles Meta.
   Yéman soumet un modèle en recopiant l'échantillon de BRANCHER-ENVOIS (et
   du document vivant des modèles, hors du dépôt, relu à la main) : un
   échantillon resté à l'ancienne forme ferait examiner chez Meta un message
   que le Trône n'envoie plus. La règle : pour la même cliente et la même
   date, la variable que le code rend et l'échantillon que la doc montre sont
   la même chaîne, toutes deux écrites ici en dur. Apostrophes et retours à
   la ligne de la doc ramenés à une forme simple avant de comparer. */
const simple = (s: string) => s.replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
const envois = simple(readFileSync('docs/BRANCHER-ENVOIS.md', 'utf8'));
const entre = (debut: string, fin: string) => {
  const i = envois.indexOf(debut);
  const j = i < 0 ? -1 : envois.indexOf(fin, i);
  return i < 0 || j < 0 ? '' : envois.slice(i, j);
};
const docPaquet = entre('**`fin_de_paquet`**', '**Quand il part**');
const docBilan = entre('**`bilan_de_seance`**', '## Règles de la maison');
const echantillon = (section: string, v: number) =>
  section.match(new RegExp(String.raw`\{\{${v}\}\} = [^«]*« ([^»]+) »`))?.[1] ?? '(absent)';

dit('reprise code fin_de_paquet, la cliente des echantillons',
  ['Madame Awa', '2 séances', 'formule Entretien', 'valable jusqu’au 12 juin 2027'],
  variablesDeLaFinDePaquet(
    paquet({ nom: 'Awa K.', reste: 2, formule: 'formule Entretien', jusquau: '2027-06-12' }), awa));
dit('reprise doc fin_de_paquet v1 montre la civilite', 'Madame Awa', echantillon(docPaquet, 1));
dit('reprise doc fin_de_paquet v4 montre l annee', "valable jusqu'au 12 juin 2027", echantillon(docPaquet, 4));
dit('reprise doc bilan_de_seance v1', 'Madame Awa', echantillon(docBilan, 1));
dit('reprise doc bilan_de_seance v2 montre l annee', '4 octobre 2026', echantillon(docBilan, 2));

/* ── LES ÉPREUVES QUI ATTENDENT (partage, sonnette) ───────────────────── */
const r1 = await ouvreWhatsAppAvecLePdf({ fichier, texte: 'Votre lettre', numero: '+229 0197000088' });
dit('n13 l onglet ouvert se dit ouvert', 'telecharge-et-ouvre', r1);
dit('n13 ... sans noopener dans l appel', [undefined], ouvertures.map((o) => o.options));
dit('n13 ... et notre page est coupee de l onglet a la main', null, onglet.opener);
bloque = true;
dit('n13 un vrai blocage se dit bloque', 'bloque',
  await ouvreWhatsAppAvecLePdf({ fichier, texte: 'Votre lettre', numero: '+229 0197000088' }));

armeLaSonnette();
await Promise.resolve(); await Promise.resolve();
dit('n14 au premier geste, la sonnette est armee', [true, 1], [laSonnetteEstArmee(), reprises]);
contextes[0].state = 'interrupted';
dit('n14 un appel telephonique suspend le son : elle ne se dit plus armee', false, laSonnetteEstArmee());
armeLaSonnette();
await Promise.resolve(); await Promise.resolve();
dit('n14 le geste suivant la rearme', [true, 2], [laSonnetteEstArmee(), reprises]);
armeLaSonnette();
dit('n14 armee, un geste de plus ne relance rien', 2, reprises);

console.log(ko === 0 ? '\nLe lot messages tient.' : `\n${ko} epreuve(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
