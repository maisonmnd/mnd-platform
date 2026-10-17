/* LES POINTS D'ÉTAPE SUR WHATSAPP, ÉPROUVÉS — 17 octobre 2026.

   « Entre deux séances », lot 2. Les modèles Meta sont approuvés :
   `point_apres_seance` (Tout va bien · J'ai un souci) et `point_avant_seance`
   (Un soin · Une coloration · Une coiffure spéciale · Autre chose).

   1. LES RÉPONSES : chaque bouton, chaque ligne de liste se lit, et rien
      d'autre (l'automate garde les codes « MND: »).
   2. LES LIMITES DE META : une liste de dix lignes au plus, des titres de
      vingt-quatre signes, des descriptions de soixante-douze.
   3. CE QU'ELLE REÇOIT : en Santé, l'accusé seul, jamais un conseil écrit ;
      sinon la réponse validée par la direction, ou l'accusé.
   4. QUI REÇOIT : sans Ma Couronne, une fiche vivante, un numéro, et pas
      l'enfant d'un foyer sur le téléphone de sa mère.
   5. LE VRAI CODE DES DEUX FONCTIONS, extrait des fichiers à coller, dit la
      même chose que le Trône ; et les règles d'envoi tiennent (le point
      d'après ne nomme pas sa séance comme rendez-vous, sinon le facteur le
      jetterait ; un identifiant fixe par séance ; une borne par passage). */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { transformSync } from 'esbuild';
import {
  ENVIES_AVANT, SOUCIS, TITRE_COURT, MERCI_BIEN, ACCUSE, ACCUSE_SANTE, MOT_DE_LA_LISTE, BOUTON_DE_LA_LISTE,
  lisLaReponseAuPoint, lignesDeLaListe, payloadApres, payloadAvant, payloadListe, pointsDEtape,
  recoitLePointSurWhatsApp, reponseAuSouciDuPoint, reponseAvant, niveauDe,
} from '../src/shared/entre-deux-pur';
import { TYPE_DIT } from '../src/shared/envois';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu).slice(0, 200)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu).slice(0, 200)}`);
};
const racine = process.cwd();
const lis = (f: string) => readFileSync(path.join(racine, f), 'utf8');
const sansCR = (s: string) => s.split(String.fromCharCode(13)).join('');

/* ── 1. LES RÉPONSES ──────────────────────────────────────────────────── */
dit('les boutons d après séance se lisent', [{ geste: 'bien', apptId: 'a-12' }, { geste: 'souci', apptId: 'a-12' }],
  [lisLaReponseAuPoint(payloadApres('a-12', 'bien')), lisLaReponseAuPoint(payloadApres('a-12', 'souci'))]);
dit('chaque envie d avant séance se lit, dans l ordre du modèle', ENVIES_AVANT.map((e) => ({ geste: 'avant', apptId: 'r9', envie: e.cle })),
  ENVIES_AVANT.map((e) => lisLaReponseAuPoint(payloadAvant('r9', e.cle))));
dit('chaque ligne de la liste se lit', SOUCIS.map((s) => ({ geste: 'liste', apptId: 'r9', cle: s.cle })),
  SOUCIS.map((s) => lisLaReponseAuPoint(payloadListe('r9', s.cle))));
dit('le reste ne se lit pas (code de l automate, souci inconnu, envie inconnue, morceau de trop)', [null, null, null, null, null, null], [
  lisLaReponseAuPoint('MND:3:rituel:2'), lisLaReponseAuPoint('POINT_LISTE:r9:migraine'), lisLaReponseAuPoint('POINT_AVANT:r9:massage'),
  lisLaReponseAuPoint('POINT_BIEN:r9:en-plus'), lisLaReponseAuPoint('REPRISE_OK:r9'), lisLaReponseAuPoint('')]);
dit('aucun code ne commence par MND: (l automate les prendrait)', false,
  [payloadApres('x', 'bien'), payloadApres('x', 'souci'), payloadAvant('x', 'soin'), payloadListe('x', 'seches')].some((c) => c.startsWith('MND:')));

/* ── 2. LES LIMITES DE META ──────────────────────────────────────────── */
const lignes = lignesDeLaListe('appt-0123456789abcdef');
dit('la liste : dix lignes au plus, titres de 24, descriptions de 72, codes de 200', [true, [], [], []],
  [lignes.length <= 10, lignes.filter((l) => [...l.titre].length > 24).map((l) => l.titre), lignes.filter((l) => [...l.description].length > 72).map((l) => l.titre), lignes.filter((l) => l.id.length > 200).map((l) => l.id)]);
dit('le bouton de la liste : 20 signes au plus ; le corps : 1 024', [true, true], [[...BOUTON_DE_LA_LISTE].length <= 20, MOT_DE_LA_LISTE.length <= 1024]);
dit('chaque souci a son titre court', [], SOUCIS.filter((s) => !TITRE_COURT[s.cle]).map((s) => s.cle));

/* ── 3. CE QU'ELLE REÇOIT ────────────────────────────────────────────── */
const valides = { seches: 'Nourrir : quelques gouttes d’huile légère.', gratte: 'NE DOIT JAMAIS PARTIR', cassantes: 'Un foulard en satin la nuit.' };
dit('en Santé, l accusé seul, même si un texte était validé', [[ACCUSE_SANTE], [ACCUSE_SANTE]],
  [reponseAuSouciDuPoint('gratte', valides), reponseAuSouciDuPoint('chute', valides)]);
dit('un conseil validé part tel quel', ['Nourrir : quelques gouttes d’huile légère.'], reponseAuSouciDuPoint('seches', valides));
dit('sans texte validé, l accusé', [ACCUSE], reponseAuSouciDuPoint('odeur', {}));
dit('cassantes : le conseil, puis la proposition d avancer', ['Un foulard en satin la nuit.', 'Si vous le souhaitez, nous pouvons avancer votre prochaine séance : dites-le-nous ici.'],
  reponseAuSouciDuPoint('cassantes', valides));
dit('autre chose : l accusé, puis « dites-nous en quelques mots »', [ACCUSE, 'Dites-nous en quelques mots ce que vous voyez, ici même.'], reponseAuSouciDuPoint('autre', {}));
dit('avant la séance : l envie notée, la date avec l année', 'Merci, Madame Awa ! Nous notons votre envie : une coloration. Nous vous écrivons très vite pour préparer votre séance du mardi 17 novembre 2026.',
  reponseAvant('Madame Awa', 'coloration', 'mardi 17 novembre 2026'));
const tousLesTextes = [MERCI_BIEN, MOT_DE_LA_LISTE, ...SOUCIS.flatMap((s) => reponseAuSouciDuPoint(s.cle, {})), ...ENVIES_AVANT.map((e) => reponseAvant('Ola', e.cle, 'lundi 2 novembre 2026'))];
dit('aucun texte ne dit « salon », ni un tiret cadratin, ni un prix', [], tousLesTextes.filter((t) => /salon|—|\d\s?F\b/i.test(t)));

/* ── 4. QUI REÇOIT ───────────────────────────────────────────────────── */
const fam = [{ id: 'f1', payerClientId: 'mere' }, { id: 'f2' }];
dit('sans compte, vivante, un numéro, qui se paie elle-même : oui ; sinon non', [true, false, false, false, false, true, true], [
  recoitLePointSurWhatsApp({ id: 'a', phone: '0197000012' }, fam),
  recoitLePointSurWhatsApp({ id: 'b', phone: '0197000012', authUserId: 'u1' }, fam),
  recoitLePointSurWhatsApp({ id: 'c', phone: '0197000012', archived: true }, fam),
  recoitLePointSurWhatsApp({ id: 'd', phone: ' ' }, fam),
  recoitLePointSurWhatsApp({ id: 'enfant', phone: '0197000012', familyId: 'f1' }, fam),
  recoitLePointSurWhatsApp({ id: 'mere', phone: '0197000012', familyId: 'f1' }, fam),
  recoitLePointSurWhatsApp({ id: 'e', phone: '0197000012', familyId: 'f2' }, fam),
]);

/* ── 5. LE VRAI CODE DES DEUX FONCTIONS ──────────────────────────────── */
function extrais(f: string, nom: string): string {
  const src = sansCR(lis(f));
  const debut = src.indexOf(`// ── DEBUT ${nom}`);
  const fin = src.indexOf(`// ── FIN ${nom}`);
  if (debut < 0 || fin < debut) throw new Error(`${f} : le bloc ${nom} a disparu`);
  return src.slice(debut, fin);
}
function charge<T>(f: string, nom: string, rend: string): T {
  const js = transformSync(extrais(f, nom), { loader: 'ts', format: 'cjs' }).code;
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return ${rend};`)() as T;
}
type S = { id: string; date: string; status: string; clientId?: string };
const R = 'supabase/functions/rappels-j1/index.ts';
const W = 'supabase/functions/whatsapp-webhook/index.ts';
const serveur = charge<{ pointsDEtape: typeof pointsDEtape; recoitLePointSurWhatsApp: typeof recoitLePointSurWhatsApp }>(R, 'pointsDEtape', '{ pointsDEtape, recoitLePointSurWhatsApp }');
const histoires: S[][] = [
  [{ id: 'h1', date: '2026-10-10', status: 'honoré' }, { id: 'n1', date: '2026-11-20', status: 'confirmé' }],
  [{ id: 'h1', date: '2026-10-10', status: 'honoré' }, { id: 'n1', date: '2026-10-18', status: 'en attente' }],
  [{ id: 'n1', date: '2026-10-24', status: 'confirmé' }],
  [{ id: 'h1', date: '2026-09-01', status: 'honoré' }, { id: 'h2', date: '2026-10-10', status: 'honoré' }, { id: 'x', date: '2026-10-30', status: 'annulé' }],
  [],
];
dit('rappels-j1 : les points d étape comme au Trône', histoires.map((h) => pointsDEtape(h, '2026-10-17')), histoires.map((h) => serveur.pointsDEtape(h, '2026-10-17')));
const fiches = [{ id: 'a', phone: '0197000012' }, { id: 'b', phone: '0197000012', authUserId: 'u' }, { id: 'enfant', phone: '1', familyId: 'f1' }, { id: 'mere', phone: '1', familyId: 'f1' }, { id: 'z' }];
dit('rappels-j1 : qui reçoit, comme au Trône', fiches.map((c) => recoitLePointSurWhatsApp(c, fam)), fiches.map((c) => serveur.recoitLePointSurWhatsApp(c, fam)));

const wa = charge<{
  lisLaReponseAuPoint: typeof lisLaReponseAuPoint; lignesDeLaListe: typeof lignesDeLaListe;
  reponseAuSouciDuPoint: typeof reponseAuSouciDuPoint; reponseAvant: typeof reponseAvant;
  SOUCIS_WA: { cle: string; dit: string; niveau: string; avancer?: boolean }[]; MOT_DE_LA_LISTE: string; BOUTON_DE_LA_LISTE: string; MERCI_BIEN: string;
}>(W, 'pointsDuWebhook', '{ lisLaReponseAuPoint, lignesDeLaListe, reponseAuSouciDuPoint, reponseAvant, SOUCIS_WA, MOT_DE_LA_LISTE, BOUTON_DE_LA_LISTE, MERCI_BIEN }');
const CODES = ['POINT_BIEN:a1', 'POINT_SOUCI:a1', 'POINT_BIEN:a1:x', ...SOUCIS.map((s) => `POINT_LISTE:a1:${s.cle}`), 'POINT_LISTE:a1:zz',
  ...ENVIES_AVANT.map((e) => `POINT_AVANT:a1:${e.cle}`), 'POINT_AVANT:a1:zz', 'MND:3:x', ''];
dit('webhook : chaque code se lit comme au Trône', CODES.map(lisLaReponseAuPoint), CODES.map(wa.lisLaReponseAuPoint));
dit('webhook : les soucis (clé, libellé, niveau, avancer) sont ceux du Trône', SOUCIS.map((s) => [s.cle, s.dit, s.niveau, !!s.avancer]), wa.SOUCIS_WA.map((s) => [s.cle, s.dit, s.niveau, !!s.avancer]));
dit('webhook : la liste est celle du Trône', lignesDeLaListe('a1'), wa.lignesDeLaListe('a1'));
dit('webhook : les réponses aux soucis sont celles du Trône', SOUCIS.map((s) => [reponseAuSouciDuPoint(s.cle, valides), reponseAuSouciDuPoint(s.cle, {})]),
  SOUCIS.map((s) => [wa.reponseAuSouciDuPoint(s.cle, valides), wa.reponseAuSouciDuPoint(s.cle, {})]));
dit('webhook : les réponses d avant séance sont celles du Trône', ENVIES_AVANT.map((e) => reponseAvant('Ola', e.cle, 'lundi 2 novembre 2026')), ENVIES_AVANT.map((e) => wa.reponseAvant('Ola', e.cle, 'lundi 2 novembre 2026')));
dit('webhook : les mots fixes sont ceux du Trône', [MOT_DE_LA_LISTE, BOUTON_DE_LA_LISTE, MERCI_BIEN], [wa.MOT_DE_LA_LISTE, wa.BOUTON_DE_LA_LISTE, wa.MERCI_BIEN]);
dit('webhook : la niveau Santé ne s écrit pas ailleurs', ['sante', 'sante'], [niveauDe(['gratte']), niveauDe(['chute'])]);

/* Les règles d'envoi, dans le texte de rappels-j1. */
const rj = sansCR(lis(R));
const blocDesPoints = rj.slice(rj.indexOf('async function poseLesPointsDEtape('), rj.indexOf('Deno.serve('));
const payloadsEnvoyes = [...blocDesPoints.matchAll(/payload: `(POINT_[A-Z]+):\$\{a\.id\}(?::([a-z]+))?`/g)].map((m) => m[2] ? `${m[1]}:a1:${m[2]}` : `${m[1]}:a1`);
dit('rappels-j1 : chaque bouton envoyé se relit au webhook, dans l ordre du modèle', ['POINT_BIEN:a1', 'POINT_SOUCI:a1', ...ENVIES_AVANT.map((e) => `POINT_AVANT:a1:${e.cle}`)], payloadsEnvoyes);
dit('... et aucun n est refusé par la lecture', [], payloadsEnvoyes.filter((c) => !lisLaReponseAuPoint(c)));
dit('rappels-j1 : le point d après ne nomme pas sa séance comme rendez-vous (le facteur le jetterait)', true,
  /const rdvDuPoint = p\.type === 'avant' \? \{ apptId: a\.id, heure: a\.time \} : \{ apptId: '' \};/.test(blocDesPoints) && (blocDesPoints.match(/\.\.\.rdvDuPoint/g) ?? []).length === 2);
dit('rappels-j1 : un identifiant fixe par séance et par point, une borne par passage', [true, true],
  [/const idDe = \(p: APoser\) => `pe-\$\{p\.seance\.id\}-\$\{p\.type\}-whatsapp`;/.test(blocDesPoints), /if \(parties >= BORNE_DES_POINTS\) \{ bornee = true; break; \}/.test(blocDesPoints)]);
dit('rappels-j1 : chaque modèle a son secret, et rien ne part sans', true,
  /WA_TEMPLATE_POINT_APRES/.test(blocDesPoints) && /WA_TEMPLATE_POINT_AVANT/.test(blocDesPoints) && /if \(\(!APRES && !AVANT\) \|\| !WA_TOKEN \|\| !WA_PHONE_ID\) return \{ points: 'sans-modele' \};/.test(blocDesPoints));
dit('rappels-j1 : la date qui juge est celle de la séance, à plus ou moins sept jours', true,
  /\.eq\('data->>date', jourPlus\(aujourdhui, -JOURS_APRES\)\)\.eq\('data->>status', 'honoré'\)/.test(blocDesPoints) && /\.eq\('data->>date', jourPlus\(aujourdhui, JOURS_AVANT\)\)/.test(blocDesPoints) && !/updated_at/.test(blocDesPoints));

/* Les règles de lecture, dans le texte du webhook. */
const wh = sansCR(lis(W));
const brancheDesPoints = wh.slice(wh.indexOf('⑤ bis·3 LES POINTS'), wh.indexOf('⑤ ter LE FORMULAIRE'));
dit('webhook : seul son numéro répond pour elle (forme courte cleWa)', true, /fiche\.numeros\.some\(\(n\) => cleWa\(n\) === cleWa\(e\.numero\)\)/.test(brancheDesPoints));
dit('webhook : le signalement entre par WhatsApp, rattaché à son point, ouvert sauf « tout va bien »', true,
  /canal: 'whatsapp'/.test(brancheDesPoints) && /point: `pe-\$\{ligne\.id\}-apres`/.test(brancheDesPoints) && /etat: bien \? 'traite' : 'ouvert'/.test(brancheDesPoints));
dit('webhook : un message rejoué n écrit pas deux signalements (identifiant du message)', true,
  /const idSig = `sig-wa-\$\{cleCourte\(e\.waId\)\}`;/.test(brancheDesPoints) && /ignoreDuplicates: true/.test(brancheDesPoints) && /if \(!estNeuf\(e\)\) continue;/.test(brancheDesPoints));
dit('webhook : la liste ne porte aucun code de l automate', false, /MND:/.test(extrais(W, 'pointsDuWebhook')));
const autos = ['point-bien', 'point-souci', 'point-recu', 'point-avant'];
dit('les réponses automatiques sont déclarées des deux côtés (webhook, Conversations)', [true, true],
  [autos.every((a) => wh.includes(`'${a}'`)), autos.every((a) => sansCR(lis('src/shared/conversations.ts')).includes(`'${a}'`))]);
dit('le journal des envois les nomme', [true, true], ['point-apres' in TYPE_DIT, 'point-avant' in TYPE_DIT]);
dit('« nous vous écrivons » laisse l alarme des Conversations allumée (envie, souci choisi)', true,
  /x\.auto === 'automate' \|\| x\.auto === 'point-avant' \|\| x\.auto === 'point-recu'\)\)\) \?\? dernier;/.test(sansCR(lis('src/shared/conversations.ts'))));

console.log(ko === 0 ? '\nLes points d etape tiennent leurs regles.' : `\n${ko} controle(s) en echec.`);
process.exitCode = ko === 0 ? 0 : 1;
