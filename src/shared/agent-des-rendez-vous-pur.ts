import type { ChantierIa, UsageIa } from './ia-maison-pur';
import { prestationsProposables, type PrestationDuCatalogue } from './devis-par-description-pur';

/* ══ L'AGENT DES RENDEZ-VOUS, AU COMPTOIR — 18 novembre 2026 ═══════════════
   « Construire un agent qui prend les RDV en 1 clic » ; puis, sur la
   maquette en affiches (`public/maquette-l-agent-des-rendez-vous.html`) :
   un agent qui AGIT SEUL ; « l'équipe est toujours disponible, oublie les
   congés, c'est toujours Team » ; « construis » (Yéman, 18 novembre 2026).

   « Dites-le. C'est posé. » On tape ou on dicte « Mme T., sa reprise, la
   semaine prochaine ». Claude LIT la phrase : la cliente telle qu'elle est
   dite, les gestes nommés (des identifiants du catalogue), la fenêtre de
   dates, l'heure ou le moment. Tout le reste est à la Maison :
     · la cliente se cherche ICI, dans le carnet du Trône
       (`clientesQuiRepondent`) : aucune fiche, aucun numéro ne part vers
       Claude ;
     · le rituel, le prix, l'acompte, l'offre du jour, la place et la
       confirmation sont ceux de « Son prochain rituel », qui reçoit le
       souhait (`laPlaceDuSouhait`, `leRituelVoulu`) et pose sur Team.

   CLAUDE NE COMPTE PAS LES JOURS : la consigne lui donne un calendrier
   (date | jour) et il y lit « samedi », « la semaine prochaine ». Ce qu'il
   rend est revalidé ici : une date hors du calendrier, passée ou à l'envers
   est corrigée ou écartée, et le dit. MODULE PUR. */

export const CHANTIER_DE_L_AGENT: ChantierIa = 'rendez-vous';
export const USAGE_DE_L_AGENT: UsageIa = 'texte';

/** Une phrase, pas une lettre : au-delà, on la tait. */
export const SIGNES_MAX_DE_LA_PHRASE = 600;
/** Le calendrier donné à Claude : dix-sept semaines. */
export const JOURS_DU_CALENDRIER = 120;
/** Une fenêtre de dates ne dépasse pas six semaines. */
export const JOURS_DE_LA_FENETRE_MAX = 42;
export const GESTES_MAX = 4;

export type Moment = '' | 'matin' | 'apres-midi';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Une date AAAA-MM-JJ réelle (pas un 31 février), lue en UTC : jamais l'heure de la machine. */
const enUtc = (iso: string): number | null => {
  const m = ISO.exec(iso);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(t).toISOString().slice(0, 10) === iso ? t : null;
};
export const plusJours = (iso: string, n: number): string => new Date((enUtc(iso) ?? 0) + n * 86_400_000).toISOString().slice(0, 10);
const jourDeLaSemaine = (iso: string): string => JOURS[new Date(enUtc(iso) ?? 0).getUTCDay()];

const net = (s: unknown, max: number): string =>
  String(typeof s === 'string' ? s : '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Le calendrier que lit Claude : « 2026-11-18 | mercredi (aujourd’hui) ». */
export const calendrierDit = (aujourdhui: string, jours = JOURS_DU_CALENDRIER): string =>
  Array.from({ length: jours }, (_, k) => {
    const iso = plusJours(aujourdhui, k);
    return `${iso} | ${jourDeLaSemaine(iso)}${k === 0 ? ' (aujourd’hui)' : k === 1 ? ' (demain)' : ''}`;
  }).join('\n');

/* ── LA CONSIGNE ───────────────────────────────────────────────────────── */
export function consigneDeLAgent(o: { services: readonly PrestationDuCatalogue[]; aujourdhui: string }): string {
  const catalogue = prestationsProposables(o.services).map((s) => `${s.id} | ${net(s.name, 90)}`).join('\n');
  return [
    'Tu lis la demande d’une personne de la Maison MND, maison de soin de locks à Cotonou, qui veut poser un rendez-vous pour une cliente. Tu rends ce que la phrase dit, rien de plus : c’est la Maison qui cherche la cliente dans son carnet, trouve l’heure libre, calcule le prix et pose le rendez-vous.',
    '',
    'RÈGLES',
    '- `cliente` : le nom de la cliente TEL QU’IL EST DIT (« Mme T. », « Aïcha », « Fifi »), sans le compléter ni le corriger. Vide si la phrase ne nomme personne.',
    '- `gestes` : les IDENTIFIANTS du catalogue qui répondent aux gestes nommés (« sa reprise », « un lavage »). Un nom de famille suffit : prends la prestation la plus simple de cette famille, la Maison retrouvera celle que la cliente prend d’habitude. Laisse vide si la phrase dit « son rendez-vous habituel », « comme d’habitude », ou ne nomme aucun geste. Jamais un identifiant hors du catalogue.',
    '- `du` et `au` : la fenêtre de dates voulue, LUE DANS LE CALENDRIER ci-dessous, jamais calculée de tête. « La semaine prochaine » : du lundi au samedi de la semaine qui suit. « Samedi » : le prochain samedi. « Dans trois semaines » : ce jour-là et les six jours qui suivent. Un seul jour : `du` égale `au`. Laisse les deux vides si aucune date n’est dite : la Maison suivra le rythme de la cliente.',
    '- `heure` : l’heure dite, au format HH:MM (« 10 h » donne 10:00), sinon vide.',
    '- `moment` : « matin » ou « apres-midi » si la phrase le dit, sinon vide.',
    '- `reserves` : ce qui t’a fait douter (deux clientes possibles, une date ambiguë), une phrase par point, ou rien.',
    '- Tu ne dis jamais un prix, tu ne promets aucune place, tu ne confirmes rien.',
    '',
    'CALENDRIER (date | jour)',
    calendrierDit(o.aujourdhui),
    '',
    'CATALOGUE (identifiant | nom)',
    catalogue,
  ].join('\n');
}

export const SCHEMA_DE_L_AGENT: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cliente: { type: 'string', description: 'Le nom de la cliente tel qu’il est dit, ou vide.' },
    gestes: { type: 'array', maxItems: GESTES_MAX, items: { type: 'string' }, description: 'Des identifiants du catalogue, ou rien.' },
    du: { type: 'string', description: 'AAAA-MM-JJ, lu dans le calendrier, ou vide.' },
    au: { type: 'string', description: 'AAAA-MM-JJ, lu dans le calendrier, ou vide.' },
    heure: { type: 'string', description: 'HH:MM, ou vide.' },
    moment: { type: 'string', enum: ['', 'matin', 'apres-midi'] },
    reserves: { type: 'array', maxItems: 4, items: { type: 'string' } },
  },
  required: ['cliente', 'gestes', 'du', 'au', 'heure', 'moment', 'reserves'],
};

/* ── LA LECTURE, REVALIDÉE ────────────────────────────────────────────── */
export type DemandeLue = {
  cliente: string;
  gestes: string[];
  du: string;
  au: string;
  heure: string;
  moment: Moment;
  /** Ce que Claude a dit douter, puis ce que la Maison a corrigé ou écarté. */
  reserves: string[];
};

/** « 10:00 », « 9h30 », « 14 h » : une heure de la journée, sinon vide. */
export const heureLue = (v: unknown): string => {
  const m = /^\s*([01]?\d|2[0-3])\s*(?::|h)\s*([0-5]\d)?\s*$/i.exec(typeof v === 'string' ? v : '');
  return m ? `${m[1].padStart(2, '0')}:${m[2] ?? '00'}` : '';
};

export function lectureDeLAgent(data: unknown, services: readonly PrestationDuCatalogue[], aujourdhui: string): DemandeLue | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const reserves: string[] = Array.isArray(d.reserves)
    ? d.reserves.map((r) => net(r, 200)).filter(Boolean).slice(0, 4)
    : [];

  const permises = new Set(prestationsProposables(services).map((s) => s.id));
  const gestes: string[] = [];
  for (const g of Array.isArray(d.gestes) ? d.gestes : []) {
    const id = net(g, 60);
    if (!id || gestes.includes(id)) continue;
    if (!permises.has(id)) { reserves.push(`Un geste lu n’est pas au catalogue (« ${id} ») : il est écarté.`); continue; }
    if (gestes.length < GESTES_MAX) gestes.push(id);
  }

  /* LA FENÊTRE : dans le calendrier donné, jamais passée, jamais à l'envers,
     jamais plus de six semaines. Une date qui ne tient pas est écartée, et
     la Maison retombe sur le rythme de la cliente. */
  const fin = plusJours(aujourdhui, JOURS_DU_CALENDRIER - 1);
  const dateLue = (v: unknown): string => {
    const s = net(v, 10);
    return enUtc(s) !== null ? s : '';
  };
  let du = dateLue(d.du);
  let au = dateLue(d.au);
  if (!du && au) du = au;
  if (du && !au) au = du;
  if (du && au < du) [du, au] = [au, du];
  if (du && au < aujourdhui) { reserves.push('La date lue est passée : la Maison suit le rythme de la cliente.'); du = ''; au = ''; }
  if (du && du < aujourdhui) du = aujourdhui;
  if (du && du > fin) { reserves.push('La date lue est trop loin : la Maison suit le rythme de la cliente.'); du = ''; au = ''; }
  if (du && au > fin) au = fin;
  if (du && au > plusJours(du, JOURS_DE_LA_FENETRE_MAX - 1)) au = plusJours(du, JOURS_DE_LA_FENETRE_MAX - 1);

  const moment: Moment = d.moment === 'matin' || d.moment === 'apres-midi' ? d.moment : '';
  return { cliente: net(d.cliente, 80), gestes, du, au, heure: heureLue(d.heure), moment, reserves };
}

/** La phrase qui part vers Claude : bornée, jamais vide. */
export const phrasePourClaude = (s: string): string | null => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length < 4 ? null : t.slice(0, SIGNES_MAX_DE_LA_PHRASE);
};

/* ── LA CLIENTE, CHERCHÉE DANS LE CARNET ──────────────────────────────── */
/** Ce que la recherche lit d'une fiche : son nom, rien d'autre ne sort d'ici. */
export type FicheCherchee = { id: string; name: string; archived?: boolean };

/** Les mots qui ne nomment personne : les civilités et les liens. */
const CIVILITES = new Set(['mme', 'madame', 'mlle', 'mademoiselle', 'm', 'mr', 'monsieur', 'mrs', 'dame', 'tata', 'tantie', 'tante', 'maman', 'la', 'le', 'de', 'du', 'des', 'cliente', 'client']);

/** Les mots d'un nom : sans accent, en minuscules, sans ponctuation. */
export const motsDuNom = (s: string): string[] =>
  String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);

export type CandidateTrouvee<T> = { fiche: T; score: number };

/** LES CLIENTES QUI RÉPONDENT AU NOM DIT. Chaque mot dit doit répondre à un
    mot du nom : le même mot (3), son début sur trois lettres au moins (2), ou
    son initiale pour une lettre seule (« T. », 1, jamais plus). Les civilités ne comptent
    pas. Rangées par force, puis par la venue la plus récente (`recence`). */
export function clientesQuiRepondent<T extends FicheCherchee>(dit: string, fiches: readonly T[], recence?: (id: string) => string): CandidateTrouvee<T>[] {
  const mots = motsDuNom(dit).filter((m) => !CIVILITES.has(m));
  if (mots.length === 0) return [];
  const trouvees: CandidateTrouvee<T>[] = [];
  for (const fiche of fiches) {
    if (fiche.archived) continue;
    const siens = motsDuNom(fiche.name);
    let score = 0;
    let toutes = true;
    for (const m of mots) {
      let mieux = 0;
      for (const s of siens) {
        /* Une lettre seule est TOUJOURS une initiale, même face à « T. » :
           « Mme T. » ne retient jamais une cliente d'office parmi les T. */
        if (m.length === 1) { if (s.startsWith(m)) mieux = Math.max(mieux, 1); }
        else if (s === m) mieux = Math.max(mieux, 3);
        else if (m.length >= 3 && s.startsWith(m)) mieux = Math.max(mieux, 2);
      }
      if (mieux === 0) { toutes = false; break; }
      score += mieux;
    }
    if (toutes) trouvees.push({ fiche, score });
  }
  return trouvees.sort((a, b) => b.score - a.score
    || (recence ? recence(b.fiche.id).localeCompare(recence(a.fiche.id)) : 0)
    || a.fiche.name.localeCompare(b.fiche.name, 'fr'));
}

/** UNE SEULE, OU UN CHOIX. Elle est retenue d'office quand elle est la seule,
    ou quand elle répond mot pour mot et qu'aucune autre ne le fait : « Aïcha »
    retient Aïcha K. devant Aïchatou B., mais « Mme T. » montre toutes les T. */
export function laCliente<T extends FicheCherchee>(dit: string, fiches: readonly T[], recence?: (id: string) => string):
  { genre: 'une'; fiche: T } | { genre: 'plusieurs'; fiches: T[] } | { genre: 'aucune' } {
  const c = clientesQuiRepondent(dit, fiches, recence);
  if (c.length === 0) return { genre: 'aucune' };
  if (c.length === 1) return { genre: 'une', fiche: c[0].fiche };
  const pleine = motsDuNom(dit).filter((m) => !CIVILITES.has(m)).length * 3;
  if (c[0].score === pleine && c[1].score < pleine) return { genre: 'une', fiche: c[0].fiche };
  return { genre: 'plusieurs', fiches: c.slice(0, 6).map((x) => x.fiche) };
}

/* ── LE RITUEL ET LA PLACE DU SOUHAIT ─────────────────────────────────── */
/** LE RITUEL QU'ELLE PREND, PARMI LES SIENS : celui qui porte tous les gestes
    nommés, sinon celui qui porte un geste de la même famille (« sa reprise » :
    sa reprise Signature, même si Claude a lu l'Essentielle). -1 : aucun. */
export function leRituelVoulu(rituels: readonly { ids: readonly string[] }[], voulus: readonly string[], familleDe: (id: string) => string | undefined): number {
  if (voulus.length === 0) return -1;
  const tous = rituels.findIndex((r) => voulus.every((v) => r.ids.includes(v)));
  if (tous >= 0) return tous;
  const familles = new Set(voulus.map(familleDe).filter((f): f is string => !!f));
  return rituels.findIndex((r) => r.ids.some((id) => { const f = familleDe(id); return !!f && familles.has(f); }));
}

export type Souhait = { du: string; au: string; heure: string; moment: Moment };
export type PlaceDuSouhait = { iso: string; heure: string; ecart: 'aucun' | 'heure' };

const enMinutes = (h: string): number => { const [a, b] = h.split(':').map(Number); return a * 60 + (b || 0); };
const laPlusProche = (heures: readonly string[], cible: string): string =>
  [...heures].sort((a, b) => Math.abs(enMinutes(a) - enMinutes(cible)) - Math.abs(enMinutes(b) - enMinutes(cible)) || a.localeCompare(b))[0];

/** LA PLACE DU SOUHAIT : le premier jour ouvert de la fenêtre qui a une place
    pour sa durée (au moment dit, s'il l'est), à l'heure dite, sinon la plus
    proche ce jour-là ; sans heure dite, la plus proche de son heure
    habituelle, sinon la première. `null` : rien dans la fenêtre. Les places
    viennent de la Maison (`placesDe`, celles du « + RDV », sur Team). */
export function laPlaceDuSouhait(o: {
  souhait: Souhait;
  aujourdhui: string;
  heureHabituelle: string | null;
  placesDe: (iso: string) => { ferme: boolean; heures: readonly string[] };
}): PlaceDuSouhait | null {
  const { souhait } = o;
  if (!souhait.du) return null;
  let iso = souhait.du < o.aujourdhui ? o.aujourdhui : souhait.du;
  const au = souhait.au && souhait.au >= iso ? souhait.au : iso;
  for (let k = 0; iso <= au && k < JOURS_DE_LA_FENETRE_MAX; k += 1, iso = plusJours(iso, 1)) {
    const p = o.placesDe(iso);
    if (p.ferme) continue;
    const heures = p.heures.filter((h) => (souhait.moment === 'matin' ? h < '12:00' : souhait.moment === 'apres-midi' ? h >= '12:00' : true));
    if (heures.length === 0) continue;
    const habituelle = o.heureHabituelle && heures.length && (souhait.moment !== 'matin' || o.heureHabituelle < '12:00') && (souhait.moment !== 'apres-midi' || o.heureHabituelle >= '12:00')
      ? o.heureHabituelle : null;
    const cible = souhait.heure || habituelle;
    const heure = cible ? laPlusProche(heures, cible) : heures[0];
    return { iso, heure, ecart: souhait.heure && heure !== souhait.heure ? 'heure' : 'aucun' };
  }
  return null;
}

/** CE QUE LA CARTE DIT DU SOUHAIT : ce qui a été demandé, et l'écart s'il y en a un. */
export function phraseDuSouhait(o: {
  souhait: Souhait;
  place: PlaceDuSouhait | null;
  jourDit: (iso: string) => string;
  heureDite: (hhmm: string) => string;
}): string {
  const { souhait } = o;
  const fenetre = !souhait.au || souhait.au === souhait.du ? `le ${o.jourDit(souhait.du)}` : `du ${o.jourDit(souhait.du)} au ${o.jourDit(souhait.au)}`;
  const quand = `${fenetre}${souhait.moment === 'matin' ? ', le matin' : souhait.moment === 'apres-midi' ? ', l’après-midi' : ''}${souhait.heure ? `, à ${o.heureDite(souhait.heure)}` : ''}`;
  if (!o.place) return `Demandé : ${quand}. Aucune place libre pour sa durée dans cette fenêtre : touchez une des places proposées.`;
  const ecart = o.place.ecart === 'heure' ? ` ${o.heureDite(souhait.heure)} est prise ce jour-là : la plus proche est ${o.heureDite(o.place.heure)}.` : '';
  return `Demandé : ${quand}.${ecart}`;
}
