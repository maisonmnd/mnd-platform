/* LE RELEVE DES COMPTES MTN, EPROUVE · 12 novembre 2026.
   `node scripts/verifie-le-releve-mtn.mjs` (et `--prouve`).
   « Consulter le releve (hier, ce mois, le mois dernier, l'annee...) »
   (Yeman). Personnes et numeros inventes. */
import { readFileSync } from 'node:fs';
import {
  bornesDites, bornesDuReleve, jourACotonou, lireDepuisIso, mouvementsDeLaCollecte, mouvementsDuDecaissement, releveDeLaPeriode, releveEnCsv,
  type CollectePourLeReleve, type EnvoiPourLeReleve,
} from '../src/shared/releve-mtn-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const ms = (iso: string) => Date.parse(iso);
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/* ── 1. Les periodes, a l'heure de Cotonou ── */
/* Le 12 novembre 2026 a 0 h 30 de Cotonou = le 11 a 23 h 30 UTC. */
const nuit = ms('2026-11-11T23:30:00Z');
dit('0 h 30 a Cotonou, c est deja le 12', '2026-11-12', jourACotonou(nuit));
const b = (p: Parameters<typeof bornesDuReleve>[0], l?: { du?: string; au?: string }) => { const x = bornesDuReleve(p, nuit, l); return x ? [x.du, x.au] : null; };
dit('aujourd hui, hier, 7 jours', [['2026-11-12', '2026-11-12'], ['2026-11-11', '2026-11-11'], ['2026-11-06', '2026-11-12']], [b('aujourdhui'), b('hier'), b('sept-jours')]);
dit('ce mois, le mois dernier (31 jours), cette annee, l annee derniere',
  [['2026-11-01', '2026-11-12'], ['2026-10-01', '2026-10-31'], ['2026-01-01', '2026-11-12'], ['2025-01-01', '2025-12-31']],
  [b('ce-mois'), b('mois-dernier'), b('cette-annee'), b('annee-derniere')]);
const janv = ms('2027-01-15T10:00:00Z');
dit('en janvier, le mois dernier est decembre de l an d avant', ['2026-12-01', '2026-12-31'], (() => { const x = bornesDuReleve('mois-dernier', janv); return [x?.du, x?.au]; })());
const mars = ms('2028-03-10T10:00:00Z');
dit('fevrier bissextile : 29 jours', '2028-02-29', bornesDuReleve('mois-dernier', mars)?.au);
dit('une periode libre, et a l envers : rien', [['2026-10-15', '2026-11-02'], null, null], [b('libre', { du: '2026-10-15', au: '2026-11-02' }), b('libre', { du: '2026-11-02', au: '2026-10-15' }), b('libre', { du: '15/10/2026', au: '2026-11-02' })]);
const hier = bornesDuReleve('hier', nuit)!;
dit('un jour de Cotonou : de 23 h UTC la veille a 23 h UTC', [ms('2026-11-10T23:00:00Z'), ms('2026-11-11T23:00:00Z')], [hier.depuisMs, hier.jusquAMs]);
dit('les bornes dites', ['11 nov. 2026', 'du 1er oct. 2026 au 31 oct. 2026'], [bornesDites(hier), bornesDites(bornesDuReleve('mois-dernier', nuit)!)]);
dit('on lit le registre sept jours plus tot', '2026-11-03T23:00:00.000Z', lireDepuisIso(hier));

/* ── 2. Le decaissement ── */
const env = (o: Partial<EnvoiPourLeReleve>): EnvoiPourLeReleve => ({ reference: 'r1', genre: 'paie', nom: 'A. K.', msisdn: '2290190000041', montant_xof: 50000, etat: 'recu', programme_le: '2026-11-05T11:00:00Z', envoye_le: '2026-11-05T17:00:00Z', repondu_le: '2026-11-05T17:00:02Z', transaction_mtn: '1334', ...o });
const envois = [
  env({}),
  env({ reference: 'r2', nom: 'N. M.', montant_xof: 30000, etat: 'refuse', repondu_le: '2026-11-05T17:00:03Z' }),
  env({ reference: 'r3', genre: 'essai', nom: 'Y. B.', montant_xof: 100, programme_le: '2026-11-11T13:41:00Z', envoye_le: '2026-11-11T13:41:01Z', repondu_le: '2026-11-11T13:41:02Z' }),
  env({ reference: 'r4', nom: 'B. A.', montant_xof: 20000, etat: 'annule', repondu_le: null, envoye_le: null }),
  env({ reference: 'r5', nom: 'G. T.', montant_xof: 15000, etat: 'programme', programme_le: '2026-10-20T10:00:00Z', envoye_le: null, repondu_le: null }),
];
const dec = mouvementsDuDecaissement(envois);
dit('le decaissement se date a la reponse de MTN, sinon a l envoi, sinon a la demande', ['2026-11-05T17:00:02Z', '2026-10-20T10:00:00Z'], [dec[0].quand, dec[4].quand]);
dit('aucun frais par l API, nature Paie ou Essai', [[0, 0, 0, 0, 0], 'Paie', 'Essai'], [dec.map((x) => x.fraisXof), dec[0].nature, dec[2].nature]);
const nov = releveDeLaPeriode(dec, bornesDuReleve('ce-mois', nuit)!);
dit('ce mois : seuls les recus comptent ; refuse a part, annule absent', [2, 50100, 1, 0, ['r3', 'r2', 'r1']],
  [nov.recus, nov.totalXof, nov.refuses, nov.enCours, nov.lignes.map((x) => x.reference)]);
dit('par nature : Paie 50 000, Essai 100', [{ nature: 'Paie', nombre: 1, totalXof: 50000 }, { nature: 'Essai', nombre: 1, totalXof: 100 }], nov.parNature);
const oct = releveDeLaPeriode(dec, bornesDuReleve('mois-dernier', nuit)!);
dit('le mois dernier : un envoi programme, en cours, hors total', [0, 0, 1], [oct.recus, oct.totalXof, oct.enCours]);

/* ── 3. La collecte ── */
const col = (o: Partial<CollectePourLeReleve>): CollectePourLeReleve => ({ reference: 'c1', genre: 'reglement', origine: 'lien', msisdn: '2290190000052', montant_xof: 25000, frais_xof: 250, etat: 'recu', demande_le: '2026-11-11T09:00:00Z', repondu_le: '2026-11-11T09:01:00Z', ...o });
const frais = (m: number) => Math.round(m * 0.01);
const mc = mouvementsDeLaCollecte([
  col({}),
  col({ reference: 'c2', origine: 'comptoir', montant_xof: 10000, frais_xof: null }),
  col({ reference: 'c3', genre: 'essai', origine: 'essai', montant_xof: 100, frais_xof: 1 }),
  col({ reference: 'c4', etat: 'refuse', montant_xof: 40000, frais_xof: null }),
  col({ reference: 'c5', etat: 'attente', montant_xof: 5000, repondu_le: null }),
], frais);
dit('la collecte : le frais du registre, sinon la regle ; pas de frais sur un refus', [250, 100, 1, 0, 0], mc.map((x) => x.fraisXof));
dit('qui : le lien, le comptoir, l essai', ['Règlement par le lien', 'Règlement au comptoir', 'Essai de 100 F'], mc.slice(0, 3).map((x) => x.qui));
const rc = releveDeLaPeriode(mc, hier);
dit('hier : 3 recus, 35 100 F encaisses, 351 F de frais, 34 749 F net ; 1 refuse, 1 en cours', [3, 35100, 351, 34749, 1, 1], [rc.recus, rc.totalXof, rc.fraisXof, rc.netXof, rc.refuses, rc.enCours]);
dit('rien aujourd hui', [0, 0, []], (() => { const r = releveDeLaPeriode(mc, bornesDuReleve('aujourdhui', nuit)!); return [r.recus, r.totalXof, r.lignes]; })());

/* ── 4. L export ── */
const csv = releveEnCsv(rc).split('\r\n');
dit('le CSV : une tete, une ligne par mouvement, heure de Cotonou, numero masque', [6, 'Date (Cotonou);Nature;Qui;Montant (F);Frais (F);État;Transaction MTN;Référence;Numéro', true, false],
  [csv.length, csv[0], csv[1].startsWith('2026-11-11 10:01;'), /2290190000052|0190000052/.test(csv.join('\n'))]);
dit('le CSV n ecrit jamais un numero entier', true, csv.slice(1).every((l) => /01 •• •• •• \d\d$/.test(l)));

/* ── 5. Le cablage ── */
const page = lis('src/apps/trone/routes/finances/MtnMoMo.tsx');
const panneau = lis('src/apps/trone/routes/finances/CompteDeCollecteMtn.tsx');
const fn = lis('supabase/functions/paie-mtn/index.ts');
dit('un releve sous chaque compte', [true, true], [page.includes('<ReleveMtn compte="decaissement" />'), panneau.includes('<ReleveMtn compte="collecte" />')]);
dit('le numero de decaissement ecrit comme celui de la collecte, rendu par le serveur', [true, true, true],
  [page.includes("{numero ?? 'numéro à poser'}"), page.includes("<span style={PETIT}>Numéro de décaissement</span>"), fn.includes(', numeros: sortie, numero: numeroDuCompte() });')]);
dit('le numero vient d un secret, jamais du depot ; le GET public ne dit que oui ou non', [true, true, false],
  [fn.includes("env('MOMO_PROD_DISBURSEMENT_NUMERO')"), fn.includes('numero: !!numeroDuCompte() },'), /0?1 ?9\d ?\d\d ?\d\d ?\d\d|2290\d{9}/.test(page + panneau + fn)]);
/* Supabase plafonne a mille lignes : le releve d une annee se lit par pages. */
const vue = lis('src/apps/trone/routes/finances/ReleveMtn.tsx');
dit('le releve lit le registre par pages de mille, jusqu a la derniere', [true, true],
  [vue.includes('.range(p * PAGE, p * PAGE + PAGE - 1)'), vue.includes('    if (!data || data.length < PAGE) break;')]);
dit('la regle reste pure : ni magasin, ni horloge', [false, false], [/createStore|useStore|supabase/.test(lis('src/shared/releve-mtn-pur.ts')), /Date\.now\(\)/.test(lis('src/shared/releve-mtn-pur.ts'))]);

console.log(ko ? `\n${ko} ECHEC.` : '\nLe releve des comptes MTN tient.');
if (ko) process.exitCode = 1;
