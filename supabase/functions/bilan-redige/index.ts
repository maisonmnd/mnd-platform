// Supabase Edge Function — bilan-redige
// L'assistant des bilans : il rédige le bilan d'une séance à partir de la note
// du maître. Il PROPOSE ; le maître relit et signe dans le Trône.
//
// Pourquoi une fonction Edge : la clé Anthropic ne peut pas vivre dans le Trône,
// qui est un paquet statique (tout ce qu'il embarque est public). Elle reste ici.
//
// Déployez via le dashboard (Edge Functions → New function → nom « bilan-redige »
// → coller ce fichier ENTIER). Le secret ANTHROPIC_API_KEY existe déjà (il sert à
// suggest-client) : rien à ajouter.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
/* Le plus récent d'abord ; le second est celui de suggest-client, qui répond
   déjà sur ce compte. */
const MODELES = ['claude-opus-5-5', 'claude-opus-4-8'];

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const QUATRE_TEMPS = ['Purifier', 'Nourrir', 'Sceller', 'Couronner'];
const QUATRE_JAUGES = ['Cuir chevelu', 'Racines', 'Hydratation', 'Densité & tenue'];

type Prestation = { id: string; nom: string };
type Ingredient = { slug: string; nom: string; role: string; note?: string };
type Listes = { prestations: Prestation[]; ingredients: Ingredient[]; formules: string[]; produits: string[] };

const SYSTEME = [
  'Vous êtes l’assistant des bilans de la Maison MND, maison de soin des locks à Cotonou (Bénin).',
  'Un maître de la Maison vient de terminer une séance. Il vous donne ce qu’il a vu et ce qu’il attend.',
  'Vous rédigez le bilan que la cliente recevra, après relecture et signature du maître.',
  '',
  'LA VOIX DE LA MAISON',
  '- Vous écrivez À la cliente, en la vouvoyant, et vous ouvrez « Ce que nous avons vu » par son appel exact (ex. « Madame Awa, »).',
  '- La Maison parle en « nous ». Phrases courtes, chaleureuses, précises. Aucun emoji.',
  '- N’écrivez JAMAIS de tiret long (—) : une virgule à la place.',
  '- N’écrivez JAMAIS le mot « salon » : dites « la Maison ».',
  '- N’écrivez JAMAIS de prix, de montant, de remise.',
  '- Aucune promesse chiffrée ni garantie de résultat (pas de « 2 cm en un mois », pas de « garanti »).',
  '',
  'CE QUE VOUS N’INVENTEZ PAS',
  '- Le constat vient UNIQUEMENT de ce que le maître a coché ou écrit, et des bilans passés. N’ajoutez aucun problème qu’il n’a pas vu.',
  '- Les prestations proposées sont choisies dans la liste fournie (par leur id). Une à trois, pas davantage, la plus utile d’abord.',
  '- Les ingrédients de la routine sont choisis parmi les sept de la Maison (par leur slug). Respectez leurs notes d’usage.',
  '- Vous pouvez nommer une formule du Laboratoire ou un produit de la Gamme dans « solutions » ou dans la routine, seulement s’il figure dans les listes.',
  '',
  'CE QUE VOUS NE FAITES JAMAIS',
  '- Aucun diagnostic médical. Si un signe peut relever d’une affection du cuir chevelu (plaques, croûtes, rougeurs, démangeaisons persistantes, perte en plaques, douleur, pellicules épaisses et grasses), vous écrivez dans « alerteMedicale » une phrase douce qui recommande de consulter un dermatologue, et vous restez prudent partout ailleurs. Sinon « alerteMedicale » est vide.',
  '',
  'LE CHEVEU MÉTISSÉ',
  '- Sur un cheveu métissé : plus d’hydratation, des huiles légères (avocat, moringa, baobab) plutôt que les beurres lourds, surtout sur un cheveu fin ; le karité en couche très fine sur les pointes seulement.',
  '- Un lock métissé se forme plus lentement et se défait plus facilement aux racines : dites la patience, proposez un resserrage doux et régulier, jamais une tension forte.',
  '- Plusieurs textures sur une tête : une routine qui traite la plus fragile.',
  '',
  'LA FORME',
  '- diagnostic : 2 à 3 phrases. sens : 2 phrases, rassurantes et vraies. solutions : 2 à 3 phrases qui nomment les prestations proposées.',
  '- rituel : exactement les Quatre Temps, dans l’ordre Purifier, Nourrir, Sceller, Couronner ; pour chacun une cadence courte (« tous les 10 jours », « 2 fois par semaine ») et une phrase concrète.',
  '- jauges : les quatre (Cuir chevelu, Racines, Hydratation, Densité & tenue), valeur entière de 1 à 5, note en un ou deux mots.',
  '- points : 1 à 3 points clés de la séance, ce que la séance a fait.',
  '- prochaineVisite : une date en toutes lettres (« Vers le 15 novembre 2026 »), cohérente avec les propositions.',
  '- resume : exactement trois phrases, pour la poche de la cliente : l’essentiel, ce qu’elle fait chez elle, ce que la Maison propose ensuite.',
  '- message : le mot WhatsApp qui accompagne le document, 2 à 3 phrases, qui commence par « Bonjour » et son appel, et se termine sans signature.',
].join('\n');

function schemaPour(l: Listes) {
  const ids = l.prestations.map((p) => p.id);
  const slugs = l.ingredients.map((i) => i.slug);
  return {
    type: 'object',
    properties: {
      diagnostic: { type: 'string', description: 'Ce que nous avons vu.' },
      sens: { type: 'string', description: 'Ce que cela veut dire.' },
      solutions: { type: 'string', description: 'Ce que la Maison vous propose.' },
      propositions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            serviceId: { type: 'string', enum: ids },
            quand: { type: 'string', description: '« à votre prochaine venue », « dans six semaines »…' },
          },
          required: ['serviceId', 'quand'],
          additionalProperties: false,
        },
      },
      rituel: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nom: { type: 'string', enum: QUATRE_TEMPS },
            cadence: { type: 'string' },
            texte: { type: 'string' },
            ingredients: { type: 'array', items: { type: 'string', enum: slugs } },
          },
          required: ['nom', 'cadence', 'texte', 'ingredients'],
          additionalProperties: false,
        },
      },
      jauges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nom: { type: 'string', enum: QUATRE_JAUGES },
            valeur: { type: 'integer' },
            note: { type: 'string' },
          },
          required: ['nom', 'valeur', 'note'],
          additionalProperties: false,
        },
      },
      points: { type: 'array', items: { type: 'string' } },
      prochaineVisite: { type: 'string' },
      resume: { type: 'string' },
      message: { type: 'string' },
      alerteMedicale: { type: 'string' },
    },
    required: ['diagnostic', 'sens', 'solutions', 'propositions', 'rituel', 'jauges', 'points', 'prochaineVisite', 'resume', 'message', 'alerteMedicale'],
    additionalProperties: false,
  };
}

const sansTiretLong = (s: unknown): string =>
  (typeof s === 'string' ? s : '').replace(/\s*—\s*/g, ', ').replace(/,\s*,/g, ',').trim();

/* Ceinture et bretelles : le schéma contraint déjà le modèle, on revérifie ici.
   Une prestation hors liste tombe, un ingrédient hors des sept tombe, les
   Quatre Temps sortent au complet et dans l'ordre, les jauges restent de 1 à 5. */
function relu(brut: Record<string, unknown>, l: Listes) {
  const parId = new Map(l.prestations.map((p) => [p.id, p.nom]));
  const slugs = new Set(l.ingredients.map((i) => i.slug));
  const propositions: { serviceId: string; nom: string; quand: string }[] = [];
  for (const p of (Array.isArray(brut.propositions) ? brut.propositions : []) as Record<string, unknown>[]) {
    const id = String(p?.serviceId ?? '');
    if (!parId.has(id) || propositions.some((x) => x.serviceId === id)) continue;
    propositions.push({ serviceId: id, nom: parId.get(id)!, quand: sansTiretLong(p.quand) });
    if (propositions.length === 3) break;
  }
  const rit = (Array.isArray(brut.rituel) ? brut.rituel : []) as Record<string, unknown>[];
  const jau = (Array.isArray(brut.jauges) ? brut.jauges : []) as Record<string, unknown>[];
  return {
    diagnostic: sansTiretLong(brut.diagnostic),
    sens: sansTiretLong(brut.sens),
    solutions: sansTiretLong(brut.solutions),
    propositions,
    rituel: QUATRE_TEMPS.map((nom) => {
      const r = rit.find((x) => x?.nom === nom) ?? {};
      return {
        nom,
        cadence: sansTiretLong(r.cadence),
        texte: sansTiretLong(r.texte),
        ingredients: ((Array.isArray(r.ingredients) ? r.ingredients : []) as unknown[]).filter((s): s is string => typeof s === 'string' && slugs.has(s)),
      };
    }),
    jauges: QUATRE_JAUGES.map((nom) => {
      const j = jau.find((x) => x?.nom === nom) ?? {};
      const v = typeof j.valeur === 'number' ? Math.round(j.valeur) : 3;
      return { nom, valeur: Math.min(5, Math.max(1, v)), note: sansTiretLong(j.note) };
    }),
    points: ((Array.isArray(brut.points) ? brut.points : []) as unknown[]).map(sansTiretLong).filter(Boolean).slice(0, 3),
    prochaineVisite: sansTiretLong(brut.prochaineVisite),
    resume: sansTiretLong(brut.resume),
    message: sansTiretLong(brut.message),
    alerteMedicale: sansTiretLong(brut.alerteMedicale),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  // Réservé au personnel : un bilan coûte un appel payant, et une note de
  // séance ne regarde pas le public.
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: 'forbidden' }, 403);
  const { data: staffRow } = await admin.from('staff').select('user_id').eq('user_id', uid).maybeSingle();
  if (!staffRow) return json({ error: 'forbidden' }, 403);

  const demande = String(body.demande ?? 'rediger');
  const contexte = (body.contexte ?? {}) as Record<string, unknown>;
  const l = (body.listes ?? {}) as Partial<Listes>;
  const listes: Listes = {
    prestations: (l.prestations ?? []).filter((p) => p && typeof p.id === 'string' && typeof p.nom === 'string').slice(0, 120),
    ingredients: (l.ingredients ?? []).filter((i) => i && typeof i.slug === 'string').slice(0, 20),
    formules: (l.formules ?? []).filter((f) => typeof f === 'string').slice(0, 60),
    produits: (l.produits ?? []).filter((p) => typeof p === 'string').slice(0, 80),
  };
  if (listes.prestations.length === 0 || listes.ingredients.length === 0 || typeof contexte.appel !== 'string') {
    return json({ error: 'bad request' }, 400);
  }

  /* LE MINIMUM, ENCORE : la fonction ne transmet que ces clés du contexte,
     quoi que le Trône envoie. Un téléphone glissé par erreur ne part pas. */
  const CLES = ['appel', 'seance', 'cheveu', 'vu', 'attendu', 'retenir', 'bilansPasses'];
  const contexteSur = Object.fromEntries(Object.entries(contexte).filter(([k]) => CLES.includes(k)));

  const listesTexte = [
    'Prestations du catalogue (id · nom) :',
    ...listes.prestations.map((p) => `- ${p.id} · ${p.nom}`),
    '',
    'Les sept ingrédients de la Maison (slug · nom · rôle · note d’usage) :',
    ...listes.ingredients.map((i) => `- ${i.slug} · ${i.nom} · ${i.role}${i.note ? ` · ${i.note}` : ''}`),
    '',
    `Formules du Laboratoire : ${listes.formules.join(' ; ') || '(aucune)'}`,
    `Produits de la Gamme : ${listes.produits.join(' ; ') || '(aucun)'}`,
  ].join('\n');

  const consigne = demande === 'raccourcir'
    ? 'Voici le bilan actuel. Rendez-le PLUS COURT d’un tiers environ, sans rien perdre d’essentiel, mêmes propositions, même routine.'
    : demande === 'reformuler'
      ? 'Voici le bilan actuel. REFORMULEZ-le avec d’autres mots, plus chaleureux, sans changer le constat, les propositions ni la routine.'
      : 'Rédigez le bilan de cette séance.';

  const messages = [
    {
      role: 'user' as const,
      content: [
        listesTexte,
        '',
        'La séance et la note du maître (JSON) :',
        JSON.stringify(contexteSur, null, 1),
        '',
        ...(demande !== 'rediger' && body.actuel ? ['Le bilan actuel (JSON) :', JSON.stringify(body.actuel, null, 1), ''] : []),
        consigne,
      ].join('\n'),
    },
  ];

  /* LA CAUSE SE DIT — 5 octobre 2026. Le premier essai rendait « injoignable »
     sans rien de plus : la fonction taisait la vraie raison. Elle la rend
     maintenant (`detail`) au personnel qui l'appelle, et la note au journal
     de la fonction. Elle se rattrape seule sur les deux causes probables :
     un modèle que le compte ne connaît pas (on essaie le suivant), un bilan
     plus long que la place donnée (la place est large, et le dire au lieu de
     tronquer un JSON). */
  const detailDe = (e: unknown): string => {
    const x = e as { status?: number; message?: string; error?: { error?: { message?: string } } };
    return `${x?.status ?? ''} ${x?.error?.error?.message ?? x?.message ?? String(e)}`.trim().slice(0, 400);
  };
  let derniere = '';
  for (const modele of MODELES) {
    try {
      const response = await anthropic.messages.create({
        model: modele,
        max_tokens: 16000,
        system: SYSTEME,
        output_config: {
          effort: demande === 'rediger' ? 'medium' : 'low',
          format: { type: 'json_schema', schema: schemaPour(listes) },
        },
        messages,
      });

      if (response.stop_reason === 'refusal') return json({ error: 'refusal' }, 422);
      if (response.stop_reason === 'max_tokens') {
        console.error('[bilan-redige] trop long', modele);
        return json({ error: 'upstream', detail: 'Le bilan dépassait la place prévue : réessayez, ou raccourcissez la note.' }, 502);
      }
      const first = response.content.find((b) => b.type === 'text');
      if (!first || first.type !== 'text') return json({ error: 'upstream', detail: 'Réponse vide de l’assistant.' }, 502);

      let brut: Record<string, unknown>;
      try { brut = JSON.parse(first.text) as Record<string, unknown>; } catch {
        console.error('[bilan-redige] JSON illisible', first.text.slice(0, 200));
        return json({ error: 'upstream', detail: 'Réponse illisible de l’assistant, réessayez.' }, 502);
      }
      return json({
        brouillon: relu(brut, listes),
        modele,
        usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      });
    } catch (e) {
      derniere = detailDe(e);
      console.error('[bilan-redige]', modele, derniere);
      /* Un modèle inconnu du compte : on passe au suivant. Toute autre panne
         (clé, crédit, schéma, surcharge) se dit telle quelle. */
      const status = (e as { status?: number })?.status;
      if (status === 404 || (status === 400 && /model/i.test(derniere))) continue;
      return json({ error: 'upstream', detail: derniere }, 502);
    }
  }
  return json({ error: 'upstream', detail: derniere || 'Aucun modèle disponible.' }, 502);
});
