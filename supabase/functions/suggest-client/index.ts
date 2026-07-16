// Supabase Edge Function — suggest-client
// L'IA propose un persona et des segments pour une nouvelle tête couronnée.
//
// Pourquoi une fonction Edge : la clé Anthropic ne peut pas vivre dans Ma Couronne
// ni dans Le Trône — ce sont des paquets statiques, tout ce qu'ils embarquent est
// public. Elle reste ici, côté serveur, et le Trône appelle cette fonction.
//
// Déployez via le dashboard (Edge Functions → New function → coller ce code),
// puis définissez le secret : ANTHROPIC_API_KEY.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Persona = { id: string; name: string; essence: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  // Réservé au personnel : une suggestion coûte un appel payant, et les fiches
  // clientes ne regardent pas le public.
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: 'forbidden' }, 403);
  const { data: staffRow } = await admin.from('staff').select('user_id').eq('user_id', uid).maybeSingle();
  if (!staffRow) return json({ error: 'forbidden' }, 403);

  const personas = (body.personas ?? []) as Persona[];
  const segments = (body.segments ?? []) as string[];
  const fiche = (body.fiche ?? {}) as Record<string, unknown>;
  if (personas.length === 0 || segments.length === 0) return json({ error: 'bad request' }, 400);

  /* Le schéma est construit à la demande avec les VRAIS ids/segments de la maison :
     l'IA ne peut donc pas inventer un persona qui n'existe pas — le modèle est
     contraint à choisir dans la liste, pas seulement prié de le faire. */
  const schema = {
    type: 'object',
    properties: {
      personaId: {
        type: 'string',
        enum: personas.map((p) => p.id),
        description: 'Le persona qui accueille le mieux cette tête couronnée.',
      },
      segments: {
        type: 'array',
        items: { type: 'string', enum: segments },
        description: 'Les segments qui s’appliquent. Aucun si rien ne s’applique — n’en inventez pas.',
      },
      why: {
        type: 'string',
        description: 'Une phrase, en français, expliquant le choix à un maître de la maison.',
      },
    },
    required: ['personaId', 'segments', 'why'],
    additionalProperties: false,
  };

  const system = [
    'Vous assistez Le Trône, l’ERP de la Maison MND — maison de soin des locks à Cotonou (Bénin).',
    'On vous donne la fiche d’une nouvelle cliente ; vous proposez son persona et ses segments.',
    '',
    'Règles de la maison :',
    '— Choisissez UNIQUEMENT parmi les personas et segments fournis.',
    '— Dans le doute, préférez le persona d’accueil (« Initiée ») : la maison nomme une',
    '  cliente quand elle la connaît, pas avant. Une fiche vide ne révèle rien.',
    '— Les segments sont cumulables, mais n’en mettez aucun plutôt qu’un segment douteux.',
    '— « Diaspora » ne vaut que hors Bénin et Côte d’Ivoire.',
    '— Votre justification s’adresse à un maître : une phrase, sobre, sans emoji.',
  ].join('\n');

  const personaList = personas.map((p) => `- ${p.id} · ${p.name} : ${p.essence}`).join('\n');
  const ficheText = Object.entries(fiche)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([k, v]) => `- ${k} : ${v}`)
    .join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system,
      /* `effort: low` — c'est un classement court, pas une énigme : on paie le
         minimum et la maîtresse de maison n'attend pas devant son écran. */
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema },
      },
      messages: [
        {
          role: 'user',
          content: [
            'Personas disponibles :',
            personaList,
            '',
            `Segments disponibles : ${segments.join(', ')}`,
            '',
            'Fiche de la nouvelle tête couronnée :',
            ficheText || '(fiche presque vide — rien n’a encore été renseigné)',
          ].join('\n'),
        },
      ],
    });

    /* Un refus rend un contenu vide : sans ce garde-fou, content[0] planterait. */
    if (response.stop_reason === 'refusal') return json({ error: 'refusal' }, 422);
    const first = response.content.find((b) => b.type === 'text');
    if (!first || first.type !== 'text') return json({ error: 'empty' }, 502);

    const parsed = JSON.parse(first.text) as { personaId: string; segments: string[]; why: string };
    /* Ceinture et bretelles : le schéma contraint déjà le modèle, on revérifie
       côté serveur — une liste de personas modifiée entre-temps ne doit pas
       faire entrer un id fantôme dans le CRM. */
    const validPersona = personas.some((p) => p.id === parsed.personaId) ? parsed.personaId : '';
    const validSegments = (parsed.segments ?? []).filter((s) => segments.includes(s));

    return json({
      personaId: validPersona,
      segments: validSegments,
      why: parsed.why ?? '',
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    });
  } catch (e) {
    console.error('[suggest-client]', (e as Error)?.message);
    return json({ error: 'upstream' }, 502);
  }
});
