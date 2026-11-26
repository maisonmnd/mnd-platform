/* L'ACCORD DES NOUVELLES, D'UN BOUTON, EPROUVE — 26 novembre 2026.
   `node scripts/verifie-l-accord-d-un-bouton.mjs` ; `--prouve` remet chaque panne.

   L'audit du Trone (B1, « construis » de Yeman) : la question des nouvelles
   au bon moment, d'un bouton.
     A. LA REGLE PURE (accord-des-nouvelles-pur) : quand la question se pose,
        ce qui s'ecrit, la correction de la fiche (un STOP en second toucher),
        les mots, le compte du Tableau de bord ;
     B. LA FONCTION regler-la-seance, REJOUEE contre une base, une horloge et
        un frein simules : `lire` dit `accordADemander`, `nouvelles` ecrit la
        fiche du jeton, jamais par-dessus une reponse, jamais par l'invitee,
        au jour de Cotonou, sous verrou ; sa copie du bloc, mot pour mot ;
     C. LES ECRANS, sur la lettre : la page « Regler » (jamais au TPE, ni pour
        l'invitee, ni pour un foyer), le comptoir (le rendez-vous du jour, le
        « C'est regle »), la fiche, Ma Couronne, le Tableau de bord.
   Fiches inventees. Sortie en ASCII (la console de Windows). */
import { readFileSync, readdirSync } from 'node:fs';
import {
  SOURCES_DE_L_ACCORD, accordAPoser, aDejaRepondu, compteDesAccords, correctionDeLAccord, jourCourtDeLAccord, laQuestionSePose, lundiDe,
  mineureLe, questionAdressee, reponseDite, sourceDite,
} from '../src/shared/accord-des-nouvelles-pur';
import { BOUTONS_DE_L_ACCORD, MERCI_DE_L_ACCORD, MERCI_DU_REFUS, QUESTION_DE_L_ACCORD } from '../src/shared/accord-whatsapp-pur';
import { EN } from '../src/apps/couronne/i18n/en';

const ascii = (s: string): string => s.replace(/[«»]/g, '"').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
let ko = 0;
let vus = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown): void => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  vus += 1;
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${ascii(nom)}${ok ? '' : ` -> ${ascii(JSON.stringify(obtenu) ?? 'undefined')}`}`);
  if (!ok) console.log(`       attendu ${ascii(JSON.stringify(attendu) ?? 'undefined')}`);
};
const lis = (rel: string): string => {
  const copie = process.env.ACCORD_PANNE_FICHIER === rel ? process.env.ACCORD_PANNE_COPIE : undefined;
  return readFileSync(copie ?? rel, 'utf8').replace(/\r\n/g, '\n');
};

/* ══ A. LA REGLE PURE ════════════════════════════════════════════════ */
const J = '2026-11-26';
const adulte = { birthday: '1990-04-02', segments: [] as string[] };
dit('A1 la question se pose a une fiche d adulte sans reponse', true, laQuestionSePose(adulte, J));
dit('A2 jamais apres un oui, un non, un STOP', [false, false, false], [
  laQuestionSePose({ ...adulte, nouvelles: { oui: true, le: J, par: 'comptoir' } }, J),
  laQuestionSePose({ ...adulte, nouvelles: { oui: false, le: J, par: 'whatsapp' } }, J),
  laQuestionSePose({ ...adulte, nouvelles: { oui: false, le: J, par: 'stop' } }, J)]);
dit('A3 jamais pour une fiche archivee, un segment Enfant, une mineure par sa date ; rien sans fiche', [false, false, false, false], [
  laQuestionSePose({ ...adulte, archived: true }, J), laQuestionSePose({ segments: ['Enfant'] }, J),
  laQuestionSePose({ birthday: '2010-06-01' }, J), laQuestionSePose(null, J)]);
dit('A4 dix-huit ans le jour meme : elle repond ; la veille : non ; sans date : elle repond', [true, false, true],
  [laQuestionSePose({ birthday: '2008-11-26' }, J), laQuestionSePose({ birthday: '2008-11-27' }, J), laQuestionSePose({}, J)]);
dit('A5 mineureLe suit l age, une date illisible ne fait pas une enfant', [true, false, false], [mineureLe('2015-01-01', J), mineureLe('1980-01-01', J), mineureLe('pas une date', J)]);
dit('A6 la reponse ecrite : oui ou non, le jour donne, la source', [{ oui: true, le: J, par: 'reglement' }, { oui: false, le: J, par: 'couronne' }],
  [accordAPoser(adulte, true, J, 'reglement'), accordAPoser(adulte, false, J, 'couronne')]);
dit('A7 jamais par-dessus une reponse, jamais sur un STOP, jamais pour une enfant', [null, null, null], [
  accordAPoser({ ...adulte, nouvelles: { oui: false, le: J, par: 'comptoir' } }, true, J, 'reglement'),
  accordAPoser({ ...adulte, nouvelles: { oui: false, le: J, par: 'stop' } }, true, J, 'couronne'),
  accordAPoser({ birthday: '2014-02-02' }, true, J, 'comptoir')]);
dit('A8 un jour mal forme ou un oui qui n est pas un booleen : rien', [null, null],
  [accordAPoser(adulte, true, '26/11/2026', 'comptoir'), accordAPoser(adulte, 'oui' as unknown as boolean, J, 'comptoir')]);
dit('A9 aDejaRepondu : une reponse, oui ; rien, non', [true, false], [aDejaRepondu({ nouvelles: { oui: false, le: J, par: 'stop' } }), aDejaRepondu({ nouvelles: null })]);

/* La correction, a la fiche seulement. */
const stop = { ...adulte, nouvelles: { oui: false, le: '2026-10-02', par: 'stop' } };
dit('A10 corriger un oui en non : au comptoir, le jour donne', { accord: { oui: false, le: J, par: 'comptoir' }, leveUnStop: false },
  correctionDeLAccord({ ...adulte, nouvelles: { oui: true, le: '2026-11-01', par: 'reglement' } }, false, J));
dit('A11 la meme reponse ne reecrit rien ; un STOP qu on redit non non plus', [null, null],
  [correctionDeLAccord({ ...adulte, nouvelles: { oui: true, le: '2026-11-01', par: 'whatsapp' } }, true, J), correctionDeLAccord(stop, false, J)]);
dit('A12 lever un STOP se dit : leveUnStop, pour que l ecran demande un second toucher', true, correctionDeLAccord(stop, true, J)?.leveUnStop);
dit('A13 sans reponse, la fiche pose la premiere au comptoir', { accord: { oui: true, le: J, par: 'comptoir' }, leveUnStop: false }, correctionDeLAccord(adulte, true, J));

/* Les mots. */
dit('A14 la question adressee porte son prenom ; sans prenom, telle quelle', [true, QUESTION_DE_L_ACCORD],
  [questionAdressee('Awa', QUESTION_DE_L_ACCORD).startsWith('Awa, souhaitez-vous aussi recevoir'), questionAdressee('  ', QUESTION_DE_L_ACCORD)]);
dit('A15 la fiche dit le jour, l annee comprise, et d ou vient la reponse', ['Oui, depuis le 2 nov. 2026, en réglant sa séance.', 'Non, le 2 oct. 2026, en répondant STOP : aucune campagne WhatsApp.'],
  [reponseDite({ nouvelles: { oui: true, le: '2026-11-02', par: 'reglement' } }), reponseDite(stop)]);
dit('A16 aucun mot de la fiche ne suppose la civilite', [], [reponseDite(adulte), reponseDite(stop), ...SOURCES_DE_L_ACCORD.map((s) => sourceDite(s))]
  .filter((m) => /\b(elle|il|lui)\b/i.test(m)));
dit('A17 chaque source a son mot ; une source inconnue se tait', [true, ''], [SOURCES_DE_L_ACCORD.every((s) => sourceDite(s).length > 0), sourceDite('pigeon')]);
dit('A18 le jour court : 1er tel quel, un mois faux se tait', ['1 déc. 2026', ''], [jourCourtDeLAccord('2026-12-01'), jourCourtDeLAccord('2026-13-01')]);

/* Le compte du Tableau de bord. */
dit('A19 le lundi de la semaine du salon : jeudi, lundi, dimanche', ['2026-11-23', '2026-11-23', '2026-11-23'], [lundiDe('2026-11-26'), lundiDe('2026-11-23'), lundiDe('2026-11-29')]);
const f = (id: string, x: Record<string, unknown> = {}) => ({ id, branchId: 'b1', birthday: '1990-01-01', segments: [] as string[], ...x });
const fiches = [
  f('a', { nouvelles: { oui: true, le: '2026-11-25', par: 'reglement' } }),
  f('b', { nouvelles: { oui: true, le: '2026-11-23', par: 'comptoir' } }),
  f('c', { nouvelles: { oui: true, le: '2026-11-04', par: 'couronne' } }),
  f('d', { nouvelles: { oui: true, le: '2026-10-30', par: 'whatsapp' } }),
  f('e', { nouvelles: { oui: true, le: '2026-11-28', par: 'comptoir' } }),
  f('g', { nouvelles: { oui: false, le: '2026-11-10', par: 'comptoir' } }),
  f('h', { nouvelles: { oui: false, le: '2026-09-10', par: 'stop' } }),
  f('i'),
  f('j', { nouvelledDemandeesLe: undefined, nouvellesDemandeesLe: '2026-11-20T10:00:00Z' }),
  f('k', { archived: true }),
  f('l', { essai: true }),
  f('m', { birthday: '2016-05-05' }),
  f('n', { segments: ['Enfant'] }),
  { ...f('o'), branchId: 'b2' },
];
const c = compteDesAccords(fiches, { branchId: 'b1', aujourdhui: J });
dit('A20 les fiches qui peuvent repondre : ni archivee, ni d essai, ni d enfant, ni d une autre branche', 9, c.tetes);
dit('A21 oui, non (dont STOP), pas encore demande, demande sans reponse', [5, 2, 1, 1, 1], [c.oui, c.non, c.stop, c.pasEncore, c.sansReponse]);
dit('A22 les oui gagnes : la semaine du lundi a aujourd hui, le mois ; un jour a venir ne compte pas', [2, 3], [c.ouiSemaine, c.ouiMois]);
dit('A23 d ou viennent les oui du mois', { comptoir: 1, reglement: 1, couronne: 1, whatsapp: 0, site: 0, stop: 0 }, c.ouiDuMoisParSource);

/* La meme liste que le type de la fiche (audiences-pur) : chaque lecteur de `par` la connait. */
const typeDeLaFiche = /export type AccordDesNouvelles = \{ oui: boolean; le: string; par: ([^}]+) \};/.exec(lis('src/shared/audiences-pur.ts'))?.[1] ?? '';
dit('A24 les sources de la regle sont celles de AccordDesNouvelles, reglement compris', [...SOURCES_DE_L_ACCORD].sort(),
  [...typeDeLaFiche.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort());
/* Aucun lecteur ne fait une table exhaustive des sources (une source neuve y manquerait sans bruit). */
const lecteurs: string[] = [];
const marche = (d: string) => { for (const n of readdirSync(d, { withFileTypes: true })) { const p = `${d}/${n.name}`; if (n.isDirectory()) marche(p); else if (/\.(ts|tsx)$/.test(n.name)) lecteurs.push(p); } };
marche('src');
dit('A25 aucun Record<AccordDesNouvelles[par], ...> ailleurs que dans la regle', [],
  lecteurs.filter((p) => /Record<AccordDesNouvelles\['par'\]/.test(readFileSync(p, 'utf8'))));

/* ══ B. LA FONCTION regler-la-seance, REJOUEE ═════════════════════════ */
const FN = 'supabase/functions/regler-la-seance/index.ts';
const fn = lis(FN);
const bloc = (t: string): string | null => {
  const a = t.indexOf('/* ⟨accord-des-nouvelles⟩ */');
  const b = t.indexOf('/* ⟨/accord-des-nouvelles⟩ */');
  return a >= 0 && b > a ? t.slice(a, b) : null;
};
const original = bloc(lis('src/shared/accord-des-nouvelles-pur.ts'));
dit('B1 la fonction porte le bloc de la regle, mot pour mot', [true, true], [bloc(fn) !== null, bloc(fn) === original && original !== null]);
dit('B2 la fonction dit sa version : 2026-11-26-b', true, /const VERSION = '2026-11-26-b';/.test(fn));
dit('B3 l action nouvelles est routee', true, fn.includes("if (b.action === 'nouvelles') return await nouvelles(req, b);"));

type Row = { id?: string; branch_id?: string; data?: any; updated_at?: string; [k: string]: any };
const db: Record<string, Row[]> = {};
let tic = 0;
let maintenant = Date.UTC(2026, 10, 26, 10, 0);
/** Une ecriture du Trone qui passe ENTRE la lecture et l'ecriture du serveur (une seule fois, sur une fiche). */
let entreDeux: (() => void) | null = null;
const litCol = (r: Row, col: string): unknown => {
  if (!col.startsWith('data')) return r[col];
  let x: any = r.data;
  for (const p of col.replace(/^data/, '').split(/->>?/).filter(Boolean)) x = x?.[p];
  return x;
};
class Requete {
  filtres: ((r: Row) => boolean)[] = [];
  mode: 'select' | 'insert' | 'update' = 'select';
  valeur: any = null; lim = Infinity; seul = false; compte = false; rend = false; colonnes = '*';
  constructor(public table: string) {}
  select(c?: string, o?: { count?: string; head?: boolean }) { if (this.mode !== 'select') this.rend = true; else this.colonnes = c ?? '*'; if (o?.count) this.compte = true; return this; }
  eq(c: string, v: unknown) { this.filtres.push((r) => String(litCol(r, c) ?? '') === String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((r) => String(litCol(r, c) ?? '') >= String(v)); return this; }
  in(c: string, vs: unknown[]) { this.filtres.push((r) => vs.map(String).includes(String(litCol(r, c) ?? ''))); return this; }
  order() { return this; }
  limit(k: number) { this.lim = k; return this; }
  maybeSingle() { this.seul = true; return this; }
  insert(row: Row) { this.mode = 'insert'; this.valeur = row; return this; }
  update(o: any) { this.mode = 'update'; this.valeur = o; return this; }
  then(ok: (x: any) => any, kko?: (e: any) => any) { return Promise.resolve(this.fais()).then(ok, kko); }
  fais(): any {
    const t = (db[this.table] ??= []);
    if (this.mode === 'insert') {
      const row = { ...structuredClone(this.valeur), at: this.valeur.at ?? new Date(maintenant).toISOString(), updated_at: `t${++tic}` };
      if (row.id && t.some((r) => r.id === row.id)) return { error: { code: '23505', message: 'duplicate key' } };
      t.push(row);
      return { data: this.rend ? [{ id: row.id }] : null, error: null };
    }
    if (this.mode === 'update' && this.table === 'clients' && entreDeux) { const g = entreDeux; entreDeux = null; g(); }
    const lus = t.filter((r) => this.filtres.every((x) => x(r)));
    if (this.mode === 'update') {
      for (const r of lus) { Object.assign(r, structuredClone(this.valeur)); r.updated_at = `t${++tic}`; }
      return { data: this.rend ? lus.map((r) => ({ id: r.id })) : null, error: null };
    }
    if (this.compte) return { count: lus.length, error: null };
    const data = structuredClone(lus.slice(0, this.lim));
    return { data: this.seul ? (data[0] ?? null) : data, error: null };
  }
}
const admin = { from: (t: string) => new Requete(t) };
const env: Record<string, string> = { SUPABASE_URL: 'http://base', SERVICE_KEY: 'cle-de-service', KKIAPAY_PUBLIC_KEY: 'pk', KKIAPAY_PRIVATE_KEY: 'pv', KKIAPAY_SECRET_KEY: 'sk' };
const Horloge = class extends Date {
  constructor(...a: any[]) { if (a.length === 0) super(maintenant); else super(...(a as [any])); }
  static now() { return maintenant; }
};
let handler: ((req: Request) => Promise<Response>) | null = null;
{
  const module = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line no-new-func
  new Function('createClient', 'Deno', 'fetch', 'module', 'exports', 'Date', readFileSync(process.env.REG_FONCTION as string, 'utf8'))(
    () => admin, { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => { handler = h; } },
    async () => new Response('{}', { status: 404 }), module, module.exports, Horloge,
  );
}
let ip = 0;
const appelle = async (corps: Record<string, unknown>, o: { ip?: string } = {}) => {
  const r = await handler!(new Request('http://f/regler-la-seance', { method: 'POST', body: JSON.stringify(corps), headers: { 'x-forwarded-for': o.ip ?? `10.0.0.${++ip}` } }));
  return { status: r.status, corps: await r.json() as any };
};
const J1 = 'abcdefghjkmnp2'; const J2 = 'abcdefghjkmnp3'; const J3 = 'abcdefghjkmnp4'; const J4 = 'abcdefghjkmnp5';
const J5 = 'abcdefghjkmnp6'; const J6 = 'abcdefghjkmnp7'; const J7 = 'abcdefghjkmnp8'; const JF = 'abcdefghjkmnp9';
const rdv = (id: string, clientId: string, jeton: string, x: Record<string, unknown> = {}): Row => ({
  id, branch_id: 'b1', data: { id, clientId, clientName: 'Awa K.', date: '2026-11-26', time: '10:00', status: 'confirmé', lienDeReglement: { jeton, creeLe: 'x' }, ...x },
});
const remplis = () => {
  db.clients = [
    { id: 'c1', branch_id: 'b1', data: { name: 'Awa K.', birthday: '1991-03-03', segments: [] }, updated_at: 't0' },
    { id: 'c2', branch_id: 'b1', data: { name: 'Petite K.', birthday: '2015-03-03', segments: [] }, updated_at: 't0' },
    { id: 'c3', branch_id: 'b1', data: { name: 'Sena D.', nouvelles: { oui: false, le: '2026-10-01', par: 'stop' } }, updated_at: 't0' },
    { id: 'c4', branch_id: 'b1', data: { name: 'Eya D.' }, updated_at: 't0' },
    { id: 'c5', branch_id: 'b1', data: { name: 'Ama D.', archived: true }, updated_at: 't0' },
    { id: 'c6', branch_id: 'b1', data: { name: 'Fifa D.' }, updated_at: 't0' },
  ];
  db.appointments = [
    rdv('r1', 'c1', J1, { lienDInvitee: { jeton: J2, creeLe: 'x', nom: 'Sena' } }),
    rdv('r2', 'c2', J3), rdv('r3', 'c3', J4), rdv('r4', 'c4', J5, { status: 'annulé' }), rdv('r5', 'c5', J6), rdv('r6', 'c6', J7),
    rdv('r7', 'c4', 'xxxxxxxxxxxxxx', { lienDeReglement: undefined, lienDuFoyer: { jeton: JF, apptIds: ['r7'], creeLe: 'x' } }),
  ];
  db.invoices = [{ id: 'f1', branch_id: 'b1', data: { id: 'f1', apptId: 'r1', kind: 'facture', status: 'émise', date: '2026-11-26', lines: [{ label: 'Rituel', qty: 1, unitXof: 20000 }] } }];
  db.journal_gestes = [];
  db.edge_rate_limits = [];
};
remplis();
const lu = await appelle({ action: 'lire', jeton: J1 });
dit('B4 lire : la page est la meme, et dit accordADemander pour une fiche sans reponse', [200, 'a-regler', true], [lu.status, lu.corps.page?.etat, lu.corps.accordADemander]);
dit('B5 lire ne dit jamais la reponse de la fiche, ni dans la page', [false, false], ['nouvelles' in lu.corps, 'nouvelles' in (lu.corps.page ?? {})]);
const parInvitee = await appelle({ action: 'lire', jeton: J2 });
dit('B6 par le lien de l invitee : la page, sans la question', [true, undefined], [parInvitee.corps.page?.parInvitee, parInvitee.corps.accordADemander]);
dit('B7 ni pour une enfant, ni apres un STOP, ni pour une fiche archivee', [undefined, undefined, undefined],
  [(await appelle({ action: 'lire', jeton: J3 })).corps.accordADemander, (await appelle({ action: 'lire', jeton: J4 })).corps.accordADemander,
    (await appelle({ action: 'lire', jeton: J6 })).corps.accordADemander]);

dit('B8 un jeton mal forme, un oui qui n est pas un booleen : 400', [400, 400],
  [(await appelle({ action: 'nouvelles', jeton: 'court', oui: true })).status, (await appelle({ action: 'nouvelles', jeton: J1, oui: 'oui' })).status]);
dit('B9 un jeton inconnu, celui de l invitee, celui d un foyer : 404, rien n est ecrit', [404, 404, 404, false],
  [(await appelle({ action: 'nouvelles', jeton: 'zzzzzzzzzzzzzz', oui: true })).status, (await appelle({ action: 'nouvelles', jeton: J2, oui: true })).status,
    (await appelle({ action: 'nouvelles', jeton: JF, oui: true })).status, !!db.clients.find((x) => x.id === 'c1')!.data.nouvelles]);
/* Il est 23 h 30 UTC le 26 : a Cotonou, le 27 a 0 h 30. */
maintenant = Date.UTC(2026, 10, 26, 23, 30);
const oui = await appelle({ action: 'nouvelles', jeton: J1, oui: true });
dit('B10 « Oui, volontiers » : la fiche du jeton porte oui, le jour de Cotonou, source reglement', [200, true, { oui: true, le: '2026-11-27', par: 'reglement' }],
  [oui.status, oui.corps.ok, db.clients.find((x) => x.id === 'c1')!.data.nouvelles]);
dit('B11 le reste de la fiche ne bouge pas', ['Awa K.', '1991-03-03'], [db.clients.find((x) => x.id === 'c1')!.data.name, db.clients.find((x) => x.id === 'c1')!.data.birthday]);
const geste = db.journal_gestes[0];
dit('B12 le journal porte le geste : la fiche, oui, sans texte de message', [1, 'clients', 'c1', 'La cliente', 'oui'],
  [db.journal_gestes.length, geste?.data?.table, geste?.data?.pieceId, geste?.data?.parNom, geste?.data?.champs?.[0]?.apres]);
const second = await appelle({ action: 'nouvelles', jeton: J1, oui: false });
dit('B13 un second toucher ne reecrit rien, et ne dit pas la reponse deja la', [200, true, undefined, true],
  [second.status, second.corps.deja, second.corps.oui, db.clients.find((x) => x.id === 'c1')!.data.nouvelles.oui]);
dit('B14 lire ne propose plus la question', undefined, (await appelle({ action: 'lire', jeton: J1 })).corps.accordADemander);
maintenant = Date.UTC(2026, 10, 26, 10, 0);
const surLeStop = await appelle({ action: 'nouvelles', jeton: J4, oui: true });
dit('B15 un STOP ne se leve jamais ici : deja, le STOP reste', [true, 'stop', false], [surLeStop.corps.deja, db.clients.find((x) => x.id === 'c3')!.data.nouvelles.par, db.clients.find((x) => x.id === 'c3')!.data.nouvelles.oui]);
dit('B16 une enfant, une fiche archivee : 409, rien n est ecrit', [409, 409, false, false],
  [(await appelle({ action: 'nouvelles', jeton: J3, oui: true })).status, (await appelle({ action: 'nouvelles', jeton: J6, oui: true })).status,
    !!db.clients.find((x) => x.id === 'c2')!.data.nouvelles, !!db.clients.find((x) => x.id === 'c5')!.data.nouvelles]);
dit('B17 un rendez-vous annule : 409', [409, 'annule'], await appelle({ action: 'nouvelles', jeton: J5, oui: true }).then((r) => [r.status, r.corps.error]));
/* Le comptoir repond entre la lecture et l'ecriture du serveur : sa reponse tient. */
entreDeux = () => { const r = db.clients.find((x) => x.id === 'c6')!; r.data = { ...r.data, nouvelles: { oui: false, le: '2026-11-26', par: 'comptoir' } }; r.updated_at = `t${++tic}`; };
const croise = await appelle({ action: 'nouvelles', jeton: J7, oui: true });
dit('B18 le comptoir a repondu entre-temps : la fonction relit, et sa reponse tient', [true, { oui: false, le: '2026-11-26', par: 'comptoir' }],
  [croise.corps.deja, db.clients.find((x) => x.id === 'c6')!.data.nouvelles]);
remplis();
const rafale: number[] = [];
for (let i = 0; i < 21; i++) rafale.push((await appelle({ action: 'nouvelles', jeton: J6, oui: true }, { ip: '9.9.9.9' })).status);
dit('B19 le frein : vingt reponses par adresse en dix minutes, la 21e attend', [20, 429], [rafale.filter((s) => s !== 429).length, rafale[20]]);

/* ══ C. LES ECRANS, SUR LA LETTRE ═════════════════════════════════════ */
const app = lis('src/apps/regler/App.tsx');
dit('C1 la page apprend la question a chaque lecture', true, app.includes('setAccordADemander(r.accordADemander === true);'));
const rendu = /\{accordADemander && !auTpe\(\) && !ecran\.page\.tetes && !ecran\.page\.parInvitee && <LesNouvelles jeton=\{jeton\} prenom=\{ecran\.page\.prenom\} \/>\}/.exec(app);
dit('C2 la question : jamais au TPE, ni pour un foyer, ni pour l invitee', true, !!rendu);
const merci = app.slice(app.indexOf('aria-label="Séance réglée"'), app.indexOf('<p className="rg-devise">'));
dit('C3 ... et sur le « Merci. », apres le reglement, jamais sur la note', [true, false],
  [merci.includes('<LesNouvelles '), app.slice(0, app.indexOf('aria-label="Séance réglée"')).includes('<LesNouvelles ')]);
const nouv = lis('src/apps/regler/Nouvelles.tsx');
dit('C4 les mots de la Maison : la question adressee, les deux boutons, les deux mercis', [true, true, true, true],
  [nouv.includes('questionAdressee(prenom, QUESTION_DE_L_ACCORD)'), nouv.includes('BOUTONS_DE_L_ACCORD.map('), nouv.includes('MERCI_DE_L_ACCORD'), nouv.includes('MERCI_DU_REFUS')]);
dit('C5 deux boutons de poids egal : la meme classe pour oui et non', true, /BOUTONS_DE_L_ACCORD\.map\(\(b\) => \(\s*\n\s*<button key=\{b\.id\} type="button" className="rg-autre"/.test(nouv));
dit('C6 la reponse part a la fonction', true, lis('src/shared/regler-la-seance-serveur.ts').includes("export const repondsAuxNouvelles = (jeton: string, oui: boolean) => appel({ action: 'nouvelles', jeton, oui });"));

const comptoir = lis('src/apps/trone/routes/clients/AccordDesNouvelles.tsx');
dit('C7 le comptoir ecrit au jour du salon, source comptoir, par la regle', [true, false],
  [comptoir.includes("accordAPoser(f, oui, momentDuSalon().jour, 'comptoir')"), /todayISO|new Date\(\)\.toISOString\(\)/.test(comptoir)]);
dit('C8 la ligne du rendez-vous : le jour meme seulement, jamais un annule', true,
  comptoir.includes("if (rdv && (String(rdv.date).slice(0, 10) !== jour || rdv.status === 'annulé')) return null;"));
dit('C9 la ligne disparait une fois la reponse donnee (la regle juge)', true, comptoir.includes('if (!client || !laQuestionSePose(client, jour)) return null;'));
dit('C10 la fiche : un STOP ne se leve qu en second toucher', true, comptoir.includes('if (c.leveUnStop && !stopLeve) { setLeverLeStop(true); return; }'));
dit('C11 les mots du comptoir ne supposent pas la civilite', [], (comptoir.match(/>[^<>{}]*</g) ?? []).filter((m) => /\b(Elle|Il) (accepte|refuse|le demande)\b/.test(m)));
const sh = lis('src/apps/trone/routes/clients/_shared.tsx');
dit('C12 la fiche du rendez-vous porte la ligne', true, sh.includes('{appt && <AccordAuComptoir client={rdvClient} rdv={appt} />}'));
const act = lis('src/apps/trone/routes/clients/actions.tsx');
const cestRegle = act.slice(act.indexOf('function EcranCEstRegle'), act.indexOf('export function PayAppointmentModal'));
dit('C13 « C est regle » porte la ligne, pour la tete du rendez-vous', [true, true],
  [cestRegle.includes('<AccordAuComptoir client={clientDuRegle} />'), cestRegle.includes('const clientDuRegle = clientsDuRegle.find((c) => c.id === appt.clientId);')]);
const cust = lis('src/apps/trone/routes/clients/Customers.tsx');
dit('C14 la fiche cliente : un seul controle, celui de la regle ; plus « Elle accepte »', [true, false],
  [cust.includes('<AccordSurLaFiche client={client} />'), cust.includes('Elle accepte')]);
dit('C15 la nouvelle fiche : la reponse au jour du salon', true, cust.includes("nouvelles: { oui: accordNouvelles, le: momentDuSalon().jour, par: 'comptoir' },"));

const cour = lis('src/apps/couronne/LesNouvellesDeLaMaison.tsx');
dit('C16 Ma Couronne : sa fiche, par le magasin, source couronne, au jour du salon', [true, true, true],
  [cour.includes("accordAPoser(f, oui, momentDuSalon().jour, 'couronne')"), cour.includes('clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, nouvelles: accord } : c)));'),
    cour.includes('if (!client || !laQuestionSePose(client, momentDuSalon().jour)) return null;')]);
dit('C17 ... aucune porte nouvelle : ni fonction, ni rpc', false, /functions\.invoke|\.rpc\(|fetch\(/.test(cour));
dit('C18 l accueil porte la carte', true, lis('src/apps/couronne/Tabs.tsx').includes('<LesNouvellesDeLaMaison />'));
dit('C19 chaque mot de la carte a son anglais', [],
  [QUESTION_DE_L_ACCORD, MERCI_DE_L_ACCORD, MERCI_DU_REFUS, ...BOUTONS_DE_L_ACCORD.map((b) => b.titre), 'Les nouvelles de la Maison', 'Sur WhatsApp, au numéro de votre fiche.']
    .filter((fr) => !(fr in EN)));

const tdb = lis('src/apps/trone/routes/pilotage/Dashboard.tsx');
const direction = tdb.slice(tdb.indexOf('function TableauDeLaDirection'), tdb.indexOf('function TableauDeLEquipe'));
dit('C20 le Tableau de bord de la direction porte la tuile, celui de l equipe non', [true, false],
  [direction.includes('<TuileDeLAccord />'), tdb.slice(tdb.indexOf('function TableauDeLEquipe')).includes('<TuileDeLAccord />')]);
const tuile = lis('src/apps/trone/routes/pilotage/TuileDeLAccord.tsx');
dit('C21 la tuile compte par la regle, la branche et le jour du salon', true, tuile.includes('compteDesAccords(clients, { branchId: branch.id, aujourdhui })') && tuile.includes('const aujourdhui = momentDuSalon().jour;'));

console.log(`\n${vus - ko}/${vus} epreuves tenues${ko ? ` ; ${ko} en echec` : ''}.`);
if (ko) process.exitCode = 1;
