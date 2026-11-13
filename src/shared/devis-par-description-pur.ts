import type { ChantierIa, UsageIa } from './ia-maison-pur';
import type { Service, LongueurId } from './catalog';

/* ══ LE DEVIS ÉCRIT PAR L'ASSISTANT — 13 novembre 2026 ═══════════════════
   « Je veux construire dans devis l'assistant qui crée les devis des clientes
   à partir d'une description ou d'un résumé de la situation » (Yéman), après
   avoir bâti à la main le devis de Faïza Kora : consultation, défaisage,
   réparation intensive, recréation de 100 locks, puis une remise pour tomber
   sur 160 000 F. Trois choix au sélecteur : une page à deux onglets, un
   BROUILLON À RELIRE (rien ne part sans elle), du texte ou de la dictée.

   LA RÈGLE QUI FAIT TENIR TOUT LE RESTE : CLAUDE NE DIT JAMAIS UN PRIX. Il
   choisit des prestations du catalogue par leur identifiant, dit combien de
   locks chacune concerne, et rend le total voulu s'il y en a un. Les francs,
   eux, viennent du catalogue par `prixDe` (le même juge que la Caisse et le
   rendez-vous) ; la remise est la différence, calculée ici, et bornée par le
   plafond de la Maison. Un modèle qui invente « 85 000 F » écrirait un faux
   prix sur un papier qu'on remet à une cliente.

   CE MODULE NE FAIT CONFIANCE À RIEN de ce que Claude rend : un identifiant
   hors catalogue est écarté et dit, une quantité reste entière et bornée, un
   total voulu plus haut que la somme ne majore rien. Il n'écrit rien : l'écran
   montre le brouillon, la cliente et la Maison décident. MODULE PUR. */

export const CHANTIER_DU_DEVIS: ChantierIa = 'devis';
export const USAGE_DU_DEVIS: UsageIa = 'texte';

/** Une description n'est pas un roman : au-delà, on la tait (la porte coupe à 40 000 signes). */
export const SIGNES_MAX_DE_LA_DESCRIPTION = 4000;
export const LIGNES_MAX = 12;
export const QUANTITE_MAX = 10;
export const LOCKS_MAX = 1000;

/** Le strict nécessaire d'une prestation pour la proposer et la chiffrer. */
export type PrestationDuCatalogue = Pick<Service, 'id' | 'name' | 'priceXof' | 'categoryId'> & Partial<Pick<Service, 'description' | 'archived' | 'priceMode' | 'tarifMode' | 'ratePerLock' | 'prixParLongueur' | 'tarifLockParLongueur' | 'hidePrice'>>;

/** Les familles qu'on ne propose jamais sur un devis : les essais de la Maison. */
const FAMILLES_ECARTEES = new Set(['8p8i2vwmx3']);

/** Ce qu'on a le droit de proposer : ni archivée, ni un essai de la Maison. */
export const prestationsProposables = <T extends PrestationDuCatalogue>(services: readonly T[]): T[] =>
  services.filter((s) => s.archived !== true && !FAMILLES_ECARTEES.has(s.categoryId) && !/^essai de paiement/i.test(s.name));

/** Une prestation qui se compte AU LOCK (les créations VÈKPÈ™) : son prix suit le nombre de locks de la ligne. */
export const seCompteAuLock = (s: PrestationDuCatalogue): boolean =>
  s.tarifMode === 'lock' || (s.tarifMode === undefined && !!s.ratePerLock);

const net = (s: string | undefined, max: number): string =>
  String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/* ── LA CONSIGNE ───────────────────────────────────────────────────────── */
export function consigneDuDevis(o: { services: readonly PrestationDuCatalogue[]; aujourdhui: string }): string {
  const catalogue = prestationsProposables(o.services)
    .map((s) => `${s.id} | ${net(s.name, 90)} | ${seCompteAuLock(s) ? 'au lock' : 'prix fixe'}${net(s.description, 120) ? ` | ${net(s.description, 120)}` : ''}`)
    .join('\n');
  return [
    'Tu prépares le BROUILLON d’un devis pour la Maison MND, maison de soin de locks à Cotonou. Tu lis la situation d’une cliente écrite par la Maison et tu choisis, DANS LE CATALOGUE CI-DESSOUS et nulle part ailleurs, les prestations qui y répondent, dans l’ordre où elles se font.',
    '',
    'RÈGLES',
    '- Tu rends des IDENTIFIANTS du catalogue. Jamais un nom inventé, jamais un prix : les prix sont calculés par la Maison, pas par toi.',
    '- Une consultation passe d’abord quand la cliente vient d’ailleurs ou n’est pas encore connue : « KÒKÒ™ Accueil » pour des locks nées ailleurs, « KÒKÒ™ Origine » pour une première couronne.',
    '- Pour une prestation « au lock » (les créations VÈKPÈ™), `locks` est le nombre de locks À CRÉER, et tu prends le calibre qui correspond à ce nombre : Jumbo jusqu’à 80, Medium 81 à 150, Mini 151 à 250, Micro 251 à 350, Nano 351 à 450, Pico 451 à 600. Pour toute autre prestation, `locks` vaut 0.',
    '- `locksDeLaTete` est le nombre de locks que la cliente porte aujourd’hui, s’il est dit ; sinon 0. Ne le devine pas.',
    '- `longueur` est la longueur des locks si elle est dite (court, mi-long, long), sinon une chaîne vide. Ne la devine pas.',
    '- `totalVoulu` est le total en francs CFA que la Maison veut atteindre (« pour que le devis s’arrête à 160 000 F »), sinon 0. Tu le recopies tel qu’il est dit, tu ne le calcules pas.',
    '- Une prestation par geste demandé, pas plus. Si la situation ne se range dans aucune prestation, tu ne l’inventes pas : tu la dis dans `reserves`.',
    '- `raison` : une courte phrase, en français, qui dit pourquoi cette prestation. `reserves` : ce qui manque ou t’a fait douter (longueur non dite, nombre de locks flou), une phrase par point, ou rien.',
    `- Aujourd’hui : ${o.aujourdhui}.`,
    '',
    'CATALOGUE (identifiant | nom | mode | extrait)',
    catalogue,
  ].join('\n');
}

export const SCHEMA_DU_DEVIS: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lignes: {
      type: 'array',
      maxItems: LIGNES_MAX,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          serviceId: { type: 'string', description: 'L’identifiant de la prestation, tel qu’au catalogue.' },
          quantite: { type: 'integer', minimum: 1, maximum: QUANTITE_MAX, description: 'Combien de fois, 1 le plus souvent.' },
          locks: { type: 'integer', minimum: 0, maximum: LOCKS_MAX, description: 'Locks à créer pour une prestation au lock, sinon 0.' },
          raison: { type: 'string', description: 'Pourquoi cette prestation, une phrase.' },
        },
        required: ['serviceId', 'quantite', 'locks', 'raison'],
      },
    },
    locksDeLaTete: { type: 'integer', minimum: 0, maximum: LOCKS_MAX },
    longueur: { type: 'string', enum: ['', 'court', 'mi-long', 'long'] },
    totalVoulu: { type: 'integer', minimum: 0, description: 'Le total voulu en francs CFA, ou 0.' },
    reserves: { type: 'array', maxItems: 6, items: { type: 'string' } },
  },
  required: ['lignes', 'locksDeLaTete', 'longueur', 'totalVoulu', 'reserves'],
};

/* ── LA LECTURE, REVALIDÉE ────────────────────────────────────────────── */
export type LigneLue = { serviceId: string; quantite: number; locks: number; raison: string };
export type DevisLu = {
  lignes: LigneLue[];
  locksDeLaTete: number;
  longueur: LongueurId | '';
  totalVoulu: number;
  reserves: string[];
  /** Ce qu'on a écarté à la lecture (identifiant hors catalogue, ligne en trop). */
  ecartees: string[];
};

const entier = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
};

export function lectureDuDevis(data: unknown, services: readonly PrestationDuCatalogue[]): DevisLu | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.lignes)) return null;
  const permises = new Map(prestationsProposables(services).map((s) => [s.id, s]));
  const lignes: LigneLue[] = [];
  const ecartees: string[] = [];
  for (const brute of d.lignes) {
    if (!brute || typeof brute !== 'object') continue;
    const l = brute as Record<string, unknown>;
    const id = typeof l.serviceId === 'string' ? l.serviceId.trim() : '';
    const sv = permises.get(id);
    if (!sv) { ecartees.push(id ? `« ${net(id, 40)} » n’est pas au catalogue` : 'une ligne sans prestation'); continue; }
    if (lignes.length >= LIGNES_MAX) { ecartees.push(`« ${sv.name} » (trop de lignes)`); continue; }
    lignes.push({
      serviceId: id,
      quantite: entier(l.quantite, 1, QUANTITE_MAX) ?? 1,
      locks: seCompteAuLock(sv) ? (entier(l.locks, 0, LOCKS_MAX) ?? 0) : 0,
      raison: net(typeof l.raison === 'string' ? l.raison : '', 160),
    });
  }
  const longueur = d.longueur === 'court' || d.longueur === 'mi-long' || d.longueur === 'long' ? d.longueur : '';
  return {
    lignes,
    locksDeLaTete: entier(d.locksDeLaTete, 0, LOCKS_MAX) ?? 0,
    longueur,
    totalVoulu: entier(d.totalVoulu, 0, 100_000_000) ?? 0,
    reserves: Array.isArray(d.reserves) ? d.reserves.filter((r): r is string => typeof r === 'string').map((r) => net(r, 200)).filter(Boolean).slice(0, 6) : [],
    ecartees,
  };
}

/* ── LE DEVIS CHIFFRÉ PAR LA MAISON ───────────────────────────────────── */
export type LigneDuDevis = {
  serviceId: string;
  label: string;
  qty: number;
  unitXof: number;
  /** Les locks comptés, pour une prestation au lock ; 0 sinon. */
  locks: number;
  raison: string;
};

export type DevisPropose = {
  lignes: LigneDuDevis[];
  brutXof: number;
  remiseXof: number;
  totalXof: number;
  totalVoulu: number;
  longueur: LongueurId | '';
  /** Ce que la Maison doit savoir avant d'ouvrir le brouillon. */
  avertissements: string[];
};

/** Le juge des prix : celui de la Caisse (`personalPriceXof`), injecté pour que ce module reste sans magasin. */
export type JugeDesPrix = (sv: PrestationDuCatalogue, o: { locks: number | undefined; longueur: LongueurId | '' }) => number;

export function devisDepuisLaLecture(
  lu: DevisLu,
  o: { services: readonly PrestationDuCatalogue[]; prixDe: JugeDesPrix; plafondDeRemiseXof: (baseXof: number) => number },
): DevisPropose {
  const parId = new Map(o.services.map((s) => [s.id, s]));
  const avertissements: string[] = lu.ecartees.map((e) => `Écartée : ${e}.`);
  const lignes: LigneDuDevis[] = [];
  for (const l of lu.lignes) {
    const sv = parId.get(l.serviceId);
    if (!sv) continue;
    const auLock = seCompteAuLock(sv);
    /* LES LOCKS DE LA LIGNE POUR UNE CRÉATION, ceux de la tête pour le reste : un
       resserrage se prix sur la couronne entière, une création sur ce qu'on pose. */
    const locks = auLock ? l.locks : 0;
    if (auLock && locks <= 0) avertissements.push(`« ${sv.name} » est comptée au lock et le nombre de locks n’est pas dit : prix du catalogue, à préciser.`);
    const unit = Math.max(0, Math.round(o.prixDe(sv, { locks: auLock ? (locks > 0 ? locks : undefined) : (lu.locksDeLaTete > 0 ? lu.locksDeLaTete : undefined), longueur: lu.longueur })));
    if (unit <= 0) avertissements.push(sv.priceMode === 'devis' ? `« ${sv.name} » se chiffre sur devis : son prix est à écrire à la main.` : `« ${sv.name} » n’a pas de prix pour cette situation (calibre ou nombre de locks) : prix à écrire à la main.`);
    lignes.push({ serviceId: sv.id, label: sv.name, qty: l.quantite, unitXof: unit, locks, raison: l.raison });
  }
  if (lignes.length === 0) avertissements.push('Aucune prestation du catalogue ne répond à cette situation : ajoutez-les à la main.');
  const prixParLongueur = lignes.some((l) => { const sv = parId.get(l.serviceId); return !!sv?.prixParLongueur && Object.keys(sv.prixParLongueur).length > 0; });
  if (!lu.longueur && prixParLongueur) avertissements.push('La longueur des locks n’est pas dite : les prix sont ceux des locks courtes, à ajuster.');
  for (const r of lu.reserves) avertissements.push(r);

  const brutXof = lignes.reduce((s, l) => s + l.qty * l.unitXof, 0);
  let remiseXof = 0;
  if (lu.totalVoulu > 0) {
    if (lu.totalVoulu >= brutXof) {
      if (lu.totalVoulu > brutXof) avertissements.push(`Le total voulu (${lu.totalVoulu} F) dépasse la somme des prestations (${brutXof} F) : rien n’est majoré.`);
    } else {
      const voulue = brutXof - lu.totalVoulu;
      const permise = o.plafondDeRemiseXof(brutXof);
      remiseXof = Math.min(voulue, permise);
      if (remiseXof < voulue) avertissements.push(`La remise demandée (${voulue} F) dépasse ce que l’équipe peut accorder : plafonnée à ${remiseXof} F. La direction peut aller au-delà.`);
    }
  }
  return { lignes, brutXof, remiseXof, totalXof: brutXof - remiseXof, totalVoulu: lu.totalVoulu, longueur: lu.longueur, avertissements };
}

/** La description qui part vers Claude : bornée, jamais vide. */
export const descriptionPourClaude = (s: string): string | null => {
  const t = String(s ?? '').trim();
  return t.length < 8 ? null : t.slice(0, SIGNES_MAX_DE_LA_DESCRIPTION);
};
