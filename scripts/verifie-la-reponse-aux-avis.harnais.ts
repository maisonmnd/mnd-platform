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
   La vraie fonction ia-maison n'est jamais appelée. Données d'exemple. */
import { readFileSync } from 'node:fs';
import {
  BROUILLONS_PAR_OUVERTURE, CLE_DES_BROUILLONS, LIEN_DE_LA_FICHE_DEFAUT, PHRASES_MAX, SCHEMA_DE_LA_REPONSE, SIGNATURE_DES_AVIS,
  aUneReponseChezGoogle, compteSansReponse, comptePhrases, consigneDeLaReponse, estSansReponse, idDeLAvis, langueDite, lectureDeLaReponse,
  lienDeLAvis, messagePourLAvis, prenomDeLAuteur, prochainsAFaire, type AvisAvecReponse, type BrouillonsDAvis,
} from '../src/shared/ia-avis-pur';
import { cleDeLAvis } from '../src/shared/avis-google-pur';
import { CHANTIERS_IA, DEPARTEMENTS_PAR_CHANTIER, peutDemander } from '../src/shared/ia-maison-pur';

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
const ECRAN = 'src/apps/trone/routes/clients/VitrineSite.tsx';
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
dit('à l ouverture : cinq par ouverture (ce qui reste), un appel à la fois dans une boucle, jamais deux fois le même identifiant', [true, true, true, true, false],
  [/BROUILLONS_PAR_OUVERTURE - faites\.current/.test(magasin), /prochainsAFaire\(avis, brouillonsDAvisStore\.get\(\), Date\.now\(\), reste\)/.test(magasin),
    /for \(const id of ids\) \{[\s\S]*?const r = await proposeUneReponse\(a\);/.test(magasin), /demandesDeCettePage\.has\(id\)/.test(magasin) && /demandesDeCettePage\.add\(id\)/.test(magasin),
    /Promise\.all/.test(magasin)]);
dit('... un refus de la porte arrête la série', true, /if \(!r\.ok && r\.erreur !== 'lecture' && r\.erreur !== 'claude'\) break;/.test(magasin));
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
dit('... seulement sous un avis sans réponse ; le brouillon se retouche ; « N sans réponse » en tête ; les brouillons se préparent à l ouverture', [true, true, true, true],
  [/if \(!estSansReponse\(avis, b\)\)/.test(composant), /onChange=\{\(e\) => changeLeBrouillon\(id, e\.target\.value\)\}/.test(composant), /compteSansReponse\(avis, brouillons\)/.test(composant), /usePrepareLesBrouillons\(avis, peut\)/.test(composant)]);
dit('... « Copier » au presse-papiers, avec le repli par la sélection', [true, true], [/navigator\.clipboard\.writeText\(texte\)/.test(composant), /z\.select\(\);[\s\S]*?document\.execCommand\('copy'\)/.test(composant)]);
dit('... « Ouvrir l’avis sur Google » : un lien qui s ouvre à part, celui du relevé ou de la fiche', [true, true],
  [/href=\{lien\} target="_blank" rel="noreferrer">Ouvrir l’avis sur Google</.test(composant), /const lien = lienDeLAvis\(avis, fiche\);/.test(composant)]);
dit('... « Une autre » redemande à Claude ; « Écarter » ; « J’ai collé la réponse sur Google »', [true, true, true],
  [/\{enCours \? 'Claude écrit…' : 'Une autre'\}/.test(composant) && /proposeUneReponse\(avis\)/.test(composant), /ecarteLeBrouillon\(id\)/.test(composant), /marqueCollee\(id\)/.test(composant)]);
dit('... le mot de Google est dit tel quel', true, /Google exige que la réponse soit publiée par vous : on copie, on colle\./.test(composant));
dit('AUCUNE PUBLICATION AUTOMATIQUE : l écran n appelle ni fetch, ni fonction, ni Supabase, ni Google ; « Copier » seulement', false,
  /fetch\(|functions\.invoke|supabase|XMLHttpRequest|sendBeacon|window\.open|https?:\/\/[^'"`\s]*google/i.test(composant));
dit('... et le texte affiché ne porte ni tiret cadratin ni « salon »', [false, false], [/—/.test(composant), /\bsalon/i.test(composant)]);

const ecran = sansCommentaires(lis(ECRAN));
dit('l écran des avis (Vitrines › Site public) monte l en-tête et la réponse sous chaque avis, et garde le choix du site', [true, true, true],
  [/<EnTeteDesReponses avis=\{avis\} \/>/.test(ecran), /<ReponseAUnAvis avis=\{a\} fiche=\{fiche\} \/>/.test(ecran), /<ChoixDesAvis avis=/.test(ecran)]);

const fonction = sansCommentaires(lis(FONCTION));
dit('la fonction avis-google-releve est intacte : sa version, son seul document, et rien de Claude', [true, true, false],
  [/const VERSION = '2026-10-10-a';/.test(fonction), /upsert\(\{ key: 'mnd_avis_google', data: doc \}\)/.test(fonction), /anthropic|ia-maison|claude|brouillon/i.test(fonction)]);

console.log(ko === 0 ? '\nTOUT VA BIEN : la réponse aux avis tient ses promesses.' : `\n${ko} ÉCHEC(S)`);
if (ko) process.exitCode = 1;
