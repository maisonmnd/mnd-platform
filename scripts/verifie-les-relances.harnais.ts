/* LES RELANCES DES FACTURES, ÉPROUVÉES — `node scripts/verifie-les-relances.mjs`.

   Maquette « Les relances » validée le 18 octobre 2026 (choix en base
   maquette/relances) : J+1, J+3, J+7, J+14, à 10 h ; toute facture qui reste
   à régler ; les factures du lancement et après, et le rattrapage validé une
   fois ; elle répond, tout s'arrête ; jamais deux relances le même jour à la
   même cliente ; sans PDF, bouton « Régler » ; pause sur la facture ; après
   la dernière, « À appeler » pour la direction.

   On éprouve les règles pures, puis la VRAIE tournée du serveur, extraite
   telle quelle de supabase/functions/relances-factures et rejouée contre une
   base simulée. Les attentes viennent des promesses de la maquette, jamais
   du code éprouvé. */
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import {
  CADENCE_DES_RELANCES, departDesRelances, relanceDuJour, aReponduDepuis, etatDesRelances, aAppeler, idDeLaRelance, seRelance,
  etatDesRelancesDeLaPiece, idDuRappelDuPoint, departDuPoint,
  rythmeDe, rythmeValide, jourDeLaRelance, estUnDimanche, horsDuDimanche, partiesDuCycle, destinataireDeLaRelance, foyersParNumero, formeDuRappel, relanceDeLaPiece, decalageDe,
  CADENCE_DES_FAMILLES,
  type ReglagesRelances, type PieceDeRelance,
} from '../src/shared/relances-pur';
import { invoiceResteXof, type Invoice } from '../src/shared/finance';
import { compteDeLaDemande } from '../src/shared/mnd-pay-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
function extrais(f: string, nom: string): string {
  const src = lis(f);
  const debut = src.indexOf(`// ── DEBUT ${nom}`);
  const fin = src.indexOf(`// ── FIN ${nom}`);
  if (debut < 0 || fin < debut) throw new Error(`${f} : le bloc ${nom} a disparu`);
  return src.slice(debut, fin);
}
const sansPremiere = (t: string) => t.split('\n').slice(1).join('\n');
const SERVEUR = 'supabase/functions/relances-factures/index.ts';

/* ── 1. LES RÈGLES PURES ── */
{
  const r: ReglagesRelances = { actives: true, depuis: '2026-10-18' };
  dit('la cadence de sa décision : J+1, J+3, J+7, J+14', [1, 3, 7, 14], [...CADENCE_DES_RELANCES]);
  const jd = (iso: string) => iso.slice(0, 10);
  const du = (date: string, creeeLe = `${date}T10:00:00Z`) => ({ id: 'a', date, creeeLe });
  dit('le départ : éteintes rien ; du lancement et après, sa date ; d avant, rien ; rattrapée, le jour de la validation ; plus de 30 jours avant, rien',
    [null, '2026-10-20', null, '2026-10-25', null],
    [departDesRelances(du('2026-10-20'), { depuis: '2026-10-18' }, jd), departDesRelances(du('2026-10-20'), r, jd),
      departDesRelances({ ...du('2026-10-10'), id: 'b' }, r, jd),
      departDesRelances({ ...du('2026-10-10'), id: 'b' }, { ...r, rattrapage: { valideLe: '2026-10-25', ids: ['b'] } }, jd),
      departDesRelances({ ...du('2026-09-01'), id: 'c' }, { ...r, rattrapage: { valideLe: '2026-10-25', ids: ['c'] } }, jd)]);
  /* 18 octobre 2026 : « ne pas faire voir mon retard aux clients ». */
  dit('une pièce écrite après son jour (un rattrapage du comptoir) ne se relance pas seule ; sans date d écriture non plus ; prépayée oui ; cochée au rattrapage oui',
    [null, null, '2026-10-25', '2026-10-28'],
    [departDesRelances(du('2026-10-20', '2026-10-22T09:00:00Z'), r, jd), departDesRelances({ id: 'a', date: '2026-10-20' }, r, jd),
      departDesRelances(du('2026-10-25', '2026-10-20T09:00:00Z'), r, jd),
      departDesRelances({ id: 'x', date: '2026-10-01', creeeLe: '2026-10-27T09:00:00Z' }, { ...r, rattrapage: { valideLe: '2026-10-28', ids: ['x'] } }, jd)]);
  const base = { depart: '2026-10-18', parties: 0, aujourdhui: '2026-10-18', resteXof: 2000, enPause: false, aRepondu: false };
  const jour = (j: string, parties: number, derniereLe?: string) => relanceDuJour({ ...base, aujourdhui: j, parties, derniereLe });
  dit('le jour même rien ; J+1 la 1re ; J+2 rien ; J+3 la 2e ; J+7 la 3e ; J+14 la 4e ; puis plus rien (J+7 et J+14 tombent un dimanche : le lundi)', [null, 1, null, 2, 3, 4, null],
    [jour('2026-10-18', 0), jour('2026-10-19', 0), jour('2026-10-20', 1, '2026-10-19'), jour('2026-10-21', 1, '2026-10-19'),
      jour('2026-10-26', 2, '2026-10-21'), jour('2026-11-02', 3, '2026-10-26'), jour('2026-12-01', 4, '2026-11-02')]);
  /* JAMAIS LE DIMANCHE — 29 octobre 2026, « jamais une relance de facture le
     dimanche. Il faut toujours aller le jour suivant » (Yéman). */
  dit('jamais le dimanche : le 25 octobre (J+7) rien, le lundi 26 la 3e ; le 1er novembre (J+14) rien, le lundi 2 la 4e', [null, 3, null, 4],
    [jour('2026-10-25', 2, '2026-10-21'), jour('2026-10-26', 2, '2026-10-21'), jour('2026-11-01', 3, '2026-10-26'), jour('2026-11-02', 3, '2026-10-26')]);
  dit('une relance en retard ne se rattrape pas un dimanche : le lundi', [null, 2],
    [jour('2026-10-25', 1, '2026-10-19'), jour('2026-10-26', 1, '2026-10-19')]);
  dit('le dimanche se reconnaît, et passe au lundi', [true, false, '2026-11-02', '2026-10-31', '2026-10-26'],
    [estUnDimanche('2026-11-01'), estUnDimanche('2026-11-02'), horsDuDimanche('2026-11-01'), horsDuDimanche('2026-10-31'), jourDeLaRelance('2026-10-18', [1, 3, 7, 14], 3)]);
  dit('décalée à un dimanche : elle part le lundi, et les suivantes gardent leurs écarts depuis le dimanche dit', ['2026-11-02', '2026-11-05'],
    [jourDeLaRelance('2026-10-18', [1, 3, 7, 14], 2, { au: '2026-11-01', rang: 2, le: '2026-10-30T10:00:00Z' }),
      jourDeLaRelance('2026-10-18', [1, 3, 7, 14], 3, { au: '2026-11-01', rang: 2, le: '2026-10-30T10:00:00Z' })]);
  dit('jamais deux le même jour : une relance partie aujourd hui ferme la journée, même en retard', [null, 1],
    [jour('2026-10-30', 1, '2026-10-30'), jour('2026-10-30', 0)]);
  dit('payée, en pause, ou elle a répondu : rien', [null, null, null],
    [relanceDuJour({ ...base, aujourdhui: '2026-10-19', resteXof: 0 }), relanceDuJour({ ...base, aujourdhui: '2026-10-19', enPause: true }),
      relanceDuJour({ ...base, aujourdhui: '2026-10-21', parties: 1, aRepondu: true })]);
  dit('elle a répondu : un message entrant après la première relance, pas avant, pas un sortant', [true, false, false, false],
    [aReponduDepuis([{ sens: 'entrant', quand: '2026-10-19T12:00:00Z' }], '2026-10-19T09:00:00Z'),
      aReponduDepuis([{ sens: 'entrant', quand: '2026-10-18T07:52:00Z' }], '2026-10-19T09:00:00Z'),
      aReponduDepuis([{ sens: 'sortant', quand: '2026-10-19T12:00:00Z' }], '2026-10-19T09:00:00Z'),
      aReponduDepuis([{ sens: 'entrant', quand: '2026-10-19T12:00:00Z' }], undefined)]);
  dit('une facture, jamais un devis ni un brouillon', [true, false, false],
    [seRelance({ kind: 'facture', status: 'envoyée' }), seRelance({ kind: 'devis', status: 'envoyée' }), seRelance({ kind: 'facture', status: 'brouillon' })]);
  const jourDe = (iso: string) => iso.slice(0, 10);
  const journal = [
    { id: idDeLaRelance('f1', 1), statut: 'envoyé', quand: '2026-10-19T09:00:00Z' },
    { id: idDeLaRelance('f1', 2), statut: 'échec', quand: '2026-10-21T09:00:00Z' },
  ];
  const e = etatDesRelances({ factureId: 'f1', depart: '2026-10-18', journal, resteXof: 2000, enPause: false, aujourdhui: '2026-10-22', jourDe });
  dit('l écran : un échec ne compte pas, la 2e se retente aujourd hui', { parties: 1, derniereLe: '2026-10-19', prochaine: '2026-10-22', fini: false, total: 4 }, e);
  const quatre = [1, 2, 3, 4].map((n) => ({ id: idDeLaRelance('f2', n), statut: 'envoyé', quand: `2026-11-0${n}T09:00:00Z` }));
  const e4 = etatDesRelances({ factureId: 'f2', depart: '2026-10-18', journal: quatre, resteXof: 2000, enPause: false, aujourdhui: '2026-11-05', jourDe });
  const trois = [1, 2, 3].map((n) => ({ id: idDeLaRelance('f3', n), statut: 'envoyé', quand: `2026-11-0${n}T09:00:00Z` }));
  const e3 = etatDesRelances({ factureId: 'f3', depart: '2026-10-18', journal: trois, resteXof: 2000, enPause: false, aujourdhui: '2026-11-05', jourDe, cadence: [7, 14, 30] });
  dit('au rythme de trois relances : fini après la troisième, et à appeler', [3, true, 3, true], [e3.parties, e3.fini, e3.total, aAppeler(e3, { resteXof: 2000, enPause: false, aujourdhui: '2026-11-05' })]);
  dit('après la quatrième : fini, et à appeler le lendemain, sauf réglée ou en pause', [true, true, false, false, false],
    [e4.fini, aAppeler(e4, { resteXof: 2000, enPause: false, aujourdhui: '2026-11-05' }), aAppeler(e4, { resteXof: 2000, enPause: false, aujourdhui: '2026-11-04' }),
      aAppeler(e4, { resteXof: 0, enPause: false, aujourdhui: '2026-11-05' }), aAppeler(e4, { resteXof: 2000, enPause: true, aujourdhui: '2026-11-05' })]);
}

/* ── 2. LES COPIES DU SERVEUR ── */
{
  dit('le bloc des règles : même texte au Trône et dans relances-factures', true,
    sansPremiere(extrais('src/shared/relances-pur.ts', 'relances')) === sansPremiere(extrais(SERVEUR, 'relances')));
  dit('le bloc du point (ce que le rappel du point couvre) : même texte au Trône et dans relances-factures', true,
    sansPremiere(extrais('src/shared/point-du-compte-pur.ts', 'point')) === sansPremiere(extrais(SERVEUR, 'point')));
}
const charge = (nom: string, rend: string) => {
  const js = transformSync(extrais(SERVEUR, nom).replace(/^export /gm, ''), { loader: 'ts' }).code;
  return new Function(`${js}; return ${rend};`)();
};
const serveur = charge('tournee', '{ tournee, resteDeLaFacture, fraisTapGo, dateDite, enFrancs }') as {
  tournee: (sb: unknown, o: { maintenantMs: number; MODELE: string; MODELE_POINT?: string; WA_TOKEN: string; WA_PHONE_ID: string; envoie?: unknown }) => Promise<Record<string, unknown>>;
  resteDeLaFacture: (f: unknown) => number; fraisTapGo: (b: number, r: unknown) => number; dateDite: (iso: string) => string; enFrancs: (x: number) => string;
};
{
  const ligne = (unitXof: number, discountPct = 0, discountXof?: number) => ({ id: 'l', label: 'x', qty: 1, unitXof, discountPct, ...(discountXof ? { discountXof } : {}) });
  const factures = [
    { lines: [ligne(2000)], globalDiscountPct: 0, status: 'envoyée', payments: [] },
    { lines: [ligne(30000, 10), ligne(5000, 0, 1000)], globalDiscountPct: 5, globalDiscountXof: 500, status: 'envoyée', payments: [{ id: 'p', amountXof: 10000 }] },
    { lines: [ligne(12000)], globalDiscountPct: 0, status: 'payée' },
    { lines: [ligne(12000)], globalDiscountPct: 0, status: 'envoyée' },
    { lines: [ligne(5000)], globalDiscountPct: 0, status: 'envoyée', payments: [{ id: 'p', amountXof: 7000 }] },
  ].map((f, i) => ({ id: `f${i}`, kind: 'facture', date: '2026-10-18', clientId: 'c', number: `N${i}`, ...f }) as unknown as Invoice);
  dit('le reste du serveur est celui du Trône (remises, versements, pièce d avant soldée, trop-perçu)',
    factures.map(invoiceResteXof), factures.map(serveur.resteDeLaFacture));
  const montants = [1, 99, 2000, 10059, 25000, 123457];
  const reglages = [undefined, { tapgo: { tauxPct: 1.6 } }, { tapgo: { tauxPct: 0 } }, { tapgo: { tauxPct: 2.5 } }, { tapgo: { tauxPct: -1 } }];
  dit('les frais Tap & Go du serveur sont ceux de compteDeLaDemande (le total doit être le même pour que le paiement revienne)',
    reglages.flatMap((r) => montants.map((m) => compteDeLaDemande({ montantXof: m, moyen: 'tapgo', reglages: r as never }).fraisXof)),
    reglages.flatMap((r) => montants.map((m) => serveur.fraisTapGo(m, r))));
  dit('la date que la cliente lit porte l année', ['18 octobre 2026', '1 novembre 2026'], [serveur.dateDite('2026-10-18'), serveur.dateDite('2026-11-01')]);
}

/* ── 3. LA VRAIE TOURNÉE, CONTRE UNE BASE SIMULÉE ── */
type Ligne = { id?: string; key?: string; branch_id?: string | null; data: Record<string, unknown> };
function base(tables: Record<string, Ligne[]>) {
  const T = new Map<string, Ligne[]>(Object.entries(tables).map(([k, v]) => [k, structuredClone(v)]));
  const ecrit: { t: string; op: string; id?: string }[] = [];
  const lignes = (t: string) => { if (!T.has(t)) T.set(t, []); return T.get(t)!; };
  const val = (l: Ligne, c: string): string | null | undefined => {
    if (c === 'id') return l.id; if (c === 'key') return l.key;
    if (c.startsWith('data->>')) { const v = l.data?.[c.slice(7)]; return v == null ? null : String(v); }
    return undefined;
  };
  const sb = {
    from(t: string) {
      const requete = () => {
        const filtres: ((l: Ligne) => boolean)[] = [];
        let lim = Infinity; let de = 0; let a = Infinity;
        const q = {
          select() { return q; },
          eq(c: string, v: unknown) { filtres.push((l) => val(l, c) === String(v)); return q; },
          gte(c: string, v: string) { filtres.push((l) => { const x = val(l, c); return x != null && x >= v; }); return q; },
          gt(c: string, v: string) { filtres.push((l) => { const x = val(l, c); return x != null && x > v; }); return q; },
          in(c: string, vs: unknown[]) { const s = new Set(vs.map(String)); filtres.push((l) => s.has(String(val(l, c)))); return q; },
          limit(n: number) { lim = n; return q; },
          range(x: number, y: number) { de = x; a = y; return q; },
          then(ok: (v: unknown) => unknown, ko2?: (e: unknown) => unknown) {
            const rows = lignes(t).filter((l) => filtres.every((f) => f(l))).slice(de, a + 1).slice(0, lim).map((l) => structuredClone(l));
            return Promise.resolve({ data: rows, error: null }).then(ok, ko2);
          },
        };
        return q;
      };
      return {
        select: () => requete(),
        upsert(l: Ligne) { const L = lignes(t); const i = L.findIndex((x) => x.id === l.id); if (i >= 0) L[i] = structuredClone(l); else L.push(structuredClone(l)); ecrit.push({ t, op: 'upsert', id: l.id }); return Promise.resolve({ error: null }); },
        insert(l: Ligne) { lignes(t).push(structuredClone(l)); ecrit.push({ t, op: 'insert', id: l.id }); return Promise.resolve({ error: null }); },
        update(p: Partial<Ligne>) {
          return { eq(c: string, v: unknown) { for (const l of lignes(t)) if (val(l, c) === String(v)) Object.assign(l, structuredClone(p)); ecrit.push({ t, op: 'update', id: String(v) }); return Promise.resolve({ error: null }); } };
        },
      };
    },
  };
  return { sb, T, ecrit, lignes };
}
const MAINTENANT = Date.parse('2026-10-19T09:00:00Z'); // 10 h au salon, J+1 d'une facture du 18
const fiche = (id: string, phone: string, extra: Record<string, unknown> = {}): Ligne => ({ id, data: { name: 'Awa Dossou', civilite: 'madame', phone, ...extra } });
const facture = (id: string, extra: Record<string, unknown> = {}): Ligne => ({
  id, branch_id: 'b1',
  data: { kind: 'facture', status: 'envoyée', date: '2026-10-18', creeeLe: '2026-10-18T11:00:00Z', number: 'MND-2026-0160', branchId: 'b1', clientId: 'c1', clientName: 'Awa Dossou', lines: [{ qty: 1, unitXof: 2000, discountPct: 0 }], globalDiscountPct: 0, payments: [], ...extra },
});
const reglages = (rel: ReglagesRelances | undefined, mndPay: Record<string, unknown> = { actif: true }) => ({ key: 'mnd_settings', data: { relances: rel, mndPay } });
const facteur = (vivant = true, ms = MAINTENANT): Ligne => ({ key: 'mnd_facteur', data: { vuLe: new Date(ms - (vivant ? 60_000 : 3_600_000)).toISOString() } });
const J3 = Date.parse('2026-10-21T09:00:00Z');
const ALLUMEES: ReglagesRelances = { actives: true, depuis: '2026-10-18' };
const joue = async (tables: Record<string, Ligne[]>, o: { maintenantMs?: number; WA?: boolean; envoie?: unknown; point?: string } = {}) => {
  const b = base(tables);
  const r = await serveur.tournee(b.sb, { maintenantMs: o.maintenantMs ?? MAINTENANT, MODELE: 'rappel_de_reglement', ...(o.point ? { MODELE_POINT: o.point } : {}), WA_TOKEN: o.WA ? 't' : '', WA_PHONE_ID: o.WA ? 'p' : '', envoie: o.envoie });
  return { r, ...b };
};
const ordinaire = () => ({ documents: [reglages(ALLUMEES), facteur()], invoices: [facture('inv-1')], clients: [fiche('c1', '0197000012')] });

{
  const A = await joue({ ...ordinaire(), documents: [reglages(undefined), facteur()] });
  dit('éteintes : la tournée ne lit rien de plus et n écrit rien', ['eteintes', 0], [A.r.relances, A.ecrit.length]);
  const B = await joue({ ...ordinaire(), documents: [reglages(ALLUMEES, { actif: false }), facteur()] });
  const B2 = await joue({ ...ordinaire(), documents: [reglages(ALLUMEES, { actif: true, tapgo: { actif: false } }), facteur()] });
  dit('MND PAY ou Tap & Go éteint : le bouton « Régler » ne ferait pas payer, rien ne part', ['tapgo-eteint', 'tapgo-eteint', 0], [B.r.relances, B2.r.relances, B.ecrit.length + B2.ecrit.length]);

  const C = await joue(ordinaire());
  const env = C.lignes('envois');
  const l = env[0]?.data as Record<string, any> | undefined;
  const att = C.lignes('mnd_pay')[0]?.data as Record<string, any> | undefined;
  dit('J+1 : une relance déposée en salle, rang 1, son identifiant, « en-attente », sans rendez-vous à vérifier',
    [1, 1, 'rl-inv-1-1-whatsapp', 'en-attente', 'relance-facture', '', 1], [C.r.relances, env.length, l?.id, l?.statut, l?.type, l?.apptId, l?.rang]);
  dit('le colis : le modèle, son nom d appel, le jour AVEC l année, le reste, et le bouton qui compose code et total',
    ['rappel_de_reglement', ['Mme Awa', '18 octobre 2026', `${(2000).toLocaleString('fr-FR')} F`], '51166-2032'],
    [l?.colis?.modele, l?.colis?.composants?.[0]?.parameters?.map((p: { text: string }) => p.text), l?.colis?.composants?.[1]?.parameters?.[0]?.text]);
  dit('l attente Tap & Go du reste est posée pour cette facture, au même total que le bouton', ['tapgo', 'lien', 'inv-1', 2032, 'en_attente'],
    [att?.moyen, att?.genre, att?.pieceId, att?.totalXof, att?.statut]);
  dit('jamais le numéro de la pièce dans ce que la cliente lit', false, /MND-2026-0160|\d{4}-\d{4}/.test(String(l?.colis?.texteAuFil ?? '') + JSON.stringify(l?.colis?.composants?.[0])));

  /* D. Le cron se réveille une seconde fois le même matin. */
  const D = await joue({ ...ordinaire(), envois: env.map((x) => structuredClone(x)), mnd_pay: C.lignes('mnd_pay').map((x) => structuredClone(x)) });
  dit('une seconde tournée le même jour : rien de plus', [0, 0], [D.r.relances, D.ecrit.filter((x) => x.t === 'envois').length]);

  /* E. J+3, la 1re partie le 19 : la 2e part, l attente au même total est reprise. */
  const E = await joue({ ...ordinaire(), documents: [reglages(ALLUMEES), facteur(true, J3)], envois: env.map((x) => structuredClone(x)), mnd_pay: C.lignes('mnd_pay').map((x) => structuredClone(x)) }, { maintenantMs: J3 });
  dit('J+3 : la 2e relance part, et l attente du même total est reprise (aucune nouvelle)', [1, 'rl-inv-1-2-whatsapp', 0],
    [E.r.relances, E.ecrit.find((x) => x.t === 'envois')?.id, E.ecrit.filter((x) => x.t === 'mnd_pay').length]);

  /* F. Elle a payé par le lien ce matin, aucun Trône ouvert pour l'inscrire. */
  const F = await joue({ ...ordinaire(), mnd_pay: [{ id: 'mp-1', data: { pieceId: 'inv-1', genre: 'lien', moyen: 'tapgo', statut: 'payee', montantXof: 2000, totalXof: 2032 } }] });
  dit('payée par le lien, pas encore inscrite : pas de relance', [0, 0], [F.r.relances, F.ecrit.filter((x) => x.t === 'envois').length]);

  /* G. Elle a écrit à la Maison après la 1re relance. */
  const G = await joue({ ...ordinaire(), documents: [reglages(ALLUMEES), facteur(true, J3)], envois: env.map((x) => structuredClone(x)), messages_wa: [{ id: 'm', data: { numero: '2290197000012', sens: 'entrant', quand: '2026-10-19T15:00:00Z', texte: 'Je passe samedi' } }] },
    { maintenantMs: J3 });
  dit('elle a répondu après la 1re : tout s arrête', [0, 1], [G.r.relances, (G.r.sautes as Record<string, number>)?.['a-repondu']]);

  /* H. Une pause posée au comptoir. */
  const H = await joue({ ...ordinaire(), invoices: [facture('inv-1', { relancesPause: { le: '2026-10-18T18:00:00Z', par: 'Gérard' } })] });
  dit('en pause : rien', 0, H.r.relances);

  /* I. Deux factures de la même cliente, du même jour, sans le modèle du point : UN rappel avec
     l'ancien modèle, leur jour, leur total (son choix au sélecteur, 28 octobre 2026). */
  const I = await joue({ ...ordinaire(), invoices: [facture('inv-1'), facture('inv-2', { number: 'MND-2026-0161' })] });
  const li = I.lignes('envois')[0]?.data as Record<string, any> | undefined;
  dit('deux factures du même jour, une cliente, sans le modèle du point : un seul rappel, l ancien modèle, leur jour, leur total',
    [1, 1, 1, 'rl-pt-c1-2026-10-18-1-whatsapp', 'rappel_de_reglement', ['Mme Awa', '18 octobre 2026', serveur.enFrancs(4000)], ['inv-1', 'inv-2']],
    [I.r.relances, I.r.points, I.lignes('envois').length, I.lignes('envois')[0]?.id, li?.colis?.modele, li?.colis?.composants?.[0]?.parameters?.map((p: { text: string }) => p.text), li?.invoiceIds]);

  /* J. D'avant le lancement : rien, sauf rattrapée (comptée depuis la validation). */
  const vieille = facture('inv-old', { date: '2026-10-05' });
  const J1 = await joue({ ...ordinaire(), invoices: [vieille] });
  const J2 = await joue({ ...ordinaire(), invoices: [vieille], documents: [reglages({ ...ALLUMEES, rattrapage: { valideLe: '2026-10-18', ids: ['inv-old'] } }), facteur()] });
  dit('d avant le lancement : rien ; rattrapée la veille : sa 1re relance aujourd hui', [0, 1, 'rl-inv-old-1-whatsapp'],
    [J1.r.relances, J2.r.relances, J2.lignes('envois')[0]?.id]);

  /* K. Le facteur se tait : on envoie comme les rappels, jamais la nuit. */
  const appels: string[] = [];
  const envoie = async (_u: string, init: { body: string }) => { appels.push(init.body); return { ok: true, json: async () => ({ messages: [{ id: 'wamid.1' }] }) }; };
  const K = await joue({ ...ordinaire(), documents: [reglages(ALLUMEES), facteur(false)] }, { WA: true, envoie });
  const K2 = await joue({ ...ordinaire(), documents: [reglages(ALLUMEES), facteur(false)] }, { WA: true, envoie, maintenantMs: Date.parse('2026-10-19T21:30:00Z') });
  const K3 = await joue({ ...ordinaire(), documents: [reglages(ALLUMEES), facteur(false)] });
  dit('facteur muet : l envoi direct part (modèle, bouton), le journal dit « envoyé », le fil garde le message ; la nuit, rien ; sans clé, rien',
    [1, 1, 'envoyé', 1, 0, 'sans-facteur'],
    [K.r.relances, appels.length, K.lignes('envois')[0]?.data?.statut, K.lignes('messages_wa').length, K2.r.relances, K3.r.relances]);
  dit('l envoi direct porte le modèle et le bouton', ['rappel_de_reglement', 'url', '51166-2032'],
    (() => { const b = JSON.parse(appels[0] ?? '{}'); return [b.template?.name, b.template?.components?.[1]?.sub_type, b.template?.components?.[1]?.parameters?.[0]?.text]; })());

  /* L. Un devis, un brouillon, une facture soldée : rien. */
  const L = await joue({ ...ordinaire(), invoices: [facture('d', { kind: 'devis' }), facture('br', { status: 'brouillon' }), facture('s', { payments: [{ id: 'p', amountXof: 2000 }] })] });
  dit('devis, brouillon, soldée : rien', 0, L.r.relances);

  /* M. La borne : quarante au plus par passage. */
  const nombreuses = Array.from({ length: 45 }, (_, i) => facture(`inv-${i}`, { clientId: `c${i}` }));
  const leurs = Array.from({ length: 45 }, (_, i) => fiche(`c${i}`, `01970000${String(i).padStart(2, '0')}`));
  const M = await joue({ documents: [reglages(ALLUMEES), facteur()], invoices: nombreuses, clients: leurs });
  dit('quarante relances au plus par passage, et la réponse le dit', [40, 40], [M.r.relances, M.r.borne]);

  /* N. Un échec se retente. */
  const N = await joue({ ...ordinaire(), envois: [{ id: 'rl-inv-1-1-whatsapp', data: { id: 'rl-inv-1-1-whatsapp', type: 'relance-facture', statut: 'échec', numero: '2290197000012', quand: '2026-10-19T08:00:00Z' } }] });
  dit('un échec du matin se retente : la 1re repart', [1, 'en-attente'], [N.r.relances, N.lignes('envois').find((x) => x.id === 'rl-inv-1-1-whatsapp')?.data?.statut]);

  /* P. Le rituel du 18 saisi le 19 au matin : la cliente a peut-être payé ce jour-là. */
  const P = await joue({ ...ordinaire(), invoices: [facture('inv-1', { creeeLe: '2026-10-19T07:30:00Z' })] });
  dit('une pièce écrite le lendemain de son rituel ne reçoit pas de relance', [0, 0], [P.r.relances, P.lignes('envois').length]);

  /* O. Le reste a changé : l ancienne attente est annulée, une nouvelle au bon total. */
  const O = await joue({ ...ordinaire(), mnd_pay: [{ id: 'mp-v', data: { pieceId: 'inv-1', genre: 'lien', moyen: 'tapgo', statut: 'en_attente', totalXof: 5080, creeLe: '2026-10-18T10:00:00Z' } }] });
  dit('reste changé : l ancienne attente annulée, une nouvelle au total du bouton', ['annulee', 2032],
    [O.lignes('mnd_pay').find((x) => x.id === 'mp-v')?.data?.statut, O.lignes('mnd_pay').find((x) => x.id !== 'mp-v')?.data?.totalXof]);
}

/* ── 3 bis. UN SEUL RAPPEL PAR PAYEUR (28 octobre 2026, le point du compte) ──
   Seulement quand le modèle du rappel du point est nommé ; sinon, facture par
   facture, comme avant (« deux factures, une cliente : une seule relance
   aujourd hui », plus haut). */
{
  const POINT = 'rappel_du_point';
  const deux = () => ({ ...ordinaire(), invoices: [facture('inv-1'), facture('inv-2', { number: 'MND-2026-0161' })] });
  const Q = await joue(deux(), { point: POINT });
  const env = Q.lignes('envois');
  const l = env[0]?.data as Record<string, any> | undefined;
  dit('deux factures, une payeuse, le modèle nommé : UN rappel (un seul dossier en lice), son identifiant de point, ses deux factures, aucune attente Tap & Go',
    [1, 1, 1, 'rl-pt-c1-2026-10-18-1-whatsapp', true, ['inv-1', 'inv-2'], '', 1, 0],
    [Q.r.relances, Q.r.points, Q.r.enLice, env[0]?.id, l?.point, l?.invoiceIds, l?.invoiceId, env.length, Q.ecrit.filter((x) => x.t === 'mnd_pay').length]);
  const total = 4000 + serveur.fraisTapGo(4000, { actif: true });
  dit('le rappel du point : son modèle, l appel, le total, ce qu il couvre avec l année, et le bouton au total frais compris',
    [POINT, ['Mme Awa', serveur.enFrancs(4000), 'vos 2 factures, du 18 octobre 2026'], `51166-${total}`],
    [l?.colis?.modele, l?.colis?.composants?.[0]?.parameters?.map((p: { text: string }) => p.text), l?.colis?.composants?.[1]?.parameters?.[0]?.text]);
  dit('jamais le numéro d une pièce dans le rappel du point', false, /MND-2026-016[01]/.test(String(l?.colis?.texteAuFil ?? '') + JSON.stringify(l?.colis?.composants)));

  const R = await joue({ ...deux(), documents: [reglages(ALLUMEES), facteur(true, J3)], envois: env.map((x) => structuredClone(x)) }, { point: POINT, maintenantMs: J3 });
  dit('J+3 : le 2e rappel du point, au même identifiant de point', [1, 'rl-pt-c1-2026-10-18-2-whatsapp'],
    [R.r.relances, R.lignes('envois').find((x) => x.id !== env[0]?.id)?.id]);

  const S = await joue({ ...deux(), mnd_pay: [{ id: 'mp-2', data: { pieceId: 'inv-2', genre: 'lien', moyen: 'tapgo', statut: 'payee', montantXof: 2000, totalXof: 2032 } }] }, { point: POINT });
  dit('l une payée par son lien : il n en reste qu une, elle repart seule, comme avant', [1, 0, 'rl-inv-1-1-whatsapp'],
    [S.r.relances, S.r.points, S.lignes('envois')[0]?.id]);
  const V = await joue({ ...deux(), mnd_pay: [{ id: 'mp-1', data: { pieceId: 'inv-1', genre: 'lien', moyen: 'tapgo', statut: 'payee', montantXof: 1000, totalXof: 1016 } }] }, { point: POINT });
  dit('l une payée en partie par son lien : le point réclame le reste des deux, payé compté une seule fois', [1, serveur.enFrancs(3000)],
    [V.r.points, (V.lignes('envois')[0]?.data as Record<string, any>)?.colis?.composants?.[0]?.parameters?.[1]?.text]);

  const famille = {
    documents: [reglages(ALLUMEES), facteur()],
    invoices: [facture('e-1', { clientId: 'enfant', apptId: 'r1' }), facture('e-2', { clientId: 'enfant', apptId: 'r2', number: 'MND-2026-0162' })],
    clients: [fiche('enfant', '', { familyId: 'fa', name: 'Merline D.' }), fiche('pere', '0190000001', { name: 'Paul D.', civilite: 'monsieur' })],
    families: [{ id: 'fa', data: { name: 'Famille D.', payerClientId: 'pere' } }],
  };
  /* Un compte famille suit son rythme (J+7, J+14, J+30 d'origine) : rien à J+1, le rappel à J+7. */
  const J7 = Date.parse('2026-10-26T09:00:00Z'); // J+7 tombe le dimanche 25 : le lundi 26
  const famille7 = { ...famille, documents: [reglages(ALLUMEES), facteur(true, J7)] };
  const T1 = await joue(famille, { point: POINT });
  const T = await joue(famille7, { point: POINT, maintenantMs: J7 });
  const lt = T.lignes('envois')[0]?.data as Record<string, any> | undefined;
  const TD = await joue({ ...famille, documents: [reglages(ALLUMEES), facteur(true, Date.parse('2026-10-25T09:00:00Z'))] }, { point: POINT, maintenantMs: Date.parse('2026-10-25T09:00:00Z') });
  dit('le dimanche 25 octobre, la tournée ne relance rien et ne dépose rien', ['dimanche', 0], [TD.r.relances, TD.lignes('envois').length]);
  dit('les factures d une enfant sans numéro : le rappel va au payeur du compte famille, à son rythme (rien à J+1, J+7 le lundi), et dit « rituels »',
    [0, 1, 'rl-pt-pere-2026-10-18-1-whatsapp', '2290190000001', 'M. Paul', 'vos 2 rituels, du 18 octobre 2026'],
    [T1.r.relances, T.r.relances, T.lignes('envois')[0]?.id, lt?.numero, lt?.colis?.composants?.[0]?.parameters?.[0]?.text, lt?.colis?.composants?.[0]?.parameters?.[2]?.text]);
  const T0 = await joue(famille7, { maintenantMs: J7 });
  const lt0 = T0.lignes('envois')[0]?.data as Record<string, any> | undefined;
  dit('... sans le modèle du point, le même jour : au payeur quand même, l ancien modèle au total (28 octobre 2026)',
    [1, 'rl-pt-pere-2026-10-18-1-whatsapp', 'rappel_de_reglement', ['M. Paul', '18 octobre 2026', serveur.enFrancs(4000)]],
    [T0.r.relances, T0.lignes('envois')[0]?.id, lt0?.colis?.modele, lt0?.colis?.composants?.[0]?.parameters?.map((p: { text: string }) => p.text)]);

  const U = await joue({ ...deux(), invoices: [facture('inv-1'), facture('inv-3', { date: '2026-10-20', creeeLe: '2026-10-20T11:00:00Z', number: 'MND-2026-0163' })],
    documents: [reglages(ALLUMEES), facteur(true, Date.parse('2026-10-21T09:00:00Z'))] }, { point: POINT, maintenantMs: Date.parse('2026-10-21T09:00:00Z') });
  dit('une nouvelle visite relance le cycle : le point se compte depuis la plus récente (J+1 du 20)', [1, 'rl-pt-c1-2026-10-20-1-whatsapp', 'vos 2 factures, du 18 au 20 octobre 2026'],
    [U.r.relances, U.lignes('envois')[0]?.id, (U.lignes('envois')[0]?.data as Record<string, any>)?.colis?.composants?.[0]?.parameters?.[2]?.text]);
}

/* ── 3 ter. LE TRÔNE LIT LE RAPPEL DU POINT ── */
{
  const jd = (iso: string) => iso.slice(0, 10);
  const journalPt = [
    /* Un point d'avant, fini, qui portait déjà inv-2 : le plus récent fait foi. */
    ...[1, 2, 3, 4].map((n) => ({ id: idDuRappelDuPoint('c1', '2026-10-01', n), statut: 'envoyé', quand: `2026-10-0${n + 1}T09:10:00Z`, invoiceIds: ['inv-0', 'inv-2'] })),
    { id: idDuRappelDuPoint('c1', '2026-10-18', 1), statut: 'envoyé', quand: '2026-10-19T09:10:00Z', invoiceIds: ['inv-1', 'inv-2'] },
    { id: idDuRappelDuPoint('c1', '2026-10-18', 2), statut: 'envoyé', quand: '2026-10-21T09:10:00Z', invoiceIds: ['inv-1', 'inv-2'] },
  ];
  const sur = (factureId: string) => etatDesRelancesDeLaPiece({ factureId, depart: '2026-10-18', journal: journalPt, resteXof: 2000, enPause: false, aujourdhui: '2026-10-22', jourDe: jd });
  dit('au Trône, la facture lit le rappel du point qui la porte : 2 parties, la prochaine à J+7 (dimanche 25 : lundi 26), marquée « point »',
    { parties: 2, derniereLe: '2026-10-21', prochaine: '2026-10-26', fini: false, total: 4, point: true }, sur('inv-2'));
  dit('... une facture qu aucun point ne porte garde sa suite à elle ; le départ du point est celui de la plus récente', [undefined, 0, '2026-10-20', null],
    [sur('autre').point, sur('autre').parties, departDuPoint(['2026-10-18', null, '2026-10-20']), departDuPoint([null])]);
}

/* ── 3 quater. AU PARENT, UN RYTHME PAR TYPE, LE DÉCALAGE — 28 octobre 2026 ──
   « Ce message ne devait pas partir. Les messages de relance doivent partir au
   parent : bonjour M. Ranti, pas M. Aloys, et pour Nathael aussi : un total de
   2 factures, pas une facture individuelle » (Yéman, devant le rappel parti à
   l'enfant). Ses choix au sélecteur : sans le modèle du point, les factures du
   même jour en un rappel avec l'ancien modèle, des jours différents attendent ;
   un rythme pour la cliente seule, un pour le compte famille (J+7, J+14,
   J+30) ; « Décaler la prochaine relance » sur la facture. */
{
  const jd = (iso: string) => iso.slice(0, 10);
  dit('le rythme : d origine J+1, 3, 7, 14 et J+7, 14, 30 ; le sien s il est sain ; malformé, celui d origine', [
    [1, 3, 7, 14], [7, 14, 30], [2, 5], [7, 14, 30], [1, 3, 7, 14], null, null, null,
  ], [
    rythmeDe(undefined, false), rythmeDe(undefined, true), rythmeDe({ rythmes: { seule: [2, 5] } }, false),
    rythmeDe({ rythmes: { famille: [5, 3] } }, true), rythmeDe({ rythmes: { seule: [] } }, false),
    rythmeValide([1, 1]), rythmeValide([1, 2, 3, 4, 5, 6, 7]), rythmeValide([3, 120]),
  ]);
  const dec = { au: '2026-11-05', rang: 2, le: '2026-10-30T10:00:00Z' };
  dit('le décalage : la relance de son rang part à son jour, les suivantes gardent leurs écarts, celles d avant ne bougent pas', [
    '2026-10-19', '2026-11-05', '2026-11-09', '2026-11-16', null,
  ], [
    jourDeLaRelance('2026-10-18', [1, 3, 7, 14], 1, dec), jourDeLaRelance('2026-10-18', [1, 3, 7, 14], 2, dec),
    jourDeLaRelance('2026-10-18', [1, 3, 7, 14], 3, dec), jourDeLaRelance('2026-10-18', [1, 3, 7, 14], 4, dec),
    jourDeLaRelance('2026-10-18', [1, 3, 7, 14], 5, dec),
  ]);
  const base2 = { depart: '2026-10-18', parties: 1, derniereLe: '2026-10-19', resteXof: 2000, enPause: false, aRepondu: false };
  dit('décalée au 5 novembre : rien le 21 (son J+3), la 2e le 5 ; au rythme des familles, la 1re à J+7 seulement (le lundi 26, J+7 étant un dimanche)', [null, 2, null, null, 1],
    [relanceDuJour({ ...base2, aujourdhui: '2026-10-21', decalage: dec }), relanceDuJour({ ...base2, aujourdhui: '2026-11-05', decalage: dec }),
      relanceDuJour({ ...base2, parties: 0, derniereLe: undefined, aujourdhui: '2026-10-24', cadence: [...CADENCE_DES_FAMILLES] }),
      relanceDuJour({ ...base2, parties: 0, derniereLe: undefined, aujourdhui: '2026-10-25', cadence: [...CADENCE_DES_FAMILLES] }),
      relanceDuJour({ ...base2, parties: 0, derniereLe: undefined, aujourdhui: '2026-10-26', cadence: [...CADENCE_DES_FAMILLES] })]);
  dit('le décalage d un rappel groupé : le plus récent posé sur l une de ses factures', '2026-11-09',
    decalageDe([{ relancesDecalage: dec }, {}, { relancesDecalage: { au: '2026-11-09', rang: 1, le: '2026-10-31T08:00:00Z' } }])?.au);

  const journalDuCycle = [
    { id: 'rl-a-1-whatsapp', statut: 'envoyé', quand: '2026-10-19T09:10:00Z', numero: '2290190000001' },
    { id: 'rl-pt-p-2026-10-18-2-whatsapp', statut: 'envoyé', quand: '2026-10-21T09:10:00Z', numero: '2290190000001', invoiceIds: ['a', 'b'] },
    { id: 'rl-b-1-whatsapp', statut: 'échec', quand: '2026-10-19T09:10:00Z', numero: '2290190000001' },
    { id: 'rl-b-2-whatsapp', statut: 'envoyé', quand: '2026-10-20T09:10:00Z', numero: '33608152805' },
    { id: 'rl-a-3-whatsapp', statut: 'envoyé', quand: '2026-10-10T09:10:00Z', numero: '2290190000001' },
    { id: 'rl-c-1-whatsapp', statut: 'envoyé', quand: '2026-10-19T09:10:00Z', numero: '2290190000001' },
  ];
  dit('la suite d un cycle : ses lignes à elles et les rappels groupés qui la portent, à ce numéro, depuis son départ ; ni un échec, ni un autre numéro, ni d avant, ni une autre facture',
    { parties: 2, derniereLe: '2026-10-21', premiereQuand: '2026-10-19T09:10:00Z' },
    partiesDuCycle({ factureIds: ['a', 'b'], depart: '2026-10-18', journal: journalDuCycle, jourDe: jd, numero: '+229 01 90 00 00 01' }));
  dit('... la facture seule, après le rappel groupé : la suite continue (2 parties), elle ne recommence pas', 2,
    partiesDuCycle({ factureIds: ['a'], depart: '2026-10-18', journal: journalDuCycle, jourDe: jd, numero: '2290190000001' }).parties);

  const fichesA = [
    { id: 'pere', name: 'Ranti Shegun Akindes', phone: '+229 0199774949', familyId: 'fam' },
    { id: 'nath', name: 'Nathael Akindes', phone: '+33608152805', familyId: 'fam' },
    { id: 'aloys', name: 'Aloys Akindes', phone: '+33608152805' },
    { id: 'seule', name: 'Awa Dossou', phone: '0197000012' },
    { id: 'x1', phone: '0190000077', familyId: 'f1' }, { id: 'x2', phone: '0190000077', familyId: 'f2' }, { id: 'x3', phone: '0190000077' },
  ];
  const parId = new Map(fichesA.map((f) => [f.id, f]));
  const payeurs = new Map([['fam', 'pere'], ['f1', 'x1'], ['f2', 'x2']]);
  const parNum = foyersParNumero(fichesA);
  const qui = (ids: string[]) => { const d = destinataireDeLaRelance(ids, parId, payeurs, parNum); return [d.fiche?.id, d.famille]; };
  dit('à qui : l enfant du compte, au payeur ; l enfant hors du compte mais au numéro de son frère, au payeur ; la cliente seule, à elle ; un numéro de deux comptes, à personne d autre',
    [['pere', true], ['pere', true], ['seule', false], ['x3', false], ['pere', true]],
    [qui(['nath', 'nath']), qui(['aloys', 'aloys']), qui(['seule', 'seule']), qui(['x3', 'x3']), qui(['pere', 'pere'])]);
  dit('la forme du rappel groupé : le modèle du point toujours ; sans lui, le même jour avec l ancien, sinon il attend',
    ['point', 'jour', 'attend'], [formeDuRappel(['2026-10-18', '2026-10-20'], true), formeDuRappel(['2026-10-27', '2026-10-27'], false), formeDuRappel(['2026-10-18', '2026-10-20'], false)]);
}
{
  /* LA FAMILLE A., EN VRAI : Aloys (6 000 F) hors du compte, au numéro de Nathael (34 000 F), dans le
     compte de M. Ranti ; la relance d'Aloys partie le 28 octobre 2026 au +33. */
  const ALLUME_18: ReglagesRelances = { actives: true, depuis: '2026-10-18' };
  const fichesFamille: Ligne[] = [
    { id: 'MND-UUGM', data: { name: 'Ranti Shegun Akindes', phone: '+229 0199774949', auMasculin: true, familyId: 'fam-a' } },
    { id: 'MND-ZQ5R', data: { name: 'Nathael Akindes', phone: '+33608152805', familyId: 'fam-a' } },
    { id: 'MND-ALOY', data: { name: 'Aloys Akindes', phone: '+33608152805', auMasculin: true } },
  ];
  const fA = (id: string, client: string, xof: number) => facture(id, { clientId: client, clientName: client, date: '2026-10-27', creeeLe: '2026-10-27T15:00:00Z', apptId: `r-${id}`, number: `MND-2026-${id}`, lines: [{ qty: 1, unitXof: xof, discountPct: 0 }] });
  const partieA: Ligne = { id: 'rl-i162-1-whatsapp', data: { id: 'rl-i162-1-whatsapp', type: 'relance-facture', statut: 'envoyé', numero: '33608152805', quand: '2026-10-28T09:10:00Z', invoiceId: 'i162' } };
  const akindes = (ms: number) => ({
    documents: [reglages(ALLUME_18), facteur(true, ms)], clients: fichesFamille,
    families: [{ id: 'fam-a', data: { name: 'Famille Akindes', payerClientId: 'MND-UUGM' } }],
    invoices: [fA('i162', 'MND-ALOY', 6000), fA('i163', 'MND-ZQ5R', 34000)], envois: [partieA],
  });
  const LE_29 = Date.parse('2026-10-29T09:00:00Z');
  const LE_3 = Date.parse('2026-11-03T09:00:00Z');
  const A29 = await joue(akindes(LE_29), { maintenantMs: LE_29 });
  dit('famille A., le 29 octobre 2026 : plus rien à l enfant ni au +33, et rien au parent avant son J+7', [0, 1],
    [A29.r.relances, A29.lignes('envois').length]);
  const A3 = await joue(akindes(LE_3), { maintenantMs: LE_3 });
  const l3 = A3.lignes('envois').find((x) => x.id !== partieA.id)?.data as Record<string, any> | undefined;
  dit('famille A., le 3 novembre 2026 (J+7) : UN rappel, à M. Ranti, à son numéro, les 2 factures au total, l ancien modèle, jamais le numéro d une pièce',
    [1, 'rl-pt-MND-UUGM-2026-10-27-1-whatsapp', '2290199774949', 'rappel_de_reglement', ['M. Ranti', '27 octobre 2026', serveur.enFrancs(40000)], ['i162', 'i163'], true, false],
    [A3.r.relances, l3?.id, l3?.numero, l3?.colis?.modele, l3?.colis?.composants?.[0]?.parameters?.map((p: { text: string }) => p.text), l3?.invoiceIds,
      String(l3?.colis?.texteAuFil ?? '').startsWith('Bonjour M. Ranti, un petit rappel de la Maison MND : votre facture du 27 octobre 2026 attend encore son règlement, reste 40'),
      /MND-2026-i16/.test(String(l3?.colis?.texteAuFil ?? ''))]);
  const AP = await joue(akindes(LE_3), { maintenantMs: LE_3, point: 'rappel_du_point' });
  dit('... avec le modèle du point : « vos 2 rituels, du 27 octobre 2026 »', ['rappel_du_point', 'vos 2 rituels, du 27 octobre 2026'],
    (() => { const l = AP.lignes('envois').find((x) => x.id !== partieA.id)?.data as Record<string, any> | undefined; return [l?.colis?.modele, l?.colis?.composants?.[0]?.parameters?.[2]?.text]; })());

  /* Le Trône dit la même chose que la tournée. */
  const pieces = akindes(LE_3).invoices.map((l) => ({ ...(l.data as object), id: l.id }) as PieceDeRelance & { lines: unknown[] });
  const rel = relanceDeLaPiece({
    piece: pieces[1], pieces, fiches: fichesFamille.map((l) => ({ ...(l.data as object), id: l.id as string })),
    familles: [{ id: 'fam-a', payerClientId: 'MND-UUGM' }], reglages: ALLUME_18, journal: [partieA].map((l) => ({ ...(l.data as object), id: l.id as string })),
    aujourdhui: '2026-10-29', jourDe: (iso: string) => iso.slice(0, 10), resteDe: (p) => serveur.resteDeLaFacture(p),
  });
  dit('au Trône, la facture de Nathael dit : un rappel pour les 2, à M. Ranti, rythme des familles, aucune partie (le +33 ne compte pas), prochaine le 3 novembre 2026',
    ['jour', 2, 'MND-UUGM', true, [7, 14, 30], 40000, 0, '2026-11-03'],
    [rel?.forme, rel?.membres.length, rel?.destinataire?.id, rel?.famille, rel?.cadence, rel?.resteXof, rel?.etat.parties, rel?.etat.prochaine]);

  /* Une pause sur l'une (la seconde lue), et le rappel groupé se tait ; un décalage sur l'une le repousse. */
  const enPause = akindes(LE_3); (enPause.invoices[1].data as Record<string, unknown>).relancesPause = { le: '2026-10-30T10:00:00Z', par: 'Gérard' };
  const AQ = await joue(enPause, { maintenantMs: LE_3 });
  dit('une seule en pause : le rappel groupé se tait', [0, 1], [AQ.r.relances, (AQ.r.sautes as Record<string, number>)?.['en-pause']]);
  const decale = akindes(LE_3); (decale.invoices[1].data as Record<string, unknown>).relancesDecalage = { au: '2026-11-06', rang: 1, le: '2026-10-30T10:00:00Z' };
  const AD = await joue(decale, { maintenantMs: LE_3 });
  const LE_6 = Date.parse('2026-11-06T09:00:00Z');
  const AD6 = await joue({ ...decale, documents: [reglages(ALLUME_18), facteur(true, LE_6)] }, { maintenantMs: LE_6 });
  dit('décalée au 6 novembre 2026 : rien le 3, le rappel le 6', [0, 1], [AD.r.relances, AD6.r.relances]);
  /* La relance de la seconde facture, déjà partie au payeur, compte pour tout le rappel groupé. */
  const LE_4 = Date.parse('2026-11-04T09:00:00Z');
  const dejaAuPayeur = { ...akindes(LE_4), envois: [partieA, { id: 'rl-i163-1-whatsapp', data: { id: 'rl-i163-1-whatsapp', type: 'relance-facture', statut: 'envoyé', numero: '2290199774949', quand: '2026-11-03T09:10:00Z' } }] };
  const A4 = await joue(dejaAuPayeur, { maintenantMs: LE_4 });
  dit('la 1re déjà partie au payeur pour la seconde facture : le lendemain, rien (la suivante à J+14)', 0, A4.r.relances);
}
{
  /* Des jours différents, sans le modèle du point : il attend ; et un payeur dont les relances étaient
     faites une à une ne reçoit pas quatre messages de suite en entrant dans un rappel groupé. */
  const deuxJours = { ...ordinaire(), documents: [reglages(ALLUMEES), facteur(true, Date.parse('2026-10-21T09:00:00Z'))],
    invoices: [facture('inv-1'), facture('inv-3', { date: '2026-10-20', creeeLe: '2026-10-20T11:00:00Z', number: 'MND-2026-0163' })] };
  const W = await joue(deuxJours, { maintenantMs: Date.parse('2026-10-21T09:00:00Z') });
  dit('deux jours différents, sans le modèle du point : rien ne part, et la réponse le dit', [0, 2, 1],
    [W.r.relances, W.r.attendLeModele, (W.r.sautes as Record<string, number>)?.['attend-le-modele-du-point']]);
  const AVANT: ReglagesRelances = { actives: true, depuis: '2026-09-25' };
  const vieilles = [facture('v-1', { date: '2026-10-01', creeeLe: '2026-10-01T11:00:00Z' }), facture('v-2', { date: '2026-10-01', creeeLe: '2026-10-01T12:00:00Z', number: 'MND-2026-0170' })];
  const faites = vieilles.flatMap((f) => [1, 2, 3, 4].map((n) => ({ id: `rl-${f.id}-${n}-whatsapp`, data: { id: `rl-${f.id}-${n}-whatsapp`, type: 'relance-facture', statut: 'envoyé', numero: '2290197000012', quand: `2026-10-${String(1 + [1, 3, 7, 14][n - 1]).padStart(2, '0')}T09:10:0${f.id === 'v-1' ? 0 : 5}Z` } })));
  const X = await joue({ ...ordinaire(), documents: [reglages(AVANT), facteur(true, Date.parse('2026-10-19T09:00:00Z'))], invoices: vieilles, envois: faites }, { point: 'rappel_du_point' });
  dit('le trou du lot 3 : deux factures déjà relancées quatre fois chacune, le rappel groupé ne recommence pas', [0, 1], [X.r.relances, X.r.points]);

  /* Une relance d'une facture seule partie à l'enfant : son rang revient au payeur, sous une ligne à son nom. */
  const Y = await joue({
    documents: [reglages(ALLUMEES), facteur(true, Date.parse('2026-10-26T09:00:00Z'))],
    clients: [fiche('enf', '+33608152805', { familyId: 'fy', name: 'Aloys A.' }), fiche('papa', '0190000001', { name: 'Ranti A.', civilite: 'monsieur' })],
    families: [{ id: 'fy', data: { payerClientId: 'papa' } }],
    invoices: [facture('f-seule', { clientId: 'enf' })],
    envois: [{ id: 'rl-f-seule-1-whatsapp', data: { id: 'rl-f-seule-1-whatsapp', type: 'relance-facture', statut: 'envoyé', numero: '33608152805', quand: '2026-10-19T09:10:00Z' } }],
  }, { maintenantMs: Date.parse('2026-10-26T09:00:00Z') });
  const ly = Y.lignes('envois').find((x) => x.id !== 'rl-f-seule-1-whatsapp');
  dit('la relance partie à l enfant ne compte pas pour le payeur : sa 1re part à J+7, à lui, sous une ligne à son nom, la ligne de l enfant intacte',
    [1, 'rl-pt-papa-2026-10-18-1-whatsapp', '2290190000001', ['f-seule'], '33608152805'],
    [Y.r.relances, ly?.id, (ly?.data as Record<string, any>)?.numero, (ly?.data as Record<string, any>)?.invoiceIds, Y.lignes('envois').find((x) => x.id === 'rl-f-seule-1-whatsapp')?.data?.numero]);

  /* Son rythme à elle, réglé dans Paramètres. */
  const RYTHME: ReglagesRelances = { ...ALLUMEES, rythmes: { seule: [2, 5] } };
  const Z1 = await joue({ ...ordinaire(), documents: [reglages(RYTHME), facteur()] });
  const Z2 = await joue({ ...ordinaire(), documents: [reglages(RYTHME), facteur(true, Date.parse('2026-10-20T09:00:00Z'))] }, { maintenantMs: Date.parse('2026-10-20T09:00:00Z') });
  dit('un rythme « 2, 5 » pour les clientes seules : rien à J+1, la 1re à J+2', [0, 1], [Z1.r.relances, Z2.r.relances]);
}

/* ── 4. LA FONCTION ET LES ÉCRANS ── */
{
  const src = lis(SERVEUR);
  dit('le rappel du point : son modèle se lit dans WA_TEMPLATE_RAPPEL_DU_POINT, le contrôle de santé en dit la longueur, la tournée le reçoit', [true, true, true],
    [/const MODELE_POINT = \(Deno\.env\.get\('WA_TEMPLATE_RAPPEL_DU_POINT'\) \?\? ''\)\.trim\(\);/.test(src),
      /WA_TEMPLATE_RAPPEL_DU_POINT: MODELE_POINT\.length/.test(src), /tournee\(sb, \{ maintenantMs: Date\.now\(\), MODELE, MODELE_POINT, WA_TOKEN, WA_PHONE_ID \}\)/.test(src)]);
  const serve = src.slice(src.indexOf('Deno.serve('));
  const iGet = serve.indexOf("  if (req.method === 'GET') {");
  const brancheGet = iGet < 0 ? '' : serve.slice(iGet, serve.indexOf('\n  }\n', iGet));
  dit('le contrôle de santé (GET) répond sans condition, avant la clé, sans toucher la base, et dit sa version', [true, true, true],
    [iGet > 0 && iGet < serve.indexOf('const cleRecue'), !/cleRecue|createClient|sb\.|tournee\(/.test(brancheGet),
      /return json\(\{\s*fonction: 'relances-factures', version: VERSION,/.test(brancheGet)]);
  dit('seul le cron réveille la tournée, et rien ne part sans le modèle nommé', [true, true],
    [/if \(!service \|\| cleRecue !== service\)/.test(serve), /if \(!MODELE\) return json\(\{ version: VERSION, relances: 'sans-modele' \}\);/.test(serve)]);
  const fac = lis('src/apps/trone/routes/vente/Factures.tsx');
  const bloc = lis('src/apps/trone/routes/vente/BlocRelances.tsx');
  dit('la facture montre ses relances, et toute personne qui encaisse pose ou lève la pause', [true, true, true, false],
    [/<BlocRelances facture=\{selected\} qui=\{monNomFil\} pose=\{patchSelected\} \/>/.test(fac),
      /pose\(enPause \? \{ relancesPause: undefined \} : \{ relancesPause: \{ le: new Date\(\)\.toISOString\(\)/.test(bloc),
      /departDesRelances\(facture, settings\.relances, jourDuSalon\)/.test(bloc), /useEstDirection/.test(bloc)]);
  const af = lis('src/apps/trone/routes/pilotage/AFaire.tsx');
  dit('À faire : « À appeler » pour la direction, après la quatrième relance', [true, true],
    [/if \(aAppeler\(rel\.etat, \{ resteXof: rel\.resteXof, enPause: rel\.enPause, aujourdhui: auj \}\)\)/.test(af), /\{estDirection && aAppelerListe\.length > 0 && \(\s*<section id="a-appeler"/.test(af)]);
  const carte = lis('src/apps/trone/routes/systeme/CarteRelances.tsx');
  const param = lis('src/apps/trone/routes/systeme/Parametres.tsx');
  dit('Paramètres : la carte, l interrupteur à la direction, le jour du lancement écrit, le rattrapage validé une fois', [true, true, true, true],
    [/<CarteRelances \/>/.test(param), /if \(!estDirection\) \{ toast\('Ce réglage appartient à la direction\.'\); return; \}\s*if \(r\.actives\)/.test(carte),
      /pose\(\{ actives: true, depuis: r\.depuis \?\? aujourdhui \}\)/.test(carte), /pose\(\{ rattrapage: \{ valideLe: aujourdhui, ids/.test(carte)]);
  const fin = lis('src/shared/finance.ts');
  const constructeur = fin.slice(fin.indexOf('export function nouvelleFacture('), fin.indexOf('export function nouvelleFacture(') + 4000);
  dit('toute pièce neuve dit quand elle a été écrite (sinon aucune ne se relancerait)', true, /theme: f\.theme \?\? 'Aube',\s*status,\s*creeeLe: new Date\(\)\.toISOString\(\),/.test(constructeur));
  const envois = lis('src/shared/envois.ts');
  const auto = lis('src/apps/trone/routes/clients/EnvoisAutomatiques.tsx');
  dit('le journal des envois les nomme', [true, true, true],
    [/'relance-facture': 'Relance de facture'/.test(envois), /rappel_de_reglement: 'relance de facture'/.test(envois), /\['relance-facture', 'Relances de facture'\]/.test(auto)]);
}

if (ko) { console.error(`\n${ko} controle(s) en echec.`); process.exit(1); }
console.log('\nLes relances tiennent leurs promesses.');
