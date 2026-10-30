/* LA BANQUE DE SCÉNARIOS, ÉPROUVÉE · 30 octobre 2026.
   `node scripts/verifie-la-banque.mjs` (et `--prouve`).

   ① Ce que l'automate comprend d'un message (`litLeCas`), et la comparaison
      à ce que la Maison attend (`ecartsDuCas`) : un signe perdu ou de trop,
      un autre qui répond.
   ② Les gestes de la banque : un cas par texte, sans numéro ni adresse ;
      valider, reprendre, retirer ; le passage (justes, cassés, à reprendre).
   ③ Les cas tirés d'une conversation : la rafale jointe, un tour neuf après
      la Maison ou six heures de silence ; une discussion exportée de
      WhatsApp (Android, iPhone), la cliente lue dans le nom du fichier.
   ④ L'écran : « Mauvaise réponse » sur l'automate et l'assistant seuls, la
      direction seule valide, la banque dans son propre document.
   Les messages du banc sont inventés : aucun vrai message de cliente ici. */
import { readFileSync } from 'node:fs';
import {
  ajouteDesCas, banqueLue, casDUnExport, clienteDeLExport, ecartsDuCas, idDuCas, litLeCas, litUnExport, passeLaBanque,
  reprendsLeCas, retireLeCas, texteDuCas, toursDesConversations, valideLeCas, type BanqueBrute,
} from '../src/shared/banque-scenarios-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko += 1; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
/* La panne de `--prouve`, posée en mémoire sur le texte lu, jamais sur le disque. */
const PANNE = process.env.BANQUE_PANNE ? JSON.parse(process.env.BANQUE_PANNE) as { fichier: string; avant: string; apres: string } : null;
const lit = (f: string) => {
  const t = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  return PANNE && PANNE.fichier === f ? t.replace(PANNE.avant, PANNE.apres) : t;
};

/* ── ① CE QU'IL COMPREND ── */
const NUIT = '2026-10-29T23:06:00.000Z';
dit('un rendez-vous pour demain 8h30, un shampoing : l automate, le jour, l heure, le lavage',
  { qui: 'automate', signes: ['reserver', 'jour', 'heure', 'geste:Lavage'] }, litLeCas('Prend moi RDV pour demain 8h30 pour un shampoing', NUIT));
dit('la localisation : l assistant, le chemin', { qui: 'assistant', signes: ['chemin'] }, litLeCas('Envoie moi la localisation', NUIT));
dit('en route pour le shampooing : l assistant, en route, un rendez-vous pris, le lavage',
  { qui: 'assistant', signes: ['rdv-pris', 'en-route', 'geste:Lavage'] }, litLeCas('Je suis en route pour le shampooing', NUIT));
dit('annuler : la main passe a l equipe', { qui: 'equipe', signes: ['rdv-pris', 'annuler'] }, litLeCas('Je dois annuler le rdv', NUIT));
dit('une adresse sympathique pour sortir : rien du chemin', { qui: 'assistant', signes: [] }, litLeCas('Auriez vous une adresse sympathique pour danser', NUIT));
dit('les jours se lisent depuis le message : demain, ecrit le 29 a 23 h 06 UTC, c est le 31 a Cotonou', true,
  litLeCas('demain', NUIT).signes.includes('jour'));

const attendu = { qui: 'assistant' as const, signes: ['chemin'] };
dit('un signe perdu, un signe de trop, un autre qui repond : chacun se dit', [
  ['ne lit plus « le chemin »'],
  ['lit « le chemin » en trop'],
  ['L’automate : boutons et listes, au lieu de : L’assistant (Claude)'],
  [],
], [
  ecartsDuCas(attendu, { qui: 'assistant', signes: [] }),
  ecartsDuCas({ qui: 'assistant', signes: [] }, { qui: 'assistant', signes: ['chemin'] }),
  ecartsDuCas(attendu, { qui: 'automate', signes: ['chemin'] }),
  ecartsDuCas(attendu, { qui: 'assistant', signes: ['chemin'] }),
]);

/* ── ② LA BANQUE ── */
const T = '2026-10-30T08:00:00.000Z';
dit('un texte propre : sans numero ni adresse', 'Rappelez-moi au [numéro] ou [adresse]', texteDuCas('Rappelez-moi au 01 97 00 00 11 ou awa@exemple.com'));
dit('le meme message a la ponctuation pres ne fait qu un cas', idDuCas('Je veux un shampoing !'), idDuCas('je veux un shampoing'));
let b: BanqueBrute = { cas: [] };
const r1 = ajouteDesCas(b, [
  { texte: 'Je veux un shampoing !', quand: T, source: 'maison' },
  { texte: 'je veux un shampoing', quand: T, source: 'export' },
  { texte: 'Envoie moi la localisation', quand: T, source: 'maison' },
  { texte: '   ', quand: T, source: 'maison' },
], T);
dit('ajouter : deux cas, le doublon et le vide ne comptent pas, tous proposes', [2, ['propose', 'propose']], [r1.ajoutes, r1.banque.cas.map((c) => c.etat)]);
b = r1.banque;
const [shp, loc] = b.cas;
b = valideLeCas(b, shp.id, litLeCas(shp.texte, shp.quand), 'direction', T);
b = reprendsLeCas(b, loc.id, { qui: 'assistant', signes: ['chemin', 'geste:Lavage'] }, 'Le plan, puis le lien.', 'direction', T);
const p = passeLaBanque(b);
dit('le passage : le valide tient, le repris attend l automate', [1, 0, 1, 0, 0], [p.justes, p.casses.length, p.aReprendre.length, p.reprisAValider.length, p.proposes]);
const casse = { cas: b.cas.map((c) => (c.id === shp.id ? { ...c, attendu: { qui: 'equipe' as const, signes: [] } } : c)) };
dit('un valide qui ne tient plus est casse', 1, passeLaBanque(casse).casses.length);
const repris = reprendsLeCas(b, loc.id, { qui: 'assistant', signes: ['chemin'] }, '', 'direction', T);
dit('un repris que l automate atteint enfin est a revalider', 1, passeLaBanque(repris).reprisAValider.length);
dit('retirer', 1, retireLeCas(b, loc.id).cas.length);
dit('la banque lue : un cas abime tombe, un doublon aussi, un attendu absent redevient propose', [2, 'propose'],
  [banqueLue({ cas: [...b.cas, b.cas[0], { id: 'x', texte: 'a' }, { ...b.cas[1], id: 'cas-abcdef12', attendu: { qui: 'robot' } }] }).cas.length - 1,
    banqueLue({ cas: [{ ...b.cas[1], id: 'cas-abcdef12', attendu: { qui: 'robot' } }] }).cas[0].etat]);

/* ── ③ LES CONVERSATIONS ── */
const h = (hhmm: string, jour = '2026-10-20') => `${jour}T${hhmm}:00.000Z`;
const tours = toursDesConversations([
  { fil: 'a', deLaCliente: true, texte: 'Bonjour', quand: h('09:00') },
  { fil: 'a', deLaCliente: true, texte: 'Je voudrais un RDV samedi', quand: h('09:01') },
  { fil: 'a', deLaCliente: false, texte: 'Avec plaisir', quand: h('09:05') },
  { fil: 'a', deLaCliente: true, texte: '<Médias omis>', quand: h('09:10') },
  { fil: 'a', deLaCliente: true, texte: 'Merci', quand: h('09:11') },
  { fil: 'a', deLaCliente: true, texte: 'Et le prix ?', quand: h('10:00') },
  { fil: 'a', deLaCliente: true, texte: 'Je suis en route', quand: h('17:00') },
  { fil: 'b', deLaCliente: true, texte: 'Comment venir chez vous ?', quand: h('11:00') },
]);
dit('la rafale jointe ; un tour neuf apres la Maison ou six heures de silence ; un media ne compte pas', [
  'Bonjour\nJe voudrais un RDV samedi', 'Merci', 'Je suis en route', 'Comment venir chez vous ?',
], tours.map((t) => t.texte));

const ANDROID = [
  '30/10/2026 00:05 - Les messages et les appels sont chiffrés de bout en bout.',
  '30/10/2026 00:05 - Awa Essai: Bonjour',
  '30/10/2026 00:05 - Awa Essai: Je voudrais un shampoing',
  'et un resserrage',
  '30/10/2026 00:09 - Brice: Avec plaisir',
  '30/10/2026 10:15 - Awa Essai: <Médias omis>',
  '31/10/26, 9:02 PM - Awa Essai: Vous êtes où ?',
].join('\n');
const lignes = litUnExport(ANDROID);
dit('Android : les lignes datees, la suite d un message, l heure de Cotonou, le soir en PM', [
  5, 'Je voudrais un shampoing\net un resserrage', '2026-10-29T23:05:00.000Z', '2026-10-31T20:02:00.000Z',
], [lignes.length, lignes[1].texte, lignes[0].quand, lignes[4].quand]);
const IPHONE = '[30/10/2026 00:05:12] Awa Essai: Envoie moi la loc\n[30/10/2026 00:06:40] Maison MND: Avec plaisir';
dit('iPhone : les crochets et les secondes', ['Awa Essai', 'Envoie moi la loc', 'Maison MND'], [litUnExport(IPHONE)[0].qui, litUnExport(IPHONE)[0].texte, litUnExport(IPHONE)[1].qui]);
dit('la cliente : le nom du fichier, sinon la seconde personne qui ecrit', ['Awa Essai', 'Brice'],
  [clienteDeLExport(lignes, 'Discussion WhatsApp avec Awa Essai.txt'), clienteDeLExport(litUnExport('30/10/2026 00:05 - Awa Essai: a\n30/10/2026 00:06 - Brice: b'), 'export.txt')]);
dit('les cas d un export : ses tours a elle, la rafale jointe', ['Bonjour\nJe voudrais un shampoing\net un resserrage', 'Vous êtes où ?'],
  casDUnExport(lignes, 'Awa Essai').map((t) => t.texte));

/* ── ④ L'ÉCRAN ── */
const conv = lit('src/apps/trone/routes/clients/LesConversations.tsx');
const ecran = lit('src/apps/trone/routes/clients/BanqueDeScenarios.tsx');
const magasin = lit('src/shared/banque-scenarios.ts');
dit('« Mauvaise réponse » sur l automate et l assistant seuls, dans le menu des outils et sous la boite', [true, true, true], [
  conv.includes("{m.sens === 'sortant' && (x.auteur === 'automate' || x.auteur === 'assistant') && ("),
  conv.includes("onClick={() => ouvreLOutil('scenarios')}><b>Banque de scénarios</b>"),
  conv.includes('<BanqueDeScenarios casAOuvrir={casAOuvrir} />'),
]);
dit('la direction seule valide, reprend ou retire', true, ecran.includes('{direction && !enReprise && ('));
dit('la banque dans son propre document, que le serveur ne lit pas', [true, true],
  [magasin.includes("createStore<BanqueBrute>('mnd_scenarios_wa', BANQUE_VIDE)") && magasin.includes("bindDocument(banqueStore, 'mnd_scenarios_wa')"),
    !lit('supabase/functions/whatsapp-automate/index.ts').includes('mnd_scenarios_wa')]);

console.log(ko === 0 ? '\nLa banque tient.' : `\n${ko} ECHEC.`);
process.exit(ko ? 1 : 0);
