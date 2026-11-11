/* LES MESSAGES DE LA SÉANCE, ÉPROUVÉS · 11 novembre 2026.
   `node scripts/verifie-les-messages-de-la-seance.mjs` (et `--prouve`).

   Lots 4 et 5 de l'abonnement refait (maquette
   `public/maquette-l-abonnement-refait.html`). À ne pas confondre avec
   `verifie-les-messages-de-l-abonnee` (20 octobre 2026), qui éprouve les
   rappels d'échéance et le prix revu.

     I    LA RÈGLE PURE (`src/shared/messages-de-l-abonnee-pur.ts`) : la veille
          avec l'attention, la place proposée après la séance (son jour, son
          heure, jamais un dimanche, jamais un jour fermé, dans la vie du
          contrat, sur une lune réglée, jamais avant demain), pourquoi aucun
          message ne part, le rendez-vous suivant, la ligne déposée, les
          boutons, les deux fiches Meta ;
     II   LE VRAI DÉPÔT DU TRÔNE (`messages-de-l-abonnee.ts`) sur ses vrais
          magasins et le vrai juge de l'abonnée, contre un faux Supabase ;
     III  LES VRAIES FONCTIONS rappels-j1 puis envois-partent : la veille en
          salle seulement, le repli, les rendez-vous sans confirmation, les
          fiches d'essai, le facteur muet ;
     IV   LE DÉPART D'UNE PROCHAINE SÉANCE (envois-partent) : la suite posée
          pendant l'attente la tait ;
     V    LES BOUTONS (whatsapp-webhook) : le seul numéro à qui le message est
          parti, « Oui » pose par 0198 et confirme dans la conversation, « Une
          autre date » ne pose rien, une suite déjà posée ne se double pas ;
     VI   LE TEXTE : 0198, les copies, le document des modèles, l'écran ;
     VII  CE QUI VA PARTIR : les deux genres se lisent sous leur nom ;
     VIII LA PAGE ABONNEMENTS DU SITE : quatre blocs, aucun prix, les formules
          ouvertes, les deux gestes.
   Personnes, numéros et dates inventés. Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import * as P from '../src/shared/messages-de-l-abonnee-pur';
import { deposeLaProchaineSeance } from '../src/shared/messages-de-l-abonnee';
import { appointmentsStore } from '../src/shared/agenda';
import { clientsStore } from '../src/shared/clients';
import { plansStore, subscribersStore } from '../src/shared/abonnements';
import { invoicesStore } from '../src/shared/finance';
import { servicesStore } from '../src/shared/catalog';
import { branchesStore } from '../src/shared/branches';
import { blocagesStore } from '../src/shared/blocages';
import { exceptionsHorairesStore, settingsStore } from '../src/shared/settings';
import { modelesMetaStore } from '../src/shared/modeles-meta';
import { DEVISE_COMPLETE } from '../src/shared/identite';
import { dejaAuJournal, genreDeLaLigne, libelleDeLaLigne, GENRES_PREVUS } from '../src/shared/ce-qui-va-partir-pur';
import { PAGES } from '../src/apps/revelateur/contenu';
import { faconsDeVenir, faconsDuSite } from '../src/apps/revelateur/formules-du-site-pur';
import { COPIES, entre } from './terminer-copie-serveur.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${sansAccents(nom)}${ok ? '' : ` -> ${ascii(obtenu)} (attendu ${ascii(attendu)})`}`);
};

/* La faute du `--prouve` vaut aussi pour ce que le banc lit en texte. */
const PANNE = process.env.BANC_PANNE ? JSON.parse(process.env.BANC_PANNE) as { fichiers: string[]; avant: string; apres: string } : null;
const lis = (f: string): string => {
  let t = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  if (PANNE && PANNE.fichiers.includes(f)) t = t.replace(PANNE.avant, () => PANNE.apres);
  return t;
};
const PUR = 'src/shared/messages-de-l-abonnee-pur.ts';
const RJ = 'supabase/functions/rappels-j1/index.ts';
const EP = 'supabase/functions/envois-partent/index.ts';
const WH = 'supabase/functions/whatsapp-webhook/index.ts';
const SQL = 'supabase/migrations/0198_la_prochaine_seance_posee_par_la_maison.sql';

/* Les règles d'écriture de la Maison, pour tout ce qu'une cliente lit. */
const fautesDeLaMaison = (t: string): string[] => [
  ...(/—/.test(t) ? ['tiret long'] : []),
  ...(/\bsalon\b/i.test(t) ? ['salon'] : []),
  ...(/ma[iî]tre|ma[iî]tresse/i.test(t) ? ['maitre'] : []),
  ...(/Ɖ/.test(t) ? ['D barre majuscule'] : []),
  ...(/(?<!\p{L})(tu|ton|ta|tes|toi)(?!\p{L})/iu.test(t) ? ['tutoiement'] : []),
];

/* ══ I. LA RÈGLE PURE ══════════════════════════════════════════════════ */
/* ── I.1 la veille ── */
const sf = (id: string, x: Any = {}) => ({ id, clientId: `c-${id}`, date: '2026-12-12', status: 'confirmé', coveredBySub: true, coverKind: 'abonnement', ...x });
const pan = (id: string, x: Any = {}) => ({ id, apptId: id, clientId: `c-${id}`, date: '2026-12-12', etat: 'valide', ...x });
const att = P.attentionsAttendues(
  [sf('a'), sf('b'), sf('c', { sansConfirmation: true }), sf('d', { coveredBySub: false }), sf('e', { coverKind: 'forfait' }),
    sf('f', { status: 'annulé' }), sf('g'), sf('h'), sf('i'), sf('j')],
  [pan('a'), pan('b', { etat: 'propose' }), pan('c'), pan('d'), pan('e'), pan('f'), pan('g', { remiseLe: '2026-12-12T09:05:00Z' }),
    pan('h', { clientId: 'une-autre' }), pan('i', { date: '2026-12-19' })],
);
dit('I1 l attention attend une seance de formule dont le panier est valide (le juge ceQuElleLit)', true, att.has('a'));
dit('I2 ... pas un panier seulement propose', false, att.has('b'));
dit('I3 ... pas un rendez-vous pose sans confirmation : il garde le rappel d hier (garde-fou du 11 novembre 2026)', false, att.has('c'));
dit('I4 ... ni une seance hors formule, ni un forfait, ni une annulee', [false, false, false], [att.has('d'), att.has('e'), att.has('f')]);
dit('I5 ... ni un panier deja remis, ni celui d une autre tete ou d une autre date, ni une seance sans panier', [false, false, false, false],
  [att.has('g'), att.has('h'), att.has('i'), att.has('j')]);

const choisi = (o: Partial<Parameters<typeof P.rappelDeLaVeille>[0]>) => P.rappelDeLaVeille({
  modeleDuRappel: 'rappel_rdv', modeleAttention: 'rappel_rdv_attention', appel: 'Mme Awa', heure: '9 h', tetes: ['a'], attendues: new Set(['a']), ...o,
});
const CORPS_AWA = [{ type: 'body', parameters: [{ type: 'text', text: 'Mme Awa' }, { type: 'text', text: '9 h' }] }];
const r1 = choisi({});
dit('I6 secret pose et panier valide : le modele neuf, la phrase de l attention, le genre veille-attention',
  ['rappel_rdv_attention', 'Bonjour Mme Awa, votre rendez-vous est prévu demain à 9 h à la Maison MND. Une attention vous y attend.', 'veille-attention', true, CORPS_AWA],
  [r1.modele, r1.texteAuFil, r1.genre, r1.attention, r1.composants]);
dit('I7 ... le rappel d hier voyage en repli, mot pour mot, avec les memes variables',
  { modele: 'rappel_rdv', composants: CORPS_AWA, texteAuFil: 'Mme Awa, votre rendez-vous est demain à 9 h.' }, r1.repli ?? null);
dit('I8 sans le secret : le rappel d hier exactement, sans genre ni repli',
  { modele: 'rappel_rdv', texteAuFil: 'Mme Awa, votre rendez-vous est demain à 9 h.', composants: CORPS_AWA, attention: false }, choisi({ modeleAttention: '' }));
dit('I9 le rappel d un foyer ne dit l attention que si chaque tete nommee a la sienne', [false, true],
  [choisi({ tetes: ['a', 'b'], attendues: new Set(['a']) }).attention, choisi({ tetes: ['a', 'b'], attendues: new Set(['a', 'b']) }).attention]);
dit('I10 une tete sans panier : le rappel d hier', false, choisi({ attendues: new Set() }).attention);

/* ── I.2 pourquoi pas de message ── */
const SEANCE = { id: 'r3', clientId: 'cA', date: '2026-12-12', time: '09:00', status: 'honoré', coveredBySub: true, coverKind: 'abonnement' };
const pq = (o: Any = {}) => P.pourquoiPasDeProchaineSeance({ seance: SEANCE, rdvs: [], numero: '2290197000041', stop: false, modeleApprouve: true, jour: '2026-12-12', ...o });
const suite = (x: Any) => ({ id: 'r4', clientId: 'cA', date: '2027-01-09', time: '09:00', status: 'confirmé', ...x });
dit('I11 la seance de formule honoree du jour merite sa proposition ; celle de la veille aussi', [null, null], [pq(), pq({ jour: '2026-12-13' })]);
dit('I12 pas honoree, pas une formule, un forfait : rien', ['pas-honoree', 'pas-une-formule', 'un-forfait'],
  [pq({ seance: { ...SEANCE, status: 'confirmé' } }), pq({ seance: { ...SEANCE, coveredBySub: false } }), pq({ seance: { ...SEANCE, coverKind: 'forfait' } })]);
dit('I13 une seance marquee faite deux jours apres sa date (rattrapage) : rien', 'seance-ancienne', pq({ jour: '2026-12-14' }));
dit('I14 le modele non note approuve, sans numero, STOP : rien', ['modele-non-approuve', 'sans-numero', 'stop'],
  [pq({ modeleApprouve: false }), pq({ numero: '' }), pq({ stop: true })]);
dit('I15 un rendez-vous suivant deja pose : rien (le meme jour plus tard compte aussi)', ['deja-un-suivant', 'deja-un-suivant'],
  [pq({ rdvs: [suite({})] }), pq({ rdvs: [suite({ id: 'r5', date: '2026-12-12', time: '15:00' })] })]);
dit('I16 ... un suivant annule, honore, plus tot le meme jour, ou d une autre tete ne compte pas', [null, null, null, null],
  [pq({ rdvs: [suite({ status: 'annulé' })] }), pq({ rdvs: [suite({ status: 'honoré' })] }),
    pq({ rdvs: [suite({ date: '2026-12-12', time: '08:00' })] }), pq({ rdvs: [suite({ clientId: 'cB' })] })]);
dit('I17 le suivant est le plus proche', 'r4',
  P.leSuivant([suite({ id: 'r6', date: '2027-02-06' }), suite({ id: 'r4' }), suite({ id: 'rx', status: 'annulé', date: '2026-12-20' })], SEANCE)?.id ?? null);

/* ── I.3 la place proposée ── */
const jourDe = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const PLACES = ['09:00', '10:30', '14:00'];
const place = (o: Any = {}) => P.placeProposee({
  derniere: '2026-12-12', rythmeJours: 28, demain: '2026-12-13', jours: [6], heure: '09:00',
  estFerme: (iso: string) => jourDe(iso) === 0 || jourDe(iso) === 1, peutPorter: () => true, placesLibres: () => PLACES, ...o,
});
dit('I18 son jour et son heure, a son rythme : samedi 9 janvier 2027 a 9 h', { date: '2027-01-09', time: '09:00' }, place());
const dim = place({ jours: [0], rythmeJours: 29, estFerme: () => false });
dit('I19 jamais un dimanche, meme son jour favori, meme ouvert ce jour-la', ['2027-01-11', 1], [dim?.date ?? null, dim ? jourDe(dim.date) : null]);
dit('I20 un jour ferme saute : le samedi suivant', '2027-01-16', place({ estFerme: (iso: string) => iso === '2027-01-09' })?.date ?? null);
dit('I21 hors de la vie du contrat ou sur une lune non reglee (peutPorter du juge) : la date saute', '2027-01-16',
  place({ peutPorter: (iso: string) => iso >= '2027-01-16' })?.date ?? null);
dit('I22 rien de possible en quatre semaines : aucun message', null, place({ peutPorter: () => false }));
dit('I23 un jour complet saute', '2027-01-16', place({ placesLibres: (iso: string) => (iso === '2027-01-09' ? [] : PLACES) })?.date ?? null);
dit('I24 l heure libre la plus proche de la sienne', '10:30', place({ heure: '10:00' })?.time ?? null);
dit('I25 jamais avant demain, meme quand son rythme est depasse', '2026-12-19', place({ derniere: '2026-11-01' })?.date ?? null);
dit('I26 le rythme : sa fiche, ses venues, son carnet, sinon quatre semaines ; jamais moins de quatorze jours', [21, 35, 45, 28, 14],
  [P.rythmeDeLaProchaine({ rythmeSemaines: 3 }), P.rythmeDeLaProchaine({ cadenceJours: 35 }), P.rythmeDeLaProchaine({ carnet: { validiteJours: 270, seances: 6 } }),
    P.rythmeDeLaProchaine({}), P.rythmeDeLaProchaine({ rythmeSemaines: 1 })]);

/* ── I.4 la ligne, les boutons ── */
const PROPOSITION = { subId: 's1', serviceId: 'svc-venue', date: '2027-01-09', time: '09:00', clientId: 'cA' };
const ligneAwa = (maintenant = '2026-12-12T10:40:00Z') => P.ligneDeLaProchaineSeance({
  seance: { id: 'r3', branchId: 'm', clientId: 'cA', date: '2026-12-12' }, prenom: 'Awa', appel: 'Mme Awa', numero: '2290197000041',
  proposition: PROPOSITION, maintenantMs: Date.parse(maintenant), regles: { salleMin: 10, calmeDe: 20, calmeA: 8 },
}) as Any;
const L = ligneAwa();
dit('I27 la ligne : type et genre apres-seance, en salle dix minutes, la seance sous seanceId et jamais sous apptId, sans subId a la racine',
  ['prochaine-seance-r3', 'apres-seance', 'apres-seance', 'en-attente', '2026-12-12T10:50:00.000Z', 'r3', false, false, '2026-12-12', 'Mme Awa'],
  [L.id, L.type, L.genre, L.statut, L.partA, L.seanceId, 'apptId' in L, 'subId' in L, L.dateRdv, L.appel]);
dit('I28 ... la place proposee voyage sur la ligne, que « Oui » relit', PROPOSITION, L.proposition);
dit('I29 ... le colis : le modele prochaine_seance, l appel et le moment avec l annee, les deux boutons qui nomment la seance',
  ['prochaine_seance', '2290197000041', ['Mme Awa', 'samedi 9 janvier 2027 à 9 h'], ['PROCHAINE_OK:r3', 'PROCHAINE_AUTRE:r3'],
    'Merci, Mme Awa. Votre prochaine séance : samedi 9 janvier 2027 à 9 h ? [Oui, je réserve] [Une autre date]'],
  [L.colis.modele, L.colis.numero, L.colis.composants[0].parameters.map((p: Any) => p.text), L.colis.composants.slice(1).map((c: Any) => c.parameters[0].payload), L.colis.texteAuFil]);
dit('I30 honoree a 19 h 55 : la ligne attend la fin des heures calmes (8 h le lendemain)', ['2026-12-13T07:00:00.000Z', true],
  [ligneAwa('2026-12-12T18:55:00Z').partA, ligneAwa('2026-12-12T18:55:00Z').calme === true]);
dit('I31 les boutons se relisent ; un autre bouton, une seance mal formee : rien',
  [{ rdvId: 'r3', geste: 'oui' }, { rdvId: 'r3', geste: 'autre' }, null, null, null],
  [P.lisLeBoutonDeLaProchaineSeance('PROCHAINE_OK:r3'), P.lisLeBoutonDeLaProchaineSeance('PROCHAINE_AUTRE:r3'), P.lisLeBoutonDeLaProchaineSeance('REPRISE_OK:r3'),
    P.lisLeBoutonDeLaProchaineSeance('PROCHAINE_OK:../x'), P.lisLeBoutonDeLaProchaineSeance(undefined)]);
dit('I32 la proposition se relit sans confiance', [PROPOSITION, null, null, null],
  [P.propositionLisible(PROPOSITION), P.propositionLisible({ ...PROPOSITION, date: '9 janvier' }), P.propositionLisible({ ...PROPOSITION, subId: '' }), P.propositionLisible('x')]);

/* ── I.5 les mots, les fiches Meta ── */
const PHRASES = [
  P.phraseDeLaVeilleAvecAttention('Mme Awa', '9 h'), P.texteDeLaProchaineSeance('Mme Awa', 'samedi 9 janvier 2027 à 9 h'),
  P.reponseAuOui('Mme Awa', 'samedi 9 janvier 2027 à 9 h'), P.reponseDejaReservee('Mme Awa', 'samedi 9 janvier 2027 à 9 h'),
  P.reponseALAutreDate('Mme Awa'), P.reponseALaPlacePrise('Mme Awa'),
];
dit('I33 ce qu elle lit : ni tiret long, ni salon, ni maitre, ni tutoiement, ni D barre majuscule', [], PHRASES.flatMap(fautesDeLaMaison));
dit('I34 le lieu se dit « la Maison MND », jamais « la Maison » seule', [true, true, true, true, true],
  [PHRASES[0], PHRASES[2], PHRASES[3], PHRASES[4], PHRASES[5]].map((t) => /Maison MND/.test(t) && !/Maison(?! MND)/.test(t)));
dit('I35 « Oui » confirme pour le jour dit, avec l annee', 'C’est noté, Mme Awa : votre séance est confirmée pour le samedi 9 janvier 2027 à 9 h à la Maison MND.', PHRASES[2]);
const [FV, FP] = P.FICHES_DES_MODELES_DE_L_ABONNEE;
dit('I36 deux fiches : utilitaires, en francais, le pied est la devise de la Maison', [['rappel_rdv_attention', 'prochaine_seance'], ['UTILITY', 'UTILITY'], ['fr', 'fr'], [true, true]],
  [[FV.nom, FP.nom], [FV.categorie, FP.categorie], [FV.langue, FP.langue], [FV.pied === DEVISE_COMPLETE, FP.pied === DEVISE_COMPLETE]]);
dit('I37 le corps de chaque fiche est la phrase du code, variables {{1}} et {{2}}', [true, true],
  [FV.corps === P.phraseDeLaVeilleAvecAttention('{{1}}', '{{2}}'), FP.corps === P.texteDeLaProchaineSeance('{{1}}', '{{2}}')]);
dit('I38 les boutons : « Oui, je reserve » et « Une autre date », 25 signes au plus ; aucun bouton a la veille',
  [['Oui, je réserve', 'Une autre date'], true, []], [FP.boutons, FP.boutons.every((b) => [...b].length <= 25), FV.boutons]);
dit('I39 le secret de la veille est WA_TEMPLATE_RAPPEL_ATTENTION, et rappels-j1 lit bien ce nom ; la prochaine seance n a pas de secret',
  ['WA_TEMPLATE_RAPPEL_ATTENTION', true, undefined], [FV.secret, lis(RJ).includes("Deno.env.get('WA_TEMPLATE_RAPPEL_ATTENTION')"), FP.secret]);

/* ══ LA FAUSSE BASE (Trône et fonctions) ═══════════════════════════════ */
type Ligne = Record<string, Any>;
class Base {
  tables = new Map<string, Map<string, Ligne>>();
  lus: string[] = [];
  rpcs: { nom: string; args: Any }[] = [];
  rpc: Record<string, (args: Any) => Any> = {};
  table(t: string): Map<string, Ligne> { if (!this.tables.has(t)) this.tables.set(t, new Map()); return this.tables.get(t)!; }
  lignes(t: string): Ligne[] { return [...this.table(t).values()]; }
  pose(t: string, l: Ligne) { this.table(t).set(String(l.key ?? l.id), structuredClone(l)); }
  client() {
    return {
      from: (t: string) => new Requete(this, t),
      rpc: async (nom: string, args: Any = {}) => {
        this.rpcs.push({ nom, args: structuredClone(args) });
        const f = this.rpc[nom];
        return f ? { data: f(args), error: null } : { data: null, error: { message: `function ${nom} does not exist` } };
      },
      functions: { invoke: async () => ({ data: null, error: { message: 'absente du banc' } }) },
      storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: null, error: null }) }) },
    };
  }
}
function valeur(l: Ligne, col: string): string | null {
  const m = /^data((?:->[A-Za-z0-9_]+)*)->>([A-Za-z0-9_]+)$/.exec(col);
  let v: Any;
  if (!m) v = l[col];
  else {
    v = l.data;
    for (const k of m[1].split('->').filter(Boolean)) v = v?.[k];
    v = v?.[m[2]];
  }
  return v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
}
class Requete {
  filtres: ((l: Ligne) => boolean)[] = [];
  mode: 'select' | 'update' | 'upsert' | 'insert' | 'delete' = 'select';
  charge: Any = null;
  options: Any = {};
  rendre = false;
  plafond = Infinity;
  debut = 0;
  seule: 'non' | 'peut-etre' | 'une' = 'non';
  ordre: { c: string; asc: boolean } | null = null;
  constructor(private b: Base, private t: string) {}
  select(_c = '*') { if (this.mode !== 'select') this.rendre = true; else this.b.lus.push(this.t); return this; }
  eq(c: string, v: unknown) { this.filtres.push((l) => valeur(l, c) === String(v)); return this; }
  neq(c: string, v: unknown) { this.filtres.push((l) => valeur(l, c) !== String(v)); return this; }
  gt(c: string, v: unknown) { this.filtres.push((l) => (valeur(l, c) ?? '') > String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((l) => valeur(l, c) !== null && (valeur(l, c) as string) >= String(v)); return this; }
  lt(c: string, v: unknown) { this.filtres.push((l) => valeur(l, c) !== null && (valeur(l, c) as string) < String(v)); return this; }
  lte(c: string, v: unknown) { this.filtres.push((l) => valeur(l, c) !== null && (valeur(l, c) as string) <= String(v)); return this; }
  in(c: string, vs: unknown[]) { const s = new Set((vs ?? []).map(String)); this.filtres.push((l) => s.has(String(valeur(l, c)))); return this; }
  is(c: string, v: unknown) { this.filtres.push((l) => (v === null ? valeur(l, c) === null : valeur(l, c) === String(v))); return this; }
  not(c: string, op: string, v: unknown) { if (op === 'is') this.filtres.push((l) => (v === null ? valeur(l, c) !== null : valeur(l, c) !== String(v))); return this; }
  or(_txt: string) { return this; }
  like(c: string, motif: string) { const re = new RegExp(`^${motif.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`); this.filtres.push((l) => re.test(valeur(l, c) ?? '')); return this; }
  ilike(c: string, motif: string) { return this.like(c, motif); }
  order(c: string, o: Any = {}) { this.ordre = { c, asc: o.ascending !== false }; return this; }
  limit(k: number) { this.plafond = k; return this; }
  range(a: number, z: number) { this.debut = a; this.plafond = z - a + 1; return this; }
  maybeSingle() { this.seule = 'peut-etre'; return this; }
  single() { this.seule = 'une'; return this; }
  update(d: Any) { this.mode = 'update'; this.charge = d; return this; }
  upsert(d: Any, o: Any = {}) { this.mode = 'upsert'; this.charge = d; this.options = o; return this; }
  insert(d: Any) { this.mode = 'insert'; this.charge = d; return this; }
  delete() { this.mode = 'delete'; return this; }
  private execute(): { data: Any; error: Any } {
    const t = this.b.table(this.t);
    const cleDe = (l: Ligne) => String(this.options.onConflict ? l[this.options.onConflict] : (l.key ?? l.id));
    if (this.mode === 'insert' || this.mode === 'upsert') {
      const ecrites: Ligne[] = [];
      for (const brut of ([] as Ligne[]).concat(this.charge)) {
        const l = { ...structuredClone(brut), updated_at: new Date().toISOString() };
        const k = cleDe(l);
        if (t.has(k)) {
          if (this.mode === 'insert') return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          if (this.options.ignoreDuplicates) continue;
        }
        t.set(k, l);
        ecrites.push(l);
      }
      return { data: this.rendre ? ecrites.map((l) => structuredClone(l)) : null, error: null };
    }
    let vues = [...t.values()].filter((l) => this.filtres.every((f) => f(l)));
    if (this.mode === 'update') {
      for (const l of vues) Object.assign(l, structuredClone(this.charge));
      return { data: this.rendre ? vues.map((l) => structuredClone(l)) : null, error: null };
    }
    if (this.mode === 'delete') { for (const l of vues) t.delete(cleDe(l)); return { data: null, error: null }; }
    if (this.ordre) {
      const { c, asc } = this.ordre;
      vues = vues.sort((x, y) => (String(valeur(x, c)) < String(valeur(y, c)) ? -1 : 1) * (asc ? 1 : -1));
    }
    const data = vues.slice(this.debut, this.debut + this.plafond).map((l) => structuredClone(l));
    if (this.seule === 'peut-etre') return { data: data[0] ?? null, error: null };
    if (this.seule === 'une') return data[0] ? { data: data[0], error: null } : { data: null, error: { message: 'aucune ligne' } };
    return { data, error: null };
  }
  then(ok: (r: Any) => unknown, ko2?: (e: unknown) => unknown) {
    try { return Promise.resolve(this.execute()).then(ok, ko2); } catch (e) { return Promise.reject(e).then(ok, ko2); }
  }
}

/* L'horloge du banc : `new Date()` et `Date.now()` disent l'instant choisi. */
const VraieDate = Date;
let MAINTENANT = VraieDate.parse('2026-12-12T10:40:00Z');
class DateDuBanc extends VraieDate {
  constructor(...a: unknown[]) {
    if (a.length === 0) super(MAINTENANT);
    else super(...(a as [string]));
  }
  static now() { return MAINTENANT; }
}
(globalThis as Any).Date = DateDuBanc;
const a = (iso: string) => { MAINTENANT = VraieDate.parse(iso); };
const iso = (ms: number) => new VraieDate(ms).toISOString();

/* ══ II. LE VRAI DÉPÔT DU TRÔNE ═════════════════════════════════════════ */
console.warn = () => {};
const NUM_AWA = '+229 01 97 00 00 41';
const WA_AWA = '2290197000041';
const NUM_PARENT = '+229 01 66 00 00 07';
const NUM_ESSAI = '+229 01 55 00 00 09';
const HEURES = [
  { key: 'lun', label: 'Lundi', open: '09h00', close: '19h00', closed: true },
  { key: 'mar', label: 'Mardi', open: '09h00', close: '19h00', closed: false },
  { key: 'mer', label: 'Mercredi', open: '09h00', close: '19h00', closed: false },
  { key: 'jeu', label: 'Jeudi', open: '09h00', close: '19h00', closed: false },
  { key: 'ven', label: 'Vendredi', open: '09h00', close: '19h00', closed: false },
  { key: 'sam', label: 'Samedi', open: '09h00', close: '18h00', closed: false },
  { key: 'dim', label: 'Dimanche', open: '10h00', close: '16h00', closed: true },
];
const CARNET = { id: 'pl6', name: 'GBÈJÍ™ · Carnet de Six', tag: '', priceXof: 140000, line: '', perks: [], popular: false, included: [{ serviceId: 'svc-venue', qty: 6 }], mode: 'pack', validityDays: 270 };
const LUNE = { id: 'pl-lune', name: 'GBÈJÍ™ · Chaque Lune', tag: '', priceXof: 30000, line: '', perks: [], popular: false, included: [{ serviceId: 'svc-venue', qty: 1 }], mode: 'cycle' };
const contrat = (x: Any = {}) => ({
  id: 's1', branchId: 'm', clientId: 'cA', name: 'A. B.', planId: 'pl6', slot: '', nextIso: '2026-11-01', since: '', sinceIso: '2026-10-02', startIso: '2026-10-02',
  expiresIso: '2027-06-29', status: 'active', reference: 'ABO-2026-041', mrrXof: 0, priceXof: 140000, prixConvenuXof: 140000,
  payments: [{ id: 'p', date: '2026-10-02', amountXof: 140000 }], ...x,
});
const rdvT = (id: string, date: string, status: string, x: Any = {}) => ({
  id, branchId: 'm', clientId: 'cA', clientName: 'Awa Banc', serviceIds: ['svc-venue'], date, time: '09:00', master: '', status,
  coveredBySub: true, subId: 's1', coverKind: 'abonnement', ...x,
});
const AWA = { id: 'cA', name: 'Awa Banc', civilite: 'madame', phone: NUM_AWA, phone2: '+229 01 44 00 00 03', branchId: 'm', joursPreferes: [6], rythmeSemaines: 4 };
const baseDuTrone = new Base();
(globalThis as Any).__baseDuTrone = baseDuTrone.client();
type Scene = { appts?: Any[]; fiches?: Any[]; subs?: Any[]; plans?: Any[]; heures?: Any[]; approuve?: boolean; facteurVuIlYA?: number; maintenant?: string };
function scene(o: Scene = {}) {
  const maintenant = o.maintenant ?? '2026-12-12T10:40:00Z';
  a(maintenant);
  baseDuTrone.tables = new Map();
  baseDuTrone.pose('documents', { key: 'mnd_facteur', data: { vuLe: iso(MAINTENANT - (o.facteurVuIlYA ?? 60_000)) } });
  settingsStore.set((s: Any) => ({ ...s, hours: o.heures ?? HEURES }));
  exceptionsHorairesStore.set([]);
  branchesStore.set([{ id: 'm', name: 'Maison', city: 'Cotonou', country: 'Bénin', dial: '+229', currency: 'XOF', address: '', seats: 2 }] as Any);
  servicesStore.set([{ id: 'svc-venue', name: 'Venue GBÈJÍ', durationMin: 60, priceXof: 28000 }] as Any);
  blocagesStore.set([] as Any);
  invoicesStore.set([] as Any);
  plansStore.set((o.plans ?? [CARNET]) as Any);
  subscribersStore.set((o.subs ?? [contrat()]) as Any);
  clientsStore.set((o.fiches ?? [AWA]) as Any);
  appointmentsStore.set((o.appts ?? [rdvT('f1', '2026-10-17', 'honoré'), rdvT('f2', '2026-11-14', 'honoré'), rdvT('r3', '2026-12-12', 'honoré')]) as Any);
  modelesMetaStore.set({ modeles: o.approuve === false ? {} : { prochaine_seance: { etat: 'approuve' } } } as Any);
  return { depose: (id = 'r3') => deposeLaProchaineSeance(id, { maintenantMs: MAINTENANT }) };
}
const deposees = () => baseDuTrone.lignes('envois').map((l) => l.data);

{
  const issue = await scene().depose();
  const l = deposees()[0] ?? {};
  dit('II1 le Trone depose la prochaine seance en salle, une ligne', ['depose', 1], [issue, deposees().length]);
  dit('II2 ... samedi 9 janvier 2027 a 9 h : son jour, son heure, son rythme, dans son carnet', { ...PROPOSITION }, l.proposition);
  dit('II3 ... au numero de sa fiche, « Mme Awa », en attente dix minutes, sans apptId', [WA_AWA, 'Mme Awa', 'en-attente', '2026-12-12T10:50:00.000Z', false],
    [l.colis?.numero, l.appel, l.statut, l.partA, 'apptId' in l]);
  dit('II4 la meme seance honoree une seconde fois (un autre poste, un autre chemin) ne depose rien de plus', ['deja', 1],
    [await deposeLaProchaineSeance('r3', { maintenantMs: MAINTENANT }), deposees().length]);
}
{
  const s = scene({ approuve: false });
  dit('II5 modele jamais note approuve : rien ne se depose', ['modele-non-approuve', 0], [await s.depose(), deposees().length]);
  const m = scene({ facteurVuIlYA: 20 * 60_000 });
  dit('II6 facteur muet : rien ne part en direct, rien ne se depose', ['facteur-muet', 0], [await m.depose(), deposees().length]);
}
{
  const s = scene({ appts: [rdvT('f1', '2026-10-17', 'honoré'), rdvT('f2', '2026-11-14', 'honoré'), rdvT('r3', '2026-12-12', 'honoré'), rdvT('r4', '2027-01-16', 'confirmé')] });
  dit('II7 un rendez-vous suivant deja pose : pas de message', ['deja-un-suivant', 0], [await s.depose(), deposees().length]);
}
{
  const s = scene({ subs: [contrat({ expiresIso: '2027-01-05' })] });
  dit('II8 le carnet finit avant la date attendue : aucune date dans la vie du contrat, pas de message', ['aucune-date', 0], [await s.depose(), deposees().length]);
}
{
  const lune = (nextIso: string) => scene({
    plans: [LUNE], subs: [contrat({ planId: 'pl-lune', cycle: 'mensuel', nextIso, expiresIso: undefined, priceXof: 30000, prixConvenuXof: 30000, payments: [{ id: 'p', date: '2026-10-02', amountXof: 30000 }] })],
  });
  dit('II9 Chaque Lune reglee jusqu au 1er janvier 2027 : le 9 janvier n est pas sur une lune reglee, pas de message', 'aucune-date', await lune('2027-01-01').depose());
  const ok = await lune('2027-02-01').depose();
  dit('II10 ... reglee jusqu au 1er fevrier 2027 : samedi 9 janvier 2027 se propose', ['depose', '2027-01-09'], [ok, deposees()[0]?.proposition?.date ?? null]);
}
{
  /* Quatre semaines après le dimanche 13 décembre 2026 : le dimanche 10 janvier 2027, son jour, la Maison ouverte. */
  const s = scene({ fiches: [{ ...AWA, joursPreferes: [0], rythmeSemaines: 4 }], heures: HEURES.map((h) => (h.key === 'dim' ? { ...h, closed: false } : h)),
    appts: [rdvT('f1', '2026-10-18', 'honoré'), rdvT('r3', '2026-12-13', 'honoré')], maintenant: '2026-12-13T10:40:00Z' });
  await s.depose();
  const d = deposees()[0]?.proposition?.date ?? '';
  dit('II11 son jour favori est le dimanche, la Maison ouverte ce jour-la : jamais un dimanche, le premier jour ouvert d apres (mardi 12 janvier 2027)',
    ['2027-01-12', 2], [d, d ? jourDe(d) : null]);
}
{
  const s = scene({ appts: [rdvT('f1', '2026-10-17', 'honoré', { time: '08:00' }), rdvT('f2', '2026-11-14', 'honoré', { time: '08:00' }), rdvT('r3', '2026-12-12', 'honoré', { time: '08:00' })] });
  await s.depose();
  dit('II12 venue d habitude a 8 h, le samedi ouvre a 9 h : jamais avant l ouverture', '09:00', deposees()[0]?.proposition?.time ?? null);
}
{
  const s = scene({ maintenant: '2026-12-14T10:40:00Z' });
  dit('II13 une seance du 12 marquee faite le 14 : rattrapage, pas de message', ['seance-ancienne', 0], [await s.depose(), deposees().length]);
}
{
  const ESSAI = { id: 'cE', name: 'Essai Banc', civilite: 'madame', phone: NUM_ESSAI, essai: true, branchId: 'm', joursPreferes: [6] };
  const s = scene({ fiches: [AWA, ESSAI], subs: [contrat({ id: 's9', clientId: 'cE' })],
    appts: [rdvT('e1', '2026-12-12', 'honoré', { clientId: 'cE', clientName: 'Essai Banc', subId: 's9' })] });
  await s.depose('e1');
  const l = deposees()[0] ?? {};
  dit('II14 FICHE D ESSAI (garde-fou) : le message va a SON numero, a sa fiche, jamais a une autre cliente', ['2290155000009', 'cE', 's9'],
    [l.colis?.numero ?? null, l.clientId ?? null, l.proposition?.subId ?? null]);
}
{
  const s = scene({ appts: [rdvT('f1', '2026-10-17', 'honoré'), rdvT('r3', '2026-12-12', 'honoré', { numeroAPrevenir: NUM_PARENT })] });
  await s.depose();
  dit('II15 le numero a prevenir de la seance (le parent d une enfant) l emporte, comme le rappel de la veille', '2290166000007', deposees()[0]?.colis?.numero ?? null);
  const t = scene({ fiches: [{ ...AWA, phone: '' }] });
  dit('II16 une fiche sans premier numero : rien, le second numero (peut-etre celui d une autre personne) n est jamais pris', ['sans-numero', 0], [await t.depose(), deposees().length]);
}

/* ══ III. LES VRAIES FONCTIONS : rappels-j1 PUIS envois-partent ═════════ */
const base = new Base();
const ENV: Record<string, string | undefined> = {
  SUPABASE_URL: 'http://faux.local', SUPABASE_SERVICE_ROLE_KEY: 'le-secret-de-la-plateforme', CLE_SERVICE: 'la-cle-de-la-maison',
  WA_TOKEN: 'jeton-meta-de-banc', WA_PHONE_ID: '1234', WA_APP_SECRET: 'secret-de-l-app', VAPID_PUBLIC: 'pub', VAPID_PRIVATE: 'priv',
};
const SERVIS: ((req: Request) => Promise<Response>)[] = [];
type Meta = { modele?: string; to: string; corps: string[]; boutons: string[]; texte?: string };
let META: Meta[] = [];
let REFUS_DU_MODELE = '';
let META_MUET = false;
let POUSSES: Any[] = [];
(globalThis as Any).__faux = {
  client: () => base.client(),
  webpush: { setVapidDetails() {}, async sendNotification(_s: Any, charge: string) { POUSSES.push(JSON.parse(charge)); return {}; } },
};
(globalThis as Any).Deno = { env: { get: (k: string) => ENV[k] }, serve: (h: Any) => { SERVIS.push(h); } };
let numeroWa = 0;
(globalThis as Any).fetch = async (url: string, init?: { body?: string }) => {
  const u = String(url);
  if (u.includes('graph.facebook.com') && u.endsWith('/messages')) {
    const corps = JSON.parse(String(init?.body ?? '{}'));
    const body = (corps.template?.components ?? []).find((c: Any) => c.type === 'body');
    const modele = corps.template?.name;
    if (META_MUET) return new Response(JSON.stringify({ error: { message: 'panne de Meta' } }), { status: 500 });
    if (modele && modele === REFUS_DU_MODELE) return new Response(JSON.stringify({ error: { code: 132001, message: 'Template name does not exist in the translation' } }), { status: 400 });
    META.push({
      modele, to: String(corps.to ?? ''), corps: (body?.parameters ?? []).map((p: Any) => p.text),
      boutons: (corps.template?.components ?? []).filter((c: Any) => c.type === 'button').map((c: Any) => c.parameters?.[0]?.payload), texte: corps.text?.body,
    });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.banc${++numeroWa}` }] }), { status: 200 });
  }
  if (u.includes('graph.facebook.com')) return new Response(JSON.stringify({}), { status: 200 });
  return new Response(JSON.stringify({ pris: false, sent: 0 }), { status: 200 });
};
console.error = () => {};
console.warn = () => {};
const vraiLog = console.log.bind(console);
console.log = (...x: Any[]) => { const t = x.map(String).join(' '); if (/^(OK|ECHEC)\b/.test(t)) vraiLog(...x); };

await import('../supabase/functions/rappels-j1/index.ts');
await import('../supabase/functions/envois-partent/index.ts');
await import('../supabase/functions/whatsapp-webhook/index.ts');
const [servirRappels, servirFacteur, servirWebhook] = SERVIS;
const appelle = async (h: (req: Request) => Promise<Response>) =>
  (await h(new Request('http://faux.local/', { method: 'POST', headers: { authorization: `Bearer ${ENV.CLE_SERVICE}` } }))).json();
const rappels = () => appelle(servirRappels);
const facteur = () => appelle(servirFacteur);
const passeLaSalle = async () => { a(iso(MAINTENANT + 11 * 60_000)); await facteur(); };

const fiche = (id: string, nom: string, numero: string, x: Any = {}) => ({ id, data: { name: nom, civilite: 'madame', phone: numero, branchId: 'm', ...x } });
const rdvJ1 = (id: string, clientId: string, nom: string, x: Any = {}) => ({
  id, branch_id: 'm', data: { id, branchId: 'm', clientId, clientName: nom, date: '2026-12-12', time: '09:00', status: 'confirmé', source: 'trone', serviceIds: ['svc-venue'], creeLe: '2026-11-30T09:00:00Z', ...x },
});
const FORMULE = { coveredBySub: true, coverKind: 'abonnement', subId: 's1' };
const panier = (id: string, clientId: string, etat = 'valide') => ({ id, data: { id, apptId: id, clientId, date: '2026-12-12', etat } });
const NUMS = { awa: '+229 01 97 00 00 41', bea: '+229 01 97 00 00 42', chloe: '+229 01 97 00 00 43', dina: '+229 01 97 00 00 44', essai: NUM_ESSAI, foyer: '+229 01 97 00 00 46' };
const wa = (n: string) => n.replace(/\D/g, '');
function laVeille(o: { secret: boolean; facteurVivant?: boolean }) {
  base.tables = new Map();
  base.lus = [];
  META = []; REFUS_DU_MODELE = ''; META_MUET = false;
  ENV.WA_TEMPLATE_RAPPEL_ATTENTION = o.secret ? 'rappel_rdv_attention' : undefined;
  a('2026-12-11T17:05:00Z');
  for (const f of [fiche('cA', 'Awa Banc', NUMS.awa), fiche('cB', 'Bea Banc', NUMS.bea), fiche('cC', 'Chloé Banc', NUMS.chloe), fiche('cD', 'Dina Banc', NUMS.dina),
    fiche('cE', 'Essai Banc', NUMS.essai, { essai: true }), fiche('cF', 'Fifa Banc', NUMS.foyer), fiche('cG', 'Gina Banc', NUMS.foyer)]) base.pose('clients', f);
  for (const r of [
    rdvJ1('t1', 'cA', 'Awa Banc', FORMULE),
    rdvJ1('t2', 'cB', 'Bea Banc', FORMULE),
    rdvJ1('t3', 'cC', 'Chloé Banc', { ...FORMULE, sansConfirmation: true }),
    rdvJ1('t4', 'cD', 'Dina Banc', { sansConfirmation: true, time: '11:00', momentEnTrois: { planId: 'mt-banc', rang: 2 } }),
    rdvJ1('t5', 'cE', 'Essai Banc', FORMULE),
    rdvJ1('t6', 'cF', 'Fifa Banc', { ...FORMULE, foyerId: 'fo-b', time: '10:00' }),
    rdvJ1('t7', 'cG', 'Gina Banc', { ...FORMULE, foyerId: 'fo-b', time: '10:00' }),
  ]) base.pose('appointments', r);
  for (const p of [panier('t1', 'cA'), panier('t2', 'cB', 'propose'), panier('t3', 'cC'), panier('t5', 'cE'), panier('t6', 'cF')]) base.pose('attention_paniers', p);
  if (o.facteurVivant !== false) base.pose('documents', { key: 'mnd_facteur', data: { vuLe: iso(MAINTENANT - 60_000) } });
}
const ligneJ1 = (id: string) => base.table('envois').get(`env-${id}-whatsapp`)?.data ?? null;
const vers = (n: string) => META.filter((m) => m.to === wa(n));

{
  laVeille({ secret: true });
  await rappels();
  const l1 = ligneJ1('t1');
  dit('III1 secret pose, seance de formule au panier valide : la veille dit l attention, EN SALLE, sous la ligne rappel-j1 de genre veille-attention',
    ['rappel-j1', 'veille-attention', 'en-attente', 'rappel_rdv_attention', 'Bonjour Mme Awa, votre rendez-vous est prévu demain à 9 h à la Maison MND. Une attention vous y attend.'],
    [l1?.type, l1?.genre, l1?.statut, l1?.colis?.modele, l1?.colis?.texteAuFil]);
  dit('III2 ... le rappel d hier voyage en repli dans le colis', { modele: 'rappel_rdv', texteAuFil: 'Mme Awa, votre rendez-vous est demain à 9 h.' },
    { modele: l1?.colis?.repli?.modele, texteAuFil: l1?.colis?.repli?.texteAuFil });
  dit('III3 un panier seulement propose : le rappel d hier, sans genre', ['rappel_rdv', undefined], [ligneJ1('t2')?.colis?.modele, ligneJ1('t2')?.genre]);
  dit('III4 SANS CONFIRMATION (garde-fou) : une seance de formule au panier valide garde le rappel d hier, mot pour mot', ['rappel_rdv', 'Mme Chloé, votre rendez-vous est demain à 9 h.', undefined, undefined],
    [ligneJ1('t3')?.colis?.modele, ligneJ1('t3')?.colis?.texteAuFil, ligneJ1('t3')?.genre, ligneJ1('t3')?.colis?.repli]);
  dit('III5 ... une venue du Moment posee sans confirmation : son rappel d hier, comme avant', ['en-attente', 'rappel_rdv', 'Mme Dina, votre rendez-vous est demain à 11 h.'],
    [ligneJ1('t4')?.statut, ligneJ1('t4')?.colis?.modele, ligneJ1('t4')?.colis?.texteAuFil]);
  dit('III6 FICHE D ESSAI (garde-fou) : la veille part a son numero a elle, jamais ailleurs', [wa(NUMS.essai), 'cE', 'rappel_rdv_attention'],
    [ligneJ1('t5')?.colis?.numero, ligneJ1('t5')?.clientId, ligneJ1('t5')?.colis?.modele]);
  const foyer = ligneJ1('t6') ?? ligneJ1('t7');
  dit('III7 le foyer dont une tete seulement a son attention : un rappel, celui d hier', ['rappel_rdv', undefined], [foyer?.colis?.modele, foyer?.genre]);
  dit('III8 rien ne part en direct : tout attend en salle', [0, true], [META.length, ['t1', 't2', 't3', 't4', 't5'].every((id) => ligneJ1(id)?.statut === 'en-attente')]);
  await passeLaSalle();
  dit('III9 le facteur porte la veille avec l attention : le modele neuf, l appel et l heure', [['rappel_rdv_attention', ['Mme Awa', '9 h']]],
    vers(NUMS.awa).map((m) => [m.modele, m.corps]));
  dit('III10 ... et le rappel d hier aux autres, une fois chacune', [1, 'rappel_rdv', 1, 'rappel_rdv', 1, 'rappel_rdv'],
    [vers(NUMS.bea).length, vers(NUMS.bea)[0]?.modele, vers(NUMS.chloe).length, vers(NUMS.chloe)[0]?.modele, vers(NUMS.dina).length, vers(NUMS.dina)[0]?.modele]);
  dit('III11 la fiche d essai recoit SON message, a son numero', [['rappel_rdv_attention', wa(NUMS.essai)]], vers(NUMS.essai).map((m) => [m.modele, m.to]));
}
{
  laVeille({ secret: true });
  await rappels();
  REFUS_DU_MODELE = 'rappel_rdv_attention';
  await passeLaSalle();
  dit('III12 Meta refuse le modele neuf (#132001) : le rappel d hier part a sa place, dans la meme minute', [['rappel_rdv', ['Mme Awa', '9 h']]],
    vers(NUMS.awa).map((m) => [m.modele, m.corps]));
}
{
  laVeille({ secret: false });
  await rappels();
  dit('III13 sans le secret : aucun panier lu, la veille d hier pour toutes, sans genre', [false, 'rappel_rdv', undefined, 'Mme Awa, votre rendez-vous est demain à 9 h.'],
    [base.lus.includes('attention_paniers'), ligneJ1('t1')?.colis?.modele, ligneJ1('t1')?.genre, ligneJ1('t1')?.colis?.texteAuFil]);
}
{
  laVeille({ secret: true, facteurVivant: false });
  await rappels();
  dit('III14 FACTEUR MUET : rappels-j1 envoie lui-meme comme avant, le rappel d hier, jamais l attention (rien du lot 4 hors de la salle)',
    [['rappel_rdv', ['Mme Awa', '9 h']]], vers(NUMS.awa).map((m) => [m.modele, m.corps]));
  dit('III15 ... sa ligne ne se dit pas veille-attention', [undefined, 'envoyé'], [ligneJ1('t1')?.genre, ligneJ1('t1')?.statut]);
}

/* ══ IV. LE DÉPART D'UNE PROCHAINE SÉANCE (envois-partent) ═════════════ */
const enSalle = (id: string, x: Any = {}) => {
  const l = P.ligneDeLaProchaineSeance({
    seance: { id, branchId: 'm', clientId: 'cA', date: '2026-12-12' }, prenom: 'Awa', appel: 'Mme Awa', numero: WA_AWA,
    proposition: PROPOSITION, maintenantMs: MAINTENANT - 11 * 60_000, regles: { salleMin: 10, calmeDe: 20, calmeA: 8 },
  }) as Any;
  base.pose('envois', { id: l.id, branch_id: 'm', data: { ...l, ...x } });
  return l.id as string;
};
function apresLaSeance(rdvs: Any[]) {
  base.tables = new Map();
  META = []; REFUS_DU_MODELE = ''; META_MUET = false;
  a('2026-12-12T11:00:00Z');
  base.pose('clients', fiche('cA', 'Awa Banc', NUMS.awa));
  for (const r of rdvs) base.pose('appointments', { id: r.id, branch_id: 'm', data: r });
}
{
  apresLaSeance([rdvT('r3', '2026-12-12', 'honoré')]);
  const id = enSalle('r3');
  await facteur();
  dit('IV1 sans suite posee : le facteur porte « Merci, Mme Awa » avec ses deux boutons', ['envoyé', 1, 'prochaine_seance', ['Mme Awa', 'samedi 9 janvier 2027 à 9 h'], ['PROCHAINE_OK:r3', 'PROCHAINE_AUTRE:r3']],
    [base.table('envois').get(id)?.data?.statut, META.length, META[0]?.modele, META[0]?.corps, META[0]?.boutons]);
}
{
  apresLaSeance([rdvT('r3', '2026-12-12', 'honoré'), rdvT('r4', '2027-01-16', 'confirmé', { sansConfirmation: true })]);
  const id = enSalle('r3');
  await facteur();
  const l = base.table('envois').get(id)?.data;
  dit('IV2 la carte « Son prochain rituel » a pose la suite pendant les dix minutes : rien ne part', ['périmé', 0, true],
    [l?.statut, META.length, /suivant est déjà posé/.test(String(l?.detail ?? ''))]);
}
{
  apresLaSeance([rdvT('r3', '2026-12-12', 'honoré'), rdvT('r4', '2027-01-16', 'annulé')]);
  enSalle('r3');
  await facteur();
  dit('IV3 une suite annulee ne tait rien', 1, META.length);
}
{
  apresLaSeance([rdvT('r3', '2026-12-12', 'confirmé')]);
  const id = enSalle('r3');
  await facteur();
  dit('IV4 la seance n est plus marquee faite : rien ne part', ['périmé', 0], [base.table('envois').get(id)?.data?.statut, META.length]);
}

/* ══ V. LES BOUTONS (whatsapp-webhook) ═════════════════════════════════ */
const FICHE_WA = { id: 'cA', nom: 'Awa Banc', civilite: 'madame', branchId: 'm', numeros: [WA_AWA] };
let posees = 0;
function lesBoutons(o: { rdvs?: Any[]; place?: 'libre' | 'prise'; numeroDuColis?: string; reponse?: Any } = {}) {
  base.tables = new Map();
  META = []; REFUS_DU_MODELE = ''; META_MUET = false; POUSSES = [];
  base.rpcs = [];
  a('2026-12-12T12:00:00Z');
  for (const r of o.rdvs ?? [rdvT('r3', '2026-12-12', 'honoré')]) base.pose('appointments', { id: r.id, branch_id: 'm', data: r });
  base.pose('staff', { id: 'st-1', user_id: 'u-dir', role: 'souverain' });
  base.pose('push_subscriptions', { id: 'ps-1', client_id: 'u-dir', endpoint: 'https://push.banc/1', p256dh: 'x', auth: 'y' });
  const id = enSalle('r3');
  const l = base.table('envois').get(id)!;
  l.data = { ...l.data, statut: 'envoyé', ...(o.reponse ? { reponse: o.reponse } : {}), colis: { ...l.data.colis, numero: o.numeroDuColis ?? WA_AWA } };
  base.rpc = {
    fiches_du_numero: ({ n }: Any) => (String(n).replace(/\D/g, '').endsWith('97000041') ? [FICHE_WA] : []),
    tete_du_numero: () => ({ tiroir: 'clientes' }),
    tiroir_du_numero: () => 'clientes',
    /* LE JUMEAU DE 0198 : il pose la séance et la ligne de confirmation, sous le même verrou. */
    reserver_une_seance_incluse_par_la_maison: (args: Any) => {
      if (o.place === 'prise') return { ok: false, raison: 'deja_pose' };
      const apptId = `rdv-banc-${++posees}`;
      base.pose('appointments', { id: apptId, branch_id: 'm', data: { id: apptId, clientId: args.p_client_id, date: args.p_date, time: args.p_time, status: 'confirmé', coveredBySub: true, subId: args.p_sub_id, source: args.p_source } });
      if (args.p_envoi && typeof args.p_envoi === 'object') {
        base.pose('envois', { id: `conf-${apptId}-whatsapp`, branch_id: 'm', data: { ...args.p_envoi, id: `conf-${apptId}-whatsapp`, apptId } });
      }
      return { ok: true, apptId, etat: 'confirmee' };
    },
  };
  return id;
}
const touche = async (payload: string, de = WA_AWA, id = 'wamid.in-1') => {
  const corps = JSON.stringify({ entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: '1234' }, contacts: [{ wa_id: de, profile: { name: 'Awa' } }],
    messages: [{ id, from: de, timestamp: String(Math.floor(MAINTENANT / 1000)), type: 'button', button: { payload, text: payload.startsWith('PROCHAINE_OK') ? 'Oui, je réserve' : 'Une autre date' } }],
  } }] }] });
  const sig = createHmac('sha256', String(ENV.WA_APP_SECRET)).update(corps).digest('hex');
  return servirWebhook(new Request('http://faux.local/functions/v1/whatsapp-webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${sig}` }, body: corps,
  }));
};
const poses = () => base.rpcs.filter((r) => r.nom === 'reserver_une_seance_incluse_par_la_maison');
const textes = () => META.filter((m) => m.texte).map((m) => m.texte);
{
  const id = lesBoutons();
  await touche('PROCHAINE_OK:r3');
  const rpc = poses()[0]?.args ?? {};
  dit('V1 « Oui, je reserve » : 0198 pose la place proposee, couverte par sa formule, pour elle, depuis WhatsApp', [1, 'cA', 's1', 'svc-venue', '2027-01-09', '09:00', 'whatsapp'],
    [poses().length, rpc.p_client_id, rpc.p_sub_id, rpc.p_service_id, rpc.p_date, rpc.p_time, rpc.p_source]);
  dit('V2 ... la ligne de confirmation voyage avec la pose, « en cours » (elle tait le modele de confirmation-rdv)', ['confirmation', 'en cours', 'whatsapp'],
    [rpc.p_envoi?.type, rpc.p_envoi?.statut, rpc.p_envoi?.canal]);
  dit('V3 ... une phrase, sa confirmation, au numero qui a touche', [['C’est noté, Mme Awa : votre séance est confirmée pour le samedi 9 janvier 2027 à 9 h à la Maison MND.'], [WA_AWA]],
    [textes(), META.filter((m) => m.texte).map((m) => m.to)]);
  const conf = base.lignes('envois').find((l) => /^conf-rdv-banc-\d+-whatsapp$/.test(l.id))?.data;
  dit('V4 ... la phrase partie, la ligne de confirmation passe « envoye » : une seance, une seule confirmation', ['envoyé', true], [conf?.statut, !!conf?.waMessageId]);
  dit('V5 ... la reponse s ecrit sur la ligne de la prochaine seance', ['oui', true], [base.table('envois').get(id)?.data?.reponse?.geste, !!base.table('envois').get(id)?.data?.reponse?.apptId]);
  await touche('PROCHAINE_OK:r3', WA_AWA, 'wamid.in-2');
  dit('V6 un second toucher ne pose rien de plus', 1, poses().length);
}
{
  lesBoutons();
  META_MUET = true;
  await touche('PROCHAINE_OK:r3');
  const conf = base.lignes('envois').find((l) => /^conf-rdv-banc-\d+-whatsapp$/.test(l.id))?.data;
  dit('V7 la phrase ne part pas (Meta en panne) : la ligne de confirmation passe « echec », le modele de confirmation-rdv reprend la main', 'échec', conf?.statut ?? null);
}
{
  const id = lesBoutons();
  await touche('PROCHAINE_AUTRE:r3');
  dit('V8 « Une autre date » : rien ne se pose, la main passe, elle est invitee a dire son jour', [0, ['Bien sûr, Mme Awa. Dites-nous ici le jour qui vous va : la Maison MND vous propose une heure.'], 'autre'],
    [poses().length, textes(), base.table('envois').get(id)?.data?.reponse?.geste]);
  dit('V9 ... l equipe est prevenue par son prenom, jamais par un texte', ['Awa souhaite une autre date'], POUSSES.map((p) => p.title ?? p.titre));
}
{
  const id = lesBoutons({ rdvs: [rdvT('r3', '2026-12-12', 'honoré'), rdvT('r4', '2027-01-16', 'confirmé')] });
  await touche('PROCHAINE_OK:r3');
  dit('V10 une suite deja posee depuis le message : « Oui » ne pose pas une seconde seance, elle lit la date qu elle a',
    [0, ['C’est déjà fait, Mme Awa : votre prochaine séance est confirmée pour le samedi 16 janvier 2027 à 9 h à la Maison MND.'], 'deja-un-suivant'],
    [poses().length, textes(), base.table('envois').get(id)?.data?.reponse?.refus]);
}
{
  const id = lesBoutons({ place: 'prise' });
  await touche('PROCHAINE_OK:r3');
  dit('V11 la place prise entre-temps : la main passe, l equipe est prevenue', [['Cette place vient d’être prise, Mme Awa. Dites-nous ici le jour qui vous va : la Maison MND vous propose une heure.'], 'deja_pose', ['Awa a dit oui : la place ne s’est pas posée']],
    [textes(), base.table('envois').get(id)?.data?.reponse?.refus, POUSSES.map((p) => p.title ?? p.titre)]);
}
{
  const id = lesBoutons();
  await touche('PROCHAINE_OK:r3', '2290197000099');
  dit('V12 un autre numero touche le bouton : rien ne se pose, rien ne s ecrit', [0, undefined, []], [poses().length, base.table('envois').get(id)?.data?.reponse, textes()]);
}
{
  lesBoutons({ numeroDuColis: wa(NUM_PARENT) });
  await touche('PROCHAINE_OK:r3', wa(NUM_PARENT));
  dit('V13 le message parti au parent (numero a prevenir) : c est son toucher qui compte', 1, poses().length);
}
{
  lesBoutons({ reponse: { geste: 'autre', le: '2026-12-12T11:30:00Z' } });
  await touche('PROCHAINE_OK:r3');
  dit('V14 une ligne deja repondue : rien de plus', 0, poses().length);
}

/* ══ VI. LE TEXTE ══════════════════════════════════════════════════════ */
/* Le SQL lu sans ses commentaires : une ligne mise en commentaire ne compte plus. */
const sql = lis(SQL).replace(/--[^\n]*/g, '');
dit('VI1 0198 : la jumelle de Ma Couronne, au service seul (aucune session ne l appelle)', [true, true, true],
  [/revoke all on function public\.reserver_une_seance_incluse_par_la_maison\(text, text, text, text, text, text, jsonb\) from public, anon, authenticated;/.test(sql),
    /grant execute on function public\.reserver_une_seance_incluse_par_la_maison\(text, text, text, text, text, text, jsonb\) to service_role;/.test(sql),
    /security definer/.test(sql)]);
dit('VI2 0198 : les memes juges que 0138, sous les memes verrous (la formule, la lune, le credit, la place)', [true, true, true, true],
  [/v_raison := public\.abo_peut_porter\(v_sub\.id, p_service_id, v_quand, v_jour, null\);\n  if v_raison is not null then/.test(sql),
    /select \* into v_sub from public\.subscribers where id = p_sub_id for update;/.test(sql),
    /perform pg_advisory_xact_lock\(hashtext\('pose'\), hashtext\(v_branche \|\| ':' \|\| p_date\)\);/.test(sql),
    /v_raison := public\.abo_place_libre\(/.test(sql)]);
dit('VI3 0198 : la tete nommee doit etre celle du contrat ; la seance est couverte, a 0 F, sans acompte', [true, true, true],
  [/if p_client_id <> coalesce\(v_sub\.data->>'clientId', ''\) then\n    return jsonb_build_object\('ok', false, 'raison', 'tete_refusee'\);/.test(sql),
    /'coveredBySub', true,/.test(sql), /'priceXof', 0,\n    'depositXof', 0/.test(sql)]);
dit('VI4 0198 : la ligne conf-<rdv>-whatsapp posee avec la seance, dans la meme transaction', true,
  /insert into public\.envois \(id, branch_id, data\)\n    values \('conf-' \|\| v_id \|\| '-whatsapp'/.test(sql));
const copiesFausses = COPIES.filter((c: Any) => c.source === PUR).flatMap((c: Any) => {
  const ori = entre(lis(c.source), c.bloc);
  return c.cibles.filter((f: string) => ori === null || entre(lis(f), c.bloc) !== ori).map((f: string) => `${c.bloc} dans ${f}`);
});
dit('VI5 les trois blocs recopies (veille-attention, prochaine-seance, deja-un-suivant) sont ceux de la regle', [], copiesFausses);
dit('VI6 les copies vont la ou il faut', [['veille-attention', [RJ]], ['prochaine-seance', [WH]], ['deja-un-suivant', [WH, EP]]],
  COPIES.filter((c: Any) => c.source === PUR).map((c: Any) => [c.bloc, c.cibles]));
const actions = lis('src/apps/trone/routes/clients/actions.tsx');
dit('VII le Trone propose la prochaine seance a l honneur, par tous ses chemins (honorAppointment)', true,
  /export function honorAppointment\([\s\S]*?proposeLaProchaineSeanceApresLHonneur\(appt\);[\s\S]*?return \{ points: awarded, reprise \};/.test(actions));
const doc = lis('docs/modeles-whatsapp-abonnement.md');
dit('VI8 le document des modeles dit chaque corps, chaque bouton, le pied et le secret', [true, true, true, true, true],
  [doc.includes(FV.corps), doc.includes(FP.corps), FP.boutons.every((b) => doc.includes(b)), doc.includes(DEVISE_COMPLETE), doc.includes('`WA_TEMPLATE_RAPPEL_ATTENTION = rappel_rdv_attention`')]);
const gerard = lis('src/apps/trone/routes/clients/Gerard.tsx');
dit('VI9 l ecran des modeles montre les deux fiches avec « Copier », le pied lu dans DEVISE_COMPLETE', [true, true],
  [gerard.includes('FICHES_DES_MODELES_DE_L_ABONNEE.map((m) =>'), /const piedDeGerard = DEVISE_COMPLETE;/.test(gerard) && /\$\{m\.corps\}\\n\\n\$\{piedDeGerard\}/.test(gerard)]);
dit('VI10 les versions des fonctions disent ce lot (rappels-j1 et envois-partent apres « Ce qui va partir », en -b)', [true, true, true],
  [/const VERSION = '2026-11-11-b · [^']*la veille d’une séance de formule dit « Une attention vous y attend »/.test(lis(RJ)),
    /const VERSION = '2026-11-11-a · [^']*la prochaine séance de l abonnée \(PROCHAINE_OK, PROCHAINE_AUTRE\)/.test(lis(WH)),
    /const VERSION = '2026-11-11-b · [^']*la prochaine séance de l’abonnée \(apres-seance\) relue avant de partir/.test(lis(EP))]);

/* ══ VII. CE QUI VA PARTIR ═════════════════════════════════════════════ */
const ligneVeille = { id: 'env-t1-whatsapp', type: 'rappel-j1', genre: 'veille-attention', canal: 'whatsapp', apptId: 't1', clientId: 'cA', dateRdv: '2026-12-12', heure: '09:00',
  statut: 'en-attente', partA: '2026-12-11T17:15:00.000Z', colis: { genre: 'whatsapp', modele: 'rappel_rdv_attention', texteAuFil: 'x' } };
const ligneApres = { ...ligneAwa(), partA: '2026-12-12T10:50:00.000Z' };
dit('VII1 les deux genres sont declares au registre, avec leurs modeles', ['rappel_rdv_attention', 'prochaine_seance'],
  [GENRES_PREVUS[P.GENRE_VEILLE_ATTENTION]?.modele, GENRES_PREVUS[P.GENRE_APRES_SEANCE]?.modele]);
dit('VII2 la veille avec l attention se lit « veille-attention », sans cesser d etre un rappel-j1 pour le facteur et l arret d avance',
  ['veille-attention', 'Rappel de la veille · l’attention', 'rdv'], [genreDeLaLigne(ligneVeille), libelleDeLaLigne(ligneVeille as Any).modeleDit, libelleDeLaLigne(ligneVeille as Any).sorte]);
const vus = dejaAuJournal({ envois: [ligneVeille, ligneApres], maintenantMs: Date.parse('2026-12-11T17:06:00Z') } as Any);
dit('VII3 « A venir » : chaque ligne sous son genre, avec sa raison', [
  ['veille-attention', 'Son rendez-vous du samedi 12 décembre 2026 à 9 h ; une attention l’y attend.', 'rappel-j1:t1'],
  ['apres-seance', 'Sa séance du samedi 12 décembre 2026 ; sa prochaine séance proposée.', 'ligne:prochaine-seance-r3'],
], vus.map((m) => [m.famille, m.raison, m.cle]));

/* ══ VIII. LA PAGE ABONNEMENTS DU SITE (lot 5) ══════════════════════════ */
const page = PAGES.find((p) => p.chemin === '/abonnements/') as Any;
/* Ce que la page montre : ses mots, jamais ses adresses ni ses noms d'image. */
const visibles = (x: unknown, cle = ''): string[] => {
  if (typeof x === 'string') return ['image', 'vers', 'type', 'cle', 'chemin', 'jsonld', 'besoin', 'court', 'style'].includes(cle) ? [] : [x];
  if (Array.isArray(x)) return x.flatMap((y) => visibles(y, cle));
  if (x && typeof x === 'object') return Object.entries(x as Record<string, unknown>).flatMap(([k, v]) => visibles(v, k));
  return [];
};
const textesDeLaPage = visibles({ titre: page?.titre, description: page?.description, h1: page?.h1, sur: page?.sur, sections: page?.sections }).join('\n');
dit('VIII1 la page : ce que c est, trois facons de venir, ce que recoit une abonnee, ce que l attention ne sera pas, un seul geste',
  [['texte', 'Ce que c’est'], ['facons', 'Trois façons de venir'], ['grille', 'Ce que reçoit une abonnée'], ['grille', 'Ce que l’attention ne sera pas'], ['appel', 'Un seul geste']],
  (page?.sections ?? []).map((s: Any) => [s.type, s.sur ?? s.titre]));
dit('VIII2 AUCUN PRIX : aucun chiffre sur la page, ni « F », ni « FCFA »', [false, false], [/\d/.test(textesDeLaPage), /\bF\b|FCFA|XOF/.test(textesDeLaPage)]);
dit('VIII3 les deux gestes : « Voir ma formule » vers Ma Couronne, « En parler a la Maison » vers le WhatsApp de la Maison', [['Voir ma formule', 'soeur:couronne'], ['En parler à la Maison', true]],
  (page?.sections ?? []).find((s: Any) => s.type === 'appel')?.boutons.map((b: Any) => [b.texte, b.vers === 'soeur:couronne' ? b.vers : /^message:/.test(b.vers)]));
dit('VIII4 la page se lit dans les regles de la Maison', [], fautesDeLaMaison(textesDeLaPage));
dit('VIII5 les formules ouvertes a la vente, par facon de venir, leurs noms seulement', {
  lune: ['KLƆKLƆ™ · Chaque Lune', 'GBÈJÍ™ · Chaque Lune'],
  carnet: ['GBÈJÍ™ · Carnet de Quatre', 'GBÈJÍ™ · Carnet de Six', 'GBÈJÍ™ · Carnet de l’Année'],
  creation: ['VÈKPÈ™ · Les Premières Lunes'],
}, faconsDuSite());
dit('VIII6 une formule fermee a la vente ne parait pas', { lune: ['Ouverte'], carnet: [], creation: [] },
  faconsDeVenir([{ name: 'Ouverte', mode: 'cycle' }, { name: 'Fermée', mode: 'cycle', fermee: true }]));
const genere = lis('scripts/genere-revelateur.mjs');
dit('VIII7 le generateur ecrit les noms a la construction, sans jamais un chiffre', [true, true],
  [genere.includes("const FACONS_DU_SITE = contenu.faconsDuSite();"), genere.includes('.filter((n) => !/\\d/.test(n))')]);

vraiLog(ko === 0 ? `\n${n} epreuves : tout est juste.` : `\n${n} epreuves, ${ko} en echec.`);
process.exit(ko === 0 ? 0 : 1);
