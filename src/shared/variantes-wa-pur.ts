import { sansCoordonnees } from './ia-anonymise-pur';

/* ══ LES VARIANTES D'UN CAS · 30 octobre 2026 ═══════════════════════════
   Choix de Yéman (banque de scénarios, maquette 8c48d9mc…) : pour chaque
   cas validé, Claude écrit vingt façons de dire la même demande (fautes,
   abréviations, sans accents, un peu d'anglais), payées sur les crédits API
   inclus. La banque les rejoue : une variante que l'automate ne comprend
   plus comme l'original dit où il est fragile. Elles ne bloquent pas une
   mise en ligne : elles disent quoi renforcer.

   La fonction `variantes-wa` (scripts/serveur) regroupe ce module ; le
   Trône range les variantes dans le cas (`mnd_scenarios_wa`).

   MODULE PUR. */

export const VARIANTES_PAR_CAS = 20;
/** Les appels d'un mois, au plus : 400 cas, quelques centimes chacun. */
export const APPELS_DE_VARIANTES_PAR_MOIS = 400;
const LONGUEUR_MAX = 300;

export function consigneDesVariantes(): string {
  return [
    'Tu aides la Maison MND, maison de soin et de création de locks à Cotonou (Bénin), à éprouver son assistant WhatsApp.',
    'On te donne un message réel d’une cliente. Écris des variantes de ce message : la MÊME demande, dite autrement, comme d’autres clientes l’écriraient sur WhatsApp.',
    'Garde exactement la même intention, le même jour, la même heure, la même prestation, et rien de plus : n’ajoute aucune autre demande, aucun nom, aucun numéro, aucune adresse.',
    'Varie la forme : fautes de frappe et d’orthographe phonétique, abréviations (rdv, svp, stp, bjr, cc, pr, ds), sans accents ni majuscules, ponctuation libre, tournures du français parlé à Cotonou, un message coupé en deux lignes ; deux ou trois en anglais.',
    'Chaque variante est différente des autres et de l’original. Une variante par entrée, 300 signes au plus.',
    'Réponds uniquement par l’objet demandé.',
  ].join('\n');
}

export const SCHEMA_DES_VARIANTES: Record<string, unknown> = {
  type: 'object',
  properties: {
    variantes: { type: 'array', items: { type: 'string' }, description: `${VARIANTES_PAR_CAS} variantes du message.` },
  },
  required: ['variantes'],
  additionalProperties: false,
};

export const demandeDesVariantes = (texte: string): string =>
  `Le message de la cliente :\n« ${String(texte ?? '').trim()} »\n\nÉcris ${VARIANTES_PAR_CAS} variantes.`;

const plat = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** CE QUI SE GARDE de ce que Claude a rendu : des textes, sans numéro ni
    adresse, ni vides, ni trop longs, ni l'original, ni deux fois le même ;
    vingt au plus. Rien de lisible : une liste vide. */
export function lectureDesVariantes(brut: unknown, original: string): string[] {
  const b = (brut && typeof brut === 'object' ? brut : {}) as { variantes?: unknown };
  const vus = new Set<string>([plat(original)]);
  const out: string[] = [];
  for (const v of Array.isArray(b.variantes) ? b.variantes : []) {
    if (typeof v !== 'string') continue;
    const t = sansCoordonnees(v).replace(/[ \t]+/g, ' ').trim();
    if (!t || t.length > LONGUEUR_MAX) continue;
    const k = plat(t);
    if (!k || vus.has(k)) continue;
    vus.add(k);
    out.push(t);
    if (out.length >= VARIANTES_PAR_CAS) break;
  }
  return out;
}
