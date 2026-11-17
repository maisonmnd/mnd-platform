/* LE RENDEZ-VOUS EN ATTENTE, ÉPROUVÉ — `node scripts/verifie-le-rendez-vous-en-attente.mjs`.

   17 novembre 2026 (Yéman, arbitrage B de « La consultation en affiches »). Un rendez-vous
   pris sur le site naît en attente : la place est tenue deux heures, il se
   confirme par « Je confirme » sur WhatsApp (et l'acompte quand un geste en
   porte un), sinon la place se libère.

   Trois parties. A : la règle pure (rendez-vous-en-attente-pur). B : la VRAIE
   fonction demande-submit contre une base, un Meta, un Deno et une horloge
   simulés : la bascule, la pose en attente, la réponse du webhook, les deux
   heures, les plafonds, la clé du numéro, le doublon, la grille, la durée au
   calibre, Ma Couronne. C : les fichiers qui tiennent la même règle (le SQL,
   le webhook, confirmation-rdv, le Trône, Ma Couronne), lus à leurs ancres.
   Tout est inventé. Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import {
  DELAI_DE_L_ATTENTE_MS, SURSIS_DE_L_ACOMPTE_MS, EN_ATTENTE_PAR_NUMERO, POSES_PAR_NUMERO_ET_PAR_JOUR, POSES_PAR_ADRESSE_ET_PAR_JOUR,
  MODELES_PAR_NUMERO_ET_PAR_JOUR, DEPLACEMENTS_AU_PLUS, MODELE_DE_L_ATTENTE,
  acompteAttendu, estFerme, estEnAttente, placeALiberer, etatDeLAttente, marquesDeLaNaissance, marquesDuOui, marquesDeLaLiberation,
  cleDuNumero, formesDuNumero, plafondDuNumero, deplacementsFaits, peutEncoreSeDeplacer, remiseGardeeAuDeplacement, acompteDesGestes,
  heureSurLaGrille, dureeAuCalibre, gestesAuCalibre, texteDeLAttente, composantsDeLAttente, texteDuOui, texteDeLAcompte,
  texteDeLaPlaceLiberee, texteDeLAutreMoment, heureDeCotonouDite, ceQueDitLAttente,
} from '../src/shared/rendez-vous-en-attente-pur';
import { estSuggere } from '../src/shared/rendez-vous-suggere-pur';
import { rappelDeLaVeilleSeTait, suggestionSansOui } from '../src/shared/heures-des-rappels-pur';
import { jetonDuRendezVous, referenceDuRendezVous } from '../src/shared/lien-du-rdv-pur';
import { reponseDeLaMaisonLue } from '../src/apps/couronne/reservation-serveur';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       obtenu  ${ascii(obtenu)}\n       attendu ${ascii(attendu)}`}`);
};
const lit = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/* ── L'horloge : le mardi 17 novembre 2026, 10 h à Cotonou. Elle avance quand on le lui dit. ── */
const REEL = Date;
let T0 = REEL.parse('2026-11-17T10:00:00+01:00');
class Horloge extends REEL {
  constructor(...a: unknown[]) { if (a.length === 0) super(T0); else super(...(a as [number])); }
  static now() { return T0; }
}
(globalThis as any).Date = Horloge;
const iso = (ms: number): string => new REEL(ms).toISOString();

/* ══ A. LA RÈGLE PURE ═══════════════════════════════════════════════════════ */
{
  const pose = marquesDeLaNaissance(T0);
  dit('A1 deux heures : la pose ecrit sa marque et son echeance, deux heures plus tard', [7_200_000, iso(T0), iso(T0 + 7_200_000)],
    [DELAI_DE_L_ATTENTE_MS, pose.suggereLe, pose.attenduJusquAu]);
  const tenue = { status: 'confirmé', ...pose };
  dit('A2 nee en attente : tenue (statut confirme), en attente, suggeree pour les rappels, pas ferme', [true, true, false, 'sans-reponse'],
    [estEnAttente(tenue), estSuggere(tenue), estFerme(tenue), etatDeLAttente(tenue)]);
  dit('A3 les rappels se taisent tant qu elle n a pas dit oui : ni la veille, ni deux heures avant', [true, true],
    [rappelDeLaVeilleSeTait({ ...tenue, date: '2026-11-18' }), suggestionSansOui(tenue)]);
  dit('A4 l echeance : a 1 h 59 la place tient, a 2 h pile elle se libere ; ferme, jamais', [false, true, false],
    [placeALiberer(tenue, T0 + 7_140_000), placeALiberer(tenue, T0 + 7_200_000),
      placeALiberer({ ...tenue, confirmeeParLaClienteLe: iso(T0 + 60_000) }, T0 + 9_000_000)]);
  const oui = { ...tenue, ...marquesDuOui(tenue, T0 + 600_000) };
  dit('A5 son oui, sans acompte : ferme, plus en attente, plus suggeree ; l echeance ne bouge pas', [true, false, false, 'ferme', pose.attenduJusquAu],
    [estFerme(oui), estEnAttente(oui), estSuggere(oui), etatDeLAttente(oui), oui.attenduJusquAu]);
  const avecAcompte = { ...tenue, depositXof: 6000 };
  const ouiAcompte = { ...avecAcompte, ...marquesDuOui(avecAcompte, T0 + 7_100_000) };
  dit('A6 son oui, avec un acompte du : pas ferme, « acompte », et trente minutes au moins pour le regler', [false, true, 'acompte', iso(T0 + 7_100_000 + SURSIS_DE_L_ACOMPTE_MS), 6000],
    [estFerme(ouiAcompte), estEnAttente(ouiAcompte), etatDeLAttente(ouiAcompte), ouiAcompte.attenduJusquAu, acompteAttendu(ouiAcompte)]);
  dit('A7 l acompte recu apres son oui : ferme ; l acompte recu SANS son oui : pas ferme', [true, false],
    [estFerme({ ...ouiAcompte, depositConfirmed: true }), estFerme({ ...avecAcompte, depositConfirmed: true })]);
  const liberee = { ...tenue, ...marquesDeLaLiberation(T0 + 7_300_000) };
  dit('A8 liberee : annulee, sa marque, ni elle ni la Maison n ont annule', ['annulé', 'liberee', false, false],
    [liberee.status, etatDeLAttente(liberee), 'annuleePar' in liberee, estEnAttente(liberee)]);
  dit('A9 un rendez-vous d avant (aucune echeance), confirme ou suggere par la Maison, n est pas « en attente »', [false, null, false, null],
    [estEnAttente({ status: 'confirmé' }), etatDeLAttente({ status: 'confirmé' }), estEnAttente({ status: 'confirmé', suggereLe: iso(T0) } as never), etatDeLAttente({ status: 'confirmé', suggereLe: iso(T0) } as never)]);
  dit('A10 la cle du numero : 229 97…, 229 01 97…, 01 97…, 97…, +229 et 00229 sont une personne ; un numero francais reste lui-meme',
    ['22997000011', '22997000011', '22997000011', '22997000011', '22997000011', '22997000011', '33612345678'],
    [cleDuNumero('+22997000011'), cleDuNumero('+2290197000011'), cleDuNumero('0197000011'), cleDuNumero('97000011'), cleDuNumero('229 01 97 00 00 11'), cleDuNumero('0022997000011'), cleDuNumero('+33612345678')]);
  dit('A11 ses graphies en base : les deux plans du Benin, ou lui seul ailleurs', [['+2290197000011', '+22997000011'], ['+33612345678'], []],
    [formesDuNumero('+22997000011'), formesDuNumero('+33612345678'), formesDuNumero('')]);
  dit('A12 le plafond d un numero : trois en attente, cinq poses par jour ; sans attente, seul le jour compte',
    [3, 5, 12, 5, null, 'trop_en_attente', null, 'trop_de_demandes', 'trop_de_demandes'],
    [EN_ATTENTE_PAR_NUMERO, POSES_PAR_NUMERO_ET_PAR_JOUR, POSES_PAR_ADRESSE_ET_PAR_JOUR, MODELES_PAR_NUMERO_ET_PAR_JOUR,
      plafondDuNumero({ posesDuJour: 2, enAttente: 2, attente: true }), plafondDuNumero({ posesDuJour: 3, enAttente: 3, attente: true }),
      plafondDuNumero({ posesDuJour: 3, enAttente: 3, attente: false }), plafondDuNumero({ posesDuJour: 5, enAttente: 0, attente: false }),
      plafondDuNumero({ posesDuJour: 5, enAttente: 3, attente: true })]);
  dit('A13 la limite des deplacements : deux ; un rendez-vous deplace avant le compte en compte un', [2, [0, true], [1, true], [2, false], [1, true], [0, true]],
    [DEPLACEMENTS_AU_PLUS, [deplacementsFaits({}), peutEncoreSeDeplacer({})], [deplacementsFaits({ deplacements: 1 }), peutEncoreSeDeplacer({ deplacements: 1 })],
      [deplacementsFaits({ deplacements: 2 }), peutEncoreSeDeplacer({ deplacements: 2 })],
      [deplacementsFaits({ deplaceLe: iso(T0), deplacePar: 'site' }), peutEncoreSeDeplacer({ deplaceLe: iso(T0), deplacePar: 'site' })],
      [deplacementsFaits({ deplaceLe: iso(T0), deplacePar: 'trone' }), peutEncoreSeDeplacer({ deplaceLe: iso(T0), deplacePar: 'trone' })]]);
  const r = (o: Partial<Parameters<typeof remiseGardeeAuDeplacement>[0]>) => remiseGardeeAuDeplacement({ aUneRemise: true, memeJour: false, bienvenue: false, offreConnue: true, aPlaces: false, lieeAuJour: false, tombeBien: false, ...o });
  dit('A14 la remise au deplacement : sans remise ou le meme jour, rien ne change ; la bienvenue suit ; la saison suit ; le mercredi suit a un mercredi seulement ; une place limitee et une offre disparue ne suivent pas',
    [true, true, true, true, true, false, false, false],
    [r({ aUneRemise: false, offreConnue: false }), r({ memeJour: true, aPlaces: true }), r({ bienvenue: true, offreConnue: false }), r({}),
      r({ lieeAuJour: true, tombeBien: true }), r({ lieeAuJour: true, tombeBien: false }), r({ aPlaces: true, lieeAuJour: true, tombeBien: true }), r({ offreConnue: false })]);
  dit('A15 l acompte d un panier : chaque geste a son taux, zero sans taux, jamais sur un taux absurde', [6000, 0, 0, 13500],
    [acompteDesGestes([{ id: 'a', prixXof: 20000 }], { a: 30 }), acompteDesGestes([{ id: 'a', prixXof: 20000 }], {}),
      acompteDesGestes([{ id: 'a', prixXof: 20000 }], { a: 130 }), acompteDesGestes([{ id: 'a', prixXof: 20000 }, { id: 'b', prixXof: 15000 }], { a: 30, b: 50 })]);
  const g = (debutMin: number, openMin = 480, closeMin = 1230) => heureSurLaGrille({ openMin, closeMin, debutMin, premierMin: 510 });
  dit('A16 la grille : 08:30 puis l heure ; ni 08:00, ni 09:30, ni 14:17 ; le samedi (09:00) commence a 09:00', [true, true, false, false, false, true, false],
    [g(510), g(540), g(480), g(570), g(857), g(540, 540, 1200), g(510, 540, 1200)]);
  const bandes = [{ id: 'm', maxLocks: 150, durCoef: 1 }, { id: 'mi', maxLocks: 350, durCoef: 1.8 }, { id: 'g', maxLocks: null, durCoef: 2.8 }];
  const geste = { id: 'sv', categoryId: 'cat', durationMin: 120, scalesWithModel: true };
  const c = (o: object, s: object = geste) => dureeAuCalibre(s as never, { lockCount: 300, bandes, ...o } as never);
  dit('A17 la duree au calibre : le coefficient de sa tranche, au quart d heure ; rien sans calibre, sans interrupteur, pour un prix fixe, ou bareme suspendu ; le bareme de l atelier passe d abord',
    [210, 120, 120, 120, 120, 330, 120, 360],
    [c({}), c({ lockCount: 0 }), c({}, { ...geste, scalesWithModel: false }), c({}, { ...geste, id: 'sv-gbigbi-essentiel' }), c({ suspendu: true }),
      c({ lockCount: 900 }), c({ lockCount: 100 }),
      c({ sets: { atl: [{ maxLocks: null, durCoef: 3 }] }, categories: [{ id: 'cat', parentId: 'atl' }] })]);
  dit('A18 le catalogue au calibre ne touche que les durees qui changent', [[210, 60], true],
    [gestesAuCalibre([geste, { id: 'x', durationMin: 60 }], { lockCount: 300, bandes }).map((s) => s.durationMin),
      gestesAuCalibre([{ id: 'x', durationMin: 60 }], { lockCount: 300, bandes })[0] !== undefined]);
  const o = { appel: 'Mme Awa', quand: 'vendredi 20 novembre 2026 à 10 h', gestes: 'Lavage rituel' };
  dit('A19 le message de la place tenue : il dit la place tenue, les deux heures, et ne finit pas par une variable',
    'Bonjour Mme Awa, la Maison MND tient votre place le vendredi 20 novembre 2026 à 10 h : Lavage rituel. Répondez « Je confirme » dans les deux heures pour la garder ; sans réponse, la place se libère.',
    texteDeLAttente(o));
  const comp = composantsDeLAttente({ ...o, apptId: 'rdv-1' }) as any[];
  dit('A20 ses deux boutons sont ceux du rendez-vous suggere, dans cet ordre, et trois variables', [3, 'REPRISE_OK:rdv-1', 'REPRISE_AUTRE:rdv-1', 'rdv_a_confirmer'],
    [comp[0].parameters.length, comp[1].parameters[0].payload, comp[2].parameters[0].payload, MODELE_DE_L_ATTENTE]);
  dit('A21 les reponses : confirme avec sa reference et son lien ; l acompte et jusqu a quand ; la place liberee et ou en reprendre une ; un autre moment',
    [true, true, true, true],
    [/C’est confirmé, Mme Awa/.test(texteDuOui({ appel: 'Mme Awa', quand: o.quand, reference: 'MND-7K3Q', lien: 'https://x/rdv/?v=j' })) && /MND-7K3Q/.test(texteDuOui({ appel: 'Mme Awa', quand: o.quand, reference: 'MND-7K3Q', lien: 'https://x/rdv/?v=j' })),
      /acompte de 6 000 F/.test(texteDeLAcompte({ appel: 'Mme Awa', quand: o.quand, acompte: '6 000 F', jusqua: '12 h 30', lien: 'https://x' })) && /jusqu’à 12 h 30/.test(texteDeLAcompte({ appel: 'Mme Awa', quand: o.quand, acompte: '6 000 F', jusqua: '12 h 30', lien: 'https://x' })),
      /elle s’est libérée/.test(texteDeLaPlaceLiberee({ appel: 'Mme Awa', quand: o.quand, lien: 'https://x/reserver/' })) && /reserver/.test(texteDeLaPlaceLiberee({ appel: 'Mme Awa', quand: o.quand, lien: 'https://x/reserver/' })),
      /La place est rendue/.test(texteDeLAutreMoment({ appel: 'Mme Awa', lien: 'https://x/reserver/' }))]);
  const court = (j: string) => ({ '2026-11-17': '17 nov. 2026' } as Record<string, string>)[j] ?? j;
  const francs = (x: number) => `${x} F`;
  dit('A22 le Carnet le dit : en attente et jusqu a quand ; son oui et l acompte attendu ; confirme par elle ; la place liberee ; rien pour un rendez-vous d avant',
    ['En attente de son oui · la place se libère à 12 h', 'Elle a dit oui · acompte de 6000 F attendu · jusqu’à 12 h 28', 'Pris en ligne, confirmé par elle le 17 nov. 2026',
      'Place libérée le 17 nov. 2026 : pas de confirmation sous deux heures', 'Place rendue le 17 nov. 2026 : elle a demandé un autre moment', '', '12 h'],
    [ceQueDitLAttente(tenue, { court, francs }), ceQueDitLAttente(ouiAcompte, { court, francs }), ceQueDitLAttente(oui, { court, francs }),
      ceQueDitLAttente(liberee, { court, francs }), ceQueDitLAttente({ ...liberee, autreMomentDemandeLe: iso(T0) }, { court, francs }),
      ceQueDitLAttente({ status: 'confirmé' }, { court, francs }), heureDeCotonouDite(pose.attenduJusquAu)]);
  dit('A23 Ma Couronne relit la reponse de la Maison : posee (ferme ou non), place prise, place limitee partie, refusee ; tout le reste est une fonction injoignable',
    ['pose', true, 'pose', false, 'prise', 'place-partie', 'refusee', 'injoignable', 'injoignable', 'injoignable'],
    [reponseDeLaMaisonLue({ ok: true, etat: 'confirme', rdvs: [{ id: 'rdv-1', date: '2026-11-20', time: '10:00', status: 'confirmé' }] }).etat,
      (reponseDeLaMaisonLue({ ok: true, etat: 'confirme', rdvs: [{ id: 'rdv-1', date: '2026-11-20', time: '10:00', status: 'confirmé' }] }) as any).ferme,
      reponseDeLaMaisonLue({ ok: true, etat: 'en-attente', rdvs: [{ id: 'rdv-1', date: '2026-11-20', time: '10:00', status: 'en attente' }] }).etat,
      (reponseDeLaMaisonLue({ ok: true, etat: 'en-attente', rdvs: [] }) as any).ferme,
      (reponseDeLaMaisonLue({ ok: false, error: 'creneau_pris' }) as any).raison, (reponseDeLaMaisonLue({ ok: false, error: 'places_limitees' }) as any).raison,
      (reponseDeLaMaisonLue({ ok: false, error: 'tete' }) as any).raison, reponseDeLaMaisonLue({ error: 'consentement' }).etat,
      reponseDeLaMaisonLue(null).etat, reponseDeLaMaisonLue({ ok: true, etat: 'confirme', rdvs: [{ id: 'rdv-1' }] }).etat]);
}

/* ══ B. LA VRAIE FONCTION, CONTRE UNE BASE SIMULÉE ══════════════════════════ */
type Ligne = Record<string, any>;
const TABLES: Record<string, Ligne[]> = {};
const table = (t: string): Ligne[] => (TABLES[t] ??= []);
const cleDe = (t: string): string => (t === 'documents' ? 'key' : 'id');
let TIC = 0;
let SEQ = 0;
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
  private mode: 'select' | 'update' | 'upsert' | 'insert' | 'delete' = 'select';
  private cols = '*';
  private rendre = false;
  private tete = false;
  private plafond = Infinity;
  private tri: [string, boolean] | null = null;
  private seule: 'non' | 'peut-etre' = 'non';
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
  lte(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') <= String(v)); return this; }
  in(c: string, vs: unknown[]) { const s = new Set(vs.map(String)); this.filtres.push((l) => s.has(String(valeur(l, c)))); return this; }
  limit(k: number) { this.plafond = k; return this; }
  order(c: string, o: { ascending?: boolean } = {}) { this.tri = [c, o.ascending !== false]; return this; }
  maybeSingle() { this.seule = 'peut-etre'; return this; }
  update(d: any) { this.mode = 'update'; this.charge = d; return this; }
  delete() { this.mode = 'delete'; return this; }
  upsert(d: any, o: any = {}) { this.mode = 'upsert'; this.charge = d; this.options = o; return this; }
  insert(d: any) { this.mode = 'insert'; this.charge = d; return this; }
  private execute(): { data: any; error: any; count?: number } {
    const lignes = table(this.t);
    const cle = this.options.onConflict ?? cleDe(this.t);
    if (this.mode === 'insert' || this.mode === 'upsert') {
      const faites: Ligne[] = [];
      for (const brut of ([] as any[]).concat(this.charge)) {
        const l: Ligne = { at: new Date().toISOString(), updated_at: `t${++TIC}`, ...structuredClone(brut) };
        if (l.id === undefined && this.t !== 'documents') l.id = ++SEQ;
        const i = lignes.findIndex((x) => x[cle] !== undefined && x[cle] === l[cle]);
        if (i >= 0 && this.mode === 'upsert') { if (this.options.ignoreDuplicates) continue; lignes[i] = l; } else lignes.push(l);
        faites.push(l);
      }
      return { data: this.rendre ? faites.map((l) => projette(l, this.cols)) : null, error: null };
    }
    let vues = lignes.filter((l) => this.filtres.every((f) => f(l)));
    if (this.mode === 'update') {
      for (const l of vues) { Object.assign(l, structuredClone(this.charge)); l.updated_at = `t${++TIC}`; }
      return { data: this.rendre ? vues.map((l) => projette(l, this.cols)) : null, error: null };
    }
    if (this.mode === 'delete') {
      for (const l of vues) lignes.splice(lignes.indexOf(l), 1);
      return { data: null, error: null };
    }
    if (this.tri) { const [c, asc] = this.tri; vues = [...vues].sort((a, b) => String(valeur(a, c)).localeCompare(String(valeur(b, c)), undefined, { numeric: true }) * (asc ? 1 : -1)); }
    const compte = vues.length;
    vues = vues.slice(0, this.plafond);
    if (this.tete) return { data: null, error: null, count: compte };
    const data = vues.map((l) => projette(l, this.cols));
    if (this.seule !== 'non') return { data: data[0] ?? null, error: null };
    return { data, error: null, count: compte };
  }
  then(ok: (r: any) => unknown, ko2?: (e: unknown) => unknown) {
    try { return Promise.resolve(this.execute()).then(ok, ko2); } catch (e) { return Promise.reject(e).then(ok, ko2); }
  }
}

/* ── La base, côté fonctions : ce que 0222 pose, rejoué ici mot pour mot avec la règle pure. ── */
const DEBIT: { seau: string; cle: string; at: number }[] = [];
let VOLEE: string | null = null;
const minutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const RPC: Record<string, (a: any) => unknown> = {
  debit_permis: ({ p_seau, p_cle, p_plafond, p_minutes }) => {
    const depuis = T0 - p_minutes * 60_000;
    if (DEBIT.filter((x) => x.seau === p_seau && x.cle === p_cle && x.at >= depuis).length >= p_plafond) return false;
    DEBIT.push({ seau: p_seau, cle: p_cle, at: T0 });
    return true;
  },
  plafond_des_poses: ({ p_cle }) => {
    const siens = table('appointments').filter((l) => l.data.cleDuNumero === p_cle);
    return {
      posesDuJour: siens.filter((l) => String(l.data.creeLe) >= iso(T0 - 86_400_000)).length,
      enAttente: siens.filter((l) => estEnAttente(l.data) && String(l.data.attenduJusquAu) > iso(T0)).length,
    };
  },
  creneaux_occupes: ({ p_branch, p_du, p_au }) => table('appointments')
    .filter((l) => l.branch_id === p_branch && l.data.status !== 'annulé' && l.data.date >= p_du && l.data.date <= p_au)
    .map((l) => ({ jour: l.data.date, maitre: l.data.master ?? '', debut: l.data.time, duree: l.data.dureeMin ?? 60 })),
  places_en_ligne: () => 1,
  places_de_la_remise: () => [],
  /* `pose_si_libre` (0222) : jamais avant 08:30, le plafond du numéro rejoué, une place en ligne par heure.
     `VOLEE` : un jour où une autre porte prend la place au même instant (entre la lecture et le verrou). */
  pose_si_libre: ({ p_rdv, p_maitres }) => {
    if (VOLEE && p_rdv.date === VOLEE) {
      table('appointments').push({ id: `rdv-vole-${++SEQ}`, branch_id: p_rdv.branchId, updated_at: `t${++TIC}`, data: { id: 'vole', branchId: p_rdv.branchId, date: p_rdv.date, time: p_rdv.time, status: 'confirmé', dureeMin: 60, master: '' } });
      VOLEE = null;
    }
    const debut = minutes(p_rdv.time);
    if (debut < 510) return { ok: false, raison: 'creneau_hors_ouverture' };
    if (p_rdv.cleDuNumero) {
      const c = RPC.plafond_des_poses({ p_cle: p_rdv.cleDuNumero }) as { posesDuJour: number; enAttente: number };
      if (c.posesDuJour >= 5) return { ok: false, raison: 'trop_de_demandes' };
      if (p_rdv.attenduJusquAu && c.enAttente >= 3) return { ok: false, raison: 'trop_en_attente' };
    }
    const duree = p_rdv.dureeMin ?? 60;
    const dessus = table('appointments').filter((l) => l.branch_id === p_rdv.branchId && l.data.date === p_rdv.date && l.data.status !== 'annulé'
      && debut < minutes(l.data.time) + (l.data.dureeMin ?? 60) && debut + duree > minutes(l.data.time));
    if (dessus.length >= 1) return { ok: false, raison: 'creneau_pris' };
    const master = (p_maitres ?? [])[0] ?? '';
    table('appointments').push({ id: p_rdv.id, branch_id: p_rdv.branchId, updated_at: `t${++TIC}`, data: { ...structuredClone(p_rdv), master } });
    return { ok: true, verdict: 'pose', id: p_rdv.id, master, dureeMin: duree };
  },
};
/** `libere_les_places_en_attente` (0222) : ce que le cron fait toutes les cinq minutes. */
const libere = (): number => {
  let combien = 0;
  for (const l of table('appointments')) {
    if (!placeALiberer(l.data, T0)) continue;
    l.data = { ...l.data, ...marquesDeLaLiberation(T0) };
    l.updated_at = `t${++TIC}`;
    for (const d of table('demandes').filter((x) => x.data?.apptId === l.id)) { const { codeApplique: _c, ...reste } = d.data; d.data = reste; }
    combien += 1;
  }
  return combien;
};
const client = {
  from: (t: string) => new Requete(t),
  rpc: async (nom: string, args: unknown) => (RPC[nom] ? { data: RPC[nom](args), error: null } : { data: null, error: { message: 'rpc absente du banc' } }),
  auth: {
    getUser: async (jeton: string) => (jeton === 'session-de-awa' ? { data: { user: { id: 'cl-awa' } }, error: null } : { data: { user: null }, error: { message: 'session inconnue' } }),
  },
  storage: { from: () => ({}) },
};

const ENV: Record<string, string | undefined> = {
  SUPABASE_URL: 'http://faux.local', SUPABASE_SERVICE_ROLE_KEY: 'le-secret-de-la-plateforme', CLE_SERVICE: 'la-cle-de-la-maison',
  WA_TOKEN: 'jeton-meta-de-banc', WA_PHONE_ID: '1234',
};
const SERVIS: ((req: Request) => Promise<Response>)[] = [];
const EN_FOND: Promise<unknown>[] = [];
const META: { modele?: string; composants: any[]; to: string; texte?: string }[] = [];
let REPONSES_META: { status: number; corps: unknown }[] = [];
(globalThis as any).__faux = { client: () => client };
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] }, serve: (h: any) => { SERVIS.push(h); } };
(globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => { EN_FOND.push(p); } };
let numeroWa = 0;
(globalThis as any).fetch = async (url: string, init?: { body?: string }) => {
  if (String(url).includes('graph.facebook.com')) {
    const corps = JSON.parse(String(init?.body ?? '{}'));
    META.push({ modele: corps.template?.name, composants: corps.template?.components ?? [], to: corps.to, texte: corps.text?.body });
    const r = REPONSES_META.shift() ?? { status: 200, corps: { messages: [{ id: `wamid.banc${++numeroWa}` }] } };
    return new Response(JSON.stringify(r.corps), { status: r.status });
  }
  return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
};
console.error = () => {};
console.log = ((journal) => (...a: unknown[]) => { if (!String(a[0] ?? '').startsWith('demande-submit')) journal(...a); })(console.log);
const attendsLeFond = async () => { while (EN_FOND.length) await Promise.allSettled(EN_FOND.splice(0)); };

/* ── Les fixtures : la Maison, ses heures, ses gestes, son barème (tout est inventé). ── */
const HEURES = ['mar', 'mer', 'jeu', 'ven'].map((key) => ({ key, open: '08h00', close: '20h30', closed: false }))
  .concat([{ key: 'sam', open: '09h00', close: '20h00', closed: false }])
  .concat(['dim', 'lun'].map((key) => ({ key, open: '09h00', close: '19h00', closed: true })));
table('branches').push({ id: 'br-1', data: { masters: ['Team', 'Expert'], flagship: true, seats: 2 } });
table('documents').push(
  { key: 'mnd_settings', data: { hours: HEURES, depositPctByService: {} } },
  { key: 'mnd_horaires_exceptions', data: [] },
  { key: 'mnd_vitrine_config', data: {} },
  { key: 'mnd_offers', data: [{ id: 'of-rentree', active: true, code: 'RENTREE10', discountPct: 10, serviceIds: ['sv-lavage'] }] },
  { key: 'mnd_model_bands', data: [{ id: 'm', name: 'Medium', maxLocks: 150, coef: 1, durCoef: 1 }, { id: 'mi', name: 'Micro', maxLocks: 350, coef: 1.8, durCoef: 1.8 }] },
  { key: 'mnd_model_band_sets', data: {} },
);
table('catalog_categories').push({ id: 'atl-ii-gbeji', data: {} }, { id: 'atl-i-vekpe', data: {} });
table('catalog_services').push(
  { id: 'sv-lavage', data: { name: 'Lavage rituel', categoryId: 'atl-ii-gbeji', durationMin: 60, priceXof: 20000 } },
  { id: 'sv-racines', data: { name: 'Reprise des racines', categoryId: 'atl-ii-gbeji', durationMin: 120, priceXof: 25000, scalesWithModel: true } },
  { id: 'sv-creation', data: { name: 'Création', categoryId: 'atl-i-vekpe', durationMin: 240, priceXof: 150000 } },
);
table('services').push({ id: 'sv-lavage', data: { name: 'Lavage rituel' } }, { id: 'sv-racines', data: { name: 'Reprise des racines' } });
table('clients').push(
  { id: 'cl-awa', branch_id: 'br-1', data: { name: 'Awa EXEMPLE', civilite: 'madame', phone: '+2290197000090', lockCount: 300 } },
  { id: 'cl-autre', branch_id: 'br-1', data: { name: 'Autre EXEMPLE', phone: '+2290197000091' } },
);

const demande = await import('../supabase/functions/demande-submit/index.ts') as any;
const [servir] = SERVIS;
let ipN = 0;
const ipNeuve = (): string => `10.${Math.floor(++ipN / 250) + 1}.${ipN % 250}.1`;
const appelle = async (corps: unknown, o: { ip?: string; cle?: string } = {}) => {
  const r = await servir(new Request('http://faux.local/functions/v1/demande-submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': o.ip ?? ipNeuve(), ...(o.cle ? { authorization: `Bearer ${o.cle}` } : {}) },
    body: JSON.stringify(corps),
  }));
  return { statut: r.status, corps: await r.json() as any };
};
const depot = (plus: Record<string, unknown> = {}, o: { ip?: string } = {}) => appelle({
  genre: 'rdv',
  data: { prenom: 'Awa', civilite: 'madame', telephone: '0197000011', dial: '+229', besoin: 'entretien', serviceIds: ['sv-lavage'], date: '2026-11-20', time: '10:00', consentement: true, ...plus },
}, o);
const rdvDe = (id: string): any => structuredClone(table('appointments').find((l) => l.id === id)?.data ?? null);
const envoi = (id: string): any => table('envois').find((e) => e.id === id)?.data;
const SERVICE = 'la-cle-de-la-maison';
const approuve = (etat = 'APPROVED') => {
  const i = table('documents').findIndex((d) => d.key === 'mnd_modeles_meta');
  if (i >= 0) table('documents').splice(i, 1);
  table('documents').push({ key: 'mnd_modeles_meta', data: { lusLe: iso(T0), modeles: [{ id: '1', nom: 'rdv_a_confirmer', etat }] } });
};

/* B1. SANS LE MODÈLE, RIEN NE CHANGE. */
{
  const r = await depot();
  await attendsLeFond();
  const a = rdvDe(r.corps.apptId);
  dit('B1 sans le secret du modele : la place nait confirmee comme avant, l ancienne confirmation part, et la reponse dit « confirme »',
    [200, 'confirme', true, referenceDuRendezVous(r.corps.apptId), 'confirmé', false, false, '22997000011', 'confirmation_rdv', false],
    [r.statut, r.corps.etat, r.corps.confirme, r.corps.reference, a?.status, 'attenduJusquAu' in a, 'suggereLe' in a, a?.cleDuNumero, META[0]?.modele, estEnAttente(a)]);
  ENV.WA_TEMPLATE_ATTENTE = 'rdv_a_confirmer';
  META.length = 0;
  const r2 = await depot({ telephone: '0197000012', date: '2026-11-20', time: '12:00' });
  approuve('PENDING');
  const r3 = await depot({ telephone: '0197000013', date: '2026-11-20', time: '14:00' });
  await attendsLeFond();
  dit('B2 le secret pose mais le modele pas encore lu « APPROVED » au Trone (absent, puis en revue) : toujours confirmee, jamais le modele de l attente',
    ['confirme', 'confirme', false, false, ['confirmation_rdv', 'confirmation_rdv']],
    [r2.corps.etat, r3.corps.etat, estEnAttente(rdvDe(r2.corps.apptId)), estEnAttente(rdvDe(r3.corps.apptId)), META.map((m) => m.modele)]);
}

/* B3. LA BASCULE : EN ATTENTE. */
approuve();
META.length = 0;
const b3 = await depot({ telephone: '0197000021', date: '2026-11-21', time: '10:00', cle: 'cle-du-depot-de-awa-0001' });
await attendsLeFond();
const idB3 = b3.corps.apptId as string;
{
  const a = rdvDe(idB3);
  dit('B3 le modele approuve : la place nait EN ATTENTE, tenue deux heures ; la reponse le dit, sans « confirme »',
    [200, 'en-attente', false, iso(T0 + DELAI_DE_L_ATTENTE_MS), referenceDuRendezVous(idB3), 'envoyé'],
    [b3.statut, b3.corps.etat, 'confirme' in b3.corps, b3.corps.attenduJusquAu, b3.corps.reference, b3.corps.accuse]);
  dit('B4 sur le rendez-vous : statut confirme (la place est tenue partout), ses deux marques, la cle du numero ; en attente, suggere pour les rappels',
    ['confirmé', iso(T0), iso(T0 + DELAI_DE_L_ATTENTE_MS), '22997000021', 'site', true, true, true],
    [a.status, a.suggereLe, a.attenduJusquAu, a.cleDuNumero, a.source, estEnAttente(a), estSuggere(a), rappelDeLaVeilleSeTait(a)]);
  const boutons = (META[0]?.composants ?? []).filter((c: any) => c.type === 'button').map((c: any) => c.parameters[0].payload);
  dit('B5 UN message : le modele de l attente, trois variables, « Je confirme » puis « Un autre moment », au numero tape',
    [1, 'rdv_a_confirmer', 3, [`REPRISE_OK:${idB3}`, `REPRISE_AUTRE:${idB3}`], '2290197000021'],
    [META.length, META[0]?.modele, META[0]?.composants?.[0]?.parameters?.length, boutons, META[0]?.to]);
  dit('B6 le journal : sa ligne att-…, du genre « proposition », envoyee ; AUCUNE ligne de confirmation tant qu elle n a pas dit oui',
    ['proposition', 'envoyé', true, 'rdv_a_confirmer', undefined],
    [envoi(`att-${idB3}-whatsapp`)?.type, envoi(`att-${idB3}-whatsapp`)?.statut, envoi(`att-${idB3}-whatsapp`)?.attente, envoi(`att-${idB3}-whatsapp`)?.modele, envoi(`conf-${idB3}-whatsapp`)]);
}

/* B7. SA RÉPONSE, RENDUE PAR LE WEBHOOK. */
{
  const sansCle = await appelle({ attente: 'reponse', rdv: idB3, geste: 'ok', numero: '22997000021' });
  const mauvaiseCle = await appelle({ attente: 'reponse', rdv: idB3, geste: 'ok', numero: '22997000021' }, { cle: 'une-cle-publique' });
  const etranger = await appelle({ attente: 'reponse', rdv: idB3, geste: 'ok', numero: '22997000099' }, { cle: SERVICE });
  dit('B7 la porte de la reponse ne s ouvre qu a la cle service ; un autre numero ne confirme pas pour elle', [401, 401, { pris: true, etat: 'numero-etranger' }, false],
    [sansCle.statut, mauvaiseCle.statut, etranger.corps, 'confirmeeParLaClienteLe' in rdvDe(idB3)]);
  META.length = 0;
  T0 += 10 * 60_000;
  /* Meta livre l'ancienne forme à huit chiffres : la clé la reconnaît. */
  const oui = await appelle({ attente: 'reponse', rdv: idB3, geste: 'ok', numero: '22997000021' }, { cle: SERVICE });
  await attendsLeFond();
  const a = rdvDe(idB3);
  dit('B8 « Je confirme », de son numero (livre a huit chiffres) : ferme ; son oui est date, la relance eteinte',
    [{ pris: true, etat: 'ferme' }, iso(T0), true, true, false, 'confirmé'],
    [oui.corps, a.confirmeeParLaClienteLe, a.relanceFaite, estFerme(a), estEnAttente(a), a.status]);
  dit('B9 elle recoit, en une phrase et sans modele : c est confirme, sa reference, le lien de son rendez-vous',
    [1, undefined, '22997000021', true, true, true],
    [META.length, META[0]?.modele, META[0]?.to, /C’est confirmé, Mme Awa/.test(META[0]?.texte ?? ''), (META[0]?.texte ?? '').includes(referenceDuRendezVous(idB3)), /\/rdv\/\?v=/.test(META[0]?.texte ?? '')]);
  dit('B10 la confirmation est inscrite (conf-…-whatsapp, envoyee) : le balayage ne la redira pas ; le fil garde la phrase',
    ['confirmation', 'envoyé', true],
    [envoi(`conf-${idB3}-whatsapp`)?.type, envoi(`conf-${idB3}-whatsapp`)?.statut, table('messages_wa').some((m) => m.data?.auto === 'attente-ok' && m.data?.numero === '22997000021')]);
  META.length = 0;
  const encore = await appelle({ attente: 'reponse', rdv: idB3, geste: 'ok', numero: '22997000021' }, { cle: SERVICE });
  dit('B11 un second « Je confirme » ne dit rien de plus', [{ pris: true, etat: 'ferme' }, 0], [encore.corps, META.length]);
  const pasNe = await appelle({ attente: 'reponse', rdv: (table('appointments')[0] as Ligne).id, geste: 'ok', numero: '22997000011' }, { cle: SERVICE });
  dit('B12 un rendez-vous qui n est pas ne en attente (une vraie suggestion, un rendez-vous d avant) : le webhook garde la main', { pris: false }, pasNe.corps);
}

/* B13. LES DEUX HEURES. */
{
  const r = await depot({ telephone: '0197000031', date: '2026-11-21', time: '12:00', cle: 'cle-du-depot-de-bea-0001', code: 'RENTREE10' });
  await attendsLeFond();
  const id = r.corps.apptId as string;
  T0 += DELAI_DE_L_ATTENTE_MS - 60_000;
  const avant = libere();
  dit('B13 a 1 h 59, rien ne se libere : la place est toujours la sienne', [0, 'confirmé', true], [avant, rdvDe(id).status, estEnAttente(rdvDe(id))]);
  T0 += 2 * 60_000;
  const apres = libere();
  const a = rdvDe(id);
  dit('B14 passe deux heures sans son oui, la place se libere seule : annule, « place liberee », ni elle ni la Maison ne l ont annule',
    [1, 'annulé', iso(T0), false, 'liberee'], [apres, a.status, a.placeLibereeLe, 'annuleePar' in a, etatDeLAttente(a)]);
  dit('B15 la place confirmee plus tot (B8) n a pas bouge', ['confirmé', false], [rdvDe(idB3).status, 'placeLibereeLe' in rdvDe(idB3)]);
  dit('B16 le code de l offre qu elle portait ne compte pas pour une fois', false, 'codeApplique' in (table('demandes').find((d) => d.data?.apptId === id)?.data ?? {}));
  META.length = 0;
  const tard = await appelle({ attente: 'reponse', rdv: id, geste: 'ok', numero: '22997000031' }, { cle: SERVICE });
  await attendsLeFond();
  dit('B17 son « Je confirme » arrive apres : on lui dit que la place s est liberee, et ou en reprendre une ; rien ne se rouvre',
    [{ pris: true, etat: 'liberee' }, true, true, 'annulé'],
    [tard.corps, /elle s’est libérée/.test(META[0]?.texte ?? ''), /\/reserver\//.test(META[0]?.texte ?? ''), rdvDe(id).status]);
  const encore = await depot({ telephone: '0197000031', date: '2026-11-21', time: '12:00', cle: 'cle-du-depot-de-bea-0002', code: 'RENTREE10' });
  await attendsLeFond();
  dit('B18 la meme place se reprend : une place liberee n est plus un doublon, et son code vaut encore', [true, 'en-attente', true, true, false],
    [encore.corps.ok, encore.corps.etat, !!encore.corps.apptId && encore.corps.apptId !== id, encore.corps.codeApplique, 'deja' in encore.corps]);
}

/* B19. « UN AUTRE MOMENT ». */
{
  const r = await depot({ telephone: '0197000041', date: '2026-11-21', time: '14:00' });
  await attendsLeFond();
  const id = r.corps.apptId as string;
  META.length = 0;
  const autre = await appelle({ attente: 'reponse', rdv: id, geste: 'autre', numero: '2290197000041' }, { cle: SERVICE });
  await attendsLeFond();
  const a = rdvDe(id);
  dit('B19 « Un autre moment » : la place est rendue tout de suite, par elle ; elle recoit le lien pour en choisir une autre',
    [{ pris: true, etat: 'liberee' }, 'annulé', 'cliente', true, true, true],
    [autre.corps, a.status, a.annuleePar, !!a.placeLibereeLe && !!a.autreMomentDemandeLe, /La place est rendue/.test(META[0]?.texte ?? ''), /\/reserver\//.test(META[0]?.texte ?? '')]);
}

/* B20. L'ACOMPTE. */
{
  (table('documents').find((d) => d.key === 'mnd_settings') as Ligne).data.depositPctByService = { 'sv-lavage': 30 };
  const r = await depot({ telephone: '0197000051', date: '2026-11-24', time: '10:00' });
  await attendsLeFond();
  const id = r.corps.apptId as string;
  dit('B20 un geste qui porte un acompte dans Parametres : le rendez-vous le porte, la reponse le dit', [6000, 6000, 'en-attente'], [rdvDe(id).depositXof, r.corps.acompteXof, r.corps.etat]);
  META.length = 0;
  T0 += 110 * 60_000;
  const oui = await appelle({ attente: 'reponse', rdv: id, geste: 'ok', numero: '22997000051' }, { cle: SERVICE });
  await attendsLeFond();
  const a = rdvDe(id);
  dit('B21 son oui ne suffit pas : pas ferme, « acompte » ; la place se tient trente minutes de plus au moins ; elle recoit le montant, l heure et le lien ; aucune confirmation inscrite',
    [{ pris: true, etat: 'acompte' }, false, true, iso(T0 + SURSIS_DE_L_ACOMPTE_MS), true, true, undefined],
    [oui.corps, estFerme(a), estEnAttente(a), a.attenduJusquAu, /acompte de 6 000 F/.test(META[0]?.texte ?? ''), /\/rdv\/\?v=/.test(META[0]?.texte ?? ''), envoi(`conf-${id}-whatsapp`)]);
  META.length = 0;
  T0 += 5 * 60_000;
  const encoreOui = await appelle({ attente: 'reponse', rdv: id, geste: 'ok', numero: '22997000051' }, { cle: SERVICE });
  await attendsLeFond();
  dit('B21b un second « Je confirme » redit l acompte et son lien, sans reculer l echeance une seconde fois',
    [{ pris: true, etat: 'acompte' }, a.attenduJusquAu, a.confirmeeParLaClienteLe, true],
    [encoreOui.corps, rdvDe(id).attenduJusquAu, rdvDe(id).confirmeeParLaClienteLe, /acompte de 6 000 F/.test(META[0]?.texte ?? '')]);
  const lue = await appelle({ rdv: 'lire', v: (await jetonDuRendezVous('le-secret-de-la-plateforme', id)) });
  dit('B21c la page de son rendez-vous dit l acompte, jusqu a quand, et la maison qui l encaisse ; rien de tout cela pour un rendez-vous confirme',
    ['acompte', 6000, 'br-1', a.attenduJusquAu, false],
    [lue.corps.rdv?.attente, lue.corps.rdv?.acompteXof, lue.corps.rdv?.branchId, lue.corps.rdv?.attenduJusquAu,
      'attente' in ((await appelle({ rdv: 'lire', v: (await jetonDuRendezVous('le-secret-de-la-plateforme', idB3)) })).corps.rdv ?? {})]);
  /* kkiapay-verify (ou le comptoir) reconnaît l'acompte : rien d'autre à écrire, le rendez-vous est ferme. */
  (table('appointments').find((l) => l.id === id) as Ligne).data.depositConfirmed = true;
  T0 += 3 * 3_600_000;
  /* (Le passage du cron libere au passage les places des epreuves d avant, restees sans reponse : pas celle-ci.) */
  libere();
  dit('B22 l acompte reconnu (kkiapay-verify, ou le comptoir) : ferme sans une ecriture de plus, et la place ne se libere pas', [true, false, 'confirmé', false],
    [estFerme(rdvDe(id)), placeALiberer(rdvDe(id), T0), rdvDe(id).status, 'placeLibereeLe' in rdvDe(id)]);
  (table('documents').find((d) => d.key === 'mnd_settings') as Ligne).data.depositPctByService = {};
}

/* B23. « JE CONFIRME », ÉCRIT. */
{
  const r = await depot({ telephone: '0197000061', date: '2026-11-24', time: '12:00' });
  await attendsLeFond();
  const id = r.corps.apptId as string;
  const inconnue = await appelle({ attente: 'reponse', geste: 'ok', numero: '22997000777', texte: 'Je confirme' }, { cle: SERVICE });
  const ecrit = await appelle({ attente: 'reponse', geste: 'ok', numero: '22997000061', texte: 'Je confirme mon rendez-vous' }, { cle: SERVICE });
  await attendsLeFond();
  dit('B23 « Je confirme » ecrit au lieu de touche : sa seule place en attente est confirmee ; un numero qui n en tient aucune rend la main',
    [{ pris: false }, { pris: true, etat: 'ferme' }, true], [inconnue.corps, ecrit.corps, estFerme(rdvDe(id))]);
  const r1 = await depot({ telephone: '0197000062', date: '2026-11-24', time: '14:00' });
  const r2 = await depot({ telephone: '0197000062', date: '2026-11-24', time: '16:00', pourQui: 'enfant' });
  await attendsLeFond();
  const flou = await appelle({ attente: 'reponse', geste: 'ok', numero: '22997000062', texte: 'je confirme' }, { cle: SERVICE });
  const cite = await appelle({ attente: 'reponse', geste: 'ok', numero: '22997000062', texte: `Je confirme mon rendez-vous (réf. ${referenceDuRendezVous(r2.corps.apptId)}).` }, { cle: SERVICE });
  await attendsLeFond();
  dit('B24 deux places en attente : personne ne devine laquelle ; la reference citee designe la bonne',
    [{ pris: false }, { pris: true, etat: 'ferme' }, false, true], [flou.corps, cite.corps, estFerme(rdvDe(r1.corps.apptId)), estFerme(rdvDe(r2.corps.apptId))]);
}

/* B25. META REFUSE LE MODÈLE. */
{
  META.length = 0;
  REPONSES_META = [{ status: 400, corps: { error: { code: 132001, message: 'Template name does not exist' } } }];
  const r = await depot({ telephone: '0197000071', date: '2026-11-25', time: '10:00' });
  await attendsLeFond();
  const a = rdvDe(r.corps.apptId);
  dit('B25 Meta refuse le modele de l attente (#132001) : la place se confirme dans la seconde, comme avant, et l ancienne confirmation part',
    ['confirme', true, 'confirmé', false, false, ['rdv_a_confirmer', 'confirmation_rdv']],
    [r.corps.etat, r.corps.confirme, a.status, 'attenduJusquAu' in a, 'suggereLe' in a, META.map((m) => m.modele)]);
  REPONSES_META = [{ status: 400, corps: { error: { code: 131026, message: 'Message undeliverable' } } }];
  const r2 = await depot({ telephone: '0197000072', date: '2026-11-25', time: '12:00' });
  await attendsLeFond();
  dit('B26 un echec qui n est pas celui du modele (numero hors WhatsApp) : la place reste en attente, la page le saura', ['en-attente', 'échec', true],
    [r2.corps.etat, r2.corps.accuse, estEnAttente(rdvDe(r2.corps.apptId))]);
}

/* B27. LES PLAFONDS. */
{
  const heures = ['10:00', '12:00', '14:00', '16:00', '18:00'];
  const poses: any[] = [];
  /* Trois graphies du même numéro : une seule personne. */
  for (const [i, tel] of ['0197000081', '97000081', '+229 97 00 00 81'].entries()) {
    poses.push(await depot({ telephone: tel, dial: '+229', date: '2026-11-26', time: heures[i], pourQui: i === 0 ? 'moi' : i === 1 ? 'enfant' : 'autre' }));
  }
  await attendsLeFond();
  const lignesAvant = [table('demandes').length, table('messages_wa').length, table('appointments').length];
  const quatrieme = await depot({ telephone: '0197000081', date: '2026-11-26', time: heures[3] });
  dit('B27 un numero (sous toutes ses graphies) tient trois places sans les confirmer ; la quatrieme est refusee, et ne laisse ni demande, ni fil, ni rendez-vous',
    [['en-attente', 'en-attente', 'en-attente'], 429, 'trop_en_attente', lignesAvant],
    [poses.map((p) => p.corps.etat), quatrieme.statut, quatrieme.corps.error, [table('demandes').length, table('messages_wa').length, table('appointments').length]]);
  for (const p of poses) await appelle({ attente: 'reponse', rdv: p.corps.apptId, geste: 'ok', numero: '22997000081' }, { cle: SERVICE });
  const q = await depot({ telephone: '0197000081', date: '2026-11-26', time: heures[3] });
  const c = await depot({ telephone: '0197000081', date: '2026-11-26', time: heures[4] });
  await attendsLeFond();
  const sixieme = await depot({ telephone: '0197000081', date: '2026-11-27', time: '10:00' });
  dit('B28 confirmees, elle en reprend ; mais jamais plus de cinq places en vingt-quatre heures : la sixieme est refusee',
    [true, true, 429, 'trop_de_demandes'], [q.corps.ok, c.corps.ok, sixieme.statut, sixieme.corps.error]);
  T0 += 25 * 3_600_000;
  const demain = await depot({ telephone: '0197000081', date: '2026-11-27', time: '10:00' });
  await attendsLeFond();
  dit('B29 le lendemain, le compte est reparti', [true, 'en-attente'], [demain.corps.ok, demain.corps.etat]);
  /* Par adresse : douze places en vingt-quatre heures, quel que soit le numéro. */
  const ip = '41.0.0.1';
  const statuts: number[] = [];
  let k = 0;
  for (const jour of ['2026-12-01', '2026-12-02', '2026-12-03']) {
    for (const h of heures) {
      if (statuts.length >= 13) break;
      /* Le seau des dépôts (six par dix minutes) n'est pas l'objet : l'horloge avance entre deux. */
      T0 += 11 * 60_000;
      statuts.push((await depot({ telephone: `01970002${String(++k).padStart(2, '0')}`, date: jour, time: h }, { ip })).statut);
    }
  }
  await attendsLeFond();
  dit('B30 une adresse pose douze places en vingt-quatre heures, pas treize', [12, 429], [statuts.filter((s) => s === 200).length, statuts[12]]);
}

/* B31. LE DOUBLON NE REND PLUS LA RÉFÉRENCE D'UNE AUTRE. */
{
  const autre = await depot({ telephone: '0197000021', date: '2026-11-21', time: '10:00' });
  const autreForme = await depot({ telephone: '+229 97 00 00 21', dial: '+229', date: '2026-11-21', time: '10:00', cle: 'une-autre-cle-00000001' });
  dit('B31 retaper le numero, le jour et l heure d une autre (sous n importe quelle graphie) ne rend ni son rendez-vous ni sa reference',
    [{ ok: true, deja: true, accuse: 'deja' }, { ok: true, deja: true, accuse: 'deja' }], [autre.corps, autreForme.corps]);
  const sien = await depot({ telephone: '0197000021', date: '2026-11-21', time: '10:00', cle: 'cle-du-depot-de-awa-0001' });
  dit('B32 le meme appareil (la cle de son premier depot) retrouve sa reference et l etat de sa place',
    [true, idB3, referenceDuRendezVous(idB3), 'confirme', 'deja'], [sien.corps.deja, sien.corps.apptId, sien.corps.reference, sien.corps.etat, sien.corps.accuse]);
}

/* B33. LE CODE, UNE FOIS PAR PERSONNE : PAR LA CLÉ DU NUMÉRO. */
{
  const un = await depot({ telephone: '0197000301', date: '2026-12-04', time: '10:00', code: 'RENTREE10' });
  await appelle({ attente: 'reponse', rdv: un.corps.apptId, geste: 'ok', numero: '22997000301' }, { cle: SERVICE });
  const deux = await depot({ telephone: '+229 97 00 03 01', dial: '+229', date: '2026-12-04', time: '14:00', code: 'RENTREE10' });
  await attendsLeFond();
  dit('B33 le code d une offre sert une fois par personne, meme si elle retape son numero a l ancienne (+229 et huit chiffres)',
    [true, undefined, false, 'deja-utilise'], [un.corps.codeApplique, un.corps.codeRaison, deux.corps.codeApplique, deux.corps.codeRaison]);
}

/* B34. L'HEURE ET LA DURÉE. */
{
  const horsGrille = await depot({ telephone: '0197000401', date: '2026-12-05', time: '14:17' });
  const demie = await depot({ telephone: '0197000402', date: '2026-12-04', time: '09:30' });
  const huit = await depot({ telephone: '0197000403', date: '2026-12-08', time: '08:00' });
  await attendsLeFond();
  dit('B34 une heure hors de la grille (14:17, 09:30) est refusee par le serveur ; rien ne se pose a 08:00',
    [409, 'creneau_hors_ouverture', 409, false],
    [horsGrille.statut, horsGrille.corps.error, demie.statut, table('appointments').some((l) => l.data.date === '2026-12-08' && l.data.time === '08:00')]);
  const nu = await depot({ telephone: '0197000404', date: '2026-12-08', time: '10:00', serviceIds: ['sv-racines'] });
  const micro = await depot({ telephone: '0197000405', date: '2026-12-09', time: '10:00', serviceIds: ['sv-racines'], lockCount: 300, calibre: 'Micro' });
  await attendsLeFond();
  dit('B35 la duree posee suit le calibre annonce : 120 min au catalogue, 210 min pour une tete Micro (x1,8, au quart d heure)', [120, 210],
    [rdvDe(nu.corps.apptId).dureeMin, rdvDe(micro.corps.apptId).dureeMin]);
  const dessus = await depot({ telephone: '0197000406', date: '2026-12-09', time: '13:00' });
  dit('B36 … et l heure qui tombe dans cette duree n est plus libre', [409, 'creneau_pris'], [dessus.statut, dessus.corps.error]);
}

/* B37. MA COURONNE PASSE PAR LE SERVEUR. */
{
  const corps = (plus: Record<string, unknown> = {}) => ({
    couronne: 'reserver',
    data: { pour: 'cl-awa', nom: 'Awa EXEMPLE', serviceIds: ['sv-racines'], seances: [{ date: '2026-12-10', time: '10:00' }], maitre: 'Expert', notes: ['Envie · brillance'],
      placeAttendue: false, tarifDeLaMaison: true, vu: { totalXof: 45000, remiseXof: 0, dureeMin: 30 }, ...plus },
  });
  const sansSession = await appelle(corps());
  const faux = await appelle(corps(), { cle: 'une-session-inventee' });
  dit('B37 Ma Couronne : sans sa session, rien', [401, 'session', 401], [sansSession.statut, sansSession.corps.error, faux.statut]);
  const r = await appelle({ ...corps(), data: { ...corps().data, status: 'confirmé', priceXof: 1, dureeMin: 15, discountXof: 99999 } }, { cle: 'session-de-awa' });
  const a = r.corps.rdvs?.[0];
  dit('B38 avec sa session : le serveur pose, sous verrou ; le statut, la duree (le calibre de SA fiche, jamais plus courte que le catalogue) et le maitre viennent de lui',
    [200, 'confirme', 'confirmé', 210, 'Expert', 'couronne', 'cl-awa', true],
    [r.statut, r.corps.etat, a?.status, a?.dureeMin, a?.master, a?.source, a?.clientId, !!rdvDe(a?.id)]);
  dit('B39 rien de ce que l appareil annonce ne fait foi : ni prix fige, ni remise ; ce qu elle a vu est dans la note, pour le comptoir',
    [false, false, true, true], ['priceXof' in a, 'discountXof' in a, /Vu dans Ma Couronne : 45 000 F/.test(a?.note ?? ''), /Envie · brillance/.test(a?.note ?? '')]);
  const autreTete = await appelle(corps({ pour: 'cl-autre', seances: [{ date: '2026-12-11', time: '10:00' }] }), { cle: 'session-de-awa' });
  dit('B40 elle ne reserve pas pour la tete d une autre', [403, 'tete'], [autreTete.statut, autreTete.corps.error]);
  const creation = await appelle(corps({ serviceIds: ['sv-creation'], seances: [{ date: '2026-12-11', time: '10:00' }] }), { cle: 'session-de-awa' });
  dit('B41 un geste qui demande le regard de la Maison (une creation) ne nait pas confirme : « en attente », la Maison regarde',
    ['en-attente', 'en attente', true], [creation.corps.etat, creation.corps.rdvs?.[0]?.status, creation.corps.regard]);
  const avant = table('appointments').length;
  const serie = await appelle(corps({ serviceIds: ['sv-lavage'], seances: [{ date: '2026-12-12', time: '10:00' }, { date: '2026-12-10', time: '11:00' }] }), { cle: 'session-de-awa' });
  dit('B42 une serie se pose entiere, ou pas du tout : la seconde seance tombe sur une place prise, rien ne reste',
    [409, 'creneau_pris', avant], [serie.statut, serie.corps.error, table('appointments').length]);
  VOLEE = '2026-12-17';
  const avantVol = table('appointments').filter((l) => l.data.clientId === 'cl-awa').length;
  const volee = await appelle(corps({ serviceIds: ['sv-lavage'], seances: [{ date: '2026-12-16', time: '10:00' }, { date: '2026-12-17', time: '10:00' }] }), { cle: 'session-de-awa' });
  dit('B42b … et quand la seconde place part sous le verrou, la premiere deja posee se defait : rien de la serie ne reste',
    [409, 'creneau_pris', avantVol], [volee.statut, volee.corps.error, table('appointments').filter((l) => l.data.clientId === 'cl-awa').length]);
  const longue = await appelle(corps({ serviceIds: ['sv-lavage'], seances: [{ date: '2026-12-12', time: '10:00' }], vu: { totalXof: 20000, remiseXof: 0, dureeMin: 600 } }), { cle: 'session-de-awa' });
  dit('B43 la duree que l ecran compte ne l allonge que jusqu au double', 120, longue.corps.rdvs?.[0]?.dureeMin);
  (table('documents').find((d) => d.key === 'mnd_settings') as Ligne).data.depositPctByService = { 'sv-lavage': 30 };
  table('payments').push({ id: 'tx-banc-1', data: { status: 'success', partnerId: 'rdv-paye-0001', amountXof: 6000 } }, { id: 'tx-banc-2', data: { status: 'success', partnerId: 'rdv-paye-0002', amountXof: 4000 } });
  const payee = await appelle(corps({ serviceIds: ['sv-lavage'], seances: [{ date: '2026-12-18', time: '10:00', id: 'rdv-paye-0001' }], transactionId: 'tx-banc-1' }), { cle: 'session-de-awa' });
  const courte = await appelle(corps({ serviceIds: ['sv-lavage'], seances: [{ date: '2026-12-18', time: '14:00', id: 'rdv-paye-0002' }], transactionId: 'tx-banc-2' }), { cle: 'session-de-awa' });
  const autreTx = await appelle(corps({ serviceIds: ['sv-lavage'], seances: [{ date: '2026-12-18', time: '16:00', id: 'rdv-paye-0003' }], transactionId: 'tx-banc-1' }), { cle: 'session-de-awa' });
  dit('B43b l acompte paye en ligne pour CE rendez-vous (au registre) : confirme ; paye en dessous : l argent est pose, la Maison regarde ; le paiement d un autre rendez-vous ne vaut rien',
    [['confirme', 'rdv-paye-0001', 6000, true], ['en-attente', 4000, true], ['en-attente', 6000, false]],
    [[payee.corps.etat, payee.corps.rdvs?.[0]?.id, payee.corps.rdvs?.[0]?.depositXof, payee.corps.rdvs?.[0]?.depositConfirmed],
      [courte.corps.etat, courte.corps.rdvs?.[0]?.depositXof, courte.corps.rdvs?.[0]?.depositConfirmed],
      [autreTx.corps.etat, autreTx.corps.rdvs?.[0]?.depositXof, !!autreTx.corps.rdvs?.[0]?.depositConfirmed]]);
  (table('documents').find((d) => d.key === 'mnd_settings') as Ligne).data.depositPctByService = {};
  const horsGrille = await appelle(corps({ serviceIds: ['sv-lavage'], seances: [{ date: '2026-12-15', time: '10:20' }] }), { cle: 'session-de-awa' });
  dit('B44 … et l heure est une heure de la grille, pour elle aussi', [409, 'creneau_hors_ouverture'], [horsGrille.statut, horsGrille.corps.error]);
}

/* ══ C. LES FICHIERS QUI TIENNENT LA MÊME RÈGLE ═════════════════════════════ */
{
  const sql = lit('supabase/migrations/0222_le_rendez_vous_en_attente.sql').replace(/--[^\n]*/g, '');
  const pose = sql.slice(sql.indexOf('create or replace function public.pose_si_libre'), sql.indexOf('create or replace function public.libere_les_places_en_attente'));
  dit('C1 la base tient les memes nombres que la regle : cinq poses par jour, trois en attente, sous le verrou du numero pris AVANT celui du jour',
    [true, true, true, true],
    [new RegExp(`coalesce\\(poses_du_jour, 0\\) >= ${POSES_PAR_NUMERO_ET_PAR_JOUR} then`).test(pose), new RegExp(`coalesce\\(en_attente, 0\\) >= ${EN_ATTENTE_PAR_NUMERO} then`).test(pose),
      /interval '24 hours'/.test(pose),
      pose.indexOf("pg_advisory_xact_lock(hashtext('pose-numero'), hashtext(cle))") > 0 && pose.indexOf("pg_advisory_xact_lock(hashtext('pose-numero'), hashtext(cle))") < pose.indexOf("pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || jour))")]);
  dit('C2 aucune porte en ligne ne pose avant 08:30 ; le plafond ne vaut que pour une place qui nait en attente',
    [true, true], [/if debut is null or debut < 510 then\s+return jsonb_build_object\('ok', false, 'raison', 'creneau_hors_ouverture'\);/.test(pose),
      /if btrim\(coalesce\(p_rdv->>'attenduJusquAu', ''\)\) <> '' and coalesce\(en_attente, 0\) >= 3 then/.test(pose)]);
  const juge = sql.slice(sql.indexOf('create or replace function public.rdv_en_attente'), sql.indexOf('create index if not exists appointments_cle_du_numero'));
  dit('C3 le juge de la base est celui de la regle : tenue, une echeance, et pas (son oui ET l acompte recu ou nul)', [true, true, true, true],
    [/coalesce\(a->>'status', ''\) = 'confirmé'/.test(juge), /btrim\(coalesce\(a->>'attenduJusquAu', ''\)\) <> ''/.test(juge),
      /btrim\(coalesce\(a->>'confirmeeParLaClienteLe', ''\)\) <> ''/.test(juge), /coalesce\(a->>'depositConfirmed', ''\) = 'true'/.test(juge)]);
  const lib = sql.slice(sql.indexOf('create or replace function public.libere_les_places_en_attente'));
  dit('C4 la liberation : les seules places en attente dont l echeance est passee ; annule, « place liberee », le code rendu ; le cron toutes les cinq minutes',
    [true, true, true, true, true],
    [/public\.rdv_en_attente\(a\.data\)\s+and a\.data->>'attenduJusquAu' <= maintenant/.test(lib), /'status', 'annulé', 'annuleeLe', maintenant, 'placeLibereeLe', maintenant/.test(lib),
      /d\.data - 'codeApplique'/.test(lib), /cron\.schedule\('libere-les-places-en-attente', '\*\/5 \* \* \* \*'/.test(lib), !/annuleePar/.test(lib)]);
  dit('C5 le debit se compte et s ecrit sous un meme verrou, a la cle service seule', [true, true],
    [/perform pg_advisory_xact_lock\(hashtext\('debit:' \|\| seau\), hashtext\(cle\)\);[\s\S]*?insert into public\.edge_rate_limits/.test(sql),
      /revoke all on function public\.debit_permis\(text, text, int, int\) from public, anon, authenticated;/.test(sql)]);
  const depl = lit('supabase/migrations/0223_deplacer_sous_le_verrou.sql').replace(/--[^\n]*/g, '');
  dit('C6 deplacer : sous le verrou des poses, la ligne relue, deux fois au plus, jamais avant 08:30, lui-meme retire du compte',
    [true, true, true, true, true],
    [/perform pg_advisory_xact_lock\(hashtext\('pose'\), hashtext\(branche \|\| ':' \|\| p_date\)\);/.test(depl), /rdv\.updated_at is distinct from p_vu/.test(depl),
      new RegExp(`if faits >= ${DEPLACEMENTS_AU_PLUS} then\\s+return jsonb_build_object\\('ok', false, 'raison', 'trop_de_deplacements'\\);`).test(depl),
      /if debut is null or debut < 510 then/.test(depl), (depl.match(/where a\.id <> p_id/g) ?? []).length >= 4]);
  const garde = lit('supabase/migrations/0224_ma_couronne_passe_par_le_serveur.sql').replace(/--[^\n]*/g, '');
  dit('C7 la garde de la base : une cliente ne se confirme pas, ne fige ni prix ni remise, ne raccourcit pas la duree ; la Maison ecrit comme avant',
    [true, true, true, true, true],
    [/if public\.ecriture_de_la_maison\(\) then\s+return new;/.test(garde),
      /if coalesce\(new\.data->>'status', ''\) = 'confirmé' then\s+new\.data := jsonb_set\(new\.data, '\{status\}', '"en attente"'::jsonb\);/.test(garde),
      /array\['priceXof', 'discountXof', 'discountPct', 'remisesLignes', 'offreId',/.test(garde), /greatest\(\s*catalogue,/.test(garde),
      /create trigger garde_reservation_cliente_biu\s+before insert or update on public\.appointments/.test(garde)]);

  const webhook = lit('supabase/functions/whatsapp-webhook/index.ts');
  dit('C8 le webhook rend le bouton d une place en attente a la porte du site, AVANT de chercher une fiche ; et le « Je confirme » ecrit, AVANT l automate',
    [true, true, true, true],
    [/if \(typeof rdv\.attenduJusquAu === 'string' && rdv\.attenduJusquAu\.trim\(\)\) \{\s+const rendu = await rendsALaPorteDuSite\(urlBase, service, \{ rdv: ligne\.id, geste: m\[1\] === 'OK' \? 'ok' : 'autre', numero: e\.numero \}\);/.test(webhook),
      webhook.indexOf("const rendu = await rendsALaPorteDuSite(urlBase, service, { rdv: ligne.id") < webhook.indexOf("dis('reprise · numéro étranger au rendez-vous')"),
      webhook.indexOf('if (rendu.pris) confirmesParEcrit.add(e.waId);') > 0 && webhook.indexOf('if (rendu.pris) confirmesParEcrit.add(e.waId);') < webhook.indexOf('const tache = confieALAutomate('),
      /body: JSON\.stringify\(\{ attente: 'reponse', \.\.\.corps \}\)/.test(webhook) && /authorization: `Bearer \$\{service\}`/.test(webhook)]);
  const jeConfirme = /const estUnJeConfirme = \(texte: string \| undefined\): boolean =>\s+(\/.*\/i)\.test/.exec(webhook)?.[1] ?? '';
  const re = jeConfirme ? new RegExp(jeConfirme.slice(1, jeConfirme.lastIndexOf('/')), 'i') : /$^/;
  dit('C9 « Je confirme » se reconnait ecrit ; « oui » seul, ou une question, non', [true, true, true, false, false, false],
    [re.test('Je confirme'), re.test(' je confirme mon rendez-vous (réf. MND-7K3Q).'), re.test('Oui, je confirme'), re.test('oui'), re.test('Est-ce que je confirme ici ?'), re.test('Bonjour')]);
  const conf = lit('supabase/functions/confirmation-rdv/index.ts');
  dit('C10 confirmation-rdv ne dit rien a une place en attente : ni proposition, ni « c est confirme »', true,
    /\.filter\(\(a\) => a\.date >= aujourdhui && estAConfirmer\(a, maintenant\)\)[\s\S]{0,260}\.filter\(\(a\) => !estEnAttente\(a\)\);/.test(conf));
  const ds = lit('supabase/functions/demande-submit/index.ts');
  dit('C11 demande-submit : la bascule veut le secret ET le modele approuve ; la reponse de l attente ne s ouvre qu a la cle service ; le juge de l heure n est pas refait ici',
    [true, true, true, true],
    [/const nom = \(Deno\.env\.get\('WA_TEMPLATE_ATTENTE'\) \?\? ''\)\.trim\(\);\s+if \(!nom \|\| !Deno\.env\.get\('WA_TOKEN'\) \|\| !Deno\.env\.get\('WA_PHONE_ID'\)\) return '';/.test(ds),
      /String\(m\?\.etat \?\? ''\)\.toUpperCase\(\) === 'APPROVED'/.test(ds), /if \(!appelDuServeur\(req\)\) return json\(\{ error: 'reserve' \}, 401\);/.test(ds),
      /if \(debutDemande >= PREMIER_RENDEZ_VOUS_MIN\s+&& !heureSurLaGrille\(/.test(ds)]);
  const badge = lit('src/apps/trone/routes/clients/BadgeSuggere.tsx');
  const carnet = lit('src/apps/trone/routes/clients/Carnet.tsx');
  dit('C12 au Carnet, un rendez-vous en attente se distingue d un confirme : son badge, sa tuile en pointilles, son filtre ; libere, il le dit',
    [true, true, true, true],
    [badge.includes("{attente === 'liberee' ? 'Place libérée' : 'En attente'}"), badge.includes("(estSuggere(a) || estEnAttente(a) ? 'est-suggere' : '')"),
      carnet.includes("garde: (a) => a.status === 'en attente' || estEnAttente(a) }"), carnet.includes("garde: (a) => a.status === 'confirmé' && !estSuggere(a) && !estEnAttente(a) }")]);
  const booking = lit('src/apps/couronne/Booking.tsx');
  dit('C13 Ma Couronne demande a la Maison ; ce qu elle garde est ce que la Maison a ecrit ; elle n envoie ni statut, ni prix, ni remise',
    [true, true, false],
    [booking.includes('const parLaMaison = sb ? await reserveALaMaison(sb, {'), booking.includes('ecrits = parLaMaison.rdvs;'),
      /reserveALaMaison\(sb, \{[^;]*(status|priceXof|discountXof|remisesLignes)\b/.test(booking.replace(/\/\*[\s\S]*?\*\//g, ''))]);
  const reserver = lit('src/apps/revelateur/ilots/Reserver.tsx');
  dit('C14 le site : le prix au calibre annonce est un plancher, confirme au fauteuil ; les heures suivent la duree au calibre ; la page dit comment confirmer',
    [true, true, true, true],
    [reserver.includes("const prixFlou = prixAuCalibre || choisies.some("), reserver.includes("${prixAuCalibre ? 'confirmé au fauteuil' : 'à régler à la Maison'}"),
      reserver.includes('heuresLibres({ agenda: agendaAuCalibre ?? agenda, dateIso: iso,'), reserver.includes("'Répondez « Je confirme » sur WhatsApp.'")]);
}

console.log(`\n${n - ko}/${n} epreuves tenues${ko ? `, ${ko} en echec` : ''}.`);
if (ko) process.exitCode = 1;
