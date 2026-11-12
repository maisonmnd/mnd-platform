/* LE CHOIX DU MOYEN, ÉPROUVÉ — `node scripts/verifie-le-choix-du-moyen.mjs`.

   12 novembre 2026, maquette « Le choix du moyen » (DnRyTv95…), « construis ».
   La règle (src/shared/choix-du-moyen-pur.ts) cas par cas, puis ce que la
   fenêtre Encaisser, les deux panneaux et la lecture de la santé en font.
   Numéros et montants inventés. Sortie ASCII : la console de Windows. */
import {
  PANNE_RETENUE_MS, PLAFOND_MTN_XOF, RAILS, RELECTURE_DE_LA_SANTE_MS, autresMoyens, echecSuivant, estUnePanne, etatDuPrestataire,
  heureDite, leChoixDuMoyen, ordreDuComptoir, type ContexteDuChoix, type SanteDesMoyens,
} from '../src/shared/choix-du-moyen-pur';
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

const MTN = '01 97 00 00 12';
const MOOV = '01 95 00 00 40';
const OK = { ouvert: true, repond: true };
const tous = (o: Partial<SanteDesMoyens> = {}): SanteDesMoyens => ({ mtn: OK, fedapay: OK, ...o });
const ch = (o: Partial<ContexteDuChoix> = {}) => leChoixDuMoyen({ voie: 'mobile', telephone: MTN, montantXof: 25_000, sante: tous(), tapGoOuvert: true, ...o });
const PANNE_MTN = { ouvert: true, repond: false, pourquoi: 'MTN ne répond pas depuis 14 h 02', depuis: '14 h 02' };
const FERME_MTN = { ouvert: false, repond: true, pourquoi: 'le règlement par MTN n’est pas encore ouvert (Finances › MTN MoMo)' };
const PANNE_FEDA = { ouvert: true, repond: false, pourquoi: 'FedaPay ne répond pas' };

/* ── L'ordre ──────────────────────────────────────────────────────────── */
dit('l ordre : un numero MTN (ou aucun) commence par MTN ; Moov ou Celtiis par FedaPay ; la carte par le QR FedaPay', [
  ['mtn', 'fedapay', 'tapgo', 'momopay'], ['mtn', 'fedapay', 'tapgo', 'momopay'], ['fedapay', 'tapgo', 'momopay'], ['carteFedapay', 'terminal'],
], [ordreDuComptoir('mobile', MTN), ordreDuComptoir('mobile', ''), ordreDuComptoir('mobile', MOOV), ordreDuComptoir('carte', MTN)]);
dit('MoMoPay et le terminal sont des secours ; MTN, FedaPay, Tap & Go et le QR carte se confirment seuls', [
  [true, true], [true, true, true, true],
], [[!!RAILS.momopay.secours, !!RAILS.terminal.secours], [RAILS.mtn.seConfirmeSeul, RAILS.fedapay.seConfirmeSeul, RAILS.tapgo.seConfirmeSeul, RAILS.carteFedapay.seConfirmeSeul]]);

/* ── Le choix ─────────────────────────────────────────────────────────── */
const a = ch();
dit('tout repond, numero MTN : Payer par MTN, sans frais pour elle, et pas de panne', ['mtn', true, false, false],
  [a.rail, /^Son numéro est chez MTN/.test(a.pourquoi), !!a.panne, a.aLaMain]);
dit('les autres moyens a un toucher : FedaPay, Tap & Go, MoMoPay', ['fedapay', 'tapgo', 'momopay'], autresMoyens(a));
const sansNumero = ch({ telephone: '' });
dit('sans numero sur sa fiche : MTN, et on dit de le taper', ['mtn', true], [sansNumero.rail, /tapez-le/.test(sansNumero.pourquoi)]);
const moov = ch({ telephone: MOOV });
dit('un numero Moov : FedaPay, qui envoie la demande', ['fedapay', true], [moov.rail, /pas chez MTN/.test(moov.pourquoi)]);
const ferme = ch({ sante: tous({ mtn: FERME_MTN }) });
dit('le reglement par MTN est ferme : FedaPay prend sa place, et ce n est PAS une panne (aucune ligne rouge)', ['fedapay', false, true],
  [ferme.rail, !!ferme.panne, /^Payer par MTN n’est pas proposé : le règlement par MTN n’est pas encore ouvert/.test(ferme.pourquoi)]);
const panne = ch({ sante: tous({ mtn: PANNE_MTN }) });
dit('MTN ne repond pas : FedaPay, et la panne se dit en une ligne', ['fedapay', 'MTN ne répond pas depuis 14 h 02. Le Trône le relit chaque minute et le reprend dès qu’il répond.'],
  [panne.rail, panne.panne]);
const deux = ch({ sante: tous({ mtn: PANNE_MTN, fedapay: PANNE_FEDA }) });
dit('MTN et FedaPay en panne : MoMoPay, en secours, qui ne se confirme pas seul (a pointer le soir)', ['momopay', true, false, true],
  [deux.rail, /MTN MoMoPay prend sa place\.$/.test(deux.pourquoi), RAILS.momopay.seConfirmeSeul, /^MTN ne répond pas depuis 14 h 02\. FedaPay ne répond pas\. Le Trône/.test(deux.panne ?? '')]);
dit('... deux pannes : « les relit », au pluriel', true, / Le Trône les relit chaque minute et les reprend dès qu’ils répondent\.$/.test(deux.panne ?? ''));
const HL = { ouvert: true, repond: false, pourquoi: 'le Trône est hors ligne' };
const horsLigne = ch({ sante: tous({ mtn: HL, fedapay: HL }) });
dit('hors ligne : MoMoPay, et une seule ligne qui dit le reseau, pas une panne des prestataires', ['momopay', 'Le Trône est hors ligne : les demandes MTN et FedaPay attendent le retour du réseau.'],
  [horsLigne.rail, horsLigne.panne]);
dit('... MoMoPay ne se propose jamais tant que FedaPay repond', [false, false],
  [ch({ sante: tous({ mtn: PANNE_MTN }) }).rail === 'momopay', ch({ sante: tous({ mtn: FERME_MTN }) }).rail === 'momopay']);
const moovSeul = ch({ telephone: MOOV, sante: tous({ fedapay: PANNE_FEDA }) });
dit('un numero Moov, FedaPay en panne : pas de MoMoPay propose (MTN seulement), mais il reste a un toucher', [null, true, true],
  [moovSeul.rail, /son numéro n’est pas chez MTN/.test(moovSeul.pourquoi), autresMoyens(moovSeul).includes('momopay')]);
dit('Tap & Go eteint : il ne se propose pas', 'Tap & Go n’est pas ouvert',
  ch({ tapGoOuvert: false }).ordre.find((l) => l.rail === 'tapgo')?.hors);
dit('au-dela de 2 000 000 F, la demande MTN ne se propose pas', ['fedapay', 'au-delà de 2 000 000 F'],
  [ch({ montantXof: PLAFOND_MTN_XOF + 1 }).rail, ch({ montantXof: PLAFOND_MTN_XOF + 1 }).ordre[0].hors]);
dit('... a 2 000 000 F pile, si', 'mtn', ch({ montantXof: PLAFOND_MTN_XOF }).rail);
dit('plusieurs parts : MTN regle tout le reste en une fois, il passe la main', ['fedapay', 'MTN règle tout le reste en une seule fois'],
  [ch({ plusieursParts: true }).rail, ch({ plusieursParts: true }).ordre[0].hors]);
dit('FedaPay deja pris par une autre part : ni FedaPay ni Tap & Go, MoMoPay', 'momopay', ch({ plusieursParts: true, fedapayPris: true }).rail);
dit('en devise : aucun moyen mobile (tous en francs)', [null, 4], [ch({ enDevise: true }).rail, ch({ enDevise: true }).ordre.filter((l) => l.hors).length]);
const main = ch({ aLaMain: 'tapgo' });
dit('la caissiere touche Tap & Go : il est pris, et on dit ce que le Trone proposait', ['tapgo', true, 'Choisi à la main. Le Trône proposait Payer par MTN.'],
  [main.rail, main.aLaMain, main.pourquoi]);
const mainEnPanne = ch({ aLaMain: 'fedapay', sante: tous({ fedapay: PANNE_FEDA }) });
dit('un moyen touche a la main qui tombe en panne : la regle reprend la main', ['mtn', false], [mainEnPanne.rail, mainEnPanne.aLaMain]);
dit('toucher le moyen deja propose n est pas « a la main »', false, ch({ aLaMain: 'mtn' }).aLaMain);
const carte = leChoixDuMoyen({ voie: 'carte', montantXof: 25_000, sante: tous(), tapGoOuvert: true });
const carteSans = leChoixDuMoyen({ voie: 'carte', montantXof: 25_000, sante: tous({ fedapay: { ouvert: false, repond: true, pourquoi: 'FedaPay n’est pas allumé (Paramètres › FedaPay)' } }), tapGoOuvert: true });
dit('la carte : le QR FedaPay ; FedaPay eteint, le terminal de la banque, sans ligne de panne', ['carteFedapay', 'terminal', false, true],
  [carte.rail, carteSans.rail, !!carteSans.panne, /FedaPay n’est pas allumé/.test(carteSans.pourquoi)]);
dit('une panne de MTN ne se dit pas sur la tuile Carte (MTN n y est pas)', false,
  !!leChoixDuMoyen({ voie: 'carte', montantXof: 1000, sante: tous({ mtn: PANNE_MTN }), tapGoOuvert: true }).panne);

/* ── Ce que le Trône sait d'un prestataire ────────────────────────────── */
const T = Date.UTC(2026, 10, 12, 13, 2);
const etat = (p: 'mtn' | 'fedapay', o: Partial<Parameters<typeof etatDuPrestataire>[1]> = {}) =>
  etatDuPrestataire(p, { enLigne: true, allume: true, maintenantMs: T, ...o });
dit('l heure de Cotonou : 13 h 02 UTC se dit 14 h 02 ; 23 h 30 UTC, 0 h 30', ['14 h 02', '0 h 30'], [heureDite(T), heureDite(Date.UTC(2026, 10, 12, 23, 30))]);
dit('jamais lu : on fait confiance (la demande dira le reste)', { ouvert: true, repond: true }, etat('mtn'));
dit('hors ligne : rien ne repond', { ouvert: true, repond: false, pourquoi: 'le Trône est hors ligne' }, etat('mtn', { enLigne: false }));
dit('la fonction muette : ne repond pas', [false, 'MTN ne répond pas'], [etat('mtn', { lecture: null }).repond, etat('mtn', { lecture: null }).pourquoi]);
dit('MTN sans ses cles, ou ferme par la direction : pas ouvert, mais pas en panne', [[false, true], [false, true]], [
  [etat('mtn', { lecture: { pret: false, ouvert: true, le: T } }).ouvert, etat('mtn', { lecture: { pret: false, ouvert: true, le: T } }).repond],
  [etat('mtn', { lecture: { pret: true, ouvert: false, le: T } }).ouvert, etat('mtn', { lecture: { pret: true, ouvert: false, le: T } }).repond]]);
dit('FedaPay eteint dans Parametres, ou sans cle : pas ouvert', [false, false],
  [etat('fedapay', { allume: false }).ouvert, etat('fedapay', { lecture: { pret: false, le: T } }).ouvert]);
dit('une demande echouee il y a neuf minutes : en panne depuis son heure ; il y a onze, oubliee', [[false, '14 h 02'], true], [
  [etat('mtn', { echec: { depuis: T, le: T }, maintenantMs: T + 9 * 60_000 }).repond, etat('mtn', { echec: { depuis: T, le: T }, maintenantMs: T + 9 * 60_000 }).depuis],
  etat('mtn', { echec: { depuis: T, le: T }, maintenantMs: T + 11 * 60_000 }).repond]);
dit('une panne qui dure garde son « depuis » ; une nouvelle, apres dix minutes, en prend un neuf', [T, T + 20 * 60_000],
  [echecSuivant({ depuis: T, le: T + 5 * 60_000 }, T + 8 * 60_000).depuis, echecSuivant({ depuis: T, le: T }, T + 20 * 60_000).depuis]);
dit('la panne se retient dix minutes ; la sante se relit chaque minute', [600_000, 60_000], [PANNE_RETENUE_MS, RELECTURE_DE_LA_SANTE_MS]);
dit('une panne : 5xx ou injoignable ; pas un refus (4xx), pas une coupure du poste', [true, true, true, false, false, false], [
  estUnePanne({ status: 502 }), estUnePanne({ status: 0 }), estUnePanne({ code: 'indisponible' }),
  estUnePanne({ status: 400 }), estUnePanne({ status: 409 }), estUnePanne({ status: 503, horsLigne: true })]);

/* ── La fenêtre Encaisser ─────────────────────────────────────────────── */
const enc = sansCommentaires('src/apps/trone/routes/clients/actions.tsx');
dit('six tuiles : Especes, Mobile money, Carte, Cheque, Avoir, Autres ; plus de Payer par MTN, MoMoPay, KkiaPay ni FedaPay en tuile', [true, false, false, false, false],
  [enc.includes("const TUILES_VUES: { id: TuileVue; nom: string; sous: string }[] = [ { id: 'especes', nom: 'Espèces', sous: 'au comptoir' }, { id: 'mobile', nom: 'Mobile money', sous: 'le Trône choisit' }, { id: 'carte', nom: 'Carte', sous: 'QR ou terminal' }, { id: 'cheque', nom: 'Chèque', sous: 'à déposer' }, { id: 'avoir', nom: 'Avoir', sous: 'crédit du compte' }, { id: 'autre', nom: 'Autres', sous: 'les autres moyens' }, ];"),
    /nom: 'Payer par MTN'/.test(enc), /nom: 'MTN MoMoPay'/.test(enc), /nom: 'KkiaPay'/.test(enc), /nom: 'FedaPay'/.test(enc)]);
dit('les tuiles se tirent de la regle, la sante relue fenetre ouverte', [true, true],
  [enc.includes('const sante = useLaSanteDesMoyens(true, mndOn);'), enc.includes('const ch = leChoixDuMoyen({ voie, telephone: telDuChoix,')]);
dit('les parts se jugent dans l ordre : FedaPay pris par une part l est pour les suivantes', true,
  enc.includes("const fedapayPris = tuiles.some((t) => t === 'mndpay')"));
dit('la bascule ne touche jamais une part qui a demande (ni une part payee)', true,
  enc.includes('if (!ch || !ch.rail || p.engage || p.mnd) return p;'));
dit('une part engagee ne change pas de tuile', true, enc.includes('disabled={prise || !!p.mnd || !!p.engage}'));
dit('la ligne du moyen : le moyen, pourquoi, la panne, les autres a un toucher, le retour a la proposition', [true, true, true, true],
  [enc.includes('{ch.panne && ('), enc.includes('<span>{pourquoi}</span>'), enc.includes('onClick={() => prendLeMoyen(p, r)}'), enc.includes('Revenir à la proposition')]);
dit('les deux panneaux disent au Trone : occupe, panne, reussite (et MTN ferme)', [true, true, true, true, true],
  [enc.includes("onPanne={() => signaleUnePanne('mtn')}"), enc.includes('onFerme={signaleMtnFerme}'), enc.includes("onPanne={() => signaleUnePanne('fedapay')}"),
    (enc.match(/onOccupe=\{\(o\) => \{ if \(!!p\.engage !== o\) majPart\(p\.id, \{ engage: o \}\); \}\}/g) ?? []).length === 2, enc.includes("onReussite={() => signaleUneReussite('mtn')}")]);
dit('le panneau FedaPay s ouvre sur le moyen de la regle, ceux de sa tuile seulement', [true, true],
  [enc.includes('moyenDeDepart={p.moyenFeda}'), enc.includes("moyensPermis={p.voie === 'carte' ? MOYENS_FEDAPAY_CARTE : p.voie === 'mobile' ? MOYENS_FEDAPAY_MOBILE : undefined}")]);
dit('une capture lue (argent deja arrive par MTN) : Mobile money, MoMoPay touche a la main', true,
  enc.includes("const mtn = l.moyen === 'mtn' ? { voie: 'mobile' as const, aLaMain: 'momopay' as const } : {};"));
dit('en devise, pas de Mobile money', true, enc.includes("TUILES_VUES.filter((t) => (t.id !== 'mobile' || !fxOn)"));

/* ── Les panneaux et la santé ─────────────────────────────────────────── */
const feda = sansCommentaires('src/apps/trone/routes/vente/MndPay.tsx');
dit('FedaPay : une panne se signale, une demande passee aussi ; le moyen suit la regle tant que rien n est demande', [true, true, true],
  [feda.includes('if (r.panne) p.onPanne?.();'), feda.includes('p.onReussite?.();'), feda.includes('if (p.moyenDeDepart && !demandeId) setMoyen(p.moyenDeDepart);')]);
const client = sansCommentaires('src/shared/mnd-pay.ts');
dit('FedaPay : une erreur 5xx ou une fonction injoignable est une panne, un refus non', [true, true],
  [client.includes("if (nom === 'FunctionsFetchError' || nom === 'FunctionsRelayError') return typeof navigator === 'undefined' || navigator.onLine !== false;"),
    client.includes('...(estUnePanneDeFedaPay(error) ? { panne: true } : {})')]);
const mtn = sansCommentaires('src/apps/trone/routes/clients/PayerParMtnAuTrone.tsx');
dit('MTN : indisponible ou muet est une panne, ferme se dit ferme ; une demande partie retient la part', [true, true, true, true],
  [mtn.includes("const PANNES_MTN = new Set(['indisponible', SANS_SERVEUR]);"), mtn.includes('if (PANNES_MTN.has(code)) onPanne?.();'), mtn.includes("if (code === 'fermee') onFerme?.();"),
    mtn.includes("const occupeLa = etat.k === 'piece' || etat.k === 'envoi' || etat.k === 'attente' || etat.k === 'delai' || etat.k === 'recu';")]);
const sante = sansCommentaires('src/apps/trone/routes/clients/sante-des-moyens.ts');
dit('la sante : les deux fonctions relues sans argent (GET), chaque minute, ecran visible, une lecture a la fois', [true, true, true, true],
  [sante.includes("supabase.functions.invoke(nom, { method: 'GET' })"), sante.includes("if (document.visibilityState === 'visible') void relisLaSante(); }, RELECTURE_DE_LA_SANTE_MS);"),
    sante.includes('if (enCours) return enCours;'), sante.includes("const mtn: LectureDuPrestataire = m ? { pret: m.pret === true, ouvert: m.ouverte === true, le } : null;")]);

console.log(`\n${n - ko}/${n} epreuves : le choix du moyen.`);
if (ko) console.log(`${ko} ECHEC(S).`);
