/* LE CARNET PLUS INTELLIGENT, ÉPROUVÉ — `node scripts/verifie-le-carnet-intelligent.mjs`.

   25 octobre 2026 : « Make this page more intelligent » (Yéman), maquette
   VJ5PJEGU… vue 8 ; au sélecteur : les quatre parties, le risque sur
   l'historique, l'ancien dû avec « Encaisser l'ancien ». La règle
   (clients/carnet-intelligent-pur.ts) et l'écran (texte). Sortie ASCII. */
import {
  ancienneteDesCreances, anniversaireProche, ceQuiPresse, comprendsLaPhrase, dettesParCliente, gardeSelonLaPhrase, gesteDuRdv,
  historiqueParCliente, plusDeTetes, probable, risqueDAbsence, sansAcompteA48h, signauxDuRdv, tauxDHonneur,
  type ContexteDesSignaux, type RdvLu,
} from '../src/apps/trone/routes/clients/carnet-intelligent-pur';
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

const AUJ = '2026-10-25'; // un dimanche
const r = (o: Partial<RdvLu>): RdvLu => ({ id: 'x', clientId: 'c', date: '2026-10-27', time: '10:00', status: 'confirmé', dureeMin: 120, netXof: 50000, resteXof: 50000, ...o });

/* ── 1. LES CHIFFRES ──────────────────────────────────────────────────── */
dit('l anciennete : 0-7, 8-30, 31-90, plus de 90 jours ; le reste nul ne compte pas', {
  tranches: [{ cle: '7', nom: '0 à 7 jours', n: 1, xof: 10000 }, { cle: '30', nom: '8 à 30 jours', n: 1, xof: 20000 }, { cle: '90', nom: '31 à 90 jours', n: 1, xof: 30000 }, { cle: '+', nom: 'plus de 90 jours', n: 1, xof: 40000 }],
  n: 4, xof: 100000,
}, ancienneteDesCreances([{ date: '2026-10-20', resteXof: 10000 }, { date: '2026-10-01', resteXof: 20000 }, { date: '2026-08-10', resteXof: 30000 }, { date: '2026-05-01', resteXof: 40000 }, { date: '2026-10-24', resteXof: 0 }], AUJ));
dit('7 jours tout juste reste dans la premiere tranche', '7', ancienneteDesCreances([{ date: '2026-10-18', resteXof: 1 }], AUJ).tranches.find((t) => t.n)!.cle);
const histoire = [...Array(9)].map((_, i) => r({ id: `h${i}`, date: '2026-09-0' + (i + 1), status: 'honoré' })).concat([r({ id: 'an', date: '2026-09-20', status: 'annulé' })]);
dit('le taux d honneur sur douze mois : 9 sur 10', { taux: 0.9, honores: 9, annules: 1, peuDHistoire: false }, tauxDHonneur(histoire, AUJ));
dit('sous dix rendez-vous passes : 90 % et on le dit', [0.9, true], (() => { const t = tauxDHonneur(histoire.slice(0, 3), AUJ); return [t.taux, t.peuDHistoire]; })());
dit('le probable : pose x taux, au millier', 1683000, probable(1790000, 0.94));

/* ── 2. LES SIGNAUX ───────────────────────────────────────────────────── */
const rdvs: RdvLu[] = [
  r({ id: 'vieux', clientId: 'bake', date: '2026-09-12', status: 'honoré', resteXof: 24000 }),
  r({ id: 'vieux2', clientId: 'bake', date: '2026-08-01', status: 'honoré', resteXof: 6000 }),
  r({ id: 'annule-vieux', clientId: 'bake', date: '2026-07-01', status: 'annulé', resteXof: 50000 }),
  r({ id: 'futur-bake', clientId: 'bake', date: '2026-10-27', time: '10:00' }),
  r({ id: 'rita', clientId: 'rita', date: '2026-10-27', time: '11:00', depositXof: 18000, depositConfirmed: false, creeLe: '2026-10-26T21:00:00Z' }),
  r({ id: 'm1', clientId: 'manthita', date: '2026-08-01', status: 'annulé' }),
  r({ id: 'm2', clientId: 'manthita', date: '2026-09-01', status: 'annulé' }),
  r({ id: 'm3', clientId: 'manthita', date: '2026-09-15', status: 'honoré', resteXof: 0 }),
  r({ id: 'manthita', clientId: 'manthita', date: '2026-10-29', time: '09:00' }),
];
const dettes = dettesParCliente(rdvs, AUJ);
dit('ce qu elle doit d avant : les rituels rendus non annules qui gardent un reste ; le plus ancien pour le geste', [30000, 2, 'vieux2', false],
  [dettes.get('bake')!.xof, dettes.get('bake')!.n, dettes.get('bake')!.plusAncien.id, dettes.has('rita')]);
const histos = historiqueParCliente(rdvs, AUJ);
dit('le risque : deux annulations sur trois rendez-vous', { risque: true, raisons: ['2 annulations sur 3 rendez-vous'] }, risqueDAbsence(rdvs[8], histos.get('manthita')));
dit('le risque : une premiere venue sans acompte, prise la veille', { risque: true, raisons: ['première venue, sans acompte reçu', 'pris la veille ou le jour même'] }, risqueDAbsence(rdvs[4], histos.get('rita')));
dit('pas de risque : une fidele qui a deja honore, meme prise la veille', false, risqueDAbsence({ date: '2026-10-27', creeLe: '2026-10-26' }, { total: 9, honores: 9, annules: 0 }).risque);
dit('une annulation sur dix ne fait pas un risque', false, risqueDAbsence({ date: '2026-10-27' }, { total: 10, honores: 8, annules: 2 }).risque);
dit('sans acompte a 48 h : demande, pas recu, d ici deux jours seulement', [true, false, false],
  [sansAcompteA48h(rdvs[4], AUJ), sansAcompteA48h({ ...rdvs[4], date: '2026-10-30' }, AUJ), sansAcompteA48h({ ...rdvs[4], depositConfirmed: true }, AUJ)]);
const samedi = [r({ id: 's1', time: '14:00' }), r({ id: 's2', time: '14:00' }), r({ id: 's3', time: '14:30' }), r({ id: 's4', time: '15:00', dureeMin: 60 }), r({ id: 's5', time: '14:00', status: 'annulé' })];
dit('le plus de tetes pendant le rendez-vous, et son heure ; un annule ne compte pas', { tetes: 4, heure: '15:00' }, plusDeTetes(samedi[0], samedi));
dit('l anniversaire dans les sept jours qui suivent, meme a cheval sur l annee', ['30 oct.', '2 janv.', null], [anniversaireProche('2026-10-27', '10-30'), anniversaireProche('2026-12-29', '01-02'), anniversaireProche('2026-10-27', '11-15')]);
const ctx: ContexteDesSignaux = {
  aujourdhui: AUJ, sieges: 3, dettes, historiques: histos,
  duJour: (iso) => (iso === '2026-10-31' ? samedi.map((x) => ({ ...x, date: iso })) : rdvs.filter((x) => x.date === iso)),
  anniversaireDe: (id) => (id === 'rita' ? '10-30' : undefined),
};
dit('les signaux de Bake : doit 30 000 F d avant, avec le calcul', [['dette', 'doit 30 000 F d’avant']],
  signauxDuRdv(rdvs[3], ctx).map((s) => [s.cle, s.dit]));
dit('les signaux de Rita : sans acompte, risque, anniversaire', ['acompte', 'risque', 'anniv'], signauxDuRdv(rdvs[4], ctx).map((s) => s.cle));
dit('au-dela des fauteuils : 4 tetes pour 3', [['chevauche', '4 têtes / 3 fauteuils']],
  signauxDuRdv(r({ id: 's1', date: '2026-10-31', time: '14:00', clientId: 'z', depositConfirmed: true }), ctx).map((s) => [s.cle, s.dit]));
dit('un maitre ne voit pas la dette (l argent se tait)', [], signauxDuRdv(rdvs[3], { ...ctx, sansPrix: true }).map((s) => s.cle));
dit('un rendez-vous passe ne porte pas de signal', [], signauxDuRdv(rdvs[0], ctx));
dit('un seul geste, dans l ordre de ce qui presse', ['Encaisser l’ancien', 'Demander l’acompte', 'Appeler', 'Confirmer', 'Encaisser', null],
  [gesteDuRdv(rdvs[3], signauxDuRdv(rdvs[3], ctx), AUJ)?.dit, gesteDuRdv(rdvs[4], signauxDuRdv(rdvs[4], ctx), AUJ)?.dit, gesteDuRdv(rdvs[8], signauxDuRdv(rdvs[8], ctx), AUJ)?.dit,
    gesteDuRdv(r({ status: 'en attente', clientId: 'q' }), [], AUJ)?.dit, gesteDuRdv(rdvs[0], [], AUJ)?.dit, gesteDuRdv(r({ clientId: 'q' }), [], AUJ)?.dit ?? null]);
dit('ce qui presse : des compteurs et leurs montants', [['acompte', 1, 50000], ['dette', 1, 0], ['risque', 2, 100000], ['chevauche', 0, 0], ['remplir', 7, 0]],
  ceQuiPresse([rdvs[3], rdvs[4], rdvs[8]].map((a) => ({ a, signaux: signauxDuRdv(a, ctx) })), 7).map((x) => [x.cle, x.n, x.xof]));

/* ── 3. LA PHRASE ─────────────────────────────────────────────────────── */
const o = { aujourdhui: AUJ, maitres: ['Team', 'Expert', 'Gérard'] };
const pick = (p: ReturnType<typeof comprendsLaPhrase>) => ({ nom: p.nom, paiement: p.paiement, statut: p.statut, mois: p.mois, du: p.du, au: p.au, maitre: p.maitre, sansAcompte: p.sansAcompte, compris: p.compris });
dit('« impayés de septembre »', { nom: '', paiement: 'impayé', mois: '2026-09', compris: ['Impayés', 'Septembre 2026'] }, JSON.parse(JSON.stringify(pick(comprendsLaPhrase('impayés de septembre', o)))));
dit('« Team samedi » : le maitre et le prochain samedi', { nom: '', du: '2026-10-31', au: '2026-10-31', maitre: 'Team', compris: ['Samedi 31 octobre 2026', 'Maître : Team'] }, JSON.parse(JSON.stringify(pick(comprendsLaPhrase('Team samedi', o)))));
dit('« sans acompte cette semaine » (un dimanche : jusqu au soir)', { nom: '', du: '2026-10-25', au: '2026-10-25', sansAcompte: true, compris: ['Sans acompte', 'Dimanche 25 octobre 2026'] }, JSON.parse(JSON.stringify(pick(comprendsLaPhrase('sans acompte cette semaine', o)))));
dit('« la semaine prochaine »', ['2026-10-26', '2026-11-01'], (() => { const p = comprendsLaPhrase('la semaine prochaine', o); return [p.du, p.au]; })());
dit('« Baké » reste un nom ; « annulés de juillet 2025 » garde son annee', [{ nom: 'bake', compris: ['Cliente : bake'] }, ['annulé', '2025-07']],
  [(() => { const p = comprendsLaPhrase('Baké', o); return { nom: p.nom, compris: p.compris }; })(), (() => { const p = comprendsLaPhrase('annulés de juillet 2025', o); return [p.statut, p.mois]; })()]);
/* « BRICE » EST UN MAÎTRE ET UNE CLIENTE — 25 octobre 2026 : le mot garde les deux. */
const oB = { aujourdhui: AUJ, maitres: ['Team', 'Brice'], clientes: ['Brice', 'Awa Kossou'] };
const pB = comprendsLaPhrase('brice', oB);
const rdvB = (id: string, master: string, nom: string) => ({ ...rdvs[0], id, master, status: 'honoré' as const, date: '2026-10-25', clientId: id, _nom: nom });
const gardesB = [rdvB('b1', 'Team', 'Brice'), rdvB('b2', 'Brice', 'Awa Kossou'), rdvB('b3', 'Team', 'Awa Kossou')]
  .filter((a) => gardeSelonLaPhrase(a, pB, { payeDe: () => 'payé', nomDe: (x) => (x as { _nom: string })._nom, aujourdhui: AUJ })).map((a) => a.id);
dit('« brice » : maitre ET cliente, les rendez-vous des deux, pas les autres', [['Maître ou cliente : Brice'], ['b1', 'b2']], [pB.compris, gardesB]);
dit('... sans cliente de ce nom, le mot reste un maitre', ['Maître : Brice'], comprendsLaPhrase('brice', { ...oB, clientes: ['Awa Kossou'] }).compris);
dit('« en attente demain chez Gérard »', ['en attente', '2026-10-26', 'Gérard'], (() => { const p = comprendsLaPhrase('en attente demain chez Gérard', o); return [p.statut, p.du, p.maitre]; })());
const garde = (q: string, a: RdvLu, paye = 'impayé', nom = 'Baké Gorousso') => gardeSelonLaPhrase(a, comprendsLaPhrase(q, o), { payeDe: () => paye, nomDe: () => nom, aujourdhui: AUJ });
dit('la phrase filtre : impayes de septembre ; un annule n est jamais un impaye', [true, false, false],
  [garde('impayés de septembre', rdvs[0]), garde('impayés de septembre', rdvs[1]), garde('impayés de septembre', r({ date: '2026-09-02', status: 'annulé' }))]);
dit('la phrase filtre : le nom sans accents ni casse', [true, false], [garde('BAKE', rdvs[3]), garde('rita', rdvs[3])]);

/* ── 4. L ECRAN (texte) ───────────────────────────────────────────────── */
const carnet = sansCommentaires('src/apps/trone/routes/clients/Carnet.tsx');
dit('les tuiles disent leur calcul : anciennete, probable, a surveiller', [true, true, true],
  [carnet.includes('ancienneteDesCreances('), carnet.includes('probable(totaux.avenirXof, honneur.taux)'), carnet.includes('À surveiller')]);
dit('ce qui presse : des compteurs qui filtrent la liste', true, /ceQuiPresse\(/.test(carnet) && carnet.includes('setPresse(presse === x.cle ?'));
dit('les jours disent leur charge', true, carnet.includes('chargeDuJour({'));
dit('chaque ligne a ses signaux (calcul en infobulle) et UN geste', [true, true], [carnet.includes('title={s.pourquoi}'), carnet.includes('gesteDuRdv(')]);
dit('« Encaisser l ancien » ouvre l encaissement du plus ancien rituel du', true, carnet.includes("if (g.cle === 'ancien') { const d = signaux.dettes.get(a.clientId); if (d) setPayAppt(appts.find((x) => x.id === d.plusAncien.id) ?? null); }"));
dit('la recherche comprend une phrase et le dit', [true, true], [carnet.includes('comprendsLaPhrase(query,'), carnet.includes('Le Carnet comprend')]);
dit('pas de tiret cadratin dans ce que l ecran dit', false, carnet.includes('—'));
/* LA TUILE « ATTENDU » INTERROGE UN AUTRE JOUR — 26 octobre 2026 : les chiffres ET la liste suivent le jour choisi. */
dit('« Attendu » : le chiffre et la liste suivent le jour choisi, fleches et calendrier', [true, true, true, true, true],
  [carnet.includes('})), jourVu),'), carnet.includes('jour: vivants.filter((a) => a.date === jourVu)'),
    carnet.includes('onClick={() => setJourVu(addDaysISO(jourVu, -1))}'), carnet.includes('onClick={() => setJourVu(addDaysISO(jourVu, 1))}'),
    carnet.includes('<ChampDeDate compact value={jourVu}')]);
dit('... aucun chiffre du jour ne reste fige a aujourd hui', false, /chiffreAttenduDuJour\([\s\S]{0,260}\}\)\), todayISO\(\)\)/.test(carnet));

console.log(`\n${n - ko}/${n} verifications`);
