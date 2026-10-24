/* LES CODES DU MOMENT, ÉPROUVÉS — `node scripts/verifie-les-codes-du-moment.mjs`.

   24 octobre 2026 : « Je ne me retrouve pas facilement dans les QR. Comment
   faciliter l'utilisation, qu'elle soit smart et intelligente » (Yéman), puis
   « il faut avant le RDV son itinéraire » et « le client qui n'a pas encore
   l'appli devrait le lui proposer ». La règle (src/shared/codes-du-moment.ts),
   la page QR codes refaite, le QR montré depuis Encaisser et le moyen KkiaPay.
   Tout est inventé. Sortie ASCII : la console de Windows. */
import {
  codesDuMoment, ordreParUsage, premiereVenueDe, minutesDe, besoinsDeLaCliente, autresCodesDeLaCliente, CODES_DES_CLIENTES,
  CODES_ENVOYABLES, type IdDuCode, type RdvDuMoment,
} from '../src/shared/codes-du-moment';
import { caisseProposee, avecLesMoyensDeLaMaison, familleDuMoyen } from '../src/shared/caisses-des-caissiers-pur';
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
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

/* ── La règle ─────────────────────────────────────────────────────────── */
const JOUR = '2026-10-24';
const TOUS: IdDuCode[] = ['site', 'carte', 'plan', 'wifi', 'momo', 'kkiapay', 'avis', 'couronne', 'academie', 'jour'];
const rdv = (o: Partial<RdvDuMoment>): RdvDuMoment => ({
  id: 'r1', qui: 'A. K.', maitre: 'Gérard', date: JOUR, time: '13:00', dureeMin: 90, status: 'confirmé',
  resteXof: 45000, payeAujourdhui: false, premiereVenue: false, aCouronne: true, ...o,
});
const moment = (rdvs: RdvDuMoment[], hhmm: string, o: { prets?: IdDuCode[]; codeDuJourNe?: boolean; usage?: Record<string, number> } = {}) =>
  codesDuMoment({ aujourdhui: JOUR, minutes: minutesDe(hhmm), rdvs, ouvertureMin: 9 * 60, codeDuJourNe: o.codeDuJourNe ?? true, prets: new Set(o.prets ?? TOUS), usage: o.usage ?? {} });
const sortes = (r: ReturnType<typeof moment>) => r.map((s) => s.sorte);

dit('14 h 20, un rituel de 13 h (1 h 30) se termine et reste a regler : le paiement, avec son reste',
  [{ sorte: 'payer', rdvId: 'r1', qui: 'A. K.', maitre: 'Gérard', resteXof: 45000 }], moment([rdv({})], '14:20'));
dit('14 h, le meme rituel est en cours : le wifi, pas encore le paiement', ['wifi'], sortes(moment([rdv({})], '14:00')));
dit('deux heures apres la fin prevue, le paiement ne se propose plus', [], sortes(moment([rdv({})], '16:31')).filter((s) => s === 'payer'));
dit('un rituel solde ne demande pas de paiement', [], sortes(moment([rdv({ resteXof: 0 })], '14:20')).filter((s) => s === 'payer'));
dit('un rendez-vous annule ne propose rien (habitudes seulement)', ['habitude', 'habitude'], sortes(moment([rdv({ status: 'annulé' })], '14:20')));
dit('premiere venue, soldee aujourd hui, a la fin : l avis Google', ['avis'],
  sortes(moment([rdv({ resteXof: 0, payeAujourdhui: true, premiereVenue: true })], '14:40')));
dit('... pas sans lien d avis, ni si ce n est pas sa premiere venue', [[], []], [
  sortes(moment([rdv({ resteXof: 0, payeAujourdhui: true, premiereVenue: true })], '14:40', { prets: TOUS.filter((c) => c !== 'avis') })).filter((s) => s === 'avis'),
  sortes(moment([rdv({ resteXof: 0, payeAujourdhui: true })], '14:40')).filter((s) => s === 'avis')]);
dit('avant le rendez-vous : l itineraire, premieres venues d abord', ['r3', 'r2'],
  moment([rdv({ id: 'r2', time: '15:00' }), rdv({ id: 'r3', time: '16:00', premiereVenue: true })], '14:20').filter((s) => s.sorte === 'itineraire').map((s) => (s as { rdvId: string }).rdvId));
dit('... pas plus de trois heures avant, et jamais sans lien de plan', [[], []], [
  sortes(moment([rdv({ time: '17:30' })], '14:20')).filter((s) => s === 'itineraire'),
  sortes(moment([rdv({ time: '15:00' })], '14:20', { prets: TOUS.filter((c) => c !== 'plan') })).filter((s) => s === 'itineraire')]);
dit('pendant le rituel, sans compte Ma Couronne : l application a installer', ['couronne'],
  sortes(moment([rdv({ aCouronne: false })], '13:30')).filter((s) => s === 'couronne'));
dit('... avec un compte, rien ; une heure apres la fin, plus rien', [[], []], [
  sortes(moment([rdv({ aCouronne: true })], '13:30')).filter((s) => s === 'couronne'),
  sortes(moment([rdv({ aCouronne: false, resteXof: 0 })], '15:31')).filter((s) => s === 'couronne')]);
dit('la nuit (0 h 11), pas de code du jour en tete', [], sortes(moment([], '00:11', { codeDuJourNe: false })).filter((s) => s === 'code-du-jour'));
dit('le matin, code du jour pas ne : il passe en tete ; ne, ou bien apres 11 h, non', [['code-du-jour'], [], []], [
  sortes(moment([], '08:30', { codeDuJourNe: false })).filter((s) => s === 'code-du-jour'),
  sortes(moment([], '08:30', { codeDuJourNe: true })).filter((s) => s === 'code-du-jour'),
  sortes(moment([], '11:01', { codeDuJourNe: false })).filter((s) => s === 'code-du-jour')]);
dit('l ordre : paiement, avis, code du jour, itineraire, Ma Couronne, wifi ; quatre au plus (le wifi tombe)',
  ['payer', 'payer', 'itineraire', 'couronne'],
  sortes(moment([rdv({ id: 'a' }), rdv({ id: 'b', time: '13:10' }), rdv({ id: 'c', time: '15:00' }), rdv({ id: 'd', time: '14:00', aCouronne: false })], '14:25')));
dit('rien de tout cela : les codes que ce poste montre le plus, deux au plus', [{ sorte: 'habitude', code: 'site' }, { sorte: 'habitude', code: 'plan' }],
  moment([], '17:00', { usage: { plan: 3, site: 5, carte: 1 } }));
dit('... sans habitude : le paiement Mobile Money et le wifi ; sans wifi regle, le paiement seul', [['kkiapay', 'wifi'], ['kkiapay']], [
  moment([], '17:00').map((s) => (s as { code: string }).code),
  moment([], '17:00', { prets: TOUS.filter((c) => c !== 'wifi') }).map((s) => (s as { code: string }).code)]);
dit('les plus montres d abord, a egalite l ordre de la page', ['b', 'c', 'a', 'd'], ordreParUsage(['a', 'b', 'c', 'd'], { b: 4, c: 4, a: 1 }));
dit('premiere venue : aucun rituel honore AVANT aujourd hui', [true, false, true], [
  premiereVenueDe([{ clientId: 'k', status: 'honoré', date: JOUR }], 'k', JOUR),
  premiereVenueDe([{ clientId: 'k', status: 'honoré', date: '2026-09-01' }], 'k', JOUR),
  premiereVenueDe([{ clientId: 'k', status: 'annulé', date: '2026-09-01' }], 'k', JOUR)]);
dit('les heures se lisent : 14:20, 9h05 ; illisible, rien', [860, 545, true], [minutesDe('14:20'), minutesDe('9h05'), Number.isNaN(minutesDe(''))]);

/* ── Le moyen KkiaPay et sa caisse ────────────────────────────────────── */
const sansCaisse = caisseProposee({ methode: 'KkiaPay', aujourdhui: JOUR, dateDuRdv: JOUR, boxes: [], branchId: 'br1' });
dit('payé par le QR Mobile Money : moyen KkiaPay, caisse KkiaPay, qui nait au premier paiement', ['kkiapay', 'KkiaPay', 'cb-kkiapay-br1'],
  [familleDuMoyen('KkiaPay'), sansCaisse.caisse, sansCaisse.aCreer?.id]);
const avecCaisse = caisseProposee({ methode: 'KkiaPay', aujourdhui: JOUR, dateDuRdv: JOUR, branchId: 'br1',
  boxes: [{ id: 'cb-kkiapay-br1', branchId: 'br1', name: 'KkiaPay', sub: '', role: 'terrasse' } as never] });
dit('... deja posee par les paiements en ligne, elle ne se double pas', ['KkiaPay', false], [avecCaisse.caisse, !!avecCaisse.aCreer]);
dit('KkiaPay est dans la liste des moyens, une fois, juste apres MoMo Prive', [1, true], [
  avecLesMoyensDeLaMaison(['MTN MoMo', 'Espèces', 'KkiaPay']).filter((m) => m === 'KkiaPay').length,
  (() => { const l = avecLesMoyensDeLaMaison(['MTN MoMo', 'Espèces']); return l.indexOf('KkiaPay') === l.indexOf('MoMo Privé') + 1; })()]);

/* ── Pour une cliente (24 octobre 2026) ─────────────────────────────────
   « Avoir les codes dont le client a besoin dans le bandeau ; pouvoir choisir
   les clients depuis cet endroit » (Yeman). Attendus ecrits a la main. */
{
  const tous = new Set<IdDuCode>(TOUS);
  const r = (date: string, time: string, status: string, resteXof = 0) => ({ date, time, status, resteXof });
  const sesRdvs = [
    r('2026-10-20', '10:00', 'honoré', 25_000),   // honore, reste du : compte
    r(JOUR, '10:00', 'honoré', 0),                 // venue d'aujourd'hui, soldee
    r('2026-10-28', '10:00', 'confirmé'),          // son prochain rendez-vous
    r('2026-10-10', '09:00', 'confirmé', 45_000),  // jamais honore : une absence, pas une dette
    r('2026-10-22', '15:00', 'annulé', 10_000),    // annule : rien
  ];
  dit('une cliente : son reste (honore seulement), son prochain rendez-vous, Ma Couronne, l avis de la venue du jour', [
    { code: 'kkiapay', raison: 'reste', resteXof: 25_000 }, { code: 'momo', raison: 'reste', resteXof: 25_000 },
    { code: 'plan', raison: 'rendez-vous', date: '2026-10-28', time: '10:00' },
    { code: 'couronne', raison: 'sans-couronne' }, { code: 'avis', raison: 'venue-recente', date: JOUR },
  ], besoinsDeLaCliente({ rdvs: sesRdvs, aCouronne: false, aujourdhui: JOUR, minutes: 14 * 60, prets: tous }));
  dit('le prochain rendez-vous peut etre ce soir ; passe l heure, c est le suivant', [
    [{ code: 'plan', raison: 'rendez-vous', date: JOUR, time: '16:00' }],
    [{ code: 'plan', raison: 'rendez-vous', date: '2026-10-28', time: '10:00' }],
  ], [
    besoinsDeLaCliente({ rdvs: [r(JOUR, '16:00', 'confirmé'), r('2026-10-28', '10:00', 'confirmé')], aCouronne: true, aujourdhui: JOUR, minutes: 14 * 60, prets: tous }),
    besoinsDeLaCliente({ rdvs: [r(JOUR, '13:00', 'confirmé'), r('2026-10-28', '10:00', 'confirmé')], aCouronne: true, aujourdhui: JOUR, minutes: 14 * 60, prets: tous }),
  ]);
  dit('rien qui presse : compte deja la, rien du, derniere venue il y a 30 jours', [],
    besoinsDeLaCliente({ rdvs: [r('2026-09-24', '10:00', 'honoré')], aCouronne: true, aujourdhui: JOUR, minutes: 600, prets: tous }));
  dit('un code qui n est pas pret ne se propose pas (ni MoMoPay ni avis)', ['kkiapay', 'couronne'],
    besoinsDeLaCliente({ rdvs: sesRdvs, aCouronne: false, aujourdhui: JOUR, minutes: 600, prets: new Set<IdDuCode>(['kkiapay', 'couronne']) }).map((x) => x.code));
  dit('ses autres codes : les codes des clientes moins ses besoins, jamais le code du jour', ['wifi', 'site', 'carte', 'couronne', 'avis', 'academie'],
    autresCodesDeLaCliente([{ code: 'kkiapay', raison: 'reste', resteXof: 1 }, { code: 'momo', raison: 'reste', resteXof: 1 }, { code: 'plan', raison: 'rendez-vous', date: JOUR, time: '16:00' }], tous));
  dit('le code du jour n est jamais aux clientes ; le wifi ne s envoie pas', [false, false, false, true],
    [CODES_DES_CLIENTES.includes('jour'), CODES_ENVOYABLES.includes('jour'), CODES_ENVOYABLES.includes('wifi'), CODES_DES_CLIENTES.includes('wifi')]);
}

/* ── La page QR codes ─────────────────────────────────────────────────── */
const page = sansCommentaires('src/apps/trone/routes/clients/QrCodes.tsx');
dit('le bandeau choisit la cliente, et lit ses besoins dans la regle', [true, true],
  [page.includes('<ClientPicker value={clienteId} onChange={setClienteId}'), page.includes('const besoins = cliente ? besoinsDeLaCliente({')]);
dit('l envoi : seulement un code envoyable, signe, WhatsApp sur SON numero (les Conversations refusent hors modele) ; sans numero, copie', [true, true, true, true, false],
  [page.includes('cliente && CODES_ENVOYABLES.includes(id) ? messagePour(id, x) : null'), page.includes('const message = signeLeMessage(brut);'),
    page.includes('const lien = lienWaMe(cliente.phone, message);'), page.includes("if (!lien) { copierTexte(message,"), page.includes('cheminDeLaConversation(cliente.phone')]);
dit('les dates des messages portent l annee, MoMoPay au montant du reste', [true, true],
  [page.includes("const jourDit = (iso: string) => jourEnLettres(iso)"), page.includes('lienPaiementMomo(reste || undefined)')]);
dit('la page lit le moment dans la regle, et range chaque intention par usage', [true, true],
  [page.includes('const suggestions = codesDuMoment({'), page.includes('ordreParUsage(visibles.filter((c) => c.groupe === gr.k).map((c) => c.id), usage)')]);
dit('les habitudes restent sur ce poste (jamais synchronisees)', [true, false],
  [page.includes("createStore<Record<string, number>>('mnd_codes_usage', {})"), /bind(Document|Collection)\(usageDesCodes/.test(page)]);
dit('une seule ligne ouverte, que son nom ET sa fleche referment ; plus de fenetre empilee', [true, false],
  [(page.match(/setOuvertId\(ouverte \? null : c\.id\)/g) ?? []).length === 2, page.includes('<Modal')]);
dit('Ma Couronne se propose a qui n a pas de compte (le compte de la fiche)', true, page.includes('aCouronne: !!ficheDe.get(a.clientId)?.authUserId,'));
dit('l itineraire part par WhatsApp sur SON numero, sans date dans le message', [true, true, false],
  [page.includes('lienWaMe(fiche?.phone, message)'), /pour votre rendez-vous d’aujourd’hui à \$\{heureDite\(a\.time\)\}/.test(page), /const message = [^;]*a\.date/.test(page)]);

/* ── Encaisser ────────────────────────────────────────────────────────── */
const enc = sansCommentaires('src/apps/trone/routes/clients/actions.tsx');
dit('la tuile KkiaPay ecrit le moyen KkiaPay', [true, true],
  [enc.includes("{ id: 'kkiapay', nom: 'KkiaPay', sous: 'QR Chap Chap, tous réseaux' }"), enc.includes("case 'kkiapay': return methods.find((m) => familleDuMoyen(m) === 'kkiapay') ?? MOYEN_KKIAPAY;")]);
dit('le QR montre a la cliente suit le moyen : MoMoPay pour MTN, KkiaPay pour KkiaPay', [true, true, true],
  [enc.includes("(p.tuile === 'momo' || p.tuile === 'kkiapay') && !p.mnd"), /if \(t === 'kkiapay'\) \{ return \{ titre: 'Régler par KkiaPay\.'.*?valeur: LIEN_CHAPCHAP \};/.test(enc), enc.includes('valeur: cfg.momoQr || MOMO_QR_DEFAUT')]);
const comptoir = sansCommentaires('src/apps/trone/routes/clients/AuComptoir.tsx');
dit('le plein ecran passe par-dessus Encaisser, et Echap ne ferme que lui', [true, true, true],
  [comptoir.includes('return createPortal('), comptoir.includes("window.addEventListener('keydown', surTouche, true)"), comptoir.includes('e.stopPropagation(); onClose();')]);

console.log(`\n${n - ko}/${n} epreuves : le bon code, au bon moment.`);
if (ko) console.log(`${ko} ECHEC(S).`);
