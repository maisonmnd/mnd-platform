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
  type ReglagesRelances,
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
  dit('le départ : éteintes rien ; du lancement et après, sa date ; d avant, rien ; rattrapée, le jour de la validation ; plus de 30 jours avant, rien',
    [null, '2026-10-20', null, '2026-10-25', null],
    [departDesRelances({ id: 'a', date: '2026-10-20' }, { depuis: '2026-10-18' }), departDesRelances({ id: 'a', date: '2026-10-20' }, r),
      departDesRelances({ id: 'b', date: '2026-10-10' }, r),
      departDesRelances({ id: 'b', date: '2026-10-10' }, { ...r, rattrapage: { valideLe: '2026-10-25', ids: ['b'] } }),
      departDesRelances({ id: 'c', date: '2026-09-01' }, { ...r, rattrapage: { valideLe: '2026-10-25', ids: ['c'] } })]);
  const base = { depart: '2026-10-18', parties: 0, aujourdhui: '2026-10-18', resteXof: 2000, enPause: false, aRepondu: false };
  const jour = (j: string, parties: number, derniereLe?: string) => relanceDuJour({ ...base, aujourdhui: j, parties, derniereLe });
  dit('le jour même rien ; J+1 la 1re ; J+2 rien ; J+3 la 2e ; J+7 la 3e ; J+14 la 4e ; puis plus rien', [null, 1, null, 2, 3, 4, null],
    [jour('2026-10-18', 0), jour('2026-10-19', 0), jour('2026-10-20', 1, '2026-10-19'), jour('2026-10-21', 1, '2026-10-19'),
      jour('2026-10-25', 2, '2026-10-21'), jour('2026-11-01', 3, '2026-10-25'), jour('2026-12-01', 4, '2026-11-01')]);
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
  dit('l écran : un échec ne compte pas, la 2e se retente aujourd hui', { parties: 1, derniereLe: '2026-10-19', prochaine: '2026-10-22', fini: false }, e);
  const quatre = [1, 2, 3, 4].map((n) => ({ id: idDeLaRelance('f2', n), statut: 'envoyé', quand: `2026-11-0${n}T09:00:00Z` }));
  const e4 = etatDesRelances({ factureId: 'f2', depart: '2026-10-18', journal: quatre, resteXof: 2000, enPause: false, aujourdhui: '2026-11-05', jourDe });
  dit('après la quatrième : fini, et à appeler le lendemain, sauf réglée ou en pause', [true, true, false, false, false],
    [e4.fini, aAppeler(e4, { resteXof: 2000, enPause: false, aujourdhui: '2026-11-05' }), aAppeler(e4, { resteXof: 2000, enPause: false, aujourdhui: '2026-11-04' }),
      aAppeler(e4, { resteXof: 0, enPause: false, aujourdhui: '2026-11-05' }), aAppeler(e4, { resteXof: 2000, enPause: true, aujourdhui: '2026-11-05' })]);
}

/* ── 2. LES COPIES DU SERVEUR ── */
{
  dit('le bloc des règles : même texte au Trône et dans relances-factures', true,
    sansPremiere(extrais('src/shared/relances-pur.ts', 'relances')) === sansPremiere(extrais(SERVEUR, 'relances')));
}
const charge = (nom: string, rend: string) => {
  const js = transformSync(extrais(SERVEUR, nom).replace(/^export /gm, ''), { loader: 'ts' }).code;
  return new Function(`${js}; return ${rend};`)();
};
const serveur = charge('tournee', '{ tournee, resteDeLaFacture, fraisTapGo, dateDite, enFrancs }') as {
  tournee: (sb: unknown, o: { maintenantMs: number; MODELE: string; WA_TOKEN: string; WA_PHONE_ID: string; envoie?: unknown }) => Promise<Record<string, unknown>>;
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
  data: { kind: 'facture', status: 'envoyée', date: '2026-10-18', number: 'MND-2026-0160', branchId: 'b1', clientId: 'c1', clientName: 'Awa Dossou', lines: [{ qty: 1, unitXof: 2000, discountPct: 0 }], globalDiscountPct: 0, payments: [], ...extra },
});
const reglages = (rel: ReglagesRelances | undefined, mndPay: Record<string, unknown> = { actif: true }) => ({ key: 'mnd_settings', data: { relances: rel, mndPay } });
const facteur = (vivant = true, ms = MAINTENANT): Ligne => ({ key: 'mnd_facteur', data: { vuLe: new Date(ms - (vivant ? 60_000 : 3_600_000)).toISOString() } });
const J3 = Date.parse('2026-10-21T09:00:00Z');
const ALLUMEES: ReglagesRelances = { actives: true, depuis: '2026-10-18' };
const joue = async (tables: Record<string, Ligne[]>, o: { maintenantMs?: number; WA?: boolean; envoie?: unknown } = {}) => {
  const b = base(tables);
  const r = await serveur.tournee(b.sb, { maintenantMs: o.maintenantMs ?? MAINTENANT, MODELE: 'rappel_de_reglement', WA_TOKEN: o.WA ? 't' : '', WA_PHONE_ID: o.WA ? 'p' : '', envoie: o.envoie });
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
    ['rappel_de_reglement', ['Madame Awa', '18 octobre 2026', `${(2000).toLocaleString('fr-FR')} F`], '51166-2032'],
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

  /* I. Deux factures de la même cliente, toutes deux à J+1. */
  const I = await joue({ ...ordinaire(), invoices: [facture('inv-1'), facture('inv-2', { number: 'MND-2026-0161' })] });
  dit('deux factures, une cliente : une seule relance aujourd hui', [1, 1], [I.r.relances, (I.r.sautes as Record<string, number>)?.['deja-relancee-aujourdhui']]);

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

  /* O. Le reste a changé : l ancienne attente est annulée, une nouvelle au bon total. */
  const O = await joue({ ...ordinaire(), mnd_pay: [{ id: 'mp-v', data: { pieceId: 'inv-1', genre: 'lien', moyen: 'tapgo', statut: 'en_attente', totalXof: 5080, creeLe: '2026-10-18T10:00:00Z' } }] });
  dit('reste changé : l ancienne attente annulée, une nouvelle au total du bouton', ['annulee', 2032],
    [O.lignes('mnd_pay').find((x) => x.id === 'mp-v')?.data?.statut, O.lignes('mnd_pay').find((x) => x.id !== 'mp-v')?.data?.totalXof]);
}

/* ── 4. LA FONCTION ET LES ÉCRANS ── */
{
  const src = lis(SERVEUR);
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
      /departDesRelances\(facture, settings\.relances\)/.test(bloc), /useEstDirection/.test(bloc)]);
  const af = lis('src/apps/trone/routes/pilotage/AFaire.tsx');
  dit('À faire : « À appeler » pour la direction, après la quatrième relance', [true, true],
    [/return aAppeler\(e, \{ resteXof: reste, enPause, aujourdhui: auj \}\);/.test(af), /\{estDirection && aAppelerListe\.length > 0 && \(\s*<section id="a-appeler"/.test(af)]);
  const carte = lis('src/apps/trone/routes/systeme/CarteRelances.tsx');
  const param = lis('src/apps/trone/routes/systeme/Parametres.tsx');
  dit('Paramètres : la carte, l interrupteur à la direction, le jour du lancement écrit, le rattrapage validé une fois', [true, true, true, true],
    [/<CarteRelances \/>/.test(param), /if \(!estDirection\) \{ toast\('Ce réglage appartient à la direction\.'\); return; \}\s*if \(r\.actives\)/.test(carte),
      /pose\(\{ actives: true, depuis: r\.depuis \?\? aujourdhui \}\)/.test(carte), /pose\(\{ rattrapage: \{ valideLe: aujourdhui, ids/.test(carte)]);
  const envois = lis('src/shared/envois.ts');
  const auto = lis('src/apps/trone/routes/clients/EnvoisAutomatiques.tsx');
  dit('le journal des envois les nomme', [true, true, true],
    [/'relance-facture': 'Relance de facture'/.test(envois), /rappel_de_reglement: 'relance de facture'/.test(envois), /\['relance-facture', 'Relances de facture'\]/.test(auto)]);
}

if (ko) { console.error(`\n${ko} controle(s) en echec.`); process.exit(1); }
console.log('\nLes relances tiennent leurs promesses.');
