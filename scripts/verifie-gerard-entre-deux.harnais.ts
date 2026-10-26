/* GERARD SAIT « ENTRE DEUX SEANCES », EPROUVE — 26 octobre 2026.
   `node scripts/verifie-gerard-entre-deux.mjs` (et `--prouve`).

   « Toutes les rubriques entre deux seances, les reponses, ce que les
   clients disent : dans l'assistant » (Yeman) ; au selecteur : dans Gerard,
   leurs mots lisibles par Claude SANS NOM NI NUMERO. Tout est invente, les
   clientes sont des initiales ; les attendus sont ecrits a la main. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ACCUSE, ACCUSE_SANTE, SOUCIS } from '../src/shared/entre-deux-pur';
import {
  ceQueGerardSait, consigneEntreDeux, gerardRepondAuSouci, gerardSeTait, motsDesNoms, motsSansNom, souciOuvertDe,
} from '../src/shared/gerard-entre-deux-pur';

declare const __FAUTE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (n: number, nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} #${n} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 200)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 200)}`));
};
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => {
  let s = readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentaires(s);
};

const MAINTENANT = '2026-10-26T12:00:00.000Z';
const NOMS = ['Awa Dossou', 'KPADONOU Mariette', 'Anne-Marie Ahokpe'];
const sig = (id: string, clientId: string, soucis: string[], quand: string, o: Record<string, unknown> = {}) =>
  ({ id, branchId: 'b', clientId, soucis, quand, canal: 'whatsapp', etat: 'ouvert', ...o }) as never;
const SIGNALEMENTS = [
  sig('s1', 'c1', ['seches'], '2026-10-20T10:00:00.000Z', { texte: 'Bonjour c est Awa Dossou, mes locks sont seches, appelez moi au 97 12 34 56' }),
  sig('s2', 'c2', ['gratte'], '2026-10-25T08:00:00.000Z', { texte: 'ca gratte, Mariette ici, ecrivez a mariette@exemple.com' }),
  sig('s3', 'c3', ['cassantes'], '2026-10-10T08:00:00.000Z', { texte: 'elles cassent', etat: 'traite' }),
  sig('s4', 'c4', [], '2026-10-22T08:00:00.000Z', { bien: true }),
  sig('s5', 'c5', ['seches'], '2026-07-01T08:00:00.000Z', { texte: 'trop vieux' }),
];
const VALIDEES = { seches: 'Nourrir : quelques gouttes d huile legere.', gratte: 'NE DOIT JAMAIS PARTIR' };

/* == #1 -- LEURS MOTS, SANS NOM NI NUMERO == */
const mots = motsDesNoms(NOMS);
dit(1, 'les mots des noms : trois lettres au moins, prenoms composes coupes', true, ['awa', 'dossou', 'kpadonou', 'mariette', 'anne', 'marie', 'ahokpe'].every((m) => mots.includes(m)));
const m1 = motsSansNom('Bonjour c est Awa Dossou, mes locks sont seches, appelez moi au 97 12 34 56', mots);
dit(1, 'le nom et le numero sortent, la phrase reste', [false, false, false, true, true],
  [/Awa/i.test(m1), /Dossou/i.test(m1), /97 12/.test(m1), m1.includes('[numéro]'), m1.includes('mes locks sont seches')]);
const m2 = motsSansNom('ca gratte, Mariette ici, ecrivez a mariette@exemple.com', mots);
dit(1, 'un prenom seul et une adresse sortent aussi', [false, true], [/mariette/i.test(m2), m2.includes('[adresse]')]);
dit(1, 'un nom en capitales ou accentue sort quand meme', false, /kpadonou|anne|ahokp/i.test(motsSansNom('KPADONOU et Anne-Marié Ahokpè', mots)));
dit(1, 'une phrase trop longue est coupee a 160 signes', 160, motsSansNom('a'.repeat(400), mots).length);

/* == #2 -- CE QUE GERARD SAIT == */
const sait = ceQueGerardSait({ signalements: SIGNALEMENTS, validees: VALIDEES, noms: NOMS, maintenant: MAINTENANT });
const rub = (cle: string) => sait.rubriques.find((r) => r.cle === cle)!;
dit(2, 'les huit rubriques, dans l ordre de la Maison', SOUCIS.map((s) => s.cle), sait.rubriques.map((r) => r.cle));
dit(2, '60 jours : le signalement de juillet ne compte pas ; « tout va bien » n est pas un souci', { dits: 3, ouverts: 2, enRetard: 1, toutVaBien: 1, sansReponse: 5 }, sait.total);
dit(2, 'Seches : la reponse VALIDEE, 1 dit, 1 ouvert', ['Nourrir : quelques gouttes d huile legere.', 1, 1], [rub('seches').reponse, rub('seches').dits, rub('seches').ouverts]);
dit(2, 'Sante : toujours l accuse sante, jamais une reponse ecrite meme validee', ACCUSE_SANTE, rub('gratte').reponse);
dit(2, 'une rubrique sans reponse validee : null (Gerard n envoie qu un accuse)', null, rub('inegales').reponse);
dit(2, 'Sante ouverte depuis plus de 24 h : en retard', 1, rub('gratte').enRetard);
dit(2, 'leurs mots, sans nom ni numero', true, rub('seches').mots.length === 1 && !/Awa|Dossou|97 12/.test(rub('seches').mots[0]));

/* == #3 -- QUAND ELLE LUI ECRIT == */
dit(3, 'seches : la reponse validee', ['conseil', ['Nourrir : quelques gouttes d huile legere.'], false, false],
  (({ niveau, textes, avancer, prevenirLEquipe }) => [niveau, textes, avancer, prevenirLEquipe])(gerardRepondAuSouci('mes locks sont seches', VALIDEES)!));
dit(3, 'odeur, sans reponse validee : l accuse seul', [ACCUSE], gerardRepondAuSouci('ca sent l humide', VALIDEES)!.textes);
dit(3, 'sante : l accuse sante seul, l equipe prevenue, jamais la reponse « validee »', ['sante', [ACCUSE_SANTE], true],
  (({ niveau, textes, prevenirLEquipe }) => [niveau, textes, prevenirLEquipe])(gerardRepondAuSouci('ca gratte et j ai des plaques', VALIDEES)!));
dit(3, 'cassantes : on propose d avancer le RDV, et l equipe est prevenue', [true, true],
  (({ avancer, prevenirLEquipe }) => [avancer, prevenirLEquipe])(gerardRepondAuSouci('elles cassent au bout', VALIDEES)!));
dit(3, 'un message qui ne parle pas de ses cheveux : rien', null, gerardRepondAuSouci('je peux venir samedi ?', VALIDEES));

/* == #4 -- QUAND GERARD SE TAIT == */
dit(4, 'le souci ouvert le plus grave : Sante, puis A voir ; un conseil ou un souci traite ne compte pas', ['sante', 'a-voir', null, null, null], [
  souciOuvertDe([sig('a', 'x', ['seches'], MAINTENANT), sig('b', 'x', ['chute'], MAINTENANT)]) ?? null,
  souciOuvertDe([sig('a', 'x', ['inegales'], MAINTENANT)]) ?? null,
  souciOuvertDe([sig('a', 'x', ['seches'], MAINTENANT)]) ?? null,
  souciOuvertDe([sig('a', 'x', ['chute'], MAINTENANT, { etat: 'traite' })]) ?? null,
  souciOuvertDe([sig('a', 'x', [], MAINTENANT, { bien: true })]) ?? null,
]);
dit(4, 'gerardSeTait suit le souci ouvert', [true, true, false], [gerardSeTait({ souciOuvert: 'sante' }), gerardSeTait({ souciOuvert: 'a-voir' }), gerardSeTait({})]);

/* == #5 -- LA CONSIGNE QUE CLAUDE LIRA == */
const consigne = consigneEntreDeux(sait);
const brouillons = SOUCIS.filter((s) => s.niveau !== 'sante' && !(s.cle in VALIDEES) && s.brouillon !== ACCUSE).map((s) => s.brouillon);
dit(5, 'la consigne : les reponses validees, l accuse sante, la regle du silence, leurs mots', [true, true, true, true],
  [consigne.includes(VALIDEES.seches), consigne.includes(ACCUSE_SANTE), consigne.includes('ni envie ni remise'), consigne.includes('mes locks sont seches')]);
dit(5, '... jamais un brouillon, jamais la reponse « validee » d une rubrique Sante, jamais un nom ni un numero', [false, false, false],
  [brouillons.some((b) => consigne.includes(b)), consigne.includes('NE DOIT JAMAIS PARTIR'), /Awa|Dossou|Mariette|97 12|@exemple/i.test(consigne)]);

/* == #6 -- LE CABLAGE == */
{
  const carte = source('src/apps/trone/routes/clients/GerardEntreDeux.tsx');
  dit(6, 'la carte ne lit que les reponses VALIDEES et retire les noms de la branche', [true, true], [
    /reponses\.filter\(\(r\) => \(r\.texteValide \?\? ''\)\.trim\(\)\)\.map\(\(r\) => \[r\.id, r\.texteValide as string\]\)/.test(carte),
    /noms: clientes\.map\(\(c\) => c\.name \?\? ''\)/.test(carte),
  ]);
}

console.log(ko === 0 ? 'Gerard sait Entre deux seances.' : `${ko} constat(s) en echec.`);
