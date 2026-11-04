/* LA VOIX D'UN NUMÉRO, ÉPROUVÉE : 4 novembre 2026.
   `node scripts/verifie-la-voix-du-numero.mjs` (et `--prouve`).

   Une fiche d'enfant ne prête jamais son numéro à un fil WhatsApp : l'adulte
   qui porte le numéro parle, sinon le parent qui règle le compte famille,
   sinon une voix sans fiche (« Maman d'A. et N. »). Puis la même règle dans
   les têtes et les fils du Trône (`conversations.ts`). Les fiches et les
   numéros sont INVENTÉS : le dépôt est public. */
import { readFileSync } from 'node:fs';
import { parleSurCeNumero, voixDesNumeros, type FicheParlante } from '../src/shared/voix-du-numero-pur';
import { filsDeLaMaison, teteDuNumero, tetesDeLaMaison, type MessageWa } from '../src/shared/conversations';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const AUJ = '2026-11-04';
const MERE = '+229 0197000011';
const MAMAN = '+33 600000001';
const PAPA = '+229 0197000022';
const f = (o: Partial<FicheParlante> & { id: string; name: string }): FicheParlante => ({ branchId: 'maison', ...o });
/* Le foyer L. : deux sœurs (7 et 9 ans) sur le téléphone de leur mère, qui règle le compte et n'a pas de numéro sur sa fiche. */
const LI = f({ id: 'li', name: 'Lina L.', phone: MERE, birthday: '2019-01-03', familyId: 'fam-l' });
const MA = f({ id: 'ma', name: 'Maya L.', phone: MERE, birthday: '2017-06-23', familyId: 'fam-l' });
const RO = f({ id: 'ro', name: 'Rose G.', phone: '' });
/* Le foyer A. : deux frères, Maman (+33) et Papa ; le papa a sa fiche et règle le compte. */
const AU = f({ id: 'au', name: 'Aurel A.', phone: MAMAN, phone2: PAPA, phoneNom: 'Maman', phone2Nom: 'Papa', familyId: 'fam-a' });
const NO = f({ id: 'no', name: 'Noam A.', phone: '+33 6 00 00 00 01', phone2: PAPA, phoneNom: 'Maman', phone2Nom: 'Papa', birthday: '2012-04-08', familyId: 'fam-a' });
const MC = f({ id: 'mc', name: 'Marc A.', phone: PAPA, familyId: 'fam-a' });
const FAMILLES = [{ id: 'fam-l', payerClientId: 'ro' }, { id: 'fam-a', payerClientId: 'mc' }];
const FICHES = [LI, MA, RO, AU, NO, MC];

/* ── 1. Qui parle sur son numéro ── */
dit('une mineure ne parle pas ; un numéro nommé Maman ou Papa est celui d’un parent ; une adulte sans date parle', [false, false, false, false, true, true], [
  parleSurCeNumero(LI, 'phone', AUJ), parleSurCeNumero(AU, 'phone', AUJ), parleSurCeNumero(AU, 'phone2', AUJ), parleSurCeNumero(NO, 'phone', AUJ),
  parleSurCeNumero(MC, 'phone', AUJ), parleSurCeNumero(f({ id: 'x', name: 'X.', phone: MERE }), 'phone', AUJ),
]);
dit('17 ans la veille de ses 18 ans : enfant ; 18 ans le jour même : adulte', [false, true], [
  parleSurCeNumero(f({ id: 'a', name: 'A.', phone: MERE, birthday: '2008-11-05' }), 'phone', AUJ),
  parleSurCeNumero(f({ id: 'b', name: 'B.', phone: MERE, birthday: '2008-11-04' }), 'phone', AUJ),
]);
dit('« Mère », « Papa de », « Parents », « Tutrice » nomment un parent ; « Bureau » ou rien, non', [false, false, false, false, true, true],
  ['Mère', 'Papa de A.', 'Parents', 'Tutrice', 'Bureau', ''].map((n) => parleSurCeNumero(f({ id: 'x', name: 'X.', phone: MERE, phoneNom: n }), 'phone', AUJ)));

/* ── 2. Les voix ── */
const { voix } = voixDesNumeros({ fiches: FICHES, familles: FAMILLES, aujourdhui: AUJ });
const lis = (n: string) => {
  const fin = n.replace(/\D/g, '').slice(-8);
  const v = [...voix.values()].find((x) => x.numero.replace(/\D/g, '').endsWith(fin));
  return v ? (v.genre === 'fiche' ? `fiche:${v.fiche.id}:${v.enfants.join('+')}` : `sans-fiche:${v.nom}:${v.enfants.join('+')}`) : 'aucune';
};
dit('le téléphone de la mère : la mère qui règle le compte, sans numéro à elle', 'fiche:ro:li+ma', lis(MERE));
dit('le numéro de Maman (+33, porté par les deux frères, écrit de deux façons) : une voix sans fiche, avec l’élision', 'sans-fiche:Maman d’Aurel et Noam:au+no', lis(MAMAN));
dit('le numéro de Papa : le papa le porte, il parle par sa fiche, aucune voix à fabriquer', 'aucune', lis(PAPA));
const seule = (fiches: FicheParlante[], familles = FAMILLES) => [...voixDesNumeros({ fiches, familles, aujourdhui: AUJ }).voix.values()]
  .map((v) => (v.genre === 'sans-fiche' ? `sans-fiche:${v.nom}` : `fiche:${v.fiche.id}`));
dit('un enfant seul, sans compte famille : « Parent de L. »', ['sans-fiche:Parent de Lina'], seule([LI], []));
dit('un payeur qui a son propre numéro ne parle pas sur celui de ses enfants', ['sans-fiche:Parent de Lina et Maya'],
  seule([LI, MA, f({ id: 'ro', name: 'Rose G.', phone: '+229 0197000033' })]));
dit('une fiche adulte archivée ne parle plus : le numéro revient à la mère', ['fiche:ro'],
  seule([LI, MA, RO, f({ id: 'z', name: 'Z.', phone: MERE, archived: true })]));

/* ── 3. Les têtes et les fils du Trône ── */
const tetes = tetesDeLaMaison({ clientes: FICHES, familles: FAMILLES, aujourdhui: AUJ });
const qui = (n: string) => { const t = teteDuNumero(n, tetes); return t ? `${t.id}${t.sansFiche ? ':sans-fiche' : ''}` : 'aucune'; };
dit('teteDuNumero : la mère, la voix de Maman, le papa ; jamais une fiche d’enfant', ['ro', 'voix:33600000001:sans-fiche', 'mc'],
  [qui('2290197000011'), qui('33600000001'), qui('2290197000022')]);
const m = (id: string, numero: string, texte: string): MessageWa => ({ id, sens: 'entrant', numero, texte, quand: '2026-11-04T07:32:00Z' });
const fils = filsDeLaMaison([m('1', '2290197000011', 'Je n’ai pas pris de rendez-vous'), m('2', '33600000001', 'Bonjour'), m('3', '2290197000022', 'Bonjour')],
  tetes, [], Date.parse('2026-11-04T08:00:00Z'));
dit('les fils : la mère (sa fiche), Maman (sans fiche, nommée), le papa (sa fiche)',
  [['2290197000011', 'ro', 'Rose G.', false], ['33600000001', null, 'Maman d’Aurel et Noam', true], ['2290197000022', 'mc', 'Marc A.', false]],
  ['2290197000011', '33600000001', '2290197000022'].map((n) => { const x = fils.find((y) => y.numero === n); return x ? [x.numero, x.clientId ?? null, x.nom, x.sansFiche] : [n, 'absent']; }));

/* ── 4. La lettre ── */
const pur = readFileSync('src/shared/voix-du-numero-pur.ts', 'utf8');
const ecrans = ['src/apps/trone/routes/clients/LesConversations.tsx', 'src/apps/trone/routes/clients/Conversations.tsx', 'src/apps/trone/routes/clients/Gerard.tsx', 'src/apps/trone/routes/pilotage/AlarmeWhatsApp.tsx']
  .map((p) => sansCommentaires(readFileSync(p, 'utf8')));
dit('les quatre écrans donnent les comptes famille aux têtes', [true, true, true, true], ecrans.map((e) => /tetesDeLaMaison\(\{ clientes: clients, familles/.test(e)));
dit('pas de tiret cadratin, pas le mot banni', [false, false], [pur.includes(String.fromCharCode(0x2014)), /\bsalons?\b/i.test(pur)]);

console.log(ko === 0 ? '\nLa voix du numero tient.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
