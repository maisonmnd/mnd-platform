/* LA DEVISE, ÉPROUVÉE. « Quand l'IA répond aux messages, toujours avoir notre
   devise à la fin » (Yéman, 22 août 2026). Elle est posée par le code, jamais
   demandée au modèle — et ce harnais tient les deux promesses qui comptent :
   elle EST là, et elle n'y est jamais DEUX fois.
   Lancé par `node scripts/verifie-signature.mjs`. */
import {
  DEVISE_MAISON, houseSignature, porteLaDevise, signeLeMessage, maisonNom,
} from '../src/shared/identite';
import { DEVISE_FON_B64 } from '../src/shared/devise-fon-b64';
import { pdfSafe, pdfSafeGardeFon, dessineQrPaiement } from '../src/shared/pdf';
import { decoupeTelephone, numeroTelReel } from '../src/shared/geo';
import { estIdentifiantMomo, ussdAvecMontant } from '../src/shared/momo';
import { appelsAActer, type AppelRecu } from '../src/shared/appels';

let echecs = 0;
const dit = (ok: boolean, quoi: string) => {
  if (!ok) { echecs++; console.log(`  ÉCHEC — ${quoi}`); }
};

/* ① Un message sans devise la reçoit, en dernière ligne. */
const nu = 'Merci pour votre confiance, à très vite.';
const signe = signeLeMessage(nu);
dit(signe.startsWith(nu), 'le texte de l’IA est conservé mot pour mot');
dit(signe.endsWith(houseSignature()), 'la devise ferme le message');
dit(signe.includes(maisonNom()), 'le nom de la Maison accompagne la devise');

/* ② Elle ne se pose JAMAIS deux fois. Un modèle qui l'a déjà écrite — bien
   ou mal — ne doit pas voir la Maison signer en double sous un avis public. */
dit(!signeLeMessage(signe).endsWith(`${houseSignature()}\n\n${houseSignature()}`), 'pas de double signature');
dit(signeLeMessage(signe) === signe, 'signer deux fois ne change rien');
for (const ecorche of [
  'Merci ! mi nyɔ́ ɖɛkpɛ',          // la forme juste
  'Merci ! Mi Nyɔ́ Ɖɛkpɛ.',         // capitalisée
  'Merci ! mi nyo dekpe',           // sans diacritiques — la faute la plus probable
  'Merci ! mi nyɔ ɖɛkpɛ',           // sans le ton
]) dit(porteLaDevise(ecorche), `la devise est reconnue sous « ${ecorche.slice(8)} »`);

/* ③ Ce qui ne la porte pas est bien vu comme tel — sinon un message partirait nu. */
for (const sans of ['Merci pour votre visite.', 'Nous sommes beaux !', '']) {
  dit(!porteLaDevise(sans), `« ${sans} » ne porte pas la devise`);
}

/* ④ Un texte vide rend la signature seule, jamais deux lignes blanches. */
dit(signeLeMessage('') === houseSignature(), 'texte vide → la signature seule');
dit(signeLeMessage('Merci.   \n\n  ').endsWith(houseSignature()), 'les blancs de fin ne creusent pas le message');
dit(!signeLeMessage('Merci.\n\n\n').includes('\n\n\n'), 'jamais trois sauts de ligne');

/* ⑤ Le picto de la branche prend la place du monogramme, qui ne voyage pas. */
dit(signeLeMessage('Merci.', '❦').includes('❦'), 'le picto de la branche signe');
dit(DEVISE_MAISON === 'mi nyɔ́ ɖɛkpɛ', 'la devise s’écrit en fon, ton compris');

/* ⑥ LA POLICE EMBARQUÉE DANS LES PDF porte le nom de la Maison ET les lettres
   fon. Le pied de page écrit « Maison MND · … la maison veille » dans cette
   seule police (DeviseFon) : jsPDF n'a pas de secours, une lettre absente sort
   en carré vide. Le « D » de MND a justement manqué au sous-ensemble jusqu'au
   24 août — ce test attrape toute régénération qui en reperdrait une. */
const glyphesPdf = ((): Set<number> => {
  const b = Buffer.from(DEVISE_FON_B64, 'base64');
  const u16 = (o: number) => b.readUInt16BE(o);
  const u32 = (o: number) => b.readUInt32BE(o);
  let cmapOff = 0;
  for (let i = 0, n = u16(4); i < n; i++) { const r = 12 + i * 16; if (b.toString('latin1', r, r + 4) === 'cmap') cmapOff = u32(r + 8); }
  let best = 0;
  for (let i = 0, n = u16(cmapOff + 2); i < n; i++) { const off = u32(cmapOff + 4 + i * 8 + 4); if (u16(cmapOff + off) === 4) best = cmapOff + off; }
  const segX2 = u16(best + 6), seg = segX2 / 2;
  const endO = best + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
  const set = new Set<number>();
  for (let s = 0; s < seg; s++) {
    const end = u16(endO + s * 2), start = u16(startO + s * 2), delta = u16(deltaO + s * 2), ro = u16(rangeO + s * 2);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let g: number;
      if (ro === 0) g = (c + delta) & 0xffff;
      else { const gi = rangeO + s * 2 + ro + (c - start) * 2; if (gi + 1 >= b.length) continue; g = u16(gi); if (g) g = (g + delta) & 0xffff; }
      if (g) set.add(c);
    }
  }
  return set;
})();
for (const ch of maisonNom()) dit(ch === ' ' || glyphesPdf.has(ch.codePointAt(0)!), `la police PDF porte « ${ch} » (nom de la Maison)`);
for (const [cp, nom] of [[0x254, 'ɔ'], [0x256, 'ɖ'], [0x25b, 'ɛ'], [0x186, 'Ɔ'], [0x189, 'Ɖ'], [0x190, 'Ɛ'], [0x301, 'accent ◌́'], [0xb7, '·']] as const) {
  dit(glyphesPdf.has(cp), `la police PDF porte « ${nom} »`);
}

/* ⑦ CE QUE LE PDF SAIT TRACER (WinAnsi). Le 24 août, un remplacement en masse
   des tirets de prose a corrompu la liste `WINANSI_EXTRA` en remplaçant le tiret
   cadratin « — » par une virgule : dès lors chaque « — » d'un libellé saisi
   sortait en « ? » sur les pièces. Ce test tient la liste : les caractères
   typographiques usuels d'un libellé DOIVENT survivre à `pdfSafe`, tandis que
   les lettres fon se translittèrent et que la devise garde les siennes. */
dit(pdfSafe('Hermine — Tracé') === 'Hermine — Tracé', 'le tiret cadratin — survit au PDF (pas de « ? »)');
dit(pdfSafe('de 15 – 20') === 'de 15 – 20', 'le tiret demi-cadratin – survit au PDF');
dit(pdfSafe('œuf, cœur, ™, •, …, « oui »') === 'œuf, cœur, ™, •, …, « oui »', 'les extras WinAnsi usuels survivent');
dit(pdfSafe('café à Cotonou') === 'café à Cotonou', 'les accents français survivent');
dit(pdfSafe('KLƆKLƆ™') === 'KLOKLO™', 'les lettres fon se translittèrent hors devise (pdfSafe)');
dit(pdfSafeGardeFon('KLƆKLƆ™').includes('Ɔ'), 'pdfSafeGardeFon garde les lettres fon couvertes');
dit(pdfSafe('a\u{1F600}b') === 'ab', 'un emoji non traçable est retiré, pas rendu en « ? »');

/* ⑧ LE TÉLÉPHONE, INDICATIF ET NUMÉRO. Le champ pose l'indicatif du pays (défaut
   la branche) et n'enregistre pas un indicatif seul, sinon la fiche porterait un
   « +229 » creux. `decoupeTelephone` reconnaît « +590 » (Guadeloupe, hors
   COUNTRIES) avant « +59 ». */
const dq = (v: string, def: string, dial: string, local: string) => {
  const r = decoupeTelephone(v, def);
  dit(r.dial === dial && r.local === local, `« ${v || '∅'} » → ${dial} / « ${local} »`);
};
dq('+229 97 00 00 00', '+229', '+229', '97 00 00 00');
dq('+33 6 12 34 56 78', '+229', '+33', '6 12 34 56 78');
dq('+590 690 00 00', '+229', '+590', '690 00 00');       // Guadeloupe, hors COUNTRIES
dq('', '+229', '+229', '');                               // vide → indicatif de la branche
dq('97000000', '+229', '+229', '97000000');              // sans « + » → local sous l'indicatif défaut
dit(numeroTelReel('+229 ') === '', 'un indicatif seul n’est pas un numéro');
dit(numeroTelReel('+590') === '', '… même Guadeloupe seul');
dit(numeroTelReel('+229 97000000') === '+229 97000000', 'un vrai numéro est conservé');
dit(numeroTelReel('') === '', 'un champ vide reste vide');

/* ⑨ LE JOURNAL DES APPELS. Un appel posé reste « à traiter » tant qu'il n'est
   pas fait ; on ne voit que sa branche ; l'échéance la plus proche remonte, et
   un RDV sans date attend en fin de liste. */
const mkAp = (o: Partial<AppelRecu>): AppelRecu =>
  ({ id: 'x', branchId: 'br', nom: 'N', motif: '', suite: 'rappel', fait: false, at: '2026-08-25T09:00:00Z', ...o });
const acter = appelsAActer([
  mkAp({ id: 'a', quand: '2026-08-27' }),
  mkAp({ id: 'b', quand: '2026-08-25', at: '2026-08-25T08:00:00Z' }),
  mkAp({ id: 'c', fait: true, quand: '2026-08-24' }),
  mkAp({ id: 'd', branchId: 'autre', quand: '2026-08-24' }),
  mkAp({ id: 'e', suite: 'rdv', at: '2026-08-25T07:00:00Z' }),
], 'br').map((a) => a.id);
dit(!acter.includes('c'), 'un appel fait ne remonte pas');
dit(!acter.includes('d'), 'un appel d’une autre branche non plus');
dit(acter[0] === 'b' && acter[1] === 'a', 'l’échéance la plus proche d’abord');
dit(acter[acter.length - 1] === 'e', 'un RDV sans date attend en dernier');

/* ⑩ LE QR DE PAIEMENT DOIT ÊTRE LISIBLE PAR UNE MACHINE (25 août). Premier jet :
   « le QR y est mais ne marche pas ». Trois fautes, qu'on tient ici sur un faux
   document — la zone de silence, la soudure des modules, le noir pur. */
const LIEN = '506846@momopay';
const T = 30;
const traces: { x: number; y: number; w: number; h: number; noir: boolean }[] = [];
let couranteNoire = false;
dessineQrPaiement({
  setFillColor: (r: number, g: number, b: number) => { couranteNoire = r === 0 && g === 0 && b === 0; },
  rect: (x: number, y: number, w: number, h: number) => traces.push({ x, y, w, h, noir: couranteNoire }),
}, LIEN, 0, 0, T);

const fond = traces[0];
const modules = traces.filter((t) => t.noir);
dit(!!fond && !fond.noir && fond.w === T && fond.h === T, 'un fond BLANC couvre toute la boîte du QR');
dit(modules.length > 0, 'les modules du QR sont dessinés');
/* La zone de silence : rien de noir dans les 4 modules du pourtour. */
const cell = modules.length ? Math.min(...modules.map((m) => m.h)) / 1.04 : 0;
const marge = 4 * cell;
dit(cell > 0.7, `un module mesure plus de 0,7 mm (${cell.toFixed(2)} mm)`);
dit(modules.every((m) => m.x >= marge - 0.01 && m.y >= marge - 0.01
  && m.x + m.w <= T - marge + 0.01 && m.y + m.h <= T - marge + 0.05),
'la zone de silence de 4 modules reste vierge');
/* La soudure : des rectangles fusionnés, donc bien moins nombreux que de modules. */
dit(modules.every((m) => m.h > cell), 'les lignes se soudent (débord vertical)');
dit(modules.some((m) => m.w > cell * 1.5), 'les modules voisins fusionnent en un seul rectangle');

/* ⑪ UN QR DE PAIEMENT PORTE L'IDENTIFIANT MARCHAND, JAMAIS UN LIEN WEB.
   Le premier QR imprimé encodait « …/payer.html?… » : l'app MoMo n'en fait rien,
   et c'est pourtant là que la cliente le présente. Le QR de la facture doit
   porter la MÊME valeur que l'affiche MTN du comptoir, celle qui marche. */
dit(estIdentifiantMomo('506846@momopay'), 'un identifiant marchand est un QR de paiement valable');
dit(!estIdentifiantMomo('https://exemple.test/trone/payer.html?montant=75000'), 'un lien web n’en est PAS un');
dit(!estIdentifiantMomo(''), 'le vide non plus');
/* Le montant vit dans le code à composer, pas dans l'identifiant. */
dit(ussdAvecMontant('*880*41*506846*montant#', 75000) === '*880*41*506846*75000#', 'le code à composer porte le montant');
dit(ussdAvecMontant('*880*41*506846*montant#') === '*880*41*506846*montant#', 'sans montant, le modèle reste intact');
dit(ussdAvecMontant('*880*41*506846#', 75000) === '*880*41*506846#', 'on n’invente JAMAIS une syntaxe de paiement');

console.log(echecs === 0 ? 'Tout passe.' : `${echecs} échec(s).`);
if (echecs > 0) process.exit(1);
