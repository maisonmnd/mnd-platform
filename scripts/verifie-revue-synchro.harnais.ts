/* LE LOT « SYNCHRO » DE LA REVUE DE CODE, ÉPROUVÉ — 10 octobre 2026.

   Lancé par `node scripts/verifie-revue-synchro.mjs`, une SCÈNE par processus
   (`SCENE=<nom>`) : chaque scène part d'un poste neuf, sur la VRAIE
   synchronisation branchée à un faux serveur (`faux-supabase.ts`), avec le
   stockage du téléphone (`faux-stockage.ts`). Les attendus sont écrits en
   dur, tirés de la promesse de chaque correction, jamais du code éprouvé.

   Constats couverts (revue.json, lot synchro) :
     5  deux onglets ne rejouent pas deux fois la même file d'appels ;
     6  hors ligne, une pièce trop lourde pour être gardée se dit refusée ;
     32 la purge de déconnexion n'écrase plus le serveur à la connexion ;
     33 une relecture ratée au réalignement ne vide ni le magasin ni la file,
        le laissez-passer survit à une coupure, le réalignement rend faux ;
     34 pas de merci WhatsApp sans récompense écrite ; la clé d'unicité voyage ;
     35 une relecture partie avant une poussée ne remet pas l'ancienne version ;
     36 la trace se lit par pages au-delà de mille lignes ;
     37 la remise à blanc emporte la file d'attente et ses conflits ;
     38 pas de tiret cadratin affiché dans la coquille du Trône ;
     72 une ligne supprimée ailleurs ne renaît pas d'un geste en attente ;
     84 le secrétariat et les bilans sont purgés à la déconnexion.

   La reprise après relecture (même jour) :
     32 sans session, rien ne se relit ni ne se rejoue ; un refus anonyme
        n'est pas un refus de droit, une suppression ne part pas muette ;
     35 une poussée réussie sans geste neuf rend la lecture en vol dépassée ;
     6  un appareil plein ne se dit pas « pièce trop lourde » ;
     72 le conflit « supprimée ailleurs » ne se détaille ni ne se date faux.

   Sortie en ASCII (console Windows). */
import './faux-stockage';
import { faux } from './faux-supabase';
import { supabase as fauxSb } from './faux-supabase';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createStore } from '../src/shared/store';
import { bindCollection, bindDocument, autoriserLaPurge } from '../src/shared/sync';
import { laPorteARepondu, signOut } from '../src/shared/auth';
import { arbitre, champsQuiDifferent, gestesEntre, gestesEnAttente, lisLesConflits, type Entree } from '../src/shared/file-d-attente';
import { contenuCanonique } from '../src/shared/meme-contenu';
import * as appels from '../src/shared/appels-en-attente';
import { envoieSurWhatsApp } from '../src/shared/whatsapp';
import { gardeLEcriture, oublieLesPassages } from '../src/shared/ecriture-automatique';
import { videLeCacheSaufLesDrapeaux } from '../src/apps/trone/houseReset';
import { litLesTracesDeLaPeriode, litLesTracesDesPieces } from '../src/shared/traces';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown): void => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const attend = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fin = (): never => { process.exit(ko === 0 ? 0 : 1); };

/* ── LE FAUX SERVEUR, AFFÛTÉ POUR CES SCÈNES ─────────────────────────────
   On garde `faux-supabase.ts` tel quel et l'on enveloppe ses requêtes : la
   session qui se ferme (RLS anonyme), une lecture qui échoue ou qui traîne,
   une suppression qui coupe une fois, et le compte des lignes écrites. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;
const sb = fauxSb as unknown as Record<string, unknown> & { from: (t: string) => Q };
const fromDOrigine = sb.from;
/* `mouvements`, `retraits` : des tables sous RLS que la déconnexion ne purge pas. */
const PROTEGEES = new Set(['documents', 'leave_requests', 'mouvements', 'retraits']);
const reglages = {
  lectureRatee: null as string | null,
  lectureLente: null as string | null,
  delaiLent: 400,
  suppressionCoupee: null as string | null,
};
const ecrits: { table: string; lignes: unknown[] }[] = [];
const HORS_LIGNE = { data: null, error: { message: 'TypeError: Failed to fetch' } };
sb.from = (t: string) => {
  const q = fromDOrigine(t);
  const thenDOrigine = q.then.bind(q);
  q.then = (ok?: (v: unknown) => unknown, ko2?: (e: unknown) => unknown) => {
    const rend = (v: unknown, ms = 1) => new Promise((r) => setTimeout(() => r(v), ms)).then(ok, ko2);
    if (!faux.enLigne) return thenDOrigine(ok, ko2);
    if (q.op === 'upsert') ecrits.push({ table: t, lignes: Array.isArray(q.charge) ? q.charge : [q.charge] });
    /* Sans session, la RLS : écriture refusée, suppression sans effet, lecture vide. */
    if (!faux.session && PROTEGEES.has(t)) {
      if (q.op === 'upsert') return rend({ data: null, error: { message: 'new row violates row-level security policy' } });
      if (q.op === 'delete') return rend({ data: null, error: null });
      return rend({ data: q.seul ? null : [], error: null });
    }
    if (q.op === 'delete' && reglages.suppressionCoupee === t) { reglages.suppressionCoupee = null; return rend(HORS_LIGNE); }
    if (q.op === 'select' && q.cols === 'id,data' && reglages.lectureRatee === t) return rend(HORS_LIGNE);
    if (q.op === 'select' && q.cols === 'id,data' && reglages.lectureLente === t) {
      reglages.lectureLente = null;
      /* Lue MAINTENANT, rendue plus tard (400 ms par défaut) : la lecture
         part avant la poussée. */
      return rend(q.execute(), reglages.delaiLent);
    }
    return thenDOrigine(ok, ko2);
  };
  return q;
};
/* La session et ses évènements, comme supabase-js les annonce. */
const ecoutesAuth = new Set<(e: string, s: unknown) => void>();
const SESSION = { user: { id: 'u1' }, access_token: 't' };
const annonceAuth = (e: string) => { for (const f of ecoutesAuth) f(e, faux.session); };
sb.auth = {
  getSession: async () => ({ data: { session: faux.session }, error: null }),
  onAuthStateChange: (f: (e: string, s: unknown) => void) => { ecoutesAuth.add(f); return { data: { subscription: { unsubscribe() { ecoutesAuth.delete(f); } } } }; },
  signOut: async () => { faux.session = null; annonceAuth('SIGNED_OUT'); return { error: null }; },
  refreshSession: async () => ({ data: { session: faux.session }, error: null }),
  getUser: async () => ({ data: { user: (faux.session as { user?: unknown } | null)?.user ?? null }, error: null }),
};
const seConnecte = () => { faux.session = SESSION; annonceAuth('SIGNED_IN'); };
const leReseauRevient = () => { faux.enLigne = true; (globalThis as unknown as { window: { dispatchEvent: (e: { type: string }) => void } }).window.dispatchEvent({ type: 'online' }); };

type Ligne = { id: string; branchId: string; nom: string };
const ligne = (id: string, nom: string): Ligne => ({ id, branchId: 'b', nom });
const poseAuServeur = (table: string, id: string, data: unknown) => {
  if (!faux.base.has(table)) faux.base.set(table, new Map());
  faux.base.get(table)!.set(id, { id, data, branch_id: 'b', updated_at: new Date(Date.now() - 60_000).toISOString() });
};
const serveur = (table: string) => Object.fromEntries([...(faux.base.get(table)?.values() ?? [])].map((l) => [l.id, (l.data as Ligne).nom]));
const local = (s: { get: () => Ligne[] }) => Object.fromEntries(s.get().map((l) => [l.id, l.nom]));
const trie = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort());

const scene = process.env.SCENE ?? '';
laPorteARepondu();

/* ═════ 5 et 6 · LES APPELS QUI ATTENDENT LE RÉSEAU ═════════════════════ */
if (scene === 'appels') {
  type Module = typeof appels;
  const A = (await import(pathToFileURL(process.env.ONGLET_A!).href)) as Module;
  const B = (await import(pathToFileURL(process.env.ONGLET_B!).href)) as Module;
  const recus = () => faux.base.get('__appels')?.size ?? 0;
  const CLE = 'trone::appels-en-attente';
  const sema = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({
    id: `ap-${i + 1}`, fonction: 'whatsapp-envoi', corps: { texte: `m${i + 1}`, marque: `ap-${i + 1}` }, dit: `WhatsApp ${i + 1}`, at: new Date(Date.UTC(2026, 9, 10, 9, i)).toISOString(),
  })));

  /* 5-a : deux onglets, le verrou du navigateur (Node 24 le porte). */
  localStorage.setItem(CLE, sema(3));
  const avant1 = recus();
  await Promise.all([A.videLesAppels(), B.videLesAppels()]);
  dit('5 deux onglets avec verrou : chaque appel part une seule fois', [3, 0], [recus() - avant1, A.lisLesAppels().length]);

  /* 5-b : deux onglets, SANS verrou (vieux navigateur). */
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  const verrous = nav.locks;
  Object.defineProperty(nav, 'locks', { value: undefined, configurable: true });
  localStorage.setItem(CLE, sema(3));
  const avant2 = recus();
  await Promise.all([A.videLesAppels(), B.videLesAppels()]);
  dit('5 deux onglets sans verrou : chaque appel part une seule fois', [3, 0], [recus() - avant2, A.lisLesAppels().length]);
  Object.defineProperty(nav, 'locks', { value: verrous, configurable: true });

  /* 5-c : l'appel sort de la file AVANT de partir. */
  const fonctions = (fauxSb as unknown as { functions: { invoke: (n: string, o?: { body?: { marque?: string } }) => Promise<unknown> } }).functions;
  const invokeDOrigine = fonctions.invoke;
  const encoreDansLaFile: boolean[] = [];
  fonctions.invoke = async (n, o) => {
    encoreDansLaFile.push(appels.lisLesAppels().some((x) => x.id === o?.body?.marque));
    return invokeDOrigine(n, o);
  };
  localStorage.setItem(CLE, sema(2));
  await appels.videLesAppels();
  dit('5 l appel sort de la file avant l invocation', [false, false], encoreDansLaFile);
  fonctions.invoke = invokeDOrigine;

  /* 5-d : une coupure en route le remet EN TÊTE, l'ordre gardé. */
  localStorage.setItem(CLE, sema(2));
  faux.enLigne = false;
  await appels.videLesAppels();
  faux.enLigne = true;
  dit('5 une coupure remet l appel a sa place, en tete', ['ap-1', 'ap-2'], appels.lisLesAppels().map((x) => x.id));
  localStorage.removeItem(CLE);

  /* 6 : hors ligne, une pièce que le stockage refuse. */
  const ls = globalThis.localStorage as unknown as { setItem: (k: string, v: string) => void };
  const setItemDOrigine = ls.setItem;
  ls.setItem = (k, v) => { if (String(v).length > 50_000) throw new Error('QuotaExceededError'); setItemDOrigine(k, v); };
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
  const lourd = { numero: '22990000001', piece: { nom: 'devis.pdf', base64: 'x'.repeat(200_000) } };
  const issue = await appels.appelleOuGarde('whatsapp-envoi', lourd, 'WhatsApp lourd');
  dit('6 hors ligne et trop lourd : erreur dite, jamais en attente', ['erreur', appels.TROP_LOURD_POUR_ATTENDRE, 0],
    ['erreur' in issue ? 'erreur' : 'enAttente' in issue ? 'enAttente' : 'parti', (issue as { erreur?: Error }).erreur?.message, appels.lisLesAppels().length]);
  const leger = await appels.appelleOuGarde('whatsapp-envoi', { numero: '22990000001', texte: 'court' }, 'WhatsApp court');
  dit('6 ... un message leger est garde comme avant', [true, 1], ['enAttente' in leger, appels.lisLesAppels().length]);
  const gardeEnFermant = appels.gardeUnAppel('whatsapp-envoi', lourd, 'WhatsApp en fermant');
  const refus = appels.lisLesRefus().find((r) => r.dit === 'WhatsApp en fermant');
  dit('6 en fermant l onglet : refuse, note pour la pastille, sans la piece', [false, appels.TROP_LOURD_POUR_ATTENDRE, null], [gardeEnFermant, refus?.refus, refus && 'corps' in refus ? refus.corps : 'absent']);
  const wa = await envoieSurWhatsApp({ numero: '+229 01 90 00 00 01', modele: 'bulletin', enTete: 'document', piece: lourd.piece, branchId: 'b' } as never);
  dit('6 le bulletin trop lourd hors ligne ne se compte pas envoye', false, wa.ok);

  /* 6 (reprise) : l'appareil PLEIN, saturé par les magasins. Plus rien
     n'entre, pas même un kilo-octet : la cause dite est la mémoire pleine,
     jamais une pièce, pour un texte seul comme pour une notification. */
  ls.setItem = () => { throw new Error('QuotaExceededError'); };
  const cause = (i: unknown): [string, boolean, boolean] => {
    const m = String((i as { erreur?: Error }).erreur?.message ?? '');
    return ['erreur' in (i as object) ? 'erreur' : 'autre', m.includes('cet appareil est pleine'), m.includes('trop lourde')];
  };
  dit('6 appareil plein : un WhatsApp de texte seul dit la memoire pleine', ['erreur', true, false],
    cause(await appels.appelleOuGarde('whatsapp-envoi', { numero: '22990000001', texte: 'bonjour' }, 'WhatsApp texte')));
  dit('6 ... une notification sans piece aussi', ['erreur', true, false],
    cause(await appels.appelleOuGarde('push-notify', { mode: 'staff', title: 'Alerte', body: 'b', url: '/' }, 'Alerte')));
  dit('6 ... et une piece sur un appareil plein : la memoire, pas la piece', ['erreur', true, false],
    cause(await appels.appelleOuGarde('whatsapp-envoi', { numero: '22990000001', piece: { nom: 'p.pdf', base64: 'x'.repeat(10) } }, 'WhatsApp piece')));
  ls.setItem = (k, v) => { if (String(v).length > 50_000) throw new Error('QuotaExceededError'); setItemDOrigine(k, v); };
  dit('6 ... la place revenue, la piece trop lourde se dit encore trop lourde', ['erreur', false, true],
    cause(await appels.appelleOuGarde('whatsapp-envoi', lourd, 'WhatsApp lourd bis')));
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  ls.setItem = setItemDOrigine;
  fin();
}

/* ═════ 32 et 84 · LA PURGE DE DÉCONNEXION ══════════════════════════════ */
if (scene === 'purge' || scene === 'purge-hors-ligne') {
  const horsLigne = scene === 'purge-hors-ligne';
  faux.session = SESSION;
  poseAuServeur('documents', 'access_codes', { a: '1234' });
  poseAuServeur('leave_requests', 'l1', ligne('l1', 'Conge'));
  localStorage.setItem('trone::mnd_secretariat', JSON.stringify([{ id: 's1' }]));
  localStorage.setItem('trone::mnd_bilans', JSON.stringify([{ id: 'b1' }]));
  localStorage.setItem('trone::mnd_notes_de_seance', JSON.stringify([{ id: 'n1' }]));
  const codes = createStore<Record<string, string>>('mnd_access_codes', {});
  const conges = createStore<Ligne[]>('mnd_leave_requests', []);
  bindDocument(codes, 'access_codes');
  bindCollection(conges, 'leave_requests');
  await attend(900);
  dit(`32 ${scene} : le poste lit les codes et le conge`, [{ a: '1234' }, { l1: 'Conge' }], [codes.get(), local(conges)]);
  if (horsLigne) faux.enLigne = false;
  await signOut();
  await attend(1200);
  dit(`32 ${scene} : la purge ne s inscrit pas dans la file`, 0, gestesEnAttente());
  dit(`84 ${scene} : secretariat, bilans et notes de seance purges`, [null, null, null],
    ['trone::mnd_secretariat', 'trone::mnd_bilans', 'trone::mnd_notes_de_seance'].map((k) => localStorage.getItem(k)));
  if (horsLigne) leReseauRevient();
  seConnecte();
  await attend(2000);
  const doc = faux.base.get('documents')?.get('access_codes')?.data;
  dit(`32 ${scene} : apres reconnexion, le serveur garde les codes et le conge`, [{ a: '1234' }, { l1: 'Conge' }], [doc, serveur('leave_requests')]);
  dit(`32 ${scene} : ... et le poste les relit`, [{ a: '1234' }, { l1: 'Conge' }], [codes.get(), local(conges)]);
  dit(`32 ${scene} : aucun envoi des codes vides, meme refuse`, 0, ecrits.filter((e) => e.table === 'documents'
    && (e.lignes[0] as { key?: string }).key === 'access_codes' && JSON.stringify((e.lignes[0] as { data?: unknown }).data) === '{}').length);
  fin();
}

/* ═════ 33 · LE RÉALIGNEMENT APRÈS UNE SUPPRESSION BLOQUÉE ══════════════ */
if (scene === 'relecture-ratee' || scene === 'laissez-passer' || scene === 'realignement-faux') {
  faux.session = SESSION;
  for (const i of [1, 2, 3, 4, 5, 6]) poseAuServeur('appointments', `a${i}`, ligne(`a${i}`, `R${i}`));
  const rdv = createStore<Ligne[]>('mnd_appointments', []);
  bindCollection(rdv, 'appointments');
  await attend(900);
  const sansLesQuatre = (p: Ligne[]) => p.filter((r) => !['a1', 'a2', 'a3', 'a4'].includes(r.id));

  if (scene === 'relecture-ratee') {
    faux.enLigne = false;
    rdv.set((p) => [...p, ligne('n1', 'Neuf hors ligne')]);
    await attend(30);
    rdv.set(sansLesQuatre);
    await attend(1200);
    dit('33 relecture ratee : le magasin garde le RDV pose hors ligne', ['a5', 'a6', 'n1'], Object.keys(local(rdv)).sort());
    dit('33 ... et la file garde ses cinq gestes', 5, gestesEnAttente());
  }
  if (scene === 'laissez-passer') {
    reglages.suppressionCoupee = 'appointments';
    autoriserLaPurge('appointments');
    rdv.set(sansLesQuatre);
    await attend(6800);
    dit('33 la serie retiree passe a la reprise apres une coupure', ['a5', 'a6'], Object.keys(serveur('appointments')).sort());
    dit('33 ... et le poste ne la voit pas revenir', ['a5', 'a6'], Object.keys(local(rdv)).sort());
  }
  if (scene === 'realignement-faux') {
    rdv.set(sansLesQuatre);
    await attend(1200);
    dit('33 suppression en masse bloquee : le poste revient au serveur', ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], Object.keys(local(rdv)).sort());
    ecrits.length = 0;
    rdv.set((p) => p.map((r) => (r.id === 'a5' ? { ...r, nom: 'R5 bis' } : r)));
    await attend(800);
    dit('33 ... le geste suivant n ecrit que sa ligne', ['a5'], ecrits.filter((e) => e.table === 'appointments').flatMap((e) => e.lignes.map((l) => (l as { id: string }).id)));
    dit('33 ... et le serveur a toujours ses six rendez-vous', 6, Object.keys(serveur('appointments')).length);
  }
  fin();
}

/* ═════ 35 · UNE RELECTURE PARTIE AVANT UNE POUSSÉE ═════════════════════ */
if (scene === 'relecture-depassee') {
  faux.session = SESSION;
  poseAuServeur('essais', 'r1', ligne('r1', 'A'));
  const s = createStore<Ligne[]>('mnd_essais', []);
  bindCollection(s, 'essais');
  await attend(900);
  reglages.lectureLente = 'essais';
  /* Une relecture FORCÉE (jeton rafraîchi) : le filet du focus est
     peut-être retenu par sa limite de quinze secondes. */
  annonceAuth('TOKEN_REFRESHED');
  await attend(20);
  s.set([ligne('r1', 'B')]);
  await attend(1500);
  dit('35 la lecture lente est bien partie avant la poussee', null, reglages.lectureLente);
  dit('35 la lecture d avant la poussee ne remet pas l ancienne version', ['B', 'B'], [local(s).r1, serveur('essais').r1]);
  fin();
}

/* ═════ 72 · UNE LIGNE SUPPRIMÉE AILLEURS ════════════════════════════════ */
if (scene === 'supprimee-ailleurs') {
  /* L'arbitre seul. */
  const at = (n: number) => new Date(Date.UTC(2026, 9, 10, 12, n)).toISOString();
  const j = (r: Ligne) => JSON.stringify(r);
  const file = new Map<string, Entree>([
    ['x', { op: 'set', at: at(5), j: j(ligne('x', 'X-tel')), connue: true }],
    ['d', { op: 'set', at: at(5), j: j(ligne('d', 'D-neuf')) }],
  ]);
  const a = arbitre([] as Ligne[], new Map(), file, contenuCanonique);
  dit('72 arbitre : la ligne connue absente devient conflit, la neuve part', [['d'], ['d'], ['x'], ['x', 'X-tel', 'null']],
    [a.aPousser, a.items.map((x) => x.id), a.finis, ...a.conflits.map((c) => [c.id, JSON.parse(c.notre!).nom, c.leur])]);
  const g = gestesEntre(new Map([['x', '1']]), new Map([['x', '2'], ['n', '3']]), at(0), (id) => id === 'x');
  dit('72 gestesEntre marque la ligne connue, pas la neuve', [true, false], [g.get('x')?.connue === true, g.get('n')?.connue === true]);

  /* Par la relecture (retour du réseau). */
  faux.session = SESSION;
  poseAuServeur('essais', 'x1', ligne('x1', 'X'));
  poseAuServeur('essais', 'y1', ligne('y1', 'Y'));
  poseAuServeur('essais', 'z1', ligne('z1', 'Z'));
  const s = createStore<Ligne[]>('mnd_essais', []);
  bindCollection(s, 'essais');
  await attend(900);
  faux.enLigne = false;
  s.set((p) => p.map((r) => (r.id === 'x1' ? { ...r, nom: 'X-tel' } : r)));
  await attend(400);
  faux.base.get('essais')!.delete('x1');
  leReseauRevient();
  await attend(1500);
  dit('72 retour du reseau : la ligne supprimee ailleurs ne renait pas', [false, false], ['x1' in serveur('essais'), 'x1' in local(s)]);
  dit('72 ... notre version est gardee en conflit, la file est vide', [['x1', 'X-tel', 'null'], 0],
    [lisLesConflits().filter((c) => c.id === 'x1').map((c) => [c.id, JSON.parse(c.notre!).nom, c.leur])[0], gestesEnAttente()]);

  /* En direct : la suppression arrive pendant que le geste attend. */
  faux.enLigne = false;
  s.set((p) => p.map((r) => (r.id === 'y1' ? { ...r, nom: 'Y-tel' } : r)));
  await attend(400);
  faux.base.get('essais')!.delete('y1');
  for (const f of faux.ecoutes) f({ table: 'essais', eventType: 'DELETE', new: {}, old: { id: 'y1' } });
  await attend(50);
  leReseauRevient();
  await attend(1500);
  dit('72 en direct : la ligne supprimee ailleurs ne renait pas', [false, false], ['y1' in serveur('essais'), 'y1' in local(s)]);
  dit('72 ... notre version est gardee en conflit', ['y1', 'Y-tel'], lisLesConflits().filter((c) => c.id === 'y1').map((c) => [c.id, JSON.parse(c.notre!).nom])[0]);

  /* Une ligne NEUVE posée hors ligne part toujours. */
  faux.enLigne = false;
  s.set((p) => [...p, ligne('n1', 'Neuve')]);
  await attend(400);
  leReseauRevient();
  await attend(1500);
  dit('72 une ligne neuve posee hors ligne part toujours', 'Neuve', serveur('essais').n1);
  dit('72 ... et le reste du serveur', { n1: 'Neuve', z1: 'Z' }, trie(serveur('essais')));

  /* Reposée ailleurs : la question est tranchée, le conflit se tait. */
  poseAuServeur('essais', 'y1', ligne('y1', 'Y-repose'));
  for (const f of faux.ecoutes) f({ table: 'essais', eventType: 'UPDATE', new: { id: 'y1', data: ligne('y1', 'Y-repose'), updated_at: new Date().toISOString(), branch_id: 'b' }, old: { id: 'y1' } });
  await attend(100);
  dit('72 ... reposee ailleurs, la ligne revient et son conflit se tait', ['Y-repose', false], [local(s).y1, lisLesConflits().some((c) => c.id === 'y1')]);
  fin();
}

/* ═════ 37 · LA REMISE À BLANC ═══════════════════════════════════════════ */
if (scene === 'remise-a-blanc') {
  /* Un stockage de navigateur, où `Object.keys(localStorage)` rend les cases
     (la remise à blanc les parcourt ainsi). */
  const cases: Record<string, string> = {};
  for (const [nom, f] of Object.entries({
    getItem: (k: string) => (k in cases ? cases[k] : null),
    setItem: (k: string, v: string) => { cases[k] = String(v); },
    removeItem: (k: string) => { delete cases[k]; },
    key: (i: number) => Object.keys(cases)[i] ?? null,
  })) Object.defineProperty(cases, nom, { value: f, enumerable: false });
  Object.defineProperty(cases, 'length', { get: () => Object.keys(cases).length, enumerable: false });
  (globalThis as unknown as { localStorage: unknown }).localStorage = cases;
  localStorage.setItem('trone::file::appointments', '{"a1":{"op":"set","at":"2026-10-10T09:00:00Z","j":"{}"}}');
  localStorage.setItem('trone::file::doc:access_codes', '{}');
  localStorage.setItem('trone::file::conflits', '[]');
  localStorage.setItem('trone::mnd_clients', '[]');
  localStorage.setItem('mnd_house_blank', '1');
  videLeCacheSaufLesDrapeaux();
  const cles = Object.keys(Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => [localStorage.key(i), 1])));
  dit('37 la remise a blanc emporte la file et ses conflits', [], cles.filter((k) => k.includes('::file::')));
  dit('37 ... et garde le drapeau de la Maison a blanc', '1', localStorage.getItem('mnd_house_blank'));
  fin();
}

/* ═════ 36 · LA TRACE PAR PAGES ══════════════════════════════════════════ */
if (scene === 'traces') {
  type L = { id: number; fait_le: string; table_name: string; piece_id: string; operation: string; porte: string; compte_mail: string; compte_nom: string };
  let base: L[] = [];
  let panne = false;
  sb.from = (t: string) => {
    if (t !== 'traces') return fromDOrigine(t);
    const filtres: ((l: L) => boolean)[] = [];
    const ordres: [string, boolean][] = [];
    let tranche: [number, number] = [0, 999];
    const b: Q = {
      select: () => b,
      eq: (c: keyof L, v: unknown) => { filtres.push((l) => l[c] === v); return b; },
      in: (c: keyof L, v: unknown[]) => { filtres.push((l) => v.includes(l[c])); return b; },
      gte: (c: keyof L, v: string) => { filtres.push((l) => String(l[c]) >= v); return b; },
      lt: (c: keyof L, v: string) => { filtres.push((l) => String(l[c]) < v); return b; },
      order: (c: string, o?: { ascending?: boolean }) => { ordres.push([c, o?.ascending !== false]); return b; },
      range: (de: number, a: number) => { tranche = [de, a]; return b; },
      limit: (n: number) => { tranche = [0, n - 1]; return b; },
      then: (ok: (v: unknown) => unknown, ko2: (e: unknown) => unknown) => {
        if (panne && tranche[0] > 0) return Promise.resolve({ data: null, error: { message: 'fetch failed' } }).then(ok, ko2);
        const lignes = base.filter((l) => filtres.every((f) => f(l))).sort((x, y) => {
          for (const [c, asc] of ordres) {
            const vx = (x as unknown as Record<string, string | number>)[c];
            const vy = (y as unknown as Record<string, string | number>)[c];
            if (vx !== vy) return (vx < vy ? -1 : 1) * (asc ? 1 : -1);
          }
          return 0;
        });
        /* LE PLAFOND DE SUPABASE : jamais plus de mille lignes par réponse. */
        const data = lignes.slice(tranche[0], Math.min(tranche[1] + 1, tranche[0] + 1000));
        return Promise.resolve({ data, error: null }).then(ok, ko2);
      },
    };
    return b;
  };
  const fabrique = (n: number, piece = (i: number) => `rdv-${i % 50}`) => Array.from({ length: n }, (_, i) => ({
    id: i + 1, fait_le: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(), table_name: 'appointments', piece_id: piece(i),
    operation: 'modifie', porte: 'trone', compte_mail: 'a@maison', compte_nom: 'A',
  }));
  base = fabrique(2500);
  const mois = await litLesTracesDeLaPeriode('2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z');
  dit('36 le mois de 2500 gestes se lit en entier', [2500, 2500, false], [mois?.length, new Set(mois?.map((t) => t.id)).size, !!(mois as { tronquee?: boolean } | null)?.tronquee]);
  dit('36 ... du plus recent au plus ancien', [2500, 1], [mois?.[0]?.id, mois?.[mois.length - 1]?.id]);
  base = fabrique(2500, () => 'rdv-seul');
  const vie = await litLesTracesDesPieces([{ table: 'appointments', id: 'rdv-seul' }]);
  dit('36 la vie d une piece de 2500 gestes garde les plus recents', [2500, 2500], [vie?.length, vie?.[vie.length - 1]?.id]);
  base = fabrique(25_000);
  const borne = await litLesTracesDeLaPeriode('2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
  dit('36 au-dela de la borne, la lecture le dit', [20_000, true], [borne?.length, (borne as { tronquee?: boolean } | null)?.tronquee === true]);
  base = fabrique(2500);
  panne = true;
  dit('36 une page en erreur rend null, jamais une moitie', null, await litLesTracesDeLaPeriode('2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z'));
  fin();
}

/* ═════ 34 · LE MERCI SUIT L'ÉCRITURE ════════════════════════════════════ */
if (scene === 'merci') {
  oublieLesPassages();
  const vrai = Date.now;
  let t = Date.UTC(2026, 9, 10, 9);
  Date.now = () => t;
  let ecritures = 0;
  const garde = gardeLEcriture('essai', { set: (_v: number) => { ecritures += 1; } });
  const rendus: unknown[] = [];
  for (let i = 0; i < 7; i += 1) { rendus.push(garde.set(i)); t += 1000; }
  Date.now = vrai;
  dit('34 gardeLEcriture dit si elle a ecrit : six oui, puis non en pause', [[true, true, true, true, true, true, false], 6], [rendus, ecritures]);

  const brut = readFileSync('src/apps/trone/shell/useParrainageVivant.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const motif = String.raw`const (\w+) = gardeLEcriture\('parrainage', clientsStore\)\.set\([\s\S]*?\n\s*if \(!\1\) return;[\s\S]*?for \(const m of poses\.mercis\)`;
  dit('34 le parrainage n envoie le merci que si la recompense est ecrite', true, new RegExp(motif).test(brut));
  dit('34 ... et chaque merci porte sa cle d unicite', true, new RegExp(String.raw`cleUnique: \x60merci:\$\{m\.clientId\}:\$\{recompenseId\}\x60`).test(brut));

  faux.session = SESSION;
  await envoieSurWhatsApp({ numero: '+229 01 90 00 00 01', modele: 'parrainage_merci', variables: ['Madame A.', 'B', 'un soin'], branchId: 'b', cleUnique: 'merci:c1:parr-c-c2' } as never);
  const corps = [...(faux.base.get('__appels')?.values() ?? [])].map((l) => (l.data as { corps?: { cleUnique?: string } }).corps?.cleUnique);
  dit('34 la cle d unicite voyage jusqu a la fonction du serveur', ['merci:c1:parr-c-c2'], corps);
  fin();
}

/* ═════ 38 · PAS DE TIRET CADRATIN AFFICHÉ DANS LA COQUILLE ═══════════════ */
if (scene === 'tirets') {
  const dossier = 'src/apps/trone/shell';
  const fautes: string[] = [];
  for (const f of readdirSync(dossier).filter((x) => /\.(ts|tsx)$/.test(x)).sort()) {
    const sansCommentaires = readFileSync(`${dossier}/${f}`, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(new RegExp(String.raw`(^|[^:'"\x60\\])\/\/.*$`, 'gm'), '$1');
    sansCommentaires.split(/\r?\n/).forEach((l, i) => { if (l.includes('—')) fautes.push(`${f}:${i + 1}`); });
  }
  dit('38 aucun tiret cadratin hors commentaires dans src/apps/trone/shell', [], fautes);
  fin();
}

/* ═════ REPRISE APRÈS RELECTURE (10 octobre 2026) ═══════════════════════ */

/* 32 (reprise) · LE POSTE VERROUILLÉ HORS LIGNE, LE RÉSEAU REVENU AVANT LA
   RECONNEXION. Une modification et une ligne neuve attendent en file ; le
   verrou du poste déconnecte ; le réseau revient sans session. Promesse :
   rien ne se relit ni ne se rejoue en anonyme, les deux gestes attendent la
   connexion, et partent alors. Aucun conflit, rien de la ligne au placard. */
if (scene === 'verrou-hors-ligne') {
  faux.session = SESSION;
  poseAuServeur('leave_requests', 'l1', ligne('l1', 'Conge'));
  poseAuServeur('leave_requests', 'l2', ligne('l2', 'Autre'));
  const conges = createStore<Ligne[]>('mnd_leave_requests', []);
  bindCollection(conges, 'leave_requests');
  await attend(900);
  faux.enLigne = false;
  conges.set((p) => [...p.map((r) => (r.id === 'l1' ? { ...r, nom: 'Conge modifie' } : r)), ligne('l3', 'Neuf hors ligne')]);
  await attend(400);
  dit('32 verrou : deux gestes en file avant le verrou', 2, gestesEnAttente());
  await signOut();
  await attend(400);
  ecrits.length = 0;
  leReseauRevient();
  await attend(1500);
  dit('32 verrou : reseau revenu sans session, la file garde ses deux gestes', 2, gestesEnAttente());
  dit('32 ... rien n est pousse en anonyme', 0, ecrits.filter((e) => e.table === 'leave_requests').length);
  dit('32 ... aucun conflit ecrit sur le poste deconnecte', '[]', localStorage.getItem('trone::file::conflits') ?? '[]');
  seConnecte();
  await attend(2500);
  dit('32 verrou : apres reconnexion, le serveur a les deux gestes', { l1: 'Conge modifie', l2: 'Autre', l3: 'Neuf hors ligne' }, trie(serveur('leave_requests')));
  dit('32 ... la file est vide et aucun conflit', [0, []], [gestesEnAttente(), lisLesConflits().map((c) => [c.id, c.leur])]);
  fin();
}

/* 32 (reprise) · LA REPRISE PROGRAMMÉE PART SANS SESSION. Deux tables que
   la déconnexion ne purge pas, et un réglage : une modification, une
   suppression, un réglage, faits hors ligne, dont la poussée a échoué. Le
   poste se verrouille, le réseau revient, la reprise de cinq secondes part
   en anonyme : l'écriture est refusée, la suppression rendue MUETTE (la RLS
   n'efface rien et ne dit rien). Promesse : sans session, aucun geste ne
   sort de la file ; tous partent à la reconnexion. */
if (scene === 'reprise-sans-session') {
  faux.session = SESSION;
  for (const i of [1, 2, 3, 4]) poseAuServeur('mouvements', `m${i}`, ligne(`m${i}`, `M${i}`));
  for (const i of [1, 2, 3, 4]) poseAuServeur('retraits', `r${i}`, ligne(`r${i}`, `R${i}`));
  poseAuServeur('documents', 'reglage_essai', { seuil: 1 });
  const mvts = createStore<Ligne[]>('mnd_mouvements', []);
  const retraits = createStore<Ligne[]>('mnd_retraits', []);
  const reglage = createStore<{ seuil: number }>('mnd_reglage_essai', { seuil: 0 });
  bindCollection(mvts, 'mouvements');
  bindCollection(retraits, 'retraits');
  bindDocument(reglage, 'reglage_essai');
  await attend(900);
  dit('32 reprise : le poste lit les tables et le reglage', ['M1', 4, 1], [local(mvts).m1, retraits.get().length, reglage.get().seuil]);
  faux.enLigne = false;
  mvts.set((p) => p.map((r) => (r.id === 'm1' ? { ...r, nom: 'M-tel' } : r)));
  retraits.set((p) => p.filter((r) => r.id !== 'r2'));
  reglage.set({ seuil: 2 });
  await attend(600);
  await signOut();
  await attend(300);
  ecrits.length = 0;
  leReseauRevient();
  await attend(6500);
  dit('32 reprise : la reprise anonyme a bien essaye d ecrire', true, ecrits.some((e) => e.table === 'mouvements') && ecrits.some((e) => e.table === 'documents'));
  dit('32 ... refusee ou muette sans session, les trois gestes restent en file', 3, gestesEnAttente());
  dit('32 ... et rien n a bouge au serveur', [{ m1: 'M1', m2: 'M2', m3: 'M3', m4: 'M4' }, ['r1', 'r2', 'r3', 'r4'], 1],
    [trie(serveur('mouvements')), Object.keys(serveur('retraits')).sort(), (faux.base.get('documents')?.get('reglage_essai')?.data as { seuil?: number } | undefined)?.seuil]);
  seConnecte();
  await attend(2500);
  dit('32 reprise : apres reconnexion, le serveur a les trois gestes', [{ m1: 'M-tel', m2: 'M2', m3: 'M3', m4: 'M4' }, ['r1', 'r3', 'r4'], 2],
    [trie(serveur('mouvements')), Object.keys(serveur('retraits')).sort(), (faux.base.get('documents')?.get('reglage_essai')?.data as { seuil?: number } | undefined)?.seuil]);
  dit('32 ... et le poste aussi', ['M-tel', ['r1', 'r3', 'r4'], 2], [local(mvts).m1, Object.keys(local(retraits)).sort(), reglage.get().seuil]);
  dit('32 ... et la file est vide', 0, gestesEnAttente());
  fin();
}

/* 35 (reprise) · UNE POUSSÉE SANS GESTE NEUF DOUBLE LA LECTURE. Le geste
   est fait hors ligne (le compteur avance alors), sa poussée échoue. Le
   réseau revient ; une relecture part ; pendant qu'elle vole, l'écho
   d'ailleurs, plus vieux que notre geste, fait repartir la poussée, qui
   ARRIVE avant la lecture. Aucun geste neuf n'est inscrit : seule la
   poussée réussie peut dire que la lecture est dépassée. Promesse : la
   lecture d'avant ne remet pas l'ancienne version. */
if (scene === 'poussee-sans-geste') {
  faux.session = SESSION;
  poseAuServeur('essais', 'r1', ligne('r1', 'A'));
  const s = createStore<Ligne[]>('mnd_essais', []);
  bindCollection(s, 'essais');
  await attend(900);
  faux.enLigne = false;
  s.set([ligne('r1', 'B')]);
  await attend(500);
  dit('35 poussee sans geste : le geste hors ligne attend', [1, 'A'], [gestesEnAttente(), serveur('essais').r1]);
  faux.enLigne = true;
  reglages.lectureLente = 'essais';
  reglages.delaiLent = 900;
  annonceAuth('TOKEN_REFRESHED');
  await attend(40);
  dit('35 ... la lecture lente est partie (elle a vu A)', null, reglages.lectureLente);
  const vieux = new Date(Date.now() - 120_000).toISOString();
  for (const f of faux.ecoutes) f({ table: 'essais', eventType: 'UPDATE', new: { id: 'r1', data: ligne('r1', 'Z'), updated_at: vieux, branch_id: 'b' }, old: { id: 'r1' } });
  await attend(500);
  dit('35 ... la poussee est arrivee avant la lecture', ['B', 0], [serveur('essais').r1, gestesEnAttente()]);
  await attend(1500);
  dit('35 poussee sans geste : la lecture d avant ne remet pas l ancienne version', ['B', 'B'], [local(s).r1, serveur('essais').r1]);
  fin();
}

/* 72 (reprise) · LE CONFLIT « SUPPRIMÉE AILLEURS » À L'ÉCRAN. Promesse :
   une suppression ne se détaille pas champ par champ (ni faux champ
   « valeur »), et ne se date pas de notre geste. */
if (scene === 'conflit-supprime') {
  const notre = JSON.stringify(ligne('x1', 'X-tel'));
  const champs = champsQuiDifferent({ table: 'essais', notre, leur: 'null' });
  dit('72 une suppression : la ligne entiere differe, sans faux champ valeur', [1, false, false],
    [champs.length, champs.includes('valeur'), champs.includes('nom')]);
  dit('72 ... une modification se detaille toujours champ par champ', ['nom'],
    champsQuiDifferent({ table: 'essais', notre, leur: JSON.stringify(ligne('x1', 'X')) }));
  const shell = readFileSync('src/apps/trone/shell/Shell.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  dit('72 ecran : la suppression se reconnait a leur = null', true, new RegExp(String.raw`const supprimee = c\.leur === 'null';`).test(shell));
  dit('72 ecran : le bloc Ce qui differe se tait pour une suppression', true,
    new RegExp(String.raw`champsQuiDifferent\(c\);\s*if \([^\n]*\bsupprimee\b[^\n]*\) return null;`).test(shell));
  dit('72 ecran : la suppression se date de l heure ou on l a vue, jamais de notre geste', true,
    new RegExp(String.raw`\{supprimee \? \x60[^\x60]*heure\(c\.vuLe\)[^\x60]*\x60 : `).test(shell)
    && new RegExp(String.raw`const notreGagne = !supprimee && `).test(shell));
  fin();
}

console.log(`ECHEC scene inconnue : ${scene}`);
process.exit(1);
