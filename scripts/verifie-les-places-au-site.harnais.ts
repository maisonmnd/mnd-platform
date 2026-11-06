/* LES PLACES LIMITEES, DE LA BASE AU SITE, EPROUVEES — 4 novembre 2026.
   `node scripts/verifie-les-places-au-site.mjs` (et `--prouve`).

   La decision (Yeman, maquette « Places limitees » AhFRNqiggFoaiR725iKSQe,
   « construis ») : −15 % sur les shampoings, lavages et soins ; du mardi au
   vendredi, jamais le samedi ; seulement un jour vide ; trois places par jour,
   decomptees, puis plus rien sur aucune porte ; une reservation au plein
   tarif ferme les places restantes ; une place prise est gardee ; les jours
   des 14 jours a venir ; jamais pour une tete aux prix convenus, abonnee, ni
   qui a deja une remise ; le Rituel Sowa ne prend aucune remise ; plus de
   code a taper ; reglages et non constantes.

   Ce banc tient la partie BASE + SERVEUR + SITE :
     1. la migration 0154, a la lettre (aucune base ne tourne ici) : chaque
        clause de `placesRestantes` + `occupationDuJour` retrouvee en SQL, la
        porte des clientes qui ne rend que trois colonnes, la garde et son
        predicat ;
     2. le reglage de l'offre, a la lettre ;
     3. la VRAIE fonction demande-submit, contre une base simulee qui compte
        les places par la regle pure : trois places, puis le refus, le jour
        vide, le samedi, l'horizon, une seule remise, la place partie sous
        verrou, le tarif de la Maison, le Sowa ;
     4. le noyau pur du site (places-du-site-pur) et la page, a la lettre.
   Tous les attendus sont ecrits en dur, tires des phrases de la decision. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { occupationDuJour, placesRestantes, ditLesPlaces, offreDuJourDeLaVenue } from '../src/shared/offres-pur';
import { jetonDIdentite } from '../src/shared/lien-du-rdv-pur';
import {
  bandeauDesPlaces, carteDesRemises, estUnCodeDesPlaces, offreDesPlacesOuverte, offreDuJourDuSite, PHRASE_DES_TARIFS_CONVENUS, PHRASE_DU_DOUTE,
  phraseDeLaPlacePartie, phraseDeLaPlaceTenue, phraseDUneSeuleRemise, placesConnuesDe, placesDites, prixConvenusDuRetour,
  BOUTON_DU_TARIF_DE_LA_MAISON,
} from '../src/apps/revelateur/places-du-site-pur';
import { remisesAEcrire } from '../src/apps/revelateur/remise-pure';

declare const __PANNE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${ascii(nom).replace(/^"|"$/g, '')}${ok ? '' : ` -> ${ascii(obtenu).slice(0, 300)}`}`);
};

const racine = process.cwd();
/* Les fichiers lus au texte passent par la panne du banc, s'il y en a une. */
const lis = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__PANNE__ && __PANNE__.fichier === rel) s = s.split(__PANNE__.avant).join(__PANNE__.apres);
  return s;
};
const sansCommentairesSql = (s: string): string => s.replace(/--[^\n]*/g, '');
const sansCommentairesTs = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
/** Le corps d'une fonction SQL, de son `create` à son `$$;`. */
const corpsSql = (sql: string, nom: string): string => {
  const i = sql.indexOf(`create or replace function public.${nom}(`);
  if (i < 0) return '';
  const j = sql.indexOf('$$;', sql.indexOf('$$', i) + 2);
  return j < 0 ? '' : sql.slice(i, j + 3);
};
const dedans = (s: string, ...morceaux: string[]): boolean => morceaux.every((m) => s.includes(m));

/* ══ 1. LA MIGRATION 0154, A LA LETTRE ══════════════════════════════════ */
const SQL = sansCommentairesSql(lis('supabase/migrations/0154_les_places_limitees.sql'));
{
  dit('0154 : le code se normalise comme codeNormalise (blancs otes, majuscules, seize signes)', true,
    dedans(SQL, "select left(upper(regexp_replace(coalesce(v, ''), '\\s+', '', 'g')), 16)"));
  const regle = corpsSql(SQL, 'places_de_l_offre');
  dit('la regle : une offre eteinte ou sans places ne concerne aucun jour', [true, true], [
    dedans(regle, "if not public.abo_vrai(o->'active') then\n    return null;"),
    dedans(regle, "places := floor(coalesce(public.abo_num(o->'placesParJour'), 0));\n  if places <= 0 then\n    return null;"),
  ]);
  dit('... ses jours de la venue, lundi d abord, et sa saison lue sur la date', [true, true, true], [
    dedans(regle, "(array['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'])[extract(isodow from p_jour)::int]"),
    dedans(regle, `if coalesce(o->>'du', '') <> '' and j collate "C" < (o->>'du') collate "C" then`),
    dedans(regle, `if coalesce(o->>'au', '') <> '' and j collate "C" > (o->>'au') collate "C" then`),
  ]);
  dit('... jamais un jour passe, jamais au-dela de l horizon', [true, true], [
    dedans(regle, 'if p_jour < p_aujourdhui then\n    return null;'),
    dedans(regle, "horizon := floor(coalesce(public.abo_num(o->'horizonJours'), 0));\n  if horizon > 0 and (p_jour - p_aujourdhui) > horizon then\n    return null;"),
  ]);
  dit('... l occupation : non annules, celui qu on relit ote, la maison (ou sans maison), le jour', [true, true, true, true], [
    dedans(regle, "and coalesce(a.data->>'status', '') <> 'annulé'"),
    dedans(regle, "and (coalesce(p_sauf, '') = '' or a.id <> p_sauf)"),
    dedans(regle, "and (coalesce(p_branch, '') = '' or coalesce(a.data->>'branchId', '') in ('', p_branch))"),
    dedans(regle, "where left(coalesce(a.data->>'date', ''), 10) = j"),
  ]);
  dit('... une place prise porte l id de l offre, ou son code normalise', true,
    dedans(regle, "select (id_offre <> '' and coalesce(a.data->>'offreId', '') = id_offre)\n          or (code <> '' and public.code_d_offre_normalise(a.data->>'codeOffre') = code) as sienne"));
  dit('... un jour qui n est plus vide ferme ses places ; sinon le reste, jamais sous zero', [true, true], [
    dedans(regle, "if public.abo_vrai(o->'jourVideSeulement') and coalesce(autres, 0) > 0 then\n    return 0;"),
    dedans(regle, 'return greatest(0, places - coalesce(prises, 0))::int;'),
  ]);
  dit('... et elle reste au serveur', true,
    dedans(SQL, 'revoke all on function public.places_de_l_offre(jsonb, text, date, date, text) from public, anon, authenticated;'));

  const porte = corpsSql(SQL, 'places_de_la_remise');
  dit('la porte des clientes : trois colonnes, rien d autre (ni nom, ni rendez-vous)', [true, false, false], [
    dedans(porte, 'returns table (jour text, offre text, places int)'),
    /clientName|clientId|telephone|\ba\.id\b/.test(porte), /select[^;]*a\.data/.test(porte),
  ]);
  dit('... les offres a places de cette maison, ou sans maison', true,
    dedans(porte, "and coalesce(nullif(x->>'branchId', ''), p_branch) = p_branch"));
  dit('... soixante jours au plus', true, dedans(porte, 'least(p_fin, p_debut + 59)::timestamp'));
  dit('... aujourd hui se compte a Cotonou', true, dedans(porte, "(now() at time zone 'Africa/Porto-Novo')::date"));
  dit('... seulement les jours que l offre concerne (null ecarte, 0 garde)', true, dedans(porte, 'where n.restantes is not null'));
  dit('... ouverte a anon, authenticated et au serveur, en definer', [true, true], [
    dedans(SQL, 'grant execute on function public.places_de_la_remise(text, date, date) to anon, authenticated, service_role;'),
    dedans(porte, 'language sql stable security definer set search_path = public'),
  ]);

  const juge = corpsSql(SQL, 'une_seule_remise');
  dit('une seule remise : les fiches du numero, par phone et phone2, non archivees', true,
    dedans(juge, "public.numero_wa(c.data->>'phone') = (select v from num)", "or public.numero_wa(c.data->>'phone2') = (select v from num)", "coalesce(c.data->>'archived', '') <> 'true'"));
  dit('... un prix convenu de plus de zero franc', true,
    dedans(juge, "where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0"));
  dit('... un contrat vivant au jour de la venue (le juge de 0138)', true,
    dedans(juge, 'and lj.d >= public.abo_debut(s.data)', "not in ('resiliee', 'effacee', 'terminee')"));
  dit('... une remise famille : le taux pose, sinon le bareme du foyer (2 tetes 10, 3 et plus 15)', true,
    dedans(juge, "when jsonb_typeof(fo.data->'remisePct') = 'number' then (fo.data->>'remisePct')::numeric", 'case when k.n >= 3 then 15 when k.n = 2 then 10 else 0 end'));
  dit('... reservee au serveur', true,
    dedans(SQL, 'revoke all on function public.une_seule_remise(text, date) from public, anon, authenticated;', 'grant execute on function public.une_seule_remise(text, date) to service_role;'));

  const garde = corpsSql(SQL, 'garde_des_places_limitees');
  dit('la garde : le comptoir du Trone decide (is_staff), jamais ecriture_de_la_maison qui laisserait passer le serveur', [true, false], [
    dedans(garde, 'if public.is_staff() then\n    return new;'), garde.includes('ecriture_de_la_maison'),
  ]);
  dit('... une ligne sans offre ou annulee ne prend rien', true,
    dedans(garde, "if (id_offre = '' and code = '') or coalesce(new.data->>'status', '') = 'annulé' then\n    return new;"));
  dit('... l offre a places par son identifiant, sinon son code', true,
    dedans(garde, "and ((id_offre <> '' and coalesce(x->>'id', '') = id_offre)\n          or (code <> '' and public.code_d_offre_normalise(x->>'code') = code))"));
  dit('... une place tenue (meme offre, meme jour, ligne vivante) ne se rejuge jamais', true,
    dedans(garde, "if tg_op = 'UPDATE'\n     and coalesce(old.data->>'status', '') <> 'annulé'\n     and left(coalesce(old.data->>'date', ''), 10) = jour"));
  dit('... la derniere place se departage sous le verrou de la pose', true,
    dedans(garde, "perform pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || jour));"));
  dit('... compte sans la ligne elle-meme, a Cotonou, et refuse sans place', [true, true], [
    dedans(garde, "public.places_de_l_offre(o, branche, le_jour, (now() at time zone 'Africa/Porto-Novo')::date, new.id)"),
    dedans(garde, "if coalesce(reste, 0) <= 0 then\n    raise exception 'PLACES_LIMITEES:"),
  ]);
  dit('... avant chaque ecriture de rendez-vous', true,
    dedans(SQL, 'create trigger places_limitees\n  before insert or update on public.appointments\n  for each row execute function public.garde_des_places_limitees();'));
  dit('aucune constante de la decision dans la migration (ni 3 places, ni 14 jours, ni 15 %)', null,
    /placesParJour'?\)?\s*[<>=]+\s*3\b|horizon\s*[<>=]+\s*14\b|\b15\s*%|'Mar', 'Mer', 'Jeu', 'Ven'\]/.exec(SQL)?.[0] ?? null);
  dit('rien de destructif', null, /\b(drop\s+table|drop\s+schema|truncate|delete\s+from|drop\s+column)\b/i.exec(SQL)?.[0] ?? null);
}

/* ══ 2. LE REGLAGE, A LA LETTRE ═════════════════════════════════════════ */
{
  const R = sansCommentairesSql(lis('supabase/reglage_places_limitees_20261104.sql'));
  dit('le reglage : les copies de repli d abord, RLS aussitot', [true, true, true, true], [
    dedans(R, "create table if not exists public.repli_mnd_offers_20261104_places as\n  select * from public.documents where key = 'mnd_offers';"),
    dedans(R, 'alter table public.repli_mnd_offers_20261104_places enable row level security;'),
    dedans(R, "create table if not exists public.repli_catalog_services_20261104_sowa as\n  select * from public.catalog_services where id = '1740l5ysxj';"),
    dedans(R, 'alter table public.repli_catalog_services_20261104_sowa enable row level security;'),
  ]);
  dit('l offre telle que decidee', Array(14).fill(true), [
    dedans(R, "'id', 'of-places-limitees'"), dedans(R, "'code', 'PLACES15'"), dedans(R, "'title', 'Places limitées'"),
    dedans(R, "'discountPct', 15,"), dedans(R, `'joursDeLaVenue', '["Mar","Mer","Jeu","Ven"]'::jsonb`),
    dedans(R, "'placesParJour', 3,"), dedans(R, "'jourVideSeulement', true,"), dedans(R, "'horizonJours', 14,"),
    dedans(R, "'du', '2026-11-05',"), !/'au',/.test(R), dedans(R, "'vitrine', true,"), dedans(R, "'branchId', 'br-40r6u6frno',"),
    dedans(R, "'active', true,"), dedans(R, "'serviceIds', gestes.ids,"),
  ]);
  dit('... ses gestes sont ceux du mercredi de la Maison', true, dedans(R, "and e->>'id' = 'of-mercredi15'\n       and jsonb_typeof(e->'serviceIds') = 'array'"));
  dit('rejouable : rien ne s ajoute si l offre ou son code existe deja', true,
    dedans(R, "where e->>'id' = 'of-places-limitees'\n         or upper(regexp_replace(coalesce(e->>'code', ''), '\\s+', '', 'g')) = 'PLACES15'"));
  dit('le Sowa marque sans remise, une fois', true,
    dedans(R, "update public.catalog_services\n   set data = data || '{\"sansRemise\": true}'::jsonb\n where id = '1740l5ysxj'\n   and coalesce(data->>'sansRemise', '') <> 'true';"));
  dit('deux ecritures et pas une de plus : le mercredi n est pas touche', [2, false], [
    (R.match(/\bupdate public\./g) ?? []).length, /of-mercredi15[^\n]*'\{active\}'|jsonb_set\([^)]*active/.test(R)]);
  const lus = [...R.matchAll(/'(sub|conditions|title|tag|deal|bouton)', '([^']*)'/g)].map((m) => m[2]);
  dit('les mots lus par la cliente : ni tiret long, ni salon, et Places limitees dit', [[], true],
    [lus.filter((t) => /—|\bsalons?\b/i.test(t)), lus.some((t) => t.includes('Places limitées'))]);
  dit('rien de destructif', null, /\b(drop\s+table|drop\s+schema|truncate|delete\s+from|drop\s+column)\b/i.exec(R)?.[0] ?? null);
}

/* ══ 3. LA VRAIE FONCTION demande-submit, CONTRE UNE BASE SIMULEE ══════════ */
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
  for (const brut of cols.split(',').map((c) => c.trim()).filter(Boolean)) r[brut] = structuredClone(valeur(l, brut));
  return r;
}
class Requete {
  private filtres: ((l: Ligne) => boolean)[] = [];
  private mode: 'select' | 'update' | 'upsert' | 'insert' | 'delete' = 'select';
  private cols = '*';
  private tete = false;
  private plafond = Infinity;
  private tri: [string, boolean] | null = null;
  private seule = false;
  private charge: any = null;
  private options: any = {};
  constructor(private t: string) {}
  select(cols = '*', o: { head?: boolean } = {}) { if (this.mode === 'select') { this.cols = cols; this.tete = !!o.head; } return this; }
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
  maybeSingle() { this.seule = true; return this; }
  single() { this.seule = true; return this; }
  update(d: any) { this.mode = 'update'; this.charge = d; return this; }
  upsert(d: any, o: any = {}) { this.mode = 'upsert'; this.charge = d; this.options = o; return this; }
  insert(d: any) { this.mode = 'insert'; this.charge = d; return this; }
  delete() { this.mode = 'delete'; return this; }
  private execute(): { data: any; error: any; count?: number } {
    const lignes = table(this.t);
    if (this.mode === 'insert' || this.mode === 'upsert') {
      const cle = this.options.onConflict ?? cleDe(this.t);
      for (const brut of [].concat(this.charge)) {
        const l: Ligne = { at: new Date().toISOString(), ...structuredClone(brut) };
        const i = lignes.findIndex((x) => x[cle] !== undefined && x[cle] === l[cle]);
        if (i >= 0 && this.mode === 'upsert') { if (!this.options.ignoreDuplicates) lignes[i] = l; } else lignes.push(l);
      }
      return { data: null, error: null };
    }
    const vues = lignes.filter((l) => this.filtres.every((f) => f(l)));
    if (this.mode === 'update') { for (const l of vues) Object.assign(l, structuredClone(this.charge)); return { data: null, error: null }; }
    if (this.mode === 'delete') { TABLES[this.t] = lignes.filter((l) => !vues.includes(l)); return { data: null, error: null }; }
    let rendues = vues;
    if (this.tri) { const [c, asc] = this.tri; rendues = [...rendues].sort((a, b) => String(valeur(a, c)).localeCompare(String(valeur(b, c))) * (asc ? 1 : -1)); }
    const compte = rendues.length;
    rendues = rendues.slice(0, this.plafond);
    if (this.tete) return { data: null, error: null, count: compte };
    const data = rendues.map((l) => projette(l, this.cols));
    if (this.seule) return { data: data[0] ?? null, error: null };
    return { data, error: null, count: compte };
  }
  then(ok: (r: any) => unknown, ko2?: (e: unknown) => unknown) {
    try { return Promise.resolve(this.execute()).then(ok, ko2); } catch (e) { return Promise.reject(e).then(ok, ko2); }
  }
}

/* Les jours, comptes a Cotonou depuis aujourd'hui : le banc vaut chaque jour. */
const AUJ = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const plus = (iso: string, n: number): string => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const isodow = (iso: string): number => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
const prochain = (dow: number): string => { for (let i = 1; i <= 7; i++) { const d = plus(AUJ, i); if (isodow(d) === dow) return d; } return ''; };
const MARDI = prochain(2); const MERCREDI = prochain(3); const JEUDI = prochain(4); const VENDREDI = prochain(5); const SAMEDI = prochain(6);
const [MARDI2, MERCREDI2, JEUDI2, VENDREDI2] = [MARDI, MERCREDI, JEUDI, VENDREDI].map((d) => plus(d, 7));
const [MERCREDI3, JEUDI3] = [MERCREDI, JEUDI].map((d) => plus(d, 14));
/* L'HORIZON EST UN REGLAGE : 21 jours ici (la decision en dit 14, que
   `verifie-les-places-limitees` eprouve). Un mardi a 22 jours au moins est
   au-dela, et reste dans les 90 jours de la reservation. */
const LOIN = plus(MARDI, 21);

const LA_MAISON = 'br-maison';
const PLACES = {
  id: 'of-places-limitees', branchId: LA_MAISON, title: 'Places limitées', active: true, code: 'PLACES15', discountPct: 15,
  serviceIds: ['sv-shampoing', 'sv-soin', 'sv-sowa'], joursDeLaVenue: ['Mar', 'Mer', 'Jeu', 'Ven'],
  placesParJour: 3, jourVideSeulement: true, horizonJours: 21,
};
const MERCREDI15 = { id: 'of-mercredi15', branchId: LA_MAISON, active: false, code: 'MERCREDI15', discountPct: 15, serviceIds: ['sv-shampoing', 'sv-soin'], joursDeLaVenue: ['Mer'] };
const RENTREE = { id: 'of-rentree', branchId: LA_MAISON, active: true, code: 'RENTREE10', discountPct: 10, serviceIds: ['sv-retwist'] };
const service = (id: string, name: string, priceXof: number, plus2: Record<string, unknown> = {}) =>
  ({ id, data: { name, categoryId: 'atl-iii-yekpe', priceXof, priceMode: 'fixe', durationMin: 60, ...plus2 } });
table('branches').push({ id: LA_MAISON, data: { name: 'Maison MND', flagship: true, status: 'active', masters: ['Expert', 'Team'], seats: 2 } });
table('catalog_categories').push({ id: 'atl-iii-yekpe', data: { label: 'Entretien' } });
table('catalog_services').push(
  service('sv-shampoing', 'Shampoing', 10_000), service('sv-soin', 'Soin hydratant', 20_000),
  service('sv-retwist', 'Retwist', 30_000), service('sv-sowa', 'Rituel Sowa', 25_000, { sansRemise: true }),
);
const HEURES = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam'].map((key) => ({ key, open: '09h00', close: '18h00' }));
table('documents').push(
  { key: 'mnd_settings', data: { hours: [...HEURES, { key: 'dim', closed: true, open: '09h00', close: '18h00' }] } },
  { key: 'mnd_horaires_exceptions', data: [] },
  { key: 'mnd_vitrine_config', data: {} },
  { key: 'mnd_offers', data: [MERCREDI15, PLACES, RENTREE] },
);
table('clients').push({ id: 'cl-convenus', data: { name: 'Awa Dossou', civilite: 'madame', phone: '+2290197000090', prixFixes: { 'sv-retwist': 25_000 } } });
table('clients').push({ id: 'cl-simple', data: { name: 'Sena Houngbo', civilite: 'madame', phone: '+2290197000091' } });

/* Ce que porte un numero (`une_seule_remise`), par ses chiffres. */
const TETES: Record<string, { prixConvenus?: boolean; abonnee?: boolean; famille?: boolean }> = {
  '2290197000021': { prixConvenus: true }, '2290197000022': { abonnee: true }, '2290197000023': { famille: true },
};
let POSE_REFUSEE = false;
let PLACES_EN_PANNE = false;
/* DANS LE DOUTE, PAS DE REMISE (4 novembre 2026) : la lecture du numero en
   panne, ou une reponse sans ses trois oui/non. */
let NUMERO_LU: 'ok' | 'panne' | 'incomplet' = 'ok';
const rpc = async (nom: string, a: any): Promise<{ data: any; error: any }> => {
  if (nom === 'creneaux_occupes') return { data: [], error: null };
  if (nom === 'places_en_ligne') return { data: 1, error: null };
  if (nom === 'places_de_la_remise') {
    if (PLACES_EN_PANNE) return { data: null, error: { message: 'panne de banc' } };
    /* La base simulee compte par la regle pure (le miroir de 0154). */
    const offres = (table('documents').find((d) => d.key === 'mnd_offers')?.data ?? []) as any[];
    const rdvs = table('appointments').map((l) => ({ id: l.id, ...l.data }));
    const out: { jour: string; offre: string; places: number }[] = [];
    for (let j = a.p_debut; j <= a.p_fin; j = plus(j, 1)) {
      for (const o of offres) {
        if (o.branchId && o.branchId !== a.p_branch) continue;
        const n = placesRestantes(o, j, occupationDuJour(o, rdvs, j, { branchId: a.p_branch }), AUJ);
        if (n !== null) out.push({ jour: j, offre: o.id, places: n });
      }
    }
    return { data: out, error: null };
  }
  if (nom === 'une_seule_remise') {
    if (NUMERO_LU === 'panne') return { data: null, error: { message: 'panne de banc' } };
    if (NUMERO_LU === 'incomplet') return { data: { prixConvenus: false }, error: null };
    const t = TETES[String(a.p_numero ?? '').replace(/\D/g, '')] ?? {};
    return { data: { prixConvenus: !!t.prixConvenus, abonnee: !!t.abonnee, famille: !!t.famille }, error: null };
  }
  if (nom === 'pose_si_libre') {
    if (POSE_REFUSEE) { POSE_REFUSEE = false; return { data: null, error: { message: `PLACES_LIMITEES: plus aucune place à la remise le ${a.p_rdv?.date}` } }; }
    const id = String(a.p_rdv?.id);
    const master = (a.p_maitres ?? [])[0] ?? '';
    table('appointments').push({ id, branch_id: a.p_rdv?.branchId, data: { ...a.p_rdv, master } });
    return { data: { ok: true, verdict: 'pose', id, master }, error: null };
  }
  return { data: null, error: { message: `rpc ${nom} absente du banc` } };
};
const client = { from: (t: string) => new Requete(t), rpc, storage: { from: () => ({ remove: async () => ({ error: null }) }) } };

const ENV: Record<string, string | undefined> = {
  SUPABASE_URL: 'http://faux.local', SUPABASE_SERVICE_ROLE_KEY: 'le-secret-de-la-plateforme', CLE_SERVICE: 'la-cle-de-la-maison',
  WA_TOKEN: 'jeton-meta-de-banc', WA_PHONE_ID: '1234',
};
const SERVIS: ((req: Request) => Promise<Response>)[] = [];
const EN_FOND: Promise<unknown>[] = [];
(globalThis as any).__faux = { client: () => client };
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] }, serve: (h: any) => { SERVIS.push(h); } };
(globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => { EN_FOND.push(p); } };
(globalThis as any).fetch = async (url: string) => (String(url).includes('graph.facebook.com')
  ? new Response(JSON.stringify({ messages: [{ id: 'wamid.banc' }] }), { status: 200 })
  : new Response(JSON.stringify({}), { status: 200 }));
console.error = () => {};
const attendsLeFond = async () => { while (EN_FOND.length) await Promise.allSettled(EN_FOND.splice(0)); };

const serveur = await import('../supabase/functions/demande-submit/index.ts') as any;
const [servir] = SERVIS;
let ipN = 0;
let telN = 30;
const appelle = async (corps: unknown) => {
  const r = await servir(new Request('http://faux.local/functions/v1/demande-submit', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${++ipN}` }, body: JSON.stringify(corps),
  }));
  const json = await r.json();
  await attendsLeFond();
  return { statut: r.status, corps: json };
};
const reserve = (date: string, serviceIds: string[], plus2: Record<string, unknown> = {}) => appelle({
  genre: 'rdv',
  data: {
    prenom: 'Cliente', civilite: 'madame', telephone: `01970000${String(++telN).padStart(2, '0')}`, dial: '+229', besoin: 'entretien',
    consentement: true, serviceIds, date, time: '10:00', ...plus2,
  },
});
const rdvDe = (apptId: unknown) => table('appointments').find((l) => l.id === apptId)?.data;
const compte = () => [table('demandes').length, table('appointments').length, table('messages_wa').length];

/* ── 3a. Trois places, decomptees, puis plus rien ── */
const p1 = await reserve(MARDI, ['sv-shampoing', 'sv-retwist']);
dit('un mardi vide : la place se pose d elle-meme, sans code tape', [200, true, 'PLACES15', true, 'of-places-limitees'],
  [p1.statut, p1.corps.placeLimitee, p1.corps.code, p1.corps.codeApplique, p1.corps.offreId]);
dit('... le rendez-vous porte son code, son offre, et -15 % sur la seule ligne couverte', ['PLACES15', 'of-places-limitees', [{ pct: 15 }, null]],
  [rdvDe(p1.corps.apptId)?.codeOffre, rdvDe(p1.corps.apptId)?.offreId, rdvDe(p1.corps.apptId)?.remisesLignes]);
dit('... la note le dit, sans « code » a taper', true, /place limitée/.test(String(rdvDe(p1.corps.apptId)?.note)));
const p2 = await reserve(MARDI, ['sv-shampoing'], { code: 'PLACES15' });
const p3 = await reserve(MARDI, ['sv-soin'], { code: 'PLACES15' });
dit('la deuxieme et la troisieme place se prennent', [true, true], [p2.corps.placeLimitee, p3.corps.placeLimitee]);
const avant4 = compte();
const p4 = await reserve(MARDI, ['sv-shampoing'], { code: 'PLACES15' });
dit('la quatrieme, que la page montrait encore : refusee, la page le dira', [409, 'places_limitees'], [p4.statut, p4.corps.error]);
dit('... et rien ne s est ecrit (ni demande, ni rendez-vous, ni fil)', avant4, compte());
const p5 = await reserve(MARDI, ['sv-shampoing']);
dit('sans code, ce jour plein se reserve au tarif de la Maison', [200, true, undefined, undefined], [p5.statut, p5.corps.confirme, p5.corps.placeLimitee, rdvDe(p5.corps.apptId)?.remisesLignes]);

/* ── 3b. Le jour vide, le samedi, l horizon ── */
await reserve(MERCREDI, ['sv-retwist']);
const m2 = await reserve(MERCREDI, ['sv-shampoing'], { code: 'PLACES15' });
dit('une reservation au plein tarif ferme le jour : la place n est plus', [409, 'places_limitees'], [m2.statut, m2.corps.error]);
const s1 = await reserve(SAMEDI, ['sv-shampoing'], { code: 'PLACES15' });
const s2 = await reserve(SAMEDI, ['sv-shampoing']);
dit('jamais le samedi, meme avec le code ; sans lui, le tarif de la Maison', [409, 200, undefined], [s1.statut, s2.statut, s2.corps.placeLimitee]);
const l1 = await reserve(LOIN, ['sv-shampoing'], { code: 'PLACES15' });
const l2 = await reserve(JEUDI3, ['sv-shampoing'], { code: 'PLACES15' });
dit('au-dela de l horizon regle : rien ; en deca, la place', [409, true], [l1.statut, l2.corps.placeLimitee]);

/* ── 3c. Une seule remise ── */
const reserveAvec = (tel: string, date: string, plus2: Record<string, unknown> = {}) => appelle({
  genre: 'rdv', data: { prenom: 'Tete', civilite: 'madame', telephone: tel, dial: '+229', besoin: 'entretien', consentement: true, serviceIds: ['sv-shampoing'], date, time: '11:00', code: 'PLACES15', ...plus2 },
});
const c1 = await reserveAvec('0197000021', JEUDI);
dit('ses prix convenus : la place n est pas prise, la page dit pourquoi, la place est posee', [200, true, undefined, 'prix-convenus', undefined],
  [c1.statut, c1.corps.confirme, c1.corps.placeLimitee, c1.corps.uneSeuleRemise, rdvDe(c1.corps.apptId)?.remisesLignes]);
dit('... la note le dit a l accueil', true, /une seule remise : ses prix convenus/.test(String(rdvDe(c1.corps.apptId)?.note)));
const c2 = await reserveAvec('0197000022', VENDREDI);
const c3 = await reserveAvec('0197000023', MARDI2);
dit('abonnee, ou remise famille : de meme', [['abonnee', undefined], ['famille', undefined]],
  [[c2.corps.uneSeuleRemise, c2.corps.placeLimitee], [c3.corps.uneSeuleRemise, c3.corps.placeLimitee]]);
const c4 = await reserve(VENDREDI2, ['sv-retwist', 'sv-shampoing'], { code: 'RENTREE10' });
dit('un autre code : sa remise, jamais une place par-dessus', ['RENTREE10', undefined, [{ pct: 10 }, null]],
  [c4.corps.code, c4.corps.placeLimitee, rdvDe(c4.corps.apptId)?.remisesLignes]);

/* ── 3d. Le tarif de la Maison, la place partie sous verrou, la panne, le Sowa ── */
const t1 = await reserve(MERCREDI2, ['sv-shampoing'], { tarifDeLaMaison: true, code: 'PLACES15' });
dit('le tarif de la Maison choisi : ni remise, ni refus', [200, undefined, undefined], [t1.statut, t1.corps.placeLimitee, rdvDe(t1.corps.apptId)?.remisesLignes]);
POSE_REFUSEE = true;
const avantR = compte();
const r1 = await reserve(JEUDI2, ['sv-shampoing'], { code: 'PLACES15' });
dit('la base refuse la derniere place sous verrou : la page le dira', [409, 'places_limitees'], [r1.statut, r1.corps.error]);
dit('... la demande et son fil, ecrits un instant plus tot, s effacent', avantR, compte());
PLACES_EN_PANNE = true;
const z1 = await reserve(JEUDI2, ['sv-shampoing']);
PLACES_EN_PANNE = false;
dit('les places illisibles : la place se pose sans remise, jamais sur un jour non compte', [200, undefined, undefined],
  [z1.statut, z1.corps.placeLimitee, rdvDe(z1.corps.apptId)?.remisesLignes]);
const sw = await reserve(MERCREDI3, ['sv-sowa'], { code: 'PLACES15' });
dit('le Rituel Sowa ne prend aucune remise, et ce n est pas une place partie', [200, undefined, undefined],
  [sw.statut, sw.corps.placeLimitee, rdvDe(sw.corps.apptId)?.remisesLignes]);

/* ── 3f. Dans le doute, pas de remise (Yeman, au selecteur, 4 novembre 2026) ──
   Si ce que porte le numero (`une_seule_remise`) ne se relit pas, la place ne
   se pose pas : le rendez-vous tient au tarif de la Maison, la reponse et la
   note le disent ; jamais un prix change en silence. */
const [MARDI3, VENDREDI3] = [MARDI, VENDREDI].map((d) => plus(d, 14));
NUMERO_LU = 'panne';
const d1 = await reserve(MARDI3, ['sv-shampoing', 'sv-retwist'], { code: 'PLACES15' });
NUMERO_LU = 'incomplet';
const d2 = await reserve(VENDREDI3, ['sv-shampoing'], { code: 'PLACES15' });
NUMERO_LU = 'ok';
dit('le numero ne se relit pas : le rendez-vous tient, sans place, sans remise, sans code, et la reponse le dit',
  [200, true, undefined, 'illisible', undefined, undefined, undefined],
  [d1.statut, d1.corps.confirme, d1.corps.placeLimitee, d1.corps.uneSeuleRemise, rdvDe(d1.corps.apptId)?.remisesLignes, rdvDe(d1.corps.apptId)?.codeOffre, d1.corps.codeApplique]);
dit('... la note du rendez-vous le dit a l accueil, sobrement', true,
  /dans le doute, sans place limitée : ce que porte son numéro n’a pas pu se relire/.test(String(rdvDe(d1.corps.apptId)?.note)));
dit('... une reponse qui ne dit pas ses trois oui/non : de meme', [200, 'illisible', undefined, undefined],
  [d2.statut, d2.corps.uneSeuleRemise, d2.corps.placeLimitee, rdvDe(d2.corps.apptId)?.remisesLignes]);
dit('... la page dit le doute, sans prix a sa place', [true, false, false],
  [phraseDUneSeuleRemise('illisible') === PHRASE_DU_DOUTE && PHRASE_DU_DOUTE.length > 0, /\d/.test(PHRASE_DU_DOUTE), /—|\bsalon/.test(PHRASE_DU_DOUTE)]);
/* Le troisieme jeudi garde deux places (l2 en a pris une, plus haut). */
const d3 = await reserve(JEUDI3, ['sv-shampoing'], { code: 'PLACES15' });
dit('... la lecture revenue, la place se pose de nouveau', [200, true, undefined], [d3.statut, d3.corps.placeLimitee, d3.corps.uneSeuleRemise]);

/* ── 3e. Le noyau du serveur, et ses prix convenus dits avant la confirmation ── */
dit('le serveur lit les places de la base, rien sur une panne ni un jour non dit', [2, null, null, null], [
  serveur.placesLuesPour([{ jour: MARDI, offre: 'of-x', places: 2 }], 'of-x', MARDI), serveur.placesLuesPour(null, 'of-x', MARDI),
  serveur.placesLuesPour([{ jour: MARDI, offre: 'of-x', places: 2 }], 'of-x', MERCREDI), serveur.placesLuesPour([{ jour: MARDI, offre: 'of-x', places: -1 }], 'of-x', MARDI),
]);
dit('... un code des places ne vaut pas un code d offre', [true, true, false], [
  serveur.estUnCodeDesPlaces([PLACES], ' places 15 '), serveur.estUnCodeDesPlaces([{ ...PLACES, active: false }], 'PLACES15'),
  serveur.estUnCodeDesPlaces([PLACES, RENTREE], 'RENTREE10')]);
const candidat = { offre: PLACES, remisesLignes: [{ pct: 15 }] };
dit('... une lecture du numero en panne : dans le doute, pas de place (4 novembre 2026)', { raison: 'illisible' }, serveur.laPlaceTranchee(candidat, null));
dit('... une tete lue sans autre remise : la place', true, 'verdict' in serveur.laPlaceTranchee(candidat, { prixConvenus: false, abonnee: false, famille: false }));
const SECRET = ENV.SUPABASE_SERVICE_ROLE_KEY as string;
const jusqua = plus(AUJ, 3);
const lu1 = await appelle({ cliente: 'lire', identite: await jetonDIdentite(SECRET, 'cl-convenus', jusqua) });
const lu2 = await appelle({ cliente: 'lire', identite: await jetonDIdentite(SECRET, 'cl-simple', jusqua) });
dit('son lien de retour dit ses prix convenus, et seulement s ils existent', [true, true, false],
  [lu1.corps.prixConvenus === true, lu1.corps.ok === true && !!lu1.corps.cliente, 'prixConvenus' in lu2.corps]);
dit('... la page le lit', [true, false], [prixConvenusDuRetour(lu1.corps), prixConvenusDuRetour(lu2.corps)]);

/* ══ 4. LE SITE ══════════════════════════════════════════════════════════ */
{
  /* 4a. Le noyau pur. */
  const carte = carteDesRemises([
    { jour: MARDI, offre: 'of-places-limitees', places: 2 }, { jour: MERCREDI, offre: 'of-places-limitees', places: 0 },
    { jour: 'x', offre: 'of-places-limitees', places: 3 }, { jour: JEUDI, offre: '', places: 3 }, { jour: JEUDI, offre: 'of-places-limitees', places: -2 },
  ]);
  dit('la carte du site : une ligne illisible ne vaut ni zero ni trois', { [MARDI]: { 'of-places-limitees': 2 }, [MERCREDI]: { 'of-places-limitees': 0 } }, carte);
  dit('... une reponse qui n est pas une liste : une carte vide', {}, carteDesRemises({ error: 'x' }));
  dit('... les places lues, ou rien', [2, 0, null, null], [placesConnuesDe(carte, PLACES.id, MARDI), placesConnuesDe(carte, PLACES.id, MERCREDI), placesConnuesDe(carte, PLACES.id, JEUDI), placesConnuesDe(carte, undefined, MARDI)]);
  const venue = (dateIso: string, plus2: Record<string, unknown> = {}) =>
    offreDuJourDuSite([MERCREDI15, PLACES, RENTREE], carte, { branchId: LA_MAISON, dateIso, serviceIds: ['sv-shampoing'], aujourdhui: AUJ, ...plus2 })?.id ?? null;
  dit('le site pose la remise un jour qui a des places lues', 'of-places-limitees', venue(MARDI));
  dit('... rien un jour a zero, rien un jour non lu', [null, null], [venue(MERCREDI), venue(JEUDI)]);
  dit('... rien le samedi, meme si la base disait des places', null,
    offreDuJourDuSite([PLACES], { [SAMEDI]: { [PLACES.id]: 3 } }, { branchId: LA_MAISON, dateIso: SAMEDI, serviceIds: ['sv-shampoing'], aujourdhui: AUJ })?.id ?? null);
  dit('... rien pour ses prix convenus, un autre code, ou le tarif de la Maison choisi', [null, null, null],
    [venue(MARDI, { prixConvenus: true }), venue(MARDI, { dejaUnCode: true }), venue(MARDI, { ecartee: true })]);
  dit('... la meme regle que l original, a places connues egales', offreDuJourDeLaVenue([PLACES], { dateIso: MARDI, serviceIds: ['sv-shampoing'], placesConnues: 2 })?.id ?? null, venue(MARDI));
  dit('... et l ancien mercredi, eteint, ne revient pas', null,
    offreDuJourDuSite([MERCREDI15], {}, { branchId: LA_MAISON, dateIso: MERCREDI, serviceIds: ['sv-shampoing'], aujourdhui: AUJ })?.id ?? null);
  dit('le code des places ne se tape pas', [true, false, false], [estUnCodeDesPlaces([PLACES], 'places15'), estUnCodeDesPlaces([PLACES], 'RENTREE10'), estUnCodeDesPlaces([PLACES], '')]);
  dit('le bandeau : seulement quand un jour a encore une place', ['of-places-limitees', null, null], [
    offreDesPlacesOuverte([PLACES], carte, LA_MAISON)?.id ?? null, offreDesPlacesOuverte([PLACES], { [MARDI]: { [PLACES.id]: 0 } }, LA_MAISON)?.id ?? null,
    offreDesPlacesOuverte([{ ...PLACES, active: false }], carte, LA_MAISON)?.id ?? null]);
  dit('les mots de la decision', [
    '−15 % sur les shampoings, lavages et soins · Places limitées', 'La dernière place à −15 % vient de partir.', 'Vos tarifs convenus s’appliquent.',
    '3 places', '1 place', 'Remise : il reste une place', 'Confirmer au tarif de la Maison',
  ], [bandeauDesPlaces(PLACES), phraseDeLaPlacePartie(PLACES), PHRASE_DES_TARIFS_CONVENUS, placesDites(3), placesDites(1), ditLesPlaces(1), BOUTON_DU_TARIF_DE_LA_MAISON]);
  dit('... jamais « −0 % » pour une offre sans taux', [false, false, false],
    [/−0/.test(bandeauDesPlaces({})), /−0/.test(phraseDeLaPlacePartie({})), /−0/.test(phraseDeLaPlaceTenue(null))]);
  dit('... le serveur tranche, la confirmation dit laquelle', ['Vos tarifs convenus s’appliquent.', true, true, ''],
    [phraseDUneSeuleRemise('prix-convenus'), /abonnement/.test(phraseDUneSeuleRemise('abonnee')), /remise famille/.test(phraseDUneSeuleRemise('famille')), phraseDUneSeuleRemise('autre')]);
  const pur = lis('src/apps/revelateur/places-du-site-pur.ts');
  const mots = [...sansCommentairesTs(pur).matchAll(/(['`])((?:(?!\1).)*)\1/g)].map((m) => m[2]);
  dit('... ni tiret long, ni salon, et la place tenue se dit', [[], true],
    [mots.filter((t) => /—|\bsalons?\b/i.test(t)), /place limitée est tenue/.test(phraseDeLaPlaceTenue(PLACES))]);

  /* 4b. Les remises au defilement, la page des offres. */
  dit('une offre a places ne revient pas au defilement (pas de fin, pas de code a copier)', ['of-rentree-datee'],
    remisesAEcrire([{ ...PLACES, du: '2026-11-05', deal: '−15 %', vitrine: true }, { ...RENTREE, id: 'of-rentree-datee', du: '2026-09-01', au: '2099-09-30', title: 'La rentrée', deal: '−10 %' }]).map((r) => r.id));
  const offresTsx = sansCommentairesTs(lis('src/apps/revelateur/ilots/Offres.tsx'));
  dit('la carte de l offre a places : sans code, et un bouton sans code', [true, true], [
    offresTsx.includes('{estAPlaces(o) ? (\n                    <p className="offre-site__code"><span>sans code</span><b>Places limitées</b></p>'),
    offresTsx.includes('href={laPorte(estAPlaces(o) ? { parcours: o.parcours } : o)}')]);

  /* 4c. La lecture des places, a la lettre. */
  const ag = sansCommentairesTs(lis('src/apps/revelateur/agenda.ts'));
  dit('le site lit places_de_la_remise comme places_en_ligne_du, sur la meme fenetre', [true, true, true], [
    ag.includes('/rest/v1/rpc/places_de_la_remise'),
    ag.includes("body: JSON.stringify({ p_branch: branchId, p_debut: du, p_fin: au }),\n      });\n      return r.ok ? carteDesRemises(await r.json()) : {};"),
    ag.includes('lesRemises && devine === agenda.branchId ? lesRemises : placesDeLaRemise(agenda.branchId, du, au),')]);
  dit('... et ne rejette jamais (carte vide, aucune remise)', true,
    /export async function placesDeLaRemise[\s\S]{0,1400}return error \? \{\} : carteDesRemises\(data\);\n  \} catch \{\n    return \{\};/.test(ag));

  /* 4d. La page de reservation, a la lettre. */
  const r = sansCommentairesTs(lis('src/apps/revelateur/ilots/Reserver.tsx'));
  dit('la page passe les places lues a la regle, pour chaque jour et pour le choix', [true, true, true], [
    r.includes('offreDuJourDuSite(offres, remisesParJour, venueDuJour(iso, prixConvenusConnus))'),
    r.includes('offreDuJourDuSite(offres, remisesParJour, venueDuJour(jour || null, prixConvenusConnus))'),
    r.includes('setRemisesParJour(remises);')]);
  dit('... le code des places n est pas un code d offre', true, r.includes('const offreDuMoment = codeDesPlaces ? null : offreDuCodeTape;'));
  dit('... ses prix convenus connus ecartent la place et le disent', [true, true], [
    r.includes("...(convenus ? { prixConvenus: true } : {})"), (r.match(/\{sesTarifsConvenus && <p className="(?:code-offre__dit|legende)">\{PHRASE_DES_TARIFS_CONVENUS\}<\/p>\}/g) ?? []).length === 2]);
  /* LE MOIS EN GRILLE (6 novembre 2026) : la case d'un jour est trop petite
     pour « 3 places » ; elle les dit au lecteur d'ecran, et ses heures, juste
     dessous, les disent en toutes lettres. */
  dit('... chaque jour dit ses places ; le choix dit « Remise : il reste N places »', [true, true, true], [
    r.includes('places: restent !== null ? ditLesPlaces(restent) : null })'),
    r.includes('{restent !== null && <small className="places-du-jour">{ditLesPlaces(restent)}</small>}'),
    r.includes('{ditLesPlaces(placesDuChoix)} · {bandeauDesPlaces(offreDuJour)}')]);
  dit('... le bandeau quand un jour a des places', true, r.includes('{desPlacesOuvertes && <p className="bandeau-des-places" role="note">{bandeauDesPlaces(desPlacesOuvertes)}</p>}'));
  dit('... au panier, « place limitee » et le decompte', [true, true], [
    r.includes('{offreDesPlaces && <small className="panier__place">place limitée</small>}'),
    r.includes('<p className="legende remise-du-jour">{ditLesPlaces(placesDuChoix)} · Places limitées</p>')]);
  dit('... la place partie se dit, se relit, et le tarif de la Maison se choisit', [true, true, true, true], [
    /if \(code === 'places_limitees'\) \{\s*setPlacePartie\(offreDuJour \?\? \{ discountPct: 0 \}\);/.test(r),
    r.includes('setRemisesParJour(await placesDeLaRemise(agenda.branchId, suite[0], suite[suite.length - 1]));'),
    r.includes('<p className="erreur">{phraseDeLaPlacePartie(placePartie)}</p>'),
    r.includes('...(tarifDeLaMaison ? { tarifDeLaMaison: true } : {}),')]);
  dit('... le prix de la confirmation est celui que le serveur a pose', [true, true], [
    r.includes('const offreConfirmee = offreDuMoment ?? offreDeBienvenue ?? (offreDuJour && !estAPlaces(offreDuJour) ? offreDuJour : offreDuServeur);'),
    r.includes("!uneSeuleRemise && prixConfirme > 0 ?")]);
  dit('... le Sowa garde son prix sous toute remise', true, r.includes('ferme: prixFerme(s, ctx) > 0 && !gesteSansRemise(s)'));

  /* 4e. L ancien mercredi ne revient nulle part. */
  const codes = ['src/apps/revelateur/ilots/Reserver.tsx', 'src/apps/revelateur/places-du-site-pur.ts', 'src/apps/revelateur/agenda.ts',
    'src/apps/revelateur/remise-pure.ts', 'src/apps/revelateur/ilots/Offres.tsx', 'supabase/functions/demande-submit/index.ts']
    .filter((f) => /MERCREDI15/.test(sansCommentairesTs(lis(f))));
  dit('MERCREDI15 n est ecrit dans aucun code du site ni du serveur', [], codes);
}

console.log(ko === 0 ? '\nLes places limitees tiennent, de la base au site.' : `\n${ko} controle(s) en echec.`);
