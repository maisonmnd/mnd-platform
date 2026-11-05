/* LE RENDEZ-VOUS AU SERVEUR, ÉPROUVÉ — `node scripts/verifie-le-rdv-au-serveur.mjs`.

   3 novembre 2026 : les vraies fonctions `demande-submit` et
   `envois-partent` tournent ici contre une base, un Meta et un Deno
   simulés : la page du rendez-vous (`{ rdv: 'lire' }`), la cliente qui
   revient (`{ cliente: 'retour' }`, `{ cliente: 'lire' }`), la
   confirmation à liens et son repli quand Meta refuse le modèle neuf, en
   direct (l'accusé du site) comme en salle (le facteur). `confirmation-rdv`
   et `assistants-maison` sont lus à leurs ancres. Tout est inventé. Sortie
   ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import {
  apptIdDuJeton, clientIdDuJetonDIdentite, jetonDuRendezVous, referenceDuRendezVous,
} from '../src/shared/lien-du-rdv-pur';
import { lienLu } from '../src/shared/lien-reservation';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
};

/* ── La base simulée : des lignes { id, branch_id, data }, ce que les
   fonctions demandent à supabase-js, rien de plus. ── */
type Ligne = Record<string, any>;
const TABLES: Record<string, Ligne[]> = {};
const table = (t: string): Ligne[] => (TABLES[t] ??= []);
const cleDe = (t: string): string => (t === 'documents' ? 'key' : 'id');
function valeur(l: Ligne, col: string): unknown {
  const m = /^data((?:->[A-Za-z0-9_]+)*)->>([A-Za-z0-9_]+)$/.exec(col);
  if (!m) return l[col];
  let v: any = l.data;
  for (const k of m[1].split('->').filter(Boolean)) v = v?.[k];
  v = v?.[m[2]];
  return v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
}
function projette(l: Ligne, cols: string): Ligne {
  if (!cols || cols.trim() === '*') return structuredClone(l);
  const r: Ligne = {};
  for (const brut of cols.split(',').map((c) => c.trim()).filter(Boolean)) {
    const [alias, chemin] = brut.includes(':') ? brut.split(':') : [brut.replace(/^data->>/, ''), brut];
    r[alias] = structuredClone(valeur(l, chemin));
  }
  return r;
}
class Requete {
  private filtres: ((l: Ligne) => boolean)[] = [];
  private mode: 'select' | 'update' | 'upsert' | 'insert' = 'select';
  private cols = '*';
  private rendre = false;
  private tete = false;
  private plafond = Infinity;
  private tri: [string, boolean] | null = null;
  private seule: 'non' | 'peut-etre' | 'oui' = 'non';
  private charge: any = null;
  private options: any = {};
  constructor(private t: string) {}
  select(cols = '*', o: { count?: string; head?: boolean } = {}) {
    if (this.mode === 'select') { this.cols = cols; this.tete = !!o.head; } else { this.rendre = true; this.cols = cols; }
    return this;
  }
  eq(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c)) === String(v)); return this; }
  neq(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c)) !== String(v)); return this; }
  gt(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') > String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') >= String(v)); return this; }
  lt(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') < String(v)); return this; }
  lte(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') <= String(v)); return this; }
  in(c: string, vs: unknown[]) { const s = new Set(vs.map(String)); this.filtres.push((l) => s.has(String(valeur(l, c)))); return this; }
  is(c: string, v: unknown) { this.filtres.push((l) => (valeur(l, c) ?? null) === v); return this; }
  limit(k: number) { this.plafond = k; return this; }
  order(c: string, o: { ascending?: boolean } = {}) { this.tri = [c, o.ascending !== false]; return this; }
  maybeSingle() { this.seule = 'peut-etre'; return this; }
  single() { this.seule = 'oui'; return this; }
  update(d: any) { this.mode = 'update'; this.charge = d; return this; }
  upsert(d: any, o: any = {}) { this.mode = 'upsert'; this.charge = d; this.options = o; return this; }
  insert(d: any) { this.mode = 'insert'; this.charge = d; return this; }
  private execute(): { data: any; error: any; count?: number } {
    const lignes = table(this.t);
    const cle = this.options.onConflict ?? cleDe(this.t);
    if (this.mode === 'insert' || this.mode === 'upsert') {
      const faites: Ligne[] = [];
      for (const brut of [].concat(this.charge)) {
        const l: Ligne = { at: new Date().toISOString(), ...structuredClone(brut) };
        const i = lignes.findIndex((x) => x[cle] !== undefined && x[cle] === l[cle]);
        if (i >= 0 && this.mode === 'upsert') { if (this.options.ignoreDuplicates) continue; lignes[i] = l; } else lignes.push(l);
        faites.push(l);
      }
      return { data: this.rendre ? faites.map((l) => projette(l, this.cols)) : null, error: null };
    }
    let vues = lignes.filter((l) => this.filtres.every((f) => f(l)));
    if (this.mode === 'update') {
      for (const l of vues) Object.assign(l, structuredClone(this.charge));
      return { data: this.rendre ? vues.map((l) => projette(l, this.cols)) : null, error: null };
    }
    if (this.tri) { const [c, asc] = this.tri; vues = [...vues].sort((a, b) => String(valeur(a, c)).localeCompare(String(valeur(b, c))) * (asc ? 1 : -1)); }
    const compte = vues.length;
    vues = vues.slice(0, this.plafond);
    if (this.tete) return { data: null, error: null, count: compte };
    const data = vues.map((l) => projette(l, this.cols));
    if (this.seule !== 'non') return { data: data[0] ?? null, error: this.seule === 'oui' && !data[0] ? { message: 'aucune ligne' } : null };
    return { data, error: null, count: compte };
  }
  then(ok: (r: any) => unknown, ko?: (e: unknown) => unknown) {
    try { return Promise.resolve(this.execute()).then(ok, ko); } catch (e) { return Promise.reject(e).then(ok, ko); }
  }
}
const client = { from: (t: string) => new Requete(t), rpc: async () => ({ data: null, error: { message: 'rpc absente du banc' } }), storage: { from: () => ({}) } };

/* ── Deno, Meta, la tâche de fond ── */
const ENV: Record<string, string | undefined> = {
  SUPABASE_URL: 'http://faux.local', SUPABASE_SERVICE_ROLE_KEY: 'le-secret-de-la-plateforme', CLE_SERVICE: 'la-cle-de-la-maison',
  WA_TOKEN: 'jeton-meta-de-banc', WA_PHONE_ID: '1234', WA_TEMPLATE_CONF_LIENS: 'confirmation_rdv_liens',
};
const SECRET = ENV.SUPABASE_SERVICE_ROLE_KEY as string;
const SERVIS: ((req: Request) => Promise<Response>)[] = [];
const EN_FOND: Promise<unknown>[] = [];
const META: { modele: string; composants: any[]; to: string }[] = [];
let REPONSES_META: { status: number; corps: unknown }[] = [];
(globalThis as any).__faux = { client: () => client };
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] }, serve: (h: any) => { SERVIS.push(h); } };
(globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => { EN_FOND.push(p); } };
let numeroWa = 0;
(globalThis as any).fetch = async (url: string, init?: { body?: string }) => {
  if (String(url).includes('graph.facebook.com')) {
    const corps = JSON.parse(String(init?.body ?? '{}'));
    META.push({ modele: corps.template?.name, composants: corps.template?.components ?? [], to: corps.to });
    const r = REPONSES_META.shift() ?? { status: 200, corps: { messages: [{ id: `wamid.banc${++numeroWa}` }] } };
    return new Response(JSON.stringify(r.corps), { status: r.status });
  }
  return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
};
console.error = () => {};
const metaRefuse = (code: number) => ({ status: 400, corps: { error: { code, message: `refus de banc ${code}` } } });
const attendsLeFond = async () => { while (EN_FOND.length) await Promise.allSettled(EN_FOND.splice(0)); };

/* ── Les fixtures ── */
const AUJOURDHUI = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
table('services').push(
  { id: 'sv-retwist', data: { name: 'Retwist' } },
  { id: 'sv-shampoing', data: { name: 'Shampoing' } },
);
table('clients').push(
  { id: 'cl-adjoa', branch_id: 'br-1', data: { name: 'Adjoa Koffi', civilite: 'madame', phone: '+2290197000001', branchId: 'br-1' } },
  /* Une enfant dont la mère est le SECOND numéro : la mère passe d'abord. */
  { id: 'cl-enfant', branch_id: 'br-1', data: { name: 'Kiki', phone: '+2290166000000', phone2: '+2290197000001', branchId: 'br-1' } },
);
table('appointments').push(
  { id: 'ap-banc-1', data: { date: '2099-11-08', time: '10:00', dureeMin: 90, serviceIds: ['sv-retwist', 'sv-shampoing'], status: 'confirmé', clientId: 'cl-adjoa', clientName: 'Adjoa Koffi' } },
  { id: 'ap-banc-site', data: { date: '2099-11-09', time: '11:00', dureeMin: 60, serviceIds: ['sv-retwist'], status: 'confirmé', clientId: '', clientName: 'Sena' } },
  { id: 'ap-banc-passe', data: { date: '2026-10-20', time: '09:00', dureeMin: 60, serviceIds: ['sv-shampoing'], status: 'honoré', clientId: 'cl-adjoa' } },
  { id: 'ap-banc-annule', data: { date: '2099-12-01', time: '09:00', serviceIds: ['sv-retwist'], status: 'annulé', clientId: 'cl-adjoa' } },
  { id: 'ap-banc-enfant', data: { date: '2026-11-01', time: '09:00', serviceIds: ['sv-retwist'], status: 'honoré', clientId: 'cl-enfant' } },
);
table('demandes').push({ id: 'dm-banc', data: { apptId: 'ap-banc-site', prenom: 'Sena', civilite: 'mademoiselle', telephone: '+2290155000000' } });

/* Les fonctions, dans cet ordre : demande-submit, puis le facteur. */
const demande = await import('../supabase/functions/demande-submit/index.ts') as any;
await import('../supabase/functions/envois-partent/index.ts');
const [servirDemande, servirFacteur] = SERVIS;
let ipN = 0;
const appelle = async (corps: unknown, ip = `10.0.0.${++ipN}`) => {
  const r = await servirDemande(new Request('http://faux.local/functions/v1/demande-submit', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(corps),
  }));
  return { statut: r.status, corps: await r.json() };
};

/* 1. LA PAGE DU RENDEZ-VOUS. */
const jeton1 = await jetonDuRendezVous(SECRET, 'ap-banc-1');
const lu = await appelle({ rdv: 'lire', v: jeton1 });
dit('S1 le jeton signe lit son rendez-vous : reference, jour, heure, duree, gestes, appel, a venir', {
  statut: 200, corps: { ok: true, rdv: { reference: referenceDuRendezVous('ap-banc-1'), date: '2099-11-08', heure: '10:00', dureeMin: 90, gestes: ['Retwist', 'Shampoing'], appel: 'Mme Adjoa', statut: 'a-venir' } },
}, lu);
dit('S2 la reponse ne dit ni le numero, ni le nom entier, ni le prix', [false, false, false],
  [JSON.stringify(lu.corps).includes('0197000001'), JSON.stringify(lu.corps).includes('Koffi'), /prix|price|xof/i.test(JSON.stringify(lu.corps))]);
const site = await appelle({ rdv: 'lire', v: await jetonDuRendezVous(SECRET, 'ap-banc-site') });
dit('S3 une reservation du site sans fiche prend la civilite de sa demande', 'Mlle Sena', site.corps?.rdv?.appel);
dit('S4 un rendez-vous annule se dit annule, un passe se dit passe', ['annule', 'passe'], [
  (await appelle({ rdv: 'lire', v: await jetonDuRendezVous(SECRET, 'ap-banc-annule') })).corps?.rdv?.statut,
  (await appelle({ rdv: 'lire', v: await jetonDuRendezVous(SECRET, 'ap-banc-passe') })).corps?.rdv?.statut,
]);
dit('S5 un jeton signe par la cle de la Maison (et pas celle de la plateforme) ne lit rien', { ok: false, error: 'lien' },
  (await appelle({ rdv: 'lire', v: await jetonDuRendezVous(ENV.CLE_SERVICE as string, 'ap-banc-1') })).corps);
dit('S6 un jeton forge, ou rien, ne lit rien', [{ ok: false, error: 'lien' }, { ok: false, error: 'lien' }],
  [(await appelle({ rdv: 'lire', v: 'ap-banc-1.AAAAAAAAAAAAAAAAAAAAAA' })).corps, (await appelle({ rdv: 'lire' })).corps]);
dit('S7 un rendez-vous efface : introuvable', { ok: false, error: 'introuvable' },
  (await appelle({ rdv: 'lire', v: await jetonDuRendezVous(SECRET, 'ap-banc-efface') })).corps);
const rafale: number[] = [];
for (let i = 0; i < 31; i++) rafale.push((await appelle({ rdv: 'lire', v: 'x' }, '10.9.9.9')).statut);
dit('S8 trente lectures par dix minutes et par adresse, la trente-et-unieme attend', [200, 429], [rafale[29], rafale[30]]);

/* 2. LA CLIENTE QUI REVIENT. */
META.length = 0;
const connue = await appelle({ cliente: 'retour', telephone: '01 97 00 00 01', dial: '+229' });
const inconnue = await appelle({ cliente: 'retour', telephone: '01 98 76 54 32', dial: '+229' });
dit('S9 connue ou pas, la meme reponse, tout de suite', [{ statut: 200, corps: { ok: true } }, true], [connue, JSON.stringify(connue) === JSON.stringify(inconnue)]);
dit('S10 rien n est parti avant la reponse (le temps ne trahit rien)', 0, META.length);
await attendsLeFond();
dit('S11 un seul WhatsApp, au numero connu, modele reservation_preparee', [1, 'reservation_preparee', '2290197000001'], [META.length, META[0]?.modele, META[0]?.to]);
const parametres = (META[0]?.composants?.[0]?.parameters ?? []).map((p: { text: string }) => p.text);
dit('S12 la mere (numero principal) avant l enfant (second numero), et les gestes de son dernier rituel passe', ['Mme Adjoa', 'Shampoing'], parametres);
dit('S12b l enfant est bien trouvee par son second numero (sinon S12 ne prouve rien)', ['cl-adjoa', 'cl-enfant'], (await demande.fichesDuNumero('+2290197000001')).map((f: { id: string }) => f.id));
const mot = META[0]?.composants?.[1]?.parameters?.[0]?.text ?? '';
const relu = lienLu(`?r=${mot}`);
dit('S13 le bouton porte ses gestes et son identite, que le site relit', [['sv-shampoing'], 'cl-adjoa'],
  [relu.gestes, await clientIdDuJetonDIdentite(SECRET, relu.identite, AUJOURDHUI)]);
dit('S14 le journal garde un envoi par fiche et par jour', 'envoyé', table('envois').find((e) => e.id === `retour-cl-adjoa-${AUJOURDHUI.replace(/-/g, '')}`)?.data?.statut);
dit('S15 le fil dit ce qu elle a recu, sans le jeton', [true, false], [
  table('messages_wa').some((m) => m.data?.clientId === 'cl-adjoa' && String(m.data?.texte).includes('a préparé votre réservation : Shampoing')),
  table('messages_wa').some((m) => String(m.data?.texte).includes(relu.identite)),
]);
await appelle({ cliente: 'retour', telephone: '+229 0197000001', dial: '+229' });
await attendsLeFond();
dit('S16 une seconde demande le meme jour ne renvoie rien', 1, META.length);
dit('S17 un numero mal forme se dit, sans rien envoyer', { ok: false, error: 'telephone' }, (await appelle({ cliente: 'retour', telephone: '12' })).corps);
const seau: number[] = [];
for (let i = 0; i < 6; i++) seau.push((await appelle({ cliente: 'retour', telephone: '01 98 76 54 32' }, '10.8.8.8')).statut);
await attendsLeFond();
dit('S18 cinq demandes de retour par dix minutes et par adresse, la sixieme attend', [200, 429], [seau[4], seau[5]]);
dit('S19 le seau du retour ne prend pas celui des reservations', true, (await appelle({ genre: 'rdv', data: {} }, '10.8.8.8')).statut !== 429);

const lue = await appelle({ cliente: 'lire', identite: relu.identite });
dit('S20 le jeton d identite rend les coordonnees de SA fiche', { ok: true, cliente: { prenom: 'Adjoa', nom: 'Koffi', civilite: 'madame', numero: '0197000001', dial: '+229' } }, lue.corps);
dit('S21 une identite forgee ou retouchee ne rend rien', [{ ok: false, error: 'lien' }, { ok: false, error: 'lien' }], [
  (await appelle({ cliente: 'lire', identite: relu.identite.replace('cl-adjoa', 'cl-enfant') })).corps,
  (await appelle({ cliente: 'lire', identite: 'cl-adjoa~20991231~AAAAAAAAAAAAAAAAAAAAAA' })).corps,
]);

/* 3. LA CONFIRMATION DU SITE, À LIENS, ET SON REPLI. */
const accuse = (apptId?: string) => demande.envoieLAccuse({
  ...(apptId ? { apptId } : {}), demandeId: 'dm-accuse', branchId: 'br-1', prenom: 'Adjoa', civilite: 'madame', telephone: '+2290197000001',
  avecPlace: true, quand: 'samedi 8 novembre 2099 à 10 h', date: '2099-11-08', time: '10:00',
});
const ligneConf = (id: string) => table('envois').find((e) => e.id === `conf-${id}-whatsapp`)?.data;
META.length = 0;
const s22 = await accuse('ap-banc-1');
const ref1 = referenceDuRendezVous('ap-banc-1');
dit('S22 une place posee part avec le modele a liens : trois variables, la reference en troisieme', ['envoyé', 1, 'confirmation_rdv_liens', ['Mme Adjoa', 'samedi 8 novembre 2099 à 10 h', ref1]],
  [s22, META.length, META[0]?.modele, META[0]?.composants?.[0]?.parameters?.map((p: { text: string }) => p.text)]);
const boutons = (META[0]?.composants ?? []).slice(1);
dit('S23 deux boutons a URL, index 0 et 1, chacun avec un jeton qui relit ce rendez-vous', [['url', '0', 'ap-banc-1'], ['url', '1', 'ap-banc-1']],
  await Promise.all(boutons.map(async (b: any) => [b.sub_type, b.index, await apptIdDuJeton(SECRET, b.parameters?.[0]?.text)])));
dit('S24 le journal garde le modele parti et la reference', ['confirmation_rdv_liens', ref1, undefined], [ligneConf('ap-banc-1')?.modele, ligneConf('ap-banc-1')?.reference, ligneConf('ap-banc-1')?.repliDuModele]);
dit('S25 le fil dit la reference', true, table('messages_wa').some((m) => String(m.data?.texte).includes(`Votre référence : ${ref1}`)));

META.length = 0;
REPONSES_META = [metaRefuse(132001)];
const s26 = await accuse('ap-banc-site');
dit('S26 Meta refuse le modele neuf (#132001) : l ancien part dans la meme seconde, deux variables', ['envoyé', ['confirmation_rdv_liens', 'confirmation_rdv'], 1, 2],
  [s26, META.map((m) => m.modele), META[1]?.composants?.length, META[1]?.composants?.[0]?.parameters?.length]);
dit('S27 le journal dit le repli, le fil dit ce qui est vraiment parti', ['confirmation_rdv', 132001, true], [
  ligneConf('ap-banc-site')?.modele, ligneConf('ap-banc-site')?.repliDuModele,
  table('messages_wa').some((m) => String(m.data?.texte).endsWith("Merci de nous prévenir en cas d'empêchement.") && m.data?.modele === 'confirmation_rdv'),
]);
META.length = 0;
REPONSES_META = [metaRefuse(131026)];
const s28 = await accuse('ap-banc-passe');
dit('S28 un refus qui n est pas celui du modele (numero hors WhatsApp) ne relance rien', ['échec', 1], [s28, META.length]);
META.length = 0;
ENV.WA_TEMPLATE_CONF_LIENS = undefined;
await accuse('ap-banc-annule');
dit('S29 sans le nom du modele neuf, l ancienne confirmation, sans bouton', [['confirmation_rdv'], 1], [META.map((m) => m.modele), META[0]?.composants?.length]);
ENV.WA_TEMPLATE_CONF_LIENS = 'confirmation_rdv_liens';
META.length = 0;
await accuse(undefined);
dit('S30 une place demandee mais non posee garde son accuse, jamais de liens', [['demande_recue'], 1], [META.map((m) => m.modele), META[0]?.composants?.length]);

/* 4. LE FACTEUR : LE REPLI DU COLIS. */
const colisLiens = (repli: boolean) => ({
  genre: 'whatsapp', numero: '2290197000001', modele: 'confirmation_rdv_liens', parQui: 'Le Trône', texteAuFil: 'le texte a liens',
  composants: [{ type: 'body', parameters: [{ type: 'text', text: 'Mme Adjoa' }, { type: 'text', text: 'samedi' }, { type: 'text', text: ref1 }] }],
  ...(repli ? { repli: { modele: 'confirmation_rdv', composants: [{ type: 'body', parameters: [{ type: 'text', text: 'Mme Adjoa' }, { type: 'text', text: 'samedi' }] }], texteAuFil: 'le texte d avant' } } : {}),
});
const enSalle = (id: string, repli: boolean) => ({
  id, branch_id: 'br-1',
  data: { id, branchId: 'br-1', type: 'confirmation', canal: 'whatsapp', apptId: 'ap-banc-1', clientId: 'cl-adjoa', dateRdv: '2099-11-08', heure: '10:00',
    statut: 'en-attente', partA: new Date(Date.now() - 60_000).toISOString(), parLaMain: true, colis: colisLiens(repli) },
});
const facteur = async () => servirFacteur(new Request('http://faux.local/functions/v1/envois-partent', { method: 'POST', headers: { authorization: `Bearer ${ENV.CLE_SERVICE}` } }));
const ligne = (id: string) => table('envois').find((e) => e.id === id)?.data;
META.length = 0;
table('envois').push(enSalle('conf-salle-a-whatsapp', true));
REPONSES_META = [metaRefuse(132015)];
await facteur();
dit('S31 en salle, Meta refuse le modele neuf : le repli du colis part', [['confirmation_rdv_liens', 'confirmation_rdv'], 'envoyé', 132015, 'confirmation_rdv'],
  [META.map((m) => m.modele), ligne('conf-salle-a-whatsapp')?.statut, ligne('conf-salle-a-whatsapp')?.repliDuModele, ligne('conf-salle-a-whatsapp')?.modele]);
dit('S32 le fil du facteur dit le texte du repli', true, table('messages_wa').some((m) => m.data?.texte === 'le texte d avant' && m.data?.modele === 'confirmation_rdv'));
META.length = 0;
table('envois').push(enSalle('conf-salle-b-whatsapp', false));
REPONSES_META = [metaRefuse(132001)];
await facteur();
dit('S33 un colis sans repli reste un echec, un seul envoi', [1, 'échec'], [META.length, ligne('conf-salle-b-whatsapp')?.statut]);
META.length = 0;
table('envois').push(enSalle('conf-salle-c-whatsapp', true));
REPONSES_META = [metaRefuse(131049)];
await facteur();
dit('S34 un refus qui n est pas celui du modele ne prend pas le repli', [1, 'échec', undefined], [META.length, ligne('conf-salle-c-whatsapp')?.statut, ligne('conf-salle-c-whatsapp')?.repliDuModele]);
META.length = 0;
table('envois').push(enSalle('conf-salle-d-whatsapp', true));
await facteur();
dit('S35 accepte du premier coup : le modele a liens, sans repli', [['confirmation_rdv_liens'], 'envoyé', undefined], [META.map((m) => m.modele), ligne('conf-salle-d-whatsapp')?.statut, ligne('conf-salle-d-whatsapp')?.repliDuModele]);

/* 5. CONFIRMATION-RDV ET ASSISTANTS-MAISON, À LEURS ANCRES. */
/* La panne plantée par `--prouve` sur un fichier lu (et non importé). */
declare const __PANNE__: null | [string, string, string, string];
const lis = (f: string): string => {
  let s = readFileSync(f, 'utf8');
  const p = __PANNE__;
  if (p && p[1] === f) {
    if (s.split(p[2]).length !== 2) { console.log(`PANNE INTROUVABLE : ${p[0]}`); process.exit(3); }
    s = s.replace(p[2], p[3]);
  }
  return s;
};
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const conf = sansCommentaires(lis('supabase/functions/confirmation-rdv/index.ts'));
dit('S36 confirmation-rdv essaie le modele a liens puis l ancien, sur un refus du modele seulement', [true, true, true], [
  conf.includes('for (const liens of jeton && !liensEnPause ? [true, false] : [false])'),
  /\} else if \(liens && refusDuModele\(rep\?\.error\?\.code\)\) \{\s*repliDuModele = Number\(rep\?\.error\?\.code\);\s*continue;/.test(conf),
  conf.includes("const WA_TEMPLATE_LIENS = (Deno.env.get('WA_TEMPLATE_CONF_LIENS') ?? '').trim();"),
]);
dit('S37 confirmation-rdv signe avec le secret de la plateforme, et depose en salle le colis a liens avec son repli', [true, true], [
  conf.includes("const SECRET_DES_LIENS = (Deno.env.get(NOM_DU_SECRET_DES_LIENS) ?? '').trim();"),
  conf.includes('repli: { modele: WA_TEMPLATE, composants: sansLiens, texteAuFil: texteDuFil },'),
]);
dit('S38 le fil de confirmation-rdv dit le modele vraiment parti', true,
  conf.includes("consigneAuFil(a, tel, waId, liens ? texteDeLaConfirmation({ avecLiens: true, prenom, quand, reference }) : texteDuFil, modele);"));
const asm = sansCommentaires(lis('scripts/serveur/assistants-maison.ts'));
dit('S39 la confirmation deposee par Opale porte les liens et son repli', [true, true, true], [
  asm.includes("const secret = (Deno.env.get(NOM_DU_SECRET_DES_LIENS) ?? '').trim();"),
  asm.includes('repli: sansLiens,'),
  asm.includes("from '../../src/shared/lien-du-rdv-pur';"),
]);

console.log(`\n${n - ko}/${n} epreuves tenues${ko ? ` ; ${ko} en echec` : ''}.`);
