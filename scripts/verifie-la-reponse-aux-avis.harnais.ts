/* LA RÉPONSE AUX AVIS GOOGLE, ÉPROUVÉE — `node scripts/verifie-la-reponse-aux-avis.mjs`.

   19 octobre 2026. Chantier 5 des huit chantiers Claude (maquette NKQMiMMY…
   validée par Yéman, « Tout me va ») : « Les avis Google (N sans réponse).
   Pour un avis sans réponse : "Réponse proposée" (dans sa langue), boutons
   Copier / Ouvrir l'avis sur Google / Une autre. Google exige que la réponse
   soit publiée par vous : on copie, on colle. » Sa décision : signée
   « L'équipe de la Maison MND ». Cinq brouillons par ouverture, un appel à la
   fois, jamais deux fois le même avis ; rien ne part vers Google ; la
   fonction avis-google-releve n'est pas touchée.

   Les attentes sont ÉCRITES d'après cette décision, jamais déduites du code.
   La vraie fonction ia-maison n'est jamais appelée (le client Supabase vaut
   null ici, on le vérifie avant tout). Données d'exemple.

   19 octobre 2026, reprise : la série de l'ouverture est JOUÉE contre un
   faux Claude qui compte ses appels en vol (un à la fois, cinq au plus,
   jamais deux fois, arrêt sur un refus de la porte, relue avant chaque
   appel) ; la vraie `proposeUneReponse` est jouée hors ligne, pour voir le
   verrou posé avant l'appel et l'échec noté après ; la relecture refuse
   aussi la remise, le remboursement, le numéro, le lien et la civilité
   supposée, et ne double pas une signature traduite. */
import { readFileSync } from 'node:fs';
import {
  BROUILLONS_PAR_OUVERTURE, CLE_DES_BROUILLONS, LIEN_DE_LA_FICHE_DEFAUT, PHRASES_MAX, SCHEMA_DE_LA_REPONSE, SIGNATURE_DES_AVIS,
  aUneReponseChezGoogle, compteSansReponse, comptePhrases, consigneDeLaReponse, estSansReponse, idDeLAvis, langueDite, lectureDeLaReponse,
  jourLocalDe, lienDeLAvis, messagePourLAvis, prenomDeLAuteur, prepareUneSerie, prochainsAFaire,
  type AvisAvecReponse, type BrouillonDAvis, type BrouillonsDAvis, type IssueDeProposition,
} from '../src/shared/ia-avis-pur';
import { brouillonsDAvisStore, proposeUneReponse } from '../src/shared/ia-avis';
import { supabase } from '../src/shared/supabase';
import { documentDescendu } from '../src/shared/sync';
import { cleDeLAvis } from '../src/shared/avis-google-pur';
import { CHANTIERS_IA, DEPARTEMENTS_PAR_CHANTIER, peutDemander } from '../src/shared/ia-maison-pur';

/* AUCUN APPEL NE PEUT PARTIR : sans clés, pas de client. */
if (supabase) throw new Error('le harnais a un client Supabase : il pourrait appeler la vraie fonction');

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const PUR = 'src/shared/ia-avis-pur.ts';
const MAGASIN = 'src/shared/ia-avis.ts';
const COMPOSANT = 'src/apps/trone/routes/clients/ReponseAUnAvis.tsx';
const ECRAN = 'src/apps/trone/routes/clients/AvisGoogle.tsx';
const FONCTION = 'supabase/functions/avis-google-releve/index.ts';
const T0 = Date.parse('2026-10-19T10:00:00Z');
const il = (min: number) => new Date(T0 - min * 60_000).toISOString();

const AWA: AvisAvecReponse = { auteur: 'Awa Dossou', note: 5, texte: 'Un accueil doux et un vrai savoir-faire. Appelez le 01 97 00 00 00 pour réserver !', quand: 'il y a 2 semaines' };
const SIGNEE = (corps: string) => `${corps}\n\n${SIGNATURE_DES_AVIS}`;

/* ── 1. LA RÈGLE ──────────────────────────────────────────────────────── */
dit('sa décision : la signature, cinq brouillons par ouverture, trois phrases', ['L’équipe de la Maison MND', 5, 3], [SIGNATURE_DES_AVIS, BROUILLONS_PAR_OUVERTURE, PHRASES_MAX]);
dit('le chantier « avis » est à la porte, ouvert à la Clientèle et au Marketing', [true, ['dept-clientele', 'dept-marketing']], [CHANTIERS_IA.includes('avis'), DEPARTEMENTS_PAR_CHANTIER.avis]);
dit('qui peut demander : la direction, la Clientèle, le Marketing ; pas l Atelier, pas sans rôle', [true, true, true, true, false, false, false], [
  peutDemander('souverain', 'avis', {}), peutDemander('gerant', 'avis', undefined), peutDemander('maitre', 'avis', { 'dept-clientele': true }),
  peutDemander('maitre', 'avis', { 'dept-marketing': true }), peutDemander('maitre', 'avis', { 'dept-atelier': true }), peutDemander('maitre', 'avis', {}), peutDemander(undefined, 'avis', { 'dept-clientele': true }),
]);
dit('le prénom seul, tel qu il paraît sur Google ; rien sans nom', ['Awa', 'A.', '', 'Grace', ''],
  [prenomDeLAuteur('Awa Dossou'), prenomDeLAuteur('A. D.'), prenomDeLAuteur('   '), prenomDeLAuteur('Grace'), prenomDeLAuteur(null)]);
dit('l identifiant d un avis est la clé du choix du site (un seul identifiant pour les deux écrans)', cleDeLAvis(AWA), idDeLAvis(AWA));
dit('le document des brouillons', 'mnd_ia_avis_brouillons', CLE_DES_BROUILLONS);
{
  const nu = { auteur: 'Bintou K.', note: 4, texte: 'Très bien.' };
  dit('« sans réponse » : rien chez Google (les quatre noms possibles lus), et pas « collée »', [false, true, true, true, true, false, false],
    [aUneReponseChezGoogle(nu), aUneReponseChezGoogle({ ...nu, reply: 'Merci Bintou.' }), aUneReponseChezGoogle({ ...nu, ownerResponse: { text: 'Merci' } }),
      aUneReponseChezGoogle({ ...nu, reponse: 'Merci' }), aUneReponseChezGoogle({ ...nu, ownerReply: 'Merci' }), aUneReponseChezGoogle({ ...nu, reply: '   ' }), aUneReponseChezGoogle(null)]);
  dit('... l avis répondu chez Google ou collé par la Maison sort du compte ; écarté, il y reste', [true, false, false, true],
    [estSansReponse(nu, undefined), estSansReponse({ ...nu, reply: 'Merci' }, undefined), estSansReponse(nu, { reponse: 'x', publieeLe: il(5) }), estSansReponse(nu, { ecarte: true })]);
}
{
  const a = (n: number, extra: Partial<AvisAvecReponse> = {}): AvisAvecReponse => ({ auteur: `Auteur ${n}`, note: 5, texte: `Avis numéro ${n}.`, ...extra });
  const avis = [a(1), a(2), a(3), a(4), a(5), a(6), a(1), a(8), a(9, { reply: 'Merci.' }), a(10), a(11), a(12)];
  const id = (n: number) => idDeLAvis(a(n));
  const brouillons: BrouillonsDAvis = {
    [id(2)]: { reponse: 'Déjà proposée.', langue: 'fr', le: il(60), modele: 'm' },
    [id(3)]: { ecarte: true },
    [id(4)]: { enCours: il(1) },
    [id(5)]: { enCours: il(3) },
    [id(6)]: { echoueLe: il(10) },
    [id(8)]: { echoueLe: il(120) },
  };
  dit('les prochains à faire : sans réponse, sans brouillon, non écartés, verrou tombé ou absent, pas d échec récent, jamais le même deux fois, cinq au plus',
    [id(1), id(5), id(8), id(10), id(11)], prochainsAFaire(avis, brouillons, T0));
  dit('... et l on peut en demander moins (ce qui reste de l ouverture)', [id(1), id(5)], prochainsAFaire(avis, brouillons, T0, 2));
  dit('... rien à faire : rien', [], prochainsAFaire([a(2), a(9, { reply: 'Merci.' })], brouillons, T0));
  dit('le compte des sans réponse : Google répondu et « collée » exclus, écarté compris', 10, compteSansReponse(avis, { ...brouillons, [id(10)]: { reponse: 'x', publieeLe: il(1) } }));
}
dit('où ouvrir l avis : le lien de l avis, sinon la fiche relevée, sinon la fiche de la Maison ; jamais un lien douteux',
  ['https://maps.app.goo.gl/abc', 'https://maps.google.com/?cid=4897288569553825153', LIEN_DE_LA_FICHE_DEFAUT, LIEN_DE_LA_FICHE_DEFAUT, LIEN_DE_LA_FICHE_DEFAUT],
  [lienDeLAvis({ ...AWA, lien: 'https://maps.app.goo.gl/abc' }, 'https://maps.google.com/?cid=1'), lienDeLAvis(AWA, 'https://maps.google.com/?cid=4897288569553825153'),
    lienDeLAvis(AWA, undefined), lienDeLAvis(AWA, 'javascript:alert(1)'), lienDeLAvis(null, '')]);
dit('la fiche par défaut est celle de « M Natural Dreadlocks » (son identifiant Google)', true, LIEN_DE_LA_FICHE_DEFAUT.includes('ChIJbwIfV9hVIxARgS3WzgGq9kM'));
dit('le jour d un instant se lit à l heure du poste (0 h 30 le 19 reste le 19), une date illisible garde ses dix premiers signes', ['2026-10-19', '2026-10-18', 'pas une da'],
  [jourLocalDe(new Date(2026, 9, 19, 0, 30).toISOString()), jourLocalDe(new Date(2026, 9, 18, 23, 59).toISOString()), jourLocalDe('pas une date')]);
dit('la langue se dit en français ; un code inconnu reste un code ; rien = français', ['français', 'anglais', 'portugais', 'XX', 'français'], [langueDite('fr'), langueDite('EN'), langueDite('pt'), langueDite('xx'), langueDite(undefined)]);

/* ── 2. LA CONSIGNE ET LE MESSAGE ─────────────────────────────────────── */
{
  const c = consigneDeLaReponse();
  dit('la consigne : la LANGUE de l avis, trois phrases, calme devant un avis dur, remercier et reconnaître sans se justifier, inviter à revenir ou à écrire en privé',
    [true, true, true, true, true, true],
    [/LANGUE de l’avis/.test(c), /3 phrases au plus/.test(c), /même devant un avis dur/.test(c), /remercie, reconnais ce qui est dit sans te justifier longuement/.test(c),
      /Invite à revenir/.test(c), /écrire à la Maison en privé/.test(c)]);
  dit('... ses interdits : prix, promesse, « salon », nom entier, Madame supposée, tiret long, numéro', [true, true, true, true, true, true, true],
    [/JAMAIS de prix/.test(c), /Jamais de promesse/.test(c), /Jamais le mot « salon »/.test(c), /Jamais le nom entier de l’auteur/.test(c), /Ni « Madame » ni « Monsieur »/.test(c),
      /Jamais de tiret long/.test(c), /sans donner de numéro/.test(c)]);
  dit('... signée « L’équipe de la Maison MND », en français même pour un avis en anglais ; Claude propose, ne publie rien', [true, true, true],
    [c.includes(`« ${SIGNATURE_DES_AVIS} »`), /en français même si l’avis ne l’est pas/.test(c), /tu proposes, tu ne publies rien/.test(c)]);
  dit('la forme attendue : langue et réponse, rien d autre', [['langue', 'reponse'], false],
    [SCHEMA_DE_LA_REPONSE.required, (SCHEMA_DE_LA_REPONSE as { additionalProperties?: boolean }).additionalProperties]);
  const m = messagePourLAvis(AWA);
  dit('le message pour Claude : la note, quand, le prénom seul ; jamais le nom de famille ni un numéro', [true, true, true, false, false, true],
    [/5 étoiles sur 5/.test(m), /laissé il y a 2 semaines/.test(m), /Prénom de l’auteur, tel qu’il paraît sur Google : Awa\./.test(m), /Dossou/.test(m), /97 00 00 00/.test(m), /\[numéro\]/.test(m)]);
  dit('... un avis sans texte le dit', true, /une note seulement/.test(messagePourLAvis({ auteur: 'K.', note: 3, texte: '' })));
  /* Le relevé garde la traduction française de Google ; l'original, s'il le
     porte un jour, est ce que Claude doit lire pour répondre dans sa langue. */
  const traduit: AvisAvecReponse = { auteur: 'John Smith', note: 4, texte: 'Super accueil, je reviendrai.', texteOriginal: 'Great welcome, I will come back.', langueOriginale: 'en-US' };
  const mt = messagePourLAvis(traduit);
  dit('le texte d origine passe avant la traduction de Google, avec sa langue ; sans lui, le texte du relevé, sans ligne de langue', [true, false, true, true, false],
    [/« Great welcome, I will come back\. »/.test(mt), /Super accueil/.test(mt), /Langue de l’avis, selon Google : en\./.test(mt),
      /« Super accueil, je reviendrai\. »/.test(messagePourLAvis({ ...traduit, texteOriginal: undefined })), /Langue de l’avis/.test(messagePourLAvis({ ...traduit, texteOriginal: '  ' }))]);
  dit('... une langue illisible ne se dit pas', false, /Langue de l’avis/.test(messagePourLAvis({ ...traduit, langueOriginale: 'anglais américain' })));
}

/* ── 3. LA RELECTURE DE CE QUE CLAUDE REND ────────────────────────────── */
dit('vide, absent, ou pas un objet : refusée', [null, null, null, null, null],
  [lectureDeLaReponse({ langue: 'fr', reponse: '   ' }, AWA), lectureDeLaReponse(null, AWA), lectureDeLaReponse({ langue: 'fr' }, AWA), lectureDeLaReponse('Merci Awa.', AWA),
    lectureDeLaReponse({ langue: 'fr', reponse: 'L’équipe de la Maison MND' }, AWA)]);
dit('la signature ajoutée si elle manque, une seule fois, à sa place', { langue: 'fr', reponse: SIGNEE('Merci Awa pour votre confiance. Au plaisir de vous revoir à la Maison.') },
  lectureDeLaReponse({ langue: 'fr', reponse: 'Merci Awa pour votre confiance. Au plaisir de vous revoir à la Maison.' }, AWA));
dit('... déjà signée (apostrophe droite, tiret devant) : pas doublée, apostrophe de la Maison', SIGNEE('Merci Awa.'),
  lectureDeLaReponse({ langue: 'fr', reponse: "Merci Awa.\n\n- L'équipe de la Maison MND" }, AWA)?.reponse);
dit('« salon » : refusée', [null, null], [lectureDeLaReponse({ langue: 'fr', reponse: 'Merci Awa, notre salon vous attend.' }, AWA), lectureDeLaReponse({ langue: 'en', reponse: 'Our salons welcome you.' }, AWA)]);
dit('un prix : refusée ; un nombre qui n est pas un prix passe', [null, null, null, null, true],
  [lectureDeLaReponse({ langue: 'fr', reponse: 'Merci Awa. Le soin est à 15 000 F.' }, AWA), lectureDeLaReponse({ langue: 'fr', reponse: 'Comptez 20000 francs.' }, AWA),
    lectureDeLaReponse({ langue: 'en', reponse: 'Only 10 € per visit.' }, AWA), lectureDeLaReponse({ langue: 'en', reponse: 'It costs $25.' }, AWA),
    lectureDeLaReponse({ langue: 'fr', reponse: 'Revenez 2 fois par an pour l’entretien.' }, AWA) !== null]);
dit('l anglais est gardé tel quel, la signature reste en français, la langue en minuscules', { langue: 'en', reponse: SIGNEE('Thank you Awa for your kind words. We look forward to welcoming you back to the Maison.') },
  lectureDeLaReponse({ langue: 'EN', reponse: 'Thank you Awa for your kind words. We look forward to welcoming you back to the Maison.' }, AWA));
dit('le tiret long devient une virgule', SIGNEE('Merci Awa, à bientôt à la Maison.'), lectureDeLaReponse({ langue: 'fr', reponse: 'Merci Awa — à bientôt à la Maison.' }, AWA)?.reponse);
dit('le nom entier redevient le prénom, la civilité supposée tombe', [SIGNEE('Merci Awa pour votre visite.'), SIGNEE('Merci Awa, revenez quand vous voulez.'), SIGNEE('Merci Awa.')],
  [lectureDeLaReponse({ langue: 'fr', reponse: 'Merci Madame Awa Dossou pour votre visite.' }, AWA)?.reponse,
    lectureDeLaReponse({ langue: 'fr', reponse: 'Merci Dossou, revenez quand vous voulez.' }, AWA)?.reponse,
    lectureDeLaReponse({ langue: 'fr', reponse: 'Merci Monsieur Awa.' }, AWA)?.reponse]);
dit('trop longue : refusée (plus de quatre phrases, ou plus de 700 signes) ; quatre passent', [null, null, true],
  [lectureDeLaReponse({ langue: 'fr', reponse: 'Merci. Merci. Merci. Merci. Merci. Merci.' }, AWA), lectureDeLaReponse({ langue: 'fr', reponse: `Merci ${'beaucoup '.repeat(90)}Awa.` }, AWA),
    lectureDeLaReponse({ langue: 'fr', reponse: 'Merci Awa. Vos mots nous touchent. La Maison vous attend. À bientôt.' }, AWA) !== null]);
dit('une langue illisible devient « fr »', ['fr', 'fr', 'pt'],
  [lectureDeLaReponse({ langue: 'français', reponse: 'Merci.' }, AWA)?.langue, lectureDeLaReponse({ langue: 42, reponse: 'Merci.' }, AWA)?.langue, lectureDeLaReponse({ langue: 'pt', reponse: 'Obrigada.' }, AWA)?.langue]);
dit('les phrases se comptent aux fins marquées', [0, 1, 2, 3], [comptePhrases(''), comptePhrases('Merci'), comptePhrases('Merci. Au revoir !'), comptePhrases('A… b. c ?')]);
{
  const lis = (reponse: string, auteur: Pick<AvisAvecReponse, 'auteur'> = AWA, langue = 'fr') => lectureDeLaReponse({ langue, reponse }, auteur);
  dit('une remise ou un remboursement : refusée (ni geste commercial, ni promesse)', [null, null, null, null],
    [lis('Merci Awa, profitez de -20 % à votre retour.'), lis('Nous vous rembourserons, Awa.'), lis('We will refund you, Awa.', AWA, 'en'), lis('Un dédommagement vous attend.')]);
  dit('un numéro, un courriel, un lien : refusée (« sans donner de numéro ni d’adresse »)', [null, null, null, null],
    [lis('Écrivez-nous au 01 51 99 77 99.'), lis('Écrivez à contact@exemple.com, Awa.'), lis('Réservez sur https://exemple.com/.'), lis('Voyez www.exemple.com, Awa.')]);
  dit('une civilité supposée, sans le prénom derrière : refusée (on ne sait pas qui écrit)', [null, null, null, null],
    [lis('Merci Madame pour votre visite.'), lis('merci monsieur, à bientôt.'), lis('Thank you Sir.', AWA, 'en'), lis('Thank you Mrs. for coming.', AWA, 'en')]);
  dit('... la civilité devant un prénom accentué tombe aussi, et le nom entier redevient le prénom', SIGNEE('Merci Aimé pour votre fidélité.'),
    lis('Merci Madame Aimé Hounkpè pour votre fidélité.', { auteur: 'Aimé Hounkpè' })?.reponse);
  dit('la signature traduite par Claude ne se double pas ; une phrase qui nomme la Maison reste',
    [SIGNEE('Thank you Awa.'), SIGNEE('Thank you Awa.'), SIGNEE('Thank you Awa.\nSee you soon at Maison MND.')],
    [lis('Thank you Awa.\n\nThe Maison MND team', AWA, 'en')?.reponse, lis('Thank you Awa.\n— Maison MND', AWA, 'en')?.reponse,
      lis('Thank you Awa.\nSee you soon at Maison MND.', AWA, 'en')?.reponse]);
}

/* ── 3 bis. LA SÉRIE DE L'OUVERTURE, JOUÉE CONTRE UN FAUX CLAUDE ─────── */
{
  const a = (n: number, extra: Partial<AvisAvecReponse> = {}): AvisAvecReponse => ({ auteur: `Auteur ${n}`, note: 5, texte: `Avis numéro ${n}.`, ...extra });
  const avis = [a(1), a(2), a(3), a(4), a(5), a(6), a(1), a(8), a(9, { reply: 'Merci.' }), a(10), a(11), a(12)];
  const id = (n: number) => idDeLAvis(a(n));
  /* Ceux qui ont besoin d'une proposition, dans l'ordre : 1, 5, 8, 10, 11, 12
     (2 a sa proposition, 3 est écarté, 4 a un verrou qui tient, 6 a échoué il y
     a dix minutes, le second 1 est un doublon, 9 est répondu chez Google). */
  const depart = (): BrouillonsDAvis => ({
    [id(2)]: { reponse: 'Déjà proposée.', langue: 'fr', le: il(60), modele: 'm' },
    [id(3)]: { ecarte: true },
    [id(4)]: { enCours: il(1) },
    [id(5)]: { enCours: il(3) },
    [id(6)]: { echoueLe: il(10) },
    [id(8)]: { echoueLe: il(120) },
  });
  const fauxClaude = (issues: Record<string, IssueDeProposition> = {}, pendant?: (id: string) => void) => {
    const appels: string[] = [];
    let enVol = 0;
    let auPlus = 0;
    const propose = async (x: AvisAvecReponse): Promise<IssueDeProposition> => {
      const i = idDeLAvis(x);
      appels.push(i);
      enVol += 1;
      auPlus = Math.max(auPlus, enVol);
      pendant?.(i);
      await new Promise((r) => setTimeout(r, 3));
      enVol -= 1;
      return issues[i] ?? { ok: true };
    };
    return { appels, propose, auPlus: () => auPlus };
  };
  const serie = (c: ReturnType<typeof fauxClaude>, o: { max?: number; deja?: Set<string>; brouillons?: BrouillonsDAvis; continuer?: () => boolean } = {}) => {
    const b = o.brouillons ?? depart();
    return prepareUneSerie({ avis, lis: () => b, propose: c.propose, maintenant: () => T0, max: o.max ?? BROUILLONS_PAR_OUVERTURE, dejaDemandes: o.deja ?? new Set(), continuer: o.continuer ?? (() => true) });
  };

  {
    const c = fauxClaude();
    const deja = new Set<string>();
    const n1 = await serie(c, { deja });
    dit('la série : cinq au plus, dans l’ordre de Google, UN appel en vol à la fois', [5, [id(1), id(5), id(8), id(10), id(11)], 1], [n1, [...c.appels], c.auPlus()]);
    const n2 = await serie(c, { deja });
    dit('... une deuxième ouverture dans la même page ne redemande aucun avis déjà demandé (jamais deux fois)', [1, [id(1), id(5), id(8), id(10), id(11), id(12)]], [n2, c.appels]);
  }
  {
    const b = depart();
    const c = fauxClaude({}, (i) => { if (i === id(1)) b[id(5)] = { enCours: new Date(T0).toISOString() }; });
    await serie(c, { brouillons: b });
    dit('... chaque avis est relu juste avant son appel : pris par un autre poste pendant le précédent, il est passé', [id(1), id(8), id(10), id(11), id(12)], c.appels);
  }
  {
    const c = fauxClaude({ [id(1)]: { ok: false, erreur: 'budget' } });
    const n = await serie(c);
    dit('... un refus de la porte (le budget) arrête la série au premier avis', [1, [id(1)]], [n, c.appels]);
    const c2 = fauxClaude({ [id(1)]: { ok: false, erreur: 'version' } });
    await serie(c2);
    dit('... la porte absente aussi', [id(1)], c2.appels);
  }
  {
    const c = fauxClaude({ [id(1)]: { ok: false, erreur: 'lecture' }, [id(5)]: { ok: false, erreur: 'claude' } });
    await serie(c);
    dit('... une proposition refusée à la relecture, ou un Claude qui a mal répondu, ne vaut que pour cet avis : on passe au suivant',
      [id(1), id(5), id(8), id(10), id(11)], c.appels);
  }
  {
    const c = fauxClaude();
    let encore = true;
    const c2 = fauxClaude({}, () => { encore = false; });
    await serie(c, { max: 2 });
    await serie(c2, { continuer: () => encore });
    dit('... ce qui reste de l’ouverture borne la série ; l’écran fermé l’arrête avant l’appel suivant', [[id(1), id(5)], [id(1)]], [c.appels, c2.appels]);
    const c3 = fauxClaude();
    await serie(c3, { max: 0 });
    await serie(c3, { deja: new Set([id(1), id(5)]) });
    dit('... rien qui reste : rien ; un avis déjà demandé laisse sa place au suivant', [id(8), id(10), id(11), id(12)], c3.appels);
  }
}

/* ── 3 ter. LA VRAIE PROPOSITION, HORS LIGNE : LE VERROU AVANT, L'ÉCHEC APRÈS */
{
  dit('sans serveur, le document des brouillons est « descendu » (rien ne viendra)', true, documentDescendu(CLE_DES_BROUILLONS));
  const idAwa = idDeLAvis(AWA);
  const avant: BrouillonDAvis = { ...(brouillonsDAvisStore.get()[idAwa] ?? {}) };
  /* La proposition court jusqu'à son premier `await` (l'appel à la porte) :
     ce qu'on lit juste après l'avoir lancée est l'état PENDANT l'appel. */
  const enVol = proposeUneReponse(AWA);
  const pendant: BrouillonDAvis = { ...(brouillonsDAvisStore.get()[idAwa] ?? {}) };
  const r = await enVol;
  const apres: BrouillonDAvis = { ...(brouillonsDAvisStore.get()[idAwa] ?? {}) };
  dit('la proposition hors ligne échoue, sans rien inventer', [false, 'hors-ligne'], [r.ok, r.ok ? '' : r.erreur]);
  dit('... le verrou doux est écrit AVANT l’appel, seul', [{}, ['enCours'], true], [avant, Object.keys(pendant), Date.parse(pendant.enCours ?? '') > 0]);
  dit('... après l’échec : le verrou tombe, l’échec est noté (une heure de répit), aucune réponse', [['echoueLe'], true],
    [Object.keys(apres), Date.parse(apres.echoueLe ?? '') > 0]);
}

/* ── 4. LA STRUCTURE : LE MAGASIN, L ÉCRAN, LA FONCTION INTACTE ──────── */
const pur = lis(PUR);
dit('le module pur n importe que des modules purs', ['./avis-google-pur', './ia-anonymise-pur'], [...sansCommentaires(pur).matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]));

const magasin = sansCommentaires(lis(MAGASIN));
dit('le document synchronisé mnd_ia_avis_brouillons, par createStore et bindDocument', [true, true],
  [/createStore<BrouillonsDAvis>\('mnd_ia_avis_brouillons', \{\}\)/.test(magasin), /bindDocument\(brouillonsDAvisStore, 'mnd_ia_avis_brouillons'\)/.test(magasin)]);
dit('la demande passe par la porte : chantier « avis », usage « texte », la consigne, la forme, la relecture', [true, true, true, true],
  [/demandeAClaude<[^>]*>\(\{\s*chantier: 'avis',\s*usage: 'texte',/.test(magasin), /systeme: consigneDeLaReponse\(\)/.test(magasin), /schema: SCHEMA_DE_LA_REPONSE/.test(magasin), /lectureDeLaReponse\(r\.data, avis\)/.test(magasin)]);
dit('le verrou doux se pose dans le document AVANT l appel, et tombe après', [true, true],
  [magasin.indexOf('touche(id, { enCours: maintenant() });') > 0 && magasin.indexOf('touche(id, { enCours: maintenant() });') < magasin.indexOf('await demandeAClaude'),
    /enCours: undefined/.test(magasin)]);
dit('à l ouverture : la série éprouvée plus haut, avec ce qui reste des cinq, la vraie proposition, les demandes de la page, l écran monté', [true, true, true, true, false],
  [/const reste = BROUILLONS_PAR_OUVERTURE - faites\.current;/.test(magasin),
    /prepareUneSerie\(\{[\s\S]*?lis: \(\) => brouillonsDAvisStore\.get\(\),[\s\S]*?propose: proposeUneReponse,[\s\S]*?max: reste,[\s\S]*?dejaDemandes: demandesDeCettePage,[\s\S]*?continuer: \(\) => monte\.current,[\s\S]*?\}\);/.test(magasin),
    /^const demandesDeCettePage = new Set<string>\(\);$/m.test(magasin), /faites\.current \+= faits;/.test(magasin),
    /Promise\.all/.test(magasin)]);
{
  const crochet = magasin.slice(magasin.indexOf('export function usePrepareLesBrouillons'));
  const propose = magasin.slice(magasin.indexOf('export async function proposeUneReponse'), magasin.indexOf('export const changeLeBrouillon'));
  dit('... rien avant que le document soit descendu du serveur (sinon tout serait redemandé, et le verrou écraserait les autres postes) ; rien sans réseau', [true, true, true],
    [/if \(!documentDescendu\(CLE_DES_BROUILLONS\)\) return;/.test(crochet) && crochet.indexOf('if (!documentDescendu(CLE_DES_BROUILLONS)) return;') < crochet.indexOf('prepareUneSerie('),
      /navigator\.onLine === false\) return;/.test(crochet),
      propose.indexOf('if (!documentDescendu(CLE_DES_BROUILLONS))') >= 0 && propose.indexOf('if (!documentDescendu(CLE_DES_BROUILLONS))') < propose.indexOf('touche(id, { enCours')]);
  dit('... une seule série à la fois pour l onglet, libérée quoi qu il arrive', [true, true, true],
    [/if \(!actif \|\| !avis \|\| avis\.length === 0 \|\| serieEnVol\) return;/.test(crochet), /serieEnVol = true;/.test(crochet), /\} finally \{\s*serieEnVol = false;\s*\}/.test(crochet)]);
}
dit('le magasin ne parle jamais à Google ni au réseau lui-même', false, /fetch\(|google|XMLHttpRequest/i.test(magasin));

const composant = sansCommentaires(lis(COMPOSANT));
dit('l écran : gardé par useSaitIaMaison ET peutDemander(rôle, « avis », accès) ; rien sans la porte', [true, true, true],
  [/useSaitIaMaison\(\)/.test(composant), /peutDemander\(staff\?\.role, 'avis', acces\[staff\?\.user_id \?\? ''\]\)/.test(composant), /if \(!peut\) return null;/.test(composant)]);
dit('... les crochets viennent avant le premier retour', true, (() => {
  const corps = composant.slice(composant.indexOf('export function ReponseAUnAvis'));
  const retour = corps.indexOf('if (!peut) return null;');
  const dernierCrochet = Math.max(...[...corps.matchAll(/\buse[A-Z]\w*\(/g)].map((m) => m.index ?? -1));
  return retour > 0 && dernierCrochet < retour;
})());
dit('... l en-tête aussi se tait sans la porte (le relevé ne porte pas les réponses déjà publiées), crochets d abord', [true, true], (() => {
  const corps = composant.slice(composant.indexOf('export function EnTeteDesReponses'), composant.indexOf('const Petit'));
  const retour = corps.indexOf('if (!peut || !avis || avis.length === 0) return null;');
  const dernierCrochet = Math.max(...[...corps.matchAll(/\buse[A-Z]\w*\(/g)].map((m) => m.index ?? -1));
  return [retour > 0, dernierCrochet < retour];
})());
dit('... un avis déjà répondu sur Google avant ce chantier se dit d une touche, sans brouillon', true,
  /const dejaRepondu = <Petit onClick=\{\(\) => marqueCollee\(id\)\}[^>]*>Déjà répondu sur Google<\/Petit>;/.test(composant)
    && (composant.match(/\{dejaRepondu\}/g) ?? []).length === 2);
dit('... seulement sous un avis sans réponse ; le brouillon se retouche ; « N sans réponse » en tête ; les brouillons se préparent à l ouverture', [true, true, true, true],
  [/if \(!estSansReponse\(avis, b\)\)/.test(composant), /onChange=\{\(e\) => changeLeBrouillon\(id, e\.target\.value\)\}/.test(composant), /compteSansReponse\(avis, brouillons\)/.test(composant), /usePrepareLesBrouillons\(avis, peut\)/.test(composant)]);
dit('... « Copier » au presse-papiers, avec le repli par la sélection', [true, true], [/navigator\.clipboard\.writeText\(texte\)/.test(composant), /z\.select\(\);[\s\S]*?document\.execCommand\('copy'\)/.test(composant)]);
dit('... « Ouvrir l’avis sur Google » : un lien qui s ouvre à part, celui du relevé ou de la fiche', [true, true],
  [/href=\{lien\} target="_blank" rel="noreferrer">Ouvrir l’avis sur Google</.test(composant), /const lien = lienDeLAvis\(avis, fiche\);/.test(composant)]);
dit('... « Une autre » redemande à Claude ; « Écarter » ; « J’ai collé la réponse sur Google »', [true, true, true],
  [/\{enCours \? 'Claude écrit…' : 'Une autre'\}/.test(composant) && /proposeUneReponse\(avis\)/.test(composant), /ecarteLeBrouillon\(id\)/.test(composant), /marqueCollee\(id\)/.test(composant)]);
dit('... le mot de Google est dit tel quel', true, /Google exige que la réponse soit publiée par vous : on copie, on colle\./.test(composant));
dit('... les dates se disent avec l année, au jour du poste', [true, true, false],
  [/jourCourtAn\(jourLocalDe\(b\.publieeLe\)\)/.test(composant), /jourCourtAn\(jourLocalDe\(b\.le\)\)/.test(composant), /slice\(0, 10\)/.test(composant)]);
/* 25 octobre 2026 : « Publier sur Google » passe par `publieSurGoogle`
   (shared/avis-google-pont), au toucher ; verifie-le-pont-des-avis l éprouve.
   L écran lui-même n appelle toujours rien. */
dit('AUCUNE PUBLICATION AUTOMATIQUE : l écran n appelle ni fetch, ni fonction, ni Supabase, ni Google lui-même', false,
  /fetch\(|functions\.invoke|supabase|XMLHttpRequest|sendBeacon|window\.open|https?:\/\/[^'"`\s]*google/i.test(composant));
dit('... et le texte affiché ne porte ni tiret cadratin ni « salon »', [false, false], [/—/.test(composant), /\bsalon/i.test(composant)]);

const ecran = sansCommentaires(lis(ECRAN));
/* 20 octobre 2026 (maquette DNVVXdkd…) : les réponses ont quitté « Le site
   public » pour leur onglet, « Les avis Google », qui prépare les brouillons
   à son ouverture et monte la réponse sous chaque avis ouvert. */
/* 26 octobre 2026 : la rubrique « Les avis Google » remplace l'onglet. Les
   nouveaux (30 jours) s'apprêtent à l'ouverture ; les anciens par dix, sur
   demande, un à la fois. */
dit('la rubrique des avis apprête les nouveaux à l ouverture, les anciens par dix, et monte la réponse sous l avis ouvert', [true, true, true],
  [/usePrepareLesBrouillons\(recents\.length > 0 \? recents : null, peutRepondre\)/.test(ecran),
    /<ReponseAUnAvis avis=\{edite \? \{ \.\.\.a, reponse: undefined \} : a\} fiche=\{releve\?\.fiche\} sansRetrait \/>/.test(ecran),
    /for \(let i = 0; i < anciens\.length; i\+\+\) \{\s*const r = await proposeUneReponse\(anciens\[i\]\);/.test(ecran)]);

const fonction = sansCommentaires(lis(FONCTION));
/* 20 octobre 2026 (« répondre dans la langue de l'avis », sélecteur) : le
   relevé garde AUSSI le texte d'origine et sa langue ; `texte` reste la clé
   des avis cochés, intouchée. Il ne connaît toujours rien de Claude. */
dit('la fonction avis-google-releve garde son seul document, rien de Claude, et le texte d origine à côté du texte', [true, true, false, true, true, true],
  [/const VERSION = '2026-10-20-b';/.test(fonction), /upsert\(\{ key: 'mnd_avis_google', data: doc \}\)/.test(fonction), /anthropic|ia-maison|claude|brouillon/i.test(fonction),
    /texte: String\(r\.text\?\.text \?\? r\.originalText\?\.text \?\? ''\)\.trim\(\),/.test(fonction),
    /texteOriginal: String\(r\.originalText\.text\)\.trim\(\)/.test(fonction), /langueOriginale: String\(r\.originalText\.languageCode\)\.trim\(\)/.test(fonction)]);

console.log(ko === 0 ? '\nTOUT VA BIEN : la réponse aux avis tient ses promesses.' : `\n${ko} ÉCHEC(S)`);
if (ko) process.exitCode = 1;
