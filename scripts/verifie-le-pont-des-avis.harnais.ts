/* LE PONT DES AVIS, ÉPROUVÉ — 25 octobre 2026.
   `node scripts/verifie-le-pont-des-avis.mjs` (et `--prouve`).

   « Je veux également répondre aux avis Google depuis ici » (Yéman) ; choix
   du sélecteur : passer par Make. Le banc éprouve :
     1. les règles pures (avis-google-pont-pur) : la note, le nom d'avis,
        ce que Make envoie, le rangement, l'appariement Places ↔ Google
        (jamais deviné), le corps de la réponse, qui publie ;
     2. la VRAIE fonction avis-google-pont, rejouée sur un faux Supabase et
        un faux Make : le jeton, la porte de l'équipe, le webhook absent,
        l'avis introuvable, Make qui ne confirme pas, le chemin de Make qui
        ne publie jamais ;
     3. la copie du bloc pur dans la fonction ;
     4. l'écran : la publication ne part que de « Oui, publier ». */
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import {
  apparie, aPlat, avecLaReponse, corpsDeLaReponse, defautDeLaReponse, lisLAvisRecu, nomDAvisValide, noteDeGoogle, peutPublier, texteDeGoogle, versLeDocument,
  type AvisDeGoogle, type DocumentDesAvisDeGoogle,
} from '../src/shared/avis-google-pont-pur';
import {
  anciensAApreter, avisDeLaRubrique, cleDeGoogle, comptesDeLaRubrique, estRecent, etatDeLAvis, reponsesARelire,
} from '../src/shared/avis-rubrique-pur';
import { cleDeLAvis } from '../src/shared/avis-google-pur';
// @ts-expect-error module .mjs sans types
import { copiesAJour } from './copie-dans-le-centre.mjs';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const FONCTION = 'supabase/functions/avis-google-pont/index.ts';

const NOM = (r: string) => `accounts/116697610166272745270/locations/4897288569553825153/reviews/${r}`;
const G = (r: string, auteur: string, creeLe: string, texte = 'Très bon accueil.', x: Partial<AvisDeGoogle> = {}): AvisDeGoogle =>
  ({ name: NOM(r), auteur, note: 5, texte, creeLe, recuLe: '2026-10-25T08:00:00Z', ...x });

/* ── 1. LES RÈGLES ─────────────────────────────────────────────────────── */
dit('la note : FIVE, « 4 », 3 ; rien de lisible vaut 0', [5, 4, 3, 0, 0, 0], [noteDeGoogle('FIVE'), noteDeGoogle('4'), noteDeGoogle(3), noteDeGoogle('x'), noteDeGoogle(6), noteDeGoogle('STAR_RATING_UNSPECIFIED')]);
dit('le nom d avis : celui de Google, rien d autre (il finit dans une adresse)', [true, false, false, false, false],
  [nomDAvisValide(NOM('AbC_1-2')), nomDAvisValide(`${NOM('a')}/../x`), nomDAvisValide(`${NOM('a')}?x=1`), nomDAvisValide('locations/1/reviews/a'), nomDAvisValide(123)]);
const recu = lisLAvisRecu({ name: NOM('r1'), auteur: ' G. J. ', note: 'FIVE', texte: 'Merci', cree: '2026-07-23T10:00:00Z', maj: 'null', reponse: '', reponduLe: '2026-07-24T10:00:00Z' }, 'T');
dit('ce que Make envoie : les cases vides et les « null » écrits ne comptent pas ; une date de réponse sans réponse non plus',
  { name: NOM('r1'), auteur: 'G. J.', note: 5, texte: 'Merci', recuLe: 'T', creeLe: '2026-07-23T10:00:00Z' }, recu);
dit('... un nom qui n est pas celui d un avis : rien', [null, null], [lisLAvisRecu({ name: 'x', auteur: 'A' }, 'T'), lisLAvisRecu({}, 'T')]);
const avecRep = lisLAvisRecu({ name: NOM('r2'), auteur: 'B', note: '4', texte: '', reponse: 'Merci B.', reponduLe: '2026-07-02T10:00:00Z' }, 'T');
dit('... la réponse publiée se lit avec sa date', ['Merci B.', '2026-07-02T10:00:00Z'], [avecRep?.reponse, avecRep?.reponduLe]);

const doc0: DocumentDesAvisDeGoogle = { avis: { [NOM('r1')]: G('r1', 'G. J.', '2026-07-23T10:00:00Z', 'Merci', { reponse: 'Merci à vous', reponduLe: 'L', parLeTrone: true }) } };
const doc1 = versLeDocument(doc0, { ...G('r1', 'G. J.', '2026-07-23T10:00:00Z', 'Merci'), recuLe: 'T2' });
dit('rangé : Make sans réponse ne fait pas oublier celle du Trône', ['Merci à vous', true, 'T2'], [doc1.avis[NOM('r1')].reponse, doc1.avis[NOM('r1')].parLeTrone, doc1.le]);
const doc2 = versLeDocument(doc1, { ...G('r1', 'G. J.', '2026-07-23T10:00:00Z', 'Merci'), reponse: 'Autre', reponduLe: 'L2', recuLe: 'T3' });
dit('... la réponse que Make apporte gagne', ['Autre', 'L2', undefined], [doc2.avis[NOM('r1')].reponse, doc2.avis[NOM('r1')].reponduLe, doc2.avis[NOM('r1')].parLeTrone]);
dit('... la réponse du Trône se range sur l avis, et sur lui seul', [['Ok', 'X', true], 1],
  (() => { const d = avecLaReponse(doc0, NOM('r1'), 'Ok', 'X'); return [[d.avis[NOM('r1')].reponse, d.avis[NOM('r1')].reponduLe, d.avis[NOM('r1')].parLeTrone], Object.keys(avecLaReponse(doc0, NOM('zz'), 'Ok', 'X').avis).length]; })());

dit('à plat : accents, casse, ponctuation', 'helene k ado', aPlat('  Hélène K. — Adô! '));
const TOUS = [
  G('a', 'Hélène K.', '2026-07-23T10:00:00Z', 'Un soin long et précis.'),
  G('b', 'Hélène K.', '2025-01-10T10:00:00Z', 'Première venue, très contente.'),
  G('c', 'B. F.', '2026-07-01T09:00:00Z'),
  G('d', 'S. D.', '2026-07-16T10:00:00Z', 'Une des meilleures expériences.'),
  G('e', 'S. D.', '2026-07-16T10:00:00Z', 'Une autre expérience.'),
];
const nomDe = (g: AvisDeGoogle | null) => g?.name.split('/').pop() ?? null;
dit('apparier : le même nom (accents et casse près), la date la plus proche', ['a', 'b', 'c'], [
  nomDe(apparie({ auteur: 'helene k.', texte: 'x', publieLe: '2026-07-23T11:30:00Z' }, TOUS)),
  nomDe(apparie({ auteur: 'Hélène K.', texte: 'x', publieLe: '2025-01-10T12:00:00Z' }, TOUS)),
  nomDe(apparie({ auteur: 'B. F.', texte: 'Très bon accueil.', publieLe: '2026-07-01T09:00:00Z' }, TOUS)),
]);
dit('... deux avis à la même distance : on ne devine pas', null, nomDe(apparie({ auteur: 'S. D.', texte: 'x', publieLe: '2026-07-16T10:00:00Z' }, TOUS)));
dit('... mais le début du texte les départage quand la date manque', ['d', 'e'], [
  nomDe(apparie({ auteur: 'S. D.', texte: 'Une des meilleures expériences.' }, TOUS)),
  nomDe(apparie({ auteur: 'S. D.', texte: 'trad', texteOriginal: 'Une autre expérience.' }, TOUS)),
]);
dit('... une date trop loin (plus de 36 h) passe au texte, un nom inconnu ne trouve rien', ['a', null, null], [
  nomDe(apparie({ auteur: 'Hélène K.', texte: 'Un soin long et précis.', publieLe: '2026-08-30T10:00:00Z' }, TOUS)),
  nomDe(apparie({ auteur: 'Hélène K.', texte: 'Autre chose', publieLe: '2026-08-30T10:00:00Z' }, TOUS)),
  nomDe(apparie({ auteur: 'Inconnue', texte: 'Un soin long et précis.', publieLe: '2026-07-23T10:00:00Z' }, TOUS)),
]);
/* 25 octobre 2026, le premier import : 299 avis arrivés sans leurs noms. */
const majuscules = lisLAvisRecu({ Name: NOM('m1'), ' Auteur ': 'A. B.', NOTE: 'FOUR', Texte: 'Bien', Cree: '2026-07-01T09:00:00Z', REPONSE: 'Merci', reponduLe: '2026-07-02T09:00:00Z' }, 'T');
dit('les noms des champs de Make se lisent sans majuscules ni espaces', [NOM('m1'), 'A. B.', 4, 'Bien', '2026-07-01T09:00:00Z', 'Merci', '2026-07-02T09:00:00Z'],
  [majuscules?.name, majuscules?.auteur, majuscules?.note, majuscules?.texte, majuscules?.creeLe, majuscules?.reponse, majuscules?.reponduLe]);
const SANS_NOM = [
  G('s1', '', '2026-07-23T10:00:00Z', 'Il était temps que je fasse ma reprise de locks, et surtout.'),
  G('s2', '', '2026-07-23T11:00:00Z', 'Un tout autre avis du même jour.'),
  G('s3', '', '2026-07-13T10:00:00Z', 'Après avoir cherché longtemps des mains expertes. (Translated by Google) After…'),
  G('s4', '', '2026-07-01T10:00:00Z', ''),
  G('s5', '', '2026-08-01T10:00:00Z', 'Même début de texte que le suivant, mot pour mot ici.'),
  G('s6', '', '2026-08-01T12:00:00Z', 'Même début de texte que le suivant, mot pour mot ici.'),
];
dit('sans nom chez Make : la date ET le début du texte retrouvent l avis, et lui seul', ['s1', 's3', null, null, null, null], [
  nomDe(apparie({ auteur: 'G. J.', texte: 'Il était temps que je fasse ma reprise de locks, et surtout.', publieLe: '2026-07-23T10:00:00Z' }, SANS_NOM)),
  nomDe(apparie({ auteur: 'F. G.', texte: 'trad', texteOriginal: 'Après avoir cherché longtemps des mains expertes.', publieLe: '2026-07-13T10:00:01Z' }, SANS_NOM)),
  nomDe(apparie({ auteur: 'G. J.', texte: 'Il était temps que je fasse ma reprise de locks, et surtout.', publieLe: '2026-09-23T10:00:00Z' }, SANS_NOM)),
  nomDe(apparie({ auteur: 'B. F.', texte: '', publieLe: '2026-07-01T10:00:00Z' }, SANS_NOM)),
  nomDe(apparie({ auteur: 'X', texte: 'Même début de texte que le suivant, mot pour mot ici.', publieLe: '2026-08-01T11:00:00Z' }, SANS_NOM)),
  nomDe(apparie({ auteur: 'G. J.', texte: 'Il était temps que je fasse ma reprise de locks, et surtout.' }, SANS_NOM)),
]);
dit('... un avis nommé autrement chez Make n est jamais pris pour un avis sans nom', null,
  nomDe(apparie({ auteur: 'Z', texte: 'Un soin long et précis.', publieLe: '2026-07-23T10:00:00Z' }, TOUS)));

/* 26 octobre 2026 : le texte que Google traduit. */
dit('le texte de Google : l original d abord, la traduction à part, dans les deux sens ; sans traduction, tel quel', [
  { original: 'J’adore cet espace.', traduction: 'I love this place.' },
  { original: 'Great place.', traduction: 'Super endroit.' },
  { original: 'Très bien.' },
  { original: '' },
], [
  texteDeGoogle('J’adore cet espace.\n\n(Translated by Google)\nI love this place.'),
  texteDeGoogle('(Translated by Google) Super endroit.\n\n(Original)\nGreat place.'),
  texteDeGoogle('  Très bien. '),
  texteDeGoogle(undefined),
]);

const corps = corpsDeLaReponse('Merci « Awa » !\nÀ bientôt, "la Maison".');
dit('le corps de la réponse : du JSON où guillemets et retours à la ligne passent', { comment: 'Merci « Awa » !\nÀ bientôt, "la Maison".' }, JSON.parse(corps));
dit('ce qui empêche de publier : vide, trop long en octets (pas en signes)', ['la réponse est vide', 'la réponse est vide', null, 'la réponse dépasse la longueur que Google accepte', null],
  [defautDeLaReponse('  '), defautDeLaReponse(undefined), defautDeLaReponse('Merci'), defautDeLaReponse('é'.repeat(2049)), defautDeLaReponse('e'.repeat(4096))]);
dit('qui publie : la direction, la Clientèle, le Marketing ; pas les Finances', [true, true, true, true, false, false],
  [peutPublier('souverain', {}), peutPublier('gerant', undefined), peutPublier('equipe', { 'dept-clientele': true }), peutPublier('equipe', { 'dept-marketing': true }), peutPublier('equipe', { 'dept-finances': true }), peutPublier(undefined, { 'dept-clientele': false })]);

/* ── 2. LA VRAIE FONCTION, SUR UN FAUX SUPABASE ET UN FAUX MAKE ─────────── */
type Gestionnaire = (req: Request) => Promise<Response>;
type Monde = { docs: Record<string, unknown>; ecrits: string[]; appels: { url: string; corps: string }[]; make: { status: number; texte: string } | 'muet' };
function laFonction(env: Record<string, string>, monde: Monde): Gestionnaire {
  const src = lis(FONCTION).replace(/^import .*$/gm, '').replace(/^export /gm, '');
  const js = transformSync(src, { loader: 'ts', format: 'cjs' }).code;
  let gestionnaire: Gestionnaire | null = null;
  const fauxDeno = { env: { get: (n: string) => env[n] }, serve: (h: Gestionnaire) => { gestionnaire = h; } };
  const STAFF: Record<string, string> = { 'u-dir': 'souverain', 'u-equipe': 'equipe', 'u-clientele': 'equipe' };
  const JWT: Record<string, string> = { 'jwt-dir': 'u-dir', 'jwt-equipe': 'u-equipe', 'jwt-clientele': 'u-clientele' };
  const fauxAdmin = {
    auth: { getUser: async (jwt: string) => ({ data: { user: JWT[jwt] ? { id: JWT[jwt] } : null } }) },
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, v: string) => ({
          maybeSingle: async () => {
            if (table === 'staff') return { data: STAFF[v] ? { user_id: v, role: STAFF[v] } : null, error: null };
            return { data: v in monde.docs ? { data: monde.docs[v] } : null, error: null };
          },
        }),
      }),
      upsert: async (row: { key: string; data: unknown }) => { monde.docs[row.key] = JSON.parse(JSON.stringify(row.data)); monde.ecrits.push(row.key); return { error: null }; },
    }),
  };
  const fauxFetch = async (url: string, init: { body?: string }) => {
    monde.appels.push({ url, corps: String(init?.body ?? '') });
    if (monde.make === 'muet') throw new Error('réseau');
    return new Response(monde.make.texte, { status: monde.make.status });
  };
  // eslint-disable-next-line no-new-func
  new Function('Deno', 'createClient', 'fetch', js)(fauxDeno, () => fauxAdmin, fauxFetch);
  if (!gestionnaire) throw new Error('la fonction n a pas appelé Deno.serve');
  return gestionnaire;
}
const ENV = { SUPABASE_URL: 'https://exemple.supabase.co', CLE_SERVICE: 'service', AVIS_PONT_JETON: 'jeton-du-banc-0123456789', MAKE_AVIS_REPONDRE: 'https://hook.exemple.make.com/abc' };
const monde = (): Monde => ({ docs: { mnd_staff_access: { 'u-clientele': { 'dept-clientele': true } } }, ecrits: [], appels: [], make: { status: 200, texte: '200' } });
const R = (method: string, h: Record<string, string> = {}, body?: string) => new Request('https://exemple.supabase.co/functions/v1/avis-google-pont', { method, headers: h, body });
const lu = async (r: Response) => ({ s: r.status, j: await r.json() as Record<string, unknown> });

{
  const m = monde();
  const f = laFonction(ENV, m);
  const get = await lu(await f(R('GET')));
  dit('GET : 405, la version et l état du pont', [405, 'method', true, true, true], [get.s, get.j.error, typeof get.j.version === 'string', get.j.recoit, get.j.publie]);
  const sansWebhook = await lu(await laFonction({ ...ENV, MAKE_AVIS_REPONDRE: '' }, monde())(R('GET')));
  dit('... sans le webhook, « publie » est faux', [true, false], [sansWebhook.j.recoit, sansWebhook.j.publie]);

  const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
  const FORM = { 'content-type': 'application/x-www-form-urlencoded' };
  const mauvais = await lu(await f(R('POST', { ...FORM, 'x-jeton': 'jeton-du-banc-0123456780' }, form({ name: NOM('r1'), auteur: 'G. J.' }))));
  dit('Make avec un mauvais jeton : 403, rien d écrit', [403, 'jeton', []], [mauvais.s, mauvais.j.erreur, m.ecrits]);
  const bon = await lu(await f(R('POST', { ...FORM, 'x-jeton': ENV.AVIS_PONT_JETON }, form({ name: NOM('r1'), auteur: 'G. J.', note: 'FIVE', texte: 'Un soin long.', cree: '2026-07-23T10:00:00Z', reponse: '' }))));
  const rangé = (m.docs.mnd_avis_google_tous as DocumentDesAvisDeGoogle | undefined)?.avis?.[NOM('r1')];
  dit('Make avec le jeton : l avis se range, en formulaire', [200, 1, 'G. J.', 5, 'Un soin long.'], [bon.s, bon.j.nombre, rangé?.auteur, rangé?.note, rangé?.texte]);
  const enJson = await lu(await f(R('POST', { 'content-type': 'application/json', 'x-jeton': ENV.AVIS_PONT_JETON }, JSON.stringify({ name: NOM('r2'), auteur: 'B. F.', note: '4', texte: 'Bien', cree: '2026-07-01T09:00:00Z' }))));
  dit('... et en JSON', [200, 2], [enJson.s, enJson.j.nombre]);
  const pasUnAvis = await lu(await f(R('POST', { ...FORM, 'x-jeton': ENV.AVIS_PONT_JETON }, form({ name: 'accounts/1/locations/2/reviews/../x' }))));
  dit('... un nom qui n est pas celui d un avis : 400', [400, 'format'], [pasUnAvis.s, pasUnAvis.j.erreur]);
  const detourne = await lu(await f(R('POST', { 'content-type': 'application/json', 'x-jeton': ENV.AVIS_PONT_JETON }, JSON.stringify({ action: 'publier', avis: { auteur: 'G. J.', texte: 'x' }, reponse: 'Merci' }))));
  dit('LE CHEMIN DE MAKE NE PUBLIE JAMAIS : une demande de publication portée avec le jeton est refusée, Make n est pas appelé', [400, 0], [detourne.s, m.appels.length]);

  const PUB = (jwt: string | null, avis: Record<string, unknown>, reponse: unknown) =>
    R('POST', { 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) }, JSON.stringify({ action: 'publier', avis, reponse }));
  const AVIS = { auteur: 'G. J.', texte: 'Un soin long.', publieLe: '2026-07-23T10:30:00Z' };
  const anonyme = await lu(await f(PUB(null, AVIS, 'Merci')));
  const horsDept = await lu(await f(PUB('jwt-equipe', AVIS, 'Merci')));
  dit('publier : sans session, 403 ; une équipière sans le département, 403 ; Make n est pas appelé', [403, 403, 0], [anonyme.s, horsDept.s, m.appels.length]);
  const vide = await lu(await f(PUB('jwt-dir', AVIS, '   ')));
  const inconnu = await lu(await f(PUB('jwt-dir', { auteur: 'Inconnue', texte: 'x', publieLe: '2026-07-23T10:30:00Z' }, 'Merci')));
  dit('... une réponse vide : 400 ; un avis que Make n a pas apporté : 404 ; toujours rien vers Make', [400, 404, 'introuvable', 0], [vide.s, inconnu.s, inconnu.j.erreur, m.appels.length]);

  m.make = { status: 200, texte: 'Accepted' };
  const nonConfirme = await lu(await f(PUB('jwt-clientele', AVIS, 'Merci pour votre confiance.')));
  const avant = (m.docs.mnd_avis_google_tous as DocumentDesAvisDeGoogle).avis[NOM('r1')].reponse;
  dit('... Make qui ne rend pas « 200 » : 502, la réponse ne se range pas', [502, 'google', 1, undefined], [nonConfirme.s, nonConfirme.j.erreur, m.appels.length, avant]);
  m.make = 'muet';
  const muet = await lu(await f(PUB('jwt-dir', AVIS, 'Merci pour votre confiance.')));
  dit('... Make injoignable : 504, et le conseil de regarder Google avant de recommencer', [504, true], [muet.s, /Regardez l’avis sur Google/.test(String(muet.j.message))]);
  m.make = { status: 200, texte: '200' };
  const ok = await lu(await f(PUB('jwt-dir', AVIS, ' Merci « G. », à bientôt.\nLa Maison ')));
  const dernier = m.appels[m.appels.length - 1];
  const parti = JSON.parse(dernier.corps) as { review: string; corps: string };
  dit('... Make rend « 200 » : 200, le nom de l avis chez Google et le corps déjà écrit partent au webhook', [200, true, 'https://hook.exemple.make.com/abc', NOM('r1'), { comment: 'Merci « G. », à bientôt.\nLa Maison' }],
    [ok.s, ok.j.ok, dernier.url, parti.review, JSON.parse(parti.corps)]);
  const range = (m.docs.mnd_avis_google_tous as DocumentDesAvisDeGoogle).avis[NOM('r1')];
  dit('... et la réponse se range sur l avis, publiée par le Trône', ['Merci « G. », à bientôt.\nLa Maison', true, true], [range.reponse, range.parLeTrone, typeof range.reponduLe === 'string']);

  /* 26 octobre 2026 : la rubrique connaît le nom de l'avis chez Google. */
  const parNom = await lu(await f(PUB('jwt-dir', { name: NOM('r2') }, 'Merci B.')));
  const parti2 = JSON.parse(m.appels[m.appels.length - 1].corps) as { review: string };
  dit('par son nom : l avis sert tel quel, sans appariement, même sans autrice ni texte', [200, NOM('r2')], [parNom.s, parti2.review]);
  const avant2 = m.appels.length;
  const nomInconnu = await lu(await f(PUB('jwt-dir', { name: NOM('zz') }, 'Merci')));
  const nomFaux = await lu(await f(PUB('jwt-dir', { name: 'accounts/1/../x' }, 'Merci')));
  dit('... un nom absent du document : 404 ; un nom qui n est pas celui d un avis : 400 ; rien vers Make', [404, 400, avant2], [nomInconnu.s, nomFaux.s, m.appels.length]);

  const sansW = monde();
  sansW.docs.mnd_avis_google_tous = m.docs.mnd_avis_google_tous;
  const fW = laFonction({ ...ENV, MAKE_AVIS_REPONDRE: '' }, sansW);
  const pasDePont = await lu(await fW(PUB('jwt-dir', AVIS, 'Merci')));
  dit('... sans le webhook : 503, rien ne part', [503, 'pont', 0], [pasDePont.s, pasDePont.j.erreur, sansW.appels.length]);
  const sansJ = await lu(await laFonction({ ...ENV, AVIS_PONT_JETON: '' }, monde())(R('POST', { 'x-jeton': '' }, 'name=x')));
  dit('... sans le jeton posé, Make est refusé (même avec un en-tête vide)', [503, 'pont'], [sansJ.s, sansJ.j.erreur]);
}

/* ── 3. LA COPIE DU BLOC PUR ───────────────────────────────────────────── */
const { ecarts } = copiesAJour(lis(FONCTION), (p: string) => readFileSync(p, 'utf8')) as { ecarts: string[] };
dit('la fonction porte la copie à jour de avis-google-pont-pur', [], ecarts);
const f = sansCommentaires(lis(FONCTION));
dit('la fonction : sa version, le jeton comparé sans fuite, ni jeton ni webhook dans une réponse', [true, true, false],
  [/const VERSION = '2026-10-26-a';/.test(f), /memeSecret\(\(req\.headers\.get\('x-jeton'\)/.test(f), /json\(\{[^}]*(JETON|WEBHOOK)[,}]/.test(f.replace(/!!JETON|!!WEBHOOK/g, ''))]);

/* ── 4. L'ÉCRAN ────────────────────────────────────────────────────────── */
const ecran = sansCommentaires(lis('src/apps/trone/routes/clients/ReponseAUnAvis.tsx'));
dit('la publication ne part que de « Oui, publier » : un seul appel, dans `publier`, que seul ce bouton appelle', [1, true, 1, true],
  [(ecran.match(/publieSurGoogle\(/g) ?? []).length, /const publier = async \(\) => \{[\s\S]{0,200}publieSurGoogle\(/.test(ecran),
    (ecran.match(/void publier\(\)/g) ?? []).length, /onClick=\{\(\) => void publier\(\)\}>\{envoi \? 'Publication…' : 'Oui, publier'\}/.test(ecran)]);
dit('« Publier sur Google » ne fait qu ouvrir la question, qui nomme l autrice', [true, true],
  [/onClick=\{\(\) => setConfirme\(true\)\}[^>]*>Publier sur Google</.test(ecran), /Publier cette réponse sous l’avis de <b>\{avis\.auteur/.test(ecran)]);
dit('« publié » ne se note qu après le oui de la fonction', true, /if \(r\.ok\) \{\s*marquePublieeParLeTrone\(id, r\.le\);/.test(ecran));
dit('ni les brouillons de Claude ni l onglet ne publient', [false, false, false],
  [/avis-google-pont/.test(lis('src/shared/ia-avis.ts')), /publieSurGoogle/.test(lis('src/apps/trone/routes/clients/AvisGoogle.tsx')), /publieSurGoogle/.test(lis('src/shared/avis-google-pont-pur.ts'))]);
dit('la réponse donne à la fonction le nom de l avis chez Google', true, /publieLe: \(avis as \{ publieLe\?: string \}\)\.publieLe, name: avis\.name \}/.test(ecran));
const textes = [ecran, sansCommentaires(lis('src/shared/avis-google-pont.ts')), f, sansCommentaires(lis('src/apps/trone/routes/clients/AvisGoogle.tsx'))].join('\n');

/* ── 5. LA RUBRIQUE « LES AVIS GOOGLE » (26 octobre 2026) ───────────────── */
{
  const MAINT = Date.parse('2026-10-26T08:00:00Z');
  const RELEVE = [{ auteur: 'G. J.', note: 5, texte: 'Un soin long et précis.', publieLe: '2026-07-23T10:00:00Z', quand: 'il y a 3 mois' }];
  const MAKE = [
    G('v1', 'G. J.', '2026-07-23T10:00:00Z', 'Un soin long et précis.', { reponse: 'Merci G.', reponduLe: '2026-07-24T10:00:00Z' }),
    G('v2', 'A. K.', '2026-10-25T07:30:00Z', 'Accueil chaleureux.\n\n(Translated by Google)\nWarm welcome.'),
    G('v3', 'S. H.', '2026-10-20T07:30:00Z', 'Une heure d’attente.', { note: 2 }),
    G('v4', '', '2025-01-10T10:00:00Z', 'Ancien avis.'),
    G('v5', 'R. T.', '2025-03-10T10:00:00Z', ''),
  ];
  const liste = avisDeLaRubrique(MAKE, RELEVE);
  dit('la liste : tous les avis de Make, du plus récent au plus ancien', ['v2', 'v3', 'v1', 'v5', 'v4'], liste.map((a) => a.name?.split('/').pop()));
  dit('... l avis que Places connaît garde SA clé (brouillons, fiche, site d avant) ; les autres une clé tirée de Google', [cleDeLAvis(RELEVE[0]), cleDeGoogle(NOM('v2'))],
    [liste.find((a) => a.name === NOM('v1'))?.cle, liste.find((a) => a.name === NOM('v2'))?.cle]);
  dit('... le texte d origine, la traduction à part, la réponse publiée lue', ['Accueil chaleureux.', 'Warm welcome.', 'Merci G.'],
    [liste[0].texte, liste[0].traduction, liste.find((a) => a.name === NOM('v1'))?.reponse]);
  dit('... sans Make, le relevé de Places, comme avant', [1, cleDeLAvis(RELEVE[0])], [avisDeLaRubrique(null, RELEVE).length, avisDeLaRubrique([], RELEVE)[0].cle]);
  const v = (n: string) => liste.find((a) => a.name === NOM(n))!;
  const B = { [v('v3').cle]: { reponse: 'Pardon.', le: 'L' }, [v('v5').cle]: { ecarte: true }, [v('v4').cle]: { enCours: new Date(MAINT - 30_000).toISOString() } };
  dit('l état : répondu, prête, écartée, Claude prépare, nouveau', ['publiee', 'prete', 'ecartee', 'prepare', 'nouveau'],
    [etatDeLAvis(v('v1'), undefined, MAINT), etatDeLAvis(v('v3'), B[v('v3').cle], MAINT), etatDeLAvis(v('v5'), B[v('v5').cle], MAINT), etatDeLAvis(v('v4'), B[v('v4').cle], MAINT), etatDeLAvis(v('v2'), undefined, MAINT)]);
  dit('les comptes : le même juge que la liste', { recus: 2, relire: 1, sans: 4, publiees: 1, site: 1, tous: 5 },
    comptesDeLaRubrique(liste, B, (c) => c === v('v1').cle, MAINT));
  dit('récent : arrivé dans les 30 jours', [true, true, false], [estRecent(v('v2'), MAINT), estRecent(v('v3'), MAINT), estRecent(v('v4'), MAINT)]);
  dit('les dix suivants : les anciens sans réponse ni proposition, sans échec récent, jamais les récents', [['v4'], []],
    [anciensAApreter(liste, {}, MAINT).map((a) => a.name?.split('/').pop()).filter((n) => n !== 'v5'), anciensAApreter(liste, { [v('v4').cle]: { echoueLe: 'X' }, [v('v5').cle]: { ecarte: true } }, MAINT).map((a) => a.name)]);
  dit('le chiffre de la barre : les réponses prêtes, ni publiées ni écartées', 1,
    reponsesARelire({ a: { reponse: 'x' }, b: { reponse: 'y', publieeLe: 'L' }, c: { reponse: 'z', ecarte: true }, d: {} }));
}
dit('pas de tiret cadratin ni de « salon » dans le texte affiché', [false, false], [/—/.test(textes), /\bsalon/i.test(textes)]);

console.log(ko === 0 ? '\nTOUT VA BIEN : le pont des avis tient ses promesses.' : `\n${ko} ÉCHEC(S)`);
if (ko) process.exitCode = 1;
