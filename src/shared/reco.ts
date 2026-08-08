import type { Appointment } from './agenda';
import type { Service } from './catalog';
import type { Client, Persona } from './clients';
import type { EnvieKey } from './quiz';

/* CE QUE LA MAISON PROPOSE À UNE ENVIE — un seul juge, pour les deux surfaces.

   Le miroir du salon et le tunnel de Ma Couronne posent le même quiz : ils
   doivent répondre la même chose. Une prestation désignée d'un côté et calculée
   de l'autre, ce sont deux maisons qui parlent à la même cliente.

   RIEN N'EST INVENTÉ ICI. Tout ce qui peut sortir de ce fichier a été désigné
   quelque part par la Maison — sur un persona, ou en repli commun à la Régie.
   Le mode automatique ne fabrique aucune recommandation : il CHOISIT, parmi ces
   désignations, celle que l'histoire de la cliente rend la plus juste. C'est la
   règle qui a coûté les quatre rituels inventés de la Vitrine ; elle tient. */

/** D'où vient la recommandation — pour l'expliquer au Trône, jamais à la cliente. */
export type RecoSource = 'histoire' | 'persona' | 'maison';

export type Reco = { service: Service; source: RecoSource };

export type RecoContexte = {
  /** Ce qu'elle peut RÉELLEMENT réserver : catalogue visible, à son calibre.
      Une prestation hors de cette liste ne se propose jamais — promettre ce
      qu'elle ne pourra pas cocher deux écrans plus loin est pire que se taire. */
  offre: Service[];
  /** Le catalogue ENTIER — pour relire son histoire : une cliente a pu réserver
      des prestations depuis masquées, et les ignorer effacerait son passé. */
  catalogue: Service[];
  personas: Persona[];
  /** La désignation de la Maison — le repli commun (`VitrineConfig.recoParEnvie`). */
  maison?: Partial<Record<EnvieKey, string>>;
  /** Ses rendez-vous, quand on laisse son histoire trancher. */
  appointments?: Appointment[];
  /** Le mode automatique, allumé à la Régie. */
  auto?: boolean;
};

const dansLOffre = (id: string | undefined, offre: Service[]): Service | undefined =>
  id ? offre.find((s) => s.id === id) : undefined;

/** TOUT ce que la Maison a désigné pour cette envie, où que ce soit — les
    personas d'abord, le repli commun ensuite. C'est le vivier, et le mode
    automatique ne choisit que dedans. */
function candidats(envie: EnvieKey, ctx: RecoContexte): Service[] {
  const ids = [...ctx.personas.map((p) => p.recoParEnvie?.[envie]), ctx.maison?.[envie]];
  const vus = new Set<string>();
  const out: Service[] = [];
  for (const id of ids) {
    if (!id || vus.has(id)) continue;
    vus.add(id);
    const sv = dansLOffre(id, ctx.offre);
    if (sv) out.push(sv);
  }
  return out;
}

/** Ce que SON HISTOIRE désigne parmi les candidats. Deux lectures, dans cet
    ordre — de la plus sûre à la plus large :

      ① une prestation qu'elle a DÉJÀ réservée : la plus souvent prise, et à
         égalité la plus récente ;
      ② à défaut, un candidat de la maison qu'elle fréquente le plus.

    Rien de tout cela ne s'invente : on trie des prestations déjà désignées. Sans
    histoire — une cliente neuve — on ne renvoie rien, et la désignation de son
    persona reprend la main. */
function leChoixDeSonHistoire(envie: EnvieKey, client: Client, ctx: RecoContexte): Service | undefined {
  const pool = candidats(envie, ctx);
  if (pool.length === 0) return undefined;

  const siens = (ctx.appointments ?? [])
    .filter((a) => a.clientId === client.id && a.status !== 'annulé')
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  if (siens.length === 0) return undefined;

  /* Combien de fois, et vue la dernière fois quand. */
  const prises = new Map<string, { n: number; dernier: string }>();
  for (const a of siens) {
    for (const id of a.serviceIds) {
      const cur = prises.get(id);
      if (cur) cur.n += 1;
      else prises.set(id, { n: 1, dernier: a.date }); // trié décroissant : le 1er vu EST le plus récent
    }
  }

  /* ① Un candidat qu'elle a déjà pris. */
  const dejaPris = pool
    .map((sv) => ({ sv, p: prises.get(sv.id) }))
    .filter((x): x is { sv: Service; p: { n: number; dernier: string } } => !!x.p)
    .sort((a, b) => (b.p.n - a.p.n) || b.p.dernier.localeCompare(a.p.dernier));
  if (dejaPris.length) return dejaPris[0].sv;

  /* ② La maison qu'elle fréquente le plus, parmi celles des candidats. */
  const parCategorie = new Map<string, number>();
  for (const [id, p] of prises) {
    const cat = ctx.catalogue.find((s) => s.id === id)?.categoryId;
    if (cat) parCategorie.set(cat, (parCategorie.get(cat) ?? 0) + p.n);
  }
  if (parCategorie.size === 0) return undefined;
  const parAffinite = pool
    .map((sv) => ({ sv, n: parCategorie.get(sv.categoryId) ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  return parAffinite[0]?.sv;
}

/** La prestation que la Maison propose à cette cliente pour cette envie.

    L'ordre est une cascade, et chaque cran est un repli du précédent :
      ① son histoire, si le mode automatique est allumé et qu'elle en a une ;
      ② la désignation de SON persona ;
      ③ celle de la Maison ;
      ④ rien — ce qui vaut mieux qu'une recommandation fausse. */
export function recoPourEnvie(
  client: Client | undefined,
  envie: EnvieKey,
  ctx: RecoContexte,
): Reco | undefined {
  if (ctx.auto && client) {
    const parHistoire = leChoixDeSonHistoire(envie, client, ctx);
    if (parHistoire) return { service: parHistoire, source: 'histoire' };
  }
  const persona = client ? ctx.personas.find((p) => p.id === client.persona) : undefined;
  const parPersona = dansLOffre(persona?.recoParEnvie?.[envie], ctx.offre);
  if (parPersona) return { service: parPersona, source: 'persona' };
  const parMaison = dansLOffre(ctx.maison?.[envie], ctx.offre);
  if (parMaison) return { service: parMaison, source: 'maison' };
  return undefined;
}

const SOURCE_MOT: Record<RecoSource, string> = {
  histoire: 'son histoire',
  persona: 'son persona',
  maison: 'la Maison',
};
/** Pourquoi CETTE prestation — pour la Régie du Trône. La cliente, elle, ne
    lit jamais la mécanique : on lui propose, on ne lui explique pas. */
export const recoSourceLabel = (s: RecoSource): string => SOURCE_MOT[s];
